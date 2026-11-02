// Pilote automatique simple qui suit la ligne centrale d'un circuit scripté.
// Utilisé pour la démo du menu et pour valider les circuits (tools/sim.mjs).
import { CAR } from './physics.js';

export class Autopilot {
  constructor(path, opts = {}) {
    this.path = path;
    this.idx = 0;
    this.latLimit = opts.latLimit ?? CAR.latGrip * 0.8;
    this.brakeDecel = opts.brakeDecel ?? 30;
    // Distances cumulées et rayon de courbure en chaque point.
    const n = path.length;
    this.dist = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      const a = path[i - 1], b = path[i];
      this.dist[i] = this.dist[i - 1] + Math.hypot(b[0] - a[0], b[2] - a[2]);
    }
    this.radius = new Float32Array(n).fill(1e4);
    for (let i = 1; i < n - 1; i++) {
      const a = path[Math.max(0, i - 2)], b = path[i], c = path[Math.min(n - 1, i + 2)];
      const h1 = Math.atan2(b[2] - a[2], b[0] - a[0]);
      const h2 = Math.atan2(c[2] - b[2], c[0] - b[0]);
      let dh = h2 - h1;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]) * 0.5 + Math.hypot(c[0] - b[0], c[2] - b[2]) * 0.5;
      if (Math.abs(dh) > 1e-3) this.radius[i] = Math.max(2, len / Math.abs(dh));
    }
  }

  reset(phys) {
    this.idx = 0;
    if (phys) this._progress(phys, 400);
  }

  _progress(phys, range = 40) {
    const p = phys.pos, path = this.path;
    let best = this.idx, bd = Infinity;
    const end = Math.min(path.length - 1, this.idx + range);
    for (let i = this.idx; i <= end; i++) {
      const q = path[i];
      const d = (q[0] - p.x) ** 2 + (q[2] - p.z) ** 2 + ((q[1] - p.y) * 3) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    this.idx = best;
  }

  control(phys) {
    this._progress(phys);
    const path = this.path, p = phys.pos;
    const v = Math.max(0, phys.fwdSpeed);
    const look = 7 + v * 0.32;
    let j = this.idx;
    while (j < path.length - 1 && this.dist[j] - this.dist[this.idx] < look) j++;
    const tq = path[j];
    const fx = -Math.sin(phys.yaw), fz = -Math.cos(phys.yaw);
    const tx = tq[0] - p.x, tz = tq[2] - p.z;
    const cross = fx * tz - fz * tx;
    const dot = fx * tx + fz * tz;
    const ang = Math.atan2(cross, dot);
    const steer = Math.max(-1, Math.min(1, ang * 2.6));

    // Vitesse cible selon les courbes à venir.
    let vTarget = 999;
    const horizon = 15 + (v * v) / (2 * this.brakeDecel);
    for (let k = this.idx; k < path.length && this.dist[k] - this.dist[this.idx] < horizon; k++) {
      const vMax = Math.sqrt(this.latLimit * this.radius[k]);
      const dd = this.dist[k] - this.dist[this.idx];
      const allowed = Math.sqrt(vMax * vMax + 2 * this.brakeDecel * dd);
      if (allowed < vTarget) vTarget = allowed;
    }
    const throttle = v < vTarget - 0.5;
    const brake = v > vTarget + 2.5;
    return { throttle, brake, steer, drift: false };
  }
}
