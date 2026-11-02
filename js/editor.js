// Éditeur de circuits : pose de pièces sur grille, niveaux, rotation, historique.
import * as THREE from './vendor/three.module.min.js';
import { CELL, LEVEL_H, ROAD_TOP, MAX_LEVEL } from './constants.js';
import { PIECES } from './pieces.js';
import { Track } from './track.js';
import { TrackView, buildTileMesh } from './trackMesh.js';
import { setEditorDraft, saveMyTrack, newId } from './storage.js';

export const PALETTE_ORDER = [
  { id: 'straight', key: 'Digit1', k: '1' },
  { id: 'curve', key: 'Digit2', k: '2' },
  { id: 'bigcurve', key: 'Digit3', k: '3' },
  { id: 'slope', key: 'Digit4', k: '4' },
  { id: 'steep', key: 'Digit5', k: '5' },
  { id: 'boost', key: 'Digit6', k: '6' },
  { id: 'ice', key: 'Digit7', k: '7' },
  { id: 'checkpoint', key: 'Digit8', k: '8' },
  { id: 'start', key: 'Digit9', k: '9' },
  { id: 'finish', key: 'Digit0', k: '0' },
  { id: 'platform', key: 'KeyP', k: 'P' },
  { id: 'erase', key: 'KeyX', k: 'X' },
];

// Icônes (vue de dessus) des pièces.
const road = (inner) => `<svg viewBox="0 0 48 48">${inner}</svg>`;
const ROAD = '#3c4160', RAIL = '#ff6b57', LINE = '#efe6d6';
export const ICONS = {
  straight: road(`<rect x="12" y="2" width="24" height="44" fill="${ROAD}"/><rect x="10" y="2" width="2" height="44" fill="${RAIL}"/><rect x="36" y="2" width="2" height="44" fill="${RAIL}"/><path d="M24 6v8M24 20v8M24 34v8" stroke="${LINE}" stroke-width="2"/>`),
  curve: road(`<path d="M12 48 A36 36 0 0 1 48 12 L48 36 A12 12 0 0 0 36 48Z" fill="${ROAD}"/><path d="M12 48 A36 36 0 0 1 48 12" stroke="${RAIL}" stroke-width="2.5" fill="none"/><path d="M36 48 A12 12 0 0 1 48 36" stroke="${RAIL}" stroke-width="2.5" fill="none"/>`),
  bigcurve: road(`<path d="M6 48 A42 42 0 0 1 48 6 L48 22 A26 26 0 0 0 22 48Z" fill="${ROAD}"/><path d="M6 48 A42 42 0 0 1 48 6" stroke="${RAIL}" stroke-width="2.5" fill="none"/><path d="M22 48 A26 26 0 0 1 48 22" stroke="${RAIL}" stroke-width="2.5" fill="none"/>`),
  slope: road(`<rect x="12" y="2" width="24" height="44" fill="${ROAD}"/><rect x="10" y="2" width="2" height="44" fill="${RAIL}"/><rect x="36" y="2" width="2" height="44" fill="${RAIL}"/><path d="M24 36V12M16 20l8-8 8 8" stroke="${LINE}" stroke-width="3" fill="none"/>`),
  steep: road(`<rect x="12" y="2" width="24" height="44" fill="${ROAD}"/><rect x="10" y="2" width="2" height="44" fill="${RAIL}"/><rect x="36" y="2" width="2" height="44" fill="${RAIL}"/><path d="M16 26l8-8 8 8M16 38l8-8 8 8" stroke="#ffbf3c" stroke-width="3" fill="none"/>`),
  boost: road(`<rect x="12" y="2" width="24" height="44" fill="${ROAD}"/><rect x="10" y="2" width="2" height="44" fill="#2fe0ff"/><rect x="36" y="2" width="2" height="44" fill="#2fe0ff"/><path d="M16 18l8-7 8 7M16 30l8-7 8 7M16 42l8-7 8 7" stroke="#36e9ff" stroke-width="3" fill="none"/>`),
  ice: road(`<rect x="12" y="2" width="24" height="44" fill="#bfe4f2"/><rect x="10" y="2" width="2" height="44" fill="#7fd3ff"/><rect x="36" y="2" width="2" height="44" fill="#7fd3ff"/><path d="M24 14v20M15 19l18 10M15 29l18-10" stroke="#4aa8d8" stroke-width="2.5"/>`),
  checkpoint: road(`<rect x="12" y="2" width="24" height="44" fill="${ROAD}"/><rect x="10" y="2" width="2" height="44" fill="${RAIL}"/><rect x="36" y="2" width="2" height="44" fill="${RAIL}"/><rect x="6" y="20" width="36" height="8" rx="2" fill="#ffbf3c"/>`),
  start: road(`<rect x="12" y="2" width="24" height="44" fill="${ROAD}"/><rect x="10" y="2" width="2" height="44" fill="${RAIL}"/><rect x="36" y="2" width="2" height="44" fill="${RAIL}"/><rect x="6" y="22" width="36" height="6" rx="2" fill="#2fd3b5"/><path d="M24 18V6M18 12l6-6 6 6" stroke="${LINE}" stroke-width="2.5" fill="none"/>`),
  finish: road(`<rect x="12" y="2" width="24" height="44" fill="${ROAD}"/><rect x="10" y="2" width="2" height="44" fill="${RAIL}"/><rect x="36" y="2" width="2" height="44" fill="${RAIL}"/><g fill="#f7f2ea"><rect x="12" y="20" width="4" height="4"/><rect x="20" y="20" width="4" height="4"/><rect x="28" y="20" width="4" height="4"/><rect x="16" y="24" width="4" height="4"/><rect x="24" y="24" width="4" height="4"/><rect x="32" y="24" width="4" height="4"/></g><rect x="6" y="16" width="36" height="3" fill="#ff4f9a"/>`),
  platform: road(`<rect x="4" y="4" width="40" height="40" fill="#454a6a" stroke="#ffb84d" stroke-width="2"/><path d="M4 24h40M24 4v40" stroke="#5a6088" stroke-width="2"/>`),
  erase: road(`<path d="M12 12l24 24M36 12L12 36" stroke="#ff5a6e" stroke-width="5" stroke-linecap="round"/>`),
};

