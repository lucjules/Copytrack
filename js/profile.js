// Profil du joueur : pièces, objets débloqués, équipement, code de sauvegarde.
// Le jeu est 100 % statique (aucun serveur) : le « code joueur » est la sauvegarde
// elle-même, compressée, à copier / coller ou à télécharger sous forme de fichier.
import { getJSON, setJSON, dumpAll, restoreAll } from './storage.js';
import { DEFAULT_LOADOUT, itemCost, sanitizeLoadout, itemsOf } from './cosmetics.js';
import { b64encode, b64decode, hashString } from './track.js';

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
    cache = { ...DEFAULT(), ...getJSON('profile', {}) };
    cache.loadout = sanitizeLoadout(cache.loadout);
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

export const owns = (cat, id) => itemCost(cat, id) === 0 || !!profile().owned[cat + ':' + id];

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
  p.coins -= cost;
  for (const [c, id] of items) p.owned[c + ':' + id] = 1;
  saveProfile();
  return true;
}

export function addCoins(n) {
  const p = profile();
  p.coins += n;
  p.stats.earned += n;
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
  const n = Math.max(1, Math.round(base));
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
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
};

export async function exportCode() {
  saveProfile();
  const data = dumpAll();
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
  let raw = fromB64(m[3]);
  if (m[1] === 'SHWP1') {
    if (typeof DecompressionStream === 'undefined') throw new Error('Navigateur trop ancien pour lire ce code');
    raw = await pipe(raw, new DecompressionStream('deflate-raw'));
  }
  const json = new TextDecoder().decode(raw);
  if (hashString(json) !== m[2]) throw new Error('Code joueur abîmé (somme de contrôle incorrecte)');
  const obj = JSON.parse(json);
  if (!obj || !obj.data) throw new Error('Code joueur invalide');
  return obj;
}

// mode : 'replace' remplace tout ; 'merge' garde les meilleurs records et réunit les circuits.
export function applySave(obj, mode = 'replace') {
  if (mode === 'replace') {
    restoreAll(obj.data);
  } else {
    const cur = dumpAll();
    const out = { ...cur };
    for (const [k, v] of Object.entries(obj.data)) {
      if (k.startsWith('rec2.')) {
        try {
          const a = JSON.parse(cur[k] || 'null'), b = JSON.parse(v);
          if (!a || (b && b.time < a.time)) out[k] = v;
        } catch { out[k] = v; }
      } else if (k === 'tracks') {
        try {
          const a = JSON.parse(cur[k] || '[]'), b = JSON.parse(v);
          const map = new Map(a.map((t) => [t.id, t]));
          for (const t of b) if (!map.has(t.id) || (t.updated || 0) > (map.get(t.id).updated || 0)) map.set(t.id, t);
          out[k] = JSON.stringify([...map.values()]);
        } catch { out[k] = v; }
      } else if (k === 'profile') {
        try {
          const a = JSON.parse(cur[k] || '{}'), b = JSON.parse(v);
          out[k] = JSON.stringify({
            ...b, coins: Math.max(a.coins || 0, b.coins || 0), owned: { ...(a.owned || {}), ...(b.owned || {}) },
            medals: { ...(a.medals || {}), ...(b.medals || {}) },
          });
        } catch { out[k] = v; }
      } else out[k] = v;
    }
    restoreAll(out);
  }
  return reloadProfile();
}

export { b64encode, b64decode };
