// Rubans 3D : toute portion de route qui n'est pas un simple « sol ».
// Un ruban est une courbe paramétrée u dans [0, 1] avec une normale « vers le haut
// de la route » (n). La voiture s'y déplace en mode ruban (voir physics.js).
//
//  loop*   : cercle vertical (1 ou 2 tours) avec décalage latéral progressif
//  twist   : vrille (demi-tour de roulis) : endroit -> envers
//  ramp90  : plat puis quart de cercle (concave) vers un mur vertical
//  wall    : mur vertical d'un niveau
//  crest90 : quart de cercle convexe (mur -> plat) puis plat
//  v=1     : n'importe quelle ligne / virage posé à l'envers (au plafond)
import { HALF, LEVEL_H } from './constants.js';
import { PIECES, baseY, arcParams, localToWorld } from './pieces.js';

const smooth = (u) => u * u * (3 - 2 * u);
const cache = new WeakMap();

export function ribbonOf(tile) {
  const key = tile.t + '|' + tile.l + '|' + (tile.v ? 1 : 0);
  const c = cache.get(tile);
  if (c && c.key === key) return c.rib;
  const rib = build(tile);
  cache.set(tile, { key, rib });
  return rib;
}

function build(tile) {
  const P = PIECES[tile.t];
  const base = baseY(tile);
  const half = P.size * HALF;
  const R90 = 2 * LEVEL_H;

  if (P.kind === 'loop') {
    const total = Math.PI * 2 * P.turns;
    const { R, lane, mirror: m } = P;
    return {
      stick: false,
      minU: P.turns === 1 ? 0.1 : 0.04,
      pos(u, o) {
        const th = total * u, c = Math.cos(th), s = Math.sin(th);
        o.x = m * lane * (2 * smooth(u) - 1);
        o.y = base + R - R * c;
        o.z = -R * s;
        o.nx = 0; o.ny = c; o.nz = s;
      },
      len: total * R + 2 * lane,
    };
  }
  if (P.kind === 'ribbon') {
    if (tile.t === 'twist') {
      return {
        stick: true,
        pos(u, o) {
          const f = Math.PI * smooth(u);
          o.x = 0; o.y = base; o.z = half - 2 * half * u;
          o.nx = Math.sin(f); o.ny = Math.cos(f); o.nz = 0;
        },
        len: 2 * half,
      };
    }
    if (tile.t === 'ramp90') {
      const Lf = 2 * half - R90, La = (R90 * Math.PI) / 2, tot = Lf + La;
      return {
        stick: true,
        pos(u, o) {
          const s = u * tot;
          if (s <= Lf) {
            o.x = 0; o.y = base; o.z = half - s;
            o.nx = 0; o.ny = 1; o.nz = 0;
          } else {
            const a = (s - Lf) / R90;
            o.x = 0; o.z = -half + R90 - R90 * Math.sin(a); o.y = base + R90 - R90 * Math.cos(a);
            o.nx = 0; o.ny = Math.cos(a); o.nz = Math.sin(a);
          }
        },
        len: tot,
      };
    }
    if (tile.t === 'wall') {
      return {
        stick: true,
        pos(u, o) {
          o.x = 0; o.y = base + LEVEL_H * u; o.z = half;
          o.nx = 0; o.ny = 0; o.nz = 1;
        },
        len: LEVEL_H,
      };
    }
    // crest90
    const La = (R90 * Math.PI) / 2, Lf = 2 * half - R90, tot = La + Lf;
    const cz = half - R90;
    return {
      stick: true,
      pos(u, o) {
        const s = u * tot;
        o.x = 0;
        if (s <= La) {
          const a = s / R90;
          o.z = cz + R90 * Math.cos(a); o.y = base + R90 * Math.sin(a);
          o.nx = 0; o.ny = Math.sin(a); o.nz = Math.cos(a);
        } else {
          o.z = cz - (s - La); o.y = base + R90;
          o.nx = 0; o.ny = 1; o.nz = 0;
        }
      },
      len: tot,
    };
  }
  // Ligne / virage posé à l'envers
  if (P.kind === 'arc') {
    const a = arcParams(P);
    return {
      stick: true,
      pos(u, o) {
        const ang = Math.PI + (Math.PI / 2) * u;
        o.x = a.cx + a.R * Math.cos(ang); o.y = base; o.z = a.cz + a.R * Math.sin(ang);
        o.nx = 0; o.ny = -1; o.nz = 0;
      },
      len: (Math.PI / 2) * a.R,
    };
  }
  const rise = P.rise * LEVEL_H;
  return {
    stick: true,
    pos(u, o) {
      o.x = 0; o.y = base + rise * u; o.z = half - 2 * half * u;
      o.nx = 0; o.ny = -1; o.nz = 0;
    },
    len: 2 * half,
  };
}

