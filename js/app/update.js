// Bandeau « nouvelle version » (0.13.1, js/updateCheck.js) : visible dans les menus et l'éditeur, caché pendant une course (body.in-race, css) : il
// réapparaît à l'arrivée. « Recharger » relance le jeu sur la nouvelle version ; « Plus tard » le retire pour cette session.
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
import { createUpdateChecker, CHECK_EVERY_MS } from '../updateCheck.js';
import { VERSION } from '../version.js';
import { esc } from '../dom.js';

export const updateMethods = {
  startUpdateCheck() {
    if (this._update) return;
    const fetchText = (url) => fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))));
    this._update = createUpdateChecker({ current: VERSION, fetchText, onNew: (v) => { this._newVersion = v; this.maybeShowUpdate(); } });
    setInterval(() => this._update.check(), CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this._update.check(); });
  },

  maybeShowUpdate() {
    const v = this._newVersion;
    if (!v || this._updateHidden) return false;
    let bar = document.getElementById('update-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'update-bar'; bar.setAttribute('role', 'status');
      document.body.appendChild(bar);
    }
    bar.innerHTML = `<span>Nouvelle version disponible :</span><b>${esc(v)}</b><button type="button" class="btn primary" data-up="reload">Recharger</button><button type="button" class="btn" data-up="later">Plus tard</button>`;
    bar.querySelector('[data-up="reload"]').onclick = () => {
      if (this.mode === 'editor' && this.session && this.session.autoSave) this.session.autoSave();
      location.reload();
    };
    bar.querySelector('[data-up="later"]').onclick = () => { this._updateHidden = true; bar.remove(); };
    return true;
  },
};
