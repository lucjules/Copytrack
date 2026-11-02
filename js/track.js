// Modèle de circuit : liste de pièces posées sur une grille, index spatial,
// requêtes de surface pour la physique, sérialisation en code partageable.
import { CELL, DIRS, ROAD_HALF, RAIL_W, SLAB_T, MAX_LEVEL, LEVEL_H } from './constants.js';
import {
  PIECES, PIECE_ORDER, SURFACE_ORDER, LEGACY_SURFACE, surfaceAllowed,
  toLocal, sampleLocal, rotVec, centerlineWorld,
} from './pieces.js';

export const DECORS = {
  desert: { label: 'Désert crépuscule' },
  polar: { label: 'Nuit polaire' },
};

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
    this.index = new Map();
    this.version = 0;
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

  // Convertit une pièce (éventuellement au format v1.0) en pièce v1.1.
  static normalize(t) {
    let type = t.t, s = t.s || '';
    if (LEGACY_SURFACE[type]) { s = LEGACY_SURFACE[type]; type = 'straight'; }
    if (!PIECES[type]) throw new Error('Pièce inconnue : ' + type);
    if (!surfaceAllowed(type, s)) s = '';
    return { t: type, x: t.x | 0, z: t.z | 0, l: Math.max(0, Math.min(MAX_LEVEL, t.l | 0)), r: t.r & 3, s };
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

  setSurface(tile, s) {
    if (!surfaceAllowed(tile.t, s) || tile.s === s) return false;
    tile.s = s;
    this.version++;
    return true;
  }

  clear() {
    this.tiles = [];
    this.index.clear();
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
    out.tile = null; out.type = 'ground'; out.mod = ''; out.lx = 0; out.lz = 0;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = -Infinity;
    for (const tile of this.tilesAt(cx, cz)) {
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
      out.lx = L.lx; out.lz = L.lz;
    }
    return out;
  }

  // Dessous de dalle le plus bas au-dessus de yMin (pour la caméra sous les ponts).
  ceilingAt(x, z, yMin) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = Infinity;
    for (const tile of this.tilesAt(cx, cz)) {
      if (PIECES[tile.t].kind === 'loop') continue;
      toLocal(tile, x, z, L);
      sampleLocal(tile, L.lx, L.lz, S);
      if (!S.inFootprint) continue;
      if (PIECES[tile.t].kind !== 'area' && Math.abs(S.d) > ROAD_HALF + RAIL_W + 0.5) continue;
      const under = S.h - SLAB_T;
      if (under > yMin && under < best) best = under;
    }
    return best;
  }

  clone() {
    const t = new Track(this.name, this.tiles);
    t.author = this.author;
    t.decor = this.decor;
    return t;
  }

  // ---- Sérialisation -----------------------------------------------------
  encode() {
    const arr = [];
    for (const t of this.tiles) {
      arr.push(PIECE_ORDER.indexOf(t.t), t.x, t.z, t.l, t.r, Math.max(0, SURFACE_ORDER.indexOf(t.s || '')));
    }
    const json = JSON.stringify({ v: 2, n: this.name, a: this.author || '', d: this.decor, t: arr });
    return 'SHW2:' + b64encode(json);
  }

  // Accepte les codes v1.0 (SHW1) et v1.1 (SHW2), bruts ou dans un lien.
  static decode(code) {
    let s = String(code || '').trim();
    const hash = s.indexOf('#t=');
    if (hash >= 0) s = s.slice(hash + 3);
    s = decodeURIComponent(s);
    if (/^SHW\d:/.test(s)) s = s.slice(5);
    const data = JSON.parse(b64decode(s));
    const stride = data && data.v >= 2 ? 6 : 5;
    if (!data || !Array.isArray(data.t) || data.t.length % stride) throw new Error('Code de circuit invalide');
    const tr = new Track(String(data.n || 'Circuit importé').slice(0, 40));
    tr.author = String(data.a || '').slice(0, 30);
    tr.decor = DECORS[data.d] ? data.d : 'desert';
    for (let i = 0; i < data.t.length; i += stride) {
      const type = PIECE_ORDER[data.t[i]];
      if (!type) continue;
      const tile = {
        t: type, x: data.t[i + 1], z: data.t[i + 2], l: data.t[i + 3], r: data.t[i + 4],
        s: stride === 6 ? SURFACE_ORDER[data.t[i + 5]] || '' : '',
      };
      if (tr.conflicts(Track.normalize(tile)).length) continue;
      tr.add(tile);
    }
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
//   G2                  vide de 2 cases (saut)       V-2  change le niveau
// Suffixe de revêtement : .i verglas  .b accélérateur  .j rebond  .s sable  .m aimant
//   ex. "S3.i" = 3 droites verglacées, "RR.b" = grand virage accélérateur.
// Raccourcis historiques : B = S.b, I = S.i.
const SURF_CODE = { i: 'ice', b: 'boost', j: 'bounce', s: 'sand', m: 'magnet' };

export function scriptTrack(name, script, opts = {}) {
  const tr = new Track(name);
  tr.decor = opts.decor || 'desert';
  let x = opts.x || 0, z = opts.z || 0, h = opts.h || 0, l = opts.l || 0;
  const path = [];
  let surf = '';
  const place = (t, px, pz, lv, r, reverse = false) => {
    const tile = { t, x: px, z: pz, l: lv, r: r & 3, s: surf };
    if (surf && !surfaceAllowed(t, surf)) throw new Error(`${name} : revêtement ${surf} interdit sur ${t}`);
    const c = tr.conflicts(Track.normalize(tile));
    if (c.length) throw new Error(`${name} : conflit en (${px}, ${pz}) niveau ${lv} [${t}]`);
    const added = tr.add(tile);
    const pts = centerlineWorld(added, PIECES[t].size === 2 ? 12 : 6, reverse);
    if (path.length) pts.shift();
    path.push(...pts);
    return added;
  };
  const adv = (dir, n = 1) => { x += DIRS[dir][0] * n; z += DIRS[dir][1] * n; };
  const rot = (r, lx, lz) => rotVec(r, lx, lz, { x: 0, z: 0 });
  // Pièce 2x2 : ancre à partir du centre de bloc (en cases) relatif à la case d'entrée.
  const anchor2 = (r, ox, oz) => {
    const c = rot(r, ox, oz);
    return [Math.round(x + 0.5 + c.x - 1), Math.round(z + 0.5 + c.z - 1)];
  };

  for (const tok of script.trim().split(/\s+/)) {
    const m = /^([A-Za-z]+)(-?\d*)(?:\.([a-z]))?$/.exec(tok);
    if (!m) throw new Error('Instruction invalide : ' + tok);
    let op = m[1];
    const n = m[2] ? parseInt(m[2], 10) : 1;
    surf = m[3] ? SURF_CODE[m[3]] : '';
    if (m[3] && !surf) throw new Error('Revêtement inconnu : ' + tok);
    if (op === 'B') { op = 'S'; surf = 'boost'; }
    if (op === 'I') { op = 'S'; surf = 'ice'; }
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
        const [ax, az] = anchor2(h, 0.5, -0.5);
        place('bigcurve', ax, az, l, h);
        const nx = rot(h, 2, -1);
        x += nx.x; z += nx.z; h = (h + 1) & 3;
        break;
      }
      case 'LL': {
        const r = (h + 1) & 3;
        const [ax, az] = anchor2(r, -0.5, 0.5);
        place('bigcurve', ax, az, l, r, true);
        const nx = rot(r, -1, 2);
        x += nx.x; z += nx.z; h = (h + 3) & 3;
        break;
      }
      case 'O': {
        const [ax, az] = anchor2(h, 0.5, -0.5);
        place('loop', ax, az, l, h);
        const nx = rot(h, 1, -2);
        x += nx.x; z += nx.z;
        break;
      }
      case 'OL': {
        const [ax, az] = anchor2(h, -0.5, -0.5);
        place('loopL', ax, az, l, h);
        const nx = rot(h, -1, -2);
        x += nx.x; z += nx.z;
        break;
      }
      case 'U': for (let i = 0; i < n; i++) { place('slope', x, z, l, h); l += 1; adv(h); } break;
      case 'UU': place('steep', x, z, l, h); l += 2; adv(h); break;
      case 'D': for (let i = 0; i < n; i++) { l -= 1; place('slope', x, z, l, h + 2, true); adv(h); } break;
      case 'DD': l -= 2; place('steep', x, z, l, h + 2, true); adv(h); break;
      case 'G': adv(h, n); break;
      case 'V': l += n; break;
      default: throw new Error('Instruction inconnue : ' + op);
    }
  }
  tr.path = path;
  return tr;
}
