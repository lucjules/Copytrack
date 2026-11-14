// 0.9.67 : bifurcation à deux chemins libres (SPL … ALT … MRG) et virage géant 5×5 : node tools/test-fusion-geant.mjs   (npm test)
//  - le langage des circuits : deux voies qui suivent chacune leur chemin puis fusionnent ; erreurs claires quand elles ne se rejoignent pas ;
//  - le pilote automatique suit la voie choisie (directe, ou ALTP : la déportée), et chacune des deux voies se finit ;
//  - le virage géant : géométrie (rayon 144 m), vitesse de passage, famille de l'éditeur, ordre d'encodage, partage à l'identique ;
//  - le chapitre 1 refait : deux fois plus long, une bifurcation dans chaque circuit, des virages géants.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { scriptTrack, Track } from '../js/track.js';
import { PIECES, PIECE_ORDER, arcParams } from '../js/pieces.js';
import { resolve, familyOf } from '../js/families.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { runTrack } from './lab.mjs';
import { CELL } from '../js/constants.js';

const build = (sc, l = 2) => scriptTrack('essai', sc, { l });
const forks = (tr) => tr.tiles.filter((t) => PIECES[t.t].kind === 'fork');

console.log('Bifurcation à deux chemins libres');
test('une voie qui saute un vide, l’autre qui reste à plat : deux bifurcations posées (fourche et fusion), aucune alerte de l’éditeur', () => {
  const tr = build('start S2 SPL U G1 D S ALT S4 MRG S2 finish');
  assert.equal(forks(tr).length, 2);
  assert.deepEqual(tr.validate(), []);
  assert.ok(tr.tiles.some((t) => t.t === 'slope'), 'la voie directe monte');
});
test('les voies peuvent prendre des chemins différents (détour par des virages) tant qu’elles se rejoignent', () => {
  const tr = build('start S2 SPLL S4 ALT L R S2 R L MRG S2 finish');
  assert.equal(forks(tr).length, 2);
  assert.deepEqual(tr.validate(), []);
});
test('erreurs claires : voies de longueurs différentes, ALT ou MRG orphelins, fourches imbriquées, fourche jamais refermée', () => {
  assert.throws(() => build('start S2 SPL S4 ALT S3 MRG finish'), /ne se rejoignent pas/);
  assert.throws(() => build('start S2 ALT S2 finish'), /ALT sans SPL/);
  assert.throws(() => build('start S2 MRG S2 finish'), /MRG sans SPL/);
  assert.throws(() => build('start S2 SPL SPL S4 ALT S4 MRG finish'), /ne s'imbriquent pas/);
  assert.throws(() => build('start S2 SPL S4 ALT S4 finish'), /SPL sans MRG/);
});
test('le pilote suit la voie directe par défaut, la déportée avec ALTP ; les deux se finissent sans réapparition', () => {
  const direct = build('start B3 S4 SPL U G1 D S ALT S4 MRG S4 finish'), side = build('start B3 S4 SPL U G1 D S ALTP S4 MRG S4 finish');
  const A = runTrack(direct), B = runTrack(side);
  assert.ok(A.ok && A.respawns === 0 && B.ok && B.respawns === 0, `${A.reason} / ${B.reason}`);
  assert.ok(A.airTotal > 0.5, 'par la voie directe, la voiture saute : ' + A.airTotal);
  assert.ok(B.airTotal < 0.2, 'par la voie déportée, elle reste au sol : ' + B.airTotal);
});
test('les circuits partagés gardent leurs bifurcations : encodage puis lecture à l’identique', () => {
  const tr = build('start S2 SPL U G1 D S ALT S4 MRG S2 finish'), back = Track.decode(tr.encode());
  assert.equal(back.signature(), tr.signature());
  assert.equal(forks(back).length, 2);
});

console.log('Virage géant');
test('pièce 5×5, rayon 144 m (centre au coin), ajoutée en DERNIER dans l’ordre d’encodage ; les rayons des anciens virages ne changent pas', () => {
  assert.equal(PIECES.giantcurve.size, 5); assert.equal(PIECES.giantcurve.kind, 'arc'); assert.equal(PIECES.giantcurve.rise, 0);
  assert.deepEqual(arcParams(PIECES.giantcurve), { cx: 2.5 * CELL, cz: 2.5 * CELL, R: 4.5 * CELL });
  assert.deepEqual(arcParams(PIECES.curve), { cx: CELL / 2, cz: CELL / 2, R: CELL / 2 });
  assert.deepEqual(arcParams(PIECES.bigcurve), { cx: CELL, cz: CELL, R: 1.5 * CELL });
  assert.deepEqual(arcParams(PIECES.hugecurve), { cx: 1.5 * CELL, cz: 1.5 * CELL, R: 2.5 * CELL });
  assert.equal(PIECE_ORDER[PIECE_ORDER.length - 1], 'giantcurve');
});
test('famille « Virage » de l’éditeur : rayon « Géant »', () => {
  assert.equal(resolve('turn', { size: 'xl', bank: '0', incl: '0', dir: 'R' }), 'giantcurve');
  assert.deepEqual(familyOf('giantcurve').traits, { size: 'xl', bank: '0', incl: '0', dir: 'R' });
});
test('XR / XL tournent de 90° dans le bon sens ; le circuit se partage à l’identique', () => {
  const tr = build('start S2 XR S2 XL S2 finish');
  assert.equal(tr.tiles.filter((t) => t.t === 'giantcurve').length, 2);
  assert.deepEqual(tr.validate(), []);
  assert.equal(tr.turtle.h, 0, 'XR puis XL : on repart dans la direction de départ');
  assert.equal(Track.decode(tr.encode()).signature(), tr.signature());
});
test('il se prend bien plus vite que le très grand virage (3×3) : plus de 200 km/h au plus lent, contre moins de 200', () => {
  const vmin = (sc) => { const S = runTrack(build(sc), { vCap: 80 }); assert.ok(S.ok && S.wallHits === 0, sc); return Math.min(...S.samples.filter((s) => s[0] > 4).map((s) => s[1] * 3.6)); };
  const giant = vmin('start B3 S10 XR S4 XL S6 finish'), huge = vmin('start B3 S10 HR S4 HL S6 finish');
  assert.ok(giant > 200 && huge < 200 && giant > huge + 15, `géant ${giant.toFixed(0)} km/h, très grand ${huge.toFixed(0)} km/h`);
});

console.log('Chapitre 1 refait');
test('les six circuits du chapitre 1 durent de 45 à 85 s (avant : 23 à 42 s), dans l’ordre de difficulté, avec une bifurcation chacun ; virages géants dans les rapides', () => {
  const ch1 = BUILTIN_TRACKS.slice(0, 6), times = [];
  for (const d of ch1) {
    const tr = buildBuiltin(d), S = runTrack(tr);
    assert.ok(S.ok && S.respawns === 0, d.id);
    times.push(S.time);
    assert.ok(S.time >= 45 && S.time <= 85, `${d.id} : ${S.time.toFixed(1)} s`);
    assert.equal(forks(tr).length, 2, d.id + ' : une fourche et une fusion');
  }
  assert.ok(times[0] < times[5], 'le dernier est le plus long : ' + times.map((t) => t.toFixed(0)).join(' '));
  for (const id of ['eclats', 'canyon']) assert.ok(buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === id)).tiles.some((t) => t.t === 'giantcurve'), id);
});

await finish('Bifurcations et virage géant : tout passe.');
