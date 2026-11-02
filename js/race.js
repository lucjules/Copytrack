// Session de course : boucle à pas fixe, caméra, fantôme, HUD, effets.
import * as THREE from './vendor/three.module.min.js';
import { DT } from './constants.js';
import { CarPhysics } from './physics.js';
import { RaceLogic } from './raceLogic.js';
import { Autopilot } from './autopilot.js';
import { TrackView } from './trackMesh.js';
import { createCar } from './carModel.js';
import { getRecord, saveRecord, encodeFloats, decodeFloats, formatTime } from './storage.js';
import { profile, rewardCoins, addCoins, saveProfile } from './profile.js';
import { SURFACES } from './pieces.js';

const GHOST_EVERY = 4; // un échantillon tous les 4 pas (30 Hz)
const CAM_MODES = [
  { name: 'Poursuite', dist: 9.5, height: 3.7, look: 5, lookUp: 1.3, fov: 66 },
  { name: 'Proche', dist: 6.2, height: 2.3, look: 7, lookUp: 1.0, fov: 70 },
  { name: 'Capot', hood: true, fov: 76 },
];
export const MEDALS = [
  { id: 'cristal', label: 'Cristal' },
  { id: 'or', label: 'Or' },
  { id: 'argent', label: 'Argent' },
  { id: 'bronze', label: 'Bronze' },
];

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpM = new THREE.Matrix4();

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function medalFor(time, medals) {
  if (!medals || time == null) return null;
  for (const m of MEDALS) if (time <= medals[m.id] + 1e-6) return m;
  return null;
}

export class RaceSession {
  constructor(app, track, opts = {}) {
    this.app = app;
    this.track = track;
    this.opts = opts;
    this.demo = !!opts.demo;
    this.trackKey = opts.trackKey;
    this.medals = opts.medals || null;

    this.view = new TrackView(track, app.materials);
    app.scenery.trackGroup.add(this.view.group);
    app.scenery.setTrack(track, opts.seed || this.trackKey || track.name);

    this.phys = new CarPhysics(track);
    this.logic = new RaceLogic(track);
    this.car = createCar(profile().loadout);
    app.scene.add(this.car.group);
    this.ghostCar = createCar(null, { ghost: true });
    this.ghostCar.group.visible = false;
    app.scene.add(this.ghostCar.group);

    this.bot = this.demo && track.path ? new Autopilot(track.path) : null;
    this.camMode = this.demo ? 0 : app.settings.camera || 0;

    this.up = new THREE.Vector3(0, 1, 0);
    this.quat = new THREE.Quaternion();
    this.prevQuat = new THREE.Quaternion();
    this.renderPos = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
    this.camYaw = 0;
    this.camT = 0;
    this.shake = 0;

    this.loadRecord();
    this.restart();
  }

  loadRecord() {
    this.record = this.trackKey && !this.demo ? getRecord(this.trackKey) : null;
    this.ghostData = null;
    if (this.record && this.record.ghost) {
      try { this.ghostData = decodeFloats(this.record.ghost); } catch { this.ghostData = null; }
    }
  }

  restart() {
    const app = this.app;
    this.logic.reset();
    const sp = this.logic.spawnPoint();
    this.phys.place(sp.x, sp.y, sp.z, sp.yaw);
    this.car.setMoto(false, true);
    this.collectedShards = new Set();
    this.up.set(this.phys.n.x, this.phys.n.y, this.phys.n.z);
    this._orient();
    this.prevQuat.copy(this.quat);
    this.camYaw = sp.yaw;
    this.camPos.set(sp.x + Math.sin(sp.yaw) * 12, sp.y + 5, sp.z + Math.cos(sp.yaw) * 12);
    this.state = this.demo ? 'racing' : 'countdown';
    this.countT = 0;
    this.countShown = -1;
    this.acc = 0;
    this.ghostRec = [];
    this.groundT = 0;
    this.finishT = 0;
    this.lastSplitShown = 0;
    this.wheelSpin = 0;
    app.particles.clear();
    if (this.bot) this.bot.reset(this.phys);
    if (!this.demo) {
      app.ui.hud.reset(this);
      app.ui.hideOverlay('finish');
    }
    this.car.flames.forEach((f) => { f.visible = false; });
  }

