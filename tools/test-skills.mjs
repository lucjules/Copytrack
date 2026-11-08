// Académie 2 (E12) : compétences et exercices évalués. node tools/test-skills.mjs   (npm test)
//  - chaque exercice se construit et se finit ; sa note vient de la course REJOUÉE (analysis/drill.js), et chaque note est démontrée par une course scriptée :
//    pilote automatique à 50, 60, 80 et 100 % de son adhérence (chicanes, freinage), geste de dérapage scripté (mini-turbo), assiette en vol (réceptions) ;
//  - profil : notes, meilleures mesures, pièces une seule fois par note, point faible, conseil adapté à un conseil du coach, fusion cloud.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { buildBuiltin } from '../js/tracks.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { InputRecorder, quantSteer } from '../js/replay.js';
import { makeReference, project } from '../js/analysis/reference.js';
import { measureRun, drillAdvice } from '../js/analysis/drill.js';
import { SKILLS, DRILLS, DRILL_COINS, drillById, gradeDrill, valueOf, describeMeasure, goalTexts, recordDrill, drillLevel, drillBest, skillLevel, weakestDrill, mergeDrills, drillForTip, COACH_SKILL } from '../js/skills.js';
import { mergeProfile } from '../js/cloudsave.js';
import { profile, saveProfile } from '../js/profile.js';
import { LESSONS } from '../js/academy.js';
import { COACH_TEXT } from '../js/analysis/coach.js';
import { DT } from '../js/constants.js';

const build = (d) => buildBuiltin({ ...d, id: 'drill-' + d.id });

// Course scriptée : le pilote automatique (latK : part de son adhérence), et en option un geste de dérapage déclenché à une distance du départ
// (volant à fond, frein B s, puis accélérateur jusqu'à L s), un coup de frein de `stall` s sur la dernière ligne droite, ou le frein tenu en l'air
// (le nez se relève).
function drive(track, { latK = 0.8, gesture = null, airBrake = false, stall = 0 } = {}) {
  const sim = new Simulation(track), rec = new InputRecorder();
  sim.start();
  const ref = makeReference(track), o = { s: 0, j: 0, d: 0 };
  const bot = new Autopilot(track.path, { latLimit: 56 * latK });
  bot.reset(sim.phys);
  let g0 = null, done = false, stall0 = null;
  for (let i = 0; i < 90 / DT; i++) {
    const p = sim.phys, now = i * DT;
    let inp = bot.control(p);
    if (gesture) {
      project(ref, p.pos.x, p.pos.y, p.pos.z, o.j, o);
      if (!done && g0 == null && o.s >= gesture.at) g0 = now;
      if (g0 != null) {
        const dt = now - g0;
        if (dt < gesture.L) inp = { steer: 1, throttle: dt >= gesture.B, brake: dt < gesture.B, drift: false };
        else { g0 = null; done = true; bot.reset(p); }
      }
    }
    if (stall) {
      if (gesture == null) project(ref, p.pos.x, p.pos.y, p.pos.z, o.j, o);
      if (stall0 == null && o.s >= ref.length - 110) stall0 = now;
      if (stall0 != null && now - stall0 < stall) inp = { ...inp, throttle: false, brake: true };
    }
    if (airBrake && !p.grounded && !p.rib) inp = { ...inp, throttle: false, brake: true };
    inp.steer = quantSteer(inp.steer);
    rec.push(inp, false);
    const ev = sim.step(inp);
    if (sim.lost) return null;
    if (ev && ev.type === 'finish') return rec.encode();
  }
  return null;
}
const grade = (d, opts) => { const tr = build(d), inputs = drive(tr, opts); assert.ok(inputs, `${d.id} : la course scriptée finit`); const m = measureRun(tr, inputs, d); return { g: gradeDrill(d, m), m }; };

