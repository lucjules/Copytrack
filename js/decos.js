// Décorations à placement libre : panneaux, formes, murs et toits, nature, plaque image.
// Chaque décoration est construite en coordonnées locales (base à y = 0, 1 unité = 1 m)
// puis placée avec position, rotation (ry) et échelle (s). Purement visuelles.
import * as THREE from './vendor/three.module.min.js';
import { GeoBuilder } from './geo.js';
import { DECO_COLORS } from './decoData.js';
import { registerPack } from './decoPack.js';
import { isObstacle } from './obstacles.js';
import { createObstacleMesh } from './obstacleMesh.js';

const TAU = Math.PI * 2;

function ringPts(cx, y, cz, r, n, off = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * TAU;
    out.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]);
  }
  return out;
}

function cylinder(gb, cx, y0, y1, cz, r, n, color, r1 = r) {
  const A = ringPts(cx, y0, cz, r, n), B = ringPts(cx, y1, cz, r1, n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    gb.quad(A[j], A[i], B[i], B[j], color);
    gb.tri([cx, y1, cz], B[i], B[j], color);
    gb.tri(A[i], [cx, y0, cz], A[j], color);
  }
}

function cone(gb, cx, y0, cz, r, h, n, color, color2 = null) {
  const A = ringPts(cx, y0, cz, r, n);
  const apex = [cx, y0 + h, cz];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    gb.tri(A[j], A[i], apex, color2 && i % 2 ? color2 : color);
    gb.tri(A[i], [cx, y0, cz], A[j], color);
  }
}

function sphere(gb, cx, cy, cz, r, color, color2 = null, ry = r, lat = 4, lon = 8, top = false) {
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

function octa(gb, cx, cy, cz, rw, h, color, glow = null, glowColor = null) {
  const R = ringPts(cx, cy, cz, rw, 4, Math.PI / 4);
  const top = [cx, cy + h, cz], bot = [cx, cy - h, cz];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    (glow || gb).tri(R[j], R[i], top, glow ? glowColor : color);
    (glow || gb).tri(R[i], R[j], bot, glow ? glowColor : color);
  }
}

const GREY = '#8d93ad', DARK = '#2f3247', WHITE = '#f4f1ea';

// Panneau : poteau + plaque colorée + symbole lumineux.
function signBoard(gb, glow, color, symbol) {
  gb.box(-0.15, 0, -0.15, 0.15, 4.2, 0.15, GREY);
  gb.box(-1.4, 3.6, -0.12, 1.4, 6.4, 0.12, color);
  gb.box(-1.25, 3.75, 0.12, 1.25, 6.25, 0.16, DARK);
  const q = (x0, y0, x1, y1) => glow.quad([x0, y0, 0.2], [x1, y0, 0.2], [x1, y1, 0.2], [x0, y1, 0.2], WHITE);
  const t = (a, b, c) => glow.tri([a[0], a[1], 0.2], [b[0], b[1], 0.2], [c[0], c[1], 0.2], WHITE);
  if (symbol === 'left') { q(-0.3, 4.8, 0.9, 5.2); t([-0.3, 4.3], [-0.3, 5.7], [-1.0, 5.0]); }
  else if (symbol === 'right') { q(-0.9, 4.8, 0.3, 5.2); t([0.3, 4.3], [0.3, 5.7], [1.0, 5.0]); }
  else if (symbol === 'up') { q(-0.2, 4.0, 0.2, 5.1); t([-0.8, 5.0], [0.8, 5.0], [0, 6.0]); }
  else if (symbol === 'stop') { q(-0.9, 4.7, 0.9, 5.3); }
  else if (symbol === 'speed') { q(-0.8, 4.95, 0.8, 5.05); q(-0.6, 4.2, -0.4, 5.8); q(0.4, 4.2, 0.6, 5.8); }
  else if (symbol === 'warn') { q(-0.15, 4.5, 0.15, 5.4); q(-0.15, 4.1, 0.15, 4.35); }
}

const BUILDERS = {
  sign_left: (gb, glow, c) => signBoard(gb, glow, c || '#2fd3b5', 'left'),
  sign_right: (gb, glow, c) => signBoard(gb, glow, c || '#2fd3b5', 'right'),
  sign_up: (gb, glow, c) => signBoard(gb, glow, c || '#3ec1ff', 'up'),
  sign_stop: (gb, glow, c) => signBoard(gb, glow, c || '#ff3b4f', 'stop'),
  sign_speed: (gb, glow, c) => signBoard(gb, glow, c || '#f4f1ea', 'speed'),
  sign_warn: (gb, glow, c) => signBoard(gb, glow, c || '#ffbf3c', 'warn'),
  banner(gb, glow, c) {
    gb.box(-5.4, 0, -0.2, -4.8, 7, 0.2, GREY);
    gb.box(4.8, 0, -0.2, 5.4, 7, 0.2, GREY);
    gb.box(-5, 5, -0.1, 5, 7, 0.1, c || '#ff4f9a');
    for (let i = 0; i < 10; i++) {
      glow.quad([-4.5 + i, 5.4, 0.15], [-3.7 + i, 5.4, 0.15], [-3.7 + i, 6.6, 0.15], [-4.5 + i, 6.6, 0.15], i % 2 ? WHITE : '#36e9ff');
    }
  },
  cube: (gb, glow, c) => gb.box(-2, 0, -2, 2, 4, 2, c || '#8f7cff'),
  sphere: (gb, glow, c) => sphere(gb, 0, 2, 0, 2, c || '#ff7ad9', null, 2, 6, 12),
  cylinder: (gb, glow, c) => cylinder(gb, 0, 0, 4, 0, 2, 10, c || '#3ec1ff'),
  cone: (gb, glow, c) => cone(gb, 0, 0, 0, 2, 4, 10, c || '#ffbf3c'),
  pyramid: (gb, glow, c) => cone(gb, 0, 0, 0, 2.9, 4, 4, c || '#d8a476', null),
  arch(gb, glow, c) {
    const col = c || '#8f7cff';
    gb.box(-3.5, 0, -0.8, -2.2, 5, 0.8, col);
    gb.box(2.2, 0, -0.8, 3.5, 5, 0.8, col);
    gb.box(-3.5, 5, -0.8, 3.5, 6.4, 0.8, col);
    glow.quad([-2.2, 4.9, 0.85], [2.2, 4.9, 0.85], [2.2, 5.0, 0.85], [-2.2, 5.0, 0.85], '#7fe9ff');
  },
  wall: (gb, glow, c) => { gb.box(-6, 0, -0.5, 6, 6, 0.5, c || '#8d93ad'); gb.box(-6, 6, -0.7, 6, 6.5, 0.7, '#5a5e82'); },
  wallLow: (gb, glow, c) => { gb.box(-6, 0, -0.5, 6, 2, 0.5, c || '#8d93ad'); gb.box(-6, 2, -0.65, 6, 2.3, 0.65, '#5a5e82'); },
  roofFlat: (gb, glow, c) => {
    gb.box(-6, 0, -6, 6, 0.6, 6, c || '#5a5e82');
    for (const [x, z] of [[-5.4, -5.4], [5.4, -5.4], [-5.4, 5.4], [5.4, 5.4]]) gb.box(x - 0.25, -6, z - 0.25, x + 0.25, 0, z + 0.25, GREY);
  },
  roofGable(gb, glow, c) {
    const col = c || '#d8654a';
    const a = [-6, 0, -6], b = [6, 0, -6], d = [-6, 0, 6], e = [6, 0, 6];
    const r1 = [-6, 3.6, 0], r2 = [6, 3.6, 0];
    gb.quad(a, b, r2, r1, col);
    gb.quad(r1, r2, e, d, col);
    gb.tri(a, r1, d, '#6e7196');
    gb.tri(b, e, r2, '#6e7196');
    gb.quad(d, e, b, a, '#2b2d44');
  },
  dome: (gb, glow, c) => sphere(gb, 0, 0, 0, 6, c || '#7fe9ff', c ? null : '#b9f3ff', 6, 6, 14, true),
  pine(gb, glow, c) {
    cylinder(gb, 0, 0, 1.4, 0, 0.35, 6, '#4a3530');
    const col = c || '#2a6b57';
    cone(gb, 0, 1, 0, 2.6, 3.2, 8, col);
    cone(gb, 0, 2.8, 0, 2.0, 3.0, 8, col);
    cone(gb, 0, 4.4, 0, 1.3, 2.6, 8, c || '#33806a');
  },
  palm(gb, glow, c) {
    let x = 0, z = 0;
    for (let i = 0; i < 5; i++) {
      const nx = x + 0.28, nz = z + 0.1;
      cylinder(gb, x, i * 1.5, i * 1.5 + 1.5, z, 0.42 - i * 0.04, 6, i % 2 ? '#8a6a4a' : '#7a5a3c', 0.38 - i * 0.04);
      x = nx; z = nz;
    }
    const top = [x, 7.5, z];
    const col = c || '#3fae5a';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      const dx = Math.cos(a), dz = Math.sin(a);
      const tip = [x + dx * 4.4, 6.2, z + dz * 4.4];
      const mid = [x + dx * 2.2, 8.2, z + dz * 2.2];
      const sx = -dz * 0.8, sz = dx * 0.8;
      gb.quad([top[0] + sx * 0.2, top[1], top[2] + sz * 0.2], [mid[0] + sx, mid[1], mid[2] + sz], tip, [mid[0] - sx, mid[1], mid[2] - sz], col);
    }
    sphere(gb, x, 7.3, z, 0.5, '#5a3d28', null, 0.5, 2, 6);
  },
  tree(gb, glow, c) {
    cylinder(gb, 0, 0, 3, 0, 0.5, 6, '#6b4a32', 0.35);
    const col = c || '#4caf50';
    sphere(gb, 0, 5, 0, 2.8, col, c ? null : '#5cc860', 2.5, 4, 8);
    sphere(gb, 1.6, 4.2, 0.6, 1.6, col, null, 1.4, 3, 7);
  },
  bush: (gb, glow, c) => sphere(gb, 0, 0.8, 0, 1.6, c || '#3f9a4a', c ? null : '#4caf5a', 1.0, 3, 8),
  rock(gb, glow, c) {
    octa(gb, 0, 1.4, 0, 2.2, 1.6, c || '#8d93ad');
    octa(gb, 1.4, 0.8, 0.6, 1.2, 0.9, c || '#7a8099');
  },
  cactus(gb, glow, c) {
    const col = c || '#3f9a5a';
    cylinder(gb, 0, 0, 5, 0, 0.6, 7, col, 0.5);
    cylinder(gb, 0.6, 2.4, 2.9, 0, 0.35, 6, col);
    cylinder(gb, 1.4, 2.4, 4.2, 0, 0.32, 6, col, 0.28);
    cylinder(gb, -0.6, 3, 3.5, 0, 0.33, 6, col);
    cylinder(gb, -1.3, 3, 4.6, 0, 0.3, 6, col, 0.26);
  },
  crystal(gb, glow, c) {
    const col = c || '#7fe9ff';
    octa(gb, 0, 2.2, 0, 0.9, 2.2, col, glow, col);
    octa(gb, 1.1, 1.2, 0.3, 0.6, 1.2, c || '#b48cff', glow, c || '#b48cff');
    octa(gb, -0.9, 1.0, -0.4, 0.5, 1.0, c || '#ff7ad9', glow, c || '#ff7ad9');
  },
  mushroom(gb, glow, c) {
    cylinder(gb, 0, 0, 2.2, 0, 0.5, 7, '#f1e6d2', 0.42);
    sphere(gb, 0, 2.1, 0, 2.2, c || '#e8453c', c ? null : '#ff6a5e', 1.5, 4, 9, true);
    for (const [x, z] of [[0.8, 0.5], [-0.7, 0.9], [0.1, -1.2]]) glow.tri([x, 3.45, z], [x + 0.35, 3.3, z], [x, 3.3, z + 0.35], WHITE);
  },
  flower(gb, glow, c) {
    cylinder(gb, 0, 0, 2, 0, 0.1, 5, '#3f9a4a');
    const col = c || '#ff7ad9';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      glow.tri([0, 2.05, 0], [Math.cos(a - 0.4) * 0.9, 2.1, Math.sin(a - 0.4) * 0.9], [Math.cos(a + 0.4) * 0.9, 2.1, Math.sin(a + 0.4) * 0.9], col);
    }
    glow.tri([0, 2.12, 0], [0.2, 2.15, 0], [0, 2.15, 0.2], '#ffd23e');
  },
  shard(gb, glow) {
    octa(gb, 0, 2.6, 0, 0.8, 1.6, '#ffd23e', glow, '#ffd23e');
    octa(gb, 0, 2.6, 0, 1.3, 0.5, '#fff2a8', glow, '#fff2a8');
  },
};

