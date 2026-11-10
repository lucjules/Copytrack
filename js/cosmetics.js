// Catalogue de personnalisation du véhicule. 100 % visuel : aucune de ces options
// ne modifie la physique (voir CAR dans physics.js, qui ne dépend pas du modèle 3D).

import { DEFAULT_CUSTOM, sanitizeCustom, cloneCustom } from './custom.js';

export const CATEGORIES = [
  { id: 'body', label: 'Carrosserie' },
  { id: 'colors', label: 'Couleurs' },
  { id: 'led', label: 'LED' },
  { id: 'decal', label: 'Dessins' },
  { id: 'ornament', label: 'Ornements' },
  { id: 'spoiler', label: 'Ailerons' },
  { id: 'wheels', label: 'Roues' },
  { id: 'finish', label: 'Finition' },
  { id: 'bike', label: 'Moto' },
  { id: 'trail', label: 'Traînée' },
  { id: 'horn', label: 'Klaxon' },
  { id: 'studio', label: 'Atelier' },
  { id: 'presets', label: 'Presets' },
  { id: 'collections', label: 'Collections' },
];

export const CATALOG = {
  body: [
    { id: 'buggy', label: 'Buggy', cost: 0 },
    { id: 'sport', label: 'Sport', cost: 150 },
    { id: 'hatch', label: 'Citadine', cost: 120 },
    { id: 'muscle', label: 'Muscle', cost: 200 },
    { id: 'rally', label: 'Rallye', cost: 250 },
    { id: 'wedge', label: 'Fléchette', cost: 300 },
    { id: 'pickup', label: 'Pick-up', cost: 260 },
    { id: 'formula', label: 'Monoplace', cost: 380 },
    // Nouvelles carrosseries (0.9.57) : profils seulement, la physique ne les voit jamais.
    { id: 'kart', label: 'Kart', cost: 140 },
    { id: 'cabrio', label: 'Cabriolet', cost: 220 },
    { id: 'coupe', label: 'Coupé GT', cost: 280 },
    { id: 'hotrod', label: 'Hot rod', cost: 300 },
    { id: 'jeep', label: 'Tout-terrain', cost: 240 },
    { id: 'van', label: 'Fourgonnette', cost: 200 },
    { id: 'bubble', label: 'Bulle', cost: 180 },
    { id: 'limo', label: 'Limousine', cost: 320 },
    { id: 'sleigh', label: 'Traîneau', cost: 260, theme: 'noel' },
  ],
  // v1.5 : finition de la peinture (aspect seulement).
  finish: [
    { id: 'gloss', label: 'Brillante', cost: 0 },
    { id: 'matte', label: 'Mate', cost: 60 },
    { id: 'metal', label: 'Métallisée', cost: 120 },
    { id: 'pearl', label: 'Nacrée', cost: 180 },
    { id: 'glitter', label: 'Pailletée', cost: 200, theme: 'nouvelan' },
    { id: 'frost', label: 'Givrée', cost: 160, theme: 'hiver' },
    { id: 'candy', label: 'Bonbon', cost: 150, theme: 'amour' },
    { id: 'chrome', label: 'Chromée', cost: 240 },
  ],
  // Forme de la moto (plaque moto).
  bike: [
    { id: 'street', label: 'Routière', cost: 0 },
    { id: 'chopper', label: 'Chopper', cost: 220 },
  ],
  // Traînée lumineuse en l'air et pendant les turbos.
  trail: [
    { id: 'none', label: 'Aucune', cost: 0 },
    { id: 'comet', label: 'Comète', cost: 80, color: '#7fe9ff' },
    { id: 'ember', label: 'Braise', cost: 120, color: '#ff7a1f' },
    { id: 'aurora', label: 'Aurore', cost: 160, color: '#7dffb0' },
    { id: 'rainbow', label: 'Arc-en-ciel', cost: 220, rainbow: true },
    // Exclusivité (0.9.18) : ne s'achète pas, se mérite (champ `exclusive` : comment). Voir rewards.js.
    { id: 'gold', label: 'Traînée dorée', cost: 0, color: '#ffd23e', exclusive: 'Terminer 7 défis du jour différents' },
    { id: 'frost', label: 'Traînée givrée', cost: 0, color: '#bfeaff', exclusive: 'Une série de 7 défis du jour d’affilée' },
    { id: 'violet', label: 'Traînée violette', cost: 0, color: '#b07bff', exclusive: 'Atteindre le niveau 10' },
    { id: 'plasma', label: 'Plasma', cost: 0, color: '#ff5cf0', exclusive: 'Atteindre le niveau 30' },
    { id: 'snow', label: 'Neige', cost: 90, color: '#f4fbff', theme: 'noel' },
    { id: 'sparkle', label: 'Étincelles', cost: 130, color: '#ffe27a', theme: 'nouvelan' },
    { id: 'confetti', label: 'Confettis', cost: 140, rainbow: true, theme: 'nouvelan' },
    { id: 'bubbles', label: 'Bulles', cost: 90, color: '#9fe8ff', theme: 'plage' },
    { id: 'sunray', label: 'Rayon de soleil', cost: 100, color: '#ffc83a', theme: 'ete' },
    { id: 'ghost', label: 'Spectre', cost: 110, color: '#cfd8ff', theme: 'halloween' },
    { id: 'petals', label: 'Pétales', cost: 100, color: '#ffb3d1', theme: 'printemps' },
    { id: 'leaves', label: 'Feuilles mortes', cost: 100, color: '#d9792b', theme: 'automne' },
    { id: 'hearts', label: 'Cœurs', cost: 120, color: '#ff4f8b', theme: 'amour' },
  ],
  // Klaxon (touche H).
  horn: [
    { id: 'classic', label: 'Classique', cost: 0 },
    { id: 'duo', label: 'Deux tons', cost: 30 },
    { id: 'tuba', label: 'Grave', cost: 50 },
    { id: 'arcade', label: 'Arcade', cost: 70 },
  ],
  led: [
    { id: 'none', label: 'Aucune', cost: 0 },
    { id: 'cyan', label: 'Cyan', cost: 40, color: '#36e9ff' },
    { id: 'pink', label: 'Rose', cost: 40, color: '#ff4fd8' },
    { id: 'lime', label: 'Citron vert', cost: 50, color: '#8dff4f' },
    { id: 'amber', label: 'Ambre', cost: 50, color: '#ffb02e' },
    { id: 'violet', label: 'Violet', cost: 60, color: '#9b6bff' },
    { id: 'pulse', label: 'Pulsation', cost: 150, color: '#36e9ff', pulse: true },
    { id: 'rainbow', label: 'Arc-en-ciel', cost: 250, rainbow: true },
    { id: 'emerald', label: 'Émeraude', cost: 0, color: '#2dffb0', exclusive: 'Une médaille sur les 6 circuits de l’Atelier' },
    { id: 'sunset', label: 'Crépuscule', cost: 0, color: '#ff8c5a', exclusive: 'Réussir les 6 leçons de l’Académie' },
    { id: 'toxic', label: 'Toxique', cost: 0, color: '#b6ff3b', exclusive: 'Terminer 10 mutations du jour' },
    { id: 'mint', label: 'Menthe', cost: 0, color: '#7dffcf', exclusive: 'Atteindre le niveau 5' },
    { id: 'pale', label: 'Or pâle', cost: 0, color: '#ffe9a3', exclusive: 'Atteindre le niveau 20' },
    { id: 'xmas', label: 'Rouge Noël', cost: 50, color: '#ff2d3a', theme: 'noel' },
    { id: 'holly', label: 'Houx', cost: 50, color: '#2dd36f', theme: 'noel' },
    { id: 'champagne', label: 'Champagne', cost: 60, color: '#ffe9a3', theme: 'nouvelan' },
    { id: 'ocean', label: 'Océan', cost: 50, color: '#19c7d8', theme: 'plage' },
    { id: 'sunny', label: 'Soleil', cost: 50, color: '#ffd21f', theme: 'ete' },
    { id: 'spooky', label: 'Maléfice', cost: 60, color: '#ff7a1c', theme: 'halloween' },
    { id: 'blossom', label: 'Cerisier', cost: 50, color: '#ff9ccc', theme: 'printemps' },
    { id: 'harvest', label: 'Moisson', cost: 50, color: '#e08a2e', theme: 'automne' },
    { id: 'love', label: 'Passion', cost: 60, color: '#ff2e7e', theme: 'amour' },
  ],
  decal: [
    { id: 'none', label: 'Aucun', cost: 0 },
    { id: 'stripe', label: 'Bande', cost: 30 },
    { id: 'twin', label: 'Double bande', cost: 40 },
    { id: 'dots', label: 'Pois', cost: 50 },
    { id: 'checker', label: 'Damier', cost: 60 },
    { id: 'stars', label: 'Étoiles', cost: 80 },
    { id: 'flames', label: 'Flammes', cost: 90 },
    { id: 'bolt', label: 'Éclair', cost: 100 },
    { id: 'xmastree', label: 'Sapins', cost: 70, theme: 'noel' },
    { id: 'snowflakes', label: 'Flocons', cost: 70, theme: 'hiver' },
    { id: 'fireworks', label: 'Feu d’artifice', cost: 90, theme: 'nouvelan' },
    { id: 'confetti', label: 'Confettis', cost: 70, theme: 'nouvelan' },
    { id: 'waves', label: 'Vagues', cost: 60, theme: 'plage' },
    { id: 'palm', label: 'Palmiers', cost: 70, theme: 'plage' },
    { id: 'sun', label: 'Soleils', cost: 70, theme: 'ete' },
    { id: 'bats', label: 'Chauves-souris', cost: 80, theme: 'halloween' },
    { id: 'flowers', label: 'Fleurs', cost: 70, theme: 'printemps' },
    { id: 'leaf', label: 'Feuilles', cost: 60, theme: 'automne' },
    { id: 'hearts', label: 'Cœurs', cost: 70, theme: 'amour' },
  ],
  ornament: [
    { id: 'none', label: 'Aucun', cost: 0 },
    { id: 'antenna', label: 'Antenne', cost: 20 },
    { id: 'flag', label: 'Fanion', cost: 40 },
    { id: 'cone', label: 'Cône', cost: 50 },
    { id: 'fin', label: 'Aileron requin', cost: 60 },
    { id: 'beacon', label: 'Gyrophare', cost: 70 },
    { id: 'horns', label: 'Cornes', cost: 90 },
    { id: 'crown', label: 'Couronne', cost: 300 },
    { id: 'santahat', label: 'Bonnet de Père Noël', cost: 80, theme: 'noel' },
    { id: 'antlers', label: 'Bois de renne', cost: 90, theme: 'noel' },
    { id: 'xtree', label: 'Mini-sapin', cost: 70, theme: 'noel' },
    { id: 'snowman', label: 'Bonhomme de neige', cost: 100, theme: 'hiver' },
    { id: 'partyhat', label: 'Chapeau de fête', cost: 60, theme: 'nouvelan' },
    { id: 'umbrella', label: 'Parasol', cost: 80, theme: 'plage' },
    { id: 'surfboard', label: 'Planche de surf', cost: 100, theme: 'plage' },
    { id: 'ringfloat', label: 'Bouée', cost: 70, theme: 'ete' },
    { id: 'icecream', label: 'Cornet de glace', cost: 70, theme: 'ete' },
    { id: 'witchhat', label: 'Chapeau de sorcière', cost: 90, theme: 'halloween' },
    { id: 'pumpkin', label: 'Citrouille', cost: 80, theme: 'halloween' },
    { id: 'bunny', label: 'Oreilles de lapin', cost: 80, theme: 'printemps' },
    { id: 'heartballoon', label: 'Ballon cœur', cost: 70, theme: 'amour' },
  ],
  spoiler: [
    { id: 'wing', label: 'Classique', cost: 0 },
    { id: 'none', label: 'Aucun', cost: 0 },
    { id: 'low', label: 'Bec bas', cost: 30 },
    { id: 'duck', label: 'Becquet', cost: 50 },
    { id: 'gt', label: 'GT haut', cost: 60 },
    { id: 'double', label: 'Double plan', cost: 90 },
    { id: 'big', label: 'Géant', cost: 140 },
    { id: 'surf', label: 'Planche', cost: 80, theme: 'plage' },
    { id: 'ring', label: 'Anneau', cost: 110 },
  ],
  wheels: [
    { id: 'classic', label: 'Classiques', cost: 0 },
    { id: 'spoke', label: 'À rayons', cost: 40 },
    { id: 'disc', label: 'Pleines', cost: 40 },
    { id: 'neon', label: 'Néon', cost: 90 },
    { id: 'gold', label: 'Dorées', cost: 150 },
    { id: 'chrome', label: 'Chromées', cost: 120 },
    { id: 'snow', label: 'Chaînes à neige', cost: 80, theme: 'hiver' },
    { id: 'sunny', label: 'Jaune soleil', cost: 60, theme: 'ete' },
  ],
};

