// Palette de l'éditeur : boutons d'outils, familles de pièces, options, paramètres, aide à la compatibilité, menu.
// Ces méthodes s'ajoutent au prototype de EditorSession (voir editor.js) : `this` est l'instance.
import { SURF_PHYS } from '../constants.js';
import { PIECES, SURFACES, SURFACE_ORDER, surfaceRule, flagAllowed, paramText, armOption } from '../pieces.js';
import { FAMILIES, FAMILY_ORDER, familyOf, resolve, validValues, withTrait, isFamilyMember, REPLACED_BY_OPTION } from '../families.js';
import { Track } from '../track.js';
import { DECORS } from '../themes.js';
import { tint, THEME_SWATCH } from '../trackGeometry.js';
import { isObstacle } from '../obstacles.js';
import { DECO_CATS, DECO_COLORS, DECO_ICONS } from '../decoData.js';
import { keyLabel } from '../input.js';
import { esc } from '../dom.js';
import { ERASE_FILTERS, ERASE_FILTER_ORDER } from '../editorPick.js';
import { SKY_CHOICES, FOG_CHOICES, MUSIC_CHOICES, WEATHER_CHOICES, CYCLE_CHOICES } from '../ambiance.js';
import { MODS, NO_OPTS, OPT_KEYS, PALETTE_ORDER, SNAPS, TOOLS, fillBase, isFill, pieceLabel } from './shared.js';
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

const modId = (flag, val) => (flag === 'v' || flag === 'nb' || flag === 'tn' ? 'mod:' + flag : `mod:${flag}${val}`);

// Icônes (vue de dessus) des pièces et revêtements.
const svg = (inner) => `<svg viewBox="0 0 48 48">${inner}</svg>`;

const ROAD = '#3c4160', RAIL = '#ff6b57', LINE = '#efe6d6';

const straightBase = (road = ROAD, rail = RAIL) => `<rect x="10" y="2" width="28" height="44" fill="${road}"/><rect x="8" y="2" width="2" height="44" fill="${rail}"/><rect x="38" y="2" width="2" height="44" fill="${rail}"/>`;

