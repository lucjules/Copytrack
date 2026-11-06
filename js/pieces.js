// Définition des pièces de circuit, des revêtements et de leur géométrie
// "analytique" (utilisée à la fois par la physique et par les maillages).
//
// Repère local d'une pièce : la route d'une pièce droite va du bord sud (+z)
// vers le bord nord (-z). Un virage entre par le sud et sort par l'est
// (virage à droite). La rotation r (0..3) oriente le nord local vers la
// direction de grille r.
//
// Types de pièces :
//  line / arc / area : sol « classique » (physique au sol)
//  loop              : deux voies d'accès au sol + un ruban (looping)
//  ribbon            : tout un ruban 3D (vrille, quart de cercle, mur, sommet,
//                      virage relevé, tube, tire-bouchon)
//  fork              : bifurcation (une entrée, deux sorties) au sol
//  ring              : anneau flottant (turbo ou checkpoint aérien)
// Une pièce line/arc peut aussi être posée « à l'envers » (drapeau v) : elle
// devient alors un ruban au plafond.
import { CELL, HALF, LEVEL_H, ROAD_TOP, LOOP_R, LOOP_LANE, ROAD_HALF, RAIL_W, SURF_PHYS, WORLD_SCALE } from './constants.js';

// 0.9.11 : les pièces ne sont plus écrites en mètres fixes mais en proportion de la case (CELL = 24 m avant la 0.9.11, 32 m depuis) : K = 1 reproduit l'ancien monde.
const K = WORLD_SCALE;

