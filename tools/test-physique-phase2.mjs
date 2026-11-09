// PHASE 2 — réparation de la physique : node tools/test-physique-phase2.mjs   (npm test)
// Reproduit automatiquement les problèmes signalés (obstacles inertes sur les rubans, états impossibles après un retour, verre, gravité inversée,
// volant inversé) et vérifie les garde-fous généraux : jamais de nombre non fini, jamais de voiture figée, jamais d'obstacle traversé.
import assert from 'node:assert/strict';
import { Track, scriptTrack } from '../js/track.js';
import { Simulation } from '../js/simulation.js';
import { CarPhysics } from '../js/physics.js';
import { Autopilot } from '../js/autopilot.js';
import { OBST } from '../js/obstacles.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { DT, CELL } from '../js/constants.js';
import { respawnGs, RaceLogic } from '../js/raceLogic.js';
import { test, finish } from './harness.mjs';

const GAS = { throttle: true, brake: false, steer: 0 };
const IDLE = { throttle: false, brake: false, steer: 0 };
const fin = (P) => Number.isFinite(P.pos.x + P.pos.y + P.pos.z + P.vel.x + P.vel.y + P.vel.z + P.yaw + P.omega + P.pitch);
const strip = (n, extra = {}) => {
  const tr = new Track('t');
  tr.add({ t: 'start', x: 0, z: n + 1, l: 0, r: 0 });
  for (let i = 0; i < n - 1; i++) tr.add({ t: 'straight', x: 0, z: n - i, l: 0, r: 0, ...extra });
  tr.add({ t: 'finish', x: 0, z: 1, l: 0, r: 0 });
  return tr;
};
const lcg = (s) => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

console.log('Obstacles sur une route au sol : jamais traversés, jamais de nombre non fini, à toute vitesse');
test('chaque obstacle, de 60 à 340 km/h : la voiture ne le traverse pas (piques mortelles, autres : choc) et la physique reste finie', () => {
  for (const k of Object.keys(OBST)) {
    for (const kmh of [60, 150, 250, 340]) {
      const tr = strip(12); tr.addDeco({ k, x: CELL / 2, y: 0.4, z: 300, ry: 0, s: 1, ph: 0 }); tr.version++;
      const sim = new Simulation(tr); sim.start();
      sim.phys.graceT = 0; sim.phys.hazardGrace = 0;      // (la protection de départ de 1,5 s couvrirait l'obstacle à 340 km/h)
      sim.phys.vel.z = -kmh / 3.6;
      let touched = false;
      for (let i = 0; i < 900 && !touched; i++) {
        sim.drive(GAS);
        assert.ok(fin(sim.phys), `${k} à ${kmh} km/h : état non fini au pas ${i}`);
        if (sim.phys.ev.sink || sim.phys.ev.shock > 0) touched = true;
        else assert.ok(sim.phys.pos.z > 295 || Math.abs(sim.phys.pos.x - CELL / 2) > 3, `${k} à ${kmh} km/h : l'obstacle a été traversé sans contact (z ${sim.phys.pos.z.toFixed(1)})`);
      }
      assert.ok(touched, `${k} à ${kmh} km/h : aucun contact`);
    }
  }
});
test('bumper contre un mur de bordure à 300 km/h : la voiture n\'est jamais à l\'intérieur du poteau après le pas', () => {
  const tr = strip(12); tr.addDeco({ k: 'bumper', x: CELL / 2, y: 0.4, z: 300, ry: 0, s: 1 }); tr.version++;
  const sim = new Simulation(tr); sim.start(); sim.phys.vel.z = -300 / 3.6;
  const def = OBST.bumper;
  for (let i = 0; i < 600; i++) {
    sim.drive(GAS); const P = sim.phys;
    const d = Math.hypot(P.pos.x + P.n.x * 0.8 - CELL / 2, P.pos.z + P.n.z * 0.8 - 300);
    assert.ok(d > def.r + 1.4 - 0.1 || !fin(P), `pas ${i} : voiture enfoncée dans le poteau (${d.toFixed(2)} m)`);
  }
});
test('obstacles mobiles (marteau, balancier, mur coulissant, balayeur) : 20 s de conduite aléatoire, jamais coincé ni non fini', () => {
  const rnd = lcg(11);
  for (const k of ['hammer', 'pendulum', 'slider', 'sweeper', 'spikesPop']) {
    const tr = strip(12);
    for (let i = 0; i < 3; i++) tr.addDeco({ k, x: CELL / 2 + (rnd() - 0.5) * 6, y: 0.4, z: 300 - i * 40, ry: rnd() * 6, s: 1, ph: rnd() });
    tr.version++;
    const sim = new Simulation(tr); sim.start();
    let still = 0, last = null;
    for (let i = 0; i < 2400; i++) {
      sim.step({ throttle: true, brake: false, steer: Math.sin(i / 60) * 0.5 });
      assert.ok(fin(sim.phys), `${k} : non fini au pas ${i}`);
      if (sim.lost) sim.rewind();
      const p = sim.phys.pos;
      if (last && Math.abs(p.x - last.x) + Math.abs(p.z - last.z) < 1e-3) still++; else still = 0;
      last = { x: p.x, z: p.z };
      if (sim.logic.finished) break;
    }
    assert.ok(still < 600, `${k} : voiture immobile pendant ${still} pas`);
  }
});

