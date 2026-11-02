// Définition des pièces de circuit, des revêtements et de leur géométrie
// "analytique" (utilisée à la fois par la physique et par les maillages).
//
// Repère local d'une pièce : la route d'une pièce droite va du bord sud (+z)
// vers le bord nord (-z). Un virage entre par le sud et sort par l'est
// (virage à droite). La rotation r (0..3) oriente le nord local vers la
// direction de grille r.
//
// Types de pièces :
//  line / arc / area : sol « classique » (physique au sol)
//  loop              : deux voies d'accès au sol + un ruban (looping)
//  ribbon            : tout un ruban 3D (vrille, quart de cercle, mur, sommet)
// Une pièce line/arc peut aussi être posée « à l'envers » (drapeau v) : elle
// devient alors un ruban au plafond.
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
  loop:       { label: 'Looping ↱', kind: 'loop', size: 2, rise: 0, clearance: 5, mirror: 1, R: LOOP_R, lane: LOOP_LANE, turns: 1 },
  loopL:      { label: 'Looping ↰', kind: 'loop', size: 2, rise: 0, clearance: 5, mirror: -1, R: LOOP_R, lane: LOOP_LANE, turns: 1 },
  loopBig:    { label: 'Grand looping ↱', kind: 'loop', size: 3, rise: 0, clearance: 7, mirror: 1, R: 18, lane: 24, turns: 1 },
  loopBigL:   { label: 'Grand looping ↰', kind: 'loop', size: 3, rise: 0, clearance: 7, mirror: -1, R: 18, lane: 24, turns: 1 },
  loopDouble: { label: 'Double looping ↱', kind: 'loop', size: 3, rise: 0, clearance: 5, mirror: 1, R: 12, lane: 24, turns: 2 },
  loopDoubleL:{ label: 'Double looping ↰', kind: 'loop', size: 3, rise: 0, clearance: 5, mirror: -1, R: 12, lane: 24, turns: 2 },
  twist:      { label: 'Vrille', kind: 'ribbon', size: 1, rise: 0, clearance: 0 },
  ramp90:     { label: 'Montée en L', kind: 'ribbon', size: 1, rise: 1 },
  wall:       { label: 'Mur vertical', kind: 'ribbon', size: 1, rise: 0 },
  crest90:    { label: 'Sommet du L', kind: 'ribbon', size: 1, rise: 1 },
};

// Anciennes pièces de la v1.0 devenues des revêtements sur une ligne droite.
export const LEGACY_SURFACE = { boost: 'boost', ice: 'ice' };

// Ordre utilisé pour la sérialisation : ne jamais réordonner, seulement ajouter.
export const PIECE_ORDER = [
  'straight', 'curve', 'bigcurve', 'slope', 'steep', 'boost',
  'checkpoint', 'start', 'finish', 'platform', 'ice', 'loop', 'loopL',
  'loopBig', 'loopBigL', 'loopDouble', 'loopDoubleL', 'twist', 'ramp90', 'wall', 'crest90',
];

// Revêtements. def/min/max : paramètre en % (intensité). inv : autorisé à l'envers.
// flat : pièces plates uniquement. c : couleurs [faible, normal, fort].
export const SURFACES = {
  '':      { label: 'Normal' },
  ice:     { label: 'Verglas', param: 'Glisse', def: 100, min: 25, max: 200, c: ['#d7f1fb', '#a7e0f5', '#6cc8f0'] },
  boost:   { label: 'Accélérateur', param: 'Puissance', def: 100, min: 5, max: 200, inv: true, c: ['#3a7bff', '#36e9ff', '#fff25a'] },
  bounce:  { label: 'Rebond', param: 'Hauteur', def: 100, min: 30, max: 200, flat: true, c: ['#a05fff', '#ff5fd2', '#ff9f5f'] },
  sand:    { label: 'Sable', param: 'Freinage', def: 100, min: 30, max: 250, inv: true, c: ['#e6cf9c', '#c9a26b', '#a47a45'] },
  magnet:  { label: 'Aimant', param: 'Force', def: 100, min: 50, max: 250, c: ['#8f7cff', '#b48cff', '#e56bff'] },
  mud:     { label: 'Boue', param: 'Épaisseur', def: 100, min: 30, max: 250, inv: true, c: ['#8a6a4a', '#6b4a32', '#4a3020'] },
  drift:   { label: 'Dérive', param: 'Glisse', def: 100, min: 30, max: 200, c: ['#ffb84d', '#ff8c42', '#ff5a3c'] },
  slow:    { label: 'Ralentisseur', param: 'Freinage', def: 100, min: 30, max: 300, inv: true, c: ['#ffc84d', '#ff6b57', '#c4172e'] },
  wind:    { label: 'Vent latéral', param: '← Force →', def: 150, min: 1, max: 200, c: ['#7fe9ff', '#bfefff', '#ffffff'] },
  gravity: { label: 'Gravité', param: 'Gravité', def: 40, min: 15, max: 250, c: ['#7dffb2', '#a7ffe0', '#b06bff'] },
  moto:    { label: 'Plaque moto', c: ['#ff9f1c', '#ff9f1c', '#ff9f1c'] },
};
// Ne jamais réordonner, seulement ajouter.
export const SURFACE_ORDER = ['', 'ice', 'boost', 'bounce', 'sand', 'magnet', 'mud', 'drift', 'slow', 'wind', 'gravity', 'moto'];

export function tileParam(tile) {
  const S = SURFACES[tile.s];
  if (!S || S.def == null) return 100;
  return tile.p || S.def;
}

export function isRibbonKind(type) {
  const k = PIECES[type].kind;
  return k === 'ribbon' || k === 'loop';
}

// Sol roulable (physique « au sol ») ? Les rubans et les routes à l'envers ne le sont pas.
export function isFloor(tile) {
  return !tile.v && PIECES[tile.t].kind !== 'ribbon';
}

// Pièce parcourue en mode ruban (au moins en partie) ?
export function isRibbon(tile) {
  return !!tile.v || isRibbonKind(tile.t);
}

// Drapeaux possibles : v (à l'envers), nb (sans bordures), tn (tunnel).
export function flagAllowed(type, flag, tile = null) {
  const p = PIECES[type];
  if (!p) return false;
  const lineLike = p.kind === 'line' || p.kind === 'arc';
  if (flag === 'v') return lineLike && !p.special;
  if (flag === 'nb') return lineLike && !p.special || p.kind === 'ribbon';
  if (flag === 'tn') return lineLike && !p.special && !(tile && tile.v);
  return false;
}

export function surfaceAllowed(type, s, v = false) {
  if (!s) return true;
  const p = PIECES[type];
  const S = SURFACES[s];
  if (!p || !S) return false;
  if (p.kind === 'loop' || p.kind === 'ribbon') return false;
  if (v && !S.inv) return false;
  if (S.flat && p.rise) return false;
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
    // Seules les deux voies d'accès au sol sont des surfaces « normales ».
    const lane = lz >= 0 ? -p.mirror * p.lane : p.mirror * p.lane;
    out.d = lx - lane;
    out.along = (half - lz) / (2 * half);
  } else {
    out.d = 0;
    out.along = (half - lz) / (2 * half);
  }
  return out;
}
