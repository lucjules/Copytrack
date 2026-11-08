// Environnements déterministes (E19 : pluie et flaques, givre, rafales, conditions qui varient) : node tools/test-env.mjs   (npm test)
// Absents, rien ne change ; présents, tout vient de la graine et du chrono : mêmes flaques, mêmes rafales, au pas près, partout.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Track, b64decode } from '../js/track.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { InputRecorder, quantSteer } from '../js/replay.js';
import { verifyRun, replayRun } from '../js/verify.js';
import { PHYS_VER } from '../js/version.js';
import { PIECES } from '../js/pieces.js';
import { CELL } from '../js/constants.js';
import { envOf, FROST_GRIP } from '../js/sim/env.js';

const def = (id) => BUILTIN_TRACKS.find((d) => d.id === id);
const track = (id, p) => { const t = buildBuiltin(def(id)); if (p) t.setParams(p); return t; };
function botRun(t) {
  const sim = new Simulation(t), rec = new InputRecorder();
  sim.start();
  const bot = new Autopilot(t.path, { latLimit: 56 * 0.8 });
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

console.log('Environnements');
test('absents : aucun environnement, la signature et le code ne bougent pas', () => {
  for (const d of BUILTIN_TRACKS.slice(0, 12)) assert.equal(envOf(buildBuiltin(d)), null);
  const t = track('canyon'), sig = t.signature(), code = t.encode();
  t.setParams({ rain: 0, frost: 0, gust: 0, envSeed: 0, envVary: false });
  assert.equal(t.signature(), sig); assert.equal(t.encode(), code);
  assert.equal(new Simulation(t).phys.env, null);
});
test('valeurs bornées ; elles entrent dans la signature et passent le code au format 4 ; relecture et copie fidèles', () => {
  const t = Track.decode(track('canyon').encode()), sig = t.signature();
  t.setParams({ rain: 300, frost: -4, gust: 55.4, envSeed: 5000, envVary: 1 });
  assert.deepEqual([t.rain, t.frost, t.gust, t.envSeed, t.envVary], [100, 0, 55, 999, true]);
  assert.notEqual(t.signature(), sig);
  const code = t.encode();
  assert.equal(JSON.parse(b64decode(code.slice(5))).v, 4);
  const back = Track.decode(code);
  assert.deepEqual([back.rain, back.frost, back.gust, back.envSeed, back.envVary], [100, 0, 55, 999, true]);
  assert.equal(back.signature(), t.signature());
  assert.equal(back.clone().rain, 100);
  const s2 = track('canyon', { rain: 100, gust: 55, envVary: true, envSeed: 998 }).signature();
  assert.notEqual(s2, t.signature(), 'la graine compte');
});
test('même graine = mêmes flaques ; autre graine = autres flaques ; chacune sur une ligne droite plate ordinaire, dans sa case', () => {
  const a = envOf(track('canyon', { rain: 100, frost: 100, envSeed: 12 })), b = envOf(track('canyon', { rain: 100, frost: 100, envSeed: 12 }));
  const c = envOf(track('canyon', { rain: 100, frost: 100, envSeed: 13 }));
  assert.ok(a.patches.length >= 3, `${a.patches.length} plaques`);
  assert.deepEqual(a.patches, b.patches);
  assert.notDeepEqual(a.patches, c.patches);
  assert.ok(a.patches.some((p) => p.kind === 'puddle') && a.patches.some((p) => p.kind === 'frost'));
  const tr = track('canyon');
  for (const p of a.patches) {
    const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
    const tile = tr.tiles.find((t) => t.x === cx && t.z === cz && PIECES[t.t].kind === 'line');
    assert.ok(tile && !PIECES[tile.t].rise && !tile.s && !tile.o && !tile.v && !tile.mv, `plaque en ${cx},${cz}`);
    assert.ok(p.x - p.r > cx * CELL && p.x + p.r < (cx + 1) * CELL && p.z - p.r > cz * CELL && p.z + p.r < (cz + 1) * CELL, 'dans sa case');
  }
  // Plus de pluie, plus de flaques (en moyenne sur des graines).
  let lo = 0, hi = 0;
  for (let s = 0; s < 30; s++) { lo += envOf(track('canyon', { rain: 20, envSeed: s })).patches.length; hi += envOf(track('canyon', { rain: 100, envSeed: s })).patches.length; }
  assert.ok(hi > lo * 2, `${lo} -> ${hi}`);
});
test('adhérence : la pluie la réduit un peu partout, la flaque beaucoup, le givre davantage', () => {
  const E = envOf(track('canyon', { rain: 100, frost: 100, envSeed: 4 }));
  const pud = E.patches.find((p) => p.kind === 'puddle'), ice = E.patches.find((p) => p.kind === 'frost');
  const far = E.gripAt(-9999, 0, -9999, 0);
  assert.ok(far < 1 && far > 0.8, `pluie seule ${far}`);
  assert.ok(E.gripAt(pud.x, pud.y + 0.5, pud.z, 0) < far * 0.6, 'flaque');
  assert.equal(E.gripAt(ice.x, ice.y + 0.5, ice.z, 0), far * FROST_GRIP);
  assert.equal(E.gripAt(pud.x, pud.y + 12, pud.z, 0), far, 'une flaque ne mouille pas le niveau du dessus');
  assert.equal(E.patchAt(pud.x, pud.y, pud.z), pud);
  const dryFrost = envOf(track('canyon', { frost: 100, envSeed: 4 }));
  assert.equal(dryFrost.gripAt(-9999, 0, -9999, 0), 1, 'givre sans pluie : la piste reste sèche ailleurs');
});
test('conditions qui varient : la pluie forcit et faiblit, toujours la même au même pas', () => {
  const E = envOf(track('canyon', { rain: 100, envSeed: 9, envVary: true }));
  const w = Array.from({ length: 200 }, (_, i) => E.rainAt(i * 120));
  assert.ok(Math.max(...w) - Math.min(...w) > 0.5, 'elle change pendant la course');
  assert.ok(w.every((x) => x >= 0.1 - 1e-9 && x <= 1 + 1e-9));
  assert.equal(envOf(track('canyon', { rain: 100, envSeed: 9, envVary: true })).rainAt(4321), E.rainAt(4321));
  assert.equal(envOf(track('canyon', { rain: 70 })).rainAt(4321), 0.7, 'sans variation : constante');
});
test('rafales : par à-coups, dans la direction du vent, jamais à contre-sens', () => {
  const E = envOf(track('canyon', { gust: 100, windDir: 90, envSeed: 2 }));
  let calm = 0, blow = 0;
  for (let i = 0; i < 6000; i += 7) {
    const g = E.gustAt(i);
    assert.ok(g.x >= 0 && Math.abs(g.z) < 1e-9, 'vers l’est');
    if (g.x === 0) calm++; else blow++;
  }
  assert.ok(calm > 50 && blow > 50, `${calm} calmes, ${blow} rafales`);
});
test('la course change : plus lente sous la pluie ; deux courses identiques sous la même graine', () => {
  const base = botRun(track('eclats'));
  const wet1 = botRun(track('eclats', { rain: 100, envSeed: 5 })), wet2 = botRun(track('eclats', { rain: 100, envSeed: 5 }));
  assert.ok(wet1 && wet1.time > base.time, `${base.time} -> ${wet1 && wet1.time}`);
  assert.deepEqual(wet1, wet2);
});
test('le serveur vérifie une course sous la pluie (code joueur), et refuse ses commandes sur le circuit sec', () => {
  const t = track('eclats', { rain: 70, gust: 40, windDir: 180, envSeed: 21, envVary: true });
  const r = botRun(t);
  assert.ok(r, 'le pilote automatique finit');
  const u = Track.decode(t.encode());
  const ok = verifyRun({ trackKey: u.userKey, code: u.encode(), inputs: r.inputs, time: r.time, physVer: PHYS_VER });
  assert.equal(ok.ok, true, ok.error);
  const plain = Track.decode(track('eclats').encode());
  assert.notEqual(plain.userKey, u.userKey);
  const back = replayRun(plain, r.inputs);
  assert.ok(!back || back.time !== r.time);
});
test('déterminisme : le module n’utilise ni horloge, ni hasard, ni trigonométrie du moteur', () => {
  const src = readFileSync(new URL('../js/sim/env.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /Math\.(random|sin|cos|tan|atan|exp|pow|log)|Date|performance/);
});

await finish('Tous les tests des environnements passent.');
