// Prefabs de l'éditeur (0.9.18) : des morceaux de circuit réutilisables (chicane, looping + sortie, saut…), qu'on colle comme le presse-papiers ; on peut aussi enregistrer SA sélection, la nommer et la partager par un code
// « SHP1: ». Un prefab est un presse-papiers (editorTools.copyRect) : { w, h, tiles, decos } en coordonnées relatives. Module sans rendu ni stockage : la bibliothèque locale est dans storage.js.
import { CELL, LEVEL_H } from './constants.js';
import { PIECES } from './pieces.js';
import { Track, scriptTrack, b64encode, b64decode } from './track.js';

export const PREFAB_PREFIX = 'SHP1:';
export const MAX_PREFAB_TILES = 400, MAX_PREFAB_DECOS = 300, MAX_PREFAB_CHARS = 150000;

// Un circuit (ou un morceau) -> presse-papiers : coordonnées relatives au coin, niveaux relatifs au plus bas.
export function clipFromTrack(tr) {
  const tiles = tr.tiles;
  if (!tiles.length && !tr.decos.length) return null;
  const cells = tiles.flatMap((t) => Track.cellsOf(t));
  const x0 = tiles.length ? Math.min(...cells.map((c) => c[0])) : 0, z0 = tiles.length ? Math.min(...cells.map((c) => c[1])) : 0;
  const x1 = tiles.length ? Math.max(...cells.map((c) => c[0])) : 0, z1 = tiles.length ? Math.max(...cells.map((c) => c[1])) : 0;
  const baseL = tiles.length ? Math.min(...tiles.map((t) => t.l)) : 0;
  return {
    w: x1 - x0 + 1, h: z1 - z0 + 1,
    tiles: tiles.map((t) => ({ ...t, x: t.x - x0, z: t.z - z0, l: t.l - baseL })),
    decos: tr.decos.map((d) => ({ ...d, x: d.x - x0 * CELL, z: d.z - z0 * CELL, y: d.y - baseL * LEVEL_H })),
  };
}

// Presse-papiers -> code partageable « SHP1:… » (le contenu est un code de circuit ordinaire, enveloppé avec le nom).
export function clipToCode(clip, name = 'Prefab') {
  const tr = new Track(String(name).slice(0, 40) || 'Prefab');
  for (const t of clip.tiles) tr.add(t);
  for (const d of clip.decos) tr.addDeco(d);
  return PREFAB_PREFIX + b64encode(JSON.stringify({ n: String(name).slice(0, 40) || 'Prefab', c: tr.encode() }));
}

// Code -> { name, clip } ; lève une erreur lisible si le code est invalide, trop gros ou vide. Jamais de confiance dans ce qui vient d'un inconnu.
export function codeToClip(code) {
  const s = String(code || '').trim();
  if (!s.startsWith(PREFAB_PREFIX)) throw new Error('Ce n\'est pas un code de prefab (il commence par SHP1:).');
  if (s.length > MAX_PREFAB_CHARS) throw new Error('Prefab trop gros.');
  let d, tr;
  try { d = JSON.parse(b64decode(s.slice(PREFAB_PREFIX.length))); tr = Track.decode(String(d.c)); } catch { throw new Error('Code de prefab invalide ou coupé.'); }
  if (tr.tiles.length > MAX_PREFAB_TILES || tr.decos.length > MAX_PREFAB_DECOS) throw new Error('Prefab trop gros.');
  const clip = clipFromTrack(tr);
  if (!clip || !clip.tiles.length) throw new Error('Ce prefab est vide.');
  return { name: String(d.n || tr.name || 'Prefab').slice(0, 40), clip };
}

// Prefabs fournis : construits avec le constructeur « tortue » des circuits intégrés (donc toujours valides).
export const STARTERS = [
  { id: 'chicane', name: 'Chicane', hint: 'Un S : droite puis gauche', script: 'S R L S' },
  { id: 'epingle', name: 'Épingle', hint: 'Demi-tour serré', script: 'S R R S' },
  { id: 'slalom', name: 'Slalom', hint: 'Quatre virages alternés', script: 'S R L R L S' },
  { id: 'saut', name: 'Saut', hint: 'Rampe, vide de deux cases, réception', script: 'S [crv1] UU G2 DD [cdo1] S', l: 2 },
  { id: 'looping', name: 'Looping', hint: 'Un looping et sa sortie', script: 'S O S' },
  { id: 'wallride', name: 'Wall-ride', hint: 'Quatre cases sur un mur', script: '[tr01s] S4< [tr10s]', l: 2 },
];

export function starterClip(def) {
  const tr = scriptTrack(def.name, def.script, def.l ? { l: def.l } : {});
  return clipFromTrack(tr);
}

// Nombre de pièces et dimensions : pour l'étiquette d'un prefab.
export const clipSummary = (clip) => `${clip.tiles.length} pièce${clip.tiles.length > 1 ? 's' : ''} · ${clip.w}×${clip.h}`;
export const isKnownPiece = (t) => !!PIECES[t];
