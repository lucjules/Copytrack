// AUDIT 0.9.59 — physique : node tools/test-audit-physique.mjs   (npm test)
// Exploration aléatoire du VRAI moteur (Simulation : physique + règles de course + retours automatiques), à graines fixes : des circuits tirés au hasard (pièces, revêtements,
// options, pièces mobiles, obstacles, règles du niveau ; une seconde famille pour la gravité inversée : plaques d'inversion, plafonds, vrilles, murs), conduits par des commandes
// au hasard, le pilote automatique ou un mélange des deux, avec des retours au checkpoint au hasard. Invariants vérifiés à CHAQUE pas :
//   - aucune exception, aucune valeur non finie, aucune vitesse démesurée, aucun saut de position ;
//   - le rejeu des commandes enregistrées (GhostRunner, le code de la vérification serveur) donne exactement la même arrivée que la course en direct ;
//   - un point de retour a toujours le sens de gravité enregistré avec lui ;
//   - recommencer (Simulation.start) après une course équivaut, au bit près, à une simulation neuve (aucun état résiduel).
// L'exploration complète de l'audit (3 500 circuits, 21 millions de pas) est décrite dans docs/AUDIT-0.9.59.md ; ce fichier en garde un échantillon rapide.
// S'y ajoutent les défauts trouvés et corrigés (pilote automatique sur les rubans posés à l'envers) et le contrôle du sens des commandes sur toutes les pièces.
import assert from 'node:assert/strict';
import { scriptTrack, Track } from '../js/track.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { GhostRunner, InputRecorder, quantSteer } from '../js/replay.js';
import { PIECES, PIECE_ORDER, LEGACY_PIECE, LEGACY_SURFACE, isRibbon, arcParams, localToWorld, toLocal, sampleLocal } from '../js/pieces.js';
import { ribbonOf, frameLocal } from '../js/ribbons.js';
import { OBST } from '../js/obstacles.js';
import { DT, ROAD_HALF, RAIL_W } from '../js/constants.js';
import { test, finish } from './harness.mjs';

const lcg = (s) => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = (r, a) => a[Math.floor(r() * a.length)];
const SURF = 'ibjmdxwgoaneftrvpyc'.split('');

