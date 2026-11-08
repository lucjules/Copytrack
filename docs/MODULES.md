# Index des modules

*Fichier généré par `npm run docs` (`tools/gen-docs.mjs`) : ne pas le modifier à la main. Le rôle de chaque module est la première phrase du commentaire de tête du fichier.*
La vue d'ensemble (principes, déterminisme, flux d'une course) est dans [ARCHITECTURE.md](ARCHITECTURE.md).


## `js/`

| Fichier | Rôle |
| --- | --- |
| `academy.js` | Académie : six leçons guidées, de très courts circuits qui apprennent UNE chose chacune (conduite, dérapage, mini-turbo, réception, plaque de transformation, obstacles), avec un objectif à réussir. Données et règles pures ; l'écran et le lancement sont dans app/academy.js. Aucune médaille, aucun record, aucune statistique : on s'entraîne. |
| `account.js` | Comptes Copytrack : pseudo + mot de passe, sauvegarde cloud entre appareils. Les invités restent locaux. |
| `ambiance.js` | Ambiance d'un circuit (0.9.18) : le MOMENT de la journée, la BRUME et la MUSIQUE, au choix de l'auteur, par-dessus le décor. Purement visuel et sonore : aucun effet sur la physique, les temps ni la signature du circuit (changer l'ambiance ne fait perdre ni la vérification ni les records). Module sans rendu : resolveAmbiance renvoie les réglages à appliquer à la scène (scenery.js). |
| `audio.js` | Effets sonores synthétisés (Web Audio API). La musique est gérée à part (voir music.js). |
| `AudioEngine.js` | Moteur de musique procédurale « French Touch / rally house / nu-disco » à ~124 BPM, 100 % Web Audio API (aucun fichier audio). |
| `autopilot.js` | Pilote automatique simple qui suit la ligne centrale d'un circuit scripté. |
| `camflip.js` | Retournement de la caméra quand la gravité s'inverse (plaque d'inversion). |
| `camprefs.js` | Caméras personnalisées (lot 11) : jusqu'à 6 caméras de course en plus des 4 d'origine, réglées par le joueur. |
| `career.js` | Mode carrière (v1.5) : les circuits intégrés, rangés du plus facile au plus dur, sont regroupés en chapitres de 6. Un chapitre s'ouvre avec 4 médailles dans le précédent. Chaque circuit a un objectif bonus qui rapporte des pièces une fois. |
| `carModel.js` | Modèles 3D de la voiture et de la moto (low-poly, originaux), construits par code. |
| `cloudsave.js` | Sauvegarde cloud : quelles données partent dans le cloud, et comment fusionner deux versions. |
| `config.js` | Réglages propres à un DÉPLOIEMENT du jeu : le serveur en ligne (classements, communauté, comptes, salons) et le relais réseau du multijoueur. |
| `constants.js` | Dimensions du monde (en mètres) : case de 32 m, route de 24 m de large, niveau de 6,4 m. |
| `cosmetics.js` | Catalogue de personnalisation du véhicule. 100 % visuel : aucune de ces options ne modifie la physique (voir CAR dans physics.js, qui ne dépend pas du modèle 3D). |
| `custom.js` | Voiture personnalisée (lot 10) : pièces libres, peinture avancée, dessin 16×16, effets, code partageable « SHC1: ». |
| `customCar.js` | Rendu de la voiture personnalisée (lot 10) : pièces libres, livrée (dégradé, motif, dessin 16×16, texte, numéro) et plaque d'immatriculation. |
| `customDeco.js` | Pièces décoratives personnalisées (lot 12) : un petit objet que le joueur assemble avec des formes simples et pose dans l'éditeur comme n'importe quelle décoration. |
| `customDecoBuild.js` | Géométrie des pièces décoratives personnalisées (lot 12) : construction sur un GeoBuilder. Données et validation : customDeco.js. |
| `daily.js` | Défi du jour (v1.5) : un circuit généré à partir de la date. Tout le monde a le même circuit le même jour, sans serveur. Le pilote automatique vérifie qu'il est faisable et fixe les médailles, comme pour les circuits intégrés. |
| `decoData.js` | Données des décorations (sans dépendance au rendu). |
| `decoPack.js` | Constructeurs du pack de décorations 0.9.3 (voir decoPackData.js pour la liste). Coordonnées locales, base à y = 0, 1 unité = 1 m. |
| `decoPackData.js` | Pack de décorations 0.9.3 (≈ 200 objets) : données seules (identifiant, nom, icône), sans dépendance au rendu. |
| `decoPrimitives.js` | Primitives de géométrie low-poly des décorations (coordonnées locales, base à y = 0, 1 unité = 1 m) : cylindre, cône, sphère, octaèdre, membre, étoile… Elles écrivent des triangles dans un GeoBuilder (geo.js). decos.js et decoPack.js s'en servent ; aucune ne dépend du rendu Three.js. |
| `decos.js` | Décorations à placement libre : panneaux, formes, murs et toits, nature, plaque image. |
| `difficulty.js` | Indice de difficulté d'un circuit, estimé d'après sa GÉOMÉTRIE seulement (aucune simulation) : on le calcule pour chaque carte de la communauté et à la publication, instantanément, sur n'importe quel circuit (un circuit d'éditeur n'a pas de ligne centrale pour le pilote automatique). Mêmes ingrédients que tools/difficulte.mjs (qui, lui, mesure la course du pilote) : virages serrés, très grands virages, murs, loopings, dénivelé, obstacles, pièces mobiles, revêtements piégeux, longueur. Les seuils des étoiles sont calés sur les circuits intégrés (tools/test-difficulte.mjs). |
| `dmath.js` | Mathématiques déterministes pour tout ce qui décide du résultat d'une course (physique, géométrie des pièces, pilote automatique, défi du jour). |
| `dom.js` | Aides DOM partagées par tous les écrans. |
| `editor.js` | Éditeur de circuits : pièces sur grille, niveaux, rotation, revêtements réglables, options (envers, sans bordures, tunnel), décorations libres, vérification, historique. |
| `editorPick.js` | Sélection par rayon dans l'éditeur, avec calques. |
| `editorTools.js` | Outils de l'éditeur (v1.5) : sélection de zone et presse-papiers, vérificateur de circuit, miniatures vues de dessus. Aucun rendu 3D ici : seulement des données. |
| `families.js` | Familles de pièces et « caractéristiques » (Phase 2). |
| `favorites.js` | Circuits favoris (Race Hub) : une référence par circuit, rangée dans le profil (donc dans la sauvegarde cloud du compte). Module pur, testé sous Node. |
| `feel.js` | Ressenti de course (0.9.20) : de petits retours visuels, sonores et tactiles qui ponctuent la conduite, calculés d'après l'état de la voiture. Tout est VISUEL / SONORE / TACTILE : rien ici ne touche à la physique, aux temps ni aux replays (la voiture roule exactement pareil avec ou sans). Fonctions pures, sans rendu : race.js les appelle et applique le résultat (caméra, HUD, audio, manette). |
| `garage.js` | Garage : personnalisation purement visuelle du véhicule (forme, couleurs, LED, dessins, ornements, ailerons, roues). Aucune option ne change les performances. |
| `geo.js` | Petit constructeur de géométrie low-poly (triangles non indexés + couleurs par sommet => rendu "facetté" en un seul appel de dessin). |
| `ghostFormat.js` | Format des fantômes enregistrés : une pose (x, y, z + quaternion) tous les GHOST_EVERY pas de course, plus la liste des changements de véhicule. |
| `hudMessages.js` | Messages au centre de l'écran en course : courts, triés par importance, jamais empilés. Minimaliste. |
| `hudProfile.js` | Profils de HUD (Copytrack Evolution, E5) et réglages du HUD d'entraînement. Un profil choisit ce qui s'affiche PAR-DESSUS la personnalisation du joueur (lot 11 : un élément caché par le joueur reste caché) ; « Entraînement » ajoute les outils d'analyse en direct (race/training.js). |
| `i18n.js` | Internationalisation (français / anglais) : noyau, sans aucune dépendance au navigateur (testé sous Node). |
| `input.js` | Entrées : clavier (codes physiques => QWERTY et AZERTY), manette, tactile. |
| `inspector.js` | Mode Inspection de l'éditeur : sélection d'une pièce ou d'une décoration, panneau de propriétés généré selon l'objet, et gizmos 3D (TransformControls : flèches de déplacement, cercles de rotation). |
| `joins.js` | Raccords d'orientation (0.9.3) : une route sur un mur ne se raccorde pas directement au sol, il faut une transition. |
| `logicText.js` | Logique du circuit en phrases, et ses vérifications (éditeur de logique, E11). Module pur, testé sous Node (tools/test-logique.mjs). |
| `main.js` | Point d'entrée : crée le moteur de rendu et orchestre menu / course / éditeur. |
| `mathutil.js` | Petits utilitaires numériques partagés (la physique, l'audio, les traînées). Ne dépend de rien. |
| `medals.js` | Médailles : leur ordre (de la meilleure à la moins bonne) et leur attribution selon un temps. |
| `mods.js` | Paquets de personnalisation « mods » (lot 13) : un seul code « SHX1: » qui regroupe ma voiture, mon interface, mes caméras, mes pièces décoratives et mes modes. |
| `music.js` | Musique du jeu : le menu joue le MP3 déposé dans assets/music-menu.mp3 (en boucle ; sans ce fichier, repli sur un groove house synthétisé) ; les courses jouent une musique chill synthétisée (AudioEngine.js) dont l'intensité suit la vitesse. |
| `mutations.js` | Défi du jour 2 (Copytrack Evolution, E13) : la MUTATION du jour et les SÉRIES de jours. |
| `obstacleMesh.js` | Modèles 3D animés des obstacles (voir obstacles.js pour la physique). |
| `obstacles.js` | Obstacles (0.9) : objets posés librement comme les décorations, mais qui comptent pour la physique. Leur mouvement ne dépend que du chrono de la course (pas fixe), donc il est identique en course, en replay, après un retour au checkpoint et dans la vérification en ligne. Ce module n'a aucune dépendance au rendu. |
| `online.js` | Fonctions en ligne (Supabase) : pilote anonyme, circuits de la communauté. |
| `particles.js` | Particules low-poly (petits tétraèdres instanciés) : poussière, étincelles, éclats. |
| `physics.js` | Physique de la voiture : pas fixe, déterministe, sans moteur externe. |
| `pieces.js` | Définition des pièces de circuit, des revêtements et de leur géométrie "analytique" (utilisée à la fois par la physique et par les maillages). |
| `prefabs.js` | Prefabs de l'éditeur (0.9.18) : des morceaux de circuit réutilisables (chicane, looping + sortie, saut…), qu'on colle comme le presse-papiers ; on peut aussi enregistrer SA sélection, la nommer et la partager par un code « SHP1: ». Un prefab est un presse-papiers (editorTools.copyRect) : { w, h, tiles, decos } en coordonnées relatives. Module sans rendu ni stockage : la bibliothèque locale est dans storage.js. |
| `profile.js` | Profil du joueur : pièces, objets débloqués, équipement, code de sauvegarde. |
| `progression.js` | Progression du pilote (Copytrack Evolution, E14) : EXPÉRIENCE et NIVEAUX, LICENCES, DÉFIS DE MAÎTRISE, et cosmétiques débloqués par le niveau. |
| `quality.js` | Qualité graphique : profils (Ultra → Potato), détection automatique (benchmark invisible sur l'animation du menu), gestionnaire qui applique un profil au WebGLRenderer et à la scène, et filet de sécurité en course. |
| `race.js` | Session de course : boucle à pas fixe, caméra, fantôme, HUD, effets. |
| `raceLogic.js` | Règles de course (sans rendu) : checkpoints, arrivée, points de réapparition. |
| `remoteCar.js` | Voiture fantôme d'un adversaire (multijoueur) : traverse tout, ne collisionne avec rien, ne s'affiche que par ce que le réseau en dit. Plus elle est loin de la caméra du joueur local, plus son matériau s'assombrit. |
| `renderOptions.js` | Réglages de rendu partagés par la construction des maillages du circuit : fixés par le profil de qualité et par l'accessibilité (main.js, app/settings.js), lus par trackGeometry.js et trackMesh.js. Un seul objet visible ici, au lieu de trois variables de module modifiées par des fonctions éparpillées. |
| `replay.js` | Replays et fantômes (v1.5). La physique est déterministe (pas fixe) : il suffit d'enregistrer les commandes de chaque pas pour rejouer une course à l'identique. |
| `rewards.js` | Récompenses (0.9.18) : titres affichés au classement, éléments EXCLUSIFS du garage (qui ne s'achètent pas), collections à thème. Données et règles pures : le contexte (médailles, défis, leçons…) est rassemblé par app/rewards.js, ici on décide seulement ce qui est mérité. Rien ne touche à la physique ni aux temps : tout est visuel. |
| `ribbons.js` | Rubans 3D : toute portion de route qui n'est pas un simple « sol ». |
| `rules.js` | Règles de partie et modes de jeu (lot 13). Une RÈGLE est un réglage de départ qu'un circuit sait déjà porter (gravité de départ, vitesse de départ, véhicule de départ, hors-piste, tours) ou une transformation du circuit (sans obstacles) : rien de nouveau dans la physique, aucune voiture ne change de performances. Un MODE réunit des règles, un objectif et un nom ; il se joue sur n'importe quel circuit, sans records ni classements (le circuit transformé n'est plus celui des classements), et se partage par un code « SHM1: ». |
| `rulesCore.js` | Règles de partie : le noyau sans dépendance (validation et application au circuit). Il est dans la fermeture de la vérification serveur (js/verify.js, via variants.js : les variantes de records sont des règles) : il n'importe que obstacles.js, jamais le profil ni le stockage. |
| `scenery.js` | Décors : ciel, lumière, terrain facetté et objets, selon le thème du circuit. |
| `scripts.js` | Scripts de circuit (lot 12) : des déclencheurs posés sur une case du circuit. Quand la voiture passe dessus, UN effet visuel ou sonore se produit (message, moment de la journée, météo, brume, musique, éclat, secousse, son). Hors signature (comme l'ambiance) : ni records, ni vérification, ni physique. |
| `simulation.js` | Simulation d'une course : UNE voiture (CarPhysics), ses règles (RaceLogic) et l'enchaînement exact d'un pas, en un seul endroit. |
| `skids.js` | Traces de pneus : bandes sombres posées sur la route pendant les glisses et les gros freinages. |
| `skills.js` | Académie 2 (Copytrack Evolution, E12) : des COMPÉTENCES (trajectoire, freinage, dérapage, sauts) et des EXERCICES ÉVALUÉS. Chaque exercice est un court circuit avec un objectif MESURÉ par l'analyse (analysis/drill.js : la course rejouée à partir de ses commandes), noté bronze, argent ou or. |
| `storage.js` | Persistance locale (navigateur) : réglages, records + fantômes, circuits perso. |
| `telemetry.js` | Statistiques de jeu ANONYMES (avec l'accord du joueur) : temps de fin, abandons, essais par circuit intégré. |
| `themes.js` | Les 12 décors (thèmes visuels) du jeu : identité, nom et ordre de la carrière. Module de données pur (aucun rendu). |
| `tileInfo.js` | Aides « pures » (sans DOM ni 3D) de l'éditeur et de l'inspecteur, faciles à tester. |
| `track.js` | Modèle de circuit : liste de pièces posées sur une grille, index spatial, requêtes de surface pour la physique, sérialisation en code partageable. |
| `trackDescriptor.js` | Descripteur de circuit : UNE description d'un circuit quelle que soit sa source (carrière, défi du jour, mes circuits, communauté), pour le Race Hub et tout écran qui présente un circuit avant de le lancer. Module pur (sans DOM ni rendu : testé sous Node). |
| `trackGeometry.js` | Géométrie du circuit : la forme 3D de chaque pièce (route, bordures, tunnel, revêtements, portiques, piliers) construite dans un GeoBuilder. |
| `trackMesh.js` | Maillage du circuit à partir des pièces : matières, tronçons statiques reconstruits à la demande, pièces mobiles, obstacles, lampes. |
| `tracks.js` | Circuits intégrés (créations originales), décrits avec le constructeur "tortue" (voir scriptTrack dans track.js). Les temps de médailles sont en secondes. |
| `trail.js` | Traînée lumineuse du véhicule (cosmétique) : un ruban derrière la voiture, TOUJOURS présent (même à l'arrêt, très discret), dont l'intensité, la longueur et la largeur suivent la vitesse et le boost. Un ruban 3D avec une opacité par sommet (additif) : pas de particules qui apparaissent et disparaissent. |
| `ui.js` | Interface DOM : écrans, HUD, fenêtres modales, notifications. |
| `uitheme.js` | Thèmes et disposition de l'interface (lot 11) : couleurs, police, arrondis, compteur de vitesse, taille et place des éléments du HUD. |
| `variants.js` | Variantes de records (Copytrack Evolution, E3) : des catégories de classement sur un même circuit (départ en moto, gravité lunaire, sans obstacles…), SÉPARÉES du record officiel. Une variante est un jeu de règles (rulesCore.js) appliqué à une copie du circuit : rien de neuf dans la physique. Elle voyage dans la clé de classement, sans aucune migration de la base : |
| `verify.js` | Vérification d'une course (classements en ligne). Module sans rendu ni navigateur : il est utilisé par la fonction serveur Supabase (supabase/functions/submit-score), qui le charge depuis le site du jeu. La physique étant déterministe, rejouer les commandes enregistrées redonne exactement la même course et le même temps. |
| `version.js` | Numéros de version du jeu (une seule source). |
| `videoExport.js` | Export d'un replay en vidéo : le canvas 3D est enregistré (MediaRecorder) pendant que le replay se joue, puis proposé en téléchargement (WebM). |
| `weather.js` | Météo décorative (lot 12) : pluie, neige, braises, poussière, pétales. Un nuage de points qui suit la caméra ; aucun effet sur la course. |
| `welcome.js` | Écran d'accueil : le menu principal ne s'ouvre qu'une fois le pseudo défini. |

## `js/analysis/`

| Fichier | Rôle |
| --- | --- |
| `coach.js` | Coach (Copytrack Evolution, E7) : des conseils LOCALISÉS (un secteur, un endroit) et JUSTIFIÉS par les mesures de deux courses projetées sur la même référence (analysis/reference.js). On ne conseille que là où du temps a été perdu : une course identique à la référence ne reçoit aucun conseil. Module pur, testé sous Node (tools/test-coach.mjs) ; le texte est en français (la clé de la traduction, comme partout). |
| `drill.js` | Mesure d'un exercice de l'Académie (Copytrack Evolution, E12) : la course est REJOUÉE à partir de ses commandes (traceFromInputs, le même pas que la course et le serveur), puis mesurée par l'analyse : temps et vitesse moyenne dans des zones du circuit, chocs, réceptions, mini-turbos. |
| `events.js` | Bilan des évènements d'une course (analysis/trace.js) : chocs, réapparitions, réceptions, mini-turbos, temps en l'air. Module pur. |
| `live.js` | Suivi en direct contre une course de référence (HUD d'entraînement) : à chaque image, la position de la voiture est projetée sur la référence de parcours (recherche fenêtrée : quelques dizaines de segments), et l'écart est le chrono moins le temps de la référence à cette distance. |
| `reference.js` | Référence de parcours : une ligne le long du circuit, graduée en mètres, sur laquelle on projette toute course pour la comparer à une autre (« à 820 m du départ, tu avais 0,4 s de retard »). Module pur, testé sous Node. |
| `sectors.js` | Secteurs et écarts entre deux courses projetées sur la même référence (analysis/reference.js). Module pur, testé sous Node. |
| `trace.js` | Trace d'une course (Copytrack Evolution, analyse) : ce qui s'est passé, échantillonné comme les fantômes (un point tous les GHOST_EVERY pas, soit 30 par seconde). Module pur, sans DOM ni rendu : testé sous Node (tools/test-analyse.mjs). |

## `js/app/`

| Fichier | Rôle |
| --- | --- |
| `academy.js` | Académie : menu des six leçons et des exercices évalués (E12), introduction, bilan à l'arrivée. Les données et les règles sont dans academy.js (leçons) et skills.js (compétences, exercices) ; la mesure d'un exercice, dans analysis/drill.js. |
| `community.js` | Communauté : partage, classements en ligne, publication, import de circuits et de fantômes, aide. |
| `editorFlow.js` | Passages entre le menu et l'éditeur : ouverture, aide, retour, essai d'un circuit. |
| `modes.js` | Modes de jeu, règles de partie et paquets (lot 13) : l'interface. Les règles et validations sont dans rules.js et mods.js. Ces méthodes s'ajoutent au prototype de App. |
| `multi.js` | Multijoueur : salons (privés par code, ou publics), circuit commun, lobby, départ en course à plusieurs, classement du salon, championnat (manches). |
| `profile.js` | Profil : compte, sauvegardes, import et export de sauvegarde. |
| `raceHub.js` | Race Hub : la fiche d'un circuit, avant de courir. Chaque sélection de circuit y mène (carrière, défi du jour, mes circuits, communauté, favoris) ; « Jouer » lance la course avec les options du descripteur (trackDescriptor.js), sans rien recalculer. |
| `rewards.js` | Récompenses côté application : rassembler les compteurs (médailles, leçons, défis du jour…), donner ce qui est mérité, afficher le titre choisi dans le profil. |
| `screens.js` | Écrans de liste : carrière, circuits du joueur, défi du jour, circuit suivant, menu, tutoriel. |
| `settings.js` | Réglages : qualité graphique et banc d'essai, commandes (clavier, manette), options, accessibilité. |
| `shared.js` | Éléments partagés par les familles de méthodes de App (voir main.js). |
| `theater.js` | Replay Theater : point d'entrée de l'application (« Revoir la course » à l'arrivée, « Regarder mon record » de la fiche du circuit). |
| `uicustom.js` | Personnalisation de l'interface (lot 11) : thème, couleurs, police, compteur de vitesse, éditeur de HUD (glisser-déposer) et éditeur de caméras. |
| `wiring.js` | Branchement de l'interface : clics, actions du menu, de l'éditeur, tactile, manette, clins d'œil cachés. |

## `js/editor/`

| Fichier | Rôle |
| --- | --- |
| `cdeco.js` | « Mes pièces » : l'atelier de pièces décoratives de l'éditeur (lot 12). On assemble des formes simples, on voit la pièce de face et de dessus, on l'enregistre dans sa bibliothèque, puis on la pose comme n'importe quelle décoration. Les règles sont dans customDeco.js. Ces méthodes s'ajoutent au prototype de EditorSession. |
| `groups.js` | Groupes et calques de l'éditeur (Copytrack Evolution, E9) : des pièces et décorations rangées dans des groupes numérotés (1 à 63) et nommés. |
| `history.js` | État du circuit dans l'éditeur : instantanés, annuler / rétablir, enregistrement, nouveau circuit, essai. |
| `logicUi.js` | Éditeur de la logique du circuit (Copytrack Evolution, E11) : créer des règles ÉVÉNEMENT → CONDITIONS → ACTIONS sans écrire de code, les lire en phrases, voir ce qui empêcherait de finir, et les essayer (T : en essai depuis l'éditeur, chaque règle déclenchée est annoncée). Les règles agissent sur les groupes (▦, editor/groups.js). Ces méthodes s'ajoutent au prototype d'EditorSession : `this` est l'instance. Moteur : sim/logic.js. |
| `palette.js` | Palette de l'éditeur : boutons d'outils, familles de pièces, options, paramètres, aide à la compatibilité, menu. |
| `pointer.js` | Souris, tactile et manette dans l'éditeur : événements, survol, aperçu de la pose, case et décoration visées. |
| `prefabs.js` | Onglet « Prefabs » de la palette : coller un morceau tout fait (chicane, saut, looping…), enregistrer SA sélection sous un nom, la partager par code, importer le code d'un ami. |
| `preview3d.js` | Aperçu 3D d'une pièce perso (atelier « Mes pièces » de l'éditeur, E9) : les formes construites EXACTEMENT comme sur la piste (customDecoBuild.js, mêmes matières que le circuit), sur un petit canvas qui tourne lentement ; glisser pour tourner soi-même. Un seul rendu WebGL de plus, libéré à la fermeture de l'atelier (dispose). |
| `scriptsUi.js` | Déclencheurs de circuit dans l'éditeur (lot 12) : on pose des effets visuels et sonores sur des cases ; la voiture les joue en passant dessus. |
| `selection.js` | Sélection rectangulaire, copier / couper / coller, vue par niveau et repérage des problèmes. |
| `shared.js` | Éléments partagés par les familles de méthodes de EditorSession (voir editor.js). |
| `tools.js` | Outils d'édition : poser, peindre, remplir, gomme, pipette, options des pièces, décorations, niveau. |

## `js/garage/`

| Fichier | Rôle |
| --- | --- |
| `studio.js` | Atelier du garage (lot 10) : éditeur de voiture libre. Onglets : Pièces, Peinture, Dessin, Effets, Code. |

## `js/i18n/`

| Fichier | Rôle |
| --- | --- |
| `boot.js` | Démarrage de l'internationalisation : choix de la langue, chargement du dictionnaire, traducteur DOM, sélecteurs de langue. |
| `dom.js` | Traducteur DOM : traduit à la volée ce que le jeu écrit dans la page (voir i18n.js pour le principe). |
| `en.js` | Dictionnaire anglais : l'assemblage des dictionnaires par domaine (js/i18n/en/*.js). Chargé à la demande (voir i18n/boot.js). |

## `js/i18n/en/`

| Fichier | Rôle |
| --- | --- |
| `custom.js` | Dictionnaire anglais — personnalisation : atelier de voiture (lot 10), interface et caméras (lot 11), décors et scripts (lot 12), règles et mods (lot 13). |
| `data.js` | Dictionnaire anglais — les données du jeu : noms des circuits intégrés, libellés des commandes et des touches. |
| `editor.js` | Dictionnaire anglais — l'éditeur de circuits : barre d'outils, palette, options, niveau, sélection, prefabs, raccourcis, messages. |
| `hub.js` | Dictionnaire anglais — Race Hub (fiche d'un circuit), classement à onglets, favoris, course rapide (Copytrack Evolution, 0.9.26). |
| `online.js` | Dictionnaire anglais — la vie autour de la course : Académie, récompenses, garage, communauté, multijoueur, erreurs du serveur. |
| `pieces.js` | Dictionnaire anglais — le catalogue de l'éditeur : pièces de piste, familles et caractéristiques, inspecteur, décorations. |
| `race.js` | Dictionnaire anglais — la course : messages au centre de l'écran, objectifs, carrière, arrivée, replay, caméras, décors, erreurs de circuit. |
| `shell.js` | Dictionnaire anglais — l'enveloppe du jeu : accueil, menus, profil, options, commandes, fenêtres communes. |
| `tracks.js` | Dictionnaire anglais — les descriptions des circuits intégrés (infobulles des cartes de la carrière). |

## `js/inspector/`

| Fichier | Rôle |
| --- | --- |
| `bodies.js` | Contenu du panneau selon la sélection : pièce, pièce mobile, caractéristiques, couleurs, décoration. |
| `gizmo.js` | Manipulation directe dans la scène : mode (déplacer, tourner), poignées, flèche d'orientation, glisser. |
| `shared.js` | Éléments partagés par les familles de méthodes de Inspector (voir inspector.js). |
| `widgets.js` | Contrôles du panneau : nombres, curseurs, listes, cases à cocher, boutons de mode. |

## `js/net/`

| Fichier | Rôle |
| --- | --- |
| `championship.js` | Championnat multijoueur (« manche ») : plusieurs circuits à la suite, des points par place, un classement général. Logique pure, sans réseau ni rendu : le salon (room.js) y range les résultats ; chaque joueur reçoit les mêmes temps, donc calcule le même classement. |
| `collide.js` | Collisions douces entre voitures (manche multijoueur, option « collisions ») : chaque voiture est un disque de rayon CAR_R ; deux voitures qui se chevauchent se repoussent. Aucun serveur, aucun arbitre : CHAQUE joueur applique SA moitié du choc à SA voiture, à partir de la position (interpolée) que l'autre affiche. Le résultat est symétrique à quelques centimètres près et reste doux : la poussée par pas est plafonnée, une voiture qui vient d'apparaître (retour au checkpoint) ou qui a fini ne bouscule personne et n'est pas bousculée. |
| `directory.js` | Annuaire des salons PUBLICS : une liste de salons ouverts à tous, sans devoir échanger un code. |
| `ice.js` | Serveurs ICE du multijoueur : STUN (gratuit) + relais TURN (réseaux fermés : entreprise, 4G à NAT symétrique), demandés à la fonction serveur « ice » (supabase/functions/ice) qui fabrique des identifiants à DURÉE LIMITÉE : rien de permanent n'est lisible dans le jeu. |
| `interp.js` | Tampon d'interpolation d'un joueur distant. |
| `progress.js` | Avancement d'une voiture sur le circuit (0 à 1) et grille de départ : sert au classement en direct d'une manche et à placer les voitures sans qu'elles se superposent au départ. Logique pure. |
| `room.js` | Salon multijoueur : code à 6 caractères, liste des joueurs, choix du circuit, départ commun, résultats. |
| `signaling.js` | Signalisation du multijoueur : annuaire des joueurs d'une salle + relais des messages WebRTC (offres, réponses, ICE). |
| `snapshot.js` | Paquet d'état d'une voiture (multijoueur) : 40 octets, envoyé 20 fois par seconde sur le canal WebRTC « state ». |
| `transport.js` | Transport de jeu : WebRTC pair à pair en maillage complet (chaque joueur est relié directement à tous les autres). |

## `js/physics/`

| Fichier | Rôle |
| --- | --- |
| `obstacles.js` | Contacts de la voiture avec les obstacles (piques, balanciers, marteaux, murs coulissants, balayeurs, bumpers). |
| `ribbon.js` | Conduite sur les rubans 3D (loopings, vrilles, tubes, murs, plafond) : entrée, conduite, sortie et raccord d'un ruban à l'autre. |
| `specs.js` | Réglages des véhicules et des revêtements pour la physique (voiture, moto, bateau, deltaplane) : des nombres, aucune logique. |
| `walls.js` | Collisions de la voiture avec les murs (bordures), les toits de tunnel, les dalles et les limites du monde. |

## `js/race/`

| Fichier | Rôle |
| --- | --- |
| `camera.js` | Caméras de la course : poursuite, capot, TV et orbite des replays, coupures, champ de vision. |
| `finish.js` | Évènements de course (checkpoint, tour, arrivée), records, récompenses et écran de fin. |
| `ghosts.js` | Fantômes : record personnel enregistré, fantômes simulés (or, importé), orientation et affichage. |
| `net.js` | Multijoueur dans la course : voitures des autres joueurs et envoi de l'état local. |
| `replayMode.js` | Mode replay : lecture à vitesse variable, pause, interface et fin du replay. |
| `scriptsRun.js` | Exécution des scripts de circuit (lot 12) pendant la course : voir js/scripts.js. Effets visuels et sonores seulement. Ces méthodes s'ajoutent au prototype de RaceSession. |
| `shared.js` | Éléments partagés par les familles de méthodes de RaceSession (voir race.js). |
| `training.js` | HUD d'entraînement (Copytrack Evolution, E5) : écart en direct contre une course de référence, mini-secteurs, vitesse maxi, forces g, courbes gaz / frein / vitesse, ligne de la référence et repères de ses freinages, dans la scène. Actif avec le profil de HUD « Entraînement » (hudProfile.js). Ne LIT que la course : rien ici ne touche à la physique, au chrono ni à l'enregistrement. |

## `js/scenery/`

| Fichier | Rôle |
| --- | --- |
| `decor.js` | Décors de chaque thème (désert, pôles, jungle, ville, îles, volcan, orbite, grottes, ciel, récif, usine) et terrain. |
| `shared.js` | Éléments partagés par les familles de méthodes de Scenery (voir scenery.js). |

## `js/sim/`

| Fichier | Rôle |
| --- | --- |
| `logic.js` | Logique du circuit (Copytrack Evolution, E10) : des règles ÉVÉNEMENT → CONDITIONS → ACTIONS exécutées DANS la simulation, donc identiques en course, dans les fantômes, les replays et la vérification serveur (ce module est dans la fermeture de js/verify.js : aucune horloge, aucun hasard, aucune trigonométrie). Elles agissent sur les GROUPES de pièces et de décorations (E9) : montrer, cacher (une pièce cachée n'a plus de collision, comme une dalle de verre brisée), basculer ; et sur la gravité, des compteurs, et des effets visuels ou sonores (sans effet sur la course). |
| `params.js` | Paramètres de simulation d'un circuit (Copytrack Evolution, E8) : ce que la physique lit en plus du circuit lui-même. Additifs : à leur valeur par défaut (adhérence 100 %, pas de vent), la course est celle d'avant au bit près (l'empreinte des scénarios existants ne change pas ; la physique ne fait même pas la multiplication). Les valeurs viennent des règles du circuit (track.js, table RULES : grip, wind, windDir), qui entrent dans sa signature dès qu'elles ne sont plus par défaut. Dans la fermeture de la vérification serveur : dmath seulement. |

## `js/theater/`

| Fichier | Rôle |
| --- | --- |
| `cameras.js` | Caméras du Replay Theater (en plus des caméras de course, de la TV et de l'orbite) : « Libre » (glisser pour tourner autour de la voiture, molette pour s'approcher) et « Cinématique » (plans qui s'enchaînent : poursuite basse, travelling latéral, grue, poste TV). |
| `panel.js` | Interface du Replay Theater : barre de temps (repères de secteurs et d'incidents), commandes, légende des courses, et panneau d'analyse (trajectoires sur la carte du circuit, vitesses et écart le long du parcours, tableau des secteurs). Voir theater/session.js. |
| `session.js` | Replay Theater (Copytrack Evolution, E6) : le replay devient une salle d'analyse. Jusqu'à quatre courses sur la piste en même temps (la course regardée, rejouée EXACTEMENT par ses commandes, et jusqu'à trois à comparer : un autre record, le fantôme or, un fantôme en ligne), une barre de temps où l'on se déplace (en avant comme en arrière), les secteurs et les incidents marqués dessus, et un panneau d'analyse (trajectoires sur la carte, vitesses, écarts, secteurs). Construit SUR le mode replay de la course (même rendu, mêmes caméras, même export vidéo) : rien n'est dupliqué. |

## `js/track/`

| Fichier | Rôle |
| --- | --- |
| `edit.js` | Modifications du circuit : revêtements, options des pièces, mouvement, couleurs, décorations. |
| `shared.js` | Éléments partagés par les familles de méthodes de Track (voir track.js). |
| `surfaces.js` | Requêtes de surface pour la physique et la caméra : sol sous un point, plafond, pièces mobiles. |

## `js/ui/`

| Fichier | Rôle |
| --- | --- |
| `leaderboardPanel.js` | Classement à onglets (Race Hub, fenêtre « 🏆 ») : chaque onglet est un FOURNISSEUR de données enregistré ici. Un onglet dont le fournisseur n'est pas disponible n'est pas affiché (jamais d'onglet vide ou factice) : « Amis » et « Saison » s'ajouteront avec leur étape SQL. |
| `traceChart.js` | Petites courbes sur un canvas (HUD d'entraînement, Replay Theater) : une fenêtre glissante de N valeurs par série, dessinée sans allocation. |
| `trackMap.js` | Mini-carte d'un circuit, vue de dessus : un seul noyau de dessin pour les miniatures des cartes (editorTools.thumbnail) et la grande carte zoomable du Race Hub (createTrackMap). Marche pour TOUS les circuits, éditeur compris : elle dessine la ligne centrale de chaque pièce (centerlineWorld), pas track.path (qui n'existe que pour les circuits scriptés). |

## `supabase/functions/ice/`

| Fichier | Rôle |
| --- | --- |
| `handler.js` | Copytrack : logique de la fonction serveur « ice » (sans rien de propre à Deno : elle se teste sous Node, voir tools/test-ice.mjs). |
| `server.ts` | Copytrack : fonction serveur « ice » (Supabase Edge Function, Deno) : serveurs STUN + relais TURN à identifiants à durée limitée pour le multijoueur. |

## `supabase/functions/submit-score/`

| Fichier | Rôle |
| --- | --- |
| `handler.js` | Copytrack : logique de la fonction serveur « submit-score » (sans rien de propre à Deno : elle se teste sous Node, voir tools/test-submit-handler.mjs). |
| `server.ts` | Copytrack : fonction serveur « submit-score » (Supabase Edge Function, Deno). |
