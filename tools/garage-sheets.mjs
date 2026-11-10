// Planches-contact du garage : une capture RÉELLE (Chromium, rendu 3D du jeu) de chaque carrosserie, finition, roue, aileron, motif, ornement, LED, traînée et préréglage,
// vue trois-quarts avant ET arrière. Sert à REGARDER le résultat (proportions, pièces flottantes ou enfoncées, roues mal placées) : un test qui compte les maillages ne le voit pas.
//   [GARAGE_QUALITY=high|ultra|medium] node tools/garage-sheets.mjs <dossier de sortie> [catégorie ...]      (nécessite Playwright et ImageMagick « montage » ; rien n'est ajouté au dépôt)
// Catégories : body finish wheels spoiler decal ornament led trail preset orn-bodies   (par défaut : toutes)
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const { chromium } = require('playwright');
const out = process.argv[2];
if (!out) { console.log('usage : node tools/garage-sheets.mjs <dossier> [catégories]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const want = new Set(process.argv.slice(3));
const PORT = 8500 + Math.floor(Math.random() * 90);
const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await (await browser.newContext({ viewport: { width: 1000, height: 700 }, serviceWorkers: 'block' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts|supabase|ERR_/.test(m.text())) errors.push(m.text()); });
await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.locator('#wl-name').fill('Planches'); await page.locator('#wl-submit').click();
await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu');
await page.waitForFunction(() => window.copytrack.ui.modalOpen, null, { timeout: 8000 }).catch(() => {});
await page.evaluate(() => { const a = window.copytrack; a.settings.telemetry = false; a.settings.tutorialDone = true; a.saveSettings(); a.ui.closeModal(); });
// Qualité graphique FIXÉE (GARAGE_QUALITY, « high » par défaut ; « ultra » ajoute les reflets du ciel) : en « auto » le jeu change de profil pendant qu'on photographie
// (mesure de fluidité du rendu logiciel), donc d'éclairage, et deux captures du même modèle ne se ressemblent plus.
await page.evaluate((q) => { const A = window.copytrack; A.settings.quality = q; A.saveSettings(); A.quality.apply(q); }, process.env.GARAGE_QUALITY || 'high');
await page.evaluate(() => document.querySelector('[data-action="garage"]').click());
await page.waitForFunction(() => window.copytrack.mode === 'garage');
await page.waitForTimeout(600);
// Garage seul : le panneau est masqué, la rotation automatique arrêtée, la caméra fixée (la voiture est recentrée à l'écran).
await page.addStyleTag({ content: '#garage, #garage * { visibility: hidden !important; } #toast { display: none !important; }' });
await page.evaluate(() => { const G = window.copytrack.session; G.idle = 1e9; G.pitch = 0.32; G.dist = 11; G.app.scenery._cycle = null; G.app.scene.traverse((o) => { if (o.isLight) o.castShadow = false; }); });      // (heure du décor figée, ombres portées coupées : avec le rendu logiciel de Chromium, l'ombre de la voiture sur elle-même change d'une capture à l'autre et fausse la comparaison des finitions)

const base = { body: 'sport', color: '#3ec1ff', color2: '#ffd23e', decalColor: '#ffffff' };
const { CATALOG, PRESETS } = await page.evaluate(async () => { const m = await import('/js/cosmetics.js'); return { CATALOG: m.CATALOG, PRESETS: m.PRESETS }; });
const sets = {
  body: CATALOG.body.map((x) => [x.id, { body: x.id }]),
  finish: CATALOG.finish.map((x) => [x.id, { finish: x.id, color: '#c1121f', color2: '#ffd23e' }]),
  wheels: CATALOG.wheels.map((x) => [x.id, { wheels: x.id }]),
  spoiler: CATALOG.spoiler.map((x) => [x.id, { spoiler: x.id }]),
  decal: CATALOG.decal.map((x) => [x.id, { decal: x.id }]),
  ornament: CATALOG.ornament.map((x) => [x.id, { ornament: x.id }]),
  led: CATALOG.led.filter((x) => x.id !== 'none').map((x) => [x.id, { led: x.id, color: '#1d2230' }]),
  trail: [],
  preset: PRESETS.map((p) => [p.id, p.loadout]),
  'orn-bodies': ['kart', 'van', 'limo', 'bubble', 'jeep', 'formula'].flatMap((b) => ['santahat', 'antlers', 'xtree', 'snowman', 'umbrella', 'surfboard', 'icecream', 'witchhat', 'pumpkin', 'bunny', 'heartballoon', 'partyhat', 'ringfloat'].map((o) => [`${b}-${o}`, { body: b, ornament: o }])),
};
const ALL_VIEWS = { av: 0.62, ar: 0.62 + Math.PI, sd: Math.PI / 2 };      // trois-quarts avant, trois-quarts arrière, profil
const views = process.env.GARAGE_VIEWS ? Object.fromEntries(process.env.GARAGE_VIEWS.split(',').map((v) => [v, ALL_VIEWS[v]])) : ALL_VIEWS;      // GARAGE_VIEWS=av,sd pour n'en prendre que certaines
const shoot = async (name, patch, dir) => {
  const box = await page.evaluate(async ([patch, ang]) => {
    const { sanitizeLoadout, DEFAULT_LOADOUT } = await import('/js/cosmetics.js');
    const G = window.copytrack.session;
    G.draft = sanitizeLoadout({ ...DEFAULT_LOADOUT, ...patch }); G._rebuildCar(); G.angle = ang; G.update(0.016); G.update(0.016);
    const THREE = await import('/js/vendor/three.module.min.js');
    const v = new THREE.Vector3(12, 1.1, 12).project(G.app.camera);
    const W = window.innerWidth, H = window.innerHeight;
    return { x: (v.x * 0.5 + 0.5) * W, y: (1 - (v.y * 0.5 + 0.5)) * H };
  }, [patch, views[dir]]);
  // On attend QUELQUES images rendues après le changement : les premières images d'un nouveau modèle (matériaux compilés, caméra, lumières) ne sont pas représentatives.
  const f0 = await page.evaluate(() => window.copytrack.renderer.info.render.frame);
  await page.waitForFunction((f) => window.copytrack.renderer.info.render.frame >= f + 4, f0, { timeout: 30000, polling: 50 });
  const x = Math.max(0, Math.round(box.x - 260)), y = Math.max(0, Math.round(box.y - 190));
  await page.screenshot({ path: join(out, `${name}.${dir}.png`), clip: { x, y, width: 520, height: 380 } });
};
for (const [cat, list] of Object.entries(sets)) {
  if (want.size && !want.has(cat)) continue;
  if (!list.length) continue;
  for (const [id, patch] of list) {
    const p = cat === 'preset' || cat === 'body' ? patch : { ...base, ...patch };
    if (cat === 'body') Object.assign(p, { color: '#3ec1ff', color2: '#ffd23e' });
    for (const dir of Object.keys(views)) await shoot(`${cat}__${id}`, p, dir);
  }
  for (const dir of Object.keys(views)) {
    const files = readdirSync(out).filter((f) => f.startsWith(cat + '__') && f.endsWith(`.${dir}.png`)).sort();
    const per = cat === 'orn-bodies' ? 13 : 5;
    for (let i = 0; i * per < files.length; i++) {
      const chunk = files.slice(i * per, (i + 1) * per);
      const args = chunk.flatMap((f) => ['-label', f.replace(/^[^_]*__/, '').replace(/\.(av|ar)\.png$/, ''), join(out, f)]);
      spawnSync('montage', [...args, '-tile', `${per}x1`, '-geometry', '300x220+2+2', '-pointsize', '15', '-background', '#151827', '-fill', 'white', join(out, `SHEET_${cat}_${dir}_${i + 1}.png`)]);
    }
  }
}
console.log(errors.length ? 'ERREURS PAGE : ' + JSON.stringify([...new Set(errors)].slice(0, 5)) : 'aucune erreur de page');
await browser.close(); server.kill();
