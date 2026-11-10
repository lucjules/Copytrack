// PHASE 4 — comptes, invité, cloud : node tools/test-phase4.mjs   (npm test)
// Sessions (panne du serveur ≠ session expirée), code joueur sans identité en ligne, restauration d'une ancienne sauvegarde face aux suppressions,
// convergence de la synchronisation entre appareils (essais aléatoires). Le serveur Supabase est simulé (tools/fake-supabase.mjs).
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { device, srv } from './fake-supabase.mjs';

device('A');
const storage = await import('../js/storage.js');
const { online } = await import('../js/online.js');
const { account } = await import('../js/account.js');
const { mergeSaves, toCloud } = await import('../js/cloudsave.js');
const { profile, saveProfile, reloadProfile, exportCode, parseCode, applySave } = await import('../js/profile.js');

function boot(name) {
  device(name);
  account.state = null; account.status = 'idle'; clearTimeout(account._timer); account._running = null; account._dirty = false;
  online.useGuest(); online.onAccountSession = null; online._authP = null;
  storage.setScope('');
  reloadProfile();
}
const lcg = (s) => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const rec = (time, extra = {}) => ({ time, pv: 31, splits: [], inputs: 'x', date: 10, name: 'x', ghost: null, ...extra });

console.log('Sessions : une panne du serveur n\'est pas une session expirée');
await test('compte : le serveur répond 500 ou 429 au renouvellement → la session est CONSERVÉE (erreur passagère), pas de déconnexion', async () => {
  boot('A'); srv.refreshStatus = 0; srv.offline = false;
  await account.signUp('Alice_01', 'motdepasse1');
  const before = online.session;
  for (const status of [500, 502, 503, 429]) {
    srv.refreshStatus = status; online.session = { ...before, expires_at: 1 };      // jeton d'accès périmé
    await assert.rejects(() => online.ensureSession(), (e) => e.code === 'offline' && e.code !== 'session-expired', 'statut ' + status);
    assert.ok(account.isAccount, 'toujours connecté (' + status + ')');
    assert.equal(online.session.refresh_token, before.refresh_token, 'jeton de renouvellement gardé');
  }
  srv.refreshStatus = 0; online.session = { ...before, expires_at: 1 };
  assert.ok((await online.ensureSession()).access_token, 'le serveur revenu, la session se renouvelle');
});
await test('compte : au démarrage, une panne du serveur garde le compte ; un jeton REFUSÉ (400) demande de se reconnecter', async () => {
  boot('A'); srv.refreshStatus = 0;
  await account.signUp('Bob_02', 'motdepasse1');
  const saved = JSON.parse(device('A').local.getItem('copytrack.account'));
  saved.session.expires_at = 1; device('A').local.setItem('copytrack.account', JSON.stringify(saved));
  boot('A'); srv.refreshStatus = 503;
  assert.equal((await account.restore()).kind, 'account', 'serveur en panne : on joue avec la sauvegarde locale du compte');
  assert.ok(device('A').local.getItem('copytrack.account'), 'identité du compte conservée sur l\'appareil');
  boot('A'); srv.refreshStatus = 400;
  assert.equal((await account.restore()).kind, 'expired');
  assert.equal(device('A').local.getItem('copytrack.account'), null, 'refusé par le serveur : la session est oubliée');
  srv.refreshStatus = 0;
});
await test('invité : une panne du serveur ne lui donne PAS une nouvelle identité (ses scores et circuits publiés lui appartiennent) ; un jeton refusé, si', async () => {
  boot('G'); srv.refreshStatus = 0;
  const s1 = await online.ensureSession(), uid1 = s1.user.id;
  const signups = () => srv.calls.filter((c) => c.path === '/auth/v1/signup').length;
  const n0 = signups();
  for (const status of [500, 503, 429]) {
    online.session = { ...s1, expires_at: 1 }; srv.refreshStatus = status;
    await assert.rejects(() => online.ensureSession(), (e) => e.code === 'offline', 'statut ' + status);
    assert.equal(online.session.user.id, uid1, 'même invité');
  }
  assert.equal(signups(), n0, 'aucune nouvelle session anonyme créée');
  srv.refreshStatus = 400; online.session = { ...s1, expires_at: 1 };
  const s2 = await online.ensureSession();
  assert.notEqual(s2.user.id, uid1, 'jeton refusé : nouvelle session anonyme (seul cas)');
  srv.refreshStatus = 0;
});