export const COLOR_CHOICES = [
  '#ffd23e', '#ff5a5f', '#3ec1ff', '#7cf06b', '#c77dff', '#ff8c42', '#f4f1ea', '#2f3247',
  '#ff4fd8', '#2fd3b5', '#ffffff', '#111118', '#b0b6c8', '#8a1c2e', '#1d4fb8', '#e8c27a',
  // 0.9.57 : couleurs de saison et pastels
  '#c1121f', '#1b6b34', '#ffb3d1', '#ff7a1c', '#2b1055', '#bfeaff', '#19c7d8', '#b5521b',
  '#fff1c1', '#a7f3d0', '#ffcf99', '#7a4a2b', '#4b0082', '#ff2e7e', '#9bd1ff', '#0b3d2e',
];

// Thèmes de saison (0.9.57) : un nom, une icône, une palette de trois couleurs (peinture, secondaire, dessins). Les éléments du catalogue portent `theme` pour s'y rattacher.
export const THEMES = [
  { id: 'noel', label: 'Noël', icon: '🎄', palette: ['#c1121f', '#1b6b34', '#f4f1ea'] },
  { id: 'nouvelan', label: 'Nouvel An', icon: '🎆', palette: ['#111118', '#ffd23e', '#c0c6d8'] },
  { id: 'hiver', label: 'Hiver', icon: '❄️', palette: ['#bfeaff', '#3ec1ff', '#ffffff'] },
  { id: 'plage', label: 'Plage', icon: '🏖️', palette: ['#2fd3b5', '#ffd23e', '#ffffff'] },
  { id: 'ete', label: 'Été', icon: '☀️', palette: ['#ffd23e', '#ff5a5f', '#3ec1ff'] },
  { id: 'halloween', label: 'Halloween', icon: '🎃', palette: ['#ff7a1c', '#2b1055', '#7cf06b'] },
  { id: 'printemps', label: 'Printemps', icon: '🌸', palette: ['#ffb3d1', '#7cf06b', '#ffffff'] },
  { id: 'automne', label: 'Automne', icon: '🍂', palette: ['#b5521b', '#e8c27a', '#8a1c2e'] },
  { id: 'amour', label: 'Saint-Valentin', icon: '💝', palette: ['#ff4fd8', '#8a1c2e', '#ffffff'] },
];

