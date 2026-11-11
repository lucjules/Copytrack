// AUDIT 0.9.59 — interface, dans un vrai navigateur (Chromium sans écran, WebGL logiciel) : node tools/test-browser-audit.mjs   (npm run test:browser)
// Défauts visuels et de comportement trouvés par le parcours de tous les écrans à huit tailles (360×640 … 1920×1080), chacun vérifié ici sur la page réelle :
//   1. Accueil : six tuiles sur une rangée ou 3 + 3, jamais 5 + 1.
//   2. Garage en portrait (téléphone) : la voiture entière est visible à gauche du panneau (elle était dessous).
//   3. Garage en paysage bas : plus d'un élément de la liste est visible (les onglets prenaient quatre rangées).
//   4. Paramètres › Commandes : le titre, les onglets et la consigne des touches sont dans un panneau (ils flottaient sur la scène 3D).
//   5. Onglet masqué : la course en solo passe en pause ; écran « tourne ton téléphone » : la course n'avance pas derrière lui.
//   6. Recommencer juste après « GO ! » : le « 3 » du nouveau décompte n'est pas effacé par l'ancienne minuterie.
//   7. Voiture immobile gaz à fond depuis 3 s : le message « Bloqué ? R : retour au checkpoint » s'affiche (une fois).
//   8. Chrono : jamais « :60.000 » à l'écran.
// Playwright absent : test ignoré en local, ÉCHEC en CI (comme tools/test-browser.mjs).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const REQUIRED = !!(process.env.CI || process.env.REQUIRE_BROWSER);
const skip = (why) => { console.log((REQUIRED ? '  FAIL ' : '  skip ') + why + (REQUIRED ? ' : le test navigateur est OBLIGATOIRE ici (CI / REQUIRE_BROWSER)' : ' : test navigateur ignoré')); process.exit(REQUIRED ? 1 : 0); };
let chromium;
try { ({ chromium } = require('playwright')); } catch { skip('playwright introuvable'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8700 + Math.floor(Math.random() * 90);
const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
let browser;
try { browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] }); }
catch (e) { server.kill(); skip('Chromium introuvable (' + String(e.message).split('\n')[0] + ')'); }

let failures = 0, executed = 0;
const errors = [];
async function test(name, fn) {
  const before = errors.length;
  executed++;
  try { await fn(); if (errors.length > before) throw new Error('erreurs de la page : ' + errors.slice(before).join(' | ')); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 8).join('\n       ')); }
}
const OFFLINE = /fonts\.(googleapis|gstatic)|supabase\.co|net::ERR|Failed to load resource|ERR_INTERNET_DISCONNECTED/;

// Une page neuve à la taille voulue, entrée en invité, tutoriel et question des statistiques écartés.
async function open(w, h, touch = false) {
  const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: w, height: h }, deviceScaleFactor: 1, serviceWorkers: 'block', hasTouch: touch, isMobile: touch && w < 900 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.locator('#wl-name').fill('Audit');
  await page.locator('#wl-submit').evaluate((el) => el.click());
  await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 30000, polling: 100 });
  await page.evaluate(() => { const A = window.copytrack; A.settings.tutorialDone = true; A.settings.telemetry = false; A.saveSettings(); A.ui.closeModal(); });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.copytrack.ui.closeModal());
  return { ctx, page };
}

