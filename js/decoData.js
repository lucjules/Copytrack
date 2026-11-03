// Données des décorations (sans dépendance au rendu) : ordre de sérialisation et métadonnées.
// Ne jamais réordonner DECO_ORDER, seulement ajouter à la fin.
export const DECO_ORDER = [
  'sign_left', 'sign_right', 'sign_up', 'sign_stop', 'sign_speed', 'sign_warn', 'banner',
  'cube', 'sphere', 'cylinder', 'cone', 'pyramid', 'arch',
  'wall', 'wallLow', 'roofFlat', 'roofGable', 'dome',
  'pine', 'palm', 'tree', 'bush', 'rock', 'cactus', 'crystal', 'mushroom', 'flower',
  'plaque', 'shard',
  // 0.9 : obstacles (physiques)
  'spikes', 'spikesPop', 'pendulum', 'hammer', 'slider', 'sweeper', 'bumper',
];

export const DECO_CATS = {
  signs: { label: 'Panneaux', kinds: ['sign_left', 'sign_right', 'sign_up', 'sign_stop', 'sign_speed', 'sign_warn', 'banner'] },
  shapes: { label: 'Formes', kinds: ['cube', 'sphere', 'cylinder', 'cone', 'pyramid', 'arch'] },
  build: { label: 'Murs et toits', kinds: ['wall', 'wallLow', 'roofFlat', 'roofGable', 'dome'] },
  nature: { label: 'Nature', kinds: ['pine', 'palm', 'tree', 'bush', 'rock', 'cactus', 'crystal', 'mushroom', 'flower'] },
  image: { label: 'Image', kinds: ['plaque'] },
  obstacles: { label: 'Obstacles', kinds: ['spikes', 'spikesPop', 'pendulum', 'hammer', 'slider', 'sweeper', 'bumper'] },
};

export const DECO_LABELS = {
  sign_left: 'Flèche gauche', sign_right: 'Flèche droite', sign_up: 'Tout droit', sign_stop: 'Stop',
  sign_speed: 'Limite', sign_warn: 'Danger', banner: 'Banderole',
  cube: 'Cube', sphere: 'Sphère', cylinder: 'Cylindre', cone: 'Cône', pyramid: 'Pyramide', arch: 'Arche',
  wall: 'Mur', wallLow: 'Muret', roofFlat: 'Toit plat', roofGable: 'Toit en pente', dome: 'Dôme',
  pine: 'Sapin', palm: 'Palmier', tree: 'Arbre', bush: 'Buisson', rock: 'Rocher', cactus: 'Cactus',
  crystal: 'Cristal', mushroom: 'Champignon', flower: 'Fleur', plaque: 'Plaque image', shard: 'Éclat secret',
  spikes: 'Piques', spikesPop: 'Piques escamotables', pendulum: 'Boule balancier', hammer: 'Marteau tournant',
  slider: 'Mur coulissant', sweeper: 'Balayeur', bumper: 'Bumper',
};

// Couleurs proposées (index 0 = couleurs naturelles de l'objet).
export const DECO_COLORS = ['#ff6b57', '#ffbf3c', '#7cf06b', '#2fd3b5', '#3ec1ff', '#8f7cff', '#ff7ad9', '#f4f1ea', '#2f3247'];
