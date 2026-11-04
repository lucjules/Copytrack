// Mode Inspection de l'éditeur : sélection d'une pièce ou d'une décoration, panneau de propriétés généré selon
// l'objet, et gizmos 3D (TransformControls : flèches de déplacement, cercles de rotation).
//
// Liaison dans les deux sens : le panneau écrit dans le circuit (et la grille de données) ; tout changement du
// circuit (gizmo, annuler / rétablir, autres outils) relit le panneau. Chaque geste = un seul pas d'historique.
// La caméra de l'éditeur n'est pas un OrbitControls : elle est verrouillée (ed.camLocked) tant qu'un gizmo est saisi.
import * as THREE from './vendor/three.module.min.js';
import { TransformControls } from './vendor/TransformControls.js';
import { CELL, LEVEL_H, ROAD_TOP, MAX_LEVEL } from './constants.js';
import { PIECES, SURFACES, SURFACE_ORDER, surfaceAllowed, flagAllowed, tileCenter, baseY } from './pieces.js';
import { DECO_LABELS, DECO_COLORS } from './decoData.js';
import { safeUrl } from './decos.js';
import { isObstacle } from './obstacles.js';
import { tileBounds, decoBounds, pickObjects, LAYER_ALL } from './editorPick.js';

// Pièces qui ont une version « miroir » (même empreinte).
export const MIRROR_TYPES = {
  loop: 'loopL', loopL: 'loop', loopBig: 'loopBigL', loopBigL: 'loopBig', loopDouble: 'loopDoubleL', loopDoubleL: 'loopDouble',
  cork: 'corkL', corkL: 'cork', fork: 'forkL', forkL: 'fork',
};
const isStartFinish = (type) => { const sp = PIECES[type] && PIECES[type].special; return sp === 'start' || sp === 'finish'; };
const TAU = Math.PI * 2;

// Cap (rotation autour de Y) d'un objet 3D, sans dépendre de la représentation d'Euler.
export function yawOf(q) {
  const v = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return Math.atan2(-v.x, -v.z);
}

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k);
  return e;
}

export class Inspector {
  constructor(ed) {
    this.ed = ed;
    this.sel = null;                 // { kind: 'tile' | 'deco', obj }
    this.mode = 'translate';         // gizmo : 'translate' (flèches) | 'rotate' (cercles)
    this.dragging = false;
    this._sync = [];                 // fonctions qui relisent le panneau depuis le circuit
    this._key = '';

    const { scene, camera, renderer } = ed.app;
    this.proxy = new THREE.Object3D();                 // l'objet que le gizmo déplace ; le circuit suit, par pas de grille
    scene.add(this.proxy);
    // Créé AVANT les écouteurs de l'éditeur : à chaque clic, le gizmo décide d'abord s'il est saisi.
    this.tc = new TransformControls(camera, renderer.domElement);
    this.tc.setSpace('world');
    this.tc.setSize(0.85);
    this.helper = this.tc.getHelper();
    this.helper.visible = false;
    scene.add(this.helper);
    this.tc.addEventListener('dragging-changed', (e) => this._onDrag(!!e.value));
    this.tc.addEventListener('objectChange', () => this._onGizmo());

    this.outline = new THREE.Box3Helper(new THREE.Box3(), '#5ff2ff');
    this.outline.visible = false;
    scene.add(this.outline);

    this.panel = h('div', { class: 'ed-insp hidden', id: 'ed-insp', role: 'region', 'aria-label': 'Propriétés' });
    document.getElementById('editor').appendChild(this.panel);
  }

  get active() { return !!this.sel; }

  // Le gizmo est-il survolé ou saisi ? (l'éditeur ne doit alors ni sélectionner ni bouger la caméra)
  get gizmoBusy() { return this.dragging || (!!this.sel && this.helper.visible && this.tc.axis !== null); }

  // ---- Sélection -------------------------------------------------------------------------------------------------
  pick(ray) {
    const hit = pickObjects(this.ed.track, ray, LAYER_ALL);
    if (hit) this.select(hit.kind, hit.obj); else this.clear();
    return hit;
  }

