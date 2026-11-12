// Fonction serveur « submit-score » : le gestionnaire (supabase/functions/submit-score/handler.js) avec un Supabase simulé et la VRAIE vérification de
// course (rejeu des commandes) : node tools/test-submit-handler.mjs   (npm test)
import assert from 'node:assert/strict';
const { ReadableStream } = globalThis;
import { test, finish } from './harness.mjs';
import { createHandler, MAX_BODY_CHARS, MAX_GHOST_CHARS, RATE_LIMIT } from '../supabase/functions/submit-score/handler.js';
import { MAX_TRACK_CODE_CHARS } from '../js/constants.js';
import { Simulation } from '../js/simulation.js';
import { InputRecorder, quantSteer } from '../js/replay.js';
import { Autopilot } from '../js/autopilot.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { hashString, scriptTrack, Track } from '../js/track.js';
import { PHYS_VER } from '../js/version.js';

const UID = '11111111-2222-3333-4444-555555555555';

// Une vraie course : le pilote automatique, ses commandes enregistrées comme le fait le jeu, le temps obtenu.
function recordedRun(def, latLimit = 56 * 0.8, trackIn = null) {
  const track = trackIn || buildBuiltin(def), sim = new Simulation(track), rec = new InputRecorder();
  sim.start();
  const bot = new Autopilot(track.path, { latLimit });
  bot.reset(sim.phys);
  for (let i = 0; i < 120 * 150; i++) {
    const inp = bot.control(sim.phys);
    inp.steer = quantSteer(inp.steer);
    rec.push(inp, false);
    const ev = sim.step(inp);
    if (sim.lost) sim.rewind();
    if (ev && ev.type === 'finish') return { trackKey: trackIn ? track.userKey : `b-${def.id}-${hashString(track.encode())}`, inputs: rec.encode(), time: sim.logic.time };
  }
  throw new Error('le pilote automatique ne termine pas ' + def.id);
}
const RUN = recordedRun(BUILTIN_TRACKS[0]);

