// Outil d'après-essais (tools/essais.mjs) : modèle commun « niveau du testeur × difficulté du circuit » sur un PETIT groupe, médailles proposées pour les
// 72 circuits, exports CSV du tableau de bord, résumé des avis, écriture dans js/tracks.js (sur un texte, jamais sur le vrai fichier).
//   node tools/test-essais.mjs   (npm test)
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test, finish } from './harness.mjs';
import { parseCsv, bestTimes, fitPooled, fitRobust, proposePooled, humanFactors, enoughData, reach, summariseFeedback, toMarkdown, weightedQuantile, ESSAI_QUANTILES } from './essais.mjs';
import { writeMedals } from './medals.mjs';
import { BUILTIN_TRACKS } from '../js/tracks.js';
import { PHYS_VER, VERSION } from '../js/version.js';

const golden = JSON.parse(readFileSync(new URL('./golden-temps.json', import.meta.url), 'utf8'));
const ids = BUILTIN_TRACKS.map((d) => d.id);

// Hasard reproductible.
function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

// 8 testeurs (du débutant au très bon), qui jouent la carrière dans l'ordre jusqu'à un circuit différent, 1 à 6 essais par circuit.
function simulate({ testers = 8, seed = 7 } = {}) {
  const r = rng(seed), rows = [], truth = { a: new Map(), b: new Map(), mu: Math.log(0.8) };
  for (const id of ids) truth.b.set(id, gauss(r) * 0.08);
  for (let p = 0; p < testers; p++) {
    const install = p.toString(16).padStart(16, 'a'), a = -0.2 + (0.4 * p) / (testers - 1);
    truth.a.set(install, a);
    const upTo = 12 + Math.floor(r() * 30);
    for (const id of ids.slice(0, upTo)) {
      const tries = 1 + Math.floor(r() * 6);
      for (let k = 0; k < tries; k++) rows.push({ install, track: id, outcome: 'finish', time: (golden[id] * Math.exp(truth.mu + a + truth.b.get(id) + gauss(r) * 0.05)).toFixed(3), phys_ver: String(PHYS_VER), created_at: '2026-11-25T10:00:00Z' });
      rows.push({ install, track: id, outcome: 'quit', time: '9.1', progress: '0.4', phys_ver: String(PHYS_VER) });
    }
  }
  return { rows, truth };
}

test('CSV du tableau de bord : guillemets, virgules et retours à la ligne dans un champ, BOM, fin de fichier', () => {
  const rows = parseCsv('﻿install,comment,fun\r\n"abc","Trop dur, vraiment ""dur""\nsur Temple",4\r\ndef,,2\n');
  assert.deepEqual(rows, [{ install: 'abc', comment: 'Trop dur, vraiment "dur"\nsur Temple', fun: '4' }, { install: 'def', comment: '', fun: '2' }]);
});

test('meilleurs temps : un par testeur et par circuit, physique du jeu seulement, arrivées seulement, temps impossibles et circuits de joueur écartés', () => {
  const g = { eclats: 40 };
  const rows = [
    { install: 'a', track: 'eclats', outcome: 'finish', time: '35', phys_ver: PHYS_VER }, { install: 'a', track: 'eclats', outcome: 'finish', time: '33.5', phys_ver: PHYS_VER },
    { install: 'a', track: 'eclats', outcome: 'quit', time: '20', phys_ver: PHYS_VER }, { install: 'b', track: 'eclats', outcome: 'finish', time: '12', phys_ver: PHYS_VER },
    { install: 'c', track: 'eclats', outcome: 'finish', time: '30', phys_ver: PHYS_VER - 1 }, { install: 'd', track: 'u_xyz', outcome: 'finish', time: '30', phys_ver: PHYS_VER },
    { install: 'e', track: 'eclats', outcome: 'finish', time: '31', phys_ver: PHYS_VER, created_at: '2026-01-01T00:00:00Z' },
  ];
  const { best, dropped, droppedBy } = bestTimes(rows, { golden: g, since: '2026-11-20' });
  assert.deepEqual([...best.keys()], ['a']); assert.equal(best.get('a').get('eclats'), 33.5); assert.equal(dropped, 1);
  assert.deepEqual([...droppedBy.get('eclats')], ['b'], 'le circuit et le testeur du temps écarté sont connus (raccourci à regarder)');
  assert.equal(bestTimes(rows, { golden: g, since: '2026-11-20', tooFast: 0.25 }).best.get('b').get('eclats'), 12, 'seuil réglable');
});

test('quantile pondéré : chaque testeur compte autant, quel que soit son nombre de circuits', () => {
  const s = [{ v: 0, w: 1 }, { v: 1, w: 1 }, { v: 2, w: 1 }];
  assert.equal(weightedQuantile(s, 0.5), 1); assert.equal(weightedQuantile(s, 0), 0); assert.equal(weightedQuantile(s, 1), 2);
  // dix valeurs d'un même testeur (poids 1/10 chacune) pèsent autant qu'une seule valeur d'un autre
  const t = [...Array(10)].map(() => ({ v: 0, w: 0.1 })).concat([{ v: 10, w: 1 }]);
  assert.ok(weightedQuantile(t, 0.6) > 0 && weightedQuantile(t, 0.4) === 0);
});

