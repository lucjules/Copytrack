// Éditeur, phase 1 après l'audit 0.9.59 : outil « Prolonger » (js/extend.js), restauration du rectangle de sélection par annuler / rétablir, aide à la pose,
// correction en un clic : node tools/test-editeur-phase1.mjs   (npm test)
// Les constructions sont COMPLÈTES : on déroule un circuit pièce par pièce avec l'outil, puis le vérificateur et le vrai moteur (pilote automatique) jugent le résultat.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { EditorSession } from '../js/editor.js';
import { Track } from '../js/track.js';
import { PIECES } from '../js/pieces.js';
import { extendPlan } from '../js/extend.js';
import { continuityIssues, pieceHint } from '../js/continuity.js';
import { checkTrack } from '../js/editorTools.js';
import { centerlineWorld } from '../js/ribbons.js';
import { CarPhysics } from '../js/physics.js';
import { RaceLogic, placeAtStart } from '../js/raceLogic.js';
import { Autopilot } from '../js/autopilot.js';

// Déroule une liste d'étapes [type, options, revêtement] avec extendPlan ; renvoie { track, steps } (chaque étape : la pièce posée ou la raison du refus).
function build(seq, level = 12) {
  const tr = new Track('p1');
  tr.add(Track.normalize({ t: 'start', x: 0, z: 0, l: level, r: 0 }));
  let last = tr.tiles[0];
  const steps = [];
  for (const [type, opts = {}, surf = ''] of seq) {
    const r = extendPlan(tr, last, type, opts);
    steps.push(r);
    if (!r.tile) break;
    const t = tr.add(r.tile);
    if (surf) tr.setSurface(t, surf, 0);
    last = t;
  }
  return { tr, steps, last };
}
// Roule la construction au pilote automatique (chemin = lignes centrales dans l'ordre de pose) ; renvoie { finished, fell }.
function ride(tr, seq, speed = 150) {
  const path = [];
  for (const t of tr.tiles) {
    const rev = t._rev;
    const pts = centerlineWorld(t, PIECES[t.t].size >= 2 ? 12 : 6, !!rev);
    if (path.length) pts.shift();
    path.push(...pts);
  }
  tr.path = path;
  const ph = new CarPhysics(tr), lg = new RaceLogic(tr); placeAtStart(ph, lg); ph.graceT = 0;
  const bot = new Autopilot(path); bot.reset(ph);
  let finished = null, fell = '';
  for (let i = 0; i < 120 * 60 && !finished; i++) {
    ph.clock = i; ph.step({ steer: bot.control(ph).steer, throttle: ph.speed * 3.6 < speed, brake: false });
    if (ph.lost) { fell = 'perdue'; break; }
    if (ph.pos.y < tr.bounds().minY - 3) { fell = 'terrain'; break; }
    const e = lg.update(ph); if (e && e.type === 'finish') finished = lg.time;
  }
  return { finished, fell };
}
const ok = (r) => assert.ok(r.every((s) => s.tile), r.map((s) => s.why || 'ok').join(' | '));

