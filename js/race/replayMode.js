// Mode replay : lecture à vitesse variable, pause, interface et fin du replay.
// Ces méthodes s'ajoutent au prototype de RaceSession (voir race.js) : `this` est l'instance.
import { DT } from '../constants.js';
import { CAM_MODES, REPLAY_CAMS } from './shared.js';
export const replayMethods = {
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
  },

  _replayHud() {
    const el = document.getElementById('replay-bar');
    if (!el) return;
    el.querySelector('.rs').textContent = this.replayPaused ? '❚❚ Pause' : `▶ ×${this.replaySpeed}`;
  },

  _replayEnded() {
    this.app.ui.hud.message('Replay terminé · Entrée : revoir', 3);
  },
};
