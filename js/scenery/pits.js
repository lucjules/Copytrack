// Fosses du terrain (0.12.2) : une pièce qui plonge sous son niveau (vrille, tire-bouchon, looping double ou triple) posée trop bas dans un circuit
// d'avant l'interdiction (Track.inBounds) passait sous le sol. Le terrain est découpé autour de sa partie enterrée et une fosse (fond et parois)
// la laisse voir. Purement visuel : la physique n'a pas de terrain (le sol est à y = 0, la route est au-dessus).
import { PIECES, baseY, localToWorld } from '../pieces.js';
import { ROAD_HALF } from '../constants.js';
import { ribbonOf, frameLocal } from '../ribbons.js';

const F = {}, W = {};
const GROUND = -0.02, MARGIN = 3, FLOOR_GAP = 1.5;

// Rectangles { x0, x1, z0, z1, y } (y : fond de la fosse) des parties de route sous le terrain.
export function pitsFor(track) {
  const out = [];
  for (const tile of track.tiles) {
    const P = PIECES[tile.t];
    if (!P || tile.v || !(P.kind === 'ribbon' || P.kind === 'loop')) continue;
    if (baseY(tile) > 16) continue;                     // (rien ne plonge de plus de 16 m)
    const rib = ribbonOf(tile);
    if (!rib) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y = Infinity;
    const n = Math.max(24, Math.ceil(rib.len / 2));
    for (let i = 0; i <= n; i++) {
      frameLocal(rib, i / n, F);
      const hw = F.wrap ? 0 : F.hw || ROAD_HALF;
      for (const sg of [-1, -0.5, 0, 0.5, 1]) {
        const py = F.py + F.ry * sg * hw;
        if (py >= GROUND) continue;
        localToWorld(tile, F.px + F.rx * sg * hw, F.pz + F.rz * sg * hw, W);
        x0 = Math.min(x0, W.x); x1 = Math.max(x1, W.x); z0 = Math.min(z0, W.z); z1 = Math.max(z1, W.z); y = Math.min(y, py);
      }
    }
    if (y < GROUND) out.push({ x0: x0 - MARGIN, x1: x1 + MARGIN, z0: z0 - MARGIN, z1: z1 + MARGIN, y: y - FLOOR_GAP });
  }
  return out;
}

// Polygone convexe coupé par le demi-plan { p : s · (p[axis] − v) ≥ 0 } (Sutherland-Hodgman, hauteur interpolée).
function clip(poly, axis, v, s) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = s * (a[axis] - v), db = s * (b[axis] - v);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

// Le triangle privé des rectangles : liste de triangles (même sens de rotation). Hors de toute fosse : le triangle tel quel.
export function cutTriangle(tri, pits) {
  let polys = [tri];
  for (const r of pits) {
    const next = [];
    for (const poly of polys) {
      let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
      for (const p of poly) { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mnz = Math.min(mnz, p[2]); mxz = Math.max(mxz, p[2]); }
      if (mxx <= r.x0 || mnx >= r.x1 || mxz <= r.z0 || mnz >= r.z1) { next.push(poly); continue; }
      // Quatre morceaux hors du rectangle : à gauche, à droite, puis devant et derrière dans la bande du milieu.
      const left = clip(poly, 0, r.x0, -1), right = clip(poly, 0, r.x1, 1);
      const mid = clip(clip(poly, 0, r.x0, 1), 0, r.x1, -1);
      const front = clip(mid, 2, r.z0, -1), back = clip(mid, 2, r.z1, 1);
      for (const q of [left, right, front, back]) if (q.length >= 3) next.push(q);
    }
    polys = next;
  }
  const tris = [];
  for (const poly of polys) for (let i = 1; i + 1 < poly.length; i++) tris.push([poly[0], poly[i], poly[i + 1]]);
  return tris;
}

// Fond et parois d'une fosse (vus de l'intérieur).
export function pitInto(gb, r, floorCol, wallCol) {
  const y0 = GROUND, y1 = r.y;
  gb.quad([r.x0, y1, r.z0], [r.x0, y1, r.z1], [r.x1, y1, r.z1], [r.x1, y1, r.z0], floorCol);
  gb.quad([r.x0, y0, r.z0], [r.x1, y0, r.z0], [r.x1, y1, r.z0], [r.x0, y1, r.z0], wallCol);
  gb.quad([r.x1, y0, r.z1], [r.x0, y0, r.z1], [r.x0, y1, r.z1], [r.x1, y1, r.z1], wallCol);
  gb.quad([r.x0, y0, r.z1], [r.x0, y0, r.z0], [r.x0, y1, r.z0], [r.x0, y1, r.z1], wallCol);
  gb.quad([r.x1, y0, r.z0], [r.x1, y0, r.z1], [r.x1, y1, r.z1], [r.x1, y1, r.z0], wallCol);
}
