// Replays et fantômes (v1.5). La physique est déterministe (pas fixe) : il suffit
// d'enregistrer les commandes de chaque pas pour rejouer une course à l'identique.
// Une commande = volant quantifié au centième + gaz / frein / réapparition.
import { Simulation } from './simulation.js';
import { Autopilot } from './autopilot.js';
import { b64encode, b64decode } from './track.js';
import { PHYS_VER } from './version.js';
import { MAX_RUN_STEPS } from './constants.js';


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
  // Un petit texte peut se déplier en des dizaines de millions de pas (255 répétitions par triplet) : on compte d'abord.
  let total = 0;
  for (let i = 0; i + 2 < bin.length; i += 3) total += bin.charCodeAt(i);
  if (total > MAX_RUN_STEPS) throw new Error('Enregistrement trop long.');       // refusé AVANT d'être déplié en mémoire
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
  const s = String(code || '').trim();
  if (!/^SHG1:/.test(s)) throw new Error('Ce n\'est pas un code de fantôme.');
  const d = JSON.parse(b64decode(s.slice(5)));
  if (!d || !d.k || !d.i) throw new Error('Code de fantôme invalide.');
  return { trackKey: String(d.k), time: +d.t, name: String(d.n || '—').slice(0, 20), inputs: String(d.i), v: d.v | 0 };
}

// ---- Fantôme simulé ----------------------------------------------------------------
// Une seconde voiture qui roule en même temps que le joueur, pilotée soit par un
// replay (commandes enregistrées), soit par le pilote automatique (fantôme « or »).
// C'est aussi ce qui rejoue une course côté serveur (verify.js) : le pas est celui de Simulation, le même que la course en direct.
export class GhostRunner {
  constructor(track, { inputs = null, bot = false, latK = 0.8 } = {}) {
    this.sim = new Simulation(track);
    this.phys = this.sim.phys;
    this.logic = this.sim.logic;
    this.rep = inputs ? decodeInputs(inputs) : null;
    this.bot = bot && track.path ? new Autopilot(track.path, { latLimit: 56 * latK }) : null;
    this.reset();
  }

  reset() {
    this.sim.start();
    if (this.bot) this.bot.reset(this.phys);
    this.k = 0;
    this.done = false;
  }

  step() {
    if (this.done) return;
    const inp = this.bot ? this.bot.control(this.phys) : inputAt(this.rep, this.k);
    if (inp.respawn) this.sim.rewind();
    const ev = this.sim.step(inp);
    if (this.sim.lost) this.sim.rewind();      // mêmes réapparitions automatiques qu'en course (hors piste 0,5 s, noyade)
    if (ev && ev.type === 'finish') this.done = true;
    if (this.rep && this.k >= this.rep.length + 240) this.done = true;
    this.k++;
  }
}
