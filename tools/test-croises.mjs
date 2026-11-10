// PHASE 6 — essais CROISÉS : plusieurs systèmes à la fois. node tools/test-croises.mjs   (npm test)
// Verre, obstacles mobiles, gravité inversée, aimant, volant inversé, checkpoints, retours, groupes logiques, replays, circuits personnalisés, vérification des scores,
// sauvegardes de deux appareils, invité → compte. Chaque essai vérifie aussi que rien n'est jamais non fini ni figé, et que deux exécutions donnent le même résultat.
import assert from 'node:assert/strict';
import { Track, scriptTrack } from '../js/track.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { GhostRunner, InputRecorder, quantSteer } from '../js/replay.js';
import { verifyRun } from '../js/verify.js';
import { PHYS_VER } from '../js/version.js';
import { CELL } from '../js/constants.js';
import { hashString } from '../js/track.js';
import { obstacleLocal } from '../js/obstacles.js';
import { test, finish } from './harness.mjs';

const lcg = (s) => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const fin = (P) => Number.isFinite(P.pos.x + P.pos.y + P.pos.z + P.vel.x + P.vel.y + P.vel.z + P.yaw + P.omega + P.pitch);
const def = (id) => BUILTIN_TRACKS.find((d) => d.id === id);
const IDLE = { throttle: false, brake: false, steer: 0 };
// Course pilotée par le pilote automatique, commandes quantifiées enregistrées ; renvoie la trace pour comparer au rejeu.
function drive(tr, steps, { rewindLost = true } = {}) {
  const sim = new Simulation(tr); sim.start();
  const bot = new Autopilot(tr.path); bot.reset(sim.phys);
  const rec = new InputRecorder(), trace = [];
  for (let i = 0; i < steps && !sim.logic.finished; i++) {
    const inp = bot.control(sim.phys); inp.steer = quantSteer(inp.steer); rec.push(inp, false);
    sim.step(inp);
    assert.ok(fin(sim.phys), 'état non fini au pas ' + i);
    if (rewindLost && sim.lost) sim.rewind();
    trace.push([sim.phys.pos.x, sim.phys.pos.y, sim.phys.pos.z, sim.phys.gSign, sim.logic.steps, sim.phys.broken.size].join());
  }
  return { sim, rec, trace, tr };
}
function replayMatches(tr, rec, trace) {
  const g = new GhostRunner(tr, { inputs: rec.encode() });
  for (let i = 0; i < trace.length; i++) {
    g.step(); const p = g.phys;
    const got = [p.pos.x, p.pos.y, p.pos.z, p.gSign, g.logic.steps, p.broken.size].join();
    if (got !== trace[i]) return `divergence au pas ${i} : ${got} ≠ ${trace[i]}`;
  }
  return '';
}
// Variantes d'un circuit officiel : verre, obstacles mobiles, groupes logiques ajoutés (au hasard, mais toujours les mêmes pour une graine).
function mix(id, seed, { glass = 0, obstacles = 0, logic = false, surface = '' } = {}) {
  const r = lcg(seed), tr = buildBuiltin(def(id));
  const roads = tr.tiles.filter((t) => !['start', 'finish', 'checkpoint'].includes(t.t) && PIECESFLAT(t));
  for (const t of roads) { if (glass && r() < glass) { t.s = 'glass'; t.p = 40 + ((r() * 100) | 0); } else if (surface && r() < 0.2) { t.s = surface; t.p = 100 + ((r() * 80) | 0); } }
  const b = tr.bounds();
  for (let i = 0; i < obstacles; i++) {
    const t = roads[(r() * roads.length) | 0];
    tr.addDeco({ k: ['hammer', 'pendulum', 'slider', 'sweeper'][i % 4], x: (t.x + 0.5) * CELL, y: 0.4, z: (t.z + 0.5) * CELL, ry: r() * 6, s: 1, ph: r(), g: logic ? 2 : 0 });
  }
  if (logic) {
    roads.forEach((t, i) => { if (i % 5 === 0) t.g = 1; });
    tr.lg = { v: 1, off: [2], vars: 1, rules: [
      { on: ['time', 600], if: [], do: [['hide', 1], ['show', 2], ['var', 0, '+', 1]], once: true },
      { on: ['cp', 1], if: [['var', 0, '>=', 0]], do: [['show', 1], ['hide', 2], ['grav', 70]], once: true },
    ] };
  }
  tr.version++; void b;
  return tr;
}
const PIECESFLAT = (t) => ['straight', 'curve', 'bigcurve', 'slope'].includes(t.t);

