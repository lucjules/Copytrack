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
//  bank*   : virage relevé      tube : tube fermé
//  cork*   : tire-bouchon (hélice d'un tour)
// Un ruban peut avoir une section courbe : kc (courbure transversale), hw (demi-largeur
// mesurée le long de la section) et wrap (section fermée : on peut en faire le tour).
import { HALF, LEVEL_H, ROAD_HALF } from './constants.js';
import { PIECES, baseY, arcParams, localToWorld } from './pieces.js';

const smooth = (u) => u * u * (3 - 2 * u);
// 0 aux extrémités, 1 au milieu, transitions douces de largeur w.
const ramp = (u, w) => (u < w ? smooth(u / w) : u > 1 - w ? smooth((1 - u) / w) : 1);
const cache = new WeakMap();

// raw : géométrie « à l'endroit » (le rendu la retourne lui-même pour une pièce à l'envers).
// Sinon, pour une pièce posée à l'envers, le ruban est retourné autour de son niveau :
// y -> 2·base − y et normale inversée (la voiture y roule en gravité inversée).
export function ribbonOf(tile, raw = false) {
  const flip = !!tile.v && !raw;
  const key = tile.t + '|' + tile.l + '|' + (flip ? 1 : 0);
  const c = cache.get(tile);
  if (c && c.keys && c.keys[key]) return c.keys[key];
  let rib = build(tile);
  if (flip && rib) {
    const inner = rib, base = baseY(tile);
    rib = {
      ...inner,
      pos(u, o) { inner.pos(u, o); o.y = 2 * base - o.y; o.ny = -o.ny; },
    };
  }
  const entry = c && c.keys ? c : { keys: {} };
  entry.keys[key] = rib;
  cache.set(tile, entry);
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
    // ---- v1.5 ----
    if (P.arc) {
      // Virage relevé : arc horizontal, la route penche vers l'intérieur (inclinaison
      // nulle aux extrémités pour se raccorder aux routes plates). Le bord intérieur
      // reste au niveau de la pièce, le bord extérieur monte.
      const a = arcParams(P);
      return {
        pos(u, o) {
          const ang = Math.PI + (Math.PI / 2) * u;
          const b = P.bank * Math.sin(Math.PI * u);
          const ca = Math.cos(ang), sa = Math.sin(ang);
          o.x = a.cx + a.R * ca; o.z = a.cz + a.R * sa;
          o.y = base + ROAD_HALF * Math.sin(b);
          o.nx = -ca * Math.sin(b); o.ny = Math.cos(b); o.nz = -sa * Math.sin(b);
        },
        len: (Math.PI / 2) * a.R,
      };
    }
    if (tile.t === 'tube') {
      // Tube fermé (rayon 8 m) : on peut en faire le tour complet si on va assez vite.
      const kcMax = 1 / 8;
      return {
        tubeR: 8,
        pos(u, o) {
          o.x = -HALF; o.y = base; o.z = half - 2 * half * u;
          o.nx = 0; o.ny = 1; o.nz = 0;
          const k = ramp(u, 0.2);
          o.kc = kcMax * k;
          o.wrap = k >= 0.999;
          o.hw = o.wrap ? Math.PI / kcMax : ROAD_HALF;
        },
        len: 2 * half,
      };
    }
    if (tile.t === 'tubeIn' || tile.t === 'tubeMid') {
      // Tube modulaire (une case, route au centre de la case) : l'entrée se referme
      // progressivement, la section est un tube complet qu'on peut enchaîner.
      const kcMax = 1 / 8, entry = tile.t === 'tubeIn';
      return {
        tubeR: 8,
        pos(u, o) {
          o.x = 0; o.y = base; o.z = half - 2 * half * u;
          o.nx = 0; o.ny = 1; o.nz = 0;
          const k = entry ? (u >= 0.82 ? 1 : smooth(u / 0.82)) : 1;
          o.kc = kcMax * k;
          o.wrap = k >= 0.999;
          o.hw = o.wrap ? Math.PI / kcMax : ROAD_HALF;
        },
        len: 2 * half,
      };
    }
    if (tile.t === 'cork' || tile.t === 'corkL') {
      // Tire-bouchon : hélice autour d'un axe parallèle à la route, la chaussée tournée
      // vers l'axe. Un tour complet ; la courbure plaque la voiture si elle va assez vite.
      const Rh = 8, m = P.mirror;
      return {
        minU: 0.06,
        pos(u, o) {
          const th = Math.PI * 2 * smooth(u);
          const s = Math.sin(th), c = Math.cos(th);
          o.x = -HALF + m * Rh * s; o.y = base + Rh * (1 - c); o.z = half - 2 * half * u;
          o.nx = -m * s; o.ny = c; o.nz = 0;
        },
        len: Math.hypot(2 * half, 2 * Math.PI * Rh),
      };
    }
    if (tile.t === 'twist') {
      // Vrille : demi-tour de roulis sur 2 cases, route dans la colonne de gauche de l'empreinte 2×2 (comme le tire-bouchon).
      // La voiture est GUIDÉE par la route sur toute la pièce (minU 0,5 : jamais lâchée en route) : à la verticale, la route ne
      // pèse plus rien sur elle, et sans ce guidage elle se détachait au milieu et traversait la chaussée.
      return {
        minU: 0.5,
        pos(u, o) {
          const f = Math.PI * smooth(u);
          o.x = -HALF; o.y = base; o.z = half - 2 * half * u;
          o.nx = Math.sin(f); o.ny = Math.cos(f); o.nz = 0;
        },
        len: 2 * half,
      };
    }
    if (tile.t === 'ramp90') {
      const Lf = 2 * half - R90, La = (R90 * Math.PI) / 2, tot = Lf + La;
      return {
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
      lipU: La / tot,   // fin de la partie arrondie (rebord du L)
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
  return null;
}

const A = {}, B = {}, C = {};

// Repère local complet (position, tangente, normale, droite, ds = |dP/du|).
export function frameLocal(rib, u, F) {
  const e = 2e-3;
  const u0 = Math.max(0, u - e), u1 = Math.min(1, u + e);
  A.kc = 0; A.hw = 0; A.wrap = false;
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
  // Section transversale : courbure (concave > 0), demi-largeur, tour complet.
  F.kc = A.kc || 0; F.hw = A.hw || ROAD_HALF; F.wrap = !!A.wrap;
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
    const rib = ribbonOf(tile, true);
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
  } else if (p.kind === 'ribbon') {
    const rib = ribbonOf(tile, true);
    // drapeau 2 : virage relevé (le pilote automatique doit y doser sa vitesse).
    sampleRibbon(Math.max(8, Math.round(rib.len / 3)), p.arc ? 2 : 1);
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
  // Pièce à l'envers : géométrie retournée autour de son niveau.
  if (tile.v) for (const q of pts) q[1] = 2 * base - q[1];
  return pts;
}

export function centerlineWorld(tile, n, reverse = false) {
  const out = centerlineLocal(tile, n).map(([lx, y, lz, f]) => {
    const w = localToWorld(tile, lx, lz);
    return [w.x, y, w.z, f];
  });
  return reverse ? out.reverse() : out;
}
