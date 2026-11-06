// Simulation d'une course : UNE voiture (CarPhysics), ses règles (RaceLogic) et l'enchaînement exact d'un pas, en un seul endroit.
// Elle sert à la course en direct (race.js), aux fantômes et à la vérification des temps côté serveur (replay.js, verify.js), à la
// validation des défis du jour (daily.js) et aux outils (tools/sim.mjs, tools/lab.mjs). Sans rendu, sans navigateur.
//
// Ordre d'un pas : c'est le contrat qui rend un replay identique partout (client, fantôme, serveur) :
//   1. (retour demandé : touche R)  rewind()
//   2. drive(inp)  : l'horloge des pièces mobiles et des obstacles devient le chrono de la course, puis un pas de physique
//   3. score()     : règles de course (checkpoints, arrivée), puis hors piste / noyade → réapparition automatique demandée
// step(inp) fait 2 + 3 d'un seul appel ; la course en direct les sépare pour intercaler les effets (sons, particules, caméra).
import { CarPhysics } from './physics.js';
import { RaceLogic, placeAtStart } from './raceLogic.js';
import { DT, OFF_TRACK_RESPAWN_S } from './constants.js';

// Replace la voiture au point de réapparition r (retour au checkpoint) : position, véhicule et gravité de ce moment-là.
export function placeAtRespawn(phys, r) {
  phys.place(r.x, r.y, r.z, r.yaw, r.gs || 1);
  phys.vehicle = r.vehicle || 'car';
  phys.gravMul = r.grav || 1;
}

export class Simulation {
  // partial : test depuis le curseur (pas besoin des checkpoints). offTrackLimit : temps hors piste (s) avant la réapparition automatique.
  constructor(track, { partial = false, offTrackLimit = OFF_TRACK_RESPAWN_S } = {}) {
    this.track = track;
    this.phys = new CarPhysics(track);
    this.logic = new RaceLogic(track, { partial });
    this.offTrackLimit = offTrackLimit;
    this.groundT = 0;       // temps passé hors piste (s)
    this.sank = false;      // noyade, piques : la physique a demandé la fin du pas
    this.lost = '';         // réapparition automatique demandée par le dernier pas : 'sink', 'offTrack' ou ''
  }

  // (Re)départ : règles remises à zéro, voiture au point de départ avec les paramètres du niveau. spawn : point de départ imposé
  // (test depuis le curseur de l'éditeur), qui sert aussi de point de retour.
  start(spawn = null) {
    const T = this.track;
    this.logic.reset();
    const sp = spawn || this.logic.spawnPoint();
    if (spawn) this.logic.respawn = { ...sp, vehicle: T.veh0 || 'car', grav: (T.g0 || 100) / 100 };
    placeAtStart(this.phys, this.logic, sp);
    this.groundT = 0;
    this.sank = false;
    this.lost = '';
    return sp;
  }

  // Retour au dernier checkpoint (touche R, hors piste, noyade). keepClock : le chrono continue de tourner (multijoueur).
  rewind({ keepClock = false } = {}) {
    const r = this.logic.rewind({ keepClock });
    placeAtRespawn(this.phys, r);
    this.groundT = 0;
    this.sank = false;
    this.lost = '';
    return r;
  }

  // Phase 1 d'un pas : horloge de la course puis physique.
  drive(inp) {
    this.phys.clock = this.logic.steps;
    this.phys.step(inp);
    this.sank = this.phys.ev.sink;
  }

  // Phase 2 d'un pas : règles de course puis suivi du hors-piste. Renvoie l'évènement de course (checkpoint, tour, arrivée...) ou null.
  score() {
    const ev = this.logic.update(this.phys);
    if (this.phys.offTrack) this.groundT += DT; else this.groundT = 0;
    this.lost = this.sank ? 'sink' : this.groundT > this.offTrackLimit ? 'offTrack' : '';
    return ev;
  }

  step(inp) {
    this.drive(inp);
    return this.score();
  }
}
