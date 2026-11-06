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
import { PIECES, baseY, arcParams, localToWorld, isOriented, oriAngle, profH, profD } from './pieces.js';
import { dcos, dsin, hypot2, hypot3 } from './dmath.js';

const smooth = (u) => u * u * (3 - 2 * u);
// 0 aux extrémités, 1 au milieu, transitions douces de largeur w.
const ramp = (u, w) => (u < w ? smooth(u / w) : u > 1 - w ? smooth((1 - u) / w) : 1);
// Cache par pièce. Une pièce se modifie en place (niveau, orientation, type) : l'entrée garde les champs dont dépend la géométrie
// (type, niveau, orientation) et se reconstruit dès que l'un change. `plain` : à l'endroit, `flipped` : retournée (pièce à l'envers) ;
// undefined = pas encore construit, null = cette pièce n'est pas un ruban.
const cache = new WeakMap();

// raw : géométrie « à l'endroit » (le rendu la retourne lui-même pour une pièce à l'envers).
// Sinon, pour une pièce posée à l'envers, le ruban est retourné autour de son niveau :
// y -> 2·base − y et normale inversée (la voiture y roule en gravité inversée).
export function ribbonOf(tile, raw = false) {
  const ori = tile.o | 0;
  let c = cache.get(tile);
  if (c === undefined || c.t !== tile.t || c.l !== tile.l || c.o !== ori) {
    c = { t: tile.t, l: tile.l, o: ori, plain: undefined, flipped: undefined };
    cache.set(tile, c);
  }
  if (!tile.v || raw) {
    if (c.plain === undefined) c.plain = build(tile);
    return c.plain;
  }
  if (c.flipped === undefined) {
    const inner = ribbonOf(tile, true), base = baseY(tile);
    c.flipped = inner && {
      ...inner,
      pos(u, o) { inner.pos(u, o); o.y = 2 * base - o.y; o.ny = -o.ny; },
    };
  }
  return c.flipped;
}

// Ligne centrale d'une ligne ou d'un virage (coordonnées locales) et tangente unitaire à l'avancée u (profil vertical compris).
export function floorCenter(tile, u, out) {
  const P = PIECES[tile.t], base = baseY(tile), half = P.size * HALF;
  let dx, dy, dz;
  if (P.kind === 'arc') {
    const a = arcParams(P), mir = P.mirror < 0 ? -1 : 1, ang = Math.PI + (Math.PI / 2) * u;
    out.x = mir * (a.cx + a.R * dcos(ang)); out.z = a.cz + a.R * dsin(ang);
    out.y = base + P.rise * LEVEL_H * u;
    dx = -mir * a.R * dsin(ang) * (Math.PI / 2); dz = a.R * dcos(ang) * (Math.PI / 2); dy = P.rise * LEVEL_H;
  } else {
    out.x = 0; out.z = half - 2 * half * u; out.y = base + P.rise * LEVEL_H * profH(P, u);
    dx = 0; dz = -2 * half; dy = P.rise * LEVEL_H * profD(P, u);
  }
  const l = hypot3(dx, dy, dz) || 1;
  out.tx = dx / l; out.ty = dy / l; out.tz = dz / l;
  return out;
}

// Normale d'une route roulée de psi autour de son axe (tangente t) : cos ψ · (haut de la route) + sin ψ · (droite de la route).
function rolledNormal(t, psi, o) {
  let ux = -t.tx * t.ty, uy = 1 - t.ty * t.ty, uz = -t.tz * t.ty;          // haut du monde projeté dans le plan perpendiculaire à t
  const l = hypot3(ux, uy, uz) || 1;
  ux /= l; uy /= l; uz /= l;
  const rx = t.ty * uz - t.tz * uy, ry = t.tz * ux - t.tx * uz, rz = t.tx * uy - t.ty * ux;   // droite = t × haut
  const c = dcos(psi), s = dsin(psi);
  o.nx = c * ux + s * rx; o.ny = c * uy + s * ry; o.nz = c * uz + s * rz;
}