  respawn() {
    if (this.state !== 'racing') return;
    const r = this.logic.respawn;
    this.phys.place(r.x, r.y, r.z, r.yaw);
    this.phys.moto = !!r.moto; this.phys.gravMul = r.grav || 1;
    this.car.setMoto(this.phys.moto, true);
    this.up.set(this.phys.n.x, this.phys.n.y, this.phys.n.z);
    this._orient();
    this.prevQuat.copy(this.quat);
    this.groundT = 0;
    this.app.audio.respawn();
    this.app.particles.burst(r.x, r.y + 1.5, r.z, 24, 8, 0.6, 0.7, '#5ff2ff', 0);
  }

  cycleCamera() {
    this.camMode = (this.camMode + 1) % CAM_MODES.length;
    this.app.settings.camera = this.camMode;
    this.app.saveSettings();
    this.app.ui.flash(`Caméra : ${CAM_MODES[this.camMode].name}`);
  }

  // Orientation visuelle (lissée par pas fixe pour que le fantôme soit identique).
  _orient() {
    const p = this.phys;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    if (p.mode === 'ribbon') {
      tmpV.set(p.n.x, p.n.y, p.n.z);
      this.up.lerp(tmpV, 0.6).normalize();
    } else if (p.grounded) {
      tmpV.set(p.n.x, p.n.y, p.n.z);
      this.up.lerp(tmpV, 0.28).normalize();
    } else {
      const sp = p.speed || 1;
      tmpV.set(-fx * (p.vel.y / sp) * 0.7, 1, -fz * (p.vel.y / sp) * 0.7).normalize();
      // Retournée (chute d'un looping) : on se redresse plus vite.
      this.up.lerp(tmpV, this.up.y < 0.3 ? 0.08 : 0.035).normalize();
    }
    const f = p.mode === 'ribbon' ? tmpV2.set(p.fwd.x, p.fwd.y, p.fwd.z) : tmpV2.set(fx, 0, fz);
    f.addScaledVector(this.up, -f.dot(this.up));
    if (f.lengthSq() < 1e-6) f.set(fx, 0, fz).addScaledVector(this.up, -tmpV2.dot(this.up));
    f.normalize();
    const right = tmpV.crossVectors(f, this.up).normalize();
    const back = f.negate();
    tmpM.makeBasis(right, this.up, back);
    this.quat.setFromRotationMatrix(tmpM);
  }

  _input() {
    if (this.bot) return this.bot.control(this.phys);
    if (this.state === 'finished') return { steer: 0, throttle: false, brake: true, drift: false };
    return this.app.input.drive();
  }

