// Réglages : qualité graphique et banc d'essai, commandes (clavier, manette), options, accessibilité.
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
import { renderOptions } from '../renderOptions.js';
import { KEY_ACTIONS, PAD_ACTIONS, keyLabel, padLabel } from '../input.js';
import { $, esc } from '../dom.js';
import { Benchmark, PROFILES, PROFILE_LABELS, BENCH_VERSION, hardwareHints } from '../quality.js';
import { fovText } from './shared.js';
export const settingsMethods = {
  // Profil réellement appliqué : le choix du joueur, ou (automatique) le résultat de la détection (« Haute » en attendant).
  _qualityName() {
    const q = this.settings.quality;
    return q === 'auto' ? (this.settings.gfxProfile || 'high') : (PROFILES[q] ? q : 'high');
  },

  _applyQuality() {
    this.quality.apply(this._qualityName());
    this._renderQualityInfo();
  },

  _renderQualityInfo() {
    const el = $('opt-quality-info');
    if (!el) return;
    const s = this.settings, now = PROFILE_LABELS[this.quality.name] || '';
    el.textContent = s.quality === 'auto'
      ? (this.bench ? 'Détection en cours sur l’animation du menu…' : s.gfxProfile ? `Détecté : ${PROFILE_LABELS[s.gfxProfile]} (${s.gfxFps} i/s). Baisse auto si ça saccade.` : `Profil actuel : ${now}.`)
      : `Profil choisi : ${now}.`;
  },

  // Benchmark invisible : on mesure la fluidité de l'animation de fond du menu (voir quality.js), sans rien montrer.
  _startBench(force = false) {
    const s = this.settings;
    if (s.quality !== 'auto' || this.bench) return;
    if (!force && s.gfxProfile && s.gfxV === BENCH_VERSION) return;
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const hints = hardwareHints({
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '', ua: navigator.userAgent, touch: document.body.classList.contains('touch'),
      width: window.innerWidth, cores: navigator.hardwareConcurrency, memory: navigator.deviceMemory,
    });
    this.bench = new Benchmark({
      start: hints.start,
      apply: (p) => this.quality.apply(p),
      done: (r) => {
        s.gfxProfile = r.profile; s.gfxV = BENCH_VERSION; s.gfxFps = r.fps;
        this.saveSettings();
        this.bench = null;
        this._renderQualityInfo();
      },
    });
    this._renderQualityInfo();
  },

  // ------------------------------------------------------------ Commandes
  _renderControls(tab = this._bindTab || 'race') {
    this._bindTab = tab;
    document.querySelectorAll('#bind-tabs .tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
    $('bind-hint').textContent = tab === 'pad'
      ? 'Clique une case, puis le bouton voulu (Échap : annuler). Éditeur : stick droit = curseur, gâchettes = zoom.'
      : 'Clique une case, puis la touche voulue (Échap : annuler, × : vider).';
    const list = $('bind-list');
    list.innerHTML = '';
    const s = this.settings;
    if (tab === 'pad') {
      const slider = (label, key, min, max, step, fmt) => {
        const row = document.createElement('div');
        row.className = 'bind-slider';
        row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}"><b>${fmt(s[key])}</b>`;
        const inp = row.querySelector('input'), out = row.querySelector('b');
        inp.oninput = () => {
          s[key] = parseFloat(inp.value); out.textContent = fmt(s[key]); this.saveSettings();
          this.input.setPadConfig({ deadzone: s.padDeadzone, sens: s.padSens, rumble: s.haptics });
        };
        list.appendChild(row);
      };
      slider('Zone morte du stick', 'padDeadzone', 0, 0.4, 0.01, (v) => Math.round(v * 100) + ' %');
      slider('Sensibilité de la direction', 'padSens', 0.6, 1.6, 0.05, (v) => '×' + v.toFixed(2));
      const groups = [['Course', PAD_ACTIONS.race], ['Menus', PAD_ACTIONS.menu], ['Éditeur', PAD_ACTIONS.editor]];
      for (const [gl, acts] of groups) {
        const gh = document.createElement('div');
        gh.className = 'bind-group';
        gh.textContent = gl;
        list.appendChild(gh);
        for (const [id, label] of acts) {
          const cur = this.input.pad[id] || [-1, -1];
          const lbl = document.createElement('div');
          lbl.className = 'lbl';
          lbl.textContent = label;
          list.appendChild(lbl);
          for (let slot = 0; slot < 2; slot++) {
            const b = document.createElement('button');
            b.className = 'bind-key';
            b.innerHTML = `<span>${padLabel(cur[slot])}</span>`;
            b.addEventListener('click', () => this._capturePad(id, slot, b));
            list.appendChild(b);
          }
        }
      }
      return;
    }
    const group = KEY_ACTIONS[tab];
    for (const [id, label] of group) {
      const cur = this.input.bindings[id] || ['', ''];
      const lbl = document.createElement('div');
      lbl.className = 'lbl';
      lbl.textContent = label;
      list.appendChild(lbl);
      for (let slot = 0; slot < 2; slot++) {
        const b = document.createElement('button');
        b.className = 'bind-key';
        b.innerHTML = `<span>${esc(keyLabel(cur[slot]))}</span>${cur[slot] ? '<span class="x" title="Vider">×</span>' : ''}`;
        b.addEventListener('click', (e) => {
          if (e.target.classList.contains('x')) {
            this._setKey(id, slot, '');
            this._renderControls();
            return;
          }
          b.classList.add('wait');
          b.innerHTML = '<span>Appuie sur une touche…</span>';
          this.input.captureKey((code) => {
            if (code) {
              const moved = this._setKey(id, slot, code, tab);
              if (moved) this.ui.flash(`« ${keyLabel(code)} » retirée de : ${moved}`);
            }
            this._renderControls();
          });
        });
        list.appendChild(b);
      }
    }
  },

  _setKey(id, slot, code, tab = null) {
    const keys = this.input.bindings;
    let moved = null;
    if (code && tab) {
      for (const [other, label] of KEY_ACTIONS[tab]) {
        const arr = keys[other];
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] === code && !(other === id && i === slot)) { arr[i] = ''; moved = label; }
        }
      }
    }
    keys[id] = (keys[id] || ['', '']).slice();
    keys[id][slot] = code;
    this.settings.keys = { ...keys };
    this.saveSettings();
    return moved;
  },

  _capturePad(id, slot, btn) {
    btn.classList.add('wait');
    btn.innerHTML = '<span>Appuie sur un bouton…</span>';
    this.input.padButtonPressed();
    const started = performance.now();
    let cancelled = false;
    this.input.captureKey(() => { cancelled = true; });
    const poll = () => {
      if (cancelled || performance.now() - started > 8000) { this.input.capture = null; this._renderControls(); return; }
      const i = this.input.padButtonPressed();
      if (i >= 0) {
        this.input.capture = null;
        for (const arr of Object.values(this.input.pad)) for (let k = 0; k < arr.length; k++) if (arr[k] === i) arr[k] = -1;
        this.input.pad[id][slot] = i;
        this.settings.pad = JSON.parse(JSON.stringify(this.input.pad));
        this.saveSettings();
        this._renderControls();
        return;
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  },

  _renderOptions() {
    const s = this.settings;
    $('opt-volume').value = s.volume;
    $('opt-quality').value = s.quality;
    this._renderQualityInfo();
    $('opt-ghost').checked = s.ghost;
    $('opt-ghostgold').checked = s.ghostGold !== false;
    $('opt-ghostimp').checked = s.ghostImported !== false;
    $('opt-onlinescores').checked = s.onlineScores !== false;
    $('opt-telemetry').checked = s.telemetry === true;
    $('opt-name').value = s.playerName;
    $('opt-name').readOnly = this.identity.kind === 'account';     // le pseudo d'un compte ne change pas
    $('opt-name').title = this.identity.kind === 'account' ? 'Pseudo du compte (non modifiable)' : '';
    $('opt-touch').value = s.touchMode;
    $('opt-haptics').checked = s.haptics;
    $('opt-music').value = s.musicVolume;
    $('opt-fps').checked = !!s.showFps;
    $('opt-speedfx').checked = s.speedFx !== false;
    $('opt-cb').checked = !!s.colorblind;
    $('opt-fov').value = s.fovAdd; $('opt-fov-v').textContent = fovText(s.fovAdd);
    $('opt-shake').value = s.shakeAmt; $('opt-shake-v').textContent = Math.round(s.shakeAmt * 100) + ' %';
    $('opt-ui').value = s.uiScale; $('opt-ui-v').textContent = Math.round(s.uiScale * 100) + ' %';
  },

  // Taille de l'interface, compteur d'images, couleurs adaptées.
  // Accord pour les statistiques anonymes (voir telemetry.js) : demandé une fois, retrouvable dans Options.
  setTelemetry(on) {
    this.settings.telemetry = !!on;
    this.saveSettings();
    if (on) { this.telemetry.scheduleFlush(3000); this.ui.flash('Merci : statistiques anonymes activées.'); } else this.telemetry.forget();
    if ($('opt-telemetry')) $('opt-telemetry').checked = !!on;
  },

  askTelemetry() {
    if (this.settings.telemetry != null) return;
    if (this.ui.modalOpen || this.mode !== 'menu') { setTimeout(() => this.askTelemetry(), 8000); return; }
    this.ui.modal({
      title: 'Aider à équilibrer les circuits ?',
      body: `<p>Copytrack peut envoyer, <b>sans nom ni compte</b>, le temps de tes arrivées, tes abandons et ton nombre d'essais sur chaque circuit
        (avec un identifiant aléatoire propre à cet appareil). Cela sert à régler la difficulté et les médailles sur de vrais joueurs.</p>
        <p class="meta">Rien d'autre ne part : ni pseudo, ni position, ni commandes. Tu peux changer d'avis à tout moment dans Profil › Options.</p>`,
      actions: [
        { label: 'Accepter', primary: true, onClick: () => { this.setTelemetry(true); return true; } },
        { label: 'Refuser', onClick: () => { this.setTelemetry(false); return true; } },
      ],
    });
  },

  _applyAccess() {
    const s = this.settings;
    document.documentElement.style.setProperty('--ui-scale', String(s.uiScale || 1));
    document.body.classList.toggle('cb', !!s.colorblind);
    $('fps').classList.toggle('hidden', !s.showFps);
    if (this._cbApplied !== !!s.colorblind) {
      this._cbApplied = !!s.colorblind;
      renderOptions.colorblind = this._cbApplied;
      if (this.session) this.ui.flash('Couleurs appliquées à la prochaine course');
    }
  },
};
