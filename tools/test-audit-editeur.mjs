// AUDIT 0.9.59 — éditeur : node tools/test-audit-editeur.mjs   (npm test)
// Défauts trouvés par des séquences d'opérations aléatoires (150 000 opérations : sélection, déplacement, rotation, Ctrl+D, niveau ±, couper / coller, groupes, options,
// revêtements, décorations, annuler / rétablir), chacun reproduit ici de façon déterministe. Chaque test échoue sur le code d'avant la correction.
//   1. Monter / descendre une zone, coller : une pièce qui occupe des niveaux SOUS le sien (à l'envers, pente descendante, route sur un mur, transition) finissait sous le sol.
//   2. Un décalage de niveau REFUSÉ modifiait quand même le circuit (pièces recréées et rangées en fin de liste), sans pas d'annulation.
//   3. « Sélectionner le groupe » prenait toutes les pièces du rectangle englobant, pas seulement celles du groupe.
//   4. Invariants de structure après chaque opération d'une longue séquence aléatoire (index, conflits, niveaux, code relisible, historique exact).
import assert from 'node:assert/strict';
import { EditorSession } from '../js/editor.js';
import { Track, scriptTrack, b64encode, MAX_CELL } from '../js/track.js';
import { PIECES, PIECE_ORDER, SURFACE_ORDER, SURFACES, LEGACY_PIECE, LEGACY_SURFACE, LEGACY_TILE } from '../js/pieces.js';
import { MAX_DECOS } from '../js/constants.js';
import { DECO_ORDER } from '../js/decoData.js';
import { shiftLevel, pasteClip, copyRect, clipLift, placedClip, checkTrack } from '../js/editorTools.js';
import { Simulation } from '../js/simulation.js';
import { STARTERS, starterClip } from '../js/prefabs.js';
import { test, finish } from './harness.mjs';

const lcg = (s) => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = (r, a) => a[Math.floor(r() * a.length)];
const noop = new Proxy(function () {}, { get: () => noop, apply: () => undefined });
// Une session d'éditeur sans DOM ni rendu : les vraies méthodes (EditorSession.prototype), des bouchons pour l'interface.
const session = (track) => {
  const self = Object.create(EditorSession.prototype);
  Object.assign(self, {
    track, history: [], histSel: [], hIndex: -1, inspector: { describe: () => null, restore() {}, refresh() {}, duplicate() { return false; } },
    app: { audio: noop, ui: { flash() {}, modal() {} } }, _refreshUI() {}, _applyDecor() {}, gridKey: '', tool: 'select', sel: null, pasting: false, level: 0, focusLevel: false,
    _refreshSelBar() {}, _clearPreview() {}, setTool(t) { this.tool = t; }, setLevel(l) { this.level = l; }, hover: null, view: noop,
  });
  return self;
};
const cleanup = (s) => clearTimeout(s._draftT);
const TYPES = PIECE_ORDER.filter((t) => PIECES[t] && !LEGACY_PIECE[t] && !LEGACY_SURFACE[t] && !LEGACY_TILE[t]);

