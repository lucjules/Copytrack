// Fonction serveur « submit-score » : le gestionnaire (supabase/functions/submit-score/handler.js) avec un Supabase simulé et la VRAIE vérification de
// course (rejeu des commandes) : node tools/test-submit-handler.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { createHandler, MAX_BODY_CHARS, MAX_GHOST_CHARS, RATE_LIMIT } from '../supabase/functions/submit-score/handler.js';
import { MAX_TRACK_CODE_CHARS } from '../js/constants.js';
import { Simulation } from '../js/simulation.js';
import { InputRecorder, quantSteer } from '../js/replay.js';
import { Autopilot } from '../js/autopilot.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { hashString } from '../js/track.js';
import { PHYS_VER } from '../js/version.js';

const UID = '11111111-2222-3333-4444-555555555555';

// Une vraie course : le pilote automatique, ses commandes enregistrées comme le fait le jeu, le temps obtenu.
function recordedRun(def) {
  const track = buildBuiltin(def), sim = new Simulation(track), rec = new InputRecorder();
  sim.start();
  const bot = new Autopilot(track.path, { latLimit: 56 * 0.8 });
  bot.reset(sim.phys);
  for (let i = 0; i < 120 * 150; i++) {
    const inp = bot.control(sim.phys);
    inp.steer = quantSteer(inp.steer);
    rec.push(inp, false);
    const ev = sim.step(inp);
    if (sim.lost) sim.rewind();
    if (ev && ev.type === 'finish') return { trackKey: `b-${def.id}-${hashString(track.encode())}`, inputs: rec.encode(), time: sim.logic.time };
  }
  throw new Error('le pilote automatique ne termine pas ' + def.id);
}
const RUN = recordedRun(BUILTIN_TRACKS[0]);

