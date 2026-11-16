// Wiki du jeu (wiki/index.html) : node tools/test-wiki.mjs   (npm test)
//  - la page est à jour : elle est identique à ce que génère tools/wiki/build.mjs à partir du code (sinon : npm run wiki) ;
//  - le menu y mène (bouton de la barre du bas de l'accueil, entrée du panneau Créer) et les rubriques visées existent ;
//  - ses données se relisent, ses images existent, elle ne charge aucun script extérieur.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test, finish } from './harness.mjs';
import { buildWikiPage } from './wiki/build.mjs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const page = read('wiki/index.html');

test('wiki/index.html est à jour (identique à la génération depuis le code : sinon « npm run wiki »)', () => {
  assert.ok(page === buildWikiPage().page, 'wiki/index.html n\'est pas à jour : lancer « npm run wiki »');
});
test('le menu mène au wiki : bouton de la barre du bas (nouvel onglet), entrée « Wiki du jeu » du panneau Créer ; les rubriques visées existent', () => {
  const html = read('index.html');
  const links = [...html.matchAll(/<a\b[^>]*href="(wiki\/[^"]*)"[^>]*>/g)];
  assert.ok(links.length >= 2, links.map((m) => m[1]).join(' '));
  for (const [tag, href] of links) {
    assert.match(tag, /target="_blank"/); assert.match(tag, /rel="noopener"/);
    const anchor = href.split('#')[1];
    if (anchor) assert.ok(page.includes(`id="${anchor}"`), 'rubrique #' + anchor + ' absente du wiki');
  }
  assert.ok(/class="menu-foot"[\s\S]*?href="wiki\/"/.test(html), 'bouton du wiki dans la barre du bas de l\'accueil');
  assert.ok(/id="menu-sub-create"[\s\S]*?href="wiki\/#pieces"/.test(html), 'entrée du wiki dans le panneau Créer');
});
test('les données du wiki se relisent (72 circuits, une carte chacun), ses images existent, aucun script extérieur', () => {
  const json = (id) => JSON.parse(page.match(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`))[1]);
  const data = json('d-data'), maps = json('d-maps');
  const tracks = data.chapters.flatMap((c) => c.tracks);
  assert.equal(tracks.length, 72);
  for (const t of tracks) assert.ok(maps[t.id] && maps[t.id].d.startsWith('M'), t.id);
  const imgs = [...new Set([...page.matchAll(/img\/([a-z0-9-]+\.jpg)/g)].map((m) => m[1]))];
  assert.ok(imgs.length >= 10);
  for (const f of imgs) assert.ok(existsSync(new URL('../wiki/img/' + f, import.meta.url)), f);
  assert.deepEqual([...page.matchAll(/<script\b[^>]*\bsrc=/g)], [], 'aucun script chargé d\'ailleurs');
});

await finish('Tous les tests du wiki passent.');
