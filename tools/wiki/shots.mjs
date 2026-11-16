// Captures d'écran du wiki (wiki/img/*.jpg) : le jeu doit être servi (npm start), puis : node tools/wiki/shots.mjs [menus|races|all] [adresse]
// (par défaut http://127.0.0.1:8080/). Chromium en logiciel (SwiftShader) : une capture par écran du menu, de l'éditeur, et une par circuit de RACES,
// prise quand le pilote automatique atteint la fraction du tracé indiquée. Ensuite : npm run wiki.
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'wiki', 'img');
const which = process.argv[2] || 'all';
const URL_JEU = process.argv[3] || 'http://127.0.0.1:8080/';
const RACES = [
  ['eclats', 0.44, 'course-eclats-croisement'], ['canopee', 0.229, 'course-canopee-route-large'], ['phare', 0.335, 'course-phare-plaque'],
  ['neons', 0.03, 'course-neons-tapis'], ['tours', 0.25, 'course-tours-saut'], ['aurore', 0.344, 'course-aurore-portique'],
  ['couronne', 0.74, 'course-couronne-tube'], ['cheminee', 0.15, 'course-cheminee-mur'], ['braises', 0.47, 'course-braises-pyramides'],
  ['ceinture', 0.70, 'course-ceinture-looping'], ['quai', 0.16, 'course-quai-saut'], ['epave', 0.11, 'course-epave'],
  ['courant', 0.42, 'course-courant-portique'], ['usinefolle', 0.38, 'course-usine-marteau'], ['cite', 0.14, 'course-cite-deltaplane'],
  ['suspendues', 0.12, 'course-iles-plaque'], ['miroir', 0.586, 'course-miroir-verre'], ['cristalfele', 0.07, 'course-cristal-plafond'],
  ['grandatelier', 0.14, 'course-atelier-balancier'], ['verglas', 0.11, 'course-verglas-croisement'], ['spirale', 0.05, 'course-spirale-looping'],
];
await (async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  await page.goto(URL_JEU, { waitUntil: 'load' });
  await page.locator('#wl-name').fill('Essai'); await page.locator('#wl-submit').evaluate((el) => el.click());
  await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 60000 });
  await page.evaluate(() => { const A = window.copytrack; A.settings.tutorialDone = true; A.settings.telemetry = false; A.saveSettings(); A.ui.closeModal(); });
  await page.waitForTimeout(800); await page.evaluate(() => window.copytrack.ui.closeModal());
  const shot = async (name) => { await page.waitForTimeout(900); await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82 }); console.log('ok', name); };
  const safe = async (name, fn) => { try { await fn(); await shot(name); } catch (e) { console.log('ÉCHEC', name, e.message.split('\n')[0]); try { await page.evaluate(() => { const A = window.copytrack; try { A.ui.closeModal(); } catch (e) {} try { if (A.session && A.mode === 'race') A.quitRace(); } catch (e) {} try { if (A.mode === 'editor') A.leaveEditor(); } catch (e) {} A.showMenu('menu'); }); await page.waitForTimeout(1500); } catch (e2) { /* */ } } };
  const home = async () => { await page.evaluate(() => { const A = window.copytrack; try { A.closeRaceHub(); } catch (e) {} A.ui.closeModal(); A.showMenu('menu'); }); await page.waitForTimeout(600); };
  if (which === 'menus' || which === 'all') {
    await safe('menu-accueil', async () => { await home(); });
    await safe('menu-carriere', async () => { await page.evaluate(() => window.copytrack.showMenu('tracks')); });
    await safe('fiche-circuit', async () => { await page.evaluate(() => { window.copytrack.showMenu('tracks'); window.copytrack.openBuiltinHub(0, 'tracks'); }); await page.waitForTimeout(1500); });
    await safe('fiche-circuit-atelier', async () => { await page.evaluate(() => { window.copytrack.closeRaceHub(); window.copytrack.openBuiltinHub(71, 'tracks'); }); await page.waitForTimeout(1500); });
    await home();
    await safe('garage', async () => { await page.evaluate(() => window.copytrack.openGarage()); await page.waitForTimeout(2500); });
    await home();
    await safe('academie', async () => { await page.evaluate(() => window.copytrack.academyMenu()); await page.waitForTimeout(800); });
    await home();
    await safe('multijoueur', async () => { await page.evaluate(() => window.copytrack.multiMenu()); await page.waitForTimeout(800); });
    await home();
    await safe('profil', async () => { await page.evaluate(() => window.copytrack.showScreen('profile')); });
    await safe('records', async () => { await page.evaluate(() => window.copytrack.showScreen('records')); });
    await safe('options-graphismes', async () => { await page.evaluate(() => window.copytrack.showScreen('gfx')); });
    await safe('modes', async () => { await home(); await page.evaluate(() => window.copytrack.modesMenu()); await page.waitForTimeout(800); });
    await home();
    await safe('editeur-vide', async () => { await page.evaluate(() => window.copytrack.openEditor({ code: null })); await page.waitForFunction(() => window.copytrack.mode === 'editor', null, { timeout: 20000 }); await page.waitForTimeout(2500); });
    await page.evaluate(() => { try { window.copytrack.leaveEditor(); } catch (e) {} }); await page.waitForTimeout(1500); await home();
    for (const [i, nm] of [[0, 'editeur-eclats'], [10, 'editeur-racines'], [4, 'editeur-verglas']]) {
      await safe(nm, async () => {
        await page.evaluate((i) => window.copytrack.openEditor({ code: window.copytrack.builtins[i].track.encode(), name: window.copytrack.builtins[i].track.name }), i);
        await page.waitForFunction(() => window.copytrack.mode === 'editor', null, { timeout: 20000 }); await page.waitForTimeout(3500);
      });
      await page.evaluate(() => { try { window.copytrack.leaveEditor(); } catch (e) {} }); await page.waitForTimeout(1500); await home();
    }
  }
  if (which === 'races' || which === 'all') {
    for (const [id, f, nm] of RACES) {
      await safe(nm, async () => {
        await page.evaluate(async (id) => {
          const RO = await import('/js/renderOptions.js'); RO.renderOptions.hideDecos = false;
          const { BUILTIN_TRACKS, buildBuiltin } = await import('/js/tracks.js');
          const A = window.copytrack; try { if (A.mode === 'race') A.quitRace(); } catch (e) { /* */ }
          A.playTrack(buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === id)), { trackKey: null });
        }, id);
        await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, { timeout: 40000 });
        await page.evaluate(async () => { const { Autopilot } = await import('/js/autopilot.js'); const s = window.copytrack.session; const bot = new Autopilot(s.track.path, s.track.path.pilot || {}); bot.reset(s.phys); window.__bot = bot; s.app.input.drive = () => bot.control(s.phys); });
        for (let i = 0; i < 3000; i++) {
          const p = await page.evaluate(() => [window.__bot.idx / window.copytrack.session.track.path.length, window.copytrack.session.state]);
          if (p[0] >= f || p[1] !== 'racing') break;
          await page.waitForTimeout(30);
        }
      });
    }
  }
  await b.close();
})();
