// Défi du jour 2 (E13) : mutation du jour, séries, récompenses. node tools/test-defi.mjs   (npm test)
//  - la mutation est une catégorie (variante) du défi : le défi lui-même ne change pas (ni ceux de l'empreinte, ni les autres) ;
//  - chaque mutation retenue est faisable (pilote automatique) et vérifiée par le serveur (verifyRun), sous sa propre clé ;
//  - série calculée depuis dailyDays ; paliers et bonus versés une seule fois ; fusion cloud ; exclusifs.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { dailyChallenge, dayKey } from '../js/daily.js';
import { MUTATIONS, WEEK, dailyMutation, streakOf, dayOfKey } from '../js/mutations.js';
import { parseVariant, splitKey, applyVariant, VARIANTS, WIND_DIRS } from '../js/variants.js';
import { sanitizeRules, applyRules, DEFAULT_RULES, isDefaultRules } from '../js/rulesCore.js';
import { verifyRun } from '../js/verify.js';
import { traceFromBot } from '../js/analysis/trace.js';
import { describeDaily, describeVariant, hubCategories } from '../js/trackDescriptor.js';
import { noteRace, STREAK_STEPS, MUTATION_COINS, grantRewards, emptyContext, EXCLUSIVES } from '../js/rewards.js';
import { mergeProfile } from '../js/cloudsave.js';
import { profile, saveProfile, owns } from '../js/profile.js';
import { PHYS_VER } from '../js/version.js';

const days = (from, n) => Array.from({ length: n }, (_, i) => new Date(Date.parse(from + 'T00:00:00Z') + i * 86400000).toISOString().slice(0, 10));

console.log('Mutation du jour');
test('le défi du jour ne change pas : même circuit, même clé et même signature avant et après le calcul de sa mutation (jours de l’empreinte compris)', () => {
  for (const d of ['2026-12-01', '2026-12-07', '2026-11-20']) {
    const c = dailyChallenge(d), sig = c.track.signature(), code = c.track.encode();
    dailyMutation(d);
    assert.equal(c.track.signature(), sig, d); assert.equal(c.track.encode(), code, d);
    assert.equal(c.key, 'daily-' + d);
  }
});
test('deux semaines de mutations : une par jour, dans l’ordre de la semaine (ou la suivante si le pilote ne finit pas), sous une clé de catégorie valide', () => {
  let first = 0;
  for (const d of days('2026-11-09', 14)) {
    const m = dailyMutation(d);
    assert.ok(m, d);
    assert.ok(MUTATIONS[m.id] && WEEK.includes(m.id), d);
    const { base, variant } = splitKey(m.key);
    assert.equal(base, 'daily-' + d); assert.equal(variant, m.variant);
    assert.deepEqual(parseVariant(variant), m.v);
    assert.equal(dayOfKey(m.key), d);
    if (m.id === WEEK[new Date(d + 'T00:00:00Z').getUTCDay()]) first++;
    assert.equal(dailyMutation(d), m, 'calculée une fois par jour');
  }
  assert.ok(first >= 9, `la mutation de la semaine est le plus souvent retenue (${first} / 14)`);
});
test('la même date donne la même mutation (même vent, même direction) : tout le monde a la même', () => {
  for (const id of Object.keys(MUTATIONS)) { const a = MUTATIONS[id].v(() => 0.3), b = MUTATIONS[id].v(() => 0.3); assert.deepEqual(a, b); }
  assert.ok(Object.values(MUTATIONS).every((M) => M.label && M.icon && M.desc.length > 10));
});
test('une mutation ne rend aucune voiture plus rapide : elle ne touche qu’à la piste (adhérence, vent, gravité, véhicule de départ) ; le brouillard est visuel', () => {
  const allowed = new Set(['gp', 'wd', 'g', 'veh']);
  for (const M of Object.values(MUTATIONS)) for (const k of Object.keys(M.v(() => 0))) assert.ok(allowed.has(k), k);
  for (const v of VARIANTS.gp.values) assert.ok(+v < 100, 'le verglas réduit l’adhérence, jamais ne l’augmente');
  assert.deepEqual(MUTATIONS.brouillard.ambiance, { fog: 'thick' });
});
test('serveur : la course du pilote automatique sur la mutation d’aujourd’hui est acceptée sous la clé de la mutation, pas sous celle du défi', () => {
  const today = dayKey(), m = dailyMutation(today), c = dailyChallenge(today);
  assert.ok(m && c);
  const track = applyVariant(c.track, m.v), run = traceFromBot(track, { latK: 0.8 * Math.min(1, (track.grip || 100) / 100) });
  assert.ok(run && run.finished, 'le pilote finit la mutation');
  const ok = verifyRun({ trackKey: m.key, inputs: run.inputs, time: run.time, physVer: PHYS_VER });
  assert.equal(ok.ok, true, ok.error);
  const ko = verifyRun({ trackKey: c.key, inputs: run.inputs, time: run.time, physVer: PHYS_VER });
  assert.equal(ko.ok, false, 'les mêmes commandes ne donnent pas ce temps sur le défi sans mutation');
});

