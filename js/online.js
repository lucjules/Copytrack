// Fonctions en ligne (Supabase) : pilote anonyme, circuits de la communauté.
// Client minimal en fetch (aucune bibliothèque) : l'API REST de la base et l'API
// d'authentification. Seule la clé PUBLIQUE est ici : la sécurité vient des règles
// de la base (voir supabase/etape1-communaute.sql). Sans réseau, le jeu marche
// normalement et ces fonctions répondent simplement « hors ligne ».
import { getJSON, setJSON } from './storage.js';

export const ONLINE = {
  url: 'https://vakhnbmqnwvkekwuntbz.supabase.co',
  key: 'sb_publishable_wBsMno7Qs4N-dM7usIm5OQ_0aEv-N1o',
};

export class OnlineError extends Error {
  constructor(message, code = '') { super(message); this.code = code; }
}

// Messages d'erreur compréhensibles.
function explain(status, body) {
  const msg = (body && (body.message || body.msg || body.error_description || body.error)) || '';
  if (/anonymous/i.test(msg) && /disabled/i.test(msg)) return new OnlineError('Connexion anonyme désactivée dans Supabase (Authentication › Sign In / Providers › Allow anonymous sign-ins).', 'anon-disabled');
  if (body && body.code === '42P01' || /relation .* does not exist|Could not find the table/i.test(msg)) return new OnlineError('La base n’est pas encore prête (script SQL de l’étape 1 à lancer dans Supabase).', 'no-schema');
  if (body && body.code === '23505') return new OnlineError('Ce circuit est déjà publié.', 'duplicate');
  if (/Trop de publications/.test(msg)) return new OnlineError(msg, 'rate');
  if (status === 401 || status === 403) return new OnlineError('Accès refusé par le serveur.', 'denied');
  return new OnlineError(msg || `Erreur du serveur (${status}).`, 'http');
}

class OnlineClient {
  constructor() {
    this.session = getJSON('online.session', null);
    this.player = getJSON('online.player', null);
    this._authP = null;
  }

  get uid() { return this.session && this.session.user && this.session.user.id; }

  _save() {
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
    let data = null;
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
    const clean = String(name || 'Pilote').trim().slice(0, 20) || 'Pilote';
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

  async listTracks({ sort = 'recent', search = '', mine = false, limit = 30, offset = 0 } = {}) {
    const q = new URLSearchParams();
    q.set('select', OnlineClient.FIELDS);
    if (mine) { await this.ensureSession(); q.set('author', 'eq.' + this.uid); }
    if (search.trim()) q.set('name', 'ilike.*' + search.trim().replace(/[*,()]/g, ' ') + '*');
    q.set('order', sort === 'popular' ? 'likes.desc,plays.desc,created_at.desc' : sort === 'played' ? 'plays.desc,created_at.desc' : 'created_at.desc');
    q.set('limit', String(limit));
    q.set('offset', String(offset));
    return this._fetch('/rest/v1/tracks?' + q.toString());
  }

  async publish(track, playerName) {
    await this.ensurePlayer(playerName);
    const rows = await this._fetch('/rest/v1/tracks', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: {
        name: track.name.slice(0, 40) || 'Sans titre',
        decor: track.decor,
        code: track.encode(),
        signature: track.signature(),
        author_time: track.vt,
        pieces: track.tiles.length,
        laps: track.laps || 1,
      },
    });
    return rows && rows[0];
  }

  async deleteTrack(id) {
    await this._fetch('/rest/v1/tracks?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
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

  async myLikes() {
    await this.ensureSession();
    const rows = await this._fetch('/rest/v1/track_likes?select=track_id&player=eq.' + this.uid);
    return new Set((rows || []).map((r) => r.track_id));
  }
}

export const online = new OnlineClient();
