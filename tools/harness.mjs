// Harnais de test commun à tous les scripts de tools/ (il remplace le test() qui était recopié dans chaque fichier).
//
//   import { test, finish } from './harness.mjs';
//   test('ce que le test vérifie', () => { assert.equal(…) });         // synchrone ou asynchrone
//   finish('Tous les tests de … passent.');                           // en dernier : code de sortie 1 s'il y a eu un échec
//
// Un test asynchrone dont on oublie le await est quand même attendu par finish() : ses assertions ne se perdent pas.
let failures = 0;
const pending = new Set();

const ok = (name) => console.log('  ok   ' + name);
const fail = (name, e) => {
  failures++;
  console.log('  FAIL ' + name + '\n       ' + String((e && (e.stack || e.message)) || e).split('\n').slice(0, 6).join('\n       '));
};

export function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      const p = r.then(() => ok(name), (e) => fail(name, e)).finally(() => pending.delete(p));
      pending.add(p);
      return p;
    }
    ok(name);
  } catch (e) { fail(name, e); }
  return undefined;
}

export const failureCount = () => failures;

export async function finish(successMessage = 'Tous les tests passent.') {
  while (pending.size) await Promise.all([...pending]);
  if (failures) { console.log(`\n${failures} test(s) en échec`); process.exit(1); }
  console.log('\n' + successMessage);
}