// Palettes de couleurs (onglet Couleurs du garage) : applique peinture, secondaire et dessins d'un coup. Gratuites. Les trois premières couleurs viennent de THEMES.
export const PALETTES = [
  ...THEMES.map((t) => ({ id: t.id, label: t.label, theme: t.id, colors: t.palette })),
  { id: 'sorbet', label: 'Sorbet', colors: ['#ffcf99', '#a7f3d0', '#ffb3d1'] },
  { id: 'glacier', label: 'Glacier', colors: ['#9bd1ff', '#ffffff', '#1d4fb8'] },
  { id: 'foret', label: 'Forêt', colors: ['#0b3d2e', '#7cf06b', '#e8c27a'] },
  { id: 'nuit', label: 'Nuit', colors: ['#111118', '#4b0082', '#36e9ff'] },
];

export const DEFAULT_LOADOUT = {
  body: 'buggy', color: '#ffd23e', color2: '#23242f', decalColor: '#ffffff',
  spoiler: 'wing', led: 'none', decal: 'none', ornament: 'none', wheels: 'classic',
  finish: 'gloss', bike: 'street', trail: 'none', horn: 'classic',
  custom: DEFAULT_CUSTOM,       // lot 10 : pièces libres, peinture avancée, dessin, effets (custom.js) ; gratuit, purement visuel
};

