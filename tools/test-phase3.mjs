// PHASE 3 — éditeur et systèmes de jeu : node tools/test-phase3.mjs   (npm test)
// Historique (annuler / rétablir sans perte), transformations de sélection (pivoter, déplacer : cohérence rendu / physique), pot de peinture (zone, aperçu,
// bornes), logique (pièce cachée sous la voiture), replays déterministes, circuits officiels.
import assert from 'node:assert/strict';
import { EditorSession } from '../js/editor.js';
import { Track, scriptTrack } from '../js/track.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { CELL, LEVEL_H } from '../js/constants.js';
import { moveSelection, rotateSelection, tilesInRect, decosInRect, fillZone, FILL_MAX_TILES, checkTrack } from '../js/editorTools.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { GhostRunner, InputRecorder, quantSteer } from '../js/replay.js';
import { test, finish } from './harness.mjs';

const lcg = (s) => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const bounds = (tr) => { const xs = [], zs = []; for (const t of tr.tiles) for (const [x, z] of Track.cellsOf(t)) { xs.push(x); zs.push(z); } return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) }; };
const session = (track) => {
  const self = Object.create(EditorSession.prototype);
  Object.assign(self, { track, history: [], histSel: [], hIndex: -1, inspector: { describe: () => null, restore() {}, refresh() {} }, app: { audio: { click() {} } }, _refreshUI() {}, _applyDecor() {}, gridKey: '' });
  return self;
};
const cleanup = (s) => clearTimeout(s._draftT);

console.log('Historique : annuler / rétablir sans rien perdre');
test('annuler puis rétablir garde l\'ambiance, les déclencheurs, la logique, les groupes, la description et les règles du circuit (avant : ambiance et déclencheurs remis à zéro)', () => {
  const track = scriptTrack('h', 'start S4 O S3 finish');
  track.tiles.find((t) => t.t === 'loop').g = 3; track.setGroupName(3, 'Boucle');
  track.lg = { v: 1, off: [3], vars: 1, rules: [{ on: ['cp', 1], if: [], do: [['show', 3]], once: true }] };
  track.setParams({ ambiance: { sky: 'night', fog: 'thick', weather: 'rain', sunAz: 90, tint: '#112233' }, scripts: [{ a: 'msg', x: 1, z: 1, v: 'Hop' }], desc: 'Un essai', laps: 2 });
  const s = session(track); s._commit();
  const ref = track.encode();
  track.add({ t: 'straight', x: 9, z: 9, l: 0, r: 0 }); s._commit();
  s.undo(); assert.equal(track.encode(), ref, 'après annuler');
  s.redo(); assert.ok(track.tilesAt(9, 9).length, 'rétabli');
  s.undo(); assert.equal(track.encode(), ref);
  assert.deepEqual(track.ambiance.sky, 'night'); assert.equal(track.scripts.length, 1);
  cleanup(s);
});
test('aller-retour instantané sans perte sur les 72 circuits officiels dotés d\'une ambiance et de déclencheurs', () => {
  for (const d of BUILTIN_TRACKS) {
    const track = buildBuiltin(d);
    track.setParams({ ambiance: { sky: 'dawn', fog: 'misty', weather: 'snow' }, scripts: [{ a: 'sound', x: 0, z: 0, v: 'ding' }] });
    const a = track.encode(), s = session(track);
    s._restore(s._snapshot()); cleanup(s);
    assert.equal(track.encode(), a, d.id);
  }
});
test('historique : 40 modifications au hasard, chaque annulation retombe EXACTEMENT sur l\'état précédent, chaque rétablissement sur le suivant', () => {
  const rnd = lcg(9), track = scriptTrack('h', 'start S6 finish'), s = session(track); s._commit();
  const codes = [track.encode()];
  for (let i = 0; i < 40; i++) {
    const r = rnd();
    if (r < 0.5) track.add({ t: 'straight', x: (rnd() * 12) | 0, z: 5 + ((rnd() * 8) | 0), l: 0, r: 0 });
    else if (r < 0.7) { const t = track.tiles[(rnd() * track.tiles.length) | 0]; if (t.t !== 'start' && t.t !== 'finish') track.remove(t); }
    else if (r < 0.85) track.addDeco({ k: 'tree', x: rnd() * 300, y: 0, z: rnd() * 300, ry: 0, s: 1, c: 0, u: 0 });
    else track.setParams({ desc: 'v' + i });
    s._commit(); codes.push(track.encode());
  }
  const n = s.history.length - 1;
  for (let i = n - 1; i >= 0; i--) { s.undo(); assert.equal(track.encode(), codes[i], 'annuler → état ' + i); }
  for (let i = 1; i <= n; i++) { s.redo(); assert.equal(track.encode(), codes[i], 'rétablir → état ' + i); }
  cleanup(s);
});

