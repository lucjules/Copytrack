// Ctrl+D dans l'éditeur : duplication de TOUTE la zone sélectionnée (pièces + décorations) : node tools/test-duplicate.mjs   (npm test)
// Le vrai EditorSession (sans rendu), le vrai circuit : place libre, rien d'écrasé, un seul pas d'annulation, départ unique, enchaînement.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { EditorSession } from '../js/editor.js';
import { Track, scriptTrack } from '../js/track.js';
import { CELL, LEVEL_H } from '../js/constants.js';
import { OBST } from '../js/obstacles.js';
const obstacleKind = Object.keys(OBST)[0];

function mk(track, sel, extra = {}) {
  const calls = { commit: 0, changed: 0, flash: [], inspectorDup: 0 };
  const self = Object.create(EditorSession.prototype);
  Object.assign(self, {
    track, tool: 'select', level: 0, focusLevel: false, sel, pasting: false, hover: null,
    app: { ui: { flash: (m) => calls.flash.push(m) }, audio: { place() {}, error() {}, click() {} } },
    inspector: { duplicate: () => { calls.inspectorDup++; return true; } },
    _commit: () => calls.commit++, _changed: () => calls.changed++,
    _layerOk: () => true, setLevel(l) { this.level = l; }, ...extra,
  });
  return { self, calls };
}
const mkTrack = () => { const t = new Track('d'); t.add({ t: 'straight', x: 0, z: 0, l: 0, r: 1, s: '' }); t.add({ t: 'straight', x: 1, z: 0, l: 0, r: 1, s: 'ice' }); t.add({ t: 'curve', x: 2, z: 0, l: 0, r: 1, s: '', col: { road: '#ff0000' } }); return t; };

