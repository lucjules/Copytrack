// Groupes et calques (E9) : node tools/test-groups.mjs   (npm test)
// Un groupe voyage dans le code (pièces, décorations, noms), ne change pas la signature (sans logique de circuit, il n'a aucun effet sur la course),
// et l'annulation de l'éditeur le garde. Au passage : l'annulation gardait mal les pièces perso (leurs formes étaient perdues), corrigé.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Track, b64decode, MAX_GROUP } from '../js/track.js';
import { copyRect } from '../js/editorTools.js';
import { historyMethods } from '../js/editor/history.js';

const base = () => Track.decode(buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === 'canyon')).encode());

console.log('Groupes');
test('numéro de groupe borné (0 à 63) ; noms nettoyés', () => {
  const t = new Track('t');
  t.add({ t: 'start', x: 0, z: 0, l: 0, r: 0, g: 99 });
  t.add({ t: 'straight', x: 0, z: -2, l: 0, r: 0, g: -3 });
  assert.deepEqual(t.tiles.map((x) => x.g), [MAX_GROUP, 0]);
  t.setGroupName(5, '  Porte <nord> !  ');
  t.setGroupName(0, 'non'); t.setGroupName(64, 'non');
  assert.deepEqual(t.groupNames(), [[5, 'Porte nord !']]);
  t.setGroupName(5, '');
  assert.deepEqual(t.groupNames(), []);
});
test('le code garde les groupes (pièces, décorations, pièce perso, noms) ; format 4', () => {
  const t = base(), sig = t.signature(), code0 = t.encode();
  t.tiles[3].g = 2; t.tiles[4].g = 2; t.tiles[7].g = 9;
  t.addDeco({ k: 'tree', x: 10, y: 0, z: 10, ry: 0, s: 1, c: 0, g: 4 });
  t.addDeco({ k: 'custom', x: 30, y: 0, z: 30, ry: 0, s: 1, c: 0, g: 9, cp: [{ s: 'box', x: 0, y: 1, z: 0, sx: 1, sy: 1, sz: 1, ry: 0, c: '#ff0000' }] });
  t.addDeco({ k: 'tree', x: 50, y: 0, z: 50, ry: 0, s: 1, c: 0 });
  t.setGroupName(2, 'Pont'); t.setGroupName(9, 'Raccourci');
  const code = t.encode();
  assert.notEqual(code, code0);
  assert.equal(JSON.parse(b64decode(code.slice(5))).v, 4);
  const u = Track.decode(code);
  assert.deepEqual(u.tiles.filter((x) => x.g).map((x) => x.g).sort(), [2, 2, 9]);
  assert.deepEqual(u.decos.map((d) => d.g || 0), [4, 9, 0]);
  assert.equal(u.decos[1].cp.length, 1, 'la pièce perso garde ses formes');
  assert.deepEqual(u.groupNames(), [[2, 'Pont'], [9, 'Raccourci']]);
  assert.deepEqual(u.usedGroups(), [2, 4, 9]);
  assert.equal(u.encode(), code, 'relecture stable');
  const same = base();                                       // le même circuit, mêmes décorations, sans aucun groupe
  same.addDeco({ k: 'tree', x: 10, y: 0, z: 10, ry: 0, s: 1, c: 0 });
  same.addDeco({ k: 'custom', x: 30, y: 0, z: 30, ry: 0, s: 1, c: 0, cp: [{ s: 'box', x: 0, y: 1, z: 0, sx: 1, sy: 1, sz: 1, ry: 0, c: '#ff0000' }] });
  same.addDeco({ k: 'tree', x: 50, y: 0, z: 50, ry: 0, s: 1, c: 0 });
  assert.equal(u.signature(), same.signature(), 'sans logique, un groupe ne change ni la course ni la signature');
  assert.notEqual(sig, '', 'signature');
  assert.deepEqual(t.clone().groupNames(), t.groupNames(), 'clone garde les noms');
});
test('annuler / rétablir dans l’éditeur garde les groupes, les noms et les pièces perso', () => {
  const t = base();
  t.tiles[2].g = 3; t.setGroupName(3, 'Porte');
  t.addDeco({ k: 'custom', x: 30, y: 0, z: 30, ry: 0, s: 1, c: 0, g: 3, cp: [{ s: 'cyl', x: 0, y: 1, z: 0, sx: 1, sy: 2, sz: 1, ry: 0, c: '#00ff00' }] });
  const ed = Object.assign({}, historyMethods, { track: t, _applyDecor() {}, _changed() {}, gridKey: '', inspector: { restore() {} }, histSel: [], hIndex: 0 });
  const snap = ed._snapshot();
  t.clear();
  ed._restore(snap);
  assert.equal(t.tiles.filter((x) => x.g === 3).length, 1);
  assert.deepEqual(t.groupNames(), [[3, 'Porte']]);
  assert.equal(t.decos.length, 1, 'la pièce perso revient (avant : elle disparaissait à la première annulation)');
  assert.equal(t.decos[0].cp.length, 1); assert.equal(t.decos[0].g, 3);
});
test('copier une zone ne prend que ce que le filtre laisse (calques masqués, verrouillés, autre niveau)', () => {
  const t = base();
  for (const x of t.tiles) x.g = 0;
  t.tiles[0].g = 7;
  const r = { x0: -500, z0: -500, x1: 500, z1: 500 };
  const all = copyRect(t, r), some = copyRect(t, r, (o) => o.g !== 7);
  assert.equal(all.tiles.length - some.tiles.length, 1);
});

await finish('Tous les tests des groupes passent.');
