# Historique des versions

Une section par version, la plus récente en haut. Le numéro de version affiché au joueur est `VERSION` dans `js/version.js` (et `package.json`) ;
`PHYS_VER`, dans le même fichier, est la version de la **physique** : les records, replays, fantômes importés, classements en ligne et salons
multijoueurs y sont liés. Une version qui change `PHYS_VER` impose de **redéployer la fonction serveur `submit-score`** (voir le README).

*Les nombres des sections anciennes (portées en cases, vitesses de saut…) sont ceux du monde de leur époque ; le monde est passé de cases de 24 m à 32 m en 0.9.11.*

## Bêta 0.9.35 — Défi du jour 2 : mutation du jour, séries, récompenses

Étape E13 de Copytrack Evolution. `PHYS_VER` inchangé (26), `NET_VER` inchangé (3). **À redéployer : la fonction `submit-score`** (`npm run build:function`, déjà régénérée ici) : sans elle, le serveur refuse les temps des mutations « verglas » et « vent » (catégories `gp` et `wd`, nouvelles). Le défi du jour et toutes les autres catégories sont vérifiés comme avant.

- **Mutation du jour** : chaque défi du jour a sa mutation, la même pour tout le monde, proposée en tête des catégories de record de sa fiche, avec son propre classement. Une par jour de la semaine (UTC) :
  - lundi : verglas (adhérence à 60 %) ;
  - mardi : vent de travers (25 %, direction tirée de la date) ;
  - mercredi : moto imposée ;
  - jeudi : gravité légère (70 %) ;
  - vendredi : verglas dans le brouillard (adhérence à 80 %, brouillard épais, purement visuel) ;
  - samedi : moto sur la Lune (moto et gravité à 70 %) ;
  - dimanche : gravité lourde (130 %).
  Une mutation n'est retenue que si le pilote automatique finit le défi muté ; sinon, la suivante dans la semaine. Aucune ne rend une voiture plus rapide : elles changent la piste pour tout le monde.
