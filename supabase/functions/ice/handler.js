// Copytrack : logique de la fonction serveur « ice » (sans rien de propre à Deno : elle se teste sous Node, voir tools/test-ice.mjs).
//
// Donne au jeu les serveurs STUN et un relais TURN à identifiants à DURÉE LIMITÉE (quelques heures), pour que le multijoueur passe aussi dans les réseaux fermés
// (entreprise, 4G à NAT symétrique : 10 à 20 % des paires sans relais). Aucun identifiant permanent n'est lisible dans le jeu : ils expirent seuls.
//
// Deux fournisseurs, au choix (variables d'environnement de la fonction) :
//   Cloudflare Realtime TURN : TURN_KEY_ID + TURN_KEY_API_TOKEN (le relais fabrique les identifiants) ;
//   coturn auto-hébergé      : TURN_URLS (séparées par des virgules, ex. turn:turn.exemple.fr:3478?transport=udp,turns:turn.exemple.fr:5349) + TURN_SECRET
//                              (la valeur de « static-auth-secret » de coturn : identifiants au format « REST API » = horodatage d'expiration + HMAC-SHA1).
// Facultatifs : STUN_URLS (par défaut les STUN publics de Google), ICE_TTL_S (durée de vie, 6 h par défaut), ALLOWED_ORIGIN.
// Rien de configuré : 501, et le jeu garde son STUN par défaut. Les erreurs internes ne sont jamais renvoyées telles quelles.
export const DEFAULT_TTL_S = 6 * 3600;
export const RATE_LIMIT = { max: 30, windowMs: 60_000 };
const DEFAULT_STUN = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];

const b64 = (buf) => { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s); };

// Identifiants coturn « REST API » : nom = « <expiration en secondes>:copytrack », mot de passe = base64(HMAC-SHA1(secret, nom)).
export async function coturnCredentials(secret, expiresAtS, subtle = globalThis.crypto.subtle) {
  const username = `${expiresAtS}:copytrack`;
  const key = await subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  return { username, credential: b64(await subtle.sign('HMAC', key, new TextEncoder().encode(username))) };
}

export function createIceHandler({ env = {}, fetch: fetchImpl = globalThis.fetch, now = Date.now, subtle = globalThis.crypto && globalThis.crypto.subtle, log = console.error } = {}) {
  const cors = {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
  const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });
  const ttl = Math.max(600, Math.min(86400, parseInt(env.ICE_TTL_S, 10) || DEFAULT_TTL_S));
  const list = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
  const hits = new Map();

  const tooFast = (who) => {
    const t = now(), recent = (hits.get(who) || []).filter((x) => t - x < RATE_LIMIT.windowMs);
    if (recent.length >= RATE_LIMIT.max) { hits.set(who, recent); return true; }
    recent.push(t); hits.set(who, recent);
    if (hits.size > 2000) for (const k of hits.keys()) { if (!(hits.get(k) || []).some((x) => t - x < RATE_LIMIT.windowMs)) hits.delete(k); }
    return false;
  };

  return async function handle(req) {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST' && req.method !== 'GET') return json(405, { error: 'Méthode non autorisée.' });
    try {
      const who = (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'anon').split(',')[0].trim();
      if (tooFast(who)) return json(429, { error: 'Trop de demandes.' }, { 'Retry-After': '60' });
      const stun = list(env.STUN_URLS).length ? list(env.STUN_URLS) : DEFAULT_STUN;

      if (env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN) {
        const r = await fetchImpl(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`, {
          method: 'POST', headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl }),
        });
        if (!r.ok) { log('ice: Cloudflare a répondu', r.status); return json(502, { error: 'Relais indisponible.' }); }
        const j = await r.json();
        const servers = Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : [];
        return json(200, { iceServers: servers, ttl });
      }
      if (env.TURN_URLS && env.TURN_SECRET) {
        if (!subtle) return json(500, { error: 'Erreur interne.' });
        const cred = await coturnCredentials(env.TURN_SECRET, Math.floor(now() / 1000) + ttl, subtle);
        return json(200, { iceServers: [{ urls: stun }, { urls: list(env.TURN_URLS), ...cred }], ttl });
      }
      return json(501, { error: 'Aucun relais TURN configuré.' });
    } catch (e) {
      log('ice: erreur interne', e);
      return json(500, { error: 'Erreur interne.' });
    }
  };
}
