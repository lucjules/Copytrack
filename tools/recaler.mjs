// Recale les médailles des circuits intégrés sur le pilote automatique après un changement de moteur : node tools/recaler.mjs [--ecrire]
// Pour chaque circuit sans médailles « humain » (medalsBy), proposeFrom(temps du pilote) ; sans --ecrire, affiche seulement l'écart.
// Suites : node tools/golden.mjs --update (temps de référence), node tools/fiche-essai.mjs (fiche d'essai), node tools/compat-gen.mjs (corpus).
import { BUILTIN_TRACKS } from '../js/tracks.js';
import { proposeMedals } from './medals.mjs';
import { patchTracks } from './patch-circuit.mjs';

const write = process.argv.includes('--ecrire'), patches = {};
for (const d of BUILTIN_TRACKS) {
  if (d.medalsBy === 'humain') continue;
  const P = proposeMedals(d);
  if (!P) { console.log(d.id.padEnd(14), 'le pilote ne finit pas'); process.exitCode = 1; continue; }
  const off = Object.keys(P.medals).some((k) => Math.abs(d.medals[k] - P.medals[k]) / P.medals[k] >= 0.02);
  if (off) { patches[d.id] = { medals: P.medals }; console.log(d.id.padEnd(14), JSON.stringify(d.medals).replace(/"/g, ''), '->', JSON.stringify(P.medals).replace(/"/g, '')); }
}
console.log(Object.keys(patches).length, 'circuit(s) à recaler');
if (write && Object.keys(patches).length) { patchTracks(patches); console.log('js/tracks.js mis à jour'); }