// Structure du circuit : index spatial = liste des pièces, aucun conflit, aucune pièce hors des niveaux, pièces normalisées, un seul départ, code relisible à l'identique.
function structure(track) {
  const errs = [];
  const want = new Map();
  for (const t of track.tiles) for (const [x, z] of Track.cellsOf(t)) { const k = x + ',' + z; if (!want.has(k)) want.set(k, []); want.get(k).push(t); }
  let n = 0, m = 0;
  for (const [k, arr] of track.index) { n += arr.length; const w = want.get(((k >> 13) - 4096) + ',' + ((k & 8191) - 4096)) || []; if (w.length !== arr.length || arr.some((t) => !w.includes(t))) errs.push('index ≠ pièces'); }
  for (const a of want.values()) m += a.length;
  if (n !== m) errs.push(`index : ${n} entrées, ${m} attendues`);
  if (new Set(track.tiles).size !== track.tiles.length) errs.push('pièce en double dans la liste');
  for (const t of track.tiles) {
    if (track.conflicts(t).length) errs.push(`conflit ${t.t}@${t.x},${t.z},${t.l}`);
    if (!Track.inBounds(t)) errs.push(`hors des niveaux : ${t.t}${t.v ? '^' : ''}${t.o ? ' mur' + t.o : ''} au niveau ${t.l}`);
    const nrm = Track.normalize(t);
    for (const k of Object.keys(nrm)) if (JSON.stringify(nrm[k]) !== JSON.stringify(t[k])) errs.push(`pièce non normalisée ${t.t}.${k}`);
  }
  if (track.count('start') > 1) errs.push('plusieurs départs');
  if (track.decos.length > MAX_DECOS) errs.push('trop de décorations');
  for (const d of track.decos) if (![d.x, d.y, d.z, d.ry, d.s].every(Number.isFinite)) errs.push('décoration non finie');
  const code = track.encode(), back = Track.decode(code);
  if (back.encode() !== code) errs.push('aller-retour du code différent');
  if (back.tiles.length !== track.tiles.length || back.decos.length !== track.decos.length) errs.push('le code relu perd des pièces ou des décorations');
  return [...new Set(errs)];
}

