# Procédures de test

Tout se lance depuis la racine du dépôt. **Rien n'est désactivé** : un test qui échoue est un défaut à corriger, pas à contourner.

| Commande | Ce que ça vérifie | Prérequis |
| --- | --- | --- |
| `npm run lint` | ESLint (règles du dépôt : pas de `Math.sin`… dans le noyau de simulation, variables inutilisées, `const`…) | Node, accès à npm (`npx eslint@10.1.0`) |
| `npm test` | 91 fichiers de test du noyau (physique, circuits, éditeur, comptes, cloud, multijoueur, serveur, interface) + vérification que les fichiers générés sont à jour | Node 22 |
| `npm run test:deno` | `js/dmath.js` et l'empreinte de la physique sous **Deno** (le moteur de la fonction serveur) : mêmes bits qu'avec Node | accès à npm (`npx deno@2.9.6`) |
| `npm run test:browser` | un vrai Chromium (WebGL logiciel) : parcours complet du jeu, éditeur, menus, tactile, multijoueur à deux onglets, accessibilité des boutons sur 5 tailles d'écran, puis la langue | Playwright 1.63 + Chromium (`npm install --no-save playwright@1.63.0 && npx playwright install chromium`) |
| `npm run test:sql` | les étapes `supabase/etape*.sql` (1 à 15, puis 15b et le retour arrière) sur un PostgreSQL local avec un faux schéma `auth` : RLS, droits, fonctions, limitation, et de la **concurrence réelle** (sessions `psql` simultanées avec entrelacements forcés : plafond de 2 000, meilleur temps, limitation de cadence). Le script échoue (code de sortie ≠ 0) si un test échoue | PostgreSQL (`psql`, `initdb`) |
| `node tools/phys-fingerprint.mjs` | la physique n'a pas changé sans que `PHYS_VER` change (193 scénarios) ; `--update` après un changement voulu | Node |

## Les essais par sujet

