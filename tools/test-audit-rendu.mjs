// Audit du rendu (0.12.2) : les outils de tools/audit-rendu tournent sur toute la matrice, et chaque défaut corrigé y reste corrigé (sa sonde ne
// trouve plus rien). node tools/test-audit-rendu.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { pieceCases, surfaceVariants, PIECE_IDS } from './audit-rendu/cas.mjs';
import { SONDES } from './audit-rendu/sondes.mjs';
import { PRESETS, ANGLES } from './audit-rendu/captures.mjs';
import { Track } from '../js/track.js';
import { PIECES } from '../js/pieces.js';
import { minGroundLevel } from '../js/ribbons.js';
import { pillarSpecs } from '../js/trackGeometry.js';
import { pitsFor, cutTriangle } from '../js/scenery/pits.js';
import { coveredAt } from '../js/cover.js';
import { Weather } from '../js/weather.js';

const cases = pieceCases();
const run = (name) => { const out = [], stats = {}; SONDES[name](cases, out, stats); return { out, stats }; };
const none = (name) => { const { out } = run(name); assert.deepEqual(out.map((f) => `${f.t} ${f.orient} : ${f.msg}`), [], name); };

test('matrice : chaque pièce de la palette au moins à l’endroit ; les 8 orientations sont représentées ; les revêtements à sens ont leurs deux réglages', () => {
  const sol = new Set(cases.filter((c) => c.orient === 'sol').map((c) => c.t));
  assert.deepEqual(PIECE_IDS.filter((t) => !sol.has(t)), []);
  assert.equal(new Set(cases.map((c) => c.orient)).size, 8);
  assert.ok(cases.length >= 1346, cases.length + ' combinaisons');
  const conv = surfaceVariants().filter((v) => v.s === 'conveyor').map((v) => v.p || 0);
  assert.ok(conv.some((p) => p > 101 || p === 0) && conv.some((p) => p && p < 101), 'tapis en avant et en arrière');
});

test('géométrie : toutes les combinaisons se construisent, aucun sommet non fini ; chaque revêtement et chaque option aussi', () => {
  const { out, stats } = run('geometrie');
  assert.deepEqual(out, []);
  assert.equal(stats.built, cases.length);
  const r = run('revetements');
  assert.deepEqual(r.out, []);
  assert.ok(r.stats.revetements > 25000, r.stats.revetements + ' variantes');
});

test('poteaux (R-02, R-11) : aucun chapeau ne traverse la route (pentes, virages qui montent) ; la plaque triangle a son poteau sous elle', () => {
  none('poteaux');
  for (const t of ['tri1', 'tri2', 'tri3']) {
    const tile = Track.normalize({ t, x: 0, z: 0, l: 1, r: 0 });
    for (const P of pillarSpecs(tile)) {
      // centre de gravité d'un triangle rectangle : à un tiers des côtés, donc à l'intérieur (pas sur l'hypoténuse, où est le centre de la case)
      assert.ok(Math.abs(P.lx) > 1 || Math.abs(P.lz) > 1, `${t} : poteau au centre de la case (${P.lx}, ${P.lz})`);
    }
  }
});

test('tapis roulant (R-03) : les chevrons pointent dans le sens de la poussée, en avant comme en arrière', () => none('tapis'));

test('route sous le terrain (R-04) : aucune pièce posable ne passe sous le sol ; la vrille, le tire-bouchon, les loopings double et triple ont un niveau minimum dans l’éditeur, pas dans les circuits générés', () => {
  none('sous-terrain');
  assert.equal(minGroundLevel('twist'), 2); assert.equal(minGroundLevel('cork'), 1); assert.equal(minGroundLevel('loopDouble'), 0.5); assert.equal(minGroundLevel('loop'), 0);
  const tw = Track.normalize({ t: 'twist', x: 0, z: 0, l: 0, r: 0 });
  assert.equal(Track.inBounds(tw), true, 'les circuits générés (défis du jour) gardent l’ancienne règle : ils se reconstruisent à l’identique');
  assert.equal(Track.placeable(tw), false, 'l’éditeur refuse');
  assert.equal(Track.placeable({ ...tw, l: 2 }), true);
});

