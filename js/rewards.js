// Récompenses (0.9.18) : titres affichés au classement, éléments EXCLUSIFS du garage (qui ne s'achètent pas), collections à thème. Données et règles pures : le contexte (médailles, défis, leçons…) est
// rassemblé par app/rewards.js, ici on décide seulement ce qui est mérité. Rien ne touche à la physique ni aux temps : tout est visuel.
import { CATALOG } from './cosmetics.js';
import { profile, saveProfile, addCoins, owns } from './profile.js';

// ---- Titres ----------------------------------------------------------------------------------------------------------------------------
// id : ^[a-z0-9-]{1,20}$ (la fonction SQL set_title, supabase/etape8-decouverte.sql, a la même liste : un test les compare).
export const TITLES = [
  { id: 'diplome', label: 'Diplômé', how: 'Réussir les 6 leçons de l’Académie', test: (c) => c.academy >= 6 },
  { id: 'mecano', label: 'Mécano', how: 'Une médaille sur les 6 circuits de l’Atelier', test: (c) => c.atelierMedals >= 6 },
  { id: 'globetrotter', label: 'Globe-trotter', how: 'Une médaille sur chacun des 66 circuits d’origine', test: (c) => c.coreMedals >= 66 },
  { id: 'cristallin', label: 'Cristallin', how: 'Un cristal sur 20 circuits', test: (c) => c.crystals >= 20 },
  { id: 'legende', label: 'Légende', how: 'Un cristal sur les 72 circuits', test: (c) => c.crystals >= c.totalTracks && c.totalTracks > 0 },
  { id: 'fidele', label: 'Fidèle', how: 'Terminer 7 défis du jour différents', test: (c) => c.dailyDays >= 7 },
  { id: 'collectionneur', label: 'Collectionneur', how: 'Compléter 2 collections du garage', test: (c) => c.collections >= 2 },
  { id: 'veteran', label: 'Vétéran', how: 'Terminer 200 courses', test: (c) => c.races >= 200 },
  { id: 'derapeur', label: 'Maître du dérapage', how: 'Réussir 100 mini-turbos', test: (c) => c.turbos >= 100 },
];
export const titleLabel = (id) => (TITLES.find((t) => t.id === id) || {}).label || '';

// ---- Exclusifs : débloqués par un exploit ----------------------------------------------------------------------------------------------
export const EXCLUSIVES = [
  { cat: 'trail', id: 'gold', test: (c) => c.dailyDays >= 7 },
  { cat: 'led', id: 'emerald', test: (c) => c.atelierMedals >= 6 },
  { cat: 'led', id: 'sunset', test: (c) => c.academy >= 6 },
];

// ---- Collections : quatre éléments du garage qui vont ensemble ; les posséder tous rapporte une fois COLLECTION_COINS ----------------------------------
export const COLLECTION_COINS = 100;
export const COLLECTIONS = [
  { id: 'neon', label: 'Néon', items: [['led', 'cyan'], ['wheels', 'neon'], ['trail', 'comet'], ['decal', 'stripe']] },
  { id: 'feu', label: 'Feu', items: [['trail', 'ember'], ['decal', 'flames'], ['led', 'amber'], ['spoiler', 'duck']] },
  { id: 'royal', label: 'Royal', items: [['ornament', 'crown'], ['wheels', 'gold'], ['body', 'wedge'], ['led', 'violet']] },
  { id: 'course', label: 'Course', items: [['decal', 'checker'], ['ornament', 'flag'], ['spoiler', 'gt'], ['wheels', 'spoke']] },
];

// Avancement d'une collection : { have, total, done }.
export function collectionProgress(col, has = owns) {
  const have = col.items.filter(([c, id]) => has(c, id)).length;
  return { have, total: col.items.length, done: have === col.items.length };
}

// Contexte vide (tous les compteurs à zéro) : app/rewards.js le remplit d'après le profil et les records.
export const emptyContext = () => ({ academy: 0, atelierMedals: 0, coreMedals: 0, crystals: 0, totalTracks: 0, dailyDays: 0, collections: 0, races: 0, turbos: 0 });

export const earnedTitles = (ctx) => TITLES.filter((t) => t.test(ctx)).map((t) => t.id);

// Donne ce qui est mérité et pas encore reçu : exclusifs, pièces de collection. Renvoie { exclusives: [{cat,id,label}], collections: [{id,label,coins}], titles: [nouveaux ids] }.
// Rien n'est jamais retiré. Les titres ne se « donnent » pas (ils se calculent) : on signale seulement les nouveaux (profile().titlesSeen).
export function grantRewards(ctx) {
  const p = profile();
  p.collections = p.collections && typeof p.collections === 'object' ? p.collections : {};
  const out = { exclusives: [], collections: [], titles: [] };
  for (const e of EXCLUSIVES) {
    if (!e.test(ctx) || p.owned[e.cat + ':' + e.id]) continue;
    p.owned[e.cat + ':' + e.id] = 1;
    out.exclusives.push({ cat: e.cat, id: e.id, label: ((CATALOG[e.cat] || []).find((x) => x.id === e.id) || {}).label || e.id });
  }
  for (const col of COLLECTIONS) {
    if (p.collections[col.id] || !collectionProgress(col).done) continue;
    p.collections[col.id] = 1;
    addCoins(COLLECTION_COINS);
    out.collections.push({ id: col.id, label: col.label, coins: COLLECTION_COINS });
  }
  const seen = new Set(Array.isArray(p.titlesSeen) ? p.titlesSeen : []);
  for (const id of earnedTitles({ ...ctx, collections: Object.keys(p.collections).length })) if (!seen.has(id)) { out.titles.push(id); seen.add(id); }
  p.titlesSeen = [...seen];
  if (!earnedTitles({ ...ctx, collections: Object.keys(p.collections).length }).includes(p.title)) p.title = '';       // un titre qui n'est (plus) mérité ne reste pas affiché
  saveProfile();
  return out;
}

// Compteurs cumulés du profil, mis à jour en fin de course (finish.js).
export function noteRace({ turbos = 0, dailyDay = '' } = {}) {
  const p = profile();
  if (turbos > 0) p.stats.turbos = Math.min(1e6, (p.stats.turbos || 0) + turbos);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dailyDay)) {
    const days = Array.isArray(p.dailyDays) ? p.dailyDays : [];
    if (!days.includes(dailyDay)) { days.push(dailyDay); days.sort(); p.dailyDays = days.slice(-400); }
  }
  saveProfile();
}

// Choix du titre affiché : seulement un titre mérité (ou aucun).
export function chooseTitle(id, ctx) {
  const p = profile();
  const ok = !id || earnedTitles({ ...ctx, collections: Object.keys(p.collections || {}).length }).includes(id);
  if (!ok) return false;
  p.title = id || '';
  saveProfile();
  return true;
}