// ---- 0.9 : nouvelles décorations par thème ------------------------------------------
function ring(glow, y, r, n, w, col) {
  const A = ringPts(0, y, 0, r, n), B = ringPts(0, y + w, 0, r, n);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; glow.quad(A[i], A[j], B[j], B[i], col); }
}
function blades(gb, cx, cy, cz, r, n, col, a0 = 0) {
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU, b = a + 0.35;
    gb.tri([cx, cy, cz], [cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz], [cx + Math.cos(b) * r, cy + Math.sin(b) * r, cz], col);
    gb.tri([cx, cy, cz + 0.05], [cx + Math.cos(b) * r, cy + Math.sin(b) * r, cz + 0.05], [cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz + 0.05], col);
  }
}
Object.assign(BUILDERS, {
  // Souterrain
  stalagmite(gb, glow, c) {
    const col = c || '#6a5a7a';
    cone(gb, 0, 0, 0, 1.6, 7, 7, col, '#5a4a6a');
    cone(gb, 1.4, 0, 0.6, 0.8, 3.5, 6, col);
    cone(gb, -1.1, 0, -0.7, 0.7, 2.6, 6, '#7a6a8a');
  },
  cavePillar(gb, glow, c) {
    const col = c || '#5a4a6a';
    cylinder(gb, 0, 0, 5, 0, 2.4, 8, col, 1.2);
    cylinder(gb, 0, 5, 9, 0, 1.2, 8, '#6a5a7a', 1.0);
    cylinder(gb, 0, 9, 14, 0, 1.0, 8, col, 2.6);
    ring(glow, 6.5, 1.15, 8, 0.25, c ? WHITE : '#7fe9ff');
  },
  crystalCluster(gb, glow, c) {
    const cols = c ? [c, c, c] : ['#5ff2ff', '#b48cff', '#ff7ad9'];
    octa(gb, 0, 3, 0, 1.2, 3, cols[0], glow, cols[0]);
    octa(gb, 1.6, 1.8, 0.4, 0.8, 1.8, cols[1], glow, cols[1]);
    octa(gb, -1.4, 1.6, -0.6, 0.7, 1.6, cols[2], glow, cols[2]);
    octa(gb, 0.4, 1.2, -1.5, 0.6, 1.2, cols[1], glow, cols[1]);
    rockBase(gb);
  },
  glowMushroom(gb, glow, c) {
    const col = c || '#2dffb0';
    cylinder(gb, 0, 0, 3.2, 0, 0.4, 7, '#d9e6f2', 0.32);
    sphere(glow, 0, 3.1, 0, 2.4, col, null, 1.4, 4, 10, true);
    cylinder(gb, 1.6, 0, 1.6, 0.8, 0.25, 6, '#d9e6f2');
    sphere(glow, 1.6, 1.55, 0.8, 1.1, col, null, 0.7, 3, 8, true);
  },
  minecart(gb, glow, c) {
    gb.box(-6, 0, -1.2, 6, 0.15, -0.9, GREY); gb.box(-6, 0, 0.9, 6, 0.15, 1.2, GREY);
    for (let i = -5; i <= 5; i += 1.25) gb.box(i - 0.2, 0, -1.6, i + 0.2, 0.08, 1.6, '#6b4a32');
    gb.taper(0, 0, 0.5, 2.4, 3.2, 2.4, 3.8, 2.8, c || '#8a5a3a');
    for (const [x, z] of [[-1, -1.1], [1, -1.1], [-1, 1.1], [1, 1.1]]) cylinder(gb, x, 0.15, 0.75, z, 0.32, 6, DARK);
    octa(gb, 0, 2.6, 0, 0.9, 0.5, '#ffd23e', glow, '#ffd23e');
  },
  lantern(gb, glow, c) {
    gb.box(-0.12, 0, -0.12, 0.12, 4, 0.12, DARK);
    gb.box(-0.12, 3.8, -0.12, 1.4, 4, 0.12, DARK);
    glow.box(1.0, 2.9, -0.35, 1.7, 3.7, 0.35, c || '#ffb84d');
  },
  // Nuages
  cloud(gb, glow, c) {
    const col = c || '#ffffff', sh = '#e4ecf7';
    sphere(gb, 0, 3, 0, 3.2, col, sh, 2.4, 4, 9);
    sphere(gb, 3, 2.4, 0.6, 2.4, col, sh, 1.8, 4, 8);
    sphere(gb, -3, 2.3, -0.4, 2.2, col, sh, 1.7, 4, 8);
    sphere(gb, 0.8, 4.4, -0.8, 1.8, col, null, 1.5, 3, 8);
  },
  balloon(gb, glow, c) {
    const col = c || '#ff6b57';
    sphere(gb, 0, 9, 0, 3.4, col, '#ffd23e', 4, 6, 10);
    cone(gb, 0, 3.6, 0, 1.6, 2.4, 8, col);
    for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) gb.box(x - 0.04, 1.6, z - 0.04, x + 0.04, 4.6, z + 0.04, DARK);
    gb.box(-0.8, 0.6, -0.8, 0.8, 1.6, 0.8, '#8a6a4a');
    glow.box(-0.3, 4.6, -0.3, 0.3, 5.2, 0.3, '#ffb84d');
  },
  floatIsle(gb, glow, c) {
    const y = 6;
    cone(gb, 0, y, 0, 4, -6, 7, '#8a6a5a', '#7a5a4a');
    cylinder(gb, 0, y, y + 0.8, 0, 4, 7, c || '#5cc860');
    BUILDERS.tree(gbOffset(gb, 0.8, y + 0.8, 0.4), glow, null);
    glow.box(-0.15, y - 6, -0.15, 0.15, y, 0.15, '#7fe9ff');
  },
  windmill(gb, glow, c) {
    gb.taper(0, 0, 0, 9, 3, 3, 1.6, 1.6, c || '#f4f1ea');
    cone(gb, 0, 9, 0, 1.5, 1.8, 6, '#d8654a');
    blades(gb, 0, 8, 1.2, 5, 4, '#8d93ad', 0.3);
  },
  airship(gb, glow, c) {
    const col = c || '#b48cff';
    const gy = 9;
    sphere(gb, 0, gy, 0, 2.6, col, null, 2.6, 4, 10);
    gb.taper(0, 0, gy - 2.6, gy + 2.6, 0.1, 9, 0.1, 9, col);
    gb.box(-1, gy - 3.8, -2, 1, gy - 2.8, 2, '#5a5e82');
    blades(gb, 0, gy, -5.2, 1.2, 3, GREY);
    glow.box(-1.05, gy - 3.5, -1.5, 1.05, gy - 3.1, 1.5, '#ffd23e');
  },
  skyTower(gb, glow, c) {
    gb.taper(0, 0, 0, 16, 3, 3, 1.8, 1.8, c || '#e6ecf7');
    sphere(gb, 0, 17, 0, 2.6, '#9fd8ff', '#c9ecff', 2.0, 4, 10);
    ring(glow, 12, 1.95, 8, 0.4, '#5ff2ff');
    gb.box(-0.1, 19, -0.1, 0.1, 22, 0.1, GREY);
    glow.box(-0.3, 22, -0.3, 0.3, 22.6, 0.3, '#ff3d6a');
  },
  // Fonds marins
  coral(gb, glow, c) {
    const col = c || '#ff7a8a';
    const br = (x, z, h, r) => { cylinder(gb, x, 0, h, z, r, 6, col, r * 0.6); sphere(gb, x, h, z, r * 0.9, col, null, r * 0.9, 2, 6); };
    br(0, 0, 4, 0.6); br(1.2, 0.4, 2.8, 0.45); br(-1, -0.5, 3.3, 0.5); br(0.3, -1.2, 2.2, 0.4);
    for (const [x, z, h] of [[0, 0, 4.6], [1.2, 0.4, 3.3]]) glow.tri([x - 0.2, h, z], [x + 0.2, h, z], [x, h + 0.4, z], '#ffd0f2');
  },
  seaweed(gb, glow, c) {
    const col = c || '#2fa36b';
    for (const [x, z, h] of [[0, 0, 9], [0.8, 0.5, 7], [-0.7, 0.3, 6], [0.2, -0.8, 8]]) {
      let px = x;
      for (let i = 0; i < 6; i++) {
        const y0 = (h / 6) * i, y1 = (h / 6) * (i + 1), nx = x + Math.sin(i * 1.3) * 0.5;
        gb.quad([px - 0.35, y0, z], [px + 0.35, y0, z], [nx + 0.3, y1, z], [nx - 0.3, y1, z], i % 2 ? col : '#3fbf7a');
        px = nx;
      }
    }
  },
  fishSchool(gb, glow, c) {
    const col = c || '#ffbf3c';
    for (let i = 0; i < 9; i++) {
      const x = Math.cos(i * 2.4) * (1 + i * 0.35), y = 3 + Math.sin(i * 1.7) * 1.5, z = Math.sin(i * 2.4) * (1 + i * 0.35);
      glow.tri([x - 0.6, y, z], [x + 0.5, y + 0.3, z], [x + 0.5, y - 0.3, z], col);
      glow.tri([x + 0.5, y, z], [x + 0.9, y + 0.3, z], [x + 0.9, y - 0.3, z], i % 3 ? WHITE : col);
    }
  },
  shell(gb, glow, c) {
    const col = c || '#ffd0c2';
    for (let i = 0; i < 7; i++) {
      const a0 = Math.PI * (0.1 + i / 8), a1 = Math.PI * (0.1 + (i + 1) / 8);
      gb.tri([0, 0.1, -1], [Math.cos(a0) * 2, 0.2 + Math.sin(a0) * 1.4, Math.sin(a0) * 0.6], [Math.cos(a1) * 2, 0.2 + Math.sin(a1) * 1.4, Math.sin(a1) * 0.6], i % 2 ? col : '#ffe6dc');
    }
    sphere(glow, 0, 0.5, 0.2, 0.35, WHITE, null, 0.35, 2, 6);
  },
  anchor(gb, glow, c) {
    const col = c || '#5a5e82';
    gb.box(-0.3, 0, -0.3, 0.3, 6, 0.3, col);
    gb.box(-1.6, 4.6, -0.25, 1.6, 5.1, 0.25, col);
    gb.taper(-1.3, 0, 0, 1.6, 0.5, 0.5, 0.3, 0.3, col); gb.taper(1.3, 0, 0, 1.6, 0.5, 0.5, 0.3, 0.3, col);
    gb.box(-1.5, 0, -0.25, 1.5, 0.5, 0.25, col);
    cylinder(gb, 0, 6, 6.5, 0, 0.6, 8, col);
  },
  jellyfish(gb, glow, c) {
    const col = c || '#ff7ad9';
    sphere(glow, 0, 6, 0, 1.8, col, '#ffd0f2', 1.2, 4, 10, true);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU, x = Math.cos(a) * 1.1, z = Math.sin(a) * 1.1; glow.quad([x - 0.05, 2.5, z], [x + 0.05, 2.5, z], [x + 0.05, 6, z], [x - 0.05, 6, z], col); }
  },
  treasure(gb, glow, c) {
    gb.box(-1.6, 0, -1, 1.6, 1.6, 1, c || '#8a5a3a');
    gb.taper(0, 0, 1.6, 2.4, 3.2, 2, 3.2, 1.2, '#7a4a2a');
    gb.box(-1.7, 0.6, -1.05, 1.7, 0.8, 1.05, '#ffd23e');
    octa(gb, 0, 1.7, 0, 0.9, 0.35, '#ffd23e', glow, '#ffe58a');
  },
  // Usine
  gear(gb, glow, c) {
    const col = c || '#8d93ad', r = 3.2, n = 12, y = 4;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, rr = i % 2 ? r : r + 0.8;
      const P = (a, R, z) => [Math.cos(a) * R, y + Math.sin(a) * R, z];
      gb.quad(P(a0, 1, 0.5), P(a1, 1, 0.5), P(a1, rr, 0.5), P(a0, rr, 0.5), col);
      gb.quad(P(a1, 1, -0.5), P(a0, 1, -0.5), P(a0, rr, -0.5), P(a1, rr, -0.5), col);
      gb.quad(P(a0, rr, -0.5), P(a0, rr, 0.5), P(a1, rr, 0.5), P(a1, rr, -0.5), '#6e7196');
    }
    gb.box(-0.4, 0, -0.4, 0.4, y, 0.4, DARK);
    glow.box(-0.5, y - 0.5, 0.5, 0.5, y + 0.5, 0.6, '#ffbf3c');
  },
  pipe(gb, glow, c) {
    const col = c || '#6e8a9a';
    for (const x of [-5, 5]) gb.box(x - 0.3, 0, -0.3, x + 0.3, 4, 0.3, DARK);
    const A = ringPts(0, 0, 0, 0.9, 8);
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8, p = (k, x) => [x, 4.9 + A[k][0], A[k][2]];
      gb.quad(p(i, -6), p(j, -6), p(j, 6), p(i, 6), i % 2 ? col : '#5a7686');
    }
    glow.box(-0.5, 5.75, -0.95, 0.5, 5.85, 0.95, '#ffbf3c');
  },
  chimney(gb, glow, c) {
    cylinder(gb, 0, 0, 22, 0, 2.2, 10, c || '#8a4a3a', 1.6);
    for (let k = 0; k < 3; k++) ring(gb, 6 + k * 6, 1.95 - k * 0.15, 10, 0.6, k % 2 ? WHITE : '#d8654a');
    glow.box(-1.2, 22, -1.2, 1.2, 22.4, 1.2, '#ff7a3a');
  },
  crate(gb, glow, c) {
    const col = c || '#a87a4a';
    gb.box(-1.2, 0, -1.2, 1.2, 2.4, 1.2, col);
    gb.box(-1.25, 0.2, -1.25, 1.25, 0.45, 1.25, '#7a5432'); gb.box(-1.25, 1.95, -1.25, 1.25, 2.2, 1.25, '#7a5432');
    gb.box(1.4, 0, -0.9, 3.0, 1.6, 0.7, col);
  },
  barrel(gb, glow, c) {
    const col = c || '#2f8f5a';
    cylinder(gb, 0, 0, 2.6, 0, 1, 10, col);
    ring(gb, 0.5, 1.02, 10, 0.2, DARK); ring(gb, 2.0, 1.02, 10, 0.2, DARK);
    cylinder(gb, 2.2, 0, 2.6, 0.4, 1, 10, '#ffbf3c');
    glow.tri([2.2, 2.62, -0.3], [1.8, 2.62, 0.6], [2.6, 2.62, 0.6], DARK);
  },
  crane(gb, glow, c) {
    const col = c || '#ffbf3c';
    gb.taper(0, 0, 0, 18, 1.6, 1.6, 1.2, 1.2, col);
    gb.box(-4, 17.4, -0.6, 12, 18.4, 0.6, col);
    gb.box(-4, 15.4, -1, -2, 17.4, 1, '#5a5e82');
    gb.box(10.9, 8, -0.06, 11.1, 17.4, 0.06, DARK);
    gb.box(10.3, 7, -0.6, 11.7, 8, 0.6, '#5a5e82');
    glow.box(-0.4, 18.4, -0.4, 0.4, 19, 0.4, '#ff3d6a');
  },
  warnLight(gb, glow, c) {
    gb.box(-0.15, 0, -0.15, 0.15, 3, 0.15, DARK);
    sphere(glow, 0, 3.4, 0, 0.5, c || '#ff8a1f', '#ffd23e', 0.5, 3, 8);
    for (let i = 0; i < 4; i++) glow.quad([-0.6, 0.4 + i * 0.6, 0.17], [0.6, 0.8 + i * 0.6, 0.17], [0.6, 1.05 + i * 0.6, 0.17], [-0.6, 0.65 + i * 0.6, 0.17], i % 2 ? '#1a1a1a' : '#ffd23e');
  },
  // Espace
  satellite(gb, glow, c) {
    const y = 7;
    gb.box(-1, y - 1, -1, 1, y + 1, 1, c || '#d8dcef');
    for (const s of [-1, 1]) {
      gb.box(s * 1, y - 0.1, -0.1, s * 1.8, y + 0.1, 0.1, GREY);
      gb.box(s * 1.8, y - 1.2, -0.05, s * 5.8, y + 1.2, 0.05, '#1f3a8a');
      for (let i = 0; i < 4; i++) glow.box(s * (2 + i), y - 1.2, 0.06, s * (2 + i) + s * 0.08, y + 1.2, 0.08, '#4f7cff');
    }
    cone(gb, 0, y + 1, 0, 1.4, 0.9, 10, WHITE);
    glow.box(-0.15, y + 1.9, -0.15, 0.15, y + 2.4, 0.15, '#ff3d6a');
  },
  asteroid(gb, glow, c) {
    const col = c || '#7a7068';
    octa(gb, 0, 5, 0, 3, 2.4, col);
    octa(gb, 2.2, 6, 1, 1.4, 1.2, '#6a625a');
    octa(gb, -2, 4, -1, 1.2, 1, '#8a8078');
  },
  antenna(gb, glow, c) {
    gb.taper(0, 0, 0, 10, 1.4, 1.4, 0.3, 0.3, GREY);
    const dish = c || '#e6ecf7';
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * TAU, a1 = ((i + 1) / 10) * TAU;
      gb.tri([0, 9, 0.6], [Math.cos(a0) * 3, 9 + Math.sin(a0) * 3, -0.6], [Math.cos(a1) * 3, 9 + Math.sin(a1) * 3, -0.6], dish);
    }
    glow.box(-0.2, 8.8, 1.4, 0.2, 9.2, 1.8, '#5ff2ff');
  },
  rocket(gb, glow, c) {
    const col = c || '#f4f1ea';
    cylinder(gb, 0, 1.5, 12, 0, 1.4, 10, col);
    cone(gb, 0, 12, 0, 1.4, 3.6, 10, '#ff3b4f');
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU, x = Math.cos(a), z = Math.sin(a); gb.quad([x * 1.4, 1.5, z * 1.4], [x * 3, 0, z * 3], [x * 3, 3, z * 3], [x * 1.4, 5, z * 1.4], '#ff3b4f'); }
    ring(glow, 8, 1.42, 10, 0.4, '#5ff2ff');
    cone(glow, 0, 1.5, 0, 1, -1.5, 8, '#ffb84d');
  },
  planetMini(gb, glow, c) {
    sphere(gb, 0, 6, 0, 3, c || '#ff9a62', '#ffb784', 3, 6, 12);
    ring(glow, 6, 4.8, 18, 0.15, '#ffe0b0');
    gb.box(-0.2, 0, -0.2, 0.2, 3, 0.2, GREY);
  },
  // Circuit
  trafficCone(gb, glow, c) {
    gb.box(-0.8, 0, -0.8, 0.8, 0.15, 0.8, '#1a1a1a');
    cone(gb, 0, 0.15, 0, 0.6, 1.6, 10, c || '#ff6b1a');
    ring(glow, 0.8, 0.38, 10, 0.25, WHITE);
  },
  tireStack(gb, glow, c) {
    for (let i = 0; i < 3; i++) { cylinder(gb, 0, i * 0.7, i * 0.7 + 0.65, 0, 1.1, 10, '#202020'); ring(gb, i * 0.7 + 0.25, 1.11, 10, 0.15, c || (i % 2 ? WHITE : '#ff3b4f')); }
    for (let i = 0; i < 2; i++) cylinder(gb, 2.2, i * 0.7, i * 0.7 + 0.65, 0.3, 1.1, 10, '#202020');
  },
  flagPole(gb, glow, c) {
    gb.box(-0.12, 0, -0.12, 0.12, 9, 0.12, GREY);
    const col = c || '#ff4f9a';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) gb.quad([0.12 + i * 0.8, 6.4 + j * 0.8, 0], [0.92 + i * 0.8, 6.4 + j * 0.8, 0], [0.92 + i * 0.8, 7.2 + j * 0.8, 0], [0.12 + i * 0.8, 7.2 + j * 0.8, 0], (i + j) % 2 ? WHITE : col);
  },
  grandstand(gb, glow, c) {
    const col = c || '#5a5e82';
    for (let k = 0; k < 5; k++) gb.box(-8, 0, -k * 1.4, 8, 0.8 + k * 1.0, -k * 1.4 - 1.4, k % 2 ? col : '#6e7196');
    gb.box(-8.4, 0, -7.4, 8.4, 7.5, -7, col);
    gb.box(-8.6, 7.5, -7.6, 8.6, 7.8, 0.6, '#ff4f9a');
    for (let i = 0; i < 12; i++) glow.box(-7.5 + i * 1.3, 1 + (i % 5) * 1.0, -(i % 5) * 1.4 - 0.7, -7.1 + i * 1.3, 1.5 + (i % 5) * 1.0, -(i % 5) * 1.4 - 0.3, ['#5ff2ff', '#ffd23e', '#ff7ad9', WHITE][i % 4]);
  },
});

