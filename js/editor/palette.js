// Palette de l'éditeur : boutons d'outils, familles de pièces, options, paramètres, aide à la compatibilité, menu.
// Ces méthodes s'ajoutent au prototype de EditorSession (voir editor.js) : `this` est l'instance.
import { SURF_PHYS } from '../constants.js';
import { PIECES, PIECE_ORDER, LEGACY_TILE, SURFACES, SURFACE_ORDER, surfaceRule, flagAllowed, paramText, armOption } from '../pieces.js';
import { FAMILIES, FAMILY_ORDER, familyOf, resolve, validValues, withTrait, REPLACED_BY_OPTION, missingReason } from '../families.js';
import { Track } from '../track.js';
import { DECORS } from '../themes.js';
import { tint, THEME_SWATCH } from '../trackGeometry.js';
import { isObstacle } from '../obstacles.js';
import { DECO_CATS, DECO_COLORS, DECO_ICONS, DECO_LABELS } from '../decoData.js';
import { keyLabel } from '../input.js';
import { esc } from '../dom.js';
import { translate } from '../i18n.js';
import { ERASE_FILTERS, ERASE_FILTER_ORDER } from '../editorPick.js';
import { MIRROR_TYPES } from '../inspector.js';
import { SKY_CHOICES, FOG_CHOICES, MUSIC_CHOICES, WEATHER_CHOICES, CYCLE_CHOICES } from '../ambiance.js';
import { MODS, NO_OPTS, OPT_KEYS, SNAPS, fillBase, isFill, toFill, pieceLabel } from './shared.js';

// Onglets de la fenêtre « Circuit ».
const CIRCUIT_TABS = [['gen', 'Général'], ['course', 'Course'], ['cond', 'Conditions'], ['amb', 'Ambiance'], ['scripts', 'Déclencheurs'], ['logic', 'Logique']];

