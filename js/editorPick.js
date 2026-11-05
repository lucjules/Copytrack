// Sélection par rayon dans l'éditeur, avec calques.
//
// Le circuit est dessiné en géométrie fusionnée (toutes les pièces dans un seul maillage) : un Raycaster
// ordinaire ne saurait pas QUELLE pièce ou décoration il touche. On lance donc le rayon contre une boîte
// englobante par objet, et chaque objet appartient à un calque (comme THREE.Layers) : le filtre de la gomme
// et du mode Inspection ne voit que les objets du calque demandé. Module pur (aucun rendu).
import * as THREE from './vendor/three.module.min.js';
import { LEVEL_H, ROAD_TOP, RAIL_H, SLAB_T, CELL, ROAD_HALF, RAIL_W } from './constants.js';
import { PIECES, baseY, toLocal, sampleLocal } from './pieces.js';
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

// ---- Phase 3 : visée exacte ---------------------------------------------------------------------------------------------
const FLOORISH = new Set(['line', 'arc', 'area', 'fork']);
const LQ = { lx: 0, lz: 0 }, SQ = {};

// Pièce EXACTE visée par le rayon, quelle que soit la hauteur de pose choisie dans l'éditeur. Les boîtes englobantes sélectionnent
// les candidats (du plus proche au plus lointain) ; pour une route à plat (droite, virage, plateforme, bifurcation) on vérifie que
// le rayon traverse bien sa chaussée (pas seulement le volume vide au-dessus d'une pièce basse) ; les rubans, loopings et anneaux
// se contentent de leur boîte (comme une route posée sur un mur). Renvoie { kind: 'tile', obj, dist, x, y, z } ou null.
export function pickTileExact(track, ray) {
  const cand = [];
  for (const t of track.tiles) {
    const r = rayBox(ray, tileBounds(t, B));
    if (r) cand.push({ t, t0: r[0], t1: r[1] });
  }
  cand.sort((a, b) => a.t0 - b.t0);
  for (const c of cand) {
    const tile = c.t, P = PIECES[tile.t];
    if (!FLOORISH.has(P.kind) || tile.o) return { kind: 'tile', obj: tile, dist: c.t0, x: ray.origin.x + ray.direction.x * c.t0, y: ray.origin.y + ray.direction.y * c.t0, z: ray.origin.z + ray.direction.z * c.t0 };
    const base = baseY(tile);
    const end = Math.min(c.t1, c.t0 + 4000);
    for (let d = c.t0; d <= end + 0.4; d += 0.8) {
      const x = ray.origin.x + ray.direction.x * d, y = ray.origin.y + ray.direction.y * d, z = ray.origin.z + ray.direction.z * d;
      toLocal(tile, x, z, LQ);
      sampleLocal(tile, LQ.lx, LQ.lz, SQ);
      if (!SQ.inFootprint || (P.kind !== 'area' && Math.abs(SQ.d) > ROAD_HALF + RAIL_W + 0.3)) continue;
      const h = tile.v ? 2 * base - SQ.h : SQ.h;                      // pièce à l'envers : route sous son niveau
      if (y <= h + RAIL_H + 0.5 && y >= h - SLAB_T - 0.8) return { kind: 'tile', obj: tile, dist: d, x, y, z };
    }
  }
  return null;
}

// Premier point où le rayon rencontre une surface roulable (route à plat) ou le sol (y = 0). Sert à poser une décoration
// n'importe où, à une altitude quelconque : { x, y, z, tile } (tile = null pour le sol). On marche le long du rayon ; le croisement
// est cherché par rapport à l'altitude du pas PRÉCÉDENT, pour qu'une route au-dessus du rayon (un pont) ne soit pas prise pour
// une surface touchée.
const SS = {};
export function rayToSurface(track, ray, maxDist = 3000) {
  let t = 0, py = ray.origin.y;
  if (ray.direction.y > -1e-6 && py > 0) return null;                 // le rayon ne descend pas vers le sol
  while (t < maxDist) {
    const step = t < 400 ? 1.5 : 5;
    t += step;
    const x = ray.origin.x + ray.direction.x * t, y = ray.origin.y + ray.direction.y * t, z = ray.origin.z + ray.direction.z * t;
    // Plus haute surface (ou sol) sous l'altitude précédente, à la position actuelle.
    const s = track.surfaceAt(x, py, z, SS, 0);
    if (y <= s.h) {
      // Affinage par dichotomie entre le pas précédent et celui-ci.
      let a = t - step, b = t;
      for (let i = 0; i < 12; i++) {
        const m = (a + b) / 2;
        const mx = ray.origin.x + ray.direction.x * m, my = ray.origin.y + ray.direction.y * m, mz = ray.origin.z + ray.direction.z * m;
        const sm = track.surfaceAt(mx, py, mz, SS, 0);
        if (my <= sm.h) b = m; else a = m;
      }
      const hx = ray.origin.x + ray.direction.x * b, hz = ray.origin.z + ray.direction.z * b;
      const sh = track.surfaceAt(hx, py, hz, SS, 0);
      return { x: hx, y: sh.h, z: hz, tile: sh.tile || null };
    }
    py = y;
  }
  return null;
}
