// Solides (0.9.68) : décorations « en dur » que la voiture ne traverse pas. Étape 1 : piliers et poutres ; étape 2 : murs et blocs.
// Module pur (aucun rendu, aucun DOM) : la physique, le circuit et le rendu lisent la même description.
//
// Un solide se pose comme une décoration (x, y, z, cap ry, échelle s uniforme) ; il n'est jamais incliné ni roulé (rx = rz = 0).
// Il est fait de pièces élémentaires, dans SON repère (base à y = 0, avant échelle ; x en travers, z le long de la route, on roule vers −z) :
//   box  : pavé [x0, y0, z0, x1, y1, z1]
//   ramp : même emprise, dessus en pente : y0 au bord avant (z1, côté +z) jusqu'à y1 au bord arrière (z0) ; on y monte en roulant vers −z
//   pyr  : pyramide : base [x0, z0, x1, z1] à y0, sommet au centre à y1
//
// Trois contacts, tous calculés ici (fonctions déterministes : dcos / dsin, racines carrées) :
//   - les côtés : la sonde des bordures (physics/walls.js : _probe) les traite comme une bordure : même choc inélastique, même frottement ;
//   - le dessus : roulable (track/surfaces.js : surfaceAt), comme une route ; une marche de moins de CAR.step se monte ;
//   - le dessous : une voiture qui saute dessous s'y cogne la tête (physics/walls.js : _solidRoof).
import { dcos, dsin, hypot2 } from './dmath.js';

const B = (x0, y0, z0, x1, y1, z1) => ({ t: 'box', b: [x0, y0, z0, x1, y1, z1] });

export const SOLIDS = {
  // ---- Étape 1 : piliers et poutres (section 3,2 m pour un pilier, 1,6 m pour une poutre)
  pillar:     { label: 'Pilier', parts: [B(-1.6, 0, -1.6, 1.6, 12, 1.6)] },
  pillarBase: { label: 'Pilier sur socle', parts: [B(-2.8, 0, -2.8, 2.8, 1.2, 2.8), B(-1.6, 1.2, -1.6, 1.6, 12, 1.6)] },
  pillarThin: { label: 'Poteau', parts: [B(-0.6, 0, -0.6, 0.6, 6, 0.6)] },
  beam:       { label: 'Poutre', parts: [B(-8, 0, -0.8, 8, 1.6, 0.8)] },
  beamL:      { label: 'Poutre en L', parts: [B(-8, 0, -0.8, 0.8, 1.6, 0.8), B(-0.8, 0, -8, 0.8, 1.6, -0.8)] },
  beamT:      { label: 'Poutre en T', parts: [B(-8, 0, -0.8, 8, 1.6, 0.8), B(-0.8, 0, -8, 0.8, 1.6, -0.8)] },
  beamX:      { label: 'Poutre en croix', parts: [B(-8, 0, -0.8, 8, 1.6, 0.8), B(-0.8, 0, -8, 0.8, 1.6, -0.8), B(-0.8, 0, 0.8, 0.8, 1.6, 8)] },
  beamPost:   { label: 'Potence', parts: [B(-0.8, 0, -0.8, 0.8, 10, 0.8), B(-0.8, 10, -0.8, 12, 11.6, 0.8)] },
  gantry:     { label: 'Portique en poutres', parts: [B(-16.2, 0, -0.8, -14.6, 9, 0.8), B(14.6, 0, -0.8, 16.2, 9, 0.8), B(-16.2, 9, -0.8, 16.2, 10.6, 0.8)] },
};
export const SOLID_IDS = Object.keys(SOLIDS);
export const isSolid = (k) => !!SOLIDS[k];

// Échelle permise pour un solide (un pilier ×2 = 24 m ; une poutre ×4 = 64 m).
export const SOLID_SCALE = [0.25, 8];
// Marche qui se franchit sans choc (m) : un rebord plus bas que cela se monte (le sol porte alors la voiture), au-delà c'est un mur.
export const SOLID_STEP = 0.6;

// ---- Index spatial ------------------------------------------------------------------------------------------------------------------------------
// Cases de 16 m ; un solide est rangé dans toutes les cases que couvre son emprise (un mur long en occupe plusieurs). Chaque entrée garde ce que la
// physique relit à chaque pas : cos / sin du cap, échelle, altitude de base. Les cases gardent l'ordre du circuit.
export const SOLID_CELL = 16;
export const solidKey = (ix, iz) => ix * 1048576 + iz;
const fin = Number.isFinite;

export function solidEntry(d) {
  const def = SOLIDS[d.k];
  if (!def || !fin(d.x) || !fin(d.y) || !fin(d.z) || !fin(d.ry || 0) || !(d.s > 0)) return null;
  const c = dcos(d.ry || 0), s = dsin(d.ry || 0), k = d.s;
  let r = 0, top = -Infinity, bot = Infinity;
  for (const p of def.parts) {
    const [x0, y0, z0, x1, y1, z1] = p.b;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) r = Math.max(r, hypot2(x, z));
    top = Math.max(top, y1); bot = Math.min(bot, y0);
  }
  return { d, def, c, s, k, x: d.x, y: d.y, z: d.z, r: r * k, top: d.y + top * k, bottom: d.y + bot * k };
}