  select(kind, obj) {
    if (this.sel && this.sel.obj === obj) return;
    this.sel = { kind, obj };
    this.tc.attach(this.proxy);
    this.helper.visible = true;
    this.outline.visible = true;
    this._applyMode();
    this._syncGizmo();
    this._build();
    this.ed._refreshUI();
  }

  clear() {
    if (!this.sel) return;
    this.sel = null;
    if (this.dragging) { this.dragging = false; this.ed.camLocked = false; }
    this.tc.detach();
    this.helper.visible = false;
    this.outline.visible = false;
    this.panel.classList.add('hidden');
    this._key = '';
    this.ed._refreshUI();
  }

  // Pour l'historique : la sélection est rangée avec chaque pas, pour revenir exactement à l'état annulé.
  describe() {
    if (!this.sel) return null;
    const list = this.sel.kind === 'tile' ? this.ed.track.tiles : this.ed.track.decos;
    const i = list.indexOf(this.sel.obj);
    return i < 0 ? null : { k: this.sel.kind, i };
  }

  restore(desc) {
    const list = desc && (desc.k === 'tile' ? this.ed.track.tiles : this.ed.track.decos);
    if (list && list[desc.i]) { this.sel = null; this.select(desc.k, list[desc.i]); } else this.clear();
  }

  // Après tout changement du circuit : l'objet existe-t-il encore ? puis relire gizmo et panneau.
  refresh() {
    if (!this.sel) return;
    const list = this.sel.kind === 'tile' ? this.ed.track.tiles : this.ed.track.decos;
    if (!list.includes(this.sel.obj)) { this.clear(); return; }
    if (!this.dragging) this._syncGizmo();
    if (this._structKey() !== this._key) this._build(); else this._syncPanel();
  }

  update() {
    const on = !!this.sel && this.ed.tool === 'inspect';
    this.helper.visible = on;
    this.outline.visible = on;
    this.panel.classList.toggle('hidden', !on);
    if (on) {
      const s = this.sel;
      (s.kind === 'tile' ? tileBounds : decoBounds)(s.obj, this.outline.box);
    }
  }

  dispose() {
    this.tc.detach();
    this.tc.dispose();
    this.helper.removeFromParent();
    this.outline.removeFromParent(); this.outline.geometry.dispose(); this.outline.material.dispose();
    this.proxy.removeFromParent();
    this.panel.remove();
    this.ed.camLocked = false;
  }

  // ---- Gizmo ---------------------------------------------------------------------------------------------------------
  setMode(mode) {
    this.mode = mode;
    this._applyMode();
    this._syncPanel();
  }

  _applyMode() {
    const tile = this.sel && this.sel.kind === 'tile';
    this.tc.setMode(this.mode);
    if (this.mode === 'rotate') {
      this.tc.showX = false; this.tc.showZ = false; this.tc.showY = true;       // seulement autour de la verticale
      this.tc.setRotationSnap(tile ? Math.PI / 2 : Math.PI / 36);                 // pièce : quarts de tour ; déco : 5°
    } else {
      this.tc.showX = true; this.tc.showY = true; this.tc.showZ = true;
      this.tc.setTranslationSnap(null);
    }
  }

  // Place l'objet fantôme du gizmo sur l'objet sélectionné (position et cap exacts de ses données).
  _syncGizmo() {
    if (!this.sel) return;
    const { kind, obj } = this.sel;
    if (kind === 'tile') {
      const c = tileCenter(obj);
      this.proxy.position.set(c.x, baseY(obj), c.z);
      this.proxy.rotation.set(0, -obj.r * Math.PI / 2, 0);
    } else {
      this.proxy.position.set(obj.x, obj.y, obj.z);
      this.proxy.rotation.set(0, obj.ry || 0, 0);
    }
    this.proxy.updateMatrixWorld(true);
  }

  _onDrag(on) {
    this.dragging = on;
    this.ed.camLocked = on;                // pas de rotation / déplacement de caméra pendant le geste
    if (on) { this._before = this.ed._snapshot(); this._warned = false; return; }
    this._syncGizmo();                     // au relâchement, le gizmo se cale sur la grille
    if (this.ed._snapshot() !== this._before) { this.ed._changed(); this.ed._commit(); }
  }

