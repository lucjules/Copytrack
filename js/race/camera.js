// Caméras de la course : poursuite, capot, TV et orbite des replays, coupures, champ de vision.
// Ces méthodes s'ajoutent au prototype de RaceSession (voir race.js) : `this` est l'instance.
import * as THREE from '../vendor/three.module.min.js';
import { frameWorld } from '../physics/ribbon.js';
import { REPLAY_CAMS, tmpV, tmpV2 } from './shared.js';
import { fovPunch, landingDip, feelScale } from '../feel.js';
import { CamAssist, RIG, limitedAim } from '../camrig.js';
import { SLAB_T, DT } from '../constants.js';
const UP = new THREE.Vector3(0, 1, 0);
const camTmp = new THREE.Vector3(), camQ = new THREE.Quaternion();
// 0.13.1 : passage d'un régime de caméra à l'autre (looping, tube, mur ↔ poursuite) fondu sur ce temps, au lieu d'un à-coup.
export const CAM_BLEND_S = 0.35;
const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
// Secousse : bruit LISSE (somme de sinus) fonction du temps, pas un tirage à chaque image (qui tremblait d'autant plus qu'il y avait d'images).
export function shakeOffset(t, k) {
  return {
    x: k * 0.5 * (0.6 * Math.sin(t * 41.3) + 0.4 * Math.sin(t * 23.7 + 1.9)),
    y: k * 0.5 * (0.6 * Math.sin(t * 37.9 + 0.7) + 0.4 * Math.sin(t * 19.1 + 2.3)),
  };
}
const upTarget = new THREE.Vector3(), lookP = new THREE.Vector3(), AIM_A = { x: 0, y: 0, z: 0 }, AIM_B = { x: 0, y: 0, z: 0 }, AIM_O = { x: 0, y: 0, z: 0 };

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
    this._camB = null; this._camBlend = null;      // (0.13.1) plus d'interpolation depuis la pose d'avant la coupure : recalcul immédiat, même en pause
    this._rig().reset(p);                // anticipation, visée de réception, transition de ruban : repartent de zéro (camrig.js)
  },

  // Aides de caméra (js/camrig.js) : une par course, créée à la demande.
  _rig() { return this.camRig || (this.camRig = new CamAssist()); },

  // Caméra spéciale des replays (libre, cinématique, TV, orbite) ou replay fini : calculée à chaque image (elle ne suit pas la physique pas à pas).
  _camSpecial() {
    if (!this.replay) return false;
    if (this.state === 'finished') return true;
    return this.replayCam >= this.camList.length;
  },

  // 0.13.1 : la caméra de course est calculée à CHAQUE PAS DE PHYSIQUE (1/120 s), sur une caméra de travail et avec la voiture à sa position de ce pas,
  // puis l'affichage interpole entre les deux dernières poses (_cameraRender), comme la voiture. Avant, elle était calculée à chaque image à partir
  // de valeurs de la physique qui avancent par paliers (cap, vitesse, pente…) : sur un écran 120/144 Hz ou une image irrégulière (0, 1 ou 2 pas par
  // image), elle tremblait (à-coups de rotation 5 à 6 fois plus forts qu'à 60 images/s, docs/ANALYSE-FONCTIONNELLE.md, C1).
  _cameraTick() {
    if (this._camSpecial()) { this._camB = null; return; }
    const p = this.phys, real = this.app.camera;
    const sc = this._stepCam || (this._stepCam = real.clone());
    const car = this._camCar || (this._camCar = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() });
    car.position.set(p.pos.x, p.pos.y + (p.v2 && p.vehicle === 'boat' && p.heave ? p.heave : 0), p.pos.z);
    car.quaternion.copy(this.quat);
    const A = this._camA || (this._camA = { pos: new THREE.Vector3(), q: new THREE.Quaternion(), fov: 60 });
    let B = this._camB;
    if (B) { A.pos.copy(B.pos); A.q.copy(B.q); A.fov = B.fov; }
    else {
      // reprise après une période calculée à l'image (décompte, pause au départ, changement de caméra de replay) : on part de la caméra affichée
      A.pos.copy(real.position); A.q.copy(real.quaternion); A.fov = real.fov;
      sc.position.copy(real.position); sc.quaternion.copy(real.quaternion); sc.up.copy(real.up); sc.fov = real.fov; sc.aspect = real.aspect; sc.updateProjectionMatrix();
    }
    const snap = !!this._camSnap;
    this._camera(DT, sc, car);
    B = this._camB = this._camBkeep || (this._camBkeep = { pos: new THREE.Vector3(), q: new THREE.Quaternion(), fov: 60 });
    B.pos.copy(sc.position); B.q.copy(sc.quaternion); B.fov = sc.fov;
    const rib = p.mode === 'ribbon';
    if (!snap && this._camRib !== undefined && rib !== this._camRib) this._camBlend = { t: 0, rel: A.pos.clone().sub(car.position), q: A.q.clone() };
    this._camRib = rib;
    const bl = this._camBlend;
    if (bl && !snap) {
      bl.t += DT;
      const k = smooth01(bl.t / CAM_BLEND_S);
      camTmp.copy(car.position).add(bl.rel);
      B.pos.lerpVectors(camTmp, B.pos, k);
      camQ.copy(B.q); B.q.slerpQuaternions(bl.q, camQ, k);
      if (bl.t >= CAM_BLEND_S) this._camBlend = null;
    }
    if (snap) { A.pos.copy(B.pos); A.q.copy(B.q); A.fov = B.fov; this._camBlend = null; }      // coupure (départ, retour au checkpoint) : pas de glissé depuis l'ancienne place
  },

  // À chaque image : pose interpolée entre les deux derniers pas (ou caméra calculée à l'image si elle est spéciale), puis secousse douce.
  _cameraRender(dt, alpha) {
    const cam = this.app.camera;
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const stepped = this._camB && !this._camSpecial() && (this.state === 'racing' || this.state === 'paused' || this.state === 'finished');
    if (stepped) {
      const A = this._camA, B = this._camB, a = Math.max(0, Math.min(1, alpha));
      cam.position.lerpVectors(A.pos, B.pos, a);
      cam.quaternion.slerpQuaternions(A.q, B.q, a);
      cam.up.copy(this._stepCam.up);
      const f = A.fov + (B.fov - A.fov) * a;
      if (Math.abs(f - cam.fov) > 1e-3) { cam.fov = f; cam.updateProjectionMatrix(); }
    } else { this._camB = null; this._camera(dt); }
    if (this.shake > 0) {
      const k = this.app.motionOff ? 0 : this.shake * 0.25 * (this.app.settings.shakeAmt ?? 1);      // animations réduites (a11y.js) : pas de tremblement
      if (k > 0) { const o = shakeOffset(performance.now() / 1000, k); cam.position.x += o.x; cam.position.y += o.y; }
    }
  },

  _camera(dt, cam = this.app.camera, car = this.car.group) {
    const p = this.phys;
    const mode = this.camList[this.camMode];

    const rc = this.replay && this.replayCam >= this.camList.length ? REPLAY_CAMS[this.replayCam - this.camList.length] : null;
    if (rc && rc.free) { this._freeCamera(dt); return; }
    if (rc && rc.cine) { this._cineCamera(dt); return; }
    if (rc && rc.tv) {
      // Caméra TV : un poste fixe près de la route, qui change quand la voiture s'éloigne.
      if (!this.tvPos || this.tvPos.distanceTo(car.position) > 70) {
        const yaw = p.yaw;
        const ahead = 40 + Math.random() * 20, side = (Math.random() < 0.5 ? -1 : 1) * (16 + Math.random() * 10);
        // (gravité inversée : le poste est SOUS la route retournée, du côté de la voiture ; au-dessus, la dalle la cachait)
        this.tvPos = new THREE.Vector3(car.position.x - Math.sin(yaw) * ahead + Math.cos(yaw) * side, car.position.y + (6 + Math.random() * 8) * (p.gSign < 0 ? -1 : 1), car.position.z - Math.cos(yaw) * ahead - Math.sin(yaw) * side);
      }
      cam.up.set(0, 1, 0);
      cam.position.copy(this.tvPos);
      cam.lookAt(car.position.x, car.position.y + 1, car.position.z);
      const d = this.tvPos.distanceTo(car.position);
      this._fov(Math.max(18, Math.min(70, 1800 / Math.max(10, d))), cam, dt);
      return;
    }
    if (rc && rc.orbit) {
      this.camT += dt * 0.25;
      const r = 16, og = p.gSign < 0 ? -1 : 1;      // au plafond, l'orbite passe sous la route retournée, tête en bas comme la voiture
      cam.up.set(0, og, 0);
      cam.position.set(car.position.x + Math.cos(this.camT) * r, car.position.y + 6 * og, car.position.z + Math.sin(this.camT) * r);
      cam.lookAt(car.position.x, car.position.y + og, car.position.z);
      this._fov(60, cam, dt);
      return;
    }
    if (this.state === 'finished' && !this.demo) {
      // Orbite lente autour de la voiture
      // Arrivée franchie en gravité inversée (voiture au plafond) : avant 0.9.59 la caméra d'arrivée se plaçait 4,5 m AU-DESSUS de la voiture, donc de l'autre côté de
      // la route retournée : on ne voyait que le dos de la dalle. Elle tourne maintenant du côté de la voiture, tête en bas comme elle.
      this.camT += dt * 0.35;
      const r = 13, fg = p.gSign < 0 ? -1 : 1;
      tmpV.set(car.position.x + Math.cos(this.camT) * r, car.position.y + 4.5 * fg, car.position.z + Math.sin(this.camT) * r);
      this.camPos.lerp(tmpV, 1 - Math.exp(-dt * 2));
      cam.up.set(0, fg, 0);
      cam.position.copy(this.camPos);
      cam.lookAt(car.position.x, car.position.y + fg, car.position.z);
      this._fov(mode.fov, cam, dt);
      return;
    }

    if (mode.hood) {
      tmpV.set(0, 1.45, -0.2).applyQuaternion(car.quaternion).add(car.position);
      cam.position.copy(tmpV);
      cam.quaternion.copy(car.quaternion);
      this.camPos.copy(tmpV);
      this.camYaw = p.yaw;
      this._fov(mode.fov + Math.min(16, Math.abs(p.fwdSpeed) * 0.2) + this._feelFov(), cam, dt);
      return;
    }

    const sp = Math.abs(p.fwdSpeed);
    const camUp = this.camUp || (this.camUp = new THREE.Vector3(0, 1, 0));
    const A = this._rig().update(dt, p, this.track, this._feelScale());      // lecture seule de la physique : rien ici ne touche à la course

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
      this._fov(mode.fov + Math.min(RIG.fovMax, sp * RIG.fovK) + this._feelFov(), cam, dt);
      return;
    }
    // En gravité inversée, la caméra se retourne : le « haut » est vers le bas du monde.
    const gs = p.gSign;
    const gUp = gs > 0 ? UP : (this._downV || (this._downV = new THREE.Vector3(0, -1, 0)));
    // Retournement : rotation du haut de la caméra autour de l'axe de visée en 0,45 s (voir camflip.js).
    tmpV.copy(car.position).sub(cam.position);
    if (tmpV.lengthSq() < 1e-6) tmpV.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)); else tmpV.normalize();
    if (!this.camFlip.update(dt, gs, tmpV, camUp)) {
      // Sortie d'un ruban (mur, looping, vrille) : la caméra accompagne d'abord la voiture, qui se redresse seule, puis rejoint le haut du monde (camrig.js).
      // Sinon : retour doux au haut du monde.
      if (A.exiting) { upTarget.copy(this.up).lerp(gUp, A.upMix); if (upTarget.lengthSq() < 1e-4) upTarget.copy(gUp); upTarget.normalize(); } else upTarget.copy(gUp);
      camUp.lerp(upTarget, 1 - Math.exp(-dt * A.upRate));
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
    target += A.lead;                                 // anticipation : la caméra regarde un peu plus loin dans le virage (camrig.js)
    this.camYaw = lerpAngle(this.camYaw, target, 1 - Math.exp(-dt * (p.grounded ? 5.5 : 2.5)));
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
    let dist = mode.dist + Math.min(RIG.pullMax, sp * RIG.pullK);
    let height = mode.height * A.heightK;

    // Sous un pont : on abaisse et on rapproche la caméra pour ne pas traverser la dalle.
    const carTop = car.position.y + 1.6;
    let ceil = Infinity;
    for (let i = 0; i <= 4 && gs > 0; i++) {
      const k = i / 4;
      const c = this.track.ceilingAt(car.position.x - fx * dist * k, car.position.z - fz * dist * k, carTop);
      if (c < ceil) ceil = c;
    }
    // 0.13.1 : l'entrée et la sortie d'un dessous de pont sont fondues (facteur 0 → 1 en ≈ 0,2 s) au lieu d'un tout ou rien ; la caméra ne traverse
    // toujours pas la dalle (plafond de sécurité plus bas).
    const bridgeT = ceil < car.position.y + height + 1.2 ? 1 : 0;
    const kb = this._bridgeK = (this._bridgeK || 0) + (bridgeT - (this._bridgeK || 0)) * (1 - Math.exp(-dt * 10));
    if (kb > 0.001 && Number.isFinite(ceil)) {
      height += (Math.max(1.4, ceil - car.position.y - 0.9) - height) * Math.max(kb, bridgeT);
      dist += (Math.min(dist, mode.dist * 0.75) - dist) * kb;
    } else if (kb > 0.001) dist += (Math.min(dist, mode.dist * 0.75) - dist) * kb;
    const underBridge = kb > 0.5;
    tmpV.set(car.position.x - fx * dist + A.vx * A.comp, car.position.y + height * gs, car.position.z - fz * dist + A.vz * A.comp);      // (+ compensation du retard de suivi horizontal : la caméra garde sa distance à haute vitesse)
    // Horizontal serré, vertical plus doux (sauf sous un pont : réaction immédiate).
    const kx = 1 - Math.exp(-dt * 12);
    const ky = 1 - Math.exp(-dt * (6 + 14 * kb));
    // 0.13.1 : le plancher (1,2 m au-dessus du sol sous la caméra) s'applique à la CIBLE : la caméra monte d'avance au lieu d'être remontée d'un coup.
    if (gs > 0) { const st = this.track.surfaceAt(tmpV.x, tmpV.y, tmpV.z, this._camT || (this._camT = {}), 2, null, p.time); if (Number.isFinite(st.h) && tmpV.y < st.h + 1.2) tmpV.y = st.h + 1.2; }
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
      // remontée douce sous le plancher (avant : posée d'un coup dessus, pics de 5 000 à 29 000 m/s²) ; jamais à moins de 0,6 m du sol
      if (this.camPos.y < s.h + 1.2) { this.camPos.y += (s.h + 1.2 - this.camPos.y) * (1 - Math.exp(-dt * 18)); if (this.camPos.y < s.h + 0.6) this.camPos.y = s.h + 0.6; }
    } else {
      // Au plafond : jamais au-dessus de la chaussée retournée.
      const s = this.track.ceilingSurfaceAt(this.camPos.x, this.camPos.y, this.camPos.z, this._camS || (this._camS = {}), 2);
      if (Number.isFinite(s.h) && this.camPos.y > s.h - 1.2) this.camPos.y = s.h - 1.2;
      // 0.12.2 : gravité inversée au-dessus d'une route ordinaire (plaque d'inversion) : la caméra passe sous la voiture et entrait dans la dalle
      // de la route d'en dessous (on voyait à travers). Elle reste du côté de la voiture, au-dessus de la chaussée.
      const f = this.track.surfaceAt(this.camPos.x, this.camPos.y + SLAB_T + 0.6, this.camPos.z, this._camF || (this._camF = {}), SLAB_T + 1.2, null, p.time);
      if (f.tile && car.position.y > f.h && this.camPos.y < f.h + 0.6 && this.camPos.y > f.h - SLAB_T - 0.3) this.camPos.y = f.h + 0.6;
    }
    cam.position.copy(this.camPos);
    cam.position.y -= landingDip(this._feel.dipI, this._feel.dipT, this._feelScale());     // tassement à la réception (feel.js)
    const lookUp = underBridge ? Math.min(mode.lookUp, 0.8) : mode.lookUp;
    lookP.set(car.position.x + fx * mode.look, car.position.y + lookUp * gs + A.slope * mode.look, car.position.z + fz * mode.look);      // (la visée suit la pente de la route)
    if (A.aimW > 0 && !underBridge) {
      // Pendant un saut : la visée glisse vers la zone de réception prédite, sans jamais s'écarter de plus de ≈ 11° de la visée normale (la voiture reste dans le champ).
      const dBase = Math.max(8, cam.position.distanceTo(lookP));
      AIM_A.x = (lookP.x - cam.position.x) / dBase; AIM_A.y = (lookP.y - cam.position.y) / dBase; AIM_A.z = (lookP.z - cam.position.z) / dBase;
      const dx = A.aim.x - cam.position.x, dy = A.aim.y - cam.position.y, dz = A.aim.z - cam.position.z, dl = Math.hypot(dx, dy, dz) || 1;
      AIM_B.x = dx / dl; AIM_B.y = dy / dl; AIM_B.z = dz / dl;
      limitedAim(AIM_A, AIM_B, A.aimW, RIG.aimShiftMax, AIM_O);
      lookP.set(cam.position.x + AIM_O.x * dBase, cam.position.y + AIM_O.y * dBase, cam.position.z + AIM_O.z * dBase);
    }
    cam.lookAt(lookP);
    this._fov(mode.fov + Math.min(RIG.fovMax, sp * RIG.fovK) + (p.boost > 0 ? 5 : 0) + this._feelFov(), cam, dt);
  },

  _feelScale() { return this.app.motionOff ? 0 : feelScale(this.app.settings.feel); },      // animations réduites : aucun effet de caméra ajouté
  _feelFov() { return fovPunch(this._feel.punchT, this._feelScale()); },

  // (0.13.1 : rattrapage selon le temps écoulé, et non 10 % par image : même vitesse à 60 et à 144 images/s)
  _fov(target, cam = this.app.camera, dt = 1 / 60) {
    target += this.app.settings.fovAdd || 0;
    const f = cam.fov + (target - cam.fov) * (1 - Math.exp(-dt * 6.3));
    if (Math.abs(f - cam.fov) > 0.01) {
      cam.fov = f;
      cam.updateProjectionMatrix();
    }
  },
};
