// Éditeur de circuits : pièces sur grille, niveaux, rotation, revêtements réglables,
// options (envers, sans bordures, tunnel), décorations libres, vérification, historique.
import * as THREE from './vendor/three.module.min.js';
import { CELL, LEVEL_H, ROAD_TOP, MAX_LEVEL, DIRS, MAX_DECOS, SURF_PHYS } from './constants.js';
import { PIECES, SURFACES, SURFACE_ORDER, surfaceAllowed, surfaceRule, flagAllowed, paramText } from './pieces.js';
import { FAMILIES, FAMILY_ORDER, familyOf, resolve, validValues, withTrait, isFamilyMember, REPLACED_BY_OPTION } from './families.js';
import { retypePlacement } from './tileInfo.js';
import { Track, DECORS } from './track.js';
import { TrackView, buildTileMesh, SURFACE_STYLE, tint, THEME_SWATCH } from './trackMesh.js';
import { buildDecoMesh, safeUrl } from './decos.js';
import { isObstacle } from './obstacles.js';
import { DECO_CATS, DECO_LABELS, DECO_COLORS, DECO_PACK_ICONS } from './decoData.js';
import { setEditorDraft, saveMyTrack, newId } from './storage.js';
import { normRect, tilesInRect, decosInRect, copyRect, rotateClip, placedClip, pasteClip, shiftLevel, enclosedRegion, tileRegion, checkTrack } from './editorTools.js';
import { centerlineWorld } from './ribbons.js';
import { orientationIssues } from './joins.js';
import { Inspector, MIRROR_TYPES, LEGACY_CP } from './inspector.js';
import { keyLabel } from './input.js';
import { esc } from './ui.js';
import { pickObjects, pickTileExact, rayToSurface, ERASE_FILTERS, ERASE_FILTER_ORDER, LAYER_ALL, LAYER_DECO } from './editorPick.js';

// Pièces proposées dans la palette. 0.9.2 : plus aucun raccourci clavier pour choisir une pièce (les outils gardent les leurs).
export const PALETTE_ORDER = [
  'straight', 'curve', 'bigcurve', 'slope', 'steep', 'loop', 'loopL', 'loopBig', 'loopBigL', 'loopDouble', 'loopDoubleL', 'twist',
  'ramp90', 'wall', 'crest90', 'bank', 'bankBig', 'hugecurve', 'steep4', 'cv1', 'crv1',
  'tube', 'tubeIn', 'tubeMid', 'cork', 'corkL', 'fork', 'forkL', 'gentle', 'ring', 'start', 'finish', 'platform',
].map((id) => ({ id }));

// Outils (grille « Outils » à gauche) : ne posent rien. action : raccourci réglable (voir input.js) ; key : touche fixe.
export const TOOLS = [
  { id: 'select', label: 'Sélection', key: 'KeyQ', k: 'Q', hint: 'Zone : copier, déplacer, supprimer' },
  { id: 'inspect', label: 'Inspecter', action: 'ed.inspect', hint: 'Propriétés et gizmos 3D (Ctrl+D : dupliquer)' },
  { id: 'erase', label: 'Gomme', action: 'ed.erase', hint: 'Effacer (tout, décors ou pistes)' },
  { id: 'fill', label: 'Pot de peinture', action: 'ed.fill', hint: 'Remplir une zone connectée, ou une zone vide fermée' },
];
const TOOL_IDS = new Set(['select', 'inspect', 'erase']);

const MIRROR = MIRROR_TYPES;
const MODS = [
  { id: 'mod:v', flag: 'v', label: 'Plafond', hint: 'Route au plafond, à l’envers (gravité inversée)' },
  { id: 'mod:o1', flag: 'o', val: 1, label: 'Mur gauche', hint: 'Route sur le mur de gauche (vu dans le sens de la flèche) : il faut de la vitesse pour tenir' },
  { id: 'mod:o2', flag: 'o', val: 2, label: 'Mur droit', hint: 'Route sur le mur de droite (vu dans le sens de la flèche) : il faut de la vitesse pour tenir' },
  { id: 'mod:o0', flag: 'o', val: 0, label: 'Sol', hint: 'Remet la route à plat, au sol' },
  { id: 'mod:nb', flag: 'nb', label: 'Sans bordures', hint: 'Plus de rebord : on peut tomber' },
  { id: 'mod:tn', flag: 'tn', label: 'Tunnel', hint: 'Voûte autour de la route' },
  { id: 'mod:mv1', flag: 'mv', val: 1, label: 'Ascenseur', hint: 'Monte et redescend (réglable dans l’Inspecteur)' },
  { id: 'mod:mv2', flag: 'mv', val: 2, label: 'Glissière', hint: 'Glisse d’une case et revient (réglable)' },
  { id: 'mod:mv3', flag: 'mv', val: 3, label: 'Rotation', hint: 'Tourne autour de son centre (réglable)' },
  { id: 'mod:cp1', flag: 'cp', val: 1, label: 'Checkpoint', hint: 'Route : portique. Plateforme : balise au sol' },
  { id: 'mod:tb1', flag: 'tb', val: 1, label: 'Anneau turbo', hint: 'Anneau turbo (ligne droite plate, à l’endroit)' },
  { id: 'mod:th1', flag: 'th', val: 1, label: 'Thème Herbe', hint: 'Aspect herbeux (visuel)' },
  { id: 'mod:th2', flag: 'th', val: 2, label: 'Thème Sable', hint: 'Aspect sableux (visuel)' },
  { id: 'mod:th3', flag: 'th', val: 3, label: 'Thème Roche', hint: 'Aspect rocheux (visuel)' },
];
// Options proposées dans l'onglet « Options » : bascules (route) et choix exclusifs (checkpoint, thème, mouvement).
// Avec une pièce choisie, elles s'ajoutent à la pose (aperçu compris) ; sans pièce, elles s'appliquent à la pièce cliquée.
const OPTION_GROUPS = [
  // 0.9.3 : l'orientation est une caractéristique de toute ligne droite ou de tout virage (plus de pièces 90° à part).
  { id: 'ori', label: 'Orientation', flag: 'o', choices: [['o', 0, 'Sol'], ['o', 1, 'Mur gauche'], ['o', 2, 'Mur droit'], ['v', 1, 'Plafond']] },
  { id: 'route', label: 'Route', multi: true, choices: [['nb', 1, 'Sans bordures'], ['tn', 1, 'Tunnel']] },
  { id: 'cp', label: 'Checkpoint', flag: 'cp', check: true, choices: [['cp', 1, 'Checkpoint']] },
  { id: 'tb', label: 'Anneau turbo', flag: 'tb', choices: [['tb', 0, 'Aucun'], ['tb', 1, 'Turbo']] },
  { id: 'th', label: 'Thème', flag: 'th', choices: [['th', 0, 'Classique'], ['th', 1, 'Herbe'], ['th', 2, 'Sable'], ['th', 3, 'Roche']] },
  { id: 'mv', label: 'Mouvement', flag: 'mv', choices: [['mv', 0, 'Aucun'], ['mv', 1, 'Ascenseur'], ['mv', 2, 'Glissière'], ['mv', 3, 'Rotation']] },
];
const OPT_KEYS = ['v', 'o', 'nb', 'tn', 'mv', 'cp', 'tb', 'th'];
const OPT_NAMES = { v: 'plafond', o: 'mur', nb: 'sans bordures', tn: 'tunnel', mv: 'mouvement', cp: 'checkpoint', tb: 'anneau turbo', th: 'thème' };
const NO_OPTS = { v: 0, o: 0, nb: 0, tn: 0, mv: 0, cp: 0, tb: 0, th: 0 };
const modId = (flag, val) => (flag === 'v' || flag === 'nb' || flag === 'tn' ? 'mod:' + flag : `mod:${flag}${val}`);
// Un choix qui ne peut pas cohabiter avec un autre : poser « plafond » ou un mur exclut tunnel, mouvement et anneau aérien ; mouvement exclut checkpoint.
export function armedOptions(opts, flag, val) {
  const o = { v: 0, o: 0, nb: 0, tn: 0, mv: 0, cp: 0, tb: 0, th: 0, ...opts };
  // Orientation (0.9.3) : sol, mur gauche (1), mur droit (2) ; le plafond est le drapeau v. Un seul choix à la fois.
  if (flag === 'o') {
    o.o = val === 0 || o.o === val ? 0 : val;
    if (val === 0) o.v = 0;                                   // « Sol » : remet aussi la pièce à l'endroit
    if (o.o) { o.v = 0; o.tn = 0; o.mv = 0; o.cp = 0; o.tb = 0; }
    return o;
  }
  const bool = flag === 'v' || flag === 'nb' || flag === 'tn';
  if (bool) o[flag] = o[flag] ? 0 : 1; else o[flag] = o[flag] === val ? 0 : val;
  // Le dernier choix l'emporte sur ce qui ne peut pas cohabiter avec lui (l'anneau turbo se comporte comme le checkpoint aérien).
  if (o[flag]) {
    if (flag === 'v') { o.o = 0; o.tn = 0; o.mv = 0; o.tb = 0; if (o.cp === 2) o.cp = 0; }
    else if (flag === 'tn') { o.v = 0; o.o = 0; o.cp = 0; o.tb = 0; }
    else if (flag === 'mv') { o.v = 0; o.o = 0; o.cp = 0; o.tb = 0; }
    else if (flag === 'cp') { o.mv = 0; o.tn = 0; o.tb = 0; o.o = 0; if (o.cp === 2) o.v = 0; }
    else if (flag === 'tb') { o.mv = 0; o.tn = 0; o.v = 0; o.cp = 0; o.o = 0; }
  }
  return o;
}
// Pourquoi une pose sort des niveaux (sol ou plafond) : plafond, mur, pente descendante ou simple hauteur.
function outOfBounds(tile) {
  const P = PIECES[tile.t], [lo] = Track.range(tile);
  if (tile.v) return 'Hors des niveaux : à l’envers, la route pend sous son niveau (monte d’abord).';
  if (tile.o || (P.below && lo < 0)) return 'Hors des niveaux : une route sur un mur descend de 2 niveaux sous son niveau (monte d’abord).';
  if (lo < 0) return 'Hors des niveaux : la pente descend sous le sol (monte d’abord).';
  return 'Hors des niveaux.';
}
const SNAPS = [{ id: 0, label: 'Libre' }, { id: 1, label: '1 m' }, { id: 4, label: '4 m' }, { id: CELL / 2, label: 'Demi-case' }, { id: CELL, label: 'Case' }];

