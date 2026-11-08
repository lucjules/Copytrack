// Modifications du circuit : revêtements, options des pièces, mouvement, couleurs, décorations.
// Ces méthodes s'ajoutent au prototype de Track (voir track.js) : `this` est l'instance.
import { MAX_DECOS } from '../constants.js';
import { PIECES, SURFACES, surfaceAllowed, flagAllowed, clampMover, THEMES, clearConflicts } from '../pieces.js';
import { isObstacle } from '../obstacles.js';
import { DECO_ORDER } from '../decoData.js';
import { sanitizeDecoParts, MAX_CUSTOM_DECOS } from '../customDeco.js';
import { HEX, cleanColors } from './shared.js';
import { Track } from '../track.js';
export const editMethods = {
  // Revêtement (avec paramètre en %). Renvoie true si quelque chose a changé.
  setSurface(tile, s, p = 0) {
    if (!surfaceAllowed(tile.t, s, tile.o)) return false;
    const S2 = SURFACES[s];
    const np = S2 && S2.def != null ? Math.max(S2.min, Math.min(S2.max, p || S2.def)) : 0;
    if (tile.s === s && (tile.p || 0) === np) return false;
    tile.s = s; tile.p = np;
    this.version++;
    return true;
  },

  // Bascule un drapeau (v : à l'envers, nb : sans bordures, tn : tunnel, mv : mouvement 1/2/3, cp : checkpoint 1/2, th : thème).
  toggleFlag(tile, flag, val = 1) {
    // Orientation : val 1 = mur gauche, 2 = mur droit (même valeur : retour au sol) ; val 0 = retour au sol (aussi depuis le plafond).
    if (flag === 'o') {
      const target = val | 0;
      if (target && !flagAllowed(tile.t, 'o', null, target)) return false;      // seul le type compte : le plafond, le tunnel, etc. sont retirés (le dernier choix l'emporte)
      const cand = { ...tile };
      if (!target || tile.o === target) { cand.o = 0; if (!target) cand.v = 0; }
      else { cand.o = target; clearConflicts(cand, 'o'); }
      return this._reshape(tile, cand);
    }
    if (!flagAllowed(tile.t, flag, tile, val)) return false;
    if (flag === 'th') {
      const th = tile.th === val ? 0 : val;
      if (!THEMES.some((h) => h.id === th)) return false;
      tile.th = th;
      this.version++;
      return true;
    }
    // Ces options changent les cases ou les niveaux occupés (mouvement, checkpoint, anneau, orientation, plafond) : on vérifie la place
    // (et qu'une pièce à l'envers ne sort pas du sol), puis on réindexe.
    if (flag === 'mv' || flag === 'cp' || flag === 'tb' || flag === 'v') {
      const cand = { ...tile };
      if (flag === 'mv') { cand.mv = tile.mv === val ? 0 : val; cand.ms = 0; cand.ma = 0; }     // (flagAllowed a déjà refusé le cas d'un checkpoint ou d'un anneau)
      else if (flag === 'cp') { cand.cp = tile.cp === val ? 0 : val; }
      else if (flag === 'tb') { cand.tb = tile.tb ? 0 : 1; }
      else if (tile.v) cand.v = 0;
      else { cand.v = 1; clearConflicts(cand, 'v'); }
      return this._reshape(tile, cand);
    }
    tile[flag] = tile[flag] ? 0 : 1;
    this.version++;
    return true;
  },

  // Remplace `tile` par `cand` (normalisée : options devenues impossibles retirées, revêtement incompatible effacé) si la place et les niveaux
  // le permettent ; sinon rien ne change. Même objet : la sélection de l'inspecteur reste valable.
  _reshape(tile, cand) {
    const n = Track.normalize(cand);
    this.remove(tile);
    if (this.conflicts(n).length || !Track.inBounds(n)) { this._insert(tile); return false; }
    Object.assign(tile, n);
    this._insert(tile);
    return true;
  },

  // Réglage d'une pièce mobile (vitesse en %, amplitude). Change les cases / niveaux balayés : vérifie la place.
  setMover(tile, ms, ma) {
    if (!tile.mv) return false;
    const m = clampMover(tile.mv, ms === undefined ? tile.ms : ms, ma === undefined ? tile.ma : ma);
    if (m.ms === (tile.ms || 0) && m.ma === (tile.ma || 0)) return true;
    const cand = { ...tile, ms: m.ms, ma: m.ma };
    this.remove(tile);
    if (this.conflicts(cand).length || !Track.inBounds(cand)) { this._insert(tile); return false; }
    tile.ms = m.ms; tile.ma = m.ma;
    this._insert(tile);
    return true;
  },

  // Couleurs personnalisées { road, line, rail } (null / {} : couleurs d'origine).
  setColors(tile, col) {
    tile.col = cleanColors(col);
    this.version++;
    return true;
  },

  // 2e revêtement d'une bifurcation (voie déportée).
  setSurface2(tile, s, p = 0) {
    if (PIECES[tile.t].kind !== 'fork') return false;
    if (s && s !== '-' && !surfaceAllowed(tile.t, s, tile.o)) return false;
    const S2 = SURFACES[s];
    const np = S2 && S2.def != null ? Math.max(S2.min, Math.min(S2.max, p || S2.def)) : 0;
    if ((tile.s2 || '') === s && (tile.p2 || 0) === np) return false;
    tile.s2 = s; tile.p2 = np;
    this.version++;
    return true;
  },

  addDeco(d) {
    if (this.decos.length >= MAX_DECOS) return null;
    const deco = {
      k: d.k, x: +d.x, y: +d.y, z: +d.z, ry: +d.ry || 0, s: Math.max(0.2, Math.min(20, +d.s || 1)),
      c: d.c | 0, u: d.u ? String(d.u).slice(0, 400) : '',
    };
    const g = Math.max(0, Math.min(63, d.g | 0));
    if (g) deco.g = g;                     // groupe (calque de l'éditeur ; logique du circuit)
    // Obstacles : décalage de phase (0 à 1) pour désynchroniser plusieurs obstacles.
    if (isObstacle(deco.k)) { deco.ph = Math.max(0, Math.min(0.95, Math.round((+d.ph || 0) * 20) / 20)); deco.s = Math.max(0.5, Math.min(2.5, deco.s)); }
    if (!DECO_ORDER.includes(deco.k)) return null;
    // Couleur personnalisée (#rrggbb) : prend le pas sur l'index de couleur c.
    if (typeof d.cc === 'string' && HEX.test(d.cc)) deco.cc = d.cc.toLowerCase();
    // Pièce perso : ses formes voyagent avec la décoration ; au plus MAX_CUSTOM_DECOS par circuit, jamais vide.
    if (deco.k === 'custom') {
      deco.cp = sanitizeDecoParts(d.cp);
      if (!deco.cp.length || this.decos.filter((o) => o.k === 'custom').length >= MAX_CUSTOM_DECOS) return null;
    }
    this.decos.push(deco);
    this.version++;
    return deco;
  },

  removeDeco(d) {
    const i = this.decos.indexOf(d);
    if (i < 0) return;
    this.decos.splice(i, 1);
    this.version++;
  },
};
