// Familles de pièces et « caractéristiques » (Phase 2).
//
// Le circuit sérialise toujours un TYPE CONCRET de pièce (PIECE_ORDER) : c'est ce qui garde les anciens codes lisibles.
// Une famille est une couche d'édition par-dessus : chaque pièce concrète y est décrite par des valeurs de caractéristiques
// (liste déroulante, réglage…) et l'éditeur / l'inspecteur ne manipulent que ces caractéristiques ; `resolve()` les traduit
// en type concret, `familyOf()` fait le chemin inverse (un ancien circuit « Pente » s'affiche donc « Ligne droite · inclinaison 1 »).
//
// Une caractéristique : { id, label, values: [[valeur, texte], …] } ; valeurs en chaînes.
// Une combinaison absente de `members` n'existe pas : l'interface la grise (ex. virage serré relevé).
import { PIECES } from './pieces.js';

export const FAMILIES = {
  straight: {
    label: 'Ligne droite',
    hint: 'Route droite, plate ou inclinée (½, 1, 2 ou 4 niveaux de dénivelé sur la case).',
    icon: 'straight',
    traits: [{ id: 'incl', label: 'Inclinaison', values: [['0', 'Plat'], ['0.5', '½'], ['1', '1'], ['2', '2'], ['4', '4']] }],
    members: {
      straight: { incl: '0' }, gentle: { incl: '0.5' }, slope: { incl: '1' }, steep: { incl: '2' }, steep4: { incl: '4' },
    },
    key: 'Digit1', k: '1',
  },
  turn: {
    label: 'Virage',
    hint: 'Virage à plat (serré, grand ou très grand) ou relevé (la route penche vers l’intérieur).',
    icon: 'curve',
    traits: [
      { id: 'size', label: 'Rayon', values: [['s', 'Serré'], ['m', 'Grand'], ['l', 'Très grand']] },
      { id: 'bank', label: 'Profil', values: [['0', 'Plat'], ['1', 'Relevé']] },
    ],
    members: {
      curve: { size: 's', bank: '0' }, bigcurve: { size: 'm', bank: '0' }, hugecurve: { size: 'l', bank: '0' },
      bank: { size: 'm', bank: '1' }, bankBig: { size: 'l', bank: '1' },
    },
    key: 'Digit2', k: '2',
  },
  courbe: {
    label: 'Courbe',
    hint: 'Un tremplin courbé : un virage qui monte (inclinaison ½, 1, 2 ou 4 niveaux), à droite ou à gauche. Pris dans l’autre sens, il descend.',
    icon: 'courbe',
    traits: [
      { id: 'dir', label: 'Orientation', values: [['R', 'Droite ↱'], ['L', 'Gauche ↰']] },
      { id: 'size', label: 'Rayon', values: [['s', 'Serré'], ['m', 'Grand']] },
      { id: 'incl', label: 'Inclinaison', values: [['0.5', '½'], ['1', '1'], ['2', '2'], ['4', '4']] },
    ],
    members: {
      cv05: { dir: 'R', size: 's', incl: '0.5' }, cv1: { dir: 'R', size: 's', incl: '1' }, cv2: { dir: 'R', size: 's', incl: '2' }, cv4: { dir: 'R', size: 's', incl: '4' },
      cvBig05: { dir: 'R', size: 'm', incl: '0.5' }, cvBig1: { dir: 'R', size: 'm', incl: '1' }, cvBig2: { dir: 'R', size: 'm', incl: '2' }, cvBig4: { dir: 'R', size: 'm', incl: '4' },
      cvL05: { dir: 'L', size: 's', incl: '0.5' }, cvL1: { dir: 'L', size: 's', incl: '1' }, cvL2: { dir: 'L', size: 's', incl: '2' }, cvL4: { dir: 'L', size: 's', incl: '4' },
      cvBigL05: { dir: 'L', size: 'm', incl: '0.5' }, cvBigL1: { dir: 'L', size: 'm', incl: '1' }, cvBigL2: { dir: 'L', size: 'm', incl: '2' }, cvBigL4: { dir: 'L', size: 'm', incl: '4' },
    },
    key: 'Digit3', k: '3',
  },
  loop: {
    label: 'Looping',
    hint: 'Boucle verticale : orientation, taille et nombre de boucles (1 à 3). L’empreinte grandit avec le nombre de boucles.',
    icon: 'loop',
    traits: [
      { id: 'dir', label: 'Orientation', values: [['R', 'Droite ↱'], ['L', 'Gauche ↰']] },
      { id: 'size', label: 'Taille', values: [['n', 'Normale'], ['g', 'Grande']] },
      { id: 'turns', label: 'Boucles', values: [['1', '1'], ['2', '2'], ['3', '3']] },
    ],
    members: {
      loop: { dir: 'R', size: 'n', turns: '1' }, loopL: { dir: 'L', size: 'n', turns: '1' },
      loopBig: { dir: 'R', size: 'g', turns: '1' }, loopBigL: { dir: 'L', size: 'g', turns: '1' },
      loopDouble: { dir: 'R', size: 'n', turns: '2' }, loopDoubleL: { dir: 'L', size: 'n', turns: '2' },
      loopBigDouble: { dir: 'R', size: 'g', turns: '2' }, loopBigDoubleL: { dir: 'L', size: 'g', turns: '2' },
      loopTriple: { dir: 'R', size: 'n', turns: '3' }, loopTripleL: { dir: 'L', size: 'n', turns: '3' },
      loopBigTriple: { dir: 'R', size: 'g', turns: '3' }, loopBigTripleL: { dir: 'L', size: 'g', turns: '3' },
    },
    key: 'Digit6', k: '6',
  },
};
export const FAMILY_ORDER = ['straight', 'turn', 'courbe', 'loop'];

