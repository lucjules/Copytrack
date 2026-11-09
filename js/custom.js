// Voiture personnalisée (lot 10) : pièces libres, peinture avancée, dessin 16×16, effets, code partageable « SHC1: ».
// Module sans rendu ni DOM (testé sous Node). 100 % visuel et sonore : aucune de ces valeurs ne touche la physique (CAR, physics.js).
// Tout ce qui vient d'ailleurs (code d'un ami, profil restauré, cloud) passe par sanitizeCustom : bornes, longueurs, jeux de caractères.

export const MAX_PARTS = 24;
export const PART_SHAPES = ['box', 'sphere', 'cyl', 'cone', 'wedge', 'ring'];
export const SHAPE_LABELS = { box: 'Bloc', sphere: 'Sphère', cyl: 'Cylindre', cone: 'Cône', wedge: 'Cale', ring: 'Anneau' };
export const PATTERNS = ['none', 'stripes', 'hex', 'camo', 'checks', 'dots', 'waves'];
export const PATTERN_LABELS = { none: 'Aucun', stripes: 'Rayures', hex: 'Alvéoles', camo: 'Camouflage', checks: 'Damier', dots: 'Pois', waves: 'Vagues' };
export const ENGINES = ['default', 'saw', 'square', 'tri', 'sine'];
export const ENGINE_LABELS = { default: 'Classique', saw: 'Scie', square: 'Carré', tri: 'Triangle', sine: 'Doux' };
export const DRAW = 16;                    // le dessin est une grille 16 × 16
// Palette du dessin : l'indice 0 est transparent, 1 à 15 sont les couleurs.
export const DRAW_PALETTE = ['', '#ffffff', '#111118', '#ff5a5f', '#ff8c42', '#ffd23e', '#7cf06b', '#2fd3b5', '#3ec1ff', '#1d4fb8', '#c77dff', '#ff4fd8', '#8a1c2e', '#b0b6c8', '#e8c27a', '#4a3b2a'];

const HEX = /^#[0-9a-f]{6}$/i;
const num = (v, lo, hi, def, step = 0) => {
  let n = Number(v);
  if (!Number.isFinite(n)) n = def;
  n = Math.min(hi, Math.max(lo, n));
  return step ? Number((Math.round(n / step) * step).toFixed(4)) : n;
};
const col = (v, def) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : def);

export const EMPTY_DRAW = '0'.repeat(DRAW * DRAW);

export const DEFAULT_CUSTOM = {
  parts: [],
  paint: { grad: false, gradC: '#ff4fd8', gradDir: 'v', pat: 'none', patC: '#ffffff', patA: 0.35, text: '', textC: '#ffffff', num: '', numC: '#111118', plate: '' },
  draw: EMPTY_DRAW,
  fx: { trailC: '', trailLen: 1, spark: '', smoke: '', engine: 'default', pitch: 1, hornPitch: 1 },
};

export function cloneCustom(c = DEFAULT_CUSTOM) { return JSON.parse(JSON.stringify(c)); }

export function sanitizePart(p) {
  if (!p || typeof p !== 'object' || !PART_SHAPES.includes(p.s)) return null;
  return {
    s: p.s,
    x: num(p.x, -1.6, 1.6, 0, 0.05), y: num(p.y, 0, 2.6, 1, 0.05), z: num(p.z, -3, 3, 0, 0.05),
    sx: num(p.sx, 0.05, 2, 0.4, 0.05), sy: num(p.sy, 0.05, 2, 0.4, 0.05), sz: num(p.sz, 0.05, 3, 0.4, 0.05),
    ry: num(p.ry, 0, 345, 0, 15), c: col(p.c, '#ffffff'), m: p.m ? 1 : 0, g: p.g ? 1 : 0,       // m : symétrique (copie en miroir), g : lumineux
  };
}

// Texte d'affichage : majuscules, chiffres, espace et quelques signes ; la longueur est bornée (pas de modération possible côté client).
const cleanText = (v, max, allowed) => String(v == null ? '' : v).toUpperCase().split('').filter((ch) => allowed.test(ch)).join('').slice(0, max);

export function sanitizeDraw(d) {
  if (typeof d !== 'string' || d.length !== DRAW * DRAW || !/^[0-9a-f]+$/.test(d)) return EMPTY_DRAW;
  return d;
}

