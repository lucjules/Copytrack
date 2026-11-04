# Copytrack

Jeu de course contre-la-montre **low-poly** dans le navigateur, avec éditeur de circuits.
C'est un jeu original : décors, véhicules, pièces, musique et circuits ont été conçus pour ce projet.

Version actuelle : **bêta 0.9**

## Jouer

Le jeu est un site statique (HTML + modules JavaScript + three.js inclus), sans étape de compilation.

```bash
npm start
```

Puis ouvrir <http://localhost:8080>. N'importe quel serveur statique fonctionne aussi, par exemple `python3 -m http.server`.

Tests : `npm test` (pot de peinture de l'éditeur, physique à l'envers, caméra, puis les 66 circuits au pilote automatique).

Pour le publier avec **GitHub Pages** : *Settings → Pages → Deploy from a branch*, puis choisir la branche et le dossier `/ (root)`.
Le jeu s'**installe comme une application** (bouton d'installation du navigateur) et se joue **hors ligne** une fois chargé.

## Contenu

- **42 circuits** dans 7 décors (*Désert crépuscule*, *Nuit polaire*, *Jungle néon*, *Ville futuriste*, *Archipel tropical*, *Volcan*, *Station orbitale*),
  rangés **du plus facile au plus dur** en 7 chapitres de carrière. Chaque circuit mélange plusieurs familles de pièces ; 4 circuits se courent en plusieurs tours.
- **Carrière** : un chapitre s'ouvre avec 4 médailles dans le précédent ; chaque circuit a un **objectif bonus** ★ (sans toucher de muret, réceptions parfaites, mini-turbos, anneaux, finir en moto…) qui rapporte 50 pièces.
- **Défi du jour** : un circuit généré à partir de la date, le même pour tout le monde, vérifié par le pilote automatique.
- **Médailles** Bronze / Argent / Or / Cristal, chronos intermédiaires, réapparition au dernier checkpoint.
- **Replays** : chaque course est enregistrée (commandes seulement, la physique est déterministe) et peut être revue à l'identique, de ×0,25 à ×4, avec des caméras TV et orbite.
- **Fantômes** : ton record, le fantôme de la médaille d'or (tant qu'elle n'est pas gagnée) et le fantôme d'un ami, importé par un code `SHG1:` partageable.

### Pièces

