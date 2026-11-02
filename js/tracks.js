// Circuits intégrés (créations originales), décrits avec le constructeur "tortue"
// (voir scriptTrack dans track.js). Les temps de médailles sont en secondes.
import { scriptTrack } from './track.js';

export const BUILTIN_TRACKS = [
  {
    id: 'eclats',
    name: 'Premiers Éclats',
    difficulty: 1,
    script: 'start S2 RR S C S2 LL B S3 RR S U S2 D S C S RR S3 finish',
    medals: { cristal: 15.8, or: 17, argent: 19.6, bronze: 23 },
  },
  {
    id: 'canyon',
    name: 'Canyon Corail',
    difficulty: 2,
    script: 'start B S2 R S L S2 C S R R S2 L S B S3 RR C S L L S2 R S2 B S R S L S2 C S LL S3 finish',
    medals: { cristal: 25.5, or: 27.1, argent: 31.1, bronze: 36.6 },
  },
  {
    id: 'tremplins',
    name: 'Tremplins du Crépuscule',
    difficulty: 2,
    script: 'start S B S2 UU G2 DD S2 C S LL B S2 UU G2 S2 D2 RR S C S2 B S UU G3 DD S2 finish',
    medals: { cristal: 19.4, or: 20.4, argent: 23.5, bronze: 27.6 },
  },
  {
    id: 'spirale',
    name: 'Spirale Prismatique',
    difficulty: 3,
    script: 'start S2 R S U S R S U R S3 C S R S U S2 R S B S5 R D3 S C S R S2 B S2 finish',
    opts: { z: 2 },
    medals: { cristal: 22.6, or: 24.1, argent: 27.7, bronze: 32.5 },
  },
  {
    id: 'verglas',
    name: 'Lac Gelé',
    difficulty: 3,
    script: 'start S B S I3 RR S C I2 L S R S I2 RR B S2 C S LL I2 S R S2 U S I2 D S L S2 B S finish',
    medals: { cristal: 23.7, or: 25.5, argent: 29.3, bronze: 34.4 },
  },
  {
    id: 'grandtour',
    name: 'Le Grand Tour',
    difficulty: 4,
    script: 'start S2 B S U2 RR S C S2 L S D S R B S2 UU G2 DD S C RR I2 S LL S B S3 U R S2 C L S2 D S R S B S2 finish',
    medals: { cristal: 28.1, or: 29.9, argent: 34.4, bronze: 40.4 },
  },
  // ---- Nuit polaire (v1.1) -------------------------------------------------
  {
    id: 'aurore',
    name: 'Aurore Naissante',
    decor: 'polar',
    difficulty: 2,
    script: 'start S B S2 O S C S RR S I2 S R S B S O S2 C S LL S2 B S RR S finish',
    medals: { cristal: 20.5, or: 21.8, argent: 25.1, bronze: 29.4 },
  },
  {
    id: 'banquise',
    name: 'Banquise Rebondissante',
    decor: 'polar',
    difficulty: 3,
    script: 'start S B S2 S.j G1 S2 C S RR S B S S.j G1 S2 LL S2.i C S2 B S S.j G1 S3 finish',
    medals: { cristal: 16.3, or: 17.3, argent: 19.9, bronze: 23.4 },
  },
  {
    id: 'glacier',
    name: 'Glacier Magnétique',
    decor: 'polar',
    difficulty: 3,
    script: 'start S B S U S.m D S C S R S3.s R S B S2 UU S.m DD.m S C S LL S2.m U S2 D S2 finish',
    medals: { cristal: 18.5, or: 19.6, argent: 22.5, bronze: 26.5 },
  },
  {
    id: 'helice',
    name: 'Double Hélice',
    decor: 'polar',
    difficulty: 4,
    script: 'start S B S2 O S OL S C S RR S B S U2 R S2 R S2 C S R S3 D2 S RR B S2 O S finish',
    medals: { cristal: 26.3, or: 27.8, argent: 31.9, bronze: 37.5 },
  },
  {
    id: 'blizzard',
    name: 'Blizzard',
    decor: 'polar',
    difficulty: 4,
    script: 'start S2 B S I3 RR.i S C S2.s L S R S2 B S UU G2 DD S C S LL S2 B S.j G1 S2 R.i S B S O S2 C S RR S2 B S3 finish',
    medals: { cristal: 30, or: 31.7, argent: 36.5, bronze: 42.8 },
  },
  {
    id: 'couronne',
    name: 'Couronne Boréale',
    decor: 'polar',
    difficulty: 5,
    script: 'start S B S2 O S2 C S U2 RR S2 B S UU G2 DD S2 C S LL S B S.j G1 S2 R S2.m U S.m D.m S C S RR S2 B S OL S2 R S2.i S L S2 B S2 finish',
    medals: { cristal: 35, or: 36.9, argent: 42.5, bronze: 49.8 },
  },
];

export function buildBuiltin(def) {
  const t = scriptTrack(def.name, def.script, { ...(def.opts || {}), decor: def.decor || 'desert' });
  t.author = 'Shardway';
  return t;
}
