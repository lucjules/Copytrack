// Trace d'une course (Copytrack Evolution, analyse) : ce qui s'est passé, échantillonné comme les fantômes (un point tous les GHOST_EVERY pas,
// soit 30 par seconde). Module pur, sans DOM ni rendu : testé sous Node (tools/test-analyse.mjs).
//
//   traceFromInputs(track, inputs)       rejeu EXACT des commandes enregistrées (GhostRunner, le même pas que la course et le serveur) : positions,
//                                        vitesse, commandes, en l'air, accélérations, évènements. Ses positions sont celles du fantôme, au bit près.
//   traceFromGhost(track, data, veh)     fantôme du classement en ligne (positions seulement) : vitesse déduite, ni commandes ni évènements de pilotage.
//
// RunTrace : { every, n, t, pos (x, y, z), v, thr, brk, steer, air, lat, lon, events, source, time, finished }
//   t[i] = (i + 1) × every × DT (chrono de la course) ; un retour au checkpoint efface ce qui suit le checkpoint, comme le fantôme.
//   events : [{ k, i, step, q }] k = 'cp' | 'land' | 'wall' | 'turbo' | 'respawn' | 'veh' (i : échantillon le plus proche, q : détail)
import { GhostRunner, inputAt, InputRecorder, quantSteer } from '../replay.js';
import { Simulation } from '../simulation.js';
import { Autopilot } from '../autopilot.js';
import { GHOST_EVERY, GHOST_STRIDE, GHOST_VEHICLES } from '../ghostFormat.js';
import { DT, MAX_RUN_STEPS } from '../constants.js';

const G = 9.81;

// Le GhostRunner du jeu, avec une prise de notes à chaque pas (aucune ligne de son pas n'est réécrite : le rejeu est le sien).
class TraceRunner extends GhostRunner {
  constructor(track, inputs, every) {
    super(track, { inputs, ghost: true });
    this.every = every;
    this.ch = { t: [], k: [], x: [], y: [], z: [], v: [], thr: [], brk: [], steer: [], air: [], lat: [], lon: [] };
    this.events = [];
    this._cps = 0; this._veh = this.phys.vehicle; this._v = 0; this._wallAt = -1000;
  }
  _note(k, q = 0) { this.events.push({ k, step: this.logic.steps, i: Math.max(0, Math.round(this.logic.steps / this.every) - 1), q }); }
  _gSample() {
    super._gSample();
    const p = this.phys, L = this.logic, e = p.ev;
    // Évènements du pas (ils tombent rarement sur un multiple de `every` : on les note à chaque pas).
    if (L.splits.length > this._cps) this._note('cp', L.splits.length);
    this._cps = L.splits.length;
    if (e.wall > 4 && L.steps - this._wallAt > 36) { this._note('wall', e.wall); this._wallAt = L.steps; }      // un choc, pas chaque pas de frottement
    if (e.landQ) this._note('land', e.landQ === 'perfect' ? 2 : e.landQ === 'ok' ? 1 : 0);
    if (e.miniTurbo) this._note('turbo', e.miniTurbo);
    if (p.vehicle !== this._veh) { this._note('veh', GHOST_VEHICLES.indexOf(p.vehicle)); this._veh = p.vehicle; }
    if (L.steps % this.every !== 0) return;
    const c = this.ch, inp = inputAt(this.rep, this.k), v = p.speed;
    c.t.push(L.steps * DT); c.k.push(this.k + 1);        // k : pas de lecture des commandes (ne recule jamais, contrairement au chrono)
    c.x.push(p.pos.x); c.y.push(p.pos.y); c.z.push(p.pos.z);
    c.v.push(v);
    c.thr.push(inp.throttle ? 1 : 0); c.brk.push(inp.brake ? 1 : 0); c.steer.push(Math.round(inp.steer * 100));
    c.air.push(!p.grounded && !p.rib ? 1 : 0);
    c.lat.push(v * p.omega / G);
    c.lon.push(c.v.length > 1 ? (v - this._v) / (this.every * DT) / G : 0);
    this._v = v;
  }
  _gTrim() {
    super._gTrim();
    const n = Math.floor(this.logic.steps / this.every);
    for (const a of Object.values(this.ch)) if (a.length > n) a.length = n;
    this.events = this.events.filter((ev) => ev.step <= this.logic.steps);
    this._cps = this.logic.splits.length;
    this._v = this.ch.v.length ? this.ch.v[this.ch.v.length - 1] : 0;
    this._note('respawn');
  }
}

