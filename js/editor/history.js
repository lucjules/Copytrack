// État du circuit dans l'éditeur : instantanés, annuler / rétablir, enregistrement, nouveau circuit, essai.
// Ces méthodes s'ajoutent au prototype de EditorSession (voir editor.js) : `this` est l'instance.
import { CELL } from '../constants.js';
import { PIECES } from '../pieces.js';
import { Track, tileToRow, rowToTile } from '../track.js';
import { setEditorDraft, saveMyTrack, newId } from '../storage.js';
import { centerlineWorld } from '../ribbons.js';
export const historyMethods = {
  exportState() {
    return {
      code: this.track.encode(),
      entryId: this.entryId,
      name: this.track.name,
      tool: this.tool,
      eraseFilter: this.eraseFilter,
      rot: this.rot,
      level: this.level,
      cam: { tx: this.target.x, tz: this.target.z, dist: this.dist, yaw: this.yaw, pitch: this.pitch },
    };
  },

  // ---------------------------------------------------------------- Historique
  _snapshot() {
    return JSON.stringify({
      t: this.track.tiles.map(tileToRow),
      d: this.track.decos.map((o) => [o.k, o.x, o.y, o.z, o.ry, o.s, o.c, o.u, o.ph || 0, o.cc || '']),
      lp: this.track.laps || 1,
      pr: { name: this.track.name, desc: this.track.desc, decor: this.track.decor, ...this.track.rulesState() },
    });
  },

  _restore(snap) {
    const data = JSON.parse(snap);
    const { vt, vh } = this.track;
    this.track.clear();
    this.track.vt = vt; this.track.vh = vh;
    for (const row of data.t) this.track.add(rowToTile(row));
    for (const [k, x, y, z, ry, sc, c, u, ph, cc] of data.d) this.track.addDeco({ k, x, y, z, ry, s: sc, c, u, ph, cc });
    this.track.laps = data.lp || 1;
    if (data.pr) {
      this.track.setParams(data.pr);
      if (data.pr.name) this.track.name = data.pr.name;
      if (data.pr.decor && data.pr.decor !== this.track.decor) { this.track.decor = data.pr.decor; this._applyDecor(); this.gridKey = ''; }
    }
    this._changed(false);
    this.needsRebuild = true;
    this.inspector.restore(this.histSel[this.hIndex]);   // l'objet inspecté revient avec l'état annulé / rétabli
  },

  _commit() {
    const snap = this._snapshot();
    if (snap === this.history[this.hIndex]) { this.histSel[this.hIndex] = this.inspector.describe(); return; }
    this.history.length = this.hIndex + 1;
    this.histSel.length = this.hIndex + 1;
    this.history.push(snap);
    this.histSel.push(this.inspector.describe());
    if (this.history.length > 200) { this.history.shift(); this.histSel.shift(); }
    this.hIndex = this.history.length - 1;
  },

  undo() {
    if (this.hIndex <= 0) return;
    this.hIndex--;
    this._restore(this.history[this.hIndex]);
    this.app.audio.click();
  },

  redo() {
    if (this.hIndex >= this.history.length - 1) return;
    this.hIndex++;
    this._restore(this.history[this.hIndex]);
    this.app.audio.click();
  },

  _changed(rebuild = true) {
    if (rebuild) this.needsRebuild = true;
    this.previewKey = '';
    this.inspector.refresh();
    this._refreshUI();
    clearTimeout(this._draftT);
    this._draftT = setTimeout(() => setEditorDraft(this.exportState()), 400);
  },

  save() {
    const entry = saveMyTrack({ id: this.entryId || newId(), name: this.track.name, code: this.track.encode() });
    this.entryId = entry.id;
    setEditorDraft(this.exportState());
    this.app.ui.flash('Circuit enregistré dans « Mes circuits »');
  },

  newTrack() {
    this.track.clear();
    this.track.name = 'Mon circuit';
    this.track.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 });
    this.entryId = null;
    this.level = 0;
    this.target.set(CELL / 2, this.levelY(), CELL / 2);
    this._commit();
    this._changed();
  },

  loadCode(code) {
    const t = Track.decode(code);
    this.track.clear();
    for (const tile of t.tiles) this.track.add(tile);
    for (const d of t.decos) this.track.addDeco(d);
    this.track.name = t.name;
    this.track.decor = t.decor;
    this.track.laps = t.laps;
    this.track.setParams(t);
    this.track.vt = t.vt; this.track.vh = t.vh;
    this._applyDecor();
    this.entryId = null;
    this.recenter();
    this._commit();
    this._changed();
  },

  recenter() {
    const c = this._fitCamera();
    this.target.set(c.tx, this.levelY(), c.tz);
    this.dist = c.dist;
  },

  toggleTopView() {
    if (this.pitch < 1.4) { this._prevPitch = this.pitch; this.pitch = 1.5; }
    else this.pitch = this._prevPitch || 0.95;
  },

  testHere() {
    const t = this._targetTile();
    if (!t || ['ring', 'area'].includes(PIECES[t.t].kind)) { this.app.ui.flash('Vise une pièce de route.'); this.app.audio.error(); return; }
    // Une route sur un mur (ou une transition qui part d'un mur) ne peut pas servir de départ : la voiture y tomberait.
    if (t.o || (PIECES[t.t].roll && PIECES[t.t].roll[0] !== 0)) { this.app.ui.flash('Teste depuis une route au sol (ou une transition qui part du sol) : on ne démarre pas sur un mur.'); this.app.audio.error(); return; }
    let pts = centerlineWorld(t, 6);
    // Sens de départ : celui qui s'éloigne de la pièce de départ du circuit.
    const st = this.track.startTile;
    if (st && st !== t) {
      const sp = centerlineWorld(st, 2)[1];
      const d = (p) => Math.hypot(p[0] - sp[0], p[2] - sp[2]);
      if (d(pts[0]) > d(pts[pts.length - 1])) pts = pts.slice().reverse();
    }
    const a = pts[0], b = pts[1];
    const yaw = Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
    const gs = (t.v && PIECES[t.t].kind !== 'ribbon' && PIECES[t.t].kind !== 'loop') || this.track.flip0 ? -1 : 1;
    this.app.testTrack(this.exportState(), { x: a[0] + (b[0] - a[0]) * 0.5, y: a[1], z: a[2] + (b[2] - a[2]) * 0.5, yaw, gs });
  },

  // Phase 3 : un simple essai ne demande plus d'arrivée (on roule librement) ; la vérification, elle, en exige une.
  test(verify = false) {
    const errs = this.track.validate({ test: !verify });
    if (errs.length) {
      this.app.ui.flash(errs.join(' '));
      this.app.audio.error();
      return;
    }
    this.app.testTrack(this.exportState(), null, verify);
  },
};
