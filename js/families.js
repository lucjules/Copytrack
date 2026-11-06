// Familles de pièces et « caractéristiques » (Phase 2).
//
// Le circuit sérialise toujours un TYPE CONCRET de pièce (PIECE_ORDER) : c'est ce qui garde les anciens codes lisibles.
// Une famille est une couche d'édition par-dessus : chaque pièce concrète y est décrite par des valeurs de caractéristiques
// (liste déroulante, réglage…) et l'éditeur / l'inspecteur ne manipulent que ces caractéristiques ; `resolve()` les traduit
// en type concret, `familyOf()` fait le chemin inverse (un ancien circuit « Pente » s'affiche donc « Ligne droite · inclinaison 1 »).
//
// Une caractéristique : { id, label, values: [[valeur, texte], …] } ; valeurs en chaînes.
// Une combinaison absente de `members` n'existe pas : l'interface la grise (ex. virage serré relevé).
import { PIECES, ROLL_PASSAGES, ORIENTS } from './pieces.js';

// Inclinaisons proposées (niveaux gagnés sur la pièce ; négatif : la pièce DESCEND, 0.9.3). Même liste pour la ligne droite et le virage.
const INCL = [['-4', 'Descente 4'], ['-2', 'Descente 2'], ['-1', 'Descente 1'], ['-0.5', 'Descente ½'], ['0', 'Plat'], ['0.5', 'Montée ½'], ['1', 'Montée 1'], ['2', 'Montée 2'], ['4', 'Montée 4']];
const rtag = (r) => String(r).replace('-', '').replace('0.5', '05');

