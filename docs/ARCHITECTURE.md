# Architecture

Copytrack est un jeu de course contre-la-montre dans le navigateur : un **site statique** (HTML + modules JavaScript, three.js inclus dans `js/vendor/`),
**sans étape de compilation**, plus un petit serveur (Supabase) pour les classements, la communauté, les comptes et les salons multijoueurs.
Ce document explique comment les morceaux s'emboîtent. L'index de tous les fichiers, avec leur rôle, est dans [MODULES.md](MODULES.md) (généré) ; l'historique des
versions dans [../CHANGELOG.md](../CHANGELOG.md).

## Les quatre idées à connaître

1. **La physique est une fonction déterministe des commandes.** Pas fixe de 1/120 s (`DT`), aucune entrée autre que (volant, gaz, frein, retour au checkpoint) à chaque pas.
   Rejouer les commandes redonne exactement la même course : c'est ce qui permet les **replays**, les **fantômes**, et la **vérification des temps par le serveur**
   (il rejoue la course enregistrée avant d'accepter un temps).
2. **Le même code tourne partout.** Le noyau de simulation (voir plus bas) n'a ni rendu ni DOM : il est exécuté par le navigateur (course, fantômes), par la fonction serveur
   sous Deno (vérification) et par Node (outils, tests). Un seul pas de simulation, `Simulation.step`, sert à tous.
3. **Les nombres doivent être identiques d'un moteur JavaScript à l'autre.** ECMAScript laisse chaque moteur approximer `Math.sin`, `Math.atan2`, `Math.exp`, `Math.pow`,
   `Math.hypot`… : leur résultat peut différer au dernier bit, et la moindre différence est amplifiée par les collisions. Le noyau n'utilise donc que `+ − × ÷` et `sqrt`
   (arrondis imposés par IEEE 754) et les fonctions de `js/dmath.js` construites dessus. Voir « Déterminisme » ci-dessous.
4. **`PHYS_VER` lie tout ce qui dépend de la physique** (`js/version.js`) : records, replays, fantômes importés, classements, salons multijoueurs. Il change quand la physique, la
   géométrie des pièces ou les circuits intégrés changent ; un test échoue sinon (`tools/phys-fingerprint.mjs`).

## Les couches

```
index.html ─► js/main.js (App) ─► écrans, course, éditeur, garage ─► rendu (three.js)
                                        │
                                        ▼
        noyau de simulation (sans rendu ni DOM) ◄── js/verify.js ◄── supabase/functions/submit-score (Deno)
        simulation.js · physics.js (+ physics/) · raceLogic.js · autopilot.js · track.js · pieces.js · ribbons.js · dmath.js
```

| Couche | Fichiers | Rôle |
| --- | --- | --- |
| **Modèle** | `constants.js`, `pieces.js`, `track.js` (+ `track/`), `families.js`, `tracks.js`, `themes.js`, `decoData.js`, `career.js` | Pièces, circuit (grille, niveaux, règles de course), codes de partage, circuits intégrés, carrière. Sans rendu. |
| **Simulation** | `simulation.js`, `physics.js` (+ `physics/`), `raceLogic.js`, `autopilot.js`, `obstacles.js`, `ribbons.js`, `dmath.js`, `replay.js`, `verify.js`, `daily.js` | Une voiture, ses règles, ses réapparitions ; enregistrement et rejeu des commandes ; vérification serveur. **Sans rendu, sans DOM, déterministe.** |
| **Rendu** | `trackGeometry.js`, `trackMesh.js`, `geo.js`, `decos.js`, `decoPack.js`, `scenery.js` (+ `scenery/`), `carModel.js`, `particles.js`, `trail.js`, `skids.js`, `remoteCar.js`, `renderOptions.js` | three.js : maillages du circuit (par tronçons), décors, voitures, effets. |
| **Application** | `main.js` (+ `app/`), `race.js` (+ `race/`), `editor.js` (+ `editor/`), `inspector.js` (+ `inspector/`), `garage.js`, `ui.js`, `input.js`, `audio.js`, `music.js`, `quality.js`, `welcome.js` | Orchestration, écrans, éditeur, interface, commandes, son, qualité graphique. |
| **En ligne** | `config.js`, `online.js`, `account.js`, `cloudsave.js`, `net/` | Supabase (REST, authentification, Realtime), comptes, sauvegarde cloud, multijoueur WebRTC. |
| **Données locales** | `storage.js`, `profile.js`, `cosmetics.js` | Réglages, records, brouillons, profil (code joueur), catalogue visuel. |

### Familles de méthodes

Les grosses classes (`App`, `EditorSession`, `RaceSession`, `Scenery`, `Inspector`, `Track`, `CarPhysics`) sont découpées en **familles de méthodes** rangées dans un dossier de même nom
(`js/app/multi.js`, `js/editor/tools.js`, `js/physics/ribbon.js`…). Chaque famille est un objet `export const xMethods = { méthode() {…} }` que le fichier de la classe ajoute à son
prototype par `Object.assign(Classe.prototype, …)` : `this` est l'instance, comme dans une méthode ordinaire. Le fichier `shared.js` d'un dossier contient les constantes que
plusieurs familles utilisent. Les déclarations exportées d'un fichier restent dans ce fichier (son interface ne change pas). Ajouter une méthode : l'écrire dans la famille qui lui
correspond ; elle n'a rien à déclarer d'autre.

## Une course, pas à pas

`Simulation` (`js/simulation.js`) enchaîne, à chaque pas de 1/120 s :

1. *(retour demandé : touche R, ou commande « retour » d'un replay)* `rewind()` : le chrono, les checkpoints et le tour reviennent au dernier checkpoint, la voiture y est replacée avec son véhicule et sa gravité ;
2. `drive(commandes)` : l'horloge de la physique devient le chrono de la course (`CarPhysics.clock` : position des pièces mobiles et des obstacles), puis `CarPhysics.step` (sol, air, rubans, murs, obstacles) ;
3. `score()` : `RaceLogic.update` (checkpoints, tour, arrivée), suivi du hors-piste ; une réapparition automatique est demandée après 0,5 s hors piste ou en cas de noyade (`lost`).
   L'arrivée franchie l'emporte sur une réapparition du même pas.

`RaceSession` (course en direct) sépare 2 et 3 pour intercaler les sons, les particules et la caméra ; `GhostRunner` (fantômes **et** vérification serveur), la validation du défi du jour et les
outils (`tools/sim.mjs`, `tools/lab.mjs`) font `step()` d'un trait. Aucune de ces boucles n'a sa propre copie de l'ordre des opérations.

Les commandes d'un pas sont quantifiées (volant au centième, trois drapeaux : gaz, frein, retour) : c'est tout ce que contient un enregistrement (`InputRecorder`, `SHG1:` pour les fantômes partagés).

**Fantômes.** Un `GhostRunner` ne dépend pas du joueur : il garde l'historique de ses poses et la course en direct lit la ligne correspondant à *son* chrono. Un retour au checkpoint ou un redémarrage ne rejoue
donc pas le fantôme depuis le départ.

## Déterminisme

Règles pour tout fichier du noyau (la fermeture des imports de `js/verify.js` : `tools/test-determinisme.mjs` la calcule et la contrôle, ESLint aussi) :

- pas de `Math.sin`, `cos`, `tan`, `atan`, `atan2`, `asin`, `acos`, `exp`, `log`, `pow`, `hypot`, `random`… : utiliser `dsin`, `dcos`, `datan2`, `hypot2`… de `js/dmath.js` ;
- pas d'opérateur `**` : écrire `x * x` ;
- pas d'horloge ni de hasard (le défi du jour dérive d'une graine, la date UTC est une entrée) ;
- `abs`, `min`, `max`, `floor`, `round`, `trunc`, `sign`, `sqrt` restent permis : leur résultat est imposé.

`tools/phys-fingerprint.mjs` rejoue 161 scénarios (pilote automatique et commandes pseudo-aléatoires sur les 66 circuits, défis du jour, obstacles, pièces mobiles, bifurcation, revêtements, véhicules) et
condense l'état exact de la voiture (bits des flottants) en un hachage par scénario, enregistré dans `tools/phys-fingerprint.json`. L'empreinte doit être **identique sous Node, Deno et Chromium** : la CI
la recalcule sous Deno (`deno run -A tools/phys-fingerprint.mjs`) et dans un navigateur (`tools/test-browser.mjs`).

### Changer la physique (la procédure)

1. Modifier le code, puis incrémenter `PHYS_VER` dans `js/version.js`.
2. `node tools/phys-fingerprint.mjs --update` (nouvelle empreinte), `node tools/golden.mjs` (les temps de référence des 66 circuits ont-ils bougé ? `--update` si c'est voulu) puis `node tools/medals.mjs --check` (médailles).
3. `npm run build:function` et `npm run sw` (fichiers générés), `npm test`.
4. **Redéployer la fonction `submit-score`** : sans cela, le serveur rejoue l'ancienne physique et refuse les nouveaux temps. Les records d'avant ne sont plus rejouables (leur `pv` diffère) : ils restent affichés comme temps.

## Données et formats

- **Circuit** : liste de pièces sur une grille (`CELL` = 32 m, niveaux de 6,4 m), plus décorations et règles. Code de partage `SHW3:` + JSON en base 64 ; chaque pièce est un **type concret** (index dans `PIECE_ORDER`, qui ne fait qu'ajouter), `SURFACE_CODES` et `DECO_ORDER`
  suivent la même règle (un test garde leur empreinte). La **signature** d'un circuit (clé des classements) ignore le nom, la description, le thème et les couleurs. Détails : README, « Format des circuits ».
- **Clés de classement** : `b-<id>-<empreinte>` (circuit intégré), `daily-AAAA-MM-JJ` (défi du jour), `u-<signature>` (circuit de joueur, dont le code est fourni).
- **Stockage local** : `localStorage` sous le préfixe `shardway.*` (nom d'origine du projet, conservé pour ne pas perdre les sauvegardes existantes). Records : `shardway.rec3.<clé>` avec temps, commandes, `pv`.
- **Sauvegarde cloud** (comptes) : fusion par `cloudsave.js` ; invités : local seulement.

## Serveur

- **Supabase** : tables et règles de sécurité (RLS) dans `supabase/etape1…5-*.sql` (à lancer dans l'ordre, relançables ; testés sur PostgreSQL 16 : `npm run test:sql`), comptes décrits dans `supabase/COMPTES.md`, multijoueur dans `supabase/MULTI.md`.
- **Fonction `submit-score`** (Deno) : `server.ts` branche `handler.js` sur `Deno.serve` ; `handler.js` authentifie le pilote (jeton Supabase), limite la cadence et la taille, **rejoue la course** avec `js/verify.js`
  (même `GhostRunner` que les fantômes) et n'écrit le temps que s'il est confirmé à 0,5 ms. `npm run build:function` regroupe le tout en `supabase/functions/submit-score/index.ts` (un fichier autonome : Supabase
  refuse les imports depuis un site quelconque). La clé secrète n'est jamais dans le jeu. `tools/test-submit-handler.mjs` teste le gestionnaire avec un Supabase simulé.
- **Configuration** : `js/config.js` (URL du projet, clé publique, serveurs ICE / TURN du multijoueur), surchargeable par `window.COPYTRACK_CONFIG` sans toucher au code. Variables de la fonction : `ALLOWED_ORIGIN` (facultative).
- **Multijoueur** : Supabase Realtime ne sert qu'à se trouver ; les positions (20 Hz) passent en WebRTC pair à pair (`js/net/`). Les adversaires sont des voitures fantômes sans collision.

## Rendu

- Le maillage du circuit est **statique et fusionné par tronçons** de 4 × 4 cases (`TrackView` dans `trackMesh.js`) : une modification ne reconstruit que les tronçons touchés (signature par tronçon, voisins compris car les piliers en dépendent). Pièces mobiles,
  dalles de verre, obstacles, plaques et lampes sont des objets à part, recréés à chaque reconstruction.
- `trackGeometry.js` construit la forme 3D de chaque pièce dans un `GeoBuilder` (triangles non indexés, couleurs par sommet, ombrage facetté).
- Réglages de rendu partagés (décorations masquées au profil Potato, budget de lumières, daltonisme) : `renderOptions.js`.
- Qualité graphique : `quality.js` (profils, banc d'essai au premier lancement, réduction automatique). Menus limités à 30 images/s.

## Chargement et hors ligne

`index.html` précharge les modules du démarrage (`<link rel="modulepreload">`, bloc généré par `tools/gen-sw.mjs`) ; l'éditeur est chargé à la première ouverture (`import()`). `sw.js` (service worker, généré) met le jeu en cache pour jouer
hors ligne ; il est « réseau d'abord » pour récupérer les mises à jour ; son nom de cache est une empreinte du contenu.

## Fichiers générés (à ne pas modifier à la main)

| Fichier | Généré par | Vérifié par |
| --- | --- | --- |
| `sw.js`, bloc `modulepreload` de `index.html` | `npm run sw` | `tools/check-generated.mjs` (`npm test`), CI |
| `supabase/functions/submit-score/index.ts` | `npm run build:function` | CI (`git diff --exit-code`) |
| `tools/phys-fingerprint.json` | `node tools/phys-fingerprint.mjs --update` | `npm test`, CI (Node, Deno, Chromium) |
| `tools/golden-temps.json` | `node tools/golden.mjs --update` | `tools/test-niveaux.mjs` |
| `docs/MODULES.md` | `npm run docs` | `tools/check-docs.mjs` (`npm test`) |
| `docs/FICHE-ESSAI.md` | `node tools/fiche-essai.mjs` | — |

## Tests et outils

- `npm test` : `tools/run-tests.mjs` lance chaque `tools/test-*.mjs` dans son processus, en parallèle (~17 s), plus les contrôles (`check-generated`, `check-docs`, `phys-fingerprint`, `audit-pieces`, `sim` : les 66 circuits au pilote automatique).
  Un échec n'arrête pas les autres. Harnais commun : `tools/harness.mjs`.
- Par thème : `test-physics`, `test-vitesse-et-murs`, `test-pentes-murs`, `test-maniabilite` (physique, pentes, murs, plafond, véhicules), `test-familles`, `test-pieces-speciales`, `test-pot-peinture` (modèle de pièces, éditeur), `test-textes-et-style` (textes, CSS), `test-simulation` (pas de simulation, fantômes), `test-dmath` et `test-determinisme` (mathématiques et règles du noyau),
  `test-scale` (échelle, bifurcation), `test-circuit` / `test-registres` (modèle de circuit, ordres de sérialisation), `test-editor` / `test-pick` (éditeur), `test-contrats` (ce que l'inspecteur attend de l'éditeur, l'application de ses sessions, familles de méthodes sans doublon), `test-trackview` / `test-mesh` (maillage), `test-net` (multijoueur),
  `test-account` / `test-records` (comptes, records), `test-submit-handler` (fonction serveur), `test-niveaux` (les 66 circuits : contrat, profils, médailles).
- Hors `npm test` : `npm run test:browser` (Chromium via Playwright, ignoré s'il est absent), `npm run test:deno` (même physique sous Deno), `npm run test:sql` (PostgreSQL), `npm run lint` (ESLint).
- Atelier de level design : `tools/lab.mjs` (carte, profil de vitesse, typologie), `tools/contract.mjs`, `tools/medals.mjs`, `tools/golden.mjs`, `tools/difficulte.mjs`, `tools/maniabilite.mjs`.
- **CI** (`.github/workflows/test.yml`) : `test` (lint, tests, fichiers générés), `deno` (même physique que Node), `browser` (Playwright), `sql` (PostgreSQL 16).

## Limites connues

- La physique et les circuits ont été vérifiés par machine (pilote automatique, 161 scénarios, trois moteurs) mais **la sensation de conduite n'a pas été rejouée à la main** après le passage aux mathématiques déterministes (les temps de référence sont inchangés à 0,02 s).
- Navigateurs testés automatiquement : Chromium. Firefox et Safari n'ont pas été essayés ; le déterminisme ne dépend plus de leur bibliothèque mathématique, leur rendu et leurs particularités oui.
- Multijoueur : STUN seulement par défaut ; les réseaux qui bloquent le pair à pair (environ 10 à 20 % des paires) exigent un relais TURN, à configurer dans `js/config.js` (non fourni).
- Stockage local : `localStorage` (quelques Mo) ; pas d'IndexedDB.
- La fonction serveur doit être redéployée à la main après tout changement de physique (aucun déploiement automatique).
