// Outils de l'audit du rendu (tools/audit-rendu, phase 0) : la matrice couvre toutes les pièces et orientations, chaque cas se construit sans
// sommet invalide, et les sondes tournent sans erreur sur toute la matrice. Les défauts qu'elles trouvent sont le travail de l'audit : quand un
// défaut sera corrigé, sa sonde deviendra ici un test (« aucun constat »).   node tools/test-audit-rendu.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { pieceCases, surfaceVariants, PIECE_IDS } from './audit-rendu/cas.mjs';
import { SONDES } from './audit-rendu/sondes.mjs';
import { PRESETS, ANGLES } from './audit-rendu/captures.mjs';

const cases = pieceCases();

test('matrice : chaque pièce de la palette au moins à l’endroit ; les 8 orientations sont représentées ; les revêtements à sens ont leurs deux réglages', () => {
  const sol = new Set(cases.filter((c) => c.orient === 'sol').map((c) => c.t));
  assert.deepEqual(PIECE_IDS.filter((t) => !sol.has(t)), []);
  assert.equal(new Set(cases.map((c) => c.orient)).size, 8);
  assert.ok(cases.length >= 1346, cases.length + ' combinaisons');
  const conv = surfaceVariants().filter((v) => v.s === 'conveyor').map((v) => v.p || 0);
  assert.ok(conv.some((p) => p > 101 || p === 0) && conv.some((p) => p && p < 101), 'tapis en avant et en arrière');
});

test('géométrie : toutes les combinaisons se construisent, aucun sommet non fini', () => {
  const out = [], stats = {};
  SONDES.geometrie(cases, out, stats);
  assert.deepEqual(out, []);
  assert.equal(stats.built, cases.length);
});

test('les sondes tournent sur toute la matrice et rendent des constats bien formés', () => {
  for (const [name, fn] of Object.entries(SONDES)) {
    const out = [];
    fn(cases, out, {});
    for (const f of out) {
      assert.equal(f.sonde.startsWith(name.split('-')[0]), true, name);
      assert.ok(f.t && f.orient && typeof f.msg === 'string' && Number.isFinite(f.valeur), JSON.stringify(f));
    }
  }
});

test('captures : chaque angle des sélections existe', () => {
  for (const list of Object.values(PRESETS)) for (const c of list) for (const a of c.angles) assert.ok(ANGLES[Array.isArray(a) ? a[0] : a], String(a));
});

await finish('Les outils de l’audit du rendu fonctionnent.');
