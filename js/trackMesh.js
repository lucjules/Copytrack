// Génère les maillages 3D du circuit à partir des pièces.
import * as THREE from './vendor/three.module.min.js';
import { GeoBuilder } from './geo.js';
import {
  CELL, HALF, LEVEL_H, ROAD_HALF, RAIL_W, RAIL_H, SLAB_T,
} from './constants.js';
import { PIECES, arcParams, baseY, tileCenter } from './pieces.js';

export const PALETTE = {
  asphalt: '#343950',
  asphaltIce: '#bfe4f2',
  line: '#efe6d6',
  lineIce: '#ffffff',
  railA: '#ff6b57',
  railB: '#f3e7d3',
  railIceA: '#7fd3ff',
  railIceB: '#ffffff',
  railBoostA: '#2fe0ff',
  railBoostB: '#f3e7d3',
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
};

const RO = ROAD_HALF + RAIL_W;

// Profil de la route (d, h) parcouru dans le sens horaire (d vers la droite).
// k = type de couleur de l'arête suivante.
function roadProfile() {
  const T = -SLAB_T;
  return [
    { d: -RO, h: T, k: 'railOuter' },
    { d: -RO, h: RAIL_H, k: 'rail' },
    { d: -ROAD_HALF, h: RAIL_H, k: 'rail' },
    { d: -ROAD_HALF, h: 0, k: 'road' },
    { d: -ROAD_HALF + 0.5, h: 0, k: 'line' },
    { d: -ROAD_HALF + 0.9, h: 0, k: 'road' },
    { d: -0.2, h: 0, k: 'dash' },
    { d: 0.2, h: 0, k: 'road' },
    { d: ROAD_HALF - 0.9, h: 0, k: 'line' },
    { d: ROAD_HALF - 0.5, h: 0, k: 'road' },
    { d: ROAD_HALF, h: 0, k: 'rail' },
    { d: ROAD_HALF, h: RAIL_H, k: 'rail' },
    { d: RO, h: RAIL_H, k: 'slab' },
    { d: RO, h: T, k: 'under' },
  ];
}
const PROFILE = roadProfile();

function pathFor(tile) {
  const p = PIECES[tile.t];
  const base = baseY(tile);
  if (p.kind === 'arc') {
    const a = arcParams(p);
    return {
      n: p.size === 2 ? 16 : 8,
      at(t) {
        const ang = Math.PI + (Math.PI / 2) * t;
        return { x: a.cx + a.R * Math.cos(ang), y: base, z: a.cz + a.R * Math.sin(ang), tx: -Math.sin(ang), tz: Math.cos(ang) };
      },
    };
  }
  const half = p.size * HALF;
  const rise = p.rise * LEVEL_H;
  return {
    n: 4,
    at(t) { return { x: 0, y: base + rise * t, z: half - 2 * half * t, tx: 0, tz: -1 }; },
  };
}

function colorsFor(tile) {
  const sp = PIECES[tile.t].special;
  if (sp === 'ice') return { road: PALETTE.asphaltIce, line: PALETTE.lineIce, railA: PALETTE.railIceA, railB: PALETTE.railIceB };
  if (sp === 'boost') return { road: PALETTE.asphalt, line: PALETTE.line, railA: PALETTE.railBoostA, railB: PALETTE.railBoostB };
  return { road: PALETTE.asphalt, line: PALETTE.line, railA: PALETTE.railA, railB: PALETTE.railB };
}

function sweepRoad(gb, tile) {
  const path = pathFor(tile);
  const cols = colorsFor(tile);
  const n = path.n;
  const rings = [];
  for (let i = 0; i <= n; i++) {
    const s = path.at(i / n);
    const rx = -s.tz, rz = s.tx; // droite
    rings.push(PROFILE.map((q) => [s.x + rx * q.d, s.y + q.h, s.z + rz * q.d]));
  }
  const m = PROFILE.length;
  for (let i = 0; i < n; i++) {
    const A = rings[i], B = rings[i + 1];
    for (let j = 0; j < m; j++) {
      const j2 = (j + 1) % m;
      const k = PROFILE[j].k;
      let col;
      switch (k) {
        case 'rail': col = i % 2 ? cols.railA : cols.railB; break;
        case 'road': col = cols.road; break;
        case 'line': col = cols.line; break;
        case 'dash': col = i % 2 ? cols.road : cols.line; break;
        default: col = PALETTE[k];
      }
      gb.quad(A[j], A[j2], B[j2], B[j], col);
    }
  }
  // Faces d'extrémité (forme en U découpée en 3 rectangles).
  for (const start of [true, false]) {
    const s = path.at(start ? 0 : 1);
    const rx = -s.tz, rz = s.tx;
    const P = (d, h) => [s.x + rx * d, s.y + h, s.z + rz * d];
    const rects = [
      [-RO, -ROAD_HALF, -SLAB_T, RAIL_H],
      [-ROAD_HALF, ROAD_HALF, -SLAB_T, 0],
      [ROAD_HALF, RO, -SLAB_T, RAIL_H],
    ];
    for (const [d0, d1, h0, h1] of rects) {
      const a = P(d0, h0), b = P(d1, h0), c = P(d1, h1), d = P(d0, h1);
      if (start) gb.quad(a, b, c, d, PALETTE.slab);
      else gb.quad(b, a, d, c, PALETTE.slab);
    }
  }
}

