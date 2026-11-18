// Audit du rendu (phase 2) : tours automatiques des circuits officiels, dans le vrai jeu (Chromium sans écran). Le pilote automatique roule ; toutes les
// demi-secondes on regarde la CAMÉRA DE COURSE : sous le terrain, dans l'épaisseur d'une route, voiture cachée derrière une pièce (rayon caméra → voiture),
// saut brusque de la caméra. node tools/audit-rendu/tours.mjs [--max=N] [--secs=S] [--json=fichier]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k) => (process.argv.find((a) => a.startsWith('--' + k + '=')) || '').split('=')[1];
const MAX = +(arg('max') || 999), SECS = +(arg('secs') || 75), JSON_OUT = arg('json');

const { chromium } = require('playwright');
const PORT = 9600 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const results = [];
try {
  const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 640, height: 360 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.locator('#wl-name').fill('Tours'); await page.locator('#wl-submit').evaluate((el) => el.click());
  await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 30000, polling: 100 });
  await page.evaluate(() => { const A = window.copytrack; A.settings.tutorialDone = true; A.settings.telemetry = false; A.settings.quality = 'high'; A.saveSettings(); A.ui.closeModal(); });
  await page.waitForTimeout(600); await page.evaluate(() => window.copytrack.ui.closeModal());
  const n = Math.min(MAX, await page.evaluate(() => window.copytrack.builtins.length));
  for (let i = 0; i < n; i++) {
    const r = await page.evaluate(async ([i, secs]) => {
      const A = window.copytrack, B = A.builtins[i];
      const THREE = await import('/js/vendor/three.module.min.js');
      const { Autopilot } = await import('/js/autopilot.js');
      const { SLAB_T } = await import('/js/constants.js');
      A.playTrack(B.track, { trackKey: null });
      const t0 = performance.now();
      while (!(A.session && A.session.state === 'racing') && performance.now() - t0 < 15000) { A.session && A.session.update(1 / 60); }
      const S = A.session;
      if (!S || S.state !== 'racing') return { name: B.def.name, error: 'pas de départ' };
      const real = S.update.bind(S); S.update = () => {};
      const bot = new Autopilot(S.track.path); bot.reset(S.phys);
      S.app.input.drive = () => { const b = bot.control(S.phys); return { steer: b.steer, throttle: b.throttle !== false, brake: !!b.brake, drift: false }; };
      const cam = A.camera, ray = new THREE.Raycaster(), meshes = [];
      S.view.group.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.attributes.position && o.geometry.attributes.position.count > 6) meshes.push(o); });
      const O = {}, prev = new THREE.Vector3(), prevCar = new THREE.Vector3();
      let samples = 0, hidden = 0, inSlab = 0, under = 0, snaps = 0, finished = false;
      const where = { hidden: [], inSlab: [], under: [], snaps: [] };
      const frames = secs * 60;
      for (let f = 0; f < frames; f++) {
        real(1 / 60);
        if (S.state === 'finished') { finished = true; break; }
        if (S.phys.lost) bot.reset(S.phys);
        const c = cam.position, car = S.car.group.position;
        if (f > 30 && prev.distanceTo(c) > 9 && prevCar.distanceTo(car) < 4) { snaps++; if (where.snaps.length < 4) where.snaps.push([Math.round(car.x), Math.round(car.y), Math.round(car.z)]); }
        prev.copy(c); prevCar.copy(car);
        if (f % 30) continue;
        samples++;
        if (c.y < 0.25) { under++; if (where.under.length < 4) where.under.push([Math.round(c.x), Math.round(c.y), Math.round(c.z)]); }
        S.track.surfaceAt(c.x, c.y + SLAB_T + 0.3, c.z, O, SLAB_T + 0.6);
        if (O.tile && c.y < O.h - 0.05 && c.y > O.h - SLAB_T - 0.1) { inSlab++; if (where.inSlab.length < 4) where.inSlab.push([Math.round(c.x), Math.round(c.y), Math.round(c.z), O.tile.t]); }
        const target = new THREE.Vector3(car.x, car.y + 0.8, car.z), dir = target.clone().sub(c), dist = dir.length();
        ray.set(c, dir.normalize()); ray.far = dist - 2.5; ray.near = 0.4;
        const hit = ray.intersectObjects(meshes, false)[0];
        if (hit) { hidden++; if (where.hidden.length < 6) where.hidden.push([Math.round(car.x), Math.round(car.y), Math.round(car.z), Math.round(hit.distance)]); }
      }
      const out = { name: B.def.name, samples, hidden, inSlab, under, snaps, finished, cps: S.logic.collected.size, where };
      S.update = real;
      A.quitRace(); A.showMenu('menu');
      return out;
    }, [i, SECS]);
    results.push(r);
    console.log(`${String(i).padStart(2)} ${(r.name || '').padEnd(28)} ${r.error || `échantillons ${r.samples}, voiture cachée ${r.hidden}, caméra dans une route ${r.inSlab}, sous le sol ${r.under}, sauts ${r.snaps}, checkpoints ${r.cps}${r.finished ? ", arrivée" : ""}`}`);
  }
  if (errors.length) console.log('erreurs de la page :', errors.slice(0, 5));
} finally {
  await browser.close();
  server.kill();
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 1));
