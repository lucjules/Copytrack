// Éditeur 0.12.0 : les défauts trouvés par l'analyse de la 0.11.4, chacun avec son test : node tools/test-editeur-012.mjs   (npm test)
// Échap, perte de travail en quittant, vérificateur trop lent sur un grand circuit, import qui perdait la logique, calques verrouillés, collage sur le départ,
// pincement à deux doigts, pastille après les paramètres, pipette pendant un collage, historique d'annulation gardé pendant un essai, conversion des déclencheurs.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';

// Stockage du navigateur simulé (Mes circuits, brouillon) : avant tout import du jeu.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); },
  key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; }, clear: () => mem.clear(),
};

const { EditorSession } = await import('../js/editor.js');
const { Track } = await import('../js/track.js');
const { checkTrack, pasteClip, copyRect } = await import('../js/editorTools.js');
const { scriptsToLogic } = await import('../js/logicText.js');
const { listMyTracks } = await import('../js/storage.js');

const noop = new Proxy({}, { get: () => () => {} });
// Une session d'éditeur sans rendu ni page : ce que les méthodes testées lisent, rien de plus.
function session(track, extra = {}) {
  const flashes = [], calls = [];
  const self = Object.create(EditorSession.prototype);
  Object.defineProperty(self, 'menuOpen', { value: false, writable: true });
  Object.assign(self, {
    track, flashes, calls, history: [], histSel: [], hIndex: -1,
    inspector: { describe: () => null, restore() {}, refresh() {}, clear() { calls.push('insp.clear'); self.inspector.active = false; }, duplicate() { return false; }, active: false },
    app: { audio: noop, settings: {}, ui: { flash: (m) => flashes.push(m), modal() {}, closeModal() {}, modalOpen: false }, leaveEditor() { calls.push('leave'); } },
    _refreshUI() {}, _applyDecor() {}, gridKey: '', tool: 'straight', sel: null, pasting: false, level: 0, rot: 0, focusLevel: false, _refreshSelBar() {}, _clearPreview() {},
    hover: { cx: 0, cz: 0, x: 16, z: 16 }, view: noop, opts: {}, target: { x: 0, z: 0, set() {} }, dist: 200, _prepareAutoLevel() {}, needsRebuild: false, surfParam: {}, deco: {},
    setTab() {}, _render() {}, famTraits: {},
    ...extra,
  });
  self.history = [self._snapshot()]; self.histSel = [null]; self.histRect = [null]; self.hIndex = 0;
  self._savedSnap = self._saveKey();
  return self;
}
const add = (tr, t, x, z, extra = {}) => tr.add({ t, x, z, l: 0, r: 0, ...extra });
const inputWith = (keys = [], pads = []) => {
  const pressed = new Set(keys);
  return { padEdges: new Set(pads), hit: (c) => pressed.delete(c), act: () => false, down: () => false, held: () => false, padEditor: () => null };
};

console.log('Échap');
test('Échap referme l’inspecteur, puis retire la sélection, puis ramène au menu (avant : la touche était perdue au premier test)', () => {
  const tr = new Track('e'); add(tr, 'start', 0, 0);
  const s = session(tr);
  s.inspector.active = true; s.sel = { x0: 0, z0: 0, x1: 1, z1: 1 };
  s.app.input = inputWith(['Escape']); s.update(0.016);
  assert.deepEqual(s.calls, ['insp.clear'], 'd’abord l’inspecteur');
  assert.ok(s.sel, 'la sélection reste');
  s.app.input = inputWith(['Escape']); s.update(0.016);
  assert.equal(s.sel, null, 'puis la sélection');
  s.app.input = inputWith(['Escape']); s.update(0.016);
  assert.deepEqual(s.calls, ['insp.clear', 'leave'], 'puis le retour au menu');
});
test('le bouton pause de la manette fait de même ; Échap avec le menu ☰ ouvert ne fait que le refermer', () => {
  const tr = new Track('e'); add(tr, 'start', 0, 0);
  const s = session(tr);
  s.app.input = inputWith([], ['pause']); s.update(0.016);
  assert.deepEqual(s.calls, ['leave']);
  const m = session(tr); let closed = 0;
  m.menuOpen = true; m.toggleMenu = () => { closed++; m.menuOpen = false; };
  m.app.input = inputWith(['Escape']); m.update(0.016);
  assert.equal(closed, 1); assert.deepEqual(m.calls, [], 'ni inspecteur, ni retour au menu');
});