test('modèle commun sur 8 testeurs simulés : niveau moyen, niveaux et difficultés retrouvés', () => {
  const { rows, truth } = simulate();
  const { best } = bestTimes(rows, { golden });
  const fit = fitPooled(best, golden);
  // le meilleur temps de plusieurs essais est un peu sous la moyenne : tolérance de 5 %
  assert.ok(Math.abs(fit.mu - truth.mu) < 0.05, `niveau moyen ${Math.exp(fit.mu).toFixed(3)} (vrai 0.8)`);
  const ps = [...truth.a.keys()];
  const order = (m) => ps.slice().sort((x, y) => m.get(x) - m.get(y)).join();
  assert.equal(order(fit.a), order(truth.a), 'testeurs rangés du plus rapide au plus lent');
  const played = ids.filter((id) => fit.nT.get(id) >= 6), err = played.map((id) => Math.abs(fit.b.get(id) - truth.b.get(id)));
  assert.ok(played.length >= 8 && Math.max(...err) < 0.07, 'difficultés propres retrouvées à 7 % près sur les circuits joués par 6 testeurs ou plus');
  assert.ok(fit.sigma > 0.02 && fit.sigma < 0.08, 'bruit ±' + fit.sigma.toFixed(3));
});

test('médailles proposées : 72 circuits, croissantes, les testeurs atteignent bronze ~90 %, or ~15 %, cristal rarement ; circuits non joués extrapolés', () => {
  const { rows } = simulate();
  const { best } = bestTimes(rows, { golden });
  const fit = fitPooled(best, golden), P = proposePooled(fit, golden);
  assert.equal(P.length, BUILTIN_TRACKS.length);
  for (const p of P) assert.ok(p.medals.cristal < p.medals.or && p.medals.or < p.medals.argent && p.medals.argent < p.medals.bronze, p.id + ' ' + JSON.stringify(p.medals));
  const byId = new Map(P.map((p) => [p.id, p])), R = reach(best, (t) => byId.get(t).medals);
  const f = (k) => R[k] / R.n;
  assert.ok(f('bronze') > 0.8 && f('bronze') < 0.97, 'bronze ' + f('bronze'));
  assert.ok(f('argent') > 0.35 && f('argent') < 0.65, 'argent ' + f('argent'));
  assert.ok(f('or') > 0.07 && f('or') < 0.28, 'or ' + f('or'));
  assert.ok(f('cristal') < 0.1, 'cristal ' + f('cristal'));
  const F = humanFactors(fit);
  assert.ok(F.cristal < F.or && F.or < F.argent && F.argent < F.bronze && F.or > 0.6 && F.bronze < 1.2, 'facteurs du circuit du jour ' + JSON.stringify(F));
  const ex = P.filter((p) => p.extrapolated);
  assert.ok(ex.length > 0 && ex.every((p) => Math.abs(p.factor - Math.exp(fit.mu)) < 1e-9), 'un circuit non joué reçoit la difficulté moyenne');
});

test('un raccourci trouvé par un seul testeur (temps isolé bien trop rapide pour lui) est écarté avant de régler les médailles', () => {
  const { rows } = simulate();
  const { best } = bestTimes(rows, { golden });
  const p = [...best.keys()][7], t = [...best.get(p).keys()][2], honest = fitPooled(best, golden);      // le testeur le plus lent (~98 % du pilote)
  best.get(p).set(t, golden[t] * 0.62);           // au-dessus du seuil absolu, mais ~35 % plus vite que ce testeur ailleurs
  const naive = fitPooled(best, golden), robust = fitRobust(best, golden);
  assert.deepEqual(robust.outliers.map((o) => [o.p, o.t]), [[p, t]], JSON.stringify(robust.outliers));
  assert.ok(Math.abs(robust.b.get(t) - honest.b.get(t)) < Math.abs(naive.b.get(t) - honest.b.get(t)) / 3, 'la difficulté du circuit revient près de la vraie');
  assert.equal(fitRobust(bestTimes(simulate().rows, { golden }).best, golden).outliers.length, 0, 'sans raccourci : rien n’est écarté');
});

test('trop peu de données : refusé pour l’écriture (5 testeurs avec 3 circuits et 40 temps au minimum)', () => {
  assert.equal(enoughData(bestTimes(simulate({ testers: 3 }).rows, { golden }).best).ok, false);
  assert.equal(enoughData(bestTimes(simulate().rows, { golden }).best).ok, true);
});

