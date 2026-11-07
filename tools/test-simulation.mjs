// Simulation : l'enchaînement d'un pas (horloge, physique, règles, réapparitions) est UN seul code partagé par la course en direct, les fantômes,
// la vérification serveur et les outils : node tools/test-simulation.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { Simulation, placeAtRespawn } from '../js/simulation.js';
import { GhostRunner, newGhostPose } from '../js/replay.js';
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

console.log('Fantôme : historique des poses');
test('poseAt(k) redonne la pose du pas k sans rejouer le fantôme (retour au checkpoint)', () => {
  const track = buildBuiltin(BUILTIN_TRACKS[3]);
  const a = new GhostRunner(track, { bot: true, latK: 0.8 });
  const out = newGhostPose();
  a.poseAt(1500, out);
  const kAvant = a.k;
  assert.ok(kAvant >= 1500);
  // Poses relues en arrière : le fantôme n'avance ni ne recule.
  const relu = [200, 800, 1499].map((k) => { a.poseAt(k, out); return { k, x: out.pos.x, y: out.pos.y, z: out.pos.z, px: out.prev.x }; });
  assert.equal(a.k, kAvant, 'aucun pas rejoué');
  // Référence : un fantôme neuf amené exactement à ces pas.
  const b = new GhostRunner(buildBuiltin(BUILTIN_TRACKS[3]), { bot: true, latK: 0.8 });
  for (const r of relu) {
    while (b.k < r.k) b.step();
    assert.ok(Math.abs(b.phys.pos.x - r.x) < 1e-3 && Math.abs(b.phys.pos.y - r.y) < 1e-3 && Math.abs(b.phys.pos.z - r.z) < 1e-3, 'pas ' + r.k);
    assert.ok(Math.abs(b.phys.prev.x - r.px) < 1e-3);
  }
});
test('poseAt : le fantôme arrivé est « terminé » à partir de son arrivée, pas avant', () => {
  const g = new GhostRunner(buildBuiltin(BUILTIN_TRACKS[0]), { bot: true, latK: 0.8 });
  const out = newGhostPose();
  g.poseAt(120 * 120, out);
  assert.ok(g.done, 'le pilote automatique termine le circuit');
  const fin = g.k;
  assert.equal(g.poseAt(fin + 50, out).done, true);
  assert.equal(g.poseAt(fin - 100, out).done, false, 'avant l\'arrivée il roule encore');
  assert.equal(g.poseAt(0, out).done, false);
});
test('poseAt : véhicule, sol et normale sont ceux du pas demandé', () => {
  const g = new GhostRunner(scriptTrack('v', 'start S2 S.o S3 finish'), { bot: true, latK: 0.8 });
  const out = newGhostPose();
  g.poseAt(1, out);
  assert.equal(out.vehicle, 'car');
  assert.equal(out.grounded, true);
  assert.ok(Math.abs(out.n.y - 1) < 1e-6);
  g.poseAt(120 * 40, out);
  assert.ok(['car', 'moto'].includes(out.vehicle));
});

test('après l\'arrivée, l\'horloge des obstacles et des pièces mobiles continue (le chrono, lui, reste figé)', () => {
  const sim = new Simulation(scriptTrack('s', 'start S2 finish'));
  sim.start();
  let n = 0;
  while (!sim.logic.finished && n++ < 4000) sim.step(GAS);
  assert.ok(sim.logic.finished, 'arrivée franchie');
  const steps = sim.logic.steps;
  sim.drive(GAS);
  const c1 = sim.phys.clock;
  for (let i = 0; i < 50; i++) sim.drive(GAS);
  assert.equal(sim.logic.steps, steps, 'le chrono ne bouge plus');
  assert.equal(sim.phys.clock - c1, 50, 'mais l\'horloge physique avance d\'un pas à chaque pas');
  sim.start();
  assert.equal(sim.idle, 0, 'remise à zéro au départ');
});
test('dalles brisées : brokenVer change à chaque dalle brisée et à chaque restauration (même si leur nombre est identique)', () => {
  const sim = new Simulation(scriptTrack('s', 'start S2 finish'));
  sim.start();
  const v0 = sim.phys.brokenVer, t = sim.track.tiles[1];
  sim.phys.broken.add(t); sim.phys.brokenVer++;       // (comme _glassCheck)
  sim.start();                                          // restauration au départ
  assert.ok(sim.phys.brokenVer > v0 + 1);
  assert.equal(sim.phys.broken.size, 0);
});
test('traces de pneus : décalage le long du haut de la route (négatif au plafond)', async () => {
  globalThis.document = { createElement: () => ({ getContext: () => null }) };
  const { SkidMarks } = await import('../js/skids.js');
  const THREE = await import('../js/vendor/three.module.min.js');
  const sk = new SkidMarks(new THREE.Scene());
  sk.add(0, 0, 10, 0, 1, 0, 0.3, -0.04); sk.add(0, 1, 10, 0, 1, 0, 0.3, -0.04);
  assert.ok(Math.abs(sk.pos[1] - 9.96) < 1e-5, 'trace sous le plafond : ' + sk.pos[1]);
});
test('fantôme enregistré : le véhicule suit les changements enregistrés (moto, bateau, retour voiture), les anciens records restent des voitures', async () => {
  const { ghostVehicleAt } = await import('../js/race/shared.js');
  const ch = [[0, 1], [10, 2], [25, 0]];
  assert.deepEqual([0, 9, 10, 24, 25, 99].map((f) => ghostVehicleAt(ch, f)), ['moto', 'moto', 'boat', 'boat', 'car', 'car']);
  assert.equal(ghostVehicleAt([], 50), 'car');
});

finish('Tous les tests de la simulation passent.');
