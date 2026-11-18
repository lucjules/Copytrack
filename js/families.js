// Familles de pièces et « caractéristiques » (Phase 2).
//
// Le circuit sérialise toujours un TYPE CONCRET de pièce (PIECE_ORDER) : c'est ce qui garde les anciens codes lisibles.
// Une famille est une couche d'édition par-dessus : chaque pièce concrète y est décrite par des valeurs de caractéristiques
// (liste déroulante, réglage…) et l'éditeur / l'inspecteur ne manipulent que ces caractéristiques ; `resolve()` les traduit
// en type concret, `familyOf()` fait le chemin inverse (un ancien circuit « Pente » s'affiche donc « Ligne droite · inclinaison 1 »).
//
// Une caractéristique : { id, label, values: [[valeur, texte], …] } ; valeurs en chaînes.
// Une combinaison absente de `members` n'existe pas : l'interface la grise (ex. virage serré relevé).
import { PIECES, ROLL_PASSAGES, ROLL_PASSAGES45, ROLL_PASSAGES90D, ORIENTS } from './pieces.js';

// Inclinaisons proposées (niveaux gagnés sur la pièce ; négatif : la pièce DESCEND, 0.9.3). Même liste pour la ligne droite et le virage.
const INCL = [['-4', 'Descente 4'], ['-2', 'Descente 2'], ['-1', 'Descente 1'], ['-0.5', 'Descente ½'], ['0', 'Plat'], ['0.5', 'Montée ½'], ['1', 'Montée 1'], ['2', 'Montée 2'], ['4', 'Montée 4']];
const rtag = (r) => String(r).replace('-', '').replace('0.5', '05');
const RISES = [0.5, 1, 2, 4];
// 0.12.0 : largeur de la route, caractéristique commune à la ligne droite, à la courbe et au virage.
const WIDTH = { id: 'w', label: 'Largeur', values: [['N', 'Normale (24 m)'], ['n', 'Étroite (12 m)'], ['w', 'Large (56 m)']] };
// Virages : rayons (préfixe des types), et types plats (types d'origine, étroits et larges).
const TURN_TAG = { s: '', m: 'Big', l: 'Huge', xl: 'Giant' };
const TURN_FLAT = { s: 'curve', m: 'bigcurve', l: 'hugecurve', xl: 'giantcurve' };
// Virages inclinés d'une largeur (préfixe '' normale, 'n' étroite, 'w' large) et d'un rayon : montée / descente × ↱ / ↰ × ½ à 4.
const inclinedTurns = (pre, w, size) => RISES.flatMap((r) => [
  [`${pre}cv${TURN_TAG[size]}${rtag(r)}`, { w, size, bank: '0', incl: String(r), dir: 'R' }], [`${pre}cv${TURN_TAG[size]}L${rtag(r)}`, { w, size, bank: '0', incl: String(r), dir: 'L' }],
  [`${pre}cvd${TURN_TAG[size]}${rtag(r)}`, { w, size, bank: '0', incl: String(-r), dir: 'R' }], [`${pre}cvd${TURN_TAG[size]}L${rtag(r)}`, { w, size, bank: '0', incl: String(-r), dir: 'L' }],
]);

