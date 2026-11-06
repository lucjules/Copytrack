// Modèle de circuit : liste de pièces posées sur une grille, index spatial,
// requêtes de surface pour la physique, sérialisation en code partageable.
import { CELL, DIRS, ROAD_HALF, RAIL_W, SLAB_T, MAX_LEVEL, LEVEL_H, MAX_DECOS, VEHICLES } from './constants.js';
import {
  PIECES, PIECE_ORDER, SURFACE_CODES, SURFACE_ALIAS, LEGACY_SURFACE, LEGACY_PIECE, SURFACES, surfaceAllowed, flagAllowed, isFloor, isCeilingFloor, baseY,
  forkBranchX, toLocal, sampleLocal, rotVec, tileCenter, MOVER, moverParams, clampMover, THEMES, LEGACY_TILE, clearConflicts,
} from './pieces.js';
import { centerlineWorld } from './ribbons.js';
import { isObstacle, buildObstacleGrid } from './obstacles.js';
import { DECO_ORDER } from './decoData.js';
import { DECORS, DEFAULT_DECOR } from './themes.js';

// L'eau est un peu sous le niveau de la chaussée.
export const WATER_DROP = 0.35;
// Plaque bateau : une très légère montée de l'eau (entrée de la pièce, un peu sous la route) jusqu'au sol (sortie, au niveau normal).
export const boatDrop = (along) => WATER_DROP * (1 - Math.max(0, Math.min(1, along || 0)));

// Couleurs personnalisées d'une pièce : { road, line, rail } en #rrggbb (clés absentes = couleur d'origine). null si aucune.
const COLOR_KEYS = ['road', 'line', 'rail'];
const HEX = /^#[0-9a-f]{6}$/i;
function cleanColors(c) {
  if (!c || typeof c !== 'object') return null;
  const out = {};
  for (const k of COLOR_KEYS) if (typeof c[k] === 'string' && HEX.test(c[k])) out[k] = c[k].toLowerCase();
  return Object.keys(out).length ? out : null;
}

const EMPTY = Object.freeze([]);
const key = (x, z) => ((x + 4096) << 13) | (z + 4096);
const L = { lx: 0, lz: 0 };
const S = {};
const W = { x: 0, z: 0 }, W2 = { x: 0, z: 0 };
const MO = {};
const MP = {};

// ---- Règles de course (« paramètres du niveau ») ---------------------------------------------------------------------------------------
// UNE table décrit chaque règle : champ du circuit, valeur par défaut, nettoyage, clé dans le code de partage et étiquette dans la signature.
// Ajouter une règle = une ligne ici (et son champ dans le formulaire de l'éditeur) ; le constructeur, clear, clone, setParams, signature, encode,
// decode et l'historique de l'éditeur s'en déduisent. L'ordre est celui de la signature et du code de partage : ne pas le changer.
const clampInt = (v, lo, hi, fallback) => Math.max(lo, Math.min(hi, Math.round(+v || fallback)));
export const RULES = [
  { key: 'offroad', def: 0, clean: (v) => (v ? 1 : 0), code: 'or', sig: (v) => (v ? '#O' : '') },                          // 1 : rouler hors piste est permis (pas de retour au checkpoint)
  { key: 'v0', def: 0, clean: (v) => clampInt(v, 0, 300, 0), code: 'v0', sig: (v) => (v ? '#V' + v : '') },               // vitesse de départ (km/h)
  { key: 'g0', def: 100, clean: (v) => clampInt(v, 15, 250, 100), code: 'g0', sig: (v) => (v !== 100 ? '#G' + v : '') },   // gravité de départ (%)
  { key: 'veh0', def: 'car', clean: (v) => (VEHICLES.includes(v) ? v : 'car'), code: 've', sig: (v) => (v !== 'car' ? '#E' + v : '') },   // véhicule de départ
  { key: 'flip0', def: false, clean: (v) => !!v, code: 'ig', sig: (v) => (v ? '#I' : ''), v4: true },                      // la course démarre en gravité inversée (au plafond) ; v4 : exige le format 4
];

// Champs d'une pièce, dans l'ordre des instantanés de l'historique de l'éditeur (en mémoire seulement : jamais écrits, l'ordre est libre), avec
// leur valeur par défaut. Chaque champ produit par Track.normalize doit y figurer : un test (tools/test-circuit.mjs) le vérifie.
export const TILE_FIELDS = [
  ['t', ''], ['x', 0], ['z', 0], ['l', 0], ['r', 0], ['s', ''], ['p', 0], ['v', 0], ['nb', 0], ['tn', 0], ['mv', 0], ['cp', 0], ['th', 0],
  ['ms', 0], ['ma', 0], ['col', null], ['s2', ''], ['p2', 0], ['tb', 0], ['o', 0],
];
export const tileToRow = (t) => TILE_FIELDS.map(([k, def]) => (t[k] ?? def));
export const rowToTile = (row) => Object.fromEntries(TILE_FIELDS.map(([k], i) => [k, row[i]]));

export class Track {
  constructor(name = 'Nouveau circuit', tiles = []) {
    this.name = name;
    this.author = '';
    this.decor = DEFAULT_DECOR;
    this.tiles = [];
    this.decos = [];
    this.index = new Map();
    this.version = 0;
    this.laps = 1;    // nombre de tours (circuit fermé)
    // Paramètres du niveau : la description (affichée dans la communauté) et les règles de course (table RULES)
    this.desc = '';
    this.resetRules();
    this.vt = 0;      // temps de vérification (secondes) de l'auteur
    this.vh = '';     // signature du circuit au moment de la vérification
    for (const t of tiles) this.add(t);
  }

