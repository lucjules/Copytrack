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
| 2. Physique | essais aléatoires, collisions, obstacles, verre, surfaces, checkpoints | à faire |
| 3. Éditeur / circuits | aller-retour des codes, groupes logiques, scripts, replays, progression | à faire |
| 4. Comptes / sauvegardes / multijoueur | fusion des sauvegardes, validation côté serveur, protocole | à faire |
| 5. Interface | accueil allégé (fait), cohérence des écrans, responsive | accueil fait |
| 6. Global | suite complète, lint, test navigateur, optimisation, PR | à faire |

## Journal

### Étape 1 — accueil (0.9.47)
- Accueil : 6 tuiles + 2 sous-menus + barre d'accès rapides (`index.html`, `js/app/wiring.js` `_menuSub`, `css/style.css`).
- Tests ajoutés : `tools/test-menu.mjs` ; test navigateur : sous-menus sur 844×390, 390×844, 667×375.
- Courses de vitesse réparées dans `tools/test-browser.mjs` (fermeture des fenêtres du premier lancement ; panneau d'amis redessiné).
- Suite : 899 vérifications, 0 échec ; test navigateur : tout passe.

## Pour reprendre
1. `git fetch && git checkout claude/practical-dirac-vtqom0`.
2. `npm test` puis `node tools/test-browser.mjs` (Playwright + Chromium) : doivent être verts avant toute modification.
3. Reprendre au premier « à faire » du tableau des phases.
