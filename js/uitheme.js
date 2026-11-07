// Thèmes et disposition de l'interface (lot 11) : couleurs, police, arrondis, compteur de vitesse, taille et place des éléments du HUD.
// Module pur (testé sous Node) : il calcule des valeurs ; js/app/uicustom.js les applique à la page. Rien ici ne touche au jeu.

export const THEMES = {
  default: { label: 'Copytrack', vars: {} },
  midnight: { label: 'Minuit', vars: { '--bg': '#070b1c', '--panel': 'rgba(10, 18, 44, 0.84)', '--panel-2': 'rgba(18, 32, 74, 0.92)', '--pink': '#7aa8ff', '--cyan': '#4de1ff', '--amber': '#ffd166', '--grad': 'linear-gradient(100deg, #4d7cff 0%, #7aa8ff 50%, #4de1ff 100%)' } },
  sunset: { label: 'Crépuscule', vars: { '--bg': '#2a0f1f', '--panel': 'rgba(60, 18, 36, 0.84)', '--panel-2': 'rgba(92, 28, 50, 0.92)', '--pink': '#ff8fa3', '--cyan': '#ffc15e', '--amber': '#ff9f43', '--grad': 'linear-gradient(100deg, #ff5e62 0%, #ff9966 50%, #ffd26e 100%)' } },
  forest: { label: 'Forêt', vars: { '--bg': '#0b1f17', '--panel': 'rgba(12, 40, 28, 0.84)', '--panel-2': 'rgba(20, 62, 44, 0.92)', '--pink': '#9be37a', '--cyan': '#5ff2b5', '--amber': '#e6e36a', '--grad': 'linear-gradient(100deg, #3ddc84 0%, #9be37a 50%, #5ff2b5 100%)' } },
  mono: { label: 'Mono', vars: { '--bg': '#101010', '--panel': 'rgba(24, 24, 24, 0.86)', '--panel-2': 'rgba(40, 40, 40, 0.94)', '--text': '#f2f2f2', '--muted': '#a8a8a8', '--pink': '#d8d8d8', '--cyan': '#ffffff', '--amber': '#cfcfcf', '--grad': 'linear-gradient(100deg, #777 0%, #ddd 100%)' } },
  contrast: { label: 'Contraste élevé', vars: { '--bg': '#000000', '--panel': 'rgba(0, 0, 0, 0.94)', '--panel-2': 'rgba(18, 18, 18, 0.98)', '--line': 'rgba(255, 255, 255, 0.55)', '--text': '#ffffff', '--muted': '#e6e6e6', '--pink': '#ffe600', '--cyan': '#00e5ff', '--amber': '#ffe600', '--good': '#39ff7a', '--bad': '#ff5252', '--grad': 'linear-gradient(100deg, #ffe600 0%, #00e5ff 100%)' } },
};
export const FONTS = {
  default: { label: 'Chakra Petch', css: '' },
  system: { label: 'Système', css: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
  round: { label: 'Arrondie', css: '"Trebuchet MS", "Segoe UI", sans-serif' },
  mono: { label: 'Machine', css: 'ui-monospace, Menlo, Consolas, monospace' },
  serif: { label: 'Classique', css: 'Georgia, "Times New Roman", serif' },
};
export const SPEEDOS = { default: 'Chiffres', big: 'Énorme', minimal: 'Discret', bar: 'Jauge', ring: 'Cadran' };
export const TIMERS = { normal: 'Normal', big: 'Gros', small: 'Petit' };
export const HUD_PIECES = { top: 'Chrono', tl: 'Circuit et checkpoints', tr: 'Record et médailles', br: 'Vitesse', hint: 'Aide des touches' };
export const HUD_HIDE = { split: 'écart', best: 'record', medals: 'médailles', boost: 'jauge de boost', hint: 'aide des touches', track: 'nom du circuit' };

const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };

export const DEFAULT_UI = { theme: 'default', accent: '', accent2: '', panelA: 0, radius: -1, font: 'default', speedo: 'default', timer: 'normal', hudScale: 1, hud: {}, hide: {} };

export function sanitizeUi(u) {
  const o = u && typeof u === 'object' ? u : {};
  const out = {
    theme: THEMES[o.theme] ? o.theme : 'default',
    accent: HEX.test(o.accent || '') ? o.accent.toLowerCase() : '',
    accent2: HEX.test(o.accent2 || '') ? o.accent2.toLowerCase() : '',
    panelA: o.panelA ? Number(clamp(o.panelA, 0.3, 1, 0).toFixed(2)) : 0,         // 0 : opacité du thème
    radius: o.radius >= 0 ? Math.round(clamp(o.radius, 0, 28, 0)) : -1,            // -1 : arrondis d'origine
    font: FONTS[o.font] ? o.font : 'default',
    speedo: SPEEDOS[o.speedo] ? o.speedo : 'default',
    timer: TIMERS[o.timer] ? o.timer : 'normal',
    hudScale: Number(clamp(o.hudScale, 0.7, 1.5, 1).toFixed(2)),
    hud: {}, hide: {},
  };
  for (const k of Object.keys(HUD_PIECES)) {
    const p = o.hud && o.hud[k];
    if (Array.isArray(p) && p.length === 2) out.hud[k] = [Number(clamp(p[0], -48, 48, 0).toFixed(1)), Number(clamp(p[1], -48, 48, 0).toFixed(1))];       // en vw / vh : suit la taille de l'écran
  }
  for (const k of Object.keys(HUD_HIDE)) if (o.hide && o.hide[k]) out.hide[k] = true;
  return out;
}

// '#rrggbb' -> 'rgba(r, g, b, a)' pour les fonds de panneau.
const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${a})`;

// Variables CSS à poser sur <html> (les absentes sont retirées par l'appelant : voir CSS_VARS).
export function themeVars(ui) {
  const u = sanitizeUi(ui);
  const v = { ...THEMES[u.theme].vars };
  if (u.accent) { v['--cyan'] = u.accent; }
  if (u.accent2) { v['--pink'] = u.accent2; }
  if (u.accent || u.accent2) v['--grad'] = `linear-gradient(100deg, ${u.accent2 || '#ff6b57'} 0%, ${u.accent || '#5ff2ff'} 100%)`;
  if (u.panelA) {
    const base = (THEMES[u.theme].vars['--panel'] || 'rgba(28, 20, 58, 0.82)').match(/[\d.]+/g).slice(0, 3).map(Number);
    v['--panel'] = `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${u.panelA})`;
    v['--panel-2'] = `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${Math.min(1, u.panelA + 0.08)})`;
  }
  if (u.radius >= 0) v['--radius'] = u.radius + 'px';
  if (FONTS[u.font].css) v['--font'] = FONTS[u.font].css;
  v['--hud-scale'] = String(u.hudScale);
  for (const [k, [dx, dy]] of Object.entries(u.hud)) { v[`--hx-${k}`] = dx + 'vw'; v[`--hy-${k}`] = dy + 'vh'; }
  return v;
}
// Toutes les variables que themeVars peut poser (pour retirer celles qui ne s'appliquent plus).
export const CSS_VARS = ['--bg', '--panel', '--panel-2', '--line', '--text', '--muted', '--pink', '--cyan', '--amber', '--good', '--bad', '--grad', '--radius', '--font', '--hud-scale',
  ...Object.keys(HUD_PIECES).flatMap((k) => [`--hx-${k}`, `--hy-${k}`])];
export { rgba };
