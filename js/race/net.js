// Multijoueur dans la course : voitures des autres joueurs et envoi de l'état local.
// Ces méthodes s'ajoutent au prototype de RaceSession (voir race.js) : `this` est l'instance.
import { RemoteCar } from '../remoteCar.js';
import { F_BOOST, F_GROUNDED } from '../net/snapshot.js';
export const netMethods = {
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
  },

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
  },
};
