// Test d'intégration dans un vrai navigateur (Chromium sans écran, WebGL logiciel) : node tools/test-browser.mjs   (npm run test:browser)
//
// Le reste de la suite ne teste que le noyau (Node, sans DOM). Ce script ouvre le jeu et parcourt les écrans et les flux principaux :
// accueil invité, menu, carrière, course (décompte, conduite, pause, recommencer), éditeur (pose, annuler, test), garage, profil
// (compte, sauvegardes, options, commandes), communauté hors ligne, mes circuits. Il échoue à la moindre erreur JavaScript de la page.
// Playwright n'est pas une dépendance du projet : sans lui (ou sans Chromium), le test est ignoré (CI : voir .github/workflows).
//   PW_SHOTS=/dossier  enregistre une capture de chaque étape
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { DMATH_DIGEST_EXPECTED } from './dmath-digest.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.log('  skip playwright introuvable : test navigateur ignoré'); process.exit(0); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8300 + Math.floor(Math.random() * 400);
const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
const shots = process.env.PW_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

let browser;
try { browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] }); }
catch (e) { server.kill(); console.log('  skip Chromium introuvable : test navigateur ignoré (' + String(e.message).split('\n')[0] + ')'); process.exit(0); }

let failures = 0;
const errors = [];
async function test(name, fn) {
  const before = errors.length;
  try { await fn(); if (errors.length > before) throw new Error('erreurs de la page : ' + errors.slice(before).join(' | ')); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 5).join('\n       ')); }
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
const page = await ctx.newPage();
// Les polices Google et Supabase ne sont pas joignables ici : ces échecs réseau ne sont pas des erreurs du jeu.
const OFFLINE = /fonts\.(googleapis|gstatic)|supabase\.co|net::ERR|Failed to load resource|ERR_INTERNET_DISCONNECTED/;
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());

const shot = async (n) => { if (shots) await page.screenshot({ path: join(shots, n + '.png') }); };
const app = (fn, arg) => page.evaluate(fn, arg);
const waitApp = (cond, arg, timeout = 15000) => page.waitForFunction(cond, arg, { timeout });
// Les boutons du menu sont animés : Playwright attendrait indéfiniment qu'ils soient « stables ». On déclenche donc le clic dans la page.
const click = async (sel) => { await page.locator(sel).first().evaluate((el) => el.click(), null, { timeout: 8000 }); };