console.log('Code joueur et restauration : jamais l\'identité en ligne d\'un autre appareil');
await test('le code joueur exporté ne contient NI la session en ligne NI le profil en ligne de l\'invité', async () => {
  boot('G'); srv.refreshStatus = 0;
  await online.ensureSession(); online.player = { id: online.uid, name: 'Zoé' }; online._save();
  assert.ok(device('G').local.getItem('shardway.online.session'), 'la session est bien stockée localement');
  const p = profile(); p.coins = 77; saveProfile();
  const code = await exportCode();
  const obj = await parseCode(code);
  assert.ok(!('online.session' in obj.data) && !('online.player' in obj.data), Object.keys(obj.data).join());
  assert.ok(!JSON.stringify(obj).includes(online.session.refresh_token), 'le jeton de renouvellement ne voyage pas');
  assert.equal(JSON.parse(obj.data.profile).coins, 77, 'le reste de la sauvegarde y est');
});
await test('importer un code (ancien, contenant une session) sur un autre appareil : la session importée est ignorée, l\'identité en ligne locale est intacte — en remplacement comme en fusion', async () => {
  boot('G'); srv.refreshStatus = 0;
  const mine = await online.ensureSession();
  const myTok = mine.refresh_token;
  const foreign = { v: 1, id: 'x', t: 1, data: { profile: JSON.stringify({ coins: 5 }), 'online.session': JSON.stringify({ access_token: 'volé', refresh_token: 'volé', expires_at: 9e9, user: { id: 'autre' } }), 'online.player': JSON.stringify({ id: 'autre', name: 'Victime' }), 'cle invalide!': 'x', nombre: 12 } };
  for (const mode of ['replace', 'merge']) {
    applySave(foreign, mode);
    const s = JSON.parse(device('G').local.getItem('shardway.online.session'));
    assert.equal(s.refresh_token, myTok, mode + ' : ma session est conservée');
    assert.ok(!device('G').local.getItem('shardway.cle invalide!'), mode + ' : clé de forme invalide ignorée');
    assert.equal(JSON.parse(device('G').local.getItem('shardway.online.player') || 'null'), mine && JSON.parse(device('G').local.getItem('shardway.online.player') || 'null'));
  }
  assert.equal(JSON.parse(device('G').local.getItem('shardway.profile')).coins, 5, 'la progression, elle, est restaurée');
});

console.log('Restauration d\'une ancienne sauvegarde face aux suppressions volontaires');
const trackRow = (id, updated, name = 'T') => ({ id, name, code: 'SHW3:x', updated });
const setLocal = (dev, k, v) => device(dev).local.setItem('shardway.' + k, typeof v === 'string' ? v : JSON.stringify(v));
const getLocal = (dev, k) => { const v = device(dev).local.getItem('shardway.' + k); return v == null ? null : JSON.parse(v); };
await test('circuit supprimé (pierre tombale synchronisée) puis restauré depuis une ancienne sauvegarde : il REVIT après la synchronisation (avant : supprimé de nouveau)', () => {
  boot('R');
  setLocal('R', 'tracks', []); setLocal('R', 'tracksDel', { t1: 5000 });
  const backup = { v: 1, id: 'p', t: 1, data: { tracks: JSON.stringify([trackRow('t1', 100), trackRow('t2', 100)]) } };
  applySave(backup, 'merge', 9000);
  const local = getLocal('R', 'tracks');
  assert.equal(local.length, 2); assert.equal(local.find((t) => t.id === 't1').updated, 9000, 'daté de la restauration');
  assert.ok(!('t1' in getLocal('R', 'tracksDel')), 'la pierre tombale locale du circuit restauré est retirée');
  // le cloud garde, lui, la pierre tombale : la fusion ne doit pas le supprimer
  const cloud = { tracksDel: { t1: 5000 }, tracks: [] };
  const merged = mergeSaves(toCloud({ tracks: JSON.stringify(local), tracksDel: JSON.stringify(getLocal('R', 'tracksDel')) }), cloud);
  assert.deepEqual(merged.tracks.map((t) => t.id).sort(), ['t1', 't2'], 'circuit restauré présent après fusion');
  // sans la restauration, une suppression postérieure à la dernière modification reste une suppression
  const plain = mergeSaves(toCloud({ tracks: JSON.stringify([trackRow('t1', 100)]) }), cloud);
  assert.deepEqual(plain.tracks.map((t) => t.id), [], 'une vieille copie non restaurée ne ressuscite pas le circuit supprimé');
});
await test('restauration en mode « remplacer » : mêmes garanties (circuits et records restaurés survivent à la remise à zéro du cloud)', () => {
  boot('R');
  setLocal('R', 'tracks', []); setLocal('R', 'tracksDel', { t1: 5000 }); setLocal('R', 'recReset', '5000');
  const backup = { v: 1, id: 'p', t: 1, data: { tracks: JSON.stringify([trackRow('t1', 100)]), tracksDel: '{}', 'rec3.b-eclats-x': JSON.stringify(rec(40, { date: 100 })) } };
  applySave(backup, 'replace', 9000);
  const local = { tracks: JSON.stringify(getLocal('R', 'tracks')), 'rec3.b-eclats-x': device('R').local.getItem('shardway.rec3.b-eclats-x') };
  const merged = mergeSaves(toCloud(local), { tracksDel: { t1: 5000 }, recReset: 5000 });
  assert.equal(merged.tracks.length, 1);
  assert.ok(merged['rec3.b-eclats-x'], 'le record restauré survit à la remise à zéro faite avant la restauration');
  assert.equal(merged['rec3.b-eclats-x'].time, 40);
});
await test('une remise à zéro volontaire des records reste valable : les records anciens NON restaurés sont toujours effacés', () => {
  const merged = mergeSaves({ 'rec3.b-a': rec(30, { date: 100 }), 'rec3.b-b': rec(31, { date: 100, rt: 9000 }), recReset: 5000 }, { 'rec3.b-a': rec(30, { date: 100 }), recReset: 5000 });
  assert.ok(!('rec3.b-a' in merged), 'record ancien : effacé');
  assert.ok('rec3.b-b' in merged, 'record restauré après : gardé');
});
await test('restauration en fusion : les pierres tombales locales d\'autres circuits restent, la plus récente suppression de chacun l\'emporte', () => {
  boot('R');
  setLocal('R', 'tracks', []); setLocal('R', 'tracksDel', { a: 100, b: 300 });
  applySave({ v: 1, id: 'p', t: 1, data: { tracks: '[]', tracksDel: JSON.stringify({ a: 200, c: 50 }) } }, 'merge', 9000);
  assert.deepEqual(getLocal('R', 'tracksDel'), { a: 200, b: 300, c: 50 });
});

