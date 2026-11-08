// Logique du circuit (E10 : ÉVÉNEMENT → CONDITIONS → ACTIONS dans la simulation) : node tools/test-logique.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { Track, scriptTrack, b64decode } from '../js/track.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { InputRecorder, quantSteer, GhostRunner } from '../js/replay.js';
import { verifyRun, replayRun } from '../js/verify.js';
import { PHYS_VER } from '../js/version.js';
import { sanitizeLogic, logicToArray, logicFromArray, createLogic } from '../js/sim/logic.js';

// Une ligne droite : départ, checkpoint, puis une « porte » (deux pièces du groupe 2), puis l'arrivée.
function doorTrack(lg) {
  const t = scriptTrack('porte', 'start S3 S3 C S3 S3 S3 S3 finish');
  const cp = t.tiles.findIndex((x) => x.t === 'checkpoint');
  t.tiles[cp + 2].g = 2; t.tiles[cp + 3].g = 2;
  t.setGroupName(2, 'Porte');
  if (lg) t.setLogic(lg);
  return t;
}
const DOOR = { off: [2], rules: [{ on: ['cp', 1], do: [['show', 2], ['fx', 'msg', 'Porte ouverte !']], once: true }] };
const NEVER = { off: [2], rules: [{ on: ['time', 999999], do: [['show', 2]] }] };
function bot(track, { maxS = 90, respawnAt = -1 } = {}) {
  const sim = new Simulation(track), rec = new InputRecorder();
  sim.start();
  const b = new Autopilot(track.path, { latLimit: 56 * 0.8 });
  b.reset(sim.phys);
  for (let k = 0; k < 120 * maxS; k++) {
    const inp = b.control(sim.phys);
    inp.steer = quantSteer(inp.steer);
    const resp = k === respawnAt;
    rec.push(inp, resp);
    if (resp) { sim.rewind(); b.reset(sim.phys); }
    const ev = sim.step(inp);
    if (sim.lost) { sim.rewind(); b.reset(sim.phys); }
    if (ev && ev.type === 'finish') return { finished: true, inputs: rec.encode(), time: sim.logic.time, sim };
  }
  return { finished: false, sim, inputs: rec.encode() };
}

console.log('Format et signature');
test('logique nettoyée : bornes, éléments inconnus écartés, au moins une règle utile', () => {
  assert.equal(sanitizeLogic(null), null);
  assert.equal(sanitizeLogic({ rules: [] }), null);
  assert.equal(sanitizeLogic({ rules: [{ on: ['boom'], do: [['show', 2]] }] }), null);
  assert.equal(sanitizeLogic({ rules: [{ on: ['start'], do: [['explode']] }] }), null, 'une règle sans action valide n’existe pas');
  const L = sanitizeLogic({ off: [99, 2, 2, -1], vars: 9, rules: [
    { on: ['cp', 3], if: [['var', 7, '>>', 5000], ['nope']], do: [['grav', 999], ['var', 1, '*', 3], ['fx', 'msg', '<script>alert(1)</script>'], ['toggle', 70]], once: 1 },
    ...Array.from({ length: 40 }, () => ({ on: ['start'], do: [['hide', 1]] })),
  ] });
  assert.deepEqual(L.off, [1, 2, 63]);
  assert.equal(L.vars, 4); assert.equal(L.rules.length, 32);
  assert.deepEqual(L.rules[0].if, [['var', 3, '==', 999]]);
  assert.deepEqual(L.rules[0].do.slice(0, 2), [['grav', 250], ['var', 1, '=', 3]]);
  assert.equal(L.rules[0].do[2][2], 'scriptalert(1)/script', 'message nettoyé (chevrons retirés ; le HUD l’affiche en texte, jamais en HTML)');
  assert.deepEqual(L.rules[0].do[3], ['toggle', 63]);
  assert.deepEqual(logicFromArray(logicToArray(L)), L, 'aller-retour exact');
});
test('le code garde la logique ; elle entre dans la signature, l’appartenance aux groupes aussi', () => {
  const plain = doorTrack(null), withL = doorTrack(DOOR);
  assert.notEqual(plain.signature(), withL.signature());
  const code = withL.encode();
  assert.equal(JSON.parse(b64decode(code.slice(5))).v, 4);
  const u = Track.decode(code);
  assert.deepEqual(u.lg, withL.lg);
  assert.equal(u.signature(), withL.signature());
  const moved = doorTrack(DOOR);
  moved.tiles.find((x) => x.g === 2).g = 3;
  assert.notEqual(moved.signature(), withL.signature(), 'changer ce que contient un groupe change la course');
  assert.deepEqual(withL.clone().lg, withL.lg);
  // sans logique, le groupe ne compte pas (E9)
  const a = doorTrack(null), b = doorTrack(null);
  b.tiles.find((x) => x.g === 2).g = 5;
  assert.equal(a.signature(), b.signature());
});

