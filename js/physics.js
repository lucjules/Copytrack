// Physique arcade de la voiture : pas fixe, déterministe, sans moteur externe.
// Au sol, la voiture glisse sur la surface analytique des pièces ; les bordures
// sont des murs (deux sondes circulaires, avant et arrière). Sur un ruban
// (looping, vrille, mur vertical, route à l'envers), elle suit la courbe
// paramétrée et décroche si elle est trop lente.
// La personnalisation du véhicule (forme, LED, dessins...) est purement visuelle :
// aucune de ces constantes n'en dépend.
import { CELL, DT, ROAD_HALF, RAIL_W, RAIL_H, SLAB_T, STICK_MIN } from './constants.js';
import {
  PIECES, toLocal, sampleLocal, rotVec, tileCenter, isRibbon, isFloor, tileParam,
} from './pieces.js';
import { ribbonOf, frameLocal } from './ribbons.js';

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
  bounce: 14,         // vitesse verticale donnée par un revêtement Rebond (100 %)
  wind: 20,           // accélération latérale du vent à 100 %
  radius: 1.0,
  probe: 1.25,
  height: 1.3,
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;
const L1 = { lx: 0, lz: 0 }, L2 = { lx: 0, lz: 0 };
const S1 = {}, S2 = {};
const W1 = { x: 0, z: 0 };
const FL = {};
const CC = { x: 0, z: 0 };
const TMP = { x: 0, z: 0 };
const HIT = { dx: 0, dz: 0, nx: 0, nz: 0 };

// Repère d'un ruban en coordonnées monde.
export function frameWorld(tile, rib, u, F) {
  frameLocal(rib, u, FL);
  const c = tileCenter(tile, CC);
  const r = tile.r;
  rotVec(r, FL.px, FL.pz, TMP); F.px = TMP.x + c.x; F.pz = TMP.z + c.z; F.py = FL.py;
  rotVec(r, FL.tx, FL.tz, TMP); F.tx = TMP.x; F.tz = TMP.z; F.ty = FL.ty;
  rotVec(r, FL.nx, FL.nz, TMP); F.nx = TMP.x; F.nz = TMP.z; F.ny = FL.ny;
  rotVec(r, FL.rx, FL.rz, TMP); F.rx = TMP.x; F.rz = TMP.z; F.ry = FL.ry;
  F.ds = FL.ds;
  return F;
}

export class CarPhysics {
  constructor(track) {
    this.track = track;
    this.pos = { x: 0, y: 0, z: 0 };
    this.prev = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.n = { x: 0, y: 1, z: 0 };
    this.fwd = { x: 0, y: 0, z: -1 };   // direction visuelle (utile sur un ruban)
    this.surf = {};
    this.F = {}; this.F0 = {}; this.F2 = {}; this.F3 = {};
    this.ev = {
      wall: 0, land: 0, boostHit: false, bounce: false, loopIn: false, loopOut: false, loopFall: false,
      moto: false, gravity: false,
    };
    this.rib = null;
    this.moto = false;
    this.gravMul = 1;
    this.setBounds();
    this.place(0, 0.4, 0, 0);
  }

  get g() {
    return CAR.gravity * this.gravMul;
  }

  get mode() {
    return this.rib ? 'ribbon' : 'ground';
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
    this.steer = 0; this.boost = 0; this.boostF = 1; this.slip = 0; this.airTime = 0; this.fwdSpeed = 0;
    this.driftT = 0; this.bounceCD = 0;
    this.rib = null;
    this.gravMul = 1;
    this.moto = false;
    this.lastMoto = null;
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
    if (this.rib) return;
    this.fwd.x = -Math.sin(this.yaw); this.fwd.y = 0; this.fwd.z = -Math.cos(this.yaw);
  }

  _setGround(s, triggers = true) {
    this.n.x = s.nx; this.n.y = s.ny; this.n.z = s.nz;
    this.surfType = s.type;
    this.surfMod = s.mod || '';
    this.surfTile = s.tile;
    this.surfP = s.tile ? tileParam(s.tile) / 100 : 1;
    if (!triggers || !s.tile) return;
    const mod = this.surfMod;
    if (mod === 'boost') {
      if (this.boost < CAR.boostTime - 0.2) this.ev.boostHit = true;
      this.boost = CAR.boostTime;
      this.boostF = this.surfP;
    } else if (mod === 'gravity') {
      const gm = this.surfP;
      if (Math.abs(gm - this.gravMul) > 0.01) { this.gravMul = gm; this.ev.gravity = true; }
    }
    if (mod === 'moto') {
      if (this.lastMoto !== s.tile) {
        this.lastMoto = s.tile;
        this.moto = !this.moto;
        this.ev.moto = true;
      }
    } else if (this.lastMoto) this.lastMoto = null;
  }

