// Fantômes du haut des classements : format (pose, orientation, codec), enregistrement pendant le rejeu serveur, lecture venue du réseau (jamais de confiance),
// client en ligne. node tools/test-fantomes.mjs   (npm test)
import assert from 'node:assert/strict';
import * as THREE from '../js/vendor/three.module.min.js';
import { test, finish } from './harness.mjs';
import { GHOST_EVERY, GHOST_STRIDE, GHOST_VEHICLES, MAX_GHOST_FRAMES, poseQuat, parseGhost, encodeFloats, decodeFloats, ghostVehicleAt } from '../js/ghostFormat.js';
import { Simulation } from '../js/simulation.js';
import { GhostRunner, InputRecorder, quantSteer } from '../js/replay.js';
import { replayRun, verifyRun } from '../js/verify.js';
import { Autopilot } from '../js/autopilot.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { scriptTrack, hashString } from '../js/track.js';
import { online } from '../js/online.js';
import { PHYS_VER } from '../js/version.js';
import { backfill } from './backfill-ghosts.mjs';

console.log('Format');
test('orientation sans bibliothèque de rendu = orientation de la voiture fantôme du jeu (au sol, en pente, en l\'air, à l\'envers)', () => {
  const tmpM = new THREE.Matrix4();
  const reference = (p) => {      // RaceSession._ghostQuat (js/race/ghosts.js)
    const up = new THREE.Vector3(p.n.x, p.n.y, p.n.z);
    if (!p.grounded) up.set(0, 1, 0);
    const f = new THREE.Vector3(p.fwd.x, p.fwd.y, p.fwd.z);
    f.addScaledVector(up, -f.dot(up));
    if (f.lengthSq() < 1e-6) f.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    f.normalize();
    const right = new THREE.Vector3().crossVectors(f, up).normalize();
    tmpM.makeBasis(right, up, f.negate());
    return new THREE.Quaternion().setFromRotationMatrix(tmpM);
  };
  const norm = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };
  const poses = [
    { n: { x: 0, y: 1, z: 0 }, fwd: { x: 0, y: 0, z: -1 }, yaw: 0, grounded: true },
    { n: norm(0.3, 1, 0.1), fwd: norm(0.2, 0.3, -1), yaw: 0.3, grounded: true },
    { n: { x: 0, y: -1, z: 0 }, fwd: { x: 1, y: 0, z: 0 }, yaw: -1.57, grounded: true },       // plafond
    { n: norm(1, 0.2, 0), fwd: norm(0, 1, -0.1), yaw: 2, grounded: true },                      // mur
    { n: norm(0.5, 0.5, 0.2), fwd: norm(-1, 0.2, 0.3), yaw: 2.4, grounded: false },             // en l'air : le ciel est en haut
    { n: { x: 0, y: 1, z: 0 }, fwd: { x: 0, y: 1, z: 0 }, yaw: 0.7, grounded: true },           // avant vertical (repli sur le cap)
    { n: norm(0, 1, 0.01), fwd: { x: -1, y: 0, z: 0 }, yaw: Math.PI / 2, grounded: true },
  ];
  for (const [i, p] of poses.entries()) {
    const q = poseQuat(p), r = reference(p);
    const dot = Math.abs(q[0] * r.x + q[1] * r.y + q[2] * r.z + q[3] * r.w);       // q et -q sont la même rotation
    assert.ok(dot > 1 - 1e-6, `pose ${i} : ${dot}`);
    assert.ok(Math.abs(Math.hypot(...q) - 1) < 1e-6, 'unitaire');
  }
});
test('codec Float32 <-> base64 : aller-retour exact ; un format faux ou démesuré est refusé', () => {
  const a = new Float32Array([1.5, -2.25, 1e4, 0, 3.14159, -0.5, 7]);
  assert.deepEqual([...decodeFloats(encodeFloats(a))], [...a]);
  assert.equal(decodeFloats('!!!').length, 0); assert.equal(decodeFloats(null).length, 0);
  assert.equal(parseGhost(encodeFloats(a), [[3, 1]]).data.length, 7);
  assert.equal(parseGhost(encodeFloats(new Float32Array(8))), null, 'pas un multiple de 7');
  assert.equal(parseGhost(''), null);
  assert.equal(parseGhost(encodeFloats(new Float32Array([NaN, 0, 0, 0, 0, 0, 1]))), null, 'NaN');
  assert.equal(parseGhost(encodeFloats(new Float32Array([1e9, 0, 0, 0, 0, 0, 1]))), null, 'hors du monde');
  assert.equal(parseGhost(encodeFloats(new Float32Array((MAX_GHOST_FRAMES + 1) * GHOST_STRIDE))), null, 'trop long');
  assert.deepEqual(parseGhost(encodeFloats(a), [[9, 2], [3, 1], [1, 99], 'x', [1.5, 1], [2, -1]]).veh, [[3, 1], [9, 2]], 'véhicules : bornés, triés, jamais de valeur étrangère');
  assert.deepEqual(GHOST_VEHICLES, ['car', 'moto', 'boat', 'glider'], 'l\'ordre ne change jamais (enregistrements existants)');
  assert.equal(ghostVehicleAt([[3, 1], [9, 2]], 5), 'moto');
});