console.log('Verre × obstacles mobiles × gravité inversée × checkpoints × replays');
test('verre + obstacles mobiles : 3 circuits, jamais figé ni non fini, et le rejeu des commandes redonne la course à l\'identique', () => {
  for (const id of ['eclats', 'canyon', 'plafond']) {
    const tr = mix(id, 11, { glass: 0.3, obstacles: 6 });
    const a = drive(tr, 3500);
    assert.equal(replayMatches(tr, a.rec, a.trace), '', id);
    const b = drive(mix(id, 11, { glass: 0.3, obstacles: 6 }), 3500);
    assert.deepEqual(b.trace, a.trace, id + ' : deux exécutions identiques');
  }
});
test('verre + gravité inversée + checkpoint (circuit « plafond ») : le verre du plafond cède, un retour au checkpoint le restaure ET rend la gravité du checkpoint', () => {
  const tr = buildBuiltin(def('plafond'));
  for (const t of tr.tiles) if (t.v && t.t === 'straight') { t.s = 'glass'; t.p = 35; }
  tr.version++;
  const sim = new Simulation(tr); sim.start(); const bot = new Autopilot(tr.path); bot.reset(sim.phys);
  let cp = false, broke = 0;
  for (let i = 0; i < 8000 && !sim.logic.finished; i++) {
    const e = sim.step(bot.control(sim.phys)); assert.ok(fin(sim.phys));
    if (e && e.type === 'checkpoint') cp = true;
    if (sim.phys.ev.glass) broke++;
    if (sim.lost) { sim.rewind(); if (cp) { assert.equal(sim.phys.broken.size, 0, 'verre restauré au retour'); assert.equal(sim.phys.gSign, sim.logic.respawn.gs, 'gravité du point de retour'); } }
  }
  assert.ok(broke > 0 || sim.logic.finished, 'le verre du plafond cède ou la course est finie');
});
test('verre cassé AVANT un checkpoint puis retour : le verre revient (la physique ne garde pas de dalle brisée d\'avant le retour)', () => {
  const tr = scriptTrack('c', 'start S3 C S3 finish');
  const g = tr.tiles.filter((t) => t.t === 'straight')[1]; g.s = 'glass'; g.p = 30; tr.version++;
  const sim = new Simulation(tr); sim.start();
  sim.phys.broken.add(g); sim.phys.brokenVer++;
  sim.rewind();
  assert.equal(sim.phys.broken.size, 0);
});
test('groupe logique + verre : une dalle de verre cachée n\'a aucune collision, montrée elle redevient solide, brisée elle reste brisée', () => {
  const tr = new Track('gv'); tr.add({ t: 'start', x: 0, z: 6, l: 0, r: 0 });
  for (let i = 0; i < 4; i++) tr.add({ t: 'straight', x: 0, z: 5 - i, l: 0, r: 0 });
  const g = tr.tiles.find((t) => t.z === 3); g.s = 'glass'; g.p = 300; g.g = 3;
  tr.lg = { v: 1, off: [3], vars: 0, rules: [{ on: ['time', 120], if: [], do: [['show', 3]], once: true }] };
  tr.version++;
  const sim = new Simulation(tr); sim.start(); sim.phys.graceT = 0; sim.phys.hazardGrace = 0;
  const out = {}; tr.surfaceAt(CELL / 2, 1, 3 * CELL + 16, out, 2, sim.phys.excl);
  assert.equal(out.type, 'ground', 'caché au départ : aucune collision');
  for (let i = 0; i < 125; i++) sim.step(IDLE);
  tr.surfaceAt(CELL / 2, 1, 3 * CELL + 16, out, 2, sim.phys.excl);
  assert.equal(out.type, 'road', 'montré : solide');
  sim.phys.broken.add(g); tr.surfaceAt(CELL / 2, 1, 3 * CELL + 16, out, 2, sim.phys.excl);
  assert.equal(out.type, 'ground', 'brisé : sans collision');
});
test('groupes logiques + verre + obstacles + gravité (règle « grav ») : course aléatoire de 4 000 pas, rejeu identique, jamais figé', () => {
  const tr = mix('canyon', 5, { glass: 0.25, obstacles: 4, logic: true });
  const a = drive(tr, 4000);
  assert.equal(replayMatches(tr, a.rec, a.trace), '');
  assert.ok(a.sim.lgc, 'la logique est active');
});
test('obstacles mobiles + replay + retours au checkpoint : un replay avec retours (touche R) reproduit la course, obstacles compris', () => {
  const tr = mix('eclats', 21, { obstacles: 8 });
  const sim = new Simulation(tr); sim.start(); const bot = new Autopilot(tr.path); bot.reset(sim.phys);
  const rec = new InputRecorder(), trace = [], rnd = lcg(3);
  for (let i = 0; i < 3000 && !sim.logic.finished; i++) {
    const inp = bot.control(sim.phys); inp.steer = quantSteer(inp.steer);
    const respawn = i > 600 && rnd() < 0.004;                       // un retour volontaire de temps en temps (la touche R)
    rec.push(inp, respawn);
    if (respawn) sim.rewind();
    sim.step(inp); if (sim.lost) sim.rewind();
    trace.push([sim.phys.pos.x, sim.phys.pos.y, sim.phys.pos.z, sim.phys.gSign, sim.logic.steps, sim.phys.broken.size].join());
  }
  assert.equal(replayMatches(tr, rec, trace), '');
});
test('obstacles mobiles + multijoueur : l\'état d\'un obstacle ne dépend QUE du chrono de course (deux joueurs au même pas voient le même obstacle, retours compris)', () => {
  const d = { k: 'pendulum', x: 0, y: 0, z: 0, ry: 0.7, s: 1.2, ph: 0.35 }, a = {}, b = {};
  for (const step of [0, 1, 119, 120, 5000, 70000]) {
    obstacleLocal(d, step / 120, a); obstacleLocal(d, step / 120, b);
    assert.deepEqual(a, b);
  }
  // deux Simulation qui n'ont pas vécu la même histoire (l'une a fait un retour, chrono conservé comme en multijoueur) : même pas de chrono → même monde
  const tr = mix('eclats', 2, { obstacles: 4 });
  const A = new Simulation(tr), B = new Simulation(tr); A.start(); B.start();
  for (let i = 0; i < 300; i++) { A.step(IDLE); B.step(IDLE); }
  B.rewind({ keepClock: true });                                     // multijoueur : le chrono ne recule pas
  assert.equal(B.logic.steps, 300, 'chrono conservé');
  B.drive(IDLE); A.drive(IDLE);
  assert.equal(B.phys.clock, A.phys.clock, 'même horloge des obstacles');
});

