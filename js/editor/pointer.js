// Souris, tactile et manette dans l'éditeur : événements, survol, aperçu de la pose, case et décoration visées.
// Ces méthodes s'ajoutent au prototype de EditorSession (voir editor.js) : `this` est l'instance.
import * as THREE from '../vendor/three.module.min.js';
import { CELL, LEVEL_H, MAX_LEVEL } from '../constants.js';
import { PIECES, surfaceAllowed, flagAllowed } from '../pieces.js';
import { Track } from '../track.js';
import { DECORS } from '../themes.js';
import { buildTileMesh } from '../trackMesh.js';
import { tint } from '../trackGeometry.js';
import { buildDecoMesh } from '../decos.js';
import { isObstacle } from '../obstacles.js';
import { enclosedRegion } from '../editorTools.js';
import { pickObjects, pickTileExact, rayToSurface, ERASE_FILTERS, LAYER_ALL } from '../editorPick.js';
import { MODS, OPT_KEYS, fillBase, isFill } from './shared.js';
export const pointerMethods = {
  // ---------------------------------------------------------------- Entrées
  _bind() {
    const el = this.app.renderer.domElement;
    this._h = {
      down: (e) => this._onDown(e),
      move: (e) => this._onMove(e),
      up: (e) => this._onUp(e),
      wheel: (e) => {
        e.preventDefault();
        if (this.camLocked) return;
        if (e.shiftKey) {
          const d = (e.deltaY || e.deltaX) < 0 ? 1 : -1;
          const now = performance.now();
          if (now - (this._wheelT || 0) > 90) { this.setLevel(this.level + d); this._wheelT = now; }
          return;
        }
        if (e.altKey && this.tool.startsWith('deco:')) {
          this.deco.scale = Math.max(0.3, Math.min(6, this.deco.scale * (e.deltaY < 0 ? 1.08 : 0.926)));
          this.previewKey = ''; this._refreshDeco();
          return;
        }
        this.dist = Math.max(this.minDist(), Math.min(700, this.dist * Math.pow(1.0015, e.deltaY)));
      },
      ctx: (e) => e.preventDefault(),
      keyup: (e) => { if (e.key === 'Shift') this._endShiftY(); },
      blur: () => this._endShiftY(),
      key: (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
        if (e.key === '?') { e.preventDefault(); this.app.editorHelp(); return; }
        if (!(e.ctrlKey || e.metaKey)) return;
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
        else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); }
        else if (k === 's') { e.preventDefault(); this.save(); }
        else if (k === 'c') { e.preventDefault(); this.copySel(); }
        else if (k === 'x') { e.preventDefault(); this.cutSel(); }
        else if (k === 'v') { e.preventDefault(); this.startPaste(); }
        else if (k === 'a') { e.preventDefault(); this.selectAll(); }
        else if (k === 'd') { e.preventDefault(); this.inspector.duplicate(); }      // Ctrl+D : duplique la pièce ou la décoration inspectée
      },
    };
    this._h.outside = (e) => { if (this.menuOpen && !e.target.closest('.ed-menu-wrap')) this.toggleMenu(false); };
    this._h.menuKey = (e) => {
      if (!this.menuOpen || !e.target.closest || !e.target.closest('#ed-menu')) return;
      const items = [...document.querySelectorAll('#ed-menu button')], i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.toggleMenu(false); }
    };
    document.addEventListener('pointerdown', this._h.outside, true);
    document.addEventListener('keydown', this._h.menuKey);
    el.addEventListener('pointerdown', this._h.down);
    window.addEventListener('pointermove', this._h.move);
    window.addEventListener('pointerup', this._h.up);
    window.addEventListener('pointercancel', this._h.up);
    el.addEventListener('wheel', this._h.wheel, { passive: false });
    el.addEventListener('contextmenu', this._h.ctx);
    window.addEventListener('keydown', this._h.key);
    window.addEventListener('keyup', this._h.keyup);
    window.addEventListener('blur', this._h.blur);
  },

  _setNdc(e) {
    const r = this.app.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  },

  _onDown(e) {
    this.app.audio.unlock();
    this._setNdc(e);
    // Gizmo survolé ou saisi : le clic est à lui (ni sélection, ni caméra, ni pose de pièce).
    if (this.camLocked || this.inspector.gizmoBusy) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, type: e.pointerType, moved: false });
    if (this.pointers.size === 2) this._pinch = null;
    if (e.pointerType === 'mouse' && e.button === 1) e.preventDefault();
    if (e.pointerType === 'mouse' && e.button === 0) {
      this._updateHover();
      if (this.tool === 'select') this._selectDown();
      else if (e.altKey) this._pick();
      else if (this.tool === 'inspect') this._inspectPick();
      else { this.painting = true; this._act(); }
    }
  },

  _onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (e.target === this.app.renderer.domElement || p) this._setNdc(e);
    // Phase 3 : Maj + mouvement de la souris = déplacement vertical (axe Y seul) de la pièce ou de la décoration ciblée.
    const dyPx = this._ptrY == null ? 0 : e.clientY - this._ptrY;
    this._ptrY = e.clientY;
    if (e.shiftKey && (p || e.target === this.app.renderer.domElement) && this._shiftY(dyPx)) return;
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 6) p.moved = true;

    if (p.type !== 'mouse') {
      if (this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        if (this._pinch) {
          this.dist = Math.max(this.minDist(), Math.min(700, this.dist * (this._pinch.d / d)));
          this.yaw -= ang - this._pinch.ang;
          this._pan(dx * 0.5, dy * 0.5);
        }
        this._pinch = { d, ang };
      } else if (p.moved) {
        if (this.tool === 'select' && !this.pasting) {
          if (!this.selDrag) { this._updateHover(); this._selectDown(); }
          this._updateHover(); this._selectMove();
        } else this._pan(dx, dy);
      }
      return;
    }
    if (p.button === 2 && p.moved) {
      this.yaw -= dx * 0.006;
      this.pitch = Math.max(this.freeCam ? -0.3 : 0.2, Math.min(1.5, this.pitch + dy * 0.005));      // caméra libre (E22) : jusqu'au ras du sol
    } else if (p.button === 1 && p.moved) {
      this._pan(dx, dy);
    } else if (p.button === 0 && this.selDrag) {
      this._updateHover();
      this._selectMove();
    } else if (p.button === 0 && this.painting && !this.tool.startsWith('deco:')) {
      this._updateHover();
      this._act(true);
    }
  },

  _onUp(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this._pinch = null;
    if (p.type === 'mouse') {
      if (p.button === 2 && !p.moved) { this._updateHover(); this._erase(); }
      if (p.button === 1 && !p.moved) { this._updateHover(); this._pick(); }
      if (p.button === 0) {
        if (this.selDrag) this._selectUp();
        this.painting = false;
        this._lastPaint = null;
        this._commit();
      }
    } else if (this.selDrag) {
      this._selectUp();
    } else if (!p.moved && this.pointers.size === 0) {
      this._setNdc(e);
      this._updateHover();
      if (this.tool === 'select') this._selectDown(true);
      else if (this.tool === 'inspect') this._inspectPick();
      else this._act();
      this._commit();
    }
  },

  // Mètres par pixel d'écran à la distance de l'objet (projection en perspective), corrigés de l'inclinaison de la caméra.
  _metersPerPixel(pos) {
    const cam = this.app.camera, r = this.app.renderer.domElement.getBoundingClientRect();
    const d = Math.max(1, cam.position.distanceTo(pos));
    return (2 * Math.tan((cam.fov * Math.PI) / 360) * d) / Math.max(1, r.height) / Math.max(0.3, Math.cos(this.pitch));
  },

  // Maj + souris. Renvoie true si le mouvement a été consommé (sinon la caméra / les outils gardent leurs gestes habituels).
  //  - outil Inspecter : l'objet inspecté (ou, à défaut, celui sous le curseur) monte / descend. Pièce : par demi-niveaux ; décoration : libre.
  //  - outil Décoration : règle le décalage vertical de la prochaine décoration posée.
  _shiftY(dyPx) {
    if (this.camLocked || this.inspector.dragging || this.menuOpen || !dyPx) return false;      // le survol du gizmo ne gêne pas : seul un geste de gizmo en cours est prioritaire
    if (this.tool === 'inspect') {
      const insp = this.inspector;
      if (!insp.sel) {
        const hit = this._pickTarget(LAYER_ALL);
        if (!hit) return false;
        insp.select(hit.kind, hit.obj);
      }
      const { kind, obj } = insp.sel;
      const pos = kind === 'tile' ? new THREE.Vector3((obj.x + PIECES[obj.t].size / 2) * CELL, this.levelY(obj.l), (obj.z + PIECES[obj.t].size / 2) * CELL) : new THREE.Vector3(obj.x, obj.y, obj.z);
      const dy = -dyPx * this._metersPerPixel(pos);
      if (kind === 'deco') {
        obj.y += dy;
        this.track.version++;
        this._changed();
      } else {
        this._yAcc = (this._yAcc || 0) + dy / LEVEL_H;
        const step = Math.trunc(this._yAcc * 2) / 2;                      // les pièces montent par demi-niveaux
        if (step) {
          const l = Math.max(0, Math.min(MAX_LEVEL, obj.l + step));
          this._yAcc -= step;
          if (l !== obj.l) {
            if (this._applyTilePatch(obj, { l })) { this.level = l; this._changed(); }
            else { this._yAcc = 0; if (!this._yWarn) { this._yWarn = true; this.app.ui.flash('Place occupée à cette hauteur'); } }
          }
        }
      }
      this._shiftYDirty = true;
      return true;
    }
    if (this.tool.startsWith('deco:')) {
      this.deco.dy = Math.max(-60, Math.min(300, (this.deco.dy || 0) - dyPx * this._metersPerPixel(this.target) * 0.5));
      this.previewKey = '';
      this._refreshDeco();
      return true;
    }
    return false;
  },

  // Maj relâchée : un seul pas d'historique pour tout le geste.
  _endShiftY() {
    this._yAcc = 0; this._yWarn = false; this._ptrY = null;
    if (this._shiftYDirty) { this._shiftYDirty = false; this._commit(); }
  },

  _pan(dx, dy) {
    const k = this.dist * 0.0018;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    this.target.x += -dx * k * rx + dy * k * fx;
    this.target.z += -dx * k * rz + dy * k * fz;
  },

  // ---------------------------------------------------------------- Actions
  _hoverTile() {
    if (!this.hover) return null;
    const tiles = this.track.tilesAt(this.hover.cx, this.hover.cz).filter((t) => this._layerOk(t));
    if (!tiles.length) return null;
    for (const t of tiles) {
      const [lo, hi] = Track.range(t);
      if (this.level >= lo && this.level <= hi) return t;
    }
    return tiles.reduce((a, b) => (b.l > a.l ? b : a));
  },

  // Phase 3 : la pièce EXACTE sur laquelle pointe le curseur (rayon Three.js), quelle que soit la hauteur de pose choisie. Sert aux
  // revêtements, aux options, au pot de peinture et à la pipette. Sans rayon exploitable (ou rien de touché), on retombe sur la case
  // visée au niveau courant, comme avant.
  _targetTile() {
    if (this.ndc && this.raycaster && Math.abs(this.ndc.x) <= 1 && Math.abs(this.ndc.y) <= 1 && this.app && this.app.camera) {
      this.raycaster.setFromCamera(this.ndc, this.app.camera);
      const hit = pickTileExact(this.track, this.raycaster.ray, (o) => this._layerOk(o));
      if (hit) return hit.obj;
    }
    return this._hoverTile();
  },

  _candidate() {
    if (!this.hover || !PIECES[this.tool]) return null;
    const p = PIECES[this.tool];
    const sz = p.size;
    const ax = sz % 2 === 0 ? Math.round(this.hover.x / CELL - sz / 2) : this.hover.cx - (sz - 1) / 2;
    const az = sz % 2 === 0 ? Math.round(this.hover.z / CELL - sz / 2) : this.hover.cz - (sz - 1) / 2;
    const tile = { t: this.tool, x: ax, z: az, l: this.level, r: this.rot, s: '' };
    for (const k of OPT_KEYS) if (this.opts[k]) tile[k] = this.opts[k];      // pièce + options choisies ensemble
    return tile;
  },

  // Point de pose libre sous le curseur : le rayon de la souris contre la route ou le sol (Phase 3 : plus de grille ni de niveau
  // imposé, les coordonnées sont flottantes). null si le rayon ne rencontre rien.
  _surfaceHit() {
    if (!this.ndc || !this.raycaster || Math.abs(this.ndc.x) > 1 || Math.abs(this.ndc.y) > 1) return null;
    this.raycaster.setFromCamera(this.ndc, this.app.camera);
    return rayToSurface(this.track, this.raycaster.ray);
  },

  _decoAt() {
    const kind = this.tool.slice(5);
    let x, y, z;
    const hit = this._surfaceHit();
    if (hit) { x = hit.x; y = hit.y; z = hit.z; }
    else if (this.hover) { x = this.hover.x; y = this.levelY(); z = this.hover.z; }
    else return null;
    [x, z] = this._snapPos(x, z);                           // « Libre » par défaut ; l'accrochage reste facultatif
    y += this.deco.dy || 0;                                   // décalage vertical réglé avec Maj + souris
    return { k: kind, x, y, z, ry: this.deco.rot, s: this.deco.scale, c: this.deco.color, u: kind === 'plaque' ? this.deco.url : '', cp: kind === 'custom' ? this.deco.cp : undefined, ph: isObstacle(kind) ? this.deco.ph : 0 };
  },

  _nearestDeco(maxD = 8) {
    if (!this.hover) return null;
    let best = null, bd = Infinity;
    for (const d of this.track.decos) {
      const dd = Math.hypot(d.x - this.hover.x, d.z - this.hover.z) - 1.5 * d.s;
      if (dd < bd && dd < maxD) { bd = dd; best = d; }
    }
    return best;
  },

  // Objet visé par le rayon de la souris, limité aux calques de `mask` (voir editorPick.js).
  _pickTarget(mask) {
    if (Math.abs(this.ndc.x) > 1 || Math.abs(this.ndc.y) > 1) return null;
    this.raycaster.setFromCamera(this.ndc, this.app.camera);
    return pickObjects(this.track, this.raycaster.ray, mask, (o) => this._layerOk(o));
  },

  // ---------------------------------------------------------------- Boucle
  _updateHover() {
    const cam = this.app.camera;
    this.raycaster.setFromCamera(this.ndc, cam);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.levelY());
    const hit = new THREE.Vector3();
    if (Math.abs(this.ndc.x) > 1 || Math.abs(this.ndc.y) > 1 || !this.raycaster.ray.intersectPlane(plane, hit)) {
      this.hover = null;
      return;
    }
    this.hover = { x: hit.x, z: hit.z, cx: Math.floor(hit.x / CELL), cz: Math.floor(hit.z / CELL) };
    this.lastHoverCell = this.hover;                  // gardée quand le curseur quitte la grille (déclencheurs : « case visée »)
    if (this.autoLevel) {
      const l = this.autoLevel.get(`${this.hover.cx},${this.hover.cz}`);
      if (l != null && l !== this.level) {
        this.setLevel(l, false);
        this._updateHover();
      }
    }
  },

  _updateGrid() {
    const cx = Math.round(this.target.x / CELL / 8) * 8, cz = Math.round(this.target.z / CELL / 8) * 8;
    const key = `${cx},${cz},${this.level},${this.showGrid},${this.track.decor}`;
    if (key === this.gridKey) return;
    this.gridKey = key;
    if (this.grid) { this.grid.geometry.dispose(); this.grid.material.dispose(); this.grid.removeFromParent(); this.grid = null; }
    if (!this.showGrid) return;
    const n = 32;
    const pts = [], cols = [];
    const y = this.levelY() + 0.05;
    const dark = !!(DECORS[this.track.decor] && DECORS[this.track.decor].darkGround);
    const c1 = new THREE.Color(dark ? '#5b6f9c' : '#2a1c4a'), c2 = new THREE.Color('#5ff2ff');
    for (let i = -n; i <= n; i++) {
      const c = (cx + i) % 5 === 0 ? c2 : c1;
      pts.push((cx + i) * CELL, y, (cz - n) * CELL, (cx + i) * CELL, y, (cz + n) * CELL);
      cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    for (let j = -n; j <= n; j++) {
      const c = (cz + j) % 5 === 0 ? c2 : c1;
      pts.push((cx - n) * CELL, y, (cz + j) * CELL, (cx + n) * CELL, y, (cz + j) * CELL);
      cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: this.level ? 0.6 : 0.45, depthWrite: false }));
    this.app.scene.add(this.grid);
  },

  _highlightHit(hit, color) {
    if (hit.kind === 'tile') { this._highlightTile(hit.obj, color); return; }
    const d = hit.obj;
    this.highlight.visible = true;
    this.highlight.material.color.set(color);
    this.highlight.position.set(d.x, d.y + 2 * d.s, d.z);
    this.highlight.scale.set(4 * d.s, 4 * d.s, 4 * d.s);
  },

  _highlightTile(t, color) {
    const s = PIECES[t.t].size;
    const [lo, hi] = Track.range(t);
    const y0 = lo * LEVEL_H - 0.6, y1 = (hi + 1) * LEVEL_H;
    this.highlight.visible = true;
    this.highlight.material.color.set(color);
    this.highlight.position.set((t.x + s / 2) * CELL, (y0 + y1) / 2, (t.z + s / 2) * CELL);
    this.highlight.scale.set(s * CELL + 0.4, y1 - y0, s * CELL + 0.4);
  },

  // Cases surlignées par le pot de peinture sur une zone vide (null : on les cache).
  _showFillCells(cells, color) {
    if (!this.fillCells) {
      this.fillCells = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7dffb2', transparent: true, opacity: 0.4, depthWrite: false }), 700);
      this.fillCells.frustumCulled = false;
      this.fillCells.count = 0;
      this.app.scene.add(this.fillCells);
    }
    const m = this.fillCells;
    if (!cells) { m.visible = false; return; }
    m.visible = true;
    m.material.color.set(color);
    const mat = new THREE.Matrix4();
    const n = Math.min(cells.length, 700);
    for (let i = 0; i < n; i++) { mat.makeScale(CELL - 0.8, 1, CELL - 0.8).setPosition((cells[i][0] + 0.5) * CELL, this.levelY() + 0.12, (cells[i][1] + 0.5) * CELL); m.setMatrixAt(i, mat); }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  },

  _clearPreview() {
    for (const c of [...this.preview.children]) { c.traverse((o) => o.geometry && o.geometry.dispose()); this.preview.remove(c); }
  },

  _updatePreview() {
    if (this.fillCells && (!isFill(this.tool) || !this.hover)) this.fillCells.visible = false;
    if (this.tool === 'select') { this._updatePastePreview(); return; }
    const cand = this._candidate();
    this.highlight.visible = false;
    if (this.tool.startsWith('deco:')) {
      // Décoration : posée là où le rayon touche la route ou le sol, à n'importe quelle altitude (pas de case, pas de niveau).
      this.marker.visible = false;
      this.footprint.visible = false;
      const d = this._decoAt();
      if (!d) { this.preview.visible = false; return; }
      const key = `D${d.k},${d.x.toFixed(1)},${d.z.toFixed(1)},${d.y.toFixed(2)},${d.ry},${d.s},${d.c},${d.u}`;
      if (key !== this.previewKey) {
        this.previewKey = key;
        this._clearPreview();
        this.preview.add(buildDecoMesh(d, this.previewMat, this.previewGlow));
      }
      this.preview.visible = true;
      return;
    }
    if (!this.hover) {
      this.preview.visible = false;
      this.marker.visible = false;
      this.footprint.visible = false;
      return;
    }
    const y = this.levelY();
    this.marker.visible = y > 1;
    this.marker.scale.set(1, y, 1);
    this.marker.position.set((this.hover.cx + 0.5) * CELL, y / 2, (this.hover.cz + 0.5) * CELL);
    this.footprint.visible = true;
    this.footprint.position.set((this.hover.cx + 0.5) * CELL, 0.06, (this.hover.cz + 0.5) * CELL);
    this.footprint.scale.set(CELL, 1, CELL);

    if (!cand) {
      this.preview.visible = false;
      if (this.tool === 'erase' || this.tool === 'inspect') {
        // Surbrillance de l'objet que le rayon touche, dans les calques permis par le filtre.
        const erase = this.tool === 'erase';
        const hit = this._pickTarget(erase ? ERASE_FILTERS[this.eraseFilter].mask : LAYER_ALL);
        if (hit) this._highlightHit(hit, erase ? '#ff3b5c' : '#5ff2ff');
        return;
      }
      if (isFill(this.tool) && this._emptyFillTarget()) {
        // Zone vide : cases qui seraient remplies (vert) ou refus (rouge, case seule).
        const [lo, hi] = this._fillRange();
        const reg = PIECES[fillBase(this.tool)] ? enclosedRegion(this.track, this.hover.cx, this.hover.cz, lo, hi) : { ok: false };
        this._showFillCells(reg.ok ? reg.cells : [[this.hover.cx, this.hover.cz]], reg.ok ? '#7dffb2' : '#ff3b5c');
        return;
      }
      this._showFillCells(null);
      const t = this._targetTile();
      if (t) {
        if (isFill(this.tool)) {
          this._highlightTile(t, this._fillRefusal(t) ? '#ff3b5c' : '#ffb347');
        } else if (this.tool.startsWith('surf:')) {
          const s = this.tool.slice(5);
          this._highlightTile(t, surfaceAllowed(t.t, s, t.o | 0) ? (s ? tint(s, this._surfParamValue(s)) : '#ffffff') : '#ff3b5c');
        } else {
          const m = MODS.find((x) => x.id === this.tool);
          this._highlightTile(t, m && flagAllowed(t.t, m.flag, t, m.val || 1) ? '#8f7cff' : '#ff3b5c');
        }
      }
      return;
    }
    const key = `${cand.t},${cand.x},${cand.z},${cand.l},${cand.r},${OPT_KEYS.map((k) => cand[k] | 0).join('')},${this.track.version}`;
    if (key === this.previewKey) return;
    this.previewKey = key;
    this._clearPreview();
    const conflicts = this.track.conflicts(cand);
    if (!Track.inBounds(Track.normalize(cand))) conflicts.push(null);
    const nc = Track.normalize(cand);
    const same = conflicts.length === 1 && conflicts[0] && ['t', 'x', 'z', 'l', 'r'].every((k) => conflicts[0][k] === cand[k]) && OPT_KEYS.every((k) => (conflicts[0][k] | 0) === (nc[k] | 0));
    this.previewMat.emissive.set(conflicts.length && !same ? '#ff2244' : '#000000');
    this.previewMat.emissiveIntensity = 0.45;
    this.preview.add(buildTileMesh(Track.normalize(cand), this.previewMat, this.previewGlow));
    this.preview.visible = !same;
  },

  // Curseur virtuel piloté à la manette.
  _padCursor(pad, dt) {
    if (pad.cx || pad.cy) {
      this.ndc.x = Math.max(-1, Math.min(1, (this.ndc.x > 5 ? 0 : this.ndc.x) + pad.cx * dt * 1.4));
      this.ndc.y = Math.max(-1, Math.min(1, (this.ndc.y > 5 ? 0 : this.ndc.y) - pad.cy * dt * 1.4));
      this.padCursor = true;
    }
    if (pad.place) { this._updateHover(); this._act(); this._commit(); }
    if (pad.erase) { this._updateHover(); this._erase(); }
    if (pad.pick) { this._updateHover(); this._pick(); }
  },
};
