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

// Firefox : sans écran, il ne trouve aucun pilote OpenGL sur une machine de CI (« Exhausted GL driver options ») ; MOTEURS_HEADED=1 le lance avec un écran
// virtuel (xvfb-run) et le rendu logiciel de Mesa (llvmpipe), comme un ordinateur sans carte graphique (voir .github/workflows/test.yml).
const HEADED = !!process.env.MOTEURS_HEADED;
const LAUNCH = { chromium: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] },
  firefox: { headless: !HEADED, firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disable-fail-if-major-performance-caveat': true, 'media.autoplay.default': 0 } }, webkit: {} };
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
    // 0.13.1 : les réglages de la pièce se replient d'un clic sur leur titre (ils cachaient le bas de la palette), et le choix est gardé
    const fold = await app(async () => {
      const set = document.getElementById('ed-pset'), head = set && set.querySelector('.pset-head');
      if (!head || set.hidden) return 'réglages absents';
      const was = set.classList.contains('folded'); head.click(); await new Promise((r) => setTimeout(r, 50));
      const r = { toggled: set.classList.contains('folded') !== was, saved: !!window.copytrack.settings.psetFolded === set.classList.contains('folded'), acts: getComputedStyle(set.querySelector('.pset-acts')).display };
      head.click(); return r;
    });
    assert.ok(fold.toggled && fold.saved, JSON.stringify(fold));
    await app(() => window.copytrack.leaveEditor());
    await wait(() => window.copytrack.mode === 'menu');
  });
  await step('contexte WebGL perdu puis rendu : la course passe en pause, le joueur est prévenu, l’affichage reprend', async () => {
    await app(() => window.copytrack.playBuiltin(0));
    await wait(() => window.copytrack.mode === 'race' && window.copytrack.session && window.copytrack.session.state === 'racing');
    await app(() => { window.__lc = window.copytrack.renderer.getContext().getExtension('WEBGL_lose_context'); window.__lc.loseContext(); });
    await wait(() => window.copytrack._glLost === true && /interrompu/.test(document.getElementById('toast').textContent));
    assert.notEqual(await app(() => window.copytrack.session.state), 'racing', 'la course n’avance plus pendant la perte');
    await app(() => window.__lc.restoreContext());
    await wait(() => window.copytrack._glLost === false);
    const f0 = await app(() => window.copytrack.renderer.info.render.frame);
    await page.waitForTimeout(1200);
    assert.ok((await app(() => window.copytrack.renderer.info.render.frame)) > f0, 'les images reprennent');
    await app(() => window.copytrack.quitRace());
    await wait(() => window.copytrack.mode === 'menu');
  });
  await step('clavier : les flèches parcourent les tuiles de l’accueil, Entrée ouvre un panneau, Échap y revient', async () => {
    await app(() => { const A = window.copytrack; A.ui.closeModal(); A.showMenu('menu'); document.activeElement && document.activeElement.blur(); });
    await wait(() => !document.getElementById('menu').classList.contains('hidden') && !document.getElementById('menu-tiles').classList.contains('hidden'));
    const onTile = () => app(() => { const a = document.activeElement; return !!(a && a.closest('#menu-tiles') && /^sub-/.test(a.dataset.action || '')) && a.dataset.action; });
    let tile = false;
    for (let i = 0; i < 8 && !tile; i++) { await page.keyboard.press(i ? 'ArrowRight' : 'ArrowDown'); tile = await onTile(); }
    assert.ok(tile, 'une tuile reçoit le focus aux flèches');
    await page.keyboard.press('ArrowRight');
    const tile2 = await onTile();
    assert.ok(tile2 && tile2 !== tile, `→ passe à la tuile voisine (${tile} → ${tile2})`);
    await page.keyboard.press('Enter');
    await wait(() => document.getElementById('menu-tiles').classList.contains('hidden'));
    await page.keyboard.press('Escape');
    await wait(() => !document.getElementById('menu-tiles').classList.contains('hidden'));
  });
  await step('avis d’un testeur : le formulaire se remplit et s’envoie (serveur simulé), sans pseudo par défaut', async () => {
    let sent = null;
    await page.route(/rpc\/submit_feedback/, async (r) => { sent = JSON.parse(r.request().postData()).f; await r.fulfill({ status: 200, contentType: 'application/json', body: '17' }); });
    // (Échap vient d'être appuyé à l'étape précédente : la fenêtre ne doit pas se refermer toute seule au tour suivant de la boucle.)
    await app(() => { const A = window.copytrack; A.showMenu('menu'); A.showFeedback(); });
    await wait(() => !!document.querySelector('.feedback-form') && !document.getElementById('modal').classList.contains('hidden'));
    await page.waitForTimeout(300);
    assert.ok(await app(() => window.copytrack.ui.modalOpen && !document.getElementById('modal').classList.contains('hidden')), 'la fenêtre d’avis reste ouverte');
    await app(() => {
      const f = document.querySelector('.feedback-form'), pick = (n, v) => { f.querySelector(`input[name="${n}"][value="${v}"]`).checked = true; };
      pick('fb-experience', 'habitue');
      for (const [k, v] of [['fun', 4], ['drift', 0], ['walls', -1], ['air', 1], ['difficulty', 0], ['camera', 5]]) pick('fb-' + k, v);
      f.querySelector('textarea[name="comment"]').value = 'Essai automatique';
    });
    await page.click('#modal-actions .btn.primary');
    await wait(() => /Merci/.test(document.getElementById('toast').textContent));
    assert.ok(sent && sent.experience === 'habitue' && sent.walls === -1 && sent.comment === 'Essai automatique' && !('pseudo' in sent), JSON.stringify(sent));
  });
  await step('publication d’un circuit (serveur simulé) : un échec laisse la fenêtre ouverte avec l’erreur, le nouvel essai publie ; Échap = annuler', async () => {
    const run = JSON.parse(await readFile(join(root, 'tools/compat/corpus.json'), 'utf8')).runs[0];      // course du pilote sur « Premiers Éclats »
    let fails = 1, sent = 0;
    const handler = async (r) => {
      const url = r.request().url(), J = (b, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
      if (url.includes('/auth/v1/')) return J({ access_token: 'jeton', refresh_token: 'r', expires_in: 3600, user: { id: '00000000-0000-0000-0000-0000000000e1' } });
      if (url.includes('/functions/v1/submit-score')) { sent++; return fails-- > 0 ? J({ error: 'Serveur occupé, réessaie.' }, 503) : J({ ok: true, id: 'x' }); }
      if (r.request().method() === 'POST') return r.fulfill({ status: 201, body: '' });
      return J([]);
    };
    await page.route(/supabase\.co/, handler);
    try {
      const open = () => app(async (run) => {
        const A = window.copytrack, { buildBuiltin, BUILTIN_TRACKS } = await import('/js/tracks.js');
        if (A.mode !== 'editor') await A.openEditor({ code: buildBuiltin(BUILTIN_TRACKS[0]).encode(), name: 'Mon circuit' });
        const S = A.session; S.lastRun = { inputs: run.inputs, time: run.time };
        A.editorState = { code: S.track.encode(), name: S.track.name };
        window.__pub = 'attente'; A.publishTrack(S.track).then((v) => { window.__pub = v; });
      }, run);
      await open();
      await app(async (run) => { const A = window.copytrack; if (!A.session.track.verified) { A.onEditorTestFinished(run.time, A.session.track); await new Promise((r) => setTimeout(r, 1000)); A.ui.closeModal(); } }, run);
      await open();
      await wait(() => /Publier dans la communauté/.test(document.getElementById('modal-title').textContent));
      // Échap (fermeture sans bouton) : la publication est annulée
      await app(() => window.copytrack.ui.closeModal());
      await wait(() => window.__pub === false);
      await open();
      await wait(() => !!document.getElementById('pub-name'));
      await page.fill('#pub-name', 'Essai moteurs'); await page.check('#pub-ok');
      const pub = () => app(() => [...document.querySelectorAll('#modal-actions button')].find((x) => /Publier/.test(x.textContent)).click());
      await pub();
      await wait(() => /occupé|impossible|503/i.test(document.getElementById('pub-err').textContent));
      assert.ok(await app(() => !document.getElementById('modal').classList.contains('hidden')), 'la fenêtre reste ouverte après l’échec');
      await pub();
      await wait(() => window.__pub === true);
      assert.equal(sent, 2);
      await app(() => { const A = window.copytrack; if (A.mode === 'editor') A.leaveEditor(); A.ui.closeModal(); A.showMenu('menu'); });
    } finally { await page.unroute(/supabase\.co/, handler); }
  });
  await step('nouvelle version en ligne : le bandeau « Recharger » apparaît (version simulée), « Plus tard » le retire', async () => {
    await page.route(/js\/version\.js\?u=/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: "export const VERSION = 'bêta 9.9.9';" }));
    assert.equal(await app(() => window.copytrack._update.check(true)), true);
    await wait(() => /9\.9\.9/.test((document.getElementById('update-bar') || {}).textContent || ''));
    const vis = await app(() => getComputedStyle(document.getElementById('update-bar')).display !== 'none');
    assert.ok(vis, 'visible à l’accueil');
    await page.click('#update-bar [data-up="later"]');
    await wait(() => !document.getElementById('update-bar'));
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