// ---- Circuits au hasard (langage de tools : voir scriptTrack) --------------------------------------------------------------------------
function plainScript(r) {
  const toks = ['start'];
  for (let i = 0, n = 6 + Math.floor(r() * 22); i < n; i++) {
    const x = r();
    let t;
    if (x < 0.30) t = 'S' + (1 + Math.floor(r() * 3));
    else if (x < 0.40) t = pick(r, ['R', 'L']);
    else if (x < 0.46) t = pick(r, ['RR', 'LL', 'HR', 'HL']);
    else if (x < 0.54) t = pick(r, ['U', 'D', 'UU', 'DD', 'GU', 'GD', 'UX', 'DX']);
    else if (x < 0.58) t = 'C';
    else if (x < 0.62) t = pick(r, ['O', 'OL', 'OB', 'OD']);
    else if (x < 0.65) t = pick(r, ['BR', 'BL', 'TB', 'CK', 'CKL']);
    else if (x < 0.68) t = 'TW TWB';
    else if (x < 0.71) t = 'QU WA' + (1 + Math.floor(r() * 2)) + ' CR';
    else if (x < 0.75) t = 'G' + (1 + Math.floor(r() * 2));
    else if (x < 0.78) t = pick(r, ['Y2', 'YL2']);
    else if (x < 0.82) t = pick(r, ['CVR', 'CVL', 'CBR', 'CBL']) + Math.floor(r() * 4);
    else if (x < 0.86) t = 'TI TM2 TO';
    else if (x < 0.90) t = 'P';
    else if (x < 0.93) t = pick(r, ['GR2', 'GC2']);
    else t = 'S';
    if (/^(S\d?|R|L|RR|LL|P|U|D)$/.test(t)) {
      if (r() < 0.45) { const s = pick(r, SURF); t += '.' + s + (r() < 0.5 && 'ibjdxwgtrvp'.includes(s) ? pick(r, [25, 30, 50, 100, 150, 200]) : ''); }
      if (r() < 0.08) t += '_';
      if (r() < 0.06) t += '#';
      if (r() < 0.05) t += pick(r, ['~', '=', '%']);
    }
    toks.push(t);
  }
  toks.push('S', 'finish');
  return toks.join(' ');
}
function gravityScript(r) {
  const toks = ['start', 'S'];
  const floor = () => { for (let i = 0, n = 1 + Math.floor(r() * 3); i < n; i++) toks.push(pick(r, ['S', 'S2', 'R', 'L', 'B', 'C', 'S.m', 'S.i', 'U', 'D', 'S#', 'S_', 'S.j', 'S.g40'])); };
  const ceil = () => { for (let i = 0, n = 1 + Math.floor(r() * 4); i < n; i++) toks.push(pick(r, ['S^', 'S2^', 'R^', 'L^', 'B^', 'C^', 'S.m^', 'S.v^', 'S.i^', 'S_^', 'S.b^', 'D^', 'U^', 'S.x^', 'S.y^', 'S.c^', 'S.r^', 'S.w^', 'S.t^', 'S.p^'])); };
  for (let i = 0, k = 2 + Math.floor(r() * 4); i < k; i++) {
    floor();
    const x = r();
    if (x < 0.4) { const h = pick(r, [3, 6, 8, 10]); toks.push('S.f', 'V' + h); ceil(); toks.push('S.f^', 'V-' + h); }
    else if (x < 0.65) { toks.push('TW.f'); ceil(); toks.push('TWB.f'); }
    else if (x < 0.8) toks.push('[tr01s]', 'S' + (1 + Math.floor(r() * 2)) + '<', pick(r, ['[tr10s]', '[tr13s] S^ [tr31s] S< [tr10s]']));
    else if (x < 0.9) toks.push('[tr02s]', 'S>', '[tr23s]', 'S^', '[tr32s]', 'S>', '[tr20s]');
    else toks.push('S.f', 'V8', 'S^', 'S.f^', 'V-8');
  }
  toks.push('S', 'finish');
  return toks.join(' ');
}
function randomTrack(seed, gravity) {
  const r = lcg(seed);
  for (let tries = 0; tries < 40; tries++) {
    try {
      const tr = scriptTrack('f' + seed, gravity ? gravityScript(r) : plainScript(r), gravity ? { l: 2 } : {});
      const rules = {};
      if (r() < 0.15) rules.veh0 = pick(r, ['moto', 'boat', 'glider']);
      if (r() < 0.1) rules.g0 = pick(r, [15, 40, 250]);
      if (r() < 0.1) rules.v0 = pick(r, [50, 150, 300]);
      if (r() < 0.1) rules.grip = pick(r, [25, 60, 150]);
      if (r() < 0.1) { rules.wind = pick(r, [30, 100]); rules.windDir = Math.floor(r() * 24) * 15; }
      if (r() < 0.1) { rules.rain = 100; rules.frost = 100; rules.gust = 100; rules.envSeed = Math.floor(r() * 999); }
      if (r() < 0.08) rules.pm = pick(r, ['arcade', 'sim']);
      if (r() < 0.05) rules.vm = 2;
      if (r() < 0.05) rules.offroad = 1;
      tr.setParams(rules);
      if (r() < 0.2) tr.laps = 2;
      const path = tr.path || [], kinds = Object.keys(OBST);
      for (let i = 0, no = Math.floor(r() * 10); i < no && path.length > 4; i++) {
        const q = path[2 + Math.floor(r() * (path.length - 3))];
        tr.addDeco({ k: pick(r, kinds), x: q[0] + (r() - 0.5) * 16, y: q[1] + (r() < 0.8 ? 0 : (r() - 0.5) * 4), z: q[2] + (r() - 0.5) * 16, ry: r() * 6.28, s: pick(r, [0.5, 1, 1, 1.5, 2.5]), ph: r() });
      }
      tr.version++;
      return tr;
    } catch { /* conflit de pièces : autre tirage */ }
  }
  return null;
}