console.log('Niveaux : une zone descendue ou collée ne passe jamais sous le sol');
test('descendre une zone : refusé si une pièce à l\'envers, une pente descendante ou une route sur un mur passerait sous le sol ; le circuit est alors EXACTEMENT comme avant', () => {
  const cases = [
    { t: 'straight', v: 1, l: 1, why: 'à l\'envers au niveau 1 (il faut un niveau libre dessous)' },
    { t: 'dn1', l: 1, why: 'pente descendante 1 au niveau 1 (descend jusqu\'au niveau 0)' },
    { t: 'cdi2', l: 2, why: 'début de descente 2 au niveau 2' },
    { t: 'straight', o: 1, l: 2, why: 'route sur le mur gauche au niveau 2 (9 m sous son axe)' },
    { t: 'tr01s', l: 2, why: 'transition sol → mur au niveau 2' },
  ];
  for (const c of cases) {
    const tr = new Track('n');
    tr.add({ t: 'start', x: 0, z: 0, l: 5, r: 0 });
    const tile = tr.add({ t: c.t, x: 3, z: 3, l: c.l, r: 0, v: c.v || 0, o: c.o || 0 });
    tr.add({ t: 'straight', x: 5, z: 5, l: 5, r: 0 });
    assert.ok(Track.inBounds(tile), c.why + ' : la pièce de départ du test est valide');
    const code = tr.encode(), objs = tr.tiles.slice();
    assert.equal(shiftLevel(tr, [tile], [], -1), false, c.why + ' : descendre d\'un niveau est refusé');
    assert.equal(tr.encode(), code, c.why + ' : circuit inchangé');
    assert.ok(tr.tiles.every((t, i) => t === objs[i]), c.why + ' : mêmes objets, même ordre (la pièce inspectée reste celle du circuit)');
    assert.deepEqual(structure(tr), []);
    assert.equal(shiftLevel(tr, [tile], [], 1), true, c.why + ' : monter reste possible');
    assert.deepEqual(structure(tr), []);
  }
});
test('monter une zone : refusée par une pièce gênante, elle ne modifie rien (avant : pièces recréées en fin de liste, ordre du circuit changé sans pas d\'annulation)', () => {
  const tr = scriptTrack('m', 'start S3 finish');
  const moved = tr.tiles.filter((t) => t.t === 'straight').slice(0, 2);
  tr.add({ t: 'platform', x: moved[1].x, z: moved[1].z, l: 2, r: 0 });      // juste au-dessus de la 2e : monter de 2 niveaux est impossible
  const code = tr.encode(), objs = tr.tiles.slice();
  assert.equal(shiftLevel(tr, moved, [], 2), false);
  assert.equal(tr.encode(), code, 'même code (donc même ordre des pièces)');
  assert.ok(tr.tiles.every((t, i) => t === objs[i]), 'mêmes objets');
  // Réussi : l'ordre des pièces est conservé aussi (seul leur niveau change).
  const order = tr.tiles.map((t) => `${t.t}:${t.x}:${t.z}`);
  assert.equal(shiftLevel(tr, moved, [], 4), true);
  assert.deepEqual(tr.tiles.map((t) => `${t.t}:${t.x}:${t.z}`), order, 'ordre conservé après un décalage réussi');
  assert.ok(tr.tiles.filter((t) => t.t === 'straight').slice(0, 2).every((t) => t.l === 4));
  assert.deepEqual(structure(tr), []);
});
test('coller : une zone dont une pièce passerait sous le sol est REMONTÉE d\'autant de niveaux qu\'il faut (rien d\'ignoré, rien d\'enterré) ; l\'aperçu montre la même place', () => {
  const src = new Track('c');
  src.add({ t: 'straight', x: 0, z: 0, l: 3, r: 0, v: 1 });      // au plafond : un niveau libre dessous
  src.add({ t: 'dn2', x: 1, z: 0, l: 3, r: 0 });                 // descend de 2 niveaux
  src.add({ t: 'straight', x: 2, z: 0, l: 3, r: 0, o: 2 });      // sur le mur droit : 2 niveaux dessous
  src.add({ t: 'straight', x: 3, z: 0, l: 3, r: 0 });            // ordinaire
  src.addDeco({ k: 'tree', x: 40, y: 3 * 6.4, z: 10, ry: 0, s: 1, c: 0 });
  const clip = copyRect(src, { x0: 0, z0: 0, x1: 3, z1: 0 });
  assert.equal(clipLift(clip.tiles), 2, 'collée au niveau 0, la zone doit monter de 2 niveaux');
  const dst = new Track('d');
  dst.add({ t: 'start', x: 9, z: 9, l: 0, r: 0 });
  const res = pasteClip(dst, clip, 0, 0, 0);                    // collé au niveau 0
  assert.equal(res.skipped, 0, 'aucune pièce ignorée');
  assert.equal(res.lift, 2);
  assert.equal(dst.tiles.length, 5);
  assert.ok(dst.tiles.filter((t) => t.t !== 'start').every((t) => t.l === 2), 'toute la zone au niveau 2 (les écarts de niveau entre ses pièces sont conservés)');
  assert.ok(Math.abs(dst.decos[0].y - 2 * 6.4) < 1e-9, 'les décorations montent avec la zone');
  assert.deepEqual(placedClip(clip, 0, 0, 0).tiles.map((t) => t.l), [2, 2, 2, 2], 'l\'aperçu (placedClip) est à la même place');
  assert.deepEqual(structure(dst), []);
  const res2 = pasteClip(dst, clip, 0, 3, 4);                   // au niveau 4 : rien à remonter
  assert.equal(res2.skipped + res2.lift, 0);
  assert.deepEqual(structure(dst), []);
  // Le prefab « Wall-ride » (routes sur un mur) collé au sol : avant, ses pièces descendaient 9 m sous terre.
  const wr = starterClip(STARTERS.find((d) => d.id === 'wallride')), t3 = new Track('w');
  assert.equal(pasteClip(t3, wr, 0, 0, 0).skipped, 0);
  assert.deepEqual(structure(t3), []);
  assert.ok(t3.tiles.some((t) => t.o), 'les routes sur le mur sont posées');
});

