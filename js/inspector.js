// Mode Inspection de l'éditeur : sélection d'une pièce ou d'une décoration, panneau de propriétés généré selon
// l'objet, et gizmos 3D (TransformControls : flèches de déplacement, cercles de rotation).
//
// Liaison dans les deux sens : le panneau écrit dans le circuit (et la grille de données) ; tout changement du
// circuit (gizmo, annuler / rétablir, autres outils) relit le panneau. Chaque geste = un seul pas d'historique.
// La caméra de l'éditeur n'est pas un OrbitControls : elle est verrouillée (ed.camLocked) tant qu'un gizmo est saisi.
import * as THREE from './vendor/three.module.min.js';
import { TransformControls } from './vendor/TransformControls.js';
import { CELL, LEVEL_H, ROAD_TOP, MAX_LEVEL, DIRS } from './constants.js';
import { Track } from './track.js';
import { PIECES, SURFACES, SURFACE_ORDER, surfaceAllowed, flagAllowed, tileCenter, baseY, THEMES, MOVER, moverParams, paramText, ORIENTS, tileOri } from './pieces.js';
import { FAMILIES, familyOf, validValues, withTrait, isFamilyMember, REPLACED_BY_OPTION } from './families.js';
import { arrowPose } from './tileInfo.js';
import { styleFor } from './trackMesh.js';
import { DECO_LABELS, DECO_COLORS } from './decoData.js';
import { safeUrl } from './decos.js';
import { isObstacle } from './obstacles.js';
import { tileBounds, decoBounds, pickObjects, LAYER_ALL } from './editorPick.js';
import { h } from './dom.js';

// Pièces qui ont une version « miroir » (même empreinte).
export const MIRROR_TYPES = {
  loop: 'loopL', loopL: 'loop', loopBig: 'loopBigL', loopBigL: 'loopBig', loopDouble: 'loopDoubleL', loopDoubleL: 'loopDouble',
  cork: 'corkL', corkL: 'cork', fork: 'forkL', forkL: 'fork',
  loopBigDouble: 'loopBigDoubleL', loopBigDoubleL: 'loopBigDouble', loopTriple: 'loopTripleL', loopTripleL: 'loopTriple',
  loopBigTriple: 'loopBigTripleL', loopBigTripleL: 'loopBigTriple',
  cv05: 'cvL05', cvL05: 'cv05', cv1: 'cvL1', cvL1: 'cv1', cv2: 'cvL2', cvL2: 'cv2', cv4: 'cvL4', cvL4: 'cv4',
  cvBig05: 'cvBigL05', cvBigL05: 'cvBig05', cvBig1: 'cvBigL1', cvBigL1: 'cvBig1', cvBig2: 'cvBigL2', cvBigL2: 'cvBig2', cvBig4: 'cvBigL4', cvBigL4: 'cvBig4',
  // 0.9.3 : virages descendants (droite <-> gauche) ; transitions d'orientation (mur gauche <-> mur droit)
  ...Object.fromEntries(['05', '1', '2', '4'].flatMap((k) => [['cvd' + k, 'cvdL' + k], ['cvdL' + k, 'cvd' + k], ['cvdBig' + k, 'cvdBigL' + k], ['cvdBigL' + k, 'cvdBig' + k]])),
  ...Object.fromEntries(['s', 'l'].flatMap((f) => [['01', '02'], ['10', '20'], ['13', '23'], ['31', '32']].flatMap(([a, b]) => [[`tr${a}${f}`, `tr${b}${f}`], [`tr${b}${f}`, `tr${a}${f}`]]))),
};
// Anciennes pièces « Checkpoint » : [pièce de route, valeur de l'option cp] pour les convertir en option.
export const LEGACY_CP = { checkpoint: ['straight', 1], cpCurve: ['curve', 1], cpRing: ['straight', 2] };
const isStartFinish = (type) => { const sp = PIECES[type] && PIECES[type].special; return sp === 'start' || sp === 'finish'; };
const TAU = Math.PI * 2;

// Cap (rotation autour de Y) d'un objet 3D, sans dépendre de la représentation d'Euler.
export function yawOf(q) {
  const v = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return Math.atan2(-v.x, -v.z);
}