console.log('Enregistrement pendant le rejeu');
function recorded(def, { respawnAt = null } = {}) {
  const track = buildBuiltin(def), sim = new Simulation(track), rec = new InputRecorder();
  sim.start();
  const bot = new Autopilot(track.path, { latLimit: 56 * 0.8 });
  bot.reset(sim.phys);
  for (let i = 0; i < 120 * 150; i++) {
    const inp = bot.control(sim.phys);
    inp.steer = quantSteer(inp.steer);
    const rs = respawnAt === i;
    rec.push(inp, rs);
    if (rs) sim.rewind();
    const ev = sim.step(inp);
    if (sim.lost) sim.rewind();
    if (ev && ev.type === 'finish') return { key: `b-${def.id}-${hashString(track.encode())}`, inputs: rec.encode(), time: sim.logic.time };
  }
  throw new Error('pas d\'arrivée');
}
const RUN = recorded(BUILTIN_TRACKS[0]);
test('un rejeu avec fantôme : une pose tous les 4 pas, positions identiques à la simulation, temps inchangé', () => {
  const track = buildBuiltin(BUILTIN_TRACKS[0]);
  const plain = replayRun(track, RUN.inputs), withGhost = replayRun(buildBuiltin(BUILTIN_TRACKS[0]), RUN.inputs, { ghost: true });
  assert.equal(plain.ghost, undefined); assert.equal(withGhost.time, plain.time); assert.equal(withGhost.time, RUN.time);
  const data = decodeFloats(withGhost.ghost), n = data.length / GHOST_STRIDE;
  assert.equal(n, Math.floor(RUN.time * 120 / GHOST_EVERY), 'un échantillon tous les 4 pas, du pas 4 à l\'arrivée');
  // Relecture indépendante : la simulation avec les mêmes commandes passe aux mêmes endroits.
  const g = new GhostRunner(buildBuiltin(BUILTIN_TRACKS[0]), { inputs: RUN.inputs });
  let worst = 0, speedMax = 0;
  for (let i = 0; i < n; i++) {
    const steps = (i + 1) * GHOST_EVERY;
    g.seek(steps);
    const o = steps * 17;                       // (historique du GhostRunner : voir HIST_STRIDE)
    worst = Math.max(worst, Math.abs(g.hist[o] - data[i * 7]) + Math.abs(g.hist[o + 1] - data[i * 7 + 1]) + Math.abs(g.hist[o + 2] - data[i * 7 + 2]));
    if (i) speedMax = Math.max(speedMax, Math.hypot(data[i * 7] - data[(i - 1) * 7], data[i * 7 + 2] - data[(i - 1) * 7 + 2]));
  }
  assert.ok(worst < 1e-3, 'écart de position ' + worst);
  assert.ok(speedMax < 8, 'pas de saut entre deux poses (sans retour au checkpoint) : ' + speedMax.toFixed(2) + ' m');
  for (let i = 0; i < n; i += 25) assert.ok(Math.abs(Math.hypot(...data.subarray(i * 7 + 3, i * 7 + 7)) - 1) < 1e-4, 'orientation unitaire');
});
test('un retour au checkpoint efface les poses qui le suivent : le fantôme garde un échantillon par pas de CHRONO', () => {
  const r = recorded(BUILTIN_TRACKS[0], { respawnAt: 900 });
  const g = new GhostRunner(buildBuiltin(BUILTIN_TRACKS[0]), { inputs: r.inputs, ghost: true });
  while (!g.done && g.k < 120 * 150) g.step();
  assert.ok(g.logic.finished);
  const frames = g.gRec.length / GHOST_STRIDE;
  assert.equal(frames, Math.floor(g.logic.steps / GHOST_EVERY), 'comme la course en direct : le chrono revient au checkpoint, les poses aussi');
  assert.ok(g.k > g.logic.steps + 100, 'le retour a bien coûté des pas joués : ' + g.k + ' / ' + g.logic.steps);
});
test('les changements de véhicule sont enregistrés (plaque de transformation) et se relisent', () => {
  const tr = scriptTrack('v', 'start S3 S.o S4 finish');
  const rec = new InputRecorder();
  for (let i = 0; i < 120 * 40; i++) rec.push({ steer: 0, throttle: true, brake: false }, false);
  const g = new GhostRunner(tr, { inputs: rec.encode(), ghost: true });
  while (!g.done && g.k < 120 * 40) g.step();
  const r = g.ghostResult();
  assert.ok(r.data.length > 0);
  if (r.veh.length) for (const [f, id] of r.veh) { assert.ok(Number.isInteger(f) && f >= 0 && f < r.data.length / 7); assert.ok(id >= 0 && id < 4); }
});
test('verifyRun : sans withGhost rien ne change ; avec, le fantôme accompagne le temps vérifié', () => {
  const a = verifyRun({ trackKey: RUN.key, inputs: RUN.inputs, time: RUN.time, physVer: PHYS_VER });
  assert.equal(a.ok, true); assert.equal(a.ghost, undefined);
  const b = verifyRun({ trackKey: RUN.key, inputs: RUN.inputs, time: RUN.time, physVer: PHYS_VER, withGhost: true });
  assert.equal(b.ok, true); assert.ok(typeof b.ghost === 'string' && b.ghost.length > 1000); assert.ok(Array.isArray(b.ghostVeh));
  assert.ok(b.ghost.length < 400000, 'taille raisonnable : ' + b.ghost.length);
  assert.equal(verifyRun({ trackKey: RUN.key, inputs: RUN.inputs, time: RUN.time - 2, physVer: PHYS_VER, withGhost: true }).ok, false, 'temps falsifié : toujours refusé, pas de fantôme');
  const out = parseGhost(b.ghost, b.ghostVeh);
  assert.ok(out && out.data.length / 7 > 100);
});

