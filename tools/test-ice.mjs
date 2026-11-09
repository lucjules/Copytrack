// Serveurs ICE du multijoueur : nettoyage des données reçues, chargeur (cache, repli, délai) et fonction serveur « ice » (identifiants TURN à durée limitée).
// node tools/test-ice.mjs   (npm test)
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test, finish } from './harness.mjs';
import { sanitizeIce, createIceLoader, MAX_ICE_SERVERS } from '../js/net/ice.js';
import { createIceHandler, coturnCredentials, RATE_LIMIT, DEFAULT_TTL_S } from '../supabase/functions/ice/handler.js';

const STUN = [{ urls: ['stun:stun.example.org:19302'] }];
const TURN = { urls: ['turn:turn.example.org:3478?transport=udp', 'turns:turn.example.org:5349'], username: '1700000000:copytrack', credential: 'abc=' };
const reply = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

console.log('Nettoyage');
test('seuls les STUN/TURN bien formés passent ; un relais sans identifiants est écarté ; nombre borné', () => {
  const out = sanitizeIce([
    { urls: 'stun:stun.l.google.com:19302' },
    TURN,
    { urls: 'turn:sans-identifiants.example:3478' },
    { urls: 'javascript:alert(1)' }, { urls: 'http://evil.example' }, { urls: ['file:///etc/passwd'] }, { urls: 42 }, null, 'x',
  ]);
  assert.deepEqual(out.map((s) => s.urls.length), [1, 2], 'seules les premières entrées sont examinées : une liste hostile ne coûte pas de travail');
  const mixed = sanitizeIce([{ urls: ['turn:x.example:3478', 'file:///x', 'stun:y.example'], username: 'u', credential: 'c' }]);
  assert.deepEqual(mixed, [{ urls: ['turn:x.example:3478', 'stun:y.example'], username: 'u', credential: 'c' }], 'les URL douteuses d\'un serveur sont retirées, le reste est gardé');
  assert.deepEqual(out[1], TURN);
  assert.equal(out[0].username, undefined, 'un STUN ne porte pas d\'identifiants');
  assert.equal(sanitizeIce(Array.from({ length: 20 }, () => ({ urls: 'stun:a.example:1' }))).length, MAX_ICE_SERVERS);
  assert.deepEqual(sanitizeIce('x'), []); assert.deepEqual(sanitizeIce(undefined), []);
  assert.deepEqual(sanitizeIce([{ urls: ['stun:' + 'a'.repeat(300)] }]), [], 'URL démesurée');
});

console.log('Chargeur');
await test('demande à la fonction « ice », garde le résultat jusqu\'aux 3/4 de sa durée, y ajoute le STUN de repli sans doublon', async () => {
  let calls = 0, t = 0, seen;
  const load = createIceLoader({ url: 'https://x.test/ice', key: 'cle', fallback: STUN, now: () => t, fetchImpl: async (u, init) => { calls++; seen = { u, init }; return reply(200, { iceServers: [TURN, STUN[0]], ttl: 3600 })(); } });
  const a = await load();
  assert.equal(a[0].username, TURN.username); assert.equal(a.filter((s) => s.urls[0].startsWith('stun:stun.example.org')).length, 1, 'pas de doublon');
  assert.equal(seen.init.headers.apikey, 'cle'); assert.equal(seen.init.method, 'POST');
  await load(); assert.equal(calls, 1, 'en cache');
  t = 3600 * 750 - 1; await load(); assert.equal(calls, 1);
  t = 3600 * 750 + 1; await load(); assert.equal(calls, 2, 'renouvelé avant l\'expiration réelle');
});
await test('fonction absente, en panne, réponse vide ou piégée : repli sans attendre, et pas de nouvelle tentative avant 10 minutes', async () => {
  for (const [name, fetchImpl] of [['404', reply(404, {})], ['500', reply(500, {})], ['vide', reply(200, { iceServers: [] })], ['piégée', reply(200, { iceServers: [{ urls: 'javascript:1' }] })], ['réseau', async () => { throw new Error('hors ligne'); }]]) {
    let calls = 0, t = 0;
    const load = createIceLoader({ url: 'https://x.test/ice', fallback: STUN, now: () => t, fetchImpl: (...a) => { calls++; return fetchImpl(...a); } });
    assert.deepEqual(await load(), STUN, name); assert.deepEqual(await load(), STUN, name); assert.equal(calls, 1, name + ' : pas de martelage');
    t = 10 * 60000 + 1; await load(); assert.equal(calls, 2, name + ' : nouvelle tentative plus tard');
  }
  assert.deepEqual(await createIceLoader({ url: '', fallback: STUN })(), STUN, 'désactivé par configuration');
});
await test('plusieurs salons ouverts en même temps ne font qu\'une demande', async () => {
  let calls = 0;
  const load = createIceLoader({ url: 'https://x.test/ice', fallback: STUN, fetchImpl: async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return reply(200, { iceServers: [TURN], ttl: 600 })(); } });
  await Promise.all([load(), load(), load()]);
  assert.equal(calls, 1);
});