export const PIECES = {
  straight:   { label: 'Ligne droite', kind: 'line', size: 1, rise: 0 },
  curve:      { label: 'Virage serré', kind: 'arc', size: 1, rise: 0 },
  bigcurve:   { label: 'Grand virage', kind: 'arc', size: 2, rise: 0 },
  slope:      { label: 'Pente', kind: 'line', size: 1, rise: 1 },
  steep:      { label: 'Tremplin', kind: 'line', size: 1, rise: 2 },
  checkpoint: { label: 'Checkpoint', kind: 'line', size: 1, rise: 0, special: 'checkpoint', clearance: 1 },
  start:      { label: 'Départ', kind: 'line', size: 1, rise: 0, special: 'start', clearance: 1 },
  finish:     { label: 'Arrivée', kind: 'line', size: 1, rise: 0, special: 'finish', clearance: 1 },
  platform:   { label: 'Plateforme', kind: 'area', size: 1, rise: 0 },
  loop:       { label: 'Looping ↱', kind: 'loop', size: 2, rise: 0, clearance: 5, mirror: 1, R: LOOP_R, lane: LOOP_LANE, turns: 1 },
  loopL:      { label: 'Looping ↰', kind: 'loop', size: 2, rise: 0, clearance: 5, mirror: -1, R: LOOP_R, lane: LOOP_LANE, turns: 1 },
  loopBig:    { label: 'Grand looping ↱', kind: 'loop', size: 3, rise: 0, clearance: 7, mirror: 1, R: 18 * K, lane: CELL, turns: 1 },
  loopBigL:   { label: 'Grand looping ↰', kind: 'loop', size: 3, rise: 0, clearance: 7, mirror: -1, R: 18 * K, lane: CELL, turns: 1 },
  loopDouble: { label: 'Double looping ↱', kind: 'loop', size: 3, rise: 0, clearance: 5, mirror: 1, R: 12 * K, lane: CELL, turns: 2 },
  loopDoubleL:{ label: 'Double looping ↰', kind: 'loop', size: 3, rise: 0, clearance: 5, mirror: -1, R: 12 * K, lane: CELL, turns: 2 },
  // Vrille : demi-tour de roulis sur 2 cases (comme le tire-bouchon : la route est dans la colonne de gauche de l'empreinte 2×2).
  // La route balance jusqu'à ±9 m autour de son axe : elle réserve 2 niveaux au-dessus d'elle.
  twist:      { label: 'Vrille', kind: 'ribbon', size: 2, rise: 0, clearance: 2 },
  ramp90:     { label: 'Montée en L', kind: 'ribbon', size: 1, rise: 1 },
  wall:       { label: 'Mur vertical', kind: 'ribbon', size: 1, rise: 0 },
  crest90:    { label: 'Sommet du L', kind: 'ribbon', size: 1, rise: 1 },
  // v1.5
  bank:       { label: 'Virage relevé', kind: 'ribbon', size: 2, rise: 0, clearance: 2, arc: true, bank: 0.42 },
  bankBig:    { label: 'Très grand virage relevé', kind: 'ribbon', size: 3, rise: 0, clearance: 2, arc: true, bank: 0.5 },
  tube:       { label: 'Tube', kind: 'ribbon', size: 2, rise: 0, clearance: 4 },
  // 0.7 : tube modulaire (entrée, sections à enchaîner, sortie = entrée retournée).
  tubeIn:     { label: 'Entrée de tube', kind: 'ribbon', size: 1, rise: 0, clearance: 4 },
  tubeMid:    { label: 'Section de tube', kind: 'ribbon', size: 1, rise: 0, clearance: 4, tubeSurf: true },
  cork:       { label: 'Tire-bouchon ↻', kind: 'ribbon', size: 2, rise: 0, clearance: 4, mirror: 1 },
  corkL:      { label: 'Tire-bouchon ↺', kind: 'ribbon', size: 2, rise: 0, clearance: 4, mirror: -1 },
  fork:       { label: 'Bifurcation ⑂→', kind: 'fork', size: 2, rise: 0, mirror: 1 },
  forkL:      { label: 'Bifurcation ←⑂', kind: 'fork', size: 2, rise: 0, mirror: -1 },
  ring:       { label: 'Anneau turbo', kind: 'ring', size: 1, rise: 0, clearance: 2 },
  cpRing:     { label: 'Checkpoint aérien', kind: 'ring', size: 1, rise: 0, clearance: 2, special: 'checkpoint' },
  cpCurve:    { label: 'Checkpoint en virage', kind: 'arc', size: 1, rise: 0, clearance: 1, special: 'checkpoint' },
  gentle:     { label: 'Pente douce (½ niveau)', kind: 'line', size: 1, rise: 0.5 },
  // Phase 2 : nouvelles pièces (ajoutées en fin de PIECE_ORDER, les anciens codes restent lisibles).
  steep4:     { label: 'Ligne droite · inclinaison 4', kind: 'line', size: 1, rise: 4 },
  hugecurve:  { label: 'Très grand virage plat', kind: 'arc', size: 3, rise: 0 },
  // « Courbe » : un tremplin courbé (virage montant). Serré = 1 case, grand = 2×2.
  cv05:       { label: 'Courbe serrée · inclinaison ½', kind: 'arc', size: 1, rise: 0.5 },
  cv1:        { label: 'Courbe serrée · inclinaison 1', kind: 'arc', size: 1, rise: 1 },
  cv2:        { label: 'Courbe serrée · inclinaison 2', kind: 'arc', size: 1, rise: 2 },
  cv4:        { label: 'Courbe serrée · inclinaison 4', kind: 'arc', size: 1, rise: 4 },
  cvBig05:    { label: 'Grande courbe · inclinaison ½', kind: 'arc', size: 2, rise: 0.5 },
  cvBig1:     { label: 'Grande courbe · inclinaison 1', kind: 'arc', size: 2, rise: 1 },
  cvBig2:     { label: 'Grande courbe · inclinaison 2', kind: 'arc', size: 2, rise: 2 },
  cvBig4:     { label: 'Grande courbe · inclinaison 4', kind: 'arc', size: 2, rise: 4 },
  // Versions gauche : une rampe courbe n'est pas symétrique (parcourue à l'envers elle descend), il faut donc un miroir.
  cvL05:      { label: 'Courbe serrée ↰ · inclinaison ½', kind: 'arc', size: 1, rise: 0.5, mirror: -1 },
  cvL1:       { label: 'Courbe serrée ↰ · inclinaison 1', kind: 'arc', size: 1, rise: 1, mirror: -1 },
  cvL2:       { label: 'Courbe serrée ↰ · inclinaison 2', kind: 'arc', size: 1, rise: 2, mirror: -1 },
  cvL4:       { label: 'Courbe serrée ↰ · inclinaison 4', kind: 'arc', size: 1, rise: 4, mirror: -1 },
  cvBigL05:   { label: 'Grande courbe ↰ · inclinaison ½', kind: 'arc', size: 2, rise: 0.5, mirror: -1 },
  cvBigL1:    { label: 'Grande courbe ↰ · inclinaison 1', kind: 'arc', size: 2, rise: 1, mirror: -1 },
  cvBigL2:    { label: 'Grande courbe ↰ · inclinaison 2', kind: 'arc', size: 2, rise: 2, mirror: -1 },
  cvBigL4:    { label: 'Grande courbe ↰ · inclinaison 4', kind: 'arc', size: 2, rise: 4, mirror: -1 },
  // Loopings à 2 et 3 boucles : le décalage latéral total (lane) est choisi pour garder ≥ 24 m entre deux tours.
  loopBigDouble:  { label: 'Grand looping ×2 ↱', kind: 'loop', size: 3, rise: 0, clearance: 7, mirror: 1, R: 18 * K, lane: CELL, turns: 2 },
  loopBigDoubleL: { label: 'Grand looping ×2 ↰', kind: 'loop', size: 3, rise: 0, clearance: 7, mirror: -1, R: 18 * K, lane: CELL, turns: 2 },
  loopTriple:     { label: 'Triple looping ↱', kind: 'loop', size: 4, rise: 0, clearance: 5, mirror: 1, R: 12 * K, lane: 1.5 * CELL, turns: 3 },
  loopTripleL:    { label: 'Triple looping ↰', kind: 'loop', size: 4, rise: 0, clearance: 5, mirror: -1, R: 12 * K, lane: 1.5 * CELL, turns: 3 },
  loopBigTriple:  { label: 'Grand looping ×3 ↱', kind: 'loop', size: 4, rise: 0, clearance: 7, mirror: 1, R: 18 * K, lane: 1.5 * CELL, turns: 3 },
  loopBigTripleL: { label: 'Grand looping ×3 ↰', kind: 'loop', size: 4, rise: 0, clearance: 7, mirror: -1, R: 18 * K, lane: 1.5 * CELL, turns: 3 },
  // « Courbe » (0.9.2) : une rampe dont le profil se courbe PROGRESSIVEMENT vers le haut. Plate à l'entrée (elle se raccorde à une route
  // plate sans cassure), de plus en plus raide ensuite : h(t) = rise · t² (Bézier quadratique, point de contrôle au ras du sol à l'entrée).
  // Pente en sortie = 2·rise / longueur ; parcourue à l'envers, elle descend et s'aplatit à l'arrivée (atterrissage en douceur).
  crv05:      { label: 'Courbe · inclinaison ½', kind: 'line', size: 1, rise: 0.5, curv: 1 },
  crv1:       { label: 'Courbe · inclinaison 1', kind: 'line', size: 1, rise: 1, curv: 1 },
  crv2:       { label: 'Courbe · inclinaison 2', kind: 'line', size: 1, rise: 2, curv: 1 },
  crv4:       { label: 'Courbe · inclinaison 4', kind: 'line', size: 1, rise: 4, curv: 1 },
  // Anciennes pièces à 90° (0.9.2) : elles ne sont plus posées (Track.normalize les convertit en pièce + orientation, voir LEGACY_TILE) ; leurs
  // définitions ne servent qu'à garder leur numéro dans PIECE_ORDER. `below` : niveaux réservés SOUS la pièce (la moitié basse du plan descend de 9 m).
  rollL:      { label: 'Transition côté ↰', kind: 'ribbon', size: 1, rise: 0, clearance: 2, below: 2, noRails: true },
  rollR:      { label: 'Transition côté ↱', kind: 'ribbon', size: 1, rise: 0, clearance: 2, below: 2, noRails: true },
  sideL:      { label: 'Ligne droite côté ↰', kind: 'ribbon', size: 1, rise: 0, clearance: 2, below: 2, noRails: true },
  sideR:      { label: 'Ligne droite côté ↱', kind: 'ribbon', size: 1, rise: 0, clearance: 2, below: 2, noRails: true },
};

