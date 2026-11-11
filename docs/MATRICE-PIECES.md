# Matrice de compatibilité des pièces (générée)

Générée par `node tools/matrice-pieces.mjs --update` : **ne pas modifier à la main**. Chaque case est un vrai circuit (départ → pièce → arrivée, avec les
transitions nécessaires) roulé par le moteur de physique actuel (`PHYS_VER` 34) au pilote automatique, à 80, 150 et 250 km/h de croisière.

| Code | Sens |
|---|---|
| OK | finit aux trois vitesses, sans quitter la route ni décoller |
| SAUT | finit, mais la voiture décolle plus de 0,35 s (rupture de pente, tremplin, bascule) |
| v≥N | ne tient qu'à partir de N km/h (au pilote automatique) |
| CHUTE | ne finit à aucune des trois vitesses |
| RACCORD | la chaîne ne peut pas être construite : aucune pièce du catalogue ne se raccorde à cette orientation (voir la raison) |
| — | orientation non proposée par l'éditeur (`flagAllowed`) |
| n/a | pièce sans route roulable (raison dans le fichier JSON) |

Totaux : CHUTE 29 · OK 56 · SAUT 62 · n/a 28 · v≥150 165 · v≥80 26 · — 82.

**Limites** : pilote automatique (pas un humain), voiture classique, sans revêtement ni obstacle, une seule pièce testée par chaîne, vitesse de croisière régulée.
Les raisons détaillées de chaque case (vitesses, chutes, raccords impossibles) sont dans `tools/compat/matrice-pieces.json`.

## Lignes droites, pentes et courbes

| Pièce | Sol | Mur gauche | Mur droit | Plafond |
|---|---|---|---|---|
| `straight` Ligne droite | OK | v≥150 | v≥150 | OK |
| `slope` Pente | SAUT | v≥150 | v≥150 | SAUT |
| `steep` Tremplin | SAUT | v≥150 | v≥150 | v≥80 |
| `checkpoint` Checkpoint | OK | — | — | OK |
| `start` Départ | n/a | n/a | n/a | n/a |
| `finish` Arrivée | n/a | n/a | n/a | n/a |
| `gentle` Pente douce (½ niveau) | SAUT | v≥150 | v≥150 | SAUT |
| `steep4` Ligne droite · inclinaison 4 | SAUT | v≥150 | v≥150 | v≥80 |
| `crv05` Courbe · inclinaison ½ | SAUT | v≥150 | v≥150 | SAUT |
| `crv1` Courbe · inclinaison 1 | SAUT | v≥150 | v≥150 | v≥80 |
| `crv2` Courbe · inclinaison 2 | v≥80 | v≥150 | v≥150 | v≥80 |
| `crv4` Courbe · inclinaison 4 | SAUT | v≥150 | v≥150 | v≥80 |
| `dn05` Pente descendante ½ | SAUT | v≥150 | v≥150 | SAUT |
| `dn1` Pente descendante 1 | SAUT | v≥150 | v≥150 | SAUT |
| `dn2` Pente descendante 2 | SAUT | v≥150 | v≥150 | SAUT |
| `dn4` Pente descendante 4 | SAUT | v≥150 | v≥150 | SAUT |
| `cro05` Courbe · fin de montée ½ | OK | v≥150 | v≥150 | OK |
| `cro1` Courbe · fin de montée 1 | OK | v≥150 | v≥150 | OK |
| `cro2` Courbe · fin de montée 2 | OK | v≥150 | v≥150 | OK |
| `cro4` Courbe · fin de montée 4 | OK | CHUTE | CHUTE | v≥80 |
| `cdi05` Courbe · début de descente ½ | OK | v≥150 | v≥150 | OK |
| `cdi1` Courbe · début de descente 1 | OK | v≥150 | v≥150 | OK |
| `cdi2` Courbe · début de descente 2 | OK | v≥150 | v≥150 | OK |
| `cdi4` Courbe · début de descente 4 | OK | CHUTE | CHUTE | SAUT |
| `cdo05` Courbe · fin de descente ½ | SAUT | v≥150 | v≥150 | SAUT |
| `cdo1` Courbe · fin de descente 1 | SAUT | v≥150 | v≥150 | SAUT |
| `cdo2` Courbe · fin de descente 2 | SAUT | v≥150 | v≥150 | SAUT |
| `cdo4` Courbe · fin de descente 4 | SAUT | v≥150 | v≥150 | SAUT |
| `crs05` Courbe en S · montée ½ | OK | v≥150 | v≥150 | OK |
| `crs1` Courbe en S · montée 1 | OK | v≥150 | v≥150 | SAUT |
| `cds05` Courbe en S · descente ½ | OK | v≥150 | v≥150 | OK |
| `cds1` Courbe en S · descente 1 | OK | v≥150 | v≥150 | SAUT |

