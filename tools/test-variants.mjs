// Variantes de records (catégories de classement) : node tools/test-variants.mjs   (npm test)
// Le jeu et le serveur doivent appliquer EXACTEMENT la même variante, et une variante ne doit jamais toucher au record officiel.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Track, hashString } from '../js/track.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { InputRecorder, quantSteer } from '../js/replay.js';
import { verifyRun, trackForKey, replayRun } from '../js/verify.js';
import { PHYS_VER } from '../js/version.js';
import { isObstacle } from '../js/obstacles.js';
import { dailyChallenge } from '../js/daily.js';
import { parseVariant, formatVariant, splitKey, variantKey, applyVariant, variantFits, rulesOfVariant, MAX_KEY } from '../js/variants.js';
import { createHandler } from '../supabase/functions/submit-score/handler.js';

const def = (id) => BUILTIN_TRACKS.find((d) => d.id === id);
const keyOf = (id) => { const t = buildBuiltin(def(id)); return `b-${id}-${hashString(t.encode())}`; };

// Une vraie course sur un circuit donné : le pilote automatique, commandes arrondies et enregistrées comme en jeu.
function run(track) {
  const sim = new Simulation(track), rec = new InputRecorder();
  sim.start();
  const bot = new Autopilot(track.path, { latLimit: 56 * 0.8 });
  bot.reset(sim.phys);
  for (let i = 0; i < 120 * 200; i++) {
    const inp = bot.control(sim.phys);
    inp.steer = quantSteer(inp.steer);
    rec.push(inp, false);
    const ev = sim.step(inp);
    if (sim.lost) { sim.rewind(); bot.reset(sim.phys); }
    if (ev && ev.type === 'finish') return { inputs: rec.encode(), time: sim.logic.time };
  }
  throw new Error('le pilote automatique ne termine pas ' + track.name);
}

console.log('Grammaire');
test('écriture canonique : noms triés, valeurs de la liste, aller-retour exact', () => {
  assert.equal(formatVariant({ veh: 'moto' }), 'v1.veh-moto');
  assert.equal(formatVariant({ veh: 'boat', g: 40 }), 'v1.g-40.veh-boat');
  assert.equal(formatVariant({}), '');
  for (const s of ['v1.veh-moto', 'v1.g-40.veh-boat', 'v1.obs-0', 'v1.lap-3.off-1.v0-200']) assert.equal(formatVariant(parseVariant(s)), s);
  assert.deepEqual(rulesOfVariant(parseVariant('v1.g-40.obs-0.veh-boat')), { g0: 40, obstacles: 'off', veh0: 'boat' });
});
test('toute autre écriture est refusée (sinon deux classements pour une même catégorie)', () => {
  for (const bad of ['', 'v1', 'v2.veh-moto', 'v1.veh-moto.g-40', 'v1.veh-moto.veh-boat', 'v1.veh-Moto', 'v1.veh-tank', 'v1.g-41', 'v1.g-040', 'v1..veh-moto',
    'v1.veh-moto.', 'v1.__proto__-1', 'v1.constructor-x', 'v1.toString-1', 'V1.veh-moto', 'v1.veh_moto', 'v1.veh-moto ', ' v1.veh-moto']) {
    assert.throws(() => parseVariant(bad), /Catégorie de record inconnue/, JSON.stringify(bad));
  }
  assert.throws(() => formatVariant({ tank: 1 }), /inconnue/);
  assert.throws(() => formatVariant({ g: 55 }), /inconnue/);
});
test('clé : séparée au premier « ~ », 80 caractères au plus', () => {
  assert.deepEqual(splitKey('b-eclats-x~v1.veh-moto'), { base: 'b-eclats-x', variant: 'v1.veh-moto' });
  assert.deepEqual(splitKey('daily-2026-01-01'), { base: 'daily-2026-01-01', variant: '' });
  assert.equal(variantKey('b-eclats-x', {}), 'b-eclats-x');
  assert.equal(variantKey('b-eclats-x', { veh: 'moto' }), 'b-eclats-x~v1.veh-moto');
  assert.throws(() => variantKey('u-' + 'x'.repeat(70), { veh: 'moto' }), /trop longue/);
  for (const d of BUILTIN_TRACKS) assert.ok(variantKey(keyOf(d.id), { g: 130, lap: 5, obs: 0, off: 1, v0: 200, veh: 'glider' }).length <= MAX_KEY, d.id);
});