console.log('Règles et variantes');
test('adhérence et vent comme règles : bornés, absents par défaut (les règles d’avant gardent leur forme), appliqués à une copie', () => {
  assert.deepEqual(sanitizeRules({}), DEFAULT_RULES);
  assert.equal('grip' in sanitizeRules({ grip: 100 }), false);
  assert.deepEqual([sanitizeRules({ grip: 5 }).grip, sanitizeRules({ wind: 400, windDir: 90 }).wind, sanitizeRules({ wind: 30, windDir: 405 }).windDir], [25, 100, 45]);
  assert.ok(!isDefaultRules({ grip: 60 }));
  const c = dailyChallenge('2026-12-01'), t = applyRules(c.track, { grip: 60, wind: 25, windDir: 90 });
  assert.notEqual(t, c.track); assert.deepEqual([t.grip, t.wind, t.windDir, c.track.grip, c.track.wind], [60, 25, 90, 100, 0]);
  assert.notEqual(t.signature(), c.track.signature());
  assert.deepEqual(VARIANTS.wd.values, WIND_DIRS);
  assert.deepEqual(VARIANTS.wd.rule('e'), { wind: 25, windDir: 90 });
});

console.log('Fiche du défi');
test('la mutation est la première catégorie de la fiche du défi ; elle porte son ambiance et le lancement le sait', () => {
  const d0 = '2026-11-13', c = dailyChallenge(d0), m = dailyMutation(d0);
  assert.equal(m.id, 'brouillard');
  const desc = describeDaily(c, m), cats = hubCategories(desc);
  assert.equal(cats[0].id, m.variant.slice(3)); assert.ok(cats[0].mutation);
  assert.match(cats[0].label, /Mutation du jour : Verglas dans le brouillard/);
  const v = describeVariant(desc, m.v);
  assert.equal(v.key, m.key); assert.equal(v.launch.mutation, true); assert.equal(v.track.ambiance.fog, 'thick');
  assert.notEqual(c.track.ambiance.fog, 'thick', 'le défi lui-même garde son ambiance');
  assert.equal(describeVariant(desc, { veh: 'boat' }).launch.mutation, undefined, 'une autre catégorie n’est pas la mutation');
  assert.equal(hubCategories(describeDaily(c)).some((x) => x.mutation), false, 'sans mutation calculée : catégories habituelles');
});

