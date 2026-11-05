// Pilote automatique simple qui suit la ligne centrale d'un circuit scripté.
// Utilisé pour la démo du menu et pour valider les circuits (tools/sim.mjs).
import { CAR } from './physics.js';

export class Autopilot {
  constructor(path, opts = {}) {
    this.path = path;
    this.idx = 0;
    this.latLimit = opts.latLimit ?? CAR.latGrip * 0.8;
    this.brakeDecel = opts.brakeDecel ?? 20;
    this.vCap = opts.vCap ?? (path.pilot && path.pilot.vCap) ?? 52;     // 0.9.4 : le moteur monte bien plus haut, mais le pilote reste prudent (glace, murs punitifs, sauts calés pour ~190 km/h)
    const n = path.length;
    // Distances cumulées (3D) et rayon de courbure horizontal en chaque point.
    this.dist = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      const a = path[i - 1], b = path[i];
      this.dist[i] = this.dist[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    this.radius = new Float32Array(n).fill(1e4);
    for (let i = 1; i < n - 1; i++) {
      const a = path[Math.max(0, i - 2)], b = path[i], c = path[Math.min(n - 1, i + 2)];
      if (a[3] === 1 || b[3] === 1 || c[3] === 1) continue; // looping, tube... : pas de limite de courbe
      const h1 = Math.atan2(b[2] - a[2], b[0] - a[0]);
      const h2 = Math.atan2(c[2] - b[2], c[0] - b[0]);
      let dh = h2 - h1;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]) * 0.5 + Math.hypot(c[0] - b[0], c[2] - b[2]) * 0.5;
      if (Math.abs(dh) > 1e-3 && len > 0.5) this.radius[i] = Math.max(2, len / Math.abs(dh)) * (b[3] === 2 ? 1.7 : 1);
    }
  }

  // Hauteur du chemin le plus proche plus loin devant (approximation du sol d'arrivée).
  _groundBelow(y) {
    let best = -Infinity;
    for (let k = this.idx; k < Math.min(this.path.length, this.idx + 60); k++) {
      const q = this.path[k];
      if (q[1] <= y + 0.5 && q[1] > best) best = q[1];
    }
    return best === -Infinity ? y : best;
  }

  // Pente (rad) du chemin à une distance donnée.
  _pathSlopeAt(d) {
    const path = this.path, n = path.length;
    let k = this.idx;
    while (k < n - 2 && this.dist[k] < d) k++;
    const a = path[Math.max(0, k - 2)], b = path[Math.min(n - 1, k + 2)];
    const h = Math.hypot(b[0] - a[0], b[2] - a[2]);
    return h > 0.5 ? Math.atan2(b[1] - a[1], h) : 0;
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

  // En gravité inversée (au plafond), la droite du pilote est la gauche du monde et
  // « nez en haut » vise le bas : on traduit les commandes calculées en repère monde.
  control(phys) {
    const c = this._control(phys);
    if (phys.rib) { if (phys.rib.tile.v) c.steer = -c.steer; }
    else if (phys.gSign < 0) {
      c.steer = -c.steer;
      if (!phys.grounded && phys.vehicle !== 'glider') { const t = c.throttle; c.throttle = c.brake; c.brake = t; }
    }
    return c;
  }

  _control(phys) {
    this._progress(phys);
    if (phys.rib) {
      const R = phys.rib;
      // Revenir au centre : cap visé proportionnel à l'écart, puis braquage vers ce cap.
      const d2 = R.dir * R.dl;
      const vs = Math.max(8, Math.abs(R.vs));
      const psiDes = Math.asin(Math.max(-0.5, Math.min(0.5, (-1.2 * d2) / vs)));
      const st = (psiDes - R.psi) * 6 - phys.omega * 0.35;
      return { throttle: true, brake: false, steer: Math.max(-1, Math.min(1, st)), drift: false };
    }
    const path = this.path, p = phys.pos;
    if (!phys.grounded && phys.vehicle === 'glider') {
      // Deltaplane : on vise la route devant (cap) et on garde un peu d'altitude au-dessus.
      let j = this.idx;
      while (j < path.length - 1 && this.dist[j] - this.dist[this.idx] < 30) j++;
      const tq = path[j];
      const fx = -Math.sin(phys.yaw), fz = -Math.cos(phys.yaw);
      const tx = tq[0] - p.x, tz = tq[2] - p.z;
      const ang = Math.atan2(fx * tz - fz * tx, fx * tx + fz * tz);
      // Plané : on vise la route 30 m devant, 3 m au-dessus, par la vitesse verticale voulue (cabrer = brake, piquer = gaz).
      // Une dalle est solide : passer SOUS la route visée, c'est la percuter.
      const hv = Math.max(8, Math.hypot(phys.vel.x, phys.vel.z));
      const wantVy = (tq[1] + 3 - p.y) / (Math.max(10, Math.hypot(tx, tz)) / hv);
      // Prochaine reprise de route après un vide (saut de plus de 30 m entre deux points) : altitude voulue = sa hauteur + 3 m
      // + 1 m par 9 m restant (finesse d'environ 9). Trop haut : on pique pour garder de la vitesse ; trop bas : on cabre.
      let landK = -1;
      for (let k = this.idx + 1; k < path.length && k < this.idx + 80; k++) {
        if (Math.hypot(path[k][0] - path[k - 1][0], path[k][2] - path[k - 1][2]) > 30) { landK = k; break; }
      }
      let low, high;
      if (landK > 0 && landK > j) {
        const rest = Math.hypot(path[landK][0] - p.x, path[landK][2] - p.z);
        const want = path[landK][1] + 3 + rest / 9;
        low = p.y < want; high = p.y > want + 4;
      } else { low = phys.vel.y < wantVy + 2; high = phys.vel.y > wantVy + 6; }
      const dive = phys.speed < 24 || (high && phys.speed < 42);
      const pull = !dive && (low || phys.speed > 56);
      return { throttle: dive, brake: pull, steer: Math.max(-1, Math.min(1, ang * 2.2)), drift: false };
    }
    if (!phys.grounded) {
      // En l'air : on aligne le nez sur la pente de la route à l'atterrissage prévu.
      const hv = Math.hypot(phys.vel.x, phys.vel.z);
      const tLand = Math.max(0.15, (phys.vel.y + Math.sqrt(Math.max(0, phys.vel.y ** 2 + 2 * phys.g * Math.max(0, p.y - this._groundBelow(p.y))))) / phys.g);
      const ahead = this._pathSlopeAt(this.dist[this.idx] + hv * tLand);
      const err = phys.pitch - ahead + phys.pitchRate * 0.35;
      const steerAir = 0;
      return { throttle: err > 0.03, brake: err < -0.03, steer: steerAir, drift: false };
    }
    const v = Math.max(0, phys.fwdSpeed);
    const look = 8 + v * 0.32;
    let j = this.idx;
    while (j < path.length - 1 && this.dist[j] - this.dist[this.idx] < look && path[j + 1][3] !== 1) j++;
    if (path[j + 1] && path[j + 1][3] === 1 && j === this.idx) j++;
    const tq = path[j];
    const fx = -Math.sin(phys.yaw), fz = -Math.cos(phys.yaw);
    const tx = tq[0] - p.x, tz = tq[2] - p.z;
    const cross = fx * tz - fz * tx;
    const dot = fx * tx + fz * tz;
    const ang = Math.atan2(cross, dot);
    const steer = Math.max(-1, Math.min(1, ang * 2.6 - (phys.omega || 0) * 0.25));

    // Vitesse cible selon les courbes à venir.
    let vTarget = this.vCap;
    const horizon = 15 + (v * v) / (2 * this.brakeDecel);
    for (let k = this.idx; k < path.length && this.dist[k] - this.dist[this.idx] < horizon; k++) {
      const vMax = Math.sqrt(this.latLimit * this.radius[k]);
      const dd = this.dist[k] - this.dist[this.idx];
      const allowed = Math.sqrt(vMax * vMax + 2 * this.brakeDecel * dd);
      if (allowed < vTarget) vTarget = allowed;
    }
    const throttle = v < vTarget - 0.5;
    const brake = v > vTarget + 2.5;
    let st = steer;
    // Freiner en braquant fort fait déraper : le pilote freine avec un braquage modéré.
    if (brake && Math.abs(st) > 0.45) st = Math.sign(st) * 0.45;
    return { throttle, brake, steer: st, drift: false };
  }
}