  static cellsOf(t) {
    const s = PIECES[t.t].size;
    const out = [];
    for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) out.push([t.x + i, t.z + j]);
    // Glissière : elle balaie aussi les cases voisines sur son côté droit (amplitude en cases ; 1 par défaut).
    if (t.mv === 2) {
      rotVec(t.r, 1, 0, W2);
      const n = Math.max(1, Math.ceil(moverParams(t, MP).amp / s - 1e-9));
      for (let k = 1; k <= n; k++) {
        const dx = Math.round(W2.x) * s * k, dz = Math.round(W2.z) * s * k;
        for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) out.push([t.x + i + dx, t.z + j + dz]);
      }
    }
    // Rotation : la pièce balaie un disque de rayon demi-diagonale ; on réserve une couronne d'une case autour d'elle.
    if (t.mv === 3) {
      for (let i = -1; i <= s; i++) for (let j = -1; j <= s; j++) if (i < 0 || j < 0 || i >= s || j >= s) out.push([t.x + i, t.z + j]);
    }
    return out;
  }

  // Plage de niveaux occupée (inclusive). Portiques et loopings réservent de la hauteur.
  // 0.9.3 : `rise` est signé (une pente descendante occupe les niveaux en dessous de son niveau d'entrée) ; une route sur un mur
  // (orientation o) réserve 2 niveaux au-dessus et au-dessous (le plan vertical mesure 18 m de haut, centré sur l'axe de la route).
  static range(t) {
    const p = PIECES[t.t];
    const up = Math.max(0, p.rise || 0), down = Math.min(0, p.rise || 0);
    // Un checkpoint en option réserve la hauteur de son portique (1 niveau) ou de son anneau (2 niveaux).
    const h = up + Math.max(p.clearance || 0, t.cp === 2 || t.tb ? 2 : t.cp === 1 ? 1 : 0, t.o ? 2 : 0);
    const below = Math.max(p.below || 0, t.o ? 2 : 0);       // pièces qui descendent sous leur niveau (plan vertical : 9 m plus bas)
    // Une pièce à l'envers est retournée sous son niveau : elle occupe les niveaux en dessous.
    if (t.v) return [t.l - h, t.l - down + below];
    return [t.l + down - below, t.l + h + (t.mv === 1 ? Math.ceil(moverParams(t, MP).amp) : 0)];   // l'ascenseur monte de 2 niveaux (réglable)
  }

  // Convertit une pièce (éventuellement au format v1.0 / v1.1) en pièce v1.2 / Phase 2.
  // Champs optionnels de la Phase 2 : cp (checkpoint 1 portique / 2 anneau), th (thème), ms / ma (vitesse et amplitude du
  // mouvement, 0 = valeur par défaut), col (couleurs personnalisées), s2 / p2 (2e revêtement d'une bifurcation).
  static normalize(t) {
    let type = t.t, s = SURFACE_ALIAS[t.s] || t.s || '';
    if (LEGACY_SURFACE[type]) { s = LEGACY_SURFACE[type]; type = 'straight'; }
    if (LEGACY_PIECE[type]) type = LEGACY_PIECE[type];
    // 0.9.2 : les anciennes pièces « route sur le côté » deviennent une pièce ordinaire + son orientation (même géométrie, même physique).
    let ori = t.o | 0;
    const lg = LEGACY_TILE[type];
    if (lg) { type = lg.t; if (lg.o) ori = lg.o; }
    if (!PIECES[type]) throw new Error('Pièce inconnue : ' + type);
    const tile = {
      t: type, x: t.x | 0, z: t.z | 0, l: Math.max(0, Math.min(MAX_LEVEL, Math.round((+t.l || 0) * 2) / 2)), r: t.r & 3,
      s: '', p: 0, v: 0, o: 0, nb: 0, tn: 0, mv: 0, cp: 0, tb: 0, th: 0, ms: 0, ma: 0, col: null, s2: '', p2: 0,
    };
    tile.v = t.v && flagAllowed(type, 'v') ? 1 : 0;
    // Orientation (mur gauche 1 / droit 2) : exclusive du plafond, du tunnel, du checkpoint, de l'anneau et du mouvement.
    tile.o = (ori === 1 || ori === 2) && !tile.v && flagAllowed(type, 'o', tile, ori) ? ori : 0;
    tile.nb = PIECES[type].noRails || (t.nb && flagAllowed(type, 'nb')) ? 1 : 0;
    tile.tn = t.tn && flagAllowed(type, 'tn', tile) ? 1 : 0;
    tile.mv = t.mv && flagAllowed(type, 'mv', tile) ? (t.mv | 0) & 3 : 0;
    if (tile.mv) { const m = clampMover(tile.mv, t.ms, t.ma); tile.ms = m.ms; tile.ma = m.ma; }
    // Le mouvement prime sur le checkpoint (une pièce mobile ne peut pas porter de checkpoint).
    tile.cp = t.cp && flagAllowed(type, 'cp', tile, t.cp | 0) ? (t.cp | 0) : 0;
    tile.tb = t.tb && flagAllowed(type, 'tb', tile) ? 1 : 0;
    tile.th = THEMES.some((h) => h.id === (t.th | 0)) && flagAllowed(type, 'th') ? (t.th | 0) : 0;
    tile.col = cleanColors(t.col);
    if (surfaceAllowed(type, s, !!tile.v, tile.o)) {
      tile.s = s;
      const S2 = SURFACES[s];
      if (S2 && S2.def != null) tile.p = Math.max(S2.min, Math.min(S2.max, t.p || S2.def));
    }
    // Bifurcation : un 2e revêtement pour la voie déportée (la 1re voie garde s).
    if (PIECES[type].kind === 'fork' && t.s2 && (t.s2 === '-' || surfaceAllowed(type, t.s2, !!tile.v, tile.o))) {
      tile.s2 = t.s2 === '-' ? '-' : (SURFACE_ALIAS[t.s2] || t.s2);
      const S3 = SURFACES[tile.s2];
      if (S3 && S3.def != null) tile.p2 = Math.max(S3.min, Math.min(S3.max, t.p2 || S3.def));
    }
    return tile;
  }

  tilesAt(x, z) {
    return this.index.get(key(x, z)) || EMPTY;
  }

  // Une pièce (notamment à l'envers) ne doit pas descendre sous le sol ni dépasser le plafond.
  static inBounds(t) {
    const [lo, hi] = Track.range(t);
    // À l'envers, la voiture pend sous la chaussée : il faut au moins un niveau sous la pièce.
    return lo >= (t.v ? 1 : 0) && hi <= MAX_LEVEL + 6;
  }

  // Pièces gênées par t. Phase 3 : un anneau flottant (pièce « anneau » : turbo ou ancien checkpoint aérien) peut être posé
  // sur des cases déjà occupées par une autre pièce, et inversement ; deux anneaux ne se superposent pas.
  conflicts(t) {
    const [lo, hi] = Track.range(t);
    const ring = PIECES[t.t].kind === 'ring';
    const set = new Set();
    for (const [x, z] of Track.cellsOf(t)) {
      for (const o of this.tilesAt(x, z)) {
        if (o === t) continue;
        if ((ring || PIECES[o.t].kind === 'ring') && !(ring && PIECES[o.t].kind === 'ring')) continue;
        const [a, b] = Track.range(o);
        if (a <= hi && lo <= b) set.add(o);
      }
    }
    return [...set];
  }

  add(t) {
    return this._insert(Track.normalize(t));
  }

  _insert(tile) {
    this.tiles.push(tile);
    for (const [x, z] of Track.cellsOf(tile)) {
      const k = key(x, z);
      let arr = this.index.get(k);
      if (!arr) this.index.set(k, (arr = []));
      arr.push(tile);
    }
    this.version++;
    return tile;
  }

  remove(tile) {
    const i = this.tiles.indexOf(tile);
    if (i < 0) return;
    this.tiles.splice(i, 1);
    for (const [x, z] of Track.cellsOf(tile)) {
      const k = key(x, z);
      const arr = this.index.get(k);
      if (!arr) continue;
      const j = arr.indexOf(tile);
      if (j >= 0) arr.splice(j, 1);
      if (!arr.length) this.index.delete(k);
    }
    this.version++;
  }

  // Revêtement (avec paramètre en %). Renvoie true si quelque chose a changé.
  setSurface(tile, s, p = 0) {
    if (!surfaceAllowed(tile.t, s, !!tile.v, tile.o)) return false;
    const S2 = SURFACES[s];
    const np = S2 && S2.def != null ? Math.max(S2.min, Math.min(S2.max, p || S2.def)) : 0;
    if (tile.s === s && (tile.p || 0) === np) return false;
    tile.s = s; tile.p = np;
    this.version++;
    return true;
  }

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
  }

  // Remplace `tile` par `cand` (normalisée : options devenues impossibles retirées, revêtement incompatible effacé) si la place et les niveaux
  // le permettent ; sinon rien ne change. Même objet : la sélection de l'inspecteur reste valable.
  _reshape(tile, cand) {
    const n = Track.normalize(cand);
    this.remove(tile);
    if (this.conflicts(n).length || !Track.inBounds(n)) { this._insert(tile); return false; }
    Object.assign(tile, n);
    this._insert(tile);
    return true;
  }

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
  }

  // Couleurs personnalisées { road, line, rail } (null / {} : couleurs d'origine).
  setColors(tile, col) {
    tile.col = cleanColors(col);
    this.version++;
    return true;
  }

  // 2e revêtement d'une bifurcation (voie déportée).
  setSurface2(tile, s, p = 0) {
    if (PIECES[tile.t].kind !== 'fork') return false;
    if (s && s !== '-' && !surfaceAllowed(tile.t, s, !!tile.v, tile.o)) return false;
    const S2 = SURFACES[s];
    const np = S2 && S2.def != null ? Math.max(S2.min, Math.min(S2.max, p || S2.def)) : 0;
    if ((tile.s2 || '') === s && (tile.p2 || 0) === np) return false;
    tile.s2 = s; tile.p2 = np;
    this.version++;
    return true;
  }

  addDeco(d) {
    if (this.decos.length >= MAX_DECOS) return null;
    const deco = {
      k: d.k, x: +d.x, y: +d.y, z: +d.z, ry: +d.ry || 0, s: Math.max(0.2, Math.min(20, +d.s || 1)),
      c: d.c | 0, u: d.u ? String(d.u).slice(0, 400) : '',
    };
    // Obstacles : décalage de phase (0 à 1) pour désynchroniser plusieurs obstacles.
    if (isObstacle(deco.k)) { deco.ph = Math.max(0, Math.min(0.95, Math.round((+d.ph || 0) * 20) / 20)); deco.s = Math.max(0.5, Math.min(2.5, deco.s)); }
    if (!DECO_ORDER.includes(deco.k)) return null;
    // Couleur personnalisée (#rrggbb) : prend le pas sur l'index de couleur c.
    if (typeof d.cc === 'string' && HEX.test(d.cc)) deco.cc = d.cc.toLowerCase();
    this.decos.push(deco);
    this.version++;
    return deco;
  }

  // Obstacles physiques (décorations particulières), mis en cache par version.
  get obstacles() {
    if (this._obsV !== this.version) { this._obs = this.decos.filter((d) => isObstacle(d.k)); this._obsV = this.version; }
    return this._obs;
  }

  // Index spatial des obstacles (voir obstacles.js), reconstruit quand le circuit change : partagé par toutes les voitures.
  get obstacleGrid() {
    if (this._ogV !== this.version) { this._og = buildObstacleGrid(this.obstacles); this._ogV = this.version; }
    return this._og;
  }

  removeDeco(d) {
    const i = this.decos.indexOf(d);
    if (i < 0) return;
    this.decos.splice(i, 1);
    this.version++;
  }

  clear() {
    this.tiles = [];
    this.decos = [];
    this.index.clear();
    this.vt = 0; this.vh = '';
    this.laps = 1;
    this.desc = '';
    this.resetRules();
    this.version++;
  }

  get startTile() {
    return this.tiles.find((t) => t.t === 'start') || null;
  }

  count(type) {
    let n = 0;
    for (const t of this.tiles) if (t.t === type) n++;
    return n;
  }

  // test : lancement d'un essai depuis l'éditeur ; l'arrivée n'est alors pas obligatoire (on roule librement).
  validate({ test = false } = {}) {
    const errors = [];
    const starts = this.count('start');
    if (starts === 0) errors.push('Il faut une pièce « Départ ».');
    if (starts > 1) errors.push('Il ne peut y avoir qu’un seul départ.');
    if (!test && this.count('finish') === 0) errors.push('Il faut au moins une pièce « Arrivée ».');
    return errors;
  }

  bounds() {
    if (!this.tiles.length) return { minX: -CELL * 2, maxX: CELL * 2, minZ: -CELL * 2, maxZ: CELL * 2, maxY: 0 };
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxL = 0;
    for (const t of this.tiles) {
      const s = PIECES[t.t].size;
      minX = Math.min(minX, t.x * CELL);
      minZ = Math.min(minZ, t.z * CELL);
      maxX = Math.max(maxX, (t.x + s) * CELL);
      maxZ = Math.max(maxZ, (t.z + s) * CELL);
      maxL = Math.max(maxL, Track.range(t)[1]);
    }
    return { minX, maxX, minZ, maxZ, maxY: maxL * LEVEL_H };
  }

  // Gravité inversée : surface « au plafond » la plus proche au-dessus de (x, y - step, z),
  // venant des pièces posées à l'envers (géométrie retournée autour de leur niveau).
  // Sans plafond, h vaut +∞ (la voiture continue de « tomber » vers le haut).
  ceilingSurfaceAt(x, y, z, out, step = 1.6, broken = null) {
    out.h = Infinity; out.nx = 0; out.ny = -1; out.nz = 0;
    out.tile = null; out.type = 'none'; out.mod = ''; out.p = 0; out.lx = 0; out.lz = 0;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (const tile of this.tilesAt(cx, cz)) {
      if (!isCeilingFloor(tile)) continue;
      if (broken && broken.has(tile)) continue;
      toLocal(tile, x, z, L);
      sampleLocal(tile, L.lx, L.lz, S);
      if (!S.inFootprint) continue;
      if (PIECES[tile.t].kind !== 'area' && Math.abs(S.d) > ROAD_HALF) continue;
      const base = baseY(tile);
      const h = 2 * base - S.h;
      if (h < y - step || h >= out.h) continue;
      out.h = h;
      rotVec(tile.r, S.nx, S.nz, W);
      out.nx = W.x; out.ny = -S.ny; out.nz = W.z;
      out.tile = tile; out.type = 'road'; out.mod = tile.s || ''; out.p = tile.p || 0;
      out.lx = L.lx; out.lz = L.lz;
      if (tile.s === 'water') out.h += WATER_DROP;
      else if (tile.s === 'boat' && (PIECES[tile.t].kind === 'line' || PIECES[tile.t].kind === 'arc')) out.h += boatDrop(S.along);
    }
    return out;
  }

  // Surface roulable la plus haute sous (x, y + step, z). Le sol est à y = 0.
  // Les pièces mobiles (ascenseur, glissière, rotation) sont prises à leur position au chrono `time` (s) de la course : le circuit n'a
  // pas d'horloge propre, plusieurs voitures (la sienne, un fantôme, un adversaire) l'interrogent chacune à son propre chrono.
  // broken : pièces de verre déjà brisées dans CETTE course (propre à chaque voiture, voir CarPhysics) : sans collision.
  surfaceAt(x, y, z, out, step = 1.6, broken = null, time = 0) {
    out.h = 0; out.nx = 0; out.ny = 1; out.nz = 0;
    out.tile = null; out.type = 'ground'; out.mod = ''; out.p = 0; out.lx = 0; out.lz = 0;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = -Infinity;
    const cell = this.tilesAt(cx, cz);
    for (let i = 0; i < cell.length; i++) {
      const tile = cell[i];
      if (tile.mv || !isFloor(tile) || (broken && broken.has(tile))) continue;
      best = this._floorTry(tile, x, z, 0, y, step, best, out);
    }
    const mv = this.movers;
    for (let i = 0; i < mv.length; i++) {
      const tile = mv[i];
      if (!isFloor(tile) || (broken && broken.has(tile))) continue;
      this.moverOffset(tile, time, MO);
      if (MO.a) { this.moverLocal(MO, x, z, W2); best = this._floorTry(tile, W2.x, W2.z, MO.y, y, step, best, out, MO.a); }
      else best = this._floorTry(tile, x - MO.x, z - MO.z, MO.y, y, step, best, out);
    }
    return out;
  }

  _floorTry(tile, x, z, oy, y, step, best, out, a = 0) {
    toLocal(tile, x, z, L);
    sampleLocal(tile, L.lx, L.lz, S);
    if (!S.inFootprint) return best;
    const p = PIECES[tile.t];
    if (p.kind !== 'area' && Math.abs(S.d) > ROAD_HALF) return best;
    const h = S.h + oy;
    if (h > y + step || h <= best) return best;
    out.h = h;
    rotVec(tile.r, S.nx, S.nz, W);
    out.nx = W.x; out.ny = S.ny; out.nz = W.z;
    if (a) { const c = Math.cos(a), sn = Math.sin(a); out.nx = c * W.x + sn * W.z; out.nz = -sn * W.x + c * W.z; }   // pièce tournée : la normale suit
    out.tile = tile;
    out.type = 'road';
    // Bifurcation à deux revêtements : la voie déportée (branche 1) peut avoir le sien (« - » = route normale).
    let sf = tile.s, sp = tile.p;
    if (p.kind === 'fork' && S.branch === 1 && tile.s2) { sf = tile.s2 === '-' ? '' : tile.s2; sp = tile.s2 === '-' ? 0 : tile.p2; }
    out.mod = sf || '';
    out.p = sp || 0;
    out.lx = L.lx; out.lz = L.lz;
    if (sf === 'water') out.h -= WATER_DROP;
    else if (sf === 'boat' && (p.kind === 'line' || p.kind === 'arc')) out.h -= boatDrop(S.along);      // plaque bateau : rampe de l'eau au sol
    return out.h;
  }

  // Pièces en mouvement : 1 = ascenseur (monte puis redescend), 2 = glissière (se décale sur son côté droit et revient),
  // 3 = rotation (tourne autour de son centre, tour complet ou va-et-vient). Vitesse et amplitude réglables (voir MOVER).
  // Le mouvement ne dépend que du chrono de la course. out : décalage (x, y, z) et vitesse (vx, vy, vz) ;
  // pour une rotation : a (angle, rad), w (vitesse angulaire, rad/s) et le pivot (cx, cz).
  moverOffset(tile, t, out) {
    const M = MOVER[tile.mv];
    const mp = moverParams(tile, MP);
    const sp = mp.speed / 100, P = M.period / Math.abs(sp), w = (Math.PI * 2) / P;
    const k = (1 - Math.cos(w * t)) / 2, dk = (Math.sin(w * t) * w) / 2;
    out.x = 0; out.y = 0; out.z = 0; out.vx = 0; out.vy = 0; out.vz = 0;
    out.a = 0; out.w = 0; out.cx = 0; out.cz = 0;
    if (tile.mv === 1) { out.y = mp.amp * LEVEL_H * k; out.vy = mp.amp * LEVEL_H * dk; }
    else if (tile.mv === 2) {
      rotVec(tile.r, 1, 0, W2);
      out.x = W2.x * CELL * mp.amp * k; out.z = W2.z * CELL * mp.amp * k;
      out.vx = W2.x * CELL * mp.amp * dk; out.vz = W2.z * CELL * mp.amp * dk;
    } else if (tile.mv === 3) {
      const c = tileCenter(tile, W2);
      out.cx = c.x; out.cz = c.z;
      const sg = sp < 0 ? -1 : 1;
      if (mp.amp >= 360) { out.a = sg * w * t; out.w = sg * w; }      // rotation continue : un tour par période
      else { const A = (mp.amp * Math.PI) / 180; out.a = sg * A * k; out.w = sg * A * dk; }
    }
    return out;
  }

  // Monde -> repère de la pièce mobile « au repos » (annule le décalage et la rotation) : sert à interroger sa géométrie.
  moverLocal(o, x, z, out) {
    x -= o.x; z -= o.z;
    if (o.a) {
      const dx = x - o.cx, dz = z - o.cz, c = Math.cos(o.a), s = Math.sin(o.a);
      x = o.cx + c * dx - s * dz; z = o.cz + s * dx + c * dz;
    }
    out.x = x; out.z = z;
    return out;
  }

  get movers() {
    if (this._mvV !== this.version) { this._mv = this.tiles.filter((t) => t.mv); this._mvV = this.version; }
    return this._mv;
  }

  // Dessous de dalle (ou toit de tunnel) le plus bas au-dessus de yMin : sert à la caméra.
  ceilingAt(x, z, yMin) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = Infinity;
    for (const tile of this.tilesAt(cx, cz)) {
      const kind = PIECES[tile.t].kind;
      if (kind === 'loop' || kind === 'ribbon' || tile.v || tile.o) continue;
      toLocal(tile, x, z, L);
      sampleLocal(tile, L.lx, L.lz, S);
      if (!S.inFootprint) continue;
      if (kind !== 'area' && Math.abs(S.d) > ROAD_HALF + RAIL_W + 0.5) continue;
      const under = tile.tn ? S.h + ROAD_HALF + RAIL_W + 0.9 : S.h - SLAB_T;
      if (under > yMin && under < best) best = under;
    }
    return best;
  }

  // Règles de course remises à leurs valeurs par défaut.
  resetRules() {
    for (const r of RULES) this[r.key] = r.def;
  }

  // Les règles de course actuelles : { offroad, v0, g0, veh0, flip0 }.
  rulesState() {
    return Object.fromEntries(RULES.map((r) => [r.key, this[r.key]]));
  }

  // Paramètres du niveau, bornés : la description et les règles de course (les champs absents ou `undefined` restent inchangés ;
  // accepte aussi un autre circuit, dont on lit les mêmes champs).
  setParams(p = {}) {
    if (p.desc !== undefined) this.desc = String(p.desc || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    for (const r of RULES) if (p[r.key] !== undefined) this[r.key] = r.clean(p[r.key]);
  }

  // Signature du contenu (pièces, décorations, règles de course), utilisée pour la
  // vérification et comme clé des classements en ligne. Le nom, la description et l'auteur
  // n'en font pas partie : on peut les modifier sans perdre la vérification ni les temps.
  signature() {
    const parts = this.tiles
      .map((t) => `${t.t}:${t.x}:${t.z}:${t.l}:${t.r}:${t.s}:${t.p}:${t.v}${t.nb}${t.tn}${t.mv ? 'm' + t.mv : ''}${tileExtras(t)}`)
      .sort()
      .join('|');
    const d = this.decos.map((o) => `${o.k}:${o.x.toFixed(1)}:${o.z.toFixed(1)}:${o.s}${isObstacle(o.k) ? `:${o.y.toFixed(1)}:${o.ry.toFixed(2)}:${o.ph || 0}` : ''}`).join('|');
    const rules = RULES.map((r) => r.sig(this[r.key])).join('');
    return hashString(this.decor + '#' + parts + '#' + d + (this.laps > 1 ? '#L' + this.laps : '') + rules);
  }

  // Clé de classement d'un circuit de joueur : stable si on renomme le circuit.
  get userKey() {
    return 'u-' + this.signature();
  }

  get verified() {
    return this.vt > 0 && this.vh === this.signature();
  }

  setVerified(time) {
    this.vt = Math.round(time * 1000) / 1000;
    this.vh = this.signature();
  }

  // Médailles déduites du temps de l'auteur (0.9) : cristal = son temps, les autres plus lentes.
  get derivedMedals() {
    if (!this.verified) return null;
    // Arrondi au centième supérieur : l'auteur obtient bien le cristal avec son propre temps.
    const t = this.vt, r2 = (x) => Math.ceil(x * 100 - 1e-6) / 100;
    return { cristal: r2(t), or: r2(t * 1.08), argent: r2(t * 1.2), bronze: r2(t * 1.4) };
  }

  clone() {
    const t = new Track(this.name, this.tiles);
    t.author = this.author;
    t.decor = this.decor;
    t.decos = this.decos.map((d) => ({ ...d }));
    t.vt = this.vt; t.vh = this.vh;
    t.laps = this.laps;
    t.desc = this.desc;
    for (const r of RULES) t[r.key] = this[r.key];
    return t;
  }

  // ---- Sérialisation -----------------------------------------------------
  encode() {
    const arr = [];
    const extras = [];
    this.tiles.forEach((t, idx) => {
      arr.push(
        PIECE_ORDER.indexOf(t.t), t.x, t.z, t.l, t.r,
        Math.max(0, SURFACE_CODES.indexOf(t.s || '')), t.p || 0,
        (t.v ? 1 : 0) | (t.nb ? 2 : 0) | (t.tn ? 4 : 0) | ((t.mv | 0) << 3),
      );
      // Phase 2 : champs optionnels, rangés à part (par index de pièce) ; absents = valeurs par défaut.
      const e = { i: idx };
      if (t.cp) e.cp = t.cp;
      if (t.o) e.o = t.o;
      if (t.tb) e.tb = 1;
      if (t.th) e.th = t.th;
      if (t.ms) e.ms = t.ms;
      if (t.ma) e.ma = t.ma;
      if (t.s2) { e.s2 = t.s2 === '-' ? -1 : Math.max(0, SURFACE_CODES.indexOf(t.s2)); if (t.p2) e.p2 = t.p2; }
      if (t.col) e.col = Object.fromEntries(COLOR_KEYS.filter((k) => t.col[k]).map((k) => [k, t.col[k].slice(1)]));
      if (Object.keys(e).length > 1) extras.push(e);
    });
    const decos = this.decos.map((d) => [
      DECO_ORDER.indexOf(d.k), +d.x.toFixed(2), +d.y.toFixed(2), +d.z.toFixed(2), +d.ry.toFixed(3), +d.s.toFixed(2), d.c, d.u || 0,
      ...(d.ph || d.cc ? [d.ph || 0] : []),
      ...(d.cc ? [d.cc.slice(1)] : []),
    ]);
    // v3 tant que rien de la Phase 2 n'est utilisé : les codes existants ne changent pas.
    const data = { v: extras.length || this.decos.some((d) => d.cc) || RULES.some((r) => r.v4 && this[r.key]) ? 4 : 3, n: this.name, a: this.author || '', d: this.decor, t: arr };
    if (extras.length) data.e = extras;
    if (decos.length) data.o = decos;
    if (this.laps > 1) data.lp = this.laps;
    if (this.desc) data.ds = this.desc;
    for (const r of RULES) if (this[r.key] !== r.def) data[r.code] = this[r.key] === true ? 1 : this[r.key];
    if (this.verified) { data.vt = this.vt; data.vh = this.vh; }
    return 'SHW3:' + b64encode(JSON.stringify(data));
  }

  // Accepte les codes v1.0 (SHW1), v1.1 (SHW2) et v1.2 (SHW3), bruts ou dans un lien.
  static decode(code) {
    let s = String(code || '').trim();
    const hash = s.indexOf('#t=');
    if (hash >= 0) s = s.slice(hash + 3);
    s = decodeURIComponent(s);
    if (/^SHW\d:/.test(s)) s = s.slice(5);
    const data = JSON.parse(b64decode(s));
    const stride = data && data.v >= 3 ? 8 : data && data.v >= 2 ? 6 : 5;
    if (!data || !Array.isArray(data.t) || data.t.length % stride) throw new Error('Code de circuit invalide');
    const tr = new Track(String(data.n || 'Circuit importé').slice(0, 40));
    tr.author = String(data.a || '').slice(0, 30);
    tr.decor = DECORS[data.d] ? data.d : DEFAULT_DECOR;
    const extras = new Map();
    if (Array.isArray(data.e)) for (const e of data.e) if (e && Number.isInteger(e.i)) extras.set(e.i, e);
    for (let i = 0; i < data.t.length; i += stride) {
      const type = PIECE_ORDER[data.t[i]];
      if (!type) continue;
      const tile = { t: type, x: data.t[i + 1], z: data.t[i + 2], l: data.t[i + 3], r: data.t[i + 4], s: '' };
      const ex = extras.get(i / stride);
      if (ex) {
        tile.cp = ex.cp | 0; tile.o = ex.o | 0; tile.tb = ex.tb | 0; tile.th = ex.th | 0; tile.ms = ex.ms | 0; tile.ma = +ex.ma || 0;
        if (ex.s2) { tile.s2 = ex.s2 === -1 ? '-' : SURFACE_CODES[ex.s2] || ''; tile.p2 = ex.p2 | 0; }
        if (ex.col && typeof ex.col === 'object') tile.col = Object.fromEntries(COLOR_KEYS.filter((k) => typeof ex.col[k] === 'string').map((k) => [k, '#' + ex.col[k]]));
      }
      if (stride >= 6) tile.s = SURFACE_CODES[data.t[i + 5]] || '';
      if (stride >= 8) {
        tile.p = data.t[i + 6];
        const f = data.t[i + 7] | 0;
        tile.v = f & 1; tile.nb = (f >> 1) & 1; tile.tn = (f >> 2) & 1; tile.mv = (f >> 3) & 3;
      }
      if (tr.conflicts(Track.normalize(tile)).length) continue;
      tr.add(tile);
    }
    if (Array.isArray(data.o)) {
      for (const o of data.o.slice(0, MAX_DECOS)) {
        const k = DECO_ORDER[o[0]];
        if (!k) continue;
        const u = typeof o[7] === 'string' && /^https?:\/\//i.test(o[7]) ? o[7] : '';
        tr.addDeco({ k, x: o[1], y: o[2], z: o[3], ry: o[4], s: o[5], c: o[6], u, ph: +o[8] || 0, cc: typeof o[9] === 'string' ? '#' + o[9] : '' });
      }
    }
    tr.laps = Math.max(1, Math.min(9, data.lp | 0 || 1));
    tr.setParams({ desc: data.ds, ...Object.fromEntries(RULES.map((r) => [r.key, data[r.code]])) });
    if (data.vt > 0 && data.vh) { tr.vt = +data.vt; tr.vh = String(data.vh); }
    return tr;
  }
}