// ---- 0.9.3 : pentes descendantes, raccords doux de pente, virages descendants, transitions d'orientation --------------------------
// Profil vertical d'une rampe : h(t) = rise · H(t), t = avancée 0..1 le long de la pièce, rise signé (négatif : la pièce DESCEND).
//   l : droite (pente constante)               i : entrée douce — plate au départ, de plus en plus raide (la pente finale vaut 2·rise / longueur)
//   o : sortie douce — raide au départ, plate à l'arrivée   s : en S — plate aux deux bouts (raccord entre deux niveaux)
// Une « entrée douce » de rise ½ / 1 / 2 se raccorde donc à une droite de pente 1 / 2 / 4 ; la « sortie douce » correspondante la ramène à plat.
const V_PROFILES = {
  l: { H: (t) => t, D: () => 1 },
  i: { H: (t) => t * t, D: (t) => 2 * t },
  o: { H: (t) => 2 * t - t * t, D: (t) => 2 - 2 * t },
  s: { H: (t) => t * t * (3 - 2 * t), D: (t) => 6 * t * (1 - t) },
};
export const profOf = (p) => p.prof || (p.curv ? 'i' : 'l');
export const profH = (p, t) => V_PROFILES[profOf(p)].H(t);
export const profD = (p, t) => V_PROFILES[profOf(p)].D(t);

const RISES = [0.5, 1, 2, 4];
const rtag = (r) => (r === 0.5 ? '05' : String(r));
const rtxt = (r) => (r === 0.5 ? '½' : String(r));
// Ordre figé de ces types (voir PIECE_ORDER) : ne jamais le modifier, seulement ajouter à la suite.
export const GEN_IDS = [];
const gen = (id, def) => { PIECES[id] = def; GEN_IDS.push(id); };
for (const r of RISES) gen('dn' + rtag(r), { label: `Pente descendante ${rtxt(r)}`, kind: 'line', size: 1, rise: -r });
for (const r of RISES) gen('cro' + rtag(r), { label: `Courbe · fin de montée ${rtxt(r)}`, kind: 'line', size: 1, rise: r, prof: 'o' });
for (const r of RISES) gen('cdi' + rtag(r), { label: `Courbe · début de descente ${rtxt(r)}`, kind: 'line', size: 1, rise: -r, prof: 'i' });
for (const r of RISES) gen('cdo' + rtag(r), { label: `Courbe · fin de descente ${rtxt(r)}`, kind: 'line', size: 1, rise: -r, prof: 'o' });
for (const r of [0.5, 1]) gen('crs' + rtag(r), { label: `Courbe en S · montée ${rtxt(r)}`, kind: 'line', size: 1, rise: r, prof: 's' });
for (const r of [0.5, 1]) gen('cds' + rtag(r), { label: `Courbe en S · descente ${rtxt(r)}`, kind: 'line', size: 1, rise: -r, prof: 's' });
// Virages descendants (serré 1 case, grand 2×2 ; ↱ / ↰) : l'inverse des virages montants.
for (const [pre, size, mir, lab] of [['cvd', 1, 1, 'serré'], ['cvdBig', 2, 1, 'grand'], ['cvdL', 1, -1, 'serré ↰'], ['cvdBigL', 2, -1, 'grand ↰']]) {
  for (const r of RISES) gen(pre + rtag(r), { label: `Virage descendant ${lab} · ${rtxt(r)}`, kind: 'arc', size, rise: -r, ...(mir < 0 ? { mirror: -1 } : {}) });
}

// Orientation d'une route : 0 sol, 1 mur gauche (le mur est à gauche du pilote : le toit de la voiture pointe vers la droite),
// 2 mur droit, 3 plafond (la route retournée : drapeau v, roulable en gravité inversée). Roulis autour de l'axe de la route :
// normale = cos ψ · (haut de la route) + sin ψ · (droite de la route), ψ = +90° pour un mur gauche, -90° pour un mur droit.
export const ORIENTS = [
  { id: 0, label: 'Sol' }, { id: 1, label: 'Mur gauche' }, { id: 2, label: 'Mur droit' }, { id: 3, label: 'Plafond' },
];
export const oriAngle = (code, other = 0) => (code === 1 ? Math.PI / 2 : code === 2 ? -Math.PI / 2 : code === 3 ? (other === 2 ? -Math.PI : Math.PI) : 0);
export const tileOri = (tile) => (tile.v ? 3 : (tile.o | 0));
// Passages d'une orientation à une autre : « 01 » = du sol au mur gauche… Franche : 1 case ; douce : 2×2 (la route dans la colonne de gauche).
export const ROLL_PASSAGES = ['01', '10', '02', '20', '13', '31', '23', '32'];
const ORI_NAME = ['sol', 'mur gauche', 'mur droit', 'plafond'];
for (const long of [false, true]) {
  for (const pas of ROLL_PASSAGES) {
    const a = +pas[0], b = +pas[1];
    gen(`tr${pas}${long ? 'l' : 's'}`, {
      label: `Transition ${ORI_NAME[a]} → ${ORI_NAME[b]}${long ? ' (douce 2×2)' : ''}`, kind: 'ribbon', size: long ? 2 : 1, rise: 0, clearance: 2, below: 2,
      roll: [a, b], rollLong: long, noRails: true,
      // Entre un mur et le plafond, la gravité suit la route (comme un revêtement « Inversion de gravité ») : sans cela la voiture
      // tomberait du plafond, ou resterait en gravité inversée en revenant sur le mur.
      ...(a === 3 || b === 3 ? { autoFlip: true } : {}),
    });
  }
}
// Anciens types de la 0.9.2 (routes « sur le côté ») : toujours lisibles, convertis à la lecture en pièce + orientation.
//   rollL / rollR : transitions sol → mur droit / gauche ;  sideL / sideR : ligne droite sur un mur droit / gauche.
export const LEGACY_TILE = {
  rollL: { t: 'tr02s' }, rollR: { t: 'tr01s' },
  sideL: { t: 'straight', o: 2 }, sideR: { t: 'straight', o: 1 },
};

