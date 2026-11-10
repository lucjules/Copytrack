// Publication d'un circuit et temps de l'auteur (côté jeu) : node tools/test-publication.mjs   (npm test)
// Le serveur REJOUE la course de vérification de l'auteur (tools/test-submit-handler.mjs, « Publication d'un circuit ») ; ici, le jeu :
// la preuve (la course de vérification) est gardée sur l'appareil, la publication la transmet à la fonction serveur (plus d'insertion directe dans la base),
// et un temps d'auteur non confirmé par le serveur n'est jamais présenté comme sûr.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), key: () => null, length: 0 };
Object.defineProperty(globalThis.localStorage, 'length', { get: () => mem.size });
const { scriptTrack } = await import('../js/track.js');
const { saveProof, loadProof } = await import('../js/authorProof.js');
const { online, OnlineError } = await import('../js/online.js');
const { PHYS_VER } = await import('../js/version.js');
const { DEVICE_ONLY_KEYS, dumpAll } = await import('../js/storage.js');

const mk = (txt = 'start S4 C S4 finish') => scriptTrack('Mon circuit', txt);
const verified = (time = 21.5, txt) => { const t = mk(txt); t.setVerified(time); return t; };

console.log('Preuve de l\'auteur (la course de vérification, gardée sur l\'appareil)');
test('une preuve se range sous la signature du circuit et se relit tant que le circuit et le temps sont les mêmes', () => {
  const t = verified(21.5);
  assert.equal(loadProof(t), null, 'rien avant');
  assert.equal(saveProof(t, { inputs: 'QUJD', time: 21.5 }), true);
  assert.deepEqual(loadProof(t), { inputs: 'QUJD', time: 21.5 });
  assert.deepEqual(loadProof(Object.assign(mk(), { vt: t.vt, vh: t.vh })), { inputs: 'QUJD', time: 21.5 }, 'même contenu, autre instance');
});
test('circuit modifié depuis, temps différent, circuit non vérifié : pas de preuve', () => {
  const t = verified(21.5); saveProof(t, { inputs: 'QUJD', time: 21.5 });
  const edited = mk('start S5 C S4 finish'); edited.setVerified(21.5);
  assert.equal(loadProof(edited), null, 'autre contenu : autre signature');
  const faster = verified(19.0); assert.equal(loadProof(faster), null, 'autre temps, pas de preuve de ce temps');
  const lying = mk(); lying.vt = 21.5; lying.vh = 'faux'; assert.equal(loadProof(lying), null, 'jamais vérifié');
  assert.equal(saveProof(mk(), { inputs: 'QUJD', time: 21.5 }), false, 'un circuit non vérifié ne range rien');
  assert.equal(saveProof(t, { inputs: 42, time: 21.5 }), false); assert.equal(saveProof(t, { inputs: 'QUJD', time: 0 }), false);
});
test('au plus 8 preuves gardées (les plus récentes), et la preuve ne voyage jamais dans un code joueur ou une sauvegarde partagée', async () => {
  mem.clear();
  for (let i = 0; i < 12; i++) { const t = mk('start S' + (3 + (i % 5)) + ' C S' + (3 + ((i * 3) % 4)) + ' finish'); t.laps = 1 + (i % 3); t.decor = i < 6 ? t.decor : 'ice'; t.decos = [{ k: 'tree', x: -50 - i, y: 0, z: -50, ry: 0, s: 1, ph: 0 }]; t.setVerified(20 + i); assert.ok(saveProof(t, { inputs: 'QUJD', time: t.vt }), 'rangée ' + i); await new Promise((r) => setTimeout(r, 2)); }
  const k = [...mem.keys()].find((x) => x.endsWith('vproof'));
  assert.ok(k, 'rangée'); assert.ok(Object.keys(JSON.parse(mem.get(k))).length <= 8);
  assert.ok(DEVICE_ONLY_KEYS.includes('vproof'));
  assert.ok(!('vproof' in dumpAll({ shareable: true })), 'absente de ce qui se partage');
});

