# Matrice de compatibilité des pièces (générée)

Générée par `node tools/matrice-pieces.mjs --update` : **ne pas modifier à la main**. Chaque case est un vrai circuit (départ → pièce → arrivée, avec les
transitions nécessaires) roulé par le moteur de physique actuel (`PHYS_VER` 37) au pilote automatique, à 80, 150 et 250 km/h de croisière.

| Code | Sens |
|---|---|
| OK | finit aux trois vitesses, sans quitter la route ni décoller |
| SAUT | finit, mais la voiture décolle plus de 0,35 s (rupture de pente, tremplin, bascule) |
| v≥N | ne tient qu'à partir de N km/h (au pilote automatique) |
| CHUTE | ne finit à aucune des trois vitesses |
| RACCORD | la chaîne ne peut pas être construite : aucune pièce du catalogue ne se raccorde à cette orientation (voir la raison) |
| — | orientation non proposée par l'éditeur (`flagAllowed`) |
| n/a | pièce sans route roulable (raison dans le fichier JSON) |

Totaux : CHUTE 75 · OK 426 · RACCORD 4 · SAUT 188 · n/a 120 · v≥150 592 · v≥80 35 · — 2096.

**Limites** : pilote automatique (pas un humain), voiture classique, sans revêtement ni obstacle, une seule pièce testée par chaîne, vitesse de croisière régulée.
Les raisons détaillées de chaque case (vitesses, chutes, raccords impossibles) sont dans `tools/compat/matrice-pieces.json`.

## Lignes droites, pentes et courbes

