// 0.9.69, étape 2 des nouvelles pièces : node tools/test-etape2.mjs   (npm test)
//  E. murs pleins (droit, muret, L, T, croix, courbe) : des solides, comme les piliers de l'étape 1 ;
//  F. plaques (surfaces libres) : carrées 2×2 et 3×3, triangles, quarts de disque, et leurs bordures au choix (option eb, dans la signature) ;
//  G. blocs pleins (bloc, dalle, cale, cale raide, pyramide, arche) : dessus roulable, la cale et la pyramide se montent.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { scriptTrack, Track } from '../js/track.js';
import { PIECES, PIECE_ORDER, sampleLocal, plateEdges, plateAllEdges, inPlate, areaCentroid, flagAllowed, baseY, tileCenter, localToWorld } from '../js/pieces.js';
import { FAMILIES, FAMILY_ORDER, resolve } from '../js/families.js';
import { DECO_ORDER, DECO_CATS } from '../js/decoData.js';
import { SOLIDS, SOLID_IDS, buildSolidGrid, solidSide, solidFloor } from '../js/solids.js';
import { GeoBuilder } from '../js/geo.js';
import { buildDecoInto } from '../js/decos.js';
import { buildTileInto } from '../js/trackGeometry.js';
import { CarPhysics } from '../js/physics.js';
import { checkTrack } from '../js/editorTools.js';
import { runTrack } from './lab.mjs';
import { HALF } from '../js/constants.js';

const WALLS = ['wallS', 'wallSLow', 'wallSL', 'wallST', 'wallSX', 'wallSC'];
const BLOCKS = ['block', 'slab', 'wedge', 'wedgeSteep', 'pyramidS', 'archS'];
const PLATES = ['plate2', 'plate3', 'tri1', 'tri2', 'tri3', 'sec1', 'sec2', 'sec3'];
// Route droite de 12 cases ; la décoration est posée au milieu (décalée de dx, dz).
const road = (deco) => {
  const tr = scriptTrack('t', 'start B2 S12 finish', { l: 0 }), mid = tr.path[Math.floor(tr.path.length / 2)];
  if (deco) tr.addDeco({ ry: 0, s: 1, c: 0, ...deco, x: mid[0] + (deco.dx || 0), z: mid[2] + (deco.dz || 0) });
  return tr;
};
const free = runTrack(road(null));

console.log('E. Murs pleins');
test('six murs pleins à la suite des décorations (index 329 à 334), catégorie « Murs pleins » ; tous dessinés', () => {
  assert.deepEqual(DECO_ORDER.slice(329, 335), WALLS);
  assert.deepEqual(DECO_CATS.wallsS.kinds, WALLS);
  for (const id of WALLS) { const gb = new GeoBuilder(), glow = new GeoBuilder(); buildDecoInto(gb, glow, { k: id, x: 0, y: 0, z: 0, ry: 0, s: 1, c: 0 }); assert.ok(!gb.empty, id); }
});
test('un mur plein, un muret ou un mur courbe en travers de la route arrêtent la voiture (elle ne les traverse pas) ; elle en fait le tour', () => {
  assert.ok(free.ok && free.wallHits === 0);
  for (const k of ['wallS', 'wallSLow', 'wallSC', 'wallSX']) {
    const S = runTrack(road({ k, y: 0.4 }));
    assert.ok(S.ok && S.wallHits >= 1 && S.time > free.time + 2, `${k} : ${S.wallHits} choc(s), ${S.time.toFixed(1)} s`);
  }
});
test('mur courbe : un quart de cercle de rayon 16 m fait de 8 tronçons tournés, sans trou (la sonde le touche tout du long)', () => {
  assert.equal(SOLIDS.wallSC.parts.length, 8);
  assert.ok(SOLIDS.wallSC.parts.every((p) => p.f));
  const tr = new Track('t'); tr.addDeco({ k: 'wallSC', x: 100, y: 0, z: 100, ry: 0.6, s: 1, c: 0 });
  const idx = buildSolidGrid(tr.decos), hit = {};
  const c = Math.cos(0.6), s = Math.sin(0.6);
  for (let i = 0; i <= 90; i++) {
    const a = (Math.PI / 2) * (i / 90), lx = -8 + 16 * Math.cos(a), lz = 8 - 16 * Math.sin(a);      // sur la ligne du mur (repère du solide)
    const x = 100 + lx * c + lz * s, z = 100 - lx * s + lz * c;
    assert.ok(solidSide(idx, x, z, x, z, 0, 1.3, 0, 1.0, 0.6, hit), 'trou à ' + i + '°');
  }
});

