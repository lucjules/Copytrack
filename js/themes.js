// Les 11 décors (thèmes visuels) du jeu : identité, nom et ordre de la carrière. Module de données pur (aucun rendu).
//
// C'est la SEULE liste des décors : l'éditeur (sélecteur de décor), le défi du jour, la carrière, les cartes de l'interface et le décodage des
// codes de circuit s'y réfèrent. Le rendu de chaque décor (ciel, terrain, objets) est dans scenery.js, clé pour clé ; un test vérifie que les
// deux listes portent les mêmes identifiants.
//   chip       couleur d'accent de la pastille de décor sur les cartes de circuit
//   darkGround vrai si le sol est sombre : la grille de l'éditeur s'éclaircit
//
// ATTENTION : l'ordre des clés de DECORS est celui des premières versions et le défi du jour en dépend (il tire le décor par son rang) :
// ne jamais le changer, seulement ajouter à la fin. L'ordre de la CARRIÈRE est un autre ordre : CAREER_ORDER.
export const DECORS = {
  desert: { label: 'Désert crépuscule', chip: '#ff8c5a' },
  polar: { label: 'Nuit polaire', chip: '#7fe9ff', darkGround: true },
  jungle: { label: 'Jungle néon', chip: '#2dffb0', darkGround: true },
  city: { label: 'Ville futuriste', chip: '#ff3d8a', darkGround: true },
  isles: { label: 'Archipel tropical', chip: '#ffd66b' },
  volcano: { label: 'Volcan', chip: '#ff5a2a' },
  orbit: { label: 'Station orbitale', chip: '#b9a6ff' },
  caves: { label: 'Canyon de cristal', chip: '#b48cff' },
  sky: { label: 'Ville dans les nuages', chip: '#9fd8ff' },
  reef: { label: 'Fonds marins', chip: '#2fd3b5' },
  factory: { label: 'Usine mécanique', chip: '#ffb070' },
};

export const DEFAULT_DECOR = 'desert';

// Un chapitre de carrière par décor, du plus facile au plus dur.
export const CAREER_ORDER = ['desert', 'jungle', 'isles', 'city', 'polar', 'volcano', 'orbit', 'reef', 'factory', 'sky', 'caves'];
