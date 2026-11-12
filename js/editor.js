// Éditeur de circuits : pièces sur grille, niveaux, rotation, revêtements réglables,
// options (envers, sans bordures, tunnel), décorations libres, vérification, historique.
import * as THREE from './vendor/three.module.min.js';
import { CELL, LEVEL_H, ROAD_TOP } from './constants.js';
import { PIECES, SURFACES } from './pieces.js';
import { Track, lossText, lossBlocking } from './track.js';
import { DEFAULT_DECOR } from './themes.js';
import { TrackView } from './trackMesh.js';
import { DECO_LABELS } from './decoData.js';
import { setEditorDraft } from './storage.js';
import { Inspector } from './inspector.js';
import { ERASE_FILTERS } from './editorPick.js';
import { MODS, NO_OPTS, TOOLS, fillBase, isFill, toFill } from './editor/shared.js';
import { paletteMethods } from './editor/palette.js';
import { pointerMethods } from './editor/pointer.js';
import { toolMethods } from './editor/tools.js';
import { groupMethods } from './editor/groups.js';
import { logicUiMethods } from './editor/logicUi.js';
import { selectionMethods } from './editor/selection.js';
import { historyMethods } from './editor/history.js';
import { prefabMethods } from './editor/prefabs.js';
import { cdecoMethods } from './editor/cdeco.js';
import { scriptsUiMethods } from './editor/scriptsUi.js';

function validTool(t) {
  if (!t) return false;
  if (isFill(t)) return toFill(fillBase(t)) === t && validTool(fillBase(t));
  return !!PIECES[t] || t === 'erase' || t === 'select' || t === 'inspect' || (t.startsWith('surf:') && !!SURFACES[t.slice(5)]) || (t.startsWith('mod:') && MODS.some((m) => m.id === t)) || (t.startsWith('deco:') && !!DECO_LABELS[t.slice(5)]);
}

