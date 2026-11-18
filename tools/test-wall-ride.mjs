// Wall-rides 2.0 (0.11.3) : node tools/test-wall-ride.mjs   (npm test)
//  - chicane posée sur un mur (ZR< ZL> …) : roulée, son décalage d'une colonne devient une MONTÉE ou une DESCENTE de 32 m le long du mur, en S lisse ; raccords sans erreur ;
//  - solides (blocs…) contre une voiture sur un ruban : avant, une voiture sur un mur les traversait ;
//  - bloc posé sur le bas (ou le haut) d'un mur dans un circuit (obst { wall: 'bas' | 'haut' }) : il faut passer au-dessus (dessous) ; le pilote automatique change de ligne ;
//  - circuits officiels : six murs à blocs, cinq bosses sur un mur, tous finis sans choc.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { scriptTrack, Track } from '../js/track.js';
import { flagAllowed, PIECES } from '../js/pieces.js';
import { continuityIssues } from '../js/continuity.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { LEVEL_H } from '../js/constants.js';
import { runTrack } from './lab.mjs';

const levelAfter = (sc, l0 = 12) => scriptTrack('t', sc, { l: l0 }).tiles.find((t) => t.t === 'finish').l - l0;
const clean = (S) => S.ok && S.respawns === 0 && S.wallHits === 0;
// La voiture garde le milieu de la route sur les murs (le pilote automatique sans sa ligne visée).
const MIDDLE = { control: (p, bot) => { const keep = bot.path.wallLine; bot.path.wallLine = null; const c = bot.control(p); bot.path.wallLine = keep; return c; } };

test('chicane sur un mur : permise sur un mur gauche ou droit (pas inclinée ni en surplomb) ; elle monte ou descend de 5 niveaux (32 m), 10 pour le grand S', () => {
  for (const id of Object.keys(PIECES).filter((k) => PIECES[k].kind === 'sbend')) {
    assert.ok(flagAllowed(id, 'o', null, 1) && flagAllowed(id, 'o', null, 2), id);
    for (const o of [3, 4, 5, 6]) assert.ok(!flagAllowed(id, 'o', null, o), id + ' o' + o);
  }
  // mur gauche : le toit de la voiture pointe vers la droite, la droite est vers le bas ; mur droit : l'inverse
  assert.equal(levelAfter('start S [tr01s] ZL< [tr10s] S finish'), 5);
  assert.equal(levelAfter('start S [tr01s] ZR< [tr10s] S finish', 20), -5);
  assert.equal(levelAfter('start S [tr02s] ZR> [tr20s] S finish'), 5);
  assert.equal(levelAfter('start S [tr02s] ZZR> [tr20s] S finish'), 10);
  assert.equal(levelAfter('start S [tr01s] ZL4< ZR4< [tr10s] S finish'), 0, 'une bosse revient au même niveau');
});
test('bosse sur un mur : raccords sans erreur, code stable ; au volant on monte de 32 m et on redescend sans toucher ; mains lâchées, on tombe', () => {
  const sc = 'start B2 S3 [tr01s] S2< ZL4< S< ZR4< S< [tr10s] S4 finish', tr = scriptTrack('t', sc, { l: 12 });
  assert.deepEqual(continuityIssues(tr).filter((i) => i.level === 'error'), []);
  assert.equal(Track.decode(tr.encode()).signature(), tr.signature());
  const S = runTrack(tr, { maxTime: 40 });
  assert.ok(clean(S), S.reason || S.wallHits + ' chocs');
  assert.ok(S.yMax > 12 * LEVEL_H + 30, `sommet ${S.yMax.toFixed(0)} m`);
  const H = runTrack(scriptTrack('t', sc, { l: 12 }), { maxTime: 40, driver: { control: (p, bot) => { const c = bot.control(p); if (p.rib && p.rib.tile.o) c.steer = 0; return c; } } });
  assert.ok(!clean(H), 'mains lâchées, la voiture passe encore');
});
test('bloc sur un mur : collé à la paroi, sur le bas (haut = milieu du mur) ou sur le haut (bas = milieu) ; au milieu de la route on s\'y écrase, sur la ligne du pilote on passe', () => {
  for (const [script, wall] of [['start B2 S3 [tr01s] S4< [tr10s] S4 finish', 'bas'], ['start B2 S3 [tr02s] S4> [tr20s] S4 finish', 'haut']]) {
    const def = { id: 'x', name: 'x', script, opts: { l: 8 }, obst: [{ k: 'block', at: 0.5, wall, s: 2 }] };
    const tr = buildBuiltin(def), b = tr.decos.find((d) => d.k === 'block'), i = Math.floor(tr.path.length * 0.5), a = tr.path[i];
    assert.ok(Math.abs((wall === 'bas' ? b.y + 16 : b.y) - a[1]) < 0.2, `${wall} : le bloc s'arrête au milieu du mur`);
    assert.ok(Math.hypot(b.x - a[0], b.z - a[2]) > 7 && Math.hypot(b.x - a[0], b.z - a[2]) < 9, 'collé à la paroi (centre à 8 m de la route)');
    assert.ok(tr.path.wallLine && tr.path.wallLine[i] === (wall === 'bas' ? 6 : -6), 'ligne du pilote');
    const A = runTrack(buildBuiltin(def), { maxTime: 40 }), M = runTrack(buildBuiltin(def), { maxTime: 40, driver: MIDDLE });
    assert.ok(clean(A), `${wall} : le pilote passe (${A.reason || A.wallHits + ' chocs'})`);
    assert.ok(M.wallHits > 0 && !clean(M), `${wall} : au milieu de la route, la voiture traverse le bloc`);
  }
  assert.throws(() => buildBuiltin({ id: 'x', name: 'x', script: 'start S6 finish', obst: [{ k: 'block', at: 0.5, wall: 'bas' }] }), /pas de ligne droite sur un mur/);
});
test('circuits officiels : six murs à blocs et cinq bosses sur un mur, finis par le pilote sans un choc', () => {
  const blocks = BUILTIN_TRACKS.filter((d) => (d.obst || []).some((o) => o.wall)), humps = BUILTIN_TRACKS.filter((d) => /Z[RL]\d?[<>]/.test(d.script));
  assert.ok(blocks.length >= 6 && humps.length >= 5, `${blocks.length} circuits à blocs, ${humps.length} à bosses`);
  for (const d of [...blocks, ...humps]) { const S = runTrack(buildBuiltin(d)); assert.ok(clean(S), `${d.id} : ${S.reason || S.wallHits + ' chocs'}`); }
});

await finish('Tous les tests des wall-rides passent.');