| Pièce | Sol | Mur gauche | Mur droit | Plafond | Incliné gauche 45° | Incliné droit 45° | Surplomb gauche 135° | Surplomb droit 135° |
|---|---|---|---|---|---|---|---|---|
| `straight` Ligne droite | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `slope` Pente | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `steep` Tremplin | SAUT | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `checkpoint` Checkpoint | OK | — | — | OK | — | — | — | — |
| `start` Départ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `finish` Arrivée | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `gentle` Pente douce (½ niveau) | SAUT | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `steep4` Ligne droite · inclinaison 4 | SAUT | CHUTE | CHUTE | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `crv05` Courbe · inclinaison ½ | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `crv1` Courbe · inclinaison 1 | SAUT | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `crv2` Courbe · inclinaison 2 | v≥80 | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `crv4` Courbe · inclinaison 4 | SAUT | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | CHUTE | CHUTE |
| `dn05` Pente descendante ½ | SAUT | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `dn1` Pente descendante 1 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `dn2` Pente descendante 2 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `dn4` Pente descendante 4 | SAUT | CHUTE | CHUTE | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cro05` Courbe · fin de montée ½ | OK | v≥150 | v≥150 | OK | v≥150 | v≥150 | v≥150 | v≥150 |
| `cro1` Courbe · fin de montée 1 | OK | v≥150 | v≥150 | OK | v≥150 | v≥150 | v≥150 | v≥150 |
| `cro2` Courbe · fin de montée 2 | OK | v≥150 | v≥150 | OK | v≥150 | v≥150 | v≥150 | v≥150 |
| `cro4` Courbe · fin de montée 4 | OK | CHUTE | CHUTE | v≥80 | CHUTE | CHUTE | v≥150 | v≥150 |
| `cdi05` Courbe · début de descente ½ | OK | v≥150 | v≥150 | OK | v≥150 | v≥150 | v≥150 | v≥150 |
| `cdi1` Courbe · début de descente 1 | OK | v≥150 | v≥150 | OK | v≥150 | v≥150 | v≥150 | v≥150 |
| `cdi2` Courbe · début de descente 2 | OK | CHUTE | CHUTE | OK | v≥150 | v≥150 | v≥150 | v≥150 |
| `cdi4` Courbe · début de descente 4 | OK | CHUTE | CHUTE | SAUT | CHUTE | CHUTE | CHUTE | CHUTE |
| `cdo05` Courbe · fin de descente ½ | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cdo1` Courbe · fin de descente 1 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cdo2` Courbe · fin de descente 2 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cdo4` Courbe · fin de descente 4 | SAUT | v≥150 | v≥150 | SAUT | SAUT | SAUT | CHUTE | CHUTE |
| `crs05` Courbe en S · montée ½ | OK | v≥150 | v≥150 | OK | v≥150 | v≥150 | v≥150 | v≥150 |
| `crs1` Courbe en S · montée 1 | OK | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cds05` Courbe en S · descente ½ | OK | v≥150 | v≥150 | OK | v≥150 | v≥150 | v≥150 | v≥150 |
| `cds1` Courbe en S · descente 1 | OK | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `narrow` Route étroite | OK | — | — | OK | — | — | — | — |
| `narrowIn` Rétrécissement | OK | — | — | OK | — | — | — | — |
| `wideIn` Élargissement | OK | — | — | OK | — | — | — | — |
| `wide` Route large | OK | — | — | OK | — | — | — | — |
| `crs2` Courbe en S · montée 2 | SAUT | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `crs4` Courbe en S · montée 4 | SAUT | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `cds2` Courbe en S · descente 2 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cds4` Courbe en S · descente 4 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `nslU05` Route étroite · montée ½ | SAUT | — | — | — | — | — | — | — |
| `nslU1` Route étroite · montée 1 | SAUT | — | — | — | — | — | — | — |
| `nslU2` Route étroite · montée 2 | SAUT | — | — | — | — | — | — | — |
| `nslU4` Route étroite · montée 4 | SAUT | — | — | — | — | — | — | — |
| `nslD05` Route étroite · descente ½ | SAUT | — | — | — | — | — | — | — |
| `nslD1` Route étroite · descente 1 | SAUT | — | — | — | — | — | — | — |
| `nslD2` Route étroite · descente 2 | SAUT | — | — | — | — | — | — | — |
| `nslD4` Route étroite · descente 4 | SAUT | — | — | — | — | — | — | — |
| `ncrv05` Courbe étroite · début de montée ½ | SAUT | — | — | — | — | — | — | — |
| `ncrv1` Courbe étroite · début de montée 1 | SAUT | — | — | — | — | — | — | — |
| `ncrv2` Courbe étroite · début de montée 2 | SAUT | — | — | — | — | — | — | — |
| `ncrv4` Courbe étroite · début de montée 4 | SAUT | — | — | — | — | — | — | — |
| `ncro05` Courbe étroite · fin de montée ½ | OK | — | — | — | — | — | — | — |
| `ncro1` Courbe étroite · fin de montée 1 | OK | — | — | — | — | — | — | — |
| `ncro2` Courbe étroite · fin de montée 2 | OK | — | — | — | — | — | — | — |
| `ncro4` Courbe étroite · fin de montée 4 | OK | — | — | — | — | — | — | — |
| `ncrs05` Courbe étroite · montée en S ½ | OK | — | — | — | — | — | — | — |
| `ncrs1` Courbe étroite · montée en S 1 | OK | — | — | — | — | — | — | — |
| `ncrs2` Courbe étroite · montée en S 2 | SAUT | — | — | — | — | — | — | — |
| `ncrs4` Courbe étroite · montée en S 4 | SAUT | — | — | — | — | — | — | — |
| `ncdi05` Courbe étroite · début de descente ½ | OK | — | — | — | — | — | — | — |
| `ncdi1` Courbe étroite · début de descente 1 | OK | — | — | — | — | — | — | — |
| `ncdi2` Courbe étroite · début de descente 2 | OK | — | — | — | — | — | — | — |
| `ncdi4` Courbe étroite · début de descente 4 | SAUT | — | — | — | — | — | — | — |
| `ncdo05` Courbe étroite · fin de descente ½ | SAUT | — | — | — | — | — | — | — |
| `ncdo1` Courbe étroite · fin de descente 1 | SAUT | — | — | — | — | — | — | — |
| `ncdo2` Courbe étroite · fin de descente 2 | SAUT | — | — | — | — | — | — | — |
| `ncdo4` Courbe étroite · fin de descente 4 | SAUT | — | — | — | — | — | — | — |
| `ncds05` Courbe étroite · descente en S ½ | OK | — | — | — | — | — | — | — |
| `ncds1` Courbe étroite · descente en S 1 | OK | — | — | — | — | — | — | — |
| `ncds2` Courbe étroite · descente en S 2 | SAUT | — | — | — | — | — | — | — |
| `ncds4` Courbe étroite · descente en S 4 | SAUT | — | — | — | — | — | — | — |
| `wslU05` Route large · montée ½ | SAUT | — | — | — | — | — | — | — |
| `wslU1` Route large · montée 1 | SAUT | — | — | — | — | — | — | — |
| `wslU2` Route large · montée 2 | SAUT | — | — | — | — | — | — | — |
| `wslU4` Route large · montée 4 | SAUT | — | — | — | — | — | — | — |
| `wslD05` Route large · descente ½ | SAUT | — | — | — | — | — | — | — |
| `wslD1` Route large · descente 1 | SAUT | — | — | — | — | — | — | — |
| `wslD2` Route large · descente 2 | SAUT | — | — | — | — | — | — | — |
| `wslD4` Route large · descente 4 | SAUT | — | — | — | — | — | — | — |
| `wcrv05` Courbe large · début de montée ½ | SAUT | — | — | — | — | — | — | — |
| `wcrv1` Courbe large · début de montée 1 | SAUT | — | — | — | — | — | — | — |
| `wcrv2` Courbe large · début de montée 2 | SAUT | — | — | — | — | — | — | — |
| `wcrv4` Courbe large · début de montée 4 | SAUT | — | — | — | — | — | — | — |
| `wcro05` Courbe large · fin de montée ½ | OK | — | — | — | — | — | — | — |
| `wcro1` Courbe large · fin de montée 1 | OK | — | — | — | — | — | — | — |
| `wcro2` Courbe large · fin de montée 2 | OK | — | — | — | — | — | — | — |
| `wcro4` Courbe large · fin de montée 4 | OK | — | — | — | — | — | — | — |
| `wcrs05` Courbe large · montée en S ½ | OK | — | — | — | — | — | — | — |
| `wcrs1` Courbe large · montée en S 1 | OK | — | — | — | — | — | — | — |
| `wcrs2` Courbe large · montée en S 2 | OK | — | — | — | — | — | — | — |
| `wcrs4` Courbe large · montée en S 4 | OK | — | — | — | — | — | — | — |
| `wcdi05` Courbe large · début de descente ½ | OK | — | — | — | — | — | — | — |
| `wcdi1` Courbe large · début de descente 1 | OK | — | — | — | — | — | — | — |
| `wcdi2` Courbe large · début de descente 2 | OK | — | — | — | — | — | — | — |
| `wcdi4` Courbe large · début de descente 4 | OK | — | — | — | — | — | — | — |
| `wcdo05` Courbe large · fin de descente ½ | SAUT | — | — | — | — | — | — | — |
| `wcdo1` Courbe large · fin de descente 1 | SAUT | — | — | — | — | — | — | — |
| `wcdo2` Courbe large · fin de descente 2 | SAUT | — | — | — | — | — | — | — |
| `wcdo4` Courbe large · fin de descente 4 | SAUT | — | — | — | — | — | — | — |
| `wcds05` Courbe large · descente en S ½ | OK | — | — | — | — | — | — | — |
| `wcds1` Courbe large · descente en S 1 | OK | — | — | — | — | — | — | — |
| `wcds2` Courbe large · descente en S 2 | OK | — | — | — | — | — | — | — |
| `wcds4` Courbe large · descente en S 4 | SAUT | — | — | — | — | — | — | — |
| `wideInN` Élargissement depuis étroite | OK | — | — | — | — | — | — | — |

