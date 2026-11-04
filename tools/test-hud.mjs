// Tests des messages du HUD : node tools/test-hud.mjs   (npm test)
import assert from 'node:assert/strict';
import { MessageGate, MSG, PRIO } from '../js/hudMessages.js';

let failures = 0;
function test(name, fn) { try { fn(); console.log('  ok   ' + name); } catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const flat = (m) => (typeof m === 'function' ? null : Array.isArray(m) ? [m] : Object.values(m).flatMap(flat));

test('un message moins important ne coupe pas un message important en cours', () => {
  const g = new MessageGate();
  assert.equal(g.offer('Hors piste', 1000, PRIO.penalty, 0), true);
  assert.equal(g.offer('Volant inversé', 1000, PRIO.info, 300), false, 'ignoré');
  assert.equal(g.offer('Gravité 40 %', 1000, PRIO.event, 400), false, 'ignoré aussi');
  assert.equal(g.offer('Volant inversé', 1000, PRIO.info, 1200), true, 'après la fin du message, on affiche à nouveau');
});
test('un message plus important remplace le courant', () => {
  const g = new MessageGate();
  assert.equal(g.offer('Volant inversé', 1000, PRIO.info, 0), true);
  assert.equal(g.offer('Piques', 1000, PRIO.penalty, 200), true);
});
test('pas de répétition dans la seconde', () => {
  const g = new MessageGate();
  assert.equal(g.offer('Hors piste', 800, PRIO.penalty, 0), true);
  assert.equal(g.offer('Hors piste', 800, PRIO.penalty, 900), false);
  assert.equal(g.offer('Hors piste', 800, PRIO.penalty, 1500), true);
});
test('message vide : efface', () => {
  const g = new MessageGate();
  g.offer('Piques', 5000, PRIO.penalty, 0); g.offer('', 0, 0, 10);
  assert.equal(g.offer('Volant inversé', 500, PRIO.info, 20), true);
});
test('tous les textes sont courts (28 caractères au plus) et durent au plus 1,2 s', () => {
  const all = [MSG.offTrack, MSG.spikes, MSG.glass, MSG.sink, MSG.reverse, MSG.cut, MSG.badLanding, MSG.keepClock,
    ...Object.values(MSG.fall), ...Object.values(MSG.vehicle), MSG.missing(1), MSG.missing(3), MSG.gravity(40), MSG.flip(true), MSG.flip(false), MSG.lap(2, 3), MSG.lap(3, 3)];
  for (const [text, prio, dur] of all) { assert.ok(text.length <= 28, text); assert.ok(dur <= 1.2 && dur >= 0.8, text + ' ' + dur); assert.ok(prio >= 1 && prio <= 3); }
  assert.equal(MSG.fall.crest, undefined, 'le décollage n\'a plus de message');
});

if (failures) { console.log(`\n${failures} test(s) en échec`); process.exit(1); }
console.log('\nTous les tests du HUD passent.');
