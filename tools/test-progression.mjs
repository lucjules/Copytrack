// Progression du pilote (E14) : expérience, niveaux, licences, défis de maîtrise, récompenses de niveau. node tools/test-progression.mjs   (npm test)
//  - l'expérience vient des courses terminées et des objectifs (jamais ailleurs : les appels sont listés) ; les arrivées répétées rapportent peu ;
//  - fusion cloud ; expérience de départ d'un profil existant ;
//  - AUCUN avantage de vitesse : ni la simulation ni la vérification serveur n'importent le profil, la progression ou le garage, et la même course
//    donne le même résultat au bit près avec un profil débutant et un profil niveau 50 tout équipé.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, finish } from './harness.mjs';
import { XP, MAX_LEVEL, xpForLevel, levelOf, awardRace, addXp, initialXp, ensureXp, grantLicences, LICENCES, licenceMet, mergeProgress, MASTERY, masteryBits, masteryCount, masteryFromRun, LEVEL_REWARDS } from '../js/progression.js';
import { profile, saveProfile, owns } from '../js/profile.js';
import { mergeProfile } from '../js/cloudsave.js';
import { grantRewards, emptyContext, EXCLUSIVES } from '../js/rewards.js';
import { CATALOG, exclusiveOf, DEFAULT_LOADOUT } from '../js/cosmetics.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reset = (extra = {}) => { const p = profile(); Object.assign(p, { xp: 0, licences: {}, mastery: {}, xpDay: null, medals: {}, goals: {}, academy: {}, drills: {}, dailyDays: [], mutDays: [], owned: {}, coins: 0 }, extra); p.stats.races = 0; saveProfile(); return p; };

console.log('Niveaux');
test('niveaux : 1 au départ, seuils croissants (100, 300, 600, 1 000…), plafond au niveau 50', () => {
  assert.deepEqual([xpForLevel(1), xpForLevel(2), xpForLevel(3), xpForLevel(5), xpForLevel(10)], [0, 100, 300, 1000, 4500]);
  assert.deepEqual([levelOf(0).level, levelOf(99).level, levelOf(100).level, levelOf(299).level, levelOf(300).level], [1, 1, 2, 2, 3]);
  const l = levelOf(350); assert.deepEqual([l.into, l.need], [50, 300]);
  assert.deepEqual([levelOf(1e9).level, levelOf(1e9).max, levelOf(-5).level, levelOf('x').level], [MAX_LEVEL, true, 1, 1]);
});

