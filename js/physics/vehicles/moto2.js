// Moto v2 (Copytrack Evolution, E20) : inclinaison, transfert de masse, roue arrière, freins avant et arrière. En service seulement avec les
// modèles v2 (règle vm = 2 ou profil Simulation, physics/profiles.js) ; sinon la moto est celle de toujours (aucune de ces lignes ne s'exécute).
//   - INCLINAISON : la moto penche selon l'accélération latérale (angle visé = atan(a / g), au plus MAX_LEAN), avec un temps de bascule. Changer
//     de cap plus vite qu'elle ne bascule coûte de l'adhérence (la moto n'est pas encore sur l'angle) ;
//   - TRANSFERT DE MASSE : au freinage la charge passe sur la roue avant (l'avant accroche, l'arrière se déleste et glisse) ; à l'accélération
//     sur la roue arrière (à basse vitesse et plein gaz, l'avant se lève : la direction ne répond presque plus, comme sur la roue arrière) ;
//   - FREINS : le frein (avant surtout) perd de son efficacité sur l'angle, et pris en virage il fait décrocher l'arrière (frein arrière : la
//     glisse existante de la moto, plus marquée car l'arrière est délesté).
// Déterministe : + − × ÷, clamp et datan de js/dmath.js.
import { datan } from '../../dmath.js';
import { clamp } from '../../mathutil.js';

export const MAX_LEAN = 0.95;           // inclinaison maxi (rad, ≈ 54°)
export const LEAN_RATE = 2.4;           // vitesse de bascule (rad/s)
const LAG_COST = 0.3;                   // adhérence perdue quand la moto n'est pas sur l'angle (au plus)
const TRANSFER = 0.35;                  // part de la décélération (en g) qui passe sur l'avant
const WHEELIE_SPEED = 14;               // en dessous (m/s), plein gaz lève l'avant

// Un pas au sol : met à jour l'inclinaison et la répartition des charges (phys.v2F, phys.v2R, lues par _tires). Renvoie le multiplicateur d'adhérence.
export function moto2Ground(phys, inp, vf, g, dt) {
  const latA = phys.omega * vf;
  const target = clamp(datan(latA / Math.max(1, g)), -MAX_LEAN, MAX_LEAN);
  const step = LEAN_RATE * dt;
  phys.lean += clamp(target - phys.lean, -step, step);
  const lag = Math.abs(target - phys.lean);
  let grip = 1 - LAG_COST * clamp(lag / 0.5, 0, 1);
  const leanK = Math.abs(phys.lean) / MAX_LEAN;
  if (inp.brake && vf > 2) grip *= 1 - 0.22 * leanK;                     // freiner sur l'angle : l'avant mord moins
  // Transfert de masse d'après l'accélération du pas précédent (phys.mAx, m/s²) : > 0 vers l'avant.
  let tr = clamp((-phys.mAx / Math.max(1, g)) * TRANSFER, -0.25, 0.3);
  if (inp.throttle && !inp.brake && vf > 0 && vf < WHEELIE_SPEED && phys.mAx > 3) tr = Math.min(tr, -0.22);      // roue arrière
  phys.v2F = clamp(1 + 2.2 * tr, 0.35, 1.6);
  phys.v2R = clamp(1 - 1.7 * tr, 0.45, 1.5);
  return grip;
}
// En l'air (ou sur un autre véhicule) : la moto se redresse, les charges s'équilibrent.
export function moto2Idle(phys, dt) {
  phys.lean -= clamp(phys.lean, -LEAN_RATE * dt, LEAN_RATE * dt);
  phys.v2F = 1; phys.v2R = 1;
}