export function pieceLabel(id) {
  return id === 'erase' ? 'Gomme' : PIECES[id].label;
}

export class EditorSession {
  constructor(app, state = {}) {
    this.app = app;
    this.state = state;
    if (state.code) {
      try { this.track = Track.decode(state.code); } catch { this.track = new Track('Mon circuit'); }
    } else {
      this.track = new Track(state.name || 'Mon circuit');
      this.track.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 });
    }
    if (state.name) this.track.name = state.name;
    this.entryId = state.entryId || null;
    this.tool = state.tool || 'straight';
    this.rot = state.rot || 0;
    this.level = state.level || 0;
    this.dirty = false;

    this.view = new TrackView(this.track, app.materials);
    app.scenery.trackGroup.add(this.view.group);
    app.scenery.setTrack(this.track, 'editeur', { decor: false, minHalf: CELL * 45 });

    // Aperçu de la pièce
    this.previewMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.62, depthWrite: false, emissive: '#000000' });
    this.previewGlow = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
    this.preview = new THREE.Group();
    app.scene.add(this.preview);
    this.previewKey = '';

    // Surbrillance (gomme)
    this.highlight = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: '#ff3b5c', transparent: true, opacity: 0.28, depthWrite: false }),
    );
    this.highlight.visible = false;
    app.scene.add(this.highlight);

    // Repère vertical sous le curseur
    this.marker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 1, 6),
      new THREE.MeshBasicMaterial({ color: '#5ff2ff', transparent: true, opacity: 0.6 }),
    );
    app.scene.add(this.marker);
    this.footprint = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#5ff2ff', transparent: true, opacity: 0.18, depthWrite: false }),
    );
    app.scene.add(this.footprint);

    // Grille
    this.grid = null;
    this.gridKey = '';

    // Caméra
    const b = this.track.bounds();
    const cam = state.cam || {
      tx: (b.minX + b.maxX) / 2, tz: (b.minZ + b.maxZ) / 2,
      dist: Math.max(110, Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 1.1), yaw: Math.PI * 0.25, pitch: 0.95,
    };
    this.target = new THREE.Vector3(cam.tx, this.levelY(), cam.tz);
    this.dist = cam.dist; this.yaw = cam.yaw; this.pitch = cam.pitch;

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2(9, 9);
    this.hover = null;
    this.pointers = new Map();

    this.history = [this._snapshot()];
    this.hIndex = 0;

    this._bind();
    this._buildPalette();
    this._refreshUI();
    app.camera.fov = 55;
    app.camera.updateProjectionMatrix();
  }

  levelY(l = this.level) {
    return l * LEVEL_H + ROAD_TOP;
  }

  exportState() {
    return {
      code: this.track.encode(),
      entryId: this.entryId,
      name: this.track.name,
      tool: this.tool,
      rot: this.rot,
      level: this.level,
      cam: { tx: this.target.x, tz: this.target.z, dist: this.dist, yaw: this.yaw, pitch: this.pitch },
    };
  }

  // ---------------------------------------------------------------- UI
  _buildPalette() {
    const pal = document.getElementById('ed-palette');
    pal.innerHTML = '';
    for (const p of PALETTE_ORDER) {
      const b = document.createElement('button');
      b.className = 'piece-btn';
      b.dataset.piece = p.id;
      b.title = `${pieceLabel(p.id)} (${p.k})`;
      b.innerHTML = `<span class="k">${p.k}</span>${ICONS[p.id]}<span>${pieceLabel(p.id)}</span>`;
      b.addEventListener('click', () => { this.setTool(p.id); this.app.audio.click(); });
      pal.appendChild(b);
    }
    const name = document.getElementById('ed-name');
    name.value = this.track.name;
    name.oninput = () => { this.track.name = name.value.trim() || 'Sans titre'; this._changed(false); };
  }

  setTool(id) {
    this.tool = id;
    this.previewKey = '';
    this._refreshUI();
  }

  _refreshUI() {
    document.querySelectorAll('#ed-palette .piece-btn').forEach((b) => b.classList.toggle('on', b.dataset.piece === this.tool));
    document.getElementById('ed-level').textContent = `Niv. ${this.level}`;
    const t = this.track;
    const cps = t.count('checkpoint');
    const errs = t.validate();
    const status = document.getElementById('ed-status');
    status.innerHTML = `<b>${pieceLabel(this.tool)}</b> · ${this.rot * 90}° · niveau ${this.level}<br>` +
      `${t.tiles.length} pièce${t.tiles.length > 1 ? 's' : ''} · ${cps} checkpoint${cps > 1 ? 's' : ''}` +
      (errs.length ? `<br><span class="warn">⚠ ${errs.join(' ')}</span>` : '');
  }

  // ---------------------------------------------------------------- Historique
  _snapshot() {
    return JSON.stringify(this.track.tiles.map((t) => [t.t, t.x, t.z, t.l, t.r]));
  }

  _restore(snap) {
    this.track.clear();
    for (const [t, x, z, l, r] of JSON.parse(snap)) this.track.add({ t, x, z, l, r });
    this._changed(false);
  }

  _commit() {
    const snap = this._snapshot();
    if (snap === this.history[this.hIndex]) return;
    this.history.length = this.hIndex + 1;
    this.history.push(snap);
    if (this.history.length > 200) this.history.shift();
    this.hIndex = this.history.length - 1;
  }

  undo() {
    if (this.hIndex <= 0) return;
    this.hIndex--;
    this._restore(this.history[this.hIndex]);
    this.app.audio.click();
  }

  redo() {
    if (this.hIndex >= this.history.length - 1) return;
    this.hIndex++;
    this._restore(this.history[this.hIndex]);
    this.app.audio.click();
  }

  _changed(rebuild = true) {
    this.dirty = true;
    if (rebuild) this.needsRebuild = true;
    this.previewKey = '';
    this._refreshUI();
    clearTimeout(this._draftT);
    this._draftT = setTimeout(() => setEditorDraft(this.exportState()), 400);
  }

  save() {
    const entry = saveMyTrack({ id: this.entryId || newId(), name: this.track.name, code: this.track.encode() });
    this.entryId = entry.id;
    this.dirty = false;
    setEditorDraft(this.exportState());
    this.app.ui.flash('Circuit enregistré dans « Mes circuits »');
  }

  newTrack() {
    this.track.clear();
    this.track.name = 'Mon circuit';
    this.track.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 });
    document.getElementById('ed-name').value = this.track.name;
    this.entryId = null;
    this.level = 0;
    this.target.set(CELL / 2, this.levelY(), CELL / 2);
    this._commit();
    this._changed();
  }

  loadCode(code) {
    const t = Track.decode(code);
    this.track.clear();
    for (const tile of t.tiles) this.track.add(tile);
    this.track.name = t.name;
    document.getElementById('ed-name').value = t.name;
    this.entryId = null;
    const b = this.track.bounds();
    this.target.set((b.minX + b.maxX) / 2, this.levelY(), (b.minZ + b.maxZ) / 2);
    this._commit();
    this._changed();
  }

  // ---------------------------------------------------------------- Entrées
  _bind() {
    const el = this.app.renderer.domElement;
    this._h = {
      down: (e) => this._onDown(e),
      move: (e) => this._onMove(e),
      up: (e) => this._onUp(e),
      wheel: (e) => { e.preventDefault(); this.dist = Math.max(25, Math.min(600, this.dist * Math.pow(1.0015, e.deltaY))); },
      ctx: (e) => e.preventDefault(),
      key: (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        if (!(e.ctrlKey || e.metaKey)) return;
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
        else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); }
        else if (k === 's') { e.preventDefault(); this.save(); }
      },
    };
    el.addEventListener('pointerdown', this._h.down);
    window.addEventListener('pointermove', this._h.move);
    window.addEventListener('pointerup', this._h.up);
    window.addEventListener('pointercancel', this._h.up);
    el.addEventListener('wheel', this._h.wheel, { passive: false });
    el.addEventListener('contextmenu', this._h.ctx);
    window.addEventListener('keydown', this._h.key);
  }

  _setNdc(e) {
    const r = this.app.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  _onDown(e) {
    this.app.audio.unlock();
    this._setNdc(e);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, type: e.pointerType, moved: false });
    if (this.pointers.size === 2) this._pinch = null;
    if (e.pointerType === 'mouse' && e.button === 0) {
      this._updateHover();
      if (e.altKey) this._pick();
      else { this.painting = true; this._act(); }
    }
  }

  _onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (e.target === this.app.renderer.domElement || p) this._setNdc(e);
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
          this.dist = Math.max(25, Math.min(600, this.dist * (this._pinch.d / d)));
          this.yaw -= ang - this._pinch.ang;
          this._pan(dx * 0.5, dy * 0.5);
        }
        this._pinch = { d, ang };
      } else if (p.moved) {
        this._pan(dx, dy);
      }
      return;
    }
    if (p.button === 2 && p.moved) {
      this.yaw -= dx * 0.006;
      this.pitch = Math.max(0.2, Math.min(1.45, this.pitch + dy * 0.005));
    } else if (p.button === 1) {
      this._pan(dx, dy);
    } else if (p.button === 0 && this.painting) {
      this._updateHover();
      this._act(true);
    }
  }

  _onUp(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this._pinch = null;
    if (p.type === 'mouse') {
      if (p.button === 2 && !p.moved) { this._updateHover(); this._erase(); }
      if (p.button === 0) {
        this.painting = false;
        this._commit();
      }
    } else if (!p.moved && this.pointers.size === 0) {
      this._setNdc(e);
      this._updateHover();
      this._act();
      this._commit();
    }
  }

  _pan(dx, dy) {
    const k = this.dist * 0.0018;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    this.target.x += -dx * k * rx + dy * k * fx;
    this.target.z += -dx * k * rz + dy * k * fz;
  }

  // ---------------------------------------------------------------- Actions
  _hoverTile() {
    if (!this.hover) return null;
    const tiles = this.track.tilesAt(this.hover.cx, this.hover.cz);
    if (!tiles.length) return null;
    for (const t of tiles) {
      const [lo, hi] = Track.range(t);
      if (this.level >= lo && this.level <= hi) return t;
    }
    return tiles.reduce((a, b) => (b.l > a.l ? b : a));
  }

  _candidate() {
    if (!this.hover || this.tool === 'erase') return null;
    const p = PIECES[this.tool];
    const ax = p.size === 2 ? Math.round(this.hover.x / CELL) - 1 : this.hover.cx;
    const az = p.size === 2 ? Math.round(this.hover.z / CELL) - 1 : this.hover.cz;
    return { t: this.tool, x: ax, z: az, l: this.level, r: this.rot };
  }

  _act(painting = false) {
    if (this.tool === 'erase') { this._erase(painting); return; }
    const tile = this._candidate();
    if (!tile) return;
    const key = `${tile.x},${tile.z},${tile.l}`;
    if (painting && key === this._lastPaint) return;
    this._lastPaint = key;
    const conflicts = this.track.conflicts(tile);
    if (conflicts.length === 1) {
      const c = conflicts[0];
      if (c.t === tile.t && c.x === tile.x && c.z === tile.z && c.l === tile.l && c.r === tile.r) return;
    }
    for (const c of conflicts) this.track.remove(c);
    if (tile.t === 'start') for (const s of this.track.tiles.filter((t) => t.t === 'start')) this.track.remove(s);
    this.track.add(tile);
    this.app.audio.place();
    this._changed();
    if (!painting) this._commit();
  }

  _erase(painting = false) {
    const t = this._hoverTile();
    if (!t) return;
    this.track.remove(t);
    this.app.audio.erase();
    this._changed();
    if (!painting) this._commit();
  }

  _pick() {
    const t = this._hoverTile();
    if (!t) return;
    this.tool = t.t; this.rot = t.r; this.level = t.l;
    this.previewKey = '';
    this._refreshUI();
    this.app.ui.flash(`Pipette : ${pieceLabel(t.t)}`);
  }

  rotate(d = 1) {
    this.rot = (this.rot + d + 4) & 3;
    this.previewKey = '';
    this._refreshUI();
  }

  setLevel(l) {
    this.level = Math.max(0, Math.min(MAX_LEVEL, l));
    this.previewKey = '';
    this._refreshUI();
  }

  test() {
    const errs = this.track.validate();
    if (errs.length) {
      this.app.ui.flash(errs.join(' '));
      this.app.audio.error();
      return;
    }
    this.app.testTrack(this.exportState());
  }

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
  }

  _updateGrid() {
    const cx = Math.round(this.target.x / CELL / 8) * 8, cz = Math.round(this.target.z / CELL / 8) * 8;
    const key = `${cx},${cz},${this.level}`;
    if (key === this.gridKey) return;
    this.gridKey = key;
    if (this.grid) { this.grid.geometry.dispose(); this.grid.removeFromParent(); }
    const n = 36;
    const pts = [], cols = [];
    const y = this.levelY() + 0.05;
    const c1 = new THREE.Color('#2a1c4a'), c2 = new THREE.Color('#5ff2ff');
    for (let i = -n; i <= n; i++) {
      const major = (cx + i) % 5 === 0;
      const c = major ? c2 : c1;
      pts.push((cx + i) * CELL, y, (cz - n) * CELL, (cx + i) * CELL, y, (cz + n) * CELL);
      cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    for (let j = -n; j <= n; j++) {
      const major = (cz + j) % 5 === 0;
      const c = major ? c2 : c1;
      pts.push((cx - n) * CELL, y, (cz + j) * CELL, (cx + n) * CELL, y, (cz + j) * CELL);
      cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: this.level ? 0.6 : 0.45, depthWrite: false }));
    this.app.scene.add(this.grid);
  }

  _updatePreview() {
    const cand = this._candidate();
    this.highlight.visible = false;
    if (!this.hover) {
      this.preview.visible = false;
      this.marker.visible = false;
      this.footprint.visible = false;
      return;
    }
    // Repère vertical + empreinte au sol
    const y = this.levelY();
    this.marker.visible = y > 1;
    this.marker.scale.set(1, y, 1);
    this.marker.position.set((this.hover.cx + 0.5) * CELL, y / 2, (this.hover.cz + 0.5) * CELL);
    this.footprint.visible = true;
    this.footprint.position.set((this.hover.cx + 0.5) * CELL, 0.06, (this.hover.cz + 0.5) * CELL);
    this.footprint.scale.set(CELL, 1, CELL);

    if (this.tool === 'erase') {
      this.preview.visible = false;
      const t = this._hoverTile();
      if (t) {
        const s = PIECES[t.t].size;
        const [lo, hi] = Track.range(t);
        const y0 = lo * LEVEL_H - 0.6, y1 = (hi + 1) * LEVEL_H;
        this.highlight.visible = true;
        this.highlight.position.set((t.x + s / 2) * CELL, (y0 + y1) / 2, (t.z + s / 2) * CELL);
        this.highlight.scale.set(s * CELL + 0.4, y1 - y0, s * CELL + 0.4);
      }
      return;
    }
    const key = `${cand.t},${cand.x},${cand.z},${cand.l},${cand.r},${this.track.version}`;
    if (key === this.previewKey) return;
    this.previewKey = key;
    for (const c of [...this.preview.children]) { c.traverse((o) => o.geometry && o.geometry.dispose()); this.preview.remove(c); }
    const conflicts = this.track.conflicts(cand);
    const same = conflicts.length === 1 && ['t', 'x', 'z', 'l', 'r'].every((k) => conflicts[0][k] === cand[k]);
    this.previewMat.emissive.set(conflicts.length && !same ? '#ff2244' : '#000000');
    this.previewMat.emissiveIntensity = 0.45;
    this.preview.add(buildTileMesh(cand, this.previewMat, this.previewGlow));
    this.preview.visible = !same;
  }

  update(dt) {
    const input = this.app.input;
    // Raccourcis
    if (input.hit('Escape')) { this.app.leaveEditor(); return; }
    if (input.hit('KeyR')) this.rotate(input.down('ShiftLeft', 'ShiftRight') ? -1 : 1);
    if (input.hit('KeyE') || input.hit('PageUp')) this.setLevel(this.level + 1);
    if (input.hit('KeyC') || input.hit('PageDown')) this.setLevel(this.level - 1);
    if (input.hit('KeyT')) { this.test(); return; }
    if (input.hit('Delete')) this.setTool('erase');
    for (const p of PALETTE_ORDER) if (input.hit(p.key)) this.setTool(p.id);

    // Déplacement clavier
    if (!input.down('ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight')) {
      const sp = this.dist * 1.1 * dt;
      let mx = 0, mz = 0;
      if (input.down('KeyW', 'ArrowUp')) mz += 1;
      if (input.down('KeyS', 'ArrowDown')) mz -= 1;
      if (input.down('KeyA', 'ArrowLeft')) mx -= 1;
      if (input.down('KeyD', 'ArrowRight')) mx += 1;
      if (mx || mz) {
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
        this.target.x += (fx * mz + rx * mx) * sp;
        this.target.z += (fz * mz + rz * mx) * sp;
      }
    }

    if (this.needsRebuild) {
      this.view.rebuild();
      this.needsRebuild = false;
    }

    // Caméra orbitale
    const ty = this.levelY();
    this.target.y += (ty - this.target.y) * Math.min(1, dt * 8);
    const cam = this.app.camera;
    const cp = Math.cos(this.pitch);
    cam.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    cam.lookAt(this.target);

    this._updateGrid();
    if (!this.pointers.size || this.painting) this._updateHover();
    this._updatePreview();
    this.app.scenery.update(this.target, cam, Math.min(260, this.dist * 1.4));
  }

  dispose() {
    const el = this.app.renderer.domElement;
    el.removeEventListener('pointerdown', this._h.down);
    window.removeEventListener('pointermove', this._h.move);
    window.removeEventListener('pointerup', this._h.up);
    window.removeEventListener('pointercancel', this._h.up);
    el.removeEventListener('wheel', this._h.wheel);
    el.removeEventListener('contextmenu', this._h.ctx);
    window.removeEventListener('keydown', this._h.key);
    clearTimeout(this._draftT);
    setEditorDraft(this.exportState());
    this.view.dispose();
    for (const o of [this.preview, this.highlight, this.marker, this.footprint, this.grid]) {
      if (!o) continue;
      o.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
      o.removeFromParent();
    }
    this.previewMat.dispose();
    this.previewGlow.dispose();
  }
}
