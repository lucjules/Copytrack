// Règles de course (sans rendu) : checkpoints, arrivée, points de réapparition.
import { CELL, LEVEL_H, ROAD_HALF, DT } from './constants.js';
import { PIECES, toLocal, sampleLocal, tileCenter, baseY } from './pieces.js';

const L = { lx: 0, lz: 0 };
const S = {};

export class RaceLogic {
  constructor(track) {
    this.track = track;
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
    return { x: c.x - fx * back, y: baseY(t), z: c.z - fz * back, yaw: -t.r * Math.PI / 2 };
  }

  reset() {
    this.collected = new Set();
    this.splits = [];
    this.finished = false;
    this.steps = 0;
    this.respawn = { ...this.spawnPoint(), moto: false, grav: 1 };
    this.inFinish = false;
  }

  get time() {
    return this.steps * DT;
  }

  // À appeler après chaque pas physique pendant la course.
  update(phys) {
    if (this.finished) return null;
    this.steps++;
    const p = phys.pos;
    const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
    let event = null;
    let onFinish = false;
    for (const tile of this.track.tilesAt(cx, cz)) {
      const sp = PIECES[tile.t].special;
      if (sp !== 'checkpoint' && sp !== 'finish') continue;
      const h = baseY(tile);
      if (p.y < h - 1.5 || p.y > h + LEVEL_H * 1.6) continue;
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
        this.respawn = { x: c.x, y: h, z: c.z, yaw, moto: phys.moto, grav: phys.gravMul };
        event = { type: 'checkpoint', index: this.splits.length, steps: this.steps };
      } else if (sp === 'finish') {
        onFinish = true;
        if (this.collected.size >= this.cps.length) {
          this.finished = true;
          event = { type: 'finish', steps: this.steps };
        } else if (!this.inFinish) {
          event = { type: 'missing', remaining: this.cps.length - this.collected.size };
        }
      }
    }
    this.inFinish = onFinish;
    return event;
  }
}