  // Le gizmo bouge : le circuit suit en temps réel, calé sur la grille (pièces) ou libre / aimanté (décos).
  _onGizmo() {
    if (!this.sel) return;
    const { kind, obj } = this.sel, p = this.proxy, ed = this.ed;
    if (kind === 'tile') {
      let patch;
      if (this.mode === 'translate') {
        const size = PIECES[obj.t].size;
        patch = {
          x: Math.round(p.position.x / CELL - size / 2),
          z: Math.round(p.position.z / CELL - size / 2),
          l: Math.max(0, Math.min(MAX_LEVEL, Math.round((p.position.y - ROAD_TOP) / LEVEL_H))),
        };
      } else patch = { r: ((Math.round(-yawOf(p.quaternion) / (Math.PI / 2)) % 4) + 4) % 4 };
      if (Object.keys(patch).every((k) => patch[k] === obj[k])) return;
      if (ed._applyTilePatch(obj, patch)) ed._changed();
      else if (!this._warned) { this._warned = true; ed.app.ui.flash('Place occupée : la pièce reste où elle est'); }
    } else {
      if (this.mode === 'translate') {
        const [x, z] = ed._snapPos(p.position.x, p.position.z);
        obj.x = x; obj.z = z; obj.y = p.position.y;
      } else obj.ry = ((yawOf(p.quaternion) % TAU) + TAU) % TAU;
      ed.track.version++;
      ed._changed();
    }
  }

  // ---- Panneau de propriétés (généré selon l'objet) ------------------------------------------------------------------
  _structKey() {
    if (!this.sel) return '';
    const o = this.sel.obj;
    return this.sel.kind === 'tile' ? ['t', o.t, o.s, o.v, o.nb, o.tn, o.mv, this.mode].join('|') : ['d', o.k, this.mode].join('|');
  }

  _syncPanel() { for (const f of this._sync) f(); }

  // Une modification venue du panneau : appliquée au circuit, historisée (live = glissière en cours, sans pas d'historique).
  _apply(fn, { live = false } = {}) {
    const ed = this.ed;
    const ok = fn();
    if (ok === false) { ed.app.audio.error(); this._syncPanel(); return false; }
    ed.app.audio.place();
    ed._changed();
    if (!live) ed._commit();
    return true;
  }

  _build() {
    if (!this.sel) return;
    this._key = this._structKey();
    this._sync = [];
    const body = this.sel.kind === 'tile' ? this._tileBody(this.sel.obj) : this._decoBody(this.sel.obj);
    const title = this.sel.kind === 'tile' ? PIECES[this.sel.obj.t].label : DECO_LABELS[this.sel.obj.k] || this.sel.obj.k;
    this.panel.replaceChildren(
      h('div', { class: 'insp-head' },
        h('div', {}, h('small', {}, this.sel.kind === 'tile' ? 'Pièce' : 'Décoration'), h('b', {}, title)),
        h('button', { class: 'btn icon', title: 'Désélectionner (Échap)', onclick: () => { this.clear(); } }, '✕')),
      h('div', { class: 'insp-gizmo', role: 'group', 'aria-label': 'Gizmo' },
        this._modeBtn('translate', '⤧ Déplacer'), this._modeBtn('rotate', '⟳ Pivoter')),
      ...body,
      h('div', { class: 'insp-foot' },
        h('button', { class: 'btn danger', onclick: () => this.deleteSelected() }, 'Supprimer')),
    );
    this._syncPanel();
  }

  _modeBtn(mode, label) {
    const b = h('button', { class: 'btn', onclick: () => this.setMode(mode) }, label);
    this._sync.push(() => b.classList.toggle('on', this.mode === mode));
    return b;
  }

  // Un champ numérique lié : relit le modèle (sauf pendant la saisie), écrit à la validation.
  _num(label, get, set, { step = 1, min, max, live = false } = {}) {
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
  }

  _range(label, get, set, { min, max, step, fmt = (v) => v }) {
    const input = h('input', { type: 'range', min, max, step });
    const out = h('b', {});
    input.addEventListener('input', () => { this._apply(() => set(parseFloat(input.value)), { live: true }); out.textContent = fmt(parseFloat(input.value)); });
    input.addEventListener('change', () => this.ed._commit());
    this._sync.push(() => { const v = get(); if (document.activeElement !== input) input.value = v; out.textContent = fmt(v); });
    return h('label', { class: 'insp-row' }, h('span', {}, label), input, out);
  }

