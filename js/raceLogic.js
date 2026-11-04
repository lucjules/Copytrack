// Règles de course (sans rendu) : checkpoints, arrivée, points de réapparition.
import { CELL, LEVEL_H, ROAD_HALF, DT } from './constants.js';
import { PIECES, RING_R, RING_Y, toLocal, sampleLocal, tileCenter, baseY } from './pieces.js';

const L = { lx: 0, lz: 0 };
const S = {};

export class RaceLogic {
  constructor(track, opts = {}) {
    this.track = track;
    this.laps = Math.max(1, track.laps || 1);
    this.partial = !!opts.partial;   // test depuis le curseur : pas besoin des checkpoints
    this.cps = track.tiles.filter((t) => PIECES[t.t].special === 'checkpoint');
    this.startTile = track.startTile;
    this.reset();
  }

  spawnPoint() {
    const t = this.startTile;
    if (!t) return { x: CELL / 2, y: 0.4, z: CELL / 2, yaw: 0 };
    const c = tileCenter(t);
    // On recule un peu pour que la voiture parte derrière la ligne.
    const back = 4;
    const fx = [0, 1, 0, -1][t.r], fz = [-1, 0, 1, 0][t.r];
    // Départ posé à l'envers : la course commence en gravité inversée.
    return { x: c.x - fx * back, y: baseY(t), z: c.z - fz * back, yaw: -t.r * Math.PI / 2, gs: t.v ? -1 : 1 };
  }

  reset() {
    this.collected = new Set();
    this.splits = [];
    this.finished = false;
    this.steps = 0;
    this.lap = 1;
    const T = this.track;
    this.respawn = { ...this.spawnPoint(), vehicle: T.veh0 || 'car', grav: (T.g0 || 100) / 100, snap: this._snap() };
    this.inFinish = false;
  }

  // État de course au passage d'un checkpoint : y revenir remet le chrono à ce temps.
  _snap() {
    return { steps: this.steps, splits: this.splits.length, collected: [...this.collected], lap: this.lap };
  }

  // Retour au dernier checkpoint passé (touche R ou réapparition automatique) :
  // le chrono, les temps intermédiaires et le tour reviennent à ce moment-là.
  // keepClock (multijoueur) : le chronomètre NE revient PAS en arrière, il continue de tourner : le retour au
  // checkpoint coûte donc tout le temps perdu (pénalité). Les checkpoints, le tour et les temps intermédiaires
  // reviennent, eux, à l'état du checkpoint.
  rewind({ keepClock = false } = {}) {
    const s = this.respawn.snap;
    if (s) {
      if (!keepClock) this.steps = s.steps;
      this.splits.length = Math.min(this.splits.length, s.splits);
      this.collected = new Set(s.collected);
      this.lap = s.lap;
    }
    this.finished = false;
    this.inFinish = false;
    return this.respawn;
  }

  // Point de réapparition d'un checkpoint aérien : la dernière route roulable traversée
  // (mémorisée par la course), sinon l'anneau lui-même au niveau de sa base.
  _ringRespawn(tile, phys) {
    if (this.lastGround) return { ...this.lastGround };
    const c = tileCenter(tile);
    return { x: c.x, y: baseY(tile), z: c.z, yaw: phys.yaw };
  }

  get time() {
    return this.steps * DT;
  }