console.log('Voiture plaquée contre un mur')
test('nez au mur à l\'arrêt, gaz à fond : le volant la fait pivoter et elle repart (avant : coincée indéfiniment)', () => {
  const tr = strip(12); const sim = new Simulation(tr); sim.start();
  const P = sim.phys; P.place(CELL / 2 + 11.2, 0.4, 5 * CELL, -1.22, 1); P.graceT = 0;
  let moved = 0;
  for (let i = 0; i < 900; i++) { sim.drive({ throttle: true, brake: false, steer: i < 300 ? -1 : 0.5 }); moved = Math.max(moved, -(P.pos.z - 5 * CELL)); }
  assert.ok(moved > 8, 'la voiture est repartie le long de la route (' + moved.toFixed(1) + ' m)');
});
test('à l\'arrêt en plein milieu de la route, le volant ne la fait pas pivoter (pas de rotation sur place hors contact avec un mur)', () => {
  const tr = strip(12); const sim = new Simulation(tr); sim.start(); sim.phys.graceT = 0;
  for (let i = 0; i < 200; i++) sim.drive({ throttle: false, brake: false, steer: 1 });
  assert.ok(Math.abs(sim.phys.yaw) < 0.01, 'cap ' + sim.phys.yaw);
});

console.log('Obstacles sur un ruban (looping, mur, tube) : ils agissent aussi (avant 0.9.48 la voiture les traversait)');
{
  const run = (k) => {
    const tr = scriptTrack('lv', 'start S4 O S3 finish');
    const s0 = new Simulation(tr); s0.start(); const bot = new Autopilot(tr.path); bot.reset(s0.phys);
    const pts = [];
    for (let i = 0; i < 4000; i++) { s0.step(bot.control(s0.phys)); if (s0.phys.rib) pts.push({ x: s0.phys.pos.x, y: s0.phys.pos.y, z: s0.phys.pos.z }); }
    const mid = pts[pts.length >> 1];
    tr.addDeco({ k, x: mid.x, y: mid.y - 0.4, z: mid.z, ry: 0, s: 1, ph: 0 }); tr.version++;
    const sim = new Simulation(tr); sim.start(); const b2 = new Autopilot(tr.path); b2.reset(sim.phys);
    let ribbon = 0, spike = 0, shock = 0;
    for (let i = 0; i < 1500; i++) {
      sim.step(b2.control(sim.phys));
      assert.ok(fin(sim.phys), 'état non fini sur le ruban');
      if (sim.phys.rib) { ribbon++; assert.ok(sim.phys.grounded, 'ruban : grounded cohérent'); }
      if (sim.phys.ev.spike) spike++;
      if (sim.phys.ev.shock > 0) shock++;
      if (sim.lost) break;
    }
    return { ribbon, spike, shock };
  };
  test('piques sur un looping : contact létal (avant : traversées)', () => { assert.ok(run('spikes').spike >= 1); });
  test('bumper sur un looping : la voiture reçoit le choc', () => { assert.ok(run('bumper').shock >= 1); });
  test('sans obstacle la voiture fait le looping sans aucun choc (pas de régression)', () => {
    const tr = scriptTrack('lv', 'start S4 O S3 finish'); const sim = new Simulation(tr); sim.start(); const bot = new Autopilot(tr.path); bot.reset(sim.phys);
    let shocks = 0, rib = 0;
    for (let i = 0; i < 1500; i++) { sim.step(bot.control(sim.phys)); if (sim.phys.ev.shock) shocks++; if (sim.phys.rib) rib++; }
    assert.equal(shocks, 0); assert.ok(rib > 100);
  });
}

