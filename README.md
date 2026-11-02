# Shardway

Jeu de course contre-la-montre **low-poly** dans le navigateur, avec éditeur de circuits.
C'est un jeu original : décors, voiture, pièces et circuits ont été conçus pour ce projet.

Version actuelle : **1.2**

## Jouer

Le jeu est un site statique (HTML + modules JavaScript + three.js inclus), sans étape de compilation.

```bash
npm start
```

Puis ouvrir <http://localhost:8080>. N'importe quel serveur statique fonctionne aussi, par exemple `python3 -m http.server`.

Pour le publier avec **GitHub Pages** : *Settings → Pages → Deploy from a branch*, puis choisir la branche et le dossier `/ (root)`.

## Contenu

- **30 circuits** avec médailles Bronze / Argent / Or / Cristal, dans 5 décors :
  *Désert crépuscule*, *Nuit polaire* (aurore boréale animée), *Jungle néon*, *Ville futuriste* et *Archipel tropical*.
- Checkpoints, chronos intermédiaires comparés au record, réapparition au dernier checkpoint, fantôme du meilleur temps.
- **Pièces** : ligne droite, virage serré, grand virage (2×2), pente, tremplin, checkpoint, départ, arrivée, plateforme, plusieurs niveaux de hauteur et ponts, et des obstacles en 3D :
  - looping (2×2), **grand looping** (3×3), **double looping** (3×3), chacun en version droite ou gauche ;
  - **vrille** (la route passe à l'envers) ;
  - **L vertical** : montée en quart de cercle, mur vertical (empilable), sommet du L.
- **Options de pièce** : *à l'envers* (route au plafond, il faut rouler vite pour rester collé), *sans bordures* (on peut tomber), *tunnel*.
- **Revêtements réglables** (chaque curseur change l'effet et légèrement la couleur) :
  verglas, accélérateur (5 % à 200 %), rebond, sable, aimant, boue, dérive, ralentisseur, vent latéral, **gravité** (15 % à 250 %) et **plaque moto**
  (la voiture se transforme en moto en gardant sa vitesse ; une autre plaque la ramène en voiture).
- **Éditeur** : pose au clic, rotation, miroir, niveaux, revêtements au pinceau, options, choix du décor, annuler/rétablir, pipette, test immédiat, sauvegarde locale, partage par code ou par lien.
  - **Décorations à placement libre** (position, rotation, taille, accrochage libre / 1 m / 4 m / case) : panneaux, formes, murs, toits, nature, et **plaque image par URL** (l'image doit autoriser le chargement depuis un autre site, CORS).
  - **Vérification** : il faut finir son circuit pour que le partage donne des médailles et des pièces. Le temps de l'auteur devient la médaille *bronze*, les trois autres sont déduites. On peut partager sans vérifier, mais sans médailles ni pièces.
- **Pièces (monnaie)** gagnées en fin de course selon la médaille (doublées la première fois, réduites sur les circuits de joueurs).
- **Garage** : forme (6 carrosseries), couleurs, LED sous la voiture / moto, dessins, ornements, ailerons, roues, presets et 3 emplacements personnels. Tout est **purement visuel** : la physique ne dépend jamais de l'apparence.
- **Profil et sauvegarde** : un code joueur contient tout (records, fantômes, circuits enregistrés, pièces, équipement, réglages). Copie-le ou télécharge un fichier `.shw`, puis restaure-le ailleurs (fusion ou remplacement).
- **Easter eggs** : à toi de les trouver (indice : certains circuits cachent des éclats dorés ✦).
- **Commandes personnalisables** (clavier, manette, éditeur), navigation complète aux menus avec la manette, curseur et raccourcis d'éditeur à la manette, zone morte et sensibilité réglables, vibrations.
- **Mobile** : plein écran, indication de passage en paysage, commandes à boutons ou direction au glisser du pouce, zones sûres (encoche), vibrations.
- Physique arcade déterministe (pas fixe de 1/120 s), dérapage rattrapable, sauts, loopings et rubans 3D avec décrochage si la vitesse est insuffisante.
- Caméra qui suit la glisse, se retourne avec le véhicule (envers, looping, mur) et se baisse sous les ponts et dans les tunnels.
- Sons synthétisés en direct (Web Audio), aucun fichier audio.

## Nouveautés de la v1.2

- 18 circuits en plus (30 au total) : 6 dans chacun des trois nouveaux décors, avec beaucoup de virages.
- Loopings, vrilles, murs et routes à l'envers à piloter : la force centrifuge et la gravité font glisser la voiture sur le côté (instable à l'envers), il faut braquer pour rester au centre, et frotter la bordure fait perdre de la vitesse.
- Plusieurs plaques moto collées ne comptent que pour une transformation.
- Rubans 3D généraux : routes à l'envers, vrille, L vertical, loopings plus grands.
- Plaque moto, revêtement de gravité, revêtements réglables, boue, dérive, ralentisseur, vent.
- Routes sans bordures et tunnels.
- Décorations libres, image par URL, vérification des circuits de joueurs, médailles automatiques.
- Pièces, garage de personnalisation, presets, code joueur, easter eggs.
- Meilleure adaptation aux téléphones et contrôles à la manette améliorés.
- Les anciens circuits et codes de partage (`SHW1`, `SHW2`) restent lisibles.

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
| 1 … 0, P, U, I, V, L, K, J | Choisir une pièce |
| M | Miroir (looping gauche / droite) |
| B | Revêtement suivant |
| N | Accrochage des décorations |
| [ ] ou Alt + molette | Taille de la décoration |
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
js/pieces.js, js/track.js   pièces, revêtements, modèle de circuit, codes de partage (SHW3)
js/ribbons.js               rubans 3D (looping, vrille, L vertical, envers)
js/physics.js               physique de la voiture (sol, murs, rubans)
js/decos.js, decoData.js    décorations à placement libre
js/garage.js, cosmetics.js  personnalisation visuelle (voiture et moto)
js/profile.js               pièces, objets débloqués, code joueur
js/raceLogic.js             checkpoints, arrivée, réapparition
js/race.js, js/editor.js    sessions de course et d'édition
js/input.js                 clavier, manette, tactile, touches personnalisables
js/trackMesh.js, js/geo.js  génération des maillages low-poly
js/scenery.js               5 décors (ciel, terrain, objets)
js/tracks.js                circuits intégrés et médailles
tools/sim.mjs               validation des circuits par pilote automatique (npm run sim)
```

## Licence

Code du jeu : MIT. three.js : MIT (voir `js/vendor/THREE_LICENSE.txt`).
