// Signalisation du multijoueur : annuaire des joueurs d'une salle + relais des messages WebRTC (offres, réponses, ICE).
//
// Supabase Realtime sert UNIQUEMENT à ça : trois ou quatre messages par connexion entre deux joueurs, puis plus rien.
// Les paquets de jeu (20 Hz) ne passent JAMAIS par ici : ils vont directement de navigateur à navigateur (transport.js).
//
// Deux implémentations de la même interface :
//   SupabaseSignaling : un canal Realtime « copytrack-room-<CODE> » (diffusion + présence), protocole Phoenix écrit à la main
//                       (aucune bibliothèque : le jeu reste sans dépendance) ;
//   LocalSignaling    : BroadcastChannel du navigateur, pour essayer deux onglets sans serveur (?net=local) et pour les tests.
//
// Interface : join(meta) · track(meta) · send(to, data) · leave() · peers (Map id → meta, sans soi)
//   événements : 'join'(id, meta) · 'leave'(id) · 'meta'(id, meta) · 'signal'(from, data) · 'closed'(reason)
import { ONLINE } from '../online.js';

export class Emitter {
  constructor() { this._h = new Map(); }
  on(ev, fn) { (this._h.get(ev) || this._h.set(ev, []).get(ev)).push(fn); return this; }
  off(ev, fn) { const a = this._h.get(ev); if (a) this._h.set(ev, a.filter((f) => f !== fn)); }
  emit(ev, ...args) { for (const f of [...(this._h.get(ev) || [])]) { try { f(...args); } catch (e) { console.error(e); } } }
}

const JOIN_TIMEOUT = 6000;

// ---- Supabase Realtime (protocole Phoenix, version 1.0.0 : messages JSON {topic, event, payload, ref}) ----------------
export class SupabaseSignaling extends Emitter {
  // observe : écouter l'annuaire d'un canal sans s'y inscrire (liste des salons publics : on regarde, on n'apparaît pas).
  constructor({ code, selfId, getToken = null, observe = false, WebSocketImpl = globalThis.WebSocket, url = ONLINE.url, key = ONLINE.key, heartbeatMs = 25000 }) {
    super();
    this.code = code; this.selfId = selfId; this.getToken = getToken; this.observe = observe;
    this.WS = WebSocketImpl; this.url = url; this.key = key; this.heartbeatMs = heartbeatMs;
    this.topic = `realtime:copytrack-room-${code}`;
    this.peers = new Map();
    this.ref = 0;
    this.ws = null; this.hb = null; this.joined = false;
  }

