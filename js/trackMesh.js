// Génère les maillages 3D du circuit à partir des pièces.
import * as THREE from './vendor/three.module.min.js';
import { GeoBuilder } from './geo.js';
import {
  CELL, HALF, LEVEL_H, ROAD_HALF, RAIL_W, RAIL_H, SLAB_T, LOOP_R, LOOP_LANE,
} from './constants.js';
import { PIECES, arcParams, baseY, tileCenter, loopFrame } from './pieces.js';

export const PALETTE = {
  asphalt: '#343950',
  line: '#efe6d6',
  railA: '#ff6b57',
  railB: '#f3e7d3',
  railOuter: '#4b4f72',
  slab: '#5a5e82',
  under: '#2b2d44',
  pillar: '#6e7196',
  pillarCap: '#585b7e',
  platA: '#454a6a',
  platB: '#4d5276',
  platEdge: '#ffb84d',
  start: '#2fd3b5',
  checkpoint: '#ffbf3c',
  finish: '#ff4f9a',
  boost: '#36e9ff',
  bounce: '#ff5fd2',
  magnet: '#b48cff',
  loopTower: '#3f4366',
};

// Couleurs par revêtement : chaussée (2 tons alternés), ligne, bordures.
export const SURFACE_STYLE = {
  '': { road: [PALETTE.asphalt, PALETTE.asphalt], line: PALETTE.line, railA: PALETTE.railA, railB: PALETTE.railB },
  ice: { road: ['#bfe4f2', '#cdeaf6'], line: '#ffffff', railA: '#7fd3ff', railB: '#ffffff' },
  boost: { road: [PALETTE.asphalt, PALETTE.asphalt], line: PALETTE.line, railA: '#2fe0ff', railB: '#f3e7d3' },
  bounce: { road: ['#4a2d5c', '#55336a'], line: '#ffd0f2', railA: '#ff5fd2', railB: '#fff0fb' },
  sand: { road: ['#c9a26b', '#bb935e'], line: '#efe0c4', railA: '#9b6b45', railB: '#e8d3ad' },
  magnet: { road: ['#2c2a4a', '#2c2a4a'], line: '#b48cff', railA: '#b48cff', railB: '#d9dce8' },
};

const RO = ROAD_HALF + RAIL_W;

// Profil de la route (d, h) parcouru dans le sens horaire (d vers la droite).
// k = type de couleur de l'arête suivante.
const PROFILE = [
  { d: -RO, h: -SLAB_T, k: 'railOuter' },
  { d: -RO, h: RAIL_H, k: 'rail' },
  { d: -ROAD_HALF, h: RAIL_H, k: 'rail' },
  { d: -ROAD_HALF, h: 0, k: 'road' },
  { d: -ROAD_HALF + 0.6, h: 0, k: 'line' },
  { d: -ROAD_HALF + 1.0, h: 0, k: 'road' },
  { d: -0.2, h: 0, k: 'dash' },
  { d: 0.2, h: 0, k: 'road' },
  { d: ROAD_HALF - 1.0, h: 0, k: 'line' },
  { d: ROAD_HALF - 0.6, h: 0, k: 'road' },
  { d: ROAD_HALF, h: 0, k: 'rail' },
  { d: ROAD_HALF, h: RAIL_H, k: 'rail' },
  { d: RO, h: RAIL_H, k: 'slab' },
  { d: RO, h: -SLAB_T, k: 'under' },
];

// ---- Chemins : suites de repères {p, r (droite), u (haut)} ----------------
function flatFrame(x, y, z, tx, tz) {
  return { p: [x, y, z], r: [-tz, 0, tx], u: [0, 1, 0] };
}

function lineStrip(x, z0, z1, y0, y1, n) {
  const out = [];
  const dir = z1 < z0 ? -1 : 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(flatFrame(x, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, 0, dir));
  }
  return out;
}