const loopIcon = (mir, col, turns = 1, w = 9) => {
  const x0 = mir > 0 ? 14 : 34;
  const r = turns > 1 ? `M${x0} 46V32a8 8 0 1 ${mir > 0 ? 1 : 0} 16 0a8 8 0 1 ${mir > 0 ? 1 : 0} -16 0` : `M${x0} 46V30a10 10 0 1 ${mir > 0 ? 1 : 0} ${mir > 0 ? 20 : -20} 0V2`;
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

const ICONS = {
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

// Mode guidé de l'éditeur (nouveau joueur) : l'essentiel seulement, pour commencer sans se perdre : les familles « Droite » (avec ses pentes) et « Virage », le départ, l'arrivée et le checkpoint.
// (La pente est un réglage de la famille « Droite », le grand virage un réglage de la famille « Virage » : ni l'une ni l'autre n'est une pièce à part.)
// Rien n'est retiré à qui connaît déjà l'éditeur (le mode ne s'active que pour un nouveau joueur, ou à la demande dans Options) ; « Tout afficher » le quitte.
export const GUIDED = { pieces: new Set(['start', 'finish']), fams: new Set(['straight', 'turn']), flags: new Set(['cp']), tabs: new Set(['pieces', 'mods']) };

export const paletteMethods = {
  guidedOn() { return this.app.settings.editorGuided === true; },

  // Cet outil est-il proposé ? (mode complet : tout ; mode guidé : les six pièces, le checkpoint et les quatre outils.)
  guidedAllows(id) {
    if (!this.guidedOn()) return true;
    if (TOOLS.some((t) => t.id === id)) return true;
    const base = fillBase(id);
    if (id.startsWith('mod:')) return GUIDED.flags.has(MODS.find((m) => m.id === id)?.flag);
    if (base.startsWith('surf:') || base.startsWith('deco:')) return false;
    if (GUIDED.pieces.has(base)) return true;
    const f = familyOf(base);
    return !!(f && GUIDED.fams.has(f.fam));
  },

  // Met la palette dans l'état voulu (guidé ou complet) : boutons, onglets, familles, groupes d'options, bandeau.
  _applyGuided() {
    const pal = document.getElementById('ed-palette');
    if (!pal) return;
    const on = this.guidedOn();
    pal.classList.toggle('guided', on);
    for (const b of pal.querySelectorAll('.pal-row:not(.surf):not(.decos) > .piece-btn[data-piece]')) b.hidden = on && !GUIDED.pieces.has(b.dataset.piece);
    for (const c of pal.querySelectorAll('.fam-card')) c.hidden = on && !GUIDED.fams.has(c.dataset.fam);
    for (const t of pal.querySelectorAll('.pal-tab[data-tab]')) t.hidden = on && !GUIDED.tabs.has(t.dataset.tab);
    for (const g of pal.querySelectorAll('.opt-group')) g.hidden = on && ![...g.querySelectorAll('[data-flag]')].some((b) => GUIDED.flags.has(b.dataset.flag));
    const banner = pal.querySelector('.pal-guided');
    if (banner) banner.hidden = !on;
    if (on && !GUIDED.tabs.has(this.tab)) this.setTab('pieces');
    if (on && !this.guidedAllows(this.tool)) this.tool = 'straight';
  },

  setGuided(on) {
    this.app.settings.editorGuided = !!on;
    this.app.saveSettings();
    this._applyGuided();
    if (this._refreshUI) this._refreshUI();
  },

  // ---------------------------------------------------------------- UI
  _toolButton(parent, id, k, label = pieceLabel(id)) {
    const b = document.createElement('button');
    b.className = 'piece-btn';
    b.dataset.piece = id;
    b.title = label + (k ? ` (${k})` : '');
    const icon = ICONS[id] || `<span class="emo">${id.startsWith('deco:') ? DECO_ICONS[id.slice(5)] || '◆' : '◆'}</span>`;
    b.innerHTML = `${k ? `<span class="k">${k}</span>` : ''}${icon}<span>${label}</span>`;
    b.addEventListener('click', () => { this.setTool(id); this.app.audio.click(); });
    parent.appendChild(b);
  },

  _buildPalette() {
    const pal = document.getElementById('ed-palette');
    pal.innerHTML = '';
    const guide = document.createElement('div');
    guide.className = 'pal-guided';
    guide.innerHTML = '<span>🎓 <b>Mode guidé</b> : l’essentiel pour commencer (droite et pentes, virages, départ, arrivée, checkpoint).</span><button class="btn small" type="button">Tout afficher</button>';
    guide.querySelector('button').addEventListener('click', () => { this.setGuided(false); this.app.audio.click(); });
    pal.appendChild(guide);
    const tabs = document.createElement('div');
    tabs.className = 'pal-tabs';
    const panels = {};
    for (const [id, label] of [['pieces', 'Pièces'], ['mods', 'Options'], ['surf', 'Revêtements'], ['decos', 'Décors'], ['prefabs', 'Prefabs']]) {   // Options à côté de Pièces
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
    this._buildPrefabPanel();

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
    this._applyGuided();
  },

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
  },

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
  },

  // Combinaison de caractéristiques actuelle d'une famille (celle de la pièce choisie, sinon la dernière choisie, sinon la 1re).
  _famTraits(fam) {
    const f = familyOf(fillBase(this.tool));
    if (f && f.fam === fam) this.famTraits[fam] = f.traits;
    if (!this.famTraits[fam]) this.famTraits[fam] = { ...FAMILIES[fam].members[Object.keys(FAMILIES[fam].members)[0]] };
    return this.famTraits[fam];
  },

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
  },

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
  },

  // Clic sur une option : avec une pièce choisie elle est « armée » (posée avec elle) ; sans pièce, elle devient l'outil
  // « appliquer à une pièce posée » (comme avant).
  _optClick(flag, val) {
    if (this.guidedOn() && !GUIDED.flags.has(flag)) { this.app.ui.flash('Option du mode complet : « Tout afficher » dans la palette.', 2.5); return; }
    if (PIECES[this.tool]) {
      this.opts = armOption(this.opts, flag, val);
      this.previewKey = '';
      this._refreshUI();
      return;
    }
    this.setTool(modId(flag, val === 0 && (flag === 'v' || flag === 'nb' || flag === 'tn') ? 1 : val));
  },

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
  },

  // Options déjà armées qui gênent le test d'une autre (mouvement ↔ checkpoint, tunnel ↔ checkpoint).
  _compatProbe(flag) {
    const o = this.opts;
    return flag === 'cp' ? { mv: o.mv, tn: o.tn, tb: o.tb, v: o.v, o: o.o } : flag === 'tb' ? { mv: o.mv, tn: o.tn, cp: o.cp, v: o.v, o: o.o } : { cp: o.cp, tb: o.tb, v: o.v, o: o.o };
  },

  _syncDecoCats() {
    document.querySelectorAll('#ed-deco-cats .chip').forEach((c) => { const on = c.dataset.cat === this.deco.cat; c.classList.toggle('on', on); c.setAttribute('aria-selected', String(on)); });
  },

  _buildDecoRow() {
    this._syncDecoCats();
    const row = document.getElementById('ed-deco-row');
    row.innerHTML = '';
    for (const k of DECO_CATS[this.deco.cat].kinds) this._toolButton(row, 'deco:' + k, '');
    this._refreshUI();
  },

  setTab(id) {
    this.tab = id;
    document.querySelectorAll('#ed-palette .pal-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
    document.querySelectorAll('#ed-palette .pal-panel').forEach((p) => { p.hidden = p.dataset.panel !== id; });
  },

  _surfParamValue(s) {
    const S = SURFACES[s];
    return this.surfParam[s] || (S && S.def) || 0;
  },

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
  },

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
  },

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
  },

  toggleMenu(open = !this.menuOpen) {
    const m = document.getElementById('ed-menu'), b = document.getElementById('ed-menu-btn');
    if (!m || !b) return;
    m.classList.toggle('hidden', !open);
    b.setAttribute('aria-expanded', String(open));
    if (open) { const first = m.querySelector('button'); if (first) first.focus({ preventScroll: true }); } else if (document.activeElement && m.contains(document.activeElement)) b.focus({ preventScroll: true });
  },

  setEraseFilter(f) {
    if (!ERASE_FILTERS[f]) return;
    this.eraseFilter = f;
    this.previewKey = '';
    this._refreshUI();
    this.app.ui.flash(`Gomme : ${ERASE_FILTERS[f].label}`, 1.2);
  },

  cycleEraseFilter() {
    this.setEraseFilter(ERASE_FILTER_ORDER[(ERASE_FILTER_ORDER.indexOf(this.eraseFilter) + 1) % ERASE_FILTER_ORDER.length]);
  },

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
  },

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
  },

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
      <p class="meta">Départ, tours, gravité et véhicule changent la course : à revérifier.</p>
      <h4 class="opt-h">Ambiance (sans effet sur la course ni les temps)</h4>
      <label>Moment de la journée<select id="pp-sky">${SKY_CHOICES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label>Brume<select id="pp-fog">${FOG_CHOICES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label>Musique<select id="pp-music">${MUSIC_CHOICES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label>Météo<select id="pp-weather">${WEATHER_CHOICES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label title="L'heure traverse aube, plein jour, coucher de soleil et nuit pendant la course">Heure qui défile<select id="pp-cycle">${CYCLE_CHOICES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label>Direction du soleil<span class="inl"><input type="checkbox" id="pp-sun-on" title="Direction choisie"><input type="range" id="pp-sun" min="0" max="345" step="15"></span></label>
      <label>Teinte du ciel<span class="inl"><input type="checkbox" id="pp-tint-on" title="Teinte choisie"><input type="color" id="pp-tint"></span></label>
      <label>Teinte du sol<span class="inl"><input type="checkbox" id="pp-gtint-on" title="Teinte choisie"><input type="color" id="pp-gtint"></span></label>
      <label>Couleur de la brume<span class="inl"><input type="checkbox" id="pp-fogc-on" title="Couleur choisie"><input type="color" id="pp-fogc"></span></label>
      <div class="opt-row"><span>Effets sur les cases du circuit</span><button class="btn small" type="button" id="pp-scripts">Déclencheurs…</button></div>`;
    const $f = (id) => f.querySelector('#' + id);
    $f('pp-name').value = T.name || '';
    $f('pp-desc').value = T.desc || '';
    $f('pp-decor').value = T.decor;
    $f('pp-laps').value = String(T.laps || 1);
    $f('pp-off').checked = !!T.offroad;
    $f('pp-v0').value = T.v0 || 0;
    $f('pp-g0').value = T.g0 || 100;
    $f('pp-veh').value = T.veh0 || 'car';
    $f('pp-ig').checked = !!T.flip0;
    $f('pp-sky').value = T.ambiance.sky; $f('pp-fog').value = T.ambiance.fog; $f('pp-music').value = T.ambiance.music;
    $f('pp-weather').value = T.ambiance.weather; $f('pp-cycle').value = T.ambiance.cycle;
    $f('pp-sun-on').checked = T.ambiance.sunAz >= 0; $f('pp-sun').value = T.ambiance.sunAz >= 0 ? T.ambiance.sunAz : 90;
    for (const [id, key, def] of [['tint', 'tint', '#ff8c5a'], ['gtint', 'gtint', '#2d7a4a'], ['fogc', 'fogC', '#cfe6f5']]) { $f(`pp-${id}-on`).checked = !!T.ambiance[key]; $f(`pp-${id}`).value = T.ambiance[key] || def; }
    const show = () => {
      $f('pp-v0v').textContent = +$f('pp-v0').value ? `${$f('pp-v0').value} km/h` : 'arrêt';
      $f('pp-g0v').textContent = `${$f('pp-g0').value} % · ${(SURF_PHYS.gravity * $f('pp-g0').value / 100).toFixed(1).replace('.', ',')} m/s²`;
    };
    $f('pp-v0').oninput = show; $f('pp-g0').oninput = show; show();
    $f('pp-scripts').onclick = () => { this.app.ui.closeModal(); setTimeout(() => this._scriptsDialog(), 0); };
    this.app.ui.modal({
      title: 'Paramètres du niveau',
      body: f,
      actions: [{ label: 'Annuler' }, { label: 'Appliquer', primary: true, onClick: () => {
        const laps = +$f('pp-laps').value;
        if (laps > 1 && (T.laps || 1) === 1) this.app.ui.flash('Plusieurs tours : arrivée juste avant le départ.', 3);
        T.laps = laps;
        const nm = $f('pp-name').value.trim().slice(0, 40);
        if (nm) T.name = nm;
        const amb = {
          sky: $f('pp-sky').value, fog: $f('pp-fog').value, music: $f('pp-music').value, weather: $f('pp-weather').value, cycle: $f('pp-cycle').value,
          sunAz: $f('pp-sun-on').checked ? +$f('pp-sun').value : -1,
          tint: $f('pp-tint-on').checked ? $f('pp-tint').value : '', gtint: $f('pp-gtint-on').checked ? $f('pp-gtint').value : '', fogC: $f('pp-fogc-on').checked ? $f('pp-fogc').value : '',
        };
        const ambChanged = JSON.stringify(amb) !== JSON.stringify(T.ambiance);
        T.setParams({ desc: $f('pp-desc').value, offroad: $f('pp-off').checked, v0: +$f('pp-v0').value, g0: +$f('pp-g0').value, veh0: $f('pp-veh').value, flip0: $f('pp-ig').checked, ambiance: amb });
        if ($f('pp-decor').value !== T.decor) { T.decor = $f('pp-decor').value; this._applyDecor(); this.gridKey = ''; }
        else if (ambChanged) this._applyDecor();
        this._changed(false);
        this._commit();
        return true;
      } }],
    });
  },
};
