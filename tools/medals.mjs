// Médailles d'un circuit intégré, calculées sur le temps du pilote automatique (avec le réglage `pilot` du circuit).
//   node tools/medals.mjs eclats canyon        -> proposition de médailles pour ces circuits
//   node tools/medals.mjs --check              -> écart entre les médailles écrites et la proposition (circuits qui ont un `profil`)
//
// Règle de calibrage (celle de toute la carrière depuis la 0.9.4) : or = temps du pilote, cristal = 0,95 ×, argent = 1,15 ×, bronze = 1,35 ×.
// Le cristal demande donc de faire mieux que le pilote (trajectoires plus larges, mini-turbos), l'or de l'égaler.
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { runTrack } from './lab.mjs';

export const RATIOS = { cristal: 0.95, or: 1, argent: 1.15, bronze: 1.35 };
const r1 = (x) => Math.round(x * 10) / 10;

export const proposeFrom = (time) => Object.fromEntries(Object.entries(RATIOS).map(([k, r]) => [k, r1(time * r)]));

export function proposeMedals(def) {
  const S = runTrack(buildBuiltin(def));
  if (!S.ok) return null;
  return { time: S.time, medals: proposeFrom(S.time) };
}

if (process.argv[1] && process.argv[1].endsWith('medals.mjs')) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const ids = args.filter((a) => !a.startsWith('--'));
  let worst = 0;
  for (const def of BUILTIN_TRACKS) {
    if (check ? !def.profil : !ids.includes(def.id)) continue;
    const P = proposeMedals(def);
    if (!P) { console.log(`${def.id.padEnd(12)} ÉCHEC du pilote`); process.exitCode = 1; continue; }
    const m = P.medals, cur = def.medals;
    const dev = Math.max(...Object.keys(m).map((k) => Math.abs(cur[k] - m[k]) / m[k]));
    worst = Math.max(worst, dev);
    console.log(`${def.id.padEnd(12)} pilote ${P.time.toFixed(2).padStart(6)} s   proposé ${JSON.stringify(m).replace(/"/g, '')}   écrit ${JSON.stringify(cur).replace(/"/g, '')}   écart max ${(dev * 100).toFixed(1)} %`);
  }
  if (check && worst > 0.02) { console.log('Médailles à recalculer (écart > 2 %).'); process.exitCode = 1; }
}
