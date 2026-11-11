# Copytrack — audit des manquements et de l'expérience de jeu (base : 0.9.59, `PHYS_VER` 34)

Phase d'analyse et de conception. **Aucun fichier du dépôt n'a été modifié** (`git status` vide), aucun commit, aucune donnée Supabase touchée. Tous les essais ci-dessous ont tourné
hors dépôt, dans le répertoire de travail temporaire de la session : `scratchpad/exp/` (scripts) et `scratchpad/shots/` (captures).

## 0. Comment lire ce rapport

**Statuts de preuve** — chaque constat porte l'un d'eux :

| Marque | Sens |
|---|---|
| **[MESURÉ]** | reproduit sur le vrai moteur (`CarPhysics`, `RaceLogic`, vrais circuits) avec un script, chiffres donnés |
| **[CAPTURE]** | observé dans le vrai jeu (Chromium, WebGL logiciel, qualité graphique minimale) sur une capture |
| **[CODE]** | établi par lecture du code uniquement, **non reproduit** |
| **[HYPOTHÈSE]** | plausible mais à confirmer par un joueur humain ou un test dédié |

**Ce que je n'ai PAS pu faire** (détail en section 16) : aucun humain n'a conduit. Je n'ai donc **ressenti** ni les accélérations, ni les virages, ni le son, ni les vibrations ;
je les ai **mesurés**. Je n'ai pas joué à PolyTrack dans cette session : toute comparaison avec lui est une **hypothèse à vérifier côte à côte**, pas une observation.
L'éditeur a été ouvert, lu et capturé, mais je n'ai pas mené de session de construction interactive complète (pose pièce par pièce à la souris).

**Honnêteté sur ma méthode** : deux de mes premiers montages étaient faux (voiture posée sur le terrain hors piste au lieu de la plateforme ; route trop courte pour atteindre la bordure).
Leurs résultats ont été **écartés et refaits** après vérification de la surface sous les roues ; seuls les chiffres corrigés figurent ici.

**Distinction code / réel** (demandée) : dans les tableaux de la section 12, la colonne « Statut réel » sépare *prévu par le code*, *fonctionne*, *fonctionne sous conditions*,
*fonctionne mais mauvaise expérience*.

---

## 1. Compréhension générale du fonctionnement de Copytrack

**Nature du jeu.** Un contre-la-montre solo low-poly dans le navigateur (site statique, three.js embarqué, ~35 000 lignes de JS), autour de : 72 circuits officiels en carrière, un
**éditeur de circuits** complet, une communauté et des classements (Supabase), des replays/fantômes/coach, un multijoueur pair à pair, un garage purement visuel.

**Architecture (docs/ARCHITECTURE.md, vérifiée par lecture)** — quatre idées structurantes :

1. **La physique est une fonction déterministe des commandes** (pas fixe 1/120 s). Rejouer les commandes redonne la course exacte : replays, fantômes, **vérification des temps par le serveur** (`submit-score`, Deno).
2. **Le même noyau tourne partout** (navigateur, Deno, Node). Il n'utilise que `+ − × ÷ √` et `js/dmath.js` → interdit `Math.sin` etc.
3. **`PHYS_VER` lie tout** : records, replays, fantômes, classements, salons. Toute modification de physique/géométrie de pièce l'incrémente et **invalide les records antérieurs** (affichés mais non rejouables) ; il faut **redéployer `submit-score` à la main**.
4. **Garde-fous lourds** : empreinte de 193 scénarios (`tools/phys-fingerprint.json`), temps de référence des 72 circuits (`golden-temps.json`), corpus de compatibilité des codes de partage, 88 fichiers de test.

**Les trois régimes de contact — c'est LA clé pour tout ce qui suit.** La voiture n'a pas un modèle de contact unique ; elle est toujours dans l'un de ces trois états (`js/physics.js`, `_stepCore`) :

```
 ┌──────────── SOL ("ground") ─────────────┐  ┌──────────── RUBAN ("rib") ──────────────┐  ┌───── AIR ─────┐
 │ champ de hauteur : surfaceAt(x,y,z)     │  │ courbe paramétrée (u, dl) fixée par la  │  │ balistique,   │
 │ (+ ceilingSurfaceAt = même chose        │  │ pièce : loopings, tubes, vrilles, murs, │  │ lacet + tangage│
 │ miroir pour la gravité inversée)        │  │ routes sur un mur, transitions…         │  │ SEULEMENT (pas│
 │ gravité = ±Y du monde                   │  │ position = f(u, dl) : la voiture est    │  │ de roulis)    │
 │ cap = un lacet autour de Y              │  │ GUIDÉE ; gravité projetée dans le plan  │  │               │
 │ normale lue sur la pièce                │  │ de la route ; « appui » calculé         │  │               │
 └─────────────────────────────────────────┘  └─────────────────────────────────────────┘  └───────────────┘
```

- **Gravité** : un *signe* (`gSign` = ±1) sur l'axe Y du monde, plus un multiplicateur de grandeur (`gravMul`, persistant jusqu'à la prochaine plaque). Il n'existe **aucun vecteur de gravité** ni aucun repère « local à la surface » partagé.
- **Orientation** : par *pièce*. Roulis de 4 valeurs seulement (sol / mur gauche / mur droit / plafond), cap en quarts de tour, hauteur en niveaux de 6,4 m, grille de 32 m (`pieces.js`, `docs/ROTATIONS.md`).
- **Surfaces** : revêtements en *tables de coefficients* (`specs.js: surfaceCoeffs`) appliqués au sol **et** aux rubans (une seule source, bien).
- **Caméra** : propre à `RaceSession` (`race/camera.js`), purement visuelle ; elle lit la normale (`this.up`) lissée par `_orient()`.

**Ce qui est solide** (à ne pas casser) : déterminisme prouvé sous trois moteurs ; exploration aléatoire de dizaines de millions de pas sans NaN ni gel ; audits précédents (0.9.55, 0.9.58, 0.9.59) ; analyse de course (coach, secteurs, Theater) ; éditeur riche (groupes, prefabs, logique, pot de peinture, annuler/rétablir testés sur 150 000 opérations).
**La question de cet audit n'est donc pas « ça plante-t-il ? » mais « la conduite et la création donnent-elles envie ? »**.

---

## 2. État actuel de l'expérience de conduite (mesuré)

Toutes les mesures : voiture « classique », profil Classique, route normale, vrai moteur. Scripts : `scratchpad/exp/e1.mjs … e19.mjs`.

| Mesure | Résultat | Lecture |
|---|---|---|
| 0→100 / 200 / 250 / 280 km/h (gaz) | **2,17 s / 5,45 s / 8,73 s / 14,1 s** | vive au départ, longue fin de courbe (plafond 290) |
| Freinage 200→0 km/h | **1,02 s sur 28 m** (≈ **5,3 g**) ; 200→100 en 0,51 s | **moins d'une case (32 m)** pour s'arrêter de 200 km/h |
| Roue libre 200→100 km/h | 9,8 s | lever le pied ne ralentit presque pas |
| Adhérence latérale, plein volant | **6,1 à 6,4 g**, quasi constante de 80 à 250 km/h ; rayon 10 m (80 km/h), 16 m (120), 24 m (160), 33 m (200), 46 m (250) | très élevée ; demi-volant ≈ 5,5–6,6 g : le volant **sature tôt** |
| Rayons des pièces | virage serré **16 m**, grand 48 m, très grand 80 m | virage serré franchissable à ≈ **113 km/h**, grand ≈ 196, très grand ≈ 252 |
| Coup de volant de 0,3 s à 150 km/h | cap **−36°**, dérive max **5,8°**, aucune perte de vitesse notable | voiture « sur rails » sur revêtement normal |
| Chicane 250 km/h, période 0,2 s | dérive max 9°, vitesse finale 256 km/h | très stable, très agile |
| Montée en régime du volant clavier | 0 → plein en **0,125 s** (`steerIn` 8), retour 0,077 s ; 90 % du lacet en 0,13 s | clavier = quasi tout-ou-rien |
| Marche arrière | frein tenu à l'arrêt → recul automatique jusqu'à ≈ 53 km/h | pas de point mort ni de bascule explicite |