console.log('Exercices');
test('quatre compétences, chacune avec au moins un exercice ; identifiants uniques ; trois objectifs chiffrés par exercice ; les touches des textes sont connues', () => {
  assert.equal(SKILLS.length, 4);
  assert.equal(new Set(DRILLS.map((d) => d.id)).size, DRILLS.length);
  for (const s of SKILLS) assert.ok(DRILLS.some((d) => d.skill === s.id), s.id);
  for (const d of DRILLS) {
    assert.ok(SKILLS.some((s) => s.id === d.skill), d.id);
    assert.equal(goalTexts(d).length, 3, d.id);
    for (const g of goalTexts(d)) assert.ok(!/\{\w+\}/.test(g), d.id + ' : ' + g);
    assert.ok(d.intro.length >= 2 && d.tip.length > 20 && d.tip.length < 120, d.id);
    for (const t of d.intro) for (const m of t.matchAll(/\{(\w+)\}/g)) assert.ok(['accelerate', 'brake', 'left', 'right', 'respawn'].includes(m[1]), d.id + ' : ' + m[0]);
    if (d.thresholds) for (let i = 1; i < 3; i++) assert.ok(d.better === 'high' ? d.thresholds[i] > d.thresholds[i - 1] : d.thresholds[i] < d.thresholds[i - 1], d.id + ' : seuils dans l’ordre');
  }
});
test('chaque exercice se construit, est valide et se finit au pilote automatique ; les zones mesurées existent', () => {
  for (const d of DRILLS) {
    const tr = build(d);
    assert.deepEqual(tr.validate(), [], d.id);
    const m = measureRun(tr, drive(tr), d);
    assert.ok(m.finished && m.time > 6 && m.time < 40, `${d.id} : ${m.time}`);
    if (d.zones.length) assert.ok(m.zoneTime > 1 && m.zoneSpeed > 50, d.id + ' : zones mesurées');
  }
});
test('les six leçons de l’Académie restent là, intactes (elles ne sont pas des exercices)', () => {
  assert.equal(LESSONS.length, 6);
  for (const L of LESSONS) assert.equal(drillById(L.id), null, L.id);
});

console.log('Notes démontrées par des courses scriptées');
test('chicanes : plus le pilote garde de vitesse, meilleure est la note (50 % : rien, 60 % : bronze, 80 % : argent, 100 % : or)', () => {
  const d = drillById('chicanes');
  const g = [0.5, 0.6, 0.8, 1.0].map((latK) => grade(d, { latK }));
  assert.deepEqual(g.map((x) => x.g), [0, 1, 2, 3]);
  for (let i = 1; i < g.length; i++) assert.ok(g[i].m.zoneSpeed > g[i - 1].m.zoneSpeed, 'vitesse croissante');
});
test('freinage : même échelle, mesurée au temps passé dans les zones de freinage', () => {
  const d = drillById('freinage');
  const g = [0.5, 0.6, 0.8, 1.0].map((latK) => grade(d, { latK }));
  assert.deepEqual(g.map((x) => x.g), [0, 1, 2, 3]);
  for (let i = 1; i < g.length; i++) assert.ok(g[i].m.zoneTime < g[i - 1].m.zoneTime, 'temps décroissant');
});
test('mini-turbo : sans dérapage, rien ; frein trop long, mini-turbo simple (bronze) ; glisse tenue, renforcé ; renforcé, sans choc et à temps : or', () => {
  const d = drillById('miniturbo');
  assert.equal(grade(d, {}).g, 0, 'le pilote automatique ne dérape pas');
  const simple = grade(d, { gesture: { at: 80, B: 0.6, L: 1.5 } });
  assert.deepEqual([simple.m.turboLv, simple.g], [1, 1]);
  const lent = grade(d, { gesture: { at: 80, B: 0.5, L: 1.5 }, stall: 1.5 });
  assert.deepEqual([lent.m.turboLv, lent.m.walls, lent.g], [2, 0, 2], 'renforcé mais arrivée trop lente : argent (' + lent.m.time + ' s)');
  const or = grade(d, { gesture: { at: 80, B: 0.5, L: 1.5 } });
  assert.deepEqual([or.m.turboLv, or.m.walls, or.g], [2, 0, 3]);
  assert.ok(or.m.time <= d.limit);
  assert.match(describeMeasure(d, or.m), /^Mini-turbo renforcé, 0 choc, /);
});
test('réceptions : à plat, trois parfaites (or) ; le frein tenu en l’air relève le nez : aucune', () => {
  const d = drillById('receptions');
  const bien = grade(d, {}), mal = grade(d, { airBrake: true });
  assert.deepEqual([bien.m.perfect, bien.g], [3, 3]);
  assert.equal(mal.m.perfect, 0); assert.equal(mal.g, 0); assert.ok(mal.m.bad >= 2);
});
test('le conseil du bilan suit la mesure : coach face à la référence dans la zone, ou ce que le geste a manqué', () => {
  const ch = drillById('chicanes'), tr = build(ch), m = measureRun(tr, drive(tr, { latK: 0.5 }), ch);
  assert.match(drillAdvice(ch, m, tr, 0), /^Dans la zone mesurée, le pilote de référence va plus vite : Secteur \d+ : /);
  const mt = drillById('miniturbo');
  assert.match(drillAdvice(mt, { finished: true, turboLv: 0 }, null), /^Pas de mini-turbo/);
  assert.match(drillAdvice(mt, { finished: true, turboLv: 1 }, null), /^Mini-turbo simple/);
  assert.match(drillAdvice(mt, { finished: true, turboLv: 2, walls: 1, time: 10 }, null), /un choc/);
  assert.match(drillAdvice(mt, { finished: true, turboLv: 2, walls: 0, time: 13 }, null), /trop lente/);
  assert.match(drillAdvice(drillById('receptions'), { finished: true, perfect: 1, bad: 2 }, null), /^2 réception\(s\) ratée\(s\)/);
  assert.match(drillAdvice(ch, { finished: false }, tr), /^Finis la course/);
});
test('une course non finie n’a pas de note, ni de mesure', () => {
  for (const d of DRILLS) { assert.equal(gradeDrill(d, { finished: false }), 0); assert.equal(valueOf(d, { finished: false }), null); }
});

