# Shardway

Jeu de course contre-la-montre **low-poly** dans le navigateur, avec éditeur de circuits.
C'est un jeu original : univers « désert au crépuscule et cristaux », voiture, pièces et circuits conçus pour ce projet.

## Jouer

Le jeu est un site statique (HTML + modules JavaScript + three.js inclus), sans étape de compilation.

```bash
npm start
```

Puis ouvrir <http://localhost:8080>. N'importe quel serveur statique fonctionne aussi, par exemple `python3 -m http.server`.

Pour le publier avec **GitHub Pages** : *Settings → Pages → Deploy from a branch*, puis choisir la branche et le dossier `/ (root)`.

## Contenu

- 6 circuits intégrés, de difficulté croissante, avec médailles Bronze / Argent / Or / Cristal.
- Checkpoints, chronos intermédiaires comparés au record, réapparition au dernier checkpoint.
- Fantôme du meilleur tour, records sauvegardés dans le navigateur.
- Pièces : ligne droite, virage serré, grand virage (2×2), pente, tremplin, accélérateur, verglas, checkpoint, départ, arrivée, plateforme. Plusieurs niveaux de hauteur et ponts.
- Éditeur : pose et suppression au clic, rotation, niveaux, annuler/rétablir, pipette, test immédiat, sauvegarde locale, partage par code ou par lien (`#t=…`).
- Physique arcade déterministe (pas fixe de 1/120 s), dérapage, sauts.
- Sons synthétisés en direct (Web Audio), aucun fichier audio.
- Clavier QWERTY et AZERTY, manette, commandes tactiles sur mobile.

## Commandes

| Touche | Action |
| --- | --- |
| ↑ / Z (W) | Accélérer |
| ↓ / S | Freiner, marche arrière |
| ← → / Q D (A D) | Tourner |
| Espace / Maj | Dérapage |
| R | Revenir au dernier checkpoint |
| Entrée | Recommencer |
| C | Changer de caméra |
| Échap | Pause |

**Éditeur** : clic pour poser, clic droit pour supprimer, clic droit glissé pour orbiter, molette pour zoomer, R pour pivoter, E / C pour changer de niveau, 1–0 pour choisir une pièce, T pour tester.

## Structure

```
index.html, css/style.css   interface
js/main.js                  orchestration (menu, course, éditeur)
js/pieces.js, js/track.js   pièces, modèle de circuit, encodage des codes de partage
js/physics.js               physique de la voiture
js/raceLogic.js             checkpoints, arrivée, réapparition
js/race.js, js/editor.js    sessions de course et d'édition
js/trackMesh.js, js/geo.js  génération des maillages low-poly
js/scenery.js               ciel, terrain, décor
js/tracks.js                circuits intégrés et médailles
tools/sim.mjs               validation des circuits par pilote automatique (npm run sim)
```

## Licence

Code du jeu : MIT. three.js : MIT (voir `js/vendor/THREE_LICENSE.txt`).
