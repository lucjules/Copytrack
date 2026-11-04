// Sélection par rayon dans l'éditeur, avec calques.
//
// Le circuit est dessiné en géométrie fusionnée (toutes les pièces dans un seul maillage) : un Raycaster
// ordinaire ne saurait pas QUELLE pièce ou décoration il touche. On lance donc le rayon contre une boîte
// englobante par objet, et chaque objet appartient à un calque (comme THREE.Layers) : le filtre de la gomme
// et du mode Inspection ne voit que les objets du calque demandé. Module pur (aucun rendu).
import * as THREE from './vendor/three.module.min.js';
import { LEVEL_H, ROAD_TOP, RAIL_H, SLAB_T, CELL } from './constants.js';
import { PIECES } from './pieces.js';
import { Track } from './track.js';

export const LAYER_TRACK = 1;   // pièces de piste
export const LAYER_DECO = 2;    // décorations et obstacles
export const LAYER_ALL = LAYER_TRACK | LAYER_DECO;

// Filtres de la gomme.
export const ERASE_FILTERS = {
  all: { mask: LAYER_ALL, label: 'Tout', hint: 'Pièces et décorations' },
  deco: { mask: LAYER_DECO, label: 'Décorations uniquement', hint: 'Les pièces de piste sont ignorées' },
  track: { mask: LAYER_TRACK, label: 'Pistes uniquement', hint: 'Les décorations sont ignorées' },
};
export const ERASE_FILTER_ORDER = ['all', 'deco', 'track'];

// Boîte englobante d'une pièce : son empreinte au sol, de dessous la dalle au-dessus des rebords / du portique.
export function tileBounds(tile, out = new THREE.Box3()) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [cx, cz] of Track.cellsOf(tile)) {
    x0 = Math.min(x0, cx); x1 = Math.max(x1, cx + 1);
    z0 = Math.min(z0, cz); z1 = Math.max(z1, cz + 1);
  }
  const [lo, hi] = Track.range(tile);
  return out.set(
    new THREE.Vector3(x0 * CELL, lo * LEVEL_H + ROAD_TOP - SLAB_T, z0 * CELL),
    new THREE.Vector3(x1 * CELL, hi * LEVEL_H + ROAD_TOP + RAIL_H, z1 * CELL),
  );
}

// Boîte englobante d'une décoration (posée en (x, y, z), taille s).
export function decoBounds(d, out = new THREE.Box3()) {
  const h = 1.5 * d.s;
  return out.set(new THREE.Vector3(d.x - h, d.y - 0.2, d.z - h), new THREE.Vector3(d.x + h, d.y + 4 * d.s, d.z + h));
}

// Rayon contre boîte (méthode des dalles) : [entrée, sortie] le long du rayon, ou null.
export function rayBox(ray, box) {
  let t0 = 0, t1 = Infinity;
  for (const a of ['x', 'y', 'z']) {
    const o = ray.origin[a], d = ray.direction[a];
    if (Math.abs(d) < 1e-12) { if (o < box.min[a] || o > box.max[a]) return null; continue; }
    let a0 = (box.min[a] - o) / d, a1 = (box.max[a] - o) / d;
    if (a0 > a1) [a0, a1] = [a1, a0];
    t0 = Math.max(t0, a0); t1 = Math.min(t1, a1);
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

const B = new THREE.Box3();

// Objet touché par le rayon, limité aux calques de `mask`. Renvoie { kind: 'tile' | 'deco', obj, dist } ou null.
// Une décoration posée sur une route est DANS la boîte de la pièce : elle l'emporte tant qu'elle n'est pas
// entièrement cachée derrière (son entrée dans la boîte vient avant la sortie de celle de la pièce).
export function pickObjects(track, ray, mask = LAYER_ALL) {
  let tile = null, deco = null;
  if (mask & LAYER_TRACK) {
    for (const t of track.tiles) {
      const r = rayBox(ray, tileBounds(t, B));
      if (r && (!tile || r[0] < tile.dist)) tile = { kind: 'tile', obj: t, dist: r[0], exit: r[1] };
    }
  }
  if (mask & LAYER_DECO) {
    for (const d of track.decos) {
      const r = rayBox(ray, decoBounds(d, B));
      if (r && (!deco || r[0] < deco.dist)) deco = { kind: 'deco', obj: d, dist: r[0], exit: r[1] };
    }
  }
  if (tile && deco) return deco.dist <= tile.exit ? deco : tile;
  return deco || tile;
}