## Virages

| Pièce | Sol | Mur gauche | Mur droit | Plafond | Incliné gauche 45° | Incliné droit 45° | Surplomb gauche 135° | Surplomb droit 135° |
|---|---|---|---|---|---|---|---|---|
| `curve` Virage serré | OK | v≥150 | v≥150 | OK | v≥80 | v≥80 | v≥150 | CHUTE |
| `bigcurve` Grand virage | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cpCurve` Checkpoint en virage | OK | — | — | OK | — | — | — | — |
| `hugecurve` Très grand virage plat | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cv05` Courbe serrée · inclinaison ½ | OK | v≥150 | v≥150 | OK | OK | v≥80 | v≥150 | CHUTE |
| `cv1` Courbe serrée · inclinaison 1 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | CHUTE | CHUTE | CHUTE |
| `cv2` Courbe serrée · inclinaison 2 | SAUT | v≥150 | CHUTE | SAUT | v≥150 | CHUTE | CHUTE | v≥150 |
| `cv4` Courbe serrée · inclinaison 4 | SAUT | CHUTE | CHUTE | SAUT | v≥150 | CHUTE | CHUTE | CHUTE |
| `cvBig05` Grande courbe · inclinaison ½ | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvBig1` Grande courbe · inclinaison 1 | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvBig2` Grande courbe · inclinaison 2 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cvBig4` Grande courbe · inclinaison 4 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cvL05` Courbe serrée ↰ · inclinaison ½ | OK | v≥150 | v≥150 | OK | v≥80 | OK | CHUTE | v≥150 |
| `cvL1` Courbe serrée ↰ · inclinaison 1 | SAUT | v≥150 | v≥150 | SAUT | CHUTE | v≥150 | CHUTE | CHUTE |
| `cvL2` Courbe serrée ↰ · inclinaison 2 | SAUT | CHUTE | v≥150 | SAUT | CHUTE | v≥150 | v≥150 | CHUTE |
| `cvL4` Courbe serrée ↰ · inclinaison 4 | SAUT | CHUTE | CHUTE | SAUT | CHUTE | v≥150 | CHUTE | CHUTE |
| `cvBigL05` Grande courbe ↰ · inclinaison ½ | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvBigL1` Grande courbe ↰ · inclinaison 1 | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvBigL2` Grande courbe ↰ · inclinaison 2 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cvBigL4` Grande courbe ↰ · inclinaison 4 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cvd05` Virage descendant serré · ½ | SAUT | v≥150 | v≥150 | SAUT | v≥80 | v≥80 | v≥150 | CHUTE |
| `cvd1` Virage descendant serré · 1 | SAUT | v≥150 | v≥150 | v≥80 | CHUTE | CHUTE | v≥150 | CHUTE |
| `cvd2` Virage descendant serré · 2 | v≥80 | v≥150 | v≥150 | v≥80 | CHUTE | v≥150 | v≥150 | CHUTE |
| `cvd4` Virage descendant serré · 4 | CHUTE | CHUTE | CHUTE | CHUTE | CHUTE | CHUTE | v≥150 | CHUTE |
| `cvdBig05` Virage descendant grand · ½ | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvdBig1` Virage descendant grand · 1 | OK | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `cvdBig2` Virage descendant grand · 2 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cvdBig4` Virage descendant grand · 4 | SAUT | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `cvdL05` Virage descendant serré ↰ · ½ | SAUT | v≥150 | v≥150 | SAUT | v≥80 | v≥80 | CHUTE | v≥150 |
| `cvdL1` Virage descendant serré ↰ · 1 | SAUT | v≥150 | v≥150 | v≥80 | CHUTE | CHUTE | CHUTE | v≥150 |
| `cvdL2` Virage descendant serré ↰ · 2 | v≥80 | v≥150 | v≥150 | v≥80 | v≥150 | CHUTE | CHUTE | v≥150 |
| `cvdL4` Virage descendant serré ↰ · 4 | CHUTE | CHUTE | CHUTE | CHUTE | CHUTE | CHUTE | CHUTE | v≥150 |
| `cvdBigL05` Virage descendant grand ↰ · ½ | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvdBigL1` Virage descendant grand ↰ · 1 | OK | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `cvdBigL2` Virage descendant grand ↰ · 2 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cvdBigL4` Virage descendant grand ↰ · 4 | SAUT | v≥150 | v≥150 | v≥80 | v≥150 | v≥150 | v≥150 | v≥150 |
| `giantcurve` Virage géant | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvGiant05` Virage géant montant · ½ | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvGiant1` Virage géant montant · 1 | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvGiant2` Virage géant montant · 2 | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvGiant4` Virage géant montant · 4 | SAUT | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `cvGiantL05` Virage géant montant ↰ · ½ | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvGiantL1` Virage géant montant ↰ · 1 | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvGiantL2` Virage géant montant ↰ · 2 | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvGiantL4` Virage géant montant ↰ · 4 | SAUT | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `cvdGiant05` Virage géant descendant · ½ | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvdGiant1` Virage géant descendant · 1 | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvdGiant2` Virage géant descendant · 2 | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvdGiant4` Virage géant descendant · 4 | SAUT | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `cvdGiantL05` Virage géant descendant ↰ · ½ | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvdGiantL1` Virage géant descendant ↰ · 1 | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvdGiantL2` Virage géant descendant ↰ · 2 | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvdGiantL4` Virage géant descendant ↰ · 4 | SAUT | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `cvHuge05` Très grand virage montant · ½ | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvHuge1` Très grand virage montant · 1 | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvHuge2` Très grand virage montant · 2 | SAUT | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `cvHuge4` Très grand virage montant · 4 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cvHugeL05` Très grand virage montant ↰ · ½ | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvHugeL1` Très grand virage montant ↰ · 1 | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvHugeL2` Très grand virage montant ↰ · 2 | SAUT | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `cvHugeL4` Très grand virage montant ↰ · 4 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cvdHuge05` Très grand virage descendant · ½ | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvdHuge1` Très grand virage descendant · 1 | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvdHuge2` Très grand virage descendant · 2 | SAUT | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `cvdHuge4` Très grand virage descendant · 4 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `cvdHugeL05` Très grand virage descendant ↰ · ½ | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvdHugeL1` Très grand virage descendant ↰ · 1 | OK | v≥150 | v≥150 | OK | OK | OK | v≥150 | v≥150 |
| `cvdHugeL2` Très grand virage descendant ↰ · 2 | SAUT | v≥150 | v≥150 | SAUT | OK | OK | v≥150 | v≥150 |
| `cvdHugeL4` Très grand virage descendant ↰ · 4 | SAUT | v≥150 | v≥150 | SAUT | v≥150 | v≥150 | v≥150 | v≥150 |
| `ncurve` Virage serré · route étroite | OK | — | — | — | — | — | — | — |
| `ncv05` Virage serré montant · ½ · route étroite | OK | — | — | — | — | — | — | — |
| `ncv1` Virage serré montant · 1 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncv2` Virage serré montant · 2 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncv4` Virage serré montant · 4 · route étroite | v≥80 | — | — | — | — | — | — | — |
| `ncvL05` Virage serré montant ↰ · ½ · route étroite | OK | — | — | — | — | — | — | — |
| `ncvL1` Virage serré montant ↰ · 1 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvL2` Virage serré montant ↰ · 2 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvL4` Virage serré montant ↰ · 4 · route étroite | v≥80 | — | — | — | — | — | — | — |
| `ncvd05` Virage serré descendant · ½ · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvd1` Virage serré descendant · 1 · route étroite | v≥80 | — | — | — | — | — | — | — |
| `ncvd2` Virage serré descendant · 2 · route étroite | v≥80 | — | — | — | — | — | — | — |
| `ncvd4` Virage serré descendant · 4 · route étroite | CHUTE | — | — | — | — | — | — | — |
| `ncvdL05` Virage serré descendant ↰ · ½ · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvdL1` Virage serré descendant ↰ · 1 · route étroite | v≥80 | — | — | — | — | — | — | — |
| `ncvdL2` Virage serré descendant ↰ · 2 · route étroite | v≥80 | — | — | — | — | — | — | — |
| `ncvdL4` Virage serré descendant ↰ · 4 · route étroite | CHUTE | — | — | — | — | — | — | — |
| `nbigcurve` Virage grand · route étroite | OK | — | — | — | — | — | — | — |
| `ncvBig05` Virage grand montant · ½ · route étroite | OK | — | — | — | — | — | — | — |
| `ncvBig1` Virage grand montant · 1 · route étroite | OK | — | — | — | — | — | — | — |
| `ncvBig2` Virage grand montant · 2 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvBig4` Virage grand montant · 4 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvBigL05` Virage grand montant ↰ · ½ · route étroite | OK | — | — | — | — | — | — | — |
| `ncvBigL1` Virage grand montant ↰ · 1 · route étroite | OK | — | — | — | — | — | — | — |
| `ncvBigL2` Virage grand montant ↰ · 2 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvBigL4` Virage grand montant ↰ · 4 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvdBig05` Virage grand descendant · ½ · route étroite | OK | — | — | — | — | — | — | — |
| `ncvdBig1` Virage grand descendant · 1 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvdBig2` Virage grand descendant · 2 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvdBig4` Virage grand descendant · 4 · route étroite | v≥80 | — | — | — | — | — | — | — |
| `ncvdBigL05` Virage grand descendant ↰ · ½ · route étroite | OK | — | — | — | — | — | — | — |
| `ncvdBigL1` Virage grand descendant ↰ · 1 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvdBigL2` Virage grand descendant ↰ · 2 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvdBigL4` Virage grand descendant ↰ · 4 · route étroite | v≥80 | — | — | — | — | — | — | — |
| `nhugecurve` Virage très grand · route étroite | OK | — | — | — | — | — | — | — |
| `ncvHuge05` Virage très grand montant · ½ · route étroite | OK | — | — | — | — | — | — | — |
| `ncvHuge1` Virage très grand montant · 1 · route étroite | OK | — | — | — | — | — | — | — |
| `ncvHuge2` Virage très grand montant · 2 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvHuge4` Virage très grand montant · 4 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvHugeL05` Virage très grand montant ↰ · ½ · route étroite | OK | — | — | — | — | — | — | — |
| `ncvHugeL1` Virage très grand montant ↰ · 1 · route étroite | OK | — | — | — | — | — | — | — |
| `ncvHugeL2` Virage très grand montant ↰ · 2 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvHugeL4` Virage très grand montant ↰ · 4 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvdHuge05` Virage très grand descendant · ½ · route étroite | OK | — | — | — | — | — | — | — |
| `ncvdHuge1` Virage très grand descendant · 1 · route étroite | OK | — | — | — | — | — | — | — |
| `ncvdHuge2` Virage très grand descendant · 2 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvdHuge4` Virage très grand descendant · 4 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvdHugeL05` Virage très grand descendant ↰ · ½ · route étroite | OK | — | — | — | — | — | — | — |
| `ncvdHugeL1` Virage très grand descendant ↰ · 1 · route étroite | OK | — | — | — | — | — | — | — |
| `ncvdHugeL2` Virage très grand descendant ↰ · 2 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvdHugeL4` Virage très grand descendant ↰ · 4 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ngiantcurve` Virage géant · route étroite | OK | — | — | — | — | — | — | — |
| `ncvGiant05` Virage géant montant · ½ · route étroite | OK | — | — | — | — | — | — | — |
| `ncvGiant1` Virage géant montant · 1 · route étroite | OK | — | — | — | — | — | — | — |
| `ncvGiant2` Virage géant montant · 2 · route étroite | OK | — | — | — | — | — | — | — |
| `ncvGiant4` Virage géant montant · 4 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvGiantL05` Virage géant montant ↰ · ½ · route étroite | OK | — | — | — | — | — | — | — |
| `ncvGiantL1` Virage géant montant ↰ · 1 · route étroite | OK | — | — | — | — | — | — | — |
| `ncvGiantL2` Virage géant montant ↰ · 2 · route étroite | OK | — | — | — | — | — | — | — |
| `ncvGiantL4` Virage géant montant ↰ · 4 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvdGiant05` Virage géant descendant · ½ · route étroite | OK | — | — | — | — | — | — | — |
| `ncvdGiant1` Virage géant descendant · 1 · route étroite | OK | — | — | — | — | — | — | — |
| `ncvdGiant2` Virage géant descendant · 2 · route étroite | OK | — | — | — | — | — | — | — |
| `ncvdGiant4` Virage géant descendant · 4 · route étroite | SAUT | — | — | — | — | — | — | — |
| `ncvdGiantL05` Virage géant descendant ↰ · ½ · route étroite | OK | — | — | — | — | — | — | — |
| `ncvdGiantL1` Virage géant descendant ↰ · 1 · route étroite | OK | — | — | — | — | — | — | — |
| `ncvdGiantL2` Virage géant descendant ↰ · 2 · route étroite | OK | — | — | — | — | — | — | — |
| `ncvdGiantL4` Virage géant descendant ↰ · 4 · route étroite | SAUT | — | — | — | — | — | — | — |
| `wbigcurve` Virage grand · route large | OK | — | — | — | — | — | — | — |
| `wcvBig05` Virage grand montant · ½ · route large | OK | — | — | — | — | — | — | — |
| `wcvBig1` Virage grand montant · 1 · route large | OK | — | — | — | — | — | — | — |
| `wcvBig2` Virage grand montant · 2 · route large | SAUT | — | — | — | — | — | — | — |
| `wcvBig4` Virage grand montant · 4 · route large | v≥80 | — | — | — | — | — | — | — |
| `wcvBigL05` Virage grand montant ↰ · ½ · route large | OK | — | — | — | — | — | — | — |
| `wcvBigL1` Virage grand montant ↰ · 1 · route large | OK | — | — | — | — | — | — | — |
| `wcvBigL2` Virage grand montant ↰ · 2 · route large | SAUT | — | — | — | — | — | — | — |
| `wcvBigL4` Virage grand montant ↰ · 4 · route large | v≥80 | — | — | — | — | — | — | — |
| `wcvdBig05` Virage grand descendant · ½ · route large | OK | — | — | — | — | — | — | — |
| `wcvdBig1` Virage grand descendant · 1 · route large | SAUT | — | — | — | — | — | — | — |
| `wcvdBig2` Virage grand descendant · 2 · route large | SAUT | — | — | — | — | — | — | — |
| `wcvdBig4` Virage grand descendant · 4 · route large | SAUT | — | — | — | — | — | — | — |
| `wcvdBigL05` Virage grand descendant ↰ · ½ · route large | OK | — | — | — | — | — | — | — |
| `wcvdBigL1` Virage grand descendant ↰ · 1 · route large | SAUT | — | — | — | — | — | — | — |
| `wcvdBigL2` Virage grand descendant ↰ · 2 · route large | SAUT | — | — | — | — | — | — | — |
| `wcvdBigL4` Virage grand descendant ↰ · 4 · route large | SAUT | — | — | — | — | — | — | — |
| `whugecurve` Virage très grand · route large | OK | — | — | — | — | — | — | — |
| `wcvHuge05` Virage très grand montant · ½ · route large | OK | — | — | — | — | — | — | — |
| `wcvHuge1` Virage très grand montant · 1 · route large | OK | — | — | — | — | — | — | — |
| `wcvHuge2` Virage très grand montant · 2 · route large | SAUT | — | — | — | — | — | — | — |
| `wcvHuge4` Virage très grand montant · 4 · route large | SAUT | — | — | — | — | — | — | — |
| `wcvHugeL05` Virage très grand montant ↰ · ½ · route large | OK | — | — | — | — | — | — | — |
| `wcvHugeL1` Virage très grand montant ↰ · 1 · route large | OK | — | — | — | — | — | — | — |
| `wcvHugeL2` Virage très grand montant ↰ · 2 · route large | SAUT | — | — | — | — | — | — | — |
| `wcvHugeL4` Virage très grand montant ↰ · 4 · route large | SAUT | — | — | — | — | — | — | — |
| `wcvdHuge05` Virage très grand descendant · ½ · route large | OK | — | — | — | — | — | — | — |
| `wcvdHuge1` Virage très grand descendant · 1 · route large | OK | — | — | — | — | — | — | — |
| `wcvdHuge2` Virage très grand descendant · 2 · route large | SAUT | — | — | — | — | — | — | — |
| `wcvdHuge4` Virage très grand descendant · 4 · route large | SAUT | — | — | — | — | — | — | — |
| `wcvdHugeL05` Virage très grand descendant ↰ · ½ · route large | OK | — | — | — | — | — | — | — |
| `wcvdHugeL1` Virage très grand descendant ↰ · 1 · route large | OK | — | — | — | — | — | — | — |
| `wcvdHugeL2` Virage très grand descendant ↰ · 2 · route large | SAUT | — | — | — | — | — | — | — |
| `wcvdHugeL4` Virage très grand descendant ↰ · 4 · route large | SAUT | — | — | — | — | — | — | — |
| `wgiantcurve` Virage géant · route large | OK | — | — | — | — | — | — | — |
| `wcvGiant05` Virage géant montant · ½ · route large | OK | — | — | — | — | — | — | — |
| `wcvGiant1` Virage géant montant · 1 · route large | OK | — | — | — | — | — | — | — |
| `wcvGiant2` Virage géant montant · 2 · route large | OK | — | — | — | — | — | — | — |
| `wcvGiant4` Virage géant montant · 4 · route large | SAUT | — | — | — | — | — | — | — |
| `wcvGiantL05` Virage géant montant ↰ · ½ · route large | OK | — | — | — | — | — | — | — |
| `wcvGiantL1` Virage géant montant ↰ · 1 · route large | OK | — | — | — | — | — | — | — |
| `wcvGiantL2` Virage géant montant ↰ · 2 · route large | OK | — | — | — | — | — | — | — |
| `wcvGiantL4` Virage géant montant ↰ · 4 · route large | SAUT | — | — | — | — | — | — | — |
| `wcvdGiant05` Virage géant descendant · ½ · route large | OK | — | — | — | — | — | — | — |
| `wcvdGiant1` Virage géant descendant · 1 · route large | OK | — | — | — | — | — | — | — |
| `wcvdGiant2` Virage géant descendant · 2 · route large | OK | — | — | — | — | — | — | — |
| `wcvdGiant4` Virage géant descendant · 4 · route large | SAUT | — | — | — | — | — | — | — |
| `wcvdGiantL05` Virage géant descendant ↰ · ½ · route large | OK | — | — | — | — | — | — | — |
| `wcvdGiantL1` Virage géant descendant ↰ · 1 · route large | OK | — | — | — | — | — | — | — |
| `wcvdGiantL2` Virage géant descendant ↰ · 2 · route large | OK | — | — | — | — | — | — | — |
| `wcvdGiantL4` Virage géant descendant ↰ · 4 · route large | SAUT | — | — | — | — | — | — | — |

