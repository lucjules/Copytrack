// Géométrie du circuit : la forme 3D de chaque pièce (route, bordures, tunnel, revêtements, portiques, piliers) construite dans un GeoBuilder.
// Le maillage complet (tronçons, objets mobiles, lampes) est assemblé par TrackView dans trackMesh.js.
import * as THREE from './vendor/three.module.min.js';
import { CELL, HALF, LEVEL_H, ROAD_HALF, RAIL_W, RAIL_H, SLAB_T } from './constants.js';
import { PIECES, SURFACES, RING_R, RING_Y, arcParams, sbendPoint, plateShape, plateEdges, plateOutline, areaCentroid, roadHalf, junctionRects, baseY, tileCenter, tileParam, forkBranchX, forkSep, sampleLocal, cpKind, beltSpeed, isOriented, hasNoRails, profH, profOf } from './pieces.js';
import { WATER_DROP, boatDrop } from './track/shared.js';
import { ribbonOf, frameLocal } from './ribbons.js';
import { renderOptions } from './renderOptions.js';

const PALETTE = {
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
  tunnel: '#232842',
  tunnelRib: '#3a4166',
};

// Chaussée (2 tons alternés) et ligne centrale par revêtement.
export const SURFACE_STYLE = {
  '': { road: [PALETTE.asphalt, PALETTE.asphalt], line: PALETTE.line },
  ice: { road: ['#bfe4f2', '#cdeaf6'], line: '#ffffff' },
  boost: { road: [PALETTE.asphalt, PALETTE.asphalt], line: PALETTE.line },
  bounce: { road: ['#4a2d5c', '#55336a'], line: '#ffd0f2' },
  magnet: { road: ['#2c2a4a', '#2c2a4a'], line: '#b48cff' },
  drift: { road: ['#3a2f3a', '#43374a'], line: '#ffb84d' },
  slow: { road: ['#3b2a2f', '#452f35'], line: '#ff6b57' },
  wind: { road: ['#2c3a52', '#314160'], line: '#bfefff' },
  gravity: { road: ['#233a3a', '#294444'], line: '#a7ffe0' },
  moto: { road: ['#3b2e22', '#44352a'], line: '#ff9f1c' },
  water: { road: ['#1f6fb2', '#2479bf'], line: '#9fe3ff' },
  boat: { road: ['#5b7b8a', '#668898'], line: '#cdeeff' },      // plaque bateau : cale de mise à l'eau (ni eau ni route), voir roadFn
  glider: { road: ['#2f3346', '#353a50'], line: '#f5f5f5' },
  flip: { road: ['#3a1f3f', '#44244a'], line: '#ff4fd8' },
  conveyor: { road: ['#2a2b30', '#303138'], line: '#ffd23e' },
  spring: { road: ['#1f3a2a', '#244432'], line: '#5dff8a' },
  glass: { road: ['#7fb8d6', '#8cc4e0'], line: '#e9fbff' },
  powder: { road: ['#e9f2fb', '#f4f8fd'], line: '#bcd9ff' },
  reverse: { road: ['#2e2340', '#35284a'], line: '#c05fff' },
  cut: { road: ['#3a1d1d', '#432222'], line: '#ff3b3b' },
};

const RO = ROAD_HALF + RAIL_W;
const TUNNEL_R = RO + 1.0;

const _c1 = new THREE.Color(), _c2 = new THREE.Color();

// Palette adaptée au daltonisme (teintes bien séparées, d'après la palette d'Okabe et Ito).
const CB_COLORS = {
  ice: '#ffffff', boost: '#56b4e9', bounce: '#cc79a7', magnet: '#0072b2',
  drift: '#e69f00', slow: '#d55e00', wind: '#d9d9d9', gravity: '#009e73',
  moto: '#ffb000', boat: '#3fa7ff', glider: '#f5f5f5', flip: '#ff4fd8',
  conveyor: '#f0e442', spring: '#009e73', glass: '#56b4e9', powder: '#ffffff', reverse: '#cc79a7', cut: '#d55e00',
};

// Couleur d'un revêtement selon son paramètre (faible / normal / fort).
export function tint(s, p) {
  const S = SURFACES[s];
  if (!S || !S.c) return '#ffffff';
  if (renderOptions.colorblind && CB_COLORS[s]) return CB_COLORS[s];
  if (S.def == null) return S.c[1];
  const v = p || S.def;
  if (v <= S.def) {
    _c1.set(S.c[0]); _c2.set(S.c[1]);
    return '#' + _c1.lerp(_c2, (v - S.min) / Math.max(1, S.def - S.min)).getHexString();
  }
  _c1.set(S.c[1]); _c2.set(S.c[2]);
  return '#' + _c1.lerp(_c2, (v - S.def) / Math.max(1, S.max - S.def)).getHexString();
}

// Thèmes visuels (option « Thème ») : teintes de la chaussée, des lignes, des bordures et de la dalle. Sans effet sur le jeu.
const THEME_STYLE = [
  null,
  { road: ['#3f6c3b', '#487b43'], line: '#eaf5c9', railA: '#6dbb4a', railB: '#dff2b8', pal: { slab: '#5d7c4b', under: '#2e4226', railOuter: '#3d5a30' } },
  { road: ['#cfae78', '#c2a06a'], line: '#f2e4c4', railA: '#a8764a', railB: '#ecd7ae', pal: { slab: '#9c8156', under: '#6b563a', railOuter: '#7a6244' } },
  { road: ['#5a5957', '#656361'], line: '#c9c3b8', railA: '#8d857a', railB: '#bdb5a8', pal: { slab: '#6e6a64', under: '#3a3836', railOuter: '#4e4b47' } },
];
export const THEME_SWATCH = ['#343950', '#487b43', '#c2a06a', '#656361'];
const _white = new THREE.Color('#ffffff');
const mix = (hex, k, to = _white) => '#' + new THREE.Color(hex).lerp(to, k).getHexString();

const smoothStep = (u) => u * u * (3 - 2 * u);
const mixHex = (a, b, k) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();

function styleFor(tile) {
  const s = tile.s || '';
  const base = SURFACE_STYLE[s] || SURFACE_STYLE[''];
  const accent = s && SURFACES[s].c ? tint(s, tile.p) : null;
  const style = {
    road: base.road,
    line: base.line,
    railA: s === 'moto' || !accent ? PALETTE.railA : accent,
    railB: s === 'ice' ? '#ffffff' : s === 'bounce' ? '#fff0fb' : PALETTE.railB,
    accent: accent || PALETTE.boost,
    pal: null,
  };
  // Plaque bateau : de l'eau (entrée, un peu plus bas) au sol (sortie) : la couleur de la chaussée passe du bleu de l'eau au gris de la cale.
  if (s === 'boat') style.roadFn = (i, n) => mixHex('#2a79bd', i % 2 ? base.road[1] : base.road[0], smoothStep(Math.min(1, (i + 0.5) / Math.max(1, n * 0.6))));
  // Thème : remplace l'asphalte (et les bordures d'origine) ; un revêtement de jeu garde sa propre chaussée pour rester lisible.
  const th = THEME_STYLE[tile.th | 0];
  if (th) {
    if (base.road[0] === PALETTE.asphalt) { style.road = th.road; style.line = th.line; }
    if (!accent || s === 'boost' || s === 'moto') { style.railA = th.railA; style.railB = th.railB; }
    style.pal = th.pal;
  }
  // Couleurs personnalisées (Inspecteur › Couleurs) : prennent le pas sur tout le reste.
  const c = tile.col;
  if (c) {
    if (c.road) style.road = [c.road, mix(c.road, 0.07)];
    if (c.line) style.line = c.line;
    if (c.rail) { style.railA = c.rail; style.railB = mix(c.rail, 0.55); }
  }
  return style;
}
export { styleFor };

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
// Sans bordures : une simple dalle.
const PROFILE_NB = [
  { d: -ROAD_HALF, h: -SLAB_T, k: 'slab' },
  { d: -ROAD_HALF, h: 0, k: 'edge' },
  { d: -ROAD_HALF + 0.7, h: 0, k: 'road' },
  { d: -0.2, h: 0, k: 'dash' },
  { d: 0.2, h: 0, k: 'road' },
  { d: ROAD_HALF - 0.7, h: 0, k: 'edge' },
  { d: ROAD_HALF, h: 0, k: 'slab' },
  { d: ROAD_HALF, h: -SLAB_T, k: 'under' },
];

