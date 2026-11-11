// Sélection par rayon dans l'éditeur, avec calques.
//
// Le circuit est dessiné en géométrie fusionnée (toutes les pièces dans un seul maillage) : un Raycaster
// ordinaire ne saurait pas QUELLE pièce ou décoration il touche. On lance donc le rayon contre une boîte
// englobante par objet, et chaque objet appartient à un calque (comme THREE.Layers) : le filtre de la gomme
// et du mode Inspection ne voit que les objets du calque demandé. Module pur (aucun rendu).
import * as THREE from './vendor/three.module.min.js';
import { LEVEL_H, ROAD_TOP, RAIL_H, SLAB_T, CELL, ROAD_HALF, RAIL_W } from './constants.js';
import { PIECES, baseY, toLocal, sampleLocal, isRibbon, isCeilingFloor } from './pieces.js';
import { ribbonOf, centerlineWorld } from './ribbons.js';
import { frameWorld } from './physics/ribbon.js';
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
  if (d.rx || d.rz) { const r = 4 * d.s; return out.set(new THREE.Vector3(d.x - r, d.y - r, d.z - r), new THREE.Vector3(d.x + r, d.y + r, d.z + r)); }      // inclinée : boîte autour du pied, assez grande pour tout cap
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
// ok(obj) : objet visable (éditeur : pas dans un calque masqué ou verrouillé).
export function pickObjects(track, ray, mask = LAYER_ALL, ok = null) {
  let tile = null, deco = null;
  if (mask & LAYER_TRACK) {
    for (const t of track.tiles) {
      if (ok && !ok(t)) continue;
      const r = rayBox(ray, tileBounds(t, B));
      if (r && (!tile || r[0] < tile.dist)) tile = { kind: 'tile', obj: t, dist: r[0], exit: r[1] };
    }
  }
  if (mask & LAYER_DECO) {
    for (const d of track.decos) {
      if (ok && !ok(d)) continue;
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
export function pickTileExact(track, ray, ok = null) {
  const cand = [];
  for (const t of track.tiles) {
    if (ok && !ok(t)) continue;
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

// Phase 3 : point où le rayon touche une route en RUBAN (mur, plafond, plan incliné, looping, vrille…), que rayToSurface (champ de hauteur du sol) ne voit pas.
// Renvoie { x, y, z, tile, n: [nx, ny, nz], t: [tx, ty, tz], dist } (normale de la route et sens de marche au point touché) ou null. On échantillonne chaque ruban (33 repères), on écarte
// ceux que le rayon ne peut pas toucher (boîte englobante des repères, marge = demi-largeur de route) puis on avance le long du rayon jusqu'au passage de l'extérieur à l'intérieur du plan.
const RF = {};
export function rayToRibbon(track, ray, maxDist = 3000) {
  const o = ray.origin, d = ray.direction;
  let best = null;
  const N = 32, M = ROAD_HALF + 2;
  for (const tile of track.tiles) {
    const ceil = isCeilingFloor(tile) && !tile.mv;            // route posée à l'envers : un sol retourné (pas un ruban), sa normale pointe vers le bas
    if (!(isRibbon(tile) || ceil) || tile.mv) continue;
    const rib = ceil ? null : ribbonOf(tile);
    if (!ceil && !rib) continue;
    const fr = [];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const cl = ceil ? centerlineWorld(tile, N) : null;
    for (let i = 0; i <= N; i++) {
      if (ceil) {
        const a = cl[Math.max(0, i - 1)], b = cl[Math.min(N, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
        const t = [(b[0] - a[0]) / l, (b[1] - a[1]) / l, (b[2] - a[2]) / l];
        const rh = Math.hypot(t[0], t[2]) || 1;
        const rr = [-t[2] / rh, 0, t[0] / rh];                   // droite du sens de marche, horizontale
        RF.px = cl[i][0]; RF.py = cl[i][1]; RF.pz = cl[i][2]; RF.nx = 0; RF.ny = -1; RF.nz = 0; RF.rx = rr[0]; RF.ry = rr[1]; RF.rz = rr[2]; RF.tx = t[0]; RF.ty = t[1]; RF.tz = t[2];
      } else frameWorld(tile, rib, i / N, RF);
      fr.push({ p: [RF.px, RF.py, RF.pz], n: [RF.nx, RF.ny, RF.nz], r: [RF.rx, RF.ry, RF.rz], t: [RF.tx, RF.ty, RF.tz] });
      x0 = Math.min(x0, RF.px); x1 = Math.max(x1, RF.px); y0 = Math.min(y0, RF.py); y1 = Math.max(y1, RF.py); z0 = Math.min(z0, RF.pz); z1 = Math.max(z1, RF.pz);
    }
    x0 -= M; x1 += M; y0 -= M; y1 += M; z0 -= M; z1 += M;
    // Intersection rayon / boîte (méthode des plans) : [tmin, tmax].
    let tmin = 0, tmax = maxDist, ok = true;
    for (const [oo, dd, lo, hi] of [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]]) {
      if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) { ok = false; break; } continue; }
      let a = (lo - oo) / dd, b = (hi - oo) / dd;
      if (a > b) [a, b] = [b, a];
      tmin = Math.max(tmin, a); tmax = Math.min(tmax, b);
      if (tmin > tmax) { ok = false; break; }
    }
    if (!ok || (best && tmin > best.dist)) continue;
    let prevDn = null;
    for (let t = tmin; t <= tmax; t += 0.75) {
      const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
      // Repère le plus proche (le long de la route), puis position dans son plan.
      let bi = 0, bd = Infinity;
      for (let i = 0; i <= N; i++) { const q = fr[i].p, dd2 = (px - q[0]) ** 2 + (py - q[1]) ** 2 + (pz - q[2]) ** 2; if (dd2 < bd) { bd = dd2; bi = i; } }
      const f = fr[bi];
      const dx = px - f.p[0], dy = py - f.p[1], dz = pz - f.p[2];
      const dn = dx * f.n[0] + dy * f.n[1] + dz * f.n[2], dl = dx * f.r[0] + dy * f.r[1] + dz * f.r[2];
      const inside = Math.abs(dl) <= ROAD_HALF && bd < (ROAD_HALF * 2) ** 2;
      if (prevDn !== null && prevDn > 0 && dn <= 0 && inside) {
        if (!best || t < best.dist) best = { x: px - f.n[0] * dn, y: py - f.n[1] * dn, z: pz - f.n[2] * dn, tile, n: f.n, t: f.t, dist: t };
        break;
      }
      prevDn = inside ? dn : null;
    }
  }
  return best;
}