test('avis : un par installation (le dernier), moyennes par groupe, signaux d’équilibrage, textes', () => {
  const base = { version: VERSION, device: 'ordinateur', controls: 'clavier', fun: '4', camera: '4', drift: '-1', walls: '0', air: '0', difficulty: '-1', tracks_note: '', comment: '' };
  const rows = [
    { ...base, install: 'a', experience: 'debutant', drift: '2', created_at: '2026-11-20' }, { ...base, install: 'a', experience: 'debutant', drift: '-2', created_at: '2026-11-21', comment: 'Le dérapage, dur' },
    { ...base, install: 'b', experience: 'habitue', device: 'telephone', controls: 'tactile', created_at: '2026-11-21' },
    { ...base, install: 'c', experience: 'habitue', created_at: '2026-11-22', tracks_note: 'Temple bloquant', pseudo: 'Bea' },
  ];
  const S = summariseFeedback(rows);
  assert.equal(S.n, 3); assert.equal(S.sent, 4);
  const drift = S.scales.find((s) => s.key === 'drift');
  assert.equal(drift.groups.tous.mean, -4 / 3); assert.equal(drift.groups.debutant.mean, -2); assert.equal(drift.signal, 'Trop dur à tenir');
  assert.equal(S.scales.find((s) => s.key === 'walls').signal, null);
  assert.equal(S.counts.device.telephone, 1); assert.equal(S.texts.length, 2); assert.equal(S.experienceOf.get('a'), 'debutant');
});

test('écriture dans js/tracks.js (sur un texte) : médailles remplacées, medalsBy une seule fois, objectif « moins de » entre or et argent', () => {
  const src = "  {\n    id: 'eclats', name: 'X',\n    goal: { id: 'under', t: 50.5 },\n    medals: { cristal: 45.8, or: 48.2, argent: 55.4, bronze: 65 },\n  },\n  {\n    id: 'canyon', name: 'Y',\n    medals: { cristal: 1, or: 2, argent: 3, bronze: 4 },\n  },\n";
  const m = { cristal: 33, or: 36.1, argent: 40.2, bronze: 47 };
  let out = writeMedals(src, { id: 'eclats', goal: { id: 'under', t: 50.5 } }, m);
  out = writeMedals(out, { id: 'eclats', goal: { id: 'under', t: 38 } }, m);
  assert.match(out, /medals: \{ cristal: 33, or: 36\.1, argent: 40\.2, bronze: 47 \},\n {4}medalsBy: 'humain',\n {2}\},\n/);
  assert.equal((out.match(/medalsBy/g) || []).length, 1);
  assert.match(out, /goal: \{ id: 'under', t: 38 \}/);
  assert.match(out, /id: 'canyon', name: 'Y',\n {4}medals: \{ cristal: 1, or: 2, argent: 3, bronze: 4 \},\n {2}\},/, 'le circuit suivant ne bouge pas');
  assert.throws(() => writeMedals(src, { id: 'inconnu' }, m), /introuvable/);
});

test('les vrais circuits sont tous réinscriptibles (structure de js/tracks.js reconnue)', () => {
  let src = readFileSync(new URL('../js/tracks.js', import.meta.url), 'utf8');
  const before = src.length;
  for (const d of BUILTIN_TRACKS) src = writeMedals(src, d, d.medals);
  assert.equal((src.match(/medalsBy: 'humain'/g) || []).length, BUILTIN_TRACKS.length);
  assert.ok(src.length > before);
});

test('rapport et ligne de commande : rapport écrit, --ecrire refuse avec trop peu de testeurs', () => {
  const { rows } = simulate();
  const { best, dropped } = bestTimes(rows, { golden }), fit = fitPooled(best, golden);
  const md = toMarkdown({ fit, proposals: proposePooled(fit, golden), best, dropped, data: enoughData(best), fb: summariseFeedback([]), pv: PHYS_VER });
  for (const h of ['## Temps', '### Testeurs', '### Circuits', '## Avis', 'extrapolé', 'Circuit du jour']) assert.ok(md.includes(h), h);
  assert.match(md, new RegExp(`bronze ${Math.round(ESSAI_QUANTILES.bronze * 100)} %`));
  const none = bestTimes([{ install: 'a', track: 'daily', outcome: 'finish', time: '40', phys_ver: PHYS_VER }], { golden });
  assert.match(toMarkdown({ fit: fitPooled(none.best, golden), proposals: [], best: none.best, dropped: 0, data: enoughData(none.best), fb: null, pv: PHYS_VER }), /Aucun meilleur temps sur un circuit de la carrière/);
  const dir = mkdtempSync(join(tmpdir(), 'essais-'));
  const csv = (list) => ['install,track,outcome,time,phys_ver', ...list.map((r) => [r.install, r.track, r.outcome, r.time, r.phys_ver].join(','))].join('\n');
  writeFileSync(join(dir, 'runs.csv'), csv(simulate({ testers: 3 }).rows));
  const run = spawnSync(process.execPath, [new URL('./essais.mjs', import.meta.url).pathname, '--temps', join(dir, 'runs.csv'), '--md', join(dir, 'r.md'), '--ecrire'], { encoding: 'utf8' });
  assert.equal(run.status, 1); assert.match(run.stdout, /Trop peu de données/);
  assert.match(readFileSync(join(dir, 'r.md'), 'utf8'), /# Rapport des essais humains/);
});

await finish('Les médailles se calent sur un petit groupe de testeurs, circuit par circuit, et leurs avis se résument en un rapport.');
