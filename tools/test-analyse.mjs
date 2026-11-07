// Noyau d'analyse (trace, référence, secteurs, écarts) : node tools/test-analyse.mjs   (npm test)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Track } from '../js/track.js';
import { dailyChallenge } from '../js/daily.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { InputRecorder, quantSteer } from '../js/replay.js';
import { replayRun } from '../js/verify.js';
import { decodeFloats } from '../js/ghostFormat.js';
import { DT } from '../js/constants.js';
import { traceFromInputs, traceFromGhost } from '../js/analysis/trace.js';
import { makeReference, alignTrace, timeAtS } from '../js/analysis/reference.js';
import { sectors, compareSectors, delta, deltaAt, brakingPoints } from '../js/analysis/sectors.js';
import { summarize } from '../js/analysis/events.js';

const C = JSON.parse(readFileSync(new URL('./compat/corpus.json', import.meta.url), 'utf8'));
const def = (id) => BUILTIN_TRACKS.find((d) => d.id === id);
const trackOf = (r) => { const [k, id] = r.source.split(':'); return k === 'builtin' ? buildBuiltin(def(id)) : k === 'daily' ? dailyChallenge(id).track : Track.decode(r.code); };

// Commandes du pilote automatique (comme en course : volant arrondi), avec un réglage de vitesse en virage pour fabriquer deux styles.
function botRun(track, { latK = 0.8, brakeDecel } = {}) {
  const sim = new Simulation(track), rec = new InputRecorder();
  sim.start();
  const bot = new Autopilot(track.path, { latLimit: 56 * latK, ...(brakeDecel ? { brakeDecel } : {}) });
  bot.reset(sim.phys);
  for (let i = 0; i < 120 * 240; i++) {
    const inp = bot.control(sim.phys);
    inp.steer = quantSteer(inp.steer);
    rec.push(inp, false);
    const ev = sim.step(inp);
    if (sim.lost) { sim.rewind(); bot.reset(sim.phys); }
    if (ev && ev.type === 'finish') return { inputs: rec.encode(), time: sim.logic.time };
  }
  return null;
}

console.log('Trace');
test('la trace rejouée a les positions du fantôme enregistré, au bit près (corpus : retour au checkpoint, bateau, défi, code joueur)', () => {
  for (const r of C.runs) {
    const track = trackOf(r), tr = traceFromInputs(track, r.inputs);
    assert.equal(tr.time, r.time, r.label);
    assert.ok(tr.finished);
    const g = decodeFloats(replayRun(trackOf(r), r.inputs, { ghost: true }).ghost);
    assert.equal(tr.n, g.length / 7, `${r.label} : nombre d'échantillons`);
    for (let i = 0; i < tr.n; i++) for (let a = 0; a < 3; a++) if (tr.pos[i * 3 + a] !== g[i * 7 + a]) assert.fail(`${r.label} : échantillon ${i} différent`);
    for (let i = 0; i < tr.n; i++) assert.ok(Math.abs(tr.t[i] - (i + 1) * 4 * DT) < 1e-9);
  }
});
test('les évènements sont notés : checkpoints, retour au checkpoint, réceptions', () => {
  const rr = C.runs.find((r) => /retour/.test(r.label));
  const tr = traceFromInputs(trackOf(rr), rr.inputs), S = summarize(tr);
  assert.equal(S.respawns, 1);
  assert.ok(S.cps >= 1 && S.vmax > 20);
  assert.ok(tr.events.every((e) => e.i >= 0 && e.i < tr.n + 1));
});
test('un fantôme en ligne (positions seules) donne une trace utilisable : mêmes positions, vitesse proche', () => {
  const r = C.runs[0], tr = traceFromInputs(trackOf(r), r.inputs);
  const gt = traceFromGhost(trackOf(r), tr.ghost.data, tr.ghost.veh, { time: tr.time });
  assert.equal(gt.n, tr.n); assert.equal(gt.thr, null);
  let err = 0;
  for (let i = 0; i < tr.n; i++) { assert.equal(gt.pos[i * 3], tr.pos[i * 3]); err += Math.abs(gt.v[i] - tr.v[i]); }
  assert.ok(err / tr.n < 1.5, `écart moyen de vitesse ${(err / tr.n).toFixed(2)} m/s`);
});
test('coût : la trace d’une course d’une minute se calcule en moins de 150 ms', () => {
  const r = C.runs.find((x) => x.source.startsWith('daily'));
  const t0 = performance.now(), tr = traceFromInputs(trackOf(r), r.inputs), ms = performance.now() - t0;
  assert.ok(tr.time > 45);
  assert.ok(ms < 150 * (tr.time / 60) + 60, `${ms.toFixed(0)} ms pour ${tr.time.toFixed(1)} s`);
});