  _stepOnce() {
    const app = this.app;
    const inp = this._input();
    this.lastInput = inp;
    this.prevQuat.copy(this.quat);
    this.phys.step(inp);
    this._orient();
    const ev = this.phys.ev;
    if (ev.boostHit) {
      app.audio.boost();
      this.shake = Math.max(this.shake, 0.25);
    }
    if (ev.wall > 3) {
      app.audio.thud(ev.wall);
      app.input.rumble(Math.min(1, ev.wall * 0.06), 0.4, 140);
      const p = this.phys.pos;
      app.particles.burst(p.x, p.y + 0.8, p.z, Math.min(16, ev.wall), 7, 0.4, 0.45, '#ffb84d', 12);
      this.shake = Math.max(this.shake, Math.min(0.5, ev.wall * 0.03));
    }
    if (ev.land > 4) {
      app.audio.land(ev.land);
      app.input.rumble(Math.min(1, ev.land * 0.05), 0.3, 120);
      const p = this.phys.pos;
      app.particles.burst(p.x, p.y + 0.3, p.z, Math.min(20, ev.land * 1.5), 6, 0.6, 0.8, app.scenery.theme.dust, 3);
      this.shake = Math.max(this.shake, Math.min(0.6, ev.land * 0.04));
    }
    if (ev.bounce) {
      app.audio.bounce();
      const p = this.phys.pos;
      app.particles.burst(p.x, p.y + 0.4, p.z, 24, 9, 0.6, 0.7, '#ff5fd2', 2);
    }
    if (ev.loopIn) app.audio.whoosh();
    if (ev.moto) {
      this.car.setMoto(this.phys.moto);
      app.audio.transform();
      const p = this.phys.pos;
      app.particles.burst(p.x, p.y + 1, p.z, 40, 11, 0.8, 0.8, '#ff9f1c', 1);
      app.particles.burst(p.x, p.y + 1, p.z, 24, 9, 0.8, 0.7, '#ffffff', 1);
      if (!this.demo) app.ui.hud.message(this.phys.moto ? 'Mode moto !' : 'Retour en voiture', 1.2);
    }
    if (ev.gravity && !this.demo) app.ui.hud.message(`Gravité ${Math.round(this.phys.gravMul * 100)} %`, 1.4);
    if (ev.loopFall && !this.demo) app.ui.hud.message('Trop lent pour le looping !', 1.4);

    if (this.state === 'racing') {
      if (this.logic.steps % 6 === 0) this._checkShards();
      const res = this.logic.update(this.phys);
      if (!this.demo && this.logic.steps % GHOST_EVERY === 0) {
        const p = this.phys.pos, q = this.quat;
        this.ghostRec.push(p.x, p.y, p.z, q.x, q.y, q.z, q.w);
      }
      if (res) this._event(res);

      // Hors piste : réapparition automatique.
      if (this.phys.grounded && this.phys.surfType === 'ground') {
        this.groundT += DT;
        if (this.groundT > 0.5) {
          if (this.demo) this.restart(); else { app.ui.hud.message('Hors piste !', 1.0); this.respawn(); }
        }
      } else this.groundT = 0;
    }
  }

  // Éclats secrets (easter egg) : décorations « shard » ramassables une seule fois.
  _checkShards() {
    if (this.demo || !this.track.decos.length) return;
    const p = this.phys.pos;
    this.track.decos.forEach((d, i) => {
      if (d.k !== 'shard' || this.collectedShards.has(i)) return;
      if (Math.hypot(d.x - p.x, d.y + 2.5 * d.s - p.y, d.z - p.z) > 6 * d.s) return;
      this.collectedShards.add(i);
      const key = `${this.trackKey}#${i}`;
      const pr = profile();
      const first = !pr.shards[key];
      this.app.particles.burst(d.x, d.y + 2.5, d.z, 40, 12, 1, 0.8, '#ffd23e', 3, 2);
      this.app.audio.checkpoint(true);
      if (first) {
        pr.shards[key] = 1;
        addCoins(40);
        this.app.ui.hud.message('Éclat secret ! +40 pièces', 2.2);
        this.app.ui.updateCoins();
      } else this.app.ui.hud.message('Éclat secret (déjà trouvé)', 1.4);
      saveProfile();
    });
  }

  _event(ev) {
    const app = this.app;
    const p = this.phys.pos;
    if (ev.type === 'checkpoint') {
      let diff = null;
      if (this.record && this.record.splits && this.record.splits[ev.index - 1] != null) {
        diff = (ev.steps - this.record.splits[ev.index - 1]) * DT;
      }
      if (!this.demo) {
        app.audio.checkpoint(diff == null ? null : diff <= 0);
        app.ui.hud.split(diff, ev.steps * DT);
        app.ui.hud.checkpoints(this.logic.collected.size, this.logic.cps.length);
      }
      app.particles.burst(p.x, p.y + 2, p.z, 30, 12, 0.9, 0.8, '#ffbf3c', 4, 2);
    } else if (ev.type === 'missing') {
      if (!this.demo) {
        app.ui.hud.message(`Il manque ${ev.remaining} checkpoint${ev.remaining > 1 ? 's' : ''} !`, 1.6);
        app.audio.error();
      }
    } else if (ev.type === 'finish') {
      app.particles.burst(p.x, p.y + 2, p.z, 60, 16, 1.4, 1.0, '#ff4f9a', 5, 3);
      app.particles.burst(p.x, p.y + 2, p.z, 40, 14, 1.4, 0.8, '#5ff2ff', 5, 3);
      if (this.demo) { this.finishT = 0; this.state = 'finished'; return; }
      this._finish(ev.steps * DT);
    }
  }

