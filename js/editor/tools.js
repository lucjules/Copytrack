// Outils d'édition : poser, peindre, remplir, gomme, pipette, options des pièces, décorations, niveau.
// Ces méthodes s'ajoutent au prototype de EditorSession (voir editor.js) : `this` est l'instance.
import { CELL, MAX_LEVEL, DIRS, MAX_DECOS } from '../constants.js';
import { PIECES, SURFACES, SURFACE_ORDER, surfaceAllowed, flagAllowed, armOption } from '../pieces.js';
import { retypePlacement } from '../tileInfo.js';
import { Track } from '../track.js';
import { safeUrl } from '../decos.js';
import { DECO_CATS, DECO_LABELS } from '../decoData.js';
import { enclosedRegion, tileRegion } from '../editorTools.js';
import { MIRROR_TYPES, LEGACY_CP } from '../inspector.js';
import { pickTileExact, ERASE_FILTERS, LAYER_ALL, LAYER_DECO } from '../editorPick.js';
import { MODS, OPT_KEYS, PALETTE_ORDER, SNAPS, fillBase, isFill, pieceLabel, toFill } from './shared.js';
const TOOL_IDS = new Set(['select', 'inspect', 'erase']);

const MIRROR = MIRROR_TYPES;

const OPT_NAMES = { v: 'plafond', o: 'mur', nb: 'sans bordures', tn: 'tunnel', mv: 'mouvement', cp: 'checkpoint', tb: 'anneau turbo', th: 'thème' };

// Pourquoi une pose sort des niveaux (sol ou plafond) : plafond, mur, pente descendante ou simple hauteur.
function outOfBounds(tile) {
  const P = PIECES[tile.t], [lo] = Track.range(tile);
  if (tile.v) return 'Hors des niveaux : à l’envers, la route pend sous son niveau (monte d’abord).';
  if (tile.o || (P.below && lo < 0)) return 'Hors des niveaux : une route sur un mur descend de 2 niveaux sous son niveau (monte d’abord).';
  if (lo < 0) return 'Hors des niveaux : la pente descend sous le sol (monte d’abord).';
  return 'Hors des niveaux.';
}

// ---- Pot de peinture : outils 'fill-surf:<revêtement>' et 'fill-piece:<type>' ----------------
const FILL_MAX_DL = 2;

                                  // écart de niveau toléré entre voisines (un tremplin monte de 2)
const FILL_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const isStartFinish = (type) => { const sp = PIECES[type] && PIECES[type].special; return sp === 'start' || sp === 'finish'; };

