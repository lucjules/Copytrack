// Menu principal : node tools/test-menu.mjs   (npm test)
// Garde-fou contre l'accueil « trop de boutons » : peu de boutons visibles d'emblée, TOUTES les actions restent atteignables (sous-menus), et chaque bouton a un code qui le traite.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const wiring = readFileSync(new URL('../js/app/wiring.js', import.meta.url), 'utf8');
const menu = html.slice(html.indexOf('<section id="menu"'), html.indexOf('</section>', html.indexOf('<section id="menu"')));
const buttons = [...menu.matchAll(/<button[^>]*data-action="([^"]+)"[^>]*>/g)].map((m) => ({ action: m[1], tag: m[0] }));
const inSub = (a) => { const i = menu.indexOf(`data-action="${a}"`); const before = menu.slice(0, i); return before.lastIndexOf('class="menu-sub hidden"') > before.lastIndexOf('</div>'); };

console.log('Menu principal');
test('au plus 8 boutons visibles à l\'ouverture (les autres sont dans des sous-menus fermés)', () => {
  const visible = buttons.filter((b) => !inSub(b.action));
  assert.ok(visible.length <= 8, visible.length + ' boutons : ' + visible.map((b) => b.action).join(', '));
  assert.ok(visible.length >= 5, 'accueil trop vide');
});
test('toutes les actions de l\'ancien accueil restent atteignables, une seule fois chacune', () => {
  for (const a of ['quick', 'play', 'daily', 'academy', 'community', 'competition', 'editor', 'modes', 'garage', 'mytracks', 'import', 'profile']) {
    assert.equal(buttons.filter((b) => b.action === a).length, 1, a);
  }
});
test('chaque bouton du menu a un traitement dans _action (aucun bouton mort)', () => {
  for (const b of buttons) assert.ok(wiring.includes(`case '${b.action}'`), b.action + ' : aucun case dans js/app/wiring.js');
});
test('les sous-menus : chaque tuile qui les ouvre pointe vers un conteneur existant, annoncé aux lecteurs d\'écran', () => {
  for (const b of buttons.filter((x) => x.action.startsWith('sub-'))) {
    const id = /aria-controls="([^"]+)"/.exec(b.tag)[1];
    assert.ok(menu.includes(`id="${id}"`), id);
    assert.match(b.tag, /aria-expanded="false"/);
  }
});
finish('Tous les tests du menu principal passent.');