// Une course au hasard sur un circuit ; renvoie les anomalies (texte) et quelques compteurs.
function explore(seed, gravity, steps) {
  const tr = randomTrack(seed, gravity);
  if (!tr) return null;
  const out = [], r = lcg(seed * 7919 + 13);
  const sim = new Simulation(tr); sim.start();
  const P = sim.phys, bot = tr.path && tr.path.length > 2 ? new Autopilot(tr.path) : null;
  if (bot) bot.reset(P);
  const rec = new InputRecorder();
  const policy = pick(r, ['bot', 'bot', 'botNoise', 'random', 'random', 'gas', 'gasSteer']);
  const seg = { n: 0, inp: { steer: 0, throttle: true, brake: false } };
  let pendingR = false, finished = false, n = 0, maxSpeed = 0;
  for (let i = 0; i < steps; i++) {
    if (sim.logic.finished) { finished = true; break; }
    let inp;
    if (policy === 'bot' && bot) inp = bot.control(P);
    else if (policy === 'gas') inp = { steer: 0, throttle: true, brake: false };
    else {
      if (seg.n <= 0) {
        seg.n = 5 + Math.floor(r() * 200);
        if (policy === 'gasSteer') seg.inp = { steer: pick(r, [-1, -0.3, 0, 0.3, 1]), throttle: true, brake: false };
        else if (policy === 'botNoise' && bot && r() < 0.6) seg.inp = null;
        else seg.inp = { steer: pick(r, [-1, -1, -0.5, 0, 0, 0, 0.5, 1, 1]), throttle: r() < 0.75, brake: r() < 0.2 };
        if (r() < 0.04) pendingR = true;
      }
      seg.n--;
      inp = seg.inp || bot.control(P);
    }
    inp = { steer: quantSteer(inp.steer), throttle: !!inp.throttle, brake: !!inp.brake };
    if (pendingR) { sim.rewind(); if (bot) bot.reset(P); const want = sim.logic.respawn.gs < 0 ? -1 : 1; if (P.gSign !== want) out.push(`pas ${i} : gravité ${P.gSign} après le retour, ${want} attendue`); }
    rec.push(inp, pendingR); pendingR = false;
    const px = P.pos.x, py = P.pos.y, pz = P.pos.z, wasRib = !!P.rib;
    try { sim.step(inp); } catch (e) { out.push(`pas ${i} : exception ${String(e && e.message)}`); break; }
    n++;
    const p = P.pos, v = P.vel;
    if (![p.x, p.y, p.z, v.x, v.y, v.z, P.yaw, P.omega, P.pitch, P.steer].every(Number.isFinite)) { out.push(`pas ${i} : état non fini`); break; }
    if (P.ev.invalid) out.push(`pas ${i} : état physique déclaré incohérent (ev.invalid)`);
    const sp = P.speed; if (sp > maxSpeed) maxSpeed = sp;
    if (sp > 230) out.push(`pas ${i} : vitesse démesurée ${sp.toFixed(0)} m/s`);
    const jump = Math.hypot(p.x - px, p.y - py, p.z - pz);
    if (jump > 4 + sp * DT * 1.5 && !wasRib && !P.rib) out.push(`pas ${i} : saut de position de ${jump.toFixed(1)} m`);
    if (sim.lost && !sim.logic.finished) { sim.rewind(); if (bot) bot.reset(P); }
  }
  if (finished) {
    const g = new GhostRunner(tr, { inputs: rec.encode() });
    for (let k = 0; !g.done && k < steps + 10; k++) g.step();
    if (!g.logic.finished || g.logic.steps !== sim.logic.steps || Math.fround(g.phys.pos.x) !== Math.fround(P.pos.x)) out.push(`rejeu différent de la course : ${g.logic.steps} pas (arrivé : ${g.logic.finished}) contre ${sim.logic.steps}`);
  }
  // Recommencer = simulation neuve (au bit près).
  const fresh = new Simulation(tr), rr = lcg(seed + 5); fresh.start(); sim.start();
  for (let j = 0; j < 400; j++) {
    const inp = { steer: quantSteer(rr() * 2 - 1), throttle: rr() < 0.8, brake: rr() < 0.15 };
    sim.step(inp); fresh.step(inp);
    if (sim.lost) sim.rewind();
    if (fresh.lost) fresh.rewind();
    const a = sim.phys, b = fresh.phys;
    if (!(Object.is(a.pos.x, b.pos.x) && Object.is(a.pos.y, b.pos.y) && Object.is(a.pos.z, b.pos.z) && Object.is(a.vel.x, b.vel.x) && Object.is(a.yaw, b.yaw) && a.gSign === b.gSign && sim.logic.steps === fresh.logic.steps)) { out.push(`recommencer ≠ simulation neuve au pas ${j}`); break; }
  }
  return { out, steps: n, finished, maxSpeed };
}