// Rayon de l'anneau (turbo / checkpoint aérien) et hauteur de son centre au-dessus du niveau.
export const RING_R = 7;
export const RING_Y = 6;

// Anciennes pièces de la v1.0 devenues des revêtements sur une ligne droite.
export const LEGACY_SURFACE = { boost: 'boost', ice: 'ice' };
// Pièces retirées (gardées dans PIECE_ORDER pour lire les anciens codes) : remplacées.
export const LEGACY_PIECE = { halfpipe: 'straight' };

// Ordre utilisé pour la sérialisation : ne jamais réordonner, seulement ajouter.
export const PIECE_ORDER = [
  'straight', 'curve', 'bigcurve', 'slope', 'steep', 'boost',
  'checkpoint', 'start', 'finish', 'platform', 'ice', 'loop', 'loopL',
  'loopBig', 'loopBigL', 'loopDouble', 'loopDoubleL', 'twist', 'ramp90', 'wall', 'crest90',
  'bank', 'bankBig', 'halfpipe', 'tube', 'cork', 'corkL', 'fork', 'forkL', 'ring', 'cpRing', 'cpCurve', 'gentle',
  'tubeIn', 'tubeMid',
  // Phase 2 (à la suite : ne jamais réordonner)
  'steep4', 'hugecurve', 'cv05', 'cv1', 'cv2', 'cv4', 'cvBig05', 'cvBig1', 'cvBig2', 'cvBig4',
  'loopBigDouble', 'loopBigDoubleL', 'loopTriple', 'loopTripleL', 'loopBigTriple', 'loopBigTripleL',
  'cvL05', 'cvL1', 'cvL2', 'cvL4', 'cvBigL05', 'cvBigL1', 'cvBigL2', 'cvBigL4',
  // 0.9.2 (à la suite : ne jamais réordonner)
  'crv05', 'crv1', 'crv2', 'crv4', 'rollL', 'rollR', 'sideL', 'sideR',
  // 0.9.3 (à la suite : ne jamais réordonner ; l'ordre est celui de GEN_IDS, vérifié par les tests)
  ...GEN_IDS,
];

// Revêtements. def/min/max : paramètre en % (intensité). inv : autorisé à l'envers.
// flat : pièces plates uniquement. c : couleurs [faible, normal, fort].
export const SURFACES = {
  '':      { label: 'Normal' },
  ice:     { label: 'Verglas', param: 'Glisse', def: 100, min: 25, max: 200, c: ['#d7f1fb', '#a7e0f5', '#6cc8f0'] },
  boost:   { label: 'Accélérateur', param: 'Puissance', def: 100, min: 5, max: 200, inv: true, c: ['#3a7bff', '#36e9ff', '#fff25a'] },
  bounce:  { label: 'Rebond', param: 'Hauteur', def: 100, min: 30, max: 200, flat: true, c: ['#a05fff', '#ff5fd2', '#ff9f5f'] },
  // 0.9 : plus de réglage, l'aimant colle toujours au maximum.
  magnet:  { label: 'Aimant', c: ['#b48cff', '#b48cff', '#b48cff'] },
  drift:   { label: 'Dérive', param: 'Glisse', def: 100, min: 30, max: 200, c: ['#ffb84d', '#ff8c42', '#ff5a3c'] },
  slow:    { label: 'Ralentisseur', param: 'Freinage', def: 100, min: 30, max: 300, inv: true, c: ['#ffc84d', '#ff6b57', '#c4172e'] },
  wind:    { label: 'Vent latéral', param: '← Force →', def: 150, min: 1, max: 200, c: ['#7fe9ff', '#bfefff', '#ffffff'] },
  gravity: { label: 'Gravité', param: 'Gravité', def: 40, min: 15, max: 250, c: ['#7dffb2', '#a7ffe0', '#b06bff'] },
  moto:    { label: 'Plaque moto', c: ['#ff9f1c', '#ff9f1c', '#ff9f1c'] },
  // v1.5
  water:   { label: 'Eau', flat: true, c: ['#3fa7ff', '#3fa7ff', '#3fa7ff'] },
  boat:    { label: 'Plaque bateau', flat: true, c: ['#3fd0ff', '#3fd0ff', '#3fd0ff'] },
  glider:  { label: 'Plaque deltaplane', c: ['#f5f5f5', '#f5f5f5', '#f5f5f5'] },
  // 0.9 : inverse le sens de la gravité (une 2e plaque la remet à l'endroit).
  flip:    { label: 'Inversion de gravité', c: ['#ff4fd8', '#ff4fd8', '#ff4fd8'] },
  // Phase 3 : réglage de -200 à +200 km/h (p = 1 → -200, p = 101 → 0, p = 201 → +200 ; 2 km/h par cran).
  conveyor: { label: 'Tapis roulant', param: '↓ Vitesse ↑', def: 150, min: 1, max: 201, c: ['#ffd23e', '#ffd23e', '#ffd23e'] },
  spring:  { label: 'Ressort latéral', param: '← Force →', def: 150, min: 1, max: 200, c: ['#5dff8a', '#5dff8a', '#5dff8a'] },
  // Phase 3 : plus de vitesse mini. La dalle cède après `p` centièmes de seconde de contact cumulé (150 = 1,5 s), puis n'a plus de collision.
  glass:   { label: 'Verre fragile', param: 'Résiste', def: 150, min: 30, max: 500, inv: true, c: ['#d9f4ff', '#a8e4ff', '#6fcfff'] },
  powder:  { label: 'Poudreuse', param: 'Épaisseur', def: 100, min: 30, max: 250, inv: true, c: ['#ffffff', '#e4f1ff', '#bcd9ff'] },
  reverse: { label: 'Volant inversé', c: ['#c05fff', '#c05fff', '#c05fff'] },
  cut:     { label: 'Moteur coupé', c: ['#ff3b3b', '#ff3b3b', '#ff3b3b'] },
};
// Revêtements proposés dans l'éditeur (une seule entrée par revêtement : plus de doublons « Tapis roulant » / « Volant inversé »).
export const SURFACE_ORDER = ['', 'ice', 'boost', 'bounce', 'magnet', 'drift', 'slow', 'wind', 'gravity', 'moto', 'water', 'boat', 'glider', 'flip', 'conveyor', 'spring', 'glass', 'powder', 'reverse', 'cut'];
// Ordre de SÉRIALISATION des revêtements : ne jamais réordonner ni retirer, seulement ajouter (les anciens codes de circuit
// s'y réfèrent par numéro). « tread » et « invert » sont d'anciens doublons : on sait encore les lire, on ne les propose plus.
export const SURFACE_CODES = ['', 'ice', 'boost', 'bounce', 'sand', 'magnet', 'mud', 'drift', 'slow', 'wind', 'gravity', 'moto', 'water', 'boat', 'glider', 'flip', 'conveyor', 'tread', 'spring', 'glass', 'powder', 'reverse', 'invert', 'cut'];
export const SURFACE_ALIAS = { tread: 'conveyor', invert: 'reverse' };
// Plaques de transformation : véhicule obtenu (repasser sur la même plaque ramène la voiture).
export const PLATES = { moto: 'moto', boat: 'boat', glider: 'glider' };

