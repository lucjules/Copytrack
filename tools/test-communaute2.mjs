// Communauté 2 (E21) : client des fonctions de l'étape SQL 13 (commentaires, playlists, sélection, hasard, recommandations, statistiques, modes
// publiés) et correspondance règles d'un mode <-> catégorie de record : node tools/test-communaute2.mjs   (npm test)
// Les droits, le débit et la modération sont testés en base (tools/test-accounts-sql.sh, étape 13).
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { online } from '../js/online.js';
import * as C from '../js/online/community.js';
import { BUILTIN_MODES, sanitizeRules } from '../js/rules.js';
import { parseVariant, variantKey } from '../js/variants.js';
import { trackIdOf } from '../js/telemetry.js';

const ID = (n) => `00000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
// Remplace le réseau : chaque appel est noté ; reply(chemin, corps) donne la réponse.
async function withServer(reply, fn) {
  const orig = { _fetch: online._fetch, ensureSession: online.ensureSession, ensurePlayer: online.ensurePlayer };
  const calls = [];
  online.ensureSession = async () => {}; online.ensurePlayer = async () => {};
  online._fetch = async (path, init = {}) => { calls.push({ path: decodeURIComponent(path), body: init.body }); return reply(path, init.body); };
  try { await fn(calls); } finally { Object.assign(online, orig); }
}

console.log('Modes publiés : règles et catégorie de record');
test('les règles d’un mode deviennent une catégorie (son classement), et la catégorie redonne les mêmes règles', () => {
  for (const m of BUILTIN_MODES) {
    const r = sanitizeRules(m.rules);
    if (m.id === 'plomb') { assert.throws(() => C.modeVariant(r), /aucune catégorie/, 'gravité 150 % : pas de catégorie (130 ou 180)'); continue; }
    const v = C.modeVariant(r);
    const back = C.modeRulesOf(v);
    for (const k of ['g0', 'veh0', 'v0', 'offroad', 'laps', 'obstacles']) assert.equal(back[k], r[k], `${m.name} : ${k}`);
    if (v) assert.ok(variantKey('b-eclats-x1', parseVariant(v)).length <= 80);
  }
  assert.equal(C.modeVariant({}), '', 'sans règle de course : classement officiel');
  assert.equal(C.modeVariant({ sameCars: 1 }), '', 'l’apparence ne fait pas une catégorie');
  assert.equal(C.modeVariant({ g0: 40, veh0: 'moto', obstacles: 'off' }), 'v1.g-40.obs-0.veh-moto');
  assert.throws(() => C.modeVariant({ g0: 55 }), /aucune catégorie/, 'une gravité hors des catégories ne se publie pas');
  assert.deepEqual(C.modeRulesOf(''), {});
});
test('statistiques : un circuit de joueur a son identifiant (son empreinte), une catégorie n’en a pas', () => {
  assert.equal(trackIdOf('u-abc123'), 'u_abc123');
  assert.equal(trackIdOf('u-abc123~v1.g-40'), null);
});

console.log('Client');
await test('commentaires : liste, ajout (texte nettoyé, 280 caractères), suppression, signalement', async () => {
  await withServer((p) => (p.includes('track_comments_list') ? [{ id: 3, name: 'Ana', body: 'Bien', mine: false, can_delete: false }] : p.includes('comment_add') ? 12 : null), async (calls) => {
    assert.equal((await C.comments(ID(1)))[0].name, 'Ana');
    assert.deepEqual(calls[0].body, { t: ID(1), lim: 30, off: 0 });
    assert.equal(await C.addComment(ID(1), '  Super !  ', 'Moi'), 12);
    assert.deepEqual(calls[1].body, { t: ID(1), msg: 'Super !' });
    await assert.rejects(() => C.addComment(ID(1), '   ', 'Moi'), /1 à 280/);
    await assert.rejects(() => C.addComment(ID(1), 'x'.repeat(281), 'Moi'), /1 à 280/);
    await C.deleteComment(3); await C.reportComment(4);
    assert.deepEqual(calls.slice(-2).map((c) => [c.path, c.body]), [['/rest/v1/rpc/comment_delete', { c: 3 }], ['/rest/v1/rpc/comment_report', { c: 4 }]]);
  });
});
await test('playlists : enregistrement (identifiants filtrés, 50 au plus), circuits dans l’ordre de la playlist, les retirés disparaissent', async () => {
  await withServer((p) => (p.includes('playlist_save') ? 7 : p.includes('/tracks?') ? [{ id: ID(1), name: 'Un' }, { id: ID(3), name: 'Trois' }] : []), async (calls) => {
    assert.equal(await C.savePlaylist({ name: '  Ma liste ', tracks: [ID(3), 'pas-un-uuid', ID(1), ...Array(60).fill(ID(2))] }, 'Moi'), 7);
    assert.equal(calls[0].body.pname, 'Ma liste'); assert.equal(calls[0].body.pl, null); assert.equal(calls[0].body.items.length, 50);
    assert.ok(!calls[0].body.items.includes('pas-un-uuid'));
    const rows = await C.tracksByIds([ID(3), ID(2), ID(1), ID(3)]);
    assert.deepEqual(rows.map((r) => r.name), ['Trois', 'Un'], 'ordre de la playlist, le 2 a été retiré');
    assert.ok(calls[1].path.includes(`id=in.(${ID(3)},${ID(2)},${ID(1)})`));
    assert.deepEqual(await C.tracksByIds([]), []);
  });
});
await test('sélection, hasard, recommandations : les bonnes requêtes, les réponses remises en forme', async () => {
  await withServer((p) => {
    if (p.includes('random_track')) return ID(5);
    if (p.includes('recommended_tracks')) return [{ id: ID(2), score: 3 }, { id: ID(1), score: 1 }];
    if (p.includes('picked_at')) return [{ id: ID(9), name: 'Choisi' }];
    return [{ id: ID(1), name: 'Un' }, { id: ID(2), name: 'Deux' }, { id: ID(5), name: 'Cinq' }];
  }, async (calls) => {
    assert.equal((await C.picks())[0].name, 'Choisi');
    assert.ok(calls[0].path.includes('picked_at=not.is.null') && calls[0].path.includes('order=picked_at.desc'));
    assert.deepEqual((await C.recommended(5)).map((r) => r.name), ['Deux', 'Un'], 'dans l’ordre des recommandations');
    const r = await C.randomTrack([ID(7), 'x']);
    assert.ok(r && r.id); assert.deepEqual(calls.find((c) => c.path.includes('random_track')).body, { avoid: [ID(7)] });
  });
  await withServer(() => null, async () => { assert.equal(await C.randomTrack(), null, 'plus rien à proposer'); });
});
await test('statistiques de circuit : rien sous 5 pilotes ; sinon des nombres', async () => {
  await withServer(() => [{ players: '4', runs: 9 }], async () => { assert.equal(await C.trackStats('eclats', 26), null); });
  await withServer(() => [], async () => { assert.equal(await C.trackStats('eclats', 26), null); });
  await withServer(() => [{ players: 12, runs: 40, finishes: 30, finish_rate: 0.75, median_time: 41.5, top_time: 35.2, avg_respawns: 1.5, quit_progress: 0.4 }], async (calls) => {
    const s = await C.trackStats('u_abc', 26);
    assert.deepEqual(s, { players: 12, runs: 40, finishes: 30, finishRate: 0.75, median: 41.5, top: 35.2, respawns: 1.5, quitAt: 0.4 });
    assert.deepEqual(calls[0].body, { k: 'u_abc', pv: 26 });
  });
  assert.equal(await C.trackStats(null, 26), null);
});
await test('publier un mode : sa catégorie part avec lui ; des règles sans catégorie ne partent pas', async () => {
  await withServer(() => 4, async (calls) => {
    assert.equal(await C.publishMode({ name: 'Lune', desc: 'Léger', rules: { g0: 40 }, goal: { id: 'perfect', n: 2 } }, 'Moi'), 4);
    assert.deepEqual(calls[0].body, { mname: 'Lune', mdesc: 'Léger', mvariant: 'v1.g-40', mgoal: { id: 'perfect', n: 2 } });
    await assert.rejects(() => C.publishMode({ name: 'Bizarre', rules: { g0: 55 } }, 'Moi'), /aucune catégorie/);
    assert.equal(calls.length, 1);
  });
});

await finish('Tous les tests de la communauté 2 passent.');
