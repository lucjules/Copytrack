// Paramètres de simulation additifs (E8 : adhérence et vent de tout le circuit) : node tools/test-sim-params.mjs   (npm test)
// À leur valeur par défaut, rien ne change (ni la course, ni la signature, ni le code) ; sinon la course change, la signature aussi, le serveur suit.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Track } from '../js/track.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { InputRecorder, quantSteer } from '../js/replay.js';
import { verifyRun, replayRun } from '../js/verify.js';
import { PHYS_VER } from '../js/version.js';
import { paramsOf, DEFAULT_PARAMS } from '../js/sim/params.js';
import { b64decode } from '../js/track.js';

const def = (id) => BUILTIN_TRACKS.find((d) => d.id === id);
function botRun(track) {
  const sim = new Simulation(track), rec = new InputRecorder();
  sim.start();
  const bot = new Autopilot(track.path, { latLimit: 56 * 0.8 });
  bot.reset(sim.phys);
  for (let i = 0; i < 120 * 200; i++) {
    const inp = bot.control(sim.phys);
    inp.steer = quantSteer(inp.steer);
    rec.push(inp, false);
    const ev = sim.step(inp);
    if (sim.lost) { sim.rewind(); bot.reset(sim.phys); }
    if (ev && ev.type === 'finish') return { inputs: rec.encode(), time: sim.logic.time };
  }
  return null;
}
// Une ligne droite sans volant : où finit la voiture après 4 s ?
function drift(track) {
  const sim = new Simulation(track);
  sim.start();
  for (let i = 0; i < 480; i++) sim.step({ steer: 0, throttle: true, brake: false });
  return { x: sim.phys.pos.x, z: sim.phys.pos.z, v: sim.phys.speed };
}

console.log('Paramètres de simulation');
test('par défaut : les mêmes paramètres partout, la signature et le code ne bougent pas', () => {
  for (const d of BUILTIN_TRACKS.slice(0, 12)) {
    const t = buildBuiltin(d);
    assert.equal(paramsOf(t), DEFAULT_PARAMS);
    const u = Track.decode(t.encode());
    assert.equal(u.encode(), Track.decode(u.encode()).encode(), 'relecture stable');
    assert.equal(u.grip, 100); assert.equal(u.wind, 0); assert.equal(u.windDir, 0);
  }
  const t = buildBuiltin(def('canyon')), sig = t.signature(), code = t.encode();
  t.setParams({ grip: 100, wind: 0, windDir: 0 });
  assert.equal(t.signature(), sig); assert.equal(t.encode(), code);
});
test('valeurs bornées et arrondies ; elles entrent dans la signature et passent le code au format 4', () => {
  const t = Track.decode(buildBuiltin(def('canyon')).encode()), sig = t.signature();
  t.setParams({ grip: 9999, wind: -5, windDir: 97 });
  assert.deepEqual([t.grip, t.wind, t.windDir], [150, 0, 90]);
  t.setParams({ grip: 70, wind: 40, windDir: 359 });
  assert.deepEqual([t.grip, t.wind, t.windDir], [70, 40, 0]);
  assert.notEqual(t.signature(), sig);
  const code = t.encode();
  assert.equal(JSON.parse(b64decode(code.slice(5))).v, 4);
  const back = Track.decode(code);
  assert.deepEqual([back.grip, back.wind, back.windDir], [70, 40, 0]);
  assert.equal(back.signature(), t.signature());
  assert.equal(back.clone().grip, 70, 'clone garde les paramètres');
});
test('moins d’adhérence : le circuit se court plus lentement', () => {
  const base = botRun(buildBuiltin(def('eclats')));
  const t = buildBuiltin(def('eclats')); t.setParams({ grip: 60 });
  const slow = botRun(t);
  assert.ok(slow && slow.time > base.time, `${base.time} -> ${slow && slow.time}`);
});
test('le vent pousse la voiture dans sa direction', () => {
  const t0 = buildBuiltin(def('eclats')), p0 = drift(t0);
  const east = buildBuiltin(def('eclats')); east.setParams({ wind: 100, windDir: 90 });
  const west = buildBuiltin(def('eclats')); west.setParams({ wind: 100, windDir: 270 });
  const pe = drift(east), pw = drift(west);
  assert.ok(pe.x > p0.x + 0.5, `vers l’est : x ${p0.x.toFixed(2)} -> ${pe.x.toFixed(2)}`);
  assert.ok(pw.x < p0.x - 0.5, `vers l’ouest : x ${p0.x.toFixed(2)} -> ${pw.x.toFixed(2)}`);
  const P = paramsOf(east);
  assert.ok(P.windOn && P.windX > 0 && Math.abs(P.windZ) < 1e-9);
});
test('le serveur vérifie une course sur un circuit à paramètres (code joueur), et refuse ses commandes sur le circuit sans paramètres', () => {
  const t = buildBuiltin(def('eclats')); t.setParams({ grip: 85, wind: 25, windDir: 180 });
  const r = botRun(t);
  assert.ok(r, 'le pilote automatique finit');
  const u = Track.decode(t.encode());
  const ok = verifyRun({ trackKey: u.userKey, code: u.encode(), inputs: r.inputs, time: r.time, physVer: PHYS_VER });
  assert.equal(ok.ok, true, ok.error);
  const plain = Track.decode(buildBuiltin(def('eclats')).encode());
  assert.notEqual(plain.userKey, u.userKey, 'autre circuit, autre classement');
  const back = replayRun(plain, r.inputs);
  assert.ok(!back || back.time !== r.time);
});

await finish('Tous les tests des paramètres de simulation passent.');