function platform(gb, tile) {
  const y = baseY(tile);
  const y0 = y - SLAB_T;
  // Côtés et dessous
  gb.box(-HALF, y0, -HALF, HALF, y - 0.001, HALF, PALETTE.slab, [null, null, PALETTE.platA, PALETTE.under]);
  // Damier sur le dessus
  const n = 4, s = CELL / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x0 = -HALF + i * s, z0 = -HALF + j * s;
      gb.quad([x0, y, z0 + s], [x0 + s, y, z0 + s], [x0 + s, y, z0], [x0, y, z0], (i + j) % 2 ? PALETTE.platA : PALETTE.platB);
    }
  }
  // Liseré
  const e = 0.35;
  for (const [x0, z0, x1, z1] of [[-HALF, -HALF, HALF, -HALF + e], [-HALF, HALF - e, HALF, HALF], [-HALF, -HALF, -HALF + e, HALF], [HALF - e, -HALF, HALF, HALF]]) {
    gb.quad([x0, y + 0.02, z1], [x1, y + 0.02, z1], [x1, y + 0.02, z0], [x0, y + 0.02, z0], PALETTE.platEdge);
  }
}

// Portique (départ / checkpoint / arrivée).
function gate(gb, glow, tile) {
  const sp = PIECES[tile.t].special;
  const y = baseY(tile);
  const color = PALETTE[sp];
  const px = RO + 0.75;
  const top = 6.2;
  for (const s of [-1, 1]) {
    gb.taper(s * px, 0, y - SLAB_T, y + top, 1.1, 1.1, 0.8, 0.8, color);
    gb.box(s * px - 0.7, y + RAIL_H - 0.3, -0.7, s * px + 0.7, y + RAIL_H, 0.7, PALETTE.slab);
  }
  // Traverse
  const bx = px + 0.4;
  if (sp === 'finish') {
    const n = 16;
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
  // Bandeau lumineux sous la traverse
  const gy = y + top - (sp === 'finish' ? 1.25 : 1.05);
  glow.quad([-bx + 0.6, gy, -0.3], [bx - 0.6, gy, -0.3], [bx - 0.6, gy, 0.3], [-bx + 0.6, gy, 0.3], sp === 'finish' ? PALETTE.finish : color);
  // Pointes de cristal au sommet des poteaux
  for (const s of [-1, 1]) {
    const cx = s * px, cy = y + top;
    const h = 1.6, r = 0.55;
    const tip = [cx, cy + h, 0];
    const ring = [[cx - r, cy, 0], [cx, cy, -r], [cx + r, cy, 0], [cx, cy, r]];
    for (let i = 0; i < 4; i++) glow.tri(ring[i], ring[(i + 1) % 4], tip, color);
  }
  // Marquage au sol
  const ly = y + 0.03;
  if (sp === 'finish') {
    const n = 14, w = (2 * ROAD_HALF) / n;
    for (let i = 0; i < n; i++) {
      for (let r = 0; r < 2; r++) {
        const x0 = -ROAD_HALF + i * w, z0 = -1 + r;
        gb.quad([x0, ly, z0 + 1], [x0 + w, ly, z0 + 1], [x0 + w, ly, z0], [x0, ly, z0], (i + r) % 2 ? '#1e1f2b' : '#f7f2ea');
      }
    }
  } else if (sp === 'start') {
    gb.quad([-ROAD_HALF, ly, 0.5], [ROAD_HALF, ly, 0.5], [ROAD_HALF, ly, -0.5], [-ROAD_HALF, ly, -0.5], '#f7f2ea');
  } else {
    const n = 7, w = (2 * ROAD_HALF) / n;
    for (let i = 0; i < n; i += 2) {
      const x0 = -ROAD_HALF + i * w;
      gb.quad([x0, ly, 0.6], [x0 + w, ly, 0.6], [x0 + w, ly, -0.6], [x0, ly, -0.6], color);
    }
  }
}

function boostPad(glow, tile) {
  const y = baseY(tile) + 0.04;
  const w = 4.2, t = 1.3, depth = 2.6;
  for (const z of [5, 0, -5]) {
    // Chevron pointant vers -z
    const tipZ = z - depth / 2;
    const backZ = z + depth / 2;
    glow.quad([-w, y, backZ], [-w + t, y, backZ], [0, y, tipZ + t], [0, y, tipZ], PALETTE.boost);
    glow.quad([0, y, tipZ], [0, y, tipZ + t], [w - t, y, backZ], [w, y, backZ], PALETTE.boost);
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
  if (p.kind === 'area') platform(gb, tile);
  else sweepRoad(gb, tile);
  if (p.special === 'start' || p.special === 'checkpoint' || p.special === 'finish') gate(gb, glow, tile);
  if (p.special === 'boost') boostPad(glow, tile);

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
      gb.taper(lx, lz, 0, top - 0.5, 3.0, 3.0, 2.2, 2.2, PALETTE.pillar);
      gb.box(lx - 1.8, top - 0.5, lz - 1.8, lx + 1.8, top, lz + 1.8, PALETTE.pillarCap);
    }
  }
  gb.setMatrix(null);
  glow.setMatrix(null);
}

export function createTrackMaterials() {
  return {
    solid: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0.0 }),
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
    if (!glow.empty) {
      const mesh = new THREE.Mesh(glow.build(), this.materials.glow);
      this.group.add(mesh);
    }
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

// Maillage isolé d'une pièce (aperçu de l'éditeur, icônes).
export function buildTileMesh(tile, material, glowMaterial) {
  const gb = new GeoBuilder();
  const glow = new GeoBuilder();
  buildTileInto(gb, glow, tile, null);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(gb.build(), material));
  if (!glow.empty) g.add(new THREE.Mesh(glow.build(), glowMaterial || material));
  return g;
}
