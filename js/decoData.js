import { PACK, PACK_IDS } from './decoPackData.js';

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
  // 0.9.2 : lumières (vraies lumières, de la couleur de l'objet), véhicules, Noël, Halloween
  'searchlight', 'spotlight', 'lanternPost', 'lanternHang', 'streetLamp',
  'plane', 'biplane', 'helicopter', 'bus', 'truck', 'locomotive', 'sedan', 'ufo', 'sailboat',
  'xmasTree', 'snowman', 'gift', 'candyCane', 'xmasStar', 'wreath', 'sleigh', 'reindeer', 'gingerHouse',
  'pumpkin', 'ghost', 'tombstone', 'bats', 'witchHat', 'cauldron', 'spookyTree', 'hauntedHouse', 'skull',
  // 0.9.3 : pack de ~200 décorations (plage, Saint-Valentin, Nouvel An, fête foraine, ville, ferme, château, Japon, sport, jungle…)
  ...PACK_IDS,
];

// Décorations qui éclairent vraiment la scène (PointLight / SpotLight). La couleur de l'objet (index ou #rrggbb) donne celle de la lumière.
//  type : 'spot' (projecteur : faisceau visible + SpotLight) ou 'point' ; y : hauteur de la source (m, avant échelle) ;
//  spin : rotation du faisceau (rad/s) ; tilt : inclinaison du faisceau au-dessus de l'horizontale ; range : portée (m) ;
//  power : intensité (candelas) ; color : couleur d'origine quand l'objet est « aux couleurs naturelles ».
export const LIGHT_DECOS = {
  searchlight: { type: 'spot', y: 2.7, spin: 0.7, tilt: 0.62, range: 150, power: 9000, angle: 0.2, color: '#cfeaff', beam: 70 },
  spotlight:   { type: 'spot', y: 3.1, spin: 0, tilt: 0.45, range: 110, power: 6500, angle: 0.3, color: '#fff2c4', beam: 50 },
  lanternPost: { type: 'point', y: 2.6, range: 34, power: 520, color: '#ffc46b' },
  lanternHang: { type: 'point', y: 4.1, range: 30, power: 430, color: '#ffb35c' },
  streetLamp:  { type: 'point', y: 8.3, range: 60, power: 1500, color: '#ffe9b0' },
};

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
  lights: { label: 'Lumières', kinds: ['searchlight', 'spotlight', 'lanternPost', 'lanternHang', 'streetLamp'] },
  vehicles: { label: 'Véhicules', kinds: ['plane', 'biplane', 'helicopter', 'bus', 'truck', 'locomotive', 'sedan', 'ufo', 'sailboat'] },
  xmas: { label: 'Noël', kinds: ['xmasTree', 'snowman', 'gift', 'candyCane', 'xmasStar', 'wreath', 'sleigh', 'reindeer', 'gingerHouse'] },
  halloween: { label: 'Halloween', kinds: ['pumpkin', 'ghost', 'tombstone', 'bats', 'witchHat', 'cauldron', 'spookyTree', 'hauntedHouse', 'skull'] },
  obstacles: { label: 'Obstacles', kinds: ['spikes', 'spikesPop', 'pendulum', 'hammer', 'slider', 'sweeper', 'bumper'] },
};

export const DECO_LABELS = {
  ...Object.fromEntries(PACK.flatMap(([, , items]) => items.map(([id, name]) => [id, name]))),
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
  searchlight: 'Projecteur tournant', spotlight: 'Projecteur', lanternPost: 'Lanterne sur pied', lanternHang: 'Lanterne suspendue', streetLamp: 'Lampadaire',
  plane: 'Avion de ligne', biplane: 'Avion à hélice', helicopter: 'Hélicoptère', bus: 'Bus', truck: 'Camion', locomotive: 'Locomotive', sedan: 'Voiture', ufo: 'Soucoupe', sailboat: 'Voilier',
  xmasTree: 'Sapin de Noël', snowman: 'Bonhomme de neige', gift: 'Cadeau', candyCane: 'Sucre d’orge', xmasStar: 'Étoile', wreath: 'Couronne', sleigh: 'Traîneau', reindeer: 'Renne', gingerHouse: 'Maison en pain d’épices',
  pumpkin: 'Citrouille', ghost: 'Fantôme', tombstone: 'Pierre tombale', bats: 'Chauves-souris', witchHat: 'Chapeau de sorcière', cauldron: 'Chaudron', spookyTree: 'Arbre mort', hauntedHouse: 'Maison hantée', skull: 'Crâne',
};

// Couleurs proposées (index 0 = couleurs naturelles de l'objet).
export const DECO_COLORS = ['#ff6b57', '#ffbf3c', '#7cf06b', '#2fd3b5', '#3ec1ff', '#8f7cff', '#ff7ad9', '#f4f1ea', '#2f3247'];

// Pack 0.9.3 : nouvelles catégories, et ajouts aux catégories Noël / Halloween existantes.
for (const [key, label, items] of PACK) {
  const kinds = items.map((i) => i[0]);
  if (DECO_CATS[key]) DECO_CATS[key].kinds.push(...kinds);
  else DECO_CATS[key] = { label, kinds };
}
export const DECO_PACK_ICONS = Object.fromEntries(PACK.flatMap(([, , items]) => items.map(([id, , icon]) => [id, icon])));
