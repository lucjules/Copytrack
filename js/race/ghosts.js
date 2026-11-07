// Fantômes : record personnel enregistré, fantômes simulés (or, importé), orientation et affichage.
// Ces méthodes s'ajoutent au prototype de RaceSession (voir race.js) : `this` est l'instance.
import * as THREE from '../vendor/three.module.min.js';
import { createCar } from '../carModel.js';
import { getRecord, getImportedGhost } from '../storage.js';
import { GhostRunner, newGhostPose } from '../replay.js';
import { PHYS_VER } from '../version.js';
import { GHOST_EVERY, tmpM, tmpV, tmpV2 } from './shared.js';
const tmpV3 = new THREE.Vector3();

export const ghostMethods = {
  _setupGhosts() {
    const app = this.app, s = app.settings;
    const add = (runner, color, label) => {
      const car = createCar(null, { ghost: true, ghostColor: color });
      car.group.visible = false;
      app.scene.add(car.group);
      this.ghosts.push({ runner, car, label, q: new THREE.Quaternion(), pq: new THREE.Quaternion(), pose: newGhostPose(), pose0: newGhostPose() });
    };
    const rec = this.trackKey ? getRecord(this.trackKey) : null;
    const goldNotYet = this.medals && (!rec || rec.time > this.medals.or + 1e-6);
    if (s.ghostGold !== false && this.track.path && goldNotYet) add(new GhostRunner(this.track, { bot: true, latK: 0.8 }), '#ffd23e', 'Or');
    const imp = this.trackKey && s.ghostImported !== false ? getImportedGhost(this.trackKey) : null;
    if (imp && imp.v === PHYS_VER) add(new GhostRunner(this.track, { inputs: imp.inputs }), '#c77dff', imp.name);
  },

  // Orientation d'une voiture fantôme d'après sa pose (même règle que la voiture du joueur : le haut suit la normale au sol, sinon le ciel).
  _ghostQuat(p, q) {
    const up = tmpV.set(p.n.x, p.n.y, p.n.z);
    if (!p.grounded) up.set(0, 1, 0);
    const f = tmpV2.set(p.fwd.x, p.fwd.y, p.fwd.z);
    f.addScaledVector(up, -f.dot(up));
    if (f.lengthSq() < 1e-6) f.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    f.normalize();
    const right = tmpV3.crossVectors(f, up).normalize();
    tmpM.makeBasis(right, up, f.negate());
    return q.setFromRotationMatrix(tmpM);
  },

  // Fantômes simulés (or, importé) : la pose vient de l'historique du fantôme au pas de course du joueur (voir GhostRunner.poseAt).
  _renderSimGhosts(alpha) {
    const steps = this.logic.steps;
    for (const g of this.ghosts) {
      const p = g.runner.poseAt(steps, g.pose);
      const show = this.state !== 'countdown' && !p.done;
      g.car.group.visible = show;
      if (!show) continue;
      this._ghostQuat(p, g.q);
      this._ghostQuat(g.runner.poseAt(Math.max(0, steps - 1), g.pose0), g.pq);
      g.car.group.position.set(p.prev.x + (p.pos.x - p.prev.x) * alpha, p.prev.y + (p.pos.y - p.prev.y) * alpha, p.prev.z + (p.pos.z - p.prev.z) * alpha);
      g.car.group.quaternion.slerpQuaternions(g.pq, g.q, alpha);
      if (g.car.vehicle !== p.vehicle) g.car.setVehicle(p.vehicle, true);
      if (g.car.group.position.distanceToSquared(this.renderPos) < 4) g.car.group.visible = false;
    }
  },

  _renderGhost(alpha) {
    const gd = this.ghostData;
    const gc = this.ghostCar.group;
    if (!gd || !this.app.settings.ghost || this.demo) { gc.visible = false; return; }
    const frames = gd.length / 7;
    const t = this.state === 'countdown' ? 0 : (this.logic.steps + alpha) / GHOST_EVERY - 1;
    const i = Math.max(0, Math.min(frames - 1, Math.floor(t)));
    const j = Math.min(frames - 1, i + 1);
    const f = Math.max(0, Math.min(1, t - i));
    const a = i * 7, b = j * 7;
    gc.visible = true;
    gc.position.set(gd[a] + (gd[b] - gd[a]) * f, gd[a + 1] + (gd[b + 1] - gd[a + 1]) * f, gd[a + 2] + (gd[b + 2] - gd[a + 2]) * f);
    const qa = new THREE.Quaternion(gd[a + 3], gd[a + 4], gd[a + 5], gd[a + 6]);
    const qb = new THREE.Quaternion(gd[b + 3], gd[b + 4], gd[b + 5], gd[b + 6]);
    gc.quaternion.slerpQuaternions(qa, qb, f);
    // On masque le fantôme quand il est collé à la caméra / au joueur.
    gc.visible = gc.position.distanceToSquared(this.renderPos) > 4;
  },
};