// Flèche à plat (plan XZ) pointant vers -z, de longueur 1 : tige + pointe.
function arrowGeometry() {
  const g = new THREE.BufferGeometry();
  const w = 0.09, hw = 0.3, z0 = 0.5, zh = -0.12, tip = -0.5;
  const v = [
    -w, 0, z0, w, 0, z0, w, 0, zh,   -w, 0, z0, w, 0, zh, -w, 0, zh,       // tige
    -hw, 0, zh, hw, 0, zh, 0, 0, tip,                                       // pointe
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
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

    // Flèche blanche semi-transparente : sens de parcours de la pièce inspectée.
    this.tab = 'props';                // onglet du panneau : 'props' (Propriétés) | 'colors' (Couleurs)
    this.arrow = new THREE.Mesh(arrowGeometry(), new THREE.MeshBasicMaterial({
      color: '#ffffff', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, depthTest: false,
    }));
    this.arrow.renderOrder = 20;
    this.arrow.visible = false;
    this.arrow.name = 'direction-arrow';
    scene.add(this.arrow);

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
    this.arrow.visible = false;
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
    if (!this.dragging) this._syncGizmo(); else this._syncArrow();
    if (this._structKey() !== this._key) this._build(); else this._syncPanel();
  }

  update() {
    const on = !!this.sel && this.ed.tool === 'inspect';
    this.helper.visible = on;
    this.outline.visible = on;
    this.panel.classList.toggle('hidden', !on);
    this.arrow.visible = on && this.sel.kind === 'tile';
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
    this.arrow.removeFromParent(); this.arrow.geometry.dispose(); this.arrow.material.dispose();
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
    this._syncArrow();
  }

  // Flèche de direction : posée sur la ligne centrale de la pièce, orientée dans son sens de parcours.
  _syncArrow() {
    if (!this.sel || this.sel.kind !== 'tile') { this.arrow.visible = false; return; }
    const a = arrowPose(this.sel.obj);
    this.arrow.position.set(a.x, a.y, a.z);
    this.arrow.rotation.set(0, a.yaw, 0);
    this.arrow.scale.set(a.len, 1, a.len);
    this.arrow.visible = this.ed.tool === 'inspect';
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
    return this.sel.kind === 'tile' ? ['t', o.t, o.s, o.s2, o.v, o.o, o.nb, o.tn, o.mv, o.cp, o.tb, this.mode, this.tab].join('|') : ['d', o.k, this.mode, this.tab].join('|');
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
    const isTile = this.sel.kind === 'tile';
    const body = this.tab === 'colors' ? this._colorsBody(this.sel.obj) : isTile ? this._tileBody(this.sel.obj) : this._decoBody(this.sel.obj);
    const title = isTile ? PIECES[this.sel.obj.t].label : DECO_LABELS[this.sel.obj.k] || this.sel.obj.k;
    const tabBtn = (id, label) => {
      const b = h('button', { class: 'btn', role: 'tab', onclick: () => this.setTab(id) }, label);
      this._sync.push(() => { b.classList.toggle('on', this.tab === id); b.setAttribute('aria-selected', String(this.tab === id)); });
      return b;
    };
    this.panel.replaceChildren(
      h('div', { class: 'insp-head' },
        h('div', {}, h('small', {}, isTile ? 'Pièce' : 'Décoration'), h('b', {}, title)),
        h('button', { class: 'btn icon', title: 'Désélectionner (Échap)', onclick: () => { this.clear(); } }, '✕')),
      h('div', { class: 'insp-tabs', role: 'tablist', 'aria-label': 'Onglets de l’inspecteur' }, tabBtn('props', 'Propriétés'), tabBtn('colors', 'Couleurs')),
      h('div', { class: 'insp-gizmo', role: 'group', 'aria-label': 'Gizmo' },
        this._modeBtn('translate', '⤧ Déplacer'), this._modeBtn('rotate', '⟳ Pivoter')),
      ...body,
      h('div', { class: 'insp-foot' },
        h('button', { class: 'btn danger', onclick: () => this.deleteSelected() }, 'Supprimer')),
    );
    this._syncPanel();
  }

  setTab(tab) {
    if (tab === this.tab) return;
    this.tab = tab;
    if (this.sel) this._build();
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

  // optDisabled(valeur) : grise les choix impossibles (ex. checkpoint aérien sur une pente).
  _select(label, options, get, set, disabled = false, optDisabled = null) {
    const sel = h('select', { disabled }, options.map(([v, text]) => h('option', { value: v }, text)));
    sel.addEventListener('change', () => this._apply(() => set(sel.value)));
    this._sync.push(() => {
      sel.value = get();
      if (optDisabled) for (const o of sel.options) o.disabled = o.value !== sel.value && !!optDisabled(o.value);
    });
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
    const group = (text) => rows.push(h('div', { class: 'insp-group' }, text));
    group('Position');
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

    // Caractéristiques (pièce d'une famille : listes déroulantes) ou Type (autres pièces de même empreinte)
    const fam = familyOf(t.t);
    if (fam) {
      group('Caractéristiques · ' + FAMILIES[fam.fam].label);
      for (const tr of FAMILIES[fam.fam].traits) rows.push(this._traitSelect(t, fam.fam, tr));
      rows.push(h('div', { class: 'insp-note' }, `Empreinte ${P.size}×${P.size} case${P.size > 1 ? 's' : ''}.`));
    } else {
      group('Type');
      const types = Object.keys(PIECES).filter((k) => PIECES[k].size === P.size && (k === t.t || (!isStartFinish(k) && !isFamilyMember(k) && !REPLACED_BY_OPTION.has(k))));
      rows.push(this._select('Type', types.map((k) => [k, PIECES[k].label]), () => t.t, (v) => ed._retypeTile(t, v), isStartFinish(t.t)));
      if (MIRROR_TYPES[t.t]) {
        rows.push(h('div', { class: 'insp-row' }, h('span', {}, 'Miroir'),
          h('button', { class: 'btn', title: 'Version gauche / droite de la pièce', onclick: () => this._apply(() => ed._retypeTile(t, MIRROR_TYPES[t.t])) }, '⇋ Inverser gauche / droite')));
      }
      if (LEGACY_CP[t.t]) {
        rows.push(h('div', { class: 'insp-row' }, h('span', {}, 'Checkpoint'),
          h('button', { class: 'btn', title: 'Remplace cette pièce par une route normale portant l’option Checkpoint', onclick: () => this._apply(() => ed._legacyToOption(t)) }, '→ Convertir en option')));
      }
    }

    // Revêtement (une bifurcation en a deux : voie directe / voie déportée)
    const fork = P.kind === 'fork';
    group(fork ? 'Revêtement · voie directe' : 'Revêtement');
    const surfs = SURFACE_ORDER.filter((s) => s === (t.s || '') || surfaceAllowed(t.t, s, !!t.v, t.o | 0));
    rows.push(this._select('Type', surfs.map((s) => [s, SURFACES[s].label]), () => t.s || '', (v) => ed.track.setSurface(t, v, SURFACES[v] && SURFACES[v].def != null ? ed._surfParamValue(v) : 0) || true));
    const S = SURFACES[t.s || ''];
    if (S && S.def != null) {
      rows.push(this._range(S.param || 'Intensité', () => t.p || S.def, (v) => ed.track.setSurface(t, t.s, v) || true, { min: S.min, max: S.max, step: 1, fmt: (v) => paramText(t.s, v) }));
    }
    if (fork) {
      group('Revêtement · voie déportée');
      const s2s = SURFACE_ORDER.filter((s) => s && (s === (t.s2 || '') || surfaceAllowed(t.t, s, !!t.v, t.o | 0)));
      rows.push(this._select('Type', [['', 'Comme la voie directe'], ['-', 'Route normale'], ...s2s.map((s) => [s, SURFACES[s].label])], () => t.s2 || '',
        (v) => ed.track.setSurface2(t, v, v && SURFACES[v] && SURFACES[v].def != null ? ed._surfParamValue(v) : 0) || true));
      const S2 = SURFACES[t.s2 || ''];
      if (S2 && S2.def != null) {
        rows.push(this._range(S2.param || 'Intensité', () => t.p2 || S2.def, (v) => ed.track.setSurface2(t, t.s2, v) || true, { min: S2.min, max: S2.max, step: 1, fmt: (v) => paramText(t.s2, v) }));
      }
    }

    // Options
    group('Options');
    const flag = (f, label, hint) => this._check(label, () => t[f], (on) => (on !== !!t[f] ? ed.track.toggleFlag(t, f) || false : true), !flagAllowed(t.t, f, t) && !t[f], hint);
    // Orientation (0.9.3) : sol, mur gauche / droit (vus dans le sens de la flèche), plafond (à l'envers : gravité inversée).
    rows.push(this._select('Orientation', ORIENTS.map((x) => [String(x.id), x.label]), () => String(tileOri(t)),
      (v) => {
        const n = +v;
        if (n === tileOri(t)) return true;
        const ok = n === 3 ? ed.track.toggleFlag(t, 'v') : ed.track.toggleFlag(t, 'o', n);
        if (!ok) ed.app.ui.flash(n === 3 ? 'Pas la place à l’envers : monte d’abord, ou libère le niveau en dessous.' : n ? 'Pas la place pour un mur : la route descend de 2 niveaux sous son niveau (monte d’abord, libère le dessous).' : 'Pas la place pour remettre la route à plat.');
        return ok || false;
      }, false, (v) => +v === 1 || +v === 2 ? !flagAllowed(t.t, 'o', null, +v) : false));
    rows.push(flag('nb', 'Sans bordures', 'Plus de rebord'));
    rows.push(flag('tn', 'Tunnel', 'Voûte autour de la route'));
    // Checkpoint : simple case à cocher (portique sur route, balise sur plateforme). L'ancien anneau aérien (cp = 2) reste lisible :
    // il s'affiche « aérien (ancien) » et se convertit en portique en cochant / décochant.
    rows.push(this._check(t.cp === 2 ? 'Checkpoint (aérien, ancien)' : 'Checkpoint', () => !!t.cp,
      (on) => { if (on === !!t.cp) return true; return ed.track.toggleFlag(t, 'cp', t.cp || 1) || false; },
      !!P.special || (!flagAllowed(t.t, 'cp', t, 1) && !t.cp), 'Route : portique. Plateforme : balise au sol.'));
    rows.push(flag('tb', 'Anneau turbo', 'Anneau à traverser pour un coup de turbo (ligne droite plate, à l’endroit)'));
    // Thème (visuel)
    rows.push(this._select('Thème', THEMES.map((x) => [String(x.id), x.label]), () => String(t.th || 0),
      (v) => { const n = +v, cur = t.th || 0; if (n === cur) return true; return ed.track.toggleFlag(t, 'th', n === 0 ? cur : n) || false; },
      !flagAllowed(t.t, 'th', t)));
    // Mouvement + réglages
    const mvOk = flagAllowed(t.t, 'mv', t) || !!t.mv;
    rows.push(this._select('Mouvement', [['0', 'Aucun'], ['1', 'Ascenseur'], ['2', 'Glissière'], ['3', 'Rotation']], () => String(t.mv || 0),
      (v) => { const n = +v; if (n === (t.mv || 0)) return true; return ed.track.toggleFlag(t, 'mv', n === 0 ? t.mv : n) || false; }, !mvOk));
    if (t.mv) rows.push(...this._moverRows(t));
    return rows;
  }

  // Vitesse et amplitude de l'ascenseur / de la glissière / de la rotation.
  _moverRows(t) {
    const ed = this.ed, M = MOVER[t.mv];
    const rows = [];
    const sign = () => (moverParams(t).speed < 0 ? -1 : 1);
    rows.push(this._range('Vitesse', () => Math.abs(moverParams(t).speed), (v) => ed.track.setMover(t, v * sign(), undefined),
      { min: Math.abs(M.speed.min) === M.speed.max ? 25 : M.speed.min, max: M.speed.max, step: 5, fmt: (v) => v + ' %' }));
    rows.push(this._range(t.mv === 1 ? 'Hauteur' : t.mv === 2 ? 'Distance' : 'Angle', () => moverParams(t).amp, (v) => ed.track.setMover(t, undefined, v),
      { min: M.amp.min, max: M.amp.max, step: M.amp.step, fmt: (v) => (t.mv === 3 && v >= 360 ? 'Tour complet' : v + M.amp.unit) }));
    if (t.mv === 3) {
      rows.push(this._check('Sens inverse', () => moverParams(t).speed < 0, (on) => ed.track.setMover(t, (on ? -1 : 1) * Math.abs(moverParams(t).speed), undefined), false, 'Tourne dans l’autre sens'));
    }
    rows.push(h('div', { class: 'insp-row' }, h('span', {}, ''),
      h('button', { class: 'btn', title: `Vitesse et amplitude d’origine (${M.label})`, onclick: () => this._apply(() => ed.track.setMover(t, 0, 0)) }, '↺ Valeurs par défaut')));
    return rows;
  }

  // Menu déroulant d'une caractéristique de famille : les combinaisons qui n'existent pas sont grisées.
  _traitSelect(t, fam, tr) {
    const sel = h('select', {}, tr.values.map(([v, text]) => h('option', { value: v }, text)));
    sel.setAttribute('aria-label', tr.label);
    sel.addEventListener('change', () => this._apply(() => this._setTrait(t, fam, tr.id, sel.value)));
    this._sync.push(() => {
      const cur = familyOf(t.t);
      if (!cur) return;
      const ok = validValues(fam, cur.traits, tr.id);
      sel.value = cur.traits[tr.id];
      for (const o of sel.options) o.disabled = !ok.has(o.value) && o.value !== cur.traits[tr.id];
    });
    return h('label', { class: 'insp-row' }, h('span', {}, tr.label), sel);
  }

  _setTrait(t, fam, id, value) {
    const cur = familyOf(t.t);
    if (!cur) return false;
    const type = withTrait(fam, cur.traits, id, value);
    if (!type || type === t.t) return true;
    if (this.ed._retypeFamily(t, type)) return true;
    this.ed.app.ui.flash(`Pas la place (${PIECES[type].size}×${PIECES[type].size}).`, 2.4);
    return false;
  }

  // Onglet Couleurs : couleurs de la chaussée, des lignes et des bordures d'une pièce ; couleur d'une décoration.
  _colorsBody(obj) {
    return this.sel.kind === 'tile' ? this._tileColors(obj) : this._decoColors(obj);
  }

  _colorRow(label, get, def, set, reset) {
    const input = h('input', { type: 'color', 'aria-label': label });
    const code = h('span', { class: 'code' });
    const undo = h('button', { class: 'btn', title: 'Revenir à la couleur d’origine', 'aria-label': `${label} : couleur d’origine`, onclick: () => this._apply(() => reset()) }, '↺');
    input.addEventListener('input', () => this._apply(() => set(input.value), { live: true }));
    input.addEventListener('change', () => this.ed._commit());
    this._sync.push(() => {
      const own = get();
      if (document.activeElement !== input) input.value = own || def();
      code.textContent = own ? own : 'origine';
      undo.disabled = !own;
    });
    return h('div', { class: 'insp-color' }, h('span', {}, label), input, code, undo);
  }

  _tileColors(t) {
    const ed = this.ed;
    const rows = [h('div', { class: 'insp-group' }, 'Couleurs de la pièce')];
    const defaults = () => { const b = styleFor({ ...t, col: null }); return { road: b.road[0], line: b.line, rail: b.railA }; };
    for (const [key, label] of [['road', 'Route'], ['line', 'Lignes'], ['rail', 'Bordures']]) {
      rows.push(this._colorRow(label, () => (t.col && t.col[key]) || '', () => defaults()[key],
        (v) => ed.track.setColors(t, { ...t.col, [key]: v }), () => ed.track.setColors(t, { ...t.col, [key]: undefined })));
    }
    rows.push(h('div', { class: 'insp-row' }, h('span', {}, ''),
      h('button', { class: 'btn', onclick: () => this._apply(() => ed.track.setColors(t, null)) }, '↺ Tout réinitialiser')));
    rows.push(h('div', { class: 'insp-note' }, 'Visuel seulement : aucun effet sur le jeu ni la vérification.'));
    return rows;
  }

  _decoColors(d) {
    const ed = this.ed;
    const touch = () => { ed.track.version++; return true; };
    const rows = [h('div', { class: 'insp-group' }, 'Couleur de la décoration')];
    const sw = h('div', { class: 'insp-swatches', role: 'group', 'aria-label': 'Couleurs prédéfinies' }, DECO_COLORS.map((c, i) => {
      const b = h('button', { class: 'swatch', style: `background:${c}`, title: `Couleur ${i + 1}`, onclick: () => this._apply(() => { d.c = i + 1; d.cc = ''; return touch(); }) });
      this._sync.push(() => b.classList.toggle('on', !d.cc && (d.c | 0) === i + 1));
      return b;
    }));
    rows.push(h('div', { class: 'insp-row' }, h('span', {}, 'Palette'), sw));
    rows.push(h('div', { class: 'insp-row' }, h('span', {}, 'Naturelle'),
      h('button', { class: 'btn', onclick: () => this._apply(() => { d.c = 0; d.cc = ''; return touch(); }) }, 'Couleurs d’origine')));
    rows.push(this._colorRow('Libre', () => d.cc || '', () => (d.c > 0 ? DECO_COLORS[d.c - 1] : '#ffffff'),
      (v) => { d.cc = v; return touch(); }, () => { d.cc = ''; return touch(); }));
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
    if (d.k === 'plaque') {
      const url = h('input', { type: 'text', maxlength: 400, placeholder: 'https://…', spellcheck: false });
      url.addEventListener('change', () => {
        if (url.value && !safeUrl(url.value)) { ed.app.ui.flash('URL https:// invalide.'); ed.app.audio.error(); this._syncPanel(); return; }
        this._apply(() => { d.u = url.value; return touch(); });
      });
      this._sync.push(() => { if (document.activeElement !== url) url.value = d.u || ''; });
      rows.push(h('label', { class: 'insp-row' }, h('span', {}, 'Image'), url));
    }
    if (obst) rows.push(this._range('Décalage', () => d.ph || 0, (v) => { d.ph = Math.max(0, Math.min(0.95, Math.round(v * 20) / 20)); return touch(); }, { min: 0, max: 0.95, step: 0.05, fmt: (v) => Math.round(v * 100) + ' %' }));
    return rows;
  }

  // ---- Actions ---------------------------------------------------------------------------------------------------------
  // Ctrl+D : copie de l'objet inspecté, posée sur la première place libre (devant, à droite, à gauche, derrière, puis au-dessus) ;
  // la copie devient la sélection. Un seul pas d'annulation.
  duplicate() {
    const ed = this.ed;
    if (!this.sel) { ed.app.ui.flash('Inspecte une pièce (I), puis Ctrl+D.'); return false; }
    const { kind, obj } = this.sel;
    let added = null;
    if (kind === 'tile') {
      const P = PIECES[obj.t];
      if (P.special === 'start') { ed.app.ui.flash('Un seul départ par circuit.'); ed.app.audio.error(); return false; }
      const f = DIRS[obj.r & 3], rt = DIRS[(obj.r + 1) & 3], n = P.size;
      const tries = [[f[0] * n, f[1] * n, obj.l + P.rise], [rt[0] * n, rt[1] * n, obj.l], [-rt[0] * n, -rt[1] * n, obj.l], [-f[0] * n, -f[1] * n, obj.l - P.rise], [0, 0, obj.l + Math.max(P.rise, 0) + Math.max(P.clearance || 0, obj.o ? 2 : 0) + 1]];
      for (const [dx, dz, l] of tries) {
        if (l < 0 || l > MAX_LEVEL) continue;
        const cand = Track.normalize({ ...obj, col: obj.col ? { ...obj.col } : null, x: obj.x + dx, z: obj.z + dz, l });
        if (!Track.inBounds(cand) || ed.track.conflicts(cand).length) continue;
        added = ed.track.add(cand);
        break;
      }
      if (!added) { ed.app.ui.flash('Pas de place pour une copie.'); ed.app.audio.error(); return false; }
    } else {
      added = ed.track.addDeco({ ...obj, x: obj.x + Math.max(4, 3 * obj.s), z: obj.z });
      if (!added) { ed.app.ui.flash('Trop de décorations.'); ed.app.audio.error(); return false; }
    }
    this.clear();
    this.select(kind, added);
    ed.app.audio.place();
    ed._changed();
    ed._commit();
    return true;
  }

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
