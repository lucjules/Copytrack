// Copytrack : logique de la fonction serveur « submit-score » (sans rien de propre à Deno : elle se teste sous Node, voir tools/test-submit-handler.mjs).
//
// Reçoit une course terminée (clé du circuit, commandes enregistrées, temps), la REJOUE avec le vrai code du jeu (js/verify.js), et n'enregistre le
// temps que s'il est confirmé. server.ts n'est que le fil qui la branche sur Deno.serve ; `npm run build:function` regroupe le tout en un seul fichier.
//
// Deux actions : l'envoi d'une course (par défaut) et la PUBLICATION d'un circuit (action « publish-track », temps auteur rejoué par le serveur).
// GET : l'état du service (version de physique du serveur, limites) — la preuve observable de la version réellement déployée.
//
// Défenses, dans l'ordre : méthode, configuration, taille de la requête (avant de la lire), identité du pilote (jeton Supabase), cadence (le rejeu coûte du
// processeur), forme des données, rejeu de la course, profil du pilote, écriture ATOMIQUE en base (submit_best / publish_track). Les erreurs internes ne
// sont jamais renvoyées telles quelles. Prérequis : supabase/etape15-backend.sql (voir supabase/MIGRATIONS.md).
import { verifyRun, verifyPublish } from '../../../js/verify.js';
import { PHYS_VER } from '../../../js/version.js';
import { MAX_TRACK_CODE_CHARS, MAX_INPUTS_CHARS, MAX_RUN_SECONDS, MAX_PUBLISH_CHARS, MAX_PUBLISH_PIECES } from '../../../js/constants.js';

// Taille maximale d'une requête : les commandes + le code d'un circuit de joueur + le reste du JSON.
export const MAX_BODY_CHARS = MAX_INPUTS_CHARS + MAX_TRACK_CODE_CHARS + 4096;
// Cadence : au plus `max` courses soumises par pilote et par fenêtre (chaque soumission rejoue toute la course). DEUX niveaux :
//  - en base (supabase/etape15-backend.sql, rate_check) : persistant, partagé entre TOUTES les instances, atomique (un verrou par type) : c'est la vraie limite.
//    Le plafond global borne le processeur dépensé quoi qu'il arrive ; les sessions ANONYMES (gratuites) se partagent un sous-plafond (anonMax) pour ne pas
//    pouvoir épuiser le plafond global au détriment des comptes ;
//  - en mémoire de l'instance : un frein de première ligne, sans aller-retour réseau. Seule, elle ne suffit pas (une rafale répartie sur plusieurs instances
//    la contourne). Si la base ne répond pas, la requête est REFUSÉE (503) : on ne rejoue pas sans limite fiable.
export const RATE_LIMIT = { max: 8, windowMs: 60_000, globalMax: 600, anonMax: 400 };
// Taille maximale d'un fantôme enregistré (base64) : 60 000 poses de 28 octets = 2,2 Mo ; une vraie course en fait 100 Ko.
export const MAX_GHOST_CHARS = 800_000;


// Lecture PROGRESSIVE du corps de la requête avec une limite stricte en octets : la lecture s'arrête (et le flux est annulé) dès que la limite est dépassée,
// sans jamais tenir le corps entier en mémoire. L'en-tête Content-Length n'est qu'une indication (absent en transfert fragmenté, ou mensonger).
// Renvoie le texte, ou null si le corps dépasse `maxBytes`.
export async function readBodyLimited(req, maxBytes) {
  if (!req.body) { const t = await req.text(); return new TextEncoder().encode(t).length > maxBytes ? null : t; }
  const reader = req.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { try { await reader.cancel(); } catch { /* flux déjà fermé */ } return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.byteLength; }
  return new TextDecoder().decode(all);
}

