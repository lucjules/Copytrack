// Corpus de compatibilité (Copytrack Evolution, étape E0) : node tools/compat-gen.mjs --update
//
// Fige ce que les joueurs ont déjà entre les mains et qui ne doit JAMAIS changer sans le vouloir : les clés des classements des 72 circuits,
// les défis du jour passés, les codes de circuit (anciens formats SHW1 / SHW2 compris), les codes de partage (fantôme, voiture, pièce,
// mode, paquet, prefab), des commandes enregistrées avec leur temps exact, la lecture des réglages et la fusion des sauvegardes.
// tools/test-compat.mjs relit ce corpus avec le code actuel (npm test). Le fichier n'est réécrit qu'avec --update : à ne faire que pour
// un changement VOULU, en sachant ce qu'il casse chez les joueurs (et en le disant dans le CHANGELOG).
import { writeFileSync, mkdirSync } from 'node:fs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Track, hashString, b64encode, b64decode } from '../js/track.js';
import { dailyChallenge } from '../js/daily.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { InputRecorder, quantSteer, encodeGhost, decodeGhost } from '../js/replay.js';
import { replayRun } from '../js/verify.js';
import { DT } from '../js/constants.js';
import { CAR } from '../js/physics/specs.js';
import { DEFAULT_LOADOUT, sanitizeLoadout } from '../js/cosmetics.js';
import { encodeCar, decodeCar, newPart } from '../js/custom.js';
import { encodeDeco, decodeDeco } from '../js/customDeco.js';
import { encodeMode, decodeMode, BUILTIN_MODES } from '../js/rules.js';
import { encodePack, decodePack } from '../js/mods.js';
import { clipFromTrack, clipToCode, codeToClip } from '../js/prefabs.js';
import { mergeProfile, mergeSaves } from '../js/cloudsave.js';

export const CORPUS = new URL('./compat/corpus.json', import.meta.url);
const plain = (o) => JSON.parse(JSON.stringify(o));

// ---- Circuits ------------------------------------------------------------------------------------------------------------------------
const builtinKey = (d) => `b-${d.id}-${hashString(buildBuiltin(d).encode())}`;
const DAILY_DAYS = ['2025-01-01', '2025-06-15', '2026-02-28', '2026-07-14', '2026-11-01', '2026-11-07'];

// Un circuit intégré, exporté comme le ferait l'éditeur (code joueur).
const asUser = (id) => Track.decode(buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === id)).encode());

// Codes aux anciens formats : SHW1 (5 nombres par pièce), SHW2 (6 : + revêtement). Construits à partir d'un circuit simple.
function legacyCode(id, stride, prefix) {
  const data = JSON.parse(b64decode(buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === id)).encode().slice(5)));
  const t = [];
  for (let i = 0; i < data.t.length; i += 8) t.push(...data.t.slice(i, i + stride));
  const out = { n: data.n, d: data.d, t };
  if (stride === 6) out.v = 2;
  return prefix + b64encode(JSON.stringify(out));
}

// Un circuit de joueur qui utilise tout ce qu'un code peut porter : règles, ambiance, déclencheurs, couleurs, décorations perso, tours, vérification.
function richTrack() {
  const tr = asUser('lagon');
  tr.name = 'Corpus — tout';
  tr.author = 'Compat';
  tr.laps = 2;
  tr.setParams({
    desc: 'Circuit du corpus de compatibilité',
    ambiance: { sky: 'night', fog: 'misty', music: 'menu', weather: 'rain', sunAz: 120, tint: '#336699', gtint: '#224411', fogC: '#112233', cycle: 'slow' },
    scripts: [{ x: 0, z: 0, a: 'msg', v: 'Bonjour !' }, { x: 1, z: 0, a: 'burst', v: '#ff00aa' }, { x: 2, z: 0, a: 'sound', v: 'ding' }],
    offroad: 1, v0: 60, g0: 80, veh0: 'moto',
  });
  tr.tiles[0].col = { road: '#ff5a5f', line: '#ffffff' };
  tr.tiles[1].th = 1;
  tr.addDeco({ k: 'tree', x: 4, y: 0, z: 4, ry: 0.5, s: 1.2, c: 2, cc: '#00ff88' });
  tr.addDeco({ k: 'custom', x: 8, y: 0, z: 8, ry: 0, s: 1, c: 0, cc: '#ffd23e', ph: 0, cp: [{ s: 'box', x: 0, y: 1, z: 0, sx: 1, sy: 0.5, sz: 1, ry: 0, c: '#ff00ff' }, { s: 'ring', x: 0, y: 2, z: 0, sx: 0.5, sy: 0.5, sz: 0.5, ry: 45, c: '#00ffff' }] });
  tr.vt = 42.5; tr.vh = tr.signature();
  return tr;
}

