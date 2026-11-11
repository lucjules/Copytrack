# Phase 2 — corrections physiques (version 0.9.61, `PHYS_VER` 35)

Quatre domaines de la physique corrigés **dans le noyau**, à partir des constats de [AUDIT-EXPERIENCE-0.9.59.md](AUDIT-EXPERIENCE-0.9.59.md) et de la phase 1
([AUDIT-PHASE1-CAMERA-EDITEUR.md](AUDIT-PHASE1-CAMERA-EDITEUR.md)). Ce document ne refait pas l'audit : il dit ce qui a été changé, ce que les mesures montrent avant et après, ce qui
reste, et ce qu'il faut encore faire côté serveur.

**Contraintes tenues, vérifiées** : un seul changement de `PHYS_VER` (34 → **35**, tout groupé) ; aucune pièce, aucun circuit intégré, aucun véhicule ni profil supprimé ; aucune
nouvelle famille de pièces (pas de loopings latéraux, rubans roulés, transitions mur↔mur, plateformes inclinées, obstacles solides) ; fonctions dans la fermeture serveur : additions,
multiplications, `sqrt` et `js/dmath.js` seulement (`test-determinisme`, et `npm run test:deno` : **même empreinte sous Deno** que sous Node, 193 scénarios) ; **rien n'est déployé, aucune
donnée Supabase touchée, aucune demande de fusion.**

Marques : **[VÉRIFIÉ]** exécuté et mesuré ici · **[HYPOTHÈSE]** non démontré.
Mesures : `node tools/mesures-physique.mjs` (circuits scriptés, commandes imposées, aucun hasard) ; `COPYTRACK_ROOT=<copie de la phase 1> node tools/mesures-physique.mjs` donne les
mêmes tableaux sur l'ancienne physique. « Avant » = commit `8241368` (0.9.60). Tous les nombres ci-dessous sont reproductibles.

---

## 1. Gravité — une seule règle pour toutes les pièces