console.log('F. Plaques');
test('huit plaques à la suite des types de pièces (index 144 à 151) ; famille « Plaque » (forme × taille) dont la plateforme est la carrée 1×1', () => {
  assert.deepEqual(PIECE_ORDER.slice(144, 152), PLATES);
  assert.equal(FAMILY_ORDER[FAMILY_ORDER.length - 1], 'plaque');
  assert.equal(resolve('plaque', { forme: 'sq', taille: '1' }), 'platform');
  assert.equal(resolve('plaque', { forme: 'sec', taille: '3' }), 'sec3');
  assert.equal(Object.keys(FAMILIES.plaque.members).length, 9);
});
test('formes : le triangle couvre la moitié de son carré (sous la diagonale), le quart de disque π/4 ; hors de la forme, rien ne porte la voiture', () => {
  const S = {};
  for (const id of ['tri2', 'sec2', 'plate2']) {
    const P = PIECES[id], h = P.size * HALF, n = 200;
    let inside = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const lx = -h + (2 * h * (i + 0.5)) / n, lz = -h + (2 * h * (j + 0.5)) / n;
      sampleLocal({ t: id, x: 0, z: 0, l: 0, r: 0 }, lx, lz, S);
      assert.equal(S.inFootprint, inPlate(P, lx, lz));
      if (S.inFootprint) inside++;
    }
    const want = id === 'tri2' ? 0.5 : id === 'sec2' ? Math.PI / 4 : 1;
    assert.ok(Math.abs(inside / (n * n) - want) < 0.01, `${id} : ${(inside / (n * n)).toFixed(3)}`);
  }
  // Le sol : sur la plaque triangle, à la hauteur de la plaque ; de l'autre côté de la diagonale, le terrain.
  const tr = new Track('t'); const t = tr.add({ t: 'tri1', x: 0, z: 0, l: 3, r: 0 }), out = {};
  const a = localToWorld(t, -10, 10), b = localToWorld(t, 10, -10);
  tr.surfaceAt(a.x, 30, a.z, out); assert.equal(out.tile, t);
  tr.surfaceAt(b.x, 30, b.z, out); assert.equal(out.tile, null);
});
test('bordures : 4 bords (carré), 3 (triangle, quart de disque) ; masque ramené à la forme ; seulement sur une plaque ; dans la signature et le code', () => {
  assert.deepEqual(['platform', 'plate3', 'tri2', 'sec1'].map((id) => plateEdges(PIECES[id]).length), [4, 4, 3, 3]);
  assert.equal(Track.normalize({ t: 'tri2', x: 0, z: 0, l: 0, r: 0, eb: 15 }).eb, 7);
  assert.equal(Track.normalize({ t: 'straight', x: 0, z: 0, l: 0, r: 0, eb: 15 }).eb, 0);
  assert.ok(flagAllowed('sec3', 'eb', null, 15) && !flagAllowed('loop', 'eb', null, 1));
  const a = scriptTrack('t', 'start S2 [plate3] S2 finish', { l: 1 }), b = scriptTrack('t', 'start S2 [plate3]*10 S2 finish', { l: 1 });
  assert.notEqual(a.signature(), b.signature(), 'des bordures arrêtent la voiture : autre circuit');
  const back = Track.decode(b.encode());
  assert.equal(back.tiles.find((t) => t.t === 'plate3').eb, 10);
  assert.equal(back.signature(), b.signature());
  assert.deepEqual(back.lost, { unknown: 0, overlap: 0, options: 0, decos: 0 });
  // éditeur : toutes / aucune (option), bord par bord (inspecteur)
  const t = b.tiles.find((x) => x.t === 'plate3');
  assert.ok(b.setEdges(t, 1 | 4) && t.eb === 5 && !b.setEdges(t, 5));
  assert.ok(b.toggleFlag(t, 'eb', 15) && t.eb === 0 && b.toggleFlag(t, 'eb', 15) && t.eb === 15);
});
// Voiture posée au centre de gravité d'une plaque à 4 niveaux de haut, lancée plein gaz dans la direction (dx, dz) (repère de la pièce) pendant 4 s.
function launch(type, eb, dx, dz) {
  const tr = new Track('t');
  const t = tr.add({ t: type, x: 10, z: 10, l: 4, r: 1, eb });
  const P = PIECES[type], g = areaCentroid(P), c = localToWorld(t, g.x, g.z), d = localToWorld(t, g.x + dx, g.z + dz);
  const ph = new CarPhysics(tr), fx = d.x - c.x, fz = d.z - c.z;
  ph.place(c.x, baseY(t), c.z, Math.atan2(-fx, -fz));
  let hit = 0;
  for (let i = 0; i < 480; i++) { ph.clock = i; ph.step({ throttle: true, brake: false, steer: 0, drift: false }); if (ph.ev.wall > 1) hit++; }
  return { y: ph.pos.y - baseY(t), hit, on: ph.grounded && ph.surfTile === t };
}
test('une voiture lancée vers un bord AVEC bordure reste sur la plaque (carré, diagonale du triangle, arc du quart de disque) ; sans bordure, elle tombe', () => {
  const cases = [['plate3', 2, 1, 0], ['tri3', 4, 1, -1], ['sec3', 4, 1, -1], ['platform', 2, 1, 0]];
  for (const [type, bit, dx, dz] of cases) {
    const kept = launch(type, bit, dx, dz), fell = launch(type, 0, dx, dz);
    assert.ok(kept.on && Math.abs(kept.y) < 0.2 && kept.hit > 0, `${type} avec bordure : y ${kept.y.toFixed(1)}, contact ${kept.hit}`);
    assert.ok(fell.y < -5, `${type} sans bordure : y ${fell.y.toFixed(1)}`);
  }
});
test('scripts : [plate3] centrée sur la route, [plate2] dans la colonne de gauche ; *n = masque des bordures ; on traverse une plaque à bordures latérales, pas une plaque fermée', () => {
  const tr = scriptTrack('t', 'start S2 [plate3]*10 S [plate2]*10 S2 finish', { l: 1 });
  const p3 = tr.tiles.find((t) => t.t === 'plate3'), st = tr.tiles.find((t) => t.t === 'start');
  assert.equal(tileCenter(p3).x, tileCenter(st).x, 'plaque 3×3 centrée sur la colonne de la route');
  assert.deepEqual(checkTrack(tr).filter((i) => i.level === 'error'), []);
  const S = runTrack(tr);
  assert.ok(S.ok && S.respawns === 0 && S.wallHits === 0, S.reason);
  const closed = runTrack(scriptTrack('t', 'start S2 [plate3]*15 S2 finish', { l: 1 }), { maxTime: 20 });
  assert.ok(!closed.ok, 'plaque fermée : on ne passe pas');
});
test('rendu : chaque plaque est dessinée (bordures comprises) ; la plateforme 1×1 sans bordure garde exactement sa géométrie', () => {
  for (const id of ['platform', ...PLATES]) for (const eb of [0, plateAllEdges(PIECES[id])]) {
    const gb = new GeoBuilder(), glow = new GeoBuilder();
    buildTileInto(gb, glow, Track.normalize({ t: id, x: 0, z: 0, l: 2, r: 3, eb, s: 'boost' }));
    assert.ok(!gb.empty, id);
  }
  const g0 = new GeoBuilder(), g1 = new GeoBuilder(), w = new GeoBuilder();
  buildTileInto(g0, w, Track.normalize({ t: 'platform', x: 0, z: 0, l: 2, r: 0 }));
  buildTileInto(g1, w, Track.normalize({ t: 'platform', x: 0, z: 0, l: 2, r: 0, eb: 15 }));
  assert.equal(g0.pos.length, 684, 'plateforme : même géométrie qu’en 0.9.68 (vérifié contre l’ancien trackGeometry.js : au bit près, avec checkpoint et revêtement aussi)');
  assert.ok(g1.pos.length > g0.pos.length);
});
test('checkpoint sur une plaque triangle : le point de retour est son centre de gravité, sur la plaque', () => {
  for (const id of ['tri1', 'sec1', 'tri3']) {
    const P = PIECES[id], g = areaCentroid(P);
    assert.ok(inPlate(P, g.x, g.z), id);
    const S = {}; sampleLocal({ t: id, x: 0, z: 0, l: 0, r: 0 }, g.x, g.z, S); assert.ok(S.inFootprint);
  }
});