// ---- Bandes de route : suites de repères {p, r (droite), u (haut)} ----------
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

// Ligne droite à profil vertical (pente, entrée / sortie douce, S) : n tronçons d'altitude base + rise · H(t) (voir V_PROFILES).
function profileStrip(p, base, n) {
  const half = p.size * HALF, rise = p.rise * LEVEL_H, fr = [];
  for (let i = 0; i <= n; i++) { const t = i / n; fr.push(flatFrame(0, base + rise * profH(p, t), half - 2 * half * t, 0, -1)); }
  return fr;
}

const FL = {};
function ribbonStrip(tile, count) {
  const rib = ribbonOf(tile, true);
  const out = [];
  for (let i = 0; i <= count; i++) {
    frameLocal(rib, i / count, FL);
    out.push({ p: [FL.px, FL.py, FL.pz], r: [FL.rx, FL.ry, FL.rz], u: [FL.nx, FL.ny, FL.nz] });
  }
  out.rib = true;   // parcourue dans le sens du ruban (u croissant)
  return out;
}

// Plaque bateau : bande rééchantillonnée (12 tronçons au moins) dont l'altitude descend de boatDrop(along) sous la route.
function boatRamp(strip, tile) {
  const p = PIECES[tile.t];
  let fr = strip;
  if (p.kind === 'line' && strip.length < 13) fr = profileStrip(p, baseY(tile), 12);
  const n = fr.length - 1;
  return fr.map((f, i) => ({ ...f, p: [f.p[0], f.p[1] - boatDrop(i / n), f.p[2]] }));
}

// Liste des bandes de route d'une pièce (coordonnées locales).
export function stripsFor(tile) {
  const p = PIECES[tile.t];
  const base = baseY(tile);
  if (p.kind === 'loop' && !tile.o) {
    const m = p.mirror, half = p.size * HALF;
    return [
      lineStrip(-m * p.lane, half, 0, base, base, 3),
      ribbonStrip(tile, 56 * p.turns),
      lineStrip(m * p.lane, 0, -half, base, base, 3),
    ];
  }
  if (p.kind === 'ribbon' || isOriented(tile)) {
    // Ruban (transition, vrille, tube…) ou ligne / virage posé sur un mur : la bande suit la chaussée roulée.
    return [ribbonStrip(tile, Math.max(8, Math.round(ribbonOf(tile, true).len / 2.5)))];
  }
  if (p.kind === 'arc') {
    // Arc de cercle ; un virage incliné monte (ou descend) régulièrement sur le quart de tour (rampe hélicoïdale, chaussée horizontale en travers).
    const a = arcParams(p);
    const n = (p.size === 1 ? 8 : 8 * p.size) * (Math.abs(p.rise) > 1 ? 2 : 1);
    const fr = [], mir = p.mirror < 0 ? -1 : 1;
    for (let i = 0; i <= n; i++) {
      const ang = Math.PI + (Math.PI / 2) * (i / n);
      fr.push(flatFrame(mir * (a.cx + a.R * Math.cos(ang)), base + p.rise * LEVEL_H * (i / n), a.cz + a.R * Math.sin(ang), -mir * Math.sin(ang), Math.cos(ang)));
    }
    return [fr];
  }
  if (p.kind === 'sbend') {
    // Chicane : les deux arcs du S, 4 tronçons par case de longueur.
    const n = 8 * p.size, fr = [], q = {};
    for (let i = 0; i <= n; i++) { sbendPoint(p, i / n, q); fr.push(flatFrame(q.x, base, q.z, q.tx, q.tz)); }
    return [fr];
  }
  if (p.hw) {
    // 0.9.70 : route de largeur variable : chaque repère porte sa demi-largeur (hw), que le profil en travers suit (voir sweep).
    const n = 4 * p.size, fr = lineStrip(0, p.size * HALF, -p.size * HALF, base, base, n);
    fr.forEach((f, i) => { f.hw = roadHalf(p, i / n); });
    return [fr];
  }
  // Ligne droite : profil vertical droit (4 tronçons) ou courbe (12 tronçons pour que le raccord reste lisse).
  return [profOf(p) === 'l' ? lineStrip(0, p.size * HALF, -p.size * HALF, base, base + p.rise * LEVEL_H, 4) : profileStrip(p, base, 12)];
}

const at = (f, d, h) => [
  f.p[0] + f.r[0] * d + f.u[0] * h,
  f.p[1] + f.r[1] * d + f.u[1] * h,
  f.p[2] + f.r[2] * d + f.u[2] * h,
];

function sweep(gb, frames, style, nb, drop = 0) {
  const prof = nb ? PROFILE_NB : PROFILE;
  if (drop) frames = frames.map((f) => ({ ...f, p: [f.p[0] - f.u[0] * drop, f.p[1] - f.u[1] * drop, f.p[2] - f.u[2] * drop] }));
  const n = frames.length - 1;
  // (0.9.70 : repère à demi-largeur propre : tout ce qui est au bord de la chaussée (lignes, bordures, dalle) est décalé de hw − 12 ; le tiret central reste)
  const rings = frames.map((f) => prof.map((q) => at(f, f.hw == null || Math.abs(q.d) < 1 ? q.d : q.d + Math.sign(q.d) * (f.hw - ROAD_HALF), q.h)));
  const m = prof.length;
  for (let i = 0; i < n; i++) {
    const A = rings[i], B = rings[i + 1];
    for (let j = 0; j < m; j++) {
      const j2 = (j + 1) % m;
      let col;
      switch (prof[j].k) {
        case 'rail': col = i % 2 ? style.railA : style.railB; break;
        case 'road': col = style.roadFn ? style.roadFn(i, n) : style.road[i % 2]; break;
        case 'line': col = style.line; break;
        case 'edge': col = i % 2 ? style.railA : style.railB; break;
        case 'dash': col = i % 2 ? (style.roadFn ? style.roadFn(i, n) : style.road[i % 2]) : style.line; break;
        default: col = (style.pal && style.pal[prof[j].k]) || PALETTE[prof[j].k];
      }
      gb.quad(A[j], A[j2], B[j2], B[j], col);
    }
  }
  // Faces d'extrémité.
  const rects = nb
    ? [[-ROAD_HALF, ROAD_HALF, -SLAB_T, 0]]
    : [[-RO, -ROAD_HALF, -SLAB_T, RAIL_H], [-ROAD_HALF, ROAD_HALF, -SLAB_T, 0], [ROAD_HALF, RO, -SLAB_T, RAIL_H]];
  for (const start of [true, false]) {
    const f = frames[start ? 0 : n], dw = f.hw == null ? 0 : f.hw - ROAD_HALF;      // (0.9.70 : route de largeur variable)
    for (const [e0, e1, h0, h1] of rects) {
      const d0 = e0 + Math.sign(e0) * dw, d1 = e1 + Math.sign(e1) * dw;
      const a = at(f, d0, h0), b = at(f, d1, h0), c = at(f, d1, h1), d = at(f, d0, h1);
      const slab = (style.pal && style.pal.slab) || PALETTE.slab;
      if (start) gb.quad(a, b, c, d, slab);
      else gb.quad(b, a, d, c, slab);
    }
  }
}

// ---- Revêtements animés ------------------------------------------------------
// Une nappe posée juste au-dessus de la chaussée ; le shader l'anime (eau qui ondule,
// tapis qui défile dans le sens de sa poussée, verre qui scintille, neige qui pétille).
const FX_KIND = { water: 0, conveyor: 1, glass: 2, powder: 3 };
const _S = {};
function fxLayer(fx, frames, tile, kind, half = ROAD_HALF) {
  const n = frames.length - 1;
  const lift = kind === 0 ? -WATER_DROP + 0.02 : 0.03;
  let speed = 0, sgn = 1;
  if (kind === 1) {
    speed = beltSpeed(tileParam(tile));
    if (!frames.rib) {
      // Même sens que la physique (gradient latéral de la pièce, tourné d'un quart de tour).
      const f = frames[Math.floor(n / 2)], g = frames[Math.floor(n / 2) + 1];
      sampleLocal(tile, f.p[0], f.p[2], _S);
      sgn = (g.p[0] - f.p[0]) * _S.gz + (g.p[2] - f.p[2]) * -_S.gx >= 0 ? 1 : -1;
    }
  }
  const D = [-half, -half / 2, 0, half / 2, half];
  let s0 = 0;
  for (let i = 0; i < n; i++) {
    const A = frames[i], B = frames[i + 1];
    const s1 = s0 + Math.hypot(B.p[0] - A.p[0], B.p[1] - A.p[1], B.p[2] - A.p[2]);
    const ka = A.hw != null ? A.hw / half : 1, kb = B.hw != null ? B.hw / half : 1;      // (0.9.70 : route de largeur variable)
    for (let j = 0; j < D.length - 1; j++) {
      const d0 = D[j], d1 = D[j + 1];
      fx.fxQuad(at(A, d0 * ka, lift), at(A, d1 * ka, lift), at(B, d1 * kb, lift), at(B, d0 * kb, lift),
        [kind, s0 * sgn, speed, d0], [kind, s0 * sgn, speed, d1], [kind, s1 * sgn, speed, d1], [kind, s1 * sgn, speed, d0], '#ffffff');
    }
    s0 = s1;
  }
}

