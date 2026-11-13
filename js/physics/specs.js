// Réglages des véhicules et des revêtements pour la physique (voiture, moto, bateau, deltaplane) : des nombres, aucune logique.
// Le modèle de pneus, de rubans et de collisions qui les utilise est dans physics.js et physics/.
import { SURF_PHYS, CAR_SCALE } from '../constants.js';
import { clamp } from '../mathutil.js';

export const CAR = {
  accel: SURF_PHYS.engineAccel,   // sous les gaz a = accel × (1 - (v / maxSpeed)^accelCurve)
  accelCurve: 2.5,    // plus c'est petit, plus la fin de la courbe est longue (version 1.0 : 1,5 -> 2,5 : la poussée tient jusqu'aux hautes vitesses ; 250 -> 280 km/h prenait 5,4 s, 2,1 s maintenant)
  maxSpeed: SURF_PHYS.maxSpeed,       // vitesse visée moteur (m/s)
  boostSpeed: SURF_PHYS.boostSpeed,
  boostAccel: SURF_PHYS.boostAccel,
  boostTime: SURF_PHYS.boostTime,
  brake: 52,
  reverseAccel: 15,
  reverseMax: 15,
  roll: 0,
  drag: 0,
  coast: 0.8,         // à vide : résistance constante (s'ajoute à coastDrag, proportionnelle à la vitesse)
  coastDrag: SURF_PHYS.coastDrag,
  // Châssis (modèle bicyclette)
  a: 1.35 * CAR_SCALE, // centre de gravité -> essieu avant (m)
  b: 1.4 * CAR_SCALE,  // centre de gravité -> essieu arrière (m)
  yawK: 1.9 * CAR_SCALE,   // inertie de lacet ramenée à la masse (m²) ; suit l'empattement : la voiture agrandie garde la même vivacité au volant
  corner: 230,        // rigidité de dérive d'un essieu (m/s² par rad)
  latGrip: 80,        // adhérence latérale totale (m/s²), partagée avant / arrière (0.9.11 : 56 -> 80, la voiture tient mieux dans les virages)
  frontShare: 0.42,   // part avant (0.9.11 : 0,48 -> 0,42 : l'arrière accroche plus que l'avant, la voiture PERD l'avant avant de partir en tête-à-queue : pardonne un volant tardif)
  steerMax: 0.65,     // angle de braquage maxi des roues (rad) à basse vitesse
  steerAlat: 52,      // l'angle utile diminue avec la vitesse (le volant reste précis)
  driftGrip: 0.5,    // part de l'adhérence latérale perdue par les deux essieux en plein dérapage : la glisse décrit un virage plus large et CONSERVE la vitesse (à 8 g d'adhérence, glisser de 20° coûtait 27 m/s²)
  driftRear: 0.6,     // adhérence arrière restante en plein dérapage, EN PLUS (l'arrière décroche avant l'avant : avant 0,65 seul)
  driftSteer: 1.4,    // braquage autorisé en plus pendant le dérapage (avant : 1,3) : de quoi contre-braquer
  driftMin: 12,       // vitesse mini (m/s) pour qu'un freinage en virage fasse déraper
  driftBrake: 0.9,    // part du freinage absorbée par la glisse quand on dérape (avant : 0,75, et le frein restait entier pendant toute la glisse en pratique)
  brakeCorner: 0.65,  // part du freinage perdue à plein volant et à vitesse (cercle de friction) : freiner pour décrocher ne coûte plus 150 → 23 km/h
  driftAngle: 0.22,   // angle de glisse (rad, 16°) tenu à plein volant pendant un dérapage ; le volant le règle (voir physics.js : _driftAssist)
  driftAssist: 30,    // raideur du pilotage de la glisse (rad/s² par rad d'écart)
  driftAssistMax: 14, //   … plafond (rad/s²)
  driftBuild: 8,      // vitesse d'établissement du dérapage (1 / s) : 0,125 s pour décrocher
  driftHold: 0.5,     // durée de vie de la glisse sans les gaz, volant tenu (1 / s)
  driftHoldGas: 0.12, //   … avec les gaz : la glisse se tient longtemps
  driftOut: 2.2,      // sortie de glisse volant relâché (1 / s) : l'arrière raccroche en ~0,5 s (avant : 3,5 /s)
  driftCounter: 3.0,  // sortie de glisse en contre-braquant (1 / s)
  yawDamp: 0.6,
  steerIn: 8,         // vitesse de braquage
  steerOut: 13,       // retour au centre
  gravity: SURF_PHYS.gravity,
  snap: 0.7,
  step: 1.6,
  kinkLaunch: 3.1,    // PHYS_VER 36 : cassure entre deux rubans (mur, plafond, looping) : vitesse (m/s) avec laquelle le ruban suivant se dérobe au-delà de laquelle la voiture décolle. = √(2 · g · susTravel) : la même cassure qu'au sol
  magnetRange: 4,     // aimant : portée de l'attraction au-dessus d'une route aimantée (m)
  magnetAcc: 80,      // ... et accélération maximale vers la route, le long de sa normale (m/s²)
  susTravel: 0.25,    // PHYS_VER 36 : détente de la suspension (m). Tant que la route ne s'est pas dérobée de plus que cela sous la voiture, les roues touchent (voir physics.js : _roadContact). Remplace `launch` (seuil de vitesse normale, 0,6 m/s)
  airPitchAcc: 4.2,  // vivacité du tangage en l'air (relative : la moto est plus vive, le deltaplane moins) ; gaz = nez plus bas, frein = nez plus haut
  airPitchDamp: 2.6, // amortissement de base (le ressort d'assiette l'utilise ×3)
  airPitchUpK: 1.6,   // relever le nez est 1,6 fois plus vif que le plonger
  airSpring: 18,     // raideur du ressort d'assiette (rad/s² par rad) : l'assiette rejoint son objectif en ≈ 0,5 s
  airTrim: 0.25,     // décalage maximal (rad, 14°) que gaz ou frein donnent par rapport à l'assiette d'équilibre
  airLevelH: 14,     // sous cette hauteur (m) au-dessus de la route, l'assiette tend vers la pente de la route…
  airLevelW: 0.35,   // … avec au plus cette part (aide partielle : la réception parfaite reste un geste)
  airAero: 0.15,     // part de l'écart assiette de décollage → trajectoire que la stabilité aérodynamique corrige : l'inertie garde l'assiette (sans commande, comme avant)
  airSteer: 1.4,      // contrôle de lacet en l'air (rad/s²), volontairement faible
  airSteerMax: 0.45,  // vitesse de rotation maxi due au volant en l'air (rad/s)
  landOk: 0.38,      // écart d'angle toléré à la réception (rad) sans perte de vitesse (une bosse de pente passe)
  // Mini-turbo (phase 2) : une glisse CONTRÔLÉE se charge ; la récompense dépend de sa durée (et un peu de son angle, plafonné). Avant : +6 / +16 km/h pour 100 km/h perdus.
  mtTime1: 0.6,      // charge (s) pour le niveau 1
  mtTime2: 1.4,      // charge (s) pour le niveau 2
  mtAngleMin: 0.06,  // angle de glisse (rad) sous lequel la voiture n'est pas vraiment en glisse (≈ 3,5°)
  mtAngleMax: 0.8,   // … au-delà (≈ 46°) c'est un tête-à-queue : ni charge ni récompense
  mtAngleRef: 0.17,  // angle de référence de la charge (≈ 10°, l'angle tenu à demi-volant) : plus de glisse charge plus vite, de 0,6 à 1,3 fois
  mtF1: 0.9, mtT1: 0.8,     // niveau 1 : puissance (part du turbo plein) et durée (s) ≈ +20 km/h
  mtF2: 1.0, mtT2: 1.3,      // niveau 2 ≈ +40 km/h
  // Transfert de charge (phase 2) : un coup de volant brusque, un freinage ou une accélération déplacent l'appui et font varier l'adhérence de l'arrière.
  xferRate: 9,       // vitesse de volant (unité / s) au-delà de laquelle une INVERSION du volant compte comme un coup de volant (le clavier va à 8 /s, revient à 13 /s)
  xferOut: 3.5,      // retour à la normale (1 / s)
  xferRear: 0.25,    // part de l'adhérence arrière perdue au maximum
  xferAx: 40,        // accélération longitudinale (m/s²) qui donne le transfert maximal
  xferLong: 0.05,    // part de l'adhérence déplacée au transfert maximal (faible : à 0,1 le pilote de référence de « récif » frôlait une bordure)
  flipKick: 7,        // impulsion donnée par une plaque d'inversion de gravité (m/s)
  lipHopMin: 2,      // saut en haut d'un L : hauteur mini (m)
  lipHopMax: 4,      // hauteur maxi (m), atteinte vers 180 km/h
  lipHopK: 600,      // hauteur = vitesse² / lipHopK, bornée
  bounce: SURF_PHYS.bounce,         // vitesse verticale donnée par un revêtement Rebond (100 %)
  wind: SURF_PHYS.wind,             // accélération latérale du vent à pleine force (m/s²)
  spring: SURF_PHYS.spring,         // poussée latérale du ressort à pleine force (m/s) : à 150 %, saut d’une voie (24 m)
  springHop: 11,      // saut du ressort (passe par-dessus la bordure)
  cutTime: 1.0,       // moteur coupé : durée après la dernière plaque
  shockE: 0.25,       // obstacles : rebond (0 = mou, 1 = élastique). PHYS_VER 36 : 0,5 -> 0,25 (une voiture qui percute un obstacle n'est plus renvoyée en arrière à la moitié de sa vitesse)
  shockKick: 2,       // ... et petite poussée en plus pour bien sentir le choc (avant : 6)
  shockLift: 0.7,     // un choc ne soulève une voiture posée que s'il vient franchement de dessous (cosinus de l'angle avec la normale de la route)
  curb: 0.9,          // PHYS_VER 36 : marche (m) qu'une voiture franchit en roulant ou en retombant (une roue, soit l'épaisseur d'une dalle). Avant : CAR.step, 1,6 m, pour tout ; il ne sert plus qu'aux pièces mobiles
  // 0.9.4 : un mur se paie. Choc = rebond + perte de vitesse proportionnelle à l'impact + coup de volant forcé + moteur et adhérence
  // réduits un instant (la voiture « encaisse »), et frottement continu tant qu'on racle.
  // Phase 2 (PHYS_VER 35) : le contact d'un mur est une RÉPONSE À UN IMPACT, proportionnelle à la composante normale de la vitesse (ap = vitesse d'approche, m/s), et non plus une perte
  // globale de vitesse doublée d'un frottement continu de 2 /s (un frôlement de 2° à 200 km/h passait à 51 km/h en 0,5 s puis restait collé à 23 km/h : mesuré, docs/AUDIT-PHASE2-PHYSIQUE.md).
  //   frôlement  (ap < 4 m/s)   : rebond sur la composante normale + frottement de Coulomb sur la tangente ; ni rotation ni encaissement ; l'élan est conservé
  //   modéré     (4 à 12 m/s)   : en plus une rotation et un encaissement croissants (la voiture se récupère)
  //   violent    (> 12 m/s)     : en plus une perte de vitesse globale croissante, plafonnée
  wallE: 0.35,        // rebond sur la composante normale (0 = mou)
  wallRest: 2,        //   … seuil de restitution : sous cette vitesse d'approche (m/s) le rebond croît linéairement de 0 à wallE (un simple appui ne rebondit pas ; contact.js : wallBounce)
  wallMu: 0.2,        // frottement de Coulomb : perte de vitesse tangente = wallMu × (1 + wallE) × ap  (impulsion : proportionnelle à la violence, nulle sans appui)
  wallScrape: 0.12,   // frottement visqueux de contact (part de la vitesse perdue par seconde de contact) : racler longtemps freine, sans jamais clouer la voiture (avant : 2,0 /s)
  wallYaw: 0.25,      // couple du contact : rotation cible (rad/s) par m/s d'approche et par unité de parallélisme avec le mur (contact.js : wallYawTarget)
  wallYawMax: 1.2,    //   … plafond (rad/s)
  wallHardFrom: 12,   // ap (m/s) à partir duquel le choc est « violent » : perte globale de vitesse en plus
  wallHardK: 0.016,   //   … par m/s d'ap au-delà
  wallHardMax: 0.4,   //   … plafond
  wallSpinFrom: 6,    // ap (m/s) à partir duquel un choc ajoute une rotation brutale (modéré et violent)
  wallSpin: 0.1,      // rotation ajoutée (rad/s par m/s d'ap au-delà du seuil), bornée par wallSpinMax
  wallSpinMax: 2.5,
  wallStunFrom: 4,    // ap (m/s) à partir duquel la voiture « encaisse » (moteur et adhérence réduits un instant)
  wallStun: 0.035,    // durée de l'encaissement (s par m/s d'ap au-delà du seuil) ; bornée à wallStunMax
  wallStunMax: 0.6,
  stuckAfter: 0.35,   // 0.9.48 : voiture plaquée contre un mur à l'arrêt depuis ce délai (s) : le volant la fait pivoter sur place
  stuckPivot: 1.2,    // vitesse de pivot (rad/s, à fond de volant)
  wallFresh: 0.12,    // 0.9.58 : durée (s) d'un contact avec un mur pendant laquelle un choc « coûte » (perte de vitesse, rotation, moteur coupé) ; au-delà c'est du frottement (wallScrape)
  wallFreshSpeed: 8,  //   … et seulement sous cette vitesse (m/s) : racler un mur à vive allure coûte comme avant
  scrubAngle: 0.4,    // 0.9.58 : braquage (rad) au-delà duquel la poussée longitudinale « de frottement » du pneu avant est plafonnée à basse vitesse (voir _tires)
  scrubSpeed: 8,      //   … en dessous de cette vitesse (m/s)
  scrubShare: 0.6,    //   … à cette part de la poussée du moteur : volant à fond, la voiture finit toujours par accélérer au lieu de tourner à 2 m/s sans fin
  crawlSpeed: 3,      // 0.9.59 : sur un ralentisseur (ou pour un bateau hors de l'eau), la résistance dépasse la poussée du moteur : une voiture arrêtée ne repartait JAMAIS.
  crawlAccel: 3,      //   Sous les gaz elle garde donc au moins cette accélération (m/s²) jusqu'à cette vitesse (m/s, 11 km/h) : très lente, jamais prisonnière (voir _longitudinal)
  touchMemory: 0.2,   // phase 2 : durée (s) pendant laquelle un contact de mur reste « récent » pour le dégagement automatique (le contact d'une voiture pressée clignote)
  stuckAlign: 1.4,    // 0.9.54 : voiture plaquée nez au mur : le contact la fait pivoter d'elle-même vers la tangente du mur (rad/s), sans qu'il faille braquer
  stunTraction: 0.5,  // poussée du moteur pendant l'encaissement (avant : 0,3)
  stunGrip: 0.75,     // adhérence pendant l'encaissement (avant : 0,6)
  loadFull: 0.5,      // PHYS_VER 36 : appui (en poids de la voiture) à partir duquel l'adhérence est entière sur un looping, un tube, un virage relevé ; en dessous elle diminue jusqu'à zéro (la voiture glisse)
  radius: 1.0 * CAR_SCALE,
  probe: 1.25 * CAR_SCALE,
  height: 1.3 * CAR_SCALE,
  bodyY: 0.8 * CAR_SCALE,     // obstacles : hauteur du centre de la sphère de contact au-dessus des roues…
  bodyR: 1.4 * CAR_SCALE,     // … et son rayon
};