console.log('Travail enregistré');
test('quitter l’éditeur après une modification enregistre le circuit dans « Mes circuits » ; un circuit neuf jamais touché ne crée rien', () => {
  const tr = new Track('Projet A'); add(tr, 'start', 0, 0);
  const s = session(tr);
  assert.equal(s.isDirty(), false);
  assert.equal(s.autoSave(), '', 'rien à enregistrer');
  add(tr, 'straight', 0, -1); s._commit();
  assert.equal(s.isDirty(), true);
  assert.equal(s.autoSave(), 'saved');
  const e = listMyTracks().find((x) => x.id === s.entryId);
  assert.ok(e, 'entrée créée'); assert.equal(Track.decode(e.code).tiles.length, 2);
  assert.equal(s.isDirty(), false, 'enregistré');
  add(tr, 'straight', 0, -2); s._commit();
  s.autoSave();
  assert.equal(Track.decode(listMyTracks().find((x) => x.id === s.entryId).code).tiles.length, 3, 'la même entrée est mise à jour');
  const before = listMyTracks().length;
  const n = session(new Track('Vide')); add(n.track, 'start', 0, 0); n._savedSnap = null;
  assert.equal(n.autoSave(), '', 'un départ seul ne vaut pas une entrée');
  assert.equal(listMyTracks().length, before);
});
test('« Nouveau » et l’import enregistrent d’abord le circuit en cours ; une vérification de l’auteur compte comme une modification', () => {
  const tr = new Track('Projet B'); add(tr, 'start', 0, 0); add(tr, 'straight', 0, -1);
  const s = session(tr); s._savedSnap = null;
  s.newTrack();
  const e = listMyTracks().find((x) => x.name === 'Projet B');
  assert.ok(e, 'Projet B gardé'); assert.equal(Track.decode(e.code).tiles.length, 2);
  assert.equal(tr.tiles.length, 1, 'circuit neuf'); assert.equal(s.isDirty(), false);
  add(tr, 'straight', 0, -1); add(tr, 'finish', 0, -2); s._commit(); s.save(true);
  tr.setVerified(12.5);
  assert.equal(s.isDirty(), true, 'la course de vérification change le code partagé : à enregistrer');
});
test('exportState dit si le brouillon était enregistré ; un brouillon modifié le reste à la réouverture', () => {
  const tr = new Track('C'); add(tr, 'start', 0, 0);
  const s = session(tr); s.exportState = EditorSession.prototype.exportState;
  s.target = { x: 0, z: 0 }; s.yaw = 0; s.pitch = 1; s.eraseFilter = 'all';
  assert.equal(s.exportState().dirty, false);
  add(tr, 'straight', 0, -1); s._commit();
  assert.equal(s.exportState().dirty, true);
});

console.log('Vérificateur');
test('un circuit de 5 000 pièces se vérifie en moins d’une seconde et demie (avant : 3,9 s à chaque pose)', () => {
  const tr = new Track('gros'); add(tr, 'start', 0, -1);
  for (let k = 0, z = 0; k < 5000; z++) for (let x = 0; x < 50 && k < 5000; x++, k++) add(tr, 'straight', z % 2 ? 49 - x : x, z * 2, { r: 1 });
  const t0 = performance.now(); const issues = checkTrack(tr); const dt = performance.now() - t0;
  assert.ok(dt < 1500, `${dt.toFixed(0)} ms`);
  assert.ok(issues.some((i) => /reliée à rien/.test(i.msg)), 'les bouts du serpentin restent signalés');
});
test('la pastille se recalcule après les paramètres du niveau (gravité inversée au départ : erreur signalée tout de suite)', () => {
  const tr = new Track('g'); add(tr, 'start', 0, 0); add(tr, 'straight', 0, -1); add(tr, 'finish', 0, -2);
  const s = session(tr);
  assert.ok(!s._tileIssues().some((i) => /Gravité inversée/.test(i.msg)));
  tr.setParams({ flip0: true });
  assert.ok(s._tileIssues().some((i) => /Gravité inversée/.test(i.msg)), 'le cache du vérificateur suit les règles de course');
});