// Tunnel : arche autour de la route, avec nervures et lumières au plafond.
function tunnel(gb, glow, frames) {
  const K = 12;
  const rings = frames.map((f) => {
    const out = [];
    for (let i = 0; i <= K; i++) {
      const th = (Math.PI * i) / K;
      out.push(at(f, TUNNEL_R * Math.cos(th), TUNNEL_R * Math.sin(th)));
    }
    return out;
  });
  const n = frames.length - 1;
  for (let i = 0; i < n; i++) {
    const rib = i % 2 === 0;
    for (let j = 0; j < K; j++) {
      gb.quad(rings[i][j], rings[i][j + 1], rings[i + 1][j + 1], rings[i + 1][j], rib ? PALETTE.tunnelRib : PALETTE.tunnel);
    }
    // Bandes lumineuses (plafond et épaules).
    for (const j of [2, 6, 10]) {
      const a = rings[i][j], b = rings[i][j + 1], c = rings[i + 1][j + 1], d = rings[i + 1][j];
      const s = j === 6 ? '#ffe9a8' : '#7fe9ff';
      if (i % 2 === 1) glow.quad(a, b, c, d, s);
    }
  }
}

// ---- Décalques lumineux des revêtements --------------------------------------
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

// Chevron centré en (cx, cy) (d, avance), pointant dans la direction rot (0 = avant).
function chevron(glow, f, cx, cy, w, t, depth, rot, color) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (x, y) => onFrame(f, cx + x * c - y * s, cy + x * s + y * c);
  const tip = depth / 2, back = -depth / 2;
  glow.quad(P(-w, back), P(-w + t, back), P(0, tip - t), P(0, tip), color);
  glow.quad(P(0, tip), P(0, tip - t), P(w - t, back), P(w, back), color);
}

function ring(glow, f, cx, cy, r, t, color) {
  const P = [[0, r], [r, 0], [0, -r], [-r, 0]];
  const Q = [[0, r - t], [r - t, 0], [0, -r + t], [-r + t, 0]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    glow.quad(onFrame(f, cx + P[i][0], cy + P[i][1]), onFrame(f, cx + P[j][0], cy + P[j][1]), onFrame(f, cx + Q[j][0], cy + Q[j][1]), onFrame(f, cx + Q[i][0], cy + Q[i][1]), color);
  }
}

function bar(glow, f, d0, a0, d1, a1, color) {
  glow.quad(onFrame(f, d0, a0), onFrame(f, d1, a0), onFrame(f, d1, a1), onFrame(f, d0, a1), color);
}

function surfaceDecals(glow, frames, tile, area = false) {
  const s = tile.s, p = tile.p;
  const col = tint(s, p);
  const long = frames.length > 10;
  const centers = area ? [0.5] : long ? [0.15, 0.38, 0.62, 0.85] : [0.2, 0.5, 0.8];
  if (s === 'boost') {
    for (const t of centers) chevron(glow, frameAt(frames, t), 0, 0, 5.8, 1.6, 3.4, 0, col);
  } else if (s === 'bounce') {
    const f = frameAt(frames, 0.5);
    ring(glow, f, 0, 0, 6.6, 0.7, col);
    ring(glow, f, 0, 0, 4.0, 0.6, col);
  } else if (s === 'magnet') {
    const n = long ? 8 : 5;
    for (let i = 0; i < n; i++) bar(glow, frameAt(frames, (i + 0.5) / n), -ROAD_HALF + 1.3, -0.25, ROAD_HALF - 1.3, 0.25, col);
  } else if (s === 'gravity') {
    const up = (p || SURFACES.gravity.def) < 100;
    for (const t of centers) {
      const f = frameAt(frames, t);
      for (const d of [-4.5, 0, 4.5]) chevron(glow, f, d, 0, 1.8, 0.6, 2.2, up ? 0 : Math.PI, col);
    }
  } else if (s === 'wind') {
    const dirR = (p || SURFACES.wind.def) >= 100 ? 1 : -1;
    for (const t of centers) {
      const f = frameAt(frames, t);
      for (const a of [-3.5, 0, 3.5]) chevron(glow, f, 0, a, 1.7, 0.6, 2.4, dirR > 0 ? -Math.PI / 2 : Math.PI / 2, col);
    }
  } else if (s === 'slow') {
    const n = long ? 9 : 5;
    for (let i = 0; i < n; i++) {
      const f = frameAt(frames, (i + 0.5) / n);
      bar(glow, f, -ROAD_HALF + 1, -0.35, ROAD_HALF - 1, 0.35, i % 2 ? '#ffd23e' : col);
    }
  } else if (s === 'drift') {
    for (const t of centers) {
      const f = frameAt(frames, t);
      chevron(glow, f, -3.5, 0, 1.6, 0.5, 2.6, 0.55, col);
      chevron(glow, f, 3.5, 0, 1.6, 0.5, 2.6, -0.55, col);
    }
  } else if (s === 'moto') {
    const f = frameAt(frames, 0.5);
    ring(glow, f, 0, -3.4, 2.1, 0.6, col);
    ring(glow, f, 0, 3.4, 2.1, 0.6, col);
    bar(glow, f, -0.35, -3.4, 0.35, 3.4, col);
    bar(glow, f, -2.2, 2.9, 2.2, 3.5, col);
    bar(glow, f, -1.2, -0.9, 1.2, 0.2, col);
  } else if (s === 'water') {
    // L'eau est animée (couche à effets) : rien à ajouter.
  } else if (s === 'conveyor') {
    // Bandes de sécurité jaunes et noires le long des bords.
    const n = long ? 16 : 8;
    for (let i = 0; i < n; i++) {
      const f = frameAt(frames, (i + 0.5) / n), c = i % 2 ? '#1a1a1a' : col;
      bar(glow, f, -ROAD_HALF + 0.2, -1.2, -ROAD_HALF + 1.0, 1.2, c);
      bar(glow, f, ROAD_HALF - 1.0, -1.2, ROAD_HALF - 0.2, 1.2, c);
    }
  } else if (s === 'spring') {
    // Ressort (zigzag) et grosse flèche du côté de la poussée.
    const dir = (p || SURFACES.spring.def) >= 100 ? 1 : -1;
    const f = frameAt(frames, 0.5);
    for (let k = 0; k < 4; k++) {
      const d0 = -dir * 6 + dir * k * 1.6;
      glow.quad(onFrame(f, d0, -2), onFrame(f, d0 + dir * 0.5, -2), onFrame(f, d0 + dir * 1.3, 2), onFrame(f, d0 + dir * 0.8, 2), col);
      glow.quad(onFrame(f, d0 + dir * 0.8, 2), onFrame(f, d0 + dir * 1.3, 2), onFrame(f, d0 + dir * 2.1, -2), onFrame(f, d0 + dir * 1.6, -2), col);
    }
    chevron(glow, f, dir * 4.4, 0, 2.6, 0.8, 3.0, -dir * Math.PI / 2, col);
    chevron(glow, f, dir * 6.6, 0, 2.6, 0.8, 3.0, -dir * Math.PI / 2, col);
  } else if (s === 'glass') {
    // Fissures en étoile.
    for (const t of area ? [0.5] : long ? [0.3, 0.7] : [0.5]) {
      const f = frameAt(frames, t);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + 0.4 * Math.sin(k * 2.3), len = 3 + 3 * ((k * 37) % 5) / 5;
        const ca = Math.cos(a), sa = Math.sin(a), w = 0.09;
        const mx = ca * len * 0.5 + sa * 0.6 * (k % 2 ? 1 : -1), mz = sa * len * 0.5 - ca * 0.6 * (k % 2 ? 1 : -1);
        glow.quad(onFrame(f, -sa * w, ca * w, 0.06), onFrame(f, sa * w, -ca * w, 0.06), onFrame(f, mx + sa * w, mz - ca * w, 0.06), onFrame(f, mx - sa * w, mz + ca * w, 0.06), '#ffffff');
        glow.quad(onFrame(f, mx - sa * w, mz + ca * w, 0.06), onFrame(f, mx + sa * w, mz - ca * w, 0.06), onFrame(f, ca * len + sa * w, sa * len - ca * w, 0.06), onFrame(f, ca * len - sa * w, sa * len + ca * w, 0.06), '#ffffff');
      }
      ring(glow, f, 0, 0, 1.2, 0.25, '#ffffff');
    }
  } else if (s === 'powder') {
    // Congères sur les bords.
    const n = long ? 10 : 5;
    for (let i = 0; i < n; i++) {
      const f = frameAt(frames, (i + 0.5) / n);
      for (const sg of [-1, 1]) chevron(glow, f, sg * (ROAD_HALF - 1.6), 0, 1.4, 0.5, 1.6, sg * Math.PI / 2, '#ffffff');
    }
  } else if (s === 'reverse') {
    // Flèches qui se croisent : gauche et droite échangées.
    for (const t of centers) {
      const f = frameAt(frames, t);
      chevron(glow, f, -2.5, -1.4, 1.6, 0.55, 2.4, Math.PI / 2, col);
      chevron(glow, f, 2.5, 1.4, 1.6, 0.55, 2.4, -Math.PI / 2, col);
      bar(glow, f, -4.2, -1.65, 1.5, -1.15, col);
      bar(glow, f, -1.5, 1.15, 4.2, 1.65, col);
    }
  } else if (s === 'cut') {
    // Symbole marche / arrêt barré.
    for (const t of area ? [0.5] : [0.3, 0.7]) {
      const f = frameAt(frames, t);
      ring(glow, f, 0, 0, 3.4, 0.6, col);
      bar(glow, f, -0.35, -0.4, 0.35, 3.8, col);
      glow.quad(onFrame(f, -4, -3.4), onFrame(f, -3.2, -4), onFrame(f, 4, 3.4), onFrame(f, 3.2, 4), col);
    }
  } else if (s === 'boat') {
    // Cale de mise à l'eau : stries en travers (de plus en plus espacées vers le sol), puis coque et vague.
    for (let i = 0; i < 7; i++) {
      const g = frameAt(frames, 0.04 + 0.13 * i);
      bar(glow, g, -ROAD_HALF + 1.2, -0.14, ROAD_HALF - 1.2, 0.14, i < 3 ? '#8fd4f2' : '#aebfca');
    }
    const f = frameAt(frames, 0.5);
    bar(glow, f, -2.6, -3.2, 2.6, -2.6, col);
    chevron(glow, f, 0, -4.2, 2.6, 0.6, 2.0, 0, col);
    bar(glow, f, -0.3, -2.6, 0.3, 1.6, col);
    chevron(glow, f, -2.2, 3.4, 1.4, 0.5, 1.1, Math.PI / 2, col);
    chevron(glow, f, 2.2, 3.4, 1.4, 0.5, 1.1, Math.PI / 2, col);
  } else if (s === 'flip') {
    // Deux flèches opposées autour d'une barre : haut et bas s'échangent.
    for (const t of area ? [0.5] : [0.25, 0.75]) {
      const f = frameAt(frames, t);
      bar(glow, f, -ROAD_HALF + 1.5, -0.3, ROAD_HALF - 1.5, 0.3, col);
      for (const d of [-5, 0, 5]) {
        chevron(glow, f, d, -2.2, 1.6, 0.55, 1.8, 0, col);
        chevron(glow, f, d, 2.2, 1.6, 0.55, 1.8, Math.PI, col);
      }
    }
  } else if (s === 'glider') {
    // Aile delta
    const f = frameAt(frames, 0.5);
    chevron(glow, f, 0, 0, 6.2, 0.8, 3.6, 0, col);
    bar(glow, f, -0.3, -1.6, 0.3, 3.0, col);
    bar(glow, f, -1.8, 2.6, 1.8, 3.1, col);
  } else if (s === 'ice') {
    // Cristaux de givre.
    const n = long ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const f = frameAt(frames, (i + 0.5) / n);
      for (const d of [-4.5, 0, 4.5]) {
        const dd = d + (i % 2 ? 1.5 : -1.5);
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI, ca = Math.cos(a) * 1.4, sa = Math.sin(a) * 1.4, w = 0.12;
          glow.quad(onFrame(f, dd - ca - sa * w, -sa + ca * w), onFrame(f, dd - ca + sa * w, -sa - ca * w), onFrame(f, dd + ca + sa * w, sa - ca * w), onFrame(f, dd + ca - sa * w, sa + ca * w), '#ffffff');
        }
      }
    }
  }
}

