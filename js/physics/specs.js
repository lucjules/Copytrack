// Réglages des véhicules et des revêtements pour la physique (voiture, moto, bateau, deltaplane) : des nombres, aucune logique.
// Le modèle de pneus, de rubans et de collisions qui les utilise est dans physics.js et physics/.
import { SURF_PHYS } from '../constants.js';
import { clamp } from '../mathutil.js';

export const CAR = {
  accel: SURF_PHYS.engineAccel,   // sous les gaz a = accel × (1 - (v / maxSpeed)^accelCurve)
  accelCurve: 1.5,    // plus c'est petit, plus la fin de la courbe est longue
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
  a: 1.35,            // centre de gravité -> essieu avant (m)
  b: 1.4,             // centre de gravité -> essieu arrière (m)
  yawK: 1.9,          // inertie de lacet ramenée à la masse (m²)
  corner: 230,        // rigidité de dérive d'un essieu (m/s² par rad)
  latGrip: 80,        // adhérence latérale totale (m/s²), partagée avant / arrière (0.9.11 : 56 -> 80, la voiture tient mieux dans les virages)
  frontShare: 0.42,   // part avant (0.9.11 : 0,48 -> 0,42 : l'arrière accroche plus que l'avant, la voiture PERD l'avant avant de partir en tête-à-queue : pardonne un volant tardif)
  steerMax: 0.65,     // angle de braquage maxi des roues (rad) à basse vitesse
  steerAlat: 52,      // l'angle utile diminue avec la vitesse (le volant reste précis)
  driftRear: 0.65,    // adhérence arrière restante quand on freine en virage (dérapage)
  driftSteer: 1.3,    // braquage autorisé en plus pendant le dérapage
  driftMin: 12,       // vitesse mini (m/s) pour qu'un freinage en virage fasse déraper
  driftBrake: 0.75,   // part du freinage absorbée par la glisse quand on dérape
  yawDamp: 0.6,
  steerIn: 8,         // vitesse de braquage
  steerOut: 13,       // retour au centre
  gravity: SURF_PHYS.gravity,
  snap: 0.7,
  step: 1.6,
  magnetRange: 4,     // aimant : portée de l'attraction au-dessus d'une route aimantée (m)
  magnetAcc: 80,      // ... et accélération maximale vers la route, le long de sa normale (m/s²)
  launch: 0.6,        // vitesse normale (m/s) au-delà de laquelle la route « tombe » sous la voiture : elle décolle (0.9.11 : 2,0 -> 0,6, sans exemption d'angle)
  airPitchAcc: 4.2,  // tangage en l'air : gaz = nez vers le bas, frein = nez vers le haut (rad/s²)
  airPitchDamp: 2.6,
  airPitchUpK: 1.6,   // relever le nez est 1,6 fois plus vif que le plonger
  airSteer: 1.4,      // contrôle de lacet en l'air (rad/s²), volontairement faible
  airSteerMax: 0.45,  // vitesse de rotation maxi due au volant en l'air (rad/s)
  landOk: 0.38,      // écart d'angle toléré à la réception (rad) sans perte de vitesse (une bosse de pente passe)
  mtTime1: 0.7,      // durée de glisse pour un mini-turbo (s)
  mtTime2: 1.5,      // durée pour un mini-turbo renforcé
  flipKick: 7,        // impulsion donnée par une plaque d'inversion de gravité (m/s)
  lipHopMin: 2,      // saut en haut d'un L : hauteur mini (m)
  lipHopMax: 4,      // hauteur maxi (m), atteinte vers 180 km/h
  lipHopK: 600,      // hauteur = vitesse² / lipHopK, bornée
  bounce: SURF_PHYS.bounce,         // vitesse verticale donnée par un revêtement Rebond (100 %)
  wind: SURF_PHYS.wind,             // accélération latérale du vent à pleine force (m/s²)
  spring: SURF_PHYS.spring,         // poussée latérale du ressort à pleine force (m/s) : à 150 %, saut d’une voie (24 m)
  springHop: 11,      // saut du ressort (passe par-dessus la bordure)
  cutTime: 1.0,       // moteur coupé : durée après la dernière plaque
  shockE: 0.5,        // obstacles : rebond (0 = mou, 1 = élastique)
  shockKick: 6,       // ... et petite poussée en plus pour bien sentir le choc
  // 0.9.4 : un mur se paie. Choc = rebond + perte de vitesse proportionnelle à l'impact + coup de volant forcé + moteur et adhérence
  // réduits un instant (la voiture « encaisse »), et frottement continu tant qu'on racle.
  wallE: 0.35,        // rebond sur le mur (0 = mou)
  wallLoss: 0.05,     // part de la vitesse perdue par m/s d'impact normal (borné par wallLossMax) : 10 m/s = -50 %
  wallLossMax: 0.65,
  wallScrape: 2.0,    // frottement : part de la vitesse perdue par seconde de contact (racler un mur à 200 km/h freine fort)
  wallSpin: 0.14,     // rotation provoquée (rad/s par m/s d'impact), bornée par wallSpinMax
  wallSpinMax: 2.5,
  stuckAfter: 0.35,   // 0.9.48 : voiture plaquée contre un mur à l'arrêt depuis ce délai (s) : le volant la fait pivoter sur place
  stuckPivot: 1.2,    // vitesse de pivot (rad/s, à fond de volant)
  wallFresh: 0.12,    // 0.9.58 : durée (s) d'un contact avec un mur pendant laquelle un choc « coûte » (perte de vitesse, rotation, moteur coupé) ; au-delà c'est du frottement (wallScrape)
  wallFreshSpeed: 8,  //   … et seulement sous cette vitesse (m/s) : racler un mur à vive allure coûte comme avant
  scrubAngle: 0.4,    // 0.9.58 : braquage (rad) au-delà duquel la poussée longitudinale « de frottement » du pneu avant est plafonnée à basse vitesse (voir _tires)
  scrubSpeed: 8,      //   … en dessous de cette vitesse (m/s)
  scrubShare: 0.6,    //   … à cette part de la poussée du moteur : volant à fond, la voiture finit toujours par accélérer au lieu de tourner à 2 m/s sans fin
  stuckAlign: 1.4,    // 0.9.54 : voiture plaquée nez au mur : le contact la fait pivoter d'elle-même vers la tangente du mur (rad/s), sans qu'il faille braquer
  wallStun: 0.04,     // durée de l'encaissement (s par m/s d'impact), 0,1 s en plus, bornée à 0,8 s
  stunTraction: 0.3,  // poussée du moteur pendant l'encaissement
  stunGrip: 0.6,      // adhérence pendant l'encaissement
  radius: 1.0,
  probe: 1.25,
  height: 1.3,
};

// Réglages propres à la moto (plaque moto) : plus vive et plus agile que la voiture,
// un peu moins rapide en pointe. Les personnalisations du garage, elles, ne changent rien.
export const MOTO = {
  ...CAR,
  accel: SURF_PHYS.engineAccel * (10 / 11),
  maxSpeed: SURF_PHYS.maxSpeed * (90 / 95),
  brake: 44,          // freine un peu moins (une seule roue avant)
  a: 1.15, b: 1.2,    // empattement plus court : tourne plus serré
  yawK: 1.25,         // plus légère, change de cap plus vite
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
  yawK: 2.1,
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
    case 'slow': out.extraDrag = 14 * f; break;
    // Poudreuse : on s'enfonce un peu, l'adhérence est molle et le moteur patine.
    case 'powder': out.grip = clamp(0.62 / Math.sqrt(f), 0.3, 0.9); out.traction = 0.75; out.vmaxK = clamp(1 - 0.28 * f, 0.4, 1); out.extraDrag = 2.5 * f; break;
    default: break;
  }
  return out;
}