console.log('Retour au checkpoint : état jamais impossible');
test('respawnGs : route retournée → plafond, route normale → sol, ruban → gravité du moment', () => {
  assert.equal(respawnGs({ v: 1 }, { rib: null, gSign: 1 }), -1);
  assert.equal(respawnGs({}, { rib: null, gSign: -1 }), 1);
  assert.equal(respawnGs({}, { rib: {}, gSign: -1 }), -1);
});
test('anneau checkpoint après une inversion de gravité : réapparition avec la gravité du point de réapparition (pas celle de l\'anneau)', () => {
  const tr = strip(12, {}); const sim = new Simulation(tr); sim.start();
  const L = sim.logic;
  L.lastGround = { x: CELL / 2, y: 0.4, z: 200, yaw: 0, gs: 1, steps: 10 };
  assert.equal(L._ringRespawn({}, { yaw: 0 }).gs, 1);
  L.lastGround = { x: CELL / 2, y: 30, z: 200, yaw: 0, gs: -1, steps: 10 };
  assert.equal(L._ringRespawn({}, { yaw: 0 }).gs, -1);
});
test('circuit « plafond » : un retour au checkpoint pris à l\'envers remet la voiture au plafond (gravité -1), un départ la remet à l\'endroit', () => {
  const tr = buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === 'plafond'));
  const sim = new Simulation(tr); sim.start(); const bot = new Autopilot(tr.path); bot.reset(sim.phys);
  let cp = false;
  for (let i = 0; i < 6000 && !cp; i++) { const e = sim.step(bot.control(sim.phys)); if (e && e.type === 'checkpoint') cp = true; }
  assert.ok(cp && sim.phys.gSign === -1, 'checkpoint pris à l\'envers');
  for (let i = 0; i < 700; i++) sim.step(bot.control(sim.phys));
  sim.rewind();
  assert.equal(sim.phys.gSign, -1, 'gravité inversée restaurée au retour');
  assert.ok(sim.phys.n.y < 0 || sim.phys.pos.y > 0, 'état sain');
  for (let i = 0; i < 60; i++) { sim.step(IDLE); assert.ok(fin(sim.phys)); }
  assert.ok(!sim.phys.lost, 'la voiture posée au plafond n\'est pas « perdue dans le ciel »');
  sim.start();
  assert.equal(sim.phys.gSign, tr.flip0 || sim.logic.spawnPoint().gs < 0 ? -1 : 1, 'départ : orientation initiale restaurée');
});
test('verre : un retour au checkpoint ou un redémarrage restaure toutes les dalles (physique ET compteurs), les temps de contact repartent de zéro', () => {
  const tr = strip(8); const g = tr.tiles.find((t) => t.z === 4); g.s = 'glass'; g.p = 30; tr.version++;
  const sim = new Simulation(tr); sim.start();
  sim.phys.place(CELL / 2, 0.4, 4 * CELL + CELL / 2, 0, 1); sim.phys.graceT = 0;
  let n = 0; while (!sim.phys.broken.has(g) && n++ < 400) sim.drive(IDLE);
  assert.ok(sim.phys.broken.has(g), 'la dalle cède');
  const v = sim.phys.brokenVer;
  sim.rewind(); assert.equal(sim.phys.broken.size, 0); assert.equal(sim.phys.glassTime.size, 0); assert.ok(sim.phys.brokenVer > v, 'le rendu est prévenu');
  sim.phys.broken.add(g); sim.start(); assert.equal(sim.phys.broken.size, 0);
});

