// Circuits intégrés (créations originales), décrits avec le constructeur "tortue"
// (voir scriptTrack dans track.js). Les temps de médailles sont en secondes.
// 0.9 : 66 circuits, 11 chapitres de 6 (un par thème), du plus facile au plus dur. 0.9.9 : les 66 sont refaits (refonte du level design).
// Chaque circuit a un `profil` (sprint, speedway, technique, rollercoaster, acrobatique), une ouverture qui n'est celle d'aucun autre, et respecte le contrat
// de tools/contract.mjs (mesuré sur la course du pilote automatique). Le commentaire au-dessus de chaque circuit décrit son ouverture et ce qu'il enseigne ;
// goal = objectif bonus ; pilot.vCap = vitesse visée du pilote qui sert à calibrer les médailles (or = son temps).
// ATTENTION : l'ordre de ce fichier n'est PAS celui de la carrière. La liste est triée en bas de fichier (thème selon THEME_ORDER, puis difficulté) :
// pour retrouver le numéro d'un circuit, utiliser BUILTIN_TRACKS.findIndex() après import, jamais la position dans le texte.
import { scriptTrack } from './track.js';

export const BUILTIN_TRACKS = [
  {
    // Chapitre 1 · 1/6 — SPRINT d'initiation. Ouverture : deux boosters puis un premier wall-ride (transitions douces 2×2).
    // Presque tout droit : le chrono se joue sur la vitesse de pointe et sur la trajectoire dans les deux très grands virages plats.
    id: 'eclats', name: 'Premiers Éclats', decor: 'desert', difficulty: 1, profil: 'sprint',
    goal: { id: 'under', t: 16 },
    opts: { l: 2 }, pilot: { vCap: 66 },
    script: 'start B2 [tr01l] S4< [tr10l] S B S [crs1] S [cds1] HR S3 B C S HL S3 B2 finish',
    medals: { cristal: 15.1, or: 15.9, argent: 18.3, bronze: 21.5 },
  },
  {
    // Chapitre 3 · 1/6 — SPRINT (moto). Ouverture : départ EN MOTO (veh0), lancé par une descente de 7 niveaux au lieu d'un booster. Puis deux
    // sauts en chapelet avec un anneau turbo chacun, un très grand virage plat et un dernier booster. Presque tout droit.
    id: 'lagon', name: 'Lagon Turquoise', decor: 'isles', difficulty: 1, profil: 'sprint',
    goal: { id: 'rings', n: 2 },
    opts: { l: 8 }, params: { veh0: 'moto' }, pilot: { vCap: 66 },
    script: 'start [cdi1] [dn2] [dn2] [cdo2] B S [crv1] UU GR2 DD [cdo1] B2 S [crv1] UU GR2 DD [cdo1] S B C S3 HL S2 B2 finish',
    medals: { cristal: 17, or: 17.9, argent: 20.6, bronze: 24.2 },
  },
  {
    // Chapitre 5 · 1/6 — SPRINT (glace). Ouverture : DÉPART SUR LA GLACE (deux cases de verglas, trois boosters, deux cases de verglas) : la voiture patine, les boosters la lancent sur une
    // glace où l'on ne freine plus. Puis une vague douce, deux très grands virages plats (droite, gauche) et une descente finale. Presque tout droit.
    id: 'aurore', name: 'Aurore Naissante', decor: 'polar', difficulty: 1, profil: 'sprint',
    goal: { id: 'under', t: 19.5 },
    opts: { l: 6 }, pilot: { vCap: 66 },
    script: 'start I2 B3 I2 S [crs1] S2 [cds1] B HR S3 B C S2 HL S2 B [cdi1] [dn2] [cdo1] S B2 finish',
    medals: { cristal: 17.2, or: 18.1, argent: 20.8, bronze: 24.5 },
  },
  {
    // Chapitre 2 · 1/6 — SPRINT. Ouverture : trois boosters → rampe de lancement avec un anneau turbo dans le saut. Puis une vague douce,
    // un pont de lianes sans bordures à plus de 230 km/h (la trajectoire ne pardonne rien), un S de virages relevés et un très grand virage
    // plat pour finir. Trois virages en tout, aucun serré.
    id: 'lianes', name: 'Lianes Néon', decor: 'jungle', difficulty: 2, profil: 'sprint',
    goal: { id: 'rings', n: 1 },
    opts: { l: 3 }, pilot: { vCap: 66 },
    script: 'start B3 UU GR2 DD [cdo1] B2 S [crs1] S2 [cds1] B S2_ B_ S2_ BR S2 B BL S2 B C S3 HL S B2 finish',
    medals: { cristal: 18, or: 18.9, argent: 21.8, bronze: 25.5 },
  },
  {
    // Chapitre 4 · 1/6 — SPEEDWAY. Ouverture : DÉPART SUR UN TAPIS ROULANT à +200 km/h (trois cases) : la voiture est lancée à près de 290 km/h sans un seul booster. Quatre
    // virages relevés 3×3 en S, un wall-ride de quatre cases sur le mur droit (la façade d'une tour) et des boosters en sortie de virage : plus de 70 % du tour au-dessus de 250 km/h.
    id: 'neons', name: 'Néons Express', decor: 'city', difficulty: 2, profil: 'speedway',
    goal: { id: 'nowall' },
    opts: { l: 4 }, pilot: { vCap: 70 },
    script: 'start S3.t201 S BRR S2 B BLL S2 C B [tr02l] S4> [tr20l] BRR S2 B BLL S2 B2 finish',
    medals: { cristal: 14.4, or: 15.2, argent: 17.5, bronze: 20.5 },
  },
  {
    // Chapitre 6 · 1/6 — SPRINT (collines). Ouverture : deux boosters puis UNE LONGUE COLLINE DOUCE (trois cases qui montent d'un demi-niveau, trois qui redescendent). Puis une vague en S,
    // un S de virages relevés 2×2, un seul très grand virage plat et une descente finale de 4 niveaux. Presque tout droit.
    id: 'braises', name: 'Braises', decor: 'volcano', difficulty: 2, profil: 'sprint',
    goal: { id: 'under', t: 18 },
    opts: { l: 6 }, pilot: { vCap: 66 },
    script: 'start B2 GU3 GD3 B S [crs1] S2 [cds1] B BR S BL S B C S2 HL S2 B [cdi1] [dn2] [cdo1] S B2 finish',
    medals: { cristal: 16.2, or: 17.1, argent: 19.6, bronze: 23.1 },
  },
  {
    // Chapitre 1 · 2/6 — SPEEDWAY. Ouverture : un booster puis directement un très grand virage relevé. Aucun virage serré : quatre virages
    // relevés 3×3, un wall-ride de 6 cases sur la paroi du canyon (mur droit) à plus de 250 km/h, une descente douce et des boosters
    // pour rester au-dessus de 250 km/h sur plus de la moitié du tour.
    id: 'canyon', name: 'Canyon Corail', decor: 'desert', difficulty: 2, profil: 'speedway',
    goal: { id: 'nowall' },
    opts: { l: 8 }, pilot: { vCap: 70 },
    script: 'start B BRR B3 S2 [tr02l] S6> [tr20l] C S BRR S [cdi1] [dn2] [cdo1] S C B S BRR S3 B BLL S BRR S2 B2 finish',
    medals: { cristal: 19.6, or: 20.7, argent: 23.7, bronze: 27.9 },
  },
  {
    // Chapitre 7 · 1/6 — SPRINT (amarrage). Ouverture : un booster puis UN TUBE de trois cases. Après le tube, un saut en BASSE GRAVITÉ (plaque à 40 %) : la voiture flotte sur plus de dix cases,
    // traverse un anneau turbo et se pose sur un quai de dix cases, cinq niveaux plus bas. Puis un très grand virage plat et une descente finale de 4 niveaux. Presque tout droit.
    id: 'quai', name: 'Quai d’Amarrage', decor: 'orbit', difficulty: 2, profil: 'sprint',
    goal: { id: 'rings', n: 1 },
    opts: { l: 14 }, pilot: { vCap: 66 },
    script: 'start B TI TM TO B S.g40 [crs1] UU GR3 G7 V-5 S10 S.g100 B C S HR S B [cdi1] [dn2] [cdo1] B2 finish',
    medals: { cristal: 18.6, or: 19.6, argent: 22.6, bronze: 26.5 },
  },
  {
    // Chapitre 1 · 3/6 — ACROBATIQUE. Ouverture : chute libre immédiate, depuis l'arrêt (la voiture quitte la plateforme de départ, à 77 m, et
    // se réceptionne sur une descente à 38°). Puis trois sauts de plus en plus grands (bosse, grand tremplin à 38°, dernier saut avec anneau
    // turbo) et un petit saut sur un mur. Réceptions en longues pentes descendantes ; chaque checkpoint est suivi de deux boosters
    // avant la rampe : on peut repartir À L'ARRÊT de n'importe quel checkpoint (la réapparition remet la voiture à l'arrêt) et réussir le saut.
    id: 'tremplins', name: 'Tremplins du Crépuscule', decor: 'desert', difficulty: 2, profil: 'acrobatique',
    goal: { id: 'perfect', n: 3 },
    opts: { l: 16 }, pilot: { vCap: 60 },
    script: 'start G1 V-5 [dn4] [cdo2] S C B2 S [crv1] UU G2 DD [cdo1] S3 CBR1 S [tr01s] S2< [tr10s] S LL S C B2 S2 [crv2] UX G3 DX DX [cdo2] S3 C B2 S UU GR2 DD [cdo1] S2 finish',
    medals: { cristal: 27.8, or: 29.3, argent: 33.7, bronze: 39.6 },
  },
  {
    // Chapitre 4 · 2/6 — ROLLERCOASTER (boucles). Ouverture : trois boosters puis DEUX LOOPINGS qui s'enchaînent en S (droite puis gauche). Ensuite deux wall-rides de quatre cases
    // (mur gauche, mur droit) séparés par un virage relevé, un grand looping et un plongeon de 8 niveaux : trois loopings, 15 niveaux de dénivelé.
    id: 'hyper', name: 'Hyperboucle', decor: 'city', difficulty: 3, profil: 'rollercoaster',
    goal: { id: 'norespawn' },
    opts: { l: 12 }, pilot: { vCap: 66 },
    script: 'start B3 O OL S2 B3 [tr01s] S4< [tr10s] S BR S2 B [tr02s] S4> [tr20s] S C B OB S2 B [cdi2] DX [cdo2] S B2 finish',
    medals: { cristal: 21.2, or: 22.3, argent: 25.6, bronze: 30.1 },
  },
  {
    // Chapitre 2 · 2/6 — SPEEDWAY. Ouverture : départ en tube, propulsé par trois boosters, qui débouche directement sur un virage relevé 3×3.
    // Une succession de S relevés (droite / gauche), deux vagues douces, un wall-ride de 5 cases sur le mur gauche (l'autre côté que le canyon
    // du chapitre 1) et un tube à pleine vitesse. Aucun virage serré, plus de 250 km/h pendant près de la moitié du tour.
    id: 'canopee', name: 'Canopée', decor: 'jungle', difficulty: 3, profil: 'speedway',
    goal: { id: 'under', t: 25 },
    opts: { l: 5 }, pilot: { vCap: 70 },
    script: 'start TI TM3.b TO BRR S B BLL S [crs1] S2 [cds1] S [tr01l] S5< [tr10l] C B BRR S [crs1] S [cds1] B BLL S2 TB BRR S B BLL S2 B2 finish',
    medals: { cristal: 22.8, or: 24, argent: 27.6, bronze: 32.4 },
  },
  {
    // Chapitre 2 · 3/6 — ACROBATIQUE (rebonds). Ouverture : deux boosters → rebond géant (palier 2 niveaux plus haut). Quatre champignons en
    // escalier en zigzag (+8 niveaux), puis un long plongeon. Un checkpoint avant chaque rebond, suivi de deux boosters : on repart de chacun
    // à l'arrêt. La portée d'un rebond est proportionnelle à la vitesse (et non à son carré) : le circuit est finissable à ±40 % de vitesse.
    id: 'spores', name: 'Spores', decor: 'jungle', difficulty: 3, profil: 'acrobatique',
    goal: { id: 'perfect', n: 4 },
    opts: { l: 2 },
    script: 'start B2 S.j200 G2 V2 S3 RR C B2 S.j200 G2 V2 S3 LL C B2 S.j200 G2 V2 S3 RR C B2 S.j200 G2 V2 S3 LL S B [cdi2] DX [cdo2] B [crs1] S [cds1] B2 finish',
    medals: { cristal: 27.8, or: 29.3, argent: 33.7, bronze: 39.5 },
  },
  {
    // Chapitre 3 · 2/6 — TECHNIQUE (bateau). Ouverture : départ SUR L'EAU (plaque bateau juste après la ligne, slalom R L R L dans un chenal).
    // Le bateau glisse et freine peu : les épingles se font en voiture, entre deux chenaux, avec un petit saut sur un mur. L'arrivée se franchit
    // en bateau (objectif bonus), le chenal final sortant directement sur la ligne.
    id: 'recif', name: 'Récif', decor: 'isles', difficulty: 3, profil: 'technique',
    goal: { id: 'vehicle', v: 'boat' },
    opts: { l: 4 },
    script: 'start S.n S2.a R.a L.a R.a L.a S.a S.n B2 S [tr01s] S2< [tr10s] S3 R R B S2 L S L B S3 [cvd05] [cvdL05] B S C S.n S2.a R.a L.a R.a L.a S2.a finish',
    medals: { cristal: 27.9, or: 29.4, argent: 33.8, bronze: 39.7 },
  },
  {
    // Chapitre 3 · 3/6 — ACROBATIQUE (deltaplane). Ouverture : trois boosters, plaque deltaplane et vol de cinq cases au-dessus de la mer. Puis
    // deux sauts de voiture avec anneau turbo, séparés par la montée du phare (hélice de quatre grandes courbes inclinées, +8 niveaux) et un
    // plongeon. La piste qui suit un vol plané est longue : selon l'élan, le deltaplane se pose plus ou moins loin.
    id: 'phare', name: 'Phare', decor: 'isles', difficulty: 3, profil: 'acrobatique',
    goal: { id: 'rings', n: 2 },
    opts: { l: 4 },
    script: 'start B3 S.e UU GR5 DD S5 S.e S C B2 S [crv1] UU GR2 DD [cdo1] S2 CBR2 CBR2 CBR2 CBR2 S C B [cdi2] DX [cdo2] B S2 [crv1] UU GR2 DD [cdo1] S2 B finish',
    medals: { cristal: 31.4, or: 33, argent: 38, bronze: 44.6 },
  },
  {
    // Chapitre 2 · 4/6 — TECHNIQUE (moto). Ouverture : bifurcation dès le départ ; la voie de droite porte la plaque moto (c'est elle qu'il faut
    // prendre pour finir en moto). Douze virages serrés en slaloms (R L R L), une descente en lacets, un petit saut sur un mur et un
    // booster à chaque relance. Deux autres plaques : la voiture au milieu, la moto de nouveau avant l'arrivée.
    id: 'serpent', name: 'Serpent', decor: 'jungle', difficulty: 3, profil: 'technique',
    goal: { id: 'vehicle', v: 'moto' },
    opts: { l: 8 },
    script: 'start Y2.o B S [cvd05] [cvdL05] [cvd05] [cvdL05] B S S.o S [tr01s] S2< [tr10s] S R L R L B S2 C S.o S R L R L B S2 B finish',
    medals: { cristal: 23.5, or: 24.7, argent: 28.4, bronze: 33.4 },
  },
  {
    // Chapitre 6 · 2/6 — SPEEDWAY (coulée de lave). Ouverture : un booster puis un S de virages relevés 2×2 (droite, gauche) dès les premières cases, avant les virages relevés 3×3.
    // Six virages relevés en tout, un wall-ride de quatre cases (mur droit) et un plongeon de 4 niveaux qui relance la voiture : près de la moitié du tour au-dessus de 250 km/h, 4 % de freinage.
    id: 'coulee', name: 'Coulée Ardente', decor: 'volcano', difficulty: 3, profil: 'speedway',
    goal: { id: 'nowall' },
    opts: { l: 12 }, pilot: { vCap: 70 },
    script: 'start B BR S BL S BRR S B [tr02l] S4> [tr20l] BLL S2 C B [cdi1] [dn2] [cdo1] BRR S BLL B2 finish',
    medals: { cristal: 16.7, or: 17.6, argent: 20.2, bronze: 23.7 },
  },
  {
    // Chapitre 7 · 2/6 — TECHNIQUE (navette, moto). Ouverture : DÉPART EN MOTO (plaque moto sur la case qui suit la ligne de départ) puis un slalom R L R L immédiat. Huit virages serrés,
    // une chicane sur un mur, une descente de 4 niveaux et un booster à chaque relance ; il n'y a plus de plaque ensuite : l'arrivée se franchit en moto (objectif bonus).
    id: 'navette', name: 'Navette', decor: 'orbit', difficulty: 3, profil: 'technique',
    goal: { id: 'vehicle', v: 'moto' },
    opts: { l: 8 },
    script: 'start S.o B R L R L B S2 C B S R S L B S2 [tr01s] S2< [tr10s] S R B S L B S [cdi1] [dn2] [cdo1] S B finish',
    medals: { cristal: 19.2, or: 20.2, argent: 23.2, bronze: 27.2 },
  },
  {
    // Chapitre 4 · 3/6 — SPRINT. Ouverture : départ SANS BORDURES (deux boosters, six cases à plus de 200 km/h sans la moindre barrière : la trajectoire se joue dès la première seconde).
    // Puis une vague douce, un tunnel de quatre cases pris à pleine vitesse, un seul très grand virage plat et une descente finale. Presque tout droit.
    id: 'boulevard', name: 'Boulevard Sans Fin', decor: 'city', difficulty: 3, profil: 'sprint',
    goal: { id: 'under', t: 16 },
    opts: { l: 4 }, pilot: { vCap: 66 },
    script: 'start B2_ S3_ B_ S [crs1] S2 [cds1] B S B2# S2# C B S3 HR S2 B [cdi1] [dn2] [cdo1] S B2 finish',
    medals: { cristal: 14.6, or: 15.4, argent: 17.7, bronze: 20.8 },
  },
  {
    // Chapitre 1 · 4/6 — ROLLERCOASTER (spirale ; placé avant Lac Gelé pour que deux Rollercoasters ne se suivent pas). Ouverture : trois boosters puis directement un grand looping. Hélice montante de quatre
    // grandes courbes inclinées (16 niveaux, 78 m), point de contrôle au sommet, plongeon de 16 niveaux à 38° et slalom de wall-rides
    // gauche / droite en bas. Le plongeon passe à plus de 250 km/h : les murs se prennent avec une grande marge.
    id: 'spirale', name: 'Spirale Prismatique', decor: 'desert', difficulty: 3, profil: 'rollercoaster',
    goal: { id: 'norespawn' },
    opts: { l: 2 },
    script: 'start B3 OB S B CBR4 CBR4 CBR4 CBR4 S C [cdi2] DX DX DX [cdo2] B S [tr01s] S2< [tr10s] S [tr02s] S3> [tr20s] S2 B2 finish',
    medals: { cristal: 24.3, or: 25.6, argent: 29.4, bronze: 34.6 },
  },
  {
    // Chapitre 1 · 4/6 — TECHNIQUE. Ouverture : une épingle descendante dès le départ. Onze virages serrés, des freinages forts avant chaque
    // épingle et un booster à chaque sortie pour exploiter la courbe d'accélération ; de la glace avant les épingles (on ne freine plus
    // dessus), une chicane sur un mur et un checkpoint dans un virage.
    id: 'verglas', name: 'Lac Gelé', decor: 'desert', difficulty: 3, profil: 'technique',
    goal: { id: 'turbo', n: 2 },
    opts: { l: 5 },
    script: 'start [cvd1] [cvd1] B S3 L I B S R L S B S2 R S R B S2 [tr01s] S2< [tr10s] S3 L S L B I S3 KR S R S2 B finish',
    medals: { cristal: 26.6, or: 28, argent: 32.2, bronze: 37.8 },
  },
  {
    // Chapitre 5 · 2/6 — ACROBATIQUE (terrasses). Ouverture : un carreau de verglas, deux boosters puis un REBOND qui envoie la voiture sur une terrasse 2 niveaux plus bas. Quatre rebonds de
    // plus en plus puissants (100, 150, 200, 200 %) et de plus en plus longs (vides de 2, 3, 4 et 4 cases) font descendre la voiture de banquise en banquise (8 niveaux), puis un wall-ride et un
    // plongeon de 10 niveaux. À l'inverse de Spores, qui monte en escalier, la Banquise descend. Un checkpoint avant chaque rebond, suivi de deux boosters (on repart de chacun à l'arrêt).
    id: 'banquise', name: 'Banquise Rebondissante', decor: 'polar', difficulty: 3, profil: 'acrobatique',
    goal: { id: 'under', t: 26 },
    opts: { l: 28 }, pilot: { vCap: 60 },
    script: 'start I B2 S.j100 G2 V-2 S3.i C B2 S.j150 G3 V-2 S3.i C B2 S.j200 G4 V-2 S3.i C B2 S.j200 G4 V-2 S2.i [tr01s] S3< [tr10s] S2 [cdi2] DX [cdo2] S2 B finish',
    medals: { cristal: 23.4, or: 24.6, argent: 28.3, bronze: 33.3 },
  },
  {
    // Chapitre 2 · 5/6 — ROLLERCOASTER (tonneaux). Ouverture : départ AU PLAFOND (la course commence en gravité inversée, comme des racines qui
    // pendent). Deux tonneaux complets autour de l'axe de la route (plafond → mur gauche → sol → mur droit → plafond), un plongeon de
    // 8 niveaux, un virage relevé, de la boue et du vent, puis un double looping. Les checkpoints sont suivis de boosters.
    id: 'racines', name: 'Racines Boueuses', decor: 'jungle', difficulty: 3, profil: 'rollercoaster',
    goal: { id: 'norespawn' },
    opts: { l: 10 },
    script: 'start^ B3^ [tr31s] S< [tr10s] [tr02s] S> [tr23s] S^ [tr31s] S< [tr10s] S C B [cdi2] DX [cdo2] S BLL S S.d S.w100 S C B3 OD S2 B finish',
    medals: { cristal: 19.8, or: 20.9, argent: 24, bronze: 28.2 },
  },
  {
    // Chapitre 5 · 3/6 — TECHNIQUE (glace et aimants). Ouverture : un TOBOGGAN de 10 niveaux dès le départ, qui débouche sur une glace puis une épingle : il faut avoir freiné à temps.
    // Huit virages serrés, de la glace avant les épingles (on ne freine plus dessus, trois cases de route normale après), une chicane sur un mur et des aimants sur la bosse centrale
    // (la voiture reste collée au sol au lieu de décoller). Un booster à chaque relance.
    id: 'glacier', name: 'Glacier Magnétique', decor: 'polar', difficulty: 4, profil: 'technique',
    goal: { id: 'norespawn' },
    opts: { l: 12 },
    script: 'start [cdi2] DX [cdo2] S2 I S2 R B S2 L B S I S2 R S L C B S [tr01s] S2< [tr10s] S2 R B S.m [crs1].m S [cds1].m L B S I S2 R S2 L B S2 finish',
    medals: { cristal: 28.1, or: 29.6, argent: 34, bronze: 39.9 },
  },
  {
    // Chapitre 4 · 4/6 — TECHNIQUE (métro aérien). Ouverture : un booster puis une MONTÉE EN LACETS (deux courbes montantes serrées : on grimpe jusqu'à la ligne aérienne). Treize virages
    // serrés en tout : slalom sans bordures sur le viaduc, épingles, chicane sur un mur, slalom sous un tunnel ; un booster à chaque relance, près d'un quart du temps au freinage.
    id: 'metro', name: 'Métro Aérien', decor: 'city', difficulty: 4, profil: 'technique',
    goal: { id: 'norespawn' },
    opts: { l: 2 },
    script: 'start B CVR2 CVR2 S B R_ L_ R_ L_ S B C B S2 R S R B S [tr01s] S2< [tr10s] S B L S R# L# R# L# S2# B [cdi1] [dn2] [cdo1] S B finish',
    medals: { cristal: 24.1, or: 25.4, argent: 29.2, bronze: 34.3 },
  },
  {
    // Chapitre 6 · 3/6 — TECHNIQUE (basalte). Ouverture : DÉPART SUR UNE PLAQUE DE DÉRIVE (deux cases où l'arrière n'accroche presque plus : le moindre coup de volant fait glisser la voiture),
    // suivie d'un booster. Huit virages serrés dont trois pris sur des dalles de dérive, une chicane sur un mur, une descente de 4 niveaux ; un booster à chaque relance.
    id: 'basalte', name: 'Champs de Basalte', decor: 'volcano', difficulty: 4, profil: 'technique',
    goal: { id: 'norespawn' },
    opts: { l: 6 },
    script: 'start S2.d B S2 R S L S B R.d L.d S2 C B S [tr01s] S2< [tr10s] S2 R S2.d L B S2 R.d S L B S [cdi1] [dn2] [cdo1] S B finish',
    medals: { cristal: 23.9, or: 25.2, argent: 29, bronze: 34 },
  },
  {
    // Chapitre 2 · 6/6 — TECHNIQUE (tunnels). Ouverture : départ dans un tunnel, avec une épingle immédiate. Douze virages serrés (épingles dans
    // un tube, hélice descendante de quatre virages, slalom R L R L sous un tunnel), un tube pris à pleine vitesse et un booster à
    // chaque relance : freiner fort, relancer fort.
    id: 'temple', name: 'Temple', decor: 'jungle', difficulty: 4, profil: 'technique',
    goal: { id: 'norespawn' },
    opts: { l: 8 },
    script: 'start S# R# R# B# S2# B S3 TI TM2 TO S R R B S2 [cdi1] [dn2] [cdo1] S C S [cvd05] [cvd05] [cvd05] [cvd05] S2 B S R# L# R# L# S2# B finish',
    medals: { cristal: 24.6, or: 25.9, argent: 29.7, bronze: 34.9 },
  },
  {
    // Chapitre 4 · 5/6 — ACROBATIQUE (toits). Ouverture : deux boosters → rampe à forte pente qui lance la voiture au-dessus d'un anneau turbo, puis une longue réception de 10 niveaux.
    // Trois sauts de toit en toit (rampe de 6 niveaux, rampe douce de 3 niveaux, rampe de 6 niveaux) avec un petit wall-ride sur une façade entre les deux derniers. Chaque checkpoint est suivi
    // de deux boosters (on repart de chacun à l'arrêt) et placé loin de la réception précédente (un saut un peu long le survolerait).
    id: 'tours', name: 'Tours Jumelles', decor: 'city', difficulty: 4, profil: 'acrobatique',
    goal: { id: 'under', t: 25 },
    opts: { l: 14 }, pilot: { vCap: 60 },
    script: 'start B2 [crv2] UX GR3 DX DX [cdo2] S3 C B2 [crv1] UU G3 DD [cdo1] S [tr01s] S2< [tr10s] S C B2 [crv2] UX G3 DX DX [cdo2] S5 finish',
    medals: { cristal: 22.3, or: 23.5, argent: 27, bronze: 31.7 },
  },
  {
    // Chapitre 7 · 3/6 — ROLLERCOASTER (ceinture d'astéroïdes). Ouverture : un TIRE-BOUCHON à gauche pris à l'élan (une case, aucun booster) puis trois boosters et directement un grand DOUBLE looping
    // (3×3, version large). Ensuite le checkpoint, un slalom de wall-rides gauche / droite, un tube de deux sections à pleine vitesse et un plongeon de 8 niveaux : 15 niveaux de dénivelé.
    id: 'ceinture', name: 'Ceinture d’Astéroïdes', decor: 'orbit', difficulty: 4, profil: 'rollercoaster',
    goal: { id: 'norespawn' },
    opts: { l: 10 }, pilot: { vCap: 66 },
    script: 'start S CKL S B3 OBDL S2 C B2 [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B TI TM2 TO S B [cdi2] DX [cdo2] S B2 finish',
    medals: { cristal: 20.6, or: 21.7, argent: 25, bronze: 29.3 },
  },
  {
    // Chapitre 5 · 4/6 — ROLLERCOASTER (hélices). Ouverture : un TIRE-BOUCHON dès le départ (deux cases d'élan, aucun booster). Puis une première hélice montante de quatre grandes courbes
    // inclinées (16 niveaux), une seconde, descendante et tournant dans l'autre sens (8 niveaux), un double looping et un slalom de wall-rides gauche / droite.
    id: 'helice', name: 'Double Hélice', decor: 'polar', difficulty: 4, profil: 'rollercoaster',
    goal: { id: 'norespawn' },
    opts: { l: 2 }, pilot: { vCap: 66 },
    script: 'start S2 CK S B2 CBR4 CBR4 CBR4 CBR4 S C B [cvdBigL2] [cvdBigL2] [cvdBigL2] [cvdBigL2] S B OD S [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B2 finish',
    medals: { cristal: 30.1, or: 31.7, argent: 36.4, bronze: 42.8 },
  },
  {
    // Chapitre 6 · 4/6 — ROLLERCOASTER (cheminée). Ouverture : trois boosters → un TUBE de deux sections qui débouche directement sur la cheminée, une montée verticale de quatre niveaux
    // (quart de cercle, mur, sommet). Checkpoint au sommet, plongeon de 8 niveaux, grand looping et slalom de wall-rides gauche / droite.
    id: 'cheminee', name: 'Cheminée du Volcan', decor: 'volcano', difficulty: 4, profil: 'rollercoaster',
    goal: { id: 'norespawn' },
    opts: { l: 2 }, pilot: { vCap: 66 },
    script: 'start B3 TI TM2 TO QU WA4 CR S C [cdi2] DX [cdo2] B OB S2 B [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B2 finish',
    medals: { cristal: 16.2, or: 17, argent: 19.6, bronze: 23 },
  },
  {
    // Chapitre 3 · 4/6 — ROLLERCOASTER (tourbillons). Ouverture : quatre boosters puis directement un grand looping TRIPLE (4×4, 7 niveaux de haut). Ensuite un slalom de
    // wall-rides gauche / droite, un grand double looping et un plongeon de 8 niveaux : plus de 15 niveaux de dénivelé et deux murs.
    id: 'vrille', name: 'Tourbillon Tropical', decor: 'isles', difficulty: 4, profil: 'rollercoaster',
    goal: { id: 'norespawn' },
    opts: { l: 8 }, pilot: { vCap: 66 },
    script: 'start B4 OBT S2 C B2 [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B OBDL S C B2 [cdi2] DX [cdo2] S B2 finish',
    medals: { cristal: 22.8, or: 24.1, argent: 27.7, bronze: 32.5 },
  },
  {
    // Chapitre 1 · 5/6 — ROLLERCOASTER. Ouverture : trois boosters puis une montée verticale (montée en L, mur de 3, sommet). Chute depuis le
    // sommet, un virage relevé, un slalom de wall-rides gauche / droite, un grand looping, puis une arche mur → plafond → mur.
    // Verticalité : 9 niveaux (45 m) ; plus de 18 cases sur un mur.
    id: 'grandtour', name: 'Le Grand Tour', decor: 'desert', difficulty: 4, profil: 'rollercoaster',
    goal: { id: 'norespawn' },
    opts: { l: 3 },
    script: 'start B3 QU WA3 CR S [cdi2] DX [cdo2] B BRR S [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S OB S C S [tr01s] S2< [tr13s] S2^ [tr31s] S2< [tr10s] S B2 finish',
    medals: { cristal: 24.4, or: 25.7, argent: 29.6, bronze: 34.7 },
  },
  {
    // Chapitre 7 · 4/6 — SPEEDWAY (circuit fermé, 3 tours). Ouverture : deux boosters puis UN TUBE COURT (2×2) pris à pleine vitesse, directement suivi du premier virage relevé. Quatre virages
    // relevés 3×3 forment l'anneau, avec un wall-ride de deux cases sur le mur gauche (côté intérieur de l'anneau). Sur trois tours, plus de 70 % du temps au-dessus de 250 km/h.
    id: 'grandanneau', name: 'Grand Anneau', decor: 'orbit', difficulty: 4, profil: 'speedway',
    goal: { id: 'nowall' },
    opts: { l: 6 }, pilot: { vCap: 70 }, laps: 3,
    script: 'start B2 TB S2 BRR B S2 C S2 B BRR S [tr01l] S2< [tr10l] S BRR S B S2 B S2 BRR finish',
    medals: { cristal: 45.3, or: 47.7, argent: 54.9, bronze: 64.4 },
  },
  {
    // Chapitre 3 · 5/6 — ACROBATIQUE (gravité lunaire). Ouverture : la plaque de départ règle la gravité à 50 % ; la voiture quitte la plateforme au pas, flotte de 6 niveaux et se
    // réceptionne sur une pente à 4 niveaux. Trois grands sauts de cinq cases (la portée est doublée par la basse gravité) avec de longues réceptions ; chaque rampe est précédée d'un
    // checkpoint et de deux boosters (on repart de chacun à l'arrêt).
    id: 'lunaire', name: 'Sauts Lunaires', decor: 'isles', difficulty: 4, profil: 'acrobatique',
    goal: { id: 'perfect', n: 2 },
    opts: { l: 28 },
    script: 'start S.g50 G2 V-6 [dn4] [cdo2] S C B2 S [crv1] UU G5 DD [cdo1] [crs1] S2 [cds1] C B2 S [crv1] UU G5 DD [cdo1] [crs1] S2 [cds1] C B2 S [crv1] UU G5 DD [cdo1] S5 finish',
    medals: { cristal: 31, or: 32.6, argent: 37.5, bronze: 44 },
  },
  {
    // Chapitre 5 · 5/6 — SPEEDWAY. Ouverture : DIRECTEMENT DANS UN TRÈS GRAND VIRAGE RELEVÉ, sans un seul booster : la voiture l'aborde au pas et les boosters la relancent à la sortie.
    // Six virages relevés 3×3 en couronne (droite, gauche, droite…), un wall-ride de quatre cases (mur droit) et des boosters en sortie de virage : 45 % du tour au-dessus de 250 km/h.
    id: 'couronne', name: 'Couronne Boréale', decor: 'polar', difficulty: 5, profil: 'speedway',
    goal: { id: 'nowall' },
    opts: { l: 6 }, pilot: { vCap: 70 },
    script: 'start BRR B3 S BLL S2 B BRR C S [tr02l] S4> [tr20l] BLL B S2 BRR B S BLL B2 finish',
    medals: { cristal: 19.1, or: 20.1, argent: 23.1, bronze: 27.1 },
  },
  {
    // Chapitre 6 · 5/6 — SPEEDWAY (circuit fermé, 2 tours). Ouverture : deux boosters puis UNE MONTÉE DOUCE de quatre cases (2 niveaux) vers la crête du cratère. Quatre virages relevés 3×3
    // forment l'anneau, avec un wall-ride de quatre cases sur la paroi (mur droit) et la descente douce du retour. Sur deux tours, plus de 70 % du temps au-dessus de 250 km/h.
    id: 'caldeira', name: 'Caldeira', decor: 'volcano', difficulty: 5, profil: 'speedway',
    goal: { id: 'nowall' },
    opts: { l: 6 }, pilot: { vCap: 70 }, laps: 2,
    script: 'start B2 GU4 S BRR B S [tr02l] S4> [tr20l] BRR B S2 C GD4 S BRR S B S2 B S2 B S2 BRR finish',
    medals: { cristal: 35.5, or: 37.4, argent: 43, bronze: 50.5 },
  },
  {
    // Chapitre 5 · 6/6 — TECHNIQUE (tempête). Ouverture : départ dans la POUDREUSE (deux cases de neige épaisse qui freinent la voiture, puis un booster). Neuf virages serrés, du vent
    // latéral avant les épingles, de la neige épaisse en sortie de virage, une chicane sur un mur et une descente finale de 4 niveaux ; un booster à chaque relance.
    id: 'blizzard', name: 'Blizzard', decor: 'polar', difficulty: 5, profil: 'technique',
    goal: { id: 'norespawn' },
    opts: { l: 8 },
    script: 'start S2.p B S2 R S.w150 L S B S2.p R S L B C B S3.w120 R S R S B S2 [tr01s] S2< [tr10s] S L B S.p R S L B S [cdi1] [dn2] [cdo1] S B finish',
    medals: { cristal: 27.8, or: 29.3, argent: 33.7, bronze: 39.5 },
  },
  {
    // Chapitre 4 · 6/6 — ROLLERCOASTER (viaduc). Ouverture : trois boosters → LIFT HILL, une montée de 16 niveaux (80 m) en deux rampes à forte pente. Au sommet un checkpoint, puis un
    // plongeon de 12 niveaux, un grand looping et un slalom de wall-rides gauche / droite. Le plongeon passe à plus de 250 km/h : les murs se prennent avec une grande marge.
    id: 'viaduc', name: 'Viaduc Vertical', decor: 'city', difficulty: 5, profil: 'rollercoaster',
    goal: { id: 'norespawn' },
    opts: { l: 2 }, pilot: { vCap: 66 },
    script: 'start B3 [crv4] UX UX [cro4] S C [cdi2] DX DX [cdo2] B OB S2 B [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B2 finish',
    medals: { cristal: 17.4, or: 18.4, argent: 21.1, bronze: 24.8 },
  },
  {
    // Chapitre 3 · 6/6 — SPEEDWAY. Ouverture : AUCUN booster, une pente douce de six cases (3 niveaux) lance la voiture dans un très grand virage relevé. Cinq virages relevés 3×3,
    // un wall-ride de quatre cases sur la falaise (mur droit), un plongeon de quatre niveaux et des boosters placés en sortie de virage : plus de la moitié du tour au-dessus de 250 km/h,
    // moins de 8 % de freinage.
    id: 'archipel', name: 'Grand Archipel', decor: 'isles', difficulty: 5, profil: 'speedway',
    goal: { id: 'under', t: 21.5 },
    opts: { l: 8 }, pilot: { vCap: 70 },
    script: 'start GD6 BRR S B BLL S2 C B [tr02l] S4> [tr20l] BRR S [cdi1] [dn2] [cdo1] B BLL S2 B BRR S2 B2 finish',
    medals: { cristal: 20, or: 21.1, argent: 24.2, bronze: 28.5 },
  },
  {
    // Chapitre 7 · 5/6 — ACROBATIQUE (apesanteur). Ouverture : deux boosters puis une plaque de gravité à 20 % : la voiture quitte la rampe et flotte sur plus de vingt cases. Trois sauts de
    // 8 à 10 secondes en l'air chacun, 28 niveaux de dénivelé en tout. Entre les sauts : checkpoint et boosters, un wall-ride gauche puis un wall-ride droit. Chaque saut se réceptionne sur une
    // longue descente, très tolérante à la vitesse.
    id: 'apesanteur', name: 'Apesanteur', decor: 'orbit', difficulty: 5, profil: 'acrobatique',
    goal: { id: 'under', t: 52 },
    opts: { l: 44 }, pilot: { vCap: 60 },
    script: 'start B2 S.g20 [crv1] UU G14 D D D D D D D D S3 C B2 [crv1] UU G14 D D D D D D D D S [tr01s] S2< [tr10s] S [tr02s] S2> [tr20s] S C B2 [crv1] UU G14 D D D D D D D D S5 finish',
    medals: { cristal: 46.3, or: 48.7, argent: 56, bronze: 65.8 },
  },
  {
    // Chapitre 6 · 6/6 — ACROBATIQUE (éruptions). Ouverture : trois boosters → une rampe à forte pente SANS virage d'entrée : un saut de huit cases qui retombe dix niveaux plus bas. Quatre
    // éruptions en tout (rampe forte, rampe douce avec anneau turbo, wall-ride entre les deux, rampe forte, rampe douce), chaque checkpoint suivi de deux boosters et placé loin de la réception
    // précédente.
    id: 'eruption', name: 'Éruption', decor: 'volcano', difficulty: 5, profil: 'acrobatique',
    goal: { id: 'under', t: 30 },
    opts: { l: 16 }, pilot: { vCap: 60 },
    script: 'start B3 UX G3 DX DX [cdo2] S3 C B2 [crv1] UU GR2 DD [cdo1] S [tr01s] S2< [tr10s] S C B2 [crv2] UX G3 DX DX [cdo2] S3 C B2 [crv1] UU G3 DD [cdo1] S5 finish',
    medals: { cristal: 27, or: 28.5, argent: 32.7, bronze: 38.4 },
  },
  {
    // Chapitre 7 · 6/6 — TECHNIQUE (station). Ouverture : DÉPART SUR UNE PLATEFORME d'amarrage (deux cases de plateforme, large et plate), un booster puis une première épingle.
    // Neuf virages serrés (épingles et un slalom R L R L), une chicane sur un mur, une descente finale de 4 niveaux ; près de 30 % du temps au freinage et un booster à chaque relance.
    id: 'zenith', name: 'Station Zénith', decor: 'orbit', difficulty: 5, profil: 'technique',
    goal: { id: 'norespawn' },
    opts: { l: 6 },
    script: 'start P2 B S R B S L S R B S2 C B S L R L R B S2 [tr01s] S2< [tr10s] S3 L B S R B [cdi1] [dn2] [cdo1] S B finish',
    medals: { cristal: 23, or: 24.2, argent: 27.8, bronze: 32.7 },
  },
  // ==== 0.9 : quatre nouveaux thèmes (6 circuits chacun) ============================
  // ---- Fonds marins : courants (tapis roulants), eau et bateau, bulles de verre ----
  {
    // Chapitre 8 · 1/6 — SPRINT (courants). Ouverture : deux boosters, puis un CONTRE-COURANT (deux cases de tapis roulant à contresens, −122 km/h) qui freine la voiture, aussitôt suivi d'un courant
    // favorable (+138 km/h, deux cases) qui la relance. Puis une vague douce, un très grand virage plat, un tapis de trois cases, un dernier virage et une descente de 4 niveaux. Les tapis sont loin des virages.
    id: 'courant', name: 'Courant Chaud', decor: 'reef', difficulty: 2, profil: 'sprint',
    goal: { id: 'under', t: 18 },
    opts: { l: 6 }, pilot: { vCap: 66 },
    script: 'start B2 S2.t40 S2.t170 S [crs1] S2 [cds1] B HR S3.t137 B C S2 HL S2 B [cdi1] [dn2] [cdo1] S B2 finish',
    medals: { cristal: 15.5, or: 16.3, argent: 18.8, bronze: 22 },
  },
  {
    // Chapitre 8 · 2/6 — TECHNIQUE (corail). Ouverture : un booster, puis un COURANT FAVORABLE (+72 km/h sur deux cases) qui lance la voiture vers un premier virage serré. Huit virages serrés,
    // une dalle de verre fragile en sortie de virage, une chicane sur un mur et une descente de 4 niveaux ; un booster à chaque relance.
    id: 'corail', name: 'Jardin de Corail', decor: 'reef', difficulty: 3, profil: 'technique',
    goal: { id: 'norespawn' },
    opts: { l: 6 },
    script: 'start B S2.t137 S2 R S L S R S L B C B S R S2.v S L B S2 [tr01s] S2< [tr10s] S R B S L B S [cdi1] [dn2] [cdo1] S B finish',
    medals: { cristal: 22.4, or: 23.6, argent: 27.1, bronze: 31.8 },
  },
  {
    // Chapitre 8 · 3/6 — ROLLERCOASTER (épave). Ouverture : trois boosters puis directement un WALL-RIDE sur le mur droit (le flanc de la coque, trois cases à plus de 200 km/h). Puis le
    // checkpoint, un double looping, un second wall-ride sur le mur gauche et un plongeon de 8 niveaux.
    id: 'epave', name: 'Épave Engloutie', decor: 'reef', difficulty: 3, profil: 'rollercoaster',
    goal: { id: 'norespawn' },
    opts: { l: 12 }, pilot: { vCap: 66 },
    script: 'start B3 [tr02s] S3> [tr20s] S C B2 OD S2 B [tr01s] S3< [tr10s] S B [cdi2] DX [cdo2] S B2 finish',
    medals: { cristal: 14.3, or: 15.1, argent: 17.3, bronze: 20.4 },
  },
  {
    // Chapitre 8 · 4/6 — ACROBATIQUE (gravité lourde). Ouverture : trois boosters puis une plaque de GRAVITÉ À 200 % (la pression des profondeurs) : la voiture ne flotte plus, elle tombe.
    // Rampes raides mais vides très courts (1 ou 2 cases) : quatre sauts brefs de moins de deux secondes, réceptions violentes sur des pentes à forte inclinaison, un wall-ride avant le dernier saut.
    // Chaque checkpoint est suivi de deux boosters ; la gravité lourde reste active jusqu'à l'arrivée.
    id: 'meduses', name: 'Méduses Électriques', decor: 'reef', difficulty: 4, profil: 'acrobatique',
    goal: { id: 'under', t: 30 },
    opts: { l: 24 }, pilot: { vCap: 60 },
    script: 'start B3 S.g200 [crv2] UX G2 DX DX [cdo2] S3 C B2 [crv2] UX G1 DX DX [cdo2] S3 C B2 [crv1] UU G1 DD [cdo1] S [tr01s] S2< [tr10s] S3 C B2 [crv2] UX G2 DX DX [cdo2] S5 finish',
    medals: { cristal: 26.8, or: 28.2, argent: 32.4, bronze: 38.1 },
  },
  {
    // Chapitre 8 · 5/6 — ROLLERCOASTER (abysses). Ouverture : un booster puis un PLONGEON de 12 niveaux (deux rampes à forte pente) qui débouche directement sur un grand looping au fond.
    // Puis un slalom de wall-rides gauche / droite et la remontée en hélice (deux grandes courbes inclinées, 8 niveaux).
    id: 'abysses', name: 'Abysses', decor: 'reef', difficulty: 4, profil: 'rollercoaster',
    goal: { id: 'norespawn' },
    opts: { l: 22 }, pilot: { vCap: 66 },
    script: 'start B [cdi2] DX DX [cdo2] OB S2 C B2 [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B2 CBR4 CBR4 S B finish',
    medals: { cristal: 17.6, or: 18.5, argent: 21.3, bronze: 25 },
  },
  {
    // Chapitre 8 · 6/6 — SPEEDWAY (barrière). Ouverture : deux boosters puis un PONT DE VERRE (trois dalles fragiles, sans danger à grande vitesse) qui débouche sur un virage relevé 3×3.
    // Cinq virages relevés, un wall-ride de quatre cases (mur droit) et un courant favorable de deux cases entre deux virages : plus de 75 % du tour au-dessus de 250 km/h.
    id: 'barriere', name: 'Grande Barrière', decor: 'reef', difficulty: 5, profil: 'speedway',
    goal: { id: 'nowall' },
    opts: { l: 6 }, pilot: { vCap: 70 },
    script: 'start B2 S3.v BRR S B BLL S2 C B [tr02l] S4> [tr20l] BRR S2.t137 BLL B S BRR S B2 finish',
    medals: { cristal: 15.9, or: 16.7, argent: 19.2, bronze: 22.5 },
  },
  // ---- Usine mécanique : obstacles, tapis, moteur coupé, ascenseurs ----
  {
    // Chapitre 9 · 1/6 — SPRINT (chaîne). Ouverture : trois boosters puis TROIS CASES À MOTEUR COUPÉ : la voiture file sur son élan sans pouvoir accélérer, avant de reprendre un booster et un tapis roulant
    // (+72 km/h). Puis une vague douce, deux très grands virages plats (droite, gauche) et une descente finale de 4 niveaux. Un bumper et des piques sur les bords de la route.
    id: 'chaine', name: 'Chaîne de Montage', decor: 'factory', difficulty: 2, profil: 'sprint',
    goal: { id: 'under', t: 18 },
    opts: { l: 6 }, pilot: { vCap: 66 },
    obst: [{ k: 'bumper', at: 0.3, side: 5.5, s: 0.8 }, { k: 'spikes', at: 0.6, side: -5.5, s: 0.7 }],
    script: 'start B3 S3.c B S2.t137 S [crs1] S2 [cds1] B HR S2 B C S HL S2 B [cdi1] [dn2] [cdo1] B2 finish',
    medals: { cristal: 15.2, or: 16.1, argent: 18.5, bronze: 21.7 },
  },
  {
    // Chapitre 9 · 2/6 — TECHNIQUE (laminoir). Ouverture : BIFURCATION dès le départ : la voie de droite porte un booster (c'est la voie rapide, celle que suit le pilote), l'autre reste neutre.
    // Huit virages serrés (slaloms, épingles), une dalle ralentisseur entre deux épingles, une chicane sur un mur, une descente de 4 niveaux ; un booster à chaque relance. Un bumper et des piques sur les bords.
    id: 'laminoir', name: 'Laminoir', decor: 'factory', difficulty: 3, profil: 'technique',
    goal: { id: 'norespawn' },
    opts: { l: 6 },
    obst: [{ k: 'bumper', at: 0.3, side: -5.5, s: 0.8 }, { k: 'spikes', at: 0.8, side: 5.5, s: 0.7 }],
    script: 'start Y2.b B S R S L S R S L B C B S R S2.x S L B S2 [tr01s] S2< [tr10s] S R B S L B S [cdi1] [dn2] [cdo1] S B finish',
    medals: { cristal: 25.8, or: 27.2, argent: 31.3, bronze: 36.7 },
  },
  {
    // Chapitre 9 · 3/6 — ROLLERCOASTER (rouages). Ouverture : deux boosters puis directement une HÉLICE montante (quatre grandes courbes inclinées : 8 niveaux, comme le pas d'une vis). Ensuite le checkpoint,
    // un looping TRIPLE (4×4, petit format), un slalom de wall-rides gauche / droite et un plongeon de 8 niveaux. Des piques escamotables sur le bord de la route.
    id: 'engrenages', name: 'Engrenages', decor: 'factory', difficulty: 3, profil: 'rollercoaster',
    goal: { id: 'norespawn' },
    opts: { l: 10 }, pilot: { vCap: 66 },
    obst: [{ k: 'spikesPop', at: 0.45, side: 5, s: 0.75 }],
    script: 'start B2 CBR2 CBR2 CBR2 CBR2 S C B2 OTL S2 B [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B [cdi2] DX [cdo2] S B2 finish',
    medals: { cristal: 22.1, or: 23.3, argent: 26.8, bronze: 31.4 },
  },
  {
    // Chapitre 9 · 4/6 — SPEEDWAY (fonderie). Ouverture : trois boosters puis UN TUNNEL de quatre cases pris à plus de 250 km/h, directement suivi d'un très grand virage relevé. Cinq virages relevés 3×3,
    // un wall-ride de quatre cases (mur droit), deux cases à moteur coupé entre deux virages (la voiture file sur son élan) et deux bumpers sur les bords.
    id: 'fonderie', name: 'Fonderie', decor: 'factory', difficulty: 4, profil: 'speedway',
    goal: { id: 'nowall' },
    opts: { l: 6 }, pilot: { vCap: 70 },
    obst: [{ k: 'bumper', at: 0.35, side: -5.5, s: 0.8 }, { k: 'bumper', at: 0.75, side: 5.5, s: 0.8 }],
    script: 'start B3 S4# BRR S B BLL S2 C B [tr02l] S4> [tr20l] BRR S2.c BLL B S BRR S B2 finish',
    medals: { cristal: 17.2, or: 18.1, argent: 20.8, bronze: 24.4 },
  },
  {
    // Chapitre 9 · 5/6 — ACROBATIQUE (pistons). Ouverture : deux boosters puis UN TAPIS DE QUATRE PISTONS (quatre rebonds à 150 % qui s'enchaînent sans que la voiture touche le sol plus d'un instant).
    // Puis une rampe raide, un rebond vers une terrasse 2 niveaux plus bas, un wall-ride et une rampe douce. Chaque checkpoint est suivi de deux boosters. Piques escamotables et bumper sur les bords.
    id: 'presse', name: 'Presse Hydraulique', decor: 'factory', difficulty: 4, profil: 'acrobatique',
    goal: { id: 'under', t: 27 },
    opts: { l: 20 }, pilot: { vCap: 60 },
    obst: [{ k: 'spikesPop', at: 0.2, side: -5, s: 0.75 }, { k: 'bumper', at: 0.6, side: 5.5, s: 0.8 }],
    script: 'start B2 S4.j150 S3 C B2 [crv2] UX G3 DX DX [cdo2] S3 C B2 S.j150 G3 V-2 S3 [tr01s] S2< [tr10s] S C B2 [crv1] UU G3 DD [cdo1] S5 finish',
    medals: { cristal: 24.2, or: 25.5, argent: 29.3, bronze: 34.4 },
  },
  {
    // Chapitre 9 · 6/6 — TECHNIQUE (usine folle). Ouverture : deux boosters puis DEUX DALLES RALENTISSEUR (freinage forcé) juste avant le slalom R L R L. Neuf virages serrés, une zone moteur coupé, une chicane
    // sur un mur, une descente de 4 niveaux et un booster à chaque relance. Un marteau tournant au milieu de la route (à passer au bon moment) et, sur les bords, des piques et un bumper.
    id: 'usinefolle', name: 'Usine Folle', decor: 'factory', difficulty: 5, profil: 'technique',
    goal: { id: 'norespawn' },
    opts: { l: 8 },
    obst: [{ k: 'hammer', at: 0.3, side: 0, s: 1 }, { k: 'spikes', at: 0.5, side: 5.5, s: 0.7 }, { k: 'bumper', at: 0.9, side: -5.5, s: 0.8 }],
    script: 'start B2 S2.x R L R L B S2 C B S R S L B S2.c S2 [tr01s] S2< [tr10s] S R B S L B S R B [cdi1] [dn2] [cdo1] S B finish',
    medals: { cristal: 22.5, or: 23.7, argent: 27.3, bronze: 32 },
  },
  // ---- Ville dans les nuages : vent, deltaplane, gravité faible, sauts ----
  {
    // Chapitre 10 · 1/6 — SPRINT (premier envol). Ouverture : trois boosters puis TROIS CASES DE VENT LATÉRAL : le vent pousse la voiture de côté et la trajectoire se corrige dès le départ.
    // Puis une vague en S, deux très grands virages plats (droite, gauche) et une descente finale de 4 niveaux. Presque tout droit.
    id: 'envol', name: 'Premier Envol', decor: 'sky', difficulty: 3, profil: 'sprint',
    goal: { id: 'under', t: 18 },
    opts: { l: 6 }, pilot: { vCap: 66 },
    script: 'start B3 S3.w150 S [crs1] S2 [cds1] B HR S2 B C S2 HL S2 B [cdi1] [dn2] [cdo1] B2 finish',
    medals: { cristal: 14.9, or: 15.6, argent: 18, bronze: 21.1 },
  },
  {
    // Chapitre 10 · 2/6 — ACROBATIQUE (îles suspendues). Ouverture : trois boosters puis une rampe SANS BORDURES (les îles sont des plateformes sans barrière) : la voiture passe un anneau turbo et se pose
    // sur une île plus basse. Trois sauts (rampe douce avec anneau, rampe forte, rampe douce avec anneau) avec un petit wall-ride entre les deux derniers. Chaque checkpoint est suivi de deux boosters.
    id: 'suspendues', name: 'Îles Suspendues', decor: 'sky', difficulty: 3, profil: 'acrobatique',
    goal: { id: 'under', t: 26 },
    opts: { l: 20 }, pilot: { vCap: 60 },
    script: 'start B3_ [crv1]_ UU_ GR3 DD_ [cdo1]_ S3_ C B2_ [crv2]_ UX_ G3 DX_ DX_ [cdo2]_ S3_ C B2_ [tr01s] S2< [tr10s] B_ S_ [crv1]_ UU_ GR3 DD_ [cdo1]_ S5_ finish',
    medals: { cristal: 21.9, or: 23, argent: 26.5, bronze: 31.1 },
  },
  {
    // Chapitre 10 · 3/6 — TECHNIQUE (rafales). Ouverture : deux boosters puis DEUX CASES DE VENT LATÉRAL FORT (180 %) avant le premier virage serré : la voiture arrive de travers. Neuf virages serrés,
    // du vent à chaque relance (150 %, 120 %), une chicane sur un mur, une descente de 4 niveaux ; un booster à chaque relance.
    id: 'rafales', name: 'Rafales', decor: 'sky', difficulty: 4, profil: 'technique',
    goal: { id: 'norespawn' },
    opts: { l: 6 },
    script: 'start B2 S2.w180 S R S L S R B S2 C B S.w150 S2 R S L B S2.w120 S R S L B S [tr01s] S2< [tr10s] S3 R B S2 L B S [cdi1] [dn2] [cdo1] S B finish',
    medals: { cristal: 27.6, or: 29, argent: 33.4, bronze: 39.2 },
  },
  {
    // Chapitre 10 · 4/6 — ROLLERCOASTER (montgolfières, gravité réduite). Ouverture : trois boosters, une plaque de gravité à 40 % puis directement un grand looping (la boucle se prend plus facilement,
    // mais la voiture flotte). Ensuite un slalom de wall-rides gauche / droite et un plongeon de 8 niveaux ; une plaque à 100 % rétablit la pesanteur avant l'arrivée.
    id: 'montgolfieres', name: 'Montgolfières', decor: 'sky', difficulty: 4, profil: 'rollercoaster',
    goal: { id: 'norespawn' },
    opts: { l: 10 }, pilot: { vCap: 66 },
    script: 'start B3 S.g40 OB S2 C B2 [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B [cdi2] DX [cdo2] S.g100 B2 finish',
    medals: { cristal: 14.2, or: 14.9, argent: 17.2, bronze: 20.2 },
  },
  {
    // Chapitre 10 · 5/6 — SPEEDWAY (pont des vents). Ouverture : deux boosters puis du VENT LATÉRAL sur un pont SANS BORDURES, directement suivi d'un très grand virage relevé lui aussi sans bordure.
    // Quatre virages relevés, un wall-ride de quatre cases (mur droit) et un second coup de vent : tout le tour est sans barrière, plus de 70 % du temps au-dessus de 250 km/h.
    id: 'pontvents', name: 'Pont des Vents', decor: 'sky', difficulty: 5, profil: 'speedway',
    goal: { id: 'nowall' },
    opts: { l: 6 }, pilot: { vCap: 70 },
    script: 'start B2_ S2.w150_ BRR_ S_ B_ BLL_ S2_ C B_ [tr02l] S4> [tr20l] BRR_ S2.w100_ B_ BLL_ S_ B2 finish',
    medals: { cristal: 14.3, or: 15, argent: 17.3, bronze: 20.3 },
  },
  {
    // Chapitre 10 · 6/6 — ACROBATIQUE (cité céleste). Ouverture : DÉPART EN DELTAPLANE depuis le bord du toit (plaque deltaplane juste après la ligne, chute de 6 niveaux) : la voiture plane vers une
    // avenue de 10 cases, où une seconde plaque la rend à la voiture. Puis une rampe raide, un wall-ride sur une façade et une rampe douce avec anneau turbo. Les checkpoints sont suivis de deux boosters.
    id: 'cite', name: 'Cité Céleste', decor: 'sky', difficulty: 5, profil: 'acrobatique',
    goal: { id: 'under', t: 32 },
    opts: { l: 40 }, pilot: { vCap: 60 },
    script: 'start S.e G2 V-6 [dn4] [cdo2] S10 S.e S2 C B2 [crv2] UX G3 DX DX [cdo2] S3 C B2 [tr01s] S2< [tr10s] S C B2 [crv1] UU GR3 DD [cdo1] S5 finish',
    medals: { cristal: 26.5, or: 27.9, argent: 32, bronze: 37.6 },
  },
  // ---- Canyon de cristal : gravité inversée, plafonds, verre, volant inversé ----
  {
    // Chapitre 11 · 1/6 — SPRINT (galerie). Ouverture : deux boosters puis TROIS CASES DE VOLANT INVERSÉ (plaque violette) : en ligne droite, le piège est de corriger dans le mauvais sens.
    // Puis une vague en S, deux très grands virages plats (droite, gauche) et une descente finale de 4 niveaux. Presque tout droit.
    id: 'galerie', name: 'Galerie de Cristal', decor: 'caves', difficulty: 3, profil: 'sprint',
    goal: { id: 'under', t: 18 },
    opts: { l: 6 }, pilot: { vCap: 66 },
    script: 'start B2 S3.y S2 [crs1] S2 [cds1] B HR S2 B C S2 HL S2 B [cdi1] [dn2] [cdo1] B2 finish',
    medals: { cristal: 14.9, or: 15.7, argent: 18, bronze: 21.1 },
  },
  {
    // Chapitre 11 · 2/6 — TECHNIQUE (plafond renversé). Ouverture : un booster puis directement une VRILLE : la route se retourne et l'on roule au plafond, en gravité inversée. Quatre virages serrés
    // au plafond (R L R L) avec un checkpoint, vrille de retour, puis quatre autres virages serrés au sol, une chicane sur un mur et une descente de 4 niveaux. Un booster à chaque relance.
    id: 'plafond', name: 'Plafond Renversé', decor: 'caves', difficulty: 4, profil: 'technique',
    goal: { id: 'norespawn' },
    opts: { l: 8 },
    script: 'start B TW.f S2^ B^ R^ S^ L^ S2^ R^ S^ L^ C^ B^ S2^ TWB.f S2 B R S L B S2 [tr01s] S2< [tr10s] S3 R B S L B S [cdi1] [dn2] [cdo1] S B finish',
    medals: { cristal: 25.8, or: 27.2, argent: 31.2, bronze: 36.7 },
  },
  {
    // Chapitre 11 · 3/6 — ACROBATIQUE (cristal fêlé, inversions de gravité). Ouverture : deux boosters puis une PLAQUE D'INVERSION DE GRAVITÉ : la voiture « tombe » vers le plafond, 8 niveaux plus haut,
    // et s'y réceptionne ; une seconde plaque la renvoie au sol. Trois allers-retours (8, 8 et 10 niveaux), une dalle de verre fragile au plafond, un wall-ride final et une descente de 4 niveaux.
    id: 'cristalfele', name: 'Cristal Fêlé', decor: 'caves', difficulty: 4, profil: 'acrobatique',
    goal: { id: 'under', t: 26 },
    opts: { l: 8 }, pilot: { vCap: 60 },
    script: 'start B2 S.f V8 S4^ C^ B2^ S.f^ V-8 S4 C B2 S.f V8 S2.v^ S2^ B2^ S.f^ V-8 S4 C B2 S.f V10 S4^ B2^ S.f^ V-10 S5 [tr01s] S2< [tr10s] S [cdi1] [dn2] [cdo1] S2 finish',
    medals: { cristal: 23.4, or: 24.7, argent: 28.3, bronze: 33.3 },
  },
  {
    // Chapitre 11 · 4/6 — SPEEDWAY (miroir). Ouverture : trois boosters puis un S de deux très grands virages relevés en miroir (gauche puis droite). La suite reprend le dessin à l'envers (droite
    // puis gauche), après un wall-ride de quatre cases (mur droit) ; trois dalles de verre fragile (sans danger à grande vitesse) et un dernier S. Six virages relevés, la moitié du tour au-dessus de 250 km/h.
    id: 'miroir', name: 'Miroir', decor: 'caves', difficulty: 4, profil: 'speedway',
    goal: { id: 'nowall' },
    opts: { l: 6 }, pilot: { vCap: 70 },
    script: 'start B3 BLL S BRR S2 C B [tr02l] S4> [tr20l] BRR S BLL S B2 S3.v B BLL S BRR S B2 finish',
    medals: { cristal: 18.5, or: 19.5, argent: 22.4, bronze: 26.3 },
  },
  {
    // Chapitre 11 · 5/6 — ROLLERCOASTER (vrilles). Ouverture : trois boosters puis directement un double looping (3×3, tournant à gauche). Ensuite un slalom de wall-rides gauche / droite, puis une
    // vrille qui retourne la route : on roule au plafond (gravité inversée) pendant une descente et une remontée, avant une seconde vrille qui remet la route à l'endroit.
    id: 'vrilles', name: 'Vrilles Souterraines', decor: 'caves', difficulty: 5, profil: 'rollercoaster',
    goal: { id: 'norespawn' },
    opts: { l: 6 }, pilot: { vCap: 66 },
    script: 'start B3 ODL S2 C B2 [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B TW.f S2^ D^ S2^ B^ S2^ U^ S^ TWB.f S2 B finish',
    medals: { cristal: 17.7, or: 18.7, argent: 21.5, bronze: 25.2 },
  },
  {
    // Chapitre 11 · 6/6 — TECHNIQUE (cœur de la montagne). Ouverture : un booster puis DEUX DALLES DE VERRE FRAGILE (5 s de résistance) aussitôt suivies d'un slalom R L R L. Huit virages serrés,
    // une chicane sur un mur, une descente de 4 niveaux et un booster à chaque relance : le dernier circuit de la carrière.
    id: 'coeur', name: 'Cœur de la Montagne', decor: 'caves', difficulty: 5, profil: 'technique',
    goal: { id: 'norespawn' },
    opts: { l: 6 },
    script: 'start B S2.v500 S R L R L B S2 C B S R S L B S2 [tr01s] S2< [tr10s] S3 R B S L B S [cdi1] [dn2] [cdo1] S B finish',
    medals: { cristal: 21.1, or: 22.2, argent: 25.5, bronze: 29.9 },
  },
];

