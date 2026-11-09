// Tests du retournement de caméra : node tools/test-camera.mjs   (npm test)
import assert from 'node:assert/strict';
import * as THREE from '../js/vendor/three.module.min.js';
import { CamFlip, FLIP_DURATION } from '../js/camflip.js';
import { test, finish } from './harness.mjs';

const DT = 1 / 60;
const view = (tiltDeg) => new THREE.Vector3(0, -Math.sin(tiltDeg * Math.PI / 180), -Math.cos(tiltDeg * Math.PI / 180));

test('la transition dure au plus 0,5 s et se termine exactement à l’envers', () => {
  assert.ok(FLIP_DURATION <= 0.5);
  const f = new CamFlip(), up = new THREE.Vector3(0, 1, 0), axis = view(15);
  f.update(DT, 1, axis, up);
  let frames = 0;
  while (f.update(DT, -1, axis, up)) { frames++; assert.ok(frames < 40, 'ne se termine pas'); }
  assert.ok((frames + 1) * DT <= 0.5 + DT, `durée ${(frames + 1) * DT}`);
  assert.ok(up.distanceTo(new THREE.Vector3(0, -1, 0)) < 1e-9, 'haut final = bas du monde');
});

test('jamais de vecteur nul, toujours unitaire, rotation monotone (demi-tour)', () => {
  for (const tilt of [0, 15, -20, 40]) {
    const f = new CamFlip(), up = new THREE.Vector3(0, 1, 0), axis = view(tilt);
    f.update(DT, 1, axis, up);
    let prev = 0;
    for (let i = 0; i < 40 && (i === 0 || f.active); i++) {
      f.update(DT, -1, axis, up);
      assert.ok(Math.abs(up.length() - 1) < 1e-6, `norme ${up.length()} (inclinaison ${tilt}°)`);
      const roll = Math.acos(Math.max(-1, Math.min(1, up.clone().addScaledVector(axis, -up.dot(axis)).normalize().dot(new THREE.Vector3(0, 1, 0).addScaledVector(axis, -axis.y).normalize()))));
      assert.ok(roll + 1e-6 >= prev, 'le roulis ne revient pas en arrière');
      prev = roll;
    }
  }
});

test('retour à l’endroit : même chose dans l’autre sens', () => {
  const f = new CamFlip(), up = new THREE.Vector3(0, -1, 0), axis = view(10);
  f.cut(-1, up);
  while (f.update(DT, 1, axis, up)) { assert.ok(Math.abs(up.length() - 1) < 1e-6); }
  assert.ok(up.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-9);
});

test('coupure franche : orientation immédiate, aucune transition', () => {
  const f = new CamFlip(), up = new THREE.Vector3(0.3, -0.9, 0.1).normalize(), axis = view(0);
  f.update(DT, 1, axis, new THREE.Vector3(0, 1, 0));
  f.update(DT, -1, axis, up);                        // transition en cours
  assert.ok(f.active);
  f.cut(1, up);                                      // mort la tête en bas, on recommence à l'endroit
  assert.ok(!f.active);
  assert.ok(up.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-12);
  assert.equal(f.update(DT, 1, axis, up), false, 'pas de faux retournement après la coupure');
  f.cut(-1, up);                                     // réapparition en gravité inversée
  assert.ok(up.distanceTo(new THREE.Vector3(0, -1, 0)) < 1e-12);
  assert.equal(f.update(DT, -1, axis, up), false);
});

test('visée presque verticale : pas de NaN', () => {
  const f = new CamFlip(), up = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3(0, -1, 0);
  f.update(DT, 1, axis, up);
  for (let i = 0; i < 40; i++) { f.update(DT, -1, axis, up); assert.ok(Number.isFinite(up.x + up.y + up.z)); }
});

await finish('Tous les tests de caméra passent.');