// Formes acceptées (tout le reste est refusé avant le moindre calcul) : clé de circuit, commandes enregistrées (base64), version de physique.
const TRACK_KEY_RE = /^[A-Za-z0-9_~.:-]{1,80}$/;
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const sha256hex = async (text) => [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');
// Message d'une erreur PostgREST (raise exception … → { message }), pour distinguer les refus voulus des pannes.
const dbMessage = async (r) => { try { const j = JSON.parse(await r.text()); return String((j && j.message) || ''); } catch { return ''; } };

// Délai maximal d'un appel à Supabase (authentification, base) : au-delà, la requête est abandonnée et le joueur reçoit 503 (réessayer), au lieu de laisser la fonction
// pendre jusqu'à la limite de la plateforme avec un rejeu de course en attente. Le renvoi est sans danger : tout est idempotent (submit_best n'améliore que, publish_track
// met à jour la même signature).
export const UPSTREAM_TIMEOUT_MS = 8_000;
class Upstream extends Error {}      // Supabase injoignable, trop lent, ou réponse illisible : panne passagère (503), jamais « erreur interne » (500)

export function createHandler({ supabaseUrl, serviceKey, fetch: rawFetch = globalThis.fetch, allowedOrigin = '*', now = Date.now, rateLimit = RATE_LIMIT, log = console.error, upstreamTimeoutMs = UPSTREAM_TIMEOUT_MS }) {
  const fetchImpl = async (url, init = {}) => {
    try { return await rawFetch(url, { ...init, signal: AbortSignal.timeout(upstreamTimeoutMs) }); }
    catch (e) { throw new Upstream(e && e.message); }
  };
  const cors = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
  const json = (status, body, extra = {}) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });

  const db = (path, init = {}) =>
    fetchImpl(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  const rpc = (name, args) => db(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });

  const hits = new Map();       // pilote -> instants (ms) de ses dernières soumissions
  function tooFast(uid) {
    const t = now();
    const recent = (hits.get(uid) ?? []).filter((x) => t - x < rateLimit.windowMs);
    if (recent.length >= rateLimit.max) { hits.set(uid, recent); return Math.ceil((rateLimit.windowMs - (t - recent[0])) / 1000); }
    recent.push(t);
    hits.set(uid, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((x) => t - x < rateLimit.windowMs)) hits.delete(k);
    return 0;
  }

  // Limite partagée (base). Renvoie { wait } (secondes d'attente, 0 = accepté) ou { down: true } quand la base ne la tient pas (étape 15 absente, panne) :
  // FAIL-CLOSED, la requête est refusée plutôt que rejouée sans limite fiable. Journalisé une fois par minute au plus.
  let lastWarn = 0;
  async function sharedWait(uid, anon) {
    try {
      const r = await rpc('rate_check', {
        k: 'submit', p: uid, max_hits: rateLimit.max, window_s: Math.round(rateLimit.windowMs / 1000),
        global_max: rateLimit.globalMax ?? RATE_LIMIT.globalMax, is_anon: anon, anon_max: rateLimit.anonMax ?? RATE_LIMIT.anonMax,
      });
      if (!r.ok) throw new Error('rpc ' + r.status);
      const n = await r.json();
      if (!Number.isInteger(n) || n < 0) throw new Error('réponse inattendue');
      return { wait: n };
    } catch (e) {
      const t = now();
      if (t - lastWarn > 60_000) { lastWarn = t; log('submit-score : limite partagée indisponible (étape SQL 15 appliquée ?) :', e && e.message); }
      return { down: true };
    }
  }

  // Écritures : « Enregistrement impossible » = panne ; les refus voulus de la base (plafond, collision de circuit) ont leur message.
  async function failWrite(r, what) {
    const msg = await dbMessage(r);
    if (/Trop de temps enregistrés/.test(msg)) return json(422, { error: 'Limite de 2 000 temps enregistrés atteinte : efface d’anciens records pour en ajouter.', capReached: true });
    if (/Trop de publications/.test(msg)) return json(429, { error: msg }, { 'Retry-After': '3600' });
    if (/Trop de circuits publiés/.test(msg)) return json(422, { error: msg, trackCap: true });
    log('submit-score :', what, r.status, msg);
    return json(500, { error: 'Enregistrement impossible.' });
  }

  return async function handle(req) {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    // État du service : la version de physique que CE déploiement vérifie (sans authentification, rien de secret).
    if (req.method === 'GET') return json(200, { ok: true, service: 'submit-score', physVer: PHYS_VER, rate: { max: rateLimit.max, windowS: Math.round(rateLimit.windowMs / 1000), globalMax: rateLimit.globalMax, anonMax: rateLimit.anonMax }, actions: ['submit', 'publish-track'] });
    if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée.' });
    try {
      if (!supabaseUrl || !serviceKey) return json(500, { error: 'Fonction mal configurée (clés Supabase absentes).' });
      // 0. Taille : refusée avant d'être lue.
      const declared = Number(req.headers.get('content-length') ?? 0);
      if (declared > MAX_BODY_CHARS) return json(413, { error: 'Requête trop volumineuse.' });

      // 1. Pilote connecté (session anonyme du jeu ou compte).
      const ures = await fetchImpl(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: req.headers.get('Authorization') ?? '', apikey: serviceKey } });
      if (!ures.ok) return json(401, { error: 'Non connecté.' });
      let user;
      try { user = await ures.json(); } catch (e) { throw new Upstream(e && e.message); }
      const uid = String((user && user.id) ?? '');
      if (!/^[0-9a-f-]{36}$/.test(uid)) return json(401, { error: 'Non connecté.' });
      const anon = user.is_anonymous === true;

      // 2. Cadence : d'abord la mémoire de l'instance (gratuit), puis la base (persistante, partagée entre instances, atomique).
      let wait = tooFast(uid);
      if (!wait) {
        const shared = await sharedWait(uid, anon);
        if (shared.down) return json(503, { error: 'Service de scores momentanément indisponible : réessaie dans un instant.' }, { 'Retry-After': '30' });
        wait = shared.wait;
      }
      if (wait) return json(429, { error: `Trop de courses envoyées : réessaie dans ${wait} s.` }, { 'Retry-After': String(wait) });

      // 3. Données de la course.
      const text = await readBodyLimited(req, MAX_BODY_CHARS);
      if (text === null) return json(413, { error: 'Requête trop volumineuse.' });
      let body;
      try { body = JSON.parse(text); } catch { return json(400, { error: 'Requête invalide.' }); }
      const { action = 'submit', trackKey, code = '', inputs, time, physVer } = body ?? {};
      if (action !== 'submit' && action !== 'publish-track') return json(400, { error: 'Action inconnue.' });
      const publishing = action === 'publish-track';
      if ((!publishing && (typeof trackKey !== 'string' || !TRACK_KEY_RE.test(trackKey))) || typeof inputs !== 'string' || !inputs || inputs.length > MAX_INPUTS_CHARS || !BASE64_RE.test(inputs)
        || typeof time !== 'number' || !Number.isFinite(time) || time <= 0 || time > MAX_RUN_SECONDS || !Number.isInteger(physVer) || physVer < 0 || physVer > 100000) {
        return json(400, { error: 'Requête invalide.' });
      }
      if (typeof code !== 'string' || code.length > MAX_TRACK_CODE_CHARS) return json(400, { error: 'Code de circuit invalide.' });

      // 3 bis. Profil du pilote (contrôle peu coûteux, avant le rejeu).
      const profRes = await db(`players?id=eq.${uid}&select=id`);
      const prof = profRes.ok ? await profRes.json() : null;
      if (!Array.isArray(prof) || !prof.length) return json(400, { error: 'Profil pilote manquant.' });

      if (publishing) return await publish({ uid, body, code, inputs, time, physVer });

      // 4. Rejeu de la course avec le code du jeu.
      const res = verifyRun({ trackKey, code, inputs, time, physVer, withGhost: true });
      if (!res.ok || typeof res.time !== 'number') return json(422, { error: res.error ?? 'Course non confirmée.', ...(res.versionMismatch ? { versionMismatch: true, serverPhysVer: res.serverPhysVer ?? PHYS_VER } : {}) });
      const simTime = res.time;

      // 4 bis. Duel ou tournoi (supabase/etape12-competition.sql) : seulement les participants, pendant la compétition (lu en base).
      if (res.competition) {
        const { kind, id, base } = res.competition;
        const w = await rpc('competition_open', { kind, cid: id, p: uid, base });
        if (!w.ok) return json(422, { error: 'Compétitions indisponibles sur ce serveur (étape SQL 12).' });
        const why = await w.json();
        if (why !== '') return json(422, { error: typeof why === 'string' && why ? why : 'Compétition fermée.' });
      }

      // 5. Écriture ATOMIQUE du meilleur temps (supabase/etape15-backend.sql, submit_best) : lecture, comparaison et écriture dans une seule transaction
      //    verrouillée par pilote. Un temps moins bon, ou d'une physique plus ancienne, ne remplace jamais le record, même avec deux requêtes simultanées.
      //    Fantôme du record (jouable par les autres : il ne dévoile pas les commandes, donc ne permet pas de rejouer la course sous un autre nom) et temps
      //    intermédiaires : ceux de la course RETENUE. Circuit de joueur : empreinte forte liée à la clé (la signature du jeu n'a que 32 bits).
      const ghost = typeof res.ghost === 'string' && res.ghost.length <= MAX_GHOST_CHARS ? res.ghost : null;
      const splits = Array.isArray(res.splits) && res.splits.length <= 400 ? res.splits : null;
      const strong = typeof res.sigText === 'string' ? await sha256hex('copytrack-circuit-v1|' + res.sigText) : null;
      const w = await rpc('submit_best', {
        p: uid, tk: trackKey, t: simTime, inp: inputs, pv: physVer, tname: String(res.name ?? '').slice(0, 60),
        sp: splits, gh: ghost, gveh: ghost ? (res.ghostVeh ?? []) : null, strong,
      });
      if (!w.ok) return await failWrite(w, 'submit_best');
      const out = await w.json();
      if (out && out.status === 'collision') return json(409, { error: 'Ce code de circuit ne correspond pas au circuit déjà enregistré sous cette clé.', collision: true });
      if (!out || out.status !== 'ok') { log('submit-score : réponse submit_best inattendue', out); return json(500, { error: 'Enregistrement impossible.' }); }
      return json(200, { ok: true, improved: !!out.improved, best: out.best, rank: out.rank, total: out.total });
    } catch (e) {
      log('submit-score :', e);
      if (e instanceof Upstream) return json(503, { error: 'Service momentanément indisponible : réessaie dans un instant.' }, { 'Retry-After': '10' });
      return json(500, { error: 'Erreur interne.' });
    }
  };

  // Publication d'un circuit : la course de vérification de l'auteur est REJOUÉE sur ce code ; author_time = temps rejoué (jamais l'affirmation du client).
  async function publish({ uid, body, code, inputs, time, physVer }) {
    if (code.length > MAX_PUBLISH_CHARS) return json(413, { error: `Circuit trop gros (${code.length} / ${MAX_PUBLISH_CHARS} caractères).` });
    const res = verifyPublish({ code, inputs, time, physVer });
    if (!res.ok) return json(422, { error: res.error, ...(res.versionMismatch ? { versionMismatch: true, serverPhysVer: res.serverPhysVer ?? PHYS_VER } : {}) });
    if (res.pieces < 2 || res.pieces > MAX_PUBLISH_PIECES) return json(422, { error: `Circuit trop gros ou trop petit (${res.pieces} pièces, de 2 à ${MAX_PUBLISH_PIECES}).` });
    const clean = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
    const name = clean(body.name, 40) || clean(res.name, 40) || 'Sans titre';
    const desc = clean(body.description, 200);
    const decor = clean(res.decor, 20);
    const strong = await sha256hex('copytrack-circuit-v1|' + res.sigText);
    const w = await rpc('publish_track', { p: uid, nm: name, dc: decor, cd: code, sg: res.signature, atime: res.time, pc: res.pieces, lp: res.laps, ds: desc, strong });
    if (!w.ok) return await failWrite(w, 'publish_track');
    const out = await w.json();
    if (out && out.status === 'taken') return json(409, { error: 'Ce circuit est déjà publié par un autre pilote.', taken: true });
    if (out && out.status === 'collision') return json(409, { error: 'Ce code de circuit ne correspond pas au circuit déjà enregistré sous cette clé.', collision: true });
    if (!out || (out.status !== 'created' && out.status !== 'updated')) { log('submit-score : réponse publish_track inattendue', out); return json(500, { error: 'Publication impossible.' }); }
    return json(200, { ok: true, id: out.id, status: out.status, authorTime: res.time, authorVerified: true });
  }
}
