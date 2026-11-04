// Salon multijoueur : code à 6 caractères, liste des joueurs, choix du circuit, départ commun, résultats.
//
// Rôles réseau (voir aussi signaling.js et transport.js) :
//   Supabase Realtime : annuaire des joueurs (présence) et échange des offres WebRTC, rien d'autre ;
//   WebRTC (canal « ctl », fiable)  : prêt, circuit choisi, départ, arrivée, ping ;
//   WebRTC (canal « state », rapide): la position de chaque voiture, 20 fois par seconde.
// Le salon n'a ni serveur de jeu ni hôte autoritaire : l'« hôte » (le créateur, ou à défaut l'identifiant le plus petit)
// ne fait que choisir le circuit et donner le départ. Chacun pilote sa voiture et en est seul juge.
import { Emitter, SupabaseSignaling, LocalSignaling } from './signaling.js';
import { PeerMesh } from './transport.js';
import { packSnapshot, unpackSnapshot } from './snapshot.js';
import { PHYS_VER } from '../replay.js';

export const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     // sans 0 / O / 1 / I : pas de confusion à la dictée
export const MAX_PLAYERS = 8;
export const START_DELAY_MS = 4000;                                // entre « Lancer » et « GO »
export const SEND_EVERY_STEPS = 6;                                 // 120 / 6 = 20 paquets par seconde
const MAX_PACKETS_PER_SEC = 80;                                    // au-delà, un joueur inonde : on ignore l'excédent

export const ROOM_RE = /^[A-HJ-NP-Z2-9]{6}$/;
export function normalizeCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
export function newRoomCode(random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const r = random(6);
  return Array.from(r, (b) => ROOM_CHARS[b % ROOM_CHARS.length]).join('');
}
export const newPeerId = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

export class RoomError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

