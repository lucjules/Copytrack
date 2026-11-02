// Dimensions du monde (en mètres).
export const CELL = 20;            // taille d'une case de grille
export const HALF = CELL / 2;
export const LEVEL_H = 4;          // hauteur d'un niveau
export const ROAD_W = 14;          // largeur roulable
export const ROAD_HALF = ROAD_W / 2;
export const RAIL_W = 0.6;         // épaisseur des bordures
export const RAIL_H = 1.1;         // hauteur des bordures
export const SLAB_T = 0.9;         // épaisseur de la dalle
export const ROAD_TOP = 0.4;       // altitude de la chaussée au niveau 0
export const MAX_LEVEL = 10;

// Pas de simulation fixe.
export const DT = 1 / 120;

// Directions de grille : 0 = nord (-z), 1 = est (+x), 2 = sud (+z), 3 = ouest (-x).
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
