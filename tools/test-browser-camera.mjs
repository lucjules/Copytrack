// Caméra de course dans un vrai navigateur (Chromium, WebGL logiciel) : node tools/test-browser-camera.mjs   (npm run test:browser)
// Mesures sur les vraies images : distance de suivi et taille de la voiture selon la vitesse, anticipation en virage, zone de réception visible pendant un saut,
// redressement de la caméra à la sortie d'un mur, voiture toujours dans le champ, aucune valeur non finie. Seuils : ceux d'avant la phase 1 (docs/AUDIT-PHASE1-CAMERA-EDITEUR.md)
// resserrés : suivi, virage et sortie de mur ÉCHOUENT sur l'ancienne caméra (vérifié) ; le saut passe aussi sur l'ancienne (la zone de réception y était déjà dans le champ : test de non-régression). Playwright absent : test ignoré (REQUIRE_BROWSER / CI : échec).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const REQUIRED = !!(process.env.CI || process.env.REQUIRE_BROWSER);
let chromium;
const skip = (why) => { console.log((REQUIRED ? '  FAIL ' : '  skip ') + why); process.exit(REQUIRED ? 1 : 0); };
try { ({ chromium } = require('playwright')); } catch { skip('playwright introuvable'); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9500 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
let browser;
try { browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] }); } catch (e) { server.kill(); skip('Chromium introuvable'); }
let failures = 0, n = 0;
const errors = [];
async function test(name, fn) { n++; try { await fn(); console.log('  ok   ' + name); } catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 6).join('\n       ')); } }
const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 960, height: 540 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
await new Promise((r) => setTimeout(r, 700));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.locator('#wl-name').fill('Cam'); await page.locator('#wl-submit').evaluate((el) => el.click());
await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 30000, polling: 100 });
await page.evaluate(() => { const A = window.copytrack; A.settings.tutorialDone = true; A.settings.telemetry = false; A.saveSettings(); A.ui.closeModal(); });
await page.waitForTimeout(800); await page.evaluate(() => window.copytrack.ui.closeModal());

async function begin(script, l, v0, cruise = 0) {
  await page.evaluate(async ([sc, o]) => { const { scriptTrack } = await import('/js/track.js'); window.copytrack.playTrack(scriptTrack('Essai', sc, o), { trackKey: null }); }, [script, { l }]);
  await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, { timeout: 30000, polling: 100 });
  await page.evaluate(async ([v0, cruise]) => {
    const { Autopilot } = await import('/js/autopilot.js');
    const S = window.copytrack.session; window.__S = S; S.__real = S.update.bind(S); S.update = () => {};      // la boucle du jeu n'avance plus la course : on l'avance image par image, à la main
    window.__bad = 0; window.__out = 0; window.__frames = 0;
    const bot = new Autopilot(S.track.path); bot.reset(S.phys);
    window.__ctl = { steer: null, cruise };
    S.app.input.drive = () => { const c = window.__ctl, b = bot.control(S.phys); return { steer: c.steer ?? b.steer, throttle: S.phys.speed * 3.6 < (c.cruise || 999), brake: false, drift: false }; };
    const p = S.phys; if (v0) { p.vel.x = -Math.sin(p.yaw) * v0 / 3.6; p.vel.z = -Math.cos(p.yaw) * v0 / 3.6; p.fwdSpeed = v0 / 3.6; }
    const V = window.copytrack.camera.position.constructor;
    window.__frame = (k = 1) => {
      const A = window.copytrack, cam = A.camera;
      for (let i = 0; i < k; i++) {
        S.__real(1 / 60); window.__frames++;
        const q = cam.quaternion;
        if (![cam.position.x, cam.position.y, cam.position.z, q.x, q.y, q.z, q.w, cam.fov].every(Number.isFinite)) window.__bad++;
      }
      A.renderer.render(A.scene, cam);
      const c = S.car.group.position, v = new V(c.x, c.y + 0.5, c.z).project(cam);
      if (S.state === 'racing' && (Math.abs(v.x) > 0.9 || Math.abs(v.y) > 0.9 || v.z > 1 || v.z < -1)) window.__out++;      // la voiture sort du champ
    };
    window.__m = () => {
      const A = window.copytrack, cam = A.camera, car = S.car.group.position, p = S.phys, V2 = cam.position.constructor;
      const fw = new V2(); cam.getWorldDirection(fw);
      const proj = (x, y, z) => { const q = new V2(x, y, z).project(cam); return q.x; };
      const carW = Math.abs(proj(car.x - Math.cos(p.yaw), car.y, car.z + Math.sin(p.yaw)) - proj(car.x + Math.cos(p.yaw), car.y, car.z - Math.sin(p.yaw))) / 2 * 100;
      const cf = [-Math.sin(p.yaw), -Math.cos(p.yaw)];
      const yawOff = Math.atan2(fw.x * cf[1] - fw.z * cf[0], fw.x * cf[0] + fw.z * cf[1]) * 180 / Math.PI;
      const perp = (u) => { const d = u.x * fw.x + u.y * fw.y + u.z * fw.z; const r = [u.x - fw.x * d, u.y - fw.y * d, u.z - fw.z * d]; const l = Math.hypot(...r) || 1; return r.map((c) => c / l); };
      const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI;
      const body = perp(new V2(0, 1, 0).applyQuaternion(S.car.group.quaternion));
      return { dist: Math.hypot(cam.position.x - car.x, cam.position.z - car.z), carW, yawOff, horizon: ang(perp(cam.up), perp({ x: 0, y: p.gSign, z: 0 })), carTilt: ang(perp(cam.up), body), kmh: p.speed * 3.6 };
    };
  }, [v0, cruise]);
}
const until = (cond, max = 4000) => page.evaluate(([c, max]) => { const S = window.__S; const f = new Function('S', 'return (' + c + ')'); let g = 0; while (!f(S) && g++ < max) window.__frame(1); return g < max; }, [cond, max]);
const end = async () => { const r = await page.evaluate(() => ({ bad: window.__bad, out: window.__out, frames: window.__frames })); await page.evaluate(() => { window.copytrack.quitRace(); window.copytrack.showMenu('menu'); }); await page.waitForTimeout(250); return r; };

