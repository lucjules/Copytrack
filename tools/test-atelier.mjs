// Chapitre bonus « Atelier des mécanismes » (0.9.15) : chaque obstacle et chaque pièce mobile, un par un, dans six circuits que le pilote automatique franchit sans choc ;
// ouverture du chapitre, enchaînement de la carrière, défi du jour inchangé. node tools/test-atelier.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { CHAPTERS, CHAPTER_SIZE, UNLOCK_MEDALS, chapterUnlocked, prerequisiteOf, nextBuiltinIndex, PROFILS } from '../js/career.js';
import { DECORS, DAILY_DECORS, CAREER_ORDER } from '../js/themes.js';
import { OBST } from '../js/obstacles.js';
import { dailyChallenge } from '../js/daily.js';
import { Track } from '../js/track.js';
import { runTrack } from './lab.mjs';
import { clampMover } from '../js/pieces.js';

const atelier = BUILTIN_TRACKS.filter((d) => d.decor === 'atelier');
const IDX = BUILTIN_TRACKS.findIndex((d) => d.decor === 'atelier');
const mecaOf = (d) => new Set(d.meca);

console.log('Contenu');
test('six circuits dans le décor « atelier », en dernier de la liste, tous du profil « mécanisme »', () => {
  assert.equal(atelier.length, CHAPTER_SIZE);
  assert.equal(IDX, 66, 'ils suivent les 66 circuits d\'origine : aucun numéro de circuit existant ne bouge');
  assert.deepEqual(atelier.map((d) => d.id), ['garde', 'cadence', 'pendule', 'rotors', 'montecharge', 'grandatelier']);
  for (const d of atelier) { assert.equal(d.profil, 'atelier'); assert.ok(PROFILS[d.profil].label); assert.ok(d.meca && d.meca.length, d.id); }
  assert.equal(CHAPTERS[11].decor, 'atelier'); assert.equal(CAREER_ORDER[11], 'atelier'); assert.ok(DECORS.atelier);
});
test('tous les obstacles du jeu (sept) et l\'ascenseur et la glissière sont enseignés, un ou deux nouveaux à chaque circuit, le dernier les réunit', () => {
  const seen = new Set(), fresh = [];
  for (const d of atelier) { const n = [...mecaOf(d)].filter((m) => !seen.has(m)); fresh.push(n.length); for (const m of d.meca) seen.add(m); }
  assert.deepEqual([...seen].sort(), [...Object.keys(OBST), 'lift', 'slide'].sort(), 'rien ne manque, rien d\'inconnu');
  assert.ok(fresh.slice(0, 5).every((n) => n >= 1 && n <= 2), 'un ou deux mécanismes nouveaux par circuit : ' + fresh);
  assert.equal(fresh[5], 0, 'le dernier circuit ne montre rien de nouveau : il réunit');
});
test('les mécanismes déclarés sont bien dans le circuit construit (obstacles posés, pièces mobiles réglées, codes de partage relus à l\'identique)', () => {
  for (const d of atelier) {
    const tr = buildBuiltin(d);
    for (const m of d.meca) assert.ok(m === 'lift' ? tr.tiles.some((t) => t.mv === 1) : m === 'slide' ? tr.tiles.some((t) => t.mv === 2) : tr.decos.some((o) => o.k === m), d.id + ' : ' + m);
    const back = Track.decode(tr.encode());
    assert.equal(back.signature(), tr.signature(), d.id);
    assert.deepEqual(back.tiles.filter((t) => t.mv).map((t) => [t.mv, t.ms, t.ma]), tr.tiles.filter((t) => t.mv).map((t) => [t.mv, t.ms, t.ma]), d.id + ' : pièces mobiles');
  }
  const mc = buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === 'montecharge'));
  const lift = mc.tiles.filter((t) => t.mv === 1), slide = mc.tiles.filter((t) => t.mv === 2);
  assert.equal(lift.length, 2, 'S2~ : deux dalles d\'ascenseur'); assert.equal(slide.length, 2, 'S2= : deux dalles de glissière');
  assert.deepEqual([lift[0].ms, lift[0].ma, slide[0].ms, slide[0].ma], [0, 1, 0, 0], 'vitesse 100 % = valeur par défaut (0) ; ascenseur d\'1 niveau (le défaut est 2) ; glissière d\'1 case = défaut (0)');
});
test('des obstacles sont posés SUR la route (pas seulement sur les bords) dans les circuits à rythme : le pilote y passe quand même sans choc', () => {
  for (const id of ['cadence', 'pendule', 'rotors', 'grandatelier']) {
    const d = BUILTIN_TRACKS.find((x) => x.id === id);
    assert.ok(d.obst.some((o) => o.side === 0), id);
    const S = runTrack(buildBuiltin(d));
    assert.ok(S.ok && S.respawns === 0 && S.shocks === 0 && S.spikes === 0, `${id} : ${S.reason || ''} ${S.respawns} / ${S.shocks} / ${S.spikes}`);
  }
});
test('script : les paramètres des pièces mobiles suivent l\'instruction qui les porte (movers) ; les valeurs sont bornées comme dans l\'éditeur', async () => {
  const { scriptTrack } = await import('../js/track.js');
  const tr = scriptTrack('m', 'start S2~ S3 S= finish', { movers: [{ ms: 200, ma: 3 }, { ms: 50, ma: 1.5 }] });
  const mv = tr.tiles.filter((t) => t.mv);
  assert.deepEqual(mv.map((t) => [t.mv, t.ms, t.ma]), [[1, 200, 3], [1, 200, 3], [2, 50, 1.5]]);
  assert.deepEqual(clampMover(1, 9999, 99), { ms: 300, ma: 8 });
  const rot = scriptTrack('r', 'start S2 finish', {});
  assert.equal(rot.tiles.filter((t) => t.mv).length, 0);
});

