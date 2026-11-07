// Serveurs ICE du multijoueur : STUN (gratuit) + relais TURN (réseaux fermés : entreprise, 4G à NAT symétrique), demandés à la fonction serveur « ice »
// (supabase/functions/ice) qui fabrique des identifiants à DURÉE LIMITÉE : rien de permanent n'est lisible dans le jeu.
//
// Jamais bloquant : sans réponse rapide ou valide, on retombe sur la liste fixe (STUN seul) de config.js. La réponse est gardée en mémoire jusqu'aux 3/4 de sa
// durée de vie ; un échec n'est pas retenté avant 10 minutes (le jeu n'attend pas à chaque salle une fonction qui n'est pas déployée).
import { CONFIG } from '../config.js';

export const MAX_ICE_SERVERS = 6;
export const MAX_URLS_PER_SERVER = 6;
const FAIL_RETRY_MS = 10 * 60000;
const MAX_TTL_S = 86400, MIN_TTL_S = 300;
const URL_RE = /^(stun|stuns|turn|turns):[A-Za-z0-9.\-_[\]:]+(\?transport=(udp|tcp))?$/;

// Données venues du réseau : on ne garde que des serveurs STUN/TURN bien formés (jamais d'autre schéma d'URL), en nombre borné.
export function sanitizeIce(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const s of list.slice(0, MAX_ICE_SERVERS)) {
    if (!s || typeof s !== 'object') continue;
    const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => typeof u === 'string' && u.length <= 200 && URL_RE.test(u)).slice(0, MAX_URLS_PER_SERVER);
    if (!urls.length) continue;
    const turn = urls.some((u) => /^turns?:/.test(u));
    if (turn && !(typeof s.username === 'string' && typeof s.credential === 'string' && s.username.length <= 200 && s.credential.length <= 400)) continue;    // un relais sans identifiants ne sert à rien
    out.push(turn ? { urls, username: s.username, credential: s.credential } : { urls });
  }
  return out;
}

// Fabrique le chargeur : () => Promise<serveurs>. Les paramètres servent aux tests.
export function createIceLoader({ url = CONFIG.iceUrl, key = CONFIG.supabase.key, fallback = CONFIG.iceServers, fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 2000 } = {}) {
  let cache = null, failedAt = -Infinity, pending = null;
  const fetchOnce = async () => {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const r = await fetchImpl(url, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: '{}', ...(ctl ? { signal: ctl.signal } : {}) });
      if (!r.ok) throw new Error('ice ' + r.status);
      const j = await r.json();
      const servers = sanitizeIce(j && j.iceServers);
      if (!servers.length) throw new Error('ice vide');
      const ttl = Math.max(MIN_TTL_S, Math.min(MAX_TTL_S, +j.ttl || 3600));
      cache = { servers: [...servers, ...sanitizeIce(fallback).filter((f) => !servers.some((s) => JSON.stringify(s.urls) === JSON.stringify(f.urls)))].slice(0, MAX_ICE_SERVERS), until: now() + ttl * 750 };
      return cache.servers;
    } finally { if (timer) clearTimeout(timer); }
  };
  return async function loadIceServers() {
    if (!url) return fallback;
    if (cache && now() < cache.until) return cache.servers;
    if (now() - failedAt < FAIL_RETRY_MS) return fallback;
    if (!pending) pending = fetchOnce().catch(() => { failedAt = now(); return fallback; }).finally(() => { pending = null; });
    return pending;
  };
}
