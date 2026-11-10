// « submit-score » face à des requêtes déformées : node tools/test-submit-fuzz.mjs   (npm test)
// Une course valide est mutée au hasard (types changés, nombres extrêmes, champs en trop ou manquants, objets imbriqués, __proto__…). Pour chaque requête :
// le gestionnaire répond toujours (jamais d'exception, jamais de 5xx), n'écrit rien sans réponse 200, et une écriture n'a lieu que pour la course d'origine.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { createHandler } from '../supabase/functions/submit-score/handler.js';
import { Simulation } from '../js/simulation.js';
import { InputRecorder, quantSteer } from '../js/replay.js';
import { Autopilot } from '../js/autopilot.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { hashString } from '../js/track.js';
import { PHYS_VER } from '../js/version.js';

const UID = '11111111-2222-3333-4444-555555555555';
function recordedRun(def) {
  const track = buildBuiltin(def), sim = new Simulation(track), rec = new InputRecorder();
  sim.start();
  const bot = new Autopilot(track.path, { latLimit: 56 * 0.8 });
  bot.reset(sim.phys);
  for (let i = 0; i < 120 * 150; i++) {
    const inp = bot.control(sim.phys); inp.steer = quantSteer(inp.steer); rec.push(inp, false);
    const ev = sim.step(inp);
    if (sim.lost) sim.rewind();
    if (ev && ev.type === 'finish') return { trackKey: `b-${def.id}-${hashString(track.encode())}`, inputs: rec.encode(), time: sim.logic.time };
  }
  throw new Error('le pilote automatique ne termine pas');
}
const RUN = { ...recordedRun(BUILTIN_TRACKS[0]), physVer: PHYS_VER };

function fakeSupabase() {
  const writes = []; let n = 0;    // un joueur différent à chaque requête : la limite de débit (429) ne masque pas la validation
  const fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: UID.slice(0, -6) + String(++n).padStart(6, '0') }), { status: 200 });
    if (u.includes('/rest/v1/players')) return new Response(JSON.stringify([{ id: UID }]), { status: 200 });
    if (u.includes('/rpc/competition_open')) return new Response('{"code":"PGRST202"}', { status: 404 });
    if (u.includes('/rest/v1/scores') && (init.method === 'POST' || init.method === 'PATCH')) { writes.push(JSON.parse(init.body || 'null')); return new Response(null, { status: 204 }); }
    if (u.includes('select=time,phys_ver')) return new Response('[]', { status: 200 });
    if (u.includes('/rest/v1/scores')) return new Response('[]', { status: 200, headers: { 'content-range': '0-0/1' } });
    return new Response('{}', { status: 404 });
  };
  return { fetch, writes };
}

let seed = 20261109; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const WEIRD = [null, undefined, true, false, 0, -1, 1e308, -1e308, 1e-320, NaN, Infinity, '', ' ', 'x'.repeat(5000), '../../etc/passwd', "'; DROP TABLE scores;--", '<script>alert(1)</script>', [], [1, 2, 3], {}, { a: { b: { c: [] } } }, { __proto__: { admin: true } }, 0.1 + 0.2, 2 ** 53, [[[[[[]]]]]]];
function mutate(body) {
  const b = JSON.parse(JSON.stringify(body));
  const keys = Object.keys(b);
  for (let n = 1 + Math.floor(rnd() * 3); n > 0; n--) {
    const k = pick(keys), r = rnd();
    if (r < 0.15) delete b[k];
    else if (r < 0.3) b[pick(['isAdmin', 'player', 'phys_ver', 'rank', '__proto__', 'constructor', 'ghost', 'time2'])] = pick(WEIRD);
    else if (r < 0.4 && typeof b[k] === 'string') b[k] = b[k].slice(0, Math.floor(rnd() * b[k].length)) + pick(['\u0000', '"', '\\', '😀', '\n']);
    else if (r < 0.5 && typeof b[k] === 'number') b[k] = b[k] * pick([-1, 0, 1e-9, 1e9, 1.0000001]);
    else b[k] = pick(WEIRD);
  }
  return b;
}
const asRequest = (body, extra = {}) => new Request('https://fn.example/submit-score', { method: 'POST', headers: { Authorization: 'Bearer jeton', 'Content-Type': 'application/json', ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body) });

console.log('Requêtes déformées');
test('300 requêtes mutées : toujours une réponse, jamais de 5xx, jamais d\'écriture sans 200', async () => {
  const sb = fakeSupabase(), h = createHandler({ supabaseUrl: 'https://x.supabase.co', serviceKey: 'cle', fetch: sb.fetch, log: () => {} });
  const seen = {};
  for (let i = 0; i < 300; i++) {
    const before = sb.writes.length, r = await h(asRequest(mutate(RUN)));
    assert.ok(r instanceof Response, 'réponse #' + i);
    assert.ok(r.status < 500, `#${i} : statut ${r.status}`);
    seen[r.status] = (seen[r.status] || 0) + 1;
    if (r.status !== 200) assert.equal(sb.writes.length, before, `#${i} : écriture sur une réponse ${r.status}`);
    await r.text();
  }
  assert.ok(seen[400] > 50, 'la plupart sont refusées : ' + JSON.stringify(seen));
});
test('corps qui n\'est pas du JSON, tronqué, vide, gigantesque, ou méthode inattendue : refusé proprement', async () => {
  const sb = fakeSupabase(), h = createHandler({ supabaseUrl: 'https://x.supabase.co', serviceKey: 'cle', fetch: sb.fetch, log: () => {} });
  for (const body of ['', '{', 'null', '[]', '"texte"', '{"inputs":' + '9'.repeat(200000) + '}', JSON.stringify(RUN).slice(0, 100)]) {
    const r = await h(asRequest(body)); assert.ok(r.status >= 400 && r.status < 500, `corps « ${body.slice(0, 20)}… » : ${r.status}`); await r.text();
  }
  for (const method of ['GET', 'PUT', 'DELETE']) { const r = await h(new Request('https://fn.example/submit-score', { method, headers: { Authorization: 'Bearer jeton' } })); assert.ok(r.status === 405 || r.status === 204 || r.status === 200, method + ' : ' + r.status); await r.text(); }
  assert.equal(sb.writes.length, 0);
});
test('jeton absent, vide ou en trop mauvais format : 401, aucune écriture', async () => {
  const sb = fakeSupabase(), h = createHandler({ supabaseUrl: 'https://x.supabase.co', serviceKey: 'cle', fetch: async (u, i) => (String(u).includes('/auth/v1/user') && !/Bearer jeton$/.test(i?.headers?.Authorization || '') ? new Response('{}', { status: 401 }) : sb.fetch(u, i)), log: () => {} });
  for (const auth of [undefined, '', 'Bearer', 'Bearer ', 'Basic abc', 'Bearer ' + 'x'.repeat(10000)]) {
    const r = await h(new Request('https://fn.example/submit-score', { method: 'POST', headers: { ...(auth === undefined ? {} : { Authorization: auth }), 'Content-Type': 'application/json' }, body: JSON.stringify(RUN) }));
    assert.ok(r.status === 401 || r.status === 400, `${auth} : ${r.status}`); await r.text();
  }
  assert.equal(sb.writes.length, 0);
});
finish('Tous les tests de requêtes déformées passent.');