console.log('Groupes : « Sélectionner le groupe » ne désigne que ses membres');
test('sélectionner un groupe dont les pièces sont séparées par d\'autres : seuls ses membres sont sélectionnés ; Suppr ne retire qu\'eux ; le départ voisin n\'est pas touché', () => {
  const mk = () => {
    const tr = new Track('g');
    tr.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 });
    tr.add({ t: 'straight', x: 0, z: -1, l: 0, r: 0, g: 2 });
    tr.add({ t: 'straight', x: 0, z: -2, l: 0, r: 0 });
    tr.add({ t: 'straight', x: 0, z: -3, l: 0, r: 0, g: 5 });
    tr.add({ t: 'bigcurve', x: 0, z: -6, l: 0, r: 0, g: 2 });      // pièce 2×2 : la zone doit la contenir en entier
    tr.add({ t: 'straight', x: 1, z: -4, l: 0, r: 0 });
    tr.addDeco({ k: 'tree', x: 10, y: 0, z: -40, ry: 0, s: 1, c: 0, g: 2 });
    tr.addDeco({ k: 'tree', x: 12, y: 0, z: -70, ry: 0, s: 1, c: 0 });
    return tr;
  };
  const tr = mk(), s = session(tr); s._commit();
  s.selectGroup(2);
  assert.deepEqual(s._selTiles().map((t) => t.g), [2, 2], 'deux pièces, toutes du groupe 2');
  assert.deepEqual(s._selDecos().map((d) => d.g), [2], 'une décoration, du groupe 2');
  s.deleteSel(true);
  assert.equal(tr.tiles.length, 4, 'les quatre pièces hors du groupe restent');
  assert.ok(tr.startTile, 'le départ est toujours là');
  assert.equal(tr.decos.length, 1);
  s.undo();
  assert.equal(tr.tiles.length, 6, 'annuler rend les deux pièces');
  // Une zone tracée à la main redevient une zone ordinaire (tout ce qu'elle contient).
  s.hover = { cx: 0, cz: -3 }; s._selectDown(true);
  assert.equal(s.selGroup, 0);
  assert.deepEqual(s._selTiles().map((t) => t.g), [5]);
  // « Retirer du groupe » sur une sélection de groupe : la sélection est abandonnée (le rectangle ne se met pas à désigner les voisines).
  s.selectGroup(2);
  assert.equal(s.assignSelection(0), 3);
  assert.equal(s.sel, null);
  assert.equal(tr.tiles.filter((t) => t.g === 2).length, 0);
  // Ranger le groupe dans un autre : la sélection suit ses membres.
  const tr2 = mk(), s2 = session(tr2); s2._commit();
  s2.selectGroup(2); s2.assignSelection(7);
  assert.deepEqual(s2._selTiles().map((t) => t.g), [7, 7]);
  assert.equal(tr2.tiles.filter((t) => t.g === 5).length, 1, 'le groupe 5, dans le même rectangle, n\'a pas été aspiré');
  cleanup(s); cleanup(s2);
});

