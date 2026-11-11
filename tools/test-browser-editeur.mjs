// Éditeur dans un vrai navigateur (Chromium) : node tools/test-browser-editeur.mjs   (npm run test:browser)
// Phase 1 après l'audit 0.9.59 : touche P (Prolonger) pour dérouler une route, pastille et fenêtre des problèmes (raccord impossible),
// annuler / rétablir (Ctrl+Z) avec la sélection de zone, fenêtre lisible sur un petit écran. Playwright absent : test ignoré (REQUIRE_BROWSER / CI : échec).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const REQUIRED = !!(process.env.CI || process.env.REQUIRE_BROWSER);
let chromium;
const skip = (why) => { console.log((REQUIRED ? '  FAIL ' : '  skip ') + why); process.exit(REQUIRED ? 1 : 0); };
try { ({ chromium } = require('playwright')); } catch { skip('playwright introuvable'); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9800 + Math.floor(Math.random() * 150);
const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
const shots = process.env.PW_SHOTS; if (shots) mkdirSync(shots, { recursive: true });
let browser;
try { browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] }); } catch (e) { server.kill(); skip('Chromium introuvable'); }
let failures = 0, n = 0;
const errors = [];
async function test(name, fn) { n++; try { await fn(); console.log('  ok   ' + name); } catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 7).join('\n       ')); } }

async function open(w, h) {
  const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: w, height: h }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  await new Promise((r) => setTimeout(r, 500));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.locator('#wl-name').fill('Ed'); await page.locator('#wl-submit').evaluate((el) => el.click());
  await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 30000, polling: 100 });
  await page.evaluate(() => { const A = window.copytrack; A.settings.tutorialDone = true; A.settings.telemetry = false; A.settings.edGuided = false; A.saveSettings(); A.ui.closeModal(); });
  await page.waitForTimeout(700); await page.evaluate(() => window.copytrack.ui.closeModal());
  await page.evaluate(async () => {
    const { scriptTrack } = await import('/js/track.js');
    await window.copytrack.openEditor({ code: scriptTrack('Essai', 'start', { l: 8 }).encode(), name: 'Essai' });
  });
  await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.kind === 'editor', null, { timeout: 30000, polling: 100 });
  await page.evaluate(() => { const A = window.copytrack; A.ui.closeModal(); A.settings.tutorialDone = true; });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const ed = window.copytrack.session; ed.setTab && ed.setTab('pieces'); ed.setTool('straight'); });
  return { ctx, page };
}
const ed = (page, fn, arg) => page.evaluate(fn, arg);
// Une touche = une pose : on attend que la pose soit faite avant la suivante (le rendu logiciel est lent : deux appuis dans la même image n'en feraient qu'un).
const press = async (page, key, n = 1) => {
  for (let i = 0; i < n; i++) {
    const before = await page.evaluate(() => window.copytrack.session.track.tiles.length);
    await page.keyboard.press(key);
    await page.waitForFunction((b) => window.copytrack.session.track.tiles.length !== b, before, { timeout: 8000, polling: 50 });
  }
};

