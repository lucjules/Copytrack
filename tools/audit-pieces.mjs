// Audit du graphe des pièces : node tools/audit-pieces.mjs   (utilisé aussi par tools/test-v093.mjs)
//
// Pour chaque pièce de route (ligne, virage, ruban) et chaque orientation (sol, mur gauche, mur droit) on relève, dans le repère de la pièce,
// l'état de la route à l'ENTRÉE et à la SORTIE : pente (tan de l'inclinaison), roulis ψ autour de l'axe (0 sol, ±90° mur, ±180° plafond),
// dénivelé, virage et position de la sortie par rapport à l'entrée. De là :
//   - classes de raccord : une sortie (pente, ψ) se raccorde SANS cassure à toute entrée de même (pente, ψ). Une sortie que plus aucune
//     pièce n'accepte est un cul-de-sac (sauf les tremplins, voulus : la route se termine en l'air) ;
//   - inversions : toute pièce se parcourt aussi à l'envers. La pièce « inverse » (entrée et sortie échangées, pentes et roulis opposés)
//     doit exister, sinon il manque une pièce (ex. une descente pour chaque montée, une transition mur → sol pour sol → mur) ;
//   - cassures : angle (degrés) entre une sortie et l'entrée la plus proche de même roulis, pour repérer les raccords doux manquants.
import { PIECES, PIECE_ORDER, LEGACY_TILE } from '../js/pieces.js';
import { Track } from '../js/track.js';
import { ribbonOf, frameLocal, floorCenter } from '../js/ribbons.js';

const R6 = (x) => Math.round(x * 1e6) / 1e6 + 0;           // + 0 : pas de -0
const DEG = 180 / Math.PI;
// Sorties volontairement « en l'air » : les tremplins et les rampes verticales ne se raccordent à rien de plat.
const JUMPS = new Set(['steep', 'steep4', 'ramp90', 'wall', 'crest90']);
// Pièces volontairement à sens unique : la vrille se prend à l'envers en la tournant de 180° (vrille inverse), elle n'a pas de pièce à part.
export const ONE_WAY = new Set(['twist']);

// Pièces auditées : toutes les lignes et tous les virages (pentes, descentes, raccords, virages inclinés), les transitions d'orientation et
// la vrille. Les autres rubans (virage relevé, tire-bouchon, montée en L...) existent depuis longtemps et ont leurs propres raccords.
export function roadPieces() {
  return PIECE_ORDER.filter((id) => PIECES[id] && !LEGACY_TILE[id] && !PIECES[id].special
    && (PIECES[id].kind === 'line' || PIECES[id].kind === 'arc' || PIECES[id].roll || id === 'twist'));
}

// Repère de la route (tangente t exacte, normale n) en un point (u de 0 à 1), dans le repère local de la pièce.
function frameAt(tile, u) {
  const P = PIECES[tile.t];
  if (P.kind === 'line' || P.kind === 'arc') {
    const C = {}; floorCenter(tile, u, C);
    const t = [C.tx, C.ty, C.tz], hl = Math.hypot(t[0], t[2]) || 1;
    // Route à plat : la normale est le haut de la route (tournée de la pente) ; sur un mur elle est roulée de ±90° autour de t.
    const up = [-t[0] * t[1] / hl, hl, -t[2] * t[1] / hl], r = [t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0]];
    const psi = tile.o === 1 ? Math.PI / 2 : tile.o === 2 ? -Math.PI / 2 : 0, c = Math.cos(psi), sn = Math.sin(psi);
    return { p: [C.x, C.y, C.z], t, n: [c * up[0] + sn * r[0], c * up[1] + sn * r[1], c * up[2] + sn * r[2]] };
  }
  const F = {}; frameLocal(ribbonOf(tile, true), u, F);
  return { p: [F.px, F.py, F.pz], t: [F.tx, F.ty, F.tz], n: [F.nx, F.ny, F.nz] };
}