// Liste des bandes de route d'une pièce (coordonnées locales).
export function stripsFor(tile) {
  const p = PIECES[tile.t];
  const base = baseY(tile);
  if (p.kind === 'arc') {
    const a = arcParams(p);
    const n = p.size === 2 ? 16 : 8;
    const fr = [];
    for (let i = 0; i <= n; i++) {
      const ang = Math.PI + (Math.PI / 2) * (i / n);
      fr.push(flatFrame(a.cx + a.R * Math.cos(ang), base, a.cz + a.R * Math.sin(ang), -Math.sin(ang), Math.cos(ang)));
    }
    return [fr];
  }
  if (p.kind === 'loop') {
    const m = p.mirror;
    const half = p.size * HALF;
    const ribbon = [];
    const F = {};
    const n = 56;
    for (let i = 0; i <= n; i++) {
      loopFrame(m, base, (Math.PI * 2 * i) / n, F);
      ribbon.push({ p: [F.px, F.py, F.pz], r: [F.rx, F.ry, F.rz], u: [F.nx, F.ny, F.nz] });
    }
    return [
      lineStrip(-m * LOOP_LANE, half, 0, base, base, 3),
      ribbon,
      lineStrip(m * LOOP_LANE, 0, -half, base, base, 3),
    ];
  }
  const half = p.size * HALF;
  return [lineStrip(0, half, -half, base, base + p.rise * LEVEL_H, 4)];
}

const at = (f, d, h) => [
  f.p[0] + f.r[0] * d + f.u[0] * h,
  f.p[1] + f.r[1] * d + f.u[1] * h,
  f.p[2] + f.r[2] * d + f.u[2] * h,
];

function sweep(gb, frames, style) {
  const n = frames.length - 1;
  const rings = frames.map((f) => PROFILE.map((q) => at(f, q.d, q.h)));
  const m = PROFILE.length;
  for (let i = 0; i < n; i++) {
    const A = rings[i], B = rings[i + 1];
    for (let j = 0; j < m; j++) {
      const j2 = (j + 1) % m;
      let col;
      switch (PROFILE[j].k) {
        case 'rail': col = i % 2 ? style.railA : style.railB; break;
        case 'road': col = style.road[i % 2]; break;
        case 'line': col = style.line; break;
        case 'dash': col = i % 2 ? style.road[i % 2] : style.line; break;
        default: col = PALETTE[PROFILE[j].k];
      }
      gb.quad(A[j], A[j2], B[j2], B[j], col);
    }
  }
  // Faces d'extrémité (forme en U découpée en 3 rectangles).
  for (const start of [true, false]) {
    const f = frames[start ? 0 : n];
    const rects = [
      [-RO, -ROAD_HALF, -SLAB_T, RAIL_H],
      [-ROAD_HALF, ROAD_HALF, -SLAB_T, 0],
      [ROAD_HALF, RO, -SLAB_T, RAIL_H],
    ];
    for (const [d0, d1, h0, h1] of rects) {
      const a = at(f, d0, h0), b = at(f, d1, h0), c = at(f, d1, h1), d = at(f, d0, h1);
      if (start) gb.quad(a, b, c, d, PALETTE.slab);
      else gb.quad(b, a, d, c, PALETTE.slab);
    }
  }
}

// Repère interpolé le long d'une bande (t de 0 à 1) + tangente.
function frameAt(frames, t) {
  const n = frames.length - 1;
  const x = Math.min(n - 1e-6, Math.max(0, t * n));
  const i = Math.floor(x), k = x - i;
  const A = frames[i], B = frames[i + 1];
  const mix = (a, b) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const p = mix(A.p, B.p);
  let tg = [B.p[0] - A.p[0], B.p[1] - A.p[1], B.p[2] - A.p[2]];
  const l = Math.hypot(...tg) || 1;
  tg = tg.map((v) => v / l);
  return { p, r: mix(A.r, B.r), u: mix(A.u, B.u), t: tg };
}

const onFrame = (f, d, along, h = 0.05) => [
  f.p[0] + f.r[0] * d + f.t[0] * along + f.u[0] * h,
  f.p[1] + f.r[1] * d + f.t[1] * along + f.u[1] * h,
  f.p[2] + f.r[2] * d + f.t[2] * along + f.u[2] * h,
];

