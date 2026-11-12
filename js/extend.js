// Outil « Prolonger » de l'éditeur : à partir de l'extrémité libre d'une pièce, trouve où poser la pièce choisie pour qu'elle se RACCORDE (position, hauteur, cap et
// roulis). Module pur (aucun rendu, aucun DOM) : l'éditeur (editor/tools.js : extend) n'a plus qu'à poser le résultat.
import { PIECES, flagAllowed, clearConflicts } from './pieces.js';
import { Track } from './track.js';
import { tileEnds, endsTouch, placementsAfter, compatiblePlacement, rollGap, ROLL_TOLERANCE } from './connect.js';
import { endOrientation } from './continuity.js';
import { oriIdOfEnd, entryOrientation, transitionPath, oriLabel } from './orient.js';

const ORI_OPTS = { sol: {}, plafond: { v: 1 }, 'mur gauche': { o: 1 }, 'mur droit': { o: 2 }, 'incliné gauche': { o: 3 }, 'incliné droit': { o: 4 }, 'surplomb gauche': { o: 5 }, 'surplomb droit': { o: 6 } };
const ORI_NAME = { sol: 'au sol', plafond: 'au plafond', 'mur gauche': 'sur un mur gauche', 'mur droit': 'sur un mur droit', 'incliné gauche': 'incliné à 45° à gauche', 'incliné droit': 'incliné à 45° à droite', 'surplomb gauche': 'en surplomb à gauche', 'surplomb droit': 'en surplomb à droite' };

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
  let inferTry = null;
  if ((P.kind === 'line' || P.kind === 'arc' || (P.rollable && ORI_OPTS[o] && ORI_OPTS[o].o)) && ORI_OPTS[o]) {
    // Orientation déduite de la route qui précède : une ligne ou un virage se pose sur le mur / au plafond où elle arrive.
    const inf = { ...opts, o: 0, v: 0, ...ORI_OPTS[o] };
    if (ORI_OPTS[o].o ? flagAllowed(type, 'o', { ...inf, t: type }, ORI_OPTS[o].o) : true) inferTry = { opts: clearConflicts(inf, ORI_OPTS[o].v ? 'v' : ORI_OPTS[o].o ? 'o' : 'nb'), inferred: true };
  }
  // Phase 3 : une orientation CHOISIE (armée) qui n'est pas celle de la route déclenche le raccordement automatique (les transitions manquantes) AVANT la reprise silencieuse de l'orientation
  // de la route ; sans orientation choisie, la route reprend la sienne comme avant.
  const armed = !!(opts.o || opts.v);
  if (inferTry && !armed) tries.push(inferTry);
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
  // Phase 3 : raccordement AUTOMATIQUE. La route arrive dans une orientation et la pièce choisie commence dans une autre : on insère les transitions qui manquent (chemin le plus court,
  // 45° comprises), si la pièce et toutes les transitions tiennent (niveaux, pièces déjà posées). Rien n'est posé tant que tout le chemin n'est pas possible : le plan est rendu tel quel.
  const chain = autoBridge(track, end, type, opts);
  if (chain && chain.tile) return chain;
  if (inferTry && armed) {
    // (orientation choisie impossible à raccorder : on retombe sur celle de la route, comme avant la phase 3)
    const c = compatiblePlacement(end, type, inferTry.opts, {});
    if (c) { const tile = Track.normalize(c); if (Track.inBounds(tile) && !track.conflicts(tile).length) return { tile, inferred: true, end, reverse: false, note: chain && chain.why ? chain.why : '' }; }
  }
  if (chain && chain.why) return { why: chain.why };
  // Aucun raccord : géométrie ou roulis ?
  const any = placementsAfter(end, type, opts)[0] || (lineLike ? placementsAfter(end, type, {})[0] : null);
  if (any) {
    const got = tileEnds(Track.normalize(any)).find((e) => e.entry);
    if (got && rollGap(end, got) >= ROLL_TOLERANCE) return { why: `${P.label} se raccorde par sa forme, mais la route arrive ${ORI_NAME[o] || 'dans une autre orientation'} et cette pièce est ${ORI_NAME[endOrientation(got)] || 'dans une autre orientation'} : choisis une pièce posée ${ORI_NAME[o] || 'comme la route'}, ou une transition.` };
  }
  return { why: `Aucune ${P.label} ne se raccorde à cette extrémité (hauteur, pente ou cap incompatibles) : essaie une autre pièce de la même famille.` };
}

// Chaîne de transitions + pièce : { tile, chain: [tuiles dans l'ordre de pose], bridged: true } ou { why } ou null (pas de problème d'orientation à résoudre).
function autoBridge(track, end, type, opts) {
  const from = oriIdOfEnd(end);
  const want = entryOrientation(type, opts);
  if (from === null || want === null || from === want) return null;
  const path = transitionPath(from, want, true);
  if (!path) return { why: `Aucune suite de transitions ne mène de la route (${oriLabel(from)}) à la pièce (${oriLabel(want)}).` };
  const placed = [];
  const undo = () => { for (const t of placed.reverse()) track.remove(t); };
  let cur = end;
  for (const id of [...path, type]) {
    const o = id === type ? opts : {};
    const c = compatiblePlacement(cur, id, o, {});
    if (!c) { undo(); return { why: `${PIECES[id].label} ne se raccorde pas ici : la chaîne de transitions (${path.map((x) => PIECES[x].label).join(' → ')}) ne tient pas.` }; }
    const tile = Track.normalize(c);
    if (!Track.inBounds(tile)) { undo(); return { why: `${PIECES[id].label} sortirait des niveaux autorisés (monte ou descends la route d'avant).` }; }
    if (track.conflicts(tile).length) { undo(); return { why: `${PIECES[id].label} tomberait sur une pièce déjà posée.` }; }
    const added = track.add(tile);
    placed.push(added);
    cur = tileEnds(added).find((e) => e.exit);
    if (!cur) { undo(); return { why: `${PIECES[id].label} n'a pas de sortie.` }; }
  }
  const chain = placed.map((t) => ({ ...t }));
  undo();
  return { tile: chain[chain.length - 1], chain, bridged: true, end };
}