  // À appeler après chaque pas physique pendant la course.
  update(phys) {
    if (this.finished) return null;
    this.steps++;
    const p = phys.pos;
    // Dernière position stable au sol (sert à réapparaître avant un checkpoint aérien).
    if (phys.grounded && !phys.rib && phys.surfType === 'road' && this.steps % 30 === 0) {
      this.lastGround = { x: p.x, y: p.y, z: p.z, yaw: phys.yaw };
    }
    const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
    let event = null;
    let onFinish = false;
    for (const tile of this.track.tilesAt(cx, cz)) {
      const P = PIECES[tile.t];
      const sp = P.special;
      if (sp !== 'checkpoint' && sp !== 'finish') continue;
      const h = baseY(tile);
      if (P.kind === 'ring') {
        // Checkpoint aérien : il faut passer dans l'anneau.
        if (this.collected.has(tile)) continue;
        toLocal(tile, p.x, p.z, L);
        const lz1 = L.lz, lx1 = L.lx;
        toLocal(tile, phys.prev.x, phys.prev.z, L);
        if (lz1 * L.lz > 0 || lz1 === L.lz) continue;
        const k = L.lz / (L.lz - lz1);
        const lx = L.lx + (lx1 - L.lx) * k, y = phys.prev.y + (p.y - phys.prev.y) * k;
        if (Math.hypot(lx, y - (h + RING_Y)) > RING_R + 0.5) continue;
        this.collected.add(tile);
        this.splits.push(this.steps);
        // Réapparition : juste avant l'anneau, au sol de la pièce précédente si possible.
        this.respawn = { ...this._ringRespawn(tile, phys), vehicle: phys.vehicle, grav: phys.gravMul, gs: phys.gSign, snap: this._snap() };
        event = { type: 'checkpoint', index: this.splits.length, steps: this.steps };
        continue;
      }
      // Fenêtre haute : on peut passer un checkpoint en sautant (bosse juste avant).
      if (tile.v ? (p.y > h + 1.5 || p.y < h - LEVEL_H * 2.5) : (p.y < h - 1.5 || p.y > h + LEVEL_H * 2.5)) continue;
      toLocal(tile, p.x, p.z, L);
      sampleLocal(tile, L.lx, L.lz, S);
      if (!S.inFootprint || Math.abs(S.d) > ROAD_HALF + 1.5) continue;
      if (sp === 'checkpoint' && !this.collected.has(tile)) {
        this.collected.add(tile);
        this.splits.push(this.steps);
        const c = tileCenter(tile);
        const base = -tile.r * Math.PI / 2;
        let yaw = base;
        let da = phys.yaw - base;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) > Math.PI / 2) yaw = base + Math.PI;
        this.respawn = { x: c.x, y: h, z: c.z, yaw, vehicle: phys.vehicle, grav: phys.gravMul, gs: phys.gSign, snap: this._snap() };
        event = { type: 'checkpoint', index: this.splits.length, steps: this.steps };
      } else if (sp === 'finish') {
        onFinish = true;
        if (this.inFinish) continue;
        if (this.partial || this.collected.size >= this.cps.length) {
          if (this.lap < this.laps && !this.partial) {
            // Tour suivant : les checkpoints sont à reprendre.
            this.lap++;
            this.collected.clear();
            this.splits.push(this.steps);
            // Le passage de la ligne sert aussi de point de retour pour le nouveau tour.
            this.respawn = { x: p.x, y: h, z: p.z, yaw: phys.yaw, vehicle: phys.vehicle, grav: phys.gravMul, gs: phys.gSign, snap: this._snap() };
            event = { type: 'lap', lap: this.lap, laps: this.laps, index: this.splits.length, steps: this.steps };
          } else {
            this.finished = true;
            event = { type: 'finish', steps: this.steps };
          }
        } else {
          event = { type: 'missing', remaining: this.cps.length - this.collected.size };
        }
      }
    }
    this.inFinish = onFinish;
    return event;
  }
}

// Place la voiture au départ avec les paramètres du niveau (véhicule, gravité, vitesse
// de départ). sp : point de départ (par défaut celui du circuit).
export function placeAtStart(phys, logic, sp = logic.spawnPoint()) {
  const T = logic.track;
  phys.place(sp.x, sp.y, sp.z, sp.yaw, sp.gs || 1);
  phys.vehicle = T.veh0 || 'car';
  phys.gravMul = (T.g0 || 100) / 100;
  const v0 = (T.v0 || 0) / 3.6;
  if (v0 > 0) { phys.vel.x = -Math.sin(sp.yaw) * v0; phys.vel.z = -Math.cos(sp.yaw) * v0; phys.fwdSpeed = v0; }
}
