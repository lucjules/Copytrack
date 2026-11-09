// Dimensions du monde (en mètres) : case de 32 m, route de 24 m de large, niveau de 6,4 m.
// Les circuits sont stockés en positions de grille et les pièces sont écrites en proportion de la case (voir pieces.js) :
// un changement d'échelle (la 0.9.11 est passée de 24 à 32 m) agrandit donc tous les circuits sans les convertir. Il impose en revanche de
// repasser sur chaque valeur « en mètres » écrite en dur ailleurs ; tools/test-scale.mjs en vérifie quelques-unes par homothétie.
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
  // 0.9.46 : moteur propre à Copytrack, avec une VRAIE vitesse de pointe (le réglage de la 0.9.45, linéaire, n'en avait pas : 450 km/h en 10 s).
  // Sous les gaz : a = engineAccel × (1 − (v / maxSpeed)^1,5) (CAR.accelCurve) : forte au départ, elle s'essouffle près du plafond, qu'on
  // n'atteint qu'avec de bonnes sorties de virage et de longues lignes droites. Au-delà du plafond la poussée devient un freinage.
  gravity: 19,         // gravité normale (m/s²) (0.9.45 : 16, trop flottante ; avant : 25)
  engineAccel: 14,     // poussée à l'arrêt (m/s²) : 0 -> 100 km/h en 2,2 s
  coastDrag: 0.05,     // résistance à vide proportionnelle à la vitesse (1/s) ; s'y ajoute CAR.coast (constante), pour que lever le pied serve avant un virage
  boostAccel: 10,      // poussée supplémentaire d'un booster à 100 % (m/s²)
  boostTime: 1.2,      // durée d'un booster (s)
  maxSpeed: 290 / 3.6, // plafond du moteur (m/s) : 290 km/h
  boostSpeed: 340 / 3.6,   // plafond sous turbo à 100 % (m/s) : 340 km/h
};

// Nombre maximal de décorations par circuit.
export const MAX_DECOS = 500;

// Facteur d'échelle du monde par rapport à la case de 24 m d'origine : les pièces sont écrites en proportion de la case (rayon d'un looping,
// ouverture d'un virage…), pas en mètres fixes. WORLD_SCALE = 1 reproduit l'ancien monde.
export const WORLD_SCALE = CELL / 24;

// Looping : rayon et décalage latéral (une demi-case de chaque côté).
export const LOOP_R = 12 * WORLD_SCALE;
export const LOOP_LANE = HALF;

// Pas de simulation fixe.
export const DT = 1 / 120;

// Limites partagées par le jeu, les salons multijoueurs et la fonction serveur de vérification (un seul endroit pour les changer).
export const MAX_RUN_SECONDS = 600;                        // une course dure 10 minutes au plus : au-delà, un enregistrement ou un temps est refusé
export const MAX_RUN_STEPS = Math.round(MAX_RUN_SECONDS / DT);
export const MAX_TRACK_CODE_CHARS = 400000;                // taille maximale d'un code de circuit reçu ou transmis
export const MAX_INPUTS_CHARS = 400000;                    // taille maximale d'un enregistrement de commandes
export const OFF_TRACK_RESPAWN_S = 0.5;                    // temps passé hors piste avant la réapparition automatique

// Véhicules possibles (le véhicule de départ d'un circuit, les plaques de transformation, les paquets réseau).
export const VEHICLES = ['car', 'moto', 'boat', 'glider'];

// Directions de grille : 0 = nord (-z), 1 = est (+x), 2 = sud (+z), 3 = ouest (-x).
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