## Plateforme et anneaux

| Pièce | Sol | Mur gauche | Mur droit | Plafond | Incliné gauche 45° | Incliné droit 45° | Surplomb gauche 135° | Surplomb droit 135° |
|---|---|---|---|---|---|---|---|---|
| `platform` Plateforme | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `ring` Anneau turbo | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `cpRing` Checkpoint aérien | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `plate2` Plaque 2×2 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `plate3` Plaque 3×3 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `tri1` Plaque triangle | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `tri2` Plaque triangle 2×2 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `tri3` Plaque triangle 3×3 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `sec1` Plaque quart de disque | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `sec2` Plaque quart de disque 2×2 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `sec3` Plaque quart de disque 3×3 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

## Loopings

| Pièce | Sol | Mur gauche | Mur droit | Plafond | Incliné gauche 45° | Incliné droit 45° | Surplomb gauche 135° | Surplomb droit 135° |
|---|---|---|---|---|---|---|---|---|
| `loop` Looping ↱ | v≥150 | v≥150 | — | v≥150 | — | — | — | — |
| `loopL` Looping ↰ | v≥150 | — | v≥150 | v≥150 | — | — | — | — |
| `loopBig` Grand looping ↱ | v≥150 | v≥150 | — | v≥150 | — | — | — | — |
| `loopBigL` Grand looping ↰ | v≥150 | — | v≥150 | v≥150 | — | — | — | — |
| `loopDouble` Double looping ↱ | v≥150 | v≥150 | — | v≥150 | — | — | — | — |
| `loopDoubleL` Double looping ↰ | v≥150 | — | v≥150 | v≥150 | — | — | — | — |
| `loopBigDouble` Grand looping ×2 ↱ | v≥150 | v≥150 | — | v≥150 | — | — | — | — |
| `loopBigDoubleL` Grand looping ×2 ↰ | v≥150 | — | v≥150 | v≥150 | — | — | — | — |
| `loopTriple` Triple looping ↱ | v≥150 | RACCORD | — | v≥150 | — | — | — | — |
| `loopTripleL` Triple looping ↰ | v≥150 | — | RACCORD | v≥150 | — | — | — | — |
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
| `loopTop` Sommet de looping ↱ | v≥150 | — | — | OK | — | — | — | — |
| `loopTopL` Sommet de looping ↰ | v≥150 | — | — | OK | — | — | — | — |
| `tubeTurn` Tube en virage ↱ | SAUT | — | — | SAUT | — | — | — | — |
| `tubeTurnL` Tube en virage ↰ | SAUT | — | — | SAUT | — | — | — | — |
| `bankGiant` Virage géant relevé | OK | — | — | OK | — | — | — | — |
| `bankU05` Virage grand relevé montant · ½ | OK | — | — | OK | — | — | — | — |
| `bankU1` Virage grand relevé montant · 1 | OK | — | — | OK | — | — | — | — |
| `bankU2` Virage grand relevé montant · 2 | OK | — | — | OK | — | — | — | — |
| `bankU4` Virage grand relevé montant · 4 | OK | — | — | OK | — | — | — | — |
| `bankUL05` Virage grand relevé montant ↰ · ½ | OK | — | — | OK | — | — | — | — |
| `bankUL1` Virage grand relevé montant ↰ · 1 | OK | — | — | OK | — | — | — | — |
| `bankUL2` Virage grand relevé montant ↰ · 2 | OK | — | — | OK | — | — | — | — |
| `bankUL4` Virage grand relevé montant ↰ · 4 | OK | — | — | OK | — | — | — | — |
| `bankD05` Virage grand relevé descendant · ½ | OK | — | — | OK | — | — | — | — |
| `bankD1` Virage grand relevé descendant · 1 | OK | — | — | OK | — | — | — | — |
| `bankD2` Virage grand relevé descendant · 2 | OK | — | — | OK | — | — | — | — |
| `bankD4` Virage grand relevé descendant · 4 | OK | — | — | OK | — | — | — | — |
| `bankDL05` Virage grand relevé descendant ↰ · ½ | OK | — | — | OK | — | — | — | — |
| `bankDL1` Virage grand relevé descendant ↰ · 1 | OK | — | — | OK | — | — | — | — |
| `bankDL2` Virage grand relevé descendant ↰ · 2 | OK | — | — | OK | — | — | — | — |
| `bankDL4` Virage grand relevé descendant ↰ · 4 | OK | — | — | OK | — | — | — | — |
| `bankBigU05` Virage très grand relevé montant · ½ | OK | — | — | OK | — | — | — | — |
| `bankBigU1` Virage très grand relevé montant · 1 | OK | — | — | OK | — | — | — | — |
| `bankBigU2` Virage très grand relevé montant · 2 | OK | — | — | OK | — | — | — | — |
| `bankBigU4` Virage très grand relevé montant · 4 | OK | — | — | OK | — | — | — | — |
| `bankBigUL05` Virage très grand relevé montant ↰ · ½ | OK | — | — | OK | — | — | — | — |
| `bankBigUL1` Virage très grand relevé montant ↰ · 1 | OK | — | — | OK | — | — | — | — |
| `bankBigUL2` Virage très grand relevé montant ↰ · 2 | OK | — | — | OK | — | — | — | — |
| `bankBigUL4` Virage très grand relevé montant ↰ · 4 | OK | — | — | OK | — | — | — | — |
| `bankBigD05` Virage très grand relevé descendant · ½ | OK | — | — | OK | — | — | — | — |
| `bankBigD1` Virage très grand relevé descendant · 1 | OK | — | — | OK | — | — | — | — |
| `bankBigD2` Virage très grand relevé descendant · 2 | OK | — | — | OK | — | — | — | — |
| `bankBigD4` Virage très grand relevé descendant · 4 | OK | — | — | OK | — | — | — | — |
| `bankBigDL05` Virage très grand relevé descendant ↰ · ½ | OK | — | — | OK | — | — | — | — |
| `bankBigDL1` Virage très grand relevé descendant ↰ · 1 | OK | — | — | OK | — | — | — | — |
| `bankBigDL2` Virage très grand relevé descendant ↰ · 2 | OK | — | — | OK | — | — | — | — |
| `bankBigDL4` Virage très grand relevé descendant ↰ · 4 | OK | — | — | OK | — | — | — | — |
| `bankGiantU05` Virage géant relevé montant · ½ | OK | — | — | OK | — | — | — | — |
| `bankGiantU1` Virage géant relevé montant · 1 | OK | — | — | OK | — | — | — | — |
| `bankGiantU2` Virage géant relevé montant · 2 | OK | — | — | OK | — | — | — | — |
| `bankGiantU4` Virage géant relevé montant · 4 | OK | — | — | OK | — | — | — | — |
| `bankGiantUL05` Virage géant relevé montant ↰ · ½ | OK | — | — | OK | — | — | — | — |
| `bankGiantUL1` Virage géant relevé montant ↰ · 1 | OK | — | — | OK | — | — | — | — |
| `bankGiantUL2` Virage géant relevé montant ↰ · 2 | OK | — | — | OK | — | — | — | — |
| `bankGiantUL4` Virage géant relevé montant ↰ · 4 | OK | — | — | OK | — | — | — | — |
| `bankGiantD05` Virage géant relevé descendant · ½ | OK | — | — | OK | — | — | — | — |
| `bankGiantD1` Virage géant relevé descendant · 1 | OK | — | — | OK | — | — | — | — |
| `bankGiantD2` Virage géant relevé descendant · 2 | OK | — | — | OK | — | — | — | — |
| `bankGiantD4` Virage géant relevé descendant · 4 | OK | — | — | OK | — | — | — | — |
| `bankGiantDL05` Virage géant relevé descendant ↰ · ½ | OK | — | — | OK | — | — | — | — |
| `bankGiantDL1` Virage géant relevé descendant ↰ · 1 | OK | — | — | OK | — | — | — | — |
| `bankGiantDL2` Virage géant relevé descendant ↰ · 2 | OK | — | — | OK | — | — | — | — |
| `bankGiantDL4` Virage géant relevé descendant ↰ · 4 | OK | — | — | OK | — | — | — | — |

