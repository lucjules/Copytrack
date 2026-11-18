// Audit du rendu (phase 0) : sondes géométriques. Elles MESURENT au lieu de regarder, sur toute la matrice (cas.mjs).
//   node tools/audit-rendu/sondes.mjs                  toutes les sondes, résumé à l'écran
//   node tools/audit-rendu/sondes.mjs --json=sortie.json   et le registre complet (un constat par ligne mesurée)
//   node tools/audit-rendu/sondes.mjs --sonde=poteaux      une seule sonde
// Chaque constat : { sonde, t, orient, opts, l, valeur (m ou nombre), msg }. Les sondes deviendront des tests de `npm test` une fois les défauts corrigés.
import { writeFileSync } from 'node:fs';
import { PIECES, SURFACES, sampleLocal, tileCenter, beltSpeed, tileParam } from '../../js/pieces.js';
import { SLAB_T, ROAD_HALF } from '../../js/constants.js';
import { Track } from '../../js/track.js';
import { GeoBuilder, FxBuilder } from '../../js/geo.js';
import { buildTileInto, pillarSpecs } from '../../js/trackGeometry.js';
import { FX_FRAG } from '../../js/trackMesh.js';
import { ribbonOf, frameLocal, centerlineWorld } from '../../js/ribbons.js';
import { pieceCases, surfaceVariants, PIECE_IDS } from './cas.mjs';
import { SONDES2 } from './sondes2.mjs';

const TERRAIN_Y = -0.02;          // le terrain est plat sous le circuit (scenery.js : heightAt = 0, posé 2 cm plus bas)
const r2 = (x) => Math.round(x * 100) / 100;
// Dessus du chapeau d'un poteau au point (dx, dz) ∈ [−2, 2]² : interpolation des quatre coins (cap : −x−z, +x−z, −x+z, +x+z), ou plat à `top`.
export const capTop = (P, dx, dz) => {
  if (!P.cap) return P.top;
  const u = (dx + 2) / 4, v = (dz + 2) / 4, c = P.cap;
  return (c[0] * (1 - u) + c[1] * u) * (1 - v) + (c[2] * (1 - u) + c[3] * u) * v;
};

export function build(tile, track = null) {
  const gb = new GeoBuilder(), glow = new GeoBuilder(), fx = new FxBuilder();
  buildTileInto(gb, glow, tile, track, fx);
  return { gb, glow, fx };
}