console.log('Fonction serveur « ice »');
const req = (method = 'POST', headers = {}) => new Request('https://fn.example/ice', { method, headers });
await test('coturn : identifiants à durée limitée au format « REST API » (nom = expiration, mot de passe = HMAC-SHA1 du nom)', async () => {
  const c = await coturnCredentials('secret', 1700000000);
  assert.equal(c.username, '1700000000:copytrack');
  assert.equal(c.credential, createHmac('sha1', 'secret').update(c.username).digest('base64'));
  const h = createIceHandler({ env: { TURN_URLS: 'turn:t.example:3478?transport=udp, turns:t.example:5349', TURN_SECRET: 'secret' }, now: () => 1_000_000_000_000 });
  const r = await h(req()), j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.ttl, DEFAULT_TTL_S);
  assert.deepEqual(j.iceServers[1].urls, ['turn:t.example:3478?transport=udp', 'turns:t.example:5349']);
  assert.equal(j.iceServers[1].username, `${1_000_000_000 + DEFAULT_TTL_S}:copytrack`, 'expire dans ttl secondes');
  assert.equal(j.iceServers[1].credential, createHmac('sha1', 'secret').update(j.iceServers[1].username).digest('base64'));
  assert.ok(j.iceServers[0].urls[0].startsWith('stun:'));
  assert.ok(sanitizeIce(j.iceServers).length === 2, 'le jeu accepte cette réponse');
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
});
await test('Cloudflare : relayé avec la durée de vie voulue ; une erreur du fournisseur ne fuit pas', async () => {
  let sent;
  const ok = createIceHandler({ env: { TURN_KEY_ID: 'kid', TURN_KEY_API_TOKEN: 'tok', ICE_TTL_S: '7200' }, fetch: async (u, init) => { sent = { u, init }; return reply(200, { iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }, { urls: ['turn:turn.cloudflare.com:3478?transport=udp'], username: 'u', credential: 'c' }] })(); } });
  const j = await (await ok(req())).json();
  assert.equal(j.ttl, 7200); assert.equal(j.iceServers.length, 2);
  assert.ok(sent.u.includes('/turn/keys/kid/credentials/generate-ice-servers')); assert.equal(sent.init.headers.Authorization, 'Bearer tok'); assert.equal(JSON.parse(sent.init.body).ttl, 7200);
  const old = createIceHandler({ env: { TURN_KEY_ID: 'kid', TURN_KEY_API_TOKEN: 'tok' }, fetch: reply(200, { iceServers: { urls: ['turn:t.example:3478'], username: 'u', credential: 'c' } }) });
  assert.equal((await (await old(req())).json()).iceServers.length, 1, 'ancien format (objet) accepté');
  const logged = [];
  const bad = createIceHandler({ env: { TURN_KEY_ID: 'kid', TURN_KEY_API_TOKEN: 'tok-secret' }, fetch: reply(403, { error: 'tok-secret refusé' }), log: (...a) => logged.push(a) });
  const r = await bad(req()), txt = await r.text();
  assert.equal(r.status, 502); assert.ok(!txt.includes('tok-secret'));
  const boom = createIceHandler({ env: { TURN_KEY_ID: 'kid', TURN_KEY_API_TOKEN: 'tok-secret' }, fetch: async () => { throw new Error('tok-secret'); }, log: () => {} });
  const r2 = await boom(req()); assert.equal(r2.status, 500); assert.ok(!(await r2.text()).includes('tok-secret'));
});
await test('rien de configuré : 501 (le jeu garde son STUN) ; méthodes et cadence', async () => {
  const none = createIceHandler({ env: {} });
  assert.equal((await none(req())).status, 501);
  assert.equal((await none(req('OPTIONS'))).status, 200); assert.equal((await none(req('DELETE'))).status, 405);
  let t = 0;
  const h = createIceHandler({ env: {}, now: () => t });
  for (let i = 0; i < RATE_LIMIT.max; i++) assert.equal((await h(req('POST', { 'x-forwarded-for': '1.2.3.4' }))).status, 501);
  const r = await h(req('POST', { 'x-forwarded-for': '1.2.3.4' }));
  assert.equal(r.status, 429); assert.ok(Number(r.headers.get('Retry-After')) >= 1);
  assert.equal((await h(req('POST', { 'x-forwarded-for': '5.6.7.8' }))).status, 501, 'un autre client n\'est pas gêné');
  t += RATE_LIMIT.windowMs + 1; assert.equal((await h(req('POST', { 'x-forwarded-for': '1.2.3.4' }))).status, 501);
  assert.equal((await createIceHandler({ env: { ALLOWED_ORIGIN: 'https://jeu.example' } })(req())).headers.get('Access-Control-Allow-Origin'), 'https://jeu.example');
});