  _select(label, options, get, set, disabled = false) {
    const sel = h('select', { disabled }, options.map(([v, text]) => h('option', { value: v }, text)));
    sel.addEventListener('change', () => this._apply(() => set(sel.value)));
    this._sync.push(() => { sel.value = get(); });
    return h('label', { class: 'insp-row' }, h('span', {}, label), sel);
  }

  _check(label, get, set, disabled = false, hint = '') {
    const c = h('input', { type: 'checkbox', disabled });
    c.addEventListener('change', () => this._apply(() => set(c.checked)));
    this._sync.push(() => { c.checked = !!get(); });
    return h('label', { class: 'insp-check', title: hint }, c, h('span', {}, label));
  }

  _tileBody(t) {
    const ed = this.ed, P = PIECES[t.t];
    const rows = [];
    rows.push(h('div', { class: 'insp-group' }, 'Position'));
    rows.push(this._num('Case X', () => t.x, (v) => ed._applyTilePatch(t, { x: Math.round(v) }), { step: 1 }));
    rows.push(this._num('Case Z', () => t.z, (v) => ed._applyTilePatch(t, { z: Math.round(v) }), { step: 1 }));
    rows.push(this._num('Niveau', () => t.l, (v) => ed._applyTilePatch(t, { l: v }), { step: 0.5, min: 0, max: MAX_LEVEL }));
    // Rotation : quatre boutons liés à tile.r
    const rot = h('div', { class: 'insp-rot', role: 'group', 'aria-label': 'Rotation' }, [0, 1, 2, 3].map((r) => {
      const b = h('button', { class: 'btn', onclick: () => this._apply(() => ed._applyTilePatch(t, { r })) }, `${r * 90}°`);
      this._sync.push(() => { b.classList.toggle('on', t.r === r); b.setAttribute('aria-pressed', String(t.r === r)); });
      return b;
    }));
    rows.push(h('div', { class: 'insp-row' }, h('span', {}, 'Rotation'), rot));
    // Type (même empreinte) et miroir
    const types = Object.keys(PIECES).filter((k) => PIECES[k].size === P.size && (k === t.t || !isStartFinish(k)));
    rows.push(this._select('Type', types.map((k) => [k, PIECES[k].label]), () => t.t, (v) => ed._retypeTile(t, v), isStartFinish(t.t)));
    if (MIRROR_TYPES[t.t]) {
      rows.push(h('div', { class: 'insp-row' }, h('span', {}, 'Miroir'),
        h('button', { class: 'btn', title: 'Version gauche / droite de la pièce', onclick: () => this._apply(() => ed._retypeTile(t, MIRROR_TYPES[t.t])) }, '⇋ Inverser gauche / droite')));
    }
    // Revêtement
    rows.push(h('div', { class: 'insp-group' }, 'Revêtement'));
    const surfs = SURFACE_ORDER.filter((s) => s === (t.s || '') || surfaceAllowed(t.t, s, !!t.v));
    rows.push(this._select('Type', surfs.map((s) => [s, SURFACES[s].label]), () => t.s || '', (v) => ed.track.setSurface(t, v, SURFACES[v] && SURFACES[v].def != null ? ed._surfParamValue(v) : 0) || true));
    const S = SURFACES[t.s || ''];
    if (S && S.def != null) {
      rows.push(this._range(S.param || 'Intensité', () => t.p || S.def, (v) => ed.track.setSurface(t, t.s, v) || true, { min: S.min, max: S.max, step: 1, fmt: (v) => v + ' %' }));
    }
    // Options : inversion (à l'envers), bordures, tunnel, mouvement
    rows.push(h('div', { class: 'insp-group' }, 'Options'));
    const flag = (f, label, hint) => this._check(label, () => t[f], (on) => (on !== !!t[f] ? ed.track.toggleFlag(t, f) || false : true), !flagAllowed(t.t, f, t) && !t[f], hint);
    rows.push(flag('v', 'À l\'envers (inversion)', 'Route au plafond : roulable en gravité inversée'));
    rows.push(flag('nb', 'Sans bordures', 'Plus de rebord'));
    rows.push(flag('tn', 'Tunnel', 'Voûte autour de la route'));
    const mvOk = flagAllowed(t.t, 'mv', t) || !!t.mv;
    rows.push(this._select('Mouvement', [['0', 'Aucun'], ['1', 'Ascenseur'], ['2', 'Glissière']], () => String(t.mv || 0),
      (v) => { const n = +v; if (n === (t.mv || 0)) return true; return ed.track.toggleFlag(t, 'mv', n === 0 ? t.mv : n) || false; }, !mvOk));
    return rows;
  }