test('fosses (R-04) : sous une vrille d’un ancien circuit, le terrain est découpé (l’aire hors de la fosse est conservée) et la fosse descend sous la route', () => {
  const tr = new Track('ancien', [{ t: 'twist', x: 0, z: 0, l: 0, r: 0 }, { t: 'loop', x: 4, z: 0, l: 0, r: 0 }]);
  const pits = pitsFor(tr);
  assert.equal(pits.length, 1, 'une fosse, sous la vrille seulement');
  assert.ok(pits[0].y < -11.6, 'fond sous le point le plus bas de la route');
  const area = (ts) => ts.reduce((a, t) => a + ((t[1][0] - t[0][0]) * (t[2][2] - t[0][2]) - (t[1][2] - t[0][2]) * (t[2][0] - t[0][0])) / 2, 0);
  const tri = [[-200, 0, -200], [200, 0, -200], [0, 0, 300]], r = pits[0];
  const inside = (r.x1 - r.x0) * (r.z1 - r.z0);
  assert.ok(Math.abs(Math.abs(area(cutTriangle(tri, pits))) - (Math.abs(area([tri])) - inside)) < 1e-6);
});

test('marquages (R-05, R-06) : jamais hors d’une route étroite ; d’un bord à l’autre sur une route large ; la route dessinée reste à la largeur de la physique, revêtement par revêtement', () => {
  none('marquages'); none('largeur'); none('largeur-route');
});

test('supports (R-07) : chaque ruban posé en hauteur qui a un passage à plat a au moins un poteau ; dans les circuits officiels, seules les pièces verticales restent sans support', () => {
  none('supports');
  const { out } = run('circuits');
  assert.deepEqual(out.filter((f) => f.sonde === 'circuits').map((f) => f.msg), [], 'aucun poteau qui dépasse, aucune route sous le terrain');
  const vertical = new Set(['wall', 'loopTop', 'loopTopL', 'crest90', 'tr13s', 'tr31s', 'tr23s', 'tr32s']);
  assert.deepEqual([...new Set(out.filter((f) => f.sonde === 'circuits-air').map((f) => f.t))].filter((t) => !vertical.has(t)), []);
});

test('rendu contre physique : la route dessinée suit celle de la physique à 8 cm près (eau et cale du bateau comprises) ; les rubans à 25 cm près', () => {
  none('rendu-physique'); none('facettes');
});

test('tube (R-01, PHYS_VER 38) : décrochée en haut, la voiture reste dans le tube ; tombée dessus, elle reste dehors', () => none('tube'));

test('météo (R-09) : à l’abri dans un tunnel, un tube ou sous une route, la pluie s’estompe ; à découvert, elle revient', () => {
  const tr = new Track('m', [{ t: 'straight', x: 0, z: 0, l: 0, r: 0, tn: 1 }, { t: 'straight', x: 1, z: 0, l: 2, r: 0 }, { t: 'tube', x: 3, z: 0, l: 0, r: 0 }]);
  assert.equal(coveredAt(tr, 16, 2, 16), true, 'tunnel');
  assert.equal(coveredAt(tr, 16, 25, 16), false, 'au-dessus du tunnel');
  assert.equal(coveredAt(tr, 48, 3, 16), true, 'sous une route');
  assert.equal(coveredAt(tr, 48, 20, 16), false, 'au-dessus de la route');
  assert.equal(coveredAt(tr, 112, 6.4, 32), true, 'dans le tube');
  const scene = { add() {} };
  const w = new Weather(scene); w.set('rain', 1);
  const cam = { position: { x: 0, y: 0, z: 0 } };
  for (let i = 0; i < 30; i++) w.update(1 / 60, cam, true);
  assert.ok(w.obj.material.opacity < 0.01 && !w.obj.visible, 'estompée sous abri');
  for (let i = 0; i < 30; i++) w.update(1 / 60, cam, false);
  assert.ok(w.obj.material.opacity > 0.5, 'revenue à découvert');
});

test('captures : chaque angle des sélections existe ; la sélection avant/après couvre chaque correction', () => {
  for (const list of Object.values(PRESETS)) for (const c of list) for (const a of c.angles) assert.ok(ANGLES[Array.isArray(a) ? a[0] : a], String(a));
  assert.ok(PRESETS.avantapres.length >= 12);
  void PIECES;
});

await finish('Les outils de l’audit du rendu fonctionnent et les défauts corrigés le restent.');