function platform(gb, glow, tile, fx = null) {
  const P = PIECES[tile.t];
  if (P.size > 1 || P.shape || tile.eb) { plate(gb, glow, tile, fx); return; }      // 0.9.69 : plaques (la plateforme 1×1 sans bordure garde sa géométrie d'avant)
  const y = baseY(tile);
  const y0 = y - SLAB_T;
  const s = tile.s || '';
  const st = SURFACE_STYLE[s];
  const sty = tile.col || tile.th ? styleFor(tile) : null;          // thème / couleurs personnalisées
  const top = s ? st.road : sty ? sty.road : [PALETTE.platA, PALETTE.platB];
  gb.box(-HALF, y0, -HALF, HALF, y - 0.001, HALF, (sty && sty.pal && sty.pal.slab) || PALETTE.slab, [null, null, top[0], (sty && sty.pal && sty.pal.under) || PALETTE.under]);
  const n = 4, w = CELL / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x0 = -HALF + i * w, z0 = -HALF + j * w;
      gb.quad([x0, y, z0 + w], [x0 + w, y, z0 + w], [x0 + w, y, z0], [x0, y, z0], top[(i + j) % 2]);
    }
  }
  const e = 0.4;
  const edge = s || sty ? styleFor(tile).railA : PALETTE.platEdge;
  for (const [x0, z0, x1, z1] of [[-HALF, -HALF, HALF, -HALF + e], [-HALF, HALF - e, HALF, HALF], [-HALF, -HALF, -HALF + e, HALF], [HALF - e, -HALF, HALF, HALF]]) {
    gb.quad([x0, y + 0.02, z1], [x1, y + 0.02, z1], [x1, y + 0.02, z0], [x0, y + 0.02, z0], edge);
  }
  if (fx && FX_KIND[s] !== undefined) fxLayer(fx, lineStrip(0, HALF, -HALF, y, y, 4), tile, FX_KIND[s], HALF - e);
  if (s) surfaceDecals(glow, lineStrip(0, HALF, -HALF, y, y, 4), tile, true);
}

