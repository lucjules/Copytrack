// Records locaux : node tools/test-records.mjs   (npm test) — le temps et les médailles ne dépendent jamais de la place disponible.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
const medalFor = (t, m) => (t <= m.cristal ? 'cristal' : t <= m.or ? 'or' : null);

// Faux localStorage avec un quota (en caractères).
function fakeStorage(quota) {
  const m = new Map();
  const size = () => [...m].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    get length() { return m.size; }, key: (i) => [...m.keys()][i],
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) { const old = m.get(k) || ''; if (size() - (m.has(k) ? k.length + old.length : 0) + k.length + v.length > quota) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } m.set(k, String(v)); },
    removeItem: (k) => m.delete(k),
    _keys: () => [...m.keys()],
  };
  void size;
}
Object.defineProperty(globalThis, 'localStorage', { value: fakeStorage(100000), configurable: true, writable: true });
// Object.keys(localStorage) doit lister les clés comme un vrai Storage.
const wrap = (st) => new Proxy(st, { ownKeys: () => st._keys(), getOwnPropertyDescriptor: (t, k) => (st._keys().includes(k) ? { enumerable: true, configurable: true, value: st.getItem(k) } : Reflect.getOwnPropertyDescriptor(t, k)) });
const { getRecord, saveRecord } = await import('../js/storage.js');

const rec = (time, big = 0, date = Date.now()) => ({ time, splits: [1, 2], ghost: 'g'.repeat(big), inputs: 'i'.repeat(big), pv: 20, date, name: 'Zoé' });

console.log('Records locaux');
test('stockage normal : le record est lu tel quel', () => {
  globalThis.localStorage = wrap(fakeStorage(100000));
  assert.equal(saveRecord('b-a', rec(20.5, 100)), true);
  assert.equal(getRecord('b-a').time, 20.5); assert.equal(getRecord('b-a').ghost.length, 100);
});
test('stockage plein : le fantôme est sacrifié, jamais le temps ni les médailles', () => {
  globalThis.localStorage = wrap(fakeStorage(3000));
  assert.equal(saveRecord('b-b', rec(18.2, 5000)), true);          // trop gros avec fantôme et commandes : réduit
  const r = getRecord('b-b');
  assert.equal(r.time, 18.2); assert.equal(medalFor(r.time, { cristal: 19, or: 20, argent: 23, bronze: 27 }), 'cristal');
});
test('stockage saturé par d’autres circuits : leurs fantômes sont libérés (le plus ancien d’abord) pour garder le nouveau record', () => {
  const st = fakeStorage(9000); globalThis.localStorage = wrap(st);
  for (let i = 0; i < 5; i++) saveRecord('old' + i, rec(30 + i, 600, 1000 + i));
  assert.equal(saveRecord('b-new', rec(15.5, 600, 99999)), true, 'écrit sur le disque');
  assert.equal(JSON.parse(st.getItem('shardway.rec3.b-new')).time, 15.5);
  assert.equal(getRecord('old0').time, 30, 'les autres gardent leur temps');
});
test('même si le disque refuse tout, le menu voit le record de la session (copie en mémoire)', () => {
  globalThis.localStorage = wrap(fakeStorage(0));
  assert.equal(saveRecord('b-z', rec(22.2, 10)), false);
  assert.equal(getRecord('b-z').time, 22.2);
  assert.equal(getRecord('b-inconnu'), null);
});
test('un meilleur temps en mémoire l’emporte sur un ancien record du disque', () => {
  globalThis.localStorage = wrap(fakeStorage(100000));
  saveRecord('b-k', rec(30, 10));
  globalThis.localStorage.setItem('shardway.rec3.b-k', JSON.stringify(rec(40, 10)));      // le disque est revenu en arrière (autre onglet, synchro)
  assert.equal(getRecord('b-k').time, 30);
});

await finish('Tous les tests de records passent.');
