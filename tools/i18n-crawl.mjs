// Parcourt les écrans du jeu EN ANGLAIS dans un vrai navigateur et liste les textes restés en français (aide à la rédaction du dictionnaire).
//   node tools/i18n-crawl.mjs            liste, écran par écran, ce qui n'est pas traduit
//   node tools/i18n-crawl.mjs --json     même chose en JSON (clés prêtes à coller : texte ou HTML de conteneur)
// Ce n'est pas un test : le contrôle automatique est tools/test-i18n.mjs (Node) et tools/test-browser-i18n.mjs (navigateur).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8800 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
const lang = process.argv.includes('--fr') ? 'fr' : 'en';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
await ctx.addInitScript((l) => { try { localStorage.setItem('copytrack.lang', JSON.stringify(l)); } catch { /* sans importance */ } }, lang);
const page = await ctx.newPage();
await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
page.on('pageerror', (e) => console.error('pageerror', e.message));

const seen = new Set(), report = [];
async function collect(label) {
  const items = await page.evaluate(async () => {
    const { looksFrench } = await import('/js/i18n.js');
    const { isInlineContainer, TRANSLATED_ATTRS } = await import('/js/i18n/dom.js');
    const out = [];
    const walk = (el) => {
      if (/^(SCRIPT|STYLE|TEXTAREA|CANVAS|NOSCRIPT|TEMPLATE)$/.test(el.tagName) || el.getAttribute('data-i18n') === 'off') return;
      for (const a of TRANSLATED_ATTRS) { const v = el.getAttribute(a); if (v && looksFrench(v)) out.push({ kind: 'attr:' + a, text: v }); }
      if (isInlineContainer(el)) { if (looksFrench(el.textContent)) out.push({ kind: 'html', text: el.innerHTML.replace(/\s+/g, ' ').trim() }); return; }
      for (const c of el.childNodes) {
        if (c.nodeType === 3) { const t = c.nodeValue.replace(/\s+/g, ' ').trim(); if (t && /[A-Za-zÀ-ÿ]/.test(t) && looksFrench(t)) out.push({ kind: 'text', text: t }); }
        else if (c.nodeType === 1) walk(c);
      }
    };
    walk(document.documentElement);
    return out;
  });
  const fresh = items.filter((i) => { const k = i.kind + '|' + i.text; if (seen.has(k)) return false; seen.add(k); return true; });
  if (fresh.length) report.push({ screen: label, items: fresh });
}
const click = async (sel) => { try { await page.locator(sel).first().evaluate((el) => el.click(), null, { timeout: 4000 }); await page.waitForTimeout(250); return true; } catch { return false; } };
const app = (fn, arg) => page.evaluate(fn, arg).catch(() => null);
async function step(label, fn) { try { await fn(); } catch (e) { console.error('étape ignorée :', label, String(e.message).split('\n')[0]); } await page.waitForTimeout(150); await collect(label); }