export class EditorSession {
  constructor(app, state = {}) {
    this.kind = 'editor';      // (l'application reconnaît ses sessions sans importer leur module : l'éditeur est chargé à la demande)
    this.app = app;
    this.state = state;
    this.loadIssue = '';
    if (state.code) {
      try {
        this.track = Track.decode(state.code);
        if (lossBlocking(this.track)) this.loadIssue = lossText(this.track);
      } catch { this.track = new Track('Mon circuit'); this.loadIssue = 'Le code de ce circuit est illisible : l\'éditeur s\'ouvre vide.'; }
    } else {
      this.track = new Track(state.name || 'Mon circuit');
      this.track.decor = state.decor || DEFAULT_DECOR;
      this.track.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 });
    }
    if (state.name) this.track.name = state.name;
    this.entryId = state.entryId || null;
    // Phase 4 : un circuit dont la lecture a perdu des pièces (version plus récente du jeu) ou n'a pas pu être lue ne doit JAMAIS réécrire l'original : l'éditeur se détache de l'entrée
    // (un nouvel enregistrement crée une copie) et le dit. Avant, un code abîmé ouvrait un circuit vide et le premier enregistrement écrasait le circuit d'origine.
    if (this.loadIssue) {
      this.entryId = null;
      setTimeout(() => { try { this.app.ui.flash(this.loadIssue + ' Le circuit d\'origine reste intact dans « Mes circuits » ; ce que tu enregistres ici en fait une copie.', 8); } catch { /* interface fermée */ } }, 700);
    }
    this.tool = validTool(state.tool) ? state.tool : 'straight';
    this.fillMode = isFill(this.tool);
    this.eraseFilter = ERASE_FILTERS[state.eraseFilter] ? state.eraseFilter : 'all';   // gomme : tout / décorations / pistes
    this.camLocked = false;      // vrai pendant qu'un gizmo est saisi : la caméra de l'éditeur ne bouge pas
    this.rot = state.rot || 0;
    this.level = state.level || 0;
    this.tab = 'pieces';
    this.showGrid = true;
    this.autoLevel = null;
    this.surfParam = {};
    this.opts = { ...NO_OPTS };   // options « armées » : elles se posent avec la pièce choisie
    this.famTraits = {};      // dernière combinaison de caractéristiques choisie par famille
    this.sel = null;          // rectangle de sélection {x0, z0, x1, z1}
    this.selDrag = null;
    this.clip = null;         // presse-papiers
    this.pasting = false;
    this.focusLevel = false;  // vue par niveau
    this.deco = { cat: 'signs', color: 0, scale: 1, rot: 0, url: '', snap: 0, ph: 0, dy: 0 };

    this.view = new TrackView(this.track, app.materials, { showAllDecos: true });      // l'éditeur montre toujours toutes les décorations, même en qualité Potato
    app.scenery.trackGroup.add(this.view.group);
    this._applyDecor();

    // Aperçus
    this.previewMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.62, depthWrite: false, emissive: '#000000', side: THREE.DoubleSide });
    this.previewGlow = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
    this.preview = new THREE.Group();
    app.scene.add(this.preview);
    this.previewKey = '';
    this.highlight = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: '#ff3b5c', transparent: true, opacity: 0.28, depthWrite: false }),
    );
    this.highlight.visible = false;
    app.scene.add(this.highlight);
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
    this.selBox = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: '#5ff2ff', transparent: true, opacity: 0.14, depthWrite: false }),
    );
    this.selBox.visible = false;
    app.scene.add(this.selBox);
    this.marks = new THREE.Group();
    app.scene.add(this.marks);
    this.grid = null;
    this.gridKey = '';

    const cam = state.cam || this._fitCamera();
    this.target = new THREE.Vector3(cam.tx, this.levelY(), cam.tz);
    this.dist = cam.dist; this.yaw = cam.yaw; this.pitch = cam.pitch;

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2(9, 9);
    this.hover = null;
    this.pointers = new Map();

    this.history = [this._snapshot()];
    this.hIndex = 0;
    this.histSel = [null];       // sélection de l'Inspection rangée avec chaque pas d'historique
    this.histRect = [null];      // et rectangle de sélection de zone (Q) : annuler / rétablir le restaure (avant : il restait tel quel)

    // Le gizmo (TransformControls) s'abonne aux clics AVANT l'éditeur : il décide le premier s'il est saisi.
    this.inspector = new Inspector(this);
    this._bind();
    this._buildEraseBar();
    this._buildPalette();
    this._refreshUI();
    app.camera.fov = 55;
    app.camera.up.set(0, 1, 0);
    app.camera.updateProjectionMatrix();
  }

  _fitCamera() {
    const b = this.track.bounds();
    return {
      tx: (b.minX + b.maxX) / 2, tz: (b.minZ + b.maxZ) / 2,
      dist: Math.max(130, Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 1.1), yaw: Math.PI * 0.25, pitch: 0.95,
    };
  }

  _applyDecor() {
    this.app.scenery.setTrack(this.track, 'editeur-' + this.track.decor, { decor: false, minHalf: CELL * 40 });
  }

  levelY(l = this.level) {
    return l * LEVEL_H + ROAD_TOP;
  }

  _joinWarnings() { return this._tileIssues().filter((i) => i.level !== 'info').map((i) => i.msg); }

  // ---- Menu hamburger (Nouveau, Importer, Partager, Enregistrer, Retour) ---------------------------------------------
  get menuOpen() { const m = document.getElementById('ed-menu'); return !!m && !m.classList.contains('hidden'); }

  // Vérifier : course complète depuis le départ ; à l'arrivée, publier ou revenir.
  verify() { this.test(true); }

  update(dt) {
    const input = this.app.input;
    if (this.app.ui.modalOpen) return this._render(dt);
    if (input.hit('Escape') && this.menuOpen) { this.toggleMenu(false); return this._render(dt); }
    if ((input.hit('Escape') || input.padEdges.delete('pause')) && this.inspector.active) { this.inspector.clear(); return this._render(dt); }
    if ((input.hit('Escape') || input.padEdges.delete('pause')) && (this.pasting || this.sel)) { this.clearSel(); return this._render(dt); }
    if (input.hit('Escape') || input.padEdges.delete('pause')) { this.app.leaveEditor(); return; }
    const shift = input.down('ShiftLeft', 'ShiftRight');
    const ctrl = input.down('ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight');
    const selMode = this.tool === 'select' && this.sel && !this.pasting;
    // Ctrl / Cmd enfoncé : la touche sert au raccourci (copier, coller, annuler...),
    // pas à son action seule (C = niveau −, V = vrille, X = gomme...).
    if (ctrl) { this._render(dt); return; }
    if (input.act('ed.rotate')) { if (this.pasting) this.rotateClipboard(); else if (selMode) this.rotateSel(); else this.rotate(shift ? -1 : 1); }
    if (input.act('ed.levelUp')) { if (selMode) this.shiftSel(1); else this.setLevel(this.level + 1); }
    if (input.act('ed.levelDown')) { if (selMode) this.shiftSel(-1); else this.setLevel(this.level - 1); }
    if (input.act('ed.levelView') && !ctrl) this.toggleLevelView();
    if (input.act('ed.verify')) { this.verify(); return; }
    if (input.act('ed.params')) { this.openParams(); return; }
    if (input.act('ed.groups')) { this.openGroups(); return; }
    if (input.act('ed.logic')) { this.openLogic(); return; }
    if (input.act('ed.nextPiece')) this.cyclePiece(shift ? -1 : 1);
    if (input.act('ed.extend')) this.extend();
    if (input.act('ed.surface')) this.cycleSurface();
    if (input.act('ed.fill')) this.toggleFill();
    if (input.act('ed.mirror')) this.mirror();
    if (input.act('ed.snap')) this.cycleSnap();
    if (input.act('ed.scaleUp')) this.scaleDeco(1.1);
    if (input.act('ed.scaleDown')) this.scaleDeco(0.9);
    if (input.act('ed.erase')) { if (selMode) this.deleteSel(); else if (this.inspector.active) this.inspector.deleteSelected(); else if (this.tool === 'erase') this.cycleEraseFilter(); else this.setTool('erase'); }
    if (input.act('ed.inspect')) this.setTool(this.tool === 'inspect' ? 'straight' : 'inspect');
    if (input.act('ed.recenter')) this.recenter();
    if (input.act('ed.topView')) this.toggleTopView();
    if (input.act('ed.freeCam')) this.toggleFreeCam();
    if (input.act('ed.grid')) { this.showGrid = !this.showGrid; this.app.ui.flash(this.showGrid ? 'Grille' : 'Sans grille', 1.2); }
    if (input.act('ed.help')) { this.app.editorHelp(); return; }
    if (input.act('ed.test')) { if (shift) this.testHere(); else this.test(); return; }
    for (const t of TOOLS) if (t.key && t.id !== 'fill' && input.hit(t.key)) this.setTool(t.id);

    // Déplacement avec les touches de conduite
    if (!input.down('ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight')) {
      const sp = this.dist * 1.1 * dt;
      let mx = 0, mz = 0;
      if (input.held('accelerate')) mz += 1;
      if (input.held('brake')) mz -= 1;
      if (input.held('left')) mx -= 1;
      if (input.held('right')) mx += 1;
      const pad = input.padEditor();
      if (pad) { mx += pad.moveX; mz -= pad.moveZ; this.yaw -= pad.orbit * dt * 2; this.dist = Math.max(this.minDist(), Math.min(700, this.dist * (1 + pad.zoom * dt * 1.5))); }
      if (mx || mz) {
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
        this.target.x += (fx * mz + rx * mx) * sp;
        this.target.z += (fz * mz + rz * mx) * sp;
      }
      if (pad) this._padCursor(pad, dt);
    }
    this._render(dt);
  }

  _render(dt) {
    if (this.needsRebuild) {
      this.view.focus = this.focusLevel ? this.level : null;
      this.view.rebuild();
      this.needsRebuild = false;
    }
    this._updateSelBox();
    this.inspector.update();
    this.view.updateMoving(performance.now() / 1000);   // obstacles et pièces mobiles animés
    this.view.updateLights(this.app.camera.position, performance.now() / 1000);
    if (this.marksT > 0) {
      this.marksT -= dt;
      this.marks.visible = this.marksT > 0 && Math.floor(this.marksT * 3) % 2 === 0;
      if (this.marksT <= 0) for (const c of [...this.marks.children]) { c.geometry.dispose(); c.material.dispose(); this.marks.remove(c); }
    }
    const ty = this.levelY();
    this.target.y += (ty - this.target.y) * Math.min(1, dt * 8);
    const cam = this.app.camera;
    const cp = Math.cos(this.pitch);
    cam.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    if (this.freeCam && cam.position.y < 0.8) cam.position.y = 0.8;      // caméra libre : jamais sous le terrain
    cam.lookAt(this.target);
    this._updateGrid();
    if (!this.pointers.size || this.painting) this._updateHover();
    this._updatePreview();
    this._editorHorizon(cam);
    this.app.scenery.update(this.target, cam, Math.min(300, this.dist * 1.4));
  }

  // Les profils légers (Potato, Ultra Potato) rapprochent l'horizon et le brouillard pour la course (Ultra Potato : 450 m de portée, brouillard
  // à 180 m) : dans l'éditeur on dézoome jusqu'à 700 m, le circuit disparaîtrait. On ne fait qu'éloigner : jamais plus près que le profil.
  _editorHorizon(cam) {
    const need = this.dist * 2.2 + 300, fog = this.app.scene && this.app.scene.fog;
    if (cam.far < need) { cam.far = need; cam.updateProjectionMatrix(); }
    if (fog) { fog.near = Math.max(fog.near, this.dist * 0.7); fog.far = Math.max(fog.far, need); }
  }

  dispose() {
    for (const c of [...this.marks.children]) { c.geometry.dispose(); c.material.dispose(); }
    this.marks.removeFromParent();
    if (this.fillCells) { this.fillCells.geometry.dispose(); this.fillCells.material.dispose(); this.fillCells.dispose(); this.fillCells.removeFromParent(); this.fillCells = null; }
    this.selBox.geometry.dispose(); this.selBox.material.dispose(); this.selBox.removeFromParent();
    const el = this.app.renderer.domElement;
    el.removeEventListener('pointerdown', this._h.down);
    window.removeEventListener('pointermove', this._h.move);
    window.removeEventListener('pointerup', this._h.up);
    window.removeEventListener('pointercancel', this._h.up);
    el.removeEventListener('wheel', this._h.wheel);
    el.removeEventListener('contextmenu', this._h.ctx);
    window.removeEventListener('keydown', this._h.key);
    window.removeEventListener('keyup', this._h.keyup);
    window.removeEventListener('blur', this._h.blur);
    document.removeEventListener('pointerdown', this._h.outside, true);
    document.removeEventListener('keydown', this._h.menuKey);
    this.toggleMenu(false);
    clearTimeout(this._draftT);
    setEditorDraft(this.exportState());
    this.inspector.dispose();
    // Horizon et brouillard du profil de qualité reviennent avec la course.
    const q = this.app.quality && this.app.quality.profile;
    if (q) { this.app.camera.far = q.far; this.app.camera.updateProjectionMatrix(); }
    if (this.app.scenery.refreshFog) this.app.scenery.refreshFog();
    if (this.eraseBar) this.eraseBar.remove();
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

// Les familles de méthodes vivent dans editor/ ; elles s'ajoutent au prototype (`this` est l'instance).
Object.assign(EditorSession.prototype, paletteMethods, pointerMethods, toolMethods, selectionMethods, historyMethods, prefabMethods, cdecoMethods, scriptsUiMethods, groupMethods, logicUiMethods);
