// Récompenses (0.9.18) : titres, exclusifs du garage, collections ; fusion des sauvegardes ; client en ligne (tendances, titres). node tools/test-recompenses.mjs   (npm test)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';
import { TITLES, EXCLUSIVES, COLLECTIONS, COLLECTION_COINS, collectionProgress, emptyContext, earnedTitles, grantRewards, noteRace, chooseTitle, titleLabel } from '../js/rewards.js';
import { CATALOG, CATEGORIES, exclusiveOf, itemsOf, sanitizeLoadout, DEFAULT_LOADOUT, PRESETS } from '../js/cosmetics.js';
import { profile, saveProfile, owns, missingItems, buy } from '../js/profile.js';
import { mergeProfile } from '../js/cloudsave.js';
import { online } from '../js/online.js';

const reset = () => { const p = profile(); p.owned = {}; p.coins = 0; p.collections = {}; p.titlesSeen = []; p.title = ''; p.dailyDays = []; p.stats = { races: 0, earned: 0 }; saveProfile(); return p; };
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

console.log('Données');
test('titres : identifiants valides et uniques, libellés et conditions ; la liste blanche SQL (étape 8) est exactement la même', () => {
  assert.equal(new Set(TITLES.map((t) => t.id)).size, TITLES.length);
  for (const t of TITLES) { assert.match(t.id, /^[a-z0-9-]{1,20}$/); assert.ok(t.label && t.how && typeof t.test === 'function', t.id); }
  const sql = read('supabase/etape8-decouverte.sql');
  const list = /<> all \(array\[([^\]]+)\]\)/.exec(sql)[1].split(',').map((x) => x.trim().replace(/'/g, ''));
  assert.deepEqual(list, TITLES.map((t) => t.id), 'js/rewards.js et set_title doivent avoir la même liste, dans le même ordre');
  assert.equal(titleLabel('inconnu'), ''); assert.equal(titleLabel('<img>'), ''); assert.equal(titleLabel(''), '');
});
test('exclusifs : chacun existe dans le catalogue, est marqué exclusif (avec son « comment »), gratuit à l\'achat et uniquement de couleur (aucun modèle 3D à écrire)', () => {
  for (const e of EXCLUSIVES) {
    const it = CATALOG[e.cat].find((x) => x.id === e.id);
    assert.ok(it, e.cat + ':' + e.id); assert.ok(it.exclusive && it.exclusive.length > 10); assert.equal(it.cost, 0); assert.match(it.color, /^#[0-9a-f]{6}$/i);
    assert.equal(exclusiveOf(e.cat, e.id), it.exclusive);
  }
  assert.equal(exclusiveOf('body', 'sport'), ''); assert.equal(exclusiveOf('x', 'y'), '');
  assert.equal(EXCLUSIVES.length, CATALOG.trail.concat(CATALOG.led).filter((x) => x.exclusive).length, 'aucun exclusif oublié dans EXCLUSIVES');
  for (const pr of PRESETS) assert.ok(!itemsOf(pr.loadout).some(([c, id]) => exclusiveOf(c, id)), 'un preset ne doit pas dépendre d\'un exclusif : ' + pr.id);
});
test('collections : quatre éléments existants, sans doublon, de catégories différentes ; catégorie « collections » dans le garage', () => {
  assert.ok(CATEGORIES.some((c) => c.id === 'collections'));
  assert.equal(new Set(COLLECTIONS.map((c) => c.id)).size, COLLECTIONS.length);
  for (const col of COLLECTIONS) {
    assert.equal(col.items.length, 4, col.id);
    assert.equal(new Set(col.items.map(([c]) => c)).size, 4, col.id + ' : une catégorie de chaque');
    for (const [c, id] of col.items) { const it = CATALOG[c].find((x) => x.id === id); assert.ok(it, col.id + ' ' + c + ':' + id); assert.ok(it.cost > 0 && !it.exclusive, 'payant et ordinaire : ' + c + ':' + id); }
  }
});

console.log('Règles');
test('un exclusif ne s\'achète pas, même gratuit ; il se mérite, puis il est à toi (et se rééquipe)', () => {
  const p = reset(); p.coins = 5000; saveProfile();
  assert.equal(owns('trail', 'gold'), false); assert.equal(owns('trail', 'comet'), false); assert.equal(owns('body', 'buggy'), true, 'les gratuits ordinaires restent à tous');
  const draft = sanitizeLoadout({ ...DEFAULT_LOADOUT, trail: 'gold' });
  assert.equal(draft.trail, 'gold');
  const miss = missingItems(draft);
  assert.deepEqual(miss, [['trail', 'gold']], 'l\'exclusif apparaît comme « à débloquer »');
  assert.equal(buy(miss), false); assert.equal(profile().coins, 5000, 'aucune pièce dépensée'); assert.equal(owns('trail', 'gold'), false);
  const r = grantRewards({ ...emptyContext(), dailyDays: 7 });
  assert.deepEqual(r.exclusives.map((e) => e.id), ['gold']);
  assert.equal(owns('trail', 'gold'), true); assert.deepEqual(missingItems(draft), []);
});
test('chaque exploit donne son exclusif, une seule fois ; rien n\'est retiré si le compteur redescend', () => {
  reset();
  const ctx = { ...emptyContext(), atelierMedals: 6, academy: 6 };
  assert.deepEqual(grantRewards(ctx).exclusives.map((e) => e.id).sort(), ['emerald', 'sunset']);
  assert.deepEqual(grantRewards(ctx).exclusives, [], 'déjà reçus');
  assert.deepEqual(grantRewards(emptyContext()).exclusives, []); assert.ok(owns('led', 'emerald') && owns('led', 'sunset'));
  assert.deepEqual(grantRewards({ ...emptyContext(), atelierMedals: 5 }).exclusives, [], 'pas assez');
});
test('collection complète : +100 ◆ UNE fois ; incomplète : rien', () => {
  const p = reset();
  const col = COLLECTIONS[0];
  for (const [c, id] of col.items.slice(0, 3)) p.owned[c + ':' + id] = 1;
  assert.deepEqual(collectionProgress(col), { have: 3, total: 4, done: false });
  assert.deepEqual(grantRewards(emptyContext()).collections, []); assert.equal(profile().coins, 0);
  const [c4, id4] = col.items[3]; p.owned[c4 + ':' + id4] = 1;
  const r = grantRewards(emptyContext());
  assert.deepEqual(r.collections.map((x) => [x.id, x.coins]), [[col.id, COLLECTION_COINS]]); assert.equal(profile().coins, COLLECTION_COINS);
  assert.deepEqual(grantRewards(emptyContext()).collections, []); assert.equal(profile().coins, COLLECTION_COINS, 'pas deux fois');
  p.owned = {}; assert.deepEqual(grantRewards(emptyContext()).collections, [], 'rien de plus si les objets disparaissent (sauvegarde restaurée…)'); assert.equal(profile().coins, COLLECTION_COINS);
});
test('titres : calculés d\'après les compteurs, annoncés une fois, jamais deux ; le titre choisi doit être mérité, et un titre qui ne l\'est plus s\'efface', () => {
  reset();
  assert.deepEqual(earnedTitles(emptyContext()), []);
  const ctx = { ...emptyContext(), academy: 6, races: 250, dailyDays: 7, crystals: 20, coreMedals: 66, atelierMedals: 6, totalTracks: 72, turbos: 100 };
  assert.deepEqual(earnedTitles(ctx).sort(), ['cristallin', 'derapeur', 'diplome', 'fidele', 'globetrotter', 'mecano', 'veteran'].sort());
  assert.ok(!earnedTitles(ctx).includes('legende') && !earnedTitles(ctx).includes('collectionneur'));
  assert.ok(earnedTitles({ ...ctx, crystals: 72 }).includes('legende'));
  const r1 = grantRewards(ctx); assert.equal(r1.titles.length, 7);
  assert.deepEqual(grantRewards(ctx).titles, [], 'annoncés une seule fois');
  assert.equal(chooseTitle('veteran', ctx), true); assert.equal(profile().title, 'veteran');
  assert.equal(chooseTitle('legende', ctx), false); assert.equal(profile().title, 'veteran', 'refusé : pas mérité');
  assert.equal(chooseTitle('', ctx), true); assert.equal(profile().title, '');
  chooseTitle('veteran', ctx); grantRewards({ ...ctx, races: 10 });
  assert.equal(profile().title, '', 'le titre n\'est plus mérité : retiré');
  // Deux collections complètes → « Collectionneur »
  const p = profile(); p.collections = { neon: 1, feu: 1 }; saveProfile();
  assert.ok(grantRewards({ ...emptyContext() }).titles.includes('collectionneur'));
});
test('compteurs de course : mini-turbos cumulés, jours de défi du jour uniques et bien formés', () => {
  const p = reset();
  noteRace({ turbos: 3 }); noteRace({ turbos: 0 }); noteRace({ turbos: -4 }); noteRace({ turbos: 2 });
  assert.equal(p.stats.turbos, 5);
  noteRace({ dailyDay: '2026-11-07' }); noteRace({ dailyDay: '2026-11-07' }); noteRace({ dailyDay: '2026-11-05' }); noteRace({ dailyDay: 'pas-une-date' }); noteRace({ dailyDay: '' });
  assert.deepEqual(p.dailyDays, ['2026-11-05', '2026-11-07']);
});

console.log('Sauvegarde cloud');
test('fusion de deux appareils : leçons, collections, jours de défi et titres vus se réunissent ; le compteur de mini-turbos prend le plus grand', () => {
  const a = { id: 'A', coins: 10, owned: {}, medals: {}, stats: { races: 3, earned: 5, turbos: 40 }, academy: { prise: 1 }, collections: { neon: 1 }, dailyDays: ['2026-11-01', '2026-11-03'], titlesSeen: ['diplome'], loadout: {} };
  const b = { id: 'B', coins: 20, owned: {}, medals: {}, stats: { races: 9, earned: 7, turbos: 90 }, academy: { derapage: 1 }, collections: { feu: 1 }, dailyDays: ['2026-11-03', '2026-11-04', 'n/importe quoi'], titlesSeen: ['veteran'] };
  const m = mergeProfile(a, b);
  assert.deepEqual(Object.keys(m.academy).sort(), ['derapage', 'prise']); assert.deepEqual(Object.keys(m.collections).sort(), ['feu', 'neon']);
  assert.deepEqual(m.dailyDays, ['2026-11-01', '2026-11-03', '2026-11-04']); assert.deepEqual(m.titlesSeen.sort(), ['diplome', 'veteran']);
  assert.equal(m.stats.turbos, 90); assert.equal(m.stats.races, 9);
  assert.deepEqual(mergeProfile({}, b).academy, { derapage: 1 });
});

console.log('Client en ligne');
await test('tendances : l\'ordre du classement est gardé, les circuits retirés ignorés ; fonction absente : null (le jeu retombe sur « plus joués »)', async () => {
  const orig = online._fetch, ID = (n) => `00000000-0000-0000-0000-00000000000${n}`;
  const calls = [];
  try {
    online._fetch = async (path, init) => {
      calls.push([path, init && init.body]);
      if (path.includes('rpc/trending_tracks')) return [{ id: ID(2), week_players: 9 }, { id: ID(1), week_players: '4' }, { id: ID(3), week_players: 2 }, { id: 'pas-un-uuid', week_players: 1 }];
      return [{ id: ID(1), name: 'Un' }, { id: ID(2), name: 'Deux' }];       // le 3 a été masqué depuis
    };
    const rows = await online.trending({ days: 7, limit: 24, offset: 24 });
    assert.deepEqual(rows.map((r) => [r.name, r.week_players]), [['Deux', 9], ['Un', 4]]);
    assert.deepEqual(calls[0][1], { days: 7, lim: 24, off: 24 });
    const url = decodeURIComponent(calls[1][0]);
    assert.ok(url.includes('id=in.(' + ID(2) + ',' + ID(1) + ',' + ID(3) + ')') && !url.includes('pas-un-uuid'), 'identifiants filtrés : ' + url);
    online._fetch = async () => []; assert.deepEqual(await online.trending(), []);
    const err = Object.assign(new Error('Could not find the function public.trending_tracks'), { code: 'http' });
    online._fetch = async () => { throw err; }; assert.equal(await online.trending(), null);
    online._fetch = async () => { throw Object.assign(new Error('réseau'), { code: 'network' }); };
    await assert.rejects(() => online.trending(), /réseau/);
  } finally { online._fetch = orig; }
});
await test('titre : set_title est appelé avec l\'identifiant (ou vide)', async () => {
  const orig = { _fetch: online._fetch, ensureSession: online.ensureSession }; let seen;
  try {
    online.ensureSession = async () => {}; online._fetch = async (p, i) => { seen = [p, i.body]; };
    await online.setTitle('veteran'); assert.deepEqual(seen, ['/rest/v1/rpc/set_title', { t: 'veteran' }]);
    await online.setTitle(''); assert.deepEqual(seen[1], { t: '' }); await online.setTitle(null); assert.deepEqual(seen[1], { t: '' });
  } finally { Object.assign(online, orig); }
});
await test('classement : la lecture essaie la requête complète (titre, fantôme), puis des plus simples quand les colonnes récentes manquent', async () => {
  const orig = { _fetch: online._fetch, _count: online._count }; const sel = [];
  try {
    online._count = async () => 1;
    online._fetch = async (path) => { const s = new URLSearchParams(path.split('?')[1]).get('select'); sel.push(s); if (s.includes('title') || s.includes('has_ghost')) throw new Error('column does not exist'); return [{ time: 20, player: 'p' }]; };
    const lb = await online.leaderboard('b-x-1', 26, 10);
    assert.equal(sel.length, 3); assert.ok(sel[0].includes('title') && sel[0].includes('has_ghost')); assert.ok(sel[1].includes('has_ghost') && !sel[1].includes('title')); assert.ok(!sel[2].includes('has_ghost'));
    assert.equal(lb.top.length, 1);
    online._fetch = async () => { throw new Error('hors ligne'); };
    await assert.rejects(() => online.leaderboard('b-x-1', 26, 10), /hors ligne/);
  } finally { Object.assign(online, orig); }
});

await finish('Tous les tests des récompenses passent.');