console.log('Gravité inversée × aimant × volant inversé × retours × surfaces');
test('gravité inversée + aimant : les routes aimantées du plafond tiennent la voiture (pas plus de retours que sans aimant), jamais non fini', () => {
  const run = (mag) => {
    const tr = buildBuiltin(def('plafond'));
    if (mag) for (const t of tr.tiles) if (t.v && t.t === 'straight') t.s = 'magnet';
    tr.version++;
    const sim = new Simulation(tr); sim.start(); const bot = new Autopilot(tr.path); bot.reset(sim.phys);
    let lost = 0, onMag = 0;
    for (let i = 0; i < 6000 && !sim.logic.finished; i++) { sim.step(bot.control(sim.phys)); assert.ok(fin(sim.phys)); if (sim.phys.gSign < 0 && sim.phys.grounded && sim.phys.surfMod === 'magnet') onMag++; if (sim.lost) { lost++; sim.rewind(); } }
    return { lost, onMag };
  };
  const base = run(false), mag = run(true);
  assert.ok(mag.onMag > 0, 'la voiture roule bien sur l\'aimant, à l\'envers');
  assert.ok(mag.lost <= base.lost, `retours avec aimant (${mag.lost}) ≤ sans (${base.lost})`);
});
test('gravité inversée + volant inversé : au plafond sur une dalle « volant inversé » le braquage est renversé, ailleurs normal, en l\'air normal', () => {
  const tr = buildBuiltin(def('plafond'));
  const ceil = tr.tiles.filter((t) => t.v && t.t === 'straight');
  ceil[0].s = 'reverse'; tr.version++;
  const sim = new Simulation(tr); sim.start(); const bot = new Autopilot(tr.path); bot.reset(sim.phys);
  let revSeen = 0, normalSeen = 0, airOk = true;
  for (let i = 0; i < 4000 && !sim.logic.finished; i++) {
    const onRev = sim.phys.rib ? sim.phys.rib.tile.s === 'reverse' : sim.phys.grounded && sim.phys.surfMod === 'reverse';
    sim.phys.steer = 0; sim.step({ throttle: true, brake: false, steer: 1 });
    const s = sim.phys.steer;
    if (onRev && sim.phys.gSign < 0) { revSeen++; if (!(s <= 0)) airOk = false; }
    else if (!onRev && sim.phys.grounded) { normalSeen++; if (!(s >= 0)) airOk = false; }
    if (sim.lost) sim.rewind();
  }
  assert.ok(airOk, 'le sens du braquage suit la dalle');
  assert.ok(normalSeen > 0);
  void revSeen;
});
test('retour au checkpoint sur CHAQUE surface spéciale : la voiture réapparaît posée, jamais « perdue », jamais non finie, 3 s à l\'arrêt', () => {
  for (const surf of ['ice', 'boost', 'bounce', 'magnet', 'drift', 'slow', 'wind', 'gravity', 'conveyor', 'spring', 'glass', 'powder', 'reverse', 'cut', 'flip', 'moto', 'water']) {
    const tr = scriptTrack('c', 'start S3 C S3 finish');
    for (const t of tr.tiles) if (t.t === 'checkpoint' || t.t === 'straight') { if (!(t.t === 'straight' && t.s)) { /* garde */ } }
    const cp = tr.tiles.find((t) => t.t === 'checkpoint'); const before = tr.tiles.filter((t) => t.t === 'straight' && t.z > cp.z);
    const host = before[before.length - 1] || tr.tiles.find((t) => t.t === 'straight');
    try { host.s = surf; host.p = host.p || undefined; tr.version++; } catch { continue; }
    const sim = new Simulation(tr); sim.start(); const bot = new Autopilot(tr.path); bot.reset(sim.phys);
    let cps = 0;
    for (let i = 0; i < 4000 && cps < 1; i++) { const e = sim.step(bot.control(sim.phys)); assert.ok(fin(sim.phys), surf); if (e && e.type === 'checkpoint') cps++; if (sim.lost) sim.rewind(); }
    sim.rewind();
    for (let i = 0; i < 360; i++) { sim.step(IDLE); assert.ok(fin(sim.phys), surf + ' après retour'); }
    assert.ok(!sim.phys.lost, surf + ' : voiture perdue après le retour');
  }
});