// Supabase simulé : jeton valide ou non, profil présent ou non, meilleur temps déjà enregistré, journal des écritures.
function fakeSupabase({ authOk = true, profile = true, previous = [], board = { before: 0, total: 1 }, failWrite = false, boom = false, noGhostColumns = false, noSplitsColumn = false } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body });
    if (boom) throw new Error('secret interne : mot de passe de la base');
    const u = String(url);
    if (u.includes('/auth/v1/user')) return authOk ? new Response(JSON.stringify({ id: UID }), { status: 200 }) : new Response('{}', { status: 401 });
    if (u.includes('/rest/v1/players')) return new Response(JSON.stringify(profile ? [{ id: UID }] : []), { status: 200 });
    if (u.includes('/rest/v1/scores') && init.method === 'POST') return new Response(null, { status: failWrite ? 500 : (noGhostColumns && String(init.body).includes('"ghost"')) || (noSplitsColumn && String(init.body).includes('"splits"')) ? 400 : 201 });
    if (u.includes('/rest/v1/scores') && init.method === 'PATCH') return new Response(null, { status: 204 });
    if (u.includes('/rest/v1/scores') && u.includes('has_ghost') && noGhostColumns) return new Response('{"message":"column does not exist"}', { status: 400 });
    if (u.includes('/rest/v1/scores') && u.includes('select=time,phys_ver')) return new Response(JSON.stringify(previous), { status: 200 });
    if (u.includes('/rest/v1/scores')) return new Response('[]', { status: 200, headers: { 'content-range': `0-0/${u.includes('time=lt.') ? board.before : board.total}` } });
    return new Response('{}', { status: 404 });
  };
  return { fetch, calls };
}
const request = (body, { method = 'POST', headers = {} } = {}) =>
  new Request('https://fn.example/submit-score', { method, headers: { Authorization: 'Bearer jeton', 'Content-Type': 'application/json', ...headers }, body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
const make = (sb, extra = {}) => createHandler({ supabaseUrl: 'https://x.supabase.co', serviceKey: 'cle', fetch: sb.fetch, log: () => {}, ...extra });
const good = { ...RUN, physVer: PHYS_VER };

console.log('Course valide');
test('une course rejouée et confirmée est enregistrée, avec son rang', async () => {
  const sb = fakeSupabase({ board: { before: 2, total: 9 } }), h = make(sb);
  const r = await h(request(good)), j = await r.json();
  assert.equal(r.status, 200);
  assert.deepEqual({ ok: j.ok, improved: j.improved, rank: j.rank, total: j.total }, { ok: true, improved: true, rank: 3, total: 9 });
  assert.ok(Math.abs(j.best - RUN.time) < 1e-9);
  const write = sb.calls.find((c) => c.method === 'POST');
  const sent = JSON.parse(write.body);
  assert.equal(sent.player, UID); assert.equal(sent.track_key, RUN.trackKey); assert.equal(sent.phys_ver, PHYS_VER); assert.equal(sent.inputs, RUN.inputs);
  assert.ok(r.headers.get('Cache-Control') === 'no-store' && r.headers.get('Access-Control-Allow-Origin') === '*');
});
test('un temps moins bon que le meilleur déjà enregistré n\'écrase rien', async () => {
  const sb = fakeSupabase({ previous: [{ time: RUN.time - 1, phys_ver: PHYS_VER }] }), h = make(sb);
  const j = await (await h(request(good))).json();
  assert.equal(j.improved, false);
  assert.ok(Math.abs(j.best - (RUN.time - 1)) < 1e-9);
  assert.equal(sb.calls.filter((c) => c.method === 'POST').length, 0, 'aucune écriture');
});
test('un meilleur temps d\'une ancienne version de la physique est remplacé', async () => {
  const sb = fakeSupabase({ previous: [{ time: RUN.time - 5, phys_ver: PHYS_VER - 1 }] }), h = make(sb);
  assert.equal((await (await h(request(good))).json()).improved, true);
});

console.log('Fantôme du record (étape 7)');
test('un record est rangé avec son fantôme : positions et véhicules, jamais en lieu et place des commandes', async () => {
  const sb = fakeSupabase(), r = await make(sb)(request(good));
  assert.equal(r.status, 200);
  const sent = JSON.parse(sb.calls.find((c) => c.method === 'POST').body);
  assert.ok(typeof sent.ghost === 'string' && sent.ghost.length > 1000 && sent.ghost.length <= MAX_GHOST_CHARS);
  assert.ok(Array.isArray(sent.ghost_veh)); assert.equal(sent.inputs, RUN.inputs);
  assert.ok(!JSON.stringify(await r.json()).includes(sent.ghost.slice(0, 40)), 'la réponse au joueur ne contient pas le fantôme');
});
test('étape 7 pas encore lancée (colonnes absentes) : le temps est enregistré quand même, sans fantôme', async () => {
  const sb = fakeSupabase({ noGhostColumns: true }), r = await make(sb)(request(good)), j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.improved, true);
  const writes = sb.calls.filter((c) => c.method === 'POST');
  assert.equal(writes.length, 3, 'refusée avec fantôme et temps intermédiaires, refusée avec fantôme, acceptée sans');
  assert.ok(!('ghost' in JSON.parse(writes[2].body)));
});
test('temps intermédiaires (étape 9) : rangés avec le record ; sans la colonne, le record est rangé avec son fantôme', async () => {
  const sb = fakeSupabase(), r = await make(sb)(request(good));
  assert.equal(r.status, 200);
  const sent = JSON.parse(sb.calls.find((c) => c.method === 'POST').body);
  assert.ok(Array.isArray(sent.splits) && sent.splits.length >= 1 && sent.splits.every((x, i) => Number.isInteger(x) && (i === 0 || x > sent.splits[i - 1])), 'en pas, croissants');
  const old = fakeSupabase({ noSplitsColumn: true }), r2 = await make(old)(request(good));
  assert.equal(r2.status, 200);
  const writes = old.calls.filter((c) => c.method === 'POST');
  assert.equal(writes.length, 2);
  const last = JSON.parse(writes[1].body);
  assert.ok(!('splits' in last) && typeof last.ghost === 'string');
});
test('un record d\'avant l\'étape 7 reçoit son fantôme quand le même temps est renvoyé ; un record qui en a déjà un n\'est pas touché', async () => {
  const old = fakeSupabase({ previous: [{ time: RUN.time, phys_ver: PHYS_VER, has_ghost: false }] }), j = await (await make(old)(request(good))).json();
  assert.equal(j.improved, false);
  const patch = old.calls.find((c) => c.method === 'PATCH');
  assert.ok(patch && patch.url.includes('/rest/v1/scores?track_key='), 'mise à jour de la ligne existante');
  assert.ok(JSON.parse(patch.body).ghost.length > 1000); assert.ok(!('inputs' in JSON.parse(patch.body)) && !('time' in JSON.parse(patch.body)));
  for (const prev of [[{ time: RUN.time, phys_ver: PHYS_VER, has_ghost: true }], [{ time: RUN.time, phys_ver: PHYS_VER }], [{ time: RUN.time - 1, phys_ver: PHYS_VER, has_ghost: false }]]) {
    const sb = fakeSupabase({ previous: prev });
    await make(sb)(request(good));
    assert.equal(sb.calls.filter((c) => c.method === 'POST').length, 0, JSON.stringify(prev));
    // Le même temps renvoyé peut recevoir ses temps intermédiaires (étape 9), seulement s'il n'en a pas ; rien d'autre n'est touché.
    for (const c of sb.calls.filter((x) => x.method === 'PATCH')) {
      assert.ok(c.url.includes('splits=is.null') && Math.abs(prev[0].time - RUN.time) < 1e-9, JSON.stringify(prev));
      assert.deepEqual(Object.keys(JSON.parse(c.body)), ['splits']);
    }
  }
});

console.log('Requêtes refusées');
test('méthode : OPTIONS répond aux navigateurs, GET est refusé', async () => {
  const h = make(fakeSupabase());
  assert.equal((await h(new Request('https://fn.example/', { method: 'OPTIONS' }))).status, 200);
  assert.equal((await h(request(null, { method: 'GET' }))).status, 405);
});
test('pas de jeton valide : 401, et rien n\'est rejoué ni écrit', async () => {
  const sb = fakeSupabase({ authOk: false }), r = await make(sb)(request(good));
  assert.equal(r.status, 401);
  assert.equal(sb.calls.length, 1);
});
test('temps falsifié : la course rejouée ne le confirme pas (422)', async () => {
  const sb = fakeSupabase(), r = await make(sb)(request({ ...good, time: good.time - 3 }));
  assert.equal(r.status, 422);
  assert.equal(sb.calls.filter((c) => c.method === 'POST').length, 0);
});
test('commandes tronquées ou inventées : 422', async () => {
  const h = make(fakeSupabase());
  assert.equal((await h(request({ ...good, inputs: 'AAAA' }))).status, 422);
  assert.equal((await h(request({ ...good, inputs: '!!!pas du base64!!!' }))).status, 422);
});
test('autre version de la physique : 422 et versionMismatch', async () => {
  const r = await make(fakeSupabase())(request({ ...good, physVer: PHYS_VER - 1 })), j = await r.json();
  assert.equal(r.status, 422); assert.equal(j.versionMismatch, true);
});
test('clé de circuit inconnue ou d\'une autre version du circuit : 422', async () => {
  const h = make(fakeSupabase());
  assert.equal((await h(request({ ...good, trackKey: 'b-inconnu-abc' }))).status, 422);
  assert.equal((await h(request({ ...good, trackKey: good.trackKey.replace(/-[^-]+$/, '-zzzzzz') }))).status, 422);
});
test('forme de la requête : JSON illisible, champs manquants ou de mauvais type, clé trop longue : 400', async () => {
  const h = make(fakeSupabase());
  assert.equal((await h(request('{pas du json'))).status, 400);
  assert.equal((await h(request({ ...good, time: '20' }))).status, 400);
  assert.equal((await h(request({ ...good, physVer: 26.5 }))).status, 400);
  assert.equal((await h(request({ ...good, inputs: 42 }))).status, 400);
  assert.equal((await h(request({ ...good, trackKey: 'b-' + 'x'.repeat(100) }))).status, 400);
  assert.equal((await h(request({ ...good, code: 'x'.repeat(MAX_TRACK_CODE_CHARS + 1) }))).status, 400);
});
test('requête trop volumineuse : 413, annoncée ou non, sans rien rejouer', async () => {
  const sb = fakeSupabase(), h = make(sb);
  assert.equal((await h(request(good, { headers: { 'content-length': String(MAX_BODY_CHARS + 1) } }))).status, 413);
  assert.equal((await h(request('{"inputs":"' + 'A'.repeat(MAX_BODY_CHARS) + '"}'))).status, 413);
  assert.equal(sb.calls.filter((c) => c.method === 'POST').length, 0);
});
test('pilote sans profil : 400', async () => {
  assert.equal((await make(fakeSupabase({ profile: false }))(request(good))).status, 400);
});

console.log('Cadence et erreurs internes');
test('rafale : au-delà de la limite par pilote, 429 avec Retry-After', async () => {
  let t = 1_000_000;
  const h = make(fakeSupabase(), { now: () => t });
  for (let i = 0; i < RATE_LIMIT.max; i++) assert.equal((await h(request({ ...good, time: 1 }))).status, 422, 'soumission ' + (i + 1));
  const r = await h(request(good));
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('Retry-After')) >= 1);
  t += RATE_LIMIT.windowMs + 1;
  assert.equal((await h(request(good))).status, 200, 'la fenêtre est écoulée');
});
test('erreur interne : réponse générique, rien de secret ne sort, l\'erreur est journalisée', async () => {
  const logged = [];
  const h = make(fakeSupabase({ boom: true }), { log: (...a) => logged.push(a) });
  const r = await h(request(good)), j = await r.json();
  assert.equal(r.status, 500);
  assert.equal(j.error, 'Erreur interne.');
  assert.ok(!JSON.stringify(j).includes('mot de passe'));
  assert.equal(logged.length, 1);
});
test('échec d\'écriture en base : 500 sans détail', async () => {
  const r = await make(fakeSupabase({ failWrite: true }))(request(good));
  assert.equal(r.status, 500);
});
test('configuration absente : 500 explicite', async () => {
  const h = createHandler({ supabaseUrl: '', serviceKey: '', log: () => {} });
  assert.equal((await h(request(good))).status, 500);
});
test('ALLOWED_ORIGIN restreint l\'origine déclarée dans les réponses', async () => {
  const h = make(fakeSupabase(), { allowedOrigin: 'https://jeu.example' });
  assert.equal((await h(request(good))).headers.get('Access-Control-Allow-Origin'), 'https://jeu.example');
});

await finish('Tous les tests de la fonction serveur passent.');