export function sanitizeCustom(c) {
  const out = cloneCustom();
  if (!c || typeof c !== 'object') return out;
  if (Array.isArray(c.parts)) out.parts = c.parts.slice(0, MAX_PARTS).map(sanitizePart).filter(Boolean);
  const p = c.paint && typeof c.paint === 'object' ? c.paint : {};
  out.paint = {
    grad: !!p.grad, gradC: col(p.gradC, out.paint.gradC), gradDir: p.gradDir === 'h' ? 'h' : 'v',
    pat: PATTERNS.includes(p.pat) ? p.pat : 'none', patC: col(p.patC, out.paint.patC), patA: num(p.patA, 0.05, 1, 0.35, 0.05),
    text: cleanText(p.text, 8, /[A-Z0-9 .!?-]/), textC: col(p.textC, out.paint.textC),
    num: cleanText(p.num, 3, /[0-9]/), numC: col(p.numC, out.paint.numC),
    plate: cleanText(p.plate, 8, /[A-Z0-9 -]/),
  };
  out.draw = sanitizeDraw(c.draw);
  const f = c.fx && typeof c.fx === 'object' ? c.fx : {};
  out.fx = {
    trailC: f.trailC === '' ? '' : col(f.trailC, ''), trailLen: num(f.trailLen, 0.5, 2, 1, 0.1),
    spark: f.spark === '' ? '' : col(f.spark, ''), smoke: f.smoke === '' ? '' : col(f.smoke, ''),
    engine: ENGINES.includes(f.engine) ? f.engine : 'default', pitch: num(f.pitch, 0.7, 1.4, 1, 0.05), hornPitch: num(f.hornPitch, 0.6, 1.6, 1, 0.05),
  };
  return out;
}

// Rien de personnalisé ? (évite de construire quoi que ce soit)
export function hasLivery(c) {
  return !!(c.paint.grad || c.paint.pat !== 'none' || c.paint.text || c.paint.num || c.draw !== EMPTY_DRAW);
}

// ---------------------------------------------------------------- code partageable « SHC1: » (JSON compact en base64 URL)
const b64 = (s) => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = t + '='.repeat((4 - (t.length % 4)) % 4);
  return typeof atob === 'function' ? decodeURIComponent(escape(atob(pad))) : Buffer.from(pad, 'base64').toString('utf8');
};
export const CAR_CODE_MAX = 8000;

// Le code porte les choix visuels du catalogue (carrosserie, couleurs, LED…) ET la personnalisation. Les éléments payants restent à acheter chez celui qui l'importe.
export function encodeCar(loadout) {
  return 'SHC1:' + b64(JSON.stringify(loadout));
}

// Renvoie l'objet brut décodé (à passer par sanitizeLoadout) ou lève une erreur lisible.
export function decodeCar(code) {
  const t = String(code || '').trim();
  if (!t.startsWith('SHC1:')) throw new Error('Ce n\'est pas un code de voiture (il commence par SHC1:).');
  if (t.length > CAR_CODE_MAX) throw new Error('Code de voiture trop long.');
  let o;
  try { o = JSON.parse(unb64(t.slice(5))); } catch { throw new Error('Code de voiture invalide ou coupé.'); }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('Code de voiture invalide ou coupé.');
  return o;
}

// ---------------------------------------------------------------- dessin : image -> grille 16×16 (le canvas est fourni par l'appelant : ce module n'a pas de DOM)
const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const PAL_RGB = DRAW_PALETTE.map((h) => (h ? hexToRgb(h) : null));

// Indice de palette le plus proche d'un pixel (r, g, b, a) ; 0 si presque transparent.
export function nearestIndex(r, g, b, a) {
  if (a < 100) return 0;
  let best = 1, bd = Infinity;
  for (let i = 1; i < PAL_RGB.length; i++) {
    const p = PAL_RGB[i];
    const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// rgba : Uint8ClampedArray d'une image DRAW × DRAW (4 octets par pixel).
export function drawFromRgba(rgba) {
  let s = '';
  for (let i = 0; i < DRAW * DRAW; i++) s += nearestIndex(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], rgba[i * 4 + 3]).toString(16);
  return s;
}

export function setPixel(draw, x, y, idx) {
  if (x < 0 || y < 0 || x >= DRAW || y >= DRAW) return draw;
  const i = y * DRAW + x;
  return draw.slice(0, i) + (idx & 15).toString(16) + draw.slice(i + 1);
}

// Remplissage par zone (pot de peinture) : renvoie le nouveau dessin.
export function floodFill(draw, x, y, idx) {
  if (x < 0 || y < 0 || x >= DRAW || y >= DRAW) return draw;
  const arr = draw.split('');
  const from = arr[y * DRAW + x], to = (idx & 15).toString(16);
  if (from === to) return draw;
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cy < 0 || cx >= DRAW || cy >= DRAW || arr[cy * DRAW + cx] !== from) continue;
    arr[cy * DRAW + cx] = to;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return arr.join('');
}

// Une pièce libre prête à poser : valeurs par défaut sensées selon la forme.
export function newPart(shape = 'box') {
  return sanitizePart({ s: shape, x: 0, y: 1.1, z: 0, sx: 0.5, sy: 0.3, sz: 0.5, c: '#ffffff', m: 0 });
}
