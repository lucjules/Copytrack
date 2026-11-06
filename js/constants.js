// Dimensions du monde (en mètres).
// v1.1 : pistes élargies (14 -> 18 m) et cases agrandies (20 -> 24 m).
// Les circuits étant stockés en positions de grille, tous les anciens
// circuits sont convertis automatiquement.
export const VERSION = 'bêta 0.9.9';   // à incrémenter à chaque modification livrée : 0.9.1, 0.9.2, 0.9.3…
export const CELL = 24;            // taille d'une case de grille
export const HALF = CELL / 2;
export const LEVEL_H = 4.8;        // hauteur d'un niveau (pentes identiques à la v1.0)
export const ROAD_W = 18;          // largeur roulable
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
  gravity: 25,         // gravité normale (m/s²)
  maxSpeed: 95,        // vitesse visée par le moteur (m/s) : la courbe d'accélération est très longue, on n'en atteint la fin qu'avec de longues lignes droites et de bonnes sorties de virage (0.9.4 : 54 -> 95)
  boostSpeed: 112,     // vitesse visée sous turbo à 100 % (m/s)
};

// Nombre maximal de décorations par circuit.
export const MAX_DECOS = 500;

// Looping : rayon et décalage latéral (une demi-case de chaque côté).
export const LOOP_R = 12;
export const LOOP_LANE = HALF;

// Pas de simulation fixe.
export const DT = 1 / 120;

// Directions de grille : 0 = nord (-z), 1 = est (+x), 2 = sud (+z), 3 = ouest (-x).
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