**Verdict d'ensemble** : la voiture est **agile, stable, très accrocheuse et très freinante**. C'est un modèle d'arcade cohérent et sans piège, mais qui offre **peu d'« expression de pilotage »**
au-delà du choix de trajectoire : on freine à peine, on ne dérape pas sur revêtement normal, on ne perd presque jamais l'adhérence. La conduite devient vraiment risquée seulement via
(a) les bordures (punition extrême, F-1), (b) les surfaces spéciales, (c) les atterrissages mal orientés (F-6). Ce déséquilibre — *grip quasi illimité mais contact punitif* — est le fil rouge de l'audit.

---

## 3. Analyse approfondie de la physique

### 3.1 Modèle de pneus
Modèle « bicyclette » à saturation (`physics.js: _tires`, `_steerAngle`) : angle de braquage limité par la vitesse (`steerAlat`), force latérale avant/arrière saturée par `latGrip` (80 m/s²). Pas de transfert de charge (sauf moto v2, en service seulement avec les règles `pm`/`vm`), pas d'état de roue, un seul scalaire d'**état de dérapage** (`driftT`). Frein = force longitudinale constante (`CAR.brake` 52 m/s²).
**Statut** : cohérent et déterministe. Il fonctionne, mais il **ne produit ni survirage ni glisse contrôlée** sur revêtement normal (cf. F-2).

### 3.2 Sol : rupture de pente et décollage
`_roadContact` : la voiture reste collée si la vitesse normale à la route reste `< CAR.launch` (0,6 m/s) et l'écart `< CAR.snap` (0,7 m). Conséquence **[MESURÉ]** :

| Rupture | Temps de vol à 40 / 80 / 120 / 200 km/h |
|---|---|
| pente 1 niveau (11°) → plat | 0,22 / 0,45 / 0,68 / 1,13 s |
| pente douce ½ niveau (5,7°) → plat | 0,09 / 0,22 / 0,34 / 0,58 s |
| plat → descente 1 niveau | 0,22 / 0,46 / 0,70 / 0,82 s |
| tremplin (22°) → plat | 0,43 / 0,86 / 1,30 / 2,12 s |
| **pièces à profil adouci** (`crv/cro/cdi/cdo`) | **0 s** à toute vitesse |

→ **Toute cassure de pente est un mini-saut, dès 40 km/h.** Seules les pièces « Courbe » (raccords doux) lissent. Ce n'est pas un bug, mais un **piège de conception pour le créateur** (ED-3).

### 3.3 Air
`_flyAir` : lacet très faible (`airSteer` 1,4 rad/s², max 0,45 rad/s), **tangage commandé par gaz (nez en bas) et frein (nez en haut)**, **aucun roulis**. L'orientation visuelle revient à la verticale en ~0,1–0,2 s (`race.js: _orient`, lerp 0,08 à 0,2 par pas). Détails des réceptions en F-6.

### 3.4 Collisions
Bordures (`walls.js`), obstacles (7 types : piques, balancier, marteau, mur coulissant, balayeur, bumper), dalles/toits de tunnel, verre. **Les décorations sont purement visuelles** (`decos.js`). Détails et punition de contact en F-1.

---

## 4. Analyse de la gravité et des orientations

### 4.1 Réponses aux questions posées

| Question | Réponse | Preuve |
|---|---|---|
| Looping : la voiture à l'envers tient-elle sans revêtement ? | **Oui, par la seule force centripète** : `_ribStep` projette la vraie gravité dans le plan de la route et calcule l'appui (`press`) ; trop lent en haut, elle décroche (« Trop lent »). Aucun revêtement requis. | [CODE] + [MESURÉ] : 15 circuits officiels ; loopings réussis dans tous mes essais gaz tenus (30–180 km/h d'élan). Le seuil sans moteur n'a pas été isolé proprement (mon montage perdait de la vitesse avant la pièce). |
| **Vrille** (demi-tour de roulis) : la gravité suit-elle ? | **NON** sans revêtement « Inversion de gravité » : la voiture **se détache en bout de vrille et tombe de 26 m** sur le terrain. | **[MESURÉ]** : `start S2 TW S2^ TWB S2 finish` → `gSign` reste 1, chute de y=26 à y=0, hors piste. Avec `TW.f` : arrivée en 6,4 s, `gSign` 1→−1. Les circuits officiels utilisent tous `TW.f`. |
| Transitions mur↔plafond | Oui : `autoFlip` (la gravité suit la route). | [MESURÉ] `[tr13s]` : `gSign` 1,−1 |
| Plafond sans plaque ni transition | La route retournée est **non solide** en gravité normale (fantôme) ; une route normale est non solide en gravité inversée (documenté). | [CODE] `isFloor`/`isCeilingFloor`, `docs/PHYSIQUE-CONTACTS.md` |
| Tourner normalement sur un mur ? | **Oui, dans le plan du mur** : le volant monte/descend la voiture *le long de la bande*. | [CAPTURE] 05-mur-c ; [MESURÉ] |
| … mais sans liberté réelle | La bande fait 24 m de large **sans bordure** ; un coup de volant de 0,3 à 0,6 s à 150 km/h la fait quitter en ~0,7 s (chute ou envol balistique de +19 m dans ma capture). | [MESURÉ] (chutes à 3,24 s et 3,41 s) + [CAPTURE] 05-mur-d |
| Virages sur un mur pour monter/descendre ? | Partiellement : arc sur mur (courbe **horizontale** dans le plan du mur), pentes posées sur un mur (montée en diagonale), L vertical. Pas de trajectoire libre. | [CODE] `buildRolled`, `flagAllowed('o')` ; [MESURÉ] `R<` |
| Passer d'un mur à l'autre ? | **Pas directement** : `ROLL_PASSAGES = [01,10,02,20,13,31,23,32]` — **aucun 12/21** (mur gauche↔droit), aucun 03/30. L'éditeur signale le raccord incompatible mais ne le fournit pas. | [CODE] `pieces.js:145` ; [MESURÉ] `orientationIssues` signale « Mur gauche contre Mur droit » |
| Looping latéral ? | **Impossible** : l'option `o` n'est autorisée que sur lignes et virages (`flagAllowed`), les loopings sont dans le plan vertical de la route. | [CODE] `pieces.js:352` |
| Enchaîner plusieurs orientations ? | Oui : sol→mur→plafond→mur→sol via transitions. | [MESURÉ] |
| Rubans entrés/atterris depuis l'air ? | **Non** : on n'entre que par les **extrémités** (`_tryEnterRibbon`) ou on retombe sur une face tournée vers le haut (`F.ny*gSign ≥ 0,2`, `_tryLandRibbon`). Contre le flanc d'un mur ou d'un looping, la voiture **traverse la pièce sans collision**. | **[MESURÉ]** 150 km/h contre une pièce « Mur vertical » : 0 collision, 0 pas en mode ruban. |

### 4.2 La différence « orientation visuelle » / « vraie gravité »
Sur un mur, la caméra et la voiture se tournent d'un quart de tour (le monde « bascule » à l'écran, 05-mur-a), **mais la gravité physique reste −Y du monde**. Ce qui retient la voiture est un
**appui aérodynamique fictif** (`SIDE_AERO` 0,03, `SIDE_HOLD`) qui annule la glissade, valable **seulement au-dessus de 108 km/h** (`SIDE_MIN_SPEED` = 30 m/s, `SIDE_GRACE` 0,3 s) ; en dessous, la
voiture glisse « vers le bas du monde » le long de la route puis décroche. Le joueur voit une route plate qui, sous 108 km/h, se met à le tirer de côté sans cause visible.

