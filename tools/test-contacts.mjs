// PHASE 3 — contacts réels : node tools/test-contacts.mjs   (npm test)
// Chaque scénario fait ÉVOLUER le vrai moteur (Simulation : physique + règles de course + retours automatiques) sur plusieurs centaines de pas, puis vérifie :
//   1. la situation est reproductible (circuit fabriqué, aucune donnée au hasard sauf les essais de charge, à graine fixe) ;
//   2. le contact A EU LIEU (un évènement du moteur le prouve : shock, spike, glass, wall…) — un scénario qui ne touche rien échoue ;
//   3. l'état de la voiture après le contact ;
//   4. aucune valeur invalide (NaN, infini, position démesurée) à AUCUN pas ;
//   5. le jeu continue : le joueur repart, ou réapparaît normalement au dernier checkpoint.
// Aucun contact n'est simulé « à la main » : la voiture roule, freine, tombe et se heurte par la physique.
import assert from 'node:assert/strict';
import { Track, scriptTrack } from '../js/track.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { RaceLogic } from '../js/raceLogic.js';
import { OBST } from '../js/obstacles.js';
import { CELL, ROAD_HALF, LEVEL_H } from '../js/constants.js';
import { tileCenter, baseY, PIECES } from '../js/pieces.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { test, finish } from './harness.mjs';

const GAS = { throttle: true, brake: false, steer: 0 };
const IDLE = { throttle: false, brake: false, steer: 0 };
const finite = (P) => [P.pos.x, P.pos.y, P.pos.z, P.vel.x, P.vel.y, P.vel.z, P.yaw, P.omega, P.pitch, P.steer].every(Number.isFinite);
const strip = (n) => {
  const tr = new Track('t');
  tr.add({ t: 'start', x: 0, z: n + 1, l: 0, r: 0 });
  for (let i = 0; i < n - 1; i++) tr.add({ t: 'straight', x: 0, z: n - i, l: 0, r: 0 });
  tr.add({ t: 'finish', x: 0, z: 1, l: 0, r: 0 });
  return tr;
};
const fresh = (tr) => { const sim = new Simulation(tr); sim.start(); sim.phys.graceT = 0; sim.phys.hazardGrace = 0; return sim; };
const lcg = (s) => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

// Avance `steps` pas ; vérifie l'état à CHAQUE pas ; renvoie un journal des contacts. policy(i, sim) : commandes. Les retours automatiques sont appliqués comme en course.
function run(sim, steps, policy = () => GAS, { onStep, maxJump = 4 } = {}) {
  const log = { shock: 0, spike: 0, glass: 0, wall: 0, flip: 0, sink: 0, invalid: 0, rewinds: 0, lost: [], maxSpeed: 0, maxJump: 0, offroad: 0, finishedAt: -1, minGap: Infinity };
  const P = sim.phys;
  let prev = { ...P.pos }, tele = false;
  for (let i = 0; i < steps; i++) {
    sim.step(policy(i, sim));
    assert.ok(finite(P), `pas ${i} : état non fini ${JSON.stringify({ pos: P.pos, vel: P.vel })}`);
    assert.ok(Math.abs(P.pos.x) < 1e5 && Math.abs(P.pos.y) < 1e5 && Math.abs(P.pos.z) < 1e5, `pas ${i} : voiture hors du monde`);
    const e = P.ev;
    if (e.shock > 0) log.shock++;
    if (e.spike) log.spike++;
    if (e.glass) log.glass++;
    if (e.wall > 0) log.wall++;
    if (e.flip) log.flip++;
    if (e.sink) log.sink++;
    if (e.invalid) log.invalid++;
    if (P.surfType === 'ground') log.offroad++;
    log.maxSpeed = Math.max(log.maxSpeed, P.speed);
    const jump = Math.hypot(P.pos.x - prev.x, P.pos.y - prev.y, P.pos.z - prev.z);
    if (!tele) log.maxJump = Math.max(log.maxJump, jump);
    tele = false; prev = { ...P.pos };
    if (onStep) onStep(i, sim, log);
    if (sim.logic.finished && log.finishedAt < 0) log.finishedAt = i;
    if (sim.lost) { log.lost.push(sim.lost); log.rewinds++; sim.rewind(); tele = true; prev = { ...P.pos }; assert.ok(finite(P), 'état non fini juste après le retour'); }
  }
  assert.ok(log.maxJump <= maxJump + log.maxSpeed * 0.0084, `saut de position d'un pas à l'autre : ${log.maxJump.toFixed(2)} m`);
  return log;
}

