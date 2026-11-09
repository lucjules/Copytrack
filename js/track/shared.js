// Éléments partagés par les familles de méthodes de Track (voir track.js).
// L'eau est un peu sous le niveau de la chaussée.
export const WATER_DROP = 0.35;

// Plaque bateau : une très légère montée de l'eau (entrée de la pièce, un peu sous la route) jusqu'au sol (sortie, au niveau normal).
export const boatDrop = (along) => WATER_DROP * (1 - Math.max(0, Math.min(1, along || 0)));

// Couleurs personnalisées d'une pièce : { road, line, rail } en #rrggbb (clés absentes = couleur d'origine). null si aucune.
export const COLOR_KEYS = ['road', 'line', 'rail'];

export const HEX = /^#[0-9a-f]{6}$/i;

export function cleanColors(c) {
  if (!c || typeof c !== 'object') return null;
  const out = {};
  for (const k of COLOR_KEYS) if (typeof c[k] === 'string' && HEX.test(c[k])) out[k] = c[k].toLowerCase();
  return Object.keys(out).length ? out : null;
}

export const W = { x: 0, z: 0 }, W2 = { x: 0, z: 0 };

export const MP = {};