console.log('Séquences longues : 120 séquences de 70 opérations au hasard, structure vérifiée après CHAQUE opération');
test('aucune opération ne corrompt le circuit ; l\'état courant est toujours un pas de l\'historique ; annuler puis rétablir toute la pile redonne les mêmes états', () => {
  let ops = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const r = lcg(seed);
    const scr = pick(r, ['start S4 R S3 finish', 'start S2 O S2 C S finish', 'start S U S D S.i finish', 'start S2 TW.f S2^ TWB.f S finish', 'start S [tr01s] S2< [tr10s] S finish']);
    const track = scriptTrack('e' + seed, scr, { l: pick(r, [2, 3, 5]) }), s = session(track); s._commit();
    const rect = () => {
      const xs = track.tiles.flatMap((t) => Track.cellsOf(t).map((c) => c[0])), zs = track.tiles.flatMap((t) => Track.cellsOf(t).map((c) => c[1]));
      if (!xs.length) return { x0: 0, z0: 0, x1: 2, z1: 2 };
      const x0 = Math.min(...xs) - 1 + Math.floor(r() * 4), z0 = Math.min(...zs) - 1 + Math.floor(r() * (Math.max(...zs) - Math.min(...zs) + 2));
      return { x0, z0, x1: x0 + Math.floor(r() * 5), z1: z0 + Math.floor(r() * 5) };
    };
    for (let i = 0; i < 70; i++) {
      const x = r(); let op;
      if (x < 0.08) { op = 'annuler'; s.undo(); }
      else if (x < 0.14) { op = 'rétablir'; s.redo(); }
      else if (x < 0.22) { op = 'sélection'; s.sel = rect(); s.selGroup = 0; s.pasting = false; s.tool = 'select'; }
      else if (x < 0.30) { op = 'déplacer'; s.moveSel(pick(r, [-1, 0, 1]), pick(r, [-1, 0, 1])); }
      else if (x < 0.36) { op = 'pivoter'; s.rotateSel(); }
      else if (x < 0.44) { op = 'Ctrl+D'; s.duplicateNow(); }
      else if (x < 0.50) { op = 'niveau ±'; s.shiftSel(pick(r, [-1, 1])); }
      else if (x < 0.54) { op = 'supprimer'; s.deleteSel(true); }
      else if (x < 0.60) { op = 'copier-coller'; if (s.copySel(true)) { s.startPaste(); if (r() < 0.5) s.rotateClipboard(); s.hover = { cx: Math.floor(r() * 12) - 3, cz: Math.floor(r() * 12) - 3 }; s.level = Math.floor(r() * 4); s.doPaste(); s.pasting = false; } }
      else if (x < 0.64) { op = 'couper'; if (s.sel) { s.cutSel(); s.hover = { cx: Math.floor(r() * 12) - 3, cz: Math.floor(r() * 12) - 3 }; s.doPaste(); s.pasting = false; } }
      else if (x < 0.68) { op = 'groupe'; if (s.sel) s.assignSelection(Math.floor(r() * 4)); }
      else if (x < 0.78) {
        op = 'poser';
        const t = { t: pick(r, TYPES), x: Math.floor(r() * 10) - 2, z: Math.floor(r() * 10) - 2, l: Math.floor(r() * 5), r: Math.floor(r() * 4), s: r() < 0.3 ? pick(r, SURFACE_ORDER) : '', v: r() < 0.1 ? 1 : 0, o: r() < 0.1 ? 1 + Math.floor(r() * 2) : 0, nb: r() < 0.1, tn: r() < 0.1, mv: r() < 0.1 ? 1 + Math.floor(r() * 3) : 0, cp: r() < 0.1 ? 1 : 0, tb: r() < 0.05 };
        const nrm = Track.normalize(t);
        if (!(t.t === 'start' && track.startTile) && Track.inBounds(nrm) && !track.conflicts(nrm).length) { track.add(t); s._changed(); s._commit(); }
      } else if (x < 0.86) {
        op = 'option'; const t = pick(r, track.tiles);
        if (t) { const f = pick(r, ['v', 'nb', 'tn', 'mv', 'cp', 'tb', 'th', 'o']); track.toggleFlag(t, f, f === 'mv' ? 1 + Math.floor(r() * 3) : f === 'o' ? Math.floor(r() * 3) : f === 'th' ? 1 + Math.floor(r() * 3) : 1); s._changed(); s._commit(); }
      } else if (x < 0.92) {
        op = 'revêtement'; const t = pick(r, track.tiles);
        if (t) { const sf = pick(r, SURFACE_ORDER), S = SURFACES[sf]; track.setSurface(t, sf, S && S.def != null ? S.min + Math.floor(r() * (S.max - S.min)) : 0); if (t.mv) track.setMover(t, 25 + Math.floor(r() * 275), pick(r, [0.5, 1, 2, 3, 8, 90, 360])); s._changed(); s._commit(); }
      } else {
        op = 'décoration';
        track.addDeco({ k: pick(r, DECO_ORDER.filter((k) => k !== 'custom')), x: r() * 300 - 50, y: r() * 10, z: r() * 300 - 50, ry: r() * 6.28 - 3.14, s: 0.2 + r() * 3, c: Math.floor(r() * 4), rx: r() < 0.3 ? r() * 2 - 1 : 0, rz: r() < 0.3 ? r() * 2 - 1 : 0, ph: r() });
        s._changed(); s._commit();
      }
      ops++;
      assert.deepEqual(structure(track), [], `séquence ${seed}, opération ${i} (${op})`);
      assert.equal(s._snapshot(), s.history[s.hIndex], `séquence ${seed}, opération ${i} (${op}) : le circuit a changé sans pas d'annulation`);
    }
    const fwd = [];
    while (s.hIndex > 0) s.undo();
    fwd.push(track.encode());
    while (s.hIndex < s.history.length - 1) { s.redo(); fwd.push(track.encode()); }
    const back = [track.encode()];
    while (s.hIndex > 0) { s.undo(); back.unshift(track.encode()); }
    assert.deepEqual(back, fwd, `séquence ${seed} : annuler et rétablir parcourent les mêmes états`);
    cleanup(s);
  }
  assert.equal(ops, 120 * 70);
});