export function tileParam(tile) {
  const S = SURFACES[tile.s];
  if (!S || S.def == null) return 100;
  return tile.p || S.def;
}

// Vitesse du tapis roulant (m/s, signée) pour un réglage p : -200 km/h à +200 km/h.
export const beltSpeed = (p) => ((p - 101) / 100) * SURF_PHYS.belt;
// Durée de contact cumulé (s) avant que le verre fragile ne cède.
export const glassSeconds = (p) => p / 100;
// Hauteur sous voûte d'un tunnel (m) au-dessus de la chaussée : le tunnel est fermé par des parois et un toit.
export const TUNNEL_TOP = ROAD_HALF + RAIL_W + 0.9;

// Valeur d'un réglage de revêtement avec une unité réelle quand elle existe (km/h, m/s², m, s), sinon en %.
const fmt1 = (x) => (Math.round(x * 10) / 10).toString().replace('.', ',');
export function paramText(s, p) {
  const S = SURFACES[s];
  if (!S || S.def == null) return '';
  const v = p || S.def;
  switch (s) {
    case 'conveyor': { const k = Math.round(2 * (v - 101)); return `${k > 0 ? '+' : ''}${k} km/h`; }
    case 'wind': { const a = ((v - 100) / 100) * SURF_PHYS.wind; return Math.abs(a) < 0.05 ? 'nul' : `${a > 0 ? '→' : '←'} ${fmt1(Math.abs(a))} m/s²`; }
    case 'spring': { const k = ((v - 100) / 100) * SURF_PHYS.spring * 3.6; return Math.abs(k) < 0.5 ? 'nulle' : `${k > 0 ? '→' : '←'} ${Math.round(Math.abs(k))} km/h`; }
    case 'glass': return `${fmt1(glassSeconds(v))} s`;
    case 'boost': return `jusqu'à ${Math.round((SURF_PHYS.maxSpeed + (SURF_PHYS.boostSpeed - SURF_PHYS.maxSpeed) * (v / 100)) * 3.6)} km/h`;
    case 'bounce': return `${fmt1((SURF_PHYS.bounce * (v / 100)) ** 2 / (2 * SURF_PHYS.gravity))} m`;
    case 'gravity': return `${fmt1(SURF_PHYS.gravity * (v / 100))} m/s²`;
    default: return `${v} %`;
  }
}

export function isRibbonKind(type) {
  const k = PIECES[type].kind;
  return k === 'ribbon' || k === 'loop';
}

// Route « sur le côté » : roulée à 90° autour de son axe (mur gauche / droit, ou transition d'orientation). La gravité ne change pas :
// l'appui vient de la vitesse (voir physics.js, SIDE_HOLD).
export function isSideTile(tile) {
  const p = PIECES[tile.t];
  return !!(tile.o || p.roll);
}

// Une ligne ou un virage posé sur un mur (tile.o) se parcourt en mode ruban, comme une transition.
export const isOriented = (tile) => !!tile.o && (PIECES[tile.t].kind === 'line' || PIECES[tile.t].kind === 'arc');

// Sol roulable (physique « au sol ») ? Les rubans, les routes sur un mur et les routes à l'envers ne le sont pas.
export function isFloor(tile) {
  const k = PIECES[tile.t].kind;
  return !tile.v && !tile.o && k !== 'ribbon' && k !== 'ring';
}

// Sol « au plafond » (pièce posée à l'envers) : roulable seulement en gravité inversée.
export function isCeilingFloor(tile) {
  const k = PIECES[tile.t].kind;
  return !!tile.v && !tile.o && k !== 'ribbon' && k !== 'ring';
}

