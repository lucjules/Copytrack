// Internationalisation fr/en : noyau (clés exactes, modèles à trous, pluriels), intégrité du dictionnaire anglais, et couverture des textes
// statiques (index.html) et des données du jeu (circuits, décors, pièces, cosmétiques, décorations…).
// node tools/test-i18n.mjs   (npm test)
// Le comportement dans une vraie page (traducteur DOM, bascule de langue, écrans) est vérifié par tools/test-browser-i18n.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { test, finish } from './harness.mjs';
import * as I from '../js/i18n.js';
import { htmlCandidates, candidate, covered } from './i18n-scan.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const reset = (lang = 'fr') => { I.resetDictionary(); I.setLang(lang); };

console.log('Noyau');
test('le français est la langue source : aucun changement, même avec un dictionnaire chargé', () => {
  reset('fr');
  I.register({ 'Jouer': 'Play' });
  assert.equal(I.translate('Jouer'), 'Jouer');
  assert.equal(I.t('Tour {n}/{m}', { n: 2, m: 3 }), 'Tour 2/3');
});

test('clé exacte : espaces de début et de fin conservés, blancs internes réduits, texte sans lettres ignoré', () => {
  reset('en');
  I.register({ 'Jouer': 'Play', 'Qui joue ?': 'Who plays?' });
  assert.equal(I.translate('Jouer'), 'Play');
  assert.equal(I.translate('  Jouer\n'), '  Play\n');
  assert.equal(I.translate('Qui   joue\n ?'), 'Who plays?');
  assert.equal(I.translate('00:32.123'), '00:32.123');
  assert.equal(I.translate('Inconnu'), 'Inconnu', 'sans traduction : le français reste (jamais de trou)');
  assert.equal(I.translate(''), '');
});

test('modèle à trous : valeurs reprises, trou vide accepté, le plus précis gagne', () => {
  reset('en');
  I.register({
    'Tour {n}/{m}': 'Lap {n}/{m}',
    '{c} pièces{d} · modifié le {e}': '{c} pieces{d} · edited on {e}',
    'Record {t}': 'Best {t}',
    'Record {t} (vérifié)': 'Verified best {t}',
  });
  assert.equal(I.translate('Tour 2/3'), 'Lap 2/3');
  assert.equal(I.translate('12 pièces · modifié le 01/02/2026'), '12 pieces · edited on 01/02/2026', 'trou vide');
  assert.equal(I.translate('12 pièces · 3 tours · modifié le 01/02/2026'), '12 pieces · 3 tours · edited on 01/02/2026');
  assert.equal(I.translate('Record 01:02.345'), 'Best 01:02.345');
  assert.equal(I.translate('Record 01:02.345 (vérifié)'), 'Verified best 01:02.345', 'plus de texte fixe = plus précis');
  assert.throws(() => I.register({ '{a}': '{a}' }), /texte fixe/, 'un modèle sans texte fixe reconnaîtrait tout');
});

test('{x:t} : la valeur captée est traduite à son tour, en entier ou par morceaux', () => {
  reset('en');
  I.register({ 'Défi du jour : {name:t}': 'Daily challenge: {name:t}', 'Garde-Fous': 'Guardrails', 'Entrée': 'Enter', 'Échap': 'Esc', '{k:t} : pause': '{k}: pause' });
  assert.equal(I.translate('Défi du jour : Garde-Fous'), 'Daily challenge: Guardrails');
  assert.equal(I.translate('Défi du jour : Nom perso'), 'Daily challenge: Nom perso', 'une valeur inconnue reste telle quelle');
  assert.equal(I.translate('T / Entrée : pause'), 'T / Enter: pause');
  assert.equal(I.translate('Échap / P : pause'), 'Esc / P: pause');
});

test('{x:w} : un seul mot court, pour qu\'un modèle comme « Montée {n} » n\'avale pas une phrase entière', () => {
  reset('en');
  I.register({ 'Montée {n:w}': 'Climb {n}', 'Record {t:w}': 'Best {t}' });
  assert.equal(I.translate('Montée ½'), 'Climb ½');
  assert.equal(I.translate('Montée vers le sommet du mont Blanc'), 'Montée vers le sommet du mont Blanc', 'une phrase qui commence pareil n\'est pas touchée');
  assert.equal(I.translate('Record battu !'), 'Record battu !');
  assert.equal(I.translate('Record 01:02.345'), 'Best 01:02.345');
});

