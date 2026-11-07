// Scripts de circuit (lot 12) : déclencheurs visuels et sonores sur des cases ; validation, code du circuit, hors signature, une seule fois par essai.
// node tools/test-scripts.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { sanitizeScript, sanitizeScripts, scriptsToArray, scriptsFromArray, scriptsAt, MAX_SCRIPTS, SCRIPT_ACTIONS } from '../js/scripts.js';
import { Track, scriptTrack, b64decode } from '../js/track.js';

const mk = () => scriptTrack('t', 'start S2 R S2 finish', { decor: 'desert' });
const dataOf = (code) => JSON.parse(b64decode(code.replace(/^SHW\d:/, '')));

console.log('Validation');
test('action inconnue refusée, valeurs ramenées au choix permis, message nettoyé et borné', () => {
  assert.equal(sanitizeScript({ a: 'gravity', v: '2' }), null);
  assert.equal(sanitizeScript({ a: 'msg', v: '   ' }), null, 'un message vide ne sert à rien');
  assert.equal(sanitizeScript({ a: 'msg', v: '<img onerror=1> Bravo ! '.repeat(5) }).v.length <= 40, true);
  assert.ok(!/[<>=]/.test(sanitizeScript({ a: 'msg', v: '<b>Hé</b>' }).v));
  assert.equal(sanitizeScript({ a: 'sky', v: 'purple' }).v, ''); assert.equal(sanitizeScript({ a: 'sky', v: 'night' }).v, 'night');
  assert.equal(sanitizeScript({ a: 'shake', v: '9' }).v, '1'); assert.equal(sanitizeScript({ a: 'sound', v: 'nuke' }).v, 'ding');
  assert.equal(sanitizeScript({ a: 'burst', v: 'red' }).v, '#ffd23e'); assert.equal(sanitizeScript({ a: 'burst', v: '#FF0000' }).v, '#ff0000');
  assert.deepEqual([sanitizeScript({ a: 'shake', x: 9999, z: 'x' }).x, sanitizeScript({ a: 'shake', x: 9999, z: 'x' }).z], [500, 0]);
  assert.equal(sanitizeScripts(Array.from({ length: 40 }, () => ({ a: 'shake' }))).length, MAX_SCRIPTS); assert.deepEqual(sanitizeScripts('x'), []);
});
test('aucune action ne touche à la physique : seulement du visuel et du sonore', () => {
  assert.deepEqual(SCRIPT_ACTIONS.map((a) => a[0]).sort(), ['burst', 'fog', 'msg', 'music', 'shake', 'sky', 'sound', 'weather']);
});

console.log('Dans le circuit');
test('aller-retour par le code ; sans script le code reste EXACTEMENT celui d\'avant ; hors signature', () => {
  const a = mk(), b = mk();
  assert.equal(a.encode(), b.encode()); assert.equal(dataOf(a.encode()).sc, undefined);
  const sig = b.signature();
  b.setParams({ scripts: [{ x: 1, z: 2, a: 'msg', v: 'Pont !' }, { x: -1, z: 0, a: 'weather', v: 'rain' }] });
  assert.equal(b.signature(), sig, 'ni records ni vérification ne bougent');
  assert.deepEqual(dataOf(b.encode()).sc, [[1, 2, 0, 'Pont !'], [-1, 0, 2, 'rain']]);
  const back = Track.decode(b.encode());
  assert.deepEqual(back.scripts, b.scripts);
  const c = back.clone(); c.scripts[0].v = 'x'; assert.equal(back.scripts[0].v, 'Pont !', 'le clone ne partage pas les objets');
  back.clear(); assert.deepEqual(back.scripts, []);
});
test('code hostile : indices et valeurs invalides ignorés', () => {
  assert.deepEqual(scriptsFromArray([[1, 1, 99, 'x'], 'x', null, [0, 0, 0, '<script>']]), [{ x: 0, z: 0, a: 'msg', v: 'script' }]);
  assert.deepEqual(scriptsFromArray('x'), []); assert.equal(scriptsToArray([]), null);
});

console.log('Course');
test('un déclencheur se joue une fois par essai, sur sa case seulement', () => {
  const list = sanitizeScripts([{ x: 2, z: 3, a: 'msg', v: 'A' }, { x: 2, z: 3, a: 'sound', v: 'whoosh' }, { x: 5, z: 5, a: 'shake', v: '1' }]);
  const done = new Set();
  assert.deepEqual(scriptsAt(list, 0, 0, done), []);
  assert.equal(scriptsAt(list, 2, 3, done).length, 2, 'deux déclencheurs sur la même case partent ensemble');
  assert.deepEqual(scriptsAt(list, 2, 3, done), [], 'pas deux fois');
  assert.equal(scriptsAt(list, 5, 5, done).length, 1);
  assert.equal(scriptsAt(list, 5, 5, new Set()).length, 1, 'un nouvel essai réarme');
});

finish('Tous les tests des scripts de circuit passent.');
