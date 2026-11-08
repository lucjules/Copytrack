// Deltaplane v2 (Copytrack Evolution, E20) : courants aériens et altitude. En service seulement avec les modèles v2 (règle vm = 2 ou profil
// Simulation) et en vol ; sinon le deltaplane est celui de toujours.
//   - ASCENDANCES : des colonnes d'air chaud, tirées d'un hachage entier des cases (les mêmes pour tout le monde, graine des conditions du
//     circuit) : sous THERMAL_TOP mètres, elles poussent vers le haut, d'autant plus fort qu'on est près de leur axe ;
//   - ALTITUDE : l'air se raréfie, la portance baisse au-dessus de ALT0 (jusqu'à ALT_MIN_K de sa valeur) : on ne monte pas indéfiniment ;
//   - VENT : le vent et les rafales du circuit portent l'aile en vol (au sol, ils poussent déjà la voiture).
// Déterministe : entiers, + − × ÷, √.
import { CELL, LEVEL_H } from '../../constants.js';

export const THERMAL_RATE = 0.1;        // part des cases (de 2 × 2) qui ont une ascendance
export const THERMAL_ACC = 7;           // poussée sur l'axe (m/s²)
export const THERMAL_R = 14;            // rayon (m)
export const THERMAL_TOP = 26 * LEVEL_H;
export const ALT0 = 18 * LEVEL_H, ALT_SPAN = 40 * LEVEL_H, ALT_MIN_K = 0.45;
const BIG = CELL * 2;

function hash01(seed, a, b, salt) {
  let x = Math.imul(seed + 0x2545, 0x9e3779b1) ^ Math.imul(a + 3, 0x85ebca6b) ^ Math.imul(b + 5, 0xc2b2ae35) ^ Math.imul(salt + 11, 0x27d4eb2f);
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; x = Math.imul(x, 0x297a2d39); x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}
// L'ascendance de la grande case (cx, cz), ou null.
export function thermalOf(seed, cx, cz) {
  if (hash01(seed, cx, cz, 1) >= THERMAL_RATE) return null;
  return { x: (cx + 0.25 + hash01(seed, cx, cz, 2) * 0.5) * BIG, z: (cz + 0.25 + hash01(seed, cx, cz, 3) * 0.5) * BIG };
}
// Poussée verticale (m/s²) à la position (x, y, z).
export function thermalLift(seed, x, y, z) {
  if (y > THERMAL_TOP) return 0;
  const cx = Math.floor(x / BIG), cz = Math.floor(z / BIG);
  let a = 0;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const th = thermalOf(seed, cx + i, cz + j);
      if (!th) continue;
      const dx = x - th.x, dz = z - th.z, d2 = dx * dx + dz * dz;
      if (d2 < THERMAL_R * THERMAL_R) a += THERMAL_ACC * (1 - Math.sqrt(d2) / THERMAL_R);
    }
  }
  return a * (1 - (y / THERMAL_TOP) * 0.5);
}
// Facteur de portance selon l'altitude.
export function altitudeK(y) {
  if (y <= ALT0) return 1;
  return Math.max(ALT_MIN_K, 1 - ((y - ALT0) / ALT_SPAN) * (1 - ALT_MIN_K));
}