// Pièce parcourue en mode ruban (au moins en partie) ?
export function isRibbon(tile) {
  return isRibbonKind(tile.t) || isOriented(tile);
}

// Sans bordures : choix de la pièce, pièces à plan vertical, ou route sur un mur (les rebords sortiraient sur le côté).
export const hasNoRails = (tile) => !!(tile.nb || tile.o || PIECES[tile.t].noRails);

// Options qui ne vont pas ensemble : { drapeau : [drapeaux incompatibles avec lui] } (relation symétrique ; le mouvement et le tunnel, eux, cohabitent).
// C'est la SEULE description de ces exclusions ; trois comportements s'en déduisent :
//   - flagAllowed : sur une pièce où l'un est déjà posé, l'autre est refusé ;
//   - Track.toggleFlag : le plafond (v) et l'orientation (o) retirent les incompatibles (le dernier choix l'emporte) ;
//   - armOption : avant la pose, chaque option choisie retire les incompatibles.
// Cas particulier : un checkpoint de valeur 2 (l'ancien anneau aérien) est aussi incompatible avec le plafond.
export const OPTION_CONFLICTS = {
  v: ['o', 'tn', 'mv', 'tb'],
  o: ['v', 'tn', 'mv', 'cp', 'tb'],
  tn: ['v', 'o', 'cp', 'tb'],
  mv: ['v', 'o', 'cp', 'tb'],
  cp: ['o', 'tn', 'mv', 'tb'],
  tb: ['v', 'o', 'tn', 'mv', 'cp'],
};
const hasConflict = (flag, tile) => !!tile && OPTION_CONFLICTS[flag].some((f) => tile[f]);

// Retire de `opts` (une pièce ou un jeu d'options) tout ce qui est incompatible avec `flag` : c'est ce que fait « le dernier choix l'emporte ».
// Un mouvement retiré perd aussi ses réglages (vitesse, amplitude) quand l'objet en porte.
export function clearConflicts(opts, flag) {
  for (const f of OPTION_CONFLICTS[flag] || []) {
    opts[f] = 0;
    if (f === 'mv' && 'ms' in opts) { opts.ms = 0; opts.ma = 0; }
  }
  if (flag === 'v' && opts.cp === 2) opts.cp = 0;            // l'anneau aérien ne va pas au plafond
  if (flag === 'cp' && opts.cp === 2) opts.v = 0;
  return opts;
}

// Options « armées » dans l'éditeur avant la pose (elles s'ajoutent à la pièce choisie, aperçu compris) : bascule l'option `flag` (valeur `val` pour les
// choix exclusifs : orientation, checkpoint, thème, mouvement) et retire ce qui lui est incompatible. Renvoie un nouvel objet.
export function armOption(opts, flag, val) {
  const o = { v: 0, o: 0, nb: 0, tn: 0, mv: 0, cp: 0, tb: 0, th: 0, ...opts };
  if (flag === 'o') {
    // Orientation : sol, mur gauche (1), mur droit (2) ; le plafond est le drapeau v. Un seul choix à la fois.
    o.o = val === 0 || o.o === val ? 0 : val;
    if (val === 0) o.v = 0;                                   // « Sol » : remet aussi la pièce à l'endroit
  } else {
    const bool = flag === 'v' || flag === 'nb' || flag === 'tn';
    if (bool) o[flag] = o[flag] ? 0 : 1; else o[flag] = o[flag] === val ? 0 : val;
  }
  if (o[flag]) clearConflicts(o, flag);
  return o;
}

// Drapeaux possibles : v (à l'envers), nb (sans bordures), tn (tunnel), mv (mouvement 1/2/3),
// cp (checkpoint : 1 portique, 2 anneau aérien), th (thème visuel).
export function flagAllowed(type, flag, tile = null, val = 0) {
  const p = PIECES[type];
  if (!p) return false;
  const lineLike = p.kind === 'line' || p.kind === 'arc';
  // 0.9 : toutes les pièces peuvent être posées à l'envers (retournées sous leur niveau).
  if (flag === 'v') return true;
  // Phase 2 : le thème est purement visuel, toute pièce de route en profite.
  if (flag === 'th') return p.kind !== 'ring';
  if (p.kind === 'ring' || p.kind === 'fork') return false;
  // 0.9.3 : orientation « mur gauche / droit » : une ligne ou un virage ordinaire peut être posé sur un mur (val 1 = gauche, 2 = droit).
  // Une route sur un mur n'a ni tunnel, ni checkpoint, ni anneau, ni mouvement, ni bordures ; le plafond (v) se choisit à part.
  if (flag === 'o') return lineLike && !p.special && !p.noRails && !hasConflict('o', tile);
  if (flag === 'nb') return !p.noRails && (lineLike && !p.special || (p.kind === 'ribbon' && !type.startsWith('tube')));
  if (flag === 'tn') return lineLike && !p.special && !hasConflict('tn', tile);
  // Pièce mobile : route « simple » (droite, virage, pente, plateforme), pas à l'envers, pas de checkpoint dessus.
  if (flag === 'mv') return (lineLike || p.kind === 'area') && !p.special && !hasConflict('mv', tile);
  // Checkpoint en option : sur une route plate (ligne ou virage) ; l'anneau aérien seulement sur une ligne droite à l'endroit.
  if (flag === 'cp') {
    // 0.9.2 : le checkpoint est une simple case à cocher (portique sur route, balise sur plateforme). L'ancien anneau aérien (val 2)
    // n'est plus proposé ; les anciens circuits qui l'utilisent continuent de fonctionner (voir cpKind).
    if (!((lineLike || p.kind === 'area') && !p.special && !p.rise) || hasConflict('cp', tile)) return false;
    if (val === 2) return p.kind === 'line' && !(tile && tile.v);
    return true;
  }
  // Anneau turbo en option (Phase 3) : comme le checkpoint aérien, sur une ligne droite plate à l'endroit.
  if (flag === 'tb') return p.kind === 'line' && !p.special && !p.rise && !hasConflict('tb', tile);
  return false;
}

