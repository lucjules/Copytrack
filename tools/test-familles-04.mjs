// Familles, phase 4 (0.11.4) : node tools/test-familles-04.mjs   (npm test)
//  - bifurcation EN T (TSPL … TALT … TMRG) : le carrefour en T sert enfin : voie directe ou branche, qui se rejoignent à un second T ; le pilote suit l'une ou l'autre ;
//    le vérificateur n'y voit pas de raccourci (règle réservée aux croisements) mais prévient d'un checkpoint posé dans une voie (tous doivent être pris) ;
//  - virage géant RELEVÉ et INCLINÉS (montée / descente de ½ à 4 niveaux, ↱ / ↰) : dans la famille Virage, posables par script (XBR, XUR n, XDR n), pilotés sans choc ;
//  - circuits officiels : deux bifurcations en T, la boucle « croisement + trois virages géants » variée sur huit circuits.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { scriptTrack, Track } from '../js/track.js';
import { PIECES, PIECE_ORDER } from '../js/pieces.js';
import { FAMILIES, resolve } from '../js/families.js';
import { checkTrack } from '../js/editorTools.js';
import { BUILTIN_TRACKS } from '../js/tracks.js';
import { runTrack } from './lab.mjs';

const build = (sc) => scriptTrack('t', sc, { l: 4 });
const msgs = (tr) => checkTrack(tr).filter((i) => i.level !== 'info').map((i) => i.msg);
const clean = (S) => S.ok && S.respawns === 0 && S.wallHits === 0;
const FORK = 'start B2 S3 TSPL U G1 D TALT S L S3 L S TMRG S4 finish';

test('bifurcation en T : deux carrefours en T, la branche rejoint la directe par le côté ; code stable ; erreurs claires si les voies ne se rejoignent pas', () => {
  const tr = build(FORK), tees = tr.tiles.filter((t) => t.t === 'tee');
  assert.equal(tees.length, 2);
  assert.equal(Track.decode(tr.encode()).signature(), tr.signature());
  assert.throws(() => build('start S3 TSPL U G1 D TALT S L S2 L S TMRG S2 finish'), /ne se rejoignent pas/);
  assert.throws(() => build('start S3 TSPL S4 finish'), /TSPL\) sans TMRG/);
  assert.throws(() => build('start S3 TALT S finish'), /TALT sans TSPL/);
  // branche à gauche : le miroir
  assert.equal(build('start B2 S3 TSPLL U G1 D TALT S R S3 R S TMRG S4 finish').tiles.filter((t) => t.t === 'tee').length, 2);
});
test('le pilote suit la directe (le saut) ou, avec TALTP, la branche (le détour) ; les deux finissent sans choc, le saut est bien plus rapide', () => {
  const A = runTrack(build(FORK), { maxTime: 40 }), B = runTrack(build(FORK.replace('TALT', 'TALTP')), { maxTime: 40 });
  assert.ok(clean(A) && clean(B), `${A.reason} / ${B.reason}`);
  assert.ok(A.airMax > 1 && B.airMax < 0.35, 'la directe saute, la branche roule');
  assert.ok(B.time > A.time + 3, `détour ${B.time.toFixed(1)} s contre saut ${A.time.toFixed(1)} s`);
});
test('vérificateur : une bifurcation en T n\'est pas un raccourci ; un checkpoint dans une voie (ou un dans chacune : tous doivent être pris) est signalé, une fois', () => {
  assert.deepEqual(msgs(build(FORK)), []);
  const one = msgs(build('start B2 S3 TSPL U G1 D TALT S L S C S L S TMRG S4 finish'));
  assert.equal(one.filter((m) => /Bifurcation en T/.test(m)).length, 1, one.join(' / '));
  assert.equal(msgs(build('start B2 S3 TSPL S C S TALT S L S C S L S TMRG S4 finish')).filter((m) => /Bifurcation en T/.test(m)).length, 1, 'un checkpoint sur chaque voie : impossible de prendre les deux');
  assert.deepEqual(msgs(build('start B2 S C S2 TSPL S3 TALT S L S3 L S TMRG C S3 finish')), [], 'avant la bifurcation et après la fusion : rien à dire');
  // (un croisement traversé deux fois reste surveillé : voir test-raccourcis)
});
test('virage géant relevé et inclinés : dans la famille Virage (rayon Géant), à la suite de l\'ordre des pièces ; posés par script au bon niveau ; pilotés sans choc', () => {
  assert.equal(resolve('turn', { size: 'xl', bank: '1', incl: '0', dir: 'R' }), 'bankGiant');
  assert.equal(resolve('turn', { size: 'xl', bank: '0', incl: '2', dir: 'L' }), 'cvGiantL2');
  assert.equal(resolve('turn', { size: 'xl', bank: '0', incl: '-4', dir: 'R' }), 'cvdGiant4');
  assert.deepEqual(PIECE_ORDER.slice(PIECE_ORDER.indexOf('tubeTurnL') + 1), ['bankGiant', ...['cvGiant', 'cvGiantL', 'cvdGiant', 'cvdGiantL'].flatMap((p) => ['05', '1', '2', '4'].map((r) => p + r))]);
  for (const id of PIECE_ORDER.slice(PIECE_ORDER.indexOf('bankGiant'))) assert.equal(PIECES[id].size, 5, id);
  const lv = (sc) => build(sc).tiles.find((t) => t.t === 'finish').l - 4;
  assert.equal(lv('start S2 XUR2 S2 finish'), 2); assert.equal(lv('start S2 XDL4 S2 finish'), -4); assert.equal(lv('start S2 XUR0 S2 finish'), 0.5); assert.equal(lv('start S2 XBR S2 finish'), 0);
  for (const sc of ['start B2 S3 XBR S3 finish', 'start B2 S3 XBL S3 finish', 'start B2 S3 XUR2 S3 finish', 'start B2 S3 XUL4 S3 finish', 'start B2 S3 XDR1 S3 finish', 'start B2 S3 XDL2 S3 finish']) {
    const S = runTrack(scriptTrack('t', sc, { l: 8 }), { maxTime: 40 });
    assert.ok(clean(S), `${sc} : ${S.reason || S.wallHits + ' chocs'}`);
  }
});
test('circuits officiels : deux bifurcations en T ; la boucle du croisement variée (relevée, en pente) sur huit circuits', () => {
  assert.ok(BUILTIN_TRACKS.filter((d) => /TSPL/.test(d.script)).length >= 2);
  const loops = BUILTIN_TRACKS.filter((d) => /JX S4 (X[RBUD][RL]?\d? ){3}/.test(d.script + ' ') && !/JX S4 XR XR XR/.test(d.script));
  assert.ok(loops.length >= 8, loops.length + ' boucles variées');
  assert.ok(Object.keys(FAMILIES.turn.members).includes('bankGiant'));
});

await finish('Tous les tests des familles (phase 4) passent.');
