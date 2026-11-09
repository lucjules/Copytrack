// Range les TEMPS INTERMÉDIAIRES des records enregistrés AVANT supabase/etape9-secteurs.sql (splits vide) : rejoue leur course et garde ses passages,
// pour les classements par secteur. Circuits de la carrière, défis du jour encore vérifiables et catégories : toutes les lignes sans temps intermédiaires.
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=… node tools/backfill-sectors.mjs [--dry]
// La clé de SERVICE donne accès aux commandes enregistrées : à lancer sur ta machine, jamais dans le jeu ni dans un dépôt.
// (Sans cet outil, un record reçoit ses temps intermédiaires quand son auteur renvoie le même temps, ou le bat.)
import { verifyRun } from '../js/verify.js';
import { PHYS_VER } from '../js/version.js';

export async function backfillSectors({ url, key, fetchImpl = globalThis.fetch, dry = false, log = console.log, pageSize = 200 } = {}) {
  const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  let done = 0, failed = 0, offset = 0;
  for (;;) {
    const q = `phys_ver=eq.${PHYS_VER}&splits=is.null&order=track_key.asc,player.asc&limit=${pageSize}&offset=${offset}&select=track_key,player,time,inputs`;
    const r = await fetchImpl(`${url}/rest/v1/scores?${q}`, { headers: H });
    if (!r.ok) throw new Error(`Lecture impossible (${r.status}) : l'étape 9 est-elle lancée ?`);
    const rows = await r.json();
    if (!rows.length) break;
    for (const row of rows) {
      // Les circuits de joueur demandent leur code (dans la table tracks) : on ne les traite pas ici ; ils se rempliront au prochain envoi.
      if (row.track_key.startsWith('u-')) { offset++; continue; }
      const res = verifyRun({ trackKey: row.track_key, inputs: row.inputs, time: row.time, physVer: PHYS_VER });
      if (!res.ok || !Array.isArray(res.splits)) { failed++; offset++; log(`  ✕ ${row.track_key} ${row.player} : ${res.error || 'pas de temps intermédiaires'}`); continue; }
      if (!dry) {
        const p = await fetchImpl(`${url}/rest/v1/scores?track_key=eq.${encodeURIComponent(row.track_key)}&player=eq.${row.player}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ splits: res.splits }) });
        if (!p.ok) { failed++; offset++; log(`  ✕ ${row.track_key} ${row.player} : écriture refusée (${p.status})`); continue; }
      } else offset++;
      done++; log(`  ✓ ${row.track_key} ${row.player} : ${res.splits.length} passage(s)${dry ? ' (essai à blanc)' : ''}`);
    }
  }
  return { done, failed };
}

if (process.argv[1] && process.argv[1].endsWith('backfill-sectors.mjs')) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.log('usage : SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node tools/backfill-sectors.mjs [--dry]'); process.exit(1); }
  const r = await backfillSectors({ url, key, dry: process.argv.includes('--dry') });
  console.log(`${r.done} record(s) complété(s), ${r.failed} échec(s).`);
  process.exit(r.failed ? 1 : 0);
}
