// Saisons hebdomadaires et secteurs (E15), côté jeu et serveur : node tools/test-seasons.mjs   (npm test)
//  - dates et circuits de saison (identiques pour tous ; même origine que supabase/etape11-saisons.sql) ;
//  - la catégorie « sea-N » : une étiquette (le circuit ne change pas), acceptée par le serveur seulement pendant la semaine N, sur ses trois circuits ;
//  - les temps intermédiaires rendus par la vérification.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';
import { SEASON_EPOCH, SEASON_MS, SEASON_TRACKS, SEASON_GRACE_MS, seasonOf, seasonBounds, seasonTracks, seasonOpen, DIVISIONS } from '../js/seasons.js';
import { parseVariant, formatVariant, variantKey, applyVariant, splitKey } from '../js/variants.js';
import { trackForKey, verifyRun } from '../js/verify.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { hashString } from '../js/track.js';
import { Simulation } from '../js/simulation.js';
import { InputRecorder, quantSteer } from '../js/replay.js';
import { Autopilot } from '../js/autopilot.js';
import { PHYS_VER } from '../js/version.js';
import { backfillSectors } from './backfill-sectors.mjs';

const keyOf = (def) => `b-${def.id}-${hashString(buildBuiltin(def).encode())}`;
const at = (ms, fn) => { const real = Date.now; Date.now = () => ms; try { return fn(); } finally { Date.now = real; } };
function botRun(def) {
  const track = buildBuiltin(def), sim = new Simulation(track), rec = new InputRecorder();
  sim.start();
  const bot = new Autopilot(track.path, { latLimit: 56 * 0.8 });
  bot.reset(sim.phys);
  for (let i = 0; i < 120 * 150; i++) {
    const inp = bot.control(sim.phys); inp.steer = quantSteer(inp.steer); rec.push(inp, false);
    const ev = sim.step(inp);
    if (sim.lost) sim.rewind();
    if (ev && ev.type === 'finish') return { inputs: rec.encode(), time: sim.logic.time, splits: sim.logic.splits.slice() };
  }
  throw new Error('pas d’arrivée : ' + def.id);
}

console.log('Dates et circuits');
test('la saison 1 commence le lundi 9 novembre 2026 à 00:00 UTC, comme dans supabase/etape11-saisons.sql ; une saison dure 7 jours', () => {
  assert.equal(new Date(SEASON_EPOCH).toISOString(), '2026-11-09T00:00:00.000Z');
  assert.equal(new Date(SEASON_EPOCH).getUTCDay(), 1, 'un lundi');
  const sql = readFileSync(new URL('../supabase/etape11-saisons.sql', import.meta.url), 'utf8');
  assert.equal((sql.match(/timestamptz '2026-11-09 00:00:00\+00'/g) || []).length, 3, 'la même origine en base (bornes et saison en cours)');
  assert.match(sql, /\/ 604800\)/); assert.equal(SEASON_MS, 604800 * 1000);
  assert.deepEqual([seasonOf(SEASON_EPOCH - 1), seasonOf(SEASON_EPOCH), seasonOf(SEASON_EPOCH + SEASON_MS - 1), seasonOf(SEASON_EPOCH + SEASON_MS)], [0, 1, 1, 2]);
  assert.deepEqual(seasonBounds(2), { starts: SEASON_EPOCH + SEASON_MS, ends: SEASON_EPOCH + 2 * SEASON_MS });
});
test('trois circuits distincts de la carrière par saison (jamais l’Atelier), les mêmes pour tout le monde, qui changent d’une saison à l’autre', () => {
  const seen = new Set();
  for (let n = 1; n <= 30; n++) {
    const t = seasonTracks(n);
    assert.equal(t.length, SEASON_TRACKS); assert.equal(new Set(t).size, SEASON_TRACKS);
    assert.ok(t.every((d) => BUILTIN_TRACKS.includes(d) && d.decor !== 'atelier'));
    assert.deepEqual(seasonTracks(n).map((d) => d.id), t.map((d) => d.id));
    seen.add(t.map((d) => d.id).join());
  }
  assert.ok(seen.size >= 28, 'les saisons varient');
  assert.equal(DIVISIONS.length, 6);
});

