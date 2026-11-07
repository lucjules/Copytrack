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
//
// Historique : le fantôme ne dépend pas du joueur, c'est une suite déterministe. Chaque pas laisse donc une ligne dans `hist` (assez pour dessiner
// la voiture), et la course en direct lit la ligne qui correspond à SON chrono. Quand le joueur revient à un checkpoint, il suffit de relire une ligne plus
// ancienne : on ne rejoue plus le fantôme depuis le départ (ce qui figeait l'image à chaque retour tardif dans une longue course).
const HIST_STRIDE = 17;
const VEH_IDS = ['car', 'moto', 'boat', 'glider'];

export class GhostRunner {
  constructor(track, { inputs = null, bot = false, latK = 0.8 } = {}) {
    this.sim = new Simulation(track);
    this.phys = this.sim.phys;
    this.logic = this.sim.logic;
    this.rep = inputs ? decodeInputs(inputs) : null;
    this.bot = bot && track.path ? new Autopilot(track.path, { latLimit: 56 * latK }) : null;
    this.hist = new Float32Array(HIST_STRIDE * 1024);
    this.reset();
  }

  reset() {
    this.sim.start();
    if (this.bot) this.bot.reset(this.phys);
    this.k = 0;
    this.done = false;
    this._record(0);
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
    this._record(this.k);
  }

  // Avance jusqu'au pas k (les lignes de l'historique jusque-là existent) ; renvoie false si le fantôme a terminé avant.
  seek(k) {
    while (this.k < k && !this.done) this.step();
    return k <= this.k;
  }

  _record(k) {
    if ((k + 1) * HIST_STRIDE > this.hist.length) { const h = new Float32Array(this.hist.length * 2); h.set(this.hist); this.hist = h; }
    const p = this.phys, h = this.hist, o = k * HIST_STRIDE;
    h[o] = p.pos.x; h[o + 1] = p.pos.y; h[o + 2] = p.pos.z;
    h[o + 3] = p.prev.x; h[o + 4] = p.prev.y; h[o + 5] = p.prev.z;
    h[o + 6] = p.n.x; h[o + 7] = p.n.y; h[o + 8] = p.n.z;
    h[o + 9] = p.fwd.x; h[o + 10] = p.fwd.y; h[o + 11] = p.fwd.z;
    h[o + 12] = p.yaw; h[o + 13] = p.grounded ? 1 : 0; h[o + 14] = VEH_IDS.indexOf(p.vehicle);
    h[o + 15] = this.done ? 1 : 0; h[o + 16] = 0;
  }

  // Ce qu'il faut pour dessiner la voiture après k pas (out : pos, prev, n, fwd, yaw, grounded, vehicle, done). Avance le fantôme si besoin.
  poseAt(k, out) {
    this.seek(k);
    const i = Math.min(k, this.k), h = this.hist, o = i * HIST_STRIDE;
    out.pos.x = h[o]; out.pos.y = h[o + 1]; out.pos.z = h[o + 2];
    out.prev.x = h[o + 3]; out.prev.y = h[o + 4]; out.prev.z = h[o + 5];
    out.n.x = h[o + 6]; out.n.y = h[o + 7]; out.n.z = h[o + 8];
    out.fwd.x = h[o + 9]; out.fwd.y = h[o + 10]; out.fwd.z = h[o + 11];
    out.yaw = h[o + 12]; out.grounded = h[o + 13] === 1; out.vehicle = VEH_IDS[h[o + 14]] || 'car';
    out.done = k > this.k || h[o + 15] === 1;
    return out;
  }
}

// Support d'une pose de fantôme pour le rendu (réutilisé d'une image à l'autre).
export const newGhostPose = () => ({ pos: { x: 0, y: 0, z: 0 }, prev: { x: 0, y: 0, z: 0 }, n: { x: 0, y: 1, z: 0 }, fwd: { x: 0, y: 0, z: -1 }, yaw: 0, grounded: true, vehicle: 'car', done: false });