// Chevron lumineux pointant vers l'avant de la bande.
function chevron(glow, f, w, t, depth, color) {
  const tip = depth / 2, back = -depth / 2;
  glow.quad(onFrame(f, -w, back), onFrame(f, -w + t, back), onFrame(f, 0, tip - t), onFrame(f, 0, tip), color);
  glow.quad(onFrame(f, 0, tip), onFrame(f, 0, tip - t), onFrame(f, w - t, back), onFrame(f, w, back), color);
}

function diamondPad(glow, f, r, color) {
  for (const k of [1, 0.62]) {
    const R = r * k, t = 0.55;
    const P = [[0, R], [R, 0], [0, -R], [-R, 0]];
    const Q = [[0, R - t], [R - t, 0], [0, -R + t], [-R + t, 0]];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      glow.quad(onFrame(f, P[i][0], P[i][1]), onFrame(f, P[j][0], P[j][1]), onFrame(f, Q[j][0], Q[j][1]), onFrame(f, Q[i][0], Q[i][1]), color);
    }
  }
}

function surfaceDecals(glow, frames, s, area = false) {
  if (s === 'boost') {
    const ts = area ? [0.5] : frames.length > 10 ? [0.15, 0.38, 0.62, 0.85] : [0.2, 0.5, 0.8];
    for (const t of ts) chevron(glow, frameAt(frames, t), 5.2, 1.5, 3.2, PALETTE.boost);
  } else if (s === 'bounce') {
    diamondPad(glow, frameAt(frames, 0.5), 5.5, PALETTE.bounce);
  } else if (s === 'magnet') {
    const n = frames.length > 10 ? 8 : 5;
    for (let i = 0; i < n; i++) {
      const f = frameAt(frames, (i + 0.5) / n);
      glow.quad(onFrame(f, -ROAD_HALF + 1.3, -0.25), onFrame(f, ROAD_HALF - 1.3, -0.25), onFrame(f, ROAD_HALF - 1.3, 0.25), onFrame(f, -ROAD_HALF + 1.3, 0.25), PALETTE.magnet);
    }
  }
}

function platform(gb, glow, tile) {
  const y = baseY(tile);
  const y0 = y - SLAB_T;
  const s = tile.s || '';
  const st = SURFACE_STYLE[s];
  const top = s ? st.road : [PALETTE.platA, PALETTE.platB];
  gb.box(-HALF, y0, -HALF, HALF, y - 0.001, HALF, PALETTE.slab, [null, null, top[0], PALETTE.under]);
  const n = 4, w = CELL / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x0 = -HALF + i * w, z0 = -HALF + j * w;
      gb.quad([x0, y, z0 + w], [x0 + w, y, z0 + w], [x0 + w, y, z0], [x0, y, z0], top[(i + j) % 2]);
    }
  }
  const e = 0.4;
  const edge = s ? st.railA : PALETTE.platEdge;
  for (const [x0, z0, x1, z1] of [[-HALF, -HALF, HALF, -HALF + e], [-HALF, HALF - e, HALF, HALF], [-HALF, -HALF, -HALF + e, HALF], [HALF - e, -HALF, HALF, HALF]]) {
    gb.quad([x0, y + 0.02, z1], [x1, y + 0.02, z1], [x1, y + 0.02, z0], [x0, y + 0.02, z0], edge);
  }
  if (s) surfaceDecals(glow, lineStrip(0, HALF, -HALF, y, y, 4), s, true);
}