export const PRESETS = [
  { id: 'classic', label: 'Classique', loadout: { ...DEFAULT_LOADOUT } },
  { id: 'neon', label: 'Néon de nuit', loadout: { body: 'sport', color: '#111118', color2: '#36e9ff', decalColor: '#36e9ff', spoiler: 'gt', led: 'cyan', decal: 'stripe', ornament: 'none', wheels: 'neon' } },
  { id: 'flame', label: 'Flamme', loadout: { body: 'muscle', color: '#ff5a5f', color2: '#23242f', decalColor: '#ffd23e', spoiler: 'duck', led: 'amber', decal: 'flames', ornament: 'none', wheels: 'disc' } },
  { id: 'rally', label: 'Rallye', loadout: { body: 'rally', color: '#1d4fb8', color2: '#f4f1ea', decalColor: '#f4f1ea', spoiler: 'big', led: 'none', decal: 'twin', ornament: 'antenna', wheels: 'spoke' } },
  { id: 'royal', label: 'Royal', loadout: { body: 'wedge', color: '#8a1c2e', color2: '#e8c27a', decalColor: '#e8c27a', spoiler: 'double', led: 'violet', decal: 'stars', ornament: 'crown', wheels: 'gold' } },
  { id: 'party', label: 'Soirée', loadout: { body: 'hatch', color: '#ff4fd8', color2: '#2fd3b5', decalColor: '#ffffff', spoiler: 'low', led: 'rainbow', decal: 'dots', ornament: 'beacon', wheels: 'neon' } },
  { id: 'racer', label: 'Pilote', loadout: { body: 'sport', color: '#f4f1ea', color2: '#ff5a5f', decalColor: '#ff5a5f', spoiler: 'gt', led: 'none', decal: 'checker', ornament: 'flag', wheels: 'spoke' } },
  { id: 'desert', label: 'Désert', loadout: { body: 'pickup', color: '#e8c27a', color2: '#8a1c2e', decalColor: '#2f3247', spoiler: 'none', led: 'amber', decal: 'stripe', ornament: 'antenna', wheels: 'spoke', finish: 'matte', trail: 'ember' } },
  { id: 'f1', label: 'Monoplace', loadout: { body: 'formula', color: '#ff5a5f', color2: '#f4f1ea', decalColor: '#f4f1ea', spoiler: 'double', led: 'none', decal: 'twin', ornament: 'none', wheels: 'disc', finish: 'gloss', trail: 'comet' } },
  { id: 'chrome', label: 'Chrome', loadout: { body: 'wedge', color: '#b0b6c8', color2: '#111118', decalColor: '#36e9ff', spoiler: 'gt', led: 'cyan', decal: 'none', ornament: 'none', wheels: 'gold', finish: 'metal', bike: 'chopper', trail: 'rainbow', horn: 'arcade' } },
  // ---- Thèmes de saison (0.9.57) : `theme` les regroupe dans le garage.
  { id: 'noel-pere', label: 'Père Noël', theme: 'noel', loadout: { body: 'sleigh', color: '#c1121f', color2: '#f4f1ea', decalColor: '#f4f1ea', spoiler: 'low', led: 'xmas', decal: 'xmastree', ornament: 'santahat', wheels: 'snow', finish: 'gloss', trail: 'snow' } },
  { id: 'noel-renne', label: 'Renne', theme: 'noel', loadout: { body: 'jeep', color: '#7a4a2b', color2: '#c1121f', decalColor: '#ffd23e', spoiler: 'none', led: 'holly', decal: 'stars', ornament: 'antlers', wheels: 'snow', finish: 'matte', trail: 'snow' } },
  { id: 'noel-sapin', label: 'Sapin', theme: 'noel', loadout: { body: 'van', color: '#1b6b34', color2: '#c1121f', decalColor: '#ffd23e', spoiler: 'none', led: 'xmas', decal: 'dots', ornament: 'xtree', wheels: 'disc', finish: 'pearl', trail: 'sparkle' } },
  { id: 'nouvelan-fete', label: 'Réveillon', theme: 'nouvelan', loadout: { body: 'limo', color: '#111118', color2: '#ffd23e', decalColor: '#ffd23e', spoiler: 'low', led: 'champagne', decal: 'fireworks', ornament: 'partyhat', wheels: 'chrome', finish: 'glitter', trail: 'sparkle' } },
  { id: 'nouvelan-confetti', label: 'Confettis', theme: 'nouvelan', loadout: { body: 'hatch', color: '#c0c6d8', color2: '#ff4fd8', decalColor: '#ffd23e', spoiler: 'duck', led: 'rainbow', decal: 'confetti', ornament: 'partyhat', wheels: 'neon', finish: 'metal', trail: 'confetti' } },
  { id: 'hiver-neige', label: 'Bonhomme de neige', theme: 'hiver', loadout: { body: 'bubble', color: '#ffffff', color2: '#3ec1ff', decalColor: '#bfeaff', spoiler: 'none', led: 'cyan', decal: 'snowflakes', ornament: 'snowman', wheels: 'snow', finish: 'frost', trail: 'snow' } },
  { id: 'hiver-glace', label: 'Glacier', theme: 'hiver', loadout: { body: 'coupe', color: '#bfeaff', color2: '#1d4fb8', decalColor: '#ffffff', spoiler: 'gt', led: 'cyan', decal: 'snowflakes', ornament: 'none', wheels: 'chrome', finish: 'frost', trail: 'comet' } },
  { id: 'plage-surf', label: 'Surf', theme: 'plage', loadout: { body: 'cabrio', color: '#2fd3b5', color2: '#ffd23e', decalColor: '#ffffff', spoiler: 'surf', led: 'ocean', decal: 'waves', ornament: 'surfboard', wheels: 'sunny', finish: 'gloss', trail: 'bubbles' } },
  { id: 'plage-parasol', label: 'Parasol', theme: 'plage', loadout: { body: 'jeep', color: '#ffd23e', color2: '#ff5a5f', decalColor: '#ffffff', spoiler: 'none', led: 'sunny', decal: 'palm', ornament: 'umbrella', wheels: 'sunny', finish: 'matte', trail: 'bubbles' } },
  { id: 'ete-soleil', label: 'Plein soleil', theme: 'ete', loadout: { body: 'cabrio', color: '#ffd23e', color2: '#ff5a5f', decalColor: '#ff8c42', spoiler: 'low', led: 'sunny', decal: 'sun', ornament: 'icecream', wheels: 'sunny', finish: 'gloss', trail: 'sunray' } },
  { id: 'ete-bouee', label: 'Bouée', theme: 'ete', loadout: { body: 'kart', color: '#3ec1ff', color2: '#ffd23e', decalColor: '#ffffff', spoiler: 'ring', led: 'ocean', decal: 'waves', ornament: 'ringfloat', wheels: 'disc', finish: 'candy', trail: 'bubbles' } },
  { id: 'halloween-citrouille', label: 'Citrouille', theme: 'halloween', loadout: { body: 'hotrod', color: '#ff7a1c', color2: '#2b1055', decalColor: '#2b1055', spoiler: 'none', led: 'spooky', decal: 'bats', ornament: 'pumpkin', wheels: 'classic', finish: 'matte', trail: 'ghost' } },
  { id: 'halloween-sorciere', label: 'Sorcière', theme: 'halloween', loadout: { body: 'coupe', color: '#2b1055', color2: '#7cf06b', decalColor: '#7cf06b', spoiler: 'duck', led: 'spooky', decal: 'bats', ornament: 'witchhat', wheels: 'neon', finish: 'pearl', trail: 'ghost' } },
  { id: 'printemps-fleurs', label: 'Cerisier', theme: 'printemps', loadout: { body: 'hatch', color: '#ffb3d1', color2: '#7cf06b', decalColor: '#ffffff', spoiler: 'low', led: 'blossom', decal: 'flowers', ornament: 'bunny', wheels: 'spoke', finish: 'pearl', trail: 'petals' } },
  { id: 'printemps-prairie', label: 'Prairie', theme: 'printemps', loadout: { body: 'kart', color: '#7cf06b', color2: '#ffd23e', decalColor: '#ffffff', spoiler: 'none', led: 'lime', decal: 'flowers', ornament: 'none', wheels: 'classic', finish: 'gloss', trail: 'petals' } },
  { id: 'automne-feuilles', label: 'Sous-bois', theme: 'automne', loadout: { body: 'pickup', color: '#b5521b', color2: '#e8c27a', decalColor: '#e8c27a', spoiler: 'none', led: 'harvest', decal: 'leaf', ornament: 'antenna', wheels: 'spoke', finish: 'matte', trail: 'leaves' } },
  { id: 'automne-recolte', label: 'Récolte', theme: 'automne', loadout: { body: 'van', color: '#e8c27a', color2: '#8a1c2e', decalColor: '#b5521b', spoiler: 'none', led: 'harvest', decal: 'leaf', ornament: 'pumpkin', wheels: 'disc', finish: 'gloss', trail: 'leaves' } },
  { id: 'amour-coeur', label: 'Cœur', theme: 'amour', loadout: { body: 'sport', color: '#ff4fd8', color2: '#8a1c2e', decalColor: '#ffffff', spoiler: 'duck', led: 'love', decal: 'hearts', ornament: 'heartballoon', wheels: 'gold', finish: 'candy', trail: 'hearts' } },
  { id: 'amour-rose', label: 'Rose passion', theme: 'amour', loadout: { body: 'limo', color: '#8a1c2e', color2: '#ff4fd8', decalColor: '#ffffff', spoiler: 'low', led: 'love', decal: 'hearts', ornament: 'crown', wheels: 'gold', finish: 'pearl', trail: 'hearts' } },
  { id: 'shark', label: 'Requin', loadout: { body: 'wedge', color: '#b0b6c8', color2: '#2f3247', decalColor: '#ffffff', spoiler: 'low', led: 'pink', decal: 'bolt', ornament: 'fin', wheels: 'classic' } },
];

