// Profils de HUD (Copytrack Evolution, E5) et réglages du HUD d'entraînement. Un profil choisit ce qui s'affiche PAR-DESSUS la personnalisation
// du joueur (lot 11 : un élément caché par le joueur reste caché) ; « Entraînement » ajoute les outils d'analyse en direct (race/training.js).
// Purement visuel : rien ici ne touche à la course. Module pur, testé sous Node.
import { HUD_HIDE } from './uitheme.js';

export const HUD_PROFILES = {
  classic: { label: 'Classique', hide: [] },
  competitive: { label: 'Compétitif', hide: ['hint', 'medals', 'track'] },
  training: { label: 'Entraînement', hide: ['hint'], training: true },
  minimal: { label: 'Minimaliste', hide: ['split', 'best', 'medals', 'boost', 'hint', 'track'] },
};
export const TRAIN_WIDGETS = { delta: 'Écart en direct', sector: 'Secteurs', vmax: 'Vitesse maxi', g: 'Forces g', traces: 'Gaz, frein et vitesse', line: 'Ligne de la référence', brakes: 'Repères de freinage' };
export const TRAIN_REFS = { record: 'Mon record', gold: 'Fantôme or (pilote automatique)', world: 'Record mondial (en ligne)' };
export const DEFAULT_TRAINING = Object.freeze({ ref: 'record', w: Object.freeze(Object.fromEntries(Object.keys(TRAIN_WIDGETS).map((k) => [k, true]))) });

export const sanitizeHudProfile = (p) => (typeof p === 'string' && Object.hasOwn(HUD_PROFILES, p) ? p : 'classic');
export function sanitizeTraining(t) {
  const o = t && typeof t === 'object' ? t : {};
  const w = {};
  for (const k of Object.keys(TRAIN_WIDGETS)) w[k] = !(o.w && o.w[k] === false);
  return { ref: typeof o.ref === 'string' && Object.hasOwn(TRAIN_REFS, o.ref) ? o.ref : 'record', w };
}

// Éléments cachés : ceux du joueur ET ceux du profil.
export function effectiveHide(ui, profile) {
  const p = HUD_PROFILES[sanitizeHudProfile(profile)];
  const out = {};
  for (const k of Object.keys(HUD_HIDE)) if ((ui && ui.hide && ui.hide[k]) || p.hide.includes(k)) out[k] = true;
  return out;
}
export const isTraining = (profile) => !!HUD_PROFILES[sanitizeHudProfile(profile)].training;
