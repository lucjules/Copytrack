// Multijoueur dans la course : voitures des autres joueurs et envoi de l'état local.
// Ces méthodes s'ajoutent au prototype de RaceSession (voir race.js) : `this` est l'instance.
import { RemoteCar } from '../remoteCar.js';
import { F_BOOST, F_GROUNDED } from '../net/snapshot.js';
import { checkpointProgress } from '../net/progress.js';
import { PRIO } from '../hudMessages.js';
import { softCollide, PROTECT_S } from '../net/collide.js';
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
      tele: this.teleSeq, cp: this.logic.collected.size, lap: this.logic.lap, prog: this.prog,
    });
  },

  // Avancement sur le circuit (0 à 1) : sur la ligne centrale du circuit quand il en a une, sinon d'après les checkpoints franchis.
  _updateProgress() {
    const lg = this.logic;
    if (this.state === 'finished' && !this._dnf) this.prog = 1;
    else if (this.progress.available) this.prog = Math.min(0.999, this.progress.update(this.phys.pos, this.progress.lapRange(lg.lap, lg.laps), this._jumped));
    else this.prog = Math.min(0.999, checkpointProgress(lg.collected.size, lg.cps.length, lg.lap, lg.laps));
    this._jumped = false;
  },

  // Avancement d'un autre joueur d'après son dernier paquet.
  progOf(id) { const rc = this.remote.get(id); return rc ? rc.prog : 0; },

  // Collisions douces (manche avec l'option « collisions ») : la voiture est repoussée par celles qu'elle chevauche. Ni en boucle (ruban), ni juste après un retour au
  // checkpoint, ni contre une voiture arrivée ou qui vient de réapparaître.
  _collide() {
    const p = this.phys;
    if (p.mode === 'ribbon' || this.tick < this.protectUntil || !this.remote.size) return;
    const now = performance.now(), others = [];
    for (const rc of this.remote.values()) if (rc.ready && !rc.finished && now - rc.teleportedAtMs > PROTECT_S * 1000) others.push(rc);
    if (others.length) softCollide(p, others);
  },

  // Fin de manche décidée par l'hôte (temps écoulé pour ceux qui n'ont pas fini) : la voiture est arrêtée, sans temps.
  cupRoundOver() {
    if (this.state !== 'racing' && this.state !== 'countdown') return;
    this._dnf = true;
    this.state = 'finished';
    this.app.audio.engine(null);
    this.app.ui.hud.message('⏱ Manche terminée', 4, PRIO.final);
  },
};