// Icônes (vue de dessus) des pièces et revêtements.
const svg = (inner) => `<svg viewBox="0 0 48 48">${inner}</svg>`;
const ROAD = '#3c4160', RAIL = '#ff6b57', LINE = '#efe6d6';
const straightBase = (road = ROAD, rail = RAIL) => `<rect x="10" y="2" width="28" height="44" fill="${road}"/><rect x="8" y="2" width="2" height="44" fill="${rail}"/><rect x="38" y="2" width="2" height="44" fill="${rail}"/>`;
const loopIcon = (mir, col, turns = 1, w = 9) => {
  const x0 = mir > 0 ? 14 : 34, x1 = mir > 0 ? 34 : 14;
  const r = turns > 1 ? `M${x0} 46V32a8 8 0 1 ${mir > 0 ? 1 : 0} 16 0a8 8 0 1 ${mir > 0 ? 1 : 0} -16 0` : `M${x0} 46V30a10 10 0 1 ${mir > 0 ? 1 : 0} ${mir > 0 ? 20 : -20} 0V2`;
  void x1;
  return svg(`<path d="${r}" stroke="${ROAD}" stroke-width="${w}" fill="none"/><path d="${r}" stroke="${col}" stroke-width="2" fill="none"/>`);
};
// Petit nombre d'inclinaison dans le coin d'une icône.
const numTag = (n) => `<text x="31" y="44" font-size="13" fill="#ffbf3c" font-family="sans-serif" font-weight="700" stroke="#14142a" stroke-width="2.2" paint-order="stroke">${n}</text>`;
const incIcon = (big, n) => svg(`${big ? '<path d="M4 48 A44 44 0 0 1 48 4 L48 22 A26 26 0 0 0 22 48Z" fill="#3c4160"/><path d="M4 48 A44 44 0 0 1 48 4" stroke="#ff6b57" stroke-width="2.5" fill="none"/><path d="M22 48 A26 26 0 0 1 48 22" stroke="#ff6b57" stroke-width="2.5" fill="none"/>' : '<path d="M10 48 A38 38 0 0 1 48 10 L48 38 A10 10 0 0 0 38 48Z" fill="#3c4160"/><path d="M10 48 A38 38 0 0 1 48 10" stroke="#ff6b57" stroke-width="2.5" fill="none"/><path d="M38 48 A10 10 0 0 1 48 38" stroke="#ff6b57" stroke-width="2.5" fill="none"/>'}<path d="M20 38l10-10M24 26l6 2-2 6" stroke="#ffbf3c" stroke-width="3" fill="none"/>${numTag(n)}`);
const crvIcon = (n) => svg(`<rect x="10" y="2" width="28" height="44" fill="#3c4160"/><rect x="8" y="2" width="2" height="44" fill="#ff6b57"/><rect x="38" y="2" width="2" height="44" fill="#ff6b57"/><path d="M14 42Q24 40 26 26T34 8M27 9h7v7" stroke="#ffbf3c" stroke-width="3.2" fill="none" stroke-linecap="round"/>${numTag(n)}`);
// Pente descendante : mêmes chevrons que la montée, mais pointant vers le bas (couleur différente).
const downIcon = (n) => svg(`<rect x="10" y="2" width="28" height="44" fill="#3c4160"/><rect x="8" y="2" width="2" height="44" fill="#ff6b57"/><rect x="38" y="2" width="2" height="44" fill="#ff6b57"/><path d="M16 10l8 8 8-8M16 22l8 8 8-8" stroke="#7dffb2" stroke-width="3" fill="none"/>${numTag(n)}`);
// Raccords de pente : profil vu de côté (plat -> pente, pente -> plat, S), montée ou descente.
const PROFILE_PATH = {
  iu: 'M12 40Q28 40 36 12', ou: 'M12 40Q20 12 36 12', su: 'M12 40C26 40 22 12 36 12',
  id: 'M12 12Q28 12 36 40', od: 'M12 12Q20 40 36 40', sd: 'M12 12C26 12 22 40 36 40',
};
const profIcon = (prof, down, n) => svg(`<rect x="10" y="2" width="28" height="44" fill="#3c4160"/><rect x="8" y="2" width="2" height="44" fill="#ff6b57"/><rect x="38" y="2" width="2" height="44" fill="#ff6b57"/><path d="${PROFILE_PATH[prof + (down ? 'd' : 'u')]}" stroke="${down ? '#7dffb2' : '#ffbf3c'}" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M12 44h24" stroke="#efe6d6" stroke-width="1.5" stroke-dasharray="2 3"/>${numTag(n)}`);
// Virage descendant : le virage incliné, avec une flèche vers le bas.
const decIcon = (big, n) => incIcon(big, n).replace('stroke="#ffbf3c"', 'stroke="#7dffb2"').replace('M20 38l10-10M24 26l6 2-2 6', 'M30 28L20 38M24 40l-6-2 2-6');
// Transition d'orientation : coupe de la route avant (à gauche) et après (à droite) ; 0 sol, 1 mur gauche, 2 mur droit, 3 plafond.
const ORI_BAR = { 0: 'M6 40h14', 1: 'M6 14v26', 2: 'M20 14v26', 3: 'M6 14h14' };
const rollIcon = (a, b, long) => svg(`<rect x="2" y="6" width="44" height="36" rx="5" fill="#2a2f4e"/><path d="${ORI_BAR[a]}" stroke="#36e9ff" stroke-width="4" stroke-linecap="round"/><path d="${ORI_BAR[b]}" stroke="#ffbf3c" stroke-width="4" stroke-linecap="round" transform="translate(22 0)"/><path d="M22 26h4M24.5 23.5l2.5 2.5-2.5 2.5" stroke="#efe6d6" stroke-width="2" fill="none"/>${long ? '<text x="24" y="46" font-size="9" fill="#efe6d6" font-family="sans-serif" text-anchor="middle">2×2</text>' : ''}`);
export const ICONS = {
  steep4: svg(`<rect x="10" y="2" width="28" height="44" fill="#3c4160"/><rect x="8" y="2" width="2" height="44" fill="#ff6b57"/><rect x="38" y="2" width="2" height="44" fill="#ff6b57"/><path d="M16 14l8-7 8 7M16 24l8-7 8 7M16 34l8-7 8 7M16 44l8-7 8 7" stroke="#ff6b57" stroke-width="3" fill="none"/>${numTag(4)}`),
  hugecurve: svg(`<path d="M2 48 A46 46 0 0 1 48 2 L48 14 A34 34 0 0 0 14 48Z" fill="#3c4160"/><path d="M2 48 A46 46 0 0 1 48 2" stroke="#ff6b57" stroke-width="2.5" fill="none"/><path d="M14 48 A34 34 0 0 1 48 14" stroke="#ff6b57" stroke-width="2.5" fill="none"/>`),
  crv05: crvIcon('½'), crv1: crvIcon(1), crv2: crvIcon(2), crv4: crvIcon(4),
  cv05: incIcon(false, '½'), cv1: incIcon(false, 1), cv2: incIcon(false, 2), cv4: incIcon(false, 4),
  cvL05: incIcon(false, '½'), cvL1: incIcon(false, 1), cvL2: incIcon(false, 2), cvL4: incIcon(false, 4),
  cvBig05: incIcon(true, '½'), cvBig1: incIcon(true, 1), cvBig2: incIcon(true, 2), cvBig4: incIcon(true, 4),
  cvBigL05: incIcon(true, '½'), cvBigL1: incIcon(true, 1), cvBigL2: incIcon(true, 2), cvBigL4: incIcon(true, 4),
  // 0.9.3 : pentes descendantes, raccords de pente, virages descendants, transitions d'orientation.
  dn05: downIcon('½'), dn1: downIcon(1), dn2: downIcon(2), dn4: downIcon(4),
  ...Object.fromEntries([['05', '½'], ['1', 1], ['2', 2], ['4', 4]].flatMap(([k, n]) => [
    ['cro' + k, profIcon('o', false, n)], ['cdi' + k, profIcon('i', true, n)], ['cdo' + k, profIcon('o', true, n)],
    ['cvd' + k, decIcon(false, n)], ['cvdL' + k, decIcon(false, n)], ['cvdBig' + k, decIcon(true, n)], ['cvdBigL' + k, decIcon(true, n)],
  ])),
  crs05: profIcon('s', false, '½'), crs1: profIcon('s', false, 1), cds05: profIcon('s', true, '½'), cds1: profIcon('s', true, 1),
  ...Object.fromEntries(['s', 'l'].flatMap((f) => ['01', '10', '02', '20', '13', '31', '23', '32'].map((pas) => ['tr' + pas + f, rollIcon(+pas[0], +pas[1], f === 'l')]))),
  roll: rollIcon(0, 1, false),
  straight: svg(`${straightBase()}<path d="M24 6v8M24 20v8M24 34v8" stroke="${LINE}" stroke-width="2"/>`),
  curve: svg(`<path d="M10 48 A38 38 0 0 1 48 10 L48 38 A10 10 0 0 0 38 48Z" fill="${ROAD}"/><path d="M10 48 A38 38 0 0 1 48 10" stroke="${RAIL}" stroke-width="2.5" fill="none"/><path d="M38 48 A10 10 0 0 1 48 38" stroke="${RAIL}" stroke-width="2.5" fill="none"/>`),
  courbe: crvIcon(''),
  bigcurve: svg(`<path d="M4 48 A44 44 0 0 1 48 4 L48 22 A26 26 0 0 0 22 48Z" fill="${ROAD}"/><path d="M4 48 A44 44 0 0 1 48 4" stroke="${RAIL}" stroke-width="2.5" fill="none"/><path d="M22 48 A26 26 0 0 1 48 22" stroke="${RAIL}" stroke-width="2.5" fill="none"/>`),
  slope: svg(`${straightBase()}<path d="M24 36V12M16 20l8-8 8 8" stroke="${LINE}" stroke-width="3" fill="none"/>`),
  steep: svg(`${straightBase()}<path d="M16 26l8-8 8 8M16 38l8-8 8 8" stroke="#ffbf3c" stroke-width="3" fill="none"/>`),
  loop: loopIcon(1, '#36e9ff'),
  loopL: loopIcon(-1, '#ff5fd2'),
  loopBig: loopIcon(1, '#36e9ff', 1, 11),
  loopBigL: loopIcon(-1, '#ff5fd2', 1, 11),
  loopDouble: svg(`<path d="M12 46V34a7 7 0 1 1 14 0a7 7 0 1 1 -14 0 M26 34a7 7 0 1 1 14 0V2" stroke="${ROAD}" stroke-width="7" fill="none"/><path d="M12 46V34a7 7 0 1 1 14 0a7 7 0 1 1 -14 0 M26 34a7 7 0 1 1 14 0V2" stroke="#36e9ff" stroke-width="1.6" fill="none"/>`),
  loopDoubleL: svg(`<path d="M36 46V34a7 7 0 1 0 -14 0a7 7 0 1 0 14 0 M22 34a7 7 0 1 0 -14 0V2" stroke="${ROAD}" stroke-width="7" fill="none"/><path d="M36 46V34a7 7 0 1 0 -14 0a7 7 0 1 0 14 0 M22 34a7 7 0 1 0 -14 0V2" stroke="#ff5fd2" stroke-width="1.6" fill="none"/>`),
  twist: svg(`${straightBase()}<path d="M14 40C14 28 34 28 34 16M34 40C34 28 14 28 14 16" stroke="#ffbf3c" stroke-width="3" fill="none"/>`),
  ramp90: svg(`${straightBase()}<path d="M24 40V28q0-8 8-8M26 20l7-3-3 7" stroke="#36e9ff" stroke-width="3" fill="none"/>`),
  wall: svg(`<rect x="10" y="2" width="28" height="44" fill="#2c3150"/><path d="M24 40V8M17 16l7-8 7 8M17 30l7-8 7 8" stroke="#36e9ff" stroke-width="3" fill="none"/>`),
  crest90: svg(`${straightBase()}<path d="M24 40V26q0-8 8-8M26 18l7 3-3-7" stroke="#ffbf3c" stroke-width="3" fill="none"/>`),
  bank: svg(`<path d="M4 48 A44 44 0 0 1 48 4 L48 22 A26 26 0 0 0 22 48Z" fill="#4a5078"/><path d="M4 48 A44 44 0 0 1 48 4" stroke="${RAIL}" stroke-width="4" fill="none"/><path d="M14 40 A32 32 0 0 1 40 14" stroke="#36e9ff" stroke-width="2" stroke-dasharray="4 4" fill="none"/>`),
  bankBig: svg(`<path d="M2 48 A46 46 0 0 1 48 2 L48 16 A32 32 0 0 0 16 48Z" fill="#4a5078"/><path d="M2 48 A46 46 0 0 1 48 2" stroke="${RAIL}" stroke-width="4" fill="none"/><path d="M10 44 A38 38 0 0 1 44 10" stroke="#ffbf3c" stroke-width="2" stroke-dasharray="4 4" fill="none"/>`),
  tube: svg(`<rect x="6" y="6" width="36" height="36" rx="18" fill="none" stroke="#7fe9ff" stroke-width="5"/><rect x="14" y="14" width="20" height="20" rx="10" fill="none" stroke="${ROAD}" stroke-width="5"/>`),
  tubeIn: svg(`<path d="M10 46V30q0-16 14-16t14 16v16" fill="none" stroke="#7fe9ff" stroke-width="5"/><rect x="10" y="40" width="28" height="6" fill="${ROAD}"/><path d="M24 34V6M18 12l6-6 6 6" stroke="${LINE}" stroke-width="2.5" fill="none"/>`),
  tubeMid: svg(`<circle cx="24" cy="24" r="16" fill="none" stroke="#7fe9ff" stroke-width="5"/><path d="M24 8a16 16 0 0 1 16 16" stroke="#ffd23e" stroke-width="3" fill="none"/><path d="M40 24l-4-5M40 24l4-5" stroke="#ffd23e" stroke-width="2.5"/>`),
  cork: svg(`${straightBase()}<path d="M14 42C14 30 34 34 34 24S14 18 14 6" stroke="#36e9ff" stroke-width="3.5" fill="none"/>`),
  corkL: svg(`${straightBase()}<path d="M34 42C34 30 14 34 14 24S34 18 34 6" stroke="#ff5fd2" stroke-width="3.5" fill="none"/>`),
  fork: svg(`<path d="M8 48V4h12v14q0 8 10 14t10 12v4H28v-2q0-6-8-10V48z" fill="${ROAD}"/><path d="M14 44V8M14 30q6 4 14 10" stroke="#ffd23e" stroke-width="2.5" fill="none"/>`),
  forkL: svg(`<path d="M40 48V4H28v14q0 8-10 14T8 44v4h12v-2q0-6 8-10V48z" fill="${ROAD}"/><path d="M34 44V8M34 30q-6 4-14 10" stroke="#ffd23e" stroke-width="2.5" fill="none"/>`),
  gentle: svg(`${straightBase()}<path d="M24 38V14M18 20l6-6 6 6" stroke="#7dffb2" stroke-width="2.5" fill="none"/><text x="34" y="44" font-size="10" fill="#7dffb2" font-family="sans-serif">½</text>`),
  ring: svg(`<circle cx="24" cy="22" r="15" fill="none" stroke="#36e9ff" stroke-width="5"/><path d="M18 22l6-6 6 6" stroke="#36e9ff" stroke-width="2.5" fill="none"/>`),
  cpRing: svg(`<circle cx="24" cy="22" r="15" fill="none" stroke="#ffbf3c" stroke-width="5"/><path d="M16 22h16" stroke="#ffbf3c" stroke-width="4"/>`),
  cpCurve: svg(`<path d="M10 48 A38 38 0 0 1 48 10 L48 38 A10 10 0 0 0 38 48Z" fill="${ROAD}"/><path d="M14 26l18 18" stroke="#ffbf3c" stroke-width="6"/>`),
  checkpoint: svg(`${straightBase()}<rect x="4" y="20" width="40" height="8" rx="2" fill="#ffbf3c"/>`),
  start: svg(`${straightBase()}<rect x="4" y="22" width="40" height="6" rx="2" fill="#2fd3b5"/><path d="M24 18V6M18 12l6-6 6 6" stroke="${LINE}" stroke-width="2.5" fill="none"/>`),
  finish: svg(`${straightBase()}<g fill="#f7f2ea"><rect x="10" y="20" width="4" height="4"/><rect x="18" y="20" width="4" height="4"/><rect x="26" y="20" width="4" height="4"/><rect x="34" y="20" width="4" height="4"/><rect x="14" y="24" width="4" height="4"/><rect x="22" y="24" width="4" height="4"/><rect x="30" y="24" width="4" height="4"/></g><rect x="4" y="16" width="40" height="3" fill="#ff4f9a"/>`),
  platform: svg(`<rect x="4" y="4" width="40" height="40" fill="#454a6a" stroke="#ffb84d" stroke-width="2"/><path d="M4 24h40M24 4v40" stroke="#5a6088" stroke-width="2"/>`),
  inspect: svg(`<rect x="8" y="14" width="26" height="22" rx="3" fill="#5ff2ff22" stroke="#5ff2ff" stroke-width="3"/><path d="M28 24l14 6-6 3-3 6z" fill="#fff" stroke="#1a1a2e" stroke-width="1.5"/><circle cx="21" cy="25" r="3" fill="#5ff2ff"/>`),
  select: svg(`<rect x="7" y="9" width="34" height="30" fill="#5ff2ff22" stroke="#5ff2ff" stroke-width="3" stroke-dasharray="6 4"/><path d="M30 30l10 10M30 30v8M30 30h8" stroke="#ffffff" stroke-width="2.5"/>`),
  erase: svg(`<path d="M12 12l24 24M36 12L12 36" stroke="#ff5a6e" stroke-width="5" stroke-linecap="round"/>`),
  fill: svg(`<path d="M10 26l14-14 14 14-12 12z" fill="#ffb34722" stroke="#ffb347" stroke-width="3" stroke-linejoin="round"/><path d="M24 12V8M36 30c3 4 5 6 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9z" stroke="#ffb347" stroke-width="3" fill="#ffb347" stroke-linecap="round"/>`),
  'surf:': svg(`${straightBase()}<path d="M24 8v32" stroke="${LINE}" stroke-width="2" stroke-dasharray="5 5"/>`),
  'surf:ice': svg(`${straightBase('#bfe4f2', '#7fd3ff')}<path d="M24 14v20M15 19l18 10M15 29l18-10" stroke="#4aa8d8" stroke-width="2.5"/>`),
  'surf:boost': svg(`${straightBase(ROAD, '#2fe0ff')}<path d="M15 18l9-7 9 7M15 30l9-7 9 7M15 42l9-7 9 7" stroke="#36e9ff" stroke-width="3" fill="none"/>`),
  'surf:bounce': svg(`${straightBase('#4a2d5c', '#ff5fd2')}<path d="M24 12l12 12-12 12-12-12z M24 18l6 6-6 6-6-6z" stroke="#ff5fd2" stroke-width="2.5" fill="none"/>`),
  'surf:magnet': svg(`${straightBase('#2c2a4a', '#b48cff')}<path d="M16 10v14a8 8 0 0 0 16 0V10" stroke="#b48cff" stroke-width="4" fill="none"/><path d="M13 10h6M29 10h6" stroke="#f3e7d3" stroke-width="4"/>`),
  'surf:drift': svg(`${straightBase('#3a2f3a', '#ff8c42')}<path d="M18 40Q14 26 24 14M30 40Q34 26 24 14" stroke="#ffb84d" stroke-width="2.5" fill="none"/>`),
  'surf:slow': svg(`${straightBase('#3b2a2f', '#ff6b57')}<path d="M12 14h24M12 24h24M12 34h24" stroke="#ffd23e" stroke-width="3" stroke-dasharray="4 3"/>`),
  'surf:wind': svg(`${straightBase('#2c3a52', '#bfefff')}<path d="M14 16h16l4-3M14 26h20M14 36h14l4 3" stroke="#bfefff" stroke-width="2.5" fill="none"/>`),
  'surf:water': svg(`${straightBase('#1f6fb2', '#9fe3ff')}<path d="M12 16q6-5 12 0t12 0M12 26q6-5 12 0t12 0M12 36q6-5 12 0t12 0" stroke="#9fe3ff" stroke-width="2.5" fill="none"/>`),
  'surf:boat': svg(`<defs><linearGradient id="bt" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#2a79bd"/><stop offset="0.6" stop-color="#5b7b8a"/></linearGradient></defs><rect x="10" y="2" width="28" height="44" fill="url(#bt)"/><rect x="8" y="2" width="2" height="44" fill="#3fd0ff"/><rect x="38" y="2" width="2" height="44" fill="#3fd0ff"/><path d="M12 12h24M12 20h24M12 28h24M12 36h24" stroke="#cdeeff" stroke-width="1.2" opacity=".6"/><path d="M12 30h24l-4 8H16z" fill="#3fd0ff"/><path d="M24 30V14l8 10h-8" stroke="#3fd0ff" stroke-width="2" fill="none"/>`),
  'surf:glider': svg(`${straightBase('#2f3346', '#f5f5f5')}<path d="M24 10L8 30h32z" fill="#f5f5f5"/><path d="M24 30v8M18 38h12" stroke="#f5f5f5" stroke-width="2"/>`),
  'surf:gravity': svg(`${straightBase('#233a3a', '#a7ffe0')}<circle cx="24" cy="24" r="7" stroke="#a7ffe0" stroke-width="2.5" fill="none"/><path d="M24 6v8M20 10l4-4 4 4M24 42v-8M20 38l4 4 4-4" stroke="#a7ffe0" stroke-width="2.2" fill="none"/>`),
  'surf:flip': svg(`${straightBase('#3a1f3f', '#ff4fd8')}<path d="M10 24h28" stroke="#ff4fd8" stroke-width="3"/><path d="M18 18V8M14 12l4-4 4 4M30 30v10M26 36l4 4 4-4" stroke="#ff4fd8" stroke-width="2.5" fill="none"/>`),
  'surf:conveyor': svg(`${straightBase('#2a2b30', '#ffd23e')}<path d="M14 22l10-8 10 8M14 32l10-8 10 8M14 42l10-8 10 8" stroke="#ffd23e" stroke-width="3" fill="none"/><path d="M6 8v34M42 8v34" stroke="#ffd23e" stroke-width="3" stroke-dasharray="4 4"/>`),
  'surf:spring': svg(`${straightBase('#1f3a2a', '#5dff8a')}<path d="M8 24l4-6 4 12 4-12 4 12 4-6" stroke="#5dff8a" stroke-width="2.5" fill="none"/><path d="M30 24h12M37 18l6 6-6 6" stroke="#5dff8a" stroke-width="3" fill="none"/>`),
  'surf:glass': svg(`${straightBase('#7fb8d6', '#e9fbff')}<path d="M24 24l-9-12M24 24l11-8M24 24l12 6M24 24l-2 16M24 24l-12 6" stroke="#ffffff" stroke-width="1.8"/><circle cx="24" cy="24" r="2.5" fill="#ffffff"/>`),
  'surf:powder': svg(`${straightBase('#e9f2fb', '#bcd9ff')}<path d="M24 10v28M12 17l24 14M12 31l24-14" stroke="#6fa8e8" stroke-width="2.2"/><circle cx="24" cy="24" r="3" fill="#ffffff" stroke="#6fa8e8"/>`),
  'surf:reverse': svg(`${straightBase('#2e2340', '#c05fff')}<path d="M10 18h22M26 12l6 6-6 6M38 32H16M22 26l-6 6 6 6" stroke="#c05fff" stroke-width="3" fill="none"/>`),
  'surf:cut': svg(`${straightBase('#3a1d1d', '#ff3b3b')}<path d="M17 15a11 11 0 1 0 14 0" stroke="#ff3b3b" stroke-width="3" fill="none"/><path d="M24 10v14M10 38L38 10" stroke="#ff3b3b" stroke-width="3"/>`),
  'surf:moto': svg(`${straightBase('#3b2e22', '#ff9f1c')}<circle cx="17" cy="32" r="5" stroke="#ff9f1c" stroke-width="2.5" fill="none"/><circle cx="31" cy="32" r="5" stroke="#ff9f1c" stroke-width="2.5" fill="none"/><path d="M17 32l6-10h7l1 10M26 22l-2-5h-4" stroke="#ff9f1c" stroke-width="2.5" fill="none"/>`),
  'mod:v': svg(`${straightBase('#2b2d44', '#8f7cff')}<path d="M24 12v24M16 28l8 8 8-8" stroke="#ffbf3c" stroke-width="3" fill="none"/><path d="M8 8h32" stroke="#8f7cff" stroke-width="3"/>`),
  'mod:nb': svg(`<rect x="10" y="2" width="28" height="44" fill="${ROAD}"/><path d="M24 6v8M24 20v8M24 34v8" stroke="${LINE}" stroke-width="2"/><path d="M8 2v44M40 2v44" stroke="#ff5a6e" stroke-width="2" stroke-dasharray="3 3"/>`),
  'mod:mv1': svg(`<rect x="10" y="20" width="28" height="12" fill="${ROAD}"/><path d="M24 4v12M19 9l5-5 5 5M24 44V36M19 39l5 5 5-5" stroke="#5ff2ff" stroke-width="3" fill="none"/>`),
  'mod:mv2': svg(`<rect x="18" y="8" width="12" height="32" fill="${ROAD}"/><path d="M4 24h10M8 19l-5 5 5 5M44 24H34M40 19l5 5-5 5" stroke="#5ff2ff" stroke-width="3" fill="none"/>`),
  'mod:tn': svg(`<path d="M6 44V22a18 18 0 0 1 36 0v22" stroke="#7fe9ff" stroke-width="3.5" fill="none"/><rect x="14" y="22" width="20" height="24" fill="${ROAD}"/>`),
};