export const toolMethods = {
  setTool(id) {
    if (!this.guidedAllows(id)) { this.app.ui.flash('Disponible en mode complet : « Tout afficher » dans la palette.', 2.5); return; }
    // Mode pot de peinture : choisir une pièce ou un revêtement garde le pot ; tout autre outil le quitte.
    if (isFill(id)) this.fillMode = true;
    else if (this.fillMode && toFill(id)) id = toFill(id);
    else this.fillMode = false;
    if (id !== 'select') { this.pasting = false; this.sel = null; this.selDrag = null; }
    if (id !== 'inspect') this.inspector.clear();
    if (PIECES[fillBase(id)] || fillBase(id).startsWith('surf:')) this._lastBrush = fillBase(id);     // dernière pièce / dernier revêtement : sert au pot de peinture
    this.tool = id;
    this.previewKey = '';
    if (fillBase(id).startsWith('surf:')) this.setTab('surf');
    else if (id.startsWith('mod:')) this.setTab('mods');
    else if (id.startsWith('deco:')) {
      this.setTab('decos');
      const kind = id.slice(5);
      const cat = Object.entries(DECO_CATS).find(([, c]) => c.kinds.includes(kind));
      if (cat && cat[0] !== this.deco.cat) { this.deco.cat = cat[0]; this._buildDecoRow(); }
    } else if (!TOOL_IDS.has(id)) this.setTab('pieces');     // un outil (sélection, inspecteur, gomme) garde l'onglet affiché
    this._refreshUI();
  },

  // Active / désactive le pot de peinture sur la pièce ou le revêtement choisi.
  toggleFill() {
    if (isFill(this.tool)) {
      this.fillMode = false;
      this.setTool(fillBase(this.tool));
      this.app.ui.flash('Pot de peinture désactivé', 1.2);
      return;
    }
    const f = toFill(this.tool) || toFill(this._lastBrush || 'straight');     // depuis un autre outil : on remplit avec la dernière pièce choisie
    if (!f) { this.app.ui.flash('Choisis d’abord une pièce ou un revêtement.'); this.app.audio.error(); return; }
    this.setTool(f);
    this.app.ui.flash('Pot de peinture : clique une pièce pour remplir sa zone', 1.8);
  },

  cyclePiece(d) {
    const ids = PALETTE_ORDER.map((p) => p.id);
    const i = ids.indexOf(fillBase(this.tool));
    this.setTool(ids[(i + d + ids.length) % ids.length] || 'straight');
  },

  cycleSurface() {
    const ids = SURFACE_ORDER.map((s) => 'surf:' + s);
    const i = ids.indexOf(fillBase(this.tool));
    this.setTool(ids[(i + 1) % ids.length]);
  },

  cycleSnap() {
    const i = SNAPS.findIndex((s) => s.id === this.deco.snap);
    this.deco.snap = SNAPS[(i + 1) % SNAPS.length].id;
    this._refreshDeco();
    this.app.ui.flash(`Accrochage : ${SNAPS.find((s) => s.id === this.deco.snap).label}`, 1.2);
  },

  mirror() {
    const base = fillBase(this.tool);
    if (MIRROR[base]) { this.setTool(MIRROR[base]); return; }
    // 0.9.3 : une ligne droite ou un virage armé « Mur gauche » devient « Mur droit », et inversement.
    if (PIECES[base] && this.opts && (this.opts.o === 1 || this.opts.o === 2)) {
      this.opts = armOption({ ...this.opts, o: 0 }, 'o', this.opts.o === 1 ? 2 : 1);
      this.previewKey = '';
      this._refreshUI();
    }
  },

  // Options armées que la pièce `norm` (déjà normalisée) n'a pas pu garder (ex. tunnel sur un looping).
  _droppedOptions(cand, norm) {
    return OPT_KEYS.filter((k) => cand[k] && norm[k] !== cand[k]);
  },

  _act(painting = false) {
    const t = this.tool;
    if (t === 'erase') { this._erase(painting); return; }
    if (isFill(t)) { if (!painting) this._floodFill(); return; }   // un clic = un remplissage (pas de glisser)
    if (t.startsWith('surf:')) { this._paintSurface(painting); return; }
    if (t.startsWith('mod:')) { this._toggleMod(painting); return; }
    if (t.startsWith('deco:')) { this._placeDeco(); return; }
    const tile = this._candidate();
    if (!tile) return;
    const key = `${tile.x},${tile.z},${tile.l}`;
    if (painting && key === this._lastPaint) return;
    this._lastPaint = key;
    const norm = Track.normalize(tile);
    if (!Track.inBounds(norm)) { if (!painting) { this.app.ui.flash(outOfBounds(norm)); this.app.audio.error(); } return; }
    const conflicts = this.track.conflicts(tile);
    if (conflicts.length === 1) {
      const c = conflicts[0];
      if (c.t === tile.t && c.x === tile.x && c.z === tile.z && c.l === tile.l && c.r === tile.r && OPT_KEYS.every((k) => (c[k] | 0) === (norm[k] | 0))) return;
    }
    for (const c of conflicts) this.track.remove(c);
    if (tile.t === 'start') for (const s of this.track.tiles.filter((x) => x.t === 'start')) this.track.remove(s);
    const dropped = this._droppedOptions(tile, norm);
    if (dropped.length && !painting) this.app.ui.flash(`Option ignorée : ${dropped.map((k) => OPT_NAMES[k]).join(', ')}`, 2.4);
    const added = this.track.add(tile);
    this.app.audio.place();
    this._prepareAutoLevel(added);
    this._changed();
    if (!painting) this._commit();
  },

  // Après une pente, le niveau suit tout seul quand on vise la case suivante.
  _prepareAutoLevel(tile) {
    const p = PIECES[tile.t];
    if (!p.rise) { this.autoLevel = null; return; }
    if (p.kind === 'arc') {
      // Courbe montante (1 case) : l'entrée est derrière la pièce, la sortie sur son côté (droite, ou gauche pour la version ↰).
      if (p.size !== 1) { this.autoLevel = null; return; }
      const [bx, bz] = DIRS[tile.r], [ex, ez] = DIRS[(tile.r + (p.mirror < 0 ? 3 : 1)) & 3];
      this.autoLevel = new Map([[`${tile.x + ex},${tile.z + ez}`, tile.l + p.rise], [`${tile.x - bx},${tile.z - bz}`, tile.l]]);
      return;
    }
    const [dx, dz] = DIRS[tile.r];
    this.autoLevel = new Map([
      [`${tile.x + dx},${tile.z + dz}`, tile.l + p.rise],
      [`${tile.x - dx},${tile.z - dz}`, tile.l],
    ]);
  },

  _paintSurface(painting) {
    const t = this._targetTile();
    if (!t) return;
    const s = this.tool.slice(5);
    if (!surfaceAllowed(t.t, s, t.o | 0)) {
      if (!painting) { this.app.ui.flash(`${SURFACES[s].label} : impossible ici`); this.app.audio.error(); }
      return;
    }
    if (this.track.setSurface(t, s, SURFACES[s].def != null ? this._surfParamValue(s) : 0)) {
      this.app.audio.place();
      this._changed();
      if (!painting) this._commit();
    }
  },

  // Raison pour laquelle la pièce visée ne peut pas servir de cible au pot de peinture ('' si elle convient).
  _fillRefusal(target) {
    if (isStartFinish(target.t)) return 'Le départ et l’arrivée ne peuvent pas être remplis.';
    const base = fillBase(this.tool);
    if (!base.startsWith('surf:') && isStartFinish(base)) return 'Le départ et l’arrivée ne se posent pas au pot de peinture.';
    return '';
  },

  // Pot de peinture : remplace, dans toute la zone connectée à la pièce visée, le revêtement
  // ('fill-surf:') ou le type de pièce ('fill-piece:'). Zone = pièces voisines (côtés partagés,
  // écart de niveau <= FILL_MAX_DL) qui satisfont le même prédicat que la cible.
  _floodFill() {
    // Case VIDE sous le curseur (aucune pièce au niveau de pose) : on remplit la zone vide fermée par des pièces (voir enclosedRegion).
    if (this._emptyFillTarget()) { this._fillEmpty(); return; }
    const start = this._targetTile();
    if (!start) return;
    const why = this._fillRefusal(start);
    if (why) { this.app.ui.flash(why); this.app.audio.error(); return; }

    const surfMode = this.tool.startsWith('fill-surf:');
    const value = fillBase(this.tool).slice(surfMode ? 5 : 0);       // revêtement ou type voulu
    const matches = surfMode ? (t) => (t.s || '') === (start.s || '') : (t) => t.t === start.t;
    if (surfMode ? (start.s || '') === value : start.t === value) return;   // rien à remplacer

    // 1. Parcours en largeur ITÉRATIF (file + index de lecture, aucune récursion) : on ne fait que collecter.
    const visited = new Set([start]);
    const queue = [start];
    let head = 0;
    while (head < queue.length) {
      const t = queue[head++];
      for (const [cx, cz] of Track.cellsOf(t)) {                      // une pièce 2×2 occupe plusieurs cases
        for (const [dx, dz] of FILL_DIRS) {
          for (const n of this.track.tilesAt(cx + dx, cz + dz)) {
            if (visited.has(n) || !matches(n) || Math.abs(n.l - t.l) > FILL_MAX_DL) continue;
            visited.add(n);
            queue.push(n);
          }
        }
      }
    }

    // 2. Application, après le parcours : l'index du circuit ne change pas pendant la lecture.
    let done = 0, skipped = 0;
    const param = surfMode && SURFACES[value] && SURFACES[value].def != null ? this._surfParamValue(value) : 0;
    for (const t of queue) {
      if (isStartFinish(t.t)) { skipped++; continue; }                // départ / arrivée : jamais modifiés
      if (surfMode ? this.track.setSurface(t, value, param) : this._retypeTile(t, value)) done++;
      else skipped++;
    }

    if (done) {
      this.app.audio.place();
      this._changed();
      this._commit();                                                 // UN SEUL commit : un seul Ctrl+Z annule tout
    } else this.app.audio.error();
    this.app.ui.flash(`${done} pièce${done > 1 ? 's' : ''} modifiée${done > 1 ? 's' : ''}` + (skipped ? ` · ${skipped} ignorée${skipped > 1 ? 's' : ''}` : ''));
  },

  // Niveaux [lo, hi] occupés par la pièce que le pot de peinture poserait au niveau courant.
  _fillRange() {
    const base = fillBase(this.tool);
    if (!PIECES[base]) return [this.level, this.level];
    const o = this.opts || {};
    return Track.range({ t: base, x: 0, z: 0, l: this.level, r: 0, v: o.v ? 1 : 0, cp: o.cp | 0, tb: o.tb | 0, mv: o.mv | 0 });
  },

  // Vrai si le curseur vise une case VIDE (sans pièce aux niveaux de pose) et pas une pièce touchée par le rayon : on remplit alors la zone vide.
  _emptyFillTarget() {
    if (!this.hover) return false;
    if (this.ndc && this.raycaster && Math.abs(this.ndc.x) <= 1 && Math.abs(this.ndc.y) <= 1 && this.app.camera) {
      this.raycaster.setFromCamera(this.ndc, this.app.camera);
      const hit = pickTileExact(this.track, this.raycaster.ray, (o) => this._layerOk(o));
      if (hit && Track.cellsOf(hit.obj).some(([x, z]) => x === this.hover.cx && z === this.hover.cz)) return false;
    }
    const [lo, hi] = this._fillRange();
    return this.track.tilesAt(this.hover.cx, this.hover.cz).every((t) => { if (PIECES[t.t].kind === 'ring') return true; const [a, b] = Track.range(t); return !(a <= hi && lo <= b); });
  },

  // Remplit la zone vide fermée sous le curseur avec la pièce choisie (rotation, niveau et options du moment).
  _fillEmpty() {
    const base = fillBase(this.tool), ui = this.app.ui;
    const fail = (m) => { ui.flash(m); this.app.audio.error(); };
    if (!PIECES[base]) return fail('Choisis une pièce pour remplir une zone vide.');
    if (isStartFinish(base) || PIECES[base].kind === 'ring') return fail('Cette pièce ne se pose pas au pot de peinture.');
    const [lo, hi] = this._fillRange();
    const reg = enclosedRegion(this.track, this.hover.cx, this.hover.cz, lo, hi);
    if (!reg.ok) return fail(reg.why === 'open' ? 'Zone non fermée : entoure-la de pièces.' : reg.why === 'big' ? 'Zone trop grande (600 cases au plus).' : 'Rien à remplir ici.');
    const { spots, left } = tileRegion(reg.cells, PIECES[base].size);
    let done = 0, skipped = left;
    for (const [x, z] of spots) {
      const tile = { t: base, x, z, l: this.level, r: this.rot, s: '' };
      for (const k of OPT_KEYS) if (this.opts && this.opts[k]) tile[k] = this.opts[k];
      const norm = Track.normalize(tile);
      if (!Track.inBounds(norm) || this.track.conflicts(norm).length) { skipped++; continue; }
      this.track.add(tile);
      done++;
    }
    if (!done) return fail('Aucune pièce posée (pas la place).');
    this.app.audio.place();
    this._changed();
    this._commit();                                                   // un seul pas d'annulation
    ui.flash(`${done} pièce${done > 1 ? 's' : ''} posée${done > 1 ? 's' : ''}` + (skipped ? ` · ${skipped} case${skipped > 1 ? 's' : ''} vide${skipped > 1 ? 's' : ''}` : ''));
  },

  // Change le type d'une pièce sur place (même case, niveau et rotation) si l'empreinte est identique.
  _retypeTile(tile, type) {
    if (!PIECES[type] || PIECES[type].size !== PIECES[tile.t].size) return false;
    const cand = Track.normalize({ ...tile, t: type });               // retire les options devenues impossibles
    if (!Track.inBounds(cand)) return false;
    this.track.remove(tile);
    if (this.track.conflicts(cand).length) { this.track._insert(tile); return false; }
    Object.assign(tile, cand);                                        // même objet : la zone collectée reste valide
    this.track._insert(tile);
    return true;
  },

  // Change une caractéristique de famille : la pièce reste « en place » même si son empreinte change (looping 1 → 3 boucles).
  _retypeFamily(tile, type) {
    const cand = retypePlacement(this.track, tile, type);
    if (!cand) return false;
    this.track.remove(tile);
    Object.assign(tile, cand);                                        // même objet : la sélection de l'Inspecteur reste valide
    this.track._insert(tile);
    return true;
  },

  // Ancienne pièce « Checkpoint » → route normale + option checkpoint (même position, mêmes niveaux réservés).
  _legacyToOption(tile) {
    const conv = LEGACY_CP[tile.t];
    if (!conv) return false;
    const cand = Track.normalize({ ...tile, t: conv[0], cp: conv[1] });
    if (cand.cp !== conv[1] || !Track.inBounds(cand)) return false;
    this.track.remove(tile);
    if (this.track.conflicts(cand).length) { this.track._insert(tile); return false; }
    Object.assign(tile, cand);
    this.track._insert(tile);
    return true;
  },

  _toggleMod(painting) {
    const t = this._targetTile();
    if (!t) return;
    const key = `${t.x},${t.z},${t.l}`;
    if (painting && key === this._lastPaint) return;
    this._lastPaint = key;
    const mod = MODS.find((m) => m.id === this.tool), flag = mod.flag;
    const val = mod.val == null ? 1 : mod.val;
    // Orientation : le dernier choix l'emporte (plafond, tunnel, mouvement, checkpoint sont retirés) ; seul le type de pièce compte.
    if (!flagAllowed(t.t, flag, flag === 'o' ? null : t, val) && !(flag === 'o' && val === 0)) {
      this.app.ui.flash(`${pieceLabel(this.tool)} : impossible sur « ${PIECES[t.t].label} »${flag === 'cp' && (t.mv || t.tn) ? ' (retire d’abord ' + (t.mv ? 'le mouvement' : 'le tunnel') + ')' : flag === 'mv' && t.cp ? ' (retire d’abord le checkpoint)' : ''}`);
      this.app.audio.error();
      return;
    }
    if (this.track.toggleFlag(t, flag, val)) {
      this.app.audio.place();
      this._changed();
      if (!painting) this._commit();
    } else if (flag === 'tn') this.app.ui.flash('Tunnel impossible sur une route à l\'envers');
    else if (flag === 'v' || flag === 'o') { if (!painting) this.app.ui.flash(flag === 'o' ? 'Pas la place pour un mur : la route descend de 2 niveaux sous son niveau (monte d’abord, libère le dessous).' : 'Pas la place à l’envers : monte d’abord, ou libère le niveau en dessous.'); this.app.audio.error(); }
    else if (flag === 'cp') { this.app.ui.flash('Pas la place (niveaux au-dessus occupés)'); this.app.audio.error(); }
    else if (flag === 'mv') { this.app.ui.flash('Pas la place pour ce mouvement'); this.app.audio.error(); }
  },

  _snapPos(x, z) {
    const s = this.deco.snap;
    if (!s) return [x, z];
    const o = s === CELL || s === CELL / 2 ? s / 2 : 0;
    return [Math.round((x - o) / s) * s + o, Math.round((z - o) / s) * s + o];
  },

  _placeDeco() {
    const d = this._decoAt();
    if (!d) return;
    if (d.k === 'plaque' && !safeUrl(d.u)) {
      this.app.ui.flash('Colle d\'abord une URL d\'image https://… valide.');
      this.app.audio.error();
      return;
    }
    if (!this.track.addDeco(d)) { this.app.ui.flash(`Maximum de ${MAX_DECOS} décorations atteint.`); return; }
    this.app.audio.place();
    this._changed();
    this._commit();
  },

  // Calques que la gomme peut toucher : le filtre choisi avec l'outil Gomme ; avec un autre outil, clic droit = tout
  // (en pose de décorations : seulement les décorations, comme avant).
  _eraseMask() {
    if (this.tool === 'erase') return ERASE_FILTERS[this.eraseFilter].mask;
    return this.tool.startsWith('deco:') ? LAYER_DECO : LAYER_ALL;
  },

  _erase(painting = false) {
    const mask = this._eraseMask();
    let hit = this._pickTarget(mask);
    if (!hit) {
      // Repli : visée au sol (niveau courant), toujours limitée aux calques permis.
      const t = mask & 1 ? this._hoverTile() : null;
      const d = !t && mask & LAYER_DECO ? this._nearestDeco() : null;
      hit = t ? { kind: 'tile', obj: t } : d ? { kind: 'deco', obj: d } : null;
    }
    if (!hit) return;
    if (hit.kind === 'tile') this.track.remove(hit.obj); else this.track.removeDeco(hit.obj);
    this.app.audio.erase();
    this._changed();
    if (!painting) this._commit();
  },

  // Mode Inspection : un clic sélectionne la pièce ou la décoration visée.
  _inspectPick() {
    const hit = this._pickTarget(LAYER_ALL);
    if (hit) { this.inspector.select(hit.kind, hit.obj); this.app.audio.click(); } else this.inspector.clear();
    this._commit();      // range la sélection dans l'historique (sans créer de pas si rien n'a changé)
  },

  // Modifie une pièce (case, niveau, rotation) en vérifiant la place ; réindexe le circuit. Faux si impossible.
  _applyTilePatch(tile, patch) {
    const cand = Track.normalize({ ...tile, ...patch });
    if (!Track.inBounds(cand)) return false;
    if (cand.x === tile.x && cand.z === tile.z && cand.l === tile.l && cand.r === tile.r) return true;
    this.track.remove(tile);
    if (this.track.conflicts(cand).length) { this.track._insert(tile); return false; }
    Object.assign(tile, cand);
    this.track._insert(tile);
    return true;
  },

  _pick() {
    if (this.tool.startsWith('deco:')) {
      const d = this._nearestDeco();
      if (d) {
        this.deco.color = d.c; this.deco.scale = d.s; this.deco.rot = d.ry; this.deco.url = d.u || '';
        this.setTool('deco:' + d.k);
        this.app.ui.flash(`Pipette : ${DECO_LABELS[d.k]}`);
        return;
      }
    }
    const t = this._targetTile();
    if (!t) return;
    this.fillMode = false;
    this.tool = t.t; this.rot = t.r; this.level = t.l;
    for (const k of OPT_KEYS) this.opts[k] = t[k] | 0;                  // la pipette reprend aussi les options de la pièce
    this.autoLevel = null;
    this.previewKey = '';
    this.setTab('pieces');
    this._refreshUI();
    this.app.ui.flash(`Pipette : ${pieceLabel(t.t)}, niveau ${t.l}`);
  },

  rotate(d = 1) {
    if (this.tool === 'inspect') { this.inspector.rotateBy(d); return; }
    if (this.tool.startsWith('deco:')) {
      this.deco.rot = (this.deco.rot + d * Math.PI / 12 + Math.PI * 2) % (Math.PI * 2);
    } else this.rot = (this.rot + d + 4) & 3;
    this.previewKey = '';
    this._refreshUI();
  },

  scaleDeco(f) {
    this.deco.scale = Math.max(0.3, Math.min(6, this.deco.scale * f));
    this.previewKey = '';
    this._refreshDeco();
  },

  setLevel(l, manual = true) {
    const nl = Math.max(0, Math.min(MAX_LEVEL, l));
    if (manual) this.autoLevel = null;
    if (nl === this.level) return;
    this.level = nl;
    if (this.focusLevel) this.needsRebuild = true;
    this.previewKey = '';
    this._refreshUI();
  },
};