**Constat [VÉRIFIÉ]** : la gravité ne suivait la route que pour les pièces qui portaient le revêtement « Inversion de gravité » ou un drapeau propre à la pièce. Une vrille posée sans plaque, une
transition retournée (mur → sol à l'envers), une transition vers le plafond : la voiture sortait à l'envers en gravité normale et tombait. Les 5 pièces testées une à une étaient « corrigées »
chacune à sa façon ; aucune règle commune.

**Correction** : `ribbonInverts(tile)` (`js/ribbons.js`) : une pièce-ruban dont la normale d'entrée et celle de sortie sont de côtés opposés (l'une vers le haut, l'autre vers le bas) **retourne
la voiture** ; la gravité suit alors la normale de la route (comme pour `s: 'flip'`). Aucune liste de pièces : la règle est géométrique, donc vraie pour toute pièce, toute orientation, tout
véhicule. Les loopings, tire-bouchons, tubes et virages relevés gardent leur gravité centripète réelle. La plaque « Inversion de gravité » reste un choix volontaire du créateur
(inchangée, testée : `test-contacts`). Le vérificateur de l'éditeur lit la même règle : l'erreur `invert` de la phase 1 et son bouton « Corriger » sont **supprimés** (ils ne pouvaient plus se
déclencher).

| Matrice pièces × orientations (112 × 4) | Avant | Après |
|---|---|---|
| Cases CHUTE | **29** | **16** |
| Vrille, au sol et au plafond | CHUTE | OK |
| `ramp90`, `wall`, `crest90` au plafond | CHUTE | SAUT |
| Transitions `tr01s…tr20l` au plafond (8) | CHUTE | v ≥ 150 km/h (mur) |
| Nouvelles chutes | — | **aucune** |

`tools/test-physique-corrections.mjs` vérifie la généralité : **toute** case (pièce × orientation proposée par l'éditeur) dont la pièce retourne la voiture n'est pas CHUTE, et il n'y a plus
que 16 CHUTE, toutes dans les familles décrites en §6.

## 2. Bordures, murs, contacts — une réponse à un impact

**Constat [VÉRIFIÉ]** (gaz tenus, volant neutre, tableau complet : §7) : toute touche coûtait une perte globale de vitesse **et** un frottement visqueux de 2/s : un frôlement de 2° à 100 km/h
passait de 156 à **48 km/h en 0,5 s**, puis restait **collé à 23 km/h** (contact de 6,8 s) ; 7 à 8 s de contact sur la plupart des cas. Un choc oblique de l'avant faisait tourner le nez *contre* le
mur ; le dégagement automatique ne tournait qu'un pas sur cinq quand la voiture était pressée (contact qui « clignote »).

**Correction** (`js/physics/contact.js`, utilisé par le sol `walls.js` **et** les rubans `ribbon.js`, mêmes constantes lues dans le véhicule : les profils peuvent les moduler) : tout est fonction de
`ap`, la vitesse d'**approche normale** (m/s).

| Régime | `ap` | Effet |
|---|---|---|
| **Frôlement** | < 4 | rebond sur la normale (restitution `wallE` 0,35, **nulle sous 2 m/s** : un simple appui ne rebondit pas) + frottement de Coulomb sur la tangente (`wallMu` 0,2) ; ni rotation ni encaissement : l'élan est conservé |
| **Modéré** | 4 – 12 | en plus : couple de rotation (≤ 2,5 rad/s) et encaissement (moteur et adhérence réduits, ≤ 0,6 s) croissants |
| **Violent** | > 12 | en plus : perte globale de vitesse croissante, plafonnée à 40 % |

Frottement visqueux de contact : 2/s → **0,12/s** (racler longtemps freine, sans clouer). Couple « nez écarté du mur » imposé (jamais accumulé : pas d'emballement). Dégagement automatique
qui retient le contact 0,2 s (le contact d'une voiture pressée clignote). Une glisse qui touche un mur ne se charge plus (voir §3).

| Gaz tenus, volant neutre | Avant (km/h : contact → +0,5 s → +2 s → +5 s) | Après |
|---|---|---|
| 100 km/h, 2° | 156 → 48 → 23 → 23 (collée 6,8 s) | **172 → 184 → 216 → 255** (0,02 s de contact) |
| 200 km/h, 2° | 198 → 55 → 23 → 23 (7,6 s) | **224 → 232 → 250 → 271** |
| 280 km/h, 5° | 182 → 43 → 20 → 22 (8,4 s) | **273 → 274 → 279 → 278** |
| 200 km/h, 10° (modéré) | 101 → 24 → 30 → 25 | **194 → 200 → 227 → 253** |
| 200 km/h, 45° (violent) | 52 → 0 → 2 → 27 | **69 → 59 → 119 → 205** |
| 100 km/h, 45° (violent) | 27 → 1 → 4 → 58 | **52 → 42 → 20 → 85** |

Ordre vérifié : la vitesse juste après le contact décroît à chaque incidence (2° < 5° < 10° < 20° < 45°) à 100, 200 et 280 km/h ; cinq secondes après n'importe quel contact la voiture roule à plus de la
moitié de sa vitesse d'approche (avant : 17 à 35 km/h dans 12 cas sur 15). Mêmes règles en gravité inversée (route au plafond). Volant tenu **contre** la bordure à 60–100 km/h, 15–60° : la voiture repart seule
(avant : ~10 s à 1 m/s sur le cas 30° / 100 km/h, tout juste sauvé par hasard à 11 s).

## 3. Dérapage — une mécanique de pilotage

**Constat [VÉRIFIÉ]** : le dérapage n'existait presque pas comme technique. Il fallait **lever les gaz** ; le frein restait entier pendant toute la glisse (150 → 23 km/h en 1 s) ; sans glisse
tenue, la voiture n'avait que deux états (sur rails ≤ 6° ou tête-à-queue > 50°) ; l'ancien mini-turbo se chargeait en tournant sur place (cap −238° en 1,5 s, vitesse 27 → 9 m/s) et donnait
+3 à +6 km/h. Sur glace, moto, profil Simulation : aucun dérapage du tout dans le geste « frein bref + gaz ».

**Correction** (`js/physics.js` : `_driftState`, `_driftAssist`, `_tires`, `_longitudinal`) :
- **Déclenchement** : frein + volant franchement tourné à vitesse suffisante (> 43 km/h), **avec ou sans les gaz** (frein bref pour décrocher l'arrière, puis gaz).
- **Entretien** : tant que le volant reste tourné la glisse dure (longtemps sous les gaz) ; le freinage y est quasi annulé (`driftBrake` 0,9) : la vitesse se conserve ; l'adhérence des deux
  essieux baisse (`driftGrip` 0,5, l'arrière en plus) : un virage plus large à vitesse conservée. Freinage limité par le cercle d'adhérence (`brakeCorner`).
- **Angle réglé par le volant** : un couple de rappel tient l'angle de glisse près de `driftAngle` (0,22 rad ≈ 13°) × le volant : volant à 60 % ≈ 16°, plein volant ≈ 22° (sous 50 % : pas de glisse), contre-braquage = la glisse
  se referme. Un coup de volant inversé charge brièvement l'arrière (survirage).
- **Sortie progressive** : volant relâché, la glisse se referme en ≈ 0,4 s sans claquer ni dépasser (−22° → −19 → −10 → −1 → 0).
- **Mini-turbo mérité** : charge pendant une glisse **contrôlée** (angle entre 3,5° et 46°, > 10 m/s, sans mur) ; niveau 1 ≈ 0,6 s, niveau 2 ≈ 1,4 s ; +20 puis +30 km/h pendant 0,8 puis 1,3 s ; un
  tête-à-queue ou un mur pendant la glisse ne donne rien. **Corrigé en cours de phase** : la lecture de l'impact par `_driftState` se faisait après sa remise à zéro (un mur ne cassait jamais la
  glisse) ; testé (`test-physique-corrections`).

| Volant à droite 1,7 s | Avant | Après |
|---|---|---|
| 200 km/h, frein bref + gaz | 135 km/h (68 %), dérive 8°, **pas de dérapage**, turbo 0 | **153 km/h (76 %)**, dérive 21°, dérapage 1,7 s, **turbo niveau 2 (+27 km/h)** |
| 160 km/h, frein bref puis gaz | 82 km/h (52 %), dérive 6°, turbo 0 | **103 km/h (64 %)**, dérive 22°, turbo niveau 1 (+19) |
| 160 km/h, gaz + frein | 23 km/h (14 %), dérive 48° (tête-à-queue) | **119 km/h (74 %)**, dérive 23°, turbo niveau 2 (+30) |
| 160 km/h, gaz seuls (pas de frein) | 144 km/h, dérive 6° | 145 km/h, dérive 6° : **pas de dérapage, inchangé** |
| 160 km/h, glace, frein bref + gaz | dérive 2°, 96 %, rien | **dérive 23°, 94 % conservés**, turbo niveau 2 (+30) |

Tous les cas finissent proprement (dérive finale 0°, pas de tête-à-queue : cap ≤ 126° à 1,7 s). Profils, véhicules et revêtements gardent leur identité [VÉRIFIÉ] : Arcade glisse moins (13° contre 22°),
Simulation comme Classique (22°, turbo niveau 2) ; la moto garde 75 %, la glace 94 % (on glisse déjà) ; le revêtement **Dérapage** part toujours en glisse (85° gaz seuls : inchangé) ; le **Ralentisseur** freine toujours (25 %).

## 4. Sauts et réceptions

**Constat [VÉRIFIÉ]** : tenir les gaz (ou le frein) en l'air coûtait **−42 à −43 %** de vitesse à la réception (réception « ratée », tangage 1,4 rad) à 100 comme à 200 km/h : le tangage
divergeait sans borne, puis la pénalité de réception était à son maximum.

**Correction** (`js/physics.js : _flyAir`) : l'assiette au décollage est **conservée** (inertie) ; une faible stabilité aérodynamique la ramène vers la trajectoire ; près du sol elle s'aligne en partie sur la pente
de la route sous la voiture ; l'effet des gaz et du frein est un **compensateur borné** (`airTrim`), pas une rotation sans fin. La pénalité de réception (`_landing`) est inchangée : elle devient
proportionnelle parce que l'assiette l'est.

| Tremplin 22° | Avant | Après |
|---|---|---|
| 100 km/h, gaz tenus en l'air | 100 → 58 (**−42 %**), « bad », tangage 1,4 rad | 100 → 89 (**−11 %**), « ok », 0,38 rad |
| 200 km/h, gaz tenus | 198 → 112 (−43 %), « bad » | 198 → 172 (−13 %), « perfect » |
| 200 km/h, frein tenu | 198 → 112 (−43 %), « bad », 1,4 rad | 198 → 164 (**−17 %**), « ok », 0,59 rad |
| 200 km/h, frein bref | 198 → 112 (−43 %), « bad » | 198 → 172 (−13 %), « ok » |
| Aucune commande | 198 → 172 (−13 %), « ok » | inchangé |

Le frein tenu relève toujours le nez (0,59 contre 0,38 rad) et coûte un peu plus qu'à plat (−17 % contre −13 %) : la perte reste proportionnelle. Même comportement pour la moto ; le deltaplane plane toujours
(4,8 s en l'air à 150 km/h).

## 5. Interactions

- **Dérapage ↔ mur** : un mur touché pendant la glisse (`ap` > 3) remet la charge à zéro et supprime la récompense (testé à 120 et 160 km/h).
- **Mur ↔ gravité inversée** : mêmes constantes et même loi au plafond qu'au sol (test des cas 2°, 10° et 45°).
- **Dérapage ↔ saut** : abordé en glisse, un tremplin donne un vol fini et une réception non « ratée » (120 et 160 km/h).
- **Mur ↔ ruban** : le modèle d'impact est celui des rubans (rails de tubes, bancs) ; les circuits officiels passent tous (temps de référence : au plus −1,4 %, §8).
- **Mur ↔ dérapage ↔ dégagement** : la voiture pressée contre une bordure volant à fond repart seule (le dégagement retient le contact 0,2 s).
- **Vol ↔ gravité** : l'assiette en l'air utilise la surface/le plafond selon `gSign` (visé au sol ou au plafond).
- **Déterminisme** : deux exécutions donnent exactement les mêmes nombres ; même empreinte sous Deno.

## 6. Ce qui reste, et pourquoi

| Restant | Pourquoi / ce qu'on en sait |
|---|---|
| **16 cases CHUTE** : `cv2/murD`, `cv4/murG·murD`, `cvL2/murG`, `cvL4/murG·murD`, `cro4/murG·murD`, `cdi4/murG·murD` (montées raides roulées sur un mur) ; `cvd4/sol·murD·plafond`, `cvdL4/sol·murG·plafond` | **[HYPOTHÈSE]** Montées raides sur un mur : la voiture passe sous 108 km/h (`SIDE_MIN_SPEED`) dans la pente ou sort de la bande en haut. `cvd4`/`cvdL4` : cassure à 45° qui lance la voiture à toute vitesse. Les corriger demande de nouvelles pièces de raccord (hors périmètre) ou de changer la règle de vitesse des murs (identité du jeu). Le validateur les signale (`piece-fact`). |
| **Le dérapage reste plus lent que la trajectoire à l'adhérence sur un virage isolé** | [VÉRIFIÉ] virage de 90°, porte à 150 m : adhérence 3,68 s, dérapage 4,33 s à 140 km/h (+18 %) ; vitesse à la porte 199 contre 206 km/h. L'adhérence arcade de la voiture est telle qu'elle n'a pas besoin de glisser ; le mini-turbo (+20 à +30 km/h pendant ~1 s) ne compense qu'une partie. **Choix assumé** : ne pas rendre le dérapage plus rapide que l'adhérence (il ne doit pas devenir la seule bonne façon de tourner) ; il vaut sur surfaces glissantes, en enchaînement, et pour le mini-turbo. À arbitrer par des essais humains. |
| Choc de plein fouet : voiture nez au mur ≈ 1 s avant que le dégagement ne la pivote ; 100 km/h à 45° : 20 km/h pendant ~2 s | [VÉRIFIÉ] mesuré. Choc violent (20 m/s d'approche) : la punition est voulue ; la voiture ne reste plus clouée (85 km/h à +5 s, contre 58 avant, mais encore 6 s de contact). |
| Contact des rails de rubans mesuré **indirectement** seulement | Les circuits officiels et `test-pentes-murs` passent ; aucun banc isolé de graze sur rail de ruban (les murs de transition n'ont pas de rail : la voiture en sort par le côté, comportement de la phase 1). |
| Dérapage en gravité inversée, sur un bateau dans l'eau, en v2, sur plateformes inclinées : non mesurés isolément | Le code est partagé (`_upSign`), les mesures ci-dessus couvrent voiture, moto, glace, ralentisseur, Dérapage, profils Arcade / Simulation. |
| Textes de l'Académie (exercice « Mini-turbo renforcé ») | Ils décrivent encore « volant à fond ». Le geste d'un joueur est maintenant « frein bref + volant, puis tenir en suivant la route » (voir `tools/test-skills.mjs`) ; textes à reprendre avec des essais humains. |
| Toutes les mesures sont **scriptées** | Aucun humain, aucune manette n'a joué cette physique ici ; le ressenti (sensibilité du volant en glisse, `driftAngle`, durée du mini-turbo) reste à valider. |

## 7. Tableau complet des contacts de bordure (avant → après)

Gaz tenus, volant neutre, km/h : au contact → +0,5 s → +2 s → +5 s ; durée du contact. (`tools/mesures-physique.mjs`.)

| Vitesse / incidence | Avant | Après |
|---|---|---|
| 100 km/h 2° | 156 → 48 → 23 → 23 · 6,8 s | 172 → 184 → 216 → 255 · 0,02 s |
| 100 km/h 5° | 112 → 27 → 20 → 21 · 8,0 s | 134 → 140 → 157 → 178 · 2,3 s |
| 100 km/h 10° | 83 → 23 → 15 → 17 · 8,3 s | 113 → 121 → 145 → 174 · 2,2 s |
| 100 km/h 20° | 49 → 2 → 29 → 125 · 1,4 s | 94 → 96 → 122 → 164 · 3,2 s |
| 100 km/h 45° | 27 → 1 → 4 → 58 · 1,5 s | 52 → 42 → 20 → 85 · 6,1 s |
| 200 km/h 2° | 198 → 55 → 23 → 23 · 7,6 s | 224 → 232 → 250 → 271 · 0,01 s |
| 200 km/h 5° | 154 → 37 → 20 → 22 · 8,3 s | 206 → 215 → 238 → 266 · 0,02 s |
| 200 km/h 10° | 101 → 24 → 30 → 25 · 1,4 s | 194 → 200 → 227 → 253 · 0,03 s |
| 200 km/h 20° | 66 → 0 → 12 → 18 · 7,2 s | 153 → 154 → 194 → 235 · 0,03 s |
| 200 km/h 45° | 52 → 0 → 2 → 27 · 5,6 s | 69 → 59 → 119 → 205 · 0,01 s |
| 280 km/h 2° | 240 → 61 → 22 → 23 · 7,9 s | 279 → 280 → 283 → 287 · 0,02 s |
| 280 km/h 10° | 95 → 14 → 30 → 97 · 1,9 s | 257 → 256 → 238 → 243 · 0,04 s |
| 280 km/h 20° | 91 → 0 → 11 → 19 · 7,3 s | 184 → 182 → 173 → 220 · 0,03 s |
| 280 km/h 45° | 72 → 0 → 2 → 35 · 5,3 s | 96 → 82 → 138 → 204 · 0,02 s |

## 8. Compatibilité et effet sur le reste du jeu

- **`PHYS_VER` 34 → 35.** L'empreinte des 193 scénarios est réécrite (`tools/phys-fingerprint.json`), identique sous Node et sous Deno.
- **Temps de référence** (pilote automatique, 72 circuits) : **22 circuits** bougent, au plus **−1,4 %** (`viaduc` 29,47 → 29,06 s), le suivant −0,5 % (`cristalfele`), moyenne −0,03 % ; les 50 autres
  sont identiques à 0,01 s. Les médailles, calées sur ce temps, restent dans leurs écarts habituels (au plus 2,0 %, **identique à la phase 1** : `montgolfieres`) ; les contrats de niveau passent (une
  tolérance sur trois vitesses voisines a été ajoutée à `tools/contract.mjs` pour une réception chaotique de `meduses` à 110 % exactement).
- **Corpus de compatibilité** (`tools/compat/corpus.json`) : les clés de classement, défis du jour, codes de circuit et de partage, lecture des réglages et fusion des sauvegardes sont **inchangés** ;
  seules les 5 courses enregistrées (commandes du pilote automatique, temps : l'une passe de 49 à 48,125 s), les codes de fantôme qui en dérivent et leur `pv` (33 → 35) sont recalculés.
- **Records, replays, fantômes** : liés à `PHYS_VER` ; ceux de la 34 restent **affichés** (temps) mais ne sont plus rejouables ni comparables. Rien n'est supprimé.
- **Multijoueur** : `NET_VER` inchangé (4) ; deux clients de physiques différentes ne se rejoignent pas (contrôle sur `PHYS_VER`, existant).

## 9. Tests

`npm test` : **92 fichiers, 1 180 vérifications, 0 échec** · `npm run lint` propre · `npm run test:deno` (déterminisme et empreinte sous Deno) · navigateur (Chromium) : `test-browser`, `-i18n`, `-audit`, `-camera`,
`-editeur` tous verts.

- Nouveau : **`tools/test-physique-corrections.mjs`** (23 tests sur le moteur réel : contacts par régime, ordre des pertes, jamais clouée, rotation, plafond, volant contre la bordure, 56 conditions extrêmes ;
  gravité pour toute pièce ; dérapage : déclenchement, rétention, angle, sortie, mini-turbo, mur, virage, véhicules / revêtements / profils ; sauts ; interactions ; déterminisme), qui lit **`tools/mesures-physique.mjs`**
  (banc de mesures, aussi utilisable sur l'ancienne physique).
- Adaptés (chaque changement est justifié dans le test) : `test-coach` (freinage avancé 140 → 100 pas, car le freinage limité par le cercle d'adhérence emmène la voiture hors tracé au bout d'une trajectoire rejouée telle quelle),
  `test-vitesse-et-murs` (anciennes constantes `wallLoss*`), `test-contacts` (bande de 30 cases : la voiture garde son élan et dépassait le *bout* de la bande de 12), `test-continuite` et `test-editeur-phase1`
  (règle de gravité commune : plus d'erreur `invert`, la vrille passe sans plaque), `test-browser-editeur`, `test-skills` (geste de mini-turbo : l'ancien faisait tourner la voiture sur place),
  `test-vehicles2` (le moteur v2 se mesure sur la moto ; le test du redressement ne finit plus de plein fouet dans la bordure), `test-determinisme` (`datan2`).
- Outils : `tools/lab.mjs` (journal des réapparitions), `tools/contract.mjs` (tolérance de voisinage).

## 10. Opérations serveur restant à faire — **non faites ici**

1. **Redéployer la fonction `submit-score`** à partir de `supabase/functions/submit-score/index.ts` (régénérée dans ce dépôt, `PHYS_VER 35` dedans), à la mise en ligne de cette version. Sans cela le serveur
   rejoue l'ancienne physique et refuse les nouveaux temps (« serveur d'une autre version »), et inversement une fonction à jour refuse les clients de la 34.
2. Aucun changement de base : aucune migration SQL, aucune donnée à toucher. Les records de la 34 restent en base avec leur `pv` ; ils ne sont ni supprimés ni migrés.
3. Après la mise en ligne : rejouer un record de la 35 de bout en bout (course → enregistrement → classement) et vérifier qu'une course de la 34 est refusée avec `versionMismatch`.
4. **Tant que la fonction n'est pas redéployée, cette version ne doit pas être considérée comme prête pour la production.**
