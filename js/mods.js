// Paquets de personnalisation « mods » (lot 13) : un seul code « SHX1: » qui regroupe ma voiture, mon interface, mes caméras, mes pièces décoratives et mes modes.
// RIEN d'exécutable : un paquet n'est que des données, et chaque morceau repasse par le valideur de son propre module (cosmétiques, interface, caméras, pièces, modes). Un champ
// inconnu est ignoré, une valeur hors bornes ramenée aux bornes, une taille excessive refusée. Module pur (testé sous Node).
import { sanitizeLoadout } from './cosmetics.js';
import { sanitizeUi, DEFAULT_UI } from './uitheme.js';
import { sanitizeCams } from './camprefs.js';
import { sanitizeDecoParts, cleanDecoName } from './customDeco.js';
import { sanitizeMode } from './rules.js';

export const PACK_MAX_CHARS = 30000;
export const PACK_MAX_PARTS = 8;
export const PACK_MAX_MODES = 6;
export const PACK_KINDS = [['car', 'Ma voiture'], ['ui', 'Mon interface'], ['cameras', 'Mes caméras'], ['parts', 'Mes pièces décoratives'], ['modes', 'Mes modes']];

export function sanitizePack(o) {
  const src = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  const out = { v: 1, name: String(src.name == null ? '' : src.name).replace(/[^\p{L}\p{N} _'’.!-]/gu, '').trim().slice(0, 30) || 'Mon paquet' };
  if (src.car && typeof src.car === 'object') out.car = sanitizeLoadout(src.car);
  if (src.ui && typeof src.ui === 'object') out.ui = sanitizeUi(src.ui);
  const cams = sanitizeCams(src.cameras);
  if (cams.length) out.cameras = cams;
  if (Array.isArray(src.parts)) {
    const parts = src.parts.slice(0, PACK_MAX_PARTS).map((p) => (p && typeof p === 'object' ? { name: cleanDecoName(p.name), parts: sanitizeDecoParts(p.parts) } : null)).filter((p) => p && p.parts.length);
    if (parts.length) out.parts = parts;
  }
  if (Array.isArray(src.modes)) {
    const modes = src.modes.slice(0, PACK_MAX_MODES).map(sanitizeMode);
    if (modes.length) out.modes = modes;
  }
  return out;
}

// Ce que contient un paquet, en phrases lisibles.
export function describePack(p) {
  const out = [];
  if (p.car) out.push(['car', `Voiture (${p.car.custom.parts.length} pièce${p.car.custom.parts.length > 1 ? 's' : ''} libre${p.car.custom.parts.length > 1 ? 's' : ''})`]);
  if (p.ui) out.push(['ui', `Interface (thème « ${p.ui.theme} »)`]);
  if (p.cameras) out.push(['cameras', `${p.cameras.length} caméra${p.cameras.length > 1 ? 's' : ''}`]);
  if (p.parts) out.push(['parts', `${p.parts.length} pièce${p.parts.length > 1 ? 's' : ''} décorative${p.parts.length > 1 ? 's' : ''}`]);
  if (p.modes) out.push(['modes', `${p.modes.length} mode${p.modes.length > 1 ? 's' : ''} : ${p.modes.map((m) => m.name).join(', ')}`]);
  return out;
}

const b64 = (s) => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); const pad = t + '='.repeat((4 - (t.length % 4)) % 4); return typeof atob === 'function' ? decodeURIComponent(escape(atob(pad))) : Buffer.from(pad, 'base64').toString('utf8'); };

export function encodePack(pack) {
  const code = 'SHX1:' + b64(JSON.stringify(sanitizePack(pack)));
  if (code.length > PACK_MAX_CHARS) throw new Error('Paquet trop gros : retire quelque chose.');
  return code;
}
export function decodePack(code) {
  const t = String(code || '').trim();
  if (!t.startsWith('SHX1:')) throw new Error('Ce n\'est pas un code de paquet (il commence par SHX1:).');
  if (t.length > PACK_MAX_CHARS) throw new Error('Code de paquet trop long.');
  let o;
  try { o = JSON.parse(unb64(t.slice(5))); } catch { throw new Error('Code de paquet invalide ou coupé.'); }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('Code de paquet invalide ou coupé.');
  const p = sanitizePack(o);
  if (!describePack(p).length) throw new Error('Ce paquet est vide.');
  return p;
}

// Les éléments payants d'une voiture importée ne sont pas offerts : ceux que le joueur ne possède pas sont remplacés par les valeurs d'origine. owned(cat, id) -> booléen.
export function ownedCar(car, owned, defaults) {
  const L = sanitizeLoadout(car);
  for (const k of ['body', 'led', 'decal', 'ornament', 'spoiler', 'wheels', 'finish', 'bike', 'trail', 'horn']) if (!owned(k, L[k])) L[k] = defaults[k];
  return L;
}
export { DEFAULT_UI };