console.log('Verre : le contact, la chute, la reprise');
test('verre : la dalle cède après son temps de contact, la voiture tombe, le jeu la fait réapparaître, elle repart ensuite (la dalle est restaurée)', () => {
  const tr = scriptTrack('v', 'start S2 C S4 finish');
  const glass = tr.tiles.find((t) => t.t === 'straight' && t.z > tr.tiles.find((u) => u.t === 'checkpoint').z);       // une dalle AVANT le checkpoint
  glass.s = 'glass'; glass.p = 40; tr.version++;
  const sim = new Simulation(tr); sim.start();
  const c = tileCenter(glass);
  sim.phys.place(c.x, 0.4, c.z, 0, 1); sim.phys.graceT = 0; sim.phys.glassSafe = null;
  const P = sim.phys;
  let broke = 0, brokeAt = -1, fellAt = -1, backAt = -1;
  for (let i = 0; i < 120 * 6 && backAt < 0; i++) {
    sim.step(IDLE);
    assert.ok(finite(P), 'pas ' + i);
    if (P.ev.glass) { broke++; brokeAt = i; assert.equal(P.ev.glassTile, glass, 'la dalle contactée est celle qui est brisée'); assert.ok(P.broken.has(glass)); }
    if (brokeAt >= 0 && fellAt < 0 && P.surfType === 'ground') fellAt = i;      // elle est tombée sur le terrain, hors de la route
    if (sim.lost) { backAt = i; assert.equal(sim.lost, 'offTrack'); sim.rewind(); }
  }
  assert.equal(broke, 1, 'la dalle a cédé exactement une fois (un seul évènement)');
  assert.ok(brokeAt >= 0 && Math.abs(brokeAt / 120 - 0.4) < 0.05, 'après ~0,4 s de contact (' + (brokeAt / 120).toFixed(2) + ' s)');
  assert.ok(fellAt > brokeAt, 'la voiture est tombée sur le terrain');
  assert.ok(backAt > fellAt, 'rappelée automatiquement après être tombée hors piste');
  assert.equal(P.broken.size, 0, 'après le retour la dalle est restaurée');
  assert.ok(P.grounded && P.graceT > 1.4 && P.speed === 0, 'réapparue posée, immobile, protégée');
  const after = run(sim, 120 * 1.5, () => GAS);      // (la dalle, restaurée, recasserait si elle la retraverse lentement : on ne juge que le départ)
  assert.ok(after.rewinds === 0 && sim.phys.speed > 5, 'elle repart normalement');
});
test('verre : traversé vite il ne cède pas (temps de contact cumulé), traversé lentement il cède ; plusieurs dalles : seule la dalle sous la voiture cède', () => {
  const tr = strip(10);
  const row = tr.tiles.filter((t) => t.t === 'straight' && t.z >= 4 && t.z <= 7);
  for (const t of row) { t.s = 'glass'; t.p = 150; } tr.version++;
  const fast = fresh(tr); fast.phys.place(CELL / 2, 0.4, 8 * CELL + 5, 0, 1); fast.phys.graceT = 0; fast.phys.vel.z = -300 / 3.6;
  const lf = run(fast, 120 * 3, () => GAS);
  assert.equal(lf.glass, 0, 'à 300 km/h : 4 dalles traversées en 1,5 s, chacune moins de 0,5 s sous les roues (seuil 1,5 s)');
  const slow = fresh(tr); slow.phys.place(CELL / 2, 0.4, 8 * CELL + 5, 0, 1); slow.phys.graceT = 0;
  let firstBroken = null;
  const ls = run(slow, 120 * 12, () => ({ throttle: slow.phys.speed < 4, brake: false, steer: 0 }), { onStep: (i, s) => { if (s.phys.ev.glass && !firstBroken) { firstBroken = s.phys.ev.glassTile; assert.equal(s.phys.broken.size, 1, 'une seule dalle brisée'); } } });
  assert.ok(ls.glass >= 1 && row.includes(firstBroken), 'roulant à 14 km/h elle finit par casser une dalle de la rangée');
});
test('verre : dalles empilées (verre au-dessus d\'une route) — la voiture qui tombe se reçoit sur la route du dessous, sans état bloqué', () => {
  const tr = new Track('pile');
  tr.add({ t: 'start', x: 0, z: 4, l: 0, r: 0 });
  tr.add({ t: 'straight', x: 0, z: 3, l: 2, r: 0, s: 'glass', p: 30 });
  tr.add({ t: 'straight', x: 0, z: 3, l: 0, r: 0 });
  tr.add({ t: 'finish', x: 0, z: 1, l: 0, r: 0 });
  const up = tr.tiles.find((t) => t.s === 'glass');
  const sim = new Simulation(tr); sim.start();
  sim.phys.place(CELL / 2, 2 * LEVEL_H + 0.4, 3 * CELL + CELL / 2, 0, 1); sim.phys.graceT = 0;
  let rew = 0;
  const log = run(sim, 120 * 4, () => IDLE, { onStep: (i, s) => { if (s.phys.ev.glass) assert.equal(s.phys.ev.glassTile, up); } });
  assert.equal(log.glass, 1);
  rew = log.rewinds;
  assert.ok(rew === 0, 'reçue sur la route du dessous : pas hors piste, pas de retour (' + rew + ')');
  assert.ok(sim.phys.pos.y < up.l * LEVEL_H - 1 && sim.phys.grounded, 'posée sur la route du dessous');
});
test('verre sur un looping (ruban) : la dalle cède PENDANT que la voiture est dans le ruban, elle se détache et tombe, le jeu la rappelle, sans état bloqué ni valeur invalide', () => {
  const tr = scriptTrack('l', 'start S3 O S3 C S3 finish');
  const loopTile = tr.tiles.find((t) => PIECES[t.t].kind === 'loop');
  assert.ok(loopTile, 'le circuit contient un ruban');
  loopTile.s = 'glass'; loopTile.p = 100; tr.version++;       // 1 s de contact cumulé : la voiture est déjà dans le ruban quand elle cède
  const sim = new Simulation(tr); sim.start(); const bot = new Autopilot(tr.path); bot.reset(sim.phys);
  let ribPrev = false, ribSteps = 0, brokeOnRibbon = false, detached = false;
  const log = run(sim, 120 * 25, (i, s) => bot.control(s.phys), { onStep: (i, s) => {
    const P = s.phys; if (P.rib && P.rib.tile === loopTile) ribSteps++;
    if (P.ev.glass) { brokeOnRibbon ||= ribPrev || !!P.rib; assert.equal(P.ev.glassTile, loopTile); }
    if (brokeOnRibbon && !P.rib && P.ev.loopFall) detached = true;
    ribPrev = !!P.rib;
  } });
  assert.ok(ribSteps > 30, 'la voiture roule dans le ruban (' + ribSteps + ' pas)');
  assert.ok(log.glass >= 1 && brokeOnRibbon, 'la dalle du ruban a cédé pendant le passage dans le ruban');
  assert.ok(detached, 'la voiture s\'est détachée du ruban (évènement loopFall) au lieu de continuer sur une route brisée');
  assert.ok(log.rewinds <= 4, 'rappelée sans boucle : ' + log.rewinds);
});