console.log('Ctrl+D : toute la zone sélectionnée');
test('toutes les pièces de la zone sont copiées d\'un coup, à droite, sans rien écraser ; revêtement et couleurs conservés ; un seul pas d\'annulation', () => {
  const t = mkTrack();
  t.addDeco({ k: 'tree', x: 1.5 * CELL, y: 0, z: 0.5 * CELL, ry: 0.7, s: 1.3, c: 2 });
  const before = t.tiles.length;
  const { self, calls } = mk(t, { x0: 0, z0: 0, x1: 2, z1: 0 });
  assert.equal(self.duplicateNow(), true);
  assert.equal(t.tiles.length, before * 2, 'toutes les pièces sont dupliquées');
  assert.equal(t.decos.length, 2, 'la décoration aussi');
  const copies = t.tiles.slice(before);
  assert.deepEqual(copies.map((c) => [c.t, c.x, c.z, c.s]), [['straight', 3, 0, ''], ['straight', 4, 0, 'ice'], ['curve', 5, 0, '']], 'décalées d\'une largeur de zone vers la droite, même revêtement');
  assert.equal(copies[2].col.road, '#ff0000', 'couleurs conservées');
  assert.notEqual(copies[2].col, t.tiles[2].col, 'sans partager l\'objet de couleurs avec l\'original');
  const d2 = t.decos[1];
  assert.ok(Math.abs(d2.x - (1.5 * CELL + 3 * CELL)) < 1e-9 && d2.ry === 0.7 && d2.s === 1.3 && d2.c === 2, 'la décoration suit le décalage, garde cap, taille et couleur');
  assert.equal(calls.commit, 1, 'un seul pas d\'annulation'); assert.equal(calls.changed, 1);
  assert.deepEqual(self.sel, { x0: 3, z0: 0, x1: 5, z1: 0 }, 'la copie devient la sélection');
});
test('Ctrl+D répété enchaîne les copies côte à côte (aucune pièce superposée)', () => {
  const t = mkTrack(), { self } = mk(t, { x0: 0, z0: 0, x1: 2, z1: 0 });
  for (let i = 0; i < 3; i++) assert.equal(self.duplicateNow(), true);
  assert.equal(t.tiles.length, 12);
  const seen = new Set(t.tiles.map((x) => x.x + ',' + x.z));
  assert.equal(seen.size, 12, 'chaque case une seule fois');
  assert.deepEqual([...seen].map((s) => +s.split(',')[0]).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});
test('place occupée à droite : la copie va en dessous, puis à gauche, puis au-dessus, puis un niveau plus haut ; jamais d\'écrasement', () => {
  const t = mkTrack();
  t.add({ t: 'straight', x: 3, z: 0, l: 0, r: 1, s: '' });            // bloque la droite
  const { self } = mk(t, { x0: 0, z0: 0, x1: 2, z1: 0 });
  const n0 = t.tiles.length;
  assert.equal(self.duplicateNow(), true);
  assert.deepEqual(t.tiles.slice(n0).map((c) => [c.x, c.z]), [[0, 1], [1, 1], [2, 1]], 'en dessous');
  const t2 = mkTrack();                                               // tout autour bloqué (cases libres seulement en hauteur)
  for (const [x, z] of [[3, 0], [0, 1], [-3, 0], [0, -1]]) t2.add({ t: 'straight', x, z, l: 0, r: 1, s: '' });
  const m = mk(t2, { x0: 0, z0: 0, x1: 2, z1: 0 }), k0 = t2.tiles.length;
  assert.equal(m.self.duplicateNow(), true);
  assert.deepEqual(t2.tiles.slice(k0).map((c) => c.l), [1, 1, 1], 'un niveau plus haut quand le plan est bloqué');
  assert.equal(m.calls.commit, 1);
});
test('aucune place : rien ne change, pas de pas d\'annulation, message clair', () => {
  const t = mkTrack();
  for (const dl of [0, 1, -1]) for (const [x, z] of [[3, 0], [0, 1], [-3, 0], [0, -1]]) if (dl >= 0) t.add({ t: 'straight', x, z, l: dl, r: 1, s: '' });
  for (const [x, z] of [[3, 0], [0, 1], [-3, 0], [0, -1]]) t.add({ t: 'straight', x, z, l: 0, r: 1, s: '' });
  const { self, calls } = mk(t, { x0: 0, z0: 0, x1: 2, z1: 0 }), n0 = t.tiles.length;
  // le niveau -1 n'existe pas (l < 0) : seuls 0 et 1 sont essayés ; tout est bloqué
  const res = self.duplicateNow();
  assert.equal(res, false); assert.equal(t.tiles.length, n0); assert.equal(calls.commit, 0);
  assert.ok(calls.flash.some((m) => /Pas de place/.test(m)));
});
test('le départ n\'est jamais dupliqué (un seul par circuit), le reste de la zone l\'est', () => {
  const t = scriptTrack('s', 'start S3 C S3 finish');
  const xs = t.tiles.flatMap((p) => p.x), n0 = t.tiles.length;
  const rect = { x0: Math.min(...t.tiles.map((p) => p.x)), z0: Math.min(...t.tiles.map((p) => p.z)), x1: Math.max(...t.tiles.map((p) => p.x + 1)), z1: Math.max(...t.tiles.map((p) => p.z + 1)) };
  assert.ok(xs.length);
  const { self, calls } = mk(t, rect);
  const ok = self.duplicateNow();
  assert.equal(ok, true, 'une place libre existe');
  assert.equal(t.tiles.filter((p) => p.t === 'start').length, 1, 'toujours un seul départ');
  assert.equal(t.tiles.length, n0 * 2 - 1, 'toutes les pièces sauf le départ sont dupliquées');
  assert.equal(calls.commit, 1);
});
test('sans zone sélectionnée (ou autre outil) : Ctrl+D retombe sur l\'inspecteur (une pièce)', () => {
  const t = mkTrack();
  const a = mk(t, null); a.self.duplicateNow(); assert.equal(a.calls.inspectorDup, 1);
  const b = mk(t, { x0: 0, z0: 0, x1: 2, z1: 0 }, { tool: 'inspect' }); b.self.duplicateNow(); assert.equal(b.calls.inspectorDup, 1);
  assert.equal(t.tiles.length, 3, 'rien n\'a été copié par la zone');
});
test('zone vide : message, rien de copié', () => {
  const t = mkTrack(), { self, calls } = mk(t, { x0: 20, z0: 20, x1: 22, z1: 22 });
  assert.equal(self.duplicateNow(), false); assert.equal(t.tiles.length, 3); assert.equal(calls.commit, 0);
  assert.ok(calls.flash.some((m) => /Rien à dupliquer/.test(m)));
});
test('une décoration seule (sans pièce) dans la zone est dupliquée aussi', () => {
  const t = new Track('x');
  t.addDeco({ k: 'tree', x: 0.5 * CELL, y: 3 * LEVEL_H * 0, z: 0.5 * CELL, ry: 0, s: 1, c: 0 });
  const { self } = mk(t, { x0: 0, z0: 0, x1: 0, z1: 0 });
  assert.equal(self.duplicateNow(), true); assert.equal(t.decos.length, 2);
});


console.log('Cas limites');
test('la SEULE pièce de départ sélectionnée : rien n\'est créé, pas de « succès », aucun pas d\'annulation, la sélection ne bouge pas, le circuit est inchangé', () => {
  const t = scriptTrack('s', 'start S3 C S3 finish');
  const st = t.tiles.find((p) => p.t === 'start');
  const rect = { x0: st.x, z0: st.z, x1: st.x, z1: st.z };
  const before = t.encode(), ver = t.version;
  const { self, calls } = mk(t, { ...rect });
  assert.equal(self.duplicateNow(), false);
  assert.equal(t.encode(), before); assert.equal(t.version, ver, 'le circuit n\'a même pas été touché');
  assert.equal(calls.commit, 0); assert.equal(calls.changed, 0);
  assert.deepEqual(self.sel, rect);
  assert.ok(calls.flash.some((m) => /départ est unique/.test(m)) && !calls.flash.some((m) => /Dupliqué/.test(m)));
});
test('départ + une décoration : la décoration seule est copiée (le départ jamais), et le message le dit', () => {
  const t = scriptTrack('s', 'start S3 C S3 finish');
  const st = t.tiles.find((p) => p.t === 'start');
  t.addDeco({ k: 'tree', x: st.x * CELL + 4, y: 0, z: st.z * CELL + 4, ry: 0.2, s: 1, c: 0 });
  const { self, calls } = mk(t, { x0: st.x, z0: st.z, x1: st.x, z1: st.z });
  const n = t.tiles.length;
  assert.equal(self.duplicateNow(), true);
  assert.equal(t.tiles.length, n); assert.equal(t.decos.length, 2);
  assert.equal(calls.commit, 1); assert.ok(calls.flash.some((m) => /Dupliqué : 0 pièce, 1 décoration \(le départ reste unique\)/.test(m)), calls.flash.join(' | '));
});
test('une seule pièce : copiée, avec toutes ses propriétés (revêtement, couleurs, rotation, orientation, mouvement, option, thème, groupe)', () => {
  const t = new Track('p');
  const src = t.add({ t: 'straight', x: 0, z: 0, l: 0, r: 3, s: 'ice', p: 150, col: { road: '#112233', line: '#ffffff' }, nb: 1, tn: 1, th: 2, mv: 2, ms: 40, ma: 3, g: 4 });
  const cells = Track.cellsOf(src);                                   // (une glissière occupe plusieurs cases : la zone doit les contenir toutes)
  const rect = { x0: Math.min(...cells.map((q) => q[0])), z0: Math.min(...cells.map((q) => q[1])), x1: Math.max(...cells.map((q) => q[0])), z1: Math.max(...cells.map((q) => q[1])) };
  const { self, calls } = mk(t, rect);
  assert.equal(self.duplicateNow(), true);
  assert.equal(t.tiles.length, 2); const c = t.tiles[1];
  for (const k of ['t', 'r', 's', 'p', 'nb', 'tn', 'th', 'mv', 'ms', 'ma', 'g', 'l']) assert.equal(c[k], src[k], 'propriété ' + k);
  assert.deepEqual(c.col, src.col); assert.notEqual(c.col, src.col, 'objet de couleurs distinct');
  assert.equal(c.x, src.x + (rect.x1 - rect.x0 + 1)); assert.equal(calls.commit, 1);
});
test('décorations seules et mélangées, avec rotations personnalisées (cap, inclinaison, roulis), groupe, couleur libre, obstacle et pièce perso', () => {
  const t = new Track('m');
  t.add({ t: 'straight', x: 0, z: 0, l: 0, r: 1, s: '' });
  const d0 = t.addDeco({ k: 'tree', x: 10, y: 0, z: 10, ry: 1.1, s: 1.4, c: 3, rx: 0.5, rz: -0.7, g: 2, cc: '#abcdef' });
  const o = t.addDeco({ k: obstacleKind, x: 20, y: 0, z: 20, ry: 2.2, s: 1, c: 0, ph: 0.25 });
  const cu = t.addDeco({ k: 'custom', x: 5, y: 0, z: 5, ry: 0, s: 1, c: 0, cp: [{ s: 'box', x: 0, y: 1, z: 0, sx: 1, sy: 1, sz: 1, ry: 30, c: '#ff0000', g: 0 }] });
  const { self } = mk(t, { x0: 0, z0: 0, x1: 0, z1: 0 });
  assert.equal(self.duplicateNow(), true);
  assert.equal(t.decos.length, 6);
  const [c0, c1, c2] = t.decos.slice(3);
  assert.deepEqual([c0.rx, c0.rz, c0.ry, c0.s, c0.c, c0.g, c0.cc], [0.5, -0.7, 1.1, 1.4, 3, 2, '#abcdef']);
  assert.ok(!('rx' in c1) && c1.ph === 0.25 && c1.ry === 2.2, 'l\'obstacle garde sa phase et son cap, jamais d\'inclinaison');
  assert.deepEqual(c2.cp.map((q) => [q.s, q.ry, q.c]), [['box', 30, '#ff0000']]); assert.notEqual(c2.cp, cu.cp, 'formes de la pièce perso copiées, pas partagées');
  assert.ok(Math.abs(c0.x - (d0.x + CELL)) < 1e-9 && Math.abs(c1.x - (o.x + CELL)) < 1e-9);
});
test('limite de décorations : TOUT OU RIEN (les pièces déjà posées sont retirées), aucun succès annoncé, aucun pas d\'annulation', async () => {
  const { MAX_DECOS } = await import('../js/constants.js');
  const t = new Track('l');
  t.add({ t: 'straight', x: 0, z: 0, l: 0, r: 1, s: '' });
  for (let i = 0; i < MAX_DECOS - 1; i++) t.addDeco({ k: 'tree', x: 5, y: 0, z: 5, ry: 0, s: 1, c: 0 });
  t.addDeco({ k: 'tree', x: 6, y: 0, z: 6, ry: 0, s: 1, c: 0 });          // exactement MAX_DECOS décorations : plus aucune place
  assert.equal(t.decos.length, MAX_DECOS);
  const before = t.encode();
  const { self, calls } = mk(t, { x0: 0, z0: 0, x1: 0, z1: 0 });
  assert.equal(self.duplicateNow(), false);
  assert.equal(t.encode(), before, 'la pièce posée avant le refus a été retirée');
  assert.equal(t.tiles.length, 1); assert.equal(calls.commit, 0);
  assert.ok(calls.flash.some((m) => /limite de décorations/.test(m)) && !calls.flash.some((m) => /Dupliqué/.test(m)));
});
test('zone occupée de tous côtés (même un niveau plus haut) : refus clair, rien ne change', () => {
  const t = mkTrack();
  for (const dl of [0, 1]) for (const [x, z] of [[3, 0], [0, 1], [-3, 0], [0, -1]]) t.add({ t: 'straight', x, z, l: dl, r: 1, s: '' });
  const { self, calls } = mk(t, { x0: 0, z0: 0, x1: 2, z1: 0 }); const n = t.tiles.length;
  assert.equal(self.duplicateNow(), false); assert.equal(t.tiles.length, n); assert.equal(calls.commit, 0);
});

await finish('Tous les tests de duplication (Ctrl+D) passent.');
