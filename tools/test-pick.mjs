// Tests du rayon sélectif de l'éditeur (gomme à filtres, inspection) : node tools/test-pick.mjs   (npm test)
import assert from 'node:assert/strict';
import * as THREE from '../js/vendor/three.module.min.js';
import { Track } from '../js/track.js';
import { CELL, LEVEL_H, ROAD_TOP } from '../js/constants.js';
import { pickObjects, rayBox, LAYER_TRACK, LAYER_DECO, LAYER_ALL, ERASE_FILTERS } from '../js/editorPick.js';
import { yawOf } from '../js/inspector.js';

let failures = 0;
function test(name, fn) { try { fn(); console.log('  ok   ' + name); } catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + e.message); } }

// Rayon descendant verticalement sur (x, z), ou oblique depuis une caméra.
const down = (x, z, y = 100) => new THREE.Ray(new THREE.Vector3(x, y, z), new THREE.Vector3(0, -1, 0));
const from = (o, to) => new THREE.Ray(new THREE.Vector3(...o), new THREE.Vector3(...to).sub(new THREE.Vector3(...o)).normalize());
const mid = (c) => (c + 0.5) * CELL;

function scene() {
  const t = new Track('t');
  const tile = t.add({ t: 'straight', x: 2, z: 2, l: 0, r: 0 });
  const other = t.add({ t: 'straight', x: 3, z: 2, l: 0, r: 0 });
  const deco = t.addDeco({ k: 'plaque', x: mid(2), y: ROAD_TOP, z: mid(2), ry: 0, s: 1, c: 0, u: '' });
  return { t, tile, other, deco };
}

console.log('Rayon sélectif');
test('boîte : entrée et sortie, rayon manqué', () => {
  const b = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 10, 10));
  const r = rayBox(down(5, 5), b);
  assert.ok(Math.abs(r[0] - 90) < 1e-9 && Math.abs(r[1] - 100) < 1e-9);
  assert.equal(rayBox(down(50, 5), b), null);
  assert.equal(rayBox(new THREE.Ray(new THREE.Vector3(5, 5, 5), new THREE.Vector3(0, 0, 1)), b)[0], 0, 'origine dans la boîte');
});
test('filtre « Tout » : la décoration posée sur la route l’emporte sur la pièce', () => {
  const { t, deco } = scene();
  const hit = pickObjects(t, down(mid(2), mid(2)), ERASE_FILTERS.all.mask);
  assert.equal(hit.kind, 'deco'); assert.equal(hit.obj, deco);
});
test('filtre « Pistes uniquement » : la décoration est ignorée, la pièce est touchée', () => {
  const { t, tile } = scene();
  const hit = pickObjects(t, down(mid(2), mid(2)), ERASE_FILTERS.track.mask);
  assert.equal(hit.kind, 'tile'); assert.equal(hit.obj, tile);
});
test('filtre « Décorations uniquement » : une pièce seule ne renvoie rien', () => {
  const { t } = scene();
  assert.equal(pickObjects(t, down(mid(3), mid(2)), ERASE_FILTERS.deco.mask), null);
  assert.equal(pickObjects(t, down(mid(3), mid(2)), ERASE_FILTERS.track.mask).kind, 'tile');
});
test('hors de tout objet : rien, quel que soit le filtre', () => {
  const { t } = scene();
  for (const f of Object.values(ERASE_FILTERS)) assert.equal(pickObjects(t, down(mid(9), mid(9)), f.mask), null);
  assert.equal(pickObjects(t, down(mid(2), mid(2)), 0), null, 'aucun calque');
});
test('pièce la plus proche de la caméra (deux niveaux superposés)', () => {
  const t = new Track('t');
  const low = t.add({ t: 'straight', x: 0, z: 0, l: 0, r: 0 });
  const high = t.add({ t: 'straight', x: 0, z: 0, l: 3, r: 0 });
  assert.equal(pickObjects(t, down(mid(0), mid(0)), LAYER_TRACK).obj, high, 'vue de dessus : le niveau haut');
  assert.equal(pickObjects(t, new THREE.Ray(new THREE.Vector3(mid(0), -50, mid(0)), new THREE.Vector3(0, 1, 0)), LAYER_TRACK).obj, low, 'vue de dessous : le niveau bas');
});
test('décoration cachée derrière une pièce haute : la pièce est visée', () => {
  const t = new Track('t');
  const wall = t.add({ t: 'straight', x: 5, z: 5, l: 4, r: 0 });
  t.addDeco({ k: 'plaque', x: mid(5), y: 0, z: mid(5), ry: 0, s: 1, c: 0, u: '' });
  const hit = pickObjects(t, down(mid(5), mid(5)), LAYER_ALL);
  assert.equal(hit.obj, wall, 'vue de dessus : le niveau 4 cache la déco posée au sol');
  assert.equal(pickObjects(t, down(mid(5), mid(5)), LAYER_DECO).kind, 'deco', 'avec le filtre déco, on la touche quand même');
});
test('pièce 2×2 : touchée sur toute son empreinte', () => {
  const t = new Track('t');
  const big = t.add({ t: 'bigcurve', x: 1, z: 1, l: 0, r: 0 });
  for (const [x, z] of [[1.2, 1.2], [2.8, 2.8], [1.2, 2.8]]) assert.equal(pickObjects(t, down(x * CELL, z * CELL), LAYER_ALL).obj, big);
});
test('yawOf : cap d’une rotation autour de Y, sans ambiguïté d’Euler (tours complets)', () => {
  for (const a of [0, 0.5, Math.PI / 2, 2.5, -2.5, Math.PI - 0.01, -Math.PI + 0.01]) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
    const d = yawOf(q) - a; assert.ok(Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) < 1e-9, `angle ${a}`);
  }
  // convention du jeu : tile.r = 1 <=> cap -90°
  assert.equal(((Math.round(-yawOf(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2)) / (Math.PI / 2)) % 4) + 4) % 4, 1);
});

if (failures) { console.log(`\n${failures} test(s) en échec`); process.exit(1); }
console.log('\nTous les tests de sélection passent.');
