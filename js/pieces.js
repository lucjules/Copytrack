// Définition des pièces de circuit et de leur géométrie "analytique"
// (utilisée à la fois par la physique et par la génération des maillages).
//
// Repère local d'une pièce : la route d'une pièce droite va du bord sud (+z)
// vers le bord nord (-z). Un virage entre par le sud et sort par l'est
// (virage à droite). La rotation r (0..3) oriente le nord local vers la
// direction de grille r.
import { CELL, HALF, LEVEL_H, ROAD_TOP } from './constants.js';

export const PIECES = {
  straight:   { label: 'Ligne droite', kind: 'line', size: 1, rise: 0 },
  curve:      { label: 'Virage serré', kind: 'arc', size: 1, rise: 0 },
  bigcurve:   { label: 'Grand virage', kind: 'arc', size: 2, rise: 0 },
  slope:      { label: 'Pente', kind: 'line', size: 1, rise: 1 },
  steep:      { label: 'Tremplin', kind: 'line', size: 1, rise: 2 },
  boost:      { label: 'Accélérateur', kind: 'line', size: 1, rise: 0, special: 'boost' },
  checkpoint: { label: 'Checkpoint', kind: 'line', size: 1, rise: 0, special: 'checkpoint', clearance: 1 },
  start:      { label: 'Départ', kind: 'line', size: 1, rise: 0, special: 'start', clearance: 1 },
  finish:     { label: 'Arrivée', kind: 'line', size: 1, rise: 0, special: 'finish', clearance: 1 },
  platform:   { label: 'Plateforme', kind: 'area', size: 1, rise: 0 },
  ice:        { label: 'Verglas', kind: 'line', size: 1, rise: 0, special: 'ice' },
};

// Ordre utilisé pour la sérialisation : ne jamais réordonner, seulement ajouter.
export const PIECE_ORDER = [
  'straight', 'curve', 'bigcurve', 'slope', 'steep', 'boost',
  'checkpoint', 'start', 'finish', 'platform', 'ice',
];

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

// Monde -> local
export function toLocal(tile, wx, wz, out) {
  tileCenter(tile, C);
  const dx = wx - C.x, dz = wz - C.z;
  switch (tile.r & 3) {
    case 0: out.lx = dx; out.lz = dz; break;
    case 1: out.lx = dz; out.lz = -dx; break;
    case 2: out.lx = -dx; out.lz = -dz; break;
    default: out.lx = -dz; out.lz = dx;
  }
  return out;
}

// Rotation d'un vecteur local vers le monde
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

// Échantillonne la géométrie d'une pièce au point local (lx, lz).
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
  if (p.kind === 'line') {
    const len = 2 * half;
    const rise = p.rise * LEVEL_H;
    let t = (half - lz) / len;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    out.d = lx; out.gx = 1; out.gz = 0;
    out.h = base + rise * t;
    const k = rise / len;
    const inv = 1 / Math.sqrt(1 + k * k);
    out.nx = 0; out.ny = inv; out.nz = k * inv;
    out.along = t;
  } else if (p.kind === 'arc') {
    const a = arcParams(p);
    const dx = lx - a.cx, dz = lz - a.cz;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1e-6;
    out.d = dist - a.R; out.gx = dx / dist; out.gz = dz / dist;
    out.h = base;
    out.nx = 0; out.ny = 1; out.nz = 0;
    let ang = Math.atan2(dz, dx);
    if (ang < 0) ang += Math.PI * 2;
    out.along = (ang - Math.PI) / (Math.PI / 2);
  } else {
    out.d = 0; out.gx = 1; out.gz = 0;
    out.h = base;
    out.nx = 0; out.ny = 1; out.nz = 0;
    out.along = (half - lz) / (2 * half);
  }
  return out;
}

// Points de la ligne centrale, en coordonnées locales [x, y, z],
// de l'entrée naturelle (sud) vers la sortie (nord ou est).
export function centerlineLocal(tile, n) {
  const p = PIECES[tile.t];
  const half = p.size * HALF;
  const base = baseY(tile);
  const pts = [];
  if (p.kind === 'arc') {
    const a = arcParams(p);
    for (let i = 0; i <= n; i++) {
      const ang = Math.PI + (Math.PI / 2) * (i / n);
      pts.push([a.cx + a.R * Math.cos(ang), base, a.cz + a.R * Math.sin(ang)]);
    }
  } else {
    const rise = p.rise * LEVEL_H;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([0, base + rise * t, half - 2 * half * t]);
    }
  }
  return pts;
}

export function centerlineWorld(tile, n, reverse = false) {
  const out = centerlineLocal(tile, n).map(([lx, y, lz]) => {
    const w = localToWorld(tile, lx, lz);
    return [w.x, y, w.z];
  });
  return reverse ? out.reverse() : out;
}
