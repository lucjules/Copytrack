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
//  ribbon            : tout un ruban 3D (vrille, quart de cercle, mur, sommet,
//                      virage relevé, tube, tire-bouchon)
//  fork              : bifurcation (une entrée, deux sorties) au sol
//  ring              : anneau flottant (turbo ou checkpoint aérien)
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
  // v1.5
  bank:       { label: 'Virage relevé', kind: 'ribbon', size: 2, rise: 0, clearance: 2, arc: true, bank: 0.42 },
  bankBig:    { label: 'Très grand virage relevé', kind: 'ribbon', size: 3, rise: 0, clearance: 2, arc: true, bank: 0.5 },
  tube:       { label: 'Tube', kind: 'ribbon', size: 2, rise: 0, clearance: 4 },
  // 0.7 : tube modulaire (entrée, sections à enchaîner, sortie = entrée retournée).
  tubeIn:     { label: 'Entrée de tube', kind: 'ribbon', size: 1, rise: 0, clearance: 4 },
  tubeMid:    { label: 'Section de tube', kind: 'ribbon', size: 1, rise: 0, clearance: 4, tubeSurf: true },
  cork:       { label: 'Tire-bouchon ↻', kind: 'ribbon', size: 2, rise: 0, clearance: 4, mirror: 1 },
  corkL:      { label: 'Tire-bouchon ↺', kind: 'ribbon', size: 2, rise: 0, clearance: 4, mirror: -1 },
  fork:       { label: 'Bifurcation ⑂→', kind: 'fork', size: 2, rise: 0, mirror: 1 },
  forkL:      { label: 'Bifurcation ←⑂', kind: 'fork', size: 2, rise: 0, mirror: -1 },
  ring:       { label: 'Anneau turbo', kind: 'ring', size: 1, rise: 0, clearance: 2 },
  cpRing:     { label: 'Checkpoint aérien', kind: 'ring', size: 1, rise: 0, clearance: 2, special: 'checkpoint' },
  cpCurve:    { label: 'Checkpoint en virage', kind: 'arc', size: 1, rise: 0, clearance: 1, special: 'checkpoint' },
  gentle:     { label: 'Pente douce (½ niveau)', kind: 'line', size: 1, rise: 0.5 },
};

// Rayon de l'anneau (turbo / checkpoint aérien) et hauteur de son centre au-dessus du niveau.
export const RING_R = 7;
export const RING_Y = 6;

// Anciennes pièces de la v1.0 devenues des revêtements sur une ligne droite.
export const LEGACY_SURFACE = { boost: 'boost', ice: 'ice' };
// Pièces retirées (gardées dans PIECE_ORDER pour lire les anciens codes) : remplacées.
export const LEGACY_PIECE = { halfpipe: 'straight' };

// Ordre utilisé pour la sérialisation : ne jamais réordonner, seulement ajouter.
export const PIECE_ORDER = [
  'straight', 'curve', 'bigcurve', 'slope', 'steep', 'boost',
  'checkpoint', 'start', 'finish', 'platform', 'ice', 'loop', 'loopL',
  'loopBig', 'loopBigL', 'loopDouble', 'loopDoubleL', 'twist', 'ramp90', 'wall', 'crest90',
  'bank', 'bankBig', 'halfpipe', 'tube', 'cork', 'corkL', 'fork', 'forkL', 'ring', 'cpRing', 'cpCurve', 'gentle',
  'tubeIn', 'tubeMid',
];