// ---- 0.9.2 : outils pour les objets horizontaux (véhicules) et les membres fins ------------------------------------------------
// Cylindre d'axe z (fuselage, chaudière) : de z0 (rayon r0) à z1 (rayon r1), centré en (cx, cy).
function cylZ(gb, cx, cy, z0, z1, r0, r1, n, color, cap = true) {
  const pt = (z, r, i) => { const a = (i / n) * TAU; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]; };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    gb.quad(pt(z0, r0, i), pt(z0, r0, j), pt(z1, r1, j), pt(z1, r1, i), color);
    if (cap) { gb.tri([cx, cy, z1], pt(z1, r1, j), pt(z1, r1, i), color); gb.tri([cx, cy, z0], pt(z0, r0, i), pt(z0, r0, j), color); }
  }
}
// Cylindre d'axe x (roue vue de côté) : de x0 à x1, rayon r, centré en (cy, cz).
function cylX(gb, x0, x1, cy, cz, r, n, color) {
  const pt = (x, i) => { const a = (i / n) * TAU; return [x, cy + Math.cos(a) * r, cz + Math.sin(a) * r]; };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    gb.quad(pt(x0, i), pt(x0, j), pt(x1, j), pt(x1, i), color);
    gb.tri([x1, cy, cz], pt(x1, j), pt(x1, i), color);
    gb.tri([x0, cy, cz], pt(x0, i), pt(x0, j), color);
  }
}
const wheelsX = (gb, xs, zs, r, w = 0.5) => { for (const x of xs) for (const z of zs) cylX(gb, x - w / 2, x + w / 2, r, z, r, 10, '#1d1e2a'); };
// Membre : prisme à quatre faces entre deux points (branche, antenne, patte, bois de renne).
function limb(gb, a, b, r0, r1, color) {
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
const star5 = (glow, cx, cy, z, R, r, color) => {
  for (let i = 0; i < 5; i++) {
    const a0 = Math.PI / 2 + (i / 5) * TAU, a1 = a0 + TAU / 10, a2 = a0 - TAU / 10;
    glow.tri([cx, cy, z], [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R, z], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z], color);
    glow.tri([cx, cy, z], [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R, z], [cx + Math.cos(a2) * r, cy + Math.sin(a2) * r, z], color);
  }
};

