# Rotations dans l'éditeur : ce qui existe, ce qui n'existe PAS

Ce document dit exactement ce que l'éditeur sait faire, et pourquoi la rotation 3D libre des **pièces de circuit** n'est **pas** implémentée. Rien ici n'est une promesse : chaque affirmation est couverte par un test cité.

## Décorations (arbres, rochers, pièces perso…) : rotation 3D libre, visuelle

| Axe | Réglage | Remarque |
|---|---|---|
| Cap (Y) | curseur + saisie au degré (ou au demi-degré), boutons ↶ 90° / ↷ 90°, touche R (±15°), gizmo 3D | seul axe d'un **obstacle** |
| Inclinaison (X), roulis (Z) | curseur + saisie, « Remettre droit », « Retourner », gizmo 3D (cercles X et Z) | **purement visuels** ; refusés sur un obstacle |
| Pas du gizmo | 1°, 5° (défaut), 15°, 45°, 90° | |

Ordre des rotations : cap, puis inclinaison, puis roulis (`YXZ`, `js/decos.js` : `setDecoRotation`). Les trois angles sont enregistrés dans le code du circuit (13ᵉ et 14ᵉ valeurs de la décoration, écrites seulement s'ils servent : un circuit sans inclinaison garde exactement son code), dans l'annuler / rétablir, le copier-coller, le pivotement d'une zone (un quart de tour de la zone ne change que le cap) et la duplication (Ctrl + D).
Tests : `tools/test-deco-rotation.mjs` (données, code, rétro-compatibilité, annuler, pivotement, rendu), `tools/test-browser.mjs` (saisie d'angle, gizmo X/Y/Z, obstacle limité au cap).

Ce qui est **volontairement exclu** : l'inclinaison d'un obstacle. Sa forme de contact (piques, marteaux, balanciers…) est calculée par la physique autour de la verticale seulement ; l'afficher penché sans que le contact suive serait un mensonge visuel.

## Pièces de circuit : trois rotations prédéfinies, **pas** de rotation libre

| Rotation | Ce que fait l'éditeur | Mécanisme |
|---|---|---|
| Cap (lacet) | quarts de tour : 0°, 90°, 180°, 270° (`r`) | la pièce vit sur une grille de cases |
| Roulis | sol, mur gauche, mur droit, plafond (`o`, `v`) | « Orientation » : la route est construite sur le mur ou à l'envers, avec ses pièces de transition |
| Inclinaison (tangage) | celle du **type** de pièce (pente, pente raide, rampe, crête, vrille…) | choisie par « Type » / « Caractéristiques », jamais par un angle |

**Il n'existe pas d'angle libre pour une pièce, sur aucun axe.** Le gizmo ne propose que des quarts de tour (cap), et l'inspecteur n'offre ni curseur ni saisie d'angle pour une pièce.

### Pourquoi ce n'est pas faisable sans refonte

1. **La physique est déterministe et vérifiée par le serveur** : une course est rejouée à l'identique par `submit-score` (Deno) à partir du **code du circuit**. Tout format de pièce nouveau change ce que le serveur doit savoir reconstruire, donc `PHYS_VER`, les records et les fantômes.
2. **La route d'une pièce est un ruban** (`js/ribbons.js`, `js/physics/ribbon.js`) construit dans le repère de **sa case** : ses extrémités doivent retomber sur le bord d'une case voisine avec la même hauteur, la même pente et le même roulis (`js/joins.js`, classes de raccord, vérifiées par `tools/audit-pieces.mjs`). Une pièce tournée d'un angle quelconque ne se raccorderait à rien.
3. **Les contacts supposent la grille** : index spatial par case (`tilesAt`), dalles et toits de tunnel, bordures (`js/physics/walls.js`, `slabs`), obstacles par cases 7×7. Aucune de ces structures ne sait interroger une pièce hors grille.
4. **Un angle libre créerait des circuits injouables sans le dire** (pièce qui flotte, bordure qui traverse la route) : l'éditeur ne peut pas les repérer (`checkTrack`) puisque rien ne les décrit.

### Ce qui est prouvé sur le système actuel

`tools/test-piece-rotations.mjs` (dans `npm test`) : 24 circuits choisis pour couvrir **93** combinaisons (type de pièce × orientation, revêtements, obstacles, pièces mobiles) sont tournés de 90°, 180° et 270° par la vraie fonction de l'éditeur (`rotateSelection`), puis conduits par le pilote automatique : les temps sont **identiques à l'original**, sans exception. Pentes, rampes, murs, plafonds, boucles, obstacles et raccords se comportent donc de la même façon quel que soit le cap. Épreuve par mutation : si le cap des décorations n'est plus tourné avec la zone, le test échoue. La géométrie de la route après rotation est comparée point par point dans `tools/test-phase3.mjs`.

### Si l'on voulait vraiment des pièces inclinées

Il faudrait (à évaluer comme un chantier à part, pas comme un réglage) : un nouveau format de pièce dans le code du circuit (et sa version), un ruban capable de partir d'un repère quelconque, un contact avec des surfaces non alignées sur la grille, des raccords calculés plutôt que classés, une revalidation des 72 circuits officiels, et le même travail côté serveur. Le plus proche d'une rotation « libre » aujourd'hui est de **combiner** cap, orientation et type de pièce, ou de poser une **pièce perso** (décoration) qui, elle, tourne librement mais n'a pas de contact.