// 0.9.69 : plaque de taille et de forme quelconques (carré, triangle, quart de disque : pieces.js plateShape), et ses bordures (option eb).
// Le contour est un polygone (pieces.js : plateOutline) ; le dessus est un damier de cases de 8 m découpé au contour.
function plate(gb, glow, tile, fx) {
  const P = PIECES[tile.t], y = baseY(tile), y0 = y - SLAB_T, h = P.size * HALF;
  const s = tile.s || '';
  const sty = tile.col || tile.th ? styleFor(tile) : null;
  const top = s ? SURFACE_STYLE[s].road : sty ? sty.road : [PALETTE.platA, PALETTE.platB];
  const side = (sty && sty.pal && sty.pal.slab) || PALETTE.slab, under = (sty && sty.pal && sty.pal.under) || PALETTE.under;
  const poly = plateOutline(P), n = poly.length;
  // Dessus : cases du damier (8 m) découpées au contour (Sutherland-Hodgman, polygone convexe).
  const w = CELL / 4, m = P.size * 4;
  const clip = (cell) => {
    let out = cell;
    for (let i = 0; i < n && out.length; i++) {
      const a = poly[i], b = poly[(i + 1) % n], inside = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-9;
      const src = out; out = [];
      for (let k = 0; k < src.length; k++) {
        const p = src[k], q = src[(k + 1) % src.length], ip = inside(p), iq = inside(q);
        if (ip) out.push(p);
        if (ip !== iq) {
          const d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]), d2 = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]), t = d1 / (d1 - d2);
          out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        }
      }
    }
    return out;
  };
  // (le contour doit tourner dans le sens où « inside » est à gauche : on le vérifie par son aire)
  let area = 0;
  for (let i = 0; i < n; i++) area += poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1];
  if (area < 0) poly.reverse();
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
    const x0 = -h + i * w, z0 = -h + j * w;
    const c = clip([[x0, z0], [x0 + w, z0], [x0 + w, z0 + w], [x0, z0 + w]]);
    for (let k = 1; k + 1 < c.length; k++) gb.tri([c[0][0], y, c[0][1]], [c[k + 1][0], y, c[k + 1][1]], [c[k][0], y, c[k][1]], top[(i + j) % 2]);
  }
  // Tranche et dessous.
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    gb.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y - 0.001, b[1]], [a[0], y - 0.001, a[1]], side);
  }
  for (let k = 1; k + 1 < n; k++) gb.tri([poly[0][0], y0, poly[0][1]], [poly[k][0], y0, poly[k][1]], [poly[k + 1][0], y0, poly[k + 1][1]], under);
  // Bordures choisies : un muret de RAIL_W × RAIL_H à l'intérieur du bord, rayé comme les bordures de route ; liseré sur les autres bords.
  const style = styleFor(tile), edges = plateEdges(P);
  edges.forEach((e, bit) => {
    const on = !!(tile.eb & (1 << bit));
    const pts = [];
    if (e.t === 'seg') { const k = Math.max(2, Math.round(e.len / 4)); for (let i = 0; i <= k; i++) pts.push([e.ax + (e.bx - e.ax) * (i / k), e.az + (e.bz - e.az) * (i / k), e.nx, e.nz]); }
    else { const k = 8 * P.size; for (let i = 0; i <= k; i++) { const a = (Math.PI / 2) * (i / k), c = Math.cos(a), sn = Math.sin(a); pts.push([e.cx + e.R * c, e.cz - e.R * sn, -c, sn]); } }
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az, anx, anz] = pts[i], [bx, bz, bnx, bnz] = pts[i + 1];
      const iw = on ? RAIL_W : 0.4;
      const A = [ax, az], B = [bx, bz], A2 = [ax + anx * iw, az + anz * iw], B2 = [bx + bnx * iw, bz + bnz * iw];
      if (!on) { gb.quad([A[0], y + 0.02, A[1]], [B[0], y + 0.02, B[1]], [B2[0], y + 0.02, B2[1]], [A2[0], y + 0.02, A2[1]], s || sty ? style.railA : PALETTE.platEdge); continue; }
      const col = i % 2 ? style.railA : style.railB, yt = y + RAIL_H;
      gb.quad([A[0], yt, A[1]], [B[0], yt, B[1]], [B2[0], yt, B2[1]], [A2[0], yt, A2[1]], col);
      gb.quad([A[0], y, A[1]], [B[0], y, B[1]], [B[0], yt, B[1]], [A[0], yt, A[1]], col);
      gb.quad([A2[0], yt, A2[1]], [B2[0], yt, B2[1]], [B2[0], y, B2[1]], [A2[0], y, A2[1]], col);
    }
  });
  const sq = plateShape(P) === 'sq';
  if (fx && FX_KIND[s] !== undefined && sq) fxLayer(fx, lineStrip(0, h, -h, y, y, 4 * P.size), tile, FX_KIND[s], h - 0.4);
  if (s) { const c = areaCentroid(P); surfaceDecals(glow, lineStrip(c.x, c.z + HALF * 0.6, c.z - HALF * 0.6, y, y, 4), tile, true); }
}

// 0.9.71 : carrefour : la chaussée est l'union du carré central et des bras (pieces.js : junctionRects) ; les bordures suivent tout le contour (côté d'un bras,
// ou côté du carré central quand le bras manque), avec un dé à l'angle entre deux bras (la bande de bordure de la physique y est un angle droit plein).
const JDIR = { N: [0, -1, 1, 0], S: [0, 1, -1, 0], E: [1, 0, 0, 1], W: [-1, 0, 0, -1] };      // normale sortante (nx, nz), tangente (tx, tz)
function junctionMesh(gb, glow, tile, style) {
  const P = PIECES[tile.t], y = baseY(tile), y0 = y - SLAB_T, rails = !hasNoRails(tile), W = ROAD_HALF;
  const slab = (style.pal && style.pal.slab) || PALETTE.slab, under = (style.pal && style.pal.under) || PALETTE.under;
  const rects = junctionRects(P);
  rects.forEach(([x0, z0, x1, z1], i) => {
    gb.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], style.road[i % 2 ? 1 : 0]);
    gb.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], under);
  });
  // Marquages : tirets au milieu de chaque bras, ligne d'arrêt pointillée à l'entrée du carré central.
  for (const a of P.arms) {
    const [nx, nz, tx, tz] = JDIR[a];
    for (let k = 0; k < 2; k++) {
      const s0 = W + 0.6 + k * 1.8, s1 = s0 + 1.0, P0 = [nx * s0, nz * s0], P1 = [nx * s1, nz * s1];
      gb.quad([P0[0] - tx * 0.2, y + 0.02, P0[1] - tz * 0.2], [P0[0] + tx * 0.2, y + 0.02, P0[1] + tz * 0.2], [P1[0] + tx * 0.2, y + 0.02, P1[1] + tz * 0.2], [P1[0] - tx * 0.2, y + 0.02, P1[1] - tz * 0.2], style.line);
    }
    for (let k = -5; k <= 4; k += 2) {
      const a0 = k * 2.2 + 0.5, a1 = a0 + 1.6, c = W - 0.4;
      const A = [nx * c + tx * a0, nz * c + tz * a0], B = [nx * c + tx * a1, nz * c + tz * a1], C2 = [nx * (c + 0.5) + tx * a1, nz * (c + 0.5) + tz * a1], D = [nx * (c + 0.5) + tx * a0, nz * (c + 0.5) + tz * a0];
      gb.quad([A[0], y + 0.02, A[1]], [B[0], y + 0.02, B[1]], [C2[0], y + 0.02, C2[1]], [D[0], y + 0.02, D[1]], style.line);
    }
  }
  // Contour : segments (A → B) et normale sortante m de la bordure posée dessus.
  const segs = [];
  for (const d of ['N', 'E', 'S', 'W']) {
    const [nx, nz, tx, tz] = JDIR[d];
    if (P.arms.includes(d)) for (const s of [-1, 1]) segs.push([[nx * W + s * tx * W, nz * W + s * tz * W], [nx * HALF + s * tx * W, nz * HALF + s * tz * W], [s * tx, s * tz]]);
    else segs.push([[nx * W - tx * W, nz * W - tz * W], [nx * W + tx * W, nz * W + tz * W], [nx, nz]]);
  }
  for (const [A, B, m] of segs) {
    const h = rails ? RAIL_H : 0, o = rails ? RAIL_W : 0;
    const A2 = [A[0] + m[0] * o, A[1] + m[1] * o], B2 = [B[0] + m[0] * o, B[1] + m[1] * o];
    if (rails) {
      const n = Math.max(1, Math.round(Math.hypot(B[0] - A[0], B[1] - A[1]) / 4));
      for (let i = 0; i < n; i++) {
        const u0 = i / n, u1 = (i + 1) / n, L = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
        const a = L(A, B, u0), b = L(A, B, u1), a2 = L(A2, B2, u0), b2 = L(A2, B2, u1), col = i % 2 ? style.railA : style.railB;
        gb.quad([a[0], y + h, a[1]], [b[0], y + h, b[1]], [b2[0], y + h, b2[1]], [a2[0], y + h, a2[1]], col);
        gb.quad([a[0], y, a[1]], [b[0], y, b[1]], [b[0], y + h, b[1]], [a[0], y + h, a[1]], col);
      }
      gb.quad([A2[0], y0, A2[1]], [B2[0], y0, B2[1]], [B2[0], y + h, B2[1]], [A2[0], y + h, A2[1]], slab);
      gb.quad([A[0], y0, A[1]], [A2[0], y0, A2[1]], [B2[0], y0, B2[1]], [B[0], y0, B[1]], under);
    } else gb.quad([A[0], y0, A[1]], [B[0], y0, B[1]], [B[0], y, B[1]], [A[0], y, A[1]], slab);
  }
  // Dés aux angles entre deux bras voisins.
  if (rails) for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const ax = sx > 0 ? 'E' : 'W', az = sz > 0 ? 'S' : 'N';
    if (!(P.arms.includes(ax) && P.arms.includes(az))) continue;
    const x0 = sx * W, z0 = sz * W, x1 = sx * (W + RAIL_W), z1 = sz * (W + RAIL_W);
    gb.box(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y + RAIL_H, Math.max(z0, z1), style.railA);
  }
}

