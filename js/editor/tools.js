// Outils d'édition : poser, peindre, remplir, gomme, pipette, options des pièces, décorations, niveau.
// Ces méthodes s'ajoutent au prototype de EditorSession (voir editor.js) : `this` est l'instance.
import { CELL, MAX_LEVEL, DIRS, MAX_DECOS } from '../constants.js';
import { PIECES, SURFACES, SURFACE_ORDER, surfaceAllowed, flagAllowed, armOption } from '../pieces.js';
import { retypePlacement } from '../tileInfo.js';
import { Track } from '../track.js';
import { minGroundLevel } from '../ribbons.js';
import { safeUrl } from '../decos.js';
import { DECO_CATS, DECO_LABELS } from '../decoData.js';
import { enclosedRegion, tileRegion, fillZone } from '../editorTools.js';
import { extendPlan, lastOpenTile } from '../extend.js';
import { pieceHint } from '../continuity.js';
import { MIRROR_TYPES, LEGACY_CP } from '../inspector.js';
import { pickTileExact, ERASE_FILTERS, LAYER_ALL, LAYER_DECO } from '../editorPick.js';
import { MODS, OPT_KEYS, PALETTE_ORDER, SNAPS, fillBase, isFill, pieceLabel, toFill } from './shared.js';
const TOOL_IDS = new Set(['select', 'inspect', 'erase']);

const MIRROR = MIRROR_TYPES;

const OPT_NAMES = { v: 'plafond', o: 'mur', nb: 'sans bordures', tn: 'tunnel', mv: 'mouvement', cp: 'checkpoint', tb: 'anneau turbo', th: 'thème', gs: 'style du portique', eb: 'bordures de plaque' };

// Pourquoi une pose sort des niveaux (sol ou plafond) : plafond, mur, pente descendante ou simple hauteur.
function outOfBounds(tile) {
  const P = PIECES[tile.t], [lo] = Track.range(tile);
  if (tile.v) return 'Hors des niveaux : à l’envers, la route pend sous son niveau (monte d’abord).';
  const g = tile.o ? 0 : minGroundLevel(tile.t);
  if (tile.l < g) return `Hors des niveaux : ${P.label} plonge sous son niveau et passerait sous le sol (niveau ${String(g).replace('.', ',')} au moins).`;
  if (tile.o || (P.below && lo < 0)) return 'Hors des niveaux : une route sur un mur descend de 2 niveaux sous son niveau (monte d’abord).';
  if (lo < 0) return 'Hors des niveaux : la pente descend sous le sol (monte d’abord).';
  return 'Hors des niveaux.';
}

// ---- Pot de peinture : outils 'fill-surf:<revêtement>' et 'fill-piece:<type>' ----------------
const FILL_MAX_DL = 2;

                                  // écart de niveau toléré entre voisines (un tremplin monte de 2)
const isStartFinish = (type) => { const sp = PIECES[type] && PIECES[type].special; return sp === 'start' || sp === 'finish'; };

