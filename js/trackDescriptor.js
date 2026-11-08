// Descripteur de circuit : UNE description d'un circuit quelle que soit sa source (carrière, défi du jour, mes circuits, communauté), pour le
// Race Hub et tout écran qui présente un circuit avant de le lancer. Module pur (sans DOM ni rendu : testé sous Node).
//
// Rien n'est recalculé qui existe déjà : la clé, les médailles, l'objectif et les options de lancement sont EXACTEMENT celles que les écrans
// passaient à playTrack avant le hub (tools/test-hub.mjs le vérifie). `launch` se passe tel quel à App.playTrack(desc.track, desc.launch).
//
//   describeBuiltin(b, ctx)        b : entrée de App.builtins ({ def, track, index, key }) ; ctx : { total, builtins, getRecord } (verrou de chapitre)
//   describeDaily(c)               c : dailyChallenge(day)
//   describeUser(track, entry)     un code ouvert, ou une entrée de « Mes circuits » ({ id, name, code })
//   describeCommunity(track, row)  une ligne de la communauté (tracks) avec son circuit décodé
import { CELL } from './constants.js';
import { PIECES } from './pieces.js';
import { centerlineWorld } from './ribbons.js';
import { hashString } from './track.js';
import { medalFor } from './medals.js';
import { goalFor, nextBuiltinIndex, chapterUnlocked, prerequisiteOf, CHAPTER_SIZE, UNLOCK_MEDALS } from './career.js';
import { estimateDifficulty } from './difficulty.js';
import { formatVariant, variantKey, applyVariant, variantFits, MAX_KEY, VARIANT_VER } from './variants.js';
import { seasonOf, seasonTracks, seasonBounds } from './seasons.js';

const plen = (pts) => { let d = 0; for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); return d; };

// Longueur : celle de la ligne centrale de course quand elle existe (circuits scriptés, tours compris), sinon la somme des lignes centrales
// des pièces posées (une estimation : une bifurcation compte une voie, un raccourci compte aussi). `kind` dit laquelle des deux.
export function trackLength(track) {
  if (track.path && track.path.length > 1) return { m: Math.round(plen(track.path)), kind: 'race' };
  let d = 0;
  for (const t of track.tiles) {
    const P = PIECES[t.t];
    if (P.kind === 'ring' || P.kind === 'area') continue;
    d += plen(centerlineWorld(t, 6));
  }
  return { m: Math.round(d * (track.laps || 1)), kind: 'pieces' };
}

function base(source, track, key) {
  const len = trackLength(track);
  return {
    source, key, track, name: track.name, decor: track.decor, laps: track.laps || 1, tiles: track.tiles.length,
    lengthM: len.m, lengthKind: len.kind, cell: CELL,
    stars: null, medals: null, goal: null, goalKey: '', author: track.author || '', communityId: null, entryId: null,
    index: null, chapter: null, locked: null, recordKeys: key ? [key] : [], desc: track.desc || '',
  };
}

export function describeBuiltin(b, { total, builtins = null, getRecord = null }) {
  const i = b.index, d = base('builtin', b.track, b.key);
  d.name = b.def.name;
  d.builtinId = b.def.id;
  d.stars = b.def.difficulty;
  d.medals = b.def.medals;
  d.goal = goalFor(b.def, i);
  d.goalKey = b.key + '#goal';
  d.index = i;
  d.chapter = Math.floor(i / CHAPTER_SIZE);
  d.profil = b.def.profil || '';
  d.learn = b.def.appris || '';
  // Verrou de chapitre : même règle que la carte de la carrière (il faut des médailles au chapitre précédent).
  d.locked = builtins && getRecord ? chapterLock(i, builtins, getRecord) : null;
  d.launch = {
    trackKey: b.key, medals: b.def.medals, difficulty: b.def.difficulty, hasNext: nextBuiltinIndex(i, total) != null, builtinIndex: i, seed: b.key,
    goal: d.goal, goalKey: d.goalKey,
  };
  return d;
}
// Verrou de chapitre de la carrière : null si ouvert, sinon la raison (même texte que la carte de la carrière).
export function chapterLock(i, builtins, getRecord) {
  const medalOf = (k) => { const b = builtins[k]; const rec = getRecord(b.key); return rec ? medalFor(rec.time, b.def.medals) : null; };
  const ch = Math.floor(i / CHAPTER_SIZE);
  return chapterUnlocked(ch, medalOf, builtins.length) ? null : `Chapitre verrouillé : gagne ${UNLOCK_MEDALS} médailles au chapitre ${prerequisiteOf(ch) + 1}.`;
}