// Suffixe de signature des champs de la Phase 2 : vide tant qu'ils ont leur valeur par défaut (les anciennes signatures ne changent pas).
// Les couleurs et le thème n'ont aucun effet sur le jeu ni sur les temps : ils restent hors de la signature (modifier une couleur
// ne doit pas invalider la vérification d'un circuit).
function tileExtras(t) {
  let e = '';
  if (t.cp) e += 'c' + t.cp;
  if (t.tb) e += 'b';
  if (t.o) e += 'o' + t.o;
  if (t.mv && (t.ms || t.ma)) e += `s${t.ms || 0}a${t.ma || 0}`;
  if (t.s2) e += `f${t.s2}:${t.p2 || 0}`;
  return e;
}

export function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64decode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// ---- Construction "à la tortue" -------------------------------------------
// Décrit un circuit comme une suite d'instructions :
//   start finish        départ / arrivée            C  checkpoint
//   S3                  3 lignes droites            P  plateforme
//   R / L               virage serré droite / gauche
//   RR / LL             grand virage droite / gauche (2x2)
//   U / D               pente montante / descendante
//   UU / DD             tremplin montant / descendant (2 niveaux)
//   O / OL              looping décalé à droite / à gauche (2x2)
//   OB / OBL            grand looping (3x3)    OD / ODL  double looping (3x3)
//   TW / TWB            vrille endroit -> envers / envers -> endroit
//   QU  WA3  CR         montée en L, mur de 3 niveaux, sommet du L
//   G2                  vide de 2 cases (saut)       V-2  change le niveau
// Suffixe de revêtement : .i verglas  .b accélérateur  .j rebond  .m aimant
//   .d dérive  .x ralentisseur  .w vent  .g gravité  .o plaque moto
//   avec un paramètre en % : "S.b150" accélérateur à 150 %, "S.g25" gravité à 25 %.
// Drapeaux en fin de jeton : ^ à l'envers   _ sans bordures   # tunnel
//   ex. "S3.i" = 3 droites verglacées, "S2^_" = 2 droites à l'envers sans bordures.
// Raccourcis historiques : B = S.b, I = S.i.
//
// v1.5 :
//   BR / BL             virage relevé droite / gauche (2x2)   BRR / BLL  très grand virage relevé (3x3)
//   TB                  tube (2x2)        CK / CKL  tire-bouchon (2x2)
//   TI TM4 TO           tube modulaire : entrée, 4 sections (où l'on peut faire des tours), sortie
//   KR / KL             checkpoint dans un virage droite / gauche
//   GU / GD             pente douce (½ niveau) montante / descendante
//   GR2 / GC2           vide de 2 cases avec un anneau turbo / un checkpoint aérien au milieu
//   Y3.b / YL3.b        bifurcation : deux voies parallèles de 3 cases puis jonction ;
//                       la voie déportée (à droite, ou à gauche pour YL) reçoit le revêtement
//                       et c'est elle que suit le pilote automatique
//   Phase 2 : HR / HL très grand virage plat (3x3)   UX / DX  ligne droite inclinée de 4 niveaux (montée / descente)
//   CVR / CVL  courbe montante serrée droite / gauche, CBR / CBL grande courbe montante (2x2) : le nombre est l'inclinaison
//   (0 = ½, 1, 2, 4), ex. CVR2, CBL0.   OT / OTL / OBT / OBTL / OBD / OBDL : looping triple, grand ×3, grand ×2
//   suffixes : .a eau  .n plaque bateau  .e plaque deltaplane  .f inversion de gravité
//              .t tapis roulant  .r ressort latéral  .v verre  .p poudreuse  .y volant inversé  .c moteur coupé
//   0.9.3 : [id] place n'importe quelle pièce par son identifiant (ex. [dn1] pente descendante, [cro1] fin de montée douce, [tr01s] sol → mur gauche,
//           [cvd1] virage descendant) et suit son dénivelé ; drapeaux < mur gauche et > mur droit (ex. "S3<" : 3 droites sur le mur gauche).
const SURF_CODE = { i: 'ice', b: 'boost', j: 'bounce', m: 'magnet', d: 'drift', x: 'slow', w: 'wind', g: 'gravity', o: 'moto', a: 'water', n: 'boat', e: 'glider', f: 'flip', t: 'conveyor', r: 'spring', v: 'glass', p: 'powder', y: 'reverse', c: 'cut' };

