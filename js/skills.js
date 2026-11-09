// Académie 2 (Copytrack Evolution, E12) : des COMPÉTENCES (trajectoire, freinage, dérapage, sauts) et des EXERCICES ÉVALUÉS. Chaque exercice est un
// court circuit avec un objectif MESURÉ par l'analyse (analysis/drill.js : la course rejouée à partir de ses commandes), noté bronze, argent ou or.
// Le niveau d'une compétence est la meilleure note de ses exercices. Les six leçons de l'Académie (academy.js) restent ce qu'elles sont.
// Données et règles pures ; l'écran est dans app/academy.js. Aucun effet sur la course : on ne fait que mesurer.
//
// Profil : drills = { idExercice: { lvl: 0 à 3, best: meilleure mesure } } ; fusion cloud : niveau au maximum, meilleure mesure (mergeDrills).
// Les seuils sont calés sur le pilote automatique (tools/test-skills.mjs les vérifie) : à 60 % de son adhérence, bronze ; à 80 %, argent ;
// à 100 %, or. Le dérapage et les réceptions se jugent sur des gestes (mini-turbo renforcé, réception à plat), démontrés par des courses scriptées.
import { profile, saveProfile, addCoins } from './profile.js';

export const SKILLS = [
  { id: 'trajectoire', name: 'Trajectoire', icon: '〰️' },
  { id: 'freinage', name: 'Freinage', icon: '🛑' },
  { id: 'derapage', name: 'Dérapage', icon: '💨' },
  { id: 'vol', name: 'Sauts et réceptions', icon: '🪂' },
];
export const GRADE_NAMES = ['', 'bronze', 'argent', 'or'];
export const GRADE_ICONS = ['·', '🥉', '🥈', '🥇'];
export const DRILL_COINS = [0, 10, 15, 25];          // pièces la première fois qu'une note est atteinte (bronze, argent, or : 50 en tout par exercice)

const kmh = (v) => `${Math.round(v)} km/h`;
const sec = (v) => `${v.toFixed(2).replace('.', ',')} s`;

// measure : ce qui est mesuré ; better : 'high' ou 'low' (pour garder la meilleure mesure) ; goals : les trois objectifs (texte) ; grade(m) : 0 à 3.
export const DRILLS = [
  {
    id: 'chicanes', skill: 'trajectoire', name: 'Chicanes', decor: 'desert',
    script: 'start S2 R L R L S C S2 L R L R S2 finish', zones: [[2, 7], [10, 15]],
    measure: 'zoneSpeed', better: 'high', unit: kmh, thresholds: [100, 114, 124],
    goals: ['Vitesse moyenne dans les chicanes : {v} km/h ou plus'],
    intro: ['Deux séries de quatre virages serrés. Ce qui compte : la <b>vitesse moyenne dans les chicanes</b>, mesurée de l’entrée à la sortie.', 'Coupe au plus court : passe près de l’intérieur de chaque virage et redresse tôt pour enchaîner le suivant.', 'Freine avant la chicane, pas dedans : chaque correction brusque fait perdre de la vitesse.'],
    tip: 'Vitesse moyenne dans les chicanes : coupe près de l’intérieur, redresse tôt.',
  },
  {
    id: 'freinage', skill: 'freinage', name: 'Freiner tard', decor: 'desert',
    script: 'start B3 S2 R S2 C B3 S2 L S3 finish', zones: [[3, 7], [12, 16]],
    measure: 'zoneTime', better: 'low', unit: sec, thresholds: [7.0, 6.5, 6.05],   // 0.9.12 : recalés sur le moteur mesuré
    goals: ['Temps dans les deux zones de freinage : {v} s ou moins'],
    intro: ['Deux lignes droites avec turbo, chacune finie par un virage à angle droit. Ce qui compte : le <b>temps entre l’approche et la sortie</b> de chaque virage.', 'Freine <b>tard et fort</b>, d’un coup, puis relâche le frein avant de tourner : on ne freine pas en tournant.', 'Freiner trop tôt fait perdre du temps ; trop tard, la voiture tape le mur.'],
    tip: 'Freine tard et fort, relâche avant de tourner.',
  },
  {
    id: 'miniturbo', skill: 'derapage', name: 'Mini-turbo renforcé', decor: 'desert',
    script: 'start S RR S2 finish', zones: [],
    measure: 'turbo', better: 'high', limit: 11.5,
    goals: ['Un mini-turbo', 'Un mini-turbo renforcé (glisse de 1,5 s)', 'Un mini-turbo renforcé, sans choc, arrivée en {t} s ou moins'],
    intro: ['Un seul grand virage, pour apprendre le <b>mini-turbo renforcé</b>.', 'Avant le virage : volant à fond, puis <b>{brake}</b> environ une demi-seconde. L’arrière glisse.', 'Accélère en gardant le volant tourné : la glisse se charge. Au bout d’<b>une seconde et demie</b>, les étincelles changent de couleur ; redresse, et la poussée est plus forte.'],
    tip: 'Volant à fond, frein une demi-seconde, puis accélère en gardant la glisse 1,5 s.',
  },
  {
    id: 'receptions', skill: 'vol', name: 'Trois réceptions', decor: 'desert',
    script: 'start B2 S [crv1] UU G2 DD [cdo1] S C B S [crv1] UU G2 DD [cdo1] S C B S [crv1] UU G2 DD [cdo1] S2 finish', zones: [],
    measure: 'landings', better: 'high', thresholds: [1, 2, 3],
    goals: ['{v} réception(s) parfaite(s) sur 3'],
    intro: ['Trois tremplins. Ce qui compte : le nombre de <b>réceptions parfaites</b> (étincelles vertes).', 'En l’air, <b>{accelerate}</b> baisse le nez et <b>{brake}</b> le relève : retombe à plat sur la pente.', 'Ne touche à rien si l’assiette est déjà bonne : le tremplin est réglé pour.'],
    tip: 'En l’air : accélérer = nez en bas, freiner = nez en haut. Retombe à plat.',
  },
];
export const drillById = (id) => DRILLS.find((d) => d.id === id) || null;