try {
  await test('accueil : les six tuiles tiennent sur une rangée (écran large) ou sur deux rangées de trois (écran étroit) — jamais 5 + 1 ; aucune ne sort de l\'écran', async () => {
    for (const [w, h, touch] of [[1920, 1080, false], [1366, 768, false], [1024, 768, false], [768, 1024, true], [390, 844, true], [360, 640, true], [844, 390, true], [640, 360, true]]) {
      const { ctx, page } = await open(w, h, touch);
      const r = await page.evaluate(() => {
        const bs = [...document.querySelectorAll('#menu-tiles .btn.big')].map((b) => b.getBoundingClientRect());
        const rows = {}; for (const b of bs) rows[Math.round(b.top)] = (rows[Math.round(b.top)] || 0) + 1;
        return { rows: Object.values(rows), out: bs.filter((b) => b.left < -1 || b.right > window.innerWidth + 1 || b.top < -1).length, n: bs.length };
      });
      assert.equal(r.n, 6, `${w}×${h} : six tuiles`);
      assert.ok(r.rows.join('+') === '6' || r.rows.join('+') === '3+3', `${w}×${h} : rangées ${r.rows.join(' + ')}`);
      assert.equal(r.out, 0, `${w}×${h} : aucune tuile hors de l'écran`);
      await ctx.close();
    }
  });

  await test('garage : en portrait la voiture entière est visible à gauche du panneau ; en paysage bas la liste montre plusieurs éléments ; sur grand écran rien ne change', async () => {
    // Boîte de la voiture projetée à l'écran (tous les sommets de ses maillages), comparée à la partie de l'écran que le panneau ne couvre pas.
    const carBox = () => {
      const A = window.copytrack, S = A.session, cam = A.camera, w = window.innerWidth, h = window.innerHeight;
      cam.updateMatrixWorld(); S.car.group.updateMatrixWorld(true);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      const v = S.car.group.position.clone();
      S.car.group.traverse((o) => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
        for (let q = o; q; q = q.parent) if (!q.visible) return;          // (les autres véhicules du modèle — moto, bateau, aile — sont là mais cachés)
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).project(cam); const sx = (v.x + 1) / 2 * w, sy = (1 - v.y) / 2 * h; if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy; }
      });
      const panel = document.getElementById('garage').getBoundingClientRect(), list = document.querySelector('.garage-list'), lr = list.getBoundingClientRect();
      const full = [...list.children].filter((c) => { const b = c.getBoundingClientRect(); return b.top >= lr.top - 1 && b.bottom <= lr.bottom + 1; }).length;
      return { x0, x1, y0, y1, panelLeft: panel.left, w, h, full };
    };
    for (const [w, h, touch, label] of [[390, 844, true, 'portrait'], [360, 640, true, 'portrait'], [844, 390, true, 'paysage bas'], [1366, 768, false, 'grand écran']]) {
      const { ctx, page } = await open(w, h, touch);
      await page.evaluate(() => window.copytrack.openGarage());
      await page.waitForTimeout(1200);
      // Tout un tour : la voiture tourne sur elle-même, elle doit rester visible sous tous les angles.
      for (const a of [0, 1.57, 3.14, 4.71]) {
        await page.evaluate((ang) => { const S = window.copytrack.session; S.angle = ang; S.idle = 99; }, a);
        await page.waitForTimeout(250);
        const b = await page.evaluate(carBox);
        assert.ok(Number.isFinite(b.x0) && b.x1 > b.x0, 'voiture projetée');
        if (label === 'portrait') {
          assert.ok(b.x0 >= -2, `${w}×${h} angle ${a} : la voiture ne sort pas à gauche (${b.x0.toFixed(0)})`);
          assert.ok(b.x1 <= b.panelLeft + 40, `${w}×${h} angle ${a} : la voiture n'est pas sous le panneau (bord droit ${b.x1.toFixed(0)}, panneau à ${b.panelLeft.toFixed(0)})`);
        }
        assert.ok(b.y0 >= -2 && b.y1 <= b.h + 2, `${w}×${h} : voiture dans la hauteur de l'écran`);
      }
      const b = await page.evaluate(carBox);
      if (label === 'paysage bas') assert.ok(b.full >= 2, `${w}×${h} : ${b.full} élément(s) entièrement visibles dans la liste (au moins 2)`);
      if (label === 'grand écran') assert.ok(b.x1 - b.x0 > 250, 'sur grand écran la voiture garde sa taille');
      await ctx.close();
    }
  });

  await test('paramètres › commandes : le titre, les onglets et la consigne des touches sont DANS un panneau (fond opaque), plus à même la scène 3D', async () => {
    for (const [w, h, touch] of [[1366, 768, false], [390, 844, true]]) {
      const { ctx, page } = await open(w, h, touch);
      await page.evaluate(() => window.copytrack.showScreen('controls'));
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => {
        const inPanel = (el) => { const p = el.closest('.panel'); return !!p && parseFloat(getComputedStyle(p).backgroundColor.split(',')[3] || '1') > 0.3; };
        const h3 = [...document.querySelectorAll('[data-ppanel="controls"] h3')].find((e) => /Touches/.test(e.textContent));
        const tabs = document.getElementById('bind-tabs'), hint = document.getElementById('bind-hint');
        const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
        return { h3: !!h3 && inPanel(h3) && vis(h3), tabs: inPanel(tabs) && vis(tabs), hint: inPanel(hint) && vis(hint), tabsN: tabs.querySelectorAll('.tab').length, wide: document.documentElement.scrollWidth <= window.innerWidth + 1 };
      });
      assert.deepEqual(r, { h3: true, tabs: true, hint: true, tabsN: 3, wide: true }, `${w}×${h}`);
      // Les onglets fonctionnent toujours.
      await page.locator('#bind-tabs [data-tab="pad"]').evaluate((el) => el.click());
      await page.waitForTimeout(200);
      assert.ok(await page.evaluate(() => document.querySelector('#bind-tabs [data-tab="pad"]').classList.contains('on')), 'onglet Manette actif');
      await ctx.close();
    }
  });

  await test('onglet masqué pendant une course en solo : la course passe en pause (elle reprenait seule, voiture lancée) ; l\'écran « tourne ton téléphone » met aussi en pause', async () => {
    const { ctx, page } = await open(1280, 720);
    await page.evaluate(() => window.copytrack.playBuiltin(0));
    await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, { timeout: 30000, polling: 100 });
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.evaluate(() => window.copytrack.session.state), 'paused', 'en pause dès que l\'onglet est masqué');
    assert.ok(await page.evaluate(() => !document.getElementById('pause').classList.contains('hidden')), 'écran de pause affiché');
    const steps = await page.evaluate(() => window.copytrack.session.logic.steps);
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => window.copytrack.session.state), 'paused', 'au retour, toujours en pause : le joueur reprend quand il veut');
    assert.equal(await page.evaluate(() => window.copytrack.session.logic.steps), steps, 'le chrono n\'a pas avancé');
    await page.evaluate(() => window.copytrack.session.resume());
    await page.waitForFunction((s) => window.copytrack.session.logic.steps > s, steps, { timeout: 15000, polling: 100 });
    // Pendant le décompte aussi ; puis la reprise relance le décompte.
    await page.evaluate(() => window.copytrack.session.restart());
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.evaluate(() => window.copytrack.session.state), 'paused');
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); window.copytrack.session.resume(); });
    assert.equal(await page.evaluate(() => window.copytrack.session.state), 'countdown');
    await ctx.close();
    // Téléphone en portrait : la course est lancée mais l'écran demande de tourner l'appareil → elle attend en pause.
    const m = await open(390, 844, true);
    await m.page.evaluate(() => window.copytrack.playBuiltin(0));
    await m.page.waitForTimeout(2600);
    const st = await m.page.evaluate(() => ({ hint: !document.getElementById('rotate-hint').classList.contains('hidden'), state: window.copytrack.session.state, steps: window.copytrack.session.logic.steps }));
    assert.deepEqual(st, { hint: true, state: 'paused', steps: 0 }, 'en portrait : écran « tourne ton téléphone », course en pause, chrono à zéro');
    await m.ctx.close();
  });

  await test('recommencer juste après « GO ! » : le « 3 » du nouveau décompte reste affiché (l\'ancienne minuterie l\'effaçait)', async () => {
    const { ctx, page } = await open(1280, 720);
    await page.evaluate(() => window.copytrack.playBuiltin(0));
    await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, { timeout: 30000, polling: 20 });
    // À cet instant « GO ! » vient de s'afficher : on recommence aussitôt, puis on regarde le centre de l'écran pendant que l'ancienne minuterie (0,6 s) tombe.
    const seen = await page.evaluate(async () => {
      const S = window.copytrack.session, el = window.copytrack.ui.hud.el.center || document.getElementById('hud-center');
      S.restart();
      const out = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 1500) { await new Promise((r) => setTimeout(r, 50)); out.push([S.state, S.countShown, (el.textContent || '').trim()]); }
      return out;
    });
    const during = seen.filter(([state]) => state === 'countdown');
    assert.ok(during.length > 5, 'le décompte a bien recommencé');
    const blanks = during.filter(([, shown, text]) => shown >= 0 && text === '');
    assert.equal(blanks.length, 0, `le chiffre du décompte a disparu ${blanks.length} fois : ${JSON.stringify(during.slice(0, 14))}`);
    await ctx.close();
  });

  await test('voiture immobile gaz à fond : au bout de 3 s le message « Bloqué ? R : retour au checkpoint » s\'affiche, une seule fois par blocage ; rien quand elle roule', async () => {
    const { ctx, page } = await open(1280, 720);
    await page.evaluate(() => window.copytrack.playBuiltin(0));
    await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, { timeout: 30000, polling: 100 });
    const r = await page.evaluate(() => {
      const S = window.copytrack.session, said = [];
      const real = S.app.ui.hud.message.bind(S.app.ui.hud);
      S.app.ui.hud.message = (t, d, p) => { said.push(t); return real(t, d, p); };
      S.app.input.drive = () => ({ steer: 0, throttle: true, brake: false, drift: false });
      // 2 s de course normale : aucun message.
      for (let i = 0; i < 240; i++) S._stepOnce();
      const rolling = said.filter((t) => /Bloqué/.test(t)).length, v = S.phys.speed;
      // Moteur coupé en permanence (comme sur une dalle « moteur coupé ») : la voiture s'arrête, gaz toujours à fond.
      let at = -1;
      for (let i = 0; i < 120 * 14; i++) { S.phys.cutT = 1; S.phys.vel.x = 0; S.phys.vel.z = 0; S._stepOnce(); if (at < 0 && said.some((t) => /Bloqué/.test(t))) at = i; }
      return { rolling, v, at, count: said.filter((t) => /Bloqué/.test(t)).length, state: S.state };
    });
    assert.equal(r.rolling, 0, 'aucun message tant que la voiture roule');
    assert.ok(r.v > 5, 'elle roulait bien (' + r.v.toFixed(1) + ' m/s)');
    assert.ok(r.at >= 355 && r.at <= 380, 'message après ~3 s d\'immobilité (pas ' + r.at + ')');
    assert.equal(r.count, 1, 'une seule fois pour ce blocage');
    assert.equal(r.state, 'racing', 'la course continue : simple message');
    await ctx.close();
  });

  await test('chrono : le passage d\'une minute ne s\'affiche jamais « :60.000 »', async () => {
    const { ctx, page } = await open(1280, 720);
    const r = await page.evaluate(async () => {
      const { formatTime } = await import('/js/storage.js');
      const bad = [];
      for (let k = 7190; k < 7210; k++) for (const a of [0, 0.5, 0.95, 0.999]) { const t = formatTime((k + a) / 120); if (/:6\d\./.test(t)) bad.push(t); }
      return { bad, a: formatTime(59.9996), b: formatTime(60) };
    });
    assert.deepEqual(r, { bad: [], a: '01:00.000', b: '01:00.000' });
    await ctx.close();
  });
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} test(s) en échec sur ${executed}` : `\nTous les tests navigateur de l'audit passent (${executed}).`);
process.exit(failures ? 1 : 0);
