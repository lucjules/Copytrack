// Accélération et vitesse de pointe, chocs contre les murs, décrochage sur les murs à 90° (le « feeling » technique) : node tools/test-vitesse-et-murs.mjs   (npm test)
//  accélération longue et vitesse de pointe élevée, murs punitifs, décrochage sur les murs à 90°.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';

const { scriptTrack } = await import('../js/track.js');
const { CarPhysics } = await import('../js/physics.js');
const { CAR, MOTO, SIDE_MIN_SPEED, SIDE_GRACE } = await import('../js/physics/specs.js');
const { RaceLogic, placeAtStart } = await import('../js/raceLogic.js');
const { PHYS_VER } = await import('../js/version.js');
const { SURF_PHYS, DT, LEVEL_H } = await import('../js/constants.js');
const { BUILTIN_TRACKS, buildBuiltin } = await import('../js/tracks.js');
const { GhostRunner } = await import('../js/replay.js');

function straight(n = 40, extra = '') {
  const tr = scriptTrack('t', `start ${'S4 '.repeat(n)}finish ${extra}`, { l: 2 });
  const ph = new CarPhysics(tr); placeAtStart(ph, new RaceLogic(tr));
  return { tr, ph };
}
const GAS = { steer: 0, throttle: true, brake: false };

console.log('Accélération et vitesse de pointe');
test('plafond du moteur et du turbo : 290 et 340 km/h (le réglage linéaire de la 0.9.45 n\u2019en avait pas)', () => {
  assert.ok(Number.isInteger(PHYS_VER) && PHYS_VER >= 28);
  assert.ok(Math.abs(SURF_PHYS.maxSpeed * 3.6 - 290) < 0.01 && Math.abs(SURF_PHYS.boostSpeed * 3.6 - 340) < 0.01);
  assert.ok(MOTO.maxSpeed >= 70 && MOTO.maxSpeed < SURF_PHYS.maxSpeed);
});
test('courbe : 100 km/h en 2,0 à 2,4 s, 200 km/h en 5,0 à 6,0 s, 250 km/h en 8,0 à 9,6 s ; jamais plus de 290 km/h sans turbo, même après une minute', () => {
  const { ph } = straight(90);
  const t = {};
  let top = 0;
  for (let k = 0; k < 60 / DT; k++) {
    ph.clock = k; ph.step(GAS);
    top = Math.max(top, ph.speed);
    for (const [name, v] of [['100', 27.8], ['200', 55.6], ['250', 69.4]]) if (!(name in t) && ph.speed >= v) t[name] = k * DT;
  }
  assert.ok(t['100'] > 2.0 && t['100'] < 2.4, '100 km/h : ' + t['100']);
  assert.ok(t['200'] > 5.0 && t['200'] < 6.0, '200 km/h : ' + t['200']);
  assert.ok(t['250'] > 8.0 && t['250'] < 9.6, '250 km/h : ' + t['250']);
  assert.ok(top * 3.6 <= 290.5 && top * 3.6 > 270, 'vitesse maxi après 60 s : ' + (top * 3.6).toFixed(1) + ' km/h');
});
test('sous turbo, la vitesse reste sous 340 km/h', () => {
  const { ph } = straight(90);
  let top = 0;
  for (let k = 0; k < 40 / DT; k++) {
    ph.clock = k;
    if (k % 300 === 0) { ph.boost = 1.2; ph.boostF = 1; }
    ph.step(GAS);
    top = Math.max(top, ph.speed);
  }
  assert.ok(top * 3.6 < 340, 'sous turbo : ' + (top * 3.6).toFixed(1) + ' km/h');
});
test('la poussée décroît avec la vitesse : ≈ 14 m/s² à l’arrêt, ≈ 7 m/s² à 50 m/s ; à vide, a = −(0,8 + 0,05·v)', () => {
  const { tr, ph } = straight(60);
  const acc = (v0, gas) => { ph.vel.z = -v0; ph.fwdSpeed = v0; ph.graceT = 0; const v1 = ph.speed; ph.clock = 0; tr.time = 0; ph.step(gas ? GAS : { steer: 0, throttle: false, brake: false }); return (ph.speed - v1) / DT; };
  assert.ok(Math.abs(acc(0.5, true) - 14) < 1.5, 'à l’arrêt : ' + acc(0.5, true));
  const a50 = acc(50, true); assert.ok(a50 > 6 && a50 < 8.5, 'à 50 m/s : ' + a50);
  const c30 = acc(30, false); assert.ok(Math.abs(c30 + (0.8 + 0.05 * 30)) < 0.6, 'à vide, 30 m/s : ' + c30);
});
test('une voiture lancée à 40 m/s en sortie de virage garde une avance de plus de 50 m sur une voiture lancée à 25 m/s après 8 s (le gain se paie en distance)', () => {
  const run = (v0) => { const { ph } = straight(60); ph.vel.z = -v0; ph.fwdSpeed = v0; ph.graceT = 0; for (let k = 0; k < 8 / DT; k++) { ph.clock = k; ph.step(GAS); } return { d: -ph.pos.z, v: ph.speed }; };
  const fast = run(40), slow = run(25);
  assert.ok(fast.d - slow.d > 50 && fast.v - slow.v > 2, `écart après 8 s : ${(fast.d - slow.d).toFixed(0)} m, ${(fast.v - slow.v).toFixed(1)} m/s`);
});