// Genre de checkpoint d'une pièce : 'gate' (portique), 'ring' (anneau aérien) ou null.
// Les anciennes pièces « Checkpoint » restent valables ; la nouvelle manière est l'option cp.
export function cpKind(tile) {
  const P = PIECES[tile.t];
  if (P.special === 'checkpoint') return P.kind === 'ring' ? 'ring' : 'gate';
  if (tile.cp === 2 && P.kind === 'line') return 'ring';
  if (tile.cp === 1 && (P.kind === 'line' || P.kind === 'arc')) return 'gate';
  if (tile.cp === 1 && P.kind === 'area') return 'pad';       // plateforme : balise au sol (pas de sens de route pour un portique)
  return null;
}

// ---- Pièces mobiles : paramètres (vitesse en %, amplitude) ----------------------------------------------------
//  Ascenseur : monte de `amp` niveaux et redescend ; Glissière : se décale de `amp` cases ; Rotation : tourne de `amp` degrés
//  (360 = tour complet continu, sinon va-et-vient). `speed` : 100 % = la période de base ; négatif = sens inverse (rotation).
export const MOVER = {
  1: { label: 'Ascenseur', period: 6, speed: { def: 100, min: 25, max: 300 }, amp: { def: 2, min: 0.5, max: 8, step: 0.5, unit: ' niv.' } },
  2: { label: 'Glissière', period: 5, speed: { def: 100, min: 25, max: 300 }, amp: { def: 1, min: 0.5, max: 3, step: 0.5, unit: ' case(s)' } },
  3: { label: 'Rotation', period: 12, speed: { def: 100, min: -300, max: 300 }, amp: { def: 360, min: 45, max: 360, step: 45, unit: '°' } },
};
export function moverParams(tile, out = {}) {
  const M = MOVER[tile.mv];
  out.speed = M ? (tile.ms || M.speed.def) : 0;
  out.amp = M ? (tile.ma || M.amp.def) : 0;
  return out;
}
// Valeurs bornées (renvoie 0 = « valeur par défaut » pour garder les codes de circuit compacts).
export function clampMover(mv, ms, ma) {
  const M = MOVER[mv];
  if (!M) return { ms: 0, ma: 0 };
  let s = Math.round(+ms || 0), a = Math.round((+ma || 0) * 2) / 2;
  if (s) {
    const lo = M.speed.min < 0 ? -M.speed.max : M.speed.min;
    s = Math.max(lo, Math.min(M.speed.max, s));
    if (M.speed.min < 0 && Math.abs(s) < 25) s = s < 0 ? -25 : 25;
    if (s === M.speed.def) s = 0;
  }
  if (a) { a = Math.max(M.amp.min, Math.min(M.amp.max, a)); if (a === M.amp.def) a = 0; }
  return { ms: s, ma: a };
}

// Thèmes visuels d'une pièce (option « Thème », sans effet sur le jeu).
export const THEMES = [
  { id: 0, label: 'Classique' },
  { id: 1, label: 'Herbe' },
  { id: 2, label: 'Sable' },
  { id: 3, label: 'Roche' },
];

export function surfaceAllowed(type, s, o = 0) {
  if (!s) return true;
  const p = PIECES[type];
  const S = SURFACES[s];
  if (!p || !S) return false;
  return surfaceRule(p, S, s, o) === '';
}

// 0.9 : tous les revêtements vont sur toutes les pièces de route, sauf quelques cas
// physiquement impossibles. Renvoie '' si c'est permis, sinon la raison (tableau de
// compatibilité de l'éditeur). v (pièce à l'envers) ne change rien : au plafond, en
// gravité inversée, les revêtements marchent pareil.
export function surfaceRule(p, S, s, o = 0) {
  if (p.kind === 'ring') return 'pas de route dans un anneau';
  const curved = p.kind === 'loop' || p.kind === 'ribbon' || !!o;      // une route sur un mur n'est pas plate
  if (S.flat && (p.rise || curved)) return 'seulement sur du plat';
  // Phase 3 : l'eau va aussi sur le Départ (course commencée en bateau) ; la plaque bateau est elle-même sur l'eau.
  if (s === 'water' && (p.special === 'finish' || p.kind === 'fork')) return 'pas sur l’arrivée ni une bifurcation';
  return '';
}

export function baseY(tile) {
  return tile.l * LEVEL_H + ROAD_TOP;
}

export function tileCenter(tile, out = {}) {
  const h = PIECES[tile.t].size * HALF;
  out.x = tile.x * CELL + h;
  out.z = tile.z * CELL + h;
  return out;
}

const C = { x: 0, z: 0 };

// Monde -> local (position)
export function toLocal(tile, wx, wz, out) {
  tileCenter(tile, C);
  return toLocalVec(tile.r, wx - C.x, wz - C.z, out);
}

// Monde -> local (vecteur)
function toLocalVec(r, dx, dz, out) {
  switch (r & 3) {
    case 0: out.lx = dx; out.lz = dz; break;
    case 1: out.lx = dz; out.lz = -dx; break;
    case 2: out.lx = -dx; out.lz = -dz; break;
    default: out.lx = -dz; out.lz = dx;
  }
  return out;
}

// Local -> monde (vecteur)
export function rotVec(r, lx, lz, out) {
  switch (r & 3) {
    case 0: out.x = lx; out.z = lz; break;
    case 1: out.x = -lz; out.z = lx; break;
    case 2: out.x = -lx; out.z = -lz; break;
    default: out.x = lz; out.z = -lx;
  }
  return out;
}

