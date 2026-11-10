// Géométrie des véhicules du garage, MESURÉE sur le vrai modèle 3D (carModel.js) pour CHAQUE carrosserie et CHAQUE option : node tools/test-garage-geometry.mjs   (npm test)
// Un test qui compte les maillages ne voit pas une aile qui flotte, un motif posé au-dessus d'une caisse basse ou une roue enfoncée dans la coque : ceux-ci les mesurent.
// (Le rendu réel est regardé avec tools/garage-sheets.mjs : captures du garage, voir docs/GARAGE.md.)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };
const THREE = await import('../js/vendor/three.module.min.js');
const { CATALOG, PRESETS, sanitizeLoadout, DEFAULT_LOADOUT } = await import('../js/cosmetics.js');
const { createCar } = await import('../js/carModel.js');

const mk = (patch) => createCar(sanitizeLoadout({ ...DEFAULT_LOADOUT, ...patch }));
const meshes = (root) => { const out = []; root.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
const box = (o) => new THREE.Box3().setFromObject(o);
const tris = (root) => meshes(root).reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0);
const BODIES = CATALOG.body.map((x) => x.id);
const find = (car, name) => { let g = null; car.body.traverse((o) => { if (o.name === name) g = o; }); return g; };
const hullBox = (car) => { const b = new THREE.Box3(); car.body.updateMatrixWorld(true); car.body.traverse((o) => { if (o.isMesh && o.userData.hull) b.union(new THREE.Box3().setFromObject(o)); }); return b; };
// Pièces d'un groupe, regroupées en amas par contact (boîtes dilatées de 3 cm) : un aileron « flottant » donne plusieurs amas, ou un amas qui ne touche pas la coque.
const clusters = (group, grow = 0.03) => {
  const bs = meshes(group).map((m) => box(m).expandByScalar(grow)), id = bs.map((_, i) => i);
  const root = (i) => (id[i] === i ? i : (id[i] = root(id[i])));
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (bs[i].intersectsBox(bs[j])) id[root(i)] = root(j);
  const m = new Map(); bs.forEach((b, i) => { const r = root(i); m.set(r, (m.get(r) || new THREE.Box3()).union(b)); });
  return [...m.values()];
};