export class Room extends Emitter {
  constructor({ code, name, selfId = newPeerId(), makeSignaling, makeMesh = null, now = () => performance.now() }) {
    super();
    this.code = code; this.selfId = selfId; this.now = now;
    this.makeSignaling = makeSignaling; this.makeMesh = makeMesh;
    this.meta = { name: String(name).slice(0, 20), host: false, ready: false, racing: false, v: PHYS_VER, t: Date.now() };
    this.members = new Map();           // id → { id, name, host, ready, racing, v, t, link, rtt }
    this.trackId = null;
    this.state = 'lobby';               // lobby | racing
    this.results = new Map();           // id → { steps }
    this.seq = 0;
    this.buffers = new Map();           // id → SnapshotBuffer (rempli par setBufferFactory : la voiture distante)
    this.bufferFactory = null;
    this._rate = new Map();
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
    this.mesh = (this.makeMesh || ((o) => new PeerMesh(o)))({
      selfId: this.selfId, signaling: sig,
      handlers: { onMessage: (id, kind, data) => this._onMessage(id, kind, data), onLink: (id, st) => this._onLink(id, st) },
    });
    sig.on('join', (id, meta) => this._onPeer(id, meta));
    sig.on('meta', (id, meta) => this._onPeer(id, meta));
    sig.on('leave', (id) => this._onLeave(id));
    sig.on('closed', (why) => { if (!this.closed) { this.emit('error', new RoomError(why || 'Connexion perdue.', 'closed')); this._dispose(); } });
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
      if (host[1].racing) throw new RoomError('Une course est en cours dans cette salle.', 'racing');
      if (host[1].v !== PHYS_VER) throw new RoomError('Version du jeu différente de celle de l\'hôte : recharge la page.', 'version');
    }
    for (const [id, meta] of present) this._onPeer(id, meta);
    this._pingTimer = setInterval(() => this._pingAll(), 2000);
    this.emit('members');
  }

  _dispose() {
    this.closed = true;
    clearInterval(this._pingTimer);
    try { this.mesh && this.mesh.closeAll(); } catch { /* déjà fermé */ }
    try { this.signaling && this.signaling.leave(); } catch { /* déjà fermé */ }
  }

  leave() {
    if (this.closed) return;
    this._dispose();
    this.emit('closed');
  }

  // ---- Membres -------------------------------------------------------------------------------------------------------
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
    const m = { id, name: String(meta.name || '?').slice(0, 20), host: !!meta.host, ready: !!meta.ready, racing: !!meta.racing, v: meta.v, t: meta.t || 0, link: prev ? prev.link : 'connecting', rtt: prev ? prev.rtt : 0 };
    this.members.set(id, m);
    if (m.v === PHYS_VER && !this.closed) this.mesh.addPeer(id);     // un joueur d'une autre version ne peut pas courir avec nous
    else m.link = 'incompatible';
    this.emit('members');
  }

  _onLeave(id) {
    this.members.delete(id);
    this.mesh.removePeer(id);
    this.buffers.delete(id);
    this.emit('members');
    this.emit('left', id);
  }

  _onLink(id, status) {
    const m = this.members.get(id);
    if (m) m.link = status;
    // L'hôte informe un nouvel arrivant du circuit choisi.
    if (status === 'open' && this.isHost && this.trackId) this.mesh.sendCtl({ k: 'track', id: this.trackId }, id);
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
      case 'track': if (from === this.hostId && typeof data.id === 'string') { this.trackId = data.id.slice(0, 40); this.emit('track'); } break;
      case 'start':
        if (from !== this.hostId || this.state === 'racing') break;
        this._begin(String(data.trackId || '').slice(0, 40), Math.max(500, Math.min(15000, +data.startIn || START_DELAY_MS)) - (m ? m.rtt / 2 : 0));
        break;
      case 'finish':
        if (m && Number.isFinite(+data.steps) && +data.steps > 0 && !this.results.has(from)) { this.results.set(from, { steps: +data.steps | 0 }); this.emit('results'); }
        break;
      case 'lobby': if (from === this.hostId) this.backToLobby(false); break;
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
  selectTrack(trackId) {
    if (!this.isHost) return;
    this.trackId = trackId;
    this.mesh.sendCtl({ k: 'track', id: trackId });
    this.emit('track');
  }

  start() {
    if (!this.isHost || !this.trackId || this.state === 'racing') return false;
    this.mesh.sendCtl({ k: 'start', trackId: this.trackId, startIn: START_DELAY_MS });
    this._begin(this.trackId, START_DELAY_MS);
    return true;
  }

  _begin(trackId, inMs) {
    this.state = 'racing';
    this.results.clear();
    this.meta.racing = true; this.meta.ready = false; this.signaling.track(this.meta);
    this.seq = 0;
    this.emit('start', { trackId, startLocal: this.now() + inMs });
  }

  backToLobby(announce = true) {
    if (announce && this.isHost) this.mesh.sendCtl({ k: 'lobby' });
    this.state = 'lobby';
    this.meta.racing = false; this.meta.ready = false; this.signaling.track(this.meta);
    this.emit('lobby');
    this.emit('members');
  }

  // ---- Course --------------------------------------------------------------------------------------------------------
  // s : { steps, pos, quat, vel, vehicle, flags, tele, cp, lap } de la voiture locale ; envoyé à tous, canal rapide.
  sendSnapshot(s) { this.mesh.broadcastState(packSnapshot({ ...s, seq: this.seq++ })); }

  reportFinish(steps) {
    this.results.set(this.selfId, { steps });
    this.mesh.sendCtl({ k: 'finish', steps });
    this.emit('results');
  }

  // Classement : arrivées par temps croissant, puis ceux qui courent encore. Provisoire : chaque temps est déclaré par son joueur.
  ranking() {
    const rows = this.list.map((m) => ({ id: m.id, name: m.name, self: !!m.self, steps: this.results.has(m.id) ? this.results.get(m.id).steps : null }));
    return rows.sort((a, b) => (a.steps == null) - (b.steps == null) || (a.steps ?? 0) - (b.steps ?? 0));
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
export function defaultSignaling({ code, selfId }, getToken) {
  const local = typeof location !== 'undefined' && new URLSearchParams(location.search).get('net') === 'local';
  return local ? new LocalSignaling({ code, selfId }) : new SupabaseSignaling({ code, selfId, getToken });
}
