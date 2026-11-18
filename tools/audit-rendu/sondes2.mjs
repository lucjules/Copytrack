// Audit du rendu (phase 1) : sondes de cohérence. Lancées par sondes.mjs avec les sondes de la phase 0 (même registre).
//   rendu-physique : la route DESSINÉE (bandes de sweep) contre la route de la PHYSIQUE (track.surfaceAt), au centre et près des bords, revêtements compris (eau, plaque bateau)
//   bords          : le bord dessiné de la chaussée contre le bord de la physique (|d| = ROAD_HALF)
//   facettes       : rubans (loopings, vrilles, tubes…) dessinés par cordes : écart entre la corde et la vraie route au milieu de chaque tronçon
//   emprise        : géométrie d'un ruban qui sort de la zone protégée des décors automatiques (cases de la pièce + une case autour)
//   largeur        : marquages d'une route large qui ne couvrent que le milieu
//   revetements    : chaque revêtement (24 variantes) et chaque option (tunnel, sans bordure, anneau, checkpoint, pièce mobile) se construit sur chaque pièce
//   decors         : chaque décor se construit ; posé à y = 0, il touche le sol (ni flottant ni enterré)
//   circuits       : circuits officiels et leçons de l'académie : route sous le terrain, chapeaux de poteaux, rubans en l'air sans support
//   tube           : la voiture en vol libre dans un tube (décrochée) traverse-t-elle la coque ? tombée sur le tube, se retrouve-t-elle dedans ?
import { PIECES, SURFACES, sampleLocal, tileCenter, isRibbon, baseY, LEGACY_TILE, arcParams } from '../../js/pieces.js';
import { ROAD_HALF, CELL, SLAB_T, RAIL_W } from '../../js/constants.js';
import { Track } from '../../js/track.js';
import { GeoBuilder, FxBuilder } from '../../js/geo.js';
import { buildTileInto, stripsFor, pillarSpecs } from '../../js/trackGeometry.js';
import { ribbonOf, frameLocal, ribbonExtent } from '../../js/ribbons.js';
import { WATER_DROP, boatDrop } from '../../js/track/shared.js';
import { buildDecoInto } from '../../js/decos.js';
import { DECO_ORDER } from '../../js/decoData.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../../js/tracks.js';
import { CarPhysics } from '../../js/physics.js';
import { surfaceVariants } from './cas.mjs';
import { capTop } from './sondes.mjs';

const r2 = (x) => Math.round(x * 100) / 100;
const ref = (c, tile = c.tile) => ({ t: c.t, orient: c.orient, opts: c.opts, l: tile.l, ...(tile.s ? { s: tile.s, p: tile.p } : {}) });
const FLOOR = new Set(['line', 'arc', 'sbend']);
const atF = (f, d, h = 0) => [f.p[0] + f.r[0] * d + f.u[0] * h, f.p[1] + f.r[1] * d + f.u[1] * h, f.p[2] + f.r[2] * d + f.u[2] * h];
// Décalage latéral tel que le dessine sweep (route de largeur variable : ce qui est au bord suit hw).
const dShift = (f, d) => (f.hw == null || Math.abs(d) < 1 ? d : d + Math.sign(d) * (f.hw - ROAD_HALF));

