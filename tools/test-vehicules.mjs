// Géométrie visible des véhicules (0.13.1, js/carModel.js) : néons taillés sur chaque carrosserie (barres entre les roues, halo à la taille de la
// voiture), néons de la moto sous la moto, jantes néon visibles sur la moto, pilote de moto complet (mains au guidon, pieds aux repose-pieds).
//   node tools/test-vehicules.mjs   (npm test)
import assert from 'node:assert/strict';
import * as THREE from '../js/vendor/three.module.min.js';
import { test, finish } from './harness.mjs';
import { createCar } from '../js/carModel.js';
import { CATALOG } from '../js/cosmetics.js';

// (la texture de lueur des néons se dessine sur un canvas : une toile factice suffit sous Node)
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };
const shown = (o) => { for (let e = o; e; e = e.parent) if (!e.visible) return false; return true; };
const meshes = (car) => { const out = []; car.group.updateMatrixWorld(true); car.group.traverse((o) => { if (o.isMesh && shown(o)) out.push(o); }); return out; };
const isBar = (o) => o.geometry.type === 'BoxGeometry' && Math.abs(o.geometry.parameters.width - 0.07) < 1e-9 && Math.abs(o.geometry.parameters.height - 0.05) < 1e-9;
const isHalo = (o) => o.geometry.type === 'PlaneGeometry' && o.material && o.material.blending === THREE.AdditiveBlending;
const box = (o) => new THREE.Box3().setFromObject(o);

test('voiture : pour les 17 carrosseries, les barres néon restent entre les roues (avant : à ±1,33 m, au-delà des pneus) et le halo épouse la voiture (avant : 3,8 × 6,2 m)', () => {
  for (const { id } of CATALOG.body) {
    const car = createCar({ body: id, led: 'cyan' }), M = meshes(car);
    const bars = M.filter(isBar), halo = M.find(isHalo);
    assert.equal(bars.length, 2, id);
    for (const b of bars) { const bb = box(b); assert.ok(Math.max(-bb.min.x, bb.max.x) < 0.82, `${id} : barre à ${Math.max(-bb.min.x, bb.max.x).toFixed(2)} m (face intérieure des pneus : 0,82 m)`); }
    const hb = box(halo);
    assert.ok(hb.max.x - hb.min.x <= 2.5 + 1e-9, `${id} : halo large de ${(hb.max.x - hb.min.x).toFixed(2)} m`);
    assert.ok(hb.max.z - hb.min.z <= 5.6 + 1e-9, `${id} : halo long de ${(hb.max.z - hb.min.z).toFixed(2)} m`);
  }
});

test('moto : barres néon sous la moto (avant : à ±0,58 m, dans le vide), jantes néon sur les flancs des pneus (avant : cachées dedans)', () => {
  const car = createCar({ led: 'cyan', wheels: 'neon' }); car.setVehicle('moto', true);
  const M = meshes(car);
  for (const b of M.filter(isBar)) { const bb = box(b); assert.ok(Math.max(-bb.min.x, bb.max.x) <= 0.32, 'barre à ' + Math.max(-bb.min.x, bb.max.x).toFixed(2)); }
  const rings = M.filter((o) => o.geometry.type === 'TorusGeometry');
  assert.equal(rings.length, 4, 'deux anneaux par roue');
  for (const r of rings) assert.ok(Math.abs(r.position.x) >= 0.15 && r.geometry.parameters.radius >= 0.38, 'anneau sur le flanc, hors de la jante');
});

test('pilote de moto : cuisses, jambes, bras et avant-bras ; mains sur les poignées du guidon, pieds aux repose-pieds (route et chopper)', () => {
  for (const bike of ['sport', 'chopper']) {
    const car = createCar({ bike }); car.setVehicle('moto', true);
    const M = meshes(car);
    // gants : petits cubes de 0,13 m ; bottes : 0,16 × 0,12 × 0,32
    const gloves = M.filter((o) => o.geometry.type === 'BoxGeometry' && o.geometry.parameters.width === 0.13 && o.geometry.parameters.depth === 0.13 && o.geometry.parameters.height === 0.13);
    const boots = M.filter((o) => o.geometry.type === 'BoxGeometry' && o.geometry.parameters.width === 0.16 && o.geometry.parameters.depth === 0.32);
    assert.equal(gloves.length, 2, bike + ' : deux mains'); assert.equal(boots.length, 2, bike + ' : deux pieds');
    const bar = bike === 'chopper' ? { y: 2.12, z: -0.62 } : { y: 1.28, z: -0.95 };
    for (const g of gloves) assert.ok(Math.abs(g.position.y - bar.y) < 0.1 && Math.abs(g.position.z - bar.z) < 0.1, `${bike} : main à (${g.position.y.toFixed(2)}, ${g.position.z.toFixed(2)}), guidon à (${bar.y}, ${bar.z})`);
    for (const b of boots) assert.ok(Math.abs(b.position.x) >= 0.25, 'pied hors du carénage, visible');
  }
});

await finish('Néons et pilote de moto : à leur place sur chaque véhicule.');
