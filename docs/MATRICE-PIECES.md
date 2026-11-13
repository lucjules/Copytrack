# Matrice de compatibilité des pièces (générée)

Générée par `node tools/matrice-pieces.mjs --update` : **ne pas modifier à la main**. Chaque case est un vrai circuit (départ → pièce → arrivée, avec les
transitions nécessaires) roulé par le moteur de physique actuel (`PHYS_VER` 36) au pilote automatique, à 80, 150 et 250 km/h de croisière.

| Code | Sens |
|---|---|
| OK | finit aux trois vitesses, sans quitter la route ni décoller |
| SAUT | finit, mais la voiture décolle plus de 0,35 s (rupture de pente, tremplin, bascule) |
| v≥N | ne tient qu'à partir de N km/h (au pilote automatique) |
| CHUTE | ne finit à aucune des trois vitesses |
| RACCORD | la chaîne ne peut pas être construite : aucune pièce du catalogue ne se raccorde à cette orientation (voir la raison) |
| — | orientation non proposée par l'éditeur (`flagAllowed`) |
| n/a | pièce sans route roulable (raison dans le fichier JSON) |

Totaux : CHUTE 28 · OK 103 · RACCORD 4 · SAUT 60 · n/a 56 · v≥150 407 · v≥250 4 · v≥80 44 · — 318.

**Limites** : pilote automatique (pas un humain), voiture classique, sans revêtement ni obstacle, une seule pièce testée par chaîne, vitesse de croisière régulée.
Les raisons détaillées de chaque case (vitesses, chutes, raccords impossibles) sont dans `tools/compat/matrice-pieces.json`.

## Lignes droites, pentes et courbes

