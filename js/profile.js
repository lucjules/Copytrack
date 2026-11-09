// Profil du joueur : pièces, objets débloqués, équipement, code de sauvegarde.
// Le jeu est 100 % statique (aucun serveur) : le « code joueur » est la sauvegarde
// elle-même, compressée, à copier / coller ou à télécharger sous forme de fichier.
import { getJSON, setJSON, dumpAll, restoreAll, DEVICE_ONLY_KEYS } from './storage.js';
import { DEFAULT_LOADOUT, itemCost, sanitizeLoadout, itemsOf, exclusiveOf } from './cosmetics.js';
import { hashString } from './track.js';

const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newPlayerId() {
  let s = '';
  const a = new Uint8Array(10);
  (globalThis.crypto || { getRandomValues: (x) => x.map(() => Math.random() * 256) }).getRandomValues(a);
  for (let i = 0; i < 10; i++) s += ID_CHARS[a[i] % ID_CHARS.length] + (i === 4 ? '-' : '');
  return s;
}

const DEFAULT = () => ({
  id: newPlayerId(), coins: 0, owned: {}, loadout: { ...DEFAULT_LOADOUT },
  presets: [null, null, null], medals: {}, stats: { races: 0, earned: 0 }, eggs: {}, shards: {},
});

let cache = null;
export function profile() {
  if (!cache) {
    const raw = getJSON('profile', {});
    cache = { ...DEFAULT(), ...(raw && typeof raw === 'object' ? raw : {}) };
    cache.loadout = sanitizeLoadout(cache.loadout);
    cache.owned = cache.owned && typeof cache.owned === 'object' ? cache.owned : {};
    cache.medals = cache.medals && typeof cache.medals === 'object' ? cache.medals : {};
    cache.stats = { races: 0, earned: 0, ...(cache.stats || {}) };
    if (!cache.id) cache.id = newPlayerId();
    setJSON('profile', cache);
  }
  return cache;
}

export function saveProfile() {
  if (cache) setJSON('profile', cache);
}

export function reloadProfile() {
  cache = null;
  return profile();
}

export const owns = (cat, id) => (itemCost(cat, id) === 0 && !exclusiveOf(cat, id)) || !!profile().owned[cat + ':' + id];

export function missingItems(loadout) {
  return itemsOf(loadout).filter(([c, id]) => !owns(c, id));
}

export function totalCost(items) {
  return items.reduce((a, [c, id]) => a + itemCost(c, id), 0);
}

export function buy(items) {
  const p = profile();
  const cost = totalCost(items);
  if (cost > p.coins) return false;
  if (items.some(([c, id]) => exclusiveOf(c, id))) return false;       // un exclusif ne s'achète jamais
  p.coins -= cost;
  for (const [c, id] of items) p.owned[c + ':' + id] = 1;
  saveProfile();
  return true;
}

export function addCoins(n) {
  const p = profile();
  p.coins += Number.isFinite(+n) ? +n : 0;
  p.stats.earned += Number.isFinite(+n) ? +n : 0;
  saveProfile();
}

export function setLoadout(l) {
  const p = profile();
  p.loadout = sanitizeLoadout(l);
  saveProfile();
}

// Pièces gagnées en fin de course. tier : 0 cristal ... 3 bronze, -1 aucune médaille.
const TIER_COINS = [120, 60, 30, 15];
export function rewardCoins({ tier, difficulty = 1, trackKey, user = false }) {
  const p = profile();
  let base = tier >= 0 ? TIER_COINS[tier] : 3;
  base *= 1 + 0.15 * (difficulty - 1);
  const best = p.medals[trackKey];
  const first = tier >= 0 && (best == null || tier < best);
  if (first) { base *= 2; p.medals[trackKey] = tier; }
  if (user) base *= 0.5;
  // Circuit de joueur : la médaille vient du temps de son auteur, donc une arrivée répétée sur un circuit minuscule ne doit pas
  // rapporter à l'infini : seule une nouvelle médaille (meilleure que la précédente) rapporte des pièces.
  const n = user && !first ? 0 : Math.max(1, Math.round(base));
  p.stats.races += 1;
  addCoins(n);
  return { coins: n, first };
}

