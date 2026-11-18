// Rangement de l'éditeur (0.12.0) : quatre zones, un rôle chacune : node tools/test-rangement.mjs   (npm test)
// Barre du haut (le circuit), rail des outils et panneau de l'outil (que fait mon clic, avec quoi), colonne Vue ; barre de sélection et inspecteur seulement avec
// leur outil. Ce test garde la structure : chaque bouton est branché, chaque famille de pièces et chaque catégorie de décors est rangée une fois.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';

const root = new URL('..', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const wiring = readFileSync(new URL('js/app/wiring.js', root), 'utf8');
const ed = html.slice(html.indexOf('<div id="editor"'), html.indexOf('<!-- Fenêtre modale générique -->'));

const { MODES, LIBRARY, DECO_FAMS, modeOf, paletteMethods } = await import('../js/editor/palette.js');
const { FAMILY_ORDER, familyOf, REPLACED_BY_OPTION } = await import('../js/families.js');
const { PIECES, PIECE_ORDER, LEGACY_TILE } = await import('../js/pieces.js');
const { DECO_CATS } = await import('../js/decoData.js');
const { toolMethods } = await import('../js/editor/tools.js');

test('quatre zones : barre du haut, rail des outils, panneau de l’outil, colonne Vue ; barre de sélection et ligne d’aide ; plus d’ancienne colonne fourre-tout', () => {
  for (const id of ['class="ed-top"', 'id="ed-tools"', 'id="ed-palette"', 'id="ed-view"', 'id="ed-selbar"', 'id="ed-hint"', 'id="ed-name"', 'id="ed-saved"']) assert.ok(ed.includes(id), id);
  assert.ok(!ed.includes('ed-side'), 'l’ancienne colonne de droite (niveau, pivoter, prolonger, logique, aide mélangés) a disparu');
  assert.equal((ed.match(/>⚙/g) || []).length, 1, 'une seule icône ⚙ (Circuit)');
  // La colonne Vue ne modifie pas le circuit : seulement niveau et caméra, grille, calques.
  const view = ed.slice(ed.indexOf('id="ed-view"'), ed.indexOf('id="ed-selbar"'));
  assert.deepEqual([...view.matchAll(/data-ed="([^"]+)"/g)].map((m) => m[1]), ['view-toggle', 'lvl-down', 'lvl-up', 'levelview', 'topview', 'recenter', 'freecam', 'grid', 'groups']);
});

test('chaque bouton data-ed de l’éditeur est traité par l’application (aucun bouton mort)', () => {
  const acts = new Set([...ed.matchAll(/data-ed="([^"]+)"/g)].map((m) => m[1]));
  const handled = new Set([...wiring.matchAll(/case '([^']+)':/g)].map((m) => m[1]).concat([...wiring.matchAll(/a === '([^']+)'/g)].map((m) => m[1])));
  const dead = [...acts].filter((a) => !handled.has(a));
  assert.deepEqual(dead, []);
});

test('six outils dans le rail ; le mode suit l’outil (pièce, revêtement, décor, sélection, inspection, gomme, et le pot de peinture)', () => {
  assert.deepEqual(MODES.map((m) => m.id), ['pieces', 'paint', 'decos', 'select', 'inspect', 'erase']);
  const cases = { straight: 'pieces', 'fill-piece:curve': 'pieces', 'surf:ice': 'paint', 'fill-surf:boost': 'paint', 'deco:tree': 'decos', select: 'select', inspect: 'inspect', erase: 'erase', 'mod:tn': 'pieces' };
  for (const [tool, mode] of Object.entries(cases)) assert.equal(modeOf(tool), mode, tool);
});

test('bibliothèque : chaque famille et chaque pièce seule de la palette est rangée dans UNE section', () => {
  const items = LIBRARY.flatMap((s) => s.items);
  assert.equal(new Set(items).size, items.length, 'aucune carte en double');
  for (const f of FAMILY_ORDER) assert.ok(items.includes('fam:' + f), 'famille ' + f);
  const singles = PIECE_ORDER.filter((t) => PIECES[t] && !LEGACY_TILE[t] && !REPLACED_BY_OPTION.has(t) && !familyOf(t));
  for (const t of singles) assert.ok(items.includes(t), 'pièce ' + t);
});

test('décors : cinq familles ; chaque catégorie dans une seule ; les solides (qui comptent pour la course) à part', () => {
  const cats = DECO_FAMS.flatMap((f) => f.cats);
  assert.equal(new Set(cats).size, cats.length);
  assert.deepEqual([...cats].sort(), Object.keys(DECO_CATS).sort());
  assert.deepEqual(DECO_FAMS.find((f) => f.id === 'solid').cats, ['struct', 'wallsS', 'blocks', 'obstacles']);
});

test('« Remplir » est l’interrupteur de CHAQUE outil : celui des pièces ne déteint pas sur la peinture, et inversement', () => {
  const s = { tool: 'straight', opts: {}, famTraits: {}, deco: { cat: 'nature' }, inspector: { clear() {} }, app: { settings: {}, ui: { flash() {} } }, previewKey: '' };
  Object.assign(s, toolMethods, paletteMethods, { setTab() {}, _refreshUI() {}, guidedAllows: () => true });
  s.setFill(true);
  assert.equal(s.tool, 'fill-piece:straight');
  s.setTool('curve');
  assert.equal(s.tool, 'fill-piece:curve', 'une autre pièce garde Remplir');
  s.setMode('paint');
  assert.equal(s.tool, 'surf:boost', 'la peinture garde SON interrupteur (éteint)');
  s.setFill(true);
  assert.equal(s.tool, 'fill-surf:boost');
  s.setMode('pieces');
  assert.equal(s.tool, 'fill-piece:curve', 'retour aux pièces : la dernière pièce, toujours en Remplir');
  s.setFill(false);
  assert.equal(s.tool, 'curve');
  s.setMode('paint');
  assert.equal(s.tool, 'fill-surf:boost');
  s.setMode('select'); assert.equal(s.tool, 'select');
});

test('orientation dans les réglages de la pièce (0.12.1) : à l’endroit, à l’envers, sur le côté gauche ou droit, armée pour la pose ; refusée si la pièce ne la permet pas ; touche O', () => {
  const flashes = [];
  const s = { tool: 'straight', opts: {}, famTraits: {}, deco: { cat: 'nature' }, inspector: { clear() {} }, app: { settings: {}, ui: { flash: (m) => flashes.push(m) }, audio: { error() {} } }, previewKey: '' };
  Object.assign(s, toolMethods, paletteMethods, { setTab() {}, _refreshUI() {}, guidedAllows: () => true });
  s.setOrientation(1); assert.deepEqual([s.opts.o, s.opts.v], [1, 0], 'mur gauche');
  s.setOrientation(2); assert.deepEqual([s.opts.o, s.opts.v], [2, 0], 'mur droit (remplace le gauche)');
  s.setOrientation(3); assert.deepEqual([s.opts.o, s.opts.v], [0, 1], 'à l’envers');
  s.setOrientation(0); assert.deepEqual([s.opts.o, s.opts.v], [0, 0], 'à l’endroit');
  s.setOrientation(3); s.setOrientation(3); assert.equal(s.opts.v, 1, 'choisir deux fois la même ne l’annule pas');
  s.setOrientation(0);
  s.cycleOrientation(); assert.equal(s.currentOrientation(), 3, 'O : à l’envers après à l’endroit');
  s.cycleOrientation(); assert.equal(s.currentOrientation(), 1);
  s.cycleOrientation(-1); assert.equal(s.currentOrientation(), 3, 'Maj + O : précédente');
  s.setOrientation(0); s.setTool('wslU1');
  s.setOrientation(3);
  assert.equal(s.opts.v | 0, 0, 'route large : pas à l’envers');
  assert.match(flashes.at(-1), /ne se posent pas à l’envers/);
  // Toute pièce qui se pose dans au moins deux orientations a la liste ; les routes étroites et larges, non.
  assert.ok(s._orientChoices('cvBig2').filter((c) => !c.why).length >= 4, 'virage incliné : sol, plafond, murs');
  assert.equal(s._orientChoices('wslU1').filter((c) => !c.why).length, 1);
});

await finish('Tous les tests du rangement de l’éditeur passent.');