console.log('Catégorie de saison et serveur');
test('« sea-N » : une étiquette (numéro sans zéro en tête), le circuit n’est pas transformé ; elle se combine mal avec le reste, le serveur la veut seule', () => {
  assert.deepEqual(parseVariant('v1.sea-12'), { sea: '12' });
  for (const bad of ['v1.sea-0', 'v1.sea-012', 'v1.sea-x', 'v1.sea-12345']) assert.throws(() => parseVariant(bad), bad);
  assert.equal(formatVariant({ sea: 7 }), 'v1.sea-7');
  const def = seasonTracks(3)[0], track = buildBuiltin(def);
  assert.equal(applyVariant(track, { sea: '3' }), track, 'le même circuit');
  assert.equal(splitKey(variantKey(keyOf(def), { sea: '3' })).variant, 'v1.sea-3');
});
test('le serveur accepte la saison N pendant sa semaine (et 10 minutes après), sur ses circuits seulement ; avant, après, ou un autre circuit : refusé', () => {
  const n = 2, { starts, ends } = seasonBounds(n), def = seasonTracks(n)[0], key = `${keyOf(def)}~v1.sea-${n}`;
  const mid = starts + SEASON_MS / 2;
  assert.equal(at(mid, () => trackForKey(key)).season, n);
  assert.equal(at(ends + SEASON_GRACE_MS - 1000, () => trackForKey(key)).season, n, 'juste après minuit : encore acceptée');
  assert.throws(() => at(starts - 1000, () => trackForKey(key)), /pas encore commencé/);
  assert.throws(() => at(ends + SEASON_GRACE_MS + 1000, () => trackForKey(key)), /terminée/);
  const other = BUILTIN_TRACKS.find((d) => d.decor !== 'atelier' && !seasonTracks(n).includes(d));
  assert.throws(() => at(mid, () => trackForKey(`${keyOf(other)}~v1.sea-${n}`)), /ne fait pas partie de cette saison/);
  assert.throws(() => at(mid, () => trackForKey(`${key}.veh-moto`)), /Catégorie|saison/);
  assert.equal(seasonOpen(n, mid), ''); assert.match(seasonOpen(0, mid), /pas encore/);
});
test('une course de saison est vérifiée et rend ses temps intermédiaires (en pas, un par passage), comme une course officielle', () => {
  const n = 4, def = seasonTracks(n)[0], run = botRun(def), key = `${keyOf(def)}~v1.sea-${n}`;
  const res = at(seasonBounds(n).starts + 3600e3, () => verifyRun({ trackKey: key, inputs: run.inputs, time: run.time, physVer: PHYS_VER }));
  assert.equal(res.ok, true, res.error);
  assert.equal(res.season, n);
  assert.deepEqual(res.splits, run.splits);
  const off = verifyRun({ trackKey: keyOf(def), inputs: run.inputs, time: run.time, physVer: PHYS_VER });
  assert.equal(off.ok, true); assert.equal(off.season, undefined); assert.deepEqual(off.splits, run.splits);
});

test('backfill-sectors : rejoue les records sans temps intermédiaires, range leurs passages, signale une course qui ne se rejoue plus', async () => {
  const def = seasonTracks(5)[1], run = botRun(def), k = keyOf(def);
  let rows = [{ track_key: k, player: 'p1', time: run.time, inputs: run.inputs }, { track_key: k, player: 'p2', time: run.time + 1, inputs: run.inputs }, { track_key: 'u-xyz', player: 'p3', time: 9, inputs: 'A' }];
  const patches = [];
  const fetchImpl = async (url, init = {}) => {
    if (init.method === 'PATCH') { patches.push({ url, body: JSON.parse(init.body) }); rows = rows.filter((r) => !url.includes(`player=eq.${r.player}`)); return new Response(null, { status: 204 }); }
    const off = +/offset=(\d+)/.exec(url)[1];
    return new Response(JSON.stringify(rows.slice(off, off + 200)), { status: 200 });
  };
  const log = [], r = await backfillSectors({ url: 'https://x.test', key: 'service', fetchImpl, log: (m) => log.push(m) });
  assert.deepEqual([r.done, r.failed], [1, 1]);
  assert.equal(patches.length, 1); assert.deepEqual(patches[0].body, { splits: run.splits });
  assert.ok(log.some((m) => m.includes('✕') && m.includes('p2')), 'le temps qui ne correspond pas est signalé');
});

await finish('Tous les tests des saisons passent.');
