// Bateau v2 (Copytrack Evolution, E20) : flottabilité, vagues, courants. En service seulement avec les modèles v2 (règle vm = 2 ou profil
// Simulation) et sur l'eau ; sinon le bateau est celui de toujours.
//   - VAGUES : une houle de deux trains de vagues, fonction de la position et du chrono de la course (les mêmes pour tout le monde). Monter le
//     flanc d'une vague freine, le descendre relance ; une vague prise de travers pousse sur le côté ;
//   - FLOTTABILITÉ : la coque suit la houle (phys.heave, la hauteur de la vague sous elle, pour l'affichage) ; sur une crête qui monte vite, elle
//     s'allège et accroche moins ;
//   - COURANTS : l'eau d'une pièce coule le long de la pièce, dans le sens de sa rotation (vers le « haut » de la pièce dans l'éditeur).
// Déterministe : dsin, dcos de js/dmath.js.
import { dsin, dcos } from '../../dmath.js';
import { rotVec } from '../../pieces.js';

export const WAVE_A = 0.55;             // amplitude de la houle (m)
const K1 = 0.085, W1 = 1.6, K2 = 0.12, W2 = 1.15;
export const CURRENT = 2.6;             // accélération du courant (m/s²)
const SLOPE_K = 0.75;
const C = { x: 0, z: 0 };

export function waveAt(x, z, t) {
  return WAVE_A * (0.6 * dsin(x * K1 + t * W1) + 0.4 * dsin(z * K2 - t * W2 + x * 0.03));
}
// Un pas sur l'eau. fx, fz / rx, rz : axes avant et droite (horizontaux) de la coque. Renvoie { dvf, dvr, grip } (accélérations à ajouter × dt).
const OUT = { dvf: 0, dvr: 0, grip: 1 };
export function boat2Water(phys, tile, fx, fz, rx, rz, g, dt) {
  const p = phys.pos, t = phys.time;
  const sx = WAVE_A * 0.6 * K1 * dcos(p.x * K1 + t * W1) + WAVE_A * 0.4 * 0.03 * dcos(p.z * K2 - t * W2 + p.x * 0.03);
  const sz = WAVE_A * 0.4 * K2 * dcos(p.z * K2 - t * W2 + p.x * 0.03);
  const h = waveAt(p.x, p.z, t);
  const rise = (h - phys.heave) / dt;                    // vitesse de montée de la coque
  phys.heave = h;
  OUT.dvf = -g * SLOPE_K * (sx * fx + sz * fz) * dt;
  OUT.dvr = -g * SLOPE_K * (sx * rx + sz * rz) * dt;
  OUT.grip = rise > 0.4 ? Math.max(0.75, 1 - (rise - 0.4) * 0.12) : 1;
  if (tile) {
    rotVec(tile.r, 0, -1, C);
    OUT.dvf += CURRENT * (C.x * fx + C.z * fz) * dt;
    OUT.dvr += CURRENT * (C.x * rx + C.z * rz) * dt;
  }
  return OUT;
}