// mutation : la mutation du jour (mutations.js : dailyMutation), proposée comme catégorie de record dans la fiche ; null si on ne l'a pas calculée.
export function describeDaily(c, mutation = null) {
  const d = base('daily', c.track, c.key);
  d.mutation = mutation && mutation.day === c.day ? mutation : null;
  d.name = c.track.name;
  d.day = c.day;
  d.medals = c.medals;
  d.stars = estimateDifficulty(c.track).stars;
  d.launch = { trackKey: c.key, medals: c.medals, difficulty: 3, seed: c.key, daily: true };
  return d;
}

// Circuit de joueur (code ouvert ou « Mes circuits ») : médailles déduites du temps de l'auteur s'il l'a fini.
export function describeUser(track, entry = null) {
  const d = base('user', track, track.userKey);
  if (entry && entry.name) d.name = entry.name;
  d.entryId = entry ? entry.id : null;
  d.medals = track.derivedMedals;
  d.stars = estimateDifficulty(track).stars;
  d.recordKeys = [track.userKey, 'u-' + hashString(track.encode())];        // ancienne clé (avant la signature) : « Mes circuits » la lisait déjà
  d.launch = { trackKey: track.userKey, userEntry: entry ? entry.id : null, seed: track.name, userMap: true, medals: track.derivedMedals, difficulty: 2 };
  return d;
}

export function describeCommunity(track, row) {
  const d = base('community', track, track.userKey);
  d.name = row.name || track.name;
  d.desc = row.description || track.desc || '';
  d.author = (row.players && row.players.name) || '';
  d.authorId = row.author || null;
  d.communityId = row.id;
  d.medals = track.derivedMedals;
  d.stars = estimateDifficulty(track).stars;
  d.plays = row.plays | 0;
  d.likes = row.likes | 0;
  d.authorTime = +row.author_time || 0;
  d.launch = { trackKey: track.userKey, seed: track.name, userMap: true, medals: track.derivedMedals, difficulty: 2, community: row.id };
  return d;
}

// Record personnel d'un descripteur (première clé qui en a un).
export function personalRecord(desc, getRecord) {
  for (const k of desc.recordKeys) { const r = getRecord(k); if (r) return r; }
  return null;
}

// Course rapide : le premier circuit de la carrière, dans l'ordre, qui est ouvert et n'a pas encore de médaille. null : tout est médaillé (ou
// verrouillé) : l'appelant lance alors le défi du jour.
export function quickRaceIndex(builtins, getRecord) {
  for (const b of builtins) {
    if (chapterLock(b.index, builtins, getRecord)) continue;
    const rec = getRecord(b.key);
    if (!rec || !medalFor(rec.time, b.def.medals)) return b.index;
  }
  return null;
}

// Véhicule à l'arrivée d'une course classée, d'après les changements de véhicule enregistrés avec son fantôme ([[échantillon, id], …] ; id dans
// l'ordre de ghostFormat.GHOST_VEHICLES). null : course d'avant l'étape 7 (pas de fantôme), on ne sait pas.
const VEH = ['car', 'moto', 'boat', 'glider'];
export function finishVehicle(ghostVeh, hasGhost = true) {
  if (!hasGhost && !(Array.isArray(ghostVeh) && ghostVeh.length)) return null;
  if (!Array.isArray(ghostVeh)) return hasGhost ? 'car' : null;
  const last = ghostVeh[ghostVeh.length - 1];
  return last && Array.isArray(last) ? VEH[last[1] | 0] || 'car' : 'car';
}