export function buildSolidGrid(decos) {
  const grid = new Map(), list = [];
  for (const d of decos) {
    if (!isSolid(d.k)) continue;
    const e = solidEntry(d);
    if (!e) continue;
    list.push(e);
    const i0 = Math.floor((e.x - e.r) / SOLID_CELL), i1 = Math.floor((e.x + e.r) / SOLID_CELL);
    const j0 = Math.floor((e.z - e.r) / SOLID_CELL), j1 = Math.floor((e.z + e.r) / SOLID_CELL);
    if (i1 - i0 > 64 || j1 - j0 > 64) continue;      // (échelle bornée : jamais atteint ; garde-fou contre un code fabriqué)
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const key = solidKey(i, j), b = grid.get(key);
      if (b) b.push(e); else grid.set(key, [e]);
    }
  }
  return { grid, list };
}

export function solidsAt(index, x, z) {
  return index.grid.get(solidKey(Math.floor(x / SOLID_CELL), Math.floor(z / SOLID_CELL)));
}

// Monde -> repère du solide (avant échelle).
function toLocal(e, wx, wz, out) {
  const dx = (wx - e.x) / e.k, dz = (wz - e.z) / e.k;
  out.x = dx * e.c - dz * e.s;
  out.z = dx * e.s + dz * e.c;
  return out;
}
// Vecteur du repère du solide -> monde (cap seulement).
function toWorldVec(e, x, z, out) {
  out.x = x * e.c + z * e.s;
  out.z = -x * e.s + z * e.c;
  return out;
}

// Hauteur (repère du solide) du dessus d'une pièce au point (x, z) de son emprise.
export function partTop(p, x, z) {
  const [x0, y0, z0, x1, y1, z1] = p.b;
  if (p.t === 'ramp') { const u = (z1 - z) / (z1 - z0); return y0 + (y1 - y0) * (u < 0 ? 0 : u > 1 ? 1 : u); }
  if (p.t === 'pyr') {
    const hx = (x1 - x0) / 2, hz = (z1 - z0) / 2, ux = Math.abs(x - (x0 + hx)) / hx, uz = Math.abs(z - (z0 + hz)) / hz;
    const m = ux > uz ? ux : uz;
    return y0 + (y1 - y0) * (1 - (m > 1 ? 1 : m));
  }
  return y1;
}

// Normale (repère du solide) du dessus d'une pièce en (x, z).
function partNormal(p, x, z, out) {
  const [x0, y0, z0, x1, y1, z1] = p.b;
  out.x = 0; out.y = 1; out.z = 0;
  if (p.t === 'ramp') {
    const k = (y1 - y0) / (z1 - z0), l = Math.sqrt(1 + k * k);
    out.y = 1 / l; out.z = k / l;
  } else if (p.t === 'pyr') {
    const hx = (x1 - x0) / 2, hz = (z1 - z0) / 2, ux = (x - (x0 + hx)) / hx, uz = (z - (z0 + hz)) / hz, H = y1 - y0;
    if (Math.abs(ux) > Math.abs(uz)) { const k = H / hx, l = Math.sqrt(1 + k * k); out.x = (ux > 0 ? k : -k) / l; out.y = 1 / l; }
    else { const k = H / hz, l = Math.sqrt(1 + k * k); out.z = (uz > 0 ? k : -k) / l; out.y = 1 / l; }
  }
  return out;
}

const LA = { x: 0, z: 0 }, LB = { x: 0, z: 0 }, WV = { x: 0, z: 0 }, NL = { x: 0, y: 0, z: 0 };

// Dessus roulable le plus haut sous (x, y + step, z) parmi les solides de l'index ; best : hauteur déjà trouvée (une route). Remplit `out` (comme
// Track.surfaceAt : h, normale, type 'road', sans pièce ni revêtement) et renvoie la nouvelle meilleure hauteur. hidden : décorations cachées par la logique.
export function solidFloor(index, x, y, z, step, best, out, hidden = null) {
  const bucket = solidsAt(index, x, z);
  if (!bucket) return best;
  for (let i = 0; i < bucket.length; i++) {
    const e = bucket[i];
    if (hidden && hidden.has(e.d)) continue;
    if (y + step < e.bottom) continue;
    toLocal(e, x, z, LA);
    const parts = e.def.parts;
    for (let j = 0; j < parts.length; j++) {
      const p = parts[j], b = p.b;
      if (LA.x < b[0] || LA.x > b[3] || LA.z < b[2] || LA.z > b[5]) continue;
      const h = e.y + partTop(p, LA.x, LA.z) * e.k;
      if (h > y + step || h <= best) continue;
      best = h;
      partNormal(p, LA.x, LA.z, NL);
      toWorldVec(e, NL.x, NL.z, WV);
      out.h = h; out.nx = WV.x; out.ny = NL.y; out.nz = WV.z;
      out.tile = null; out.type = 'road'; out.mod = ''; out.p = 0; out.lx = 0; out.lz = 0; out.solid = e.d;
    }
  }
  return best;
}

