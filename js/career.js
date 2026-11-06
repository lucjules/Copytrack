// Mode carrière (v1.5) : les circuits intégrés, rangés du plus facile au plus dur,
// sont regroupés en chapitres de 6. Un chapitre s'ouvre avec 4 médailles dans le
// précédent. Chaque circuit a un objectif bonus qui rapporte des pièces une fois.
import { profile, saveProfile, addCoins } from './profile.js';

export const CHAPTER_SIZE = 6;
export const UNLOCK_MEDALS = 4;
const GOAL_COINS = 50;

// 0.9.6 : profils de circuits (champ `profil` des circuits intégrés). Chaque circuit est conçu pour une expérience précise ; la pastille
// de la carte de carrière l'annonce. Les mesures qui définissent chaque profil sont vérifiées par tools/contract.mjs (appliqué à tous les circuits par tools/test-niveaux.mjs).
export const PROFILS = {
  sprint: { cls: 'p-sprint', label: 'Sprint', tip: 'Presque tout droit : le chrono pur, la trajectoire fait la différence.' },
  speedway: { cls: 'p-speedway', label: 'Speedway', tip: 'Très grands virages, longues lignes droites : on garde la vitesse de pointe.' },
  technique: { cls: 'p-technique', label: 'Technique', tip: 'Freinages forts et relances rapides : la courbe d’accélération se travaille.' },
  rollercoaster: { cls: 'p-rollercoaster', label: 'Rollercoaster', tip: 'Verticalité extrême : murs, boucles et chutes.' },
  acrobatique: { cls: 'p-acrobatique', label: 'Acrobatique', tip: 'Sauts et réceptions : l’élan décide de tout.' },
};

// 0.9 : un chapitre par thème, dans l'ordre de THEME_ORDER (tracks.js).
export const CHAPTERS = [
  { name: 'Désert crépuscule', decor: 'desert', desc: 'Sprint, speedway, tremplins, épingles et grand huit : tous les profils de circuits, avec un wall-ride dès le premier.' },
  { name: 'Jungle néon', decor: 'jungle', desc: 'Rampe de lancement, tube, rebonds de champignons et slalom en moto : la jungle au grand complet.' },
  { name: 'Archipel tropical', decor: 'isles', desc: 'Descente en moto, slalom en bateau et décollage en deltaplane autour du phare.' },
  { name: 'Ville futuriste', decor: 'city', desc: 'Tapis roulant express, boucles, métro aérien, toits et lift hill : la ville monte en puissance.' },
  { name: 'Nuit polaire', decor: 'polar', desc: 'Départ sur la glace, rebonds en terrasses, toboggan aimanté, hélices et poudreuse.' },
  { name: 'Volcan', decor: 'volcano', desc: 'Collines de braises, plaque de dérive, cheminée verticale, caldeira à deux tours et éruptions.' },
  { name: 'Station orbitale', decor: 'orbit', desc: 'Tube d’amarrage, basse gravité, moto, grand anneau à trois tours et apesanteur.' },
  { name: 'Fonds marins', decor: 'reef', desc: 'Contre-courants, gravité lourde, pont de verre et plongée vers les abysses.' },
  { name: 'Usine mécanique', decor: 'factory', desc: 'Moteur coupé, bifurcation, pistons, marteau et ralentisseurs : l’usine ne pardonne rien.' },
  { name: 'Ville dans les nuages', decor: 'sky', desc: 'Vent de travers, îles sans bordures, gravité réduite, pont des vents et départ en deltaplane.' },
  { name: 'Canyon de cristal', decor: 'caves', desc: 'Volant inversé, vrilles, inversions de gravité, plafonds et verre fragile.' },
];

// Objectifs bonus.
export const GOALS = {
  nowall: { label: 'Finir sans toucher de muret' },
  norespawn: { label: 'Finir sans réapparition' },
  perfect: { label: (n) => `${n} réception${n > 1 ? 's' : ''} parfaite${n > 1 ? 's' : ''}` },
  turbo: { label: (n) => `${n} mini-turbo${n > 1 ? 's' : ''}` },
  rings: { label: (n) => `Passer dans ${n} anneau${n > 1 ? 'x' : ''} turbo` },
  vehicle: { label: (v) => `Franchir l'arrivée en ${{ moto: 'moto', boat: 'bateau', glider: 'deltaplane', car: 'voiture' }[v] || v}` },
  under: { label: (t) => `Finir en moins de ${t} s` },
};

export function goalFor(def, index) {
  if (def.goal) return def.goal;
  const cycle = [{ id: 'nowall' }, { id: 'norespawn' }, { id: 'turbo', n: 1 }];
  return cycle[index % cycle.length];
}

export function goalLabel(goal) {
  const G = GOALS[goal.id];
  if (!G) return '';
  return typeof G.label === 'function' ? G.label(goal.n ?? goal.v ?? goal.t) : G.label;
}

export function goalMet(goal, st) {
  switch (goal.id) {
    case 'nowall': return st.wallHits === 0;
    case 'norespawn': return st.respawns === 0;
    case 'perfect': return st.perfects >= (goal.n || 1);
    case 'turbo': return st.turbos >= (goal.n || 1);
    case 'rings': return st.rings >= (goal.n || 1);
    case 'vehicle': return st.vehicle === goal.v;
    case 'under': return st.time <= goal.t;
    default: return false;
  }
}

export function goalDone(key) {
  return !!(profile().goals || {})[key];
}

// Marque l'objectif ; renvoie les pièces gagnées (seulement la première fois).
export function completeGoal(key) {
  const p = profile();
  p.goals = p.goals || {};
  if (p.goals[key]) return 0;
  p.goals[key] = 1;
  saveProfile();
  addCoins(GOAL_COINS);
  return GOAL_COINS;
}


// medalOf(i) -> médaille du joueur sur le circuit i (ou null).
export function chapterUnlocked(ch, medalOf, total) {
  if (ch <= 0 || profile().eggs?.unlockAll) return true;
  let n = 0;
  for (let i = (ch - 1) * CHAPTER_SIZE; i < Math.min(total, ch * CHAPTER_SIZE); i++) if (medalOf(i)) n++;
  return n >= UNLOCK_MEDALS;
}

// 0.9.10 : finitions de la carrière. État d'un chapitre : « terminé » = une médaille sur chacun de ses circuits, « parfait » = en plus tous les
// objectifs bonus ; « cristal » = toutes les médailles sont des cristaux. Fonctions pures (testées), l'écran ne fait que les afficher.
export function chapterState(medalIds, goalsDone, size = CHAPTER_SIZE) {
  const n = medalIds.filter(Boolean).length;
  if (n < size) return { id: 'open', label: '' };
  if (medalIds.every((m) => m === 'cristal') && goalsDone >= size) return { id: 'crystal', label: '✦ Chapitre cristal' };
  if (goalsDone >= size) return { id: 'perfect', label: '★ Chapitre parfait' };
  return { id: 'done', label: '✓ Chapitre terminé' };
}

// Bilan de toute la carrière : medalIds = id de médaille (ou null) pour chaque circuit, goalsDone = nombre d'objectifs bonus réussis.
export function careerSummary(medalIds, goalsDone) {
  const total = medalIds.length, medals = medalIds.filter(Boolean).length;
  const crystal = medalIds.filter((m) => m === 'cristal').length;
  const pct = total ? Math.round(((medals + goalsDone + crystal) / (3 * total)) * 100) : 0;
  return { total, medals, crystal, goals: goalsDone, pct, finished: total > 0 && medals === total, complete: total > 0 && medals === total && goalsDone === total && crystal === total };
}