console.log('Publication par la fonction serveur');
// Remplace le réseau (fetch) ; chaque appel est noté.
async function withNetwork(reply, fn) {
  const origFetch = globalThis.fetch, orig = { ensureSession: online.ensureSession, ensurePlayer: online.ensurePlayer, session: online.session, hasVerified: online.hasVerified };
  const calls = [];
  online.ensureSession = async () => {}; online.ensurePlayer = async () => {}; online.session = { access_token: 'jeton' };
  globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null }); return reply(String(url), init); };
  try { await fn(calls); } finally { globalThis.fetch = origFetch; Object.assign(online, orig); }
}
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
await test('publier envoie le code et la course de vérification à submit-score (action publish-track), version de physique comprise ; jamais d\'insertion dans /rest/v1/tracks', async () => {
  const t = verified(21.5); t.name = 'Mon beau circuit'; t.desc = 'Une description';
  await withNetwork(() => json({ ok: true, id: 'x', status: 'created', authorTime: 21.5 }), async (calls) => {
    const r = await online.publish(t, 'Zoé', { inputs: 'QUJD', time: 21.5 });
    assert.equal(r.ok, true); assert.equal(calls.length, 1);
    assert.ok(calls[0].url.endsWith('/functions/v1/submit-score') && calls[0].method === 'POST');
    assert.deepEqual(calls[0].body, { action: 'publish-track', code: t.encode(), inputs: 'QUJD', time: 21.5, physVer: PHYS_VER, name: 'Mon beau circuit', description: 'Une description' });
    assert.ok(!('author_time' in calls[0].body) && !('authorTime' in calls[0].body), 'le jeu n\'envoie aucun temps d\'auteur à croire : celui du code est confronté au rejeu par le serveur');
  });
});
await test('sans preuve (course de vérification absente) : refus clair avant tout appel réseau', async () => {
  await withNetwork(() => json({}), async (calls) => {
    await assert.rejects(() => online.publish(verified(21.5), 'Zoé', null), (e) => e instanceof OnlineError && e.code === 'no-proof' && /Refais la vérification/.test(e.message));
    await assert.rejects(() => online.publish(verified(21.5), 'Zoé', { inputs: '', time: 0 }), /Refais la vérification/);
    assert.equal(calls.length, 0);
  });
});
await test('le refus du serveur (temps non confirmé, version de physique) arrive au joueur avec son message', async () => {
  await withNetwork(() => json({ error: 'Le temps ne correspond pas à la course rejouée.' }, 422), async () => {
    await assert.rejects(() => online.publish(verified(21.5), 'Zoé', { inputs: 'QUJD', time: 21.5 }), /ne correspond pas à la course rejouée/);
  });
  await withNetwork(() => json({ error: 'Version du jeu différente (jeu 30, serveur 31) : recharge le jeu pour le mettre à jour.', versionMismatch: true }, 422), async () => {
    await assert.rejects(() => online.publish(verified(21.5), 'Zoé', { inputs: 'QUJD', time: 21.5 }), /recharge le jeu/);
  });
});

console.log('author_verified (étape SQL 15) dans les lectures de circuits');
await test('toute lecture de circuits demande aussi author_verified ; colonne absente (étape pas lancée) : relecture sans elle, une seule fois, et plus de demande ensuite', async () => {
  const reply = (url) => /author_verified/.test(decodeURIComponent(url)) ? json({ message: 'column tracks.author_verified does not exist' }, 400) : json([{ id: 'a', author_time: 30 }]);
  await withNetwork(reply, async (calls) => {
    online.hasVerified = undefined;
    const rows = await online._fetch('/rest/v1/tracks?select=id%2Cname%2Cauthor_time%2Cpieces&limit=5');
    assert.deepEqual(rows, [{ id: 'a', author_time: 30 }]);
    assert.equal(calls.length, 2, 'essai avec la colonne, puis sans'); assert.equal(online.hasVerified, false);
    await online._fetch('/rest/v1/tracks?select=id%2Cauthor_time&limit=5');
    assert.equal(calls.length, 3, 'plus d\'essai avec la colonne'); assert.ok(!/author_verified/.test(calls[2].url));
  });
  await withNetwork(() => json([{ id: 'a', author_time: 30, author_verified: true }]), async (calls) => {
    online.hasVerified = undefined;
    const rows = await online._fetch('/rest/v1/tracks?select=id%2Cauthor_time&limit=5');
    assert.equal(rows[0].author_verified, true); assert.equal(calls.length, 1);
    assert.match(decodeURIComponent(calls[0].url), /select=id,author_time,author_verified/);
    await online._fetch('/rest/v1/scores?select=time'); assert.ok(!/author_verified/.test(calls[1].url), 'les autres tables ne sont pas touchées');
    await online._fetch('/rest/v1/rpc/x', { method: 'POST', body: {} }); assert.ok(!/author_verified/.test(calls[2].url));
  });
});

await finish('Tous les tests de publication passent.');
