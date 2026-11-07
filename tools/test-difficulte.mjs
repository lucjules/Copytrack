// Indice de difficulté estimé d'après la géométrie (js/difficulty.js) : répartition sur les circuits intégrés, sens des variations, circuits de joueurs.
// node tools/test-difficulte.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { estimateDifficulty, difficultyMetrics, difficultyScore, starsOf, starsText, STAR_STEPS, STAR_LABELS } from '../js/difficulty.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { scriptTrack, Track } from '../js/track.js';

const est = (script, o = {}) => estimateDifficulty(scriptTrack('t', script, { decor: 'desert', ...o }));

console.log('Étoiles');
test('seuils croissants ; 1 à 5 étoiles ; libellés et affichage', () => {
  assert.deepEqual([...STAR_STEPS].sort((a, b) => a - b), STAR_STEPS);
  assert.deepEqual([0, 3, 4.6, 7.9, 8, 9.9, 10, 13.9, 14, 99].map(starsOf), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  assert.equal(starsText(3), '◆◆◆◇◇'); assert.equal(STAR_LABELS.length, 6);
});
test('sur les 72 circuits intégrés : les cinq niveaux sont tous représentés (au moins 5 % chacun), sans niveau qui écrase les autres (60 % au plus)', () => {
  const all = BUILTIN_TRACKS.map((d) => estimateDifficulty(buildBuiltin(d)).stars);
  for (let k = 1; k <= 5; k++) { const n = all.filter((x) => x === k).length; assert.ok(n >= 0.05 * all.length, `${k} étoile(s) : ${n} circuits`); assert.ok(n <= 0.6 * all.length, `${k} étoile(s) : ${n} circuits`); }
});
test('sens : un sprint de la carrière est plus facile qu\'un circuit technique, et le chapitre bonus Atelier (apprentissage) reste facile', () => {
  const avg = (profil) => { const l = BUILTIN_TRACKS.filter((d) => d.profil === profil).map((d) => difficultyScore(difficultyMetrics(buildBuiltin(d)))); return l.reduce((a, b) => a + b) / l.length; };
  assert.ok(avg('sprint') < avg('speedway') && avg('speedway') < avg('technique'), `${avg('sprint')} ${avg('speedway')} ${avg('technique')}`);
  assert.ok(avg('atelier') < avg('rollercoaster'));
  const atelier = BUILTIN_TRACKS.filter((d) => d.profil === 'atelier').map((d) => estimateDifficulty(buildBuiltin(d)).stars);
  assert.ok(atelier.every((s) => s <= 3), atelier.join(' '));
});
test('monotone : chaque ingrédient (virages serrés, murs, obstacles, pièces mobiles, longueur) ne peut que relever le score', () => {
  const base = est('start S3 R S2 L S2 C S3 finish');
  const tight = est('start S2 R L R L R L S C S3 finish');
  assert.ok(tight.score > base.score, 'virages serrés');
  const long = est('start S3 R S2 L S2 C S3 R S2 L S2 C S3 R S2 L S2 finish');
  assert.ok(long.score > base.score, 'longueur');
  const mk = (extra) => { const t = scriptTrack('t', 'start S3 R S2 L S2 C S3 finish', { decor: 'desert' }); for (const e of extra) t.addDeco({ k: e, x: 10, y: 0.4, z: 10, ry: 0, s: 1, c: 0 }); return estimateDifficulty(t); };
  assert.ok(mk(['hammer']).score > mk([]).score, 'un marteau');
  assert.ok(mk(['hammer', 'pendulum', 'spikesPop']).score > mk(['hammer']).score, 'plus d\'obstacles');
  assert.ok(mk(['bumper']).score < mk(['hammer']).score, 'un bumper de bord pèse moins qu\'un marteau');
  const mv = est('start S3 S2~ S2 R S2 L S2 C S3 finish', { l: 6 });
  assert.ok(mv.metrics.movers === 2, 'pièce mobile : deux dalles'); assert.ok(mv.score > est('start S3 S2 S2 R S2 L S2 C S3 finish', { l: 6 }).score, 'pièce mobile');
  assert.equal(base.metrics.obstacles, 0);
});
test('un circuit vide ou abîmé ne plante pas : 1 étoile ; un circuit à plusieurs tours coûte plus cher que le même à un tour', () => {
  assert.deepEqual([estimateDifficulty(new Track('v')).stars, estimateDifficulty({}).stars], [1, 1]);
  const one = est('start S3 R S2 L S2 C S3 finish'), t = scriptTrack('t', 'start S3 R S2 L S2 C S3 finish', { decor: 'desert' });
  t.laps = 3;
  assert.ok(estimateDifficulty(t).score > one.score);
});
test('les circuits partagés (code SHW) donnent la même estimation avant et après partage', () => {
  for (const d of BUILTIN_TRACKS.filter((_, i) => i % 9 === 0)) { const t = buildBuiltin(d), back = Track.decode(t.encode()); assert.equal(estimateDifficulty(back).stars, estimateDifficulty(t).stars, d.id); }
});

await finish('Tous les tests de l\'indice de difficulté passent.');
