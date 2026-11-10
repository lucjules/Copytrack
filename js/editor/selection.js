// Sélection rectangulaire, copier / couper / coller, vue par niveau et repérage des problèmes.
// Ces méthodes s'ajoutent au prototype de EditorSession (voir editor.js) : `this` est l'instance.
import * as THREE from '../vendor/three.module.min.js';
import { CELL, MAX_LEVEL, LEVEL_H } from '../constants.js';
import { PIECES } from '../pieces.js';
import { Track } from '../track.js';
import { buildTileMesh } from '../trackMesh.js';
import { buildDecoMesh } from '../decos.js';
import { normRect, tilesInRect, decosInRect, copyRect, rotateClip, placedClip, pasteClip, shiftLevel, moveSelection, rotateSelection, checkTrack } from '../editorTools.js';
import { orientationIssues } from '../joins.js';
export const selectionMethods = {
  // Problèmes repérables sans rouler (0.9.5) : extrémités libres, sauts risqués, pièces inaccessibles (checkTrack), puis raccords d'orientation
  // de 0.9.3 (un mur contre le sol : il manque une transition). Calculés une fois par état du circuit ; { tile, level, msg }.
  _tileIssues() {
    const v = this.track.version;
    if (this._joinKey !== v) {
      this._joinKey = v;
      this._joinList = checkTrack(this.track).filter((i) => i.tile)
        .concat(orientationIssues(this.track).map((i) => ({ tile: i.tile, level: 'warn', msg: i.msg })));
    }
    return this._joinList;
  },

  // ---------------------------------------------------------------- Sélection
  _selectDown(tap = false) {
    if (!this.hover) return;
    if (this.pasting) { this.doPaste(); return; }
    this.selDrag = { cx: this.hover.cx, cz: this.hover.cz };
    this.sel = normRect(this.selDrag, this.selDrag);
    if (tap) { this.selDrag = null; this._selInfo(); }
  },

  _selectMove() {
    if (!this.selDrag || !this.hover) return;
    this.sel = normRect(this.selDrag, this.hover);
  },

  _selectUp() {
    this.selDrag = null;
    this._selInfo();
  },

  // Ce que la sélection touche : les pièces et décorations du rectangle, sauf celles d'un calque masqué ou verrouillé (editor/groups.js), et, en
  // vue par niveau, seulement celles du niveau affiché.
  _selOk(o) {
    if (!this._layerOk(o)) return false;
    if (!this.focusLevel) return true;
    if (o.t) { const [lo, hi] = Track.range(o); return this.level >= lo && this.level <= hi; }
    return Math.abs(o.y - this.level * LEVEL_H) < LEVEL_H;          // décoration : à la hauteur du niveau (± un niveau)
  },
  _selTiles() { return this.sel ? tilesInRect(this.track, this.sel).filter((t) => this._selOk(t)) : []; },
  _selDecos() { return this.sel ? decosInRect(this.track, this.sel).filter((d) => this._selOk(d)) : []; },

  _selInfo() {
    if (!this.sel) return;
    const n = this._selTiles().length, d = this._selDecos().length;
    this.app.ui.flash(`${n} pièce${n > 1 ? 's' : ''}${d ? `, ${d} décoration${d > 1 ? 's' : ''}` : ''} sélectionnée${n + d > 1 ? 's' : ''}`, 2);
    this._refreshSelBar();
  },

  selectAll() {
    if (!this.track.tiles.length) return;
    this.setTool('select');
    const xs = this.track.tiles.flatMap((t) => Track.cellsOf(t).map((c) => c[0]));
    const zs = this.track.tiles.flatMap((t) => Track.cellsOf(t).map((c) => c[1]));
    this.sel = { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) };
    this._selInfo();
  },

  clearSel() {
    this.sel = null; this.selDrag = null; this.pasting = false; this.previewKey = '';
    this._clearPreview();
    this._refreshSelBar();
  },

  copySel(silent = false) {
    if (!this.sel) { this.app.ui.flash('Sélectionne d\'abord une zone (outil Sélection, Q).'); return false; }
    const clip = copyRect(this.track, this.sel, (o) => this._selOk(o));
    if (!clip) { this.app.ui.flash('Rien à copier dans cette zone.'); return false; }
    this.clip = clip;
    if (!silent) this.app.ui.flash(`Copié : ${clip.tiles.length} pièce(s). Ctrl+V pour coller.`);
    this._refreshSelBar();
    return true;
  },

  cutSel() {
    if (!this.copySel(true)) return;
    this.deleteSel(true);
    this.startPaste();
    this.app.ui.flash('Coupé : clique pour poser la zone ailleurs (R pour pivoter).', 3);
  },

  deleteSel(silent = false) {
    if (!this.sel) return;
    const tiles = this._selTiles(), decos = this._selDecos();
    for (const t of tiles) this.track.remove(t);
    for (const d of decos) this.track.removeDeco(d);
    if (!silent) this.app.audio.erase();
    this._changed();
    this._commit();
  },

  shiftSel(d) {
    if (!this.sel) return;
    const tiles = this._selTiles(), decos = this._selDecos();
    if (!tiles.length && !decos.length) return;
    if (!shiftLevel(this.track, tiles, decos, d)) { this.app.ui.flash('Impossible : pièce gênante ou hors niveaux.'); this.app.audio.error(); return; }
    this.app.audio.place();
    this._changed();
    this._commit();
  },

  // Déplace la sélection d'une case (tout ou rien : si une pièce gêne, rien ne bouge). La zone sélectionnée suit.
  moveSel(dx, dz) {
    if (!this.sel) return;
    const tiles = this._selTiles(), decos = this._selDecos();
    if (!tiles.length && !decos.length) return;
    if (!moveSelection(this.track, this.sel, tiles, decos, dx, dz)) { this.app.ui.flash('Impossible : une pièce gêne ou la zone sortirait du circuit.'); this.app.audio.error(); return; }
    this.sel = { x0: this.sel.x0 + dx, z0: this.sel.z0 + dz, x1: this.sel.x1 + dx, z1: this.sel.z1 + dz };
    this.app.audio.place();
    this._changed();
    this._commit();
  },

  // Pivote la sélection d'un quart de tour autour de son coin haut-gauche (tout ou rien, comme le déplacement).
  rotateSel() {
    if (!this.sel) return;
    const tiles = this._selTiles(), decos = this._selDecos();
    if (!tiles.length && !decos.length) return;
    if (!rotateSelection(this.track, this.sel, tiles, decos)) { this.app.ui.flash('Impossible : une pièce gêne ou la zone sortirait du circuit.'); this.app.audio.error(); return; }
    const r = this.sel;
    this.sel = { x0: r.x0, z0: r.z0, x1: r.x0 + (r.z1 - r.z0), z1: r.z0 + (r.x1 - r.x0) };
    this.app.audio.place();
    this._changed();
    this._commit();
  },

  // Duplique la sélection : copie puis collage à poser (le premier clic place le double, l'original ne bouge pas).
  duplicateSel() {
    if (this.copySel(true)) this.startPaste();
  },

  startPaste() {
    if (!this.clip) { this.app.ui.flash('Presse-papiers vide : copie d\'abord une zone.'); return; }
    if (this.tool !== 'select') this.setTool('select');
    this.pasting = true;
    this.sel = null;
    this.previewKey = '';
    this.app.ui.flash('Clique pour coller · R pour pivoter · Échap pour annuler', 2.6);
    this._refreshSelBar();
  },

  rotateClipboard() {
    if (!this.clip) return;
    this.clip = rotateClip(this.clip);
    this.previewKey = '';
    this.app.audio.click();
  },

  doPaste() {
    if (!this.clip || !this.hover) return;
    const res = pasteClip(this.track, this.clip, this.hover.cx, this.hover.cz, this.level);
    this.app.audio.place();
    if (res.skipped) this.app.ui.flash(`${res.skipped} pièce(s) ignorée(s) (départ en double ou hors des niveaux).`);
    this._changed();
    this._commit();
  },

  _updateSelBox() {
    const r = this.sel;
    this.selBox.visible = !!r && this.tool === 'select' && !this.pasting;
    if (!this.selBox.visible) return;
    const h = this.levelY() + 6;
    this.selBox.scale.set((r.x1 - r.x0 + 1) * CELL, h + 2, (r.z1 - r.z0 + 1) * CELL);
    this.selBox.position.set((r.x0 + r.x1 + 1) / 2 * CELL, h / 2 - 1, (r.z0 + r.z1 + 1) / 2 * CELL);
  },

  _updatePastePreview() {
    this.highlight.visible = false;
    this.marker.visible = false;
    this.footprint.visible = !!this.hover && !this.pasting;
    if (this.hover && !this.pasting) {
      this.footprint.position.set((this.hover.cx + 0.5) * CELL, 0.06, (this.hover.cz + 0.5) * CELL);
      this.footprint.scale.set(CELL, 1, CELL);
    }
    if (!this.pasting || !this.clip || !this.hover) { this.preview.visible = false; return; }
    const key = `P${this.hover.cx},${this.hover.cz},${this.level},${this.clip.tiles.length},${this.clip.tiles.map((t) => t.r).join('')},${this.clip.w}`;
    this.preview.visible = true;
    if (key === this.previewKey) return;
    this.previewKey = key;
    this._clearPreview();
    const P = placedClip(this.clip, this.hover.cx, this.hover.cz, this.level);
    let bad = false;
    for (const t of P.tiles) {
      if (t.l < 0 || t.l > MAX_LEVEL) { bad = true; continue; }
      if (this.track.conflicts(Track.normalize(t)).length) bad = true;
      this.preview.add(buildTileMesh(Track.normalize(t), this.previewMat, this.previewGlow));
    }
    for (const d of P.decos.slice(0, 40)) this.preview.add(buildDecoMesh(d, this.previewMat, this.previewGlow));
    this.previewMat.emissive.set(bad ? '#ff8800' : '#000000');
    this.previewMat.emissiveIntensity = 0.35;
  },

  _refreshSelBar() {
    const bar = document.getElementById('ed-selbar');
    if (!bar) return;
    bar.classList.toggle('hidden', this.tool !== 'select');
    bar.querySelectorAll('[data-sel]').forEach((b) => {
      const a = b.dataset.sel;
      b.disabled = (['copy', 'cut', 'del', 'up', 'down', 'dup', 'mv-l', 'mv-r', 'mv-u', 'mv-d'].includes(a) && !this.sel) || (a === 'paste' && !this.clip) || (a === 'rot' && !this.pasting && !this.sel);
    });
  },

  selAction(a) {
    switch (a) {
      case 'copy': this.copySel(); break;
      case 'cut': this.cutSel(); break;
      case 'paste': this.startPaste(); break;
      case 'rot': if (this.pasting) this.rotateClipboard(); else this.rotateSel(); break;
      case 'dup': this.duplicateSel(); break;
      case 'mv-l': this.moveSel(-1, 0); break;
      case 'mv-r': this.moveSel(1, 0); break;
      case 'mv-u': this.moveSel(0, -1); break;
      case 'mv-d': this.moveSel(0, 1); break;
      case 'del': this.deleteSel(); break;
      case 'up': this.shiftSel(1); break;
      case 'down': this.shiftSel(-1); break;
      case 'all': this.selectAll(); break;
      case 'none': this.clearSel(); break;
      default: break;
    }
    this._refreshSelBar();
  },

  // ---------------------------------------------------------------- Vue par niveau
  toggleLevelView() {
    this.focusLevel = !this.focusLevel;
    this.needsRebuild = true;
    this.app.ui.flash(this.focusLevel ? `Niveau ${this.level} seul` : 'Tous les niveaux', 1.6);
    const b = document.querySelector('[data-ed="levelview"]');
    if (b) b.classList.toggle('on', this.focusLevel);
  },

  _markIssues(issues) {
    for (const c of [...this.marks.children]) { c.geometry.dispose(); c.material.dispose(); this.marks.remove(c); }
    for (const i of issues) {
      if (!i.tile) continue;
      const P = PIECES[i.tile.t];
      const m = new THREE.Mesh(new THREE.BoxGeometry(P.size * CELL, 3, P.size * CELL),
        new THREE.MeshBasicMaterial({ color: i.level === 'error' ? '#ff2b4a' : '#ffa21a', transparent: true, opacity: 0.35, depthWrite: false }));
      m.position.set((i.tile.x + P.size / 2) * CELL, this.levelY(i.tile.l) + 1.4, (i.tile.z + P.size / 2) * CELL);
      this.marks.add(m);
    }
    this.marksT = 9;
  },
};