console.log('Client en ligne');
await test('classement : le bouton fantôme vient de has_ghost ; sans l\'étape 7 on relit sans cette colonne', async () => {
  const calls = [];
  const orig = { _fetch: online._fetch, _count: online._count };
  online._count = async () => 3;
  online._fetch = async (path) => { calls.push(path); if (path.includes('has_ghost')) throw new Error('column scores.has_ghost does not exist'); return [{ time: 20, player: 'p1', players: { name: 'A' } }]; };
  try {
    const lb = await online.leaderboard('b-x-1', 26, 10);
    assert.equal(calls.length, 3, 'complète (titre + fantôme), sans titre, puis simple'); assert.ok(!calls[2].includes('has_ghost'));
    assert.equal(lb.top.length, 1);
    calls.length = 0;
    online._fetch = async (path) => { calls.push(path); return [{ time: 20, player: 'p1', has_ghost: true, players: { name: 'A' } }]; };
    assert.equal((await online.leaderboard('b-x-1', 26, 10)).top[0].has_ghost, true); assert.equal(calls.length, 1);
  } finally { Object.assign(online, orig); }
});
await test('online.ghost : la fonction get_ghost est appelée avec le rang et la physique ; réponse vide ou piégée : null', async () => {
  const orig = online._fetch; let seen;
  try {
    online._fetch = async (path, init) => { seen = { path, init }; return [{ name: 'Ana', time: 19.9, ghost: 'R0hPU1Q=', ghost_veh: [[3, 1]] }]; };
    const g = await online.ghost('b-x-1', 2, 26);
    assert.equal(seen.path, '/rest/v1/rpc/get_ghost'); assert.deepEqual(seen.init.body, { k: 'b-x-1', r: 2, pv: 26 });
    assert.deepEqual(g, { name: 'Ana', time: 19.9, ghost: 'R0hPU1Q=', veh: [[3, 1]] });
    online._fetch = async () => []; assert.equal(await online.ghost('b-x-1', 1, 26), null);
    online._fetch = async () => [{ name: 'X', time: 1, ghost: 42 }]; assert.equal(await online.ghost('b-x-1', 1, 26), null);
    online._fetch = async () => null; assert.equal(await online.ghost('b-x-1', 1, 26), null);
  } finally { online._fetch = orig; }
});