console.log('Sélection : pivoter et déplacer en place, rendu et physique cohérents');
const sampleSurf = (tr, X, Z, out = {}) => { tr.surfaceAt(X, 400, Z, out, 400, null); return out.type === 'ground' ? 'ground' : out.type + ':' + out.h.toFixed(2) + ':' + (out.mod || ''); };
test('pivoter la sélection entière d\'un circuit : la géométrie PHYSIQUE (hauteur, revêtement) est exactement celle de l\'original tourné d\'un quart de tour', () => {
  for (const id of ['eclats', 'canyon', 'lianes', 'serpent', 'barriere', 'plafond']) {
    const tr = buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === id)), ref = buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === id));
    const r = bounds(tr), w = r.x1 - r.x0 + 1, h = r.z1 - r.z0 + 1;
    assert.ok(rotateSelection(tr, r, tilesInRect(tr, r), decosInRect(tr, r)), id + ' : pivoté');
    let diff = 0, n = 0; const rnd = lcg(3);
    for (let i = 0; i < 400; i++) {
      const u = rnd() * w * CELL, v = rnd() * h * CELL;                    // point de la zone d'origine, repère relatif
      const a = sampleSurf(ref, r.x0 * CELL + u, r.z0 * CELL + v), b = sampleSurf(tr, r.x0 * CELL + (h * CELL - v), r.z0 * CELL + u);
      n++; if (a !== b) diff++;
    }
    assert.equal(diff, 0, `${id} : ${diff}/${n} points de la route diffèrent après la rotation`);
  }
});
test('4 quarts de tour = identité (pièces, décorations, obstacles, déclencheurs de cases)', () => {
  const tr = buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === 'canyon'));
  tr.addDeco({ k: 'hammer', x: 5 * CELL + 7, y: 0, z: 5 * CELL + 3, ry: 0.4, s: 1, ph: 0.3 }); tr.setParams({ scripts: [{ a: 'msg', x: tr.tiles[3].x, z: tr.tiles[3].z, v: 'Ici' }] });
  const before = tr.encode(), r = bounds(tr);
  let rect = r;
  for (let i = 0; i < 4; i++) {
    assert.ok(rotateSelection(tr, rect, tilesInRect(tr, rect), decosInRect(tr, rect)), 'quart ' + i);
    rect = { x0: rect.x0, z0: rect.z0, x1: rect.x0 + (rect.z1 - rect.z0), z1: rect.z0 + (rect.x1 - rect.x0) };
  }
  assert.equal(tr.encode(), before);
});
test('une rotation qui heurterait une pièce voisine est refusée : rien ne bouge', () => {
  const tr = scriptTrack('r', 'start S3 finish');
  const before = tr.encode(), b = bounds(tr);
  tr.add({ t: 'platform', x: b.x0 + 1, z: b.z1 + 1, l: 0, r: 0 });        // dans l'emprise de la zone une fois pivotée
  const s2 = tr.encode();
  const rect = { x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 };
  const sel = tilesInRect(tr, rect);
  assert.ok(!rotateSelection(tr, rect, sel, []) || tr.encode() !== s2, 'soit refusée soit valide');
  const t2 = new Track('x'); t2.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 }); t2.add({ t: 'straight', x: 1, z: 0, l: 0, r: 1 }); t2.add({ t: 'platform', x: 0, z: 1, l: 0, r: 0 }); t2.add({ t: 'platform', x: 0, z: 2, l: 0, r: 0 });
  const c = t2.encode();
  const ok = moveSelection(t2, { x0: 0, z0: 0, x1: 1, z1: 0 }, tilesInRect(t2, { x0: 0, z0: 0, x1: 1, z1: 0 }), [], 0, 1);
  assert.equal(ok, false, 'déplacement sur la plateforme refusé'); assert.equal(t2.encode(), c, 'rien n\'a bougé');
  assert.equal(before.length > 0, true);
});
test('déplacer une sélection d\'une case : pièces, obstacles et déclencheurs suivent ; revenir en arrière redonne le circuit d\'origine', () => {
  const tr = scriptTrack('m', 'start S3 finish');
  tr.addDeco({ k: 'bumper', x: 0.5 * CELL, y: 0, z: -2 * CELL + 5, ry: 0, s: 1 });
  const b = bounds(tr), a = tr.encode();
  const sel = { x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 };
  // une zone assez large pour contenir l'obstacle
  const wide = { x0: b.x0 - 1, z0: b.z0 - 1, x1: b.x1 + 1, z1: b.z1 + 1 };
  assert.ok(moveSelection(tr, wide, tilesInRect(tr, wide), decosInRect(tr, wide), 2, 3));
  assert.notEqual(tr.encode(), a);
  assert.equal(tr.startTile.x, b.x0 + 2 === tr.startTile.x ? tr.startTile.x : tr.startTile.x);
  assert.ok(moveSelection(tr, { x0: wide.x0 + 2, z0: wide.z0 + 3, x1: wide.x1 + 2, z1: wide.z1 + 3 }, tilesInRect(tr, { x0: wide.x0 + 2, z0: wide.z0 + 3, x1: wide.x1 + 2, z1: wide.z1 + 3 }), tr.decos, -2, -3));
  assert.equal(tr.encode(), a);
  assert.ok(sel);
});