// ---- Pot de peinture : outils 'fill-surf:<revêtement>' et 'fill-piece:<type>' ----------------
const FILL_MAX_DL = 2;                                  // écart de niveau toléré entre voisines (un tremplin monte de 2)
const FILL_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const isFill = (t) => t.startsWith('fill-');
const fillBase = (t) => (t.startsWith('fill-surf:') ? t.slice(5) : t.startsWith('fill-piece:') ? t.slice(11) : t);
const toFill = (t) => (t.startsWith('surf:') ? 'fill-' + t : PIECES[t] ? 'fill-piece:' + t : null);
const isStartFinish = (type) => { const sp = PIECES[type] && PIECES[type].special; return sp === 'start' || sp === 'finish'; };

export function pieceLabel(id) {
  if (isFill(id)) return 'Pot de peinture · ' + pieceLabel(fillBase(id));
  if (id === 'erase') return 'Gomme';
  if (id === 'select') return 'Sélection';
  if (id === 'inspect') return 'Inspecter';
  if (id.startsWith('surf:')) return SURFACES[id.slice(5)].label;
  if (id.startsWith('mod:')) return MODS.find((m) => m.id === id).label;
  if (id.startsWith('deco:')) return DECO_LABELS[id.slice(5)];
  return PIECES[id].label;
}

function validTool(t) {
  if (!t) return false;
  if (isFill(t)) return toFill(fillBase(t)) === t && validTool(fillBase(t));
  return !!PIECES[t] || t === 'erase' || t === 'select' || t === 'inspect' || (t.startsWith('surf:') && !!SURFACES[t.slice(5)]) || (t.startsWith('mod:') && MODS.some((m) => m.id === t)) || (t.startsWith('deco:') && !!DECO_LABELS[t.slice(5)]);
}