// Note d'une mesure (m : analysis/drill.js measureRun) : 0 (rien) à 3 (or). Une course non finie n'a pas de note.
export function gradeDrill(d, m) {
  if (!m || !m.finished) return 0;
  if (d.measure === 'turbo') {
    if (m.turboLv >= 2 && m.walls === 0 && m.time <= d.limit) return 3;
    return m.turboLv >= 2 ? 2 : m.turboLv >= 1 ? 1 : 0;
  }
  const v = valueOf(d, m);
  if (v == null) return 0;
  let g = 0;
  for (let i = 0; i < 3; i++) if (d.better === 'high' ? v >= d.thresholds[i] : v <= d.thresholds[i]) g = i + 1;
  return g;
}
// La valeur gardée comme « meilleure mesure ».
export function valueOf(d, m) {
  if (!m || !m.finished) return null;
  switch (d.measure) {
    case 'zoneSpeed': return m.zoneSpeed;
    case 'zoneTime': return m.zoneTime;
    case 'landings': return m.perfect;
    case 'turbo': return m.turboLv * 10 + (m.walls === 0 ? 1 : 0);      // renforcé sans choc > renforcé > simple
    default: return null;
  }
}
// Texte de la mesure, pour le bilan.
export function describeMeasure(d, m) {
  if (!m || !m.finished) return 'Course non terminée';
  switch (d.measure) {
    case 'zoneSpeed': return m.zoneSpeed == null ? '—' : `${kmh(m.zoneSpeed)} de moyenne dans les chicanes`;
    case 'zoneTime': return m.zoneTime == null ? '—' : `${sec(m.zoneTime)} dans les zones de freinage`;
    case 'landings': return `${m.perfect} réception${m.perfect > 1 ? 's' : ''} parfaite${m.perfect > 1 ? 's' : ''} sur 3`;
    case 'turbo': return `${m.turboLv >= 2 ? 'Mini-turbo renforcé' : m.turboLv ? 'Mini-turbo simple' : 'Aucun mini-turbo'}, ${m.walls} choc${m.walls > 1 ? 's' : ''}, ${sec(m.time)}`;
    default: return '';
  }
}
// Les trois objectifs, chiffrés (bronze, argent, or).
export function goalTexts(d) {
  if (d.measure === 'turbo') return d.goals.map((g) => g.replace('{t}', String(d.limit).replace('.', ',')));
  const fmt = (v) => (d.measure === 'zoneTime' ? v.toFixed(2).replace('.', ',') : String(v));
  return d.thresholds.map((v) => d.goals[0].replace('{v}', fmt(v)));
}

