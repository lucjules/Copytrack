// Fusion de sauvegardes sur des données aléatoires (y compris abîmées) : node tools/test-sauvegardes-fuzz.mjs   (npm test)
// Propriétés : la fusion ne lève jamais d'exception ; ne fait jamais perdre une médaille, un record ni une leçon ; ne dépasse jamais les valeurs d'origine
// pour les pièces ; est stable (re-fusionner le résultat avec l'un des deux ne change rien).
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { mergeProfile, mergeSaves, sameData } from '../js/cloudsave.js';

let seed = 99173; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const int = (n) => Math.floor(rnd() * n);
const pick = (a) => a[int(a.length)];
const JUNK = [null, undefined, 'x', 7, -3, NaN, [], {}, [1, 'a'], { a: 1 }, true];
const keysOf = ['k1', 'k2', 'k3', 'k4'];
const rec = () => ({ time: 10 + rnd() * 50, date: 1700000000000 + int(1e9), v: 28, name: 'J', ghost: rnd() < 0.5 ? 'g' : undefined });
const profile = () => ({
  id: 'P' + int(9), coins: int(500), medals: Object.fromEntries(keysOf.filter(() => rnd() < 0.6).map((k) => [k, int(4)])),
  stats: { races: int(100), earned: int(900), turbos: int(40) }, academy: Object.fromEntries(['prise', 'derapage', 'serie'].filter(() => rnd() < 0.5).map((k) => [k, 1])),
  owned: Object.fromEntries(['c1', 'c2', 'c3'].filter(() => rnd() < 0.5).map((k) => [k, 1])), dailyDays: [pick(['2026-11-01', '2026-11-02', 'pas une date', 5])],
});
const cloud = (junk) => {
  const o = { profile: profile() };
  for (const k of keysOf) if (rnd() < 0.7) o['rec3.' + k] = rec();
  if (junk) { o[pick(['profile', 'rec3.k1', 'tracks', 'tracksDel', 'runs.k1', 'recReset'])] = pick(JUNK); if (rnd() < 0.5) o.profile = { ...o.profile, [pick(['medals', 'stats', 'academy', 'owned', 'dailyDays', 'coins'])]: pick(JUNK) }; }
  return o;
};

console.log('Fusion de sauvegardes');
test('3000 fusions de données propres ou abîmées : aucune exception', () => {
  for (let i = 0; i < 3000; i++) { const a = rnd() < 0.1 ? pick(JUNK) : (() => { try { return cloud(rnd() < 0.5); } catch { return {}; } })(), b = cloud(rnd() < 0.5); assert.doesNotThrow(() => mergeSaves(a, b), 'fusion #' + i); assert.doesNotThrow(() => mergeProfile(a && a.profile, b.profile), 'profil #' + i); }
});
test('aucune médaille, aucun record, aucune leçon n\'est perdu ; les pièces ne dépassent jamais le maximum des deux côtés plus ce qui a été dépensé', () => {
  for (let i = 0; i < 1500; i++) {
    const a = cloud(false), b = cloud(false), m = mergeSaves(a, b);
    for (const k of keysOf) {
      const ra = a['rec3.' + k], rb = b['rec3.' + k], rm = m['rec3.' + k];
      if (ra || rb) assert.ok(rm && rm.time <= Math.min(ra ? ra.time : Infinity, rb ? rb.time : Infinity) + 1e-9, `record ${k}`);
      const ta = a.profile.medals[k], tb = b.profile.medals[k];
      if (ta !== undefined || tb !== undefined) assert.ok(m.profile.medals[k] <= Math.min(ta ?? 9, tb ?? 9), `médaille ${k}`);
    }
    for (const l of ['prise', 'derapage', 'serie']) if (a.profile.academy[l] || b.profile.academy[l]) assert.ok(m.profile.academy[l], 'leçon ' + l);
    for (const o of ['c1', 'c2', 'c3']) if (a.profile.owned[o] || b.profile.owned[o]) assert.ok(m.profile.owned[o], 'objet ' + o);
    assert.ok(m.profile.stats.races >= Math.max(a.profile.stats.races, b.profile.stats.races));
    assert.ok(Number.isFinite(m.profile.coins) && m.profile.coins >= 0 && m.profile.coins <= a.profile.coins + b.profile.coins, 'pièces : ' + m.profile.coins);
  }
});
test('stable : fusionner le résultat avec l\'un des deux côtés ne change rien', () => {
  for (let i = 0; i < 800; i++) { const a = cloud(false), b = cloud(false), m = mergeSaves(a, b); assert.ok(sameData(mergeSaves(m, a), m) || sameData(mergeSaves(a, m), m), 'fusion instable #' + i); }
});
finish('Toutes les fusions de sauvegardes tiennent.');