// ---- rendu-physique et bords -------------------------------------------------------------------------------------------------
export function sondeRenduPhysique(cases, out) {
  const OUT = {};
  for (const c of cases) {
    const P = PIECES[c.t];
    if (c.orient !== 'sol' || !FLOOR.has(P.kind) || P.special) continue;
    for (const s of ['', 'water', 'boat']) {
      const tile = Track.normalize({ ...c.tile, l: Math.max(c.tile.l, 2), s });
      if ((tile.s || '') !== s) continue;
      const tr = new Track('sonde', [tile]), T = tr.tiles[0];      // (le circuit range sa propre copie de la pièce)
      const ctr = tileCenter(tile);
      let worst = 0, edge = 0, wAt = null, checked = 0;
      for (let strip of stripsFor(tile)) {
        if (s === 'water') strip = strip.map((f) => ({ ...f, p: [f.p[0], f.p[1] - WATER_DROP, f.p[2]] }));
        if (s === 'boat' && (P.kind === 'line' || P.kind === 'arc')) {
          // (même rampe que boatRamp : rééchantillonnée en 12 tronçons pour une ligne courte)
          const n = strip.length - 1;
          strip = strip.map((f, i) => ({ ...f, p: [f.p[0], f.p[1] - boatDrop(i / n), f.p[2]] }));
        }
        const pts = [];
        for (let i = 0; i < strip.length; i++) for (const d of [-(ROAD_HALF - 0.8), 0, ROAD_HALF - 0.8]) pts.push(atF(strip[i], dShift(strip[i], d)));
        for (let i = 0; i + 1 < strip.length; i++) for (const d of [-(ROAD_HALF - 0.8), 0, ROAD_HALF - 0.8]) {
          const a = atF(strip[i], dShift(strip[i], d)), b = atF(strip[i + 1], dShift(strip[i + 1], d));
          pts.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
        }
        for (const q of pts) {
          const x = q[0] + ctr.x, z = q[2] + ctr.z;
          tr.surfaceAt(x, q[1] + 3, z, OUT, 6);
          if (OUT.tile !== T) continue;
          checked++;
          const dy = q[1] - OUT.h;
          if (Math.abs(dy) > Math.abs(worst)) { worst = dy; wAt = q; }
        }
        // Bord : le dernier point dessiné de la chaussée (d = ±hw) doit être sur le bord de la physique (|d| = ROAD_HALF).
        if (s === '') {
          const S = {};
          for (const f of strip) for (const sg of [-1, 1]) {
            const q = atF(f, dShift(f, sg * ROAD_HALF));
            sampleLocal(tile, q[0], q[2], S);
            if (!S.inFootprint || S.d == null) continue;
            edge = Math.max(edge, Math.abs(Math.abs(S.d) - ROAD_HALF));
          }
        }
      }
      if (!checked) out.push({ sonde: 'rendu-physique', ...ref(c, tile), valeur: 0, msg: 'aucun point de la route dessinée ne tombe sur la route de la physique' });
      if (Math.abs(worst) > 0.08) out.push({ sonde: 'rendu-physique', ...ref(c, tile), valeur: r2(worst), msg: `${s ? SURFACES[s].label + ' : ' : ''}la route dessinée est ${worst > 0 ? 'au-dessus' : 'au-dessous'} de la route de la physique de ${r2(Math.abs(worst))} m` + (wAt ? ` (point local ${wAt.map((v) => Math.round(v)).join(', ')})` : '') });
      if (edge > 0.15) out.push({ sonde: 'bords', ...ref(c, tile), valeur: r2(edge), msg: `le bord dessiné de la chaussée est à ${r2(edge)} m du bord de la physique` });
    }
  }
}

// ---- largeur de la route dessinée ----------------------------------------------------------------------------------------------
// Tous les sommets de la route (maillage plein : dalle, bordures) de chaque revêtement doivent rester entre les bords de la physique, bordures comprises
// (|d| − ROAD_HALF ≤ largeur des bordures). Attrape une route redessinée à la mauvaise largeur (plaque bateau sur route étroite, avant 0.12.2).
export function sondeLargeurRoute(cases, out) {
  const S = {};
  for (const c of cases) {
    const P = PIECES[c.t];
    if (c.orient !== 'sol' || !FLOOR.has(P.kind) || P.special || c.tile.l > 0.01 && !P.rise) continue;
    const ctr = tileCenter(c.tile);
    let worst = 0, which = '';
    for (const v of [{}].concat(surfaceVariants())) {
      const tile = Track.normalize({ ...c.tile, l: 0, ...v });
      if (v.s && tile.s !== v.s) continue;
      if (!Track.inBounds(tile)) continue;
      const gb = new GeoBuilder();
      buildTileInto(gb, new GeoBuilder(), tile, null, new FxBuilder());
      for (let i = 0; i < gb.pos.length; i += 3) {
        sampleLocal(tile, gb.pos[i] - ctr.x, gb.pos[i + 2] - ctr.z, S);
        if (S.d == null || !S.inFootprint) continue;
        const e = Math.abs(S.d) - ROAD_HALF - RAIL_W - 0.3;
        if (e > worst) { worst = e; which = v.s ? SURFACES[v.s].label : 'route normale'; }
      }
    }
    if (worst > 0.2) out.push({ sonde: 'largeur-route', ...ref(c), valeur: r2(worst), msg: `${which} : la route dessinée dépasse de ${r2(worst)} m le bord de la physique` });
  }
}