console.log('Outil de rattrapage');
await test('backfill-ghosts : rejoue les records du top 10 sans fantôme, range les poses, ignore ceux qui en ont, signale une course qui ne se rejoue plus', async () => {
  const def = BUILTIN_TRACKS[0];
  const rows = [
    { player: 'p1', time: RUN.time, inputs: RUN.inputs, has_ghost: false },
    { player: 'p2', time: RUN.time, inputs: RUN.inputs, has_ghost: true },
    { player: 'p3', time: RUN.time - 5, inputs: RUN.inputs, has_ghost: false },          // temps qui ne correspond pas : jamais de fantôme
  ];
  const calls = [];
  const fetchImpl = async (u, init = {}) => {
    calls.push({ u: String(u), method: init.method || 'GET', body: init.body });
    if (!init.method) return new Response(JSON.stringify(String(u).includes(encodeURIComponent(RUN.key)) ? rows : []), { status: 200 });
    return new Response(null, { status: 204 });
  };
  const log = [];
  const r = await backfill({ url: 'https://x.test', key: 'service', fetchImpl, log: (m) => log.push(m), tracks: [def] });
  assert.deepEqual(r, { done: 1, skipped: 1, failed: 1 });
  const patches = calls.filter((c) => c.method === 'PATCH');
  assert.equal(patches.length, 1); assert.ok(patches[0].u.includes('player=eq.p1'));
  assert.ok(JSON.parse(patches[0].body).ghost.length > 1000);
  const dry = await backfill({ url: 'https://x.test', key: 'service', fetchImpl: async (u, init = {}) => { calls.push({ method: init.method || 'GET' }); return fetchImpl(u, init); }, log: () => {}, dry: true, tracks: [def] });
  assert.equal(dry.done, 1); assert.equal(calls.filter((c) => c.method === 'PATCH').length, 1, 'essai à blanc : aucune écriture de plus');
  await assert.rejects(() => backfill({ url: 'https://x.test', key: 'k', fetchImpl: async () => new Response('{}', { status: 400 }), tracks: [def] }), /étape 7/);
});

await finish('Tous les tests des fantômes passent.');