try {
  await test('touche P (Prolonger) : une route se déroule sans viser les cases : ligne, virage, pente, mur (orientation reprise) ; chaque pièce est raccordée', async () => {
    const { ctx, page } = await open(1280, 720);
    const seq = [['straight', 3], ['curve', 1], ['straight', 1], ['cro1', 1], ['straight', 1], ['tr01s', 1], ['straight', 2], ['curve', 1], ['tr10s', 1], ['straight', 1]];
    for (const [t, k] of seq) { await ed(page, (t) => window.copytrack.session.setTool(t), t); await press(page, 'KeyP', k); }
    const r = await ed(page, async () => { const E = window.copytrack.session; const { checkTrack } = await import('/js/editorTools.js'); const { continuityIssues } = await import('/js/continuity.js'); return { n: E.track.tiles.length, types: E.track.tiles.map((t) => t.t + (t.o ? '/o' + t.o : '')), free: checkTrack(E.track).filter((i) => /extrémité/.test(i.msg) && i.level === 'error').length, bad: continuityIssues(E.track).filter((i) => i.level !== 'info').map((i) => i.code) }; });
    assert.equal(r.n, 1 + 3 + 1 + 1 + 1 + 1 + 1 + 2 + 1 + 1 + 1, r.types.join(' '));
    assert.ok(r.types.includes('straight/o1') && r.types.includes('curve/o1'), 'la route sur le mur garde son orientation : ' + r.types.join(' '));
    assert.deepEqual(r.bad, [], 'aucun défaut de continuité');
    assert.equal(r.free, 1, 'une seule extrémité libre : le bout de la route');
    await ctx.close();
  });
  await test('raccord impossible (route à l\'endroit contre une route au plafond) : la pastille devient ⛔, la fenêtre dit où / pourquoi / conséquence / remède', async () => {
    const { ctx, page } = await open(1280, 720);
    await ed(page, (t) => window.copytrack.session.setTool(t), 'straight'); await press(page, 'KeyP', 3);
    // (phase 2 : la vrille sans « Inversion de gravité » n\'est plus une erreur, la gravité suit la route : on fabrique un vrai défaut, une route posée à l\'envers face à une route à l\'endroit)
    await ed(page, async () => { const E = window.copytrack.session; const { Track } = await import('/js/track.js'); const last = E.track.tiles[E.track.tiles.length - 1]; E.track.add(Track.normalize({ t: 'straight', x: last.x, z: last.z - 1, l: last.l, r: last.r, v: 1 })); E._changed(); });
    await page.waitForTimeout(300);
    const badge = await page.locator('#ed-warn').textContent();
    assert.match(badge, /⛔/, 'pastille : ' + badge);
    await page.locator('#ed-warn').evaluate((el) => el.click());
    await page.waitForSelector('.ed-issue.error', { timeout: 5000 });
    assert.ok(!/reliée à rien/.test(await page.locator('.ed-issue.error').first().innerText()), 'une extrémité libre n\'est pas une erreur bloquante');
    if (shots) await page.screenshot({ path: join(shots, 'editeur-problemes.png') });
    const txt = await page.locator('.ed-issue.error').first().innerText();
    assert.match(txt, /Où \/ pourquoi/); assert.match(txt, /Conséquence/); assert.match(txt, /Comment corriger/);
    assert.equal(await page.locator('.ed-issue.error button.primary').count(), 0, 'plus de correction en un clic : la règle « invert » n\'existe plus');
    await ctx.close();
  });
  await test('sélection de zone : supprimer puis Ctrl+Z redonne les pièces ET le rectangle (avant : le rectangle restait tel quel) ; la barre de sélection suit', async () => {
    const { ctx, page } = await open(1280, 720);
    await ed(page, (t) => window.copytrack.session.setTool(t), 'straight'); await press(page, 'KeyP', 5);
    await ed(page, () => { const E = window.copytrack.session; E.setTool('select'); E.sel = { x0: 0, z0: -4, x1: 0, z1: -2 }; E._noteSel(); E._refreshSelBar(); });
    const before = await ed(page, () => window.copytrack.session.track.tiles.length);
    await ed(page, () => window.copytrack.session.deleteSel());
    assert.equal(await ed(page, () => window.copytrack.session.track.tiles.length), before - 3);
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
    const r = await ed(page, () => { const E = window.copytrack.session; return { n: E.track.tiles.length, sel: E.sel, bar: !document.getElementById('ed-selbar').classList.contains('hidden') }; });
    assert.equal(r.n, before); assert.deepEqual(r.sel, { x0: 0, z0: -4, x1: 0, z1: -2 }); assert.equal(r.bar, true, 'la barre de sélection est affichée');
    await ctx.close();
  });
  await test('petit écran (640 × 360) : la fenêtre des problèmes reste dans l\'écran, défile, et son bouton « Fermer » est atteignable', async () => {
    const { ctx, page } = await open(640, 360);
    for (const [t, k] of [['straight', 2], ['twist', 1], ['straight', 1]]) { await ed(page, (t) => window.copytrack.session.setTool(t), t); await press(page, 'KeyP', k); }
    await page.waitForTimeout(300);
    await page.locator('#ed-warn').evaluate((el) => el.click());
    await page.waitForSelector('.ed-issue', { timeout: 5000 });
    const r = await page.evaluate(() => { const p = document.querySelector('#modal .modal-panel').getBoundingClientRect(), b = [...document.querySelectorAll('#modal-actions button')].map((x) => x.getBoundingClientRect()); return { top: p.top, bottom: p.bottom, h: window.innerHeight, w: window.innerWidth, left: p.left, right: p.right, btn: b.map((x) => [x.top, x.bottom]) }; });
    assert.ok(r.top >= -1 && r.bottom <= r.h + 1 && r.left >= -1 && r.right <= r.w + 1, JSON.stringify(r));
    assert.ok(r.btn.every(([t, b]) => t >= 0 && b <= r.h + 1), 'bouton Fermer à l\'écran : ' + JSON.stringify(r.btn));
    await ctx.close();
  });
  await test('un circuit correct : la pastille ne montre que des conseils (ℹ), jamais ⛔ ni ⚠', async () => {
    const { ctx, page } = await open(1280, 720);
    for (const [t, k] of [['straight', 3], ['loop', 1], ['straight', 2], ['curve', 1], ['straight', 1], ['finish', 1]]) { await ed(page, (t) => window.copytrack.session.setTool(t), t); await press(page, 'KeyP', k); }
    await page.waitForTimeout(300);
    const badge = (await page.locator('#ed-warn').textContent()) || '';
    assert.ok(!/⛔|⚠/.test(badge), 'pastille : « ' + badge + ' »');
    await ctx.close();
  });
} finally {
  await browser.close(); server.kill();
}
if (errors.length) { failures++; console.log('  FAIL erreurs de page : ' + errors.slice(0, 3).join(' | ')); }
console.log(failures ? `\n${failures} échec(s) sur ${n}` : `\nTous les tests navigateur de l'éditeur (phase 1) passent (${n}).`);
process.exit(failures ? 1 : 0);