console.log('Exploration aléatoire : invariants à chaque pas');
for (const [gravity, label, from, count] of [[false, 'circuits variés (pièces, revêtements, obstacles, pièces mobiles, règles)', 1, 90], [true, 'gravité inversée (plaques d\'inversion, plafonds, vrilles, murs)', 1, 90]]) {
  test(`${count} ${label} × 3 000 pas : aucune exception, aucune valeur invalide, rejeu identique, recommencer = neuf`, () => {
    let made = 0, total = 0;
    const all = [];
    for (let s = from; s < from + count; s++) {
      const res = explore(s, gravity, 3000);
      if (!res) continue;
      made++; total += res.steps;
      for (const o of res.out) all.push(`graine ${s} : ${o}`);
    }
    assert.ok(made >= count * 0.9, `circuits construits : ${made}/${count}`);
    assert.ok(total > count * 1500, `pas simulés : ${total}`);
    assert.deepEqual(all.slice(0, 5), [], `${all.length} anomalie(s)`);
  });
}

console.log('Sens des commandes');
test('repère de TOUS les rubans (chaque type de pièce × endroit / envers × sol / mur gauche / mur droit) : droite = tangente × normale partout (le volant ne s\'inverse jamais)', () => {
  let n = 0;
  for (const type of PIECE_ORDER) {
    if (!PIECES[type] || LEGACY_PIECE[type] || LEGACY_SURFACE[type]) continue;
    for (const v of [0, 1]) for (const o of [0, 1, 2]) {
      let tile;
      try { tile = Track.normalize({ t: type, x: 0, z: 0, l: 20, r: 0, v, o }); } catch { continue; }
      if ((v && !tile.v) || (o && tile.o !== o) || !isRibbon(tile)) continue;
      const rib = ribbonOf(tile), F = {};
      for (let i = 0; i <= 40; i++) {
        frameLocal(rib, i / 40, F);
        const cx = F.ty * F.nz - F.tz * F.ny, cy = F.tz * F.nx - F.tx * F.nz, cz = F.tx * F.ny - F.ty * F.nx;      // tangente × normale
        const dot = cx * F.rx + cy * F.ry + cz * F.rz;
        assert.ok(dot > 0.999, `${type}${v ? '^' : ''}${o ? ' mur ' + o : ''} u=${(i / 40).toFixed(2)} : repère gauche (droite·(t×n) = ${dot.toFixed(3)})`);
        assert.ok(Math.abs(Math.hypot(F.nx, F.ny, F.nz) - 1) < 1e-6 && Math.abs(F.tx * F.nx + F.ty * F.ny + F.tz * F.nz) < 1e-6, `${type} : normale unitaire, perpendiculaire à la route`);
        n++;
      }
    }
  }
  assert.ok(n > 3000, `repères contrôlés : ${n}`);
});
test('volant à droite = la voiture tourne à SA droite : au sol, au plafond (plaque d\'inversion), au plafond dès le départ, après un retour au checkpoint et après avoir recommencé', () => {
  // Droite du pilote = avant × haut de la voiture (normale du contact). On mesure de quel côté part la trajectoire après 0,4 s de volant à droite.
  const turn = (sim) => {
    const P = sim.phys;
    const f0 = { x: -Math.sin(P.yaw), z: -Math.cos(P.yaw) }, up = P.n.y >= 0 ? 1 : -1;
    const right = { x: -f0.z * up, z: f0.x * up };                 // (f × n) pour n = (0, ±1, 0)
    const p0 = { x: P.pos.x, z: P.pos.z };
    for (let i = 0; i < 48; i++) sim.step({ steer: 1, throttle: true, brake: false });
    return (P.pos.x - p0.x) * right.x + (P.pos.z - p0.z) * right.z;
  };
  const cruise = (sim, n) => { for (let i = 0; i < n; i++) sim.step({ steer: 0, throttle: true, brake: false }); };
  // Sol.
  let sim = new Simulation(scriptTrack('s', 'start S8 finish')); sim.start(); cruise(sim, 150);
  assert.ok(turn(sim) > 0.3, 'au sol');
  // Plafond après une plaque d'inversion.
  const tr = scriptTrack('p', 'start B2 S.f V8 S8^ S.f^ V-8 S4 finish');
  sim = new Simulation(tr); sim.start();
  for (let i = 0; i < 1500 && !(sim.phys.gSign < 0 && sim.phys.grounded && sim.phys.n.y < -0.9); i++) sim.step({ steer: 0, throttle: true, brake: false });
  assert.ok(sim.phys.gSign < 0 && sim.phys.grounded, 'la voiture roule au plafond');
  cruise(sim, 30);
  assert.ok(turn(sim) > 0.3, 'au plafond, après la plaque d\'inversion');
  // Départ au plafond.
  sim = new Simulation(scriptTrack('c', 'start^ S8^ finish^', { l: 6 })); sim.start(); cruise(sim, 150);
  assert.ok(sim.phys.gSign < 0 && sim.phys.grounded);
  assert.ok(turn(sim) > 0.3, 'départ au plafond');
  // Après un retour au checkpoint (au plafond) puis après avoir recommencé.
  const tr2 = scriptTrack('k', 'start^ S2^ C^ S8^ finish^', { l: 6 });
  sim = new Simulation(tr2); sim.start();
  for (let i = 0; i < 2000 && !sim.logic.collected.size; i++) sim.step({ steer: 0, throttle: true, brake: false });
  assert.equal(sim.logic.collected.size, 1, 'checkpoint pris');
  cruise(sim, 60); sim.rewind();
  assert.equal(sim.phys.gSign, -1, 'gravité du checkpoint');
  cruise(sim, 150);
  assert.ok(turn(sim) > 0.3, 'après un retour au checkpoint au plafond');
  sim.start(); cruise(sim, 150);
  assert.ok(turn(sim) > 0.3, 'après avoir recommencé');
});

