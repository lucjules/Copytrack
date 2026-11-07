// Statistiques de jeu ANONYMES (avec l'accord du joueur) : temps de fin, abandons, essais par circuit intégré.
// Elles servent à une seule chose : régler la difficulté et les médailles sur de vrais joueurs, pas sur le pilote automatique
// (voir tools/telemetry-report.mjs et supabase/etape6-telemetrie.sql).
//
// Ce qui part : un identifiant d'installation aléatoire (jamais lié au pseudo, au compte ni à l'adresse), l'identifiant du circuit intégré, l'issue
// (arrivée ou abandon), le temps, la progression au moment de l'abandon, le nombre de retours au checkpoint, le numéro d'essai, la médaille, la version
// de la physique. Rien d'autre : ni nom, ni position, ni commandes. Rien ne part tant que le joueur n'a pas accepté (réglage `telemetry`).
//
// Les évènements attendent dans une file locale bornée et partent par lots ; un échec réseau les garde pour plus tard (attente croissante).
import { PHYS_VER } from './version.js';

export const QUEUE_KEY = 'telemetry.queue';
export const STATE_KEY = 'telemetry.state';
export const MAX_QUEUE = 300;            // au-delà, les plus anciens sont jetés
export const BATCH = 50;                  // évènements par envoi (le serveur en accepte 50 au plus)
export const MAX_AGE_MS = 14 * 86400000;  // un évènement plus vieux que ça n'est plus envoyé
const MIN_BACKOFF_MS = 30000, MAX_BACKOFF_MS = 3600000;

// Identifiant d'un circuit pour les statistiques : « b-<id>-<empreinte> » (circuit intégré) -> <id> ; « daily-… » -> « daily » ; le reste n'est pas suivi.
export function trackIdOf(trackKey) {
  const k = String(trackKey || '');
  const b = /^b-([a-z0-9_]{1,40})-[a-z0-9]+$/.exec(k);
  if (b) return b[1];
  return /^daily-\d{4}-\d{2}-\d{2}$/.test(k) ? 'daily' : null;
}

export const newInstallId = (random = (n) => crypto.getRandomValues(new Uint8Array(n))) => Array.from(random(8), (b) => b.toString(16).padStart(2, '0')).join('');

const num = (v, lo, hi) => (Number.isFinite(v) && v >= lo && v <= hi ? v : null);

export class Telemetry {
  // store : { get(clé, défaut), set(clé, valeur) } ; send(lot) : Promise (rejet = échec, le lot est gardé) ; enabled() : le joueur a-t-il accepté ?
  constructor({ store, send, enabled = () => false, now = Date.now, schedule = (fn, ms) => setTimeout(fn, ms), random } = {}) {
    this.store = store; this.sendBatch = send; this.enabled = enabled; this.now = now; this.schedule = schedule;
    this.random = random;
    this.queue = this._load();
    this.state = this.store.get(STATE_KEY, null) || {};
    if (!/^[0-9a-f]{16}$/.test(this.state.install || '')) { this.state = { ...this.state, install: newInstallId(this.random), attempts: this.state.attempts || {} }; this._saveState(); }
    this.state.attempts = this.state.attempts || {};
    this.flushing = false; this.nextTry = 0; this.backoff = MIN_BACKOFF_MS; this.timer = null;
  }

  get installId() { return this.state.install; }

  _load() {
    const q = this.store.get(QUEUE_KEY, []);
    return Array.isArray(q) ? q.filter((e) => e && typeof e === 'object') : [];
  }
  _saveQueue() { this.store.set(QUEUE_KEY, this.queue); }
  _saveState() { this.store.set(STATE_KEY, this.state); }

  // Une partie terminée ou abandonnée. outcome : 'finish' | 'quit'. Sans accord du joueur, ou pour un circuit non suivi : rien.
  record({ trackKey, outcome, time, progress = null, respawns = 0, medal = null }) {
    if (!this.enabled()) return false;
    const track = trackIdOf(trackKey);
    if (!track || (outcome !== 'finish' && outcome !== 'quit')) return false;
    const t = num(time, 0.5, 3599);
    if (t == null) return false;
    const attempt = (this.state.attempts[track] || 0) + 1;
    this.state.attempts[track] = Math.min(attempt, 100000);
    this._saveState();
    const ev = { track, outcome, time: Math.round(t * 1000) / 1000, attempt: Math.min(attempt, 100000), respawns: Math.max(0, Math.min(1000, respawns | 0)), pv: PHYS_VER, ts: this.now() };
    const p = num(progress, 0, 1);
    if (outcome === 'quit' && p != null) ev.progress = Math.round(p * 1000) / 1000;
    if (outcome === 'finish' && ['cristal', 'or', 'argent', 'bronze'].includes(medal)) ev.medal = medal;
    this.queue.push(ev);
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
    this._saveQueue();
    this.scheduleFlush(outcome === 'finish' ? 2000 : 8000);
    return true;
  }

  scheduleFlush(ms = 5000) {
    if (this.timer || !this.queue.length) return;
    const wait = Math.max(ms, this.nextTry - this.now());
    this.timer = this.schedule(() => { this.timer = null; this.flush(); }, wait);
  }

  // Envoie la file par lots. Renvoie le nombre d'évènements partis. Ne lève jamais d'erreur.
  async flush() {
    if (this.flushing || !this.enabled() || !this.queue.length || this.now() < this.nextTry) return 0;
    this.flushing = true;
    let sent = 0;
    try {
      const old = this.now() - MAX_AGE_MS;
      this.queue = this.queue.filter((e) => (e.ts || 0) >= old);
      for (let round = 0; round < 5 && this.queue.length; round++) {
        const batch = this.queue.slice(0, BATCH);
        // Un lot ne contient QUE des champs utiles : ni l'horodatage local, ni rien d'autre.
        await this.sendBatch(batch.map(({ ts, ...e }) => ({ ...e, install: this.installId })));
        this.queue.splice(0, batch.length);
        sent += batch.length;
        this._saveQueue();
        this.backoff = MIN_BACKOFF_MS;
      }
    } catch {
      this.nextTry = this.now() + this.backoff;
      this.backoff = Math.min(MAX_BACKOFF_MS, this.backoff * 2);
    } finally {
      this.flushing = false;
      if (this.queue.length) this.scheduleFlush(this.nextTry > this.now() ? this.nextTry - this.now() : 5000);
    }
    return sent;
  }

  // Le joueur retire son accord : la file est vidée (rien ne part plus) ; les compteurs d'essais sont gardés.
  forget() { this.queue = []; this._saveQueue(); }
}
