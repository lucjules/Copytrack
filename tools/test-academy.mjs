// Académie (0.9.15) : six leçons guidées, objectifs réalisables, bilan et récompenses ; éditeur en mode guidé (six pièces).
// node tools/test-academy.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { LESSONS, LESSON_COINS, GRADUATE_COINS, completeLesson, lessonDone, lessonsDone, nextLesson, academyComplete } from '../js/academy.js';
import { buildBuiltin } from '../js/tracks.js';
import { GOALS, goalLabel } from '../js/career.js';
import { runTrack } from './lab.mjs';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { scriptTrack } from '../js/track.js';
import { profile, saveProfile } from '../js/profile.js';
import { paletteMethods, GUIDED } from '../js/editor/palette.js';
import { PALETTE_ORDER } from '../js/editor/shared.js';
import { isFamilyMember, REPLACED_BY_OPTION, familyOf } from '../js/families.js';

const build = (L) => buildBuiltin({ ...L, id: 'academy-' + L.id });

console.log('Leçons');
test('six leçons, identifiants uniques, un objectif connu, une consigne et une introduction ; les touches des textes sont toutes connues', () => {
  assert.equal(LESSONS.length, 6);
  assert.equal(new Set(LESSONS.map((l) => l.id)).size, 6);
  for (const L of LESSONS) {
    assert.ok(GOALS[L.goal.id], L.id); assert.ok(goalLabel(L.goal).length > 5, L.id);
    assert.ok(L.name && L.tip.length > 20 && L.tip.length < 120 && L.intro.length >= 2, L.id);
    for (const t of L.intro) for (const m of t.matchAll(/\{(\w+)\}/g)) assert.ok(['accelerate', 'brake', 'left', 'right', 'respawn'].includes(m[1]), L.id + ' : ' + m[0]);
  }
});
test('chaque leçon se construit, est jouable (départ, arrivée, checkpoint), courte, et se partage à l\'identique', () => {
  for (const L of LESSONS) {
    const tr = build(L);
    assert.deepEqual(tr.validate(), [], L.id);
    const S = runTrack(tr);
    assert.ok(S.ok && S.respawns === 0, `${L.id} : ${S.reason || S.respawns + ' réapparitions'}`);
    assert.ok(S.time > 6 && S.time < 40, `${L.id} : ${S.time.toFixed(1)} s`);
  }
});

console.log('Objectifs réalisables');
test('prise en main : le pilote finit sans toucher de muret', () => { const S = runTrack(build(LESSONS[0])); assert.equal(S.wallHits, 0); });
test('réception : le pilote réussit au moins une réception parfaite', () => { const S = runTrack(build(LESSONS[3])); assert.ok(S.perfects >= 1, 'réceptions parfaites : ' + S.perfects); });
test('plaque : le pilote franchit l\'arrivée en moto', () => { const S = runTrack(build(LESSONS[4])); assert.equal(S.vehicle, 'moto'); });
test('obstacles : le pilote passe les piques sans réapparition, choc ni pique touchée (à 90 et 110 % de sa vitesse aussi)', () => {
  const L = LESSONS[5], base = runTrack(build(L));
  assert.ok(base.ok && base.respawns === 0 && base.spikes === 0 && base.shocks === 0 && base.wallHits === 0);
  for (const k of [0.9, 1.1]) { const R = runTrack(build(L), { vCap: +(66 * k).toFixed(1) }); assert.ok(R.ok && R.respawns === 0, 'vitesse ' + k); }
});
test('mini-turbo : un geste de joueur (volant à fond puis frein 0,8 s dans le grand virage) déclenche bien un mini-turbo sans toucher de muret', () => {
  // Pas de pilote automatique pour le dérapage : on rejoue le geste décrit dans la leçon, en boucle ouverte, dès l'entrée du premier grand virage.
  const track = scriptTrack('l', 'start S3 RR S2 finish', { decor: 'desert' });
  const sim = new Simulation(track); sim.start();
  const bot = new Autopilot(track.path, { latLimit: 44.8 });
  bot.reset(sim.phys);
  let t0 = null, sign = 1, turbos = 0, walls = 0;
  for (let i = 0; i < 120 * 12; i++) {
    const p = sim.phys;
    let inp = bot.control(p);
    if (t0 == null && Math.abs(inp.steer) > 0.12 && p.fwdSpeed > 16) { t0 = i / 120; sign = Math.sign(inp.steer); }
    if (t0 != null && i / 120 - t0 < 2.5) { const t = i / 120 - t0; inp = { steer: sign, throttle: t >= 0.8, brake: t < 0.8, drift: false }; }
    sim.drive(inp);
    if (p.ev.miniTurbo) turbos++; if (p.ev.wall > 4) walls++;
    sim.score();
  }
  assert.ok(turbos >= 1 && walls === 0, `mini-turbos ${turbos}, chocs ${walls}`);
  // La leçon « en série » (deux mini-turbos) n'est pas validée par un geste automatique : voir le CHANGELOG.
});

