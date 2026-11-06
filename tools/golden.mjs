// Temps de référence des 66 circuits (course du pilote automatique de chaque circuit) : node tools/golden.mjs [--update]
// tools/golden-temps.json est le garde-fou de la physique : si un changement de moteur, de pièce ou de circuit modifie le temps d'un circuit,
// tools/test-niveaux.mjs échoue en nommant les circuits touchés (leurs médailles, calées sur ce temps, sont alors à revoir : node tools/medals.mjs --check).
import { readFileSync, writeFileSync } from 'node:fs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { runTrack } from './lab.mjs';

const FILE = new URL('./golden-temps.json', import.meta.url);
export const measure = () => Object.fromEntries(BUILTIN_TRACKS.map((d) => [d.id, +runTrack(buildBuiltin(d)).time.toFixed(2)]));
export const load = () => JSON.parse(readFileSync(FILE, 'utf8'));

if (process.argv[1] && process.argv[1].endsWith('golden.mjs')) {
  const now = measure();
  if (process.argv.includes('--update')) { writeFileSync(FILE, JSON.stringify(now, null, 1) + '\n'); console.log('golden-temps.json écrit :', Object.keys(now).length, 'circuits'); }
  else {
    const ref = load(), diff = Object.keys(now).filter((k) => Math.abs(now[k] - ref[k]) > 0.02);
    console.log(diff.length ? 'Temps modifiés : ' + diff.map((k) => `${k} ${ref[k]} → ${now[k]}`).join(', ') : 'Tous les temps de référence sont identiques.');
    process.exitCode = diff.length ? 1 : 0;
  }
}