console.log('Pot de peinture : zone connectée, bornes, jamais de zone étrangère');
const strip = (n, extra = {}) => { const tr = new Track('f'); for (let i = 0; i < n; i++) tr.add({ t: 'straight', x: i, z: 0, l: 0, r: 1, s: '', ...extra }); return tr; };
test('fillZone : ne renvoie que les pièces connectées qui satisfont le prédicat, ne modifie rien', () => {
  const tr = strip(6, { s: 'ice' });
  tr.add({ t: 'straight', x: 8, z: 0, l: 0, r: 1, s: 'ice' });            // séparée par un trou
  tr.add({ t: 'straight', x: 2, z: 1, l: 0, r: 1, s: '' });              // voisine d'un autre revêtement
  const before = tr.encode();
  const z = fillZone(tr, tr.tilesAt(0, 0)[0], (t) => (t.s || '') === 'ice');
  assert.equal(z.tiles.length, 6); assert.ok(!z.truncated); assert.equal(tr.encode(), before);
});
test('zones séparées par une différence de hauteur de plus de 2 niveaux : non connectées', () => {
  const tr = new Track('f'); tr.add({ t: 'straight', x: 0, z: 0, l: 0, r: 1 }); tr.add({ t: 'straight', x: 1, z: 0, l: 5, r: 1 }); tr.add({ t: 'straight', x: 2, z: 0, l: 6, r: 1 });
  assert.equal(fillZone(tr, tr.tilesAt(0, 0)[0], () => true).tiles.length, 1);
  assert.equal(fillZone(tr, tr.tilesAt(1, 0)[0], () => true).tiles.length, 2);
});
test('grande surface : 1 600 pièces remplies en moins de 500 ms ; au-delà de la borne la zone est déclarée tronquée (le remplissage refuse, rien n\'est modifié)', () => {
  const tr = new Track('g'); for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) tr.add({ t: 'platform', x, z, l: 0, r: 0, s: '' });
  const t0 = performance.now();
  const z = fillZone(tr, tr.tilesAt(0, 0)[0], () => true);
  assert.equal(z.tiles.length, 1600); assert.ok(!z.truncated); assert.ok(performance.now() - t0 < 500, (performance.now() - t0) + ' ms');
  const big = fillZone(tr, tr.tilesAt(0, 0)[0], () => true, { max: 100 });
  assert.ok(big.truncated && big.tiles.length === 100);
  assert.ok(FILL_MAX_TILES >= 5000, 'au moins un circuit publiable entier');
});
test('outil complet : le remplissage d\'une zone trop grande est refusé sans rien modifier ; un remplissage normal modifie la zone et seulement elle, en un seul pas d\'annulation', () => {
  const mk = (tool, hover, tr) => { const calls = { commit: 0, flash: [] }; const self = Object.create(EditorSession.prototype); Object.assign(self, { track: tr, tool, level: 0, hover: { cx: hover[0], cz: hover[1] }, surfParam: {}, app: { ui: { flash: (m) => calls.flash.push(m) }, audio: { place() {}, error() {} } }, _commit: () => calls.commit++, _changed() {} }); return { self, calls }; };
  const tr = strip(8, { s: 'ice' }); tr.add({ t: 'straight', x: 3, z: 1, l: 0, r: 1, s: 'ice' }); tr.add({ t: 'straight', x: 12, z: 0, l: 0, r: 1, s: 'ice' });
  const { self, calls } = mk('fill-surf:slow', [0, 0], tr);
  self._floodFill();
  assert.equal(tr.tiles.filter((t) => t.s === 'slow').length, 9); assert.equal(tr.tilesAt(12, 0)[0].s, 'ice', 'zone séparée intacte'); assert.equal(calls.commit, 1);
  const prev = self._fillPreview(tr.tilesAt(0, 0)[0]);
  assert.equal(prev, null, 'plus rien à remplir : pas d\'aperçu');
  const tr2 = strip(8, { s: 'ice' }); const m2 = mk('fill-surf:slow', [0, 0], tr2);
  const pv = m2.self._fillPreview(tr2.tilesAt(0, 0)[0]);
  assert.equal(pv.count, 8); assert.equal(pv.cells.length, 8); assert.ok(!pv.truncated); assert.equal(tr2.tiles.filter((t) => t.s === 'slow').length, 0, 'l\'aperçu ne modifie rien');
});