const A = {}, B = {}, C = {};

// Repère local complet (position, tangente, normale, droite, ds = |dP/du|).
export function frameLocal(rib, u, F) {
  const e = 2e-3;
  const u0 = Math.max(0, u - e), u1 = Math.min(1, u + e);
  rib.pos(u, A); rib.pos(u0, B); rib.pos(u1, C);
  let tx = C.x - B.x, ty = C.y - B.y, tz = C.z - B.z;
  const l = Math.hypot(tx, ty, tz) || 1e-9;
  F.ds = l / (u1 - u0);
  tx /= l; ty /= l; tz /= l;
  let nx = A.nx, ny = A.ny, nz = A.nz;
  const d = nx * tx + ny * ty + nz * tz;
  nx -= tx * d; ny -= ty * d; nz -= tz * d;
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;
  F.px = A.x; F.py = A.y; F.pz = A.z;
  F.tx = tx; F.ty = ty; F.tz = tz;
  F.nx = nx; F.ny = ny; F.nz = nz;
  F.rx = ty * nz - tz * ny; F.ry = tz * nx - tx * nz; F.rz = tx * ny - ty * nx;
  return F;
}

// Points de la ligne centrale, en coordonnées locales [x, y, z, drapeau],
// de l'entrée naturelle (sud) vers la sortie. drapeau = 1 sur un ruban.
export function centerlineLocal(tile, n) {
  const p = PIECES[tile.t];
  const half = p.size * HALF;
  const base = baseY(tile);
  const pts = [];
  const sampleRibbon = (count, flag = 1) => {
    const rib = ribbonOf(tile);
    const o = {};
    for (let i = 0; i <= count; i++) {
      rib.pos(i / count, o);
      pts.push([o.x, o.y, o.z, flag]);
    }
  };
  if (p.kind === 'loop') {
    const m = p.mirror;
    for (let i = 0; i < 4; i++) pts.push([-m * p.lane, base, half - (half * i) / 4, 0]);
    sampleRibbon(32 * p.turns);
    for (let i = 1; i <= 4; i++) pts.push([m * p.lane, base, -(half * i) / 4, 0]);
  } else if (p.kind === 'ribbon' || tile.v) {
    const rib = ribbonOf(tile);
    sampleRibbon(Math.max(8, Math.round(rib.len / 3)));
  } else if (p.kind === 'arc') {
    const a = arcParams(p);
    for (let i = 0; i <= n; i++) {
      const ang = Math.PI + (Math.PI / 2) * (i / n);
      pts.push([a.cx + a.R * Math.cos(ang), base, a.cz + a.R * Math.sin(ang), 0]);
    }
  } else {
    const rise = p.rise * LEVEL_H;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([0, base + rise * t, half - 2 * half * t, 0]);
    }
  }
  return pts;
}

export function centerlineWorld(tile, n, reverse = false) {
  const out = centerlineLocal(tile, n).map(([lx, y, lz, f]) => {
    const w = localToWorld(tile, lx, lz);
    return [w.x, y, w.z, f];
  });
  return reverse ? out.reverse() : out;
}
