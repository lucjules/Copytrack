// Circuits intégrés (créations originales), décrits avec le constructeur "tortue".
// Les temps de médailles sont en secondes.
import { scriptTrack } from './track.js';

export const BUILTIN_TRACKS = [
  {
    id: 'eclats',
    name: 'Premiers Éclats',
    difficulty: 1,
    script: 'start S2 RR S C S2 LL B S3 RR S U S2 D S C S RR S3 finish',
    medals: { cristal: 15.1, or: 16.3, argent: 18.7, bronze: 22 },
  },
  {
    id: 'canyon',
    name: 'Canyon Corail',
    difficulty: 2,
    script: 'start B S2 R S L S2 C S R R S2 L S B S3 RR C S L L S2 R S2 B S R S L S2 C S LL S3 finish',
    medals: { cristal: 25.6, or: 27.1, argent: 31.1, bronze: 36.5 },
  },
  {
    id: 'tremplins',
    name: 'Tremplins du Crépuscule',
    difficulty: 2,
    script: 'start S B S2 UU G2 DD S2 C S LL B S2 UU G2 S2 D2 RR S C S2 B S UU G3 DD S2 finish',
    medals: { cristal: 17.7, or: 18.6, argent: 21.4, bronze: 25.1 },
  },
  {
    id: 'spirale',
    name: 'Spirale Prismatique',
    difficulty: 3,
    script: 'start S2 R S U S R S U R S3 C S R S U S2 R S B S5 R D3 S C S R S2 B S2 finish',
    opts: { z: 2 },
    medals: { cristal: 21.7, or: 23.1, argent: 26.6, bronze: 31.2 },
  },
  {
    id: 'verglas',
    name: 'Lac Gelé',
    difficulty: 3,
    script: 'start S B S I3 RR S C I2 L S R S I2 RR B S2 C S LL I2 S R S2 U S I2 D S L S2 B S finish',
    medals: { cristal: 23, or: 24.5, argent: 28.2, bronze: 33.1 },
  },
  {
    id: 'grandtour',
    name: 'Le Grand Tour',
    difficulty: 4,
    script: 'start S2 B S U2 RR S C S2 L S D S R B S2 UU G2 DD S C RR I2 S LL S B S3 U R S2 C L S2 D S R S B S2 finish',
    medals: { cristal: 26.9, or: 28.4, argent: 32.7, bronze: 38.3 },
  },
];

export function buildBuiltin(def) {
  const t = scriptTrack(def.name, def.script, def.opts || {});
  t.author = 'Shardway';
  return t;
}