Object.assign(BUILDERS, {
  // ---- Lumières : la partie fixe (la lumière et le faisceau sont ajoutés par TrackView, voir LIGHT_DECOS) ----
  searchlight(gb, glow, c) {
    cylinder(gb, 0, 0, 1.3, 0, 1.5, 10, '#4a4f6a', 1.1);
    gb.box(-0.9, 1.3, -0.9, 0.9, 2.3, 0.9, GREY);
    glow.quad([-0.5, 1.6, 0.95], [0.5, 1.6, 0.95], [0.5, 1.9, 0.95], [-0.5, 1.9, 0.95], c || '#cfeaff');
  },
  spotlight(gb, glow, c) {
    gb.box(-1.2, 0, -1.2, 1.2, 0.5, 1.2, '#4a4f6a');
    limb(gb, [0, 0.5, 0], [0, 2.5, 0], 0.22, 0.22, GREY);
    gb.box(-0.8, 2.4, -0.8, 0.8, 3.2, 0.8, '#2f3247');
    glow.quad([-0.6, 2.55, -0.82], [0.6, 2.55, -0.82], [0.6, 3.05, -0.82], [-0.6, 3.05, -0.82], c || '#fff2c4');
  },
  lanternPost(gb, glow, c) {
    gb.box(-0.9, 0, -0.9, 0.9, 0.5, 0.9, '#3a3d56');
    limb(gb, [0, 0.5, 0], [0, 1.7, 0], 0.16, 0.12, '#2f3247');
    gb.box(-0.45, 1.7, -0.45, 0.45, 3.0, 0.45, '#2f3247');
    glow.box(-0.33, 1.85, -0.33, 0.33, 2.85, 0.33, c || '#ffc46b');
    gb.taper(0, 0, 3.0, 3.5, 0.65, 0.65, 0.12, 0.12, '#2f3247');
  },
  lanternHang(gb, glow, c) {
    gb.box(-0.15, 6.2, -0.15, 0.15, 6.6, 0.15, GREY);
    limb(gb, [0, 6.2, 0], [0, 4.6, 0], 0.05, 0.05, '#2f3247');
    gb.taper(0, 0, 4.6, 5.0, 0.2, 0.2, 0.55, 0.55, '#2f3247');
    glow.box(-0.4, 3.7, -0.4, 0.4, 4.6, 0.4, c || '#ffb35c');
    gb.taper(0, 0, 3.4, 3.7, 0.12, 0.12, 0.5, 0.5, '#2f3247');
  },
  streetLamp(gb, glow, c) {
    cylinder(gb, 0, 0, 0.8, 0, 0.7, 8, '#3a3d56', 0.45);
    limb(gb, [0, 0.8, 0], [0, 8.2, 0], 0.22, 0.14, '#4a4f6a');
    limb(gb, [0, 8.2, 0], [1.7, 8.6, 0], 0.12, 0.1, '#4a4f6a');
    gb.box(1.2, 8.3, -0.55, 2.4, 8.6, 0.55, '#2f3247');
    glow.quad([1.3, 8.28, -0.45], [2.3, 8.28, -0.45], [2.3, 8.28, 0.45], [1.3, 8.28, 0.45], c || '#ffe9b0');
  },
  // ---- Véhicules (nez vers -z) ----
  plane(gb, glow, c) {
    const body = c || '#f4f1ea', acc = '#3ec1ff';
    cylZ(gb, 0, 4, -11, 9, 1.5, 1.5, 12, body);
    cylZ(gb, 0, 4, -14, -11, 0.4, 1.5, 12, body);
    cylZ(gb, 0, 4.2, 9, 13, 1.5, 0.35, 12, body);
    gb.box(-10, 3.4, -2, -1.2, 3.8, 3, '#dfe3ee'); gb.box(1.2, 3.4, -2, 10, 3.8, 3, '#dfe3ee');
    gb.box(-0.15, 5, 9, 0.15, 9, 12.5, acc);
    gb.box(-4.2, 4.4, 10.2, -0.6, 4.7, 12.8, '#dfe3ee'); gb.box(0.6, 4.4, 10.2, 4.2, 4.7, 12.8, '#dfe3ee');
    for (const x of [-4.6, 4.6]) cylZ(gb, x, 2.9, -3.4, 0, 0.75, 0.75, 8, '#8d93ad');
    for (const x of [-1.2, 1.2]) { limb(gb, [x, 3, -6], [x, 0.9, -6], 0.09, 0.09, GREY); } wheelsX(gb, [-1.2, 1.2], [-6], 0.9, 0.5);
    for (const x of [-2.2, 2.2]) { limb(gb, [x, 3, 1.5], [x, 0.9, 1.5], 0.09, 0.09, GREY); } wheelsX(gb, [-2.2, 2.2], [1.5], 0.9, 0.5);
    gb.box(-1.52, 4.15, -10.5, -1.48, 4.35, 8, acc); gb.box(1.48, 4.15, -10.5, 1.52, 4.35, 8, acc);
    for (let i = 0; i < 10; i++) for (const s of [-1, 1]) glow.quad([s * 1.53, 4.55, -8.6 + i * 1.5], [s * 1.53, 4.55, -7.9 + i * 1.5], [s * 1.53, 5.0, -7.9 + i * 1.5], [s * 1.53, 5.0, -8.6 + i * 1.5], '#7fe9ff');
    glow.quad([-0.9, 4.75, -12.1], [0.9, 4.75, -12.1], [0.7, 5.2, -11.7], [-0.7, 5.2, -11.7], '#7fe9ff');
  },
  biplane(gb, glow, c) {
    const body = c || '#d8654a';
    cylZ(gb, 0, 2.2, -4, 4.5, 0.85, 0.85, 8, body);
    cylZ(gb, 0, 2.2, 4.5, 7, 0.85, 0.2, 8, body);
    gb.box(-6, 1.7, -2.4, 6, 1.9, 0.6, '#f4f1ea'); gb.box(-6, 3.9, -2.4, 6, 4.1, 0.6, '#f4f1ea');
    for (const x of [-4, 4]) limb(gb, [x, 1.9, -1], [x, 3.9, -1], 0.07, 0.07, GREY);
    limb(gb, [0, 2.8, -1.4], [0, 3.9, -1.4], 0.1, 0.1, GREY);
    gb.box(-0.1, 2.5, 5.5, 0.1, 4.2, 7, '#f4f1ea'); gb.box(-2.4, 2.35, 5.6, 2.4, 2.5, 7, '#f4f1ea');
    gb.box(-0.15, 1.2, -5.3, 0.15, 3.2, -4.3, '#2f3247');
    gb.box(-0.12, 2.2, -4.5, 0.12, 2.3, -4.1, '#2f3247');
    for (const x of [-0.9, 0.9]) { limb(gb, [x, 1.5, -2.2], [x, 0.7, -2.4], 0.07, 0.07, GREY); }
    wheelsX(gb, [-0.9, 0.9], [-2.4], 0.7, 0.35);
    glow.quad([-0.5, 3.0, -2.5], [0.5, 3.0, -2.5], [0.5, 3.15, -1.4], [-0.5, 3.15, -1.4], '#7fe9ff');
  },
  helicopter(gb, glow, c) {
    const body = c || '#ff6b57';
    sphere(gb, 0, 2.6, -0.4, 2.0, body, null, 1.6, 5, 10);
    cylZ(gb, 0, 2.9, 1, 8.5, 0.7, 0.28, 8, body);
    gb.box(-0.1, 2.9, 7.6, 0.1, 5, 8.7, body);
    gb.box(-1.2, 3.1, 8.4, 1.2, 3.25, 8.7, '#dfe3ee');
    limb(gb, [0, 4.1, -0.4], [0, 4.9, -0.4], 0.2, 0.15, GREY);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.4; limb(gb, [0, 4.9, -0.4], [Math.cos(a) * 6.4, 4.95, -0.4 + Math.sin(a) * 6.4], 0.14, 0.07, '#2f3247'); }
    for (const x of [-1.5, 1.5]) { gb.box(x - 0.1, 0.5, -3, x + 0.1, 0.7, 2, GREY); limb(gb, [x, 0.7, -1.8], [x * 0.85, 1.9, -1.2], 0.08, 0.08, GREY); limb(gb, [x, 0.7, 0.8], [x * 0.85, 1.9, 0.3], 0.08, 0.08, GREY); }
    glow.quad([-1.1, 2.9, -2.35], [1.1, 2.9, -2.35], [0.9, 3.6, -2.2], [-0.9, 3.6, -2.2], '#7fe9ff');
  },
  bus(gb, glow, c) {
    const body = c || '#ffbf3c';
    gb.box(-1.6, 0.7, -6.5, 1.6, 3.7, 6.5, body);
    gb.box(-1.62, 1.5, -6.5, 1.62, 1.9, 6.5, '#2f3247');
    gb.box(-1.62, 0.7, -6.5, 1.62, 1.0, 6.5, '#2f3247');
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) glow.quad([s * 1.64, 2.1, -5.6 + i * 2], [s * 1.64, 2.1, -4.4 + i * 2], [s * 1.64, 3.2, -4.4 + i * 2], [s * 1.64, 3.2, -5.6 + i * 2], '#bfefff');
    glow.quad([-1.3, 2.0, -6.55], [1.3, 2.0, -6.55], [1.3, 3.3, -6.55], [-1.3, 3.3, -6.55], '#bfefff');
    for (const x of [-1.0, 1.0]) glow.quad([x - 0.25, 1.0, -6.56], [x + 0.25, 1.0, -6.56], [x + 0.25, 1.35, -6.56], [x - 0.25, 1.35, -6.56], '#fff2c4');
    gb.box(-1.4, 3.7, -3, 1.4, 3.9, 3, '#dfe3ee');
    wheelsX(gb, [-1.6, 1.6], [-4.2, 4.2], 0.7, 0.4);
  },
  truck(gb, glow, c) {
    const cab = c || '#3ec1ff';
    gb.box(-1.5, 0.8, -7, 1.5, 3.2, -4.6, cab);
    gb.box(-1.52, 2.0, -6.9, 1.52, 3.0, -5.2, '#2f3247');
    glow.quad([-1.2, 2.1, -7.02], [1.2, 2.1, -7.02], [1.2, 3.0, -7.02], [-1.2, 3.0, -7.02], '#bfefff');
    gb.box(-1.6, 0.8, -4.4, 1.6, 4.4, 6.5, '#dfe3ee');
    gb.box(-1.62, 2.4, -4.4, 1.62, 2.8, 6.5, cab);
    gb.box(-1.3, 0.6, -4.5, 1.3, 1.0, 6.4, '#2f3247');
    wheelsX(gb, [-1.5, 1.5], [-5.6, 3.2, 5.2], 0.8, 0.5);
  },
  locomotive(gb, glow, c) {
    const body = c || '#8f1d2c';
    gb.box(-1.9, 0.9, -6, 1.9, 1.5, 6, '#2f3247');
    cylZ(gb, 0, 3.1, -6, 1.5, 1.5, 1.5, 12, body);
    gb.box(-1.8, 1.5, 1.5, 1.8, 5, 6, body);
    gb.box(-2.1, 5, 1.2, 2.1, 5.3, 6.3, '#2f3247');
    cylinder(gb, 0, 4.4, 6.0, -4.2, 0.55, 8, '#2f3247', 0.8);
    gb.box(-0.4, 4.6, -1.2, 0.4, 5.1, -0.4, '#d8b53f');
    glow.quad([-1.0, 3.3, -6.05], [1.0, 3.3, -6.05], [1.0, 3.9, -6.05], [-1.0, 3.9, -6.05], '#fff2c4');
    for (const s of [-1, 1]) glow.quad([s * 1.83, 3.0, 2.4], [s * 1.83, 3.0, 4.6], [s * 1.83, 4.2, 4.6], [s * 1.83, 4.2, 2.4], '#bfefff');
    wheelsX(gb, [-1.7, 1.7], [-4, -1.6, 1, 3.4, 5.2], 0.85, 0.35);
  },
  sedan(gb, glow, c) {
    const body = c || '#7cf06b';
    gb.box(-1.4, 0.5, -3.2, 1.4, 1.6, 3.2, body);
    gb.box(-1.2, 1.6, -1.6, 1.2, 2.5, 1.9, body);
    glow.quad([-1.1, 1.7, -1.62], [1.1, 1.7, -1.62], [1.0, 2.4, -1.5], [-1.0, 2.4, -1.5], '#bfefff');
    for (const s of [-1, 1]) glow.quad([s * 1.24, 1.7, -1.4], [s * 1.24, 1.7, 1.6], [s * 1.24, 2.4, 1.3], [s * 1.24, 2.4, -1.2], '#bfefff');
    for (const x of [-0.9, 0.9]) glow.quad([x - 0.3, 0.9, -3.22], [x + 0.3, 0.9, -3.22], [x + 0.3, 1.25, -3.22], [x - 0.3, 1.25, -3.22], '#fff2c4');
    wheelsX(gb, [-1.4, 1.4], [-2.1, 2.1], 0.55, 0.4);
  },
  ufo(gb, glow, c) {
    const body = c || '#b8c0d8';
    sphere(gb, 0, 2.2, 0, 4.6, body, '#9aa3c2', 1.0, 3, 14);
    sphere(gb, 0, 2.6, 0, 1.9, '#7fe9ff', null, 1.8, 4, 10, true);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; glow.tri([Math.cos(a) * 4.3, 2.0, Math.sin(a) * 4.3], [Math.cos(a + 0.2) * 4.3, 2.0, Math.sin(a + 0.2) * 4.3], [Math.cos(a + 0.1) * 4.6, 2.4, Math.sin(a + 0.1) * 4.6], i % 2 ? '#ffd23e' : '#ff7ad9'); }
    for (const [x, z] of [[2.4, 0], [-1.2, 2.1], [-1.2, -2.1]]) limb(gb, [x, 1.5, z], [x * 1.2, 0, z * 1.2], 0.14, 0.2, GREY);
  },
  sailboat(gb, glow, c) {
    const hull = c || '#f4f1ea';
    gb.taper(0, 0, 0.3, 1.8, 1.3, 4.2, 1.9, 5.0, hull);
    gb.box(-1.4, 1.7, -4.6, 1.4, 1.9, 4.6, '#8a6a4a');
    limb(gb, [0, 1.9, -0.6], [0, 11, -0.6], 0.17, 0.1, '#6b4a32');
    gb.tri([0.05, 2.6, -0.6], [0.05, 10.4, -0.6], [0.05, 2.6, 4.2], '#f4f1ea'); gb.tri([-0.05, 2.6, -0.6], [-0.05, 2.6, 4.2], [-0.05, 10.4, -0.6], '#f4f1ea');
    gb.tri([0.05, 2.4, -0.9], [0.05, 9.6, -0.9], [0.05, 2.4, -4.4], c || '#ff4f9a'); gb.tri([-0.05, 2.4, -0.9], [-0.05, 2.4, -4.4], [-0.05, 9.6, -0.9], c || '#ff4f9a');
  },
  // ---- Noël ----
  xmasTree(gb, glow, c) {
    cylinder(gb, 0, 0, 1.4, 0, 0.5, 6, '#6b4a32');
    const col = c || '#1f7a4a';
    cone(gb, 0, 1, 0, 3.4, 3.6, 10, col); cone(gb, 0, 3.2, 0, 2.6, 3.2, 10, col); cone(gb, 0, 5.2, 0, 1.8, 3.0, 10, c || '#27905a');
    star5(glow, 0, 8.6, 0.05, 0.9, 0.38, '#ffd23e'); star5(glow, 0, 8.6, -0.05, 0.9, 0.38, '#ffd23e');
    const balls = [[1.6, 2.2, 1.9, '#ff3b4f'], [-1.9, 2.5, 1.2, '#3ec1ff'], [0.4, 4.4, 1.8, '#ffd23e'], [-1.1, 4.8, -1.2, '#ff7ad9'], [1.2, 6.5, 0.9, '#ff3b4f'], [-0.8, 6.8, 0.7, '#7cf06b'], [2.2, 2.3, -1.6, '#ffd23e']];
    for (const [x, y, z, k] of balls) octa(gb, x, y, z, 0.28, 0.32, k, glow, k);
  },
  snowman(gb, glow, c) {
    sphere(gb, 0, 1.4, 0, 1.5, WHITE, '#e6eefc', 1.4, 4, 9); sphere(gb, 0, 3.6, 0, 1.1, WHITE, '#e6eefc', 1.05, 4, 9); sphere(gb, 0, 5.2, 0, 0.8, WHITE, '#e6eefc', 0.8, 4, 9);
    cone(gb, 0, 5.2, 0, 0.14, 1.0, 5, '#ff7a1a');
    for (const x of [-0.28, 0.28]) glow.tri([x, 5.55, 0.7], [x + 0.14, 5.55, 0.7], [x + 0.07, 5.7, 0.7], '#14142a');
    for (let i = 0; i < 3; i++) glow.tri([-0.1, 3.9 - i * 0.55, 1.05], [0.1, 3.9 - i * 0.55, 1.05], [0, 4.1 - i * 0.55, 1.05], '#14142a');
    gb.box(-0.9, 5.85, -0.9, 0.9, 5.95, 0.9, '#2f3247'); gb.box(-0.55, 5.95, -0.55, 0.55, 6.9, 0.55, '#2f3247');
    gb.box(-0.95, 4.35, -0.95, 0.95, 4.65, 0.95, c || '#ff3b4f');
    limb(gb, [1.0, 3.9, 0], [2.3, 4.7, 0], 0.07, 0.05, '#6b4a32'); limb(gb, [-1.0, 3.9, 0], [-2.3, 4.7, 0], 0.07, 0.05, '#6b4a32');
  },
  gift(gb, glow, c) {
    const col = c || '#ff3b4f';
    gb.box(-1.6, 0, -1.6, 1.6, 2.6, 1.6, col);
    gb.box(-0.3, 0, -1.65, 0.3, 2.65, 1.65, '#ffd23e'); gb.box(-1.65, 0, -0.3, 1.65, 2.65, 0.3, '#ffd23e');
    octa(gb, -0.55, 3.0, 0, 0.6, 0.45, '#ffd23e'); octa(gb, 0.55, 3.0, 0, 0.6, 0.45, '#ffd23e');
    gb.box(-0.2, 2.6, -0.2, 0.2, 3.0, 0.2, '#ffd23e');
  },
  candyCane(gb, glow, c) {
    const A = c || '#ff3b4f';
    for (let i = 0; i < 9; i++) cylinder(gb, 0, i * 0.5, i * 0.5 + 0.5, 0, 0.36, 8, i % 2 ? WHITE : A);
    for (let i = 0; i < 7; i++) { const a = (i / 6) * Math.PI; sphere(gb, Math.cos(a) * 1.1 + 1.1, 4.5 + Math.sin(a) * 1.1, 0, 0.4, i % 2 ? WHITE : A, null, 0.4, 3, 6); }
  },
  xmasStar(gb, glow, c) {
    limb(gb, [0, 0, 0], [0, 4.2, 0], 0.18, 0.12, GREY);
    const col = c || '#ffd23e';
    star5(glow, 0, 6.2, 0.08, 2.2, 0.95, col); star5(glow, 0, 6.2, -0.08, 2.2, 0.95, col);
    octa(gb, 0, 6.2, 0, 0.7, 0.5, col, glow, col);
  },
  wreath(gb, glow, c) {
    const col = c || '#1f7a4a';
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; sphere(gb, Math.cos(a) * 2.6, 3 + Math.sin(a) * 2.6, 0, 0.75, col, i % 2 ? '#2a9a5e' : null, 0.75, 3, 6); }
    for (let i = 0; i < 6; i++) { const a = 0.4 + (i / 6) * TAU; octa(gb, Math.cos(a) * 2.6, 3 + Math.sin(a) * 2.6, 0.7, 0.2, 0.22, '#ff3b4f', glow, '#ff3b4f'); }
    octa(gb, -0.55, 0.45, 0.4, 0.65, 0.5, '#ff3b4f'); octa(gb, 0.55, 0.45, 0.4, 0.65, 0.5, '#ff3b4f');
    gb.box(-1.4, 0, -0.2, 1.4, 0.3, 0.2, '#6b4a32');
  },
  sleigh(gb, glow, c) {
    const col = c || '#d8213b';
    gb.box(-1.4, 0.9, -2.4, 1.4, 1.5, 2.4, col);
    gb.box(-1.5, 1.5, -0.4, -1.3, 2.7, 2.4, col); gb.box(1.3, 1.5, -0.4, 1.5, 2.7, 2.4, col);
    gb.box(-1.4, 1.5, 2.3, 1.4, 3.1, 2.6, col);
    gb.box(-1.0, 1.5, -0.2, 1.0, 1.6, 2.2, '#8a6a4a');
    for (const x of [-1.1, 1.1]) { gb.box(x - 0.1, 0.3, -3.4, x + 0.1, 0.5, 3, '#d8b53f'); limb(gb, [x, 0.5, -3], [x, 1.1, -3.4], 0.1, 0.1, '#d8b53f'); limb(gb, [x, 0.5, -1.4], [x, 1.0, -1.4], 0.08, 0.08, '#d8b53f'); limb(gb, [x, 0.5, 1.6], [x, 1.0, 1.6], 0.08, 0.08, '#d8b53f'); }
    sphere(gb, 0, 2.2, 0.8, 1.0, '#8a6a4a', null, 0.9, 3, 7); gb.box(-0.1, 3.0, 0.7, 0.1, 3.2, 0.9, '#d8b53f');
    octa(gb, -0.5, 1.9, -1.0, 0.5, 0.45, '#3ec1ff'); octa(gb, 0.4, 1.9, -1.2, 0.45, 0.4, '#ffd23e');
  },
  reindeer(gb, glow, c) {
    const col = c || '#8a5a3c';
    gb.box(-0.7, 2.2, -1.6, 0.7, 3.5, 1.6, col);
    for (const [x, z] of [[-0.5, -1.2], [0.5, -1.2], [-0.5, 1.2], [0.5, 1.2]]) limb(gb, [x, 2.3, z], [x, 0, z], 0.2, 0.12, col);
    limb(gb, [0, 3.3, -1.3], [0, 4.7, -2.0], 0.4, 0.28, col);
    gb.box(-0.38, 4.6, -3.1, 0.38, 5.4, -1.8, col);
    glow.tri([-0.12, 4.9, -3.12], [0.12, 4.9, -3.12], [0, 5.1, -3.12], '#ff3b4f'); octa(gb, 0, 4.85, -3.15, 0.22, 0.22, '#ff3b4f', glow, '#ff3b4f');
    for (const s of [-1, 1]) { limb(gb, [s * 0.25, 5.4, -2.1], [s * 1.0, 6.7, -2.2], 0.07, 0.05, '#d8c9a0'); limb(gb, [s * 0.7, 6.1, -2.15], [s * 0.45, 6.9, -2.1], 0.05, 0.04, '#d8c9a0'); limb(gb, [s * 0.7, 6.1, -2.15], [s * 1.5, 6.6, -2.3], 0.05, 0.04, '#d8c9a0'); }
    gb.box(-0.1, 3.3, 1.5, 0.1, 3.7, 1.8, WHITE);
  },
  gingerHouse(gb, glow, c) {
    const wall = c || '#a8693a';
    gb.box(-4, 0, -3.5, 4, 3.6, 3.5, wall);
    const r1 = [-4.6, 3.6, 0], r2 = [4.6, 3.6, 0];
    gb.quad([-4.6, 3.6, -4], [4.6, 3.6, -4], [4.6, 5.8, 0], [-4.6, 5.8, 0], WHITE); gb.quad([-4.6, 5.8, 0], [4.6, 5.8, 0], [4.6, 3.6, 4], [-4.6, 3.6, 4], WHITE);
    gb.tri([-4, 3.6, -3.5], [-4, 3.6, 3.5], [-4, 5.7, 0], wall); gb.tri([4, 3.6, -3.5], [4, 5.7, 0], [4, 3.6, 3.5], wall);
    void r1; void r2;
    gb.box(-0.8, 0, 3.5, 0.8, 2.2, 3.6, '#5a3a22');
    for (const x of [-2.6, 2.6]) glow.quad([x - 0.6, 1.4, 3.56], [x + 0.6, 1.4, 3.56], [x + 0.6, 2.6, 3.56], [x - 0.6, 2.6, 3.56], '#ffd23e');
    for (let i = 0; i < 7; i++) octa(gb, -4 + i * 1.33, 3.7, 3.9, 0.3, 0.3, ['#ff3b4f', '#7cf06b', '#ffd23e'][i % 3], glow, ['#ff3b4f', '#7cf06b', '#ffd23e'][i % 3]);
    cylinder(gb, 2.4, 5.2, 7.0, -1, 0.5, 6, '#7a4a28');
  },
  // ---- Halloween ----
  pumpkin(gb, glow, c) {
    const col = c || '#ff7a1a';
    sphere(gb, 0, 1.5, 0, 2.0, col, '#e8650f', 1.5, 5, 12); sphere(gb, 0, 1.5, 0, 1.3, '#d85a0c', null, 1.55, 4, 8);
    cylinder(gb, 0, 2.9, 3.6, 0, 0.28, 6, '#3f7a3a', 0.2);
    glow.tri([-1.1, 2.2, 1.95], [-0.4, 2.2, 1.95], [-0.75, 2.8, 1.95], '#ffd23e'); glow.tri([0.4, 2.2, 1.95], [1.1, 2.2, 1.95], [0.75, 2.8, 1.95], '#ffd23e');
    for (let i = 0; i < 4; i++) glow.quad([-1.2 + i * 0.6, 0.8, 1.9], [-0.8 + i * 0.6, 0.8, 1.9], [-0.8 + i * 0.6, 1.5, 1.9], [-1.2 + i * 0.6, 1.5, 1.9], i % 2 ? '#ff9f3a' : '#ffd23e');
  },
  ghost(gb, glow, c) {
    const col = c || '#f4f1ea';
    sphere(gb, 0, 4.2, 0, 1.7, col, null, 1.8, 5, 10);
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * TAU, a1 = ((i + 1) / 10) * TAU, am = (a0 + a1) / 2;
      const R = 1.7, bot = i % 2 ? 0.6 : 1.2;
      gb.quad([Math.cos(a0) * R, 4.2, Math.sin(a0) * R], [Math.cos(a1) * R, 4.2, Math.sin(a1) * R], [Math.cos(a1) * R, bot + 0.9, Math.sin(a1) * R], [Math.cos(a0) * R, bot + 0.9, Math.sin(a0) * R], col);
      gb.tri([Math.cos(a0) * R, bot + 0.9, Math.sin(a0) * R], [Math.cos(a1) * R, bot + 0.9, Math.sin(a1) * R], [Math.cos(am) * R * 0.9, bot - 0.1 + (i % 2 ? 0 : 0.5), Math.sin(am) * R * 0.9], col);
    }
    for (const x of [-0.6, 0.6]) glow.quad([x - 0.22, 4.5, 1.66], [x + 0.22, 4.5, 1.66], [x + 0.22, 5.1, 1.66], [x - 0.22, 5.1, 1.66], '#14142a');
    glow.quad([-0.35, 3.6, 1.66], [0.35, 3.6, 1.66], [0.3, 4.0, 1.66], [-0.3, 4.0, 1.66], '#14142a');
  },
  tombstone(gb, glow, c) {
    const col = c || '#8d93ad';
    gb.box(-1.5, 0, -0.45, 1.5, 3.0, 0.45, col);
    sphere(gb, 0, 3.0, 0, 1.5, col, null, 1.2, 3, 10, true);
    gb.box(-0.12, 1.5, 0.46, 0.12, 2.9, 0.5, '#4a4f6a'); gb.box(-0.55, 2.3, 0.46, 0.55, 2.55, 0.5, '#4a4f6a');
    gb.box(-1.9, 0, -1.3, 1.9, 0.25, 1.3, '#5a8a4a');
  },
  bats(gb, glow, c) {
    const col = c || '#2f3247';
    const bat = (x, y, z, k) => {
      octa(gb, x, y, z, 0.35, 0.5, col);
      for (const s of [-1, 1]) {
        gb.quad([x, y + 0.2, z - 0.1], [x + s * 0.2, y + 0.1, z + 0.3], [x + s * 2.0, y + 0.5 + k, z + 0.4], [x + s * 1.9, y + 0.7 + k, z - 0.5], col);
        gb.tri([x + s * 0.2, y + 0.1, z + 0.3], [x + s * 1.0, y - 0.1, z + 0.5], [x + s * 2.0, y + 0.5 + k, z + 0.4], col);
      }
      octa(gb, x - 0.12, y + 0.35, z - 0.3, 0.07, 0.07, '#ff3b4f', glow, '#ff3b4f'); octa(gb, x + 0.12, y + 0.35, z - 0.3, 0.07, 0.07, '#ff3b4f', glow, '#ff3b4f');
    };
    bat(0, 3.2, 0, 0.3); bat(3.4, 4.6, 1.6, -0.2); bat(-3, 5.4, -1.8, 0.4);
  },
  witchHat(gb, glow, c) {
    const col = c || '#2a2438';
    cylinder(gb, 0, 0, 0.35, 0, 3.4, 12, col, 3.2);
    cone(gb, 0, 0.35, 0, 2.0, 4.6, 10, col);
    cylinder(gb, 0, 0.45, 1.1, 0, 2.02, 10, '#8f3df2', 1.7);
    gb.box(-0.6, 0.5, 1.7, 0.6, 1.1, 2.1, '#ffd23e'); gb.box(-0.35, 0.6, 1.75, 0.35, 1.0, 2.15, '#2a2438');
    void glow;
  },
  cauldron(gb, glow, c) {
    const col = c || '#2a2a33';
    sphere(gb, 0, 2.0, 0, 2.2, col, null, 1.7, 4, 12, false);
    cylinder(gb, 0, 3.4, 3.7, 0, 2.2, 12, '#3a3a46', 2.2);
    for (const a of [0.6, 2.7, 4.8]) limb(gb, [Math.cos(a) * 1.4, 1.0, Math.sin(a) * 1.4], [Math.cos(a) * 1.9, 0, Math.sin(a) * 1.9], 0.22, 0.28, col);
    glow.quad([-1.9, 3.62, -1.9], [1.9, 3.62, -1.9], [1.9, 3.62, 1.9], [-1.9, 3.62, 1.9], '#7cf06b');
    for (const [x, z, r] of [[0.6, 0.4, 0.4], [-0.9, -0.5, 0.3], [0.2, -1.1, 0.25]]) octa(gb, x, 3.9, z, r, r, '#b6ff9a', glow, '#b6ff9a');
    limb(gb, [-1.2, 0.2, 1.4], [-2.6, 0.2, 2.6], 0.12, 0.12, '#6b4a32');
  },
  spookyTree(gb, glow, c) {
    const col = c || '#3a2f38';
    cylinder(gb, 0, 0, 3.8, 0, 0.9, 7, col, 0.45);
    const br = [[[0, 3.2, 0], [-2.4, 5.4, 0.4], 0.32], [[0, 3.6, 0], [2.6, 6.0, -0.5], 0.3], [[0, 3.8, 0], [0.3, 7.4, 0.6], 0.28], [[-2.4, 5.4, 0.4], [-3.6, 7.2, 0.2], 0.16], [[2.6, 6.0, -0.5], [3.8, 7.4, -0.7], 0.15], [[2.6, 6.0, -0.5], [2.1, 7.8, 0], 0.13], [[-1.2, 4.4, 0.2], [-2.8, 4.0, 1.4], 0.14], [[0.3, 7.4, 0.6], [-0.7, 8.8, 0.9], 0.12]];
    for (const [a, b, r] of br) limb(gb, a, b, r, r * 0.45, col);
    for (const x of [-0.25, 0.25]) glow.quad([x - 0.1, 2.4, 0.5], [x + 0.1, 2.4, 0.5], [x + 0.1, 2.75, 0.5], [x - 0.1, 2.75, 0.5], '#ffd23e');
  },
  hauntedHouse(gb, glow, c) {
    const wall = c || '#4a4260';
    gb.box(-4.5, 0, -3.5, 4.5, 6.2, 3.5, wall);
    gb.quad([-5, 6.2, -4], [5, 6.2, -4], [5, 8.6, 0], [-5, 8.6, 0], '#2a2438'); gb.quad([-5, 8.6, 0], [5, 8.6, 0], [5, 6.2, 4], [-5, 6.2, 4], '#2a2438');
    gb.tri([-4.5, 6.2, -3.5], [-4.5, 6.2, 3.5], [-4.5, 8.5, 0], wall); gb.tri([4.5, 6.2, -3.5], [4.5, 8.5, 0], [4.5, 6.2, 3.5], wall);
    gb.box(2.2, 0, -1.2, 4.8, 10.5, 1.4, wall); cone(gb, 3.5, 10.5, 0.1, 2.2, 3.2, 4, '#2a2438');
    gb.box(-0.9, 0, 3.5, 0.9, 2.6, 3.6, '#1d1a28');
    for (const [x, y] of [[-2.8, 1.8], [-2.8, 4.2], [2.6, 1.8], [-0.2, 4.4]]) glow.quad([x - 0.6, y, 3.56], [x + 0.6, y, 3.56], [x + 0.6, y + 1.2, 3.56], [x - 0.6, y + 1.2, 3.56], '#ffb347');
    glow.quad([3.1, 7.6, 1.46], [3.9, 7.6, 1.46], [3.9, 8.8, 1.46], [3.1, 8.8, 1.46], '#ffb347');
  },
  skull(gb, glow, c) {
    const col = c || '#f4f1ea';
    sphere(gb, 0, 3.2, 0, 2.0, col, '#e6dfcf', 1.8, 5, 10);
    gb.box(-1.2, 1.0, -1.0, 1.2, 1.9, 1.2, col);
    for (const x of [-0.75, 0.75]) glow.quad([x - 0.5, 3.0, 1.9], [x + 0.5, 3.0, 1.9], [x + 0.5, 3.9, 1.9], [x - 0.5, 3.9, 1.9], '#14142a');
    glow.tri([-0.2, 2.5, 1.95], [0.2, 2.5, 1.95], [0, 2.9, 1.95], '#14142a');
    for (let i = 0; i < 5; i++) gb.box(-1.0 + i * 0.4, 0.95, 1.18, -0.7 + i * 0.4, 1.7, 1.22, '#14142a');
  },
});