console.log('Pilote automatique');
test('rubans posés à l\'envers (virage relevé, tire-bouchon, looping au plafond) : le pilote braquait du mauvais côté et finissait plaqué contre la paroi pour toujours', () => {
  for (const script of ['start^ S2^ BR^ S2^ finish^', 'start^ S2^ BL^ S2^ finish^', 'start^ S2^ CK^ S2^ finish^', 'start^ S2^ O^ S2^ finish^', 'start^ S2^ TB^ S2^ finish^']) {
    const tr = scriptTrack('v', script, { l: 8 });
    const sim = new Simulation(tr); sim.start();
    const bot = new Autopilot(tr.path); bot.reset(sim.phys);
    let walls = 0, rib = 0;
    for (let i = 0; i < 120 * 30 && !sim.logic.finished; i++) {
      sim.step(bot.control(sim.phys));
      if (sim.phys.rib) { rib++; if (sim.phys.ev.wall > 0) walls++; }
      if (sim.lost) { sim.rewind(); bot.reset(sim.phys); }
    }
    assert.ok(rib > 100, script + ' : la pièce a bien été parcourue en mode ruban');
    assert.ok(sim.logic.finished, script + ' : le pilote termine');
    assert.ok(sim.logic.steps * DT < 12, `${script} : en ${(sim.logic.steps * DT).toFixed(1)} s`);
    assert.equal(walls, 0, script + ' : sans toucher la paroi');
  }
});

// ---- 0.9.59 (PHYS_VER 34) : états bloqués et points de retour ---------------------------------------------------------------------------------
const GAS = { steer: 0, throttle: true, brake: false }, IDLE = { steer: 0, throttle: false, brake: false };
// Une ligne droite de `n` cases, toutes avec le revêtement `surf` (réglage `p`), départ et arrivée aux bouts.
const lane = (n, surf, p, rules = {}) => {
  const tr = new Track('l');
  tr.add({ t: 'start', x: 0, z: n + 1, l: 0, r: 0 });
  for (let i = 0; i < n; i++) tr.add({ t: 'straight', x: 0, z: n - i, l: 0, r: 0, s: surf, p });
  tr.add({ t: 'finish', x: 0, z: 0, l: 0, r: 0 });
  tr.setParams(rules);
  return tr;
};
const parked = (tr, veh = 'car') => {
  const sim = new Simulation(tr); sim.start();
  const t = tr.tiles[2], P = sim.phys;
  P.place(t.x * 32 + 16, 0.4, t.z * 32 + 16, 0, 1); P.vehicle = veh; P.graceT = 0;
  return sim;
};

