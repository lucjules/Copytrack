// Aides « pures » (sans DOM ni 3D) de l'éditeur et de l'inspecteur, faciles à tester.
import { PIECES, rotVec } from './pieces.js';
import { centerlineWorld } from './ribbons.js';
import { Track } from './track.js';
import { familyOf, FAMILIES } from './families.js';

// Pose de la flèche blanche semi-transparente qui indique le sens de parcours d'une pièce inspectée :
// un point sur sa ligne centrale (au milieu de la route ; pour un ruban ou un looping, juste après l'entrée, là où la route est
// encore horizontale) et le cap de la route en ce point. Renvoie { x, y, z, yaw, len }.
export function arrowPose(tile) {
  const P = PIECES[tile.t];
  const pts = centerlineWorld(tile, 16);
  const frac = P.kind === 'loop' || P.kind === 'ribbon' ? 0.1 : 0.5;
  // Abscisse curviligne (en plan) de chaque point.
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
  const total = s[s.length - 1] || 1;
  let i = 1;
  while (i < pts.length - 1 && s[i] < total * frac) i++;
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], m = pts[i];
  let tx = b[0] - a[0], tz = b[2] - a[2];
  if (Math.hypot(tx, tz) < 0.5) {            // route presque verticale (mur) : on retombe sur le sens nominal de la pièce
    const f = rotVec(tile.r, 0, -1, { x: 0, z: 0 });
    tx = f.x; tz = f.z;
  }
  const len = Math.min(P.size * 24 * 0.55, 30);
  // Pièce posée à l'envers : la route est sous son niveau, la flèche se pose donc de l'autre côté.
  return { x: m[0], y: m[1] + (tile.v ? -1.1 : 1.1), z: m[2], yaw: Math.atan2(-tx, -tz), len };
}

// Pièce voisine dans la même famille quand on change UNE caractéristique, avec une position qui garde la pièce « en place »
// même si son empreinte change (looping 1 → 3 boucles : 2×2 → 4×4). Candidats classés du plus proche du centre au moins proche.
// Renvoie le premier candidat qui tient (place libre, niveaux valides) ou null. `track` : le circuit (la pièce y est retirée le temps du test).
export function retypePlacement(track, tile, type) {
  const old = PIECES[tile.t].size, size = PIECES[type].size;
  const d = size - old;
  const lo = -Math.ceil(d / 2), hi = -Math.floor(d / 2);
  const offsets = [];
  for (let dx = Math.min(lo, hi); dx <= Math.max(lo, hi); dx++) for (let dz = Math.min(lo, hi); dz <= Math.max(lo, hi); dz++) offsets.push([dx, dz]);
  // Puis le reste, au cas où l'ancre « centrée » est prise.
  for (let dx = Math.min(0, -d); dx <= Math.max(0, -d); dx++) for (let dz = Math.min(0, -d); dz <= Math.max(0, -d); dz++) if (!offsets.some(([a, b]) => a === dx && b === dz)) offsets.push([dx, dz]);
  track.remove(tile);
  try {
    for (const [dx, dz] of offsets) {
      const cand = Track.normalize({ ...tile, t: type, x: tile.x + dx, z: tile.z + dz });
      if (Track.inBounds(cand) && !track.conflicts(cand).length) return cand;
    }
  } finally { track._insert(tile); }
  return null;
}

// Description d'une pièce pour l'inspecteur : famille, valeurs de caractéristiques, liste de menus à afficher.
export function traitsOf(type) {
  const f = familyOf(type);
  if (!f) return null;
  const F = FAMILIES[f.fam];
  return { fam: f.fam, label: F.label, traits: F.traits, values: f.traits };
}