console.log('Import, collage, calques');
test('« Charger dans l’éditeur » garde la logique, les noms de groupes, l’auteur et la vérification', () => {
  const src = new Track('Porte'); add(src, 'start', 0, 0); add(src, 'straight', 0, -1, { g: 2 }); add(src, 'finish', 0, -2);
  src.author = 'Lu'; src.setGroupName(2, 'Porte nord');
  src.setLogic({ off: [2], rules: [{ on: ['cp', 1], do: [['show', 2]], once: true }] });
  src.setVerified(9.87);
  const tr = new Track('x'); add(tr, 'start', 0, 0);
  const s = session(tr); s.recenter = () => {};
  s.loadCode(src.encode());
  assert.deepEqual(tr.groupNames(), [[2, 'Porte nord']]);
  assert.equal(tr.lg.rules.length, 1);
  assert.equal(tr.author, 'Lu');
  assert.equal(tr.signature(), src.signature(), 'même signature');
  assert.equal(tr.verified, true, 'la vérification de l’auteur reste valable');
});
test('coller une zone sur le départ ne le supprime plus ; le départ du presse-papiers, lui, le remplace', () => {
  const tr = new Track('p'); add(tr, 'start', 3, 3); add(tr, 'straight', 3, 2);
  const clip = { w: 1, h: 2, tiles: [{ t: 'straight', x: 0, z: 0, l: 0, r: 0 }, { t: 'straight', x: 0, z: 1, l: 0, r: 0 }], decos: [] };
  const r = pasteClip(tr, clip, 3, 2, 0);
  assert.equal(tr.count('start'), 1, 'le départ reste');
  assert.equal(r.added, 1); assert.equal(r.skipped, 1);
  const withStart = copyRect(tr, { x0: 3, z0: 3, x1: 3, z1: 3 });
  const tr2 = new Track('p2'); add(tr2, 'start', 0, 0);
  pasteClip(tr2, withStart, 0, 0, 0);
  assert.equal(tr2.count('start'), 1, 'départ remplacé, toujours un seul');
  pasteClip(tr2, withStart, 5, 5, 0);
  assert.equal(tr2.count('start'), 1, 'pas de second départ ailleurs');
});
test('calque verrouillé ou masqué : la pose, le collage et le pot de peinture ne touchent plus ses pièces', () => {
  const tr = new Track('l'); add(tr, 'start', 0, 5); add(tr, 'straight', 0, 0, { g: 3 }); add(tr, 'straight', 1, 0, { r: 1 }); add(tr, 'straight', 2, 0, { r: 1, g: 3 });
  const s = session(tr, { tool: 'platform', lockedGroups: new Set([3]) });
  s._act();
  assert.equal(tr.tilesAt(0, 0)[0].t, 'straight', 'pièce verrouillée gardée');
  assert.ok(/verrouillé/.test(s.flashes.at(-1)));
  s.hiddenGroups = new Set([3]); s.lockedGroups = new Set();
  s._act();
  assert.equal(tr.tilesAt(0, 0)[0].t, 'straight', 'pièce masquée gardée');
  s.hiddenGroups = new Set(); s.lockedGroups = new Set([3]);
  const r = pasteClip(tr, { w: 1, h: 1, tiles: [{ t: 'platform', x: 0, z: 0, l: 0, r: 0 }], decos: [] }, 2, 0, 0, (o) => s._layerOk(o));
  assert.equal(r.guarded, 1); assert.equal(tr.tilesAt(2, 0)[0].t, 'straight');
  s.tool = 'fill-surf:ice'; s._emptyFillTarget = () => false; s._targetTile = () => tr.tilesAt(1, 0)[0];
  s._floodFill();
  assert.deepEqual([0, 1, 2].map((x) => tr.tilesAt(x, 0)[0].s), ['', 'ice', ''], 'la zone s’arrête au calque verrouillé');
});

