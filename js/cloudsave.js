// Sauvegarde cloud : quelles données partent dans le cloud, et comment fusionner deux versions.
//
// Module pur (aucun réseau, aucun navigateur) : il travaille sur des « dumps » {clé: texte JSON} comme dumpAll(),
// et sur leur forme cloud {clé: valeur JSON} (jsonb côté base). La fusion ne perd jamais de progression :
//  - records : le meilleur temps gagne (à version de physique égale) ;
//  - circuits : union par identifiant, le plus récent gagne ; les pierres tombales effacent les circuits supprimés ;
//  - profil : médailles et objets réunis, statistiques au maximum, pièces sans jamais en inventer ; favoris réunis (pierres tombales) ;
//  - dernières courses (runs.*) : réunies, les plus récentes gardées.
import { itemCost } from './cosmetics.js';
import { mergeFavorites } from './favorites.js';
import { cleanRuns } from './storage.js';

// Ce qui suit un compte d'un appareil à l'autre : progression, circuits créés, records. Les réglages
// (volume, touches, qualité...) restent propres à chaque appareil, le brouillon de l'éditeur aussi.
export const isSyncKey = (k) =>
  k === 'profile' || k === 'tracks' || k === 'tracksDel' || k === 'recReset' || /^(rec3|daily|ghostImp|runs)\./.test(k);

export const pickSynced = (dump) => Object.fromEntries(Object.entries(dump || {}).filter(([k, v]) => isSyncKey(k) && typeof v === 'string'));

// {clé: texte} -> {clé: valeur} (les valeurs illisibles sont ignorées)
export function toCloud(dump) {
  const out = {};
  for (const [k, v] of Object.entries(pickSynced(dump))) {
    try { out[k] = JSON.parse(v); } catch { /* abîmé : on ne l'envoie pas */ }
  }
  return out;
}
// {clé: valeur} -> {clé: texte}
export function fromCloud(data) {
  const out = {};
  if (!data || typeof data !== 'object') return out;
  for (const [k, v] of Object.entries(data)) if (isSyncKey(k) && v !== undefined) out[k] = JSON.stringify(v);
  return out;
}

const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const num = (x) => (Number.isFinite(+x) ? +x : 0);

function mergeRecord(a, b) {
  if (!a) return b;
  if (!b) return a;
  // Une physique plus récente remplace l'ancienne (les temps ne sont plus comparables) ; sinon le meilleur temps.
  const pa = num(a.pv), pb = num(b.pv);
  if (pa !== pb) return pb > pa ? b : a;
  return num(b.time) < num(a.time) ? b : a;
}

function mergeTracks(a, b, gone) {
  const map = new Map();
  for (const t of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    if (!t || t.id == null) continue;
    const cur = map.get(t.id);
    if (!cur || num(t.updated) > num(cur.updated)) map.set(t.id, t);
  }
  // Un circuit supprimé après sa dernière modification disparaît partout.
  return [...map.values()].filter((t) => !(gone[t.id] != null && num(gone[t.id]) >= num(t.updated)));
}

// Pièces : chaque côté a pu acheter des objets que l'autre n'a pas. On réunit les objets, puis on retire au côté
// le prix de ceux qu'il n'avait pas, et on garde le plus favorable des deux. Jamais plus que ce qu'un côté avait.
function mergeCoins(a, b, owned) {
  const lacking = (side) => Object.keys(owned).filter((k) => !(k in obj(side.owned)))
    .reduce((sum, k) => { const [cat, ...id] = k.split(':'); return sum + num(itemCost(cat, id.join(':'))); }, 0);
  return Math.max(0, num(a.coins) - lacking(a), num(b.coins) - lacking(b));
}

