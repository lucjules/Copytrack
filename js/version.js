// Numéros de version du jeu (une seule source), et son nom.
//
// GAME_NAME : le nom du jeu tel que le joueur le voit (titres, menu, textes, auteur des circuits officiels). Les identifiants techniques gardent l'ancien
// nom « copytrack » (clés de sauvegarde du navigateur, window.copytrack, dépôt, projet du serveur) : les changer ferait perdre leurs données aux joueurs.
// index.html, manifest.webmanifest et le modèle du wiki l'écrivent aussi : tools/test-legal.mjs vérifie qu'ils concordent.
export const GAME_NAME = 'Virelo';
// Préfixe des fichiers que le jeu propose au téléchargement (vidéos, sauvegardes) : le nom en minuscules, sans accent ni espace.
export const FILE_PREFIX = GAME_NAME.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
//
// VERSION : la version affichée au joueur ; à incrémenter à chaque modification livrée (package.json doit concorder : un test le vérifie).
export const VERSION = 'bêta 0.12.5';

// PHYS_VER : la version de la PHYSIQUE. Les replays, les records, les fantômes importés, les classements en ligne et les salons
// multijoueurs sont tous liés à ce numéro : un replay enregistré avec une autre physique ne redonne pas la même course.
// À incrémenter dès que la physique, la géométrie des pièces ou les circuits intégrés changent. Ce n'est plus à retenir de tête :
// `node tools/phys-fingerprint.mjs` (npm test) échoue tant que la physique a changé sans que ce numéro bouge.
export const PHYS_VER = 38;

// NET_VER : la version du PROTOCOLE du multijoueur (format du paquet d'état, messages du salon, championnat). Deux joueurs ne peuvent courir ensemble que
// s'ils ont le même PHYS_VER (même physique) ET le même NET_VER (ils se comprennent). À incrémenter dès que le format d'un message change.
// 3 (0.9.25) : message « rules » (règles de la partie choisies par l'hôte).
// 4 (0.9.38) : reconnexion (hello, bye, hostover ; place gardée 20 s, état du championnat renvoyé avec les arrivées de la manche).
export const NET_VER = 4;