// ---- S1 : géométrie valide (sommets finis, triangles non dégénérés) ----------------------------------------------------------
function triStats(pos) {
  let bad = 0, flat = 0;
  for (let i = 0; i < pos.length; i += 9) {
    let finite = true;
    for (let k = 0; k < 9; k++) if (!Number.isFinite(pos[i + k])) finite = false;
    if (!finite) { bad++; continue; }
    const ux = pos[i + 3] - pos[i], uy = pos[i + 4] - pos[i + 1], uz = pos[i + 5] - pos[i + 2];
    const vx = pos[i + 6] - pos[i], vy = pos[i + 7] - pos[i + 1], vz = pos[i + 8] - pos[i + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (Math.hypot(cx, cy, cz) < 2e-6) flat++;
  }
  return { tris: pos.length / 9, bad, flat };
}

export function sondeGeometrie(cases, out, stats) {
  for (const c of cases) {
    let B;
    try { B = build(c.tile); } catch (e) { out.push({ sonde: 'geometrie', ...ref(c), valeur: 1, msg: 'la pièce ne se construit pas : ' + e.message }); continue; }
    const s = [B.gb.pos, B.glow.pos, B.fx.pos].map(triStats);
    const tris = s.reduce((a, x) => a + x.tris, 0), bad = s.reduce((a, x) => a + x.bad, 0), flat = s.reduce((a, x) => a + x.flat, 0);
    stats.tris = (stats.tris || 0) + tris; stats.flat = (stats.flat || 0) + flat; stats.built = (stats.built || 0) + 1;
    if (bad) out.push({ sonde: 'geometrie', ...ref(c), valeur: bad, msg: `${bad} triangle(s) avec un sommet non fini` });
    if (tris > (stats.maxTris || [0])[0]) stats.maxTris = [tris, c.t + ' ' + c.orient];
  }
}

// ---- S2 : chaussée ou marquage sous le terrain -------------------------------------------------------------------------------
// Route : bords et centre du ruban (ou de la ligne centrale) ; marquages et nappes animées : tous leurs sommets.
function roadMinY(tile) {
  const rib = ribbonOf(tile);
  let m = Infinity;
  if (rib) {
    const F = {};
    for (let i = 0; i <= 96; i++) {
      frameLocal(rib, i / 96, F);
      const hw = Math.min(F.hw || ROAD_HALF, F.wrap ? 0 : Infinity);      // tube : le fond seulement (la coque est mesurée à part)
      for (const sg of [-1, 0, 1]) m = Math.min(m, F.py + F.ry * sg * hw);
    }
  } else for (const p of centerlineWorld(tile, 64)) m = Math.min(m, p[1]);
  return m;
}

export function sondeSousTerrain(cases, out) {
  for (const c of cases) {
    let y;
    try { y = roadMinY(c.tile); } catch { continue; }
    if (y < TERRAIN_Y - 0.01) out.push({ sonde: 'sous-terrain', ...ref(c), valeur: r2(y), msg: `la chaussée descend à ${r2(y)} m, sous le terrain (${TERRAIN_Y} m), au niveau le plus bas permis` });
  }
}

// ---- S3 : poteaux --------------------------------------------------------------------------------------------------------------
// Chapeau (4 m × 4 m, dessus à `top`) contre le dessous de la dalle (chaussée − SLAB_T) mesuré par la route de la physique en 9 points du chapeau.
// > 5 cm au-dessus : le chapeau traverse la route ; > 30 cm au-dessous partout : le poteau ne touche pas la route (pièce qui flotte).
export function sondePoteaux(cases, out) {
  const S = {};
  for (const c of cases) {
    if (c.orient !== 'sol' || PIECES[c.t].kind === 'ribbon') continue;      // (rubans : leurs poteaux sont vérifiés par la sonde « supports »)
    const tile = Track.normalize({ ...c.tile, l: Math.max(c.tile.l, 3) });
    if (!Track.inBounds(tile)) continue;
    const ctr = tileCenter(tile);
    for (const P of pillarSpecs(tile)) {
      let poke = -Infinity, gapMin = Infinity;
      for (const dx of [-2, 0, 2]) for (const dz of [-2, 0, 2]) {
        sampleLocal(tile, P.lx + dx, P.lz + dz, S);
        if (!S.inFootprint) continue;
        const under = S.h - SLAB_T;
        const ct = capTop(P, dx, dz);
        poke = Math.max(poke, ct - under); gapMin = Math.min(gapMin, under - ct);
      }
      void ctr;
      if (poke > 0.05) out.push({ sonde: 'poteaux', ...ref(c, tile), valeur: r2(poke), msg: `le chapeau du poteau dépasse de ${r2(poke)} m à travers la route` });
      else if (gapMin > 0.3) out.push({ sonde: 'poteaux-flottants', ...ref(c, tile), valeur: r2(gapMin), msg: `le poteau s’arrête ${r2(gapMin)} m sous la route` });
    }
  }
}

// ---- S4 : marquages hors de la route -------------------------------------------------------------------------------------------
// Sommets des marquages (calque lumineux) comparés au bord de la route : sampleLocal donne d tel que |d| − ROAD_HALF = distance au bord (route étroite ou large comprise).
const FLOOR_KINDS = new Set(['line', 'arc', 'sbend']);
function overflow(tile, pos) {
  const ctr = tileCenter(tile), S = {};
  let m = 0;
  for (let i = 0; i < pos.length; i += 3) {
    sampleLocal(tile, pos[i] - ctr.x, pos[i + 2] - ctr.z, S);
    if (S.d == null) continue;
    m = Math.max(m, Math.abs(S.d) - ROAD_HALF);
  }
  return m;
}

export function sondeMarquages(cases, out) {
  const variants = surfaceVariants();
  for (const c of cases) {
    if (c.orient !== 'sol' || !FLOOR_KINDS.has(PIECES[c.t].kind)) continue;
    const base = overflow(c.tile, build(c.tile).glow.pos);
    let worst = 0, which = '';
    for (const v of variants) {
      const tile = Track.normalize({ ...c.tile, ...v });
      if (tile.s !== v.s) continue;
      const o = overflow(tile, build(tile).glow.pos) - Math.max(0, base);
      if (o > worst) { worst = o; which = SURFACES[v.s].label; }
    }
    if (worst > 0.3) out.push({ sonde: 'marquages', ...ref(c), valeur: r2(worst), msg: `les marquages (pire : ${which}) sortent de ${r2(worst)} m de la route` });
  }
}

// ---- S5 : sens du tapis roulant ------------------------------------------------------------------------------------------------
// Modèle du shader : la pointe suit le signe de la vitesse si le terme latéral est multiplié par beltDir (0.12.2), sinon elle vise toujours l'entrée.
const APEX_FOLLOWS_SPEED = FX_FRAG.includes('beltDir * abs(vFx.w)');
// Le shader (trackMesh.js) dessine des chevrons dont la POINTE est vers les abscisses (vFx.y) décroissantes, quelle que soit la vitesse,
// et les fait défiler vers les abscisses croissantes si la vitesse (vFx.z) est positive. On compare ces deux sens à la poussée de la physique.
export function sondeTapis(cases, out) {
  const S = {};
  for (const c of cases) {
    if (c.orient !== 'sol' || !FLOOR_KINDS.has(PIECES[c.t].kind) || PIECES[c.t].hw) continue;
    for (const p of [181, 21]) {
      const tile = Track.normalize({ ...c.tile, s: 'conveyor', p });
      const { fx } = build(tile), ctr = tileCenter(tile), P = fx.pos, A = fx.fx;
      let scrollOk = 0, scrollBad = 0, apexOk = 0, apexBad = 0;
      for (let i = 0; i + 8 < P.length; i += 9) {
        const j = (i / 3) * 4;
        const sp = A[j + 2];
        if (A[j] !== 1 || !sp) continue;
        // Direction des abscisses croissantes : du sommet 1 au sommet 2 (même écart latéral, abscisses s0 → s1 dans fxQuad).
        const dx = P[i + 6] - P[i + 3], dz = P[i + 8] - P[i + 5], dy = A[j + 9] - A[j + 5];
        const cx = (P[i] + P[i + 3] + P[i + 6]) / 3 - ctr.x, cz = (P[i + 2] + P[i + 5] + P[i + 8]) / 3 - ctr.z;
        sampleLocal(tile, cx, cz, S);
        const bs = beltSpeed(tileParam(tile));
        const push = (dx * S.gz + dz * -S.gx) * bs * Math.sign(dy);      // > 0 : la poussée va vers les abscisses croissantes
        if (Math.abs(push) < 1e-6) continue;
        const scroll = Math.sign(sp), apex = APEX_FOLLOWS_SPEED ? Math.sign(sp) : -1;
        if (Math.sign(push) === scroll) scrollOk++; else scrollBad++;
        if (Math.sign(push) === apex) apexOk++; else apexBad++;
      }
      const lab = p > 101 ? 'tapis qui avance' : 'tapis qui recule';
      if (scrollBad > scrollOk) out.push({ sonde: 'tapis', ...ref(c, tile), valeur: p, msg: `${lab} : la bande défile à contresens de la poussée` });
      if (apexBad > apexOk) out.push({ sonde: 'tapis', ...ref(c, tile), valeur: p, msg: `${lab} : les chevrons pointent à contresens de la poussée` });
    }
  }
}

function ref(c, tile = c.tile) {
  return { t: c.t, orient: c.orient, opts: c.opts, l: tile.l, ...(tile.s ? { s: tile.s, p: tile.p } : {}) };
}

export const SONDES = { geometrie: sondeGeometrie, 'sous-terrain': sondeSousTerrain, poteaux: sondePoteaux, marquages: sondeMarquages, tapis: sondeTapis, ...SONDES2 };

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => (process.argv.find((a) => a.startsWith('--' + k + '=')) || '').split('=')[1];
  const only = arg('sonde'), json = arg('json');
  const cases = pieceCases();
  const out = [], stats = {};
  const t0 = Date.now();
  for (const [name, fn] of Object.entries(SONDES)) {
    if (only && only !== name) continue;
    const n0 = out.length, t1 = Date.now();
    fn(cases, out, stats);
    console.log(`${name.padEnd(13)} ${String(out.length - n0).padStart(4)} constat(s)   (${((Date.now() - t1) / 1000).toFixed(1)} s)`);
  }
  console.log(`${PIECE_IDS.length} pièces, ${cases.length} combinaisons pièce × orientation` + (stats.built ? ` ; ${stats.built} construites, ${stats.tris} triangles (${stats.flat} plats), la plus lourde : ${stats.maxTris[1]} (${stats.maxTris[0]} triangles)` : '') + ` ; ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const by = {};
  for (const f of out) (by[f.sonde] = by[f.sonde] || []).push(f);
  for (const [k, list] of Object.entries(by)) {
    list.sort((a, b) => Math.abs(b.valeur) - Math.abs(a.valeur));
    console.log(`\n== ${k} : ${list.length}`);
    for (const f of list.slice(0, 12)) console.log(`  ${f.t.padEnd(14)} ${f.orient.padEnd(8)} niv ${String(f.l).padEnd(4)} ${f.msg}`);
    if (list.length > 12) console.log(`  … et ${list.length - 12} autres`);
  }
  if (json) { writeFileSync(json, JSON.stringify({ date: new Date().toISOString(), cases: cases.length, stats, constats: out }, null, 1)); console.log('\nregistre : ' + json); }
}
