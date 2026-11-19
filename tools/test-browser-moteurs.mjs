// Le jeu dans les TROIS moteurs de navigateur (phase 3 de la 1.0) : Chromium (Chrome, Edge), Firefox (Gecko) et WebKit (Safari).
// Parcours court mais complet dans chacun : accueil, pseudo invité, menu, image 3D dessinée, une course (la voiture avance au clavier), l'éditeur,
// l'anglais, les pages légales ; aucune erreur JavaScript. La suite complète (test-browser.mjs) tourne dans Chromium ; celle-ci prouve que les deux
// autres moteurs font tourner le jeu.
//   node tools/test-browser-moteurs.mjs                        Chromium seulement (le navigateur préinstallé ici)
//   BROWSERS=firefox,webkit node tools/test-browser-moteurs.mjs   (CI : npx playwright install --with-deps firefox webkit)
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { console.log('SKIP test-browser-moteurs : Playwright absent'); process.exit(process.env.REQUIRE_BROWSER ? 1 : 0); }
const ENGINES = (process.env.BROWSERS || 'chromium').split(',').map((s) => s.trim()).filter(Boolean);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = normalize(join(root, p));
  if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; }
  try { const body = await readFile(f); res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const LAUNCH = { chromium: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] }, firefox: { firefoxUserPrefs: { 'webgl.force-enabled': true, 'media.autoplay.default': 0 } }, webkit: {} };
let failures = 0, total = 0;

for (const engine of ENGINES) {
  console.log(`\n${engine}`);
  let browser;
  try { browser = await pw[engine].launch(LAUNCH[engine] || {}); }
  catch (e) { failures++; console.log(`  FAIL ${engine} ne démarre pas : ${String(e.message).split('\n')[0]}`); continue; }
  const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [], consoleErr = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErr.push(m.text().slice(0, 200)); });
  await page.route(/supabase\.co/, (r) => r.abort());      // (aucun serveur en ligne : le jeu doit le dire, pas planter)
  const app = (fn, arg) => page.evaluate(fn, arg);
  const wait = (fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
  const step = async (name, fn) => {
    total++;
    try { await fn(); console.log(`  ok   ${name}`); }
    catch (e) {
      failures++;
      // Diagnostic : écran de démarrage, WebGL disponible ou non, erreurs de la console (une erreur attrapée par le jeu n'est pas une « pageerror »).
      const st = await page.evaluate(() => ({ jeu: typeof window.copytrack, accueil: !document.getElementById('welcome').classList.contains('hidden'),
        chargement: (document.querySelector('#loading .tagline') || {}).textContent, webgl2: !!document.createElement('canvas').getContext('webgl2'),
        webgl1: !!document.createElement('canvas').getContext('webgl') })).catch((x) => ({ illisible: x.message }));
      console.log(`  FAIL ${name}\n       ${String(e.message).split('\n').slice(0, 3).join('\n       ')}\n       état : ${JSON.stringify(st)}${consoleErr.length ? `\n       console : ${consoleErr.slice(-4).join(' | ')}` : ''}`);
    }
  };
  await step('accueil, pseudo invité, menu', async () => {
    await page.goto(BASE + '/index.html');
    await wait(() => { const w = document.getElementById('welcome'); return w && !w.classList.contains('hidden') && getComputedStyle(w).position === 'fixed'; });
    await page.fill('#wl-name', 'Moteur');
    await page.click('#wl-submit');
    await wait(() => window.copytrack && window.copytrack.mode === 'menu');
    await app(() => { const A = window.copytrack; A.settings.tutorialDone = true; A.settings.telemetry = false; A.saveSettings(); A.ui.closeModal(); });
  });
  await step('WebGL : la scène 3D se dessine (images comptées)', async () => {
    const f0 = await app(() => window.copytrack.renderer.info.render.frame);
    await page.waitForTimeout(1500);
    const f1 = await app(() => window.copytrack.renderer.info.render.frame);
    assert.ok(f1 > f0, `aucune image dessinée en 1,5 s (${f0} → ${f1})`);
    assert.ok(await app(() => !!window.copytrack.renderer.getContext()), 'contexte WebGL');
  });
  await step('course : départ, la voiture avance à l’accélérateur, retour au menu', async () => {
    await app(() => window.copytrack.playBuiltin(0));
    await wait(() => window.copytrack.mode === 'race' && window.copytrack.session && window.copytrack.session.state === 'racing');
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(2000);
    const v = await app(() => { const ph = window.copytrack.session.phys; return Math.hypot(ph.vel.x, ph.vel.z); });
    await page.keyboard.up('ArrowUp');
    assert.ok(v > 3, `vitesse ${v.toFixed(2)} m/s`);
    await app(() => window.copytrack.quitRace());
    await wait(() => window.copytrack.mode === 'menu');
  });
  await step('éditeur : un circuit officiel s’ouvre et se dessine', async () => {
    await app(() => window.copytrack.openEditor({ code: window.copytrack.builtins[1].track.encode(), name: 'Moteur' }));
    await wait(() => window.copytrack.mode === 'editor' && window.copytrack.session && window.copytrack.session.track && window.copytrack.session.track.tiles.length > 10);
    await page.waitForTimeout(800);
    await app(() => window.copytrack.leaveEditor());
    await wait(() => window.copytrack.mode === 'menu');
  });
  await step('anglais, puis pages légales (fenêtre du jeu)', async () => {
    await app(async () => { const m = await import('/js/i18n/boot.js'); await m.switchLanguage('en', { persist: false }); });
    await wait(() => /Play/.test(document.querySelector('[data-action="sub-play"]').textContent));
    await app(() => window.copytrack.showLegal('confidentialite'));
    await wait(() => /Privacy/.test(document.getElementById('modal-title').textContent));
    await app(() => window.copytrack.ui.closeModal());
  });
  await step('aucune erreur JavaScript pendant tout le parcours', async () => assert.deepEqual(errors, []));
  await browser.close();
}
server.close();
console.log(failures ? `\n${failures} échec(s) sur ${total}` : `\nLe jeu tourne dans ${ENGINES.join(', ')} (${total} étapes).`);
process.exit(failures ? 1 : 0);
