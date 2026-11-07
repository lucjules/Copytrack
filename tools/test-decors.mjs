// Décors procéduraux : rien ne flotte (canopées sur leurs troncs, néons sur leurs immeubles) : node tools/test-decors.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';

const ctx2d = new Proxy({}, { get: () => () => {}, set: () => true });
globalThis.document = { createElement: () => ({ getContext: () => ctx2d, width: 0, height: 0 }) };
const THREE = await import('../js/vendor/three.module.min.js');
const { Scenery } = await import('../js/scenery.js');
const { scriptTrack } = await import('../js/track.js');

function build(theme, seed) {
  const sc = new Scenery(new THREE.Scene(), 'high');
  const tr = scriptTrack('d', 'start S6 finish');
  tr.decor = theme;
  sc.setTrack(tr, seed);
  return sc;
}
// Instances d'un maillage instancié : [{ x, y, z, sx, sy, sz }]
function instances(mesh) {
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), out = [];
  for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); m.decompose(p, q, s); out.push({ x: p.x, y: p.y, z: p.z, sx: s.x, sy: s.y, sz: s.z }); }
  return out;
}
const meshes = (sc) => sc.decor.children.filter((c) => c.isInstancedMesh);

for (const seed of ['a', 'b', 'c']) {
  test(`ville (graine ${seed}) : chaque néon est contre la façade d'un immeuble, sous son toit`, () => {
    const ms = meshes(build('city', seed));
    const towers = instances(ms.find((m) => m.material.emissiveMap));
    const neons = ms.filter((m) => m.material.isMeshBasicMaterial && m.material.color.getHex() !== 0xffffff).flatMap(instances);
    assert.ok(towers.length > 20 && neons.length > 10);
    for (const n of neons) {
      const t = towers.find((b) => Math.abs(n.x - b.x) <= b.sx / 2 + 1 && Math.abs(n.z - b.z) <= b.sz / 2 && n.y >= b.y && n.y + n.sy <= b.y + b.sy + 1e-6);
      assert.ok(t, `néon en l'air en (${n.x.toFixed(0)}, ${n.y.toFixed(0)}, ${n.z.toFixed(0)})`);
    }
  });
  test(`jungle (graine ${seed}) : chaque canopée est posée au sommet d'un tronc`, () => {
    const ms = meshes(build('jungle', seed));
    const trunks = instances(ms.find((m) => m.material.vertexColors));
    const caps = ms.filter((m) => m.material.emissiveIntensity === 0.5 && m.material.emissive.getHex() !== 0).flatMap(instances);
    assert.ok(trunks.length > 20 && caps.length > 20);
    for (const c of caps) {
      const t = trunks.find((k) => Math.abs(c.x - k.x) < 0.01 && Math.abs(c.z - k.z) < 0.01 && Math.abs(c.y - (k.y + 22 * k.sy)) < c.sx);
      assert.ok(t, `canopée sans tronc en (${c.x.toFixed(0)}, ${c.y.toFixed(0)}, ${c.z.toFixed(0)})`);
    }
  });
}
await finish('Tous les tests des décors passent.');