## Virages

| Pièce | Sol | Mur gauche | Mur droit | Plafond |
|---|---|---|---|---|
| `curve` Virage serré | OK | v≥150 | v≥150 | OK |
| `bigcurve` Grand virage | OK | v≥150 | v≥150 | OK |
| `cpCurve` Checkpoint en virage | OK | — | — | OK |
| `hugecurve` Très grand virage plat | OK | v≥150 | v≥150 | OK |
| `cv05` Courbe serrée · inclinaison ½ | SAUT | v≥150 | v≥150 | SAUT |
| `cv1` Courbe serrée · inclinaison 1 | SAUT | v≥150 | v≥150 | v≥80 |
| `cv2` Courbe serrée · inclinaison 2 | v≥80 | v≥150 | CHUTE | v≥80 |
| `cv4` Courbe serrée · inclinaison 4 | v≥80 | CHUTE | CHUTE | v≥80 |
| `cvBig05` Grande courbe · inclinaison ½ | OK | v≥150 | v≥150 | OK |
| `cvBig1` Grande courbe · inclinaison 1 | SAUT | v≥150 | v≥150 | SAUT |
| `cvBig2` Grande courbe · inclinaison 2 | SAUT | v≥150 | v≥150 | SAUT |
| `cvBig4` Grande courbe · inclinaison 4 | SAUT | v≥150 | v≥150 | v≥80 |
| `cvL05` Courbe serrée ↰ · inclinaison ½ | SAUT | v≥150 | v≥150 | SAUT |
| `cvL1` Courbe serrée ↰ · inclinaison 1 | SAUT | v≥150 | v≥150 | v≥80 |
| `cvL2` Courbe serrée ↰ · inclinaison 2 | v≥80 | CHUTE | v≥150 | v≥80 |
| `cvL4` Courbe serrée ↰ · inclinaison 4 | v≥80 | CHUTE | CHUTE | v≥80 |
| `cvBigL05` Grande courbe ↰ · inclinaison ½ | OK | v≥150 | v≥150 | OK |
| `cvBigL1` Grande courbe ↰ · inclinaison 1 | SAUT | v≥150 | v≥150 | SAUT |
| `cvBigL2` Grande courbe ↰ · inclinaison 2 | SAUT | v≥150 | v≥150 | SAUT |
| `cvBigL4` Grande courbe ↰ · inclinaison 4 | SAUT | v≥150 | v≥150 | SAUT |
| `cvd05` Virage descendant serré · ½ | SAUT | v≥150 | v≥150 | SAUT |
| `cvd1` Virage descendant serré · 1 | SAUT | v≥150 | v≥150 | v≥80 |
| `cvd2` Virage descendant serré · 2 | v≥80 | v≥150 | v≥150 | v≥80 |
| `cvd4` Virage descendant serré · 4 | CHUTE | v≥150 | CHUTE | CHUTE |
| `cvdBig05` Virage descendant grand · ½ | OK | v≥150 | v≥150 | OK |
| `cvdBig1` Virage descendant grand · 1 | OK | v≥150 | v≥150 | SAUT |
| `cvdBig2` Virage descendant grand · 2 | SAUT | v≥150 | v≥150 | SAUT |
| `cvdBig4` Virage descendant grand · 4 | SAUT | v≥150 | v≥150 | v≥80 |
| `cvdL05` Virage descendant serré ↰ · ½ | SAUT | v≥150 | v≥150 | SAUT |
| `cvdL1` Virage descendant serré ↰ · 1 | SAUT | v≥150 | v≥150 | v≥80 |
| `cvdL2` Virage descendant serré ↰ · 2 | v≥80 | v≥150 | v≥150 | v≥80 |
| `cvdL4` Virage descendant serré ↰ · 4 | CHUTE | CHUTE | v≥150 | CHUTE |
| `cvdBigL05` Virage descendant grand ↰ · ½ | OK | v≥150 | v≥150 | OK |
| `cvdBigL1` Virage descendant grand ↰ · 1 | OK | v≥150 | v≥150 | SAUT |
| `cvdBigL2` Virage descendant grand ↰ · 2 | SAUT | v≥150 | v≥150 | SAUT |
| `cvdBigL4` Virage descendant grand ↰ · 4 | SAUT | v≥150 | v≥150 | v≥80 |

