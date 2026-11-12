// Rotations des décorations (éditeur) : cap (ry), inclinaison (rx), roulis (rz) : node tools/test-deco-rotation.mjs   (npm test)
// Purement visuelles : jamais sur un obstacle, jamais dans la signature ni la physique ; rétro-compatibles (un circuit sans inclinaison garde son code exact).
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import * as THREE from '../js/vendor/three.module.min.js';
import { Track, scriptTrack } from '../js/track.js';
import { rotateClip } from '../js/editorTools.js';
import { setDecoRotation, buildDecoMesh } from '../js/decos.js';
import { EditorSession } from '../js/editor.js';
import { CELL } from '../js/constants.js';
import { OBST } from '../js/obstacles.js';

const base = () => scriptTrack('r', 'start S4 C S4 finish');
const obstacleKind = Object.keys(OBST)[0];

console.log('Données');
test('inclinaison et roulis sont gardés (ramenés dans [-π, π]), absents quand la décoration est droite', () => {
  const t = base();
  const a = t.addDeco({ k: 'tree', x: 10, y: 0, z: 10, ry: 1, s: 1, c: 0, rx: 0.5, rz: -0.25 });
  assert.equal(a.rx, 0.5); assert.equal(a.rz, -0.25);
  const b = t.addDeco({ k: 'tree', x: 20, y: 0, z: 10, ry: 0, s: 1, c: 0, rx: 3 * Math.PI, rz: 0 });
  assert.ok(Math.abs(Math.abs(b.rx) - Math.PI) < 1e-2, 'trois demi-tours = un demi-tour'); assert.ok(!('rz' in b), 'zéro : pas de champ');
  const c = t.addDeco({ k: 'tree', x: 30, y: 0, z: 10, ry: 0, s: 1, c: 0, rx: NaN, rz: Infinity });
  assert.ok(!('rx' in c) && !('rz' in c), 'valeurs non finies ignorées');
});
test('un OBSTACLE ne prend jamais d\'inclinaison (rx) ; son roulis (rz, phase 3 : posé sur un mur ou au plafond) est ramené au pas de 45° car sa forme de contact tourne avec lui', () => {
  const t = base();
  const o = t.addDeco({ k: obstacleKind, x: 10, y: 0, z: 10, ry: 1, s: 1, c: 0, rx: 1, rz: 1 });
  assert.ok(o && !('rx' in o));
  assert.equal(o.rz, +(Math.PI / 4).toFixed(3), '1 rad → 45°');
  assert.ok(!('rz' in t.addDeco({ k: obstacleKind, x: 10, y: 0, z: 10, ry: 1, s: 1, c: 0, rz: 0.1 })), 'moins de 22,5° : posé à plat');
});
console.log('Code partagé');
test('aller-retour dans le code : inclinaison et roulis reviennent, avec groupe, couleur libre et pièce perso en même temps', () => {
  const t = base();
  t.addDeco({ k: 'tree', x: 10, y: 0, z: 10, ry: 1, s: 1, c: 0, rx: 0.5, rz: -0.25 });
  t.addDeco({ k: 'tree', x: 20, y: 0, z: 10, ry: 2, s: 1.5, c: 2, cc: '#ff8800', g: 3, rz: 1.2 });
  t.addDeco({ k: 'tree', x: 30, y: 0, z: 10, ry: 0, s: 1, c: 0 });
  const back = Track.decode(t.encode());
  const d = back.decos;
  assert.equal(d.length, 3);
  assert.deepEqual([d[0].rx, d[0].rz], [0.5, -0.25]);
  assert.deepEqual([d[1].rx || 0, d[1].rz, d[1].g, d[1].cc], [0, 1.2, 3, '#ff8800']);
  assert.ok(!('rx' in d[2]) && !('rz' in d[2]));
  assert.equal(back.encode(), t.encode(), 'stable : ré-encoder donne le même code');
});
test('RÉTRO-COMPATIBILITÉ : un circuit sans inclinaison garde EXACTEMENT son code et sa signature', () => {
  const t = base(); t.addDeco({ k: 'tree', x: 10, y: 0, z: 10, ry: 1, s: 1, c: 0 });
  const code = t.encode();
  const u = base(); u.addDeco({ k: 'tree', x: 10, y: 0, z: 10, ry: 1, s: 1, c: 0, rx: 0, rz: 0 });
  assert.equal(u.encode(), code, 'rx = rz = 0 : rien n\'est écrit');
  const w = base(); w.addDeco({ k: 'tree', x: 10, y: 0, z: 10, ry: 1, s: 1, c: 0, rx: 0.7 });
  assert.ok(u.signatureText().length > 10, 'la signature existe');
  assert.equal(w.signatureText(), u.signatureText(), 'la signature (vérification des temps) ignore l\'inclinaison');
});
test('un code sans 13e / 14e valeur (anciens circuits avec groupe) se lit : aucune inclinaison', () => {
  const t = base(); t.addDeco({ k: 'tree', x: 10, y: 0, z: 10, ry: 1, s: 1, c: 0, g: 2 });
  const d = Track.decode(t.encode()).decos[0];
  assert.ok(d.g === 2 && !d.rx && !d.rz);
});