console.log('Référence, secteurs, écarts');
test('delta(a, a) = 0 partout ; les secteurs d’une course somment à son temps (1/120 s)', () => {
  for (const r of C.runs.slice(0, 3)) {
    const track = trackOf(r), a = alignTrace(traceFromInputs(track, r.inputs), makeReference(track));
    const d = delta(a, a);
    assert.ok(d.dt.every((x) => x === 0), r.label);
    const sec = sectors(a, { count: 12 });
    assert.equal(sec.length, 12, r.label);
    assert.ok(Math.abs(sec.reduce((x, k) => x + k.dt, 0) - r.time) < DT, `${r.label} : somme des secteurs`);
    assert.ok(sec.every((k) => k.dt > 0 && k.vmax >= k.vmin));
  }
});
test('deux styles de pilotage : l’écart final est la différence des temps, les secteurs l’expliquent', () => {
  const track = buildBuiltin(def('eclats'));
  const fast = botRun(track, { latK: 0.8 }), slow = botRun(track, { latK: 0.4 });      // 21,4 s contre 23,6 s
  assert.ok(fast && slow && slow.time > fast.time, 'le pilote prudent est plus lent');
  const ref = makeReference(track);
  const A = alignTrace(traceFromInputs(track, slow.inputs), ref), B = alignTrace(traceFromInputs(track, fast.inputs), ref);
  const cmp = compareSectors(sectors(A), sectors(B));
  assert.ok(Math.abs(cmp.reduce((x, k) => x + k.diff, 0) - (slow.time - fast.time)) < 2 * DT);
  assert.ok(cmp.some((k) => k.diff > 0.05), 'au moins un secteur nettement perdu');
  const d = delta(A, B, { step: 10 });
  assert.ok(d.dt[d.dt.length - 1] > 0);
  assert.ok(Math.abs(deltaAt(A, B, 10) - d.dt[1]) < 1e-9);
  assert.ok(brakingPoints(A).length >= 1 || brakingPoints(B).length >= 1, 'des freinages repérés');
});
test('la distance projetée avance sur les 72 circuits (pilote automatique), jusqu’à l’arrivée', () => {
  const bad = [];
  for (const d of BUILTIN_TRACKS) {
    const track = buildBuiltin(d), r = botRun(track);
    if (!r) { bad.push(d.id + ' : pas fini'); continue; }
    const tr = alignTrace(traceFromInputs(track, r.inputs), makeReference(track));
    let back = 0;
    for (let i = 1; i < tr.n; i++) if (tr.s[i] < tr.s[i - 1] - 3) back++;
    const end = tr.sm[tr.n - 1] / tr.ref.length;
    if (back > tr.n * 0.02 || end < 0.93) bad.push(`${d.id} : ${back} reculs, ${(end * 100).toFixed(0)} %`);
    if (Math.abs(timeAtS(tr, tr.sm[tr.n - 1]) - tr.t[tr.n - 1]) > 1e-6) bad.push(d.id + ' : temps à la fin');
  }
  assert.deepEqual(bad, []);
});
test('sans ligne de course (circuit de l’éditeur), la référence est la trajectoire d’une course', () => {
  const r = C.runs.find((x) => x.source === 'code'), track = Track.decode(r.code);
  assert.equal(makeReference(track), null, 'ni ligne centrale ni course : pas de référence');
  const tr = traceFromInputs(track, r.inputs), ref = makeReference(track, tr);
  assert.equal(ref.source, 'trace');
  alignTrace(tr, ref);
  assert.ok(tr.sm[tr.n - 1] > ref.length * 0.98);
  const sec = sectors(tr, { count: 8 });
  assert.ok(Math.abs(sec.reduce((x, k) => x + k.dt, 0) - r.time) < DT);
});

await finish('Tous les tests du noyau d’analyse passent.');
