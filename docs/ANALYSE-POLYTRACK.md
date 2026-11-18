# Analyse de la physique de PolyTrack (0.6.3) — mesures et comparaison avec Copytrack

Objectif : connaître la physique de PolyTrack assez précisément pour que celle de Copytrack puisse s'en rapprocher.
Ce document dit **ce qui a été mesuré, comment, avec quelle précision**, ce qui reste inconnu, et les décisions à prendre.

## 1. Méthode (boîte noire)

* Le jeu officiel (`app-polytrack.kodub.com/0.6.3`) piloté par un navigateur automatique (Chromium, Playwright, rendu logiciel).
* **Aucune lecture ni copie du code du jeu.** On observe seulement ce que le jeu produit :
  * le HUD (vitesse en km/h, chrono, checkpoints) lu dans la page ;
  * les **matrices de dessin** envoyées à WebGL (comme un débogueur graphique, type Spector.js) : position et orientation du châssis
    et des 4 roues à chaque image ;
  * l'affichage des touches pendant les replays.
* Circuits d'essai fabriqués au format public des codes de circuit (décrit par le crate Rust `polytrack-codes`), importés par le bouton
  « Import » du jeu. Un circuit ré-encodé ainsi est reconnu par le jeu comme l'original (même classement en ligne).
* 17 replays des **records mondiaux** des circuits officiels enregistrés (pilotage expert dans toutes les pièces).
* Le jeu est déterministe (dit par l'auteur et vérifié : deux essais identiques donnent le même chrono au millième).
* Les dimensions du véhicule sont lues dans le modèle 3D chargé par le jeu (`car.glb`, boîtes englobantes), comme on mesurerait une maquette.

Précision : sauf mention, les valeurs sont à ±2 %. Les marques **[certain]**, **[±x %]**, **[incertain]** qualifient chaque résultat.

## 2. Échelle du monde

| Grandeur | PolyTrack | Copytrack |
|---|---|---|
| Unité de grille | **5 m** (x, y, z) [certain] | case 32 m, niveau 6,4 m |
| Bloc de route standard | **20 × 20 m** (4 unités), longueur mesurée 19,97 m [±0,1 %] | 32 m |
| Largeur roulable (entre bordures) | **≈ 11 m** [±5 %] | 24 m |
| Hauteur d'un niveau | **5 m** [certain] | 6,4 m |
| Bordure | basse : la voiture la franchit au-delà de ≈ 15° d'impact | rail infranchissable |

## 3. La voiture

### 3.1 Dimensions [certain]

| | PolyTrack | Copytrack |
|---|---|---|
| Boîte de collision | **1,51 × 0,72 × 3,65 m** (avant 1,67 m, arrière 1,98 m du centre) | cercle de rayon 1,0 m, hauteur 1,3 m |
| Empattement | **2,875 m** (avant +1,348, arrière −1,527 : 53 % du poids sur l'avant) | a + b = 2,75 m (1,35 / 1,40) |
| Voies | avant 1,256 m, arrière 1,442 m | — |
| Rayon des pneus | **0,331 m** | — |
| Hauteur du centre au repos | 0,745 m (garde au sol de la caisse ≈ 0,40 m) | — |

### 3.2 Longitudinal

* **Gaz** : `a = 20,19 − 0,107·v` (m/s², v en m/s) — poussée constante, traînée **linéaire**. Vitesse limite **679,1 km/h** sur le plat.
  Ajusté sur 6 arrivées chronométrées (5 à 160 blocs) : écart **7 cm sur 3,2 km** [certain].
  `v(t) = 188,65·(1 − e^(−0,107·t))` : 0→100 km/h en 1,49 s, 0→300 km/h en 5,45 s, 0→600 km/h en 20 s.
* **Roue libre** : `a = −0,107·v` seulement (aucun frottement constant ; 309 → 171 km/h en 5,6 s) [certain].
* **Frein** : `a = −(65,8 + 0,377·v)` (traînée comprise), avec ≈ 86 ms avant plein effet. 428 → 0 km/h en 1,46 s / 85 m ;
  154 → 0 en 0,66 s / 15 m [±10 %].
* **Marche arrière** (S à l'arrêt) : poussée 9,65 m/s², vitesse limite **76,5 km/h** [±3 %].
* W en reculant : freine jusqu'à l'arrêt (≈ 0,25 s depuis 17 km/h), puis repart en avant. W + S ensemble en reculant : la marche arrière continue.
* Le revêtement (route, herbe) ne change pas l'accélération (même courbe à 1 km/h près). Les biomes sont décoratifs (confirmé par l'auteur).

### 3.3 Direction [certain]

* **Braquage maximal des roues avant selon la vitesse** :
  `δmax = min(23,51° ; 22,93 · v^−1,566 rad)` (v en m/s) — 23,5° jusqu'à 47 km/h, puis 15,9° à 60, 7,0° à 100, 2,7° à 200, 1,3° à 300,
  0,70° à 450 km/h (erreur 1,8 % de 10 à 490 km/h, 510 points).
* **Vitesse de braquage** : linéaire, 4° par image à 60 Hz (≈ 240°/s) ; plein braquage en 0,1 s ; retour au centre au même rythme, sans dépassement.
* **La voiture ne glisse presque pas** en braquage normal : rayon = empattement / angle (66 m calculé, 65,6 m mesuré à 200 km/h) ;
  dérive du châssis de 3,8° à 100 km/h à 0,25° à 480 km/h.
* Rayon à plein braquage : 21 m (100 km/h), 41 m (150), 66 m (200), 94 m (250), 125 m (300), 197 m (400), 264 m (480).
* Accélération latérale à plein braquage : 35 m/s² à 100 km/h → 67 m/s² à 480 km/h : c'est **l'angle maximal** qui limite le virage,
  pas l'adhérence (jamais saturée en braquage normal).

### 3.4 Glisse (dérapage)

* Pas de glisse au volant seul. **Frein + volant** fait partir l'arrière : dérive jusqu'à ≈ 21°, pic de lacet ≈ 360°/s.
* **Contre-braquage automatique** : pendant la glisse, les roues avant s'orientent d'elles-mêmes vers la direction du déplacement
  (≈ 3° de plus que la trajectoire, A toujours enfoncée) ; la glisse se referme en ≈ 1 s sous les gaz [la loi exacte reste à préciser].
* Effort maximal du pneu pendant la glisse : ≈ 45–51 m/s² vers 160 km/h [±15 %].
* Coût : 263 → 140 km/h sur l'ensemble de la manœuvre (frein compris). Pas de mini-turbo.

### 3.5 Suspension

* Débattement : roue de −0,45 m (détendue, en l'air) à ≈ −0,19 m (comprimée) sous le centre : ≈ 26 cm.
* Freinage : l'avant s'enfonce de 4,2 cm, l'arrière se détend de 1,9 cm (tangage −1,2°). Pas de cabrage visible en accélération.
* À haute vitesse la caisse descend de 4 à 6 cm de plus [incertain : appui aérodynamique faible, ou différence de hauteur des surfaces].
* L'auteur indique un moteur physique tiers à suspension raide, non réglable par pièce.

## 4. L'environnement

### 4.1 Gravité et vol

* **g = 14,78 m/s²** (≈ 1,5 g terrestre) [±1 %], cinq chutes contrôlées de 27 m.
* Ralentissement en vol ≈ 0,165 /s (au sol en roue libre : 0,107 /s) [l'écart n'est pas expliqué].
* **En l'air : aucun contrôle** — ni les gaz ni le volant ne changent la rotation (mesuré). Le **frein en l'air (aérofrein)** amortit la rotation :
  tangage 28 → 6 °/s en 1,6 s (décroissance ≈ 1 /s).
* La rotation acquise au décollage est conservée (piqué constant de ≈ 26 °/s en quittant un bord de route). Pas de redressement automatique.
* Bascule au décollage d'un bord plat (mesure complémentaire, 0.11.1) : 65 °/s à 39 km/h, 38 °/s à 78 km/h, 26 °/s à 140 km/h, 16 °/s à 225 km/h (gaz tenus ou non :
  pas de différence), soit ≈ 18,4 / (v + 5,5) rad/s avec v en m/s. Le volant tenu en l'air ne change ni le cap ni le roulis (0,00 °/s de lacet sur 1,7 s).
  Copytrack l'applique depuis PHYS_VER 37 (`airTip`), sans le ressort d'assiette qu'il avait gardé jusque-là : c'est l'aérofrein qui fait les réceptions.

### 4.2 Murs et bordures

* Choc **inélastique** : la vitesse vers le mur est annulée, **aucun rebond** [certain].
* Frottement de Coulomb **μ ≈ 0,7** sur la vitesse le long du mur (5° : 231 → 216 km/h ; 12° : 208 → 177 km/h) [±15 %].
* La voiture s'aligne sur le mur. Au-delà de ≈ 15–19°, elle **escalade la bordure** (perte 204 → 128 km/h).
* Contre un mur à l'arrêt, gaz et volant à fond : la voiture reste bloquée (pas de dégagement automatique).

### 4.3 Pentes, loopings, murs verticaux

* Les loopings sont modulaires (quart de tube sol → mur, tronçons verticaux, courbe haute). Un looping de ≈ 47 m de diamètre est passé à 263–287 km/h.
* **Aucune gravité « collée à la route »** : sur les murs et loopings la voiture obéit à la gravité ordinaire (accélération verticale
  médiane −21,5 m/s² sur 13 passages de records) ; seule la vitesse (appui centrifuge) la tient.
* Montée verticale : `a = 20,19 − 0,107·v − 14,78` le long de la route (mesuré −5,8 m/s², prévu −5,3) : le moteur pousse le long de la route.
* Conséquence calculée : sommet d'un looping de rayon r tenu si `v² / r ≥ 14,78` (r = 23,5 m → 67 km/h au sommet, ≈ 150 km/h en bas).

### 4.4 Ce qui n'existe pas dans PolyTrack (à la 0.6.3)

Revêtements à effet (glace, boost, aimant, inversion de gravité…), véhicules, mini-turbo, contrôle en l'air (hors aérofrein), retour automatique
quand on est bloqué. Les seuls retours sont manuels (R : checkpoint ; T : départ) ; on réapparaît dans le sens de passage du checkpoint (auteur).

## 5. Comparaison avec Copytrack (valeurs actuelles, `PHYS_VER` 35)

| Grandeur | PolyTrack | Copytrack | Écart |
|---|---|---|---|
| Vitesse max (plat) | 679 km/h | 290 km/h (340 turbo) | ×2,3 |
| Poussée à l'arrêt | 20,2 m/s² | 14 m/s² | ×1,44 |
| Loi d'accélération | constante − 0,107·v | 14·(1 − (v/vmax)^1,5) | forme différente |
| Roue libre | −0,107·v | 0,8 + 0,05·v | PolyTrack ralentit plus à haute vitesse |
| Frein | 66 + 0,38·v (≈ 76 m/s² à 100 km/h) | 52 m/s² | ×1,3–2 |
| Gravité | 14,78 m/s² | 19 m/s² | ×0,78 |
| Braquage max | 23,5° → 0,7° (loi de puissance en v) | 37° (0,65 rad), réduit par une accél. latérale visée de 52 m/s² | formes différentes |
| Vitesse de braquage | 240°/s, sans amortissement | 8 /s (ent.), 13 /s (retour) | à convertir |
| Adhérence latérale | jamais saturée en braquage normal (≈ 50 m/s² en glisse) | 80 m/s² partagée avant/arrière | — |
| Glisse | frein + volant, contre-braquage automatique | frein + volant, angle tenu, mini-turbo | mécanique différente |
| Air | aucun contrôle, aérofrein | assiette pilotée (gaz/frein), ressort d'assiette | PolyTrack beaucoup plus brut |
| Murs | inélastique, μ ≈ 0,7, bordure franchissable | rebond 0,35, μ 0,2, rail infranchissable | PolyTrack punit plus |
| Loopings/murs | physique réelle (centrifuge) | rubans guidés, vitesse mini sur les murs | — |
| Grille / route | 20 m, route 11 m | 32 m, route 24 m | Copytrack ×1,6 (grille), ×2,2 (route) |

## 6. Limites de ces mesures

* Pas de joystick : seules les touches (tout ou rien) ont été testées ; le braquage partiel au clavier n'existe pas.
* Loi exacte du contre-braquage en glisse, limite d'adhérence en glisse (±15 %), raideur et amortissement de suspension, appui aérodynamique : non établis.
* Traînée en l'air différente de la traînée au sol : constatée, non expliquée.
* Loopings et murs mesurés dans les replays seulement (pas de banc dédié).

## 7. Décisions à prendre avant de toucher Copytrack

1. **Échelle** : la grille de Copytrack est 1,6 × plus grande. Garder les vitesses absolues de PolyTrack (même km/h, circuits « plus lents » en
   blocs par seconde), ou appliquer une similitude ×1,6 (mêmes trajectoires en blocs, km/h affichés plus grands), ou changer la grille (refonte).
2. **Portée** : copier le modèle de PolyTrack (direction bridée, frein fort, air sans contrôle, murs inélastiques…) tout en gardant les ajouts
   propres à Copytrack (revêtements, véhicules, mini-turbo) ?
3. **Forme** : nouveau profil physique au choix par circuit (records actuels intacts) ou nouvelle physique par défaut (`PHYS_VER` 36 : records,
   fantômes et classements actuels non rejouables, redéploiement du serveur).

## 8. Mise en œuvre dans Copytrack (bêta 0.9.65, `PHYS_VER` 36)

Choix retenus : **caractère PolyTrack, vitesses Copytrack** (mêmes lois, enveloppe de vitesse de Copytrack : 290 km/h, turbo 340), ajouts de Copytrack gardés
(revêtements, véhicules, mini-turbo), nouvelle physique par défaut. Détail des changements : [CHANGELOG](../CHANGELOG.md), section 0.9.65.

| Loi | PolyTrack (mesuré) | Copytrack 0.9.65 |
|---|---|---|
| Poussée | a = a0 − (a0 / v_max)·v, aussi à vide | a0 = 16 m/s², v_max = 290 km/h : 100 km/h en 2,1 s |
| Frein | ≈ 3,5 × la poussée | 52 + 0,5·v m/s² |
| Braquage permis | min(23,51° ; 22,93 · v^−1,566) | même loi, × adhérence d'ambiance (pluie −15 %, Arcade +10 %, Simulation −10 %) |
| Glisse | frein + volant, contre-braquage automatique | même, mini-turbo à 0,45 / 0,85 s de charge |
| Air | aucun contrôle, aérofrein ≈ 1 /s | même (deltaplane excepté) |
| Murs | inélastiques, μ ≈ 0,7 | même |

Écarts assumés : la route guide le cap sur les pièces 3D roulées et les loopings (sinon infranchissables au braquage permis) ; la pluie, le givre et
les modèles v2 jouent sur l'angle permis (sinon sans effet : l'adhérence n'est jamais la limite) ; gravité (19 m/s²) et traînée en l'air de Copytrack.
Vérifications : banc `tools/mesures-physique.mjs`, `tools/test-maniabilite.mjs` (rayon = empattement / angle permis à 15 % près), `tools/test-vitesse-et-murs.mjs`
(loi de poussée à 0,1 m/s² près), `tools/test-physique-corrections.mjs` ; 72 circuits recalés (temps du pilote +9,1 % en moyenne).

## Sources publiques

* Devlog et notes de version : https://kodub.itch.io/polytrack/devlog
* Fil « car physics » (réponses de l'auteur sur la suspension) : https://itch.io/t/3273519/car-physics
* Fil de la bêta 0.5.0 (déterminisme, aérofrein, demandes refusées) : https://itch.io/t/4651589/polytrack-050-beta-concluded
* Format des codes de circuit : https://docs.rs/crate/polytrack-codes/latest
* Guide joueurs : https://www.drifted.com/polytrack/