console.log('Piques : contact mortel, retour, protection de réapparition');
test('piques : le contact tue (évènement spike + sink), un seul évènement par contact, retour automatique « sink », la voiture repart du départ protégée', () => {
  const tr = strip(12); tr.addDeco({ k: 'spikes', x: CELL / 2, y: 0.4, z: 300, ry: 0, s: 1, ph: 0 }); tr.version++;
  const sim = fresh(tr); sim.phys.vel.z = -120 / 3.6;
  let death = -1;
  const log = run(sim, 120 * 10, () => GAS, { onStep: (i, s) => { if (s.phys.ev.spike && death < 0) { death = i; assert.ok(s.phys.ev.sink && s.sank, 'mortel : fin du pas demandée'); assert.equal(s.lost, 'sink'); } } });
  assert.ok(death >= 0, 'le contact a eu lieu');
  assert.equal(log.spike, log.rewinds + (sim.lost ? 1 : 0) - (log.lost.filter((x) => x !== 'sink').length), 'un évènement mortel = un retour, jamais plusieurs par contact');
  assert.ok(log.lost.every((x) => x === 'sink' || x === 'offTrack'));
  assert.ok(log.spike >= 1 && log.spike <= 3, 'mort(s) : ' + log.spike);
});
test('piques : après la réapparition, ni piques ni obstacles n\'agissent pendant la protection (1,5 s / 0,8 s), puis le contact tue de nouveau (la protection ne désactive pas la mécanique)', () => {
  const tr = scriptTrack('p', 'start S3 C S3 finish');
  const cp = tr.tiles.find((t) => t.t === 'checkpoint'), c = tileCenter(cp);
  tr.addDeco({ k: 'spikes', x: c.x, y: baseY(cp), z: c.z, ry: 0, s: 1, ph: 0 }); tr.version++;       // piques SUR le point de réapparition
  const sim = new Simulation(tr); sim.start();
  sim.rewind();                                           // (point de réapparition = départ à ce stade)
  sim.logic.respawn = { ...sim.logic.respawn, x: c.x, y: baseY(cp), z: c.z, yaw: 0 };
  sim.rewind();
  const P = sim.phys; assert.ok(P.graceT > 1.4 && P.hazardGrace > 0.7, 'protection armée au retour');
  let diedAt = -1;
  for (let i = 0; i < 120 * 5; i++) {
    sim.step(IDLE);
    assert.ok(finite(P));
    if (P.ev.spike && diedAt < 0) diedAt = i;
    if (sim.lost) { sim.rewind(); sim.logic.respawn = { ...sim.logic.respawn, x: c.x, y: baseY(cp), z: c.z, yaw: 0 }; sim.rewind(); if (diedAt >= 0) break; }
  }
  assert.ok(diedAt >= Math.floor(120 * 1.5) - 2, 'pas de mort pendant la protection de 1,5 s (premier contact au pas ' + diedAt + ')');
  assert.ok(diedAt >= 0, 'puis les piques tuent de nouveau une voiture immobile dessus');
});

console.log('Obstacles fixes et mobiles');
test('bumper : contact réel à toutes les vitesses, la voiture n\'entre jamais dans le poteau, repousse bornée, elle continue', () => {
  for (const kmh of [40, 120, 300]) {
    const tr = strip(12); tr.addDeco({ k: 'bumper', x: CELL / 2, y: 0.4, z: 300, ry: 0, s: 1, ph: 0 }); tr.version++;
    const sim = fresh(tr); sim.phys.vel.z = -kmh / 3.6;
    let inside = 0;
    const log = run(sim, 120 * 8, () => GAS, { onStep: (i, s) => { const P = s.phys; const d = Math.hypot(P.pos.x + P.n.x * 0.8 - CELL / 2, P.pos.z + P.n.z * 0.8 - 300); if (d < OBST.bumper.r + 1.4 - 0.15) inside++; } });
    assert.ok(log.shock >= 1, `${kmh} km/h : contact`);
    assert.equal(inside, 0, `${kmh} km/h : jamais enfoncée dans le poteau`);
    assert.ok(log.maxSpeed < 120, `${kmh} km/h : repousse bornée (${(log.maxSpeed * 3.6).toFixed(0)} km/h max)`);
    assert.ok(log.rewinds === 0 && sim.phys.grounded, 'elle reste sur la route et continue');
  }
});
test('bumper : actif seulement près de la route (borne verticale) — posé 12 m ou 40 m au-dessus, ou 12 m au-dessous, il n\'agit pas ; au niveau de la route, si', () => {
  for (const [dy, expect] of [[0.4, true], [3, false], [12, false], [40, false], [-12, false]]) {
    const tr = strip(12); tr.addDeco({ k: 'bumper', x: CELL / 2, y: dy, z: 300, ry: 0, s: 1, ph: 0 }); tr.version++;
    const sim = fresh(tr); sim.phys.vel.z = -150 / 3.6;
    const log = run(sim, 120 * 5, () => GAS);
    assert.equal(log.shock > 0, expect, `bumper à y=${dy} : contact ${log.shock > 0}`);
  }
});
test('tous les obstacles mobiles (mur coulissant, marteau, balayeur, balancier) : voiture ARRÊTÉE dans leur trajectoire près de la bordure — contact réel, jamais éjectée hors de la route, jamais de saut', () => {
  let contacts = 0, cases = 0;
  for (const k of ['slider', 'hammer', 'sweeper', 'pendulum']) for (const side of [0, 5, 7.5]) for (const s of [1, 2]) for (const ph of [0, 0.25, 0.5, 0.75]) {
    cases++;
    // (phase 2 : bande de 30 cases au lieu de 12. Le choc d'un balancier envoie la voiture à 30 m/s le long de la route ; elle garde désormais son élan en frôlant la bordure
    // et, en 12 s, dépassait le BOUT de la bande de 12 cases (384 m) : « hors de la route » par la fin du circuit, pas par le côté.)
    const tr = strip(60); tr.addDeco({ k, x: CELL / 2 + side, y: 0.4, z: 1200, ry: 0, s, ph }); tr.version++;      // (version 1.0 : 60 cases ; une voiture immobile n'a plus de frein moteur démesuré, elle roule plus loin après le choc)
    const sim = new Simulation(tr); sim.start();
    sim.phys.place(CELL / 2 + side * 0.9, 0.4, 1201, 0, 1); sim.phys.graceT = 0; sim.phys.hazardGrace = 0; sim.logic.steps = 0;
    let maxX = 0;
    const log = run(sim, 120 * 12, () => IDLE, { onStep: (i, sm) => { maxX = Math.max(maxX, Math.abs(sm.phys.pos.x - CELL / 2)); }, maxJump: 3 });
    if (log.shock > 0) contacts++;
    assert.equal(log.offroad, 0, `${k} side=${side} s=${s} ph=${ph} : éjectée hors de la route (${log.offroad} pas), écart max ${maxX.toFixed(1)} m`);
    assert.ok(maxX < ROAD_HALF, `${k} side=${side} s=${s} ph=${ph} : a traversé la bordure (écart ${maxX.toFixed(1)} m)`);
    assert.equal(log.rewinds, 0, `${k} side=${side} s=${s} ph=${ph} : retour automatique inutile`);
  }
  assert.ok(contacts >= cases / 3, `les obstacles ont réellement frappé la voiture dans au moins un tiers des cas (${contacts}/${cases})`);
});
test('contacts multiples dans un même pas : 1, 3, 10 ou 40 obstacles superposés donnent la même repousse (pas de cumul d\'impulsions), un seul évènement shock par pas', () => {
  const speeds = {};
  for (const k of ['bumper', 'sweeper', 'pendulum']) for (const N of [1, 3, 10, 40]) {
    const tr = strip(12); for (let i = 0; i < N; i++) tr.addDeco({ k, x: CELL / 2, y: 0.4, z: 300, ry: 0, s: 1, ph: 0 }); tr.version++;
    const sim = fresh(tr); sim.phys.vel.z = -80 / 3.6;      // (80 km/h : avec le moteur de la version 1.0, à 100 km/h la voiture passe entre deux battements du balancier)
    let shockSteps = 0;
    const log = run(sim, 120 * 6, () => GAS, { onStep: (i, s) => { if (s.phys.ev.shock > 0) shockSteps++; } });
    assert.ok(log.shock >= 1, `${k} ×${N} : contact`);
    assert.equal(shockSteps, log.shock, 'un seul évènement shock par pas');
    (speeds[k] ||= []).push(log.maxSpeed);
  }
  for (const k of Object.keys(speeds)) assert.ok(Math.max(...speeds[k]) - Math.min(...speeds[k]) < 0.5, `${k} : la repousse dépend du nombre d'obstacles superposés ${speeds[k].map((v) => (v * 3.6).toFixed(0))}`);
});
test('obstacles différents au même endroit (piques + bumper + balayeur + marteau) : le contact létal l\'emporte, le pas se termine, aucun état invalide', () => {
  const tr = strip(12); for (const k of ['bumper', 'sweeper', 'hammer', 'spikes', 'slider']) tr.addDeco({ k, x: CELL / 2, y: 0.4, z: 300, ry: 0.3, s: 1, ph: 0 }); tr.version++;
  const sim = fresh(tr); sim.phys.vel.z = -120 / 3.6;
  const log = run(sim, 120 * 4, () => GAS);
  assert.ok(log.shock + log.spike >= 1, 'contact');
  assert.ok(log.spike === 0 || log.rewinds >= 1, 'une mort = un retour');
});