  _finish(time) {
    const app = this.app;
    this.state = 'finished';
    this.finishT = 0;
    const prev = this.record;
    const isRecord = !prev || time < prev.time - 1e-9;
    if (isRecord && this.trackKey) {
      const ghost = new Float32Array(this.ghostRec);
      const rec = {
        time,
        splits: this.logic.splits.slice(),
        ghost: encodeFloats(ghost),
        date: Date.now(),
        name: app.settings.playerName,
      };
      saveRecord(this.trackKey, rec);
    }
    app.audio.finish(isRecord);
    const medal = medalFor(time, this.medals);
    const prevMedal = prev ? medalFor(prev.time, this.medals) : null;
    let reward = null;
    if (this.opts.fromEditor) {
      app.onEditorTestFinished(time, this.track);
    } else if (this.medals) {
      const tier = medal ? MEDALS.indexOf(medal) : -1;
      reward = rewardCoins({ tier, difficulty: this.opts.difficulty || 1, trackKey: this.trackKey, user: !!this.opts.userMap });
      app.ui.updateCoins();
    }
    app.ui.showFinish({
      reward,
      verified: !!this.opts.fromEditor,
      derived: this.opts.fromEditor ? this.track.derivedMedals : null,
      unverifiedUser: !!this.opts.userMap && !this.medals,
      time,
      prevTime: prev ? prev.time : null,
      isRecord,
      medal,
      newMedal: medal && (!prevMedal || MEDALS.indexOf(medal) < MEDALS.indexOf(prevMedal)),
      medals: this.medals,
      fromEditor: !!this.opts.fromEditor,
      hasNext: !!this.opts.hasNext,
    });
    if (isRecord) this.loadRecord();
    app.ui.hud.time(time, true);
  }

  update(dt) {
    const app = this.app;
    const input = app.input;

    if (!this.demo) {
      if (input.act('pause') || (this.state === 'paused' && input.hit('Escape'))) {
        if (this.state === 'paused') this.resume();
        else if (this.state !== 'finished') this.pause();
        else app.quitRace();
        return;
      }
      if (this.state === 'paused') return this.render(dt, 0);
      if (input.act('restart') || input.hit('NumpadEnter')) { this.restart(); return; }
      if (input.act('respawn')) this.respawn();
      if (input.act('camera')) this.cycleCamera();
    }

    if (this.state === 'countdown') {
      this.countT += dt;
      const steps = [0, 0.55, 1.1, 1.65];
      let k = 0;
      while (k < steps.length - 1 && this.countT >= steps[k + 1]) k++;
      if (k !== this.countShown) {
        this.countShown = k;
        const final = k === 3;
        app.ui.hud.center(final ? 'GO !' : String(3 - k), true);
        app.audio.countdown(final);
        if (final) {
          this.state = 'racing';
          setTimeout(() => app.ui.hud.center(''), 600);
        }
      }
      if (this.state === 'countdown') {
        app.audio.engine({ speed: 0, throttle: input.drive().throttle, slip: 0, boost: false });
        return this.render(dt, 1);
      }
    }

    if (this.state === 'racing' || this.state === 'finished') {
      this.acc += Math.min(dt, 0.1);
      while (this.acc >= DT) {
        this._stepOnce();
        this.acc -= DT;
      }
      if (this.state === 'finished') {
        this.finishT += dt;
        if (this.demo && this.finishT > 2.5) this.restart();
      }
    }
    this.render(dt, this.acc / DT);
  }