console.log('États bloqués par un coefficient physique');
test('ralentisseur (100 %, 150 %, 300 %) : une voiture, une moto ou un deltaplane ARRÊTÉ dessus repart sous les gaz et traverse au pas (avant : 0,1 m/s pour toujours)', () => {
  for (const p of [100, 150, 300]) for (const veh of ['car', 'moto', 'glider']) {
    const sim = parked(lane(6, 'slow', p), veh), P = sim.phys, z0 = P.pos.z;
    for (let i = 0; i < 120 * 6; i++) sim.step(GAS);
    assert.ok(z0 - P.pos.z > 12, `${veh}, ${p} % : avancé de ${(z0 - P.pos.z).toFixed(1)} m en 6 s`);
    assert.ok(P.speed > 2.5 && P.speed < 3.5, `${veh}, ${p} % : au pas (${P.speed.toFixed(2)} m/s)`);
  }
});
test('ralentisseur : au-dessus de 11 km/h il freine exactement comme avant ; sans les gaz la voiture s\'arrête et reste arrêtée ; un ralentisseur faible (30 %) ne change pas', () => {
  // Entrée à 30 m/s, gaz à fond, ralentisseur 150 % : décélération = 14 × 1,5 − poussée du moteur (formule d'origine, inchangée au-dessus du pas rampant).
  const sim = parked(lane(8, 'slow', 150)), P = sim.phys;
  P.vel.z = -30; P.fwdSpeed = 30;
  const v = [];
  for (let i = 0; i < 60; i++) { sim.step(GAS); v.push(P.speed); }
  const dec = (v[10] - v[40]) / (30 / 120);
  assert.ok(dec > 9 && dec < 12, `décélération ${dec.toFixed(1)} m/s² vers 25 m/s (21 de résistance − ~10,5 de poussée)`);
  // Sans les gaz : arrêt complet, et elle y reste (le pas rampant ne vient que du moteur).
  const s2 = parked(lane(6, 'slow', 100)), P2 = s2.phys;
  P2.vel.z = -8;
  for (let i = 0; i < 120 * 4; i++) s2.step(IDLE);
  assert.ok(P2.speed < 0.01, 'arrêtée sans les gaz');
  // 30 % : la poussée dépasse déjà la résistance, rien ne doit changer (la voiture accélère franchement).
  const s3 = parked(lane(6, 'slow', 30)), P3 = s3.phys;
  for (let i = 0; i < 120 * 2; i++) s3.step(GAS);
  assert.ok(P3.speed > 12, `ralentisseur 30 % : ${P3.speed.toFixed(1)} m/s après 2 s`);
});
test('bateau hors de l\'eau : il se traîne sur la route (avant : totalement immobile, 0,03 m/s) ; sur l\'eau rien ne change ; une voiture arrêtée dans l\'eau coule toujours', () => {
  for (const surf of ['', 'ice', 'magnet', 'drift']) {
    const sim = parked(lane(6, surf, 0), 'boat'), P = sim.phys, z0 = P.pos.z;
    for (let i = 0; i < 120 * 6; i++) sim.step(GAS);
    assert.ok(z0 - P.pos.z > 12 && P.speed > 2.5 && P.speed < 3.6, `bateau sur « ${surf || 'route'} » : ${(z0 - P.pos.z).toFixed(1)} m, ${P.speed.toFixed(2)} m/s`);
  }
  const w = parked(lane(8, 'water', 0), 'boat');
  for (let i = 0; i < 120 * 3; i++) w.step(GAS);
  assert.ok(w.phys.speed > 15, `bateau sur l'eau : ${w.phys.speed.toFixed(1)} m/s après 3 s`);
  const c = parked(lane(6, 'water', 0), 'car');
  let sank = false;
  for (let i = 0; i < 120 * 3 && !sank; i++) { c.step(GAS); sank = c.lost === 'sink'; }
  assert.ok(sank, 'la voiture arrêtée dans l\'eau coule (retour au checkpoint), comme avant');
});
test('nez dans la paroi d\'un ruban, presque à l\'arrêt (virage relevé, au sol et au plafond) : la paroi fait pivoter la voiture, elle repart et termine (avant : plaquée pour toujours, gaz à fond)', () => {
  // Un pilote qui braque du MAUVAIS côté sur le ruban (ce que faisait le pilote automatique avant sa correction) : il part droit dans la paroi et s'y plaque.
  // (virages relevés : plats le long de la route, il ne faut aucun élan pour en sortir ; un tire-bouchon ou un looping abordé à l'arrêt ne se remonte pas, c'est voulu)
  for (const script of ['start^ S2^ BR^ S2^ finish^', 'start^ S2^ BL^ S2^ finish^', 'start S2 BR S2 finish', 'start S2 BL S2 finish']) {
    const tr = scriptTrack('n', script, { l: 8 }), sim = new Simulation(tr); sim.start();
    const P = sim.phys, bot = new Autopilot(tr.path); bot.reset(P);
    let pinned = 0, i;
    for (i = 0; i < 120 * 60 && !sim.logic.finished; i++) {
      const c = bot.control(P);
      if (P.rib) c.steer = -c.steer;
      sim.step(c);
      if (P.rib && P.speed < 1.5 && Math.abs(P.rib.dl) > 10.5) pinned++;      // contre la paroi, presque à l'arrêt
      if (sim.lost) { sim.rewind(); bot.reset(P); }
    }
    assert.ok(pinned > 20, script + ' : la voiture a bien été plaquée contre la paroi, presque à l\'arrêt (le cas visé) : ' + pinned + ' pas');
    assert.ok(sim.logic.finished, `${script} : elle s'est dégagée et a terminé (${(i / 120).toFixed(1)} s)`);
  }
});
test('bordure intérieure d\'un virage montant serré (inclinaison 2 et 4) : une voiture qui glisse de côté vers elle ne la traverse plus (300 cas ; avant : 13 traversées, jusqu\'à 2,8 m au-delà)', () => {
  const L = {}, S = {};
  let crossed = 0, total = 0;
  for (const type of ['cv4', 'cvL4', 'cv2', 'cvd4', 'cv1']) for (const ang of [0.15, 0.3, 0.5, 0.7, 0.85]) for (const speed of [3, 6, 10, 16]) for (const head of [-0.3, 0, 0.3]) {
    const tr = new Track('r');
    tr.add({ t: 'start', x: 5, z: 5, l: 0, r: 0 });
    const tile = tr.add({ t: type, x: 0, z: 0, l: 2, r: 0 });
    const P = PIECES[type], a = arcParams(P), mir = P.mirror < 0 ? -1 : 1;
    const th = Math.PI + (Math.PI / 2) * ang, rad = a.R - 8;                // 8 m à l'intérieur de l'axe : à 4 m de la bordure intérieure
    const w = localToWorld(tile, mir * (a.cx + rad * Math.cos(th)), a.cz + rad * Math.sin(th)), c = localToWorld(tile, mir * a.cx, a.cz);
    const sim = new Simulation(tr); sim.start();
    const ph = sim.phys, toC = Math.atan2(-(c.x - w.x), -(c.z - w.z)), yaw = toC + Math.PI / 2 + head;      // le long de la route, glissant de côté vers l'intérieur
    toLocal(tile, w.x, w.z, L); sampleLocal(tile, L.lx, L.lz, S);
    ph.place(w.x, S.h, w.z, yaw, 1); ph.graceT = 0;
    ph.vel.x = -Math.sin(toC) * speed; ph.vel.z = -Math.cos(toC) * speed;
    total++;
    let out = false;
    for (let i = 0; i < 240 && !sim.lost; i++) {
      sim.step(GAS);
      toLocal(tile, ph.pos.x, ph.pos.z, L); sampleLocal(tile, L.lx, L.lz, S);
      if (S.inFootprint && S.d < -(ROAD_HALF + RAIL_W) - 0.2 && ph.pos.y > S.h - 2.5) out = true;
    }
    if (out) crossed++;
  }
  assert.equal(total, 300);
  assert.equal(crossed, 0, `${crossed} traversée(s) de la bordure intérieure`);
});