// Réglages propres à la moto (plaque moto) : plus vive et plus agile que la voiture,
// un peu moins rapide en pointe. Les personnalisations du garage, elles, ne changent rien.
export const MOTO = {
  ...CAR,
  accel: SURF_PHYS.engineAccel * (10 / 11),
  maxSpeed: SURF_PHYS.maxSpeed * (90 / 95),
  brake: 44,          // freine un peu moins (une seule roue avant)
  a: 1.15 * CAR_SCALE, b: 1.2 * CAR_SCALE,    // empattement plus court : tourne plus serré
  yawK: 1.25 * CAR_SCALE,   // plus légère, change de cap plus vite
  latGrip: 78,        // penche dans les virages : un peu plus d'appui latéral
  frontShare: 0.45,
  steerMax: 0.75,     // braque plus à basse vitesse
  steerAlat: 66,      // et garde plus de braquage à haute vitesse
  driftRear: 0.76,    // glisse moins au freinage en virage
  driftSteer: 1.15,
  steerIn: 9,
  steerOut: 14,
  airPitchAcc: 5.2,   // plus vive en l'air
};

// Bateau (plaque bateau) : rapide sur l'eau, glisse un peu, se traîne sur la route.
const BOAT = {
  ...CAR,
  accel: SURF_PHYS.engineAccel * (8 / 11),
  maxSpeed: SURF_PHYS.maxSpeed * (85 / 95),
  brake: 32,
  latGrip: 58,        // la coque glisse plus qu'un pneu
  frontShare: 0.41,
  steerMax: 0.55,
  steerAlat: 48,
  yawK: 2.1 * CAR_SCALE,
  yawDamp: 0.9,
  driftRear: 0.7,
};