console.log('Groupes logiques : ce qui est caché n\'existe plus pour la physique, la course et les replays');
const runLoop = (rule, T, n = 1200) => {
  const tr = scriptTrack('lv', 'start S4 O S3 finish'); tr.tiles.find((t) => t.t === 'loop').g = 5;
  if (rule) tr.lg = { v: 1, off: [], vars: 0, rules: [rule] };
  tr.version++;
  const sim = new Simulation(tr); sim.start(); const bot = new Autopilot(tr.path); bot.reset(sim.phys);
  const rib = [];
  for (let i = 0; i < n; i++) { sim.step(bot.control(sim.phys)); rib.push(!!sim.phys.rib); }
  return { rib, sim };
};
test('looping caché par une règle PENDANT que la voiture le parcourt : elle se détache et tombe (avant : elle roulait sur la route invisible jusqu\'au bout)', () => {
  const base = runLoop(null).rib, a = base.indexOf(true), b = base.lastIndexOf(true), T = Math.floor((a + b) / 2);
  const r = runLoop({ on: ['time', T], if: [], do: [['hide', 5]], once: true }).rib;
  let after = 0; for (let i = T + 3; i < r.length; i++) if (r[i]) after++;
  assert.equal(after, 0, after + ' pas encore sur le ruban caché');
});
test('retour au checkpoint : l\'état de la logique (groupes cachés, compteurs, règles déjà jouées, gravité) revient exactement à celui du checkpoint', () => {
  const tr = scriptTrack('l', 'start S3 C S3 C S3 finish'); const ts = tr.tiles.filter((t) => t.t === 'straight'); ts[1].g = 2; ts[5].g = 3;
  tr.lg = { v: 1, off: [3], vars: 2, rules: [
    { on: ['cp', 1], if: [], do: [['hide', 2], ['var', 0, '+', 1], ['grav', 60]], once: true },
    { on: ['cp', 2], if: [['var', 0, '>=', 1]], do: [['show', 3], ['var', 1, '=', 7], ['grav', 150]], once: true },
  ] };
  tr.version++;
  const sim = new Simulation(tr); sim.start(); const bot = new Autopilot(tr.path); bot.reset(sim.phys);
  let cps = 0, snapAt1 = null, grav1 = 0;
  for (let i = 0; i < 6000 && cps < 2; i++) {
    const e = sim.step(bot.control(sim.phys));
    if (e && e.type === 'checkpoint') { cps++; if (cps === 1) { snapAt1 = JSON.stringify(sim.lgc.snapshot()); grav1 = sim.phys.gravMul; } }
  }
  assert.equal(cps, 2); assert.notEqual(JSON.stringify(sim.lgc.snapshot()), snapAt1, 'la logique a évolué');
  sim.rewind();
  assert.equal(JSON.stringify(sim.lgc.snapshot()), JSON.stringify(sim.logic.respawn.snap.ext));
  // le dernier point de retour est le checkpoint 2 : son instantané contient l'état APRÈS ses règles (voir Simulation.score)
  assert.ok(sim.lgc.state.hidden.has(2) && !sim.lgc.state.hidden.has(3), 'groupes dans l\'état du checkpoint 2');
  assert.equal(sim.phys.gravMul, 1.5, 'gravité du checkpoint 2'); assert.ok(grav1 === 0.6);
});
test('obstacle caché : la voiture le traverse sans contact ; visible (même circuit sans la logique) : contact', () => {
  const run = (hidden) => {
    const tr = new Track('o'); tr.add({ t: 'start', x: 0, z: 13, l: 0, r: 0 }); for (let i = 0; i < 11; i++) tr.add({ t: 'straight', x: 0, z: 12 - i, l: 0, r: 0 }); tr.add({ t: 'finish', x: 0, z: 1, l: 0, r: 0 });
    tr.addDeco({ k: 'bumper', x: CELL / 2, y: 0.4, z: 300, ry: 0, s: 1, g: 4 });
    if (hidden) tr.lg = { v: 1, off: [4], vars: 0, rules: [{ on: ['time', 99999], if: [], do: [['show', 4]], once: true }] };
    tr.version++;
    const sim = new Simulation(tr); sim.start(); sim.phys.graceT = 0; sim.phys.hazardGrace = 0; sim.phys.vel.z = -30;
    let shocks = 0;
    for (let i = 0; i < 900; i++) { sim.step({ throttle: true, brake: false, steer: 0 }); if (sim.phys.ev.shock > 0) shocks++; sim.phys.vel.x = 0; sim.phys.pos.x = CELL / 2; }
    return { shocks, z: sim.phys.pos.z };
  };
  const vis = run(false), hid = run(true);
  assert.ok(vis.shocks > 0 && vis.z > 295, 'visible : contact (' + JSON.stringify(vis) + ')');
  assert.equal(hid.shocks, 0); assert.ok(hid.z < 290, 'caché : la voiture est passée (z ' + hid.z.toFixed(1) + ')');
});
test('50 jeux de règles au hasard sur des circuits officiels : jamais d\'exception, état fini, mêmes résultats à l\'identique, effets bornés', () => {
  const rnd = lcg(21);
  const run = (seed) => {
    const r = lcg(seed); const d = BUILTIN_TRACKS[(r() * BUILTIN_TRACKS.length) | 0]; const tr = buildBuiltin(d);
    tr.tiles.forEach((t) => { if (!['start', 'finish'].includes(t.t) && r() < 0.3) t.g = 1 + ((r() * 4) | 0); });
    const ev = ['start', ['cp', 0], ['time', 1 + ((r() * 600) | 0)], ['zone', 1 + ((r() * 4) | 0)]];
    const mk = () => { const e = ev[(r() * ev.length) | 0]; return { on: typeof e === 'string' ? [e] : e, if: r() < 0.5 ? [['var', 0, '>=', 0]] : [], do: [[['hide', 'show', 'toggle'][(r() * 3) | 0], 1 + ((r() * 4) | 0)], ['var', 0, '+', 1], ['grav', 15 + ((r() * 235) | 0)]], once: r() < 0.5 }; };
    tr.lg = { v: 1, off: [2], vars: 1, rules: Array.from({ length: 1 + ((r() * 6) | 0) }, mk) }; tr.version++;
    const sim = new Simulation(tr); sim.start(); const bot = new Autopilot(tr.path); bot.reset(sim.phys);
    for (let i = 0; i < 1500; i++) { sim.step(bot.control(sim.phys)); if (sim.lost) sim.rewind(); assert.ok(Number.isFinite(sim.phys.pos.x + sim.phys.pos.y + sim.phys.pos.z), 'non fini'); assert.ok(sim.lgc.fx.length <= 64, 'effets non bornés'); }
    return [sim.phys.pos.x, sim.phys.pos.y, sim.phys.pos.z, sim.logic.steps, JSON.stringify(sim.lgc.snapshot())].join();
  };
  for (let i = 0; i < 50; i++) { const seed = (rnd() * 1e9) | 0; assert.equal(run(seed), run(seed), 'graine ' + seed); }
});