| Pièce | Sol | Mur gauche | Mur droit | Plafond | Incliné gauche 45° | Incliné droit 45° | Surplomb gauche 135° | Surplomb droit 135° |
|---|---|---|---|---|---|---|---|---|
| `straight` Ligne droite | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `slope` Pente | SAUT | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `steep` Tremplin | v≥80 | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `checkpoint` Checkpoint | OK | — | — | OK | — | — | — | — |
| `start` Départ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `finish` Arrivée | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `gentle` Pente douce (½ niveau) | SAUT | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `steep4` Ligne droite · inclinaison 4 | v≥80 | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `crv05` Courbe · inclinaison ½ | SAUT | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `crv1` Courbe · inclinaison 1 | v≥80 | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `crv2` Courbe · inclinaison 2 | v≥80 | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `crv4` Courbe · inclinaison 4 | v≥80 | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | CHUTE | CHUTE |
| `dn05` Pente descendante ½ | OK | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `dn1` Pente descendante 1 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `dn2` Pente descendante 2 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `dn4` Pente descendante 4 | SAUT | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `cro05` Courbe · fin de montée ½ | OK | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cro1` Courbe · fin de montée 1 | SAUT | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `cro2` Courbe · fin de montée 2 | SAUT | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `cro4` Courbe · fin de montée 4 | SAUT | CHUTE | CHUTE | v≥80 | v≥250 | v≥250 | v≥150 | v≥150 |
| `cdi05` Courbe · début de descente ½ | OK | v≥150 | v≥150 | OK | v≥150 | v≥150 | v≥150 | v≥150 |
| `cdi1` Courbe · début de descente 1 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cdi2` Courbe · début de descente 2 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cdi4` Courbe · début de descente 4 | SAUT | CHUTE | CHUTE | v≥80 | CHUTE | CHUTE | CHUTE | CHUTE |
| `cdo05` Courbe · fin de descente ½ | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cdo1` Courbe · fin de descente 1 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cdo2` Courbe · fin de descente 2 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cdo4` Courbe · fin de descente 4 | SAUT | v≥150 | v≥150 | v≥80 | SAUT | SAUT | CHUTE | CHUTE |
| `crs05` Courbe en S · montée ½ | OK | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `crs1` Courbe en S · montée 1 | SAUT | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `cds05` Courbe en S · descente ½ | OK | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cds1` Courbe en S · descente 1 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |

## Virages

| Pièce | Sol | Mur gauche | Mur droit | Plafond | Incliné gauche 45° | Incliné droit 45° | Surplomb gauche 135° | Surplomb droit 135° |
|---|---|---|---|---|---|---|---|---|
| `curve` Virage serré | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `bigcurve` Grand virage | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cpCurve` Checkpoint en virage | OK | — | — | OK | — | — | — | — |
| `hugecurve` Très grand virage plat | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cv05` Courbe serrée · inclinaison ½ | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cv1` Courbe serrée · inclinaison 1 | v≥80 | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `cv2` Courbe serrée · inclinaison 2 | v≥80 | v≥150 | CHUTE | v≥80 | v≥150 | CHUTE | v≥150 | v≥150 |
| `cv4` Courbe serrée · inclinaison 4 | v≥80 | v≥150 | CHUTE | v≥80 | v≥150 | v≥250 | v≥150 | v≥150 |
| `cvBig05` Grande courbe · inclinaison ½ | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvBig1` Grande courbe · inclinaison 1 | SAUT | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `cvBig2` Grande courbe · inclinaison 2 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cvBig4` Grande courbe · inclinaison 4 | v≥80 | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `cvL05` Courbe serrée ↰ · inclinaison ½ | OK | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `cvL1` Courbe serrée ↰ · inclinaison 1 | v≥80 | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `cvL2` Courbe serrée ↰ · inclinaison 2 | v≥80 | CHUTE | v≥150 | v≥80 | CHUTE | v≥150 | v≥150 | v≥150 |
| `cvL4` Courbe serrée ↰ · inclinaison 4 | v≥80 | CHUTE | v≥150 | v≥80 | v≥250 | v≥150 | v≥150 | v≥150 |
| `cvBigL05` Grande courbe ↰ · inclinaison ½ | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvBigL1` Grande courbe ↰ · inclinaison 1 | SAUT | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `cvBigL2` Grande courbe ↰ · inclinaison 2 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cvBigL4` Grande courbe ↰ · inclinaison 4 | v≥80 | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cvd05` Virage descendant serré · ½ | SAUT | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `cvd1` Virage descendant serré · 1 | v≥80 | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `cvd2` Virage descendant serré · 2 | v≥80 | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | CHUTE |
| `cvd4` Virage descendant serré · 4 | CHUTE | v≥150 | CHUTE | CHUTE | v≥150 | v≥150 | v≥150 | CHUTE |
| `cvdBig05` Virage descendant grand · ½ | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvdBig1` Virage descendant grand · 1 | OK | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `cvdBig2` Virage descendant grand · 2 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cvdBig4` Virage descendant grand · 4 | SAUT | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `cvdL05` Virage descendant serré ↰ · ½ | SAUT | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `cvdL1` Virage descendant serré ↰ · 1 | v≥80 | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `cvdL2` Virage descendant serré ↰ · 2 | v≥80 | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | CHUTE | v≥150 |
| `cvdL4` Virage descendant serré ↰ · 4 | CHUTE | CHUTE | v≥150 | CHUTE | v≥150 | v≥150 | CHUTE | v≥150 |
| `cvdBigL05` Virage descendant grand ↰ · ½ | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvdBigL1` Virage descendant grand ↰ · 1 | OK | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `cvdBigL2` Virage descendant grand ↰ · 2 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cvdBigL4` Virage descendant grand ↰ · 4 | SAUT | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |

## Plateforme et anneaux

| Pièce | Sol | Mur gauche | Mur droit | Plafond | Incliné gauche 45° | Incliné droit 45° | Surplomb gauche 135° | Surplomb droit 135° |
|---|---|---|---|---|---|---|---|---|
| `platform` Plateforme | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `ring` Anneau turbo | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `cpRing` Checkpoint aérien | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

## Loopings

| Pièce | Sol | Mur gauche | Mur droit | Plafond | Incliné gauche 45° | Incliné droit 45° | Surplomb gauche 135° | Surplomb droit 135° |
|---|---|---|---|---|---|---|---|---|
| `loop` Looping ↱ | OK | v≥150 | — | OK | — | — | — | — |
| `loopL` Looping ↰ | OK | — | v≥150 | OK | — | — | — | — |
| `loopBig` Grand looping ↱ | v≥150 | v≥150 | — | v≥150 | — | — | — | — |
| `loopBigL` Grand looping ↰ | v≥150 | — | v≥150 | v≥150 | — | — | — | — |
| `loopDouble` Double looping ↱ | OK | v≥150 | — | OK | — | — | — | — |
| `loopDoubleL` Double looping ↰ | OK | — | v≥150 | OK | — | — | — | — |
| `loopBigDouble` Grand looping ×2 ↱ | v≥150 | v≥150 | — | v≥150 | — | — | — | — |
| `loopBigDoubleL` Grand looping ×2 ↰ | v≥150 | — | v≥150 | v≥150 | — | — | — | — |
| `loopTriple` Triple looping ↱ | OK | RACCORD | — | OK | — | — | — | — |
| `loopTripleL` Triple looping ↰ | OK | — | RACCORD | OK | — | — | — | — |
| `loopBigTriple` Grand looping ×3 ↱ | v≥150 | RACCORD | — | v≥150 | — | — | — | — |
| `loopBigTripleL` Grand looping ×3 ↰ | v≥150 | — | RACCORD | v≥150 | — | — | — | — |

## Rubans (vrille, tire-bouchon, tubes, virages relevés, montée en L…)

| Pièce | Sol | Mur gauche | Mur droit | Plafond | Incliné gauche 45° | Incliné droit 45° | Surplomb gauche 135° | Surplomb droit 135° |
|---|---|---|---|---|---|---|---|---|
| `twist` Vrille | OK | v≥150 | v≥150 | OK | v≥150 | v≥150 | v≥150 | v≥150 |
| `ramp90` Montée en L | SAUT | — | — | SAUT | — | — | — | — |
| `wall` Mur vertical | v≥150 | — | — | SAUT | — | — | — | — |
| `crest90` Sommet du L | SAUT | — | — | SAUT | — | — | — | — |
| `bank` Virage relevé | OK | — | — | OK | — | — | — | — |
| `bankBig` Très grand virage relevé | OK | — | — | OK | — | — | — | — |
| `tube` Tube | OK | — | — | OK | — | — | — | — |
| `cork` Tire-bouchon ↻ | OK | v≥150 | — | OK | v≥150 | — | v≥150 | — |
| `corkL` Tire-bouchon ↺ | OK | v≥150 | — | OK | v≥150 | — | v≥150 | — |
| `tubeIn` Entrée de tube | OK | — | — | OK | — | — | — | — |
| `tubeMid` Section de tube | OK | — | — | OK | — | — | — | — |

## Bifurcations

| Pièce | Sol | Mur gauche | Mur droit | Plafond | Incliné gauche 45° | Incliné droit 45° | Surplomb gauche 135° | Surplomb droit 135° |
|---|---|---|---|---|---|---|---|---|
| `fork` Bifurcation ⑂→ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `forkL` Bifurcation ←⑂ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

## Transitions d'orientation

| Pièce | Sol | Mur gauche | Mur droit | Plafond | Incliné gauche 45° | Incliné droit 45° | Surplomb gauche 135° | Surplomb droit 135° |
|---|---|---|---|---|---|---|---|---|
| `tr01s` Transition sol → mur gauche | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr10s` Transition mur gauche → sol | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr02s` Transition sol → mur droit | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr20s` Transition mur droit → sol | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr13s` Transition mur gauche → plafond | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr31s` Transition plafond → mur gauche | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr23s` Transition mur droit → plafond | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr32s` Transition plafond → mur droit | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr01l` Transition sol → mur gauche (douce 2×2) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr10l` Transition mur gauche → sol (douce 2×2) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr02l` Transition sol → mur droit (douce 2×2) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr20l` Transition mur droit → sol (douce 2×2) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr13l` Transition mur gauche → plafond (douce 2×2) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr31l` Transition plafond → mur gauche (douce 2×2) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr23l` Transition mur droit → plafond (douce 2×2) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr32l` Transition plafond → mur droit (douce 2×2) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr04s` Transition sol → incliné gauche (45°) | OK | — | — | v≥150 | — | — | — | — |
| `tr40s` Transition incliné gauche → sol (45°) | OK | — | — | v≥150 | — | — | — | — |
| `tr41s` Transition incliné gauche → mur gauche (45°) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr14s` Transition mur gauche → incliné gauche (45°) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr16s` Transition mur gauche → surplomb gauche (45°) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr61s` Transition surplomb gauche → mur gauche (45°) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr63s` Transition surplomb gauche → plafond (45°) | v≥150 | — | — | OK | — | — | — | — |
| `tr36s` Transition plafond → surplomb gauche (45°) | v≥150 | — | — | OK | — | — | — | — |
| `tr37s` Transition plafond → surplomb droit (45°) | v≥150 | — | — | OK | — | — | — | — |
| `tr73s` Transition surplomb droit → plafond (45°) | v≥150 | — | — | OK | — | — | — | — |
| `tr72s` Transition surplomb droit → mur droit (45°) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr27s` Transition mur droit → surplomb droit (45°) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr25s` Transition mur droit → incliné droit (45°) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr52s` Transition incliné droit → mur droit (45°) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr50s` Transition incliné droit → sol (45°) | OK | — | — | v≥150 | — | — | — | — |
| `tr05s` Transition sol → incliné droit (45°) | OK | — | — | v≥150 | — | — | — | — |

