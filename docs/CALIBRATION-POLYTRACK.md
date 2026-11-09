# Calibration du moteur sur la course de référence (0.9.12, lot 1)

Source : relevé `polytrack-recon-2026-11-09T10-28-57` (trajectoires de la voiture à 60 Hz, 1 unité = 1 m ; aucune donnée du code du jeu de référence n'a été utilisée, seulement des mesures de comportement).

| Grandeur | Mesure | Constante Copytrack |
| --- | --- | --- |
| Poussée sous les gaz | a = 19,0 − 0,080·v (ajustement sur la distance parcourue d'un lancer arrêté à plat, 0 → 57 m/s, écart 0,12 m) | `SURF_PHYS.engineAccel` 19,0 · `SURF_PHYS.driveDrag` 0,080 |
| Résistance à vide | a = −0,1065·v (décélération 21 → 13,7 m/s sur 4 s, à plat) | `SURF_PHYS.coastDrag` |
| Gravité | 15,4 à 16,2 m/s² (vol libre, résistance verticale comprise) | `SURF_PHYS.gravity` 16 (avant : 25) |
| 0 → 100 / 200 km/h | 1,5 s / 3,3 s (modèle) | — |

Non mesurables dans ce relevé, donc **inchangés** : appui et frottement des wall-rides (`SIDE_AERO`, murs), freinage, marche arrière, adhérence latérale (la cinétique relevée en virage, ≈ 60 m/s² à 145 km/h, reste compatible avec `latGrip`).

Conséquence connue : tous les circuits intégrés ont été calés sur l'ancien moteur (0 → 100 km/h en 4 s, gravité 25). `tools/test-niveaux.mjs` (contrat des 66 circuits, temps de référence), `tools/test-v093.mjs` (3 tests de sauts et circuits aléatoires), `tools/test-phase2.mjs` (parcours « ligne inclinée ×4 ») et 3 tests de `tools/test-maniabilite.mjs` (pilote humain sur les 66 circuits) échouent tant que les circuits ne sont pas recalés (sauts, médailles, temps de référence).
