// 0.9.70, étape 3 des nouvelles pièces : largeur de route variable : node tools/test-etape3.mjs   (npm test)
// Route étroite (12 m), rétrécissement (24 → 12 m), élargissement (24 → 56 m, 3×3), route large (56 m, 3×3). L'écart latéral d est recalé sur le
// bord réel : le sol, les bordures, les dalles et les checkpoints marchent sans cas particulier.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { scriptTrack, Track } from '../js/track.js';
import { PIECES, PIECE_ORDER, sampleLocal, roadHalf, flagAllowed, baseY, localToWorld } from '../js/pieces.js';
import { FAMILIES, FAMILY_ORDER, resolve } from '../js/families.js';
import { tileEnds } from '../js/connect.js';
import { continuityIssues } from '../js/continuity.js';
import { stripsFor, buildTileInto } from '../js/trackGeometry.js';
import { GeoBuilder } from '../js/geo.js';
import { CarPhysics } from '../js/physics.js';
import { runTrack } from './lab.mjs';
import { HALF, ROAD_HALF, RAIL_W } from '../js/constants.js';

const IDS = ['narrow', 'narrowIn', 'wideIn', 'wide'];
const build = (sc) => scriptTrack('t', sc, { l: 1 });

test('quatre pièces à la suite des types (index 152 à 155) : demi-largeurs 6, 12 → 6, 12 → 28, 28 m', () => {
  assert.deepEqual(PIECE_ORDER.slice(152, 156), IDS);
  assert.deepEqual(IDS.map((id) => [roadHalf(PIECES[id], 0), roadHalf(PIECES[id], 1)]), [[6, 6], [12, 6], [12, 28], [28, 28]]);
  assert.equal(roadHalf(PIECES.straight, 0.5), ROAD_HALF);
});
test('|d| − 12 est la distance perpendiculaire EXACTE au bord de la chaussée (bord en biais compris), gradient unitaire ; 0 au milieu d’une route large', () => {
  const S = {};
  for (const id of IDS) {
    const P = PIECES[id], h = P.size * HALF, [w0, w1] = P.hw;
    // bord droit : la droite x = w0 (en z = +h) → x = w1 (en z = −h) ; normale extérieure unitaire.
    const ex = 2 * h, ez = w1 - w0, L = Math.hypot(ex, ez), nx = ex / L, nz = ez / L;      // (la droite va de (w0, h) à (w1, −h) : tangente (w1 − w0, −2h))
    for (let i = 0; i <= 20; i++) for (const off of [-3, -0.5, 0.5, 1, 2.5]) {
      const lz = h - (2 * h * i) / 20, xe = w0 + (w1 - w0) * (i / 20);
      const lx = xe + off * nx, lz2 = lz + off * nz;
      if (Math.abs(lz2) > h) continue;
      sampleLocal({ t: id, x: 0, z: 0, l: 0, r: 0 }, lx, lz2, S);
      assert.ok(Math.abs(S.d - (ROAD_HALF + off)) < 1e-9, `${id} ${i} ${off} : ${S.d}`);
      assert.ok(Math.abs(Math.hypot(S.gx, S.gz) - 1) < 1e-12);
    }
  }
  sampleLocal({ t: 'wide', x: 0, z: 0, l: 0, r: 0 }, 9, 0, S); assert.equal(S.d, 0);
});
test('le sol s’arrête au bord : sur une route étroite à 5 m de l’axe on roule, à 7 m on est sur la bordure (pas de sol), comme à 13 m sur une route ordinaire', () => {
  const tr = new Track('t'), t = tr.add({ t: 'narrow', x: 0, z: 0, l: 2, r: 1 }), out = {};
  const a = localToWorld(t, 5, 3), b = localToWorld(t, 7, 3);
  tr.surfaceAt(a.x, 20, a.z, out); assert.equal(out.tile, t);
  tr.surfaceAt(b.x, 20, b.z, out); assert.equal(out.tile, null);
});
test('une voiture lancée en travers d’une route étroite est retenue par la bordure, à 6 m de l’axe (sans bordures : elle tombe)', () => {
  for (const nb of [0, 1]) {
    const tr = new Track('t'), t = tr.add({ t: 'narrow', x: 0, z: 0, l: 3, r: 0, nb });
    const c = localToWorld(t, 0, 0), ph = new CarPhysics(tr);
    ph.place(c.x, baseY(t), c.z, -Math.PI / 2);      // cap +x : vers le bord droit
    let maxX = -Infinity;
    for (let i = 0; i < 240; i++) { ph.clock = i; ph.step({ throttle: true, brake: false, steer: 0, drift: false }); maxX = Math.max(maxX, ph.pos.x - c.x); }
    if (!nb) assert.ok(maxX < 6 && ph.pos.y > baseY(t) - 0.5, `retenue : ${maxX.toFixed(2)} m`);
    else assert.ok(ph.pos.y < baseY(t) - 5, 'sans bordures, elle tombe');
  }
});
test('scripts : N (étroite), NI / NO (rétrécissement, retour), WI / W / WO (route large) ; le pilote passe à pleine vitesse sans toucher ; partage à l’identique', () => {
  for (const sc of ['start B3 S6 NI N6 NO S4 finish', 'start B3 S6 WI W2 WO S2 finish', 'start S2 [wide] S finish']) {
    const tr = build(sc);
    assert.deepEqual(tr.validate(), [], sc);
    const R = runTrack(tr);
    assert.ok(R.ok && R.wallHits === 0 && R.respawns === 0, sc + ' ' + R.reason);
    assert.equal(Track.decode(tr.encode()).signature(), tr.signature());
  }
  const t = build('start S2 NO S2 finish').tiles.find((x) => x.t === 'narrowIn');
  assert.equal(t.r, 2, 'NO : le rétrécissement tourné d’un demi-tour');
});
test('vérificateur : deux largeurs bout à bout sans raccord → alerte « width » ; avec rétrécissement / élargissement → rien ; circuits officiels : rien', () => {
  const codes = (sc) => continuityIssues(build(sc)).filter((i) => i.code === 'width').length;
  assert.ok(codes('start S2 N2 S2 finish') >= 1 && codes('start S2 W S finish') >= 1);
  assert.equal(codes('start S2 NI N2 NO S2 finish'), 0);
  assert.equal(codes('start S2 WI W WO S finish'), 0);
  const e = tileEnds(Track.normalize({ t: 'narrowIn', x: 0, z: 0, l: 0, r: 0 }));
  assert.deepEqual(e.map((x) => x.w), [12, 6]);
});
test('options : sans bordures, à l’envers, thème ; ni tunnel, ni mur, ni mouvement, ni checkpoint, ni anneau', () => {
  for (const id of IDS) {
    for (const f of ['nb', 'v', 'th']) assert.ok(flagAllowed(id, f), id + ' ' + f);
    for (const f of ['tn', 'mv', 'cp', 'tb']) assert.ok(!flagAllowed(id, f, null, 1), id + ' ' + f);
    assert.ok(!flagAllowed(id, 'o', null, 1), id + ' o');
  }
});
test('famille « Largeur » de l’éditeur ; rendu : les repères portent la demi-largeur, la bordure suit le bord (en biais sur un raccord)', () => {
  assert.equal(FAMILY_ORDER[FAMILY_ORDER.length - 1], 'largeur');
  assert.equal(resolve('largeur', { w: 'wi' }), 'wideIn');
  assert.equal(Object.keys(FAMILIES.largeur.members).length, 4);
  const fr = stripsFor(Track.normalize({ t: 'narrowIn', x: 0, z: 0, l: 0, r: 0 }))[0];
  assert.deepEqual([fr[0].hw, fr[fr.length - 1].hw], [12, 6]);
  for (const id of IDS) for (const s of ['', 'water', 'boost']) {
    const gb = new GeoBuilder(), glow = new GeoBuilder();
    buildTileInto(gb, glow, Track.normalize({ t: id, x: 0, z: 0, l: 1, r: 0, s }));
    // la bordure droite (côté extérieur : x maximal de la géométrie, repère de la pièce) est à hw + RAIL_W de l'axe ; rien ne dépasse
    const c = PIECES[id].size * HALF, xs = []; for (let i = 0; i < gb.pos.length; i += 3) xs.push(gb.pos[i] - c);
    assert.ok(Math.abs(Math.max(...xs) - (Math.max(...PIECES[id].hw) + RAIL_W)) < 1e-6, `${id} ${s} : ${Math.max(...xs)}`);
    assert.ok(Math.abs(Math.min(...xs) + (Math.max(...PIECES[id].hw) + RAIL_W)) < 1e-6, id);
  }
});

await finish('Étape 3 (largeur de route variable) : tout passe.');