// ---- Profil ----------------------------------------------------------------------------------------------------------------------------
const drillsOf = (p) => (p.drills && typeof p.drills === 'object' && !Array.isArray(p.drills) ? p.drills : {});
export const drillLevel = (id) => { const e = drillsOf(profile())[id]; return e ? e.lvl | 0 : 0; };
export const drillBest = (id) => { const e = drillsOf(profile())[id]; return e && Number.isFinite(e.best) ? e.best : null; };
export function skillLevel(skill) { return DRILLS.filter((d) => d.skill === skill).reduce((m, d) => Math.max(m, drillLevel(d.id)), 0); }
export const skillLevels = () => Object.fromEntries(SKILLS.map((s) => [s.id, skillLevel(s.id)]));
// Point faible : la compétence au plus bas niveau (la première dans l'ordre en cas d'égalité) et son exercice le moins réussi ; null si tout est en or.
export function weakestDrill() {
  let best = null;
  for (const s of SKILLS) {
    const lvl = skillLevel(s.id);
    if (lvl >= 3) continue;
    if (!best || lvl < best.lvl) best = { skill: s, lvl };
  }
  if (!best) return null;
  const ds = DRILLS.filter((d) => d.skill === best.skill.id).sort((a, b) => drillLevel(a.id) - drillLevel(b.id));
  return { skill: best.skill, lvl: best.lvl, drill: ds[0], index: DRILLS.indexOf(ds[0]) };
}

// Enregistre une note : { lvl, prev, coins, best, newBest }. Les pièces récompensent chaque note atteinte pour la première fois.
export function recordDrill(id, grade, value) {
  const d = drillById(id);
  if (!d) return { lvl: 0, prev: 0, coins: 0, best: null, newBest: false };
  const p = profile();
  p.drills = drillsOf(p);
  const e = p.drills[id] || { lvl: 0, best: null };
  const prev = e.lvl | 0, lvl = Math.max(prev, grade | 0);
  let coins = 0;
  for (let g = prev + 1; g <= lvl; g++) coins += DRILL_COINS[g];
  const better = (a, b) => (b == null ? a : a == null ? b : d.better === 'low' ? Math.min(a, b) : Math.max(a, b));
  const newBest = value != null && Number.isFinite(value) && (e.best == null || better(value, e.best) !== e.best);
  p.drills[id] = { lvl, best: value != null && Number.isFinite(value) ? better(+value.toFixed(3), e.best) : e.best };
  saveProfile();
  if (coins) addCoins(coins);
  return { lvl, prev, coins, best: p.drills[id].best, newBest };
}

// Fusion de deux profils (cloudsave.js) : par exercice, le meilleur niveau et la meilleure mesure ; les exercices inconnus de cette version sont gardés tels quels.
export function mergeDrills(a, b) {
  const A = a && typeof a === 'object' && !Array.isArray(a) ? a : {}, B = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
  const out = {};
  for (const id of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const x = A[id] || {}, y = B[id] || {}, d = drillById(id);
    const bx = Number.isFinite(x.best) ? x.best : null, by = Number.isFinite(y.best) ? y.best : null;
    const best = bx == null ? by : by == null ? bx : d && d.better === 'low' ? Math.min(bx, by) : Math.max(bx, by);
    out[id] = { lvl: Math.max(Math.min(3, x.lvl | 0), Math.min(3, y.lvl | 0)), best };
  }
  return out;
}

// Conseil adapté : la compétence qu'un conseil du coach (analysis/coach.js) fait travailler, et l'exercice correspondant (ou null).
export const COACH_SKILL = { 'late-brake': 'freinage', 'early-brake': 'freinage', 'slow-corner': 'trajectoire', 'wide-line': 'trajectoire', wall: 'trajectoire', air: 'vol' };
export function drillForTip(tipId) {
  const s = COACH_SKILL[tipId];
  if (!s) return null;
  const ds = DRILLS.filter((d) => d.skill === s).sort((a, b) => drillLevel(a.id) - drillLevel(b.id));
  return ds.length ? { drill: ds[0], index: DRILLS.indexOf(ds[0]) } : null;
}
