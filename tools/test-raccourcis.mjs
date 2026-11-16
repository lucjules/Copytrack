// Raccourcis (0.11.0) : un carrefour traversé deux fois (circuit en 8) ne doit pas permettre de couper la boucle qui revient sur lui :
// node tools/test-raccourcis.mjs   (npm test)
//  - le vérificateur de l'éditeur prévient quand une boucle n'a aucun checkpoint (et se tait quand elle en a un) ;
//  - un pilote qui tourne au carrefour dès le premier passage finit la course sans checkpoint dans la boucle, et ne la finit plus avec ;
//  - aucun circuit officiel ne se coupe (les 26 boucles des 25 circuits concernés ont un checkpoint).
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { scriptTrack } from '../js/track.js';
import { checkTrack } from '../js/editorTools.js';
import { PIECES, tileCenter } from '../js/pieces.js';
import { RaceLogic } from '../js/raceLogic.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { runTrack } from './lab.mjs';

const build = (sc) => scriptTrack('t', sc, { l: 1 });
const cutWarn = (tr) => checkTrack(tr).filter((i) => /Carrefour : la boucle/.test(i.msg));
// Les passages du chemin du pilote au centre de chaque carrefour traversé deux fois : [carrefour, indice du 1er passage, indice du 2e].
function passes(tr) {
  const P = tr.path, out = [];
  for (const J of tr.tiles.filter((t) => PIECES[t.t].kind === 'junction')) {
    const c = tileCenter(J), d = P.map((p) => Math.hypot(p[0] - c.x, p[2] - c.z));
    const near = d.map((v, i) => [v, i]).filter(([v]) => v < 6).map(([, i]) => i);
    if (!near.length) continue;
    const groups = [[near[0]]];
    for (const i of near.slice(1)) { if (i - groups[groups.length - 1].at(-1) > 5) groups.push([i]); else groups[groups.length - 1].push(i); }
    if (groups.length < 2) continue;
    const best = (g) => g.reduce((a, i) => (d[i] < d[a] ? i : a), g[0]);
    out.push([J, best(groups[0]), best(groups[1])]);
  }
  return out;
}
// Un pilote qui coupe : il suit le chemin jusqu'au centre du carrefour, puis repart directement vers la sortie (2e passage).
const cutRun = (tr, i1, i2, maxTime) => { const t = tr; t.path = tr.path.slice(0, i1 + 1).concat(tr.path.slice(i2)); return runTrack(t, { maxTime }); };

test('vérificateur : une boucle de carrefour sans checkpoint est signalée (virages serrés ou géants), plus quand un checkpoint est dans la boucle', () => {
  for (const sc of ['start S2 JX R S R R S JX L S finish', 'start B2 S2 JX S4 XR XR XR S4 JX S2 finish']) assert.equal(cutWarn(build(sc)).length, 1, sc);
  for (const sc of ['start S2 JX R C R R S JX L S finish', 'start B2 S2 JX S2 C S XR XR XR S4 JX S2 finish', 'start S3 R R S finish', 'start S2 JXR S2 JXL S2 finish']) assert.deepEqual(cutWarn(build(sc)), [], sc);
});
test('en course : couper la boucle finit la course plus vite sans checkpoint ; avec un checkpoint dans la boucle, l’arrivée n’est plus validée', () => {
  for (const [open, closed] of [['start B2 S2 JX R S R R S JX L S2 finish', 'start B2 S2 JX R C R R S JX L S2 finish'], ['start B2 S3 JX S4 XR XR XR S4 JX S3 finish', 'start B2 S3 JX S4 XR XR XR S2 C S JX S3 finish']]) {
    const a = build(open), full = runTrack(a), [[, i1, i2]] = passes(a);
    const cut = cutRun(build(open), i1, i2, 40);
    assert.ok(full.ok && cut.ok && cut.time < full.time - 4, `${open} : ${full.time.toFixed(1)} s normalement, ${cut.time.toFixed(1)} s en coupant`);
    const b = build(closed), [[, j1, j2]] = passes(b);
    assert.ok(!cutRun(b, j1, j2, 40).ok, closed + ' : la coupe ne doit plus finir');
  }
});
test('circuits officiels : chaque carrefour traversé deux fois a un checkpoint entre ses deux passages, et la coupe ne finit pas la course', () => {
  let n = 0;
  for (const d of BUILTIN_TRACKS) {
    const tr = buildBuiltin(d), cps = new RaceLogic(tr).cps.map((c) => { const cc = tileCenter(c); return tr.path.findIndex((p) => Math.hypot(p[0] - cc.x, p[2] - cc.z) < 16); });
    for (const [, i1, i2] of passes(tr)) {
      n++;
      assert.ok(cps.some((i) => i > i1 && i < i2), `${d.id} : aucun checkpoint entre les deux passages du carrefour`);
      assert.deepEqual(cutWarn(tr), [], d.id);
      assert.ok(!cutRun(buildBuiltin(d), i1, i2, 90).ok, d.id + ' : la coupe finit la course');
    }
  }
  assert.ok(n >= 26, n + ' boucles de carrefour');
});

await finish('Tous les tests des raccourcis passent.');