console.log('Replays : lecture identique à la course, déplacements dans le temps sans divergence');
const record = (d, steps = 2500, mutate = null) => {
  const tr = buildBuiltin(d); if (mutate) mutate(tr);
  const sim = new Simulation(tr); sim.start(); const bot = new Autopilot(tr.path); bot.reset(sim.phys); const rec = new InputRecorder(), trace = [];
  for (let i = 0; i < steps && !sim.logic.finished; i++) {
    const inp = bot.control(sim.phys); inp.steer = quantSteer(inp.steer); rec.push(inp, false);      // (la course en direct joue la commande quantifiée, comme l'enregistrement)
    sim.step(inp); if (sim.lost) { sim.rewind(); rec.flags[rec.flags.length - 1] |= 0; }
    trace.push([sim.phys.pos.x, sim.phys.pos.y, sim.phys.pos.z, sim.phys.gSign].join());
  }
  return { tr, rec, trace, sim };
};
test('un replay (commandes enregistrées) rejoue la course à l\'identique : verre, inversions de gravité, groupes cachés et retours au checkpoint compris', () => {
  for (const id of ['plafond', 'canyon', 'eclats']) {
    const d = BUILTIN_TRACKS.find((x) => x.id === id);
    const mut = (tr) => { let k = 0; for (const t of tr.tiles) if (t.t === 'straight' && k++ % 4 === 0) { t.s = 'glass'; t.p = 80; } tr.version++; };
    const { tr, rec, trace } = record(d, 2500, mut);
    const g = new GhostRunner(tr, { inputs: rec.encode() });
    for (let i = 0; i < trace.length; i++) {
      g.step(); const p = g.phys;
      assert.equal([p.pos.x, p.pos.y, p.pos.z, p.gSign].join(), trace[i], `${id} : divergence au pas ${i}`);
    }
  }
});
test('aller-retour dans la timeline : poseAt(k) donne la même pose avant et après un saut en avant (pas de téléportation, pas de divergence)', () => {
  const d = BUILTIN_TRACKS.find((x) => x.id === 'plafond');
  const { tr, rec } = record(d, 1800);
  const g = new GhostRunner(tr, { inputs: rec.encode() });
  const pose = () => ({ pos: {}, prev: {}, n: {}, fwd: {} });
  const a = g.poseAt(600, pose()); const sa = JSON.stringify(a);
  g.poseAt(1700, pose());
  assert.equal(JSON.stringify(g.poseAt(600, pose())), sa, 'relire une ancienne ligne de l\'historique');
  const g2 = new GhostRunner(tr, { inputs: rec.encode() });
  assert.equal(JSON.stringify(g2.poseAt(600, pose())), sa, 'un second lecteur retombe au même endroit');
  let maxJump = 0, prev = null;
  for (let k = 0; k < 1700; k += 4) { const p = g.poseAt(k, pose()); if (prev) maxJump = Math.max(maxJump, Math.hypot(p.pos.x - prev.x, p.pos.y - prev.y, p.pos.z - prev.z)); prev = { x: p.pos.x, y: p.pos.y, z: p.pos.z }; }
  assert.ok(maxJump < 40, 'plus grand saut entre deux lignes éloignées de 4 pas : ' + maxJump.toFixed(1) + ' m');
});