console.log('Expérience');
test('une arrivée : 20 XP la première fois du jour sur un circuit, 2 XP les suivantes ; un nouveau jour recommence', () => {
  reset();
  assert.equal(awardRace({ trackKey: 'b-x-1', tier: -1 }, '2026-11-08').xp, XP.finishFirst);
  assert.equal(awardRace({ trackKey: 'b-x-1', tier: -1 }, '2026-11-08').xp, XP.finishRepeat);
  assert.equal(awardRace({ trackKey: 'b-y-1', tier: -1 }, '2026-11-08').xp, XP.finishFirst);
  assert.equal(awardRace({ trackKey: 'b-x-1', tier: -1 }, '2026-11-09').xp, XP.finishFirst);
  assert.equal(awardRace({ trackKey: 'u-abc', tier: -1, firstOk: false }, '2026-11-09').xp, XP.finishRepeat, 'circuit de joueur non vérifié : pas de bonus de première arrivée');
  assert.equal(profile().xp, 3 * XP.finishFirst + 2 * XP.finishRepeat);
});
test('médailles : chaque palier atteint pour la première fois (bronze 20, argent 40, or 60, cristal 100) ; objectif, défi du jour, mutation, paliers de série', () => {
  reset();
  let r = awardRace({ trackKey: 'b-a', tier: 2, prevTier: undefined, medalXp: true }, '2026-11-08');
  assert.equal(r.xp, XP.finishFirst + XP.medal[3] + XP.medal[2], 'argent d’emblée : bronze + argent');
  r = awardRace({ trackKey: 'b-a', tier: 0, prevTier: 2, medalXp: true }, '2026-11-08');
  assert.equal(r.xp, XP.finishRepeat + XP.medal[1] + XP.medal[0], 'puis cristal : or + cristal');
  r = awardRace({ trackKey: 'b-a', tier: 1, prevTier: 0, medalXp: true }, '2026-11-08');
  assert.equal(r.xp, XP.finishRepeat, 'une médaille moins bonne ne rapporte rien');
  r = awardRace({ trackKey: 'u-z', tier: 0, medalXp: false }, '2026-11-08');
  assert.equal(r.xp, XP.finishFirst, 'médailles d’un circuit de joueur : pas d’expérience (on fabriquerait ses propres médailles)');
  r = awardRace({ trackKey: 'daily-2026-11-08', tier: -1, daily: true, mutation: true, steps: 2, goalNew: true }, '2026-11-08');
  assert.equal(r.xp, XP.finishFirst + XP.goal + XP.daily + XP.mutation + 2 * XP.streakStep);
  assert.ok(r.parts.every(([w, n]) => typeof w === 'string' && n > 0));
});
test('défis de maîtrise : or, cristal, objectif, sans faute ; chacun une fois (40 XP) ; seulement sur la carrière', () => {
  reset();
  let r = awardRace({ trackKey: 'b-m', tier: 1, goalMet: true, clean: false, builtin: true }, '2026-11-08');
  assert.equal(r.mastery, 1 | 4); assert.equal(r.xp, XP.finishFirst + 2 * XP.mastery);
  r = awardRace({ trackKey: 'b-m', tier: 2, goalMet: false, clean: true, builtin: true }, '2026-11-08');
  assert.equal(r.mastery, 8); assert.equal(r.xp, XP.finishRepeat + XP.mastery);
  r = awardRace({ trackKey: 'b-m', tier: 1, goalMet: true, clean: true, builtin: true }, '2026-11-08');
  assert.equal(r.mastery, 0, 'déjà acquis');
  assert.equal(masteryBits('b-m'), 1 | 4 | 8); assert.equal(masteryCount(), 3);
  awardRace({ trackKey: 'daily-2026-11-08', tier: 0, goalMet: true, clean: true, builtin: false }, '2026-11-08');
  assert.equal(masteryBits('daily-2026-11-08'), 0);
  assert.equal(masteryFromRun({ tier: 0, goal: true, clean: true }), 15);
  assert.equal(MASTERY.length, 4);
});
test('l’expérience ne vient que des courses et des objectifs : addXp et awardRace ne sont appelés qu’à l’arrivée d’une course et dans l’Académie', () => {
  const callers = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== 'vendor' && f !== 'i18n') walk(p); } else if (f.endsWith('.js')) { const src = readFileSync(p, 'utf8'); if (/\b(addXp|awardRace)\(/.test(src)) callers.push(relative(ROOT, p)); } } };
  walk(join(ROOT, 'js'));
  assert.deepEqual(callers.sort(), ['js/app/academy.js', 'js/progression.js', 'js/race/finish.js']);
  const src = readFileSync(join(ROOT, 'js/race/finish.js'), 'utf8');
  const at = src.indexOf('awardRace('), before = src.slice(0, at);
  assert.ok(before.includes('_finish(time)'), 'dans _finish : à l’arrivée');
  assert.ok(/if \(!this\.opts\.fromEditor && !this\.opts\.spawn\) \{\s*const tier/.test(src), 'ni essai de l’éditeur, ni départ choisi');
});

console.log('Expérience de départ, licences, fusion');
test('un profil d’avant cette version reçoit son expérience une seule fois, d’après ce qu’il a déjà accompli', () => {
  const keys = ['b-a-1', 'b-b-1'];
  const p = reset({ medals: { 'b-a-1': 1, 'b-b-1': 3, 'u-x': 0, 'daily-2026-11-01': 2 }, goals: { 'b-a-1#goal': 1 }, academy: { prise: 1, serie: 1 }, drills: { chicanes: { lvl: 2, best: 118 } }, dailyDays: ['2026-11-01', '2026-11-02'], mutDays: ['2026-11-02'] });
  p.stats.races = 50;
  const r = initialXp(p, keys);
  const medalXp = (XP.medal[3] + XP.medal[2] + XP.medal[1]) + XP.medal[3] + (XP.medal[3] + XP.medal[2]);
  assert.equal(r.xp, medalXp + XP.goal + 2 * XP.lesson + XP.drill[1] + XP.drill[2] + 2 * XP.daily + XP.mutation + 50 * XP.finishRepeat + 2 * XP.mastery);
  assert.deepEqual(r.mastery, { 'b-a-1': 1 | 4 });
  delete p.xp; saveProfile();
  assert.equal(ensureXp(keys), true); assert.equal(profile().xp, r.xp);
  assert.equal(ensureXp(keys), false, 'une seule fois');
  addXp(5); assert.equal(profile().xp, r.xp + 5);
});
test('licences : dans l’ordre (C, puis B…), seulement quand toutes les conditions sont remplies ; la date est gardée', () => {
  reset();
  const ctx = { level: 3, lessons: 6, silver: 0, gold: 0, crystals: 0, skillsMin: 0, mastery: 0 };
  assert.deepEqual(grantLicences({ ...ctx, level: 2 }), []);
  assert.deepEqual(grantLicences(ctx, 1000), ['C']);
  assert.deepEqual(grantLicences(ctx, 2000), [], 'déjà obtenue');
  const big = { level: 30, lessons: 6, silver: 72, gold: 72, crystals: 72, skillsMin: 3, mastery: 288 };
  assert.deepEqual(grantLicences(big, 3000), ['B', 'A', 'S']);
  assert.deepEqual(profile().licences, { C: 1000, B: 3000, A: 3000, S: 3000 });
  reset();
  assert.deepEqual(grantLicences({ ...big, lessons: 5 }), [], 'sans la C, pas de B');
  assert.ok(LICENCES.every((L) => L.req.length >= 2 && licenceMet(L, big)));
});
test('fusion cloud : expérience au maximum, licences réunies (la plus ancienne date), maîtrise réunie ; rien d’ajouté à un profil qui n’en avait pas', () => {
  const a = { xp: 500, licences: { C: 2000 }, mastery: { 'b-a': 1, 'b-b': 8 } }, b = { xp: 900, licences: { C: 1000, B: 3000 }, mastery: { 'b-a': 4 } };
  assert.deepEqual(mergeProgress(a, b), { xp: 900, licences: { C: 1000, B: 3000 }, mastery: { 'b-a': 5, 'b-b': 8 } });
  const m = mergeProfile({ coins: 1, ...a }, { coins: 1, ...b });
  assert.deepEqual([m.xp, m.licences, m.mastery], [900, { C: 1000, B: 3000 }, { 'b-a': 5, 'b-b': 8 }]);
  const n = mergeProfile({ coins: 1 }, { coins: 2 });
  assert.equal('xp' in n || 'licences' in n || 'mastery' in n, false);
  assert.deepEqual(mergeProgress({ mastery: { k: 255 } }, {}).mastery, { k: 15 }, 'bits inconnus écartés');
});

