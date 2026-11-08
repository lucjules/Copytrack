// Fonctions en ligne (Supabase) : pilote anonyme, circuits de la communauté.
// Client minimal en fetch (aucune bibliothèque) : l'API REST de la base et l'API
// d'authentification. Seule la clé PUBLIQUE est ici : la sécurité vient des règles
// de la base (voir supabase/etape1-communaute.sql). Sans réseau, le jeu marche
// normalement et ces fonctions répondent simplement « hors ligne ».
import { getJSON, setJSON } from './storage.js';
import { CONFIG } from './config.js';

export const ONLINE = CONFIG.supabase;      // { url, key } : voir js/config.js

// Limites de la base (voir supabase/etape1-communaute.sql).
const MAX_PUBLISH_CHARS = 100000;
const MAX_PUBLISH_PIECES = 5000;

export class OnlineError extends Error {
  constructor(message, code = '') { super(message); this.code = code; }
}

// Messages d'erreur compréhensibles.
function explain(status, body) {
  const msg = (body && (body.message || body.msg || body.error_description || body.error)) || '';
  if (/anonymous/i.test(msg) && /disabled/i.test(msg)) return new OnlineError('Connexion anonyme désactivée sur le serveur.', 'anon-disabled');
  if (body && body.code === '42P01' || /relation .* does not exist|Could not find the table/i.test(msg)) return new OnlineError('Base non prête (étape 1 SQL manquante).', 'no-schema');
  if (body && body.code === '23505') return new OnlineError('Ce circuit est déjà publié.', 'duplicate');
  if (body && body.code === 'PGRST202' || /Could not find the function/i.test(msg)) return new OnlineError('Fonction en ligne absente : une étape SQL n’est pas encore lancée sur le serveur.', 'no-sql-step');
  if (/compte est nécessaire|Aucun compte ne porte|propre pseudo|Trop de demandes|Liste d.amis pleine|Trop d.abonnements|On ne se suit pas/.test(msg)) return new OnlineError(msg, 'social');
  if (status === 404 && body && body.code === 'NOT_FOUND' && /function/i.test(msg)) {
    return new OnlineError('Fonction « submit-score » introuvable sur le serveur.', 'no-function');
  }
  if (/Trop de publications/.test(msg)) return new OnlineError(msg, 'rate');
  // Comptes (Supabase Auth)
  const ec = (body && (body.error_code || body.code)) || '';
  if (ec === 'user_already_exists' || /already registered|already been registered/i.test(msg)) return new OnlineError('Ce pseudo est déjà pris.', 'name-taken');
  if (ec === 'invalid_credentials' || /Invalid login credentials/i.test(msg)) return new OnlineError('Pseudo ou mot de passe incorrect.', 'bad-credentials');
  if (ec === 'weak_password') return new OnlineError('Mot de passe trop faible : au moins 8 caractères.', 'weak-password');
  if (ec === 'email_address_invalid' || ec === 'validate_failed' || /email address.*invalid/i.test(msg)) return new OnlineError('Le serveur refuse les comptes (voir COMPTES.md).', 'server-config');
  if (ec === 'signup_disabled') return new OnlineError('Les inscriptions sont désactivées sur le serveur.', 'server-config');
  if (ec === 'over_request_rate_limit' || ec === 'over_email_send_rate_limit' || status === 429) return new OnlineError('Trop d’essais : réessaie dans quelques minutes.', 'rate');
  if (/Database error saving new user/i.test(msg)) return new OnlineError('Ce pseudo est déjà pris ou invalide.', 'name-taken');
  if (/appartient à un compte/.test(msg)) return new OnlineError('Ce pseudo appartient à un compte : choisis-en un autre.', 'name-taken');
  if (status === 401 || status === 403) return new OnlineError('Accès refusé par le serveur.', 'denied');
  return new OnlineError(msg || `Erreur du serveur (${status}).`, 'http');
}

class OnlineClient {
  constructor() {
    this.kind = 'guest';                 // 'guest' : session anonyme ; 'account' : session du compte (voir account.js)
    this.session = getJSON('online.session', null);
    this.player = getJSON('online.player', null);
    this.onAccountSession = null;        // appelé quand la session du compte est renouvelée (pour la mémoriser)
    this._authP = null;
  }