// Petite base rocheuse (amas de cristaux).
function rockBase(gb) {
  octa(gb, 0, 0.3, 0, 2.2, 0.6, '#4a3e5a');
}

// Décale les sommets d'un sous-objet (arbre posé sur une île flottante).
function gbOffset(gb, ox, oy, oz) {
  return { quad: (a, b, c, d, col) => gb.quad(sh(a), sh(b), sh(c), sh(d), col), tri: (a, b, c, col) => gb.tri(sh(a), sh(b), sh(c), col), box: (x0, y0, z0, x1, y1, z1, col, f) => gb.box(x0 + ox, y0 + oy, z0 + oz, x1 + ox, y1 + oy, z1 + oz, col, f) };
  function sh(p) { return [p[0] + ox, p[1] + oy, p[2] + oz]; }
}

registerPack(BUILDERS, { cylinder, cone, sphere, octa, limb, star5, cylX, cylZ, GREY, DARK, WHITE });

export function decoColor(d) {
  if (d.cc) return d.cc;           // couleur personnalisée (#rrggbb), choisie dans l'Inspecteur › Couleurs
  return d.c > 0 ? DECO_COLORS[d.c - 1] || null : null;
}

const mat4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);

export function decoMatrix(d) {
  q.setFromAxisAngle(up, d.ry || 0);
  return mat4.compose(new THREE.Vector3(d.x, d.y, d.z), q, new THREE.Vector3(d.s, d.s, d.s)).clone();
}