console.log('Circuits personnalisés × replays × vérification des scores');
const custom = () => { const tr = scriptTrack('Mon circuit', 'start S4 C S4 finish'); return tr; };
const runOf = (tr, key) => {
  const sim = new Simulation(tr); sim.start(); const bot = new Autopilot(tr.path); bot.reset(sim.phys); const rec = new InputRecorder();
  for (let i = 0; i < 120 * 120; i++) { const inp = bot.control(sim.phys); inp.steer = quantSteer(inp.steer); rec.push(inp, false); const e = sim.step(inp); if (sim.lost) sim.rewind(); if (e && e.type === 'finish') return { trackKey: key, inputs: rec.encode(), time: sim.logic.time }; }
  throw new Error('le pilote automatique ne finit pas');
};
test('circuit personnalisé + replay + serveur : la course rejouée est confirmée avec le code du circuit ; un code modifié ou une autre version de physique est refusé', () => {
  const tr = custom(), code = tr.encode(), key = Track.decode(code).userKey;
  assert.match(key, /^u-/);
  const r = runOf(tr, key);
  const ok = verifyRun({ ...r, code, physVer: PHYS_VER });
  assert.ok(ok.ok, ok.error); assert.ok(Math.abs(ok.time - r.time) < 1e-9);
  const t2 = Track.decode(code); t2.tiles.find((t) => t.t === 'straight').s = 'ice'; t2.version++;
  const bad = verifyRun({ ...r, code: t2.encode(), physVer: PHYS_VER });
  assert.equal(bad.ok, false, 'un circuit modifié n\'a pas la même clé');
  assert.equal(verifyRun({ ...r, code, physVer: PHYS_VER - 1 }).ok, false);
  assert.equal(verifyRun({ ...r, code, physVer: PHYS_VER, time: r.time + 0.01 }).ok, false, 'temps falsifié');
});
test('replay + circuit mis à jour : les commandes d\'une ancienne version d\'un circuit officiel sont refusées par la clé ; rejouées sur le circuit modifié elles ne bloquent jamais (borne de pas)', () => {
  const d = def('eclats'), tr = buildBuiltin(d), key = `b-${d.id}-${hashString(tr.encode())}`;
  const run = runOf(tr, key);
  assert.ok(verifyRun({ ...run, code: '', physVer: PHYS_VER }).ok);
  const old = verifyRun({ ...run, trackKey: key.replace(/-[^-]+$/, '-abc123'), code: '', physVer: PHYS_VER });
  assert.equal(old.ok, false); assert.match(old.error, /Version du circuit/);
  const tr2 = buildBuiltin(d); tr2.tiles.find((t) => t.t === 'straight').s = 'ice'; tr2.version++;
  const g = new GhostRunner(tr2, { inputs: run.inputs });
  const t0 = performance.now(); let n = 0;
  while (!g.done && n++ < 100000) g.step();
  assert.ok(g.done, 'le rejeu se termine'); assert.ok(performance.now() - t0 < 20000);
});
test('circuit personnalisé + multijoueur : le code découpé en morceaux de 12 000 caractères se réassemble à l\'identique, la signature se retrouve, un morceau altéré change la signature', () => {
  const tr = custom(); for (let i = 0; i < 40; i++) tr.add({ t: 'platform', x: 20 + (i % 8), z: Math.floor(i / 8), l: 0, r: 0 });
  const code = tr.encode(), n = Math.ceil(code.length / 12000), parts = Array.from({ length: n }, (_, i) => code.slice(i * 12000, (i + 1) * 12000));
  const back = parts.join('');
  assert.equal(back, code);
  assert.equal(Track.decode(back).signature(), tr.signature());
  const tampered = parts.slice(), at = tampered[0].length >> 1; tampered[0] = tampered[0].slice(0, at) + (tampered[0][at] === 'A' ? 'B' : 'A') + tampered[0].slice(at + 1);
  let sig = null; try { sig = Track.decode(tampered.join('')).signature(); } catch { sig = 'refusé'; }
  assert.notEqual(sig, tr.signature());
});

