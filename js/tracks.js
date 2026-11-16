// Circuits intégrés (créations originales), décrits avec le constructeur "tortue"
// (voir scriptTrack dans track.js). Les temps de médailles sont en secondes.
// 0.9 : 66 circuits, 11 chapitres de 6 (un par thème), du plus facile au plus dur. 0.9.9 : les 66 sont refaits (refonte du level design). 0.9.15 : un 12e chapitre BONUS, l'Atelier des mécanismes (6 circuits).
// Chaque circuit a un `profil` (sprint, speedway, technique, rollercoaster, acrobatique), une ouverture qui n'est celle d'aucun autre, et respecte le contrat
// de tools/contract.mjs (mesuré sur la course du pilote automatique). Le commentaire au-dessus de chaque circuit décrit son ouverture et ce qu'il enseigne ;
// goal = objectif bonus ; pilot.vCap = vitesse visée du pilote qui sert à calibrer les médailles (or = son temps).
// ATTENTION : l'ordre de ce fichier n'est PAS celui de la carrière. La liste est triée en bas de fichier (thème selon CAREER_ORDER, puis difficulté) :
// pour retrouver le numéro d'un circuit, utiliser BUILTIN_TRACKS.findIndex() après import, jamais la position dans le texte.
import { scriptTrack } from './track.js';
import { CAREER_ORDER } from './themes.js';
import { datan2, hypot2 } from './dmath.js';
import { isObstacle } from './obstacles.js';

