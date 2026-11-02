// Définition des pièces de circuit, des revêtements et de leur géométrie
// "analytique" (utilisée à la fois par la physique et par les maillages).
//
// Repère local d'une pièce : la route d'une pièce droite va du bord sud (+z)
// vers le bord nord (-z). Un virage entre par le sud et sort par l'est
// (virage à droite). La rotation r (0..3) oriente le nord local vers la
// direction de grille r.
import { CELL, HALF, LEVEL_H, ROAD_TOP, LOOP_R, LOOP_LANE } from './constants.js';

export const PIECES = {
  straight:   { label: 'Ligne droite', kind: 'line', size: 1, rise: 0 },
  curve:      { label: 'Virage serré', kind: 'arc', size: 1, rise: 0 },
  bigcurve:   { label: 'Grand virage', kind: 'arc', size: 2, rise: 0 },
  slope:      { label: 'Pente', kind: 'line', size: 1, rise: 1 },
  steep:      { label: 'Tremplin', kind: 'line', size: 1, rise: 2 },
  checkpoint: { label: 'Checkpoint', kind: 'line', size: 1, rise: 0, special: 'checkpoint', clearance: 1 },
  start:      { label: 'Départ', kind: 'line', size: 1, rise: 0, special: 'start', clearance: 1 },
  finish:     { label: 'Arrivée', kind: 'line', size: 1, rise: 0, special: 'finish', clearance: 1 },
  platform:   { label: 'Plateforme', kind: 'area', size: 1, rise: 0 },
  loop:       { label: 'Looping ↱', kind: 'loop', size: 2, rise: 0, clearance: 5, mirror: 1 },
  loopL:      { label: 'Looping ↰', kind: 'loop', size: 2, rise: 0, clearance: 5, mirror: -1 },
};

// Anciennes pièces de la v1.0 devenues des revêtements sur une ligne droite.
export const LEGACY_SURFACE = { boost: 'boost', ice: 'ice' };

// Ordre utilisé pour la sérialisation : ne jamais réordonner, seulement ajouter.
export const PIECE_ORDER = [
  'straight', 'curve', 'bigcurve', 'slope', 'steep', 'boost',
  'checkpoint', 'start', 'finish', 'platform', 'ice', 'loop', 'loopL',
];

// Revêtements applicables sur les pièces compatibles.
export const SURFACES = {
  '':     { label: 'Normal' },
  ice:    { label: 'Verglas', grip: 0.2, traction: 0.45 },
  boost:  { label: 'Accélérateur' },
  bounce: { label: 'Rebond', flatOnly: true },
  sand:   { label: 'Sable', grip: 0.8, traction: 0.65, vmax: 0.55, drag: 5 },
  magnet: { label: 'Aimant', grip: 1.45 },
};
export const SURFACE_ORDER = ['', 'ice', 'boost', 'bounce', 'sand', 'magnet'];

export function surfaceAllowed(type, s) {
  if (!s) return true;
  const p = PIECES[type];
  const S = SURFACES[s];
  if (!p || !S || p.kind === 'loop') return false;
  if (S.flatOnly && p.rise) return false;
  return true;
}

export function baseY(tile) {
  return tile.l * LEVEL_H + ROAD_TOP;
}

export function tileCenter(tile, out = {}) {
  const h = PIECES[tile.t].size * HALF;
  out.x = tile.x * CELL + h;
  out.z = tile.z * CELL + h;
  return out;
}

const C = { x: 0, z: 0 };

// Monde -> local (position)
export function toLocal(tile, wx, wz, out) {
  tileCenter(tile, C);
  return toLocalVec(tile.r, wx - C.x, wz - C.z, out);
}

// Monde -> local (vecteur)
export function toLocalVec(r, dx, dz, out) {
  switch (r & 3) {
    case 0: out.lx = dx; out.lz = dz; break;
    case 1: out.lx = dz; out.lz = -dx; break;
    case 2: out.lx = -dx; out.lz = -dz; break;
    default: out.lx = -dz; out.lz = dx;
  }
  return out;
}

// Local -> monde (vecteur)
export function rotVec(r, lx, lz, out) {
  switch (r & 3) {
    case 0: out.x = lx; out.z = lz; break;
    case 1: out.x = -lz; out.z = lx; break;
    case 2: out.x = -lx; out.z = -lz; break;
    default: out.x = lz; out.z = -lx;
  }
  return out;
}

export function localToWorld(tile, lx, lz, out = {}) {
  tileCenter(tile, C);
  const cx = C.x, cz = C.z;
  rotVec(tile.r, lx, lz, out);
  out.x += cx;
  out.z += cz;
  return out;
}