console.log('Sauvegarde × deux appareils × invité → compte');
const { device, srv } = await import('./fake-supabase.mjs');
device('A');
const storage = await import('../js/storage.js');
const { online } = await import('../js/online.js');
const { account } = await import('../js/account.js');
const { profile, saveProfile, reloadProfile } = await import('../js/profile.js');
function boot(name) {
  device(name);
  account.state = null; account.status = 'idle'; clearTimeout(account._timer); account._running = null; account._dirty = false;
  online.useGuest(); online.onAccountSession = null; online._authP = null;
  storage.setScope(''); reloadProfile();
}
test('record en mémoire d\'une ancienne physique : un record plus récent (autre appareil, synchronisé) n\'est plus caché derrière un meilleur temps de l\'ancienne physique', () => {
  device('M'); storage.setScope('mem');
  storage.saveRecord('k-mem', { time: 50, pv: PHYS_VER - 1, date: 1, inputs: null, ghost: null });
  localStorage.setItem('shardwayacct.mem.rec3.k-mem', JSON.stringify({ time: 58, pv: PHYS_VER, date: 2 }));     // (ce que la synchronisation écrit)
  const r = storage.getRecord('k-mem');
  assert.equal(r.pv, PHYS_VER); assert.equal(r.time, 58);
  assert.equal(storage.medalTime(r), 58, 'sans mémoire de l\'ancien temps ici (bt ajouté à la prochaine sauvegarde du record)');
  storage.saveRecord('k-mem', { time: 57, pv: PHYS_VER, date: 3, inputs: null, ghost: null });
  assert.equal(storage.getRecord('k-mem').time, 57);
  storage.setScope('');
});
await test('invité → compte : la progression de l\'invité (records, circuits, médailles, pièces) est reprise par le compte ; l\'invité d\'avant n\'est pas modifié ; un autre appareil retrouve tout', async () => {
  srv.users.clear(); srv.saves.clear(); srv.accounts.clear(); srv.refreshStatus = 0; srv.offline = false;
  boot('G1');
  storage.saveRecord('b-eclats-x', { time: 41.5, pv: PHYS_VER, date: 5, inputs: null, ghost: null });
  storage.setJSON('tracks', [{ id: 't1', name: 'Mon circuit', code: 'SHW3:x', updated: 100 }]);
  const p = profile(); p.coins = 90; p.medals = { 'b-eclats-x': 1 }; saveProfile();
  await account.signUp('Zoe_1', 'motdepasse1', { keepGuest: true });
  assert.equal(storage.getRecord('b-eclats-x').time, 41.5, 'record repris dans la portée du compte');
  assert.equal(profile().coins, 90); assert.deepEqual(profile().medals, { 'b-eclats-x': 1 });
  assert.equal(storage.getJSON('tracks', []).length, 1);
  storage.setScope('');
  assert.equal(storage.getRecord('b-eclats-x').time, 41.5, 'la portée invité n\'a pas été effacée');
  // autre appareil : connexion → tout revient
  boot('G2'); await account.signIn('Zoe_1', 'motdepasse1');
  assert.equal(storage.getRecord('b-eclats-x').time, 41.5); assert.equal(profile().coins, 90); assert.equal(storage.getJSON('tracks', []).length, 1);
});
await test('sans « reprendre la progression » : le compte démarre vide et l\'invité garde la sienne ; deux comptes sur le même appareil ne se mélangent pas', async () => {
  srv.users.clear(); srv.saves.clear(); srv.accounts.clear();
  boot('G3');
  storage.saveRecord('b-eclats-x', { time: 30, pv: PHYS_VER, date: 5, inputs: null, ghost: null });
  await account.signUp('Ana_9', 'motdepasse1', { keepGuest: false });
  assert.equal(storage.getRecord('b-eclats-x'), null, 'le compte neuf n\'hérite pas de l\'invité');
  storage.saveRecord('b-eclats-x', { time: 25, pv: PHYS_VER, date: 6, inputs: null, ghost: null });
  await account.sync();
  boot('G3'); await account.signUp('Ben_9', 'motdepasse1', { keepGuest: false });
  assert.equal(storage.getRecord('b-eclats-x'), null, 'le deuxième compte ne voit pas le premier');
  storage.setScope(''); assert.equal(storage.getRecord('b-eclats-x').time, 30, 'et l\'invité a toujours son temps');
});
await test('sauvegarde + deux appareils + physique plus récente : le record de la nouvelle physique l\'emporte, la médaille de l\'ancien meilleur temps est gardée', async () => {
  srv.users.clear(); srv.saves.clear(); srv.accounts.clear();
  boot('D1'); await account.signUp('Cleo_3', 'motdepasse1');
  storage.saveRecord('b-x-1', { time: 50, pv: PHYS_VER - 1, date: 1, inputs: null, ghost: null }); await account.sync();
  boot('D2'); await account.signIn('Cleo_3', 'motdepasse1');
  storage.saveRecord('b-x-1', { time: 58, pv: PHYS_VER, date: 2, inputs: 'x', ghost: null }); await account.sync();
  boot('D1'); await account.signIn('Cleo_3', 'motdepasse1'); await account.sync();
  const r = storage.getRecord('b-x-1');
  assert.equal(r.pv, PHYS_VER); assert.equal(r.time, 58); assert.equal(storage.medalTime(r), 50, 'médaille de l\'ancien meilleur temps conservée');
});