console.log('Authentification de la fonction « ice »');
await test('avec la configuration Supabase, une session valide est exigée : la clé publique seule ne donne plus de relais TURN ; la cadence est comptée par pilote', async () => {
  const calls = [];
  const fetch = async (url, init = {}) => { calls.push(String(url)); if (String(url).includes('/auth/v1/user')) { const t = (init.headers || {}).Authorization; return t === 'Bearer jeton-valide' ? new Response(JSON.stringify({ id: '11111111-2222-3333-4444-555555555555' }), { status: 200 }) : new Response('{}', { status: 401 }); } return new Response('{}', { status: 500 }); };
  const env = { TURN_URLS: 'turn:t.example:3478', TURN_SECRET: 's3cret' };
  const h = createIceHandler({ env, supabaseUrl: 'https://x.supabase.co', serviceKey: 'cle', fetch });
  const req = (token) => new Request('https://fn/ice', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'x-forwarded-for': '1.2.3.4' }, body: '{}' });
  assert.equal((await h(req('cle-publique'))).status, 401, 'clé publique seule : refusé');
  assert.equal((await h(new Request('https://fn/ice', { method: 'POST', body: '{}' }))).status, 401, 'sans jeton : refusé');
  const ok = await h(req('jeton-valide'));
  assert.equal(ok.status, 200); assert.ok((await ok.json()).iceServers.some((s) => s.username));
  // même pilote, adresses IP différentes : la cadence suit le PILOTE
  let last = 200;
  for (let i = 0; i < RATE_LIMIT.max + 2 && last !== 429; i++) last = (await h(new Request('https://fn/ice', { method: 'POST', headers: { Authorization: 'Bearer jeton-valide', 'x-forwarded-for': '9.9.' + i + '.1' }, body: '{}' }))).status;
  assert.equal(last, 429);
});
await test('le chargeur du jeu envoie le jeton du pilote quand il en a un, la clé publique sinon', async () => {
  const seen = [];
  const fetchImpl = async (u, init) => { seen.push(init.headers.Authorization); return new Response(JSON.stringify({ iceServers: [{ urls: ['stun:s.example:3478'] }], ttl: 3600 }), { status: 200 }); };
  await createIceLoader({ url: 'https://fn/ice', key: 'pub', getToken: async () => 'jeton', fallback: [], fetchImpl })();
  await createIceLoader({ url: 'https://fn/ice', key: 'pub', getToken: async () => { throw new Error('hors ligne'); }, fallback: [], fetchImpl })();
  assert.deepEqual(seen, ['Bearer jeton', 'Bearer pub']);
});

await finish('Tous les tests des serveurs ICE passent.');
