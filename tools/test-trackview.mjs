// Maillage du circuit par tronçons : le résultat est le même qu'un maillage unique, et une modification ne reconstruit que les tronçons touchés :
// node tools/test-trackview.mjs   (npm test). Pas de WebGL : seuls les objets Three.js sont construits.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';

globalThis.document = { createElement: () => ({ getContext: () => null, width: 0, height: 0 }) };   // canvas des plaques
const THREE = await import('../js/vendor/three.module.min.js');
const { TrackView, createTrackMaterials, buildTileInto } = await import('../js/trackMesh.js');
const { GeoBuilder, FxBuilder } = await import('../js/geo.js');
const { buildDecoInto } = await import('../js/decos.js');
const { Track } = await import('../js/track.js');
const { BUILTIN_TRACKS, buildBuiltin } = await import('../js/tracks.js');
const { isObstacle } = await import('../js/obstacles.js');
const { CELL } = await import('../js/constants.js');

const mats = createTrackMaterials();
const triangles = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
// Triangles de tout ce qui est statique dans la vue (tronçons) et boîte englobante.
function staticStats(view) {
  let tris = 0;
  const box = new THREE.Box3();
  for (const m of view.chunkMeshes) { tris += triangles(m.geometry); m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); }
  return { tris, box };
}
// Référence : tout dans un seul constructeur, comme avant le découpage.
function reference(track) {
  const gb = new GeoBuilder(), glow = new GeoBuilder(), fx = new FxBuilder();
  for (const t of track.tiles) if (!t.mv && t.s !== 'glass' && t.s2 !== 'glass') buildTileInto(gb, glow, t, track, fx);
  for (const d of track.decos) if (d.k !== 'plaque' && !isObstacle(d.k)) buildDecoInto(gb, glow, d);
  return gb.pos.length / 9 + glow.pos.length / 9 + fx.pos.length / 9;
}

console.log('Même géométrie qu\'un maillage unique');
test('les 66 circuits intégrés : même nombre de triangles statiques que la référence', () => {
  for (const d of BUILTIN_TRACKS) {
    const t = buildBuiltin(d), v = new TrackView(t, mats);
    assert.equal(staticStats(v).tris, reference(t), d.id);
    v.dispose();
  }
});
test('un circuit réparti sur plusieurs tronçons est découpé (et les tronçons sont des maillages statiques)', () => {
  const t = buildBuiltin(BUILTIN_TRACKS[10]), v = new TrackView(t, mats);
  assert.ok(v.chunks.size >= 2, 'tronçons : ' + v.chunks.size);
  for (const m of v.chunkMeshes) assert.equal(m.matrixAutoUpdate, false);
  v.dispose();
});