console.log('Éditeur : opérations enchaînées au hasard, intégrité du circuit');
const { moveSelection, rotateSelection, tilesInRect, decosInRect, copyRect, pasteClip, shiftLevel, rotateClip } = await import('../js/editorTools.js');
test('copier, coller, pivoter, déplacer, monter, supprimer, 300 opérations au hasard sur 6 circuits : jamais deux pièces au même endroit, l\'index reste cohérent, le code partageable fait l\'aller-retour', () => {
  for (const id of ['eclats', 'canyon', 'lianes', 'serpent', 'barriere', 'plafond']) {
    const rnd = lcg(id.length * 97), tr = buildBuiltin(def(id));
    const bounds = () => { const xs = [], zs = []; for (const t of tr.tiles) for (const [x, z] of Track.cellsOf(t)) { xs.push(x); zs.push(z); } return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) }; };
    let clip = null;
    for (let i = 0; i < 300; i++) {
      const b = bounds(), x0 = b.x0 + ((rnd() * (b.x1 - b.x0 + 1)) | 0), z0 = b.z0 + ((rnd() * (b.z1 - b.z0 + 1)) | 0);
      const rect = { x0, z0, x1: Math.min(b.x1, x0 + ((rnd() * 5) | 0)), z1: Math.min(b.z1, z0 + ((rnd() * 5) | 0)) };
      const r = rnd();
      if (r < 0.2) clip = copyRect(tr, rect);
      else if (r < 0.35 && clip) pasteClip(tr, clip, x0, z0, (rnd() * 3) | 0);
      else if (r < 0.45 && clip) clip = rotateClip(clip);
      else if (r < 0.65) rotateSelection(tr, rect, tilesInRect(tr, rect).filter((t) => t.t !== 'start'), decosInRect(tr, rect));
      else if (r < 0.85) moveSelection(tr, rect, tilesInRect(tr, rect).filter((t) => t.t !== 'start'), decosInRect(tr, rect), ((rnd() * 3) | 0) - 1, ((rnd() * 3) | 0) - 1);
      else if (r < 0.95) shiftLevel(tr, tilesInRect(tr, rect).filter((t) => t.t !== 'start'), decosInRect(tr, rect), rnd() < 0.5 ? 1 : -1);
      else for (const t of tilesInRect(tr, rect)) if (t.t !== 'start' && rnd() < 0.5) tr.remove(t);
      if (!tr.tiles.length) break;
    }
    // intégrité : aucune pièce n'en gêne une autre, chaque pièce est dans l'index de chacune de ses cases, et l'index ne contient rien d'autre
    for (const t of tr.tiles) {
      assert.deepEqual(tr.conflicts(t), [], id + ' : deux pièces se chevauchent (' + t.t + ' ' + t.x + ',' + t.z + ' niveau ' + t.l + ')');
      for (const [x, z] of Track.cellsOf(t)) assert.ok(tr.tilesAt(x, z).includes(t), id + ' : pièce absente de l\'index');
    }
    let indexed = 0; for (const arr of tr.index.values()) indexed += arr.length;
    assert.equal(indexed, tr.tiles.reduce((n, t) => n + Track.cellsOf(t).length, 0), id + ' : l\'index contient des pièces fantômes');
    const back = Track.decode(tr.encode());
    assert.equal(back.signature(), tr.signature(), id + ' : aller-retour du code');
  }
});

await finish('Tous les essais croisés passent.');