## Bifurcations

| Pièce | Sol | Mur gauche | Mur droit | Plafond | Incliné gauche 45° | Incliné droit 45° | Surplomb gauche 135° | Surplomb droit 135° |
|---|---|---|---|---|---|---|---|---|
| `fork` Bifurcation ⑂→ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `forkL` Bifurcation ←⑂ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

## Chicanes

| Pièce | Sol | Mur gauche | Mur droit | Plafond | Incliné gauche 45° | Incliné droit 45° | Surplomb gauche 135° | Surplomb droit 135° |
|---|---|---|---|---|---|---|---|---|
| `sbend` Chicane → | OK | CHUTE | v≥150 | OK | — | — | — | — |
| `sbendL` Chicane ← | OK | v≥150 | CHUTE | OK | — | — | — | — |
| `sbendLong` Chicane longue → | OK | v≥150 | v≥150 | OK | — | — | — | — |
| `sbendLongL` Chicane longue ← | OK | v≥150 | v≥150 | OK | — | — | — | — |
| `sbendFast` Chicane rapide → | OK | v≥150 | v≥150 | OK | — | — | — | — |
| `sbendFastL` Chicane rapide ← | OK | v≥150 | v≥150 | OK | — | — | — | — |
| `sbendWide` Grand S → | OK | v≥150 | v≥150 | OK | — | — | — | — |
| `sbendWideL` Grand S ← | OK | v≥150 | v≥150 | OK | — | — | — | — |
| `sbendFastWide` Grand S rapide → | OK | v≥150 | v≥150 | OK | — | — | — | — |
| `sbendFastWideL` Grand S rapide ← | OK | v≥150 | v≥150 | OK | — | — | — | — |

