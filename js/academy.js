// Académie : six leçons guidées, de très courts circuits qui apprennent UNE chose chacune (conduite, dérapage, mini-turbo, réception, plaque de transformation, obstacles),
// avec un objectif à réussir. Données et règles pures ; l'écran et le lancement sont dans app/academy.js. Aucune médaille, aucun record, aucune statistique : on s'entraîne.
//
// Chaque leçon est une définition de circuit comme celles de tracks.js (script, opts, obst) : buildBuiltin la construit. Objectif : mêmes règles que les objectifs bonus de la carrière (career.js).
import { goalMet, goalLabel } from './career.js';
import { profile, saveProfile, addCoins } from './profile.js';

export const LESSON_COINS = 20;          // pièces la première fois qu'on réussit une leçon
export const GRADUATE_COINS = 60;        // en plus, quand les six sont réussies

// {accelerate} {brake} {left} {right} {respawn} dans les textes : remplacés par les touches réelles du joueur (voir app/academy.js).
export const LESSONS = [
  {
    id: 'prise', name: 'Prise en main', decor: 'desert',
    script: 'start S2 R S2 L S2 C S2 finish', opts: {},
    goal: { id: 'nowall' },
    intro: ['<b>{accelerate}</b> accélère, <b>{brake}</b> freine, <b>{left}</b> / <b>{right}</b> tournent.', 'Passe le <b>checkpoint</b> (le portique), puis la <b>ligne d’arrivée</b>.', 'Reste sur la route : un muret te ralentit et te fait tourner.'],
    tip: 'Reste sur la route, passe le portique puis l’arrivée.',
  },
  {
    id: 'derapage', name: 'Dérapage et mini-turbo', decor: 'desert',
    script: 'start S3 RR S2 C S3 RR S finish', opts: {},
    goal: { id: 'turbo', n: 1 },
    intro: ['Il n’y a pas de bouton de dérapage : c’est le <b>frein pris en virage</b>.', 'Entre dans le grand virage, tourne le volant <b>à fond</b>, puis tiens <b>{brake}</b> environ une seconde sans lâcher le volant : l’arrière glisse.', 'Des étincelles apparaissent : relâche le frein, tu reçois une poussée, le <b>mini-turbo</b>. Plus la glisse dure, plus elle est forte.'],
    tip: 'Volant à fond, puis frein environ une seconde : étincelles, relâche = mini-turbo.',
  },
  {
    id: 'serie', name: 'Mini-turbos en série', decor: 'desert',
    script: 'start S3 RR S3 RR S3 C S3 RR S2 finish', opts: {},
    goal: { id: 'turbo', n: 2 },
    intro: ['Même geste, trois virages d’affilée : <b>volant à fond, frein une seconde, relâche</b>.', 'Enchaîner les mini-turbos fait gagner du temps dans chaque circuit technique de la carrière.', 'Objectif : deux mini-turbos.'],
    tip: 'Deux mini-turbos : volant à fond, frein une seconde, relâche.',
  },
  {
    id: 'reception', name: 'Saut et réception parfaite', decor: 'desert',
    script: 'start B2 S C B2 S [crv1] UU G DD [cdo1] S2 finish', opts: {},
    goal: { id: 'perfect', n: 1 },
    intro: ['En l’air, <b>{accelerate}</b> baisse le nez et <b>{brake}</b> le relève : règle l’assiette pour retomber <b>à plat</b> sur la pente.', 'Une réception parfaite (étincelles vertes) conserve ta vitesse ; une mauvaise te secoue.', 'Garde de l’élan avant le tremplin.'],
    tip: 'En l’air : accélérer = nez en bas, freiner = nez en haut. Retombe à plat.',
  },
  {
    id: 'plaque', name: 'Plaque de transformation', decor: 'desert',
    script: 'start B S.o S3 R S2 finish', opts: {},
    goal: { id: 'vehicle', v: 'moto' },
    intro: ['Les <b>plaques</b> sur la route te transforment : moto, bateau (sur l’eau), deltaplane. Repasser sur la même te rend ta voiture.', 'Ici une plaque de moto : la moto est plus vive, elle penche dans les virages.', 'Objectif : franchir l’arrivée <b>en moto</b>.'],
    tip: 'Roule sur la plaque orange : tu passes en moto. Garde-la jusqu’à l’arrivée.',
  },
  {
    id: 'obstacles', name: 'Obstacles', decor: 'atelier',
    script: 'start B2 S3 C B S3 finish', opts: { l: 6 },
    obst: [{ k: 'spikesPop', at: 0.25, side: 0, s: 1.1, ph: 0.4375 }, { k: 'bumper', at: 0.6, side: -7.5, s: 0.8 }, { k: 'spikes', at: 0.7, side: 7.5, s: 0.7 }],
    goal: { id: 'norespawn' },
    intro: ['Des <b>piques escamotables</b> barrent la route : elles sortent et rentrent toutes les trois secondes. Passe quand elles sont rentrées.', 'Les <b>bumpers</b> repoussent et les <b>piques fixes</b> font reculer : reste au milieu.', 'Objectif : finir sans réapparaître. Après ça, le chapitre bonus <b>Atelier</b> de la carrière t’attend.'],
    tip: 'Passe les piques quand elles sont rentrées ; reste au milieu de la route.',
  },
];

export function lessonDone(id) { return !!(profile().academy || {})[id]; }
export const lessonsDone = () => LESSONS.filter((l) => lessonDone(l.id)).length;
export const academyComplete = () => lessonsDone() === LESSONS.length;
// Première leçon non réussie (ou null si tout est fait).
export const nextLesson = () => { const i = LESSONS.findIndex((l) => !lessonDone(l.id)); return i < 0 ? null : i; };

// Résultat d'une leçon : { passed, text, coins, graduated }. st : statistiques de la course (stats de RaceSession + vehicle + time). Marque la leçon et verse les pièces la première fois.
export function completeLesson(i, st) {
  const L = LESSONS[i];
  const passed = !!L && goalMet(L.goal, st);
  const out = { passed, text: L ? goalLabel(L.goal) : '', coins: 0, graduated: false };
  if (!passed) return out;
  const p = profile();
  p.academy = p.academy || {};
  if (!p.academy[L.id]) {
    p.academy[L.id] = 1;
    out.coins = LESSON_COINS;
    if (lessonsDone() === LESSONS.length) { out.coins += GRADUATE_COINS; out.graduated = true; }
    saveProfile();
    addCoins(out.coins);
  }
  return out;
}