test('valeur fonction (pluriels anglais) et t() avec variables', () => {
  reset('en');
  I.register({ '{n} tours': (v) => `${v.n} ${I.plural(v.n, 'lap', 'laps')}`, 'Tour {n}/{m}': 'Lap {n}/{m}' });
  assert.equal(I.translate('1 tours'), '1 lap');
  assert.equal(I.translate('3 tours'), '3 laps');
  assert.equal(I.t('Tour {n}/{m}', { n: 2, m: 3 }), 'Lap 2/3');
  assert.equal(I.t('Rien {x}', { x: 1 }), 'Rien 1', 't() sans traduction : le gabarit français rempli');
  I.setLang('fr');
  assert.equal(I.t('Tour {n}/{m}', { n: 2, m: 3 }), 'Tour 2/3');
});

test('changer de langue ou de dictionnaire vide le cache ; les écouteurs sont prévenus', () => {
  reset('en');
  I.register({ 'Jouer': 'Play' });
  assert.equal(I.translate('Jouer'), 'Play');
  const seen = [];
  const off = I.onLangChange((l) => seen.push(l));
  assert.equal(I.setLang('fr'), true); assert.equal(I.translate('Jouer'), 'Jouer');
  assert.equal(I.setLang('fr'), false, 'pas de changement : pas d\'événement');
  I.setLang('en'); assert.equal(I.translate('Jouer'), 'Play');
  I.register({ 'Jouer': 'Race' }); assert.equal(I.translate('Jouer'), 'Race', 'un nouveau dictionnaire s\'applique tout de suite');
  assert.deepEqual(seen, ['fr', 'en']);
  off(); I.setLang('fr'); assert.deepEqual(seen, ['fr', 'en']);
  assert.equal(I.setLang('zz'), false, 'langue inconnue : retour au français, déjà actif');
});

test('langue au premier lancement : un joueur existant garde le français, un nouvel appareil suit le navigateur', () => {
  assert.equal(I.detectLang({ saved: 'en', navigatorLanguages: ['fr-FR'], fresh: false }), 'en', 'le choix du joueur prime');
  assert.equal(I.detectLang({ saved: null, navigatorLanguages: ['en-US', 'fr'], fresh: false }), 'fr', 'données existantes : on ne change pas la langue sans demande');
  assert.equal(I.detectLang({ saved: null, navigatorLanguages: ['en-US'], fresh: true }), 'en');
  assert.equal(I.detectLang({ saved: null, navigatorLanguages: ['de-DE'], fresh: true }), 'en', 'ni français ni anglais : l\'anglais, plus répandu');
  assert.equal(I.detectLang({ saved: null, navigatorLanguages: ['fr-CA'], fresh: true }), 'fr');
  assert.equal(I.detectLang({ saved: 'xx', navigatorLanguages: [], fresh: true }), 'fr', 'valeur sauvegardée invalide ignorée, pas de langue de navigateur : français');
  assert.equal(I.locale(), 'fr-FR');
});

// ------------------------------------------------------------------------------------------------ dictionnaire
const { default: en, PARTS } = await import('../js/i18n/en.js');

console.log('Dictionnaire anglais');
const holes = (s) => [...String(s).matchAll(/\{(\w+)(?::[tw]+)?\}/g)].map((m) => m[1]);
const tags = (s) => [...String(s).matchAll(/<\/?([a-z0-9]+)/gi)].map((m) => m[0].toLowerCase()).sort().join(',');

test('chaque entrée a une traduction non vide ; la valeur ne perd aucun trou {x} ni balise HTML de la clé', () => {
  const bad = [];
  for (const [k, v] of Object.entries(en)) {
    if (typeof v !== 'string' && typeof v !== 'function') { bad.push(`${k} : valeur ${typeof v}`); continue; }
    if (typeof v === 'string') {
      if (!v.trim()) bad.push(`${k} : vide`);
      const kh = new Set(holes(k));
      for (const h of holes(v)) if (!kh.has(h)) bad.push(`${k} : trou {${h}} absent de la clé`);
      for (const h of kh) if (!holes(v).includes(h)) bad.push(`${k} : trou {${h}} perdu`);
      if (tags(k) !== tags(v)) bad.push(`${k} : balises HTML différentes (${tags(k)} / ${tags(v)})`);
    }
  }
  assert.deepEqual(bad, [], bad.slice(0, 12).join('\n       '));
});

