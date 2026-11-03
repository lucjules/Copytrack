// Copytrack : fonction serveur « submit-score » (Supabase Edge Function, Deno).
//
// Reçoit une course terminée (clé du circuit, commandes enregistrées, temps), la REJOUE
// avec le vrai code du jeu, et n'enregistre le temps que s'il est confirmé.
// Le code du jeu est chargé depuis le site publié (GAME_URL), donc toujours à jour.
// La clé secrète (SUPABASE_SERVICE_ROLE_KEY) est fournie automatiquement par Supabase
// à la fonction : elle n'apparaît nulle part dans le jeu.

const GAME_URL = Deno.env.get('GAME_URL') ?? 'https://lucjules.github.io/Copytrack';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// deno-lint-ignore no-explicit-any
let game: any = null;
async function loadGame() {
  if (!game) game = await import(`${GAME_URL}/js/verify.js`);
  return game;
}

const db = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });

async function count(query: string): Promise<number> {
  const r = await db(`scores?${query}&select=player`, { headers: { Prefer: 'count=exact', Range: '0-0' } });
  const range = r.headers.get('content-range') ?? '*/0';
  return parseInt(range.split('/')[1] ?? '0', 10) || 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée.' });
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'Fonction mal configurée (clés Supabase absentes).' });
    // 1. Pilote connecté (session anonyme du jeu).
    const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: req.headers.get('Authorization') ?? '', apikey: SERVICE_KEY },
    });
    if (!ures.ok) return json(401, { error: 'Non connecté.' });
    const user = await ures.json();
    const uid = String(user.id ?? '');
    if (!/^[0-9a-f-]{36}$/.test(uid)) return json(401, { error: 'Non connecté.' });

    // 2. Données de la course.
    const body = await req.json();
    const { trackKey, code = '', inputs, time, physVer } = body ?? {};
    if (typeof trackKey !== 'string' || trackKey.length > 80 || typeof inputs !== 'string' || typeof time !== 'number' || typeof physVer !== 'number') {
      return json(400, { error: 'Requête invalide.' });
    }
    if (typeof code !== 'string' || code.length > 100000) return json(400, { error: 'Code de circuit invalide.' });

    // 3. Rejeu de la course avec le code du jeu.
    const v = await loadGame();
    const res = v.verifyRun({ trackKey, code, inputs, time, physVer });
    if (!res.ok) return json(422, { error: res.error });

    // 4. Le profil du pilote doit exister.
    const prof = await (await db(`players?id=eq.${uid}&select=id`)).json();
    if (!Array.isArray(prof) || !prof.length) return json(400, { error: 'Profil pilote manquant.' });

    // 5. On garde le meilleur temps du pilote sur ce circuit.
    const key = encodeURIComponent(trackKey);
    const prev = await (await db(`scores?track_key=eq.${key}&player=eq.${uid}&select=time,phys_ver`)).json();
    let best = res.time;
    let improved = true;
    if (Array.isArray(prev) && prev.length && prev[0].phys_ver === physVer && prev[0].time <= res.time) {
      best = prev[0].time;
      improved = false;
    }
    if (improved) {
      const up = await db('scores', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          track_key: trackKey, player: uid, time: res.time, inputs, phys_ver: physVer,
          track_name: String(res.name ?? '').slice(0, 60), updated_at: new Date().toISOString(),
        }),
      });
      if (!up.ok) return json(500, { error: 'Enregistrement impossible.' });
    }

    // 6. Place au classement (même version de physique).
    const base = `track_key=eq.${key}&phys_ver=eq.${physVer}`;
    const before = await count(`${base}&time=lt.${best}`);
    const total = await count(base);
    return json(200, { ok: true, improved, best, rank: before + 1, total });
  } catch (e) {
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});