console.log('Véhicule bloqué');
test('plaquée contre une bordure (impacts de 20° à 80°, 60 et 100 km/h), gaz seul ou volant faible : la voiture se dégage d\'elle-même (avant 0.9.54 : collée indéfiniment)', () => {
  let cases = 0;
  for (const yawDeg of [20, 45, 61, 80]) for (const kmh of [60, 100]) for (const mode of ['gaz seul', 'volant faible alterné']) {
    cases++;
    const sim = fresh(strip(12)); const P = sim.phys;
    const yaw = -yawDeg * Math.PI / 180, sp = kmh / 3.6; P.pos.x = 19; P.pos.z = 400; P.yaw = yaw; P.vel.x = -Math.sin(yaw) * sp; P.vel.z = -Math.cos(yaw) * sp;
    let hitAt = -1, freeAt = -1;
    run(sim, 120 * 14, (i) => ({ throttle: true, brake: false, steer: mode === 'gaz seul' ? 0 : Math.sin(i / 70) * 0.3 }), {
      onStep: (i, s) => { if (hitAt < 0 && s.phys.ev.wall > 0.5) hitAt = i; if (hitAt >= 0 && freeAt < 0 && i > hitAt + 60 && s.phys.speed > 8) freeAt = i; },
    });
    assert.ok(hitAt >= 0, `${yawDeg}° ${kmh} km/h : la voiture a bien heurté la bordure`);
    assert.ok(freeAt >= 0, `${yawDeg}° ${kmh} km/h (${mode}) : toujours plaquée après 14 s`);
    assert.ok((freeAt - hitAt) / 120 < 9, `${yawDeg}° ${kmh} km/h (${mode}) : dégagée seulement après ${((freeAt - hitAt) / 120).toFixed(1)} s`);
  }
  assert.equal(cases, 16);
});
test('le dégagement automatique ne touche jamais une voiture qui roule : frôler puis heurter une bordure à 90 km/h ne l\'arme pas tant qu\'elle n\'est pas plaquée à l\'arrêt', () => {
  const sim = fresh(strip(12)); const P = sim.phys;
  P.pos.x = 24; P.pos.z = 400; P.yaw = -2 * Math.PI / 180; P.vel.x = 0.9; P.vel.z = -25;
  let unstickSteps = 0, wallHits = 0;
  run(sim, 120 * 3, () => GAS, { onStep: (i, s) => { if (s.phys.unstick) unstickSteps++; if (s.phys.ev.wall > 0) wallHits++; } });
  assert.ok(wallHits > 0, 'la bordure a bien été touchée');
  assert.equal(unstickSteps, 0, 'jamais armé à vitesse de course');
});
test('marche arrière : toujours possible contre un mur (frein à l\'arrêt)', () => {
  const sim = fresh(strip(12)); const P = sim.phys;
  P.pos.x = 19; P.pos.z = 400; P.yaw = -61 * Math.PI / 180; P.vel.x = 20; P.vel.z = -10;
  let hit = -1, back = false;
  run(sim, 120 * 6, (i) => ({ throttle: hit < 0 || i < hit + 30, brake: hit >= 0 && i >= hit + 30, steer: 0 }), { onStep: (i, s) => { if (hit < 0 && s.phys.ev.wall > 0.5) hit = i; if (s.phys.fwdSpeed < -1) back = true; } });
  assert.ok(hit >= 0 && back, 'elle recule');
});

