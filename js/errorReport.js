// Erreurs du jeu remontées au serveur (0.12.5), ANONYMES et seulement avec l'accord du joueur : le même accord que les statistiques
// (réglage `telemetry`, voir telemetry.js et la page Confidentialité). Elles servent à corriger les plantages que personne ne signale.
//
// Ce qui part, par erreur distincte : l'identifiant d'installation aléatoire des statistiques, la version du jeu et de la physique, le genre
// (erreur, promesse rejetée, boucle de jeu), le message NETTOYÉ (adresses, identifiants et e-mails remplacés), le fichier et la ligne du code
// du jeu, la famille de navigateur et « téléphone ou non », le nombre d'occurrences. Rien d'autre : ni pseudo, ni circuit, ni position.
// Une erreur venue d'ailleurs (extension du navigateur, script d'un autre site) est ignorée. File locale bornée ; lots de 20 (supabase/etape18).
import { VERSION, PHYS_VER } from './version.js';

export const ERR_QUEUE_KEY = 'errors.queue';
export const MAX_DISTINCT = 30;            // erreurs distinctes gardées au plus
export const ERR_BATCH = 20;               // par envoi (le serveur en accepte 20)
export const ERR_MAX_AGE_MS = 7 * 86400000;
const MIN_BACKOFF_MS = 60000, MAX_BACKOFF_MS = 6 * 3600000;

// Message lisible et sans donnée : adresses, identifiants (uuid, longues suites hexadécimales), e-mails remplacés ; blancs réduits ; 300 caractères.
export function cleanMessage(m) {
  return String(m == null ? '' : m)
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}/gi, '<email>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<id>')
    .replace(/\s+/g, ' ').trim().slice(0, 300) || '(sans message)';
}

// Fichier et ligne du code DU JEU : premier cadre de la pile qui vient de `origin` (chemin relatif, « js/race.js:12:3 ») ; '' sinon.
export function sourceOf(stack, origin, file = '', line = 0, col = 0) {
  const frames = [String(stack || ''), file ? `${file}:${line | 0}:${col | 0}` : ''].join('\n').split('\n');
  for (const f of frames) {
    const m = /(https?:\/\/[^\s()]+?):(\d+):(\d+)\)?\s*$/.exec(f.trim());
    if (!m || !origin || !m[1].startsWith(origin)) continue;
    const path = m[1].slice(origin.length).replace(/^\/+/, '').replace(/[?#].*$/, '');
    if (/^[\w./-]{1,150}$/.test(path)) return `${path}:${m[2]}:${m[3]}`;
  }
  return '';
}

export function browserInfo(ua = '') {
  const s = String(ua);
  const browser = /Edg\//.test(s) ? 'edge' : /Firefox\/|FxiOS\//.test(s) ? 'firefox' : /Chrome\/|CriOS\//.test(s) ? 'chrome' : /Safari\//.test(s) ? 'safari' : 'other';
  return { browser, mobile: /Mobi|Android|iPhone|iPad|iPod/.test(s) };
}

export class ErrorReport {
  // store : { get, set } ; send(lot) : Promise ; enabled() : accord du joueur ; install() : identifiant des statistiques ; origin : origine du site.
  constructor({ store, send, enabled = () => false, install = () => '', origin = '', userAgent = '', now = Date.now, schedule = (fn, ms) => setTimeout(fn, ms) } = {}) {
    this.store = store; this.sendBatch = send; this.enabled = enabled; this.install = install; this.origin = origin;
    this.env = browserInfo(userAgent); this.now = now; this.schedule = schedule;
    const q = store.get(ERR_QUEUE_KEY, []);
    this.queue = Array.isArray(q) ? q.filter((e) => e && typeof e === 'object' && typeof e.message === 'string') : [];
    this.flushing = false; this.nextTry = 0; this.backoff = MIN_BACKOFF_MS; this.timer = null;
  }

  // kind : 'error' | 'rejection' | 'loop'. err : une Error, ou un message. Renvoie vrai si l'erreur est gardée.
  capture(kind, err, { file = '', line = 0, col = 0 } = {}) {
    if (!this.enabled() || !['error', 'rejection', 'loop'].includes(kind)) return false;
    const raw = err && typeof err === 'object' ? (err.message || String(err)) : err;
    if (/^Script error\.?$/i.test(String(raw || '').trim())) return false;      // erreur d'un script d'un autre site : rien de lisible
    const source = sourceOf(err && err.stack, this.origin, file, line, col);
    if (!source && (file || (err && err.stack)) && kind !== 'loop') return false;      // vient d'ailleurs (extension, autre site)
    const message = cleanMessage(raw), key = `${kind}|${message}|${source}`;
    const found = this.queue.find((e) => e.key === key);
    if (found) { found.hits = Math.min(1000, found.hits + 1); found.ts = this.now(); }
    else {
      this.queue.push({ key, kind, message, source, hits: 1, ts: this.now() });
      if (this.queue.length > MAX_DISTINCT) this.queue.splice(0, this.queue.length - MAX_DISTINCT);
    }
    this.store.set(ERR_QUEUE_KEY, this.queue);
    this.scheduleFlush(10000);
    return true;
  }

  scheduleFlush(ms = 10000) {
    if (this.timer || !this.queue.length) return;
    this.timer = this.schedule(() => { this.timer = null; this.flush(); }, Math.max(ms, this.nextTry - this.now()));
  }

  // Envoie la file (deux lots au plus). Ne lève jamais d'erreur ; renvoie le nombre d'erreurs parties.
  async flush() {
    const inst = this.install();
    if (this.flushing || !this.enabled() || !this.queue.length || this.now() < this.nextTry || !/^[0-9a-f]{16}$/.test(inst || '')) return 0;
    this.flushing = true;
    let sent = 0;
    try {
      const old = this.now() - ERR_MAX_AGE_MS;
      this.queue = this.queue.filter((e) => (e.ts || 0) >= old);
      for (let round = 0; round < 2 && this.queue.length; round++) {
        const batch = this.queue.slice(0, ERR_BATCH);
        await this.sendBatch(batch.map((e) => ({ install: inst, version: VERSION, pv: PHYS_VER, kind: e.kind, message: e.message, source: e.source,
          browser: this.env.browser, mobile: this.env.mobile, hits: e.hits })));
        this.queue.splice(0, batch.length);
        sent += batch.length;
        this.backoff = MIN_BACKOFF_MS;
      }
    } catch {
      this.nextTry = this.now() + this.backoff;
      this.backoff = Math.min(MAX_BACKOFF_MS, this.backoff * 2);
    } finally {
      this.store.set(ERR_QUEUE_KEY, this.queue);
      this.flushing = false;
    }
    return sent;
  }

  // Le joueur retire son accord : la file est vidée.
  forget() { this.queue = []; this.store.set(ERR_QUEUE_KEY, []); }
}