// ---- Code joueur (sauvegarde complète) -------------------------------------
async function pipe(bytes, stream) {
  const s = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(s).arrayBuffer());
}

const toB64 = (u8) => {
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (s) => {
  if (typeof s !== 'string' || !s) throw new Error('Code joueur invalide');
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
};

export async function exportCode() {
  saveProfile();
  const data = dumpAll({ shareable: true });      // sans la session en ligne de cet appareil (storage.DEVICE_ONLY_KEYS)
  const json = JSON.stringify({ v: 1, id: profile().id, t: Date.now(), data });
  const raw = new TextEncoder().encode(json);
  const chk = hashString(json);
  if (typeof CompressionStream !== 'undefined') {
    const z = await pipe(raw, new CompressionStream('deflate-raw'));
    return `SHWP1:${chk}:${toB64(z)}`;
  }
  return `SHWP0:${chk}:${toB64(raw)}`;
}

export async function parseCode(code) {
  const m = /^\s*(SHWP[01]):([a-z0-9]+):([A-Za-z0-9_-]+)\s*$/.exec(code || '');
  if (!m) throw new Error('Code joueur invalide');
  let raw;
  try {
    raw = fromB64(m[3]);
  } catch {
    throw new Error('Code joueur invalide');
  }
  if (m[1] === 'SHWP1') {
    if (typeof DecompressionStream === 'undefined') throw new Error('Navigateur trop ancien pour lire ce code');
    raw = await pipe(raw, new DecompressionStream('deflate-raw'));
  }
  const json = new TextDecoder().decode(raw);
  if (hashString(json) !== m[2]) throw new Error('Code joueur abîmé (somme de contrôle incorrecte)');
  let obj;
  try {
    obj = JSON.parse(json);
  } catch {
    throw new Error('Code joueur invalide');
  }
  if (!obj || !obj.data) throw new Error('Code joueur invalide');
  return obj;
}

// Ce qu'une restauration accepte d'un code joueur : des clés de forme connue, des valeurs texte, et jamais la session en ligne d'un autre appareil
// (les anciens codes la contenaient : l'importer faisait de vous le pilote qui l'avait exporté, et effaçait votre propre identité en ligne).
const importable = (data) => {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) if (typeof v === 'string' && /^[\w.~:-]{1,160}$/.test(k) && !DEVICE_ONLY_KEYS.includes(k)) out[k] = v;
  return out;
};
const parse = (txt, fallback) => { try { const x = JSON.parse(txt); return x == null ? fallback : x; } catch { return fallback; } };

// Restaurer une ancienne sauvegarde est un geste VOLONTAIRE plus récent que les suppressions déjà synchronisées (pierres tombales de circuits, remise
// à zéro des records : voir cloudsave.js). Sans marque, la synchronisation suivante supprimait de nouveau ce que la restauration vient de rendre :
//  - circuits absents (ou supprimés) ici : `updated` passe à maintenant, il bat la pierre tombale ; la pierre tombale locale est retirée ;
//  - records absents ou meilleurs que ceux d'ici : `rt` (restauré le) = maintenant ; la remise à zéro ne retire que les records NI plus récents NI restaurés après elle.
// Ce qui existait déjà ici avec le même identifiant garde sa date : la règle habituelle (le plus récent gagne) s'applique.
function stampRestored(imp, cur, now) {
  const out = { ...imp };
  const have = new Set(parse(cur.tracks, []).map((t) => t && t.id));
  const gone = parse(cur.tracksDel, {});
  const dead = { ...parse(imp.tracksDel, {}) };
  for (const [id, t] of Object.entries(gone)) dead[id] = Math.max(Number(dead[id]) || 0, Number(t) || 0);      // la suppression la plus récente de chaque circuit
  if (typeof out.tracks === 'string') {
    const list = parse(out.tracks, []);
    if (Array.isArray(list)) {
      const revived = [];
      out.tracks = JSON.stringify(list.map((t) => {
        if (!t || t.id == null || (have.has(t.id) && !(t.id in dead))) return t;
        revived.push(t.id);
        return { ...t, updated: Math.max(Number(t.updated) || 0, now) };
      }));
      const keep = { ...dead };
      for (const id of revived) delete keep[id];
      out.tracksDel = JSON.stringify(keep);
    }
  }
  for (const [k, v] of Object.entries(out)) {
    if (!/^rec3\./.test(k)) continue;
    const r = parse(v, null), c = parse(cur[k], null);
    if (r && typeof r === 'object' && (!c || Number(r.time) < Number(c.time) - 1e-9)) out[k] = JSON.stringify({ ...r, rt: now });
  }
  return out;
}