console.log('Dans la simulation');
test('porte : fermée, la course est impossible ; ouverte au checkpoint, le pilote automatique finit', () => {
  assert.equal(bot(doorTrack(NEVER), { maxS: 40 }).finished, false, 'groupe caché : pas de route, pas d’arrivée');
  const r = bot(doorTrack(DOOR));
  assert.ok(r.finished, 'la porte s’ouvre au checkpoint');
  assert.ok(r.time > 3);
  assert.equal(bot(doorTrack(null)).time, r.time, 'porte ouverte à temps : même course que sans porte');
});
test('un retour au checkpoint garde la porte ouverte (l’instantané a l’état d’après la règle)', () => {
  const t = doorTrack(DOOR), clean = bot(t);
  const cpStep = Math.round(clean.time * 120 * 0.6);
  const r = bot(doorTrack(DOOR), { respawnAt: cpStep });
  assert.ok(r.finished, 'après le retour, la porte est toujours ouverte');
});
test('l’état revient avec le checkpoint ; un départ remet tout à zéro', () => {
  const t = doorTrack({ off: [2], vars: 1, rules: [{ on: ['cp', 1], do: [['show', 2], ['var', 0, '+', 1]] }, { on: ['start'], do: [['var', 0, '=', 5]] }] });
  const sim = new Simulation(t);
  sim.start();
  const L = sim.lgc;
  assert.ok(L.state.hidden.has(2));
  sim.step({ steer: 0, throttle: true, brake: false });
  assert.equal(L.state.vars[0], 5, 'règle de départ');
  const snap = L.snapshot();
  L.restore({ ...snap, hidden: [], vars: [9, 0, 0, 0] });
  assert.equal(L.state.vars[0], 9); assert.equal(L.hiddenTiles.size, 0, 'les pièces du groupe ne sont plus exclues');
  sim.start();
  assert.ok(L.state.hidden.has(2)); assert.equal(L.state.vars[0], 0);
  assert.equal(L.hiddenTiles.size, 2);
});
test('gravité, compteurs, conditions, zone et une seule fois', () => {
  const t = scriptTrack('zones', 'start S3 S3 S3 S3 S3 S3 finish');
  t.tiles[2].g = 4;
  t.setLogic({ vars: 2, rules: [
    { on: ['zone', 4], do: [['grav', 60], ['var', 0, '+', 1]] },
    { on: ['zone', 4], if: [['var', 0, '>=', 1]], do: [['var', 1, '+', 10]], once: true },
  ] });
  const r = bot(t);
  assert.ok(r.finished);
  assert.equal(r.sim.phys.gravMul, 0.6, 'gravité réglée par la règle');
  assert.equal(r.sim.lgc.state.vars[0], 1, 'une entrée dans la zone');
  assert.equal(r.sim.lgc.state.vars[1], 10, 'la condition est vue après l’action de la règle précédente');
});
test('les effets visuels ne changent rien à la course ; la file est bornée', () => {
  const t = doorTrack(DOOR), sim = new Simulation(t);
  assert.ok(createLogic(t, sim.phys, sim.logic));
  const a = bot(doorTrack(DOOR)), b = bot(doorTrack({ ...DOOR, rules: [{ ...DOOR.rules[0], do: [['show', 2]] }] }));
  assert.equal(a.time, b.time);
  const many = doorTrack({ off: [2], rules: [{ on: ['cp', 0], do: [['show', 2]] }, ...Array.from({ length: 20 }, () => ({ on: ['start'], do: Array.from({ length: 8 }, () => ['fx', 'sound', 'ding']) }))] });
  const s = new Simulation(many);
  s.start(); s.step({ steer: 0, throttle: true, brake: false });
  assert.ok(s.lgc.fx.length <= 64);
});

console.log('Vérification serveur et fantômes');
test('le serveur rejoue la logique : course acceptée ; les mêmes commandes sur le circuit sans règle ne finissent pas', () => {
  const t = doorTrack(DOOR), r = bot(t);
  const u = Track.decode(t.encode());
  const v = verifyRun({ trackKey: u.userKey, code: u.encode(), inputs: r.inputs, time: r.time, physVer: PHYS_VER });
  assert.equal(v.ok, true, v.error);
  assert.equal(replayRun(Track.decode(doorTrack(NEVER).encode()), r.inputs), null);
  const g = new GhostRunner(Track.decode(t.encode()), { inputs: r.inputs });
  while (!g.done) g.step();
  assert.equal(g.logic.time, r.time, 'le fantôme suit la même logique');
});

await finish('Tous les tests de la logique du circuit passent.');