- **Pièces à caractéristiques** (listes déroulantes dans la palette et dans l'Inspecteur) :
  - **Ligne droite** : inclinaison plat, ½, 1, 2 ou 4 niveaux (ce qui remplace Pente, Pente douce et Tremplin) ;
  - **Virage** : rayon serré, grand ou très grand (3×3), plat ou relevé (la route penche vers l'intérieur, on le prend plus vite) ;
  - **Courbe** : un tremplin courbé, c'est-à-dire un virage qui monte (inclinaison ½, 1, 2 ou 4, serré ou grand, droite ou gauche) ;
  - **Looping** : orientation droite / gauche, taille normale / grande, 1 à 3 boucles (l'empreinte grandit : 2×2, 3×3, 4×4).
- Plateforme, ponts sur plusieurs niveaux.
- **Tubes** : le tube 2×2, et le **tube modulaire** (entrée, autant de sections que voulu, sortie) dans lequel on peut monter sur la paroi, rouler au plafond et **faire des tours complets** en gardant le volant tourné. Les sections acceptent l'accélérateur et la gravité.
- **Loopings** (normal, grand, double), **tire-bouchons** droite et gauche, **montée en L** (courbe, mur vertical, sommet qui fait sauter vers le plateau).
- **Bifurcation / jonction** : deux voies au choix.
- **Anneau turbo** flottant.
- **Options** (onglet Options) : *à l'envers*, *sans bordures*, *tunnel*, **checkpoint** (portique, ou anneau aérien sur une ligne droite plate), **thème** visuel (Classique, Herbe, Sable, Roche), **mouvement** (ascenseur, glissière, rotation). On choisit une pièce ET des options : elles se posent ensemble, l'aperçu montre le résultat. Sans pièce choisie, une option s'applique à la pièce cliquée. Les anciennes pièces « Checkpoint » restent lisibles (bouton « Convertir en option » dans l'Inspecteur).
- **Bifurcation** : chaque voie peut avoir son revêtement (voie directe / voie déportée).

### Revêtements et véhicules

- Verglas, accélérateur, rebond, aimant, dérive, ralentisseur, vent latéral, gravité (réglables de faible à fort, la couleur suit), **eau**. Les réglages s'affichent avec des **unités réelles** (km/h, m/s², m, secondes) quand elles existent. *Sable* et *boue* ont été supprimés (les anciens circuits qui en contenaient les lisent avec une route normale).
- **Tapis roulant** réglable de −200 à +200 km/h. **Vent** plus fort (jusqu'à 54 m/s² à pleine force).
- **Verre fragile** : plus de vitesse minimale, mais un compte à rebours (0,3 à 5 s) de contact cumulé sur la dalle ; passé ce temps elle disparaît (sans collision, la voiture tombe) jusqu'au prochain départ, retour au checkpoint compris.
- **Eau** : va aussi sur le Départ (course commencée en bateau) ; la **plaque bateau** est posée sur l'eau.
- **Tunnel** : ses parois et son toit sont physiques, on n'en sort plus par les côtés.
- **Plaques de transformation** (repasser sur la même plaque rend la voiture) :
  - **moto** : démarre plus fort, tourne plus serré, vitesse de pointe un peu plus basse ;
  - **bateau** : indispensable sur l'eau (une voiture y coule), se traîne sur la route ;
  - **deltaplane** : la même voiture avec une aile delta au-dessus ; elle **plane** au-dessus du vide, vire en inclinant l'aile, gaz pour piquer, frein pour cabrer.

### Pilotage

- Physique déterministe (pas fixe de 1/120 s) à modèle « bicyclette » : le volant oriente les roues avant, les pneus font tourner la voiture.
- **Dérapage au frein** (pas de bouton) : freiner en tournant franchement à bonne vitesse fait décrocher l'arrière ; garder le volant prolonge la glisse.
  Une glisse assez longue donne un **mini-turbo** (deux niveaux, étincelles bleues puis orange).
- **En l'air**, le volant ne tourne que les roues ; accélérer fait plonger le nez, freiner le relève. La **réception** est parfaite, correcte ou ratée (perte de vitesse) selon l'assiette.
- **Physique réelle de l'appui** sur les loopings, tubes, virages relevés, murs et routes à l'envers : l'adhérence dépend de la force qui plaque les roues. Trop lent, on décroche.
- Traces de pneus, quatre caméras (poursuite, proche, capot, lointaine), effet de vitesse au-delà de 180 km/h.

### Éditeur

- **Interface** : barre du haut avec un menu ☰ (Nouveau, Importer, Partager, Enregistrer, Retour), grille **Outils** à gauche (Sélection, Inspecter, Gomme, Pot de peinture), panneau des pièces ancré en bas (onglets Pièces, Options, Revêtements, Décors ; les décors par catégories). Le nom et la description du circuit se choisissent à la publication.

- Pose au clic, rotation, miroir, niveaux, revêtements réglables, options, décor, annuler / rétablir, pipette, sauvegarde locale, partage par code ou par lien.
- **Pot de peinture** (bouton 🪣 ou touche ²/`) : choisis une pièce ou un revêtement, puis clique une pièce pour remplir toute sa zone connectée (même revêtement, ou même type de pièce de même taille). Départ et arrivée jamais modifiés, un seul Ctrl + Z annule tout.
- **Gomme à filtres** : *Tout*, *Décorations uniquement* ou *Pistes uniquement* (sous-menu de la gomme, ou touche X répétée). Le rayon ne touche que les objets du calque choisi.
- **Inspecter** (bouton *Inspecter*, touche `\`) : un clic sélectionne une pièce ou une décoration ; un panneau de propriétés (position, rotation, revêtement, options, taille, couleur, image...) reste lié au circuit dans les deux sens. Des **gizmos 3D** déplacent (flèches) et pivotent (cercles) l'objet directement dans la scène, la caméra reste immobile pendant le geste. Chaque geste ou réglage est un seul pas d'annulation, et l'objet sélectionné revient avec Ctrl + Z / Ctrl + Y.
- **Sélection de zone** (Q) : copier, couper / déplacer, coller avec rotation, monter / descendre, supprimer.
- **Tester depuis la pièce visée** (Maj + T), **vérificateur** (F2 : extrémités libres, sauts risqués, checkpoints inaccessibles), **vue par niveau** (Z), **nombre de tours**, **miniatures** vues de dessus.
- Décorations à placement libre (panneaux, formes, murs, toits, nature, image par URL).
- **Vérification** : il faut finir son circuit pour que le partage donne des médailles (le temps de l'auteur devient le bronze).

### Multijoueur en direct

- *Communauté > Multijoueur* : créer une salle ou rejoindre avec un **code de 6 caractères** ; jusqu'à 8 joueurs, en voitures fantômes (sans collision).
- **Boucle asynchrone** : chacun a son chrono et recommence quand il veut (**R après l'arrivée**, sans repasser par le salon) ; on peut arriver en cours de route.
- **Circuits** : intégrés, de la communauté (par ID) ou par code. **Retour au checkpoint : le chrono ne se remet pas à zéro.** Les adversaires lointains s'assombrissent.
- Supabase Realtime ne sert qu'à se trouver et à négocier ; les positions (20 Hz) passent en **WebRTC pair à pair**. Voir `supabase/MULTI.md`.

### Le reste

- **Garage** (purement visuel) : 8 carrosseries, moto routière ou chopper, couleurs, finitions (brillante, mate, métallisée, nacrée), LED, dessins, ornements, ailerons, roues, traînées lumineuses, klaxons (touche H), presets.
- **Pièces (monnaie)** gagnées selon la médaille et les objectifs bonus. **Profil** : un code joueur contient toute la progression.
- **Musique** synthétisée en direct, une ambiance par décor ; sons sans aucun fichier audio.
- **Profil** (menu principal) : onglets *Compte*, *Sauvegardes*, *Options* et *Commandes*.
- **Options** : volume des effets et de la musique, qualité graphique (haute, moyenne, basse), compteur d'images, champ de vision, effet de vitesse, tremblements de caméra, **couleurs adaptées au daltonisme**, taille de l'interface, fantômes.
- **Tutoriel** au premier lancement. Commandes personnalisables (clavier, manette), mobile (boutons ou glisser du pouce), vibrations.
- **Easter eggs** : à toi de les trouver.

## En ligne (Supabase)

Le jeu marche entièrement hors ligne ; les fonctions en ligne utilisent un projet Supabase :

1. **Communauté** : `supabase/etape1-communaute.sql` (tables des pilotes et circuits publiés, règles de sécurité).
2. **Classements** : `supabase/etape2-classements.sql` (table des temps, en lecture seule pour le jeu) et la fonction serveur
   `supabase/functions/submit-score/index.ts`. Elle rejoue chaque course (commandes enregistrées, physique déterministe) avec le code
   du jeu publié (inclus dans la fonction) avant d'accepter un temps : un faux temps est refusé.
   Elle doit s'appeler exactement `submit-score`. Supabase refuse les imports depuis un site quelconque : `index.ts` est donc un fichier
   **autonome** généré par `npm run build:function` à partir de `server.ts` et du code du jeu. Quand la physique change (`PHYS_VER`), regénérer puis redéployer.

3. **Description et modification après publication** (bêta 0.9) : `supabase/etape3-description.sql` ajoute la description des
   circuits et la fonction `update_track_meta` (l'auteur peut changer le nom et la description de son circuit publié).
   Sans ce script, le jeu fonctionne, simplement sans description.

4. **Comptes et sauvegarde cloud** : `supabase/etape4-comptes.sql`, puis les réglages décrits dans `supabase/COMPTES.md`.
   Au lancement, le jeu demande un pseudo (aucun nom par défaut) : **Invité** (progression locale) ou **Compte** (pseudo + mot de passe,
   sauvegarde cloud retrouvée sur n'importe quel appareil). Mots de passe hachés (bcrypt + sel) par Supabase Auth, jamais stockés par le jeu.

Seules l'URL du projet et la clé publique sont dans `js/online.js`. La clé secrète n'est jamais dans le jeu : seule la fonction serveur l'utilise, côté Supabase.

## Bêta 0.9

**Pilotage**
- **T** recommence le niveau ; **R** revient au dernier checkpoint et remet le chrono au temps de ce checkpoint.
- Vent latéral et Dérive réparés (le vent pousse vraiment, la dérive fait glisser l'arrière).
- Aimant : colle toujours au maximum. Conduite identique au sol sur les pièces spéciales (virages relevés, loopings, tubes).
- Un peu plus de contrôle en l'air ; le nez se relève plus vite avec S. La caméra suit la route dans les loopings, vrilles et virages relevés.

**Gravité inversée et pièces à l'envers**
- Revêtement **Inversion de gravité** : la plaque projette la voiture vers le haut, une pièce posée à l'envers la réceptionne ; une 2e plaque la remet à l'endroit. Sur une vrille, la gravité suit la route.
- **Toutes les pièces** peuvent être posées à l'envers (au moins un niveau au-dessus du sol) : on n'y roule qu'en gravité inversée.

**Revêtements**
- Sur **toutes les pièces** (virages relevés, loopings, tubes, plafond), mêmes effets partout ; tableau de compatibilité dans l'éditeur.
- Nouveaux : **Tapis roulant**, **Ressort latéral** (saut d'une voie), **Verre fragile** (cède si on est trop lent ou si on atterrit trop fort), **Poudreuse**, **Volant inversé**, **Moteur coupé**.
- Eau animée (houle, écume), tapis qui défile, verre qui scintille, neige qui pétille ; motifs plus parlants pour tous les revêtements.

**Obstacles et pièces mobiles**
- Obstacles (catégorie de décor) : piques et piques escamotables (retour au checkpoint), boule balancier, marteau tournant, mur coulissant, balayeur, bumper (chocs physiques).
- Pièces en mouvement : **ascenseur** (monte de 2 niveaux), **glissière** (se décale d'une case) et **rotation** (tourne autour de son centre et emporte la voiture). Vitesse et amplitude se règlent dans l'Inspecteur. Tout bouge selon le chrono : identique en replay et après un retour au checkpoint.

**Éditeur**
- **Inspecteur** (outil Inspecter) : onglet *Propriétés* (position, caractéristiques de la pièce, revêtement, options, réglages des pièces mobiles) et onglet *Couleurs* (route, lignes, bordures d'une pièce ; couleur libre d'une décoration). Une flèche blanche semi-transparente indique le sens de parcours de la pièce inspectée.
- **Paramètres du niveau** (F3) : décor, tours, hors piste autorisé, vitesse, gravité et véhicule de départ, **inversion de gravité au départ** (`inversionGraviteDepart` : la course démarre au plafond). Hauteur maximale : 60 niveaux.
- **Visée par rayon** : revêtements, options, pot de peinture et pipette ciblent la pièce exacte sous le curseur, à n'importe quelle hauteur. Les **décorations** se posent n'importe où (coordonnées flottantes, là où le curseur touche la route ou le sol) ; **Maj + souris** déplace la pièce ou la décoration ciblée sur l'axe vertical seul. Les anneaux se posent sur des cases déjà occupées ; l'**anneau turbo** existe aussi en option d'une ligne droite.
- **Essai sans arrivée** : le bouton Tester accepte un circuit sans pièce Arrivée (la vérification, elle, en exige une).
- **✔ Vérifier** lance la course complète ; à l'arrivée : Publier, Retour à l'éditeur ou Refaire un meilleur temps. **Ton temps devient la médaille cristal**, les autres sont déduites.
- Nom et description modifiables après publication ; les classements ne dépendent plus du nom.
- Palette sur toute la largeur (jusqu'à 3 lignes), barre du haut réorganisée, 39 nouvelles décorations (Souterrain, Nuages, Fonds marins, Usine, Espace, Circuit).

**Thèmes et circuits**
- 4 nouveaux thèmes : **Canyon de cristal**, **Ville dans les nuages**, **Fonds marins**, **Usine mécanique** ; la Station orbitale gagne Voie lactée, nébuleuses, galaxie spirale et étoiles filantes.
- **66 circuits** (24 nouveaux) ; la carrière compte **11 chapitres, un par thème**, du plus facile au plus dur.
- Défi du jour calculé en temps universel (le même pour tout le monde). Éclats secrets retirés.
- La physique ayant changé, les records repartent de zéro ; **la fonction serveur `submit-score` doit être redéployée** (fichier `supabase/functions/submit-score/index.ts` régénéré).

## Bêta 0.8

- **Classements par circuit** (circuits intégrés, défi du jour, circuits de la communauté) : chaque nouveau record est envoyé et vérifié par rejeu côté serveur ; place mondiale affichée à l'arrivée, top 10 avec le bouton 🏆. Option pour ne pas envoyer ses temps.

- **Communauté** (en ligne, avec Supabase) : publier un circuit vérifié depuis « Partager », le retrouver dans le menu Communauté (récents, populaires, plus joués, mes publications, recherche), le jouer sans code, l'aimer, le copier dans « Mes circuits », le signaler. Pilote anonyme : seul le pseudo est enregistré.
- La base se prépare avec `supabase/etape1-communaute.sql` (à lancer dans l'éditeur SQL de Supabase) ; la connexion anonyme doit être activée. Sans réseau, le jeu marche comme avant.

## Bêta 0.7

- À la place de l'ancien demi-tube : un **tube modulaire** (entrée, sections, sortie = entrée retournée). Dans un tube long, on peut rouler sur la paroi, au plafond, et faire des tours complets ; la voiture garde sa position sur la paroi d'une section à l'autre. Les sections peuvent recevoir un accélérateur ou une gravité réduite.
- Des tubes longs ajoutés dans 6 circuits (dont Glacier Magnétique, à l'endroit de l'ancien demi-tube) et dans le défi du jour. Médailles recalculées.

## Bêta 0.6

- **Bosses réalistes** : quand une pente monte puis redescend (ou passe au plat), la route « tombe » sous la voiture et elle décolle, d'autant plus haut qu'elle va vite. Avant, elle restait collée au sol comme sur un revêtement Aimant (seul l'Aimant garde cet effet).
- Une bosse de pente se prend sans perte de vitesse à la réception (tolérance d'assiette un peu plus large).
- Un checkpoint passé en sautant juste au-dessus compte bien.
- Éditeur : Ctrl + C / V / X / Z ne déclenchent plus en même temps l'action de la touche seule (niveau −, vrille, gomme, vue par niveau) ; « Tester ici » part dans le bon sens.
- Téléphone en paysage : le menu principal tient sur l'écran (deux colonnes).
- La barre de replay disparaît toujours en quittant un replay ; le klaxon est indiqué dans l'aide de course.

## Bêta 0.5

- Le jeu s'appelle désormais **Copytrack** et passe en version bêta (0.5).
- Le demi-tube est retiré (dans les anciens codes de circuit, il devient une ligne droite).

## Nouveautés de la v1.5 (devenue bêta 0.5)

- 42 circuits (12 nouveaux, les 30 autres retravaillés), du plus facile au plus dur, deux nouveaux décors : Volcan et Station orbitale.
- Nouvelles pièces : virages relevés, tube, tire-bouchons, bifurcations, anneaux turbo, checkpoints aériens et en virage, pente douce.
- Bateau, deltaplane et revêtement Eau.
- Mode carrière avec objectifs bonus, défi du jour, replays, fantômes de la médaille d'or et d'amis.
- Assiette en l'air, réceptions, mini-turbo, traces de pneus, caméra lointaine.
- Éditeur : sélection et copier-coller, test depuis le curseur, vérificateur, vue par niveau, tours multiples, miniatures.
- Garage : carrosseries Pick-up et Monoplace, moto Chopper, finitions, traînées, klaxons.
- Musique, accessibilité, qualité graphique moyenne, compteur d'images, application installable hors ligne, tutoriel.
- La physique ayant changé, les records repartent de zéro (les pièces, le garage et les circuits enregistrés sont conservés).

## Commandes par défaut

| Touche | Action |
| --- | --- |
| ↑ / Z (W) | Accélérer (en l'air : piquer du nez) |
| ↓ / S | Freiner, marche arrière (en l'air : relever le nez) |
| ← → / Q D (A D) | Tourner |
| Frein + volant | Dérapage |
| R | Revenir au dernier checkpoint (chrono remis au temps du checkpoint) |
| T / Entrée | Recommencer le niveau |
| C | Changer de caméra |
| H | Klaxon |
| Échap / P | Pause |

Pendant un replay : Espace pause, ← → vitesse, C caméra (dont TV et orbite), Entrée recommencer, Échap quitter.

### Éditeur

| Touche / souris | Action |
| --- | --- |
| Clic | Poser une pièce (glisser pour en poser plusieurs) |
| Clic droit | Supprimer |
| Clic droit glissé | Tourner la vue |
| Clic molette | Pipette (pièce, rotation et niveau) |
| Molette | Zoom |
| Maj + molette, E / C, Page↑ / Page↓ | Changer de niveau |
| R (Maj + R) | Pivoter (sens inverse) |
| Tab (Maj + Tab) | Pièce suivante (précédente) |
| 1 … 0, P, U, I, V, L, K, J, O, Y | Choisir une pièce (Y : entrée de tube) |
| M | Miroir (looping, tire-bouchon, bifurcation) |
| B | Revêtement suivant |
| Q | Outil Sélection |
| Ctrl + C / X / V / A | Copier / déplacer / coller / tout sélectionner |
| Z | Vue par niveau |
| F2 | Vérifier le circuit |
| N | Accrochage des décorations |
| [ ] ou Alt + molette | Taille de la décoration |
| X / Suppr | Gomme (ou supprimer la sélection) |
| F | Recentrer la vue |
| H | Vue de dessus |
| G | Afficher / masquer la grille |
| T (Maj + T) | Tester le circuit (depuis la pièce visée) |
| F1 ou ? | Liste des raccourcis |
| Ctrl + Z / Ctrl + Y / Ctrl + S | Annuler / rétablir / enregistrer |

## Structure

```
index.html, css/style.css     interface
manifest.webmanifest, sw.js    application installable, jeu hors ligne (sw.js généré par tools/gen-sw.mjs)
js/main.js                     orchestration (menu, carrière, course, éditeur, options, tutoriel)
js/pieces.js, js/track.js      pièces, revêtements, modèle de circuit, codes de partage (SHW3)
js/families.js, js/tileInfo.js familles de pièces et caractéristiques, aides de l'éditeur (flèche, changement d'empreinte)
js/ribbons.js                  rubans 3D (loopings, tube, virages relevés, tire-bouchons, L vertical)
js/physics.js                  physique (sol, air, deltaplane, bateau, rubans à section courbe)
js/replay.js                   enregistrement des commandes, replays, fantômes simulés (SHG1)
js/career.js, js/daily.js      carrière et objectifs, défi du jour généré
js/editor.js, editorTools.js   éditeur, sélection, vérificateur, miniatures
js/race.js, js/raceLogic.js    course, caméras, effets, checkpoints, tours
js/carModel.js, garage.js      voiture, moto, bateau, deltaplane, garage
js/cosmetics.js, profile.js    catalogue visuel, pièces, code joueur
js/scenery.js, music.js        7 décors, musique générée
js/trackMesh.js, js/geo.js     maillages low-poly
js/tracks.js                   42 circuits intégrés, médailles et objectifs
tools/test-phase3.mjs          tests du raycast, décorations libres, verre fragile, tunnel, unités (npm test)
tools/test-phase2.mjs          tests des familles, du schéma JSON, des courbes, options, mouvements (npm test)
tools/sim.mjs                  validation des circuits par pilote automatique (npm run sim)
```

## Licence

Code du jeu : MIT. three.js : MIT (voir `js/vendor/THREE_LICENSE.txt`).

## Format des circuits (SHW3) et compatibilité

Chaque pièce est sérialisée comme **type concret** (index dans `PIECE_ORDER`, qui ne fait qu'ajouter) + position, niveau, rotation, revêtement,
paramètre et drapeaux : les anciens codes se lisent donc toujours à l'identique. Les **familles** (`js/families.js`) ne sont qu'une couche d'édition :
elles traduisent des caractéristiques (inclinaison, rayon, nombre de boucles…) vers un type concret et inversement.
Les champs de la Phase 2 sont **optionnels** et rangés à part dans `data.e` (une entrée par pièce concernée, par index) :
`cp` checkpoint (1 portique, 2 anneau), `th` thème, `ms` / `ma` vitesse et amplitude du mouvement, `col` couleurs personnalisées, `s2` / `p2` 2e revêtement
d'une bifurcation ; couleur libre d'une décoration (10e valeur). Le code reste en version 3 tant qu'aucun de ces champs n'est utilisé.
La signature (clé des classements et de la vérification) ignore le thème et les couleurs, et reste identique pour tout circuit qui n'utilise rien de nouveau.
