// Orientations d'une route et chemins de transitions (phase 3). Module PUR : géométrie des extrémités et table des pièces de transition, rien d'autre.
// Une orientation est un id 0..7 (pieces.js, ORIENTS) : 0 sol, 1 mur gauche, 2 mur droit, 3 plafond, 4 incliné gauche 45°, 5 incliné droit 45°, 6 surplomb gauche 135°, 7 surplomb droit 135°.
// Sert à l'outil Prolonger (raccordement automatique : insère les transitions manquantes), à la matrice de compatibilité et au vérificateur.
import { ORI_TO_O, ROLL_PASSAGES, ROLL_PASSAGES45, ORI_NAMES } from './pieces.js';
import { orientationOf, tileEnds } from './connect.js';
import { Track } from './track.js';

// Orientation (id) d'une extrémité de pièce ; null si la route y est verticale ou si son roulis n'est pas un multiple de 45° (écart > 11°).
export function oriIdOfEnd(e) {
  const n = [e.nx, e.ny, e.nz], t = [e.exit ? e.dx : -e.dx, e.exit ? e.dy : -e.dy, e.exit ? e.dz : -e.dz];
  const o = orientationOf(n, t);
  return o && o.err < 0.2 ? o.id : null;
}
export const oriLabel = (id) => (id === null || id === undefined ? 'orientation quelconque' : ORI_NAMES[id]);

// Options d'une pièce posée dans l'orientation d'id i : le plafond est le drapeau v, les autres le roulis o.
export const optsOfOri = (i) => (i === 3 ? { v: 1 } : i ? { o: ORI_TO_O[i] } : {});

// Orientation d'ENTRÉE d'une pièce posée avec `opts` (d'après la normale de son entrée) ; null si elle n'est pas lisible.
export function entryOrientation(type, opts = {}) {
  const t = Track.normalize({ t: type, x: 0, z: 0, l: 12, r: 0, s: '', p: 0, ...opts });
  const e = tileEnds(t).find((x) => x.entry);
  return e ? oriIdOfEnd(e) : null;
}

// Plus court chemin de pièces de transition d'une orientation à une autre : liste d'identifiants de pièces (tr01s, tr14s…), [] si déjà là, null si impossible.
// viaCeiling : autorise le passage par le plafond (la matrice, qui a sa propre vrille, l'interdit pour garder ses chaînes d'origine).
export function transitionPath(a, b, viaCeiling = false) {
  if (a === b) return [];
  const edges = [...ROLL_PASSAGES, ...ROLL_PASSAGES45].map((k) => [+k[0], +k[1], `tr${k}s`]).filter(([x, y]) => viaCeiling || (x !== 3 && y !== 3));
  const prev = new Map([[a, null]]), q = [a];
  while (q.length) {
    const x = q.shift();
    if (x === b) break;
    for (const [f, t, id] of edges) if (f === x && !prev.has(t)) { prev.set(t, [x, id]); q.push(t); }
  }
  if (!prev.has(b)) return null;
  const out = [];
  for (let x = b; prev.get(x); x = prev.get(x)[0]) out.unshift(prev.get(x)[1]);
  return out;
}

// Phase 3 : orientation d'un obstacle posé SUR la route en un point où la route a la normale n et le sens de marche t (vecteurs unitaires monde) : son haut est la normale de la route,
// son axe z local (qui pointe vers l'arrière de la marche, comme sur une route au sol) suit la route. Renvoie { ry, rz } (rad) pour Track.addDeco ; rz est arrondi au pas de 45° par addDeco.
export function obstacleRollOn(n, t) {
  const o = orientationOf(n, t);
  if (!o) return { ry: Math.atan2(-t[0], -t[2]), rz: 0 };      // route verticale : pas de roulis défini, l'obstacle reste droit
  return { ry: Math.atan2(-t[0], -t[2]), rz: o.angle };
}
