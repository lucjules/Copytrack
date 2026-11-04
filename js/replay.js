// Replays et fantômes (v1.5). La physique est déterministe (pas fixe) : il suffit
// d'enregistrer les commandes de chaque pas pour rejouer une course à l'identique.
// Une commande = volant quantifié au centième + gaz / frein / réapparition.
import { CarPhysics } from './physics.js';
import { RaceLogic, placeAtStart } from './raceLogic.js';
import { Autopilot } from './autopilot.js';
import { b64encode, b64decode } from './track.js';

// À incrémenter dès que la physique change : les replays d'une autre version sont ignorés.
export const PHYS_VER = 20;

export const quantSteer = (s) => Math.round(Math.max(-1, Math.min(1, s || 0)) * 100) / 100;

// Enregistreur : une entrée par pas physique.
export class InputRecorder {
  constructor() { this.steer = []; this.flags = []; }
  push(inp, respawn = false) {
    this.steer.push(Math.round(quantSteer(inp.steer) * 100));
    this.flags.push((inp.throttle ? 1 : 0) | (inp.brake ? 2 : 0) | (respawn ? 4 : 0));
  }
  get length() { return this.steer.length; }
  // Encodage compact : suites de (répétitions, volant, drapeaux).
  encode() {
    const out = [];
    const n = this.steer.length;
    for (let i = 0; i < n;) {
      let j = i + 1;
      while (j < n && j - i < 255 && this.steer[j] === this.steer[i] && this.flags[j] === this.flags[i]) j++;
      out.push(j - i, this.steer[i] & 255, this.flags[i]);
      i = j;
    }
    let bin = '';
    for (const b of out) bin += String.fromCharCode(b);
    return btoa(bin);
  }
}

export function decodeInputs(b64) {
  const bin = atob(b64);
  const steer = [], flags = [];
  for (let i = 0; i + 2 < bin.length; i += 3) {
    const n = bin.charCodeAt(i), s = (bin.charCodeAt(i + 1) << 24) >> 24, f = bin.charCodeAt(i + 2);
    for (let k = 0; k < n; k++) { steer.push(s); flags.push(f); }
  }
  return { steer, flags, length: steer.length };
}

export function inputAt(rep, k) {
  if (!rep || k >= rep.length) return { steer: 0, throttle: false, brake: true, drift: false, respawn: false };
  const f = rep.flags[k];
  return { steer: rep.steer[k] / 100, throttle: !!(f & 1), brake: !!(f & 2), drift: false, respawn: !!(f & 4) };
}

// ---- Codes de fantôme partageables ---------------------------------------------
export function encodeGhost({ trackKey, time, name, inputs }) {
  return 'SHG1:' + b64encode(JSON.stringify({ k: trackKey, t: time, n: name || '—', i: inputs, v: PHYS_VER }));
}

export function decodeGhost(code) {
  let s = String(code || '').trim();
  if (!/^SHG1:/.test(s)) throw new Error('Ce n\'est pas un code de fantôme.');
  const d = JSON.parse(b64decode(s.slice(5)));
  if (!d || !d.k || !d.i) throw new Error('Code de fantôme invalide.');
  return { trackKey: String(d.k), time: +d.t, name: String(d.n || '—').slice(0, 20), inputs: String(d.i), v: d.v | 0 };
}

// ---- Fantôme simulé ----------------------------------------------------------------
// Une seconde voiture qui roule en même temps que le joueur, pilotée soit par un
// replay (commandes enregistrées), soit par le pilote automatique (fantôme « or »).
export class GhostRunner {
  constructor(track, { inputs = null, bot = false, latK = 0.8 } = {}) {
    this.phys = new CarPhysics(track);
    this.logic = new RaceLogic(track);
    this.rep = inputs ? decodeInputs(inputs) : null;
    this.bot = bot && track.path ? new Autopilot(track.path, { latLimit: 56 * latK, brakeDecel: 36 }) : null;
    this.reset();
  }

  reset() {
    this.logic.reset();
    placeAtStart(this.phys, this.logic);
    if (this.bot) this.bot.reset(this.phys);
    this.k = 0;
    this.groundT = 0;
    this.done = false;
  }

  step() {
    if (this.done) return;
    let inp;
    if (this.bot) inp = this.bot.control(this.phys);
    else inp = inputAt(this.rep, this.k);
    if (inp.respawn) {
      const r = this.logic.rewind();
      this.phys.place(r.x, r.y, r.z, r.yaw, r.gs || 1);
      this.phys.vehicle = r.vehicle || 'car'; this.phys.gravMul = r.grav || 1;
    }
    this.phys.clock = this.logic.steps;
    this.phys.step(inp);
    const sink = this.phys.ev.sink;
    const ev = this.logic.update(this.phys);
    // Mêmes réapparitions automatiques qu'en course (hors piste 0,5 s, noyade).
    if (this.phys.offTrack) this.groundT += 1 / 120; else this.groundT = 0;
    if (this.groundT > 0.5 || sink) {
      this.groundT = 0;
      const r = this.logic.rewind();
      this.phys.place(r.x, r.y, r.z, r.yaw, r.gs || 1);
      this.phys.vehicle = r.vehicle || 'car'; this.phys.gravMul = r.grav || 1;
    }
    if (ev && ev.type === 'finish') this.done = true;
    if (this.rep && this.k >= this.rep.length + 240) this.done = true;
    this.k++;
  }
}
