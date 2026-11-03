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

- Ligne droite, virages serré et grand, pente, **pente douce** (½ niveau), tremplin, plateforme, ponts sur plusieurs niveaux.
- **Virages relevés** (2×2 et 3×3) : la route penche vers l'intérieur, on les prend plus vite.
- **Tubes** : le tube 2×2, et le **tube modulaire** (entrée, autant de sections que voulu, sortie) dans lequel on peut monter sur la paroi, rouler au plafond et **faire des tours complets** en gardant le volant tourné. Les sections acceptent l'accélérateur et la gravité.
- **Loopings** (normal, grand, double), **tire-bouchons** droite et gauche, **montée en L** (courbe, mur vertical, sommet qui fait sauter vers le plateau).
- **Bifurcation / jonction** : deux voies au choix.
- **Anneau turbo** flottant, **checkpoint aérien** (un anneau à traverser), **checkpoint dans un virage**.
- Options de pièce : *à l'envers*, *sans bordures*, *tunnel*.

### Revêtements et véhicules

- Verglas, accélérateur, rebond, sable, aimant, boue, dérive, ralentisseur, vent latéral, gravité (réglables de faible à fort, la couleur suit), **eau**.
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

- Pose au clic, rotation, miroir, niveaux, revêtements réglables, options, décor, annuler / rétablir, pipette, sauvegarde locale, partage par code ou par lien.
- **Sélection de zone** (Q) : copier, couper / déplacer, coller avec rotation, monter / descendre, supprimer.
- **Tester depuis la pièce visée** (Maj + T), **vérificateur** (F2 : extrémités libres, sauts risqués, checkpoints inaccessibles), **vue par niveau** (Z), **nombre de tours**, **miniatures** vues de dessus.
- Décorations à placement libre (panneaux, formes, murs, toits, nature, image par URL).
- **Vérification** : il faut finir son circuit pour que le partage donne des médailles (le temps de l'auteur devient le bronze).

### Le reste

- **Garage** (purement visuel) : 8 carrosseries, moto routière ou chopper, couleurs, finitions (brillante, mate, métallisée, nacrée), LED, dessins, ornements, ailerons, roues, traînées lumineuses, klaxons (touche H), presets.
- **Pièces (monnaie)** gagnées selon la médaille et les objectifs bonus. **Profil** : un code joueur contient toute la progression.
- **Musique** synthétisée en direct, une ambiance par décor ; sons sans aucun fichier audio.
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
- Pièces en mouvement : **ascenseur** (monte de 2 niveaux) et **glissière** (se décale d'une case). Tout bouge selon le chrono : identique en replay et après un retour au checkpoint.

**Éditeur**
- **Paramètres du niveau** (F3) : nom, description, décor, tours, hors piste autorisé, vitesse, gravité et véhicule de départ.
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
tools/sim.mjs                  validation des circuits par pilote automatique (npm run sim)
```

## Licence

Code du jeu : MIT. three.js : MIT (voir `js/vendor/THREE_LICENSE.txt`).
