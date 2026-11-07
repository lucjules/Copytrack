// Statistiques anonymes : file locale, accord du joueur, lots, échecs réseau, contenu envoyé : node tools/test-telemetry.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { Telemetry, trackIdOf, newInstallId, MAX_QUEUE, BATCH, MAX_AGE_MS, QUEUE_KEY } from '../js/telemetry.js';
import { PHYS_VER } from '../js/version.js';
import { analyse, toMarkdown, parseRows } from './telemetry-report.mjs';
import { proposeFromSample, proposeFromHumans, quantile } from './medals.mjs';

function setup({ enabled = true, failing = false } = {}) {
  const mem = new Map();
  const store = { get: (k, d) => (mem.has(k) ? JSON.parse(mem.get(k)) : d), set: (k, v) => { mem.set(k, JSON.stringify(v)); } };
  const sent = [], clock = { t: 1_000_000 }, timers = [];
  const o = { enabled, failing };
  const tm = new Telemetry({
    store, enabled: () => o.enabled, now: () => clock.t, random: (n) => Uint8Array.from({ length: n }, (_, i) => i + 1),
    send: async (batch) => { if (o.failing) throw new Error('hors ligne'); sent.push(batch); },
    schedule: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  });
  return { tm, mem, store, sent, clock, timers, o };
}
const KEY = 'b-eclats-1a2b3c';

console.log('Identifiants');
test('trackIdOf : circuits intégrés et défi du jour seulement', () => {
  assert.equal(trackIdOf(KEY), 'eclats');
  assert.equal(trackIdOf('b-grand_tour-zz9'), 'grand_tour');
  assert.equal(trackIdOf('daily-2026-11-07'), 'daily');
  for (const k of ['u-abc', 'c:1234', '', null, undefined, 'b--x', 'b-UPPER-x', 'daily-x']) assert.equal(trackIdOf(k), null, String(k));
});
test('l\'identifiant d\'installation : 16 hexadécimaux, aléatoire, conservé', () => {
  const a = newInstallId(), b = newInstallId();
  assert.match(a, /^[0-9a-f]{16}$/); assert.notEqual(a, b);
  const { tm, store } = setup();
  assert.equal(tm.installId, '0102030405060708');
  assert.equal(store.get('telemetry.state').install, tm.installId);
});

console.log('Accord du joueur');
test('sans accord : rien n\'est gardé ni envoyé', async () => {
  const { tm, sent, mem } = setup({ enabled: false });
  assert.equal(tm.record({ trackKey: KEY, outcome: 'finish', time: 20 }), false);
  assert.equal(await tm.flush(), 0);
  assert.equal(sent.length, 0);
  assert.ok(!mem.has(QUEUE_KEY));
});
test('l\'accord retiré vide la file', () => {
  const { tm, o } = setup();
  tm.record({ trackKey: KEY, outcome: 'finish', time: 20 });
  assert.equal(tm.queue.length, 1);
  o.enabled = false; tm.forget();
  assert.equal(tm.queue.length, 0);
});

console.log('Évènements');
test('arrivée : temps, essai, médaille, retours au checkpoint ; abandon : progression', () => {
  const { tm } = setup();
  assert.ok(tm.record({ trackKey: KEY, outcome: 'quit', time: 12.34567, progress: 0.4567, respawns: 2 }));
  assert.ok(tm.record({ trackKey: KEY, outcome: 'finish', time: 30.12345, respawns: 1, medal: 'argent' }));
  const [q, f] = tm.queue;
  assert.deepEqual({ ...q, ts: 0 }, { track: 'eclats', outcome: 'quit', time: 12.346, attempt: 1, respawns: 2, pv: PHYS_VER, ts: 0, progress: 0.457 });
  assert.equal(f.attempt, 2); assert.equal(f.medal, 'argent'); assert.equal(f.time, 30.123); assert.ok(!('progress' in f));
});
test('entrées invalides ou circuits non suivis : refusés', () => {
  const { tm } = setup();
  for (const ev of [{ trackKey: 'u-abc', outcome: 'finish', time: 20 }, { trackKey: KEY, outcome: 'win', time: 20 }, { trackKey: KEY, outcome: 'finish', time: 0.1 },
    { trackKey: KEY, outcome: 'finish', time: 99999 }, { trackKey: KEY, outcome: 'finish', time: NaN }]) assert.equal(tm.record(ev), false);
  assert.equal(tm.queue.length, 0);
});
test('la file est bornée : les plus anciens sont jetés', () => {
  const { tm } = setup();
  for (let i = 0; i < MAX_QUEUE + 40; i++) tm.record({ trackKey: KEY, outcome: 'quit', time: 5 + i * 0.001, progress: 0 });
  assert.equal(tm.queue.length, MAX_QUEUE);
  assert.equal(tm.queue[0].attempt, 41);
});