console.log('Points de retour hors de la route');
test('checkpoint aérien franchi avant le premier relevé de position (vitesse de départ 300 km/h, anneau au-dessus d\'un vide) : le point de retour reste le DÉPART, pas le vide sous l\'anneau (boucle de retours sans fin)', () => {
  const tr = scriptTrack('a', 'start GC2 S6 finish');
  tr.setParams({ v0: 300 });
  const sim = new Simulation(tr); sim.start();
  let cp = false;
  for (let i = 0; i < 120 && !cp; i++) { const ev = sim.step(GAS); cp = !!ev && ev.type === 'checkpoint'; if (sim.lost) sim.rewind(); }
  assert.ok(cp, 'l\'anneau est franchi');
  assert.equal(sim.logic.lastGround, null, 'aucune position au sol relevée avant l\'anneau (le cas visé)');
  sim.rewind();
  const P = sim.phys;
  assert.equal(P.surfType, 'road', 'la voiture réapparaît sur une route');
  assert.equal(sim.logic.collected.size, 0, 'l\'anneau reste à repasser');
  let lost = 0;
  for (let i = 0; i < 240; i++) { sim.step(IDLE); if (sim.lost) lost++; }
  assert.equal(lost, 0, 'aucun rappel automatique : plus de boucle');
  // Un anneau posé AU-DESSUS d'une route garde son centre pour point de retour (comportement d'origine).
  const t2 = new Track('b');
  t2.add({ t: 'start', x: 0, z: 3, l: 0, r: 0 }); t2.add({ t: 'straight', x: 0, z: 2, l: 0, r: 0 }); t2.add({ t: 'cpRing', x: 0, z: 2, l: 0, r: 0 });
  t2.add({ t: 'straight', x: 0, z: 1, l: 0, r: 0 }); t2.add({ t: 'finish', x: 0, z: 0, l: 0, r: 0 });
  t2.setParams({ v0: 300 });
  const s2 = new Simulation(t2); s2.start(); s2.logic.lastGround = null;
  let ok = false;
  for (let i = 0; i < 120 && !ok; i++) { const ev = s2.step(GAS); if (s2.logic.lastGround) s2.logic.lastGround = null; ok = !!ev && ev.type === 'checkpoint'; }
  assert.ok(ok);
  assert.ok(Math.abs(s2.logic.respawn.z - (2 * 32 + 16)) < 0.01 && Math.abs(s2.logic.respawn.x - 16) < 0.01, 'anneau au-dessus d\'une route : son centre');
});
test('nouveau tour franchi en l\'air à côté de la route (au-delà de la bordure) : le point de retour est ramené sur la chaussée (avant : sur le terrain, rappel sans fin)', () => {
  const tr = new Track('t');
  tr.add({ t: 'start', x: 0, z: 2, l: 2, r: 0 }); tr.add({ t: 'finish', x: 0, z: 1, l: 2, r: 0 }); tr.add({ t: 'straight', x: 0, z: 0, l: 2, r: 0 });
  tr.laps = 2;
  const sim = new Simulation(tr); sim.start();
  const P = sim.phys, h = 2 * 6.4 + 0.4;
  // La voiture vole par-dessus la bordure droite, 13 m à droite de l'axe, et franchit la ligne.
  P.pos.x = 16 + 13; P.pos.y = h + 2.5; P.pos.z = 1 * 32 + 20; P.grounded = false; P.vel.x = 0; P.vel.y = 0; P.vel.z = -30;
  let lap = null;
  for (let i = 0; i < 30 && !lap; i++) { const ev = sim.step(IDLE); if (ev && ev.type === 'lap') lap = ev; }
  assert.ok(lap, 'tour compté (la ligne se franchit jusqu\'à 1,5 m au-delà du bord)');
  assert.ok(Math.abs(sim.logic.respawn.x - 16) <= 12 - 1.2 + 1e-9, `point de retour sur la chaussée (x = ${sim.logic.respawn.x.toFixed(2)})`);
  sim.rewind();
  assert.equal(P.surfType, 'road', 'réapparaît sur la route');
  assert.ok(Math.abs(P.pos.y - h) < 0.01, 'à la hauteur de la route (avant : 13 m plus bas, sur le terrain)');
  let lost = 0;
  for (let i = 0; i < 240; i++) { sim.step(IDLE); if (sim.lost) lost++; }
  assert.equal(lost, 0, 'aucun rappel automatique');
  // Franchie sur la chaussée : le point de retour est la position de la voiture, comme avant.
  const s2 = new Simulation(tr); s2.start();
  s2.phys.pos.x = 16 + 5; s2.phys.pos.z = 1 * 32 + 20; s2.phys.vel.z = -30;
  let lap2 = null;
  for (let i = 0; i < 30 && !lap2; i++) { const ev = s2.step(IDLE); if (ev && ev.type === 'lap') lap2 = ev; }
  assert.ok(lap2 && Math.abs(s2.logic.respawn.x - s2.phys.pos.x) < 0.5, 'sur la route : position de la voiture');
});

finish('Tous les tests de l\'audit de la physique passent.');
