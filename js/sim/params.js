// Paramètres de simulation d'un circuit (Copytrack Evolution, E8) : ce que la physique lit en plus du circuit lui-même. Additifs : à leur valeur
// par défaut (adhérence 100 %, pas de vent), la course est celle d'avant au bit près (l'empreinte des scénarios existants ne change pas ;
// la physique ne fait même pas la multiplication). Les valeurs viennent des règles du circuit (track.js, table RULES : grip, wind, windDir), qui
// entrent dans sa signature dès qu'elles ne sont plus par défaut. Dans la fermeture de la vérification serveur : dmath seulement.
import { dsin, dcos } from '../dmath.js';
import { CAR } from '../physics/specs.js';

export const WIND_MAX = 0.5;              // vent à 100 % = la moitié de la poussée d'une pièce « Vent latéral » à pleine force (CAR.wind)
export const DEFAULT_PARAMS = Object.freeze({ grip: 1, windOn: false, windX: 0, windZ: 0 });

export function paramsOf(track) {
  const g = track && track.grip != null ? track.grip : 100, w = track && track.wind ? track.wind : 0;
  if (g === 100 && !w) return DEFAULT_PARAMS;
  const a = ((track.windDir || 0) * Math.PI) / 180, k = (w / 100) * CAR.wind * WIND_MAX;
  // Accélération du vent dans le monde : 0° souffle vers -z (le nord de l'éditeur), 90° vers +x.
  return Object.freeze({ grip: g / 100, windOn: k > 0, windX: k * dsin(a), windZ: -k * dcos(a) });
}
