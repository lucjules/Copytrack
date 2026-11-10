// Menu principal : node tools/test-menu.mjs   (npm test)
// Garde-fou contre l'accueil « trop de boutons » : six catégories visibles d'emblée, un panneau par catégorie avec « ← Retour », TOUTES les actions restent atteignables
// (une seule fois chacune), aucun bouton mort, aucun onglet sans panneau, aucun réglage perdu ni en double.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const wiring = readFileSync(new URL('../js/app/wiring.js', import.meta.url), 'utf8');
const { HUBS, TAB_HUB } = await import('../js/app/profile.js');
const sectionOf = (id) => { const a = html.indexOf(`<section id="${id}"`); return html.slice(a, html.indexOf('</section>', a)); };
const menu = sectionOf('menu'), profile = sectionOf('profile');
const tiles = menu.slice(menu.indexOf('<nav class="menu-buttons"'), menu.indexOf('</nav>'));
const tileButtons = [...tiles.matchAll(/<button[^>]*data-action="([^"]+)"[^>]*>/g)].map((m) => ({ action: m[1], tag: m[0] }));
const panels = [...menu.matchAll(/<div class="menu-panel hidden" id="menu-sub-([a-z]+)"[\s\S]*?\n      <\/div>\n(?=      <div class="menu-panel|    <\/div>)/g)].map((m) => ({ name: m[1], html: m[0] }));
const entries = panels.flatMap((p) => [...p.html.matchAll(/<button[^>]*data-action="([^"]+)"[^>]*class="btn menu-entry[^"]*"/g)].map((m) => m[1]));

console.log('Menu principal');
test('six catégories visibles à l\'ouverture, dans l\'ordre : Jouer, Créer, Multijoueur, Progression, Profil, Paramètres', () => {
  assert.deepEqual(tileButtons.map((b) => b.action), ['sub-play', 'sub-create', 'sub-multi', 'sub-progress', 'sub-profile', 'sub-settings']);
  const labels = [...tiles.matchAll(/<button[^>]*>\s*([^<\s][^<]*?)\s*<small/g)].map((m) => m[1].trim());
  assert.deepEqual(labels, ['Jouer', 'Créer', 'Multijoueur', 'Progression', 'Profil', 'Paramètres']);
});
test('chaque tuile ouvre un panneau existant, annoncé aux lecteurs d\'écran, qui a un titre et un bouton « ← Retour »', () => {
  assert.equal(panels.length, 6);
  for (const b of tileButtons) {
    const id = /aria-controls="([^"]+)"/.exec(b.tag)[1];
    assert.ok(menu.includes(`id="${id}"`), id);
    assert.match(b.tag, /aria-expanded="false"/); assert.match(b.tag, /aria-haspopup="true"/);
    const p = panels.find((x) => 'menu-sub-' + x.name === id);
    assert.ok(p, 'panneau ' + id);
    assert.match(p.html, /data-action="sub-back"[^>]*>← Retour</, id + ' : bouton Retour');
    assert.match(p.html, /<h2 id="mp-[a-z]+">[^<]+<\/h2>/, id + ' : titre');
    assert.match(p.html, /role="group" aria-labelledby="mp-/, id + ' : annoncé');
  }
});
test('toutes les actions de l\'accueil d\'avant restent atteignables dans les panneaux, une seule fois chacune', () => {
  for (const a of ['quick', 'play', 'daily', 'academy', 'community', 'competition', 'editor', 'modes', 'garage', 'mytracks', 'import', 'multi']) {
    assert.equal(entries.filter((e) => e === a).length, 1, a);
  }
  assert.equal(new Set(entries).size, entries.length, 'aucune action répétée : ' + entries.filter((e, i) => entries.indexOf(e) !== i).join(', '));
});
test('chaque bouton du menu a un traitement (aucun bouton mort) : un « case » de _action, ou « tab-<onglet> » d\'un onglet existant', () => {
  const all = [...tileButtons.map((b) => b.action), ...entries, 'sub-back'];
  for (const a of all) {
    if (a.startsWith('tab-')) assert.ok(TAB_HUB[a.slice(4)], a + ' : onglet inconnu');
    else assert.ok(wiring.includes(`case '${a}'`), a + ' : aucun case dans js/app/wiring.js');
  }
});
test('les panneaux Progression, Profil et Paramètres ouvrent chacun des onglets de leur propre entrée', () => {
  const want = { progress: 'progress', profile: 'profile', settings: 'settings' };
  for (const [name, hub] of Object.entries(want)) {
    const p = panels.find((x) => x.name === name);
    for (const m of p.html.matchAll(/data-action="tab-([a-z]+)"/g)) assert.equal(TAB_HUB[m[1]], hub, `${name} → ${m[1]}`);
  }
});

console.log('Écran à onglets (Profil, Progression, Paramètres)');
test('chaque onglet a son panneau et chaque panneau son onglet ; aucun identifiant de panneau en double', () => {
  const ids = [...profile.matchAll(/data-ppanel="([a-z]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'doublons : ' + ids.filter((x, i) => ids.indexOf(x) !== i).join(','));
  const tabs = Object.keys(TAB_HUB);
  assert.deepEqual([...ids].sort(), [...tabs].sort());
  assert.deepEqual(Object.keys(HUBS), ['profile', 'progress', 'settings']);
});
test('chaque onglet est proposé par au moins un bouton de l\'accueil (rien d\'inatteignable)', () => {
  const via = new Set([...menu.matchAll(/data-action="tab-([a-z]+)"/g)].map((m) => m[1]));
  for (const hub of Object.values(HUBS)) for (const [tab] of hub.tabs) assert.ok(via.has(tab) || ['account', 'friends', 'saves'].includes(tab), 'onglet ' + tab);
  for (const t of ['account', 'saves', 'friends']) assert.ok(via.has(t) || t === 'account', t);
});
test('aucun réglage perdu ni en double : chaque identifiant opt-* existe une seule fois', () => {
  const ids = [...html.matchAll(/id="(opt-[A-Za-z0-9-]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, ids.filter((x, i) => ids.indexOf(x) !== i).join(','));
  for (const must of ['opt-volume', 'opt-music', 'opt-lang', 'opt-quality', 'opt-fov', 'opt-cb', 'opt-motion', 'opt-aid-autoGas', 'opt-ghost', 'opt-telemetry', 'opt-ui-theme', 'opt-hud-profile', 'opt-touch', 'opt-name']) assert.ok(ids.includes(must), must);
});
test('les réglages sont rangés par thème : le nom du pilote est dans le Compte, les records effacés dans les Sauvegardes, la langue dans l\'Audio', () => {
  const panel = (name) => { const a = profile.indexOf(`data-ppanel="${name}"`); const next = profile.indexOf('data-ppanel="', a + 10); return profile.slice(a, next < 0 ? undefined : next); };
  assert.ok(panel('account').includes('id="opt-name"'));
  assert.ok(panel('audio').includes('id="opt-lang"') && panel('audio').includes('id="opt-volume"'));
  assert.ok(panel('gfx').includes('id="opt-quality"') && panel('gfx').includes('id="opt-fov"'));
  assert.ok(panel('access').includes('id="opt-motion"') && panel('access').includes('id="opt-aid-autoGas"'));
  assert.ok(panel('controls').includes('id="opt-touch"') && panel('controls').includes('id="bind-list"'));
  assert.ok(!profile.includes('data-action="reset-records"'), 'le bouton « Effacer les records » est généré dans les Sauvegardes (profile.js)');
  assert.ok(readFileSync(new URL('../js/app/profile.js', import.meta.url), 'utf8').includes('data-action="reset-records"'));
});

finish('Tous les tests du menu principal passent.');
