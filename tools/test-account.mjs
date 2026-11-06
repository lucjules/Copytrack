// Tests des comptes, de la sauvegarde cloud et de la fusion : node tools/test-account.mjs   (npm test)
// Le serveur Supabase est simulé en mémoire (Auth + REST) : on vérifie le CLIENT. Le SQL a son propre test
// (tools/test-accounts-sql.sh, sur un vrai PostgreSQL).
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';

// ---- Faux navigateur : un « appareil » = un localStorage + un sessionStorage ------------------------------------
class Store {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
Object.defineProperty(Store.prototype, Symbol.iterator, { value: undefined });
const devices = {};
function device(name) {
  const d = devices[name] || (devices[name] = { local: new Store(), session: new Store() });
  globalThis.localStorage = new Proxy(d.local, { ownKeys: () => [...d.local.m.keys()], getOwnPropertyDescriptor: (t, k) => (d.local.m.has(k) ? { enumerable: true, configurable: true, value: d.local.m.get(k) } : undefined) });
  globalThis.sessionStorage = d.session;
  return d;
}
device('A');

// ---- Faux Supabase ----------------------------------------------------------------------------------------------
const srv = { users: new Map(), tokens: new Map(), refresh: new Map(), saves: new Map(), accounts: new Map(), players: new Map(), calls: [], refreshFails: false, offline: false, beforeNextPatch: null, n: 0 };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function session(user) {
  const at = 'at' + ++srv.n, rt = 'rt' + ++srv.n;
  srv.tokens.set(at, user); srv.refresh.set(rt, user);
  return { access_token: at, refresh_token: rt, expires_in: 3600, user: { id: user.id } };
}
globalThis.fetch = async (url, init = {}) => {
  if (srv.offline) throw new TypeError('network down');
  const u = new URL(url), path = u.pathname, q = u.searchParams, method = init.method || 'GET';
  const body = init.body ? JSON.parse(init.body) : null;
  const auth = (init.headers || {}).Authorization;
  const user = auth ? srv.tokens.get(auth.replace('Bearer ', '')) : null;
  srv.calls.push({ method, path, body });
  if (path === '/auth/v1/signup') {
    if (body.email) {
      if (srv.users.has(body.email)) return json(422, { error_code: 'user_already_exists', msg: 'User already registered' });
      const user = { id: 'u-' + ++srv.n, email: body.email, pw: body.password, username: body.data && body.data.username };
      srv.users.set(body.email, user); srv.accounts.set(user.id, user.username);
      return json(200, session(user));
    }
    const anon = { id: 'anon-' + ++srv.n, anon: true };
    return json(200, session(anon));
  }
  if (path === '/auth/v1/token') {
    if (q.get('grant_type') === 'password') {
      const user = srv.users.get(body.email);
      if (!user || user.pw !== body.password) return json(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      return json(200, session(user));
    }
    if (srv.refreshFails || !srv.refresh.has(body.refresh_token)) return json(400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
    return json(200, session(srv.refresh.get(body.refresh_token)));
  }
  if (path === '/rest/v1/rpc/username_available') return json(200, ![...srv.accounts.values()].some((n) => n.toLowerCase() === body.n.toLowerCase()));
  if (path === '/rest/v1/rpc/delete_account') { srv.users.delete(user.email); srv.saves.delete(user.id); srv.accounts.delete(user.id); return json(200, null); }
  if (!user) return json(401, { message: 'JWT expired' });
  if (path === '/rest/v1/accounts') return json(200, srv.accounts.has(user.id) ? [{ username: srv.accounts.get(user.id) }] : []);
  if (path === '/rest/v1/players') { srv.players.set(body.id, body.name); return new Response('', { status: 201 }); }
  if (path === '/rest/v1/cloud_saves') {
    if (method === 'GET') { const r = srv.saves.get(user.id); return json(200, r ? [{ data: r.data, rev: r.rev }] : []); }
    if (method === 'POST') {
      if (body.user_id !== user.id) return json(403, { message: 'new row violates row-level security policy' });
      if (srv.saves.has(user.id)) return json(409, { code: '23505', message: 'duplicate key' });
      srv.saves.set(user.id, { data: body.data, rev: 1 }); return new Response('', { status: 201 });
    }
    if (method === 'PATCH') {
      if (srv.beforeNextPatch) { const f = srv.beforeNextPatch; srv.beforeNextPatch = null; f(user); }
      const r = srv.saves.get(user.id), want = Number(q.get('rev').replace('eq.', ''));
      if (!r || r.rev !== want) return json(200, []);
      r.data = body.data; r.rev++; return json(200, [{ rev: r.rev }]);
    }
  }
  return json(404, { message: 'inconnu ' + path });
};

const storage = await import('../js/storage.js');
const { online } = await import('../js/online.js');
const { account, checkPseudo, checkPassword, accountEmail } = await import('../js/account.js');
const { mergeSaves, mergeProfile, isSyncKey, toCloud } = await import('../js/cloudsave.js');
const { profile, saveProfile, reloadProfile } = await import('../js/profile.js');

// Remet les singletons (client en ligne, compte, portée) comme au chargement d'une page sur cet appareil.
function boot(name) {
  device(name);
  account.state = null; account.status = 'idle'; clearTimeout(account._timer); account._running = null; account._dirty = false;
  online.useGuest(); online.onAccountSession = null;
  storage.setScope('');
  reloadProfile();
}
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const rec = (time, pv = 18) => ({ time, pv, splits: [], inputs: 'x', date: 1, name: 'x', ghost: null });

console.log('Pseudos et mots de passe');
await test('« Player » et « Pilote » sont refusés (toute casse, tous modes)', () => {
  for (const n of ['Player', 'pilote', ' PILOTE ', 'pLaYeR']) for (const acc of [false, true]) assert.equal(checkPseudo(n, { account: acc }).ok, false, n);
  assert.equal(checkPseudo('').ok, false); assert.equal(checkPseudo('   ').ok, false);
});
await test('pseudo invité : 2 à 20 caractères lisibles ; pseudo de compte : 3 à 20, lettres chiffres _', () => {
  assert.ok(checkPseudo('Zoé 2').ok); assert.ok(!checkPseudo('a').ok); assert.ok(!checkPseudo('x'.repeat(21)).ok); assert.ok(!checkPseudo('<b>').ok);
  assert.ok(checkPseudo('Alice_01', { account: true }).ok); assert.ok(!checkPseudo('Zoé', { account: true }).ok); assert.ok(!checkPseudo('ab', { account: true }).ok); assert.ok(!checkPseudo('a b c', { account: true }).ok);
});
await test('mot de passe : 8 caractères au moins, 72 octets au plus, pas le pseudo', () => {
  assert.ok(!checkPassword('1234567').ok); assert.ok(checkPassword('12345678').ok);
  assert.ok(!checkPassword('é'.repeat(37)).ok, '74 octets'); assert.ok(checkPassword('é'.repeat(36)).ok);
  assert.ok(!checkPassword('alicealice', 'AliceAlice').ok);
  assert.equal(accountEmail('Alice_01'), 'alice_01@accounts.copytrack.invalid');
});

console.log('Invité');
await test('l’invité entre un pseudo : progression locale, sans compte ni réseau', async () => {
  boot('A'); srv.calls.length = 0;
  assert.equal(account.resumeGuest(), null, 'rien au premier lancement : l’écran d’accueil bloque');
  assert.throws(() => account.startGuest('Pilote'), /réservés/);
  const g = account.startGuest('Zoé');
  assert.deepEqual(g, { kind: 'guest', username: 'Zoé' });
  assert.equal(storage.loadSettings().playerName, 'Zoé');
  assert.ok(device('A').local.m.has('shardway.settings'), 'clé historique conservée : les anciennes sauvegardes restent valables');
  assert.equal(account.resumeGuest().username, 'Zoé');
  assert.equal(srv.calls.length, 0, 'aucun appel réseau');
});
await test('nouvelle session du navigateur : le pseudo est redemandé (et proposé)', () => {
  device('A').session.m.clear();
  assert.equal(account.resumeGuest(), null);
  assert.equal(account.lastGuestName(), 'Zoé');
});
await test('plus aucun pseudo par défaut', () => {
  assert.equal(storage.DEFAULT_SETTINGS.playerName, '');
  boot('Z'); assert.equal(storage.loadSettings().playerName, ''); assert.equal(account.resumeGuest(), null);
  assert.throws(() => account.startGuest(''), /Choisis un pseudo/);
});
await test('un invité sans pseudo ne peut pas utiliser les fonctions en ligne', async () => {
  boot('Z');
  await assert.rejects(() => online.ensurePlayer(''), /pseudo/);
  await assert.rejects(() => online.ensurePlayer('Pilote'), (e) => true === !!e, 'ne passe pas inaperçu côté serveur');
});

console.log('Compte : création, connexion, appareils');
await test('création de compte : pseudo pris, puis succès, session et portée du compte', async () => {
  boot('A'); account.startGuest('Zoé');
  storage.setJSON('tracks', [{ id: 't1', name: 'Mon circuit', code: 'c', updated: 10 }]);
  storage.setJSON('rec3.b-1', rec(30));
  const p = profile(); p.coins = 100; p.stats.earned = 100; saveProfile();
  await assert.rejects(() => account.signUp('Player', 'motdepasse1'), /réservés/);
  await assert.rejects(() => account.signUp('Alice', 'court'), /8 caractères/);
  const r = await account.signUp('Alice', 'motdepasse1', { keepGuest: true });
  assert.deepEqual(r, { kind: 'account', username: 'Alice' });
  const uid = account.uid;
  assert.equal(storage.getScope(), uid, 'les données lues et écrites sont celles du compte');
  assert.equal(storage.listMyTracks().length, 1, 'progression invitée reprise');
  assert.equal(storage.getRecord('b-1').time, 30);
  assert.ok(device('A').local.m.has(`shardwayacct.${uid}.tracks`));
  assert.equal(srv.saves.get(uid).data['rec3.b-1'].time, 30, 'sauvegarde cloud créée');
  assert.equal(srv.saves.get(uid).data.profile.coins, 100);
  assert.equal(srv.players.get(uid), 'Alice', 'profil en ligne = pseudo du compte');
  await assert.rejects(() => account.signUp('alice', 'motdepasse1'), /déjà pris/, 'casse ignorée');
});
await test('le mot de passe n’est jamais écrit sur l’appareil ni envoyé ailleurs qu’à Auth', async () => {
  for (const [k, v] of device('A').local.m) assert.ok(!v.includes('motdepasse1'), 'stocké dans ' + k);
  for (const c of srv.calls) if (!c.path.startsWith('/auth/')) assert.ok(!JSON.stringify(c.body || '').includes('motdepasse1'), 'envoyé à ' + c.path);
});
await test('la progression de l’invité n’est PAS reprise si on ne le demande pas', async () => {
  boot('B'); account.startGuest('Invité2');
  storage.setJSON('rec3.b-9', rec(99));
  await account.signUp('Bruno', 'motdepasse2', { keepGuest: false });
  assert.equal(storage.getRecord('b-9'), null);
  assert.ok(device('B').local.m.has('shardway.rec3.b-9'), 'elle reste dans la portée invité');
});
await test('autre ordinateur : connexion = on retrouve sa partie', async () => {
  boot('C');
  await assert.rejects(() => account.signIn('Alice', 'mauvais-mdp'), /incorrect/);
  assert.equal(account.isAccount, false);
  await assert.rejects(() => account.signIn('Inconnu', 'motdepasse1'), /incorrect/);
  const r = await account.signIn('alice', 'motdepasse1');      // casse libre à la saisie…
  assert.equal(r.username, 'Alice');                           // …casse exacte du compte ensuite
  assert.equal(storage.listMyTracks()[0].id, 't1');
  assert.equal(storage.getRecord('b-1').time, 30);
  assert.equal(profile().coins, 100);
  assert.equal(storage.loadSettings().playerName, 'Alice');
  assert.equal(srv.players.get(account.uid), 'Alice');
});
await test('relance du jeu sur cet appareil : le compte est repris sans rien redemander', async () => {
  const uid = account.uid;
  boot('C');                                   // « rechargement de page » : singletons remis à zéro, stockage conservé
  const r = await account.restore();
  assert.deepEqual(r, { kind: 'account', username: 'Alice' });
  assert.equal(storage.getScope(), uid);
  assert.equal(storage.getRecord('b-1').time, 30);
});
await test('les données d’un compte et d’un invité ne se mélangent pas', async () => {
  boot('C');
  assert.equal(Object.keys(storage.dumpAll()).filter((k) => k.startsWith('rec3.')).length, 0, 'portée invité vide');
  assert.equal(account.hasGuestProgress(), false);
});

console.log('Synchronisation');
await test('records, circuits, suppression et pièces fusionnent entre deux appareils', async () => {
  boot('A'); await account.restore();
  boot('C'); await account.restore();
  // Appareil C hors ligne : meilleur record, nouveau circuit, suppression de t1, dépense.
  boot('C'); await account.restore();
  storage.saveRecord('b-1', rec(28)); storage.saveRecord('b-2', rec(50));
  storage.saveMyTrack({ id: 't2', name: 'Autre', code: 'c2' });
  storage.deleteMyTrack('t1');
  await account.sync();
  // Appareil A (resté sur l'ancienne version) : record moins bon, gagne des pièces.
  boot('A'); await account.restore();
  storage.saveRecord('b-1', rec(31)); storage.saveRecord('b-3', rec(40));
  const p = profile(); p.coins += 20; p.stats.earned += 20; saveProfile();
  await account.sync();
  assert.equal(storage.getRecord('b-1').time, 28, 'meilleur temps des deux appareils');
  assert.equal(storage.getRecord('b-2').time, 50); assert.equal(storage.getRecord('b-3').time, 40);
  assert.deepEqual(storage.listMyTracks().map((t) => t.id), ['t2'], 'circuit supprimé ailleurs : supprimé aussi ici, nouveau circuit reçu');
  const cloud = srv.saves.get(account.uid).data;
  assert.equal(cloud['rec3.b-1'].time, 28); assert.equal(cloud.profile.coins, 120);
});
await test('écriture simultanée de deux appareils : version contrôlée, on relit et on fusionne', async () => {
  boot('A'); await account.restore();
  storage.saveRecord('b-4', rec(10));
  srv.beforeNextPatch = (user) => {                     // un autre appareil écrit entre notre lecture et notre écriture
    const r = srv.saves.get(user.id); r.data['rec3.b-5'] = rec(5); r.rev++;
  };
  await account.sync();
  assert.equal(storage.getRecord('b-5').time, 5, 'l’écriture de l’autre appareil n’est pas perdue');
  assert.equal(srv.saves.get(account.uid).data['rec3.b-4'].time, 10, 'la nôtre non plus');
});
await test('une écriture locale déclenche une synchronisation automatique (différée)', async () => {
  boot('A'); await account.restore(); srv.calls.length = 0;
  storage.saveRecord('b-6', rec(6)); storage.saveRecord('b-7', rec(7));
  assert.ok(account._timer, 'planifiée');
  account.scheduleSync(10); await wait(120);
  assert.equal(srv.calls.filter((c) => c.method === 'PATCH').length, 1, 'une seule écriture pour deux sauvegardes');
  assert.equal(srv.saves.get(account.uid).data['rec3.b-7'].time, 7);
  assert.equal(account.status, 'ok');
});
await test('les réglages de l’appareil et le brouillon de l’éditeur ne partent pas dans le cloud', () => {
  assert.ok(!isSyncKey('settings') && !isSyncKey('draft') && !isSyncKey('online.session'));
  assert.ok(!Object.keys(srv.saves.get(account.uid).data).some((k) => !isSyncKey(k)));
});
await test('hors ligne : le jeu continue, la synchronisation reprend au retour du réseau', async () => {
  boot('A'); await account.restore();
  srv.offline = true;
  storage.saveRecord('b-8', rec(8));
  await assert.rejects(() => account.sync(), /injoignable|connexion/i);
  assert.equal(account.status, 'offline'); assert.equal(storage.getRecord('b-8').time, 8);
  srv.offline = false; await account.sync();
  assert.equal(srv.saves.get(account.uid).data['rec3.b-8'].time, 8);
});

console.log('Session expirée et déconnexion');
await test('session expirée : on redemande le mot de passe, jamais de repli sur une session anonyme', async () => {
  boot('C'); srv.refreshFails = true; srv.calls.length = 0;
  online.session = null;
  const st = storage.getGlobal('account'); st.session.expires_at = 1; storage.setGlobal('account', st);
  const r = await account.restore();
  assert.deepEqual(r, { kind: 'expired', username: 'Alice' });
  assert.ok(!srv.calls.some((c) => c.path === '/auth/v1/signup'), 'aucune session anonyme créée à la place du compte');
  assert.equal(storage.getGlobal('account'), null); assert.equal(storage.getScope(), '');
  srv.refreshFails = false;
});
await test('hors ligne au lancement avec une session expirée : on garde le compte', async () => {
  boot('A'); const st = storage.getGlobal('account'); st.session.expires_at = 1; storage.setGlobal('account', st);
  srv.offline = true;
  const r = await account.restore();
  srv.offline = false;
  assert.equal(r.kind, 'account'); assert.equal(storage.getScope(), account.uid);
});
await test('déconnexion : dernière synchronisation, retour à l’invité, les données du compte restent protégées', async () => {
  boot('A'); await account.restore();
  storage.saveRecord('b-10', rec(10));
  await account.signOut();
  assert.equal(account.isAccount, false); assert.equal(storage.getScope(), ''); assert.equal(storage.getGlobal('account'), null);
  const uidKey = [...srv.saves.keys()].find((k) => srv.saves.get(k).data['rec3.b-10']);
  assert.ok(uidKey, 'enregistrée dans le cloud avant la déconnexion');
  assert.equal(storage.getRecord('b-10'), null, 'plus visible dans la portée invité');
  assert.equal(account.resumeGuest(), null, 'l’écran d’accueil revient');
});
await test('suppression du compte : cloud et données locales effacés', async () => {
  boot('A'); await account.signIn('Alice', 'motdepasse1');
  const uid = account.uid;
  await account.deleteAccount();
  assert.equal(srv.saves.has(uid), false); assert.equal(srv.users.has('alice@accounts.copytrack.invalid'), false);
  const left = [...device('A').local.m.keys()].filter((k) => k.startsWith('shardwayacct.' + uid)); assert.equal(left.length, 0, 'restent : ' + left.join(', '));
  assert.equal(account.isAccount, false);
  await assert.rejects(() => account.signIn('Alice', 'motdepasse1'), /incorrect/);
});

console.log('Fusion (module pur)');
await test('pièces : jamais d’inflation, l’achat fait ailleurs est déduit', () => {
  // A a acheté un objet à 50 ◆ (coins 70 sur 120 gagnés) ; B n'a rien acheté mais a gagné 10 de plus (coins 130).
  const a = { id: 'X', coins: 70, owned: { 'spoiler:gt': 1 }, medals: {}, stats: { races: 3, earned: 120 } };
  const b = { id: 'X', coins: 130, owned: {}, medals: {}, stats: { races: 4, earned: 130 } };
  const m = mergeProfile(a, b);
  assert.ok(m.owned['spoiler:gt']); assert.ok(m.coins <= 130 && m.coins >= 70, 'coins ' + m.coins);
  assert.equal(m.stats.races, 4); assert.equal(m.stats.earned, 130);
});
await test('médailles : la meilleure gagne (0 = cristal) ; identifiant du joueur = celui du cloud', () => {
  const m = mergeProfile({ id: 'LOCAL', coins: 0, medals: { k: 2, j: 1 } }, { id: 'CLOUD', coins: 0, medals: { k: 0 } });
  assert.deepEqual(m.medals, { k: 0, j: 1 }); assert.equal(m.id, 'CLOUD');
});
await test('records : une physique plus récente remplace l’ancienne, sinon meilleur temps', () => {
  const m = mergeSaves({ 'rec3.x': rec(20, 17) }, { 'rec3.x': rec(40, 18) });
  assert.equal(m['rec3.x'].pv, 18);
  assert.equal(mergeSaves({ 'rec3.x': rec(20) }, { 'rec3.x': rec(40) })['rec3.x'].time, 20);
});
await test('circuit modifié après sa suppression : il revit ; supprimé après : il disparaît', () => {
  const t = (updated) => [{ id: 'a', updated }];
  assert.equal(mergeSaves({ tracks: t(20) }, { tracks: t(5), tracksDel: { a: 10 } }).tracks.length, 1);
  assert.equal(mergeSaves({ tracks: t(5) }, { tracks: t(5), tracksDel: { a: 10 } }).tracks.length, 0);
});

await finish('Tous les tests de comptes passent.');
