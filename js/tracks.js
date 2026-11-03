// Circuits intégrés (créations originales), décrits avec le constructeur "tortue"
// (voir scriptTrack dans track.js). Les temps de médailles sont en secondes.
// v1.5 : 42 circuits rangés du plus facile au plus dur, par chapitres de 6 (mode carrière).
// Chaque circuit mélange plusieurs familles de pièces ; goal = objectif bonus.
import { scriptTrack } from './track.js';

export const BUILTIN_TRACKS = [
  // ---- Chapitre 1 : Premiers tours ----------------------------------------------
  {
    id: 'eclats', name: 'Premiers Éclats', decor: 'desert', difficulty: 1,
    goal: {id: 'nowall'},
    script: 'start S2 RR S C S2 LL B S2 GU2 S GD2 S RR S U S2 D S C S RR S3 finish',
    medals: { cristal: 18.8, or: 20, argent: 23, bronze: 27 },
  },
  {
    id: 'lagon', name: 'Lagon Turquoise', decor: 'isles', difficulty: 1, shard: [0.5, 7],
    goal: {id: 'rings', n: 1},
    script: 'start B S2 R S L S2 C S2 UU GR2 DD S2 L S.o S R S2 RR S2 S.o C S2 LL S2 B S R L S2 finish',
    medals: { cristal: 23.5, or: 24.9, argent: 28.6, bronze: 33.6 },
  },
  {
    id: 'aurore', name: 'Aurore Naissante', decor: 'polar', difficulty: 1,
    goal: {id: 'norespawn'},
    script: 'start S B S2 O S C S RR S I2 S R S B S2 C S LL S2 B S BR S finish',
    medals: { cristal: 18, or: 19, argent: 21.8, bronze: 25.7 },
  },
  {
    id: 'lianes', name: 'Lianes Néon', decor: 'jungle', difficulty: 2, shard: [0.4, 7],
    goal: {id: 'turbo', n: 1},
    script: 'start B S2 R S L S R L S2 C S L S S S R S2.m R L S2 B S O S2 L S R S2 C S R S L S2 finish',
    medals: { cristal: 26.1, or: 27.9, argent: 32.1, bronze: 37.6 },
  },
  {
    id: 'neons', name: 'Néons Express', decor: 'city', difficulty: 2, shard: [0.6, 7],
    goal: {id: 'nowall'},
    script: 'start B S2 R S L S2# C S2 L S R S2 Y2.b S2 R L S2 B S2 BL S2 C S L S R S2 finish',
    medals: { cristal: 24.1, or: 25.6, argent: 29.5, bronze: 34.6 },
  },
  {
    id: 'braises', name: 'Braises', decor: 'volcano', difficulty: 2,
    goal: {id: 'perfect', n: 1},
    script: 'start S2 B S2 R S L S2 C S2 Y2.b S2 BR S U S2 D S2 C S2 UU G2 DD S2 LL S2 finish',
    medals: { cristal: 24.3, or: 25.5, argent: 29.3, bronze: 34.4 },
  },
  // ---- Chapitre 2 : Prise de vitesse --------------------------------------------
  {
    id: 'canyon', name: 'Canyon Corail', decor: 'desert', difficulty: 2,
    goal: {id: 'nowall'},
    script: 'start B S2 R S L S2 C S R R S2 L S B S3 BRR S C S L L S2 R S2 B S R S L S2 KL S2 B S3 finish',
    medals: { cristal: 27.6, or: 28.7, argent: 33, bronze: 38.8 },
  },
  {
    id: 'quai', name: 'Quai d’Amarrage', decor: 'orbit', difficulty: 2,
    goal: {id: 'rings', n: 1},
    script: 'start S2 B S2 S2 S2 R S2 UU GR2 DD S2 C S L S2 B S O S2 KL S2 R S2 finish',
    medals: { cristal: 21, or: 22, argent: 25.3, bronze: 29.7 },
  },
  {
    id: 'tremplins', name: 'Tremplins du Crépuscule', decor: 'desert', difficulty: 2,
    goal: {id: 'perfect', n: 2},
    script: 'start S B S2 UU GR2 DD S2 C S LL B S2 UU G2 S2 D2 RR S C S2 B S UU GC2 DD S2 finish',
    medals: { cristal: 19.4, or: 20.2, argent: 23.3, bronze: 27.3 },
  },
  {
    id: 'hyper', name: 'Hyperboucle', decor: 'city', difficulty: 3,
    goal: {id: 'norespawn'},
    script: 'start B S2 R S L S2 B S O S2 C S L S R S2 B S OL S2 BR S2 B S OB S2 C S2 L S R S2 finish',
    medals: { cristal: 29.8, or: 31.1, argent: 35.7, bronze: 41.9 },
  },
  {
    id: 'canopee', name: 'Canopée Suspendue', decor: 'jungle', difficulty: 3,
    goal: {id: 'turbo', n: 2},
    script: 'start B S2 R S L S2 B S O S2 R S S S L S B S OL S2 C S BL S R S2 B S2 L R S2 finish',
    medals: { cristal: 25.3, or: 26.6, argent: 30.6, bronze: 35.9 },
  },
  {
    id: 'spores', name: 'Spores Sauteuses', decor: 'jungle', difficulty: 3,
    goal: {id: 'perfect', n: 2},
    script: 'start B S2 L S R S2 B S.j G1 S2 R L C S2 RR S B S2 GU2 S GD2 S LL S R S L S2 B S.j G1 S2 C S2 R L S2 finish',
    medals: { cristal: 27.1, or: 28.8, argent: 33.1, bronze: 38.8 },
  },
  // ---- Chapitre 3 : Métamorphoses -----------------------------------------------
  {
    id: 'recif', name: 'Récif Corallien', decor: 'isles', difficulty: 3,
    goal: {id: 'vehicle', v: 'car'},
    script: 'start B S2 R S2 S.n S3.a R.a S2.a L.a S2.a S.n S2 C S L S BR S B S UU G2 DD S2 C S2 L R S2 finish',
    medals: { cristal: 25.3, or: 26.1, argent: 30.1, bronze: 35.3 },
  },
  {
    id: 'phare', name: 'Le Phare', decor: 'isles', difficulty: 3, shard: [0.45, -7],
    goal: {id: 'rings', n: 1},
    script: 'start B S2 R S L S2 C S2 S.e S2 UU GR7 DD S2 S.e S R S L S3_ B S2 C S2 RR S2 finish',
    medals: { cristal: 26, or: 27.2, argent: 31.3, bronze: 36.7 },
  },
  {
    id: 'serpent', name: 'Le Serpent', decor: 'jungle', difficulty: 3,
    goal: {id: 'vehicle', v: 'moto'},
    script: 'start B S2 R L R L S2 C S.o S2 R S L S2 B S O S2 C S L R L R S2 S.o S2 B S2 RR S2 LL S.o S2 finish',
    medals: { cristal: 27.4, or: 29.3, argent: 33.6, bronze: 39.5 },
  },
  {
    id: 'coulee', name: 'Coulée Ardente', decor: 'volcano', difficulty: 3,
    goal: {id: 'rings', n: 2},
    script: 'start B S2 R S L S2 C S S.e S UU GR6 DD S2 R S2 UU GR6 DD S.e S2 C S L S2 B S2 finish',
    medals: { cristal: 29.5, or: 30.6, argent: 35.2, bronze: 41.3 },
  },
  {
    id: 'navette', name: 'Navette', decor: 'orbit', difficulty: 3,
    goal: {id: 'vehicle', v: 'moto'},
    script: 'start S2 B S2 R S L S2 S.o S2 C S2 R S2 BR S2 S.o S S.e S2 UU G6 DD S S.e S2 C S L S2 S.o S2 finish',
    medals: { cristal: 29.5, or: 30.7, argent: 35.3, bronze: 41.4 },
  },
  {
    id: 'boulevard', name: 'Boulevard Sans Fin', decor: 'city', difficulty: 3,
    goal: {id: 'nowall'},
    script: 'start B S2 R S L S3_ R_ S_ L_ S2 C S S.n S4.a L.a S2.a R.a S.a S.n S2 B S2 BR S2_ KL S2 R S L S2 finish',
    medals: { cristal: 27.7, or: 28.8, argent: 33.1, bronze: 38.9 },
  },
  // ---- Chapitre 4 : Terrains piégés ---------------------------------------------
  {
    id: 'verglas', name: 'Lac Gelé', decor: 'desert', difficulty: 3,
    goal: {id: 'nowall'},
    script: 'start S B S I3 RR S C I2 L S R S I2 RR B S2 C S Y2.i S LL I2 S R S2 U S I2 D S L S2 B S finish',
    medals: { cristal: 29.9, or: 31.6, argent: 36.4, bronze: 42.7 },
  },
  {
    id: 'banquise', name: 'Banquise Rebondissante', decor: 'polar', difficulty: 3,
    goal: {id: 'perfect', n: 2},
    script: 'start S B S2 S.j G1 S2 C S RR S B S S.j G1 S2 LL S2.i C S2 B S S S S.j G1 S3_ R S2 finish',
    medals: { cristal: 19.4, or: 20.5, argent: 23.5, bronze: 27.6 },
  },
  {
    id: 'racines', name: 'Racines Boueuses', decor: 'jungle', difficulty: 3, shard: [0.55, -7],
    goal: {id: 'turbo', n: 2},
    script: 'start B S2 R S2.u L S R S.d L S2 C S R L S2.u S S R S L S2.w60 B S2 Y2.d S R S L S2 finish',
    medals: { cristal: 26.8, or: 28.6, argent: 32.8, bronze: 38.6 },
  },
  {
    id: 'glacier', name: 'Glacier Magnétique', decor: 'polar', difficulty: 4,
    goal: {id: 'norespawn'},
    script: 'start S B S U S.m D S C S R S3.s R S B S2 UU S.m DD.m S C S LL S2.m U S2 D S S S2 finish',
    medals: { cristal: 20.4, or: 21.4, argent: 24.7, bronze: 28.9 },
  },
  {
    id: 'metro', name: 'Métro Aérien', decor: 'city', difficulty: 4,
    goal: {id: 'nowall'},
    script: 'start B S2 U2 R# S# L# S2# C S2 R S L S2 D2 S R L S2# B S2# L S S S2 UU GC2 DD S2_ R S2 finish',
    medals: { cristal: 25, or: 26.3, argent: 30.3, bronze: 35.6 },
  },
  {
    id: 'basalte', name: 'Champs de Basalte', decor: 'volcano', difficulty: 4,
    goal: {id: 'norespawn'},
    script: 'start S2 B S2 R S2.s L S2.u C S2_ R_ S_ L S2.w150 S2 B S2 UU GR2 DD S2 KL S2.d R S2 B S.j G1 S2 L S2 finish',
    medals: { cristal: 26.7, or: 28.1, argent: 32.3, bronze: 37.9 },
  },
  // ---- Chapitre 5 : Haute voltige -----------------------------------------------
  {
    id: 'temple', name: 'Temple Perdu', decor: 'jungle', difficulty: 4,
    goal: {id: 'norespawn'},
    script: 'start B S2 R S L S2# R# S# L# S2 C S2 B S2 QU WA2 CR S2 R S L S2 D2 S2 C S TB S L S R S2 finish',
    medals: { cristal: 24.7, or: 25.9, argent: 29.8, bronze: 35 },
  },
  {
    id: 'tours', name: 'Tours Jumelles', decor: 'city', difficulty: 4,
    goal: {id: 'nowall'},
    script: 'start B S2 R S L S2 B S2 QU WA CR S2 C S R S L S2 D2 S CK S2 R S2 B S2 QU WA CR S2 C S2 R L S2 finish',
    medals: { cristal: 26.2, or: 27.5, argent: 31.7, bronze: 37.2 },
  },
  {
    id: 'ceinture', name: 'Ceinture d’Astéroïdes', decor: 'orbit', difficulty: 4,
    goal: {id: 'rings', n: 2},
    script: 'start S2 B S2 UU GC2 DD S2 R S2 TB S2 L S2 B S2 UU GR2 DD S2 C S CKL S2 BL S2 UU GR2 DD S2 finish',
    medals: { cristal: 25.2, or: 26.2, argent: 30.2, bronze: 35.4 },
  },
  {
    id: 'helice', name: 'Double Hélice', decor: 'polar', difficulty: 4,
    goal: {id: 'norespawn'},
    script: 'start S B S2 O S OL S C S RR S B S CK S2 L S2 C S R S3 CKL S LL B S2 O S finish',
    medals: { cristal: 27.7, or: 28.9, argent: 33.3, bronze: 39 },
  },
  {
    id: 'cheminee', name: 'Cheminée du Volcan', decor: 'volcano', difficulty: 4,
    goal: {id: 'perfect', n: 1},
    script: 'start S2 B S2 R S L S2 S2 S C S2 B S2 QU WA2 CR S2 R S2 TB S2 C S L S2 D2 S2 finish',
    medals: { cristal: 22.2, or: 23.1, argent: 26.6, bronze: 31.2 },
  },
  {
    id: 'vrille', name: 'Tourbillon Tropical', decor: 'isles', difficulty: 4,
    goal: {id: 'turbo', n: 1},
    script: 'start B S2 R S L S2 B S2 OB S C S2 CK S2 L S R S2 B S2 ODL S2 C S CKL S2 R L S2 finish',
    medals: { cristal: 30.8, or: 32.1, argent: 37, bronze: 43.4 },
  },
  // ---- Chapitre 6 : Grand huit --------------------------------------------------
  {
    id: 'grandtour', name: 'Le Grand Tour', decor: 'desert', difficulty: 4, laps: 2,
    goal: {id: 'norespawn'},
    script: 'start S2 B RR S2 C S3 BR S2 UU G2 DD S2 RR S2 B S2 RR S L R S1 finish',
    medals: { cristal: 38.3, or: 40.6, argent: 46.7, bronze: 54.9 },
  },
  {
    id: 'grandanneau', name: 'Grand Anneau', decor: 'orbit', difficulty: 4, laps: 3,
    goal: {id: 'turbo', n: 2},
    script: 'start S2 B BR S2 C S2 BR S2 TB S2 BR S5 BR S1 finish',
    medals: { cristal: 45.6, or: 47, argent: 54.1, bronze: 63.5 },
  },
  {
    id: 'lunaire', name: 'Sauts Lunaires', decor: 'isles', difficulty: 4,
    goal: {id: 'perfect', n: 2},
    script: 'start B S2 B S.g30 S2 UU G10 DD S2 C S.g100 S2 R S L S2 RR S B S2 S.e S2 UU G8 DD S S.e S2 C S2 L S R S2 finish',
    medals: { cristal: 35.1, or: 36.6, argent: 42.1, bronze: 49.4 },
  },
  {
    id: 'spirale', name: 'Spirale Prismatique', decor: 'desert', difficulty: 4,
    goal: {id: 'norespawn'},
    script: 'start S2 R S U S R S U R S3 C S R S GU2 R S2 R S B S5 BR S D3 S KR S2 B S2 finish',
    medals: { cristal: 26, or: 27.4, argent: 31.6, bronze: 37 },
  },
  {
    id: 'couronne', name: 'Couronne Boréale', decor: 'polar', difficulty: 5,
    goal: {id: 'nowall'},
    script: 'start S B S2 O S2 C S U2 RR S2 B S UU G2 DD S2 C S LL S B S.j G1 S2 R S2.m U S.m D.m S C S BLL S2 B S OL S2 R S2.i S L S2 B S2 finish',
    medals: { cristal: 37.9, or: 39.3, argent: 45.2, bronze: 53.1 },
  },
  {
    id: 'caldeira', name: 'Caldeira', decor: 'volcano', difficulty: 5, laps: 2,
    goal: {id: 'nowall'},
    script: 'start S2 B S2 RR S S.n S2.a RR.a S.a S.n S S C S2 RR S2 B S RR finish',
    medals: { cristal: 34.5, or: 36.2, argent: 41.6, bronze: 48.8 },
  },
  // ---- Chapitre 7 : Légendes ----------------------------------------------------
  {
    id: 'blizzard', name: 'Blizzard', decor: 'polar', difficulty: 5,
    goal: {id: 'norespawn'},
    script: 'start S2 B S I3 RR.i S C S2.s L S R S2 B S UU GR2 DD S C S LL S2 B S.j G1 S2 R.i S B S O S2 C S CK S2 B S3 finish',
    medals: { cristal: 32.4, or: 33.8, argent: 38.9, bronze: 45.6 },
  },
  {
    id: 'viaduc', name: 'Viaduc Vertical', decor: 'city', difficulty: 5,
    goal: {id: 'perfect', n: 1},
    script: 'start B S2 R S L S2 B S2 QU WA2 CR S2 C S2 B S OB S R S L D2 S2 B S OD S2 C S L R S2.g40 S2 S.g100 S2 finish',
    medals: { cristal: 31.7, or: 33, argent: 38, bronze: 44.6 },
  },
  {
    id: 'archipel', name: 'Grand Archipel', decor: 'isles', difficulty: 5, shard: [0.7, 7],
    goal: {id: 'vehicle', v: 'car'},
    script: 'start B S2 R S L S2 B S2 OL S2 C S S.n S3.a R.a S2.a S.n S2 RR_ S2.w170_ S C S2 B S2 UU G3 DD S2 R S L S2 B S OB S2 C S2 L R S2 finish',
    medals: { cristal: 38.8, or: 40.5, argent: 46.6, bronze: 54.7 },
  },
  {
    id: 'apesanteur', name: 'Apesanteur', decor: 'orbit', difficulty: 5,
    goal: {id: 'rings', n: 2},
    script: 'start S2 B S S.g40 S2 UU GR6 DD S2 S.g100 S2 C S2 TB S2 R S2 CK S2 L S2 S.e S UU GR7 DD S.e S2 C S2 S S2 finish',
    medals: { cristal: 33.4, or: 34.7, argent: 39.9, bronze: 46.8 },
  },
  {
    id: 'eruption', name: 'Éruption', decor: 'volcano', difficulty: 5,
    goal: {id: 'norespawn'},
    script: 'start S2 B S2 R S L S2 QU WA CR S2 C S2 OB S2 BL S2 S.n S2.a L.a S.a S.n S2 C S2 CKL S2 UU GR2 DD S2 Y2.b S2 finish',
    medals: { cristal: 36, or: 37.4, argent: 43, bronze: 50.5 },
  },
  {
    id: 'zenith', name: 'Station Zénith', decor: 'orbit', difficulty: 5, laps: 2,
    goal: {id: 'nowall'},
    script: 'start S2 B S4 BR S CK S2 C BR S2 S S2 UU GR2 DD BR S TB S3 BR finish',
    medals: { cristal: 40.7, or: 42, argent: 48.3, bronze: 56.7 },
  },
];

export function buildBuiltin(def) {
  const t = scriptTrack(def.name, def.script, { ...(def.opts || {}), decor: def.decor || 'desert' });
  t.author = 'Copytrack';
  // Circuit à plusieurs tours : le chemin du pilote automatique est répété.
  if (def.laps > 1) {
    t.laps = def.laps;
    const one = t.path.slice();
    for (let k = 1; k < def.laps; k++) t.path.push(...one.slice(1));
  }
  // Éclat secret (easter egg) : posé au bord de la route, à une fraction du parcours.
  if (def.shard && t.path && t.path.length > 10) {
    const i = Math.min(t.path.length - 2, Math.floor(t.path.length * def.shard[0]));
    const a = t.path[i], b = t.path[i + 1];
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const l = Math.hypot(dx, dz) || 1;
    t.addDeco({ k: 'shard', x: a[0] + (-dz / l) * def.shard[1], y: a[1], z: a[2] + (dx / l) * def.shard[1], ry: 0, s: 1, c: 0 });
  }
  return t;
}
