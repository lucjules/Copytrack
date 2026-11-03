// Modèle de circuit : liste de pièces posées sur une grille, index spatial,
// requêtes de surface pour la physique, sérialisation en code partageable.
import { CELL, DIRS, ROAD_HALF, RAIL_W, SLAB_T, MAX_LEVEL, LEVEL_H, MAX_DECOS } from './constants.js';
import {
  PIECES, PIECE_ORDER, SURFACE_ORDER, LEGACY_SURFACE, LEGACY_PIECE, SURFACES, surfaceAllowed, flagAllowed, isFloor,
  toLocal, sampleLocal, rotVec,
} from './pieces.js';
import { centerlineWorld } from './ribbons.js';
import { forkBranchX } from './pieces.js';
import { DECO_ORDER } from './decoData.js';

export const DECORS = {
  desert: { label: 'Désert crépuscule' },
  polar: { label: 'Nuit polaire' },
  jungle: { label: 'Jungle néon' },
  city: { label: 'Ville futuriste' },
  isles: { label: 'Archipel tropical' },
  volcano: { label: 'Volcan' },
  orbit: { label: 'Station orbitale' },
};

// L'eau est un peu sous le niveau de la chaussée.
export const WATER_DROP = 0.35;

const EMPTY = Object.freeze([]);
const key = (x, z) => ((x + 4096) << 13) | (z + 4096);
const L = { lx: 0, lz: 0 };
const S = {};
const W = { x: 0, z: 0 };

export class Track {
  constructor(name = 'Nouveau circuit', tiles = []) {
    this.name = name;
    this.author = '';
    this.decor = 'desert';
    this.tiles = [];
    this.decos = [];
    this.index = new Map();
    this.version = 0;
    this.laps = 1;    // nombre de tours (circuit fermé)
    this.vt = 0;      // temps de vérification (secondes) de l'auteur
    this.vh = '';     // signature du circuit au moment de la vérification
    for (const t of tiles) this.add(t);
  }

