// Personnalisation de l'interface (lot 11) : thème, couleurs, police, compteur de vitesse, éditeur de HUD (glisser-déposer) et éditeur de caméras.
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance. Les valeurs et leur validation sont dans uitheme.js et camprefs.js.
import { $, h } from '../dom.js';
import { THEMES, FONTS, SPEEDOS, TIMERS, HUD_PIECES, HUD_HIDE, sanitizeUi, themeVars, CSS_VARS } from '../uitheme.js';
import { CAM_LIMITS, CAM_LABELS, CAM_DEFAULT, MAX_CUSTOM_CAMS, sanitizeCams, sanitizeCam } from '../camprefs.js';
import { CAM_MODES } from '../race/shared.js';

// Classes posées sur <body> par applyUiPrefs (écrites en toutes lettres pour que le test de style les retrouve) :
// hud-no-split hud-no-best hud-no-medals hud-no-boost hud-no-hint hud-no-track
const PIECE_CLASS = { top: '.hud-top', tl: '.hud-tl', tr: '.hud-tr', br: '.hud-br', hint: '.hud-hint' };

export const uiCustomMethods = {
  // Pose le thème et la disposition sur la page (au démarrage et à chaque réglage).
  applyUiPrefs() {
    const ui = (this.settings.ui = sanitizeUi(this.settings.ui));
    const vars = themeVars(ui);
    const root = document.documentElement;
    for (const k of CSS_VARS) { if (vars[k] != null) root.style.setProperty(k, vars[k]); else root.style.removeProperty(k); }
    const b = document.body;
    b.classList.toggle('has-radius', ui.radius >= 0);
    b.dataset.speedo = ui.speedo; b.dataset.timer = ui.timer;
    for (const k of Object.keys(HUD_HIDE)) b.classList.toggle('hud-no-' + k, !!ui.hide[k]);
  },

  _setUi(patch, save = true) {
    this.settings.ui = sanitizeUi({ ...this.settings.ui, ...patch });
    this.applyUiPrefs();
    if (save) this.saveSettings();
  },

  _wireUiCustom() {
    const fill = (id, map) => { const s = $(id); s.replaceChildren(...Object.entries(map).map(([k, v]) => h('option', { value: k }, typeof v === 'string' ? v : v.label))); };
    fill('opt-ui-theme', THEMES); fill('opt-ui-font', FONTS); fill('opt-ui-speedo', SPEEDOS); fill('opt-ui-timer', TIMERS);
    $('opt-ui-hide').replaceChildren(...Object.entries(HUD_HIDE).map(([k, label]) => {
      const c = h('input', { type: 'checkbox', 'data-hide': k });
      c.onchange = () => this._setUi({ hide: { ...this.settings.ui.hide, [k]: c.checked } });
      return h('label', {}, c, label);
    }));
    const on = (id, key, conv = (v) => v) => $(id).addEventListener('input', (e) => { this._setUi({ [key]: conv(e.target.value) }); this._renderUiCustom(); });
    on('opt-ui-theme', 'theme'); on('opt-ui-font', 'font'); on('opt-ui-speedo', 'speedo'); on('opt-ui-timer', 'timer');
    on('opt-ui-accent', 'accent'); on('opt-ui-accent2', 'accent2');
    on('opt-ui-panel', 'panelA', Number); on('opt-ui-radius', 'radius', Number); on('opt-ui-hud', 'hudScale', Number);
    $('opt-ui-accent-reset').addEventListener('click', () => { this._setUi({ accent: '', accent2: '' }); this._renderUiCustom(); });
    this.applyUiPrefs();
  },

  _renderUiCustom() {
    const u = sanitizeUi(this.settings.ui);
    $('opt-ui-theme').value = u.theme; $('opt-ui-font').value = u.font; $('opt-ui-speedo').value = u.speedo; $('opt-ui-timer').value = u.timer;
    $('opt-ui-accent').value = u.accent || '#5ff2ff'; $('opt-ui-accent2').value = u.accent2 || '#ff7ad9';
    $('opt-ui-panel').value = u.panelA || 0.82; $('opt-ui-panel-v').textContent = Math.round((u.panelA || 0.82) * 100) + ' %';
    $('opt-ui-radius').value = u.radius < 0 ? 12 : u.radius; $('opt-ui-radius-v').textContent = u.radius < 0 ? 'défaut' : u.radius + ' px';
    $('opt-ui-hud').value = u.hudScale; $('opt-ui-hud-v').textContent = Math.round(u.hudScale * 100) + ' %';
    for (const c of $('opt-ui-hide').querySelectorAll('input')) c.checked = !!u.hide[c.dataset.hide];
  },

  resetUi() {
    this.settings.ui = sanitizeUi({});
    this.applyUiPrefs(); this.saveSettings(); this._renderUiCustom();
    this.ui.flash('Interface réinitialisée.');
  },

  // ---------------------------------------------------------------- éditeur de HUD : on glisse les éléments réels
  openHudEditor() {
    if (this._hudEditing) return;
    this._hudEditing = true;
    document.body.classList.add('hud-editing');
    $('hud').classList.remove('hidden');
    $('hud-edit-bar').classList.remove('hidden');
    $('hud-speed').textContent = '187';
    $('hud').style.setProperty('--spd', '0.47');
    const hint = $('hud-hint'); hint.style.opacity = '1';
    let drag = null;
    const down = (k) => (e) => {
      const base = (this.settings.ui.hud && this.settings.ui.hud[k]) || [0, 0];
      drag = { k, x: e.clientX, y: e.clientY, base };
      e.currentTarget.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      if (!drag) return;
      const dx = drag.base[0] + ((e.clientX - drag.x) / window.innerWidth) * 100, dy = drag.base[1] + ((e.clientY - drag.y) / window.innerHeight) * 100;
      this._setUi({ hud: { ...this.settings.ui.hud, [drag.k]: [dx, dy] } }, false);
    };
    const up = () => { if (drag) { this.saveSettings(); drag = null; } };
    this._hudHandlers = [];
    for (const k of Object.keys(HUD_PIECES)) {
      const el = document.querySelector('#hud ' + PIECE_CLASS[k]);
      const d = down(k);
      el.addEventListener('pointerdown', d); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
      this._hudHandlers.push([el, d, move, up]);
    }
  },

  closeHudEditor() {
    if (!this._hudEditing) return;
    this._hudEditing = false;
    document.body.classList.remove('hud-editing');
    $('hud-edit-bar').classList.add('hidden');
    for (const [el, d, m, u] of this._hudHandlers || []) { el.removeEventListener('pointerdown', d); el.removeEventListener('pointermove', m); el.removeEventListener('pointerup', u); }
    this._hudHandlers = [];
    $('hud').classList.toggle('hidden', this.mode !== 'race');
    $('hud-speed').textContent = '0'; $('hud').style.removeProperty('--spd');
    this.saveSettings();
  },

  resetHudPlaces() { this._setUi({ hud: {}, hudScale: 1 }); this._renderUiCustom(); },

  // ---------------------------------------------------------------- éditeur de caméras
  openCameraEditor() {
    let sel = 0;
    const body = h('div', { class: 'studio' });
    const save = () => { this.settings.cameras = sanitizeCams(this.settings.cameras); this.saveSettings(); };
    const render = () => {
      const list = (this.settings.cameras = sanitizeCams(this.settings.cameras));
      body.replaceChildren();
      body.appendChild(h('p', { class: 'meta' }, `Les ${CAM_MODES.length} caméras d'origine restent disponibles ; tu peux en ajouter jusqu'à ${MAX_CUSTOM_CAMS}. Elles se choisissent en course avec la touche caméra.`));
      body.appendChild(h('div', { class: 'row wrap' },
        ...list.map((c, i) => h('button', { class: 'tab' + (i === sel ? ' on' : ''), type: 'button', onclick: () => { sel = i; render(); } }, c.name)),
        h('button', { class: 'btn small', type: 'button', disabled: list.length >= MAX_CUSTOM_CAMS, onclick: () => { list.push(sanitizeCam({ ...CAM_DEFAULT, name: 'Caméra ' + (list.length + 1) })); sel = list.length - 1; save(); render(); } }, '+ Nouvelle')));
      if (!list.length) return;
      sel = Math.min(sel, list.length - 1);
      const c = list[sel];
      const name = h('input', { type: 'text', maxlength: 16, value: c.name });
      name.oninput = () => { c.name = name.value; };
      name.onchange = () => { save(); render(); };
      body.appendChild(h('div', { class: 'srow' }, h('span', {}, 'Nom'), name));
      for (const k of Object.keys(CAM_LIMITS)) {
        const [lo, hi, step] = CAM_LIMITS[k];
        const out = h('output', {}, String(c[k]));
        const r = h('input', { type: 'range', min: lo, max: hi, step, value: c[k] });
        r.oninput = () => { c[k] = Number(r.value); out.textContent = r.value; };
        r.onchange = save;
        body.appendChild(h('div', { class: 'srow' }, h('span', {}, CAM_LABELS[k]), r, out));
      }
      body.appendChild(h('div', { class: 'row' },
        h('button', { class: 'btn small primary', type: 'button', onclick: () => { this.settings.camera = CAM_MODES.length + sel; save(); this.ui.flash(`Caméra de course : ${c.name}`); } }, 'Utiliser en course'),
        h('button', { class: 'btn small danger', type: 'button', onclick: () => { list.splice(sel, 1); if (this.settings.camera >= CAM_MODES.length + list.length) this.settings.camera = 0; sel = 0; save(); render(); } }, 'Supprimer')));
    };
    render();
    this.ui.modal({ title: 'Mes caméras', body, actions: [{ label: 'Fermer', primary: true, onClick: () => { save(); return true; } }] });
  },
};