  step(inp) {
    const dt = DT, p = this.pos, v = this.vel, ev = this.ev;
    ev.wall = 0; ev.land = 0; ev.boostHit = false; ev.bounce = false;
    ev.loopIn = false; ev.loopOut = false; ev.loopFall = false; ev.moto = false; ev.gravity = false;
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

    if (this.rib) { this._ribStep(inp); return; }

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
      const g = this.g;
      vf -= g * fy * dt;
      vr -= g * ry * dt;

      // Effet du revêtement (le paramètre f vaut 1 à 100 %).
      const mod = this.surfMod, f = this.surfP;
      const ground = this.surfType === 'ground';
      let grip = 1, traction = 1, vmaxK = 1, extraDrag = 0;
      if (ground) { grip = 0.55; traction = 0.7; vmaxK = 0.45; extraDrag = 5; }
      else if (mod === 'ice') { grip = clamp(0.2 / f, 0.05, 0.85); traction = 0.45; }
      else if (mod === 'sand') { grip = 0.8; traction = 0.65; vmaxK = clamp(1 - 0.45 * f, 0.25, 1); extraDrag = 5 * f; }
      else if (mod === 'mud') { grip = 0.7; traction = 0.55; vmaxK = clamp(1 - 0.5 * f, 0.2, 1); extraDrag = 6 * f; }
      else if (mod === 'magnet') grip = 1.45 * f;
      else if (mod === 'drift') grip = clamp(0.5 / f, 0.18, 1.2);
      else if (mod === 'slow') extraDrag = 14 * f;
      else if (mod === 'wind') {
        const a = ((tileParamRaw(this.surfTile) - 100) / 100) * CAR.wind;
        rotVec(this.surfTile.r, 1, 0, TMP);
        vf += (TMP.x * fx + TMP.z * fz) * a * dt;
        vr += (TMP.x * rx + TMP.z * rz) * a * dt;
      }

      vf = this._longitudinal(vf, inp, CAR.maxSpeed * vmaxK, traction, extraDrag, dt);

      // Adhérence latérale limitée ; en dérapage elle chute progressivement.
      const drift = this.driftT;
      const lat = CAR.latGrip * grip * (1 - (1 - CAR.driftGrip) * drift) * dt;
      const corr = clamp(-vr, -lat, lat);
      vr += corr;
      // La vitesse latérale « absorbée » en glisse est en partie rendue vers l'avant.
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
      v.y -= this.g * dt;
      this.yawRate = -this.steer * CAR.airTurn;
      this.yaw += this.yawRate * dt;
      const k = 1 - 0.0006 * this.speed * dt;
      v.x *= k; v.y *= k; v.z *= k;
      this.slip = 0;
      this.fwdSpeed = v.x * fx + v.z * fz;
      this.airTime += dt;
    }

    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    if (this._tryEnterRibbon()) return;
    this._walls();
    this._bounds();

    // Contact avec la chaussée.
    const s = this.track.surfaceAt(p.x, p.y, p.z, this.surf, CAR.step);
    const gap = p.y - s.h;
    const vn = v.x * s.nx + v.y * s.ny + v.z * s.nz;
    const magnet = s.mod === 'magnet';
    const mk = magnet ? tileParam(s.tile) / 100 : 1;
    const launch = magnet ? CAR.launch * (1 + 2 * mk) : CAR.launch;
    const snap = magnet ? CAR.snap * (1 + mk) : CAR.snap;
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
      const add = Math.max(0, CAR.bounce * this.surfP - vn2);
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
      const f = this.boostF;
      const vb = CAR.maxSpeed + (CAR.boostSpeed - CAR.maxSpeed) * f;
      const x = Math.max(0, vf) / vb;
      a += CAR.boostAccel * f * Math.max(0, 1 - x * x);
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
      if (P.kind === 'area' || tile.nb || !isFloor(tile)) continue;
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