console.log('Gestes et outils');
test('pincer à deux doigts puis relever le doigt immobile ne pose rien (avant : une pièce posée)', () => {
  const tr = new Track('t'); add(tr, 'start', 0, 0);
  let acts = 0;
  const s = session(tr, { pointers: new Map(), camLocked: false, _setNdc() {}, _updateHover() {}, _act() { acts++; }, _commit() {}, _pan() {}, minDist: () => 25, yaw: 0, _ptrY: null, _shiftY: () => false });
  s.inspector.gizmoBusy = false;
  s.app.audio = noop; s.app.renderer = { domElement: {} };
  const ev = (id, x, y) => ({ pointerId: id, pointerType: 'touch', clientX: x, clientY: y, button: 0, target: s.app.renderer.domElement, shiftKey: false, preventDefault() {} });
  s._onDown(ev(1, 100, 100)); s._onDown(ev(2, 300, 100));
  for (let i = 1; i <= 8; i++) s._onMove(ev(1, 100 - i * 10, 100));
  s._onUp(ev(1, 20, 100)); s._onUp(ev(2, 300, 100));
  assert.equal(acts, 0, 'aucune pose');
  s._onDown(ev(3, 200, 200)); s._onUp(ev(3, 200, 200));
  assert.equal(acts, 1, 'un simple toucher pose toujours');
});
test('la pipette pendant un collage le quitte : R tourne ensuite la pièce, pas le presse-papiers', () => {
  const tr = new Track('pp'); add(tr, 'start', 0, 0); add(tr, 'curve', 2, 2, { l: 1, r: 3 });
  const s = session(tr, { tool: 'select', pasting: true, sel: { x0: 0, z0: 0, x1: 1, z1: 1 }, clip: { w: 1, h: 1, tiles: [], decos: [] } });
  s._targetTile = () => tr.tilesAt(2, 2)[0];
  s.guidedAllows = () => true;
  s._pick();
  assert.equal(s.tool, 'curve'); assert.equal(s.pasting, false); assert.equal(s.sel, null);
  assert.equal(s.rot, 3); assert.equal(s.level, 1);
});
test('l’état de l’éditeur traverse un essai : historique d’annulation, presse-papiers, options armées, calques', () => {
  const tr = new Track('k'); add(tr, 'start', 0, 0);
  const s = session(tr);
  add(tr, 'straight', 0, -1); s._commit(); add(tr, 'straight', 0, -2); s._commit();
  s.clip = { w: 1, h: 1, tiles: [{ t: 'curve', x: 0, z: 0, l: 0, r: 0 }], decos: [] }; s.opts = { tn: 1 }; s.lockedGroups = new Set([4]);
  const keep = s._keepState();
  const tr2 = Track.decode(tr.encode());
  const s2 = session(tr2);
  assert.equal(keep.history[keep.hIndex], s2.history[0], 'même état : la reprise est possible');
  s2._restoreKeep(keep);
  assert.equal(s2.history.length, 3); assert.equal(s2.clip.tiles[0].t, 'curve'); assert.equal(s2.opts.tn, 1); assert.ok(s2.lockedGroups.has(4));
  s2.undo();
  assert.equal(tr2.tiles.length, 2, 'Ctrl+Z annule la dernière pose faite avant l’essai');
});
test('conversion des déclencheurs : les cases converties sont nommées (cells) ; les autres déclencheurs restent', () => {
  const tr = new Track('d'); add(tr, 'start', 0, 0); add(tr, 'straight', 0, -1);
  tr.setParams({ scripts: [{ x: 0, z: -1, a: 'msg', v: 'Salut' }, { x: 9, z: 9, a: 'msg', v: 'Rien ici' }] });
  const r = scriptsToLogic(tr);
  assert.deepEqual([...r.cells], ['0,-1']);
  assert.equal(r.lg.rules.length, 1);
});

finish('Tous les tests des corrections de l’éditeur 0.12.0 passent.');
