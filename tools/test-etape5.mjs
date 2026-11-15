// 0.9.72, étape 5 des nouvelles pièces : looping modulaire et tube en virage : node tools/test-etape5.mjs   (npm test)
//  - looping modulaire : Montée en L, n murs, SOMMET (demi-cercle de 16 m qui redescend une colonne à côté), n murs, Montée en L à l'envers ;
//  - tube en virage (2×2, rayon 48 m) entre des sections de tube.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { scriptTrack, Track } from '../js/track.js';
import { PIECES, PIECE_ORDER, headingGuided, flagAllowed } from '../js/pieces.js';
import { ribbonOf } from '../js/ribbons.js';
import { tileEnds, endsTouch } from '../js/connect.js';
import { continuityIssues } from '../js/continuity.js';
import { buildTileInto } from '../js/trackGeometry.js';
import { GeoBuilder } from '../js/geo.js';
import { MIRROR_TYPES } from '../js/inspector.js';
import { runTrack } from './lab.mjs';
import { CELL, HALF, LEVEL_H } from '../js/constants.js';

const build = (sc) => scriptTrack('t', sc, { l: 1 });

test('quatre pièces à la suite des types (index 158 à 161) ; sommet et tube en virage, ↱ et ↰ (miroirs l’un de l’autre)', () => {
  assert.deepEqual(PIECE_ORDER.slice(158, 162), ['loopTop', 'loopTopL', 'tubeTurn', 'tubeTurnL']);
  assert.equal(MIRROR_TYPES.loopTop, 'loopTopL'); assert.equal(MIRROR_TYPES.tubeTurnL, 'tubeTurn');
});
test('sommet : du mur montant (normale vers l’arrière) au mur descendant une colonne à côté (normale vers l’avant), demi-cercle de 16 m, 2,5 niveaux de haut', () => {
  for (const [id, m] of [['loopTop', 1], ['loopTopL', -1]]) {
    const r = ribbonOf(Track.normalize({ t: id, x: 0, z: 0, l: 4, r: 0 })), a = {}, b = {}, top = {};
    r.pos(0, a); r.pos(1, b); r.pos(0.5, top);
    assert.deepEqual([a.x, a.z, a.nz], [-m * HALF, 0, 1]);
    assert.ok(Math.abs(b.x - m * HALF) < 1e-9 && Math.abs(b.z - CELL) < 1e-9 && b.nz === -1 && Math.abs(b.y - a.y) < 1e-9);
    assert.ok(Math.abs(top.y - a.y - HALF) < 1e-9 && top.ny === -1, 'au sommet : à l’envers, 16 m plus haut');
    assert.ok(PIECES[id].clearance * LEVEL_H >= HALF);
  }
  assert.ok(headingGuided({ t: 'loopTop' }), 'la route guide le cap pendant le glissement d’une colonne (comme un looping décalé)');
});
test('looping modulaire LPR / LPL n : Montée en L, n murs, sommet, n murs, Montée en L à l’envers ; on ressort une colonne à côté, au niveau de départ', () => {
  const tr = build('start B3 S6 LPR2 S6 finish');
  assert.deepEqual(tr.tiles.map((t) => t.t).filter((t) => t !== 'straight'), ['start', 'ramp90', 'wall', 'wall', 'loopTop', 'wall', 'wall', 'ramp90', 'finish']);
  assert.deepEqual(tr.validate(), []);
  const st = tr.tiles.find((t) => t.t === 'start'), fi = tr.tiles.find((t) => t.t === 'finish');
  assert.equal(fi.x - st.x, 1, 'une colonne à droite'); assert.equal(fi.l, st.l);
  assert.deepEqual(continuityIssues(tr).filter((i) => i.level === 'error'), []);
  assert.equal(Track.decode(tr.encode()).signature(), tr.signature());
  const L = build('start B3 S6 LPL0 S6 finish');
  assert.equal(L.tiles.find((t) => t.t === 'finish').x - L.tiles[0].x, -1);
});
test('le pilote fait le looping de 0 à 6 murs de chaque côté (jusqu’à ~80 m de haut) sans toucher ; à 8 murs, trop lent, il retombe', () => {
  for (const W of [0, 1, 3, 6]) for (const op of ['LPR', 'LPL']) {
    const R = runTrack(build(`start B3 S6 ${op}${W} S6 finish`));
    assert.ok(R.ok && R.wallHits === 0 && R.respawns === 0 && R.loops >= 1, `${op}${W} : ${R.reason}`);
    assert.ok(R.yMax > 6.8 + 2 * LEVEL_H + W * LEVEL_H + HALF - 2, `${op}${W} : sommet atteint (${R.yMax.toFixed(1)} m)`);
  }
  const R = runTrack(build('start B3 S6 LPR8 S6 finish'), { maxTime: 30 });
  assert.ok(!R.ok || R.respawns > 0, 'un looping trop haut pour l’élan : la voiture retombe');
});
test('les bouts se raccordent : rampe → mur → sommet → mur (à l’envers) → rampe (à l’envers)', () => {
  const tr = build('start S2 LPR1 S2 finish'), T = tr.tiles;
  const top = T.find((t) => t.t === 'loopTop'), walls = T.filter((t) => t.t === 'wall');
  const touch = (a, b) => tileEnds(a).some((e) => tileEnds(b).some((f) => endsTouch(e, f)));
  assert.ok(touch(top, walls[0]) && touch(top, walls[1]));
});
test('tube en virage TRR / TLL entre des sections de tube : le pilote fait le tour dans le tube, sans toucher ; partage à l’identique', () => {
  for (const sc of ['start B3 S4 TI TM TRR TM TLL TM TO S4 finish', 'start B3 S4 TI TRR TRR TM TO S2 finish']) {
    const tr = build(sc);
    assert.deepEqual(tr.validate(), [], sc);
    const R = runTrack(tr);
    assert.ok(R.ok && R.wallHits === 0 && R.respawns === 0 && R.ribT > 3, `${sc} : ${R.reason}`);
    assert.equal(Track.decode(tr.encode()).signature(), tr.signature());
  }
  const r = ribbonOf(Track.normalize({ t: 'tubeTurn', x: 0, z: 0, l: 2, r: 0 })), o = {};
  r.pos(0.5, o); assert.ok(o.wrap && Math.abs(o.kc - 1 / 8) < 1e-12, 'section de tube fermée, rayon 8 m');
});
test('rendu (sommet avec bordures, tube en virage en tube) ; options : pas de sans-bordures sur ces pièces', () => {
  for (const id of ['loopTop', 'loopTopL', 'tubeTurn', 'tubeTurnL']) {
    const gb = new GeoBuilder(), glow = new GeoBuilder();
    buildTileInto(gb, glow, Track.normalize({ t: id, x: 0, z: 0, l: 4, r: 1 }));
    assert.ok(!gb.empty, id);
    assert.ok(!flagAllowed(id, 'nb'), id);
  }
});

await finish('Étape 5 (looping modulaire, tube en virage) : tout passe.');