// Portique (départ / checkpoint / arrivée).
function gate(gb, glow, tile) {
  const sp = PIECES[tile.t].special;
  const y = baseY(tile);
  const color = PALETTE[sp];
  const px = RO + 0.75;
  const top = 6.6;
  for (const s of [-1, 1]) {
    gb.taper(s * px, 0, y - SLAB_T, y + top, 1.1, 1.1, 0.8, 0.8, color);
    gb.box(s * px - 0.7, y + RAIL_H - 0.3, -0.7, s * px + 0.7, y + RAIL_H, 0.7, PALETTE.slab);
  }
  const bx = px + 0.4;
  if (sp === 'finish') {
    const n = 18;
    const w = (2 * bx) / n;
    for (let i = 0; i < n; i++) {
      for (let r = 0; r < 2; r++) {
        gb.box(-bx + i * w, y + top - 1.2 + r * 0.6, -0.45, -bx + (i + 1) * w, y + top - 0.6 + r * 0.6, 0.45,
          (i + r) % 2 ? '#1e1f2b' : '#f7f2ea');
      }
    }
  } else {
    gb.box(-bx, y + top - 1.0, -0.45, bx, y + top, 0.45, color);
  }
  const gy = y + top - (sp === 'finish' ? 1.25 : 1.05);
  glow.quad([-bx + 0.6, gy, -0.3], [bx - 0.6, gy, -0.3], [bx - 0.6, gy, 0.3], [-bx + 0.6, gy, 0.3], color);
  for (const s of [-1, 1]) {
    const cx = s * px, cy = y + top;
    const h = 1.6, r = 0.55;
    const tip = [cx, cy + h, 0];
    const ring = [[cx - r, cy, 0], [cx, cy, -r], [cx + r, cy, 0], [cx, cy, r]];
    for (let i = 0; i < 4; i++) glow.tri(ring[i], ring[(i + 1) % 4], tip, color);
  }
  const ly = y + 0.03;
  if (sp === 'finish') {
    const n = 18, w = (2 * ROAD_HALF) / n;
    for (let i = 0; i < n; i++) {
      for (let r = 0; r < 2; r++) {
        const x0 = -ROAD_HALF + i * w, z0 = -1 + r;
        gb.quad([x0, ly, z0 + 1], [x0 + w, ly, z0 + 1], [x0 + w, ly, z0], [x0, ly, z0], (i + r) % 2 ? '#1e1f2b' : '#f7f2ea');
      }
    }
  } else if (sp === 'start') {
    gb.quad([-ROAD_HALF, ly, 0.5], [ROAD_HALF, ly, 0.5], [ROAD_HALF, ly, -0.5], [-ROAD_HALF, ly, -0.5], '#f7f2ea');
  } else {
    const n = 9, w = (2 * ROAD_HALF) / n;
    for (let i = 0; i < n; i += 2) {
      const x0 = -ROAD_HALF + i * w;
      gb.quad([x0, ly, 0.6], [x0 + w, ly, 0.6], [x0 + w, ly, -0.6], [x0, ly, -0.6], color);
    }
  }
}

// Tours encadrant un looping.
function loopTowers(gb, glow, tile) {
  const y = baseY(tile);
  const topY = y + LOOP_R * 2 + 3;
  for (const s of [-1, 1]) {
    const x = s * (CELL - 1.3);
    gb.taper(x, 0, y - SLAB_T - (tile.l ? tile.l * LEVEL_H : 0), topY, 2.2, 2.2, 1.2, 1.2, PALETTE.loopTower);
    const r = 0.9, h = 2.6;
    const ring = [[x - r, topY, 0], [x, topY, -r], [x + r, topY, 0], [x, topY, r]];
    for (let i = 0; i < 4; i++) glow.tri(ring[i], ring[(i + 1) % 4], [x, topY + h, 0], s > 0 ? PALETTE.bounce : PALETTE.boost);
    glow.quad([x - 1.25, y + LOOP_R, -0.2], [x + 1.25, y + LOOP_R, -0.2], [x + 1.25, y + LOOP_R + 0.5, -0.2], [x - 1.25, y + LOOP_R + 0.5, -0.2], PALETTE.boost);
  }
}

