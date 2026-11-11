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
import { CELL, HALF, LEVEL_H, ROAD_HALF } from './constants.js';
import { PIECES, baseY, arcParams, localToWorld, isOriented, oriAngle, rollOfO, rollFitHook, MAX_O, profH, profD } from './pieces.js';
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

// Le ruban CHANGE-T-IL LA VOITURE D'ENDROIT À ENVERS (ou l'inverse) entre son entrée et sa sortie ? (phase 2, PHYS_VER 35) : une des deux extrémités a la route à l'envers (normale vers le bas)
// et pas l'autre. C'est la règle COMMUNE qui remplace la liste `autoFlip` posée à la main sur certaines pièces : la gravité d'une telle pièce suit la route (physics/ribbon.js, _ribStep), qu'il
// s'agisse d'une vrille, d'une transition vers ou depuis le plafond, d'une montée en L retournée, ou de toute pièce future. Un ruban qui revient du même côté qu'il est parti (looping, tire-bouchon,
// tube, virage relevé) n'est PAS concerné : sa gravité reste la vraie (appui centripète), qu'il soit posé à l'endroit ou à l'envers. Calculé une fois par géométrie de ruban.
const invertsCache = new WeakMap();
export function ribbonInverts(tile) {
  const rib = ribbonOf(tile);
  if (!rib) return false;
  let r = invertsCache.get(rib);
  if (r === undefined) {
    const o = {};
    rib.pos(0, o); const a = o.ny < -0.7;
    rib.pos(1, o); const b = o.ny < -0.7;
    r = a !== b;
    invertsCache.set(rib, r);
  }
  return r;
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

// Ligne ou virage posé sur un mur (tile.o : 1 = mur gauche, ψ = +90° ; 2 = mur droit, ψ = -90° ; phase 3 : 3 / 4 = ±45°, 5 / 6 = ±135°) : la chaussée est roulée de ψ autour de
// son axe, partout. L'axe reste celui de la route plate (même ligne centrale, même profil vertical) ; la moitié basse du plan descend de 9 m.
function buildRolled(tile) {
  const P = PIECES[tile.t];
  const psi = rollOfO(tile.o);
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

// ---- Phase 3 : roulis générique d'un ruban ---------------------------------------------------------------------------------------------------
// Un ruban (looping, vrille, tire-bouchon, virage relevé) posé avec tile.o est son propre ruban « à plat » tourné de ψ autour de l'axe de son ENTRÉE (la droite qui passe par
// le point d'entrée, parallèle au sens d'entrée, ici l'axe z local) : position et normale sont tournées d'un même angle, donc le raccord d'entrée est celui d'une route roulée de ψ
// (le roulis d'une ligne ordinaire) et rien d'autre ne change : une règle pour toutes les pièces, sans exception par pièce. Le décalage latéral d'un looping devient un décalage
// vertical (une hélice), le bombé d'un looping devient latéral (un looping « sur un mur » est un cercle dans le plan horizontal).
function rollWrap(inner, psi) {
  const c = dcos(psi), s = dsin(psi);
  const e = {};
  inner.pos(0, e);
  const x0 = e.x, y0 = e.y;
  return {
    ...inner,
    minU: 0.5,      // (comme une ligne sur un mur : l'appui ne lâche jamais la voiture, la vitesse décide via SIDE_HOLD)
    pos(u, o) {
      inner.pos(u, o);
      const dx = o.x - x0, dy = o.y - y0;
      o.x = x0 + dx * c + dy * s;
      o.y = y0 - dx * s + dy * c;
      const nx = o.nx, ny = o.ny;
      o.nx = nx * c + ny * s;
      o.ny = -nx * s + ny * c;
    },
  };
}

// Looping roulé : les deux voies d'accès au sol deviennent des tronçons de RUBAN (la route est sur un mur), de la bordure de la pièce au début du cercle puis du cercle à l'autre bordure.
function loopWithLeads(tile, P) {
  const base = baseY(tile), half = P.size * HALF, m = P.mirror;
  const circle = buildBase(tile);
  const Lc = circle.len, Ll = half, tot = 2 * Ll + Lc;
  const f1 = Ll / tot, f2 = (Ll + Lc) / tot;
  return {
    minU: 0.5,
    len: tot,
    pos(u, o) {
      if (u < f1) { o.x = -m * P.lane; o.y = base; o.z = half - Ll * (u / f1); o.nx = 0; o.ny = 1; o.nz = 0; }
      else if (u > f2) { o.x = m * P.lane; o.y = base; o.z = -Ll * ((u - f2) / (1 - f2)); o.nx = 0; o.ny = 1; o.nz = 0; }
      else circle.pos((u - f1) / (f2 - f1), o);
    },
  };
}

function build(tile) {
  const P = PIECES[tile.t];
  if (isOriented(tile)) {
    if (P.kind === 'line' || P.kind === 'arc') return buildRolled(tile);
    const flat = { ...tile, o: 0 };
    return rollWrap(P.kind === 'loop' ? loopWithLeads(flat, P) : buildBase(flat), rollOfO(tile.o));
  }
  return buildBase(tile);
}

function buildBase(tile) {
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
  if (p.kind === 'loop' && !tile.o) {
    const m = p.mirror;
    for (let i = 0; i < 4; i++) pts.push([-m * p.lane, base, half - (half * i) / 4, 0]);
    sampleRibbon(32 * p.turns);
    for (let i = 1; i <= 4; i++) pts.push([m * p.lane, base, -(half * i) / 4, 0]);
  } else if (p.kind === 'ribbon' || p.kind === 'loop') {
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

// ---- Phase 3 : emprise d'un ruban roulé -------------------------------------------------------------------------------------------------------
// Étendue verticale (m, relative au niveau de la pièce) et horizontale (m, dans le repère local) d'un ruban, bords de la chaussée compris : sert à réserver les niveaux au-dessus et
// au-dessous (Track.range), à décider si un roulis tient dans l'empreinte de la pièce (rollFits) et à placer les obstacles. Calculé une fois par géométrie.
const extentCache = new WeakMap();
const FR = {};
export function ribbonExtent(tile) {
  const rib = ribbonOf(tile);
  if (!rib) return null;
  let e = extentCache.get(rib);
  if (e) return e;
  const base = baseY(tile);
  e = { minY: Infinity, maxY: -Infinity, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const n = 48;
  for (let i = 0; i <= n; i++) {
    frameLocal(rib, i / n, FR);
    for (const sg of [-1, 0, 1]) {
      const w = sg * Math.min(FR.hw || ROAD_HALF, ROAD_HALF);
      const x = FR.px + FR.rx * w, y = FR.py + FR.ry * w - base, z = FR.pz + FR.rz * w;
      e.minX = Math.min(e.minX, x); e.maxX = Math.max(e.maxX, x);
      e.minY = Math.min(e.minY, y); e.maxY = Math.max(e.maxY, y);
      e.minZ = Math.min(e.minZ, z); e.maxZ = Math.max(e.maxZ, z);
    }
  }
  extentCache.set(rib, e);
  return e;
}

// Le roulis `val` (1..MAX_O) de la pièce `type` tient-il dans l'empreinte (size × size cases) ? Le ruban roulé ne doit pas sortir des cases de la pièce : la physique et l'éditeur
// retrouvent un ruban par les cases qu'il occupe (index spatial), une portion hors empreinte serait invisible pour les autres pièces et pour les obstacles.
const fitCache = new Map();
export function rollFits(type, val) {
  const key = type + '/' + val;
  let r = fitCache.get(key);
  if (r !== undefined) return r;
  const P = PIECES[type];
  if (!P || !P.rollable || !(val >= 1 && val <= MAX_O)) { fitCache.set(key, false); return false; }
  const tile = { t: type, l: 0, o: val, v: 0 };
  const e = ribbonExtent(tile), half = P.size * HALF;
  r = !!e && e.minX >= -half - 0.5 && e.maxX <= half + 0.5 && e.minZ >= -half - 0.5 && e.maxZ <= half + 0.5;
  // Le raccord de sortie doit tomber sur la grille (décalage latéral en cases entières, hauteur en demi-niveaux) : sans cela aucune pièce ne peut se poser derrière.
  if (r) {
    const rib = ribbonOf(tile), a = {}, b = {};
    rib.pos(0, a); rib.pos(1, b);
    const dx = b.x - a.x, dy = b.y - a.y;
    r = Math.abs(dx - Math.round(dx / CELL) * CELL) < 1 && Math.abs(dy - Math.round(dy / (LEVEL_H / 2)) * (LEVEL_H / 2)) < 0.4;
  }
  fitCache.set(key, r);
  return r;
}
rollFitHook.fits = rollFits;

// Niveaux réservés par un ruban roulé : [au-dessous, au-dessus] (entiers, au moins 2 : le plan vertical mesure 24 m de large).
export function rollLevels(tile) {
  const e = ribbonExtent(tile);
  if (!e) return [2, 2];
  return [Math.max(2, Math.ceil(-e.minY / LEVEL_H - 1e-6)), Math.max(2, Math.ceil(e.maxY / LEVEL_H - 1e-6))];
}