test('verre sous le point de réapparition : aucune boucle « retour → dalle brisée → vide → retour » quand le joueur attend (avant : un retour toutes les 2,6 s sans fin)', () => {
  const tr = scriptTrack('c', 'start S4 C S4 finish');
  for (const t of tr.tiles) if (t.t === 'checkpoint') { t.s = 'glass'; t.p = 40; }
  tr.version++;
  const sim = new Simulation(tr); sim.start();
  let cps = 0, rew = 0;
  for (let i = 0; i < 6000; i++) {
    const e = sim.step({ throttle: cps === 0, brake: false, steer: 0 });
    if (e && e.type === 'checkpoint') cps++;
    if (sim.lost) { rew++; sim.rewind(); }
  }
  assert.equal(cps, 1); assert.ok(rew <= 1, rew + ' retours au checkpoint');
  assert.ok(sim.phys.grounded && sim.phys.broken.size === 0, 'la voiture attend posée sur le verre du point de réapparition');
});
test('ce verre protégé cède de nouveau dès que la voiture l\'a quitté puis y revient', () => {
  const tr = strip(8); const g = tr.tiles.find((t) => t.z === 4); g.s = 'glass'; g.p = 30; tr.version++;
  const sim = new Simulation(tr); sim.start();
  const P = sim.phys; sim.logic.respawn = { x: CELL / 2, y: 0.4, z: 4 * CELL + CELL / 2, yaw: 0, vehicle: 'car', grav: 1, gs: 1, snap: sim.logic.respawn.snap }; sim.rewind(); P.graceT = 0;
  assert.equal(P.glassSafe, g);
  for (let i = 0; i < 300; i++) sim.drive(IDLE);
  assert.ok(!P.broken.has(g), 'protégé tant qu\'on n\'a pas bougé');
  P.pos.z = 6 * CELL; P.prev.z = P.pos.z; P.vel.z = 0; for (let i = 0; i < 5; i++) sim.drive(IDLE);
  assert.equal(P.glassSafe, null, 'quitté : plus de protection');
  P.place(CELL / 2, 0.4, 6 * CELL, 0, 1); P.glassSafe = null; P.graceT = 0; P.pos.z = 4 * CELL + CELL / 2; P.prev.z = P.pos.z;
  for (let i = 0; i < 300 && !P.broken.has(g); i++) sim.drive(IDLE);
  assert.ok(P.broken.has(g), 'cède normalement');
});

