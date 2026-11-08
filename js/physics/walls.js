// Collisions de la voiture avec les murs (bordures), les toits de tunnel, les dalles et les limites du monde.
// Ces méthodes s'ajoutent au prototype de CarPhysics (voir physics.js) : `this` est la voiture.
import { CELL, DT, ROAD_HALF, RAIL_W, RAIL_H, SLAB_T } from '../constants.js';
import { PIECES, toLocal, sampleLocal, rotVec, isFloor, isCeilingFloor, baseY, TUNNEL_TOP } from '../pieces.js';
import { CAR } from './specs.js';
import { dcos, dsin, hypot2 } from '../dmath.js';

const L1 = { lx: 0, lz: 0 };
const L2 = { lx: 0, lz: 0 };
const S1 = {};
const S2 = {};
const W1 = { x: 0, z: 0 };
const MOV = {};
const MQ1 = {};
const MQ2 = {};
const HIT = { dx: 0, dz: 0, nx: 0, nz: 0 };

export const wallMethods = {
  _bounds() {
    const p = this.pos, v = this.vel;
    if (p.x < this.bx0) { p.x = this.bx0; if (v.x < 0) v.x = 0; }
    if (p.x > this.bx1) { p.x = this.bx1; if (v.x > 0) v.x = 0; }
    if (p.z < this.bz0) { p.z = this.bz0; if (v.z < 0) v.z = 0; }
    if (p.z > this.bz1) { p.z = this.bz1; if (v.z > 0) v.z = 0; }
  },

  // Bordures : la voiture glisse le long du mur, perd un peu de vitesse au choc,
  // et le choc freine sa rotation. Pas de réalignement automatique.
  // Toit d'un tunnel : une voiture qui saute à l'intérieur n'en sort pas par le haut (les parois la retiennent déjà sur les côtés).
  // Seule une voiture déjà dessous est retenue : celle qui survole le tunnel passe au-dessus.
  _tunnelRoof() {
    if (this.gSign < 0) return;
    const p = this.pos, q = this.prev, v = this.vel;
    const tiles = this.track.tilesAt(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (!tile.tn || tile.v || this.excl.has(tile) || !isFloor(tile)) continue;
      toLocal(tile, p.x, p.z, L1);
      sampleLocal(tile, L1.lx, L1.lz, S1);
      if (!S1.inFootprint || Math.abs(S1.d) > ROAD_HALF + RAIL_W) continue;
      const roof = S1.h + TUNNEL_TOP;
      if (p.y + CAR.height > roof && q.y + CAR.height <= roof + 0.05) {
        p.y = roof - CAR.height;
        if (v.y > 0) v.y = -v.y * 0.2;
      }
    }
  },

  // Dalles pleines (gravité normale, véhicule en l'air) : le dessous et la tranche d'une dalle arrêtent la voiture.
  // Sans cela, un deltaplane (ou un saut) qui arrive sous une rampe ou contre la face d'une plate-forme la traversait, ou était
  // téléporté dessus par l'aide de montée. Trois cas selon la position au pas précédent :
  //   au-dessus de la dalle  : réception normale (rien à faire) ;
  //   en dessous             : la voiture est plaquée sous la dalle (comme le toit d'un tunnel) ;
  //   hors de l'emprise      : choc de face, la voiture reste devant la tranche.
  _slabs() {
    if (this.gSign < 0 || this.grounded || this.rib) return;
    const p = this.pos, q = this.prev, v = this.vel, H = CAR.height;
    const tiles = this.track.tilesAt(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (tile.mv || tile.v || this.excl.has(tile) || !isFloor(tile) || PIECES[tile.t].kind === 'loop') continue;
      const area = PIECES[tile.t].kind === 'area';
      toLocal(tile, p.x, p.z, L1);
      sampleLocal(tile, L1.lx, L1.lz, S1);
      if (!S1.inFootprint || (!area && Math.abs(S1.d) > ROAD_HALF)) continue;
      const hP = S1.h;
      if (!(p.y < hP - 0.3 && p.y + H > hP - SLAB_T)) continue;       // pas dans la dalle (ou à peine : réception normale)
      toLocal(tile, q.x, q.z, L2);
      sampleLocal(tile, L2.lx, L2.lz, S2);
      const qIn = S2.inFootprint && (area || Math.abs(S2.d) <= ROAD_HALF);
      if (qIn) {
        const hQ = S2.h;
        if (q.y >= hQ - 0.3) continue;                                  // arrivait par le haut
        if (q.y + H <= hQ - SLAB_T + 0.3) {                             // arrivait par le dessous
          p.y = hP - SLAB_T - H;
          if (v.y > 0) v.y = -v.y * 0.2;
          this.ev.wall = Math.max(this.ev.wall, 2);
        }
        continue;                                                       // déjà dans la dalle (cas ancien) : inchangé
      }
      // Rebord bas (moins de CAR.step sous le dessus) : aide de montée, la voiture est posée sur la dalle.
      if (p.y >= hP - CAR.step) { p.y = hP + 0.02; continue; }
      // Face de la dalle : on revient devant, et on annule la vitesse qui pousse contre elle.
      const dx = p.x - q.x, dz = p.z - q.z, dl = hypot2(dx, dz);
      p.x = q.x; p.z = q.z;
      if (dl > 1e-6) {
        const nx = dx / dl, nz = dz / dl, vn = v.x * nx + v.z * nz;
        if (vn > 0) { v.x -= nx * vn * 1.2; v.z -= nz * vn * 1.2; this.ev.wall = Math.max(this.ev.wall, vn); }
      }
    }
  },

  _walls() {
    const p = this.pos, v = this.vel;
    const fx = -dsin(this.yaw), fz = -dcos(this.yaw);
    const pfx = -dsin(this.prevYaw), pfz = -dcos(this.prevYaw);
    let hit = 0, touch = false, sx = 0, sz = 0;
    for (let k = -1; k <= 1; k += 2) {
      const off = CAR.probe * k;
      for (let iter = 0; iter < 2; iter++) {
        const c = this._probe(p.x + fx * off, p.z + fz * off,
          this.prev.x + pfx * off, this.prev.z + pfz * off, p.y);
        if (!c) break;
        touch = true;
        p.x += c.dx; p.z += c.dz;
        const vn = v.x * c.nx + v.z * c.nz;
        if (vn < 0) {
          v.x -= c.nx * vn * (1 + CAR.wallE);
          v.z -= c.nz * vn * (1 + CAR.wallE);
          if (-vn > hit) { hit = -vn; sx = c.nx; sz = c.nz; }
        }
      }
    }
    if (touch) {
      // Frottement : racler un mur freine tout le temps, même sans vrai choc.
      const k = Math.max(0, 1 - CAR.wallScrape * DT);
      v.x *= k; v.y *= k; v.z *= k;
    }
    if (hit > 0) {
      const loss = Math.min(CAR.wallLossMax, hit * CAR.wallLoss);
      v.x *= 1 - loss; v.y *= 1 - loss; v.z *= 1 - loss;
      this.ev.wall = hit;
      if (hit > 1.5) {
        // Le choc fait pivoter la voiture (dans le sens où le mur la repousse) et lui coupe le moteur un instant.
        const side = sx * fz - sz * fx;
        this.omega += (side >= 0 ? 1 : -1) * this._upSign() * Math.min(CAR.wallSpinMax, hit * CAR.wallSpin);      // (autour du haut local : même choc au plafond)
        this.stunT = Math.max(this.stunT, Math.min(0.8, 0.1 + hit * CAR.wallStun));
      }
    }
  },

  _probe(x, z, px, pz, y) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    const tiles = this.track.tilesAt(cx, cz);
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (tile.mv || this.excl.has(tile)) continue;
      if (this._probeTile(tile, x, z, px, pz, y, 0)) return HIT;
    }
    // Pièces mobiles : bordures à leur position du moment. L'index les range dans toutes les cases qu'elles balaient : celles de cette case suffisent.
    if (!this.track.hasMovers) return null;
    const time = this.time;
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (!tile.mv || this.excl.has(tile)) continue;
      const o = this.track.moverOffset(tile, time, MOV);
      if (o.a) {
        // Pièce tournante : on interroge sa géométrie « au repos », puis on remet le résultat dans le repère du monde.
        const q = this.track.moverLocal(o, x, z, MQ1), q2 = this.track.moverLocal(o, px, pz, MQ2);
        if (this._probeTile(tile, q.x, q.z, q2.x, q2.z, y - o.y, 0)) {
          const c = dcos(o.a), sn = dsin(o.a), dx = HIT.dx, dz = HIT.dz, nx = HIT.nx, nz = HIT.nz;
          HIT.dx = c * dx + sn * dz; HIT.dz = -sn * dx + c * dz;
          HIT.nx = c * nx + sn * nz; HIT.nz = -sn * nx + c * nz;
          return HIT;
        }
      } else if (this._probeTile(tile, x - o.x, z - o.z, px - o.x, pz - o.z, y - o.y, 0)) return HIT;
    }
    return null;
  },

  _probeTile(tile, x, z, px, pz, y) {
    const P = PIECES[tile.t];
    if (P.kind === 'area' || (tile.nb && !tile.tn) || !(isFloor(tile) || isCeilingFloor(tile))) return false;
    toLocal(tile, x, z, L1);
    sampleLocal(tile, L1.lx, L1.lz, S1);
    if (!S1.inFootprint) return false;
    // Pièce à l'envers : rails et dalle sont symétriques par rapport à la base.
    const H = CAR.height, gsg = this.gSign;
    const ylo = gsg > 0 ? y : y - H, yhi = gsg > 0 ? y + H : y;
    if (tile.v) {
      const hv = 2 * baseY(tile) - S1.h;
      if (ylo > hv + SLAB_T + 0.2 || yhi < hv - RAIL_H + 0.15) return false;
    } else if (ylo > S1.h + (tile.tn ? TUNNEL_TOP : RAIL_H) - 0.15 || yhi < S1.h - SLAB_T - 0.2) return false;      // tunnel : les parois montent jusqu'au toit
    const ad = Math.abs(S1.d), R = CAR.radius;
    const inner = ROAD_HALF, outer = ROAD_HALF + RAIL_W;
    if (ad + R <= inner || ad - R >= outer) return false;
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
    return true;
  },
};