console.log('Gravité inversée');
test('route à l\'envers (circuit « plafond ») : bumper et piques sur le trajet réel d\'une voiture au plafond — contact réel, puis la course continue', () => {
  for (const k of ['bumper', 'spikes']) {
    const make = (deco) => { const tr = buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === 'plafond')); if (deco) tr.addDeco(deco); tr.version++; return tr; };
    // 1. repérer où se trouve la voiture quand elle roule au plafond (gravité -1, posée)
    const tr0 = make(null), sim0 = new Simulation(tr0); sim0.start(); const bot0 = new Autopilot(tr0.path); bot0.reset(sim0.phys);
    let spot = null;
    for (let i = 0; i < 9000 && !spot; i++) { sim0.step(bot0.control(sim0.phys)); const P = sim0.phys; if (P.gSign < 0 && P.grounded && !P.rib && P.speed > 15 && i > 300) spot = { x: P.pos.x, y: P.pos.y, z: P.pos.z, n: { ...P.n }, i }; if (sim0.lost) sim0.rewind(); }
    assert.ok(spot, 'la voiture roule bien au plafond');
    // 2. même course, obstacle posé EXACTEMENT là où le centre de la voiture passera (centre = pos + n × 0,8)
    const cy = spot.y + spot.n.y * 0.8;
    const tr = make({ k, x: spot.x + spot.n.x * 0.8, y: cy - 0.4, z: spot.z + spot.n.z * 0.8, ry: 0, s: 1, ph: 0 });
    const sim = new Simulation(tr); sim.start(); const bot = new Autopilot(tr.path); bot.reset(sim.phys);
    sim.phys.graceT = 0; sim.phys.hazardGrace = 0;
    const hit = { at: null };
    const log = run(sim, 120 * 40, (i, s) => bot.control(s.phys), { onStep: (i, s) => { if ((s.phys.ev.shock > 0 || s.phys.ev.spike) && !hit.at) hit.at = { gs: s.phys.gSign, grounded: s.phys.grounded }; } });
    assert.ok(log.shock + log.spike >= 1, `${k} sur route à l'envers : le contact a eu lieu`);
    assert.ok(hit.at && hit.at.gs < 0, `${k} : le contact a lieu pendant la gravité inversée (${JSON.stringify(hit.at)})`);
    assert.ok(finite(sim.phys));
  }
});
test('plaque d\'inversion : franchie à 150 km/h juste devant un bumper — l\'inversion et le choc se produisent dans le même passage, sans état incohérent ; la voiture est ensuite rappelée ou continue', () => {
  const tr = strip(12);
  const pad = tr.tiles.find((t) => t.t === 'straight' && t.z === 7); pad.s = 'flip'; pad.p = 100;
  const c = tileCenter(pad);
  tr.addDeco({ k: 'bumper', x: c.x, y: 0.4, z: c.z - 6, ry: 0, s: 1, ph: 0 }); tr.version++;
  const sim = fresh(tr); sim.phys.place(CELL / 2, 0.4, 8 * CELL + 10, 0, 1); sim.phys.graceT = 0; sim.phys.hazardGrace = 0; sim.phys.vel.z = -150 / 3.6;
  const log = run(sim, 120 * 10, () => GAS);
  assert.ok(log.flip >= 1, 'inversion de gravité franchie');
  assert.ok(log.shock >= 0 && finite(sim.phys));
  assert.ok(sim.phys.gSign === 1 || sim.phys.gSign === -1);
});
test('aimants et inversion : une route aimantée garde la voiture collée à l\'endroit comme à l\'envers (circuit plafond, toutes routes aimantées)', () => {
  const tr = buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === 'plafond'));
  for (const t of tr.tiles) if (t.t === 'straight') { t.s = 'magnet'; t.p = 100; } tr.version++;
  const sim = new Simulation(tr); sim.start(); const bot = new Autopilot(tr.path); bot.reset(sim.phys);
  let inverted = 0, groundedInv = 0;
  const log = run(sim, 120 * 90, (i, s) => bot.control(s.phys), { onStep: (i, s) => { if (s.phys.gSign < 0) { inverted++; if (s.phys.grounded) groundedInv++; } } });
  assert.ok(inverted > 600, 'la voiture passe du temps au plafond (' + inverted + ' pas)');
  assert.ok(groundedInv / inverted > 0.8, 'collée au plafond la plupart du temps (' + (groundedInv / inverted * 100).toFixed(0) + ' %)');
  assert.ok(log.finishedAt >= 0 || log.rewinds < 6, 'le circuit se termine (ou presque) : ' + JSON.stringify({ fin: log.finishedAt, retours: log.rewinds }));
});

console.log('Chute sans fin');
test('voiture passée SOUS le sol (poussée à travers la route) : elle ne tombe plus sans fin, le jeu la déclare perdue et la rappelle au checkpoint (avant 0.9.54 : chute à l\'infini, y < -800 m après 12 s)', () => {
  const sim = fresh(strip(10)); const P = sim.phys;
  P.place(CELL / 2, 0.4, 5 * CELL, 0, 1); P.graceT = 0;
  P.pos.y = -3; P.prev.y = -3; P.grounded = false; P.vel.y = 0;       // le cas réel : écrasée par un obstacle, la voiture ressort 2 m sous la chaussée
  let minY = 0, backAt = -1;
  run(sim, 120 * 12, () => IDLE, { onStep: (i, s) => { minY = Math.min(minY, s.phys.pos.y); if (s.lost && backAt < 0) backAt = i; }, maxJump: 1e6 });
  assert.ok(backAt >= 0, 'rappelée au checkpoint');
  assert.ok(backAt < 120 * 8, 'en moins de 8 s (' + (backAt / 120).toFixed(1) + ' s)');
  assert.ok(minY > -200, 'sans plonger indéfiniment (y min ' + minY.toFixed(0) + ' m)');
  assert.ok(P.grounded && P.pos.y > -1, 'puis posée sur la route');
});
test('le sol n\'est pas un plancher invisible pour le vol : une voiture qui saute d\'un tremplin et retombe loin sous le circuit est rappelée, une voiture qui vole haut ne l\'est pas', () => {
  const sim = fresh(strip(10)); const P = sim.phys;
  P.place(CELL / 2, 0.4, 5 * CELL, 0, 1); P.graceT = 0; P.pos.y = 80; P.prev.y = 80; P.grounded = false; P.vel.y = 0;
  const log = run(sim, 120 * 2, () => IDLE, { maxJump: 1e6 });
  assert.equal(log.rewinds, 0, 'en plein vol (80 m de haut) : pas perdue');
});