### 4.3 Incohérence mesurée : la même descente au sol et sur un mur
**[MESURÉ]** (e18.mjs) — même crête (plat → descente de 21,8°), 150 km/h tenus :

| | Temps de vol | Décrochage |
|---|---|---|
| **Au sol** | **1,17 s** | oui (balistique) |
| **Sur un mur gauche** | **0 s** | **non — la voiture « colle » et suit la descente** |

Cause **[CODE]** : `buildRolled` donne `minU: 0,5` et la condition de décrochage par appui négatif (`ribbon.js`, `press < −0,6 && R.u > mu && R.u < 1 − mu`) est **impossible** pour `mu = 0,5`.
Il en va de même pour la **vrille** et les **transitions** (`minU 0,5`) : ces pièces ne lâchent *jamais* la voiture par manque d'appui. C'est très probablement la source du constat
« voiture attirée par une pente descendante alors qu'aucune surface magnétique n'est présente » : **elle existe, mais sur les rubans orientés, pas au sol**. Au sol je n'ai *pas* pu la reproduire (rupture → décollage systématique, §3.2).

### 4.4 Solutions possibles (le plus cohérent d'abord)

| Option | Principe | Gain | Coût / risque |
|---|---|---|---|
| **A. Gravité locale attachée au contact** | Tant qu'une surface porte la voiture, « bas » = −normale ; inversion automatique pour toute surface dont la normale passe sous l'horizontale ; hors contact, retour progressif au −Y du monde (grâce 0,2–0,4 s pour finir un saut). Généralise `autoFlip` à *tout* ruban et remplace la fiction `SIDE_*` par un appui explicite. | Looping, vrille, tube, mur, plafond **identiques** ; plus de revêtement « Inversion » obligatoire ; plus de piège de vrille. | **Très élevé** : `PHYS_VER`, 72 temps d'or, médailles, fantômes, serveur. Le circuit « Cristal Fêlé » **dépend** de la traversée des dalles en gravité inversée → à re-concevoir. |
| **B. Gravité à 6 axes par zone/plaque** | Généraliser `gSign` en axe (±X, ±Y, ±Z) ; murs = « sols » d'un repère tourné. | Cohérence parfaite, murs réels, looping latéral réalisable. | **Refonte du sol** (heightfield sur Y partout) ; la plus lourde. |
| **C. Minimale : autoFlip sur vrille/cork/looping retournés + garde-fous d'éditeur** | Ajouter `autoFlip` à `twist` ; avertissement `checkTrack` quand une orientation arrive à l'envers sans inversion. | Supprime les pièges **sans toucher au reste**. | Faible à moyen : change le comportement de `TW` sans `.f` seulement ; les circuits officiels avec `TW.f` doivent rester identiques (test à écrire). |

**Recommandation** : C tout de suite (V1), A comme chantier V1.0 s'il est décidé *dans la même fenêtre de `PHYS_VER`* que la refonte du contact (section 15), B repoussé (V2).

---

## 5. Analyse des surfaces et de l'adhérence

**[MESURÉ]** sur arène plate, 100 %, voiture classique :

| Revêtement | 0→100 | Freinage 100→0 | Plein volant à 100 km/h : g / dérive / vitesse | Coup de volant 0,3 s à 150 : cap / dérive max |
|---|---|---|---|---|
| normal | 2,17 s | 7,2 m | 6,2 g, −1°, 101 km/h | −36°, 5,8° |
| verglas | 4,82 s | 15,7 m | 1,2 g, −0,5°, 125 | −8°, 1,2° |
| dérive | 2,17 s | 7,2 m | 2,0 g, 18,5°, 54 | **−150°**, **45°** |
| ralentisseur | > 6 s | 5,6 m | 3,1 g, 15,8°, 33 | −36°, 5,1° |
| poudreuse | 4,32 s | 9,0 m | 3,8 g, 0,4°, 83 | −24°, 3,4° |
| aimant | 2,17 s | 7,2 m | 7,8 g, 1,4°, 82 | −48°, 8,3° |
| verre | 2,54 s | 7,2 m | 5,3 g | −36°, 5,8° |

- **Distinction** : les revêtements sont clairement distincts *au chiffre* (verglas = direction quasi nulle, dérive = tête-à-queue, poudreuse = moteur mou). **Bon point.**
- **Défaut de lisibilité [HYPOTHÈSE]** : sur verglas la voiture **ne glisse pas** (dérive 1,2°) : elle va tout droit et tourne très peu. Le cap suit la vitesse, la carrosserie ne part pas en travers. Le ressenti « glace » (glisse + survirage lent) n'est pas là ; à valider en jeu.
- **Sol hors piste** : `grip 0,55, traction 0,7, vmax 0,45, traînée 5` : on perd 55 % de la vitesse ; réapparition après 0,5 s (`OFF_TRACK_RESPAWN_S`).
- **Aimant** : attire le long de *sa* normale (`_roadContact`), mais seulement les surfaces « sol/plafond » (`surfaceAt/ceilingSurfaceAt`), jamais les rubans.
- **Gravité (revêtement)** : persistante jusqu'à la prochaine plaque (`_gravityPad`, jamais remise à 1 en quittant) — message affiché ; à documenter (P3).
- Voir aussi §4.3 pour l'« attraction » sur rubans orientés.

---

## 6. Analyse des dérapages et du comportement automobile

### F-2 constat central (détaillé en section 12)
**[MESURÉ]** (e3.mjs) — « le dérapage » = freiner en tournant **sans gaz** (`driftState`: `brake && !throttle && |steer|>0,5 && vitesse > 12 m/s`) :

| Élan | Après 1 s de frein + plein volant | Mini-turbo |
|---|---|---|
| 100 km/h | **≈ 6 km/h** à t=1,2 s | non |
| 150 km/h | **≈ 23 km/h** à t=1,2 s | non |
| 200 km/h | ≈ 44 km/h à t=1,8 s (dérive 18°) | niveau 2 obtenu… mais à 44 km/h |

- Le frein (52 m/s²) **écrase** la conservation de vitesse : `driftBrake` (0,75) ne le réduit à ~13 m/s² que sur le papier ; la perte mesurée est ≈ 40 m/s². **Le dérapage tue l'élan.**
- **Mini-turbo** : `boostF` 0,32 / 0,55 pendant 0,55 / 0,8 s ⇒ **≈ +6 km/h / +16 km/h**, contre 100 à 150 km/h perdus pour l'obtenir. Il récompense au mieux une **sortie de quasi-arrêt**.
- **Gaz + frein** (technique arcade courante) : `driftT` reste **0** (jamais de dérapage) [MESURÉ].
- Sur revêtement normal, même un coup de volant sec à 150 km/h ne dépasse **jamais 5,8° de dérive** : pas de survirage à vitesse, donc **pas de glisse à gérer**.
- **Récupération d'adhérence** : instantanée (relâcher le volant → `dérive 0°`) : pas de contre-braquage à apprendre.
- **Transferts de charge** : absents (hors moto v2).

