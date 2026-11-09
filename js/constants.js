// Dimensions du monde (en mètres).
// v1.1 : pistes élargies (14 -> 18 m) et cases agrandies (20 -> 24 m).
// Les circuits étant stockés en positions de grille, tous les anciens
// circuits sont convertis automatiquement.
export const VERSION = 'bêta 0.9.13';   // à incrémenter à chaque modification livrée : 0.9.1, 0.9.2, 0.9.3…
export const CELL = 32;            // taille d'une case de grille
export const HALF = CELL / 2;
export const LEVEL_H = 6.4;        // hauteur d'un niveau (pentes identiques à la v1.0)
export const ROAD_W = 24;          // largeur roulable
export const ROAD_HALF = ROAD_W / 2;
export const RAIL_W = 0.6;         // épaisseur des bordures
export const RAIL_H = 1.1;         // hauteur des bordures
export const SLAB_T = 0.9;         // épaisseur de la dalle
export const ROAD_TOP = 0.4;       // altitude de la chaussée au niveau 0
// Hauteur maximale d'un circuit, en niveaux (Phase 3 : 14 -> 60, soit près de 290 m).
export const MAX_LEVEL = 60;

// Grandeurs physiques des revêtements, partagées par la physique (CAR) et par l'interface (valeurs affichées en km/h, m/s²…).
export const SURF_PHYS = {
  wind: 54,            // accélération latérale du vent à pleine force (m/s²) ; Phase 3 : 36 -> 54
  belt: 200 / 3.6,     // vitesse du tapis roulant à son réglage maximal : ±200 km/h
  spring: 56,          // poussée latérale du ressort à pleine force (m/s)
  bounce: 14,          // vitesse verticale d'un rebond à 100 % (m/s)
  // 0.9.12 : moteur et gravité calés sur des mesures de la course de référence (lancer arrêté à plat, décélération à vide, vol libre ; trajectoires relevées
  // à 60 Hz, 1 unité du monde = 1 m). Poussée a = ENGINE_ACCEL − DRIVE_DRAG·v sous les gaz (ajustement sur la distance parcourue, écart 0,12 m), a = −COAST_DRAG·v
  // à vide, vol libre y'' = −GRAVITY. Murs / wall-ride, freinage et marche arrière : pas mesurables dans ce relevé, donc inchangés.
  gravity: 16,         // gravité normale (m/s²) (0.9.12 : 25 -> 16, mesurée 15,4 à 16,2 en vol libre)
  engineAccel: 19.0,   // poussée à l'arrêt (m/s²) (0.9.12 : 11 -> 19,0)
  driveDrag: 0.080,    // résistance linéaire sous les gaz (1/s) : vitesse asymptotique = engineAccel / driveDrag
  coastDrag: 0.1065,   // résistance linéaire à vide, gaz et frein relâchés (1/s)
  maxSpeed: 19.0 / 0.080,           // vitesse asymptotique du moteur (m/s) : 237,5 m/s, jamais atteinte (0 -> 100 km/h en 1,7 s, 200 km/h en 3,4 s)
  boostSpeed: (19.0 / 0.080) * (112 / 95),   // vitesse visée sous turbo à 100 % (m/s), même rapport qu'avant la 0.9.12
  boostAccel: 10,      // poussée supplémentaire d'un booster à 100 % (m/s²)
  boostTime: 1.2,      // durée d'un booster (s)
};

// Nombre maximal de décorations par circuit.
export const MAX_DECOS = 500;

// Looping : rayon et décalage latéral (une demi-case de chaque côté).
export const LOOP_R = 12 * (CELL / 24);
export const LOOP_LANE = HALF;

// Pas de simulation fixe.
export const DT = 1 / 120;

// Directions de grille : 0 = nord (-z), 1 = est (+x), 2 = sud (+z), 3 = ouest (-x).
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
