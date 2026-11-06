# Copytrack

Jeu de course contre-la-montre **low-poly** dans le navigateur, avec éditeur de circuits.
C'est un jeu original : décors, véhicules, pièces, musique et circuits ont été conçus pour ce projet.

Version actuelle : **bêta 0.9.5**

## Jouer

Le jeu est un site statique (HTML + modules JavaScript + three.js inclus), sans étape de compilation.

```bash
npm start
```

Puis ouvrir <http://localhost:8080>. N'importe quel serveur statique fonctionne aussi, par exemple `python3 -m http.server`.

Tests : `npm test` (éditeur, physique, caméra, familles, pentes et murs, audit du graphe des pièces, puis les 66 circuits au pilote automatique).

Pour le publier avec **GitHub Pages** : *Settings → Pages → Deploy from a branch*, puis choisir la branche et le dossier `/ (root)`.
Le jeu s'**installe comme une application** (bouton d'installation du navigateur) et se joue **hors ligne** une fois chargé.

## Contenu

- **66 circuits** dans 11 décors (*Désert crépuscule*, *Jungle néon*, *Archipel tropical*, *Ville futuriste*, *Nuit polaire*, *Volcan*, *Station orbitale*, *Fonds marins*, *Usine mécanique*, *Ville dans les nuages*, *Canyon de cristal*),
  rangés **du plus facile au plus dur** en 11 chapitres de carrière (un par décor, 6 circuits chacun). Chaque circuit mélange plusieurs familles de pièces ; 4 circuits se courent en plusieurs tours.
- **Carrière** : un chapitre s'ouvre avec 4 médailles dans le précédent ; chaque circuit a un **objectif bonus** ★ (sans toucher de muret, réceptions parfaites, mini-turbos, anneaux, finir en moto…) qui rapporte 50 pièces.
- **Défi du jour** : un circuit généré à partir de la date, le même pour tout le monde, vérifié par le pilote automatique.
- **Médailles** Bronze / Argent / Or / Cristal, chronos intermédiaires, réapparition au dernier checkpoint.
- **Replays** : chaque course est enregistrée (commandes seulement, la physique est déterministe) et peut être revue à l'identique, de ×0,25 à ×4, avec des caméras TV et orbite.
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