  // Passe en mode compte : la session est celle du compte, jamais une session anonyme de remplacement.
  useAccount(session) {
    this.kind = 'account';
    this.session = session;
    this.player = null;                  // le profil en ligne (table players) est créé au premier besoin : ensurePlayer
  }

  // Retour au mode invité (déconnexion) : une nouvelle session anonyme sera créée au premier besoin.
  useGuest() {
    this.kind = 'guest';
    this.session = null;
    this.player = null;
    setJSON('online.session', null);
    setJSON('online.player', null);
  }

  // Appel REST authentifié (utilisé par account.js).
  rest(path, opts = {}) { return this._fetch(path, opts); }

  get uid() { return this.session && this.session.user && this.session.user.id; }

  _save() {
    if (this.kind === 'account') { if (this.onAccountSession) this.onAccountSession(this.session); return; }
    setJSON('online.session', this.session);
    setJSON('online.player', this.player);
  }

  async _fetch(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OnlineError('Pas de connexion internet.', 'offline');
    const h = { apikey: ONLINE.key, 'Content-Type': 'application/json', ...headers };
    if (auth) {
      await this.ensureSession();
      h.Authorization = 'Bearer ' + this.session.access_token;
    }
    let res;
    try {
      res = await fetch(ONLINE.url + path, { method, headers: h, body: body == null ? undefined : JSON.stringify(body) });
    } catch {
      throw new OnlineError('Serveur injoignable (connexion internet ?).', 'offline');
    }
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) throw explain(res.status, data);
    return data;
  }

  // Session anonyme : créée au premier besoin, rafraîchie avant expiration.
  async ensureSession() {
    const s = this.session;
    if (s && s.access_token && s.expires_at && s.expires_at * 1000 > Date.now() + 60000) return s;
    if (!this._authP) {
      this._authP = (async () => {
        try {
          if (this.kind === 'account') {
            // Compte : on renouvelle SA session. Jamais de repli sur une session anonyme (ce serait un autre joueur).
            try {
              this.session = this._norm(await this._fetch('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s && s.refresh_token }, auth: false }));
            } catch (e) {
              if (e.code === 'offline') throw e;
              throw new OnlineError('Session expirée : reconnecte-toi.', 'session-expired');
            }
            this._save();
            return this.session;
          }
          if (s && s.refresh_token) {
            try {
              this.session = this._norm(await this._fetch('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token }, auth: false }));
              this._save();
              return this.session;
            } catch { /* jeton périmé : nouvelle session anonyme */ }
          }
          this.session = this._norm(await this._fetch('/auth/v1/signup', { method: 'POST', body: { data: {} }, auth: false }));
          this.player = null;
          this._save();
          return this.session;
        } finally { this._authP = null; }
      })();
    }
    return this._authP;
  }

  _norm(d) {
    if (!d || !d.access_token) throw new OnlineError('Connexion refusée par le serveur.', 'auth');
    return { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600), user: { id: d.user && d.user.id } };
  }

  // Profil du pilote (pseudo). Créé ou mis à jour si le pseudo a changé.
  async ensurePlayer(name) {
    await this.ensureSession();
    // Compte : le pseudo du compte, toujours. Invité : son pseudo de session, jamais un nom par défaut.
    const clean = String(this.kind === 'account' && this.player ? this.player.name : name || '').trim().slice(0, 20);
    if (!clean) throw new OnlineError('Choisis d’abord un pseudo.', 'no-name');
    if (/^(player|pilote)$/i.test(clean)) throw new OnlineError('« Player » et « Pilote » sont réservés : choisis ton propre pseudo.', 'no-name');
    if (this.player && this.player.id === this.uid && this.player.name === clean) return this.player;
    await this._fetch('/rest/v1/players', {
      method: 'POST', body: { id: this.uid, name: clean },
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
    this.player = { id: this.uid, name: clean };
    this._save();
    return this.player;
  }

  // ---- Circuits de la communauté ---------------------------------------------------
  // Le pseudo de l'auteur : lien précisé (plusieurs liens existent entre circuits et pilotes).
  static FIELDS = 'id,name,decor,code,author_time,pieces,laps,plays,likes,created_at,author,players!tracks_author_fkey(name)';

  // La colonne « description » arrive avec l'étape 3 (SQL) : tant qu'elle n'existe pas,
  // tout marche sans elle.
  static noDesc(e) { return /description/i.test((e && e.message) || ''); }

  async listTracks(opts = {}) {
    if (this.hasDesc !== false) {
      try { const r = await this._listTracks(opts, true); this.hasDesc = true; return r; } catch (e) {
        if (!OnlineClient.noDesc(e)) throw e;
        this.hasDesc = false;
      }
    }
    return this._listTracks(opts, false);
  }

  async _listTracks({ sort = 'recent', search = '', mine = false, authors = null, limit = 30, offset = 0 } = {}, desc = true) {
    const q = new URLSearchParams();
    q.set('select', OnlineClient.FIELDS + (desc ? ',description' : ''));
    if (mine) { await this.ensureSession(); q.set('author', 'eq.' + this.uid); }
    else if (Array.isArray(authors)) q.set('author', 'in.(' + authors.filter((x) => /^[0-9a-f-]{36}$/.test(x)).join(',') + ')');     // auteurs suivis (E15)
    if (search.trim()) q.set('name', 'ilike.*' + search.trim().replace(/[*,()]/g, ' ') + '*');
    q.set('order', sort === 'popular' ? 'likes.desc,plays.desc,created_at.desc' : sort === 'played' ? 'plays.desc,created_at.desc' : 'created_at.desc');
    q.set('limit', String(limit));
    q.set('offset', String(offset));
    return this._fetch('/rest/v1/tracks?' + q.toString());
  }

  // Un circuit de la communauté par son identifiant (favoris du Race Hub) : la ligne complète, ou null s'il a été retiré.
  async trackById(id) {
    if (!/^[0-9a-f-]{36}$/.test(String(id))) return null;
    const q = new URLSearchParams();
    q.set('select', OnlineClient.FIELDS + (this.hasDesc === false ? '' : ',description'));
    q.set('id', 'eq.' + id);
    let rows;
    try { rows = await this._fetch('/rest/v1/tracks?' + q.toString()); }
    catch (e) { if (!OnlineClient.noDesc(e)) throw e; this.hasDesc = false; q.set('select', OnlineClient.FIELDS); rows = await this._fetch('/rest/v1/tracks?' + q.toString()); }
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }

  // Les circuits les plus joués ces derniers jours (étape 8). Renvoie les lignes complètes (comme listTracks), dans l'ordre, avec week_players ; [] si la fonction n'existe pas.
  async trending({ days = 7, limit = 24, offset = 0 } = {}) {
    let ranks;
    try { ranks = await this._fetch('/rest/v1/rpc/trending_tracks', { method: 'POST', body: { days, lim: limit, off: offset } }); }
    catch (e) { if (e && e.code === 'http' && /trending_tracks|function|404/i.test(e.message)) return null; throw e; }
    if (!Array.isArray(ranks) || !ranks.length) return [];
    const ids = ranks.map((r) => r.id).filter((id) => /^[0-9a-f-]{36}$/.test(id));
    const q = new URLSearchParams();
    q.set('select', OnlineClient.FIELDS + (this.hasDesc === false ? '' : ',description'));
    q.set('id', 'in.(' + ids.join(',') + ')');
    let rows;
    try { rows = await this._fetch('/rest/v1/tracks?' + q.toString()); }
    catch (e) { if (!OnlineClient.noDesc(e)) throw e; this.hasDesc = false; q.set('select', OnlineClient.FIELDS); rows = await this._fetch('/rest/v1/tracks?' + q.toString()); }
    const by = new Map((rows || []).map((r) => [r.id, r]));
    return ranks.filter((r) => by.has(r.id)).map((r) => ({ ...by.get(r.id), week_players: +r.week_players || 0 }));
  }

  async publish(track, playerName) {
    const code = track.encode();
    if (code.length > MAX_PUBLISH_CHARS) throw new OnlineError(`Circuit trop gros (${code.length} / ${MAX_PUBLISH_CHARS} caractères).`, 'too-big');
    if (track.tiles.length > MAX_PUBLISH_PIECES) throw new OnlineError(`Circuit trop gros (${track.tiles.length} / ${MAX_PUBLISH_PIECES} pièces).`, 'too-big');
    await this.ensurePlayer(playerName);
    const body = {
      name: track.name.slice(0, 40) || 'Sans titre',
      decor: track.decor,
      code,
      signature: track.signature(),
      author_time: track.vt,
      pieces: track.tiles.length,
      laps: track.laps || 1,
    };
    const send = (b) => this._fetch('/rest/v1/tracks', { method: 'POST', headers: { Prefer: 'return=representation' }, body: b });
    let rows;
    try {
      rows = await send(this.hasDesc === false ? body : { ...body, description: track.desc || '' });
    } catch (e) {
      if (!OnlineClient.noDesc(e)) throw e;
      this.hasDesc = false;
      rows = await send(body);
    }
    return rows && rows[0];
  }

  // Modifier le nom et la description d'un circuit publié (le sien seulement).
  async updateTrackMeta(id, name, description) {
    try {
      await this._fetch('/rest/v1/rpc/update_track_meta', { method: 'POST', body: { t: id, n: name, d: description } });
    } catch (e) {
      if (e.code === 'http' && /update_track_meta|function/i.test(e.message)) throw new OnlineError('Modification indisponible (étape 3 SQL manquante).', 'no-schema');
      throw e;
    }
  }

  async deleteTrack(id) {
    await this._fetch('/rest/v1/tracks?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  }

  // Titre affiché à côté de mon pseudo dans les classements (décoratif ; liste blanche côté serveur : supabase/etape8-decouverte.sql). '' = aucun.
  async setTitle(id) {
    await this.ensureSession();
    return this._fetch('/rest/v1/rpc/set_title', { method: 'POST', body: { t: id || '' } });
  }

  // Statistiques de jeu anonymes (voir telemetry.js, supabase/etape6-telemetrie.sql) : pas de session, pas de pseudo.
  async logRuns(events) {
    return this._fetch('/rest/v1/rpc/log_runs', { method: 'POST', body: { events }, auth: false });
  }

  async played(id) {
    try { await this._fetch('/rest/v1/rpc/track_played', { method: 'POST', body: { t: id } }); } catch { /* sans importance */ }
  }

  async toggleLike(id, playerName) {
    await this.ensurePlayer(playerName);
    return this._fetch('/rest/v1/rpc/toggle_like', { method: 'POST', body: { t: id } });
  }

  async report(id, playerName) {
    await this.ensurePlayer(playerName);
    await this._fetch('/rest/v1/rpc/report_track', { method: 'POST', body: { t: id } });
  }

  // ---- Classements ------------------------------------------------------------------
  // Envoie une course terminée : la fonction serveur la rejoue avant d'accepter le temps.
  async submitScore({ trackKey, code = '', inputs, time, physVer }, playerName) {
    await this.ensurePlayer(playerName);
    return this._fetch('/functions/v1/submit-score', { method: 'POST', body: { trackKey, code, inputs, time, physVer } });
  }

  async leaderboard(trackKey, physVer, limit = 10) {
    const q = new URLSearchParams();
    q.set('track_key', 'eq.' + trackKey);
    q.set('phys_ver', 'eq.' + physVer);
    q.set('order', 'time.asc,updated_at.asc');
    q.set('limit', String(limit));
    // has_ghost (étape 7) et players.title (étape 8) : colonnes récentes ; absentes (étape pas lancée), on relit sans elles, de la plus complète à la plus simple.
    let top, lastErr;
    // ghost_veh (étape 7) : les véhicules de la course (Race Hub : véhicule à l'arrivée).
    for (const sel of ['time,player,updated_at,has_ghost,ghost_veh,players!scores_player_fkey(name,title)', 'time,player,updated_at,has_ghost,ghost_veh,players!scores_player_fkey(name)', 'time,player,updated_at,players!scores_player_fkey(name)']) {
      q.set('select', sel);
      try { top = await this._fetch('/rest/v1/scores?' + q.toString()); lastErr = null; break; } catch (e) { lastErr = e; }
    }
    if (lastErr) throw lastErr;
    // Ma place, si j'ai un temps.
    let me = null;
    if (this.uid) {
      const mine = await this._fetch(`/rest/v1/scores?select=time&track_key=eq.${encodeURIComponent(trackKey)}&phys_ver=eq.${physVer}&player=eq.${this.uid}`);
      if (mine && mine.length) {
        const before = await this._count(`track_key=eq.${encodeURIComponent(trackKey)}&phys_ver=eq.${physVer}&time=lt.${mine[0].time}`);
        me = { time: mine[0].time, rank: before + 1 };
      }
    }
    const total = await this._count(`track_key=eq.${encodeURIComponent(trackKey)}&phys_ver=eq.${physVer}`);
    return { top: top || [], me, total };
  }

  // Le fantôme du n° rank (1 à 10) du classement d'un circuit : { name, time, ghost (base64), veh } ou null (record d'avant l'étape 7, ou hors du top 10).
  async ghost(trackKey, rank, physVer) {
    const rows = await this._fetch('/rest/v1/rpc/get_ghost', { method: 'POST', body: { k: trackKey, r: rank, pv: physVer } });
    const g = Array.isArray(rows) ? rows[0] : null;
    return g && typeof g.ghost === 'string' ? { name: String(g.name || '?'), time: +g.time, ghost: g.ghost, veh: g.ghost_veh || [] } : null;
  }

  async _count(query) {
    const h = { apikey: ONLINE.key, Prefer: 'count=exact', Range: '0-0' };
    await this.ensureSession();
    h.Authorization = 'Bearer ' + this.session.access_token;
    const r = await fetch(`${ONLINE.url}/rest/v1/scores?${query}&select=player`, { headers: h });
    if (!r.ok) throw explain(r.status, null);
    return parseInt((r.headers.get('content-range') || '*/0').split('/')[1], 10) || 0;
  }

  // ---- Amis et abonnements (supabase/etape10-social.sql, E15) : comptes seulement pour les amis ---------------------------
  rpc(name, body = {}) { return this._fetch('/rest/v1/rpc/' + name, { method: 'POST', body }); }
  async friends() { const r = await this.rpc('my_friends'); return Array.isArray(r) ? r : []; }
  async friendRequest(name, playerName) { await this.ensurePlayer(playerName); return this.rpc('friend_request', { target_name: String(name || '').trim() }); }
  async friendRespond(id, accept) { return this.rpc('friend_respond', { other: id, accept: !!accept }); }
  async friendRemove(id) { return this.rpc('friend_remove', { other: id }); }
  async friendsBoard(trackKey, physVer, limit = 20) { const r = await this.rpc('friends_board', { k: trackKey, pv: physVer, lim: limit }); return Array.isArray(r) ? r : []; }
  async follow(authorId, playerName) { await this.ensurePlayer(playerName); return this.rpc('follow', { author_id: authorId }); }
  async unfollow(authorId) { return this.rpc('unfollow', { author_id: authorId }); }
  async followerCount(authorId) { return +(await this.rpc('follower_count', { author_id: authorId })) || 0; }
  async myFollows() { await this.ensureSession(); const r = await this._fetch('/rest/v1/follows?select=author&follower=eq.' + this.uid); return new Set((r || []).map((x) => x.author)); }

  // ---- Classements par secteur (etape9-secteurs.sql) ----------------------------------------------------------------------
  async sectorBoard(trackKey, physVer, i, limit = 10) { const r = await this.rpc('sector_board', { k: trackKey, pv: physVer, i, lim: limit }); return Array.isArray(r) ? r : []; }

  // ---- Saisons (etape11-saisons.sql) : la base clôt les saisons finies avant qu'on les lise ---------------------------------
  async seasonStandings(n, limit = 20) {
    try { await this.rpc('close_due_seasons'); } catch (e) { if (e.code === 'no-sql-step') throw e; }
    const r = await this.rpc('season_standings', { n, lim: limit });
    return Array.isArray(r) ? r : [];
  }
  async mySeason(n) { const r = await this.rpc('my_season', { n }); return Array.isArray(r) && r[0] ? r[0] : null; }

  async myLikes() {
    await this.ensureSession();
    const rows = await this._fetch('/rest/v1/track_likes?select=track_id&player=eq.' + this.uid);
    return new Set((rows || []).map((r) => r.track_id));
  }
}

export const online = new OnlineClient();
