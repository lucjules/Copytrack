// Coach : node tools/test-coach.mjs   (npm test)
// Des courses fabriquées avec UN défaut connu (freinage retardé ou avancé, coup de volant contre le mur, retour au checkpoint, virages pris
// trop prudemment) : le bon conseil doit arriver en tête, au bon secteur ; une course identique à la référence n'en reçoit aucun.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { InputRecorder, quantSteer, decodeInputs } from '../js/replay.js';
import { traceFromInputs } from '../js/analysis/trace.js';
import { makeReference, alignTrace } from '../js/analysis/reference.js';
import { brakingPoints } from '../js/analysis/sectors.js';
import { coach, COACH_TEXT } from '../js/analysis/coach.js';

const def = (id) => BUILTIN_TRACKS.find((d) => d.id === id);
function botRun(track, latK = 0.8) {
  const sim = new Simulation(track), rec = new InputRecorder();
  sim.start();
  const bot = new Autopilot(track.path, { latLimit: 56 * latK });
  bot.reset(sim.phys);
  for (let i = 0; i < 120 * 240; i++) {
    const inp = bot.control(sim.phys);
    inp.steer = quantSteer(inp.steer);
    rec.push(inp, false);
    const ev = sim.step(inp);
    if (sim.lost) { sim.rewind(); bot.reset(sim.phys); }
    if (ev && ev.type === 'finish') return rec.encode();
  }
  return null;
}
// Réécrit des commandes : f(steer[], flags[]) modifie les tableaux ; le reste de la course est gardé tel quel.
function edit(inputs, f) {
  const r = decodeInputs(inputs), st = r.steer.slice(), fl = r.flags.slice();
  f(st, fl);
  const rec = new InputRecorder();
  for (let i = 0; i < st.length; i++) rec.push({ steer: st[i] / 100, throttle: !!(fl[i] & 1), brake: !!(fl[i] & 2) }, !!(fl[i] & 4));
  return rec.encode();
}
// Prolonge d'autant de pas, à la fin, des commandes « gaz » : une course modifiée doit encore aller jusqu'à l'arrivée.
const pad = (st, fl, n = 1200) => { for (let i = 0; i < n; i++) { st.push(0); fl.push(1); } };

function setup(id) {
  const track = buildBuiltin(def(id)), refIn = botRun(track), ref = makeReference(track);
  const R = alignTrace(traceFromInputs(track, refIn), ref);
  return { track, refIn, ref, R, trace: (inputs) => alignTrace(traceFromInputs(track, inputs), ref) };
}
const sectorOf = (R, s) => Math.min(12, Math.floor((s / R.ref.length) * 12) + 1);