export const BUILTIN_TRACKS = [
  {
    // Chapitre 1 · 1/6 — SPRINT d'initiation (0.9.74 : refait AUTOUR des nouvelles pièces, pour servir de référence). Ouverture : départ sous une arche, deux boosters, puis un
    // slalom de chicanes rapides (droite, gauche) et un premier wall-ride (transitions douces 2×2). Bifurcation (petit saut tout droit, ou voie de côté), puis un CROISEMENT traversé deux fois : la route en repart pour une
    // boucle de trois virages géants et y revient de côté. Route large sous un portique en poutres entre quatre piliers, chicanes longues, un dernier virage géant ; arrivée entre deux
    // pylônes. Chevrons avant les virages, panneaux danger avant le croisement. Aucun virage serré : le chrono se joue sur la vitesse et la trajectoire.
    id: 'eclats', name: 'Premiers Éclats', decor: 'desert', difficulty: 1, profil: 'sprint',
    appris: 'Départ : sous une arche, deux boosters → slalom de chicanes rapides. Au programme : premier wall-ride, bifurcation (petit saut ou voie de côté), croisement traversé deux fois (trois virages géants), route large sous un portique, chicanes longues.',
    goal: { id: 'under', t: 50.5 },
    opts: { l: 8 }, pilot: { vCap: 66 },
    script: 'start*2 B2 ZR4 B ZL4 [tr01l] S2< [tr10l] C*1 S SPL U G1 D S ALT S4 MRG S JX S4 XR XR XR S4 JX C*1 WI W WO S ZR3 S ZL3 S XL S3 B finish*3',
    obst: [{ k: 'board_right', at: 0.06, side: -20, rot: Math.PI }, { k: 'board_left', at: 0.14, side: 20, rot: Math.PI }, { k: 'board_warn', at: 0.43, side: 18, rot: Math.PI }, { k: 'board_right', at: 0.515, side: -24, rot: Math.PI }, { k: 'board_warn', at: 0.665, side: 18, rot: Math.PI }, { k: 'gantry', at: 0.734, side: 0, s: 2 }, { k: 'pillar', at: 0.722, side: 36 }, { k: 'pillar', at: 0.722, side: -36 }, { k: 'pillar', at: 0.747, side: 36 }, { k: 'pillar', at: 0.747, side: -36 }, { k: 'board_left', at: 0.9, side: 24, rot: Math.PI }],
    medals: { cristal: 45.8, or: 48.2, argent: 55.4, bronze: 65 },
  },
  {
    // Chapitre 3 · 1/6 — SPRINT EN MOTO (0.10.2 : refait AUTOUR des nouvelles pièces). Ouverture : descente en moto vers le lagon. Deux sauts à anneau turbo (le second se reçoit
    // sur une PLAQUE, un banc de sable), chicanes rapides entre les deux, route large sous un portique, très grand virage plat, CROISEMENT traversé deux fois (boucle de trois
    // virages géants), grand S ; deux pyramides de roche à l'arrivée. Aucun virage serré.
    id: 'lagon', name: 'Lagon Turquoise', decor: 'isles', difficulty: 1, profil: 'sprint',
    appris: 'Départ : en moto, descente vers le lagon. Au programme : deux sauts à anneau turbo (le second reçu sur une plaque), chicanes rapides, route large sous un portique, croisement traversé deux fois, grand S.',
    goal: { id: 'rings', n: 2 },
    opts: { l: 8 }, params: { veh0: 'moto' }, pilot: { vCap: 66 },
    script: 'start*1 [cdi1] [dn2] [dn2] [cdo2] B S [crv1] UU GR2 DD [cdo1] B2 ZR4 S ZL4 S [crv1] UU GR2 V-2 [plate3]*10 S B C*2 WI W WO S HL S JX S4 XR XR XR S4 JX ZZR S B2 finish*2',
    obst: [{ k: 'board_right', at: 0.185, side: -20, rot: Math.PI }, { k: 'board_left', at: 0.28, side: 20, rot: Math.PI }, { k: 'gantry', at: 0.501, side: 0, s: 2 }, { k: 'pillar', at: 0.495, side: 36 }, { k: 'pillar', at: 0.495, side: -36 }, { k: 'board_warn', at: 0.565, side: 18, rot: Math.PI }, { k: 'board_right', at: 0.64, side: -24, rot: Math.PI }, { k: 'pyramidS', at: 0.95, side: 28 }, { k: 'pyramidS', at: 0.95, side: -28 }],
    medals: { cristal: 45.9, or: 48.3, argent: 55.5, bronze: 65.2 },
  },
  {
    // Chapitre 5 · 1/6 — SPRINT (0.10.4 : refait AUTOUR des nouvelles pièces). Ouverture : sur la glace (glace, trois boosters, glace). Vague douce, grand S, très grand virage plat,
    // route large sous un portique entre des colonnes de glace, chicane rapide, second très grand virage plat, un TUBE qui tourne à droite puis à gauche, descente, chicane rapide ;
    // blocs de glace à l'arrivée. Aucun virage serré.
    id: 'aurore', name: 'Aurore Naissante', decor: 'polar', difficulty: 1, profil: 'sprint',
    appris: 'Départ : sur la glace, glace, trois boosters, glace. Au programme : grand S, très grands virages plats, route large sous un portique, chicanes rapides, tube qui tourne à droite puis à gauche, blocs de glace.',
    goal: { id: 'under', t: 48.5 },
    opts: { l: 6 }, pilot: { vCap: 66 },
    script: 'start*2 I2 B3 I2 S [crs1] S2 [cds1] B ZZR S2 HR S3 B C*3 WI W3 WO S ZR4 S2 HL S2 TI TM2 TRR TM TLL TM2 TO S B [cdi1] [dn2] [cdo1] S ZL4 S2 B2 finish*2',
    obst: [{ k: 'board_right', at: 0.168, side: -20, rot: Math.PI }, { k: 'gantry', at: 0.344, side: 0, s: 2 }, { k: 'pillarThin', at: 0.338, side: 36 }, { k: 'pillarThin', at: 0.338, side: -36 }, { k: 'board_right', at: 0.392, side: -20, rot: Math.PI }, { k: 'board_warn', at: 0.52, side: 18, rot: Math.PI }, { k: 'board_left', at: 0.862, side: 20, rot: Math.PI }, { k: 'block', at: 0.95, side: 28 }, { k: 'slab', at: 0.95, side: -28 }],
    medals: { cristal: 44.8, or: 47.2, argent: 54.3, bronze: 63.7 },
  },
  {
    // Chapitre 2 · 1/6 — SPRINT (0.10.1 : refait AUTOUR des nouvelles pièces). Ouverture : trois boosters → rampe de lancement avec un anneau turbo dans le saut. Puis un slalom
    // de chicanes rapides, une vague douce, le pont de lianes sans bordures à plus de 230 km/h, un S de virages relevés, une clairière (route large de 56 m sous un portique entre
    // quatre piliers) et un CROISEMENT traversé deux fois (boucle de trois virages géants). Chevrons avant les chicanes et les virages, panneau danger avant le croisement. Aucun virage serré.
    id: 'lianes', name: 'Lianes Néon', decor: 'jungle', difficulty: 2, profil: 'sprint',
    appris: 'Départ : trois boosters → rampe de lancement avec anneau turbo dans le saut. Au programme : chicanes rapides, pont de lianes sans bordures à plus de 230 km/h, S relevé, route large sous un portique, croisement traversé deux fois.',
    goal: { id: 'rings', n: 1 },
    opts: { l: 3 }, pilot: { vCap: 66 },
    script: 'start*2 B3 UU GR2 DD [cdo1] B2 ZR4 S ZL4 [crs1] S2 [cds1] B S2_ B_ S2_ BR S2 B BL S2 C*3 WI W WO S JX S4 XR XR XR S4 JX S B2 finish*2',
    obst: [{ k: 'board_right', at: 0.11, side: -20, rot: Math.PI }, { k: 'board_left', at: 0.195, side: 20, rot: Math.PI }, { k: 'gantry', at: 0.625, side: 0, s: 2 }, { k: 'pillar', at: 0.618, side: 36 }, { k: 'pillar', at: 0.618, side: -36 }, { k: 'pillar', at: 0.634, side: 36 }, { k: 'pillar', at: 0.634, side: -36 }, { k: 'board_warn', at: 0.652, side: 18, rot: Math.PI }, { k: 'board_right', at: 0.725, side: -24, rot: Math.PI }],
    medals: { cristal: 46.2, or: 48.6, argent: 55.9, bronze: 65.6 },
  },
  {
    // Chapitre 4 · 1/6 — SPEEDWAY (0.10.3 : refait AUTOUR des nouvelles pièces). Ouverture : DÉPART SUR UN TAPIS ROULANT à +200 km/h (trois cases) entre deux façades : la voiture
    // est lancée à près de 290 km/h sans un seul booster. Très grands virages relevés, avenue large sous un portique, chicane rapide, wall-ride sur la façade d'une tour, grand S,
    // CROISEMENT traversé deux fois (boucle de trois virages géants) et seconde avenue large sous un portique. Aucun virage serré ; objectif : ne toucher aucune bordure.
    id: 'neons', name: 'Néons Express', decor: 'city', difficulty: 2, profil: 'speedway',
    appris: 'Départ : tapis roulant à +200 km/h entre deux façades, sans booster. Au programme : très grands virages relevés, avenue large sous un portique, chicane rapide, wall-ride sur une tour, grand S, croisement traversé deux fois.',
    goal: { id: 'nowall' },
    opts: { l: 4 }, pilot: { vCap: 70 },
    script: 'start*3 S3.t201 S BRR S2 B BLL S2 WI W2 WO S ZR4 S C*2 B [tr02l] S4> [tr20l] BRR S2 ZZL S B BLL S2 JX S4 XR XR XR S4 JX S B WI W WO S B2 finish*2',
    obst: [{ k: 'wallS', at: 0.03, side: 26, rot: Math.PI / 2 }, { k: 'wallS', at: 0.03, side: -26, rot: Math.PI / 2 }, { k: 'gantry', at: 0.251, side: 0, s: 2 }, { k: 'pillarBase', at: 0.245, side: 36 }, { k: 'pillarBase', at: 0.245, side: -36 }, { k: 'board_right', at: 0.278, side: -20, rot: Math.PI }, { k: 'board_left', at: 0.553, side: 20, rot: Math.PI }, { k: 'board_warn', at: 0.7, side: 18, rot: Math.PI }, { k: 'board_right', at: 0.755, side: -24, rot: Math.PI }, { k: 'gantry', at: 0.941, side: 0, s: 2 }],
    medals: { cristal: 54, or: 56.8, argent: 65.3, bronze: 76.7 },
  },
  {
    // Chapitre 6 · 1/6 — SPRINT (0.10.5 : refait AUTOUR des nouvelles pièces). Ouverture : deux boosters, une colline douce (trois demi-niveaux montants puis descendants). Dos
    // d'âne, chicanes rapides, S relevé, deux pyramides de lave, route large sous un portique entre des piliers de basalte, très grand virage plat, TUBE qui tourne à droite puis à
    // gauche, descente, grand S. Aucun virage serré.
    id: 'braises', name: 'Braises', decor: 'volcano', difficulty: 2, profil: 'sprint',
    appris: 'Départ : deux boosters, une colline douce. Au programme : chicanes rapides, S relevé, route large sous un portique, très grand virage plat, tube qui tourne à droite puis à gauche, grand S.',
    goal: { id: 'under', t: 47 },
    opts: { l: 6 }, pilot: { vCap: 66 },
    script: 'start*2 B2 GU3 GD3 B S [crs1] S2 [cds1] B ZR4 S ZL4 BR S BL S B C*3 WI W2 WO S2 HL S2 TI TM TRR TM TLL TM TO S B [cdi1] [dn2] [cdo1] S ZZR S B2 finish*2',
    obst: [{ k: 'board_right', at: 0.19, side: -20, rot: Math.PI }, { k: 'board_left', at: 0.27, side: 20, rot: Math.PI }, { k: 'pyramidS', at: 0.47, side: 28 }, { k: 'pyramidS', at: 0.47, side: -28 }, { k: 'gantry', at: 0.516, side: 0, s: 2 }, { k: 'pillarBase', at: 0.51, side: 36 }, { k: 'pillarBase', at: 0.51, side: -36 }, { k: 'board_warn', at: 0.6, side: 18, rot: Math.PI }, { k: 'board_right', at: 0.893, side: -20, rot: Math.PI }],
    medals: { cristal: 43.4, or: 45.7, argent: 52.5, bronze: 61.7 },
  },
  {
    // Chapitre 1 · 2/6 — SPEEDWAY (0.9.74 : refait AUTOUR des nouvelles pièces). Ouverture : un booster et la vallée s'élargit aussitôt (route de 56 m sous un portique en poutres).
    // Trois fois la vallée s'élargit et se resserre, chaque fois sous un portique ; virages géants pris au-dessus de 200 km/h, chicanes rapides, wall-ride de 6 cases sur la paroi
    // du canyon le long d'une rangée de piliers, bifurcation (voie directe, ou grand saut à gauche). Chevrons avant les virages. Aucun virage serré.
    id: 'canyon', name: 'Canyon Corail', decor: 'desert', difficulty: 2, profil: 'speedway',
    appris: 'Départ : un booster → la vallée s’élargit aussitôt (route de 56 m). Au programme : trois routes larges sous des portiques, virages géants au-dessus de 200 km/h, chicanes rapides, wall-ride le long des piliers, bifurcation : voie directe ou grand saut.',
    goal: { id: 'nowall' },
    opts: { l: 8 }, pilot: { vCap: 72 },
    script: 'start B WI W2 WO XR S ZR4 S2 [tr02l] S6> [tr20l] S C WI W WO XR S2 SPLL S4 ALT U G2 D MRG S2 XR WI W WO S ZL4 XL S2 B finish*2',
    obst: [{ k: 'gantry', at: 0.048, side: 0, s: 2 }, { k: 'gantry', at: 0.472, side: 0, s: 2 }, { k: 'gantry', at: 0.788, side: 0, s: 2 }, { k: 'pillarBase', at: 0.3, side: -24 }, { k: 'pillarBase', at: 0.33, side: -24 }, { k: 'pillarBase', at: 0.36, side: -24 }, { k: 'board_right', at: 0.095, side: -24, rot: Math.PI }, { k: 'board_right', at: 0.505, side: -24, rot: Math.PI }, { k: 'board_right', at: 0.735, side: -24, rot: Math.PI }, { k: 'board_left', at: 0.905, side: 24, rot: Math.PI }],
    medals: { cristal: 45.2, or: 47.6, argent: 54.7, bronze: 64.2 },
  },
  {
    // Chapitre 7 · 1/6 — SPRINT (amarrage). Ouverture : un booster puis UN TUBE de trois cases. Après le tube, un saut en BASSE GRAVITÉ (plaque à 40 %) : la voiture flotte sur plus de dix cases,
    // traverse un anneau turbo et se pose sur un quai de dix cases, cinq niveaux plus bas. Puis un très grand virage plat et une descente finale de 4 niveaux. Presque tout droit.
    id: 'quai', name: 'Quai d’Amarrage', decor: 'orbit', difficulty: 2, profil: 'sprint',
    appris: 'Départ : un booster → tube. Au programme : saut en basse gravité (40 %) avec anneau turbo, très grand virage plat.',
    goal: { id: 'rings', n: 1 },
    opts: { l: 14 }, pilot: { vCap: 66 },
    script: 'start B TI TM TO B S.g40 [crs1] UU GR2 G5 V-5 S10 S.g100 B C S HR S B [cdi1] [dn2] [cdo1] B2 finish',
    medals: { cristal: 23.3, or: 24.6, argent: 28.3, bronze: 33.2 },
  },
  {
    // Chapitre 1 · 3/6 — ACROBATIQUE (0.9.74 : refait AUTOUR des nouvelles pièces). Ouverture : chute libre immédiate, depuis l'arrêt (la voiture quitte la plateforme de départ et se
    // réceptionne sur une descente à 38°). Cinq sauts : quatre se reçoivent sur des PLAQUES bordées sur leurs côtés (dont un saut qui retombe deux niveaux plus bas, sans rampe de réception),
    // des chicanes longues entre les sauts, un wall-ride sur le mur gauche, une rampe à 38°, une bifurcation (sauter la terrasse ou descendre la pente) et un dernier saut à travers un anneau turbo. Chaque checkpoint
    // (entre deux pylônes) est suivi de deux boosters avant la rampe : on peut repartir À L'ARRÊT de chacun. Chevrons de montée avant les rampes.
    id: 'tremplins', name: 'Tremplins du Crépuscule', decor: 'desert', difficulty: 2, profil: 'acrobatique',
    appris: 'Départ : chute libre (la voiture quitte la plateforme de départ, à l’arrêt). Au programme : cinq sauts reçus sur des plaques, chicanes, wall-ride, rampe à 38°, bifurcation : sauter la terrasse ou descendre la pente, dernier saut dans un anneau.',
    goal: { id: 'perfect', n: 1 },
    opts: { l: 24 }, pilot: { vCap: 60 },
    script: 'start V-5 [dn4] [cdo2] S C*3 B2 S [crv1] UU G2 DD [cdo1] [plate3]*10 ZR3 S C*3 B2 S [crv1] UU G2 V-2 [plate3]*10 S XR S [tr01s] S2< [tr10s] S C*3 B2 S [crv2] UX G2 DX DX [cdo2] [plate3]*10 ZL3 SPL S2 G1 V-2 S ALT [dn2] S3 MRG S XL S C*3 B2 S UU GR2 DD [cdo1] [plate2]*10 S2 finish',
    obst: [{ k: 'board_up', at: 0.1, side: 18, rot: Math.PI }, { k: 'board_up', at: 0.31, side: -18, rot: Math.PI }, { k: 'board_up', at: 0.495, side: 18, rot: Math.PI }, { k: 'board_up', at: 0.875, side: -18, rot: Math.PI }],
    medals: { cristal: 55.9, or: 58.9, argent: 67.7, bronze: 79.5 },
  },
  {
    // Chapitre 4 · 3/6 — ROLLERCOASTER (0.10.3 : refait AUTOUR des nouvelles pièces). Ouverture : trois boosters → deux loopings décalés (droite, gauche). Wall-ride à gauche, chicane
    // longue, virage relevé, wall-ride à droite, grand looping, avenue large sous un portique, LOOPING MODULAIRE (deux murs de chaque côté), plongeon à 38°, TUBE qui tourne à droite
    // puis à gauche, chicane longue. Panneaux danger avant les loopings et le tube.
    id: 'hyper', name: 'Hyperboucle', decor: 'city', difficulty: 3, profil: 'rollercoaster',
    appris: 'Départ : trois boosters → deux loopings décalés. Au programme : wall-rides des deux côtés, chicane longue, grand looping, avenue large sous un portique, looping modulaire, plongeon à 38°, tube qui tourne.',
    goal: { id: 'norespawn' },
    opts: { l: 12 }, pilot: { vCap: 66 },
    script: 'start*2 B3 O OL S2 B3 [tr01s] S4< [tr10s] S ZR3 S BR S2 B [tr02s] S4> [tr20s] S C*1 B OB S2 WI W WO S LPR2 S B [cdi2] DX [cdo2] S TI TM TRR TM TLL TM TO S ZL3 S B2 finish*2',
    obst: [{ k: 'board_warn', at: 0.025, side: 18, rot: Math.PI }, { k: 'board_right', at: 0.28, side: -20, rot: Math.PI }, { k: 'board_warn', at: 0.49, side: 18, rot: Math.PI }, { k: 'gantry', at: 0.581, side: 0, s: 2 }, { k: 'pillar', at: 0.576, side: 36 }, { k: 'pillar', at: 0.576, side: -36 }, { k: 'board_warn', at: 0.6, side: -18, rot: Math.PI }, { k: 'board_warn', at: 0.762, side: 18, rot: Math.PI }, { k: 'board_left', at: 0.925, side: 20, rot: Math.PI }],
    medals: { cristal: 48.9, or: 51.5, argent: 59.2, bronze: 69.5 },
  },
  {
    // Chapitre 2 · 2/6 — SPEEDWAY (0.10.1 : refait AUTOUR des nouvelles pièces). Ouverture : départ dans un tube accélérateur de trois sections. Très grands virages relevés, deux
    // routes larges sous des portiques (la canopée s'ouvre), un grand S, un wall-ride de cinq cases sur un tronc, une chicane longue, puis un TUBE qui tourne à droite puis à gauche
    // entre les branches. Chevrons avant les chicanes, panneau danger avant le tube. Aucun virage serré.
    id: 'canopee', name: 'Canopée', decor: 'jungle', difficulty: 3, profil: 'speedway',
    appris: 'Départ : dans un tube accélérateur de trois sections. Au programme : très grands virages relevés, deux routes larges sous des portiques, grand S, wall-ride sur un tronc, chicane longue, tube qui tourne à droite puis à gauche.',
    goal: { id: 'under', t: 62 },
    opts: { l: 5 }, pilot: { vCap: 64 },
    script: 'start*3 TI TM3.b TO BRR S B BLL S WI W2 WO S [crs1] S2 [cds1] S ZZR S [tr01l] S5< [tr10l] C*2 B BRR S ZL3 S [crs1] S [cds1] B BLL S2 TI TM TRR TM TLL TM TO S BRR S B WI W WO BLL S2 B2 finish*2',
    obst: [{ k: 'gantry', at: 0.231, side: 0, s: 2 }, { k: 'pillarBase', at: 0.225, side: 36 }, { k: 'pillarBase', at: 0.225, side: -36 }, { k: 'board_right', at: 0.29, side: -20, rot: Math.PI }, { k: 'board_left', at: 0.505, side: 20, rot: Math.PI }, { k: 'board_warn', at: 0.652, side: 18, rot: Math.PI }, { k: 'gantry', at: 0.887, side: 0, s: 2 }, { k: 'pillarBase', at: 0.887, side: 36 }, { k: 'pillarBase', at: 0.887, side: -36 }],
    medals: { cristal: 57.5, or: 60.5, argent: 69.6, bronze: 81.7 },
  },
  {
    // Chapitre 2 · 3/6 — ACROBATIQUE (0.10.1 : refait AUTOUR des nouvelles pièces). Ouverture : deux boosters et un champignon rebondissant (rebond à 200 %). Quatre rebonds en
    // escalier : chacun envoie la voiture deux niveaux plus haut, sur une PLAQUE bordée (trois grandes, une moyenne), suivie d'un grand virage et d'un checkpoint entre deux pylônes ;
    // chicanes longues entre les rebonds, descente à 38°, chicane rapide. Panneaux de montée avant chaque champignon. Réception parfaite possible à chaque rebond.
    id: 'spores', name: 'Spores', decor: 'jungle', difficulty: 3, profil: 'acrobatique',
    appris: 'Départ : deux boosters → un champignon rebondissant. Au programme : quatre rebonds en escalier reçus sur des plaques, deux niveaux plus haut à chaque fois, chicanes longues entre les rebonds, descente à 38°, chicane rapide.',
    goal: { id: 'perfect', n: 3 },
    opts: { l: 2 },
    script: 'start*1 B2 S.j200 G1 V2 [plate3]*10 S2 RR C*3 B2 S.j200 G1 V2 [plate3]*10 S2 LL ZR3 C*3 B2 S.j200 G1 V2 [plate3]*10 S2 RR S ZL3 C*3 B2 S.j200 G1 V2 [plate2]*10 S2 LL S B [cdi2] DX [cdo2] B ZR4 S [crs1] S [cds1] B2 finish*3',
    obst: [{ k: 'board_up', at: 0.035, side: 18, rot: Math.PI }, { k: 'board_up', at: 0.185, side: -18, rot: Math.PI }, { k: 'board_up', at: 0.395, side: 18, rot: Math.PI }, { k: 'board_up', at: 0.618, side: -18, rot: Math.PI }, { k: 'board_right', at: 0.292, side: -20, rot: Math.PI }, { k: 'board_left', at: 0.515, side: 20, rot: Math.PI }, { k: 'sign_down', at: 0.745, side: 18, rot: Math.PI }],
    medals: { cristal: 47.3, or: 49.7, argent: 57.2, bronze: 67.2 },
  },
  {
    // Chapitre 3 · 2/6 — TECHNIQUE EN BATEAU (0.10.2 : refait AUTOUR des nouvelles pièces). Ouverture : plaque bateau, puis des lacets sur l'eau. Retour à la voiture, wall-ride,
    // épingle, ROUTE ÉTROITE (12 m) sur une jetée entre des piliers fins, virages serrés, lacets descendants, deux chicanes serrées, CROISEMENT traversé deux fois (boucle de virages
    // serrés) ; on finit en bateau sur l'eau, pour l'objectif.
    id: 'recif', name: 'Récif', decor: 'isles', difficulty: 3, profil: 'technique',
    appris: 'Départ : plaque bateau, puis des lacets sur l’eau. Au programme : wall-ride, épingle, route étroite sur une jetée, chicanes serrées, croisement traversé deux fois, retour au bateau pour finir sur l’eau.',
    goal: { id: 'vehicle', v: 'boat' },
    opts: { l: 4 },
    pilot: { vCap: 60 },
    script: 'start*3 S.n S2.a R.a L.a R.a L.a S.a S.n B2 S [tr01s] S2< [tr10s] S3 R R B S2 NI N2 NO L S L B S3 [cvd05] [cvdL05] B ZR S ZL B C*1 JX R S R R S JX R S B S C*3 S.n S2.a R.a L.a R.a L.a S2.a finish*2',
    obst: [{ k: 'sign_uturn', at: 0.318, side: 18, rot: Math.PI }, { k: 'board_warn', at: 0.38, side: 16, rot: Math.PI }, { k: 'pillarThin', at: 0.405, side: 14 }, { k: 'pillarThin', at: 0.405, side: -14 }, { k: 'pillarThin', at: 0.42, side: 14 }, { k: 'pillarThin', at: 0.42, side: -14 }, { k: 'board_right', at: 0.575, side: -16, rot: Math.PI }, { k: 'board_left', at: 0.625, side: 16, rot: Math.PI }, { k: 'board_warn', at: 0.688, side: 16, rot: Math.PI }],
    medals: { cristal: 59.7, or: 62.9, argent: 72.3, bronze: 84.8 },
  },
  {
    // Chapitre 3 · 3/6 — ACROBATIQUE (0.10.2 : refait AUTOUR des nouvelles pièces). Ouverture : trois boosters, plaque DELTAPLANE et grand saut à anneau turbo (on plane jusqu'à la
    // descente). Retour à la voiture, saut à anneau reçu sur une PLAQUE, chicane longue, montée en hélice autour du phare (quatre grandes courbes montantes), route large au sommet sous
    // un portique, descente à 38°, chicane longue et dernier saut à anneau reçu sur une plaque.
    id: 'phare', name: 'Phare', decor: 'isles', difficulty: 3, profil: 'acrobatique',
    appris: 'Départ : plaque deltaplane, grand saut à anneau turbo. Au programme : saut reçu sur une plaque, chicane longue, hélice autour du phare, route large au sommet, descente à 38°, dernier saut reçu sur une plaque.',
    goal: { id: 'rings', n: 2 },
    opts: { l: 4 },
    script: 'start*2 B3 S.e UU GR4 DD S5 S.e S C*3 B2 S [crv1] UU GR1 V-2 [plate3]*10 S ZR3 S2 CBR2 CBR2 CBR2 CBR2 S C*3 WI W WO B [cdi2] DX [cdo2] B ZL3 S2 [crv1] UU GR1 V-2 [plate2]*10 S2 B finish*1',
    obst: [{ k: 'board_up', at: 0.29, side: 18, rot: Math.PI }, { k: 'board_right', at: 0.372, side: -20, rot: Math.PI }, { k: 'board_warn', at: 0.47, side: 18, rot: Math.PI }, { k: 'gantry', at: 0.664, side: 0, s: 2 }, { k: 'pillarBase', at: 0.658, side: 36 }, { k: 'pillarBase', at: 0.658, side: -36 }, { k: 'sign_down', at: 0.705, side: 18, rot: Math.PI }, { k: 'board_left', at: 0.77, side: 20, rot: Math.PI }, { k: 'board_up', at: 0.87, side: -18, rot: Math.PI }],
    medals: { cristal: 50.1, or: 52.7, argent: 60.7, bronze: 71.2 },
  },
  {
    // Chapitre 2 · 4/6 — TECHNIQUE (0.10.1 : refait AUTOUR des nouvelles pièces). Ouverture : bifurcation, la voie de droite passe sur une plaque MOTO. Lacets descendants, une route
    // ÉTROITE (12 m) entre des piliers fins, un wall-ride, des épingles en S, deux chicanes serrées, un CROISEMENT traversé deux fois (boucle de virages serrés autour) et une seconde
    // route étroite avant l'arrivée. Le circuit se finit en moto pour l'objectif.
    id: 'serpent', name: 'Serpent', decor: 'jungle', difficulty: 3, profil: 'technique',
    appris: 'Départ : bifurcation, la voie de droite passe sur une plaque moto. Au programme : lacets descendants, route étroite entre des piliers, wall-ride, épingles en S, chicanes serrées, croisement traversé deux fois, seconde route étroite.',
    goal: { id: 'vehicle', v: 'moto' },
    opts: { l: 8 },
    script: 'start*2 Y2.o B S [cvd05] [cvdL05] [cvd05] [cvdL05] B S NI N2 NO S.o S [tr01s] S2< [tr10s] S R L R L B S2 C*3 ZR S ZL B JX R S R R S JX B S2 C S.o S R L R L B NI N NO S2 B finish*1',
    obst: [{ k: 'board_warn', at: 0.2, side: 16, rot: Math.PI }, { k: 'pillarThin', at: 0.226, side: 14 }, { k: 'pillarThin', at: 0.226, side: -14 }, { k: 'pillarThin', at: 0.245, side: 14 }, { k: 'pillarThin', at: 0.245, side: -14 }, { k: 'board_right', at: 0.524, side: -16, rot: Math.PI }, { k: 'board_left', at: 0.578, side: 16, rot: Math.PI }, { k: 'board_warn', at: 0.628, side: 16, rot: Math.PI }, { k: 'board_warn', at: 0.892, side: 16, rot: Math.PI }],
    medals: { cristal: 51.5, or: 54.2, argent: 62.4, bronze: 73.2 },
  },
  {
    // Chapitre 6 · 2/6 — SPEEDWAY (0.10.5 : refait AUTOUR des nouvelles pièces). Ouverture : un booster et un S relevé. Route large sous un portique, très grands virages relevés,
    // chicane rapide, wall-ride à droite, colonnes de basalte, descente, grand S, TUBE qui tourne à droite puis à gauche dans la coulée. Aucun virage serré ; objectif : ne toucher
    // aucune bordure.
    id: 'coulee', name: 'Coulée Ardente', decor: 'volcano', difficulty: 3, profil: 'speedway',
    appris: 'Départ : un booster et un S relevé. Au programme : route large sous un portique, très grands virages relevés, chicane rapide, wall-ride, descente, grand S, tube qui tourne dans la coulée.',
    goal: { id: 'nowall' },
    opts: { l: 12 }, pilot: { vCap: 70 },
    script: 'start*3 B BR S BL S WI W2 WO S BRR S B ZR4 S [tr02l] S4> [tr20l] BLL S2 C*2 B [cdi1] [dn2] [cdo1] ZZL S BRR S TI TM TRR TM TLL TM TO S BLL B2 finish*2',
    obst: [{ k: 'gantry', at: 0.14, side: 0, s: 2 }, { k: 'pillar', at: 0.134, side: 36 }, { k: 'pillar', at: 0.134, side: -36 }, { k: 'board_right', at: 0.258, side: -20, rot: Math.PI }, { k: 'pillarBase', at: 0.52, side: 26 }, { k: 'pillarBase', at: 0.52, side: -26 }, { k: 'board_left', at: 0.577, side: 20, rot: Math.PI }, { k: 'board_warn', at: 0.7, side: 18, rot: Math.PI }],
    medals: { cristal: 44.8, or: 47.1, argent: 54.2, bronze: 63.6 },
  },
  {
    // Chapitre 7 · 2/6 — TECHNIQUE (navette, moto). Ouverture : DÉPART EN MOTO (plaque moto sur la case qui suit la ligne de départ) puis un slalom R L R L immédiat. Huit virages serrés,
    // une chicane sur un mur, une descente de 4 niveaux et un booster à chaque relance ; il n'y a plus de plaque ensuite : l'arrivée se franchit en moto (objectif bonus).
    id: 'navette', name: 'Navette', decor: 'orbit', difficulty: 3, profil: 'technique',
    appris: 'Départ : en moto (plaque), slalom R L R L immédiat. Au programme : huit virages serrés, chicane, arrivée en moto (objectif bonus).',
    goal: { id: 'vehicle', v: 'moto' },
    opts: { l: 8 },
    script: 'start S.o B R L R L B S2 C B S R S L B S2 [tr01s] S2< [tr10s] S R B S L B S [cdi1] [dn2] [cdo1] S B finish',
    medals: { cristal: 26.5, or: 27.9, argent: 32.1, bronze: 37.7 },
  },
  {
    // Chapitre 4 · 2/6 — SPRINT (0.10.3 : refait AUTOUR des nouvelles pièces). Ouverture : boulevard sans bordures, boosters. Dos d'âne, chicanes rapides, tunnel, très grand virage
    // plat, deux immeubles en blocs, avenue large sous un portique, chicanes longues, descente, un TUBE qui tourne à droite puis à gauche sous la ville, grand S. Aucun virage serré.
    id: 'boulevard', name: 'Boulevard Sans Fin', decor: 'city', difficulty: 2, profil: 'sprint',
    appris: 'Départ : boulevard sans bordures, boosters. Au programme : chicanes rapides, tunnel, très grand virage plat, avenue large sous un portique, chicanes longues, tube qui tourne sous la ville, grand S.',
    goal: { id: 'under', t: 47.5 },
    opts: { l: 4 }, pilot: { vCap: 66 },
    script: 'start*2 B2_ S3_ B_ S [crs1] S2 [cds1] B ZR4 S ZL4 S B2# S2# C*3 B S3 HR S2 WI W2 WO S ZR3 S2 ZL3 B [cdi1] [dn2] [cdo1] S TI TM TRR TM TLL TM TO S ZZR S B2 finish*1',
    obst: [{ k: 'board_right', at: 0.15, side: -20, rot: Math.PI }, { k: 'board_left', at: 0.225, side: 20, rot: Math.PI }, { k: 'block', at: 0.38, side: 28 }, { k: 'block', at: 0.38, side: -28 }, { k: 'gantry', at: 0.464, side: 0, s: 2 }, { k: 'pillar', at: 0.458, side: 36 }, { k: 'pillar', at: 0.458, side: -36 }, { k: 'board_right', at: 0.5, side: -20, rot: Math.PI }, { k: 'board_warn', at: 0.676, side: 18, rot: Math.PI }],
    medals: { cristal: 43.9, or: 46.2, argent: 53.2, bronze: 62.4 },
  },
  {
    // Chapitre 1 · 4/6 — ROLLERCOASTER (spirale ; placé avant Lac Gelé pour que deux Rollercoasters ne se suivent pas ; 0.9.74 : refait AUTOUR des nouvelles pièces). Ouverture :
    // trois boosters puis directement un LOOPING MODULAIRE (deux murs de chaque côté). Hélice montante de quatre grandes courbes inclinées (16 niveaux), checkpoint au sommet, plongeon
    // à 38°, slalom de wall-rides et chicanes longues, virage géant, un TUBE qui tourne à gauche puis à droite, bifurcation (tout droit, ou par le mur de droite), deux autres loopings
    // modulaires (quatre murs, puis aucun) ; arrivée sous une arche. Panneaux danger avant les loopings, chevrons avant les virages géants.
    id: 'spirale', name: 'Spirale Prismatique', decor: 'desert', difficulty: 3, profil: 'rollercoaster',
    appris: 'Départ : trois boosters → directement un looping modulaire. Au programme : hélice de 16 niveaux, plongeon à 38°, wall-rides et chicanes, tube qui tourne, bifurcation : tout droit ou par le mur, trois loopings modulaires de hauteurs différentes.',
    goal: { id: 'norespawn' },
    opts: { l: 2 },
    pilot: { vCap: 52 },
    script: 'start B3 LPR2 S B CBR4 CBR4 CBR4 CBR4 S C [cdi2] DX DX DX [cdo2] B S [tr01s] S2< [tr10s] S ZR3 [tr02s] S3> [tr20s] S XL S C B TI TM TRR TM TLL TM TO S SPL S4 ALT [tr02s] S2> [tr20s] MRG S XR B S LPL4 S ZL3 [tr01s] S3< [tr10s] S B LPR0 S B2 finish*2',
    obst: [{ k: 'board_warn', at: 0.02, side: 18, rot: Math.PI }, { k: 'board_warn', at: 0.675, side: 18, rot: Math.PI }, { k: 'board_warn', at: 0.912, side: -18, rot: Math.PI }, { k: 'board_left', at: 0.405, side: 24, rot: Math.PI }, { k: 'board_right', at: 0.647, side: -24, rot: Math.PI }],
    medals: { cristal: 68.9, or: 72.5, argent: 83.4, bronze: 97.9 },
  },
  {
    // Chapitre 1 · 4/6 — TECHNIQUE (0.9.74 : refait AUTOUR des nouvelles pièces). Ouverture : une route étroite (12 m) qui mène à une épingle sur la glace. Deux NŒUDS EN 8 :
    // la route repasse chaque fois par le même croisement (lacets serrés autour), des chicanes en S, une seconde route étroite après le wall-ride, de la glace avant les épingles,
    // un checkpoint dans un virage et une bifurcation (ligne droite verglacée, ou détour qui accroche). Panneaux danger avant les croisements, demi-tour avant une épingle.
    id: 'verglas', name: 'Lac Gelé', decor: 'desert', difficulty: 3, profil: 'technique',
    appris: 'Départ : sur une route étroite, épingle sur la glace. Au programme : virages serrés, deux nœuds en 8 par des croisements, chicanes en S, wall-ride, seconde route étroite, glace avant les épingles, bifurcation : ligne verglacée ou détour qui accroche.',
    goal: { id: 'turbo', n: 2 },
    opts: { l: 6 },
    script: 'start NI N NO L I B R L S B JX R S R R S JX R B S2 L ZR ZL R S B C S R L JX L S L L S JX L B S2 [tr01s] S2< [tr10s] NI N2 NO R S L B I S3 KR S R S2 B C SPLL I3 ALT S3 MRG S L B S2 R [cvd1] S KL S2 B finish',
    obst: [{ k: 'board_left', at: 0.03, side: 12, rot: Math.PI }, { k: 'board_warn', at: 0.112, side: 16, rot: Math.PI }, { k: 'board_warn', at: 0.373, side: 16, rot: Math.PI }, { k: 'board_right', at: 0.252, side: -16, rot: Math.PI }, { k: 'board_left', at: 0.28, side: 16, rot: Math.PI }, { k: 'sign_uturn', at: 0.62, side: 12, rot: Math.PI }],
    medals: { cristal: 79.2, or: 83.4, argent: 95.9, bronze: 112.6 },
  },
  {
    // Chapitre 5 · 2/6 — ACROBATIQUE (0.10.4 : refait AUTOUR des nouvelles pièces). Ouverture : glace, deux boosters, premier rebond (100 %). Quatre rebonds de plus en plus forts
    // (100, 150, 200, 200 %) qui descendent chacun de deux niveaux : deux se reçoivent sur la glace, deux sur des PLAQUES (des plaques de banquise, entre des blocs de glace) ;
    // wall-ride, chicanes longues, descente à 38°, route large sous un portique. Panneaux de montée avant chaque rebond.
    id: 'banquise', name: 'Banquise Rebondissante', decor: 'polar', difficulty: 3, profil: 'acrobatique',
    appris: 'Départ : glace, deux boosters, premier rebond. Au programme : quatre rebonds de plus en plus forts, réceptions sur la glace et sur des plaques de banquise, wall-ride, chicanes longues, descente à 38°, route large.',
    goal: { id: 'under', t: 47.5 },
    opts: { l: 28 }, pilot: { vCap: 60 },
    script: 'start*3 I B2 S.j100 G1 V-2 S3.i C*3 B2 S.j150 G2 V-2 [plate3]*10 S C*3 B2 S.j200 G2 V-2 S3.i C*3 B2 S.j200 G2 V-2 [plate3]*10 S [tr01s] S3< [tr10s] S2 ZL3 S [cdi2] DX [cdo2] S2 ZR3 S WI W2 WO S ZL3 S B2 finish*2',
    obst: [{ k: 'board_up', at: 0.05, side: 18, rot: Math.PI }, { k: 'board_up', at: 0.155, side: -18, rot: Math.PI }, { k: 'block', at: 0.2, side: 60 }, { k: 'block', at: 0.2, side: -60 }, { k: 'board_up', at: 0.258, side: 18, rot: Math.PI }, { k: 'board_up', at: 0.36, side: -18, rot: Math.PI }, { k: 'board_left', at: 0.58, side: 20, rot: Math.PI }, { k: 'sign_down', at: 0.655, side: 18, rot: Math.PI }, { k: 'board_right', at: 0.728, side: -20, rot: Math.PI }, { k: 'gantry', at: 0.83, side: 0, s: 2 }, { k: 'pillar', at: 0.825, side: 36 }, { k: 'pillar', at: 0.825, side: -36 }],
    medals: { cristal: 44, or: 46.3, argent: 53.2, bronze: 62.5 },
  },
  {
    // Chapitre 2 · 5/6 — ROLLERCOASTER (0.10.1 : refait AUTOUR des nouvelles pièces). Ouverture : départ AU PLAFOND (dans les racines), trois boosters, puis le mur gauche. Slalom
    // plafond → mur droit → plafond → mur gauche, plongeon à 38°, chicane longue, LOOPING MODULAIRE (deux murs de chaque côté), très grand virage relevé, dérive et vent, route large
    // sous un portique, un TUBE qui tourne à droite puis à gauche, chicane longue et double looping.
    id: 'racines', name: 'Racines Boueuses', decor: 'jungle', difficulty: 3, profil: 'rollercoaster',
    appris: 'Départ : au plafond, dans les racines, trois boosters puis le mur gauche. Au programme : slalom plafond-murs, plongeon à 38°, looping modulaire, route large sous un portique, tube qui tourne, double looping.',
    goal: { id: 'norespawn' },
    opts: { l: 10 },
    script: 'start^ B3^ [tr31s] S< [tr10s] [tr02s] S> [tr23s] S^ [tr31s] S< [tr10s] S C*1 B [cdi2] DX [cdo2] S ZR3 S LPR2 S BLL S S.d S.w100 S WI W WO S C*3 B2 TI TM TRR TM TLL TO S ZL3 B3 OD S2 B finish*2',
    obst: [{ k: 'board_right', at: 0.288, side: -20, rot: Math.PI }, { k: 'board_warn', at: 0.335, side: 18, rot: Math.PI }, { k: 'gantry', at: 0.58, side: 0, s: 2 }, { k: 'pillar', at: 0.575, side: 36 }, { k: 'pillar', at: 0.575, side: -36 }, { k: 'board_left', at: 0.78, side: 20, rot: Math.PI }, { k: 'board_warn', at: 0.845, side: 18, rot: Math.PI }],
    medals: { cristal: 49.8, or: 52.4, argent: 60.2, bronze: 70.7 },
  },
  {
    // Chapitre 5 · 3/6 — TECHNIQUE (0.10.4 : refait AUTOUR des nouvelles pièces). Ouverture : descente à 38° vers le glacier. Lacets sur la glace, route ÉTROITE (12 m) entre des
    // stalagmites, wall-ride, bosse AIMANTÉE (la voiture reste collée) entre deux cales de glace, deux chicanes serrées, épingles, CROISEMENT traversé deux fois (boucle de virages
    // serrés). Panneaux danger avant la route étroite et le croisement.
    id: 'glacier', name: 'Glacier Magnétique', decor: 'polar', difficulty: 4, profil: 'technique',
    appris: 'Départ : descente à 38° vers le glacier. Au programme : lacets sur la glace, route étroite entre des stalagmites, wall-ride, bosse aimantée, chicanes serrées, croisement traversé deux fois.',
    goal: { id: 'norespawn' },
    opts: { l: 12 },
    script: 'start*1 [cdi2] DX [cdo2] S2 I S2 R B S2 L B S I S2 R S L C*3 B S NI N2 NO S [tr01s] S2< [tr10s] S2 R B S.m [crs1].m S [cds1].m L B ZR S ZL B S I S2 R S2 L B S2 JX R S R R S JX R S2 B finish*2',
    obst: [{ k: 'board_warn', at: 0.31, side: 16, rot: Math.PI }, { k: 'pillarThin', at: 0.332, side: 14 }, { k: 'pillarThin', at: 0.332, side: -14 }, { k: 'pillarThin', at: 0.345, side: 14 }, { k: 'pillarThin', at: 0.345, side: -14 }, { k: 'wedge', at: 0.53, side: 24 }, { k: 'wedge', at: 0.53, side: -24, rot: Math.PI }, { k: 'board_right', at: 0.6, side: -16, rot: Math.PI }, { k: 'board_left', at: 0.645, side: 16, rot: Math.PI }, { k: 'board_warn', at: 0.83, side: 16, rot: Math.PI }],
    medals: { cristal: 61.2, or: 64.5, argent: 74.1, bronze: 87 },
  },
  {
    // Chapitre 4 · 4/6 — TECHNIQUE (0.10.3 : refait AUTOUR des nouvelles pièces). Ouverture : booster puis une montée en lacets (deux courbes montantes serrées). Épingles sans
    // bordures, quai ÉTROIT (12 m) entre des colonnes, wall-ride, chicane de tunnels, deux chicanes serrées, CROISEMENT traversé deux fois (boucle de virages serrés), descente vers
    // l'arrivée.
    id: 'metro', name: 'Métro Aérien', decor: 'city', difficulty: 4, profil: 'technique',
    appris: 'Départ : booster puis montée en lacets. Au programme : épingles sans bordures, quai étroit entre des colonnes, wall-ride, chicane de tunnels, chicanes serrées, croisement traversé deux fois.',
    goal: { id: 'norespawn' },
    opts: { l: 2 },
    script: 'start*1 B CVR2 CVR2 S B R_ L_ R_ L_ S B C*3 B S2 R S R B S NI N2 NO S [tr01s] S2< [tr10s] S B L S R# L# R# L# S2# B ZR S ZL B JX R S R R S JX R S B [cdi1] [dn2] [cdo1] S B finish*3',
    obst: [{ k: 'board_warn', at: 0.3, side: 16, rot: Math.PI }, { k: 'pillarThin', at: 0.322, side: 14 }, { k: 'pillarThin', at: 0.322, side: -14 }, { k: 'pillarThin', at: 0.337, side: 14 }, { k: 'pillarThin', at: 0.337, side: -14 }, { k: 'board_right', at: 0.645, side: -16, rot: Math.PI }, { k: 'board_left', at: 0.7, side: 16, rot: Math.PI }, { k: 'board_warn', at: 0.75, side: 16, rot: Math.PI }],
    medals: { cristal: 55.5, or: 58.4, argent: 67.2, bronze: 78.9 },
  },
  {
    // Chapitre 6 · 3/6 — TECHNIQUE (0.10.5 : refait AUTOUR des nouvelles pièces). Ouverture : plaque de dérive (deux cases), booster. Épingles en dérive, route ÉTROITE (12 m) entre
    // des colonnes de basalte, wall-ride, deux murets, chicanes serrées, virage en dérive, CROISEMENT traversé deux fois (boucle de virages serrés), descente vers l'arrivée.
    id: 'basalte', name: 'Champs de Basalte', decor: 'volcano', difficulty: 4, profil: 'technique',
    appris: 'Départ : plaque de dérive, booster. Au programme : épingles en dérive, route étroite entre des colonnes de basalte, wall-ride, chicanes serrées, croisement traversé deux fois.',
    goal: { id: 'norespawn' },
    opts: { l: 6 },
    script: 'start*1 S2.d B S2 R S L S B R.d L.d S2 C*3 B NI N2 NO S [tr01s] S2< [tr10s] S2 R S2.d L B ZR S ZL B S2 R.d S L B S JX R S R R S JX R S [cdi1] [dn2] [cdo1] S B finish*3',
    obst: [{ k: 'board_warn', at: 0.25, side: 16, rot: Math.PI }, { k: 'pillar', at: 0.272, side: 16 }, { k: 'pillar', at: 0.272, side: -16 }, { k: 'pillar', at: 0.287, side: 16 }, { k: 'pillar', at: 0.287, side: -16 }, { k: 'wallSLow', at: 0.44, side: 24, rot: Math.PI / 2 }, { k: 'wallSLow', at: 0.44, side: -24, rot: Math.PI / 2 }, { k: 'board_right', at: 0.545, side: -16, rot: Math.PI }, { k: 'board_left', at: 0.6, side: 16, rot: Math.PI }, { k: 'board_warn', at: 0.76, side: 16, rot: Math.PI }],
    medals: { cristal: 52.5, or: 55.2, argent: 63.5, bronze: 74.6 },
  },
  {
    // Chapitre 2 · 6/6 — TECHNIQUE (0.10.1 : refait AUTOUR des nouvelles pièces). Ouverture : départ dans un tunnel du temple, deux virages serrés. Allée de colonnes, tube, épingle,
    // descente, lacets en spirale, deux blocs de pierre avant la chicane de tunnels, ROUTE ÉTROITE (12 m), chicanes serrées, ARCHE PLEINE entre deux murs, épingle et un CROISEMENT
    // traversé deux fois (boucle de virages serrés). Panneaux : danger avant la route étroite et le croisement, demi-tour avant l'épingle.
    id: 'temple', name: 'Temple', decor: 'jungle', difficulty: 4, profil: 'technique',
    appris: 'Départ : dans un tunnel du temple, deux virages serrés. Au programme : allée de colonnes, tube, lacets en spirale, chicane de tunnels, route étroite, chicanes serrées, arche entre deux murs, croisement traversé deux fois.',
    goal: { id: 'norespawn' },
    opts: { l: 8 },
    script: 'start*3 S# R# R# B# S2# B S3 TI TM2 TO S R R B S2 [cdi1] [dn2] [cdo1] S C*2 S [cvd05] [cvd05] [cvd05] [cvd05] S2 B S R# L# R# L# S2# B NI N2 NO S ZR S R R S ZL B S2 C*1 L L B S5 JX R S R R S JX R S B finish*3',
    obst: [{ k: 'pillarBase', at: 0.1, side: 20 }, { k: 'pillarBase', at: 0.1, side: -20 }, { k: 'pillarBase', at: 0.12, side: 20 }, { k: 'pillarBase', at: 0.12, side: -20 }, { k: 'sign_uturn', at: 0.42, side: 18, rot: Math.PI }, { k: 'board_warn', at: 0.538, side: 16, rot: Math.PI }, { k: 'board_right', at: 0.598, side: -20, rot: Math.PI }, { k: 'archS', at: 0.727, side: 0 }, { k: 'wallS', at: 0.722, side: 26, rot: Math.PI / 2 }, { k: 'wallS', at: 0.722, side: -26, rot: Math.PI / 2 }, { k: 'block', at: 0.44, side: 24 }, { k: 'block', at: 0.44, side: -24 }, { k: 'board_warn', at: 0.852, side: 18, rot: Math.PI }],
    medals: { cristal: 66.2, or: 69.7, argent: 80.2, bronze: 94.1 },
  },
  {
    // Chapitre 4 · 5/6 — ACROBATIQUE (0.10.3 : refait AUTOUR des nouvelles pièces). Ouverture : trois boosters → looping. Trois sauts de toit en toit : chacun se reçoit sur une
    // descente, les deux premiers suivis d'un toit en PLAQUE ; chicanes longues, wall-ride entre deux tours, avenue large sous un portique pour finir. Panneaux de montée avant
    // chaque rampe.
    id: 'tours', name: 'Tours Jumelles', decor: 'city', difficulty: 4, profil: 'acrobatique',
    appris: 'Départ : trois boosters → looping. Au programme : trois sauts de toit en toit, toits en plaques, chicanes longues, wall-ride entre deux tours, avenue large sous un portique.',
    goal: { id: 'under', t: 47.5 },
    opts: { l: 16 }, pilot: { vCap: 60 },
    script: 'start*2 B3 O S2 B2 [crv2] UX G2 DX DX [cdo2] [plate3]*10 S2 C*3 ZR3 B2 [crv1] UU G2 DD [cdo1] [plate2]*10 S [tr01s] S2< [tr10s] S C*3 B2 [crv2] UX G2 DX DX [cdo2] WI W WO S ZL3 S3 finish*2',
    obst: [{ k: 'board_up', at: 0.215, side: 18, rot: Math.PI }, { k: 'board_right', at: 0.37, side: -20, rot: Math.PI }, { k: 'board_up', at: 0.455, side: -18, rot: Math.PI }, { k: 'board_up', at: 0.73, side: 18, rot: Math.PI }, { k: 'gantry', at: 0.833, side: 0, s: 2 }, { k: 'pillarBase', at: 0.827, side: 36 }, { k: 'pillarBase', at: 0.827, side: -36 }, { k: 'board_left', at: 0.87, side: 20, rot: Math.PI }],
    medals: { cristal: 43.7, or: 46, argent: 52.9, bronze: 62.1 },
  },
  {
    // Chapitre 7 · 3/6 — ROLLERCOASTER (ceinture d'astéroïdes). Ouverture : un TIRE-BOUCHON à gauche pris à l'élan (une case, aucun booster) puis trois boosters et directement un grand DOUBLE looping
    // (3×3, version large). Ensuite le checkpoint, un slalom de wall-rides gauche / droite, un tube de deux sections à pleine vitesse et un plongeon de 8 niveaux : 15 niveaux de dénivelé.
    id: 'ceinture', name: 'Ceinture d’Astéroïdes', decor: 'orbit', difficulty: 4, profil: 'rollercoaster',
    appris: 'Départ : tire-bouchon à l’élan → trois boosters → grand double looping. Au programme : slalom de wall-rides, tube, plongeon.',
    goal: { id: 'norespawn' },
    opts: { l: 10 }, pilot: { vCap: 66 },
    script: 'start S CKL S B3 OBDL S2 C B2 [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B TI TM2 TO S B [cdi2] DX [cdo2] S B2 finish',
    medals: { cristal: 27.2, or: 28.7, argent: 33, bronze: 38.7 },
  },
  {
    // Chapitre 5 · 4/6 — ROLLERCOASTER (0.10.4 : refait AUTOUR des nouvelles pièces). Ouverture : tire-bouchon dès la troisième case. Hélice montante de quatre grandes courbes
    // (16 niveaux), checkpoint au sommet, hélice descendante à gauche, double looping, route large sous un portique, wall-ride à gauche, chicane longue, wall-ride à droite, LOOPING
    // MODULAIRE (un mur de chaque côté), chicane longue.
    id: 'helice', name: 'Double Hélice', decor: 'polar', difficulty: 4, profil: 'rollercoaster',
    appris: 'Départ : tire-bouchon dès la troisième case. Au programme : double hélice (montée, descente), double looping, route large sous un portique, wall-rides des deux côtés, chicanes longues, looping modulaire.',
    goal: { id: 'norespawn' },
    opts: { l: 2 }, pilot: { vCap: 40 },
    script: 'start*2 S2 CK S B2 CBR4 CBR4 CBR4 CBR4 S S C*1 [cvdBigL2] [cvdBigL2] [cvdBigL2] [cvdBigL2] S B OD S WI W WO S [tr01s] S3< [tr10s] S ZR3 S [tr02s] S3> [tr20s] S B2 LPR1 S B2 ZL3 S finish*2',
    obst: [{ k: 'board_warn', at: 0.025, side: 18, rot: Math.PI }, { k: 'board_warn', at: 0.33, side: 18, rot: Math.PI }, { k: 'gantry', at: 0.484, side: 0, s: 2 }, { k: 'pillarBase', at: 0.478, side: 36 }, { k: 'pillarBase', at: 0.478, side: -36 }, { k: 'board_right', at: 0.61, side: -20, rot: Math.PI }, { k: 'board_warn', at: 0.785, side: 18, rot: Math.PI }, { k: 'board_left', at: 0.93, side: 20, rot: Math.PI }],
    medals: { cristal: 66.7, or: 70.2, argent: 80.8, bronze: 94.8 },
  },
  {
    // Chapitre 6 · 4/6 — ROLLERCOASTER (0.10.5 : refait AUTOUR des nouvelles pièces). Ouverture : trois boosters → tube, puis la CHEMINÉE (montée en L, mur de quatre niveaux, sommet).
    // Plongeon à 38°, grand looping, wall-rides gauche et droite, chicane longue, LOOPING MODULAIRE à gauche, route large sous un portique, TUBE qui tourne à droite puis à gauche,
    // route ÉTROITE et chicane longue pour finir.
    id: 'cheminee', name: 'Cheminée du Volcan', decor: 'volcano', difficulty: 4, profil: 'rollercoaster',
    appris: 'Départ : trois boosters → tube, puis la cheminée (mur de quatre niveaux). Au programme : plongeon, grand looping, wall-rides, looping modulaire, route large, tube qui tourne, route étroite.',
    goal: { id: 'norespawn' },
    opts: { l: 2 }, pilot: { vCap: 66 },
    script: 'start*2 B3 TI TM2 TO QU WA4 CR S C*1 [cdi2] DX [cdo2] B OB S2 B [tr01s] S3< [tr10s] S ZR3 S [tr02s] S3> [tr20s] S B2 LPL2 S WI W WO S TI TM TRR TM TLL TM TO S NI N2 NO S ZL3 S B2 finish*2',
    obst: [{ k: 'board_warn', at: 0.095, side: 18, rot: Math.PI }, { k: 'sign_down', at: 0.2, side: 18, rot: Math.PI }, { k: 'board_warn', at: 0.235, side: -18, rot: Math.PI }, { k: 'board_right', at: 0.405, side: -20, rot: Math.PI }, { k: 'board_warn', at: 0.555, side: 18, rot: Math.PI }, { k: 'gantry', at: 0.694, side: 0, s: 2 }, { k: 'pillar', at: 0.689, side: 36 }, { k: 'pillar', at: 0.689, side: -36 }, { k: 'board_warn', at: 0.878, side: 16, rot: Math.PI }],
    medals: { cristal: 44.2, or: 46.6, argent: 53.5, bronze: 62.9 },
  },
  {
    // Chapitre 3 · 4/6 — ROLLERCOASTER (0.10.2 : refait AUTOUR des nouvelles pièces). Ouverture : quatre boosters → TRIPLE looping. Wall-ride à gauche, chicane longue, wall-ride à
    // droite, grand double looping, LOOPING MODULAIRE à gauche (trois murs de chaque côté), TUBE qui tourne à droite puis à gauche, plongeon à 38°, route large sous un portique,
    // chicane longue. Panneaux danger avant chaque looping et avant le tube.
    id: 'vrille', name: 'Tourbillon Tropical', decor: 'isles', difficulty: 4, profil: 'rollercoaster',
    appris: 'Départ : quatre boosters → triple looping. Au programme : wall-rides des deux côtés, chicane longue, double looping, looping modulaire, tube qui tourne, plongeon à 38°, route large sous un portique.',
    goal: { id: 'norespawn' },
    opts: { l: 8 }, pilot: { vCap: 66 },
    script: 'start*2 B4 OBT S2 C*1 B2 [tr01s] S3< [tr10s] S ZR3 S [tr02s] S3> [tr20s] S B OBDL S C*3 B2 LPL3 S TI TM TRR TM TLL TM TO S B2 [cdi2] DX [cdo2] S WI W WO S ZL3 S B2 finish*2',
    obst: [{ k: 'board_warn', at: 0.03, side: 18, rot: Math.PI }, { k: 'board_right', at: 0.295, side: -20, rot: Math.PI }, { k: 'board_warn', at: 0.42, side: 18, rot: Math.PI }, { k: 'board_warn', at: 0.555, side: -18, rot: Math.PI }, { k: 'board_warn', at: 0.692, side: 18, rot: Math.PI }, { k: 'gantry', at: 0.91, side: 0, s: 2 }, { k: 'pillar', at: 0.905, side: 36 }, { k: 'pillar', at: 0.905, side: -36 }, { k: 'board_left', at: 0.926, side: 20, rot: Math.PI }],
    medals: { cristal: 52, or: 54.7, argent: 63, bronze: 73.9 },
  },
  {
    // Chapitre 1 · 5/6 — ROLLERCOASTER (la finale du chapitre ; 0.9.74 : refait AUTOUR des nouvelles pièces). Ouverture : trois boosters puis une montée verticale (montée en L,
    // mur de 3, sommet). Chute, virage relevé, slalom de wall-rides gauche / droite, LOOPING MODULAIRE à droite, chicane longue, arche mur → plafond → mur, virage géant, ROUTE LARGE
    // sous un portique, bifurcation (petit saut tout droit, ou par le mur de droite), un TUBE qui tourne, hélice montante à gauche, descente, second virage géant, ARCHE PLEINE entre
    // deux murs pleins, chicane longue et LOOPING MODULAIRE à gauche ; arrivée sous une arche. Plus de 20 cases sur un mur.
    id: 'grandtour', name: 'Le Grand Tour', decor: 'desert', difficulty: 4, profil: 'rollercoaster',
    appris: 'Départ : trois boosters → montée verticale (montée en L, mur, sommet). Au programme : wall-rides, deux loopings modulaires, arche mur → plafond → mur, route large, bifurcation saut ou mur, tube qui tourne, virages géants, arche pleine entre deux murs.',
    goal: { id: 'norespawn' },
    opts: { l: 3 },
    script: 'start B3 QU WA3 CR S [cdi2] DX [cdo2] B BRR S [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B2 LPR1 S C S ZR3 [tr01s] S2< [tr13s] S2^ [tr31s] S2< [tr10s] S2 XR S2 C WI W WO SPL U G1 D S ALT [tr02s] S2> [tr20s] MRG S B2 TI TLL TRR TO CBL2 CBL2 S [cdi1] [dn2] [cdo1] XR S2 C B3 ZL3 LPL1 S2 finish*2',
    obst: [{ k: 'board_warn', at: 0.3, side: 18, rot: Math.PI }, { k: 'board_warn', at: 0.905, side: -18, rot: Math.PI }, { k: 'gantry', at: 0.605, side: 0, s: 2 }, { k: 'pillar', at: 0.6, side: 36 }, { k: 'pillar', at: 0.6, side: -36 }, { k: 'archS', at: 0.847, side: 0 }, { k: 'wallS', at: 0.84, side: 26, rot: Math.PI / 2 }, { k: 'wallS', at: 0.84, side: -26, rot: Math.PI / 2 }, { k: 'board_right', at: 0.555, side: -24, rot: Math.PI }],
    medals: { cristal: 78.2, or: 82.4, argent: 94.7, bronze: 111.2 },
  },
  {
    // Chapitre 7 · 4/6 — SPEEDWAY (circuit fermé, 3 tours). Ouverture : deux boosters puis UN TUBE COURT (2×2) pris à pleine vitesse, directement suivi du premier virage relevé. Quatre virages
    // relevés 3×3 forment l'anneau, avec un wall-ride de deux cases sur le mur gauche (côté intérieur de l'anneau). Sur trois tours, 95 % du temps au-dessus de 220 km/h.
    id: 'grandanneau', name: 'Grand Anneau', decor: 'orbit', difficulty: 4, profil: 'speedway',
    appris: 'Départ : deux boosters → tube court ; circuit fermé, 3 tours. Au programme : quatre virages relevés, wall-ride, 95 % au-dessus de 220 km/h.',
    goal: { id: 'nowall' },
    opts: { l: 6 }, pilot: { vCap: 70 }, laps: 3,
    script: 'start B2 TB S2 BRR B S2 C S2 B BRR S [tr01l] S2< [tr10l] S BRR S B S2 B S2 BRR finish',
    medals: { cristal: 72.6, or: 76.4, argent: 87.9, bronze: 103.2 },
  },
  {
    // Chapitre 3 · 5/6 — ACROBATIQUE en BASSE GRAVITÉ (50 % ; 0.10.2 : refait AUTOUR des nouvelles pièces). Ouverture : plaque de gravité, vide et chute de six niveaux. Trois grands
    // sauts lunaires reçus sur des descentes, les deux premiers suivis d'une PLAQUE bordée (des cratères en pyramide à côté), chicanes longues et dos d'âne entre les sauts, route
    // large sous un portique à l'arrivée. Panneaux de montée avant chaque rampe.
    id: 'lunaire', name: 'Sauts Lunaires', decor: 'isles', difficulty: 4, profil: 'acrobatique',
    appris: 'Départ : plaque de basse gravité, vide et chute de six niveaux. Au programme : trois grands sauts lunaires, plaques entre des cratères, chicanes longues, dos d’âne, route large sous un portique.',
    goal: { id: 'perfect', n: 2 },
    opts: { l: 28 },
    script: 'start*2 S.g50 G2 V-6 [dn4] [cdo2] S C*3 B2 S [crv1] UU G3 DD [cdo1] [plate3]*10 ZR3 S [crs1] S2 [cds1] C*3 B2 S [crv1] UU G3 DD [cdo1] [plate3]*10 ZL3 S [crs1] S2 [cds1] C*3 B2 S [crv1] UU G3 DD [cdo1] S2 WI W WO S3 finish*2',
    obst: [{ k: 'board_up', at: 0.14, side: 18, rot: Math.PI }, { k: 'board_right', at: 0.243, side: -20, rot: Math.PI }, { k: 'pyramidS', at: 0.228, side: 60 }, { k: 'pyramidS', at: 0.228, side: -60 }, { k: 'board_up', at: 0.455, side: -18, rot: Math.PI }, { k: 'board_left', at: 0.56, side: 20, rot: Math.PI }, { k: 'wedge', at: 0.545, side: 60 }, { k: 'board_up', at: 0.77, side: 18, rot: Math.PI }, { k: 'gantry', at: 0.9, side: 0, s: 2 }, { k: 'pillarThin', at: 0.895, side: 36 }, { k: 'pillarThin', at: 0.895, side: -36 }],
    medals: { cristal: 51, or: 53.7, argent: 61.8, bronze: 72.5 },
  },
  {
    // Chapitre 5 · 5/6 — SPEEDWAY (0.10.4 : refait AUTOUR des nouvelles pièces). Ouverture : très grand virage relevé pris sans booster, puis trois boosters. Virages relevés en
    // couronne, deux routes larges sous des portiques, chicane rapide, wall-ride à droite, grand S, TUBE qui tourne à droite puis à gauche. Aucun virage serré ; objectif : ne toucher
    // aucune bordure.
    id: 'couronne', name: 'Couronne Boréale', decor: 'polar', difficulty: 5, profil: 'speedway',
    appris: 'Départ : très grand virage relevé sans booster, puis trois boosters. Au programme : virages relevés en couronne, deux routes larges sous des portiques, chicane rapide, wall-ride, grand S, tube qui tourne.',
    goal: { id: 'nowall' },
    opts: { l: 6 }, pilot: { vCap: 70 },
    script: 'start*3 BRR B3 S BLL S2 WI W2 WO S B BRR C*2 S ZR4 S [tr02l] S4> [tr20l] BLL B S2 ZZR S BRR B S2 TI TM TRR TM TLL TM TO S BLL B2 WI W WO S B2 finish*2',
    obst: [{ k: 'gantry', at: 0.2, side: 0, s: 2 }, { k: 'pillar', at: 0.194, side: 36 }, { k: 'pillar', at: 0.194, side: -36 }, { k: 'board_right', at: 0.31, side: -20, rot: Math.PI }, { k: 'board_right', at: 0.555, side: -20, rot: Math.PI }, { k: 'board_warn', at: 0.685, side: 18, rot: Math.PI }, { k: 'gantry', at: 0.947, side: 0, s: 2 }, { k: 'pillar', at: 0.941, side: 36 }, { k: 'pillar', at: 0.941, side: -36 }],
    medals: { cristal: 51.2, or: 53.9, argent: 62, bronze: 72.8 },
  },
  {
    // Chapitre 6 · 5/6 — SPEEDWAY EN DEUX TOURS (0.10.5 : refait AUTOUR des nouvelles pièces). Ouverture : deux boosters puis une montée douce de deux niveaux. Le tour du cratère :
    // quatre très grands virages relevés, wall-ride, route large sous un portique, descente douce, chicanes rapides puis longues (deux pyramides de lave dans le cratère). Le circuit se
    // referme : l'arrivée jouxte le départ. Aucun virage serré ; objectif : ne toucher aucune bordure.
    id: 'caldeira', name: 'Caldeira', decor: 'volcano', difficulty: 5, profil: 'speedway',
    appris: 'Départ : deux boosters, montée douce. Au programme : deux tours du cratère, quatre très grands virages relevés, wall-ride, route large sous un portique, chicanes rapides et longues.',
    goal: { id: 'nowall' },
    opts: { l: 6 }, pilot: { vCap: 70 }, laps: 2,
    script: 'start*2 B2 GU4 S BRR B S [tr02l] S4> [tr20l] WI W WO BRR B S2 C*3 GD4 S BRR B ZR4 S ZL4 B ZR3 ZL3 S2 BRR finish*2',
    obst: [{ k: 'gantry', at: 0.169, side: 0, s: 2 }, { k: 'pillar', at: 0.165, side: 36 }, { k: 'pillar', at: 0.165, side: -36 }, { k: 'pyramidS', at: 0.3, side: 60 }, { k: 'pyramidS', at: 0.3, side: -60 }, { k: 'board_right', at: 0.315, side: -20, rot: Math.PI }, { k: 'board_right', at: 0.39, side: -20, rot: Math.PI }],
    medals: { cristal: 74, or: 77.9, argent: 89.6, bronze: 105.2 },
  },
  {
    // Chapitre 5 · 6/6 — TECHNIQUE (0.10.4 : refait AUTOUR des nouvelles pièces). Ouverture : poudreuse (deux cases), booster. Rafales de vent latéral, épingles, route ÉTROITE
    // (12 m) entre des piliers, vent fort, deux chicanes serrées, wall-ride, deux dalles de neige, poudreuse, CROISEMENT traversé deux fois (boucle de virages serrés), descente.
    id: 'blizzard', name: 'Blizzard', decor: 'polar', difficulty: 5, profil: 'technique',
    appris: 'Départ : poudreuse, booster. Au programme : vent latéral, épingles, route étroite entre des piliers, chicanes serrées, wall-ride, poudreuse, croisement traversé deux fois.',
    goal: { id: 'norespawn' },
    opts: { l: 8 },
    script: 'start*2 S2.p B S2 R S.w150 L S B S2.p R S L B C*3 B NI N2 NO S3.w120 R S R S B ZR S ZL B S2 [tr01s] S2< [tr10s] S L B S.p R S L B S JX R S R R S JX R S [cdi1] [dn2] [cdo1] S B finish*1',
    obst: [{ k: 'board_warn', at: 0.255, side: 16, rot: Math.PI }, { k: 'pillarThin', at: 0.277, side: 14 }, { k: 'pillarThin', at: 0.277, side: -14 }, { k: 'pillarThin', at: 0.291, side: 14 }, { k: 'pillarThin', at: 0.291, side: -14 }, { k: 'board_right', at: 0.42, side: -16, rot: Math.PI }, { k: 'board_left', at: 0.47, side: 16, rot: Math.PI }, { k: 'slab', at: 0.645, side: 24 }, { k: 'slab', at: 0.645, side: -24 }, { k: 'board_warn', at: 0.775, side: 16, rot: Math.PI }],
    medals: { cristal: 58.1, or: 61.1, argent: 70.3, bronze: 82.5 },
  },
  {
    // Chapitre 4 · 6/6 — ROLLERCOASTER (0.10.3 : refait AUTOUR des nouvelles pièces). Ouverture : trois boosters → LIFT HILL (deux montées droites de quatre niveaux, accélérées).
    // Viaduc au sommet, plongeon, grand looping, wall-ride à gauche, chicane longue, wall-ride à droite, LOOPING MODULAIRE à gauche, avenue large sous un portique, TUBE qui tourne
    // à droite puis à gauche, chicane longue.
    id: 'viaduc', name: 'Viaduc Vertical', decor: 'city', difficulty: 5, profil: 'rollercoaster',
    appris: 'Départ : trois boosters → lift hill accéléré. Au programme : viaduc au sommet, plongeon, grand looping, wall-rides des deux côtés, looping modulaire, avenue large sous un portique, tube qui tourne.',
    goal: { id: 'norespawn' },
    opts: { l: 2 }, pilot: { vCap: 66 },
    script: 'start*2 B3 [crv4] UX.b UX.b [cro4] S5 C*1 S2 [cdi2] DX DX [cdo2] B OB S2 B [tr01s] S3< [tr10s] S ZR3 S [tr02s] S3> [tr20s] S B2 LPL2 S WI W WO S TI TM TRR TM TLL TM TO S ZL3 S B2 finish*2',
    obst: [{ k: 'sign_down', at: 0.15, side: 18, rot: Math.PI }, { k: 'board_warn', at: 0.198, side: 18, rot: Math.PI }, { k: 'board_right', at: 0.39, side: -20, rot: Math.PI }, { k: 'board_warn', at: 0.553, side: 18, rot: Math.PI }, { k: 'gantry', at: 0.71, side: 0, s: 2 }, { k: 'pillar', at: 0.705, side: 36 }, { k: 'pillar', at: 0.705, side: -36 }, { k: 'board_warn', at: 0.73, side: -18, rot: Math.PI }, { k: 'board_left', at: 0.915, side: 20, rot: Math.PI }],
    medals: { cristal: 47.5, or: 50, argent: 57.5, bronze: 67.5 },
  },
  {
    // Chapitre 3 · 6/6 — SPEEDWAY (0.10.2 : refait AUTOUR des nouvelles pièces). Ouverture : longue pente douce vers la mer (six demi-niveaux). Très grands virages relevés, route
    // large sous un portique, chicane rapide, wall-ride à droite, descente, CROISEMENT traversé deux fois (boucle de trois virages géants), grand S ; deux pyramides de roche à
    // l'arrivée. Aucun virage serré.
    id: 'archipel', name: 'Grand Archipel', decor: 'isles', difficulty: 5, profil: 'speedway',
    appris: 'Départ : longue pente douce vers la mer. Au programme : très grands virages relevés, route large sous un portique, chicane rapide, wall-ride, croisement traversé deux fois, grand S.',
    goal: { id: 'under', t: 61.5 },
    opts: { l: 8 }, pilot: { vCap: 70 },
    script: 'start*3 GD6 BRR S B BLL S2 C*2 WI W2 WO S ZR4 S B [tr02l] S4> [tr20l] BRR S2 [cdi1] [dn2] [cdo1] B BLL S2 JX S4 XR XR XR S4 JX S B BRR S2 ZZL S B2 finish*2',
    obst: [{ k: 'gantry', at: 0.249, side: 0, s: 2 }, { k: 'pillarBase', at: 0.244, side: 36 }, { k: 'pillarBase', at: 0.244, side: -36 }, { k: 'board_right', at: 0.27, side: -20, rot: Math.PI }, { k: 'board_warn', at: 0.635, side: 18, rot: Math.PI }, { k: 'board_right', at: 0.685, side: -24, rot: Math.PI }, { k: 'board_left', at: 0.92, side: 24, rot: Math.PI }, { k: 'pyramidS', at: 0.965, side: 28 }, { k: 'pyramidS', at: 0.965, side: -28 }],
    medals: { cristal: 56.9, or: 59.9, argent: 68.9, bronze: 80.9 },
  },
  {
    // Chapitre 7 · 5/6 — ACROBATIQUE (apesanteur). Ouverture : deux boosters puis une plaque de gravité à 20 % : la voiture quitte la rampe et flotte sur plus de vingt cases. Trois sauts de
    // 8 à 10 secondes en l'air chacun, 28 niveaux de dénivelé en tout. Entre les sauts : checkpoint et boosters, un wall-ride gauche puis un wall-ride droit. Chaque saut se réceptionne sur une
    // longue descente, très tolérante à la vitesse.
    id: 'apesanteur', name: 'Apesanteur', decor: 'orbit', difficulty: 5, profil: 'acrobatique',
    appris: 'Départ : deux boosters → plaque de gravité 20 %. Au programme : trois vols de 8 à 10 s en l’air (28 niveaux de dénivelé), wall-rides.',
    goal: { id: 'under', t: 67.5 },
    opts: { l: 44 }, pilot: { vCap: 48 },
    script: 'start B2 S.g20 [crv1] UU G8 D D D D D D D D S3 C B2 [crv1] UU G8 D D D D D D D D S [tr01s] S2< [tr10s] S [tr02s] S2> [tr20s] S C B2 [crv1] UU G8 D D D D D D D D S5 finish',
    medals: { cristal: 59.8, or: 62.9, argent: 72.4, bronze: 84.9 },
  },
  {
    // Chapitre 6 · 6/6 — ACROBATIQUE (0.10.5 : refait AUTOUR des nouvelles pièces). Ouverture : trois boosters → rampe droite de quatre niveaux et un vide de deux cases. Quatre
    // sauts : les deux grands se reçoivent sur une descente suivie d'une PLAQUE de lave refroidie (entre des cônes), un saut à anneau turbo ; chicanes longues, wall-ride, route large
    // sous un portique pour finir. Panneaux de montée avant chaque rampe.
    id: 'eruption', name: 'Éruption', decor: 'volcano', difficulty: 5, profil: 'acrobatique',
    appris: 'Départ : trois boosters → rampe de quatre niveaux et vide de deux cases. Au programme : quatre sauts, plaques de lave refroidie, saut à anneau turbo, chicanes longues, wall-ride, route large.',
    goal: { id: 'under', t: 47.5 },
    opts: { l: 16 }, pilot: { vCap: 60 },
    script: 'start*2 B3 UX G2 DX DX [cdo2] [plate3]*10 S2 C*3 ZR3 B2 [crv1] UU GR2 DD [cdo1] S [tr01s] S2< [tr10s] S C*3 B2 [crv2] UX G2 DX DX [cdo2] [plate2]*10 S2 C*3 ZL3 B2 [crv1] UU G2 DD [cdo1] WI W WO S3 finish*2',
    obst: [{ k: 'board_up', at: 0.05, side: 18, rot: Math.PI }, { k: 'pyramidS', at: 0.15, side: 60 }, { k: 'pyramidS', at: 0.15, side: -60 }, { k: 'board_right', at: 0.205, side: -20, rot: Math.PI }, { k: 'board_up', at: 0.3, side: -18, rot: Math.PI }, { k: 'board_up', at: 0.57, side: 18, rot: Math.PI }, { k: 'wedge', at: 0.665, side: 60 }, { k: 'board_left', at: 0.72, side: 20, rot: Math.PI }, { k: 'board_up', at: 0.815, side: -18, rot: Math.PI }, { k: 'gantry', at: 0.903, side: 0, s: 2 }, { k: 'pillarBase', at: 0.897, side: 36 }, { k: 'pillarBase', at: 0.897, side: -36 }],
    medals: { cristal: 43.9, or: 46.2, argent: 53.1, bronze: 62.4 },
  },
  {
    // Chapitre 7 · 6/6 — TECHNIQUE (station). Ouverture : DÉPART SUR UNE PLATEFORME d'amarrage (deux cases de plateforme, large et plate), un booster puis une première épingle.
    // Neuf virages serrés (épingles et un slalom R L R L), une chicane sur un mur, une descente finale de 4 niveaux ; près de 30 % du temps au freinage et un booster à chaque relance.
    id: 'zenith', name: 'Station Zénith', decor: 'orbit', difficulty: 5, profil: 'technique',
    appris: 'Départ : sur une plateforme d’amarrage. Au programme : neuf virages serrés, chicane sur un mur.',
    goal: { id: 'norespawn' },
    opts: { l: 6 },
    script: 'start P2 B S R B S L S R B S2 C B S L R L R B S2 [tr01s] S2< [tr10s] S3 L B S R B [cdi1] [dn2] [cdo1] S B finish',
    medals: { cristal: 34.4, or: 36.2, argent: 41.6, bronze: 48.8 },
  },
  // ==== 0.9 : quatre nouveaux thèmes (6 circuits chacun) ============================
  // ---- Fonds marins : courants (tapis roulants), eau et bateau, bulles de verre ----
  {
    // Chapitre 8 · 1/6 — SPRINT (courants). Ouverture : deux boosters, puis un CONTRE-COURANT (deux cases de tapis roulant à contresens, −122 km/h) qui freine la voiture, aussitôt suivi d'un courant
    // favorable (+138 km/h, deux cases) qui la relance. Puis une vague douce, un très grand virage plat, un tapis de trois cases, un dernier virage et une descente de 4 niveaux. Les tapis sont loin des virages.
    id: 'courant', name: 'Courant Chaud', decor: 'reef', difficulty: 2, profil: 'sprint',
    appris: 'Départ : deux boosters → contre-courant (−122 km/h) puis courant favorable (+138 km/h). Au programme : vague, très grand virage plat, tapis de trois cases.',
    goal: { id: 'under', t: 23 },
    opts: { l: 6 }, pilot: { vCap: 66 },
    script: 'start B2 S2.t40 S2.t170 S [crs1] S2 [cds1] B HR S3.t137 B C S2 HL S2 B [cdi1] [dn2] [cdo1] S B2 finish',
    medals: { cristal: 20.5, or: 21.6, argent: 24.9, bronze: 29.2 },
  },
  {
    // Chapitre 8 · 2/6 — TECHNIQUE (corail). Ouverture : un booster, puis un COURANT FAVORABLE (+72 km/h sur deux cases) qui lance la voiture vers un premier virage serré. Huit virages serrés,
    // une dalle de verre fragile en sortie de virage, une chicane sur un mur et une descente de 4 niveaux ; un booster à chaque relance.
    id: 'corail', name: 'Jardin de Corail', decor: 'reef', difficulty: 3, profil: 'technique',
    appris: 'Départ : un booster → courant favorable vers une première épingle. Au programme : huit virages serrés, dalle de verre fragile, chicane.',
    goal: { id: 'norespawn' },
    opts: { l: 6 },
    script: 'start B S2.t137 S2 R S L S R S L B C B S R S2.v S L B S2 [tr01s] S2< [tr10s] S R B S L B S [cdi1] [dn2] [cdo1] S B finish',
    medals: { cristal: 34.7, or: 36.5, argent: 41.9, bronze: 49.2 },
  },
  {
    // Chapitre 8 · 3/6 — ROLLERCOASTER (épave). Ouverture : trois boosters puis directement un WALL-RIDE sur le mur droit (le flanc de la coque, trois cases à plus de 200 km/h). Puis le
    // checkpoint, un double looping, un second wall-ride sur le mur gauche et un plongeon de 8 niveaux.
    id: 'epave', name: 'Épave Engloutie', decor: 'reef', difficulty: 3, profil: 'rollercoaster',
    appris: 'Départ : trois boosters → wall-ride sur le flanc de la coque. Au programme : double looping, second wall-ride, plongeon de 8 niveaux.',
    goal: { id: 'norespawn' },
    opts: { l: 12 }, pilot: { vCap: 66 },
    script: 'start B3 [tr02s] S3> [tr20s] S C B2 OD S2 B [tr01s] S3< [tr10s] S B [cdi2] DX [cdo2] S B2 finish',
    medals: { cristal: 19.9, or: 21, argent: 24.1, bronze: 28.3 },
  },
  {
    // Chapitre 8 · 4/6 — ACROBATIQUE (gravité lourde). Ouverture : cinq boosters puis une plaque de GRAVITÉ À 130 % (la pression des profondeurs) : la voiture flotte moins, elle tombe plus vite (à 200 %, plus aucune rampe ne se franchissait : les pentes freinent trop).
    // Rampes raides mais vides très courts (1 ou 2 cases) : quatre sauts brefs de moins de deux secondes, réceptions violentes sur des pentes à forte inclinaison, un wall-ride avant le dernier saut.
    // Chaque checkpoint est suivi de deux boosters ; la gravité lourde reste active jusqu'à l'arrivée.
    id: 'meduses', name: 'Méduses Électriques', decor: 'reef', difficulty: 4, profil: 'acrobatique',
    appris: 'Départ : cinq boosters → plaque de gravité 130 % (la pression des profondeurs). Au programme : quatre sauts brefs, réceptions violentes, wall-ride.',
    goal: { id: 'under', t: 41.5 },
    opts: { l: 24 }, pilot: { vCap: 62 },
    script: 'start B5 S.g130 S2 [crv2] UX G1 DX DX [cdo2] S3 C B3 [crv2] UX G1 DX DX [cdo2] S3 C B3 [crv1] UU G1 DD [cdo1] S [tr01s] S2< [tr10s] S3 C B3 [crv2] UX G1 DX DX [cdo2] S5 finish',
    medals: { cristal: 39.3, or: 41.3, argent: 47.5, bronze: 55.8 },
  },
  {
    // Chapitre 8 · 5/6 — ROLLERCOASTER (abysses). Ouverture : un booster puis un PLONGEON de 12 niveaux (deux rampes à forte pente) qui débouche directement sur un grand looping au fond.
    // Puis un slalom de wall-rides gauche / droite et la remontée en hélice (deux grandes courbes inclinées, 8 niveaux).
    id: 'abysses', name: 'Abysses', decor: 'reef', difficulty: 4, profil: 'rollercoaster',
    appris: 'Départ : un booster → plongeon de 12 niveaux → grand looping au fond. Au programme : slalom de wall-rides, remontée en hélice.',
    goal: { id: 'norespawn' },
    opts: { l: 22 }, pilot: { vCap: 66 },
    script: 'start B [cdi2] DX DX [cdo2] OB S2 C B2 [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B2 CBR4 CBR4 S B finish',
    medals: { cristal: 23.6, or: 24.8, argent: 28.6, bronze: 33.5 },
  },
  {
    // Chapitre 8 · 6/6 — SPEEDWAY (barrière). Ouverture : deux boosters puis un PONT DE VERRE (trois dalles fragiles, sans danger à grande vitesse) qui débouche sur un virage relevé 3×3.
    // Cinq virages relevés, un wall-ride de quatre cases (mur droit) et un courant favorable de deux cases entre deux virages : 87 % du tour au-dessus de 220 km/h.
    id: 'barriere', name: 'Grande Barrière', decor: 'reef', difficulty: 5, profil: 'speedway',
    appris: 'Départ : deux boosters → pont de verre → virage relevé. Au programme : cinq virages relevés, wall-ride, courant favorable, 87 % au-dessus de 220 km/h.',
    goal: { id: 'nowall' },
    opts: { l: 6 }, pilot: { vCap: 70 },
    script: 'start B2 S3.v BRR S B BLL S2 C B [tr02l] S4> [tr20l] BRR S2.t137 BLL B S BRR S B2 finish',
    medals: { cristal: 26, or: 27.3, argent: 31.4, bronze: 36.9 },
  },
  // ---- Usine mécanique : obstacles, tapis, moteur coupé, ascenseurs ----
  {
    // Chapitre 9 · 1/6 — SPRINT (chaîne). Ouverture : trois boosters puis TROIS CASES À MOTEUR COUPÉ : la voiture file sur son élan sans pouvoir accélérer, avant de reprendre un booster et un tapis roulant
    // (+72 km/h). Puis une vague douce, deux très grands virages plats (droite, gauche) et une descente finale de 4 niveaux. Un bumper et des piques sur les bords de la route.
    id: 'chaine', name: 'Chaîne de Montage', decor: 'factory', difficulty: 2, profil: 'sprint',
    appris: 'Départ : trois boosters → trois cases à moteur coupé. Au programme : tapis roulant, vague, deux très grands virages plats ; bumper et piques sur les bords.',
    goal: { id: 'under', t: 23 },
    opts: { l: 6 }, pilot: { vCap: 66 },
    obst: [{ k: 'bumper', at: 0.3, side: 7.5, s: 0.8 }, { k: 'spikes', at: 0.6, side: -7.5, s: 0.7 }],
    script: 'start B3 S3.c B S2.t137 S [crs1] S2 [cds1] B HR S2 B C S HL S2 B [cdi1] [dn2] [cdo1] B2 finish',
    medals: { cristal: 20.6, or: 21.7, argent: 25, bronze: 29.3 },
  },
  {
    // Chapitre 9 · 2/6 — TECHNIQUE (laminoir). Ouverture : BIFURCATION dès le départ : la voie de droite porte un booster (c'est la voie rapide, celle que suit le pilote), l'autre reste neutre.
    // Huit virages serrés (slaloms, épingles), une dalle ralentisseur entre deux épingles, une chicane sur un mur, une descente de 4 niveaux ; un booster à chaque relance. Un bumper et des piques sur les bords.
    id: 'laminoir', name: 'Laminoir', decor: 'factory', difficulty: 3, profil: 'technique',
    appris: 'Départ : bifurcation : la voie de droite porte un booster. Au programme : huit virages serrés, ralentisseur, chicane ; bumper et piques.',
    goal: { id: 'norespawn' },
    opts: { l: 6 },
    obst: [{ k: 'bumper', at: 0.3, side: -7.5, s: 0.8 }, { k: 'spikes', at: 0.8, side: 7.5, s: 0.7 }],
    script: 'start Y2.b B S R S L S R S L B C B S R S2.x S L B S2 [tr01s] S2< [tr10s] S R B S L B S [cdi1] [dn2] [cdo1] S B finish',
    medals: { cristal: 41.3, or: 43.5, argent: 50, bronze: 58.7 },
  },
  {
    // Chapitre 9 · 3/6 — ROLLERCOASTER (rouages). Ouverture : deux boosters puis directement une HÉLICE montante (quatre grandes courbes inclinées : 8 niveaux, comme le pas d'une vis). Ensuite le checkpoint,
    // un looping TRIPLE (4×4, petit format), un slalom de wall-rides gauche / droite et un plongeon de 8 niveaux. Des piques escamotables sur le bord de la route.
    id: 'engrenages', name: 'Engrenages', decor: 'factory', difficulty: 3, profil: 'rollercoaster',
    appris: 'Départ : deux boosters → hélice montante de 8 niveaux. Au programme : looping triple, wall-rides, plongeon ; piques escamotables.',
    goal: { id: 'norespawn' },
    opts: { l: 10 }, pilot: { vCap: 66 },
    obst: [{ k: 'spikesPop', at: 0.45, side: 6.5, s: 0.75 }],
    script: 'start B2 CBR2 CBR2 CBR2 CBR2 S C B2 OTL S2 B [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B [cdi2] DX [cdo2] S B2 finish',
    medals: { cristal: 30.4, or: 32.1, argent: 36.9, bronze: 43.3 },
  },
  {
    // Chapitre 9 · 4/6 — SPEEDWAY (fonderie). Ouverture : trois boosters puis UN TUNNEL de quatre cases pris à plus de 220 km/h, directement suivi d'un très grand virage relevé. Cinq virages relevés 3×3,
    // un wall-ride de quatre cases (mur droit), deux cases à moteur coupé entre deux virages (la voiture file sur son élan) et deux bumpers sur les bords.
    id: 'fonderie', name: 'Fonderie', decor: 'factory', difficulty: 4, profil: 'speedway',
    appris: 'Départ : trois boosters → tunnel de quatre cases → virage relevé. Au programme : cinq virages relevés, wall-ride, deux cases à moteur coupé, bumpers.',
    goal: { id: 'nowall' },
    opts: { l: 6 }, pilot: { vCap: 70 },
    obst: [{ k: 'bumper', at: 0.35, side: -7.5, s: 0.8 }, { k: 'bumper', at: 0.75, side: 7.5, s: 0.8 }],
    script: 'start B3 S4# BRR S B BLL S2 C B [tr02l] S4> [tr20l] BRR S2.c BLL B S BRR S B2 finish',
    medals: { cristal: 28.4, or: 29.9, argent: 34.4, bronze: 40.4 },
  },
  {
    // Chapitre 9 · 5/6 — ACROBATIQUE (pistons). Ouverture : deux boosters puis UN TAPIS DE QUATRE PISTONS (quatre rebonds à 150 % qui s'enchaînent sans que la voiture touche le sol plus d'un instant).
    // Puis une rampe raide, un rebond vers une terrasse 2 niveaux plus bas, un wall-ride et une rampe douce. Chaque checkpoint est suivi de deux boosters. Piques escamotables et bumper sur les bords.
    id: 'presse', name: 'Presse Hydraulique', decor: 'factory', difficulty: 4, profil: 'acrobatique',
    appris: 'Départ : deux boosters → tapis de quatre pistons (rebonds en chaîne). Au programme : rampe raide, rebond vers une terrasse, wall-ride, rampe douce.',
    goal: { id: 'under', t: 33 },
    opts: { l: 20 }, pilot: { vCap: 60 },
    obst: [{ k: 'spikesPop', at: 0.2, side: -6.5, s: 0.75 }, { k: 'bumper', at: 0.6, side: 7.5, s: 0.8 }],
    script: 'start B2 S4.j150 S3 C B2 [crv2] UX G2 DX DX [cdo2] S3 C B2 S.j150 G2 V-2 S3 [tr01s] S2< [tr10s] S C B2 [crv1] UU G2 DD [cdo1] S5 finish',
    medals: { cristal: 31.2, or: 32.8, argent: 37.8, bronze: 44.3 },
  },
  {
    // Chapitre 9 · 6/6 — TECHNIQUE (usine folle). Ouverture : deux boosters puis DEUX DALLES RALENTISSEUR (freinage forcé) juste avant le slalom R L R L. Neuf virages serrés, une zone moteur coupé, une chicane
    // sur un mur, une descente de 4 niveaux et un booster à chaque relance. Un marteau tournant au milieu de la route (à passer au bon moment) et, sur les bords, des piques et un bumper.
    id: 'usinefolle', name: 'Usine Folle', decor: 'factory', difficulty: 5, profil: 'technique',
    appris: 'Départ : deux boosters → deux dalles ralentisseur juste avant le slalom. Au programme : neuf virages serrés, moteur coupé, chicane ; marteau, piques, bumper.',
    goal: { id: 'norespawn' },
    opts: { l: 8 },
    obst: [{ k: 'hammer', at: 0.35, side: 0, s: 1 }, { k: 'spikes', at: 0.5, side: 7.5, s: 0.7 }, { k: 'bumper', at: 0.9, side: -7.5, s: 0.8 }],
    script: 'start B2 S2.x R L R L B S2 C B S R S L B S2.c S2 [tr01s] S2< [tr10s] S R B S L B S R B [cdi1] [dn2] [cdo1] S B finish',
    medals: { cristal: 35.4, or: 37.3, argent: 42.8, bronze: 50.3 },
  },
  // ---- Ville dans les nuages : vent, deltaplane, gravité faible, sauts ----
  {
    // Chapitre 10 · 1/6 — SPRINT (premier envol). Ouverture : trois boosters puis TROIS CASES DE VENT LATÉRAL : le vent pousse la voiture de côté et la trajectoire se corrige dès le départ.
    // Puis une vague en S, deux très grands virages plats (droite, gauche) et une descente finale de 4 niveaux. Presque tout droit.
    id: 'envol', name: 'Premier Envol', decor: 'sky', difficulty: 2, profil: 'sprint',
    appris: 'Départ : trois boosters → vent latéral. Au programme : vague en S, deux très grands virages plats, descente.',
    goal: { id: 'under', t: 21.5 },
    opts: { l: 6 }, pilot: { vCap: 66 },
    script: 'start B3 S3.w150 S [crs1] S2 [cds1] B HR S2 B C S2 HL S2 B [cdi1] [dn2] [cdo1] B2 finish',
    medals: { cristal: 19.3, or: 20.3, argent: 23.4, bronze: 27.4 },
  },
  {
    // Chapitre 10 · 2/6 — ACROBATIQUE (îles suspendues). Ouverture : trois boosters puis une rampe SANS BORDURES (les îles sont des plateformes sans barrière) : la voiture passe un anneau turbo et se pose
    // sur une île plus basse. Trois sauts (rampe douce avec anneau, rampe forte, rampe douce avec anneau) avec un petit wall-ride entre les deux derniers. Chaque checkpoint est suivi de deux boosters.
    id: 'suspendues', name: 'Îles Suspendues', decor: 'sky', difficulty: 3, profil: 'acrobatique',
    appris: 'Départ : trois boosters → rampe sans bordures (les îles n’ont pas de barrière). Au programme : trois sauts avec anneaux turbo, wall-ride.',
    goal: { id: 'under', t: 30 },
    opts: { l: 20 }, pilot: { vCap: 60 },
    script: 'start B3_ [crv1]_ UU_ GR2 DD_ [cdo1]_ S3_ C B2_ [crv2]_ UX_ G2 DX_ DX_ [cdo2]_ S3_ C B2_ [tr01s] S2< [tr10s] B_ S_ [crv1]_ UU_ GR2 DD_ [cdo1]_ S5_ finish',
    medals: { cristal: 28.1, or: 29.6, argent: 34, bronze: 39.9 },
  },
  {
    // Chapitre 10 · 3/6 — TECHNIQUE (rafales). Ouverture : deux boosters puis DEUX CASES DE VENT LATÉRAL FORT (180 %) avant le premier virage serré : la voiture arrive de travers. Neuf virages serrés,
    // du vent à chaque relance (150 %, 120 %), une chicane sur un mur, une descente de 4 niveaux ; un booster à chaque relance.
    id: 'rafales', name: 'Rafales', decor: 'sky', difficulty: 4, profil: 'technique',
    appris: 'Départ : deux boosters → vent fort (180 %) juste avant la première épingle. Au programme : neuf virages serrés, du vent à chaque relance.',
    goal: { id: 'norespawn' },
    opts: { l: 6 },
    script: 'start B2 S2.w180 S R S L S R B S2 C B S.w150 S2 R S L B S2.w120 S R S L B S [tr01s] S2< [tr10s] S3 R B S2 L B S [cdi1] [dn2] [cdo1] S B finish',
    medals: { cristal: 41.4, or: 43.6, argent: 50.1, bronze: 58.8 },
  },
  {
    // Chapitre 10 · 4/6 — ROLLERCOASTER (montgolfières, gravité réduite). Ouverture : trois boosters, une plaque de gravité à 40 % puis directement un grand looping (la boucle se prend plus facilement,
    // mais la voiture flotte). Ensuite un slalom de wall-rides gauche / droite et un plongeon de 8 niveaux ; une plaque à 100 % rétablit la pesanteur avant l'arrivée.
    id: 'montgolfieres', name: 'Montgolfières', decor: 'sky', difficulty: 4, profil: 'rollercoaster',
    appris: 'Départ : trois boosters → plaque de gravité 40 % → grand looping. Au programme : slalom de wall-rides, plongeon, pesanteur rétablie avant l’arrivée.',
    goal: { id: 'norespawn' },
    opts: { l: 10 }, pilot: { vCap: 58 },
    script: 'start B3 S.g40 OB S2 C B2 [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B [cdi2] DX [cdo2] S.g100 B2 finish',
    medals: { cristal: 21.5, or: 22.7, argent: 26.1, bronze: 30.6 },
  },
  {
    // Chapitre 10 · 5/6 — SPEEDWAY (pont des vents). Ouverture : deux boosters puis du VENT LATÉRAL sur un pont SANS BORDURES, directement suivi d'un très grand virage relevé lui aussi sans bordure.
    // Quatre virages relevés, un wall-ride de quatre cases (mur droit) et un second coup de vent : tout le tour est sans barrière, 86 % du temps au-dessus de 220 km/h.
    id: 'pontvents', name: 'Pont des Vents', decor: 'sky', difficulty: 5, profil: 'speedway',
    appris: 'Départ : deux boosters → vent sur un pont sans bordures → virage relevé sans bordure. Au programme : quatre virages relevés, wall-ride, 86 % au-dessus de 220 km/h.',
    goal: { id: 'nowall' },
    opts: { l: 6 }, pilot: { vCap: 70 },
    script: 'start B2_ S2.w150_ BRR_ S_ B_ BLL_ S2_ C B_ [tr02l] S4> [tr20l] BRR_ S2.w100_ B_ BLL_ S_ B2 finish',
    medals: { cristal: 23, or: 24.2, argent: 27.9, bronze: 32.7 },
  },
  {
    // Chapitre 10 · 6/6 — ACROBATIQUE (cité céleste). Ouverture : DÉPART EN DELTAPLANE depuis le bord du toit (plaque deltaplane juste après la ligne, chute de 6 niveaux) : la voiture plane vers une
    // avenue de 10 cases, où une seconde plaque la rend à la voiture. Puis une rampe raide, un wall-ride sur une façade et une rampe douce avec anneau turbo. Les checkpoints sont suivis de deux boosters.
    id: 'cite', name: 'Cité Céleste', decor: 'sky', difficulty: 5, profil: 'acrobatique',
    appris: 'Départ : en deltaplane : plaque sur la ligne, chute de 6 niveaux. Au programme : avenue de 10 cases, rampe raide, wall-ride, rampe douce avec anneau.',
    goal: { id: 'under', t: 37 },
    opts: { l: 40 }, pilot: { vCap: 60 },
    script: 'start S.e S.x G2 V-6 [dn4] [cdo2] S10 S.e S2 C B2 [crv2] UX G2 DX DX [cdo2] S3 C B2 [tr01s] S2< [tr10s] S C B2 [crv1] UU GR2 DD [cdo1] S5 finish',
    medals: { cristal: 34.8, or: 36.6, argent: 42.1, bronze: 49.4 },
  },
  // ---- Canyon de cristal : gravité inversée, plafonds, verre, volant inversé ----
  {
    // Chapitre 11 · 1/6 — SPRINT (galerie). Ouverture : deux boosters puis TROIS CASES DE VOLANT INVERSÉ (plaque violette) : en ligne droite, le piège est de corriger dans le mauvais sens.
    // Puis une vague en S, deux très grands virages plats (droite, gauche) et une descente finale de 4 niveaux. Presque tout droit.
    id: 'galerie', name: 'Galerie de Cristal', decor: 'caves', difficulty: 2, profil: 'sprint',
    appris: 'Départ : deux boosters → volant inversé (trois cases en ligne droite). Au programme : vague en S, deux très grands virages plats, descente.',
    goal: { id: 'under', t: 21.5 },
    opts: { l: 6 }, pilot: { vCap: 66 },
    script: 'start B2 S3.y S2 [crs1] S2 [cds1] B HR S2 B C S2 HL S2 B [cdi1] [dn2] [cdo1] B2 finish',
    medals: { cristal: 19.3, or: 20.3, argent: 23.4, bronze: 27.4 },
  },
  {
    // Chapitre 11 · 2/6 — TECHNIQUE (plafond renversé). Ouverture : un booster puis directement une VRILLE : la route se retourne et l'on roule au plafond, en gravité inversée. Quatre virages serrés
    // au plafond (R L R L) avec un checkpoint, vrille de retour, puis quatre autres virages serrés au sol, une chicane sur un mur et une descente de 4 niveaux. Un booster à chaque relance.
    id: 'plafond', name: 'Plafond Renversé', decor: 'caves', difficulty: 4, profil: 'technique',
    appris: 'Départ : un booster → vrille : la route se retourne, gravité inversée. Au programme : huit virages serrés dont quatre au plafond.',
    goal: { id: 'norespawn' },
    opts: { l: 8 },
    script: 'start B TW.f S2^ B^ R^ S^ L^ S2^ R^ S^ L^ C^ B^ S2^ TWB.f S2 B R S L B S2 [tr01s] S2< [tr10s] S3 R B S L B S [cdi1] [dn2] [cdo1] S B finish',
    medals: { cristal: 38.8, or: 40.9, argent: 47, bronze: 55.1 },
  },
  {
    // Chapitre 11 · 3/6 — ACROBATIQUE (cristal fêlé, inversions de gravité). Ouverture : deux boosters puis une PLAQUE D'INVERSION DE GRAVITÉ : la voiture « tombe » vers le plafond, 8 niveaux plus haut,
    // et s'y réceptionne ; une seconde plaque la renvoie au sol. Trois allers-retours (8, 8 et 10 niveaux), une dalle de verre fragile au plafond, un wall-ride final et une descente de 4 niveaux.
    id: 'cristalfele', name: 'Cristal Fêlé', decor: 'caves', difficulty: 4, profil: 'acrobatique',
    appris: 'Départ : deux boosters → inversion de gravité : la voiture « tombe » au plafond, 8 niveaux plus haut. Au programme : trois allers-retours sol / plafond, verre fragile au plafond.',
    goal: { id: 'under', t: 33.5 },
    opts: { l: 8 }, pilot: { vCap: 60 },
    script: 'start B2 S.f V8 S4^ C^ B2^ S.f^ V-8 S4 C B2 S.f V8 S2.v^ S2^ B2^ S.f^ V-8 S4 C B2 S.f V10 S4^ B2^ S.f^ V-10 S5 [tr01s] S2< [tr10s] S [cdi1] [dn2] [cdo1] S2 finish',
    medals: { cristal: 31.4, or: 33.1, argent: 38, bronze: 44.7 },
  },
  {
    // Chapitre 11 · 4/6 — SPEEDWAY (miroir). Ouverture : trois boosters puis un S de deux très grands virages relevés en miroir (gauche puis droite). La suite reprend le dessin à l'envers (droite
    // puis gauche), après un wall-ride de quatre cases (mur droit) ; trois dalles de verre fragile (sans danger à grande vitesse) et un dernier S. Six virages relevés, 89 % du tour au-dessus de 220 km/h.
    id: 'miroir', name: 'Miroir', decor: 'caves', difficulty: 4, profil: 'speedway',
    appris: 'Départ : trois boosters → S de deux très grands virages relevés en miroir. Au programme : six virages relevés, wall-ride, trois dalles de verre.',
    goal: { id: 'nowall' },
    opts: { l: 6 }, pilot: { vCap: 70 },
    script: 'start B3 BLL S BRR S2 C B [tr02l] S4> [tr20l] BRR S BLL S B2 S3.v B BLL S BRR S B2 finish',
    medals: { cristal: 29.1, or: 30.6, argent: 35.2, bronze: 41.4 },
  },
  {
    // Chapitre 11 · 5/6 — ROLLERCOASTER (vrilles). Ouverture : un booster puis un PLONGEON de 4 niveaux qui débouche directement sur une VRILLE : la route se retourne et l'on roule au plafond (gravité inversée)
    // pendant une descente et une remontée, avant une seconde vrille qui remet la route à l'endroit. Ensuite un double looping tournant à gauche, un slalom de wall-rides gauche / droite et l'arrivée.
    id: 'vrilles', name: 'Vrilles Souterraines', decor: 'caves', difficulty: 5, profil: 'rollercoaster',
    appris: 'Départ : plongeon de 4 niveaux directement dans une vrille. Au programme : parcours au plafond, double looping, slalom de wall-rides gauche / droite.',
    goal: { id: 'norespawn' },
    opts: { l: 10 }, pilot: { vCap: 66 },
    script: 'start B [cdi1] [dn2] [cdo1] TW.f S2^ D^ S2^ B^ S2^ U^ S^ TWB.f S2 B ODL S2 C B2 [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B2 finish',
    medals: { cristal: 25.5, or: 26.8, argent: 30.8, bronze: 36.2 },
  },
  {
    // Chapitre 11 · 6/6 — TECHNIQUE (cœur de la montagne). Ouverture : un booster puis DEUX DALLES DE VERRE FRAGILE (5 s de résistance) aussitôt suivies d'un slalom R L R L. Huit virages serrés,
    // une chicane sur un mur, une descente de 4 niveaux et un booster à chaque relance : le dernier circuit de la carrière.
    id: 'coeur', name: 'Cœur de la Montagne', decor: 'caves', difficulty: 5, profil: 'technique',
    appris: 'Départ : un booster → deux dalles de verre fragile (5 s de résistance) → slalom. Au programme : huit virages serrés, chicane sur un mur : le dernier circuit.',
    goal: { id: 'norespawn' },
    opts: { l: 6 },
    script: 'start B S2.v500 S R L R L B S2 C B S R S L B S2 [tr01s] S2< [tr10s] S3 R B S L B S [cdi1] [dn2] [cdo1] S B finish',
    medals: { cristal: 31.9, or: 33.5, argent: 38.6, bronze: 45.3 },
  },
  // ---- Atelier des mécanismes (chapitre BONUS, 12e) : obstacles puis pièces mobiles, un à un ----
  {
    // Chapitre 12 (Atelier, bonus) · 1/6 — MÉCANISME : bumpers et piques fixes sur les bords : ils ne gênent que si l’on coupe les virages.
    // Placé par recherche (tools/lab.mjs) : le pilote passe sans choc à 90, 100 et 110 % de sa vitesse ; les phases des obstacles laissent une fenêtre de passage large.
    id: 'garde', name: 'Garde-Fous', decor: 'atelier', difficulty: 1, profil: 'atelier',
    meca: ['bumper', 'spikes'],
    appris: 'Départ : quatre boosters → vague. Au programme : les premiers obstacles, bumpers (ils repoussent) et piques fixes, sur les bords : rester sur la route les évite, couper un virage les réveille.',
    goal: { id: 'nowall' },
    opts: { l: 6 }, pilot: { vCap: 66 },
    obst: [{ k: 'bumper', at: 0.3, side: -7.5, s: 0.8 }, { k: 'spikes', at: 0.55, side: 7.5, s: 0.7 }, { k: 'bumper', at: 0.8, side: 7.5, s: 0.8 }],
    script: 'start B4 [cds1] S [crs1] S2 B HR S2 C S HL S B [cdi1] [dn2] [cdo1] B2 finish',
    medals: { cristal: 17, or: 17.9, argent: 20.6, bronze: 24.2 },
  },
  {
    // Chapitre 12 (Atelier, bonus) · 2/6 — MÉCANISME : piques escamotables en travers de la route : on passe quand elles sont rentrées.
    // Placé par recherche (tools/lab.mjs) : le pilote passe sans choc à 90, 100 et 110 % de sa vitesse ; les phases des obstacles laissent une fenêtre de passage large.
    id: 'cadence', name: 'En Cadence', decor: 'atelier', difficulty: 1, profil: 'atelier',
    meca: ['spikesPop'],
    appris: 'Départ : trois boosters → trois cases. Au programme : des piques escamotables en travers de la route (trois secondes de cycle, une et demie dehors) : on passe quand elles sont rentrées.',
    goal: { id: 'norespawn' },
    opts: { l: 6 }, pilot: { vCap: 60 },
    obst: [{ k: 'spikesPop', at: 0.104, side: 0, s: 1.1, ph: 0.583 }, { k: 'spikesPop', at: 0.213, side: 0, s: 1.1, ph: 0.167 }],
    script: 'start B3 S3 [crs1] S B HR S2 C S2 HL S B [cdi1] [dn2] [cdo1] B2 finish',
    medals: { cristal: 17.5, or: 18.4, argent: 21.2, bronze: 24.9 },
  },
  {
    // Chapitre 12 (Atelier, bonus) · 3/6 — MÉCANISME : une boule balancier puis un mur coulissant : il faut lire leur rythme.
    // Placé par recherche (tools/lab.mjs) : le pilote passe sans choc à 90, 100 et 110 % de sa vitesse ; les phases des obstacles laissent une fenêtre de passage large.
    id: 'pendule', name: 'Le Pendule', decor: 'atelier', difficulty: 2, profil: 'atelier',
    meca: ['pendulum', 'slider'],
    appris: 'Départ : deux boosters → vague. Au programme : une boule balancier qui balaie la route, puis un mur coulissant : on lit leur rythme et on passe dans le vide.',
    goal: { id: 'nowall' },
    opts: { l: 6 }, pilot: { vCap: 66 },
    obst: [{ k: 'pendulum', at: 0.1, side: 0, s: 1, ph: 0 }, { k: 'slider', at: 0.6, side: 0, s: 1, ph: 0.75 }],
    script: 'start B2 [crs1] S2 [cds1] S2 HR S B C S2 HL S2 B [cdi1] [dn2] [cdo1] B2 finish',
    medals: { cristal: 17.3, or: 18.2, argent: 20.9, bronze: 24.5 },
  },
  {
    // Chapitre 12 (Atelier, bonus) · 4/6 — MÉCANISME : un marteau tournant puis un balayeur : des obstacles qui tournent.
    // Placé par recherche (tools/lab.mjs) : le pilote passe sans choc à 90, 100 et 110 % de sa vitesse ; les phases des obstacles laissent une fenêtre de passage large.
    id: 'rotors', name: 'Rotors', decor: 'atelier', difficulty: 2, profil: 'atelier',
    meca: ['hammer', 'sweeper'],
    appris: 'Départ : trois cases → trois boosters. Au programme : un marteau tournant au milieu de la route, puis un balayeur : des obstacles qui tournent, on entre juste après leur passage.',
    goal: { id: 'norespawn' },
    opts: { l: 6 }, pilot: { vCap: 62 },
    obst: [{ k: 'hammer', at: 0.1, side: 0, s: 1, ph: 0.438 }, { k: 'sweeper', at: 0.3, side: 0, s: 1, ph: 0 }],
    script: 'start S3 B3 [cds1] S [crs1] S2 HR S B C S2 HL S B [cdi1] [dn2] [cdo1] B2 finish',
    medals: { cristal: 18.8, or: 19.8, argent: 22.8, bronze: 26.7 },
  },
  {
    // Chapitre 12 (Atelier, bonus) · 5/6 — MÉCANISME : un ascenseur et une glissière : la route elle-même bouge.
    // Placé par recherche (tools/lab.mjs) : le pilote passe sans choc à 90, 100 et 110 % de sa vitesse ; les phases des obstacles laissent une fenêtre de passage large.
    id: 'montecharge', name: 'Monte-Charge', decor: 'atelier', difficulty: 3, profil: 'atelier',
    meca: ['lift', 'slide'],
    appris: 'Départ : cinq boosters → vague. Au programme : la route bouge, un ascenseur (la dalle monte puis redescend) et une glissière (elle se décale sur le côté), comme dans l’éditeur.',
    goal: { id: 'nowall' },
    opts: { l: 6 }, pilot: { vCap: 64 },
    movers: [{ ms: 100, ma: 1 }, { ms: 100, ma: 0.5 }],      // PHYS_VER 36 : glissière d'une demi-case (avant une case) : se décaler de 32 m à 220 km/h demande ~170 m avec le braquage borné selon la vitesse
    script: 'start B5 S [crs1] S2~ B HR S2= C S HL S B [cdi1] [dn2] [cdo1] B2 finish',
    medals: { cristal: 17.1, or: 18, argent: 20.7, bronze: 24.3 },
  },
  {
    // Chapitre 12 (Atelier, bonus) · 6/6 — MÉCANISME : marteau, balancier et mur coulissant à la suite : tout le chapitre d’un coup.
    // Placé par recherche (tools/lab.mjs) : le pilote passe sans choc à 90, 100 et 110 % de sa vitesse ; les phases des obstacles laissent une fenêtre de passage large.
    id: 'grandatelier', name: 'Le Grand Atelier', decor: 'atelier', difficulty: 3, profil: 'atelier',
    meca: ['hammer', 'pendulum', 'slider'],
    appris: 'Départ : deux boosters → deux cases. Au programme : le tour d’horizon, un marteau, un balancier puis un mur coulissant à la suite : les mécanismes des circuits d’avant reviennent d’un coup.',
    goal: { id: 'norespawn' },
    opts: { l: 6 }, pilot: { vCap: 56 },
    obst: [{ k: 'hammer', at: 0.066, side: 0, s: 1, ph: 0.966 }, { k: 'pendulum', at: 0.347, side: 0, s: 1, ph: 0.7 }, { k: 'slider', at: 0.637, side: 0, s: 1, ph: 0.396 }],
    script: 'start B2 S2 [cds1] S2 [crs1] S B HR S2 C S2 HL S2 B [cdi1] [dn2] [cdo1] B2 finish',
    medals: { cristal: 19.3, or: 20.4, argent: 23.4, bronze: 27.5 },
  },
];

