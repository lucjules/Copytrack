// 0.9.71, étape 4 des nouvelles pièces : carrefours en T et en croix au même niveau : node tools/test-etape4.mjs   (npm test)
// La chaussée d'un carrefour est l'union du carré central et de ses bras ; hors de la chaussée, l'écart latéral vaut 12 m + la distance à elle :
// le sol, les bordures (sur tout le contour, angles compris) et les checkpoints marchent sans cas particulier.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { scriptTrack, Track } from '../js/track.js';
import { PIECES, PIECE_ORDER, sampleLocal, junctionRects, flagAllowed, baseY, localToWorld } from '../js/pieces.js';
import { FAMILIES, FAMILY_ORDER, resolve } from '../js/families.js';
import { tileEnds, endsTouch } from '../js/connect.js';
import { continuityIssues } from '../js/continuity.js';
import { checkTrack } from '../js/editorTools.js';
import { buildTileInto } from '../js/trackGeometry.js';
import { GeoBuilder } from '../js/geo.js';
import { CarPhysics } from '../js/physics.js';
import { runTrack } from './lab.mjs';
import { HALF, ROAD_HALF } from '../js/constants.js';

const build = (sc) => scriptTrack('t', sc, { l: 1 });

test('deux pièces à la suite des types (index 156, 157) : croisement (4 bras), T (3 bras : avant, arrière, droite)', () => {
  assert.deepEqual(PIECE_ORDER.slice(156, 158), ['cross', 'tee']);
  assert.equal(PIECES.cross.arms, 'NSEW'); assert.equal(PIECES.tee.arms, 'NSE');
  assert.equal(junctionRects(PIECES.cross).length, 5);
});
test('écart latéral : 0 sur la chaussée, sinon 12 m + la distance EXACTE à la chaussée (aux coins : au bras le plus proche, la bordure fait un angle droit) ; gradient unitaire', () => {
  const S = {}, d = (id, x, z) => { sampleLocal({ t: id, x: 0, z: 0, l: 0, r: 0 }, x, z, S); return S.d; };
  assert.equal(d('cross', 0, 0), 0); assert.equal(d('cross', 0, 15), 0); assert.equal(d('cross', 15, 0), 0); assert.equal(d('tee', 15, 3), 0);
  assert.equal(d('tee', -15, 3), ROAD_HALF + 3, 'côté sans bras : bordure à 12 m du centre');
  assert.ok(Math.abs(d('cross', 15, 15) - (ROAD_HALF + 3)) < 1e-12, 'coin : au plus près, un bras');
  assert.ok(Math.abs(d('cross', 12.3, 12.4) - (ROAD_HALF + 0.3)) < 1e-12, 'coin entre deux bras : distance au bras le plus proche');
  assert.ok(Math.abs(d('cross', 12.3, 12.4) - ROAD_HALF) < 0.6, '… donc dans la bande de bordure (angle droit plein)');
  for (let i = 0; i < 400; i++) {
    const x = -HALF + (2 * HALF * ((i * 37) % 400)) / 400, z = -HALF + (2 * HALF * ((i * 91) % 400)) / 400;
    sampleLocal({ t: 'cross', x: 0, z: 0, l: 0, r: 0 }, x, z, S);
    const inRoad = Math.abs(x) <= ROAD_HALF || Math.abs(z) <= ROAD_HALF;
    assert.equal(S.d === 0, inRoad, `${x}, ${z}`);
    assert.ok(Math.abs(Math.hypot(S.gx, S.gz) - 1) < 1e-12);
  }
});
test('un bout par bras (l’arrière est l’entrée) ; chaque bras se raccorde à une ligne droite ; le vérificateur accepte un carrefour dont tous les bras sont reliés', () => {
  const e = tileEnds(Track.normalize({ t: 'cross', x: 0, z: 0, l: 1, r: 0 }));
  assert.equal(e.length, 4); assert.equal(e.filter((x) => x.entry).length, 1);
  const tr = build('start S JX R R R JX L S finish');
  assert.deepEqual(continuityIssues(tr).filter((i) => i.level !== 'info'), []);
  assert.deepEqual(checkTrack(tr).filter((i) => i.level === 'error'), []);
  const c = tr.tiles.find((t) => t.t === 'cross'), touched = tileEnds(c).filter((x) => tr.tiles.some((o) => o !== c && tileEnds(o).some((y) => endsTouch(x, y))));
  assert.equal(touched.length, 4, 'les quatre bras sont reliés');
});
test('circuit en 8 : un seul croisement, traversé deux fois (perpendiculairement) ; le pilote finit sans toucher ; partage à l’identique', () => {
  const tr = build('start B2 S2 JX R R R JX L S finish');
  assert.equal(tr.tiles.filter((t) => t.t === 'cross').length, 1);
  const R = runTrack(tr);
  assert.ok(R.ok && R.wallHits === 0 && R.respawns === 0, R.reason);
  assert.equal(Track.decode(tr.encode()).signature(), tr.signature());
  assert.throws(() => build('start S JT R R R JT S finish'), /pas de bras dans ce sens/, 'un T n’a pas de bras de ce côté : erreur claire');
});
test('T : tout droit (branche à droite ou à gauche), prendre la branche, arriver par la branche et tourner ; à chaque fois, aucun choc', () => {
  for (const sc of ['start S2 JT S2 finish', 'start S2 JTL S2 finish', 'start S2 JTD S2 finish', 'start S2 JTG S2 finish', 'start S2 JR S2 finish', 'start S2 JL S2 finish', 'start S2 JXR S2 JXL S2 finish']) {
    const tr = build(sc);
    assert.deepEqual(tr.validate(), [], sc);
    const R = runTrack(tr);
    assert.ok(R.ok && R.wallHits === 0 && R.respawns === 0, sc + ' ' + R.reason);
  }
});
test('une voiture lancée vers le côté fermé d’un T est retenue par la bordure (à 12 m du centre) ; vers un bras ouvert elle sort de la case', () => {
  const go = (yaw) => {
    const tr = new Track('t'), t = tr.add({ t: 'tee', x: 0, z: 0, l: 3, r: 0 }), c = localToWorld(t, 0, 0), ph = new CarPhysics(tr);
    ph.place(c.x, baseY(t), c.z, yaw);
    let far = 0;
    for (let i = 0; i < 240; i++) { ph.clock = i; ph.step({ throttle: true, brake: false, steer: 0, drift: false }); far = Math.max(far, Math.abs(ph.pos.x - c.x)); }
    return far;
  };
  assert.ok(go(Math.PI / 2) < ROAD_HALF, 'vers le côté sans bras (−x) : retenue');
  assert.ok(go(-Math.PI / 2) > HALF, 'vers le bras droit (+x) : elle sort');
});
test('options : à l’envers, sans bordures, thème ; ni checkpoint, ni tunnel, ni mur, ni mouvement ; famille « Carrefour » ; rendu (bordures ou non)', () => {
  for (const id of ['cross', 'tee']) {
    for (const f of ['nb', 'v', 'th']) assert.ok(flagAllowed(id, f), id + f);
    for (const f of ['cp', 'tn', 'mv', 'tb', 'gs']) assert.ok(!flagAllowed(id, f, null, 1), id + f);
    assert.ok(!flagAllowed(id, 'o', null, 1));
    for (const nb of [0, 1]) { const gb = new GeoBuilder(), glow = new GeoBuilder(); buildTileInto(gb, glow, Track.normalize({ t: id, x: 0, z: 0, l: 2, r: 1, nb, s: 'ice' })); assert.ok(!gb.empty); }
  }
  assert.ok(FAMILY_ORDER.includes('carrefour'));
  assert.equal(resolve('carrefour', { forme: 't' }), 'tee');
  assert.equal(Object.keys(FAMILIES.carrefour.members).length, 2);
});

await finish('Étape 4 (carrefours) : tout passe.');
