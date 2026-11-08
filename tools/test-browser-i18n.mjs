// Internationalisation dans un vrai navigateur : node tools/test-browser-i18n.mjs   (npm run test:browser)
//
// Vérifie ce que le test Node ne peut pas voir : le choix de la langue au premier lancement, la bascule en direct (écran d'accueil et Options),
// la traduction des écrans principaux sans aucun reste de français, le retour exact au français, et que le français n'embarque pas
// le dictionnaire anglais. Playwright n'est pas une dépendance du projet : sans lui (ou sans Chromium), le test est ignoré.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

// Bilan d'un exercice de l'Académie (E12) sans passer par la course : les commandes du pilote automatique, mesurées comme celles d'un joueur.
async function drillResult(page, i, latK) {
  await page.evaluate(async ([i, latK]) => {
    const a = window.copytrack, { DRILLS } = await import('/js/skills.js'), { buildBuiltin } = await import('/js/tracks.js'), { traceFromBot } = await import('/js/analysis/trace.js');
    const d = DRILLS[i], track = buildBuiltin({ ...d, id: 'drill-' + d.id, name: d.name }), run = traceFromBot(track, { latK });
    a.onDrillFinished({ opts: { academy: { drill: i } }, track, recorder: { encode: () => run.inputs }, restart() {} }, run.time);
  }, [i, latK]);
  await page.waitForFunction(() => /^🥇 Grade: gold$|^No grade yet$/.test(document.getElementById('modal-title').textContent) && document.querySelector('.ac-advice'), null, { timeout: 20000 });
  console.log('       ' + (await page.evaluate(() => document.getElementById('modal-title').textContent + ' | ' + document.querySelector('.ac-measure').textContent + ' | ' + document.querySelector('.ac-advice').textContent)));
}


const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.log('  skip playwright introuvable : test navigateur ignoré'); process.exit(0); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8700 + Math.floor(Math.random() * 90);
const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
let browser;
try { browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] }); }
catch (e) { server.kill(); console.log('  skip Chromium introuvable : test navigateur ignoré (' + String(e.message).split('\n')[0] + ')'); process.exit(0); }

let failures = 0;
const errors = [];
const OFFLINE = /fonts\.(googleapis|gstatic)|supabase\.co|net::ERR|Failed to load resource|ERR_INTERNET_DISCONNECTED/;
async function test(name, fn) {
  const before = errors.length;
  try { await fn(); if (errors.length > before) throw new Error('erreurs de la page : ' + errors.slice(before).join(' | ')); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 6).join('\n       ')); }
}