→ La promesse du README/Académie (« dérapage, mini-turbo en série ») n'est **pas tenue par le modèle actuel**. C'est une **limitation de conception** (pas un bug) à fort impact sur le plaisir.

### Réception (F-6) [MESURÉ] (e19.mjs, tremplin 22°, vol 1,9–2,3 s)
| Commande donnée en vol | Réception |
|---|---|
| rien | −11 à −12 %, qualité *ok* |
| **gaz tenus** (réflexe naturel) | **−42/−43 %, qualité *bad*** |
| frein tenu | **−42/−43 %, qualité *bad*** |
| un **tap** de gaz 0,25 s | −11 %, *perfect* |
| un tap de frein 0,3 s | −42 %, *bad* |

→ **Maintenir les gaz pendant un saut — ce que fait instinctivement tout joueur — coûte 43 % de la vitesse.** Le tangage est piloté par les touches de conduite (gaz = nez en bas), sans aucun repère à l'écran hors la voiture elle-même.
C'est un geste d'expert caché derrière un réflexe contraire ; je classe « mauvaise expérience » (et non « bug »).

---

## 7. Analyse de la caméra

**Code (`race/camera.js`) [CODE]** — presets `Poursuite` (9,5 m, hauteur 3,7 m, visée +5 m, FOV 66), `Proche` (6,2/2,3/70), `Capot`, `Lointaine` (14/5,6/62). Poursuite : cap lissé à 5,5 /s au sol, 2,5 /s en l'air, mélangé à **45 % de la direction de la vitesse** dès 10 m/s au sol (hors marche arrière) ; FOV +0,24°/(m/s) jusqu'à +18° ; distance +0,03 m par m/s (≤ +2,5 m) ; vertical lissé à 6 /s ; coup de FOV au turbo, tassement à la réception, lignes de vitesse dès 126 km/h (`feel.js`). Sur un ruban : la caméra suit la **route elle-même** (repère de la pièce) et son « haut » suit la normale (lissé 6 /s, position 14 /s). Au plafond : retournement par rotation axe-angle en 0,45 s (`camflip.js`) — **bien conçu**.

**Constats**

| # | Constat | Statut |
|---|---|---|
| CA-1 | **Aucune anticipation** : ni décalage vers l'intérieur du virage, ni suivi du taux de lacet, ni inclinaison selon la pente. La caméra *réagit* au cap, elle ne le *précède* pas. | [CODE] |
| CA-2 | **En l'air, la caméra regarde à l'horizontale** ; au sommet d'un saut je ne vois que le ciel et la brume, pas la zone de réception. | [CAPTURE] 03-saut-b (WebGL logiciel, brume : à confirmer sur GPU réel) |
| CA-3 | **Sortie d'un mur** : le haut de la caméra revient vers le −Y du monde à 4 /s alors que la voiture se redresse en 0,1–0,2 s ; à 0,3 s après la sortie la voiture est vue du dessus, la route en bande diagonale, l'horizon absent. | [CAPTURE] 05-mur-d |
| CA-4 | Sur mur, la caméra adopte **entièrement** le repère de la route : l'image paraît « normale » (route plate), le monde bascule. Lisible, mais **dissonant** avec la gravité réelle (§4.2). | [CAPTURE] 05-mur-a/c |
| CA-5 | Pas de roulis de caméra dans les virages relevés au sol (le mode ruban la fait tourner **en entier** avec la bascule de la pièce). | [CODE] |
| CA-6 | Voiture petite à l'écran en Poursuite (≈ 6,6 % de la largeur à 960 px). | [CAPTURE] — affaire de goût, P3 |

**La caméra peut-elle rendre Copytrack nettement plus agréable sans toucher à la physique ?** **Oui.** Elle est *purement visuelle* (aucun impact sur `PHYS_VER`, serveur, records). Les trois leviers à fort rendement : anticipation latérale pilotée par le braquage/lacet, visée vers le bas en descente et en vol, lissage dédié de sortie de ruban (monde ↔ route) avec conservation de l'élan angulaire visuel.
**Comparaison PolyTrack** : non vérifiée dans cette session ; **hypothèse** à tester côte à côte — une caméra de poursuite à avance de visée et à retard de position réglés finement est une des différences de « jus » les plus fréquentes entre jeux de ce genre.

---

## 8. Analyse des pièces et raccordements

- **119 entrées** dans `PIECE_ORDER` (**116 types** définis dans `PIECES`, le reste = anciens types retirés), regroupés en 6 familles à caractéristiques dans l'éditeur. **Verrouillés sur la grille** : cap en quarts de tour, 4 orientations de roulis, hauteurs en niveaux de 6,4 m, emprise 1×1 à 4×4 cases de 32 m (`ROTATIONS.md`).
- **Raccord** : deux extrémités doivent coïncider à ≈ 2 m avec tangente opposée (`checkTrack`) ; sinon c'est un **saut**, signalé (« extrémité reliée à rien », « saut risqué ») mais **sans aide de construction** (pas d'aimantation vers l'extrémité libre).
- **Classes de raccord de roulis** (`joins.js`) : sol/mur gauche/mur droit/plafond ; écart > 0,35 rad signalé. Les passages disponibles : sol↔mur G/D, mur G/D↔plafond (franc 1 case ou doux 2×2). **Manquants** : mur G ↔ mur D, sol ↔ plafond direct (seule la vrille).
- **Pièces jamais utilisées dans les 72 circuits officiels** [MESURÉ] : **51 types sur 116** (dont 4 anciens) — notamment toutes les courbes montantes/descendantes serrées (`cv*`, `cvd*`), `dn05/dn1`, la plupart des `cro*`, les transitions douces vers le plafond (`tr13l…tr32l`), `loopTriple`… Ces pièces **n'ont de validation que l'exploration aléatoire** et ne sont montrées au joueur par aucun circuit.
- **Zones ouvertes** : seule la **plateforme 1×1 plate** sans bordure ; pas de plateforme inclinée, relevée, courbe ni sur mur.
- **Rubans non solides** (cf. §4.1) : traversables de côté.
- **Obstacles solides statiques** : aucun (pas de bloc, de rampe, de mur fixe) ; décorations non solides.

---

## 9. Analyse de l'éditeur

**Ce que j'ai fait réellement** : ouverture dans Chromium (1280×720), lecture de `index.html`, `editor.js`, `editor/*.js`, `editorTools.js`, `tileInfo.js`, capture d'écran avec un circuit chargé ; exécution de `checkTrack`/`orientationIssues` sur des circuits de test. **Je n'ai pas** mené de session de pose à la souris ; l'ergonomie ci-dessous vient donc du code et de l'inventaire d'interface (**[CODE]/[HYPOTHÈSE]**).

**Inventaire** : sélection **rectangulaire** (copier, couper/déplacer, coller avec rotation, dupliquer, monter/descendre, supprimer), gomme à filtres, **pot de peinture**, **inspecteur + gizmos 3D**, groupes/calques (F4), prefabs (chicane, épingle, slalom, saut, looping, wall-ride), logique de circuit (F6), test depuis la pièce visée, vérification complète (F2), vue par niveau, caméra libre, historique annuler/rétablir, 23 raccourcis d'éditeur reconfigurables. C'est **déjà un éditeur très complet**.