// ---- facettes des rubans -----------------------------------------------------------------------------------------------------
// Même découpage que stripsFor (ribbonStrip) : max(8, len / 2.5) tronçons, ou 56 par tour de looping.
export function sondeFacettes(cases, out) {
  const A = {}, B = {}, M = {};
  for (const c of cases) {
    const P = PIECES[c.t], tile = c.tile;
    const rib = ribbonOf(tile, true);
    if (!rib || !(P.kind === 'ribbon' || P.kind === 'loop' || tile.o)) continue;
    // Découpage réel du rendu : la bande roulée de stripsFor (pour un looping à plat, celle du milieu).
    const strips = stripsFor(tile), n = (P.kind === 'loop' && !tile.o ? strips[1] : strips[0]).length - 1;
    let worst = 0;
    for (let i = 0; i < n; i++) {
      frameLocal(rib, i / n, A); frameLocal(rib, (i + 1) / n, B); frameLocal(rib, (i + 0.5) / n, M);
      const hw = Math.min(M.hw || ROAD_HALF, M.wrap ? 6 : 99);
      for (const sg of [-1, 0, 1]) {
        const wa = sg * (A.hw || ROAD_HALF), wb = sg * (B.hw || ROAD_HALF), wm = sg * hw;
        const mx = (A.px + A.rx * wa + B.px + B.rx * wb) / 2, my = (A.py + A.ry * wa + B.py + B.ry * wb) / 2, mz = (A.pz + A.rz * wa + B.pz + B.rz * wb) / 2;
        const d = Math.hypot(mx - (M.px + M.rx * wm), my - (M.py + M.ry * wm), mz - (M.pz + M.rz * wm));
        if (!M.wrap || sg === 0) worst = Math.max(worst, d);
      }
    }
    if (worst > 0.25) out.push({ sonde: 'facettes', ...ref(c), valeur: r2(worst), msg: `dessiné par ${n} cordes : jusqu’à ${r2(worst)} m entre la route dessinée et la route de la physique` });
  }
}

// ---- emprise des rubans ------------------------------------------------------------------------------------------------------
export function sondeEmprise(cases, out) {
  for (const c of cases) {
    if (!isRibbon(c.tile)) continue;
    const e = ribbonExtent(c.tile);
    if (!e) continue;
    const half = PIECES[c.t].size * CELL / 2, safe = half + CELL;
    const over = Math.max(e.maxX - safe, -safe - e.minX, e.maxZ - safe, -safe - e.minZ);
    const overFoot = Math.max(e.maxX - half, -half - e.minX, e.maxZ - half, -half - e.minZ);
    if (over > 0.5) out.push({ sonde: 'emprise', ...ref(c), valeur: r2(over), msg: `la route sort de ${r2(over)} m de la zone sans décors automatiques` });
    else if (overFoot > 1) out.push({ sonde: 'emprise-cases', ...ref(c), valeur: r2(overFoot), msg: `la route déborde de ${r2(overFoot)} m hors des cases de la pièce (dans la case voisine)` });
  }
}

