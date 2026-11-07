// Primitives de géométrie low-poly des décorations (coordonnées locales, base à y = 0, 1 unité = 1 m) : cylindre, cône, sphère, octaèdre, membre,
// étoile… Elles écrivent des triangles dans un GeoBuilder (geo.js). decos.js et decoPack.js s'en servent ; aucune ne dépend du rendu Three.js.
export const TAU = Math.PI * 2;

export function ringPts(cx, y, cz, r, n, off = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * TAU;
    out.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]);
  }
  return out;
}

export function cylinder(gb, cx, y0, y1, cz, r, n, color, r1 = r) {
  const A = ringPts(cx, y0, cz, r, n), B = ringPts(cx, y1, cz, r1, n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    gb.quad(A[j], A[i], B[i], B[j], color);
    gb.tri([cx, y1, cz], B[i], B[j], color);
    gb.tri(A[i], [cx, y0, cz], A[j], color);
  }
}

export function cone(gb, cx, y0, cz, r, h, n, color, color2 = null) {
  const A = ringPts(cx, y0, cz, r, n);
  const apex = [cx, y0 + h, cz];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    gb.tri(A[j], A[i], apex, color2 && i % 2 ? color2 : color);
    gb.tri(A[i], [cx, y0, cz], A[j], color);
  }
}

export function sphere(gb, cx, cy, cz, r, color, color2 = null, ry = r, lat = 4, lon = 8, top = false) {
  const rows = [];
  for (let i = 0; i <= lat; i++) {
    const a = (i / lat) * Math.PI - Math.PI / 2;
    rows.push(ringPts(cx, cy + Math.sin(a) * ry, cz, Math.cos(a) * r + 1e-4, lon, i * 0.2));
  }
  const from = top ? Math.floor(lat / 2) : 0;
  for (let i = from; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const k = (j + 1) % lon;
      const col = color2 && (i + j) % 2 ? color2 : color;
      gb.quad(rows[i][k], rows[i][j], rows[i + 1][j], rows[i + 1][k], col);
    }
  }
}

export function octa(gb, cx, cy, cz, rw, h, color, glow = null, glowColor = null) {
  const R = ringPts(cx, cy, cz, rw, 4, Math.PI / 4);
  const top = [cx, cy + h, cz], bot = [cx, cy - h, cz];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    (glow || gb).tri(R[j], R[i], top, glow ? glowColor : color);
    (glow || gb).tri(R[i], R[j], bot, glow ? glowColor : color);
  }
}

export const GREY = '#8d93ad', DARK = '#2f3247', WHITE = '#f4f1ea';

// ---- 0.9.2 : outils pour les objets horizontaux (véhicules) et les membres fins ------------------------------------------------
// Cylindre d'axe z (fuselage, chaudière) : de z0 (rayon r0) à z1 (rayon r1), centré en (cx, cy).
export function cylZ(gb, cx, cy, z0, z1, r0, r1, n, color, cap = true) {
  const pt = (z, r, i) => { const a = (i / n) * TAU; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]; };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    gb.quad(pt(z0, r0, i), pt(z0, r0, j), pt(z1, r1, j), pt(z1, r1, i), color);
    if (cap) { gb.tri([cx, cy, z1], pt(z1, r1, j), pt(z1, r1, i), color); gb.tri([cx, cy, z0], pt(z0, r0, i), pt(z0, r0, j), color); }
  }
}

// Cylindre d'axe x (roue vue de côté) : de x0 à x1, rayon r, centré en (cy, cz).
export function cylX(gb, x0, x1, cy, cz, r, n, color) {
  const pt = (x, i) => { const a = (i / n) * TAU; return [x, cy + Math.cos(a) * r, cz + Math.sin(a) * r]; };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    gb.quad(pt(x0, i), pt(x0, j), pt(x1, j), pt(x1, i), color);
    gb.tri([x1, cy, cz], pt(x1, j), pt(x1, i), color);
    gb.tri([x0, cy, cz], pt(x0, i), pt(x0, j), color);
  }
}

// Membre : prisme à quatre faces entre deux points (branche, antenne, patte, bois de renne).
export function limb(gb, a, b, r0, r1, color) {
  let d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  d = d.map((v) => v / l);
  const h = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let p = [d[1] * h[2] - d[2] * h[1], d[2] * h[0] - d[0] * h[2], d[0] * h[1] - d[1] * h[0]];
  const pl = Math.hypot(p[0], p[1], p[2]) || 1; p = p.map((v) => v / pl);
  const q = [d[1] * p[2] - d[2] * p[1], d[2] * p[0] - d[0] * p[2], d[0] * p[1] - d[1] * p[0]];
  const S = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  const pt = (o, r, [u, v]) => [o[0] + (p[0] * u + q[0] * v) * r, o[1] + (p[1] * u + q[1] * v) * r, o[2] + (p[2] * u + q[2] * v) * r];
  for (let i = 0; i < 4; i++) gb.quad(pt(a, r0, S[i]), pt(a, r0, S[(i + 1) % 4]), pt(b, r1, S[(i + 1) % 4]), pt(b, r1, S[i]), color);
  gb.quad(pt(b, r1, S[0]), pt(b, r1, S[1]), pt(b, r1, S[2]), pt(b, r1, S[3]), color);
}

export const star5 = (glow, cx, cy, z, R, r, color) => {
  for (let i = 0; i < 5; i++) {
    const a0 = Math.PI / 2 + (i / 5) * TAU, a1 = a0 + TAU / 10, a2 = a0 - TAU / 10;
    glow.tri([cx, cy, z], [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R, z], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z], color);
    glow.tri([cx, cy, z], [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R, z], [cx + Math.cos(a2) * r, cy + Math.sin(a2) * r, z], color);
  }
};