console.log('Envoi');
test('envoi par lots, sans horodatage local, avec l\'identifiant d\'installation et rien d\'autre de personnel', async () => {
  const { tm, sent } = setup();
  for (let i = 0; i < BATCH + 20; i++) tm.record({ trackKey: KEY, outcome: 'finish', time: 20 + i });
  assert.equal(await tm.flush(), BATCH + 20);
  assert.deepEqual(sent.map((b) => b.length), [BATCH, 20]);
  const keys = new Set(sent.flat().flatMap(Object.keys));
  assert.deepEqual([...keys].sort(), ['attempt', 'install', 'outcome', 'pv', 'respawns', 'time', 'track']);
  assert.equal(tm.queue.length, 0);
  assert.ok(sent.flat().every((e) => e.install === tm.installId));
});
test('échec réseau : les évènements restent, l\'attente double, puis tout part au retour du réseau', async () => {
  const { tm, sent, clock, o } = setup({ failing: true });
  tm.record({ trackKey: KEY, outcome: 'finish', time: 20 });
  assert.equal(await tm.flush(), 0);
  assert.equal(tm.queue.length, 1);
  const wait1 = tm.nextTry - clock.t;
  assert.equal(await tm.flush(), 0, 'pas de nouvel essai pendant l\'attente');
  clock.t = tm.nextTry + 1; assert.equal(await tm.flush(), 0);
  assert.ok(tm.nextTry - clock.t > wait1, 'attente croissante');
  o.failing = false; clock.t = tm.nextTry + 1;
  assert.equal(await tm.flush(), 1);
  assert.equal(sent.length, 1); assert.equal(tm.queue.length, 0);
});
test('un évènement trop ancien n\'est plus envoyé', async () => {
  const { tm, sent, clock } = setup();
  tm.record({ trackKey: KEY, outcome: 'finish', time: 20 });
  clock.t += MAX_AGE_MS + 1000;
  assert.equal(await tm.flush(), 0);
  assert.equal(sent.length, 0);
});
test('la file survit au rechargement de la page', () => {
  const a = setup();
  a.tm.record({ trackKey: KEY, outcome: 'finish', time: 20 });
  const b = new Telemetry({ store: a.store, enabled: () => true, send: async () => {}, schedule: () => 0 });
  assert.equal(b.queue.length, 1);
  assert.equal(b.installId, a.tm.installId);
  b.record({ trackKey: KEY, outcome: 'finish', time: 21 });
  assert.equal(b.queue[1].attempt, 2, 'les essais continuent de se compter');
});
test('un envoi est programmé après un enregistrement (une seule minuterie)', () => {
  const { tm, timers } = setup();
  tm.record({ trackKey: KEY, outcome: 'finish', time: 20 });
  tm.record({ trackKey: KEY, outcome: 'finish', time: 21 });
  assert.equal(timers.length, 1);
});

