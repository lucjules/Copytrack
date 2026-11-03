// Mode carrière (v1.5) : les circuits intégrés, rangés du plus facile au plus dur,
// sont regroupés en chapitres de 6. Un chapitre s'ouvre avec 4 médailles dans le
// précédent. Chaque circuit a un objectif bonus qui rapporte des pièces une fois.
import { profile, saveProfile, addCoins } from './profile.js';

export const CHAPTER_SIZE = 6;
export const UNLOCK_MEDALS = 4;
export const GOAL_COINS = 50;

export const CHAPTERS = [
  { name: 'Premiers tours', desc: 'Virages, petits sauts et premiers revêtements.' },
  { name: 'Prise de vitesse', desc: 'Accélérateurs, loopings et virages relevés.' },
  { name: 'Métamorphoses', desc: 'Moto, bateau et deltaplane entrent en piste.' },
  { name: 'Terrains piégés', desc: 'Glace, boue, vent, sable et routes sans bordures.' },
  { name: 'Haute voltige', desc: 'Tubes, tire-bouchons, montées en L et anneaux dans les airs.' },
  { name: 'Grand huit', desc: 'Des circuits longs qui mélangent tout.' },
  { name: 'Légendes', desc: 'Les plus durs : précision et sang-froid.' },
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

export const chapterOf = (i) => Math.floor(i / CHAPTER_SIZE);

// medalOf(i) -> médaille du joueur sur le circuit i (ou null).
export function chapterUnlocked(ch, medalOf, total) {
  if (ch <= 0 || profile().eggs?.unlockAll) return true;
  let n = 0;
  for (let i = (ch - 1) * CHAPTER_SIZE; i < Math.min(total, ch * CHAPTER_SIZE); i++) if (medalOf(i)) n++;
  return n >= UNLOCK_MEDALS;
}
