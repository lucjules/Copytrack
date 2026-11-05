// Pack de décorations 0.9.3 (≈ 200 objets) : données seules (identifiant, nom, icône), sans dépendance au rendu.
// Les constructeurs sont dans decoPack.js. Ne jamais réordonner : seulement ajouter à la fin (les codes de circuit en dépendent).
// Chaque catégorie : [clé, titre, [[id, nom, icône], …]]. Les clés 'xmas' et 'halloween' complètent les catégories existantes.
export const PACK = [
  ['beach', 'Plage et été', [
    ['parasol', 'Parasol', '⛱'], ['beachChair', 'Chaise de plage', '🪑'], ['sandCastle', 'Château de sable', '🏰'], ['surfboard', 'Planche de surf', '🏄'],
    ['lifeguard', 'Tour de sauveteur', '🛟'], ['beachBall', 'Ballon de plage', '🏐'], ['towel', 'Serviette', '🟦'], ['coconutPalm', 'Cocotier', '🥥'],
    ['sunLounger', 'Bain de soleil', '🏖'], ['starfish', 'Étoile de mer', '⭐'], ['bigCrab', 'Crabe géant', '🦀'], ['lighthouse', 'Phare', '🗼'],
    ['beachHut', 'Cabane de plage', '🛖'], ['buoy', 'Bouée', '🔴'], ['volleyNet', 'Filet de volley', '🏐'], ['iceCreamCart', 'Charrette à glaces', '🍦'],
    ['bigSun', 'Soleil', '☀'], ['kayak', 'Kayak', '🛶'], ['sandalPair', 'Tongs', '🩴'],
  ]],
  ['valentine', 'Saint-Valentin', [
    ['heartBig', 'Grand cœur', '❤'], ['heartArch', 'Arche en cœur', '💞'], ['roseBouquet', 'Bouquet de roses', '💐'], ['rose', 'Rose', '🌹'],
    ['cupidArrow', 'Flèche de Cupidon', '💘'], ['loveLetter', 'Lettre d’amour', '💌'], ['chocolateBox', 'Boîte de chocolats', '🍫'], ['teddy', 'Ours en peluche', '🧸'],
    ['heartBalloons', 'Ballons en cœur', '🎈'], ['ringBox', 'Écrin à bague', '💍'], ['heartTree', 'Arbre à cœurs', '💗'], ['loveBench', 'Banc des amoureux', '🪑'],
  ]],
  ['newyear', 'Nouvel An', [
    ['fireworkTower', 'Feu d’artifice', '🎆'], ['champagne', 'Bouteille de champagne', '🍾'], ['bigClock', 'Horloge du compte à rebours', '🕛'], ['confettiCannon', 'Canon à confettis', '🎊'],
    ['partyHat', 'Chapeau de fête', '🥳'], ['discoBall', 'Boule à facettes', '🪩'], ['balloonArch', 'Arche de ballons', '🎈'], ['streamerPole', 'Mât à serpentins', '🎏'],
    ['sparkler', 'Cierge magique', '🎇'], ['starGarland', 'Guirlande d’étoiles', '✨'], ['redLantern', 'Lanterne rouge', '🏮'], ['newYearArch', 'Arche du Nouvel An', '🎉'],
  ]],
  ['xmas', 'Noël', [
    ['giftStack', 'Pile de cadeaux', '🎁'], ['snowflake', 'Flocon géant', '❄'], ['stocking', 'Chaussette de Noël', '🧦'], ['lightString', 'Guirlande lumineuse', '💡'],
    ['snowPine', 'Sapin enneigé', '🌲'], ['igloo', 'Igloo', '🛖'], ['nutcracker', 'Casse-noisette', '💂'], ['snowGlobe', 'Boule à neige', '🔮'],
    ['santaChimney', 'Cheminée du Père Noël', '🏠'], ['elf', 'Lutin', '🧝'], ['bell', 'Cloche', '🔔'], ['holly', 'Houx', '🍀'],
  ]],
  ['halloween', 'Halloween', [
    ['coffin', 'Cercueil', '⚰'], ['scarecrow', 'Épouvantail', '🎃'], ['spiderWeb', 'Toile d’araignée', '🕸'], ['spider', 'Araignée géante', '🕷'],
    ['candyBucket', 'Seau de bonbons', '🍬'], ['crystalBall', 'Boule de cristal', '🔮'], ['hangingGhost', 'Fantôme suspendu', '👻'], ['graveFence', 'Grille de cimetière', '⛓'],
    ['broom', 'Balai de sorcière', '🧹'], ['mummy', 'Momie', '🧟'], ['skeleton', 'Squelette', '💀'], ['blackCat', 'Chat noir', '🐈‍⬛'],
  ]],
  ['spring', 'Printemps et Pâques', [
    ['easterEgg', 'Œuf de Pâques', '🥚'], ['bunny', 'Lapin', '🐰'], ['eggBasket', 'Panier d’œufs', '🧺'], ['tulip', 'Tulipe', '🌷'],
    ['daisy', 'Marguerite', '🌼'], ['beehive', 'Ruche', '🐝'], ['butterfly', 'Papillon', '🦋'], ['birdhouse', 'Nichoir', '🐦'],
    ['lamb', 'Agneau', '🐑'], ['rainbow', 'Arc-en-ciel', '🌈'], ['cherryTree', 'Cerisier en fleurs', '🌸'], ['picnic', 'Pique-nique', '🧺'],
  ]],
  ['autumn', 'Automne', [
    ['mapleTree', 'Érable', '🍁'], ['leafPile', 'Tas de feuilles', '🍂'], ['hayBale', 'Botte de foin', '🌾'], ['appleTree', 'Pommier', '🍎'],
    ['acorn', 'Gland géant', '🌰'], ['harvestCart', 'Charrette de récolte', '🛒'], ['redMushroom', 'Amanite', '🍄'], ['pumpkinPatch', 'Champ de citrouilles', '🎃'],
    ['woodpile', 'Tas de bûches', '🪵'], ['fallBirch', 'Bouleau doré', '🌳'],
  ]],
  ['winter', 'Neige et glace', [
    ['iceSpike', 'Pointe de glace', '🧊'], ['iceCastle', 'Château de glace', '🏰'], ['snowdrift', 'Congère', '⛄'], ['skiPole', 'Remonte-pente', '🎿'],
    ['sled', 'Luge', '🛷'], ['frozenLamp', 'Lampe gelée', '💡'], ['iceCube', 'Bloc de glace', '🧊'], ['polarBear', 'Ours polaire', '🐻‍❄'],
    ['penguin', 'Pingouin', '🐧'], ['iceArch', 'Arche de glace', '🌉'],
  ]],
  ['fair', 'Fête foraine', [
    ['ferrisWheel', 'Grande roue', '🎡'], ['carousel', 'Manège', '🎠'], ['circusTent', 'Chapiteau', '🎪'], ['popcornStand', 'Stand de pop-corn', '🍿'],
    ['cottonCandy', 'Barbe à papa', '🍭'], ['strengthTester', 'Jeu du marteau', '🔨'], ['balloonStand', 'Stand de ballons', '🎈'], ['clownHead', 'Tête de clown', '🤡'],
    ['ticketBooth', 'Guichet', '🎟'], ['dropTower', 'Tour de chute', '🗼'], ['swingRide', 'Chaises volantes', '🎠'], ['hotDogStand', 'Stand de hot-dogs', '🌭'],
    ['funHouse', 'Palais des glaces', '🪞'], ['coaster', 'Rail de montagnes russes', '🎢'],
  ]],
  ['city', 'Ville', [
    ['skyscraper', 'Gratte-ciel', '🏙'], ['apartment', 'Immeuble', '🏢'], ['shop', 'Boutique', '🏪'], ['busStop', 'Abribus', '🚏'],
    ['mailbox', 'Boîte aux lettres', '📮'], ['hydrant', 'Bouche d’incendie', '🧯'], ['trafficLight', 'Feu tricolore', '🚦'], ['bench', 'Banc', '🪑'],
    ['fountain', 'Fontaine', '⛲'], ['phoneBooth', 'Cabine téléphonique', '☎'], ['billboard', 'Panneau publicitaire', '🪧'], ['parkingMeter', 'Horodateur', '🅿'],
    ['gasPump', 'Pompe à essence', '⛽'], ['cityTree', 'Arbre de rue', '🌳'],
  ]],
  ['farm', 'Ferme', [
    ['barn', 'Grange', '🏚'], ['silo', 'Silo', '🌾'], ['tractor', 'Tracteur', '🚜'], ['woodFence', 'Barrière en bois', '🪵'],
    ['cow', 'Vache', '🐄'], ['pig', 'Cochon', '🐖'], ['sheep', 'Mouton', '🐑'], ['well', 'Puits', '🪣'],
    ['hayStack', 'Meule de foin', '🌾'], ['chickenCoop', 'Poulailler', '🐔'], ['farmWindmill', 'Moulin de ferme', '🌬'],
  ]],
  ['castle', 'Château', [
    ['castleTower', 'Tour de château', '🏰'], ['castleWall', 'Rempart', '🧱'], ['castleGate', 'Porte fortifiée', '🚪'], ['bannerPole', 'Étendard', '🚩'],
    ['catapult', 'Catapulte', '🏹'], ['knightStatue', 'Statue de chevalier', '🛡'], ['shield', 'Bouclier', '🛡'], ['dragon', 'Dragon', '🐉'],
    ['drawbridge', 'Pont-levis', '🌉'], ['campfire', 'Feu de camp', '🔥'], ['tent', 'Tente', '⛺'], ['crown', 'Couronne royale', '👑'],
  ]],
  ['wild', 'Pirates et western', [
    ['shipWreck', 'Épave de bateau', '🚢'], ['cannon', 'Canon', '💣'], ['skullFlag', 'Pavillon pirate', '🏴‍☠'], ['treasureX', 'Marque du trésor', '❌'],
    ['saloon', 'Saloon', '🍺'], ['bigCactus', 'Grand cactus', '🌵'], ['wagon', 'Chariot', '🛻'], ['tipi', 'Tipi', '⛺'],
    ['totem', 'Totem', '🗿'], ['tumbleweed', 'Boule de ronces', '🌿'],
  ]],
  ['japan', 'Japon', [
    ['torii', 'Torii', '⛩'], ['pagoda', 'Pagode', '🏯'], ['paperLantern', 'Lanterne en papier', '🏮'], ['bonsai', 'Bonsaï', '🪴'],
    ['sakura', 'Cerisier japonais', '🌸'], ['bamboo', 'Bambous', '🎋'], ['zenStone', 'Pierres zen', '🪨'], ['shrine', 'Petit sanctuaire', '⛩'],
    ['koiNobori', 'Koï-nobori', '🎏'],
  ]],
  ['sport', 'Sport', [
    ['goal', 'But de football', '🥅'], ['basketHoop', 'Panier de basket', '🏀'], ['tennisNet', 'Filet de tennis', '🎾'], ['giantBall', 'Ballon géant', '⚽'],
    ['podium', 'Podium', '🏆'], ['finishArch', 'Arche d’arrivée', '🏁'], ['startGantry', 'Portique de départ', '🚦'], ['trophy', 'Trophée', '🏆'],
    ['archeryTarget', 'Cible de tir à l’arc', '🎯'], ['rugbyPost', 'Poteaux de rugby', '🏉'],
  ]],
  ['jungle', 'Jungle', [
    ['bigLeaf', 'Grande feuille', '🍃'], ['vines', 'Lianes', '🌿'], ['tikiTotem', 'Totem tiki', '🗿'], ['jungleTree', 'Arbre de jungle', '🌴'],
    ['jungleHut', 'Hutte', '🛖'], ['parrot', 'Perroquet', '🦜'], ['fern', 'Fougère', '🌿'], ['waterfallRock', 'Cascade', '💧'],
    ['giantFlower', 'Fleur géante', '🌺'],
  ]],
  ['candy', 'Bonbons', [
    ['lollipop', 'Sucette', '🍭'], ['cupcake', 'Cupcake', '🧁'], ['donut', 'Donut', '🍩'], ['iceCreamCone', 'Cornet de glace', '🍦'],
    ['candyTree', 'Arbre en bonbons', '🍬'], ['chocolateWall', 'Mur de chocolat', '🍫'], ['cookie', 'Cookie', '🍪'], ['gumdrop', 'Gomme', '🍬'],
    ['candyHouse', 'Maison de bonbons', '🏠'], ['macaron', 'Macaron', '🧁'],
  ]],
  ['party', 'Musique et fête', [
    ['speaker', 'Enceinte', '🔊'], ['stage', 'Scène', '🎤'], ['bigGuitar', 'Guitare géante', '🎸'], ['drumKit', 'Batterie', '🥁'],
    ['piano', 'Piano', '🎹'], ['microphone', 'Micro', '🎙'], ['neonSign', 'Enseigne néon', '💡'], ['lightTruss', 'Portique de lumières', '🔦'],
    ['birthdayCake', 'Gâteau d’anniversaire', '🎂'], ['balloonBunch', 'Bouquet de ballons', '🎈'],
  ]],
];

// Identifiants à la suite de DECO_ORDER (même ordre que PACK).
export const PACK_IDS = PACK.flatMap(([, , items]) => items.map((i) => i[0]));