console.log('Application');
test('une variante transforme une COPIE ; le circuit officiel ne bouge pas', () => {
  const t = buildBuiltin(def('eclats')), sig = t.signature(), code = t.encode();
  const m = applyVariant(t, { veh: 'moto' });
  assert.notEqual(m, t);
  assert.equal(m.veh0, 'moto'); assert.equal(t.veh0, 'car');
  assert.equal(t.signature(), sig); assert.equal(t.encode(), code);
  assert.ok(m.path && m.path.length, 'la ligne centrale suit (classement en direct, fantôme or)');
});
test('une variante sans effet est refusée (elle doublerait le classement officiel)', () => {
  const t = buildBuiltin(def('eclats'));
  assert.equal(variantFits(t, { veh: 'car' }), false, 'départ en voiture : c’est déjà le cas');
  assert.equal(variantFits(t, { lap: 3 }), false, 'tours sur un circuit ouvert');
  assert.equal(variantFits(t, { obs: 0 }), false, 'sans obstacles sur un circuit qui n’en a pas');
  assert.equal(variantFits(t, { veh: 'moto' }), true);
  const ch = buildBuiltin(def('chaine'));
  assert.ok(ch.decos.some((d) => isObstacle(d.k)));
  const free = applyVariant(ch, { obs: 0 });
  assert.equal(free.decos.filter((d) => isObstacle(d.k)).length, 0);
  const closed = BUILTIN_TRACKS.find((d) => d.laps > 1);
  assert.equal(variantFits(buildBuiltin(closed), { lap: closed.laps }), false);
  assert.equal(variantFits(buildBuiltin(closed), { lap: 5 }), true);
});

console.log('Vérification serveur');
test('le serveur reconnaît une clé de variante (circuit intégré, défi du jour, circuit de joueur)', () => {
  const k = keyOf('eclats');
  const r = trackForKey(k + '~v1.veh-moto');
  assert.equal(r.kind, 'builtin'); assert.equal(r.track.veh0, 'moto'); assert.match(r.name, /v1\.veh-moto/);
  const day = new Date().toISOString().slice(0, 10), c = dailyChallenge(day);
  assert.equal(trackForKey(c.key + '~v1.g-40').track.g0, 40);
  const u = Track.decode(buildBuiltin(def('canyon')).encode());
  assert.equal(trackForKey(u.userKey + '~v1.veh-boat', u.encode()).track.veh0, 'boat');
  assert.throws(() => trackForKey(k + '~v1.veh-car'), /ne change rien/);
  assert.throws(() => trackForKey(k + '~v9.veh-moto'), /inconnue/);
  assert.throws(() => trackForKey(k + '~'), /inconnue/);
});
test('une course en moto est vérifiée dans SA catégorie, et refusée dans le classement officiel', () => {
  const k = keyOf('eclats'), vk = k + '~v1.veh-moto';
  const moto = applyVariant(buildBuiltin(def('eclats')), { veh: 'moto' });
  const r = run(moto);
  const ok = verifyRun({ trackKey: vk, inputs: r.inputs, time: r.time, physVer: PHYS_VER });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.time, r.time);
  const off = verifyRun({ trackKey: k, inputs: r.inputs, time: r.time, physVer: PHYS_VER });
  assert.equal(off.ok, false, 'les mêmes commandes en voiture ne donnent pas ce temps');
  const back = replayRun(buildBuiltin(def('eclats')), r.inputs);
  assert.ok(!back || back.time !== r.time);
});
test('la fonction serveur enregistre la course sous la clé de la variante (Supabase simulé)', async () => {
  const k = keyOf('lagon'), vk = k + '~v1.g-70';
  const r = run(applyVariant(buildBuiltin(def('lagon')), { g: 70 }));
  const writes = [];
  const fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: '11111111-2222-3333-4444-555555555555' }), { status: 200 });
    if (u.includes('/rest/v1/players')) return new Response('[{"id":"x"}]', { status: 200 });
    if (u.includes('/rpc/rate_check')) return new Response('0', { status: 200 });
    if (u.includes('/rpc/submit_best')) { writes.push(JSON.parse(init.body)); return new Response(JSON.stringify({ status: 'ok', improved: true, best: 1, rank: 1, total: 1 }), { status: 200 }); }
    return new Response('{}', { status: 404 });
  };
  const h = createHandler({ supabaseUrl: 'https://x.supabase.co', serviceKey: 'cle', fetch, log: () => {} });
  const res = await h(new Request('https://fn/submit-score', { method: 'POST', headers: { Authorization: 'Bearer j' }, body: JSON.stringify({ trackKey: vk, inputs: r.inputs, time: r.time, physVer: PHYS_VER }) }));
  const j = await res.json();
  assert.equal(res.status, 200, JSON.stringify(j));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].tk, vk);
  assert.ok(writes[0].gh, 'le fantôme de la variante est enregistré');
});

await finish('Tous les tests des variantes de records passent.');