console.log('Coach');
test('une course identique à la référence ne reçoit aucun conseil', () => {
  const { R, trace, refIn } = setup('canyon');
  assert.deepEqual(coach(trace(refIn), R), []);
});
// Traces synthétiques sur une ligne droite de 1 200 m : la règle du coach testée seule (le pilote automatique ralentit surtout en levant le pied,
// il freine peu : supprimer ses coups de frein ne coûte rien, et le coach se tait, à raison).
function synth(profile) {
  const dt = 1 / 30, ch = { t: [], k: [], x: [], v: [], brk: [], thr: [] };
  let s = 0, t = 0, i = 0;
  while (s < 1200 && i < 20000) { const p = profile(s); t += dt; s += p.v * dt; i++; ch.t.push(t); ch.k.push(i * 4); ch.x.push(s); ch.v.push(p.v); ch.brk.push(p.b ? 1 : 0); ch.thr.push(p.b ? 0 : 1); }
  const n = ch.t.length, pos = new Float32Array(n * 3);
  for (let j = 0; j < n; j++) pos[j * 3] = ch.x[j];
  return { n, every: 4, t: Float64Array.from(ch.t), k: Int32Array.from(ch.k), pos, v: Float32Array.from(ch.v), brk: Uint8Array.from(ch.brk), thr: Uint8Array.from(ch.thr), air: new Uint8Array(n), events: [], finished: true, time: t };
}
const ramp = (s, a, b, va, vb) => va + (vb - va) * Math.min(1, Math.max(0, (s - a) / (b - a)));
test('freinage retardé (règle du coach, traces synthétiques) : « tu freines plus tard », en tête, à l’endroit du freinage', () => {
  const straight = { path: Array.from({ length: 121 }, (_, i) => [i * 10, 0, 0]) };
  const R = synth((s) => (s < 500 ? { v: 50 } : s < 560 ? { v: ramp(s, 500, 560, 50, 25), b: 1 } : { v: ramp(s, 560, 700, 25, 50) }));
  const M = synth((s) => (s < 545 ? { v: 50 } : s < 590 ? { v: ramp(s, 545, 590, 50, 16), b: 1 } : { v: ramp(s, 590, 760, 16, 50) }));
  const ref = makeReference(straight);
  alignTrace(R, ref); alignTrace(M, ref);
  const tips = coach(M, R);
  assert.ok(M.time > R.time + 0.3, 'la course synthétique perd du temps');
  assert.equal(tips[0].id, 'late-brake', tips.map((x) => x.id).join(', '));
  assert.equal(tips[0].sector, 6, 'le secteur du freinage (500 m : début du 6e secteur de 100 m)');
  assert.ok(tips[0].vars.d >= 40 && tips[0].vars.d <= 50, `freinage ${tips[0].vars.d} m plus tard`);
  assert.match(tips[0].text, /^Secteur 6 : tu freines 4\d m plus tard que la référence et tu en ressors à \d+ km\/h au lieu de \d+/);
  assert.ok(tips[0].vars.v < tips[0].vars.vr, "ressorti plus lentement");
});
test('freinage avancé : « tu freines plus tôt »', () => {
  const { R, refIn, trace } = setup('temple');
  const target = brakingPoints(R).filter((b) => b.v0 > 25)[0], from = Math.round(R.t[target.i] * 120);
  const early = edit(refIn, (st, fl) => { for (let k = from - 140; k < from; k++) fl[k] = (fl[k] & ~1) | 2; pad(st, fl); });
  const tips = coach(trace(early), R);
  // (0.9.54) Les commandes qui suivent le freinage avancé sont rejouées telles quelles, sur une trajectoire qui n'est plus la bonne : la voiture finit au mur (secteur 5). Avant
  // 0.9.54 elle y restait plaquée à l'arrêt pour toujours (plus aucun choc, donc aucun conseil « mur ») ; elle se dégage maintenant et racle la paroi : le conseil « mur » est
  // légitime et peut passer devant. Le conseil de freinage avancé doit être là, au bon secteur, avec son texte.
  const eb = tips.find((x) => x.id === 'early-brake');
  assert.ok(eb, tips.map((x) => `${x.id}@${x.sector}`).join(', '));
  assert.ok(Math.abs(eb.sector - sectorOf(R, target.s)) <= 1);
  assert.match(eb.text, /^Secteur \d+ : tu freines \d+ m plus tôt/);
});
test('un retour au checkpoint coûte du temps : il est signalé, avec sa perte, en tête ou juste derrière les chocs de mur qui le suivent', () => {
  const { R, refIn, trace } = setup('canyon');
  const k = Math.round(R.n * 4 * 0.3);
  const resp = edit(refIn, (st, fl) => { fl[k] |= 4; pad(st, fl, 2400); });
  const tips = coach(trace(resp), R);
  // (0.9.59) Même situation que le freinage avancé ci-dessus : après le retour, les commandes de la référence sont rejouées telles quelles sur une trajectoire qui n'est plus la
  // bonne, et la voiture finit contre la paroi d'un ruban. Avant 0.9.59 elle y restait plaquée, presque à l'arrêt, jusqu'à la fin (2 609 pas sous 2 m/s, plus aucun choc : les
  // 21,9 s perdues étaient toutes mises au compte du retour). Elle se dégage maintenant et racle les murs (2 305 pas de contact) : le conseil « mur » (16,7 s) est légitime
  // et passe devant ; le retour au checkpoint (7,9 s) doit toujours être là, avec sa perte, dans les deux premiers.
  const rs = tips.find((x) => x.id === 'respawn');
  assert.ok(rs, tips.map((x) => x.id).join(', '));
  assert.ok(rs.loss > 0.5);
  assert.ok(tips.indexOf(rs) <= 1 && tips.slice(0, tips.indexOf(rs)).every((x) => x.id === 'wall'), tips.map((x) => x.id).join(', '));
});
test('virages pris trop prudemment : vitesse mini ou freinage, jamais un conseil sans mesure', () => {
  const { track, R, trace } = setup('eclats');
  const slow = trace(botRun(track, 0.4));
  const tips = coach(slow, R);
  assert.ok(tips.length >= 2);
  assert.ok(['slow-corner', 'early-brake', 'late-brake'].includes(tips[0].id), tips.map((x) => x.id).join(', '));
  for (const t of tips) {
    assert.ok(t.loss > 0.05 && t.sector >= 1 && t.sector <= 12 && t.s >= t.s0 - 150 && t.s <= t.s1);
    assert.ok(!/\{\w+\}/.test(t.text), 'texte complet : ' + t.text);
  }
});
test('chaque conseil a son texte', () => {
  for (const id of ['respawn', 'wall', 'late-brake', 'early-brake', 'slow-corner', 'air', 'wide-line', 'sector']) assert.ok(COACH_TEXT[id], id);
});

test('chaque conseil est traduit en anglais (avec ses nombres)', async () => {
  const I = await import('../js/i18n.js'), en = (await import('../js/i18n/en.js')).default;
  const { coachFill } = await import('../js/analysis/coach.js');
  I.register(en); I.setLang('en');
  const v = { k: 4, loss: 0.42, n: 2, s: 's', d: 12, v: 131, vr: 148, a: 1.4, ar: 0.9 };
  for (const [id, tpl] of Object.entries(COACH_TEXT)) {
    const fr = coachFill(tpl, v), out = I.translate(fr);
    assert.notEqual(out, fr, id + ' : pas de traduction');
    assert.ok(!I.looksFrench(out), id + ' : ' + out);
    assert.ok(out.includes('0.42') && /Sector 4/.test(out), id + ' : les nombres sont repris');
  }
  assert.notEqual(I.translate(coachFill(COACH_TEXT.wall, { ...v, n: 1, s: '' })), coachFill(COACH_TEXT.wall, { ...v, n: 1, s: '' }), 'un seul choc');
  I.setLang('fr');
});

await finish('Tous les tests du coach passent.');