// Gravité inversée au départ (règle v4 seule : force le format 4 sans aucun champ de pièce).
function flipTrack() {
  const tr = asUser('eclats');
  tr.name = 'Corpus — plafond';
  tr.setParams({ flip0: true });
  return tr;
}

function trackEntry(label, code) {
  const tr = Track.decode(code);
  return { label, code, reencoded: tr.encode(), signature: tr.signature(), userKey: tr.userKey, tiles: tr.tiles.length, decos: tr.decos.length, laps: tr.laps, verified: !!tr.verified };
}

// ---- Courses enregistrées ----------------------------------------------------------------------------------------------------------
// Le pilote automatique conduit ; ses commandes sont arrondies et enregistrées exactement comme en course (race.js), retour au checkpoint
// compris (respawnAt : pas où le joueur appuie sur R). Le temps est celui que le serveur retrouve en rejouant (replayRun).
function recordRun(track, { respawnAt = -1, maxTime = 240, bot: botOpts = {} } = {}) {
  const sim = new Simulation(track);
  sim.start();
  const bot = new Autopilot(track.path, botOpts);
  bot.reset(sim.phys);
  const rec = new InputRecorder();
  for (let k = 0; k < Math.round(maxTime / DT); k++) {
    const inp = bot.control(sim.phys);
    inp.steer = quantSteer(inp.steer);
    const respawn = k === respawnAt;
    rec.push(inp, respawn);
    if (respawn) { sim.rewind(); bot.reset(sim.phys); }
    const ev = sim.step(inp);
    if (sim.lost) { sim.rewind(); bot.reset(sim.phys); }
    if (ev && ev.type === 'finish') return { inputs: rec.encode(), time: sim.logic.time, steps: rec.length };
  }
  throw new Error('Le pilote automatique n\'a pas fini ' + track.name);
}

function runEntry(label, source, track, opts) {
  const r = recordRun(track, opts);
  const back = replayRun(track, r.inputs);
  if (!back || back.time !== r.time) throw new Error(`${label} : le rejeu ne redonne pas le temps (${back && back.time} ≠ ${r.time})`);
  return { label, source, ...r };
}

// ---- Codes de partage --------------------------------------------------------------------------------------------------------------
function shareCodes(user) {
  const car = sanitizeLoadout({ ...DEFAULT_LOADOUT, body: 'rally', color: '#1d4fb8', led: 'pulse', custom: { parts: [newPart('cone'), { ...newPart('box'), m: 1, x: 0.6 }], paint: { grad: true, pat: 'hex', text: 'COMPAT', num: '42', plate: 'CT-0001' }, fx: { engine: 'saw', pitch: 1.2 } } });
  const decoParts = [{ s: 'cyl', x: 0, y: 1, z: 0, sx: 0.5, sy: 2, sz: 0.5, ry: 0, c: '#ffaa00' }];
  const mode = { name: 'Corpus', desc: 'Mode figé', rules: { g0: 70, veh0: 'boat', laps: 3, obstacles: 'off' }, goal: { id: 'norespawn' } };
  const pack = { name: 'Paquet corpus', car, ui: { theme: 'sunset' }, cameras: [{ name: 'Basse', dist: 5, height: 1.2, fov: 80, look: 0.5, tilt: 0 }], parts: [{ name: 'Pilier', parts: decoParts }], modes: [BUILTIN_MODES[0], mode] };
  const ghost = encodeGhost({ trackKey: 'b-eclats-xyz', time: 21.3333, name: 'Zoé', inputs: user.inputs });
  const prefabSrc = asUser('eclats');
  const clip = clipFromTrack(prefabSrc);
  clip.tiles = clip.tiles.slice(0, 6);
  const prefab = clipToCode(clip, 'Corpus prefab');
  const car1 = encodeCar(car), deco = encodeDeco('Pilier', decoParts), mode1 = encodeMode(mode), pack1 = encodePack(pack);
  return {
    ghost: { code: ghost, decoded: decodeGhost(ghost) },
    car: { code: car1, decoded: sanitizeLoadout(decodeCar(car1)) },
    deco: { code: deco, decoded: decodeDeco(deco) },
    mode: { code: mode1, decoded: decodeMode(mode1) },
    pack: { code: pack1, decoded: decodePack(pack1) },
    prefab: { code: prefab, decoded: (({ name, clip: c }) => ({ name, w: c.w, h: c.h, tiles: c.tiles.length, decos: c.decos.length }))(codeToClip(prefab)) },
  };
}