console.log('Vérificateur');
test('règle « gravité inversée au départ » sans départ au plafond : le vérificateur le signale (la voiture tombait vers le ciel et réapparaissait sans fin) ; un départ au plafond ne signale rien', () => {
  const bad = scriptTrack('f', 'start S3 finish'); bad.setParams({ flip0: true });
  const msgs = checkTrack(bad).filter((i) => /Gravité inversée au départ/.test(i.msg));
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].level, 'error'); assert.equal(msgs[0].tile, bad.startTile);
  // La situation est réelle : la course ne peut pas commencer (rappel automatique en boucle).
  const sim = new Simulation(bad); sim.start();
  let lost = 0;
  for (let i = 0; i < 120 * 30; i++) { sim.step({ steer: 0, throttle: true, brake: false }); if (sim.lost) { lost++; sim.rewind(); } }
  assert.ok(lost >= 2 && !sim.logic.finished, 'sans plafond : la voiture est rappelée en boucle (' + lost + ' fois en 30 s)');
  const good = scriptTrack('g', 'start^ S3^ finish^', { l: 6 }); good.setParams({ flip0: true });
  assert.equal(checkTrack(good).filter((i) => /Gravité inversée/.test(i.msg)).length, 0);
  const plain = scriptTrack('p', 'start S3 finish');
  assert.equal(checkTrack(plain).filter((i) => /Gravité inversée/.test(i.msg)).length, 0);
});

console.log('Codes de circuit fabriqués');
test('un code aux coordonnées démesurées ou au réglage non numérique est ramené dans les bornes : index sans collision, signature stable, aucun NaN', () => {
  const code = 'SHW3:' + b64encode(JSON.stringify({ v: 3, n: 'x', a: '', d: 'desert', t: [7, 0, 0, 0, 0, 0, 0, 0, 0, 2000000000, 5, 0, 0, 1, 'abc', 0, 0, -99999, 99999, 0, 0, 2, 'zz', 0, 0, 520192, 0, 0, 0, 0, 0, 0] }));
  const tr = Track.decode(code);
  assert.equal(tr.tiles.length, 4);
  assert.ok(tr.tiles.every((t) => Math.abs(t.x) <= MAX_CELL && Math.abs(t.z) <= MAX_CELL), 'cases bornées');
  assert.ok(tr.tiles.every((t) => Number.isFinite(t.p)), 'réglages numériques');
  assert.ok(!/NaN/.test(tr.signatureText()));
  assert.equal(Track.decode(tr.encode()).signature(), tr.signature(), 'le code relu a la même signature');
  // Chaque case de l'index ne contient que les pièces qui l'occupent vraiment (avant : x = 520192 retombait dans la case de x = -4096).
  for (const t of tr.tiles) assert.deepEqual(tr.tilesAt(t.x, t.z), [t]);
  assert.deepEqual(structure(tr).filter((e) => !/hors des niveaux/.test(e)), []);
  // Un circuit ordinaire n'est pas touché.
  const ok = scriptTrack('o', 'start S3 R S2 finish');
  assert.equal(Track.decode(ok.encode()).encode(), ok.encode());
});

finish('Tous les tests de l\'audit de l\'éditeur passent.');
