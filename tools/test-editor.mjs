// Tests du pot de peinture de l'éditeur : node tools/test-editor.mjs   (npm test)
import { EditorSession } from '../js/editor.js';
import { Track } from '../js/track.js';
import assert from 'node:assert';

function mk(tool, hoverCell) {
  const track = new Track('t');
  const calls = { commit: 0, changed: 0, flash: [] };
  const self = Object.create(EditorSession.prototype);
  Object.assign(self, {
    track, tool, level: 0, hover: { cx: hoverCell[0], cz: hoverCell[1] }, surfParam: {},
    app: { ui: { flash: (m) => calls.flash.push(m) }, audio: { place() {}, error() {} } },
    _commit: () => calls.commit++, _changed: () => calls.changed++,
  });
  return { self, track, calls };
}
const add = (track, t, x, z, extra = {}) => track.add({ t, x, z, l: 0, r: 0, s: '', ...extra });

// 1. Surface : zone de 6 cases glace connectées + 1 isolée + 1 route normale au milieu
{
  const { self, track, calls } = mk('fill-surf:slow', [0, 0]);
  for (let i = 0; i < 6; i++) add(track, 'straight', i, 0, { s: 'ice' });
  add(track, 'straight', 10, 0, { s: 'ice' });          // isolée (pas connectée)
  add(track, 'straight', 0, 1);                          // voisine sans glace : hors zone
  self._floodFill();
  const slow = track.tiles.filter((t) => t.s === 'slow').length;
  assert.equal(slow, 6, 'toute la zone connectée est remplie');
  assert.equal(track.tilesAt(10, 0)[0].s, 'ice', 'zone isolée intacte');
  assert.equal(track.tilesAt(0, 1)[0].s, '', 'voisine hors prédicat intacte');
  assert.equal(calls.commit, 1, 'un seul commit');
}
// 2. Départ / arrivée comme cible : refusé, aucun commit
{
  const { self, track, calls } = mk('fill-surf:slow', [0, 0]);
  add(track, 'start', 0, 0); add(track, 'straight', 1, 0);
  self._floodFill();
  assert.equal(calls.commit, 0); assert.equal(track.tilesAt(1, 0)[0].s, '');
}
// 3. Départ dans la zone (cible = route) : il est sauté
{
  const { self, track, calls } = mk('fill-surf:slow', [1, 0]);
  add(track, 'start', 0, 0); add(track, 'straight', 1, 0); add(track, 'straight', 2, 0);
  self._floodFill();
  assert.equal(track.tilesAt(0, 0)[0].s, '', 'départ jamais modifié');
  assert.equal(track.tilesAt(2, 0)[0].s, 'slow'); assert.equal(calls.commit, 1);
}
// 4. Type de pièce : straight -> platform (même taille), grand virage (size 2) ignoré
{
  const { self, track, calls } = mk('fill-piece:platform', [0, 0]);
  for (let i = 0; i < 4; i++) add(track, 'straight', i, 0);
  self._floodFill();
  assert.equal(track.tiles.filter((t) => t.t === 'platform').length, 4);
  assert.equal(calls.commit, 1);
  // l'index reste cohérent
  for (let i = 0; i < 4; i++) assert.equal(track.tilesAt(i, 0).length, 1);
}
// 5. Valeur start comme pièce : refusé
{
  const { self, track, calls } = mk('fill-piece:start', [0, 0]);
  add(track, 'straight', 0, 0); self._floodFill();
  assert.equal(calls.commit, 0); assert.equal(track.tilesAt(0, 0)[0].t, 'straight');
}
// 6. Gros circuit : 6000 pièces, pas de dépassement de pile, rapide
{
  const { self, track } = mk('fill-surf:ice', [0, 0]);
  for (let x = 0; x < 80; x++) for (let z = 0; z < 75; z++) add(track, 'straight', x, z);
  const t0 = performance.now(); self._floodFill(); const dt = performance.now() - t0;
  assert.equal(track.tiles.filter((t) => t.s === 'ice').length, 6000);
  console.log('6000 pièces en', dt.toFixed(0), 'ms');
}
// 7. Piètes de taille différente jamais retypées
{
  const { self, track } = mk('fill-piece:bigcurve', [0, 0]);
  add(track, 'straight', 0, 0); self._floodFill();
  assert.equal(track.tilesAt(0, 0)[0].t, 'straight');
}
console.log('OK');
