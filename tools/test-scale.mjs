// Échelle du monde : les longueurs « en mètres » de la physique suivent la taille de la case et la largeur de la route : node tools/test-scale.mjs   (npm test)
// (La 0.9.11 est passée de cases de 24 m à 32 m : une valeur écrite en dur pour l'ancienne largeur de route, 2 × 9 m, faisait croire à la physique
// que les deux voies d'une bifurcation se touchaient encore alors qu'un muret les séparait déjà à l'écran.)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { CELL, HALF, ROAD_W, ROAD_HALF, LOOP_R, WORLD_SCALE } from '../js/constants.js';
import { PIECES, sampleLocal, forkSep } from '../js/pieces.js';

console.log('Constantes liées entre elles');
test('la case, la demi-case, la route et son échelle restent cohérentes', () => {
  assert.equal(HALF * 2, CELL);
  assert.equal(ROAD_HALF * 2, ROAD_W);
  assert.equal(WORLD_SCALE, CELL / 24, 'WORLD_SCALE = 1 reproduit le monde d\'avant la 0.9.11');
  assert.equal(LOOP_R, 12 * WORLD_SCALE);
  assert.ok(ROAD_W < CELL, 'la route tient dans la case');
});

console.log('Bifurcation : la physique et le rendu s\'accordent sur l\'endroit où les deux voies se séparent');
const fork = PIECES.fork;
const S = {};
// Point situé entre les deux lignes centrales, à l'avancée t, au milieu de l'écart.
function between(t) {
  const half = fork.size * HALF, lz = half - t * 2 * half;
  const xa = -fork.mirror * HALF, xb = xa + fork.mirror * forkSep(t);
  sampleLocal({ t: 'fork', x: 0, z: 0, l: 0, r: 0 }, (xa + xb) / 2, lz, S);
  return { d: S.d, sep: forkSep(t) };
}
test('tant que les deux chaussées se touchent (écart < 2 × demi-route), l\'entre-deux est de la route (d = 0, pas de muret)', () => {
  let n = 0;
  for (let i = 1; i < 200; i++) {
    const t = i / 200, b = between(t);
    if (b.sep < 2 * ROAD_HALF - 0.1 && b.sep > 0.5) { assert.equal(b.d, 0, `t=${t} écart ${b.sep.toFixed(2)} m`); n++; }
  }
  assert.ok(n > 20, 'assez de points testés : ' + n);
});
test('dès que les chaussées s\'écartent (écart > 2 × demi-route), le milieu est un muret : d ≠ 0', () => {
  let n = 0;
  for (let i = 1; i < 200; i++) {
    const t = i / 200, b = between(t);
    if (b.sep > 2 * ROAD_HALF + 0.3) { assert.ok(Math.abs(b.d) > 0.1, `t=${t} écart ${b.sep.toFixed(2)} m`); n++; }
  }
  assert.ok(n > 5, 'assez de points testés : ' + n);
});
test('à la fin de la pièce, l\'écart vaut exactement une case', () => {
  assert.equal(forkSep(1), CELL);
  assert.equal(forkSep(0), 0);
});

finish('Tous les tests d\'échelle passent.');