## Plateforme et anneaux

| Pièce | Sol | Mur gauche | Mur droit | Plafond |
|---|---|---|---|---|
| `platform` Plateforme | n/a | n/a | n/a | n/a |
| `ring` Anneau turbo | n/a | n/a | n/a | n/a |
| `cpRing` Checkpoint aérien | n/a | n/a | n/a | n/a |

## Loopings

| Pièce | Sol | Mur gauche | Mur droit | Plafond |
|---|---|---|---|---|
| `loop` Looping ↱ | v≥150 | — | — | v≥150 |
| `loopL` Looping ↰ | v≥150 | — | — | v≥150 |
| `loopBig` Grand looping ↱ | v≥150 | — | — | v≥150 |
| `loopBigL` Grand looping ↰ | v≥150 | — | — | v≥150 |
| `loopDouble` Double looping ↱ | v≥150 | — | — | v≥150 |
| `loopDoubleL` Double looping ↰ | v≥150 | — | — | v≥150 |
| `loopBigDouble` Grand looping ×2 ↱ | v≥150 | — | — | v≥150 |
| `loopBigDoubleL` Grand looping ×2 ↰ | v≥150 | — | — | v≥150 |
| `loopTriple` Triple looping ↱ | v≥150 | — | — | v≥150 |
| `loopTripleL` Triple looping ↰ | v≥150 | — | — | v≥150 |
| `loopBigTriple` Grand looping ×3 ↱ | v≥150 | — | — | v≥150 |
| `loopBigTripleL` Grand looping ×3 ↰ | v≥150 | — | — | v≥150 |

## Rubans (vrille, tire-bouchon, tubes, virages relevés, montée en L…)

| Pièce | Sol | Mur gauche | Mur droit | Plafond |
|---|---|---|---|---|
| `twist` Vrille | CHUTE | — | — | CHUTE |
| `ramp90` Montée en L | SAUT | — | — | CHUTE |
| `wall` Mur vertical | v≥150 | — | — | CHUTE |
| `crest90` Sommet du L | SAUT | — | — | CHUTE |
| `bank` Virage relevé | OK | — | — | OK |
| `bankBig` Très grand virage relevé | OK | — | — | OK |
| `tube` Tube | OK | — | — | OK |
| `cork` Tire-bouchon ↻ | OK | — | — | OK |
| `corkL` Tire-bouchon ↺ | OK | — | — | OK |
| `tubeIn` Entrée de tube | OK | — | — | OK |
| `tubeMid` Section de tube | OK | — | — | OK |

## Bifurcations

| Pièce | Sol | Mur gauche | Mur droit | Plafond |
|---|---|---|---|---|
| `fork` Bifurcation ⑂→ | n/a | n/a | n/a | n/a |
| `forkL` Bifurcation ←⑂ | n/a | n/a | n/a | n/a |

## Transitions d'orientation

| Pièce | Sol | Mur gauche | Mur droit | Plafond |
|---|---|---|---|---|
| `tr01s` Transition sol → mur gauche | v≥150 | — | — | CHUTE |
| `tr10s` Transition mur gauche → sol | v≥150 | — | — | CHUTE |
| `tr02s` Transition sol → mur droit | v≥150 | — | — | CHUTE |
| `tr20s` Transition mur droit → sol | v≥150 | — | — | CHUTE |
| `tr13s` Transition mur gauche → plafond | v≥150 | — | — | v≥150 |
| `tr31s` Transition plafond → mur gauche | v≥150 | — | — | v≥150 |
| `tr23s` Transition mur droit → plafond | v≥150 | — | — | v≥150 |
| `tr32s` Transition plafond → mur droit | v≥150 | — | — | v≥150 |
| `tr01l` Transition sol → mur gauche (douce 2×2) | v≥150 | — | — | CHUTE |
| `tr10l` Transition mur gauche → sol (douce 2×2) | v≥150 | — | — | CHUTE |
| `tr02l` Transition sol → mur droit (douce 2×2) | v≥150 | — | — | CHUTE |
| `tr20l` Transition mur droit → sol (douce 2×2) | v≥150 | — | — | CHUTE |
| `tr13l` Transition mur gauche → plafond (douce 2×2) | v≥150 | — | — | v≥150 |
| `tr31l` Transition plafond → mur gauche (douce 2×2) | v≥150 | — | — | v≥150 |
| `tr23l` Transition mur droit → plafond (douce 2×2) | v≥150 | — | — | v≥150 |
| `tr32l` Transition plafond → mur droit (douce 2×2) | v≥150 | — | — | v≥150 |