test('une même clé n\'est pas traduite de deux façons différentes par deux fichiers', () => {
  const seen = new Map(), bad = [];
  for (const [part, dict] of Object.entries(PARTS)) {
    for (const [k, v] of Object.entries(dict)) {
      const key = I.norm(k);
      if (seen.has(key) && typeof v === 'string' && seen.get(key).v !== v) bad.push(`${key} : ${seen.get(key).part} « ${seen.get(key).v} » / ${part} « ${v} »`);
      seen.set(key, { part, v });
    }
  }
  assert.deepEqual(bad, []);
});

test('pas de traduction laissée telle quelle sur une phrase (sauf noms propres déclarés)', () => {
  const SAME_OK = new Set(['Sprint', 'Speedway', 'Rollercoaster', 'Blizzard', 'Temple', 'Spores', 'Rotors', 'Obstacles', 'Menu', 'Garage', 'Options', 'Pause', 'Position', 'Distance', 'Angle', 'Cube', 'Cactus', 'Piano', 'Cookie', 'Silo', 'Stop', 'Bus', 'Igloo', 'Danger', 'Palette', 'Gizmo', 'Prefab', 'Prefabs', 'Normal', 'Buggy', 'Sport', 'Muscle', 'Royal', 'Cyan', 'Chrome', 'Arcade', 'Chopper', 'Cupcake', 'Halloween', 'Jungle', 'Tipi', 'Tunnel', 'Terrain', 'Slalom', 'Chicane', 'Rose', 'Turbo', 'Nature', 'Dragon', 'Saloon', 'Kayak', 'Satellite', 'Potato', 'Ultra', 'Ultra Potato', 'Type', 'Bronze', 'Description', 'Compte', 'Cristal']);
  const same = Object.entries(en).filter(([k, v]) => typeof v === 'string' && I.norm(k) === I.norm(v) && I.norm(k).split(' ').length > 2 && !SAME_OK.has(I.norm(k)));
  assert.deepEqual(same.map(([k]) => k), []);
});

test('les clés sont normalisées (pas de blancs doubles ni en bordure) : sinon elles ne seraient jamais retrouvées', () => {
  const bad = Object.keys(en).filter((k) => k !== I.norm(k));
  assert.deepEqual(bad, [], 'à écrire en une seule ligne, blancs simples, sans espace de début ni de fin : ' + bad.slice(0, 5).join(' | '));
});

// ------------------------------------------------------------------------------------------------ couverture
console.log('Couverture');
reset('en'); I.register(en);

test('index.html : tout texte et toute infobulle statiques sont traduits', () => {
  const src = readFileSync(join(root, 'index.html'), 'utf8');
  const body = src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' ')).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, (m) => m.replace(/[^\n]/g, ' '));
  const NOT_TEXT = new Set(['Copytrack', 'Français', 'English']);
  const missing = htmlCandidates(body, 'html', (h) => covered(I.norm(h)))
    .filter((c) => candidate(c.text, c.kind) && !NOT_TEXT.has(I.norm(c.text)) && !covered(I.norm(c.text)))
    .map((c) => `ligne ${body.slice(0, c.at).split('\n').length} : ${I.norm(c.text)}`);
  assert.deepEqual(missing, [], `${missing.length} texte(s) sans traduction :\n       ` + missing.slice(0, 10).join('\n       '));
});

