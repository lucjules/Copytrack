# Audit du rendu — 0.12.2

Audit de tout ce qui se dessine dans Trackigami, mené avec des outils construits pour l'occasion (`tools/audit-rendu/`) plutôt qu'à l'œil :

| Outil | Rôle |
|---|---|
| `cas.mjs` | Matrice de tous les cas : 442 pièces × orientations que l'éditeur accepte = 1 346 combinaisons ; × 24 variantes de revêtement = 32 304 cas. |
| `sondes.mjs`, `sondes2.mjs` | Sondes qui mesurent : géométrie, route sous le terrain, poteaux, marquages, sens du tapis, rendu contre physique, largeur de la route, facettes des rubans, emprise, revêtements et options, décors, circuits officiels, supports, tube. `--json=` écrit le registre. |
| `banc.html`, `banc.js` | Banc de rendu : le vrai moteur (TrackView, Scenery, profils de qualité) sans menus, horloge réglable. |
| `captures.mjs` | Chromium sans écran, angles fixes et gros plans calculés sur le défaut ; sélections `echantillon`, `pieces`, `orientations`, `revetements`, `themes`, `decors`, `avantapres`. |
| `tours.mjs` | Les 72 circuits officiels au pilote automatique dans le vrai jeu ; la caméra de course est surveillée (sous le sol, dans une route, voiture cachée, sauts). |
| `perf.mjs` | Construction, appels de dessin, triangles, coût d'une modification dans l'éditeur, mémoire après 72 chargements. |

## Registre

| Id | Gravité | Constat (mesuré) | Correction | Garde-fou |
|---|---|---|---|---|
| R-01 | bloquant | Tube : la coque n'avait aucune collision. Tombée sur le tube, la voiture la traversait et se retrouvait dedans (« téléportée ») ; décrochée en haut, rien ne la retenait. | Coque pleine (`physics/ribbon.js`, `_tubeShell`), `PHYS_VER` 38. Médailles de 22 circuits recalées. | sonde `tube` |
| R-02 | bloquant | Chapeau des poteaux à travers la route : 260 pièces (96 pentes, 164 virages qui montent), jusqu'à 2,85 m ; 66 circuits officiels sur 72. | Chapeau incliné qui suit le dessous de la dalle (`pillarSpecs`). | sonde `poteaux`, `circuits` |
| R-03 | bloquant | Tapis roulant : chevrons toujours pointés vers l'entrée, donc à l'envers au réglage par défaut ; chevrons à 0 km/h. | Shader : pointe selon le signe de la vitesse, rien à l'arrêt. | sonde `tapis` |
| R-04 | bloquant | Pièces sous le terrain au niveau 0 : vrille −11,6 m, tire-bouchon −3,85 m, loopings double −0,39 m et triple −0,22 m. | Niveau minimum dans l'éditeur (`Track.placeable`, `minGroundLevel`) ; fosse sous les pièces des anciens circuits (`scenery/pits.js`). | sondes `sous-terrain`, test « fosses » |
| R-05 | visible | Marquages hors des routes étroites : 103 pièces, jusqu'à 5,84 m dans le vide. | Marquages à l'échelle de la largeur (`frameAt`, `onFrame`, `bar`). | sonde `marquages` |
| R-06 | visible | Marquages d'une route large : 42 % de la demi-largeur. | Idem. | sonde `largeur` |
| R-07 | visible | Rubans en hauteur sans support : 106 pièces, 542 occurrences dans 66 circuits officiels. | Jusqu'à trois poteaux sous les passages à plat (`ribbonPillars`). Restent sans support : les pièces verticales (89 occurrences : murs, sommets de looping). | sonde `supports` |
| R-08 | visible | Vent : dans un virage, flèches qui tournent avec la route alors que la poussée garde l'axe de la pièce ; flèches à 100 % (aucun vent). | Flèches selon l'axe de la pièce, longueur selon la force, rien à 100 %. | planche `avantapres` |
| R-09 | visible | Météo dans les tunnels, les tubes et sous les routes. | Estompée quand la caméra est à l'abri (`cover.js`). | test « météo » |
| R-10 | visible | Caméra dans la dalle d'une route en gravité inversée (« Cristal Fêlé », 3 échantillons sur 93). | Garde-fou de la caméra étendu à la gravité inversée (`race/camera.js`). | `tours.mjs` : 0 |
| R-11 | visible | Poteau des plaques triangle sur l'hypoténuse, à moitié dans le vide. | Sous le centre de gravité. | test « poteaux » |
| R-12 | visible | Scintillement possible des marquages (5 cm) et des nappes animées (3 cm) au loin, sans décalage de profondeur (≈ 300 à 500 m avec 24 bits, ≈ 20 m avec 16 bits). | `polygonOffset` sur les matériaux `glow` et `fx`. | — |
| R-13 | détail | Cale du bateau sur route étroite redessinée à 24 m (la physique : 12 m). | La cale garde la largeur (`boatRamp`). | sonde `largeur-route` |
| R-14 | détail | Courbes en S raides (`crs4`, `cds4`…) : route dessinée à 12 cm de celle de la physique ; grand S posé sur un mur : 26 cm. | 24 tronçons au lieu de 12 ; chicanes roulées plus finement. | sondes `rendu-physique`, `facettes` |
| R-15 | détail | Texture des immeubles du décor « ville » jamais libérée (une de plus à chaque chargement). | Textures des matériaux libérées avec le décor. | `perf.mjs` |
| R-16 | détail | Traces de pneus sur l'eau. | Pas de traces sur l'eau ni la cale. | — |