function pack(ch, extra) {
  const n = ch.t.length;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = ch.x[i]; pos[i * 3 + 1] = ch.y[i]; pos[i * 3 + 2] = ch.z[i]; }
  return {
    n, t: Float64Array.from(ch.t), k: ch.k ? Int32Array.from(ch.k) : null, pos, v: Float32Array.from(ch.v),
    thr: ch.thr ? Uint8Array.from(ch.thr) : null, brk: ch.brk ? Uint8Array.from(ch.brk) : null, steer: ch.steer ? Int8Array.from(ch.steer) : null,
    air: ch.air ? Uint8Array.from(ch.air) : null, lat: ch.lat ? Float32Array.from(ch.lat) : null, lon: ch.lon ? Float32Array.from(ch.lon) : null,
    ...extra,
  };
}

export function traceFromInputs(track, inputs, { every = GHOST_EVERY, maxSteps = MAX_RUN_STEPS } = {}) {
  const r = new TraceRunner(track, inputs, every);
  while (!r.done && r.k < maxSteps) r.step();
  const finished = !!r.logic.finished;
  return pack(r.ch, { every, events: r.events, source: 'inputs', time: finished ? r.logic.time : null, finished, ghost: r.ghostResult() });
}

// data : Float32Array (x, y, z, qx, qy, qz, qw par échantillon, voir ghostFormat.js) ; veh : changements de véhicule [[échantillon, id]].
export function traceFromGhost(track, data, veh = [], { every = GHOST_EVERY, time = null } = {}) {
  const n = Math.floor(data.length / GHOST_STRIDE), dt = every * DT;
  const ch = { t: [], x: [], y: [], z: [], v: [] };
  for (let i = 0; i < n; i++) {
    const o = i * GHOST_STRIDE;
    ch.t.push((i + 1) * dt); ch.x.push(data[o]); ch.y.push(data[o + 1]); ch.z.push(data[o + 2]);
  }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const dx = ch.x[b] - ch.x[a], dy = ch.y[b] - ch.y[a], dz = ch.z[b] - ch.z[a];
    ch.v.push(b > a ? Math.sqrt(dx * dx + dy * dy + dz * dz) / ((b - a) * dt) : 0);
  }
  const events = (veh || []).filter((c) => Array.isArray(c) && c[0] > 0).map((c) => ({ k: 'veh', i: c[0] | 0, step: ((c[0] | 0) + 1) * every, q: c[1] | 0 }));
  return pack(ch, { every, events, source: 'ghost', time: time != null ? time : n ? ch.t[n - 1] : null, finished: time != null });
}

// Position de l'échantillon i (out : { x, y, z }).
export function posAt(trace, i, out = { x: 0, y: 0, z: 0 }) {
  const k = Math.max(0, Math.min(trace.n - 1, i)) * 3;
  out.x = trace.pos[k]; out.y = trace.pos[k + 1]; out.z = trace.pos[k + 2];
  return out;
}

// Le fantôme or : les commandes du pilote automatique (mêmes réglages que le fantôme or de la course : latLimit 56 × 0,8), rejouées en trace.
// Circuits à ligne de course seulement (track.path) ; null s'il ne finit pas.
export function traceFromBot(track, { latK = 0.8, maxSeconds = 300 } = {}) {
  if (!track.path) return null;
  const sim = new Simulation(track), rec = new InputRecorder();
  sim.start();
  const bot = new Autopilot(track.path, { latLimit: 56 * latK });
  bot.reset(sim.phys);
  for (let i = 0; i < Math.round(maxSeconds / DT); i++) {
    const inp = bot.control(sim.phys);
    inp.steer = quantSteer(inp.steer);
    rec.push(inp, false);
    const ev = sim.step(inp);
    if (sim.lost) { sim.rewind(); bot.reset(sim.phys); }
    if (ev && ev.type === 'finish') { const tr = traceFromInputs(track, rec.encode()); tr.inputs = rec.encode(); return tr; }
  }
  return null;
}
