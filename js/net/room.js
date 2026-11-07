// Salon multijoueur : code à 6 caractères, liste des joueurs, choix du circuit, départ commun, résultats.
//
// Rôles réseau (voir aussi signaling.js et transport.js) :
//   Supabase Realtime : annuaire des joueurs (présence) et échange des offres WebRTC, rien d'autre ;
//   WebRTC (canal « ctl », fiable)  : prêt, circuit choisi, départ, arrivée, ping ;
//   WebRTC (canal « state », rapide): la position de chaque voiture, 20 fois par seconde.
// Le salon n'a ni serveur de jeu ni hôte autoritaire : l'« hôte » (le créateur, ou à défaut l'identifiant le plus petit)
// ne fait que choisir le circuit et donner le départ. Chacun pilote sa voiture et en est seul juge.
//
// Deux modes, au choix de l'hôte :
//   LIBRE      : chacun court à son rythme sur le même circuit, recommence quand il veut (R) ; le tableau garde le meilleur temps de chacun ;
//   CHAMPIONNAT (« manche ») : plusieurs circuits à la suite (championship.js), départ commun sur une grille, points par place, classement général.
//     L'hôte ne fait que donner les départs et clore chaque manche ; son rôle passe à l'identifiant le plus petit s'il part (l'état du championnat est
//     copié chez tous les joueurs). Messages fiables : cup (le championnat) · round (départ de la manche n) · finish{rn} (mon temps) · rend (manche close,
//     temps de tous) · cupstop (l'hôte arrête). Une manche se clôt quand tous ont fini ou quitté, FINISH_GRACE_MS après la première arrivée, ou au plafond.
import { Emitter, SupabaseSignaling, LocalSignaling } from './signaling.js';
import { PeerMesh } from './transport.js';
import { packSnapshot, unpackSnapshot } from './snapshot.js';
import { Championship, MAX_ROUNDS } from './championship.js';
import { PHYS_VER, NET_VER } from '../version.js';
import { MAX_RUN_STEPS, MAX_TRACK_CODE_CHARS } from '../constants.js';

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     // sans 0 / O / 1 / I : pas de confusion à la dictée
export const MAX_PLAYERS = 8;
const START_DELAY_MS = 4000;                                // entre « Lancer » et « GO »
const CODE_CHUNK = 12000;                                          // un message fiable ne dépasse pas ~12 Ko (compatibilité entre navigateurs)
const MAX_PACKETS_PER_SEC = 80;                                    // au-delà, un joueur inonde : on ignore l'excédent
export const FINISH_GRACE_MS = 30000;                              // championnat : temps laissé aux autres après la première arrivée
export const MAX_ROUND_MS = 600000;                                // championnat : une manche ne dure jamais plus de 10 minutes
export const RESULTS_MS = 12000;                                   // championnat : affichage des résultats avant la manche suivante

export const ROOM_RE = /^[A-HJ-NP-Z2-9]{6}$/;
export function normalizeCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
export function newRoomCode(random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const r = random(6);
  return Array.from(r, (b) => ROOM_CHARS[b % ROOM_CHARS.length]).join('');
}
const newPeerId = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

export class RoomError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

export class Room extends Emitter {
  constructor({ code, name, selfId = newPeerId(), makeSignaling, makeMesh = null, getIce = null, now = () => performance.now() }) {
    super();
    this.code = code; this.selfId = selfId; this.now = now;
    this.makeSignaling = makeSignaling; this.makeMesh = makeMesh; this.getIce = getIce;
    this.meta = { name: String(name).slice(0, 20), host: false, ready: false, racing: false, v: PHYS_VER, net: NET_VER, t: Date.now() };
    this.members = new Map();           // id → { id, name, host, ready, racing, v, t, link, rtt }
    this.track = null;                  // circuit choisi : { id, name, sig } ; id = 'b-…' (intégré), 'c:<uuid>' (communauté), 'u:<signature>' (code envoyé par l'hôte)
    this.started = false;               // une course a déjà été lancée dans cette salle : les arrivants y entrent directement
    this.trackCodes = new Map();        // id 'u:…' → code du circuit reçu de l'hôte
    this._asm = new Map();              // assemblage des morceaux de code en cours
    this.state = 'lobby';               // lobby | racing (propre à chaque joueur : la boucle de jeu est asynchrone)
    this.results = new Map();           // id → { best, last, n } : meilleur temps, dernier temps, nombre d'essais (en pas de 1/120 s)
    this.seq = 0;
    this.buffers = new Map();           // id → SnapshotBuffer (rempli par setBufferFactory : la voiture distante)
    this.bufferFactory = null;
    this._rate = new Map();
    this.cup = null;                    // championnat en cours ou terminé (Championship) ; null en mode libre
    this.cupState = null;               // manche en cours : { phase: 'racing' | 'results' | 'done', n, roster, finishes, t0, firstAt, until }
    this.closed = false;
  }

