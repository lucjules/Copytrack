# Shardway

Jeu de course contre-la-montre **low-poly** dans le navigateur, avec éditeur de circuits.
C'est un jeu original : décors, voiture, pièces et circuits ont été conçus pour ce projet.

Version actuelle : **1.1**

## Jouer

Le jeu est un site statique (HTML + modules JavaScript + three.js inclus), sans étape de compilation.

```bash
npm start
```

Puis ouvrir <http://localhost:8080>. N'importe quel serveur statique fonctionne aussi, par exemple `python3 -m http.server`.

Pour le publier avec **GitHub Pages** : *Settings → Pages → Deploy from a branch*, puis choisir la branche et le dossier `/ (root)`.

## Contenu

- **12 circuits** avec médailles Bronze / Argent / Or / Cristal, dans deux décors :
  - *Désert crépuscule* : désert facetté et cristaux ;
  - *Nuit polaire* : banquise, glaciers, sapins enneigés, étoiles et aurore boréale animée.
- Checkpoints, chronos intermédiaires comparés au record, réapparition au dernier checkpoint, fantôme du meilleur temps.
- **Pièces** : ligne droite, virage serré, grand virage (2×2), pente, tremplin, **looping** (décalé à droite ou à gauche), checkpoint, départ, arrivée, plateforme. Plusieurs niveaux de hauteur et ponts.
- **Revêtements** applicables sur toutes les pièces compatibles :
  - *Verglas* : très peu d'adhérence ;
  - *Accélérateur* : gros coup de boost ;
  - *Rebond* : propulse la voiture en l'air (pièces plates uniquement) ;
  - *Sable* : freine et limite la vitesse ;
  - *Aimant* : adhérence renforcée, la voiture reste collée sur les bosses.
- **Éditeur** : pose au clic ou en glissant, rotation, niveaux, revêtements au pinceau, choix du décor, annuler/rétablir, pipette, test immédiat, sauvegarde locale, partage par code ou par lien (`#t=…`).
- **Commandes personnalisables** (Options › Commandes) : deux touches par action pour la course et l'éditeur, boutons de manette, détection des conflits, retour aux réglages par défaut.
- Physique arcade déterministe (pas fixe de 1/120 s) : dérapage rattrapable, aide au contre-braquage, sauts, loopings avec décrochage si la vitesse est insuffisante.
- Caméra qui suit la glisse, tourne avec la voiture dans les loopings et se baisse sous les ponts.
- Sons synthétisés en direct (Web Audio), aucun fichier audio.
- Clavier QWERTY et AZERTY, manette, commandes tactiles sur mobile.

## Nouveautés de la v1.1

- Pistes plus larges (18 m au lieu de 14 m). Tous les circuits existants, y compris ceux enregistrés ou partagés en v1.0 (codes `SHW1:`), sont convertis automatiquement.
- Les anciennes pièces « Accélérateur » et « Verglas » deviennent des revêtements.
- Les records et fantômes de la v1.0 sont réinitialisés : la physique et les distances ont changé.
- 6 nouveaux circuits dans le décor Nuit polaire, looping, 3 nouveaux revêtements, commandes personnalisables, nouveaux raccourcis dans l'éditeur, meilleure maniabilité.

## Commandes par défaut

| Touche | Action |
| --- | --- |
| ↑ / Z (W) | Accélérer |
| ↓ / S | Freiner, marche arrière |
| ← → / Q D (A D) | Tourner |
| Espace / Maj | Dérapage |
| R | Revenir au dernier checkpoint |
| Entrée / Retour | Recommencer |
| C | Changer de caméra |
| Échap / P | Pause |

### Éditeur

| Touche / souris | Action |
| --- | --- |
| Clic | Poser une pièce (glisser pour en poser plusieurs) |
| Clic droit | Supprimer |
| Clic droit glissé | Tourner la vue |
| Clic molette | Pipette (pièce, rotation et niveau) |
| Molette | Zoom |
| Maj + molette, E / C, Page↑ / Page↓ | Changer de niveau |
| R (Maj + R) | Pivoter (sens inverse) |
| Tab (Maj + Tab) | Pièce suivante (précédente) |
| 1 … 0, P | Choisir une pièce |
| B | Revêtement suivant |
| X / Suppr | Gomme |
| F | Recentrer la vue |
| H | Vue de dessus |
| G | Afficher / masquer la grille |
| T | Tester le circuit |
| F1 ou ? | Liste des raccourcis |
| Ctrl + Z / Ctrl + Y / Ctrl + S | Annuler / rétablir / enregistrer |

Après la pose d'une pente, le niveau suit tout seul quand on vise la case du haut ou du bas.

## Structure

```
index.html, css/style.css   interface
js/main.js                  orchestration (menu, course, éditeur, options)
js/pieces.js, js/track.js   pièces, revêtements, modèle de circuit, codes de partage
js/physics.js               physique de la voiture (sol, murs, looping)
js/raceLogic.js             checkpoints, arrivée, réapparition
js/race.js, js/editor.js    sessions de course et d'édition
js/input.js                 clavier, manette, tactile, touches personnalisables
js/trackMesh.js, js/geo.js  génération des maillages low-poly
js/scenery.js               décors (ciel, terrain, objets)
js/tracks.js                circuits intégrés et médailles
tools/sim.mjs               validation des circuits par pilote automatique (npm run sim)
```

## Licence

Code du jeu : MIT. three.js : MIT (voir `js/vendor/THREE_LICENSE.txt`).