| # | Constat | Statut |
|---|---|---|
| ED-1 | **Pièges silencieux** : `checkTrack` ne signale **ni** une vrille sans inversion de gravité (chute de 26 m), **ni** une route retournée raccordée directement à une route plate. | **[MESURÉ]** `checkTrack(...)` → `[]` pour `TW` sans `.f` |
| ED-2 | **Pose case par case** : au clic, ou **au glissé** (`painting`, `pointer.js:141`) mais avec la *même* pièce, le *même* cap et le *même* niveau sur chaque case ; niveau et rotation sont à régler à la main, seul `autoLevel` (pentes) aide. Pas de « prolonger depuis l'extrémité libre », pas de tracé qui suit un virage, pas d'orientation déduite de la pièce précédente. | [CODE] `tools.js:_prepareAutoLevel`, `pointer.js` |
| ED-3 | **Connaissances implicites** nécessaires : « TW exige `.f` », « mur : ≥ 108 km/h », « toute cassure de pente = saut → utiliser `crv/cro` », « un mur demande niveau ≥ 2 et descend de 9 m » — aucun n'est dit au moment de la pose (à vérifier dans les info-bulles). | [HYPOTHÈSE] |
| ED-4 | **Sélection non rectangulaire impossible** (hors groupes) ; pas de sélection par type/revêtement. Annuler ne restaure pas le rectangle ; « coller sur le départ » le retire sans le dire. | [CODE] + audit 0.9.59 (non reproduit ici) |
| ED-5 | À 1280×720 le panneau du bas occupe ≈ 40 % de la hauteur ; la route (sombre) sur terrain orange est une fine ligne à faible zoom. | [CAPTURE] editeur-1 (WebGL logiciel) |
| ED-6 | Cibles tactiles petites (déjà documenté par l'audit 0.9.59). | doc existante |

---

## 10. Analyse du level design

- **Statistiques des 72 circuits officiels [MESURÉ]** : 2 780 pièces de route, dont **82 % lignes**, **60 % simples lignes droites**, 8 % virages, 9 % rubans ; **553 dalles d'accélérateur (≈ 1 pièce sur 5)** ; usage : mur/transition 52 circuits, loopings 15, virages relevés 17, tubes 6, **vrilles 2**, plafond 5, bifurcation 2, **pièce mobile 1**, obstacles 11, véhicule de départ ≠ voiture **1**.
  Au pilote automatique : durée **médiane 29 s** (17 à 65 s), vitesse moyenne **192 km/h** (133–242), 12 % du temps en l'air, 20 % sur ruban.
- **Lecture** : l'identité est **« vitesse + murs/loopings enchaînés au boost »** ; la variété du *geste de conduite* est faible (le boost fait une grande part de l'amusement). Les virages montants/descendants, les transitions douces, les moto/bateau/deltaplane, les pièces mobiles sont quasi absents des circuits officiels : le joueur n'en voit pas le potentiel.
- **Liberté de création** : verrouillée par la grille (cap à 90°, 4 roulis, niveaux) — acceptable pour une V1 *si* le vocabulaire est suffisant ; manquent surtout les **passages** (mur↔mur, sol↔plafond), les **plateformes inclinées**, les **obstacles solides**, et la possibilité d'**entrer** dans un ruban par l'air.
- **Circuits non linéaires** : bifurcations (2 circuits), plateformes plates : le jeu favorise **fortement les parcours linéaires**.
- **Découverte** : carrière ordonnée par difficulté, fiche de circuit, communauté — structure correcte ; les 72 circuits sont tous terminés par le pilote automatique, ce qui valide la jouabilité mais **ne dit rien sur le plaisir**.

---

## 11. Analyse du plaisir de jeu et de l'identité

**Forces réelles** (à préserver) : boucle de progression complète (médailles, objectifs bonus, titres), **analyse de course** (coach, secteurs, Theater, comparaison de fantômes) — **différenciateur fort**, éditeur + communauté + vérification serveur, déterminisme permettant des classements fiables, défi du jour, Académie, accessibilité (aides, animations réduites).

**Freins au « une heure de plus / une course de plus »** :

1. **Peu d'expression de pilotage** (§2 et F-2) : pas de glisse à maîtriser, freinage sans zone, adhérence sans limite perceptible ; la maîtrise se résume à la trajectoire et au placement des boosts.
2. **Punition disproportionnée au contact** (F-1) : on apprend à *éviter les bordures*, pas à *les exploiter*.
3. **Jeu de murs fragile et peu explicable** (F-3) : bande sans bordure, seuil de vitesse invisible, chutes sans cause lisible.
4. **Sauts** : réflexe gaz tenu = −43 % (F-6) ; vol à 2 s sans zone d'atterrissage visible (CA-2).
5. **Perception de la vitesse** : lignes de vitesse (dès 126 km/h), FOV +18°, coup de FOV au turbo — présents ; flou de mouvement, vibration, son : **non testés** (§16).
6. **Identité** : « PolyTrack-like » assumé (low-poly, time attack, éditeur) mais la **signature propre** (gravité manipulée, wall-ride, plaques de transformation, analyse) est précisément la partie **la moins cohérente physiquement** (§4). Faire de la gravité/orientation le trait distinctif *et* le rendre irréprochable est la meilleure voie vers une identité propre.

**Comparaison avec PolyTrack** : **non vérifiée** ici. À tester côte à côte, sur le même type de circuit, un protocole court : (1) rayon et vitesse en virage serré, (2) conséquence d'un contact de bordure à 5°, (3) accessibilité d'une glisse volontaire, (4) lisibilité de la caméra en descente et en saut, (5) construction d'un circuit de 20 pièces (temps et nombre de clics).

---

## 12. Liste complète des manquements

Légende « Nature » : **B** bug · **P** incohérence physique · **L** limitation d'architecture · **M** fonctionnalité manquante · **E** ergonomie · **C** choix de conception discutable · **F** finition.
« Statut réel » : **✔** fonctionne · **~** fonctionne sous conditions · **⚠** fonctionne techniquement, mauvaise expérience · **✘** ne fonctionne pas comme attendu.

Chaque fiche suit les 9 points demandés : *(1) comportement actuel (2) attendu (3) pourquoi insuffisant (4) systèmes/fichiers (5) nature (6) conséquence joueur (7) direction (8) risques/dépendances (9) vérification*.

### PH-1 — Gravité = signe binaire sur Y ; trois régimes de contact disjoints **(P0)** · L/C · ✘
1. `gSign` ±1 sur Y ; sol (champ de hauteur), ruban (courbe guidée), air (lacet/tangage). 2. Un repère de contact unique : « bas » = −normale tant qu'il y a contact ; inversion automatique ; retour doux au monde en vol. 3. Chaque nouvelle orientation exige une pièce ruban faite main et ses hacks (`SIDE_*`, `autoFlip`, `minU`) ; murs, plafonds, vrilles se comportent différemment.
4. `physics.js` (`_stepCore`, `_roadContact`, `_flyAir`), `physics/ribbon.js` (`_ribStep`), `ribbons.js`, `pieces.js`, `track/surfaces.js`. 5. Architecture + conception. 6. Comportements incohérents d'une orientation à l'autre (§4.3), pièges de création, impossibilité de trajectoires libres.
7. Option A (§4.4), après l'option C. 8. `PHYS_VER`, serveur, 72 temps d'or, médailles, empreinte, corpus ; « Cristal Fêlé » repose sur la traversée des dalles inversées. 9. Suite de scénarios « même descente, sol/mur/plafond/inversée » aux mêmes chiffres de vol ; `phys-fingerprint` ; goldens.

