# Plateformes de la 1.0 : cibles, mesures, ce qui est vérifié

Décisions de la phase 0 et mesures de la phase 3 (0.12.6). Ce qui ne peut se vérifier qu'à la main, sur de vrais appareils, est listé à la fin.

## Cibles

| | Cible de la 1.0 |
|---|---|
| Navigateurs | Chrome et Edge, Firefox, Safari : les deux dernières versions de chacun, sur ordinateur ; Chrome (Android) et Safari (iOS, iPadOS) récents sur mobile. **WebGL 2 requis** (three.js r170). |
| Images par seconde | 60 sur un ordinateur de milieu de gamme en qualité automatique ; 30 au moins sur un téléphone récent (qualité automatique, qui descend d'elle-même : banc d'essai au premier lancement, `js/quality.js`). |
| Chargement | Première visite : écran d'accueil utilisable en moins de **5 s en 4G**. Visites suivantes : instantané (service worker). |
| Hors ligne | Après une première visite, le jeu démarre et se joue sans réseau (fonctions en ligne exceptées, qui le disent). |
| Multijoueur | Salons en direct marqués **« bêta »** pour la 1.0 : ils n'ont pas encore été éprouvés à plusieurs, sur de vrais réseaux. |

## Chargement mesuré

`node tools/mesure-chargement.mjs` sert le jeu comme GitHub Pages (HTTP/2, gzip, sans cache), dans Chromium, avec les réseaux simulés de Chrome.
Mesure du 19 novembre 2026 (0.12.6, ordinateur de mesure : processeur rapide ; un téléphone d'entrée de gamme ajoute le temps de calcul) :

| Réseau | Visite | Écran d'accueil | Menu (après « Jouer en invité ») | Transféré |
|---|---|---|---|---|
| 4G (9 Mbit/s, 85 ms) | première | **1,2 s** | 2,1 s | 903 Ko, 181 requêtes |
| 4G (9 Mbit/s, 85 ms) | suivante | 0,4 s | 1,2 s | 0 Ko (service worker) |
| 4G lente (1,6 Mbit/s, 150 ms) | première | 5,5 s | 6,3 s | 903 Ko |
| 4G lente | suivante | 0,4 s | 1,3 s | 0 Ko |

L'objectif est tenu en 4G ; la 4G lente le dépasse d'un demi-seconde. **Décision : pas de compilation ni de minification à la publication pour la
1.0** (ce serait changer la façon de publier le site pour un gain qui ne touche que les réseaux lents). Si les essais de la phase 4 montrent que
c'est nécessaire, la piste est connue : n'afficher l'accueil qu'avec ses 38 modules (161 Ko) et charger le reste pendant que le joueur choisit son
pseudo.

## Ce que la CI vérifie à chaque envoi

- **Chromium** : la suite navigateur complète (`npm run test:browser` : démarrage, menus, courses, éditeur, multijoueur simulé, anglais, téléphone, tactile).
- **Firefox et WebKit (Safari)** : un parcours complet mais court (`tools/test-browser-moteurs.mjs`) : accueil, menu, image 3D, course au clavier,
  éditeur, perte et retour du contexte WebGL, navigation au clavier, anglais, pages légales, aucune erreur. Firefox tourne avec un écran virtuel et le
  rendu logiciel de Mesa : sans écran, il ne trouve aucun pilote OpenGL sur la machine de CI.

## Cas limites (gérés et testés)

| Cas | Comportement | Test |
|---|---|---|
| Onglet en arrière-plan, téléphone verrouillé | La course passe en pause, le son se coupe ; tout revient avec l'onglet | `test-browser` |
| Contexte WebGL perdu (mémoire graphique, pilote) | Pause, message ; l'affichage reprend quand le navigateur le rend ; sinon, au bout de 8 s, « Recharger » (rien n'est perdu) | `test-browser-moteurs` |
| Navigateur sans WebGL 2 | Pas d'écran d'accueil pour rien : un message dit quoi faire (accélération matérielle, mise à jour, autre navigateur) | `test-browser-boot` |
| Hors ligne | Le jeu redémarre depuis sa copie (service worker) jusqu'au menu ; la garde de démarrage n'efface jamais cette copie hors ligne | `test-browser-boot`, `test-hors-ligne` |
| Mise en ligne en cours (fichiers mélangés) | Réparation automatique une fois, puis « Réessayer » | `test-browser-boot` |

## Accessibilité

Clavier (flèches dans les menus, Entrée, Échap), manette (même navigation), contraste WCAG d'au moins 4,5:1 pour le texte dans les six thèmes
(`test-contraste`), taille de l'interface de 85 à 130 %, animations réduites, aides pour les daltoniens, aides à la conduite.

## À vérifier sur de vrais appareils (éditeur, avant la 1.0)

- [ ] Ordinateur portable récent (Windows ou Mac) : Chrome, Firefox, Safari ou Edge ; 60 images par seconde en course ? son ?
- [ ] Téléphone Android récent (Chrome) et iPhone (Safari) : paysage et portrait, commandes tactiles, 30 images par seconde ou plus ?
- [ ] Une manette (Xbox ou PlayStation) : menus et course.
- [ ] Un réseau mobile réel : premier chargement, puis mode avion (le jeu redémarre-t-il ?).
- [ ] Le multijoueur à deux, sur deux réseaux différents (domicile et 4G).
