// Mode replay : lecture à vitesse variable, pause, interface et fin du replay.
// Ces méthodes s'ajoutent au prototype de RaceSession (voir race.js) : `this` est l'instance.
import { DT } from '../constants.js';
import { CAM_MODES, REPLAY_CAMS } from './shared.js';
import { CanvasRecorder, videoSupported, videoFileName, downloadBlob } from '../videoExport.js';
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
    if (this._rec) this._videoTick(dt);
  },

  _replayHud() {
    const el = document.getElementById('replay-bar');
    if (!el) return;
    el.querySelector('.rs').textContent = this._rec ? `● REC ${this._rec.seconds.toFixed(0)} s` : this.replayPaused ? '❚❚ Pause' : `▶ ×${this.replaySpeed}`;
    const b = el.querySelector('#replay-export');
    if (b) b.textContent = this._rec ? '■ Annuler' : '🎬 Vidéo';
  },

  // ---- Export en vidéo : le replay est rejoué depuis le début et la scène 3D est enregistrée (WebM, sans son, sans interface) ----------------------------
  // speed : vitesse de lecture pendant l'enregistrement (1 : temps réel ; plus : clip plus court et plus rapide).
  exportVideo({ speed = 1 } = {}) {
    if (!this.replay) return false;
    if (this._rec) { this._cancelVideo(); return false; }                      // un second appui annule
    const canvas = this.app.renderer.domElement;
    if (!videoSupported(canvas)) { this.app.ui.flash('Export vidéo indisponible dans ce navigateur (Chrome, Edge ou Firefox récents).', 4); return false; }
    this.restart();
    this.replayPaused = false; this.replaySpeed = speed;
    try { this._rec = new CanvasRecorder(canvas).start(); } catch (e) { this.app.ui.flash(e.message, 4); return false; }
    this._recTail = 0;
    this._replayHud();
    return true;
  },

  _videoTick(dt) {
    if (this._recLast === undefined || Math.floor(this._rec.seconds) !== this._recLast) { this._recLast = Math.floor(this._rec.seconds); this._replayHud(); }
    if (this.state === 'finished') { this._recTail += dt; if (this._recTail > 1.5) this._finishVideo(); }      // on garde un instant de la ligne d'arrivée
    else if (this._rec.seconds > 900) this._cancelVideo();
  },

  async _finishVideo() {
    const rec = this._rec;
    this._rec = null; this._recLast = undefined;
    this._replayHud();
    const blob = await rec.stop();
    const t = this.opts.replay && this.opts.replay.time;
    const name = videoFileName(this.track.name, t, rec.mime);
    downloadBlob(blob, name);
    this.lastVideo = { name, size: blob.size, type: blob.type };
    this.app.ui.flash(`🎬 Vidéo enregistrée : ${name} (${(blob.size / 1048576).toFixed(1)} Mo)`, 5);
  },

  _cancelVideo() {
    if (!this._rec) return;
    this._rec.cancel();
    this._rec = null; this._recLast = undefined;
    this._replayHud();
    this.app.ui.flash('Enregistrement annulé.', 2);
  },

  _replayEnded() {
    this.app.ui.hud.message('Replay terminé · Entrée : revoir', 3);
  },
};
