// Copytrack : logique de la fonction serveur « submit-score » (sans rien de propre à Deno : elle se teste sous Node, voir tools/test-submit-handler.mjs).
//
// Reçoit une course terminée (clé du circuit, commandes enregistrées, temps), la REJOUE avec le vrai code du jeu (js/verify.js), et n'enregistre le
// temps que s'il est confirmé. server.ts n'est que le fil qui la branche sur Deno.serve ; `npm run build:function` regroupe le tout en un seul fichier.
//
// Défenses, dans l'ordre : méthode, configuration, taille de la requête (avant de la lire), identité du pilote (jeton Supabase), cadence par pilote
// (le rejeu coûte du processeur), forme des données, rejeu de la course, profil du pilote. Les erreurs internes ne sont jamais renvoyées telles quelles.
import { verifyRun } from '../../../js/verify.js';
import { MAX_TRACK_CODE_CHARS, MAX_INPUTS_CHARS, MAX_RUN_SECONDS } from '../../../js/constants.js';

// Taille maximale d'une requête : les commandes + le code d'un circuit de joueur + le reste du JSON.
export const MAX_BODY_CHARS = MAX_INPUTS_CHARS + MAX_TRACK_CODE_CHARS + 4096;
// Cadence : au plus `max` courses soumises par pilote et par fenêtre (chaque soumission rejoue toute la course). DEUX niveaux :
//  - en base (supabase/etape14-securite.sql, submit_rate_check) : partagé entre TOUTES les instances de la fonction, atomique : c'est la vraie limite ;
//  - en mémoire de l'instance : un frein de première ligne, sans aller-retour réseau, qui protège aussi quand la base ne répond pas ou que l'étape 14 n'est
//    pas installée. Seule, la mémoire ne suffit pas (chaque instance a la sienne : une rafale répartie sur plusieurs instances la contourne).
export const RATE_LIMIT = { max: 8, windowMs: 60_000, globalMax: 600 };      // globalMax : rejeux par fenêtre, tous pilotes confondus (en base)
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