console.log('Annuler / rétablir');
test('l\'instantané de l\'éditeur garde inclinaison et roulis (annuler / rétablir)', () => {
  const t = base(); t.addDeco({ k: 'tree', x: 10, y: 0, z: 10, ry: 1, s: 1, c: 0, rx: 0.5, rz: -0.25 });
  const ed = Object.create(EditorSession.prototype); Object.assign(ed, { track: t, level: 0, histSel: [null], hIndex: 0, _changed() {}, inspector: { restore() {} }, _applyDecor() {} });
  const snap = ed._snapshot();
  t.decos[0].rx = 2; t.decos[0].rz = 2;
  ed._restore(snap);
  assert.deepEqual([ed.track.decos[0].rx, ed.track.decos[0].rz], [0.5, -0.25]);
});

console.log('Rotation d\'une zone');
test('pivoter une zone d\'un quart de tour ne change que le cap : la décoration inclinée finit EXACTEMENT là où la rotation de l\'ensemble la met', () => {
  const clip = { w: 2, h: 2, tiles: [], decos: [{ k: 'tree', x: 0.6 * CELL, y: 1, z: 1.3 * CELL, ry: 0.4, s: 1, c: 0, rx: 0.7, rz: -0.3 }] };
  const R = rotateClip(clip, true);
  const d0 = clip.decos[0], d1 = R.decos[0];
  assert.equal(d1.rx, 0.7); assert.equal(d1.rz, -0.3);
  // orientation avant : q0 ; après : q1 ; elles doivent différer d'un quart de tour autour de la verticale (monde)
  const o0 = setDecoRotation(new THREE.Object3D(), d0), o1 = setDecoRotation(new THREE.Object3D(), d1);
  const q0 = o0.quaternion.clone(), q1 = o1.quaternion.clone();
  const qr = q1.clone().multiply(q0.clone().invert());                 // rotation appliquée au monde
  const e = new THREE.Euler().setFromQuaternion(qr, 'YXZ');
  assert.ok(Math.abs(e.x) < 1e-9 && Math.abs(e.z) < 1e-9, 'aucune composante X / Z : c\'est bien une rotation autour de la verticale');
  assert.ok(Math.abs(Math.abs(e.y) - Math.PI / 2) < 1e-9, 'd\'un quart de tour');
});

console.log('Rendu');
test('l\'aperçu 3D d\'une décoration inclinée est tourné comme demandé (ordre cap, inclinaison, roulis) ; droite : inchangé', () => {
  const mat = new THREE.MeshBasicMaterial();
  const straight = buildDecoMesh({ k: 'tree', x: 5, y: 0, z: 5, ry: 0.5, s: 1, c: 0 }, mat);
  const tilted = buildDecoMesh({ k: 'tree', x: 5, y: 0, z: 5, ry: 0.5, s: 1, c: 0, rx: Math.PI / 2, rz: 0 }, mat);
  assert.equal(straight.rotation.x, 0); assert.equal(straight.rotation.z, 0); assert.equal(straight.rotation.y, 0.5);
  assert.equal(tilted.rotation.order, 'YXZ'); assert.ok(Math.abs(tilted.rotation.x - Math.PI / 2) < 1e-12);
  // un arbre couché : sa hauteur devient une longueur horizontale
  straight.updateMatrixWorld(true); tilted.updateMatrixWorld(true);
  const bs = new THREE.Box3().setFromObject(straight), bt = new THREE.Box3().setFromObject(tilted);
  assert.ok(bs.max.y - bs.min.y > 2, 'droit : haut');
  assert.ok(bt.max.y - bt.min.y < (bs.max.y - bs.min.y) * 0.7, 'couché à 90° : bien moins haut');
});

await finish('Tous les tests de rotation des décorations passent.');
