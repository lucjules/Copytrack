# Copytrack

Jeu de course contre-la-montre **low-poly** dans le navigateur, avec éditeur de circuits.
C'est un jeu original : décors, véhicules, pièces, musique et circuits ont été conçus pour ce projet.

Version actuelle : **bêta 0.9.47** · [historique des versions](CHANGELOG.md) · [architecture](docs/ARCHITECTURE.md) · [index des modules](docs/MODULES.md)

## Jouer

Le jeu est un site statique (HTML + modules JavaScript + three.js inclus), sans étape de compilation.

```bash
npm start
```

Puis ouvrir <http://localhost:8080>. N'importe quel serveur statique fonctionne aussi, par exemple `python3 -m http.server`.

Pour le publier avec **GitHub Pages** : *Settings → Pages → Deploy from a branch*, puis choisir la branche et le dossier `/ (root)`.
Le jeu s'**installe comme une application** (bouton d'installation du navigateur) et se joue **hors ligne** une fois chargé.

## Contenu

- **72 circuits** dans 12 décors (*Désert crépuscule*, *Jungle néon*, *Archipel tropical*, *Ville futuriste*, *Nuit polaire*, *Volcan*, *Station orbitale*, *Fonds marins*, *Usine mécanique*, *Ville dans les nuages*, *Canyon de cristal* et l'*Atelier des mécanismes*),
  rangés **du plus facile au plus dur** en 11 chapitres de carrière (un par décor, 6 circuits chacun), plus un **chapitre bonus, l'Atelier** (6 circuits qui montrent chaque obstacle et chaque pièce mobile, un par un ; il s'ouvre avec 4 médailles dans le premier chapitre). Chaque circuit a un **profil** (Sprint, Speedway, Technique, Rollercoaster, Acrobatique) et une ouverture qui lui est propre ; 2 circuits se courent en plusieurs tours (Caldeira, Grand Anneau).
- **Fiche du circuit (Race Hub)** : choisir un circuit (carrière, défi du jour, mes circuits, communauté, favoris) ouvre sa fiche : **grande carte** zoomable (départ, arrivée, checkpoints, zones, pièces mobiles, obstacles), difficulté, distance, médailles, objectif bonus, **classement** Mondial et Personnel (record, temps intermédiaires, 10 dernières courses), **rivaux en ligne** 👻 à choisir, **replay** de ton record et **★ favoris**. Le bouton **Course rapide** du menu lance en un clic le prochain circuit sans médaille.
- **HUD d'entraînement** (profil de HUD *Entraînement*, Options › Personnalisation ou la puce 🎯 de la fiche) : **écart en direct** contre ton record, le fantôme or ou le record mondial, **mini-secteurs**, vitesse maxi, forces g, courbes gaz / frein / vitesse, **ligne de la référence** et ses **repères de freinage** sur la piste. Profils *Classique*, *Compétitif*, *Entraînement*, *Minimaliste*.
- **Coach** : à l'arrivée, trois conseils localisés et chiffrés face à ton record (ou au fantôme or) — freinage trop tardif ou trop tôt, vitesse trop basse en virage, temps en l'air, trajectoire large, chocs, retours au checkpoint — et le bouton pour revoir ces passages dans le Replay Theater, où ils sont marqués sur la barre de temps.
- **Éditeur** : onglet **Prefabs** (chicane, épingle, slalom, saut, looping, wall-ride : on les colle comme le presse-papiers ; « Enregistrer la sélection » crée les tiens, partageables par un code `SHP1:`) et **ambiance** par circuit (moment de la journée, brume, musique : Paramètres du niveau ; sans effet sur la course ni sur les records).
- **Communauté** : onglet **Cette semaine** (circuits où le plus de pilotes différents ont couru), **Circuit de la semaine**, **difficulté estimée** (◆◇) sur chaque carte et à la publication. **Titres** affichés au classement, **exclusifs** du garage qui se méritent (défis du jour, Atelier, Académie) et **collections** à thème (+100 ◆).
- **Partage** : un lien de **défi** (« Partager mon fantôme » › « Copier le lien ») ouvre directement la course contre ton fantôme ; le **replay** s'exporte en **vidéo WebM** (bouton 🎬 de la barre de replay).
- **Académie** : six leçons guidées de deux minutes (conduite, dérapage, mini-turbo en série, réception parfaite, plaque de transformation, obstacles), chacune avec un objectif ; l'éditeur démarre en **mode guidé** (l'essentiel seulement) pour un nouveau joueur.
- **Carrière** : un chapitre s'ouvre avec 4 médailles dans le précédent (l'Atelier bonus : dans le premier) ; chaque circuit a un **objectif bonus** ★ (sans toucher de muret, réceptions parfaites, mini-turbos, anneaux, finir en moto…) qui rapporte 50 pièces.
- **Défi du jour** : un circuit généré à partir de la date, le même pour tout le monde, vérifié par le pilote automatique.
- **Médailles** Bronze / Argent / Or / Cristal, chronos intermédiaires, réapparition au dernier checkpoint.
- **Replays — Replay Theater** : chaque course est enregistrée (commandes seulement, la physique est déterministe) et se revoit à l'identique, de ×0,25 à ×4. Le Theater ajoute une **barre de temps** (aller et venir, secteurs et incidents marqués), jusqu'à **trois courses à comparer** sur la piste (ancien record, fantôme or, record mondial, rivaux), les caméras **libre** et **cinématique** en plus des caméras TV et orbite, et un **panneau d'analyse** (trajectoires sur la carte, vitesses, écarts, secteurs).
- **Fantômes** : ton record, le fantôme de la médaille d'or (tant qu'elle n'est pas gagnée) et le fantôme d'un ami, importé par un code `SHG1:` partageable.

