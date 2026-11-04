// Éditeur de circuits : pièces sur grille, niveaux, rotation, revêtements réglables,
// options (envers, sans bordures, tunnel), décorations libres, vérification, historique.
import * as THREE from './vendor/three.module.min.js';
import { CELL, LEVEL_H, ROAD_TOP, MAX_LEVEL, DIRS, MAX_DECOS } from './constants.js';
import { PIECES, SURFACES, SURFACE_ORDER, surfaceAllowed, surfaceRule, flagAllowed } from './pieces.js';
import { Track, DECORS } from './track.js';
import { TrackView, buildTileMesh, SURFACE_STYLE, tint } from './trackMesh.js';
import { buildDecoMesh, safeUrl } from './decos.js';
import { isObstacle } from './obstacles.js';
import { DECO_CATS, DECO_LABELS, DECO_COLORS } from './decoData.js';
import { setEditorDraft, saveMyTrack, newId, formatTime } from './storage.js';
import { normRect, tilesInRect, decosInRect, copyRect, rotateClip, placedClip, pasteClip, shiftLevel } from './editorTools.js';
import { centerlineWorld } from './ribbons.js';
import { Inspector, MIRROR_TYPES } from './inspector.js';
import { keyLabel } from './input.js';
import { esc } from './ui.js';
import { pickObjects, ERASE_FILTERS, ERASE_FILTER_ORDER, LAYER_ALL, LAYER_DECO, tileBounds } from './editorPick.js';

export const PALETTE_ORDER = [
  { id: 'straight', key: 'Digit1', k: '1' },
  { id: 'curve', key: 'Digit2', k: '2' },
  { id: 'bigcurve', key: 'Digit3', k: '3' },
  { id: 'slope', key: 'Digit4', k: '4' },
  { id: 'steep', key: 'Digit5', k: '5' },
  { id: 'loop', key: 'Digit6', k: '6' },
  { id: 'loopL', key: 'Digit7', k: '7' },
  { id: 'loopBig', key: 'KeyU', k: 'U' },
  { id: 'loopBigL', key: '', k: '' },
  { id: 'loopDouble', key: 'KeyI', k: 'I' },
  { id: 'loopDoubleL', key: '', k: '' },
  { id: 'twist', key: 'KeyV', k: 'V' },
  { id: 'ramp90', key: 'KeyL', k: 'L' },
  { id: 'wall', key: 'KeyK', k: 'K' },
  { id: 'crest90', key: 'KeyJ', k: 'J' },
  { id: 'bank', key: 'KeyO', k: 'O' },
  { id: 'bankBig', key: '', k: '' },
  { id: 'tube', key: '', k: '' },
  { id: 'tubeIn', key: 'KeyY', k: 'Y' },
  { id: 'tubeMid', key: '', k: '' },
  { id: 'cork', key: '', k: '' },
  { id: 'corkL', key: '', k: '' },
  { id: 'fork', key: '', k: '' },
  { id: 'forkL', key: '', k: '' },
  { id: 'gentle', key: '', k: '' },
  { id: 'ring', key: '', k: '' },
  { id: 'checkpoint', key: 'Digit8', k: '8' },
  { id: 'cpCurve', key: '', k: '' },
  { id: 'cpRing', key: '', k: '' },
  { id: 'start', key: 'Digit9', k: '9' },
  { id: 'finish', key: 'Digit0', k: '0' },
  { id: 'platform', key: 'KeyP', k: 'P' },
];

// Outils (grille « Outils » à gauche) : ne posent rien. action : raccourci réglable (voir input.js) ; key : touche fixe.
export const TOOLS = [
  { id: 'select', label: 'Sélection', key: 'KeyQ', k: 'Q', hint: 'Choisir une zone : copier, déplacer, supprimer' },
  { id: 'inspect', label: 'Inspecter', action: 'ed.inspect', hint: 'Clic sur une pièce ou une déco : propriétés et gizmos 3D' },
  { id: 'erase', label: 'Gomme', action: 'ed.erase', hint: 'Effacer (filtre : tout / décorations / pistes)' },
  { id: 'fill', label: 'Pot de peinture', action: 'ed.fill', hint: 'Remplir toute une zone connectée : choisis une pièce ou un revêtement, puis clique une pièce' },
];
const TOOL_IDS = new Set(['select', 'inspect', 'erase']);