export function createHandler({ supabaseUrl, serviceKey, fetch: fetchImpl = globalThis.fetch, allowedOrigin = '*', now = Date.now, rateLimit = RATE_LIMIT, log = console.error }) {
  const cors = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  const json = (status, body, extra = {}) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });

  const db = (path, init = {}) =>
    fetchImpl(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });

  async function count(query) {
    const r = await db(`scores?${query}&select=player`, { headers: { Prefer: 'count=exact', Range: '0-0' } });
    const range = r.headers.get('content-range') ?? '*/0';
    return parseInt(range.split('/')[1] ?? '0', 10) || 0;
  }

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

  // Limite partagée (base). Renvoie les secondes d'attente (0 = accepté). Si la base ne répond pas ou si l'étape 14 n'est pas installée, on ne bloque pas
  // les pilotes honnêtes (la limite en mémoire reste en place) ; l'indisponibilité est journalisée une fois par minute au plus.
  let lastWarn = 0;
  async function sharedWait(uid) {
    try {
      const r = await db('rpc/submit_rate_check', { method: 'POST', body: JSON.stringify({ p: uid, max_hits: rateLimit.max, window_s: Math.round(rateLimit.windowMs / 1000), global_max: rateLimit.globalMax ?? RATE_LIMIT.globalMax }) });
      if (!r.ok) throw new Error('rpc ' + r.status);
      const n = await r.json();
      return Number.isInteger(n) && n > 0 ? n : 0;
    } catch (e) {
      const t = now();
      if (t - lastWarn > 60_000) { lastWarn = t; log('submit-score : limite partagée indisponible (étape SQL 14 ?) :', e && e.message); }
      return 0;
    }
  }

  return async function handle(req) {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée.' });
    try {
      if (!supabaseUrl || !serviceKey) return json(500, { error: 'Fonction mal configurée (clés Supabase absentes).' });
      // 0. Taille : refusée avant d'être lue.
      const declared = Number(req.headers.get('content-length') ?? 0);
      if (declared > MAX_BODY_CHARS) return json(413, { error: 'Requête trop volumineuse.' });

      // 1. Pilote connecté (session anonyme du jeu ou compte).
      const ures = await fetchImpl(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: req.headers.get('Authorization') ?? '', apikey: serviceKey } });
      if (!ures.ok) return json(401, { error: 'Non connecté.' });
      const user = await ures.json();
      const uid = String(user.id ?? '');
      if (!/^[0-9a-f-]{36}$/.test(uid)) return json(401, { error: 'Non connecté.' });

      // 2. Cadence : d'abord la mémoire de l'instance (gratuit), puis la base (partagée entre instances).
      let wait = tooFast(uid);
      if (!wait) wait = await sharedWait(uid);
      if (wait) return json(429, { error: `Trop de courses envoyées : réessaie dans ${wait} s.` }, { 'Retry-After': String(wait) });

      // 3. Données de la course.
      const text = await readBodyLimited(req, MAX_BODY_CHARS);
      if (text === null) return json(413, { error: 'Requête trop volumineuse.' });
      let body;
      try { body = JSON.parse(text); } catch { return json(400, { error: 'Requête invalide.' }); }
      const { trackKey, code = '', inputs, time, physVer } = body ?? {};
      if (typeof trackKey !== 'string' || !TRACK_KEY_RE.test(trackKey) || typeof inputs !== 'string' || !inputs || inputs.length > MAX_INPUTS_CHARS || !BASE64_RE.test(inputs)
        || typeof time !== 'number' || !Number.isFinite(time) || time <= 0 || time > MAX_RUN_SECONDS || !Number.isInteger(physVer) || physVer < 0 || physVer > 100000) {
        return json(400, { error: 'Requête invalide.' });
      }
      if (typeof code !== 'string' || code.length > MAX_TRACK_CODE_CHARS) return json(400, { error: 'Code de circuit invalide.' });

      // 4. Rejeu de la course avec le code du jeu.
      const res = verifyRun({ trackKey, code, inputs, time, physVer, withGhost: true });
      if (!res.ok || typeof res.time !== 'number') return json(422, { error: res.error ?? 'Course non confirmée.', ...(res.versionMismatch ? { versionMismatch: true } : {}) });
      const simTime = res.time;

      // 4 bis. Duel ou tournoi (supabase/etape12-competition.sql) : seulement les participants, pendant la compétition (lu en base).
      if (res.competition) {
        const { kind, id, base } = res.competition;
        const w = await db('rpc/competition_open', { method: 'POST', body: JSON.stringify({ kind, cid: id, p: uid, base }) });
        if (!w.ok) return json(422, { error: 'Compétitions indisponibles sur ce serveur (étape SQL 12).' });
        const why = await w.json();
        if (why !== '') return json(422, { error: typeof why === 'string' && why ? why : 'Compétition fermée.' });
      }

      // 5. Le profil du pilote doit exister.
      const prof = await (await db(`players?id=eq.${uid}&select=id`)).json();
      if (!Array.isArray(prof) || !prof.length) return json(400, { error: 'Profil pilote manquant.' });

      // 6. On garde le meilleur temps du pilote sur ce circuit.
      const key = encodeURIComponent(trackKey);
      // (has_ghost : colonne de supabase/etape7-fantomes.sql ; absente, la requête échoue et on retombe sur la lecture sans elle.)
      let prevRes = await db(`scores?track_key=eq.${key}&player=eq.${uid}&select=time,phys_ver,has_ghost`);
      if (!prevRes.ok) prevRes = await db(`scores?track_key=eq.${key}&player=eq.${uid}&select=time,phys_ver`);
      const prev = await prevRes.json();
      let best = simTime;
      let improved = true;
      if (Array.isArray(prev) && prev.length && prev[0].phys_ver === physVer && prev[0].time <= simTime) {
        best = prev[0].time;
        improved = false;
      }
      // Fantôme du record (jouable par les autres : il ne dévoile pas les commandes, donc ne permet pas de rejouer la course sous un autre nom).
      const ghost = typeof res.ghost === 'string' && res.ghost.length <= MAX_GHOST_CHARS ? { ghost: res.ghost, ghost_veh: res.ghostVeh ?? [] } : null;
      // Un record déjà enregistré sans fantôme (avant l'étape 7) en reçoit un quand le même temps est renvoyé.
      const backfill = !improved && ghost && prev[0].has_ghost === false && Math.abs(prev[0].time - simTime) < 1e-6;
      if (improved) {
        const row = {
          track_key: trackKey, player: uid, time: simTime, inputs, phys_ver: physVer,
          track_name: String(res.name ?? '').slice(0, 60), updated_at: new Date(now()).toISOString(),
        };
        // Temps intermédiaires (supabase/etape9-secteurs.sql) : classements par secteur.
        const splits = Array.isArray(res.splits) && res.splits.length <= 400 ? { splits: res.splits } : {};
        const post = (r) => db('scores', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(r) });
        let up = await post({ ...row, ...splits, ...(ghost || {}) });
        // Colonnes récentes absentes (étapes 7 ou 9 pas encore lancées) : le temps est enregistré quand même, avec ce que la base sait ranger.
        if (!up.ok && up.status === 400 && ghost && splits.splits) up = await post({ ...row, ...ghost });
        if (!up.ok && up.status === 400 && (ghost || splits.splits)) up = await post(row);
        if (!up.ok) return json(500, { error: 'Enregistrement impossible.' });
      } else if (backfill) {
        await db(`scores?track_key=eq.${key}&player=eq.${uid}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(ghost) });
      }
      // Un record renvoyé à l'identique reçoit ses temps intermédiaires s'il n'en avait pas (records d'avant l'étape 9) ; sans la colonne, rien ne se passe.
      if (!improved && Array.isArray(res.splits) && res.splits.length && res.splits.length <= 400 && Math.abs(prev[0].time - simTime) < 1e-6) {
        await db(`scores?track_key=eq.${key}&player=eq.${uid}&splits=is.null`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ splits: res.splits }) });
      }

      // 7. Place au classement (même version de physique).
      const base = `track_key=eq.${key}&phys_ver=eq.${physVer}`;
      const before = await count(`${base}&time=lt.${best}`);
      const total = await count(base);
      return json(200, { ok: true, improved, best, rank: before + 1, total });
    } catch (e) {
      log('submit-score :', e);
      return json(500, { error: 'Erreur interne.' });
    }
  };
}