  pause() {
    this.state = 'paused';
    this.app.ui.showOverlay('pause');
    this.app.audio.engine(null);
  }

  resume() {
    this.app.ui.hideOverlay('pause');
    this.state = this.logic.steps > 0 || this.countShown >= 3 ? 'racing' : 'countdown';
    if (this.state === 'countdown') { this.countT = 0; this.countShown = -1; }
  }

  render(dt, alpha) {
    const app = this.app;
    const p = this.phys;
    // Interpolation entre deux pas physiques
    this.renderPos.set(
      p.prev.x + (p.pos.x - p.prev.x) * alpha,
      p.prev.y + (p.pos.y - p.prev.y) * alpha,
      p.prev.z + (p.pos.z - p.prev.z) * alpha,
    );
    const g = this.car.group;
    g.position.copy(this.renderPos);
    g.quaternion.slerpQuaternions(this.prevQuat, this.quat, alpha);

    this.car.update(dt, performance.now() / 1000);
    // Roues, roulis, flammes
    this.wheelSpin += (p.fwdSpeed / 0.44) * dt;
    for (const w of this.car.wheels) {
      w.spin.rotation.x = -this.wheelSpin;
      if (w.front) w.pivot.rotation.y = -p.steer * 0.42;
    }
    const roll = Math.max(-0.07, Math.min(0.07, p.yawRate * p.fwdSpeed * 0.0022));
    this.car.body.rotation.z += (roll - this.car.body.rotation.z) * Math.min(1, dt * 8);
    const inp = this.lastInput || {};
    const pitch = p.grounded ? (inp.throttle ? 0.012 : 0) - (inp.brake && p.fwdSpeed > 2 ? 0.03 : 0) : 0;
    this.car.body.rotation.x += (pitch - this.car.body.rotation.x) * Math.min(1, dt * 6);
    const boosting = p.boost > 0;
    for (const f of this.car.flames) {
      f.visible = boosting;
      if (boosting) f.scale.set(1, 1.2 + Math.random() * 1.2, 1);
    }

    // Particules : poussière de dérapage, étincelles de boost
    if (p.grounded && p.slip > 5 && p.speed > 6) {
      for (const sx of [-1, 1]) {
        tmpV.set(sx * 1.0, 0.15, 1.4).applyQuaternion(g.quaternion).add(g.position);
        const dust = p.surfMod === 'ice' ? '#e8f8ff' : p.surfMod === 'sand' ? '#d8b07a' : app.scenery.theme.dust;
        app.particles.spawn(tmpV.x, tmpV.y, tmpV.z, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.7, 0.9, dust, -1);
      }
    }
    if (boosting && Math.random() < 0.8) {
      tmpV.set((Math.random() - 0.5) * 0.8, 0.4, 2.4).applyQuaternion(g.quaternion).add(g.position);
      app.particles.spawn(tmpV.x, tmpV.y, tmpV.z, -p.vel.x * 0.2 + (Math.random() - 0.5) * 3, Math.random() * 2, -p.vel.z * 0.2 + (Math.random() - 0.5) * 3, 0.35, 0.5, '#5ff2ff', 0);
    }
    app.particles.update(dt);

    // Fantôme
    this._renderGhost(alpha);

    // Caméra
    this._camera(dt);
    app.scenery.update(this.renderPos, app.camera);

    // Audio & HUD
    if (this.state === 'racing' || this.state === 'finished') {
      app.audio.engine({ speed: p.fwdSpeed, throttle: !!inp.throttle, slip: p.grounded ? p.slip : 0, boost: boosting });
    }
    if (!this.demo) {
      const hud = app.ui.hud;
      if (this.state === 'racing') hud.time((this.logic.steps + alpha) * DT);
      hud.speed(Math.abs(p.fwdSpeed) * 3.6, p.boost);
    }
  }

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
  }

  _camera(dt) {
    const cam = this.app.camera;
    const p = this.phys;
    const mode = CAM_MODES[this.camMode];
    const car = this.car.group;
    this.shake = Math.max(0, this.shake - dt * 1.8);

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
      this._fov(mode.fov + Math.min(16, Math.abs(p.fwdSpeed) * 0.2));
      return;
    }

    const sp = Math.abs(p.fwdSpeed);
    const camUp = this.camUp || (this.camUp = new THREE.Vector3(0, 1, 0));

    // Dans un looping : la caméra se cale derrière la voiture et tourne avec elle.
    if (p.mode === 'ribbon') {
      const up = this.up;
      camUp.lerp(up, 1 - Math.exp(-dt * 6));
      if (camUp.lengthSq() < 1e-3) camUp.copy(up);
      camUp.normalize();
      tmpV.set(p.fwd.x, p.fwd.y, p.fwd.z);
      const target = tmpV2.copy(car.position).addScaledVector(tmpV, -mode.dist).addScaledVector(up, mode.height);
      this.camPos.lerp(target, 1 - Math.exp(-dt * 12));
      cam.position.copy(this.camPos);
      cam.up.copy(camUp);
      tmpV2.copy(car.position).addScaledVector(tmpV, mode.look).addScaledVector(up, mode.lookUp);
      cam.lookAt(tmpV2);
      this.camYaw = p.yaw;
      this._fov(mode.fov + Math.min(18, sp * 0.24));
      return;
    }
    camUp.lerp(UP, 1 - Math.exp(-dt * 4));
    if (camUp.lengthSq() < 1e-3) camUp.set(0, 1, 0);
    camUp.normalize();
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
    for (let i = 0; i <= 4; i++) {
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
    tmpV.set(car.position.x - fx * dist, car.position.y + height, car.position.z - fz * dist);
    // Horizontal serré, vertical plus doux (sauf sous un pont : réaction immédiate).
    const kx = 1 - Math.exp(-dt * 12);
    const ky = 1 - Math.exp(-dt * (underBridge ? 20 : 6));
    this.camPos.x += (tmpV.x - this.camPos.x) * kx;
    this.camPos.z += (tmpV.z - this.camPos.z) * kx;
    this.camPos.y += (tmpV.y - this.camPos.y) * ky;
    // Jamais dans une dalle ni sous la chaussée
    const ceilCam = this.track.ceilingAt(this.camPos.x, this.camPos.z, carTop - 0.5);
    if (this.camPos.y > ceilCam - 0.5 && ceilCam > carTop - 0.5) this.camPos.y = ceilCam - 0.5;
    const s = this.track.surfaceAt(this.camPos.x, this.camPos.y, this.camPos.z, this._camS || (this._camS = {}), 2);
    if (this.camPos.y < s.h + 1.2) this.camPos.y = s.h + 1.2;
    cam.position.copy(this.camPos);
    if (this.shake > 0) {
      const k = this.shake * 0.25;
      cam.position.x += (Math.random() - 0.5) * k;
      cam.position.y += (Math.random() - 0.5) * k;
    }
    const lookUp = underBridge ? Math.min(mode.lookUp, 0.8) : mode.lookUp;
    cam.lookAt(car.position.x + fx * mode.look, car.position.y + lookUp, car.position.z + fz * mode.look);
    this._fov(mode.fov + Math.min(18, sp * 0.24) + (p.boost > 0 ? 5 : 0));
  }

  _fov(target) {
    const cam = this.app.camera;
    const f = cam.fov + (target - cam.fov) * 0.1;
    if (Math.abs(f - cam.fov) > 0.01) {
      cam.fov = f;
      cam.updateProjectionMatrix();
    }
  }

  dispose() {
    this.app.camera.up.set(0, 1, 0);
    this.view.dispose();
    this.car.dispose();
    this.ghostCar.dispose();
    this.app.particles.clear();
    this.app.audio.engine(null);
  }
}

export { formatTime, UP };
