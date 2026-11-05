// Régressions des corrections de l'audit : node tools/test-fixes.mjs   (npm test)
import assert from 'node:assert/strict';

let failures = 0;
const test = (name, fn) => { try { fn(); console.log('  ok   ' + name); } catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').join('\n       ')); } };

// Stockage du navigateur simulé (records, profil).
const m = new Map();
const base = { get length() { return m.size; }, key: (i) => [...m.keys()][i], getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
globalThis.localStorage = new Proxy(base, { ownKeys: () => [...m.keys()], getOwnPropertyDescriptor: (t, k) => (m.has(k) ? { enumerable: true, configurable: true, value: m.get(k) } : undefined) });

const { scriptTrack } = await import('../js/track.js');
const { CarPhysics } = await import('../js/physics.js');
const { RaceLogic, placeAtStart } = await import('../js/raceLogic.js');
const { CELL, LEVEL_H } = await import('../js/constants.js');
const { saveRecord, getRecord, clearRecords } = await import('../js/storage.js');
const { decodeInputs, MAX_REPLAY_STEPS } = await import('../js/replay.js');
const { trackForKey, replayTime } = await import('../js/verify.js');
const { mergeSaves } = await import('../js/cloudsave.js');
const { rewardCoins, profile } = await import('../js/profile.js');

console.log('Checkpoint et arrivée');
test('un pont 2 niveaux au-dessus du checkpoint ou de l\'arrivée ne les déclenche pas', () => {
  const tr = scriptTrack('t', 'start S2 C S2 finish');
  tr.add({ t: 'straight', x: 0, z: -3, l: 2, r: 0 }); tr.add({ t: 'straight', x: 0, z: -6, l: 2, r: 0 });
  const phys = new CarPhysics(tr), logic = new RaceLogic(tr);
  placeAtStart(phys, logic);
  phys.place(12, 2 * LEVEL_H + 0.4, -3 * CELL + 12, 0, 1);
  assert.equal(logic.update(phys), null); assert.equal(logic.collected.size, 0);
  phys.place(12, 2 * LEVEL_H + 0.4, -6 * CELL + 12, 0, 1);
  const ev = logic.update(phys);
  assert.ok(!ev || ev.type !== 'finish'); assert.equal(logic.finished, false);
});
test('un checkpoint pris en sautant juste au-dessus compte toujours', () => {
  const tr = scriptTrack('t', 'start S2 C S2 finish');
  const phys = new CarPhysics(tr), logic = new RaceLogic(tr);
  placeAtStart(phys, logic);
  phys.pos.x = 12; phys.pos.z = -3 * CELL + 12; phys.pos.y = 0.4 + 3;
  assert.equal(logic.update(phys).type, 'checkpoint');
});

console.log('Records');
test('« Effacer les records » vide aussi la copie en mémoire', () => {
  saveRecord('b-x-1', { time: 20.5, date: Date.now(), pv: 20 });
  assert.equal(getRecord('b-x-1').time, 20.5);
  clearRecords();
  assert.equal(getRecord('b-x-1'), null);
});
test('la synchronisation cloud ne ramène pas les records effacés', () => {
  const old = { time: 20, date: 1000, pv: 20 }, fresh = { time: 25, date: 5000, pv: 20 };
  const out = mergeSaves({ recReset: 3000, 'rec3.a': fresh }, { 'rec3.a': old, 'rec3.b': old });
  assert.equal(out['rec3.b'], undefined, 'record ancien effacé');
  assert.equal(out['rec3.a'].time, 25, 'record posterieur gardé');
  assert.equal(out.recReset, 3000);
});
test('circuit de joueur : pièces seulement pour une nouvelle médaille', () => {
  const key = 'u-test-' + Math.random();
  assert.ok(rewardCoins({ tier: 0, difficulty: 2, trackKey: key, user: true }).coins > 0);
  assert.equal(rewardCoins({ tier: 0, difficulty: 2, trackKey: key, user: true }).coins, 0);
  assert.ok(rewardCoins({ tier: 0, difficulty: 1, trackKey: 'b-x-' + key, user: false }).coins > 0, 'circuits intégrés : inchangé');
  void profile;
});

console.log('Vérification serveur');
test('un enregistrement qui se déplierait en trop de pas est refusé avant d\'être déplié', () => {
  const bytes = Buffer.alloc(300000);
  for (let i = 0; i < bytes.length; i += 3) { bytes[i] = 255; bytes[i + 1] = 0; bytes[i + 2] = 1; }
  const b64 = bytes.toString('base64');
  assert.ok(b64.length <= 400000);
  const before = process.memoryUsage().heapUsed;
  assert.throws(() => decodeInputs(b64), /trop long/);
  assert.ok(process.memoryUsage().heapUsed - before < 100e6, 'pas de dépliage en mémoire');
  const tr = scriptTrack('t', 'start S2 finish');
  assert.equal(replayTime(tr, b64), null);
  assert.equal(MAX_REPLAY_STEPS, 72000);
});
test('défi du jour : seules les dates plausibles sont acceptées', () => {
  const d = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  assert.equal(trackForKey('daily-' + d(0)).kind, 'daily');
  for (const bad of ['daily-abc', 'daily-9999-99-99', 'daily-2020-01-01', 'daily-' + d(30), 'daily-']) assert.throws(() => trackForKey(bad), undefined, bad);
});

if (failures) { console.log(`\n${failures} test(s) en échec`); process.exit(1); }
console.log('\nTous les tests des corrections passent.');
