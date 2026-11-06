// Médailles d'un circuit intégré, calculées sur le temps du pilote automatique (avec le réglage `pilot` du circuit).
//   node tools/medals.mjs eclats canyon        -> proposition de médailles pour ces circuits
//   node tools/medals.mjs --check              -> écart entre les médailles écrites et la proposition (circuits qui ont un `profil`)
//   node tools/medals.mjs --humain temps.json [--ecrire]
//                                              -> médailles calées sur de vrais temps de joueurs : { "eclats": [15.4, 16.2, 17.9], … } (un meilleur temps par testeur,
//                                                 voir docs/FICHE-ESSAI.md). Cristal = le meilleur temps observé, Or = ×1,05, Argent = ×1,2, Bronze = ×1,4.
//                                                 Avec --ecrire, js/tracks.js est mis à jour et le circuit porte `medalsBy: 'humain'` (le contrat ne le recale plus sur le pilote).
//
// Règle de calibrage (celle de toute la carrière depuis la 0.9.4) : or = temps du pilote, cristal = 0,95 ×, argent = 1,15 ×, bronze = 1,35 ×.
// Le cristal demande donc de faire mieux que le pilote (trajectoires plus larges, mini-turbos), l'or de l'égaler.
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { runTrack } from './lab.mjs';

export const RATIOS = { cristal: 0.95, or: 1, argent: 1.15, bronze: 1.35 };
const r1 = (x) => Math.round(x * 10) / 10;

export const proposeFrom = (time) => Object.fromEntries(Object.entries(RATIOS).map(([k, r]) => [k, r1(time * r)]));

export const RATIOS_HUMAIN = { cristal: 1, or: 1.05, argent: 1.2, bronze: 1.4 };
export const proposeFromHumans = (times) => { const best = Math.min(...times); return Object.fromEntries(Object.entries(RATIOS_HUMAIN).map(([k, r]) => [k, r1(best * r)])); };

export function proposeMedals(def) {
  const S = runTrack(buildBuiltin(def));
  if (!S.ok) return null;
  return { time: S.time, medals: proposeFrom(S.time) };
}

if (process.argv[1] && process.argv[1].endsWith('medals.mjs') && process.argv.includes('--humain')) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const file = process.argv[process.argv.indexOf('--humain') + 1];
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const path = new URL('../js/tracks.js', import.meta.url);
  let src = readFileSync(path, 'utf8'), n = 0;
  for (const [id, times] of Object.entries(data)) {
    const def = BUILTIN_TRACKS.find((d) => d.id === id);
    if (!def) { console.log(id.padEnd(14), 'circuit inconnu'); process.exitCode = 1; continue; }
    const t = (times || []).filter((x) => x > 0);
    if (!t.length) continue;
    const m = proposeFromHumans(t);
    console.log(`${id.padEnd(14)} ${t.length} temps, meilleur ${Math.min(...t).toFixed(2)} s   proposé ${JSON.stringify(m).replace(/"/g, '')}   écrit ${JSON.stringify(def.medals).replace(/"/g, '')}`);
    if (process.argv.includes('--ecrire')) {
      const re = new RegExp("(    id: '" + id + "',[\\s\\S]*?\\n    medals: )\\{[^}]*\\},?\\n");
      if (!re.test(src)) throw new Error('entrée introuvable : ' + id);
      if (def.goal && def.goal.id === 'under') {                // l'objectif « moins de t s » doit rester entre l'or et l'argent
        const t = Math.round(((m.or + m.argent) / 2) * 2) / 2, g = new RegExp("(    id: '" + id + "',[\\s\\S]*?\\n    goal: \\{ id: 'under', t: )[0-9.]+");
        src = src.replace(g, (_, a) => a + t);
      }
      src = src.replace(re, (_, a) => a + '{ ' + Object.entries(m).map(([k, v]) => k + ': ' + v).join(', ') + " },\n    medalsBy: 'humain',\n"); n++;
    }
  }
  if (process.argv.includes('--ecrire')) { writeFileSync(path, src); console.log(n + ' circuits recalés sur des temps humains dans js/tracks.js (puis : node tools/golden.mjs --update ; npm run sw ; npm run build:function)'); }
} else if (process.argv[1] && process.argv[1].endsWith('medals.mjs')) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const ids = args.filter((a) => !a.startsWith('--'));
  let worst = 0;
  for (const def of BUILTIN_TRACKS) {
    if (check ? !def.profil || def.medalsBy === 'humain' : !ids.includes(def.id)) continue;
    const P = proposeMedals(def);
    if (!P) { console.log(`${def.id.padEnd(12)} ÉCHEC du pilote`); process.exitCode = 1; continue; }
    const m = P.medals, cur = def.medals;
    const dev = Math.max(...Object.keys(m).map((k) => Math.abs(cur[k] - m[k]) / m[k]));
    worst = Math.max(worst, dev);
    console.log(`${def.id.padEnd(12)} pilote ${P.time.toFixed(2).padStart(6)} s   proposé ${JSON.stringify(m).replace(/"/g, '')}   écrit ${JSON.stringify(cur).replace(/"/g, '')}   écart max ${(dev * 100).toFixed(1)} %`);
  }
  if (check && worst > 0.02) { console.log('Médailles à recalculer (écart > 2 %).'); process.exitCode = 1; }
}
