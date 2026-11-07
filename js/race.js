// Session de course : boucle à pas fixe, caméra, fantôme, HUD, effets.
import * as THREE from './vendor/three.module.min.js';
import { DT } from './constants.js';
import { CamFlip } from './camflip.js';
import { MSG } from './hudMessages.js';
import { SEND_EVERY_STEPS, F_FINISHED } from './net/snapshot.js';
import { ProgressTracker, gridSpawn } from './net/progress.js';
import { speedLines, slipstream, rumbleLevels, PassTracker } from './feel.js';
import { Simulation } from './simulation.js';
import { SURFACES } from './pieces.js';
import { Autopilot } from './autopilot.js';
import { TrackView } from './trackMesh.js';
import { createCar } from './carModel.js';
import { getRecord, decodeFloats } from './storage.js';
import { profile } from './profile.js';
import { CATALOG, DEFAULT_LOADOUT } from './cosmetics.js';
import { SkidMarks } from './skids.js';
import { TrailRibbon } from './trail.js';
import { InputRecorder, decodeInputs, inputAt, quantSteer } from './replay.js';
import { PHYS_VER } from './version.js';
import { GHOST_VEHICLES, GHOST_EVERY, CAM_MODES, tmpM, tmpV, tmpV2 } from './race/shared.js';
import { cameraList, clampCamIndex } from './camprefs.js';

import { cameraMethods } from './race/camera.js';
import { ghostMethods } from './race/ghosts.js';
import { netMethods } from './race/net.js';
import { finishMethods } from './race/finish.js';
import { replayMethods } from './race/replayMode.js';
import { scriptMethods } from './race/scriptsRun.js';
import { trainingMethods } from './race/training.js';
import { theaterMethods } from './theater/session.js';
import { theaterCameraMethods } from './theater/cameras.js';

