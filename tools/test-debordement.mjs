// Débordement des routes inclinées dans la case voisine (phase 3 de la 1.0, js/spill.js) : chaque case que la route dessinée touche est annoncée ;
// l'éditeur refuse une pièce qui n'est pas la continuation, et accepte celle qui l'est ; les circuits existants se lisent comme avant.
//   node tools/test-debordement.mjs   (npm test)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';
import { spillCells, spillConflicts } from '../js/spill.js';
import { Track } from '../js/track.js';
import { PIECES, localToWorld } from '../js/pieces.js';
import { CELL } from '../js/constants.js';
import { stripsFor } from '../js/trackGeometry.js';
import { tileEnds, compatiblePlacement } from '../js/connect.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';

test('chaque case voisine que la route dessinée touche (de plus de 1,5 m) est annoncée, pour toute pièce, orientation et rotation', () => {
  let n = 0;
  const bad = [];
  for (const t of Object.keys(PIECES)) for (const o of [0, 1, 2, 3, 4, 5, 6]) for (const r of [0, 1, 2, 3]) {
    let tile, strips;
    try { tile = Track.normalize({ t, x: 10, z: 10, l: 6, r, o }); if ((tile.o | 0) !== o) continue; strips = stripsFor(tile); } catch { continue; }
    if (!strips || !strips.length) continue;
    n++;
    const s = PIECES[t].size, ann = new Set(spillCells(tile).map(([x, z]) => x + ',' + z));
    for (const strip of strips) for (const f of strip) for (const w of [-12, 0, 12]) {
      const p = localToWorld(tile, f.p[0] + f.r[0] * w, f.p[2] + f.r[2] * w), cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
      if (cx >= tile.x && cx < tile.x + s && cz >= tile.z && cz < tile.z + s) continue;
      const out = Math.max(tile.x * CELL - p.x, p.x - (tile.x + s) * CELL, tile.z * CELL - p.z, p.z - (tile.z + s) * CELL);
      if (out > 1.5 && !ann.has(cx + ',' + cz)) bad.push(`${t} o${o} r${r} → ${cx},${cz}`);
    }
  }
  assert.ok(n > 4000, n + ' cas');
  assert.deepEqual([...new Set(bad)].slice(0, 10), []);
});

test('les pentes au mur débordent dans la case d’avant et d’après (sens de la marche) ; une route à plat ne déborde pas', () => {
  const slope = Track.normalize({ t: 'slope', x: 10, z: 10, l: 6, r: 0, o: 1 });
  assert.deepEqual(spillCells(slope).map(String).sort(), ['10,11', '10,9']);
  assert.deepEqual(spillCells(Track.normalize({ t: 'slope', x: 10, z: 10, l: 6, r: 1, o: 1 })).map(String).sort(), ['11,10', '9,10']);
  assert.deepEqual(spillCells(Track.normalize({ t: 'slope', x: 10, z: 10, l: 6, r: 0 })), []);
  assert.deepEqual(spillCells(Track.normalize({ t: 'straight', x: 10, z: 10, l: 6, r: 0, o: 1 })), []);
});

test('éditeur : une pièce étrangère aux mêmes niveaux dans la case débordée est refusée ; la continuation, une autre hauteur ou un anneau passent', () => {
  const tr = new Track('d', [{ t: 'slope', x: 10, z: 10, l: 6, r: 0, o: 1 }]);
  const slope = tr.tiles[0], [lo, hi] = Track.range(slope);
  const exit = tileEnds(slope).find((e) => e.exit);
  const next = Track.normalize(compatiblePlacement(exit, 'straight', { o: 1 }, {}));      // (la route continue sur le même mur)
  const nextCells = Track.cellsOf(next).map(String);
  assert.ok(spillCells(slope).some((c) => nextCells.includes(String(c))), 'la continuation est bien dans une case débordée');
  assert.deepEqual(spillConflicts(tr, next), [], 'la continuation se raccorde : permise');
  const [cx, cz] = spillCells(slope).find((c) => !nextCells.includes(String(c)));
  const stranger = Track.normalize({ t: 'straight', x: cx, z: cz, l: lo, r: 1 });
  assert.deepEqual(spillConflicts(tr, stranger), [slope], 'pièce étrangère aux mêmes niveaux : refusée');
  assert.deepEqual(spillConflicts(tr, Track.normalize({ t: 'straight', x: cx, z: cz, l: Math.min(14, hi + 1), r: 1 })), [], 'au-dessus de la plage : permise');
  assert.deepEqual(spillConflicts(tr, Track.normalize({ t: 'ring', x: cx, z: cz, l: lo, r: 0 })), [], 'anneau flottant : permis');
  // Dans l'autre sens : la pente posée À CÔTÉ d'une pièce déjà là est refusée de la même façon.
  const tr2 = new Track('d2', [{ t: 'straight', x: cx, z: cz, l: lo, r: 1 }]);
  assert.equal(spillConflicts(tr2, Track.normalize({ t: 'slope', x: 10, z: 10, l: 6, r: 0, o: 1 })).length, 1);
  // La pièce que la pose remplace est ignorée (remplacer une pente par elle-même, ou poser par-dessus).
  assert.deepEqual(spillConflicts(tr2, Track.normalize({ t: 'slope', x: 10, z: 10, l: 6, r: 0, o: 1 }), tr2.tiles), []);
});

test('les circuits existants ne changent pas : emprise inchangée, rien n’est perdu au chargement ; aucun chevauchement dans les 72 circuits officiels', () => {
  const t = Track.normalize({ t: 'slope', x: 10, z: 10, l: 6, r: 0, o: 1 });
  assert.deepEqual(Track.cellsOf(t), [[10, 10]]);
  const [lo] = Track.range(t);
  const old = new Track('ancien', [t, { t: 'straight', x: 10, z: 9, l: lo, r: 1 }]);
  const back = Track.decode(old.encode());
  assert.equal(back.tiles.length, 2, 'un ancien circuit avec un chevauchement se relit en entier');
  for (const d of BUILTIN_TRACKS) { const tr = buildBuiltin(d); for (const x of tr.tiles) assert.deepEqual(spillConflicts(tr, x), [], d.id); }
});

test('branchements : pose, aperçu, prolonger, collage et déplacement de sélection vérifient le débordement', () => {
  const src = (f) => readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
  assert.match(src('editor/tools.js'), /spillConflicts\(this\.track, norm, conflicts\)/);
  assert.match(src('editor/pointer.js'), /spillConflicts\(this\.track, Track\.normalize\(cand\), conflicts\)/);
  assert.equal((src('extend.js').match(/spillConflicts\(track, tile\)/g) || []).length, 2);
  assert.match(src('editorTools.js'), /spillConflicts\(track, n, cs\)/); assert.match(src('editorTools.js'), /spillConflicts\(track, n, tiles\)/);
  assert.match(src('editor/selection.js'), /spillConflicts\(this\.track, Track\.normalize\(t\)\)/);
});

await finish('Les pentes posées au mur réservent leur bord : seule leur continuation peut s’y poser.');
