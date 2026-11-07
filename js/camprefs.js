// Caméras personnalisées (lot 11) : jusqu'à 6 caméras de course en plus des 4 d'origine, réglées par le joueur.
// Module pur (testé sous Node). Une caméra personnalisée a les mêmes champs que celles de CAM_MODES (race/shared.js).

export const MAX_CUSTOM_CAMS = 6;
export const CAM_LIMITS = {
  dist: [3, 26, 0.5], height: [0.4, 14, 0.1], look: [0, 18, 0.5], lookUp: [-2, 5, 0.1], fov: [40, 105, 1],
};
export const CAM_LABELS = { dist: 'Distance derrière', height: 'Hauteur', look: 'Regard devant la voiture', lookUp: 'Regard en hauteur', fov: 'Champ de vision' };
export const CAM_DEFAULT = { name: 'Ma caméra', dist: 8, height: 3, look: 5, lookUp: 1.2, fov: 68 };

const num = (v, [lo, hi, step], def) => {
  let n = Number(v);
  if (!Number.isFinite(n)) n = def;
  n = Math.min(hi, Math.max(lo, n));
  return Number((Math.round(n / step) * step).toFixed(3));
};

export function sanitizeCam(c) {
  if (!c || typeof c !== 'object') return null;
  const name = String(c.name == null ? '' : c.name).replace(/[^\p{L}\p{N} _'’.-]/gu, '').trim().slice(0, 16) || 'Caméra';
  const out = { name };
  for (const k of Object.keys(CAM_LIMITS)) out[k] = num(c[k], CAM_LIMITS[k], CAM_DEFAULT[k]);
  return out;
}

export const sanitizeCams = (list) => (Array.isArray(list) ? list.slice(0, MAX_CUSTOM_CAMS).map(sanitizeCam).filter(Boolean) : []);

// Liste complète des caméras de course : celles d'origine, puis celles du joueur.
export const cameraList = (base, custom) => [...base, ...sanitizeCams(custom)];

// L'indice enregistré peut sortir de la liste (caméra supprimée) : on revient à la première.
export const clampCamIndex = (i, list) => (Number.isInteger(i) && i >= 0 && i < list.length ? i : 0);