## Gardé tel quel (voulu ou sans effet)

- Portique de checkpoint au milieu de la case alors que le passage compte dès l'entrée dans la case : la pièce se prend dans les deux sens.
- Poteau absent quand une autre pièce occupe la case en dessous : sinon il serait planté au milieu de sa route.
- 25 décors volants ou suspendus, 4 décors en partie enterrés (toit plat, pierre zen, grand cœur, panier d'œufs) : leur dessin le veut.
- Pièces au mur en pente dont les bords débordent dans la case voisine (66 pièces) : conséquence de la pente, raccord continu avec la pièce suivante. **Depuis la 0.12.6**, l'éditeur réserve ce bord : seule la pièce qui prolonge la pente peut se poser dans la case débordée (`js/spill.js`, `tools/test-debordement.mjs`) ; les circuits existants se lisent comme avant.
- Immeubles (ville) et nuages (ciel) près des caméras éloignées du banc : jamais sur la route ni autour d'elle (une case de marge).

## Vérifié sans défaut

1 346 combinaisons et 30 191 variantes construites sans sommet invalide ; route dessinée à moins de 8 cm de la physique partout, eau et cale comprises ;
anneaux à leur zone de déclenchement ; 341 décors ; caméra jamais sous le sol, une voiture cachée 0,47 % du temps ; aucune fuite de géométrie ; 19 à 90 ms
pour construire un circuit officiel, 32 à 61 appels de dessin, 45 à 121 k triangles vus de haut, 1 à 12 ms par modification dans l'éditeur.

## Limites

Non mesurés ici : les vrais téléphones (précision des GPU, contexte WebGL perdu, 120 Hz), l'export vidéo et le mode théâtre, le rendu des véhicules
au contact (seulement à travers les tours). La pluie s'estompe pour toute la caméra à l'abri (pas goutte par goutte).

## Décisions de la phase 3 de la 1.0 (0.12.6)

- **Pentes posées au mur (F1)** : bord réservé dans la case voisine, voir plus haut.
- **Pièces verticales sans poteau (F2, 89 occurrences dans les circuits officiels : murs, sommets de looping)** : **style « suspendu » assumé**.
  Un poteau ne peut pas porter une route verticale sans traverser la route qui passe dessous ou à côté, et un support mural dessiné devrait
  s'ancrer dans un mur qui n'existe pas. Ces pièces tiennent par leurs raccords, comme les anneaux, les plateformes et les décors volants ; le reste
  de la route (ce qui a un passage à plat) garde ses poteaux. Rien à changer dans le rendu ; la sonde `supports` continue d'exiger un poteau partout
  ailleurs.