export function itemCost(cat, id) {
  const it = (CATALOG[cat] || []).find((x) => x.id === id);
  return it ? it.cost : 0;
}

// Élément exclusif : jamais en vente, débloqué par un exploit (rewards.js). Renvoie le texte « comment l'obtenir », ou '' pour un élément ordinaire.
export function exclusiveOf(cat, id) {
  const it = (CATALOG[cat] || []).find((x) => x.id === id);
  return (it && it.exclusive) || '';
}

const KEYS = ['body', 'led', 'decal', 'ornament', 'spoiler', 'wheels', 'finish', 'bike', 'trail', 'horn'];

export function sanitizeLoadout(l) {
  const out = { ...DEFAULT_LOADOUT, custom: cloneCustom() };
  if (!l) return out;
  for (const k of KEYS) if ((CATALOG[k] || []).some((x) => x.id === l[k])) out[k] = l[k];
  for (const k of ['color', 'color2', 'decalColor']) if (/^#[0-9a-f]{6}$/i.test(l[k] || '')) out[k] = l[k];
  out.custom = sanitizeCustom(l.custom);
  return out;
}

// Éléments payants d'un équipement : [[catégorie, id], ...]
export function itemsOf(loadout) {
  return KEYS.map((k) => [k, loadout[k]]).filter(([k, id]) => itemCost(k, id) > 0 || exclusiveOf(k, id));
}