try {
  // Un autre moteur JavaScript que Node (celui de Chromium) doit calculer EXACTEMENT les mêmes nombres : c'est ce qui permet de rejouer une course
  // ailleurs que là où elle a été enregistrée (voir js/dmath.js). Même contrôle sous Deno, le moteur de la fonction serveur : voir .github/workflows.
  await test('déterminisme : mathématiques et physique identiques à Node (empreintes)', async () => {
    await page.goto(`http://127.0.0.1:${PORT}/README.md`, { waitUntil: 'load' });
    const dm = await page.evaluate(async () => (await import('/tools/dmath-digest.mjs')).dmathDigest());
    assert.equal(dm, DMATH_DIGEST_EXPECTED, 'js/dmath.js ne donne pas les mêmes bits dans Chromium');
    const ref = JSON.parse(readFileSync(join(root, 'tools/phys-fingerprint.json'), 'utf8'));
    const fp = await page.evaluate(async () => (await import('/tools/fingerprint-core.mjs')).computeFingerprint());
    assert.equal(fp.version, ref.version);
    const bad = Object.keys(ref.scenarios).filter((k) => fp.scenarios[k] !== ref.scenarios[k]);
    assert.deepEqual(bad, [], `${bad.length} scénario(s) de physique différent(s) dans Chromium`);
  });

  await test('le jeu démarre : accueil invité puis menu', async () => {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
    await page.locator('#wl-name').fill('Testeur');
    await shot('01-accueil');
    await click('#wl-submit');
    await waitApp(() => window.copytrack && window.copytrack.mode === 'menu');
    await page.waitForTimeout(1200);
    if (await app(() => window.copytrack.ui.modalOpen)) { await shot('01b-tutoriel'); await page.keyboard.press('Escape'); await waitApp(() => !window.copytrack.ui.modalOpen); }
    await shot('02-menu');
    assert.ok(await app(() => !document.getElementById('menu').classList.contains('hidden')), 'le menu doit être visible');
    assert.equal(await app(() => window.copytrack.builtins.length), 66);
  });

  await test('carrière : 66 circuits listés, le premier se lance et se conduit', async () => {
    await click('[data-action="play"]');
    await waitApp(() => document.querySelectorAll('#track-list .card:not(.daily-card)').length === 66);
    await shot('03-carriere');
    await click('#track-list .track-group:not(.ch-open) .card:not(.daily-card):not(.locked)');
    await waitApp(() => window.copytrack.mode === 'race' && window.copytrack.session && window.copytrack.session.state);
    await waitApp(() => window.copytrack.session.state === 'racing', null, 20000);
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(2500);
    const speed = await app(() => window.copytrack.session.phys.speed);
    await shot('04-course');
    await page.keyboard.up('ArrowUp');
    assert.ok(speed > 5, 'la voiture doit avoir accéléré (vitesse ' + speed.toFixed(1) + ')');
    assert.ok(await app(() => window.copytrack.session.logic.steps) > 100);
  });

  await test('course : pause, reprise, retour au checkpoint, recommencer', async () => {
    await page.keyboard.press('Escape');
    await waitApp(() => window.copytrack.session.state === 'paused');
    assert.ok(await app(() => !document.getElementById('pause').classList.contains('hidden')), 'le menu pause doit s\'afficher');
    await shot('05-pause');
    await page.keyboard.press('Escape');
    await waitApp(() => window.copytrack.session.state === 'racing');
    await page.keyboard.press('r');
    await page.waitForTimeout(300);
    await page.keyboard.press('t');
    await waitApp(() => window.copytrack.session.logic.steps < 30);
  });

  await test('course : fantôme d\'or, caméras, klaxon et retour au menu', async () => {
    for (let i = 0; i < 4; i++) { await page.keyboard.press('c'); await page.waitForTimeout(120); }
    await page.keyboard.press('h');
    await app(() => window.copytrack.quitRace());
    await waitApp(() => window.copytrack.mode === 'menu');
  });

  await test('défi du jour et circuit en plusieurs tours', async () => {
    await click('[data-action="daily"]');
    await waitApp(() => window.copytrack.mode === 'race', null, 20000);
    await page.waitForTimeout(600);
    await app(() => window.copytrack.quitRace());
    await waitApp(() => window.copytrack.mode === 'menu');
  });

  await test('éditeur : ouverture, pose d\'une pièce, annuler / rétablir, vérificateur, test', async () => {
    await click('[data-action="editor"]');
    await waitApp(() => window.copytrack.mode === 'editor' && window.copytrack.session && window.copytrack.session.track);
    await page.waitForTimeout(500);
    const n0 = await app(() => window.copytrack.session.track.tiles.length);
    await page.mouse.move(640, 360);
    await page.waitForTimeout(150);
    await page.mouse.click(700, 330);
    await page.waitForTimeout(300);
    const n1 = await app(() => window.copytrack.session.track.tiles.length);
    await shot('06-editeur');
    assert.ok(n1 >= n0, 'la pose ne doit pas enlever de pièces');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(150);
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(150);
    await page.keyboard.press('F2');
    await page.waitForTimeout(300);
    // Palette : choisir une famille, une option, un revêtement, l'outil Inspecter
    await click('#ed-palette .piece-btn');
    await page.keyboard.press('i');
    await page.waitForTimeout(200);
    await app(() => window.copytrack.session.setTab && window.copytrack.session.setTab('surf'));
    await page.waitForTimeout(200);
    await shot('07-editeur-revetements');
    await app(() => window.copytrack.leaveEditor());
    await waitApp(() => window.copytrack.mode === 'menu');
  });

  await test('éditeur : un circuit complet se teste depuis l\'éditeur', async () => {
    await app(() => window.copytrack.openEditor({ code: window.copytrack.builtins[0].track.encode(), name: 'Essai' }));
    await waitApp(() => window.copytrack.mode === 'editor' && window.copytrack.session.track.tiles.length > 10);
    await page.waitForTimeout(400);
    await shot('08-editeur-circuit');
    await page.keyboard.press('t');
    await waitApp(() => window.copytrack.mode === 'race', null, 20000);
    await page.waitForTimeout(700);
    await app(() => window.copytrack.quitRace());
    await waitApp(() => window.copytrack.mode === 'editor' || window.copytrack.mode === 'menu');
    if (await app(() => window.copytrack.mode === 'editor')) await app(() => window.copytrack.leaveEditor());
    await waitApp(() => window.copytrack.mode === 'menu');
  });

  await test('garage : ouverture, changement de catégorie, retour', async () => {
    await click('[data-action="garage"]');
    await waitApp(() => window.copytrack.mode === 'garage');
    await page.waitForTimeout(500);
    await shot('09-garage');
    const cats = page.locator('#garage .tab, #garage-cats button');
    if (await cats.count() > 2) await cats.nth(2).click();
    await page.waitForTimeout(200);
    await click('#garage [data-action="garage-back"]');
    await waitApp(() => window.copytrack.mode === 'menu');
  });

  await test('profil : compte, sauvegardes, options, commandes', async () => {
    await click('[data-action="profile"]');
    await waitApp(() => !document.getElementById('profile').classList.contains('hidden'));
    for (const tab of ['account', 'saves', 'options', 'controls']) {
      const t = page.locator(`#prof-tabs [data-ptab="${tab}"]`);
      if (await t.count()) { await t.first().click(); await page.waitForTimeout(250); }
    }
    await shot('10-profil-commandes');
    await click('#profile [data-action="back"]');
    await waitApp(() => window.copytrack.mode === 'menu');
  });

  await test('communauté hors ligne, mes circuits, importer : aucun plantage', async () => {
    await click('[data-action="community"]');
    await waitApp(() => !document.getElementById('community').classList.contains('hidden'));
    await page.waitForTimeout(800);
    await click('#community [data-action="back"]');
    await click('[data-action="mytracks"]');
    await waitApp(() => !document.getElementById('mytracks').classList.contains('hidden'));
    await click('#mytracks [data-action="back"]');
    await click('[data-action="import"]');
    await waitApp(() => window.copytrack.ui.modalOpen);
    await page.keyboard.press('Escape');
    await waitApp(() => !window.copytrack.ui.modalOpen);
  });

  await test('multijoueur : le menu des salons s\'ouvre sans serveur', async () => {
    await click('[data-action="community"]');
    await waitApp(() => !document.getElementById('community').classList.contains('hidden'));
    await click('#community [data-action="multi"]');
    await waitApp(() => window.copytrack.ui.modalOpen);
    await shot('11-multijoueur');
    await page.keyboard.press('Escape');
    await app(() => window.copytrack.showMenu('menu'));
    await waitApp(() => window.copytrack.mode === 'menu');
  });

  await test('chaque profil de qualité se règle sans erreur', async () => {
    for (const q of ['ultra', 'high', 'medium', 'low', 'potato', 'ultrapotato']) {
      await app((name) => { window.copytrack.quality.apply(name); }, q);
      await page.waitForTimeout(350);
    }
    await app(() => window.copytrack.quality.apply('high'));
  });
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `${failures} test(s) en échec` : 'Tous les tests navigateur passent');
process.exit(failures ? 1 : 0);
