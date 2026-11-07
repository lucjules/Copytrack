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
| `career.js` | Mode carrière (v1.5) : les circuits intégrés, rangés du plus facile au plus dur, sont regroupés en chapitres de 6. Un chapitre s'ouvre avec 4 médailles dans le précédent. Chaque circuit a un objectif bonus qui rapporte des pièces une fois. |
| `carModel.js` | Modèles 3D de la voiture et de la moto (low-poly, originaux), construits par code. |
| `cloudsave.js` | Sauvegarde cloud : quelles données partent dans le cloud, et comment fusionner deux versions. |
| `config.js` | Réglages propres à un DÉPLOIEMENT du jeu : le serveur en ligne (classements, communauté, comptes, salons) et le relais réseau du multijoueur. |
| `constants.js` | Dimensions du monde (en mètres) : case de 32 m, route de 24 m de large, niveau de 6,4 m. |
| `cosmetics.js` | Catalogue de personnalisation du véhicule. 100 % visuel : aucune de ces options ne modifie la physique (voir CAR dans physics.js, qui ne dépend pas du modèle 3D). |
| `custom.js` | Voiture personnalisée (lot 10) : pièces libres, peinture avancée, dessin 16×16, effets, code partageable « SHC1: ». |
| `customCar.js` | Rendu de la voiture personnalisée (lot 10) : pièces libres, livrée (dégradé, motif, dessin 16×16, texte, numéro) et plaque d'immatriculation. |
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
| `feel.js` | Ressenti de course (0.9.20) : de petits retours visuels, sonores et tactiles qui ponctuent la conduite, calculés d'après l'état de la voiture. Tout est VISUEL / SONORE / TACTILE : rien ici ne touche à la physique, aux temps ni aux replays (la voiture roule exactement pareil avec ou sans). Fonctions pures, sans rendu : race.js les appelle et applique le résultat (caméra, HUD, audio, manette). |
| `garage.js` | Garage : personnalisation purement visuelle du véhicule (forme, couleurs, LED, dessins, ornements, ailerons, roues). Aucune option ne change les performances. |
| `geo.js` | Petit constructeur de géométrie low-poly (triangles non indexés + couleurs par sommet => rendu "facetté" en un seul appel de dessin). |
| `ghostFormat.js` | Format des fantômes enregistrés : une pose (x, y, z + quaternion) tous les GHOST_EVERY pas de course, plus la liste des changements de véhicule. |
| `hudMessages.js` | Messages au centre de l'écran en course : courts, triés par importance, jamais empilés. Minimaliste. |
| `i18n.js` | Internationalisation (français / anglais) : noyau, sans aucune dépendance au navigateur (testé sous Node). |
| `input.js` | Entrées : clavier (codes physiques => QWERTY et AZERTY), manette, tactile. |
| `inspector.js` | Mode Inspection de l'éditeur : sélection d'une pièce ou d'une décoration, panneau de propriétés généré selon l'objet, et gizmos 3D (TransformControls : flèches de déplacement, cercles de rotation). |
| `joins.js` | Raccords d'orientation (0.9.3) : une route sur un mur ne se raccorde pas directement au sol, il faut une transition. |
| `main.js` | Point d'entrée : crée le moteur de rendu et orchestre menu / course / éditeur. |
| `mathutil.js` | Petits utilitaires numériques partagés (la physique, l'audio, les traînées). Ne dépend de rien. |
| `medals.js` | Médailles : leur ordre (de la meilleure à la moins bonne) et leur attribution selon un temps. |
| `music.js` | Musique du jeu : le menu joue le MP3 déposé dans assets/music-menu.mp3 (en boucle ; sans ce fichier, repli sur un groove house synthétisé) ; les courses jouent une musique chill synthétisée (AudioEngine.js) dont l'intensité suit la vitesse. |
| `obstacleMesh.js` | Modèles 3D animés des obstacles (voir obstacles.js pour la physique). |
| `obstacles.js` | Obstacles (0.9) : objets posés librement comme les décorations, mais qui comptent pour la physique. Leur mouvement ne dépend que du chrono de la course (pas fixe), donc il est identique en course, en replay, après un retour au checkpoint et dans la vérification en ligne. Ce module n'a aucune dépendance au rendu. |
| `online.js` | Fonctions en ligne (Supabase) : pilote anonyme, circuits de la communauté. |
| `particles.js` | Particules low-poly (petits tétraèdres instanciés) : poussière, étincelles, éclats. |
| `physics.js` | Physique de la voiture : pas fixe, déterministe, sans moteur externe. |
| `pieces.js` | Définition des pièces de circuit, des revêtements et de leur géométrie "analytique" (utilisée à la fois par la physique et par les maillages). |
| `prefabs.js` | Prefabs de l'éditeur (0.9.18) : des morceaux de circuit réutilisables (chicane, looping + sortie, saut…), qu'on colle comme le presse-papiers ; on peut aussi enregistrer SA sélection, la nommer et la partager par un code « SHP1: ». Un prefab est un presse-papiers (editorTools.copyRect) : { w, h, tiles, decos } en coordonnées relatives. Module sans rendu ni stockage : la bibliothèque locale est dans storage.js. |
| `profile.js` | Profil du joueur : pièces, objets débloqués, équipement, code de sauvegarde. |
| `quality.js` | Qualité graphique : profils (Ultra → Potato), détection automatique (benchmark invisible sur l'animation du menu), gestionnaire qui applique un profil au WebGLRenderer et à la scène, et filet de sécurité en course. |
| `race.js` | Session de course : boucle à pas fixe, caméra, fantôme, HUD, effets. |
| `raceLogic.js` | Règles de course (sans rendu) : checkpoints, arrivée, points de réapparition. |
| `remoteCar.js` | Voiture fantôme d'un adversaire (multijoueur) : traverse tout, ne collisionne avec rien, ne s'affiche que par ce que le réseau en dit. Plus elle est loin de la caméra du joueur local, plus son matériau s'assombrit. |
| `renderOptions.js` | Réglages de rendu partagés par la construction des maillages du circuit : fixés par le profil de qualité et par l'accessibilité (main.js, app/settings.js), lus par trackGeometry.js et trackMesh.js. Un seul objet visible ici, au lieu de trois variables de module modifiées par des fonctions éparpillées. |
| `replay.js` | Replays et fantômes (v1.5). La physique est déterministe (pas fixe) : il suffit d'enregistrer les commandes de chaque pas pour rejouer une course à l'identique. |
| `rewards.js` | Récompenses (0.9.18) : titres affichés au classement, éléments EXCLUSIFS du garage (qui ne s'achètent pas), collections à thème. Données et règles pures : le contexte (médailles, défis, leçons…) est rassemblé par app/rewards.js, ici on décide seulement ce qui est mérité. Rien ne touche à la physique ni aux temps : tout est visuel. |
| `ribbons.js` | Rubans 3D : toute portion de route qui n'est pas un simple « sol ». |
| `scenery.js` | Décors : ciel, lumière, terrain facetté et objets, selon le thème du circuit. |
| `simulation.js` | Simulation d'une course : UNE voiture (CarPhysics), ses règles (RaceLogic) et l'enchaînement exact d'un pas, en un seul endroit. |
| `skids.js` | Traces de pneus : bandes sombres posées sur la route pendant les glisses et les gros freinages. |
| `storage.js` | Persistance locale (navigateur) : réglages, records + fantômes, circuits perso. |
| `telemetry.js` | Statistiques de jeu ANONYMES (avec l'accord du joueur) : temps de fin, abandons, essais par circuit intégré. |
| `themes.js` | Les 12 décors (thèmes visuels) du jeu : identité, nom et ordre de la carrière. Module de données pur (aucun rendu). |
| `tileInfo.js` | Aides « pures » (sans DOM ni 3D) de l'éditeur et de l'inspecteur, faciles à tester. |
| `track.js` | Modèle de circuit : liste de pièces posées sur une grille, index spatial, requêtes de surface pour la physique, sérialisation en code partageable. |
| `trackGeometry.js` | Géométrie du circuit : la forme 3D de chaque pièce (route, bordures, tunnel, revêtements, portiques, piliers) construite dans un GeoBuilder. |
| `trackMesh.js` | Maillage du circuit à partir des pièces : matières, tronçons statiques reconstruits à la demande, pièces mobiles, obstacles, lampes. |
| `tracks.js` | Circuits intégrés (créations originales), décrits avec le constructeur "tortue" (voir scriptTrack dans track.js). Les temps de médailles sont en secondes. |
| `trail.js` | Traînée lumineuse du véhicule (cosmétique) : un ruban derrière la voiture, TOUJOURS présent (même à l'arrêt, très discret), dont l'intensité, la longueur et la largeur suivent la vitesse et le boost. Un ruban 3D avec une opacité par sommet (additif) : pas de particules qui apparaissent et disparaissent. |
| `ui.js` | Interface DOM : écrans, HUD, fenêtres modales, notifications. |
| `verify.js` | Vérification d'une course (classements en ligne). Module sans rendu ni navigateur : il est utilisé par la fonction serveur Supabase (supabase/functions/submit-score), qui le charge depuis le site du jeu. La physique étant déterministe, rejouer les commandes enregistrées redonne exactement la même course et le même temps. |
| `version.js` | Numéros de version du jeu (une seule source). |
| `videoExport.js` | Export d'un replay en vidéo : le canvas 3D est enregistré (MediaRecorder) pendant que le replay se joue, puis proposé en téléchargement (WebM). |
| `welcome.js` | Écran d'accueil : le menu principal ne s'ouvre qu'une fois le pseudo défini. |

## `js/app/`

| Fichier | Rôle |
| --- | --- |
| `academy.js` | Académie : menu des six leçons, introduction de chaque leçon, bilan à l'arrivée. Les données et les règles sont dans academy.js. |
| `community.js` | Communauté : partage, classements en ligne, publication, import de circuits et de fantômes, aide. |
| `editorFlow.js` | Passages entre le menu et l'éditeur : ouverture, aide, retour, essai d'un circuit. |
| `multi.js` | Multijoueur : salons (privés par code, ou publics), circuit commun, lobby, départ en course à plusieurs, classement du salon, championnat (manches). |
| `profile.js` | Profil : compte, sauvegardes, import et export de sauvegarde. |
| `rewards.js` | Récompenses côté application : rassembler les compteurs (médailles, leçons, défis du jour…), donner ce qui est mérité, afficher le titre choisi dans le profil. |
| `screens.js` | Écrans de liste : carrière, circuits du joueur, défi du jour, circuit suivant, menu, tutoriel. |
| `settings.js` | Réglages : qualité graphique et banc d'essai, commandes (clavier, manette), options, accessibilité. |
| `shared.js` | Éléments partagés par les familles de méthodes de App (voir main.js). |
| `wiring.js` | Branchement de l'interface : clics, actions du menu, de l'éditeur, tactile, manette, clins d'œil cachés. |

## `js/editor/`

| Fichier | Rôle |
| --- | --- |
| `history.js` | État du circuit dans l'éditeur : instantanés, annuler / rétablir, enregistrement, nouveau circuit, essai. |
| `palette.js` | Palette de l'éditeur : boutons d'outils, familles de pièces, options, paramètres, aide à la compatibilité, menu. |
| `pointer.js` | Souris, tactile et manette dans l'éditeur : événements, survol, aperçu de la pose, case et décoration visées. |
| `prefabs.js` | Onglet « Prefabs » de la palette : coller un morceau tout fait (chicane, saut, looping…), enregistrer SA sélection sous un nom, la partager par code, importer le code d'un ami. |
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
| `shared.js` | Éléments partagés par les familles de méthodes de RaceSession (voir race.js). |

## `js/scenery/`

| Fichier | Rôle |
| --- | --- |
| `decor.js` | Décors de chaque thème (désert, pôles, jungle, ville, îles, volcan, orbite, grottes, ciel, récif, usine) et terrain. |
| `shared.js` | Éléments partagés par les familles de méthodes de Scenery (voir scenery.js). |

## `js/track/`

| Fichier | Rôle |
| --- | --- |
| `edit.js` | Modifications du circuit : revêtements, options des pièces, mouvement, couleurs, décorations. |
| `shared.js` | Éléments partagés par les familles de méthodes de Track (voir track.js). |
| `surfaces.js` | Requêtes de surface pour la physique et la caméra : sol sous un point, plafond, pièces mobiles. |

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