console.log('Carrière');
test('l\'Atelier s\'ouvre avec 4 médailles dans le PREMIER chapitre (pas dans le précédent) ; les onze autres chapitres s\'enchaînent comme avant', () => {
  assert.equal(prerequisiteOf(11), 0);
  for (let ch = 1; ch <= 10; ch++) assert.equal(prerequisiteOf(ch), ch - 1, 'chapitre ' + (ch + 1));
  const none = () => null, med = new Set();
  const medalOf = (i) => (med.has(i) ? { id: 'bronze' } : null);
  assert.equal(chapterUnlocked(11, none, 72), false);
  for (let i = 0; i < UNLOCK_MEDALS - 1; i++) med.add(i);
  assert.equal(chapterUnlocked(11, medalOf, 72), false, '3 médailles ne suffisent pas');
  med.add(3);
  assert.equal(chapterUnlocked(11, medalOf, 72), true, '4 médailles du chapitre 1');
  assert.equal(chapterUnlocked(1, medalOf, 72), true);
  assert.equal(chapterUnlocked(2, medalOf, 72), false, 'le chapitre 3 attend toujours le chapitre 2 (et non l\'Atelier)');
  const medOnlyAtelier = (i) => (i >= 66 ? { id: 'or' } : null);
  assert.equal(chapterUnlocked(2, medOnlyAtelier, 72), false, 'les médailles de l\'Atelier n\'ouvrent rien d\'autre');
  assert.equal(chapterUnlocked(0, none, 72), true);
});
test('« circuit suivant » : l\'Atelier ne se glisse pas à la suite du dernier circuit de la carrière, ni ne l\'y ramène', () => {
  assert.equal(nextBuiltinIndex(0, 72), 1); assert.equal(nextBuiltinIndex(5, 72), 6); assert.equal(nextBuiltinIndex(59, 72), 60);
  assert.equal(nextBuiltinIndex(65, 72), null, 'après « Cœur de Cristal » : fin de la carrière principale');
  assert.equal(nextBuiltinIndex(66, 72), 67); assert.equal(nextBuiltinIndex(70, 72), 71);
  assert.equal(nextBuiltinIndex(71, 72), null, 'après le Grand Atelier : fin');
});
test('aucun numéro de circuit existant ne change : les 66 premiers sont ceux de la carrière d\'origine (les sauvegardes les repèrent par clé, et la carte par numéro)', () => {
  const first = ['eclats', 'canyon', 'tremplins', 'spirale', 'verglas', 'grandtour', 'lianes'];
  assert.deepEqual(BUILTIN_TRACKS.slice(0, 7).map((d) => d.id), first);
  assert.equal(BUILTIN_TRACKS[65].id, 'coeur');
});

console.log('Défi du jour');
test('le défi du jour ne tire que dans les onze décors d\'origine : le douzième ne change aucun circuit du jour (valeurs relevées sur la version précédente)', () => {
  assert.equal(DAILY_DECORS.length, 11); assert.ok(!DAILY_DECORS.includes('atelier'));
  const expected = { '2026-11-07': 'usuzez isles', '2026-12-25': '19097ck orbit', '2027-03-14': 'pl8ftj desert', '2025-01-01': '1yoxl5s caves', '2026-07-04': '1ykvnd jungle' };
  for (const [day, want] of Object.entries(expected)) { const c = dailyChallenge(day); assert.equal(c.track.signature() + ' ' + c.track.decor, want, day); }
  const seen = new Set();
  for (let i = 0; i < 400; i++) { const c = dailyChallenge(new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10)); if (c) seen.add(c.track.decor); }
  assert.ok(!seen.has('atelier'), 'jamais le décor de l\'Atelier');
});

await finish('Tous les tests de l\'Atelier passent.');
