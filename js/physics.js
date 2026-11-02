// Physique arcade de la voiture : pas fixe, déterministe, sans moteur externe.
// La voiture glisse sur la surface analytique des pièces ; les bordures sont
// des murs (deux sondes circulaires, avant et arrière). Dans un looping, la
// voiture suit un ruban paramétrique et décroche si elle est trop lente.
import { CELL, DT, ROAD_HALF, RAIL_W, RAIL_H, SLAB_T, LOOP_R, LOOP_LANE } from './constants.js';
import {
  PIECES, SURFACES, toLocal, toLocalVec, sampleLocal, rotVec, baseY, loopFrame, localToWorld,
} from './pieces.js';

export const CAR = {
  accel: 28,          // m/s² à bas régime
  maxSpeed: 54,       // vitesse visée moteur (m/s)
  boostSpeed: 78,
  boostAccel: 38,
  boostTime: 1.6,
  brake: 42,
  reverseAccel: 15,
  reverseMax: 15,
  roll: 0.6,
  drag: 0.0023,
  coast: 2.0,
  latGrip: 56,        // accélération latérale max (m/s²)
  driftGrip: 0.38,
  driftTurn: 1.5,
  turnMax: 2.6,       // rad/s
  turnFall: 44,
  steerIn: 8,         // vitesse de braquage
  steerOut: 14,       // retour au centre
  assist: 2.6,        // ré-alignement automatique sur la trajectoire
  airTurn: 2.3,
  gravity: 25,
  snap: 0.7,
  step: 1.6,
  launch: 9.5,        // vitesse normale au-delà de laquelle on décolle
  bounce: 14,         // vitesse verticale donnée par un revêtement Rebond
  radius: 1.0,
  probe: 1.25,
  height: 1.3,
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;
const L1 = { lx: 0, lz: 0 }, L2 = { lx: 0, lz: 0 }, LV = { lx: 0, lz: 0 };
const S1 = {}, S2 = {};
const W1 = { x: 0, z: 0 }, W2 = { x: 0, z: 0 };
const F1 = {};
const HIT = { dx: 0, dz: 0, nx: 0, nz: 0 };

export class CarPhysics {
  constructor(track) {
    this.track = track;
    this.pos = { x: 0, y: 0, z: 0 };
    this.prev = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.n = { x: 0, y: 1, z: 0 };
    this.fwd = { x: 0, y: 0, z: -1 };   // direction visuelle (utile dans le looping)
    this.surf = {};
    this.ev = { wall: 0, land: 0, boostHit: false, bounce: false, loopIn: false, loopOut: false, loopFall: false };
    this.loop = null;
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
    this.driftT = 0; this.bounceCD = 0;
    this.mode = 'ground';
    this.loop = null;
    const s = this.track.surfaceAt(x, y + 0.5, z, this.surf, 3);
    this.pos.y = s.h;
    this.prev.y = s.h;
    this.grounded = true;
    this._setGround(s, false);
    this._updateFwd();
  }

  get speed() {
    const v = this.vel;
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }

  _updateFwd() {
    if (this.mode === 'loop') return;
    this.fwd.x = -Math.sin(this.yaw); this.fwd.y = 0; this.fwd.z = -Math.cos(this.yaw);
  }

  _setGround(s, triggers = true) {
    this.n.x = s.nx; this.n.y = s.ny; this.n.z = s.nz;
    this.surfType = s.type;
    this.surfMod = s.mod || '';
    this.tile = s.tile;
    if (!triggers || !s.tile) return;
    if (this.surfMod === 'boost') {
      if (this.boost < CAR.boostTime - 0.2) this.ev.boostHit = true;
      this.boost = CAR.boostTime;
    }
  }

  step(inp) {
    const dt = DT, p = this.pos, v = this.vel, ev = this.ev;
    ev.wall = 0; ev.land = 0; ev.boostHit = false; ev.bounce = false;
    ev.loopIn = false; ev.loopOut = false; ev.loopFall = false;
    this.prev.x = p.x; this.prev.y = p.y; this.prev.z = p.z;
    this.prevYaw = this.yaw;

    // Direction progressive (retour au centre plus rapide).
    const target = clamp(inp.steer || 0, -1, 1);
    const back = Math.abs(target) < Math.abs(this.steer) || target * this.steer < 0;
    const sr = (back ? CAR.steerOut : CAR.steerIn) * dt;
    this.steer += clamp(target - this.steer, -sr, sr);
    if (this.boost > 0) this.boost = Math.max(0, this.boost - dt);
    if (this.bounceCD > 0) this.bounceCD -= dt;
    this.driftT = inp.drift ? Math.min(1, this.driftT + dt * 6) : Math.max(0, this.driftT - dt * 3.5);

    if (this.mode === 'loop') { this._loopStep(inp); return; }

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
      vf -= CAR.gravity * fy * dt;
      vr -= CAR.gravity * ry * dt;

      const S = SURFACES[this.surfMod] || SURFACES[''];
      const ground = this.surfType === 'ground';
      const grip = ground ? 0.55 : S.grip ?? 1;
      const traction = ground ? 0.7 : S.traction ?? 1;
      const vmax = CAR.maxSpeed * (ground ? 0.45 : S.vmax ?? 1);

      vf = this._longitudinal(vf, inp, vmax, traction, (ground ? 5 : S.drag || 0), dt);

      // Adhérence latérale limitée ; en dérapage elle chute progressivement.
      const drift = this.driftT;
      const lat = CAR.latGrip * grip * (1 - (1 - CAR.driftGrip) * drift) * dt;
      const corr = clamp(-vr, -lat, lat);
      vr += corr;
      // La vitesse latérale "absorbée" en glisse est en partie rendue vers l'avant.
      if (vf > 5) vf += Math.abs(corr) * (0.2 + 0.35 * drift);

      const sp = Math.abs(vf);
      let turn = (CAR.turnMax * Math.min(1, sp / 3)) / (1 + sp / CAR.turnFall);
      turn *= 1 + (CAR.driftTurn - 1) * drift;
      let yawRate = -this.steer * turn * (vf >= 0 ? 1 : -1);
      // Aide au contre-braquage : le nez revient vers la trajectoire.
      if (sp > 4 && vf > 0) {
        const beta = Math.atan2(vr, Math.max(6, vf));
        yawRate -= beta * CAR.assist * (1 - 0.7 * drift) * Math.min(1, grip);
      }
      this.yawRate = yawRate;
      this.yaw += yawRate * dt;

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
    if (this._checkLoopEntry()) return;
    this._walls();
    this._bounds();

    // Contact avec la chaussée.
    const s = this.track.surfaceAt(p.x, p.y, p.z, this.surf, CAR.step);
    const gap = p.y - s.h;
    const vn = v.x * s.nx + v.y * s.ny + v.z * s.nz;
    const magnet = s.mod === 'magnet';
    const launch = magnet ? CAR.launch * 3 : CAR.launch;
    const snap = magnet ? CAR.snap * 2 : CAR.snap;
    if (this.grounded && gap < snap && gap > -CAR.step && vn < launch) {
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
      this._alignOnLanding();
    } else {
      this.grounded = false;
    }

    // Revêtement Rebond : propulse la voiture vers le haut.
    if (this.grounded && this.surfMod === 'bounce' && this.bounceCD <= 0) {
      const n = this.n;
      const vn2 = v.x * n.x + v.y * n.y + v.z * n.z;
      const add = Math.max(0, CAR.bounce - vn2);
      v.x += n.x * add; v.y += n.y * add; v.z += n.z * add;
      this.grounded = false;
      this.bounceCD = 0.4;
      ev.bounce = true;
    }
    this._updateFwd();
  }

  // Moteur, freins, résistances le long de l'axe de la voiture.
  _longitudinal(vf, inp, vmax, traction, extraDrag, dt) {
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
    let res = CAR.roll + CAR.drag * vf * vf + extraDrag;
    if (!inp.throttle && !inp.brake) res += CAR.coast;
    res += 1.5 * this.driftT;
    const dvr = res * dt;
    if (Math.abs(vf) <= dvr) vf = 0; else vf -= Math.sign(vf) * dvr;
    return vf + a * dt;
  }

  // À la réception d'un saut, le cap se recale en partie sur la trajectoire.
  _alignOnLanding() {
    const v = this.vel;
    const sp = Math.hypot(v.x, v.z);
    if (sp < 5) return;
    const vy = Math.atan2(-v.x, -v.z);
    let da = vy - this.yaw;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    if (Math.abs(da) < 1.2) this.yaw += da * 0.5;
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
    let hit = 0;
    for (let k = -1; k <= 1; k += 2) {
      const off = CAR.probe * k;
      for (let iter = 0; iter < 2; iter++) {
        const c = this._probe(p.x + fx * off, p.z + fz * off,
          this.prev.x + pfx * off, this.prev.z + pfz * off, p.y);
        if (!c) break;
        p.x += c.dx; p.z += c.dz;
        const vn = v.x * c.nx + v.z * c.nz;
        if (vn < 0) {
          v.x -= c.nx * vn * 1.08;
          v.z -= c.nz * vn * 1.08;
          if (-vn > hit) hit = -vn;
        }
      }
    }
    if (hit > 0) {
      const loss = Math.min(0.2, hit * 0.006);
      v.x *= 1 - loss; v.y *= 1 - loss; v.z *= 1 - loss;
      this.ev.wall = hit;
      // Réaligne la voiture le long du mur.
      const sp = Math.hypot(v.x, v.z);
      if (sp > 3 && this.fwdSpeed > 0) {
        const vy = Math.atan2(-v.x, -v.z);
        let da = vy - this.yaw;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        this.yaw += da * Math.min(0.6, 0.15 + hit * 0.05);
      }
    }
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

  // ---------------------------------------------------------------- Looping
  _checkLoopEntry() {
    if (!this.grounded) return false;
    const p = this.pos, q = this.prev;
    const tiles = this.track.tilesAt(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    for (const tile of tiles) {
      const P = PIECES[tile.t];
      if (P.kind !== 'loop') continue;
      const base = baseY(tile);
      if (Math.abs(p.y - base) > 1.2) continue;
      toLocal(tile, p.x, p.z, L1);
      toLocal(tile, q.x, q.z, L2);
      const m = P.mirror;
      const laneA = -m * LOOP_LANE, laneB = m * LOOP_LANE;
      if (L2.lz >= 0 && L1.lz < 0 && Math.abs(L2.lx - laneA) <= ROAD_HALF) {
        this._enterLoop(tile, P, base, Math.min(0.3, -L1.lz / LOOP_R), L1.lx - laneA);
        return true;
      }
      if (L2.lz <= 0 && L1.lz > 0 && Math.abs(L2.lx - laneB) <= ROAD_HALF) {
        this._enterLoop(tile, P, base, TAU - Math.min(0.3, L1.lz / LOOP_R), L1.lx - laneB);
        return true;
      }
    }
    return false;
  }

  _enterLoop(tile, P, base, th, dl) {
    const v = this.vel;
    toLocalVec(tile.r, v.x, v.z, LV);
    const F = loopFrame(P.mirror, base, th, F1);
    const vs = LV.lx * F.tx + v.y * F.ty + LV.lz * F.tz;
    const vl = LV.lx * F.rx + v.y * F.ry + LV.lz * F.rz;
    toLocalVec(tile.r, -Math.sin(this.yaw), -Math.cos(this.yaw), LV);
    const dir = LV.lx * F.tx + LV.lz * F.tz >= 0 ? 1 : -1;
    this.loop = { tile, m: P.mirror, base, th, vs, dl: clamp(dl, -ROAD_HALF + 1, ROAD_HALF - 1), vl, dir };
    this.mode = 'loop';
    this.ev.loopIn = true;
    this._applyLoopFrame();
  }

  _loopStep(inp) {
    const Lp = this.loop, dt = DT;
    let F = loopFrame(Lp.m, Lp.base, Lp.th, F1);
    // Moteur / freins dans le sens de la voiture, gravité le long du ruban.
    let vf = Lp.vs * Lp.dir;
    vf = this._longitudinal(vf, inp, CAR.maxSpeed, 1, 0, dt);
    Lp.vs = vf * Lp.dir - CAR.gravity * F.ty * dt;
    // Déplacement latéral piloté.
    const targetVl = this.steer * Lp.dir * Math.min(9, Math.abs(Lp.vs) * 0.3);
    Lp.vl += (targetVl - Lp.vl) * Math.min(1, dt * 6);
    Lp.dl += Lp.vl * dt;
    const lim = ROAD_HALF - CAR.radius - 0.2;
    if (Math.abs(Lp.dl) > lim) {
      if (Math.abs(Lp.vl) > 3) this.ev.wall = Math.abs(Lp.vl);
      Lp.dl = clamp(Lp.dl, -lim, lim);
      Lp.vl = 0;
    }
    Lp.th += (Lp.vs / F.ds) * dt;
    this.fwdSpeed = Lp.vs * Lp.dir;
    this.slip = 0;
    this.yawRate = 0;

    if (Lp.th >= TAU) { this._exitLoop(TAU); return; }
    if (Lp.th <= 0) { this._exitLoop(0); return; }

    F = loopFrame(Lp.m, Lp.base, Lp.th, F1);
    // Force d'appui : la voiture décroche si la vitesse ne suffit plus.
    const press = (Lp.vs * Lp.vs) / LOOP_R + CAR.gravity * F.ny;
    this._applyLoopFrame();
    if (press < 0 && Lp.th > 0.6 && Lp.th < TAU - 0.6) {
      this.mode = 'ground';
      this.loop = null;
      this.grounded = false;
      this.ev.loopFall = true;
      if (Math.hypot(this.fwd.x, this.fwd.z) > 0.2) this.yaw = Math.atan2(-this.fwd.x, -this.fwd.z);
    }
  }

  // Place la voiture sur le ruban (position, vitesse, orientation monde).
  _applyLoopFrame() {
    const Lp = this.loop;
    const F = loopFrame(Lp.m, Lp.base, Lp.th, F1);
    const lx = F.px + F.rx * Lp.dl, ly = F.py + F.ry * Lp.dl, lz = F.pz + F.rz * Lp.dl;
    localToWorld(Lp.tile, lx, lz, W2);
    this.pos.x = W2.x; this.pos.y = ly; this.pos.z = W2.z;
    const vlx = F.tx * Lp.vs + F.rx * Lp.vl, vly = F.ty * Lp.vs + F.ry * Lp.vl, vlz = F.tz * Lp.vs + F.rz * Lp.vl;
    rotVec(Lp.tile.r, vlx, vlz, W1);
    this.vel.x = W1.x; this.vel.y = vly; this.vel.z = W1.z;
    rotVec(Lp.tile.r, F.nx, F.nz, W1);
    this.n.x = W1.x; this.n.y = F.ny; this.n.z = W1.z;
    rotVec(Lp.tile.r, F.tx * Lp.dir, F.tz * Lp.dir, W1);
    this.fwd.x = W1.x; this.fwd.y = F.ty * Lp.dir; this.fwd.z = W1.z;
    this.grounded = true;
    this.surfType = 'road';
    this.surfMod = '';
  }

  _exitLoop(th) {
    const Lp = this.loop;
    Lp.th = th;
    this._applyLoopFrame();
    this.yaw = Math.atan2(-this.fwd.x, -this.fwd.z);
    this.prevYaw = this.yaw;
    this.vel.y = 0;
    this.n.x = 0; this.n.y = 1; this.n.z = 0;
    this.pos.y = Lp.base;
    this.mode = 'ground';
    this.loop = null;
    this.grounded = true;
    this.ev.loopOut = true;
    this._updateFwd();
  }
}
