// Règles de partie, modes de jeu et paquets « mods » (lot 13) : validation, transformation du circuit sans toucher à l'original, codes SHM1 / SHX1, aucune voiture offerte.
// node tools/test-modes.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import {
  sanitizeRules, isDefaultRules, applyRules, describeRules, sanitizeGoal, sanitizeMode, encodeMode, decodeMode, BUILTIN_MODES, DEFAULT_RULES,
} from '../js/rules.js';
import { sanitizePack, encodePack, decodePack, describePack, ownedCar, PACK_MAX_CHARS } from '../js/mods.js';
import { DEFAULT_LOADOUT, sanitizeLoadout } from '../js/cosmetics.js';
import { scriptTrack } from '../js/track.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { goalMet } from '../js/career.js';
import { isObstacle } from '../js/obstacles.js';

console.log('Règles');
test('valeurs hors bornes ramenées, inconnues ignorées ; les règles par défaut ne changent rien', () => {
  const r = sanitizeRules({ laps: 99, g0: 9, veh0: 'tank', v0: 9999, offroad: 'oui', obstacles: 'x', sameCars: 5, extra: 1 });
  assert.deepEqual(r, { laps: 5, g0: 15, veh0: '', v0: 300, offroad: -1, obstacles: '', sameCars: 1 });
  assert.deepEqual(sanitizeRules(null), DEFAULT_RULES); assert.ok(isDefaultRules({})); assert.ok(!isDefaultRules({ g0: 40 }));
  assert.equal(sanitizeRules({ offroad: true }).offroad, 1); assert.equal(sanitizeRules({ offroad: false }).offroad, 0);
});
test('applyRules : une COPIE transformée avec les réglages que le circuit sait déjà porter ; l\'original n\'est pas touché', () => {
  const t = scriptTrack('t', 'start S2 R S2 finish', { decor: 'desert' });
  const before = t.encode();
  assert.equal(applyRules(t, {}), t, 'sans règle : le même objet');
  const r = applyRules(t, { g0: 40, veh0: 'moto', v0: 200, offroad: 1 });
  assert.notEqual(r, t); assert.deepEqual([r.g0, r.veh0, r.v0, r.offroad], [40, 'moto', 200, 1]);
  assert.equal(t.encode(), before, 'l\'original est intact'); assert.equal(t.g0, 100);
  assert.notEqual(r.signature(), t.signature(), 'un circuit transformé n\'est plus celui des classements');
});
test('tours : seulement sur un circuit fermé ; obstacles retirés sur la copie seulement', () => {
  const open = scriptTrack('o', 'start S2 finish', { decor: 'desert' });
  assert.equal(applyRules(open, { laps: 3 }).laps, 1, 'un circuit ouvert garde un tour');
  const closed = scriptTrack('c', 'start S2 finish', { decor: 'desert' }); closed.laps = 2;
  assert.equal(applyRules(closed, { laps: 4 }).laps, 4);
  const withObst = buildBuiltin(BUILTIN_TRACKS.find((b) => b.decos && b.decos.some((d) => isObstacle(d.k))) || BUILTIN_TRACKS[BUILTIN_TRACKS.length - 1]);
  const n = withObst.decos.filter((d) => isObstacle(d.k)).length;
  const off = applyRules(withObst, { obstacles: 'off' });
  assert.equal(off.decos.filter((d) => isObstacle(d.k)).length, 0);
  assert.equal(withObst.decos.filter((d) => isObstacle(d.k)).length, n, 'l\'original garde ses obstacles');
});
test('circuit intégré : la ligne centrale (classement en direct) suit le circuit transformé, y compris le nombre de tours', () => {
  const def = BUILTIN_TRACKS.find((b) => b.laps > 1), one = BUILTIN_TRACKS.find((b) => !(b.laps > 1));
  const a = buildBuiltin(one);
  assert.ok(a.path && applyRules(a, { g0: 40 }).path === a.path, 'ligne centrale conservée');
  const t = buildBuiltin(def), per = (t.path.length - 1) / t.laps + 1;
  const r = applyRules(t, { laps: 5 });
  assert.equal(r.laps, 5); assert.equal(r.path.length, Math.round(per - 1) * 5 + 1, 'cinq tours de ligne centrale');
  assert.equal(t.path.length, Math.round(per - 1) * t.laps + 1, 'l\'original est intact');
});
test('descriptions lisibles', () => {
  assert.deepEqual(describeRules({}), []);
  assert.deepEqual(describeRules({ g0: 40, laps: 3, obstacles: 'off', v0: 0 }), ['Gravité de départ 40 %', 'Départ arrêté', '3 tours (circuits fermés)', 'Sans obstacles']);
});

