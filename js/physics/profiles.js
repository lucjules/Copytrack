// Profils physiques (Copytrack Evolution, E20) : Arcade, Classique, Simulation. Une règle du circuit (`pm`, table RULES de track.js) ou une
// catégorie de record (variante `pm-…`) : jamais un achat, jamais une amélioration. Classique est la physique de toujours : sans profil,
// specsOf renvoie null et la voiture lit SPECS tel quel (mêmes objets, mêmes nombres : l'empreinte ne change pas).
//   Arcade      plus d'adhérence latérale, lacet plus amorti, arrière qui décroche moins, volant qui revient plus vite, freins plus mordants
//   Simulation  pneus plus progressifs et moins d'adhérence, moins d'amortissement, freins plus longs ; les modèles de véhicules v2 (moto,
//               bateau, deltaplane : physics/vehicles/) sont en service
// Dans la fermeture de la vérification serveur : des multiplications, rien d'autre.
import { SPECS } from './specs.js';

export const PROFILE_IDS = ['arcade', 'sim'];
const MUL = {
  arcade: { latGrip: 1.15, yawDamp: 1.45, steerOut: 1.3, brake: 1.08, airPitchAcc: 1.2, corner: 1.1 },
  sim: { latGrip: 0.93, yawDamp: 0.75, corner: 0.82, brake: 0.9, steerAlat: 0.9 },
};
const REAR = { arcade: (r) => Math.min(0.92, r + 0.12), sim: (r) => r };      // adhérence arrière en dérapage

const cache = new Map();
// Réglages des quatre véhicules sous un profil (null : Classique, la physique de toujours).
export function specsOf(profile) {
  if (!MUL[profile]) return null;
  if (cache.has(profile)) return cache.get(profile);
  const out = {};
  for (const [veh, K] of Object.entries(SPECS)) {
    const k = { ...K };
    for (const [f, m] of Object.entries(MUL[profile])) k[f] = K[f] * m;
    k.driftRear = REAR[profile](K.driftRear);
    out[veh] = Object.freeze(k);
  }
  cache.set(profile, Object.freeze(out));
  return cache.get(profile);
}
// Modèles de véhicules v2 en service ? (règle vm = 2, ou profil Simulation)
export const v2Of = (track) => !!track && (track.vm === 2 || track.pm === 'sim');
