// Pièces décoratives personnalisées (lot 12) : validation, forme compacte dans le code du circuit, code SHD1, géométrie, limites.
// node tools/test-pieces-perso.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { sanitizeDecoPart, sanitizeDecoParts, packDecoParts, unpackDecoParts, encodeDeco, decodeDeco, MAX_DECO_PARTS, MAX_CUSTOM_DECOS, DECO_SHAPES } from '../js/customDeco.js';
import { buildCustomParts } from '../js/customDecoBuild.js';
import { Track, scriptTrack } from '../js/track.js';
import { DECO_ORDER, DECO_LABELS } from '../js/decoData.js';

const mk = () => scriptTrack('t', 'start S2 finish', { decor: 'desert' });
const PARTS = [{ s: 'box', x: 1, y: 2, z: -1, sx: 3, sy: 2, sz: 1, ry: 45, c: '#ff0000' }, { s: 'sphere', y: 4, sx: 2, sy: 2, sz: 2, c: '#00ff00', g: 1 }, { s: 'wedge', x: -2 }, { s: 'ring', y: 6, sx: 4 }, { s: 'cone' }, { s: 'cyl' }];

console.log('Validation');
test('bornes, forme inconnue, couleur, au plus 12 formes', () => {
  const p = sanitizeDecoPart({ s: 'box', x: 99, y: -3, sx: 0, c: 'bleu', ry: 100 });
  assert.deepEqual([p.x, p.y, p.sx, p.c, p.ry], [8, 0, 0.1, '#c0c6e0', 105]);
  assert.equal(sanitizeDecoPart({ s: 'bomb' }), null); assert.equal(sanitizeDecoPart(7), null);
  assert.equal(sanitizeDecoParts(Array.from({ length: 30 }, () => ({ s: 'cyl' }))).length, MAX_DECO_PARTS);
  assert.deepEqual(sanitizeDecoParts('x'), []);
});
test('forme compacte : aller-retour exact, entrées abîmées écartées', () => {
  const clean = sanitizeDecoParts(PARTS);
  assert.deepEqual(unpackDecoParts(packDecoParts(clean)), clean);
  assert.deepEqual(unpackDecoParts([[99, 1, 1, 1, 1, 1, 1, 0, 'ffffff', 0], null, 'x']), []);
  assert.deepEqual(unpackDecoParts('x'), []);
});

console.log('Code SHD1');
test('aller-retour, erreurs lisibles, nom nettoyé', () => {
  const code = encodeDeco('Tour <b>X</b>', PARTS);
  const d = decodeDeco(code);
  assert.equal(d.parts.length, 6); assert.ok(!/[<>]/.test(d.name));
  assert.throws(() => decodeDeco('SHG1:x'), /pas un code de pièce/); assert.throws(() => decodeDeco('SHD1:@@@'), /invalide/);
  assert.throws(() => decodeDeco('SHD1:' + 'A'.repeat(5000)), /trop long/);
  assert.throws(() => decodeDeco('SHD1:' + Buffer.from(JSON.stringify({ n: 'x', p: [] })).toString('base64')), /vide/);
});

console.log('Dans le circuit');
test('la pièce voyage dans le code du circuit, ses formes sont validées à la lecture', () => {
  const t = mk();
  const d = t.addDeco({ k: 'custom', x: 5, y: 0, z: 5, ry: 0, s: 1.5, c: 0, cp: PARTS });
  assert.ok(d && d.cp.length === 6);
  const back = Track.decode(t.encode());
  const bd = back.decos.find((o) => o.k === 'custom');
  assert.deepEqual(bd.cp, d.cp); assert.equal(bd.s, 1.5);
  assert.equal(t.addDeco({ k: 'custom', x: 0, y: 0, z: 0, ry: 0, s: 1, c: 0, cp: [] }), null, 'une pièce vide est refusée');
});
test('un circuit sans pièce perso garde EXACTEMENT son code d\'avant ; au plus 10 pièces perso par circuit ; signature stable', () => {
  const a = mk(), b = mk();
  assert.equal(a.encode(), b.encode());
  for (let i = 0; i < MAX_CUSTOM_DECOS + 3; i++) b.addDeco({ k: 'custom', x: i * 3, y: 0, z: 0, ry: 0, s: 1, c: 0, cp: [{ s: 'box' }] });
  assert.equal(b.decos.filter((o) => o.k === 'custom').length, MAX_CUSTOM_DECOS);
  assert.equal(JSON.parse(Buffer.from(b.encode().slice(5).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).v, 4);
  const sig = b.signature(); b.decos[0].cp = [{ ...b.decos[0].cp[0], c: '#123456' }];
  assert.equal(b.signature(), sig, 'la forme est visuelle : ni signature ni records ne bougent');
  assert.ok(DECO_ORDER[DECO_ORDER.length - 1] === 'custom' && DECO_LABELS.custom);
});
test('un code hostile : kind inconnu, formes en trop, couleurs fausses', () => {
  const t = mk();
  t.addDeco({ k: 'custom', x: 1, y: 0, z: 1, ry: 0, s: 1, c: 0, cp: PARTS });
  const data = JSON.parse(Buffer.from(t.encode().slice(5).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  data.o[0][10] = Array.from({ length: 50 }, () => [1, 1e9, 1e9, 1e9, 1e9, 1e9, 1e9, 1e9, '<script>', 1]);
  const code = 'SHW3:' + Buffer.from(JSON.stringify(data)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const cp = Track.decode(code).decos[0].cp;
  assert.ok(cp.length <= MAX_DECO_PARTS && cp.every((p) => p.x === 8 && /^#[0-9a-f]{6}$/.test(p.c)));
});

console.log('Géométrie');
test('chaque forme produit des triangles aux coordonnées finies (faux constructeur)', () => {
  for (const s of DECO_SHAPES) {
    const tris = []; const mkT = () => ({ tri: (a, b, c) => tris.push([a, b, c]), quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }, box: () => tris.push(1), setMatrix() {} });
    // les primitives rondes appellent tri/quad ; une boîte sans « tri » les ferait échouer : on fournit les trois.
    const gb = mkT(), glow = mkT();
    assert.equal(buildCustomParts(gb, glow, [{ s, x: 1, y: 2, z: 3, sx: 2, sy: 2, sz: 2, ry: 30 }]), 1);
    assert.ok(tris.length > 0, s);
    for (const t of tris) if (Array.isArray(t)) for (const v of t) for (const n of v) assert.ok(Number.isFinite(n), s + ' ' + n);
  }
  const gb = { tri() {}, quad() {} }; let lit = 0;
  buildCustomParts(gb, { tri() { lit++; }, quad() { lit++; } }, [{ s: 'box', g: 1 }]);
  assert.ok(lit > 0, 'une forme lumineuse va sur la matière lumineuse');
});

finish('Tous les tests des pièces personnalisées passent.');