console.log('Modes');
test('objectif : identifiant connu, valeurs bornées ; nom et description nettoyés', () => {
  assert.equal(sanitizeGoal({ id: 'nuke' }), null); assert.equal(sanitizeGoal(null), null);
  assert.deepEqual(sanitizeGoal({ id: 'turbo', n: 99 }), { id: 'turbo', n: 9 }); assert.deepEqual(sanitizeGoal({ id: 'under', t: 1 }), { id: 'under', t: 5 });
  assert.deepEqual(sanitizeGoal({ id: 'vehicle', v: 'tank' }), { id: 'vehicle', v: 'moto' });
  const m = sanitizeMode({ name: '<b>Hé</b>'.repeat(10), desc: '<script>x</script>', rules: { g0: 40 }, goal: { id: 'nowall' } });
  assert.ok(m.name.length <= 24 && !/[<>]/.test(m.name) && !/[<>]/.test(m.desc)); assert.equal(m.rules.g0, 40);
});
test('code SHM1 : aller-retour, erreurs lisibles, entrée hostile bornée', () => {
  const m = sanitizeMode({ name: 'Sauts', rules: { g0: 40, veh0: 'glider' }, goal: { id: 'perfect', n: 2 } });
  assert.deepEqual(decodeMode(encodeMode(m)), m);
  assert.throws(() => decodeMode('SHW3:x'), /pas un code de mode/); assert.throws(() => decodeMode('SHM1:@@'), /invalide/); assert.throws(() => decodeMode('SHM1:' + 'A'.repeat(3000)), /trop long/);
  const evil = decodeMode('SHM1:' + Buffer.from(JSON.stringify({ name: 'x', rules: { g0: 1e9, __proto__: { a: 1 } }, goal: { id: '__proto__' } })).toString('base64'));
  assert.equal(evil.rules.g0, 250); assert.equal(evil.goal, null); assert.equal({}.a, undefined);
});
test('modes fournis : tous valides, jouables ; leur objectif existe', () => {
  for (const m of BUILTIN_MODES) { const c = sanitizeMode(m); assert.equal(c.name, m.name.slice(0, 24)); assert.ok(!isDefaultRules(c.rules), m.id); if (m.goal) assert.ok(c.goal && typeof goalMet(c.goal, { wallHits: 0, respawns: 0, perfects: 9, turbos: 9, rings: 9, vehicle: 'moto', time: 1 }) === 'boolean'); }
});

console.log('Paquets');
test('un paquet ne contient que des données revalidées : tout champ inconnu est ignoré, tout excès borné', () => {
  const p = sanitizePack({ name: '<i>Pack</i>', car: { body: 'sport', custom: { parts: Array.from({ length: 99 }, () => ({ s: 'box' })) } }, ui: { theme: 'hack', hudScale: 99 }, cameras: Array.from({ length: 20 }, () => ({})),
    parts: Array.from({ length: 30 }, () => ({ name: 'P', parts: [{ s: 'cyl' }] })), modes: Array.from({ length: 30 }, () => ({ name: 'M' })), script: 'alert(1)', eval: 'x' });
  assert.ok(!/[<>]/.test(p.name)); assert.equal(p.car.custom.parts.length, 24); assert.equal(p.ui.theme, 'default'); assert.equal(p.ui.hudScale, 1.5);
  assert.equal(p.cameras.length, 6); assert.equal(p.parts.length, 8); assert.equal(p.modes.length, 6);
  assert.deepEqual(Object.keys(p).sort(), ['cameras', 'car', 'modes', 'name', 'parts', 'ui', 'v']);
});
test('code SHX1 : aller-retour, vide refusé, trop gros refusé, erreurs lisibles', () => {
  const pack = { name: 'Mon pack', car: sanitizeLoadout({ body: 'muscle', custom: { paint: { num: '7' } } }), modes: [sanitizeMode({ name: 'Lune', rules: { g0: 40 } })], cameras: [{ name: 'Haute', dist: 20 }] };
  const back = decodePack(encodePack(pack));
  assert.deepEqual(back, sanitizePack(pack));
  assert.deepEqual(describePack(back).map((x) => x[0]), ['car', 'cameras', 'modes']);
  assert.throws(() => decodePack(encodePack({ name: 'vide' })), /vide/);
  assert.throws(() => decodePack('SHC1:x'), /pas un code de paquet/); assert.throws(() => decodePack('SHX1:%%'), /invalide/); assert.throws(() => decodePack('SHX1:' + 'A'.repeat(PACK_MAX_CHARS)), /trop long/);
});
test('voiture importée : les éléments payants qu\'on ne possède pas sont remplacés, rien n\'est offert', () => {
  const car = sanitizeLoadout({ body: 'formula', wheels: 'gold', spoiler: 'big', trail: 'gold', color: '#123456', custom: { paint: { num: '9' } } });
  const L = ownedCar(car, (cat, id) => id === 'big', DEFAULT_LOADOUT);
  assert.equal(L.body, DEFAULT_LOADOUT.body); assert.equal(L.wheels, DEFAULT_LOADOUT.wheels); assert.equal(L.trail, DEFAULT_LOADOUT.trail, 'un exclusif non mérité non plus');
  assert.equal(L.spoiler, 'big', 'ce qu\'on possède reste'); assert.equal(L.color, '#123456', 'les couleurs sont libres'); assert.equal(L.custom.paint.num, '9', 'l\'atelier est gratuit');
});

finish('Tous les tests des règles, modes et paquets passent.');