console.log('Murs');
function hitWall(v0, steer = 0.5) {
  // Voiture lancée de biais contre la bordure : on mesure la vitesse juste avant et 0,5 s après le premier choc.
  const { ph } = straight(20);
  ph.vel.z = -v0; ph.fwdSpeed = v0; ph.graceT = 0;
  let before = v0, hit = null;
  for (let k = 0; k < 6 / DT; k++) {
    ph.clock = k; ph.step({ steer, throttle: false, brake: false });
    if (hit === null && ph.ev.wall > 3) { hit = { k, impact: ph.ev.wall, before }; }
    if (hit && k === hit.k + 60) return { ...hit, after: ph.speed, stun: ph.stunT };
    before = ph.speed;
  }
  return hit;
}
test('un choc franc contre un mur fait perdre au moins 30 % de la vitesse immédiatement, et bien plus à grande vitesse', () => {
  const a = hitWall(30, 0.6), b = hitWall(55, 0.6);
  assert.ok(a && b, 'le choc a lieu');
  assert.ok(a.after < 0.7 * a.before, `30 m/s : ${a.before.toFixed(1)} → ${a.after.toFixed(1)}`);
  assert.ok(b.impact > a.impact, 'plus vite, plus fort');
  assert.ok(b.after < 0.55 * b.before, `55 m/s : ${b.before.toFixed(1)} → ${b.after.toFixed(1)}`);
});
test('le choc rebondit et fait pivoter la voiture, qui encaisse (moteur et adhérence réduits un instant)', () => {
  const { ph } = straight(20);
  ph.vel.z = -40; ph.fwdSpeed = 40; ph.graceT = 0;
  let spun = 0, stunned = false, hits = 0;
  for (let k = 0; k < 4 / DT; k++) {
    ph.clock = k; ph.step({ steer: 0.6, throttle: true, brake: false });
    if (ph.ev.wall > 3) { hits++; spun = Math.max(spun, Math.abs(ph.omega)); stunned = stunned || ph.stunT > 0.2; }
  }
  assert.ok(hits >= 1 && spun > 0.8 && stunned, `chocs ${hits}, rotation ${spun.toFixed(2)} rad/s, encaissement ${stunned}`);
});
test('racler un mur freine en continu même sans vrai choc', () => {
  const { ph } = straight(20);
  ph.vel.z = -40; ph.fwdSpeed = 40; ph.graceT = 0;
  // la voiture est collée contre la bordure : on la maintient en contact en braquant légèrement
  let k = 0, contact = 0;
  for (; k < 3 / DT; k++) {
    ph.clock = k; ph.step({ steer: 0.12, throttle: false, brake: false });
    if (Math.abs(ph.pos.x - 12) > 4.5) contact++;
  }
  assert.ok(contact > 0, 'la voiture atteint la bordure');
  assert.ok(ph.speed < 25, 'vitesse après 3 s de glissade : ' + ph.speed.toFixed(1));
});
test('paramètres : choc fortement punitif', () => {
  assert.ok(CAR.wallLoss * 10 >= 0.4 && CAR.wallLossMax >= 0.6 && CAR.wallScrape >= 1.5 && CAR.wallE > 0);
});