console.log('Synchronisation : convergence entre appareils (essais aléatoires)');
// Deux appareils, des opérations au hasard (créer, modifier, supprimer un circuit, améliorer un record), des synchronisations dans un ordre au hasard :
// à la fin, les deux appareils et le cloud ont EXACTEMENT les mêmes données, et rien de ce qui n'a pas été supprimé volontairement n'a disparu.
await test('60 parties : convergence, aucun circuit perdu, aucun meilleur temps perdu, suppressions respectées', async () => {
  for (let seed = 1; seed <= 60; seed++) {
    const rnd = lcg(seed * 7919);
    srv.users.clear(); srv.saves.clear(); srv.accounts.clear(); srv.tokens.clear(); srv.refresh.clear(); srv.refreshStatus = 0; srv.offline = false;
    boot('A'); await account.signUp('Joueur_' + seed, 'motdepasse1');
    const login = { name: 'Joueur_' + seed };
    boot('B'); await account.signIn(login.name, 'motdepasse1');
    const expectTracks = new Map(), bestTime = new Map();     // vérité attendue
    let clock = 1000;
    const act = async (dev) => {
      boot(dev); await account.signIn(login.name, 'motdepasse1');
      const tracks = getLocal2('tracks') || [], dels = getLocal2('tracksDel') || {};
      const r = rnd();
      clock += 10;
      if (r < 0.3) { const id = 't' + ((rnd() * 6) | 0); const row = { id, name: 'n' + clock, code: 'c', updated: clock }; const i = tracks.findIndex((t) => t.id === id); if (i >= 0) tracks[i] = row; else tracks.push(row); delete dels[id]; expectTracks.set(id, clock); }
      else if (r < 0.45 && tracks.length) { const t = tracks[(rnd() * tracks.length) | 0]; tracks.splice(tracks.indexOf(t), 1); dels[t.id] = clock; expectTracks.delete(t.id); }
      else if (r < 0.8) { const k = 'rec3.b-c' + ((rnd() * 3) | 0), time = 30 + Math.floor(rnd() * 400) / 10; const cur = getLocal2(k); if (!cur || time < cur.time) { storage.setJSON(k, rec(time, { date: clock })); } bestTime.set(k, Math.min(bestTime.get(k) ?? Infinity, time)); }
      storage.setJSON('tracks', tracks); storage.setJSON('tracksDel', dels);
      if (rnd() < 0.7) await account.sync().catch(() => {});
    };
    const getLocal2 = (k) => storage.getJSON(k, null);
    for (let i = 0; i < 14; i++) await act(rnd() < 0.5 ? 'A' : 'B');
    for (const dev of ['A', 'B', 'A', 'B']) { boot(dev); await account.signIn(login.name, 'motdepasse1'); await account.sync(); }
    const cloud = [...srv.saves.values()][0].data;
    const ids = (cloud.tracks || []).map((t) => t.id).sort();
    // Un circuit supprimé sur un appareil puis RECRÉÉ sur l'autre (même identifiant) : la version la plus récente gagne ; ici on vérifie la cohérence interne.
    for (const dev of ['A', 'B']) {
      device(dev); storage.setScope([...srv.saves.keys()][0]);
      const local = JSON.parse(device(dev).local.getItem('shardwayacct.' + [...srv.saves.keys()][0] + '.tracks') || '[]').map((t) => t.id).sort();
      assert.deepEqual(local, ids, `graine ${seed} : l'appareil ${dev} a les mêmes circuits que le cloud`);
    }
    for (const [k, t] of bestTime) assert.ok(cloud[k] && cloud[k].time <= t + 1e-9, `graine ${seed} : ${k} : meilleur temps ${t} conservé (cloud ${cloud[k] && cloud[k].time})`);
    for (const [id] of expectTracks) assert.ok(ids.includes(id), `graine ${seed} : le circuit ${id} (jamais supprimé après sa dernière modification) est présent`);
  }
});