export function mergeProfile(local, remote) {
  const a = obj(local), b = obj(remote);
  if (!Object.keys(a).length) return { ...b };
  if (!Object.keys(b).length) return { ...a };
  const owned = { ...obj(a.owned), ...obj(b.owned) };
  const medals = { ...obj(b.medals) };
  for (const [k, tier] of Object.entries(obj(a.medals))) medals[k] = k in medals ? Math.min(num(tier), num(medals[k])) : tier;   // 0 = cristal : le plus petit est le meilleur
  const eggs = { ...obj(b.eggs), ...obj(a.eggs) };
  const shards = { ...obj(b.shards), ...obj(a.shards) };
  const stats = { ...obj(b.stats), ...obj(a.stats), races: Math.max(num(a.stats && a.stats.races), num(b.stats && b.stats.races)), earned: Math.max(num(a.stats && a.stats.earned), num(b.stats && b.stats.earned)) };
  const academy = { ...obj(b.academy), ...obj(a.academy) };                   // leçons réussies : on réunit
  const collections = { ...obj(b.collections), ...obj(a.collections) };      // collections récompensées : on réunit
  const dailyDays = [...new Set([...(Array.isArray(a.dailyDays) ? a.dailyDays : []), ...(Array.isArray(b.dailyDays) ? b.dailyDays : [])])].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().slice(-400);
  const titlesSeen = [...new Set([...(Array.isArray(a.titlesSeen) ? a.titlesSeen : []), ...(Array.isArray(b.titlesSeen) ? b.titlesSeen : [])])].slice(0, 40);
  stats.turbos = Math.max(num(a.stats && a.stats.turbos), num(b.stats && b.stats.turbos));
  const presets = Array.isArray(a.presets) && a.presets.some(Boolean) ? a.presets : (Array.isArray(b.presets) ? b.presets : a.presets);
  const fav = (a.favorites || b.favorites || a.favDel || b.favDel) ? mergeFavorites(a, b) : {};      // favoris du Race Hub (favorites.js)
  return {
    ...b, ...a, ...fav,
    id: b.id || a.id,                    // l'identifiant du joueur reste celui du compte
    coins: mergeCoins(a, b, owned), owned, medals, eggs, shards, stats, presets, academy, collections, dailyDays, titlesSeen,
    loadout: a.loadout || b.loadout,     // l'appareil courant garde sa personnalisation
  };
}

// local, remote : formes cloud {clé: valeur}. Renvoie la forme cloud fusionnée.
export function mergeSaves(local, remote) {
  let a = obj(local), b = obj(remote);
  const out = {};
  // « Effacer les records » : les records plus anciens que la dernière remise à zéro sont écartés AVANT la fusion (sinon un ancien
  // record, meilleur, l'emporterait sur le nouveau puis serait supprimé).
  const resetAt = Math.max(num(a.recReset), num(b.recReset));
  if (resetAt) {
    const clean = (o) => Object.fromEntries(Object.entries(o).filter(([k, v]) => !(k.startsWith('rec3.') && num(obj(v).date) <= resetAt))
      .map(([k, v]) => [k, k.startsWith('runs.') && Array.isArray(v) ? v.filter((r) => num(r && r.date) > resetAt) : v]));
    a = clean(a); b = clean(b);
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const gone = { ...obj(b.tracksDel), ...obj(a.tracksDel) };
  for (const k of Object.keys(obj(b.tracksDel))) gone[k] = Math.max(num(a.tracksDel && a.tracksDel[k]), num(b.tracksDel[k]));
  for (const k of keys) {
    if (!isSyncKey(k)) continue;
    if (k === 'tracksDel') out[k] = gone;
    else if (k === 'tracks') out[k] = mergeTracks(a[k], b[k], gone);
    else if (k === 'profile') out[k] = mergeProfile(a[k], b[k]);
    else if (k.startsWith('rec3.')) out[k] = mergeRecord(a[k], b[k]);
    else if (k.startsWith('runs.')) out[k] = cleanRuns([...(Array.isArray(a[k]) ? a[k] : []), ...(Array.isArray(b[k]) ? b[k] : [])]);    // dernières courses : réunies, les plus récentes
    else out[k] = a[k] !== undefined ? a[k] : b[k];                 // fantômes importés, défi du jour : le local d'abord
  }
  if (resetAt) out.recReset = resetAt;
  if (!('tracksDel' in out) && Object.keys(gone).length) out.tracksDel = gone;
  if (!('tracks' in out) && (a.tracks || b.tracks)) out.tracks = mergeTracks(a.tracks, b.tracks, gone);
  return out;
}

// Deux formes cloud sont-elles identiques ? (évite d'écrire pour rien)
export const sameData = (x, y) => JSON.stringify(sortKeys(x)) === JSON.stringify(sortKeys(y));
function sortKeys(o) {
  if (Array.isArray(o)) return o.map(sortKeys);
  if (o && typeof o === 'object') return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])]));
  return o;
}

// Version allégée (sans les fantômes enregistrés) si la sauvegarde dépasse la taille permise.
export function withoutGhosts(data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) out[k] = k.startsWith('rec3.') && v && typeof v === 'object' ? { ...v, ghost: null } : v;
  return out;
}
