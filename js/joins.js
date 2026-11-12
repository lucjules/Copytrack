// Raccords d'orientation (0.9.3) : une route sur un mur ne se raccorde pas directement au sol, il faut une transition.
//
// Module pur (aucun rendu), utilisé par l'éditeur pour afficher un avertissement et par les tests. Pour chaque pièce posée sur un mur ou
// de type « transition », on cherche les pièces qui touchent chacune de ses extrémités (même point, sens opposés) et on compare le roulis
// de la route de chaque côté : s'il diffère (mur gauche contre sol, mur droit contre mur gauche...), la voiture ne passe pas.
import { PIECES, oriAngle, rollOfO, ORIENTS } from './pieces.js';
import { centerlineWorld } from './ribbons.js';
import { CELL } from './constants.js';

const NAMES = Object.fromEntries(ORIENTS.map((o) => [o.id, o.label]));

// Roulis (rad) de la route aux deux extrémités d'une pièce, dans son sens nominal ; null quand il n'est pas connu (loopings, tubes...).
export function endRolls(tile) {
  const P = PIECES[tile.t];
  if (P.roll) return tile.v ? null : [oriAngle(P.roll[0], P.roll[1]), oriAngle(P.roll[1], P.roll[0])];
  if (P.kind === 'line' || P.kind === 'arc') {
    const psi = tile.v ? Math.PI : rollOfO(tile.o);
    return [psi, psi];
  }
  return null;
}

// Nom de l'orientation d'un roulis (pour les messages).
export function rollName(psi) {
  const d = Math.round((psi * 180) / Math.PI / 45) * 45;
  return NAMES[Math.abs(d) === 180 ? 3 : d === 90 ? 1 : d === -90 ? 2 : d === 45 ? 4 : d === -45 ? 5 : d === 135 ? 6 : d === -135 ? 7 : 0] || 'Sol';
}

const wrap = (a) => { a = ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a; };

function ends(tile) {
  const pts = centerlineWorld(tile, 2);
  if (pts.length < 2) return [];
  const a = pts[0], a2 = pts[1], b = pts[pts.length - 1], b2 = pts[pts.length - 2];
  const dir = (p, q) => { const v = [p[0] - q[0], p[1] - q[1], p[2] - q[2]], l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  return [{ p: a, d: dir(a, a2), entry: true }, { p: b, d: dir(b, b2), entry: false }];
}

// Avertissements : [{ tile, other, msg }]. Seules les pièces sur un mur ou de transition sont examinées (un circuit sans mur ne coûte rien).
export function orientationIssues(track) {
  const out = [];
  const wallish = (t) => t.o || PIECES[t.t].roll;
  if (!track.tiles.some(wallish)) return out;
  const seen = new Set();
  for (const A of track.tiles) {
    if (!wallish(A)) continue;
    const ra = endRolls(A);
    if (!ra) continue;
    const ea = ends(A);
    for (let i = 0; i < ea.length; i++) {
      const e = ea[i];
      // Roulis de A dans le sens qui sort de A vers le voisin : le sens nominal si c'est la sortie, l'inverse (roulis opposé) si c'est l'entrée.
      const psiA = e.entry ? -ra[0] : ra[1];
      const cells = new Set();
      for (const off of [0.5, 2]) for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
        cells.add(`${Math.floor((e.p[0] + e.d[0] * off + dx) / CELL)},${Math.floor((e.p[2] + e.d[2] * off + dz) / CELL)}`);
      }
      for (const c of cells) {
        const [cx, cz] = c.split(',').map(Number);
        for (const B of track.tilesAt(cx, cz)) {
          if (B === A) continue;
          const rb = endRolls(B);
          if (!rb) continue;
          for (const f of ends(B)) {
            if (Math.hypot(f.p[0] - e.p[0], f.p[1] - e.p[1], f.p[2] - e.p[2]) > 3) continue;
            if (e.d[0] * f.d[0] + e.d[1] * f.d[1] + e.d[2] * f.d[2] > -0.5) continue;
            // Roulis de B dans le sens qui entre dans B depuis A : le sens nominal si c'est son entrée, l'inverse si c'est sa sortie.
            const psiB = f.entry ? rb[0] : -rb[1];
            if (Math.abs(wrap(psiA - psiB)) < 0.35) continue;
            const key = A.x + ',' + A.z + ',' + A.l + '|' + B.x + ',' + B.z + ',' + B.l;
            const key2 = B.x + ',' + B.z + ',' + B.l + '|' + A.x + ',' + A.z + ',' + A.l;
            if (seen.has(key) || seen.has(key2)) continue;
            seen.add(key);
            // Dans le message, tout se lit dans le sens nominal de la pièce A (celui de sa flèche dans l'éditeur).
            const canA = e.entry ? ra[0] : ra[1], asA = e.entry ? -psiB : psiB;
            out.push({ tile: A, other: B, msg: `${rollName(canA)} contre ${rollName(asA)} (${PIECES[A.t].label} / ${PIECES[B.t].label}) : place une transition (famille Transition).` });
          }
        }
      }
    }
  }
  return out;
}
