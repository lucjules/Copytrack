// Avancement d'une voiture sur le circuit (0 à 1) et grille de départ : sert au classement en direct d'une manche et à placer les voitures sans qu'elles
// se superposent au départ. Logique pure.
import { hypot3 } from '../dmath.js';

// Avancement le long de la ligne centrale `path` ([[x, y, z, drapeau], …], toute la course : un circuit à plusieurs tours y est répété). Une recherche autour du
// dernier point connu (quelques points d'avance, un peu de recul) suffit tant que la voiture roule ; après un saut (retour au checkpoint), on cherche dans
// tout le tour en cours (lo / hi : bornes d'indices fournies par l'appelant).
export class ProgressTracker {
  constructor(path) {
    this.path = path && path.length > 2 ? path : null;
    this.idx = 0;
    if (this.path) {
      const n = this.path.length;
      this.cum = new Float32Array(n);
      for (let i = 1; i < n; i++) { const a = this.path[i - 1], b = this.path[i]; this.cum[i] = this.cum[i - 1] + hypot3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }
      this.total = this.cum[n - 1] || 1;
    }
  }

  get available() { return !!this.path; }
  reset() { this.idx = 0; }

  _best(pos, from, to) {
    let best = from, bd = Infinity;
    const P = this.path;
    for (let i = Math.max(0, from); i <= Math.min(P.length - 1, to); i++) {
      const q = P[i], dx = q[0] - pos.x, dz = q[2] - pos.z, dy = (q[1] - pos.y) * 2;
      const d = dx * dx + dz * dz + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return { best, bd };
  }

  // Indices de la ligne centrale qui correspondent au tour `lap` (1, 2…) sur `laps` : [lo, hi], avec une marge pour ne pas rater le début et la fin du tour.
  lapRange(lap, laps) {
    if (!this.path) return null;
    const n = this.path.length, per = n / Math.max(1, laps), m = Math.ceil(per * 0.06) + 8;
    return [Math.max(0, Math.floor(per * (Math.max(1, lap) - 1)) - m), Math.min(n - 1, Math.ceil(per * Math.min(laps, Math.max(1, lap))) + m)];
  }

  // pos : { x, y, z } ; range : [lo, hi] indices autorisés (le tour en cours) ou null. Renvoie l'avancement 0..1 (null sans ligne centrale).
  // jumped : la voiture vient d'être replacée (retour au checkpoint) : on cherche dans tout le tour, pas seulement devant.
  update(pos, range = null, jumped = false) {
    if (!this.path) return null;
    const n = this.path.length, lo = range ? Math.max(0, range[0]) : 0, hi = range ? Math.min(n - 1, range[1]) : n - 1;
    let r = jumped ? null : this._best(pos, Math.max(lo, this.idx - 40), Math.min(hi, this.idx + 120));
    if (!r || r.bd > 70 * 70) r = this._best(pos, lo, hi);
    this.idx = r.best;
    return this.cum[this.idx] / this.total;
  }
}

// Avancement de repli (circuit sans ligne centrale : circuit de joueur) : checkpoints franchis sur le total + 1 (l'arrivée), tours compris.
export function checkpointProgress(collected, cps, lap, laps) {
  return Math.max(0, Math.min(1, ((Math.max(1, lap) - 1) * (cps + 1) + collected) / (Math.max(1, laps) * (cps + 1))));
}

// Place d'une voiture sur la grille de départ. sp : { x, y, z, yaw, … } (le point de départ du circuit) ; slot : 0, 1, 2… dans l'ordre de la grille (le premier devant) ;
// count : nombre de voitures. Jusqu'à 4 de front (route de 24 m), rangées de 6 m vers l'arrière : 8 voitures tiennent sur la case de départ (32 m).
export const GRID_COLS = 4, GRID_COL_GAP = 5.5, GRID_ROW_GAP = 6;
export function gridSpawn(sp, slot, count) {
  const cols = Math.max(1, Math.min(GRID_COLS, count)), row = Math.floor(slot / cols), col = slot % cols;
  const fx = -Math.sin(sp.yaw), fz = -Math.cos(sp.yaw), rx = -fz, rz = fx;         // avant et droite (le cap 0 regarde vers -z)
  const side = (col - (cols - 1) / 2) * GRID_COL_GAP, back = row * GRID_ROW_GAP;
  return { ...sp, x: sp.x + rx * side - fx * back, z: sp.z + rz * side - fz * back };
}