export function buildDecoInto(gb, glow, d) {
  const fn = BUILDERS[d.k];
  if (!fn) return;
  const m = decoMatrix(d);
  gb.setMatrix(m);
  glow.setMatrix(m);
  fn(gb, glow, decoColor(d));
  gb.setMatrix(null);
  glow.setMatrix(null);
}

// Plaque rectangulaire portant une image (URL http / https uniquement).
const loader = new THREE.TextureLoader();
loader.setCrossOrigin('anonymous');
export function safeUrl(u) {
  return /^https?:\/\/[^\s]+$/i.test(String(u || '')) && String(u).length <= 400;
}

export function createPlaque(d, onLoad) {
  const mat = new THREE.MeshBasicMaterial({ color: '#4a5075', side: THREE.DoubleSide, toneMapped: false });
  const geo = new THREE.PlaneGeometry(8, 4.5);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.own = true;
  mesh.position.set(d.x, d.y + 2.25 * d.s + 1, d.z);
  mesh.rotation.y = d.ry || 0;
  mesh.scale.set(d.s, d.s, d.s);
  if (safeUrl(d.u)) {
    loader.load(d.u, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      mat.map = tex;
      mat.color.set('#ffffff');
      const a = tex.image && tex.image.width ? tex.image.width / tex.image.height : 16 / 9;
      mesh.scale.set(d.s * (a > 1 ? 1 : a), d.s * (a > 1 ? 1 / a : 1), d.s);
      mat.needsUpdate = true;
      if (onLoad) onLoad(tex);
    }, undefined, () => { mat.color.set('#6b3a4a'); });
  }
  return mesh;
}

// Aperçu isolé (éditeur).
export function buildDecoMesh(d, material, glowMaterial) {
  if (isObstacle(d.k)) return createObstacleMesh(d, { solid: material, glow: glowMaterial || material });
  const g = new THREE.Group();
  if (d.k === 'plaque') {
    const m = createPlaque({ ...d, x: 0, y: 0, z: 0, ry: 0 });
    m.material.opacity = 0.8; m.material.transparent = true;
    g.add(m);
    g.position.set(d.x, d.y, d.z);
    g.rotation.y = d.ry || 0;
    return g;
  }
  const gb = new GeoBuilder(), glow = new GeoBuilder();
  const fn = BUILDERS[d.k];
  if (!fn) return g;
  fn(gb, glow, decoColor(d));
  g.add(new THREE.Mesh(gb.build(), material));
  if (!glow.empty) g.add(new THREE.Mesh(glow.build(), glowMaterial || material));
  g.position.set(d.x, d.y, d.z);
  g.rotation.y = d.ry || 0;
  g.scale.setScalar(d.s);
  return g;
}

export { DECO_COLORS };
