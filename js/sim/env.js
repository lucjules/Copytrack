// Environnements déterministes (Copytrack Evolution, E19) : PLUIE (la piste glisse un peu partout, des flaques glissent beaucoup), GIVRE (des plaques de
// verglas), RAFALES (le vent souffle par à-coups), et des conditions qui VARIENT au fil de la course (la pluie forcit et faiblit). Tout est tiré d'une
// GRAINE et du chrono de la course (en pas) : même graine = mêmes flaques au même endroit, mêmes rafales au même instant, pour tout le monde, dans les
// fantômes, les replays et la vérification serveur (ce module est dans sa fermeture : entiers et js/dmath.js seulement, aucune horloge, aucun hasard).
// Additif : sans pluie, ni givre, ni rafales, envOf renvoie null et la physique ne fait aucune opération de plus (empreinte inchangée).
//
// Règles du circuit (track.js, table RULES) : rain, frost, gust (0 à 100 %), envSeed (0 à 999), envVary (booléen). Les rafales soufflent dans la
// direction du vent du circuit (windDir), même sans vent de base.
import { dsin, dcos } from '../dmath.js';
import { CAR } from '../physics/specs.js';
import { PIECES, tileCenter, baseY } from '../pieces.js';
import { CELL, ROAD_HALF, DT } from '../constants.js';
import { WIND_MAX } from './params.js';

export const PUDDLE_GRIP = 0.5;        // dans une flaque, sous une pluie à 100 % : moitié moins d'adhérence
export const RAIN_GRIP = 0.15;         // pluie à 100 % : 15 % d'adhérence en moins partout
export const FROST_GRIP = 0.35;        // sur une plaque de givre : 35 % de l'adhérence
const PATCH_RATE = 0.4;                // à 100 %, 40 % des lignes droites plates ont une flaque (ou une plaque)

// Hachage entier (même résultat partout) -> [0, 1).
function h01(seed, a, b, c, salt) {
  let x = Math.imul(seed + 0x9e37, 0x85ebca6b) ^ Math.imul(a + 7, 0xc2b2ae35) ^ Math.imul(b + 13, 0x27d4eb2f) ^ Math.imul(c + 101, 0x165667b1) ^ Math.imul(salt + 1, 0x9e3779b1);
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; x = Math.imul(x, 0x297a2d39); x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}
const cellKey = (cx, cz) => ((cx + 4096) << 13) | (cz + 4096);

// Les plaques (flaques, givre) : sur les lignes droites plates d'une case, en route ordinaire (sans revêtement spécial), au sol (ni mur, ni
// plafond), immobiles, une au plus par pièce.
function patchesOf(track, rain, frost, seed) {
  const cells = new Map(), list = [];
  for (const t of track.tiles) {
    const P = PIECES[t.t];
    if (!P || P.kind !== 'line' || P.rise || P.size !== 1 || t.o || t.v || t.s || t.mv) continue;      // route ordinaire, fixe, au sol
    for (const [kind, amount, salt] of [['puddle', rain, 1], ['frost', frost, 2]]) {
      if (!amount || h01(seed, t.x, t.z, t.l, salt) >= (amount / 100) * PATCH_RATE) continue;
      const c = tileCenter(t), along = (h01(seed, t.x, t.z, t.l, salt + 10) - 0.5) * (CELL - 12), side = (h01(seed, t.x, t.z, t.l, salt + 20) - 0.5) * (ROAD_HALF * 2 - 7);
      const r = 2.6 + h01(seed, t.x, t.z, t.l, salt + 30) * 2.4;
      const alongX = t.r % 2 === 1;                                  // pièce tournée d'un quart : elle va selon x
      const p = { kind, x: c.x + (alongX ? along : side), z: c.z + (alongX ? side : along), y: baseY(t), r, r2: r * r };
      list.push(p);
      const k = cellKey(t.x, t.z);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(p);
      break;                                                          // une plaque par pièce (la flaque a la priorité)
    }
  }
  return { cells, list };
}

export function envOf(track) {
  const rain = (track && track.rain) | 0, frost = (track && track.frost) | 0, gust = (track && track.gust) | 0;
  if (!rain && !frost && !gust) return null;
  const seed = (track.envSeed | 0) || 0, vary = !!track.envVary;
  const { cells, list } = patchesOf(track, rain, frost, seed);
  const ph1 = h01(seed, 1, 2, 3, 40) * 6.283, ph2 = h01(seed, 4, 5, 6, 41) * 6.283, ph3 = h01(seed, 7, 8, 9, 42) * 6.283;
  const a = ((track.windDir || 0) * Math.PI) / 180, gk = (gust / 100) * CAR.wind * WIND_MAX * 1.6, gx = dsin(a), gz = -dcos(a);
  const out = { x: 0, z: 0 };
  return Object.freeze({
    rain, frost, gust, vary, seed, patches: list,
    // Intensité de la pluie (0 à 1) au pas `step` : constante, ou qui forcit et faiblit (période d'environ deux minutes) si les conditions varient.
    rainAt(step) { return rain ? (rain / 100) * (vary ? 0.55 + 0.45 * dsin(step * DT * 0.05 + ph3) : 1) : 0; },
    // Multiplicateur d'adhérence au sol, à la position (x, y, z) de la voiture, au pas `step`.
    gripAt(x, y, z, step) {
      let k = 1;
      const w = this.rainAt(step);
      if (w) k *= 1 - RAIN_GRIP * w;
      const ps = cells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
      if (ps) {
        for (const p of ps) {
          const dx = x - p.x, dz = z - p.z, dy = y - p.y;
          if (dx * dx + dz * dz < p.r2 && dy < 2.5 && dy > -2.5) k *= p.kind === 'frost' ? FROST_GRIP : 1 - PUDDLE_GRIP * w;
        }
      }
      return k;
    },
    // Dans quelle plaque est la voiture ? (effets : éclaboussures, crissement) ; null sinon.
    patchAt(x, y, z) {
      const ps = cells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
      if (ps) for (const p of ps) { const dx = x - p.x, dz = z - p.z, dy = y - p.y; if (dx * dx + dz * dz < p.r2 && dy < 2.5 && dy > -2.5) return p; }
      return null;
    },
    // Rafale au pas `step` : accélération dans le monde (m/s²), dans la direction du vent du circuit ; jamais à contre-sens.
    gustAt(step) {
      if (!gust) { out.x = 0; out.z = 0; return out; }
      const t = step * DT, s = 0.6 * dsin(t * 0.9 + ph1) + 0.4 * dsin(t * 2.3 + ph2), k = s > 0 ? s * gk : 0;
      out.x = gx * k; out.z = gz * k;
      return out;
    },
  });
}