// Recherche : minuscules, sans accents, blancs réduits.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const WIND_DIRS = [[0, 'Vers le nord'], [45, 'Vers le nord-est'], [90, 'Vers l’est'], [135, 'Vers le sud-est'], [180, 'Vers le sud'], [225, 'Vers le sud-ouest'], [270, 'Vers l’ouest'], [315, 'Vers le nord-ouest']];
// Options proposées dans l'onglet « Options » : bascules (route) et choix exclusifs (checkpoint, thème, mouvement).
// Avec une pièce choisie, elles s'ajoutent à la pose (aperçu compris) ; sans pièce, elles s'appliquent à la pièce cliquée.
const OPTION_GROUPS = [
  // 0.9.3 : l'orientation est une caractéristique de toute ligne droite ou de tout virage (plus de pièces 90° à part).
  { id: 'ori', label: 'Orientation', flag: 'o', choices: [['o', 0, 'Sol'], ['o', 3, 'Incliné ◣ 45°'], ['o', 4, 'Incliné ◢ 45°'], ['o', 1, 'Mur gauche'], ['o', 2, 'Mur droit'], ['o', 5, 'Surplomb ◤ 135°'], ['o', 6, 'Surplomb ◥ 135°'], ['v', 1, 'Plafond']] },
  { id: 'route', label: 'Route', multi: true, choices: [['nb', 1, 'Sans bordures'], ['tn', 1, 'Tunnel']] },
  { id: 'cp', label: 'Checkpoint', flag: 'cp', check: true, choices: [['cp', 1, 'Checkpoint']] },
  { id: 'tb', label: 'Anneau turbo', flag: 'tb', choices: [['tb', 0, 'Aucun'], ['tb', 1, 'Turbo']] },
  { id: 'th', label: 'Thème', flag: 'th', choices: [['th', 0, 'Classique'], ['th', 1, 'Herbe'], ['th', 2, 'Sable'], ['th', 3, 'Roche']] },
  { id: 'gs', label: 'Portique', flag: 'gs', choices: [['gs', 0, 'Portique'], ['gs', 1, 'Ligne au sol'], ['gs', 2, 'Arche'], ['gs', 3, 'Pylônes']] },
  { id: 'eb', label: 'Plaque', flag: 'eb', choices: [['eb', 0, 'Sans bordure'], ['eb', 15, 'Bordures tout autour']] },
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

// 0.9.68 : chicane vue de dessus : la route entre en bas dans une colonne et ressort en haut dans une autre (mir : → 1, ← −1) ; wide : 2 colonnes.
const sbIcon = (mir, wide = false, tag = '') => {
  const a = wide ? 9 : 15, b = wide ? 39 : 33, x0 = mir > 0 ? a : b, x1 = mir > 0 ? b : a;
  const d = `M${x0} 48C${x0} 26 ${x1} 22 ${x1} 0`;
  return svg(`<path d="${d}" stroke="${RAIL}" stroke-width="${wide ? 14 : 17}" fill="none"/><path d="${d}" stroke="${ROAD}" stroke-width="${wide ? 10 : 13}" fill="none"/><path d="${d}" stroke="${LINE}" stroke-width="1.6" stroke-dasharray="4 4" fill="none"/>${tag ? `<text x="${mir > 0 ? 3 : 33}" y="44" font-size="11" fill="#ffbf3c" font-family="sans-serif" font-weight="700" stroke="#14142a" stroke-width="2.2" paint-order="stroke">${tag}</text>` : ''}`);
};

// 0.9.69 : plaques vues de dessus (carré, triangle, quart de disque) ; n : taille.
const plateIcon = (shape, n) => {
  const d = shape === 'tri' ? 'M4 4V44H44Z' : shape === 'sec' ? 'M4 44V4A40 40 0 0 1 44 44Z' : 'M4 4H44V44H4Z';
  return svg(`<path d="${d}" fill="#454a6a" stroke="#ffb84d" stroke-width="2" stroke-linejoin="round"/>${n > 1 ? `<text x="${shape === 'sq' ? 16 : 8}" y="${shape === 'sec' ? 38 : 30}" font-size="13" fill="#ffbf3c" font-family="sans-serif" font-weight="700">${n}×${n}</text>` : ''}`);
};

// 0.9.70 : largeur de route vue de dessus : bords (rouges) de x0 à x1 en bas, de x2 à x3 en haut.
const widthIcon = (a, b) => svg(`<path d="M${24 - a} 46L${24 - b} 2H${24 + b}L${24 + a} 46Z" fill="${ROAD}"/><path d="M${24 - a} 46L${24 - b} 2M${24 + a} 46L${24 + b} 2" stroke="${RAIL}" stroke-width="2.5"/><path d="M24 6v8M24 20v8M24 34v8" stroke="${LINE}" stroke-width="2"/>`);

// 0.9.71 : carrefours vus de dessus (bras présents parmi N, S, E, W).
const crossIcon = (arms) => svg(`<path d="M17 17H31V31H17Z${arms.includes('N') ? 'M17 2H31V17H17Z' : ''}${arms.includes('S') ? 'M17 31H31V46H17Z' : ''}${arms.includes('E') ? 'M31 17H46V31H31Z' : ''}${arms.includes('W') ? 'M2 17H17V31H2Z' : ''}" fill="${ROAD}"/><path d="${arms.includes('W') ? 'M17 2V17H2M2 31H17V46' : 'M17 2V46'}M31 2V17H46M46 31H31V46" stroke="${RAIL}" stroke-width="2" fill="none"/>`);

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
  giantcurve: svg(`<path d="M2 48 A46 46 0 0 1 48 2 L48 10 A38 38 0 0 0 10 48Z" fill="#3c4160"/><path d="M2 48 A46 46 0 0 1 48 2" stroke="#ff6b57" stroke-width="2.5" fill="none"/><path d="M10 48 A38 38 0 0 1 48 10" stroke="#ff6b57" stroke-width="2.5" fill="none"/><path d="M14 40 A30 30 0 0 1 40 14" stroke="#fff" stroke-width="1.5" stroke-dasharray="3 4" fill="none"/>`),
  crv05: crvIcon('½'), crv1: crvIcon(1), crv2: crvIcon(2), crv4: crvIcon(4),
  cross: crossIcon('NSEW'), tee: crossIcon('NSE'),
  // 0.9.72 : sommet de looping modulaire (vu de côté : demi-cercle qui redescend à côté) et tube en virage (vu de dessus)
  loopTop: svg(`<path d="M10 46V24a14 14 0 0 1 28 0v22" stroke="${ROAD}" stroke-width="8" fill="none"/><path d="M10 46V24a14 14 0 0 1 28 0v22" stroke="#36e9ff" stroke-width="2" fill="none"/><path d="M33 38l5 6 5-6" stroke="#36e9ff" stroke-width="2" fill="none"/>`),
  loopTopL: svg(`<path d="M10 46V24a14 14 0 0 1 28 0v22" stroke="${ROAD}" stroke-width="8" fill="none"/><path d="M10 46V24a14 14 0 0 1 28 0v22" stroke="#ff5fd2" stroke-width="2" fill="none"/><path d="M33 38l5 6 5-6" stroke="#ff5fd2" stroke-width="2" fill="none"/>`),
  tubeTurn: svg(`<path d="M6 48 A42 42 0 0 1 48 6" stroke="#7fe9ff" stroke-width="12" fill="none"/><path d="M6 48 A42 42 0 0 1 48 6" stroke="${ROAD}" stroke-width="6" fill="none"/>`),
  tubeTurnL: svg(`<path d="M42 48 A42 42 0 0 0 0 6" stroke="#7fe9ff" stroke-width="12" fill="none"/><path d="M42 48 A42 42 0 0 0 0 6" stroke="${ROAD}" stroke-width="6" fill="none"/>`),
  narrow: widthIcon(7, 7), narrowIn: widthIcon(14, 7), wideIn: widthIcon(12, 22), wide: widthIcon(22, 22),
  plate2: plateIcon('sq', 2), plate3: plateIcon('sq', 3), tri1: plateIcon('tri', 1), tri2: plateIcon('tri', 2), tri3: plateIcon('tri', 3),
  sec1: plateIcon('sec', 1), sec2: plateIcon('sec', 2), sec3: plateIcon('sec', 3),
  sbend: sbIcon(1), sbendL: sbIcon(-1), sbendLong: sbIcon(1, false, '3'), sbendLongL: sbIcon(-1, false, '3'),
  sbendFast: sbIcon(1, false, '4'), sbendFastL: sbIcon(-1, false, '4'), sbendWide: sbIcon(1, true), sbendWideL: sbIcon(-1, true),
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
  decos: svg(`<path d="M24 6l12 18H28l9 13H11l9-13h-8z" fill="#3fbf6b" stroke="#1d6b3a" stroke-width="2" stroke-linejoin="round"/><rect x="21" y="37" width="6" height="7" fill="#8a5a33"/>`),
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
export const GUIDED = { pieces: new Set(['start', 'finish']), fams: new Set(['straight', 'turn']), flags: new Set(['cp']), modes: new Set(['pieces', 'select', 'inspect', 'erase']) };

// ---- 0.12.0 : rangement de l'éditeur en quatre zones (voir index.html, #editor.ed12) ------------------------------------------------------------------
// Le RAIL d'outils dit ce que fait le clic ; le PANNEAU de l'outil dit avec quoi. Les outils sont des MODES dérivés de `tool` (le modèle ne change pas :
// une pièce, 'surf:…', 'deco:…', 'select', 'inspect', 'erase', et 'fill-…' pour le pot de peinture, devenu l'interrupteur « Remplir » de Pièces et Peinture).
export const MODES = [
  { id: 'pieces', label: 'Pistes', hint: 'Poser des pièces de route', icon: 'straight', keyAction: 'ed.nextPiece' },
  { id: 'paint', label: 'Peinture', hint: 'Revêtements : verglas, accélérateur, eau…', icon: 'surf:boost', keyAction: 'ed.surface' },
  { id: 'decos', label: 'Décors', hint: 'Décorations, solides et obstacles' , icon: 'decos' },
  { id: 'select', label: 'Sélection', hint: 'Zone : copier, déplacer, pivoter, supprimer', icon: 'select', key: 'KeyQ', k: 'Q' },
  { id: 'inspect', label: 'Inspecter', hint: 'Propriétés et gizmos 3D d’une pièce ou d’un décor', icon: 'inspect', keyAction: 'ed.inspect' },
  { id: 'erase', label: 'Gomme', hint: 'Effacer : tout, décors ou pistes', icon: 'erase', keyAction: 'ed.erase' },
];
export const modeOf = (tool) => {
  const b = fillBase(tool || '');
  if (b === 'select' || b === 'inspect' || b === 'erase') return b;
  if (b.startsWith('surf:')) return 'paint';
  if (b.startsWith('deco:')) return 'decos';
  return 'pieces';
};

// Bibliothèque des pièces : sections, chacune une suite de cartes (« fam:… » : une famille, sinon une pièce seule). Toute famille et toute pièce seule de la
// palette y est (tools/test-rangement.mjs).
export const LIBRARY = [
  { id: 'roads', label: 'Routes', items: ['fam:straight', 'fam:turn', 'fam:chicane', 'fam:courbe', 'fam:largeur', 'fam:carrefour', 'fam:fork'] },
  { id: 'acro', label: 'Acrobaties', items: ['fam:roll', 'fam:loop', 'fam:vertical', 'fam:cork', 'twist'] },
  { id: 'tubes', label: 'Tubes', items: ['fam:tube'] },
  { id: 'areas', label: 'Surfaces', items: ['fam:plaque'] },
  { id: 'race', label: 'Course', items: ['start', 'finish', 'ring'] },
];
// Décors : cinq familles au lieu de 35 catégories en ligne. Les SOLIDES (piliers, murs pleins, blocs, obstacles) comptent pour la course : à part.
export const DECO_FAMS = [
  { id: 'solid', label: 'Solides', cats: ['struct', 'wallsS', 'blocks', 'obstacles'], hint: 'Comptent pour la course : la voiture les heurte ou roule dessus (ils changent la signature du circuit).' },
  { id: 'side', label: 'Bord de piste', cats: ['race', 'signs', 'lights', 'shapes', 'build', 'image'] },
  { id: 'land', label: 'Paysages', cats: ['nature', 'jungle', 'beach', 'sea', 'sky', 'space', 'cave', 'winter'] },
  { id: 'place', label: 'Lieux et objets', cats: ['city', 'factory', 'farm', 'castle', 'vehicles', 'sport', 'fair', 'wild', 'japan', 'candy', 'party'] },
  { id: 'fest', label: 'Fêtes et saisons', cats: ['xmas', 'halloween', 'valentine', 'newyear', 'spring', 'autumn'] },
];
const decoFamOf = (cat) => (DECO_FAMS.find((f) => f.cats.includes(cat)) || DECO_FAMS[1]).id;
const RECENT_MAX = 8;

// Ligne d'aide du bas : les gestes de l'outil actif.
const HINTS = {
  pieces: 'Clic : poser · glisser : plusieurs · R : pivoter · P : prolonger · clic droit : effacer · Alt + clic : pipette',
  fill: 'Clic sur une pièce : remplit sa zone connectée · sur une case vide entourée de pièces : la remplit · un seul Ctrl + Z annule tout',
  paint: 'Clic : peindre la pièce visée · glisser : plusieurs · clic droit : effacer',
  decos: 'Clic : poser · R : pivoter · Maj + souris : hauteur · Alt + molette : taille · N : accrochage',
  select: 'Glisser : tracer une zone · glisser DANS la zone : la déplacer · Ctrl + C / X / V / D · Suppr',
  paste: 'Clic : coller ici · R : pivoter · Échap : annuler',
  inspect: 'Clic : choisir une pièce ou un décor · flèches et cercles : déplacer, pivoter · Maj + souris : hauteur · Ctrl + D : dupliquer',
  erase: 'Clic ou glisser : effacer · X : changer de filtre (tout, décors, pistes)',
};

export const paletteMethods = {
  guidedOn() { return this.app.settings.editorGuided === true; },

  // Cet outil est-il proposé ? (mode complet : tout ; mode guidé : les pièces de base, le checkpoint, la sélection, l'inspection et la gomme.)
  guidedAllows(id) {
    if (!this.guidedOn()) return true;
    if (id === 'select' || id === 'inspect' || id === 'erase' || id === 'fill') return true;
    const base = fillBase(id);
    if (id.startsWith('mod:')) return GUIDED.flags.has(MODS.find((m) => m.id === id)?.flag);
    if (base.startsWith('surf:') || base.startsWith('deco:')) return false;
    if (GUIDED.pieces.has(base)) return true;
    const f = familyOf(base);
    return !!(f && GUIDED.fams.has(f.fam));
  },

  // Met la palette dans l'état voulu (guidé ou complet) : outils du rail, cartes de la bibliothèque, groupes d'options, bandeau.
  _applyGuided() {
    const pal = document.getElementById('ed-palette');
    if (!pal) return;
    const on = this.guidedOn();
    pal.classList.toggle('guided', on);
    for (const b of document.querySelectorAll('#ed-tools .tool-btn')) b.hidden = on && !GUIDED.modes.has(b.dataset.tool);
    for (const c of pal.querySelectorAll('.lib-tile')) c.hidden = on && !(c.dataset.fam ? GUIDED.fams.has(c.dataset.fam) : GUIDED.pieces.has(c.dataset.piece));
    for (const s of pal.querySelectorAll('.lib-sec[data-sec]')) s.hidden = on && ![...s.querySelectorAll('.lib-tile')].some((t) => !t.hidden);
    for (const g of pal.querySelectorAll('.opt-group')) g.hidden = on && ![...g.querySelectorAll('[data-flag]')].some((b) => GUIDED.flags.has(b.dataset.flag));
    for (const e of pal.querySelectorAll('[data-full-only]')) e.hidden = on;
    const banner = pal.querySelector('.pal-guided');
    if (banner) banner.hidden = !on;
    if (on && !this.guidedAllows(this.tool)) this.tool = 'straight';
  },

  setGuided(on) {
    this.app.settings.editorGuided = !!on;
    this.app.saveSettings();
    this._applyGuided();
    if (this._refreshUI) this._refreshUI();
  },

  // ---------------------------------------------------------------- Outils (rail) et modes
  mode() { return modeOf(this.tool); },

  // Changer d'outil depuis le rail : on reprend la dernière pièce, le dernier revêtement ou la dernière décoration choisis (et l'interrupteur « Remplir »).
  setMode(m) {
    if (m === 'pieces') {
      const p = this._lastPiece && PIECES[this._lastPiece] ? this._lastPiece : 'straight';
      this.setTool(this._fillPieces ? toFill(p) : p);
    } else if (m === 'paint') {
      const s = this._lastSurf && SURFACES[this._lastSurf.slice(5)] ? this._lastSurf : 'surf:boost';
      this.setTool(this._fillPaint ? toFill(s) : s);
    } else if (m === 'decos') {
      this.setTool('deco:' + (this._lastDeco || DECO_CATS[this.deco.cat].kinds[0]));
    } else this.setTool(m);
  },

  // Interrupteur « Poser / Remplir une zone » (pièces) et « Une pièce / Toute la zone » (peinture) : le pot de peinture.
  setFill(on) {
    const base = fillBase(this.tool);
    if (!PIECES[base] && !base.startsWith('surf:')) return;
    if (base.startsWith('surf:')) this._fillPaint = !!on; else this._fillPieces = !!on;
    this.fillMode = !!on;
    this.setTool(on ? toFill(base) : base);
  },

  _toolButton(parent, id, k, label = pieceLabel(id)) {
    const b = document.createElement('button');
    b.className = 'piece-btn lib-tile';
    b.type = 'button';
    b.dataset.piece = id;
    b.title = label + (k ? ` (${k})` : '');
    // (une pièce sans icône à elle prend celle de sa famille : les 270 pièces de la 0.12.0 n'ont pas chacune la leur)
    const fam = familyOf(id);
    const icon = ICONS[id] || (fam && ICONS[FAMILIES[fam.fam].icon]) || `<span class="emo">${id.startsWith('deco:') ? DECO_ICONS[id.slice(5)] || '◆' : '◆'}</span>`;
    b.innerHTML = `${k ? `<span class="k">${k}</span>` : ''}${icon}<span>${esc(label)}</span>`;
    b.addEventListener('click', () => { this.setTool(id); this.app.audio.click(); this._closeDrawer(); });
    parent.appendChild(b);
    return b;
  },

  _buildTools() {
    const box = document.getElementById('ed-tools');
    box.innerHTML = '';
    for (const m of MODES) {
      const code = m.keyAction ? (this.app.input.bindings[m.keyAction] || []).filter(Boolean)[0] : m.key;
      const SHORT = { Backslash: '\\', Slash: '/', Backquote: '`', Delete: 'Suppr', Tab: '⇥' };
      const k = m.k || (code ? SHORT[code] || keyLabel(code) : '');
      const b = document.createElement('button');
      b.className = 'tool-btn'; b.type = 'button';
      b.dataset.tool = m.id;
      b.title = `${m.label}${k ? ` (${k})` : ''} : ${m.hint}`;
      b.setAttribute('aria-label', m.label);
      b.innerHTML = `${k ? `<span class="k">${esc(k)}</span>` : ''}${ICONS[m.icon] || ''}<span>${m.label}</span>`;
      // Sur téléphone, toucher l'outil déjà actif ouvre ou referme son panneau (tiroir).
      b.addEventListener('click', () => { const same = this.mode() === m.id; this.setMode(m.id); this.app.audio.click(); this._toggleDrawer(same ? undefined : true); });
      box.appendChild(b);
    }
  },

  // Tiroir (petit écran) : le panneau de l'outil s'ouvre par-dessus la vue et se referme après un choix.
  _toggleDrawer(open) {
    const ed = document.getElementById('editor');
    if (!ed) return;
    ed.classList.toggle('drawer-open', open === undefined ? !ed.classList.contains('drawer-open') : open);
  },
  _closeDrawer() { const ed = document.getElementById('editor'); if (ed) ed.classList.remove('drawer-open'); },

  // ---------------------------------------------------------------- Panneau de l'outil
  _buildPalette() {
    const pal = document.getElementById('ed-palette');
    pal.innerHTML = '';
    const guide = document.createElement('div');
    guide.className = 'pal-guided';
    guide.innerHTML = '<span>🎓 <b>Mode guidé</b> : l’essentiel pour commencer (droite et pentes, virages, départ, arrivée, checkpoint).</span><button class="btn small" type="button">Tout afficher</button>';
    guide.querySelector('button').addEventListener('click', () => { this.setGuided(false); this.app.audio.click(); });
    pal.appendChild(guide);
    const close = document.createElement('button');
    close.className = 'btn icon pal-close'; close.type = 'button'; close.textContent = '✕';
    close.title = 'Refermer le panneau'; close.setAttribute('aria-label', 'Refermer le panneau');
    close.addEventListener('click', () => this._closeDrawer());
    pal.appendChild(close);
    this.panels = {};
    for (const m of MODES) {
      const p = document.createElement('div');
      p.className = 'pal-panel'; p.dataset.panel = m.id;
      const h = document.createElement('div'); h.className = 'pal-h'; h.textContent = m.label;
      p.appendChild(h);
      this.panels[m.id] = p;
      pal.appendChild(p);
    }
    this._buildPiecesPanel(this.panels.pieces);
    this._buildPaintPanel(this.panels.paint);
    this._buildDecosPanel(this.panels.decos);
    this._buildSelectPanel(this.panels.select);
    this._buildInspectPanel(this.panels.inspect);
    this._buildErasePanel(this.panels.erase);
    this._buildPrefabPanel();
    this._buildTools();
    this._applyGuided();
    // Petit écran : la colonne Vue démarre repliée ; toucher la ligne du bas (la pièce choisie) ouvre le tiroir de l'outil.
    const view = document.getElementById('ed-view');
    if (view && typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px), (max-height: 520px)').matches) { view.classList.add('folded'); view.querySelector('.ed-vh').setAttribute('aria-expanded', 'false'); }
    const hint = document.getElementById('ed-hint');
    if (hint) hint.onclick = () => this._toggleDrawer(true);
  },

  _seg(choices, onPick) {
    const seg = document.createElement('div');
    seg.className = 'pal-seg'; seg.setAttribute('role', 'group');
    for (const [id, label, title] of choices) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.seg = id; b.textContent = label; if (title) b.title = title;
      b.addEventListener('click', () => { onPick(id); this.app.audio.click(); });
      seg.appendChild(b);
    }
    return seg;
  },

  _section(parent, id, label, open = true) {
    const sec = document.createElement('section');
    sec.className = 'lib-sec'; sec.dataset.sec = id;
    const head = document.createElement('button');
    head.type = 'button'; head.className = 'lib-head'; head.setAttribute('aria-expanded', String(open));
    head.innerHTML = `<span>${esc(label)}</span><i aria-hidden="true">▾</i>`;
    const body = document.createElement('div');
    body.className = 'lib-grid';
    head.addEventListener('click', () => { const o = head.getAttribute('aria-expanded') !== 'true'; head.setAttribute('aria-expanded', String(o)); sec.classList.toggle('closed', !o); });
    sec.classList.toggle('closed', !open);
    sec.append(head, body);
    parent.appendChild(sec);
    return body;
  },

  // ---- Pièces : recherche, Poser / Remplir, récentes, sections, morceaux tout faits, réglages de la pièce choisie
  _buildPiecesPanel(panel) {
    const top = document.createElement('div');
    top.className = 'pal-top';
    const search = document.createElement('input');
    search.type = 'search'; search.id = 'ed-search'; search.className = 'pal-search';
    search.placeholder = 'Rechercher une pièce (large, relevé, tube…)'; search.setAttribute('aria-label', 'Rechercher une pièce');
    search.addEventListener('input', () => this._renderSearch());
    search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.value = ''; this._renderSearch(); search.blur(); } });
    top.appendChild(search);
    top.appendChild(this._seg([['place', 'Poser', 'Poser la pièce choisie (clic ou glisser)'], ['fill', 'Remplir une zone', 'Pot de peinture : remplir une zone connectée, ou une zone vide fermée (touche `)']], (id) => this.setFill(id === 'fill')));
    panel.appendChild(top);
    const results = document.createElement('div');
    results.className = 'lib-results'; results.id = 'ed-results'; results.hidden = true;
    panel.appendChild(results);
    this.libCards = {};
    this._recentGrid = this._section(panel, 'recent', 'Récentes');
    for (const sec of LIBRARY) {
      const grid = this._section(panel, sec.id, sec.label);
      for (const it of sec.items) {
        if (it.startsWith('fam:')) grid.appendChild(this._familyTile(it.slice(4)));
        else this.libCards[it] = this._toolButton(grid, it, '');
      }
    }
    const pf = document.createElement('section');
    pf.className = 'lib-sec'; pf.dataset.sec = 'prefabs'; pf.setAttribute('data-full-only', '');
    const pfHead = document.createElement('button');
    pfHead.type = 'button'; pfHead.className = 'lib-head'; pfHead.setAttribute('aria-expanded', 'false');
    pfHead.innerHTML = '<span>Morceaux tout faits</span><i aria-hidden="true">▾</i>';
    const pfBody = document.createElement('div');
    pfBody.dataset.panel = 'prefabs';
    pfHead.addEventListener('click', () => { const o = pf.classList.contains('closed'); pfHead.setAttribute('aria-expanded', String(o)); pf.classList.toggle('closed', !o); });
    pf.classList.add('closed');
    pf.append(pfHead, pfBody);
    panel.appendChild(pf);
    this._prefabSec = pf;
    // Réglages de la pièce choisie : caractéristiques de sa famille, options, gestes de pose.
    const set = document.createElement('div');
    set.className = 'pal-set'; set.id = 'ed-pset';
    set.innerHTML = '<div class="pset-head"><b id="ed-pset-name"></b><small id="ed-pset-size"></small></div><div class="pset-traits" id="ed-pset-traits"></div><div class="pset-acts" id="ed-pset-acts"></div><details class="pset-opts" id="ed-pset-opts"><summary>Options de la pièce <span id="ed-pset-armed"></span></summary></details>';
    panel.appendChild(set);
    set.querySelector('#ed-pset-opts').appendChild(this._optionsPanel());
    const acts = set.querySelector('#ed-pset-acts');
    for (const [id, label, title, fn] of [
      ['rot', '⟳ Pivoter', 'Pivoter la pièce d’un quart de tour (R ; Maj + R : sens inverse)', () => this.rotate(1)],
      ['mirror', '⇋ Miroir', 'Version gauche / droite de la pièce (M)', () => this.mirror()],
      ['extend', '➜ Prolonger', 'Poser la pièce au bout de la dernière pièce posée, raccordée (P)', () => this.extend()],
    ]) {
      const b = document.createElement('button');
      b.className = 'btn small'; b.type = 'button'; b.dataset.pact = id; b.textContent = label; b.title = title;
      b.addEventListener('click', () => { fn(); this.app.audio.click(); });
      acts.appendChild(b);
    }
  },

  _familyTile(fam) {
    const F = FAMILIES[fam];
    const b = document.createElement('button');
    b.className = 'piece-btn lib-tile fam-main'; b.type = 'button';
    b.dataset.fam = fam;
    b.addEventListener('click', () => { this.setTool(resolve(fam, this._famTraits(fam))); this.app.audio.click(); this._closeDrawer(); });
    this.libCards['fam:' + fam] = b;
    b.title = `${F.label} — ${F.hint}`;
    b.innerHTML = `${ICONS[F.icon] || '<span class="emo">◆</span>'}<span>${esc(F.label)}</span>`;
    return b;
  },

  // Combinaison de caractéristiques actuelle d'une famille (celle de la pièce choisie, sinon la dernière choisie, sinon la 1re).
  _famTraits(fam) {
    const f = familyOf(fillBase(this.tool));
    if (f && f.fam === fam) this.famTraits[fam] = f.traits;
    if (!this.famTraits[fam]) this.famTraits[fam] = { ...FAMILIES[fam].members[Object.keys(FAMILIES[fam].members)[0]] };
    return this.famTraits[fam];
  },

  // Recherche : toutes les pièces dont le nom (ou celui de leur famille) contient chacun des mots tapés, en français comme dans la langue affichée.
  _renderSearch() {
    const input = document.getElementById('ed-search'), box = document.getElementById('ed-results');
    if (!input || !box) return;
    const q = norm(input.value);
    const pal = document.getElementById('ed-palette');
    pal.classList.toggle('searching', !!q);
    box.hidden = !q;
    box.innerHTML = '';
    if (!q) return;
    const words = q.split(' ');
    const hits = [];
    for (const id of PIECE_ORDER) {
      if (!PIECES[id] || LEGACY_TILE[id] || REPLACED_BY_OPTION.has(id) || !this.guidedAllows(id)) continue;
      const f = familyOf(id);
      if (!f && !LIBRARY.some((s) => s.items.includes(id))) continue;
      const hay = norm([PIECES[id].label, f ? FAMILIES[f.fam].label : '', translate(PIECES[id].label), f ? translate(FAMILIES[f.fam].label) : ''].join(' '));
      if (words.every((w) => hay.includes(w))) hits.push(id);
    }
    const head = document.createElement('div');
    head.className = 'lib-count';
    head.textContent = hits.length ? `${hits.length} pièce${hits.length > 1 ? 's' : ''}` : 'Aucune pièce ne correspond.';
    box.appendChild(head);
    const grid = document.createElement('div'); grid.className = 'lib-grid list';
    for (const id of hits.slice(0, 60)) this._toolButton(grid, id, '');
    box.appendChild(grid);
    if (hits.length > 60) { const more = document.createElement('div'); more.className = 'lib-count'; more.textContent = `… et ${hits.length - 60} autres : précise la recherche.`; box.appendChild(more); }
    this._syncLibrary();
  },

  // Pièces récentes (gardées par l'application : elles survivent à un essai et au retour au menu).
  _noteRecent(base) {
    const list = this.app._edRecent || [];
    const g = this._recentGrid;
    if (PIECES[base] && base !== list[0]) this.app._edRecent = [base, ...list.filter((x) => x !== base)].slice(0, RECENT_MAX);
    else if (!g || g.childElementCount === list.length) return;
    if (!g) return;
    g.innerHTML = '';
    for (const id of this.app._edRecent || []) if (this.guidedAllows(id)) this._toolButton(g, id, '');
    g.parentElement.hidden = !g.childElementCount;
  },

  // Cartes allumées, réglages de la pièce choisie (caractéristiques, options), interrupteur Poser / Remplir.
  _syncLibrary() {
    const base = fillBase(this.tool), fam = familyOf(base);
    const pal = document.getElementById('ed-palette');
    if (!pal) return;
    for (const b of pal.querySelectorAll('.lib-tile')) {
      const on = b.dataset.fam ? !!fam && fam.fam === b.dataset.fam : b.dataset.piece === base;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    // Icône d'une carte de famille : la pièce actuelle de la famille.
    for (const f of FAMILY_ORDER) {
      const card = this.libCards && this.libCards['fam:' + f];
      if (!card) continue;
      const type = resolve(f, this._famTraits(f));
      if (card.dataset.type !== type) { card.dataset.type = type || ''; card.firstElementChild.outerHTML = ICONS[type] || ICONS[FAMILIES[f].icon] || '<span class="emo">◆</span>'; }
    }
    for (const sg of pal.querySelectorAll('[data-panel="pieces"] .pal-top [data-seg]')) sg.classList.toggle('on', (sg.dataset.seg === 'fill') === isFill(this.tool));
    for (const sg of pal.querySelectorAll('[data-panel="paint"] [data-seg]')) sg.classList.toggle('on', (sg.dataset.seg === 'fill') === isFill(this.tool));
    const set = document.getElementById('ed-pset');
    if (!set) return;
    const P = PIECES[base];
    set.hidden = !P;
    if (!P) return;
    document.getElementById('ed-pset-name').textContent = P.label;
    document.getElementById('ed-pset-size').textContent = P.size > 1 ? `${P.size}×${P.size}` : '';
    const box = document.getElementById('ed-pset-traits');
    const key = fam ? fam.fam : '';
    if (box.dataset.fam !== key) {
      box.dataset.fam = key;
      box.innerHTML = '';
      this._traitSelects = {};
      if (fam) for (const t of FAMILIES[fam.fam].traits) {
        const lab = document.createElement('label');
        const span = document.createElement('span'); span.textContent = t.label;
        const sel = document.createElement('select');
        sel.setAttribute('aria-label', `${FAMILIES[fam.fam].label} : ${t.label}`);
        for (const [v, text] of t.values) { const o = document.createElement('option'); o.value = v; o.textContent = text; sel.appendChild(o); }
        sel.addEventListener('change', () => {
          const f2 = familyOf(fillBase(this.tool)); if (!f2) return;
          const type = withTrait(f2.fam, f2.traits, t.id, sel.value);
          if (type) this.setTool(isFill(this.tool) ? toFill(type) : type);
          this.app.audio.click();
        });
        lab.append(span, sel);
        box.appendChild(lab);
        this._traitSelects[t.id] = sel;
      }
    }
    // Choix grisés : la raison s'affiche au survol (families.js : missingReason).
    if (fam) for (const t of FAMILIES[fam.fam].traits) {
      const sel = this._traitSelects[t.id];
      const ok = validValues(fam.fam, fam.traits, t.id);
      sel.value = fam.traits[t.id];
      for (const o of sel.options) {
        const dis = !ok.has(o.value) && o.value !== fam.traits[t.id];
        o.disabled = dis;
        o.title = dis ? missingReason(fam.fam, { ...fam.traits, [t.id]: o.value }) || 'Cette combinaison n’existe pas.' : '';
      }
    }
    const mir = set.querySelector('[data-pact="mirror"]');
    if (mir) mir.hidden = !(MIRROR_TYPES[base] || (this.opts && this.opts.o));
  },

  // ---- Peinture
  _buildPaintPanel(panel) {
    const top = document.createElement('div'); top.className = 'pal-top';
    top.appendChild(this._seg([['place', 'Une pièce', 'Peindre la pièce visée (clic ou glisser)'], ['fill', 'Toute la zone', 'Peindre toute la zone connectée de même revêtement (touche `)']], (id) => this.setFill(id === 'fill')));
    panel.appendChild(top);
    const rowS = document.createElement('div'); rowS.className = 'lib-grid surf';
    for (const s of SURFACE_ORDER) this._toolButton(rowS, 'surf:' + s, '');
    panel.appendChild(rowS);
    const par = document.createElement('div');
    par.className = 'pal-param';
    par.innerHTML = '<span id="ed-param-label">—</span><input type="range" id="ed-param" min="0" max="100" step="1"><b id="ed-param-val"></b><button class="btn" id="ed-param-reset" type="button" title="Valeur par défaut" aria-label="Valeur par défaut">↺</button>';
    panel.appendChild(par);
    const compat = document.createElement('button');
    compat.className = 'btn small'; compat.type = 'button';
    compat.textContent = 'Compatibilité…';
    compat.title = 'Quels revêtements vont sur quelles pièces';
    compat.addEventListener('click', () => this.showCompat());
    panel.appendChild(compat);
    const range = par.querySelector('#ed-param');
    range.oninput = () => { this.surfParam[fillBase(this.tool).slice(5)] = +range.value; this._refreshParam(); };
    par.querySelector('#ed-param-reset').onclick = () => { delete this.surfParam[fillBase(this.tool).slice(5)]; this._refreshParam(); };
  },

  // ---- Décors : recherche, cinq familles, catégories, réglages, grille ; mes pièces décoratives
  _buildDecosPanel(panel) {
    const top = document.createElement('div'); top.className = 'pal-top';
    const search = document.createElement('input');
    search.type = 'search'; search.id = 'ed-deco-search'; search.className = 'pal-search';
    search.placeholder = 'Rechercher un décor (arbre, pilier, panneau…)'; search.setAttribute('aria-label', 'Rechercher un décor');
    search.addEventListener('input', () => this._buildDecoRow());
    search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.value = ''; this._buildDecoRow(); search.blur(); } });
    top.appendChild(search);
    panel.appendChild(top);
    const fams = document.createElement('div');
    fams.className = 'pal-chips'; fams.id = 'ed-deco-fams'; fams.setAttribute('role', 'tablist'); fams.setAttribute('aria-label', 'Familles de décors');
    for (const f of DECO_FAMS) {
      const b = document.createElement('button');
      b.className = 'chip'; b.type = 'button'; b.dataset.dfam = f.id; b.textContent = f.label; b.setAttribute('role', 'tab');
      if (f.hint) b.title = f.hint;
      b.addEventListener('click', () => { this.deco.cat = f.cats.find((c) => DECO_CATS[c]) || this.deco.cat; this._buildDecoRow(); this.app.audio.click(); });
      fams.appendChild(b);
    }
    panel.appendChild(fams);
    const cats = document.createElement('div');
    cats.className = 'pal-chips sub'; cats.id = 'ed-deco-cats'; cats.setAttribute('role', 'tablist'); cats.setAttribute('aria-label', 'Catégories de décors');
    panel.appendChild(cats);
    const rowD = document.createElement('div'); rowD.className = 'lib-grid decos'; rowD.id = 'ed-deco-row';
    panel.appendChild(rowD);
    const dTop = document.createElement('div');
    dTop.className = 'pal-deco-top';
    dTop.innerHTML = `<div class="swatches" id="ed-deco-colors"></div>
      <label class="inl">Taille <input type="range" id="ed-deco-scale" min="0.3" max="6" step="0.05"><b id="ed-deco-scale-val"></b></label>
      <label class="inl" id="ed-deco-ph-wrap" title="Décalage dans le cycle de l'obstacle (pour désynchroniser plusieurs obstacles)">Décalage <input type="range" id="ed-deco-ph" min="0" max="0.95" step="0.05"><b id="ed-deco-ph-val"></b></label>
      <label class="inl" title="Posée là où le curseur touche la route ou le sol ; ce curseur (ou Maj + souris) ajoute une hauteur">Hauteur <input type="range" id="ed-deco-dy" min="-20" max="120" step="0.5"><b id="ed-deco-dy-val"></b></label>
      <button class="btn small" id="ed-deco-snap" type="button" title="Accrochage (N)"></button>
      <input type="text" id="ed-deco-url" placeholder="URL de l'image (https://…)" maxlength="400">`;
    panel.appendChild(dTop);
    const cd = document.createElement('div'); cd.dataset.panel = 'cdeco'; cd.setAttribute('data-full-only', '');
    panel.appendChild(cd);
    this._cdecoBox = cd;
    const sc = dTop.querySelector('#ed-deco-scale');
    sc.value = this.deco.scale;
    sc.oninput = () => { this.deco.scale = +sc.value; this.previewKey = ''; this._refreshDeco(); };
    const dyr = dTop.querySelector('#ed-deco-dy');
    dyr.value = this.deco.dy || 0;
    dyr.oninput = () => { this.deco.dy = +dyr.value; this.previewKey = ''; this._refreshDeco(); };
    const ph = dTop.querySelector('#ed-deco-ph');
    ph.value = this.deco.ph;
    ph.oninput = () => { this.deco.ph = +ph.value; this.previewKey = ''; this._refreshDeco(); };
    dTop.querySelector('#ed-deco-snap').onclick = () => this.cycleSnap();
    const url = dTop.querySelector('#ed-deco-url');
    url.oninput = () => { this.deco.url = url.value.trim(); this.previewKey = ''; };
    const colors = dTop.querySelector('#ed-deco-colors');
    for (let i = 0; i <= DECO_COLORS.length; i++) {
      const b = document.createElement('button');
      b.className = 'swatch' + (i === this.deco.color ? ' on' : ''); b.type = 'button';
      b.dataset.c = i;
      b.title = i ? DECO_COLORS[i - 1] : 'Couleurs naturelles';
      b.setAttribute('aria-label', b.title);
      b.style.background = i ? DECO_COLORS[i - 1] : 'conic-gradient(#ff6b57,#ffbf3c,#7cf06b,#3ec1ff,#c77dff,#ff6b57)';
      b.onclick = () => { this.deco.color = i; this.previewKey = ''; this._refreshDeco(); };
      colors.appendChild(b);
    }
    this._buildDecoRow();
  },

  _syncDecoCats() {
    const fam = decoFamOf(this.deco.cat);
    document.querySelectorAll('#ed-deco-fams .chip').forEach((c) => { const on = c.dataset.dfam === fam; c.classList.toggle('on', on); c.setAttribute('aria-selected', String(on)); });
    const box = document.getElementById('ed-deco-cats');
    if (!box) return;
    const F = DECO_FAMS.find((f) => f.id === fam);
    const cats = [...F.cats.filter((c) => DECO_CATS[c]), ...(fam === 'side' ? Object.keys(DECO_CATS).filter((c) => !DECO_FAMS.some((x) => x.cats.includes(c))) : [])];
    if (box.dataset.fam !== fam) {
      box.dataset.fam = fam;
      box.innerHTML = '';
      for (const k of cats) {
        const b = document.createElement('button');
        b.className = 'chip'; b.type = 'button'; b.dataset.cat = k; b.textContent = DECO_CATS[k].label; b.setAttribute('role', 'tab');
        b.addEventListener('click', () => { this.deco.cat = k; this._buildDecoRow(); this.app.audio.click(); });
        box.appendChild(b);
      }
    }
    box.querySelectorAll('.chip').forEach((c) => { const on = c.dataset.cat === this.deco.cat; c.classList.toggle('on', on); c.setAttribute('aria-selected', String(on)); });
  },

  _buildDecoRow() {
    this._syncDecoCats();
    const row = document.getElementById('ed-deco-row');
    if (!row) return;
    row.innerHTML = '';
    const q = norm((document.getElementById('ed-deco-search') || {}).value || '');
    const pal = document.getElementById('ed-palette');
    if (pal) pal.classList.toggle('deco-searching', !!q);
    if (q) {
      const words = q.split(' '), seen = new Set();
      for (const c of Object.values(DECO_CATS)) for (const k of c.kinds) {
        if (seen.has(k)) continue; seen.add(k);
        const hay = norm(`${DECO_LABELS[k] || k} ${translate(DECO_LABELS[k] || k)} ${c.label} ${translate(c.label)}`);
        if (words.every((w) => hay.includes(w))) this._toolButton(row, 'deco:' + k, '');
      }
      if (!row.children.length) row.textContent = 'Aucun décor ne correspond.';
    } else for (const k of DECO_CATS[this.deco.cat].kinds) this._toolButton(row, 'deco:' + k, '');
    this._refreshUI();
  },

  // ---- Sélection, inspection, gomme : ce que fait l'outil, et les actions qui ne tiennent pas dans la barre flottante
  _buildSelectPanel(panel) {
    const p = document.createElement('p'); p.className = 'pal-note';
    p.textContent = 'Trace une zone en glissant sur la grille. Glisse ensuite DANS la zone pour la déplacer ; ses actions (copier, pivoter, supprimer…) s’affichent juste au-dessus.';
    panel.appendChild(p);
    const row = document.createElement('div'); row.className = 'pal-btns';
    for (const [a, label, title] of [['all', 'Tout sélectionner', 'Sélectionner tout le circuit (Ctrl + A)'], ['paste', 'Coller', 'Ctrl + V : poser le presse-papiers'], ['none', 'Désélectionner', 'Retirer la sélection (Échap)']]) {
      // (le clic d'un bouton data-sel est traité par l'application, js/app/wiring.js, comme ceux de la barre flottante)
      const b = document.createElement('button'); b.className = 'btn small'; b.type = 'button'; b.dataset.sel = a; b.textContent = label; b.title = title;
      row.appendChild(b);
    }
    panel.appendChild(row);
    const mv = document.createElement('div'); mv.className = 'pal-btns mv';
    const lab = document.createElement('span'); lab.textContent = 'Déplacer d’une case :'; mv.appendChild(lab);
    for (const [a, t, l] of [['mv-l', '←', 'vers la gauche'], ['mv-u', '↑', 'vers le haut de l’écran (nord)'], ['mv-d', '↓', 'vers le bas de l’écran (sud)'], ['mv-r', '→', 'vers la droite']]) {
      const b = document.createElement('button'); b.className = 'btn icon small'; b.type = 'button'; b.dataset.sel = a; b.textContent = t; b.title = 'Déplacer la zone d’une case ' + l; b.setAttribute('aria-label', b.title);
      mv.appendChild(b);
    }
    panel.appendChild(mv);
  },

  _buildInspectPanel(panel) {
    const p = document.createElement('p'); p.className = 'pal-note';
    p.textContent = 'Clique une pièce ou une décoration : ses propriétés s’ouvrent à droite (position, cap, roulis, type, revêtement, options, couleurs). Les flèches de la scène la déplacent, les cercles la font pivoter ; chaque geste s’annule en un Ctrl + Z.';
    panel.appendChild(p);
  },

  _buildErasePanel(panel) {
    const row = document.createElement('div'); row.className = 'pal-btns'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Filtre de la gomme');
    for (const f of ERASE_FILTER_ORDER) {
      const b = document.createElement('button');
      b.className = 'btn'; b.type = 'button'; b.dataset.ef = f; b.textContent = ERASE_FILTERS[f].label;
      b.title = ERASE_FILTERS[f].hint + ' (X pour changer)';
      b.addEventListener('click', () => { this.app.audio.click(); this.setEraseFilter(f); });
      row.appendChild(b);
    }
    panel.appendChild(row);
    const p = document.createElement('p'); p.className = 'pal-note';
    p.textContent = 'Avec n’importe quel outil, le clic droit efface aussi. Les pièces d’un calque verrouillé ou masqué ne sont jamais effacées.';
    panel.appendChild(p);
    this.eraseBar = row;
  },

  // ---- Options de la pièce (dans ses réglages)
  _optionsPanel() {
    const wrap = document.createElement('div');
    wrap.className = 'opt-panel';
    this.optChips = [];
    for (const g of OPTION_GROUPS) {
      const row = document.createElement('div');
      row.className = 'opt-group'; row.dataset.og = g.id;
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
        b.type = 'button';
        b.textContent = text;
        b.dataset.flag = flag; b.dataset.val = val;
        if (flag === 'th') {
          const sw = document.createElement('i');
          sw.className = 'th-sw'; sw.style.background = THEME_SWATCH[val] || THEME_SWATCH[0];
          b.prepend(sw);
        }
        const m = val ? MODS.find((x) => x.id === modId(flag, val)) : null;
        b.title = m ? m.hint : flag === 'cp' ? 'Pas de checkpoint' : flag === 'mv' ? 'Pièce fixe' : flag === 'th' ? 'Aspect d’origine' : flag === 'gs' ? 'Portique classique' : flag === 'eb' ? 'Plaque sans bordure' : flag === 'o' ? 'Route à plat, au sol' : '';
        b.addEventListener('click', () => { this._optClick(flag, val); this.app.audio.click(); });
        chips.appendChild(b);
        this.optChips.push(b);
      }
      row.appendChild(chips);
      wrap.appendChild(row);
    }
    const clear = document.createElement('button');
    clear.className = 'btn small'; clear.type = 'button';
    clear.id = 'ed-opt-clear';
    clear.textContent = 'Retirer les options';
    clear.addEventListener('click', () => { this.opts = { ...NO_OPTS }; this.previewKey = ''; this._refreshUI(); });
    wrap.appendChild(clear);
    return wrap;
  },

  // Clic sur une option : elle est « armée » et se pose avec la pièce choisie. (Pour changer l'option d'une pièce déjà posée : l'Inspecteur, ou « Option… »
  // de la barre de sélection pour toute une zone.)
  _optClick(flag, val) {
    if (this.guidedOn() && !GUIDED.flags.has(flag)) { this.app.ui.flash('Option du mode complet : « Tout afficher » dans la palette.', 2.5); return; }
    if (PIECES[fillBase(this.tool)]) {
      this.opts = armOption(this.opts, flag, val);
      this.previewKey = '';
      this._refreshUI();
      return;
    }
    this.setTool(modId(flag, val === 0 && (flag === 'v' || flag === 'nb' || flag === 'tn') ? 1 : val));
  },

  _syncOptions() {
    if (!this.optChips) return;
    const piece = PIECES[fillBase(this.tool)] ? fillBase(this.tool) : null;
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
      const ok = !piece || (flag === 'o' && val === 0) || (val === 0) || flagAllowed(piece, flag, flag === 'cp' || flag === 'mv' || flag === 'tb' ? { ...probe, ...this._compatProbe(flag) } : flag === 'gs' ? { ...probe, cp: this.opts.cp } : flag === 'o' ? null : probe, val);
      b.classList.toggle('dim', !ok);
    }
    // Un groupe d'options dont aucun choix ne vaut pour cette pièce est replié : seul ce qui sert reste à l'écran.
    for (const g of document.querySelectorAll('#ed-pset .opt-group')) {
      const any = [...g.querySelectorAll('[data-flag]')].some((b) => +b.dataset.val !== 0 && !b.classList.contains('dim'));
      g.classList.toggle('na', !any);
    }
    const clear = document.getElementById('ed-opt-clear');
    if (clear) clear.hidden = !piece || !OPT_KEYS.some((k) => this.opts[k]);
    const armed = document.getElementById('ed-pset-armed');
    if (armed) { const on = this.optChips.filter((b) => b.classList.contains('on') && +b.dataset.val !== 0 && !(b.dataset.flag === 'o' && +b.dataset.val === 0)).map((b) => b.textContent); armed.textContent = on.length ? '· ' + on.join(', ') : ''; }
  },

  // Options déjà armées qui gênent le test d'une autre (mouvement ↔ checkpoint, tunnel ↔ checkpoint).
  _compatProbe(flag) {
    const o = this.opts;
    return flag === 'cp' ? { mv: o.mv, tn: o.tn, tb: o.tb, v: o.v, o: o.o } : flag === 'tb' ? { mv: o.mv, tn: o.tn, cp: o.cp, v: o.v, o: o.o } : { cp: o.cp, tb: o.tb, v: o.v, o: o.o };
  },

  // Compatibilité : l'ancien choix d'onglet. Les panneaux suivent l'outil ; « prefabs » ouvre la section des morceaux tout faits.
  setTab(id) {
    this.tab = id;
    if (id === 'prefabs' && this._prefabSec) { this._prefabSec.classList.remove('closed'); this._prefabSec.querySelector('.lib-head').setAttribute('aria-expanded', 'true'); this._prefabSec.scrollIntoView({ block: 'nearest' }); }
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
    if (typeof document === 'undefined') return;
    const mode = this.mode(), base = fillBase(this.tool);
    if (PIECES[base]) { this._lastPiece = base; this._noteRecent(base); }
    else if (base.startsWith('surf:')) this._lastSurf = base;
    else if (base.startsWith('deco:')) this._lastDeco = base.slice(5);
    this._refreshSelBar();
    // Rail : l'outil actif.
    document.querySelectorAll('#ed-tools .tool-btn').forEach((b) => {
      const on = b.dataset.tool === mode;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('fill', on && isFill(this.tool));
    });
    // Panneau : celui de l'outil (Sélection, Inspecter et Gomme n'ont que quelques lignes : le panneau se réduit à une carte, la vue reste dégagée).
    if (this.panels) for (const [id, p] of Object.entries(this.panels)) p.hidden = id !== mode;
    const palEl = document.getElementById('ed-palette');
    if (palEl) palEl.classList.toggle('compact', mode === 'select' || mode === 'inspect' || mode === 'erase');
    this._syncLibrary();
    this._syncOptions();
    document.querySelectorAll('#ed-palette .lib-grid.surf .lib-tile, #ed-deco-row .lib-tile').forEach((b) => b.classList.toggle('on', b.dataset.piece === base));
    const lvl = document.getElementById('ed-level');
    if (lvl) lvl.textContent = `Niv. ${this.level}`;
    if (this.eraseBar) this.eraseBar.querySelectorAll('[data-ef]').forEach((b) => b.classList.toggle('on', b.dataset.ef === this.eraseFilter));
    // Barre du haut : nom du circuit ; colonne Vue : boutons à bascule.
    const nm = document.getElementById('ed-name');
    if (nm && nm.textContent !== this.track.name) nm.textContent = this.track.name;
    for (const [id, on] of [['levelview', this.focusLevel], ['topview', this.pitch >= 1.4], ['freecam', !!this.freeCam], ['grid', this.showGrid]]) {
      const b = document.querySelector(`#editor [data-ed="${id}"]`);
      if (b) { b.classList.toggle('on', !!on); b.setAttribute('aria-pressed', String(!!on)); }
    }
    // Ligne du bas : ce qui est choisi, puis les gestes de l'outil (sur téléphone, seulement ce qui est choisi : un toucher ouvre le tiroir).
    const hint = document.getElementById('ed-hint');
    if (hint) {
      const cur = PIECES[base] ? PIECES[base].label : base.startsWith('surf:') ? SURFACES[base.slice(5)].label : base.startsWith('deco:') ? DECO_LABELS[base.slice(5)] || '' : (MODES.find((m) => m.id === mode) || {}).label || '';
      const txt = this.pasting ? HINTS.paste : isFill(this.tool) ? HINTS.fill : HINTS[mode] || '';
      const html = `<span>${cur ? `<b>${esc(cur)}${isFill(this.tool) ? ' · remplir' : ''}</b>` : ''}<i class="txt">${esc(txt)}</i></span>`;
      if (hint._html !== html) { hint._html = html; hint.innerHTML = html; }
    }
    this._refreshBadge();
    this._refreshParam();
    this._refreshDeco();
  },

  // Pastille des problèmes. Le vérificateur relit tout le circuit : sur un petit circuit on le fait tout de suite ; sur un grand (plus de 600 pièces), un quart de
  // seconde après la dernière modification, pour qu'un glissé qui pose vingt pièces ne relance pas vingt vérifications (0.12.0).
  _refreshBadge() {
    if (this._joinKey === this.track.version || this.track.tiles.length <= 600) { this._drawBadge(); return; }
    clearTimeout(this._badgeT);
    this._badgeT = setTimeout(() => { this._badgeT = 0; if (!this.disposed) this._drawBadge(); }, 250);
  },

  _drawBadge() {
    // Pastille : bloquants et avertissements (les conseils « info » ne comptent pas) ; un clic ouvre la fenêtre des problèmes (selection.js : showIssues).
    const found = this._tileIssues();
    const errs = this.track.validate().concat(found.filter((i) => i.level !== 'info').map((i) => i.msg));
    const hard = found.filter((i) => i.level === 'error').length, tips = found.filter((i) => i.level === 'info').length;
    const warn = document.getElementById('ed-warn');
    if (warn) {
      warn.classList.toggle('hidden', !errs.length && !tips);
      warn.classList.toggle('tips', !errs.length && tips > 0);
      warn.textContent = errs.length ? `${hard ? '⛔' : '⚠'} ${errs.length}` : tips ? `ℹ ${tips}` : '';
      warn.title = errs.length ? `${errs.length} problème${errs.length > 1 ? 's' : ''} : cliquer pour le détail` : `${tips} conseil${tips > 1 ? 's' : ''} : cliquer pour le détail`;
      warn.setAttribute('aria-label', warn.title);
      warn.onclick = () => { const f = this._tileIssues(); this.showIssues(); this._markIssues(f.filter((i) => i.level !== 'info')); };   // la fenêtre détaille ; les pièces en cause clignotent
    }
  },

  // Menus de la barre du haut (Fichier, autres essais) : un seul ouvert à la fois.
  toggleMenu(open = !this.menuOpen, id = 'ed-menu') {
    for (const [mid, bid] of [['ed-menu', 'ed-menu-btn'], ['ed-test-menu', 'ed-test-btn']]) {
      const m = document.getElementById(mid), b = document.getElementById(bid);
      if (!m || !b) continue;
      const on = open && mid === id;
      const was = !m.classList.contains('hidden');
      m.classList.toggle('hidden', !on);
      b.setAttribute('aria-expanded', String(on));
      if (on && !was) { const first = m.querySelector('button'); if (first) first.focus({ preventScroll: true }); } else if (!on && was && document.activeElement && m.contains(document.activeElement)) b.focus({ preventScroll: true });
    }
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
  // ---- Fenêtre « Circuit » (0.12.0) : un onglet par sujet. Général, Course, Conditions et Ambiance sont les réglages du niveau ; Déclencheurs et Logique ont leur propre
  // fenêtre, avec la même barre d'onglets. Passer d'un onglet à une autre fenêtre APPLIQUE ce qui a été modifié (comme « Appliquer »).
  _circuitTabs(active, beforeLeave) {
    const bar = document.createElement('div');
    bar.className = 'pp-tabs'; bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', 'Réglages du circuit');
    for (const [id, label] of CIRCUIT_TABS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn small'; b.dataset.ptab = id; b.textContent = label; b.setAttribute('role', 'tab');
      b.classList.toggle('on', id === active); b.setAttribute('aria-selected', String(id === active));
      b.addEventListener('click', () => {
        if (id === active) return;
        const inParams = ['gen', 'course', 'cond', 'amb'];
        if (inParams.includes(id) && inParams.includes(active)) { beforeLeave(id, false); return; }
        if (beforeLeave(id, true) === false) return;
        this.app.ui.closeModal();
        setTimeout(() => (id === 'scripts' ? this._scriptsDialog() : id === 'logic' ? this.openLogic() : this.openParams(id)), 0);
      });
      bar.appendChild(b);
    }
    return bar;
  },

  openParams(tab = 'gen') {
    const T = this.track;
    const f = document.createElement('div');
    f.className = 'form ed-params';
    const veh = { car: 'Voiture', moto: 'Moto', boat: 'Bateau', glider: 'Deltaplane' };
    f.innerHTML = `
      <div class="pp-tab" data-pt="gen">
      <label>Nom<input type="text" id="pp-name" maxlength="40" placeholder="Mon circuit"></label>
      <label class="col">Description<textarea id="pp-desc" maxlength="200" rows="2" placeholder="200 caractères au plus"></textarea></label>
      <label>Décor<select id="pp-decor">${Object.entries(DECORS).map(([id, d]) => `<option value="${id}">${d.label}</option>`).join('')}</select></label>
      <label title="Circuit fermé : l'arrivée est franchie à chaque tour">Tours<select id="pp-laps">${Array.from({ length: 9 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select></label>
      <p class="meta">Le nom et la description ne changent ni la course ni les records ; le décor et le nombre de tours la changent : à revérifier.</p>
      </div>
      <div class="pp-tab" data-pt="course">
      <label title="Rouler sur le terrain ne renvoie plus au checkpoint (il reste lent)">Hors piste autorisé<input type="checkbox" id="pp-off"></label>
      <label>Vitesse de départ<span class="inl"><input type="range" id="pp-v0" min="0" max="300" step="10"><b id="pp-v0v"></b></span></label>
      <label>Gravité de départ<span class="inl"><input type="range" id="pp-g0" min="15" max="250" step="5"><b id="pp-g0v"></b></span></label>
      <label>Véhicule de départ<select id="pp-veh">${Object.entries(veh).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label title="La course commence en gravité inversée : la voiture est plaquée au plafond (départ posé sur une pièce à l'envers)">Inversion de gravité au départ<input type="checkbox" id="pp-ig"></label>
      <label title="Arcade : plus d'adhérence, plus stable. Simulation : pneus plus progressifs, véhicules v2. Aucun profil n'est plus rapide en ligne droite.">Profil physique<select id="pp-pm"><option value="">Classique</option><option value="arcade">Arcade</option><option value="sim">Simulation</option></select></label>
      <label title="Moto qui penche et transfère sa masse, bateau sur la houle et dans les courants, deltaplane porté par les ascendances">Véhicules v2 (moto, bateau, deltaplane)<input type="checkbox" id="pp-vm"></label>
      <p class="meta">Ces règles changent la course : à revérifier.</p>
      </div>
      <div class="pp-tab" data-pt="cond">
      <label title="L'adhérence de toute la piste, en plus de celle des revêtements (100 % : normale)">Adhérence de la piste<span class="inl"><input type="range" id="pp-grip" min="25" max="150" step="5"><b id="pp-gripv"></b></span></label>
      <label title="Un vent constant sur toute la route (0 : aucun)">Vent<span class="inl"><input type="range" id="pp-wind" min="0" max="100" step="5"><b id="pp-windv"></b></span></label>
      <label title="Vers où souffle le vent (le nord est en haut de l'éditeur)">Direction du vent<select id="pp-winddir">${WIND_DIRS.map(([a, l]) => `<option value="${a}">${l}</option>`).join('')}</select></label>
      <label title="La piste mouillée glisse un peu partout, et beaucoup dans les flaques (0 : temps sec)">Pluie<span class="inl"><input type="range" id="pp-rain" min="0" max="100" step="10"><b id="pp-rainv"></b></span></label>
      <label title="Des plaques de verglas sur les lignes droites (0 : aucune)">Givre<span class="inl"><input type="range" id="pp-frost" min="0" max="100" step="10"><b id="pp-frostv"></b></span></label>
      <label title="Des coups de vent, par à-coups, dans la direction du vent (0 : aucune)">Rafales<span class="inl"><input type="range" id="pp-gust" min="0" max="100" step="10"><b id="pp-gustv"></b></span></label>
      <label title="La pluie forcit et faiblit pendant la course, toujours de la même façon">Conditions qui varient<input type="checkbox" id="pp-ev"></label>
      <label title="Place les flaques, les plaques de givre et les rafales : même graine, mêmes conditions pour tout le monde">Graine des conditions<span class="inl"><input type="number" id="pp-es" min="0" max="999" step="1"><button class="btn small" type="button" id="pp-es-dice" title="Tirer une autre graine">🎲</button></span></label>
      <p class="meta">Les conditions changent la course : à revérifier. Même graine, mêmes conditions pour tout le monde.</p>
      </div>
      <div class="pp-tab" data-pt="amb">
      <p class="meta">L’ambiance est sans effet sur la course ni sur les temps.</p>
      <label>Moment de la journée<select id="pp-sky">${SKY_CHOICES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label>Brume<select id="pp-fog">${FOG_CHOICES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label>Musique<select id="pp-music">${MUSIC_CHOICES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label>Météo<select id="pp-weather">${WEATHER_CHOICES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label title="L'heure traverse aube, plein jour, coucher de soleil et nuit pendant la course">Heure qui défile<select id="pp-cycle">${CYCLE_CHOICES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label>Direction du soleil<span class="inl"><input type="checkbox" id="pp-sun-on" title="Direction choisie"><input type="range" id="pp-sun" min="0" max="345" step="15"></span></label>
      <label>Teinte du ciel<span class="inl"><input type="checkbox" id="pp-tint-on" title="Teinte choisie"><input type="color" id="pp-tint"></span></label>
      <label>Teinte du sol<span class="inl"><input type="checkbox" id="pp-gtint-on" title="Teinte choisie"><input type="color" id="pp-gtint"></span></label>
      <label>Couleur de la brume<span class="inl"><input type="checkbox" id="pp-fogc-on" title="Couleur choisie"><input type="color" id="pp-fogc"></span></label>
      </div>`;
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
    $f('pp-grip').value = T.grip; $f('pp-wind').value = T.wind; $f('pp-winddir').value = String(Math.round(T.windDir / 45) * 45 % 360);
    $f('pp-sky').value = T.ambiance.sky; $f('pp-fog').value = T.ambiance.fog; $f('pp-music').value = T.ambiance.music;
    $f('pp-weather').value = T.ambiance.weather; $f('pp-cycle').value = T.ambiance.cycle;
    $f('pp-sun-on').checked = T.ambiance.sunAz >= 0; $f('pp-sun').value = T.ambiance.sunAz >= 0 ? T.ambiance.sunAz : 90;
    for (const [id, key, def] of [['tint', 'tint', '#ff8c5a'], ['gtint', 'gtint', '#2d7a4a'], ['fogc', 'fogC', '#cfe6f5']]) { $f(`pp-${id}-on`).checked = !!T.ambiance[key]; $f(`pp-${id}`).value = T.ambiance[key] || def; }
    const show = () => {
      $f('pp-v0v').textContent = +$f('pp-v0').value ? `${$f('pp-v0').value} km/h` : 'arrêt';
      $f('pp-g0v').textContent = `${$f('pp-g0').value} % · ${(SURF_PHYS.gravity * $f('pp-g0').value / 100).toFixed(1).replace('.', ',')} m/s²`;
    };
    $f('pp-pm').value = T.pm; $f('pp-vm').checked = T.vm === 2;
    $f('pp-rain').value = T.rain; $f('pp-frost').value = T.frost; $f('pp-gust').value = T.gust; $f('pp-ev').checked = !!T.envVary; $f('pp-es').value = T.envSeed;
    const showP = () => {
      const pct = (id, none) => { const v = +$f(id).value; $f(id + 'v').textContent = v ? `${v} %` : none; return v; };
      pct('pp-grip', ''); const wind = pct('pp-wind', 'aucun'), rain = pct('pp-rain', 'aucune'), frost = pct('pp-frost', 'aucun'), gust = pct('pp-gust', 'aucune');
      $f('pp-winddir').disabled = !wind && !gust;                          // les rafales soufflent aussi dans la direction du vent
      $f('pp-ev').disabled = !rain;
      $f('pp-es').disabled = $f('pp-es-dice').disabled = !rain && !frost && !gust;
    };
    for (const id of ['pp-grip', 'pp-wind', 'pp-rain', 'pp-frost', 'pp-gust']) $f(id).oninput = showP;
    showP();
    $f('pp-es-dice').onclick = () => { $f('pp-es').value = String(1 + Math.floor(Math.random() * 999)); };
    $f('pp-v0').oninput = show; $f('pp-g0').oninput = show; show();
    // Onglets : on montre la partie du formulaire de l'onglet ; vers Déclencheurs ou Logique, ce qui a été modifié est appliqué d'abord.
    const snap0 = () => [...f.querySelectorAll('input, select, textarea')].map((e) => (e.type === 'checkbox' ? e.checked : e.value)).join('|');
    const initial = snap0();
    const showTab = (id) => {
      for (const el of f.querySelectorAll('.pp-tab')) el.hidden = el.dataset.pt !== id;
      for (const b of tabs.querySelectorAll('[data-ptab]')) { const on = b.dataset.ptab === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
    };
    const tabs = this._circuitTabs(tab, (id, leaving) => { if (!leaving) { showTab(id); return true; } if (snap0() !== initial) { apply(); this.app.ui.flash('Réglages du circuit appliqués.', 1.6); } return true; });
    const apply = () => {
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
        const wind = +$f('pp-wind').value, rain = +$f('pp-rain').value, frost = +$f('pp-frost').value, gust = +$f('pp-gust').value;
        // Sans vent ni rafales, pas de direction ; sans conditions, pas de graine (elles compteraient dans la signature sans rien changer).
        T.setParams({ desc: $f('pp-desc').value, offroad: $f('pp-off').checked, v0: +$f('pp-v0').value, g0: +$f('pp-g0').value, veh0: $f('pp-veh').value, flip0: $f('pp-ig').checked, ambiance: amb,
          grip: +$f('pp-grip').value, wind, windDir: wind || gust ? +$f('pp-winddir').value : 0,
          rain, frost, gust, envVary: !!rain && $f('pp-ev').checked, envSeed: rain || frost || gust ? +$f('pp-es').value : 0,
          pm: $f('pp-pm').value, vm: $f('pp-vm').checked ? 2 : 1 });
        if ($f('pp-decor').value !== T.decor) { T.decor = $f('pp-decor').value; this._applyDecor(); this.gridKey = ''; }
        else if (ambChanged) this._applyDecor();
        this._changed(false);
        this._commit();
        return true;
    };
    const body = document.createElement('div');
    body.className = 'pp-body';
    body.append(tabs, f);
    showTab(tab);
    this.app.ui.modal({ title: 'Circuit', body, wide: true, actions: [{ label: 'Annuler' }, { label: 'Appliquer', primary: true, onClick: () => apply() }] });
  },
};