const MIRROR = MIRROR_TYPES;
const MODS = [
  { id: 'mod:v', flag: 'v', label: 'À l\'envers', hint: 'Route au plafond : roulable seulement en gravité inversée (plaque d’inversion)' },
  { id: 'mod:nb', flag: 'nb', label: 'Sans bordures', hint: 'Plus de rebord : on peut tomber' },
  { id: 'mod:tn', flag: 'tn', label: 'Tunnel', hint: 'Voûte autour de la route' },
  { id: 'mod:mv1', flag: 'mv', val: 1, label: 'Ascenseur', hint: 'La pièce monte de 2 niveaux et redescend (6 s)' },
  { id: 'mod:mv2', flag: 'mv', val: 2, label: 'Glissière', hint: 'La pièce glisse d’une case vers sa droite et revient (5 s)' },
];
const SNAPS = [{ id: 0, label: 'Libre' }, { id: 1, label: '1 m' }, { id: 4, label: '4 m' }, { id: 12, label: 'Demi-case' }, { id: CELL, label: 'Case' }];

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
export const ICONS = {
  straight: svg(`${straightBase()}<path d="M24 6v8M24 20v8M24 34v8" stroke="${LINE}" stroke-width="2"/>`),
  curve: svg(`<path d="M10 48 A38 38 0 0 1 48 10 L48 38 A10 10 0 0 0 38 48Z" fill="${ROAD}"/><path d="M10 48 A38 38 0 0 1 48 10" stroke="${RAIL}" stroke-width="2.5" fill="none"/><path d="M38 48 A10 10 0 0 1 48 38" stroke="${RAIL}" stroke-width="2.5" fill="none"/>`),
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
  'surf:sand': svg(`${straightBase('#c9a26b', '#9b6b45')}<path d="M12 14q6-4 12 0t12 0M12 24q6-4 12 0t12 0M12 34q6-4 12 0t12 0" stroke="#8a6440" stroke-width="2" fill="none"/>`),
  'surf:magnet': svg(`${straightBase('#2c2a4a', '#b48cff')}<path d="M16 10v14a8 8 0 0 0 16 0V10" stroke="#b48cff" stroke-width="4" fill="none"/><path d="M13 10h6M29 10h6" stroke="#f3e7d3" stroke-width="4"/>`),
  'surf:mud': svg(`${straightBase('#4a3426', '#6b4a32')}<circle cx="19" cy="16" r="4" fill="#2e1f14"/><circle cx="30" cy="26" r="5" fill="#2e1f14"/><circle cx="20" cy="36" r="3.5" fill="#2e1f14"/>`),
  'surf:drift': svg(`${straightBase('#3a2f3a', '#ff8c42')}<path d="M18 40Q14 26 24 14M30 40Q34 26 24 14" stroke="#ffb84d" stroke-width="2.5" fill="none"/>`),
  'surf:slow': svg(`${straightBase('#3b2a2f', '#ff6b57')}<path d="M12 14h24M12 24h24M12 34h24" stroke="#ffd23e" stroke-width="3" stroke-dasharray="4 3"/>`),
  'surf:wind': svg(`${straightBase('#2c3a52', '#bfefff')}<path d="M14 16h16l4-3M14 26h20M14 36h14l4 3" stroke="#bfefff" stroke-width="2.5" fill="none"/>`),
  'surf:water': svg(`${straightBase('#1f6fb2', '#9fe3ff')}<path d="M12 16q6-5 12 0t12 0M12 26q6-5 12 0t12 0M12 36q6-5 12 0t12 0" stroke="#9fe3ff" stroke-width="2.5" fill="none"/>`),
  'surf:boat': svg(`${straightBase('#22343f', '#3fd0ff')}<path d="M12 28h24l-4 8H16z" fill="#3fd0ff"/><path d="M24 28V12l8 10h-8" stroke="#3fd0ff" stroke-width="2" fill="none"/>`),
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
  return !!PIECES[t] || t === 'erase' || t === 'select' || t === 'inspect' || t.startsWith('surf:') || t.startsWith('mod:') || t.startsWith('deco:');
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
    this.sel = null;          // rectangle de sélection {x0, z0, x1, z1}
    this.selDrag = null;
    this.clip = null;         // presse-papiers
    this.pasting = false;
    this.focusLevel = false;  // vue par niveau
    this.deco = { cat: 'signs', color: 0, scale: 1, rot: 0, url: '', snap: 0, ph: 0 };

    this.view = new TrackView(this.track, app.materials);
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
      b.addEventListener('click', () => { this.setTab(id); this.app.audio.click(); });
      tabs.appendChild(b);
      const panel = document.createElement('div');
      panel.className = 'pal-panel';
      panel.dataset.panel = id;
      panels[id] = panel;
    }
    pal.appendChild(tabs);

    const rowP = document.createElement('div'); rowP.className = 'pal-row';
    for (const p of PALETTE_ORDER) this._toolButton(rowP, p.id, p.k);
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

    const rowM = document.createElement('div'); rowM.className = 'pal-row mods';
    for (const m of MODS) this._toolButton(rowM, m.id, '');
    panels.mods.appendChild(rowM);
    const hint = document.createElement('div');
    hint.className = 'pal-hint';
    hint.textContent = 'Choisis une option puis clique sur une pièce pour l\'activer ou la désactiver. Toute pièce peut être posée à l\'envers (au moins un niveau au-dessus du sol) : on ne peut y rouler qu\'en gravité inversée. Une plaque « Inversion de gravité » projette la voiture vers le haut, une pièce à l\'envers la réceptionne ; une 2e plaque la remet à l\'endroit. Sur une vrille, la plaque fait passer au plafond en douceur.';
    panels.mods.appendChild(hint);

    const dTop = document.createElement('div');
    dTop.className = 'pal-deco-top';
    dTop.innerHTML = `<div class="swatches" id="ed-deco-colors"></div>
      <label class="inl">Taille <input type="range" id="ed-deco-scale" min="0.3" max="6" step="0.05"><b id="ed-deco-scale-val"></b></label>
      <label class="inl" id="ed-deco-ph-wrap" title="Décalage dans le cycle de l'obstacle (pour désynchroniser plusieurs obstacles)">Décalage <input type="range" id="ed-deco-ph" min="0" max="0.95" step="0.05"><b id="ed-deco-ph-val"></b></label>
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
    if (!f) { this.app.ui.flash('Pot de peinture : choisis d’abord une pièce ou un revêtement.'); this.app.audio.error(); return; }
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
    if (MIRROR[fillBase(this.tool)]) this.setTool(MIRROR[fillBase(this.tool)]);
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
    document.getElementById('ed-param-val').textContent = s === 'wind' ? (+r.value === 100 ? 'nul' : (+r.value > 100 ? '→ ' : '← ') + Math.abs(+r.value - 100) + ' %') : `${r.value} %`;
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
  }

  _refreshUI() {
    this._refreshSelBar();
    document.querySelectorAll('#ed-palette .piece-btn').forEach((b) => b.classList.toggle('on', b.dataset.piece === fillBase(this.tool)));
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
    const errs = this.track.validate();
    const warn = document.getElementById('ed-warn');
    if (warn) {
      warn.classList.toggle('hidden', !errs.length);
      warn.textContent = errs.length ? `⚠ ${errs.length}` : '';
      warn.title = errs.join(' ');
      warn.setAttribute('aria-label', errs.length ? `${errs.length} problème${errs.length > 1 ? 's' : ''} : ${errs.join(' ')}` : '');
      warn.onclick = () => this.app.ui.flash(errs.join(' '), 4);
    }
    const root = document.getElementById('editor');
    const top = document.querySelector('#editor .ed-top'), pal = document.getElementById('ed-palette');
    if (top) root.style.setProperty('--ed-top-h', top.offsetHeight + 'px');
    if (pal) root.style.setProperty('--ed-pal-h', pal.offsetHeight + 'px');
    this._refreshParam();
    this._refreshDeco();
  }

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
      t: this.track.tiles.map((t) => [t.t, t.x, t.z, t.l, t.r, t.s || '', t.p || 0, t.v, t.nb, t.tn, t.mv || 0, t.cp || 0, t.th || 0, t.ms || 0, t.ma || 0, t.col || 0, t.s2 || '', t.p2 || 0]),
      d: this.track.decos.map((o) => [o.k, o.x, o.y, o.z, o.ry, o.s, o.c, o.u, o.ph || 0, o.cc || '']),
      lp: this.track.laps || 1,
      pr: { desc: this.track.desc, offroad: this.track.offroad, v0: this.track.v0, g0: this.track.g0, veh0: this.track.veh0, decor: this.track.decor },
    });
  }

  _restore(snap) {
    const data = JSON.parse(snap);
    const { vt, vh } = this.track;
    this.track.clear();
    this.track.vt = vt; this.track.vh = vh;
    for (const [t, x, z, l, r, s, p, v, nb, tn, mv, cp, th, ms, ma, col, s2, p2] of data.t) this.track.add({ t, x, z, l, r, s, p, v, nb, tn, mv, cp, th, ms, ma, col: col || null, s2, p2 });
    for (const [k, x, y, z, ry, sc, c, u, ph, cc] of data.d) this.track.addDeco({ k, x, y, z, ry, s: sc, c, u, ph, cc });
    this.track.laps = data.lp || 1;
    if (data.pr) {
      this.track.setParams(data.pr);
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

  _candidate() {
    if (!this.hover || !PIECES[this.tool]) return null;
    const p = PIECES[this.tool];
    const sz = p.size;
    const ax = sz % 2 === 0 ? Math.round(this.hover.x / CELL - sz / 2) : this.hover.cx - (sz - 1) / 2;
    const az = sz % 2 === 0 ? Math.round(this.hover.z / CELL - sz / 2) : this.hover.cz - (sz - 1) / 2;
    return { t: this.tool, x: ax, z: az, l: this.level, r: this.rot, s: '' };
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
    if (!Track.inBounds(Track.normalize(tile))) { if (!painting) { this.app.ui.flash('Cette pièce sortirait des niveaux (à l’envers, elle pend sous son niveau : monte d’abord).'); this.app.audio.error(); } return; }
    const conflicts = this.track.conflicts(tile);
    if (conflicts.length === 1) {
      const c = conflicts[0];
      if (c.t === tile.t && c.x === tile.x && c.z === tile.z && c.l === tile.l && c.r === tile.r) return;
    }
    for (const c of conflicts) this.track.remove(c);
    if (tile.t === 'start') for (const s of this.track.tiles.filter((x) => x.t === 'start')) this.track.remove(s);
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
    const [dx, dz] = DIRS[tile.r];
    this.autoLevel = new Map([
      [`${tile.x + dx},${tile.z + dz}`, tile.l + p.rise],
      [`${tile.x - dx},${tile.z - dz}`, tile.l],
    ]);
  }

  _paintSurface(painting) {
    const t = this._hoverTile();
    if (!t) return;
    const s = this.tool.slice(5);
    if (!surfaceAllowed(t.t, s, !!t.v)) {
      if (!painting) { this.app.ui.flash(`${SURFACES[s].label} : incompatible avec « ${PIECES[t.t].label}${t.v ? ' (envers)' : ''} »`); this.app.audio.error(); }
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
    const start = this._hoverTile();
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
    this.app.ui.flash(`${done} pièce${done > 1 ? 's' : ''} modifiée${done > 1 ? 's' : ''}` + (skipped ? ` · ${skipped} ignorée${skipped > 1 ? 's' : ''} (incompatible ou pas la place)` : ''));
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

  _toggleMod(painting) {
    const t = this._hoverTile();
    if (!t) return;
    const key = `${t.x},${t.z},${t.l}`;
    if (painting && key === this._lastPaint) return;
    this._lastPaint = key;
    const mod = MODS.find((m) => m.id === this.tool), flag = mod.flag;
    if (!flagAllowed(t.t, flag, t)) {
      this.app.ui.flash(`${pieceLabel(this.tool)} : impossible sur « ${PIECES[t.t].label} »`);
      this.app.audio.error();
      return;
    }
    if (this.track.toggleFlag(t, flag, mod.val || 1)) {
      this.app.audio.place();
      this._changed();
      if (!painting) this._commit();
    } else if (flag === 'tn') this.app.ui.flash('Tunnel impossible sur une route à l\'envers');
    else if (flag === 'mv') { this.app.ui.flash('Pas la place pour ce mouvement (case voisine ou niveaux au-dessus occupés)'); this.app.audio.error(); }
  }

  _snapPos(x, z) {
    const s = this.deco.snap;
    if (!s) return [x, z];
    const o = s === CELL || s === 12 ? s / 2 : 0;
    return [Math.round((x - o) / s) * s + o, Math.round((z - o) / s) * s + o];
  }

  _decoAt() {
    if (!this.hover) return null;
    const kind = this.tool.slice(5);
    const [x, z] = this._snapPos(this.hover.x, this.hover.z);
    return { k: kind, x, y: this.levelY(), z, ry: this.deco.rot, s: this.deco.scale, c: this.deco.color, u: kind === 'plaque' ? this.deco.url : '', ph: isObstacle(kind) ? this.deco.ph : 0 };
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
    const t = this._hoverTile();
    if (!t) return;
    this.fillMode = false;
    this.tool = t.t; this.rot = t.r; this.level = t.l;
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
      ['Plateforme', 'platform'], ['Relevé, vrille, tube', 'bank'], ['Looping', 'loop'], ['Anneau', 'ring'],
    ].filter(([, t]) => PIECES[t]);
    const rows = SURFACE_ORDER.filter((s) => s).map((s) => {
      const cells = cols.map(([, t]) => {
        const why = surfaceRule(PIECES[t], SURFACES[s], s);
        return `<td title="${why || 'oui'}" style="text-align:center;color:${why ? '#ff6b7a' : '#5dff8a'}">${why ? '✕' : '✓'}</td>`;
      }).join('');
      return `<tr><td style="white-space:nowrap">${SURFACES[s].label}</td>${cells}</tr>`;
    }).join('');
    const body = `<p>Tous les revêtements se posent sur toutes les routes, avec les mêmes effets partout (pas d'aide cachée dans les loopings ou au plafond). Seules exceptions : l'eau, le rebond et la plaque bateau demandent du plat ; l'eau ne va pas sur une pièce spéciale ; un anneau n'a pas de route.</p>
      <div style="overflow:auto;max-height:52vh"><table style="border-collapse:collapse;font-size:13px;width:100%">
      <tr><th></th>${cols.map(([l]) => `<th style="font-weight:600;padding:2px 4px;font-size:11px">${l}</th>`).join('')}</tr>${rows}</table></div>`;
    this.app.ui.modal({ title: 'Compatibilité des revêtements', body, actions: [{ label: 'OK', primary: true }] });
  }

  testHere() {
    const t = this._hoverTile();
    if (!t || ['ring', 'area'].includes(PIECES[t.t].kind)) { this.app.ui.flash('Vise une pièce de route pour tester à partir d\'elle.'); this.app.audio.error(); return; }
    if (this.track.count('finish') === 0) { this.app.ui.flash('Il faut au moins une arrivée.'); this.app.audio.error(); return; }
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
    const gs = t.v && PIECES[t.t].kind !== 'ribbon' && PIECES[t.t].kind !== 'loop' ? -1 : 1;
    this.app.testTrack(this.exportState(), { x: a[0] + (b[0] - a[0]) * 0.5, y: a[1], z: a[2] + (b[2] - a[2]) * 0.5, yaw, gs });
  }

  test(verify = false) {
    const errs = this.track.validate();
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
      <label>Décor<select id="pp-decor">${Object.entries(DECORS).map(([id, d]) => `<option value="${id}">${d.label}</option>`).join('')}</select></label>
      <label title="Circuit fermé : l'arrivée est franchie à chaque tour">Tours<select id="pp-laps">${Array.from({ length: 9 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select></label>
      <label title="Rouler sur le terrain ne renvoie plus au checkpoint (il reste lent)">Hors piste autorisé<input type="checkbox" id="pp-off"></label>
      <label>Vitesse de départ<span class="inl"><input type="range" id="pp-v0" min="0" max="300" step="10"><b id="pp-v0v"></b></span></label>
      <label>Gravité de départ<span class="inl"><input type="range" id="pp-g0" min="15" max="250" step="5"><b id="pp-g0v"></b></span></label>
      <label>Véhicule de départ<select id="pp-veh">${Object.entries(veh).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <p class="meta">Le nom et la description du circuit se choisissent au moment de la publication. Ces réglages modifient la course : il faudra la re-vérifier.</p>`;
    const $f = (id) => f.querySelector('#' + id);
    $f('pp-decor').value = T.decor;
    $f('pp-laps').value = String(T.laps || 1);
    $f('pp-off').checked = !!T.offroad;
    $f('pp-v0').value = T.v0 || 0;
    $f('pp-g0').value = T.g0 || 100;
    $f('pp-veh').value = T.veh0 || 'car';
    const show = () => {
      $f('pp-v0v').textContent = +$f('pp-v0').value ? `${$f('pp-v0').value} km/h` : 'arrêt';
      $f('pp-g0v').textContent = `${$f('pp-g0').value} %`;
    };
    $f('pp-v0').oninput = show; $f('pp-g0').oninput = show; show();
    this.app.ui.modal({
      title: 'Paramètres du niveau',
      body: f,
      actions: [{ label: 'Annuler' }, { label: 'Appliquer', primary: true, onClick: () => {
        const laps = +$f('pp-laps').value;
        if (laps > 1 && (T.laps || 1) === 1) this.app.ui.flash('Plusieurs tours : l\'arrivée doit être juste avant le départ (circuit fermé).', 3);
        T.laps = laps;
        T.setParams({ offroad: $f('pp-off').checked, v0: +$f('pp-v0').value, g0: +$f('pp-g0').value, veh0: $f('pp-veh').value });
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

  _clearPreview() {
    for (const c of [...this.preview.children]) { c.traverse((o) => o.geometry && o.geometry.dispose()); this.preview.remove(c); }
  }

  _updatePreview() {
    if (this.tool === 'select') { this._updatePastePreview(); return; }
    const cand = this._candidate();
    this.highlight.visible = false;
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

    if (this.tool.startsWith('deco:')) {
      const d = this._decoAt();
      const key = `D${d.k},${d.x.toFixed(1)},${d.z.toFixed(1)},${d.y},${d.ry},${d.s},${d.c},${d.u}`;
      if (key !== this.previewKey) {
        this.previewKey = key;
        this._clearPreview();
        this.preview.add(buildDecoMesh(d, this.previewMat, this.previewGlow));
      }
      this.preview.visible = true;
      this.footprint.visible = false;
      return;
    }
    if (!cand) {
      this.preview.visible = false;
      if (this.tool === 'erase' || this.tool === 'inspect') {
        // Surbrillance de l'objet que le rayon touche, dans les calques permis par le filtre.
        const erase = this.tool === 'erase';
        const hit = this._pickTarget(erase ? ERASE_FILTERS[this.eraseFilter].mask : LAYER_ALL);
        if (hit) this._highlightHit(hit, erase ? '#ff3b5c' : '#5ff2ff');
        return;
      }
      const t = this._hoverTile();
      if (t) {
        if (isFill(this.tool)) {
          this._highlightTile(t, this._fillRefusal(t) ? '#ff3b5c' : '#ffb347');
        } else if (this.tool.startsWith('surf:')) {
          const s = this.tool.slice(5);
          this._highlightTile(t, surfaceAllowed(t.t, s, !!t.v) ? (s ? tint(s, this._surfParamValue(s)) : '#ffffff') : '#ff3b5c');
        } else {
          const m = MODS.find((x) => x.id === this.tool);
          this._highlightTile(t, m && flagAllowed(t.t, m.flag, t) ? '#8f7cff' : '#ff3b5c');
        }
      }
      return;
    }
    const key = `${cand.t},${cand.x},${cand.z},${cand.l},${cand.r},${this.track.version}`;
    if (key === this.previewKey) return;
    this.previewKey = key;
    this._clearPreview();
    const conflicts = this.track.conflicts(cand);
    if (!Track.inBounds(Track.normalize(cand))) conflicts.push(null);
    const same = conflicts.length === 1 && conflicts[0] && ['t', 'x', 'z', 'l', 'r'].every((k) => conflicts[0][k] === cand[k]);
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
    if (input.act('ed.grid')) { this.showGrid = !this.showGrid; this.app.ui.flash(this.showGrid ? 'Grille affichée' : 'Grille masquée', 1.2); }
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
    this.app.scenery.update(this.target, cam, Math.min(300, this.dist * 1.4));
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
    this.app.ui.flash(`${n} pièce${n > 1 ? 's' : ''}${d ? `, ${d} décoration${d > 1 ? 's' : ''}` : ''} sélectionnée${n + d > 1 ? 's' : ''} · Ctrl+C / X / V, Suppr, E / C pour monter / descendre`, 3);
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
    if (!shiftLevel(this.track, tiles, decos, d)) { this.app.ui.flash('Impossible : une pièce gêne ou sort des niveaux.'); this.app.audio.error(); return; }
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
    this.app.ui.flash(this.focusLevel ? `Vue du niveau ${this.level} : les autres niveaux sont estompés` : 'Tous les niveaux affichés', 1.6);
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
    this.selBox.geometry.dispose(); this.selBox.material.dispose(); this.selBox.removeFromParent();
    const el = this.app.renderer.domElement;
    el.removeEventListener('pointerdown', this._h.down);
    window.removeEventListener('pointermove', this._h.move);
    window.removeEventListener('pointerup', this._h.up);
    window.removeEventListener('pointercancel', this._h.up);
    el.removeEventListener('wheel', this._h.wheel);
    el.removeEventListener('contextmenu', this._h.ctx);
    window.removeEventListener('keydown', this._h.key);
    document.removeEventListener('pointerdown', this._h.outside, true);
    document.removeEventListener('keydown', this._h.menuKey);
    this.toggleMenu(false);
    clearTimeout(this._draftT);
    setEditorDraft(this.exportState());
    this.inspector.dispose();
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
};
void SURFACE_STYLE;