export const toolMethods = {
  setTool(id) {
    if (!this.guidedAllows(id)) { this.app.ui.flash('Disponible en mode complet : « Tout afficher » dans la palette.', 2.5); return; }
    // Pot de peinture (0.12.0 : l'interrupteur « Remplir » de l'outil Pièces, et « Toute la zone » de la Peinture, chacun le sien) : choisir une autre pièce
    // (ou un autre revêtement) garde l'interrupteur de son outil.
    if (isFill(id)) { if (fillBase(id).startsWith('surf:')) this._fillPaint = true; else this._fillPieces = true; }
    else if (toFill(id) && (PIECES[id] ? this._fillPieces : this._fillPaint)) id = toFill(id);
    this.fillMode = isFill(id);
    if (id !== 'select') { this.pasting = false; this.sel = null; this.selDrag = null; }
    if (id !== 'inspect') this.inspector.clear();
    if (PIECES[fillBase(id)] || fillBase(id).startsWith('surf:')) this._lastBrush = fillBase(id);     // dernière pièce / dernier revêtement : sert au pot de peinture
    // (0.12.0 : et ce que reprend chaque outil du rail quand on y revient)
    { const b = fillBase(id); if (PIECES[b]) this._lastPiece = b; else if (b.startsWith('surf:')) this._lastSurf = b; else if (b.startsWith('deco:')) this._lastDeco = b.slice(5); }
    this.tool = id;
    this.previewKey = '';
    // Ce qu'il faut savoir avant de poser cette pièce (une seule fois par pièce et par orientation et par séance d'édition : pas de bavardage).
    if (PIECES[fillBase(id)]) {
      const hint = pieceHint(fillBase(id), this.opts || {});
      const hk = fillBase(id) + '|' + ((this.opts && (this.opts.o || (this.opts.v ? 'v' : ''))) || '');
      this._hinted = this._hinted || new Set();
      if (hint && !this._hinted.has(hk)) { this._hinted.add(hk); this.app.ui.flash(hint, 5); }
    }
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

  // Active / désactive le pot de peinture (touche `) : l'interrupteur « Remplir » de l'outil Pièces ou Peinture ; depuis un autre outil, celui des pièces.
  toggleFill() {
    const base = fillBase(this.tool);
    if (PIECES[base] || base.startsWith('surf:')) {
      const on = !isFill(this.tool);
      this.setFill(on);
      this.app.ui.flash(on ? 'Remplir : clique une pièce pour remplir sa zone' : 'Remplir désactivé', 1.4);
      return;
    }
    this._fillPieces = true;
    this.setMode('pieces');
    this.app.ui.flash('Remplir : clique une pièce pour remplir sa zone', 1.6);
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
    if (PIECES[base] && this.opts && this.opts.o >= 1 && this.opts.o <= 6) {
      this.opts = armOption({ ...this.opts, o: 0 }, 'o', [0, 2, 1, 4, 3, 6, 5][this.opts.o]);      // gauche ↔ droite pour chaque roulis (90°, 45°, 135°)
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
    if (!Track.placeable(norm)) { if (!painting) { this.app.ui.flash(outOfBounds(norm)); this.app.audio.error(); } return; }
    const conflicts = this.track.conflicts(tile);
    if (conflicts.length === 1) {
      const c = conflicts[0];
      if (c.t === tile.t && c.x === tile.x && c.z === tile.z && c.l === tile.l && c.r === tile.r && OPT_KEYS.every((k) => (c[k] | 0) === (norm[k] | 0))) return;
    }
    // Une pièce d'un calque verrouillé ou masqué (groups.js) n'est jamais remplacée : avant 0.12.0 la pose l'effaçait sans un mot, même invisible.
    const guarded = conflicts.find((c) => !this._layerOk(c));
    if (guarded) { if (!painting) { this.app.ui.flash(this._layerWhy(guarded)); this.app.audio.error(); } return; }
    for (const c of conflicts) this.track.remove(c);
    if (tile.t === 'start') for (const s of this.track.tiles.filter((x) => x.t === 'start')) this.track.remove(s);
    const dropped = this._droppedOptions(tile, norm);
    if (dropped.length && !painting) this.app.ui.flash(`Option ignorée : ${dropped.map((k) => OPT_NAMES[k]).join(', ')}`, 2.4);
    const added = this.track.add(tile);
    this._lastTile = added;
    this.app.audio.place();
    this._prepareAutoLevel(added);
    this._changed();
    if (!painting) this._commit();
  },

  // Prolonger (touche P, bouton ➜) : pose la pièce choisie à l'extrémité libre de la dernière pièce posée (ou de la pièce inspectée), au bon cap, à la bonne
  // hauteur et dans la bonne orientation (js/extend.js). Répéter pour dérouler une route sans viser chaque case.
  extend() {
    const base = fillBase(this.tool);
    const type = PIECES[base] ? base : (this._lastBrush && PIECES[fillBase(this._lastBrush)] ? fillBase(this._lastBrush) : 'straight');
    const sel = this.inspector && this.inspector.active && this.inspector.sel.kind === 'tile' ? this.inspector.sel.obj : null;
    const from = sel || (this._lastTile && this.track.tiles.includes(this._lastTile) ? this._lastTile : null) || lastOpenTile(this.track);
    const armed = {}; for (const k of OPT_KEYS) if (this.opts && this.opts[k]) armed[k] = this.opts[k];
    const r = extendPlan(this.track, from, type, armed);
    if (!r.tile) { this.app.ui.flash(r.why, 4); this.app.audio.error(); return false; }
    if (r.chain) for (const t of r.chain) this.track.add(t);      // raccordement automatique : les transitions manquantes, puis la pièce (un seul pas d'annulation)
    else this.track.add(r.tile);
    this._lastTile = this.track.tiles[this.track.tiles.length - 1];
    this.app.audio.place();
    this._prepareAutoLevel(this._lastTile);
    this._changed();
    this._commit();
    // La vue suit la route quand le nouveau bout sort de l'écran.
    const P = PIECES[r.tile.t], cx = (r.tile.x + P.size / 2) * CELL, cz = (r.tile.z + P.size / 2) * CELL;
    if (Math.hypot(cx - this.target.x, cz - this.target.z) > this.dist * 0.45) { this.target.x = cx; this.target.z = cz; }
    if (r.note) this.app.ui.flash(`Orientation choisie impossible à raccorder (${r.note}) : la route reprend son orientation.`, 4);
    else this.app.ui.flash(`${P.label} posée${r.reverse ? ' à contresens (retour de la pièce)' : r.widened ? ` après un ${PIECES[r.chain[0].t].label.toLowerCase()} (raccord de largeur automatique)` : r.bridged ? ` après ${r.chain.length - 1} transition${r.chain.length > 2 ? 's' : ''} d'orientation (raccord automatique)` : r.inferred ? ' (orientation de la route reprise)' : ''}`, 1.4);
    return true;
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
    // (0.12.0 : une pente large fait 3×3 : la case visée pour la pièce suivante est le CENTRE de l'empreinte voisine, comme pour la pose d'une pièce de taille impaire)
    const [dx, dz] = DIRS[tile.r], s = p.size, c = (s - 1) / 2;
    this.autoLevel = new Map([
      [`${tile.x + c + dx * s},${tile.z + c + dz * s}`, tile.l + p.rise],
      [`${tile.x + c - dx * s},${tile.z + c - dz * s}`, tile.l],
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
    const matches = this._fillMatcher(start);
    if (surfMode ? (start.s || '') === value : start.t === value) return;   // rien à remplacer

    // 1. Zone connectée (editorTools.fillZone : parcours itératif, borné, qui ne modifie rien).
    const zone = fillZone(this.track, start, matches, { maxDl: FILL_MAX_DL });
    if (zone.truncated) { this.app.ui.flash('Zone trop grande : rien n\'a été modifié.'); this.app.audio.error(); return; }
    const queue = zone.tiles;

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

  // Prédicat de la zone : mêmes pièces que la cible (même revêtement pour un remplissage de revêtement, même type pour un remplissage de type).
  // (0.12.0 : la zone s'arrête aux pièces d'un calque verrouillé ou masqué, comme les autres outils.)
  _fillMatcher(start) {
    const ok = (t) => this._layerOk(t);
    return this.tool.startsWith('fill-surf:') ? (t) => ok(t) && (t.s || '') === (start.s || '') : (t) => ok(t) && t.t === start.t;
  },

  // Aperçu AVANT validation : les cases de la zone que le clic modifierait (cache par pièce visée, outil et état du circuit : le parcours n'est pas
  // refait à chaque image). Renvoie { cells, count, truncated } ou null si la cible ne convient pas.
  _fillPreview(start) {
    if (this._fillRefusal(start)) return null;
    const surfMode = this.tool.startsWith('fill-surf:');
    const value = fillBase(this.tool).slice(surfMode ? 5 : 0);
    if (surfMode ? (start.s || '') === value : start.t === value) return null;
    const key = `${this.tool}|${this.track.version}|${this.track.tiles.indexOf(start)}`;
    if (this._fillPrevKey === key) return this._fillPrev;
    const zone = fillZone(this.track, start, this._fillMatcher(start), { maxDl: FILL_MAX_DL });
    const cells = [];
    for (const t of zone.tiles) if (!isStartFinish(t.t)) for (const c of Track.cellsOf(t).slice(0, PIECES[t.t].size ** 2)) cells.push([c[0], c[1], this.levelY(t.l) + 0.6]);
    this._fillPrevKey = key;
    this._fillPrev = { cells, count: zone.tiles.length, truncated: zone.truncated };
    return this._fillPrev;
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
      if (!Track.placeable(norm) || this.track.conflicts(norm).length) { skipped++; continue; }
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
    if (!Track.placeable(cand)) return false;
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
    if (cand.cp !== conv[1] || !Track.placeable(cand)) return false;
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
    if (!Track.placeable(cand)) return false;
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
    if (!this.guidedAllows(t.t)) { this.app.ui.flash('Disponible en mode complet : « Tout afficher » dans la palette.', 2.5); return; }
    // Comme un choix dans la palette (setTool) : le collage en cours, la zone sélectionnée et l'inspection sont quittés. Avant 0.12.0, la pipette changeait l'outil
    // directement : un collage restait « armé » et R tournait le presse-papiers au lieu de la pièce.
    this.fillMode = false;
    for (const k of OPT_KEYS) this.opts[k] = t[k] | 0;                  // la pipette reprend aussi les options de la pièce
    this.setTool(t.t);
    this.rot = t.r;
    this.setLevel(t.l);
    this.previewKey = '';
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