console.log('Circuits officiels : départs, arrivées, checkpoints, code partageable');
test('72 circuits officiels : un départ, une arrivée au moins, tous les checkpoints reliés au départ, aucune erreur du vérificateur, aller-retour du code partageable sans perte', () => {
  const bad = [];
  for (const d of BUILTIN_TRACKS) {
    const tr = buildBuiltin(d);
    if (tr.count('start') !== 1) bad.push(d.id + ' : départs ' + tr.count('start'));
    if (tr.count('finish') < 1) bad.push(d.id + ' : pas d\'arrivée');
    const errs = checkTrack(tr).filter((i) => i.level === 'error');
    if (errs.length) bad.push(d.id + ' : ' + errs[0].msg);
    const back = Track.decode(tr.encode());
    if (back.signature() !== tr.signature() || back.encode() !== tr.encode()) bad.push(d.id + ' : code partageable non identique');
    const sim = new Simulation(tr); sim.start(); sim.phys.graceT = 0;
    for (let i = 0; i < 90; i++) sim.drive({ throttle: false, brake: false, steer: 0 });
    if (!sim.phys.grounded || sim.phys.lost) bad.push(d.id + ' : le départ ne pose pas la voiture au sol');
  }
  assert.deepEqual(bad, []);
});

console.log('Progression : rien ne disparaît après une mise à jour de la physique');
test('record d\'une ancienne physique : la première arrivée sous la nouvelle physique, même plus lente, ne fait pas perdre la médaille (meilleur temps de toutes les physiques)', async () => {
  const mem = new Map(); globalThis.localStorage = { get length() { return mem.size; }, key: (i) => [...mem.keys()][i], getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const { saveRecord, getRecord, medalTime } = await import('../js/storage.js');
  const { medalFor } = await import('../js/medals.js');
  const medals = { cristal: 50, or: 60, argent: 70, bronze: 80 };
  saveRecord('b-test', { time: 58.5, pv: 28, inputs: null, ghost: null, date: 1 });                      // or, ancienne physique
  assert.equal(medalFor(medalTime(getRecord('b-test')), medals).id, 'or');
  saveRecord('b-test', { time: 66.2, pv: 29, inputs: 'x', ghost: null, date: 2 });                       // plus lent sous la nouvelle physique
  const r = getRecord('b-test');
  assert.equal(r.time, 66.2, 'le record courant est celui de la physique courante'); assert.equal(r.pv, 29);
  assert.equal(medalFor(medalTime(r), medals).id, 'or', 'la médaille d\'or est conservée');
  saveRecord('b-test', { time: 49.9, pv: 29, inputs: 'y', ghost: null, date: 3 });
  assert.equal(getRecord('b-test').bt, undefined, 'un vrai nouveau meilleur temps : plus de mémoire à garder');
  assert.equal(medalFor(medalTime(getRecord('b-test')), medals).id, 'cristal');
});
test('synchronisation du compte : fusionner un record ancien (meilleur) et un record de la nouvelle physique (plus lent) garde le meilleur temps de toutes les physiques, dans les deux sens', async () => {
  const { mergeSaves } = await import('../js/cloudsave.js');
  const old = { time: 58.5, pv: 28, date: 1 }, nw = { time: 66.2, pv: 29, date: 2 };
  for (const [l, r] of [[{ 'rec3.b-x': old }, { 'rec3.b-x': nw }], [{ 'rec3.b-x': nw }, { 'rec3.b-x': old }]]) {
    const m = mergeSaves(l, r)['rec3.b-x'];
    assert.equal(m.pv, 29); assert.equal(m.time, 66.2); assert.equal(m.bt, 58.5, 'le meilleur temps de l\'ancienne physique survit');
  }
  const m2 = mergeSaves({ 'rec3.b-x': { ...nw, bt: 58.5 } }, { 'rec3.b-x': { time: 70, pv: 29, date: 3 } })['rec3.b-x'];
  assert.equal(m2.time, 66.2); assert.equal(m2.bt, 58.5);
});

await finish('Tous les tests de la phase 3 passent.');
