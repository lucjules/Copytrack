// Mini-carte en course (0.15.0) : le circuit vu de dessus, nord en haut, avec la voiture du joueur, son fantôme et les adversaires.
// Le tracé est dessiné une fois (miniature de la fiche du circuit, ui/trackMap.js) ; chaque mise à jour (≈ 12 fois par seconde) ne repose que des points.
// Cachée par « Interface › masquer : mini-carte » (HUD_HIDE, classe hud-no-minimap) et par les profils de HUD qui la retirent.
import { mapGeometry, fitView, drawTrackMap } from './trackMap.js';

export const MINIMAP_W = 168, MINIMAP_H = 120;

// Position (x, z) du monde → pixel de la mini-carte. Pur : testé sous Node (tools/test-minimap.mjs).
export function toMap(view, x, z) { return { x: view.ox + (x - view.minX) * view.s, y: view.oz + (z - view.minZ) * view.s }; }

export class MiniMap {
  constructor(track, { parent = null, w = MINIMAP_W, h = MINIMAP_H } = {}) {
    this.geom = mapGeometry(track);
    this.view = fitView(this.geom.bounds, w, h, 8);
    this.w = w; this.h = h;
    this.lastMs = -1e9;
    if (typeof document === 'undefined') return;
    const c = this.canvas = document.createElement('canvas');
    c.id = 'minimap'; c.className = 'minimap'; c.width = w; c.height = h;
    c.setAttribute('aria-hidden', 'true');
    this.base = document.createElement('canvas'); this.base.width = w; this.base.height = h;
    drawTrackMap(this.base.getContext('2d'), this.geom, this.view, { bg: 'rgba(14, 10, 32, 0.72)', zones: false });
    (parent || document.getElementById('hud') || document.body).appendChild(c);
    this.g = c.getContext('2d');
  }

  // points : [{ x, z, color, r, ring }] ; le joueur en dernier (dessiné par-dessus). nowMs : pour ne redessiner qu'environ 12 fois par seconde.
  draw(points, nowMs = 0) {
    if (!this.g || nowMs - this.lastMs < 80) return false;
    this.lastMs = nowMs;
    const g = this.g;
    g.clearRect(0, 0, this.w, this.h);
    g.drawImage(this.base, 0, 0);
    for (const p of points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
      const q = toMap(this.view, p.x, p.z);
      g.beginPath(); g.arc(q.x, q.y, p.r || 3.5, 0, 7);
      g.fillStyle = p.color || '#ffffff'; g.fill();
      if (p.ring) { g.lineWidth = 1.5; g.strokeStyle = '#0b0820'; g.stroke(); }
    }
    return true;
  }

  dispose() { if (this.canvas) this.canvas.remove(); this.g = null; }
}
