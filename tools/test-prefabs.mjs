// Prefabs de l'éditeur (0.9.18) : morceaux fournis, code de partage « SHP1: », bibliothèque locale. node tools/test-prefabs.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { STARTERS, starterClip, clipToCode, codeToClip, clipSummary, PREFAB_PREFIX, MAX_PREFAB_TILES, MAX_PREFAB_CHARS } from '../js/prefabs.js';
import { Track, scriptTrack, b64encode } from '../js/track.js';
import { copyRect, pasteClip, rotateClip, checkTrack } from '../js/editorTools.js';
// Pas de navigateur ici : un localStorage en mémoire, installé AVANT de charger storage.js.
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } };
const { listPrefabs, savePrefab, deletePrefab, PREFAB_MAX } = await import('../js/storage.js');

console.log('Morceaux fournis');
test('chaque prefab fourni : construit, non vide, se colle sans rien ignorer aux quatre orientations et à plusieurs niveaux, et garde ses pièces', () => {
  assert.ok(STARTERS.length >= 6);
  assert.equal(new Set(STARTERS.map((d) => d.id)).size, STARTERS.length);
  for (const d of STARTERS) {
    const clip = starterClip(d);
    assert.ok(clip && clip.tiles.length >= 3 && clip.w >= 1 && clip.h >= 1, d.id);
    assert.ok(Math.min(...clip.tiles.map((t) => t.x)) === 0 || Math.min(...clip.tiles.map((t) => t.z)) === 0, d.id + ' : coordonnées relatives');
    assert.equal(Math.min(...clip.tiles.map((t) => t.l)), 0, d.id + ' : niveaux relatifs au plus bas');
    let c = clip;
    for (let r = 0; r < 4; r++) {
      for (const level of [0, 3]) { const tr = new Track('x'); const res = pasteClip(tr, c, 6, 6, level); assert.equal(res.skipped, 0, `${d.id} rot ${r} niveau ${level}`); assert.equal(tr.tiles.length, clip.tiles.length); }
      c = rotateClip(c);
    }
    assert.ok(clipSummary(clip).includes('pièce'));
  }
});
test('un prefab collé à côté d\'un circuit ne casse rien : le vérificateur ne trouve rien d’autre que des extrémités libres, départ, arrivée et checkpoint manquants', () => {
  const tr = new Track('x');
  pasteClip(tr, starterClip(STARTERS[0]), 4, 4, 0);
  const issues = checkTrack(tr).filter((i) => i.level === 'error' && !/départ|arrivée|checkpoint|reliée à rien/i.test(i.msg));
  assert.deepEqual(issues.map((i) => i.msg), []);
});

console.log('Code de partage');
test('aller-retour : mêmes pièces aux mêmes places, même nom ; le code porte le préfixe SHP1', () => {
  const clip = starterClip(STARTERS.find((d) => d.id === 'saut'));
  const code = clipToCode(clip, 'Mon saut');
  assert.ok(code.startsWith(PREFAB_PREFIX));
  const back = codeToClip(code);
  assert.equal(back.name, 'Mon saut'); assert.equal(back.clip.tiles.length, clip.tiles.length);
  const key = (c) => c.tiles.map((t) => `${t.t}:${t.x}:${t.z}:${t.l}:${t.r}:${t.s}`).sort().join('|');
  assert.equal(key(back.clip), key(clip)); assert.deepEqual([back.clip.w, back.clip.h], [clip.w, clip.h]);
});
test('depuis une sélection d\'un vrai circuit : copyRect puis code puis presse-papiers redonnent la sélection (décorations comprises)', () => {
  const tr = scriptTrack('t', 'start S2 R S2 L S2 C S3 finish', { decor: 'desert' });
  tr.addDeco({ k: 'tree', x: 40, y: 0.2, z: 30, ry: 0.5, s: 1.2, c: 0 });
  const rect = { x0: 0, z0: -6, x1: 8, z1: 3 };
  const clip = copyRect(tr, rect);
  assert.ok(clip && clip.tiles.length >= 3);
  const back = codeToClip(clipToCode(clip, 'Zone')).clip;
  assert.equal(back.tiles.length, clip.tiles.length);
  assert.equal(back.decos.length, clip.decos.length);
});
test('codes de l\'extérieur : jamais de confiance (mauvais préfixe, coupé, base64 faux, trop gros, vide) avec un message lisible', () => {
  const good = clipToCode(starterClip(STARTERS[0]), 'Ok');
  assert.throws(() => codeToClip(''), /pas un code de prefab/); assert.throws(() => codeToClip('SHW3:abc'), /pas un code de prefab/); assert.throws(() => codeToClip(null), /pas un code de prefab/);
  assert.throws(() => codeToClip(good.slice(0, good.length - 30)), /invalide ou coupé/);
  assert.throws(() => codeToClip('SHP1:@@@@'), /invalide ou coupé/);
  assert.throws(() => codeToClip(PREFAB_PREFIX + b64encode('{"n":"x"}')), /invalide ou coupé/);
  assert.throws(() => codeToClip(PREFAB_PREFIX + 'A'.repeat(MAX_PREFAB_CHARS + 1)), /trop gros/);
  const empty = new Track('vide');
  assert.throws(() => codeToClip(PREFAB_PREFIX + b64encode(JSON.stringify({ n: 'Vide', c: empty.encode() }))), /vide|invalide/);
  assert.equal(codeToClip(PREFAB_PREFIX + b64encode(JSON.stringify({ n: 'x'.repeat(200), c: scriptTrack('t', 'S R S', {}).encode() }))).name.length, 40, 'nom borné');
  assert.ok(MAX_PREFAB_TILES >= 100);
});

console.log('Bibliothèque');
test('enregistrer, relire, remplacer (même identifiant), supprimer ; bornée ; une entrée abîmée est ignorée', () => {
  for (const p of listPrefabs()) deletePrefab(p.id);
  const code = clipToCode(starterClip(STARTERS[1]), 'Épingle');
  savePrefab({ id: 'a', name: 'Un', code }); savePrefab({ id: 'b', name: 'Deux', code }); savePrefab({ id: 'a', name: 'Un bis', code });
  assert.deepEqual(listPrefabs().map((p) => [p.id, p.name]), [['a', 'Un bis'], ['b', 'Deux']], 'le plus récent d\'abord, pas de doublon');
  deletePrefab('b'); assert.deepEqual(listPrefabs().map((p) => p.id), ['a']);
  for (let i = 0; i < PREFAB_MAX + 10; i++) savePrefab({ id: 'p' + i, name: 'P' + i, code });
  assert.equal(listPrefabs().length, PREFAB_MAX);
  assert.equal(listPrefabs()[0].id, 'p' + (PREFAB_MAX + 9));
  savePrefab({ id: 'x'.repeat(100), name: 'n'.repeat(100), code });
  assert.ok(listPrefabs()[0].id.length <= 30 && listPrefabs()[0].name.length <= 40);
  for (const p of listPrefabs()) deletePrefab(p.id);
  assert.deepEqual(listPrefabs(), []);
});

await finish('Tous les tests des prefabs passent.');
