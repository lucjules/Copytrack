// Fabrique le fantôme des records déjà enregistrés AVANT supabase/etape7-fantomes.sql (has_ghost = false) : rejoue leur course et range les poses.
// Seuls le top 10 de chaque circuit intégré compte (c'est tout ce que le jeu propose d'affronter).
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=… node tools/backfill-ghosts.mjs [--dry]
// La clé de SERVICE donne accès aux commandes enregistrées : à lancer sur ta machine, jamais dans le jeu ni dans un dépôt.
// (Sans cet outil, un record reçoit son fantôme quand son auteur renvoie le même temps, ou le bat.)
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { hashString } from '../js/track.js';
import { verifyRun } from '../js/verify.js';
import { PHYS_VER } from '../js/version.js';

export async function backfill({ url, key, fetchImpl = globalThis.fetch, dry = false, log = console.log, tracks = BUILTIN_TRACKS } = {}) {
  const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  let done = 0, skipped = 0, failed = 0;
  for (const def of tracks) {
    const trackKey = `b-${def.id}-${hashString(buildBuiltin(def).encode())}`;
    const q = `track_key=eq.${encodeURIComponent(trackKey)}&phys_ver=eq.${PHYS_VER}&order=time.asc,updated_at.asc&limit=10&select=player,time,inputs,has_ghost`;
    const r = await fetchImpl(`${url}/rest/v1/scores?${q}`, { headers: H });
    if (!r.ok) throw new Error(`Lecture impossible (${r.status}) : l'étape 7 est-elle lancée ?`);
    for (const row of await r.json()) {
      if (row.has_ghost !== false) { skipped++; continue; }
      const res = verifyRun({ trackKey, inputs: row.inputs, time: row.time, physVer: PHYS_VER, withGhost: true });
      if (!res.ok) { failed++; log(`  ✕ ${def.id} ${row.player} : ${res.error}`); continue; }
      if (!dry) {
        const p = await fetchImpl(`${url}/rest/v1/scores?track_key=eq.${encodeURIComponent(trackKey)}&player=eq.${row.player}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ ghost: res.ghost, ghost_veh: res.ghostVeh }) });
        if (!p.ok) { failed++; log(`  ✕ ${def.id} ${row.player} : écriture refusée (${p.status})`); continue; }
      }
      done++; log(`  ✓ ${def.id} ${row.player} ${row.time.toFixed(3)} s${dry ? ' (essai à blanc)' : ''}`);
    }
  }
  return { done, skipped, failed };
}

if (process.argv[1] && process.argv[1].endsWith('backfill-ghosts.mjs')) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.log('usage : SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node tools/backfill-ghosts.mjs [--dry]'); process.exit(1); }
  const r = await backfill({ url, key, dry: process.argv.includes('--dry') });
  console.log(`${r.done} fantôme(s) fabriqué(s), ${r.skipped} déjà présent(s), ${r.failed} échec(s).`);
  process.exit(r.failed ? 1 : 0);
}
