// Décorations à placement libre : panneaux, formes, murs et toits, nature, plaque image.
// Chaque décoration est construite en coordonnées locales (base à y = 0, 1 unité = 1 m)
// puis placée avec position, rotation (ry) et échelle (s). Purement visuelles.
import * as THREE from './vendor/three.module.min.js';
import { GeoBuilder } from './geo.js';
import { DECO_COLORS } from './decoData.js';

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

export function decoColor(d) {
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
