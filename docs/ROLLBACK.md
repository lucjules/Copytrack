# Prototype de rollback : décision (Copytrack Evolution, E18)

**Question** : de vraies collisions déterministes entre 2 à 4 voitures sont-elles possibles en multijoueur, par un rollback (chacun simule le monde entier, prédit les commandes des autres et revient en arrière quand une vraie commande arrive) ?

**Critères** (document d'architecture) :
1. 4 voitures et 15 pas de retour arrière en moins de **4 ms par image** sur la machine de référence ;
2. **aucune désynchronisation** sur 10 000 pas, avec pertes et retards simulés.

**Décision : GO pour le prototype.** Les deux critères sont tenus, sous Node comme dans Chromium. Le prototype n'est **branché sur aucun écran** : les collisions douces d'E16 restent celles du jeu. Le rollback deviendra le mode du multijoueur seulement après le travail d'intégration décrit plus bas, et des mesures sur des appareils modestes.

## Ce qui a été construit

- `js/net/rollback.js` :
  - `RollbackWorld` : 2 à 4 voitures, une simulation par voiture (le même code que la course et le serveur) et des chocs entre voitures déterministes. Ces chocs n'utilisent que + − × ÷ et √, des opérations exactes sur tous les moteurs JavaScript.
  - Sauvegarde et restauration de l'état complet. Tout ce qui appartient au circuit est gardé par référence, le reste est copié.
  - `RollbackPeer` : la prédiction (la dernière commande connue se répète) et le retour en arrière au plus 15 pas. Au-delà, le joueur attend.
- `tools/bench-rollback.mjs` : la mesure. `tools/test-rollback.mjs` (dans `npm test`) : les mêmes propriétés en plus court. Le test navigateur vérifie que Chromium calcule le même monde que Node.

## Mesures

Machine : conteneur Linux à 4 processeurs virtuels (Intel Xeon à 2,1 GHz), Node 22.23, Chromium de Playwright. Circuit : *Éclats*. Quatre pilotes automatiques partent en grille et se percutent sans cesse : 16 717 pas avec contact sur 10 000.

**Coût par image**, pire cas à chaque image : chargement d'un état, 15 pas rejoués et sauvegardés, puis le pas présent, pour 4 voitures.

| Moteur | Médiane | 95e centile | Maximum |
|---|---|---|---|
| Node | 1,66 ms | 3,29 ms | 6,8 ms |
| Chromium | 1,2 ms | 2,2 ms | 4,8 ms |

Le maximum vient du ramasse-miettes, de temps en temps. En jeu réel, le pire cas n'arrive pas à chaque image : en moyenne, environ 4 pas sont rejoués par retour.

**Désynchronisation**, sur 10 000 pas :
- 4 joueurs, chacun avec son monde ;
- les commandes des autres arrivent avec 0 à 10 pas de retard (jusqu'à 83 ms) et 10 % des paquets sont perdus ;
- chaque paquet répète les 24 dernières commandes, environ 50 octets.

Résultats :
- les quatre mondes finissent **identiques au bit près** à la course de référence ;
- 2 637 à 3 753 retours en arrière par joueur, 10 pas au plus, aucune attente ;
- le même monde est obtenu sous **Node, Deno et Chromium**.

Reproduire : `node tools/bench-rollback.mjs` (environ 45 s ; `--json` pour les chiffres bruts).

## Réserves

- **Appareils modestes** : la machine de mesure n'est pas un téléphone d'entrée de gamme. Il peut être 3 à 5 fois plus lent : le pire cas dépasserait alors 4 ms. Pistes :
  - limiter à 2 ou 3 voitures sur mobile ;
  - réduire la fenêtre à 8 pas avec 2 pas de délai de commande ;
  - ne sauvegarder qu'un pas sur deux.

  Ces pistes sont à mesurer sur de vrais appareils avant toute mise en service.
- **Circuits à logique** (E10) : l'état du moteur de logique n'est pas encore sauvegardé. Le prototype refuse ces circuits plutôt que de désynchroniser.
- **Ce qui reste à faire pour l'intégrer** :
  - transport des commandes sur les canaux WebRTC existants ;
  - synchronisation des horloges et délai de commande ;
  - affichage des voitures distantes depuis le monde (plus d'interpolation) ;
  - arrivées et départs en pleine course, retours au checkpoint ;
  - `NET_VER` 5.

  Le multijoueur reste non classé : les temps d'une course en réseau ne vont jamais aux classements vérifiés.