export function arcParams(p) {
  return p.size === 1
    ? { cx: HALF, cz: HALF, R: HALF }
    : { cx: CELL, cz: CELL, R: CELL * 1.5 };
}

// Repère du looping à l'angle th (0 = entrée en bas, 2π = sortie) en local :
// point central p*, tangente t*, normale intérieure n*, droite r*, ds = dS/dθ.
export function loopFrame(m, base, th, out) {
  const u = Math.min(1, Math.max(0, th / (Math.PI * 2)));
  const sm = u * u * (3 - 2 * u);
  const dsm = 6 * u * (1 - u);
  const c = Math.cos(th), s = Math.sin(th);
  out.px = m * (-LOOP_LANE + 2 * LOOP_LANE * sm);
  out.py = base + LOOP_R - LOOP_R * c;
  out.pz = -LOOP_R * s;
  let tx = (m * 2 * LOOP_LANE * dsm) / (Math.PI * 2), ty = LOOP_R * s, tz = -LOOP_R * c;
  const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
  out.ds = len;
  tx /= len; ty /= len; tz /= len;
  out.tx = tx; out.ty = ty; out.tz = tz;
  out.nx = 0; out.ny = c; out.nz = s;
  let rx = ty * s - tz * c, ry = -tx * s, rz = tx * c;
  const rl = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
  out.rx = rx / rl; out.ry = ry / rl; out.rz = rz / rl;
  return out;
}

// Échantillonne la géométrie au sol d'une pièce au point local (lx, lz).
//  d       : écart latéral signé par rapport à la ligne centrale
//  gx, gz  : gradient (local) de d
//  h       : altitude de la chaussée
//  n*      : normale locale de la chaussée
//  along   : progression 0..1 le long de la pièce
export function sampleLocal(tile, lx, lz, out) {
  const p = PIECES[tile.t];
  const half = p.size * HALF;
  out.inFootprint = lx >= -half && lx <= half && lz >= -half && lz <= half;
  const base = baseY(tile);
  out.nx = 0; out.ny = 1; out.nz = 0;
  out.h = base;
  out.gx = 1; out.gz = 0;
  if (p.kind === 'line') {
    const len = 2 * half;
    const rise = p.rise * LEVEL_H;
    let t = (half - lz) / len;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    out.d = lx;
    out.h = base + rise * t;
    const k = rise / len;
    const inv = 1 / Math.sqrt(1 + k * k);
    out.ny = inv; out.nz = k * inv;
    out.along = t;
  } else if (p.kind === 'arc') {
    const a = arcParams(p);
    const dx = lx - a.cx, dz = lz - a.cz;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1e-6;
    out.d = dist - a.R; out.gx = dx / dist; out.gz = dz / dist;
    let ang = Math.atan2(dz, dx);
    if (ang < 0) ang += Math.PI * 2;
    out.along = (ang - Math.PI) / (Math.PI / 2);
  } else if (p.kind === 'loop') {
    // Seules les deux voies d'accès au sol sont des surfaces "normales".
    const lane = lz >= 0 ? -p.mirror * LOOP_LANE : p.mirror * LOOP_LANE;
    out.d = lx - lane;
    out.along = (half - lz) / (2 * half);
  } else {
    out.d = 0;
    out.along = (half - lz) / (2 * half);
  }
  return out;
}

// Points de la ligne centrale, en coordonnées locales [x, y, z, drapeau],
// de l'entrée naturelle (sud) vers la sortie. drapeau = 1 dans le looping.
export function centerlineLocal(tile, n) {
  const p = PIECES[tile.t];
  const half = p.size * HALF;
  const base = baseY(tile);
  const pts = [];
  if (p.kind === 'arc') {
    const a = arcParams(p);
    for (let i = 0; i <= n; i++) {
      const ang = Math.PI + (Math.PI / 2) * (i / n);
      pts.push([a.cx + a.R * Math.cos(ang), base, a.cz + a.R * Math.sin(ang), 0]);
    }
  } else if (p.kind === 'loop') {
    const m = p.mirror;
    for (let i = 0; i < 4; i++) pts.push([-m * LOOP_LANE, base, half - (half * i) / 4, 0]);
    const F = {};
    const k = 32;
    for (let i = 0; i <= k; i++) {
      loopFrame(m, base, (Math.PI * 2 * i) / k, F);
      pts.push([F.px, F.py, F.pz, i === 0 || i === k ? 0 : 1]);
    }
    for (let i = 1; i <= 4; i++) pts.push([m * LOOP_LANE, base, -(half * i) / 4, 0]);
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
