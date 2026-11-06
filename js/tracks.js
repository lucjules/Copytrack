// Circuits intégrés (créations originales), décrits avec le constructeur "tortue"
// (voir scriptTrack dans track.js). Les temps de médailles sont en secondes.
// 0.9 : 66 circuits, 11 chapitres de 6 (un par thème), du plus facile au plus dur.
// Chaque circuit mélange plusieurs familles de pièces ; goal = objectif bonus.
// ATTENTION : l'ordre de ce fichier n'est PAS celui de la carrière. La liste est triée en bas de fichier (thème selon THEME_ORDER, puis difficulté) :
// pour retrouver le numéro d'un circuit, utiliser BUILTIN_TRACKS.findIndex() après import, jamais la position dans le texte.
import { scriptTrack } from './track.js';
import { BUILTIN_OBSTACLES } from './builtinObstacles.js';

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
    id: 'lagon', name: 'Lagon Turquoise', decor: 'isles', difficulty: 1,
    goal: {id: 'rings', n: 1},
    script: 'start B S2 R S L S2 C S2 UU GR2 DD S2 L S.o S R S2 RR S2 S.o C S2 LL S2 B S R L S2 finish',
    medals: { cristal: 26.2, or: 27.7, argent: 31.9, bronze: 37.4 },
  },
  {
    id: 'aurore', name: 'Aurore Naissante', decor: 'polar', difficulty: 1,
    goal: {id: 'norespawn'},
    script: 'start S B S2 O S C S RR S I2 S R S B S2 C S LL S2 B S BR S finish',
    medals: { cristal: 19.3, or: 20.3, argent: 23.3, bronze: 27.5 },
  },
  {
    id: 'lianes', name: 'Lianes Néon', decor: 'jungle', difficulty: 2,
    goal: {id: 'turbo', n: 1},
    script: 'start B S2 R S L S R L S2 C S L S S S R S2.m R L S2 B S O S2 L S R S2 C S R S L S2 finish',
    medals: { cristal: 29.2, or: 31.2, argent: 35.9, bronze: 42 },
  },
  {
    id: 'neons', name: 'Néons Express', decor: 'city', difficulty: 2,
    goal: {id: 'nowall'},
    script: 'start B S2 R S L S2# C S2 L S R S2 Y2.b S2 R L S2 B S2 BL S2 C S L S R S2 finish',
    medals: { cristal: 26.8, or: 28.4, argent: 32.8, bronze: 38.4 },
  },
  {
    id: 'braises', name: 'Braises', decor: 'volcano', difficulty: 2,
    goal: {id: 'perfect', n: 1},
    script: 'start S2 B S2 R S L S2 C S2 Y2.b S2 BR S U S2 D S2 C S2 UU G2 DD S2 LL S2 finish',
    medals: { cristal: 25.9, or: 27.1, argent: 31.2, bronze: 36.6 },
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
    id: 'quai', name: 'Quai d’Amarrage', decor: 'orbit', difficulty: 2,
    goal: {id: 'rings', n: 1},
    script: 'start S2 B TI TM2 TO S2 R B S UU GR2 DD S2 C S L S2 B S O S2 KL S2 R S2 finish',
    medals: { cristal: 22, or: 23, argent: 26.5, bronze: 31.1 },
  },
  {
    // Chapitre 1 · 3/6 — ACROBATIQUE. Ouverture : chute libre immédiate (départ lancé à 110 km/h depuis une plateforme à 77 m, réception sur une
    // descente à 38°). Puis trois sauts de plus en plus grands (bosse, grand tremplin à 38°, dernier saut avec checkpoint aérien) et un
    // petit saut sur un mur. Les réceptions sont de longues pentes descendantes et les checkpoints sont posés AVANT les rampes, jamais
    // sur une zone de réception : le circuit reste finissable de 195 à 300 km/h à l'abord des sauts (vérifié par tools/test-v096.mjs).
    id: 'tremplins', name: 'Tremplins du Crépuscule', decor: 'desert', difficulty: 2, profil: 'acrobatique',
    goal: { id: 'perfect', n: 3 },
    opts: { l: 16 }, params: { v0: 110 }, pilot: { vCap: 60 },
    script: 'start G2 V-5 [dn4] [cdo2] B S C [crv1] UU G2 DD [cdo1] S3 CBR1 S [tr01s] S2< [tr10s] S LL B S C S [crv2] UX G3 DX DX [cdo2] S3 B UU GC2 DD [cdo1] S2 finish',
    medals: { cristal: 24.1, or: 25.3, argent: 29.1, bronze: 34.2 },
  },
  {
    id: 'hyper', name: 'Hyperboucle', decor: 'city', difficulty: 3,
    goal: {id: 'norespawn'},
    script: 'start B S2 R S L S2 B S O S2 C S L S R S2 B S OL S2 BR S2 B S OB S2 C S2 L S R S2 finish',
    medals: { cristal: 31.3, or: 32.7, argent: 37.5, bronze: 44.1 },
  },
  {
    id: 'canopee', name: 'Canopée Suspendue', decor: 'jungle', difficulty: 3,
    goal: {id: 'turbo', n: 2},
    script: 'start B S2 R S L S2 B S O S2 R S S S L S B S OL S2 C S BL S R S2 B S2 L R S2 finish',
    medals: { cristal: 27.7, or: 29.1, argent: 33.5, bronze: 39.3 },
  },
  {
    id: 'spores', name: 'Spores Sauteuses', decor: 'jungle', difficulty: 3,
    goal: {id: 'perfect', n: 2},
    script: 'start B S2 L S R S2 B S.j G1 S2 R L C S2 RR S B S2 GU2 S GD2 S LL S R S L S2 B S.j G1 S2 C S2 R L S2 finish',
    medals: { cristal: 29.9, or: 31.8, argent: 36.5, bronze: 42.8 },
  },
  {
    id: 'recif', name: 'Récif Corallien', decor: 'isles', difficulty: 3,
    goal: {id: 'vehicle', v: 'car'},
    script: 'start B S2 R S2 S.n S3.a R.a S2.a L.a S2.a S.n S2 C S L S BR S B S UU G2 DD S2 C S2 L R S2 finish',
    medals: { cristal: 28.6, or: 29.5, argent: 34, bronze: 39.9 },
  },
  {
    id: 'phare', name: 'Le Phare', decor: 'isles', difficulty: 3,
    goal: {id: 'rings', n: 1},
    script: 'start B S2 R S L S2 C S2 S.e S2 UU GR7 DD S2 S.e S R S L S3_ B S2 C S2 RR S2 finish',
    medals: { cristal: 27, or: 28.2, argent: 32.5, bronze: 38.1 },
  },
  {
    id: 'serpent', name: 'Le Serpent', decor: 'jungle', difficulty: 3,
    goal: {id: 'vehicle', v: 'moto'},
    script: 'start B S2 R L R L S2 C S.o S2 R S L S2 B S O S2 C S L R L R S2 S.o S2 B S2 RR S2 LL S.o S2 finish',
    medals: { cristal: 29.7, or: 31.8, argent: 36.4, bronze: 42.8 },
  },
  {
    id: 'coulee', name: 'Coulée Ardente', decor: 'volcano', difficulty: 3, pilot: { vCap: 40 },
    goal: {id: 'rings', n: 2},
    script: 'start B S2 R S L S2 C S S.e S5 UU GR6 DD S2 R S5 UU GR6 DD S.e S2 C S L S2 B S2 finish',
    medals: { cristal: 25.9, or: 26.9, argent: 30.9, bronze: 36.3 },
  },
  {
    id: 'navette', name: 'Navette', decor: 'orbit', difficulty: 3, pilot: { vCap: 44 },
    goal: {id: 'vehicle', v: 'moto'},
    script: 'start S2 B S2 R S L S2 S.o S2 C S2 R S2 BR S2 S.o S S.e S3 UU G6 DD S S.e S2 C S L S2 S.o S2 finish',
    medals: { cristal: 30, or: 31.2, argent: 35.9, bronze: 42.1 },
  },
  {
    id: 'boulevard', name: 'Boulevard Sans Fin', decor: 'city', difficulty: 3,
    goal: {id: 'nowall'},
    script: 'start B S2 R S L S3_ R_ S_ L_ S2 C S S.n S4.a L.a S2.a R.a S.a S.n S2 B S2 BR S2_ KL S2 R S L S2 finish',
    medals: { cristal: 30.9, or: 32.2, argent: 37, bronze: 43.4 },
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
    id: 'banquise', name: 'Banquise Rebondissante', decor: 'polar', difficulty: 3,
    goal: {id: 'perfect', n: 2},
    script: 'start S B S2 S.j G1 S2 C S RR S B S S.j G1 S2 LL S2.i C S2 B S S S S.j G1 S3_ R S2 finish',
    medals: { cristal: 21.2, or: 22.4, argent: 25.7, bronze: 30.1 },
  },
  {
    id: 'racines', name: 'Racines Boueuses', decor: 'jungle', difficulty: 3,
    goal: {id: 'turbo', n: 2},
    script: 'start B S2 R S2 L S R S.d L S2 C S R L S2 S S R S L S2.w60 B S2 Y2.d S R S L S2 finish',
    medals: { cristal: 27.9, or: 29.9, argent: 34.7, bronze: 41.2 },
  },
  {
    id: 'glacier', name: 'Glacier Magnétique', decor: 'polar', difficulty: 4,
    goal: {id: 'norespawn'},
    script: 'start S B S U S.m D S C S R S3 R S B S2 UU S.m DD.m S C S LL S2.m U S2 D S TI TM2 TO finish',
    medals: { cristal: 21.2, or: 22.4, argent: 25.9, bronze: 30.5 },
  },
  {
    id: 'metro', name: 'Métro Aérien', decor: 'city', difficulty: 4,
    goal: {id: 'nowall'},
    script: 'start B S2 U2 R# S# L# S2# C S2 R S L S2 D2 S R L S2# B S2# L TI TM2 TO UU GC2 DD S2_ R S2 finish',
    medals: { cristal: 27.4, or: 29, argent: 33.3, bronze: 39.1 },
  },
  {
    id: 'basalte', name: 'Champs de Basalte', decor: 'volcano', difficulty: 4,
    goal: {id: 'norespawn'},
    script: 'start S2 B S2 R S2 L S2 C S2_ R_ S_ L S2.w150 S2 B S2 UU GR2 DD S2 KL S2.d R S2 B S.j G1 S2 L S2 finish',
    medals: { cristal: 28.4, or: 30, argent: 34.8, bronze: 41.2 },
  },
  {
    id: 'temple', name: 'Temple Perdu', decor: 'jungle', difficulty: 4,
    goal: {id: 'norespawn'},
    script: 'start B S2 R S L S2# R# S# L# S2 C S2 B S2 QU WA2 CR S2 R S L S2 D2 S2 C S TB S L S R S2 finish',
    medals: { cristal: 28.3, or: 29.6, argent: 34.1, bronze: 40 },
  },
  {
    id: 'tours', name: 'Tours Jumelles', decor: 'city', difficulty: 4, pilot: { vCap: 40 },
    goal: {id: 'nowall'},
    script: 'start B S2 R S L S2 B S2 QU WA CR S2 C S R S L S2 D2 S CK S2 R S2 B S2 QU WA CR S2 C S2 R L S2 finish',
    medals: { cristal: 30.9, or: 32.5, argent: 37.4, bronze: 43.9 },
  },
  {
    id: 'ceinture', name: 'Ceinture d’Astéroïdes', decor: 'orbit', difficulty: 4,
    goal: {id: 'rings', n: 2},
    script: 'start S2 B S2 UU GC2 DD S2 R S2 TB S2 L S2 B S2 UU GR2 DD S2 C S CKL S2 BL S2 UU GR2 DD S2 finish',
    medals: { cristal: 32.6, or: 33.9, argent: 39, bronze: 45.7 },
  },
  {
    id: 'helice', name: 'Double Hélice', decor: 'polar', difficulty: 4,
    goal: {id: 'norespawn'},
    script: 'start S B S2 O S OL S C S RR S B S CK S2 L S2 C S R S3 CKL S LL B S2 O S finish',
    medals: { cristal: 30, or: 31.3, argent: 36, bronze: 42.2 },
  },
  {
    id: 'cheminee', name: 'Cheminée du Volcan', decor: 'volcano', difficulty: 4,
    goal: {id: 'perfect', n: 1},
    script: 'start S2 B S2 R S L TI TM2 TO S C S2 B S2 QU WA2 CR S2 R S2 TB S2 C S L S2 D2 S2 finish',
    medals: { cristal: 26.5, or: 27.5, argent: 31.7, bronze: 37.2 },
  },
  {
    id: 'vrille', name: 'Tourbillon Tropical', decor: 'isles', difficulty: 4,
    goal: {id: 'turbo', n: 1},
    script: 'start B S2 R S L S2 B S2 OB S C S2 CK S2 L S R S2 B S2 ODL S2 C S CKL S2 R L S2 finish',
    medals: { cristal: 43.6, or: 45.4, argent: 52.3, bronze: 61.4 },
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
    id: 'grandanneau', name: 'Grand Anneau', decor: 'orbit', difficulty: 4, laps: 3,
    goal: {id: 'turbo', n: 2},
    script: 'start S2 B BR S2 C S2 BR S2 TB S2 BR S5 BR S1 finish',
    medals: { cristal: 44, or: 45.4, argent: 52.2, bronze: 61.3 },
  },
  {
    id: 'lunaire', name: 'Sauts Lunaires', decor: 'isles', difficulty: 4, pilot: { vCap: 58 },
    goal: {id: 'perfect', n: 2},
    script: 'start B S2 B S.g30 S2 UU G10 DD S2 C S.g100 S2 R S L S2 RR S B S2 S.e S2 UU G8 DD S S.e S2 C S2 L S R S2 finish',
    medals: { cristal: 30.8, or: 32.2, argent: 37, bronze: 43.4 },
  },
  {
    id: 'spirale', name: 'Spirale Prismatique', decor: 'desert', difficulty: 4,
    goal: {id: 'norespawn'},
    script: 'start S2 R S U S R S U R S3 C S R S GU2 R S2 R S B S5 BR S D3 S KR S2 B S2 finish',
    medals: { cristal: 27.8, or: 29.3, argent: 33.8, bronze: 39.6 },
  },
  {
    id: 'couronne', name: 'Couronne Boréale', decor: 'polar', difficulty: 5,
    goal: {id: 'nowall'},
    script: 'start S B S2 O S2 C S U2 RR S2 B S UU G2 DD S2 C S LL S B S.j G1 S2 R S2.m U S.m D.m S C S BLL S2 B S OL S2 R S2.i S L S2 B S2 finish',
    medals: { cristal: 39, or: 40.4, argent: 46.5, bronze: 54.6 },
  },
  {
    id: 'caldeira', name: 'Caldeira', decor: 'volcano', difficulty: 5, laps: 2,
    goal: {id: 'nowall'},
    script: 'start S2 B S2 RR S S.n S2.a RR.a S.a S.n S S C S2 RR S2 B S RR finish',
    medals: { cristal: 38.8, or: 40.7, argent: 46.8, bronze: 54.9 },
  },
  {
    id: 'blizzard', name: 'Blizzard', decor: 'polar', difficulty: 5,
    goal: {id: 'norespawn'},
    script: 'start S2 B S I3 RR S C S2 L S R S2 B S UU GR2 DD S C S LL S2 B S.j G1 S2 R.i S B S O S2 C S CK S2 B S3 finish',
    medals: { cristal: 39.5, or: 41.2, argent: 47.5, bronze: 55.8 },
  },
  {
    id: 'viaduc', name: 'Viaduc Vertical', decor: 'city', difficulty: 5,
    goal: {id: 'perfect', n: 1},
    script: 'start B S2 R S L S2 B S2 QU WA2 CR S2 C S2 B S OB S R S L D2 S2 B S OD S2 C S L R S2.g40 S2 S.g100 S2 finish',
    medals: { cristal: 32.8, or: 34.1, argent: 39.3, bronze: 46.1 },
  },
  {
    id: 'archipel', name: 'Grand Archipel', decor: 'isles', difficulty: 5,
    goal: {id: 'vehicle', v: 'car'},
    script: 'start B S2 R S L S2 B S2 OL S2 C S S.n S3.a R.a S2.a S.n S2 RR_ S2.w170_ S C S2 B S2 UU G3 DD S2 R S L S2 B S OB S2 C S2 L R S2 finish',
    medals: { cristal: 41.2, or: 43, argent: 49.5, bronze: 58.1 },
  },
  {
    id: 'apesanteur', name: 'Apesanteur', decor: 'orbit', difficulty: 5,
    goal: {id: 'rings', n: 2},
    script: 'start S2 B S S.g40 S2 UU GR6 DD S2 S.g100 S2 C S2 TB S2 R S2 CK S2 L S2 S.e S UU GR7 DD S.e S2 C TI TM2.b TO S finish',
    medals: { cristal: 35, or: 36.2, argent: 41.7, bronze: 48.9 },
  },
  {
    id: 'eruption', name: 'Éruption', decor: 'volcano', difficulty: 5,
    goal: {id: 'norespawn'},
    script: 'start S2 B S2 R S L S2 QU WA CR S2 C S2 OB S2 BL S2 S.n S2.a L.a S.a S.n S2 C S2 CKL S2 UU GR2 DD S2 Y2.b S2 finish',
    medals: { cristal: 46, or: 47.7, argent: 54.9, bronze: 64.5 },
  },
  {
    id: 'zenith', name: 'Station Zénith', decor: 'orbit', difficulty: 5, laps: 2,
    goal: {id: 'nowall'},
    script: 'start S2 B S4 BR S CK S2 C BR TI TM3 TO UU GR2 DD BR S TB S3 BR finish',
    medals: { cristal: 39.8, or: 41, argent: 47.2, bronze: 55.4 },
  },
  // ==== 0.9 : quatre nouveaux thèmes (6 circuits chacun) ============================
  // ---- Fonds marins : courants (tapis roulants), eau et bateau, bulles de verre ----
  {
    id: 'courant', name: 'Courant Chaud', decor: 'reef', difficulty: 2,
    goal: { id: 'nowall' },
    script: 'start S2 S2.t137 R S2 C S L S3.t137 RR S2 B S2 LL S C S2.t137 R S2 finish',
    medals: { cristal: 18.8, or: 19.8, argent: 22.7, bronze: 26.6 },
  },
  {
    id: 'corail', name: 'Jardin de Corail', decor: 'reef', difficulty: 3,
    goal: { id: 'vehicle', v: 'car' },
    script: 'start S2 B S2 R S S.n S2.a RR.a S.a S.n S C S2 L S2.t137 O S2 C S R S2.v L S2 finish',
    obst: [{ k: 'pendulum', at: 0.86, side: 0, s: 0.9 }],
    medals: { cristal: 25.5, or: 26.5, argent: 30.5, bronze: 35.7 },
  },
  {
    id: 'epave', name: 'Épave Engloutie', decor: 'reef', difficulty: 3,
    goal: { id: 'turbo', n: 1 },
    script: 'start S2 B S2 RR S2.v C S2 U S2.t137 D S LL S2 B S BR S C S S.j G1 S2 R S L S2.t137 finish',
    obst: [{ k: 'pendulum', at: 0.36, side: 0, s: 1 }, { k: 'bumper', at: 0.62, side: 5.5, s: 0.8 }],
    medals: { cristal: 22.3, or: 23.3, argent: 26.8, bronze: 31.4 },
  },
  {
    id: 'meduses', name: 'Méduses Électriques', decor: 'reef', difficulty: 4,
    goal: { id: 'norespawn' },
    script: 'start S2 B S2 R S C S2.v S2 L S2 S.n S3.a LL.a S2.a S.n S C S2 UU GR2 DD S2 R S2.t137 L S2 finish',
    obst: [{ k: 'sweeper', at: 0.22, side: 0, s: 0.95 }, { k: 'pendulum', at: 0.82, side: 0, s: 1 }],
    medals: { cristal: 33, or: 34.2, argent: 39.4, bronze: 46.1 },
  },
  {
    id: 'abysses', name: 'Abysses', decor: 'reef', difficulty: 4,
    goal: { id: 'nowall' },
    opts: { l: 2 },
    script: 'start S2 B S2 D2 S2 RR S C S2.t137 OB S2 L S U2 S2.v B S BR S2 C S2.v S2 R S L S2.t137 S finish',
    obst: [{ k: 'pendulum', at: 0.55, side: 0, s: 1.1 }],
    medals: { cristal: 26.8, or: 28.1, argent: 32.3, bronze: 38 },
  },
  {
    id: 'barriere', name: 'Grande Barrière', decor: 'reef', difficulty: 5,
    goal: { id: 'norespawn' },
    script: 'start S2 B S2.t137 RR S2.v C S2 LL S2.t137 S S.n S2.a R.a S2.a S.n S C S2 OB S2 B S2 BR S2.v S2 L S2.t137 S finish',
    obst: [{ k: 'pendulum', at: 0.2, side: 0, s: 1 }, { k: 'sweeper', at: 0.7, side: 0, s: 0.95 }],
    medals: { cristal: 21.1, or: 22.5, argent: 25.9, bronze: 30.4 },
  },
  // ---- Usine mécanique : obstacles, tapis, moteur coupé, ascenseurs ----
  {
    id: 'chaine', name: 'Chaîne de Montage', decor: 'factory', difficulty: 2,
    goal: { id: 'nowall' },
    script: 'start S2 B S2.t137 R S2 C S2 L S2.t137 S2 RR S2 C S2 B S2 LL S2.t137 finish',
    obst: [{ k: 'slider', at: 0.3, side: 0, s: 0.8 }, { k: 'spikes', at: 0.62, side: -5.5, s: 0.7 }],
    medals: { cristal: 19.9, or: 20.7, argent: 23.8, bronze: 27.8 },
  },
  {
    id: 'laminoir', name: 'Laminoir', decor: 'factory', difficulty: 3,
    goal: { id: 'turbo', n: 1 },
    script: 'start S2 B S3.t137 R S C S2.c S2 L S2 B S2 BR S2 C S2.t137 S2 R S L S2 B S finish',
    obst: [{ k: 'hammer', at: 0.4, side: 0, s: 1 }, { k: 'sweeper', at: 0.78, side: 0, s: 0.95 }],
    medals: { cristal: 27.5, or: 29.3, argent: 33.6, bronze: 39.5 },
  },
  {
    id: 'engrenages', name: 'Engrenages', decor: 'factory', difficulty: 3,
    goal: { id: 'norespawn' },
    params: { offroad: 1 },
    script: 'start S2 B S2 R S2 S~ S2 C S L S2 B S O S2 C S2 RR S S~ S2 LL S2.t137 finish',
    obst: [{ k: 'spikesPop', at: 0.55, side: 5, s: 0.75 }],
    medals: { cristal: 22.9, or: 24.1, argent: 27.6, bronze: 32.5 },
  },
  {
    id: 'fonderie', name: 'Fonderie', decor: 'factory', difficulty: 4,
    goal: { id: 'nowall' },
    script: 'start S2 B S2 R S2.x S C S2 UU S2.t137 DD S2 L S2.c S B S2 BR S2 C S2 R S2 L S2 B S2 finish',
    obst: [{ k: 'hammer', at: 0.25, side: 0, s: 1 }, { k: 'slider', at: 0.6, side: 0, s: 0.85 }, { k: 'bumper', at: 0.85, side: -5.5, s: 0.8 }],
    medals: { cristal: 29.6, or: 31.5, argent: 36.3, bronze: 42.6 },
  },
  {
    id: 'presse', name: 'Presse Hydraulique', decor: 'factory', difficulty: 4,
    goal: { id: 'turbo', n: 2 },
    params: { offroad: 1 },
    script: 'start S2 B S2 S~ S S= S2 C S2 R S2 L S2.t137 S RR S2 S~ S2 C S2 LL S2 B S S= S2 finish',
    obst: [{ k: 'sweeper', at: 0.48, side: 0, s: 0.95 }],
    medals: { cristal: 29.8, or: 31.7, argent: 36.5, bronze: 42.8 },
  },
  {
    id: 'usinefolle', name: 'Usine Folle', decor: 'factory', difficulty: 5,
    goal: { id: 'norespawn' },
    script: 'start S2 B S2.t137 R S2 C S2.c S QU WA CR S2 B S2 L S2 OB S2 C S2.t137 BR S2 R S2.x L S2 B S2 finish',
    obst: [{ k: 'hammer', at: 0.18, side: 0, s: 1 }, { k: 'spikes', at: 0.55, side: 5.5, s: 0.7 }, { k: 'sweeper', at: 0.72, side: 0, s: 0.95 }, { k: 'pendulum', at: 0.9, side: 0, s: 1 }],
    medals: { cristal: 38.8, or: 40.4, argent: 46.4, bronze: 54.5 },
  },
  // ---- Ville dans les nuages : vent, deltaplane, gravité faible, sauts ----
  {
    id: 'envol', name: 'Premier Envol', decor: 'sky', difficulty: 3,
    goal: { id: 'perfect', n: 1 },
    script: 'start S2 B S2 GU2 S GD2 S R S2 C S2.w150 S2 L S2 B S UU G2 DD S2 R S2 finish',
    medals: { cristal: 20.4, or: 21.5, argent: 24.7, bronze: 29 },
  },
  {
    id: 'suspendues', name: 'Îles Suspendues', decor: 'sky', difficulty: 3,
    goal: { id: 'rings', n: 2 },
    script: 'start S3 S.e S UU GR5 DD S3 S.e S C S2 R S2 L S2 B S.j G1 S2 C S2 B S UU GR2 DD S2 finish',
    medals: { cristal: 27.4, or: 28.4, argent: 32.7, bronze: 38.4 },
  },
  {
    id: 'rafales', name: 'Rafales', decor: 'sky', difficulty: 4,
    goal: { id: 'nowall' },
    script: 'start S2 B S2.w170 R S2.w40 C S2 L S2.w160_ S2 RR S2 B S2 BL S C S2.w30 S R S2 L S2 finish',
    medals: { cristal: 23, or: 24.2, argent: 27.8, bronze: 32.6 },
  },
  {
    id: 'montgolfieres', name: 'Montgolfières', decor: 'sky', difficulty: 4,
    goal: { id: 'vehicle', v: 'car' },
    script: 'start S2 B S S.g40 S2 UU GR6 DD S2 S.g100 S2 C S2 R S2 S.e S UU GR6 DD S3 S.e S C S2 L S2 B S2 finish',
    medals: { cristal: 31.5, or: 32.7, argent: 37.6, bronze: 44.1 },
  },
  {
    id: 'pontvents', name: 'Pont des Vents', decor: 'sky', difficulty: 5,
    goal: { id: 'norespawn' },
    script: 'start S2 B S2_ R_ S2.w150_ C S2_ L_ S2_ B S UU GR2 DD S2 BR S2 C S2.w60_ S2_ R S2 B S2 finish',
    medals: { cristal: 22.6, or: 23.6, argent: 27.2, bronze: 31.9 },
  },
  {
    id: 'cite', name: 'Cité Céleste', decor: 'sky', difficulty: 5,
    goal: { id: 'rings', n: 3 },
    script: 'start S3 S.e S UU GR5 DD S3 S.e S C S2 B S OB S2 R S2.w160 L S2 C S2 S.g50 S2 UU GR4 DD S.g100 S2 B S BR S2 finish',
    medals: { cristal: 36.1, or: 37.4, argent: 43.1, bronze: 50.5 },
  },
  // ---- Canyon de cristal : gravité inversée, plafonds, verre, volant inversé ----
  {
    id: 'galerie', name: 'Galerie de Cristal', decor: 'caves', difficulty: 3,
    goal: { id: 'nowall' },
    script: 'start S2 B S2 R S2 C S2.d L S2 B S2.y S3 R S2 C S2 L S2.i S2 finish',
    medals: { cristal: 22.7, or: 23.8, argent: 27.3, bronze: 32.1 },
  },
  {
    id: 'plafond', name: 'Plafond Renversé', decor: 'caves', difficulty: 4,
    goal: { id: 'norespawn' },
    opts: { l: 2 },
    script: 'start S2 B S2 TW.f S2^ C^ S2^ R^ S2^ TWB.f S2 C S2 L S2 B S2 finish',
    medals: { cristal: 17.2, or: 17.9, argent: 20.3, bronze: 23.7 },
  },
  {
    id: 'cristalfele', name: 'Cristal Fêlé', decor: 'caves', difficulty: 4,
    goal: { id: 'nowall' },
    script: 'start S2 B S2.v R S2.v C S2 L S2 B S2.v RR S2 C S2.y S2 LL S2.v S2 B S finish',
    medals: { cristal: 24.8, or: 25.9, argent: 29.8, bronze: 35 },
  },
  {
    id: 'miroir', name: 'Miroir', decor: 'caves', difficulty: 4,
    goal: { id: 'turbo', n: 1 },
    opts: { l: 1 },
    script: 'start S2 B S2 S.f V3 S2^ C^ S2^ L^ S2^ S.f^ V-3 S3 C S2 R S2 B S2 finish',
    medals: { cristal: 17.1, or: 17.9, argent: 20.5, bronze: 24.1 },
  },
  {
    id: 'vrilles', name: 'Vrilles Souterraines', decor: 'caves', difficulty: 5,
    goal: { id: 'norespawn' },
    opts: { l: 3 },
    script: 'start S2 B S2 TW.f S2^ D^ S2^ C^ S2^ U^ S^ TWB.f S2 C S2 R S2 TW.f S2^ R^ S2^ TWB.f S2 B S2 finish',
    medals: { cristal: 23.2, or: 24.2, argent: 27.4, bronze: 31.8 },
  },
  {
    id: 'coeur', name: 'Cœur de la Montagne', decor: 'caves', difficulty: 5,
    goal: { id: 'norespawn' },
    opts: { l: 2 },
    script: 'start S2 B S2 TW.f S2^ C^ S2^ L^ S2^ TWB.f S2.v R S2 C S2.y S2 L S2 B S2 S.f V3 S2^ R^ S2^ S.f^ V-3 S3 C S2 B S2 finish',
    obst: [{ k: 'pendulum', at: 0.47, side: 0, s: 1 }],
    medals: { cristal: 37.3, or: 41.1, argent: 47.2, bronze: 55.4 },
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
  if (BUILTIN_OBSTACLES[def.id]) {
    for (const o of BUILTIN_OBSTACLES[def.id]) t.addDeco(o);
  } else if (def.obst && t.path && t.path.length > 10) {
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
