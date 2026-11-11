// Outil « Prolonger » de l'éditeur : à partir de l'extrémité libre d'une pièce, trouve où poser la pièce choisie pour qu'elle se RACCORDE (position, hauteur, cap et
// roulis). Module pur (aucun rendu, aucun DOM) : l'éditeur (editor/tools.js : extend) n'a plus qu'à poser le résultat.
import { PIECES, flagAllowed, clearConflicts } from './pieces.js';
import { Track } from './track.js';
import { tileEnds, endsTouch, placementsAfter, compatiblePlacement, rollGap, ROLL_TOLERANCE } from './connect.js';
import { endOrientation } from './continuity.js';

const ORI_OPTS = { sol: {}, plafond: { v: 1 }, 'mur gauche': { o: 1 }, 'mur droit': { o: 2 } };
const ORI_NAME = { sol: 'au sol', plafond: 'au plafond', 'mur gauche': 'sur un mur gauche', 'mur droit': 'sur un mur droit' };

// Extrémités d'une pièce qui ne touchent aucune autre pièce du circuit, sorties d'abord (le départ n'a pas d'entrée à prolonger, l'arrivée n'a pas de sortie).
// Une pièce posée à contresens (une vrille « retour », une courbe retournée) a son bout libre côté entrée : il compte aussi.
export function freeExits(track, tile) {
  const sp = PIECES[tile.t].special;
  const mine = tileEnds(tile).filter((e) => !(sp === 'start' && e.entry) && !(sp === 'finish' && e.exit));
  if (!mine.length) return [];
  const others = [];
  for (const t of track.tiles) if (t !== tile) for (const e of tileEnds(t)) others.push(e);
  return mine.filter((e) => !others.some((f) => endsTouch(e, f))).sort((a, b) => (b.exit ? 1 : 0) - (a.exit ? 1 : 0));
}

// Dernière pièce du circuit qui a une extrémité libre (à défaut de pièce désignée).
export function lastOpenTile(track) {
  for (let i = track.tiles.length - 1; i >= 0; i--) if (freeExits(track, track.tiles[i]).length) return track.tiles[i];
  return null;
}

// type : pièce à poser ; opts : options armées dans l'éditeur (v, o, nb, tn…). Renvoie { tile, inferred } ou { why }.
export function extendPlan(track, from, type, opts = {}) {
  const P = PIECES[type];
  if (!P || P.kind === 'ring' || P.kind === 'area') return { why: `${P ? P.label : type} ne se pose pas au bout d'une route : choisis une pièce de route.` };
  if (!from) return { why: 'Aucune pièce où prolonger : pose d\'abord le départ.' };
  const exits = freeExits(track, from);
  if (!exits.length) return { why: `${PIECES[from.t].label} n'a pas d'extrémité libre (déjà raccordée, ou arrivée).` };
  const end = exits[0];
  const o = endOrientation(end);
  const lineLike = P.kind === 'line' || P.kind === 'arc';
  const tries = [{ opts, inferred: false }];
  if (lineLike && ORI_OPTS[o]) {
    // Orientation déduite de la route qui précède : une ligne ou un virage se pose sur le mur / au plafond où elle arrive.
    const inf = { ...opts, o: 0, v: 0, ...ORI_OPTS[o] };
    if (ORI_OPTS[o].o ? flagAllowed(type, 'o', { ...inf, t: type }, ORI_OPTS[o].o) : true) tries.push({ opts: clearConflicts(inf, ORI_OPTS[o].v ? 'v' : ORI_OPTS[o].o ? 'o' : 'nb'), inferred: true });
  }
  let blocked = null;
  // D'abord dans le sens de la pièce ; sinon à contresens (retour d'une vrille, d'un tire-bouchon, courbe symétrique) : la pièce est alors parcourue de sa sortie vers son entrée.
  // Le contresens n'est essayé que si le sens normal ne donne AUCUN raccord (roulis ou géométrie) : une descente refusée parce qu'elle sortirait des niveaux ne devient pas
  // une montée en silence.
  for (const reverse of [false, true]) {
    let found = false;
    for (const t of tries) {
      const c = compatiblePlacement(end, type, t.opts, { reverse });
      if (!c) continue;
      found = true;
      const tile = Track.normalize(c);
      if (!Track.inBounds(tile)) { blocked = blocked || 'sort des niveaux autorisés (monte ou descends la route d\'avant)'; continue; }
      if (track.conflicts(tile).length) { blocked = blocked || 'tomberait sur une pièce déjà posée'; continue; }
      return { tile, inferred: t.inferred, end, reverse };
    }
    if (found) break;
  }
  if (blocked) return { why: `${P.label} se raccorde ici mais ${blocked}.` };
  // Aucun raccord : géométrie ou roulis ?
  const any = placementsAfter(end, type, opts)[0] || (lineLike ? placementsAfter(end, type, {})[0] : null);
  if (any) {
    const got = tileEnds(Track.normalize(any)).find((e) => e.entry);
    if (got && rollGap(end, got) >= ROLL_TOLERANCE) return { why: `${P.label} se raccorde par sa forme, mais la route arrive ${ORI_NAME[o] || 'dans une autre orientation'} et cette pièce est ${ORI_NAME[endOrientation(got)] || 'dans une autre orientation'} : choisis une pièce posée ${ORI_NAME[o] || 'comme la route'}, ou une transition.` };
  }
  return { why: `Aucune ${P.label} ne se raccorde à cette extrémité (hauteur, pente ou cap incompatibles) : essaie une autre pièce de la même famille.` };
}