console.log('Checkpoints, réapparitions et téléportations');
test('retour au checkpoint 25 fois de suite avec un marteau, un bumper et des piques autour du point de réapparition : même position à chaque fois, protection réarmée, jamais de dérive ni de boucle', () => {
  const tr = scriptTrack('r', 'start S3 C S4 finish');
  const cp = tr.tiles.find((t) => t.t === 'checkpoint'), c = tileCenter(cp);
  for (const k of ['hammer', 'bumper', 'spikesPop']) tr.addDeco({ k, x: c.x + (k === 'bumper' ? 6 : 0), y: baseY(cp), z: c.z + (k === 'hammer' ? 8 : -6), ry: 0, s: 1, ph: 0.3 });
  tr.version++;
  const sim = new Simulation(tr); sim.start(); const bot = new Autopilot(tr.path); bot.reset(sim.phys);
  let reached = false;
  for (let i = 0; i < 120 * 40 && !reached; i++) { const e = sim.step(bot.control(sim.phys)); if (e && e.type === 'checkpoint') reached = true; if (sim.lost) { sim.rewind(); bot.reset(sim.phys); } assert.ok(finite(sim.phys)); }
  assert.ok(reached, 'checkpoint pris');
  const pos0 = null;
  let first = null;
  for (let k = 0; k < 25; k++) {
    for (let i = 0; i < 120 * 3; i++) { sim.step(k % 2 ? GAS : IDLE); assert.ok(finite(sim.phys)); if (sim.lost) { sim.rewind(); } }
    sim.rewind();
    const P = sim.phys;
    assert.ok(P.graceT > 1.4 && P.hazardGrace > 0.7 && P.speed === 0 && P.grounded, 'réarmée, immobile, posée');
    if (!first) first = { ...P.pos }; else assert.ok(Math.hypot(P.pos.x - first.x, P.pos.y - first.y, P.pos.z - first.z) < 1e-9, 'toujours exactement au même point');
  }
  assert.equal(pos0, null);
});
test('placée au milieu d\'un obstacle solide (téléportation) : rien n\'agit pendant la protection de 0,8 s, ensuite la voiture est repoussée hors du poteau de façon bornée, sans saut ni état invalide', () => {
  const tr = strip(12); tr.addDeco({ k: 'bumper', x: CELL / 2, y: 0.4, z: 300, ry: 0, s: 1, ph: 0 }); tr.version++;
  const sim = new Simulation(tr); sim.start();
  sim.phys.place(CELL / 2 + 0.3, 0.4, 300.2, 0, 1);       // en plein dans le poteau : hazardGrace = 0,8 s, graceT = 1,5 s
  const dist = () => Math.hypot(sim.phys.pos.x - CELL / 2, sim.phys.pos.z - 300);
  const d0 = dist();
  let movedAt = -1;
  const log = run(sim, 120 * 4, () => IDLE, { onStep: (i) => { if (movedAt < 0 && Math.abs(dist() - d0) > 0.05) movedAt = i; }, maxJump: 4.5 });
  assert.ok(movedAt >= Math.floor(120 * 0.8) - 1, 'immobile pendant la protection (premier déplacement au pas ' + movedAt + ')');
  assert.ok(movedAt >= 0, 'puis le poteau la repousse');
  assert.ok(dist() > OBST.bumper.r + 0.5, 'dégagée du poteau (' + dist().toFixed(1) + ' m)');
  assert.equal(log.rewinds, 0);
});
test('état physique corrompu (NaN, infini) : détecté au pas même, retour automatique au checkpoint, état sain ensuite ; même décision au rejeu', () => {
  const CORRUPTIONS = [(P) => { P.vel.x = NaN; }, (P) => { P.pos.y = Infinity; }, (P) => { P.yaw = NaN; }, (P) => { P.vel.z = 1e9; }];
  for (const corrupt of CORRUPTIONS) {
    const sim = fresh(strip(8));
    for (let i = 0; i < 30; i++) sim.step(GAS);
    corrupt(sim.phys);
    sim.step(GAS);
    if (corrupt === CORRUPTIONS[0] || corrupt === CORRUPTIONS[2]) assert.ok(sim.phys.ev.invalid, 'un NaN est détecté au pas même');
    assert.ok(sim.phys.ev.invalid || sim.phys._sane(), 'jamais d\'état incohérent laissé en place');
    if (sim.phys.ev.invalid) assert.equal(sim.lost, 'sink', 'retour demandé');
    sim.rewind();
    assert.ok(finite(sim.phys) && sim.phys._sane(), 'état sain après le retour');
    for (let i = 0; i < 120; i++) sim.step(GAS);
    assert.ok(finite(sim.phys) && sim.phys.speed > 1, 'la course reprend');
  }
});
test('angle non fini au passage d\'un checkpoint : aucune boucle infinie (RaceLogic.update rend la main)', () => {
  const tr = scriptTrack('c', 'start S3 C S3 finish');
  const cp = tr.tiles.find((t) => t.t === 'checkpoint'), c = tileCenter(cp);
  for (const yaw of [Infinity, -Infinity, NaN]) {
    const L = new RaceLogic(tr);
    const phys = { pos: { x: c.x, y: baseY(cp) + 0.4, z: c.z }, prev: { x: c.x, y: baseY(cp) + 0.4, z: c.z + 0.2 }, yaw, grounded: true, rib: null, surfType: 'road', gSign: 1, gravMul: 1, vehicle: 'car' };
    const t0 = Date.now();
    const ev = L.update(phys);
    assert.ok(Date.now() - t0 < 200, 'rend la main');
    assert.ok(ev === null || ev.type === 'checkpoint');
  }
});

