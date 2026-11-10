// Contrôles du panneau : nombres, curseurs, listes, cases à cocher, boutons de mode.
// Ces méthodes s'ajoutent au prototype de Inspector (voir inspector.js) : `this` est l'instance.
import { h } from '../dom.js';
export const widgetMethods = {
  _modeBtn(mode, label) {
    const b = h('button', { class: 'btn', onclick: () => this.setMode(mode) }, label);
    this._sync.push(() => b.classList.toggle('on', this.mode === mode));
    return b;
  },

  // Un champ numérique lié : relit le modèle (sauf pendant la saisie), écrit à la validation.
  _num(label, get, set, { step = 1, min, max } = {}) {
    const input = h('input', { type: 'number', step, min, max, inputmode: 'decimal' });
    const commit = () => {
      const v = parseFloat(input.value);
      if (!Number.isFinite(v)) { this._syncPanel(); return; }
      this._apply(() => set(v));
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
    this._sync.push(() => { if (document.activeElement !== input) { const v = get(); input.value = Number.isInteger(v) ? v : +v.toFixed(2); } });
    return h('label', { class: 'insp-row' }, h('span', {}, label), input);
  },

  _range(label, get, set, { min, max, step, fmt = (v) => v }) {
    const input = h('input', { type: 'range', min, max, step });
    const out = h('b', {});
    input.addEventListener('input', () => { this._apply(() => set(parseFloat(input.value)), { live: true }); out.textContent = fmt(parseFloat(input.value)); });
    input.addEventListener('change', () => this.ed._commit());
    this._sync.push(() => { const v = get(); if (document.activeElement !== input) input.value = v; out.textContent = fmt(v); });
    return h('label', { class: 'insp-row' }, h('span', {}, label), input, out);
  },

  // Un angle en degrés : curseur ET saisie au degré près (ou au dixième : « 37,5 »), liés au même réglage. Les bornes sont celles du curseur ; la saisie est ramenée dedans.
  _angle(label, get, set, { min = -180, max = 180 } = {}) {
    const range = h('input', { type: 'range', min, max, step: 1 });
    const num = h('input', { type: 'number', min, max, step: 0.5, inputmode: 'decimal', class: 'insp-deg', 'aria-label': label + ' (degrés)' });
    range.addEventListener('input', () => { const v = parseFloat(range.value); this._apply(() => set(v), { live: true }); num.value = v; });
    range.addEventListener('change', () => this.ed._commit());
    const commit = () => {
      const v = parseFloat(String(num.value).replace(',', '.'));
      if (!Number.isFinite(v)) { this._syncPanel(); return; }
      this._apply(() => set(Math.max(min, Math.min(max, v))));
    };
    num.addEventListener('change', commit);
    num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); num.blur(); } });
    this._sync.push(() => { const v = get(); if (document.activeElement !== range) range.value = v; if (document.activeElement !== num) num.value = +v.toFixed(1); });
    return h('label', { class: 'insp-row' }, h('span', {}, label), range, num);
  },

  // optDisabled(valeur) : grise les choix impossibles (ex. checkpoint aérien sur une pente).
  _select(label, options, get, set, disabled = false, optDisabled = null) {
    const sel = h('select', { disabled }, options.map(([v, text]) => h('option', { value: v }, text)));
    sel.addEventListener('change', () => this._apply(() => set(sel.value)));
    this._sync.push(() => {
      sel.value = get();
      if (optDisabled) for (const o of sel.options) o.disabled = o.value !== sel.value && !!optDisabled(o.value);
    });
    return h('label', { class: 'insp-row' }, h('span', {}, label), sel);
  },

  _check(label, get, set, disabled = false, hint = '') {
    const c = h('input', { type: 'checkbox', disabled });
    c.addEventListener('change', () => this._apply(() => set(c.checked)));
    this._sync.push(() => { c.checked = !!get(); });
    return h('label', { class: 'insp-check', title: hint }, c, h('span', {}, label));
  },
};