// Ligne ou virage posé sur un mur (tile.o : 1 = mur gauche, ψ = +90° ; 2 = mur droit, ψ = -90°) : la chaussée est roulée de 90° autour de
// son axe, partout. L'axe reste celui de la route plate (même ligne centrale, même profil vertical) ; la moitié basse du plan descend de 9 m.
function buildRolled(tile) {
  const P = PIECES[tile.t];
  const psi = tile.o === 1 ? Math.PI / 2 : -Math.PI / 2;
  const C = {};
  const half = P.size * HALF;
  const len = P.kind === 'arc' ? hypot2((Math.PI / 2) * arcParams(P).R, P.rise * LEVEL_H) : hypot2(2 * half, P.rise * LEVEL_H);
  return {
    minU: 0.5,        // comme la vrille : l'appui ne lâche jamais la voiture (c'est la vitesse, via SIDE_HOLD, qui décide si elle tient)
    len: len * 1.2,
    pos(u, o) {
      floorCenter(tile, u, C);
      o.x = C.x; o.y = C.y; o.z = C.z;
      rolledNormal(C, psi, o);
    },
  };
}

function build(tile) {
  const P = PIECES[tile.t];
  const base = baseY(tile);
  const half = P.size * HALF;
  const R90 = 2 * LEVEL_H;

  if (isOriented(tile)) return buildRolled(tile);
  if (P.kind === 'loop') {
    const total = Math.PI * 2 * P.turns;
    const { R, lane, mirror: m } = P;
    return {
      minU: P.turns === 1 ? 0.1 : 0.04,
      pos(u, o) {
        const th = total * u, c = dcos(th), s = dsin(th);
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
          const b = P.bank * dsin(Math.PI * u);
          const ca = dcos(ang), sa = dsin(ang);
          o.x = a.cx + a.R * ca; o.z = a.cz + a.R * sa;
          o.y = base + ROAD_HALF * dsin(b);
          o.nx = -ca * dsin(b); o.ny = dcos(b); o.nz = -sa * dsin(b);
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
    if (P.roll) {
      // Transition d'orientation : la chaussée bascule autour de SON AXE (comme la vrille, dont c'est une portion) d'une orientation à
      // l'autre (sol 0°, mur gauche +90°, mur droit -90°, plafond ±180°) : normale = (sin ψ, cos ψ, 0). L'axe reste fixe : la tangente ne
      // tourne pas, la voiture n'est pas déportée par la bascule. Franche : 1 case ; douce : 2×2, route dans la colonne de gauche (comme la
      // vrille), deux fois moins de roulis par mètre. La moitié basse d'un plan vertical descend de 9 m sous le niveau (réservé : `below`).
      const [a, b] = P.roll, long = !!P.rollLong;
      const psa = oriAngle(a, b), psb = oriAngle(b, a);
      return {
        minU: 0.5,      // jamais lâchée par l'appui : c'est la vitesse (SIDE_HOLD) qui décide si on tient ou si on glisse
        pos(u, o) {
          const psi = psa + (psb - psa) * smooth(u);
          o.x = long ? -HALF : 0; o.y = base; o.z = half - 2 * half * u;
          o.nx = dsin(psi); o.ny = dcos(psi); o.nz = 0;
        },
        len: long ? 2 * half : 2 * half * 1.6,      // (plus de tronçons de maillage pour la bascule franche)
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
          const s = dsin(th), c = dcos(th);
          o.x = -HALF + m * Rh * s; o.y = base + Rh * (1 - c); o.z = half - 2 * half * u;
          o.nx = -m * s; o.ny = c; o.nz = 0;
        },
        len: hypot2(2 * half, 2 * Math.PI * Rh),
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
          o.nx = dsin(f); o.ny = dcos(f); o.nz = 0;
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
            o.x = 0; o.z = -half + R90 - R90 * dsin(a); o.y = base + R90 - R90 * dcos(a);
            o.nx = 0; o.ny = dcos(a); o.nz = dsin(a);
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
          o.z = cz + R90 * dcos(a); o.y = base + R90 * dsin(a);
          o.nx = 0; o.ny = dsin(a); o.nz = dcos(a);
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
  const l = hypot3(tx, ty, tz) || 1e-9;
  F.ds = l / (u1 - u0);
  tx /= l; ty /= l; tz /= l;
  let nx = A.nx, ny = A.ny, nz = A.nz;
  const d = nx * tx + ny * ty + nz * tz;
  nx -= tx * d; ny -= ty * d; nz -= tz * d;
  const nl = hypot3(nx, ny, nz) || 1;
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
function centerlineLocal(tile, n) {
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
      pts.push([(p.mirror < 0 ? -1 : 1) * (a.cx + a.R * dcos(ang)), base + p.rise * LEVEL_H * (i / n), a.cz + a.R * dsin(ang), 0]);
    }
  } else {
    const rise = p.rise * LEVEL_H;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([0, base + rise * profH(p, t), half - 2 * half * t, 0]);
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
