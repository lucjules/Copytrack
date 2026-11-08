// Numéros de version du jeu (une seule source).
//
// VERSION : la version affichée au joueur ; à incrémenter à chaque modification livrée (package.json doit concorder : un test le vérifie).
export const VERSION = 'bêta 0.9.40';

// PHYS_VER : la version de la PHYSIQUE. Les replays, les records, les fantômes importés, les classements en ligne et les salons
// multijoueurs sont tous liés à ce numéro : un replay enregistré avec une autre physique ne redonne pas la même course.
// À incrémenter dès que la physique, la géométrie des pièces ou les circuits intégrés changent. Ce n'est plus à retenir de tête :
// `node tools/phys-fingerprint.mjs` (npm test) échoue tant que la physique a changé sans que ce numéro bouge.
export const PHYS_VER = 26;

// NET_VER : la version du PROTOCOLE du multijoueur (format du paquet d'état, messages du salon, championnat). Deux joueurs ne peuvent courir ensemble que
// s'ils ont le même PHYS_VER (même physique) ET le même NET_VER (ils se comprennent). À incrémenter dès que le format d'un message change.
// 3 (0.9.25) : message « rules » (règles de la partie choisies par l'hôte).
// 4 (0.9.38) : reconnexion (hello, bye, hostover ; place gardée 20 s, état du championnat renvoyé avec les arrivées de la manche).
export const NET_VER = 4;