- **Physique** : `test-physics`, `test-vitesse-et-murs`, `test-ice`, `test-vehicles2`, `test-sim-params`, `test-determinisme`, `test-pieces-speciales` (verre, tapis, vent, tunnel…), **`test-physique-phase2`** (obstacles 60–340 km/h, obstacles sur rubans, mur, retours au checkpoint, verre sous le point de retour, volant inversé, 72 circuits × 4 000 pas au hasard). ; **`test-contacts`** (phase 3 : le vrai moteur pas à pas sur des contacts réels — verre, piques, obstacles fixes et mobiles, bordures, gravité inversée, aimants, checkpoints, téléportation, valeurs invalides, charge ; voir `docs/PHYSIQUE-CONTACTS.md`)
- **Éditeur** : `test-editor`, `test-pot-peinture`, `test-pick`, `test-groups`, `test-logique`, **`test-phase3`** (annuler / rétablir sans perte, pivoter / déplacer, pot de peinture borné et prévisualisé, logique, replays, circuits officiels, médailles).
- **Comptes, cloud, scores** : `test-account`, `test-sauvegardes-fuzz`, `test-codes-fuzz`, `test-submit-handler` (base simulée avec état et verrous : soumissions simultanées, version, limite fail-closed, publication vérifiée, collision de signature), `test-submit-fuzz`, `test-publication`, `test-ice`, **`test-phase4`** (sessions, code joueur, restauration face aux suppressions, convergence de deux appareils), `test:sql`.
- **Multijoueur** : `test-net`, `test-manche`, `test-rollback` (le prototype de rollback, qui n'est PAS branché), tampon d'interpolation dans `test-phase4`.
- **Interface** : `test-menu` (structure de l'accueil), `test-css`, `test-textes-et-style`, `test-i18n`, `test-browser`, `test-browser-i18n`.
- **Audit 0.9.59** : **`test-audit-physique`** (exploration aléatoire à graines fixes : 180 circuits, invariants à chaque pas, rejeu = course, recommencer = neuf ; sens des commandes sur toutes les pièces ; états bloqués ; points de retour), **`test-audit-editeur`** (8 400 opérations au hasard, structure et historique vérifiés après chacune ; niveaux ; groupes ; vérificateur ; codes fabriqués), **`test-audit-sauvegardes`** (suppression propagée entre appareils, stockage plein, affichage des temps), `test-browser-audit` (8 essais d'interface dans Chromium, à plusieurs tailles), `test-etape16-sql.sh` (étape SQL 16 proposée). Rapport : `docs/AUDIT-0.9.59.md`.
- **Phase 1 après l'audit d'expérience (0.9.60)** : **`test-continuite`** (raccords `connect.js`, vérificateur `continuity.js` sur 72 circuits officiels sans faux positif, matrice de compatibilité figée `tools/compat/matrice-pieces.json`, accord vérificateur ↔ physique sur chaque case), **`test-camrig`** (aides de caméra, et preuve qu'elles ne changent pas un bit de la physique), **`test-editeur-phase1`** (outil Prolonger, constructions complètes roulées au pilote automatique, sélection restaurée par annuler) ; navigateur : `test-browser-camera`, `test-browser-editeur`.
- **Phase 2 (0.9.61, `PHYS_VER` 35)** : **`test-physique-corrections`** (23 tests sur le moteur réel, via `tools/mesures-physique.mjs` : contacts par régime, ordre des pertes, jamais clouée, rotation, plafond ; gravité pour toute pièce ; dérapage : déclenchement, rétention, angle, sortie progressive, mini-turbo, mur, virage, véhicules / revêtements / profils ; sauts et réceptions ; interactions ; déterminisme).
- **Phase 3 (0.9.62)** : **`test-orientations-3d`** (34 tests : huit orientations, 16 transitions de 45°, familles de pièces roulables décidées par la géométrie, codes et scripts, enchaînements 3D au pilote automatique à plusieurs vitesses et véhicules, raccord automatique, vérificateur, obstacles roulés dans 8 orientations, rayon de l'éditeur) avec le banc `tools/chain3d.mjs` ; `test-browser-editeur` (orientation et raccord automatique).
- **Phase 4 (0.9.63)** : **`test-integrite`** (29 vérifications sur le vrai moteur, le vrai gestionnaire `submit-score` avec base simulée et un faux `localStorage` à quota : signature des circuits, lecture des codes sans perte silencieuse, sauvegardes (rechargement, duplication, suppression, stockage plein, restauration atomique), records et progression (versions de physique, fusion cloud), circuits modifiés / temps falsifiés / versions, simulation locale = rejeu serveur, parcours complet avec erreurs). Compte-rendu : `docs/AUDIT-PHASE4-INTEGRITE.md`.
- **Phase 5 (0.9.64, sécurité)** : **`test-securite-client`** (CSP, secrets, hôtes tiers, code dynamique, échappement des écrans en ligne) ; **`test-submit-handler`** et **`test-ice`** (identité du jeton, corps hostiles, fuites, CORS, délais et 503) ; **`tools/test-securite-sql.sh`** (PostgreSQL requis, `npm run test:sql`, CI : base façon Supabase, attaques sous les rôles `anon` / `authenticated`, concurrence ; `AVANT=1` pour le rejouer sans l'étape 17). Compte-rendu : `docs/AUDIT-PHASE5-SECURITE.md`.
- **Déploiement du serveur** : **`test-build-stamp`** (empreinte de build de `submit-score/index.ts` valide ; GET d'état ; le script `tools/check-deployed.mjs` lancé contre un faux serveur : empreinte identique = ok, fonction d'avant le contrôle ou autre code = ÉCART, code de sortie 1). Il manquait : `check-deployed` ne comparait que `physVer`, et une fonction périmée passait pour « ok » quand la physique n'avait pas changé.
- **Nouvelles pièces, étape 1 (0.9.68)** : **`test-etape1`** (chicanes : géométrie exacte, raccords, langage `ZR` / `ZZR`, vitesses de passage, famille ; panneaux ; styles de portique hors signature, portiques sans bordures ; piliers et poutres solides : choc, passage dessous, coup de tête au-dessus d'une bosse, dessus porteur, signature, index, jamais masqués).
- **Nouvelles pièces, étape 2 (0.9.69)** : **`test-etape2`** (murs pleins, mur courbe sans trou ; plaques : formes, sol, bordures (signature, code, éditeur), voiture retenue par une bordure ou qui tombe sans, scripts `[plate3]*10`, rendu, plateforme inchangée ; blocs : bloc, dalle, arche, cale, cale raide et pyramide qui se montent, pente du dessus).
- **Nouvelles pièces, étape 3 (0.9.70)** : **`test-etape3`** (largeur de route : distance au bord exacte, sol et bordure à la bonne largeur, voiture retenue à 6 m, scripts `N` / `NI` / `NO` / `WI` / `W` / `WO`, vérificateur, options, famille, rendu à la bonne largeur).
- **Nouvelles pièces, étape 4 (0.9.71)** : **`test-etape4`** (carrefours : distance à la chaussée exacte, bouts et raccords, circuit en 8 par un seul croisement, toutes les façons de traverser un T, voiture retenue du côté fermé, options, famille, rendu).
- **Nouvelles pièces, étape 5 (0.9.72)** : **`test-etape5`** (sommet de looping : géométrie, raccords ; looping modulaire de 0 à 6 murs fait sans toucher, trop haut pour l'élan : la voiture retombe ; tube en virage parcouru dans le tube ; rendu).
- **Wiki (0.10.12)** : **`test-wiki`** (`wiki/index.html` identique à la génération `npm run wiki` ; le bouton de l'accueil et l'entrée du panneau Créer y mènent ; données, cartes des 72 circuits et images présentes ; aucun script extérieur).
- **Nouvelles pièces, étape 6 (0.9.73 ; 0.9.74 puis 0.10.1 à 0.10.11 : les 72 circuits)** : **`test-etape6`** (RÈGLE des circuits refaits, chapitre par chapitre, liste `REFAITS` : au moins 12 nouveautés dont 6 pièces de route, de 3 familles au moins, par circuit ; les 9 familles sur chaque chapitre, recensées par `tools/nouveautes.mjs` ; les pièces nouvelles sont sur le tracé ; le pilote finit chacun sans choc en 45 à 85 s, l'Atelier en 25 à 45 s).
- **Essais croisés** : **`test-croises`** — verre × obstacles mobiles × gravité inversée × aimant × volant inversé × checkpoints × groupes logiques × replays × circuits personnalisés × vérification des scores × sauvegardes de deux appareils × invité → compte.

## Rejouer un essai précis

`node tools/test-<nom>.mjs` ; `PW_ONLY="<texte>" node tools/test-browser.mjs` ne lance que les essais navigateur dont le nom contient le texte (certains supposent l'état laissé par les précédents : lancer d'abord le premier lancement, « le jeu démarre »).

## PostgreSQL jetable pour `npm run test:sql`

```bash
mkdir /tmp/pgdata && chown postgres /tmp/pgdata
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /tmp/pgdata -A trust"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pgdata -o '-p 54329 -k /tmp' -l /tmp/pg.log start"
PGHOST=/tmp PGPORT=54329 PGUSER=postgres npm run test:sql
```

Le test crée et supprime sa propre base (`copytrack_sqltest`) : **jamais** une base de production.

## Limites connues des essais

- Le **projet Supabase réel** n'est pas testé (réseau, Auth, limites de débit, droits du rôle `service_role`) : le client est testé contre un faux Supabase en mémoire (`tools/fake-supabase.mjs`), le SQL contre PostgreSQL, la fonction `submit-score` contre un faux Supabase avec la vraie vérification de course.
- Le **WebRTC** est testé avec de faux `RTCPeerConnection` et, dans le test navigateur, entre deux onglets du même navigateur (`?net=local`) : pas à travers un vrai réseau, pas avec un relais TURN.
- Les essais navigateur utilisent WebGL **logiciel** : ils prouvent que le jeu s'affiche et réagit, pas ses images par seconde sur un appareil réel.
- Aucun humain n'a rejoué les 72 circuits avec le moteur actuel : les temps de référence viennent du pilote automatique (`tools/golden.mjs`).
