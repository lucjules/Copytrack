// 0.9.73, étape 6 : les six circuits du chapitre 1 refaits avec les nouvelles pièces des étapes 1 à 5 : node tools/test-etape6.mjs   (npm test)
// 0.9.74 : refaits AUTOUR de ces pièces, pour servir de référence. RÈGLE : chaque circuit du chapitre 1 contient au moins 12 nouveautés (pièces, options ou décorations des
// étapes 1 à 5 : tools/nouveautes.mjs), dont au moins 6 PIÈCES DE ROUTE nouvelles, de 3 familles au moins ; le chapitre entier montre les 9 familles. Le contrat complet de chaque circuit (pilote, tolérance de vitesse, reprise à l'arrêt, vérificateur,
// médailles) reste celui de tools/test-niveaux.mjs.
// 0.10.1 et suivantes : les autres chapitres sont refaits de la même façon, un par version ; REFAITS liste ceux qui le sont (même règle pour chacun).
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { CHAPTERS } from '../js/career.js';
import { newElements, FAMILIES_NEW } from './nouveautes.mjs';
import { runTrack } from './lab.mjs';

const REFAITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];      // indices dans CHAPTERS des chapitres refaits autour des nouvelles pièces
const CH = REFAITS.map((c) => BUILTIN_TRACKS.filter((d) => d.decor === CHAPTERS[c].decor));
const CH1 = CH[0];
const built = new Map(CH.flat().map((d) => [d.id, buildBuiltin(d)]));

test('le chapitre 1 compte bien ses six circuits (Désert) ; chaque chapitre refait en compte six', () => {
  assert.deepEqual(CH1.map((d) => d.id), ['eclats', 'canyon', 'tremplins', 'spirale', 'verglas', 'grandtour']);
  assert.deepEqual(CH1.map((d) => d.id), BUILTIN_TRACKS.slice(0, 6).map((d) => d.id));
  for (const c of CH) assert.equal(c.length, 6, c.map((d) => d.id).join(' '));
});
for (const d of CH.flat()) {
  test(`${d.name} : au moins 12 nouveautés dont 6 pièces de route, de 3 familles au moins`, () => {
    const tr = built.get(d.id), N = newElements(tr), fam = new Set(N.map((e) => e.family));
    const road = newElements({ tiles: tr.tiles, decos: [] }).filter((e) => !/\*|bordures/.test(e.what));      // (pièces de route : sans les options de portique ni de bordures)
    assert.ok(N.length >= 12, `${N.length} nouveauté(s) : ${N.map((e) => e.what).join(', ')}`);
    assert.ok(road.length >= 6, `${road.length} pièce(s) de route nouvelle(s) : ${road.map((e) => e.what).join(', ')}`);
    assert.ok(fam.size >= 3, `familles : ${[...fam].join(', ')}`);
  });
}
test('chaque chapitre refait montre les 9 familles de nouveautés', () => {
  for (const c of CH) {
    const fam = new Set();
    for (const d of c) for (const e of newElements(built.get(d.id))) fam.add(e.family);
    assert.deepEqual([...FAMILIES_NEW].filter((f) => !fam.has(f)), [], c[0].decor);
  }
});
test('le pilote de référence les finit tous sans choc ni réapparition, en 45 à 85 s ; les nouveautés sont SUR le parcours (traversées), pas posées à côté', () => {
  for (const d of CH.flat()) {
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

await finish('Étape 6 (chapitres refaits avec les nouvelles pièces) : tout passe.');