export const FAMILIES = {
  straight: {
    label: 'Ligne droite',
    hint: 'Route droite, plate ou en pente : montée ou descente de ½, 1, 2 ou 4 niveaux. L’orientation (sol, mur, plafond) se règle dans Options.',
    icon: 'straight',
    traits: [{ id: 'incl', label: 'Inclinaison', values: INCL }],
    members: {
      straight: { incl: '0' }, gentle: { incl: '0.5' }, slope: { incl: '1' }, steep: { incl: '2' }, steep4: { incl: '4' },
      dn05: { incl: '-0.5' }, dn1: { incl: '-1' }, dn2: { incl: '-2' }, dn4: { incl: '-4' },
    },
  },
  // 0.9.2 : l'Inclinaison du virage fonctionne comme celle de la ligne droite (les anciennes « Courbes » montantes en font partie).
  // L'orientation ne compte que pour un virage incliné : il monte dans son sens de parcours (↱ : à droite, ↰ : à gauche).
  turn: {
    label: 'Virage',
    hint: 'Serré, grand ou très grand ; plat, relevé ou incliné.',
    icon: 'curve',
    traits: [
      { id: 'size', label: 'Rayon', values: [['s', 'Serré'], ['m', 'Grand'], ['l', 'Très grand']] },
      { id: 'bank', label: 'Profil', values: [['0', 'Plat'], ['1', 'Relevé']] },
      { id: 'incl', label: 'Inclinaison', values: INCL },
      { id: 'dir', label: 'Sens', values: [['R', 'Droite ↱'], ['L', 'Gauche ↰']] },
    ],
    members: {
      curve: { size: 's', bank: '0', incl: '0', dir: 'R' }, bigcurve: { size: 'm', bank: '0', incl: '0', dir: 'R' }, hugecurve: { size: 'l', bank: '0', incl: '0', dir: 'R' },
      bank: { size: 'm', bank: '1', incl: '0', dir: 'R' }, bankBig: { size: 'l', bank: '1', incl: '0', dir: 'R' },
      cv05: { size: 's', bank: '0', incl: '0.5', dir: 'R' }, cv1: { size: 's', bank: '0', incl: '1', dir: 'R' }, cv2: { size: 's', bank: '0', incl: '2', dir: 'R' }, cv4: { size: 's', bank: '0', incl: '4', dir: 'R' },
      cvBig05: { size: 'm', bank: '0', incl: '0.5', dir: 'R' }, cvBig1: { size: 'm', bank: '0', incl: '1', dir: 'R' }, cvBig2: { size: 'm', bank: '0', incl: '2', dir: 'R' }, cvBig4: { size: 'm', bank: '0', incl: '4', dir: 'R' },
      cvL05: { size: 's', bank: '0', incl: '0.5', dir: 'L' }, cvL1: { size: 's', bank: '0', incl: '1', dir: 'L' }, cvL2: { size: 's', bank: '0', incl: '2', dir: 'L' }, cvL4: { size: 's', bank: '0', incl: '4', dir: 'L' },
      cvBigL05: { size: 'm', bank: '0', incl: '0.5', dir: 'L' }, cvBigL1: { size: 'm', bank: '0', incl: '1', dir: 'L' }, cvBigL2: { size: 'm', bank: '0', incl: '2', dir: 'L' }, cvBigL4: { size: 'm', bank: '0', incl: '4', dir: 'L' },
      // 0.9.3 : virages descendants (la pièce descend dans son sens de parcours).
      ...Object.fromEntries([0.5, 1, 2, 4].flatMap((r) => [
        ['cvd' + rtag(r), { size: 's', bank: '0', incl: String(-r), dir: 'R' }], ['cvdBig' + rtag(r), { size: 'm', bank: '0', incl: String(-r), dir: 'R' }],
        ['cvdL' + rtag(r), { size: 's', bank: '0', incl: String(-r), dir: 'L' }], ['cvdBigL' + rtag(r), { size: 'm', bank: '0', incl: String(-r), dir: 'L' }],
      ])),
    },
  },
  // 0.9.2 : la Courbe est une rampe dont le profil se courbe progressivement. 0.9.3 : elle se décline en montée ou en descente et en
  // trois raccords : début doux (plat → pente), fin douce (pente → plat) et en S (plat → plat, entre deux niveaux). Une « Courbe »
  // à début doux d'inclinaison ½ / 1 / 2 se raccorde exactement à une droite d'inclinaison 1 / 2 / 4 ; la fin douce la ramène à plat.
  courbe: {
    label: 'Courbe',
    hint: 'Raccord de pente qui se courbe : début doux (plat → pente), fin douce (pente → plat) ou en S (plat → plat). Montée ou descente.',
    icon: 'courbe',
    traits: [
      { id: 'sens', label: 'Sens', values: [['u', 'Montée ↗'], ['d', 'Descente ↘']] },
      { id: 'incl', label: 'Inclinaison', values: [['0.5', '½'], ['1', '1'], ['2', '2'], ['4', '4']] },
      { id: 'prof', label: 'Raccord', values: [['i', 'Début doux'], ['o', 'Fin douce'], ['s', 'En S']] },
    ],
    members: {
      crv05: { sens: 'u', incl: '0.5', prof: 'i' }, crv1: { sens: 'u', incl: '1', prof: 'i' }, crv2: { sens: 'u', incl: '2', prof: 'i' }, crv4: { sens: 'u', incl: '4', prof: 'i' },
      cro05: { sens: 'u', incl: '0.5', prof: 'o' }, cro1: { sens: 'u', incl: '1', prof: 'o' }, cro2: { sens: 'u', incl: '2', prof: 'o' }, cro4: { sens: 'u', incl: '4', prof: 'o' },
      crs05: { sens: 'u', incl: '0.5', prof: 's' }, crs1: { sens: 'u', incl: '1', prof: 's' },
      cdi05: { sens: 'd', incl: '0.5', prof: 'i' }, cdi1: { sens: 'd', incl: '1', prof: 'i' }, cdi2: { sens: 'd', incl: '2', prof: 'i' }, cdi4: { sens: 'd', incl: '4', prof: 'i' },
      cdo05: { sens: 'd', incl: '0.5', prof: 'o' }, cdo1: { sens: 'd', incl: '1', prof: 'o' }, cdo2: { sens: 'd', incl: '2', prof: 'o' }, cdo4: { sens: 'd', incl: '4', prof: 'o' },
      cds05: { sens: 'd', incl: '0.5', prof: 's' }, cds1: { sens: 'd', incl: '1', prof: 's' },
    },
  },
  // 0.9.3 : transitions d'orientation (sol, mur gauche, mur droit, plafond). La route bascule autour de son axe d'une orientation à
  // l'autre ; « franche » : 1 case, « douce » : 2×2 (deux fois moins de roulis par mètre). Une ligne droite ou un virage prend ensuite
  // l'orientation d'arrivée (option Orientation). La gravité ne change pas : sur un mur il faut de la vitesse pour tenir (≈ 80 km/h).
  roll: {
    label: 'Transition',
    hint: 'Fait basculer la route d’une orientation à l’autre : du sol vers un mur, d’un mur vers le sol ou le plafond. Il faut de la vitesse sur un mur.',
    icon: 'roll',
    traits: [
      { id: 'de', label: 'De', values: ORIENTS.map((o) => [String(o.id), o.label]) },
      { id: 'vers', label: 'Vers', values: ORIENTS.map((o) => [String(o.id), o.label]) },
      { id: 'forme', label: 'Passage', values: [['s', 'Franc (1 case)'], ['l', 'Doux (2×2)']] },
    ],
    members: Object.fromEntries(['s', 'l'].flatMap((forme) => ROLL_PASSAGES.map((pas) => [`tr${pas}${forme}`, { de: pas[0], vers: pas[1], forme }]))),
  },
  loop: {
    label: 'Looping',
    hint: 'Boucle verticale : sens, taille, 1 à 3 boucles (l’empreinte grandit).',
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
  },
};
export const FAMILY_ORDER = ['straight', 'turn', 'courbe', 'roll', 'loop'];

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


// Pièces concrètes qu'on ne propose plus telles quelles dans la palette (remplacées par une famille ou une option).
export const REPLACED_BY_OPTION = new Set(['checkpoint', 'cpRing', 'cpCurve']);