// ---- Catégories de records (variantes, variants.js) ---------------------------------------------------------------------------------
// Le descripteur d'une variante : même circuit transformé (copie), sa propre clé de classement, son propre record. Ni médailles ni objectif
// (calibrés sur le circuit officiel : pas de pièces gagnées par une catégorie plus facile). officialTrack : le circuit d'origine, dont le code
// part au serveur pour un circuit de joueur (le serveur applique la variante lui-même).
export function describeVariant(desc, v) {
  const official = desc.official || desc;
  if (!formatVariant(v)) return official;
  const key = variantKey(official.key, v);
  const track = applyVariant(official.track, v);
  // Mutation du jour (E13) : une catégorie du défi, avec son ambiance (le brouillard : visuel seul, hors signature).
  const mutation = official.mutation && official.mutation.variant === formatVariant(v) ? official.mutation : null;
  if (mutation && mutation.ambiance) track.ambiance = { ...track.ambiance, ...mutation.ambiance };
  const season = v.sea != null ? +v.sea : null;                        // saison hebdomadaire (E15) : même circuit, classement de la semaine
  return {
    ...official, official, variant: v, variantStr: formatVariant(v), key, track, mutation, season,
    medals: null, goal: null, goalKey: '', recordKeys: [key],
    launch: { trackKey: key, seed: official.launch.seed, difficulty: official.launch.difficulty, variant: formatVariant(v), officialTrack: official.track, ...(mutation ? { mutation: true } : {}) },
  };
}

// Catégories proposées dans la fiche (les autres variantes existent pour les modes et le défi du jour, sans encombrer la fiche).
export const HUB_CATEGORIES = [
  { id: 'veh-car', v: { veh: 'car' }, label: '🚗 Départ en voiture' },
  { id: 'veh-moto', v: { veh: 'moto' }, label: '🏍 Départ en moto' },
  { id: 'veh-boat', v: { veh: 'boat' }, label: '⛵ Départ en bateau' },
  { id: 'veh-glider', v: { veh: 'glider' }, label: '🪂 Départ en deltaplane' },
  { id: 'obs-0', v: { obs: 0 }, label: '🚫 Sans obstacles' },
  { id: 'rn-60', v: { rn: '60' }, label: '🌧️ Sous la pluie' },
];
// Celles qui ont un sens sur ce circuit (classé en ligne, et la variante change vraiment la course).
export function hubCategories(desc) {
  const official = desc.official || desc;
  if (!official.key || !/^(b-|daily-|u-)/.test(official.key)) return [];
  const cats = HUB_CATEGORIES.filter((c) => { try { return variantKey(official.key, c.v).length <= MAX_KEY && variantFits(official.track, c.v); } catch { return false; } });
  // Saison de la semaine (E15) : le circuit en fait partie ; catégorie en tête (classement de la semaine, points de saison).
  const sn = official.source === 'builtin' && official.builtinId ? seasonOf() : 0;
  if (sn && seasonTracks(sn).some((dd) => dd.id === official.builtinId)) {
    const ends = new Date(seasonBounds(sn).ends - 1);
    cats.unshift({ id: `sea-${sn}`, v: { sea: String(sn) }, label: `📅 Saison ${sn} (jusqu’au ${ends.getUTCDate()}/${ends.getUTCMonth() + 1})`, season: sn });
  }
  const M = official.mutation;
  if (!M) return cats;
  const id = M.variant.slice(VARIANT_VER.length + 1);
  return [{ id, v: M.v, label: `🧪 Mutation du jour : ${M.label}`, mutation: true }, ...cats.filter((c) => c.id !== id)];
}