console.log('Rapport et médailles');
// 100 joueurs sur « eclats » : temps étalés de 20 à 40 s, 80 finissent ; 20 abandonnent vers 50 % ; un tricheur à 3 s.
function synthetic() {
  const rows = [];
  for (let i = 0; i < 100; i++) {
    const install = i.toString(16).padStart(16, '0');
    if (i < 80) rows.push({ install, track: 'eclats', outcome: 'finish', time: 20 + i * 0.25, attempt: 1 + (i % 4), respawns: 0, phys_ver: 26 });
    else rows.push({ install, track: 'eclats', outcome: 'quit', time: 15, progress: 0.5, attempt: 1, phys_ver: 26 });
  }
  rows.push({ install: 'f'.repeat(16), track: 'eclats', outcome: 'finish', time: 3, attempt: 1, phys_ver: 26 });
  rows.push({ install: '0'.repeat(16), track: 'eclats', outcome: 'finish', time: 25, attempt: 9, phys_ver: 25 });      // autre version de la physique : écartée
  return rows;
}
test('centiles et médailles proposées : croissantes, arrondies, et sous 20 temps la règle des testeurs', () => {
  const t = Array.from({ length: 100 }, (_, i) => 20 + i * 0.25);
  const m = proposeFromSample(t);
  assert.ok(m.cristal < m.or && m.or < m.argent && m.argent < m.bronze);
  assert.ok(Math.abs(m.or - quantile(t, 0.12)) < 0.06);
  assert.deepEqual(proposeFromSample([16.2, 15.4, 17.9]), proposeFromHumans([16.2, 15.4, 17.9]));
  assert.ok(Object.values(proposeFromSample(Array(30).fill(20))).every((v, i, a) => i === 0 || v > a[i - 1]), 'temps tous égaux : toujours strictement croissant');
});
test('analyse : taux d\'arrivée, tricheur écarté, autre version écartée, abandons, médailles proposées', () => {
  const rep = analyse(synthetic(), { defs: [{ id: 'eclats', medals: { cristal: 21, or: 22, argent: 28, bronze: 34 } }], golden: { eclats: 20 } });
  const t = rep.tracks[0];
  assert.equal(rep.version, 26);
  assert.equal(t.installs, 101); assert.equal(t.finishers, 80); assert.equal(t.dropped, 1);
  assert.ok(Math.abs(t.completion - 80 / 101) < 1e-9);
  assert.equal(t.quitHist[2], 20, 'abandons à 50 % : tranche 40-60 %');
  assert.ok(t.proposed && t.proposed.cristal >= 20);
  assert.ok(t.alerts.some((a) => /mur vers 40-60/.test(a)), t.alerts.join('|'));
  assert.ok(!t.alerts.some((a) => /Or hors de portée/.test(a)));
});
test('alertes : Or hors de portée et circuit trop dur', () => {
  const rows = [];
  for (let i = 0; i < 100; i++) {
    const install = i.toString(16).padStart(16, '0');
    if (i < 25) rows.push({ install, track: 'canyon', outcome: 'finish', time: 40 + i, attempt: 3, phys_ver: 26 });
    else rows.push({ install, track: 'canyon', outcome: 'quit', time: 10, progress: 0.1, attempt: 1, phys_ver: 26 });
  }
  const rep = analyse(rows, { defs: [{ id: 'canyon', medals: { cristal: 29, or: 30, argent: 36, bronze: 42 } }], golden: {} });
  const a = rep.tracks[0].alerts.join(' | ');
  assert.match(a, /trop dur : 25 %/); assert.match(a, /Or hors de portée/);
});
test('rapport Markdown et lecture CSV', () => {
  const md = toMarkdown(analyse(synthetic(), { defs: [{ id: 'eclats', medals: { cristal: 19, or: 20, argent: 24, bronze: 30 } }], golden: {} }));
  assert.match(md, /\| eclats \| 101 \|/);
  const csv = 'install,track,outcome,time,progress,respawns,attempt,phys_ver,medal\n' + '00000000000000a1,eclats,finish,21.5,,0,2,26,or\n';
  const rows = parseRows(csv, 'x.csv');
  assert.equal(rows[0].track, 'eclats'); assert.equal(+rows[0].time, 21.5);
  assert.equal(analyse(rows, { defs: [], golden: {} }).tracks[0].finishers, 1);
});

await finish('Tous les tests des statistiques anonymes passent.');