console.log('Outil « Prolonger » (extend.js)');
test('au sol : ligne, virages, pentes et courbes se raccordent l\'une après l\'autre, au bon cap et à la bonne hauteur', () => {
  const { tr, steps } = build([['straight'], ['straight'], ['curve'], ['straight'], ['slope'], ['straight'], ['bigcurve'], ['cro1'], ['straight'], ['finish']]);
  ok(steps);
  assert.deepEqual(checkTrack(tr).filter((i) => i.level === 'error').map((i) => i.msg), [], 'aucune extrémité libre ni inaccessible');
  assert.deepEqual(continuityIssues(tr).filter((i) => i.level !== 'info'), []);
});
test('sur un mur : l\'orientation de la route est reprise toute seule pour une ligne ou un virage (« orientation déduite »)', () => {
  const { tr, steps } = build([['straight'], ['tr01s'], ['straight'], ['curve'], ['straight'], ['tr10s'], ['straight'], ['finish']]);
  ok(steps);
  assert.equal(steps[2].inferred, true, 'la ligne après la transition est posée sur le mur sans qu\'on arme l\'orientation');
  assert.equal(tr.tiles[3].o, 1);
  assert.deepEqual(continuityIssues(tr).filter((i) => i.level !== 'info'), []);
});
test('au plafond : vrille avec inversion, route retournée reprise automatiquement, vrille « retour » posée à contresens', () => {
  const { tr, steps } = build([['straight'], ['twist', {}, 'flip'], ['straight'], ['straight'], ['twist', {}, 'flip'], ['straight'], ['finish']]);
  ok(steps);
  assert.equal(tr.tiles[3].v, 1);
  assert.equal(steps[4].reverse, true, 'le retour de la vrille se pose à contresens');
  assert.deepEqual(continuityIssues(tr).filter((i) => i.level !== 'info'), []);
});
test('refus expliqués : sol contre mur, pièce sans route, circuit sans départ, case occupée', () => {
  const g = build([['straight']]);
  const a = extendPlan(g.tr, g.last, 'straight', { o: 1 });
  assert.ok(a.tile, 'ligne sur mur : refusée par le roulis ET rattrapée par l\'orientation déduite (sol → on garde le sol)');
  const w = build([['straight'], ['tr01s']]);
  // (phase 3 : un looping ↱ au bout d'un mur gauche reprend l'orientation de la route (looping sur un mur) ; un looping ↰, qui ne tient pas sur ce mur, reçoit la transition qui ramène la route
  // au sol : raccordement automatique. Détail : tools/test-orientations-3d.mjs.)
  const bad = extendPlan(w.tr, w.last, 'loop', {});
  assert.ok(bad.tile && bad.inferred && bad.tile.o === 1, JSON.stringify(bad.why));
  const br = extendPlan(w.tr, w.last, 'loopL', {});
  assert.ok(br.bridged && br.chain.length === 2 && br.chain[0].t === 'tr10s' && br.chain[1].t === 'loopL', JSON.stringify(br.why || (br.chain && br.chain.map((t) => t.t))));
  assert.match(extendPlan(g.tr, g.last, 'platform').why, /ne se pose pas au bout d'une route/);
  assert.match(extendPlan(g.tr, null, 'straight').why, /pose d'abord le départ/);
  const occ = build([['straight'], ['straight']]);
  occ.tr.add(Track.normalize({ t: 'platform', x: 0, z: -3, l: 12, r: 0 }));      // (une plateforme n'a pas d'extrémité : le bout reste libre mais la case est prise)
  assert.match(extendPlan(occ.tr, occ.last, 'straight').why, /déjà posée/);
  const fin = build([['straight'], ['finish']]);
  assert.match(extendPlan(fin.tr, fin.last, 'straight').why, /extrémité libre/);
});
test('hors des niveaux : le refus le dit (descendre sous le sol)', () => {
  const { tr, last } = build([['straight']], 1);
  const r = extendPlan(tr, last, 'dn4', {});
  assert.ok(!r.tile && /niveaux/.test(r.why), r.why);
});
test('TOUTES les pièces de route : chacune se pose au bout d\'une ligne droite au sol quand son roulis d\'entrée est celui du sol, et le résultat est un raccord parfait', () => {
  let n = 0;
  for (const type of Object.keys(PIECES)) {
    const P = PIECES[type];
    if (['ring', 'area', 'fork'].includes(P.kind) || P.special === 'start' || P.special === 'finish' || ['rollL', 'rollR', 'sideL', 'sideR'].includes(type)) continue;
    const { tr, last } = build([['straight']], 12);
    const r = extendPlan(tr, last, type, {});
    if (!r.tile) continue;                      // (montée en L, transitions vers un mur… : roulis d'entrée différent du sol)
    n++;
    assert.equal(tr.conflicts(r.tile).length, 0, type);
    assert.deepEqual(continuityIssues((() => { const t2 = build([['straight']]).tr; t2.add(r.tile); return t2; })()).filter((i) => i.code === 'roll-mismatch'), [], type);
  }
  assert.ok(n > 80, `${n} pièces posées`);
});
test('les pièces d\'une montée en L s\'enchaînent entre elles : montée en L → mur → sommet', () => {
  const { tr, steps } = build([['straight'], ['ramp90'], ['wall'], ['crest90'], ['straight'], ['finish']], 4);
  ok(steps);
  assert.deepEqual(continuityIssues(tr).filter((i) => i.level !== 'info'), []);
});

console.log('\nConstructions complètes, roulées par le vrai moteur');
test('circuit au sol complet construit avec l\'outil : le pilote automatique le finit', () => {
  const seq = [['straight'], ['straight'], ['curve'], ['straight'], ['cdi1'], ['dn2'], ['cdo1'], ['bigcurve'], ['straight'], ['straight'], ['finish']];
  const { tr, steps } = build(seq, 6); ok(steps);
  const r = ride(tr, seq, 120); assert.ok(r.finished && !r.fell, JSON.stringify(r));
});
test('circuit avec looping, mur et vrille construit avec l\'outil : le vérificateur ne dit rien de grave et la voiture le finit', () => {
  const seq = [['straight'], ['straight'], ['loop'], ['straight'], ['tr01s'], ['straight'], ['straight'], ['tr10s'], ['straight'], ['twist', {}, 'flip'], ['straight'], ['twist', {}, 'flip'], ['straight'], ['straight'], ['finish']];
  const { tr, steps } = build(seq, 12); ok(steps);
  assert.deepEqual(continuityIssues(tr).filter((i) => i.level !== 'info'), []);
  const r = ride(tr, seq, 200); assert.ok(r.finished && !r.fell, JSON.stringify(r));
});
test('la même construction SANS l\'inversion de gravité de la vrille (phase 2) : plus aucun constat, et la voiture finit — la gravité suit la route de toute pièce qui la retourne', () => {
  const seq = [['straight'], ['straight'], ['twist'], ['straight'], ['twist'], ['straight'], ['finish']];
  const { tr, steps } = build(seq, 12); ok(steps);
  assert.deepEqual(continuityIssues(tr).filter((i) => i.level !== 'info'), []);
  const r = ride(tr, seq, 150); assert.ok(r.finished && !r.fell, JSON.stringify(r));
});

console.log('\nSession d\'éditeur : sélection et annulation, aide à la pose');
const noop = new Proxy(function () {}, { get: () => noop, apply: () => undefined });
const flashes = [];
const session = (track) => {
  const self = Object.create(EditorSession.prototype);
  Object.assign(self, {
    track, history: [], histSel: [], hIndex: -1, inspector: { describe: () => null, restore() {}, refresh() {}, duplicate() { return false; }, active: false },
    app: { audio: noop, ui: { flash: (m) => flashes.push(m), modal() {}, closeModal() {} } }, _refreshUI() {}, _applyDecor() {}, gridKey: '', tool: 'straight', sel: null, pasting: false, level: 12,
    focusLevel: false, _refreshSelBar() {}, _clearPreview() {}, hover: null, view: noop, opts: {}, target: { x: 0, z: 0, set() {} }, dist: 200, _prepareAutoLevel() {}, needsRebuild: false,
  });
  self.history = [self._snapshot()]; self.histSel = [null]; self.histRect = [null]; self.hIndex = 0;
  return self;
};
test('annuler / rétablir restaurent le rectangle de sélection sur lequel l\'opération agissait (avant : il restait tel quel)', () => {
  const tr = new Track('s');
  tr.add(Track.normalize({ t: 'start', x: 0, z: 0, l: 4, r: 0 }));
  for (let z = 1; z < 5; z++) tr.add(Track.normalize({ t: 'straight', x: 0, z: -z, l: 4, r: 0 }));
  const s = session(tr);
  s.sel = { x0: 0, z0: -3, x1: 0, z1: -2 }; s._noteSel();             // l'utilisateur sélectionne deux cases
  s.deleteSel();                                                       // … et les supprime (un pas d'historique)
  const afterDelete = s.sel ? { ...s.sel } : null;
  assert.equal(tr.tiles.length, 3);
  s.undo();
  assert.equal(tr.tiles.length, 5, 'les pièces reviennent');
  assert.deepEqual(s.sel, { x0: 0, z0: -3, x1: 0, z1: -2 }, 'la sélection revient avec elles');
  s.redo();
  assert.equal(tr.tiles.length, 3);
  assert.deepEqual(s.sel, afterDelete, 'rétablir : la sélection d\'après l\'opération');
  s.undo(); s.sel.x0 = 99;                                             // modifier la sélection restaurée…
  s.redo(); s.undo();
  assert.equal(s.sel.x0, 0, '… ne corrompt pas l\'historique (copie)');
  clearTimeout(s._draftT);
});
test('s.extend() : pose la pièce choisie au bout de la dernière pièce, la vue suit, annuler la retire', () => {
  const tr = new Track('s'); tr.add(Track.normalize({ t: 'start', x: 0, z: 0, l: 4, r: 0 }));
  const s = session(tr);
  s.tool = 'curve'; s._lastTile = tr.tiles[0];
  assert.equal(s.extend(), true);
  assert.equal(tr.tiles.length, 2);
  assert.equal(tr.tiles[1].t, 'curve');
  assert.equal(s.extend(), true);
  assert.equal(tr.tiles.length, 3, 'répéter : la pièce suivante se pose au bout de la précédente');
  s.undo(); assert.equal(tr.tiles.length, 2); s.undo(); assert.equal(tr.tiles.length, 1);
  clearTimeout(s._draftT);
});
test('s.extend() sur un refus : message explicite, circuit inchangé', () => {
  const tr = new Track('s'); tr.add(Track.normalize({ t: 'start', x: 0, z: 0, l: 4, r: 0 }));
  const s = session(tr); s.tool = 'platform'; s._lastTile = tr.tiles[0];
  flashes.length = 0;
  assert.equal(s.extend(), false);
  assert.match(flashes[0], /ne se pose pas au bout d'une route/);
  assert.equal(tr.tiles.length, 1);
  clearTimeout(s._draftT);
});
test('aide à la pose : un mur annonce 108 km/h, une ligne droite, la vrille et une transition retournée ne disent rien (la gravité suit la route : plus besoin de « Inversion de gravité »)', () => {
  assert.equal(pieceHint('twist'), '');
  assert.match(pieceHint('straight', { o: 1 }), /108 km\/h/);
  assert.equal(pieceHint('straight'), '');
  assert.equal(pieceHint('platform'), '');
  assert.doesNotMatch(pieceHint('tr10s', { v: 1 }), /Inversion de gravité/, 'une transition posée à l\'envers retourne la voiture d\'elle-même : seul le conseil de vitesse sur mur reste');
});
test('les nouveaux raccourcis existent et ne sont pas en double dans l\'éditeur', async () => {
  const { KEY_ACTIONS } = await import('../js/input.js');
  const ids = KEY_ACTIONS.editor.map((a) => a[0]);
  assert.ok(ids.includes('ed.extend'));
  const keys = KEY_ACTIONS.editor.flatMap((a) => a[2]).filter(Boolean);
  assert.ok(!keys.some((k, i) => k === 'KeyP' && keys.indexOf(k) !== i), 'KeyP n\'est attribuée qu\'une fois dans l\'éditeur');
  assert.ok(!KEY_ACTIONS.editor.filter((a) => a[0] !== 'ed.extend').some((a) => a[2].includes('KeyP')), 'P est libre dans l\'éditeur');
});

finish('Éditeur, phase 1 : tout passe.');
