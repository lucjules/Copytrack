// 0.9.73, étape 6 : les six circuits du chapitre 1 refaits avec les nouvelles pièces des étapes 1 à 5 : node tools/test-etape6.mjs   (npm test)
// RÈGLE : chaque circuit du chapitre 1 contient au moins 4 nouveautés (pièces, options ou décorations des étapes 1 à 5 : tools/nouveautes.mjs) de 2 familles
// au moins ; le chapitre entier montre les 9 familles. Le contrat complet de chaque circuit (pilote, tolérance de vitesse, reprise à l'arrêt, vérificateur,
// médailles) reste celui de tools/test-niveaux.mjs.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { CHAPTERS } from '../js/career.js';
import { newElements, FAMILIES_NEW } from './nouveautes.mjs';
import { runTrack } from './lab.mjs';

const CH1 = BUILTIN_TRACKS.filter((d) => d.decor === CHAPTERS[0].decor && ['eclats', 'canyon', 'tremplins', 'spirale', 'verglas', 'grandtour'].includes(d.id));
const built = new Map(CH1.map((d) => [d.id, buildBuiltin(d)]));

test('le chapitre 1 compte bien ses six circuits (Désert)', () => {
  assert.equal(CH1.length, 6);
  assert.deepEqual(CH1.map((d) => d.id), BUILTIN_TRACKS.slice(0, 6).map((d) => d.id));
});
for (const d of CH1) {
  test(`${d.name} : au moins 4 nouveautés, de 2 familles au moins`, () => {
    const N = newElements(built.get(d.id)), fam = new Set(N.map((e) => e.family));
    assert.ok(N.length >= 4, `${N.length} nouveauté(s) : ${N.map((e) => e.what).join(', ')}`);
    assert.ok(fam.size >= 2, `familles : ${[...fam].join(', ')}`);
  });
}
test('le chapitre entier montre les 9 familles de nouveautés', () => {
  const fam = new Set();
  for (const tr of built.values()) for (const e of newElements(tr)) fam.add(e.family);
  assert.deepEqual([...FAMILIES_NEW].filter((f) => !fam.has(f)), []);
});
test('le pilote de référence les finit tous sans choc ni réapparition, en 45 à 85 s ; les nouveautés sont SUR le parcours (traversées), pas posées à côté', () => {
  for (const d of CH1) {
    const S = runTrack(built.get(d.id));
    assert.ok(S.ok && S.respawns === 0 && S.wallHits === 0, `${d.id} : ${S.reason}`);
    assert.ok(S.time >= 45 && S.time <= 85, `${d.id} : ${S.time.toFixed(1)} s`);
  }
  // pièces nouvelles traversées : chaque pièce de route nouvelle d'un circuit est sur le tracé du pilote
  for (const [id, tr] of built) {
    const P = tr.path;
    for (const t of tr.tiles) {
      const e = newElements({ tiles: [t], decos: [] }).filter((x) => x.family !== 'portique');
      if (!e.length) continue;
      const cx = t.x * 32, cz = t.z * 32, s = 32 * (t.t === 'wide' || t.t === 'wideIn' ? 3 : 4);
      assert.ok(P.some((p) => p[0] >= cx - 1 && p[0] <= cx + s + 1 && p[2] >= cz - 1 && p[2] <= cz + s + 1), `${id} : ${t.t} hors du tracé`);
    }
  }
});

await finish('Étape 6 (chapitre 1 refait avec les nouvelles pièces) : tout passe.');