const CAR_COLOR = '#ffd23e';   // éclat quand la voiture retrouve sa forme d'origine (les plaques ont la couleur de leur revêtement : SURFACES)

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

    this.sim = new Simulation(track, { partial: !!opts.spawn });
    this.phys = this.sim.phys;
    this.logic = this.sim.logic;
    // Voitures identiques (règle de la partie) : tout le monde, moi compris, avec l'apparence d'origine.
    const sameCars = opts.multi && opts.multi.room.rules && opts.multi.room.rules.sameCars;
    this.car = createCar(sameCars ? DEFAULT_LOADOUT : profile().loadout);
    this.fx = profile().loadout.custom.fx;                       // effets du joueur (custom.js) : traînée, étincelles, fumée, voix
    app.audio.setVoice(this.fx);
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
    this.rivals = [];       // fantômes du haut d'un classement en ligne (setRivals)
    // Ressenti de course (feel.js) : visuel, sonore et tactile seulement. punchT / dipT : secondes depuis le dernier coup de turbo / la dernière réception forte (dipI : son intensité).
    this._feel = { punchT: 99, dipT: 99, dipI: 0, slip: 0, pass: new PassTracker(), rumbleAt: 0, self: { x: 0, z: 0, fx: 0, fz: -1, speed: 0 }, others: [] };
    // Multijoueur (opts.multi = { room, startLocal }) : pas de fantômes enregistrés, des voitures distantes à la place.
    this.multi = opts.multi || null;
    this.cup = this.multi && this.multi.cup || null;          // manche d'un championnat : { n, total, slot, count, roster, collisions } (départ commun sur une grille)
    this.progress = this.multi ? new ProgressTracker(track.path) : null;       // avancement 0..1 sur le circuit (classement en direct)
    this.prog = 0; this._jumped = false; this.protectUntil = 0; this._dnf = false;
    this.remote = new Map();
    this.teleSeq = 0;
    this.netTick = 0;     // horloge d'envoi : ne recule JAMAIS, même quand on recommence un essai (le tampon des autres joueurs en dépend)
    if (!this.demo && !this.replay && !opts.fromEditor && !this.multi) this._setupGhosts();
    if (this.multi) this._setupRemotes();
    if (opts.rivals && !this.demo && !this.replay && !this.multi) this.setRivals(opts.rivals);
    this.camList = cameraList(CAM_MODES, app.settings.cameras);          // les 4 d'origine puis celles du joueur (camprefs.js)
    this.camMode = this.demo ? 0 : clampCamIndex(app.settings.camera || 0, this.camList);

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
    this._trainSetup();          // HUD d'entraînement (profil « Entraînement » : race/training.js)
    this._theaterSetup();        // Replay Theater (opts.theater : theater/session.js)
  }

  // Message au centre de l'écran (court, trié par importance : voir hudMessages.js). m = [texte, importance, durée en s].
  _say(m) { if (!this.demo && m) this.app.ui.hud.message(m[0], m[2], m[1]); }

  loadRecord() {
    this.record = this.trackKey && !this.demo ? getRecord(this.trackKey) : null;
    // Les records d'une autre version de la physique n'ont pas de commandes rejouables.
    if (this.record && this.record.pv !== PHYS_VER) this.record = { ...this.record, inputs: null };
    this.ghostData = null;
    this.ghostVehData = this.record && Array.isArray(this.record.ghostVeh) ? this.record.ghostVeh : [];
    if (this.record && this.record.ghost) {
      try { this.ghostData = decodeFloats(this.record.ghost); } catch { this.ghostData = null; }
    }
  }

  restart() {
    const app = this.app;
    this._telemetryQuit();
    this._tmDone = false;
    this._scAmb = null;
    this._scriptsReset();
    // Manche d'un championnat : chacun part de sa place sur la grille (le premier devant, quatre de front).
    let spawn = this.opts.spawn;
    if (this.cup && !spawn) { this.logic.reset(); spawn = gridSpawn(this.logic.spawnPoint(), this.cup.slot, this.cup.count); }
    const sp = this.sim.start(spawn);
    if (this.cup && !this.opts.spawn) this.logic.respawn.snap = this.logic._snap();      // le point de départ sert de retour, avec l'état de la course à ce moment-là
    this.prog = 0; this._jumped = true; this.protectUntil = 0; this._dnf = false;
    if (this.progress) this.progress.reset();
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
    for (const g of this.ghosts) g.car.group.visible = false;      // (le fantôme est une suite déterministe : sa course, déjà calculée, est relue, pas rejouée)
    this.countT = 0;
    this.countShown = -1;
    this.acc = 0;
    this.ghostRec = [];
    this.ghostVeh = [];          // changements de véhicule du fantôme enregistré : [image, id]
    this.finishT = 0;
    this.lastSplitShown = 0;
    this.wheelSpin = 0;
    app.particles.clear();
    this.skids.clear();
    if (this.trailRib) this.trailRib.reset();
    if (this.bot) this.bot.reset(this.phys);
    if (!this.demo) {
      app.ui.hud.reset(this);
      app.ui.hideOverlay('finish');
    }
    this.car.flames.forEach((f) => { f.visible = false; });
    if (this._train) this._trainReset();
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
    const r = this.sim.rewind({ keepClock: !!this.multi });      // (remet aussi la voiture au point de retour, avec son véhicule et sa gravité)
    if (this._train) this._trainRespawn();
    Object.assign(this.stats, this.statsSnap);       // les réceptions, turbos et anneaux d'après le checkpoint ne comptent plus
    if (this.multi) { this.teleSeq = (this.teleSeq + 1) & 255; this._jumped = true; this.protectUntil = this.tick + 240; }       // 2 s sans collision après un retour au checkpoint
    const steps = this.logic.steps;
    this.ghostRec.length = Math.min(this.ghostRec.length, Math.floor(steps / GHOST_EVERY) * 7);
    while (this.ghostVeh.length && this.ghostVeh[this.ghostVeh.length - 1][0] >= this.ghostRec.length / 7) this.ghostVeh.pop();
    if (!this.demo) {
      this.app.ui.hud.checkpoints(this.logic.collected.size, this.logic.cps.length, this.logic.lap, this.logic.laps);
      this.app.ui.hud.time(steps * DT);
    }
    this.car.setVehicle(this.phys.vehicle, true);
    this.up.set(this.phys.n.x, this.phys.n.y, this.phys.n.z);
    this._orient();
    this.prevQuat.copy(this.quat);
    this._camCut();
    if (this.trailRib) this.trailRib.reset();      // pas de traînée qui traverse la téléportation
    if (this.multi) { this._sendNet(); this._say(MSG.keepClock); }
    this.app.audio.respawn();
    this.app.particles.clear();        // les étincelles, la poussière et la fumée de l'endroit d'où l'on vient ne suivent pas la voiture
    this.app.particles.burst(r.x, r.y + 1.5, r.z, 24, 8, 0.6, 0.7, '#5ff2ff', 0);
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
    if (this.state === 'racing') this.tick++;
    this.lastInput = inp;
    this.prevQuat.copy(this.quat);
    if (this.cup && this.cup.collisions && this.state === 'racing') this._collide();      // collisions douces entre voitures (net/collide.js)
    this.sim.drive(inp);      // horloge des obstacles et pièces mobiles = chrono, puis un pas de physique
    this._orient();
    if (this.multi && ++this.netTick % SEND_EVERY_STEPS === 0) { this._updateProgress(); this._sendNet(this.state === 'finished' && !this._dnf ? F_FINISHED : 0); }
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
    if (ev.boostHit || ev.miniTurbo) this._feel.punchT = 0;                      // coup de champ de vision (feel.js)
    if (ev.land > 4) { this._feel.dipT = 0; this._feel.dipI = ev.land; }          // tassement de la caméra à la réception
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
      app.particles.burst(p.x, p.y + 0.5, p.z, 16, 7, 0.4, 0.5, this.fx.spark || (ev.miniTurbo === 2 ? '#ffb84d' : '#5ff2ff'), 2);
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
    if (ev.transform) {
      const veh = this.phys.vehicle;
      this.car.setVehicle(veh);
      app.audio.transform();
      const p = this.phys.pos;
      const col = veh === 'car' ? CAR_COLOR : SURFACES[veh].c[0];      // (la couleur d'une plaque est celle de son revêtement : une seule table)
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
      const res = this.sim.score();
      if (!this.demo && this.logic.steps % GHOST_EVERY === 0) {
        const p = this.phys.pos, q = this.quat;
        const vid = GHOST_VEHICLES.indexOf(this.phys.vehicle), last = this.ghostVeh.length ? this.ghostVeh[this.ghostVeh.length - 1][1] : 0;
        if (vid !== last) this.ghostVeh.push([this.ghostRec.length / 7, vid]);
        this.ghostRec.push(p.x, p.y, p.z, q.x, q.y, q.z, q.w);
      }
      if (res) this._event(res);

      // Hors piste (0,5 s) ou noyade : réapparition automatique (le suivi du hors-piste est dans Simulation.score).
      if (sank && this.state === 'racing') { if (this.demo) this.restart(); else this.respawn(); return; }
      if (this.sim.groundT > this.sim.offTrackLimit) {
        if (this.demo) this.restart(); else { this._say(MSG.offTrack); this.respawn(); }
      }
    }
  }

  _snapStats() { const s = this.stats; this.statsSnap = { perfects: s.perfects, turbos: s.turbos, rings: s.rings }; }

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
      if (this.state === 'paused') return this.render(dt, this.acc / DT);      // (même interpolation qu'avant la pause : la voiture ne recule pas d'un pas)
      // Manche d'un championnat : pas de nouvel essai (une seule course par manche) ; le retour au checkpoint (R), lui, reste possible.
      if (input.act('restart') || input.hit('NumpadEnter')) { if (this.cup) { /* une seule course par manche */ } else if (this.multi) this._newAttempt(); else { this.restart(); return; } }
      if (input.act('respawn') && !this.replay) { if (this.multi && this.state === 'finished') { if (!this.cup) this._newAttempt(); } else this.respawn(true); }
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
          if (this.opts.academy) this._say([this.opts.academy.tip, 1, 7]);      // consigne de la leçon (Académie)
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
    // Obstacles et pièces mobiles : même temps que la physique (chrono), interpolé.
    if (this.state === 'racing') this.obsT = Math.max(0, (this.logic.steps - 1 + alpha) * DT);
    else if (this.state === 'finished') this.obsT = (this.obsT || 0) + dt;
    else if (this.obsT == null || this.state === 'countdown') this.obsT = 0;
    this.view.updateMoving(this.obsT);
    this.view.updateLights(app.camera.position, this.obsT);
    // Dalles de verre brisées : visibles de nouveau dès qu'un (re)départ les restaure.
    if (this.phys.brokenVer !== this._brokenV) { this._brokenV = this.phys.brokenVer; this.view.setBroken(this.phys.broken); }
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
    // Pause (course ou replay) : le monde est figé, il ne naît ni particule, ni trace, ni scintillement de flamme.
    const frozen = this.state === 'paused' || (this.replay && this.replayPaused);
    const boosting = p.boost > 0;
    for (const f of this.car.flames) {
      f.visible = boosting;
      if (boosting && !frozen) f.scale.set(1, 1.2 + Math.random() * 1.2, 1);
    }

    // Traces de pneus (glisse ou gros freinage) et étincelles du mini-turbo en charge.
    const sliding = p.grounded && !p.rib && p.speed > 8 && (p.slip > 0.06 * Math.abs(p.fwdSpeed) + 1.2 || (inp.brake && p.fwdSpeed > 12 && !inp.throttle));
    const wheelsX = this.car.vehicle === 'boat' ? [] : this.car.isMoto ? [0] : [-0.95, 0.95];
    tmpV2.set(1, 0, 0).applyQuaternion(g.quaternion);
    const lean = !!(app.quality && app.quality.profile && app.quality.profile.lean);   // Ultra Potato : ni traces de pneus, ni étincelles, ni traînée
    for (let w = 0; w < 2; w++) {
      if (frozen) continue;
      if (sliding && !lean && w < wheelsX.length) {
        tmpV.set(wheelsX[w], 0, 1.3).applyQuaternion(g.quaternion).add(g.position);
        this.skids.add(w, tmpV.x, tmpV.y, tmpV.z, tmpV2.x, tmpV2.z, this.car.isMoto ? 0.22 : 0.3, p.gSign < 0 ? -0.04 : 0.04);
      } else this.skids.lift(w);
    }
    if (p.driftCharge > 0.15 && p.grounded && !lean && !frozen) {
      const col = this.fx.spark || (p.driftCharge >= 1.5 ? '#ffb84d' : p.driftCharge >= 0.7 ? '#5ff2ff' : '#ffffff');
      for (const sx of wheelsX) {
        if (Math.random() < 0.6) {
          tmpV.set(sx, 0.2, 1.4).applyQuaternion(g.quaternion).add(g.position);
          app.particles.spawn(tmpV.x, tmpV.y, tmpV.z, (Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4, 0.25, 0.3, col, 4);
        }
      }
    }
    // Traînée lumineuse (cosmétique) : un ruban toujours présent, dont l'intensité suit la vitesse et le boost (voir trail.js).
    const trail = this._trail || (this._trail = (CATALOG.trail.find((x) => x.id === profile().loadout.trail) || CATALOG.trail[0]));
    const trailColor = this.fx.trailC || (trail.rainbow ? null : trail.color);
    if ((trail.id !== 'none' || this.fx.trailC) && !this.demo && !this.replay && !lean) {
      if (!this.trailRib) this.trailRib = new TrailRibbon(app.scene);
      if (!frozen) {
        tmpV.set(0, 0.7, 2.3).applyQuaternion(g.quaternion).add(g.position);
        tmpV2.set(1, 0, 0).applyQuaternion(g.quaternion);
        this.trailRib.update(dt, tmpV, tmpV2, p.speed, Math.min(1, p.boost), trailColor, performance.now() / 1000, app.camera.position, this.fx.trailLen);
      }
    } else if (this.trailRib) this.trailRib.reset();
    // Sillage du bateau (ou éclaboussures d'un véhicule dans l'eau).
    if (!frozen && p.grounded && p.surfMod === 'water' && p.speed > 4 && Math.random() < 0.9) {
      for (const sx of [-1.1, 1.1]) {
        tmpV.set(sx, 0.2, 2.2).applyQuaternion(g.quaternion).add(g.position);
        app.particles.spawn(tmpV.x, tmpV.y, tmpV.z, sx * (1 + Math.random() * 2), 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2, 0.6, 0.55, Math.random() < 0.5 ? '#e8f8ff' : '#9fe3ff', 7);
      }
    }
    // Particules : poussière de dérapage, étincelles de boost
    if (!frozen && p.grounded && p.slip > 5 && p.speed > 6 && p.surfMod !== 'water') {
      for (const sx of [-1, 1]) {
        tmpV.set(sx * 1.0, 0.15, 1.4).applyQuaternion(g.quaternion).add(g.position);
        const dust = this.fx.smoke || (p.surfMod === 'ice' ? '#e8f8ff' : app.scenery.theme.dust);
        app.particles.spawn(tmpV.x, tmpV.y, tmpV.z, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.7, 0.9, dust, -1);
      }
    }
    if (boosting && !frozen && Math.random() < 0.8) {
      tmpV.set((Math.random() - 0.5) * 0.8, 0.4, 2.4).applyQuaternion(g.quaternion).add(g.position);
      app.particles.spawn(tmpV.x, tmpV.y, tmpV.z, -p.vel.x * 0.2 + (Math.random() - 0.5) * 3, Math.random() * 2, -p.vel.z * 0.2 + (Math.random() - 0.5) * 3, 0.35, 0.5, '#5ff2ff', 0);
    }
    app.particles.update(dt);

    // Fantômes
    this._renderGhost(alpha, dt);
    this._renderSimGhosts(alpha, dt);
    this._renderRivals(alpha, dt);

    // Caméra
    this._camera(dt);
    if (this.multi) {
      const now = performance.now();
      for (const rc of this.remote.values()) rc.update(now, app.camera.position);
      if (this.cup && now - (this._boardT || 0) > 250) { this._boardT = now; app._updateBoard(); }       // classement en direct : 4 fois par seconde suffisent
    }
    app.scenery.update(this.renderPos, app.camera);

    this._feelUpdate(dt);
    if (this.state === 'racing') this._scriptsUpdate();
    // Audio & HUD
    if (this.state === 'racing') {
      app.audio.engine({ speed: p.fwdSpeed, throttle: !!inp.throttle, slip: p.grounded ? p.slip : 0, boost: boosting, draft: this._feel.slip * this._feelScale() });
      app.audio.music.setSpeed(boosting ? 1.2 : Math.min(1, Math.max(0, p.fwdSpeed) / 50));
    }
    if (!this.demo) {
      const hud = app.ui.hud;
      if (this.replay && this.state === 'finished') { hud.speed(Math.abs(p.fwdSpeed) * 3.6, p.boost); return; }
      // Lignes de vitesse GRADUÉES (dès 126 km/h, plein effet vers 360 km/h) ; l'aspiration derrière une voiture les renforce (feel.js). Réglage « Sensations » : 0 = aucune de ces nouveautés.
      const sc = this._feelScale();
      const base = app.settings.speedFx !== false ? speedLines(p.fwdSpeed) : 0;
      const fx = sc > 0 ? Math.min(1, Math.max(base * sc, this._feel.slip * 0.6 * sc)) : app.settings.speedFx !== false ? Math.max(0, Math.min(1, (Math.abs(p.fwdSpeed) - 62) / 38)) : 0;
      app.ui.speedFx(fx * (this.camMode === 2 ? 1 : 0.8));
      if (this.state === 'racing') hud.time((this.logic.steps + alpha) * DT);
      hud.speed(Math.abs(p.fwdSpeed) * 3.6, p.boost);
      if (this._train) this._trainUpdate();
    }
  }

  // Ressenti : fait avancer les minuteries, mesure l'aspiration et les croisements, fait vibrer la manette. Aucun effet sur la physique.
  _feelUpdate(dt) {
    const F = this._feel, sc = this._feelScale(), p = this.phys;
    F.punchT += dt; F.dipT += dt;
    if (sc <= 0 || this.demo || this.state === 'countdown' || this.state === 'paused') { F.slip += (0 - F.slip) * Math.min(1, dt * 6); return; }
    const gp = this.renderPos;
    const fwdX = -Math.sin(p.yaw), fwdZ = -Math.cos(p.yaw);
    const self = F.self; self.x = gp.x; self.z = gp.z; self.fx = fwdX; self.fz = fwdZ; self.speed = p.fwdSpeed;
    // Les autres voitures visibles : fantômes (record, or, importé), rivaux du classement, joueurs distants.
    const others = F.others; others.length = 0;
    const add = (id, g) => { if (g && g.visible) others.push({ id, x: g.position.x, z: g.position.z, speed: 0 }); };
    add('rec', this.ghostCar.group);
    this.ghosts.forEach((g, i) => add('g' + i, g.car.group));
    this.rivals.forEach((r, i) => add('r' + i, r.car.group));
    for (const [id, rc] of this.remote) add('m' + id, rc.group);
    const target = this.state === 'racing' && p.grounded ? slipstream(self, others) : 0;
    F.slip += (target - F.slip) * Math.min(1, dt * 6);
    if (this.replay || this.state !== 'racing') return;
    if (F.pass.update(self, others, dt)) this.app.audio.whoosh();
    // Vibrations de manette graduées : toutes les 110 ms au plus.
    const now = performance.now();
    if (now - F.rumbleAt > 110) {
      F.rumbleAt = now;
      const lv = rumbleLevels({ speed: p.fwdSpeed, slip: p.grounded ? p.slip : 0, offTrack: !!p.offTrack, boosting: p.boost > 0, grounded: p.grounded, scale: sc });
      if (lv.strong + lv.weak > 0.03) this.app.input.rumble(lv.strong, lv.weak, 140);
    }
  }

  dispose() {
    this._telemetryQuit();
    this._trainDispose();
    this._theaterDispose();
    this.app.camera.up.set(0, 1, 0);
    this.view.dispose();
    this.car.dispose();
    this.skids.dispose();
    for (const g of this.ghosts) g.car.dispose();
    this._clearRivals();
    if (this._rec) this._cancelVideo();
    if (this.multi) {
      this.multi.room.off('snapshot', this._onSnap); this.multi.room.off('left', this._onLeft);
      for (const rc of this.remote.values()) rc.dispose();
      this.remote.clear();
    }
    if (this.trailRib) { this.trailRib.dispose(); this.trailRib = null; }
    this.ghostCar.dispose();
    this.app.particles.clear();
    this.app.audio.engine(null);
  }
}

// Les familles de méthodes vivent dans race/ ; elles s'ajoutent au prototype (`this` est l'instance).
Object.assign(RaceSession.prototype, cameraMethods, ghostMethods, netMethods, finishMethods, replayMethods, scriptMethods, trainingMethods, theaterMethods, theaterCameraMethods);
