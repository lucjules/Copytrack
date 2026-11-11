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
