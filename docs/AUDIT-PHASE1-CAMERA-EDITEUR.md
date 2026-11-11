# Phase 1 après l'audit d'expérience — caméra, éditeur, matrice des pièces (version 0.9.60)

Compte-rendu de la première phase menée à partir de [AUDIT-EXPERIENCE-0.9.59.md](AUDIT-EXPERIENCE-0.9.59.md), sur la branche `main` à jour (qui ne contenait que le rapport : **aucune
correction n'avait été intégrée depuis l'audit**, donc rien n'a été ré-introduit ni ré-implémenté).

**Contraintes tenues, vérifiées** : `PHYS_VER` reste 34 ; `git diff` vide sur `js/physics*`, `js/constants.js`, `js/raceLogic.js`, `js/simulation.js`, `js/tracks.js`, `tools/golden-temps.json`,
`tools/phys-fingerprint.json`, `supabase/` ; l'empreinte des 193 scénarios est identique (`npm test`) ; les temps de référence, médailles et le corpus de compatibilité sont inchangés ;
aucune fonction serveur, aucune donnée Supabase, aucun déploiement. La caméra n'est pas dans la fermeture de `js/verify.js` (test).

> **Mise à jour (phase 2, 0.9.61, `PHYS_VER` 35)** : la règle de gravité est devenue commune (toute pièce qui retourne la voiture fait suivre la gravité) ; le code `invert` du vérificateur et la
> correction en un clic de la vrille décrits ci-dessous **n'existent plus**, et la matrice passe de 29 à 16 cases CHUTE (voir [AUDIT-PHASE2-PHYSIQUE.md](AUDIT-PHASE2-PHYSIQUE.md)). Le reste de ce
> compte-rendu décrit l'état de la 0.9.60.

Marques : **[VÉRIFIÉ]** exécuté et mesuré ici · **[CODE]** lu, non exécuté · **[HYPOTHÈSE]** à confirmer par un humain / un GPU réel.

---

## 1. Problèmes de l'audit confirmés sur la version actuelle

| Constat de l'audit | Verdict | Preuve |
|---|---|---|
| PH-2 : vrille sans « Inversion de gravité » = chute silencieuse | **Confirmé** [VÉRIFIÉ] | matrice : `twist` au sol = CHUTE aux trois vitesses ; `checkTrack` ne disait rien |
| ED-1 : le vérificateur ne voit pas les continuités physiques | **Confirmé** [VÉRIFIÉ] | `checkTrack` → `[]` sur vrille sans inversion et sur sol → plafond direct |
| CA-1 : pas d'anticipation en virage | **Confirmé** [VÉRIFIÉ] | écart caméra / cap de la voiture : 17,8° à 150 km/h en virage |
| CA-3 : sortie de mur désorientante | **Confirmé** [VÉRIFIÉ] | roulis d'image par rapport au monde 0,3 s après la sortie : 31° (avant correction) |
| CA-6 : voiture trop petite à l'écran | **Confirmé, et cause identifiée** [VÉRIFIÉ] | largeur de la voiture 6,0 % → 3,5 % de l'écran de 100 à 280 km/h (distance 12,4 → 17,7 m) |
| ED-4 : annuler ne restaure pas le rectangle de sélection | **Confirmé** [CODE + test écrit avant la correction] | `histSel` ne rangeait que l'objet inspecté |
| ED-2 : pas d'outil « prolonger » | **Confirmé** [CODE] | pose case par case (le glissé existe, mais même pièce / même cap / même niveau) |
| ED-3 : règles implicites jamais dites à la pose | **Confirmé** [CODE] | aucune info-bulle sur la vrille, le seuil de 108 km/h, etc. |

## 2. Constats de l'audit corrigés / nuancés

- **CA-2 « la zone de réception n'est pas visible » : NON confirmé géométriquement** [VÉRIFIÉ]. Dans un saut de tremplin à 200 km/h la zone de réception projetée est dans le champ (y ≈ −0,1 à −0,16
  en coordonnées d'écran) avant la correction ; l'impression de « ciel seul » de la capture venait de la brume du rendu logiciel. La visée de réception a quand même été ajoutée (elle centre la
  zone), mais elle n'est pas présentée comme la correction d'un défaut démontré.
- **ED-5 « les panneaux prennent trop de place » : partiellement faux** [VÉRIFIÉ]. La palette occupe 42 % de la hauteur à 1280 × 720 et 40 % à 844 × 390, **mais elle a déjà un bouton de repli
  (▾) qui la ramène à 7 % / 13 %**. Le défaut réel est la découvrabilité de ce bouton, non traitée ici.
- Rien d'autre de l'audit n'était déjà corrigé.

## 3. Nouveaux problèmes découverts

1. **Retard de suivi de la caméra proportionnel à la vitesse** [VÉRIFIÉ] (non vu par l'audit) : le suivi horizontal exponentiel (12 /s) traîne de `v / 12` mètres (6,7 m à 280 km/h) en plus du recul voulu : la
   caméra passait de 12,4 m (100 km/h) à 17,7 m (280 km/h) de la voiture. C'est la vraie cause de « voiture trop petite à grande vitesse ».
2. **Le contrôle de raccord de roulis ne regardait que les pièces murales** (`joins.js`) [VÉRIFIÉ] : sol → plafond direct, plafond → arrivée au sol, etc. n'étaient jamais signalés.
3. **Les transitions posées à l'envers retournent la voiture sans gravité** [VÉRIFIÉ] : `tr10s`, `tr20s`, `tr10l`, `tr20l` (et `tr01s`, `tr02s`, `tr01l`, `tr02l`) avec l'option plafond sont CHUTE ; même famille que la vrille
   (pas de `autoFlip` : celui-ci n'existe que pour les transitions **vers** le plafond). La montée en L à l'envers (`ramp90`, `wall`, `crest90`) également.
4. **Un faux « OK » dans mon propre essai** [VÉRIFIÉ, corrigé] : une voiture envoyée en l'air en gravité inversée franchit la ligne d'arrivée et le chrono s'arrête (`RaceLogic` ne regarde pas la gravité).
   La matrice exige donc d'arriver posée et à l'endroit. *(Ce n'est pas un défaut ajouté : franchir la ligne en vol est permis ; mais à connaître pour les circuits à plaques.)*
5. **La pastille de l'éditeur criait pendant toute la construction** [VÉRIFIÉ par le test navigateur] : `checkTrack` classe « extrémité reliée à rien » en erreur, donc tout circuit non fini était rouge.
   Elle est maintenant « à vérifier » ; seuls les défauts de continuité certains sont « bloquants probables ».
6. **Virages descendants très raides (`cvd4`, `cvdL4`) : CHUTE au sol à toutes les vitesses** ; montées raides roulées sur un mur (`cv4`, `cvL4`, `cro4`, `cdi4`…) : CHUTE [VÉRIFIÉ au pilote automatique ;
   cause physique supposée : décollage à 45° et perte de vitesse sous les 108 km/h du mur — [HYPOTHÈSE]].
7. **51 pièces sur 116 absentes des 72 circuits officiels** : déjà dans l'audit ; la matrice donne leur état réel (voir §6).

## 4. Modifications réalisées

### Caméra (rendu seul)
- `js/camrig.js` (nouveau, pur) + `js/race/camera.js` : **anticipation** du virage (taux de lacet lissé × 0,16 s, plafonnée à 17°, nulle sous 29 km/h et en marche arrière) ; **compensation du retard de
  suivi** (75 %) ; recul et champ plus sobres (+1,6 m au plus au lieu de +2,5 ; +14° au plus au lieu de +18°) ; **visée qui suit la pente** ; **visée de réception** pendant un saut (trajectoire
  balistique prédite par lecture du circuit, mélange limité à 11° pour que la voiture reste dans le champ, hauteur +18 %) ; **sortie de ruban** : le haut de la caméra accompagne la voiture 0,08 s, puis
  rejoint l'horizon du monde en ≈ 0,6 s. Tout est mis à l'échelle par « Sensations » (0 % / animations réduites : aucune aide ajoutée).
- Non modifiés (et non revus faute de preuve) : caméra capot, caméras de replay, retournement de gravité (`camflip.js`, déjà soigné), caméra en mode ruban (suit la route).

### Éditeur
- `js/connect.js`, `js/continuity.js`, `js/pieceFacts.js` (généré), `js/extend.js` (nouveaux, purs) ; `js/editor/selection.js`, `palette.js`, `tools.js`, `history.js`, `js/editor.js`, `js/input.js`,
  `js/app/wiring.js`, `js/app/editorFlow.js`, `index.html`, `css/style.css`, `js/i18n/en/editor.js`.
- **Vérificateur de continuité** : voir §5. **Fenêtre « Problèmes du circuit »** (clic sur la pastille) : trois niveaux, où / pourquoi / conséquence / comment corriger, bouton « Voir » (recentre et fait clignoter),
  correction en un clic de la vrille (« Ajouter Inversion de gravité », annulable). Les 3 niveaux ne bloquent jamais la construction, le test ni la publication.
- **Outil Prolonger** (touche P, bouton ➜ ; configurable) : pose la pièce choisie au bout de la dernière pièce posée (ou de la pièce inspectée), au bon cap / niveau / roulis ; l'orientation de la route
  (mur, plafond) est reprise pour une ligne ou un virage ; le retour d'une vrille se pose à contresens ; refus **expliqués** (roulis, hors niveaux, case occupée, pièce sans route…).
- **Annuler / rétablir restaurent le rectangle de sélection** (rangé avec chaque état d'historique ; copie, donc non corruptible).
- **Aide à la pose** : en choisissant une pièce, une bulle (une fois par pièce et orientation) prévient (vrille : inversion de gravité ; mur : 108 km/h ; combinaison mesurée CHUTE).
- Pastille : ⛔ n  (bloquants probables), ⚠ n (à vérifier), ℹ n (conseils seuls) ; l'ancienne `orientationIssues` n'est plus affichée (le nouveau contrôle en est un sur-ensemble, test) mais reste exportée.

### Matrice
- `tools/matrice-pieces.mjs` : 112 pièces × 4 orientations, chaque case = un vrai circuit construit avec les transitions nécessaires, roulé à 80 / 150 / 250 km/h ; génère `docs/MATRICE-PIECES.md`,
  `tools/compat/matrice-pieces.json` (figé : toute évolution de physique ou de géométrie qui change un résultat fait échouer `test-continuite`) et `js/pieceFacts.js`.

## 5. Règles du vérificateur (`js/continuity.js`)

| Code | Niveau | Détecte | Remède proposé |
|---|---|---|---|
| `roll-mismatch` | bloquant (ou à vérifier si un seul côté est un mur incomplet) | deux pièces qui se touchent avec un roulis différent (sol/mur, mur G/mur D, endroit/envers) | quelle transition insérer, ou « il n'existe pas de transition directe : repasse par le sol » |
| `gravity` | bloquant | route abordée avec la mauvaise gravité (propagée depuis le départ, `placeAtStart` respecté : départ au plafond, règle « gravité inversée ») | revêtement Inversion de gravité / transition |
| `invert` | bloquant | pièce dont la sortie est à l'envers sans `autoFlip` ni revêtement Inversion (vrille, transition retournée…) | **correction en un clic** |
| `near-miss` | à vérifier | extrémités qui se font face à < 14 m sans se raccorder : écart de hauteur (en niveaux), de position, de cap — chiffré | monter / descendre (E / C), pivoter (R) |
| `piece-fact` | à vérifier | combinaison mesurée CHUTE par la matrice (hors pièce déjà expliquée par `invert` / `gravity` ou portant l'Inversion) | changer d'orientation / essayer avec « ▶ Ici » |
| `wall-speed` | conseil | début de route sur un mur : ≥ 108 km/h | prévoir un élan |
| `slope-break` | conseil | rupture de pente convexe : vitesse de décollage et temps de vol à 120 km/h | pièces « Courbe » à profil adouci |
| `free-end` (de `checkTrack`) | à vérifier | extrémité libre (déjà là, déclassée de « erreur » à « à vérifier ») | — |

**Précision mesurée** [VÉRIFIÉ] : sur les 72 circuits officiels **zéro erreur et zéro avertissement** (seulement des conseils) ; sur chaque case de la matrice, « OK / SAUT » ne produit ni erreur ni
avertissement et « CHUTE » en produit au moins un (test d'accord vérificateur ↔ moteur). *Limite* : `piece-fact` est dérivé de la même matrice, l'accord n'y est donc pas indépendant ; les règles
`roll-mismatch`, `gravity`, `invert`, `near-miss` le sont (géométrie pure), et la vrille construite sans inversion a été **roulée** : elle tombe.

## 6. Matrice de compatibilité — résumé (détail : [MATRICE-PIECES.md](MATRICE-PIECES.md))

Compte par famille (OK / SAUT = tient ; v≥ = tient à partir de 150 km/h ; — = non proposé par l'éditeur ; n/a = pas de route) :

| Famille | Sol | Mur gauche / droit | Plafond |
|---|---|---|---|
| Lignes, pentes, courbes (30 + départ et arrivée) | 14 OK, 15 SAUT, 1 v≥ | 27 v≥150, **2 CHUTE** (`cro4`, `cdi4`), 1 « — » | 10 OK, 14 SAUT, 6 v≥ |
| Virages (36) | 10 OK, 18 SAUT, 6 v≥, **2 CHUTE** (`cvd4`, `cvdL4`) | 31 v≥150, **4 CHUTE** (`cv2/4`, `cvL2/4`…), 1 « — » | 8 OK, 13 SAUT, 13 v≥, **2 CHUTE** (`cvd4`, `cvdL4`) |
| Loopings (12) | 12 v≥ (l'élan fait la différence) | — (non proposé) | 12 v≥ |
| Rubans (vrille, tire-bouchon, tubes, relevés, L, transitions) (27) | 7 OK, 2 SAUT, 17 v≥, **1 CHUTE** (`twist`) | — (non proposé) | 7 OK, 8 v≥, **12 CHUTE** (vrille, L, 8 transitions) |
| Bifurcations, plateforme, anneaux | n/a (voir raisons dans le JSON) | n/a | n/a |

Les colonnes « mur » ne contiennent que des `v≥150` : la chaîne comprend les transitions sol → mur, qui exigent 108 km/h ; ce n'est **pas** le comportement d'une pièce isolée.

### Nature de chaque incompatibilité (les 7 catégories demandées)

| Incompatibilité | Catégorie | Détail |
|---|---|---|
| Looping, tube, vrille, tire-bouchon, virage relevé, montée en L : pas d'orientation « mur » | **4 oubli du système de rotation / 5 géométrie** | `flagAllowed('o')` n'accepte que lignes et virages ; ces pièces ont leur propre repère de ruban : il manque une version « roulée » de chaque ruban (nouvelle géométrie : phase suivante, pas un réglage) |
| Départ / arrivée / checkpoint : pas de mur | **2 restriction volontaire** | un portique de checkpoint sur un mur n'a pas de sens physique défini |
| Mur : pas de bordure, pas de tunnel, pas de mouvement (`OPTION_CONFLICTS`) | **2 volontaire** | les rebords sortiraient sur le côté ; le tunnel et les mouvements supposent le champ de hauteur |
| Plafond permis pour TOUTES les pièces, mais 8 transitions + 3 pièces en L + vrille CHUTE | **6 physique** (gravité) | pas d'`autoFlip` sur ces pièces ; **correction physique** (`PHYS_VER`) : hors périmètre de cette phase |
| Pas de transition mur gauche ↔ mur droit, ni sol ↔ plafond (hors vrille) | **3 historique / pièce manquante** | `ROLL_PASSAGES` = 8 passages ; ajouter des pièces = nouvelle géométrie |
| `cvd4` / `cvdL4` au sol | **5 géométrie + 6 physique** | rupture à 45° : décollage à toute vitesse (docs/AUDIT-EXPERIENCE §3.2) |
| Pentes raides roulées sur un mur | **6 physique** | perte de vitesse sous 108 km/h (`SIDE_MIN_SPEED`) [HYPOTHÈSE sur la cause exacte] |
| Revêtements plats seulement (rebond, eau…) refusés sur courbes et murs | **2 volontaire** (`surfaceRule`) | non rouvert ici |
| Raccord sol ↔ plafond / mur ↔ mur direct | **7 raccord / validation** | désormais détecté et expliqué |
| Bifurcation, plateforme, anneaux : hors matrice | **non testable en chaîne** | la voie directe d'une bifurcation ne se prolonge que dans un circuit à deux voies ; plateforme et anneaux n'ont pas d'extrémité |

## 7. Tests exécutés et résultats

Tous exécutés sur le dépôt modifié ; chiffres de la dernière exécution complète (voir §10 du message de livraison pour l'horodatage).

| Suite | Résultat |
|---|---|
| `npm test` | **91 fichiers, 1 158+ vérifications, 0 échec** (88 fichiers / 1 108 avant la phase) |
| `npm run lint` | 0 erreur |
| `test-continuite` (nouveau) | raccords (toutes pièces), les règles du vérificateur, 72 circuits officiels, matrice figée, accord vérificateur ↔ moteur, circuit de 5 000 pièces < 3 s |
| `test-camrig` (nouveau) | 13 essais : signes, plafonds, entrées invalides (NaN, dt nul…), pente, visée de réception vs solution analytique (< 1,5 m), gravité inversée, sortie de ruban, **la physique est identique au bit près avec et sans caméra (3 000 pas)**, hors fermeture serveur |
| `test-editeur-phase1` (nouveau) | outil Prolonger sur toutes les familles, constructions complètes **roulées par le moteur** (au sol ; looping + mur + vrille ; la même sans inversion : tombe), annuler + sélection, aide, correction en un clic |
| `test-browser-camera` (nouveau, Chromium) | 5 essais : distance et taille, virage, saut, sortie de mur, looping / vrille. **3 échouent sur l'ancienne caméra** (vérifié en les rejouant sur `main`), le saut passe sur les deux |
| `test-browser-editeur` (nouveau, Chromium) | 5 essais : route déroulée au clavier (touche P), vrille + fenêtre + correction + Ctrl+Z, sélection restaurée, petit écran 640 × 360, circuit correct sans alarme |
| `test-browser` / `-i18n` / `-audit` | `-i18n` (9) et `-audit` (8) passent. `test-browser` (54 essais) : **54/54 à la première exécution complète** ; sur trois exécutions ultérieures **un essai a échoué à chaque fois, et ce n'était pas le même** (Race Hub ; « aides à la conduite » = attente de l'événement `prefers-reduced-motion`, que le code d'essai documente comme sensible à la charge). **`main` non modifiée échoue sur ce dernier essai dans le même environnement** [VÉRIFIÉ]. Instabilité d'environnement probable, mais **non prouvée pour Race Hub** (relancé seul il échoue ailleurs : il suppose l'état laissé par les essais précédents) |
| Empreinte de la physique, golden, corpus | inchangés (dans `npm test`) |

## 8. Problèmes restant à traiter

- **Découvrabilité** du repli de la palette (▾), lisibilité de la route à faible zoom (route sombre sur terrain orange) : non traitées, non mesurées sur GPU réel [HYPOTHÈSE].
- Sélection **non rectangulaire** / par type, « coller sur le départ le retire sans le dire » (audit 0.9.59) : non reproduit ni corrigé.
- **Messages du vérificateur en français seulement** : les phrases dynamiques (positions, pièces) ne sont pas traduites ; les titres, boutons, en-têtes le sont (`js/i18n/en/editor.js`).
- **Matrice** : voiture classique, sans revêtement ni obstacle, pilote automatique comme conducteur, une pièce par chaîne, trois vitesses de croisière ; elle ne dit rien d'un humain ni des enchaînements
  longs. Bifurcations et plateformes non testées en chaîne.
- `piece-fact` suit la matrice : un changement de physique le rend faux tant que `--update` n'a pas été relancé (le test le rappelle).
- Caméra : captures sur WebGL logiciel qualité minimale ; aucune mesure de fluidité ni de confort sur GPU réel ; les caméras Proche / Lointaine reçoivent les mêmes aides mais n'ont pas leurs propres tests.
- Toutes les corrections **physiques** listées en §3 (3, 6) et §6 : voir §9.

## 9. Limitations techniques (ce que cette phase ne pouvait pas faire sans toucher à la physique)

1. **`autoFlip` pour toute pièce qui retourne la voiture** (vrille, transitions et L retournées) : change le comportement de ces pièces → `PHYS_VER` + redéploiement de `submit-score` ; les circuits officiels
   avec `TW.f` doivent rester identiques (test à écrire).
2. **Rubans « roulés » sur un mur** (looping latéral, tube sur un mur…) : nouvelle géométrie, nouveau format de pièce (ajout en fin de `PIECE_ORDER`), maillage, `audit-pieces`, serveur.
3. **Transitions mur ↔ mur et sol ↔ plafond** : mêmes dépendances.
4. **Entrée dans un ruban depuis l'air** et collision des rubans : modèle de contact (PH-4 de l'audit).
5. **Contact de bordure, dérapage, réception** (F-1, F-2, F-6) : modèle de physique ; non touchés.

## 10. Risques de régression

- **Caméra** : visuels seulement. Risque = ressenti (plus d'anticipation, recul réduit) : réglable par « Sensations » ; seuils des tests navigateur resserrés mais mesurés sur WebGL logiciel.
- **Éditeur** : `_tileIssues` remplace `orientationIssues` (sur-ensemble, mêmes cas testés) ; `_restore` rafraîchit la barre de sélection seulement si la sélection change ; `histRect` est créé à la
  demande (les tests existants qui fabriquent une session sans lui passent) ; la touche **P** est nouvelle dans l'éditeur (reste « pause » en course).
- **Faux positifs du vérificateur** : mesurés nuls sur le contenu validé (72 circuits, cases saines de la matrice) mais **un circuit de joueur très inhabituel peut en déclencher** ; aucun niveau ne bloque.
- **Fichiers générés** : `sw.js`, `docs/MODULES.md`, `js/pieceFacts.js`, `tools/compat/matrice-pieces.json` ; à régénérer après toute évolution de physique.

## 11. Recommandations pour la phase suivante

1. **Décider la fenêtre `PHYS_VER`** : y regrouper `autoFlip` généralisé (supprime les CHUTE de §6 liés à la gravité), contact de bordure, dérapage, réception (audit F-1, F-2, F-6) pour n'invalider les records qu'une fois.
2. **Après chaque changement physique : `node tools/matrice-pieces.mjs --update`** ; la matrice mesurera d'elle-même ce qui est libéré (cases CHUTE → OK) et le vérificateur s'y alignera.
3. **Nouvelles pièces** (transitions mur ↔ mur, sol ↔ plafond, rubans roulés) : bénéficieront d'emblée de l'outil Prolonger (`placementsAfter` est générique) et du vérificateur.
4. **Test humain A/B** de la caméra (clavier, manette, tactile) avant de figer les constantes de `RIG`.
5. Éditeur : sélection par type / lasso, repli de palette découvrable, bulles d'aide pour les revêtements, traduction des phrases du vérificateur.
6. Circuits officiels qui montrent les pièces jamais utilisées (déjà l'audit LD-1) : la matrice dit lesquelles passent.