// Supabase simulé AVEC ÉTAT : il reproduit la sémantique des fonctions SQL de supabase/etape15-backend.sql (rate_check, submit_best, publish_track). Chaque
// fonction passe par un verrou par pilote (file de promesses), comme le verrou consultatif de la base : le test d'entrelacement réel est dans
// tools/test-accounts-sql.sh (sessions psql simultanées) ; ici on vérifie que le gestionnaire s'appuie bien sur ces fonctions ATOMIQUES.
function fakeSupabase({ rate = 0, authOk = true, anonymous = false, profile = true, failWrite = null, boom = false, competition = null, db = null, collisionFor = null, publishStatus = null } = {}) {
  const calls = [];
  const state = db || { scores: new Map(), binds: new Map(), tracks: new Map(), rateRows: [], locks: new Map() };
  const lock = (key, fn) => { const prev = state.locks.get(key) || Promise.resolve(); const run = prev.then(fn); state.locks.set(key, run.catch(() => {})); return run; };
  const ok = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
  const fetch = async (url, init = {}) => {
    const u = String(url), body = init.body ? (() => { try { return JSON.parse(init.body); } catch { return init.body; } })() : undefined;
    calls.push({ url: u, method: init.method ?? 'GET', body: init.body, args: body });
    if (boom) throw new Error('secret interne : mot de passe de la base');
    if (u.includes('/auth/v1/user')) return authOk ? ok({ id: UID, is_anonymous: anonymous }) : ok({}, 401);
    if (u.includes('/rest/v1/players')) return ok(profile ? [{ id: UID }] : []);
    if (u.includes('/rest/v1/rpc/rate_check')) {
      if (rate === 'down') return ok({ code: 'PGRST202' }, 404);
      if (typeof rate === 'function') return ok(rate(body));
      return ok(rate);
    }
    if (u.includes('/rest/v1/rpc/competition_open')) return competition === null ? ok({ code: 'PGRST202' }, 404) : ok(competition);
    if (u.includes('/rest/v1/rpc/submit_best')) {
      if (failWrite) return ok({ message: failWrite }, 400);
      const a = body;
      return lock('p:' + a.p, async () => {
        await new Promise((r) => setTimeout(r, 5));        // la base « travaille » : sans verrou, deux requêtes s'entrelaceraient ici
        if (collisionFor && collisionFor === a.tk) return ok({ status: 'collision' });
        if (a.strong) { if (!state.binds.has(a.tk)) state.binds.set(a.tk, a.strong); if (state.binds.get(a.tk) !== a.strong) return ok({ status: 'collision' }); }
        const k = a.tk + '|' + a.p, cur = state.scores.get(k);
        let improved = false;
        if (!cur || a.pv > cur.pv || (a.pv === cur.pv && a.t < cur.t)) { state.scores.set(k, { t: a.t, inp: a.inp, pv: a.pv, gh: a.gh, sp: a.sp }); improved = true; }
        const best = state.scores.get(k).t;
        const all = [...state.scores.entries()].filter(([kk, v]) => kk.startsWith(a.tk + '|') && v.pv === a.pv);
        return ok({ status: 'ok', improved, best, rank: all.filter(([, v]) => v.t < best).length + 1, total: all.length });
      });
    }
    if (u.includes('/rest/v1/rpc/publish_track')) {
      if (failWrite) return ok({ message: failWrite }, 400);
      const a = body;
      return lock('t:' + a.p, async () => {
        if (publishStatus) return ok({ status: publishStatus });
        if (state.binds.has('u-' + a.sg) && state.binds.get('u-' + a.sg) !== a.strong) return ok({ status: 'collision' });
        state.binds.set('u-' + a.sg, a.strong);
        const ex = state.tracks.get(a.sg);
        if (ex && ex.author !== a.p) return ok({ status: 'taken' });
        state.tracks.set(a.sg, { author: a.p, atime: a.atime, verified: true, name: a.nm, ds: a.ds, cd: a.cd });
        return ok({ status: ex ? 'updated' : 'created', id: 'id-' + a.sg });
      });
    }
    if (u.includes('/rest/v1/scores') || u.includes('/rest/v1/tracks')) throw new Error('accès direct à une table interdit : ' + u);
    return ok({}, 404);
  };
  return { fetch, calls, state };
}
const request = (body, { method = 'POST', headers = {} } = {}) =>
  new Request('https://fn.example/submit-score', { method, headers: { Authorization: 'Bearer jeton', 'Content-Type': 'application/json', ...headers }, body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
const make = (sb, extra = {}) => createHandler({ supabaseUrl: 'https://x.supabase.co', serviceKey: 'cle', fetch: sb.fetch, log: () => {}, ...extra });
const good = { ...RUN, physVer: PHYS_VER };

console.log('Course valide');
const submitCalls = (sb) => sb.calls.filter((c) => c.url.includes('/rpc/submit_best'));
test('une course rejouée et confirmée est enregistrée par UNE écriture atomique, avec son rang', async () => {
  const sb = fakeSupabase(), h = make(sb);
  const r = await h(request(good)), j = await r.json();
  assert.equal(r.status, 200);
  assert.deepEqual({ ok: j.ok, improved: j.improved, rank: j.rank, total: j.total }, { ok: true, improved: true, rank: 1, total: 1 });
  assert.ok(Math.abs(j.best - RUN.time) < 1e-9);
  assert.equal(submitCalls(sb).length, 1, 'une seule écriture');
  const a = submitCalls(sb)[0].args;
  assert.equal(a.p, UID); assert.equal(a.tk, RUN.trackKey); assert.equal(a.pv, PHYS_VER); assert.equal(a.inp, RUN.inputs); assert.ok(Math.abs(a.t - RUN.time) < 1e-9, 'le temps REJOUÉ');
  assert.equal(a.strong, null, 'circuit officiel : pas d\'empreinte à lier (le serveur le régénère lui-même)');
  assert.ok(r.headers.get('Cache-Control') === 'no-store' && r.headers.get('Access-Control-Allow-Origin') === '*');
});
test('aucune lecture-puis-écriture : le gestionnaire ne touche jamais la table des scores (tout passe par submit_best, atomique)', async () => {
  const sb = fakeSupabase();
  await make(sb)(request(good));
  assert.ok(sb.calls.every((c) => !/\/rest\/v1\/scores/.test(c.url)), 'aucun accès direct à scores');
});
test('le temps annoncé n\'est jamais retenu : le temps enregistré est celui du rejeu', async () => {
  const sb = fakeSupabase();
  const r = await make(sb)(request({ ...good, time: good.time + 0.0004 }));      // dans la tolérance de 0,5 ms
  assert.equal(r.status, 200);
  assert.ok(Math.abs(submitCalls(sb)[0].args.t - RUN.time) < 1e-9);
  assert.equal((await make(fakeSupabase())(request({ ...good, time: good.time + 0.0011 }))).status, 422, 'au-delà de la tolérance : refusé');
});
test('un meilleur temps remplace le record, un temps moins bon ou d\'une physique plus ancienne ne le remplace pas (la base décide, atomiquement)', async () => {
  const db = { scores: new Map(), binds: new Map(), tracks: new Map(), rateRows: [], locks: new Map() };
  db.scores.set(RUN.trackKey + '|' + UID, { t: RUN.time - 1, inp: 'X', pv: PHYS_VER });
  const j = await (await make(fakeSupabase({ db }))(request(good))).json();
  assert.equal(j.improved, false); assert.ok(Math.abs(j.best - (RUN.time - 1)) < 1e-9);
  assert.equal(db.scores.get(RUN.trackKey + '|' + UID).inp, 'X', 'le record n\'a pas bougé');
  db.scores.set(RUN.trackKey + '|' + UID, { t: RUN.time - 5, inp: 'Y', pv: PHYS_VER - 1 });
  assert.equal((await (await make(fakeSupabase({ db }))(request(good))).json()).improved, true, 'physique plus récente : remplacé');
});

console.log('Deux soumissions simultanées');
const SLOW = recordedRun(BUILTIN_TRACKS[0], 56 * 0.35);
test('deux courses simultanées (une rapide, une lente), dans les deux ordres d\'arrivée : le record final est TOUJOURS la plus rapide', async () => {
  assert.ok(SLOW.time > RUN.time + 0.05, 'les deux courses diffèrent : ' + RUN.time + ' / ' + SLOW.time);
  for (const order of [[SLOW, RUN], [RUN, SLOW]]) {
    const sb = fakeSupabase(), h = make(sb, { rateLimit: { ...RATE_LIMIT, max: 100 } });
    const out = await Promise.all(order.map((run) => h(request({ ...run, physVer: PHYS_VER }))));
    assert.deepEqual(out.map((r) => r.status), [200, 200]);
    assert.ok(Math.abs(sb.state.scores.get(RUN.trackKey + '|' + UID).t - RUN.time) < 1e-9, 'le plus rapide gagne quel que soit l\'ordre');
    assert.equal(sb.state.scores.get(RUN.trackKey + '|' + UID).inp, RUN.inputs);
  }
});
test('douze soumissions simultanées du même pilote : un seul record, le meilleur', async () => {
  const sb = fakeSupabase(), h = make(sb, { rateLimit: { ...RATE_LIMIT, max: 100 } });
  const runs = [SLOW, RUN, SLOW, RUN, SLOW, SLOW, RUN, SLOW, SLOW, RUN, SLOW, SLOW];
  await Promise.all(runs.map((run) => h(request({ ...run, physVer: PHYS_VER }))));
  assert.equal(sb.state.scores.size, 1); assert.ok(Math.abs([...sb.state.scores.values()][0].t - RUN.time) < 1e-9);
});

console.log('Fantôme du record (étape 7) et temps intermédiaires (étape 9)');
test('un record est rangé avec son fantôme : positions et véhicules, jamais en lieu et place des commandes', async () => {
  const sb = fakeSupabase(), r = await make(sb)(request(good));
  assert.equal(r.status, 200);
  const a = submitCalls(sb)[0].args;
  assert.ok(typeof a.gh === 'string' && a.gh.length > 1000 && a.gh.length <= MAX_GHOST_CHARS);
  assert.ok(Array.isArray(a.gveh)); assert.equal(a.inp, RUN.inputs);
  assert.ok(!JSON.stringify(await r.json()).includes(a.gh.slice(0, 40)), 'la réponse au joueur ne contient pas le fantôme');
});
test('temps intermédiaires : en pas, croissants, rangés avec le record', async () => {
  const sb = fakeSupabase(); await make(sb)(request(good));
  const a = submitCalls(sb)[0].args;
  assert.ok(Array.isArray(a.sp) && a.sp.length >= 1 && a.sp.every((x, i) => Number.isInteger(x) && (i === 0 || x > a.sp[i - 1])));
});

console.log('Circuits de joueurs : empreinte forte et collisions de signature');
const CUSTOM = scriptTrack('Mon circuit', 'start S4 C S4 finish');
const CUSTOM_RUN = recordedRun(null, 56 * 0.8, CUSTOM);
const customBody = (track, run) => ({ trackKey: track.userKey, code: track.encode(), inputs: run.inputs, time: run.time, physVer: PHYS_VER });
test('un circuit de joueur est enregistré avec une empreinte SHA-256 de son contenu (64 hexadécimaux), identique pour le même circuit et différente pour un autre', async () => {
  const sb = fakeSupabase(); const r = await make(sb)(request(customBody(CUSTOM, CUSTOM_RUN)));
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  const strong = submitCalls(sb)[0].args.strong;
  assert.match(strong, /^[0-9a-f]{64}$/);
  const other = scriptTrack('Mon circuit', 'start S5 C S4 finish'); const run2 = recordedRun(null, 56 * 0.8, other);
  const sb2 = fakeSupabase(); await make(sb2)(request(customBody(other, run2)));
  assert.notEqual(submitCalls(sb2)[0].args.strong, strong);
});
// La signature du jeu (clé u-…) n'a que 32 bits (FNV-1a) : DEUX circuits différents peuvent avoir la même clé. Paire trouvée par recherche (voir l'audit) :
// seule la position d'un arbre, loin de la route, diffère — la course est identique, donc une course de A est « valide » sur B.
const decoVariant = (xi, zi) => { const t = scriptTrack('Mon circuit', 'start S4 C S4 finish'); t.decos = [{ k: 'tree', x: -500 - xi * 0.1, y: 0, z: -500 - zi * 0.1, ry: 0, s: 1, ph: 0 }]; return t; };
test('collision de signature (32 bits) : un AUTRE circuit de même clé est refusé (409) une fois le premier lié ; sans l\'empreinte forte il aurait été accepté', async () => {
  const A = decoVariant(834, 87), B = decoVariant(3218, 80);
  assert.equal(A.userKey, B.userKey, 'même clé de classement');
  assert.notEqual(A.signatureText(), B.signatureText(), 'circuits différents');
  const run = recordedRun(null, 56 * 0.8, A);
  // le rejeu seul ne voit pas la différence (c\'est la faiblesse) :
  assert.ok(verifyRun({ ...customBody(B, run), trackKey: A.userKey }).ok, 'B accepté sous la clé de A par le seul rejeu');
  const sb = fakeSupabase(), h = make(sb, { rateLimit: { ...RATE_LIMIT, max: 100 } });
  assert.equal((await h(request({ ...customBody(A, run), trackKey: A.userKey }))).status, 200, 'A lie la clé');
  const r = await h(request({ ...customBody(B, run), trackKey: A.userKey }));
  assert.equal(r.status, 409); assert.equal((await r.json()).collision, true);
  assert.equal(sb.state.scores.size, 1, 'rien d\'écrit pour B');
});
test('la base répond « collision » : 409, jamais présenté comme un succès', async () => {
  const r = await make(fakeSupabase({ collisionFor: CUSTOM.userKey }))(request(customBody(CUSTOM, CUSTOM_RUN)));
  assert.equal(r.status, 409);
});

console.log('Checkpoints : l\'arrivée ne compte que si tous sont franchis');
import { RaceLogic } from '../js/raceLogic.js';
import { tileCenter } from '../js/pieces.js';
test('franchir la ligne d\'arrivée sans avoir pris le checkpoint ne termine PAS la course (« missing ») ; avec le checkpoint, si ; la vérification serveur s\'appuie sur cette règle', () => {
  const tr = scriptTrack('c', 'start S3 C S3 finish');
  const cp = tr.tiles.find((t) => t.t === 'checkpoint'), fin = tr.tiles.find((t) => t.t === 'finish');
  const fake = (tile) => { const c = tileCenter(tile); return { pos: { x: c.x, y: 0.4, z: c.z }, prev: { x: c.x, y: 0.4, z: c.z + 0.1 }, grounded: true, rib: false, surfType: 'road', yaw: 0, gSign: 1, gravMul: 1, vehicle: 'car' }; };
  const skip = new RaceLogic(tr);
  const ev = skip.update(fake(fin));
  assert.equal(ev && ev.type, 'missing'); assert.equal(ev.remaining, 1); assert.equal(skip.finished, false);
  const ok = new RaceLogic(tr);
  assert.equal(ok.update(fake(cp)).type, 'checkpoint');
  ok.update(fake(scriptTrack('x', 'start S3 finish').tiles[0]));      // sort de l'arrivée
  assert.equal(ok.update(fake(fin)).type, 'finish'); assert.equal(ok.finished, true);
  assert.equal(new RaceLogic(tr, { partial: true }).update(fake(fin)).type, 'finish', 'seul le test partiel de l\'éditeur (jamais la vérification ni le serveur) se passe des checkpoints');
});
test('le serveur ne rejoue jamais en mode partiel : une course enregistrée depuis le curseur de l\'éditeur n\'est pas une arrivée', () => {
  const r = verifyRun({ ...customBody(CUSTOM, CUSTOM_RUN), physVer: PHYS_VER });
  assert.ok(r.ok);
  // mêmes commandes sur un circuit dont la ligne d'arrivée est AVANT le checkpoint : l'arrivée n'est pas atteinte
  const swapped = scriptTrack('Mon circuit', 'start S4 finish S4 C');
  const bad = verifyRun({ trackKey: swapped.userKey, code: swapped.encode(), inputs: CUSTOM_RUN.inputs, time: CUSTOM_RUN.time, physVer: PHYS_VER });
  assert.equal(bad.ok, false);
});

console.log('Publication d\'un circuit : temps auteur rejoué par le serveur');
import { verifyRun } from '../js/verify.js';
const PUB = scriptTrack('Mon circuit', 'start S4 C S4 finish');
const PUB_RUN = recordedRun(null, 56 * 0.8, PUB);
PUB.setVerified(PUB_RUN.time);
const pubBody = (extra = {}) => ({ action: 'publish-track', code: PUB.encode(), inputs: PUB_RUN.inputs, time: PUB_RUN.time, physVer: PHYS_VER, name: 'Mon beau circuit', description: 'Une description', ...extra });
const pubCalls = (sb) => sb.calls.filter((c) => c.url.includes('/rpc/publish_track'));
test('un circuit vérifié est publié ; author_time est le temps REJOUÉ (jamais celui du corps de la requête), vérifié = vrai', async () => {
  const sb = fakeSupabase(), r = await make(sb)(request(pubBody({ author_time: 0.001, authorTime: 0.001, atime: 0.001 }))), j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  assert.deepEqual({ ok: j.ok, status: j.status, authorVerified: j.authorVerified }, { ok: true, status: 'created', authorVerified: true });
  const a = pubCalls(sb)[0].args;
  assert.ok(Math.abs(a.atime - PUB_RUN.time) < 1e-9, 'temps rejoué'); assert.equal(a.sg, PUB.signature()); assert.equal(a.nm, 'Mon beau circuit'); assert.equal(a.ds, 'Une description');
  assert.match(a.strong, /^[0-9a-f]{64}$/); assert.equal(a.cd, PUB.encode());
  assert.ok(sb.calls.every((c) => !/\/rest\/v1\/tracks/.test(c.url)), 'jamais d\'insertion directe');
});
test('temps auteur falsifié : le code annonce un temps meilleur que la course (vt trafiqué), ou la course ne le confirme pas : 422, rien de publié', async () => {
  const fake = scriptTrack('Mon circuit', 'start S4 C S4 finish'); fake.setVerified(PUB_RUN.time - 5);       // le code ose affirmer 5 s de mieux
  const sb = fakeSupabase();
  let r = await make(sb)(request(pubBody({ code: fake.encode() })));
  assert.equal(r.status, 422); assert.match((await r.json()).error, /temps de l’auteur|ne correspond pas/);
  r = await make(sb)(request(pubBody({ time: PUB_RUN.time - 5 })));
  assert.equal(r.status, 422, 'le temps annoncé ne correspond pas à la course');
  assert.equal(pubCalls(sb).length, 0);
});
test('circuit non vérifié (pas de vt), marque de vérification d\'un autre contenu (vh), course qui n\'arrive pas : 422', async () => {
  const sb = fakeSupabase(), h = make(sb, { rateLimit: { ...RATE_LIMIT, max: 100 } });
  const raw = scriptTrack('Mon circuit', 'start S4 C S4 finish');
  assert.equal((await h(request(pubBody({ code: raw.encode() })))).status, 422, 'jamais vérifié');
  const edited = Track.decode(PUB.encode()); edited.decos = [{ k: 'tree', x: -900, y: 0, z: -900, ry: 0, s: 1, ph: 0 }];        // contenu modifié APRÈS la vérification : vh ne colle plus
  edited.vt = PUB.vt; edited.vh = PUB.vh;
  assert.equal((await h(request(pubBody({ code: edited.encode() })))).status, 422, 'contenu modifié depuis la vérification');
  assert.equal((await h(request(pubBody({ inputs: 'QUJDREVGR0g=' })))).status, 422, 'commandes qui n\'arrivent pas');
  assert.equal(pubCalls(sb).length, 0);
});
test('publication : mauvaise version de physique (ancienne ou plus récente), action inconnue, circuit trop gros : refusés avant toute écriture', async () => {
  const sb = fakeSupabase(), h = make(sb, { rateLimit: { ...RATE_LIMIT, max: 100 } });
  for (const pv of [0, PHYS_VER - 1, PHYS_VER + 1]) {
    const r = await h(request(pubBody({ physVer: pv })));
    assert.equal(r.status, 422, 'physVer ' + pv); const j = await r.json(); assert.equal(j.versionMismatch, true); assert.equal(j.serverPhysVer, PHYS_VER);
  }
  assert.equal((await h(request(pubBody({ action: 'delete-everything' })))).status, 400);
  assert.equal(pubCalls(sb).length, 0);
});
test('publication : signature déjà prise par un autre pilote (409), collision d\'empreinte (409), limite de publications (429), nom nettoyé', async () => {
  assert.equal((await make(fakeSupabase({ publishStatus: 'taken' }))(request(pubBody()))).status, 409);
  assert.equal((await make(fakeSupabase({ publishStatus: 'collision' }))(request(pubBody()))).status, 409);
  const lim = await make(fakeSupabase({ failWrite: 'Trop de publications : réessaie dans une heure.' }))(request(pubBody()));
  assert.equal(lim.status, 429); assert.ok(lim.headers.get('Retry-After'));
  const sb = fakeSupabase(); await make(sb)(request(pubBody({ name: '   Un   nom \n  trop long ' + 'x'.repeat(100), description: 'd'.repeat(500) })));
  const a = pubCalls(sb)[0].args; assert.ok(a.nm.length <= 40 && !/\s{2}/.test(a.nm) && a.ds.length === 200);
});
test('republication par l\'auteur (circuit publié avant l\'étape 15, temps non vérifié) : mis à jour, vérifié', async () => {
  const sb = fakeSupabase(); const h = make(sb, { rateLimit: { ...RATE_LIMIT, max: 100 } });
  assert.equal((await (await h(request(pubBody()))).json()).status, 'created');
  assert.equal((await (await h(request(pubBody({ name: 'Nouveau nom' })))).json()).status, 'updated');
  assert.equal(sb.state.tracks.size, 1);
});

console.log('Requêtes refusées');
test('méthode : OPTIONS répond aux navigateurs, PUT / DELETE sont refusés ; GET donne l\'état du service (version de physique déployée) sans authentification ni lecture de la base', async () => {
  const sb = fakeSupabase(), h = make(sb);
  assert.equal((await h(new Request('https://fn.example/', { method: 'OPTIONS' }))).status, 200);
  assert.equal((await h(request(null, { method: 'PUT' }))).status, 405);
  assert.equal((await h(request(null, { method: 'DELETE' }))).status, 405);
  const r = await h(new Request('https://fn.example/', { method: 'GET' })), j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.physVer, PHYS_VER); assert.equal(j.service, 'submit-score'); assert.deepEqual(j.actions, ['submit', 'publish-track']);
  assert.equal(sb.calls.length, 0, 'aucun appel à la base');
});
test('pas de jeton valide : 401, et rien n\'est rejoué ni écrit', async () => {
  const sb = fakeSupabase({ authOk: false }), r = await make(sb)(request(good));
  assert.equal(r.status, 401);
  assert.equal(sb.calls.length, 1, 'seul l\'appel d\'authentification a eu lieu');
});
test('temps falsifié : la course rejouée ne le confirme pas (422)', async () => {
  const sb = fakeSupabase(), r = await make(sb)(request({ ...good, time: good.time - 3 }));
  assert.equal(r.status, 422);
  assert.equal(submitCalls(sb).length, 0);
});
test('commandes tronquées ou inventées : 422', async () => {
  const h = make(fakeSupabase());
  assert.equal((await h(request({ ...good, inputs: 'AAAA' }))).status, 422);
  assert.equal((await h(request({ ...good, inputs: '!!!pas du base64!!!' }))).status, 400, 'pas du base64 : refusé avant tout rejeu');
  assert.equal((await h(request({ ...good, inputs: 'QUJDREVGR0g=' }))).status, 422, 'base64 valide mais sans course : rejeu refusé');
});
test('autre version de la physique (plus ancienne, plus récente, zéro) : 422, versionMismatch, les deux versions dans le message, rien rejoué ni écrit', async () => {
  for (const pv of [PHYS_VER - 1, PHYS_VER + 1, 0, 1]) {
    const sb = fakeSupabase(), r = await make(sb)(request({ ...good, physVer: pv })), j = await r.json();
    assert.equal(r.status, 422, 'physVer ' + pv); assert.equal(j.versionMismatch, true); assert.equal(j.serverPhysVer, PHYS_VER);
    assert.ok(j.error.includes(String(pv)) && j.error.includes(String(PHYS_VER)), j.error);
    assert.equal(submitCalls(sb).length, 0, 'rien d\'écrit');
  }
});
test('une ancienne version ne contourne aucune validation : sa course (même valide pour elle) n\'est ni rejouée avec l\'ancienne physique ni enregistrée', async () => {
  const sb = fakeSupabase(), r = await make(sb)(request({ ...good, physVer: PHYS_VER - 1, time: 1 }));
  assert.equal(r.status, 422); assert.equal(submitCalls(sb).length, 0);
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
  assert.equal(submitCalls(sb).length, 0);
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
test('Supabase injoignable (le réseau lève une erreur) : 503 + Retry-After, réponse générique, rien de secret, journalisé ; rien rejoué ni écrit', async () => {
  const logged = [];
  const sb = fakeSupabase({ boom: true });
  const h = make(sb, { log: (...a) => logged.push(a) });
  const r = await h(request(good)), j = await r.json();
  assert.equal(r.status, 503);
  assert.equal(r.headers.get('Retry-After'), '10');
  assert.match(j.error, /momentanément indisponible/);
  assert.ok(!JSON.stringify(j).includes('mot de passe'));
  assert.equal(logged.length, 1);
  assert.equal(submitCalls(sb).length, 0);
});
test('Supabase qui ne répond JAMAIS : abandonné au délai (la fonction ne pend pas), 503 ; la même requête renvoyée ensuite est acceptée (idempotent)', async () => {
  const sb = fakeSupabase();
  let hang = true;
  const slow = (u, init) => (hang && String(u).includes('/rpc/submit_best') ? new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('annulé')))) : sb.fetch(u, init));
  const h = createHandler({ supabaseUrl: 'https://x.supabase.co', serviceKey: 'cle', fetch: slow, log: () => {}, upstreamTimeoutMs: 80 });
  const keep = setTimeout(() => {}, 10_000);          // (AbortSignal.timeout ne retient pas la boucle d'événements : sous Node, sans ceci le processus s'arrêterait avant le délai)
  const t0 = Date.now(), r = await h(request(good));
  clearTimeout(keep);
  assert.equal(r.status, 503); assert.ok(Date.now() - t0 < 3000, 'abandonné au délai');
  hang = false;
  const again = await h(request(good)), j = await again.json();
  assert.equal(again.status, 200); assert.equal(j.ok, true);
  const twice = await h(request(good));
  assert.equal(twice.status, 200); assert.equal((await twice.json()).improved, false, 'renvoi : rien n\'est compté deux fois');
});
test('réponse d\'authentification illisible (HTML d\'un relais en panne) : 503, pas « erreur interne » ni plantage', async () => {
  const sb = fakeSupabase();
  const bad = async (u, init) => (String(u).includes('/auth/v1/user') ? new Response('<html>Bad gateway</html>', { status: 200 }) : sb.fetch(u, init));
  const r = await createHandler({ supabaseUrl: 'https://x.supabase.co', serviceKey: 'cle', fetch: bad, log: () => {} })(request(good));
  assert.equal(r.status, 503);
});
test('erreur interne INATTENDUE (autre que Supabase) : 500 générique, journalisée, rien ne sort', async () => {
  const logged = [];
  const h = make(fakeSupabase(), { log: (...a) => logged.push(a) });
  const r = await h({ method: 'POST', headers: null, body: null }), j = await r.json();       // une requête cassée fait lever le gestionnaire lui-même
  assert.equal(r.status, 500);
  assert.equal(j.error, 'Erreur interne.');
  assert.equal(logged.length, 1);
});
test('échec d\'écriture en base : 500 sans détail ; plafond de 2 000 temps : 422 avec un message clair', async () => {
  const logged = [];
  const r = await make(fakeSupabase({ failWrite: 'connexion perdue (mot de passe=secret)' }), { log: (...a) => logged.push(a) })(request(good)), t = await r.text();
  assert.equal(r.status, 500); assert.ok(!t.includes('secret') && !t.includes('connexion'));
  const cap = await make(fakeSupabase({ failWrite: 'Trop de temps enregistrés pour ce pilote.' }))(request(good)), j = await cap.json();
  assert.equal(cap.status, 422); assert.equal(j.capReached, true); assert.match(j.error, /2 000/);
});
test('configuration absente : 500 explicite', async () => {
  const h = createHandler({ supabaseUrl: '', serviceKey: '', log: () => {} });
  assert.equal((await h(request(good))).status, 500);
});
test('ALLOWED_ORIGIN restreint l\'origine déclarée dans les réponses', async () => {
  const h = make(fakeSupabase(), { allowedOrigin: 'https://jeu.example' });
  assert.equal((await h(request(good))).headers.get('Access-Control-Allow-Origin'), 'https://jeu.example');
});

