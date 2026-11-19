// Débordement des routes inclinées dans les cases voisines (phase 3 de la 1.0 ; audit du rendu 0.12.2, sonde « emprise ») : une pente posée sur un
// mur ou à 45° est une route verticale (ou penchée) INCLINÉE : ses bords haut et bas avancent dans la case d'avant et dans celle d'après (jusqu'à 7,5 m
// pour la pente raide de 4 cases). La pièce qui la prolonge s'y raccorde, c'est voulu ; une AUTRE pièce posée là, aux mêmes niveaux, serait traversée.
// L'éditeur refuse donc cette pose, avec un message ; la continuation reste permise. Les circuits existants se lisent comme avant (rien ne change dans
// Track.cellsOf, ni dans le code d'un circuit, ni dans la physique). Module pur (testé : tools/test-debordement.mjs).
import { PIECES, isRibbon, rotVec } from './pieces.js';
import { CELL } from './constants.js';
import { ribbonExtent } from './ribbons.js';
import { tileEnds, endsTouch } from './connect.js';
import { Track } from './track.js';

export const SPILL_MIN = 1;      // débordement (m) au-delà duquel la case voisine est touchée (en deçà : l'épaisseur de la bordure)
const W = {};

// Cases voisines dans lesquelles la route de la pièce déborde de plus de SPILL_MIN : [[x, z], …] (vide pour une route à plat qui reste dans ses cases).
export function spillCells(tile) {
  if (!isRibbon(tile) || PIECES[tile.t].kind === 'ring') return [];
  const e = ribbonExtent(tile);
  if (!e) return [];
  const s = PIECES[tile.t].size, half = s * CELL / 2, out = [];
  for (const [lx, lz, over] of [[1, 0, e.maxX - half], [-1, 0, -half - e.minX], [0, 1, e.maxZ - half], [0, -1, -half - e.minZ]]) {
    if (!(over > SPILL_MIN)) continue;
    rotVec(tile.r, lx, lz, W);
    const dx = Math.round(W.x), dz = Math.round(W.z);
    for (let k = 0; k < s; k++) out.push(dx ? [dx > 0 ? tile.x + s : tile.x - 1, tile.z + k] : [tile.x + k, dz > 0 ? tile.z + s : tile.z - 1]);
  }
  return out;
}

const rangesMeet = (a, b) => { const [lo, hi] = Track.range(a), [lo2, hi2] = Track.range(b); return lo <= hi2 && lo2 <= hi; };
const linked = (a, b) => { const ea = tileEnds(a), eb = tileEnds(b); return ea.some((e) => eb.some((f) => endsTouch(e, f))); };
const isRing = (t) => PIECES[t.t].kind === 'ring';

// Pièces du circuit qui empêchent de poser `tile` à cause d'un débordement (dans un sens ou dans l'autre), hors `ignore` (pièces que la pose remplace) :
// une pièce qui déborde dans une case de `tile`, ou une pièce posée dans une case où `tile` déborde ; aux mêmes niveaux, et sans raccord entre les deux.
export function spillConflicts(track, tile, ignore = []) {
  if (isRing(tile)) return [];
  const skip = new Set(ignore), out = new Set();
  const mine = new Set(Track.cellsOf(tile).map(([x, z]) => x + ',' + z));
  for (const o of track.tiles) {
    if (o === tile || skip.has(o) || isRing(o) || !rangesMeet(o, tile)) continue;
    if (spillCells(o).some(([x, z]) => mine.has(x + ',' + z)) && !linked(o, tile)) out.add(o);
  }
  for (const [x, z] of spillCells(tile)) {
    for (const o of track.tilesAt(x, z)) {
      if (o === tile || skip.has(o) || isRing(o) || !rangesMeet(o, tile)) continue;
      if (!linked(o, tile)) out.add(o);
    }
  }
  return [...out];
}

export const spillMessage = (o) => `Le bord incliné de « ${PIECES[o.t].label} » déborde dans cette case : pose une pièce qui la prolonge, ou ailleurs.`;