// Revêtements. def/min/max : paramètre en % (intensité). inv : autorisé à l'envers.
// flat : pièces plates uniquement. c : couleurs [faible, normal, fort].
export const SURFACES = {
  '':      { label: 'Normal' },
  ice:     { label: 'Verglas', param: 'Glisse', def: 100, min: 25, max: 200, c: ['#d7f1fb', '#a7e0f5', '#6cc8f0'] },
  boost:   { label: 'Accélérateur', param: 'Puissance', def: 100, min: 5, max: 200, inv: true, c: ['#3a7bff', '#36e9ff', '#fff25a'] },
  bounce:  { label: 'Rebond', param: 'Hauteur', def: 100, min: 30, max: 200, flat: true, c: ['#a05fff', '#ff5fd2', '#ff9f5f'] },
  sand:    { label: 'Sable', param: 'Freinage', def: 100, min: 30, max: 250, inv: true, c: ['#e6cf9c', '#c9a26b', '#a47a45'] },
  // 0.9 : plus de réglage, l'aimant colle toujours au maximum.
  magnet:  { label: 'Aimant', c: ['#b48cff', '#b48cff', '#b48cff'] },
  mud:     { label: 'Boue', param: 'Épaisseur', def: 100, min: 30, max: 250, inv: true, c: ['#8a6a4a', '#6b4a32', '#4a3020'] },
  drift:   { label: 'Dérive', param: 'Glisse', def: 100, min: 30, max: 200, c: ['#ffb84d', '#ff8c42', '#ff5a3c'] },
  slow:    { label: 'Ralentisseur', param: 'Freinage', def: 100, min: 30, max: 300, inv: true, c: ['#ffc84d', '#ff6b57', '#c4172e'] },
  wind:    { label: 'Vent latéral', param: '← Force →', def: 150, min: 1, max: 200, c: ['#7fe9ff', '#bfefff', '#ffffff'] },
  gravity: { label: 'Gravité', param: 'Gravité', def: 40, min: 15, max: 250, c: ['#7dffb2', '#a7ffe0', '#b06bff'] },
  moto:    { label: 'Plaque moto', c: ['#ff9f1c', '#ff9f1c', '#ff9f1c'] },
  // v1.5
  water:   { label: 'Eau', flat: true, c: ['#3fa7ff', '#3fa7ff', '#3fa7ff'] },
  boat:    { label: 'Plaque bateau', flat: true, c: ['#3fd0ff', '#3fd0ff', '#3fd0ff'] },
  glider:  { label: 'Plaque deltaplane', c: ['#f5f5f5', '#f5f5f5', '#f5f5f5'] },
  // 0.9 : inverse le sens de la gravité (une 2e plaque la remet à l'endroit).
  flip:    { label: 'Inversion de gravité', c: ['#ff4fd8', '#ff4fd8', '#ff4fd8'] },
  conveyor: { label: 'Tapis roulant', param: '↓ Vitesse ↑', def: 150, min: 1, max: 200, c: ['#ffd23e', '#ffd23e', '#ffd23e'] },
  spring:  { label: 'Ressort latéral', param: '← Force →', def: 150, min: 1, max: 200, c: ['#5dff8a', '#5dff8a', '#5dff8a'] },
  glass:   { label: 'Verre fragile', param: 'Vitesse mini', def: 100, min: 30, max: 200, inv: true, c: ['#d9f4ff', '#a8e4ff', '#6fcfff'] },
  powder:  { label: 'Poudreuse', param: 'Épaisseur', def: 100, min: 30, max: 250, inv: true, c: ['#ffffff', '#e4f1ff', '#bcd9ff'] },
  reverse: { label: 'Volant inversé', c: ['#c05fff', '#c05fff', '#c05fff'] },
  cut:     { label: 'Moteur coupé', c: ['#ff3b3b', '#ff3b3b', '#ff3b3b'] },
};
// Ne jamais réordonner, seulement ajouter.
export const SURFACE_ORDER = ['', 'ice', 'boost', 'bounce', 'sand', 'magnet', 'mud', 'drift', 'slow', 'wind', 'gravity', 'moto', 'water', 'boat', 'glider', 'flip', 'conveyor', 'spring', 'glass', 'powder', 'reverse', 'cut'];
// Plaques de transformation : véhicule obtenu (repasser sur la même plaque ramène la voiture).
export const PLATES = { moto: 'moto', boat: 'boat', glider: 'glider' };

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
  const k = PIECES[tile.t].kind;
  return !tile.v && k !== 'ribbon' && k !== 'ring';
}

// Sol « au plafond » (pièce posée à l'envers) : roulable seulement en gravité inversée.
export function isCeilingFloor(tile) {
  const k = PIECES[tile.t].kind;
  return !!tile.v && k !== 'ribbon' && k !== 'ring';
}