  _decoBody(d) {
    const ed = this.ed;
    const touch = () => { ed.track.version++; return true; };
    const rows = [h('div', { class: 'insp-group' }, 'Position')];
    rows.push(this._num('X', () => d.x, (v) => { d.x = v; return touch(); }, { step: 0.5 }));
    rows.push(this._num('Hauteur', () => d.y, (v) => { d.y = v; return touch(); }, { step: 0.5 }));
    rows.push(this._num('Z', () => d.z, (v) => { d.z = v; return touch(); }, { step: 0.5 }));
    rows.push(this._range('Rotation', () => Math.round(((d.ry || 0) * 180 / Math.PI + 360) % 360), (v) => { d.ry = v * Math.PI / 180; return touch(); }, { min: 0, max: 359, step: 1, fmt: (v) => v + '°' }));
    const obst = isObstacle(d.k);
    rows.push(this._range('Taille', () => d.s, (v) => { d.s = v; return touch(); }, { min: obst ? 0.5 : 0.3, max: obst ? 2.5 : 6, step: 0.05, fmt: (v) => '×' + (+v).toFixed(2) }));
    // Couleur
    const sw = h('div', { class: 'insp-swatches', role: 'group', 'aria-label': 'Couleur' }, DECO_COLORS.map((c, i) => {
      const b = h('button', { class: 'swatch', style: `background:${c}`, title: `Couleur ${i + 1}`, onclick: () => this._apply(() => { d.c = i; return touch(); }) });
      this._sync.push(() => b.classList.toggle('on', (d.c | 0) === i));
      return b;
    }));
    rows.push(h('div', { class: 'insp-row' }, h('span', {}, 'Couleur'), sw));
    if (d.k === 'plaque') {
      const url = h('input', { type: 'text', maxlength: 400, placeholder: 'https://…', spellcheck: false });
      url.addEventListener('change', () => {
        if (url.value && !safeUrl(url.value)) { ed.app.ui.flash('URL d\'image https:// invalide.'); ed.app.audio.error(); this._syncPanel(); return; }
        this._apply(() => { d.u = url.value; return touch(); });
      });
      this._sync.push(() => { if (document.activeElement !== url) url.value = d.u || ''; });
      rows.push(h('label', { class: 'insp-row' }, h('span', {}, 'Image'), url));
    }
    if (obst) rows.push(this._range('Décalage', () => d.ph || 0, (v) => { d.ph = Math.max(0, Math.min(0.95, Math.round(v * 20) / 20)); return touch(); }, { min: 0, max: 0.95, step: 0.05, fmt: (v) => Math.round(v * 100) + ' %' }));
    return rows;
  }

  // ---- Actions ---------------------------------------------------------------------------------------------------------
  deleteSelected() {
    if (!this.sel) return;
    const { kind, obj } = this.sel;
    const ed = this.ed;
    this.clear();
    if (kind === 'tile') ed.track.remove(obj); else ed.track.removeDeco(obj);
    ed.app.audio.erase();
    ed._changed();
    ed._commit();
  }

  // Touche R : pièce +90°, décoration +15° (Maj : sens inverse).
  rotateBy(d) {
    if (!this.sel) return false;
    const { kind, obj } = this.sel, ed = this.ed;
    this._apply(() => {
      if (kind === 'tile') return ed._applyTilePatch(obj, { r: (obj.r + d + 4) & 3 });
      obj.ry = ((obj.ry || 0) + d * Math.PI / 12 + TAU) % TAU; ed.track.version++; return true;
    });
    return true;
  }
}
