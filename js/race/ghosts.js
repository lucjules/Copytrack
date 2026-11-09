// Fantômes : record personnel enregistré, fantômes simulés (or, importé), orientation et affichage.
// Ces méthodes s'ajoutent au prototype de RaceSession (voir race.js) : `this` est l'instance.
import * as THREE from '../vendor/three.module.min.js';
import { createCar } from '../carModel.js';
import { getRecord, getImportedGhost } from '../storage.js';
import { GhostRunner, newGhostPose } from '../replay.js';
import { PHYS_VER } from '../version.js';
import { parseGhost } from '../ghostFormat.js';
import { makeNameLabel } from '../remoteCar.js';
import { formatTime } from '../storage.js';
import { GHOST_EVERY, ghostVehicleAt, tmpM, tmpV, tmpV2 } from './shared.js';
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

  // Rivaux : fantômes du haut d'un classement en ligne (voir supabase/etape7-fantomes.sql), au format du record local. list : [{ name, time, ghost (base64), veh }].
  setRivals(list) {
    this._clearRivals();
    const COLORS = ['#ffd23e', '#ff5fd2', '#5ff2ff'];
    for (const r of (list || []).slice(0, 3)) {
      const g = parseGhost(r.ghost, r.veh);
      if (!g) continue;
      const car = createCar(null, { ghost: true, ghostColor: COLORS[this.rivals.length % COLORS.length] });
      const label = makeNameLabel(`${r.name} · ${formatTime(r.time)}`);
      if (label) car.group.add(label);
      car.group.visible = false;
      this.app.scene.add(car.group);
      this.rivals.push({ name: r.name, time: r.time, data: g.data, veh: g.veh, car, label, last: null });
    }
  },

  _clearRivals() {
    for (const r of this.rivals) { if (r.label) { r.label.userData.map.dispose(); r.label.removeFromParent(); } r.car.dispose(); }
    this.rivals = [];
  },

  // Dessine un fantôme enregistré (une pose tous les GHOST_EVERY pas) à l'instant de course du joueur : position et orientation interpolées, véhicule du moment.
  _drawRecorded(car, gd, vehData, alpha, dt, st) {
    const gc = car.group;
    const frames = gd.length / 7;
    const t = this.state === 'countdown' ? 0 : (this.logic.steps + alpha) / GHOST_EVERY - 1;
    const i = Math.max(0, Math.min(frames - 1, Math.floor(t)));
    const j = Math.min(frames - 1, i + 1);
    const f = Math.max(0, Math.min(1, t - i));
    const a = i * 7, b = j * 7;
    gc.visible = true;
    gc.position.set(gd[a] + (gd[b] - gd[a]) * f, gd[a + 1] + (gd[b + 1] - gd[a + 1]) * f, gd[a + 2] + (gd[b + 2] - gd[a + 2]) * f);
    st.qa.set(gd[a + 3], gd[a + 4], gd[a + 5], gd[a + 6]);
    st.qb.set(gd[b + 3], gd[b + 4], gd[b + 5], gd[b + 6]);
    gc.quaternion.slerpQuaternions(st.qa, st.qb, f);
    // Véhicule du fantôme à cette image (voiture, moto, bateau, deltaplane) : sans cela il restait une voiture quand le joueur se transformait.
    this._ghostVehicle(car, ghostVehicleAt(vehData, i), Math.abs(this.logic.steps - (st.last ?? this.logic.steps)) > 2);
    st.last = this.logic.steps;
    car.update(dt, performance.now() / 1000);
    // On masque le fantôme quand il est collé à la caméra / au joueur.
    gc.visible = gc.position.distanceToSquared(this.renderPos) > 4;
  },

  _renderRivals(alpha, dt = 0) {
    if (!this.rivals.length) return;
    const show = this.app.settings.ghost !== false && !this.demo;
    for (const r of this.rivals) {
      if (!show) { r.car.group.visible = false; continue; }
      this._drawRecorded(r.car, r.data, r.veh, alpha, dt, r.st || (r.st = { qa: new THREE.Quaternion(), qb: new THREE.Quaternion(), last: null }));
    }
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
  // Change le véhicule d'un fantôme avec la même animation que le joueur ; instantanément après un saut dans le temps (retour au checkpoint, redémarrage).
  _ghostVehicle(car, kind, jumped) {
    if (car.vehicle === kind && !car.anim) return;
    car.setVehicle(kind, jumped);
  },

  _renderSimGhosts(alpha, dt = 0) {
    const steps = this.logic.steps;
    const now = performance.now() / 1000;
    for (const g of this.ghosts) {
      const p = g.runner.poseAt(steps, g.pose);
      const show = this.state !== 'countdown' && !p.done;
      g.car.group.visible = show;
      if (!show) continue;
      this._ghostQuat(p, g.q);
      this._ghostQuat(g.runner.poseAt(Math.max(0, steps - 1), g.pose0), g.pq);
      g.car.group.position.set(p.prev.x + (p.pos.x - p.prev.x) * alpha, p.prev.y + (p.pos.y - p.prev.y) * alpha, p.prev.z + (p.pos.z - p.prev.z) * alpha);
      g.car.group.quaternion.slerpQuaternions(g.pq, g.q, alpha);
      this._ghostVehicle(g.car, p.vehicle, Math.abs(steps - (g.lastSteps ?? steps)) > 2);
      g.lastSteps = steps;
      g.car.update(dt, now);
      if (g.car.group.position.distanceToSquared(this.renderPos) < 4) g.car.group.visible = false;
    }
  },

  _renderGhost(alpha, dt = 0) {
    const gd = this.ghostData;
    const gc = this.ghostCar.group;
    if (!gd || !this.app.settings.ghost || this.demo) { gc.visible = false; return; }
    this._drawRecorded(this.ghostCar, gd, this.ghostVehData, alpha, dt, this._ownGhost || (this._ownGhost = { qa: new THREE.Quaternion(), qb: new THREE.Quaternion(), last: null }));
  },
};