console.log('Récompenses de niveau et absence d’avantage');
test('récompenses de niveau : des éléments exclusifs du garage, visuels, gratuits, donnés au bon niveau', () => {
  for (const [lvl, cat, id] of LEVEL_REWARDS) {
    assert.ok(['trail', 'led'].includes(cat), 'seulement des lumières et des traînées : ' + cat);
    const it = CATALOG[cat].find((x) => x.id === id);
    assert.ok(it && it.cost === 0 && exclusiveOf(cat, id).includes(String(lvl)), id);
    assert.ok(EXCLUSIVES.some((e) => e.cat === cat && e.id === id));
  }
  reset();
  assert.deepEqual(grantRewards({ ...emptyContext(), level: 9 }).exclusives.map((e) => e.id).sort(), ['mint']);
  assert.deepEqual(grantRewards({ ...emptyContext(), level: 30 }).exclusives.map((e) => e.id).sort(), ['pale', 'plasma', 'violet']);
  assert.ok(owns('trail', 'plasma'));
  reset();
});
test('aucun module de la simulation ni de la vérification serveur n’importe le profil, la progression, le garage ou le stockage', () => {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"](\.[^'"]+)['"]/g)) visit(resolve(dirname(file), m[1]));
  };
  visit(join(ROOT, 'js/simulation.js')); visit(join(ROOT, 'js/verify.js'));
  const files = [...seen].map((f) => relative(ROOT, f));
  assert.ok(files.includes('js/physics.js') && files.length > 20, 'la fermeture est bien parcourue');
  for (const bad of ['js/profile.js', 'js/progression.js', 'js/cosmetics.js', 'js/rewards.js', 'js/skills.js', 'js/storage.js', 'js/cloudsave.js', 'js/mutations.js']) assert.ok(!files.includes(bad), bad + ' ne doit pas atteindre la physique');
});
test('la même course donne le même résultat, au bit près, avec un profil débutant et un profil niveau 50 tout équipé', () => {
  const run = () => {
    const track = buildBuiltin(BUILTIN_TRACKS[5]), sim = new Simulation(track);
    sim.start();
    const bot = new Autopilot(track.path, { latLimit: 44.8 });
    bot.reset(sim.phys);
    for (let i = 0; i < 120 * 90; i++) { const ev = sim.step(bot.control(sim.phys)); if (ev && ev.type === 'finish') break; }
    const p = sim.phys;
    return [sim.logic.time, p.pos.x, p.pos.y, p.pos.z, p.speed, sim.logic.steps];
  };
  reset({ loadout: { ...DEFAULT_LOADOUT } });
  const a = run();
  const p = reset({ xp: 1e9, licences: { C: 1, B: 1, A: 1, S: 1 } });
  for (const [cat, items] of Object.entries(CATALOG)) for (const it of items) p.owned[cat + ':' + it.id] = 1;
  p.loadout = { ...DEFAULT_LOADOUT, trail: 'plasma', led: 'pale' };
  saveProfile();
  const b = run();
  assert.deepEqual(b, a);
  assert.ok(a[0] > 5, 'la course est allée au bout');
  reset({ loadout: { ...DEFAULT_LOADOUT } });
});

await finish('Tous les tests de la progression du pilote passent.');