  // ---------------------------------------------------------------- Rubans
  // Détecte le franchissement d'une extrémité de ruban (plan perpendiculaire à la route).
  _tryEnterRibbon() {
    const p = this.pos, q = this.prev, v = this.vel;
    const sp = this.speed;
    if (sp < 3) return false;
    const c1x = Math.floor(p.x / CELL), c1z = Math.floor(p.z / CELL);
    const c2x = Math.floor(q.x / CELL), c2z = Math.floor(q.z / CELL);
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 1 && c1x === c2x && c1z === c2z) break;
      const tiles = pass === 0 ? this.track.tilesAt(c1x, c1z) : this.track.tilesAt(c2x, c2z);
      for (const tile of tiles) {
        if (!isRibbon(tile)) continue;
        const rib = ribbonOf(tile);
        for (let end = 0; end < 2; end++) {
          const F = frameWorld(tile, rib, end, this.F);
          const sg = end === 0 ? 1 : -1;
          const tx = F.tx * sg, ty = F.ty * sg, tz = F.tz * sg;
          const dc = (p.x - F.px) * tx + (p.y - F.py) * ty + (p.z - F.pz) * tz;
          const dp = (q.x - F.px) * tx + (q.y - F.py) * ty + (q.z - F.pz) * tz;
          if (!(dp < 0 && dc >= 0)) continue;
          const dl = (p.x - F.px) * F.rx + (p.y - F.py) * F.ry + (p.z - F.pz) * F.rz;
          const dn = (p.x - F.px) * F.nx + (p.y - F.py) * F.ny + (p.z - F.pz) * F.nz;
          if (Math.abs(dl) > ROAD_HALF + 0.6 || dn < -1.4 || dn > 3.2) continue;
          const vs = v.x * tx + v.y * ty + v.z * tz;
          if (vs < 2.5) continue;
          // La voiture doit être orientée comme la route (évite de « traverser » un mur).
          if (this.grounded && (this.n.x * F.nx + this.n.y * F.ny + this.n.z * F.nz) < 0.35) continue;
          this._enterRibbon(tile, rib, end, dc / F.ds, dl, vs, v.x * F.rx + v.y * F.ry + v.z * F.rz);
          return true;
        }
      }
    }
    return false;
  }

  _enterRibbon(tile, rib, end, along, dl, vs, vl) {
    const u = clamp(end === 0 ? along : 1 - along, 0, 1);
    this.rib = { tile, rib, u, dir: end === 0 ? 1 : -1, vs, dl: clamp(dl, -ROAD_HALF + 1, ROAD_HALF - 1), vl };
    this.ev.loopIn = true;
    this._ribPlace(this.rib);
  }

  _ribStep(inp) {
    const R = this.rib, dt = DT, tile = R.tile, rib = R.rib;
    let F = frameWorld(tile, rib, R.u, this.F);

    // Revêtements actifs sur ce ruban.
    const mod = tile.s, f = tileParam(tile) / 100;
    let extraDrag = 0;
    if (mod === 'boost') {
      if (this.boost < CAR.boostTime - 0.2) this.ev.boostHit = true;
      this.boost = CAR.boostTime; this.boostF = f;
    } else if (mod === 'slow') extraDrag = 14 * f;
    else if (mod === 'sand') extraDrag = 5 * f;
    else if (mod === 'mud') extraDrag = 6 * f;

    // Moteur / freins dans le sens de la voiture, gravité le long du ruban.
    let vf = this._longitudinal(R.vs, inp, CAR.maxSpeed, 1, extraDrag, dt);
    vf -= this.g * R.dir * F.ty * dt;
    R.vs = vf;

    // Déplacement latéral piloté (axe droit de la route).
    const targetVl = this.steer * R.dir * Math.min(9, Math.abs(vf) * 0.3);
    R.vl += (targetVl - R.vl) * Math.min(1, dt * 6);
    R.dl += R.vl * dt;
    if (tile.nb) {
      if (Math.abs(R.dl) > ROAD_HALF + 0.3) { this._ribDetach(F); return; }
    } else {
      const lim = ROAD_HALF - CAR.radius - 0.2;
      if (Math.abs(R.dl) > lim) {
        if (Math.abs(R.vl) > 3) this.ev.wall = Math.abs(R.vl);
        R.dl = clamp(R.dl, -lim, lim);
        R.vl = 0;
      }
    }

    R.u += (R.dir * vf * dt) / F.ds;
    this.fwdSpeed = vf; this.slip = 0; this.yawRate = 0;
    if (R.u > 1 || R.u < 0) { this._ribEnd(R.u > 1 ? 1 : 0); return; }

    F = frameWorld(tile, rib, R.u, this.F);
    // Pression sur la route : centripète + gravité (ou adhérence « magique »).
    if (rib.stick) {
      if (F.ny < 0.5 && Math.abs(vf) < STICK_MIN) { this._ribDetach(F); return; }
    } else if (R.u > rib.minU && R.u < 1 - rib.minU) {
      const dU = 0.004;
      const F0 = frameWorld(tile, rib, Math.max(0, R.u - dU), this.F0);
      const F2 = frameWorld(tile, rib, Math.min(1, R.u + dU), this.F2);
      const k = 1 / (F.ds * (Math.min(1, R.u + dU) - Math.max(0, R.u - dU)));
      const kn = ((F2.tx - F0.tx) * F.nx + (F2.ty - F0.ty) * F.ny + (F2.tz - F0.tz) * F.nz) * k;
      const press = vf * vf * kn + this.g * F.ny;
      if (press < 0) { this._ribDetach(F); return; }
    }
    this._ribPlace(R);
  }

  // Place la voiture sur le ruban (position, vitesse, orientation monde).
  _ribPlace(R) {
    const F = frameWorld(R.tile, R.rib, R.u, this.F);
    const p = this.pos, v = this.vel;
    p.x = F.px + F.rx * R.dl; p.y = F.py + F.ry * R.dl; p.z = F.pz + F.rz * R.dl;
    const d = R.dir;
    v.x = F.tx * d * R.vs + F.rx * R.vl;
    v.y = F.ty * d * R.vs + F.ry * R.vl;
    v.z = F.tz * d * R.vs + F.rz * R.vl;
    this.n.x = F.nx; this.n.y = F.ny; this.n.z = F.nz;
    this.fwd.x = F.tx * d; this.fwd.y = F.ty * d; this.fwd.z = F.tz * d;
    if (Math.hypot(this.fwd.x, this.fwd.z) > 0.3) this.yaw = Math.atan2(-this.fwd.x, -this.fwd.z);
    this.grounded = true;
    this.surfType = 'road';
    this.surfMod = '';
    this.fwdSpeed = R.vs;
  }

  _ribDetach(F) {
    this._ribPlace(this.rib);
    this.rib = null;
    this.grounded = false;
    this.ev.loopFall = true;
    void F;
  }

  // Fin de ruban : passe au ruban suivant s'il est raccordé, sinon retour au sol.
  _ribEnd(endU) {
    const R = this.rib;
    R.u = endU;
    this._ribPlace(R);
    const F = frameWorld(R.tile, R.rib, endU, this.F);
    const d = R.dir;
    const fx = F.tx * d, fy = F.ty * d, fz = F.tz * d;
    const px = this.pos.x, py = this.pos.y, pz = this.pos.z;
    const next = this._matchRibbon(R.tile, F, fx, fy, fz);
    if (next) {
      const F2 = frameWorld(next.tile, next.rib, next.end, this.F2);
      const vx = this.vel.x, vy = this.vel.y, vz = this.vel.z;
      this.rib = {
        tile: next.tile, rib: next.rib, u: next.end, dir: next.end === 0 ? 1 : -1,
        vs: R.vs,
        dl: clamp((px - F2.px) * F2.rx + (py - F2.py) * F2.ry + (pz - F2.pz) * F2.rz, -ROAD_HALF + 1, ROAD_HALF - 1),
        vl: vx * F2.rx + vy * F2.ry + vz * F2.rz,
      };
      this._ribPlace(this.rib);
      return;
    }
    // Retour au sol.
    this.rib = null;
    this.ev.loopOut = true;
    const hz = Math.hypot(fx, fz);
    if (hz > 0.2) this.yaw = Math.atan2(-fx, -fz);
    this.prevYaw = this.yaw;
    if (F.ny > 0.6) {
      this.grounded = true;
      this.vel.y = Math.min(this.vel.y, 0);
      this.n.x = 0; this.n.y = 1; this.n.z = 0;
    } else {
      this.grounded = false;
    }
    this._updateFwd();
  }

  _matchRibbon(curTile, F, fx, fy, fz) {
    const seen = new Set();
    const px = F.px, py = F.py, pz = F.pz;
    const cells = new Set();
    for (const off of [0, 1.5]) {
      // Les extrémités tombent pile sur une frontière de case : on regarde les cases voisines.
      for (const dx of [-0.6, 0, 0.6]) {
        for (const dz of [-0.6, 0, 0.6]) {
          cells.add(Math.floor((px + fx * off + dx) / CELL) + ',' + Math.floor((pz + fz * off + dz) / CELL));
        }
      }
    }
    for (const c of cells) {
      const [cx, cz] = c.split(',').map(Number);
      for (const tile of this.track.tilesAt(cx, cz)) {
        if (tile === curTile || seen.has(tile) || !isRibbon(tile)) continue;
        seen.add(tile);
        const rib = ribbonOf(tile);
        for (let end = 0; end < 2; end++) {
          const G = frameWorld(tile, rib, end, this.F3);
          const dist = Math.hypot(G.px - px, G.py - py, G.pz - pz);
          if (dist > 3.5) continue;
          const sg = end === 0 ? 1 : -1;
          if (G.tx * sg * fx + G.ty * sg * fy + G.tz * sg * fz < 0.7) continue;
          if (G.nx * F.nx + G.ny * F.ny + G.nz * F.nz < 0.6) continue;
          return { tile, rib, end };
        }
      }
    }
    return null;
  }
}

function tileParamRaw(tile) {
  return tileParam(tile);
}