// Voiture-deltaplane (plaque deltaplane) : une voiture un peu plus lourde au sol,
// qui plane en l'air et s'y dirige en inclinant l'aile.
const GLIDER = {
  ...CAR,
  accel: SURF_PHYS.engineAccel * (8 / 11),
  maxSpeed: SURF_PHYS.maxSpeed * (90 / 95),
  airPitchAcc: 3.4,
};
export const SPECS = { car: CAR, moto: MOTO, boat: BOAT, glider: GLIDER };

// Vol plané : portance proportionnelle à v² et à l'incidence, traînée, virage incliné.
export const GLIDE = {
  lift: 0.021,         // portance (m/s² par (m/s)²) à incidence de vol
  liftMaxG: 1.6,       // portance maxi (en g)
  drag: 0.0009,        // traînée de forme
  induced: 0.03,       // traînée induite (part de la portance)
  trim: 0.08,          // incidence sans action (rad)
  up: 0.34,            // incidence en cabrant (frein)
  down: -0.16,         // incidence en piquant (gaz)
  turn: 1.7,           // vitesse de virage maxi (rad/s) (0.9.2 : 0,95 -> 1,7, le deltaplane vire beaucoup plus franchement)
  turnSpeed: 9,        // vitesse (m/s) à partir de laquelle il vire à plein régime
  turnRamp: 7,         // réactivité du roulis (1/s)
};
// Route sur le côté (pièces 90°) : appui aérodynamique (m/s² par (m/s)²) ajouté à l'appui réel. Pour tenir contre la gravité sur un
// plan vertical il faut environ 21 m/s (75 km/h) ; en dessous, la voiture glisse le long du plan et tombe par le bord.
export const SIDE_AERO = 0.03;
// Compensation de la glissade sur un plan vertical (m/s² par (m/s)²) : g / 22² => tenue complète à partir de 22 m/s (80 km/h).
export const SIDE_HOLD = 25 / (30 * 30);
// 0.9.4 : vitesse minimale sur un mur. En dessous (108 km/h), la gravité reprend toute la paroi ; si l'élan manque encore SIDE_GRACE secondes
// une fois la route penchée de plus de 45°, la voiture décroche et tombe (vitesse conservée : elle quitte le mur comme une balle).
export const SIDE_MIN_SPEED = 30;
export const SIDE_GRACE = 0.3;


