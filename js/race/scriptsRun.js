// Exécution des scripts de circuit (lot 12) pendant la course : voir js/scripts.js. Effets visuels et sonores seulement. Ces méthodes s'ajoutent au prototype de RaceSession.
import { CELL } from '../constants.js';
import { PRIO } from '../hudMessages.js';
import { scriptsAt } from '../scripts.js';

export const scriptMethods = {
  // Nouvel essai : tous les déclencheurs se réarment et le décor, la météo et la musique du circuit reviennent.
  _scriptsReset() {
    const L = this.track.scripts;
    const had = this._scDone && this._scDone.size > 0;
    this._scDone = new Set();
    if (!L || !L.length || !had) return;
    const app = this.app;
    app.scenery.setTheme(app.scenery.themeId, this.track.ambiance);
    this._scriptsMusic(this.track.ambiance.music);
  },

  _scriptsUpdate() {
    const L = this.track.scripts;
    if (!L || !L.length) return;
    const p = this.phys.pos;
    for (const s of scriptsAt(L, Math.floor(p.x / CELL), Math.floor(p.z / CELL), this._scDone || (this._scDone = new Set()))) this._runScript(s);
  },

  _scriptsMusic(style) {
    const m = this.app.audio.music;
    if (style === 'none') m.stop(); else m.play(style === 'menu' ? 'menu' : 'game');
  },

  _runScript(s) {
    const app = this.app, p = this.phys.pos;
    switch (s.a) {
      case 'msg': app.ui.hud.message(s.v, 2.4, PRIO.event); break;
      case 'sky': case 'fog': case 'weather': app.scenery.setTheme(app.scenery.themeId, { ...this.track.ambiance, ...(this._scAmb || {}), [s.a]: s.v }); this._scAmb = { ...(this._scAmb || {}), [s.a]: s.v }; break;
      case 'music': this._scriptsMusic(s.v); break;
      case 'burst': app.particles.burst(p.x, p.y + 1, p.z, 36, 10, 0.8, 0.8, s.v, 2); break;
      case 'shake': this.shake = s.v === '2' ? 1.6 : 0.8; break;
      case 'sound': if (app.audio[s.v]) app.audio[s.v](); break;
      default: break;
    }
  },
};