// Portique (départ / checkpoint / arrivée).
// Portique de départ, d'arrivée ou de checkpoint. 0.9.68 : quatre styles (option gs, visuelle) : 0 portique (poteaux et traverse), 1 ligne au sol
// (deux balises basses), 2 arche (demi-cercle), 3 pylônes (deux hauts mâts lumineux, sans traverse). Le marquage au sol est le même pour tous.
function gate(gb, glow, tile) {
  const sp = cpKind(tile) ? 'checkpoint' : PIECES[tile.t].special;
  const y = baseY(tile);
  const color = PALETTE[sp];
  const px = RO + 0.75;
  const top = 6.6;
  const style = tile.gs | 0, rails = !hasNoRails(tile);
  if (style === 0) {
    for (const s of [-1, 1]) {
      gb.taper(s * px, 0, y - SLAB_T, y + top, 1.1, 1.1, 0.8, 0.8, color);
      if (rails) gb.box(s * px - 0.7, y + RAIL_H - 0.3, -0.7, s * px + 0.7, y + RAIL_H, 0.7, PALETTE.slab);
    }
  } else gateStyle(gb, glow, style, sp, color, y, px);
  if (style === 0) gateBeam(gb, glow, sp, color, y, px, top);
  gateLine(gb, sp, color, y);
}

// Variantes du portique (0.9.68).
function gateStyle(gb, glow, style, sp, color, y, px) {
  const chk = (i) => (i % 2 ? '#1e1f2b' : '#f7f2ea');
  const spike = (cx, cy, h, r) => {
    const tip = [cx, cy + h, 0], rg = [[cx - r, cy, 0], [cx, cy, -r], [cx + r, cy, 0], [cx, cy, r]];
    for (let i = 0; i < 4; i++) glow.tri(rg[i], rg[(i + 1) % 4], tip, color);
  };
  if (style === 1) {
    // Ligne au sol : deux balises basses de part et d'autre (rien au-dessus de la route).
    for (const s of [-1, 1]) {
      gb.taper(s * px, 0, y - SLAB_T, y + 1.8, 1.0, 1.0, 0.7, 0.7, sp === 'finish' ? chk(s > 0 ? 1 : 0) : color);
      spike(s * px, y + 1.8, 0.9, 0.45);
    }
  } else if (style === 2) {
    // Arche : deux piles jusqu'à 3 m puis un demi-cercle de rayon px (épaisseur 1,2 m, profondeur 1 m), bande lumineuse sur la face avant.
    const R = px, cy = y + 3, n = 16, ri = R - 0.6, ro = R + 0.6, d = 0.5;
    for (const s of [-1, 1]) gb.box(s * R - 0.6, y - SLAB_T, -d, s * R + 0.6, cy, d, color);
    for (let i = 0; i < n; i++) {
      const a0 = (Math.PI * i) / n, a1 = (Math.PI * (i + 1)) / n, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const P = (r, c, sn, z) => [r * c, cy + r * sn, z];
      const col = sp === 'finish' ? chk(i) : color;
      gb.quad(P(ri, c0, s0, d), P(ro, c0, s0, d), P(ro, c1, s1, d), P(ri, c1, s1, d), col);
      gb.quad(P(ri, c1, s1, -d), P(ro, c1, s1, -d), P(ro, c0, s0, -d), P(ri, c0, s0, -d), col);
      gb.quad(P(ro, c0, s0, d), P(ro, c0, s0, -d), P(ro, c1, s1, -d), P(ro, c1, s1, d), col);
      gb.quad(P(ri, c1, s1, d), P(ri, c1, s1, -d), P(ri, c0, s0, -d), P(ri, c0, s0, d), col);
      const g0 = R - 0.15, g1 = R + 0.15;
      glow.quad(P(g0, c0, s0, d + 0.06), P(g1, c0, s0, d + 0.06), P(g1, c1, s1, d + 0.06), P(g0, c1, s1, d + 0.06), color);
      glow.quad(P(g0, c1, s1, -d - 0.06), P(g1, c1, s1, -d - 0.06), P(g1, c0, s0, -d - 0.06), P(g0, c0, s0, -d - 0.06), color);
    }
  } else {
    // Pylônes : deux mâts de 12 m, une bande lumineuse sur la face intérieure, un fanion au sommet (damier pour l'arrivée).
    const H = 12;
    for (const s of [-1, 1]) {
      const x = s * px;
      gb.taper(x, 0, y - SLAB_T, y + H, 1.3, 1.3, 0.7, 0.7, PALETTE.slab);
      const xi = x - s * 0.62;
      glow.quad([xi, y + 1, 0.3], [xi, y + 1, -0.3], [xi, y + H - 0.5, -0.3], [xi, y + H - 0.5, 0.3], color);
      if (sp === 'finish') for (let i = 0; i < 4; i++) for (let r = 0; r < 2; r++) gb.box(x - s * (0.35 + i * 0.7) - 0.35, y + H - 1.4 + r * 0.7, -0.08, x - s * (0.35 + i * 0.7) + 0.35, y + H - 0.7 + r * 0.7, 0.08, chk(i + r));
      else glow.tri([x, y + H, 0], [x, y + H - 1.6, 0], [x - s * 2.6, y + H - 0.8, 0], color);
      spike(x, y + H, 1.2, 0.5);
    }
  }
}

// Traverse du portique classique (damier pour l'arrivée) et ses pointes lumineuses.
function gateBeam(gb, glow, sp, color, y, px, top) {
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
    const rg = [[cx - r, cy, 0], [cx, cy, -r], [cx + r, cy, 0], [cx, cy, r]];
    for (let i = 0; i < 4; i++) glow.tri(rg[i], rg[(i + 1) % 4], tip, color);
  }
}

// Marquage au sol : damier (arrivée), ligne blanche (départ), tirets de la couleur du checkpoint.
function gateLine(gb, sp, color, y) {
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

// Checkpoint posé sur une plateforme : quatre balises d'angle, un cadre lumineux au sol et un losange central. La plateforme
// n'a pas de sens de route : un portique n'aurait pas de sens ici, toute la dalle valide le checkpoint.
function checkpointPad(gb, glow, tile) {
  // 0.9.69 : sur une plaque triangulaire ou en quart de disque, la balise est centrée sur la plaque (centre de gravité) et rétrécie pour y tenir.
  const P = PIECES[tile.t], sh = plateShape(P), ctr = areaCentroid(P), h = P.size * HALF;
  const y = baseY(tile), color = PALETTE.checkpoint, c = Math.min(HALF - 1.6, sh === 'tri' ? 0.4 * h : sh === 'sec' ? 0.55 * h : HALF - 1.6), top = 5.2;
  const cx0 = ctr.x, cz0 = ctr.z;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = cx0 + sx * c, z = cz0 + sz * c, r = 0.5;
      gb.taper(x, z, y, y + top, 1.0, 1.0, 0.6, 0.6, color);
      const tip = [x, y + top + 1.4, z], rg = [[x - r, y + top, z], [x, y + top, z - r], [x + r, y + top, z], [x, y + top, z + r]];
      for (let i = 0; i < 4; i++) glow.tri(rg[i], rg[(i + 1) % 4], tip, color);
    }
  }
  const o = c, w = 0.7, ly = y + 0.05;
  for (const [x0, z0, x1, z1] of [[-o, -o, o, -o + w], [-o, o - w, o, o], [-o, -o, -o + w, o], [o - w, -o, o, o]]) {
    glow.quad([cx0 + x0, ly, cz0 + z1], [cx0 + x1, ly, cz0 + z1], [cx0 + x1, ly, cz0 + z0], [cx0 + x0, ly, cz0 + z0], color);
  }
  const f = { p: [cx0, y, cz0], r: [1, 0, 0], u: [0, 1, 0], t: [0, 0, -1] };
  ring(glow, f, 0, 0, 5.2, 0.7, color);
  ring(glow, f, 0, 0, 2.6, 0.55, color);
}