// Pièce parcourue en mode ruban (au moins en partie) ?
export function isRibbon(tile) {
  return isRibbonKind(tile.t);
}

// Drapeaux possibles : v (à l'envers), nb (sans bordures), tn (tunnel).
export function flagAllowed(type, flag, tile = null) {
  const p = PIECES[type];
  if (!p) return false;
  const lineLike = p.kind === 'line' || p.kind === 'arc';
  // 0.9 : toutes les pièces peuvent être posées à l'envers (retournées sous leur niveau).
  if (flag === 'v') return true;
  if (p.kind === 'ring' || p.kind === 'fork') return false;
  if (flag === 'nb') return lineLike && !p.special || (p.kind === 'ribbon' && !type.startsWith('tube'));
  if (flag === 'tn') return lineLike && !p.special && !(tile && tile.v);
  return false;
}

export function surfaceAllowed(type, s, v = false) {
  if (!s) return true;
  const p = PIECES[type];
  const S = SURFACES[s];
  if (!p || !S) return false;
  return surfaceRule(p, S, s) === '';
}

// 0.9 : tous les revêtements vont sur toutes les pièces de route, sauf quelques cas
// physiquement impossibles. Renvoie '' si c'est permis, sinon la raison (tableau de
// compatibilité de l'éditeur). v (pièce à l'envers) ne change rien : au plafond, en
// gravité inversée, les revêtements marchent pareil.
export function surfaceRule(p, S, s) {
  if (p.kind === 'ring') return 'pas de route dans un anneau';
  const curved = p.kind === 'loop' || p.kind === 'ribbon';
  if (S.flat && (p.rise || curved)) return 'seulement sur du plat';
  if (s === 'water' && (p.special || p.kind === 'fork')) return 'pas sur une pièce spéciale ni une bifurcation';
  return '';
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
  if (p.size === 1) return { cx: HALF, cz: HALF, R: HALF };
  if (p.size === 3) return { cx: CELL * 1.5, cz: CELL * 1.5, R: CELL * 2.5 };
  return { cx: CELL, cz: CELL, R: CELL * 1.5 };
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
  } else if (p.kind === 'fork') {
    forkSample(p, lx, lz, out);
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

// ---- Bifurcation -------------------------------------------------------------
// Pièce 2x2 : entrée au sud de la colonne gauche (x = -12, ou +12 en miroir).
// Branche A : tout droit. Branche B : glisse d'une colonne (S doux) vers l'autre côté.
const smoothF = (t) => t * t * (3 - 2 * t);
export function forkBranchX(p, t, branch) {
  const x0 = -p.mirror * HALF;
  return branch === 0 ? x0 : x0 + p.mirror * CELL * smoothF(t);
}
// Écart entre les deux lignes centrales à l'avancée t.
export function forkSep(t) {
  return CELL * smoothF(t);
}
function forkSample(p, lx, lz, out) {
  const half = p.size * HALF;
  let t = (half - lz) / (2 * half);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  out.along = t;
  const xa = forkBranchX(p, t, 0), xb = forkBranchX(p, t, 1);
  // Pente de la branche B (dérivée de x par rapport à -lz).
  const slope = p.mirror * CELL * 6 * t * (1 - t) / (2 * half);
  const cb = 1 / Math.sqrt(1 + slope * slope);
  const da = lx - xa, db = (lx - xb) * cb;
  const sep = forkSep(t);
  const between = (lx - xa) * (lx - xb) < 0;
  if (between && sep < 2 * 9 + 0.05) {
    // Les deux chaussées se touchent encore : tout l'entre-deux est de la route, sans muret.
    out.d = 0; out.gx = 1; out.gz = 0; out.branch = Math.abs(da) <= Math.abs(db) ? 0 : 1;
  } else if (Math.abs(da) <= Math.abs(db)) {
    out.d = da; out.gx = 1; out.gz = 0; out.branch = 0;
  } else {
    out.d = db; out.gx = cb; out.gz = slope * cb; out.branch = 1;
  }
}