console.log('Taille de la requête : lecture progressive');
test('corps fragmenté SANS Content-Length : la lecture s\'arrête à la limite (413) et le flux est annulé, sans tout lire', async () => {
  let pulled = 0, cancelled = false;
  const chunk = new TextEncoder().encode('A'.repeat(65536));
  const body = new ReadableStream({ pull(c) { pulled++; if (pulled > 200) { c.close(); return; } c.enqueue(chunk); }, cancel() { cancelled = true; } });
  const sb = fakeSupabase(), h = make(sb);
  const req = new Request('https://fn.example/submit-score', { method: 'POST', headers: { Authorization: 'Bearer jeton' }, body, duplex: 'half' });
  const r = await h(req);
  assert.equal(r.status, 413);
  assert.ok(cancelled, 'le flux a été annulé');
  assert.ok(pulled * 65536 < MAX_BODY_CHARS + 4 * 65536 + 1 && pulled < 20, 'lu au plus ~' + Math.ceil(MAX_BODY_CHARS / 65536 + 3) + ' blocs sur 200 : ' + pulled);
  assert.equal(sb.calls.filter((c) => c.url.includes('/rest/v1/scores')).length, 0);
});
test('un Content-Length qui MENT (petit) avec un gros corps : toujours 413', async () => {
  const big = '{"inputs":"' + 'A'.repeat(MAX_BODY_CHARS + 10) + '"}';
  const r = await make(fakeSupabase())(request(big, { headers: { 'content-length': '50' } }));
  assert.equal(r.status, 413);
});
test('readBodyLimited : corps vide, exact à la limite, multi-octets comptés en octets', async () => {
  const { readBodyLimited } = await import('../supabase/functions/submit-score/handler.js');
  const mk = (t) => new Request('https://x', { method: 'POST', body: t });
  assert.equal(await readBodyLimited(mk(''), 10), '');
  assert.equal(await readBodyLimited(mk('a'.repeat(10)), 10), 'a'.repeat(10));
  assert.equal(await readBodyLimited(mk('a'.repeat(11)), 10), null);
  assert.equal(await readBodyLimited(mk('é'.repeat(6)), 10), null, '12 octets');
});

