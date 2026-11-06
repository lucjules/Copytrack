// Tests de maillage : node tools/test-mesh.mjs   (npm test)
//  - bifurcation : pas de surfaces coplanaires qui se recouvrent (z-fighting) ;
//  - vrille et revêtements : ce qui touche aux pièces (doublons retirés, anciens codes lisibles).
import assert from 'node:assert/strict';
import { GeoBuilder } from '../js/geo.js';
import { buildTileInto } from '../js/trackMesh.js';
import { Track } from '../js/track.js';
import { PIECES, SURFACES, SURFACE_ORDER, SURFACE_CODES } from '../js/pieces.js';
import { test, finish } from './harness.mjs';

// Triangles tournés vers le haut (presque plats) : { pts: [[x, y, z] × 3] }
function upTriangles(tile) {
  const gb = new GeoBuilder(), glow = new GeoBuilder();
  buildTileInto(gb, glow, tile, null);
  const out = [], p = gb.pos;
  for (let i = 0; i < p.length; i += 9) {
    const a = [p[i], p[i + 1], p[i + 2]], b = [p[i + 3], p[i + 4], p[i + 5]], c = [p[i + 6], p[i + 7], p[i + 8]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9 || ny / len < 0.99) continue;                    // pas tourné vers le haut
    out.push({ pts: [a, b, c], n: [nx / len, ny / len, nz / len] });
  }
  return out;
}
// Hauteur du plan du triangle au point (x, z).
const planeY = (t, x, z) => t.pts[0][1] - (t.n[0] * (x - t.pts[0][0]) + t.n[2] * (z - t.pts[0][2])) / t.n[1];
// Aire d'intersection de deux triangles (découpe de Sutherland-Hodgman).
function clip(poly, a, b) {
  const out = [], side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], sp = side(p), sq = side(q);
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}
const area = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; s += p[0] * q[1] - q[0] * p[1]; } return Math.abs(s) / 2; };
function overlap(t1, t2) {
  const orient = (t) => { const a = t[0], b = t[1], c = t[2]; return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) >= 0 ? t : [t[0], t[2], t[1]]; };
  const A = orient(t1), B = orient(t2);
  let poly = A;
  for (let i = 0; i < 3; i++) { poly = clip(poly, B[i], B[(i + 1) % 3]); if (!poly.length) return null; }
  return poly;
}

console.log('Bifurcation : plus de z-fighting');
for (const t of ['fork', 'forkL']) {
  test(`${t} : deux surfaces qui se recouvrent sont séparées d'au moins 4 cm (pas de scintillement)`, () => {
    const tris = upTriangles({ t, x: 0, z: 0, l: 0, r: 0, s: '', p: 0, v: 0, nb: 0, tn: 0 });
    assert.ok(tris.length > 20, 'des triangles existent : ' + tris.length);
    let bad = 0, worst = 0, minGap = Infinity;
    for (let i = 0; i < tris.length; i++) for (let j = i + 1; j < tris.length; j++) {
      const poly = overlap(tris[i].pts.map((q) => [q[0], q[2]]), tris[j].pts.map((q) => [q[0], q[2]]));
      const a = poly ? area(poly) : 0;
      if (a < 0.05) continue;                                           // recouvrement négligeable
      // Hauteur des deux surfaces au centre du recouvrement, et à ses sommets : l'écart doit dépasser la précision du tampon de profondeur.
      let gap = Infinity;
      const cx = poly.reduce((s, q) => s + q[0], 0) / poly.length, cz = poly.reduce((s, q) => s + q[1], 0) / poly.length;
      for (const [x, z] of [[cx, cz], ...poly]) gap = Math.min(gap, Math.abs(planeY(tris[i], x, z) - planeY(tris[j], x, z)));
      minGap = Math.min(minGap, gap);
      if (gap < 0.04) { bad++; worst = Math.max(worst, a); }
    }
    assert.equal(bad, 0, `${bad} paires de surfaces recouvertes à moins de 4 cm d'écart (jusqu'à ${worst.toFixed(1)} m²)`);
  });
}

console.log('Revêtements : plus de doublons');
test('« Tapis roulant » et « Volant inversé » n\'apparaissent qu\'une fois', () => {
  const labels = SURFACE_ORDER.map((s) => SURFACES[s].label);
  assert.equal(new Set(labels).size, labels.length, 'doublon : ' + labels.filter((l, i) => labels.indexOf(l) !== i));
  assert.ok(!SURFACE_ORDER.includes('tread') && !SURFACE_ORDER.includes('invert'));
  assert.ok(SURFACE_ORDER.every((s) => s in SURFACES), 'tout revêtement proposé est défini (pas de plantage)');
});
test('les anciens codes de circuit restent lisibles : les doublons sont lus comme leur revêtement', () => {
  // Numéros de sérialisation figés : 16 conveyor, 17 tread (ancien), 21 reverse, 22 invert (ancien).
  assert.equal(SURFACE_CODES[16], 'conveyor'); assert.equal(SURFACE_CODES[17], 'tread'); assert.equal(SURFACE_CODES[21], 'reverse'); assert.equal(SURFACE_CODES[22], 'invert'); assert.equal(SURFACE_CODES[23], 'cut');
  const t = new Track('x'); t.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 });
  t.add({ t: 'straight', x: 0, z: -1, l: 0, r: 0, s: 'conveyor', p: 120 }); t.add({ t: 'straight', x: 0, z: -2, l: 0, r: 0, s: 'reverse' });
  const code = t.encode();
  const back = Track.decode(code);
  assert.deepEqual(back.tiles.map((x) => x.s), ['', 'conveyor', 'reverse']);
  // un ancien code qui utilisait « tread » (17) et « invert » (22)
  const data = JSON.parse(Buffer.from(code.replace(/^SHW\d:/, '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  const stride = data.v >= 3 ? 8 : data.v >= 2 ? 6 : 5;
  for (let i = 0; i < data.t.length; i += stride) { if (data.t[i + 5] === 16) data.t[i + 5] = 17; else if (data.t[i + 5] === 21) data.t[i + 5] = 22; }
  const legacy = 'SHW3:' + Buffer.from(JSON.stringify(data)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.deepEqual(Track.decode(legacy).tiles.map((x) => x.s), ['', 'conveyor', 'reverse']);
  assert.equal(Track.normalize({ t: 'straight', x: 0, z: 0, l: 0, r: 0, s: 'tread' }).s, 'conveyor');
  assert.equal(Track.normalize({ t: 'straight', x: 0, z: 0, l: 0, r: 0, s: 'invert' }).s, 'reverse');
});

console.log('Vrille : 2 cases de long');
test('la vrille occupe 2×2 cases, comme le tire-bouchon', () => {
  assert.equal(PIECES.twist.size, 2); assert.equal(Track.cellsOf({ t: 'twist', x: 3, z: 4, l: 0, r: 0 }).length, 4);
});

await finish('Tous les tests de maillage passent.');