console.log('Décrochage sur les murs à 90°');
function wallRun(v0, throttle, secs = 8) {
  const tr = scriptTrack('w', 'start S [tr01s] S6< finish', { l: 4 });
  const ph = new CarPhysics(tr); placeAtStart(ph, new RaceLogic(tr));
  ph.vel.z = -v0; ph.fwdSpeed = v0; ph.graceT = 0;
  let onWall = 0, dropped = false, dropSpeed = 0, tilted = 0;
  for (let k = 0; k < secs / DT; k++) {
    ph.clock = k; ph.step({ steer: 0, throttle, brake: false });
    if (ph.rib && Math.abs(ph.n.y) < 0.5) { onWall++; tilted = Math.max(tilted, Math.abs(ph.rib.vs)); }
    if (ph.ev.wallOff) { dropped = true; dropSpeed = ph.speed; }
  }
  return { onWall, dropped, dropSpeed, tilted, ph };
}
test('vitesse minimale sur un mur : 30 m/s (108 km/h) ; la constante et le délai de grâce existent', () => {
  assert.equal(SIDE_MIN_SPEED, 30); assert.ok(SIDE_GRACE > 0 && SIDE_GRACE <= 0.5);
});
test('assez d’élan (45 m/s) : la voiture tient sur le mur toute la longueur', () => {
  const r = wallRun(45, true);
  assert.equal(r.dropped, false); assert.ok(r.onWall > 120, 'longtemps sur le mur : ' + r.onWall);
});
test('pas assez d’élan (24 m/s) : elle décroche de la paroi et tombe, avec la vitesse qu’elle avait', () => {
  const r = wallRun(24, false);
  assert.equal(r.dropped, true, 'décrochage'); assert.ok(r.dropSpeed > 3, 'vitesse conservée : ' + r.dropSpeed.toFixed(1));
  assert.ok(!r.ph.rib, 'plus sur le ruban'); assert.ok(r.ph.pos.y < 4 * LEVEL_H + 0.4 - 3, 'elle est tombée : y = ' + r.ph.pos.y.toFixed(1));
});
test('juste sous le seuil (28 m/s, sans gaz) la voiture finit aussi par décrocher ; juste au-dessus (34 m/s, gaz) elle tient', () => {
  assert.equal(wallRun(26, false).dropped, true);
  assert.equal(wallRun(36, true).dropped, false);
});
test('le décrochage n’a lieu que sur un plan penché de plus de 45° : la transition à faible vitesse ne décroche pas avant d’être montée', () => {
  const tr = scriptTrack('w', 'start S [tr01s] S2< finish', { l: 4 });
  const ph = new CarPhysics(tr); placeAtStart(ph, new RaceLogic(tr));
  ph.vel.z = -20; ph.fwdSpeed = 20; ph.graceT = 0;
  let early = null;
  for (let k = 0; k < 4 / DT; k++) {
    ph.clock = k; ph.step({ steer: 0, throttle: false, brake: false });
    if (ph.ev.wallOff && early === null) early = Math.abs(ph.n.y);
  }
  assert.ok(early === null || early < 0.72, 'décrochage seulement penché : |ny| = ' + early);
});

console.log('Circuits intégrés');
test('le fantôme d’or (pilote automatique) finit les 66 circuits avec la nouvelle physique', () => {
  const bad = [];
  BUILTIN_TRACKS.forEach((d, i) => {
    const g = new GhostRunner(buildBuiltin(d), { bot: true, latK: 0.8 });
    let k = 0; while (!g.done && k < 120 * 300) { g.step(); k++; }
    if (!g.logic.finished) bad.push(i + 1);
  });
  assert.deepEqual(bad, []);
});

await finish('Tous les tests de la vitesse et des murs passent.');
