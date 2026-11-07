// Caméras de la course : poursuite, capot, TV et orbite des replays, coupures, champ de vision.
// Ces méthodes s'ajoutent au prototype de RaceSession (voir race.js) : `this` est l'instance.
import * as THREE from '../vendor/three.module.min.js';
import { frameWorld } from '../physics/ribbon.js';
import { REPLAY_CAMS, tmpV, tmpV2 } from './shared.js';
import { fovPunch, landingDip, feelScale } from '../feel.js';
const UP = new THREE.Vector3(0, 1, 0);

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export const cameraMethods = {
  cycleCamera() {
    this.camMode = (this.camMode + 1) % this.camList.length;
    this.app.settings.camera = this.camMode;
    this.app.saveSettings();
    this.app.ui.flash(`Caméra : ${this.camList[this.camMode].name}`);
  },

  // Réapparition ou recommencement : la caméra se remet d'office dans le bon sens, sans transition
  // (même si la voiture vient de mourir la tête en bas), à la bonne place et dans le bon cap.
  _camCut() {
    const p = this.phys;
    if (!this.camUp) this.camUp = new THREE.Vector3(0, 1, 0);
    this.camFlip.cut(p.gSign, this.camUp);
    this.camYaw = p.yaw;
    this._camSnap = true;               // la prochaine image pose la caméra sur sa cible au lieu de glisser vers elle
  },

  _camera(dt) {
    const cam = this.app.camera;
    const p = this.phys;
    const mode = this.camList[this.camMode];
    const car = this.car.group;
    this.shake = Math.max(0, this.shake - dt * 1.8);

    const rc = this.replay && this.replayCam >= this.camList.length ? REPLAY_CAMS[this.replayCam - this.camList.length] : null;
    if (rc && rc.free) { this._freeCamera(dt); return; }
    if (rc && rc.cine) { this._cineCamera(dt); return; }
    if (rc && rc.tv) {
      // Caméra TV : un poste fixe près de la route, qui change quand la voiture s'éloigne.
      if (!this.tvPos || this.tvPos.distanceTo(car.position) > 70) {
        const yaw = p.yaw;
        const ahead = 40 + Math.random() * 20, side = (Math.random() < 0.5 ? -1 : 1) * (16 + Math.random() * 10);
        this.tvPos = new THREE.Vector3(car.position.x - Math.sin(yaw) * ahead + Math.cos(yaw) * side, car.position.y + 6 + Math.random() * 8, car.position.z - Math.cos(yaw) * ahead - Math.sin(yaw) * side);
      }
      cam.up.set(0, 1, 0);
      cam.position.copy(this.tvPos);
      cam.lookAt(car.position.x, car.position.y + 1, car.position.z);
      const d = this.tvPos.distanceTo(car.position);
      this._fov(Math.max(18, Math.min(70, 1800 / Math.max(10, d))));
      return;
    }
    if (rc && rc.orbit) {
      this.camT += dt * 0.25;
      const r = 16;
      cam.up.set(0, 1, 0);
      cam.position.set(car.position.x + Math.cos(this.camT) * r, car.position.y + 6, car.position.z + Math.sin(this.camT) * r);
      cam.lookAt(car.position.x, car.position.y + 1, car.position.z);
      this._fov(60);
      return;
    }
    if (this.state === 'finished' && !this.demo) {
      // Orbite lente autour de la voiture
      this.camT += dt * 0.35;
      const r = 13;
      tmpV.set(car.position.x + Math.cos(this.camT) * r, car.position.y + 4.5, car.position.z + Math.sin(this.camT) * r);
      this.camPos.lerp(tmpV, 1 - Math.exp(-dt * 2));
      cam.up.set(0, 1, 0);
      cam.position.copy(this.camPos);
      cam.lookAt(car.position.x, car.position.y + 1, car.position.z);
      this._fov(mode.fov);
      return;
    }

    if (mode.hood) {
      tmpV.set(0, 1.45, -0.2).applyQuaternion(car.quaternion).add(car.position);
      cam.position.copy(tmpV);
      cam.quaternion.copy(car.quaternion);
      this.camPos.copy(tmpV);
      this.camYaw = p.yaw;
      this._fov(mode.fov + Math.min(16, Math.abs(p.fwdSpeed) * 0.2) + this._feelFov());
      return;
    }

    const sp = Math.abs(p.fwdSpeed);
    const camUp = this.camUp || (this.camUp = new THREE.Vector3(0, 1, 0));

    // Dans un looping : la caméra se cale derrière la voiture et tourne avec elle.
    if (p.mode === 'ribbon') {
      const up = this.up;
      this.camFlip.sync(p.gSign);      // dans un looping le haut vient de la route : pas de retournement à part
      this._camSnap = false;
      camUp.lerp(up, 1 - Math.exp(-dt * 6));
      if (camUp.lengthSq() < 1e-3) camUp.copy(up);
      camUp.normalize();
      tmpV.set(p.fwd.x, p.fwd.y, p.fwd.z);
      // La caméra suit la route elle-même, un peu en arrière sur le ruban et au-dessus de
      // la chaussée à cet endroit : elle ne traverse plus la piste dans un looping, un tube,
      // une vrille ou un virage relevé.
      const R = p.rib;
      const F = frameWorld(R.tile, R.rib, R.u, this._camF || (this._camF = {}));
      let ub = R.u - (R.dir * mode.dist) / Math.max(1, F.ds);
      let extra = 0;
      if (ub < 0) { extra = -ub * F.ds; ub = 0; } else if (ub > 1) { extra = (ub - 1) * F.ds; ub = 1; }
      const Fb = frameWorld(R.tile, R.rib, ub, this._camFb || (this._camFb = {}));
      p._cross({ dl: R.dl }, Fb);
      const target = tmpV2.set(
        Fb.qx + Fb.nx * mode.height - Fb.tx * R.dir * extra,
        Fb.qy + Fb.ny * mode.height - Fb.ty * R.dir * extra,
        Fb.qz + Fb.nz * mode.height - Fb.tz * R.dir * extra,
      );
      this.camPos.lerp(target, 1 - Math.exp(-dt * 14));
      cam.position.copy(this.camPos);
      cam.up.copy(camUp);
      tmpV2.copy(car.position).addScaledVector(tmpV, mode.look).addScaledVector(up, mode.lookUp);
      cam.lookAt(tmpV2);
      this.camYaw = p.yaw;
      this._fov(mode.fov + Math.min(18, sp * 0.24) + this._feelFov());
      return;
    }
    // En gravité inversée, la caméra se retourne : le « haut » est vers le bas du monde.
    const gs = p.gSign;
    const gUp = gs > 0 ? UP : (this._downV || (this._downV = new THREE.Vector3(0, -1, 0)));
    // Retournement : rotation du haut de la caméra autour de l'axe de visée en 0,45 s (voir camflip.js).
    tmpV.copy(car.position).sub(cam.position);
    if (tmpV.lengthSq() < 1e-6) tmpV.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)); else tmpV.normalize();
    if (!this.camFlip.update(dt, gs, tmpV, camUp)) {
      camUp.lerp(gUp, 1 - Math.exp(-dt * 4));         // sortie d'un looping : retour doux au haut du monde
      if (camUp.lengthSq() < 1e-3) camUp.copy(gUp);
      camUp.normalize();
    }
    cam.up.copy(camUp);

    // Caméra de poursuite : suit le cap, et un peu la trajectoire en dérapage.
    let target = p.yaw;
    const hv = Math.hypot(p.vel.x, p.vel.z);
    if (p.grounded && hv > 10 && p.fwdSpeed > 0) {
      target = lerpAngle(p.yaw, Math.atan2(-p.vel.x, -p.vel.z), 0.45);
    }
    this.camYaw = lerpAngle(this.camYaw, target, 1 - Math.exp(-dt * (p.grounded ? 5.5 : 2.5)));
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
    let dist = mode.dist + Math.min(2.5, sp * 0.03);
    let height = mode.height;

    // Sous un pont : on abaisse et on rapproche la caméra pour ne pas traverser la dalle.
    const carTop = car.position.y + 1.6;
    let ceil = Infinity;
    for (let i = 0; i <= 4 && gs > 0; i++) {
      const k = i / 4;
      const c = this.track.ceilingAt(car.position.x - fx * dist * k, car.position.z - fz * dist * k, carTop);
      if (c < ceil) ceil = c;
    }
    let underBridge = false;
    if (ceil < car.position.y + height + 1.2) {
      underBridge = true;
      height = Math.max(1.4, ceil - car.position.y - 0.9);
      dist = Math.min(dist, mode.dist * 0.75);
    }
    tmpV.set(car.position.x - fx * dist, car.position.y + height * gs, car.position.z - fz * dist);
    // Horizontal serré, vertical plus doux (sauf sous un pont : réaction immédiate).
    const kx = 1 - Math.exp(-dt * 12);
    const ky = 1 - Math.exp(-dt * (underBridge ? 20 : 6));
    if (this._camSnap) { this._camSnap = false; this.camPos.copy(tmpV); }   // coupure : pas de glissement
    else {
      this.camPos.x += (tmpV.x - this.camPos.x) * kx;
      this.camPos.z += (tmpV.z - this.camPos.z) * kx;
      this.camPos.y += (tmpV.y - this.camPos.y) * ky;
    }
    // Jamais dans une dalle ni sous la chaussée
    if (gs > 0) {
      const ceilCam = this.track.ceilingAt(this.camPos.x, this.camPos.z, carTop - 0.5);
      if (this.camPos.y > ceilCam - 0.5 && ceilCam > carTop - 0.5) this.camPos.y = ceilCam - 0.5;
      const s = this.track.surfaceAt(this.camPos.x, this.camPos.y, this.camPos.z, this._camS || (this._camS = {}), 2, null, p.time);
      if (this.camPos.y < s.h + 1.2) this.camPos.y = s.h + 1.2;
    } else {
      // Au plafond : jamais au-dessus de la chaussée retournée.
      const s = this.track.ceilingSurfaceAt(this.camPos.x, this.camPos.y, this.camPos.z, this._camS || (this._camS = {}), 2);
      if (Number.isFinite(s.h) && this.camPos.y > s.h - 1.2) this.camPos.y = s.h - 1.2;
    }
    cam.position.copy(this.camPos);
    cam.position.y -= landingDip(this._feel.dipI, this._feel.dipT, this._feelScale());     // tassement à la réception (feel.js)
    if (this.shake > 0) {
      const k = this.shake * 0.25 * (this.app.settings.shakeAmt ?? 1);
      cam.position.x += (Math.random() - 0.5) * k;
      cam.position.y += (Math.random() - 0.5) * k;
    }
    const lookUp = underBridge ? Math.min(mode.lookUp, 0.8) : mode.lookUp;
    cam.lookAt(car.position.x + fx * mode.look, car.position.y + lookUp * gs, car.position.z + fz * mode.look);
    this._fov(mode.fov + Math.min(18, sp * 0.24) + (p.boost > 0 ? 5 : 0) + this._feelFov());
  },

  _feelScale() { return feelScale(this.app.settings.feel); },
  _feelFov() { return fovPunch(this._feel.punchT, this._feelScale()); },

  _fov(target) {
    const cam = this.app.camera;
    target += this.app.settings.fovAdd || 0;
    const f = cam.fov + (target - cam.fov) * 0.1;
    if (Math.abs(f - cam.fov) > 0.01) {
      cam.fov = f;
      cam.updateProjectionMatrix();
    }
  },
};