// ---- marquages des routes larges ---------------------------------------------------------------------------------------------
// Écart latéral brut au centre de la route (|x| pour une ligne, |distance au centre − R| pour un virage), rapporté à la demi-largeur hw.
function lateral(P, lx, lz) {
  if (P.kind === 'arc') { const a = arcParams(P), mir = P.mirror < 0 ? -1 : 1; return Math.abs(Math.hypot(mir * lx - a.cx, lz - a.cz) - a.R); }
  return Math.abs(lx);
}
export function sondeLargeur(cases, out) {
  for (const c of cases) {
    const P = PIECES[c.t];
    if (c.orient !== 'sol' || !P.hw || Math.max(...P.hw) <= ROAD_HALF || !(P.kind === 'line' || P.kind === 'arc')) continue;
    const ctr = tileCenter(c.tile), hw = Math.max(...P.hw);
    const base = new GeoBuilder();
    buildTileInto(new GeoBuilder(), base, Track.normalize({ ...c.tile }), null, new FxBuilder());
    for (const s of ['conveyor', 'magnet', 'slow']) {      // (bandes d'un bord à l'autre ; les flèches centrées gardent leur taille)
      const tile = Track.normalize({ ...c.tile, s });
      const glow = new GeoBuilder();
      buildTileInto(new GeoBuilder(), glow, tile, null, new FxBuilder());
      let m = 0;
      for (let i = base.pos.length; i < glow.pos.length; i += 3) m = Math.max(m, lateral(P, glow.pos[i] - ctr.x, glow.pos[i + 2] - ctr.z));
      if (m && m < hw * 0.75) out.push({ sonde: 'largeur', ...ref(c, tile), valeur: r2(m / hw), msg: `${SURFACES[s].label} : les marquages ne couvrent que ${Math.round((m / hw) * 100)} % de la demi-largeur (route de ${2 * hw} m)` });
    }
  }
}

// ---- revêtements et options --------------------------------------------------------------------------------------------------
const finite = (pos) => { for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) return false; return true; };
export function sondeRevetements(cases, out, stats) {
  const variants = surfaceVariants().concat([{ tn: 1 }, { nb: 1 }, { cp: 1 }, { cp: 2 }, { tb: 1 }, { mv: 1 }, { mv: 2 }, { mv: 3 }]);
  let built = 0;
  for (const c of cases) {
    for (const v of variants) {
      const tile = Track.normalize({ ...c.tile, ...v });
      const k = Object.keys(v)[0];
      if ((tile[k] || 0) !== (v[k] || 0)) continue;      // option refusée par la pièce
      try {
        const gb = new GeoBuilder(), glow = new GeoBuilder(), fx = new FxBuilder();
        buildTileInto(gb, glow, tile, null, fx);
        built++;
        if (!finite(gb.pos) || !finite(glow.pos) || !finite(fx.pos)) out.push({ sonde: 'revetements', ...ref(c, tile), valeur: 1, msg: `${JSON.stringify(v)} : sommets non finis` });
      } catch (e) { out.push({ sonde: 'revetements', ...ref(c, tile), valeur: 1, msg: `${JSON.stringify(v)} : ne se construit pas (${e.message})` }); }
    }
  }
  stats.revetements = built;
}

// ---- décors ------------------------------------------------------------------------------------------------------------------
export function sondeDecors(_cases, out, stats) {
  let n = 0;
  for (const k of DECO_ORDER) {
    const gb = new GeoBuilder(), glow = new GeoBuilder();
    try { buildDecoInto(gb, glow, { k, x: 0, y: 0, z: 0, s: 1, ry: 0 }); } catch (e) { out.push({ sonde: 'decors', t: k, orient: '-', l: 0, valeur: 1, msg: 'ne se construit pas : ' + e.message }); continue; }
    n++;
    const pos = gb.pos.concat(glow.pos);
    if (!pos.length) { out.push({ sonde: 'decors', t: k, orient: '-', l: 0, valeur: 0, msg: 'aucune géométrie (décor spécial : image, lumière ou effet)' }); continue; }
    if (!finite(pos)) { out.push({ sonde: 'decors', t: k, orient: '-', l: 0, valeur: 1, msg: 'sommets non finis' }); continue; }
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < pos.length; i += 3) { minY = Math.min(minY, pos[i]); maxY = Math.max(maxY, pos[i]); }
    if (minY > 0.15) out.push({ sonde: 'decors-flottants', t: k, orient: '-', l: 0, valeur: r2(minY), msg: `posé au sol, le décor commence ${r2(minY)} m au-dessus (hauteur ${r2(maxY)} m)` });
    else if (minY < -0.6 && maxY > 0) out.push({ sonde: 'decors-enterres', t: k, orient: '-', l: 0, valeur: r2(minY), msg: `posé au sol, ${r2(-minY)} m du décor sont sous le sol (hauteur visible ${r2(maxY)} m)` });
  }
  stats.decors = n;
}