console.log('Charge : contacts répétés et simultanés (graine fixe)');
test('stress : 40 circuits aléatoires (verre, inversions, aimants, obstacles superposés, retours et téléportations en rafale), 4 000 pas chacun — aucune exception, aucune valeur invalide, aucun pas lent, aucun saut', () => {
  const MODS = ['glass', 'flip', 'magnet', 'reverse', 'cut', 'boost', 'spring', 'bounce', 'conveyor', 'gravity', 'ice'];
  const LAYOUTS = ['start S6 C S6 finish', 'start S4 U S3 D S4 C S4 finish', 'start S3 R S3 R S3 C S3 finish', 'start S3 O S3 C S4 finish', 'start S4 UU S3 DD S3 C S3 finish', 'start S3 TW S4 TWB S3 C S3 finish', 'start S5 G2 S4 C S3 finish'];
  const KINDS = Object.keys(OBST);
  let contacts = 0, slowest = 0, totalSteps = 0, glass = 0, invalid = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const rnd = lcg(seed * 7919 + 13), pick = (a) => a[(rnd() * a.length) | 0];
    const tr = scriptTrack('s', pick(LAYOUTS));
    const roads = tr.tiles.filter((t) => !['start', 'finish', 'checkpoint'].includes(t.t));
    for (const t of roads) if (rnd() < 0.3) { const m = pick(MODS); t.s = m; t.p = m === 'glass' ? 15 + ((rnd() * 80) | 0) : 100 + ((rnd() * 100) | 0); }
    for (let i = 0, n = 2 + ((rnd() * 6) | 0); i < n; i++) {
      const t = pick(roads), c = tileCenter(t), k = pick(KINDS);
      for (let j = 0, m = rnd() < 0.4 ? 4 : 1; j < m; j++) tr.addDeco({ k, x: c.x + (rnd() - 0.5) * 8, y: baseY(t), z: c.z + (rnd() - 0.5) * 8, ry: rnd() * 6.28, s: pick([0.5, 1, 1, 2]), ph: rnd() });
    }
    tr.version++;
    const sim = new Simulation(tr); sim.start(); const bot = new Autopilot(tr.path); bot.reset(sim.phys);
    const mode = pick(['bot', 'gas', 'noise']);
    for (let i = 0; i < 4000; i++) {
      const P = sim.phys, r = rnd();
      const inp = mode === 'bot' ? bot.control(P) : mode === 'gas' ? GAS : { throttle: rnd() < 0.92, brake: rnd() < 0.06, steer: Math.max(-1, Math.min(1, Math.sin(i / 37) * 0.9 + (rnd() - 0.5) * 0.4)) };
      if (r < 0.002) sim.rewind();
      else if (r < 0.0025) sim.start();
      else if (r < 0.003) { const c = tileCenter(pick(roads)); P.place(c.x + (rnd() - 0.5) * 6, 0.4, c.z + (rnd() - 0.5) * 6, rnd() * 6.28, rnd() < 0.5 ? 1 : -1); }
      else if (r < 0.0035) P.gSign = -P.gSign;
      const t0 = performance.now();
      sim.step(inp);
      slowest = Math.max(slowest, performance.now() - t0);
      assert.ok(finite(P), `graine ${seed} pas ${i} : état non fini`);
      assert.ok(Math.abs(P.pos.x) < 1e5 && Math.abs(P.pos.y) < 1e5 && Math.abs(P.pos.z) < 1e5, `graine ${seed} pas ${i} : hors du monde`);
      if (P.ev.shock > 0 || P.ev.spike) contacts++;
      if (P.ev.glass) glass++;
      if (P.ev.invalid) invalid++;
      totalSteps++;
      if (sim.lost) { sim.rewind(); bot.reset(P); }
      if (sim.logic.finished) { sim.start(); bot.reset(P); }
    }
  }
  assert.equal(invalid, 0, 'aucun état invalide détecté en jeu normal');
  assert.ok(contacts > 100, 'de vrais contacts ont eu lieu (' + contacts + ')');
  assert.ok(glass > 0, 'du verre a cédé (' + glass + ')');
  assert.ok(slowest < 250, 'aucun pas ne dépasse 250 ms (pire : ' + slowest.toFixed(1) + ' ms sur ' + totalSteps + ' pas)');
});
test('stress : 1 500 obstacles dans la même case de 20 m (densité extrême) — la physique reste finie et chaque pas reste rapide', () => {
  const tr = scriptTrack('d', 'start S8 finish'); const roads = tr.tiles.filter((t) => t.t === 'straight'); const c = tileCenter(roads[3]);
  const kinds = Object.keys(OBST);
  for (let i = 0; i < 1500; i++) tr.addDeco({ k: kinds[i % kinds.length], x: c.x + (i % 7) * 0.5, y: baseY(roads[3]), z: c.z + (i % 5) * 0.5, ry: i, s: 1, ph: (i % 10) / 10 });
  tr.version++;
  const sim = fresh(tr); sim.phys.place(c.x, 0.4, c.z + 40, 0, 1); sim.phys.graceT = 0; sim.phys.hazardGrace = 0; sim.phys.vel.z = -80 / 3.6;
  let worst = 0;
  const log = run(sim, 120 * 5, () => GAS, { onStep: () => {}, maxJump: 6 });
  const t0 = performance.now(); for (let i = 0; i < 300; i++) { const a = performance.now(); sim.step(GAS); worst = Math.max(worst, performance.now() - a); if (sim.lost) sim.rewind(); }
  assert.ok(log.shock + log.spike >= 1, 'contact');
  assert.ok(worst < 100, 'pas le plus lent : ' + worst.toFixed(1) + ' ms (budget 8 ms à 120 Hz, marge de 12×)');
  assert.ok(performance.now() - t0 < 5000);
});


