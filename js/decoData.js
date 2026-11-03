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
  'stalagmite', 'cavePillar', 'crystalCluster', 'glowMushroom', 'minecart', 'lantern',
  'cloud', 'balloon', 'floatIsle', 'windmill', 'airship', 'skyTower',
  'coral', 'seaweed', 'fishSchool', 'shell', 'anchor', 'jellyfish', 'treasure',
  'gear', 'pipe', 'chimney', 'crate', 'barrel', 'crane', 'warnLight',
  'satellite', 'asteroid', 'antenna', 'rocket', 'planetMini',
  'trafficCone', 'tireStack', 'flagPole', 'grandstand',
];

export const DECO_CATS = {
  signs: { label: 'Panneaux', kinds: ['sign_left', 'sign_right', 'sign_up', 'sign_stop', 'sign_speed', 'sign_warn', 'banner'] },
  shapes: { label: 'Formes', kinds: ['cube', 'sphere', 'cylinder', 'cone', 'pyramid', 'arch'] },
  build: { label: 'Murs et toits', kinds: ['wall', 'wallLow', 'roofFlat', 'roofGable', 'dome'] },
  nature: { label: 'Nature', kinds: ['pine', 'palm', 'tree', 'bush', 'rock', 'cactus', 'crystal', 'mushroom', 'flower'] },
  image: { label: 'Image', kinds: ['plaque'] },
  cave: { label: 'Souterrain', kinds: ['stalagmite', 'cavePillar', 'crystalCluster', 'glowMushroom', 'minecart', 'lantern'] },
  sky: { label: 'Nuages', kinds: ['cloud', 'balloon', 'floatIsle', 'windmill', 'airship', 'skyTower'] },
  sea: { label: 'Fonds marins', kinds: ['coral', 'seaweed', 'fishSchool', 'shell', 'anchor', 'jellyfish', 'treasure'] },
  factory: { label: 'Usine', kinds: ['gear', 'pipe', 'chimney', 'crate', 'barrel', 'crane', 'warnLight'] },
  space: { label: 'Espace', kinds: ['satellite', 'asteroid', 'antenna', 'rocket', 'planetMini'] },
  race: { label: 'Circuit', kinds: ['trafficCone', 'tireStack', 'flagPole', 'grandstand'] },
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
  stalagmite: 'Stalagmite', cavePillar: 'Pilier de grotte', crystalCluster: 'Amas de cristaux', glowMushroom: 'Champignon lumineux', minecart: 'Wagonnet', lantern: 'Lanterne',
  cloud: 'Nuage', balloon: 'Montgolfière', floatIsle: 'Île flottante', windmill: 'Éolienne', airship: 'Dirigeable', skyTower: 'Tour céleste',
  coral: 'Corail', seaweed: 'Algues', fishSchool: 'Banc de poissons', shell: 'Coquillage', anchor: 'Ancre', jellyfish: 'Méduse', treasure: 'Coffre au trésor',
  gear: 'Engrenage', pipe: 'Tuyau', chimney: 'Cheminée', crate: 'Caisses', barrel: 'Barils', crane: 'Grue', warnLight: 'Gyrophare',
  satellite: 'Satellite', asteroid: 'Astéroïde', antenna: 'Antenne', rocket: 'Fusée', planetMini: 'Planète miniature',
  trafficCone: 'Plot', tireStack: 'Pile de pneus', flagPole: 'Drapeau à damier', grandstand: 'Tribune',
};

// Couleurs proposées (index 0 = couleurs naturelles de l'objet).
export const DECO_COLORS = ['#ff6b57', '#ffbf3c', '#7cf06b', '#2fd3b5', '#3ec1ff', '#8f7cff', '#ff7ad9', '#f4f1ea', '#2f3247'];
