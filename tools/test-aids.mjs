// Aides à la conduite et accessibilité (E22) : node tools/test-aids.mjs   (npm test)
// Une course avec aides se rejoue à l'identique (les commandes EFFECTIVES sont enregistrées) et se classe dans sa catégorie « assisté ».
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Track, hashString } from '../js/track.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { InputRecorder, quantSteer } from '../js/replay.js';
import { verifyRun, replayRun } from '../js/verify.js';
import { PHYS_VER } from '../js/version.js';
import { DrivingAids, aidsActive, aidedKey, cleanAids, steerCurve, AID_IDS } from '../js/aids.js';
import { reducedMotion } from '../js/a11y.js';
import { parseVariant, applyVariant } from '../js/variants.js';

const def = (id) => BUILTIN_TRACKS.find((d) => d.id === id);
const keyOf = (id) => `b-${id}-${hashString(buildBuiltin(def(id)).encode())}`;
// Un joueur au clavier qui réagit tard : volant tout-ou-rien, avec 0,3 s de retard sur ce qu'il faudrait, jamais de frein ; il n'appuie sur
// les gaz que si l'aide ne le fait pas. Commandes brutes -> aides -> enregistrement, comme en course.
function aidedRun(track, cfg, steps = 120 * 200) {
  const sim = new Simulation(track), rec = new InputRecorder(), aids = new DrivingAids(track, cfg), eye = new Autopilot(track.path, { latLimit: 56 }), late = [];
  sim.start(); aids.reset(sim.phys); eye.reset(sim.phys);
  for (let i = 0; i < steps; i++) {
    const want = eye.control(sim.phys).steer;
    late.push(Math.abs(want) < 0.2 ? 0 : Math.sign(want));
    const raw = { steer: late.length > 36 ? late.shift() : 0, throttle: !cfg.autoGas, brake: false };
    const inp = aids.apply(raw, sim.phys);
    inp.steer = quantSteer(inp.steer);
    rec.push(inp, false);
    const ev = sim.step(inp);
    if (sim.lost) { sim.rewind(); aids.reset(sim.phys); eye.reset(sim.phys); late.length = 0; }
    if (ev && ev.type === 'finish') return { inputs: rec.encode(), time: sim.logic.time };
  }
  return null;
}

console.log('Aides à la conduite');
test('réglages : bornés, aucune aide par défaut', () => {
  assert.deepEqual(cleanAids(null), Object.fromEntries(AID_IDS.map((k) => [k, false])));
  assert.equal(aidsActive({}), false); assert.equal(aidsActive({ autoGas: 'oui' }), false); assert.equal(aidsActive({ antiSpin: true }), true);
});
test('catégorie « assisté » : ajoutée à la clé (catégorie gardée) ; refusée en saison, duel ou tournoi', () => {
  assert.equal(aidedKey('b-eclats-x1'), 'b-eclats-x1~v1.as-1');
  assert.equal(aidedKey('b-eclats-x1~v1.veh-moto'), 'b-eclats-x1~v1.as-1.veh-moto');
  assert.equal(aidedKey('b-eclats-x1~v1.as-1'), 'b-eclats-x1~v1.as-1');
  assert.equal(aidedKey('daily-2026-12-01~v1.rn-60'), 'daily-2026-12-01~v1.as-1.rn-60');
  for (const k of ['b-x-1~v1.sea-3', 'b-x-1~v1.duel-7', 'b-x-1~v1.tour-2']) assert.equal(aidedKey(k), null, k);
  assert.equal(aidedKey(null), null); assert.equal(aidedKey(''), '');
  const t = buildBuiltin(def('eclats'));
  assert.equal(applyVariant(t, parseVariant('v1.as-1')), t, 'une étiquette : le circuit ne change pas');
});
test('accélération automatique et anti-tête-à-queue agissent sur les commandes', () => {
  const t = buildBuiltin(def('eclats')), sim = new Simulation(t); sim.start();
  const a = new DrivingAids(t, { autoGas: true, antiSpin: true }); a.reset(sim.phys);
  assert.equal(a.apply({ steer: 0, throttle: false, brake: false }, sim.phys).throttle, true);
  const b = a.apply({ steer: 1, throttle: false, brake: true }, sim.phys);
  assert.equal(b.throttle, false); assert.ok(Math.abs(b.steer) < 0.5, 'freiner en virage ne fait pas déraper');
  const s = new DrivingAids(t, { smoothSteer: true }); s.reset(sim.phys);
  assert.ok(s.apply({ steer: 1 }, sim.phys).steer < 0.3, 'volant adouci');
});
test('direction et freinage assistés : le joueur en retard va plus vite avec les aides', () => {
  const alone = aidedRun(buildBuiltin(def('eclats')), {});
  const r = aidedRun(buildBuiltin(def('eclats')), { autoGas: true, steerAssist: true, brakeAssist: true, antiSpin: true });
  assert.ok(r, 'avec les aides, il finit');
  assert.ok(!alone || r.time < alone.time, `${alone && alone.time} -> ${r.time}`);
});
test('une course aidée se rejoue à l’identique (commandes effectives) et se classe dans la catégorie « assisté »', () => {
  const r = aidedRun(buildBuiltin(def('eclats')), { autoGas: true, steerAssist: true, brakeAssist: true, antiSpin: true, smoothSteer: true });
  assert.ok(r);
  const back = replayRun(buildBuiltin(def('eclats')), r.inputs);
  assert.ok(back && back.time === r.time, 'replay sans les aides : même temps au pas près');
  const ok = verifyRun({ trackKey: aidedKey(keyOf('eclats')), inputs: r.inputs, time: r.time, physVer: PHYS_VER });
  assert.equal(ok.ok, true, ok.error);
  const sea = verifyRun({ trackKey: keyOf('eclats') + '~v1.as-1.sea-2', inputs: r.inputs, time: r.time, physVer: PHYS_VER });
  assert.equal(sea.ok, false, 'pas d’assisté en saison');
});
test('circuit sans ligne de course : direction et freinage assistés sans effet (pas d’erreur)', () => {
  const t = Track.decode(buildBuiltin(def('eclats')).encode());
  assert.equal(t.path, undefined);
  const a = new DrivingAids(t, { steerAssist: true, brakeAssist: true });
  assert.equal(a.bot, null);
});
test('réponse du volant : progressive pour l’analogique, sans effet sur le tout-ou-rien', () => {
  assert.equal(steerCurve(0.5, 1), 0.5); assert.equal(steerCurve(0.5, 2), 0.25); assert.equal(steerCurve(-0.5, 2), -0.25);
  assert.equal(steerCurve(1, 2), 1); assert.equal(steerCurve(-1, 1.5), -1); assert.equal(steerCurve(0, 2), 0);
});

console.log('Accessibilité');
test('animations réduites : le réglage prime, « auto » suit le système', () => {
  assert.equal(reducedMotion('on', false), true); assert.equal(reducedMotion('off', true), false);
  assert.equal(reducedMotion('auto', true), true); assert.equal(reducedMotion('auto', false), false); assert.equal(reducedMotion(undefined, true), true);
});

await finish('Tous les tests des aides et de l’accessibilité passent.');