// Tours encadrant un looping.
function loopTowers(gb, glow, tile) {
  const P = PIECES[tile.t];
  const y = baseY(tile);
  const topY = y + P.R * 2 + 3;
  const span = P.size * HALF - 1.3;
  for (const s of [-1, 1]) {
    const x = s * span;
    gb.taper(x, 0, y - SLAB_T - (tile.l ? tile.l * LEVEL_H : 0), topY, 2.2, 2.2, 1.2, 1.2, PALETTE.loopTower);
    const r = 0.9, h = 2.6;
    const rg = [[x - r, topY, 0], [x, topY, -r], [x + r, topY, 0], [x, topY, r]];
    for (let i = 0; i < 4; i++) glow.tri(rg[i], rg[(i + 1) % 4], [x, topY + h, 0], s > 0 ? PALETTE.bounce : PALETTE.boost);
    glow.quad([x - 1.25, y + P.R, -0.2], [x + 1.25, y + P.R, -0.2], [x + 1.25, y + P.R + 0.5, -0.2], [x - 1.25, y + P.R + 0.5, -0.2], PALETTE.boost);
  }
}

// Points d'appui (coordonnées locales) des piliers.
function pillarPoints(tile) {
  const p = PIECES[tile.t];
  if (p.kind === 'arc') {
    const a = arcParams(p);
    const angs = p.size >= 2 ? [Math.PI + Math.PI / 6, Math.PI + Math.PI / 3] : [Math.PI * 1.25];
    const mir = p.mirror < 0 ? -1 : 1;
    return angs.map((ang) => [mir * (a.cx + a.R * Math.cos(ang)), a.cz + a.R * Math.sin(ang)]);
  }
  if (p.kind === 'loop') return [[-p.mirror * p.lane, p.size * HALF - 4], [p.mirror * p.lane, -p.size * HALF + 4]];
  if (p.kind === 'sbend') return [0.2, 0.5, 0.8].map((u) => { const q = sbendPoint(p, u); return [q.x, q.z]; });
  return [[0, 0]];
}

function pillarHeightAt(tile, lz, lx = 0) {
  const p = PIECES[tile.t];
  const base = baseY(tile);
  if (p.kind === 'arc') {
    // Courbe montante : l'altitude suit l'angle (voir sampleLocal).
    if (!p.rise) return base;
    const a = arcParams(p);
    const mx = p.mirror < 0 ? -lx : lx;
    return base + p.rise * LEVEL_H * ((Math.atan2(lz - a.cz, mx - a.cx) + Math.PI * 2) % (Math.PI * 2) - Math.PI) / (Math.PI / 2);
  }
  if (p.kind !== 'line') return base;
  const half = p.size * HALF;
  const t = (half - lz) / (2 * half);
  return base + p.rise * LEVEL_H * profH(p, t);
}

function tileMatrix(tile) {
  const c = tileCenter(tile);
  const m = new THREE.Matrix4().makeRotationY(-tile.r * Math.PI / 2);
  m.setPosition(c.x, 0, c.z);
  return m;
}

// ---- v1.5 : section courbe (tube) ---------------------------------
function crossSweep(gb, glow, tile, style) {
  const rib = ribbonOf(tile, true);
  const N = tile.t === 'tube' ? 48 : 20, M = 32;
  const F = {};
  const rings = [];
  for (let i = 0; i <= N; i++) {
    frameLocal(rib, i / N, F);
    const kc = F.kc, wrap = F.wrap;
    const hw = wrap ? Math.PI / kc : F.hw;
    const pts = [];
    for (let j = 0; j <= M; j++) {
      const d = -hw + (2 * hw * j) / M;
      let X = d, Y = 0, c = 1, sn = 0;
      if (kc > 1e-5) { const ph = kc * d; c = Math.cos(ph); sn = Math.sin(ph); X = sn / kc; Y = (1 - c) / kc; }
      const nx = F.nx * c - F.rx * sn, ny = F.ny * c - F.ry * sn, nz = F.nz * c - F.rz * sn;
      pts.push({
        p: [F.px + F.rx * X + F.nx * Y, F.py + F.ry * X + F.ny * Y, F.pz + F.rz * X + F.nz * Y],
        n: [nx, ny, nz], d, phi: kc * d,
      });
    }
    rings.push({ pts, wrap, hw });
  }
  const off = (q, k) => [q.p[0] + q.n[0] * k, q.p[1] + q.n[1] * k, q.p[2] + q.n[2] * k];
  for (let i = 0; i < N; i++) {
    const A = rings[i], B = rings[i + 1];
    const cage = A.wrap && B.wrap;
    for (let j = 0; j < M; j++) {
      const a = A.pts[j], b = A.pts[j + 1], c = B.pts[j + 1], d = B.pts[j];
      const phi = Math.abs((a.phi + b.phi) / 2);
      // Haut du tube en treillis pour voir la voiture de l'extérieur.
      if (cage && phi > 1.95 && i % 3 !== 0 && j % 4 !== 0) continue;
      const dm = Math.abs((a.d + b.d) / 2);
      let col = style.road[i % 2];
      if (Math.abs(dm - (ROAD_HALF - 0.8)) < 0.5) col = style.line;
      else if (dm < 0.3 && i % 2) col = style.line;
      else if (cage && phi > 1.95) col = i % 3 === 0 ? '#7fe9ff' : PALETTE.tunnelRib;
      else if (phi > 1.2) col = i % 2 ? PALETTE.tunnel : PALETTE.tunnelRib;
      gb.quad(a.p, b.p, c.p, d.p, col);
      // Dessous (épaisseur), sauf dans le treillis.
      if (!(cage && phi > 1.95)) gb.quad(off(b, -SLAB_T), off(a, -SLAB_T), off(d, -SLAB_T), off(c, -SLAB_T), PALETTE.under);
      if (cage && phi > 1.95 && i % 3 === 0 && j % 4 === 0) glow.quad(a.p, b.p, c.p, d.p, '#7fe9ff');
    }
    // Bordures aux deux bords (sauf tube fermé).
    if (!cage) {
      for (const ja of [0, M]) {
        const a = A.pts[ja], d = B.pts[ja];
        const col = i % 2 ? style.railA : style.railB;
        gb.quad(a.p, d.p, off(d, RAIL_H), off(a, RAIL_H), col);
      }
    }
  }
}

