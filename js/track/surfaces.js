// Requêtes de surface pour la physique et la caméra : sol sous un point, plafond, pièces mobiles.
// Ces méthodes s'ajoutent au prototype de Track (voir track.js) : `this` est l'instance.
import { CELL, ROAD_HALF, RAIL_W, SLAB_T, LEVEL_H } from '../constants.js';
import { PIECES, isFloor, isCeilingFloor, baseY, toLocal, sampleLocal, rotVec, tileCenter, MOVER, moverParams } from '../pieces.js';
import { dcos, dsin } from '../dmath.js';
import { MP, W, W2, WATER_DROP, boatDrop } from './shared.js';
const L = { lx: 0, lz: 0 };

const S = {};

const MO = {};

export const surfaceMethods = {
  // Gravité inversée : surface « au plafond » la plus proche au-dessus de (x, y - step, z),
  // venant des pièces posées à l'envers (géométrie retournée autour de leur niveau).
  // Sans plafond, h vaut +∞ (la voiture continue de « tomber » vers le haut).
  ceilingSurfaceAt(x, y, z, out, step = 1.6, broken = null) {
    out.h = Infinity; out.nx = 0; out.ny = -1; out.nz = 0;
    out.tile = null; out.type = 'none'; out.mod = ''; out.p = 0; out.lx = 0; out.lz = 0;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (const tile of this.tilesAt(cx, cz)) {
      if (!isCeilingFloor(tile)) continue;
      if (broken && broken.has(tile)) continue;
      toLocal(tile, x, z, L);
      sampleLocal(tile, L.lx, L.lz, S);
      if (!S.inFootprint) continue;
      if (PIECES[tile.t].kind !== 'area' && Math.abs(S.d) > ROAD_HALF) continue;
      const base = baseY(tile);
      const h = 2 * base - S.h;
      if (h < y - step || h >= out.h) continue;
      out.h = h;
      rotVec(tile.r, S.nx, S.nz, W);
      out.nx = W.x; out.ny = -S.ny; out.nz = W.z;
      out.tile = tile; out.type = 'road'; out.mod = tile.s || ''; out.p = tile.p || 0;
      out.lx = L.lx; out.lz = L.lz;
      if (tile.s === 'water') out.h += WATER_DROP;
      else if (tile.s === 'boat' && (PIECES[tile.t].kind === 'line' || PIECES[tile.t].kind === 'arc')) out.h += boatDrop(S.along);
    }
    return out;
  },

  // Surface roulable la plus haute sous (x, y + step, z). Le sol est à y = 0.
  // Les pièces mobiles (ascenseur, glissière, rotation) sont prises à leur position au chrono `time` (s) de la course : le circuit n'a
  // pas d'horloge propre, plusieurs voitures (la sienne, un fantôme, un adversaire) l'interrogent chacune à son propre chrono.
  // broken : pièces de verre déjà brisées dans CETTE course (propre à chaque voiture, voir CarPhysics) : sans collision.
  surfaceAt(x, y, z, out, step = 1.6, broken = null, time = 0) {
    out.h = 0; out.nx = 0; out.ny = 1; out.nz = 0;
    out.tile = null; out.type = 'ground'; out.mod = ''; out.p = 0; out.lx = 0; out.lz = 0;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = -Infinity;
    const cell = this.tilesAt(cx, cz);
    for (let i = 0; i < cell.length; i++) {
      const tile = cell[i];
      if (tile.mv || !isFloor(tile) || (broken && broken.has(tile))) continue;
      best = this._floorTry(tile, x, z, 0, y, step, best, out);
    }
    // Pièces mobiles : l'index les range dans toutes les cases qu'elles balaient, donc seules celles de CETTE case peuvent porter le point
    // (même ordre qu'avant : celui du circuit).
    if (this.hasMovers) {
      for (let i = 0; i < cell.length; i++) {
        const tile = cell[i];
        if (!tile.mv || !isFloor(tile) || (broken && broken.has(tile))) continue;
        this.moverOffset(tile, time, MO);
        if (MO.a) { this.moverLocal(MO, x, z, W2); best = this._floorTry(tile, W2.x, W2.z, MO.y, y, step, best, out, MO.a); }
        else best = this._floorTry(tile, x - MO.x, z - MO.z, MO.y, y, step, best, out);
      }
    }
    return out;
  },

  _floorTry(tile, x, z, oy, y, step, best, out, a = 0) {
    toLocal(tile, x, z, L);
    sampleLocal(tile, L.lx, L.lz, S);
    if (!S.inFootprint) return best;
    const p = PIECES[tile.t];
    if (p.kind !== 'area' && Math.abs(S.d) > ROAD_HALF) return best;
    const h = S.h + oy;
    if (h > y + step || h <= best) return best;
    out.h = h;
    rotVec(tile.r, S.nx, S.nz, W);
    out.nx = W.x; out.ny = S.ny; out.nz = W.z;
    if (a) { const c = dcos(a), sn = dsin(a); out.nx = c * W.x + sn * W.z; out.nz = -sn * W.x + c * W.z; }   // pièce tournée : la normale suit
    out.tile = tile;
    out.type = 'road';
    // Bifurcation à deux revêtements : la voie déportée (branche 1) peut avoir le sien (« - » = route normale).
    let sf = tile.s, sp = tile.p;
    if (p.kind === 'fork' && S.branch === 1 && tile.s2) { sf = tile.s2 === '-' ? '' : tile.s2; sp = tile.s2 === '-' ? 0 : tile.p2; }
    out.mod = sf || '';
    out.p = sp || 0;
    out.lx = L.lx; out.lz = L.lz;
    if (sf === 'water') out.h -= WATER_DROP;
    else if (sf === 'boat' && (p.kind === 'line' || p.kind === 'arc')) out.h -= boatDrop(S.along);      // plaque bateau : rampe de l'eau au sol
    return out.h;
  },

  // Pièces en mouvement : 1 = ascenseur (monte puis redescend), 2 = glissière (se décale sur son côté droit et revient),
  // 3 = rotation (tourne autour de son centre, tour complet ou va-et-vient). Vitesse et amplitude réglables (voir MOVER).
  // Le mouvement ne dépend que du chrono de la course. out : décalage (x, y, z) et vitesse (vx, vy, vz) ;
  // pour une rotation : a (angle, rad), w (vitesse angulaire, rad/s) et le pivot (cx, cz).
  moverOffset(tile, t, out) {
    const M = MOVER[tile.mv];
    const mp = moverParams(tile, MP);
    const sp = mp.speed / 100, P = M.period / Math.abs(sp), w = (Math.PI * 2) / P;
    const k = (1 - dcos(w * t)) / 2, dk = (dsin(w * t) * w) / 2;
    out.x = 0; out.y = 0; out.z = 0; out.vx = 0; out.vy = 0; out.vz = 0;
    out.a = 0; out.w = 0; out.cx = 0; out.cz = 0;
    if (tile.mv === 1) { out.y = mp.amp * LEVEL_H * k; out.vy = mp.amp * LEVEL_H * dk; }
    else if (tile.mv === 2) {
      rotVec(tile.r, 1, 0, W2);
      out.x = W2.x * CELL * mp.amp * k; out.z = W2.z * CELL * mp.amp * k;
      out.vx = W2.x * CELL * mp.amp * dk; out.vz = W2.z * CELL * mp.amp * dk;
    } else if (tile.mv === 3) {
      const c = tileCenter(tile, W2);
      out.cx = c.x; out.cz = c.z;
      const sg = sp < 0 ? -1 : 1;
      if (mp.amp >= 360) { out.a = sg * w * t; out.w = sg * w; }      // rotation continue : un tour par période
      else { const A = (mp.amp * Math.PI) / 180; out.a = sg * A * k; out.w = sg * A * dk; }
    }
    return out;
  },

  // Monde -> repère de la pièce mobile « au repos » (annule le décalage et la rotation) : sert à interroger sa géométrie.
  moverLocal(o, x, z, out) {
    x -= o.x; z -= o.z;
    if (o.a) {
      const dx = x - o.cx, dz = z - o.cz, c = dcos(o.a), s = dsin(o.a);
      x = o.cx + c * dx - s * dz; z = o.cz + s * dx + c * dz;
    }
    out.x = x; out.z = z;
    return out;
  },

  // Dessous de dalle (ou toit de tunnel) le plus bas au-dessus de yMin : sert à la caméra.
  ceilingAt(x, z, yMin) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = Infinity;
    for (const tile of this.tilesAt(cx, cz)) {
      const kind = PIECES[tile.t].kind;
      if (kind === 'loop' || kind === 'ribbon' || tile.v || tile.o) continue;
      toLocal(tile, x, z, L);
      sampleLocal(tile, L.lx, L.lz, S);
      if (!S.inFootprint) continue;
      if (kind !== 'area' && Math.abs(S.d) > ROAD_HALF + RAIL_W + 0.5) continue;
      const under = tile.tn ? S.h + ROAD_HALF + RAIL_W + 0.9 : S.h - SLAB_T;
      if (under > yMin && under < best) best = under;
    }
    return best;
  },
};