// Coefficients des revêtements : UNE seule source pour le sol et pour les rubans (loopings, tubes, plafond...).
// Ils ne dépendent ni du sens de la gravité ni de la position de la voiture : endroit ou envers, mêmes valeurs.
// f = paramètre de la pièce (1 = 100 %). Les effets propres à un repère (vent, tapis, eau, plaques) restent à l'appelant.
const COEF = { grip: 1, traction: 1, vmaxK: 1, extraDrag: 0, rearK: 1 };
export function surfaceCoeffs(mod, f, out = COEF) {
  out.grip = 1; out.traction = 1; out.vmaxK = 1; out.extraDrag = 0; out.rearK = 1;
  switch (mod) {
    case 'ice': out.grip = clamp(0.2 / f, 0.05, 0.85); out.traction = 0.45; break;
    case 'magnet': out.grip = 1.6; break;
    // Dérive : l'arrière n'accroche presque plus (l'avant, si) : au moindre coup de volant la voiture part en glisse.
    case 'drift': out.rearK = clamp(0.95 - 0.42 * f, 0.2, 0.85); break;
    case 'slow': out.extraDrag = SURF_PHYS.engineAccel * f; break;      // (à 100 % : exactement la poussée du moteur à l'arrêt ; version 1.0 : suit le moteur, 14 -> 16)
    // Poudreuse : on s'enfonce un peu, l'adhérence est molle et le moteur patine.
    case 'powder': out.grip = clamp(0.62 / Math.sqrt(f), 0.3, 0.9); out.traction = 0.75; out.vmaxK = clamp(1 - 0.28 * f, 0.4, 1); out.extraDrag = 2.5 * f; break;
    default: break;
  }
  return out;
}