// Contact latéral d'une sonde (cercle de rayon R en (x, z), voiture de ylo à yhi ; (px, pz) : la même sonde au pas précédent, plo : son bas au pas
// précédent) avec les solides. Renvoie false, ou remplit `hit` comme la sonde des bordures : déplacement (dx, dz) qui ramène la sonde au contact, normale (nx, nz)
// vers l'extérieur. Une pièce dont le dessus est à moins de `step` au-dessus du bas de la voiture ne compte pas (elle se monte, ou la voiture est dessus).
export function solidSide(index, x, z, px, pz, ylo, yhi, plo, R, step, hit, hidden = null) {
  const bucket = solidsAt(index, x, z);
  if (!bucket) return false;
  for (let i = 0; i < bucket.length; i++) {
    const e = bucket[i];
    if (hidden && hidden.has(e.d)) continue;
    if (yhi < e.bottom + 0.2 || ylo > e.top) continue;
    const dx0 = x - e.x, dz0 = z - e.z, rr = e.r + R + 0.5;
    if (dx0 * dx0 + dz0 * dz0 > rr * rr) continue;
    toLocal(e, x, z, LA);
    toLocal(e, px, pz, LB);
    const r = R / e.k, parts = e.def.parts;
    for (let j = 0; j < parts.length; j++) {
      const p = parts[j], b = p.b;
      const qx = LA.x < b[0] ? b[0] : LA.x > b[3] ? b[3] : LA.x, qz = LA.z < b[2] ? b[2] : LA.z > b[5] ? b[5] : LA.z;
      const ddx = LA.x - qx, ddz = LA.z - qz, dist = hypot2(ddx, ddz);
      if (dist >= r) continue;
      // Hauteurs de la pièce au point de contact (monde).
      const lo = e.y + b[1] * e.k, top = e.y + partTop(p, qx, qz) * e.k;
      if (yhi < lo + 0.2 || ylo > top - 0.05) continue;
      if (ylo >= top - step || plo >= top - 0.3) continue;      // une marche qui se monte, ou la voiture arrive par-dessus : le sol s'en charge
      let nx, nz, push;
      if (dist > 1e-6) { nx = ddx / dist; nz = ddz / dist; push = r - dist; }
      else {
        // Centre de la sonde DANS la pièce : on la ressort par la face qu'elle a franchie (celle du côté du point précédent), sinon par la plus proche.
        const ex0 = LA.x - b[0], ex1 = b[3] - LA.x, ez0 = LA.z - b[2], ez1 = b[5] - LA.z;
        let f = 0, m = ex0;
        if (ex1 < m) { m = ex1; f = 1; }
        if (ez0 < m) { m = ez0; f = 2; }
        if (ez1 < m) { m = ez1; f = 3; }
        if (LB.x < b[0]) f = 0; else if (LB.x > b[3]) f = 1; else if (LB.z < b[2]) f = 2; else if (LB.z > b[5]) f = 3;
        nx = f === 0 ? -1 : f === 1 ? 1 : 0; nz = f === 2 ? -1 : f === 3 ? 1 : 0;
        push = (f === 0 ? ex0 : f === 1 ? ex1 : f === 2 ? ez0 : ez1) + r;
      }
      toWorldVec(e, nx, nz, WV);
      hit.nx = WV.x; hit.nz = WV.z;
      hit.dx = WV.x * push * e.k; hit.dz = WV.z * push * e.k;
      hit.solid = e.d;
      return true;
    }
  }
  return false;
}

// Dessous d'un solide au-dessus de la voiture : renvoie la hauteur du dessous de la pièce sous laquelle se trouve le point (x, z) quand la voiture
// (de ylo à yhi, haut précédent pyhi) vient de la toucher par en dessous ; NaN sinon.
export function solidCeiling(index, x, z, ylo, yhi, pyhi, hidden = null) {
  const bucket = solidsAt(index, x, z);
  if (!bucket) return NaN;
  for (let i = 0; i < bucket.length; i++) {
    const e = bucket[i];
    if (hidden && hidden.has(e.d)) continue;
    if (yhi < e.bottom || ylo > e.top) continue;
    toLocal(e, x, z, LA);
    const parts = e.def.parts;
    for (let j = 0; j < parts.length; j++) {
      const b = parts[j].b;
      if (LA.x < b[0] || LA.x > b[3] || LA.z < b[2] || LA.z > b[5]) continue;
      const lo = e.y + b[1] * e.k;
      if (yhi > lo && pyhi <= lo + 0.05) return lo;
    }
  }
  return NaN;
}