// Libellés des données : chaque texte affiché au joueur doit avoir une entrée (la traduction identique, ex. « Blizzard », compte).
test('données : circuits, décors, obstacles, profils, chapitres, médailles, cosmétiques, pièces, familles, décorations, leçons, titres', async () => {
  const mods = await Promise.all(['tracks', 'themes', 'obstacles', 'career', 'medals', 'cosmetics', 'pieces', 'decoData', 'families', 'decoPackData', 'ambiance', 'difficulty', 'rewards', 'academy', 'prefabs', 'quality', 'hudMessages'].map((m) => import(`../js/${m}.js`)));
  const KEYS = new Set(['label', 'hint', 'tip', 'desc', 'name', 'param', 'title', 'text', 'appris']);
  const miss = new Set(), seen = new Set();
  const check = (s) => { if (/[A-Za-zÀ-ÿ]{2}/.test(s) && !I.hasTranslation(s)) miss.add(s); };
  const walk = (o, key = '') => {
    if (typeof o === 'string') { if (KEYS.has(key) || key === '*') check(o); return; }
    if (!o || typeof o !== 'object' || seen.has(o)) return;
    seen.add(o);
    if (Array.isArray(o)) { const pair = o.length === 2 && typeof o[0] === 'string' && typeof o[1] === 'string'; o.forEach((v) => walk(v, pair ? '*' : key)); return; }
    for (const [k, v] of Object.entries(o)) walk(v, k);
  };
  for (const m of mods) for (const [k, v] of Object.entries(m)) if (typeof v !== 'function') walk(v, k);
  // « * » : paires [valeur, libellé] (choix d'ambiance, traits des familles) : la première est une valeur technique, seule la seconde compte.
  const technical = [...miss].filter((s) => /^[-\d.]+$|^[a-z]+$/.test(s));
  for (const t of technical) miss.delete(t);
  assert.deepEqual([...miss], [], `${miss.size} texte(s) de données sans traduction : ` + [...miss].slice(0, 10).join(' | '));
});

test('messages de course, objectifs, médailles : les textes produits par le code sont traduits', async () => {
  const { MSG } = await import('../js/hudMessages.js');
  const { GOALS } = await import('../js/career.js');
  const samples = [
    MSG.offTrack[0], MSG.spikes[0], MSG.glass[0], MSG.sink[0], MSG.missing(1)[0], MSG.missing(3)[0], MSG.fall.loop[0], MSG.fall.twist[0],
    MSG.gravity(50)[0], MSG.flip(true)[0], MSG.flip(false)[0], MSG.lap(2, 3)[0], MSG.lap(3, 3)[0], MSG.reverse[0], MSG.cut[0], MSG.badLanding[0], MSG.keepClock[0],
    GOALS.nowall.label, GOALS.norespawn.label, GOALS.perfect.label(1), GOALS.perfect.label(2), GOALS.turbo.label(1), GOALS.turbo.label(2),
    GOALS.rings.label(1), GOALS.rings.label(3), GOALS.vehicle.label('moto'), GOALS.vehicle.label('boat'), GOALS.vehicle.label('glider'), GOALS.under.label(22.5),
  ];
  const left = samples.filter((s) => !I.hasTranslation(s) && I.translate(s) === s);
  assert.deepEqual(left, [], 'sans traduction : ' + left.join(' | '));
  assert.equal(I.translate(MSG.lap(2, 3)[0]), 'Lap 2/3');
  assert.equal(I.translate(MSG.missing(3)[0]), '3 checkpoints missed');
  assert.equal(I.translate(GOALS.perfect.label(2)), '2 perfect landings');
  assert.equal(I.translate(GOALS.vehicle.label('glider')), 'Cross the finish by glider');
});

test('rendus fréquents : infobulles « Nom (touche) : description », touches, pluriels', () => {
  assert.equal(I.translate('Sélection (Q) : Zone : copier, déplacer, supprimer'), 'Selection (Q): Area: copy, move, delete');
  assert.equal(I.translate('W / ↑ S / ↓ A / ← D / → · frein en virage : dérapage · R : dernier checkpoint · T / Entrée : recommencer · C : caméra · H : klaxon · Échap / P : pause'),
    'W / ↑ S / ↓ A / ← D / → · brake in a turn: drift · R: last checkpoint · T / Enter: restart · C: camera · H: horn · Esc / P: pause');
  assert.equal(I.translate('Chapitre 3'), 'Chapter 3');
  assert.equal(I.translate('Tour 1/3'), 'Lap 1/3');
  assert.equal(I.translate('3 pièces · 2×3'), '3 pieces · 2×3');
  assert.equal(I.translate('1 pièce · 1×1'), '1 piece · 1×1');
  assert.equal(I.translate('Transition sol → mur gauche (douce 2×2)'), 'Transition ground → left wall (soft 2×2)');
  assert.equal(I.translate('bêta 0.9.21'), 'beta 0.9.21');
  assert.equal(I.translate('Copytrack bêta 0.9.21 · un jeu de course original · propulsé par three.js'), 'Copytrack beta 0.9.21 · an original racing game · powered by three.js');
});

finish('Tous les tests i18n passent.');
