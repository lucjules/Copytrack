// Caméras du Replay Theater (en plus des caméras de course, de la TV et de l'orbite) : « Libre » (glisser pour tourner autour de la voiture,
// molette pour s'approcher) et « Cinématique » (plans qui s'enchaînent : poursuite basse, travelling latéral, grue, poste TV).
// Ces méthodes s'ajoutent au prototype de RaceSession (voir race.js) : `this` est l'instance. Visuel seulement.
import * as THREE from '../vendor/three.module.min.js';

const tmp = new THREE.Vector3();
const SHOT_S = 4.5;                      // durée d'un plan de la caméra cinématique (secondes de replay)

export const theaterCameraMethods = {
  // Caméra libre : l'angle et la distance viennent de la souris (theater/session.js : _theaterBindFree).
  _freeCamera(dt) {
    const cam = this.app.camera, car = this.car.group;
    const f = this._free || (this._free = { yaw: this.phys.yaw + Math.PI, pitch: 0.35, dist: 14 });
    cam.up.set(0, 1, 0);
    tmp.set(Math.sin(f.yaw) * Math.cos(f.pitch), Math.sin(f.pitch), Math.cos(f.yaw) * Math.cos(f.pitch)).multiplyScalar(f.dist).add(car.position);
    this.camPos.lerp(tmp, 1 - Math.exp(-dt * 12));
    cam.position.copy(this.camPos);
    cam.lookAt(car.position.x, car.position.y + 1, car.position.z);
    this._fov(60);
  },

  _cineCamera(dt) {
    const cam = this.app.camera, car = this.car.group, p = this.phys;
    const c = this._cine || (this._cine = { t: 0, shot: -1, side: 1, pos: new THREE.Vector3() });
    c.t += dt * (this.replaySpeed || 1);
    const shot = Math.floor(c.t / SHOT_S) % 4;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    if (shot !== c.shot) {           // nouveau plan : on coupe (pas de glissé d'un plan à l'autre)
      c.shot = shot; c.side = -c.side;
      if (shot === 3) c.pos.set(car.position.x + fx * 45 + fz * 18 * c.side, car.position.y + 7, car.position.z + fz * 45 - fx * 18 * c.side);
      this._camSnapCine = true;
    }
    cam.up.set(0, 1, 0);
    if (shot === 0) tmp.set(car.position.x - fx * 7, car.position.y + 1.3, car.position.z - fz * 7);             // poursuite basse
    else if (shot === 1) tmp.set(car.position.x + fz * 11 * c.side, car.position.y + 2.2, car.position.z - fx * 11 * c.side);   // travelling latéral
    else if (shot === 2) tmp.set(car.position.x - fx * 10, car.position.y + 26, car.position.z - fz * 10);       // grue
    else tmp.copy(c.pos);                                                                                     // poste fixe
    if (this._camSnapCine) { this.camPos.copy(tmp); this._camSnapCine = false; } else this.camPos.lerp(tmp, 1 - Math.exp(-dt * 6));
    cam.position.copy(this.camPos);
    cam.lookAt(car.position.x, car.position.y + 1, car.position.z);
    const d = this.camPos.distanceTo(car.position);
    this._fov(shot === 3 ? Math.max(20, Math.min(65, 1600 / Math.max(10, d))) : shot === 2 ? 55 : 68);
  },
};