try {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await step('accueil', async () => {});
  await step('accueil › connexion', () => click('[data-wl="login"]'));
  await step('accueil › création', () => click('[data-wl="signup"]'));
  await step('accueil › erreur', async () => { await click('[data-wl="guest"]'); await page.locator('#wl-name').fill(''); await click('#wl-submit'); });
  await page.locator('#wl-name').fill('Testeur');
  await click('#wl-submit');
  await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await step('tutoriel', async () => {
    for (let i = 0; i < 6; i++) {
      if (!(await app(() => window.copytrack.ui.modalOpen))) break;
      await collect('tutoriel ' + i);
      const next = page.locator('.modal .btn.primary').first();
      if (!(await next.count())) break;
      await next.evaluate((el) => el.click()); await page.waitForTimeout(300);
    }
    if (await app(() => window.copytrack.ui.modalOpen)) await page.keyboard.press('Escape');
  });
  await step('menu', async () => {});
  await step('carrière', () => click('[data-action="play"]'));
  await step('carrière › défi', async () => { await app(() => window.copytrack.showScreen('menu')); await click('[data-action="daily"]'); });
  await app(() => { window.copytrack.ui.closeModal(); window.copytrack.showScreen('menu'); });
  await step('académie', () => click('[data-action="academy"]'));
  await app(() => { window.copytrack.ui.closeModal(); window.copytrack.showScreen('menu'); });
  await step('mes circuits', () => click('[data-action="mytracks"]'));
  await step('communauté', () => click('[data-action="community"]'));
  await step('communauté › en ligne', async () => { for (const s of ['popular', 'played', 'trending', 'mine']) { await click(`[data-sort="${s}"]`); await page.waitForTimeout(300); } });
  await step('multijoueur', async () => { await click('[data-action="multi"]'); await page.waitForTimeout(500); });
  await app(() => { window.copytrack.ui.closeModal(); window.copytrack.showScreen('menu'); });
  for (const tab of ['account', 'saves', 'options', 'controls']) {
    await app(() => window.copytrack.showScreen('profile'));
    await step('profil › ' + tab, () => click(`[data-ptab="${tab}"]`));
  }
  await step('profil › commandes › manette', async () => { await click('#bind-tabs [data-tab="pad"]'); });
  await step('profil › commandes › éditeur', async () => { await click('#bind-tabs [data-tab="editor"]'); });
  await step('profil › aide-mémoire', async () => { await click('[data-action="help"]'); });
  await app(() => { window.copytrack.ui.closeModal(); window.copytrack.showScreen('menu'); });
  await step('garage', () => click('[data-action="garage"]'));
  await step('garage › onglets', async () => {
    const tabs = await page.locator('#garage-tabs button').count();
    for (let i = 0; i < tabs; i++) { await page.locator('#garage-tabs button').nth(i).evaluate((el) => el.click()); await page.waitForTimeout(150); await collect('garage › onglet ' + i); }
    const items = await page.locator('#garage-list .garage-item, #garage-list > *').count();
    for (let i = 0; i < Math.min(items, 3); i++) { await page.locator('#garage-list > *').nth(i).evaluate((el) => el.click()); await page.waitForTimeout(150); await collect('garage › objet ' + i); }
  });
  await app(() => window.copytrack.showScreen('menu'));
  await step('importer', async () => { await click('[data-action="import"]'); });
  await app(() => { window.copytrack.ui.closeModal(); });
  await step('statistiques anonymes', async () => { await app(() => { window.copytrack.settings.telemetry = null; window.copytrack.askTelemetry(); }); });
  await app(() => { window.copytrack.ui.closeModal(); });
  // Fenêtres et messages qui ne s'ouvrent que sur une action : appelés directement.
  const modal = (label, js, arg) => step(label, async () => { await app(js, arg); await page.waitForTimeout(250); });
  const closeAll = () => app(() => window.copytrack.ui.closeModal());
  for (const i of [1, 2]) { await modal('tutoriel › étape ' + i, (n) => window.copytrack.tutorial(n), i); await closeAll(); }
  for (let i = 0; i < 6; i++) { await modal('académie › leçon ' + i, (n) => window.copytrack.lessonIntro(n), i); await closeAll(); }
  await modal('partage de circuit', () => { const b = window.copytrack.builtins[0]; window.copytrack.shareModal(b.track.encode(), b.def.name, b.track); }); await closeAll();
  await modal('partage de circuit (non vérifié)', () => { const b = window.copytrack.builtins[0]; window.copytrack.shareModal(b.track.encode(), 'Mon circuit', null); }); await closeAll();
  await modal('import de circuit', () => window.copytrack.importModal(false)); await closeAll();
  await modal('aide', () => window.copytrack.helpModal()); await closeAll();
  await modal('multijoueur : menu', () => window.copytrack.multiMenu()); await closeAll();
  await modal('multijoueur : salons publics', () => window.copytrack.multiPublic()); await closeAll();
  await modal('import de sauvegarde', () => window.copytrack._importSaveModal()); await closeAll();
  await modal('code joueur', () => window.copytrack._showCode('abc')); await closeAll();
  await modal('partage de fantôme', () => window.copytrack.shareGhost()); await closeAll();
  await modal('carte communauté', async () => {
    const row = { id: 'x', name: 'Circuit test', description: 'Un circuit.', code: window.copytrack.builtins[0].track.encode(), author: 'u', author_name: 'Zoé', plays: 12, likes: 3, author_time: 31.5, week_players: 2, difficulty: 3, created_at: new Date().toISOString() };
    window.copytrack.showScreen('community');
    const card = window.copytrack._communityCard(row, new Set());
    document.getElementById('comm-list').append(card);
    document.getElementById('comm-status').innerHTML = '<b>Communauté indisponible</b> : Serveur injoignable (connexion internet ?).';
  });
  await app(() => window.copytrack.showScreen('menu'));
  await step('course', async () => {
    await app(() => window.copytrack.playBuiltin(0));
    await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, { timeout: 40000 });
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(1500);
    await collect('course › en route');
    await app(() => window.copytrack.session.hud && 0);
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  });
  await step('pause', async () => {});
  await step('course › arrivée', async () => {
    await app(() => { const s = window.copytrack.session; if (s.finish) s.finish(12.345); else if (s._finish) s._finish(12.345); });
    await page.waitForTimeout(800);
  });
  await step('éditeur', async () => { await app(() => window.copytrack.openEditor({ code: null })); await page.waitForTimeout(1200); });
  await step('éditeur › aide', async () => { await app(() => window.copytrack.editorHelp()); await page.waitForTimeout(250); }); await closeAll();
  await step('éditeur › paramètres du niveau', async () => { await app(() => window.copytrack.session.openParams()); await page.waitForTimeout(250); }); await closeAll();
  await step('éditeur › compatibilité', async () => { await app(() => window.copytrack.session.showCompat()); await page.waitForTimeout(250); }); await closeAll();
  await step('éditeur › prefab', async () => { await app(() => window.copytrack.session._savePrefabDialog()); await page.waitForTimeout(250); }); await closeAll();
  await step('éditeur › import de prefab', async () => { await app(() => window.copytrack.session._importPrefabDialog()); await page.waitForTimeout(250); }); await closeAll();
  await step('éditeur › menu', async () => { await click('[data-action="editor-menu"], #ed-menu'); });
  await step('éditeur › paramètres', async () => { await app(() => window.copytrack.session && window.copytrack.session.openSettings && window.copytrack.session.openSettings()); });
  await app(() => window.copytrack.ui.closeModal());
  const tabCount = await page.locator('#palette-tabs button, .pal-tabs button, #ed-tabs button').count();
  for (let i = 0; i < tabCount; i++) { await page.locator('#palette-tabs button, .pal-tabs button, #ed-tabs button').nth(i).evaluate((el) => el.click()); await page.waitForTimeout(150); await collect('éditeur › onglet ' + i); }
} finally {
  await browser.close(); server.kill();
}
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 1));
else {
  let n = 0;
  for (const r of report) { console.log(`\n=== ${r.screen}`); for (const i of r.items) { n++; console.log(`  [${i.kind}] ${i.text}`); } }
  console.log(`\n${n} texte(s) non traduit(s) (${lang})`);
}