console.log('Profil et conseils');
test('une note s’enregistre ; les pièces récompensent chaque note atteinte une seule fois ; la meilleure mesure est gardée dans le bon sens', () => {
  const p = profile(); p.drills = {}; p.coins = 0; saveProfile();
  let r = recordDrill('freinage', 1, 6.1);
  assert.deepEqual([r.lvl, r.prev, r.coins, r.best], [1, 0, DRILL_COINS[1], 6.1]);
  r = recordDrill('freinage', 3, 5.6);
  assert.deepEqual([r.lvl, r.coins, r.best, r.newBest], [3, DRILL_COINS[2] + DRILL_COINS[3], 5.6, true]);
  r = recordDrill('freinage', 2, 5.9);
  assert.deepEqual([r.lvl, r.coins, r.best, r.newBest], [3, 0, 5.6, false], 'une note plus basse ne fait rien perdre');
  recordDrill('chicanes', 2, 118); recordDrill('chicanes', 1, 104);
  assert.equal(drillBest('chicanes'), 118);
  assert.equal(profile().coins, DRILL_COINS[1] + DRILL_COINS[2] + DRILL_COINS[3] + DRILL_COINS[1] + DRILL_COINS[2]);
  assert.deepEqual([drillLevel('freinage'), skillLevel('freinage'), skillLevel('vol')], [3, 3, 0]);
});
test('point faible : la compétence la plus basse et son exercice ; tout en or : aucun', () => {
  const p = profile(); p.drills = { chicanes: { lvl: 2, best: 118 }, freinage: { lvl: 3, best: 5.6 }, miniturbo: { lvl: 1, best: 11 }, receptions: { lvl: 0, best: null } }; saveProfile();
  assert.equal(weakestDrill().drill.id, 'receptions');
  p.drills.receptions = { lvl: 3, best: 3 }; saveProfile();
  assert.equal(weakestDrill().drill.id, 'miniturbo');
  for (const d of DRILLS) p.drills[d.id] = { lvl: 3, best: 1 };
  saveProfile();
  assert.equal(weakestDrill(), null);
  p.drills = {}; p.coins = 0; saveProfile();
});
test('conseil adapté : chaque conseil du coach qui désigne un geste mène à l’exercice de cette compétence', () => {
  for (const id of Object.keys(COACH_SKILL)) { assert.ok(COACH_TEXT[id], id); const r = drillForTip(id); assert.ok(r && r.drill.skill === COACH_SKILL[id], id); }
  assert.equal(drillForTip('late-brake').drill.id, 'freinage');
  assert.equal(drillForTip('air').drill.id, 'receptions');
  assert.equal(drillForTip('sector'), null);
  assert.equal(drillForTip('respawn'), null);
});
test('fusion cloud : par exercice, le meilleur niveau et la meilleure mesure (dans le bon sens) ; les exercices inconnus sont gardés', () => {
  const a = { chicanes: { lvl: 1, best: 104 }, freinage: { lvl: 3, best: 5.7 }, futur: { lvl: 2, best: 9 } };
  const b = { chicanes: { lvl: 2, best: 112 }, freinage: { lvl: 2, best: 5.6 }, receptions: { lvl: 3, best: 3 } };
  assert.deepEqual(mergeDrills(a, b), { chicanes: { lvl: 2, best: 112 }, freinage: { lvl: 3, best: 5.6 }, futur: { lvl: 2, best: 9 }, receptions: { lvl: 3, best: 3 } });
  assert.deepEqual(mergeDrills(null, b), mergeDrills(b, undefined));
  assert.deepEqual(mergeDrills({ x: { lvl: 9, best: 'n' } }, {}), { x: { lvl: 3, best: null } }, 'valeurs bornées');
  const merged = mergeProfile({ coins: 1, drills: a }, { coins: 1, drills: b });
  assert.deepEqual(merged.drills, mergeDrills(a, b));
  assert.equal('drills' in mergeProfile({ coins: 1 }, { coins: 2 }), false, 'pas de champ ajouté à un profil qui n’en avait pas');
});

await finish('Tous les tests de l’Académie 2 passent.');