// ---- v1.5 : bifurcation ---------------------------------------------------------
const FORK_BELOW = 0.08;   // m
function forkMesh(gb, glow, tile, style, fx = null) {
  const P = PIECES[tile.t];
  // 2e revêtement : la voie déportée (branche 1) peut avoir le sien ; sinon elle garde celui de la pièce.
  const style2 = tile.s2 ? styleFor({ ...tile, s: tile.s2 === '-' ? '' : tile.s2, p: tile.p2 }) : style;
  const base = baseY(tile);
  const half = P.size * HALF, n = 20;
  const branches = [0, 1].map((b) => {
    const fr = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = forkBranchX(P, t, b), z = half - 2 * half * t;
      const x2 = forkBranchX(P, Math.min(1, t + 0.01), b), x1 = forkBranchX(P, Math.max(0, t - 0.01), b);
      const dz = -2 * half * (Math.min(1, t + 0.01) - Math.max(0, t - 0.01));
      const l = Math.hypot(x2 - x1, dz) || 1;
      // Z-fighting : tant que les deux chaussées se recouvrent, la voie B est posée 8 cm sous la voie A (qui reste visible
      // seule, avec ses marquages) ; elle remonte au niveau normal une fois les voies séparées. Sans cela, deux surfaces
      // coplanaires se disputaient les mêmes pixels (scintillement).
      const sep = forkSep(t), k = Math.max(0, Math.min(1, (sep - 2 * ROAD_HALF) / (CELL - 2 * ROAD_HALF)));
      const lowered = b === 1 ? FORK_BELOW * (1 - k * k * (3 - 2 * k)) : 0;   // constant tant que les voies se recouvrent, puis remonte
      fr.push({ ...flatFrame(x, base - lowered, z, (x2 - x1) / l, dz / l), t });
    }
    return fr;
  });
  branches.forEach((fr, b) => sweep(gb, fr, b === 1 ? style2 : style, true));
  // Bordures : extérieures sur toute la longueur, intérieures une fois les voies séparées.
  const m = P.mirror;
  const railAlong = (fr, side, from) => {
    for (let i = 0; i < n; i++) {
      if (fr[i].t < from) continue;
      const A = fr[i], B = fr[i + 1];
      const d0 = side * ROAD_HALF, d1 = side * (ROAD_HALF + RAIL_W);
      const col = i % 2 ? style.railA : style.railB;
      gb.quad(at(A, d0, 0), at(B, d0, 0), at(B, d0, RAIL_H), at(A, d0, RAIL_H), col);
      gb.quad(at(A, d0, RAIL_H), at(B, d0, RAIL_H), at(B, d1, RAIL_H), at(A, d1, RAIL_H), PALETTE.slab);
      gb.quad(at(A, d1, RAIL_H), at(B, d1, RAIL_H), at(B, d1, -SLAB_T), at(A, d1, -SLAB_T), PALETTE.railOuter);
    }
  };
  let tSplit = 1;
  for (let i = 0; i <= 200; i++) { if (forkSep(i / 200) >= 2 * ROAD_HALF) { tSplit = i / 200; break; } }
  railAlong(branches[0], -m, 0);
  railAlong(branches[1], m, 0);
  railAlong(branches[0], m, tSplit);
  railAlong(branches[1], -m, tSplit);
  // Revêtements : chaque voie reçoit les siens, centrés sur SA ligne centrale. Ceux de la voie déportée ne sont dessinés que là où
  // elle est séparée de la voie directe (sinon ils passeraient sous / déborderaient sur la voie directe).
  const sA = tile.s || '', sB = tile.s2 === '-' ? '' : (tile.s2 || sA), pB = tile.s2 ? tile.p2 : tile.p;
  if (sA) { if (fx && FX_KIND[sA] !== undefined) fxLayer(fx, branches[0], tile, FX_KIND[sA]); surfaceDecals(glow, branches[0], tile); }
  if (sB) {
    const tB = { ...tile, s: sB, p: pB };
    if (fx && FX_KIND[sB] !== undefined) fxLayer(fx, branches[1], tB, FX_KIND[sB]);
    const apart = branches[1].filter((fr) => fr.t >= tSplit);
    if (apart.length >= 3) surfaceDecals(glow, apart, tB);
  }
  // Flèches lumineuses indiquant les deux voies.
  for (const [b, rot] of [[0, 0], [1, -m * 0.5]]) {
    const f = frameAt(branches[b], 0.3);
    chevron(glow, f, 0, 0, 2.6, 0.6, 2.4, rot, '#ffd23e');
  }
}

// ---- v1.5 : anneau flottant (turbo ou checkpoint aérien) -------------------------
function ringMesh(gb, glow, tile) {
  const cy = baseY(tile) + RING_Y;
  const cp = cpKind(tile) === 'ring';
  const color = cp ? PALETTE.checkpoint : PALETTE.boost;
  const K = 28, S = 6, r = cp ? 0.75 : 0.6;
  const pt = (a, b) => {
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const R = RING_R + r * cb;
    return [R * ca, cy + R * sa, r * sb];
  };
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < S; j++) {
      const a0 = (i / K) * Math.PI * 2, a1 = ((i + 1) / K) * Math.PI * 2;
      const b0 = (j / S) * Math.PI * 2, b1 = ((j + 1) / S) * Math.PI * 2;
      const target = (i + j) % 2 && !cp ? glow : glow;
      target.quad(pt(a0, b0), pt(a1, b0), pt(a1, b1), pt(a0, b1), (i % 4 < 2) ? color : (cp ? '#fff3c4' : '#c9fbff'));
    }
  }
  // Petits ailerons pour lire le sens de passage.
  for (const sgn of [-1, 1]) {
    gb.box(sgn * (RING_R + 0.4) - 0.3, cy - 0.3, -1.4, sgn * (RING_R + 0.4) + 0.3, cy + 0.3, 1.4, PALETTE.slab);
  }
}

export function buildTileInto(gb, glow, tile, track = null, fx = null) {
  const m = tileMatrix(tile);
  // Pièce posée à l'envers : tout est retourné autour de son niveau (route au plafond).
  if (tile.v) {
    const b = baseY(tile);
    m.multiply(new THREE.Matrix4().makeTranslation(0, b, 0)).multiply(new THREE.Matrix4().makeScale(1, -1, 1)).multiply(new THREE.Matrix4().makeTranslation(0, -b, 0));
  }
  gb.setMatrix(m);
  glow.setMatrix(m);
  if (fx) fx.setMatrix(m);
  const p = PIECES[tile.t];
  const s = tile.s || '';
  const fxKind = fx ? FX_KIND[s] : undefined;
  if (p.kind === 'area') {
    platform(gb, glow, tile, fx);
  } else if (p.kind === 'ring') {
    ringMesh(gb, glow, tile);
  } else if (p.kind === 'fork') {
    forkMesh(gb, glow, tile, styleFor(tile), fx);
  } else if (p.kind === 'junction') {
    junctionMesh(gb, glow, tile, styleFor(tile));
  } else if (tile.t === 'tube' || tile.t === 'tubeIn' || tile.t === 'tubeMid') {
    crossSweep(gb, glow, tile, styleFor({ s: '', th: tile.th, col: tile.col }));
    // Revêtement d'une section de tube : bandes lumineuses au fond.
    if (s) surfaceDecals(glow, lineStrip(0, HALF, -HALF, baseY(tile), baseY(tile), 4), tile);
  } else {
    const style = styleFor(tile);
    const strips = stripsFor(tile);
    for (let strip of strips) {
      // Plaque bateau : une très légère montée, de l'eau (entrée, 35 cm plus bas) jusqu'au sol (sortie). Même hauteur que la physique.
      if (s === 'boat' && (p.kind === 'line' || p.kind === 'arc')) strip = boatRamp(strip, tile);
      sweep(gb, strip, style, hasNoRails(tile), s === 'water' ? WATER_DROP : 0);
      if (fxKind !== undefined) fxLayer(fx, strip, tile, fxKind);
      if (s) surfaceDecals(glow, strip, tile);
      if (tile.tn && !tile.v) tunnel(gb, glow, strip);
    }
  }
  const ck = cpKind(tile);
  if (p.kind === 'arc' && (p.special || ck)) {
    // Portique au milieu du virage, perpendiculaire à la route.
    const a = arcParams(p), ang = Math.PI * 1.25;
    const mir = p.mirror < 0 ? -1 : 1;
    const g = new THREE.Matrix4().makeTranslation(mir * (a.cx + a.R * Math.cos(ang)), 0, a.cz + a.R * Math.sin(ang));
    g.multiply(new THREE.Matrix4().makeRotationY(-mir * Math.PI / 4));
    const mm = m.clone().multiply(g);
    gb.setMatrix(mm); glow.setMatrix(mm);
    gate(gb, glow, tile);
    gb.setMatrix(m); glow.setMatrix(m);
  } else if ((ck === 'ring' || tile.tb) && p.kind !== 'ring') ringMesh(gb, glow, tile);       // anneau (checkpoint aérien ou turbo) posé en option sur une route
  else if (ck === 'pad') checkpointPad(gb, glow, tile);       // checkpoint sur une plateforme : balise au sol (pas de sens de route)
  else if ((p.special === 'start' || p.special === 'finish' || ck === 'gate') && p.kind !== 'ring') gate(gb, glow, tile);
  if (p.kind === 'loop' && !tile.o) loopTowers(gb, glow, tile);

  // Piliers (pas sous un ruban vertical / une route à l'envers)
  if ((tile.l > 0 || p.rise > 0) && p.kind !== 'ribbon' && p.kind !== 'ring' && !tile.v && !tile.o && !tile.mv) {
    for (const [lx, lz] of pillarPoints(tile)) {
      const top = pillarHeightAt(tile, lz, lx) - SLAB_T;
      if (top < 1.2) continue;
      if (track) {
        const w = new THREE.Vector3(lx, 0, lz).applyMatrix4(m);
        const cx = Math.floor(w.x / CELL), cz = Math.floor(w.z / CELL);
        let blocked = false;
        for (const o of track.tilesAt(cx, cz)) if (o !== tile && PIECES[o.t].kind !== 'ring' && baseY(o) < top) blocked = true;
        if (blocked) continue;
      }
      gb.taper(lx, lz, 0, top - 0.5, 3.2, 3.2, 2.4, 2.4, PALETTE.pillar);
      gb.box(lx - 2, top - 0.5, lz - 2, lx + 2, top, lz + 2, PALETTE.pillarCap);
    }
  }
  gb.setMatrix(null);
  glow.setMatrix(null);
  if (fx) fx.setMatrix(null);
}