export class EditorSession {
  constructor(app, state = {}) {
    this.app = app;
    this.state = state;
    if (state.code) {
      try { this.track = Track.decode(state.code); } catch { this.track = new Track('Mon circuit'); }
    } else {
      this.track = new Track(state.name || 'Mon circuit');
      this.track.decor = state.decor || 'desert';
      this.track.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 });
    }
    if (state.name) this.track.name = state.name;
    this.entryId = state.entryId || null;
    this.tool = validTool(state.tool) ? state.tool : 'straight';
    this.fillMode = isFill(this.tool);
    this.eraseFilter = ERASE_FILTERS[state.eraseFilter] ? state.eraseFilter : 'all';   // gomme : tout / décorations / pistes
    this.camLocked = false;      // vrai pendant qu'un gizmo est saisi : la caméra de l'éditeur ne bouge pas
    this.rot = state.rot || 0;
    this.level = state.level || 0;
    this.tab = 'pieces';
    this.showGrid = true;
    this.autoLevel = null;
    this.surfParam = {};
    this.opts = { ...NO_OPTS };   // options « armées » : elles se posent avec la pièce choisie
    this.famTraits = {};      // dernière combinaison de caractéristiques choisie par famille
    this.sel = null;          // rectangle de sélection {x0, z0, x1, z1}
    this.selDrag = null;
    this.clip = null;         // presse-papiers
    this.pasting = false;
    this.focusLevel = false;  // vue par niveau
    this.deco = { cat: 'signs', color: 0, scale: 1, rot: 0, url: '', snap: 0, ph: 0, dy: 0 };

    this.view = new TrackView(this.track, app.materials, { showAllDecos: true });      // l'éditeur montre toujours toutes les décorations, même en qualité Potato
    app.scenery.trackGroup.add(this.view.group);
    this._applyDecor();

    // Aperçus
    this.previewMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.62, depthWrite: false, emissive: '#000000', side: THREE.DoubleSide });
    this.previewGlow = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
    this.preview = new THREE.Group();
    app.scene.add(this.preview);
    this.previewKey = '';
    this.highlight = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: '#ff3b5c', transparent: true, opacity: 0.28, depthWrite: false }),
    );
    this.highlight.visible = false;
    app.scene.add(this.highlight);
    this.marker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 1, 6),
      new THREE.MeshBasicMaterial({ color: '#5ff2ff', transparent: true, opacity: 0.6 }),
    );
    app.scene.add(this.marker);
    this.footprint = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#5ff2ff', transparent: true, opacity: 0.18, depthWrite: false }),
    );
    app.scene.add(this.footprint);
    this.selBox = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: '#5ff2ff', transparent: true, opacity: 0.14, depthWrite: false }),
    );
    this.selBox.visible = false;
    app.scene.add(this.selBox);
    this.marks = new THREE.Group();
    app.scene.add(this.marks);
    this.grid = null;
    this.gridKey = '';

    const cam = state.cam || this._fitCamera();
    this.target = new THREE.Vector3(cam.tx, this.levelY(), cam.tz);
    this.dist = cam.dist; this.yaw = cam.yaw; this.pitch = cam.pitch;

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2(9, 9);
    this.hover = null;
    this.pointers = new Map();

    this.history = [this._snapshot()];
    this.hIndex = 0;
    this.histSel = [null];       // sélection de l'Inspection rangée avec chaque pas d'historique

    // Le gizmo (TransformControls) s'abonne aux clics AVANT l'éditeur : il décide le premier s'il est saisi.
    this.inspector = new Inspector(this);
    this._bind();
    this._buildEraseBar();
    this._buildPalette();
    this._refreshUI();
    app.camera.fov = 55;
    app.camera.up.set(0, 1, 0);
    app.camera.updateProjectionMatrix();
  }

  _fitCamera() {
    const b = this.track.bounds();
    return {
      tx: (b.minX + b.maxX) / 2, tz: (b.minZ + b.maxZ) / 2,
      dist: Math.max(130, Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 1.1), yaw: Math.PI * 0.25, pitch: 0.95,
    };
  }

  _applyDecor() {
    this.app.scenery.setTrack(this.track, 'editeur-' + this.track.decor, { decor: false, minHalf: CELL * 40 });
  }

  levelY(l = this.level) {
    return l * LEVEL_H + ROAD_TOP;
  }

  exportState() {
    return {
      code: this.track.encode(),
      entryId: this.entryId,
      name: this.track.name,
      tool: this.tool,
      eraseFilter: this.eraseFilter,
      rot: this.rot,
      level: this.level,
      cam: { tx: this.target.x, tz: this.target.z, dist: this.dist, yaw: this.yaw, pitch: this.pitch },
    };
  }

  // ---------------------------------------------------------------- UI
  _toolButton(parent, id, k, label = pieceLabel(id)) {
    const b = document.createElement('button');
    b.className = 'piece-btn';
    b.dataset.piece = id;
    b.title = label + (k ? ` (${k})` : '');
    const icon = ICONS[id] || `<span class="emo">${id.startsWith('deco:') ? DECO_ICON[id.slice(5)] || '◆' : '◆'}</span>`;
    b.innerHTML = `${k ? `<span class="k">${k}</span>` : ''}${icon}<span>${label}</span>`;
    b.addEventListener('click', () => { this.setTool(id); this.app.audio.click(); });
    parent.appendChild(b);
  }

  _buildPalette() {
    const pal = document.getElementById('ed-palette');
    pal.innerHTML = '';
    const tabs = document.createElement('div');
    tabs.className = 'pal-tabs';
    const panels = {};
    for (const [id, label] of [['pieces', 'Pièces'], ['mods', 'Options'], ['surf', 'Revêtements'], ['decos', 'Décors']]) {   // Options à côté de Pièces
      const b = document.createElement('button');
      b.className = 'pal-tab';
      b.dataset.tab = id;
      b.textContent = label;
      b.addEventListener('click', () => { if (pal.classList.contains('folded')) pal.querySelector('.pal-fold').click(); this.setTab(id); this.app.audio.click(); });
      tabs.appendChild(b);
      const panel = document.createElement('div');
      panel.className = 'pal-panel';
      panel.dataset.panel = id;
      panels[id] = panel;
    }
    // Replier la palette : libère l'écran (utile sur téléphone en paysage). Le choix est mémorisé.
    const fold = document.createElement('button');
    fold.className = 'pal-tab pal-fold'; fold.type = 'button';
    const setFold = (on, save) => {
      pal.classList.toggle('folded', on);
      fold.textContent = on ? '▴' : '▾';
      fold.title = fold.ariaLabel = on ? 'Déplier la palette' : 'Replier la palette';
      fold.setAttribute('aria-expanded', String(!on));
      document.getElementById('editor').style.setProperty('--ed-pal-h', pal.offsetHeight + 'px');
      if (save) try { localStorage.setItem('copytrack.edFold', on ? '1' : '0'); } catch (e) { /* stockage indisponible */ }
    };
    fold.addEventListener('click', () => { setFold(!pal.classList.contains('folded'), true); this.app.audio.click(); });
    tabs.appendChild(fold);
    pal.appendChild(tabs);
    let folded = false; try { folded = localStorage.getItem('copytrack.edFold') === '1'; } catch (e) { /* ignoré */ }
    setFold(folded, false);

    // Familles (caractéristiques en listes déroulantes), puis les pièces à l'unité.
    const rowF = document.createElement('div'); rowF.className = 'fam-row';
    this.famCards = {};
    for (const fam of FAMILY_ORDER) rowF.appendChild(this._familyCard(fam));
    panels.pieces.appendChild(rowF);
    const rowP = document.createElement('div'); rowP.className = 'pal-row';
    for (const p of PALETTE_ORDER) if (!isFamilyMember(p.id) && !REPLACED_BY_OPTION.has(p.id)) this._toolButton(rowP, p.id, p.k);
    panels.pieces.appendChild(rowP);

    const rowS = document.createElement('div'); rowS.className = 'pal-row surf';
    for (const s of SURFACE_ORDER) this._toolButton(rowS, 'surf:' + s, '');
    panels.surf.appendChild(rowS);
    const par = document.createElement('div');
    par.className = 'pal-param';
    par.innerHTML = '<span id="ed-param-label">—</span><input type="range" id="ed-param" min="0" max="100" step="1"><b id="ed-param-val"></b><button class="btn" id="ed-param-reset" title="Valeur par défaut">↺</button>';
    panels.surf.appendChild(par);
    const compat = document.createElement('button');
    compat.className = 'btn small';
    compat.textContent = 'Compatibilité…';
    compat.title = 'Quels revêtements vont sur quelles pièces';
    compat.addEventListener('click', () => this.showCompat());
    par.appendChild(compat);

    panels.mods.appendChild(this._optionsPanel());
    const hint = document.createElement('div');
    hint.className = 'pal-hint';
    hint.id = 'ed-opt-hint';
    hint.textContent = 'Pièce + options se posent ensemble. Sans pièce : l’option s’applique à la pièce cliquée.';
    panels.mods.appendChild(hint);

    const dTop = document.createElement('div');
    dTop.className = 'pal-deco-top';
    dTop.innerHTML = `<div class="swatches" id="ed-deco-colors"></div>
      <label class="inl">Taille <input type="range" id="ed-deco-scale" min="0.3" max="6" step="0.05"><b id="ed-deco-scale-val"></b></label>
      <label class="inl" id="ed-deco-ph-wrap" title="Décalage dans le cycle de l'obstacle (pour désynchroniser plusieurs obstacles)">Décalage <input type="range" id="ed-deco-ph" min="0" max="0.95" step="0.05"><b id="ed-deco-ph-val"></b></label>
      <label class="inl" title="Posée là où le curseur touche la route ou le sol ; ce curseur (ou Maj + souris) ajoute une hauteur">Hauteur <input type="range" id="ed-deco-dy" min="-20" max="120" step="0.5"><b id="ed-deco-dy-val"></b></label>
      <button class="btn" id="ed-deco-snap" title="Accrochage (N)"></button>
      <input type="text" id="ed-deco-url" placeholder="URL de l'image (https://…)" maxlength="400">`;
    // Sous-catégories de décors : une rangée de boutons (plus de liste déroulante).
    const cats = document.createElement('div');
    cats.className = 'pal-chips'; cats.id = 'ed-deco-cats'; cats.setAttribute('role', 'tablist'); cats.setAttribute('aria-label', 'Catégories de décors');
    for (const [k, c] of Object.entries(DECO_CATS)) {
      const b = document.createElement('button');
      b.className = 'chip'; b.dataset.cat = k; b.textContent = c.label; b.setAttribute('role', 'tab');
      b.addEventListener('click', () => { this.deco.cat = k; this._buildDecoRow(); this.app.audio.click(); });
      cats.appendChild(b);
    }
    panels.decos.appendChild(cats);
    panels.decos.appendChild(dTop);
    const rowD = document.createElement('div'); rowD.className = 'pal-row decos'; rowD.id = 'ed-deco-row';
    panels.decos.appendChild(rowD);
    for (const p of Object.values(panels)) pal.appendChild(p);

    // Réglages des revêtements
    const range = document.getElementById('ed-param');
    range.oninput = () => { this.surfParam[fillBase(this.tool).slice(5)] = +range.value; this._refreshParam(); };
    document.getElementById('ed-param-reset').onclick = () => { delete this.surfParam[fillBase(this.tool).slice(5)]; this._refreshParam(); };
    // Réglages des décorations
    const sc = document.getElementById('ed-deco-scale');
    sc.value = this.deco.scale;
    sc.oninput = () => { this.deco.scale = +sc.value; this.previewKey = ''; this._refreshDeco(); };
    const dyr = document.getElementById('ed-deco-dy');
    dyr.value = this.deco.dy || 0;
    dyr.oninput = () => { this.deco.dy = +dyr.value; this.previewKey = ''; this._refreshDeco(); };
    const ph = document.getElementById('ed-deco-ph');
    ph.value = this.deco.ph;
    ph.oninput = () => { this.deco.ph = +ph.value; this.previewKey = ''; this._refreshDeco(); };
    document.getElementById('ed-deco-snap').onclick = () => this.cycleSnap();
    const url = document.getElementById('ed-deco-url');
    url.oninput = () => { this.deco.url = url.value.trim(); this.previewKey = ''; };
    const colors = document.getElementById('ed-deco-colors');
    colors.innerHTML = '';
    for (let i = 0; i <= DECO_COLORS.length; i++) {
      const b = document.createElement('button');
      b.className = 'swatch' + (i === this.deco.color ? ' on' : '');
      b.dataset.c = i;
      b.title = i ? DECO_COLORS[i - 1] : 'Couleurs naturelles';
      b.style.background = i ? DECO_COLORS[i - 1] : 'conic-gradient(#ff6b57,#ffbf3c,#7cf06b,#3ec1ff,#c77dff,#ff6b57)';
      b.onclick = () => { this.deco.color = i; this.previewKey = ''; this._refreshDeco(); };
      colors.appendChild(b);
    }
    this._buildDecoRow();

    this.setTab(fillBase(this.tool).startsWith('surf:') ? 'surf' : this.tool.startsWith('mod:') ? 'mods' : this.tool.startsWith('deco:') ? 'decos' : 'pieces');
    this._buildTools();
  }

  // Grille « Outils » : Sélection, Inspecter, Gomme, Pot de peinture (ils ne posent rien : à part des pièces).
  _buildTools() {
    const box = document.getElementById('ed-tools');
    box.innerHTML = '';
    const SHORT = { Backslash: '\\', Slash: '/', Backquote: '`', Delete: 'Suppr' };
    const label = (code) => (code ? SHORT[code] || keyLabel(code) : '');
    for (const t of TOOLS) {
      const code = t.action ? (this.app.input.bindings[t.action] || []).filter(Boolean)[0] : t.key;
      const k = t.k || label(code);
      const b = document.createElement('button');
      b.className = 'tool-btn';
      b.dataset.tool = t.id;
      b.title = `${t.label}${k ? ` (${k})` : ''} : ${t.hint}`;
      b.setAttribute('aria-label', t.label);
      b.innerHTML = `${k ? `<span class="k">${esc(k)}</span>` : ''}${ICONS[t.id] || ''}<span>${t.label}</span>`;
      b.addEventListener('click', () => { if (t.id === 'fill') this.toggleFill(); else this.setTool(t.id); this.app.audio.click(); });
      box.appendChild(b);
    }
  }

  // ---- Familles de pièces (Phase 2) ---------------------------------------------------------------------------------
  _familyCard(fam) {
    const F = FAMILIES[fam];
    const card = document.createElement('div');
    card.className = 'fam-card';
    card.dataset.fam = fam;
    const main = document.createElement('button');
    main.className = 'piece-btn fam-main';
    main.addEventListener('click', () => { this.setTool(resolve(fam, this._famTraits(fam))); this.app.audio.click(); });
    card.appendChild(main);
    const col = document.createElement('div');
    col.className = 'fam-traits';
    const selects = {};
    for (const t of F.traits) {
      const lab = document.createElement('label');
      const span = document.createElement('span');
      span.textContent = t.label;
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', `${F.label} : ${t.label}`);
      for (const [v, text] of t.values) { const o = document.createElement('option'); o.value = v; o.textContent = text; sel.appendChild(o); }
      sel.addEventListener('change', () => {
        const type = withTrait(fam, this._famTraits(fam), t.id, sel.value);
        if (type) this.setTool(type);
        this.app.audio.click();
      });
      lab.append(span, sel);
      col.appendChild(lab);
      selects[t.id] = sel;
    }
    card.appendChild(col);
    this.famCards[fam] = { card, main, selects };
    return card;
  }

  // Combinaison de caractéristiques actuelle d'une famille (celle de la pièce choisie, sinon la dernière choisie, sinon la 1re).
  _famTraits(fam) {
    const f = familyOf(fillBase(this.tool));
    if (f && f.fam === fam) this.famTraits[fam] = f.traits;
    if (!this.famTraits[fam]) this.famTraits[fam] = { ...FAMILIES[fam].members[Object.keys(FAMILIES[fam].members)[0]] };
    return this.famTraits[fam];
  }

  _syncFamilies() {
    if (!this.famCards) return;
    for (const fam of FAMILY_ORDER) {
      const { card, main, selects } = this.famCards[fam];
      const F = FAMILIES[fam];
      const tr = this._famTraits(fam);
      const type = resolve(fam, tr);
      const on = !!type && type === fillBase(this.tool);
      card.classList.toggle('on', on);
      main.classList.toggle('on', on);
      main.dataset.piece = type || '';
      const P = type && PIECES[type];
      main.title = P ? `${P.label} — ${F.hint}` : F.label;
      main.innerHTML = `${ICONS[type] || ICONS[F.icon] || '<span class="emo">◆</span>'}<span>${F.label}${P && P.size > 1 ? ` ${P.size}×${P.size}` : ''}</span>`;
      for (const t of F.traits) {
        const ok = validValues(fam, tr, t.id);
        selects[t.id].value = tr[t.id];
        for (const o of selects[t.id].options) o.disabled = !ok.has(o.value) && o.value !== tr[t.id];
      }
    }
  }

  // ---- Options (Phase 2) -----------------------------------------------------------------------------------------------
  _optionsPanel() {
    const wrap = document.createElement('div');
    wrap.className = 'opt-panel';
    this.optChips = [];
    for (const g of OPTION_GROUPS) {
      const row = document.createElement('div');
      row.className = 'opt-group';
      const lab = document.createElement('b');
      lab.textContent = g.label;
      row.appendChild(lab);
      const chips = document.createElement('div');
      chips.className = 'pal-chips';
      chips.setAttribute('role', 'group');
      chips.setAttribute('aria-label', g.label);
      for (const [flag, val, text] of g.choices) {
        const b = document.createElement('button');
        b.className = 'chip' + (val === 0 ? ' none' : '') + (g.check ? ' chk' : '');
        b.textContent = text;
        b.dataset.flag = flag; b.dataset.val = val;
        if (flag === 'th') {
          const sw = document.createElement('i');
          sw.className = 'th-sw'; sw.style.background = THEME_SWATCH[val] || THEME_SWATCH[0];
          b.prepend(sw);
        }
        const m = val ? MODS.find((x) => x.id === modId(flag, val)) : null;
        b.title = m ? m.hint : flag === 'cp' ? 'Pas de checkpoint' : flag === 'mv' ? 'Pièce fixe' : flag === 'th' ? 'Aspect d’origine' : flag === 'o' ? 'Route à plat, au sol' : '';
        b.addEventListener('click', () => { this._optClick(flag, val); this.app.audio.click(); });
        chips.appendChild(b);
        this.optChips.push(b);
      }
      row.appendChild(chips);
      wrap.appendChild(row);
    }
    const clear = document.createElement('button');
    clear.className = 'btn small';
    clear.id = 'ed-opt-clear';
    clear.textContent = 'Retirer les options';
    clear.addEventListener('click', () => { this.opts = { ...NO_OPTS }; this.previewKey = ''; this._refreshUI(); });
    wrap.appendChild(clear);
    return wrap;
  }

  // Clic sur une option : avec une pièce choisie elle est « armée » (posée avec elle) ; sans pièce, elle devient l'outil
  // « appliquer à une pièce posée » (comme avant).
  _optClick(flag, val) {
    if (PIECES[this.tool]) {
      this.opts = armedOptions(this.opts, flag, val);
      this.previewKey = '';
      this._refreshUI();
      return;
    }
    this.setTool(modId(flag, val === 0 && (flag === 'v' || flag === 'nb' || flag === 'tn') ? 1 : val));
  }

  _syncOptions() {
    if (!this.optChips) return;
    const piece = PIECES[this.tool] ? this.tool : null;
    const probe = piece ? Track.normalize({ t: piece, x: 0, z: 0, l: 0, r: 0 }) : null;
    for (const b of this.optChips) {
      const flag = b.dataset.flag, val = +b.dataset.val;
      let on;
      if (piece) {
        if (flag === 'o' && val === 0) on = !this.opts.o && !this.opts.v;                 // « Sol » : ni mur ni plafond
        else if (val === 0) on = !this.opts[flag];
        else on = flag === 'v' || flag === 'nb' || flag === 'tn' ? !!this.opts[flag] : this.opts[flag] === val;
      } else on = this.tool === modId(flag, val);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      // « Aucun » n'a de sens que pour une pose combinée ; un choix impossible sur la pièce est grisé.
      b.hidden = !piece && val === 0 && flag !== 'o';
      // « Sol » est toujours possible ; l'orientation compte pour la ligne droite et le virage, pas pour les autres pièces.
      const ok = !piece || (flag === 'o' && val === 0) || (val === 0) || flagAllowed(piece, flag, flag === 'cp' || flag === 'mv' || flag === 'tb' ? { ...probe, ...this._compatProbe(flag) } : flag === 'o' ? null : probe, val);
      b.classList.toggle('dim', !ok);
    }
    const hint = document.getElementById('ed-opt-hint');
    if (hint) hint.dataset.mode = piece ? 'combo' : 'apply';
    const clear = document.getElementById('ed-opt-clear');
    if (clear) clear.hidden = !piece || !OPT_KEYS.some((k) => this.opts[k]);
  }

  // Options déjà armées qui gênent le test d'une autre (mouvement ↔ checkpoint, tunnel ↔ checkpoint).
  _compatProbe(flag) {
    const o = this.opts;
    return flag === 'cp' ? { mv: o.mv, tn: o.tn, tb: o.tb, v: o.v, o: o.o } : flag === 'tb' ? { mv: o.mv, tn: o.tn, cp: o.cp, v: o.v, o: o.o } : { cp: o.cp, tb: o.tb, v: o.v, o: o.o };
  }

  _syncDecoCats() {
    document.querySelectorAll('#ed-deco-cats .chip').forEach((c) => { const on = c.dataset.cat === this.deco.cat; c.classList.toggle('on', on); c.setAttribute('aria-selected', String(on)); });
  }

  _buildDecoRow() {
    this._syncDecoCats();
    const row = document.getElementById('ed-deco-row');
    row.innerHTML = '';
    for (const k of DECO_CATS[this.deco.cat].kinds) this._toolButton(row, 'deco:' + k, '');
    this._refreshUI();
  }

  setTab(id) {
    this.tab = id;
    document.querySelectorAll('#ed-palette .pal-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
    document.querySelectorAll('#ed-palette .pal-panel').forEach((p) => { p.hidden = p.dataset.panel !== id; });
  }

  setTool(id) {
    // Mode pot de peinture : choisir une pièce ou un revêtement garde le pot ; tout autre outil le quitte.
    if (isFill(id)) this.fillMode = true;
    else if (this.fillMode && toFill(id)) id = toFill(id);
    else this.fillMode = false;
    if (id !== 'select') { this.pasting = false; this.sel = null; this.selDrag = null; }
    if (id !== 'inspect') this.inspector.clear();
    if (PIECES[fillBase(id)] || fillBase(id).startsWith('surf:')) this._lastBrush = fillBase(id);     // dernière pièce / dernier revêtement : sert au pot de peinture
    this.tool = id;
    this.previewKey = '';
    if (fillBase(id).startsWith('surf:')) this.setTab('surf');
    else if (id.startsWith('mod:')) this.setTab('mods');
    else if (id.startsWith('deco:')) {
      this.setTab('decos');
      const kind = id.slice(5);
      const cat = Object.entries(DECO_CATS).find(([, c]) => c.kinds.includes(kind));
      if (cat && cat[0] !== this.deco.cat) { this.deco.cat = cat[0]; this._buildDecoRow(); }
    } else if (!TOOL_IDS.has(id)) this.setTab('pieces');     // un outil (sélection, inspecteur, gomme) garde l'onglet affiché
    this._refreshUI();
  }

  // Active / désactive le pot de peinture sur la pièce ou le revêtement choisi.
  toggleFill() {
    if (isFill(this.tool)) {
      this.fillMode = false;
      this.setTool(fillBase(this.tool));
      this.app.ui.flash('Pot de peinture désactivé', 1.2);
      return;
    }
    const f = toFill(this.tool) || toFill(this._lastBrush || 'straight');     // depuis un autre outil : on remplit avec la dernière pièce choisie
    if (!f) { this.app.ui.flash('Choisis d’abord une pièce ou un revêtement.'); this.app.audio.error(); return; }
    this.setTool(f);
    this.app.ui.flash('Pot de peinture : clique une pièce pour remplir sa zone', 1.8);
  }

  cyclePiece(d) {
    const ids = PALETTE_ORDER.map((p) => p.id);
    const i = ids.indexOf(fillBase(this.tool));
    this.setTool(ids[(i + d + ids.length) % ids.length] || 'straight');
  }

  cycleSurface() {
    const ids = SURFACE_ORDER.map((s) => 'surf:' + s);
    const i = ids.indexOf(fillBase(this.tool));
    this.setTool(ids[(i + 1) % ids.length]);
  }

  cycleSnap() {
    const i = SNAPS.findIndex((s) => s.id === this.deco.snap);
    this.deco.snap = SNAPS[(i + 1) % SNAPS.length].id;
    this._refreshDeco();
    this.app.ui.flash(`Accrochage : ${SNAPS.find((s) => s.id === this.deco.snap).label}`, 1.2);
  }

  mirror() {
    const base = fillBase(this.tool);
    if (MIRROR[base]) { this.setTool(MIRROR[base]); return; }
    // 0.9.3 : une ligne droite ou un virage armé « Mur gauche » devient « Mur droit », et inversement.
    if (PIECES[base] && this.opts && (this.opts.o === 1 || this.opts.o === 2)) {
      this.opts = armedOptions({ ...this.opts, o: 0 }, 'o', this.opts.o === 1 ? 2 : 1);
      this.previewKey = '';
      this._refreshUI();
    }
  }

  _surfParamValue(s) {
    const S = SURFACES[s];
    return this.surfParam[s] || (S && S.def) || 0;
  }

  _refreshParam() {
    const base = fillBase(this.tool);
    const s = base.startsWith('surf:') ? base.slice(5) : '';
    const S = SURFACES[s];
    const box = document.querySelector('.pal-param');
    if (!box) return;
    box.style.visibility = S && S.def != null ? 'visible' : 'hidden';
    if (!S || S.def == null) return;
    const r = document.getElementById('ed-param');
    r.min = S.min; r.max = S.max;
    r.value = this._surfParamValue(s);
    r.style.accentColor = tint(s, +r.value);
    document.getElementById('ed-param-label').textContent = S.param || 'Intensité';
    document.getElementById('ed-param-val').textContent = paramText(s, +r.value);      // unités réelles : km/h, m/s², m, s (sinon %)
    this.previewKey = '';
  }

  _refreshDeco() {
    const k = this.tool.startsWith('deco:') ? this.tool.slice(5) : '';
    document.querySelectorAll('#ed-deco-colors .swatch').forEach((b) => b.classList.toggle('on', +b.dataset.c === this.deco.color));
    const sc = document.getElementById('ed-deco-scale');
    if (sc) sc.value = this.deco.scale;
    const v = document.getElementById('ed-deco-scale-val');
    if (v) v.textContent = '×' + this.deco.scale.toFixed(2);
    const sn = document.getElementById('ed-deco-snap');
    if (sn) sn.textContent = 'Accrochage : ' + SNAPS.find((s) => s.id === this.deco.snap).label;
    const url = document.getElementById('ed-deco-url');
    if (url) url.style.display = k === 'plaque' ? '' : 'none';
    const phw = document.getElementById('ed-deco-ph-wrap');
    if (phw) phw.style.display = isObstacle(k) ? '' : 'none';
    const phv = document.getElementById('ed-deco-ph-val');
    if (phv) phv.textContent = Math.round(this.deco.ph * 100) + ' %';
    const dyr = document.getElementById('ed-deco-dy'), dyv = document.getElementById('ed-deco-dy-val');
    if (dyr && document.activeElement !== dyr) dyr.value = this.deco.dy || 0;
    if (dyv) dyv.textContent = `${(this.deco.dy || 0) >= 0 ? '+' : ''}${(this.deco.dy || 0).toFixed(1)} m`;
  }

  _refreshUI() {
    this._refreshSelBar();
    document.querySelectorAll('#ed-palette .piece-btn:not(.fam-main)').forEach((b) => b.classList.toggle('on', b.dataset.piece === fillBase(this.tool)));
    this._syncFamilies();
    this._syncOptions();
    // Grille d'outils : l'outil actif (le pot de peinture reste actif en gardant la pièce / le revêtement choisi).
    document.querySelectorAll('#ed-tools .tool-btn').forEach((b) => {
      const on = b.dataset.tool === 'fill' ? isFill(this.tool) : b.dataset.tool === this.tool;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    });
    document.getElementById('ed-level').textContent = `Niv. ${this.level}`;
    if (this.eraseBar) {
      this.eraseBar.classList.toggle('hidden', this.tool !== 'erase');
      this.eraseBar.querySelectorAll('[data-ef]').forEach((b) => b.classList.toggle('on', b.dataset.ef === this.eraseFilter));
    }
    // Plus de bloc de statistiques en haut à gauche : seulement une pastille quand le circuit a un défaut.
    const errs = this.track.validate().concat(this._joinWarnings());
    const warn = document.getElementById('ed-warn');
    if (warn) {
      warn.classList.toggle('hidden', !errs.length);
      warn.textContent = errs.length ? `⚠ ${errs.length}` : '';
      warn.title = errs.join(' ');
      warn.setAttribute('aria-label', errs.length ? `${errs.length} problème${errs.length > 1 ? 's' : ''} : ${errs.join(' ')}` : '');
      warn.onclick = () => { this.app.ui.flash(errs.join(' '), 4); this._markIssues(this._tileIssues()); };   // et fait clignoter les pièces en cause
    }
    const root = document.getElementById('editor');
    const top = document.querySelector('#editor .ed-top'), pal = document.getElementById('ed-palette');
    if (top) root.style.setProperty('--ed-top-h', top.offsetHeight + 'px');
    if (pal) root.style.setProperty('--ed-pal-h', pal.offsetHeight + 'px');
    this._refreshParam();
    this._refreshDeco();
  }

  // Problèmes repérables sans rouler (0.9.5) : extrémités libres, sauts risqués, pièces inaccessibles (checkTrack), puis raccords d'orientation
  // de 0.9.3 (un mur contre le sol : il manque une transition). Calculés une fois par état du circuit ; { tile, level, msg }.
  _tileIssues() {
    const v = this.track.version;
    if (this._joinKey !== v) {
      this._joinKey = v;
      this._joinList = checkTrack(this.track).filter((i) => i.tile)
        .concat(orientationIssues(this.track).map((i) => ({ tile: i.tile, level: 'warn', msg: i.msg })));
    }
    return this._joinList;
  }

  _joinWarnings() { return this._tileIssues().map((i) => i.msg); }

  // ---- Menu hamburger (Nouveau, Importer, Partager, Enregistrer, Retour) ---------------------------------------------
  get menuOpen() { const m = document.getElementById('ed-menu'); return !!m && !m.classList.contains('hidden'); }

  toggleMenu(open = !this.menuOpen) {
    const m = document.getElementById('ed-menu'), b = document.getElementById('ed-menu-btn');
    if (!m || !b) return;
    m.classList.toggle('hidden', !open);
    b.setAttribute('aria-expanded', String(open));
    if (open) { const first = m.querySelector('button'); if (first) first.focus({ preventScroll: true }); } else if (document.activeElement && m.contains(document.activeElement)) b.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- Historique
  _snapshot() {
    return JSON.stringify({
      t: this.track.tiles.map((t) => [t.t, t.x, t.z, t.l, t.r, t.s || '', t.p || 0, t.v, t.nb, t.tn, t.mv || 0, t.cp || 0, t.th || 0, t.ms || 0, t.ma || 0, t.col || 0, t.s2 || '', t.p2 || 0, t.tb || 0, t.o || 0]),
      d: this.track.decos.map((o) => [o.k, o.x, o.y, o.z, o.ry, o.s, o.c, o.u, o.ph || 0, o.cc || '']),
      lp: this.track.laps || 1,
      pr: { name: this.track.name, desc: this.track.desc, offroad: this.track.offroad, v0: this.track.v0, g0: this.track.g0, veh0: this.track.veh0, inversionGraviteDepart: this.track.inversionGraviteDepart, decor: this.track.decor },
    });
  }

  _restore(snap) {
    const data = JSON.parse(snap);
    const { vt, vh } = this.track;
    this.track.clear();
    this.track.vt = vt; this.track.vh = vh;
    for (const [t, x, z, l, r, s, p, v, nb, tn, mv, cp, th, ms, ma, col, s2, p2, tb, o] of data.t) this.track.add({ t, x, z, l, r, s, p, v, nb, tn, mv, cp, th, ms, ma, col: col || null, s2, p2, tb, o });
    for (const [k, x, y, z, ry, sc, c, u, ph, cc] of data.d) this.track.addDeco({ k, x, y, z, ry, s: sc, c, u, ph, cc });
    this.track.laps = data.lp || 1;
    if (data.pr) {
      this.track.setParams(data.pr);
      if (data.pr.name) this.track.name = data.pr.name;
      if (data.pr.decor && data.pr.decor !== this.track.decor) { this.track.decor = data.pr.decor; this._applyDecor(); this.gridKey = ''; }
    }
    this._changed(false);
    this.needsRebuild = true;
    this.inspector.restore(this.histSel[this.hIndex]);   // l'objet inspecté revient avec l'état annulé / rétabli
  }

  _commit() {
    const snap = this._snapshot();
    if (snap === this.history[this.hIndex]) { this.histSel[this.hIndex] = this.inspector.describe(); return; }
    this.history.length = this.hIndex + 1;
    this.histSel.length = this.hIndex + 1;
    this.history.push(snap);
    this.histSel.push(this.inspector.describe());
    if (this.history.length > 200) { this.history.shift(); this.histSel.shift(); }
    this.hIndex = this.history.length - 1;
  }

  undo() {
    if (this.hIndex <= 0) return;
    this.hIndex--;
    this._restore(this.history[this.hIndex]);
    this.app.audio.click();
  }

  redo() {
    if (this.hIndex >= this.history.length - 1) return;
    this.hIndex++;
    this._restore(this.history[this.hIndex]);
    this.app.audio.click();
  }

  _changed(rebuild = true) {
    if (rebuild) this.needsRebuild = true;
    this.previewKey = '';
    this.inspector.refresh();
    this._refreshUI();
    clearTimeout(this._draftT);
    this._draftT = setTimeout(() => setEditorDraft(this.exportState()), 400);
  }

  save() {
    const entry = saveMyTrack({ id: this.entryId || newId(), name: this.track.name, code: this.track.encode() });
    this.entryId = entry.id;
    setEditorDraft(this.exportState());
    this.app.ui.flash('Circuit enregistré dans « Mes circuits »');
  }

  newTrack() {
    this.track.clear();
    this.track.name = 'Mon circuit';
    this.track.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 });
    this.entryId = null;
    this.level = 0;
    this.target.set(CELL / 2, this.levelY(), CELL / 2);
    this._commit();
    this._changed();
  }

  loadCode(code) {
    const t = Track.decode(code);
    this.track.clear();
    for (const tile of t.tiles) this.track.add(tile);
    for (const d of t.decos) this.track.addDeco(d);
    this.track.name = t.name;
    this.track.decor = t.decor;
    this.track.laps = t.laps;
    this.track.setParams(t);
    this.track.vt = t.vt; this.track.vh = t.vh;
    this._applyDecor();
    this.entryId = null;
    this.recenter();
    this._commit();
    this._changed();
  }

  recenter() {
    const c = this._fitCamera();
    this.target.set(c.tx, this.levelY(), c.tz);
    this.dist = c.dist;
  }

  toggleTopView() {
    if (this.pitch < 1.4) { this._prevPitch = this.pitch; this.pitch = 1.5; }
    else this.pitch = this._prevPitch || 0.95;
  }

  // ---------------------------------------------------------------- Entrées
  _bind() {
    const el = this.app.renderer.domElement;
    this._h = {
      down: (e) => this._onDown(e),
      move: (e) => this._onMove(e),
      up: (e) => this._onUp(e),
      wheel: (e) => {
        e.preventDefault();
        if (this.camLocked) return;
        if (e.shiftKey) {
          const d = (e.deltaY || e.deltaX) < 0 ? 1 : -1;
          const now = performance.now();
          if (now - (this._wheelT || 0) > 90) { this.setLevel(this.level + d); this._wheelT = now; }
          return;
        }
        if (e.altKey && this.tool.startsWith('deco:')) {
          this.deco.scale = Math.max(0.3, Math.min(6, this.deco.scale * (e.deltaY < 0 ? 1.08 : 0.926)));
          this.previewKey = ''; this._refreshDeco();
          return;
        }
        this.dist = Math.max(25, Math.min(700, this.dist * Math.pow(1.0015, e.deltaY)));
      },
      ctx: (e) => e.preventDefault(),
      keyup: (e) => { if (e.key === 'Shift') this._endShiftY(); },
      blur: () => this._endShiftY(),
      key: (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
        if (e.key === '?') { e.preventDefault(); this.app.editorHelp(); return; }
        if (!(e.ctrlKey || e.metaKey)) return;
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
        else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); }
        else if (k === 's') { e.preventDefault(); this.save(); }
        else if (k === 'c') { e.preventDefault(); this.copySel(); }
        else if (k === 'x') { e.preventDefault(); this.cutSel(); }
        else if (k === 'v') { e.preventDefault(); this.startPaste(); }
        else if (k === 'a') { e.preventDefault(); this.selectAll(); }
        else if (k === 'd') { e.preventDefault(); this.inspector.duplicate(); }      // Ctrl+D : duplique la pièce ou la décoration inspectée
      },
    };
    this._h.outside = (e) => { if (this.menuOpen && !e.target.closest('.ed-menu-wrap')) this.toggleMenu(false); };
    this._h.menuKey = (e) => {
      if (!this.menuOpen || !e.target.closest || !e.target.closest('#ed-menu')) return;
      const items = [...document.querySelectorAll('#ed-menu button')], i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.toggleMenu(false); }
    };
    document.addEventListener('pointerdown', this._h.outside, true);
    document.addEventListener('keydown', this._h.menuKey);
    el.addEventListener('pointerdown', this._h.down);
    window.addEventListener('pointermove', this._h.move);
    window.addEventListener('pointerup', this._h.up);
    window.addEventListener('pointercancel', this._h.up);
    el.addEventListener('wheel', this._h.wheel, { passive: false });
    el.addEventListener('contextmenu', this._h.ctx);
    window.addEventListener('keydown', this._h.key);
    window.addEventListener('keyup', this._h.keyup);
    window.addEventListener('blur', this._h.blur);
  }

  _setNdc(e) {
    const r = this.app.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  _onDown(e) {
    this.app.audio.unlock();
    this._setNdc(e);
    // Gizmo survolé ou saisi : le clic est à lui (ni sélection, ni caméra, ni pose de pièce).
    if (this.camLocked || this.inspector.gizmoBusy) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, type: e.pointerType, moved: false });
    if (this.pointers.size === 2) this._pinch = null;
    if (e.pointerType === 'mouse' && e.button === 1) e.preventDefault();
    if (e.pointerType === 'mouse' && e.button === 0) {
      this._updateHover();
      if (this.tool === 'select') this._selectDown();
      else if (e.altKey) this._pick();
      else if (this.tool === 'inspect') this._inspectPick();
      else { this.painting = true; this._act(); }
    }
  }

  _onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (e.target === this.app.renderer.domElement || p) this._setNdc(e);
    // Phase 3 : Maj + mouvement de la souris = déplacement vertical (axe Y seul) de la pièce ou de la décoration ciblée.
    const dyPx = this._ptrY == null ? 0 : e.clientY - this._ptrY;
    this._ptrY = e.clientY;
    if (e.shiftKey && (p || e.target === this.app.renderer.domElement) && this._shiftY(dyPx)) return;
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 6) p.moved = true;

    if (p.type !== 'mouse') {
      if (this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        if (this._pinch) {
          this.dist = Math.max(25, Math.min(700, this.dist * (this._pinch.d / d)));
          this.yaw -= ang - this._pinch.ang;
          this._pan(dx * 0.5, dy * 0.5);
        }
        this._pinch = { d, ang };
      } else if (p.moved) {
        if (this.tool === 'select' && !this.pasting) {
          if (!this.selDrag) { this._updateHover(); this._selectDown(); }
          this._updateHover(); this._selectMove();
        } else this._pan(dx, dy);
      }
      return;
    }
    if (p.button === 2 && p.moved) {
      this.yaw -= dx * 0.006;
      this.pitch = Math.max(0.2, Math.min(1.5, this.pitch + dy * 0.005));
    } else if (p.button === 1 && p.moved) {
      this._pan(dx, dy);
    } else if (p.button === 0 && this.selDrag) {
      this._updateHover();
      this._selectMove();
    } else if (p.button === 0 && this.painting && !this.tool.startsWith('deco:')) {
      this._updateHover();
      this._act(true);
    }
  }

  _onUp(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this._pinch = null;
    if (p.type === 'mouse') {
      if (p.button === 2 && !p.moved) { this._updateHover(); this._erase(); }
      if (p.button === 1 && !p.moved) { this._updateHover(); this._pick(); }
      if (p.button === 0) {
        if (this.selDrag) this._selectUp();
        this.painting = false;
        this._lastPaint = null;
        this._commit();
      }
    } else if (this.selDrag) {
      this._selectUp();
    } else if (!p.moved && this.pointers.size === 0) {
      this._setNdc(e);
      this._updateHover();
      if (this.tool === 'select') this._selectDown(true);
      else if (this.tool === 'inspect') this._inspectPick();
      else this._act();
      this._commit();
    }
  }

  // Mètres par pixel d'écran à la distance de l'objet (projection en perspective), corrigés de l'inclinaison de la caméra.
  _metersPerPixel(pos) {
    const cam = this.app.camera, r = this.app.renderer.domElement.getBoundingClientRect();
    const d = Math.max(1, cam.position.distanceTo(pos));
    return (2 * Math.tan((cam.fov * Math.PI) / 360) * d) / Math.max(1, r.height) / Math.max(0.3, Math.cos(this.pitch));
  }

  // Maj + souris. Renvoie true si le mouvement a été consommé (sinon la caméra / les outils gardent leurs gestes habituels).
  //  - outil Inspecter : l'objet inspecté (ou, à défaut, celui sous le curseur) monte / descend. Pièce : par demi-niveaux ; décoration : libre.
  //  - outil Décoration : règle le décalage vertical de la prochaine décoration posée.
  _shiftY(dyPx) {
    if (this.camLocked || this.inspector.dragging || this.menuOpen || !dyPx) return false;      // le survol du gizmo ne gêne pas : seul un geste de gizmo en cours est prioritaire
    if (this.tool === 'inspect') {
      const insp = this.inspector;
      if (!insp.sel) {
        const hit = this._pickTarget(LAYER_ALL);
        if (!hit) return false;
        insp.select(hit.kind, hit.obj);
      }
      const { kind, obj } = insp.sel;
      const pos = kind === 'tile' ? new THREE.Vector3((obj.x + PIECES[obj.t].size / 2) * CELL, this.levelY(obj.l), (obj.z + PIECES[obj.t].size / 2) * CELL) : new THREE.Vector3(obj.x, obj.y, obj.z);
      const dy = -dyPx * this._metersPerPixel(pos);
      if (kind === 'deco') {
        obj.y += dy;
        this.track.version++;
        this._changed();
      } else {
        this._yAcc = (this._yAcc || 0) + dy / LEVEL_H;
        const step = Math.trunc(this._yAcc * 2) / 2;                      // les pièces montent par demi-niveaux
        if (step) {
          const l = Math.max(0, Math.min(MAX_LEVEL, obj.l + step));
          this._yAcc -= step;
          if (l !== obj.l) {
            if (this._applyTilePatch(obj, { l })) { this.level = l; this._changed(); }
            else { this._yAcc = 0; if (!this._yWarn) { this._yWarn = true; this.app.ui.flash('Place occupée à cette hauteur'); } }
          }
        }
      }
      this._shiftYDirty = true;
      return true;
    }
    if (this.tool.startsWith('deco:')) {
      this.deco.dy = Math.max(-60, Math.min(300, (this.deco.dy || 0) - dyPx * this._metersPerPixel(this.target) * 0.5));
      this.previewKey = '';
      this._refreshDeco();
      return true;
    }
    return false;
  }

  // Maj relâchée : un seul pas d'historique pour tout le geste.
  _endShiftY() {
    this._yAcc = 0; this._yWarn = false; this._ptrY = null;
    if (this._shiftYDirty) { this._shiftYDirty = false; this._commit(); }
  }

  _pan(dx, dy) {
    const k = this.dist * 0.0018;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    this.target.x += -dx * k * rx + dy * k * fx;
    this.target.z += -dx * k * rz + dy * k * fz;
  }

  // ---------------------------------------------------------------- Actions
  _hoverTile() {
    if (!this.hover) return null;
    const tiles = this.track.tilesAt(this.hover.cx, this.hover.cz);
    if (!tiles.length) return null;
    for (const t of tiles) {
      const [lo, hi] = Track.range(t);
      if (this.level >= lo && this.level <= hi) return t;
    }
    return tiles.reduce((a, b) => (b.l > a.l ? b : a));
  }

  // Phase 3 : la pièce EXACTE sur laquelle pointe le curseur (rayon Three.js), quelle que soit la hauteur de pose choisie. Sert aux
  // revêtements, aux options, au pot de peinture et à la pipette. Sans rayon exploitable (ou rien de touché), on retombe sur la case
  // visée au niveau courant, comme avant.
  _targetTile() {
    if (this.ndc && this.raycaster && Math.abs(this.ndc.x) <= 1 && Math.abs(this.ndc.y) <= 1 && this.app && this.app.camera) {
      this.raycaster.setFromCamera(this.ndc, this.app.camera);
      const hit = pickTileExact(this.track, this.raycaster.ray);
      if (hit) return hit.obj;
    }
    return this._hoverTile();
  }

  _candidate() {
    if (!this.hover || !PIECES[this.tool]) return null;
    const p = PIECES[this.tool];
    const sz = p.size;
    const ax = sz % 2 === 0 ? Math.round(this.hover.x / CELL - sz / 2) : this.hover.cx - (sz - 1) / 2;
    const az = sz % 2 === 0 ? Math.round(this.hover.z / CELL - sz / 2) : this.hover.cz - (sz - 1) / 2;
    const tile = { t: this.tool, x: ax, z: az, l: this.level, r: this.rot, s: '' };
    for (const k of OPT_KEYS) if (this.opts[k]) tile[k] = this.opts[k];      // pièce + options choisies ensemble
    return tile;
  }

  // Options armées que la pièce `norm` (déjà normalisée) n'a pas pu garder (ex. tunnel sur un looping).
  _droppedOptions(cand, norm) {
    return OPT_KEYS.filter((k) => cand[k] && norm[k] !== cand[k]);
  }

  _act(painting = false) {
    const t = this.tool;
    if (t === 'erase') { this._erase(painting); return; }
    if (isFill(t)) { if (!painting) this._floodFill(); return; }   // un clic = un remplissage (pas de glisser)
    if (t.startsWith('surf:')) { this._paintSurface(painting); return; }
    if (t.startsWith('mod:')) { this._toggleMod(painting); return; }
    if (t.startsWith('deco:')) { this._placeDeco(); return; }
    const tile = this._candidate();
    if (!tile) return;
    const key = `${tile.x},${tile.z},${tile.l}`;
    if (painting && key === this._lastPaint) return;
    this._lastPaint = key;
    const norm = Track.normalize(tile);
    if (!Track.inBounds(norm)) { if (!painting) { this.app.ui.flash(outOfBounds(norm)); this.app.audio.error(); } return; }
    const conflicts = this.track.conflicts(tile);
    if (conflicts.length === 1) {
      const c = conflicts[0];
      if (c.t === tile.t && c.x === tile.x && c.z === tile.z && c.l === tile.l && c.r === tile.r && OPT_KEYS.every((k) => (c[k] | 0) === (norm[k] | 0))) return;
    }
    for (const c of conflicts) this.track.remove(c);
    if (tile.t === 'start') for (const s of this.track.tiles.filter((x) => x.t === 'start')) this.track.remove(s);
    const dropped = this._droppedOptions(tile, norm);
    if (dropped.length && !painting) this.app.ui.flash(`Option ignorée : ${dropped.map((k) => OPT_NAMES[k]).join(', ')}`, 2.4);
    const added = this.track.add(tile);
    this.app.audio.place();
    this._prepareAutoLevel(added);
    this._changed();
    if (!painting) this._commit();
  }

  // Après une pente, le niveau suit tout seul quand on vise la case suivante.
  _prepareAutoLevel(tile) {
    const p = PIECES[tile.t];
    if (!p.rise) { this.autoLevel = null; return; }
    if (p.kind === 'arc') {
      // Courbe montante (1 case) : l'entrée est derrière la pièce, la sortie sur son côté (droite, ou gauche pour la version ↰).
      if (p.size !== 1) { this.autoLevel = null; return; }
      const [bx, bz] = DIRS[tile.r], [ex, ez] = DIRS[(tile.r + (p.mirror < 0 ? 3 : 1)) & 3];
      this.autoLevel = new Map([[`${tile.x + ex},${tile.z + ez}`, tile.l + p.rise], [`${tile.x - bx},${tile.z - bz}`, tile.l]]);
      return;
    }
    const [dx, dz] = DIRS[tile.r];
    this.autoLevel = new Map([
      [`${tile.x + dx},${tile.z + dz}`, tile.l + p.rise],
      [`${tile.x - dx},${tile.z - dz}`, tile.l],
    ]);
  }

  _paintSurface(painting) {
    const t = this._targetTile();
    if (!t) return;
    const s = this.tool.slice(5);
    if (!surfaceAllowed(t.t, s, !!t.v, t.o | 0)) {
      if (!painting) { this.app.ui.flash(`${SURFACES[s].label} : impossible ici`); this.app.audio.error(); }
      return;
    }
    if (this.track.setSurface(t, s, SURFACES[s].def != null ? this._surfParamValue(s) : 0)) {
      this.app.audio.place();
      this._changed();
      if (!painting) this._commit();
    }
  }

  // Raison pour laquelle la pièce visée ne peut pas servir de cible au pot de peinture ('' si elle convient).
  _fillRefusal(target) {
    if (isStartFinish(target.t)) return 'Le départ et l’arrivée ne peuvent pas être remplis.';
    const base = fillBase(this.tool);
    if (!base.startsWith('surf:') && isStartFinish(base)) return 'Le départ et l’arrivée ne se posent pas au pot de peinture.';
    return '';
  }

  // Pot de peinture : remplace, dans toute la zone connectée à la pièce visée, le revêtement
  // ('fill-surf:') ou le type de pièce ('fill-piece:'). Zone = pièces voisines (côtés partagés,
  // écart de niveau <= FILL_MAX_DL) qui satisfont le même prédicat que la cible.
  _floodFill() {
    // Case VIDE sous le curseur (aucune pièce au niveau de pose) : on remplit la zone vide fermée par des pièces (voir enclosedRegion).
    if (this._emptyFillTarget()) { this._fillEmpty(); return; }
    const start = this._targetTile();
    if (!start) return;
    const why = this._fillRefusal(start);
    if (why) { this.app.ui.flash(why); this.app.audio.error(); return; }

    const surfMode = this.tool.startsWith('fill-surf:');
    const value = fillBase(this.tool).slice(surfMode ? 5 : 0);       // revêtement ou type voulu
    const matches = surfMode ? (t) => (t.s || '') === (start.s || '') : (t) => t.t === start.t;
    if (surfMode ? (start.s || '') === value : start.t === value) return;   // rien à remplacer

    // 1. Parcours en largeur ITÉRATIF (file + index de lecture, aucune récursion) : on ne fait que collecter.
    const visited = new Set([start]);
    const queue = [start];
    let head = 0;
    while (head < queue.length) {
      const t = queue[head++];
      for (const [cx, cz] of Track.cellsOf(t)) {                      // une pièce 2×2 occupe plusieurs cases
        for (const [dx, dz] of FILL_DIRS) {
          for (const n of this.track.tilesAt(cx + dx, cz + dz)) {
            if (visited.has(n) || !matches(n) || Math.abs(n.l - t.l) > FILL_MAX_DL) continue;
            visited.add(n);
            queue.push(n);
          }
        }
      }
    }

    // 2. Application, après le parcours : l'index du circuit ne change pas pendant la lecture.
    let done = 0, skipped = 0;
    const param = surfMode && SURFACES[value] && SURFACES[value].def != null ? this._surfParamValue(value) : 0;
    for (const t of queue) {
      if (isStartFinish(t.t)) { skipped++; continue; }                // départ / arrivée : jamais modifiés
      if (surfMode ? this.track.setSurface(t, value, param) : this._retypeTile(t, value)) done++;
      else skipped++;
    }

    if (done) {
      this.app.audio.place();
      this._changed();
      this._commit();                                                 // UN SEUL commit : un seul Ctrl+Z annule tout
    } else this.app.audio.error();
    this.app.ui.flash(`${done} pièce${done > 1 ? 's' : ''} modifiée${done > 1 ? 's' : ''}` + (skipped ? ` · ${skipped} ignorée${skipped > 1 ? 's' : ''}` : ''));
  }

  // Niveaux [lo, hi] occupés par la pièce que le pot de peinture poserait au niveau courant.
  _fillRange() {
    const base = fillBase(this.tool);
    if (!PIECES[base]) return [this.level, this.level];
    const o = this.opts || {};
    return Track.range({ t: base, x: 0, z: 0, l: this.level, r: 0, v: o.v ? 1 : 0, cp: o.cp | 0, tb: o.tb | 0, mv: o.mv | 0 });
  }

  // Vrai si le curseur vise une case VIDE (sans pièce aux niveaux de pose) et pas une pièce touchée par le rayon : on remplit alors la zone vide.
  _emptyFillTarget() {
    if (!this.hover) return false;
    if (this.ndc && this.raycaster && Math.abs(this.ndc.x) <= 1 && Math.abs(this.ndc.y) <= 1 && this.app.camera) {
      this.raycaster.setFromCamera(this.ndc, this.app.camera);
      const hit = pickTileExact(this.track, this.raycaster.ray);
      if (hit && Track.cellsOf(hit.obj).some(([x, z]) => x === this.hover.cx && z === this.hover.cz)) return false;
    }
    const [lo, hi] = this._fillRange();
    return this.track.tilesAt(this.hover.cx, this.hover.cz).every((t) => { if (PIECES[t.t].kind === 'ring') return true; const [a, b] = Track.range(t); return !(a <= hi && lo <= b); });
  }

  // Remplit la zone vide fermée sous le curseur avec la pièce choisie (rotation, niveau et options du moment).
  _fillEmpty() {
    const base = fillBase(this.tool), ui = this.app.ui;
    const fail = (m) => { ui.flash(m); this.app.audio.error(); };
    if (!PIECES[base]) return fail('Choisis une pièce pour remplir une zone vide.');
    if (isStartFinish(base) || PIECES[base].kind === 'ring') return fail('Cette pièce ne se pose pas au pot de peinture.');
    const [lo, hi] = this._fillRange();
    const reg = enclosedRegion(this.track, this.hover.cx, this.hover.cz, lo, hi);
    if (!reg.ok) return fail(reg.why === 'open' ? 'Zone non fermée : entoure-la de pièces.' : reg.why === 'big' ? 'Zone trop grande (600 cases au plus).' : 'Rien à remplir ici.');
    const { spots, left } = tileRegion(reg.cells, PIECES[base].size);
    let done = 0, skipped = left;
    for (const [x, z] of spots) {
      const tile = { t: base, x, z, l: this.level, r: this.rot, s: '' };
      for (const k of OPT_KEYS) if (this.opts && this.opts[k]) tile[k] = this.opts[k];
      const norm = Track.normalize(tile);
      if (!Track.inBounds(norm) || this.track.conflicts(norm).length) { skipped++; continue; }
      this.track.add(tile);
      done++;
    }
    if (!done) return fail('Aucune pièce posée (pas la place).');
    this.app.audio.place();
    this._changed();
    this._commit();                                                   // un seul pas d'annulation
    ui.flash(`${done} pièce${done > 1 ? 's' : ''} posée${done > 1 ? 's' : ''}` + (skipped ? ` · ${skipped} case${skipped > 1 ? 's' : ''} vide${skipped > 1 ? 's' : ''}` : ''));
  }

  // Change le type d'une pièce sur place (même case, niveau et rotation) si l'empreinte est identique.
  _retypeTile(tile, type) {
    if (!PIECES[type] || PIECES[type].size !== PIECES[tile.t].size) return false;
    const cand = Track.normalize({ ...tile, t: type });               // retire les options devenues impossibles
    if (!Track.inBounds(cand)) return false;
    this.track.remove(tile);
    if (this.track.conflicts(cand).length) { this.track._insert(tile); return false; }
    Object.assign(tile, cand);                                        // même objet : la zone collectée reste valide
    this.track._insert(tile);
    return true;
  }

  // Change une caractéristique de famille : la pièce reste « en place » même si son empreinte change (looping 1 → 3 boucles).
  _retypeFamily(tile, type) {
    const cand = retypePlacement(this.track, tile, type);
    if (!cand) return false;
    this.track.remove(tile);
    Object.assign(tile, cand);                                        // même objet : la sélection de l'Inspecteur reste valide
    this.track._insert(tile);
    return true;
  }

  // Ancienne pièce « Checkpoint » → route normale + option checkpoint (même position, mêmes niveaux réservés).
  _legacyToOption(tile) {
    const conv = LEGACY_CP[tile.t];
    if (!conv) return false;
    const cand = Track.normalize({ ...tile, t: conv[0], cp: conv[1] });
    if (cand.cp !== conv[1] || !Track.inBounds(cand)) return false;
    this.track.remove(tile);
    if (this.track.conflicts(cand).length) { this.track._insert(tile); return false; }
    Object.assign(tile, cand);
    this.track._insert(tile);
    return true;
  }

  _toggleMod(painting) {
    const t = this._targetTile();
    if (!t) return;
    const key = `${t.x},${t.z},${t.l}`;
    if (painting && key === this._lastPaint) return;
    this._lastPaint = key;
    const mod = MODS.find((m) => m.id === this.tool), flag = mod.flag;
    const val = mod.val == null ? 1 : mod.val;
    // Orientation : le dernier choix l'emporte (plafond, tunnel, mouvement, checkpoint sont retirés) ; seul le type de pièce compte.
    if (!flagAllowed(t.t, flag, flag === 'o' ? null : t, val) && !(flag === 'o' && val === 0)) {
      this.app.ui.flash(`${pieceLabel(this.tool)} : impossible sur « ${PIECES[t.t].label} »${flag === 'cp' && (t.mv || t.tn) ? ' (retire d’abord ' + (t.mv ? 'le mouvement' : 'le tunnel') + ')' : flag === 'mv' && t.cp ? ' (retire d’abord le checkpoint)' : ''}`);
      this.app.audio.error();
      return;
    }
    if (this.track.toggleFlag(t, flag, val)) {
      this.app.audio.place();
      this._changed();
      if (!painting) this._commit();
    } else if (flag === 'tn') this.app.ui.flash('Tunnel impossible sur une route à l\'envers');
    else if (flag === 'v' || flag === 'o') { if (!painting) this.app.ui.flash(flag === 'o' ? 'Pas la place pour un mur : la route descend de 2 niveaux sous son niveau (monte d’abord, libère le dessous).' : 'Pas la place à l’envers : monte d’abord, ou libère le niveau en dessous.'); this.app.audio.error(); }
    else if (flag === 'cp') { this.app.ui.flash('Pas la place (niveaux au-dessus occupés)'); this.app.audio.error(); }
    else if (flag === 'mv') { this.app.ui.flash('Pas la place pour ce mouvement'); this.app.audio.error(); }
  }

  _snapPos(x, z) {
    const s = this.deco.snap;
    if (!s) return [x, z];
    const o = s === CELL || s === CELL / 2 ? s / 2 : 0;
    return [Math.round((x - o) / s) * s + o, Math.round((z - o) / s) * s + o];
  }

  // Point de pose libre sous le curseur : le rayon de la souris contre la route ou le sol (Phase 3 : plus de grille ni de niveau
  // imposé, les coordonnées sont flottantes). null si le rayon ne rencontre rien.
  _surfaceHit() {
    if (!this.ndc || !this.raycaster || Math.abs(this.ndc.x) > 1 || Math.abs(this.ndc.y) > 1) return null;
    this.raycaster.setFromCamera(this.ndc, this.app.camera);
    return rayToSurface(this.track, this.raycaster.ray);
  }

  _decoAt() {
    const kind = this.tool.slice(5);
    let x, y, z;
    const hit = this._surfaceHit();
    if (hit) { x = hit.x; y = hit.y; z = hit.z; }
    else if (this.hover) { x = this.hover.x; y = this.levelY(); z = this.hover.z; }
    else return null;
    [x, z] = this._snapPos(x, z);                           // « Libre » par défaut ; l'accrochage reste facultatif
    y += this.deco.dy || 0;                                   // décalage vertical réglé avec Maj + souris
    return { k: kind, x, y, z, ry: this.deco.rot, s: this.deco.scale, c: this.deco.color, u: kind === 'plaque' ? this.deco.url : '', ph: isObstacle(kind) ? this.deco.ph : 0 };
  }

  _placeDeco() {
    const d = this._decoAt();
    if (!d) return;
    if (d.k === 'plaque' && !safeUrl(d.u)) {
      this.app.ui.flash('Colle d\'abord une URL d\'image https://… valide.');
      this.app.audio.error();
      return;
    }
    if (!this.track.addDeco(d)) { this.app.ui.flash(`Maximum de ${MAX_DECOS} décorations atteint.`); return; }
    this.app.audio.place();
    this._changed();
    this._commit();
  }

  _nearestDeco(maxD = 8) {
    if (!this.hover) return null;
    let best = null, bd = Infinity;
    for (const d of this.track.decos) {
      const dd = Math.hypot(d.x - this.hover.x, d.z - this.hover.z) - 1.5 * d.s;
      if (dd < bd && dd < maxD) { bd = dd; best = d; }
    }
    return best;
  }

  // Objet visé par le rayon de la souris, limité aux calques de `mask` (voir editorPick.js).
  _pickTarget(mask) {
    if (Math.abs(this.ndc.x) > 1 || Math.abs(this.ndc.y) > 1) return null;
    this.raycaster.setFromCamera(this.ndc, this.app.camera);
    return pickObjects(this.track, this.raycaster.ray, mask);
  }

  // Calques que la gomme peut toucher : le filtre choisi avec l'outil Gomme ; avec un autre outil, clic droit = tout
  // (en pose de décorations : seulement les décorations, comme avant).
  _eraseMask() {
    if (this.tool === 'erase') return ERASE_FILTERS[this.eraseFilter].mask;
    return this.tool.startsWith('deco:') ? LAYER_DECO : LAYER_ALL;
  }

  _erase(painting = false) {
    const mask = this._eraseMask();
    let hit = this._pickTarget(mask);
    if (!hit) {
      // Repli : visée au sol (niveau courant), toujours limitée aux calques permis.
      const t = mask & 1 ? this._hoverTile() : null;
      const d = !t && mask & LAYER_DECO ? this._nearestDeco() : null;
      hit = t ? { kind: 'tile', obj: t } : d ? { kind: 'deco', obj: d } : null;
    }
    if (!hit) return;
    if (hit.kind === 'tile') this.track.remove(hit.obj); else this.track.removeDeco(hit.obj);
    this.app.audio.erase();
    this._changed();
    if (!painting) this._commit();
  }

  setEraseFilter(f) {
    if (!ERASE_FILTERS[f]) return;
    this.eraseFilter = f;
    this.previewKey = '';
    this._refreshUI();
    this.app.ui.flash(`Gomme : ${ERASE_FILTERS[f].label}`, 1.2);
  }

  cycleEraseFilter() {
    this.setEraseFilter(ERASE_FILTER_ORDER[(ERASE_FILTER_ORDER.indexOf(this.eraseFilter) + 1) % ERASE_FILTER_ORDER.length]);
  }

  // Sous-menu de la gomme : un bouton par filtre.
  _buildEraseBar() {
    const bar = document.createElement('div');
    bar.className = 'ed-erasebar hidden';
    bar.id = 'ed-erasebar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Filtre de la gomme');
    for (const f of ERASE_FILTER_ORDER) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.dataset.ef = f;
      b.textContent = ERASE_FILTERS[f].label;
      b.title = ERASE_FILTERS[f].hint + ' (X pour changer)';
      b.addEventListener('click', () => { this.app.audio.click(); this.setEraseFilter(f); });
      bar.appendChild(b);
    }
    document.getElementById('editor').appendChild(bar);
    this.eraseBar = bar;
  }

  // Mode Inspection : un clic sélectionne la pièce ou la décoration visée.
  _inspectPick() {
    const hit = this._pickTarget(LAYER_ALL);
    if (hit) { this.inspector.select(hit.kind, hit.obj); this.app.audio.click(); } else this.inspector.clear();
    this._commit();      // range la sélection dans l'historique (sans créer de pas si rien n'a changé)
  }

  // Modifie une pièce (case, niveau, rotation) en vérifiant la place ; réindexe le circuit. Faux si impossible.
  _applyTilePatch(tile, patch) {
    const cand = Track.normalize({ ...tile, ...patch });
    if (!Track.inBounds(cand)) return false;
    if (cand.x === tile.x && cand.z === tile.z && cand.l === tile.l && cand.r === tile.r) return true;
    this.track.remove(tile);
    if (this.track.conflicts(cand).length) { this.track._insert(tile); return false; }
    Object.assign(tile, cand);
    this.track._insert(tile);
    return true;
  }

  _pick() {
    if (this.tool.startsWith('deco:')) {
      const d = this._nearestDeco();
      if (d) {
        this.deco.color = d.c; this.deco.scale = d.s; this.deco.rot = d.ry; this.deco.url = d.u || '';
        this.setTool('deco:' + d.k);
        this.app.ui.flash(`Pipette : ${DECO_LABELS[d.k]}`);
        return;
      }
    }
    const t = this._targetTile();
    if (!t) return;
    this.fillMode = false;
    this.tool = t.t; this.rot = t.r; this.level = t.l;
    for (const k of OPT_KEYS) this.opts[k] = t[k] | 0;                  // la pipette reprend aussi les options de la pièce
    this.autoLevel = null;
    this.previewKey = '';
    this.setTab('pieces');
    this._refreshUI();
    this.app.ui.flash(`Pipette : ${pieceLabel(t.t)}, niveau ${t.l}`);
  }

  rotate(d = 1) {
    if (this.tool === 'inspect') { this.inspector.rotateBy(d); return; }
    if (this.tool.startsWith('deco:')) {
      this.deco.rot = (this.deco.rot + d * Math.PI / 12 + Math.PI * 2) % (Math.PI * 2);
    } else this.rot = (this.rot + d + 4) & 3;
    this.previewKey = '';
    this._refreshUI();
  }

  scaleDeco(f) {
    this.deco.scale = Math.max(0.3, Math.min(6, this.deco.scale * f));
    this.previewKey = '';
    this._refreshDeco();
  }

  setLevel(l, manual = true) {
    const nl = Math.max(0, Math.min(MAX_LEVEL, l));
    if (manual) this.autoLevel = null;
    if (nl === this.level) return;
    this.level = nl;
    if (this.focusLevel) this.needsRebuild = true;
    this.previewKey = '';
    this._refreshUI();
  }

  // Teste à partir de la pièce visée (sans médaille ni vérification).
  // Tableau de compatibilité revêtements × familles de pièces.
  showCompat() {
    const cols = [
      ['Droite, virage', 'straight'], ['Pente', 'slope'], ['Départ, CP, arrivée', 'checkpoint'], ['Bifurcation', 'fork'],
      ['Plateforme', 'platform'], ['Relevé, vrille, tube', 'bank'], ['Looping', 'loop'], ['Sur un mur', 'straight', 1], ['Anneau', 'ring'],
    ].filter(([, t]) => PIECES[t]);
    const rows = SURFACE_ORDER.filter((s) => s).map((s) => {
      const cells = cols.map(([, t, o]) => {
        const why = surfaceRule(PIECES[t], SURFACES[s], s, o || 0);
        return `<td title="${why || 'oui'}" style="text-align:center;color:${why ? '#ff6b7a' : '#5dff8a'}">${why ? '✕' : '✓'}</td>`;
      }).join('');
      return `<tr><td style="white-space:nowrap">${SURFACES[s].label}</td>${cells}</tr>`;
    }).join('');
    const body = `<p>Tous les revêtements vont partout, avec les mêmes effets. Exceptions : eau, rebond et plaque bateau demandent du plat (ni pente, ni mur) ; l'eau va sur le Départ, pas sur l'Arrivée ni une bifurcation.</p>
      <div style="overflow:auto;max-height:52vh"><table style="border-collapse:collapse;font-size:13px;width:100%">
      <tr><th></th>${cols.map(([l]) => `<th style="font-weight:600;padding:2px 4px;font-size:11px">${l}</th>`).join('')}</tr>${rows}</table></div>`;
    this.app.ui.modal({ title: 'Compatibilité des revêtements', body, actions: [{ label: 'OK', primary: true }] });
  }

  testHere() {
    const t = this._targetTile();
    if (!t || ['ring', 'area'].includes(PIECES[t.t].kind)) { this.app.ui.flash('Vise une pièce de route.'); this.app.audio.error(); return; }
    // Une route sur un mur (ou une transition qui part d'un mur) ne peut pas servir de départ : la voiture y tomberait.
    if (t.o || (PIECES[t.t].roll && PIECES[t.t].roll[0] !== 0)) { this.app.ui.flash('Teste depuis une route au sol (ou une transition qui part du sol) : on ne démarre pas sur un mur.'); this.app.audio.error(); return; }
    let pts = centerlineWorld(t, 6);
    // Sens de départ : celui qui s'éloigne de la pièce de départ du circuit.
    const st = this.track.startTile;
    if (st && st !== t) {
      const sp = centerlineWorld(st, 2)[1];
      const d = (p) => Math.hypot(p[0] - sp[0], p[2] - sp[2]);
      if (d(pts[0]) > d(pts[pts.length - 1])) pts = pts.slice().reverse();
    }
    const a = pts[0], b = pts[1];
    const yaw = Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
    const gs = (t.v && PIECES[t.t].kind !== 'ribbon' && PIECES[t.t].kind !== 'loop') || this.track.inversionGraviteDepart ? -1 : 1;
    this.app.testTrack(this.exportState(), { x: a[0] + (b[0] - a[0]) * 0.5, y: a[1], z: a[2] + (b[2] - a[2]) * 0.5, yaw, gs });
  }

  // Phase 3 : un simple essai ne demande plus d'arrivée (on roule librement) ; la vérification, elle, en exige une.
  test(verify = false) {
    const errs = this.track.validate({ test: !verify });
    if (errs.length) {
      this.app.ui.flash(errs.join(' '));
      this.app.audio.error();
      return;
    }
    this.app.testTrack(this.exportState(), null, verify);
  }

  // Vérifier : course complète depuis le départ ; à l'arrivée, publier ou revenir.
  verify() { this.test(true); }

  // ---------------------------------------------------------------- Paramètres du niveau
  openParams() {
    const T = this.track;
    const f = document.createElement('div');
    f.className = 'form ed-params';
    const veh = { car: 'Voiture', moto: 'Moto', boat: 'Bateau', glider: 'Deltaplane' };
    f.innerHTML = `
      <label>Nom<input type="text" id="pp-name" maxlength="40" placeholder="Mon circuit"></label>
      <label class="col">Description<textarea id="pp-desc" maxlength="200" rows="2" placeholder="200 caractères au plus"></textarea></label>
      <label>Décor<select id="pp-decor">${Object.entries(DECORS).map(([id, d]) => `<option value="${id}">${d.label}</option>`).join('')}</select></label>
      <label title="Circuit fermé : l'arrivée est franchie à chaque tour">Tours<select id="pp-laps">${Array.from({ length: 9 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select></label>
      <label title="Rouler sur le terrain ne renvoie plus au checkpoint (il reste lent)">Hors piste autorisé<input type="checkbox" id="pp-off"></label>
      <label>Vitesse de départ<span class="inl"><input type="range" id="pp-v0" min="0" max="300" step="10"><b id="pp-v0v"></b></span></label>
      <label>Gravité de départ<span class="inl"><input type="range" id="pp-g0" min="15" max="250" step="5"><b id="pp-g0v"></b></span></label>
      <label>Véhicule de départ<select id="pp-veh">${Object.entries(veh).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label title="La course commence en gravité inversée : la voiture est plaquée au plafond (départ posé sur une pièce à l'envers)">Inversion de gravité au départ<input type="checkbox" id="pp-ig"></label>
      <p class="meta">Départ, tours, gravité et véhicule changent la course : à revérifier.</p>`;
    const $f = (id) => f.querySelector('#' + id);
    $f('pp-name').value = T.name || '';
    $f('pp-desc').value = T.desc || '';
    $f('pp-decor').value = T.decor;
    $f('pp-laps').value = String(T.laps || 1);
    $f('pp-off').checked = !!T.offroad;
    $f('pp-v0').value = T.v0 || 0;
    $f('pp-g0').value = T.g0 || 100;
    $f('pp-veh').value = T.veh0 || 'car';
    $f('pp-ig').checked = !!T.inversionGraviteDepart;
    const show = () => {
      $f('pp-v0v').textContent = +$f('pp-v0').value ? `${$f('pp-v0').value} km/h` : 'arrêt';
      $f('pp-g0v').textContent = `${$f('pp-g0').value} % · ${(SURF_PHYS.gravity * $f('pp-g0').value / 100).toFixed(1).replace('.', ',')} m/s²`;
    };
    $f('pp-v0').oninput = show; $f('pp-g0').oninput = show; show();
    this.app.ui.modal({
      title: 'Paramètres du niveau',
      body: f,
      actions: [{ label: 'Annuler' }, { label: 'Appliquer', primary: true, onClick: () => {
        const laps = +$f('pp-laps').value;
        if (laps > 1 && (T.laps || 1) === 1) this.app.ui.flash('Plusieurs tours : arrivée juste avant le départ.', 3);
        T.laps = laps;
        const nm = $f('pp-name').value.trim().slice(0, 40);
        if (nm) T.name = nm;
        T.setParams({ desc: $f('pp-desc').value, offroad: $f('pp-off').checked, v0: +$f('pp-v0').value, g0: +$f('pp-g0').value, veh0: $f('pp-veh').value, inversionGraviteDepart: $f('pp-ig').checked });
        if ($f('pp-decor').value !== T.decor) { T.decor = $f('pp-decor').value; this._applyDecor(); this.gridKey = ''; }
        this._changed(false);
        this._commit();
        return true;
      } }],
    });
  }

  // ---------------------------------------------------------------- Boucle
  _updateHover() {
    const cam = this.app.camera;
    this.raycaster.setFromCamera(this.ndc, cam);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.levelY());
    const hit = new THREE.Vector3();
    if (Math.abs(this.ndc.x) > 1 || Math.abs(this.ndc.y) > 1 || !this.raycaster.ray.intersectPlane(plane, hit)) {
      this.hover = null;
      return;
    }
    this.hover = { x: hit.x, z: hit.z, cx: Math.floor(hit.x / CELL), cz: Math.floor(hit.z / CELL) };
    if (this.autoLevel) {
      const l = this.autoLevel.get(`${this.hover.cx},${this.hover.cz}`);
      if (l != null && l !== this.level) {
        this.setLevel(l, false);
        this._updateHover();
      }
    }
  }

  _updateGrid() {
    const cx = Math.round(this.target.x / CELL / 8) * 8, cz = Math.round(this.target.z / CELL / 8) * 8;
    const key = `${cx},${cz},${this.level},${this.showGrid},${this.track.decor}`;
    if (key === this.gridKey) return;
    this.gridKey = key;
    if (this.grid) { this.grid.geometry.dispose(); this.grid.material.dispose(); this.grid.removeFromParent(); this.grid = null; }
    if (!this.showGrid) return;
    const n = 32;
    const pts = [], cols = [];
    const y = this.levelY() + 0.05;
    const dark = ['polar', 'jungle', 'city'].includes(this.track.decor);
    const c1 = new THREE.Color(dark ? '#5b6f9c' : '#2a1c4a'), c2 = new THREE.Color('#5ff2ff');
    for (let i = -n; i <= n; i++) {
      const c = (cx + i) % 5 === 0 ? c2 : c1;
      pts.push((cx + i) * CELL, y, (cz - n) * CELL, (cx + i) * CELL, y, (cz + n) * CELL);
      cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    for (let j = -n; j <= n; j++) {
      const c = (cz + j) % 5 === 0 ? c2 : c1;
      pts.push((cx - n) * CELL, y, (cz + j) * CELL, (cx + n) * CELL, y, (cz + j) * CELL);
      cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: this.level ? 0.6 : 0.45, depthWrite: false }));
    this.app.scene.add(this.grid);
  }

  _highlightHit(hit, color) {
    if (hit.kind === 'tile') { this._highlightTile(hit.obj, color); return; }
    const d = hit.obj;
    this.highlight.visible = true;
    this.highlight.material.color.set(color);
    this.highlight.position.set(d.x, d.y + 2 * d.s, d.z);
    this.highlight.scale.set(4 * d.s, 4 * d.s, 4 * d.s);
  }

  _highlightTile(t, color) {
    const s = PIECES[t.t].size;
    const [lo, hi] = Track.range(t);
    const y0 = lo * LEVEL_H - 0.6, y1 = (hi + 1) * LEVEL_H;
    this.highlight.visible = true;
    this.highlight.material.color.set(color);
    this.highlight.position.set((t.x + s / 2) * CELL, (y0 + y1) / 2, (t.z + s / 2) * CELL);
    this.highlight.scale.set(s * CELL + 0.4, y1 - y0, s * CELL + 0.4);
  }

  // Cases surlignées par le pot de peinture sur une zone vide (null : on les cache).
  _showFillCells(cells, color) {
    if (!this.fillCells) {
      this.fillCells = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7dffb2', transparent: true, opacity: 0.4, depthWrite: false }), 700);
      this.fillCells.frustumCulled = false;
      this.fillCells.count = 0;
      this.app.scene.add(this.fillCells);
    }
    const m = this.fillCells;
    if (!cells) { m.visible = false; return; }
    m.visible = true;
    m.material.color.set(color);
    const mat = new THREE.Matrix4();
    const n = Math.min(cells.length, 700);
    for (let i = 0; i < n; i++) { mat.makeScale(CELL - 0.8, 1, CELL - 0.8).setPosition((cells[i][0] + 0.5) * CELL, this.levelY() + 0.12, (cells[i][1] + 0.5) * CELL); m.setMatrixAt(i, mat); }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  }

  _clearPreview() {
    for (const c of [...this.preview.children]) { c.traverse((o) => o.geometry && o.geometry.dispose()); this.preview.remove(c); }
  }

  _updatePreview() {
    if (this.fillCells && (!isFill(this.tool) || !this.hover)) this.fillCells.visible = false;
    if (this.tool === 'select') { this._updatePastePreview(); return; }
    const cand = this._candidate();
    this.highlight.visible = false;
    if (this.tool.startsWith('deco:')) {
      // Décoration : posée là où le rayon touche la route ou le sol, à n'importe quelle altitude (pas de case, pas de niveau).
      this.marker.visible = false;
      this.footprint.visible = false;
      const d = this._decoAt();
      if (!d) { this.preview.visible = false; return; }
      const key = `D${d.k},${d.x.toFixed(1)},${d.z.toFixed(1)},${d.y.toFixed(2)},${d.ry},${d.s},${d.c},${d.u}`;
      if (key !== this.previewKey) {
        this.previewKey = key;
        this._clearPreview();
        this.preview.add(buildDecoMesh(d, this.previewMat, this.previewGlow));
      }
      this.preview.visible = true;
      return;
    }
    if (!this.hover) {
      this.preview.visible = false;
      this.marker.visible = false;
      this.footprint.visible = false;
      return;
    }
    const y = this.levelY();
    this.marker.visible = y > 1;
    this.marker.scale.set(1, y, 1);
    this.marker.position.set((this.hover.cx + 0.5) * CELL, y / 2, (this.hover.cz + 0.5) * CELL);
    this.footprint.visible = true;
    this.footprint.position.set((this.hover.cx + 0.5) * CELL, 0.06, (this.hover.cz + 0.5) * CELL);
    this.footprint.scale.set(CELL, 1, CELL);

    if (!cand) {
      this.preview.visible = false;
      if (this.tool === 'erase' || this.tool === 'inspect') {
        // Surbrillance de l'objet que le rayon touche, dans les calques permis par le filtre.
        const erase = this.tool === 'erase';
        const hit = this._pickTarget(erase ? ERASE_FILTERS[this.eraseFilter].mask : LAYER_ALL);
        if (hit) this._highlightHit(hit, erase ? '#ff3b5c' : '#5ff2ff');
        return;
      }
      if (isFill(this.tool) && this._emptyFillTarget()) {
        // Zone vide : cases qui seraient remplies (vert) ou refus (rouge, case seule).
        const [lo, hi] = this._fillRange();
        const reg = PIECES[fillBase(this.tool)] ? enclosedRegion(this.track, this.hover.cx, this.hover.cz, lo, hi) : { ok: false };
        this._showFillCells(reg.ok ? reg.cells : [[this.hover.cx, this.hover.cz]], reg.ok ? '#7dffb2' : '#ff3b5c');
        return;
      }
      this._showFillCells(null);
      const t = this._targetTile();
      if (t) {
        if (isFill(this.tool)) {
          this._highlightTile(t, this._fillRefusal(t) ? '#ff3b5c' : '#ffb347');
        } else if (this.tool.startsWith('surf:')) {
          const s = this.tool.slice(5);
          this._highlightTile(t, surfaceAllowed(t.t, s, !!t.v, t.o | 0) ? (s ? tint(s, this._surfParamValue(s)) : '#ffffff') : '#ff3b5c');
        } else {
          const m = MODS.find((x) => x.id === this.tool);
          this._highlightTile(t, m && flagAllowed(t.t, m.flag, t, m.val || 1) ? '#8f7cff' : '#ff3b5c');
        }
      }
      return;
    }
    const key = `${cand.t},${cand.x},${cand.z},${cand.l},${cand.r},${OPT_KEYS.map((k) => cand[k] | 0).join('')},${this.track.version}`;
    if (key === this.previewKey) return;
    this.previewKey = key;
    this._clearPreview();
    const conflicts = this.track.conflicts(cand);
    if (!Track.inBounds(Track.normalize(cand))) conflicts.push(null);
    const nc = Track.normalize(cand);
    const same = conflicts.length === 1 && conflicts[0] && ['t', 'x', 'z', 'l', 'r'].every((k) => conflicts[0][k] === cand[k]) && OPT_KEYS.every((k) => (conflicts[0][k] | 0) === (nc[k] | 0));
    this.previewMat.emissive.set(conflicts.length && !same ? '#ff2244' : '#000000');
    this.previewMat.emissiveIntensity = 0.45;
    this.preview.add(buildTileMesh(Track.normalize(cand), this.previewMat, this.previewGlow));
    this.preview.visible = !same;
  }

  update(dt) {
    const input = this.app.input;
    if (this.app.ui.modalOpen) return this._render(dt);
    if (input.hit('Escape') && this.menuOpen) { this.toggleMenu(false); return this._render(dt); }
    if ((input.hit('Escape') || input.padEdges.delete('pause')) && this.inspector.active) { this.inspector.clear(); return this._render(dt); }
    if ((input.hit('Escape') || input.padEdges.delete('pause')) && (this.pasting || this.sel)) { this.clearSel(); return this._render(dt); }
    if (input.hit('Escape') || input.padEdges.delete('pause')) { this.app.leaveEditor(); return; }
    const shift = input.down('ShiftLeft', 'ShiftRight');
    const ctrl = input.down('ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight');
    const selMode = this.tool === 'select' && this.sel && !this.pasting;
    // Ctrl / Cmd enfoncé : la touche sert au raccourci (copier, coller, annuler...),
    // pas à son action seule (C = niveau −, V = vrille, X = gomme...).
    if (ctrl) { this._render(dt); return; }
    if (input.act('ed.rotate')) { if (this.pasting) this.rotateClipboard(); else this.rotate(shift ? -1 : 1); }
    if (input.act('ed.levelUp')) { if (selMode) this.shiftSel(1); else this.setLevel(this.level + 1); }
    if (input.act('ed.levelDown')) { if (selMode) this.shiftSel(-1); else this.setLevel(this.level - 1); }
    if (input.act('ed.levelView') && !ctrl) this.toggleLevelView();
    if (input.act('ed.verify')) { this.verify(); return; }
    if (input.act('ed.params')) { this.openParams(); return; }
    if (input.act('ed.nextPiece')) this.cyclePiece(shift ? -1 : 1);
    if (input.act('ed.surface')) this.cycleSurface();
    if (input.act('ed.fill')) this.toggleFill();
    if (input.act('ed.mirror')) this.mirror();
    if (input.act('ed.snap')) this.cycleSnap();
    if (input.act('ed.scaleUp')) this.scaleDeco(1.1);
    if (input.act('ed.scaleDown')) this.scaleDeco(0.9);
    if (input.act('ed.erase')) { if (selMode) this.deleteSel(); else if (this.inspector.active) this.inspector.deleteSelected(); else if (this.tool === 'erase') this.cycleEraseFilter(); else this.setTool('erase'); }
    if (input.act('ed.inspect')) this.setTool(this.tool === 'inspect' ? 'straight' : 'inspect');
    if (input.act('ed.recenter')) this.recenter();
    if (input.act('ed.topView')) this.toggleTopView();
    if (input.act('ed.grid')) { this.showGrid = !this.showGrid; this.app.ui.flash(this.showGrid ? 'Grille' : 'Sans grille', 1.2); }
    if (input.act('ed.help')) { this.app.editorHelp(); return; }
    if (input.act('ed.test')) { if (shift) this.testHere(); else this.test(); return; }
    for (const p of [...PALETTE_ORDER, ...TOOLS]) if (p.key && p.id !== 'fill' && input.hit(p.key)) this.setTool(p.id);

    // Déplacement avec les touches de conduite
    if (!input.down('ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight')) {
      const sp = this.dist * 1.1 * dt;
      let mx = 0, mz = 0;
      if (input.held('accelerate')) mz += 1;
      if (input.held('brake')) mz -= 1;
      if (input.held('left')) mx -= 1;
      if (input.held('right')) mx += 1;
      const pad = input.padEditor();
      if (pad) { mx += pad.moveX; mz -= pad.moveZ; this.yaw -= pad.orbit * dt * 2; this.dist = Math.max(25, Math.min(700, this.dist * (1 + pad.zoom * dt * 1.5))); }
      if (mx || mz) {
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
        this.target.x += (fx * mz + rx * mx) * sp;
        this.target.z += (fz * mz + rz * mx) * sp;
      }
      if (pad) this._padCursor(pad, dt);
    }
    this._render(dt);
  }

  // Curseur virtuel piloté à la manette.
  _padCursor(pad, dt) {
    if (pad.cx || pad.cy) {
      this.ndc.x = Math.max(-1, Math.min(1, (this.ndc.x > 5 ? 0 : this.ndc.x) + pad.cx * dt * 1.4));
      this.ndc.y = Math.max(-1, Math.min(1, (this.ndc.y > 5 ? 0 : this.ndc.y) - pad.cy * dt * 1.4));
      this.padCursor = true;
    }
    if (pad.place) { this._updateHover(); this._act(); this._commit(); }
    if (pad.erase) { this._updateHover(); this._erase(); }
    if (pad.pick) { this._updateHover(); this._pick(); }
  }

  _render(dt) {
    if (this.needsRebuild) {
      this.view.focus = this.focusLevel ? this.level : null;
      this.view.rebuild();
      this.needsRebuild = false;
    }
    this._updateSelBox();
    this.inspector.update();
    this.view.updateMoving(performance.now() / 1000);   // obstacles et pièces mobiles animés
    this.view.updateLights(this.app.camera.position, performance.now() / 1000);
    if (this.marksT > 0) {
      this.marksT -= dt;
      this.marks.visible = this.marksT > 0 && Math.floor(this.marksT * 3) % 2 === 0;
      if (this.marksT <= 0) for (const c of [...this.marks.children]) { c.geometry.dispose(); c.material.dispose(); this.marks.remove(c); }
    }
    const ty = this.levelY();
    this.target.y += (ty - this.target.y) * Math.min(1, dt * 8);
    const cam = this.app.camera;
    const cp = Math.cos(this.pitch);
    cam.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    cam.lookAt(this.target);
    this._updateGrid();
    if (!this.pointers.size || this.painting) this._updateHover();
    this._updatePreview();
    this._editorHorizon(cam);
    this.app.scenery.update(this.target, cam, Math.min(300, this.dist * 1.4));
  }

  // Les profils légers (Potato, Ultra Potato) rapprochent l'horizon et le brouillard pour la course (Ultra Potato : 450 m de portée, brouillard
  // à 180 m) : dans l'éditeur on dézoome jusqu'à 700 m, le circuit disparaîtrait. On ne fait qu'éloigner : jamais plus près que le profil.
  _editorHorizon(cam) {
    const need = this.dist * 2.2 + 300, fog = this.app.scene && this.app.scene.fog;
    if (cam.far < need) { cam.far = need; cam.updateProjectionMatrix(); }
    if (fog) { fog.near = Math.max(fog.near, this.dist * 0.7); fog.far = Math.max(fog.far, need); }
  }

  // ---------------------------------------------------------------- Sélection
  _selectDown(tap = false) {
    if (!this.hover) return;
    if (this.pasting) { this.doPaste(); return; }
    this.selDrag = { cx: this.hover.cx, cz: this.hover.cz };
    this.sel = normRect(this.selDrag, this.selDrag);
    if (tap) { this.selDrag = null; this._selInfo(); }
  }

  _selectMove() {
    if (!this.selDrag || !this.hover) return;
    this.sel = normRect(this.selDrag, this.hover);
  }

  _selectUp() {
    this.selDrag = null;
    this._selInfo();
  }

  _selInfo() {
    if (!this.sel) return;
    const n = tilesInRect(this.track, this.sel).length, d = decosInRect(this.track, this.sel).length;
    this.app.ui.flash(`${n} pièce${n > 1 ? 's' : ''}${d ? `, ${d} décoration${d > 1 ? 's' : ''}` : ''} sélectionnée${n + d > 1 ? 's' : ''}`, 2);
    this._refreshSelBar();
  }

  selectAll() {
    if (!this.track.tiles.length) return;
    this.setTool('select');
    const xs = this.track.tiles.flatMap((t) => Track.cellsOf(t).map((c) => c[0]));
    const zs = this.track.tiles.flatMap((t) => Track.cellsOf(t).map((c) => c[1]));
    this.sel = { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) };
    this._selInfo();
  }

  clearSel() {
    this.sel = null; this.selDrag = null; this.pasting = false; this.previewKey = '';
    this._clearPreview();
    this._refreshSelBar();
  }

  copySel(silent = false) {
    if (!this.sel) { this.app.ui.flash('Sélectionne d\'abord une zone (outil Sélection, Q).'); return false; }
    const clip = copyRect(this.track, this.sel);
    if (!clip) { this.app.ui.flash('Rien à copier dans cette zone.'); return false; }
    this.clip = clip;
    if (!silent) this.app.ui.flash(`Copié : ${clip.tiles.length} pièce(s). Ctrl+V pour coller.`);
    this._refreshSelBar();
    return true;
  }

  cutSel() {
    if (!this.copySel(true)) return;
    this.deleteSel(true);
    this.startPaste();
    this.app.ui.flash('Coupé : clique pour poser la zone ailleurs (R pour pivoter).', 3);
  }

  deleteSel(silent = false) {
    if (!this.sel) return;
    const tiles = tilesInRect(this.track, this.sel), decos = decosInRect(this.track, this.sel);
    for (const t of tiles) this.track.remove(t);
    for (const d of decos) this.track.removeDeco(d);
    if (!silent) this.app.audio.erase();
    this._changed();
    this._commit();
  }

  shiftSel(d) {
    if (!this.sel) return;
    const tiles = tilesInRect(this.track, this.sel), decos = decosInRect(this.track, this.sel);
    if (!tiles.length && !decos.length) return;
    if (!shiftLevel(this.track, tiles, decos, d)) { this.app.ui.flash('Impossible : pièce gênante ou hors niveaux.'); this.app.audio.error(); return; }
    this.app.audio.place();
    this._changed();
    this._commit();
  }

  startPaste() {
    if (!this.clip) { this.app.ui.flash('Presse-papiers vide : copie d\'abord une zone.'); return; }
    if (this.tool !== 'select') this.setTool('select');
    this.pasting = true;
    this.sel = null;
    this.previewKey = '';
    this.app.ui.flash('Clique pour coller · R pour pivoter · Échap pour annuler', 2.6);
    this._refreshSelBar();
  }

  rotateClipboard() {
    if (!this.clip) return;
    this.clip = rotateClip(this.clip);
    this.previewKey = '';
    this.app.audio.click();
  }

  doPaste() {
    if (!this.clip || !this.hover) return;
    const res = pasteClip(this.track, this.clip, this.hover.cx, this.hover.cz, this.level);
    this.app.audio.place();
    if (res.skipped) this.app.ui.flash(`${res.skipped} pièce(s) ignorée(s) (départ en double ou hors des niveaux).`);
    this._changed();
    this._commit();
  }

  _updateSelBox() {
    const r = this.sel;
    this.selBox.visible = !!r && this.tool === 'select' && !this.pasting;
    if (!this.selBox.visible) return;
    const h = this.levelY() + 6;
    this.selBox.scale.set((r.x1 - r.x0 + 1) * CELL, h + 2, (r.z1 - r.z0 + 1) * CELL);
    this.selBox.position.set((r.x0 + r.x1 + 1) / 2 * CELL, h / 2 - 1, (r.z0 + r.z1 + 1) / 2 * CELL);
  }

  _updatePastePreview() {
    this.highlight.visible = false;
    this.marker.visible = false;
    this.footprint.visible = !!this.hover && !this.pasting;
    if (this.hover && !this.pasting) {
      this.footprint.position.set((this.hover.cx + 0.5) * CELL, 0.06, (this.hover.cz + 0.5) * CELL);
      this.footprint.scale.set(CELL, 1, CELL);
    }
    if (!this.pasting || !this.clip || !this.hover) { this.preview.visible = false; return; }
    const key = `P${this.hover.cx},${this.hover.cz},${this.level},${this.clip.tiles.length},${this.clip.tiles.map((t) => t.r).join('')},${this.clip.w}`;
    this.preview.visible = true;
    if (key === this.previewKey) return;
    this.previewKey = key;
    this._clearPreview();
    const P = placedClip(this.clip, this.hover.cx, this.hover.cz, this.level);
    let bad = false;
    for (const t of P.tiles) {
      if (t.l < 0 || t.l > MAX_LEVEL) { bad = true; continue; }
      if (this.track.conflicts(Track.normalize(t)).length) bad = true;
      this.preview.add(buildTileMesh(Track.normalize(t), this.previewMat, this.previewGlow));
    }
    for (const d of P.decos.slice(0, 40)) this.preview.add(buildDecoMesh(d, this.previewMat, this.previewGlow));
    this.previewMat.emissive.set(bad ? '#ff8800' : '#000000');
    this.previewMat.emissiveIntensity = 0.35;
  }

  _refreshSelBar() {
    const bar = document.getElementById('ed-selbar');
    if (!bar) return;
    bar.classList.toggle('hidden', this.tool !== 'select');
    bar.querySelectorAll('[data-sel]').forEach((b) => {
      const a = b.dataset.sel;
      b.disabled = (['copy', 'cut', 'del', 'up', 'down'].includes(a) && !this.sel) || (a === 'paste' && !this.clip) || (a === 'rot' && !this.pasting);
    });
  }

  selAction(a) {
    switch (a) {
      case 'copy': this.copySel(); break;
      case 'cut': this.cutSel(); break;
      case 'paste': this.startPaste(); break;
      case 'rot': this.rotateClipboard(); break;
      case 'del': this.deleteSel(); break;
      case 'up': this.shiftSel(1); break;
      case 'down': this.shiftSel(-1); break;
      case 'all': this.selectAll(); break;
      case 'none': this.clearSel(); break;
      default: break;
    }
    this._refreshSelBar();
  }

  // ---------------------------------------------------------------- Vue par niveau
  toggleLevelView() {
    this.focusLevel = !this.focusLevel;
    this.needsRebuild = true;
    this.app.ui.flash(this.focusLevel ? `Niveau ${this.level} seul` : 'Tous les niveaux', 1.6);
    const b = document.querySelector('[data-ed="levelview"]');
    if (b) b.classList.toggle('on', this.focusLevel);
  }

  _markIssues(issues) {
    for (const c of [...this.marks.children]) { c.geometry.dispose(); c.material.dispose(); this.marks.remove(c); }
    for (const i of issues) {
      if (!i.tile) continue;
      const P = PIECES[i.tile.t];
      const m = new THREE.Mesh(new THREE.BoxGeometry(P.size * CELL, 3, P.size * CELL),
        new THREE.MeshBasicMaterial({ color: i.level === 'error' ? '#ff2b4a' : '#ffa21a', transparent: true, opacity: 0.35, depthWrite: false }));
      m.position.set((i.tile.x + P.size / 2) * CELL, this.levelY(i.tile.l) + 1.4, (i.tile.z + P.size / 2) * CELL);
      this.marks.add(m);
    }
    this.marksT = 9;
  }

  dispose() {
    for (const c of [...this.marks.children]) { c.geometry.dispose(); c.material.dispose(); }
    this.marks.removeFromParent();
    if (this.fillCells) { this.fillCells.geometry.dispose(); this.fillCells.material.dispose(); this.fillCells.dispose(); this.fillCells.removeFromParent(); this.fillCells = null; }
    this.selBox.geometry.dispose(); this.selBox.material.dispose(); this.selBox.removeFromParent();
    const el = this.app.renderer.domElement;
    el.removeEventListener('pointerdown', this._h.down);
    window.removeEventListener('pointermove', this._h.move);
    window.removeEventListener('pointerup', this._h.up);
    window.removeEventListener('pointercancel', this._h.up);
    el.removeEventListener('wheel', this._h.wheel);
    el.removeEventListener('contextmenu', this._h.ctx);
    window.removeEventListener('keydown', this._h.key);
    window.removeEventListener('keyup', this._h.keyup);
    window.removeEventListener('blur', this._h.blur);
    document.removeEventListener('pointerdown', this._h.outside, true);
    document.removeEventListener('keydown', this._h.menuKey);
    this.toggleMenu(false);
    clearTimeout(this._draftT);
    setEditorDraft(this.exportState());
    this.inspector.dispose();
    // Horizon et brouillard du profil de qualité reviennent avec la course.
    const q = this.app.quality && this.app.quality.profile;
    if (q) { this.app.camera.far = q.far; this.app.camera.updateProjectionMatrix(); }
    if (this.app.scenery.refreshFog) this.app.scenery.refreshFog();
    if (this.eraseBar) this.eraseBar.remove();
    this.view.dispose();
    for (const o of [this.preview, this.highlight, this.marker, this.footprint, this.grid]) {
      if (!o) continue;
      o.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
      o.removeFromParent();
    }
    this.previewMat.dispose();
    this.previewGlow.dispose();
  }
}