// Roulis ψ de la normale n autour de la tangente t (0 : au sol, +90° : mur à gauche, ±180° : plafond).
function roll(t, n) {
  let ux = -t[0] * t[1], uy = 1 - t[1] * t[1], uz = -t[2] * t[1];
  const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
  const r = [t[1] * uz - t[2] * uy, t[2] * ux - t[0] * uz, t[0] * uy - t[1] * ux];
  return Math.atan2(n[0] * r[0] + n[1] * r[1] + n[2] * r[2], n[0] * ux + n[1] * uy + n[2] * uz);
}

function portOf(F) {
  const hl = Math.hypot(F.t[0], F.t[2]);
  const psi = Math.round(roll(F.t, F.n) * DEG * 1000) / 1000 + 0;
  return { slope: R6(F.t[1] / hl), psi: psi === -180 ? 180 : psi, heading: Math.atan2(-F.t[0], -F.t[2]) };
}

export function describe(id, o = 0) {
  const tile = Track.normalize({ t: id, x: 0, z: 0, l: 8, r: 0, o });
  if ((o | 0) !== tile.o) return null;                                  // orientation impossible sur cette pièce
  const A = frameAt(tile, 0), B = frameAt(tile, 1), a = portOf(A), b = portOf(B);
  const d = [B.p[0] - A.p[0], B.p[1] - A.p[1], B.p[2] - A.p[2]];
  const fwd = [-Math.sin(a.heading), -Math.cos(a.heading)], rgt = [Math.cos(a.heading), -Math.sin(a.heading)];
  let turn = (b.heading - a.heading) * DEG;
  turn = ((turn + 540) % 360) - 180;
  return {
    id, o: tile.o, size: PIECES[id].size,
    entry: { slope: a.slope, psi: a.psi }, exit: { slope: b.slope, psi: b.psi },
    rise: R6(d[1]), turn: Math.round(turn * 100) / 100 + 0, dr: R6(d[0] * rgt[0] + d[2] * rgt[1]), df: R6(d[0] * fwd[0] + d[2] * fwd[1]),
  };
}

// Signature d'un parcours (pour comparer une pièce à l'inverse d'une autre) : le miroir échange gauche et droite (ψ, virage, déport).
const sigOf = (d) => [d.size, d.entry.slope, d.entry.psi, d.exit.slope, d.exit.psi, d.rise, d.turn, d.dr, R6(d.df)].map((x) => (typeof x === 'number' ? Math.round(x * 1e3) / 1e3 + 0 : x)).join('|');
const mirror = (d) => ({ ...d, entry: { ...d.entry, psi: -d.entry.psi + 0 }, exit: { ...d.exit, psi: -d.exit.psi + 0 }, turn: -d.turn + 0, dr: -d.dr + 0 });
const normPsi = (x) => (Math.abs(Math.abs(x) - 180) < 1e-6 ? 180 : x);
function reverse(d) {
  // Parcours à l'envers : la pente change de signe, le roulis aussi (la droite devient la gauche), le virage s'inverse, la montée devient descente.
  // La sortie vue de l'entrée inversée : on retrouve (dr, df) dans le repère de l'ancienne sortie.
  const th = d.turn / DEG;
  const dr = d.dr * Math.cos(th) + d.df * Math.sin(th), df = -d.dr * Math.sin(th) + d.df * Math.cos(th);
  return {
    ...d,
    entry: { slope: -d.exit.slope + 0, psi: normPsi(-d.exit.psi + 0) }, exit: { slope: -d.entry.slope + 0, psi: normPsi(-d.entry.psi + 0) },
    rise: -d.rise + 0, turn: -d.turn + 0, dr: R6(dr), df: R6(df),
  };
}

