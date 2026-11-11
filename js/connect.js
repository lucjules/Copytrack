// Raccords entre pièces (phase 1 de l'après-audit 0.9.59) : extrémités d'une pièce, repère de la route à chaque bout, et recherche de la pièce qui
// se raccorde à une extrémité donnée. Module PUR (aucun rendu, aucun DOM, aucune physique) : il sert au vérificateur (continuity.js), à l'outil
// « prolonger » de l'éditeur et à la matrice de compatibilité (tools/matrice-pieces.mjs).
//
// Une extrémité : { x, y, z } position, { dx, dy, dz } direction SORTANTE (hors de la pièce), { nx, ny, nz } normale de la route en ce point,
// `entry` / `exit` pour une pièce à deux bouts (sens nominal : de l'entrée sud vers la sortie nord de son repère local).
import { CELL, LEVEL_H } from './constants.js';
import { PIECES, ORI_NAMES, baseY, localToWorld, rotVec, isRibbon, forkBranchX } from './pieces.js';
import { centerlineWorld, ribbonOf } from './ribbons.js';
import { hypot3 } from './dmath.js';

const RING_KINDS = new Set(['ring', 'area']);

// Normale « idéale » d'une route au sol : à l'endroit (0, 1, 0), à l'envers (0, -1, 0). Une pente n'est pas un roulis : on ne la compare pas.
const floorNormal = (tile) => [0, tile.v ? -1 : 1, 0];

// Normale monde d'une pièce en ruban à l'avancée u (0 ou 1), pièce retournée / roulée comprise.
function ribbonNormal(tile, u) {
  const o = {};
  ribbonOf(tile).pos(u, o);
  const w = rotVec(tile.r, o.nx, o.nz, {});
  return [w.x, o.ny, w.z];
}