const DECO_ICON = {
  ...DECO_PACK_ICONS,
  sign_left: '⬅', sign_right: '➡', sign_up: '⬆', sign_stop: '⛔', sign_speed: '🅿', sign_warn: '⚠', banner: '🚩',
  cube: '⬛', sphere: '⚪', cylinder: '🛢', cone: '🔺', pyramid: '🔻', arch: '🌉',
  wall: '🧱', wallLow: '▬', roofFlat: '⬜', roofGable: '🏠', dome: '🛖',
  pine: '🌲', palm: '🌴', tree: '🌳', bush: '🌿', rock: '🪨', cactus: '🌵', crystal: '💎', mushroom: '🍄', flower: '🌸',
  plaque: '🖼', shard: '✦',
  spikes: '🔱', spikesPop: '⏫', pendulum: '🔴', hammer: '🔨', slider: '↔', sweeper: '🌀', bumper: '🟣',
  stalagmite: '🗻', cavePillar: '🏛', crystalCluster: '💠', glowMushroom: '🍄', minecart: '🛒', lantern: '🏮',
  cloud: '☁', balloon: '🎈', floatIsle: '🏝', windmill: '🌬', airship: '🛸', skyTower: '🗼',
  coral: '🪸', seaweed: '🌿', fishSchool: '🐟', shell: '🐚', anchor: '⚓', jellyfish: '🪼', treasure: '💰',
  gear: '⚙', pipe: '🔧', chimney: '🏭', crate: '📦', barrel: '🛢', crane: '🏗', warnLight: '🚨',
  satellite: '🛰', asteroid: '☄', antenna: '📡', rocket: '🚀', planetMini: '🪐',
  trafficCone: '🚧', tireStack: '⭕', flagPole: '🏁', grandstand: '🏟',
  searchlight: '🔦', spotlight: '💡', lanternPost: '🏮', lanternHang: '🏮', streetLamp: '🛣',
  plane: '✈', biplane: '🛩', helicopter: '🚁', bus: '🚌', truck: '🚚', locomotive: '🚂', sedan: '🚗', ufo: '🛸', sailboat: '⛵',
  xmasTree: '🎄', snowman: '⛄', gift: '🎁', candyCane: '🍭', xmasStar: '⭐', wreath: '🎍', sleigh: '🛷', reindeer: '🦌', gingerHouse: '🍪',
  pumpkin: '🎃', ghost: '👻', tombstone: '🪦', bats: '🦇', witchHat: '🧙', cauldron: '🫕', spookyTree: '🌳', hauntedHouse: '🏚', skull: '💀',
};
void SURFACE_STYLE;
