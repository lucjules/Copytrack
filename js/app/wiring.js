// Branchement de l'interface : clics, actions du menu, de l'éditeur, tactile, manette, clins d'œil cachés.
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
import { defaultKeys, defaultPad } from '../input.js';
import { GarageSession } from '../garage.js';
import { profile, saveProfile, addCoins } from '../profile.js';
import { $ } from '../dom.js';
import { checkPseudo } from '../account.js';
import { clearRecords } from '../storage.js';
import { fovText } from './shared.js';
export const wiringMethods = {
  // ------------------------------------------------------------ Câblage
  _wire() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) { this.audio.click(); this._action(btn.dataset.action); return; }
      const ed = e.target.closest('[data-ed]');
      if (ed && this.session && this.session.kind === 'editor') { this.audio.click(); this._editorAction(ed.dataset.ed); return; }
      const sel = e.target.closest('[data-sel]');
      if (sel && this.session && this.session.kind === 'editor') { this.audio.click(); this.session.selAction(sel.dataset.sel); }
    });

    $('opt-volume').addEventListener('input', (e) => {
      this.settings.volume = parseFloat(e.target.value);
      this.audio.setVolume(this.settings.volume);
      this.saveSettings();
    });
    $('opt-quality').addEventListener('change', (e) => {
      this.settings.quality = e.target.value;
      if (this.bench) { this.bench.finished = true; this.bench = null; }
      this._applyQuality();
      this.saveSettings();
      this.showMenu('options');
      this._startBench();
    });
    $('opt-quality-redo').addEventListener('click', () => {
      this.settings.quality = 'auto';
      this.settings.gfxProfile = '';
      $('opt-quality').value = 'auto';
      this.saveSettings();
      this.showMenu('options');
      this._startBench(true);
    });
    $('opt-ghost').addEventListener('change', (e) => { this.settings.ghost = e.target.checked; this.saveSettings(); });
    $('opt-ghostgold').addEventListener('change', (e) => { this.settings.ghostGold = e.target.checked; this.saveSettings(); });
    $('opt-ghostimp').addEventListener('change', (e) => { this.settings.ghostImported = e.target.checked; this.saveSettings(); });
    $('opt-onlinescores').addEventListener('change', (e) => { this.settings.onlineScores = e.target.checked; this.saveSettings(); });
    $('opt-telemetry').addEventListener('change', (e) => this.setTelemetry(e.target.checked));
    $('opt-editor-guided').addEventListener('change', (e) => { this.settings.editorGuided = e.target.checked; this.saveSettings(); if (this.session && this.session.kind === 'editor') this.session.setGuided(e.target.checked); });
    $('opt-music').addEventListener('input', (e) => {
      this.settings.musicVolume = parseFloat(e.target.value);
      this.audio.setMusicVolume(this.settings.musicVolume);
      this.saveSettings();
    });
    $('opt-fps').addEventListener('change', (e) => { this.settings.showFps = e.target.checked; this._applyAccess(); this.saveSettings(); });
    $('opt-speedfx').addEventListener('change', (e) => { this.settings.speedFx = e.target.checked; this.saveSettings(); });
    $('opt-cb').addEventListener('change', (e) => { this.settings.colorblind = e.target.checked; this._applyAccess(); this.saveSettings(); });
    const slider = (id, key, fmt) => {
      const inp = $(id), out = $(id + '-v');
      inp.addEventListener('input', () => {
        this.settings[key] = parseFloat(inp.value);
        if (out) out.textContent = fmt(this.settings[key]);
        this._applyAccess();
        this.saveSettings();
      });
    };
    slider('opt-fov', 'fovAdd', fovText);
    slider('opt-shake', 'shakeAmt', (v) => Math.round(v * 100) + ' %');
    slider('opt-feel', 'feel', (v) => Math.round(v * 100) + ' %');
    slider('opt-ui', 'uiScale', (v) => Math.round(v * 100) + ' %');
    $('opt-touch').addEventListener('change', (e) => {
      this.settings.touchMode = e.target.value;
      document.body.classList.toggle('drag-steer', e.target.value === 'drag');
      this.saveSettings();
    });
    $('opt-haptics').addEventListener('change', (e) => {
      this.settings.haptics = e.target.checked; this.saveSettings();
      this.input.setPadConfig({ rumble: e.target.checked });
    });
    // Pseudo d'invité modifiable (jamais « Player » / « Pilote », jamais vide) ; celui d'un compte est figé.
    $('opt-name').addEventListener('input', (e) => {
      if (this.identity.kind === 'account') { e.target.value = this.identity.username; return; }
      const c = checkPseudo(e.target.value);
      e.target.setCustomValidity(c.ok ? '' : c.error);
      e.target.classList.toggle('bad', !c.ok);
      if (c.ok) { this.settings.playerName = c.name; this.identity.username = c.name; this.saveSettings(); }
    });
    $('opt-name').addEventListener('blur', (e) => {
      if (this.identity.kind !== 'account' && !checkPseudo(e.target.value).ok) { e.target.value = this.settings.playerName; e.target.classList.remove('bad'); this.ui.flash('Pseudo inchangé : ' + checkPseudo(e.target.value).error); }
    });
    document.querySelectorAll('#prof-tabs .tab').forEach((t) => t.addEventListener('click', () => { this.audio.click(); this.setProfileTab(t.dataset.ptab); }));
    document.querySelectorAll('#bind-tabs .tab').forEach((t) => t.addEventListener('click', () => { this.audio.click(); this._renderControls(t.dataset.tab); }));
  },

  _action(a) {
    const s = this.session;
    switch (a) {
      case 'play': this.showScreen('tracks'); break;
      case 'daily': this.playDaily(); break;
      case 'community': this.showScreen('community'); break;
      case 'multi': this.multiMenu(); break;
      case 'tutorial': this.tutorial(); break;
      case 'academy': this.academyMenu(); break;
      case 'editor': this.openEditor(); break;
      case 'mytracks': this.showScreen('mytracks'); break;
      case 'import': this.importModal(false); break;
      case 'options': this.showScreen('options'); break;
      case 'controls': this.showScreen('controls'); break;
      case 'profile': this.profileTab = 'account'; this.showScreen('profile'); break;
      case 'garage': this.openGarage(); break;
      case 'garage-back': this.showMenu('menu'); break;
      case 'garage-buy': if (s instanceof GarageSession) s.buyDraft(); break;
      case 'garage-revert': if (s instanceof GarageSession) s.revertDraft(); break;
      case 'garage-moto': if (s instanceof GarageSession) s.toggleMoto(); break;
      case 'fullscreen': this.toggleFullscreen(); break;
      case 'reset-keys':
        this.input.setBindings(defaultKeys(), defaultPad());
        this.settings.keys = defaultKeys();
        this.settings.pad = defaultPad();
        this.saveSettings();
        this._renderControls();
        this.ui.flash('Commandes par défaut rétablies.');
        break;
      case 'help': this.helpModal(); break;
      case 'hud-editor': this.openHudEditor(); break;
      case 'hud-done': this.closeHudEditor(); break;
      case 'hud-reset': this.resetHudPlaces(); break;
      case 'cameras': this.openCameraEditor(); break;
      case 'ui-reset': this.resetUi(); break;
      case 'back': this.showScreen('menu'); break;
      case 'new-track': this.openEditor({ name: 'Mon circuit', code: null, fresh: true }); break;
      case 'resume': if (s && s.resume) s.resume(); break;
      case 'restart': if (s && s.restart) { this.ui.hideOverlay('pause'); s.restart(); } break;
      case 'quit': this.quitRace(); break;
      case 'watch-replay': this.watchReplay(); break;
      case 'share-ghost': this.shareGhost(); break;
      case 'export-video': if (s && s.exportVideo) s.exportVideo(); break;
      case 'leaderboard': {
        const s = this.session;
        if (s && s.trackKey) this.leaderboardModal(s.trackKey, s.track.name, s.track);
        break;
      }
      case 'next': this.nextTrack(); break;
      case 'reset-records':
        this.ui.modal({
          title: 'Effacer les records ?',
          body: '<p>Tous les temps et fantômes enregistrés dans ce navigateur seront supprimés.</p>',
          actions: [
            { label: 'Annuler' },
            { label: 'Effacer', danger: true, onClick: () => {
              clearRecords();
              this.ui.flash('Records effacés.');
            } },
          ],
        });
        break;
      default: break;
    }
  },

  _editorAction(a) {
    const ed = this.session;
    if (a === 'menu-toggle') { ed.toggleMenu(); return; }
    ed.toggleMenu(false);          // toute autre action (y compris un élément du menu hamburger) referme le menu
    switch (a) {
      case 'menu': this.leaveEditor(); break;
      case 'undo': ed.undo(); break;
      case 'redo': ed.redo(); break;
      case 'save': ed.save(); break;
      case 'test': ed.test(); break;
      case 'rotate': ed.rotate(1); break;
      case 'lvl-up': ed.setLevel(ed.level + 1); break;
      case 'lvl-down': ed.setLevel(ed.level - 1); break;
      case 'help': this.editorHelp(); break;
      case 'verify': ed.verify(); break;
      case 'params': ed.openParams(); break;
      case 'testhere': ed.testHere(); break;
      case 'levelview': ed.toggleLevelView(); break;
      case 'export': this.shareModal(ed.track.encode(), ed.track.name, ed.track); break;
      case 'import': this.importModal(true); break;
      case 'new':
        this.ui.modal({
          title: 'Nouveau circuit ?',
          body: '<p>Le circuit actuel sera remplacé (pense à l’enregistrer d’abord).</p>',
          actions: [{ label: 'Annuler' }, { label: 'Nouveau', primary: true, onClick: () => ed.newTrack() }],
        });
        break;
      default: break;
    }
  },

  _wireTouch() {
    const t = this.input.touch;
    const zone = $('t-zone');
    let zx = null;
    zone.addEventListener('pointerdown', (e) => { e.preventDefault(); zx = e.clientX; t.analog = 0; try { zone.setPointerCapture(e.pointerId); } catch { /* pointeur synthétique */ } this.audio.unlock(); });
    zone.addEventListener('pointermove', (e) => { if (zx != null) t.analog = Math.max(-1, Math.min(1, (e.clientX - zx) / 55)); });
    const end = () => { zx = null; t.analog = null; };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    document.querySelectorAll('#touch [data-t]').forEach((b) => {
      const k = b.dataset.t;
      const on = (e) => {
        e.preventDefault();
        b.classList.add('on');
        if (k in t) t[k] = true;
        else if (k === 'respawn') this.input.pressed.add('KeyR');
        else if (k === 'pause') this.input.pressed.add('Escape');
        else if (k === 'restart') this.input.pressed.add('Enter');
        this.audio.unlock();
      };
      const off = (e) => {
        e.preventDefault();
        b.classList.remove('on');
        if (k in t) t[k] = false;
      };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
    });
  },

  // ------------------------------------------------------------ Easter eggs
  _wireEggs() {
    const konami = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
    let ki = 0, typed = '';
    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'menu' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      ki = e.code === konami[ki] ? ki + 1 : e.code === konami[0] ? 1 : 0;
      if (ki === konami.length) {
        ki = 0;
        const p = profile();
        if (!p.eggs.konami) {
          p.eggs.konami = 1; p.owned['led:rainbow'] = 1; addCoins(100);
          saveProfile(); this.ui.updateCoins();
          this.ui.flash('↑↑↓↓←→←→BA : LED arc-en-ciel débloquée et +100 ◆ !', 4);
        } else this.ui.flash('Tu connais déjà ce code 😉');
        this.audio.finish(true);
      }
      if (e.key.length === 1) {
        typed = (typed + e.key.toLowerCase()).slice(-8);
        if (typed.endsWith('moto') && this.session && this.session.car) { this.session.car.setMoto(!this.session.car.isMoto); this.audio.transform(); }
        if (typed.endsWith('disco')) this._disco = !this._disco;
      }
    });
    let clicks = 0, ct = 0;
    document.querySelector('#menu .logo').addEventListener('click', () => {
      const now = performance.now();
      clicks = now - ct < 700 ? clicks + 1 : 1; ct = now;
      if (clicks >= 7) {
        clicks = 0;
        const p = profile();
        $('menu').querySelector('.logo').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg) scale(1.15)' }, { transform: 'rotate(720deg)' }], { duration: 900 });
        this.audio.finish(true);
        if (!p.eggs.logo) { p.eggs.logo = 1; addCoins(25); saveProfile(); this.ui.updateCoins(); this.ui.flash('Tu as cliqué sur le logo 7 fois : +25 ◆ !', 3); }
        else this.ui.flash('Copytrack vous salue ✦', 2);
      }
    });
  },

  // ------------------------------------------------------------ Navigation manette
  _padNav(m) {
    const visible = (el) => el.offsetParent !== null || el.getClientRects().length > 0;
    let root = null;
    if (this.ui.modalOpen) root = $('modal');
    else {
      for (const id of ['finish', 'pause']) if (!$(id).classList.contains('hidden')) { root = $(id); break; }
    }
    if (!root) root = [...document.querySelectorAll('.screen:not(.hidden), #garage:not(.hidden)')][0] || null;
    if (!root) return;
    if (m.back) {
      if (this.ui.modalOpen) { this.ui.closeModal(); return; }
      const back = root.querySelector('[data-action="back"], [data-action="garage-back"], [data-action="options"]');
      if (back) back.click();
      return;
    }
    const items = [...root.querySelectorAll('button:not([disabled]), .card, .gcard, select, input[type=checkbox], input[type=range]')].filter(visible);
    if (!items.length) return;
    const cur = document.activeElement;
    if (!items.includes(cur)) { items[0].focus(); return; }
    if (m.confirm) { cur.click(); return; }
    if (cur.type === 'range' && m.dx) {
      const step = parseFloat(cur.step) || 1;
      cur.value = parseFloat(cur.value) + m.dx * step * 2;
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (!m.dx && !m.dy) return;
    const r0 = cur.getBoundingClientRect();
    const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = null, bs = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
      const along = m.dx ? dx * m.dx : dy * m.dy;
      const cross = m.dx ? Math.abs(dy) : Math.abs(dx);
      if (along <= 4) continue;
      const score = along + cross * 2.2;
      if (score < bs) { bs = score; best = el; }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); this.audio.click(); }
  },
};