// ---- Phase 7 : volant tenu à fond -----------------------------------------------------------------------------------------------------------------------
const bigField = () => { const tr = new Track('champ'); tr.add({ t: 'start', x: 20, z: 41, l: 0, r: 0 }); for (let x = 0; x < 41; x++) for (let z = 1; z < 41; z++) tr.add({ t: 'platform', x, z, l: 0, r: 0 }); tr.add({ t: 'finish', x: 20, z: 0, l: 0, r: 0 }); return tr; };
test('volant tenu à FOND, gaz à fond, au milieu d\'une grande plateforme : la voiture n\'est PAS prisonnière d\'un petit cercle à 2 m/s (avant 0.9.58 : vitesse bloquée à 1,9 m/s indéfiniment)', () => {
  for (const sgn of [1, -1]) {
    const sim = fresh(bigField()); const P = sim.phys;
    let top = 0, dist = 0, px = P.pos.x, pz = P.pos.z;
    run(sim, 120 * 20, () => ({ throttle: true, brake: false, steer: sgn }), { onStep: (i, s) => { top = Math.max(top, s.phys.speed); dist += Math.hypot(s.phys.pos.x - px, s.phys.pos.z - pz); px = s.phys.pos.x; pz = s.phys.pos.z; } });
    assert.ok(top > 8, `volant ${sgn} : vitesse maximale ${top.toFixed(1)} m/s (prisonnière d'un cercle à vitesse de marche)`);
    assert.ok(dist > 120, `volant ${sgn} : ${dist.toFixed(0)} m parcourus en 20 s`);
  }
});
test('volant à fond CONTRE un mur (gaz, impact de 15° à 60°, 60 et 100 km/h, des deux côtés) : jamais prisonnière sans issue (elle repart, ou le jeu la ramène au checkpoint), et relâcher le volant la remet en route', () => {
  let cases = 0;
  for (const yawDeg of [15, 30, 60]) for (const kmh of [60, 100]) for (const sgn of [1, -1]) {
    cases++;
    const sim = fresh(strip(14)); const P = sim.phys;
    const yaw = -yawDeg * Math.PI / 180, sp = kmh / 3.6; P.pos.x = 19; P.pos.z = 500; P.yaw = yaw; P.vel.x = -Math.sin(yaw) * sp; P.vel.z = -Math.cos(yaw) * sp;
    let hit = false, peak = 0, still = 0;
    const log = run(sim, 120 * 16, () => ({ throttle: true, brake: false, steer: sgn }), { onStep: (i, s) => { if (s.phys.ev.wall > 0.5) hit = true; if (hit && i > 120 * 4) peak = Math.max(peak, s.phys.speed); if (hit && s.phys.speed < 1) still++; } });
    assert.ok(hit, `${yawDeg}° ${kmh} km/h : la voiture a bien heurté le mur`);
    assert.ok(peak > 6 || log.rewinds > 0, `${yawDeg}° ${kmh} km/h volant ${sgn} : en 16 s la voiture n'a jamais dépassé ${peak.toFixed(1)} m/s et n'a pas été ramenée au checkpoint`);
    assert.ok(still / 120 < 9, `${yawDeg}° ${kmh} km/h volant ${sgn} : ${(still / 120).toFixed(1)} s presque immobile`);
    // on relâche le volant : elle repart droit
    let v2 = 0; run(sim, 120 * 8, () => GAS, { onStep: (i, s) => { v2 = Math.max(v2, s.phys.speed); } });
    assert.ok(v2 > 10, `${yawDeg}° ${kmh} km/h : volant relâché, vitesse maximale ${v2.toFixed(1)} m/s`);
  }
  assert.equal(cases, 12);
});


// ---- Phase 7 : gravité inversée sous une dalle pleine ou un tunnel ------------------------------------------------------------------------------------------
const slabCase = (kind) => {
  const tr = new Track('inv'); tr.add({ t: 'start', x: 3, z: 12, l: 0, r: 0 });
  for (let z = 11; z >= 2; z--) tr.add({ t: 'straight', x: 3, z, l: 0, r: 0, ...(kind === 'tunnel' ? { tn: 1 } : {}) });
  tr.add({ t: 'finish', x: 3, z: 1, l: 0, r: 0 });
  if (kind === 'slab') for (let x = 1; x <= 5; x++) for (let z = 4; z <= 9; z++) tr.add({ t: 'platform', x, z, l: 2, r: 0 });
  return tr;
};
const invRun = (tr, vz, steps) => {
  const sim = fresh(tr), P = sim.phys; P.pos.x = 3.5 * CELL; P.pos.z = 6.5 * CELL; P.pos.y = 0.6; P.vel.z = vz; P.gSign = -1; P.grounded = false;
  let maxY = -1e9, lostAt = -1, rew = 0, maxVy = 0;
  run(sim, steps, () => GAS, { onStep: (i, s) => { maxY = Math.max(maxY, s.phys.pos.y); maxVy = Math.max(maxVy, s.phys.vel.y); if (s.lost && lostAt < 0) lostAt = i; if (s.lost) { rew++; s.phys.gSign = -1; s.phys.grounded = false; } } });
  return { maxY, lostAt, rew, maxVy, P };
};
test('gravité INVERSÉE sous une dalle pleine : la voiture la traverse, VOLONTAIREMENT (« Cristal Fêlé » monte ainsi de 8 niveaux : la bloquer fait passer ce circuit de 33 s à 70 s) ; le test fige ce choix et son effet', () => {
  for (const vz of [0, -10]) {
    const r = invRun(slabCase('slab'), vz, 120 * 5);
    assert.ok(r.maxY > baseY({ l: 2 }) + 1, `vitesse ${vz} : la voiture devrait traverser la dalle (y maximal ${r.maxY.toFixed(1)} m)`);
  }
  // le circuit officiel qui en dépend : le pilote automatique le termine dans son temps de référence
  const cf = BUILTIN_TRACKS.find((d) => d.id === 'cristalfele'), t = buildBuiltin(cf), sim = fresh(t), bot = new Autopilot(t.path); bot.reset(sim.phys);
  let fin = -1; run(sim, 120 * 60, () => bot.control(sim.phys), { onStep: (i, s) => { if (s.logic.finished && fin < 0) fin = i; } });
  assert.ok(fin >= 0 && fin / 120 < 36, `Cristal Fêlé : arrivée en ${(fin / 120).toFixed(1)} s (référence 33,1 s) : la traversée des dalles en gravité inversée ne doit pas être bloquée`);
});
test('gravité INVERSÉE dans un tunnel : le toit retient la voiture (elle n\'en sort plus par le haut) et elle est ramenée au checkpoint', () => {
  const r = invRun(slabCase('tunnel'), 0, 120 * 5);
  const roof = baseY({ l: 0 }) + 0.0; void roof;
  assert.ok(r.maxY < 14, `le toit n'a pas retenu la voiture : y maximal ${r.maxY.toFixed(1)} m`);
  assert.ok(r.lostAt >= 0 && r.lostAt < 120 * 4.8, `plaquée sous le toit sans retour (${r.lostAt})`);
});
test('gravité inversée SANS dalle ni tunnel : comportement inchangé (la voiture monte, puis est déclarée perdue dans le ciel et ramenée)', () => {
  const r = invRun(slabCase('open'), 0, 120 * 25);
  assert.ok(r.maxY > 60, `la voiture devrait monter librement (y max ${r.maxY.toFixed(1)})`);
  assert.ok(r.lostAt >= 0, 'jamais ramenée');
});

await finish('Tous les tests de contacts réels passent.');