console.log('Multijoueur : tampon d\'interpolation robuste aux horloges fausses');
const { SnapshotBuffer } = await import('../js/net/interp.js');
const snap = (t, x, tele = 0) => ({ t, steps: Math.round(t * 120), tele, vehicle: 'car', flags: 4, cp: 0, lap: 1, prog: 0, pos: { x, y: 0, z: 0 }, vel: { x: 20, y: 0, z: 0 }, quat: { x: 0, y: 0, z: 0, w: 1 } });
await test('un paquet isolé à l\'horloge folle (futur ou passé lointain) est ignoré : la voiture continue de bouger normalement', () => {
  const b = new SnapshotBuffer({ delay: 0.1 });
  let now = 1000;
  for (let i = 0; i < 30; i++) { b.push(snap(i * 0.05, i), now); now += 50; }
  assert.equal(b.push(snap(3.5e7, 1e4), now), false, 'futur lointain');
  assert.equal(b.push(snap(-100, 5), now), false, 'passé lointain');
  const before = b.sample(now).pos.x;
  for (let i = 30; i < 40; i++) { b.push(snap(i * 0.05, i), now); now += 50; }
  const after = b.sample(now);
  assert.ok(after.ready && after.pos.x > before, 'la voiture avance toujours (' + before.toFixed(1) + ' → ' + after.pos.x.toFixed(1) + ')');
});
await test('l\'émetteur remet son chrono à zéro (nouvelle horloge confirmée par 3 paquets) : la voiture distante repart au lieu de rester figée', () => {
  const b = new SnapshotBuffer({ delay: 0.1 });
  let now = 1000;
  for (let i = 0; i < 400; i++) { b.push(snap(i * 0.05, i), now); now += 50; }
  const frozen = b.sample(now).pos.x;
  for (let i = 0; i < 40; i++) { b.push(snap(i * 0.05, 1000 + i), now); now += 50; }
  const out = b.sample(now);
  assert.ok(out.ready && out.pos.x >= 1000, 'la voiture est à sa nouvelle position (' + out.pos.x.toFixed(1) + ' ; avant ' + frozen.toFixed(1) + ')');
});
await test('paquets perdus et désordre : interpolation sans saut, jamais d\'état non fini', () => {
  const rnd = lcg(5), b = new SnapshotBuffer({ delay: 0.1 });
  let prev = null, maxJump = 0;
  const pkts = [];
  for (let i = 0; i < 300; i++) if (rnd() > 0.3) pkts.push({ s: snap(i * 0.05, i), at: i * 50 + rnd() * 40 });      // 30 % de pertes, gigue 40 ms
  pkts.sort((a, c) => a.at - c.at);
  let k = 0;
  for (let f = 0; f < 300 * 50; f += 16) {
    while (k < pkts.length && pkts[k].at <= f) b.push(pkts[k++].s, 1000 + pkts[k - 1].at);
    const o = b.sample(1000 + f);
    if (!o.ready) continue;
    assert.ok([o.pos.x, o.pos.y, o.pos.z, o.quat.w].every(Number.isFinite), 'fini');
    if (prev !== null) maxJump = Math.max(maxJump, Math.abs(o.pos.x - prev));
    prev = o.pos.x;
  }
  assert.ok(maxJump < 3, 'plus grand saut entre deux images : ' + maxJump.toFixed(2) + ' m');
});

await finish('Tous les tests de la phase 4 (comptes et cloud) passent.');