// ---- circuits officiels ------------------------------------------------------------------------------------------------------
function roadMin(tile) {
  const rib = ribbonOf(tile);
  if (!rib) return Infinity;
  const F = {};
  let m = Infinity;
  for (let i = 0; i <= 64; i++) { frameLocal(rib, i / 64, F); const hw = F.wrap ? 0 : F.hw || ROAD_HALF; for (const sg of [-1, 1]) m = Math.min(m, F.py + F.ry * sg * hw); }
  return m;
}
export function sondeCircuits(_cases, out, stats) {
  const S = {};
  let nt = 0;
  for (const def of BUILTIN_TRACKS) {
    let tr;
    try { tr = buildBuiltin(def); } catch { continue; }
    nt++;
    const name = def.name || def.id;
    for (const tile of tr.tiles) {
      if (LEGACY_TILE[tile.t] || !PIECES[tile.t]) continue;
      const m = roadMin(tile);
      if (m < -0.05) out.push({ sonde: 'circuits', t: tile.t, orient: name, l: tile.l, valeur: r2(m), msg: `${name} : ${PIECES[tile.t].label} (${tile.x}, ${tile.z}) passe sous le terrain (${r2(m)} m)` });
      for (const P of PIECES[tile.t].kind === 'ribbon' ? [] : pillarSpecs(tile, tr)) {      // (rubans : sonde « supports »)
        let poke = -Infinity;
        for (const dx of [-2, 0, 2]) for (const dz of [-2, 0, 2]) { sampleLocal(tile, P.lx + dx, P.lz + dz, S); if (S.inFootprint) poke = Math.max(poke, capTop(P, dx, dz) - (S.h - SLAB_T)); }
        if (poke > 0.05) out.push({ sonde: 'circuits', t: tile.t, orient: name, l: tile.l, valeur: r2(poke), msg: `${name} : poteau de ${PIECES[tile.t].label} (${tile.x}, ${tile.z}) qui dépasse de ${r2(poke)} m` });
      }
      if (PIECES[tile.t].kind === 'ribbon' && !tile.o && !tile.v && baseY(tile) > 3 && !pillarSpecs(tile, tr).length) out.push({ sonde: 'circuits-air', t: tile.t, orient: name, l: tile.l, valeur: r2(baseY(tile)), msg: `${name} : ${PIECES[tile.t].label} (${tile.x}, ${tile.z}) à ${r2(baseY(tile))} m sans aucun support` });
    }
  }
  stats.circuits = nt;
}

// ---- supports des rubans ------------------------------------------------------------------------------------------------------
// Chaque ruban posé au niveau 3 (à plat) a au moins un poteau, sauf ceux qui n'ont aucun passage à plat (mur vertical, sommet de looping…).
export function sondeSupports(cases, out) {
  const F = {};
  for (const c of cases) {
    if (c.orient !== 'sol' || PIECES[c.t].kind !== 'ribbon') continue;
    const tile = Track.normalize({ ...c.tile, l: Math.max(3, c.tile.l) });
    if (!Track.inBounds(tile)) continue;
    const rib = ribbonOf(tile, true);
    let flat = false;
    for (let i = 1; i < 24; i++) { frameLocal(rib, i / 24, F); if (F.ny >= 0.8) flat = true; }
    if (flat && !pillarSpecs(tile).length) out.push({ sonde: 'supports', ...ref(c, tile), valeur: r2(baseY(tile)), msg: `posé à ${r2(baseY(tile))} m, aucun poteau` });
  }
}