console.log('G. Blocs pleins');
test('six blocs à la suite (index 335 à 340), catégorie « Blocs pleins »', () => {
  assert.deepEqual(DECO_ORDER.slice(335, 341), BLOCKS);
  assert.deepEqual(DECO_CATS.blocks.kinds, BLOCKS);
  assert.deepEqual(SOLID_IDS.slice(9), [...WALLS, ...BLOCKS]);
});
test('un bloc ou une dalle (1,2 m : plus haut qu’une marche) arrêtent la voiture ; sous l’arche pleine elle passe sans rien toucher', () => {
  for (const k of ['block', 'slab']) { const S = runTrack(road({ k, y: 0.4 })); assert.ok(S.ok && S.wallHits >= 1 && S.time > free.time + 2, k); }
  const A = runTrack(road({ k: 'archS', y: 0.4 }));
  assert.ok(A.ok && A.wallHits === 0 && Math.abs(A.time - free.time) < 1e-9);
});
test('cale, cale raide et pyramide se montent et font décoller la voiture ; la cale prise par sa face haute est un mur', () => {
  for (const k of ['wedge', 'wedgeSteep', 'pyramidS']) {
    const S = runTrack(road({ k, y: 0.4 }));
    assert.ok(S.ok && S.wallHits === 0 && S.yMax > 6 && S.airTotal > 1, `${k} : hauteur ${S.yMax.toFixed(1)} m, vol ${S.airTotal.toFixed(2)} s`);
  }
  const back = runTrack(road({ k: 'wedge', y: 0.4, ry: Math.PI }));
  assert.ok(back.wallHits >= 1 && back.yMax < 1);
});
test('le dessus d’une cale est en pente (normale penchée vers l’arrière, hauteur qui monte vers l’avant) ; le dessus d’une dalle est plat', () => {
  const tr = new Track('t'); tr.addDeco({ k: 'wedge', x: 0, y: 0, z: 0, ry: 0, s: 1, c: 0 }); tr.addDeco({ k: 'slab', x: 100, y: 3, z: 0, ry: 0.4, s: 2, c: 0 });
  const a = {}, b = {}, c = {};
  tr.surfaceAt(0, 10, 4, a); tr.surfaceAt(0, 10, -4, b); tr.surfaceAt(100, 20, 3, c);
  assert.ok(a.solid && b.solid && b.h > a.h && Math.abs(b.h - a.h - 2) < 1e-9, `${a.h} → ${b.h}`);
  assert.ok(a.ny < 1 && a.nz > 0);
  assert.equal(c.h, 3 + 1.2 * 2); assert.equal(c.ny, 1);
  const idx = buildSolidGrid(tr.decos), out = {};
  assert.equal(solidFloor(idx, 0, 10, 4, 1.6, -Infinity, out), a.h);
});

await finish('Étape 2 (murs pleins, plaques, blocs pleins) : tout passe.');