  // ---- Ouverture -----------------------------------------------------------------------------------------------------
  static async create(opts) {
    for (let i = 0; i < 4; i++) {
      const room = new Room({ ...opts, code: opts.code || newRoomCode() });
      room.meta.host = true;
      try { await room._open(); }
      catch (e) { room._dispose(); if (e.code === 'taken' && !opts.code) continue; throw e; }
      return room;
    }
    throw new RoomError('Impossible de créer une salle : réessaie.', 'taken');
  }

  static async join(code, opts) {
    const c = normalizeCode(code);
    if (!ROOM_RE.test(c)) throw new RoomError('Code invalide : 6 caractères (lettres et chiffres, sans 0, O, 1, I).', 'bad-code');
    const room = new Room({ ...opts, code: c });
    try { await room._open(); } catch (e) { room._dispose(); throw e; }
    return room;
  }

  async _open() {
    const sig = this.signaling = this.makeSignaling({ code: this.code, selfId: this.selfId });
    // Serveurs ICE (STUN + relais TURN à identifiants à durée limitée) : demandés au serveur, sans jamais bloquer l'ouverture de la salle plus de 2,5 s.
    let iceServers;
    if (this.getIce) {
      try { iceServers = await Promise.race([this.getIce(), new Promise((r) => setTimeout(() => r(undefined), 2500))]) || undefined; } catch { iceServers = undefined; }
    }
    this.mesh = (this.makeMesh || ((o) => new PeerMesh(o)))({
      selfId: this.selfId, signaling: sig, ...(iceServers ? { iceServers } : {}),
      handlers: { onMessage: (id, kind, data) => this._onMessage(id, kind, data), onLink: (id, st) => this._onLink(id, st) },
    });
    sig.on('join', (id, meta) => this._onPeer(id, meta));
    sig.on('meta', (id, meta) => this._onPeer(id, meta));
    sig.on('leave', (id) => this._onLeave(id));
    sig.on('closed', (why) => { if (!this.closed) { this.emit('error', new RoomError(why || 'Connexion perdue.', 'closed')); this._dispose(); this.emit('closed'); } });
    try { await sig.join(this.meta); }
    catch (e) { throw new RoomError(e.message || 'Connexion au serveur de salons impossible.', 'network'); }

    // Un invité qui arrive laisse un court instant à la liste des présents pour se remplir (réseau lent).
    if (!this.meta.host) for (let i = 0; i < 15 && ![...sig.peers.values()].some((m) => m.host); i++) await new Promise((r) => setTimeout(r, 100));
    const present = [...sig.peers.entries()];
    const host = present.find(([, m]) => m.host);
    if (this.meta.host) {
      if (host) throw new RoomError('Ce code est déjà utilisé.', 'taken');
    } else {
      if (!host) throw new RoomError('Salle introuvable. Vérifie le code.', 'not-found');
      if (present.length + 1 > MAX_PLAYERS) throw new RoomError(`Salle pleine (${MAX_PLAYERS} joueurs).`, 'full');
      if (host[1].v !== PHYS_VER || host[1].net !== NET_VER) throw new RoomError('Version du jeu différente de celle de l\'hôte : recharge la page.', 'version');
    }
    for (const [id, meta] of present) this._onPeer(id, meta);
    this._pingTimer = setInterval(() => this._pingAll(), 2000);
    this._cupTimer = setInterval(() => this._cupTick(), 400);
    this.emit('members');
  }

  _dispose() {
    this.closed = true;
    clearInterval(this._pingTimer); clearInterval(this._cupTimer);
    try { this.mesh && this.mesh.closeAll(); } catch { /* déjà fermé */ }
    try { this.signaling && this.signaling.leave(); } catch { /* déjà fermé */ }
  }