// ---- tube : la voiture décrochée et la coque ---------------------------------------------------------------------------------
// Le tube (crossSweep) est une coque de rayon 1 / kc autour de l'axe (centre de la section = point bas + n / kc).
export function sondeTube(_cases, out) {
  // Voiture posée en vol libre en (x, y, z) avec la vitesse v (place() la recolle au sol : on la remet en l'air à la main).
  const fly = (tr, x, y, z, v) => {
    const ph = new CarPhysics(tr);
    ph.place(x, y, z, 0);
    ph.pos.x = ph.prev.x = x; ph.pos.y = ph.prev.y = y; ph.pos.z = ph.prev.z = z;
    ph.grounded = false; ph.graceT = 0; ph.vel.x = v[0]; ph.vel.y = v[1]; ph.vel.z = v[2];
    return ph;
  };
  for (const t of ['tube', 'tubeMid', 'tubeTurn']) {
    if (!PIECES[t]) continue;
    const tile = Track.normalize({ t, x: 0, z: 0, l: 2, r: 0 });
    const tr = new Track('tube', [tile]), T = tr.tiles[0];
    const rib = ribbonOf(T), F = {};
    frameWorldLocal(T, rib, 0.5, F);
    if (!F.kc) continue;
    const R = 1 / F.kc, ax = [F.px + F.nx * R, F.py + F.ny * R, F.pz + F.nz * R];
    const radial = (p) => { const dx = p.x - ax[0], dy = p.y - ax[1], dz = p.z - ax[2], a = dx * F.tx + dy * F.ty + dz * F.tz; return Math.hypot(dx - F.tx * a, dy - F.ty * a, dz - F.tz * a); };
    const near = (p) => Math.abs((p.x - ax[0]) * F.tx + (p.y - ax[1]) * F.ty + (p.z - ax[2]) * F.tz) < 12;
    // 1) Décrochée près du haut, lancée vers le haut : sort-elle de la coque ?
    let ph = fly(tr, ax[0] + F.rx * 1, ax[1] + R - 2.5, ax[2] + F.rz * 1, [F.tx * 6, 9, F.tz * 6]);
    let maxR = 0;
    for (let i = 0; i < 240; i++) { ph.step({}); if (near(ph.pos)) maxR = Math.max(maxR, radial(ph.pos)); }
    if (maxR > R + 0.5) out.push({ sonde: 'tube', t, orient: 'sol', l: tile.l, valeur: r2(maxR - R), msg: `décrochée en haut du tube, la voiture traverse la coque (jusqu’à ${r2(maxR - R)} m au-delà de la paroi)` });
    // 2) Tombée sur le dessus du tube depuis l'extérieur : où finit-elle ?
    ph = fly(tr, ax[0], ax[1] + R + 4, ax[2], [F.tx * 2, 0, F.tz * 2]);
    let inside = false;
    for (let i = 0; i < 360; i++) { ph.step({}); if (near(ph.pos) && radial(ph.pos) < R - 1.5) inside = true; }
    if (inside) out.push({ sonde: 'tube', t, orient: 'sol', l: tile.l, valeur: 1, msg: 'tombée sur le dessus du tube, la voiture passe à travers la coque et se retrouve dedans' });
  }
}
// Repère monde du milieu d'un ruban (pièce non tournée : monde = centre + local).
function frameWorldLocal(tile, rib, u, F) {
  frameLocal(rib, u, F);
  const c = tileCenter(tile);
  F.px += c.x; F.pz += c.z;
  return F;
}

export const SONDES2 = {
  'rendu-physique': sondeRenduPhysique, 'largeur-route': sondeLargeurRoute, facettes: sondeFacettes, emprise: sondeEmprise, largeur: sondeLargeur,
  revetements: sondeRevetements, decors: sondeDecors, circuits: sondeCircuits, supports: sondeSupports, tube: sondeTube,
};