// Extrémités d'une pièce : [{ x, y, z, dx, dy, dz, nx, ny, nz, tile, entry?, exit? }]. Vide pour un anneau flottant ou une plateforme (sans bout).
export function tileEnds(tile) {
  const P = PIECES[tile.t];
  if (RING_KINDS.has(P.kind)) return [];
  if (P.kind === 'fork') {
    const half = P.size * (CELL / 2), y = baseY(tile), n = floorNormal(tile);
    const mk = (branch, t, out) => {
      const lx = forkBranchX(P, t, branch), lz = half - 2 * half * t;
      const w = localToWorld(tile, lx, lz), d = localToWorld(tile, lx, lz + (out ? -1 : 1));
      return { x: w.x, y, z: w.z, dx: d.x - w.x, dy: 0, dz: d.z - w.z, nx: n[0], ny: n[1], nz: n[2], tile, ...(out ? { exit: true, branch } : { entry: true }) };
    };
    return [mk(0, 0, false), mk(0, 1, true), mk(1, 1, true)];
  }
  const pts = centerlineWorld(tile, 6);
  if (pts.length < 2) return [];
  const a = pts[0], a2 = pts[1], b = pts[pts.length - 1], b2 = pts[pts.length - 2];
  const dir = (p, q) => { const v = [p[0] - q[0], p[1] - q[1], p[2] - q[2]], l = hypot3(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const [ax, ay, az] = dir(a, a2), [bx, by, bz] = dir(b, b2);
  const ribbon = isRibbon(tile);
  const na = ribbon ? ribbonNormal(tile, 0) : floorNormal(tile), nb = ribbon ? ribbonNormal(tile, 1) : floorNormal(tile);
  return [
    { x: a[0], y: a[1], z: a[2], dx: ax, dy: ay, dz: az, nx: na[0], ny: na[1], nz: na[2], tile, entry: true },
    { x: b[0], y: b[1], z: b[2], dx: bx, dy: by, dz: bz, nx: nb[0], ny: nb[1], nz: nb[2], tile, exit: true },
  ];
}

// Deux extrémités se touchent-elles (même point à 2 m près, sens opposés) ? Même critère que le vérificateur (editorTools.checkTrack).
export function endsTouch(e, f) {
  return hypot3(e.x - f.x, e.y - f.y, e.z - f.z) < 2 && e.dx * f.dx + e.dy * f.dy + e.dz * f.dz < -0.5;
}

// Angle (rad, 0 à π) entre les normales de la route de part et d'autre d'un raccord : 0 = même roulis ; ≈ 1,57 = sol contre mur ; ≈ 3,14 = endroit contre envers.
export function rollGap(e, f) {
  // Phase 3 : on compare les ROULIS (angle de la normale autour du sens de marche) quand les deux bouts en ont un, pas les normales brutes : une route en pente roulée de 45° a une normale
  // inclinée de l'angle de la pente par rapport à une route plate roulée de 45°, ce qui n'est pas un raccord manqué (la voiture suit la route, pas le sol).
  const te = e.exit ? [e.dx, e.dy, e.dz] : [-e.dx, -e.dy, -e.dz], tf = f.entry ? [-f.dx, -f.dy, -f.dz] : [f.dx, f.dy, f.dz];
  const oe = orientationOf([e.nx, e.ny, e.nz], te), of = orientationOf([f.nx, f.ny, f.nz], tf);
  if (oe && of) { let d = Math.abs(oe.angle - of.angle); if (d > Math.PI) d = 2 * Math.PI - d; return d; }
  const d = e.nx * f.nx + e.ny * f.ny + e.nz * f.nz;
  return Math.acos(Math.max(-1, Math.min(1, d)));
}
export const ROLL_TOLERANCE = 0.35;       // 20° : même seuil que joins.js

// Nom lisible d'une orientation d'après la normale n et le sens de marche t (horizontal) : un mur est « gauche » quand le toit de la voiture pointe vers
// la droite du sens de marche (convention de pieces.js : ORIENTS). Une route dont la tangente est verticale n'a pas de gauche ni de droite : null.
export function rollNameOf(n, t) {
  const o = orientationOf(n, t);
  return o ? o.name : null;
}

// Phase 3 : orientation d'une route d'après sa normale n et son sens de marche t, au pas de 45° : { id (0 sol, 1 mur gauche, 2 mur droit, 3 plafond, 4 incliné gauche, 5 incliné droit,
// 6 surplomb gauche, 7 surplomb droit : pieces.js ORIENTS), name, angle (roulis, rad), err (écart au pas de 45° le plus proche, rad) } ; null si la route est verticale (pas de gauche ni de droite).
const ORI_BY_STEP = { 0: 0, 1: 4, 2: 1, 3: 6, 4: 3, '-1': 5, '-2': 2, '-3': 7, '-4': 3 };
export function orientationOf(n, t) {
  const h = Math.hypot(t[0], t[2]);
  if (h < 0.3) return null;
  const rx = -t[2] / h, rz = t[0] / h;                       // droite du sens de marche (horizontale)
  // « Haut de la route » sans roulis : le haut du monde projeté dans le plan perpendiculaire à t (une route en pente n'est pas roulée). Le roulis ψ est l'angle de la normale autour de t.
  let ux = -t[0] * t[1], uy = 1 - t[1] * t[1], uz = -t[2] * t[1];
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  const side = n[0] * rx + n[2] * rz;                         // composante vers la droite
  const ang = Math.atan2(side, n[0] * ux + n[1] * uy + n[2] * uz);
  const step = Math.round(ang / (Math.PI / 4));
  const id = ORI_BY_STEP[step];
  return { id, name: ORI_NAMES[id], angle: ang, err: Math.abs(ang - step * (Math.PI / 4)) };
}

// Cherche la pièce `type` (avec les options `opts`) dont l'ENTRÉE se raccorde à l'extrémité `end` d'une autre pièce : position, hauteur et sens
// de l'extrémité, plus un roulis compatible. Renvoie les pièces candidates { t, x, z, l, r, ...opts } (de la plus proche à la moins proche), sans
// tester les conflits avec le circuit (l'appelant les contrôle : Track.conflicts, Track.inBounds). `reverse` : on entre par la SORTIE de la pièce
// (pièce parcourue à contresens, comme une courbe gauche faite d'une courbe droite retournée).
export function placementsAfter(end, type, opts = {}, { reverse = false, tolerance = 1.6 } = {}) {
  const P = PIECES[type];
  if (!P || RING_KINDS.has(P.kind)) return [];
  const out = [];
  for (let r = 0; r < 4; r++) {
    const probe = { t: type, x: 0, z: 0, l: 0, r, s: '', p: 0, ...opts };
    const ends = tileEnds(probe);
    const mine = ends.find((e) => (reverse ? e.exit : e.entry));
    if (!mine) continue;
    // Translation en cases entières (x, z) et en niveaux (l) qui amène `mine` sur `end`.
    const x = Math.round((end.x - mine.x) / CELL), z = Math.round((end.z - mine.z) / CELL);
    const l = Math.round(((end.y - mine.y) / LEVEL_H) * 2) / 2;
    const tile = { ...probe, x, z, l };
    const got = tileEnds(tile).find((e) => (reverse ? e.exit : e.entry));
    if (!got) continue;
    const dist = hypot3(got.x - end.x, got.y - end.y, got.z - end.z);
    if (dist > tolerance) continue;
    if (got.dx * end.dx + got.dy * end.dy + got.dz * end.dz > -0.5) continue;
    const gap = rollGap(end, got);
    out.push({ ...tile, _dist: dist, _gap: gap });
  }
  return out.sort((a, b) => a._gap - b._gap || a._dist - b._dist).map(({ _dist, _gap, ...t }) => t);
}

// Le plus petit écart de roulis possible : le candidat compatible s'il existe, sinon null.
export function compatiblePlacement(end, type, opts = {}, o = {}) {
  for (const t of placementsAfter(end, type, opts, o)) {
    const got = tileEnds(t).find((e) => (o.reverse ? e.exit : e.entry));
    if (got && rollGap(end, got) < ROLL_TOLERANCE) return t;
  }
  return null;
}
