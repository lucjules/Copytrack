// Physique arcade de la voiture : pas fixe, déterministe, sans moteur externe.
// La voiture glisse sur la surface analytique des pièces ; les bordures sont
// des murs (deux sondes circulaires, avant et arrière).
import { CELL, DT, ROAD_HALF, RAIL_W, RAIL_H, SLAB_T } from './constants.js';
import { PIECES, toLocal, sampleLocal, rotVec } from './pieces.js';

export const CAR = {
  accel: 27,          // m/s² à bas régime
  maxSpeed: 52,       // vitesse visée moteur (m/s)
  boostSpeed: 76,
  boostAccel: 36,
  boostTime: 1.6,
  brake: 40,
  reverseAccel: 14,
  reverseMax: 14,
  roll: 0.6,
  drag: 0.0024,
  coast: 2.2,
  latGrip: 48,        // accélération latérale max (m/s²)
  driftGrip: 0.32,
  turnMax: 2.5,       // rad/s
  turnFall: 34,
  airTurn: 1.7,
  gravity: 25,
  snap: 0.7,
  step: 1.6,
  launch: 9.5,        // vitesse normale au-delà de laquelle on décolle
  radius: 1.0,
  probe: 1.25,
  height: 1.3,
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const L1 = { lx: 0, lz: 0 }, L2 = { lx: 0, lz: 0 };
const S1 = {}, S2 = {};
const W1 = { x: 0, z: 0 };
const HIT = { dx: 0, dz: 0, nx: 0, nz: 0 };

export class CarPhysics {
  constructor(track) {
    this.track = track;
    this.pos = { x: 0, y: 0, z: 0 };
    this.prev = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.n = { x: 0, y: 1, z: 0 };
    this.surf = {};
    this.ev = { wall: 0, land: 0, boostHit: false };
    this.setBounds();
    this.place(0, 0.4, 0, 0);
  }

  setBounds() {
    const b = this.track.bounds();
    const m = CELL * 3;
    this.bx0 = b.minX - m; this.bx1 = b.maxX + m;
    this.bz0 = b.minZ - m; this.bz1 = b.maxZ + m;
  }

  place(x, y, z, yaw) {
    this.pos.x = x; this.pos.y = y; this.pos.z = z;
    this.prev.x = x; this.prev.y = y; this.prev.z = z;
    this.vel.x = 0; this.vel.y = 0; this.vel.z = 0;
    this.yaw = yaw; this.prevYaw = yaw; this.yawRate = 0;
    this.steer = 0; this.boost = 0; this.slip = 0; this.airTime = 0; this.fwdSpeed = 0;
    const s = this.track.surfaceAt(x, y + 0.5, z, this.surf, 3);
    this.pos.y = s.h;
    this.prev.y = s.h;
    this.grounded = true;
    this._setGround(s, false);
  }

  get speed() {
    const v = this.vel;
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }

  _setGround(s, triggers = true) {
    this.n.x = s.nx; this.n.y = s.ny; this.n.z = s.nz;
    this.surfType = s.type;
    this.tile = s.tile;
    if (triggers && s.tile && PIECES[s.tile.t].special === 'boost' && Math.abs(s.lx) < 5 && Math.abs(s.lz) < 7.5) {
      if (this.boost < CAR.boostTime - 0.2) this.ev.boostHit = true;
      this.boost = CAR.boostTime;
    }
  }

  step(inp) {
    const dt = DT, p = this.pos, v = this.vel, ev = this.ev;
    ev.wall = 0; ev.land = 0; ev.boostHit = false;
    this.prev.x = p.x; this.prev.y = p.y; this.prev.z = p.z;
    this.prevYaw = this.yaw;

    // Direction progressive (retour au centre plus rapide).
    const target = clamp(inp.steer || 0, -1, 1);
    const back = Math.abs(target) < Math.abs(this.steer) || target * this.steer < 0;
    const sr = (back ? 10 : 5.5) * dt;
    this.steer += clamp(target - this.steer, -sr, sr);
    if (this.boost > 0) this.boost = Math.max(0, this.boost - dt);

    let fx = -Math.sin(this.yaw), fy = 0, fz = -Math.cos(this.yaw);

    if (this.grounded) {
      const n = this.n;
      const d = fx * n.x + fy * n.y + fz * n.z;
      fx -= n.x * d; fy -= n.y * d; fz -= n.z * d;
      let len = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
      fx /= len; fy /= len; fz /= len;
      let rx = fy * n.z - fz * n.y, ry = fz * n.x - fx * n.z, rz = fx * n.y - fy * n.x;
      len = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
      rx /= len; ry /= len; rz /= len;

      let vf = v.x * fx + v.y * fy + v.z * fz;
      let vr = v.x * rx + v.y * ry + v.z * rz;
      // Gravité projetée sur la chaussée.
      vf -= CAR.gravity * fy * dt;
      vr -= CAR.gravity * ry * dt;

      const surf = this.surfType;
      const grip = surf === 'ice' ? 0.2 : surf === 'ground' ? 0.55 : 1;
      const traction = surf === 'ice' ? 0.45 : surf === 'ground' ? 0.7 : 1;
      const vmax = surf === 'ground' ? CAR.maxSpeed * 0.45 : CAR.maxSpeed;

      let a = 0;
      if (inp.throttle) {
        if (vf < -0.5) a += CAR.brake * traction;
        else { const x = vf / vmax; a += CAR.accel * traction * (1 - x * x); }
      }
      if (inp.brake) {
        if (vf > 0.5) a -= CAR.brake * traction;
        else if (!inp.throttle) {
          const x = Math.max(0, -vf) / CAR.reverseMax;
          a -= CAR.reverseAccel * traction * (1 - x * x);
        }
      }
      if (this.boost > 0) {
        const x = Math.max(0, vf) / CAR.boostSpeed;
        a += CAR.boostAccel * Math.max(0, 1 - x * x);
      }
      let res = CAR.roll + CAR.drag * vf * vf;
      if (!inp.throttle && !inp.brake) res += CAR.coast;
      if (inp.drift) res += 2.5;
      if (surf === 'ground') res += 5;
      const dvr = res * dt;
      if (Math.abs(vf) <= dvr) vf = 0; else vf -= Math.sign(vf) * dvr;
      vf += a * dt;

      // Adhérence latérale limitée => glisse naturelle à haute vitesse.
      const lat = CAR.latGrip * grip * (inp.drift ? CAR.driftGrip : 1) * dt;
      const corr = clamp(-vr, -lat, lat);
      vr += corr;
      // En dérive, une partie de la vitesse latérale "absorbée" est rendue vers l'avant.
      if (inp.drift && vf > 5) vf += Math.abs(corr) * 0.35;

      const sp = Math.abs(vf);
      let turn = CAR.turnMax * Math.min(1, sp / 5) / (1 + sp / CAR.turnFall);
      if (inp.drift) turn *= 1.55;
      this.yawRate = -this.steer * turn * (vf >= 0 ? 1 : -1);
      this.yaw += this.yawRate * dt;

      v.x = fx * vf + rx * vr;
      v.y = fy * vf + ry * vr;
      v.z = fz * vf + rz * vr;
      this.slip = Math.abs(vr);
      this.fwdSpeed = vf;
      this.airTime = 0;
    } else {
      v.y -= CAR.gravity * dt;
      this.yawRate = -this.steer * CAR.airTurn;
      this.yaw += this.yawRate * dt;
      const k = 1 - 0.0006 * this.speed * dt;
      v.x *= k; v.y *= k; v.z *= k;
      this.slip = 0;
      this.fwdSpeed = v.x * fx + v.z * fz;
      this.airTime += dt;
    }

    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    this._walls();
    this._bounds();

    // Contact avec la chaussée.
    const s = this.track.surfaceAt(p.x, p.y, p.z, this.surf, CAR.step);
    const gap = p.y - s.h;
    const vn = v.x * s.nx + v.y * s.ny + v.z * s.nz;
    if (this.grounded && gap < CAR.snap && gap > -CAR.step && vn < CAR.launch) {
      p.y = s.h;
      const sp = this.speed;
      v.x -= s.nx * vn; v.y -= s.ny * vn; v.z -= s.nz * vn;
      const sp2 = this.speed;
      if (sp2 > 1e-4) { const k = sp / sp2; v.x *= k; v.y *= k; v.z *= k; }
      this._setGround(s);
    } else if (!this.grounded && gap <= 0.02 && gap > -CAR.step && vn <= 0.5) {
      p.y = s.h;
      if (vn < 0) {
        v.x -= s.nx * vn; v.y -= s.ny * vn; v.z -= s.nz * vn;
        ev.land = -vn;
      }
      this.grounded = true;
      this._setGround(s);
    } else {
      this.grounded = false;
    }
  }

  _bounds() {
    const p = this.pos, v = this.vel;
    if (p.x < this.bx0) { p.x = this.bx0; if (v.x < 0) v.x = 0; }
    if (p.x > this.bx1) { p.x = this.bx1; if (v.x > 0) v.x = 0; }
    if (p.z < this.bz0) { p.z = this.bz0; if (v.z < 0) v.z = 0; }
    if (p.z > this.bz1) { p.z = this.bz1; if (v.z > 0) v.z = 0; }
  }

  _walls() {
    const p = this.pos, v = this.vel;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const pfx = -Math.sin(this.prevYaw), pfz = -Math.cos(this.prevYaw);
    let hit = 0, hnx = 0, hnz = 0;
    for (let k = -1; k <= 1; k += 2) {
      const off = CAR.probe * k;
      for (let iter = 0; iter < 2; iter++) {
        const c = this._probe(p.x + fx * off, p.z + fz * off,
          this.prev.x + pfx * off, this.prev.z + pfz * off, p.y);
        if (!c) break;
        p.x += c.dx; p.z += c.dz;
        const vn = v.x * c.nx + v.z * c.nz;
        if (vn < 0) {
          v.x -= c.nx * vn * 1.12;
          v.z -= c.nz * vn * 1.12;
          if (-vn > hit) { hit = -vn; hnx = c.nx; hnz = c.nz; }
        }
      }
    }
    if (hit > 0) {
      const loss = Math.min(0.3, hit * 0.01);
      v.x *= 1 - loss; v.y *= 1 - loss; v.z *= 1 - loss;
      this.ev.wall = hit;
      // Réaligne légèrement la voiture le long du mur.
      const sp = Math.hypot(v.x, v.z);
      if (sp > 3 && this.fwdSpeed > 0) {
        const vy = Math.atan2(-v.x, -v.z);
        let da = vy - this.yaw;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        this.yaw += da * Math.min(0.5, hit * 0.04);
      }
    }
    return hnx + hnz;
  }

  _probe(x, z, px, pz, y) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    const tiles = this.track.tilesAt(cx, cz);
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const P = PIECES[tile.t];
      if (P.kind === 'area') continue;
      toLocal(tile, x, z, L1);
      sampleLocal(tile, L1.lx, L1.lz, S1);
      if (!S1.inFootprint) continue;
      if (y > S1.h + RAIL_H - 0.15 || y + CAR.height < S1.h - SLAB_T - 0.2) continue;
      const ad = Math.abs(S1.d), R = CAR.radius;
      const inner = ROAD_HALF, outer = ROAD_HALF + RAIL_W;
      if (ad + R <= inner || ad - R >= outer) continue;
      toLocal(tile, px, pz, L2);
      sampleLocal(tile, L2.lx, L2.lz, S2);
      const inside = Math.abs(S2.d) < (inner + outer) * 0.5;
      const sgn = S1.d >= 0 ? 1 : -1;
      const targetD = inside ? inner - R : outer + R;
      const push = (targetD - ad) * sgn;
      rotVec(tile.r, S1.gx, S1.gz, W1);
      HIT.dx = W1.x * push; HIT.dz = W1.z * push;
      const ns = inside ? -sgn : sgn;
      HIT.nx = W1.x * ns; HIT.nz = W1.z * ns;
      return HIT;
    }
    return null;
  }
}