export const FAMILIES = {
  straight: {
    label: 'Ligne droite',
    hint: 'Route droite, plate ou en pente : montée ou descente de ½, 1, 2 ou 4 niveaux par case. Étroite (12 m), normale (24 m) ou large (56 m, 3×3 : en montée 1 elle gagne 3 niveaux). L’orientation (sol, mur, plafond) se règle dans les réglages de la pièce.',
    icon: 'straight',
    traits: [WIDTH, { id: 'incl', label: 'Inclinaison', values: INCL }],
    members: {
      straight: { w: 'N', incl: '0' }, gentle: { w: 'N', incl: '0.5' }, slope: { w: 'N', incl: '1' }, steep: { w: 'N', incl: '2' }, steep4: { w: 'N', incl: '4' },
      dn05: { w: 'N', incl: '-0.5' }, dn1: { w: 'N', incl: '-1' }, dn2: { w: 'N', incl: '-2' }, dn4: { w: 'N', incl: '-4' },
      // 0.12.0 : la largeur devient une caractéristique de la ligne droite (avant : famille Largeur, plate seulement).
      narrow: { w: 'n', incl: '0' }, wide: { w: 'w', incl: '0' },
      ...Object.fromEntries(['n', 'w'].flatMap((w) => RISES.flatMap((r) => [[`${w}slU${rtag(r)}`, { w, incl: String(r) }], [`${w}slD${rtag(r)}`, { w, incl: String(-r) }]]))),
    },
  },
  // 0.9.2 : l'Inclinaison du virage fonctionne comme celle de la ligne droite (les anciennes « Courbes » montantes en font partie).
  // L'orientation ne compte que pour un virage incliné : il monte dans son sens de parcours (↱ : à droite, ↰ : à gauche).
  turn: {
    label: 'Virage',
    hint: 'Serré, grand, très grand ou géant ; plat, relevé ou incliné ; étroit, normal ou large. Pas de virage serré relevé (il ne se prend pas assez vite pour que le relevé serve) ni large (rayon 16 m, plus petit que la demi-largeur de la route large) ; le relevé n’existe qu’en largeur normale.',
    icon: 'curve',
    traits: [
      WIDTH,
      { id: 'size', label: 'Rayon', values: [['s', 'Serré'], ['m', 'Grand'], ['l', 'Très grand'], ['xl', 'Géant']] },
      { id: 'bank', label: 'Profil', values: [['0', 'Plat'], ['1', 'Relevé']] },
      { id: 'incl', label: 'Inclinaison', values: INCL },
      { id: 'dir', label: 'Sens', values: [['R', 'Droite ↱'], ['L', 'Gauche ↰']] },
    ],
    members: {
      // Plats (un virage plat à gauche est le même que celui de droite, tourné : il n'a que le sens « droite »)
      curve: { w: 'N', size: 's', bank: '0', incl: '0', dir: 'R' }, bigcurve: { w: 'N', size: 'm', bank: '0', incl: '0', dir: 'R' }, hugecurve: { w: 'N', size: 'l', bank: '0', incl: '0', dir: 'R' }, giantcurve: { w: 'N', size: 'xl', bank: '0', incl: '0', dir: 'R' },
      bank: { w: 'N', size: 'm', bank: '1', incl: '0', dir: 'R' }, bankBig: { w: 'N', size: 'l', bank: '1', incl: '0', dir: 'R' }, bankGiant: { w: 'N', size: 'xl', bank: '1', incl: '0', dir: 'R' },
      // Inclinés, largeur normale : serré et grand (0.9.2-0.9.3), géant (0.11.4), très grand (0.12.0)
      ...Object.fromEntries(['s', 'm', 'l', 'xl'].flatMap((size) => inclinedTurns('', 'N', size))),
      // 0.12.0 : relevés inclinés (hélice relevée)
      ...Object.fromEntries([['bank', 'm'], ['bankBig', 'l'], ['bankGiant', 'xl']].flatMap(([b, size]) => RISES.flatMap((r) => [
        [`${b}U${rtag(r)}`, { w: 'N', size, bank: '1', incl: String(r), dir: 'R' }], [`${b}UL${rtag(r)}`, { w: 'N', size, bank: '1', incl: String(r), dir: 'L' }],
        [`${b}D${rtag(r)}`, { w: 'N', size, bank: '1', incl: String(-r), dir: 'R' }], [`${b}DL${rtag(r)}`, { w: 'N', size, bank: '1', incl: String(-r), dir: 'L' }],
      ]))),
      // 0.12.0 : virages étroits (tous les rayons) et larges (sauf serré), plats et inclinés
      ...Object.fromEntries([['n', ['s', 'm', 'l', 'xl']], ['w', ['m', 'l', 'xl']]].flatMap(([w, sizes]) => sizes.flatMap((size) => [
        [w + TURN_FLAT[size], { w, size, bank: '0', incl: '0', dir: 'R' }], ...inclinedTurns(w, w, size),
      ]))),
    },
  },
  // 0.9.2 : la Courbe est une rampe dont le profil se courbe progressivement. 0.9.3 : elle se décline en montée ou en descente et en
  // trois raccords : début doux (plat → pente), fin douce (pente → plat) et en S (plat → plat, entre deux niveaux). Une « Courbe »
  // à début doux d'inclinaison ½ / 1 / 2 se raccorde exactement à une droite d'inclinaison 1 / 2 / 4 ; la fin douce la ramène à plat.
  courbe: {
    label: 'Courbe',
    hint: 'Raccord de pente qui se courbe : début doux (plat → pente), fin douce (pente → plat) ou en S (plat → plat). Montée ou descente ; étroite, normale ou large (3×3, pente comme la ligne droite large).',
    icon: 'courbe',
    traits: [
      WIDTH,
      { id: 'sens', label: 'Sens', values: [['u', 'Montée ↗'], ['d', 'Descente ↘']] },
      { id: 'incl', label: 'Inclinaison', values: [['0.5', '½'], ['1', '1'], ['2', '2'], ['4', '4']] },
      { id: 'prof', label: 'Raccord', values: [['i', 'Début doux'], ['o', 'Fin douce'], ['s', 'En S']] },
    ],
    // (ids : crv / cro / crs = montée début doux / fin douce / S ; cdi / cdo / cds = descente ; préfixe n ou w = étroite ou large)
    members: Object.fromEntries(['N', 'n', 'w'].flatMap((w) => [['crv', 'u', 'i'], ['cro', 'u', 'o'], ['crs', 'u', 's'], ['cdi', 'd', 'i'], ['cdo', 'd', 'o'], ['cds', 'd', 's']]
      .flatMap(([pre, sens, prof]) => RISES.map((r) => [`${w === 'N' ? '' : w}${pre}${rtag(r)}`, { w, sens, incl: String(r), prof }])))),
  },
  // 0.9.3 : transitions d'orientation (sol, mur gauche, mur droit, plafond). La route bascule autour de son axe d'une orientation à
  // l'autre ; « franche » : 1 case, « douce » : 2×2 (deux fois moins de roulis par mètre). Une ligne droite ou un virage prend ensuite
  // l'orientation d'arrivée (option Orientation). La gravité ne change pas : sur un mur il faut de la vitesse pour tenir (≈ 80 km/h).
  roll: {
    label: 'Transition',
    hint: 'Fait basculer la route d’une orientation à l’autre, de 45° (une case, progressive) ou de 90° (franche sur une case, douce sur 2×2). Pour 135° ou 180°, enchaîner deux transitions. Il faut de la vitesse sur un mur.',
    icon: 'roll',
    traits: [
      { id: 'de', label: 'De', values: ORIENTS.map((o) => [String(o.id), o.label]) },
      { id: 'vers', label: 'Vers', values: ORIENTS.map((o) => [String(o.id), o.label]) },
      { id: 'forme', label: 'Passage', values: [['s', 'Franc (1 case)'], ['l', 'Doux (2×2)']] },
    ],
    // 0.12.0 : avec les transitions de 45° (une case, déjà progressives : pas de forme douce) et les 90° entre orientations inclinées.
    members: Object.fromEntries([
      ...['s', 'l'].flatMap((forme) => [...ROLL_PASSAGES, ...ROLL_PASSAGES90D].map((pas) => [`tr${pas}${forme}`, { de: pas[0], vers: pas[1], forme }])),
      ...ROLL_PASSAGES45.map((pas) => [`tr${pas}s`, { de: pas[0], vers: pas[1], forme: 's' }]),
    ]),
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
  // 0.9.68 : chicane (courbe en S latérale) : la route se décale d'une ou deux colonnes sans changer de cap. Plus elle est longue, plus elle est rapide.
  chicane: {
    label: 'Chicane',
    hint: 'Courbe en S : la route se décale d’une ou deux colonnes sans changer de cap. Courte (2×2), longue (3×3) ou rapide (4×4). Le décalage de deux colonnes demande une chicane longue ou rapide (sur 2 cases, ce serait deux quarts de tour).',
    icon: 'sbend',
    traits: [
      { id: 'len', label: 'Longueur', values: [['2', 'Courte (2 cases)'], ['3', 'Longue (3 cases)'], ['4', 'Rapide (4 cases)']] },
      { id: 'shift', label: 'Décalage', values: [['1', '1 colonne'], ['2', '2 colonnes']] },
      { id: 'dir', label: 'Sens', values: [['R', 'Vers la droite →'], ['L', 'Vers la gauche ←']] },
    ],
    members: {
      sbend: { len: '2', shift: '1', dir: 'R' }, sbendL: { len: '2', shift: '1', dir: 'L' },
      sbendLong: { len: '3', shift: '1', dir: 'R' }, sbendLongL: { len: '3', shift: '1', dir: 'L' },
      sbendFast: { len: '4', shift: '1', dir: 'R' }, sbendFastL: { len: '4', shift: '1', dir: 'L' },
      sbendWide: { len: '3', shift: '2', dir: 'R' }, sbendWideL: { len: '3', shift: '2', dir: 'L' },
      sbendFastWide: { len: '4', shift: '2', dir: 'R' }, sbendFastWideL: { len: '4', shift: '2', dir: 'L' },      // (0.12.0)
    },
  },
  // 0.9.69 : plaques (surfaces libres) : carré, triangle ou quart de disque, de 1 à 3 cases ; la plateforme est la plaque carrée 1×1.
  plaque: {
    label: 'Plaque',
    hint: 'Surface libre, sans route : carrée, triangulaire ou en quart de disque, de 1 à 3 cases. Bordures au choix (Options, ou bord par bord dans l’Inspecteur).',
    icon: 'platform',
    traits: [
      { id: 'forme', label: 'Forme', values: [['sq', 'Carrée'], ['tri', 'Triangle'], ['sec', 'Quart de disque']] },
      { id: 'taille', label: 'Taille', values: [['1', '1 case'], ['2', '2×2'], ['3', '3×3']] },
    ],
    members: {
      platform: { forme: 'sq', taille: '1' }, plate2: { forme: 'sq', taille: '2' }, plate3: { forme: 'sq', taille: '3' },
      tri1: { forme: 'tri', taille: '1' }, tri2: { forme: 'tri', taille: '2' }, tri3: { forme: 'tri', taille: '3' },
      sec1: { forme: 'sec', taille: '1' }, sec2: { forme: 'sec', taille: '2' }, sec3: { forme: 'sec', taille: '3' },
    },
  },
  // 0.9.70 : largeur de la route. 0.12.0 : la largeur est une caractéristique de la ligne droite, de la courbe et du virage ; cette famille ne garde que les
  // raccords en biais entre largeurs (posés à l'envers, ils font l'inverse), et gagne celui qui manquait, de l'étroite à la large.
  largeur: {
    label: 'Changement de largeur',
    hint: 'Raccords en biais entre deux largeurs de route. Tourné d’un demi-tour, un rétrécissement élargit (et inversement).',
    icon: 'narrow',
    traits: [{ id: 'w', label: 'Raccord', values: [['ni', 'Normale → étroite (24 → 12 m)'], ['wi', 'Normale → large (24 → 56 m)'], ['nw', 'Étroite → large (12 → 56 m)']] }],
    members: { narrowIn: { w: 'ni' }, wideIn: { w: 'wi' }, wideInN: { w: 'nw' } },
  },
  // 0.9.71 : carrefours au même niveau : croisement (4 bras) ou T (3 bras ; la pièce tourne pour mettre la branche où l'on veut).
  carrefour: {
    label: 'Carrefour',
    hint: 'Croisement (4 bras) ou carrefour en T (3 bras), au même niveau. Un circuit peut repasser par un croisement (circuit en 8).',
    icon: 'cross',
    traits: [{ id: 'forme', label: 'Forme', values: [['x', 'Croisement'], ['t', 'En T']] }],
    members: { cross: { forme: 'x' }, tee: { forme: 't' } },
  },
  // 0.12.0 : les pièces qui allaient par paires (droite / gauche) ou par séries se rangent aussi en familles : une carte par sorte de pièce dans la palette.
  tube: {
    label: 'Tube',
    hint: 'Tube fermé où l’on roule sur la paroi et au plafond : entrée, sections à enchaîner, virage (rayon 48 m), ou tube 2×2 d’un seul tenant. La sortie est une entrée tournée d’un demi-tour.',
    icon: 'tube',
    traits: [{ id: 'forme', label: 'Pièce', values: [['in', 'Entrée / sortie'], ['mid', 'Section'], ['turn', 'Virage'], ['full', 'Tube 2×2']] }, { id: 'dir', label: 'Sens', values: [['R', 'Droite ↱'], ['L', 'Gauche ↰']] }],
    members: { tubeIn: { forme: 'in', dir: 'R' }, tubeMid: { forme: 'mid', dir: 'R' }, tubeTurn: { forme: 'turn', dir: 'R' }, tubeTurnL: { forme: 'turn', dir: 'L' }, tube: { forme: 'full', dir: 'R' } },
  },
  vertical: {
    label: 'Looping modulaire',
    hint: 'Montée en L vers un mur vertical, autant de murs que voulu, puis un sommet : le sommet du L fait sauter vers le plateau, le sommet de looping redescend une colonne à côté.',
    icon: 'ramp90',
    traits: [{ id: 'forme', label: 'Pièce', values: [['ramp', 'Montée en L'], ['wall', 'Mur vertical'], ['crest', 'Sommet du L (saut)'], ['top', 'Sommet de looping']] }, { id: 'dir', label: 'Sens', values: [['R', 'Droite ↱'], ['L', 'Gauche ↰']] }],
    members: { ramp90: { forme: 'ramp', dir: 'R' }, wall: { forme: 'wall', dir: 'R' }, crest90: { forme: 'crest', dir: 'R' }, loopTop: { forme: 'top', dir: 'R' }, loopTopL: { forme: 'top', dir: 'L' } },
  },
  cork: {
    label: 'Tire-bouchon',
    hint: 'Hélice autour d’un axe parallèle à la route : un tour complet, il faut de la vitesse. La vrille (demi-tour de roulis) est une pièce à part.',
    icon: 'cork',
    traits: [{ id: 'dir', label: 'Sens', values: [['R', 'Horaire ↻'], ['L', 'Anti-horaire ↺']] }],
    members: { cork: { dir: 'R' }, corkL: { dir: 'L' } },
  },
  fork: {
    label: 'Bifurcation',
    hint: 'Une entrée et deux sorties ; tournée d’un demi-tour, deux entrées et une sortie. Voie directe et voie déportée, chacune avec son revêtement.',
    icon: 'fork',
    traits: [{ id: 'dir', label: 'Voie déportée', values: [['R', 'À droite ⑂→'], ['L', 'À gauche ←⑂']] }],
    members: { fork: { dir: 'R' }, forkL: { dir: 'L' } },
  },
};
export const FAMILY_ORDER = ['straight', 'turn', 'chicane', 'courbe', 'largeur', 'roll', 'loop', 'vertical', 'cork', 'tube', 'fork', 'plaque', 'carrefour'];

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


// 0.12.0 : pourquoi une combinaison n'a pas de pièce ('' : elle en a une). Chaque famille a toutes ses combinaisons, sauf celles écartées ici, chacune avec
// sa raison (affichée par l'éditeur sur un choix grisé ; tools/test-familles-completes.mjs vérifie qu'aucune combinaison n'est sans pièce ni raison).
const ROLL_ANG = { 0: 0, 4: 45, 1: 90, 6: 135, 3: 180, 7: 225, 2: 270, 5: 315 };
const SYMMETRIC = 'Pièce symétrique : la même dans les deux sens (pivote-la au besoin).';
export function missingReason(fam, tr) {
  if (resolve(fam, tr)) return '';
  if (fam === 'turn') {
    if (tr.w === 'w' && tr.size === 's') return 'Pas de virage serré en route large : son rayon (16 m) est plus petit que la demi-largeur de la route large (28 m).';
    if (tr.bank === '1' && tr.size === 's') return 'Pas de virage serré relevé : il ne se prend jamais assez vite pour que le relevé serve.';
    if (tr.bank === '1' && tr.w !== 'N') return 'Le virage relevé n’existe qu’en largeur normale : sa chaussée penchée suppose 24 m.';
    if (tr.incl === '0' && tr.dir === 'L') return 'Un virage plat à gauche est le virage à droite tourné : choisis « Droite » et pivote la pièce (R).';
  }
  if (fam === 'chicane' && tr.len === '2' && tr.shift === '2') return 'Pas de décalage de deux colonnes sur 2 cases : ce serait deux quarts de tour, pas une chicane.';
  if (fam === 'roll') {
    if (tr.de === tr.vers) return 'De et vers : même orientation, rien à faire basculer.';
    const d = Math.abs(ROLL_ANG[tr.de] - ROLL_ANG[tr.vers]) % 360, gap = Math.min(d, 360 - d);
    if (gap > 90) return 'Pas de passage direct de 135° ou 180° : enchaîne deux transitions.';
    if (gap === 45 && tr.forme === 'l') return 'Une transition de 45° tient sur une case et elle est déjà progressive : pas de forme douce.';
  }
  if ((fam === 'vertical' && tr.forme !== 'top') || (fam === 'tube' && tr.forme !== 'turn')) { if (tr.dir === 'L') return SYMMETRIC; }
  return '';
}

// Pièces concrètes qu'on ne propose plus telles quelles dans la palette (remplacées par une famille ou une option).
export const REPLACED_BY_OPTION = new Set(['checkpoint', 'cpRing', 'cpCurve']);
