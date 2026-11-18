// Démarrage après une mise en ligne, dans un vrai navigateur (Chromium) : node tools/test-browser-boot.mjs   (npm run test:browser)
//
// Le cas réel (0.9.65) : juste après la fusion, le navigateur gardait dans son cache HTTP l'ANCIEN js/pieces.js (GitHub Pages : « max-age=600 ») et chargeait
// les nouveaux modules à côté ; le nouveau code demandait `headingGuided`, que l'ancien fichier n'exporte pas : tout le graphe de modules échouait et le jeu
// restait sur « Chargement… ». Ce serveur imite GitHub Pages (tout en « max-age=600 ») et peut servir l'ancienne version de js/pieces.js.
// Vérifié : sans js/boot-guard.js, le premier essai reste bloqué sur « Chargement… ». Playwright absent : test ignoré (REQUIRE_BROWSER / CI : échec).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const REQUIRED = !!(process.env.CI || process.env.REQUIRE_BROWSER);
let chromium;
const skip = (why) => { console.log((REQUIRED ? '  FAIL ' : '  skip ') + why); process.exit(REQUIRED ? 1 : 0); };
try { ({ chromium } = require('playwright')); } catch { skip('playwright introuvable'); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---- Serveur « GitHub Pages » ------------------------------------------------------------------------------------------------------------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.txt': 'text/plain' };
const state = { piecesOld: false, hits: { nav: 0, piecesReload: 0 } };
const OLD_PIECES = (await readFile(join(root, 'js/pieces.js'), 'utf8')).replace('export function rolledRibbon', 'function rolledRibbon');      // la version d'avant n'avait pas cet export (0.9.65 : headingGuided)
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let path = decodeURIComponent(url.pathname);
  if (path === '/__blank') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>vide</title>'); return; }
  if (path === '/') path = '/index.html';
  if (req.headers['sec-fetch-mode'] === 'navigate') state.hits.nav++;      // vraies navigations (la garde redemande aussi index.html en arrière-plan)
  const file = normalize(join(root, path));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  try {
    let body = await readFile(file);
    if (path === '/js/pieces.js') {
      if (/no-cache/.test(req.headers['cache-control'] || '') || /no-cache/.test(req.headers.pragma || '')) state.hits.piecesReload++;
      if (state.piecesOld) body = Buffer.from(OLD_PIECES);
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let browser;
// Hôtes extérieurs coupés au niveau du résolveur, PAS par page.route : intercepter les requêtes désactive le cache HTTP de Playwright, et c'est lui qu'on teste.
const NO_NET = '--host-resolver-rules=MAP fonts.googleapis.com ~NOTFOUND, MAP fonts.gstatic.com ~NOTFOUND, MAP *.supabase.co ~NOTFOUND';
try { browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', NO_NET] }); } catch { server.close(); skip('Chromium introuvable'); }
let failures = 0, n = 0;
async function test(name, fn) { n++; try { await fn(); console.log('  ok   ' + name); } catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 6).join('\n       ')); } }

async function freshPage() {
  const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 960, height: 540 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page, errors };
}
// Lit une valeur de la page en survivant aux rechargements (la garde recharge la page elle-même).
async function poll(page, fn, ms) {
  const t0 = Date.now();
  let v;
  while (Date.now() - t0 < ms) { try { v = await page.evaluate(fn); if (v) return v; } catch { /* page en cours de rechargement */ } await page.waitForTimeout(250); }
  return v;
}
const visible = () => { const w = document.getElementById('welcome'); return !!window.__copytrackBooted && !!w && !w.classList.contains('hidden'); };

console.log('Démarrage après une mise en ligne');
await test('chargement normal : le jeu démarre, aucune réparation ni rechargement', async () => {
  state.piecesOld = false; state.hits.nav = 0;
  const { ctx, page, errors } = await freshPage();
  await page.goto(BASE + '/');
  assert.ok(await poll(page, visible, 20000), 'écran d’accueil');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('copytrack.repair')), null);
  assert.equal(state.hits.nav, 1, 'une seule page chargée');
  assert.deepEqual(errors, []);
  await ctx.close();
});
await test('un ancien js/pieces.js gardé par le cache HTTP à côté des nouveaux modules : la garde le voit, recharge les fichiers et le jeu démarre (avant : bloqué sur « Chargement… »)', async () => {
  const { ctx, page, errors } = await freshPage();
  state.piecesOld = true;
  await page.goto(BASE + '/__blank');
  await page.evaluate(() => fetch('js/pieces.js').then((r) => r.text()));      // l'ancienne version entre dans le cache HTTP (max-age=600)
  state.piecesOld = false; state.hits.nav = 0; state.hits.piecesReload = 0;      // « mise en ligne »
  await page.goto(BASE + '/');
  assert.ok(await poll(page, visible, 30000), 'le jeu a démarré');
  assert.ok(errors.some((m) => /rolledRibbon/.test(m)), 'le mélange de versions a bien été reproduit : ' + errors.join(' | '));
  assert.ok(state.hits.piecesReload >= 1, 'js/pieces.js redemandé au serveur en contournant le cache');
  assert.equal(state.hits.nav, 2, 'une seule réparation : la page est rechargée une fois');
  assert.ok(await poll(page, () => sessionStorage.getItem('copytrack.repair') === null, 3000), 'la garde est désarmée après le démarrage (une prochaine mise à jour pourra réparer à nouveau)');
  await ctx.close();
});
await test('serveur durablement incohérent : un seul essai de réparation, puis un message et un bouton « Réessayer » (jamais de boucle de rechargements)', async () => {
  const { ctx, page } = await freshPage();
  state.piecesOld = true; state.hits.nav = 0;
  await page.goto(BASE + '/');
  const msg = await poll(page, () => { const b = document.querySelector('#loading .boot-retry'); return b ? document.querySelector('#loading .tagline').textContent : ''; }, 30000);
  assert.match(msg || '', /n’a pas pu démarrer/);
  await page.waitForTimeout(1500);
  assert.equal(state.hits.nav, 2, 'chargée deux fois, pas plus : ' + state.hits.nav);
  assert.equal(await page.evaluate(() => !!window.__copytrackBooted), false);
  state.piecesOld = false;      // la mise en ligne se termine : le bouton répare
  await page.locator('#loading .boot-retry').click();
  assert.ok(await poll(page, visible, 30000), 'après « Réessayer », le jeu démarre');
  await ctx.close();
});

await browser.close();
server.close();
console.log(failures ? `\n${failures} test(s) en échec sur ${n}` : `\nTous les tests navigateur du démarrage passent (${n}).`);
process.exit(failures ? 1 : 0);
