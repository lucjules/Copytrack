// Catalogue de personnalisation du véhicule. 100 % visuel : aucune de ces options
// ne modifie la physique (voir CAR dans physics.js, qui ne dépend pas du modèle 3D).

import { DEFAULT_CUSTOM, sanitizeCustom, cloneCustom } from './custom.js';

export const CATEGORIES = [
  { id: 'body', label: 'Carrosserie' },
  { id: 'colors', label: 'Couleurs' },
  { id: 'led', label: 'LED' },
  { id: 'decal', label: 'Dessins' },
  { id: 'ornament', label: 'Ornements' },
  { id: 'spoiler', label: 'Ailerons' },
  { id: 'wheels', label: 'Roues' },
  { id: 'finish', label: 'Finition' },
  { id: 'bike', label: 'Moto' },
  { id: 'trail', label: 'Traînée' },
  { id: 'horn', label: 'Klaxon' },
  { id: 'studio', label: 'Atelier' },
  { id: 'presets', label: 'Presets' },
  { id: 'collections', label: 'Collections' },
];

export const CATALOG = {
  body: [
    { id: 'buggy', label: 'Buggy', cost: 0 },
    { id: 'sport', label: 'Sport', cost: 150 },
    { id: 'hatch', label: 'Citadine', cost: 120 },
    { id: 'muscle', label: 'Muscle', cost: 200 },
    { id: 'rally', label: 'Rallye', cost: 250 },
    { id: 'wedge', label: 'Fléchette', cost: 300 },
    { id: 'pickup', label: 'Pick-up', cost: 260 },
    { id: 'formula', label: 'Monoplace', cost: 380 },
  ],
  // v1.5 : finition de la peinture (aspect seulement).
  finish: [
    { id: 'gloss', label: 'Brillante', cost: 0 },
    { id: 'matte', label: 'Mate', cost: 60 },
    { id: 'metal', label: 'Métallisée', cost: 120 },
    { id: 'pearl', label: 'Nacrée', cost: 180 },
  ],
  // Forme de la moto (plaque moto).
  bike: [
    { id: 'street', label: 'Routière', cost: 0 },
    { id: 'chopper', label: 'Chopper', cost: 220 },
  ],
  // Traînée lumineuse en l'air et pendant les turbos.
  trail: [
    { id: 'none', label: 'Aucune', cost: 0 },
    { id: 'comet', label: 'Comète', cost: 80, color: '#7fe9ff' },
    { id: 'ember', label: 'Braise', cost: 120, color: '#ff7a1f' },
    { id: 'aurora', label: 'Aurore', cost: 160, color: '#7dffb0' },
    { id: 'rainbow', label: 'Arc-en-ciel', cost: 220, rainbow: true },
    // Exclusivité (0.9.18) : ne s'achète pas, se mérite (champ `exclusive` : comment). Voir rewards.js.
    { id: 'gold', label: 'Traînée dorée', cost: 0, color: '#ffd23e', exclusive: 'Terminer 7 défis du jour différents' },
    { id: 'frost', label: 'Traînée givrée', cost: 0, color: '#bfeaff', exclusive: 'Une série de 7 défis du jour d’affilée' },
  ],
  // Klaxon (touche H).
  horn: [
    { id: 'classic', label: 'Classique', cost: 0 },
    { id: 'duo', label: 'Deux tons', cost: 30 },
    { id: 'tuba', label: 'Grave', cost: 50 },
    { id: 'arcade', label: 'Arcade', cost: 70 },
  ],
  led: [
    { id: 'none', label: 'Aucune', cost: 0 },
    { id: 'cyan', label: 'Cyan', cost: 40, color: '#36e9ff' },
    { id: 'pink', label: 'Rose', cost: 40, color: '#ff4fd8' },
    { id: 'lime', label: 'Citron vert', cost: 50, color: '#8dff4f' },
    { id: 'amber', label: 'Ambre', cost: 50, color: '#ffb02e' },
    { id: 'violet', label: 'Violet', cost: 60, color: '#9b6bff' },
    { id: 'pulse', label: 'Pulsation', cost: 150, color: '#36e9ff', pulse: true },
    { id: 'rainbow', label: 'Arc-en-ciel', cost: 250, rainbow: true },
    { id: 'emerald', label: 'Émeraude', cost: 0, color: '#2dffb0', exclusive: 'Une médaille sur les 6 circuits de l’Atelier' },
    { id: 'sunset', label: 'Crépuscule', cost: 0, color: '#ff8c5a', exclusive: 'Réussir les 6 leçons de l’Académie' },
    { id: 'toxic', label: 'Toxique', cost: 0, color: '#b6ff3b', exclusive: 'Terminer 10 mutations du jour' },
  ],
  decal: [
    { id: 'none', label: 'Aucun', cost: 0 },
    { id: 'stripe', label: 'Bande', cost: 30 },
    { id: 'twin', label: 'Double bande', cost: 40 },
    { id: 'dots', label: 'Pois', cost: 50 },
    { id: 'checker', label: 'Damier', cost: 60 },
    { id: 'stars', label: 'Étoiles', cost: 80 },
    { id: 'flames', label: 'Flammes', cost: 90 },
    { id: 'bolt', label: 'Éclair', cost: 100 },
  ],
  ornament: [
    { id: 'none', label: 'Aucun', cost: 0 },
    { id: 'antenna', label: 'Antenne', cost: 20 },
    { id: 'flag', label: 'Fanion', cost: 40 },
    { id: 'cone', label: 'Cône', cost: 50 },
    { id: 'fin', label: 'Aileron requin', cost: 60 },
    { id: 'beacon', label: 'Gyrophare', cost: 70 },
    { id: 'horns', label: 'Cornes', cost: 90 },
    { id: 'crown', label: 'Couronne', cost: 300 },
  ],
  spoiler: [
    { id: 'wing', label: 'Classique', cost: 0 },
    { id: 'none', label: 'Aucun', cost: 0 },
    { id: 'low', label: 'Bec bas', cost: 30 },
    { id: 'duck', label: 'Becquet', cost: 50 },
    { id: 'gt', label: 'GT haut', cost: 60 },
    { id: 'double', label: 'Double plan', cost: 90 },
    { id: 'big', label: 'Géant', cost: 140 },
  ],
  wheels: [
    { id: 'classic', label: 'Classiques', cost: 0 },
    { id: 'spoke', label: 'À rayons', cost: 40 },
    { id: 'disc', label: 'Pleines', cost: 40 },
    { id: 'neon', label: 'Néon', cost: 90 },
    { id: 'gold', label: 'Dorées', cost: 150 },
  ],
};