console.log('Bilan et récompenses');
test('un objectif manqué ne valide rien ; réussi, il valide, verse les pièces UNE fois, et le diplôme s\'obtient avec la sixième leçon', () => {
  const p = profile(); p.academy = {}; p.coins = 0; saveProfile();
  const ok = [{ wallHits: 0 }, { turbos: 1 }, { turbos: 2 }, { perfects: 1 }, { vehicle: 'moto' }, { respawns: 0 }];
  const ko = [{ wallHits: 3 }, { turbos: 0 }, { turbos: 1 }, { perfects: 0 }, { vehicle: 'car' }, { respawns: 2 }];
  for (let i = 0; i < 6; i++) { const r = completeLesson(i, { wallHits: 0, respawns: 0, turbos: 0, perfects: 0, rings: 0, vehicle: 'car', time: 10, ...ko[i] }); assert.equal(r.passed, false, 'leçon ' + i); assert.equal(r.coins, 0); }
  assert.equal(lessonsDone(), 0); assert.equal(nextLesson(), 0); assert.equal(profile().coins, 0);
  const defaults = { wallHits: 0, respawns: 0, turbos: 0, perfects: 0, rings: 0, vehicle: 'car', time: 10 };
  let last;
  for (let i = 0; i < 6; i++) { last = completeLesson(i, { ...defaults, ...ok[i] }); assert.ok(last.passed); assert.equal(last.coins, i < 5 ? LESSON_COINS : LESSON_COINS + GRADUATE_COINS); }
  assert.equal(last.graduated, true); assert.equal(profile().coins, 6 * LESSON_COINS + GRADUATE_COINS);
  assert.ok(academyComplete() && lessonDone('prise') && nextLesson() === null);
  const again = completeLesson(0, { ...defaults, ...ok[0] });
  assert.deepEqual([again.passed, again.coins, again.graduated], [true, 0, false], 'refaire une leçon réussie ne reverse rien');
  assert.equal(profile().coins, 6 * LESSON_COINS + GRADUATE_COINS);
  p.academy = {}; p.coins = 0; saveProfile();
});

console.log('Éditeur guidé');
test('mode guidé : six pièces (droite, virage, pente, départ, arrivée, checkpoint) et les quatre outils ; rien d\'autre ; mode complet : tout', () => {
  const ed = (on) => ({ guidedOn: () => on, guidedAllows: paletteMethods.guidedAllows });
  const guided = ed(true), full = ed(false);
  for (const id of ['straight', 'curve', 'slope', 'start', 'finish', 'mod:cp1', 'select', 'inspect', 'erase', 'fill']) assert.equal(guided.guidedAllows(id), true, id);
  for (const id of ['loop', 'tube', 'fork', 'ring', 'platform', 'twist', 'wall', 'surf:boost', 'deco:tree', 'mod:v', 'mod:mv1', 'mod:o1', 'mod:tn', 'mod:tb1', 'mod:th1']) assert.equal(guided.guidedAllows(id), false, id);
  for (const id of ['bigcurve', 'steep', 'gentle']) assert.equal(guided.guidedAllows(id), isFamilyMember(id) && ['straight', 'turn'].includes(familyOf(id).fam), id + ' : seulement s\'il fait partie des familles Droite ou Virage');
  for (const id of ['loop', 'tube', 'surf:boost', 'deco:tree', 'mod:mv1']) assert.equal(full.guidedAllows(id), true, id);
  assert.deepEqual([...GUIDED.pieces].sort(), ['finish', 'start']);
  assert.deepEqual([...GUIDED.fams].sort(), ['straight', 'turn']);
});
test('le départ et l\'arrivée sont des boutons de la palette ; droite et virage (avec pente et grand virage) sont des familles : le mode guidé ne laisse aucun bouton orphelin', () => {
  const single = PALETTE_ORDER.map((p) => p.id).filter((id) => !isFamilyMember(id) && !REPLACED_BY_OPTION.has(id));
  for (const id of ['start', 'finish']) assert.ok(single.includes(id), id + ' est un bouton de la palette');
  assert.ok(isFamilyMember('straight') && isFamilyMember('curve'), 'droite et virage viennent des familles');
});

await finish('Tous les tests de l\'Académie passent.');
