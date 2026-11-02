// Circuits intégrés (créations originales), décrits avec le constructeur "tortue"
// (voir scriptTrack dans track.js). Les temps de médailles sont en secondes.
import { scriptTrack } from './track.js';

export const BUILTIN_TRACKS = [
  {
    id: 'eclats',
    name: 'Premiers Éclats',
    difficulty: 1,
    script: 'start S2 RR S C S2 LL B S3 RR S U S2 D S C S RR S3 finish',
    medals: { cristal: 16.6, or: 17.6, argent: 20.2, bronze: 23.8 },
  },
  {
    id: 'canyon',
    name: 'Canyon Corail',
    difficulty: 2,
    script: 'start B S2 R S L S2 C S R R S2 L S B S3 RR C S L L S2 R S2 B S R S L S2 C S LL S3 finish',
    medals: { cristal: 27.1, or: 28.3, argent: 32.5, bronze: 38.2 },
  },
  {
    id: 'tremplins',
    name: 'Tremplins du Crépuscule',
    difficulty: 2,
    script: 'start S B S2 UU G2 DD S2 C S LL B S2 UU G2 S2 D2 RR S C S2 B S UU G3 DD S2 finish',
    medals: { cristal: 19.8, or: 20.7, argent: 23.8, bronze: 28 },
  },
  {
    id: 'spirale',
    name: 'Spirale Prismatique',
    difficulty: 3,
    script: 'start S2 R S U S R S U R S3 C S R S U S2 R S B S5 R D3 S C S R S2 B S2 finish',
    opts: { z: 2 },
    medals: { cristal: 23.8, or: 25.2, argent: 29, bronze: 34 },
  },
  {
    id: 'verglas',
    name: 'Lac Gelé',
    difficulty: 3,
    script: 'start S B S I3 RR S C I2 L S R S I2 RR B S2 C S LL I2 S R S2 U S I2 D S L S2 B S finish',
    medals: { cristal: 25.3, or: 26.6, argent: 30.6, bronze: 35.9 },
  },
  {
    id: 'grandtour',
    name: 'Le Grand Tour',
    difficulty: 4,
    script: 'start S2 B S U2 RR S C S2 L S D S R B S2 UU G2 DD S C RR I2 S LL S B S3 U R S2 C L S2 D S R S B S2 finish',
    medals: { cristal: 29.7, or: 31.7, argent: 36.4, bronze: 42.8 },
  },
  // ---- Nuit polaire (v1.1) -------------------------------------------------
  {
    id: 'aurore',
    name: 'Aurore Naissante',
    decor: 'polar',
    difficulty: 2,
    script: 'start S B S2 O S C S RR S I2 S R S B S O S2 C S LL S2 B S RR S finish',
    medals: { cristal: 21.2, or: 22.4, argent: 25.8, bronze: 30.2 },
  },
  {
    id: 'banquise',
    name: 'Banquise Rebondissante',
    decor: 'polar',
    difficulty: 3,
    script: 'start S B S2 S.j G1 S2 C S RR S B S S.j G1 S2 LL S2.i C S2 B S S.j G1 S3 finish',
    medals: { cristal: 16.8, or: 17.7, argent: 20.3, bronze: 23.9 },
  },
  {
    id: 'glacier',
    name: 'Glacier Magnétique',
    decor: 'polar',
    difficulty: 3,
    script: 'start S B S U S.m D S C S R S3.s R S B S2 UU S.m DD.m S C S LL S2.m U S2 D S2 finish',
    medals: { cristal: 19.1, or: 20.1, argent: 23.1, bronze: 27.1 },
  },
  {
    id: 'helice',
    name: 'Double Hélice',
    decor: 'polar',
    difficulty: 4,
    script: 'start S B S2 O S OL S C S RR S B S U2 R S2 R S2 C S R S3 D2 S RR B S2 O S finish',
    medals: { cristal: 27.2, or: 28.6, argent: 32.9, bronze: 38.6 },
  },
  {
    id: 'blizzard',
    name: 'Blizzard',
    decor: 'polar',
    difficulty: 4,
    script: 'start S2 B S I3 RR.i S C S2.s L S R S2 B S UU G2 DD S C S LL S2 B S.j G1 S2 R.i S B S O S2 C S RR S2 B S3 finish',
    medals: { cristal: 32.1, or: 33.6, argent: 38.6, bronze: 45.3 },
  },
  {
    id: 'couronne',
    name: 'Couronne Boréale',
    decor: 'polar',
    difficulty: 5,
    script: 'start S B S2 O S2 C S U2 RR S2 B S UU G2 DD S2 C S LL S B S.j G1 S2 R S2.m U S.m D.m S C S RR S2 B S OL S2 R S2.i S L S2 B S2 finish',
    medals: { cristal: 36.4, or: 38, argent: 43.7, bronze: 51.3 },
  },
  // ---- v1.2 : nouveaux décors (6 circuits chacun) ---------------------------
  {
    id: 'lianes', name: 'Lianes Néon', decor: 'jungle', difficulty: 2, shard: [0.4, 7],
    script: 'start B S2 R S L S R L S2 C S L S R S2.m R L S2 B S O S2 L S R S2 C S R S L S2 finish', medals: { cristal: 25, or: 26.7, argent: 30.7, bronze: 36 },
  },
  {
    id: 'spores', name: 'Spores Sauteuses', decor: 'jungle', difficulty: 3,
    script: 'start B S2 L S R S2 B S.j G1 S2 R L C S2 RR S B S2 LL S R S L S2 B S.j G1 S2 C S2 R L S2 finish', medals: { cristal: 24.6, or: 26.2, argent: 30.1, bronze: 35.3 },
  },
  {
    id: 'canopee', name: 'Canopée Suspendue', decor: 'jungle', difficulty: 3,
    script: 'start B S2 R S L S2 B S O S2 R S L S B S OL S2 C S L S R S2 B S2 L R S2 finish', medals: { cristal: 23.8, or: 25, argent: 28.8, bronze: 33.8 },
  },
  {
    id: 'racines', name: 'Racines Boueuses', decor: 'jungle', difficulty: 2, shard: [0.55, -7],
    script: 'start B S2 R S2.u L S R S.d L S2 C S R L S2.u R S L S2 B S2 R S L S2 finish', medals: { cristal: 21.2, or: 22.4, argent: 25.8, bronze: 30.3 },
  },
  {
    id: 'temple', name: 'Temple Perdu', decor: 'jungle', difficulty: 4,
    script: 'start B S2 R S L S2# R# S# L# S2 C S2 B S2 QU WA2 CR S2 R S L S2 D2 S2 C S L S R S2 finish', medals: { cristal: 23.1, or: 24.3, argent: 27.9, bronze: 32.8 },
  },
  {
    id: 'serpent', name: 'Le Serpent', decor: 'jungle', difficulty: 5,
    script: 'start B S2 R L R L S2 C S.o S2 R S L S2 B S OD S2 C S L R L R S2 S.o S2 B S2 RR S2 LL S2 finish', medals: { cristal: 29.1, or: 31, argent: 35.6, bronze: 41.8 },
  },
  {
    id: 'neons', name: 'Néons Express', decor: 'city', difficulty: 2, shard: [0.6, 7],
    script: 'start B S2 R S L S2# C S2 L S R S2.o S2 R L S2 B S2 OB S2 C S L S R S.o S2 finish', medals: { cristal: 24.3, or: 25.6, argent: 29.5, bronze: 34.6 },
  },
  {
    id: 'boulevard', name: 'Boulevard Sans Fin', decor: 'city', difficulty: 3,
    script: 'start B S2 R S L S3_ R_ S_ L_ S2.w170 C S2 L S R S2 B S2 R L S2_ C S2 R S L S2 finish', medals: { cristal: 22, or: 23.4, argent: 26.9, bronze: 31.6 },
  },
  {
    id: 'tours', name: 'Tours Jumelles', decor: 'city', difficulty: 4,
    script: 'start B S2 R S L S2 B S2 QU WA CR S2 C S R S L S2 D2 S L S R S2 B S2 QU WA CR S2 C S2 R L S2 finish', medals: { cristal: 24.8, or: 26.1, argent: 30, bronze: 35.2 },
  },
  {
    id: 'metro', name: 'Métro Aérien', decor: 'city', difficulty: 3,
    script: 'start B S2 U2 R# S# L# S2# C S2 R S L S2 D2 S R L S2# B S2# L S R S2 C S2 finish', medals: { cristal: 21, or: 22.2, argent: 25.5, bronze: 29.9 },
  },
  {
    id: 'viaduc', name: 'Viaduc Vertical', decor: 'city', difficulty: 5,
    script: 'start B S2 R S L S2 B S2 QU WA2 CR S2 C S2 B S OB S R S L D2 S2 B S OD S2 C S L R S2.g40 S2 S.g100 S2 finish', medals: { cristal: 31.4, or: 32.8, argent: 37.8, bronze: 44.3 },
  },
  {
    id: 'hyper', name: 'Hyperboucle', decor: 'city', difficulty: 4,
    script: 'start B S2 R S L S2 B S O S2 C S L S R S2 B S OL S2 R L S2 B S OB S2 C S2 L S R S2 finish', medals: { cristal: 30, or: 31.5, argent: 36.2, bronze: 42.5 },
  },
  {
    id: 'lagon', name: 'Lagon Turquoise', decor: 'isles', difficulty: 2, shard: [0.5, 7],
    script: 'start B S2 R S L S2 C S.o S2 L S R S2 RR S2 C S2 LL S2 S.o S2 R L S2 finish', medals: { cristal: 20.6, or: 21.9, argent: 25.2, bronze: 29.6 },
  },
  {
    id: 'recif', name: 'Récif Corallien', decor: 'isles', difficulty: 3,
    script: 'start B S2 R S2.s L S2 B S UU G2 DD S2 C S L S R S2.s RR S B S2 UU G2 DD S2 C S2 L R S2 finish', medals: { cristal: 24.9, or: 26.1, argent: 30, bronze: 35.3 },
  },
  {
    id: 'phare', name: 'Le Phare', decor: 'isles', difficulty: 3, shard: [0.45, -7],
    script: 'start B S2 R S L S2_ C S2.w40 S2 R S L S3_ B S2 L S R S2.w160 C S2 RR_ S2_ finish', medals: { cristal: 19.9, or: 21, argent: 24.1, bronze: 28.3 },
  },
  {
    id: 'lunaire', name: 'Sauts Lunaires', decor: 'isles', difficulty: 4,
    script: 'start B S2 B S.g30 S2 UU G10 DD S2 C S.g100 S2 R S L S2 RR S B S2 S.g30 S2 UU G8 DD S3 C S.g100 S2 L S R S2 finish', medals: { cristal: 31.9, or: 33.4, argent: 38.4, bronze: 45 },
  },
  {
    id: 'vrille', name: 'Tourbillon Tropical', decor: 'isles', difficulty: 4,
    script: 'start B S2 R S L S2 B S2 OB S C S2 L S R S2 B S2 ODL S2 C S R L S2 finish', medals: { cristal: 25.5, or: 26.7, argent: 30.7, bronze: 36.1 },
  },
  {
    id: 'archipel', name: 'Grand Archipel', decor: 'isles', difficulty: 5, shard: [0.7, 7],
    script: 'start B S2 R S L S2 B S2 OL S2 C S2.o S3 RR_ S2.w170_ S C S2 B S2 UU G3 DD S2.o S2 R S L S2 B S OB S2 C S2 L R S2 finish', medals: { cristal: 35.2, or: 36.9, argent: 42.4, bronze: 49.8 },
  },
];

export function buildBuiltin(def) {
  const t = scriptTrack(def.name, def.script, { ...(def.opts || {}), decor: def.decor || 'desert' });
  t.author = 'Shardway';
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
