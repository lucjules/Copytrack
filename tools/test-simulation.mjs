// Simulation : l'enchaînement d'un pas (horloge, physique, règles, réapparitions) est UN seul code partagé par la course en direct, les fantômes,
// la vérification serveur et les outils : node tools/test-simulation.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { Simulation, placeAtRespawn } from '../js/simulation.js';
import { GhostRunner } from '../js/replay.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Autopilot } from '../js/autopilot.js';
import { scriptTrack } from '../js/track.js';
import { DT, OFF_TRACK_RESPAWN_S } from '../js/constants.js';

const GAS = { steer: 0, throttle: true, brake: false, drift: false };

console.log('Simulation');
test('le pilote automatique termine un circuit à l\'identique par Simulation et par GhostRunner', () => {
  const def = BUILTIN_TRACKS[0];
  const t1 = buildBuiltin(def), t2 = buildBuiltin(def);
  const sim = new Simulation(t1);
  sim.start();
  const bot = new Autopilot(t1.path, { latLimit: 56 * 0.8 });
  bot.reset(sim.phys);
  let fin = null;
  for (let i = 0; i < 120 * 120 && !fin; i++) {
    const ev = sim.step(bot.control(sim.phys));
    if (sim.lost) sim.rewind();
    if (ev && ev.type === 'finish') fin = sim.logic.time;
  }
  const g = new GhostRunner(t2, { bot: true, latK: 0.8 });
  while (!g.done && g.k < 120 * 120) g.step();
  assert.ok(fin > 5 && g.logic.finished, 'les deux terminent le circuit');
  assert.equal(g.logic.time, fin, 'même temps au pas près');
});

test('drive puis score = step : l\'horloge de la physique est le chrono de la course', () => {
  const tr = scriptTrack('s', 'start S3 finish');
  const a = new Simulation(tr), b = new Simulation(scriptTrack('s', 'start S3 finish'));
  a.start(); b.start();
  for (let i = 0; i < 300; i++) { a.drive(GAS); a.score(); b.step(GAS); }
  assert.equal(a.phys.clock, 299);
  assert.equal(a.logic.steps, 300);
  assert.equal(a.phys.time, 299 * DT, 'CarPhysics.time = pas de course × DT');
  assert.equal(a.phys.pos.z, b.phys.pos.z);
  assert.equal(a.phys.vel.z, b.phys.vel.z);
});

test('hors piste : la réapparition est demandée après OFF_TRACK_RESPAWN_S, pas avant', () => {
  const sim = new Simulation(scriptTrack('s', 'start S6 finish'));
  sim.start();
  sim.drive(GAS); sim.score();
  // On pose la voiture sur le terrain, à côté de la route.
  const p = sim.phys;
  p.pos.x += 60; p.prev.x = p.pos.x; p.vel.x = p.vel.y = p.vel.z = 0;
  let steps = 0;
  while (!sim.lost && steps < 400) { sim.drive({ steer: 0, throttle: false, brake: true, drift: false }); sim.score(); steps++; }
  assert.equal(sim.lost, 'offTrack');
  assert.ok(steps * DT >= OFF_TRACK_RESPAWN_S - 2 * DT && steps * DT < OFF_TRACK_RESPAWN_S + 0.1, `après ${(steps * DT).toFixed(3)} s`);
});

test('rewind : retour au point de réapparition, avec son véhicule et sa gravité, et le suivi du hors-piste remis à zéro', () => {
  const sim = new Simulation(scriptTrack('s', 'start S4 finish'));
  sim.start();
  for (let i = 0; i < 200; i++) sim.step(GAS);
  sim.groundT = 0.4;
  sim.logic.respawn = { ...sim.logic.respawn, vehicle: 'moto', grav: 0.5, gs: 1 };
  const r = sim.rewind();
  assert.equal(sim.phys.vehicle, 'moto');
  assert.equal(sim.phys.gravMul, 0.5);
  assert.equal(sim.phys.pos.x, r.x);
  assert.equal(sim.groundT, 0);
  assert.equal(sim.lost, '');
});

test('placeAtRespawn : véhicule et gravité par défaut', () => {
  const sim = new Simulation(scriptTrack('s', 'start S2 finish'));
  sim.start();
  placeAtRespawn(sim.phys, { x: 5, y: 1, z: 5, yaw: 0 });
  assert.equal(sim.phys.vehicle, 'car');
  assert.equal(sim.phys.gravMul, 1);
});

test('start(spawn) : le point imposé sert aussi de point de retour', () => {
  const tr = scriptTrack('s', 'start S2 finish');
  const sim = new Simulation(tr, { partial: true });
  const sp = { x: 40, y: 0.4, z: 40, yaw: 0, gs: 1 };
  sim.start(sp);
  assert.equal(sim.logic.respawn.x, 40);
  assert.equal(sim.logic.respawn.vehicle, 'car');
});

finish('Tous les tests de la simulation passent.');