export const COLOR_CHOICES = [
  '#ffd23e', '#ff5a5f', '#3ec1ff', '#7cf06b', '#c77dff', '#ff8c42', '#f4f1ea', '#2f3247',
  '#ff4fd8', '#2fd3b5', '#ffffff', '#111118', '#b0b6c8', '#8a1c2e', '#1d4fb8', '#e8c27a',
];

export const DEFAULT_LOADOUT = {
  body: 'buggy', color: '#ffd23e', color2: '#23242f', decalColor: '#ffffff',
  spoiler: 'wing', led: 'none', decal: 'none', ornament: 'none', wheels: 'classic',
  finish: 'gloss', bike: 'street', trail: 'none', horn: 'classic',
  custom: DEFAULT_CUSTOM,       // lot 10 : pièces libres, peinture avancée, dessin, effets (custom.js) ; gratuit, purement visuel
};

export const PRESETS = [
  { id: 'classic', label: 'Classique', loadout: { ...DEFAULT_LOADOUT } },
  { id: 'neon', label: 'Néon de nuit', loadout: { body: 'sport', color: '#111118', color2: '#36e9ff', decalColor: '#36e9ff', spoiler: 'gt', led: 'cyan', decal: 'stripe', ornament: 'none', wheels: 'neon' } },
  { id: 'flame', label: 'Flamme', loadout: { body: 'muscle', color: '#ff5a5f', color2: '#23242f', decalColor: '#ffd23e', spoiler: 'duck', led: 'amber', decal: 'flames', ornament: 'none', wheels: 'disc' } },
  { id: 'rally', label: 'Rallye', loadout: { body: 'rally', color: '#1d4fb8', color2: '#f4f1ea', decalColor: '#f4f1ea', spoiler: 'big', led: 'none', decal: 'twin', ornament: 'antenna', wheels: 'spoke' } },
  { id: 'royal', label: 'Royal', loadout: { body: 'wedge', color: '#8a1c2e', color2: '#e8c27a', decalColor: '#e8c27a', spoiler: 'double', led: 'violet', decal: 'stars', ornament: 'crown', wheels: 'gold' } },
  { id: 'party', label: 'Soirée', loadout: { body: 'hatch', color: '#ff4fd8', color2: '#2fd3b5', decalColor: '#ffffff', spoiler: 'low', led: 'rainbow', decal: 'dots', ornament: 'beacon', wheels: 'neon' } },
  { id: 'racer', label: 'Pilote', loadout: { body: 'sport', color: '#f4f1ea', color2: '#ff5a5f', decalColor: '#ff5a5f', spoiler: 'gt', led: 'none', decal: 'checker', ornament: 'flag', wheels: 'spoke' } },
  { id: 'desert', label: 'Désert', loadout: { body: 'pickup', color: '#e8c27a', color2: '#8a1c2e', decalColor: '#2f3247', spoiler: 'none', led: 'amber', decal: 'stripe', ornament: 'antenna', wheels: 'spoke', finish: 'matte', trail: 'ember' } },
  { id: 'f1', label: 'Monoplace', loadout: { body: 'formula', color: '#ff5a5f', color2: '#f4f1ea', decalColor: '#f4f1ea', spoiler: 'double', led: 'none', decal: 'twin', ornament: 'none', wheels: 'disc', finish: 'gloss', trail: 'comet' } },
  { id: 'chrome', label: 'Chrome', loadout: { body: 'wedge', color: '#b0b6c8', color2: '#111118', decalColor: '#36e9ff', spoiler: 'gt', led: 'cyan', decal: 'none', ornament: 'none', wheels: 'gold', finish: 'metal', bike: 'chopper', trail: 'rainbow', horn: 'arcade' } },
  { id: 'shark', label: 'Requin', loadout: { body: 'wedge', color: '#b0b6c8', color2: '#2f3247', decalColor: '#ffffff', spoiler: 'low', led: 'pink', decal: 'bolt', ornament: 'fin', wheels: 'classic' } },
];

