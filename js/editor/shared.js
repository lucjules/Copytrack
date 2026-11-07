// Éléments partagés par les familles de méthodes de EditorSession (voir editor.js).
import { CELL } from '../constants.js';
import { PIECES, SURFACES } from '../pieces.js';
import { DECO_LABELS } from '../decoData.js';
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

export const MODS = [
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

export const OPT_KEYS = ['v', 'o', 'nb', 'tn', 'mv', 'cp', 'tb', 'th'];

export const NO_OPTS = { v: 0, o: 0, nb: 0, tn: 0, mv: 0, cp: 0, tb: 0, th: 0 };

export const SNAPS = [{ id: 0, label: 'Libre' }, { id: 1, label: '1 m' }, { id: 4, label: '4 m' }, { id: CELL / 2, label: 'Demi-case' }, { id: CELL, label: 'Case' }];

export const isFill = (t) => t.startsWith('fill-');

export const fillBase = (t) => (t.startsWith('fill-surf:') ? t.slice(5) : t.startsWith('fill-piece:') ? t.slice(11) : t);

export const toFill = (t) => (t.startsWith('surf:') ? 'fill-' + t : PIECES[t] ? 'fill-piece:' + t : null);

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