export function auditPieces() {
  const all = [];
  for (const id of roadPieces()) for (const o of [0, 1, 2]) { const d = describe(id, o); if (d) all.push(d); }
  const bySig = new Map();
  for (const d of all) { const k = sigOf(d); if (!bySig.has(k)) bySig.set(k, []); bySig.get(k).push(d); }
  // Inversions manquantes : la pièce inverse (ou son miroir) doit exister.
  const missingReverse = [];
  for (const d of all) {
    const r = reverse(d);
    if (!bySig.has(sigOf(r)) && !bySig.has(sigOf(mirror(r))) && !ONE_WAY.has(d.id)) missingReverse.push(d);
  }
  // Classes de raccord.
  const key = (p) => `${p.slope}|${p.psi}`;
  const entries = new Map(), exits = new Map();
  for (const d of all) {
    if (!entries.has(key(d.entry))) entries.set(key(d.entry), []);
    entries.get(key(d.entry)).push(d);
    if (!exits.has(key(d.exit))) exits.set(key(d.exit), []);
    exits.get(key(d.exit)).push(d);
  }
  const deadEnds = [];
  for (const [k, list] of exits) if (!entries.has(k) && !list.every((d) => JUMPS.has(d.id))) deadEnds.push({ port: k, pieces: list.map((d) => d.id + (d.o ? `:${d.o}` : '')) });
  // Pentes d'extrémité qui n'ont aucun raccord doux : sortie de pente non nulle sans pièce qui la ramène à plat sans cassure.
  const noSoftLanding = [];
  for (const [k, list] of exits) {
    const [slope, psi] = k.split('|').map(Number);
    if (Math.abs(slope) < 1e-9) continue;
    const soft = (entries.get(k) || []).filter((d) => Math.abs(d.exit.slope) < 1e-9);
    if (!soft.length) noSoftLanding.push({ port: k, slope, psi, pieces: [...new Set(list.map((d) => d.id))] });
  }
  return { all, missingReverse, entries, exits, deadEnds, noSoftLanding };
}

// ---- Rapport ---------------------------------------------------------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith('audit-pieces.mjs')) {
  const A = auditPieces();
  const fmt = (p) => `pente ${String(p.slope).padStart(5)} ψ ${String(p.psi).padStart(5)}°`;
  console.log(`Audit du graphe des pièces : ${A.all.length} pièces de route × orientations\n`);
  console.log('id'.padEnd(10), 'o', 'entrée'.padEnd(22), 'sortie'.padEnd(22), 'dénivelé'.padStart(8), 'virage'.padStart(7));
  for (const d of A.all) console.log(d.id.padEnd(10), String(d.o), fmt(d.entry).padEnd(22), fmt(d.exit).padEnd(22), String(d.rise).padStart(8), String(d.turn).padStart(7));
  console.log('\nClasses de raccord (sortie → entrées qui l\'acceptent sans cassure) :');
  for (const [k, list] of [...A.exits].sort()) {
    const acc = (A.entries.get(k) || []).map((d) => d.id + (d.o ? `:${d.o}` : ''));
    console.log(`  ${fmt({ slope: +k.split('|')[0], psi: +k.split('|')[1] })} : sorties ${[...new Set(list.map((d) => d.id))].length} pièces, entrées ${[...new Set(acc)].length}`);
  }
  console.log(`\nCuls-de-sac (sortie sans pièce suivante, hors tremplins) : ${A.deadEnds.length}`);
  for (const d of A.deadEnds) console.log('  ', d.port, d.pieces.join(' '));
  console.log(`\nInversions manquantes (la pièce parcourue à l'envers n'existe pas) : ${A.missingReverse.length}`);
  for (const d of A.missingReverse) console.log('  ', d.id + (d.o ? `:${d.o}` : ''), 'entrée', fmt(d.entry), '→ sortie', fmt(d.exit), 'dénivelé', d.rise, 'virage', d.turn);
  console.log(`\nSorties en pente sans retour à plat doux (information) : ${A.noSoftLanding.length}`);
  console.log('   Une cassure de moins de ~12° ne fait pas décoller la voiture (CAR.stickAngle) ; au-delà, c\'est un tremplin.');
  for (const d of A.noSoftLanding) {
    const deg = Math.atan(Math.abs(d.slope)) * DEG;
    console.log('  ', fmt(d), `(${deg.toFixed(1)}°, ${deg < 12 ? 'collée au sol' : 'tremplin'}) :`, d.pieces.join(' '));
  }
  if (A.deadEnds.length || A.missingReverse.length) { console.log('\nAudit : des pièces manquent.'); process.exit(1); }
  console.log('\nAudit : graphe complet (aucun cul-de-sac, toutes les inversions existent).');
}