console.log('Forme des données');
test('temps impossibles ou hors bornes, clé et commandes mal formées : 400 sans rien rejouer', async () => {
  const sb = fakeSupabase(), h = make(sb, { rateLimit: { max: 1000, windowMs: 60_000 } });
  for (const bad of [{ time: 0 }, { time: -3 }, { time: 601 }, { time: 1e9 }, { physVer: -1 }, { physVer: 1e9 }, { trackKey: 'b-a b' }, { trackKey: '../../etc' }, { trackKey: '' }, { inputs: '' }, { inputs: 'é'.repeat(8) }, { inputs: 'AAAA'.repeat(200000) }]) {
    const r = await h(request({ ...good, ...bad }));
    assert.ok(r.status === 400 || r.status === 413, JSON.stringify(bad).slice(0, 60) + ' → ' + r.status);
  }
  assert.equal(sb.calls.filter((c) => c.url.includes('/rest/v1/scores')).length, 0, 'aucune écriture');
});

console.log('Limite partagée entre instances (base)');
test('la base refuse (délai en secondes) : 429 avec Retry-After, sans rejouer la course', async () => {
  const sb = fakeSupabase({ rate: 37 });
  const r = await make(sb)(request(good));
  assert.equal(r.status, 429); assert.equal(r.headers.get('Retry-After'), '37');
  assert.equal(submitCalls(sb).length, 0);
});
test('la limite en base est PERSISTANTE et partagée : trois instances (mémoires séparées), 30 requêtes simultanées d\'un même pilote — exactement « max » acceptées', async () => {
  const rows = []; const max = 8;
  const rate = (b) => { const n = rows.filter((x) => x.p === b.p).length; if (n >= b.max_hits) return 30; rows.push({ p: b.p, anon: b.is_anon }); return 0; };
  const sb = fakeSupabase({ rate });
  const cfg = { rateLimit: { ...RATE_LIMIT, max } };       // chaque instance admet jusqu'à « max » (3 × max au total) : seule la base les relie et tranche
  const hs = [make(sb, cfg), make(sb, cfg), make(sb, cfg)];
  const out = await Promise.all(Array.from({ length: 30 }, (_, i) => hs[i % 3](request({ ...good, time: 1 }))));
  const accepted = out.filter((r) => r.status !== 429).length;
  assert.equal(accepted, max, 'exactement ' + max + ' passent le contrôle (puis 422 : temps falsifié), pas ' + accepted);
  // redémarrage : une instance neuve (mémoire vide) ne rouvre pas la limite
  assert.equal((await make(sb, cfg)(request({ ...good, time: 1 }))).status, 429);
});
test('la requête transmet le type, le pilote, la fenêtre, le plafond global et le drapeau anonyme', async () => {
  const sb = fakeSupabase({ anonymous: true }); await make(sb)(request({ ...good, time: 1 }));
  const a = sb.calls.find((c) => c.url.includes('rate_check')).args;
  assert.deepEqual(a, { k: 'submit', p: UID, max_hits: RATE_LIMIT.max, window_s: 60, global_max: RATE_LIMIT.globalMax, is_anon: true, anon_max: RATE_LIMIT.anonMax });
  assert.ok(RATE_LIMIT.anonMax < RATE_LIMIT.globalMax, 'les comptes gardent une réserve');
  const sb2 = fakeSupabase({ anonymous: false }); await make(sb2)(request({ ...good, time: 1 }));
  assert.equal(sb2.calls.find((c) => c.url.includes('rate_check')).args.is_anon, false);
});
test('FAIL-CLOSED : la base de limitation absente ou en panne (étape 15 non appliquée) — 503 et Retry-After, la course n\'est ni rejouée ni enregistrée', async () => {
  for (const rate of ['down', 'texte', -5, 1.5]) {
    const sb = fakeSupabase({ rate }), h = make(sb, { log: () => {} });
    const r = await h(request(good));
    assert.equal(r.status, 503, String(rate)); assert.ok(r.headers.get('Retry-After'));
    assert.equal(submitCalls(sb).length, 0);
  }
  const logged = [], once = make(fakeSupabase({ rate: 'down' }), { log: (...a) => logged.push(a) });
  for (let i = 0; i < 3; i++) await once(request(good));
  assert.equal(logged.length, 1, 'journalisé une fois par minute au plus');
});