export function itemCost(cat, id) {
  const it = (CATALOG[cat] || []).find((x) => x.id === id);
  return it ? it.cost : 0;
}

// Élément exclusif : jamais en vente, débloqué par un exploit (rewards.js). Renvoie le texte « comment l'obtenir », ou '' pour un élément ordinaire.
export function exclusiveOf(cat, id) {
  const it = (CATALOG[cat] || []).find((x) => x.id === id);
  return (it && it.exclusive) || '';
}

const KEYS = ['body', 'led', 'decal', 'ornament', 'spoiler', 'wheels', 'finish', 'bike', 'trail', 'horn'];

export function sanitizeLoadout(l) {
  const out = { ...DEFAULT_LOADOUT, custom: cloneCustom() };
  if (!l) return out;
  for (const k of KEYS) if ((CATALOG[k] || []).some((x) => x.id === l[k])) out[k] = l[k];
  for (const k of ['color', 'color2', 'decalColor']) if (/^#[0-9a-f]{6}$/i.test(l[k] || '')) out[k] = l[k];
  out.custom = sanitizeCustom(l.custom);
  return out;
}

// Éléments payants d'un équipement : [[catégorie, id], ...]
export function itemsOf(loadout) {
  return KEYS.map((k) => [k, loadout[k]]).filter(([k, id]) => itemCost(k, id) > 0 || exclusiveOf(k, id));
}
