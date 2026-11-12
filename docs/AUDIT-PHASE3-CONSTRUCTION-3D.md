# Phase 3 — liberté de construction 3D (version 0.9.62, `PHYS_VER` 35 inchangé)

Objectif : qu'une orientation au sol ne limite plus la création. Ce document dit ce qui est désormais possible, pour quelles familles de pièces, ce qui a été mesuré, ce qui reste impossible et **pourquoi**.

**Contraintes tenues, vérifiées** : la physique n'a pas changé (`tools/phys-fingerprint.json` identique, 193 scénarios ; temps de référence des 72 circuits, médailles et corpus de compatibilité identiques) ; aucun circuit, aucune pièce, aucun code existant ne change ; mécanismes **génériques** (une règle de roulis, pas d'exception par pièce) ; rien n'est déployé, aucune donnée Supabase touchée, aucune demande de fusion.
Marques : **[VÉRIFIÉ]** exécuté et mesuré ici · **[HYPOTHÈSE]** non démontré.

---

## 1. Ce que le moteur savait déjà, et ce qui bloquait

Une route pouvait être posée à plat, à l'envers (`v`), ou sur un mur (`o` = 1 ou 2, **seulement** pour les lignes et les virages). Tout le reste (loopings, vrilles, tire-bouchons) n'existait qu'au sol. La physique des rubans, elle, est **déjà générique** : un ruban est une courbe `pos(u)` avec une normale, la voiture y roule quelle qu'en soit l'orientation. Le verrou était donc **la géométrie et l'éditeur**, pas le moteur : c'est ce qui a été levé.

## 2. Nouvelles possibilités

### 2.1 Huit orientations (au lieu de quatre)

Roulis ψ autour de l'axe de la route, normale = cos ψ · haut + sin ψ · droite. `tile.o` vaut désormais 1 à 6 (1, 2 : ±90° comme avant ; **3, 4 : ±45° « incliné »** ; **5, 6 : ±135° « surplomb »**), le plafond restant le drapeau `v`.

| id | Orientation | | id | Orientation |
|---|---|---|---|---|
| 0 | Sol | | 4 | Incliné gauche 45° |
| 1 | Mur gauche | | 5 | Incliné droit 45° |
| 2 | Mur droit | | 6 | Surplomb gauche 135° |
| 3 | Plafond | | 7 | Surplomb droit 135° |

La gravité suit la route (règle commune de la phase 2) : un surplomb à 135° est parcouru en gravité inversée, une route à 45° en gravité normale, sans exception.

### 2.2 Transitions progressives (16 nouvelles pièces)

`tr04s`, `tr40s`, `tr41s`, … `tr05s` : une case, roulis de 45° exactement entre deux orientations voisines de l'anneau 0 · 4 · 1 · 6 · 3 · 7 · 2 · 5 (dans les deux sens), tangente conservée. Elles s'ajoutent aux 16 transitions de 90° existantes : on peut aller **du sol au plafond par pas de 45°** et revenir. Ajoutées à la suite de `PIECE_ORDER` (l'index des circuits sauvegardés ne bouge pas).

### 2.3 Rubans roulés : loopings sur un mur, vrilles inclinées, tire-bouchons

Un ruban posé avec `o` est **son propre ruban à plat tourné de ψ autour de l'axe de son entrée** (`ribbons.js : rollWrap`) : position et normale tournent du même angle. Conséquences, toutes obtenues par la même règle :
- un **looping sur un mur** est un cercle dans le plan horizontal ; le décalage latéral du looping devient une **hélice** (5 niveaux pour le looping ordinaire, 10 pour le grand et le double, 15 pour les triples) ;
- une **vrille inclinée** commence à 45°, 90° ou 135° et finit un demi-tour plus loin ;
- les voies d'accès au sol d'un looping roulé deviennent des tronçons de ruban (la route est sur un mur).

Quelle pièce, quelle orientation — **décidé par la géométrie** (`rollFits`) : le ruban roulé doit tenir dans l'empreinte de la pièce et sa sortie doit tomber sur la grille (décalage en cases entières, hauteur en demi-niveaux). Aucune liste écrite à la main.

| Famille | Orientations proposées | Pourquoi pas les autres |
|---|---|---|
| Lignes, virages, pentes, courbes, descentes, tremplins (64 types) | **les 6 roulis** + plafond | — |
| Loopings (12 variantes) | **90°, du côté où le cercle tient** (↱ mur gauche, ↰ mur droit) | à 45° la sortie (22,6 m de côté) tombe hors de la grille ; du mauvais côté le cercle sort de la pièce |
| Vrille | **les 6 roulis** | — |
| Tire-bouchon (2 variantes) | 90°, 45°, 135° à gauche | à droite l'hélice sort de l'empreinte |
| Transitions (16 + 16) | aucun roulis propre | elles *sont* le changement d'orientation |
| Virages relevés, tubes, montée en L (`ramp90`, `wall`, `crest90`) | aucun | rouler un virage relevé le fait finir à la verticale ; un tube est symétrique par rotation ; les pièces en L sont déjà la famille verticale |
| Plateformes | aucune (voir §6) | surface sans extrémité |

### 2.4 Obstacles sur routes roulées

Un obstacle porte un **roulis `rz`** (multiple de 45°) autour de l'axe de la route : son haut est la normale de la route et **sa forme de contact tourne avec lui** (`obstacles.js : toLocalObs`, `physics/obstacles.js`). Avant, `rz` était refusé pour les obstacles : un obstacle posé sur un mur restait droit et sa boîte de contact ne correspondait plus à son dessin.
- **Éditeur** : l'obstacle visé sur un mur, un plan incliné, un surplomb ou le plafond se pose **tout seul à plat** sur la route (`editorPick.js : rayToRibbon`, qui voit aussi les rubans et les routes à l'envers, invisibles pour le rayon qui ne lisait que le sol). L'inspecteur règle le roulis à la main.
- Les piques, le bumper, le balancier, le marteau, le mur coulissant et le balayeur sont vérifiés dans les 8 orientations ; la route au sol garde exactement son comportement (aucun changement numérique quand `rz` est absent).