// ---- Sauvegardes -------------------------------------------------------------------------------------------------------------------
const OLD_SETTINGS = { volume: 0.4, quality: 'high', camera: 2, playerName: 'Zoé', keys: { up: 'KeyW' }, pad: { a: 0 }, ghost: false, uiScale: 1.2, feel: 0.5 };
const PROFILE_A = { id: 'ABCDE-FGHJK', coins: 500, owned: { 'body:sport': 1 }, loadout: { ...DEFAULT_LOADOUT, body: 'sport' }, presets: [null, null, null], medals: { 'b-eclats-x': 1, 'b-canyon-y': 2 }, stats: { races: 10, earned: 300, turbos: 4 }, eggs: { e1: 1 }, shards: {}, academy: { l1: 1 }, dailyDays: ['2026-11-01'], titlesSeen: ['rookie'] };
const PROFILE_B = { id: 'ZZZZZ-ZZZZZ', coins: 200, owned: { 'led:cyan': 1 }, presets: [null, null, null], medals: { 'b-eclats-x': 0, 'b-lagon-z': 3 }, stats: { races: 14, earned: 250 }, eggs: {}, shards: { s1: 1 }, collections: { c1: 1 }, dailyDays: ['2026-10-30', '2026-11-01'] };
const SAVE_A = { profile: PROFILE_A, 'rec3.b-eclats-x': { time: 21.5, pv: 26, date: 1000 }, tracks: [{ id: 't1', updated: 5, name: 'Mine' }], tracksDel: {}, 'daily.2026-11-01': { time: 30 } };
const SAVE_B = { profile: PROFILE_B, 'rec3.b-eclats-x': { time: 21.2, pv: 26, date: 900 }, 'rec3.b-lagon-z': { time: 22, pv: 25, date: 800 }, tracks: [{ id: 't1', updated: 3 }, { id: 't2', updated: 9 }], tracksDel: { t2: 10 } };

export function generate() {
  const builtinKeys = Object.fromEntries(BUILTIN_TRACKS.map((d) => [d.id, builtinKey(d)]));
  const daily = DAILY_DAYS.map((day) => { const c = dailyChallenge(day); return { day, key: c.key, hash: hashString(c.track.encode()) }; });
  const codes = [
    trackEntry('SHW1 (format 1.0)', legacyCode('eclats', 5, 'SHW1:')),
    trackEntry('SHW2 (format 1.1, revêtements)', legacyCode('verglas', 6, 'SHW2:')),
    trackEntry('SHW3 v3 (circuit intégré exporté)', asUser('canyon').encode()),
    trackEntry('SHW3 v3 (pièces mobiles et obstacles)', asUser('grandatelier').encode()),
    trackEntry('SHW3 v4 (tout)', richTrack().encode()),
    trackEntry('SHW3 v4 (gravité inversée au départ)', flipTrack().encode()),
    trackEntry('Lien de partage', 'https://exemple.test/#t=' + encodeURIComponent(asUser('spirale').encode())),
  ];
  const eclats = buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === 'eclats'));
  const runs = [
    runEntry('éclats (pilote automatique)', 'builtin:eclats', eclats),
    runEntry('éclats avec retour au checkpoint', 'builtin:eclats', eclats, { respawnAt: 900 }),
    runEntry('lagon (bateau)', 'builtin:lagon', buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === 'lagon'))),
    runEntry('défi du 2026-02-28', 'daily:2026-02-28', dailyChallenge('2026-02-28').track, { bot: { latLimit: CAR.latGrip * 0.8, brakeDecel: 36 } }),      // réglages du contrôle des défis (daily.js)
  ];
  // Le même circuit, exporté en code joueur : mêmes pièces, donc mêmes commandes et même temps.
  const user = { ...runs[0], label: 'éclats exporté en code joueur', source: 'code', code: asUser('eclats').encode() };
  if (replayRun(Track.decode(user.code), user.inputs).time !== user.time) throw new Error('Le code joueur ne redonne pas le temps du circuit intégré');
  runs.push(user);
  return {
    note: 'Corpus figé par tools/compat-gen.mjs --update ; vérifié par tools/test-compat.mjs. Ne pas modifier à la main.',
    builtinKeys, daily, codes, runs, share: plain(shareCodes(user)),
    settings: { saved: OLD_SETTINGS },
    merge: { profileA: PROFILE_A, profileB: PROFILE_B, profile: plain(mergeProfile(PROFILE_A, PROFILE_B)), saveA: SAVE_A, saveB: SAVE_B, save: plain(mergeSaves(SAVE_A, SAVE_B)) },
  };
}

if (process.argv[1] && process.argv[1].endsWith('compat-gen.mjs')) {
  if (!process.argv.includes('--update')) {
    console.log('Le corpus se fige avec --update (changement voulu seulement) ; npm test le vérifie (tools/test-compat.mjs).');
  } else {
    const c = generate();
    mkdirSync(new URL('./compat/', import.meta.url), { recursive: true });
    writeFileSync(CORPUS, JSON.stringify(c, null, 1) + '\n');
    console.log(`compat/corpus.json écrit : ${Object.keys(c.builtinKeys).length} clés, ${c.daily.length} défis, ${c.codes.length} codes, ${c.runs.length} courses.`);
  }
}