export function scriptTrack(name, script, opts = {}) {
  const tr = new Track(name);
  tr.decor = opts.decor || DEFAULT_DECOR;
  let x = opts.x || 0, z = opts.z || 0, h = opts.h || 0, l = opts.l || 0;
  const path = [];
  let cur = { s: '', p: 0, v: 0, nb: 0, tn: 0 };
  const place = (t, px, pz, lv, r, reverse = false, noPath = false, curOver = null) => {
    const tile = { t, x: px, z: pz, l: lv, r: r & 3, ...(curOver || cur) };
    if (cur.s && !surfaceAllowed(t, cur.s, !!cur.v, cur.o | 0)) throw new Error(`${name} : revêtement ${cur.s} interdit sur ${t}`);
    for (const f of ['v', 'nb', 'tn', 'mv']) if (cur[f] && !flagAllowed(t, f, tile)) throw new Error(`${name} : drapeau ${f} interdit sur ${t}`);
    if (cur.o && !flagAllowed(t, 'o', tile, cur.o)) throw new Error(`${name} : orientation ${cur.o} interdite sur ${t}`);
    const c = tr.conflicts(Track.normalize(tile));
    if (c.length) throw new Error(`${name} : conflit en (${px}, ${pz}) niveau ${lv} [${t}]`);
    if (!Track.inBounds(Track.normalize(tile))) throw new Error(`${name} : ${t} sort des niveaux en (${px}, ${pz})`);
    const added = tr.add(tile);
    if (noPath) return added;
    const pts = centerlineWorld(added, PIECES[t].size === 2 ? 12 : 6, reverse);
    if (path.length) pts.shift();
    path.push(...pts);
    return added;
  };
  // Pièce 2x2 « en ligne droite » sur la colonne gauche (tube, tire-bouchon) :
  // la case d'entrée est la case courante, la pièce déborde sur la colonne de droite.
  const straight2 = (type) => {
    const c = rot(h, 0.5, -0.5);
    place(type, Math.round(x + 0.5 + c.x - 1), Math.round(z + 0.5 + c.z - 1), l, h);
    adv(h, 2);
  };
  // Vrille : pièce 2×2 dont la route est dans la colonne de gauche. rev : parcourue dans l'autre sens (pièce tournée de 180°,
  // la route passe alors dans la colonne de droite ; on garde la même case d'entrée).
  const twist2 = (rev) => {
    const r = rev ? h + 2 : h;
    const e = rot(r, -0.5, rev ? -0.5 : 0.5);              // case d'entrée dans le repère de la pièce
    place('twist', Math.round(x + 0.5 - e.x - 1), Math.round(z + 0.5 - e.z - 1), l, r, rev);
    adv(h, 2);
  };
  // Bifurcation (+ voies parallèles + jonction). side = 1 : voie B à droite.
  const fork = (n, side, surf) => {
    const right = rot(h, side, 0);
    const bx = x + right.x, bz = z + right.z;
    const t1 = side > 0 ? 'fork' : 'forkL', t2 = side > 0 ? 'forkL' : 'fork';
    const plain = { s: '', p: 0, v: 0, nb: 0, tn: 0 };
    const fwd = rot(h, 0, -1);
    const step = (k) => [fwd.x * k, fwd.z * k];
    // Ancre d'un bloc 2x2 : coin minimal des cases (voies A et B, rangées k et k + 1).
    const block = (k) => {
      const cells = [];
      for (const [cx, cz] of [[x, z], [bx, bz]]) for (const kk of [k, k + 1]) cells.push([cx + fwd.x * kk, cz + fwd.z * kk]);
      return [Math.min(...cells.map((c) => c[0])), Math.min(...cells.map((c) => c[1]))];
    };
    const [fx0, fz0] = block(0);
    const fT = place(t1, fx0, fz0, l, h, false, true, plain);
    // Voies parallèles (A = colonne d'entrée, B = colonne déportée).
    const lanesStart = 2;
    for (let i = 0; i < n; i++) {
      const [ox, oz] = step(lanesStart + i);
      place('straight', x + ox, z + oz, l, h, false, true, plain);
      place('straight', bx + ox, bz + oz, l, h, false, true, surf);
    }
    // Jonction : bifurcation miroir tournée de 180°, sortie dans la colonne A.
    const jA = block(lanesStart + n);
    const jT = place(t2, jA[0], jA[1], l, h + 2, false, true, plain);
    // Chemin du pilote : branche B (déportée).
    const pushPts = (pts) => { if (path.length) pts.shift(); path.push(...pts); };
    pushPts(forkPath(fT, 1, false));
    for (let i = 0; i <= n; i++) {
      const [ox, oz] = step(lanesStart + i);
      const c0 = { x: (bx + ox + 0.5) * CELL, z: (bz + oz + 0.5) * CELL };
      const back = rot(h, 0, 0.5);
      path.push([c0.x + back.x * CELL, l * LEVEL_H + 0.4, c0.z + back.z * CELL, 0]);
    }
    pushPts(forkPath(jT, 1, true));
    adv(h, lanesStart + n + 2);
  };
  const adv = (dir, n = 1) => { x += DIRS[dir][0] * n; z += DIRS[dir][1] * n; };
  const rot = (r, lx, lz) => rotVec(r, lx, lz, { x: 0, z: 0 });
  // Pièce de taille size : ancre à partir de la case d'entrée et du décalage latéral des voies.
  const bigPiece = (type, mirror, size, laneCells) => {
    const e = rot(h, -mirror * laneCells, (size - 1) / 2);
    const ax = Math.round(x + 0.5 - e.x - size / 2), az = Math.round(z + 0.5 - e.z - size / 2);
    place(type, ax, az, l, h);
    const d = rot(h, 2 * mirror * laneCells, -size);
    x += d.x; z += d.z;
  };

  for (const tok of script.trim().split(/\s+/)) {
    // [id] : n'importe quelle pièce par son identifiant (ex. [dn1] [cro2] [tr01s] [cvd1]) ; le niveau suit la pente de la pièce.
    const gm = /^\[([A-Za-z0-9]+)\](-?\d*)(?:\.([a-z])(\d*))?([\^_#~=<>]*)$/.exec(tok);
    const m = gm ? [tok, '@' + gm[1], gm[2], gm[3], gm[4], gm[5]] : /^([A-Za-z]+)(-?\d*)(?:\.([a-z])(\d*))?([\^_#~=<>]*)$/.exec(tok);
    if (!m) throw new Error('Instruction invalide : ' + tok);
    let op = m[1];
    const n = m[2] ? parseInt(m[2], 10) : 1;
    cur = {
      s: '', p: 0, v: m[5].includes('^') ? 1 : 0, nb: m[5].includes('_') ? 1 : 0, tn: m[5].includes('#') ? 1 : 0, mv: m[5].includes('~') ? 1 : m[5].includes('=') ? 2 : 0,
      o: m[5].includes('<') ? 1 : m[5].includes('>') ? 2 : 0,      // < : mur gauche, > : mur droit
    };
    if (m[3]) {
      cur.s = SURF_CODE[m[3]];
      if (!cur.s) throw new Error('Revêtement inconnu : ' + tok);
      cur.p = m[4] ? parseInt(m[4], 10) : 0;
    }
    if (op === 'B') { op = 'S'; cur.s = 'boost'; }
    if (op === 'I') { op = 'S'; cur.s = 'ice'; }
    if (op[0] === '@') {
      const id = op.slice(1), P = PIECES[id];
      if (!P) throw new Error('Pièce inconnue : ' + id);
      for (let i = 0; i < n; i++) {
        const sg = P.mirror < 0 ? -1 : 1, rise = P.rise || 0;
        if (P.kind === 'arc' && P.size === 2) {
          const c = rot(h, 0.5 * sg, -0.5);
          place(id, Math.round(x + 0.5 + c.x - 1), Math.round(z + 0.5 + c.z - 1), l, h);
          const nx = rot(h, 2 * sg, -1);
          x += nx.x; z += nx.z; h = (h + (sg > 0 ? 1 : 3)) & 3;
        } else if (P.kind === 'arc') {
          place(id, x, z, l, h);
          h = (h + (sg > 0 ? 1 : 3)) & 3; adv(h);
        } else if (P.size === 2) straight2(id);
        else { place(id, x, z, l, h); adv(h); }
        l += rise;
      }
      continue;
    }
    const simple = { S: 'straight', C: 'checkpoint', P: 'platform', start: 'start', finish: 'finish' };
    if (simple[op]) {
      for (let i = 0; i < n; i++) { place(simple[op], x, z, l, h); adv(h); }
      continue;
    }
    switch (op) {
      case 'R':
        place('curve', x, z, l, h);
        h = (h + 1) & 3; adv(h);
        break;
      case 'L':
        place('curve', x, z, l, h + 1, true);
        h = (h + 3) & 3; adv(h);
        break;
      case 'RR': {
        const c = rot(h, 0.5, -0.5);
        place('bigcurve', Math.round(x + 0.5 + c.x - 1), Math.round(z + 0.5 + c.z - 1), l, h);
        const nx = rot(h, 2, -1);
        x += nx.x; z += nx.z; h = (h + 1) & 3;
        break;
      }
      case 'LL': {
        const r = (h + 1) & 3;
        const c = rot(r, -0.5, 0.5);
        place('bigcurve', Math.round(x + 0.5 + c.x - 1), Math.round(z + 0.5 + c.z - 1), l, r, true);
        const nx = rot(r, -1, 2);
        x += nx.x; z += nx.z; h = (h + 3) & 3;
        break;
      }
      case 'O': bigPiece('loop', 1, 2, 0.5); break;
      case 'OL': bigPiece('loopL', -1, 2, 0.5); break;
      case 'OB': bigPiece('loopBig', 1, 3, 1); break;
      case 'OBL': bigPiece('loopBigL', -1, 3, 1); break;
      case 'OD': bigPiece('loopDouble', 1, 3, 1); break;
      case 'ODL': bigPiece('loopDoubleL', -1, 3, 1); break;
      // Vrille (2 cases de long) : TW de l'endroit vers l'envers, TWB (sens inverse) de l'envers vers l'endroit.
      case 'TW': twist2(false); break;
      case 'TWB': twist2(true); break;
      case 'QU': place('ramp90', x, z, l, h); adv(h); l += 2; break;
      case 'WA': for (let i = 0; i < n; i++) { place('wall', x, z, l, h); l += 1; } break;
      case 'CR': place('crest90', x, z, l, h); adv(h); l += 2; break;
      // Au plafond (^), une pente est retournée sous son niveau : elle descend dans son sens normal.
      case 'U': for (let i = 0; i < n; i++) { if (cur.v) { l += 1; place('slope', x, z, l, h + 2, true); } else { place('slope', x, z, l, h); l += 1; } adv(h); } break;
      case 'UU': if (cur.v) { l += 2; place('steep', x, z, l, h + 2, true); } else { place('steep', x, z, l, h); l += 2; } adv(h); break;
      case 'D': for (let i = 0; i < n; i++) { if (cur.v) { place('slope', x, z, l, h); l -= 1; } else { l -= 1; place('slope', x, z, l, h + 2, true); } adv(h); } break;
      case 'DD': if (cur.v) { place('steep', x, z, l, h); l -= 2; } else { l -= 2; place('steep', x, z, l, h + 2, true); } adv(h); break;
      case 'G': adv(h, n); break;
      // ---- v1.5
      case 'BR': {
        const c = rot(h, 0.5, -0.5);
        place('bank', Math.round(x + 0.5 + c.x - 1), Math.round(z + 0.5 + c.z - 1), l, h);
        const nx = rot(h, 2, -1);
        x += nx.x; z += nx.z; h = (h + 1) & 3;
        break;
      }
      case 'BL': {
        const r = (h + 1) & 3;
        const c = rot(r, -0.5, 0.5);
        place('bank', Math.round(x + 0.5 + c.x - 1), Math.round(z + 0.5 + c.z - 1), l, r, true);
        const nx = rot(r, -1, 2);
        x += nx.x; z += nx.z; h = (h + 3) & 3;
        break;
      }
      case 'BRR': case 'BLL': {
        // Très grand virage relevé (3x3) : bloc de cases devant et sur le côté du virage.
        const sgn = op === 'BRR' ? 1 : -1;
        const fwd = rot(h, 0, -1), side = rot(h, sgn, 0);
        const cells = [];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cells.push([x + side.x * i + fwd.x * j, z + side.z * i + fwd.z * j]);
        const ax = Math.min(...cells.map((c) => c[0])), az = Math.min(...cells.map((c) => c[1]));
        if (sgn > 0) place('bankBig', ax, az, l, h);
        else place('bankBig', ax, az, l, h + 1, true);
        x += fwd.x * 2 + side.x * 3; z += fwd.z * 2 + side.z * 3;
        h = (h + (sgn > 0 ? 1 : 3)) & 3;
        break;
      }
      // ---- Phase 2
      case 'HR': case 'HL': {
        const sgn = op === 'HR' ? 1 : -1;
        const fwd = rot(h, 0, -1), side = rot(h, sgn, 0);
        const cells = [];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cells.push([x + side.x * i + fwd.x * j, z + side.z * i + fwd.z * j]);
        const ax = Math.min(...cells.map((c) => c[0])), az = Math.min(...cells.map((c) => c[1]));
        if (sgn > 0) place('hugecurve', ax, az, l, h); else place('hugecurve', ax, az, l, h + 1, true);
        x += fwd.x * 2 + side.x * 3; z += fwd.z * 2 + side.z * 3;
        h = (h + (sgn > 0 ? 1 : 3)) & 3;
        break;
      }
      case 'UX': place('steep4', x, z, l, h); l += 4; adv(h); break;
      case 'DX': l -= 4; place('steep4', x, z, l, h + 2, true); adv(h); break;
      case 'CVR': case 'CVL': {
        const k = ['05', '1', '2', '4'][n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : 3];
        place(op === 'CVR' ? 'cv' + k : 'cvL' + k, x, z, l, h);
        l += k === '05' ? 0.5 : +k;
        h = (h + (op === 'CVR' ? 1 : 3)) & 3; adv(h);
        break;
      }
      case 'CBR': case 'CBL': {
        const k = ['05', '1', '2', '4'][n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : 3];
        const sg = op === 'CBR' ? 1 : -1;
        const c = rot(h, 0.5 * sg, -0.5);
        place(sg > 0 ? 'cvBig' + k : 'cvBigL' + k, Math.round(x + 0.5 + c.x - 1), Math.round(z + 0.5 + c.z - 1), l, h);
        const nx = rot(h, 2 * sg, -1);
        x += nx.x; z += nx.z; h = (h + (sg > 0 ? 1 : 3)) & 3;
        l += k === '05' ? 0.5 : +k;
        break;
      }
      case 'OT': bigPiece('loopTriple', 1, 4, 1.5); break;
      case 'OTL': bigPiece('loopTripleL', -1, 4, 1.5); break;
      case 'OBT': bigPiece('loopBigTriple', 1, 4, 1.5); break;
      case 'OBTL': bigPiece('loopBigTripleL', -1, 4, 1.5); break;
      case 'OBD': bigPiece('loopBigDouble', 1, 3, 1); break;
      case 'OBDL': bigPiece('loopBigDoubleL', -1, 3, 1); break;
      case 'TB': straight2('tube'); break;
      case 'TI': place('tubeIn', x, z, l, h); adv(h); break;
      case 'TM': for (let i = 0; i < n; i++) { place('tubeMid', x, z, l, h); adv(h); } break;
      case 'TO': place('tubeIn', x, z, l, h + 2, true); adv(h); break;
      case 'CK': straight2('cork'); break;
      case 'CKL': straight2('corkL'); break;
      case 'KR': place('cpCurve', x, z, l, h); h = (h + 1) & 3; adv(h); break;
      case 'KL': place('cpCurve', x, z, l, h + 1, true); h = (h + 3) & 3; adv(h); break;
      case 'GU': for (let i = 0; i < n; i++) { place('gentle', x, z, l, h); l += 0.5; adv(h); } break;
      case 'GD': for (let i = 0; i < n; i++) { l -= 0.5; place('gentle', x, z, l, h + 2, true); adv(h); } break;
      case 'GR': case 'GC': {
        const mid = Math.floor((n - 1) / 2);
        const rz = rot(h, 0, -mid);
        place(op === 'GR' ? 'ring' : 'cpRing', x + rz.x, z + rz.z, l, h, false, true, { s: '', p: 0, v: 0, nb: 0, tn: 0 });
        adv(h, n);
        break;
      }
      case 'Y': fork(n, 1, { ...cur }); break;
      case 'YL': fork(n, -1, { ...cur }); break;
      case 'V': l += n; break;
      default: throw new Error('Instruction inconnue : ' + op);
    }
  }
  for (const d of opts.decos || []) tr.addDeco(d);
  tr.path = path;
  tr.turtle = { x, z, h, l };   // position finale (sert à refermer les circuits à tours)
  return tr;
}

// Points (monde) d'une branche de bifurcation : 0 = tout droit, 1 = déportée.
function forkPath(tile, branch, reverse) {
  const P = PIECES[tile.t];
  const half = P.size * (CELL / 2);
  const y = tile.l * LEVEL_H + 0.4;
  const out = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const lx = forkBranchX(P, t, branch), lz = half - 2 * half * t;
    const w = { x: 0, z: 0 };
    rotVec(tile.r, lx, lz, w);
    const cx = tile.x * CELL + half, cz = tile.z * CELL + half;
    out.push([w.x + cx, y, w.z + cz, 0]);
  }
  return reverse ? out.reverse() : out;
}