// Points d'appui (coordonnées locales) des piliers.
function pillarPoints(tile) {
  const p = PIECES[tile.t];
  if (p.kind === 'arc') {
    const a = arcParams(p);
    const angs = p.size === 2 ? [Math.PI + Math.PI / 6, Math.PI + Math.PI / 3] : [Math.PI * 1.25];
    return angs.map((ang) => [a.cx + a.R * Math.cos(ang), a.cz + a.R * Math.sin(ang)]);
  }
  if (p.kind === 'loop') return [[-p.mirror * LOOP_LANE, HALF], [p.mirror * LOOP_LANE, -HALF]];
  return [[0, 0]];
}

function pillarHeightAt(tile, lz) {
  const p = PIECES[tile.t];
  const base = baseY(tile);
  if (p.kind !== 'line') return base;
  const half = p.size * HALF;
  const t = (half - lz) / (2 * half);
  return base + p.rise * LEVEL_H * t;
}

export function tileMatrix(tile) {
  const c = tileCenter(tile);
  const m = new THREE.Matrix4().makeRotationY(-tile.r * Math.PI / 2);
  m.setPosition(c.x, 0, c.z);
  return m;
}

export function buildTileInto(gb, glow, tile, track = null) {
  const m = tileMatrix(tile);
  gb.setMatrix(m);
  glow.setMatrix(m);
  const p = PIECES[tile.t];
  const s = tile.s || '';
  if (p.kind === 'area') {
    platform(gb, glow, tile);
  } else {
    const style = SURFACE_STYLE[s] || SURFACE_STYLE[''];
    for (const strip of stripsFor(tile)) {
      sweep(gb, strip, p.kind === 'loop' ? SURFACE_STYLE[''] : style);
      if (s) surfaceDecals(glow, strip, s);
    }
  }
  if (p.special === 'start' || p.special === 'checkpoint' || p.special === 'finish') gate(gb, glow, tile);
  if (p.kind === 'loop') loopTowers(gb, glow, tile);

  // Piliers
  if (tile.l > 0 || p.rise > 0) {
    for (const [lx, lz] of pillarPoints(tile)) {
      const top = pillarHeightAt(tile, lz) - SLAB_T;
      if (top < 1.2) continue;
      if (track) {
        const w = new THREE.Vector3(lx, 0, lz).applyMatrix4(m);
        const cx = Math.floor(w.x / CELL), cz = Math.floor(w.z / CELL);
        let blocked = false;
        for (const o of track.tilesAt(cx, cz)) if (o !== tile && baseY(o) < top) blocked = true;
        if (blocked) continue;
      }
      gb.taper(lx, lz, 0, top - 0.5, 3.2, 3.2, 2.4, 2.4, PALETTE.pillar);
      gb.box(lx - 2, top - 0.5, lz - 2, lx + 2, top, lz + 2, PALETTE.pillarCap);
    }
  }
  gb.setMatrix(null);
  glow.setMatrix(null);
}

export function createTrackMaterials() {
  return {
    solid: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }),
  };
}

export class TrackView {
  constructor(track, materials) {
    this.track = track;
    this.materials = materials;
    this.group = new THREE.Group();
    this.rebuild();
  }

  rebuild() {
    this.disposeMeshes();
    const gb = new GeoBuilder();
    const glow = new GeoBuilder();
    for (const tile of this.track.tiles) buildTileInto(gb, glow, tile, this.track);
    if (!gb.empty) {
      const mesh = new THREE.Mesh(gb.build(), this.materials.solid);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    if (!glow.empty) this.group.add(new THREE.Mesh(glow.build(), this.materials.glow));
    this.builtVersion = this.track.version;
  }

  disposeMeshes() {
    for (const c of [...this.group.children]) {
      c.geometry.dispose();
      this.group.remove(c);
    }
  }

  dispose() {
    this.disposeMeshes();
    this.group.removeFromParent();
  }
}

// Maillage isolé d'une pièce (aperçu de l'éditeur).
export function buildTileMesh(tile, material, glowMaterial) {
  const gb = new GeoBuilder();
  const glow = new GeoBuilder();
  buildTileInto(gb, glow, tile, null);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(gb.build(), material));
  if (!glow.empty) g.add(new THREE.Mesh(glow.build(), glowMaterial || material));
  return g;
}