console.log('Verre : plusieurs dalles, empilées, voisines, à l\'envers, rejeu');
test('dalles voisines indépendantes : seule la dalle sous la voiture cède', () => {
  const tr = strip(8); for (const t of tr.tiles) if (t.t === 'straight') { t.s = 'glass'; t.p = 40; } tr.version++;
  const sim = new Simulation(tr); sim.start();
  sim.phys.place(CELL / 2, 0.4, 5 * CELL + CELL / 2, 0, 1); sim.phys.graceT = 0;
  for (let i = 0; i < 120; i++) sim.drive(IDLE);
  assert.equal(sim.phys.broken.size, 1);
});
test('dalles empilées (deux niveaux au même endroit) : la dalle brisée disparaît, la voiture se reçoit sur l\'autre, sans état bloqué', () => {
  const tr = new Track('pile');
  tr.add({ t: 'start', x: 0, z: 4, l: 0, r: 0 });
  tr.add({ t: 'straight', x: 0, z: 3, l: 2, r: 0, s: 'glass', p: 30 });
  tr.add({ t: 'straight', x: 0, z: 3, l: 0, r: 0 });
  tr.add({ t: 'finish', x: 0, z: 1, l: 0, r: 0 });
  const sim = new Simulation(tr); sim.start();
  const up = tr.tiles.find((t) => t.s === 'glass');
  sim.phys.place(CELL / 2, 2 * 6 + 0.4, 3 * CELL + CELL / 2, 0, 1); sim.phys.graceT = 0;
  let n = 0; while (!sim.phys.broken.has(up) && n++ < 400) sim.drive(IDLE);
  assert.ok(sim.phys.broken.has(up));
  for (let i = 0; i < 240; i++) { sim.drive(IDLE); assert.ok(fin(sim.phys)); }
  assert.ok(sim.phys.pos.y < up.l * 6, 'tombée sur la dalle du dessous');
});
test('verre + gravité inversée : au plafond, la dalle de verre cède aussi et la voiture « tombe » vers le haut puis est rappelée, sans geler', () => {
  const tr = buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === 'plafond'));
  for (const t of tr.tiles) if (t.v && t.t === 'straight') { t.s = 'glass'; t.p = 40; }
  tr.version++;
  const sim = new Simulation(tr); sim.start(); const bot = new Autopilot(tr.path); bot.reset(sim.phys);
  let broke = 0, rew = 0;
  for (let i = 0; i < 9000; i++) {
    sim.step(bot.control(sim.phys)); assert.ok(fin(sim.phys), 'non fini au pas ' + i);
    if (sim.phys.ev.glass) broke++;
    if (sim.lost) { rew++; sim.rewind(); }
    if (sim.logic.finished) break;
  }
  assert.ok(broke >= 1 || sim.logic.finished, 'le verre du plafond cède (ou le circuit est fini)');
});
test('rejeu : deux simulations des mêmes commandes avec verre, obstacles et inversions donnent exactement la même course', () => {
  const mk = () => { const tr = buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === 'plafond')); let k = 0; for (const t of tr.tiles) if (t.t === 'straight' && (k++ % 3 === 0)) { t.s = 'glass'; t.p = 60; } tr.version++; return tr; };
  const out = [];
  for (let r = 0; r < 2; r++) {
    const rnd = lcg(5); const tr = mk(); const sim = new Simulation(tr); sim.start();
    for (let i = 0; i < 5000; i++) { sim.step({ throttle: rnd() < 0.9, brake: rnd() < 0.05, steer: Math.sin(i / 50) }); if (sim.lost) sim.rewind(); }
    out.push([sim.phys.pos.x, sim.phys.pos.y, sim.phys.pos.z, sim.phys.vel.x, sim.logic.steps, sim.phys.broken.size, sim.phys.gSign].join());
  }
  assert.equal(out[0], out[1]);
});