  leave() {
    if (this.closed) return;
    this._dispose();
    this.emit('closed');
  }

  // ---- Membres -------------------------------------------------------------------------------------------------------
  get trackId() { return this.track ? this.track.id : null; }

  get hostId() {
    const flagged = [...this.members.values()].filter((m) => m.host);
    if (this.meta.host) flagged.push({ id: this.selfId });
    if (flagged.length) return flagged.map((m) => m.id).sort()[0];
    return [this.selfId, ...this.members.keys()].sort()[0];        // l'hôte est parti : l'identifiant le plus petit prend la suite
  }
  get isHost() { return this.hostId === this.selfId; }
  get list() { return [{ id: this.selfId, ...this.meta, self: true, link: 'self', rtt: 0 }, ...this.members.values()]; }

  _onPeer(id, meta) {
    if (id === this.selfId || !meta) return;
    const prev = this.members.get(id);
    const m = { id, name: String(meta.name || '?').slice(0, 20), host: !!meta.host, ready: !!meta.ready, racing: !!meta.racing, v: meta.v, net: meta.net, t: meta.t || 0, link: prev ? prev.link : 'connecting', rtt: prev ? prev.rtt : 0 };
    this.members.set(id, m);
    if (m.v === PHYS_VER && m.net === NET_VER && !this.closed) this.mesh.addPeer(id);     // un joueur d'une autre version ne peut pas courir avec nous
    else m.link = 'incompatible';
    this.emit('members');
  }

  _onLeave(id) {
    this.members.delete(id);
    this.mesh.removePeer(id);
    this.buffers.delete(id);
    this.emit('members');
    this.emit('left', id);
    this._cupTick();                 // un joueur qui part ne doit pas bloquer la manche (ni, si c'était l'hôte, la rendre orpheline)
  }

  _onLink(id, status) {
    const m = this.members.get(id);
    if (m) m.link = status;
    // L'hôte informe un nouvel arrivant du circuit choisi.
    if (status === 'open') {
      if (this.isHost && this.cup && !this.cup.finished) this._sendCup(id);       // en championnat, un arrivant reçoit le championnat, pas le circuit seul
      else if (this.isHost && this.track) this._sendTrack(id);
      const mine = this.results.get(this.selfId);
      if (mine) this.mesh.sendCtl({ k: 'finish', steps: mine.best, sync: true }, id);   // le nouvel arrivant voit mon meilleur temps
    }
    this.emit('members');
  }

  setReady(ready) { this.meta.ready = !!ready; this.signaling.track(this.meta); this.emit('members'); }

  // ---- Messages fiables ----------------------------------------------------------------------------------------------
  _onMessage(from, kind, data) {
    if (kind === 'state') return this._onState(from, data);
    const m = this.members.get(from);
    switch (data.k) {
      case 'ping': this.mesh.sendCtl({ k: 'pong', id: data.id }, from); break;
      case 'pong': {
        const rtt = this.now() - (this._pings && this._pings.get(from + ':' + data.id));
        if (m && Number.isFinite(rtt) && rtt >= 0) m.rtt = m.rtt ? Math.min(m.rtt * 0.7 + rtt * 0.3, rtt * 3) : rtt;
        break;
      }
      case 'track': {
        if (from !== this.hostId || typeof data.id !== 'string') break;
        this.track = { id: data.id.slice(0, 60), name: String(data.name || '').slice(0, 40), sig: String(data.sig || '').slice(0, 40) };
        this.emit('track');
        // Course déjà lancée dans la salle : un arrivant part tout de suite, à son rythme (rien à synchroniser).
        if (data.started && this.state === 'lobby' && !this.cup) { this.started = true; this._begin(this.track.id, 1500); }
        break;
      }
      case 'tcode': this._onCodeChunk(from, data); break;
      case 'start':
        // Un nouveau « Lancer » de l'hôte (même circuit ou autre) remet chacun au départ de ce circuit, à son rythme.
        if (from !== this.hostId) break;
        if (typeof data.trackId === 'string') this.track = { id: data.trackId.slice(0, 60), name: String(data.name || (this.track && this.track.name) || '').slice(0, 40), sig: String(data.sig || '').slice(0, 40) };
        this._begin(String(data.trackId || '').slice(0, 60), Math.max(500, Math.min(15000, +data.startIn || START_DELAY_MS)) - (m ? m.rtt / 2 : 0));
        break;
      case 'cup': this._onCup(from, data); break;
      case 'round': this._onRound(from, data); break;
      case 'rend': if (from === this.hostId) this._onRoundEnd(data.n | 0, data.times && typeof data.times === 'object' ? data.times : {}, +data.nextIn || 0); break;
      case 'cupstop': if (from === this.hostId) this._cupStopped(); break;
      case 'finish': {
        if (data.rn !== undefined) { this._onCupFinish(from, data); break; }
        if (this.cup && !this.cup.finished) break;                 // en championnat, seuls les temps de la manche comptent
        const steps = +data.steps | 0;
        if (!m || !(steps > 0 && steps <= MAX_RUN_STEPS)) break;
        const r = this.results.get(from) || { best: steps, last: steps, n: 0 };
        r.best = Math.min(r.best, steps);
        if (!data.sync) { r.last = steps; r.n++; }
        this.results.set(from, r);
        this.emit('results');
        break;
      }
      default: break;
    }
  }

