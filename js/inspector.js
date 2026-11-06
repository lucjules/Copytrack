// Mode Inspection de l'éditeur : sélection d'une pièce ou d'une décoration, panneau de propriétés généré selon
// l'objet, et gizmos 3D (TransformControls : flèches de déplacement, cercles de rotation).
//
// Liaison dans les deux sens : le panneau écrit dans le circuit (et la grille de données) ; tout changement du
// circuit (gizmo, annuler / rétablir, autres outils) relit le panneau. Chaque geste = un seul pas d'historique.
// La caméra de l'éditeur n'est pas un OrbitControls : elle est verrouillée (ed.camLocked) tant qu'un gizmo est saisi.
import * as THREE from './vendor/three.module.min.js';
import { TransformControls } from './vendor/TransformControls.js';
import { MAX_LEVEL, DIRS } from './constants.js';
import { Track } from './track.js';
import { PIECES } from './pieces.js';
import { DECO_LABELS } from './decoData.js';
import { tileBounds, decoBounds, pickObjects, LAYER_ALL } from './editorPick.js';
import { h } from './dom.js';
import { TAU } from './inspector/shared.js';
import { gizmoMethods } from './inspector/gizmo.js';
import { widgetMethods } from './inspector/widgets.js';
import { bodyMethods } from './inspector/bodies.js';

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

// Les familles de méthodes vivent dans inspector/ ; elles s'ajoutent au prototype (`this` est l'instance).
Object.assign(Inspector.prototype, gizmoMethods, widgetMethods, bodyMethods);
