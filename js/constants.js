// Dimensions du monde (en mètres).
// v1.1 : pistes élargies (14 -> 18 m) et cases agrandies (20 -> 24 m).
// Les circuits étant stockés en positions de grille, tous les anciens
// circuits sont convertis automatiquement.
export const VERSION = '1.1';
export const CELL = 24;            // taille d'une case de grille
export const HALF = CELL / 2;
export const LEVEL_H = 4.8;        // hauteur d'un niveau (pentes identiques à la v1.0)
export const ROAD_W = 18;          // largeur roulable
export const ROAD_HALF = ROAD_W / 2;
export const RAIL_W = 0.6;         // épaisseur des bordures
export const RAIL_H = 1.1;         // hauteur des bordures
export const SLAB_T = 0.9;         // épaisseur de la dalle
export const ROAD_TOP = 0.4;       // altitude de la chaussée au niveau 0
export const MAX_LEVEL = 12;

// Looping : rayon et décalage latéral (une demi-case de chaque côté).
export const LOOP_R = 12;
export const LOOP_LANE = HALF;

// Pas de simulation fixe.
export const DT = 1 / 120;

// Directions de grille : 0 = nord (-z), 1 = est (+x), 2 = sud (+z), 3 = ouest (-x).
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
