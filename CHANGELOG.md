# Historique des versions

Une section par version, la plus récente en haut. Le numéro de version affiché au joueur est `VERSION` dans `js/version.js` (et `package.json`) ;
`PHYS_VER`, dans le même fichier, est la version de la **physique** : les records, replays, fantômes importés, classements en ligne et salons
multijoueurs y sont liés. Une version qui change `PHYS_VER` impose de **redéployer la fonction serveur `submit-score`** (voir le README).

*Les nombres des sections anciennes (portées en cases, vitesses de saut…) sont ceux du monde de leur époque ; le monde est passé de cases de 24 m à 32 m en 0.9.11.*

## Bêta 0.9.12 — audit d'architecture : une seule physique partout, un code découpé, des garde-fous

Aucune nouvelle fonction de jeu : un audit complet du dépôt (code mort, chantiers inachevés, dette technique, performances) a été traité de bout en bout.
Seule la physique change (`PHYS_VER` 26) : les records, replays et fantômes d'avant sont écartés, comme à chaque changement de physique ; les **temps de
référence des 66 circuits et leurs médailles sont inchangés**. **La fonction `submit-score` doit être redéployée** (`npm run build:function`, puis `index.ts`).

### Corrections en jeu
- **Fantôme du record** : il restait une voiture quand le joueur se transformait en moto, bateau ou deltaplane (l'enregistrement ne gardait que position et orientation). Les changements de véhicule sont maintenant enregistrés avec le record (`ghostVeh`) ; les anciens records restent des voitures.
- **Décor « Ville »** : les enseignes néon étaient semées au hasard entre 30 et 150 m de haut, sans immeuble : elles flottaient. Elles sont collées à la façade d'un immeuble.
- **Décor « Jungle »** : les canopées lumineuses étaient semées à part des troncs et flottaient ; elles se posent au sommet d'un tronc.
- **Fantômes** : ils se transforment avec la même animation que le joueur (instantanément après un retour au checkpoint ou un redémarrage). **Particules** : un retour au checkpoint efface celles de l'endroit quitté.
- `tools/test-decors.mjs` : aucun élément de ces décors ne flotte (testé sur plusieurs graines).

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
