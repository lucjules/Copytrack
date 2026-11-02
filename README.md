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
- **Options de pièce** : *à l'envers* (route au plafond : sur du plat, rien ne retient la voiture, elle tombe), *sans bordures* (on peut tomber), *tunnel*.
- **Revêtements réglables** (chaque curseur change l'effet et légèrement la couleur) :
  verglas, accélérateur (5 % à 200 %), rebond, sable, aimant, boue, dérive, ralentisseur, vent latéral, **gravité** (15 % à 250 %) et **plaque moto**
  (la voiture se transforme en moto en gardant sa vitesse ; une autre plaque la ramène en voiture).
  La moto a ses propres réglages : elle démarre plus fort, tourne plus serré (même à haute vitesse) et change de cap plus vite, mais sa vitesse de pointe est un peu plus basse, elle freine un peu moins fort et glisse moins en dérapage.
- **Éditeur** : pose au clic, rotation, miroir, niveaux, revêtements au pinceau, options, choix du décor, annuler/rétablir, pipette, test immédiat, sauvegarde locale, partage par code ou par lien.
  - **Décorations à placement libre** (position, rotation, taille, accrochage libre / 1 m / 4 m / case) : panneaux, formes, murs, toits, nature, et **plaque image par URL** (l'image doit autoriser le chargement depuis un autre site, CORS).
  - **Vérification** : il faut finir son circuit pour que le partage donne des médailles et des pièces. Le temps de l'auteur devient la médaille *bronze*, les trois autres sont déduites. On peut partager sans vérifier, mais sans médailles ni pièces.
- **Pièces (monnaie)** gagnées en fin de course selon la médaille (doublées la première fois, réduites sur les circuits de joueurs).
- **Garage** : forme (6 carrosseries), couleurs, LED sous la voiture / moto, dessins, ornements, ailerons, roues, presets et 3 emplacements personnels. Tout est **purement visuel** : la physique ne dépend jamais de l'apparence.
- **Profil et sauvegarde** : un code joueur contient tout (records, fantômes, circuits enregistrés, pièces, équipement, réglages). Copie-le ou télécharge un fichier `.shw`, puis restaure-le ailleurs (fusion ou remplacement).
- **Easter eggs** : à toi de les trouver (indice : certains circuits cachent des éclats dorés ✦).
- **Commandes personnalisables** (clavier, manette, éditeur), navigation complète aux menus avec la manette, curseur et raccourcis d'éditeur à la manette, zone morte et sensibilité réglables, vibrations.
- **Mobile** : plein écran, indication de passage en paysage, commandes à boutons ou direction au glisser du pouce, zones sûres (encoche), vibrations.
- Physique déterministe (pas fixe de 1/120 s) à modèle « bicyclette » : le volant oriente les roues avant et ce sont les pneus (adhérence limitée avant / arrière) qui font tourner la voiture. Sous-virage, dérapage et contre-braquage en découlent ; en l'air, le volant ne tourne que les roues. **Pas de bouton de dérapage** : freiner en tournant franchement le volant à bonne vitesse fait décrocher l'arrière, et la glisse se prolonge tant qu'on garde le volant ; freiner roues droites (ou avec un léger braquage) freine simplement. Le même modèle s'applique sur les loopings, vrilles, murs et routes à l'envers, avec une **physique réelle de l'appui** : l'adhérence et le moteur dépendent de la force qui plaque les roues (gravité + courbure de la route). Dans le creux d'un looping la voiture est plaquée ; sur un mur vertical plus rien ne la plaque, elle monte sur son élan sans pouvoir tourner ni accélérer ; le haut du L la fait sauter juste au-dessus du rebord et la bascule vers le plateau (trop lente, elle redescend en arrière) ; une route plate à l'envers ou le milieu d'une vrille la font tomber. Elle peut retomber sur un ruban (haut d'un L, fond d'un looping) ou redescendre en arrière.
- Caméra qui suit la glisse, se retourne avec le véhicule (envers, looping, mur) et se baisse sous les ponts et dans les tunnels.
- Sons synthétisés en direct (Web Audio), aucun fichier audio.

## Nouveautés de la v1.2

- 18 circuits en plus (30 au total) : 6 dans chacun des trois nouveaux décors, avec beaucoup de virages.
- Loopings, vrilles, murs et routes à l'envers à piloter avec la même physique qu'au sol, et une adhérence qui dépend de l'appui réel : la montée en L se termine par un envol puis une retombée sur le plateau (ou en arrière si la voiture est trop lente), et seules les parties courbes tiennent à l'envers.
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
| Frein + volant à fond | Dérapage |
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