// type concret -> { fam, traits }
const BY_TYPE = new Map();
for (const [fam, F] of Object.entries(FAMILIES)) {
  for (const [type, traits] of Object.entries(F.members)) {
    if (!PIECES[type]) throw new Error(`Famille ${fam} : pièce inconnue ${type}`);
    BY_TYPE.set(type, { fam, traits });
  }
}

export function familyOf(type) {
  const e = BY_TYPE.get(type);
  return e ? { fam: e.fam, traits: { ...e.traits } } : null;
}

export function isFamilyMember(type) { return BY_TYPE.has(type); }

// Pièce concrète d'une combinaison exacte (ou null).
export function resolve(fam, traits) {
  const F = FAMILIES[fam];
  if (!F) return null;
  for (const [type, tr] of Object.entries(F.members)) if (F.traits.every((t) => tr[t.id] === traits[t.id])) return type;
  return null;
}

// Valeurs de `traitId` qui existent avec les autres caractéristiques actuelles.
export function validValues(fam, traits, traitId) {
  const F = FAMILIES[fam];
  const ok = new Set();
  for (const tr of Object.values(F.members)) {
    if (F.traits.every((t) => t.id === traitId || tr[t.id] === traits[t.id])) ok.add(tr[traitId]);
  }
  return ok;
}

// Change une caractéristique ; si la combinaison n'existe pas, on garde la valeur choisie et on adapte le moins possible les autres.
export function withTrait(fam, traits, traitId, value) {
  const F = FAMILIES[fam];
  const want = { ...traits, [traitId]: value };
  let best = null, bestScore = -1;
  for (const [type, tr] of Object.entries(F.members)) {
    if (tr[traitId] !== value) continue;
    let score = 0;
    for (const t of F.traits) if (tr[t.id] === want[t.id]) score++;
    if (score > bestScore) { best = type; bestScore = score; }
  }
  return best;
}

// Famille dont on affiche la fiche dans la palette pour un outil donné (type concret ou id de famille).
export const FAMILY_DEFAULT = { straight: 'straight', turn: 'curve', courbe: 'cv1', loop: 'loop' };

// Pièces concrètes qu'on ne propose plus telles quelles dans la palette (remplacées par une famille ou une option).
export const REPLACED_BY_OPTION = new Set(['checkpoint', 'cpRing', 'cpCurve']);