console.log('Sécurité (phase 5) : l\'identité et les droits ne viennent JAMAIS du corps de la requête');
// Aucune information du navigateur n'est crue : le pilote est celui que Supabase Auth reconnaît au jeton, le drapeau « anonyme » aussi, la cadence se compte sur lui,
// et la clé de service ne sert jamais d'identité ni ne sort dans une réponse.
const spy = (sb) => { const seen = []; return { seen, fetch: (u, init = {}) => { seen.push({ url: String(u), headers: init.headers || {}, body: init.body }); return sb.fetch(u, init); } }; };
test('le jeton du joueur est transmis tel quel à l\'authentification ; la clé de service n\'est jamais utilisée comme jeton d\'un joueur', async () => {
  const sb = fakeSupabase(), s = spy(sb);
  await make({ fetch: s.fetch })(request(good, { headers: { Authorization: 'Bearer jeton-du-joueur' } }));
  const auth = s.seen.find((c) => c.url.includes('/auth/v1/user'));
  assert.equal(auth.headers.Authorization, 'Bearer jeton-du-joueur');
  assert.ok(s.seen.filter((c) => !c.url.includes('/auth/v1/user')).every((c) => c.headers.Authorization === 'Bearer cle'), 'les appels à la base utilisent la clé de service, ceux d\'authentification le jeton du joueur');
  // sans en-tête Authorization : l'authentification reçoit une valeur vide, jamais la clé de service
  const sb2 = fakeSupabase({ authOk: false }), s2 = spy(sb2);
  const r = await make({ fetch: s2.fetch })(new Request('https://fn.example/submit-score', { method: 'POST', body: JSON.stringify(good) }));
  assert.equal(r.status, 401);
  assert.equal(s2.seen.find((c) => c.url.includes('/auth/v1/user')).headers.Authorization, '');
  assert.equal(s2.seen.filter((c) => !c.url.includes('/auth/v1/user')).length, 0, 'rien d\'autre n\'est appelé sans session valide');
});
test('jeton refusé (absent, vide, autre schéma, périmé) : 401 pour chacun, rien rejoué, rien écrit, rien de la base touché', async () => {
  for (const authorization of [undefined, '', 'Basic dXNlcjpwYXNz', 'Bearer ', 'Bearer jeton.perime.xxx', 'bearer cle']) {
    const sb = fakeSupabase({ authOk: false });
    const h = make(sb), headers = authorization === undefined ? {} : { Authorization: authorization };
    const r = await h(new Request('https://fn.example/submit-score', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(good) }));
    assert.equal(r.status, 401, String(authorization));
    assert.deepEqual(sb.calls.filter((c) => !c.url.includes('/auth/v1/user')), [], String(authorization));
  }
});
test('le pilote ne peut pas être imposé par le corps : player, uid, p, user_id, id, is_anonymous sont ignorés — l\'écriture se fait sous l\'identité du jeton', async () => {
  const sb = fakeSupabase({ anonymous: true });
  const body = { ...good, player: 'AUTRE', uid: 'AUTRE', p: '99999999-9999-9999-9999-999999999999', user_id: '99999999-9999-9999-9999-999999999999', id: '99999999-9999-9999-9999-999999999999', is_anonymous: false, anon: false, role: 'service_role' };
  const r = await make(sb)(request(body));
  assert.equal(r.status, 200);
  const w = submitCalls(sb)[0].args;
  assert.equal(w.p, UID, 'écrit sous le pilote du jeton');
  assert.equal(sb.calls.find((c) => c.url.includes('rate_check')).args.p, UID);
  assert.equal(sb.calls.find((c) => c.url.includes('rate_check')).args.is_anon, true, 'le drapeau anonyme vient de l\'authentification, pas du corps');
  assert.ok(![...sb.state.scores.keys()].some((k) => k.includes('9999')), 'rien n\'a été écrit pour un autre pilote');
});
test('la cadence se compte sur le pilote du jeton : changer les champs du corps (ou en répéter) ne donne pas un autre compteur', async () => {
  const sb = fakeSupabase({ rate: () => 0 });
  const calls = [];
  const h = make({ fetch: (u, init) => { if (String(u).includes('rate_check')) calls.push(JSON.parse(init.body).p); return sb.fetch(u, init); } }, { rateLimit: { ...RATE_LIMIT, max: 3 } });
  const out = [];
  for (let i = 0; i < 6; i++) out.push((await h(request({ ...good, time: 1, player: 'P' + i, uid: 'U' + i }))).status);
  assert.deepEqual(out.slice(3), [429, 429, 429], 'la mémoire de l\'instance refuse dès la 4e (même pilote), quel que soit le corps');
  assert.ok(calls.every((p) => p === UID));
});
test('clés de circuit hostiles (injection SQL / chemin / retour à la ligne / unicode / trop longues) : 400 sans rien rejouer ni écrire', async () => {
  for (const trackKey of ["b-x'; drop table scores;--", '../../etc/passwd', 'b-x\r\nX-Evil: 1', 'b-é', 'b-x y', '%00', 'u-' + 'a'.repeat(200), '', ' ', null, 5, ['b-x'], { k: 1 }]) {
    const sb = fakeSupabase();
    const r = await make(sb)(request({ ...good, trackKey }));
    assert.equal(r.status, 400, JSON.stringify(trackKey));
    assert.equal(submitCalls(sb).length, 0);
  }
});
test('corps hostiles : __proto__, constructor, JSON profond, tableau, nombre, null — jamais de plantage, jamais d\'écriture', async () => {
  const bodies = ['{"__proto__":{"admin":true},"trackKey":"b-x"}', '{"constructor":{"prototype":{"x":1}}}', '[]', '5', 'null', '"texte"', '{' .repeat(5000), '[' .repeat(100000), '{"a":' + '['.repeat(200) + ']'.repeat(200) + '}'];
  for (const b of bodies) {
    const sb = fakeSupabase();
    const r = await make(sb)(request(b));
    assert.ok([400, 413, 422].includes(r.status), b.slice(0, 20) + ' -> ' + r.status);
    assert.equal(submitCalls(sb).length, 0);
  }
  assert.equal({}.admin, undefined, 'aucune pollution du prototype');
});
test('types détournés (nombres en texte, objets, tableaux, booléens, NaN codé) : 400, jamais coercés en nombre', async () => {
  for (const patch of [{ time: String(RUN.time) }, { time: [RUN.time] }, { time: { v: RUN.time } }, { time: true }, { time: null }, { physVer: String(PHYS_VER) }, { physVer: [PHYS_VER] }, { physVer: PHYS_VER + 0.5 }, { physVer: null }, { inputs: [RUN.inputs] }, { inputs: { a: 1 } }, { inputs: 12 }, { code: { a: 1 } }, { code: ['x'] }, { action: ['submit'] }]) {
    const sb = fakeSupabase();
    const r = await make(sb)(request({ ...good, ...patch }));
    assert.ok(r.status === 400, JSON.stringify(patch) + ' -> ' + r.status);
    assert.equal(submitCalls(sb).length, 0);
  }
});
test('aucune réponse ne contient la clé de service ni le jeton, succès comme refus comme panne', async () => {
  const scenarios = [fakeSupabase(), fakeSupabase({ authOk: false }), fakeSupabase({ failWrite: 'erreur contenant cle et jeton' }), fakeSupabase({ boom: true }), fakeSupabase({ rate: 'down' }), fakeSupabase({ profile: false })];
  for (const sb of scenarios) {
    const h = createHandler({ supabaseUrl: 'https://x.supabase.co', serviceKey: 'CLE-DE-SERVICE-SECRETE', fetch: sb.fetch, log: () => {} });
    for (const body of [good, { ...good, time: 1 }, { ...good, action: 'publish-track' }]) {
      const r = await h(request(body, { headers: { Authorization: 'Bearer JETON-SECRET-DU-JOUEUR' } }));
      const txt = await r.text() + JSON.stringify([...r.headers.entries()]);
      assert.ok(!txt.includes('CLE-DE-SERVICE-SECRETE') && !txt.includes('JETON-SECRET-DU-JOUEUR'), 'fuite dans la réponse ' + r.status);
    }
  }
});
test('CORS : aucune permission d\'envoyer des cookies (Allow-Credentials absent) ; l\'origine déclarée suit ALLOWED_ORIGIN ; Vary: Origin', async () => {
  const h = make(fakeSupabase(), { allowedOrigin: 'https://mon-jeu.example' });
  const r = await h(request(good, { method: 'OPTIONS' }));
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://mon-jeu.example');
  assert.equal(r.headers.get('Access-Control-Allow-Credentials'), null);
  assert.equal(r.headers.get('Vary'), 'Origin');
  assert.ok(!/\*/.test(r.headers.get('Access-Control-Allow-Headers')), 'en-têtes autorisés énumérés, pas de joker');
  const g = await h(request('', { method: 'GET' }));
  assert.equal(g.headers.get('Cache-Control'), 'no-store');
});
test('publication : nom et description nettoyés (espaces, longueur, rien d\'interprété), nom vide → nom du circuit ; plafond de 100 circuits par auteur : 422 clair', async () => {
  const sb = fakeSupabase(), h = make(sb, { rateLimit: { ...RATE_LIMIT, max: 100 } });
  const r = await h(request(pubBody({ name: '  <img src=x onerror=alert(1)>\n\n  ' + 'a'.repeat(100), description: '\t' + 'd'.repeat(500) })));
  assert.equal(r.status, 200);
  const a = pubCalls(sb)[0].args;
  assert.equal(a.nm.length, 40); assert.ok(a.nm.startsWith('<img src=x onerror=alert(1)> a'), 'écrit tel quel (l\'affichage échappe), espaces compactés');
  assert.equal(a.ds.length, 200);
  const cap = await make(fakeSupabase({ failWrite: 'Trop de circuits publiés (100 au plus) : retire-en avant d\'en publier un autre.' }))(request(pubBody()));
  const j = await cap.json();
  assert.equal(cap.status, 422); assert.equal(j.trackCap, true); assert.match(j.error, /100 au plus/);
});

await finish('Tous les tests de la fonction serveur passent.');