console.log('Carrosseries et roues');
test('chaque carrosserie : géométrie valide (aucun sommet NaN, aucune forme vide), proportions plausibles, quatre roues posées au sol et symétriques', () => {
  assert.ok(BODIES.length >= 17);
  for (const b of BODIES) {
    const car = mk({ body: b });
    for (const m of meshes(car.group)) {
      const p = m.geometry.attributes.position; assert.ok(p && p.count > 0, `${b} : forme vide`);
      for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${b} : sommet non fini`);
    }
    const h = hullBox(car), size = h.getSize(new THREE.Vector3());
    assert.ok(size.z > 3 && size.z < 6.2, `${b} : longueur ${size.z.toFixed(2)} m`);
    assert.ok(size.x > 1.3 && size.x < 2.4, `${b} : largeur ${size.x.toFixed(2)} m`);
    assert.ok(size.y > 0.6 && size.y < 2.2, `${b} : hauteur ${size.y.toFixed(2)} m`);
    assert.equal(car.wheels.length, 4, `${b} : quatre roues`);
    const ws = car.wheels.map((w) => { car.group.updateMatrixWorld(true); return box(w.pivot); });
    for (const wb of ws) assert.ok(Math.abs(wb.min.y) < 0.02, `${b} : une roue ne touche pas le sol (${wb.min.y.toFixed(3)})`);
    const cx = ws.map((w) => (w.min.x + w.max.x) / 2).sort((p, q) => p - q), cz = ws.map((w) => (w.min.z + w.max.z) / 2).sort((p, q) => p - q);
    assert.ok(Math.abs(cx[0] + cx[3]) < 0.01 && Math.abs(cx[1] + cx[2]) < 0.01, `${b} : roues asymétriques`);
    // roues dans l'empreinte de la coque : ni très en avant du nez, ni enfoncées dans le milieu de la caisse
    assert.ok(cz[0] > h.min.z - 0.3 && cz[3] < h.max.z + 0.3, `${b} : roues hors de la coque en longueur`);
    assert.ok(Math.abs(cx[3]) - 0.2 > h.max.x - 0.55, `${b} : roues trop rentrées dans la coque (${(Math.abs(cx[3]) - 0.2).toFixed(2)} contre ${(h.max.x).toFixed(2)})`);
  }
});
test('le traîneau a ses deux patins (reliés à la caisse), les autres carrosseries n\'en ont pas', () => {
  const sleigh = mk({ body: 'sleigh' }), plain = mk({ body: 'sport' });
  assert.ok(meshes(sleigh.group).length > meshes(plain.group).length + 4, 'patins et montants');
});

console.log('Ailerons');
test('chaque aileron sur chaque carrosserie : d\'UN SEUL TENANT (aucune pièce qui flotte) et relié à la coque', () => {
  for (const b of BODIES) for (const sp of CATALOG.spoiler.map((x) => x.id).filter((x) => x !== 'none')) {
    const car = mk({ body: b, spoiler: sp }); car.group.updateMatrixWorld(true);
    const g = find(car, 'spoiler'), h = hullBox(car).expandByScalar(0.06);
    assert.ok(g && meshes(g).length > 0, `${b}/${sp} : aileron présent`);
    const cl = clusters(g);
    assert.equal(cl.length, 1, `${b}/${sp} : l'aileron est en ${cl.length} morceaux séparés (pièce flottante)`);
    assert.ok(cl[0].intersectsBox(h), `${b}/${sp} : l'aileron ne touche pas la coque`);
    // …et il REPOSE sur le pont arrière : son point le plus bas descend jusqu'à la surface de la coque, mesurée par un rayon vertical au centre de l'aileron (la boîte de la
    // coque englobe aussi le toit : elle ne suffit pas à voir un aileron qui flotte au-dessus du coffre).
    const cz = (cl[0].min.z + cl[0].max.z) / 2, rc = new THREE.Raycaster(new THREE.Vector3(0, 6, cz), new THREE.Vector3(0, -1, 0));
    const hit = rc.intersectObjects(meshes(car.body).filter((m) => m.userData.hull), false)[0];
    if (hit) assert.ok(cl[0].min.y <= hit.point.y + 0.1, `${b}/${sp} : l'aileron flotte (bas à ${cl[0].min.y.toFixed(2)} m au-dessus de la coque à ${hit.point.y.toFixed(2)} m)`);
  }
});

console.log('Ornements');
test('chaque ornement sur chaque carrosserie : posé sur la coque (ni flottant, ni enfoncé), centré, de taille raisonnable', () => {
  for (const b of BODIES) for (const o of CATALOG.ornament.map((x) => x.id).filter((x) => x !== 'none')) {
    const car = mk({ body: b, ornament: o }); car.group.updateMatrixWorld(true);
    const g = find(car, 'ornament'), h = hullBox(car);
    assert.ok(g && meshes(g).length > 0, `${b}/${o} : ornement présent`);
    const ob = box(g), size = ob.getSize(new THREE.Vector3());
    for (const v of [ob.min.x, ob.min.y, ob.min.z, ob.max.x, ob.max.y, ob.max.z]) assert.ok(Number.isFinite(v), `${b}/${o} : boîte non finie`);
    assert.ok(ob.intersectsBox(h.clone().expandByScalar(0.08)), `${b}/${o} : l'ornement ne touche pas la coque (il flotte)`);
    assert.ok(ob.max.y > h.max.y - 0.05 || o === 'horns', `${b}/${o} : l'ornement est entièrement DANS la coque (invisible)`);
    assert.ok(size.y < 2.6 && size.x < 2.6 && size.z < 3.6, `${b}/${o} : taille ${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)} m`);
    assert.ok(Math.abs((ob.min.x + ob.max.x) / 2) < 0.8, `${b}/${o} : ornement décentré`);
  }
});

console.log('Motifs');
test('chaque motif sur chaque carrosserie : entièrement sur le flanc (ni dans le vide au-dessus d\'une caisse basse, ni sous le seuil), des deux côtés', () => {
  const pats = CATALOG.decal.map((x) => x.id).filter((x) => !['none', 'stripe', 'twin'].includes(x));
  for (const b of BODIES) for (const d of pats) {
    const car = mk({ body: b, decal: d }); car.group.updateMatrixWorld(true);
    const h = hullBox(car), parts = meshes(car.body).filter((m) => m.userData.decal);
    assert.ok(parts.length >= 2, `${b}/${d} : motif présent`);
    const left = parts.filter((m) => box(m).max.x < 0).length, right = parts.filter((m) => box(m).min.x > 0).length;
    assert.ok(left > 0 && right > 0, `${b}/${d} : motif d'un seul côté`);
    for (const m of parts) {
      const mb = box(m);
      assert.ok(mb.min.y > h.min.y - 0.02 && mb.max.y < h.max.y + 0.02, `${b}/${d} : motif de ${mb.min.y.toFixed(2)} à ${mb.max.y.toFixed(2)} m, coque de ${h.min.y.toFixed(2)} à ${h.max.y.toFixed(2)}`);
      assert.ok(mb.min.z > h.min.z - 0.05 && mb.max.z < h.max.z + 0.05, `${b}/${d} : motif hors de la longueur de la coque`);
    }
  }
});

console.log('Coût d\'affichage');
test('aucune variante ne ralentit l\'affichage : nombre de triangles et de formes bornés, par rapport à la voiture de base', () => {
  const base = mk({}), baseTris = tris(base.group), baseMeshes = meshes(base.group).length;
  let worst = 0, worstName = '';
  const variants = [];
  for (const [cat, items] of Object.entries(CATALOG)) for (const it of items) variants.push([cat + ':' + it.id, { [cat]: it.id }]);
  for (const p of PRESETS) variants.push(['preset:' + p.id, p.loadout]);
  for (const [name, patch] of variants) {
    const car = mk(patch), t = tris(car.group), n = meshes(car.group).length;
    assert.ok(t < 25000, `${name} : ${Math.round(t)} triangles`);
    assert.ok(n < 400, `${name} : ${n} formes`);
    if (t > worst) { worst = t; worstName = name; }
  }
  assert.ok(worst < baseTris * 3.2, `la variante la plus lourde (${worstName}, ${Math.round(worst)} triangles) dépasse 3,2 fois la voiture de base (${Math.round(baseTris)})`);
  assert.ok(baseMeshes > 20);
});
test('construire une voiture est rapide (moyenne sur toutes les carrosseries)', () => {
  const t0 = performance.now(); let n = 0;
  for (const b of BODIES) for (let i = 0; i < 3; i++, n++) mk({ body: b, ornament: 'xtree', spoiler: 'gt', decal: 'hearts', led: 'cyan' });
  const ms = (performance.now() - t0) / n;
  assert.ok(ms < 40, `${ms.toFixed(1)} ms par voiture`);
});

console.log('Traînées et sauvegarde');
await test('chaque traînée a une couleur valide (ou l\'arc-en-ciel) et se dessine sans valeur invalide', async () => {
  const { TrailRibbon } = await import('../js/trail.js');
  for (const t of CATALOG.trail) {
    assert.ok(t.id === 'none' || t.rainbow || /^#[0-9a-f]{6}$/i.test(t.color || ''), `${t.id} : couleur invalide`);
    const rib = new TrailRibbon(new THREE.Scene());
    for (let i = 0; i < 12; i++) rib.update(0.016, new THREE.Vector3(i * 0.5, 0.7, 2.3), new THREE.Vector3(1, 0, 0), 30, i % 2 ? 1 : 0, t.rainbow ? null : (t.color || '#ffffff'), i * 0.016, new THREE.Vector3(0, 5, 10), 1);
    for (const a of ['position', 'color']) for (const v of rib.geo.attributes[a].array) assert.ok(Number.isFinite(v), `${t.id} : ${a} non fini`);
  }
});
test('tout équipement (catalogue, préréglages) survit à un aller-retour de sauvegarde (JSON, code joueur) à l\'identique ; un identifiant inconnu est ramené au défaut', () => {
  const same = (l) => { const a = sanitizeLoadout(l); return JSON.stringify(sanitizeLoadout(JSON.parse(JSON.stringify(a)))) === JSON.stringify(a); };
  for (const [cat, items] of Object.entries(CATALOG)) for (const it of items) assert.ok(same({ [cat]: it.id, color: '#12ab34', color2: '#ffeedd' }), cat + ':' + it.id);
  for (const p of PRESETS) { assert.ok(same(p.loadout), p.id); const a = sanitizeLoadout(p.loadout); for (const k of Object.keys(p.loadout)) if (k !== 'custom') assert.equal(a[k], p.loadout[k], `${p.id} : ${k} modifié par la sanitisation`); }
  assert.equal(sanitizeLoadout({ ornament: 'inconnu' }).ornament, 'none');
});

await finish('Tous les tests de géométrie du garage passent.');
