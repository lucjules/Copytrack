// Aides à la conduite (Copytrack Evolution, E22) et réglage de la réponse du volant. Elles agissent sur les COMMANDES, avant leur enregistrement :
// le replay, les fantômes et la vérification serveur rejouent les commandes effectives, sans relancer les aides (la course se rejoue à
// l'identique). Une course avec aides va dans la catégorie de record « assisté » (étiquette « as-1 », variants.js) : son propre classement,
// sans médailles ni pièces ; elle ne compte ni en saison, ni en duel, ni en tournoi.
//   autoGas      accélération automatique : les gaz restent ouverts tant qu'on ne freine pas
//   brakeAssist  freinage assisté : freine quand la ligne de course demande de ralentir (circuits qui en ont une)
//   steerAssist  direction assistée : le volant est guidé vers la ligne de course (circuits qui en ont une)
//   antiSpin     anti-tête-à-queue : freiner en virage ne fait plus décrocher l'arrière, et le volant se modère quand la voiture glisse
//   smoothSteer  volant adouci : les coups de volant (clavier, boutons) sont lissés
// Réponse du volant (steerCurve, 1 à 2, réglage du ressenti, hors aides) : une commande analogique (manette, pouce) devient progressive.
// Pur et déterministe (pas d'horloge) : l'état des aides n'évolue qu'avec les pas de la course.
import { Autopilot } from './autopilot.js';
import { splitKey, parseVariant, formatVariant, variantKey } from './variants.js';

export const AID_IDS = ['autoGas', 'brakeAssist', 'steerAssist', 'antiSpin', 'smoothSteer'];
const COMPETITION = ['sea', 'duel', 'tour'];

export function cleanAids(a) {
  const o = a && typeof a === 'object' ? a : {};
  return Object.fromEntries(AID_IDS.map((k) => [k, o[k] === true]));
}
export const aidsActive = (a) => AID_IDS.some((k) => !!(a && a[k] === true));

// Clé de classement d'une course avec aides : la même catégorie, plus l'étiquette « as-1 ». null : pas de classement possible (compétition).
export function aidedKey(key) {
  if (!key) return key;
  const { base, variant } = splitKey(key);
  const v = variant ? parseVariant(variant) : {};
  if (COMPETITION.some((k) => v[k] != null)) return null;
  if (v.as != null) return key;
  return formatVariant({ ...v, as: '1' }) ? variantKey(base, { ...v, as: '1' }) : key;
}

// Réponse du volant : |s|^curve, signe gardé (1 : linéaire). Les commandes tout-ou-rien (±1, 0) ne changent pas.
export function steerCurve(s, curve = 1) {
  if (!(curve > 1) || !s) return s;
  const a = Math.min(1, Math.abs(s));
  return Math.sign(s) * a ** Math.min(2, curve);
}

export class DrivingAids {
  constructor(track, cfg) {
    this.cfg = cleanAids(cfg);
    this.bot = (this.cfg.brakeAssist || this.cfg.steerAssist) && track.path ? new Autopilot(track.path, { latLimit: 56 * 0.8 }) : null;
    this.sm = 0;
  }
  // Départ, retour au checkpoint : la ligne de course repart de la position de la voiture.
  reset(phys) { this.sm = 0; if (this.bot) this.bot.reset(phys); }
  // Commandes du joueur -> commandes effectives (celles qui sont enregistrées).
  apply(raw, phys) {
    const c = this.cfg;
    let steer = raw.steer || 0, throttle = !!raw.throttle, brake = !!raw.brake;
    if (c.smoothSteer) { this.sm += (steer - this.sm) * 0.18; steer = Math.abs(this.sm) < 0.01 ? 0 : this.sm; }
    const ref = this.bot ? this.bot.control(phys) : null;              // (avancé à chaque pas : son état suit la course)
    if (c.steerAssist && ref) steer = steer * 0.55 + (ref.steer || 0) * 0.45;
    if (c.autoGas && !brake) throttle = true;
    if (c.brakeAssist && ref && ref.brake && phys.fwdSpeed > 12) { brake = true; throttle = false; }
    if (c.antiSpin) {
      if (brake && !throttle) steer = Math.max(-0.48, Math.min(0.48, steer));      // pas de dérapage provoqué (il faut plus de 0,5)
      if (phys.grounded && phys.fwdSpeed > 8 && phys.slip > 0.12 * phys.fwdSpeed) steer *= 0.6;
    }
    return { steer: Math.max(-1, Math.min(1, steer)), throttle, brake, drift: false };
  }
}