- *Communauté > Multijoueur* : créer une salle ou rejoindre avec un **code de 6 caractères** ; jusqu'à 8 joueurs, en voitures fantômes (sans collision).
- **Boucle asynchrone** : chacun a son chrono et recommence quand il veut (**R après l'arrivée**, sans repasser par le salon) ; on peut arriver en cours de route.
- **Circuits** : intégrés, de la communauté (par ID) ou par code. **Retour au checkpoint : le chrono ne se remet pas à zéro.** Les adversaires lointains s'assombrissent.
- Supabase Realtime ne sert qu'à se trouver et à négocier ; les positions (20 Hz) passent en **WebRTC pair à pair**. Voir `supabase/MULTI.md`.

### Le reste

- **Garage** (purement visuel) : 8 carrosseries, moto routière ou chopper, couleurs, finitions (brillante, mate, métallisée, nacrée), LED, dessins, ornements, ailerons, roues, traînées lumineuses, klaxons (touche H), presets.
- **Pièces (monnaie)** gagnées selon la médaille et les objectifs bonus. **Profil** : un code joueur contient toute la progression.
- **Musique** synthétisée en direct, une ambiance par décor ; sons sans aucun fichier audio.
- **Profil** (menu principal) : onglets *Compte*, *Sauvegardes*, *Options* et *Commandes*.
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
   **autonome** généré par `npm run build:function` à partir de `server.ts` et du code du jeu. Quand la physique change (`PHYS_VER`), regénérer puis redéployer.

3. **Description et modification après publication** (bêta 0.9) : `supabase/etape3-description.sql` ajoute la description des
   circuits et la fonction `update_track_meta` (l'auteur peut changer le nom et la description de son circuit publié).
   Sans ce script, le jeu fonctionne, simplement sans description.

4. **Comptes et sauvegarde cloud** : `supabase/etape4-comptes.sql`, puis les réglages décrits dans `supabase/COMPTES.md`.
   Au lancement, le jeu demande un pseudo (aucun nom par défaut) : **Invité** (progression locale) ou **Compte** (pseudo + mot de passe,
   sauvegarde cloud retrouvée sur n'importe quel appareil). Mots de passe hachés (bcrypt + sel) par Supabase Auth, jamais stockés par le jeu.

5. **Durcissement** : `supabase/etape5-securite.sql` (replays des classements privés, plafond de temps par pilote, signalements et parties moins faciles à truquer). À lancer après l'étape 4.

Seules l'URL du projet et la clé publique sont dans `js/online.js`. La clé secrète n'est jamais dans le jeu : seule la fonction serveur l'utilise, côté Supabase.

## Bêta 0.9.5

Audit de l'interface et des textes, sans changement de physique (`PHYS_VER` reste 24, rien à redéployer côté serveur) :

- **HUD** : les pastilles « ◆ 0 / 3 » et « Record » retrouvent leur fond (une règle `.chip` de l'éditeur les écrasait) ; les règles sont maintenant limitées à `#hud` et `#editor`.
- **Écrans** : « + Nouveau » ne passe plus sous le compteur de pièces (Mes circuits, Circuits, Profil) ; l'écran Communauté a son fond flouté et un champ de recherche lisible ; les listes déroulantes d'Options ne dépassent plus de l'écran sur téléphone ; le champ de vision affiche « normal » à 0.
- **Éditeur** : palette **repliable** (▾, choix mémorisé), moins haute sur téléphone en paysage ; le vérificateur `checkTrack` (code resté sans appel) est de nouveau branché sur le badge ⚠, et son clic fait clignoter les pièces en cause (`_markIssues`). Les plaques de gravité inversée ne sont plus prises pour des routes coupées.
- **Textes** : le turbo annonce « jusqu'à 403 km/h » (vitesse visée), le tutoriel parle de la vitesse, des murs et du décrochage, le réglage « effet de vitesse » annonce 220 km/h.
- **Son et effets** : rapports de boîte du moteur et lignes de vitesse recalés sur la vitesse de pointe de 0.9.4.
- **Code** : 9 classes CSS mortes et les règles `.ed-status` / `.ed-help` supprimées, doublons `.pal-param` fusionnés, avertissement sur l'ordre des circuits dans `tracks.js` ; nouveaux tests `tools/test-v095.mjs`.

## Bêta 0.9.4

Recalibrage de la physique vers un feeling plus technique (arcade exigeant) :

- **Accélération et vitesse de pointe** : le moteur vise 95 m/s (342 km/h, turbo 112 m/s) au lieu de 54 m/s, mais la poussée décroît tout le long (`accel × (1 − (v / vmax)^1,5)`, `accel` 11 au lieu de 28, traînée 0,0009 au lieu de 0,0023) : 100 km/h en ~3 s, 180 km/h en ~7 s, 216 km/h en ~11 s, puis la vitesse monte très lentement vers 240 km/h et plus. Une bonne sortie de virage se paie en distance sur toute la ligne droite suivante ; les freins sont plus puissants (52 au lieu de 42 m/s²).
- **Les murs se paient** : un choc rebondit (`wallE`), fait perdre 5 % de la vitesse par m/s d'impact (jusqu'à 65 %), fait pivoter la voiture et lui coupe moteur et adhérence 0,1 à 0,8 s (« encaisse ») ; racler un mur freine en continu (2 /s). Mêmes règles sur les parois des rubans (loopings, tubes…).
- **Murs à 90° sans magie** : vitesse minimale de 30 m/s (108 km/h) ; en dessous la gravité reprend toute la paroi et, passé 0,3 s sur un plan penché de plus de 45°, la voiture décroche et tombe en gardant sa vitesse (message « Trop lent »).
- Pilote automatique (démo, validation, fantôme d'or) : vitesse visée plafonnée (52 m/s, réglable par circuit : `pilot` dans `tracks.js`), freinage plus prudent ; quelques circuits retouchés pour rester finissables (plus de boosts / de lancer avant certains sauts, glace du Blizzard) et **médailles recalculées** (temps du pilote automatique : +12 % en moyenne).
- La physique change (`PHYS_VER` 24) : records et replays repartent de zéro ; **la fonction `submit-score` doit être redéployée**.

## Bêta 0.9.3

- **Orientation** : Sol, Mur gauche, Mur droit, Plafond sont une **caractéristique** (onglet Options, liste *Orientation* de l'Inspecteur) des lignes droites et des virages ordinaires, pentes comprises : plus de pièces 90° à part. Les anciennes pièces « Route sur le côté » (0.9.2) se lisent comme une transition ou une ligne droite orientée, à l'identique.
- **Transitions d'orientation** (famille *Transition*, 16 pièces) : Sol ↔ Mur gauche, Sol ↔ Mur droit, Mur ↔ Plafond, chacune **franche** (1 case) ou **douce** (2×2). Entrée sur le mur, retour à l'horizontale, et de quoi refaire un plafond puis revenir au sol.
- **Pentes** : la **descente** existe (Ligne droite, Virage, Courbe), avec ses raccords doux (début doux, fin douce, S). La descente est exactement la montée parcourue à l'envers, mais se pose dans son sens, et le niveau suit tout seul à la pose.
- **Physique** : un défaut de raccord de moins de ~12° (haut d'une pente, pente douce, raccord doux pris à très grande vitesse) ne fait plus décoller la voiture ; un tremplin (2 niveaux et plus), lui, décolle toujours. Entre un mur et le plafond la gravité locale suit la route (3° de marge pour ne pas rester « à l'envers » en revenant sur le mur).
- **Éditeur** : l'orientation se pose avec la pièce (aperçu compris) ou s'applique à une pièce posée ; messages clairs quand la place manque (un mur, un plafond ou une descente ne tiennent pas au ras du sol) ; une route sur un mur se sélectionne dans la scène et ne peut pas servir de point de départ pour « Tester ici ».
- **Éditeur (corrections)** : en profil *Potato* / *Ultra Potato* (portée 450 m, brouillard à 180 m) le circuit disparaissait quand on dézoomait : l'éditeur éloigne maintenant la portée et le brouillard (le profil de la course revient en sortant) ; une pièce posée à l'envers au niveau 0 est refusée avec un message au lieu de passer sous le sol ; l'éditeur avertit (pastille ⚠) quand un mur touche le sol sans transition ; `M` échange Mur gauche / Mur droit.
- **Audit** : `node tools/audit-pieces.mjs` relève l'entrée et la sortie de chaque pièce (pente, roulis, dénivelé, virage), vérifie qu'aucune sortie n'est un cul-de-sac et que **toute pièce existe aussi parcourue à l'envers** ; `tools/test-v093.mjs` conduit des pentes, des murs et un plafond, et tire 150 circuits au hasard.
- Le format reste compatible : 52 types ajoutés **à la suite** de `PIECE_ORDER`, l'orientation est un champ optionnel (`o`, dans `data.e`) ; un circuit sans mur garde exactement la même signature.
- La physique change (`PHYS_VER` 23) : records et replays repartent de zéro ; **la fonction `submit-score` doit être redéployée** (`npm run build:function`, puis la déployer).

## Bêta 0.9.2

- **Pièces** : *Courbe* (rampe qui se courbe progressivement), *Inclinaison* pour le *Virage* (comme la ligne droite), *Route sur le côté* (transition et ligne droite à 90° : il faut de la vitesse, sinon on glisse et on tombe). Icône pour la *Ligne droite · inclinaison 4*.
- **Plaque bateau** : une très légère montée de l'eau au sol ; eau pour le bateau, route normale pour les autres.
- **Bifurcation** : le revêtement de la voie déportée ne déborde plus sur la voie directe (il commence là où la voie déportée sort de la voie directe) et ses motifs sont centrés sur elle.
- **Éditeur** : plus de raccourcis pour choisir une pièce ; `I` = Inspecter ; `Ctrl + D` duplique la pièce ou la décoration inspectée ; le pot de peinture remplit aussi une **zone vide fermée** par des pièces ; *Checkpoint* est une simple case à cocher (portique sur route, balise sur plateforme ; l'anneau aérien disparaît de l'éditeur, les anciens circuits restent lisibles) ; nom et description dans les paramètres du niveau.
- **Décors** : catégories *Lumières* (projecteur tournant, projecteur, lanternes, lampadaire : de vraies lumières, de la couleur de l'objet), *Véhicules*, *Noël* et *Halloween*.
- **Jeu** : deltaplane plus maniable ; traînée du véhicule permanente (intensité selon la vitesse et le boost) ; plus de bruit de moteur à l'arrivée ; textes plus courts ; menu Communauté (icône cristal pour le temps de l'auteur, boutons réorganisés).
- La physique change (`PHYS_VER` 22) : records et replays repartent de zéro ; **la fonction `submit-score` doit être redéployée**.

## Bêta 0.9.1

- **Qualité graphique** : profils Ultra, Haute, Moyenne, Basse et Potato, détection automatique par un benchmark invisible sur l'animation du menu, réduction automatique si le jeu rame.
- **Records locaux** : le temps et les médailles ne dépendent plus de la place disponible dans le navigateur.
- **Corrections** : le dessous et la tranche des dalles sont solides (un deltaplane ne traverse plus une rampe), un pont au-dessus d'un checkpoint ou de l'arrivée ne les déclenche plus, « Effacer les records » efface vraiment (y compris dans le cloud), un record d'une ancienne version de la physique ne bloque plus un nouveau, le retour au checkpoint annule les anneaux / réceptions / mini-turbos d'après le checkpoint, un checkpoint aérien ne fait plus gagner le temps passé en l'air, les circuits de joueurs ne rapportent des pièces que pour une nouvelle médaille.
- **Serveur** : replays refusés avant dépliage s'ils sont trop longs, défis du jour limités à hier / aujourd'hui / demain, replays des classements non lisibles publiquement (`supabase/etape5-securite.sql`, à lancer une fois).

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
- Éditeur : sélection et copier-coller, test depuis le curseur, vérificateur (badge ⚠), vue par niveau, tours multiples, miniatures.
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
js/trail.js                    traînée lumineuse du véhicule (ruban permanent)
js/carModel.js, garage.js      voiture, moto, bateau, deltaplane, garage
js/cosmetics.js, profile.js    catalogue visuel, pièces, code joueur
js/scenery.js, music.js        11 décors, musique générée
js/trackMesh.js, js/geo.js     maillages low-poly
js/tracks.js                   66 circuits intégrés, médailles et objectifs
tools/test-phase3.mjs          tests du raycast, décorations libres, verre fragile, tunnel, unités (npm test)
tools/test-phase2.mjs          tests des familles, du schéma JSON, des courbes, options, mouvements (npm test)
tools/test-v093.mjs            tests des pentes, murs, plafond, orientation et du hasard (npm test)
tools/audit-pieces.mjs         audit du graphe des pièces : raccords, culs-de-sac, inversions (npm test)
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
d'une bifurcation, `o` orientation (1 mur gauche, 2 mur droit ; le plafond reste le drapeau `v`) ; couleur libre d'une décoration (10e valeur). Le code reste en version 3 tant qu'aucun de ces champs n'est utilisé.
La signature (clé des classements et de la vérification) ignore le thème et les couleurs, et reste identique pour tout circuit qui n'utilise rien de nouveau.
