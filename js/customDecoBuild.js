// Géométrie des pièces décoratives personnalisées (lot 12) : construction sur un GeoBuilder. Données et validation : customDeco.js.
import { cylinder, cone, sphere } from './decoPrimitives.js';
import { sanitizeDecoParts } from './customDeco.js';

// ---------------------------------------------------------------- géométrie
// Hexaèdre tourné autour de Y, centré en (cx, cy, cz) : mêmes faces et même sens que GeoBuilder.hex8.
function rbox(t, cx, cy, cz, sx, sy, sz, ry, color) {
  const c = Math.cos(ry), s = Math.sin(ry), hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const P = (ix, iy, iz) => { const lx = ix ? hx : -hx, lz = iz ? hz : -hz; return [cx + lx * c + lz * s, cy + (iy ? hy : -hy), cz - lx * s + lz * c]; };
  t.quad(P(1, 0, 1), P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), color);
  t.quad(P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0), color);
  t.quad(P(0, 1, 1), P(1, 1, 1), P(1, 1, 0), P(0, 1, 0), color);
  t.quad(P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1), color);
  t.quad(P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1), color);
  t.quad(P(1, 0, 0), P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), color);
}

function wedge(t, p, color) {
  const ry = p.ry * Math.PI / 180, c = Math.cos(ry), s = Math.sin(ry), hx = p.sx / 2, hy = p.sy / 2, hz = p.sz / 2;
  const V = (lx, ly, lz) => [p.x + lx * c + lz * s, p.y + ly, p.z - lx * s + lz * c];
  const A = V(-hx, -hy, -hz), B = V(hx, -hy, -hz), C = V(hx, -hy, hz), D = V(-hx, -hy, hz), E = V(-hx, hy, hz), F = V(hx, hy, hz);
  t.quad(A, B, C, D, color); t.quad(D, C, F, E, color); t.quad(A, E, F, B, color);
  t.tri(A, D, E, color); t.tri(B, F, C, color);
}

// Construit les formes sur gb (matière pleine) et glow (matière lumineuse). Les rayons des formes rondes suivent la plus grande des deux largeurs.
export function buildCustomParts(gb, glow, parts) {
  let n = 0;
  for (const p of sanitizeDecoParts(parts)) {
    const t = p.g ? glow : gb, r = Math.max(p.sx, p.sz) / 2, ry = p.ry * Math.PI / 180;
    if (p.s === 'box') rbox(t, p.x, p.y, p.z, p.sx, p.sy, p.sz, ry, p.c);
    else if (p.s === 'sphere') sphere(t, p.x, p.y, p.z, r, p.c, null, p.sy / 2, 3, 8);
    else if (p.s === 'cyl') cylinder(t, p.x, p.y - p.sy / 2, p.y + p.sy / 2, p.z, r, 10, p.c);
    else if (p.s === 'cone') cone(t, p.x, p.y - p.sy / 2, p.z, r, p.sy, 10, p.c);
    else if (p.s === 'wedge') wedge(t, p, p.c);
    else if (p.s === 'ring') for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; rbox(t, p.x + Math.cos(a) * r * 0.85, p.y, p.z + Math.sin(a) * r * 0.85, r * 0.6, p.sy, 0.15 * Math.max(0.3, r), -a + Math.PI / 2, p.c); }
    n++;
  }
  return n;
}
