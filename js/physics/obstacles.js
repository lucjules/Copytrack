// Contacts de la voiture avec les obstacles (piques, balanciers, marteaux, murs coulissants, balayeurs, bumpers).
// Ces méthodes s'ajoutent au prototype de CarPhysics (voir physics.js) : `this` est la voiture.
import { DT } from '../constants.js';
import { OBST, OBSTACLE_CELL, obstacleKey, obstacleLocal, toLocalObs, obstacleRadius } from '../obstacles.js';
import { CAR } from './specs.js';
import { clamp } from '../mathutil.js';

const OB = {};
const OL = {};
const fin = Number.isFinite;

export const obstacleMethods = {
  // Le temps des obstacles est le chrono de la course (this.clock = pas de course, fixé
  // par l'appelant avant chaque pas) : même mouvement en replay et après un retour (R).
  // L'index spatial (cases de 20 m) appartient au circuit : il est construit une fois par version du circuit,
  // pas par voiture ni par pas. Les cases voisines sont parcourues dans le même ordre qu'avant (ix puis iz, puis ordre du circuit) :
  // l'ordre compte, chaque contact corrige la position avant le test du suivant.
  _obstacles() {
    const track = this.track;
    if (!track.obstacles.length || this.hazardGrace > 0) return;
    const grid = track.obstacleGrid;
    const t = (this.clock || 0) * DT;
    const p = this.pos, n0 = this.n;
    const gx = Math.floor((p.x + n0.x * 0.8) / OBSTACLE_CELL), gz = Math.floor((p.z + n0.z * 0.8) / OBSTACLE_CELL);
    for (let ix = gx - 3; ix <= gx + 3; ix++) {
      for (let iz = gz - 3; iz <= gz + 3; iz++) {
        const bucket = grid.get(obstacleKey(ix, iz));
        if (bucket === undefined) continue;
        for (let i = 0; i < bucket.length; i++) if (this._obstacleContact(bucket[i], t)) return;
      }
    }
  },

  // Contact de la voiture avec l'obstacle d au temps t (s). Renvoie true si le contact est létal (le pas se termine aussitôt).
  _obstacleContact(d, t) {
    const p = this.pos, v = this.vel, n0 = this.n;
    // Le centre est recalculé à chaque obstacle : plusieurs obstacles proches ne doivent pas être testés contre
    // la position d'avant le premier choc.
    const cx = p.x + n0.x * 0.8, cy = p.y + n0.y * 0.8, cz = p.z + n0.z * 0.8;
    if (!d || !OBST[d.k] || !fin(d.x) || !fin(d.y) || !fin(d.z) || !fin(d.s || 1) || !fin(d.ry || 0)) return false;
    if (Math.abs(cx - d.x) > 40 || Math.abs(cz - d.z) > 40) return false;
    const rr = obstacleRadius(d) + 3;
    if ((cx - d.x) ** 2 + (cz - d.z) ** 2 > rr * rr) return false;
    const def = OBST[d.k], k = d.s || 1, rc = 1.4 / k;
    if (!(k > 0) || !fin(rc)) return false;
    obstacleLocal(d, t, OB);
    toLocalObs(d, cx, cy, cz, OL);
    if (!(fin(OB.x) && fin(OB.y) && fin(OB.z) && fin(OB.vx) && fin(OB.vy) && fin(OB.vz) && fin(OB.on) && fin(OL.x) && fin(OL.y) && fin(OL.z))) return false;
    let nx = 0, ny = 0, nz = 0, pen = 0, ovx = 0, ovy = 0, ovz = 0;
    if (def.type === 'spike') {
      if (OB.on < 0.4 || this.graceT > 0) return false;
      if (Math.abs(OL.x) < def.hx + rc * 0.6 && Math.abs(OL.z) < def.hz + rc * 0.6 && OL.y < def.hy * OB.on + rc && OL.y > -1.5) {
        this.ev.spike = true; this.ev.sink = true;
        return true;
      }
      return false;
    } else if (def.type === 'ball') {
      const dx = OL.x - OB.x, dy = OL.y - OB.y, dz = OL.z;
      const dd = Math.hypot(dx, dy, dz);
      if (dd >= def.r + rc) return false;
      if (dd < 1e-6) { nx = 0; ny = 1; nz = 0; pen = def.r + rc; }
      else { nx = dx / dd; ny = dy / dd; nz = dz / dd; pen = def.r + rc - dd; }
      ovx = OB.vx; ovy = OB.vy;
    } else if (def.type === 'box') {
      const qx = clamp(OL.x, OB.x - def.hx, OB.x + def.hx), qy = clamp(OL.y, 0, def.hy * 2), qz = clamp(OL.z, -def.hz, def.hz);
      const dx = OL.x - qx, dy = OL.y - qy, dz = OL.z - qz;
      const dd = Math.hypot(dx, dy, dz);
      if (dd >= rc) return false;
      if (dd < 1e-6) {
        // Centre de la voiture dans la boîte : choisir la face la plus proche,
        // au lieu de toujours pousser sur X (source de coincements/jitter).
        const ex = def.hx - Math.abs(OL.x - OB.x);
        const ey0 = OL.y, ey1 = def.hy * 2 - OL.y;
        const ez = def.hz - Math.abs(OL.z);
        const face = Math.min(ex, ey0, ey1, ez);
        if (face === ey0 || face === ey1) { nx = 0; ny = ey0 <= ey1 ? -1 : 1; nz = 0; }
        else if (face === ez) { nx = 0; ny = 0; nz = OL.z >= 0 ? 1 : -1; }
        else { nx = OL.x >= OB.x ? 1 : -1; ny = 0; nz = 0; }
        pen = Math.max(0.01, rc + Math.max(0, face));
      } else { nx = dx / dd; ny = dy / dd; nz = dz / dd; pen = rc - dd; }
      ovx = OB.vx;
    } else if (def.type === 'bar') {
      const ca = Math.cos(OB.a), sa = Math.sin(OB.a);
      const s = clamp(OL.x * ca + OL.z * sa, -def.len, def.len);
      const dx = OL.x - ca * s, dy = OL.y - def.y, dz = OL.z - sa * s;
      const dd = Math.hypot(dx, dy, dz);
      if (dd >= def.r + rc) return false;
      if (dd < 1e-6) { nx = -sa; ny = 0; nz = ca; pen = def.r + rc; }
      else { nx = dx / dd; ny = dy / dd; nz = dz / dd; pen = def.r + rc - dd; }
      ovx = -sa * s * OB.w; ovz = ca * s * OB.w;
    } else {
      // Bumper : poteau vertical qui renvoie fort.
      if (OL.y > def.h + rc) return false;
      const dd = Math.hypot(OL.x, OL.z);
      if (dd >= def.r + rc) return false;
      if (dd < 1e-6) { nx = 1; nz = 0; pen = def.r + rc; }
      else { nx = OL.x / dd; nz = OL.z / dd; pen = def.r + rc - dd; }
    }
    // Normale et vitesse de l'obstacle en repère monde.
    const c = Math.cos(d.ry || 0), sn = Math.sin(d.ry || 0);
    const wx = nx * c + nz * sn, wz = -nx * sn + nz * c, wy = ny;
    const vwx = (ovx * c + ovz * sn) * k, vwz = (-ovx * sn + ovz * c) * k, vwy = ovy * k;
    if (!(fin(wx) && fin(wy) && fin(wz) && fin(vwx) && fin(vwy) && fin(vwz))) return false;
    // Séparer les corps en contact, mais ne donner l'impulsion du choc (shockKick) que si la voiture ne s'éloigne pas déjà de l'obstacle :
    // sinon un obstacle mobile qui chevauche la voiture la pousserait à chaque pas (tremblements, catapultage).
    const correction = Math.min(pen * k, 2.5);
    p.x += wx * correction; p.y += wy * correction; p.z += wz * correction;
    const vn = (v.x - vwx) * wx + (v.y - vwy) * wy + (v.z - vwz) * wz;
    let add = 0;
    if (vn < -0.05) {
      add = -(1 + CAR.shockE) * vn;
      if (def.type === 'post') {
        add = Math.max(add, Math.max(0, def.kick - add));
      } else {
        add += CAR.shockKick;
      }
    }
    if (add > 0) {
      v.x += wx * add; v.y += wy * add; v.z += wz * add;
      this.omega += (wx * this.fwd.z - wz * this.fwd.x) * add * 0.04;   // le choc fait pivoter un peu
      if (wy * this.gSign > 0.45) this.grounded = false;
      this.ev.shock = Math.max(this.ev.shock, add);
    }
    return false;
  },
};
