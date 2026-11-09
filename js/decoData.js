// Données des décorations (sans dépendance au rendu).
//
// DEUX choses seulement à tenir à jour pour ajouter une décoration :
//   1. DECO_ORDER : l'ordre de SÉRIALISATION. Ne jamais réordonner, seulement ajouter à la fin (les codes de circuit s'y réfèrent par numéro) ;
//      un test (tools/test-registres.mjs) en garde une empreinte.
//   2. une ligne [identifiant, nom, icône] dans un groupe de BASE (ci-dessous) ou dans PACK (decoPackData.js) ;
//      sa géométrie s'écrit dans decos.js (ou decoPack.js). Catégories, noms et icônes de l'éditeur en sont déduits.
import { PACK, PACK_IDS } from './decoPackData.js';

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
  // 0.9.24 : pièce décorative personnalisée (customDeco.js), à la fin : l'ordre existant ne change jamais.
  'custom',
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

// Décorations d'origine, rangées par catégorie de l'éditeur : [clé, titre, [[identifiant, nom, icône], …], options]. Une catégorie « hidden »
// n'est pas proposée dans la palette (décorations secrètes).
const BASE = [
  ['signs', 'Panneaux', [
    ['sign_left', 'Flèche gauche', '⬅'], ['sign_right', 'Flèche droite', '➡'], ['sign_up', 'Tout droit', '⬆'], ['sign_stop', 'Stop', '⛔'],
    ['sign_speed', 'Limite', '🅿'], ['sign_warn', 'Danger', '⚠'], ['banner', 'Banderole', '🚩'],
  ]],
  ['shapes', 'Formes', [
    ['cube', 'Cube', '⬛'], ['sphere', 'Sphère', '⚪'], ['cylinder', 'Cylindre', '🛢'], ['cone', 'Cône', '🔺'],
    ['pyramid', 'Pyramide', '🔻'], ['arch', 'Arche', '🌉'],
  ]],
  ['build', 'Murs et toits', [
    ['wall', 'Mur', '🧱'], ['wallLow', 'Muret', '▬'], ['roofFlat', 'Toit plat', '⬜'], ['roofGable', 'Toit en pente', '🏠'],
    ['dome', 'Dôme', '🛖'],
  ]],
  ['nature', 'Nature', [
    ['pine', 'Sapin', '🌲'], ['palm', 'Palmier', '🌴'], ['tree', 'Arbre', '🌳'], ['bush', 'Buisson', '🌿'],
    ['rock', 'Rocher', '🪨'], ['cactus', 'Cactus', '🌵'], ['crystal', 'Cristal', '💎'], ['mushroom', 'Champignon', '🍄'],
    ['flower', 'Fleur', '🌸'],
  ]],
  ['image', 'Image', [
    ['plaque', 'Plaque image', '🖼'],
  ]],
  ['cave', 'Souterrain', [
    ['stalagmite', 'Stalagmite', '🗻'], ['cavePillar', 'Pilier de grotte', '🏛'], ['crystalCluster', 'Amas de cristaux', '💠'], ['glowMushroom', 'Champignon lumineux', '🍄'],
    ['minecart', 'Wagonnet', '🛒'], ['lantern', 'Lanterne', '🏮'],
  ]],
  ['sky', 'Nuages', [
    ['cloud', 'Nuage', '☁'], ['balloon', 'Montgolfière', '🎈'], ['floatIsle', 'Île flottante', '🏝'], ['windmill', 'Éolienne', '🌬'],
    ['airship', 'Dirigeable', '🛸'], ['skyTower', 'Tour céleste', '🗼'],
  ]],
  ['sea', 'Fonds marins', [
    ['coral', 'Corail', '🪸'], ['seaweed', 'Algues', '🌿'], ['fishSchool', 'Banc de poissons', '🐟'], ['shell', 'Coquillage', '🐚'],
    ['anchor', 'Ancre', '⚓'], ['jellyfish', 'Méduse', '🪼'], ['treasure', 'Coffre au trésor', '💰'],
  ]],
  ['factory', 'Usine', [
    ['gear', 'Engrenage', '⚙'], ['pipe', 'Tuyau', '🔧'], ['chimney', 'Cheminée', '🏭'], ['crate', 'Caisses', '📦'],
    ['barrel', 'Barils', '🛢'], ['crane', 'Grue', '🏗'], ['warnLight', 'Gyrophare', '🚨'],
  ]],
  ['space', 'Espace', [
    ['satellite', 'Satellite', '🛰'], ['asteroid', 'Astéroïde', '☄'], ['antenna', 'Antenne', '📡'], ['rocket', 'Fusée', '🚀'],
    ['planetMini', 'Planète miniature', '🪐'],
  ]],
  ['race', 'Circuit', [
    ['trafficCone', 'Plot', '🚧'], ['tireStack', 'Pile de pneus', '⭕'], ['flagPole', 'Drapeau à damier', '🏁'], ['grandstand', 'Tribune', '🏟'],
  ]],
  ['lights', 'Lumières', [
    ['searchlight', 'Projecteur tournant', '🔦'], ['spotlight', 'Projecteur', '💡'], ['lanternPost', 'Lanterne sur pied', '🏮'], ['lanternHang', 'Lanterne suspendue', '🏮'],
    ['streetLamp', 'Lampadaire', '🛣'],
  ]],
  ['vehicles', 'Véhicules', [
    ['plane', 'Avion de ligne', '✈'], ['biplane', 'Avion à hélice', '🛩'], ['helicopter', 'Hélicoptère', '🚁'], ['bus', 'Bus', '🚌'],
    ['truck', 'Camion', '🚚'], ['locomotive', 'Locomotive', '🚂'], ['sedan', 'Voiture', '🚗'], ['ufo', 'Soucoupe', '🛸'],
    ['sailboat', 'Voilier', '⛵'],
  ]],
  ['xmas', 'Noël', [
    ['xmasTree', 'Sapin de Noël', '🎄'], ['snowman', 'Bonhomme de neige', '⛄'], ['gift', 'Cadeau', '🎁'], ['candyCane', 'Sucre d’orge', '🍭'],
    ['xmasStar', 'Étoile', '⭐'], ['wreath', 'Couronne', '🎍'], ['sleigh', 'Traîneau', '🛷'], ['reindeer', 'Renne', '🦌'],
    ['gingerHouse', 'Maison en pain d’épices', '🍪'],
  ]],
  ['halloween', 'Halloween', [
    ['pumpkin', 'Citrouille', '🎃'], ['ghost', 'Fantôme', '👻'], ['tombstone', 'Pierre tombale', '🪦'], ['bats', 'Chauves-souris', '🦇'],
    ['witchHat', 'Chapeau de sorcière', '🧙'], ['cauldron', 'Chaudron', '🫕'], ['spookyTree', 'Arbre mort', '🌳'], ['hauntedHouse', 'Maison hantée', '🏚'],
    ['skull', 'Crâne', '💀'],
  ]],
  ['obstacles', 'Obstacles', [
    ['spikes', 'Piques', '🔱'], ['spikesPop', 'Piques escamotables', '⏫'], ['pendulum', 'Boule balancier', '🔴'], ['hammer', 'Marteau tournant', '🔨'],
    ['slider', 'Mur coulissant', '↔'], ['sweeper', 'Balayeur', '🌀'], ['bumper', 'Bumper', '🟣'],
  ]],
  ['secret', 'Secrets', [
    ['shard', 'Éclat secret', '✦'],
  ], { hidden: true }],
  ['custom', 'Mes pièces', [['custom', 'Pièce perso', '✦']], { hidden: true }],
];

// Catégories, noms et icônes : déduits des tables BASE et PACK. Les clés « xmas » et « halloween » du pack complètent celles d'origine.
export const DECO_CATS = {};
export const DECO_LABELS = {};
export const DECO_ICONS = {};
for (const [key, title, items, opts = {}] of [...BASE, ...PACK]) {
  if (!opts.hidden && !DECO_CATS[key]) DECO_CATS[key] = { label: title, kinds: [] };
  for (const [id, name, icon] of items) {
    if (!opts.hidden) DECO_CATS[key].kinds.push(id);
    DECO_LABELS[id] = name;
    DECO_ICONS[id] = icon;
  }
}

// Couleurs proposées (index 0 = couleurs naturelles de l'objet).
export const DECO_COLORS = ['#ff6b57', '#ffbf3c', '#7cf06b', '#2fd3b5', '#3ec1ff', '#8f7cff', '#ff7ad9', '#f4f1ea', '#2f3247'];