### 2.5 Éditeur

- **Orientation** : sept pastilles (Sol, Incliné ◣ / ◢ 45°, Mur gauche / droit, Surplomb ◤ / ◥ 135°) + Plafond, grisées quand la pièce ne les supporte pas ; l'aperçu de pose montre la pièce roulée ; ↔ (miroir) échange gauche et droite pour tous les roulis ; l'inspecteur propose les huit orientations.
- **Raccordement automatique** (outil **Prolonger**, touche P) : une orientation choisie qui n'est pas celle de la route insère **les transitions manquantes** (chemin le plus court, 45° comprises, plafond compris) puis pose la pièce, en **un seul pas d'annulation**. Rien n'est posé si le chemin ne tient pas (niveaux, pièces déjà posées) : la route reprend alors son orientation et **le message dit pourquoi**. Un looping « ↰ » au bout d'un mur gauche reçoit tout seul la transition qui ramène la route au sol.
- **Détection et correction** : le vérificateur compare les **roulis** (pas les normales brutes : une route en pente roulée à 45° n'est pas un raccord manqué) ; sol directement contre une route à 45° = erreur de raccord **qui nomme les transitions à intercaler** ; les cases mesurées CHUTE sont signalées (« inclinée à 45° à droite »…). Rien n'empêche de construire.
- **Script « tortue »** : `(` `)` incliné 45° gauche / droit, `{` `}` surplomb 135°, `<` `>` mur.
- Les 16 transitions, et la matrice, sont dans `docs/MATRICE-PIECES.md`.

## 3. Ce qui a été mesuré [VÉRIFIÉ]

**Matrice (`npm test`, `tools/matrice-pieces.mjs`)** : 128 pièces × **8 orientations**, chaque case est un vrai circuit (départ → transitions → pièce → transitions → arrivée) roulé par le vrai moteur à 80, 150 et 250 km/h. Totaux : OK 102 · SAUT 67 · v ≥ 80 : 26 · v ≥ 150 : 413 · v ≥ 250 : 8 · CHUTE 30 · RACCORD 4 · non proposé 318 · sans route 56.
- Route à 45° : **OK à toutes les vitesses** pour toute ligne, tout virage (la voiture reste plaquée par la pente, sans la vitesse minimale d'un mur).
- Murs, surplombs, loopings et tire-bouchons roulés : **à partir de 150 km/h** (la vitesse minimale de mur de 108 km/h est inchangée).
- Les **60 « RACCORD »** de la première version de la matrice 3D étaient une **confusion entre roulis et pente** (le roulis était lu sur la normale brute) : corrigée, il n'en reste que 4 (les triples loopings roulés descendent de 15 niveaux, hors des niveaux de la chaîne d'essai).

**Enchaînements (`tools/test-orientations-3d.mjs`, 34 tests)**, à 150 et 250 km/h au pilote automatique, vérificateur sans erreur : sol → 45° → mur → 135° → plafond → retour ; sol → mur droit → plafond (virage au plafond) → mur gauche → sol ; looping sur un mur gauche ; looping ↰ sur un mur droit ; grand et double looping sur un mur ; vrille inclinée puis tire-bouchon sur un mur ; looping au sol → vrille → looping sur un mur → tire-bouchon (familles différentes à la suite) ; pentes, descentes et courbes sur un plan à 45° ; tremplin sur un plan à 45° (vol et réception). Moto, profils Arcade et Simulation à 200 km/h. Déterminisme (deux roulages, mêmes nombres). Encode → decode → encode stable, anciens codes relus à l'identique.
**Obstacles** : piques mortelles dans les 5 orientations d'essai, la même route sans piques : aucun contact ; changement de repère exact (288 cas) ; chaque obstacle en contact dans les 8 orientations ; rayon de l'éditeur sur un mur, un plan à 45° et le plafond.

`npm test` : **93 fichiers, 1 213 vérifications, 0 échec** · lint propre · tests navigateur (Chromium) `test-browser`, `-i18n`, `-audit`, `-camera`, `-editeur` (nouveau test d'orientation et de raccord automatique) verts.

## 4. Compatibilité

- **Circuits existants** : aucun code ne change (corpus de compatibilité, temps de référence, empreinte physique identiques). `o` 1 et 2 gardent leur sens ; un obstacle sans `rz` se comporte à l'identique (aucun calcul ajouté).
- **Replays, records, fantômes** : inchangés, `PHYS_VER` reste **35**.
- **Nouveaux circuits sur un client plus ancien** : les 16 transitions de 45° (nouveaux types) sont **ignorées** (une pièce inconnue est sautée à la lecture) ; un roulis `o` de 3 à 6 sur une pièce ancienne est ramené à 0 (route à plat). Le circuit ne s'ouvre donc pas comme prévu : à mettre à jour avant de partager. Le décodage ne refuse pas les formats plus récents.

## 5. Opérations côté serveur (non faites ici)

1. **Redéployer `submit-score`** (`supabase/functions/submit-score/index.ts`, régénéré) : la vérification d'un temps rejoue le circuit avec le code du serveur ; une version plus ancienne sauterait les nouvelles pièces et refuserait les temps de ces circuits.
2. Aucune migration SQL, aucun changement de `PHYS_VER` : les records existants restent valides.
3. Tant que la fonction n'est pas redéployée, les circuits utilisant les nouvelles possibilités ne sont pas publiables avec temps vérifié.

## 6. Limites restantes et leurs raisons

| Limite | Raison |
|---|---|
| **Plateformes inclinées, courbes, verticales, retournées** : non faites | Une plateforme est une *surface* (champ de hauteur, sans entrée ni sortie) ; un ruban est une *courbe* à une dimension, entrée aux extrémités. Une plateforme roulée n'a pas de sens de marche et ne se capture ni par ses extrémités ni par l'atterrissage sur une largeur de 24 m. **Évolution proposée** : une pièce « nappe » (rectangle plan de normale et de largeur quelconques) avec une capture par les quatre bords, dans `physics/ribbon.js`, et un chemin d'atterrissage par distance au plan ; coût : un nouveau mode de contact, à ne pas faire sans ses propres essais. Les routes larges à 45° / mur ne s'en approchent pas (largeur fixée à 24 m). |
| **Transitions courbes** (rouler en tournant) | Les transitions roulent autour d'un axe droit. Rouler *et* tourner se compose (virage roulé + transition) mais n'existe pas comme pièce unique ; la transition douce 2×2 n'existe qu'à 90°. |
| **Loopings à 45° ou du « mauvais côté »** | Hélice de 22,6 m de côté (45°) : sortie hors grille ; ou cercle hors empreinte. Les rendre possibles demande des loopings de décalage de 16 √2 m, donc de nouvelles pièces. |
| **Virages relevés, tubes, pièces en L roulés** | Voir §2.3 : géométriquement vides de sens ou déjà verticaux. |
| **30 cases CHUTE** | Famille unique : montées et descentes **raides** (inclinaison 4, ou courbe 2) sur un mur, 45° ou 135°, et la rampe `cvd4` (16 étaient déjà documentées en phase 2). **[HYPOTHÈSE]** La voiture y passe sous 108 km/h dans la pente ou sort de la bande ; pas de correction sans changer la règle de vitesse des murs (identité du jeu). Le validateur les signale. |
| **Triples loopings roulés** | Descendent de 15 niveaux : il faut partir très haut (limite du circuit : 60 niveaux). |
| **Obstacles** : roulis seulement autour de l'axe de la route, par 45° ; pas sur les routes verticales (montée en L) | Une route verticale n'a pas de « gauche » ni de « droite » horizontale ; un obstacle libre en 3D demande une forme de contact orientée arbitrairement (hors périmètre). Balancier et marteau balaient dans le plan roulé : leur rayon de tri est élargi quand `rz` ≠ 0. |
| **Revêtements, bateau, deltaplane, multijoueur, fantômes sur les nouvelles pièces** | Non mesurés isolément : la matrice est sans revêtement et en voiture ; moto, Arcade et Simulation sont couverts par les enchaînements. Les revêtements « seulement sur du plat » restent refusés sur toute route roulée. |
| **Ressenti** | Tout est mesuré au pilote automatique ; aucun humain, aucune manette n'a conduit ces pièces ici. La visualisation de l'orientation est l'aperçu 3D de la pièce et la pastille choisie, pas un gizmo dédié. |