// 0.9 : un chapitre de carrière = un thème. Chapitres du plus facile au plus dur, et
// dans chaque chapitre du plus facile au plus dur (tri stable : l'ordre d'écriture
// départage les circuits de même difficulté).
export const THEME_ORDER = ['desert', 'jungle', 'isles', 'city', 'polar', 'volcano', 'orbit', 'reef', 'factory', 'sky', 'caves'];
BUILTIN_TRACKS.sort((a, b) => THEME_ORDER.indexOf(a.decor) - THEME_ORDER.indexOf(b.decor) || a.difficulty - b.difficulty);

export function buildBuiltin(def) {
  const t = scriptTrack(def.name, def.script, { ...(def.opts || {}), decor: def.decor || 'desert' });
  t.author = 'Copytrack';
  if (def.params) t.setParams(def.params);
  // Circuit à plusieurs tours : le chemin du pilote automatique est répété.
  if (def.laps > 1) {
    t.laps = def.laps;
    const one = t.path.slice();
    for (let k = 1; k < def.laps; k++) t.path.push(...one.slice(1));
  }
  // Réglage du pilote automatique propre au circuit (vitesse maximale visée) : sauts ou glace calés pour une vitesse précise.
  if (def.pilot && t.path) t.path.pilot = def.pilot;
  // Obstacles posés le long du parcours : at = fraction du chemin, side = décalage latéral (m).
  if (def.obst && t.path && t.path.length > 10) {
    const P = t.path, n = def.laps > 1 ? Math.floor(P.length / def.laps) : P.length;
    for (const o of def.obst) {
      const i = Math.min(n - 2, Math.floor(n * o.at));
      const a = P[i], b = P[i + 1];
      const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1;
      // Valeurs arrondies : le calcul flottant peut différer d'un moteur JavaScript à l'autre
      // (navigateur / serveur) ; l'empreinte du circuit doit être identique partout.
      const q = (v, st) => Math.round(v / st) * st;
      const ry = q(Math.atan2(dx / l, dz / l), Math.PI / 8);
      t.addDeco({ k: o.k, x: q(a[0] + (-dz / l) * (o.side || 0), 0.5), y: q(a[1], 0.1), z: q(a[2] + (dx / l) * (o.side || 0), 0.5), ry: +ry.toFixed(4), s: o.s || 1, c: 0, ph: o.ph || 0 });
    }
  }
  return t;
}