  _send(topic, event, payload) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    this.ws.send(JSON.stringify({ topic, event, payload, ref: String(++this.ref) }));
    return true;
  }

  async join(meta) {
    this.meta = meta;
    const token = this.getToken ? await this.getToken().catch(() => null) : null;
    const wsUrl = this.url.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(this.key) + '&vsn=1.0.0';
    await new Promise((resolve, reject) => {
      let done = false;
      const fail = (m) => { if (!done) { done = true; reject(new Error(m)); } };
      const timer = setTimeout(() => fail('Le serveur de salons ne répond pas.'), JOIN_TIMEOUT);
      let ws;
      try { ws = new this.WS(wsUrl); } catch { clearTimeout(timer); fail('Connexion impossible.'); return; }
      this.ws = ws;
      ws.onopen = () => {
        this._send(this.topic, 'phx_join', {
          config: { broadcast: { self: false, ack: false }, presence: { key: this.selfId }, private: false },
          ...(token ? { access_token: token } : {}),
        });
      };
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.topic === this.topic && m.event === 'phx_reply' && !this.joined) {
          clearTimeout(timer);
          if (m.payload && m.payload.status === 'ok') {
            this.joined = true;
            if (!this.observe) this._send(this.topic, 'presence', { type: 'presence', event: 'track', payload: this.meta });
            this.hb = setInterval(() => this._send('phoenix', 'heartbeat', {}), this.heartbeatMs);
            // La liste des présents (presence_state) arrive juste après la réponse : on laisse un instant.
            setTimeout(() => { if (!done) { done = true; resolve(); } }, 250);
          } else fail('Salle refusée par le serveur' + (m.payload && m.payload.response && m.payload.response.reason ? ' (' + m.payload.response.reason + ')' : '.'));
          return;
        }
        this._onMessage(m);
      };
      ws.onerror = () => { clearTimeout(timer); fail('Connexion au serveur de salons impossible.'); };
      ws.onclose = () => { clearTimeout(timer); fail('Connexion fermée.'); this._closed('Connexion au serveur de salons perdue.'); };
    });
  }

  _onMessage(m) {
    if (m.topic !== this.topic) return;
    const p = m.payload || {};
    if (m.event === 'presence_state') {
      const fresh = new Set(Object.keys(p).filter((k) => k !== this.selfId));
      for (const id of [...this.peers.keys()]) if (!fresh.has(id)) { this.peers.delete(id); this.emit('leave', id); }
      for (const id of fresh) this._setMeta(id, p[id]);
    } else if (m.event === 'presence_diff') {
      for (const id of Object.keys(p.leaves || {})) if (id !== this.selfId && !(p.joins || {})[id] && this.peers.delete(id)) this.emit('leave', id);
      for (const id of Object.keys(p.joins || {})) if (id !== this.selfId) this._setMeta(id, p.joins[id]);
    } else if (m.event === 'broadcast' && p.event === 'signal' && p.payload) {
      const { from, to, data } = p.payload;
      if (to === this.selfId && typeof from === 'string' && from !== this.selfId) this.emit('signal', from, data);
    }
  }

  _setMeta(id, entry) {
    const metas = entry && entry.metas ? entry.metas : [];
    const meta = metas[metas.length - 1];                 // la plus récente
    if (!meta) return;
    const { phx_ref, phx_ref_prev, ...clean } = meta;
    const had = this.peers.has(id);
    this.peers.set(id, clean);
    this.emit(had ? 'meta' : 'join', id, clean);
  }

  track(meta) { this.meta = meta; this._send(this.topic, 'presence', { type: 'presence', event: 'track', payload: meta }); }

  send(to, data) {
    return this._send(this.topic, 'broadcast', { type: 'broadcast', event: 'signal', payload: { from: this.selfId, to, data } });
  }

  _closed(reason) {
    if (this._ended) return;
    this._ended = true;
    clearInterval(this.hb);
    this.emit('closed', reason);
  }

  leave() {
    if (this._ended) return;
    this._send(this.topic, 'phx_leave', {});
    this._ended = true;
    clearInterval(this.hb);
    try { this.ws && this.ws.close(); } catch { /* déjà fermé */ }
  }
}

// ---- Signalisation locale (deux onglets du même navigateur) ----------------------------------------------------------
export class LocalSignaling extends Emitter {
  constructor({ code, selfId }) {
    super();
    this.code = code; this.selfId = selfId;
    this.peers = new Map();
    this.bc = new BroadcastChannel('copytrack-room-' + code);
    this.bc.onmessage = (e) => this._onMessage(e.data);
  }
  async join(meta) {
    this.meta = meta;
    this.bc.postMessage({ k: 'hello', id: this.selfId, meta });
    await new Promise((r) => setTimeout(r, 250));      // le temps de recevoir les réponses des présents
  }
  _onMessage(m) {
    if (!m || m.id === this.selfId) return;
    if (m.k === 'hello') {
      this._set(m.id, m.meta);
      this.bc.postMessage({ k: 'here', id: this.selfId, to: m.id, meta: this.meta });
    } else if (m.k === 'here' && m.to === this.selfId) this._set(m.id, m.meta);
    else if (m.k === 'meta') this._set(m.id, m.meta);
    else if (m.k === 'bye') { if (this.peers.delete(m.id)) this.emit('leave', m.id); }
    else if (m.k === 'signal' && m.to === this.selfId) this.emit('signal', m.id, m.data);
  }
  _set(id, meta) { const had = this.peers.has(id); this.peers.set(id, meta); this.emit(had ? 'meta' : 'join', id, meta); }
  track(meta) { this.meta = meta; this.bc.postMessage({ k: 'meta', id: this.selfId, meta }); }
  send(to, data) { this.bc.postMessage({ k: 'signal', id: this.selfId, to, data }); return true; }
  leave() { this.bc.postMessage({ k: 'bye', id: this.selfId }); this.bc.close(); }
}