  _pingAll() {
    this._pings = this._pings || new Map();
    const id = Math.random().toString(36).slice(2, 8);
    for (const m of this.members.values()) if (m.link === 'open') this._pings.set(m.id + ':' + id, this.now());
    this.mesh.sendCtl({ k: 'ping', id });
    if (this._pings.size > 64) this._pings.clear();
  }

  // ---- Choix du circuit, départ, retour au salon (hôte) --------------------------------------------------------------
  // spec : { id, name, sig, code? } ; code : seulement pour les circuits 'u:…' (envoyé à chaque joueur par morceaux).
  selectTrack(spec) {
    if (!this.isHost || !spec || typeof spec.id !== 'string') return;
    if (spec.code && spec.code.length > MAX_TRACK_CODE_CHARS) throw new RoomError('Circuit trop gros pour être envoyé.', 'too-big');
    this.track = { id: spec.id, name: spec.name || '', sig: spec.sig || '' };
    if (spec.code) this.trackCodes.set(spec.id, spec.code);
    this._sendTrack();
    this.emit('track');
  }

  _sendTrack(to = null) {
    const t = this.track;
    this.mesh.sendCtl({ k: 'track', id: t.id, name: t.name, sig: t.sig, started: this.started }, to);
    const code = this.trackCodes.get(t.id);
    if (code && t.id.startsWith('u:')) {
      const n = Math.ceil(code.length / CODE_CHUNK);
      for (let i = 0; i < n; i++) this.mesh.sendCtl({ k: 'tcode', id: t.id, i, n, d: code.slice(i * CODE_CHUNK, (i + 1) * CODE_CHUNK) }, to);
    }
  }

  _onCodeChunk(from, d) {
    if (from !== this.hostId || typeof d.id !== 'string' || !d.id.startsWith('u:') || typeof d.d !== 'string') return;
    const n = d.n | 0, i = d.i | 0;
    if (n < 1 || n > Math.ceil(MAX_TRACK_CODE_CHARS / CODE_CHUNK) || i < 0 || i >= n || d.d.length > CODE_CHUNK) return;
    let a = this._asm.get(d.id);
    if (!a || a.n !== n) { a = { n, parts: new Array(n).fill(null), got: 0 }; this._asm.set(d.id, a); }
    if (a.parts[i] === null) { a.parts[i] = d.d; a.got++; }
    if (a.got === n) {
      this._asm.delete(d.id);
      this.trackCodes.set(d.id, a.parts.join(''));
      this.emit('trackcode', d.id);
    }
  }

