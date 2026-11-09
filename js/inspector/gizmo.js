// Manipulation directe dans la scène : mode (déplacer, tourner), poignées, flèche d'orientation, glisser.
// Ces méthodes s'ajoutent au prototype de Inspector (voir inspector.js) : `this` est l'instance.
import { CELL, LEVEL_H, ROAD_TOP, MAX_LEVEL } from '../constants.js';
import { PIECES, tileCenter, baseY } from '../pieces.js';
import { arrowPose } from '../tileInfo.js';
import { TAU } from './shared.js';
import { yawOf } from '../inspector.js';
export const gizmoMethods = {
  // ---- Gizmo ---------------------------------------------------------------------------------------------------------
  setMode(mode) {
    this.mode = mode;
    this._applyMode();
    this._syncPanel();
  },

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
  },

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
  },

  // Flèche de direction : posée sur la ligne centrale de la pièce, orientée dans son sens de parcours.
  _syncArrow() {
    if (!this.sel || this.sel.kind !== 'tile') { this.arrow.visible = false; return; }
    const a = arrowPose(this.sel.obj);
    this.arrow.position.set(a.x, a.y, a.z);
    this.arrow.rotation.set(0, a.yaw, 0);
    this.arrow.scale.set(a.len, 1, a.len);
    this.arrow.visible = this.ed.tool === 'inspect';
  },

  _onDrag(on) {
    this.dragging = on;
    this.ed.camLocked = on;                // pas de rotation / déplacement de caméra pendant le geste
    if (on) { this._before = this.ed._snapshot(); this._warned = false; return; }
    this._syncGizmo();                     // au relâchement, le gizmo se cale sur la grille
    if (this.ed._snapshot() !== this._before) { this.ed._changed(); this.ed._commit(); }
  },

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
  },
};
