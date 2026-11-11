// AUDIT 0.9.59 — sauvegardes : node tools/test-audit-sauvegardes.mjs   (npm test)
//   1. « Effacer les records » sur un appareil : après synchronisation, les records quittent AUSSI le stockage de l'autre appareil (ils y restaient pour toujours).
//   2. Enregistrer un circuit quand le stockage du navigateur est plein : jamais de succès annoncé à tort ; on fait d'abord de la place (fantômes des records), sans perdre un temps.
//   3. Affichage d'un temps : pas de « 00:60.000 » au passage d'une minute.
// Le serveur Supabase est simulé (tools/fake-supabase.mjs). Chaque test échoue sur le code d'avant la correction.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { device } from './fake-supabase.mjs';

device('A');
const storage = await import('../js/storage.js');
const { online } = await import('../js/online.js');
const { account } = await import('../js/account.js');
const { reloadProfile } = await import('../js/profile.js');

function boot(name) {
  const d = device(name);
  account.state = null; account.status = 'idle'; clearTimeout(account._timer); account._running = null; account._dirty = false;
  online.useGuest(); online.onAccountSession = null; online._authP = null;
  storage.setScope('');
  reloadProfile();
  return d;
}
const rec = (time, date, extra = {}) => ({ time, pv: 33, splits: [], inputs: 'x'.repeat(40), date, name: 'x', ghost: null, ...extra });

console.log('Synchronisation : une suppression faite ailleurs arrive jusqu\'au stockage de cet appareil');
await test('deux appareils, un compte : A efface ses records et supprime un circuit → après synchronisation B n\'a plus ni record, ni circuit, ni courses récentes ; un record refait ensuite revient partout', async () => {
  boot('A');
  await account.signUp('Zoe_01', 'motdepasse1');
  storage.saveRecord('b-t1-x', rec(20, 100));
  storage.saveRecord('b-t2-x', rec(31, 110));
  storage.saveMyTrack({ id: 'c1', name: 'Circuit 1', code: 'SHW3:xxx' });
  storage.pushRun('b-t1-x', { time: 20, date: 100 });
  await account.sync();
  boot('B');
  await account.signIn('Zoe_01', 'motdepasse1');
  assert.ok(storage.getRecord('b-t1-x') && storage.getRecord('b-t2-x'), 'B reçoit les records');
  assert.equal(storage.listMyTracks().length, 1);
  boot('A'); await account.restore();
  storage.clearRecords(); storage.deleteMyTrack('c1');
  await account.sync();
  boot('B'); await account.restore();
  await account.sync();
  assert.equal(storage.getRecord('b-t1-x'), null, 'le record effacé sur A n\'est plus sur B');
  assert.equal(storage.getRecord('b-t2-x'), null);
  assert.ok(!Object.keys(storage.dumpAll()).some((k) => k.startsWith('rec3.')), 'plus aucune clé de record dans le stockage de B');
  assert.equal(storage.listMyTracks().length, 0, 'le circuit supprimé a disparu de B');
  assert.equal(storage.listRuns('b-t1-x').length, 0);
  assert.equal(await account.sync(), 'à jour', 'une seconde synchronisation n\'a plus rien à faire');
  // B refait un temps APRÈS l'effacement : il n'est pas pris pour un ancien record.
  storage.saveRecord('b-t1-x', rec(25, Date.now() + 1000));
  await account.sync();
  boot('A'); await account.restore(); await account.sync();
  assert.equal(storage.getRecord('b-t1-x').time, 25, 'le nouveau record de B arrive sur A');
  assert.equal(storage.getRecord('b-t2-x'), null);
});

console.log('Stockage plein : jamais de succès annoncé à tort');
test('enregistrer un circuit quand le navigateur refuse d\'écrire : wroteOk() est faux (l\'éditeur prévient au lieu d\'annoncer « Circuit enregistré »)', () => {
  const d = boot('F');
  const real = d.local.setItem.bind(d.local);
  d.local.setItem = () => { throw new Error('QuotaExceededError'); };
  storage.saveMyTrack({ id: 'x1', name: 'Perdu ?', code: 'SHW3:abc' });
  assert.equal(storage.wroteOk(), false, 'écriture ratée signalée');
  d.local.setItem = real;
  assert.equal(storage.listMyTracks().length, 0, 'rien n\'a été écrit');
  storage.saveMyTrack({ id: 'x1', name: 'Gardé', code: 'SHW3:abc' });
  assert.equal(storage.wroteOk(), true);
  assert.equal(storage.listMyTracks()[0].name, 'Gardé');
});
test('stockage presque plein : l\'enregistrement d\'un circuit libère la place prise par les fantômes des plus anciens records ; aucun temps n\'est perdu', () => {
  const d = boot('Q');
  // Trois records avec un gros fantôme, puis un quota : la place restante ne suffit pas pour le circuit tant qu'un fantôme n'est pas retiré.
  for (let i = 0; i < 3; i++) storage.saveRecord('b-t' + i + '-x', rec(10 + i, 100 + i, { ghost: 'g'.repeat(4000) }));
  const real = d.local.setItem.bind(d.local);
  const used = () => { let n = 0; for (const [k, v] of d.local.m) n += k.length + v.length; return n; };
  const quota = used() + 1500;
  d.local.setItem = (k, v) => { const old = d.local.m.get(k); const after = used() - (old ? k.length + old.length : 0) + k.length + String(v).length; if (after > quota) throw new Error('QuotaExceededError'); real(k, v); };
  storage.saveMyTrack({ id: 'big', name: 'Grand circuit', code: 'SHW3:' + 'c'.repeat(5000) });
  assert.equal(storage.wroteOk(), true, 'le circuit est enregistré');
  assert.equal(storage.listMyTracks()[0].id, 'big');
  assert.deepEqual([0, 1, 2].map((i) => storage.getRecord('b-t' + i + '-x').time), [10, 11, 12], 'les trois temps sont toujours là');
  assert.equal(storage.getRecord('b-t0-x').ghost, null, 'le fantôme du plus ancien record a été sacrifié');
  assert.ok(storage.getRecord('b-t2-x').ghost, 'celui du plus récent est gardé');
  d.local.setItem = real;
});

console.log('Affichage des temps');
test('formatTime : le passage d\'une minute ne s\'écrit jamais « :60.000 » ; les autres valeurs ne changent pas', () => {
  const f = storage.formatTime;
  assert.equal(f(59.9996), '01:00.000');
  assert.equal(f(119.99951), '02:00.000');
  assert.equal(f((7199 + 0.95) / 120), '01:00.000', 'chrono interpolé juste avant la minute');
  assert.equal(f(59.9994), '00:59.999');
  assert.equal(f(0), '00:00.000');
  assert.equal(f(21.6), '00:21.600');
  assert.equal(f(83.4583), '01:23.458');
  assert.equal(f(-0.25, true), '-00:00.250');
  assert.equal(f(0.25, true), '+00:00.250');
  assert.equal(f(-59.9996, true), '-01:00.000');
  assert.equal(f(null), '--:--.---');
  assert.equal(f(NaN), '--:--.---');
  for (let k = 0; k < 20000; k += 7) { const t = f(k / 120); assert.ok(/^\d\d+:[0-5]\d\.\d{3}$/.test(t), t); }
});

await finish('Tous les tests de l\'audit des sauvegardes passent.');
process.exit(0);