## Carrefours

| Pièce | Sol | Mur gauche | Mur droit | Plafond | Incliné gauche 45° | Incliné droit 45° | Surplomb gauche 135° | Surplomb droit 135° |
|---|---|---|---|---|---|---|---|---|
| `cross` Croisement | OK | — | — | OK | — | — | — | — |
| `tee` Carrefour en T | OK | — | — | OK | — | — | — | — |

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
| `tr46s` Transition incliné gauche → surplomb gauche | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr64s` Transition surplomb gauche → incliné gauche | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr67s` Transition surplomb gauche → surplomb droit | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr76s` Transition surplomb droit → surplomb gauche | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr75s` Transition surplomb droit → incliné droit | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr57s` Transition incliné droit → surplomb droit | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr54s` Transition incliné droit → incliné gauche | OK | — | — | v≥150 | — | — | — | — |
| `tr45s` Transition incliné gauche → incliné droit | OK | — | — | v≥150 | — | — | — | — |
| `tr46l` Transition incliné gauche → surplomb gauche (douce 2×2) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr64l` Transition surplomb gauche → incliné gauche (douce 2×2) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr67l` Transition surplomb gauche → surplomb droit (douce 2×2) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr76l` Transition surplomb droit → surplomb gauche (douce 2×2) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr75l` Transition surplomb droit → incliné droit (douce 2×2) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr57l` Transition incliné droit → surplomb droit (douce 2×2) | v≥150 | — | — | v≥150 | — | — | — | — |
| `tr54l` Transition incliné droit → incliné gauche (douce 2×2) | OK | — | — | v≥150 | — | — | — | — |
| `tr45l` Transition incliné gauche → incliné droit (douce 2×2) | OK | — | — | v≥150 | — | — | — | — |