### Pièces

- **Pièces à caractéristiques** (listes déroulantes dans la palette et dans l'Inspecteur) :
  - **Ligne droite** : inclinaison **plat, montée ou descente** de ½, 1, 2 ou 4 niveaux (ce qui remplace Pente, Pente douce et Tremplin) ;
  - **Virage** : rayon serré, grand ou très grand (3×3), plat ou relevé (la route penche vers l'intérieur, on le prend plus vite), et **inclinaison** plat, ½, 1, 2 ou 4 en **montée comme en descente** (un virage qui monte ou qui descend ; le sens ↱ / ↰ compte alors) ;
  - **Courbe** : un raccord de pente qui se courbe. **Début doux** (plat → pente, de plus en plus raide), **fin douce** (pente → plat) ou **en S** (plat → plat, entre deux niveaux), en montée ou en descente, d'inclinaison ½, 1, 2 ou 4 (le S existe en ½ et 1). Un début doux de ½ / 1 / 2 se raccorde **sans aucune cassure** à une ligne droite d'inclinaison 1 / 2 / 4, et la fin douce correspondante la ramène à plat : une colline entière se construit sans à-coup ;
  - **Transition** : fait basculer la route d'une orientation à l'autre (**de** Sol, Mur gauche, Mur droit ou Plafond **vers** une autre), **franche** (1 case) ou **douce** (2×2, deux fois moins de roulis par mètre, la route dans la colonne de gauche comme la vrille). Entre un mur et le plafond la gravité suit la route toute seule ;
  - **Looping** : orientation droite / gauche, taille normale / grande, 1 à 3 boucles (l'empreinte grandit : 2×2, 3×3, 4×4).
- Plateforme, ponts sur plusieurs niveaux.
- **Tubes** : le tube 2×2, et le **tube modulaire** (entrée, autant de sections que voulu, sortie) dans lequel on peut monter sur la paroi, rouler au plafond et **faire des tours complets** en gardant le volant tourné. Les sections acceptent l'accélérateur et la gravité.
- **Loopings** (normal, grand, double), **tire-bouchons** droite et gauche, **montée en L** (courbe, mur vertical, sommet qui fait sauter vers le plateau).
- **Bifurcation / jonction** : deux voies au choix.
- **Anneau turbo** flottant.
- **Options** (onglet Options) : **Orientation** (*Sol*, *Mur gauche*, *Mur droit*, *Plafond* : une ligne droite ou un virage ordinaire, pente comprise, se pose sur un mur ou au plafond ; la gauche et la droite se lisent dans le sens de la flèche de la pièce ; un mur demande le niveau 2 au moins, il descend de 9 m sous la route ; on y tient à partir de 80 km/h environ, sinon on glisse et on tombe), *sans bordures*, *tunnel*, **checkpoint** (portique, ou anneau aérien sur une ligne droite plate), **thème** visuel (Classique, Herbe, Sable, Roche), **mouvement** (ascenseur, glissière, rotation). On choisit une pièce ET des options : elles se posent ensemble, l'aperçu montre le résultat. Sans pièce choisie, une option s'applique à la pièce cliquée. Les anciennes pièces « Checkpoint » restent lisibles (bouton « Convertir en option » dans l'Inspecteur).
- **Bifurcation** : chaque voie peut avoir son revêtement (voie directe / voie déportée).

### Revêtements et véhicules

- Verglas, accélérateur, rebond, aimant, dérive, ralentisseur, vent latéral, gravité (réglables de faible à fort, la couleur suit), **eau**. Les réglages s'affichent avec des **unités réelles** (km/h, m/s², m, secondes) quand elles existent. *Sable* et *boue* ont été supprimés (les anciens circuits qui en contenaient les lisent avec une route normale).
- **Tapis roulant** réglable de −200 à +200 km/h. **Vent** plus fort (jusqu'à 54 m/s² à pleine force).
- **Verre fragile** : plus de vitesse minimale, mais un compte à rebours (0,3 à 5 s) de contact cumulé sur la dalle ; passé ce temps elle disparaît (sans collision, la voiture tombe) jusqu'au prochain départ, retour au checkpoint compris.
- **Eau** : va aussi sur le Départ (course commencée en bateau) ; la **plaque bateau** est une très légère montée de l'eau vers le sol (pour un bateau elle agit comme de l'eau, pour les autres véhicules comme une route normale).
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
- **Pot de peinture** (bouton 🪣 ou touche ²/`) : choisis une pièce ou un revêtement, puis clique une pièce pour remplir toute sa zone connectée (ou une case vide entourée de pièces pour poser la pièce choisie dans toute la zone vide fermée ; la zone est surlignée avant le clic) (même revêtement, ou même type de pièce de même taille). Départ et arrivée jamais modifiés, un seul Ctrl + Z annule tout.
- **Gomme à filtres** : *Tout*, *Décorations uniquement* ou *Pistes uniquement* (sous-menu de la gomme, ou touche X répétée). Le rayon ne touche que les objets du calque choisi.
- **Inspecter** (bouton *Inspecter*, touche `I`) : un clic sélectionne une pièce ou une décoration ; un panneau de propriétés (position, rotation, revêtement, options, taille, couleur, image...) reste lié au circuit dans les deux sens. Des **gizmos 3D** déplacent (flèches) et pivotent (cercles) l'objet directement dans la scène, la caméra reste immobile pendant le geste. Chaque geste ou réglage est un seul pas d'annulation, et l'objet sélectionné revient avec Ctrl + Z / Ctrl + Y.
- **Sélection de zone** (Q) : copier, couper / déplacer, coller avec rotation, monter / descendre, supprimer.
- **Tester depuis la pièce visée** (Maj + T), **vérificateur** (le badge ⚠ de la barre du haut signale extrémités libres, sauts risqués, raccords d'orientation et pièces inaccessibles ; un clic le détaille et fait clignoter les pièces en cause ; F2 lance la vérification complète au pilote automatique), **vue par niveau** (Z), **nombre de tours**, **miniatures** vues de dessus.
- Décorations à placement libre (panneaux, formes, murs, toits, nature, image par URL).
- **Vérification** : il faut finir son circuit pour que le partage donne des médailles (le temps de l'auteur devient le bronze).

### Multijoueur en direct

- *Communauté > Multijoueur* : créer une salle, rejoindre avec un **code de 6 caractères** ou choisir un **salon public** ; jusqu'à 8 joueurs. **Course libre** (chacun à son rythme, voitures fantômes) ou **Championnat** : plusieurs circuits à la suite, départ commun sur une grille, points par place, classement en direct, collisions douces en option.
- **Boucle asynchrone** : chacun a son chrono et recommence quand il veut (**R après l'arrivée**, sans repasser par le salon) ; on peut arriver en cours de route.
- **Circuits** : intégrés, de la communauté (par ID) ou par code. **Retour au checkpoint : le chrono ne se remet pas à zéro.** Les adversaires lointains s'assombrissent.
- Supabase Realtime ne sert qu'à se trouver et à négocier ; les positions (20 Hz) passent en **WebRTC pair à pair**. Voir `supabase/MULTI.md`.

### Le reste

- **Garage** (purement visuel) : 8 carrosseries, moto routière ou chopper, couleurs, finitions (brillante, mate, métallisée, nacrée), LED, dessins, ornements, ailerons, roues, traînées lumineuses, klaxons (touche H), presets.
- **Pièces (monnaie)** gagnées selon la médaille et les objectifs bonus. **Profil** : un code joueur contient toute la progression.
- **Musique** synthétisée en direct, une ambiance par décor ; sons sans aucun fichier audio.
- **Profil** (menu principal) : onglets *Compte*, *Sauvegardes*, *Options* et *Commandes*.
- **Langues** : **français et anglais** (~1 700 textes traduits : menus, carrière et ses 72 circuits, éditeur, communauté, multijoueur, Académie…). La langue suit le navigateur au premier lancement d'un nouvel appareil (un appareil qui a déjà des données reste en français), se change d'un clic sur l'écran d'accueil ou dans Profil › Options › Langue, et se mémorise par appareil. Un texte sans traduction reste en français : jamais d'écran cassé. Voir `js/i18n.js` pour ajouter une langue.
- **Personnalisation** : **atelier de voiture** (24 pièces libres, peinture et motifs, dessin 16 × 16, effets, code `SHC1:`), **thèmes d'interface** et **HUD déplaçable**, **caméras à toi**, **ambiance avancée** des circuits (météo, soleil, heure qui défile), **pièces décoratives perso**, **déclencheurs** sur les cases, **règles de partie** en multijoueur, **modes de jeu** à toi (codes `SHM1:`) et **paquets** (`SHX1:`) qui regroupent le tout. Rien de tout cela ne change les performances d'une voiture.
- **Options** : volume des effets et de la musique, qualité graphique (Auto, Ultra, Haute, Moyenne, Basse, Potato), compteur d'images, champ de vision, effet de vitesse, tremblements de caméra, **couleurs adaptées au daltonisme**, taille de l'interface, fantômes.
- **Tutoriel** au premier lancement. Commandes personnalisables (clavier, manette), mobile (boutons ou glisser du pouce), vibrations.
- **Easter eggs** : à toi de les trouver.

## En ligne (Supabase)

Le jeu marche entièrement hors ligne ; les fonctions en ligne utilisent un projet Supabase :

1. **Communauté** : `supabase/etape1-communaute.sql` (tables des pilotes et circuits publiés, règles de sécurité).
2. **Classements** : `supabase/etape2-classements.sql` (table des temps, en lecture seule pour le jeu) et la fonction serveur
   `supabase/functions/submit-score/index.ts`. Elle rejoue chaque course (commandes enregistrées, physique déterministe) avec le code
   du jeu publié (inclus dans la fonction) avant d'accepter un temps : un faux temps est refusé.
   Elle doit s'appeler exactement `submit-score`. Supabase refuse les imports depuis un site quelconque : `index.ts` est donc un fichier
   **autonome** généré par `npm run build:function` à partir de `server.ts`, `handler.js` et du code du jeu. Quand la physique change (`PHYS_VER`), regénérer puis redéployer.
   Réglage facultatif de la fonction : la variable `ALLOWED_ORIGIN` (par exemple `https://mon-jeu.example`) restreint les appels depuis un navigateur à ce site.

3. **Description et modification après publication** (bêta 0.9) : `supabase/etape3-description.sql` ajoute la description des
   circuits et la fonction `update_track_meta` (l'auteur peut changer le nom et la description de son circuit publié).
   Sans ce script, le jeu fonctionne, simplement sans description.

4. **Comptes et sauvegarde cloud** : `supabase/etape4-comptes.sql`, puis les réglages décrits dans `supabase/COMPTES.md`.
   Au lancement, le jeu demande un pseudo (aucun nom par défaut) : **Invité** (progression locale) ou **Compte** (pseudo + mot de passe,
   sauvegarde cloud retrouvée sur n'importe quel appareil). Mots de passe hachés (bcrypt + sel) par Supabase Auth, jamais stockés par le jeu.

5. **Durcissement** : `supabase/etape5-securite.sql` (replays des classements privés, plafond de temps par pilote, signalements et parties moins faciles à truquer). À lancer après l'étape 4.

6. **Statistiques anonymes** (facultatif) : `supabase/etape6-telemetrie.sql` crée la table `run_stats` (fermée en lecture) et la fonction `log_runs` (cadence limitée). Le jeu n'envoie rien sans l'accord du joueur ; voir `supabase/TELEMETRIE.md`.
   Sans ce script, le jeu fonctionne, simplement sans statistiques.

7. **Relais TURN du multijoueur** (facultatif) : la fonction serveur `ice` (`supabase/functions/ice/index.ts`, générée par `npm run build:function`) donne STUN + TURN à identifiants à durée limitée ; voir `supabase/MULTI.md`.

8. **Fantômes du haut des classements** : `supabase/etape7-fantomes.sql` (à lancer **avant** de redéployer `submit-score`, mais l'ordre n'est pas bloquant : sans les colonnes, la fonction enregistre le temps sans fantôme).
   La fonction `submit-score` range alors, avec chaque record, le fantôme de la course qu'elle vient de rejouer (positions, jamais les commandes) ; le classement affiche un bouton 👻 pour affronter les dix premiers.
   Les records d'avant l'étape 7 n'ont pas de fantôme : `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node tools/backfill-ghosts.mjs` leur en fabrique un (ou leur auteur renvoie son temps).

9. **Découverte et titres** (facultatif) : `supabase/etape8-decouverte.sql` ajoute l'onglet « Cette semaine » et le « Circuit de la semaine » de la communauté (`trending_tracks`, d'après `track_plays`) et les titres affichés au classement (`players.title`, `set_title` à liste blanche). Sans lui, le jeu fonctionne : « Cette semaine » retombe sur « Plus joués », les titres restent locaux.

10. **Classements par secteur** : `supabase/etape9-secteurs.sql` (colonne `scores.splits`, fonction `sector_board`). Puis **redéployer `submit-score`** : elle range alors les temps intermédiaires de chaque record. Les records déjà enregistrés : `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node tools/backfill-sectors.mjs` (ou leur auteur renvoie son temps).

11. **Amis et abonnements** : `supabase/etape10-social.sql` (tables `friends` et `follows`, fonctions de demande, de réponse, de classement entre amis et d'abonnement ; une demande n'est visible que des deux intéressés). Les amis sont réservés aux comptes.

12. **Saisons hebdomadaires** : `supabase/etape11-saisons.sql` (saisons, divisions, historique, clôture). Les saisons se closent d'elles-mêmes : le jeu appelle `close_due_seasons()` avant d'afficher une saison. Pour une clôture à l'heure dite, active l'extension **pg_cron** (Supabase › Database › Extensions) puis lance `select cron.schedule('copytrack-saisons', '5 0 * * 1', 'select public.close_due_seasons()');`. Les temps de saison passent par `submit-score` (à redéployer), qui ne les accepte que pendant la semaine de la saison.

13. **Compétition asynchrone** : `supabase/etape12-competition.sql` (duels entre amis classés au **Elo**, tournois privés, historique). Puis **redéployer `submit-score`** : elle vérifie en base qu'un temps de duel ou de tournoi vient d'un participant, avant l'échéance. Les duels échus et les tournois finis se règlent d'eux-mêmes (`settle_due()`, appelée par le jeu) ; pour une clôture à l'heure dite : `select cron.schedule('copytrack-competition', '*/10 * * * *', 'select public.settle_due()');` (pg_cron).

14. **Communauté 2** : `supabase/etape13-communaute.sql` (commentaires, playlists, sélection, circuit au hasard, recommandations, statistiques de circuit calculées depuis `run_stats`, modes publiés). **Modération** : ajouter les comptes modérateurs à la main, avec la clé de service (`insert into public.moderators values ('<uuid du compte>');`) ; un modérateur choisit la Sélection (`pick_track`) et masque ou rétablit un circuit, un commentaire ou un mode (`mod_hide`). Sans modérateur, la Sélection reste vide, et les signalements (3 comptes distincts) masquent déjà commentaires et modes d'eux-mêmes.

Sans les étapes 9 à 13, le jeu fonctionne : les onglets Secteurs, Amis et Saison des classements, l'écran Compétition, les commentaires, playlists et modes publiés disent qu'une étape SQL manque, sans fausses données.

Les scripts sont relançables et testés sur PostgreSQL (`npm run test:sql`).

### Héberger ta propre version

L'URL du projet Supabase, sa clé **publique** et les serveurs réseau du multijoueur (STUN, et un relais TURN pour les réseaux qui bloquent le pair à pair) sont dans `js/config.js`.
Pour ne pas modifier le code, définis avant le chargement du jeu, dans `index.html` :

```html
<script>window.COPYTRACK_CONFIG = { supabase: { url: 'https://….supabase.co', key: 'sb_publishable_…' }, iceServers: [ { urls: 'stun:stun.l.google.com:19302' } ] };</script>
```

La clé secrète n'est jamais dans le jeu : seule la fonction serveur l'utilise, côté Supabase. Les identifiants d'un relais TURN, eux, sont lisibles par les joueurs : utilise des identifiants à durée limitée.

## Mettre en ligne une nouvelle version (aide-mémoire)

1. `npm test` doit finir sans erreur (il vérifie aussi que `sw.js`, le préchargement des modules de `index.html` et `docs/MODULES.md` sont à jour) ; `npm run lint` aussi.
2. Après tout changement de circuit, de pièce ou de physique : `npm run sw` (cache hors ligne et préchargement) puis `npm run build:function` (fonction serveur).
   Un changement de physique impose aussi d'incrémenter `PHYS_VER` : la procédure complète est dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#changer-la-physique-la-procédure).
3. **Redéployer la fonction `submit-score`** dans Supabase avec le nouveau `index.ts` : sans cela, les temps des circuits changés sont refusés en ligne.
4. Les records d'un circuit repartent de zéro dès que son tracé change (la clé de classement contient son empreinte) : rien à nettoyer côté base.
5. Si le temps d'un circuit change volontairement : `node tools/golden.mjs --update`, puis `node tools/medals.mjs --check` pour revoir ses médailles.
6. Publier la branche (GitHub Pages sert le dossier racine) ; le numéro de version est dans `js/version.js` et `package.json` (les deux doivent concorder, un test le vérifie).

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
| M | Miroir (looping, tire-bouchon, bifurcation) |
| B | Revêtement suivant |
| Q | Outil Sélection |
| I | Outil Inspecter (Ctrl + D : dupliquer la pièce ou la décoration inspectée) |
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

## Structure et contribution

```
index.html, css/style.css       interface
manifest.webmanifest, sw.js     application installable, jeu hors ligne (sw.js généré par tools/gen-sw.mjs)
js/                             le jeu : modèle, simulation, rendu, application, en ligne (index : docs/MODULES.md)
supabase/                       scripts SQL, fonction serveur « submit-score », notes comptes et multijoueur
tools/                          tests (npm test), atelier de level design, générateurs de fichiers
docs/                           ARCHITECTURE.md (comment ça s'emboîte), MODULES.md (index généré), fiche d'essai des circuits
```

Lire d'abord [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Avant de proposer un changement :

- `npm run lint` et `npm test` (≈ 20 s) ; `npm run test:browser` si Playwright et Chromium sont installés ; `npm run test:deno` pour la physique sous Deno (le moteur de la fonction serveur) ;
- le **noyau de simulation** (physique, pièces, circuits, pilote automatique…) n'utilise pas `Math.sin`, `Math.atan2`, `Math.pow`, `**`… mais `js/dmath.js` : sinon la vérification serveur et les replays divergent d'un moteur à l'autre ;
- un changement de physique incrémente `PHYS_VER` (`js/version.js`) ; `tools/phys-fingerprint.mjs` échoue tant que ce n'est pas fait ;
- les fichiers générés (`sw.js`, `supabase/functions/submit-score/index.ts`, `docs/MODULES.md`, `tools/phys-fingerprint.json`) se régénèrent, ils ne se modifient pas à la main ;
- un nouveau module commence par un commentaire de tête (sa première phrase devient sa ligne de l'index) ; `npm run docs` met l'index à jour.

La CI (`.github/workflows/test.yml`) rejoue tout cela : lint et tests, physique sous Deno, navigateur, SQL.

## Licence

Code du jeu : MIT. three.js : MIT (voir `js/vendor/THREE_LICENSE.txt`).

## Format des circuits (SHW3) et compatibilité

Chaque pièce est sérialisée comme **type concret** (index dans `PIECE_ORDER`, qui ne fait qu'ajouter) + position, niveau, rotation, revêtement,
paramètre et drapeaux : les anciens codes se lisent donc toujours à l'identique. Les **familles** (`js/families.js`) ne sont qu'une couche d'édition :
elles traduisent des caractéristiques (inclinaison, rayon, nombre de boucles…) vers un type concret et inversement.
Les champs de la Phase 2 sont **optionnels** et rangés à part dans `data.e` (une entrée par pièce concernée, par index) :
`cp` checkpoint (1 portique, 2 anneau), `th` thème, `ms` / `ma` vitesse et amplitude du mouvement, `col` couleurs personnalisées, `s2` / `p2` 2e revêtement
d'une bifurcation, `o` orientation (1 mur gauche, 2 mur droit ; le plafond reste le drapeau `v`) ; couleur libre d'une décoration (10e valeur). Le code reste en version 3 tant qu'aucun de ces champs n'est utilisé.
La signature (clé des classements et de la vérification) ignore le thème et les couleurs, et reste identique pour tout circuit qui n'utilise rien de nouveau.