// 0.9 : un chapitre de carrière = un thème. Chapitres du plus facile au plus dur, et
// dans chaque chapitre du plus facile au plus dur (tri stable : l'ordre d'écriture
// départage les circuits de même difficulté).
BUILTIN_TRACKS.sort((a, b) => CAREER_ORDER.indexOf(a.decor) - CAREER_ORDER.indexOf(b.decor) || a.difficulty - b.difficulty);

export function buildBuiltin(def) {
  const t = scriptTrack(def.name, def.script, { ...(def.opts || {}), decor: def.decor || 'desert', ...(def.movers ? { movers: def.movers } : {}) });
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
  // Obstacles posés le long du parcours : at = fraction du chemin, side = décalage latéral (m). 0.9.73 : aussi les panneaux et les solides (piliers, murs,
  // cales…) ; rot = rotation ajoutée au cap de la route (π : un panneau tourné vers le pilote qui arrive), dy = hauteur au-dessus de la route.
  if (def.obst && t.path && t.path.length > 10) {
    const P = t.path, n = def.laps > 1 ? Math.floor(P.length / def.laps) : P.length;
    for (const o of def.obst) {
      const i = Math.min(n - 2, Math.floor(n * o.at));
      const a = P[i], b = P[i + 1];
      const dx = b[0] - a[0], dz = b[2] - a[2], l = hypot2(dx, dz) || 1;
      // Valeurs arrondies : le calcul flottant peut différer d'un moteur JavaScript à l'autre
      // (navigateur / serveur) ; l'empreinte du circuit doit être identique partout.
      const q = (v, st) => Math.round(v / st) * st;
      let ry = q(datan2(dx / l, dz / l), Math.PI / 8);
      // Panneaux et solides (0.9.74) : cap (+ rot) sur la grille de π/8, ramené dans ]−π, π] (π exact : quatre quarts de tour dans l'éditeur redonnent le même cap).
      // Obstacles : calcul d'avant, inchangé au bit près.
      if (o.rot || !isObstacle(o.k)) { let k = Math.round((ry + (o.rot || 0)) / (Math.PI / 8)); while (k > 8) k -= 16; while (k <= -8) k += 16; ry = (k * Math.PI) / 8; } else ry = +ry.toFixed(4);
      t.addDeco({ k: o.k, x: q(a[0] + (-dz / l) * (o.side || 0), 0.5), y: q(a[1] + (o.dy || 0), 0.1), z: q(a[2] + (dx / l) * (o.side || 0), 0.5), ry, s: o.s || 1, c: o.c || 0, ph: o.ph || 0 });
    }
  }
  return t;
}
