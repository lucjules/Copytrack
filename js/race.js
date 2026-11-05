// Session de course : boucle à pas fixe, caméra, fantôme, HUD, effets.
import * as THREE from './vendor/three.module.min.js';
import { DT } from './constants.js';
import { CamFlip } from './camflip.js';
import { MSG, PRIO } from './hudMessages.js';
import { RemoteCar } from './remoteCar.js';
import { SEND_EVERY_STEPS } from './net/room.js';
import { F_FINISHED, F_BOOST, F_GROUNDED } from './net/snapshot.js';
import { CarPhysics, frameWorld } from './physics.js';
import { RaceLogic, placeAtStart } from './raceLogic.js';
import { Autopilot } from './autopilot.js';
import { TrackView } from './trackMesh.js';
import { createCar } from './carModel.js';
import { getRecord, saveRecord, encodeFloats, decodeFloats, formatTime, getImportedGhost } from './storage.js';
import { profile, rewardCoins } from './profile.js';
import { CATALOG } from './cosmetics.js';
import { SkidMarks } from './skids.js';
import { InputRecorder, decodeInputs, inputAt, quantSteer, GhostRunner, PHYS_VER } from './replay.js';
import { goalMet, goalLabel, completeGoal, goalDone } from './career.js';

const GHOST_EVERY = 4; // un échantillon tous les 4 pas (30 Hz)
// Caméras en plus pour les replays.
const REPLAY_CAMS = [{ name: 'TV', tv: true }, { name: 'Orbite libre', orbit: true }];
const CAM_MODES = [
  { name: 'Poursuite', dist: 9.5, height: 3.7, look: 5, lookUp: 1.3, fov: 66 },
  { name: 'Proche', dist: 6.2, height: 2.3, look: 7, lookUp: 1.0, fov: 70 },
  { name: 'Capot', hood: true, fov: 76 },
  { name: 'Lointaine', dist: 14, height: 5.6, look: 4, lookUp: 1.6, fov: 62 },
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
    this.logic = new RaceLogic(track, { partial: !!opts.spawn });
    this.car = createCar(profile().loadout);
    app.scene.add(this.car.group);
    this.skids = new SkidMarks(app.scene);
    this.ghostCar = createCar(null, { ghost: true });
    this.ghostCar.group.visible = false;
    app.scene.add(this.ghostCar.group);

    this.bot = this.demo && track.path ? new Autopilot(track.path) : null;
    // Replay : commandes enregistrées rejouées à l'identique.
    this.replay = opts.replay ? decodeInputs(opts.replay.inputs) : null;
    this.replaySpeed = 1;
    this.replayPaused = false;
    this.replayCam = 0;   // 0 = caméra de course, puis TV, orbite
    // Fantômes simulés (or, importé).
    this.ghosts = [];
    // Multijoueur (opts.multi = { room, startLocal }) : pas de fantômes enregistrés, des voitures distantes à la place.
    this.multi = opts.multi || null;
    this.remote = new Map();
    this.teleSeq = 0;
    this.netTick = 0;     // horloge d'envoi : ne recule JAMAIS, même quand on recommence un essai (le tampon des autres joueurs en dépend)
    if (!this.demo && !this.replay && !opts.fromEditor && !this.multi) this._setupGhosts();
    if (this.multi) this._setupRemotes();
    this.camMode = this.demo ? 0 : app.settings.camera || 0;

    this.up = new THREE.Vector3(0, 1, 0);
    this.quat = new THREE.Quaternion();
    this.prevQuat = new THREE.Quaternion();
    this.renderPos = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
    this.camFlip = new CamFlip();       // retournement de la caméra (inversion de gravité)
    this.camYaw = 0;
    this.camT = 0;
    this.shake = 0;

    this.loadRecord();
    this.restart();
  }

  // Message au centre de l'écran (court, trié par importance : voir hudMessages.js). m = [texte, importance, durée en s].
  _say(m) { if (!this.demo && m) this.app.ui.hud.message(m[0], m[2], m[1]); }

  // ---- Multijoueur : voitures des autres joueurs (RemoteCar), alimentées par les paquets WebRTC ----------------------------
  _setupRemotes() {
    const room = this.multi.room;
    const ids = room.list.map((m) => m.id).sort();
    const add = (m) => {
      if (m.self || this.remote.has(m.id) || m.link === 'incompatible') return;
      const rc = new RemoteCar(this.app.scene, { id: m.id, name: m.name, colorIndex: ids.indexOf(m.id) },
        { onTeleport: (pos) => this.app.particles.burst(pos.x, pos.y + 1.5, pos.z, 16, 6, 0.5, 0.6, '#9fe3ff', 0) });
      this.remote.set(m.id, rc);
    };
    room.list.forEach(add);
    this._onSnap = (id, snap, now) => { const rc = this.remote.get(id); if (rc) rc.push(snap, now); };
    this._onLeft = (id) => { const rc = this.remote.get(id); if (rc) { rc.dispose(); this.remote.delete(id); } };
    room.on('snapshot', this._onSnap);
    room.on('left', this._onLeft);
  }

  // État de la voiture locale, envoyé aux autres (20 fois par seconde, et à chaque téléportation / arrivée).
  _sendNet(extraFlags = 0) {
    if (!this.multi || this.multi.room.closed) return;
    const p = this.phys, q = this.quat;
    this.multi.room.sendSnapshot({
      steps: this.netTick,
      pos: p.pos, quat: q, vel: p.vel, vehicle: p.vehicle,
      flags: extraFlags | (p.boost > 0 ? F_BOOST : 0) | (p.grounded ? F_GROUNDED : 0),
      tele: this.teleSeq, cp: this.logic.collected.size, lap: this.logic.lap,
    });
  }

  _setupGhosts() {
    const app = this.app, s = app.settings;
    const add = (runner, color, label) => {
      const car = createCar(null, { ghost: true, ghostColor: color });
      car.group.visible = false;
      app.scene.add(car.group);
      this.ghosts.push({ runner, car, label, q: new THREE.Quaternion(), pq: new THREE.Quaternion() });
    };
    const rec = this.trackKey ? getRecord(this.trackKey) : null;
    const goldNotYet = this.medals && (!rec || rec.time > this.medals.or + 1e-6);
    if (s.ghostGold !== false && this.track.path && goldNotYet) add(new GhostRunner(this.track, { bot: true, latK: 0.8 }), '#ffd23e', 'Or');
    const imp = this.trackKey && s.ghostImported !== false ? getImportedGhost(this.trackKey) : null;
    if (imp && imp.v === PHYS_VER) add(new GhostRunner(this.track, { inputs: imp.inputs }), '#c77dff', imp.name);
  }

  loadRecord() {
    this.record = this.trackKey && !this.demo ? getRecord(this.trackKey) : null;
    // Les records d'une autre version de la physique n'ont pas de commandes rejouables.
    if (this.record && this.record.pv !== PHYS_VER) this.record = { ...this.record, inputs: null };
    this.ghostData = null;
    if (this.record && this.record.ghost) {
      try { this.ghostData = decodeFloats(this.record.ghost); } catch { this.ghostData = null; }
    }
  }

  restart() {
    const app = this.app;
    this.logic.reset();
    const sp = this.opts.spawn || this.logic.spawnPoint();
    if (this.opts.spawn) this.logic.respawn = { ...sp, vehicle: this.track.veh0 || 'car', grav: (this.track.g0 || 100) / 100 };
    placeAtStart(this.phys, this.logic, sp);
    this.car.setVehicle(this.phys.vehicle, true);
    this.up.set(this.phys.n.x, this.phys.n.y, this.phys.n.z);
    this._orient();
    this.prevQuat.copy(this.quat);
    this.camYaw = sp.yaw;
    this.camPos.set(sp.x + Math.sin(sp.yaw) * 12, sp.y + 5, sp.z + Math.cos(sp.yaw) * 12);
    this._camCut();
    this.state = this.demo || this.replay ? 'racing' : 'countdown';
    this.recorder = new InputRecorder();
    this.tick = 0;          // pas de course depuis le départ (ne recule jamais, contrairement au chrono)
    this._pendingRespawn = false;
    this.stats = { wallHits: 0, respawns: 0, perfects: 0, turbos: 0, rings: 0 };
    this.statsSnap = { perfects: 0, turbos: 0, rings: 0 };     // compteurs au dernier checkpoint : un retour (R) les annule
    for (const g of this.ghosts) { g.runner.reset(); g.car.group.visible = false; }
    this.countT = 0;
    this.countShown = -1;
    this.acc = 0;
    this.ghostRec = [];
    this.groundT = 0;
    this.finishT = 0;
    this.lastSplitShown = 0;
    this.wheelSpin = 0;
    app.particles.clear();
    this.skids.clear();
    if (this.bot) this.bot.reset(this.phys);
    if (!this.demo) {
      app.ui.hud.reset(this);
      app.ui.hideOverlay('finish');
    }
    this.car.flames.forEach((f) => { f.visible = false; });
  }

  // Multijoueur asynchrone (à la Polytrack) : un nouvel essai, tout de suite, sans décompte ni retour au salon. Chacun a son
  // chrono et recommence quand il veut ; les autres voient la voiture « apparaître » au départ (compteur de téléportation).
  _newAttempt() {
    if (!this.multi || (this.state !== 'racing' && this.state !== 'finished')) return;
    this.restart();
    this.state = 'racing';
    this.countShown = 3;
    this.acc = 0;
    this.teleSeq = (this.teleSeq + 1) & 255;
    this._sendNet();
    this.app.ui.hud.message('', 0.01);
  }

  respawn(fromInput = false) {
    if (this.state !== 'racing') return;
    if (fromInput) this._pendingRespawn = true;
    this.stats.respawns++;
    // Retour au dernier checkpoint : le chrono revient au temps de ce checkpoint (solo). En multijoueur il continue de
    // tourner : la téléportation coûte tout le temps perdu, et le compteur de téléportation prévient les autres joueurs.
    const r = this.logic.rewind({ keepClock: !!this.multi });
    Object.assign(this.stats, this.statsSnap);       // les réceptions, turbos et anneaux d'après le checkpoint ne comptent plus
    if (this.multi) this.teleSeq = (this.teleSeq + 1) & 255;
    const steps = this.logic.steps;
    this.ghostRec.length = Math.min(this.ghostRec.length, Math.floor(steps / GHOST_EVERY) * 7);
    for (const g of this.ghosts) {
      g.runner.reset();
      while (g.runner.k < steps && !g.runner.done) g.runner.step();
      g.pq.copy(g.q);
    }
    if (!this.demo) {
      this.app.ui.hud.checkpoints(this.logic.collected.size, this.logic.cps.length, this.logic.lap, this.logic.laps);
      this.app.ui.hud.time(steps * DT);
    }
    this.phys.place(r.x, r.y, r.z, r.yaw, r.gs || 1);
    this.phys.vehicle = r.vehicle || 'car'; this.phys.gravMul = r.grav || 1;
    this.car.setVehicle(this.phys.vehicle, true);
    this.up.set(this.phys.n.x, this.phys.n.y, this.phys.n.z);
    this._orient();
    this.prevQuat.copy(this.quat);
    this._camCut();
    this.groundT = 0;
    if (this.multi) { this._sendNet(); this._say(MSG.keepClock); }
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
      // En l'air, l'assiette vient de la physique (gaz = nez vers le bas, frein = nez vers le haut).
      const c = Math.cos(p.pitch), s = Math.sin(p.pitch);
      const gs = p.gSign;
      tmpV.set(-fx * s * gs, c * gs, -fz * s * gs);
      // Retournée (chute d'un looping, inversion de gravité) : on se redresse plus vite.
      this.up.lerp(tmpV, this.up.y * gs < 0.3 ? 0.08 : 0.2).normalize();
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
    if (this.replay) {
      const inp = inputAt(this.replay, this.tick);
      if (inp.respawn) this.respawn();
      return inp;
    }
    if (this.bot) return this.bot.control(this.phys);
    if (this.state === 'finished') return { steer: 0, throttle: false, brake: true, drift: false };
    return this.app.input.drive();
  }

  _stepOnce() {
    const app = this.app;
    const inp = this._input();
    inp.steer = quantSteer(inp.steer);      // volant au centième : replay identique
    if (this.state === 'racing' && !this.demo && !this.replay) {
      this.recorder.push(inp, this._pendingRespawn);
      this._pendingRespawn = false;
    }
    if (this.state === 'racing') for (const g of this.ghosts) { g.pq.copy(g.q); g.runner.step(); }
    if (this.state === 'racing') this.tick++;
    this.lastInput = inp;
    this.prevQuat.copy(this.quat);
    this.phys.clock = this.logic.steps;   // horloge des obstacles et pièces mobiles = chrono
    this.phys.step(inp);
    this._orient();
    if (this.multi && ++this.netTick % SEND_EVERY_STEPS === 0) this._sendNet(this.state === 'finished' ? F_FINISHED : 0);
    const ev = this.phys.ev;
    if (this.state === 'racing') {
      if (ev.wall > 4) this.stats.wallHits++;
      if (ev.landQ === 'perfect') this.stats.perfects++;
      if (ev.miniTurbo) this.stats.turbos++;
      if (ev.ring) this.stats.rings++;
    }
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
    if (ev.shock > 0) {
      const p = this.phys.pos;
      app.audio.thud(24);
      this.shake = Math.max(this.shake, Math.min(1.2, ev.shock * 0.05));
      app.particles.burst(p.x, p.y + 0.8, p.z, 18, 8, 0.5, 0.5, '#ffd23e', 2);
    }
    if (ev.spring) {
      app.audio.bounce();
      const p = this.phys.pos;
      app.particles.burst(p.x, p.y + 0.4, p.z, 26, 10, 0.6, 0.7, '#5dff8a', 2);
    }
    if (ev.reverse && !this.demo) { app.audio.whoosh(); this._say(MSG.reverse); }
    if (ev.cut && !this.demo) { app.audio.thud(24); this._say(MSG.cut); }
    // Gerbes de neige dans la poudreuse.
    if (this.phys.grounded && this.phys.surfMod === 'powder' && this.phys.speed > 8 && Math.random() < 0.5) {
      const p = this.phys.pos;
      app.particles.burst(p.x, p.y + 0.3, p.z, 3, 4 + this.phys.speed * 0.08, 0.5, 0.6, '#ffffff', 2);
    }
    if (ev.bounce) {
      app.audio.bounce();
      const p = this.phys.pos;
      app.particles.burst(p.x, p.y + 0.4, p.z, 24, 9, 0.6, 0.7, '#ff5fd2', 2);
    }
    if (ev.loopIn) app.audio.whoosh();
    if (ev.miniTurbo) {
      app.audio.miniTurbo(ev.miniTurbo);
      app.input.rumble(0.4, 0.2, 120);
      const p = this.phys.pos;
      app.particles.burst(p.x, p.y + 0.5, p.z, 16, 7, 0.4, 0.5, ev.miniTurbo === 2 ? '#ffb84d' : '#5ff2ff', 2);
    }
    if (ev.landQ === 'perfect' && !this.demo) {
      app.audio.perfectLanding();
      const p = this.phys.pos;
      app.particles.burst(p.x, p.y + 0.3, p.z, 26, 10, 0.5, 0.55, '#7dffb0', 0, 1);
    } else if (ev.landQ === 'bad' && !this.demo) {
      this.shake = Math.max(this.shake, 0.6);
      app.input.rumble(0.9, 0.6, 220);
      this._say(MSG.badLanding);
    }
    if (ev.moto) {
      const veh = this.phys.vehicle;
      this.car.setVehicle(veh);
      app.audio.transform();
      const p = this.phys.pos;
      const col = { moto: '#ff9f1c', boat: '#3fd0ff', glider: '#f5f5f5', car: '#ffd23e' }[veh];
      app.particles.burst(p.x, p.y + 1, p.z, 40, 11, 0.8, 0.8, col, 1);
      app.particles.burst(p.x, p.y + 1, p.z, 24, 9, 0.8, 0.7, '#ffffff', 1);
      this._say(MSG.vehicle[veh]);
    }
    // Noyade : la réapparition se fait après la mise à jour de la course, dans le même
    // ordre que le rejeu (replay.js) — indispensable pour que la vérification des temps
    // en ligne retrouve exactement la même course.
    const sank = ev.sink && this.state === 'racing';
    if (sank && ev.spike) {
      const p = this.phys.pos;
      app.audio.thud(24);
      this.shake = Math.max(this.shake, 0.8);
      app.particles.burst(p.x, p.y + 0.6, p.z, 36, 9, 0.7, 0.5, '#ff5a6e', 3, 1);
      this._say(MSG.spikes);
    } else if (sank) {
      const p = this.phys.pos;
      app.particles.burst(p.x, p.y + 0.5, p.z, 30, 8, 0.7, 0.6, '#9fe3ff', 4, 2);
      this._say(MSG.sink);
    }
    // Verre fragile : la dalle vient de céder (elle disparaît, la voiture tombe).
    if (ev.glass && this.state === 'racing') {
      const p = this.phys.pos;
      app.audio.thud(24);
      app.particles.burst(p.x, p.y + 0.3, p.z, 46, 10, 0.9, 0.5, '#d9f4ff', 4, 2);
      app.particles.burst(p.x, p.y + 0.3, p.z, 20, 7, 0.9, 0.35, '#ffffff', 4, 2);
      this._say(MSG.glass);
    }
    if (ev.ring) {
      const p = this.phys.pos;
      app.particles.burst(p.x, p.y + 0.5, p.z, 30, 12, 0.6, 0.6, '#36e9ff', 0, 1);
    }
    if (ev.gravity) this._say(MSG.gravity(Math.round(this.phys.gravMul * 100)));
    if (ev.flip && !this.demo) { this._say(MSG.flip(this.phys.gSign < 0)); this.shake = Math.max(this.shake, 0.5); }
    if (ev.loopFall) this._say(MSG.fall[this.phys.fallWhy]);      // « crest » (décollage) : plus de message

    if (this.state === 'racing') {
      const res = this.logic.update(this.phys);
      if (!this.demo && this.logic.steps % GHOST_EVERY === 0) {
        const p = this.phys.pos, q = this.quat;
        this.ghostRec.push(p.x, p.y, p.z, q.x, q.y, q.z, q.w);
      }
      if (res) this._event(res);

      // Hors piste (0,5 s) ou noyade : réapparition automatique.
      if (sank && this.state === 'racing') { this.groundT = 0; if (this.demo) this.restart(); else this.respawn(); return; }
      if (this.phys.offTrack) {
        this.groundT += DT;
        if (this.groundT > 0.5) {
          if (this.demo) this.restart(); else { this._say(MSG.offTrack); this.respawn(); }
        }
      } else this.groundT = 0;
    }
  }


  _snapStats() { const s = this.stats; this.statsSnap = { perfects: s.perfects, turbos: s.turbos, rings: s.rings }; }

  _event(ev) {
    const app = this.app;
    const p = this.phys.pos;
    if (ev.type === 'checkpoint' || ev.type === 'lap') this._snapStats();
    if (ev.type === 'checkpoint') {
      let diff = null;
      if (this.record && this.record.splits && this.record.splits[ev.index - 1] != null) {
        diff = (ev.steps - this.record.splits[ev.index - 1]) * DT;
      }
      if (!this.demo) {
        app.audio.checkpoint(diff == null ? null : diff <= 0);
        app.ui.hud.split(diff, ev.steps * DT);
        app.ui.hud.checkpoints(this.logic.collected.size, this.logic.cps.length, this.logic.lap, this.logic.laps);
      }
      app.particles.burst(p.x, p.y + 2, p.z, 30, 12, 0.9, 0.8, '#ffbf3c', 4, 2);
    } else if (ev.type === 'lap') {
      let diff = null;
      if (this.record && this.record.splits && this.record.splits[ev.index - 1] != null) diff = (ev.steps - this.record.splits[ev.index - 1]) * DT;
      if (!this.demo) {
        app.audio.checkpoint(diff == null ? null : diff <= 0);
        app.ui.hud.split(diff, ev.steps * DT);
        this._say(MSG.lap(ev.lap, ev.laps));
        app.ui.hud.checkpoints(0, this.logic.cps.length, ev.lap, ev.laps);
      }
      app.particles.burst(p.x, p.y + 2, p.z, 40, 14, 1, 0.8, '#ff4f9a', 4, 2);
    } else if (ev.type === 'missing') {
      if (!this.demo) {
        this._say(MSG.missing(ev.remaining));
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
    if (this.replay) { this._replayEnded(); return; }
    if (this.multi) {
      // Multijoueur : ni record, ni pièces, ni classement en ligne (le chrono y suit des règles différentes). Le temps est
      // annoncé aux autres ; on peut recommencer tout de suite (R ou T), sans jamais repasser par le salon.
      this._sendNet(F_FINISHED);
      const best = this.multi.room.reportFinish(Math.round(time / DT));
      app.audio.finish(best);
      app.ui.hud.time(time, true);
      app.ui.hud.message(`🏁 ${formatTime(time)}${best ? ' · meilleur temps' : ''} · R : nouvel essai`, 6, PRIO.final);
      return;
    }
    // Dernière course, rejouable depuis l'écran d'arrivée.
    this.lastRun = { inputs: this.recorder.encode(), time };
    const prev = this.record;
    // Un record d'une autre version de la physique n'est plus comparable (et n'a pas de commandes rejouables) : il ne bloque pas le nouveau.
    const prevValid = prev && prev.pv === PHYS_VER;
    const isRecord = (!prevValid || time < prev.time - 1e-9) && !this.opts.spawn;
    if (isRecord && this.trackKey) {
      const ghost = new Float32Array(this.ghostRec);
      const rec = {
        time,
        splits: this.logic.splits.slice(),
        ghost: encodeFloats(ghost),
        inputs: this.recorder.encode(),
        pv: PHYS_VER,
        date: Date.now(),
        name: app.settings.playerName,
      };
      saveRecord(this.trackKey, rec);
    }
    app.audio.finish(isRecord);
    const medal = medalFor(time, this.medals);
    const prevMedal = prev ? medalFor(prev.time, this.medals) : null;
    let reward = null;
    if (this.opts.fromEditor && this.opts.spawn) {
      // Test partiel : pas de vérification ni de médaille.
    } else if (this.opts.fromEditor && this.opts.verify) {
      app.onEditorTestFinished(time, this.track);
    } else if (this.medals) {
      const tier = medal ? MEDALS.indexOf(medal) : -1;
      reward = rewardCoins({ tier, difficulty: this.opts.difficulty || 1, trackKey: this.trackKey, user: !!this.opts.userMap });
      app.ui.updateCoins();
    }
    // Objectif bonus (carrière).
    let goal = null;
    if (this.opts.goal && !this.opts.spawn) {
      const met = goalMet(this.opts.goal, { ...this.stats, vehicle: this.phys.vehicle, time });
      const already = goalDone(this.opts.goalKey);
      const coins = met ? completeGoal(this.opts.goalKey) : 0;
      if (coins) app.ui.updateCoins();
      goal = { label: goalLabel(this.opts.goal), met, coins, already };
    }
    app.ui.showFinish({
      goal,
      reward,
      verified: !!(this.opts.fromEditor && this.opts.verify),
      derived: this.opts.fromEditor && this.opts.verify ? this.track.derivedMedals : null,
      unverifiedUser: !!this.opts.userMap && !this.medals,
      time,
      prevTime: prev ? prev.time : null,
      isRecord,
      medal,
      newMedal: medal && (!prevMedal || MEDALS.indexOf(medal) < MEDALS.indexOf(prevMedal)),
      medals: this.medals,
      fromEditor: !!this.opts.fromEditor,
      hasNext: !!this.opts.hasNext,
      canReplay: true,
      canBoard: !!(this.trackKey && /^(b-|daily-|u-)/.test(this.trackKey) && !this.opts.spawn && !this.opts.fromEditor),
      canShareGhost: !!(this.trackKey && (isRecord || (this.record && this.record.inputs)) && !this.opts.spawn),
    });
    if (isRecord) this.loadRecord();
    // Classement en ligne : le record est envoyé (et vérifié par rejeu côté serveur).
    app.onRaceFinished(this, time, isRecord);
    app.ui.hud.time(time, true);
    if (this.record) app.ui.hud.el.best.innerHTML = `Record ${formatTime(this.record.time)}`;
  }

  update(dt) {
    const app = this.app;
    const input = app.input;

    if (this.replay) return this._updateReplay(dt);

    if (!this.demo) {
      if (this.multi && input.act('pause')) { app.confirmLeaveMulti(); return; }     // pas de pause : les autres courent
      if (input.act('pause') || (this.state === 'paused' && input.hit('Escape'))) {
        if (this.state === 'paused') this.resume();
        else if (this.state !== 'finished') this.pause();
        else app.quitRace();
        return;
      }
      if (this.state === 'paused') return this.render(dt, 0);
      if (input.act('restart') || input.hit('NumpadEnter')) { if (this.multi) this._newAttempt(); else { this.restart(); return; } }
      if (input.act('respawn') && !this.replay) { if (this.multi && this.state === 'finished') this._newAttempt(); else this.respawn(true); }
      if (input.act('camera')) this.cycleCamera();
      if (input.act('horn')) app.audio.horn(profile().loadout.horn);
    }

    if (this.state === 'countdown') {
      let k;
      if (this.multi) {
        // Départ commun : « GO » tombe à l'instant convenu avec l'hôte (3, 2, 1 à une seconde d'intervalle).
        const left = (this.multi.startLocal - performance.now()) / 1000;
        k = left > 3 ? this.countShown : left > 2 ? 0 : left > 1 ? 1 : left > 0 ? 2 : 3;
      } else {
        this.countT += dt;
        const steps = [0, 0.55, 1.1, 1.65];
        k = 0;
        while (k < steps.length - 1 && this.countT >= steps[k + 1]) k++;
      }
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

  // ---- Replay -------------------------------------------------------------
  _updateReplay(dt) {
    const app = this.app, input = app.input;
    if (input.hit('Escape') || input.act('pause')) { app.endReplay(this.opts.replay); return; }
    if (input.hit('Space')) { this.replayPaused = !this.replayPaused; this._replayHud(); }
    const speeds = [0.25, 0.5, 1, 2, 4];
    if (input.hit('ArrowRight') || input.hit('ArrowUp')) { this.replaySpeed = speeds[Math.min(4, speeds.indexOf(this.replaySpeed) + 1)]; this._replayHud(); }
    if (input.hit('ArrowLeft') || input.hit('ArrowDown')) { this.replaySpeed = speeds[Math.max(0, speeds.indexOf(this.replaySpeed) - 1)]; this._replayHud(); }
    if (input.act('restart')) { this.restart(); this._replayHud(); return; }
    if (input.act('camera')) {
      this.replayCam = (this.replayCam + 1) % (CAM_MODES.length + REPLAY_CAMS.length);
      const name = this.replayCam < CAM_MODES.length ? CAM_MODES[this.replayCam].name : REPLAY_CAMS[this.replayCam - CAM_MODES.length].name;
      if (this.replayCam < CAM_MODES.length) this.camMode = this.replayCam;
      app.ui.flash(`Caméra : ${name}`, 1.2);
    }
    if (!this.replayPaused && this.state !== 'finished') {
      this.acc += Math.min(dt, 0.1) * this.replaySpeed;
      while (this.acc >= DT && this.state !== 'finished') {
        this._stepOnce();
        this.acc -= DT;
      }
    } else if (this.state === 'finished') this.finishT += dt;
    this.render(dt, this.replayPaused ? 1 : Math.min(1, this.acc / DT));
  }

  _replayHud() {
    const el = document.getElementById('replay-bar');
    if (!el) return;
    el.querySelector('.rs').textContent = this.replayPaused ? '❚❚ Pause' : `▶ ×${this.replaySpeed}`;
  }

  _replayEnded() {
    this.app.ui.hud.message('Replay terminé · Entrée : revoir', 3);
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
    // Obstacles et pièces mobiles : même temps que la physique (chrono), interpolé.
    if (this.state === 'racing') this.obsT = Math.max(0, (this.logic.steps - 1 + alpha) * DT);
    else if (this.state === 'finished') this.obsT = (this.obsT || 0) + dt;
    else if (this.obsT == null || this.state === 'countdown') this.obsT = 0;
    this.view.updateMoving(this.obsT);
    // Dalles de verre brisées : visibles de nouveau dès qu'un (re)départ les restaure.
    if (this.phys.broken.size !== this._brokenN) { this._brokenN = this.phys.broken.size; this.view.setBroken(this.phys.broken); }
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
      if (w.front) w.pivot.rotation.y = -(p.steerAngle || 0);   // angle réel des roues avant
    }
    // Roulis : léger au sol, franc pour le deltaplane qui vire en l'air.
    const gliding = p.vehicle === 'glider' && !p.grounded;
    const roll = gliding ? -(p.steer || 0) * 0.45 : Math.max(-0.07, Math.min(0.07, p.yawRate * p.fwdSpeed * 0.0022));
    this.car.body.rotation.z += (roll - this.car.body.rotation.z) * Math.min(1, dt * 8);
    const inp = this.lastInput || {};
    const pitch = p.grounded ? (inp.throttle ? 0.012 : 0) - (inp.brake && p.fwdSpeed > 2 ? 0.03 : 0) : 0;
    this.car.body.rotation.x += (pitch - this.car.body.rotation.x) * Math.min(1, dt * 6);
    const boosting = p.boost > 0;
    for (const f of this.car.flames) {
      f.visible = boosting;
      if (boosting) f.scale.set(1, 1.2 + Math.random() * 1.2, 1);
    }

    // Traces de pneus (glisse ou gros freinage) et étincelles du mini-turbo en charge.
    const sliding = p.grounded && !p.rib && p.speed > 8 && (p.slip > 0.06 * Math.abs(p.fwdSpeed) + 1.2 || (inp.brake && p.fwdSpeed > 12 && !inp.throttle));
    const wheelsX = this.car.vehicle === 'boat' ? [] : this.car.isMoto ? [0] : [-0.95, 0.95];
    tmpV2.set(1, 0, 0).applyQuaternion(g.quaternion);
    for (let w = 0; w < 2; w++) {
      if (sliding && w < wheelsX.length) {
        tmpV.set(wheelsX[w], 0, 1.3).applyQuaternion(g.quaternion).add(g.position);
        this.skids.add(w, tmpV.x, tmpV.y, tmpV.z, tmpV2.x, tmpV2.z, this.car.isMoto ? 0.22 : 0.3);
      } else this.skids.lift(w);
    }
    if (p.driftCharge > 0.15 && p.grounded) {
      const col = p.driftCharge >= 1.5 ? '#ffb84d' : p.driftCharge >= 0.7 ? '#5ff2ff' : '#ffffff';
      for (const sx of wheelsX) {
        if (Math.random() < 0.6) {
          tmpV.set(sx, 0.2, 1.4).applyQuaternion(g.quaternion).add(g.position);
          app.particles.spawn(tmpV.x, tmpV.y, tmpV.z, (Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4, 0.25, 0.3, col, 4);
        }
      }
    }
    // Traînée lumineuse (cosmétique) : en l'air et pendant les turbos.
    const trail = this._trail || (this._trail = (CATALOG.trail.find((x) => x.id === profile().loadout.trail) || CATALOG.trail[0]));
    if (trail.id !== 'none' && !this.demo && (!p.grounded || p.boost > 0) && p.speed > 8) {
      const col = trail.rainbow ? `hsl(${(performance.now() / 6) % 360}, 95%, 60%)` : trail.color;
      for (let k = 0; k < 2; k++) {
        tmpV.set((Math.random() - 0.5) * 0.6, 0.6, 2.3).applyQuaternion(g.quaternion).add(g.position);
        app.particles.spawn(tmpV.x, tmpV.y, tmpV.z, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, 0.55, 0.42, col, 0);
      }
    }
    // Sillage du bateau (ou éclaboussures d'un véhicule dans l'eau).
    if (p.grounded && p.surfMod === 'water' && p.speed > 4 && Math.random() < 0.9) {
      for (const sx of [-1.1, 1.1]) {
        tmpV.set(sx, 0.2, 2.2).applyQuaternion(g.quaternion).add(g.position);
        app.particles.spawn(tmpV.x, tmpV.y, tmpV.z, sx * (1 + Math.random() * 2), 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2, 0.6, 0.55, Math.random() < 0.5 ? '#e8f8ff' : '#9fe3ff', 7);
      }
    }
    // Particules : poussière de dérapage, étincelles de boost
    if (p.grounded && p.slip > 5 && p.speed > 6 && p.surfMod !== 'water') {
      for (const sx of [-1, 1]) {
        tmpV.set(sx * 1.0, 0.15, 1.4).applyQuaternion(g.quaternion).add(g.position);
        const dust = p.surfMod === 'ice' ? '#e8f8ff' : app.scenery.theme.dust;
        app.particles.spawn(tmpV.x, tmpV.y, tmpV.z, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.7, 0.9, dust, -1);
      }
    }
    if (boosting && Math.random() < 0.8) {
      tmpV.set((Math.random() - 0.5) * 0.8, 0.4, 2.4).applyQuaternion(g.quaternion).add(g.position);
      app.particles.spawn(tmpV.x, tmpV.y, tmpV.z, -p.vel.x * 0.2 + (Math.random() - 0.5) * 3, Math.random() * 2, -p.vel.z * 0.2 + (Math.random() - 0.5) * 3, 0.35, 0.5, '#5ff2ff', 0);
    }
    app.particles.update(dt);

    // Fantômes
    this._renderGhost(alpha);
    this._renderSimGhosts(alpha);

    // Caméra
    this._camera(dt);
    if (this.multi) { const now = performance.now(); for (const rc of this.remote.values()) rc.update(now, app.camera.position); }
    app.scenery.update(this.renderPos, app.camera);

    // Audio & HUD
    if (this.state === 'racing' || this.state === 'finished') {
      app.audio.engine({ speed: p.fwdSpeed, throttle: !!inp.throttle, slip: p.grounded ? p.slip : 0, boost: boosting });
    }
    if (!this.demo) {
      const hud = app.ui.hud;
      if (this.replay && this.state === 'finished') { hud.speed(Math.abs(p.fwdSpeed) * 3.6, p.boost); return; }
      // Effet de vitesse au-delà de 180 km/h.
      const fx = app.settings.speedFx !== false ? Math.max(0, Math.min(1, (Math.abs(p.fwdSpeed) - 50) / 22)) : 0;
      app.ui.speedFx(fx * (this.camMode === 2 ? 1 : 0.8));
      if (this.state === 'racing') hud.time((this.logic.steps + alpha) * DT);
      hud.speed(Math.abs(p.fwdSpeed) * 3.6, p.boost);
    }
  }

  _renderSimGhosts(alpha) {
    for (const g of this.ghosts) {
      const p = g.runner.phys;
      const show = this.state !== 'countdown' && !g.runner.done;
      g.car.group.visible = show;
      if (!show) continue;
      const up = tmpV.set(p.n.x, p.n.y, p.n.z);
      if (!p.grounded) up.set(0, 1, 0);
      const f = tmpV2.set(p.fwd.x, p.fwd.y, p.fwd.z);
      f.addScaledVector(up, -f.dot(up));
      if (f.lengthSq() < 1e-6) f.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      f.normalize();
      const right = new THREE.Vector3().crossVectors(f, up).normalize();
      tmpM.makeBasis(right, up, f.clone().negate());
      g.q.setFromRotationMatrix(tmpM);
      g.car.group.position.set(p.prev.x + (p.pos.x - p.prev.x) * alpha, p.prev.y + (p.pos.y - p.prev.y) * alpha, p.prev.z + (p.pos.z - p.prev.z) * alpha);
      g.car.group.quaternion.slerpQuaternions(g.pq, g.q, alpha);
      if (g.car.vehicle !== p.vehicle) g.car.setVehicle(p.vehicle, true);
      if (g.car.group.position.distanceToSquared(this.renderPos) < 4) g.car.group.visible = false;
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

  // Réapparition ou recommencement : la caméra se remet d'office dans le bon sens, sans transition
  // (même si la voiture vient de mourir la tête en bas), à la bonne place et dans le bon cap.
  _camCut() {
    const p = this.phys;
    if (!this.camUp) this.camUp = new THREE.Vector3(0, 1, 0);
    this.camFlip.cut(p.gSign, this.camUp);
    this.camYaw = p.yaw;
    this._camSnap = true;               // la prochaine image pose la caméra sur sa cible au lieu de glisser vers elle
  }

  _camera(dt) {
    const cam = this.app.camera;
    const p = this.phys;
    const mode = CAM_MODES[this.camMode];
    const car = this.car.group;
    this.shake = Math.max(0, this.shake - dt * 1.8);

    const rc = this.replay && this.replayCam >= CAM_MODES.length ? REPLAY_CAMS[this.replayCam - CAM_MODES.length] : null;
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
      this._fov(mode.fov + Math.min(16, Math.abs(p.fwdSpeed) * 0.2));
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
      this._fov(mode.fov + Math.min(18, sp * 0.24));
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
      const s = this.track.surfaceAt(this.camPos.x, this.camPos.y, this.camPos.z, this._camS || (this._camS = {}), 2);
      if (this.camPos.y < s.h + 1.2) this.camPos.y = s.h + 1.2;
    } else {
      // Au plafond : jamais au-dessus de la chaussée retournée.
      const s = this.track.ceilingSurfaceAt(this.camPos.x, this.camPos.y, this.camPos.z, this._camS || (this._camS = {}), 2);
      if (Number.isFinite(s.h) && this.camPos.y > s.h - 1.2) this.camPos.y = s.h - 1.2;
    }
    cam.position.copy(this.camPos);
    if (this.shake > 0) {
      const k = this.shake * 0.25 * (this.app.settings.shakeAmt ?? 1);
      cam.position.x += (Math.random() - 0.5) * k;
      cam.position.y += (Math.random() - 0.5) * k;
    }
    const lookUp = underBridge ? Math.min(mode.lookUp, 0.8) : mode.lookUp;
    cam.lookAt(car.position.x + fx * mode.look, car.position.y + lookUp * gs, car.position.z + fz * mode.look);
    this._fov(mode.fov + Math.min(18, sp * 0.24) + (p.boost > 0 ? 5 : 0));
  }

  _fov(target) {
    const cam = this.app.camera;
    target += this.app.settings.fovAdd || 0;
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
    this.skids.dispose();
    for (const g of this.ghosts) g.car.dispose();
    if (this.multi) {
      this.multi.room.off('snapshot', this._onSnap); this.multi.room.off('left', this._onLeft);
      for (const rc of this.remote.values()) rc.dispose();
      this.remote.clear();
    }
    this.ghostCar.dispose();
    this.app.particles.clear();
    this.app.audio.engine(null);
  }
}

export { formatTime, UP };