// mode : 'replace' remplace tout ; 'merge' garde les meilleurs records et réunit les circuits.
export function applySave(obj, mode = 'replace', now = Date.now()) {
  if (!obj || !obj.data || typeof obj.data !== 'object') return reloadProfile();
  const cur = dumpAll();
  const imp = stampRestored(importable(obj.data), cur, now);
  obj = { ...obj, data: imp };

  if (mode === 'replace') {
    const own = {};
    for (const k of DEVICE_ONLY_KEYS) if (typeof cur[k] === 'string') own[k] = cur[k];      // l'identité en ligne de CET appareil survit à une restauration
    restoreAll({ ...obj.data, ...own });
  } else {
    const out = { ...cur };
    for (const [k, v] of Object.entries(obj.data)) {
      if ((k.startsWith('rec.') || k.startsWith('rec2.') || k.startsWith('rec3.')) && typeof v === 'string') {
        try {
          const a = JSON.parse(cur[k] || 'null'), b = JSON.parse(v);
          if (!a || (b && b.time < a.time)) out[k] = v;
        } catch { out[k] = v; }
      } else if (k === 'tracksDel' && typeof v === 'string') {
        // Pierres tombales : réunies (la plus récente suppression de chaque circuit) ; stampRestored a déjà retiré celles des circuits restaurés.
        const a = parse(cur[k], {}), b = parse(v, {}), u = { ...a };
        for (const [id, t] of Object.entries(b)) u[id] = Math.max(Number(u[id]) || 0, Number(t) || 0);
        for (const id of Object.keys(u)) if (!(id in b) && !(id in a)) delete u[id];
        const kept = parse(imp.tracks, null);
        if (Array.isArray(kept)) for (const t of kept) if (t && t.id in u && (Number(t.updated) || 0) > u[t.id]) delete u[t.id];
        out[k] = JSON.stringify(u);
      } else if (k === 'recReset' && typeof v === 'string') {
        out[k] = String(Math.max(Number(cur[k]) || 0, Number(v) || 0));
      } else if (k === 'tracks' && typeof v === 'string') {
        try {
          const a = JSON.parse(cur[k] || '[]'), b = JSON.parse(v);
          const map = new Map(a.map((t) => [t.id, t]));
          for (const t of b) if (!map.has(t.id) || (t.updated || 0) > (map.get(t.id).updated || 0)) map.set(t.id, t);
          out[k] = JSON.stringify([...map.values()]);
        } catch { out[k] = v; }
      } else if (k === 'profile' && typeof v === 'string') {
        try {
          const a = JSON.parse(cur[k] || '{}'), b = JSON.parse(v);
          out[k] = JSON.stringify({
            ...b,
            coins: Math.max(a.coins || 0, b.coins || 0),
            owned: { ...(a.owned || {}), ...(b.owned || {}) },
            medals: { ...(a.medals || {}), ...(b.medals || {}) },
          });
        } catch { out[k] = v; }
      } else if (typeof v === 'string') out[k] = v;
    }
    restoreAll(out);
  }
  return reloadProfile();
}


