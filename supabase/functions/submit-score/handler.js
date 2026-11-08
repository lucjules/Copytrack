// Copytrack : logique de la fonction serveur « submit-score » (sans rien de propre à Deno : elle se teste sous Node, voir tools/test-submit-handler.mjs).
//
// Reçoit une course terminée (clé du circuit, commandes enregistrées, temps), la REJOUE avec le vrai code du jeu (js/verify.js), et n'enregistre le
// temps que s'il est confirmé. server.ts n'est que le fil qui la branche sur Deno.serve ; `npm run build:function` regroupe le tout en un seul fichier.
//
// Défenses, dans l'ordre : méthode, configuration, taille de la requête (avant de la lire), identité du pilote (jeton Supabase), cadence par pilote
// (le rejeu coûte du processeur), forme des données, rejeu de la course, profil du pilote. Les erreurs internes ne sont jamais renvoyées telles quelles.
import { verifyRun } from '../../../js/verify.js';
import { MAX_TRACK_CODE_CHARS, MAX_INPUTS_CHARS } from '../../../js/constants.js';

// Taille maximale d'une requête : les commandes + le code d'un circuit de joueur + le reste du JSON.
export const MAX_BODY_CHARS = MAX_INPUTS_CHARS + MAX_TRACK_CODE_CHARS + 4096;
// Cadence : au plus `max` courses soumises par pilote et par fenêtre (chaque soumission rejoue toute la course). La mémoire est celle de l'instance de la
// fonction : c'est un frein contre les rafales, pas un quota exact (les instances sont indépendantes).
export const RATE_LIMIT = { max: 8, windowMs: 60_000 };
// Taille maximale d'un fantôme enregistré (base64) : 60 000 poses de 28 octets = 2,2 Mo ; une vraie course en fait 100 Ko.
export const MAX_GHOST_CHARS = 800_000;

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

      // 2. Cadence.
      const wait = tooFast(uid);
      if (wait) return json(429, { error: `Trop de courses envoyées : réessaie dans ${wait} s.` }, { 'Retry-After': String(wait) });

      // 3. Données de la course.
      const text = await req.text();
      if (text.length > MAX_BODY_CHARS) return json(413, { error: 'Requête trop volumineuse.' });
      let body;
      try { body = JSON.parse(text); } catch { return json(400, { error: 'Requête invalide.' }); }
      const { trackKey, code = '', inputs, time, physVer } = body ?? {};
      if (typeof trackKey !== 'string' || trackKey.length > 80 || typeof inputs !== 'string' || typeof time !== 'number' || !Number.isFinite(time) || !Number.isInteger(physVer)) {
        return json(400, { error: 'Requête invalide.' });
      }
      if (typeof code !== 'string' || code.length > MAX_TRACK_CODE_CHARS) return json(400, { error: 'Code de circuit invalide.' });

      // 4. Rejeu de la course avec le code du jeu.
      const res = verifyRun({ trackKey, code, inputs, time, physVer, withGhost: true });
      if (!res.ok || typeof res.time !== 'number') return json(422, { error: res.error ?? 'Course non confirmée.', ...(res.versionMismatch ? { versionMismatch: true } : {}) });
      const simTime = res.time;

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