try {
  await test('suivi : la caméra garde sa distance à haute vitesse (280 km/h ≤ 1,3 × la distance à 100 km/h ; avant 1,42) et la voiture reste lisible (≥ 4,8 % de la largeur ; avant 3,5 %)', async () => {
    await begin('start S40 finish', 4, 0);
    const m = {};
    for (const v of [100, 280]) {
      await page.evaluate((v) => { window.__ctl.cruise = v; }, v);
      assert.ok(await until(`S.phys.speed*3.6 > ${v - 3}`));
      await page.evaluate(() => window.__frame(90)); m[v] = await page.evaluate(() => window.__m());
    }
    const r = await end();
    assert.ok(m[280].dist / m[100].dist <= 1.3, `distance ${m[100].dist.toFixed(1)} → ${m[280].dist.toFixed(1)} m`);
    assert.ok(m[280].carW >= 4.8, `voiture ${m[280].carW.toFixed(1)} % de la largeur à 280 km/h`);
    assert.equal(r.bad, 0, 'valeurs non finies'); assert.equal(r.out, 0, 'voiture sortie du champ');
  });
  await test('virage à 150 km/h : l\'écart entre la visée de la caméra et le cap de la voiture reste sous 12° (avant 17,8°) : la caméra anticipe le virage', async () => {
    await begin('start S3 R S3 R S3 finish', 4, 0, 150);
    assert.ok(await until('S.phys.speed*3.6 > 147')); assert.ok(await until('Math.abs(S.phys.steer) > 0.2'));
    await page.evaluate(() => window.__frame(50));
    const m = await page.evaluate(() => window.__m()); const r = await end();
    assert.ok(Math.abs(m.yawOff) < 12, `écart ${m.yawOff.toFixed(1)}°`);
    assert.equal(r.bad, 0); assert.equal(r.out, 0, 'voiture sortie du champ');
  });
  await test('saut : à la montée, au sommet et à la descente, la zone de réception est dans le champ (|x| < 0,5, |y| < 0,6) et la voiture aussi', async () => {
    const { scriptTrack } = await import('../js/track.js'), { CarPhysics } = await import('../js/physics.js'), { RaceLogic, placeAtStart } = await import('../js/raceLogic.js'), { Autopilot } = await import('../js/autopilot.js');
    const sc = 'start S4 UU G3 S3 finish', tr = scriptTrack('t', sc, { l: 2 });
    const ph = new CarPhysics(tr), lg = new RaceLogic(tr); placeAtStart(ph, lg); ph.graceT = 0; const bot = new Autopilot(tr.path); bot.reset(ph); ph.vel.z = -200 / 3.6; ph.fwdSpeed = 200 / 3.6;
    let took = false, land = null;
    for (let i = 0; i < 3600 && !land; i++) { ph.clock = i; ph.step({ steer: bot.control(ph).steer, throttle: ph.speed * 3.6 < 200, brake: false }); if (!ph.grounded && ph.pos.y > 14) took = true; if (took && ph.ev.land > 0) land = [ph.pos.x, ph.pos.y, ph.pos.z]; }
    assert.ok(land, 'le saut atterrit');
    await begin(sc, 2, 200, 200);
    assert.ok(await until('!S.phys.grounded && S.phys.pos.y > 14')); await page.evaluate(() => window.__frame(20));
    const at = () => page.evaluate((land) => { const A = window.copytrack, q = new A.camera.position.constructor(land[0], land[1], land[2]).project(A.camera); return { x: q.x, y: q.y, z: q.z }; }, land);
    const seen = [await at()];
    assert.ok(await until('S.phys.vel.y < 0.5')); await page.evaluate(() => window.__frame(4)); seen.push(await at());
    await page.evaluate(() => window.__frame(25)); seen.push(await at());
    const r = await end();
    for (const q of seen) assert.ok(Math.abs(q.x) < 0.5 && Math.abs(q.y) < 0.6 && q.z < 1, JSON.stringify(q));
    assert.equal(r.bad, 0); assert.equal(r.out, 0, 'voiture sortie du champ pendant le saut');
  });
  await test('sortie d\'un mur : la caméra rejoint l\'horizon du monde (≤ 15° de roulis 0,3 s après la sortie ; avant 31°) sans jamais s\'écarter de plus de 45° de la voiture', async () => {
    await begin('start S3 [tr01s] S6< [tr10s] S3 finish', 4, 0, 200);
    assert.ok(await until('S.phys.rib && S.phys.rib.tile.o')); await page.evaluate(() => window.__frame(30));
    await page.evaluate(() => { window.__ctl.steer = -1; });
    assert.ok(await until('!S.phys.rib'));
    const s = [];
    for (let k = 0; k < 6; k++) { s.push(await page.evaluate(() => window.__m())); await page.evaluate(() => window.__frame(6)); }
    const r = await end();
    assert.ok(s[3].horizon <= 15, `horizon à 0,3 s : ${s[3].horizon.toFixed(1)}° (avant 31°)`);      // 0,3 s après la sortie
    assert.ok(Math.max(...s.map((m) => m.carTilt)) <= 45, `voiture penchée de ${Math.max(...s.map((m) => m.carTilt)).toFixed(0)}° dans l'image`);
    assert.equal(r.bad, 0);
  });
  await test('looping, vrille et plafond : aucune valeur non finie, la voiture reste dans le champ', async () => {
    for (const [sc, cond] of [['start S3 O S3 finish', 'S.phys.rib'], ['start S2 TW.f S3^ TWB.f S3 finish', 'S.phys.rib']]) {
      await begin(sc, 4, 0, 200);
      assert.ok(await until(cond)); await page.evaluate(() => window.__frame(160));
      const r = await end();
      assert.equal(r.bad, 0, sc); assert.ok(r.out <= r.frames * 0.05, `${sc} : voiture hors champ sur ${r.out} images de ${r.frames}`);
    }
  });
} finally {
  await browser.close(); server.kill();
}
if (errors.length) { failures++; console.log('  FAIL erreurs de page : ' + errors.slice(0, 3).join(' | ')); }
console.log(failures ? `\n${failures} échec(s) sur ${n}` : `\nTous les tests navigateur de la caméra passent (${n}).`);
process.exit(failures ? 1 : 0);