- **Le défi lui-même ne change pas** : la mutation est une catégorie (une variante d'E3 : `daily-AAAA-MM-JJ~v1.gp-60`…), pas un autre circuit. Les défis passés, ceux de l'empreinte de la physique et leurs records restent identiques au bit près. Le document d'architecture prévoyait des mutateurs datés dans le défi : l'empreinte fige justement des défis de décembre 2026, et une catégorie fait le même travail sans rien casser.
- **Séries** : nombre de jours consécutifs avec un défi du jour terminé (le défi, sa mutation ou une autre catégorie), calculé depuis les jours déjà enregistrés (`dailyDays`) ; la série est encore vivante tant que le défi d'hier est fait. Elle s'affiche sur la carte du défi, dans sa fiche (meilleure série, prochain palier) et à l'arrivée.
- **Récompenses** :
  - paliers de série : 3, 7, 14 et 30 jours (30, 70, 140 et 300 ◆), une seule fois chacun, quand la meilleure série les atteint ;
  - mutation du jour : +30 ◆ à la première arrivée, chaque jour ;
  - deux exclusifs du garage : la traînée givrée (une série de 7 jours) et la lumière toxique (10 mutations terminées).
- Sous le capot : `js/mutations.js` (mutations, `dailyMutation`, `streakOf`), règles `grip` et `wind` dans `rulesCore.js` (absentes tant qu'elles ne changent rien : les règles, modes et salons d'avant gardent exactement leur forme), catégories `gp` et `wd` dans `variants.js`, profil `mutDays` et `dailyBest` (fusion cloud : union, maximum).
- **Limite assumée** : pas de « sens inversé » ni de miroir pour l'instant. Il faudrait transformer géométriquement chaque type de pièce (virages, bifurcations, pièces dissymétriques), avec une empreinte dédiée : c'est un chantier à part.
- Tests : `tools/test-defi.mjs` (défi inchangé, deux semaines de mutations, vérification serveur d'une mutation, règles, fiche, séries, paliers, exclusifs, fusion) ; test navigateur (série et mutation dans la fiche, course de la mutation, bonus, série) et anglais.

## Bêta 0.9.34 — Académie 2 : compétences et exercices évalués

Étape E12 de Copytrack Evolution (début du bloc 4). `PHYS_VER` inchangé (26), `NET_VER` inchangé (3), rien à redéployer (rien ne touche à la course ni au serveur).

- **Exercices évalués** (Académie, sous les six leçons) : quatre **compétences** (trajectoire, freinage, dérapage, sauts et réceptions), un exercice chacune, noté **bronze, argent ou or**. Le niveau d'une compétence est la meilleure note de ses exercices.
  - **Chicanes** (trajectoire) : la vitesse moyenne dans deux séries de quatre virages serrés (100, 114, 124 km/h).
  - **Freiner tard** (freinage) : le temps passé dans les deux zones de freinage, de l'approche à la sortie du virage (6,26, 5,87, 5,62 s).
  - **Mini-turbo renforcé** (dérapage) : un mini-turbo, puis un renforcé, puis un renforcé sans choc avec une arrivée en 11,5 s ou moins.
  - **Trois réceptions** (sauts) : une, deux ou trois réceptions parfaites.
- **Mesuré par l'analyse** : à l'arrivée, la course est rejouée à partir de ses commandes et mesurée (`js/analysis/drill.js`), exactement comme dans les tests. Les seuils sont calés sur le pilote automatique : à 60 % de son adhérence, bronze ; à 80 %, argent ; à 100 %, or. Chaque note est démontrée par une course scriptée dans `tools/test-skills.mjs` (pilote automatique à plusieurs niveaux, geste de dérapage, frein tenu en l'air), pas seulement par un humain.
- **Conseils adaptés** :
  - le menu de l'Académie désigne le **point faible** (la compétence la plus basse) et son exercice ;
  - le bilan d'un exercice donne la mesure, les trois objectifs et un conseil : celui du coach face au pilote de référence dans la zone mesurée, ou ce que le geste a manqué (« Mini-turbo simple : la glisse s'est arrêtée trop tôt… ») ;
  - à l'arrivée d'une course, quand un conseil du coach désigne un geste (freinage, trajectoire, saut), un bouton « 🎓 S'entraîner » mène à l'exercice correspondant.
- **Les six leçons** restent jouables et comptées comme avant (diplôme, titre, exclusif). Pièces : 10, 15 et 25 ◆ la première fois qu'une note est atteinte, une seule fois par note.
- Sous le capot : `js/skills.js` (compétences, exercices, notes, profil `drills` : `{ id: { lvl, best } }`), `js/analysis/drill.js` (mesure et conseil), fusion cloud `mergeDrills` (meilleur niveau, meilleure mesure dans le bon sens). Le document d'architecture parlait d'un champ `skills` par compétence : il est rangé par exercice, le niveau de compétence s'en déduit.
- **Limite assumée** : un exercice par compétence pour l'instant. Le dérapage se juge sur un seul virage, car aucun geste scripté fiable n'enchaîne plusieurs mini-turbos (la leçon « en série » de 0.9.15 non plus) : une note qui ne serait démontrée par aucune course n'aurait pas sa place.
- Tests : `tools/test-skills.mjs` (exercices, notes démontrées, conseils, profil, fusion) ; test navigateur (menu, consignes, course mesurée notée or, conseil adapté à l'arrivée) et anglais (consignes, bilans).

## Bêta 0.9.33 — logique du circuit : des règles « quand… si… alors… »

Étapes E10 et E11 de Copytrack Evolution (fin du bloc 3). `PHYS_VER` inchangé (26), `NET_VER` inchangé (3). **À redéployer : la fonction `submit-score`** (`npm run build:function`, déjà régénérée ici) : sans elle, le serveur refuse les temps des **seuls** circuits qui ont une logique (comme pour l'adhérence et le vent de 0.9.31) ; tous les autres sont vérifiés comme avant.

- **Logique du circuit** (éditeur, bouton ⚙ ou **F6**) : des règles **ÉVÉNEMENT → CONDITIONS → ACTIONS** qui agissent sur les groupes d'E9.
  - Événements : le départ, le passage d'un checkpoint (le n-ième, ou chacun), le début d'un tour, un temps de course, la voiture qui entre sur un groupe, la voiture qui change de véhicule.
  - Conditions (toutes vraies) : checkpoints passés, tour, compteurs, véhicule, groupe visible ou caché.
  - Actions : **montrer, cacher, basculer un groupe** (une pièce cachée n'est plus dessinée et n'a plus de collision, ses obstacles non plus ; un checkpoint ou une arrivée cachés ne comptent pas), régler la **gravité**, changer un **compteur** (jusqu'à 4), jouer un **effet** visuel ou sonore (les mêmes que les déclencheurs de cases, sans effet sur la course).
  - « Une seule fois par essai », groupes **cachés au départ**. Bornes : 32 règles, 8 conditions et 8 actions par règle.
- **Jouée dans la simulation**, donc identique en course, dans les fantômes, les replays et la **vérification serveur**. Un retour au checkpoint revient à l'état de ce checkpoint : une porte ouverte en le passant reste ouverte. La logique (et l'appartenance aux groupes qu'elle touche) entre dans la signature du circuit : à revérifier après chaque changement.
- **L'éditeur de logique** : la liste des règles, chacune **lue en une phrase** (« Quand le checkpoint n° 1 est passé, si compteur 1 ≥ 2 : montrer « Porte », gravité à 60 %. (une fois) »), à monter, descendre, modifier ou supprimer ; un éditeur de règle par menus (la phrase se met à jour en direct) ; des **vérifications sans rouler** (une arrivée cachée que rien ne montre : erreur ; groupe vide, checkpoint ou tour qui n'arrivera jamais, compteur absent : avertissements). Pendant un essai depuis l'éditeur (T), chaque règle déclenchée s'affiche.
- **Conversion** des déclencheurs de cases (lot 12) : chaque case devient un groupe, ses effets une règle « quand la voiture entre sur ce groupe ». Les déclencheurs de cases restent lus comme avant tant qu'on ne convertit pas.
- **Additif, et c'est vérifié** : un circuit sans logique roule exactement comme avant (sans logique, l'ensemble exclu de la physique est celui du verre brisé lui-même) ; les **177 scénarios** de l'empreinte sont identiques, **5 nouveaux** (porte, zones, obstacles cachés) s'y ajoutent, identiques sous Node, Deno et Chromium.
- Sous le capot : `js/sim/logic.js` (dans la fermeture de la vérification : ni horloge, ni hasard, ni trigonométrie), champ `lg` du circuit (format 4), `CarPhysics.excl`, état de la logique dans l'instantané d'un checkpoint (`RaceLogic`, champ `ext`), `RaceSession._logicSync` (groupes montrés ou cachés sans reconstruire la piste, effets) ; `js/logicText.js` (phrases, vérifications, conversion ; une table de phrases par langue) et `js/editor/logicUi.js`.
- **Limites assumées** : pas encore d'actions sur les pièces mobiles ni sur les revêtements (elles demandent d'autres états dans la simulation) ; pas d'éditeur visuel en nœuds : des règles en phrases, plus simples à lire.
- Tests : `tools/test-logique.mjs` (format, signature, porte fermée puis ouverte, retour au checkpoint, compteurs, zones, une seule fois, effets sans effet, vérification serveur, fantômes, phrases en français et en anglais, vérifications, conversion ; aussi sous Deno), empreinte (182 scénarios), test navigateur (une porte qui s'ouvre au checkpoint, construite dans l'éditeur, essayée, puis vérifiée) et anglais.

## Bêta 0.9.32 — groupes et calques dans l'éditeur, aperçu 3D des pièces perso

Étape E9 de Copytrack Evolution. `PHYS_VER` inchangé (26), `NET_VER` inchangé (3), rien à redéployer (les groupes n'ont aucun effet sur la course : ils n'entrent pas dans la signature ; la logique du circuit, E10, s'en servira).

- **Groupes et calques** (éditeur, bouton ▦ ou **F4**) : ranger des pièces et des décorations dans des **groupes** numérotés (1 à 63) et **nommés**, puis, pendant l'édition, **masquer** un calque (ni dessiné ni visable) ou le **verrouiller** (visible mais ni sélectionnable ni modifiable) ; sélectionner tout un groupe ; sortir la sélection de son groupe. Les groupes et leurs noms voyagent dans le code du circuit (format 4) ; masquer et verrouiller restent des états de l'éditeur. Tout s'annule comme le reste.
- **Vue par niveau** (◐, Z) : la sélection (copier, couper, supprimer, monter, descendre) ne prend plus que les pièces du niveau affiché.
- **Atelier « Mes pièces »** : un **aperçu 3D** de la pièce en plus des vues de face et de dessus, construit exactement comme sur la piste ; il tourne seul, glisser pour le tourner soi-même.
- **Corrigé** : annuler une action dans l'éditeur effaçait toutes les **pièces perso** posées (leurs formes n'étaient pas gardées par l'historique, depuis 0.9.24).
- Sous le capot : champ `g` des pièces (table `TILE_FIELDS`) et des décorations, noms dans `gn` ; `TrackView` dessine chaque groupe dans son propre maillage et sait le montrer ou le cacher sans tout reconstruire (`setGroupVisible`), ce dont la logique du circuit aura besoin en course ; filtres de visée et de sélection (`js/editor/groups.js`, `js/editor/preview3d.js`).
- **Reportés** (ils étaient dans le plan d'E9) : la bibliothèque de matériaux (couleurs nommées réutilisables) et une caméra libre dédiée dans l'éditeur ; ils iront avec les finitions (E22).
- Tests : `tools/test-groups.mjs` (bornes, noms, code, signature inchangée, annulation avec pièces perso, filtre de copie) ; test navigateur (panneau, masquer, verrouiller, nommer, code, annuler, aperçu 3D) et anglais.

## Bêta 0.9.31 — adhérence et vent sur tout le circuit (paramètres de simulation)

Étape E8 de Copytrack Evolution (début du bloc 3). `PHYS_VER` inchangé (26), `NET_VER` inchangé (3). **À redéployer : la fonction `submit-score`** (`npm run build:function`, déjà régénérée ici) : sans elle, le serveur refuse les temps des **seuls** circuits qui utilisent ces réglages ; tous les autres sont vérifiés comme avant.

- **Éditeur › Paramètres du niveau** : **Adhérence de la piste** (25 à 150 %, en plus de celle des revêtements) et **Vent** (0 à 100 %, huit directions ; le nord est en haut de l'éditeur), sur le sol comme sur les loopings, murs et tubes. Ils changent la course : ils entrent dans la signature du circuit (donc dans sa clé de classement) et le code passe au format 4. La fiche du circuit les affiche.
- **Additifs, et c'est vérifié** : à leur valeur par défaut, rien ne change, ni la course (la physique ne fait même pas l'opération), ni la signature, ni le code. Les **173 scénarios** de l'empreinte de la physique sont identiques ; **4 scénarios nouveaux** (adhérence 70 % et 140 %, vent sur la route et dans les loopings) s'y ajoutent, identiques sous Node, Deno et Chromium.
- Sous le capot : trois lignes de la table `RULES` de `js/track.js` (`grip`, `wind`, `windDir` : constructeur, copie, signature, code, historique de l'éditeur s'en déduisent), `js/sim/params.js` (`paramsOf`, mathématiques déterministes). Le document d'architecture parlait d'un champ `sp` séparé : la table existante fait le même travail sans rien ajouter au format. Le vent garde la direction choisie même sans vent : l'éditeur la remet à zéro pour ne pas toucher à la signature.
- **Limites assumées** : le vent ne souffle que sur la route (pas en vol : le deltaplane n'y est pas sensible) et il est constant (les rafales et la météo qui change en course viendront avec les environnements, E19).
- Tests : `tools/test-sim-params.mjs` (défauts sans effet, bornes, signature, code, course plus lente, poussée du vent dans sa direction, vérification serveur d'un circuit à paramètres), empreinte (177 scénarios), test navigateur (réglages de l'éditeur, signature).

## Bêta 0.9.30 — le coach

Étape E7 de Copytrack Evolution (dernière du bloc 2). `PHYS_VER` inchangé (26), `NET_VER` inchangé (3), rien à redéployer.

- **Conseils à l'arrivée** : jusqu'à trois conseils, chacun **à un endroit** (un secteur) et **chiffré**, face à une référence plus rapide (ton record, sinon le fantôme or) :
  - retour au checkpoint (le temps qu'il a coûté), chocs contre le mur ;
  - freinage **trop tardif** (« tu freines 45 m plus tard que la référence et tu en ressors à 59 km/h au lieu de 91 ») ou **trop tôt** ;
  - **vitesse mini** trop basse dans un virage, **temps en l'air** de trop, **trajectoire** plus large que la référence ;
  - sinon, le secteur où le temps se perd, avec les vitesses maxi.
  Rien n'est conseillé là où aucun temps n'a été perdu : une course identique à la référence n'a aucun conseil. Calculé après l'affichage de l'écran (deux courses rejouées), jamais pendant la course. Bouton « 🎬 Voir ces passages dans le Replay Theater ».
- **Dans le Replay Theater** : face à la première course comparée, les conseils sont marqués sur la barre de temps (repères bleus) et listés dans le panneau d'analyse ; ▶ amène trois secondes avant le passage.
- `js/analysis/coach.js` (pur) ; un freinage est montré là où il a lieu (la cause), même si le temps se perd un peu plus loin.
- **Limites assumées** : les règles sont des seuils simples (8 m pour un freinage, 3 m/s de vitesse mini, 0,3 s en l'air, 3 m de trajectoire), pas un apprentissage ; les conseils de freinage demandent les commandes des deux courses (pas face à un fantôme en ligne) ; le pilote automatique freine peu (il lève le pied) : la règle du freinage tardif est testée sur des courses synthétiques, les autres sur de vraies courses modifiées.
- Tests : `tools/test-coach.mjs` (course identique : aucun conseil ; freinage avancé, retour au checkpoint et virages prudents sur de vraies courses ; freinage tardif sur des traces synthétiques ; traduction anglaise de chaque conseil) ; test navigateur (conseils à l'arrivée, repères et conseils cliquables dans le Theater).

## Bêta 0.9.29 — Replay Theater

Étape E6 de Copytrack Evolution. `PHYS_VER` inchangé (26), `NET_VER` inchangé (3), rien à redéployer.

- **Le replay devient une salle d'analyse.** « 🎬 Revoir la course » (arrivée) et « 🎬 Regarder mon record » (fiche du circuit) ouvrent le Theater :
  - **barre de temps** : on va et vient dans la course (en arrière comme en avant), avec les **secteurs**, les **retours au checkpoint** et les **chocs** marqués dessus ; lecture, pause, ×0,25 à ×4, comme avant au clavier (Espace, ← →, C, Entrée, Échap) ;
  - **comparaison** : jusqu'à trois courses sur la piste en même temps que celle regardée, chacune de sa couleur, avec son temps et son écart. À l'arrivée : la course contre le record (ou l'ancien record, si elle en est un nouveau). Depuis la fiche : « Comparer avec » le fantôme or, le record mondial ou les rivaux choisis ;
  - **caméras** : en plus des caméras de course, de la TV et de l'orbite, **Libre** (glisser pour tourner autour de la voiture, molette pour s'approcher) et **Cinématique** (poursuite basse, travelling, grue, poste fixe qui s'enchaînent) ;
  - **📈 Analyse** : les trajectoires de toutes les courses sur la carte du circuit (avec les voitures en direct), la vitesse de chacune et l'écart avec la course regardée le long du parcours, et le tableau des 12 secteurs (meilleur temps en violet).
- **Exact** : revenir en arrière recommence la course et la rejoue sans image ni son jusqu'au pas voulu ; on retombe sur exactement la même voiture qu'en lecture continue (vérifié dans le test navigateur, retour au checkpoint compris) ; aller au bout d'une course d'une minute prend quelques dizaines de millisecondes.
- **Construit sur le mode replay de la course** (même rendu, mêmes caméras, même export vidéo WebM) plutôt que sur une nouvelle session comme le prévoyait le document d'architecture : rien n'est dupliqué, et tout ce qui marchait dans le replay marche dans le Theater.
- **Limites assumées** : les caméras suivent la course regardée (pas une course comparée) ; un fantôme en ligne n'a que des positions (pas de courbes de commandes) ; avant un retour au checkpoint, le panneau d'analyse ne montre que la course finale (la partie effacée par le retour n'a pas de secteurs) ; le nombre d'images par seconde avec quatre courses n'a pas été mesuré sur une vraie carte graphique (le test navigateur tourne en rendu logiciel) : seul le coût de l'interface du Theater l'est.
- Tests : test navigateur (record comparé au fantôme or, déplacement dans le temps exact, temps final identique, repères, secteurs, caméras, retour à la fiche, « Revoir la course » avec l'ancien record) et anglais.

## Bêta 0.9.28 — HUD d'entraînement et profils de HUD

Étapes E4 et E5 de Copytrack Evolution. `PHYS_VER` inchangé (26), `NET_VER` inchangé (3), rien à redéployer. **Rien ne change pour qui garde le profil Classique** (le profil par défaut).

- **Profils de HUD** (Options › Personnalisation › Profil du HUD) : *Classique* (tout, comme avant), *Compétitif* (sans aide des touches, médailles ni nom du circuit), *Entraînement* (les outils ci-dessous), *Minimaliste* (chrono et vitesse). Un profil cache ses éléments **en plus** de ceux que tu as cachés toi-même.
- **HUD d'entraînement** : à gauche de l'écran, l'**écart en direct** avec une course de référence (au passage d'un checkpoint, c'est l'écart officiel à 1/30 s près : testé), les **mini-secteurs** (12, temps et écart), la **vitesse maxi**, les **forces g**, et trois secondes de **courbes** gaz / frein / vitesse. Sur la piste : la **ligne de la référence** (verte quand elle accélère, rouge quand elle freine, blanche en roue libre) et des **repères à ses points de freinage**. Chaque outil se coupe à part.
  - **Référence** au choix : mon record (ses commandes rejouées : la course exacte), le fantôme or (le pilote automatique, circuits intégrés) ou le record mondial (positions du n° 1 en ligne). Si elle manque, on prend la suivante et on l'écrit (« à défaut »). Un nouveau record devient la référence à l'essai suivant.
  - Puce **🎯 HUD d'entraînement** dans la fiche du circuit pour l'activer d'un geste.
  - Coût mesuré dans le test navigateur : **moins de 0,3 ms par image** (le texte se met à jour 10 fois par seconde, le suivi à chaque image). La ligne et les repères ne lisent que la course : rien ne touche à la physique ni au chrono.
- **Noyau d'analyse** (`js/analysis/`, pur, testé sous Node) : `trace.js` rejoue une course avec le GhostRunner du jeu et note tout ce qu'il faut (ses positions sont celles du fantôme enregistré, au bit près) ; `reference.js` (ligne de course, projection) ; `sectors.js` (mini-secteurs dont la somme est le temps de la course, écarts, freinages) ; `live.js` (le suivi en direct) ; `events.js`. Il servira au Replay Theater et au coach.
- **Limites assumées** : la ligne de la référence est un trait fin (pas un ruban) ; sur un circuit de l'éditeur, la « distance » est mesurée le long de la course de référence (il n'y a pas de ligne centrale continue) ; le record mondial comme référence ne donne ni courbes de commandes ni repères de freinage (le serveur ne publie que les positions).
- Tests : `tools/test-analyse.mjs` (trace au bit près sur le corpus, secteurs, deux styles de pilotage, les 72 circuits, écart en direct contre l'écart officiel sur trois circuits, recalage après un retour, coût), `tools/test-interface.mjs` (profils), test navigateur (HUD d'entraînement, coût par image, Classique inchangé) et anglais.

## Bêta 0.9.27 — catégories de records : départ en moto, en bateau, en deltaplane, sans obstacles

Étape E3 de Copytrack Evolution. `PHYS_VER` inchangé (26), `NET_VER` inchangé (3), **aucune étape SQL** : une catégorie voyage dans la clé de classement (`<clé officielle>~v1.veh-moto`, 80 caractères au plus comme avant). **À redéployer : la fonction `submit-score`** (`npm run build:function`, déjà régénérée ici) : sans elle, le serveur refuse les temps des catégories (« Clé de circuit invalide »), le reste marche.

- **Fiche du circuit › Catégorie de record** : *Officiel*, *Départ en moto*, *en bateau*, *en deltaplane* (ou *en voiture* sur un circuit qui part autrement) et *Sans obstacles* (circuits à obstacles). Seules les catégories qui changent vraiment la course sont proposées. Chacune a **son classement mondial, son record et ses dernières courses** ; le record officiel n'est jamais touché. Pas de médailles ni de pièces dans une catégorie (elles sont calibrées sur le circuit officiel). Après la course, « Retour » ramène à la fiche dans la même catégorie.
- **Vérifié par le serveur** comme le reste : `js/variants.js` (dans la fermeture de la vérification) lit la catégorie, `js/rulesCore.js` (les règles des modes, sorties de `rules.js` sans changer son interface) l'applique à une copie du circuit, puis la course est rejouée. Une écriture non canonique (noms dans le désordre, valeur hors liste, doublon) ou une catégorie sans effet sur ce circuit est refusée : deux écritures d'une même catégorie ne feront jamais deux classements.
- Autres catégories prêtes côté serveur pour la suite (modes publiés, défi du jour) : gravité de départ (40, 70, 130, 180 %), vitesse de départ, hors-piste, nombre de tours ; elles ne sont pas proposées dans la fiche.
- Circuit de joueur : c'est le code du circuit **d'origine** qui part au serveur (il applique la catégorie lui-même), depuis l'arrivée comme depuis le classement.
- Tests : `tools/test-variants.mjs` (grammaire, refus, copie, clés des 72 circuits, vérification d'une vraie course en moto acceptée dans sa catégorie et refusée au classement officiel, fonction serveur avec Supabase simulé), `tools/test-hub.mjs` (descripteur et catégories proposées) ; test navigateur (choix « Départ en moto », la course part en moto, sans médailles, retour dans la catégorie).

## Bêta 0.9.26 — la fiche du circuit (Race Hub), la course rapide, et un filet de compatibilité

Première livraison de **Copytrack Evolution** (étapes E0 à E2 du plan d'architecture). `PHYS_VER` inchangé (26), `NET_VER` inchangé (3). Le Race Hub lit les tables existantes (classement, fantômes de l'étape 7, titres de l'étape 8) : aucune étape SQL nouvelle. Aucun record, code ou replay ne change.

**À redéployer : la fonction `submit-score`.** Son paquet (`supabase/functions/submit-score/index.ts`) n'avait pas été régénéré depuis 0.9.15 : il ignorait la décoration « pièce perso » (0.9.24), donc la signature d'un circuit qui en contient différait côté serveur et **ses records en ligne étaient refusés** (« Le code du circuit ne correspond pas »). Le paquet est régénéré ici (`npm run build:function`) ; la CI le vérifie (`git diff --exit-code`).

- **Fiche du circuit (Race Hub)** : choisir un circuit, d'où qu'on vienne (carte de la carrière, défi du jour, carte de Mes circuits ou de la communauté, favoris), ouvre sa fiche au lieu de lancer la course. On y trouve :
  - une **grande carte** vue de dessus, **zoomable** (molette, pincement, glisser, double clic, touches + − 0 et flèches) : départ, arrivée, checkpoints (numérotés quand l'ordre est connu, c'est-à-dire sur les circuits intégrés ; sinon « dans l'ordre de ton choix »), zones (accélérateurs, verglas, eau, plaques…), pièces mobiles et obstacles, avec sa légende ;
  - difficulté, **distance** (de course pour les circuits intégrés ; longueur de piste posée, estimée, pour les autres), tours, pièces, profil, médailles et **objectif bonus** ;
  - le **classement** à onglets : **Mondial** (les 10 premiers vérifiés par le serveur, **véhicule à l'arrivée** tiré du fantôme enregistré, date, ta place, « Envoyer mon record ») et **Personnel** (record, temps intermédiaires, **tes 10 dernières courses**). Un onglet n'apparaît que si ses données existent (« Amis » et « Saison » viendront avec leurs étapes SQL) ; hors ligne, l'onglet Mondial le dit et le reste marche ;
  - le **lancement** : record, fantômes (mon record, or, importé : les mêmes réglages qu'Options), jusqu'à **3 rivaux en ligne** choisis avec 👻 dans le classement, et **▶ Jouer** (Entrée ; toujours visible en bas sur téléphone) ;
  - **🎬 Regarder mon record** (le replay exact, retour à la fiche ensuite) et **★ Favori**.
  La fiche s'affiche tout de suite (moins de 100 ms, mesuré dans le test navigateur) : seul le classement mondial attend le réseau, dans son panneau. Après une course lancée depuis la fiche, « Retour » y ramène ; l'écran d'arrivée a un bouton **🗺 Fiche du circuit**. La fenêtre « 🏆 » des cartes utilise le même classement.
- **Course rapide** (menu) : un clic lance le prochain circuit de la carrière sans médaille (dans un chapitre ouvert) ; toute la carrière médaillée : le défi du jour.
- **Favoris** : groupe « ★ Favoris » en tête de l'écran Circuits (circuits intégrés, de Mes circuits et de la communauté, relus sur le serveur à l'ouverture). Rangés dans le profil, donc **synchronisés avec le compte** (fusion avec pierres tombales : un favori retiré ne revient pas).
- **Dernières courses** : chaque arrivée classable est notée (`runs.<clé>` : temps et date, 10 par circuit, sans fantôme), synchronisée avec le compte ; « Effacer les records » les efface aussi.
- **Sous le capot** : `js/trackDescriptor.js` décrit un circuit quelle que soit sa source ; **toutes les entrées passent par lui**, avec des options de lancement identiques à celles d'avant (test sur les 72 circuits). `js/ui/trackMap.js` est le noyau unique de la carte et des miniatures (les 80 miniatures comparées dans Chromium avant/après sont identiques au pixel près). `js/ui/leaderboardPanel.js` : classement à fournisseurs. `online.trackById` (favoris de la communauté).
- **Filet de compatibilité** (`tools/compat/corpus.json`, `tools/test-compat.mjs`) : les clés de classement des 72 circuits, des défis du jour passés, des codes de circuit de tous les formats (SHW1, SHW2, SHW3 v3 et v4), les codes de partage (SHG1, SHC1, SHD1, SHM1, SHX1, SHP1), 5 courses enregistrées avec leur temps exact (retour au checkpoint, bateau, défi du jour, circuit exporté en code joueur), d'anciens réglages et la fusion des sauvegardes sont figés et relus à chaque `npm test`.
- **Limites assumées** : les records en ligne se **regardent en course** (rivaux 👻 : leurs positions, pas leurs commandes) ; les regarder seuls, sous plusieurs caméras, viendra avec le Replay Theater. La distance d'un circuit de joueur est la somme des pièces posées (un raccourci compte aussi). Le choix de la catégorie de record (véhicule, aides) n'est pas encore là : il arrive avec les variantes de records.
- Tests : `tools/test-hub.mjs` (descripteur, carte, course rapide, véhicule à l'arrivée, dernières courses, favoris), `tools/test-compat.mjs` ; test navigateur (fiche complète, favori, replay du record et retour, course rapide, fiche d'un circuit de la communauté) ; test navigateur anglais (fiche traduite).

## Bêta 0.9.25 — règles de partie, modes de jeu à toi et paquets de personnalisation

`PHYS_VER` inchangé (26) ; **`NET_VER` passe à 3** (nouveau message « rules » du salon : tout le monde doit recharger la page pour jouer ensemble). Rien à redéployer côté serveur. **Aucune voiture ne change de performances** et aucune physique nouvelle : une règle n'est qu'un réglage que les circuits savent déjà porter (gravité, véhicule et vitesse de départ, hors-piste, tours) ou le retrait des obstacles.

- **Règles de la partie** (salon multijoueur, l'hôte) : gravité de départ, véhicule de départ, vitesse de départ, hors-piste, nombre de tours (circuits fermés), **sans obstacles**, **voitures identiques** (même apparence pour tous, la tienne comprise). Envoyées à tous (et à chaque arrivant), **revalidées à la réception**, appliquées au circuit de chacun ; un invité ne peut pas en imposer. `js/rules.js`.
- **Modes de jeu** (nouveau bouton **Modes** du menu) : un mode = des règles + un **objectif** (les objectifs bonus de la carrière : sans muret, sans réapparition, N réceptions parfaites, N mini-turbos, N anneaux, finir en moto/bateau/deltaplane, finir sous un temps) + un nom. Six modes fournis (*Sauts lunaires*, *Pieds de plomb*, *Route libre*, *Tout en moto*, *Départ lancé*, *Marathon*), création et modification des siens (20), jeu sur le circuit de son choix (intégré ou à soi), bilan « réussi / raté », **code `SHM1:`** à partager. Pas de records, pas de classement (le circuit transformé n'est plus celui des classements) et **pas de pièces à gagner** : sinon un mode « 1 000 pièces pour rien » casserait l'économie.
- **Paquets (mods)** (Modes › Paquets) : un code **`SHX1:`** regroupe ma voiture, mon interface, mes caméras, mes pièces décoratives et mes modes. **Rien d'exécutable** : chaque morceau repasse par le valideur de son module (champ inconnu ignoré, valeur bornée, 30 000 caractères au plus), l'import se fait élément par élément (cases à cocher) et **les éléments payants du catalogue ne sont pas offerts** (remplacés par l'élément d'origine). `js/mods.js`.
- **Corrigé au passage** : `Object.hasOwn` pour les noms de thème, de police, de compteur et d'objectif (un thème « __proto__ » aurait fait planter l'application de l'interface) ; la copie d'un circuit intégré par une règle garde sa ligne centrale (classement en direct) et la refait pour un autre nombre de tours.
- **Limites assumées** : les modes se partagent par code, pas par un serveur (aucune publication en ligne) ; les règles ne couvrent pas la gravité en cours de course (ce serait de la physique) ; « voitures identiques » ne change que l'apparence ; la personnalisation de la voiture n'est toujours pas envoyée aux autres joueurs.
- Tests : `tools/test-modes.mjs`, `tools/test-manche.mjs` (règles du salon), `tools/test-interface.mjs` (noms hérités) ; test navigateur (modes, bilan, paquet exporté puis réimporté, règle appliquée chez les deux joueurs d'un championnat).

## Bêta 0.9.24 — des décors réglables, tes propres pièces, des effets sur le circuit

`PHYS_VER` inchangé (26) ; rien à redéployer. **Rien ici ne touche à la conduite** : tout est visuel ou sonore, hors signature (changer un décor, une pièce ou un déclencheur ne fait perdre ni la vérification ni les records).

- **Ambiance avancée** (Paramètres du niveau, éditeur) : **météo** (pluie, neige, braises, poussière, pétales), **direction du soleil** (azimut, la hauteur est gardée), **teinte du ciel**, **teinte du sol**, **couleur de la brume**, et **heure qui défile** (aube → plein jour → coucher → nuit, en 2 min ou 50 s, 5 mises à jour par seconde). La météo est un nuage de points qui suit la caméra (`js/weather.js`), coupée aux profils les plus légers. Les anciens codes (trois champs) restent identiques.
- **Mes pièces** (onglet Prefabs de l'éditeur) : un atelier de **pièces décoratives** — jusqu'à 12 formes (bloc, sphère, cylindre, cône, cale, anneau) avec position, taille, rotation, couleur et **lumineuse** — vues de face et de dessus, bibliothèque locale (30), **code `SHD1:`** à partager. Une pièce se pose comme n'importe quelle décoration (taille, rotation, couleur) et **ses formes voyagent dans le code du circuit** (jusqu'à 10 par circuit) : celui qui l'ouvre la voit. Nouvelle décoration `custom` ajoutée à la fin de l'ordre existant.
- **Déclencheurs de circuit** (Paramètres du niveau › Déclencheurs…) : jusqu'à 16 effets posés sur des cases, joués une fois par essai quand la voiture passe : **message**, **moment de la journée**, **météo**, **brume**, **musique**, **éclat de couleur**, **secousse**, **son**. Le départ d'un nouvel essai remet décor et musique. **Volontairement aucun effet sur la conduite** (gravité, obstacles, vitesse) : ce serait de la physique, donc une autre version pour tout le monde.
- `js/ambiance.js` (étendu), `js/weather.js`, `js/customDeco.js`, `js/scripts.js` (purs, testés), `js/editor/cdeco.js`, `js/editor/scriptsUi.js`, `js/race/scriptsRun.js`.
- **Limites assumées** : le déclencheur se joue sur une case, à n'importe quelle hauteur (un pont qui en croise une autre déclenche aussi) ; la pièce perso est dessinée en 2D (face / dessus), sans aperçu 3D ; l'heure qui défile ne rafraîchit pas les reflets de l'environnement du profil Ultra ; la teinte du sol ne se met à jour qu'au chargement du circuit.
- Tests : `tools/test-pieces-perso.mjs`, `tools/test-scripts.mjs`, `tools/test-ambiance.mjs` (étendu) ; test navigateur (météo, heure qui défile, déclencheur en course, pièce perso dans le code, ateliers de l'éditeur).

## Bêta 0.9.23 — l'interface et les caméras à ton goût

`PHYS_VER` inchangé (26) ; rien à redéployer. Visuel uniquement : la conduite, les temps et les classements ne changent pas.

- **Profil › Options › Personnalisation** :
  - **6 thèmes** (Copytrack, Minuit, Crépuscule, Forêt, Mono, **Contraste élevé**), **deux couleurs d'accent** au choix, **opacité des panneaux**, **arrondi des boutons**, **5 polices** (Chakra Petch, système, arrondie, machine, classique).
  - **Compteur de vitesse** : chiffres, énorme, discret, **jauge** ou **cadran** ; **taille du chrono** (petit, normal, gros) ; **taille du HUD** (70 à 150 %) ; **cacher** l'écart, le record, les médailles, la jauge de boost, l'aide des touches, le nom du circuit.
  - **Disposer le HUD** : le vrai HUD s'affiche et on **glisse** le chrono, le bloc circuit, le bloc record, la vitesse et l'aide des touches où on veut (les positions sont en vw/vh : elles suivent la taille de l'écran) ; « Remettre » et « Réinitialiser » rendent tout.
  - **Mes caméras** : jusqu'à 6 caméras de course en plus des 4 d'origine (distance, hauteur, regard devant et en hauteur, champ de vision, nom), « Utiliser en course » ; la touche caméra fait le tour de la liste complète (replays compris).
- `js/uitheme.js` et `js/camprefs.js` (purs, testés), `js/app/uicustom.js` (application à la page, éditeurs). Réglages enregistrés dans les réglages du profil (`ui`, `cameras`), validés à chaque lecture.
- **Limites assumées** : pas d'aperçu en direct de la caméra pendant son réglage (on l'essaie en course) ; le thème « Contraste élevé » couvre les couleurs du HUD et des panneaux mais pas les textures du jeu ; les positions du HUD ne sont pas réajustées en tactile (le HUD tactile garde sa disposition).
- Tests : `tools/test-interface.mjs` ; test navigateur (thème posé, compteur, glisser le chrono, caméra du joueur en course).

## Bêta 0.9.22 — l'atelier de voiture : une voiture vraiment à toi

`PHYS_VER` inchangé (26) ; rien à redéployer. **Aucune de ces options ne touche aux performances** : la voiture roule exactement pareil (la physique ne dépend pas du modèle 3D ; empreinte de physique identique).

- **Garage › Atelier** (nouvel onglet, gratuit) avec cinq sous-onglets :
  - **Formes** : jusqu'à 24 pièces libres (bloc, sphère, cylindre, cône, cale, anneau) posées où tu veux sur la voiture et le deltaplane : position, taille, rotation, couleur, **symétrique** (copie de l'autre côté), **lumineuse**, dupliquer, supprimer.
  - **Peinture** : dégradé (deux sens), 6 motifs (rayures, alvéoles, camouflage, damier, pois, vagues) avec couleur et intensité, **texte**, **numéro de course** et **plaque d'immatriculation**, sur les deux flancs et à l'arrière.
  - **Dessin** : une grille 16 × 16 (crayon, pot de peinture, gomme, 15 couleurs) collée sur les flancs, ou **import d'une image** ramenée à la grille (couleur la plus proche).
  - **Effets** : couleur et longueur de la traînée (qui peut exister sans traînée du catalogue), couleur des étincelles et de la fumée de dérapage, **timbre** et hauteur du moteur, hauteur du klaxon.
  - **Code** : un code **`SHC1:`** contient toute la voiture, à envoyer à un ami (les éléments payants du catalogue restent à débloquer chez lui).
- `js/custom.js` (données, validation, codec, dessin : pur, testé) et `js/customCar.js` (rendu) ; `js/garage/studio.js` (interface). Tout ce qui vient de l'extérieur (code, profil, cloud) passe par `sanitizeCustom` : bornes, jeux de caractères (aucun HTML), longueurs.
- **Limites assumées** : les pièces libres ne s'appliquent pas à la moto ni au bateau ; la personnalisation n'est pas envoyée aux autres joueurs en multijoueur (ils voient la voiture de base) ; le dessin est une grille 16 × 16 (pas de pinceau 3D) ; **pas de modération** des textes et des dessins (ils ne sont visibles que sur ta voiture ou chez qui importe ton code).
- Tests : `tools/test-voiture.mjs` ; test navigateur (atelier complet, enregistrement dans le profil, aller-retour par le code).

## Bêta 0.9.21 — le jeu parle anglais (français / anglais)

`PHYS_VER` inchangé (26) ; rien à redéployer, côté serveur comme côté physique. **Rien ici ne touche à la course** (empreinte de physique, records, replays, classements identiques).

- **Deux langues** : français et anglais, une seule base de code. Le français reste la langue **source** et sert de clé : le code, le HTML et les données du jeu ne sont pas réécrits (~25 000 lignes) ; en anglais, le texte réellement affiché est traduit au dernier moment. Pas de dictionnaire chargé en français : rien ne change pour un joueur francophone (ni poids, ni écritures dans la page).
- **Choix de la langue** : au premier lancement d'un *nouvel appareil*, celle du navigateur (français si le navigateur est en français, anglais sinon) ; un appareil qui a déjà des données de jeu **reste en français** (on ne change pas la langue de quelqu'un sans qu'il l'ait demandé). Un sélecteur **Français / English** est sur l'écran d'accueil, et **Profil › Options › Langue** bascule en direct, sans recharger, dans les deux sens ; le français revient exactement à l'identique. La langue est un réglage de l'**appareil** (elle est connue avant l'identification du joueur).
- **Couverture : ~1 700 entrées** : accueil, menus, carrière (chapitres, objectifs bonus, **noms et descriptions des 72 circuits**), profil, options, commandes et noms de touches, tutoriel, Académie, garage et cosmétiques, titres, communauté, multijoueur, bandeau d'aide et messages de course, arrivée, replay, **éditeur** (barre d'outils, palette, catalogue de pièces et de **décorations**, inspecteur, prefabs, raccourcis, messages), erreurs du serveur et du réseau.
- **Comment ça marche** (`js/i18n.js`, `js/i18n/`) : un traducteur DOM (`MutationObserver`, qui s'exécute avant le dessin : aucun flash de français) traduit les textes, les infobulles (`title`, `aria-label`, `placeholder`) et les paragraphes à balises (`<b>…</b>`) *d'un bloc*, car l'ordre des mots change d'une langue à l'autre. Les textes à valeurs (« Tour 2/3 », « 12 pièces · modifié le… ») sont reconnus par des **modèles à trous** (`{n}`, `{name:t}` : valeur traduite à son tour, `{n:w}` : un seul mot, pour qu'un modèle « Montée {n} » n'avale pas une phrase) ; les pluriels anglais sont des fonctions. Dates et heures suivent la langue. `t('Tour {n}', {n})` existe pour le texte qui ne passe pas par la page (presse-papiers, partage).
- **Un trou de traduction est une phrase française, jamais un écran cassé** : un texte sans entrée reste tel quel.
- **Limites assumées** : (1) la traduction **n'a pas été relue par un anglophone natif** ; (2) le texte écrit par les joueurs (pseudos, noms et descriptions de circuits publiés) n'est évidemment pas traduit — et un pseudo qui serait *exactement* un mot de l'interface (« Jouer », « Retour ») s'afficherait traduit, cas très rare ; (3) les écrans qui demandent un salon réseau réel (salle multijoueur en cours, classements en ligne détaillés) sont couverts par le scan du code et les modèles, pas par une vérification en navigateur ; (4) le README, les docs `supabase/` et les messages de console restent en français ; (5) ajouter une troisième langue = un fichier `js/i18n/<code>.js` + une ligne dans `DICTIONARIES` (`i18n/boot.js`) et `LANGS` (`i18n.js`).
- **Corrigé au passage** : le message de fin de carrière (« ✦ Carrière complète : … ») affichait littéralement `${sm.total}` (apostrophes au lieu d'une chaîne gabarit).
- **Outils** : `tools/i18n-scan.mjs` (inventaire des textes français et de leur couverture ; `--keys` pour amorcer un dictionnaire), `tools/i18n-crawl.mjs` (parcourt les écrans en anglais dans un vrai navigateur et liste ce qui reste en français).
- **Tests** : `tools/test-i18n.mjs` (noyau, intégrité du dictionnaire — trous et balises conservés, pas de traduction contradictoire —, **couverture de `index.html` et de toutes les données**, y compris les 72 descriptions de circuits) ; `tools/test-browser-i18n.mjs` (langue au premier lancement dans les trois cas, bascule en direct dans les deux sens, retour exact au français, aucun reste de français sur les écrans principaux, en course, à la pause, à l'arrivée et dans l'éditeur). `test-browser.mjs` impose maintenant la locale `fr-FR` (Playwright démarre en `en-US`).

## Bêta 0.9.20 — le ressenti de course : de la ponctuation autour de la conduite

`PHYS_VER` inchangé (26) ; rien à redéployer. **Rien ici ne touche à la physique** : la voiture roule exactement pareil avec ou sans (empreinte de physique, records et replays identiques) ; ce sont des retours visuels, sonores et tactiles.

- **Lignes de vitesse graduées** : elles naissent dès 126 km/h et montent jusqu'au plein effet vers 360 km/h (avant : rien avant 223 km/h, puis tout d'un coup).
- **Coup de champ de vision** (+5°, retombe en 0,4 s) au départ d'un turbo ou d'un mini-turbo.
- **Tassement de la caméra à la réception** : plus le choc est fort, plus elle descend (jusqu'à 65 cm), puis remonte doucement.
- **Aspiration** : rouler derrière une autre voiture (fantôme du record, fantôme d'or ou importé, rival du classement, joueur distant), dans son axe et à moins de 30 m, renforce les lignes de vitesse et fait siffler le vent.
- **Vibrations de manette graduées** (avant : seulement des coups ponctuels) : un grondement léger qui monte avec la vitesse, plus fort hors piste et en dérapage, des pulsations en turbo.
- **Bruit de croisement** quand on double ou croise une autre voiture à moins de 6 m en travers.
- **Réglage « Sensations de course »** (Profil › Options, 0 à 150 %, 100 % par défaut) : à 0, aucun de ces effets (et les lignes de vitesse reviennent à l'ancien comportement).
- `js/feel.js` : fonctions pures (sans rendu), testées. **Limite assumée** : ces dosages (intensités, durées, seuils) sont raisonnables d'après les ordres de grandeur du jeu mais **n'ont pas été jugés à la manette** : c'est le seul point du diagnostic qui demande un joueur
  aux commandes ; le réglage « Sensations » et les constantes en tête de `feel.js` sont faits pour être ajustés.
- Tests : `tools/test-ressenti.mjs` ; test navigateur (coup de FOV, aspiration, vibrations, réglage à 0).

## Bêta 0.9.19 — l'éditeur : des prefabs et une ambiance par circuit

`PHYS_VER` inchangé (26) ; rien à redéployer côté serveur.

- **Prefabs** (onglet « Prefabs » de la palette) : six morceaux fournis — *Chicane*, *Épingle*, *Slalom*, *Saut*, *Looping*, *Wall-ride* — qu'on colle comme le presse-papiers (clic sur la grille, `R` pour pivoter, aux quatre orientations et à tout niveau).
  « Enregistrer la sélection » (outil Sélection) crée **ses propres prefabs** (jusqu'à 40, dans ce navigateur) ; ⧉ copie le **code `SHP1:`** à envoyer à un ami, « Importer un code » ajoute celui d'un ami. Un code venu de l'extérieur est validé
  (préfixe, taille, 400 pièces et 300 décorations au plus, circuit non vide) avec un message lisible. Absents du mode guidé de l'éditeur.
- **Ambiance par circuit** (Paramètres du niveau) : **moment de la journée** (aube, plein jour, coucher de soleil, nuit), **brume** (dégagé, brumeux, épais) et **musique** (chill de course, groove du menu, aucune), par-dessus le décor : ciel, soleil, lumière,
  étoiles, brouillard. L'ambiance voyage dans le code de partage (champ `am`, absent par défaut : **le code d'un circuit sans ambiance ne change pas d'un octet**) et dans les circuits publiés, mais elle est **hors signature** : la changer ne fait perdre ni la
  vérification ni les records. Valeurs inconnues ou hostiles ignorées. Elle ne s'applique pas en multijoueur ni en leçon pour la musique (toujours le chill).
- Nouveaux modules : `js/ambiance.js` (réglages purs, sans rendu), `js/prefabs.js` (format, code, morceaux fournis), `js/editor/prefabs.js` (interface). La zone « Zones » (vitesse imposée, caméra spéciale) du diagnostic **n'est pas faite** : elle changerait la physique
  des circuits (donc `PHYS_VER` et la vérification serveur) ; à décider à part.
- Tests : `tools/test-ambiance.mjs` (code, signature, rendu de chaque décor × moment de la journée), `tools/test-prefabs.mjs` (morceaux collés aux quatre orientations, codes hostiles, bibliothèque), test navigateur (ambiance appliquée à la scène, prefab collé, enregistré, exporté, supprimé, importé, caché en mode guidé).

## Bêta 0.9.18 — trouver de bons circuits, et des récompenses qui se méritent

`PHYS_VER` inchangé (26) ; **facultatif côté serveur** : `supabase/etape8-decouverte.sql` (sans lui, rien ne casse : l'onglet « Cette semaine » retombe sur « Plus joués », les titres restent locaux).

- **Découverte dans la communauté** : un onglet **🔥 Cette semaine** (les circuits où le plus de pilotes *différents* ont couru ces 7 derniers jours, d'après `track_plays`) et, en tête de l'écran, le **⭐ Circuit de la semaine**
  (le premier de cette liste, à partir de deux pilotes). Chaque carte affiche une **difficulté estimée** (◆◆◆◇◇ + libellé) et la fenêtre de publication la montre avant de publier.
- **Indice de difficulté** (`js/difficulty.js`) : estimé d'après la **géométrie** seulement (virages serrés, murs, loopings, rubans, plaques, obstacles pondérés, pièces mobiles, pièges, longueur, tours), sans simulation : instantané, valable
  pour tout circuit d'éditeur (qui n'a pas de ligne centrale pour le pilote automatique). Les seuils des étoiles sont les centiles des 72 circuits intégrés. **Limite assumée** : c'est une indication, pas une mesure ; elle ne voit
  pas, par exemple, un enchaînement de sauts très délicat.
- **Titres** : neuf titres décoratifs (Diplômé, Mécano, Globe-trotter, Cristallin, Légende, Fidèle, Collectionneur, Vétéran, Maître du dérapage), calculés d'après la progression ; on en choisit un dans Profil, il s'affiche à côté du pseudo dans
  les classements en ligne. Le serveur ne vérifie que la liste (il ne connaît pas la progression) : un titre est cosmétique.
- **Exclusifs du garage** (jamais en vente) : *Traînée dorée* (7 défis du jour différents), *LED Émeraude* (une médaille sur chacun des 6 circuits de l'Atelier), *LED Crépuscule* (diplôme de l'Académie) ; le garage dit comment les obtenir.
- **Collections** à thème (Néon, Feu, Royal, Course) : quatre éléments qui vont ensemble ; les posséder tous rapporte **100 ◆ une fois** ; un nouvel onglet « Collections » du garage montre l'avancement.
- Le profil retient les jours de défi du jour et les mini-turbos cumulés ; la fusion des sauvegardes cloud réunit leçons, collections, jours de défi et titres vus. Les récompenses sont données (et annoncées) à la fin d'une course, d'une leçon, et au démarrage
  pour un joueur qui les mérite déjà.
- Tests : `tools/test-difficulte.mjs`, `tools/test-recompenses.mjs` (dont la liste blanche SQL comparée à celle du jeu), SQL (étape 8 : tendances, fenêtre, pagination, titres), navigateur (communauté simulée, profil, garage).

## Bêta 0.9.17 — partager un record : un lien qui lance le défi, et le replay en vidéo

`PHYS_VER` inchangé (26) ; rien à redéployer côté serveur.

- **Lien de défi** : « Partager mon fantôme » propose maintenant **Copier le lien** en plus du code. Le lien (`…#g=SHG1…`) ouvre le jeu sur « Défi partagé » : *X t'envoie son fantôme, saurais-tu le battre ?* ;
  « Courir contre lui » importe le fantôme (violet) et lance le circuit (circuits intégrés et défi du jour ; pour un circuit de joueur, le fantôme est gardé jusqu'à ce que tu joues ce circuit). Le code reste dans la
  partie « # » de l'adresse : il ne part jamais vers un serveur. Un lien trop long pour certaines messageries (plus de 7 000 caractères) est signalé, avec le code à copier à la place ; un lien cassé, coupé
  ou d'une autre version du jeu donne un message lisible.
- **Export vidéo du replay** : la barre de replay a un bouton **🎬 Vidéo** : le replay repart du début, la scène 3D est enregistrée (`MediaRecorder`, WebM VP9/VP8, 8 Mb/s, 60 i/s, sans son ni interface) et le fichier
  `copytrack-<circuit>-<temps>.webm` est proposé au téléchargement, après une seconde et demie sur la ligne d'arrivée ; un second appui, Échap ou la fermeture du replay annule. Le navigateur qui ne sait pas enregistrer
  (anciens Safari, notamment) l'annonce au lieu de planter. **Pas de GIF** : un GIF de plusieurs secondes pèse bien plus lourd qu'un WebM et demande un encodeur à embarquer ; le WebM s'importe partout où un GIF animé servirait.
- Nouveaux modules : `js/videoExport.js` (enregistreur de canvas, sans dépendance au jeu) ; `ghostLink` / `ghostFromHash` dans `js/replay.js`.
- Tests : `tools/test-partage.mjs` (aller-retour du lien, liens cassés ou coupés, formats vidéo, enregistreur, nom de fichier) ; test navigateur : lien ouvert dans un autre onglet, course contre le fantôme partagé,
  **export vidéo réel** (fichier WebM reçu en téléchargement).

## Bêta 0.9.16 — l'Académie : six leçons guidées et un éditeur qui démarre simple

`PHYS_VER` inchangé (26) ; rien à redéployer côté serveur.

- **Académie** (menu principal) : six leçons de deux minutes, chacune sur un seul geste — *Prise en main*, *Dérapage et mini-turbo*, *Mini-turbos en série*, *Saut et réception parfaite*, *Plaque de transformation*, *Obstacles* —
  chacune avec un court circuit, une introduction (avec les touches réelles du joueur, ou les boutons à l'écran sur tactile), une consigne qui s'affiche au départ, un **objectif** (les mêmes règles que les objectifs bonus
  de la carrière) et un bilan qui dit quoi corriger. Pas de chrono, de médaille ni de statistique. **+20 ◆** la première fois qu'une leçon est réussie, **+60 ◆** au diplôme. Jusqu'ici le dérapage et le mini-turbo, le cœur
  de la conduite, ne se découvraient que par hasard.
- Le **tutoriel** de premier lancement propose de commencer l'Académie, et mentionne l'Atelier.
- **Éditeur guidé** : pour un **nouveau** joueur (à la fin du premier tutoriel), l'éditeur n'affiche que l'essentiel — les familles Droite (avec les pentes) et Virage, le départ, l'arrivée et le checkpoint ; les autres pièces,
  options, revêtements et décors se débloquent d'un clic sur « Tout afficher » (ou dans Profil › Options : « Éditeur guidé »). Rien n'est retiré à qui connaît déjà l'éditeur : le mode ne s'active pas pour les joueurs existants.
- Vérifié : le pilote automatique réussit les objectifs des leçons 1, 4, 5 et 6 (muret, réception parfaite, moto, piques sans réapparition, à 90 et 110 % de sa vitesse) ; pour le mini-turbo, le **geste décrit dans la leçon**
  (volant à fond, frein 0,8 s) déclenche bien un mini-turbo dans le grand virage sans toucher de muret. **Limite assumée** : l'objectif de la leçon 3 (deux mini-turbos d'affilée) n'a pas de joueur automatique qui le prouve ;
  il se joue à la main.
- Tests : `tools/test-academy.mjs` ; test navigateur (menu, leçon jouée et réussie, bilan, récompense unique ; éditeur guidé, pièces refusées, « Tout afficher »).

## Bêta 0.9.15 — l'Atelier des mécanismes : un chapitre bonus qui montre chaque obstacle et chaque pièce mobile

**`PHYS_VER` inchangé (26)** : records, replays et fantômes sont conservés, et le défi du jour est identique à celui d'avant (vérifié). Six circuits s'ajoutent : **la fonction `submit-score` doit être
redéployée** (`npm run build:function`, puis `index.ts`) pour qu'elle connaisse leurs clés ; tant qu'elle ne l'est pas, leurs classements en ligne refusent les temps (« Circuit intégré inconnu »).

- **Chapitre 12, l'Atelier** (nouveau décor « Atelier des mécanismes ») : six circuits courts du profil *Mécanisme* qui enseignent les sept obstacles du jeu et l'ascenseur / la glissière **un par un** :
  *Garde-Fous* (bumpers et piques fixes) → *En Cadence* (piques escamotables sur la route) → *Le Pendule* (balancier + mur coulissant) → *Rotors* (marteau + balayeur) → *Monte-Charge* (ascenseur + glissière)
  → *Le Grand Atelier* (tout ensemble). Jusqu'ici 6 circuits sur 66 portaient un obstacle et aucun une pièce mobile : la moitié de ce que l'éditeur sait faire ne se voyait jamais en carrière.
- Chaque circuit a été **placé par recherche** avec le pilote automatique (positions et phases des obstacles) : il passe sans choc ni réapparition à 90, 100 et 110 % de sa vitesse, et peut repartir de chaque
  checkpoint à l'arrêt ; la fenêtre de passage est large (les phases voisines passent aussi). Nouveau contrat de profil `atelier` dans `tools/contract.mjs` (temps, mécanismes déclarés présents).
- **Chapitre bonus** : il vient en dernier de la liste mais s'ouvre avec 4 médailles dans le **premier** chapitre ; il ne fait pas partie de l'enchaînement « circuit suivant » (rien ne bouge pour qui a déjà progressé).
- Le **défi du jour** ne tire que dans les onze décors d'origine (`DAILY_DECORS`) : en ajouter un douzième aurait changé le circuit de chaque jour.
- `scriptTrack` : paramètres des pièces mobiles dans les circuits scriptés (`movers`) et drapeau `%` (rotation). La **rotation n'est pas utilisée** : elle réserve une couronne de cases autour d'elle, donc ne se pose pas
  au milieu d'une route (voir `Track.cellsOf`) ; elle reste un outil d'éditeur.
- `tools/phys-fingerprint.mjs` distingue désormais un circuit *ajouté* (nouveaux scénarios : on enregistre, sans toucher à `PHYS_VER`) d'une physique *modifiée*.
- Tests : `tools/test-atelier.mjs` ; `test-niveaux` / `test-registres` passent à 72 circuits et 12 décors ; le test navigateur compte 72 cartes.

## Bêta 0.9.14 — affronter le top 10 : fantômes des classements en ligne

**`PHYS_VER` inchangé (26)** : records, replays et fantômes sont conservés. **La fonction `submit-score` doit être redéployée** (`npm run build:function`, puis `index.ts`) et `supabase/etape7-fantomes.sql`
lancé dans Supabase (dans n'importe quel ordre : sans les colonnes, le temps est enregistré sans fantôme).

- **Fantôme du record côté serveur** : la fonction qui rejoue déjà chaque course (pour en vérifier le temps) en tire aussi le fantôme : une pose (position + orientation) tous les 4 pas et les
  changements de véhicule, au format exact du fantôme enregistré en local. Le fantôme ne contient **jamais les commandes** : il ne permet pas de renvoyer la course d'un autre sous son nom
  (c'est pourquoi l'étape 5 avait rendu les replays illisibles). Un record d'avant l'étape 7 en reçoit un quand son auteur renvoie le même temps, ou via `tools/backfill-ghosts.mjs`.
- **Classement** : un bouton 👻 sur chacun des dix premiers (là où le fantôme existe) ; il lance (ou relance) le circuit avec ce rival affiché, étiqueté de son nom et de son temps (jusqu'à trois à la fois
  côté code), et le jeu indique à l'arrivée de combien tu le bats (ou de combien il reste devant).
- Lecture : la fonction SQL `get_ghost` (n° 1 à 10 d'un circuit et d'une version de physique) ; la colonne n'est pas lisible directement. Tout fantôme reçu est validé (format, bornes) avant d'être dessiné.
- `js/ghostFormat.js` (nouveau, sans rendu) regroupe le format des fantômes (constantes, orientation d'après la pose, codec) : il sert au jeu et à la fonction serveur. `GhostRunner` sait enregistrer le fantôme
  pendant le rejeu (même règle que la course en direct : un retour au checkpoint efface les poses qui le suivent).
- Tests : `tools/test-fantomes.mjs` (orientation identique à celle du jeu, enregistrement, retour au checkpoint, client, outil de rattrapage), test du gestionnaire serveur (fantôme rangé, colonnes absentes, rattrapage),
  SQL (colonne illisible, `get_ghost`), test navigateur (rival affiché et étiqueté).

## Bêta 0.9.13 — multijoueur « championnat », salons publics, relais TURN, télémétrie et médailles calibrées sur de vrais joueurs

`PHYS_VER` reste à 26 (physique inchangée) : **records, replays et fantômes sont conservés**, et la fonction `submit-score` n'a pas à être redéployée. Le **protocole réseau**
change (`NET_VER` 2 : le paquet d'état passe de 38 à 40 octets) : un joueur resté sur l'ancienne version ne peut plus courir avec ceux de la nouvelle (la nouvelle version le signale « autre version » et refuse de rejoindre l'hôte d'une ancienne : « Version du jeu
différente »). Côté serveur, deux ajouts facultatifs : `supabase/etape6-telemetrie.sql` (statistiques anonymes) et la fonction `ice` (relais TURN) ; sans eux, tout marche comme avant.

### Multijoueur : le mode « Championnat » (manches)
- **Plusieurs circuits à la suite**, tirés au sort sans doublon du plus facile au plus dur (tous les circuits, faciles, moyens, difficiles, ou un thème au hasard), de 2 à 6 manches.
  Départ **commun** (décompte synchronisé) sur une **grille** de huit places, quatre de front ; la grille de la manche suivante suit le classement général.
- **Points par place** (10, 8, 6, 5, 4, 3, 2, 1 ; rien sans arrivée) et **classement général** (égalité : victoires, puis somme des places). Une manche se clôt quand tous ont fini ou quitté,
  30 s après la première arrivée, ou après 10 min ; les résultats, le classement et le compte à rebours de la manche suivante s'affichent sans repasser par le salon ; podium à la fin.
- **Classement en direct** pendant la course (place, avancement sur le circuit — mesuré sur la ligne centrale, envoyé dans le paquet d'état — ou temps d'arrivée).
- **Collisions douces** en option : les voitures se repoussent (poussée plafonnée, rien en loopings, rien 2 s après un retour au checkpoint, rien contre une voiture arrivée).
- L'hôte ne fait que donner les départs et clore les manches ; **s'il part, l'identifiant le plus petit prend la suite** (l'état du championnat est copié chez tous). Un arrivant en cours de route
  reçoit le championnat, suit la manche et part à la suivante. Un résultat manqué est rattrapé au départ suivant.
- **Salons publics** : « Salon public » dans le salon publie une fiche (hôte, circuit, joueurs, mode) dans un annuaire commun (`js/net/directory.js`) ; « Salons publics » dans le menu multijoueur la liste, sans code à échanger.
- **Relais TURN** : `js/net/ice.js` demande à la fonction serveur `supabase/functions/ice` des serveurs STUN + TURN à identifiants **à durée limitée** (Cloudflare Realtime TURN ou coturn auto-hébergé),
  avec repli sur le STUN de `js/config.js`. Sans relais, 10 à 20 % des paires de joueurs (réseaux d'entreprise, 4G) ne se voyaient pas.
- Limites assumées : chacun reste seul juge de son temps (pas de serveur de jeu : un tricheur peut annoncer un faux temps ; aucun record, aucune pièce, aucun classement en ligne n'en dépend) ;
  les collisions sont calculées chez chacun d'après la position affichée de l'autre (décalage de ~100 ms).

### Télémétrie anonyme et médailles sur de vrais joueurs
- **Statistiques de jeu anonymes**, seulement avec l'accord du joueur (réglage + question posée une fois) : identifiant d'installation aléatoire, circuit intégré, issue (arrivée ou abandon), temps, progression
  à l'abandon, retours au checkpoint, numéro d'essai, médaille, version de la physique. Rien d'autre (ni pseudo, ni compte, ni position, ni commandes). File locale bornée, envoi par lots, reprise après échec.
  Côté serveur : `supabase/etape6-telemetrie.sql` (table `run_stats` fermée en lecture, fonction `log_runs` à cadence limitée). `node tools/telemetry-report.mjs` lit les données et signale
  les circuits trop durs / trop faciles ; `tools/medals.mjs --humain` propose de nouveaux temps de médailles d'après les percentiles réels (3 / 12 / 40 / 75 %).

### Corrections en jeu
- **Fantôme du record** : il restait une voiture quand le joueur se transformait en moto, bateau ou deltaplane (l'enregistrement ne gardait que position et orientation). Les changements de véhicule sont maintenant enregistrés avec le record (`ghostVeh`) ; les anciens records restent des voitures.
- **Décor « Ville »** : les enseignes néon étaient semées au hasard entre 30 et 150 m de haut, sans immeuble : elles flottaient. Elles sont collées à la façade d'un immeuble.
- **Décor « Jungle »** : les canopées lumineuses étaient semées à part des troncs et flottaient ; elles se posent au sommet d'un tronc.
- **Fantômes** : ils se transforment avec la même animation que le joueur (instantanément après un retour au checkpoint ou un redémarrage). **Particules** : un retour au checkpoint efface celles de l'endroit quitté.
- **Pause** : le monde est vraiment figé (plus de particules de boost, de poussière ni de traces qui naissent autour de la voiture arrêtée, plus de scintillement des flammes) ; la voiture ne recule plus d'un pas à l'instant de la pause. Même chose en replay mis en pause.
- **Après l'arrivée** : l'horloge des obstacles et des pièces mobiles continue pour la physique (elle restait figée alors que leur dessin bougeait : on pouvait heurter un obstacle là où il n'était plus).
- **Autres joueurs (multijoueur)** : ils se transforment avec l'animation et leurs roues tournent. **Dalles de verre** : le rendu suit un numéro de version, plus le nombre de dalles brisées. **Traces de pneus** : collées à la chaussée retournée en gravité inversée.
- `tools/test-decors.mjs` : aucun élément de ces décors ne flotte (testé sur plusieurs graines).


## Bêta 0.9.12 — audit d'architecture : une seule physique partout, un code découpé, des garde-fous

Aucune nouvelle fonction de jeu : un audit complet du dépôt (code mort, chantiers inachevés, dette technique, performances) a été traité de bout en bout.
Seule la physique change (`PHYS_VER` 26) : les records, replays et fantômes d'avant sont écartés, comme à chaque changement de physique ; les **temps de
référence des 66 circuits et leurs médailles sont inchangés**. **La fonction `submit-score` doit être redéployée** (`npm run build:function`, puis `index.ts`).

### Physique et vérification des temps
- **Mathématiques déterministes** (`js/dmath.js`) : `sin`, `cos`, `atan2`, `exp`, `pow`, `hypot`… n'étaient pas garanties identiques d'un moteur JavaScript à l'autre,
  et la fonction serveur (Deno) rejoue les courses pour les vérifier : 152 des 161 scénarios de `tools/phys-fingerprint.mjs` différaient entre Node 22 et Deno 2.9, donc
  une course honnête pouvait être refusée, un fantôme dériver d'une machine à l'autre et le défi du jour changer selon le navigateur. Tout le noyau de simulation
  n'utilise plus que + − × ÷ et `sqrt` (arrondis imposés par IEEE 754). Les 161 scénarios sont maintenant **identiques sous Node, Deno et Chromium** ;
  `tools/test-determinisme.mjs` et une règle ESLint interdisent d'y revenir.
- **Bifurcation** : la physique gardait le seuil de l'ancienne route de 18 m (2 × 9) au lieu de `2 × ROAD_HALF` : entre 18 et 24 m d'écart, un muret invisible séparait des voies
  que le rendu dessinait encore soudées (`tools/test-scale.mjs`).
- **L'arrivée l'emporte** sur une réapparition automatique du même pas (course en direct, fantôme et serveur concluent pareil).
- **Un seul pas de simulation** (`js/simulation.js`) pour la course, les fantômes, la vérification serveur, le défi du jour et les outils : l'ordre horloge → physique →
  règles → réapparitions n'existe plus en cinq exemplaires.
- `Track.time`, un canal caché écrit par chaque voiture, est supprimé : le chrono est un paramètre (`CarPhysics.time`). Index d'obstacles porté par le circuit, tampons sans
  allocation, pièces mobiles retrouvées par l'index de cases, `ribbonOf` sans clé en chaîne.
- `physics.js` (1 500 lignes) devient `physics.js` + `physics/{specs,walls,obstacles,ribbon}.js` ; `step()` (260 lignes) est découpé en phases.

### Code
- Code mort supprimé : exports orphelins, ré-exports, variables masquées par `void`, attributs inutilisés. Aucun commentaire ni test ne le mentionne plus.
- Une seule description pour chaque chose : règles de course (`RULES`), champs d'une pièce (`TILE_FIELDS`), options incompatibles (`OPTION_CONFLICTS`), décorations
  (`decoData.js`), décors (`themes.js`), médailles, limites (`constants.js`), versions (`version.js`).
- Les gros fichiers sont découpés en familles de méthodes (même code, mêmes noms) : `editor.js` 2 200 → 280 lignes (+ `editor/`), `main.js` 1 870 → 360 (+ `app/`), `race.js`,
  `scenery.js`, `inspector.js`, `track.js`, `trackMesh.js` (+ `trackGeometry.js`).
- ESLint sans dépendance (`eslint.config.mjs`, `npm run lint`), 69 remarques corrigées.
- `js/config.js` : le serveur en ligne (Supabase) et le relais réseau (TURN) se règlent à un seul endroit, ou sans toucher au code par `window.COPYTRACK_CONFIG`.

### Rendu et chargement
- **Maillage du circuit par tronçons** (4 × 4 cases) reconstruits à la demande : un grand circuit d'éditeur (270 pièces, 300 décorations) coûtait ~130 ms par modification, il
  en coûte ~2 ms quand rien ne change et un tronçon quand une pièce change ; boîte englobante par tronçon (la caméra ne dessine que ce qu'elle voit).
- **Fantômes** : l'historique de leurs poses est conservé ; un retour au checkpoint ou un redémarrage relit une ligne au lieu de rejouer le fantôme depuis le départ.
- L'éditeur est chargé à la première ouverture (import dynamique) ; `index.html` précharge les modules du démarrage (`modulepreload`, généré par `tools/gen-sw.mjs`) ;
  la police ne bloque plus le premier affichage ; menus à 30 images/s.
- Service worker : seules les réponses complètes entrent dans le cache ; `js/verify.js` (serveur seulement) n'y est plus.
- Réglages de rendu réunis dans `js/renderOptions.js` ; caches de couleurs et de miniatures bornés ; couleur des lampes analysée une fois.

### Serveur
- `submit-score` : la logique est dans `handler.js` (testée sous Node avec un Supabase simulé et la vraie vérification de course : `tools/test-submit-handler.mjs`).
  Nouveau : requête trop volumineuse refusée avant lecture (413), cadence par pilote (429), erreurs internes jamais renvoyées telles quelles, origine autorisée réglable (`ALLOWED_ORIGIN`).
- Les scripts SQL, étape 5 comprise, sont testés sur PostgreSQL 16 (`npm run test:sql`) et relançables.

### Outils, tests et CI
- `tools/phys-fingerprint.mjs` : l'état exact de la voiture (bits des flottants) sur 161 scénarios ; il échoue si la physique change sans que `PHYS_VER` bouge.
- `tools/test-browser.mjs` : le jeu dans Chromium (écrans, course, éditeur, garage, profil…), et la même empreinte de physique.
- Tests en parallèle (`tools/run-tests.mjs`, 36 s → ~17 s), harnais commun, tests de la simulation, du maillage par tronçons, de l'échelle, du déterminisme, des mathématiques.
- CI en quatre jobs : lint + tests + fichiers générés, Deno (même physique que Node), navigateur (Playwright), SQL (PostgreSQL 16).
- README allégé (cet historique en est sorti) ; `docs/ARCHITECTURE.md` et `docs/MODULES.md` (index généré) ; `tools/check-docs.mjs` vérifie liens, versions et index.

## Bêta 0.9.11 — la voiture décolle vraiment, des pistes plus grandes, une voiture qui pardonne

Trois demandes : « on est collé à la route comme avec un aimant », « les boosters sont trop forts avec les nouvelles vitesses », « des pistes plus grandes et une meilleure maniabilité : je ne veux pas me cogner toutes les 2 secondes ».
*Les chiffres des sections 0.9.6 à 0.9.10 plus bas (portées en cases, vitesses de saut…) sont ceux de l'ancien monde de 24 m ; les tableaux de circuits ci-dessus sont remesurés.*

- **Physique des sauts** : la voiture restait collée à la route à n'importe quelle vitesse tant que le raccord faisait moins de 12° (`stickAngle`) : une bosse, un sommet de côte ou une pente qui change prise à 250 km/h ne décollait jamais.
  L'exemption est supprimée : seule compte la vitesse avec laquelle la route « tombe » sous la voiture (`launch`, 2 → 0,6 m/s). Un raccord doux pris lentement reste collé, le même pris très vite décolle (vérifié sur sommets, bosses, descentes, entre 45 et 80 m/s).
  Un vol de moins de 0,35 s ne coûte rien à la réception. Conséquence mesurée : un circuit de sauts demande une vitesse minimale (Tremplins : 56 m/s à l'abord des rampes au lieu de 48).
- **Boosters** : poussée 30 → 10 m/s², durée 1,6 → 1,2 s. Ils donnent un coup de fouet au lieu de doubler la vitesse ; la pointe sans booster reste vers 240 km/h. Les circuits ont été réglés en conséquence (Viaduc Vertical : deux bandes de boost sur la montée,
  Méduses : gravité 130 % au lieu de 200 %, que les pentes rendaient infranchissable, Grand Tour : un booster avant le looping de 24 m de rayon).
- **Pistes plus grandes** : case 24 → **32 m**, route 18 → **24 m** de large, niveau 4,8 → 6,4 m, loopings proportionnels (rayon ×4/3). Les 66 circuits ont été réajustés (écarts de saut, hauteurs, obstacles latéraux ×4/3, vitesses du pilote), les médailles et les objectifs « moins de t s » recalculés sur le pilote.
- **Voiture plus maniable** : adhérence latérale 56 → 80 m/s² (≈ 2,5 g), braquage un peu plus ample et plus rapide, et surtout un train avant moins accrocheur que l'arrière (`frontShare` 0,48 → 0,42) : en limite d'adhérence la voiture sous-vire au lieu de partir en tête-à-queue.
  Moto et bateau suivent. Le pilote automatique ne demande plus que 62 % de l'adhérence (il en demandait 80 %).
- **Les tests mesurent la maniabilité** (`node tools/maniabilite.mjs [--circuits]`, `tools/test-maniabilite.mjs`) : rayon de braquage, g latéral, temps de réponse au volant, retour droit après un coup de volant lâché, distance pour changer de voie, puis un **pilote humain imparfait**
  (réaction 0,10 s, braquage plus mou, volant qui tremble, mauvais jugement des freinages) sur les 66 circuits : contacts avec les bordures par minute et taux d'arrivée sans réapparition.

| Mesure (même pilote imparfait, 3 graines par circuit) | 0.9.10 | 0.9.11 |
| --- | --- | --- |
| contacts avec une bordure par minute (moyenne des 66 circuits) | 1,1 | **0,1** |
| circuits avec au moins un contact | 26 sur 66 | **5 sur 66** |
| parcours finis sans réapparition | 178 sur 198 | **189 sur 198** |
| rayon de braquage à 144 km/h | 31,8 m (1,3 case de 24 m) | **25,7 m (0,8 case de 32 m)** |
| g latéral en virage à fond (144 km/h) | 2,0 | **2,5** |
| changer de voie (une demi-route) à 216 km/h | 76 m = 3,2 cases | **84 m = 2,6 cases** |

  Ce que le banc a aussi trouvé : sur une dalle « volant inversé » le pilote automatique ne tenait pas compte de l'inversion (toute correction aggravait l'écart) ; Galerie de Cristal passait de 5,8 contacts par minute à 0.
  Limites connues : les parcours non finis par le pilote imparfait (Cité Céleste au deltaplane, Apesanteur, Cristal Fêlé) viennent de la loi de commande du pilote automatique, qui oscille dès que le retard dépasse ~0,1 s, pas de la voiture ;
  **aucun humain n'a rejoué les circuits** depuis cette version (voir `docs/FICHE-ESSAI.md`, à refaire).
- Autres : `PHYS_VER` 25 (les rejeu et fantômes de la 0.9.10 sont écartés), `tools/golden-temps.json` et la fiche d'essai régénérés, `tools/patch-circuit.mjs` modifie un champ d'un circuit sans toucher à son commentaire, `npm test` compte un fichier de plus (`test-maniabilite.mjs`).
  **À faire en ligne** : redéployer la fonction `submit-score` (nouveau `index.ts`) ; les records des circuits repartent de zéro (le tracé a changé).

## Bêta 0.9.10 — finitions (rien de nouveau, tout ce qui manquait pour dire « c'est fini »)

- **Fiche d'essai** : `node tools/fiche-essai.mjs` écrit `docs/FICHE-ESSAI.md` (une case par circuit : départ clair, passage juste, médaille atteignable, bonus réalisable, checkpoint sûr, « fini ») et un gabarit `docs/temps-humains.json`.
  Jusqu'ici seul le pilote automatique avait parcouru les circuits : c'est la liste de ce qu'il reste à jouer à la main.
- **Médailles calées sur de vrais joueurs** : `node tools/medals.mjs --humain docs/temps-humains.json [--ecrire]` propose Cristal = meilleur temps relevé, Or ×1,05, Argent ×1,2, Bronze ×1,4 ; avec `--ecrire` le circuit passe en
  `medalsBy: 'humain'` (le contrat ne le recale plus sur le pilote) et son objectif « moins de t s » reste entre l'or et l'argent.
- **Courbe de difficulté** : `node tools/difficulte.mjs` calcule un indice par circuit (virages, murs, loopings, sauts, freinages, vitesse, obstacles). Il a montré que trois sprints (Boulevard Sans Fin, Premier Envol, Galerie de Cristal) étaient notés
  3 étoiles pour un indice de 3 : ils passent à 2 (Boulevard Sans Fin remonte d'un rang dans le chapitre 4). Règles testées : le premier circuit d'un chapitre a au plus 3 étoiles, le dernier au moins 4, un sprint au plus 2.
- **Départs** : le départ de Tours Jumelles (rampe, comme Éruption) devient « trois boosters → petit looping → rampe de toit », celui de Vrilles Souterraines (looping, comme cinq autres) « plongeon → vrille ». Il reste cinq départs avec un looping (Spirale, Hyperboucle, Tourbillon, Montgolfières, Tours), tous différents (simple, deux en S, triple, basse gravité, petit looping avant une rampe) ; trois départs en rampe (Lianes, Éruption, Viaduc).
- **Carrière** : un bilan en haut de l'écran (pourcentage, médailles, cristaux, objectifs bonus, message à la fin), un badge « Chapitre terminé / parfait / cristal » sur chaque chapitre, et une **infobulle** sur chaque carte (« Départ : … Au programme : … », champ `appris`).
- **Garde-fous** : `tools/golden-temps.json` mémorise le temps du pilote sur chacun des 66 circuits (un test échoue en nommant ceux qui bougent) ; chaque circuit décodé garde ses tours, son véhicule et sa gravité de départ ;
  les commandes du pilote rejouées sur le circuit décodé redonnent la même arrivée au même pas (plafond, deltaplane, tapis, rebonds, verre…).
- README : anciennes listes de départs « prévus » supprimées, aide-mémoire de mise en ligne ci-dessus. Version 0.9.10.

## Bêta 0.9.9 — refonte du level design, fin : les 51 circuits restants

Les **66 circuits intégrés sont tous refaits** (les lots 4 à 14 sont livrés d'un coup). Chaque chapitre propose maintenant les **cinq profils** (Sprint, Speedway, Technique, Rollercoaster, Acrobatique),
jamais deux fois le même de suite, et chaque circuit a une **ouverture qui n'est celle d'aucun autre** (66 ouvertures différentes, vérifiées par les tests).

| # | Circuit | Profil | Ouverture | Ce qu'il enseigne |
| --- | --- | --- | --- | --- |
| 16 | Tourbillon Tropical | Rollercoaster | quatre boosters → **looping triple** (4×4) | slalom de wall-rides gauche / droite, grand double looping, plongeon de 8 niveaux : 15 niveaux de dénivelé |
| 17 | Sauts Lunaires | Acrobatique | la plaque de départ règle la **gravité à 50 %** : la voiture flotte de 6 niveaux | trois sauts de cinq cases en basse gravité, longues réceptions |
| 18 | Grand Archipel | Speedway | **aucun booster** : une pente douce de six cases lance dans un très grand virage relevé | cinq virages relevés, wall-ride de quatre cases, plongeon, 61 % du tour au-dessus de 240 km/h |
| 19 | Néons Express | Speedway | **tapis roulant** à +200 km/h (trois cases) : près de 290 km/h sans booster | quatre virages relevés, wall-ride sur la façade d'une tour, 88 % au-dessus de 240 km/h |
| 20 | Boulevard Sans Fin | Sprint | départ **sans bordures** (six cases) | vague douce, tunnel de quatre cases, un seul très grand virage plat |
| 21 | Hyperboucle | Rollercoaster | trois boosters → **deux loopings** qui s'enchaînent en S | trois loopings, deux wall-rides, plongeon de 8 niveaux |
| 22 | Métro Aérien | Technique | **montée en lacets** : deux courbes montantes serrées | 13 virages serrés : slalom sans bordures sur le viaduc, épingles, chicane sur un mur, slalom sous un tunnel |
| 23 | Tours Jumelles | Acrobatique | trois boosters → **petit looping** → rampe de toit | trois sauts de toit en toit, wall-ride sur une façade, réception de 10 niveaux |
| 24 | Viaduc Vertical | Rollercoaster | trois boosters → **lift hill** de 16 niveaux | plongeon de 12 niveaux, grand looping, slalom de wall-rides |
| 25 | Aurore Naissante | Sprint | **départ sur la glace** : verglas, trois boosters, verglas | vague douce, deux très grands virages plats, descente finale |
| 26 | Banquise Rebondissante | Acrobatique | verglas, deux boosters, **rebond** vers une terrasse plus basse | quatre rebonds de plus en plus puissants et longs : la Banquise **descend** de terrasse en terrasse (Spores monte) |
| 27 | Glacier Magnétique | Technique | **toboggan** de 10 niveaux dès le départ | huit virages serrés, glace avant les épingles, aimants sur la bosse centrale |
| 28 | Double Hélice | Rollercoaster | **tire-bouchon** pris à l'élan, sans booster | hélice montante (16 niveaux) puis descendante dans l'autre sens, double looping, wall-rides |
| 29 | Couronne Boréale | Speedway | **directement dans un très grand virage relevé**, sans booster | six virages relevés en couronne, wall-ride, 60 % du tour au-dessus de 240 km/h |
| 30 | Blizzard | Technique | départ dans la **poudreuse** | neuf virages serrés, vent avant les épingles, neige épaisse en sortie |
| 31 | Braises | Sprint | deux boosters → **colline douce** | vague en S, S relevé 2×2, un très grand virage plat |
| 32 | Coulée Ardente | Speedway | un booster → **S de virages relevés 2×2** | six virages relevés, wall-ride, plongeon, 4 % de freinage |
| 33 | Champs de Basalte | Technique | départ sur une **plaque de dérive** (l'arrière n'accroche presque plus) | huit virages serrés dont trois sur dérive, chicane sur un mur |
| 34 | Cheminée du Volcan | Rollercoaster | trois boosters → **tube** → montée verticale de quatre niveaux | plongeon de 8 niveaux, grand looping, slalom de wall-rides |
| 35 | Caldeira | Speedway | deux boosters → **montée douce** vers la crête ; circuit fermé, **2 tours** | quatre virages relevés en anneau, wall-ride, 64 % du temps au-dessus de 240 km/h |
| 36 | Éruption | Acrobatique | trois boosters → **rampe sans virage d'entrée** : saut de cinq cases, réception 10 niveaux plus bas | quatre éruptions, anneau turbo, wall-ride |
| 37 | Quai d'Amarrage | Sprint | un booster → **tube** | saut en **basse gravité** (40 %) avec anneau turbo, très grand virage plat |
| 38 | Navette | Technique | **départ en moto** (plaque), slalom R L R L immédiat | huit virages serrés, chicane, arrivée en moto (objectif bonus) |
| 39 | Ceinture d'Astéroïdes | Rollercoaster | **tire-bouchon** à l'élan → trois boosters → grand double looping | slalom de wall-rides, tube, plongeon |
| 40 | Grand Anneau | Speedway | deux boosters → **tube court** ; circuit fermé, **3 tours** | quatre virages relevés, wall-ride, 58 % au-dessus de 240 km/h |
| 41 | Apesanteur | Acrobatique | deux boosters → plaque de **gravité 20 %** | trois vols de 8 à 10 s en l'air (28 niveaux de dénivelé), wall-rides |
| 42 | Station Zénith | Technique | départ sur une **plateforme** d'amarrage | neuf virages serrés, chicane sur un mur |
| 43 | Courant Chaud | Sprint | deux boosters → **contre-courant** (−122 km/h) puis courant favorable (+138 km/h) | vague, très grand virage plat, tapis de trois cases |
| 44 | Jardin de Corail | Technique | un booster → **courant favorable** vers une première épingle | huit virages serrés, dalle de verre fragile, chicane |
| 45 | Épave Engloutie | Rollercoaster | trois boosters → **wall-ride** sur le flanc de la coque | double looping, second wall-ride, plongeon de 8 niveaux |
| 46 | Méduses Électriques | Acrobatique | cinq boosters → plaque de **gravité 130 %** (la pression des profondeurs) | quatre sauts brefs, réceptions violentes, wall-ride |
| 47 | Abysses | Rollercoaster | un booster → **plongeon de 12 niveaux** → grand looping au fond | slalom de wall-rides, remontée en hélice |
| 48 | Grande Barrière | Speedway | deux boosters → **pont de verre** → virage relevé | cinq virages relevés, wall-ride, courant favorable, 62 % au-dessus de 240 km/h |
| 49 | Chaîne de Montage | Sprint | trois boosters → **trois cases à moteur coupé** | tapis roulant, vague, deux très grands virages plats ; bumper et piques sur les bords |
| 50 | Laminoir | Technique | **bifurcation** : la voie de droite porte un booster | huit virages serrés, ralentisseur, chicane ; bumper et piques |
| 51 | Engrenages | Rollercoaster | deux boosters → **hélice montante** de 8 niveaux | looping triple, wall-rides, plongeon ; piques escamotables |
| 52 | Fonderie | Speedway | trois boosters → **tunnel** de quatre cases → virage relevé | cinq virages relevés, wall-ride, deux cases à moteur coupé, bumpers |
| 53 | Presse Hydraulique | Acrobatique | deux boosters → **tapis de quatre pistons** (rebonds en chaîne) | rampe raide, rebond vers une terrasse, wall-ride, rampe douce |
| 54 | Usine Folle | Technique | deux boosters → **deux dalles ralentisseur** juste avant le slalom | neuf virages serrés, moteur coupé, chicane ; marteau, piques, bumper |
| 55 | Premier Envol | Sprint | trois boosters → **vent latéral** | vague en S, deux très grands virages plats, descente |
| 56 | Îles Suspendues | Acrobatique | trois boosters → **rampe sans bordures** (les îles n'ont pas de barrière) | trois sauts avec anneaux turbo, wall-ride |
| 57 | Rafales | Technique | deux boosters → **vent fort** (180 %) juste avant la première épingle | neuf virages serrés, du vent à chaque relance |
| 58 | Montgolfières | Rollercoaster | trois boosters → plaque de **gravité 40 %** → grand looping | slalom de wall-rides, plongeon, pesanteur rétablie avant l'arrivée |
| 59 | Pont des Vents | Speedway | deux boosters → vent sur un pont **sans bordures** → virage relevé sans bordure | quatre virages relevés, wall-ride, 60 % au-dessus de 240 km/h |
| 60 | Cité Céleste | Acrobatique | **départ en deltaplane** : plaque sur la ligne, chute de 6 niveaux | avenue de 10 cases, rampe raide, wall-ride, rampe douce avec anneau |
| 61 | Galerie de Cristal | Sprint | deux boosters → **volant inversé** (trois cases en ligne droite) | vague en S, deux très grands virages plats, descente |
| 62 | Plafond Renversé | Technique | un booster → **vrille** : la route se retourne, gravité inversée | huit virages serrés dont quatre au plafond |
| 63 | Cristal Fêlé | Acrobatique | deux boosters → **inversion de gravité** : la voiture « tombe » au plafond, 8 niveaux plus haut | trois allers-retours sol / plafond, verre fragile au plafond |
| 64 | Miroir | Speedway | trois boosters → **S de deux très grands virages relevés** en miroir | six virages relevés, wall-ride, trois dalles de verre |
| 65 | Vrilles Souterraines | Rollercoaster | un booster → **plongeon** de 4 niveaux → vrille | parcours au plafond, double looping, slalom de wall-rides |
| 66 | Cœur de la Montagne | Technique | un booster → **deux dalles de verre fragile** (5 s de résistance) → slalom | huit virages serrés, chicane sur un mur : le dernier circuit |

- **Le contrat est une fonction.** `tools/contract.mjs` (`checkDef`) définit « un circuit bien fait » : construction, profil mesuré sur le pilote automatique, ouverture jamais classique, pas de départ lancé, au moins quatre pièces de la 0.9.3,
  pilote sans réapparition, choc, pique ni obstacle touché, wall-rides ≥ 130 km/h, vérificateur de l'éditeur sans alerte, finissable à ±10 % de vitesse (et à +25 % hors acrobatique), **repartir à l'arrêt de chaque checkpoint**,
  médailles à ±2 % du temps du pilote, objectif bonus réalisable, partage SHW sans perte. `node tools/contract.mjs fichier.mjs [--map] [--out defs.json]` juge des candidats, `--builtin [id…]` les circuits intégrés ;
  `node tools/inject.mjs defs.json` les écrit dans `js/tracks.js` à la place de ceux de même identifiant. `tools/test-niveaux.mjs` applique ce contrat aux 66 circuits (en 66 tests), puis vérifie ce qui se joue entre eux :
  cinq profils par chapitre, jamais le même de suite, **66 ouvertures différentes** (la liste est écrite dans le test), ordre de la carrière, difficultés, médailles croissantes, objectifs, obstacles, circuits à tours.
- **Obstacles.** Un obstacle mobile au milieu de la route est une loterie pour le pilote (un balayeur provoque des dizaines de chocs et peut même bloquer la voiture) : les circuits de l'usine n'ont que des obstacles sur les **bords**
  (bumpers, piques, piques escamotables), plus un marteau au milieu d'Usine Folle, placé là où le pilote passe sans le toucher aux trois vitesses testées. Les anciennes listes d'obstacles figées (`js/builtinObstacles.js`, calées sur les anciens
  parcours) sont supprimées : un circuit n'a que le champ `obst` de sa définition.
- **Ce que ce lot a appris sur la physique** (mesuré avec `tools/lab.mjs`) :
  - un **tapis roulant** ajoute sa vitesse à celle de la voiture (jusqu'à 447 km/h mesurés sur +200 km/h) ; à contresens, il empêche de partir (jamais un tapis inverse sur le premier carreau) ;
  - un **ralentisseur** posé juste après le départ ou un checkpoint empêche de repartir à l'arrêt (mesuré), et un **moteur coupé** ne relance rien : on place toujours un booster avant ; un **tire-bouchon** se prend à l'élan (≈ 180 km/h), pas à la sortie d'un booster ni à pleine vitesse ;
  - **basse gravité** : un saut de 2 niveaux porte à 14 cases à 40 % de gravité, à plus de 20 cases à 20 % : il faut alors une réception de huit cases en pente douce ; **gravité lourde** (200 %) : les vides se réduisent à 1 ou 2 cases ;
  - un **rebond** à 100 % porte à ≈ 4 cases à 200 km/h, à 200 % à ≈ 6 cases (proportionnel à la vitesse) ; un tapis de rebonds enchaîne les sauts ; le **ressort latéral** éjecte la voiture hors de la route (inutilisable avec le pilote) ;
  - le **deltaplane** reste actif jusqu'à la plaque suivante et se pose au hasard de l'élan : les circuits qui l'emploient le font suivre d'une longue piste ; un vol dure ≈ 15 s ;
  - une **chaîne d'anneaux turbo** dans un seul saut rend la portée imprévisible : un anneau par saut ;
  - au **plafond**, chaque pièce doit être retournée (`^`) : une droite à l'endroit au milieu des virages du plafond laisse un trou ; les virages relevés ne se prennent pas au plafond ;
  - deux **virages relevés de sens contraire** se prennent avec une case entre eux ; un checkpoint se place à plus de trois cases de la réception d'un grand saut (sinon un saut un peu long le survole) ;
  - une **bifurcation** ralentit à ≈ 130 km/h (la voie déportée est un S) : elle convient aux circuits techniques, pas aux sprints.
- **Chapitres** : les descriptions des chapitres 4 à 11 sont réécrites. Le chapitre 9 (usine) est le seul à garder des obstacles, parce que c'est son thème.
- **Bibliothèque d'ouvertures** (une par circuit, jamais deux fois la même) : booster → wall-ride · booster → virage relevé · chute libre · épingle descendante · montée verticale · looping (simple, double, triple) · rampe de lancement (avec ou sans anneau) ·
  départ en tube · rebond · bifurcation · plafond · tunnel · descente en moto · eau · deltaplane · basse gravité · gravité lourde · pente douce · tapis roulant · sans bordures · montée en lacets · glace · toboggan · tire-bouchon · poudreuse ·
  collines · dérive · plateforme · contre-courant · moteur coupé · pistons · vent · volant inversé · vrille · inversion de gravité · verre fragile · lift hill · hélice.
- Les records des 51 circuits refaits repartent de zéro (la clé de classement contient l'empreinte du circuit) ; **la fonction `submit-score` doit être redéployée** (`index.ts` régénéré). `PHYS_VER` reste 24.
- **Limites assumées** : aucun humain n'a joué ces 66 circuits ; le pilote automatique est la référence (médailles = son temps). Les médailles Cristal et Or pourront être resserrées après de vraies parties. Le deltaplane reste le plus irrégulier.

## Bêta 0.9.8 — refonte du level design (lot 3 / 14)

Fin de la Jungle néon (chapitre 2, qui propose maintenant les cinq profils) et début de l'Archipel tropical (chapitre 3).

| # | Circuit | Profil | Ouverture | Ce qu'il enseigne |
| --- | --- | --- | --- | --- |
| 11 | Racines Boueuses | Rollercoaster | **départ au plafond** (la course commence en gravité inversée) | deux **tonneaux** complets (plafond → mur gauche → sol → mur droit → plafond), plongeon, virage relevé, boue et vent, double looping |
| 12 | Temple | Technique | **départ dans un tunnel**, épingle immédiate | douze virages serrés (épingles dans un tube, hélice descendante, slalom sous un tunnel), un booster à chaque relance |
| 13 | Lagon Turquoise | Sprint | **départ en moto**, lancé par une descente de 7 niveaux (sans booster) | deux sauts en chapelet avec un anneau turbo chacun, très grand virage plat |
| 14 | Récif | Technique | **départ sur l'eau** (plaque bateau, slalom R L R L dans un chenal) | épingles en voiture entre deux chenaux, petit saut sur un mur, arrivée franchie **en bateau** (objectif bonus) |
| 15 | Phare | Acrobatique | trois boosters → **décollage en deltaplane** | vol de cinq cases, montée du phare (+8 niveaux), deux sauts de voiture avec anneau turbo |

- **Récif n'est pas un Speedway.** Je l'avais annoncé comme tel : la physique l'interdit. Le bateau plafonne vers 200 km/h (accélération 8 m/s², glisse), ne peut pas rouler sur un virage relevé
  (l'eau n'existe pas sur ces pièces), et ni un booster, ni un checkpoint, ni l'arrivée ne se posent sur l'eau. Il devient donc un circuit Technique, et le Speedway du chapitre 3 viendra plus loin.
- **Départ au plafond** : `start^` suffit (la course démarre alors en gravité inversée) ; les transitions de mur enchaînent un tonneau complet.
- **Deltaplane** : l'autopilote ne tient pas une portée de vol constante (selon l'élan, le deltaplane se pose entre 12 et 22 cases plus loin) ; le circuit laisse une longue piste d'atterrissage avant la plaque qui rend la voiture, et
  le contrat « sauts » compte les vols de plus d'une seconde (et non plus les réceptions parfaites, que le pilote réussit au hasard de l'élan).
- Nouveautés de l'outillage : `tools/lab.mjs` accepte `params` (gravité inversée, véhicule de départ), compte les **sauts** et le véhicule d'arrivée ; le contrat des Acrobatiques devient « ≥ 6 s en l'air, ≥ 3 sauts, ≥ 8 niveaux ».
- Bibliothèque d'ouvertures : la liste complète et définitive des 66 départs est dans la section Bêta 0.9.9 (et écrite dans `tools/test-niveaux.mjs`).
- Les records des cinq circuits refaits repartent de zéro ; **la fonction `submit-score` doit être redéployée** (`index.ts` régénéré). `PHYS_VER` reste 24.

## Bêta 0.9.7 — refonte du level design (lot 2 / 14)

Suite de la refonte : le dernier circuit du chapitre 1 (Spirale Prismatique) et les quatre premiers de la Jungle néon (chapitre 2). Chacun a son profil et une ouverture qui
n'a jamais servi.

| # | Circuit | Profil | Ouverture | Ce qu'il enseigne |
| --- | --- | --- | --- | --- |
| 4 | Spirale Prismatique | Rollercoaster | trois boosters → **directement un grand looping** | hélice montante de 16 niveaux (quatre grandes courbes inclinées), plongeon de 16 niveaux à 38°, slalom de wall-rides gauche / droite |
| 7 | Lianes Néon | Sprint | trois boosters → **rampe de lancement** avec anneau turbo dans le saut | vagues douces, pont de lianes **sans bordures** à plus de 230 km/h, S de virages relevés, très grand virage plat |
| 8 | Canopée | Speedway | **départ en tube** propulsé, qui débouche sur un virage relevé 3×3 | S relevés, wall-ride de 5 cases sur le mur gauche, tube à pleine vitesse, 35 % du temps au-dessus de 240 km/h |
| 9 | Spores | Acrobatique | deux boosters → **rebond géant** (palier 2 niveaux plus haut) | quatre champignons en escalier en zigzag (+8 niveaux), plongeon final ; la portée d'un rebond est proportionnelle à la vitesse, le circuit est très tolérant |
| 10 | Serpent | Technique | **bifurcation dès le départ** : la voie de droite porte la plaque moto | douze virages serrés en slaloms (R L R L), descente en lacets, petit saut sur un mur, moto → voiture → moto |

- **Le chapitre 1 est complet** et propose les cinq profils. Spirale est maintenant le n°4 (difficulté 3) et Lac Gelé le n°5 : deux Rollercoasters ne se suivent plus
  (règle vérifiée : deux circuits consécutifs d'un chapitre n'ont jamais le même profil). Le Grand Tour reste le final (n°6).
- Nouveautés de l'outillage : `tools/test-v096.mjs` devient **`tools/test-niveaux.mjs`** (contrat de tous les circuits qui ont un `profil`, plus les ouvertures de chaque lot) ;
  `tools/lab.mjs` compte maintenant les anneaux et le véhicule d'arrivée ; objectifs bonus vérifiés (chrono, réceptions parfaites, anneaux, moto à l'arrivée).
- Ce que ce lot a appris sur la physique : un **rebond** (`.j`, hauteur 200 % au maximum) donne 28 m/s vers le haut, soit un palier de **+2 niveaux** au plus ; il n'est
  posé que sur des droites plates. Une **sortie qui repasse au-dessus du départ** perturbe le premier saut (constaté sur Spores, dont le plongeon final passait juste au-dessus du premier rebond) : le dernier virage s'écarte de la tour.
- Bibliothèque d'ouvertures : la liste complète et définitive des 66 départs est dans la section Bêta 0.9.9 (et écrite dans `tools/test-niveaux.mjs`).
- **Correctif du lot 1 (Tremplins du Crépuscule).** Un contrôle nouveau a montré que, après une chute, la réapparition (qui remet la voiture **à l'arrêt**) la posait devant une rampe
  qu'elle ne pouvait plus prendre, et qu'un départ lancé (`v0`) ne se rejoue pas non plus après une réapparition avant le premier checkpoint. Le circuit est refait : chute libre
  depuis l'arrêt, un checkpoint avant chaque rampe suivi de deux boosters, anneau turbo au lieu du checkpoint aérien (sa réapparition tombait sur la rampe). Le contrat vérifie maintenant,
  pour **chaque checkpoint** de **chaque circuit refait**, que le pilote qui réapparaît à l'arrêt termine sans nouvelle chute, et qu'aucun circuit refait n'utilise `v0`.
- **Correctif des tests.** Trois tests de `tools/test-niveaux.mjs` (marge sur les murs, vérificateur de l'éditeur, partage SHW) étaient asynchrones et le script s'arrêtait avant qu'ils ne
  s'exécutent : ils affichaient « ok » sans rien vérifier. Ils sont maintenant synchrones (un test asynchrone est refusé) et passent réellement ; le vérificateur de l'éditeur a été
  complété pour les rebonds (réception plus haute que le départ jusqu'aux 4/5 de la hauteur du rebond).
- Les records des cinq circuits refaits repartent de zéro ; **la fonction `submit-score` doit être redéployée** (`index.ts` régénéré). `PHYS_VER` reste 24.

## Bêta 0.9.6 — refonte du level design (lot 1 / 14)

Les 66 circuits intégrés sont refaits par lots de 5 (un lot par version). Les circuits d'avant la 0.9.4 étaient tous bâtis sur la même recette
(`start B S2 R S L S2 C…`) et calés sur l'ancienne physique. Chaque circuit refait porte un **profil** (champ `profil`, pastille colorée sur la carte
de carrière) et une **ouverture** qui n'a rien à voir avec celle des autres.

**Lot 1 : le chapitre 1, Désert crépuscule (5 des 6 circuits)**

| # | Circuit | Profil | Ouverture | Ce qu'il enseigne |
| --- | --- | --- | --- | --- |
| 1 | Premiers Éclats | Sprint | deux boosters → premier wall-ride (transitions douces 2×2) | vitesse de pointe, trajectoire dans les très grands virages plats, courbes progressives |
| 2 | Canyon Corail | Speedway | un booster → directement un très grand virage relevé | virages relevés 3×3 à plus de 240 km/h, wall-ride de 6 cases sur la paroi du canyon, descente douce |
| 3 | Tremplins du Crépuscule | Acrobatique | **chute libre** immédiate depuis 66 m (la voiture quitte la plateforme de départ, à l'arrêt) | rampes progressives et à 38°, réceptions sur longues pentes, checkpoint aérien, saut sur un mur |
| 4 | Lac Gelé | Technique | épingle descendante dès le départ | 11 virages serrés, un booster à chaque relance, glace avant les épingles, chicane sur un mur |
| 5 | Le Grand Tour | Rollercoaster | trois boosters → **montée verticale** (montée en L, mur, sommet) | chute, slalom de wall-rides gauche / droite, grand looping, arche mur → plafond → mur |

**Les profils sont mesurés, pas seulement annoncés** (`tools/test-niveaux.mjs`, sur la course du pilote automatique) :

| Profil | Contrat |
| --- | --- |
| Sprint | aucun virage serré, ≤ 3 très grands virages, 12 à 26 s, plus de 180 km/h pendant 60 % du temps, au moins 40 % de lignes droites |
| Speedway | aucun virage serré, ≥ 4 très grands virages, plus de 240 km/h pendant 35 % du temps, freinage ≤ 8 %, moyenne ≥ 200 km/h |
| Technique | ≥ 8 virages serrés, freinage ≥ 3 % du temps, ≥ 15 % du temps sous 120 km/h, moyenne ≤ 155 km/h, un booster par relance |
| Rollercoaster | ≥ 6 niveaux de hauteur, ≥ 8 cases sur un mur (des deux côtés), au moins un looping |
| Acrobatique | ≥ 6 s en l'air, ≥ 3 réceptions parfaites, ≥ 8 niveaux de hauteur |

Règles communes à tout circuit refait : ouverture différente de toutes les autres, **aucun départ lancé** (`v0`), jamais le départ « classique », au moins quatre pièces de la 0.9.3
(wall-rides, courbes progressives, inclinaisons, très grands virages), wall-rides pris avec ≥ 130 km/h (le décrochage est à 108), **finissable sans choc ni
réapparition à ±10 % de vitesse** (un joueur n'a jamais la vitesse exacte du pilote), médailles à jour, objectif bonus réalisable.

**Ce que la physique impose au level design** (mesuré avec `tools/lab.mjs`) : sur le plat, la voiture plafonne vers 237 km/h (traînée) ; seuls les boosters
(jusqu'à 300 km/h), les descentes et les virages relevés permettent d'aller plus vite. Un virage serré se prend à ≤ 93 km/h, un grand à ≤ 162, un très grand
plat à ≤ 207 ; un très grand virage relevé laisse passer plus de 240 km/h. La portée d'un saut varie avec le carré de la vitesse : on le rend tolérant avec
de longues réceptions en pente, et on place les checkpoints **avant** les rampes (un saut trop long survole un checkpoint posé juste après), suivis de boosters : la réapparition remet la voiture **à l'arrêt**.

Bibliothèque d'ouvertures : voir la section Bêta 0.9.9 (liste complète des 66 départs, écrite dans `tools/test-niveaux.mjs`).

**Outils** : `node tools/lab.mjs "script" --l 4 --map --profile --robust` (carte, profil de vitesse, tolérance à la vitesse) ou `--id eclats` ou `--all` ;
`node tools/medals.mjs eclats` propose les médailles (or = temps du pilote, cristal 0,95 ×, argent 1,15 ×, bronze 1,35 ×) et `--check` les vérifie.

- Les records des circuits refaits repartent de zéro (la clé de classement contient l'empreinte du circuit) ; **la fonction `submit-score` doit être redéployée** (`index.ts` régénéré, elle connaît les circuits intégrés).
- `PHYS_VER` reste 24.

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