### PH-2 — Vrille sans « Inversion de gravité » : chute de 26 m, aucun avertissement **(P0)** · B(conception)/E · ✘
1. Fin de vrille inversée, `gSign` = 1, `grounded=false`, chute de 26 m puis hors piste [MESURÉ e11] ; **aucun message** (la liste des décrochages `loopFall` est vide : la chute passe par `_ribEnd`, pas par `_ribDetach`, donc le texte « Décroché » n'apparaît pas). 2. La gravité suit la route comme pour `tr13s`. 3. Piège silencieux ; seul `TW.f` fonctionne, connu seulement des auteurs. 4. `pieces.js` (`twist` sans `autoFlip`), `physics/ribbon.js:183` et `_ribEnd`, `editorTools.js:checkTrack`. 5. Conception + validation manquante. 6. Un créateur place une vrille, la voiture « tombe » sans raison compréhensible ni explication à l'écran. 7. `autoFlip:true` sur `twist` + garde-fou `checkTrack` (erreur « pièce qui retourne la voiture sans inversion »). 8. Modifie `TW` sans `.f` uniquement : les 2 circuits officiels (`TW.f`) doivent rester **identiques au bit près** (test). `PHYS_VER` +1. 9. `start S2 TW S2^ TWB S2 finish` doit finir ; empreinte des circuits officiels inchangée.

### F-1 — Le moindre contact de bordure détruit l'inertie **(P0)** · C/P · ⚠
1. **[MESURÉ e7]** gaz tenus, volant neutre : 2° à 200 km/h → 198 km/h au contact, **51 km/h 0,5 s plus tard**, puis **≈ 23 km/h, et la voiture reste collée** à ce régime tant que le joueur ne braque pas (contact 7,5 s sur 9) ; 5° : 154 → 34 → 20 km/h ; 10° : 101 → 23 km/h. Rotation induite jusqu'à 2,5 rad/s, moteur à 30 % pendant 0,2–0,8 s.
   Cause : `wallScrape` 2,0 /s (−1,7 % par pas) + `wallLoss` 5 % par m/s d'impact (plafonné 65 %) + `wallSpin` + `stunT`. Équilibre rampant ≈ poussée moteur (14 m/s²) / 2 ≈ 7 m/s ≈ 25 km/h.
2. Un frôlement ralentit, ne ruine pas la course ; l'élan se conserve sur une tangente quasi parallèle. 3. Contredit l'objectif « exploiter l'inertie et la vitesse » ; transforme tout contact en reset de fait.
4. `physics/walls.js:_walls` (lit `CAR.wallScrape/…` directement, **pas `this.k`** : les profils Arcade/Simulation **ne peuvent pas** l'adoucir), `physics/specs.js`, `physics/ribbon.js` (même modèle sur ruban). 5. Choix de conception (« un mur se paie », 0.9.4).
6. Prudence extrême près des bordures, voitures « emprisonnées » à 22 km/h, trajectoires larges, peu d'audace. 7. Frottement **proportionnel à l'angle d'incidence** (composante normale seule paie), scrape en fonction de la pression réelle, plus d'équilibre rampant ; garder une pénalité réelle aux chocs francs. Exposer les constantes `wall*` dans `K` pour les profils. 8. `PHYS_VER`, tous les temps (les 72 circuits ont des courses « plaquées »), coach (tests sensibles), médailles. 9. Banc e7 : frôlement 2°/5° → perte ≤ 10–15 % ; choc 45° → perte forte ; pas de plateau < 60 km/h gaz tenus.

### F-2 — Le dérapage est un freinage ; le mini-turbo est négligeable **(P1)** · C/M · ✘ (vs. promesse)
1. §6 : 1 s de frein en virage 150 → 23 km/h ; mini-turbo ≈ +6/+16 km/h ; gaz+frein ne dérape jamais ; dérive normale ≤ 5,8°. 2. Une technique qui *conserve* la vitesse, qu'on initie à vitesse élevée, tient la glisse au gaz, récompense en sortie. 3. Le système vendu (README, Académie) n'existe pas dans la pratique.
4. `physics.js:_driftState`, `_longitudinal`, `specs.js (driftRear, driftBrake, mtTime*)`, `academy.js`/`skills.js` (leçons). 5. Conception. 6. Aucune glisse à maîtriser ; peu de plaisir de conduite ; leçons d'Académie peu parlantes. 7. Frein progressif en virage (déséquilibre contrôlé) **ou** déclenchement par gaz+frein, tenue de glisse au gaz, boost proportionnel à l'angle et à la durée (de l'ordre de dizaines de km/h), perte de vitesse bornée. 8. `PHYS_VER` ; coach (« freinage ») ; leçons Académie ; mini-turbo comme critère d'objectif bonus. 9. Banc e3 : un drift de 1 s à 150 km/h perd ≤ 25 % et rend un turbo mesurable.

### F-3 — Le mur-ride est un tour de passe à seuil de vitesse invisible **(P1)** · L/C · ~
1. Appui fictif au-dessus de 108 km/h (`SIDE_MIN_SPEED`) ; en dessous glisse puis décroche (message « Trop lent ») ; bande de 24 m **sans bordure** ; un coup de volant de 0,3–0,6 s à 150 km/h la quitte en ~0,7 s [MESURÉ] ; sortie par le bord : **aucun message** (`fallWhy='crest'`). 2. Un mur qui tient comme un sol penché, avec un bord lisible. 3. Perte de contrôle « sans raison compréhensible ».
4. `physics/specs.js (SIDE_*)`, `physics/ribbon.js:_ribStep`, `hudMessages.js`, `trackGeometry.js` (rendu des bandes). 5. Conception. 6. Mur = obstacle de précision plus que de liberté. 7. À traiter avec PH-1 ; à court terme : afficher la vitesse mini sur la fiche de la pièce, un indicateur de maintien à l'écran, un rebord/garde-corps optionnel sur les bandes. 8. Dépend de PH-1 ; rebords = géométrie + physique (`PHYS_VER`). 9. Banc e13 : seuil de tenue constant, message pour toute sortie.

### PH-4 — Rubans non solides, entrée uniquement par les extrémités **(P1)** · L · ✘
1. Traversée sans collision d'un « Mur vertical » à 150 km/h [MESURÉ e15] ; retombée seulement sur face vers le haut [CODE]. 2. Pouvoir se poser sur / heurter une paroi ; entrer dans un tube ou un mur par le côté après un saut. 3. Limite fortement les trajectoires « libres » (objectif explicite).
4. `physics/ribbon.js:_tryEnterRibbon/_tryLandRibbon`, `physics/walls.js:_slabs`. 5. Limitation d'architecture. 6. Impossible de « sauter sur le mur » ; loopings traversables de côté (visuellement incohérent). 7. Contact de surface générique avec ruban (point le plus proche + normale), collision latérale. 8. Index spatial (`tilesAt`) à étendre ; coût CPU (budget 8,3 ms/pas) ; `PHYS_VER`. 9. Scénarios « saut sur mur/looping/tube » : atterrissage ou rebond, jamais traversée.

### PH-5 — Pas de looping latéral, pas de mur↔mur, pas de sol↔plafond direct **(P1)** · M · ✘
`flagAllowed('o')` exclut les loopings ; `ROLL_PASSAGES` sans 12/21/03/30. **Direction** : nouvelles pièces de transition (franches et douces), option d'orientation pour les loopings (plan du ruban pivoté), éditeur qui propose la pièce de raccord manquante. **Risques** : géométrie + maillage + `audit-pieces` + `PHYS_VER` ; ordre de sérialisation (`PIECE_ORDER` n'accepte que l'ajout). **Vérification** : `tools/audit-pieces.mjs` étendu, `test-piece-rotations`.

### CA-1…CA-5 — Caméra (voir §7) **(P1)** · F/E · ⚠
Anticipation, visée en vol/descente, sortie de mur, roulis des virages relevés. **Aucun risque de physique** (rendu seul). **Vérification** : captures avant/après sur les mêmes scénarios (`shots.mjs`) + test navigateur existant `test-camera.mjs` ; essai humain A/B.

### F-6 — Réception : gaz tenus en vol = −43 % **(P1)** · C/E · ⚠
Voir §6. **Direction** : découpler le tangage des touches de conduite (touches dédiées, ou assiette automatique vers la pente d'arrivée avec bonus pour l'ajustement actif), adoucir la pénalité (−43 % → ≤ −20 %), afficher l'écart d'assiette en vol. **Risques** : `PHYS_VER` ; objectifs « réceptions parfaites » et leçon d'Académie. **Vérification** : banc e19 : tenir les gaz ≤ −20 %.

### PH-6 — Air sans roulis, redressement visuel quasi instantané **(P2)** · L/F · ~
Orientation visuelle : lerp 0,08–0,2 /pas vers la verticale du monde ; aucune conservation du moment angulaire ni de l'orientation d'une surface quittée. **Direction** : orientation visuelle propre en vol (intégration d'une vitesse angulaire héritée du contact), purement visuelle. **Risques** : le fantôme doit rester identique (calcul déjà « par pas fixe », `_orient`). **Vérification** : captures de sortie de mur/looping.

### PH-7 — Toute cassure de pente est un saut dès 40 km/h **(P2)** · C/E · ⚠
§3.2. **Direction** : avertissement/auto-raccord dans l'éditeur (proposer `crv/cro/cdi/cdo` aux jonctions), et valeur par défaut « raccord doux » dans la famille « Ligne droite ». **Risques** : faibles (éditeur). **Vérification** : `checkTrack` détecte une jonction dure à vitesse typique.

### F-3b — Adhérence/freinage très élevés (6,4 g, 5,3 g) **(P2)** · C · ⚠ [HYPOTHÈSE]
Zones de freinage < 1 case ; virage serré franchissable à 113 km/h. À valider par un humain : si la conduite paraît « sur rails », réduire `latGrip`/`brake` ou introduire une perte d'adhérence progressive (profil « Classique+ » ou profil `pm` dédié). **Risque** : tous les temps.

### F-5 — Clavier tout-ou-rien, aide d'adoucissement = catégorie « assistée » **(P2)** · E/C · ~
`steerIn` 8 /s ; `steerCurve` n'agit que sur les commandes analogiques ; `smoothSteer` classe la course en « assisté » (hors classement principal, sans médailles). Un joueur clavier ne peut donc pas affiner son volant sans quitter la compétition. **Direction** : une montée progressive *selon la vitesse* intégrée au modèle (déterministe, enregistrée dans les commandes quantifiées) pour tous. **Risque** : `PHYS_VER`.

### ED-1…ED-6 — Éditeur (voir §9) **(P1 pour ED-1/ED-2, P2 pour ED-3/ED-4/ED-5)**
ED-1 : **validation de continuité physique** (vrille sans flip, route retournée raccordée au plat, raccords mur↔mur à fournir, rappel du seuil 108 km/h sur chaque pièce de mur). ED-2 : **outil « prolonger »** (suggestion de la pièce suivante au bout libre, cap et niveau déduits), tracé de chemin, bascule `Tab` de famille. ED-3 : **bulles d'aide contextuelles** au moment de la pose. ED-4 : lasso / sélection par type, restauration de la sélection à l'annulation, avertissement avant « coller sur le départ ». ED-5 : panneau du bas repliable, aperçu de route plus contrasté. **Risques** : faibles (éditeur, hors fermeture de la vérification). **Vérification** : `test-audit-editeur`, scénarios Playwright de pose.

### LD-1…LD-4 — Level design **(P2)**
LD-1 : 51 types jamais montrés par un circuit officiel → ajouter/rééquilibrer des circuits (virages montants, transitions douces, moto/bateau/deltaplane, pièces mobiles). LD-2 : dépendance au boost (≈ 20 % des pièces) à relativiser. LD-3 : **obstacles solides statiques** (bloc, rampe, mur) : fonction manquante (dans la fermeture de la vérification → `PHYS_VER`). LD-4 : **plateformes inclinées/courbes** et zones ouvertes plus riches.

### FIN — Finitions **(P3)** : persistance de la plaque de gravité (documenter), taille de la voiture en Poursuite, vibration de caméra à vitesse, cibles tactiles, lisibilité de l'aide des touches en course.

---

## 13. Classement P0 → P3

| P | ID | Titre | Difficulté | Risque régression | Systèmes touchés | Importance V1.0 |
|---|---|---|---|---|---|---|
| **P0** | PH-1 | Modèle de gravité/contact unifié | très élevée | très élevé | physique, ruban, pièces, serveur, records | **indispensable à une V1 cohérente** (au moins la version minimale PH-2) |
| **P0** | PH-2 | Vrille sans flip = piège silencieux | faible | moyen | `pieces`, `ribbon`, `checkTrack` | **indispensable** |
| **P0** | F-1 | Contact bordure : inertie détruite | faible (constantes) à moyenne (modèle) | élevé (tous les temps) | `walls`, `specs`, `ribbon`, coach | **indispensable** (objectif « inertie ») |
| **P1** | F-2 | Dérapage = freinage, mini-turbo nul | moyenne | élevé | `_driftState`, Académie, coach | fortement recommandé V1 |
| **P1** | F-3 | Mur-ride à seuil invisible, bande sans bord | moyenne | moyen | `SIDE_*`, HUD, géométrie | V1 si PH-1 reporté (au moins indicateurs) |
| **P1** | PH-4 | Rubans non solides, entrée par extrémités | élevée | élevé | ruban, index spatial | V1.x |
| **P1** | PH-5 | Passages et loopings latéraux manquants | moyenne | moyen | pièces, maillage, éditeur | V1 (nouvelles pièces) |
| **P1** | F-6 | Réception : gaz tenus −43 % | faible à moyenne | moyen | `_landing`, tangage | V1 |
| **P1** | CA-1…5 | Caméra (anticipation, vol, sortie de mur) | faible à moyenne | **nul** (rendu) | `race/camera.js`, `feel.js` | **V1 — meilleur rapport gain/risque** |
| **P1** | ED-1, ED-2 | Validation de continuité ; outil « prolonger » | moyenne | faible | éditeur | V1 |
| **P2** | PH-6 | Air sans roulis/redressement brusque | moyenne | faible | `_orient`, rendu | V1 si temps |
| **P2** | PH-7 | Cassures de pente = sauts | faible | faible | éditeur | V1 |
| **P2** | F-3b | Adhérence/freinage très élevés | faible | élevé | specs, profils | à décider après test humain |
| **P2** | F-5 | Clavier tout-ou-rien / catégorie « assistée » | moyenne | élevé | volant, aides | V1.x |
| **P2** | ED-3…5, LD-1…4 | Aide contextuelle, sélection, circuits, obstacles solides, plateformes | variable | faible à moyen | éditeur, contenu, obstacles | V1 (contenu/éditeur), V1.x (obstacles) |
| **P3** | FIN | Finitions listées | faible | nul | divers | après V1 |

---

## 14. Dépendances entre les corrections

```
PH-2 (autoFlip vrille + garde-fou) ──┐
F-1  (contact bordure)  ─────────────┼─► même fenêtre PHYS_VER (une seule invalidation des records, un seul redéploiement de submit-score)
F-2  (dérapage)  ────────────────────┤        │
F-6  (réception) ────────────────────┤        ▼
F-5  (volant)  ──────────────────────┘   recalcul : fingerprint → golden-temps → médailles → corpus → submit-score
                                                │
PH-1 (gravité/contact unifiés) ────────────────┘  (fait AVANT ou DANS la même fenêtre : sinon deux invalidations)
   ├─► F-3 (mur)    : indicateurs d'abord, refonte ensuite
   ├─► PH-4 (rubans solides) : réutilise le contact générique de PH-1
   ├─► PH-5 (passages, loopings latéraux) : nouvelles pièces ⇒ ajout en fin de PIECE_ORDER
   └─► CA / PH-6 (caméra, orientation en vol) : dépendent de la *normale* du contact (déjà exposée : `phys.n`) ; peuvent démarrer avant, se recaler après
ED-1 (validation) dépend de PH-1 pour définir les règles « correctes » ; une version provisoire (vrille/flip) peut sortir tout de suite.
Caméra et éditeur n'ont **aucune** dépendance vers la physique et peuvent partir en premier.
```

Contraintes transversales : un format de pièce ou de revêtement **ne se réordonne jamais** (ajouts seulement) ; toute nouvelle règle doit passer par la fermeture de la vérification serveur ; profils `pm` actuels ne multiplient que des constantes de `K`, **pas** les `wall*` (lues dans `CAR`).

---

## 15. Plan de développement proposé pour la V1.0

**Principe** : séparer ce qui ne touche pas à la physique (livrable immédiatement, sans invalider un seul record) de ce qui change la course (à regrouper dans **une seule** version de physique).

| Phase | Contenu | Touche `PHYS_VER` ? | Sortie |
|---|---|---|---|
| **0 — Cadrer** (1–2 j) | Protocole d'essai humain A/B (§11), choix des cibles de ressenti (valeur de perte à 2°/5°, drift attendu, seuil de mur), décision A/C pour la gravité, politique records (versions < 35 affichées mais non rejouables). Transformer `scratchpad/exp/*.mjs` en `tools/feel-*.mjs` (banc de non-régression du ressenti). | non | cibles chiffrées |
| **1 — Sans risque** (rendu + éditeur) | **Caméra** (CA-1…5) ; **validation d'éditeur** (ED-1 provisoire : vrille sans flip, route retournée raccordée au plat, seuil de mur) ; bulles d'aide (ED-3) ; avertissement jonction dure (PH-7) ; outil « prolonger » (ED-2) ; sélection (ED-4) ; message de sortie de mur (F-3) ; documentation du `gravMul` persistant. | **non** | amélioration immédiate du ressenti et de la création |
| **2 — Physique « ressenti »** (une version) | F-1 (contact), F-2 (dérapage), F-6 (réception), `autoFlip` de la vrille (PH-2), constantes `wall*` dans `K`. Mise à jour : empreinte, `golden-temps`, médailles, corpus, `submit-score` redéployé. | **oui (35)** | conduite qui conserve l'inertie, drift réel |
| **3 — Gravité/contact unifiés** | PH-1 option A (dans la même fenêtre que 2 si possible), PH-4, F-3 (mur réel), « Cristal Fêlé » redessiné. | **oui (même 35 ou 36)** | orientations cohérentes |
| **4 — Liberté de création** | PH-5 (nouveaux passages/loopings latéraux), plateformes inclinées, obstacles solides, nouveaux circuits officiels qui montrent le vocabulaire (LD-1). | oui pour pièces/obstacles | éditeur plus libre |
| **5 — V1.0** | Tests humains (clavier, manette, tactile), performances sur appareil réel, Firefox/Safari, passes son/vibration, gel des formats. | non | candidat V1.0 |

**Ce qui est indispensable à une V1 cohérente** : PH-2, F-1, la caméra (CA-1…3), la validation d'éditeur (ED-1), F-2 et F-6 (le jeu doit tenir ses promesses de drift et de saut), PH-5 au minimum pour les passages manquants.
**Ce qui peut attendre une mise à jour** : PH-4 (rubans solides), obstacles solides, plateformes inclinées, B (gravité à 6 axes), F-5, F-3b selon les essais humains.
*Une fonctionnalité intéressante n'est pas automatiquement une priorité* : le looping latéral, par exemple, n'a de sens qu'une fois PH-1 réglé.

---

## 16. Éléments impossibles à tester et incertitudes restantes

**Non testé (impossible ici)** : sensation réelle de conduite (aucun humain) ; **son** (moteur, klaxons, musique) ; vibrations manette/téléphone ; **images par seconde** sur un vrai GPU (WebGL logiciel SwiftShader, qualité graphique minimale : les captures sont pixellisées et la brume/profondeur ne sont pas représentatives) ; Firefox, Safari ; manette ; tactile ; multijoueur réel ; PolyTrack (aucune comparaison directe).

**Testé partiellement** : caméra (6 situations capturées, pas toutes les caméras ni tous les circuits) ; éditeur (ouverture, inventaire, validation par script, **pas** de session de pose à la souris) ; mur-ride (une seule configuration de pièces, un seul véhicule) ; surfaces (une seule vitesse d'essai par colonne) ; loopings (seuil sans moteur non isolé proprement).

**Non reproduit** : la voiture « attirée par une pente descendante » **au sol** (reproduite uniquement sur rubans orientés, §4.3) ; les défauts d'éditeur déjà cités par l'audit 0.9.59 (sélection non restaurée, collage sur le départ).

**Incertitudes à lever par un joueur humain** : le ressenti de « sur rails » (F-3b) ; le vrai poids de la punition de bordure (F-1) face au reste du jeu ; si le clavier tout-ou-rien est gênant (F-5) ; lisibilité de la zone de réception (CA-2) sur GPU réel ; lisibilité du verglas (§5).

**Limites de méthode** : essais sur voiture « classique » et profil Classique uniquement ; une seule pièce de chaque type par scénario ; pilote automatique utilisé pour le volant dans certains essais ; mesures de contact avec gaz tenus et volant neutre (le joueur qui braque s'extrait plus vite).

### Annexe — reproduire
Scripts (hors dépôt) : `scratchpad/exp/lab.mjs` (outils), `e1` (accélération/freinage), `e2` (virage), `e3` (dérapage), `e4/e5` (chicane/coup de volant), `e7` (bordure), `e9/e10/e11/e13` (looping, vrille, mur), `e12` (validateur d'éditeur), `e14` (décollage), `e15` (rubans non solides), `e16` (surfaces), `e17` (statistiques des 72 circuits), `e18` (descente sol/mur), `e19` (réception), `shots.mjs` (captures en jeu), `ed.mjs` (éditeur).
Lancer : `node scratchpad/exp/e7.mjs` (aucune écriture dans le dépôt ; `shots.mjs`/`ed.mjs` lancent le serveur statique du dépôt et Chromium).
