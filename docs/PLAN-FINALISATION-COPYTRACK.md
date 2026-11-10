# Plan de finalisation de Copytrack

Document de suivi du chantier « remise à niveau complète » (branche `claude/practical-dirac-vtqom0`, repartie de `main` 0.9.46). Mis à jour à chaque étape.
Règles : ne rien supprimer d'utile, corriger les causes, un test de non-régression par correction, aucun test désactivé, rien fusionné dans `main` sans accord.

## État de départ (mesuré)

| Contrôle | Résultat |
| --- | --- |
| `npm test` (71 fichiers) | 895 vérifications, 0 échec |
| `node tools/test-browser.mjs` | 1 échec sur 2 courses de vitesse (voir Phase 5) |
| Essais aléatoires sur les 72 circuits (3 graines, 40 s, entrées aléatoires) | 0 NaN, 0 position aberrante, 0 vitesse > 430 km/h |
| Branches distantes | toutes déjà fusionnées dans `main`, sauf `affectionate-brown-2zsii3` (1 commit : lien « retour » vers un site d'hébergement, non repris) |

## Phases

| Phase | Contenu | État |
| --- | --- | --- |
| 1. Compréhension | architecture (`docs/ARCHITECTURE.md`, `docs/MODULES.md`), état mesuré, ce plan | fait |
| 2. Physique | obstacles inertes sur les rubans (looping, mur, tube) corrigés ; voiture coincée nez au mur (volant sans effet à l'arrêt) corrigée ; gravité au point de réapparition cohérente avec la route (anneaux) ; essais : obstacles 60–340 km/h, verre (voisines, empilées, plafond, ruban, retour, rejeu), volant inversé, aimant/accélérateur à l'envers, 72 circuits × 4 000 pas au hasard : aucun gel ni valeur non finie (`tools/test-physique-phase2.mjs`) ; PHYS_VER 30 ; boucle de retour infinie sur du verre sous le checkpoint corrigée | fait (0.9.49) ; aucun gel de jeu reproduit dans le noyau : le test navigateur de course avec verre n'a rien montré non plus |
| 3. Éditeur / circuits | annuler/rétablir sans perte (ambiance, déclencheurs) ; pivoter / déplacer / dupliquer la sélection ; pot de peinture avec aperçu et bornes ; pièce cachée sous la voiture (ruban) ; médailles conservées après une mise à jour de la physique ; tests replays, logique, 72 circuits (`tools/test-phase3.mjs`) | fait (0.9.50) ; reste à la phase 6 : essai navigateur des nouveaux boutons de sélection |
| 4. Comptes / sauvegardes / multijoueur / sécurité | code joueur sans identité en ligne ; panne serveur ≠ session expirée ; restauration vs suppressions ; `submit-score` (lecture progressive, limite partagée) ; `ice` authentifiée ; RLS : `etape14` ; tampon d'interpolation (`tools/test-phase4.mjs`, `npm run test:sql`) | fait (0.9.51) ; limites du multijoueur documentées (`supabase/MULTI.md`) ; non testé ici : projet Supabase réel (SQL testé sur PostgreSQL local) |
| 5. Interface | accueil à six catégories avec panneaux ; écran Profil / Progression / Paramètres à onglets ; réglages rangés par thème ; écrans Records et médailles, Statistiques, Déblocages ; code mort retiré (`tools/test-menu.mjs`) | fait pour l'accueil et les écrans de profil (0.9.52) ; reste : harmoniser les écrans de la communauté et de l'éditeur (phase 6) |
| 6. Global | suite complète, lint (corrigé), Deno, SQL, navigateur, essais croisés (`tools/test-croises.mjs`), performances mesurées, documentation (`docs/TESTS.md`) | fait (0.9.53) ; demande de fusion : seulement sur ordre explicite |

## Journal

### Étape 1 — accueil (0.9.47)
- Accueil : 6 tuiles + 2 sous-menus + barre d'accès rapides (`index.html`, `js/app/wiring.js` `_menuSub`, `css/style.css`).
- Tests ajoutés : `tools/test-menu.mjs` ; test navigateur : sous-menus sur 844×390, 390×844, 667×375.
- Courses de vitesse réparées dans `tools/test-browser.mjs` (fermeture des fenêtres du premier lancement ; panneau d'amis redessiné).
- Suite : 899 vérifications, 0 échec ; test navigateur : tout passe.

### Étape 2 — robustesse et fenêtres hautes (0.9.47)
- **Défaut corrigé** : fenêtre plus haute que l'écran qui débordait en haut et en bas (titre et boutons inaccessibles) ; `.overlay .panel` défile. Test navigateur, vérifié rouge sans le correctif.
- **Essais aléatoires, aucun défaut trouvé** : 3 graines × 72 circuits × 40 s d'entrées aléatoires (0 NaN, 0 position aberrante, vitesse < 430 km/h) ; 7 scripts × 60 lancers contre les bords (les seules sorties viennent d'une voiture qui part à reculons de la plateforme de départ, ou de murs pris trop lentement) ; serveur de scores, fusion des sauvegardes, codes de circuit : voir CHANGELOG.
- Test navigateur : deux courses de vitesse réparées (voir CHANGELOG) ; nouveau test « aucun bouton inaccessible » (13 écrans × 5 tailles), vérifié rouge sans le correctif.

## Bilan final (phase 6, 0.9.53)

Vocabulaire : **CONFIRMÉ** le problème a été reproduit · **CORRIGÉ** une modification a été faite · **TESTÉ** un test pertinent a été exécuté · **VALIDÉ** le test passe ET le comportement attendu est confirmé · **NON VALIDÉ** une limite d'environnement empêche de conclure · **RESTANT** non résolu. CORRIGÉ n'est jamais VALIDÉ sans test passant.

### Défauts trouvés et traités

| Défaut | Reproduit | Corrigé | Testé | Validé | Remarque |
| --- | --- | --- | --- | --- | --- |
| Fenêtre plus haute que l'écran : titre et boutons hors d'atteinte (0.9.47) | oui | oui | navigateur, rouge avant | **VALIDÉ** | |
| Obstacles sans effet sur looping, mur, tube (0.9.48) | oui | oui | `test-physique-phase2`, rouge avant | **VALIDÉ** | |
| Voiture coincée nez au mur à l'arrêt (0.9.48) | oui | oui | idem | **VALIDÉ** | change la physique (`PHYS_VER` 29) |
| Gravité de réapparition fausse après un anneau-checkpoint (0.9.48) | non (lu dans le code) | oui | test unitaire de la gravité enregistrée | **NON VALIDÉ** de bout en bout | pas de course reproduisant l'état impossible |
| Boucle « retour → verre brisé → vide → retour » avec un checkpoint sur du verre (0.9.49) | oui (16 retours en 100 s) | oui | oui, rouge avant | **VALIDÉ** | |
| Annuler / rétablir remettait à zéro ambiance et déclencheurs (0.9.50) | oui | oui | oui, rouge avant | **VALIDÉ** | |
| Ruban caché par la logique : la voiture roulait sur la route invisible (0.9.50) | oui (124 pas) | oui | oui, rouge avant | **VALIDÉ** | |
| Médaille perdue après une mise à jour de la physique (0.9.50) | oui (test) | oui (`bt`) | oui, rouge avant | **VALIDÉ** | |
| Code joueur contenant la session en ligne de l'invité (0.9.51) | oui | oui | oui, rouge avant | **VALIDÉ** (client) | |
| Panne du serveur prise pour une session expirée (compte déconnecté, invité à nouvelle identité) (0.9.51) | oui | oui | oui, rouge avant | **VALIDÉ** contre un faux Supabase ; **NON VALIDÉ** sur le vrai | |
| Restauration d'une sauvegarde annulée par une pierre tombale du cloud (0.9.51) | oui | oui | oui, rouge avant | **VALIDÉ** (fusion) | |
| `submit-score` : corps lu en entier avant contrôle de taille ; limite en mémoire seule (0.9.51) | oui | oui | `test-submit-handler` | **VALIDÉ** sous Node ; **NON VALIDÉ** sous le vrai `Deno.serve` | |
| `profil.created_at` modifiable par le pilote (contournait la règle des 24 h) (0.9.51) | oui (lecture des droits) | oui (`etape14`) | `test:sql` | **VALIDÉ** sur PostgreSQL local ; **NON VALIDÉ** sur Supabase | |
| `ice` donnait des identifiants TURN sans session (0.9.51) | oui | oui | `test-ice` | **VALIDÉ** (unité) | |
| Voiture distante figée si l'émetteur remet son chrono à zéro (0.9.51) | oui | oui | oui, rouge avant | **VALIDÉ** | |
| Records en mémoire d'une ancienne physique masquant un record synchronisé plus récent (0.9.53) | oui | oui | `test-croises`, rouge avant | **VALIDÉ** | |
| 19 erreurs ESLint dans mes fichiers de test (la CI aurait échoué) (0.9.53) | oui | oui | `npm run lint` | **VALIDÉ** | |
| Gel complet du jeu avec les plaques de verre / collisions (signalé) | **non reproduit** | — | 648 000 pas aléatoires, course réelle dans Chromium | **RESTANT** (inconnu) | si un cas précis revient (circuit, pièce), le fournir |

### Fonctionnalités terminées (VALIDÉES par des essais)
Annuler / rétablir ; pivoter, déplacer, dupliquer une sélection (tout ou rien) ; pot de peinture avec aperçu et bornes ; accueil à six catégories ; écrans Progression et Paramètres rangés ; code joueur sans identité en ligne ; restauration de sauvegarde ; limitation partagée des soumissions de scores (SQL).

### Restant ou non validé
- Le **gel de jeu** signalé n'a pas été reproduit : aucune preuve qu'il soit corrigé.
- **Supabase réel**, **Deno.serve réel**, **WebRTC réel avec relais TURN**, **appareils tactiles réels** : non testables ici (voir `docs/TESTS.md`).
- Collisions de manche : douces, non rejouables ; temps de manche annoncés par chaque joueur ; rollback non branché (voir `supabase/MULTI.md`).
- `author_time` d'un circuit de joueur (donne ses médailles) non rejoué par la base ; limite par pilote contournable par sessions anonymes (le plafond global en base borne le total).
- Écrans de la communauté et de l'éditeur : accessibilité des boutons testée, harmonisation visuelle non poussée.
- Aperçu du pot de peinture : testé en logique, pas en rendu 3D.
- Aucun humain n'a rejoué les 72 circuits avec le moteur actuel.

## Pour reprendre
1. `git fetch && git checkout claude/practical-dirac-vtqom0`.
2. `npm test` puis `node tools/test-browser.mjs` (Playwright + Chromium) : doivent être verts avant toute modification.
3. Reprendre au premier « à faire » du tableau des phases.
