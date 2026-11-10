// Copytrack : fonction serveur « ice » (serveurs STUN/TURN du multijoueur) (Supabase Edge Function).
// FICHIER GÉNÉRÉ par tools/build-function.mjs à partir de server.ts et du code du jeu :
// ne pas modifier à la main. À coller tel quel dans Supabase (Edge Functions).
// deno-lint-ignore-file
// @ts-nocheck
// supabase/functions/ice/handler.js
var DEFAULT_TTL_S = 2 * 3600;
var MAX_TTL_S = 6 * 3600;
var RATE_LIMIT = {
  max: 10,
  windowMs: 6e4,
  globalMax: 300,
  anonMax: 200
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
function createIceHandler({ env = {}, supabaseUrl = "", serviceKey = "", fetch: fetchImpl = globalThis.fetch, now = Date.now, subtle = globalThis.crypto && globalThis.crypto.subtle, log = console.error, allowAnonymous = false, rateLimit = RATE_LIMIT } = {}) {
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
  const ttl = Math.max(600, Math.min(MAX_TTL_S, parseInt(env.ICE_TTL_S, 10) || DEFAULT_TTL_S));
  const list = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
  const hits = /* @__PURE__ */ new Map();
  const tooFast = (who) => {
    const t = now(), recent = (hits.get(who) || []).filter((x) => t - x < rateLimit.windowMs);
    if (recent.length >= rateLimit.max) {
      hits.set(who, recent);
      return true;
    }
    recent.push(t);
    hits.set(who, recent);
    if (hits.size > 2e3) for (const k of hits.keys()) {
      if (!(hits.get(k) || []).some((x) => t - x < rateLimit.windowMs)) hits.delete(k);
    }
    return false;
  };
  let lastWarn = 0;
  async function sharedWait(uid, anon) {
    try {
      const r = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/rate_check`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          k: "ice",
          p: uid,
          max_hits: rateLimit.max,
          window_s: Math.round(rateLimit.windowMs / 1e3),
          global_max: rateLimit.globalMax,
          is_anon: anon,
          anon_max: rateLimit.anonMax
        })
      });
      if (!r.ok) throw new Error("rpc " + r.status);
      const n = await r.json();
      if (!Number.isInteger(n) || n < 0) throw new Error("r\xE9ponse inattendue");
      return {
        wait: n
      };
    } catch (e) {
      const t = now();
      if (t - lastWarn > 6e4) {
        lastWarn = t;
        log("ice : limite partag\xE9e indisponible (\xE9tape SQL 15 appliqu\xE9e ?) :", e && e.message);
      }
      return {
        down: true
      };
    }
  }
  return async function handle(req) {
    if (req.method === "OPTIONS") return new Response("ok", {
      headers: cors
    });
    if (req.method !== "POST" && req.method !== "GET") return json(405, {
      error: "M\xE9thode non autoris\xE9e."
    });
    try {
      let who = (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "anon").split(",")[0].trim();
      let anon = true;
      const configured = !!(supabaseUrl && serviceKey);
      if (!configured && !allowAnonymous) {
        log("ice : SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absentes : refus (la fonction ne s'ouvre jamais sans authentification)");
        return json(500, {
          error: "Fonction mal configur\xE9e."
        });
      }
      if (configured) {
        const ures = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
          headers: {
            Authorization: req.headers.get("Authorization") ?? "",
            apikey: serviceKey
          }
        });
        if (!ures.ok) return json(401, {
          error: "Non connect\xE9."
        });
        const user = await ures.json();
        const uid = String(user && user.id || "");
        if (!/^[0-9a-f-]{36}$/.test(uid)) return json(401, {
          error: "Non connect\xE9."
        });
        who = uid;
        anon = !!(user && user.is_anonymous === true);
      }
      if (tooFast(who)) return json(429, {
        error: "Trop de demandes."
      }, {
        "Retry-After": "60"
      });
      if (configured) {
        const shared = await sharedWait(who, anon);
        if (shared.down) return json(503, {
          error: "Service momentan\xE9ment indisponible."
        }, {
          "Retry-After": "30"
        });
        if (shared.wait) return json(429, {
          error: "Trop de demandes."
        }, {
          "Retry-After": String(shared.wait)
        });
      }
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
  env: Deno.env.toObject(),
  supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
}));
