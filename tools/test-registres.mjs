// Registres : ordres de sérialisation figés, tables uniques cohérentes entre elles : node tools/test-registres.mjs   (npm test)
//  - PIECE_ORDER, SURFACE_CODES et DECO_ORDER ne changent jamais (les codes de circuit partagés s'y réfèrent par numéro) : on en garde l'empreinte ;
//  - chaque décoration a un nom, une icône, une catégorie et une géométrie ; chaque pièce a une définition ;
//  - les 11 décors : mêmes identifiants dans themes.js, scenery.js (rendu) et la carrière.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { hashString } from '../js/track.js';
import { PIECES, PIECE_ORDER, SURFACES, SURFACE_CODES, SURFACE_ORDER, SURFACE_ALIAS, LEGACY_SURFACE, LEGACY_PIECE } from '../js/pieces.js';
import { DECO_ORDER, DECO_CATS, DECO_LABELS, DECO_ICONS } from '../js/decoData.js';
import { PACK_IDS } from '../js/decoPackData.js';
import { GeoBuilder } from '../js/geo.js';
import { buildDecoInto } from '../js/decos.js';
import { isObstacle } from '../js/obstacles.js';
import { DECORS, CAREER_ORDER, DEFAULT_DECOR } from '../js/themes.js';
import { THEMES } from '../js/scenery.js';
import { CHAPTERS } from '../js/career.js';

console.log('Ordres de sérialisation (ne jamais réordonner : seulement ajouter à la fin)');
test('PIECE_ORDER : les 119 premiers types ne bougent plus', () => {
  assert.equal(PIECE_ORDER.length >= 119, true);
  assert.equal(hashString(PIECE_ORDER.slice(0, 119).join(',')), '1tggwk2', 'un type de pièce a été réordonné, retiré ou inséré avant la fin');
});
test('SURFACE_CODES : les 24 premiers revêtements ne bougent plus', () => {
  assert.equal(SURFACE_CODES.length >= 24, true);
  assert.equal(hashString(SURFACE_CODES.slice(0, 24).join(',')), 'l9tfg2', 'un revêtement a été réordonné, retiré ou inséré avant la fin');
});
test('DECO_ORDER : les 311 premières décorations ne bougent plus', () => {
  assert.equal(DECO_ORDER.length >= 311, true);
  assert.equal(hashString(DECO_ORDER.slice(0, 311).join(',')), '1jhg2iw', 'une décoration a été réordonnée, retirée ou insérée avant la fin');
});
test('aucun doublon dans les trois ordres', () => {
  for (const [nom, liste] of [['PIECE_ORDER', PIECE_ORDER], ['SURFACE_CODES', SURFACE_CODES], ['DECO_ORDER', DECO_ORDER]]) {
    assert.equal(new Set(liste).size, liste.length, nom + ' contient un doublon');
  }
});

console.log('Pièces et revêtements');
test('chaque type de PIECE_ORDER a une définition, ou une conversion à la lecture (anciens types)', () => {
  const orphelins = PIECE_ORDER.filter((t) => !PIECES[t] && !LEGACY_SURFACE[t] && !LEGACY_PIECE[t]);
  assert.deepEqual(orphelins, []);
});
test('chaque définition de pièce est dans PIECE_ORDER (sinon elle ne se sauvegarde pas)', () => {
  assert.deepEqual(Object.keys(PIECES).filter((t) => !PIECE_ORDER.includes(t)), []);
});
test('chaque revêtement proposé a un code de sérialisation ; les alias pointent vers un revêtement réel', () => {
  assert.deepEqual(SURFACE_ORDER.filter((s) => !SURFACE_CODES.includes(s)), []);
  assert.deepEqual(Object.keys(SURFACES).filter((s) => s && !SURFACE_CODES.includes(s)), []);
  for (const [alias, cible] of Object.entries(SURFACE_ALIAS)) assert.ok(SURFACES[cible], `${alias} → ${cible}`);
});

console.log('Décorations : une seule table');
test('toute décoration sérialisée a un nom, une icône et (sauf les secrètes) une catégorie', () => {
  const classees = new Set(Object.values(DECO_CATS).flatMap((c) => c.kinds));
  for (const id of DECO_ORDER) {
    assert.ok(DECO_LABELS[id], 'nom manquant : ' + id);
    assert.ok(DECO_ICONS[id], 'icône manquante : ' + id);
    if (id !== 'shard') assert.ok(classees.has(id), 'sans catégorie : ' + id);
  }
});
test('les catégories ne listent que des décorations sérialisables, sans doublon', () => {
  const tout = Object.values(DECO_CATS).flatMap((c) => c.kinds);
  assert.equal(new Set(tout).size, tout.length, 'une décoration est dans deux catégories');
  assert.deepEqual(tout.filter((id) => !DECO_ORDER.includes(id)), []);
});
test('le pack de décorations est entièrement dans DECO_ORDER', () => {
  assert.ok(PACK_IDS.length >= 200);
  assert.deepEqual(PACK_IDS.filter((id) => !DECO_ORDER.includes(id)), []);
});
test('chaque décoration a une géométrie (les obstacles et la plaque image ont la leur ailleurs)', () => {
  const sans = [];
  for (const id of DECO_ORDER) {
    if (isObstacle(id) || id === 'plaque') continue;
    const gb = new GeoBuilder(), glow = new GeoBuilder();
    buildDecoInto(gb, glow, { k: id, x: 0, y: 0, z: 0, ry: 0, s: 1, c: 0 });
    if (gb.empty && glow.empty) sans.push(id);
  }
  assert.deepEqual(sans, []);
});

console.log('Décors (thèmes)');
test('themes.js, le rendu (scenery.js) et la carrière portent les mêmes 11 identifiants', () => {
  const ids = Object.keys(DECORS).sort();
  assert.equal(ids.length, 11);
  assert.deepEqual(Object.keys(THEMES).sort(), ids);
  assert.deepEqual([...CAREER_ORDER].sort(), ids);
  assert.deepEqual(CHAPTERS.map((c) => c.decor), CAREER_ORDER);
  assert.ok(DECORS[DEFAULT_DECOR]);
});
test('l\'ordre historique de DECORS est figé (le défi du jour tire le décor par son rang)', () => {
  assert.equal(Object.keys(DECORS).join(','), 'desert,polar,jungle,city,isles,volcano,orbit,caves,sky,reef,factory');
});
test('chaque décor a un nom, une couleur de pastille et un chapitre de carrière nommé comme lui', () => {
  for (const [id, d] of Object.entries(DECORS)) { assert.ok(d.label && /^#[0-9a-f]{6}$/i.test(d.chip), id); }
  for (const c of CHAPTERS) assert.equal(c.name, DECORS[c.decor].label);
});

await finish('Tous les tests des registres passent.');