console.log('Volant inversé et surfaces à l\'envers');
test('volant inversé : actif seulement sur une pièce qui l\'a réellement (au sol et sur ruban), jamais en l\'air ni après l\'avoir quittée', () => {
  const tr = strip(10); const rev = tr.tiles.find((t) => t.z === 6); rev.s = 'reverse'; tr.version++;
  const sim = new Simulation(tr); sim.start(); sim.phys.graceT = 0;
  const steerAt = (z) => { sim.phys.place(CELL / 2, 0.4, z, 0, 1); sim.phys.vel.z = -20; sim.phys.graceT = 0; sim.drive({ throttle: true, brake: false, steer: 1 }); return sim.phys.steer; };
  assert.ok(steerAt(6 * CELL + 16) < 0, 'sur la dalle : braquage renversé');
  assert.ok(steerAt(8 * CELL + 16) > 0, 'sur une dalle normale : braquage normal');
  const P = sim.phys; P.place(CELL / 2, 0.4, 6 * CELL + 16, 0, 1); P.vel.z = -20; P.graceT = 0;
  for (let i = 0; i < 10; i++) P.step(GAS);
  P.pos.y += 5; P.grounded = false; P.steer = 0; P.step({ throttle: true, brake: false, steer: 1 });
  assert.ok(P.steer > 0, 'en l\'air : braquage normal');
});
test('surfaces à l\'envers : aimant, volant inversé, verre, accélérateur se déclenchent au plafond comme au sol (circuit « plafond », toutes surfaces)', () => {
  const MODS = ['magnet', 'reverse', 'glass', 'boost', 'ice', 'cut'];
  for (const m of MODS) {
    const tr = buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === 'plafond'));
    for (const t of tr.tiles) if (t.v && t.t === 'straight') { t.s = m; t.p = m === 'glass' ? 100 : 120; }
    tr.version++;
    const sim = new Simulation(tr); sim.start(); const bot = new Autopilot(tr.path); bot.reset(sim.phys);
    let seen = 0;
    for (let i = 0; i < 6000; i++) {
      sim.step(bot.control(sim.phys)); assert.ok(fin(sim.phys), `${m} : non fini`);
      if (sim.phys.gSign < 0 && sim.phys.grounded && sim.phys.surfMod === m) seen++;
      if (sim.lost) sim.rewind();
      if (sim.logic.finished) break;
    }
    assert.ok(seen > 0 || m === 'glass', `${m} : jamais actif à l'envers`);
  }
});

console.log('Garde-fous généraux : aucune dérive, aucun gel');
test('circuits officiels avec verre, inversions, aimants, volant inversé, obstacles : 72 circuits × 4000 pas, rien de non fini, aucune voiture figée', () => {
  const rnd = lcg(3);
  const MODS = ['glass', 'flip', 'magnet', 'reverse', 'cut', 'boost', 'spring', 'bounce', 'conveyor', 'gravity'];
  for (const d of BUILTIN_TRACKS) {
    const tr = buildBuiltin(d);
    for (const t of tr.tiles) { if (['start', 'finish', 'checkpoint'].includes(t.t)) continue; if (rnd() < 0.2) { const m = MODS[(rnd() * MODS.length) | 0]; t.s = m; t.p = m === 'glass' ? 20 + ((rnd() * 80) | 0) : 100 + ((rnd() * 100) | 0); } }
    const b = tr.bounds();
    for (let i = 0; i < 4; i++) tr.addDeco({ k: ['hammer', 'bumper', 'slider', 'spikes'][i], x: b.minX + rnd() * (b.maxX - b.minX), y: 0, z: b.minZ + rnd() * (b.maxZ - b.minZ), ry: rnd() * 6, s: 1, ph: rnd() });
    tr.version++;
    const sim = new Simulation(tr); sim.start();
    let still = 0, last = null;
    for (let i = 0; i < 4000; i++) {
      sim.step({ throttle: rnd() < 0.9, brake: rnd() < 0.08, steer: Math.sin(i / 37) * (rnd() < 0.3 ? 1 : 0.3) });
      assert.ok(fin(sim.phys), `${d.id} : état non fini au pas ${i}`);
      if (sim.lost || sim.phys.lost) sim.rewind();
      const p = sim.phys.pos;
      if (last && Math.abs(p.x - last.x) + Math.abs(p.y - last.y) + Math.abs(p.z - last.z) < 1e-5) still++; else still = 0;
      last = { x: p.x, y: p.y, z: p.z };
      assert.ok(still < 400, `${d.id} : voiture figée au pas ${i}`);
      if (sim.logic.finished) sim.start();
    }
  }
});

await finish('Tous les tests de la phase 2 (physique) passent.');