  static cellsOf(t) {
    const s = PIECES[t.t].size;
    const out = [];
    for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) out.push([t.x + i, t.z + j]);
    return out;
  }

  // Plage de niveaux occupée (inclusive). Portiques et loopings réservent de la hauteur.
  static range(t) {
    const p = PIECES[t.t];
    return [t.l, t.l + p.rise + (p.clearance || 0)];
  }

  // Convertit une pièce (éventuellement au format v1.0 / v1.1) en pièce v1.2.
  static normalize(t) {
    let type = t.t, s = t.s || '';
    if (LEGACY_SURFACE[type]) { s = LEGACY_SURFACE[type]; type = 'straight'; }
    if (LEGACY_PIECE[type]) type = LEGACY_PIECE[type];
    if (!PIECES[type]) throw new Error('Pièce inconnue : ' + type);
    const tile = { t: type, x: t.x | 0, z: t.z | 0, l: Math.max(0, Math.min(MAX_LEVEL, Math.round((+t.l || 0) * 2) / 2)), r: t.r & 3, s: '', p: 0, v: 0, nb: 0, tn: 0 };
    tile.v = t.v && flagAllowed(type, 'v') ? 1 : 0;
    tile.nb = t.nb && flagAllowed(type, 'nb') ? 1 : 0;
    tile.tn = t.tn && flagAllowed(type, 'tn', tile) ? 1 : 0;
    if (surfaceAllowed(type, s, !!tile.v)) {
      tile.s = s;
      const S2 = SURFACES[s];
      if (S2 && S2.def != null) tile.p = Math.max(S2.min, Math.min(S2.max, t.p || S2.def));
    }
    return tile;
  }

  tilesAt(x, z) {
    return this.index.get(key(x, z)) || EMPTY;
  }

  conflicts(t) {
    const [lo, hi] = Track.range(t);
    const set = new Set();
    for (const [x, z] of Track.cellsOf(t)) {
      for (const o of this.tilesAt(x, z)) {
        const [a, b] = Track.range(o);
        if (a <= hi && lo <= b) set.add(o);
      }
    }
    return [...set];
  }

  add(t) {
    const tile = Track.normalize(t);
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
    if (!surfaceAllowed(tile.t, s, !!tile.v)) return false;
    const S2 = SURFACES[s];
    const np = S2 && S2.def != null ? Math.max(S2.min, Math.min(S2.max, p || S2.def)) : 0;
    if (tile.s === s && (tile.p || 0) === np) return false;
    tile.s = s; tile.p = np;
    this.version++;
    return true;
  }

  // Bascule un drapeau (v : à l'envers, nb : sans bordures, tn : tunnel).
  toggleFlag(tile, flag) {
    if (!flagAllowed(tile.t, flag, tile)) return false;
    tile[flag] = tile[flag] ? 0 : 1;
    if (flag === 'v' && tile.v) {
      tile.tn = 0;
      if (tile.s && !surfaceAllowed(tile.t, tile.s, true)) { tile.s = ''; tile.p = 0; }
    }
    if (flag === 'tn' && tile.tn && tile.v) { tile.tn = 0; return false; }
    this.version++;
    return true;
  }

  addDeco(d) {
    if (this.decos.length >= MAX_DECOS) return null;
    const deco = {
      k: d.k, x: +d.x, y: +d.y, z: +d.z, ry: +d.ry || 0, s: Math.max(0.2, Math.min(20, +d.s || 1)),
      c: d.c | 0, u: d.u ? String(d.u).slice(0, 400) : '',
    };
    if (!DECO_ORDER.includes(deco.k)) return null;
    this.decos.push(deco);
    this.version++;
    return deco;
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

  validate() {
    const errors = [];
    const starts = this.count('start');
    if (starts === 0) errors.push('Il faut une pièce « Départ ».');
    if (starts > 1) errors.push('Il ne peut y avoir qu’un seul départ.');
    if (this.count('finish') === 0) errors.push('Il faut au moins une pièce « Arrivée ».');
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

  // Surface roulable la plus haute sous (x, y + step, z). Le sol est à y = 0.
  surfaceAt(x, y, z, out, step = 1.6) {
    out.h = 0; out.nx = 0; out.ny = 1; out.nz = 0;
    out.tile = null; out.type = 'ground'; out.mod = ''; out.p = 0; out.lx = 0; out.lz = 0;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = -Infinity;
    for (const tile of this.tilesAt(cx, cz)) {
      if (!isFloor(tile)) continue;
      toLocal(tile, x, z, L);
      sampleLocal(tile, L.lx, L.lz, S);
      if (!S.inFootprint) continue;
      const p = PIECES[tile.t];
      if (p.kind !== 'area' && Math.abs(S.d) > ROAD_HALF) continue;
      if (S.h > y + step || S.h <= best) continue;
      best = S.h;
      out.h = S.h;
      rotVec(tile.r, S.nx, S.nz, W);
      out.nx = W.x; out.ny = S.ny; out.nz = W.z;
      out.tile = tile;
      out.type = 'road';
      out.mod = tile.s || '';
      out.p = tile.p || 0;
      out.lx = L.lx; out.lz = L.lz;
      if (tile.s === 'water') { out.h -= WATER_DROP; best = out.h; }
    }
    return out;
  }

  // Dessous de dalle (ou toit de tunnel) le plus bas au-dessus de yMin : sert à la caméra.
  ceilingAt(x, z, yMin) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = Infinity;
    for (const tile of this.tilesAt(cx, cz)) {
      const kind = PIECES[tile.t].kind;
      if (kind === 'loop' || kind === 'ribbon' || tile.v) continue;
      toLocal(tile, x, z, L);
      sampleLocal(tile, L.lx, L.lz, S);
      if (!S.inFootprint) continue;
      if (kind !== 'area' && Math.abs(S.d) > ROAD_HALF + RAIL_W + 0.5) continue;
      const under = tile.tn ? S.h + ROAD_HALF + RAIL_W + 0.9 : S.h - SLAB_T;
      if (under > yMin && under < best) best = under;
    }
    return best;
  }

  // Signature du contenu (pièces + décorations), utilisée pour la vérification.
  signature() {
    const parts = this.tiles
      .map((t) => `${t.t}:${t.x}:${t.z}:${t.l}:${t.r}:${t.s}:${t.p}:${t.v}${t.nb}${t.tn}`)
      .sort()
      .join('|');
    const d = this.decos.map((o) => `${o.k}:${o.x.toFixed(1)}:${o.z.toFixed(1)}:${o.s}`).join('|');
    return hashString(this.decor + '#' + parts + '#' + d + (this.laps > 1 ? '#L' + this.laps : ''));
  }

  get verified() {
    return this.vt > 0 && this.vh === this.signature();
  }

  setVerified(time) {
    this.vt = Math.round(time * 1000) / 1000;
    this.vh = this.signature();
  }

  // Médailles déduites du temps de l'auteur : bronze = son temps.
  get derivedMedals() {
    if (!this.verified) return null;
    const t = this.vt, r2 = (x) => Math.round(x * 100) / 100;
    return { bronze: r2(t), argent: r2(t * 0.93), or: r2(t * 0.86), cristal: r2(t * 0.8) };
  }

  clone() {
    const t = new Track(this.name, this.tiles);
    t.author = this.author;
    t.decor = this.decor;
    t.decos = this.decos.map((d) => ({ ...d }));
    t.vt = this.vt; t.vh = this.vh;
    t.laps = this.laps;
    return t;
  }

  // ---- Sérialisation -----------------------------------------------------
  encode() {
    const arr = [];
    for (const t of this.tiles) {
      arr.push(
        PIECE_ORDER.indexOf(t.t), t.x, t.z, t.l, t.r,
        Math.max(0, SURFACE_ORDER.indexOf(t.s || '')), t.p || 0,
        (t.v ? 1 : 0) | (t.nb ? 2 : 0) | (t.tn ? 4 : 0),
      );
    }
    const decos = this.decos.map((d) => [
      DECO_ORDER.indexOf(d.k), +d.x.toFixed(2), +d.y.toFixed(2), +d.z.toFixed(2), +d.ry.toFixed(3), +d.s.toFixed(2), d.c, d.u || 0,
    ]);
    const data = { v: 3, n: this.name, a: this.author || '', d: this.decor, t: arr };
    if (decos.length) data.o = decos;
    if (this.laps > 1) data.lp = this.laps;
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
    tr.decor = DECORS[data.d] ? data.d : 'desert';
    for (let i = 0; i < data.t.length; i += stride) {
      const type = PIECE_ORDER[data.t[i]];
      if (!type) continue;
      const tile = { t: type, x: data.t[i + 1], z: data.t[i + 2], l: data.t[i + 3], r: data.t[i + 4], s: '' };
      if (stride >= 6) tile.s = SURFACE_ORDER[data.t[i + 5]] || '';
      if (stride >= 8) {
        tile.p = data.t[i + 6];
        const f = data.t[i + 7] | 0;
        tile.v = f & 1; tile.nb = (f >> 1) & 1; tile.tn = (f >> 2) & 1;
      }
      if (tr.conflicts(Track.normalize(tile)).length) continue;
      tr.add(tile);
    }
    if (Array.isArray(data.o)) {
      for (const o of data.o.slice(0, MAX_DECOS)) {
        const k = DECO_ORDER[o[0]];
        if (!k) continue;
        const u = typeof o[7] === 'string' && /^https?:\/\//i.test(o[7]) ? o[7] : '';
        tr.addDeco({ k, x: o[1], y: o[2], z: o[3], ry: o[4], s: o[5], c: o[6], u });
      }
    }
    tr.laps = Math.max(1, Math.min(9, data.lp | 0 || 1));
    if (data.vt > 0 && data.vh) { tr.vt = +data.vt; tr.vh = String(data.vh); }
    return tr;
  }
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
// Suffixe de revêtement : .i verglas  .b accélérateur  .j rebond  .s sable  .m aimant
//   .u boue  .d dérive  .x ralentisseur  .w vent  .g gravité  .o plaque moto
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
//   suffixes : .a eau  .n plaque bateau  .e plaque deltaplane
const SURF_CODE = { i: 'ice', b: 'boost', j: 'bounce', s: 'sand', m: 'magnet', u: 'mud', d: 'drift', x: 'slow', w: 'wind', g: 'gravity', o: 'moto', a: 'water', n: 'boat', e: 'glider' };

export function scriptTrack(name, script, opts = {}) {
  const tr = new Track(name);
  tr.decor = opts.decor || 'desert';
  let x = opts.x || 0, z = opts.z || 0, h = opts.h || 0, l = opts.l || 0;
  const path = [];
  let cur = { s: '', p: 0, v: 0, nb: 0, tn: 0 };
  const place = (t, px, pz, lv, r, reverse = false, noPath = false, curOver = null) => {
    const tile = { t, x: px, z: pz, l: lv, r: r & 3, ...(curOver || cur) };
    if (cur.s && !surfaceAllowed(t, cur.s, !!cur.v)) throw new Error(`${name} : revêtement ${cur.s} interdit sur ${t}`);
    for (const f of ['v', 'nb', 'tn']) if (cur[f] && !flagAllowed(t, f, tile)) throw new Error(`${name} : drapeau ${f} interdit sur ${t}`);
    const c = tr.conflicts(Track.normalize(tile));
    if (c.length) throw new Error(`${name} : conflit en (${px}, ${pz}) niveau ${lv} [${t}]`);
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
    const m = /^([A-Za-z]+)(-?\d*)(?:\.([a-z])(\d*))?([\^_#]*)$/.exec(tok);
    if (!m) throw new Error('Instruction invalide : ' + tok);
    let op = m[1];
    const n = m[2] ? parseInt(m[2], 10) : 1;
    cur = { s: '', p: 0, v: m[5].includes('^') ? 1 : 0, nb: m[5].includes('_') ? 1 : 0, tn: m[5].includes('#') ? 1 : 0 };
    if (m[3]) {
      cur.s = SURF_CODE[m[3]];
      if (!cur.s) throw new Error('Revêtement inconnu : ' + tok);
      cur.p = m[4] ? parseInt(m[4], 10) : 0;
    }
    if (op === 'B') { op = 'S'; cur.s = 'boost'; }
    if (op === 'I') { op = 'S'; cur.s = 'ice'; }
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
      case 'TW': place('twist', x, z, l, h); adv(h); break;
      case 'TWB': place('twist', x, z, l, h + 2, true); adv(h); break;
      case 'QU': place('ramp90', x, z, l, h); adv(h); l += 2; break;
      case 'WA': for (let i = 0; i < n; i++) { place('wall', x, z, l, h); l += 1; } break;
      case 'CR': place('crest90', x, z, l, h); adv(h); l += 2; break;
      case 'U': for (let i = 0; i < n; i++) { place('slope', x, z, l, h); l += 1; adv(h); } break;
      case 'UU': place('steep', x, z, l, h); l += 2; adv(h); break;
      case 'D': for (let i = 0; i < n; i++) { l -= 1; place('slope', x, z, l, h + 2, true); adv(h); } break;
      case 'DD': l -= 2; place('steep', x, z, l, h + 2, true); adv(h); break;
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
