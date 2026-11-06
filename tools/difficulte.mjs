// Courbe de difficulté des 66 circuits : node tools/difficulte.mjs [--json]
// Un indice de difficulté est calculé sur la course du pilote automatique (virages serrés, très grands virages, murs, loopings, sauts,
// freinages, vitesse, longueur) ; il sert à contrôler que les étoiles écrites (difficulty) montent bien dans chaque chapitre.
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { runTrack, profile } from './lab.mjs';

export function indice(def) {
  const tr = buildBuiltin(def), S = runTrack(tr), P = profile(tr, S);
  const obst = (def.obst || []).length;
  const v = P.tight * 1.0 + P.wide * 0.6 + P.wallCells * 0.25 + P.loops * 1.2 + S.jumps * 1.5 + Math.max(0, P.heightRange - 6) * 0.15
    + P.brakePct * 0.08 + P.over250 * 6 + S.time * 0.05 + obst * 0.5 + (def.pilot && def.pilot.vCap > 66 ? 1 : 0);
  return { v: +v.toFixed(1), time: S.time, P };
}

if (process.argv[1] && process.argv[1].endsWith('difficulte.mjs')) {
  const rows = BUILTIN_TRACKS.map((d, i) => ({ i: i + 1, id: d.id, ch: Math.floor(i / 6) + 1, stars: d.difficulty, ...indice(d) }));
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows.map((r) => ({ id: r.id, stars: r.stars, v: r.v }))));
  else for (let c = 1; c <= 11; c++) { console.log(`Chapitre ${c}`); for (const r of rows.filter((x) => x.ch === c)) console.log(`  ${String(r.i).padStart(2)} ${r.id.padEnd(14)} ${'◆'.repeat(r.stars)}${'◇'.repeat(5 - r.stars)}  indice ${String(r.v).padStart(5)}  ${r.time.toFixed(1)} s`); }
}