export function localToWorld(tile, lx, lz, out = {}) {
  tileCenter(tile, C);
  const cx = C.x, cz = C.z;
  rotVec(tile.r, lx, lz, out);
  out.x += cx;
  out.z += cz;
  return out;
}

export function arcParams(p) {
  if (p.size === 1) return { cx: HALF, cz: HALF, R: HALF };
  if (p.size === 3) return { cx: CELL * 1.5, cz: CELL * 1.5, R: CELL * 2.5 };
  return { cx: CELL, cz: CELL, R: CELL * 1.5 };
}

// Échantillonne la géométrie au sol d'une pièce au point local (lx, lz).
//  d       : écart latéral signé par rapport à la ligne centrale
//  gx, gz  : gradient (local) de d
//  h       : altitude de la chaussée
//  n*      : normale locale de la chaussée
//  along   : progression 0..1 le long de la pièce
export function sampleLocal(tile, lx, lz, out) {
  const p = PIECES[tile.t];
  const half = p.size * HALF;
  out.inFootprint = lx >= -half && lx <= half && lz >= -half && lz <= half;
  const base = baseY(tile);
  out.nx = 0; out.ny = 1; out.nz = 0;
  out.h = base;
  out.gx = 1; out.gz = 0;
  if (p.kind === 'line') {
    const len = 2 * half;
    const rise = p.rise * LEVEL_H;
    let t = (half - lz) / len;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    out.d = lx;
    // Profil vertical (voir V_PROFILES) : droite, entrée douce, sortie douce ou S. Pente = rise · H'(t) / longueur.
    out.h = base + rise * profH(p, t);
    const k = rise * profD(p, t) / len;
    const inv = 1 / Math.sqrt(1 + k * k);
    out.ny = inv; out.nz = k * inv;
    out.along = t;
  } else if (p.kind === 'arc') {
    const a = arcParams(p);
    // Version gauche (mirror < 0) : on calcule dans le repère miroir (x -> -x) puis on retourne les vecteurs.
    const mir = p.mirror < 0 ? -1 : 1;
    const dx = mir * lx - a.cx, dz = lz - a.cz;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1e-6;
    out.d = dist - a.R; out.gx = (mir * dx) / dist; out.gz = dz / dist;
    let ang = Math.atan2(dz, dx);
    if (ang < 0) ang += Math.PI * 2;
    out.along = (ang - Math.PI) / (Math.PI / 2);
    if (p.rise) {
      // Courbe montante : l'altitude ne dépend que de l'angle (la chaussée est horizontale en travers, comme une rampe hélicoïdale).
      // Pente le long de la route = (dh/dθ) / rayon ; la normale se penche vers l'arrière de la marche.
      const t = out.along < 0 ? 0 : out.along > 1 ? 1 : out.along;
      const rise = p.rise * LEVEL_H;
      out.h = base + rise * t;
      const k = rise / ((Math.PI / 2) * dist);
      const inv = 1 / Math.sqrt(1 + k * k);
      const tx = -Math.sin(ang), tz = Math.cos(ang);
      out.nx = -mir * k * tx * inv; out.ny = inv; out.nz = -k * tz * inv;
    }
  } else if (p.kind === 'fork') {
    forkSample(p, lx, lz, out);
  } else if (p.kind === 'loop') {
    // Seules les deux voies d'accès au sol sont des surfaces « normales ».
    const lane = lz >= 0 ? -p.mirror * p.lane : p.mirror * p.lane;
    out.d = lx - lane;
    out.along = (half - lz) / (2 * half);
  } else {
    out.d = 0;
    out.along = (half - lz) / (2 * half);
  }
  return out;
}

// ---- Bifurcation -------------------------------------------------------------
// Pièce 2x2 : entrée au sud de la colonne gauche (x = -12, ou +12 en miroir).
// Branche A : tout droit. Branche B : glisse d'une colonne (S doux) vers l'autre côté.
const smoothF = (t) => t * t * (3 - 2 * t);
export function forkBranchX(p, t, branch) {
  const x0 = -p.mirror * HALF;
  return branch === 0 ? x0 : x0 + p.mirror * CELL * smoothF(t);
}
// Écart entre les deux lignes centrales à l'avancée t.
export function forkSep(t) {
  return CELL * smoothF(t);
}
function forkSample(p, lx, lz, out) {
  const half = p.size * HALF;
  let t = (half - lz) / (2 * half);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  out.along = t;
  const xa = forkBranchX(p, t, 0), xb = forkBranchX(p, t, 1);
  // Pente de la branche B (dérivée de x par rapport à -lz).
  const slope = p.mirror * CELL * 6 * t * (1 - t) / (2 * half);
  const cb = 1 / Math.sqrt(1 + slope * slope);
  const da = lx - xa, db = (lx - xb) * cb;
  const sep = forkSep(t);
  const between = (lx - xa) * (lx - xb) < 0;
  if (between && sep < 2 * 9 + 0.05) {
    // Les deux chaussées se touchent encore : tout l'entre-deux est de la route, sans muret.
    out.d = 0; out.gx = 1; out.gz = 0;
  } else if (Math.abs(da) <= Math.abs(db)) {
    out.d = da; out.gx = 1; out.gz = 0;
  } else {
    out.d = db; out.gx = cb; out.gz = slope * cb;
  }
  // Revêtement : la voie directe est dessinée PAR-DESSUS (la déportée est 8 cm plus bas). Tant que le point est sur la chaussée directe c'est
  // SON revêtement qui compte ; celui de la voie déportée ne commence que là où elle dépasse. (Avant : la voie « la plus proche » gagnait,
  // donc dès l'entrée de la pièce toute la moitié droite de la voie directe prenait le revêtement de la voie déportée.)
  out.branch = Math.abs(da) <= ROAD_HALF ? 0 : 1;
}

