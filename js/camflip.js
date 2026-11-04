// Retournement de la caméra quand la gravité s'inverse (plaque d'inversion).
//
// Le « haut » de la caméra tourne autour de l'axe de visée d'un angle qui va de 0 à l'angle voulu (le demi-tour)
// en FLIP_DURATION secondes. C'est une rotation axe-angle (un quaternion), pas un lerp de vecteurs : deux « haut »
// opposés n'ont pas de plus court chemin, et le lerp passait par le vecteur nul. Avec l'axe de visée, le demi-tour
// est défini, sans à-coup ni blocage de cardan. (lookAt ne garde du « haut » que la part perpendiculaire à la visée :
// travailler dans ce plan donne exactement la même caméra qu'avec le haut du monde.)
import * as THREE from './vendor/three.module.min.js';

export const FLIP_DURATION = 0.45;   // s (au plus 0,5)

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();

// Part de v perpendiculaire à l'axe, normalisée (null si v est colinéaire à l'axe).
function perp(v, axis, out) {
  out.copy(v).addScaledVector(axis, -v.dot(axis));
  const l = out.length();
  if (l < 1e-4) return null;
  return out.multiplyScalar(1 / l);
}

export class CamFlip {
  constructor() {
    this.sign = 1;                         // sens de gravité pour lequel la caméra est orientée
    this.t = 1;                            // avancement de la transition (1 = terminée)
    this.from = new THREE.Vector3(0, 1, 0);
    this.angle = 0;
  }

  get active() { return this.t < 1; }

  // Coupure franche (réapparition, recommencement) : orientation immédiate, sans transition.
  cut(gravitySign, up) {
    this.sign = gravitySign < 0 ? -1 : 1;
    this.t = 1;
    up.set(0, this.sign, 0);
  }

  // Suit le sens de gravité sans animer (dans un looping, le haut vient de la route elle-même).
  sync(gravitySign) {
    this.sign = gravitySign < 0 ? -1 : 1;
    this.t = 1;
  }

  // À appeler à chaque image. up : « haut » courant de la caméra (modifié) ; axis : direction de visée (unitaire).
  // Renvoie true tant que la transition est en cours.
  update(dt, gravitySign, axis, up) {
    const gs = gravitySign < 0 ? -1 : 1;
    if (gs !== this.sign) {
      this.sign = gs;
      this.from.copy(up).normalize();
      const pa = perp(this.from, axis, a), pb = perp(b.set(0, gs, 0), axis, c);
      if (!pa || !pb) this.angle = Math.PI;
      else {
        // Angle signé du haut actuel vers le haut visé, autour de la visée.
        this.angle = Math.atan2(b.crossVectors(pa, pb).dot(axis), pa.dot(pb));
        if (Math.abs(this.angle) > Math.PI - 0.05) this.angle = Math.PI;   // demi-tour : sens fixé une fois pour toutes
      }
      this.t = 0;
    }
    if (this.t >= 1) return false;
    this.t = Math.min(1, this.t + dt / FLIP_DURATION);
    if (this.t >= 1) { up.set(0, gs, 0); return false; }
    const k = this.t * this.t * (3 - 2 * this.t);                           // smoothstep : départ et arrivée doux
    const pf = perp(this.from, axis, a) || a.set(0, 1, 0);
    up.copy(pf).applyAxisAngle(axis, this.angle * k);
    return true;
  }
}