// Un contexte = un « appareil » neuf (stockage vide) avec la langue du navigateur demandée.
async function device(locale, { before } = {}) {
  const ctx = await browser.newContext({ locale, viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  if (before) await ctx.addInitScript(before);
  const page = await ctx.newPage();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#wl-name', { state: 'visible', timeout: 20000 });
  return { ctx, page, requests };
}
const text = (page, sel) => page.locator(sel).first().innerText();
const click = (page, sel) => page.locator(sel).first().evaluate((el) => el.click());
const enter = async (page, name = 'Testeur') => {
  if (await page.locator('#wl-name').isVisible()) { await page.locator('#wl-name').fill(name); await click(page, '#wl-submit'); }
  await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  if (await page.evaluate(() => window.copytrack.ui.modalOpen)) { await page.keyboard.press('Escape'); await page.waitForFunction(() => !window.copytrack.ui.modalOpen); }
};

// Les textes restés en français dans la page (texte, infobulles ; un paragraphe à balises compte d'un bloc). Même logique que tools/i18n-crawl.mjs.
const frenchLeft = (page) => page.evaluate(async () => {
  const { looksFrench } = await import('/js/i18n.js');
  const { isInlineContainer, TRANSLATED_ATTRS } = await import('/js/i18n/dom.js');
  const out = [];
  const walk = (el) => {
    if (/^(SCRIPT|STYLE|TEXTAREA|CANVAS|NOSCRIPT|TEMPLATE)$/.test(el.tagName) || el.getAttribute('data-i18n') === 'off') return;
    for (const a of TRANSLATED_ATTRS) { const v = el.getAttribute(a); if (v && looksFrench(v)) out.push(a + ' : ' + v); }
    if (isInlineContainer(el)) { if (looksFrench(el.textContent)) out.push(el.innerHTML.replace(/\s+/g, ' ').trim()); return; }
    for (const c of el.childNodes) {
      if (c.nodeType === 3) { const t = c.nodeValue.replace(/\s+/g, ' ').trim(); if (t && /[A-Za-zÀ-ÿ]/.test(t) && looksFrench(t)) out.push(t); }
      else if (c.nodeType === 1) walk(c);
    }
  };
  walk(document.documentElement);
  // Les descriptions des circuits (infobulles « Départ : … ») sont vérifiées par le test Node ; ici on ne regarde que l'interface.
  return out.filter((s) => s !== 'Français');
});

try {
  await test('français : un joueur dont le navigateur est en français reste en français, sans charger le dictionnaire anglais', async () => {
    const { ctx, page, requests } = await device('fr-FR');
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'fr');
    assert.match(await text(page, '#wl-title'), /Qui joue/);
    assert.ok(!requests.some((u) => /\/js\/i18n\/en/.test(u)), 'le dictionnaire anglais n\'est pas téléchargé en français');
    await enter(page);
    assert.match(await text(page, '[data-action="play"]'), /Carrière/);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('copytrack.lang'))), 'fr', 'la langue détectée est mémorisée');
    await ctx.close();
  });

  await test('anglais : un nouvel appareil dont le navigateur est en anglais démarre en anglais, de l\'accueil jusqu\'au menu', async () => {
    const { ctx, page } = await device('en-US');
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
    assert.match(await text(page, '#wl-title'), /Who is playing\?/);
    assert.deepEqual(await frenchLeft(page), [], 'tout l\'écran d\'accueil (et le reste de la page statique) est traduit');
    await click(page, '[data-wl="login"]');
    assert.match(await text(page, '#wl-submit'), /Sign in/);
    await click(page, '[data-wl="guest"]');
    await page.locator('#wl-name').fill('Testeur');
    await click(page, '#wl-submit');
    await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 30000 });
    await page.waitForTimeout(600);
    await ctx.close();
  });

  await test('un joueur qui a déjà des données sur l\'appareil garde le français même si son navigateur est en anglais', async () => {
    const { ctx, page } = await device('en-US', { before: () => { try { if (!localStorage.getItem('copytrack.lang')) localStorage.setItem('shardway.settings', '{"volume":0.5}'); } catch { /* sans importance */ } } });
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'fr');
    assert.match(await text(page, '#wl-title'), /Qui joue/);
    await ctx.close();
  });

  await test('bascule en direct depuis l\'accueil, mémorisée après rechargement ; retour exact au français', async () => {
    const { ctx, page } = await device('fr-FR');
    const frBefore = await page.evaluate(() => document.getElementById('welcome').innerText);
    await click(page, '[data-lang="en"]');
    await page.waitForFunction(() => document.documentElement.lang === 'en');
    assert.match(await text(page, '#wl-title'), /Who is playing\?/);
    assert.equal(await page.locator('[data-lang="en"]').getAttribute('aria-pressed'), 'true');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#wl-name', { state: 'visible' });
    assert.match(await text(page, '#wl-title'), /Who is playing\?/, 'la langue est mémorisée');
    await click(page, '[data-lang="fr"]');
    await page.waitForFunction(() => document.documentElement.lang === 'fr');
    assert.equal(await page.evaluate(() => document.getElementById('welcome').innerText), frBefore, 'le français revient à l\'identique (la source de chaque texte est retenue)');
    await ctx.close();
  });

  await test('menu, carrière, profil, garage, communauté, éditeur : aucun reste de français en anglais', async () => {
    const { ctx, page } = await device('en-US');
    await enter(page);
    const screens = [
      ['menu', async () => {}],
      ['carrière', async () => { await click(page, '[data-action="play"]'); await page.waitForFunction(() => document.querySelectorAll('#track-list .card').length > 60); }],
      ['fiche du circuit', async () => { await page.evaluate(() => window.copytrack.openBuiltinHub(4, 'tracks')); await page.waitForTimeout(400); }],
      ['fiche › personnel', async () => { await click(page, '#hub-board [data-tab="personal"]'); }],
      ['mes circuits', async () => { await page.evaluate(() => window.copytrack.showScreen('mytracks')); }],
      ['communauté', async () => { await page.evaluate(() => window.copytrack.showScreen('community')); await page.waitForTimeout(500); }],
      ['profil › compte', async () => { await page.evaluate(() => window.copytrack.showScreen('profile')); }],
      ['profil › sauvegardes', async () => { await click(page, '[data-ptab="saves"]'); }],
      ['profil › options', async () => { await click(page, '[data-ptab="options"]'); }],
      ['profil › commandes', async () => { await click(page, '[data-ptab="controls"]'); }],
      ['garage', async () => { await page.evaluate(() => window.copytrack.showScreen('menu')); await click(page, '[data-action="garage"]'); await page.waitForTimeout(300); }],
      ['académie', async () => { await page.evaluate(() => window.copytrack.showScreen('menu')); await page.evaluate(() => window.copytrack.academyMenu()); }],
      ['leçon', async () => { await page.evaluate(() => { window.copytrack.ui.closeModal(); window.copytrack.lessonIntro(1); }); }],
      ['exercice', async () => { await page.evaluate(() => { window.copytrack.ui.closeModal(); window.copytrack.drillIntro(2); }); }],
      ['bilan d’exercice (zones, conseil du coach)', async () => { await page.evaluate(() => window.copytrack.ui.closeModal()); await drillResult(page, 0, 0.5); }],
      ['bilan d’exercice (réceptions)', async () => { await page.evaluate(() => window.copytrack.ui.closeModal()); await drillResult(page, 3, 1); }],
      ['statistiques anonymes', async () => { await page.evaluate(() => { window.copytrack.ui.closeModal(); window.copytrack.settings.telemetry = null; window.copytrack.askTelemetry(); }); }],
      ['multijoueur', async () => { await page.evaluate(() => { window.copytrack.ui.closeModal(); window.copytrack.multiMenu(); }); }],
    ];
    for (const [name, go] of screens) {
      await go();
      await page.waitForTimeout(250);
      assert.deepEqual(await frenchLeft(page), [], `écran « ${name} » : texte resté en français`);
    }
    await page.evaluate(() => window.copytrack.ui.closeModal());
    await ctx.close();
  });

  await test('textes produits en cours de jeu : messages, bandeau d\'aide, pause, arrivée, éditeur', async () => {
    const { ctx, page } = await device('en-US');
    await enter(page);
    await page.evaluate(() => window.copytrack.playBuiltin(0));
    await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, { timeout: 40000 });
    assert.match(await text(page, '#hud-hint'), /brake in a turn: drift/, 'bandeau d\'aide de la course');
    // HUD d'entraînement (profil « Entraînement ») : référence, écart, vitesse maxi
    await page.evaluate(() => { window.copytrack.setHudProfile('training'); window.copytrack.playBuiltin(0); });
    await page.waitForFunction(() => window.copytrack.session && window.copytrack.session._train && window.copytrack.session._train.lt, null, { timeout: 40000 });
    await page.waitForTimeout(1500);
    assert.match(await text(page, '#tr-ref'), /Reference: gold ghost/);
    assert.deepEqual(await frenchLeft(page), [], 'HUD d\'entraînement : texte resté en français');
    await page.evaluate(() => { window.copytrack.setHudProfile('classic'); window.copytrack.playBuiltin(0); });
    await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, { timeout: 40000 });
    assert.match(await text(page, '#hud-best'), /No record yet/);
    await page.evaluate(() => window.copytrack.session.app.ui.hud.message('Hors piste', 1, 3));
    await page.waitForTimeout(100);
    assert.equal((await text(page, '#hud-msg')).trim(), 'Off track', 'message au centre de l\'écran');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.match(await text(page, '#pause'), /Resume/);
    assert.deepEqual(await frenchLeft(page), [], 'pause : texte resté en français');
    await page.evaluate(() => window.copytrack.session._finish(12.345));
    await page.waitForTimeout(600);
    assert.match(await text(page, '#finish'), /First time!/);
    assert.deepEqual(await frenchLeft(page), [], 'arrivée : texte resté en français');
    await page.evaluate(() => window.copytrack.openEditor({ code: null }));
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('[title="Editor menu"]').count(), 1, 'infobulle traduite');
    assert.deepEqual(await frenchLeft(page), [], 'éditeur : texte resté en français');
    await page.evaluate(() => window.copytrack.session.openParams());
    await page.waitForTimeout(250);
    assert.deepEqual(await frenchLeft(page), [], 'paramètres du niveau : texte resté en français');
    await page.evaluate(() => { window.copytrack.ui.closeModal(); const s = window.copytrack.session; s.setTool('select'); s.sel = { x0: -50, z0: -50, x1: 50, z1: 50 }; s.openGroups(); });
    await page.waitForTimeout(250);
    assert.deepEqual(await frenchLeft(page), [], 'groupes et calques : texte resté en français');
    await page.evaluate(() => {
      window.copytrack.ui.closeModal();
      const s = window.copytrack.session, t = s.track;
      if (t.tiles.length) { t.tiles[0].g = 2; t.setGroupName(2, 'Door'); }
      t.setLogic({ vars: 1, off: [], rules: [{ on: ['cp', 1], if: [['var', 0, '>=', 1]], do: [['show', 2], ['grav', 60]], once: true }, { on: ['time', 600], do: [['fx', 'sound', 'ding']] }] });
      s.openLogic();
    });
    await page.waitForTimeout(250);
    assert.match(await text(page, '.ed-lrules'), /When checkpoint no\. 1 is passed, if counter 1 ≥ 1: show « Door », gravity at 60 %\. \(once\)/);
    assert.deepEqual(await frenchLeft(page), [], 'logique du circuit : texte resté en français');
    await page.evaluate(() => document.querySelector('[data-ed-rule="0"]').click());
    await page.waitForTimeout(200);
    assert.deepEqual(await frenchLeft(page), [], 'règle en cours de modification : texte resté en français');
    await ctx.close();
  });

  await test('Replay Theater en anglais : barre de temps, légende, panneau d\'analyse', async () => {
    const { ctx, page } = await device('en-US');
    await enter(page);
    await page.evaluate(async () => {
      const C = await (await fetch('/tools/compat/corpus.json')).json();
      const r = C.runs.find((x) => /retour/.test(x.label));
      const a = window.copytrack, i = a.builtins.findIndex((b) => b.def.id === 'eclats'), s = await import('/js/storage.js');
      s.saveRecord(a.builtins[i].key, { time: r.time, inputs: r.inputs, pv: 26, date: Date.now(), splits: [] });
      a.showMenu('tracks'); a.openBuiltinHub(i, 'tracks');
      await a.watchRecord(a._hub.desc, s.getRecord(a.builtins[i].key), 'gold');
    });
    await page.waitForFunction(() => window.copytrack.session && window.copytrack.session._th && window.copytrack.session._th.traces, null, { timeout: 30000 });
    await page.waitForTimeout(600);
    assert.match(await text(page, '#th-runs'), /My record[\s\S]*Gold ghost/);
    assert.deepEqual(await frenchLeft(page), [], 'Theater : texte resté en français');
    await ctx.close();
  });

  await test('Options › Langue : bascule en direct dans les deux sens, sans recharger, textes dynamiques compris', async () => {
    const { ctx, page } = await device('fr-FR');
    await enter(page);
    await page.evaluate(() => window.copytrack.showScreen('profile'));
    await click(page, '[data-ptab="options"]');
    assert.deepEqual((await page.locator('#opt-lang option').allInnerTexts()), ['Français', 'English']);
    assert.match(await text(page, '[data-ptab="options"]'), /Options/);
    const menuFr = await page.evaluate(() => { window.copytrack.showScreen('menu'); return document.getElementById('menu').innerText; });
    await page.evaluate(() => window.copytrack.showScreen('profile'));
    await page.locator('#opt-lang').selectOption('en');
    await page.waitForFunction(() => document.documentElement.lang === 'en');
    assert.match(await text(page, '[data-ppanel="options"] label'), /Language/);
    assert.match(await page.locator('#opt-quality option[value="auto"]').innerText(), /Automatic/);
    assert.equal((await page.evaluate(() => { window.copytrack.ui.flash('Records effacés.'); return new Promise((r) => setTimeout(() => r(document.getElementById('toast').innerText), 50)); })).trim(), 'Records erased.', 'une notification écrite après la bascule est traduite');
    const menuEn = await page.evaluate(() => { window.copytrack.showScreen('menu'); return document.getElementById('menu').innerText; });
    assert.notEqual(menuEn, menuFr);
    assert.match(menuEn, /Daily challenge/);
    await page.evaluate(() => window.copytrack.showScreen('profile'));
    await page.locator('#opt-lang').selectOption('fr');
    await page.waitForFunction(() => document.documentElement.lang === 'fr');
    const menuBack = await page.evaluate(() => { window.copytrack.showScreen('menu'); return document.getElementById('menu').innerText; });
    assert.equal(menuBack, menuFr, 'retour au français à l\'identique');
    await ctx.close();
  });
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `${failures} test(s) en échec` : 'Tous les tests navigateur i18n passent');
process.exit(failures ? 1 : 0);