  // Le code d'un circuit 'u:…' (attend qu'il soit arrivé, au plus ms millisecondes).
  waitForCode(id, ms = 12000) {
    if (this.trackCodes.has(id)) return Promise.resolve(this.trackCodes.get(id));
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.off('trackcode', on); reject(new RoomError('Le circuit n\'est pas arrivé : réessaie.', 'no-code')); }, ms);
      const on = (got) => { if (got === id) { clearTimeout(t); this.off('trackcode', on); resolve(this.trackCodes.get(id)); } };
      this.on('trackcode', on);
    });
  }

  start() {
    if (!this.isHost || !this.track) return false;
    if (this.cup) this.stopCup();       // un départ libre met fin au championnat
    this.mesh.sendCtl({ k: 'start', trackId: this.track.id, name: this.track.name, sig: this.track.sig, startIn: START_DELAY_MS });
    this._begin(this.track.id, START_DELAY_MS);
    return true;
  }

  _begin(trackId, inMs) {
    this.state = 'racing';
    this.started = true;
    this.results.clear();                // un nouveau circuit : on repart de zéro (les temps d'avant ne se comparent pas)
    this.meta.racing = true; this.meta.ready = false; this.signaling.track(this.meta);
    this.emit('start', { trackId, track: this.track, startLocal: this.now() + inMs });
  }

  // Retour au salon : propre à ce joueur seulement (les autres continuent de courir, chacun à son rythme).
  backToLobby() {
    this.state = 'lobby';
    this.meta.racing = false; this.meta.ready = false; this.signaling.track(this.meta);
    this.emit('lobby');
    this.emit('members');
  }

  // ---- Course --------------------------------------------------------------------------------------------------------
  // s : { steps, pos, quat, vel, vehicle, flags, tele, cp, lap } de la voiture locale ; envoyé à tous, canal rapide.
  sendSnapshot(s) { this.mesh.broadcastState(packSnapshot({ ...s, seq: this.seq++ })); }

  // Une arrivée (à chaque essai) : annoncée à tous ; chacun garde le meilleur temps de chaque joueur.
  reportFinish(steps) {
    const st = this.cupState;
    if (this.cup && st && st.phase === 'racing') {                    // championnat : un seul temps par manche, annoncé avec son numéro
      if (!st.roster.includes(this.selfId) || st.finishes.has(this.selfId)) return false;
      this._noteFinish(this.selfId, steps);
      this.mesh.sendCtl({ k: 'finish', steps, rn: st.n });
      this.emit('live'); this._cupTick();
      return true;
    }
    const r = this.results.get(this.selfId) || { best: steps, last: steps, n: 0 };
    r.best = Math.min(r.best, steps); r.last = steps; r.n++;
    this.results.set(this.selfId, r);
    this.mesh.sendCtl({ k: 'finish', steps });
    this.emit('results');
    return r.best === steps;      // vrai : nouveau meilleur temps personnel dans cette salle
  }

  // ---- Championnat (manches) -----------------------------------------------------------------------------------------
  // Joueurs qui partent sur la grille : moi et ceux dont la liaison est ouverte (les autres rejoindront à la manche suivante).
  cupRoster() {
    return this.list.filter((m) => m.self || m.link === 'open').map((m) => m.id);
  }

  get cupActive() { return !!(this.cup && !this.cup.finished); }

  // L'hôte lance un championnat. rounds : [{ id, name, sig }] (circuits intégrés 'b-…' ou de la communauté 'c:…', chargés par chacun) ; collisions : voitures qui se poussent.
  startCup({ rounds, collisions = true }) {
    if (!this.isHost || !Array.isArray(rounds) || !rounds.length || rounds.length > MAX_ROUNDS) return false;
    if (!rounds.every((r) => r && typeof r.id === 'string' && /^(b-|c:)/.test(r.id))) return false;
    this.cup = new Championship({ id: Math.random().toString(36).slice(2, 8), rounds, collisions });
    this.cupState = null;
    this.started = true;
    for (const m of this.list) this.cup.setName(m.id, m.name);
    this.mesh.sendCtl({ k: 'cup', cup: this.cup.toJSON() });
    this.emit('cup');
    this._hostBeginRound(0);
    return true;
  }

  // L'hôte arrête le championnat : tout le monde retrouve le salon.
  stopCup() {
    if (!this.cup || !this.isHost) return false;
    this.mesh.sendCtl({ k: 'cupstop' });
    this._cupStopped();
    return true;
  }

  _cupStopped() {
    this.cup = null; this.cupState = null;
    this.emit('cupstop');
    this.emit('members');
  }

  // Ordre de la grille : le classement général (le meilleur devant) ; à la première manche, l'ordre d'arrivée dans la salle (l'hôte devant).
  _gridOrder(ids) {
    const rank = new Map(this.cup.played ? this.cup.standings().map((r, i) => [r.id, i]) : []);
    const at = (id) => (this.members.get(id) || this.meta).t || 0;
    return [...ids].sort((a, b) => (rank.has(a) ? rank.get(a) : 99) - (rank.has(b) ? rank.get(b) : 99) || at(a) - at(b) || (a < b ? -1 : 1));
  }

  _hostBeginRound(n) {
    const cup = this.cup;
    const roster = this._gridOrder(this.cupRoster());
    const names = {};
    for (const id of roster) names[id] = id === this.selfId ? this.meta.name : (this.members.get(id) || {}).name || '?';
    this.mesh.sendCtl({ k: 'round', n, roster, names, startIn: START_DELAY_MS, prev: n > 0 ? cup.results[n - 1] || null : null });
    this._beginRound(n, roster, names, START_DELAY_MS);
  }

  _beginRound(n, roster, names, inMs) {
    const cup = this.cup;
    for (const [id, nm] of Object.entries(names || {})) cup.setName(id, nm);
    const track = cup.rounds[n];
    this.track = { ...track };
    this.cupState = { phase: 'racing', n, roster, finishes: new Map(), t0: this.now() + inMs, firstAt: null, until: 0 };
    this.started = true;
    const slot = roster.indexOf(this.selfId);
    if (slot < 0) { this.emit('cupwait', { n, total: cup.total }); this.emit('members'); return; }         // arrivé trop tard pour cette manche : il part à la suivante
    this.state = 'racing';
    this.meta.racing = true; this.meta.ready = false; this.signaling.track(this.meta);
    this.emit('start', {
      trackId: track.id, track: this.track, startLocal: this.now() + inMs,
      cup: { n, total: cup.total, slot, count: roster.length, roster, collisions: cup.collisions },
    });
  }

  _sendCup(to) {
    const st = this.cupState, now = this.now();
    const state = st ? { phase: st.phase, n: st.n, roster: st.roster, nextIn: st.until ? Math.max(0, st.until - now) : 0 } : null;
    this.mesh.sendCtl({ k: 'cup', cup: this.cup.toJSON(), state }, to);
  }

  _onCup(from, d) {
    if (from !== this.hostId || !d.cup || typeof d.cup !== 'object') return;
    const rounds = Array.isArray(d.cup.rounds) ? d.cup.rounds : [];
    if (!rounds.length || rounds.length > MAX_ROUNDS || !rounds.every((r) => r && typeof r.id === 'string' && /^(b-|c:)/.test(r.id))) return;
    this.cup = Championship.from(d.cup);
    this.started = true;
    const s = d.state;
    // Un arrivant en cours de route : il suit la manche (sans y participer) puis part à la suivante.
    if (s && ['racing', 'results'].includes(s.phase) && Array.isArray(s.roster)) {
      this.cupState = { phase: s.phase, n: s.n | 0, roster: s.roster.filter((x) => typeof x === 'string').slice(0, MAX_PLAYERS), finishes: new Map(), t0: this.now(), firstAt: null, until: s.phase === 'results' ? this.now() + Math.max(0, +s.nextIn || 0) : 0 };
    } else this.cupState = null;
    this.emit('cup');
    this.emit('members');
  }

  _onRound(from, d) {
    const cup = this.cup;
    if (from !== this.hostId || !cup) return;
    const n = d.n | 0;
    // Un résultat manqué (liaison coupée un instant) est rattrapé avec celui que l'hôte joint au départ suivant.
    if (n > cup.played && d.prev && typeof d.prev === 'object' && (d.prev.n | 0) === cup.played) {
      cup.scoreRound(d.prev.n | 0, d.prev.times || {}, Array.isArray(d.prev.order) ? d.prev.order : Object.keys(d.prev.times || {}));
    }
    if (n !== cup.played || n >= cup.total || !Array.isArray(d.roster)) return;
    const roster = d.roster.filter((x) => typeof x === 'string').slice(0, MAX_PLAYERS);
    const m = this.members.get(from);
    this._beginRound(n, roster, d.names && typeof d.names === 'object' ? d.names : {}, Math.max(500, Math.min(15000, +d.startIn || START_DELAY_MS)) - (m ? m.rtt / 2 : 0));
  }

  _noteFinish(id, steps) {
    const st = this.cupState;
    st.finishes.set(id, steps);
    if (st.firstAt == null) st.firstAt = this.now();
  }

  _onCupFinish(from, d) {
    const st = this.cupState;
    const steps = +d.steps | 0;
    if (!this.cup || !st || st.phase !== 'racing' || (d.rn | 0) !== st.n || !st.roster.includes(from) || st.finishes.has(from) || !(steps > 0 && steps <= MAX_RUN_STEPS)) return;
    this._noteFinish(from, steps);
    this.emit('live');
    this._cupTick();
  }

  // Horloge du championnat (toutes les 400 ms, et à chaque arrivée / départ) : seul l'hôte décide de clore une manche et d'en lancer une autre.
  _cupTick() {
    const st = this.cupState, cup = this.cup;
    if (!cup || !st || this.closed || !this.isHost) return;
    const now = this.now();
    if (st.phase === 'racing') {
      const present = (id) => id === this.selfId || this.members.has(id);
      const waiting = st.roster.filter((id) => !st.finishes.has(id) && present(id));
      if (!waiting.length || (st.firstAt != null && now - st.firstAt > FINISH_GRACE_MS) || now - st.t0 > MAX_ROUND_MS) this._hostEndRound();
    } else if (st.phase === 'results' && st.until && now >= st.until && !cup.finished) this._hostBeginRound(cup.played);
  }

  _hostEndRound() {
    const st = this.cupState, cup = this.cup;
    const times = {};
    for (const id of st.roster) times[id] = st.finishes.has(id) ? st.finishes.get(id) : null;
    const nextIn = cup.played + 1 >= cup.total ? 0 : RESULTS_MS;
    this.mesh.sendCtl({ k: 'rend', n: st.n, times, nextIn });
    this._onRoundEnd(st.n, times, nextIn);
  }

  _onRoundEnd(n, times, nextIn) {
    const st = this.cupState, cup = this.cup;
    if (!cup || !st || st.phase !== 'racing' || st.n !== n) return;
    const clean = {};
    for (const id of st.roster) { const v = +times[id]; clean[id] = v > 0 && v <= MAX_RUN_STEPS ? v | 0 : null; }
    const result = cup.scoreRound(n, clean, st.roster);
    if (!result) return;
    st.phase = cup.finished ? 'done' : 'results';
    st.until = cup.finished ? 0 : this.now() + (nextIn || RESULTS_MS);
    this.emit('cupround', { n, result, standings: cup.standings(), final: cup.finished, nextIn: st.until ? st.until - this.now() : 0 });
    this.emit('members');
  }

  // Classement en direct de la manche : [{ id, name, finished (pas | null), prog (0 à 1), self }] ; l'avancement des autres vient de leurs paquets (progOf).
  liveEntries(progOf = () => 0) {
    const st = this.cupState;
    if (!this.cup || !st) return [];
    return st.roster.map((id) => ({
      id, name: this.cup.names.get(id) || '?', self: id === this.selfId,
      finished: st.finishes.has(id) ? st.finishes.get(id) : null, prog: progOf(id),
      gone: id !== this.selfId && !this.members.has(id),
    }));
  }

  // Classement par meilleur temps, puis ceux qui n'ont pas encore fini. Provisoire : chaque temps est annoncé par son joueur.
  ranking() {
    const rows = this.list.map((m) => { const r = this.results.get(m.id); return { id: m.id, name: m.name, self: !!m.self, best: r ? r.best : null, last: r ? r.last : null, n: r ? r.n : 0 }; });
    return rows.sort((a, b) => (a.best == null) - (b.best == null) || (a.best ?? 0) - (b.best ?? 0));
  }

  _onState(from, data) {
    const now = this.now();
    // Anti-inondation : un joueur ne peut pas nous faire traiter plus de MAX_PACKETS_PER_SEC paquets par seconde.
    let r = this._rate.get(from);
    if (!r || now - r.t0 > 1000) { r = { t0: now, n: 0 }; this._rate.set(from, r); }
    if (++r.n > MAX_PACKETS_PER_SEC) return;
    const snap = unpackSnapshot(data);
    if (!snap) return;
    this.emit('snapshot', from, snap, now);
  }
}

// Fabrique de signalisation : Supabase Realtime, ou deux onglets du même navigateur avec ?net=local (essais sans serveur).
export function defaultSignaling({ code, selfId, observe = false }, getToken) {
  const local = typeof location !== 'undefined' && new URLSearchParams(location.search).get('net') === 'local';
  return local ? new LocalSignaling({ code, selfId }) : new SupabaseSignaling({ code, selfId, getToken, observe });
}
