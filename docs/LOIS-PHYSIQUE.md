# Lois de conduite (PHYS_VER 36 à 38)

Ce document fixe les lois de conduite du jeu et les réglages que l'on garde. Il remplace, depuis la 0.12.4, l'ancienne note de mesures
(retirée du dépôt : le jeu ne publie aucune donnée tirée d'un autre jeu). Les valeurs sont celles du code ; les tests cités les vérifient.

## Principe

Une conduite simple à lire et exigeante à maîtriser : la voiture accélère fort, freine plus fort encore, tourne de moins en moins vite à mesure
qu'elle prend de la vitesse, et rien ne la pilote à la place du joueur (ni en l'air, ni sur les loopings, ni contre les murs). Les ajouts propres
au jeu (revêtements, véhicules, mini-turbo, gravité manipulée) se posent par-dessus ces lois sans les changer.

## Réglages gardés

| Loi | Réglage | Où |
|---|---|---|
| Poussée | a = 16 − (16 / v_max)·v, aussi à vide (traînée linéaire) ; v_max = 290 km/h, 340 sous turbo ; 100 km/h en 2,1 s | `js/constants.js` (`SURF_PHYS`) |
| Frein | 52 + 0,5·v m/s² (≈ 3,5 × la poussée) ; marche arrière 8 m/s² jusqu'à 54 km/h | `js/physics/specs.js` |
| Braquage permis | min(23,5° ; 22,93 · v^−1,566) (v en m/s), × adhérence d'ambiance (pluie −15 %, Arcade +10 %, Simulation −10 %) | `steerMax`, `steerC`, `steerN` |
| Réponse au volant | plein braquage en 0,1 s, retour au centre au même rythme | `steerIn` |
| Glisse | frein + volant ; contre-braquage automatique une fois établie ; se referme en ≈ 1,5 s avec les gaz ; mini-turbo à deux niveaux | `autoCounter`, `driftHoldGas`, `mt*` |
| Gravité | 19 m/s² (sauts et loopings des circuits calés dessus) | `SURF_PHYS.gravity` |
| Décollage | la voiture bascule nez en bas en quittant un bord : 18,4 / (v + 5,5) rad/s (65 °/s à 39 km/h, 16 °/s à 225 km/h) | `airTip`, `airTipV0` |
| En l'air | rotation du décollage gardée ; amortissement naturel 0,1 /s ; aérofrein (frein) 1,0 /s | `airSpin`, `airBrake` |
| Contrôle en l'air (0.12.3) | pédales : bascule bornée à ±22° (gaz : nez en bas ; frein : nez en haut) ; volant : lacet doux, 26 °/s au plus | `airLean*`, `airYaw*` |
| Murs | choc inélastique (aucun rebond), frottement de Coulomb μ = 0,7, ni pivot ajouté ni « encaissement » | `wallE`, `wallMu`, `wallStunMax` |
| Loopings, murs, tubes | aucune gravité « collée » : seule la vitesse plaque les roues ; la route ne guide pas le cap (il faut braquer) ; le tube garde la voiture dedans (PHYS_VER 38) | `js/physics/ribbon.js` |

## Écarts assumés

- **Échelle** : cases de 32 m et route de 24 m de large ; les vitesses absolues (290 km/h) sont celles pour lesquelles les circuits sont dessinés.
- **Pluie, givre, modèles v2** : ils jouent sur l'angle de braquage permis, puisque l'adhérence n'est presque jamais la limite.
- **Deltaplane** : il a son propre vol (portance, ascendances en modèle v2 : `js/physics/vehicles/glider2.js`) ; le lacet au volant en l'air ne le concerne pas.

## Vérifications

- `tools/test-vitesse-et-murs.mjs` : loi de poussée à 0,1 m/s² près, plafonds, murs inélastiques.
- `tools/test-maniabilite.mjs` : rayon = empattement / angle permis à 15 % près ; réponse au volant.
- `tools/test-sans-aide.mjs` : décollage, rotation gardée, aérofrein, bascule bornée aux pédales, loopings à piloter.
- `tools/test-physique-corrections.mjs`, `tools/mesures-physique.mjs` : chocs, glisse, contrôle en l'air.
- `tools/phys-fingerprint.mjs` : toute modification de ces lois change l'empreinte et impose d'incrémenter `PHYS_VER` (procédure : [ARCHITECTURE.md](ARCHITECTURE.md)).