console.log('Séries et récompenses');
test('série : jours consécutifs jusqu’à aujourd’hui, ou hier si le défi du jour n’est pas encore fait ; la plus longue série', () => {
  assert.deepEqual(streakOf([], '2026-11-08'), { current: 0, best: 0, today: false });
  assert.deepEqual(streakOf(['2026-11-06', '2026-11-07', '2026-11-08'], '2026-11-08'), { current: 3, best: 3, today: true });
  assert.deepEqual(streakOf(['2026-11-06', '2026-11-07'], '2026-11-08'), { current: 2, best: 2, today: false });
  assert.deepEqual(streakOf(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-07'], '2026-11-09'), { current: 0, best: 4, today: false });
  assert.deepEqual(streakOf(['2026-12-31', '2027-01-01', 'x', '2027-01-01'], '2027-01-01').current, 2, 'changement d’année, doublons et valeurs abîmées');
});
test('arrivées du défi : la série monte, les paliers paient une seule fois, la mutation paie une fois par jour', () => {
  const p = profile(); p.dailyDays = []; p.mutDays = []; p.dailyBest = 0; p.coins = 0; saveProfile();
  const run = days('2026-11-01', 8);
  let r = noteRace({ dailyDay: run[0] });
  assert.deepEqual([r.streak, r.coins, r.steps], [1, 0, []]);
  noteRace({ dailyDay: run[1] });
  r = noteRace({ dailyDay: run[2], mutation: true });
  assert.deepEqual([r.streak, r.steps, r.mutation, r.coins], [3, [3], MUTATION_COINS, STREAK_STEPS[0][1] + MUTATION_COINS]);
  r = noteRace({ dailyDay: run[2], mutation: true });
  assert.deepEqual([r.streak, r.coins, r.mutation], [3, 0, 0], 'la même mutation, le même jour : rien de plus');
  for (let i = 3; i < 7; i++) r = noteRace({ dailyDay: run[i] });
  assert.deepEqual([r.streak, r.steps, r.coins], [7, [7], STREAK_STEPS[1][1]]);
  assert.equal(profile().dailyBest, 7);
  p.dailyDays = [run[7]]; saveProfile();                  // une série qui repart : les paliers déjà payés ne repaient pas
  for (const d of days('2026-11-08', 7)) r = noteRace({ dailyDay: d });
  assert.deepEqual([r.streak, r.coins], [7, 0]);
  assert.equal(profile().coins, STREAK_STEPS[0][1] + STREAK_STEPS[1][1] + MUTATION_COINS);
  assert.equal(noteRace({ dailyDay: '' }).streak, null, 'hors défi : pas de série');
  p.dailyDays = []; p.mutDays = []; p.dailyBest = 0; p.coins = 0; saveProfile();
});
test('exclusifs : traînée givrée (série de 7 jours), lumière toxique (10 mutations)', () => {
  const p = profile(); p.owned = {}; saveProfile();
  assert.deepEqual(grantRewards({ ...emptyContext(), dailyBest: 6, mutations: 9 }).exclusives, []);
  assert.deepEqual(grantRewards({ ...emptyContext(), dailyBest: 7, mutations: 10 }).exclusives.map((e) => e.id).sort(), ['frost', 'toxic']);
  assert.ok(owns('trail', 'frost') && owns('led', 'toxic'));
  assert.ok(EXCLUSIVES.some((e) => e.id === 'frost') && EXCLUSIVES.some((e) => e.id === 'toxic'));
  p.owned = {}; saveProfile();
});
test('fusion cloud : mutations réunies, meilleure série au maximum ; rien d’ajouté à un profil qui n’en avait pas', () => {
  const m = mergeProfile({ coins: 1, mutDays: ['2026-11-01', 'x'], dailyBest: 4 }, { coins: 1, mutDays: ['2026-11-03', '2026-11-01'], dailyBest: 9 });
  assert.deepEqual([m.mutDays, m.dailyBest], [['2026-11-01', '2026-11-03'], 9]);
  const n = mergeProfile({ coins: 1 }, { coins: 2 });
  assert.equal('mutDays' in n || 'dailyBest' in n, false);
});

await finish('Tous les tests du défi du jour 2 passent.');