console.log('Reconstruction incrémentale');
// Deux zones éloignées (plus de 4 cases l'une de l'autre) : deux tronçons au moins.
function twoZones() {
  const t = new Track('z');
  t.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 });
  for (let i = 1; i < 4; i++) t.add({ t: 'straight', x: 0, z: i, l: 0, r: 0 });
  for (let i = 0; i < 4; i++) t.add({ t: 'straight', x: 20, z: i, l: 0, r: 0 });
  t.addDeco({ k: 'cone', x: 5, y: 0, z: 5, ry: 0, s: 1 });
  t.addDeco({ k: 'cone', x: 20 * CELL + 5, y: 0, z: 5, ry: 0, s: 1 });
  return t;
}
test('rien n\'a changé : aucun tronçon reconstruit, mêmes objets', () => {
  const t = twoZones(), v = new TrackView(t, mats);
  const n0 = v.chunkBuilds, meshes = [...v.chunkMeshes];
  v.rebuild();
  assert.equal(v.chunkBuilds, n0);
  assert.deepEqual([...v.chunkMeshes], meshes);
  v.dispose();
});
test('modifier une pièce ne reconstruit que son tronçon', () => {
  const t = twoZones(), v = new TrackView(t, mats);
  assert.ok(v.chunks.size >= 2);
  const before = new Map([...v.chunks].map(([k, c]) => [k, c.meshes[0]]));
  const n0 = v.chunkBuilds;
  const tile = t.tilesAt(20, 1)[0];
  assert.ok(t.setSurface(tile, 'boost'));
  v.rebuild();
  assert.equal(v.chunkBuilds - n0, 1, 'un seul tronçon reconstruit');
  const changed = [...v.chunks].filter(([k, c]) => c.meshes[0] !== before.get(k));
  assert.equal(changed.length, 1);
  v.dispose();
});
test('ajouter puis retirer une décoration', () => {
  const t = twoZones(), v = new TrackView(t, mats);
  const n0 = v.chunkBuilds, tris0 = staticStats(v).tris;
  const d = t.addDeco({ k: 'cone', x: 20 * CELL + 9, y: 0, z: 40, ry: 0, s: 1 });
  v.rebuild();
  assert.equal(v.chunkBuilds - n0, 1);
  assert.ok(staticStats(v).tris > tris0);
  t.removeDeco(d);
  v.rebuild();
  assert.equal(staticStats(v).tris, tris0, 'retour au même nombre de triangles');
  v.dispose();
});
test('retirer toutes les pièces d\'un tronçon supprime ses maillages (et libère la géométrie)', () => {
  const t = twoZones(), v = new TrackView(t, mats);
  const n = v.chunks.size, geos = [...v.chunkMeshes].map((m) => m.geometry);
  let disposed = 0;
  for (const g of geos) g.addEventListener('dispose', () => { disposed++; });
  for (const tile of [...t.tiles]) if (tile.x >= 20) t.remove(tile);
  for (const d of [...t.decos]) if (d.x > 10 * CELL) t.removeDeco(d);
  v.rebuild();
  assert.equal(v.chunks.size, n - 1);
  assert.ok(disposed >= 1, 'géométrie libérée');
  v.dispose();
});
test('une pièce posée dans le tronçon voisin, sous un pilier, invalide aussi le tronçon de la pièce haute', () => {
  // Virage haut de 2 × 2 cases ancré en bordure de tronçon (cases 3-4), puis une route basse dans la case 4, qui appartient au tronçon voisin.
  const t = new Track('p');
  t.add({ t: 'bigcurve', x: 3, z: 0, l: 3, r: 0 });
  const v = new TrackView(t, mats);
  assert.equal(v.chunks.size, 1);
  const n0 = v.chunkBuilds;
  t.add({ t: 'straight', x: 4, z: 0, l: 0, r: 0 });
  t.add({ t: 'straight', x: 4, z: 1, l: 0, r: 0 });
  v.rebuild();
  assert.equal(v.chunks.size, 2);
  assert.equal(v.chunkBuilds - n0, 2, 'le tronçon de la pièce haute est reconstruit lui aussi (ses piliers dépendent de la route sous lui)');
  assert.equal(staticStats(v).tris, reference(t), 'même résultat que la référence');
  v.dispose();
});
test('le niveau mis en avant (vue par niveau) change le contenu du tronçon', () => {
  const t = twoZones(), v = new TrackView(t, mats);
  const tris0 = staticStats(v).tris;
  v.focus = 5; v.rebuild();                         // aucune pièce au niveau 5 : tout est estompé
  assert.ok(staticStats(v).tris < tris0);
  v.focus = undefined; v.rebuild();
  assert.equal(staticStats(v).tris, tris0);
  v.dispose();
});
test('dispose libère tous les maillages', () => {
  const t = twoZones(), v = new TrackView(t, mats);
  v.dispose();
  assert.equal(v.chunks.size, 0);
  assert.equal(v.group.children.length, 0);
});
test('le coût d\'une modification reste très inférieur à une reconstruction complète (grand circuit)', () => {
  const t = new Track('grand');
  for (let x = 0; x < 20; x++) for (let z = 0; z < 12; z++) t.add({ t: 'straight', x: x * 2, z: z * 2, l: 0, r: 0 });
  for (let i = 0; i < 200; i++) t.addDeco({ k: i % 2 ? 'cone' : 'pine', x: (i % 40) * 32 + 5, y: 0, z: Math.floor(i / 40) * 100 + 5, ry: 0, s: 1 });
  const v = new TrackView(t, mats);
  const full = v.chunkBuilds;
  const tile = t.tiles[5];
  t.setSurface(tile, 'ice');
  v.rebuild();
  assert.ok(v.chunkBuilds - full <= 2, `${v.chunkBuilds - full} tronçons reconstruits sur ${v.chunks.size}`);
  assert.ok(v.chunks.size >= 10);
  v.dispose();
});

finish('Tous les tests du maillage par tronçons passent.');
