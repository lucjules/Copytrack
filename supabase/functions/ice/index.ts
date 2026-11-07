// Copytrack : fonction serveur « ice » (serveurs STUN/TURN du multijoueur) (Supabase Edge Function).
// FICHIER GÉNÉRÉ par tools/build-function.mjs à partir de server.ts et du code du jeu :
// ne pas modifier à la main. À coller tel quel dans Supabase (Edge Functions).
// deno-lint-ignore-file
// @ts-nocheck
// supabase/functions/ice/handler.js
var DEFAULT_TTL_S = 6 * 3600;
var RATE_LIMIT = {
  max: 30,
  windowMs: 6e4
};
var DEFAULT_STUN = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302"
];
var b64 = (buf) => {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s);
};
async function coturnCredentials(secret, expiresAtS, subtle = globalThis.crypto.subtle) {
  const username = `${expiresAtS}:copytrack`;
  const key = await subtle.importKey("raw", new TextEncoder().encode(secret), {
    name: "HMAC",
    hash: "SHA-1"
  }, false, [
    "sign"
  ]);
  return {
    username,
    credential: b64(await subtle.sign("HMAC", key, new TextEncoder().encode(username)))
  };
}
function createIceHandler({ env = {}, fetch: fetchImpl = globalThis.fetch, now = Date.now, subtle = globalThis.crypto && globalThis.crypto.subtle, log = console.error } = {}) {
  const cors = {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin"
  };
  const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extra
    }
  });
  const ttl = Math.max(600, Math.min(86400, parseInt(env.ICE_TTL_S, 10) || DEFAULT_TTL_S));
  const list = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
  const hits = /* @__PURE__ */ new Map();
  const tooFast = (who) => {
    const t = now(), recent = (hits.get(who) || []).filter((x) => t - x < RATE_LIMIT.windowMs);
    if (recent.length >= RATE_LIMIT.max) {
      hits.set(who, recent);
      return true;
    }
    recent.push(t);
    hits.set(who, recent);
    if (hits.size > 2e3) for (const k of hits.keys()) {
      if (!(hits.get(k) || []).some((x) => t - x < RATE_LIMIT.windowMs)) hits.delete(k);
    }
    return false;
  };
  return async function handle(req) {
    if (req.method === "OPTIONS") return new Response("ok", {
      headers: cors
    });
    if (req.method !== "POST" && req.method !== "GET") return json(405, {
      error: "M\xE9thode non autoris\xE9e."
    });
    try {
      const who = (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "anon").split(",")[0].trim();
      if (tooFast(who)) return json(429, {
        error: "Trop de demandes."
      }, {
        "Retry-After": "60"
      });
      const stun = list(env.STUN_URLS).length ? list(env.STUN_URLS) : DEFAULT_STUN;
      if (env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN) {
        const r = await fetchImpl(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            ttl
          })
        });
        if (!r.ok) {
          log("ice: Cloudflare a r\xE9pondu", r.status);
          return json(502, {
            error: "Relais indisponible."
          });
        }
        const j = await r.json();
        const servers = Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [
          j.iceServers
        ] : [];
        return json(200, {
          iceServers: servers,
          ttl
        });
      }
      if (env.TURN_URLS && env.TURN_SECRET) {
        if (!subtle) return json(500, {
          error: "Erreur interne."
        });
        const cred = await coturnCredentials(env.TURN_SECRET, Math.floor(now() / 1e3) + ttl, subtle);
        return json(200, {
          iceServers: [
            {
              urls: stun
            },
            {
              urls: list(env.TURN_URLS),
              ...cred
            }
          ],
          ttl
        });
      }
      return json(501, {
        error: "Aucun relais TURN configur\xE9."
      });
    } catch (e) {
      log("ice: erreur interne", e);
      return json(500, {
        error: "Erreur interne."
      });
    }
  };
}

// supabase/functions/ice/server.ts
Deno.serve(createIceHandler({
  env: Deno.env.toObject()
}));
