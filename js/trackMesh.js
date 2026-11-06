// Génère les maillages 3D du circuit à partir des pièces.
import * as THREE from './vendor/three.module.min.js';
import { GeoBuilder, FxBuilder } from './geo.js';
import {
  CELL, HALF, LEVEL_H, ROAD_HALF, RAIL_W, RAIL_H, SLAB_T,
} from './constants.js';
import { PIECES, SURFACES, RING_R, RING_Y, arcParams, baseY, tileCenter, tileParam, forkBranchX, forkSep, sampleLocal, cpKind, beltSpeed, isOriented, hasNoRails, profH, profOf } from './pieces.js';
import { tileToRow } from './track.js';
import { WATER_DROP, boatDrop } from './track/shared.js';
import { ribbonOf, frameLocal } from './ribbons.js';
import { buildDecoInto, createPlaque, decoColor } from './decos.js';
import { LIGHT_DECOS } from './decoData.js';
import { isObstacle } from './obstacles.js';
import { createObstacleMesh } from './obstacleMesh.js';

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
let colorblind = false;
export function setColorblind(v) { colorblind = !!v; }

// Couleur d'un revêtement selon son paramètre (faible / normal / fort).
export function tint(s, p) {
  const S = SURFACES[s];
  if (!S || !S.c) return '#ffffff';
  if (colorblind && CB_COLORS[s]) return CB_COLORS[s];
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
  if (p.kind === 'loop') {
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
    const n = (p.size === 2 ? 16 : p.size === 3 ? 24 : 8) * (Math.abs(p.rise) > 1 ? 2 : 1);
    const fr = [], mir = p.mirror < 0 ? -1 : 1;
    for (let i = 0; i <= n; i++) {
      const ang = Math.PI + (Math.PI / 2) * (i / n);
      fr.push(flatFrame(mir * (a.cx + a.R * Math.cos(ang)), base + p.rise * LEVEL_H * (i / n), a.cz + a.R * Math.sin(ang), -mir * Math.sin(ang), Math.cos(ang)));
    }
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
  const rings = frames.map((f) => prof.map((q) => at(f, q.d, q.h)));
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
    const f = frames[start ? 0 : n];
    for (const [d0, d1, h0, h1] of rects) {
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
const MOVO = {};
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
    for (let j = 0; j < D.length - 1; j++) {
      const d0 = D[j], d1 = D[j + 1];
      fx.fxQuad(at(A, d0, lift), at(A, d1, lift), at(B, d1, lift), at(B, d0, lift),
        [kind, s0 * sgn, speed, d0], [kind, s0 * sgn, speed, d1], [kind, s1 * sgn, speed, d1], [kind, s1 * sgn, speed, d0], '#ffffff');
    }
    s0 = s1;
  }
}

const FX_VERT = `
attribute vec4 fx;
varying vec4 vFx;
varying vec3 vPos;
#include <fog_pars_vertex>
void main() {
  vFx = fx;
  vPos = position;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FX_FRAG = `
uniform float uTime;
varying vec4 vFx;
varying vec3 vPos;
#include <fog_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float k = vFx.x, t = uTime;
  vec2 p = vPos.xz;
  float edge = smoothstep(${(ROAD_HALF - 2).toFixed(1)}, ${ROAD_HALF.toFixed(1)}, abs(vFx.w));
  vec3 c;
  if (k < 0.5) {
    // Eau : houle, reflets mouvants et écume le long des bords.
    float w = sin(p.x * 0.35 + t * 1.7) + sin(p.y * 0.29 - t * 1.3) + 0.6 * sin((p.x + p.y) * 0.6 + t * 2.3);
    float ca = abs(sin(p.x * 0.8 + sin(p.y * 0.7 + t) * 1.5 + t * 0.8) * sin(p.y * 0.8 + sin(p.x * 0.6 - t) * 1.5));
    c = mix(vec3(0.02, 0.20, 0.42), vec3(0.08, 0.48, 0.82), 0.5 + 0.2 * w) + pow(ca, 5.0) * vec3(0.55, 0.85, 1.0) * 0.7;
    float foam = edge * (0.6 + 0.4 * sin(vFx.y * 0.9 + t * 3.0 + p.x));
    c = mix(c, vec3(0.92, 0.98, 1.0), clamp(foam, 0.0, 1.0));
  } else if (k < 1.5) {
    // Tapis roulant : chevrons qui défilent à la vitesse de la bande.
    float s = fract((vFx.y - t * vFx.z - abs(vFx.w) * 0.45) / 4.0);
    float ch = step(0.72, s);
    float lines = step(0.92, fract(vFx.y * 0.0 + (vFx.w + 9.0) / 4.5));
    c = mix(vec3(0.10, 0.10, 0.12), vec3(0.18, 0.18, 0.21), lines);
    c = mix(c, vec3(1.0, 0.82, 0.24), ch * (1.0 - edge));
  } else if (k < 2.5) {
    // Verre : transparence froide et reflet qui balaie la surface.
    float sweep = pow(max(0.0, sin((p.x + p.y) * 0.12 - t * 1.4)), 24.0);
    float tile = step(0.96, fract(p.x / 6.0)) + step(0.96, fract(p.y / 6.0));
    c = vec3(0.45, 0.72, 0.88) + sweep * vec3(0.6) + tile * vec3(0.25, 0.3, 0.35) + edge * vec3(0.2);
  } else {
    // Poudreuse : blanc bleuté et cristaux qui scintillent.
    float g = hash(floor(p * 2.5));
    float tw = step(0.975, g) * (0.5 + 0.5 * sin(t * 6.0 + g * 60.0));
    float drift = 0.06 * sin(p.x * 0.4 + p.y * 0.3);
    c = vec3(0.86, 0.92, 1.0) + drift + tw * vec3(0.6, 0.7, 0.8);
  }
  gl_FragColor = vec4(c, 1.0);
  #include <fog_fragment>
}`;

function createFxMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: FX_VERT,
    fragmentShader: FX_FRAG,
    fog: true,
    side: THREE.DoubleSide,
  });
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

// Portique (départ / checkpoint / arrivée).
function gate(gb, glow, tile) {
  const sp = cpKind(tile) ? 'checkpoint' : PIECES[tile.t].special;
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
    const rg = [[cx - r, cy, 0], [cx, cy, -r], [cx + r, cy, 0], [cx, cy, r]];
    for (let i = 0; i < 4; i++) glow.tri(rg[i], rg[(i + 1) % 4], tip, color);
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

// Checkpoint posé sur une plateforme : quatre balises d'angle, un cadre lumineux au sol et un losange central. La plateforme
// n'a pas de sens de route : un portique n'aurait pas de sens ici, toute la dalle valide le checkpoint.
function checkpointPad(gb, glow, tile) {
  const y = baseY(tile), color = PALETTE.checkpoint, c = HALF - 1.6, top = 5.2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * c, z = sz * c, r = 0.5;
      gb.taper(x, z, y, y + top, 1.0, 1.0, 0.6, 0.6, color);
      const tip = [x, y + top + 1.4, z], rg = [[x - r, y + top, z], [x, y + top, z - r], [x + r, y + top, z], [x, y + top, z + r]];
      for (let i = 0; i < 4; i++) glow.tri(rg[i], rg[(i + 1) % 4], tip, color);
    }
  }
  const o = HALF - 1.6, w = 0.7, ly = y + 0.05;
  for (const [x0, z0, x1, z1] of [[-o, -o, o, -o + w], [-o, o - w, o, o], [-o, -o, -o + w, o], [o - w, -o, o, o]]) {
    glow.quad([x0, ly, z1], [x1, ly, z1], [x1, ly, z0], [x0, ly, z0], color);
  }
  const f = { p: [0, y, 0], r: [1, 0, 0], u: [0, 1, 0], t: [0, 0, -1] };
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
  if (p.kind === 'loop') loopTowers(gb, glow, tile);

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

export function createTrackMaterials() {
  return {
    solid: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }),
    fx: createFxMaterial(),
  };
}

// Profil « Potato » : les décorations du créateur (hors obstacles, qui ont un effet physique) ne sont pas dessinées.
// Une vue d'éditeur met showAllDecos à true : on y voit toujours tout.
let hideDecos = false;
export function setHideDecos(v) { hideDecos = !!v; }
// Nombre de vraies lumières (PointLight / SpotLight) que les décorations lumineuses peuvent allumer en même temps : les plus proches de la
// caméra. Fixé par le profil de qualité (0 = faisceaux visibles seulement). Le nombre de lumières de la scène ne change jamais en cours de
// course (pas de recompilation des shaders) : seul leur réglage change à chaque image.
let lightBudget = { point: 4, spot: 2 };
export function setLightBudget(b) { lightBudget = b || { point: 0, spot: 0 }; }

// Tronçons : le maillage statique (route, piliers, décorations fixes) est découpé en carrés de CHUNK × CHUNK cases (128 m). Un tronçon n'est reconstruit
// que si l'un de ses éléments, ou un voisin qui influe sur ses piliers, a changé : dans l'éditeur, poser une pièce ne régénère plus tout le circuit
// (un grand circuit de 270 pièces et 300 décorations coûtait ~130 ms par modification). Chaque tronçon a sa boîte englobante : la caméra et les
// ombres n'envoient à la carte graphique que ceux qu'elles voient.
const CHUNK = 4;
const chunkKey = (cx, cz) => cx * 8192 + cz;
const tileSig = (t, flags) => flags + JSON.stringify(tileToRow(t));
const decoSig = (d) => `${d.k}|${d.x}|${d.y}|${d.z}|${d.ry || 0}|${d.s || 1}|${d.c || 0}|${d.cc || ''}|${d.u || ''}`;

export class TrackView {
  constructor(track, materials, { showAllDecos = false } = {}) {
    this.track = track;
    this.materials = materials;
    this.showAllDecos = showAllDecos;
    this.group = new THREE.Group();
    this.chunks = new Map();            // clé de tronçon -> { sig, meshes } (maillage statique, conservé d'une reconstruction à l'autre)
    this.chunkMeshes = new Set();
    this.chunkBuilds = 0;               // nombre de tronçons construits depuis la création (mesuré par les tests)
    this.plaques = [];
    this.obstacles = [];
    this.movers = [];
    this.glassGroups = [];
    this.lamps = [];
    this.pool = null;
    this.rebuild();
  }

  // Remet le maillage à jour. Les objets dynamiques (pièces mobiles, dalles de verre, obstacles, plaques, lampes) sont recréés ; le maillage
  // statique ne l'est que pour les tronçons dont la signature a changé.
  rebuild() {
    this._disposeDynamic();
    const track = this.track, focus = this.focus;
    // Vue par niveau (éditeur) : les pièces des autres niveaux sont dessinées estompées.
    const dimG = new GeoBuilder(), dimGlow = new GeoBuilder();
    const buckets = new Map();
    const bucket = (cx, cz) => {
      const k = chunkKey(cx, cz);
      let b = buckets.get(k);
      if (!b) buckets.set(k, b = { cx, cz, tiles: [], decos: [], sig: '' });
      return b;
    };
    const sigs = new Map();
    for (const tile of track.tiles) {
      const P = PIECES[tile.t];
      const hi = tile.l + Math.max(P.rise || 0, 0) + (P.clearance || tile.cp ? 1 : 0) + (tile.o ? 2 : 0);
      const lo = tile.l + Math.min(P.rise || 0, 0) - Math.max(P.below || 0, tile.o ? 2 : 0);          // (`below` : route sur le côté, qui descend sous son niveau ; pente descendante : sous son niveau d'entrée)
      const dim = focus != null && !(focus >= lo - 0.01 && focus <= hi + 0.01);
      const glassy = tile.s === 'glass' || tile.s2 === 'glass';
      sigs.set(tile, tileSig(tile, dim ? 'd' : 's'));
      if ((tile.mv || glassy) && !dim) {
        // Pièce mobile (déplacée à chaque image selon le chrono) ou dalle de verre (masquée quand elle se brise) : son propre groupe.
        const g1 = new GeoBuilder(), g2 = new GeoBuilder(), g3 = new FxBuilder();
        buildTileInto(g1, g2, tile, track, g3);
        const grp = new THREE.Group();
        const m1 = new THREE.Mesh(g1.build(), this.materials.solid);
        m1.castShadow = true; m1.receiveShadow = true;
        grp.add(m1);
        if (!g2.empty) grp.add(new THREE.Mesh(g2.build(), this.materials.glow));
        if (!g3.empty && this.materials.fx) grp.add(this._fxMesh(g3));
        this.group.add(grp);
        if (tile.mv) this.movers.push({ tile, grp });
        if (glassy) this.glassGroups.push({ tile, grp });
      } else if (dim) buildTileInto(dimG, dimGlow, tile, track);
      else bucket(Math.floor(tile.x / CHUNK), Math.floor(tile.z / CHUNK)).tiles.push(tile);
    }
    if (!dimG.empty) {
      if (!this.dimMat) this.dimMat = new THREE.MeshBasicMaterial({ color: '#8c90b8', transparent: true, opacity: 0.16, depthWrite: false });
      this.group.add(new THREE.Mesh(dimG.build(), this.dimMat));
      if (!dimGlow.empty) this.group.add(new THREE.Mesh(dimGlow.build(), this.dimMat));
    }
    const span = CELL * CHUNK;
    for (const d of track.decos) {
      if (hideDecos && !this.showAllDecos && !isObstacle(d.k)) continue;
      if (d.k === 'plaque') {
        const mesh = createPlaque(d);
        this.group.add(mesh);
        this.plaques.push(mesh);
      } else if (isObstacle(d.k)) {
        const o = createObstacleMesh(d, this.materials);
        this.group.add(o);
        this.obstacles.push(o);
      } else {
        bucket(Math.floor(d.x / span), Math.floor(d.z / span)).decos.push(d);
        if (LIGHT_DECOS[d.k]) this._addLamp(d);
      }
    }
    this._initLightPool();

    // Signature d'un tronçon : ses pièces, ses décorations, et les pièces voisines (la case d'à côté, comprise) dont dépend l'emplacement de
    // ses piliers (un pilier est omis sous une autre pièce) ; plus les réglages de qualité qui changent le contenu.
    const flags = (hideDecos ? 'h' : 'v') + (this.showAllDecos ? 'a' : 'n');
    for (const b of buckets.values()) {
      const seen = new Set(b.tiles);
      let sig = flags;
      for (const t of b.tiles) sig += '|' + sigs.get(t);
      for (let cz = b.cz * CHUNK - 1; cz <= b.cz * CHUNK + CHUNK; cz++) {
        for (let cx = b.cx * CHUNK - 1; cx <= b.cx * CHUNK + CHUNK; cx++) {
          for (const o of track.tilesAt(cx, cz)) if (!seen.has(o)) { seen.add(o); sig += '#' + sigs.get(o); }
        }
      }
      for (const d of b.decos) sig += '~' + decoSig(d);
      b.sig = sig;
    }
    for (const [key, ch] of [...this.chunks]) {
      const b = buckets.get(key);
      if (!b || b.sig !== ch.sig) { this._disposeChunk(ch); this.chunks.delete(key); }
    }
    for (const [key, b] of buckets) if (!this.chunks.has(key)) this.chunks.set(key, this._buildChunk(b));
    this.builtVersion = track.version;
  }

  _buildChunk(b) {
    this.chunkBuilds++;
    const gb = new GeoBuilder(), glow = new GeoBuilder(), fx = new FxBuilder();
    for (const tile of b.tiles) buildTileInto(gb, glow, tile, this.track, fx);
    for (const d of b.decos) buildDecoInto(gb, glow, d);
    const meshes = [];
    if (!gb.empty) {
      const mesh = new THREE.Mesh(gb.build(), this.materials.solid);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      meshes.push(mesh);
    }
    if (!glow.empty) meshes.push(new THREE.Mesh(glow.build(), this.materials.glow));
    if (!fx.empty && this.materials.fx) meshes.push(this._fxMesh(fx));
    for (const m of meshes) {
      m.matrixAutoUpdate = false;          // statique : la matrice (identité) ne se recalcule pas à chaque image
      this.group.add(m);
      this.chunkMeshes.add(m);
    }
    return { sig: b.sig, meshes };
  }

  _disposeChunk(ch) {
    for (const m of ch.meshes) {
      m.geometry.dispose();
      this.group.remove(m);
      this.chunkMeshes.delete(m);
    }
  }

  // Couche d'effets animés (le temps passe par une variable de la matière, mise à jour juste avant le dessin).
  _fxMesh(builder) {
    const mesh = new THREE.Mesh(builder.build(), this.materials.fx), mat = this.materials.fx;
    mesh.onBeforeRender = () => { mat.uniforms.uTime.value = performance.now() / 1000; };
    mesh.receiveShadow = false;
    return mesh;
  }

  // ---- Décorations lumineuses (projecteurs, lanternes, lampadaires) -------------------------------------------------------------
  // Chaque lampe a un groupe dynamique (faisceau tournant, halo) ; la lumière réelle vient d'un petit nombre de lumières partagées
  // (voir lightBudget) attribuées à chaque image aux lampes les plus proches de la caméra. La couleur de la lumière suit celle de l'objet.
  _addLamp(d) {
    const L = LIGHT_DECOS[d.k];
    const grp = new THREE.Group();
    grp.position.set(d.x, d.y, d.z); grp.rotation.y = d.ry || 0; grp.scale.setScalar(d.s || 1);
    grp.userData.lamp = true;
    const hex = decoColor(d) || L.color;
    const col = new THREE.Color(hex);
    const lamp = { d, L, grp, col, hex, head: null, mats: [], phase: ((d.x * 12.9898 + d.z * 78.233) % 6.283 + 6.283) % 6.283 };
    const mat = (o) => { const m = new THREE.MeshBasicMaterial({ color: col.clone(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, ...o }); lamp.mats.push(m); return m; };
    if (L.type === 'spot') {
      const head = new THREE.Group(); head.position.y = L.y; grp.add(head);
      const phi = Math.PI / 2 + L.tilt;
      const cone = (r, len, op) => { const g = new THREE.ConeGeometry(r, len, 20, 1, true); g.translate(0, -len / 2, 0); g.rotateX(phi); return new THREE.Mesh(g, mat({ opacity: op })); };
      const r = L.beam * Math.tan(L.angle);
      head.add(cone(r, L.beam, 0.06), cone(r * 0.4, L.beam, 0.11));
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.75, 2.0, 12).rotateX(phi), new THREE.MeshStandardMaterial({ color: '#2f3247', roughness: 0.6 }));
      barrel.position.set(0, Math.sin(L.tilt) * 0.7, -Math.cos(L.tilt) * 0.7);
      barrel.userData.own = true;
      head.add(barrel);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12).rotateX(phi - Math.PI / 2 + Math.PI), mat({ opacity: 0.95 }));
      lens.position.set(0, Math.sin(L.tilt) * 1.55, -Math.cos(L.tilt) * 1.55);
      head.add(lens);
      lamp.head = head;
    } else {
      const halo = new THREE.Mesh(new THREE.SphereGeometry(L.type === 'point' && L.y > 6 ? 1.5 : 1.1, 10, 8), mat({ opacity: 0.12 }));
      halo.position.set(d.k === 'streetLamp' ? 1.8 : 0, L.y - (d.k === 'streetLamp' ? 0.2 : d.k === 'lanternHang' ? 0.1 : 0), 0);
      grp.add(halo);
    }
    this.group.add(grp);
    this.lamps.push(lamp);
  }

  _initLightPool() {
    this.pool = null;
    if (!this.lamps || !this.lamps.length) return;
    const b = lightBudget, pool = { points: [], spots: [] };
    for (let i = 0; i < b.point; i++) { const l = new THREE.PointLight('#ffffff', 0, 40, 2); l.userData.pool = true; this.group.add(l); pool.points.push(l); }
    for (let i = 0; i < b.spot; i++) {
      const l = new THREE.SpotLight('#ffffff', 0, 120, 0.3, 0.55, 1.6);
      l.userData.pool = true; this.group.add(l); this.group.add(l.target); pool.spots.push(l);
    }
    this.pool = pool;
  }

  // À appeler à chaque image : fait tourner les projecteurs et attribue les vraies lumières aux lampes les plus proches de pos.
  updateLights(pos, t) {
    if (!this.lamps || !this.lamps.length) return;
    const near = { point: [], spot: [] };
    for (const lamp of this.lamps) {
      const { L, d, col } = lamp;
      // La couleur ne se recalcule que si l'inspecteur vient de la changer (analyser « #rrggbb » à chaque image et pour chaque lampe coûte).
      const hex = decoColor(d) || L.color;
      if (hex !== lamp.hex) { lamp.hex = hex; col.set(hex); for (const m of lamp.mats) m.color.copy(col); }
      const ang = L.spin ? L.spin * t + lamp.phase : 0;
      if (lamp.head) lamp.head.rotation.y = ang;
      lamp.ang = ang;
      const s = d.s || 1, wy = d.y + L.y * s;
      const dx = d.x - pos.x, dy = wy - pos.y, dz = d.z - pos.z, d2 = dx * dx + dy * dy + dz * dz;
      const reach = L.range * s * 1.4;
      if (d2 < reach * reach) near[L.type].push({ lamp, d2, wy, s });
    }
    if (!this.pool) return;
    const assign = (lights, list, spot) => {
      list.sort((a, b) => a.d2 - b.d2);
      lights.forEach((light, i) => {
        const e = list[i];
        if (!e) { light.intensity = 0; return; }
        const { lamp, wy, s } = e, { L, d } = lamp;
        light.position.set(d.x, wy, d.z);
        light.color.copy(lamp.col);
        light.intensity = L.power * s;
        light.distance = L.range * s;
        if (spot) {
          const yaw = (d.ry || 0) + lamp.ang, ct = Math.cos(L.tilt);
          light.angle = L.angle;
          light.target.position.set(d.x - ct * Math.sin(yaw) * 40, wy + Math.sin(L.tilt) * 40, d.z - ct * Math.cos(yaw) * 40);
          light.target.updateMatrixWorld();
        }
      });
    };
    assign(this.pool.points, near.point, false);
    assign(this.pool.spots, near.spot, true);
  }

  // Anime les obstacles et les pièces mobiles au temps t (s, chrono de la course).
  updateMoving(t) {
    for (const o of this.obstacles) o.userData.update(t);
    for (const m of this.movers) {
      const o = this.track.moverOffset(m.tile, t, MOVO);
      if (o.a) {
        // Rotation autour du centre de la pièce : tourne le groupe, puis le replace pour que le pivot reste fixe.
        const c = Math.cos(o.a), sn = Math.sin(o.a);
        m.grp.rotation.y = o.a;
        m.grp.position.set(o.cx - (c * o.cx + sn * o.cz), o.y, o.cz - (-sn * o.cx + c * o.cz));
      } else {
        m.grp.rotation.y = 0;
        m.grp.position.set(o.x, o.y, o.z);
      }
    }
  }

  // Libère les objets dynamiques (tout sauf le maillage statique des tronçons).
  _disposeDynamic() {
    for (const c of [...this.group.children]) {
      if (this.chunkMeshes.has(c)) continue;
      if (c.isGroup) c.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (c.userData.lamp && m.material) m.material.dispose(); });
      if (c.geometry) c.geometry.dispose();
      if (c.userData.own && c.material) {
        if (c.material.map) c.material.map.dispose();
        c.material.dispose();
      }
      this.group.remove(c);
    }
    this.plaques = [];
    this.obstacles = [];
    this.movers = [];
    this.glassGroups = [];
    this.lamps = [];
    this.pool = null;
  }

  // Dalles de verre brisées (voir CarPhysics.broken) : elles disparaissent ; vide = tout est restauré.
  setBroken(set) {
    for (const g of this.glassGroups) g.grp.visible = !(set && set.has(g.tile));
  }

  dispose() {
    this._disposeDynamic();
    for (const ch of this.chunks.values()) this._disposeChunk(ch);
    this.chunks.clear();
    if (this.dimMat) this.dimMat.dispose();
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

