// Compatibilité avec ce que les joueurs ont déjà : node tools/test-compat.mjs   (npm test)
//
// Relit le corpus figé par tools/compat-gen.mjs (tools/compat/corpus.json) avec le code actuel : clés des classements, défis passés, codes de
// circuit de tous les formats, codes de partage, courses enregistrées (temps exact au pas près), réglages et fusion des sauvegardes.
// Un échec ici veut dire qu'un record, un code ou une sauvegarde d'un joueur ne se relirait plus pareil. Les champs AJOUTÉS (nouveaux réglages,
// nouveaux champs du profil) sont permis : on vérifie que tout ce qui existait est toujours là, avec la même valeur.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Track, hashString } from '../js/track.js';
import { dailyChallenge } from '../js/daily.js';
import { replayRun, verifyRun, trackForKey } from '../js/verify.js';
import { PHYS_VER } from '../js/version.js';
import { decodeGhost } from '../js/replay.js';
import { decodeCar } from '../js/custom.js';
import { sanitizeLoadout } from '../js/cosmetics.js';
import { decodeDeco } from '../js/customDeco.js';
import { decodeMode } from '../js/rules.js';
import { decodePack } from '../js/mods.js';
import { codeToClip } from '../js/prefabs.js';
import { mergeProfile, mergeSaves } from '../js/cloudsave.js';

const C = JSON.parse(readFileSync(new URL('./compat/corpus.json', import.meta.url), 'utf8'));
const plain = (o) => JSON.parse(JSON.stringify(o));

// expected ⊆ actual : chaque champ attendu existe avec la même valeur ; les tableaux gardent leur longueur ; les champs en plus sont permis.
export function assertSubset(actual, expected, path = '') {
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path} : tableau attendu`);
    assert.equal(actual.length, expected.length, `${path} : longueur`);
    expected.forEach((v, i) => assertSubset(actual[i], v, `${path}[${i}]`));
  } else if (expected && typeof expected === 'object') {
    assert.ok(actual && typeof actual === 'object', `${path} : objet attendu`);
    for (const k of Object.keys(expected)) assertSubset(actual[k], expected[k], path ? `${path}.${k}` : k);
  } else assert.equal(actual, expected, path || 'valeur');
}

const builtin = (id) => buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === id));
function trackOf(source, entry) {
  const [kind, id] = source.split(':');
  if (kind === 'builtin') return builtin(id);
  if (kind === 'daily') return dailyChallenge(id).track;
  if (kind === 'code') return Track.decode(entry.code);
  throw new Error('source inconnue ' + source);
}

console.log('Compatibilité (corpus figé)');

test('les clés de classement des circuits intégrés sont inchangées (aucun record perdu)', () => {
  const ids = new Set(BUILTIN_TRACKS.map((d) => d.id));
  for (const [id, key] of Object.entries(C.builtinKeys)) {
    assert.ok(ids.has(id), `circuit ${id} disparu`);
    assert.equal(`b-${id}-${hashString(builtin(id).encode())}`, key, `clé de ${id}`);
    assert.equal(trackForKey(key).kind, 'builtin', `le serveur reconnaît ${key}`);
  }
  assert.ok(Object.keys(C.builtinKeys).length >= 72);
});

test('les défis du jour passés se régénèrent à l’identique', () => {
  for (const d of C.daily) {
    const c = dailyChallenge(d.day);
    assert.equal(c.key, d.key, d.day);
    assert.equal(hashString(c.track.encode()), d.hash, `circuit du ${d.day}`);
  }
});

test('les codes de circuit de tous les formats se relisent (pièces, signature, clé, vérification)', () => {
  for (const e of C.codes) {
    const tr = Track.decode(e.code);
    assert.equal(tr.encode(), e.reencoded, `${e.label} : code réécrit`);
    assert.equal(tr.signature(), e.signature, `${e.label} : signature`);
    assert.equal(tr.userKey, e.userKey, `${e.label} : clé`);
    assert.deepEqual([tr.tiles.length, tr.decos.length, tr.laps, !!tr.verified], [e.tiles, e.decos, e.laps, e.verified], e.label);
    assert.equal(Track.decode(e.reencoded).encode(), e.reencoded, `${e.label} : relecture stable`);
  }
});

test('les courses enregistrées redonnent leur temps exact (rejeu du serveur)', () => {
  for (const r of C.runs) {
    const r2 = replayRun(trackOf(r.source, r), r.inputs);
    assert.ok(r2, `${r.label} : la course ne va plus jusqu'à l'arrivée`);
    assert.equal(r2.time, r.time, r.label);
  }
});

test('un record d’un circuit intégré est toujours accepté par la vérification', () => {
  const r = C.runs.find((x) => x.source === 'builtin:eclats');
  const v = verifyRun({ trackKey: C.builtinKeys.eclats, inputs: r.inputs, time: r.time, physVer: PHYS_VER });
  assert.equal(v.ok, true, v.error);
});

test('les codes de partage se relisent (fantôme, voiture, pièce, mode, paquet, prefab)', () => {
  const S = C.share;
  assertSubset(decodeGhost(S.ghost.code), S.ghost.decoded, 'SHG1');
  assertSubset(plain(sanitizeLoadout(decodeCar(S.car.code))), S.car.decoded, 'SHC1');
  assertSubset(plain(decodeDeco(S.deco.code)), S.deco.decoded, 'SHD1');
  assertSubset(plain(decodeMode(S.mode.code)), S.mode.decoded, 'SHM1');
  assertSubset(plain(decodePack(S.pack.code)), S.pack.decoded, 'SHX1');
  const { name, clip } = codeToClip(S.prefab.code);
  assertSubset({ name, w: clip.w, h: clip.h, tiles: clip.tiles.length, decos: clip.decos.length }, S.prefab.decoded, 'SHP1');
});

test('d’anciens réglages se relisent avec leurs valeurs', async () => {
  const m = new Map([['shardway.settings', JSON.stringify(C.settings.saved)]]);
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: () => null, length: 0 };
  const { loadSettings } = await import('../js/storage.js');
  assertSubset(plain(loadSettings()), C.settings.saved, 'réglages');
});

test('la fusion des sauvegardes (profil, records, circuits) donne le même résultat', () => {
  const M = C.merge;
  assertSubset(plain(mergeProfile(M.profileA, M.profileB)), M.profile, 'profil');
  assertSubset(plain(mergeSaves(M.saveA, M.saveB)), M.save, 'sauvegarde');
});

test('le corpus lui-même est cohérent (garde-fou contre une régénération ratée)', () => {
  assert.ok(C.codes.some((e) => e.code.startsWith('SHW1:')) && C.codes.some((e) => e.code.startsWith('SHW2:')));
  assert.ok(C.codes.some((e) => e.verified), 'un circuit vérifié');
  assert.ok(C.runs.some((r) => r.source.startsWith('daily:')) && C.runs.some((r) => r.source === 'code'));
  assert.ok(C.runs.every((r) => r.time > 5 && r.inputs.length > 100));
});

await finish('Tous les tests de compatibilité passent.');
