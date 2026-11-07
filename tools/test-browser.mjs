// Test d'intégration dans un vrai navigateur (Chromium sans écran, WebGL logiciel) : node tools/test-browser.mjs   (npm run test:browser)
//
// Le reste de la suite ne teste que le noyau (Node, sans DOM). Ce script ouvre le jeu et parcourt les écrans et les flux principaux :
// accueil invité, menu, carrière, course (décompte, conduite, pause, recommencer), éditeur (pose, annuler, test), garage, profil
// (compte, sauvegardes, options, commandes), communauté hors ligne, mes circuits, et un championnat multijoueur à DEUX onglets (vraie liaison WebRTC sur la machine, signalisation locale ?net=local). Il échoue à la moindre erreur JavaScript de la page.
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
try { browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--disable-features=WebRtcHideLocalIpsWithMdns'] }); }
catch (e) { server.kill(); console.log('  skip Chromium introuvable : test navigateur ignoré (' + String(e.message).split('\n')[0] + ')'); process.exit(0); }

let failures = 0;
const errors = [];
async function test(name, fn) {
  const before = errors.length;
  try { await fn(); if (errors.length > before) throw new Error('erreurs de la page : ' + errors.slice(before).join(' | ')); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 5).join('\n       ')); }
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
// Les polices Google et Supabase ne sont pas joignables ici : ces échecs réseau ne sont pas des erreurs du jeu.
const OFFLINE = /fonts\.(googleapis|gstatic)|supabase\.co|net::ERR|Failed to load resource|ERR_INTERNET_DISCONNECTED/;
async function hook(p) {
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  return p;
}
const page = await hook(await ctx.newPage());

const shot = async (n) => { if (shots) await page.screenshot({ path: join(shots, n + '.png') }); };
const app = (fn, arg) => page.evaluate(fn, arg);
const waitApp = (cond, arg, timeout = 30000) => page.waitForFunction(cond, arg, { timeout });
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
    assert.equal(await app(() => window.copytrack.builtins.length), 72);
  });

  await test('carrière : 72 circuits listés, le premier se lance et se conduit', async () => {
    await click('[data-action="play"]');
    await waitApp(() => document.querySelectorAll('#track-list .card:not(.daily-card)').length === 72);
    await shot('03-carriere');
    await click('#track-list .track-group:not(.ch-open) .card:not(.daily-card):not(.locked)');
    await waitApp(() => window.copytrack.mode === 'race' && window.copytrack.session && window.copytrack.session.state);
    await waitApp(() => window.copytrack.session.state === 'racing', null, 40000);
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
    await waitApp(() => window.copytrack.mode === 'race', null, 40000);
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
    await waitApp(() => window.copytrack.mode === 'race', null, 40000);
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

  await test('académie : menu des six leçons, leçon 1 jouée et réussie, bilan, retour au menu des leçons', async () => {
    const btn = (label) => page.evaluate((l) => { const b = [...document.querySelectorAll('#modal-actions button')].find((x) => x.textContent.trim() === l); if (!b) throw new Error('bouton introuvable : ' + l); b.click(); }, label);
    await app(async () => { const { profile, saveProfile } = await import('/js/profile.js'); const p = profile(); p.academy = {}; saveProfile(); window.copytrack.academyMenu(); });
    await waitApp(() => document.querySelectorAll('.academy-list li').length === 6);
    await shot('16-academie');
    await app(() => document.querySelector('[data-lesson="0"]').click());
    await waitApp(() => window.copytrack.ui.modalOpen && /Leçon 1/.test(document.getElementById('modal-title').textContent));
    await btn('Commencer');
    await waitApp(() => window.copytrack.mode === 'race' && window.copytrack.session && window.copytrack.session.opts.academy, null, 30000);
    await waitApp(() => window.copytrack.session.state === 'racing', null, 30000);
    await app(() => window.copytrack.session._finish(12.5));
    await waitApp(() => /Leçon réussie/.test(document.getElementById('modal-title').textContent), null, 10000);
    assert.equal(await app(async () => (await import('/js/profile.js')).profile().academy.prise), 1);
    await shot('17-lecon-reussie');
    await btn('Académie');
    await waitApp(() => window.copytrack.mode === 'menu' && document.querySelectorAll('.academy-list li.done').length === 1, null, 10000);
    await app(async () => { const { profile, saveProfile } = await import('/js/profile.js'); const p = profile(); p.academy = {}; p.coins = 0; saveProfile(); window.copytrack.ui.closeModal(); });
  });

  await test('éditeur guidé : l\'essentiel seulement, les autres pièces refusées, « Tout afficher » rend tout', async () => {
    await app(() => { window.copytrack.settings.editorGuided = true; window.copytrack.openEditor(); });
    await waitApp(() => window.copytrack.mode === 'editor' && window.copytrack.session && window.copytrack.session.guidedOn, null, 20000);
    const vis = () => app(() => {
      const pal = document.getElementById('ed-palette'), v = (q) => [...pal.querySelectorAll(q)].filter((e) => !e.hidden).length;
      return { guided: pal.classList.contains('guided'), banner: !pal.querySelector('.pal-guided').hidden, fams: v('.fam-card'), singles: v('.pal-row:not(.surf):not(.decos) > .piece-btn[data-piece]'), tabs: v('.pal-tab[data-tab]'), groups: v('.opt-group') };
    });
    const g = await vis();
    assert.ok(g.guided && g.banner, 'bandeau'); assert.equal(g.fams, 2); assert.equal(g.singles, 2); assert.equal(g.tabs, 2); assert.equal(g.groups, 1, 'seul le groupe checkpoint');
    await shot('18-editeur-guide');
    const refused = await app(() => { const s = window.copytrack.session; s.setTool('loop'); return s.tool; });
    assert.notEqual(refused, 'loop', 'une pièce du mode complet est refusée');
    await app(() => document.querySelector('#ed-palette .pal-guided button').click());
    const f = await vis();
    assert.ok(!f.guided && !f.banner); assert.ok(f.fams >= 5 && f.singles > 10 && f.tabs === 5 && f.groups > 3, JSON.stringify(f));
    assert.equal(await app(() => window.copytrack.settings.editorGuided), false);
    assert.equal(await app(() => { const s = window.copytrack.session; s.setTool('loop'); return s.tool; }), 'loop');
    await app(() => window.copytrack.leaveEditor());
    await waitApp(() => window.copytrack.mode === 'menu');
    await app(() => { window.copytrack.settings.editorGuided = null; window.copytrack.saveSettings(); });
  });

  // Une vraie course du pilote automatique (commandes enregistrées) : sert au lien de défi et à l'export vidéo.
  const makeRun = () => app(async () => {
    const { Simulation } = await import('/js/simulation.js');
    const { Autopilot } = await import('/js/autopilot.js');
    const { InputRecorder, quantSteer } = await import('/js/replay.js');
    const b = window.copytrack.builtins[0], sim = new Simulation(b.track), rec = new InputRecorder();
    sim.start();
    const bot = new Autopilot(b.track.path, { latLimit: 56 * 0.8 });
    bot.reset(sim.phys);
    for (let i = 0; i < 120 * 90; i++) {
      const inp = bot.control(sim.phys); inp.steer = quantSteer(inp.steer); rec.push(inp, false);
      const ev = sim.step(inp);
      if (sim.lost) sim.rewind();
      if (ev && ev.type === 'finish') return { key: b.key, inputs: rec.encode(), time: sim.logic.time };
    }
    throw new Error('pas d\'arrivée');
  });

  await test('lien de défi : un fantôme partagé (#g=…) ouvre « Défi partagé », importe le fantôme et lance la course contre lui', async () => {
    const run = await makeRun();
    const code = await app(async (r) => (await import('/js/replay.js')).encodeGhost({ trackKey: r.key, time: r.time, name: 'Amie', inputs: r.inputs }), run);
    // 1. Une autre page, ouverte directement sur le lien (comme un ami qui clique).
    const C = await hook(await ctx.newPage());
    try {
      await C.goto(`http://127.0.0.1:${PORT}/#g=${encodeURIComponent(code)}`, { waitUntil: 'load' });
      if (await C.locator('#wl-name').isVisible().catch(() => false)) { await C.locator('#wl-name').fill('Ami'); await C.locator('#wl-submit').evaluate((el) => el.click()); }
      await C.waitForFunction(() => window.copytrack && window.copytrack.ui.modalOpen && /Défi partagé/.test(document.getElementById('modal-title').textContent), null, { timeout: 30000 });
      assert.ok((await C.evaluate(() => document.getElementById('modal-body').textContent)).includes('Amie'));
      assert.equal(await C.evaluate(() => location.hash), '', 'le fragment est retiré de l\'adresse');
    } finally { await C.close(); }
    // 2. Dans la page de jeu : « Courir contre lui » lance le circuit avec le fantôme violet.
    await app(async (c) => { const m = await import('/js/replay.js'); window.copytrack.openGhostLink(m.ghostFromHash('#g=' + encodeURIComponent(c))); }, code);
    await waitApp(() => /Défi partagé/.test(document.getElementById('modal-title').textContent));
    await page.evaluate(() => [...document.querySelectorAll('#modal-actions button')].find((x) => x.textContent.trim() === 'Courir contre lui').click());
    await waitApp(() => window.copytrack.mode === 'race' && window.copytrack.session && window.copytrack.session.ghosts, null, 30000);
    assert.ok(await app(() => window.copytrack.session.ghosts.some((g) => g.label === 'Amie')), 'le fantôme de l\'amie est sur la piste');
    await app(() => window.copytrack.quitRace());
    await waitApp(() => window.copytrack.mode === 'menu');
    await app(() => { localStorage.removeItem('copytrack.ghostImp'); });
  });

  await test('export vidéo : le replay est rejoué et enregistré en WebM (ou refusé proprement si le navigateur ne sait pas)', async () => {
    const run = await makeRun();
    await app(() => window.copytrack.playBuiltin(0));
    await waitApp(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, 40000);
    await app((r) => { window.copytrack.session.lastRun = { inputs: r.inputs, time: r.time }; }, run);
    await app(() => window.copytrack.watchReplay());
    await waitApp(() => window.copytrack.session && window.copytrack.session.replay, null, 20000);
    const supported = await app(async () => (await import('/js/videoExport.js')).videoSupported(window.copytrack.renderer.domElement));
    const dl = page.waitForEvent('download', { timeout: 120000 }).catch(() => null);
    const started = await app(() => window.copytrack.session.exportVideo({ speed: 4 }));
    assert.equal(started, supported, 'démarre si et seulement si le navigateur sait enregistrer');
    if (supported) {
      assert.match(await app(() => document.querySelector('#replay-bar .rs').textContent), /REC/);
      await waitApp(() => window.copytrack.session.lastVideo, null, 120000);
      const v = await app(() => window.copytrack.session.lastVideo);
      assert.ok(v.size > 5000 && /webm/.test(v.type) && /^copytrack-.*\.webm$/.test(v.name), JSON.stringify(v));
      const d = await dl;
      assert.ok(d, 'le navigateur a reçu un téléchargement');
      assert.match(d.suggestedFilename(), /\.webm$/);
      assert.doesNotMatch(await app(() => document.querySelector('#replay-bar .rs').textContent), /REC/, 'enregistrement terminé');
    }
    await app(() => window.copytrack.endReplay());
    await app(() => window.copytrack.quitRace());
    await waitApp(() => window.copytrack.mode === 'menu');
  });

  await test('fantôme rival (haut d\'un classement) : affiché sur la piste, suit son enregistrement, étiquette au nom du rival', async () => {
    await app(() => window.copytrack.playBuiltin(0));
    await waitApp(() => window.copytrack.session && window.copytrack.session.state, null, 40000);
    await app(async () => {
      const { GhostRunner } = await import('/js/replay.js');
      const { encodeFloats } = await import('/js/ghostFormat.js');
      const s = window.copytrack.session;
      const g = new GhostRunner(s.track, { bot: true, latK: 0.8, ghost: true });
      while (!g.done && g.k < 120 * 120) g.step();
      const r = g.ghostResult();
      s.setRivals([{ name: 'Rival', time: g.logic.time, ghost: encodeFloats(r.data), veh: r.veh }]);
      s.restart();
    });
    await waitApp(() => window.copytrack.session.state === 'racing', null, 40000);
    await page.waitForTimeout(3500);
    const st = await app(() => { const s = window.copytrack.session, r = s.rivals[0]; return { n: s.rivals.length, visible: r.car.group.visible, dist: r.car.group.position.distanceTo(s.renderPos), label: !!r.label }; });
    assert.equal(st.n, 1); assert.ok(st.label, 'étiquette'); assert.ok(st.visible && st.dist > 2, 'le rival roule devant (distance ' + st.dist.toFixed(1) + ' m)');
    await shot('04b-fantome-rival');
    await app(() => window.copytrack.quitRace());
    await waitApp(() => window.copytrack.mode === 'menu');
  });

  await test('éditeur : ambiance du circuit (nuit, brume épaisse) appliquée à la scène et gardée dans le code ; prefabs : coller un morceau fourni, enregistrer sa sélection, exporter, supprimer, importer', async () => {
    await app(() => { window.copytrack.settings.editorGuided = null; window.copytrack.openEditor({ name: 'Essai prefabs', code: null, fresh: true }); });
    await waitApp(() => window.copytrack.mode === 'editor' && window.copytrack.session && window.copytrack.session.openParams, null, 20000);
    // --- ambiance
    const before = await app(() => ({ far: window.copytrack.scenery.theme.fogFar, sun: window.copytrack.scenery.sun.intensity }));   // (l'éditeur éloigne le brouillard de la scène : on lit celui du décor)
    await app(() => window.copytrack.session.openParams());
    await waitApp(() => document.getElementById('pp-sky'));
    await page.evaluate(() => { for (const [id, v] of [['pp-sky', 'night'], ['pp-fog', 'thick'], ['pp-music', 'none']]) { const e = document.getElementById(id); e.value = v; } [...document.querySelectorAll('#modal-actions button')].find((b) => b.textContent.trim() === 'Appliquer').click(); });
    await waitApp(() => window.copytrack.session.track.ambiance.sky === 'night');
    const after = await app(() => ({ far: window.copytrack.scenery.theme.fogFar, sun: window.copytrack.scenery.sun.intensity, am: window.copytrack.session.track.ambiance, code: window.copytrack.session.track.encode() }));
    assert.ok(after.far < before.far * 0.5, `brume : ${before.far} -> ${after.far}`); assert.ok(after.sun < before.sun, `lumière : ${before.sun} -> ${after.sun}`);
    assert.deepEqual(after.am, { sky: 'night', fog: 'thick', music: 'none' });
    assert.ok(await app((c) => { const t = window.copytrack.session.track.constructor.decode(c); return t.ambiance.fog === 'thick'; }, after.code), 'le code relu garde l\'ambiance');
    await shot('22-ambiance-nuit');
    // --- prefabs
    await page.evaluate(() => document.querySelector('#ed-palette .pal-tab[data-tab="prefabs"]').click());
    await waitApp(() => document.querySelectorAll('#ed-palette [data-pf-starter]').length >= 6);
    const n0 = await app(() => window.copytrack.session.track.tiles.length);
    await page.evaluate(() => document.querySelector('#ed-palette [data-pf-starter="chicane"]').click());
    assert.ok(await app(() => window.copytrack.session.pasting && window.copytrack.session.clip.tiles.length === 4), 'collage armé');
    await app(() => { const s = window.copytrack.session; s.hover = { cx: 5, cz: 5 }; s.doPaste(); s.clearSel(); });
    assert.equal(await app(() => window.copytrack.session.track.tiles.length), n0 + 4, 'quatre pièces posées');
    await app(() => { const s = window.copytrack.session; s.setTool('select'); s.sel = { x0: 5, z0: 2, x1: 8, z1: 9 }; });
    await page.evaluate(() => document.querySelector('#ed-palette [data-pf="save"]').click());
    await waitApp(() => document.getElementById('pf-name'));
    await page.evaluate(() => { document.getElementById('pf-name').value = 'Ma chicane'; [...document.querySelectorAll('#modal-actions button')].find((b) => b.textContent.trim() === 'Enregistrer').click(); });
    await waitApp(() => document.querySelectorAll('#ed-palette .pf-mine').length === 1);
    assert.match(await page.evaluate(() => document.querySelector('#ed-palette .pf-mine').textContent), /Ma chicane/);
    const code = await app(async () => (await import('/js/storage.js')).listPrefabs()[0].code);
    assert.ok(code.startsWith('SHP1:'));
    await shot('23-prefabs');
    await page.evaluate(() => document.querySelector('#ed-palette [data-pf-del]').click());
    await waitApp(() => document.querySelectorAll('#ed-palette .pf-mine').length === 0);
    await page.evaluate(() => document.querySelector('#ed-palette [data-pf="import"]').click());
    await waitApp(() => document.getElementById('pf-code'));
    await page.evaluate(() => { document.getElementById('pf-code').value = 'SHP1:cassé'; [...document.querySelectorAll('#modal-actions button')].find((b) => b.textContent.trim() === 'Importer').click(); });
    assert.match(await page.evaluate(() => document.getElementById('pf-err').textContent), /invalide ou coupé/);
    await page.evaluate((c) => { document.getElementById('pf-code').value = c; [...document.querySelectorAll('#modal-actions button')].find((b) => b.textContent.trim() === 'Importer').click(); }, code);
    await waitApp(() => document.querySelectorAll('#ed-palette .pf-mine').length === 1);
    // guidé : l'onglet Prefabs disparaît
    await app(() => window.copytrack.session.setGuided(true));
    assert.equal(await page.evaluate(() => document.querySelector('#ed-palette .pal-tab[data-tab="prefabs"]').hidden), true, 'mode guidé : pas de prefabs');
    await app(async () => { window.copytrack.session.setGuided(false); const m = await import('/js/storage.js'); for (const p of m.listPrefabs()) m.deletePrefab(p.id); window.copytrack.settings.editorGuided = null; });
    await app(() => window.copytrack.leaveEditor());
    await waitApp(() => window.copytrack.mode === 'menu');
  });

  await test('communauté : onglet « Cette semaine », circuit de la semaine, difficulté estimée sur chaque carte (serveur simulé)', async () => {
    await app(async () => {
      const { online } = await import('/js/online.js');
      const mk = (i, n, extra = {}) => { const b = window.copytrack.builtins[i]; return { id: `00000000-0000-0000-0000-0000000000${String(i).padStart(2, '0')}`, name: n, decor: b.def.decor, code: b.track.encode(), author_time: 20, pieces: b.track.tiles.length, laps: 1, plays: 10, likes: 3, created_at: '2026-01-01', author: 'x', players: { name: 'Ana' }, description: '', ...extra }; };
      online.listTracks = async () => [mk(0, 'Récent A'), mk(40, 'Récent B')];
      online.trending = async ({ limit } = {}) => (limit === 1 ? [mk(40, 'Star', { week_players: 5 })] : [mk(40, 'Star', { week_players: 5 }), mk(0, 'Autre', { week_players: 3 })]);
      online.myLikes = async () => new Set();
      window.copytrack._comm = null; window.copytrack._featured = null;
    });
    await click('[data-action="community"]');
    await waitApp(() => document.querySelectorAll('#comm-list .card').length === 2);
    await waitApp(() => !document.getElementById('comm-featured').classList.contains('hidden'), null, 10000);
    assert.match(await page.evaluate(() => document.getElementById('comm-featured').textContent), /Circuit de la semaine[\s\S]*Star/);
    await page.evaluate(() => document.querySelector('#comm-tabs [data-sort="trending"]').click());
    await waitApp(() => [...document.querySelectorAll('#comm-list .card h3')].map((h) => h.textContent).join() === 'Star,Autre', null, 10000);
    const txt = await page.evaluate(() => document.getElementById('comm-list').textContent);
    assert.ok(txt.includes('🔥 5 pilotes cette semaine') && txt.includes('🔥 3 pilotes cette semaine'), txt.slice(0, 200));
    const stars = await page.evaluate(() => [...document.querySelectorAll('#comm-list .card .meta.diff')].map((e) => e.textContent.trim()));
    assert.equal(stars.length, 2); assert.ok(stars.every((x) => /^[◆◇]{5} \S/.test(x)), stars.join(' | '));
    await shot('19-communaute-semaine');
    await click('#community [data-action="back"]');
    await waitApp(() => window.copytrack.mode === 'menu');
  });

  await test('profil : les titres (aucun mérité au départ, conditions lisibles) ; garage : collections et exclusifs verrouillés avec leur condition', async () => {
    await app(async () => { const { profile, saveProfile } = await import('/js/profile.js'); const p = profile(); p.owned = {}; p.title = ''; p.collections = {}; p.academy = {}; p.dailyDays = []; saveProfile(); });
    await click('[data-action="profile"]');
    await waitApp(() => document.querySelector('#prof-titles select'));
    assert.equal(await page.evaluate(() => document.querySelectorAll('#prof-title option').length), 1, 'seulement « Aucun »');
    assert.equal(await page.evaluate(() => document.querySelectorAll('.title-list li').length), 9);
    assert.ok((await page.evaluate(() => document.querySelector('.title-list').textContent)).includes('Réussir les 6 leçons de l’Académie'));
    await shot('20-profil-titres');
    await click('#profile [data-action="back"]');
    await waitApp(() => window.copytrack.mode === 'menu');
    await app(() => window.copytrack.openGarage());
    await waitApp(() => window.copytrack.mode === 'garage');
    await page.evaluate(() => document.querySelector('#garage-tabs [data-cat="collections"]').click());
    await waitApp(() => document.querySelectorAll('#garage-list .gcard, #garage-list [class*="card"]').length >= 4);
    assert.ok((await page.evaluate(() => document.getElementById('garage-list').textContent)).includes('Néon · 0/4'));
    await page.evaluate(() => document.querySelector('#garage-tabs [data-cat="trail"]').click());
    await waitApp(() => /Terminer 7 défis du jour différents/.test(document.getElementById('garage-list').textContent));
    await page.evaluate(() => { const c = [...document.querySelectorAll('#garage-list > *')].find((e) => e.textContent.includes('Traînée dorée')); c.click(); });
    await waitApp(() => /exclusif/.test(document.getElementById('garage-buy-text').textContent) && document.getElementById('garage-buy-btn').disabled);
    await shot('21-garage-exclusif');
    await app(() => window.copytrack.showMenu('menu'));
    await waitApp(() => window.copytrack.mode === 'menu');
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

  // Deux onglets du même navigateur : vraie liaison WebRTC, signalisation par BroadcastChannel (?net=local). Les temps d'arrivée sont donnés par le test (_finish) : on
  // vérifie le branchement complet (salon, grille, classement en direct, collisions, clôture par l'hôte, points, manche suivante, podium), pas la conduite.
  await test('multijoueur : championnat à deux onglets (grille, avancement, collisions, résultats, manche suivante, podium)', async () => {
    const B = await hook(await ctx.newPage());
    try {
      await app(() => history.replaceState(null, '', '?net=local'));
      await B.goto(`http://127.0.0.1:${PORT}/?net=local`, { waitUntil: 'load' });
      if (await B.locator('#wl-name').isVisible()) { await B.locator('#wl-name').fill('Bea'); await B.locator('#wl-submit').evaluate((el) => el.click()); }
      await B.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 30000 });
      await B.evaluate(() => { window.copytrack.settings.playerName = 'Bea'; });
      await app(() => { window.copytrack.settings.playerName = 'Ana'; });
      const text = (p, sel) => p.evaluate((q) => (document.querySelector(q) || {}).textContent || '', sel);
      const clickBtn = (p, label) => p.evaluate((l) => { const b = [...document.querySelectorAll('#modal-actions button, #mp-cup button')].find((x) => x.textContent.trim() === l); if (!b) throw new Error('bouton introuvable : ' + l); b.click(); }, label);
      // Salle : Ana crée (par l'interface), Bea rejoint avec le code.
      await app(() => window.copytrack.multiMenu());
      await clickBtn(page, 'Créer une salle');
      await waitApp(() => document.querySelector('.mp-code b'));
      const code = (await text(page, '.mp-code b')).trim();
      assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
      await B.evaluate(() => window.copytrack.multiMenu());
      await B.locator('#mp-code').fill(code);
      await clickBtn(B, 'Rejoindre');
      await B.waitForFunction(() => window.copytrack.room && window.copytrack.room.list.some((m) => m.link === 'open'), null, { timeout: 20000 });
      await waitApp(() => window.copytrack.room.list.some((m) => m.link === 'open'), null, 20000);
      await shot('12-salon-championnat');
      // L'hôte choisit le championnat (2 manches, circuits faciles, collisions douces) et lance.
      await page.evaluate(() => { document.querySelector('input[name="mp-mode"][value="cup"]').click(); });
      await page.evaluate(() => { const r = document.querySelector('select[data-k="rounds"]'); r.value = '2'; r.dispatchEvent(new Event('change')); const p = document.querySelector('select[data-k="pool"]'); p.value = 'easy'; p.dispatchEvent(new Event('change')); });
      assert.match(await text(page, '#modal-actions [data-mp="start"]'), /Lancer le championnat/);
      await clickBtn(page, 'Lancer le championnat');
      await waitApp(() => window.copytrack.mode === 'race' && window.copytrack.session && window.copytrack.session.cup, null, 30000);
      await B.waitForFunction(() => window.copytrack.mode === 'race' && window.copytrack.session && window.copytrack.session.cup, null, { timeout: 30000 });
      const info = (p) => p.evaluate(() => { const s = window.copytrack.session; return { n: s.cup.n, total: s.cup.total, slot: s.cup.slot, count: s.cup.count, collisions: s.cup.collisions, x: s.phys.pos.x, z: s.phys.pos.z, track: s.track.name }; });
      const ia = await info(page), ib = await info(B);
      assert.deepEqual([ia.n, ia.total, ia.count, ia.collisions], [0, 2, 2, true]); assert.equal(ib.track, ia.track, 'même circuit');
      assert.deepEqual([ia.slot, ib.slot].sort(), [0, 1]);
      assert.ok(Math.hypot(ia.x - ib.x, ia.z - ib.z) >= 5, 'sur la grille, pas superposés');
      assert.ok((await text(page, '#mp-board')).includes('Manche 1/2'), 'tableau de manche');
      // Après le « GO » : chacun voit l'autre, et son avancement circule.
      await waitApp(() => window.copytrack.session.state === 'racing', null, 30000);
      await B.waitForFunction(() => window.copytrack.session.state === 'racing', null, { timeout: 30000 });
      await waitApp(() => [...window.copytrack.session.remote.values()].some((rc) => rc.ready), null, 20000);
      await B.waitForFunction(() => [...window.copytrack.session.remote.values()].some((rc) => rc.ready), null, { timeout: 20000 });
      // Collision douce : on pose la voiture d'Ana sur celle de Bea (immobile) ; elle doit en être repoussée.
      const gap = await page.evaluate(async () => {
        const s = window.copytrack.session, rc = [...s.remote.values()][0];
        s.protectUntil = 0;
        s.phys.pos.x = rc.pos.x + 0.4; s.phys.pos.z = rc.pos.z; s.phys.pos.y = rc.pos.y; s.phys.vel.x = s.phys.vel.y = s.phys.vel.z = 0;
        await new Promise((r) => setTimeout(r, 600));
        return Math.hypot(s.phys.pos.x - rc.pos.x, s.phys.pos.z - rc.pos.z);
      });
      assert.ok(gap > 1.5, 'repoussée de la voiture de Bea : écart ' + gap.toFixed(2) + ' m');
      // Conduite : Bea accélère quelques secondes ; Ana voit son avancement grimper.
      await B.keyboard.down('ArrowUp');
      await page.waitForTimeout(3500);
      await B.keyboard.up('ArrowUp');
      const prog = await page.evaluate(() => { const s = window.copytrack.session, id = [...s.remote.keys()][0]; return s.progOf(id); });
      assert.ok(prog > 0.002 && prog < 0.5, 'avancement de Bea vu par Ana : ' + prog);
      assert.ok((await text(page, '#mp-board')).includes('Bea'), 'classement en direct');
      await shot('13-manche-en-direct');
      // Arrivées : Bea 30,0 s puis Ana 30,5 s ; l'hôte clôt la manche, les points s'affichent chez les deux.
      await B.evaluate(() => window.copytrack.session._finish(30.0));
      await page.evaluate(() => window.copytrack.session._finish(30.5));
      await waitApp(() => document.getElementById('mp-cup'), null, 15000);
      await B.waitForFunction(() => document.getElementById('mp-cup'), null, { timeout: 15000 });
      const panel = await text(page, '#mp-cup');
      assert.ok(panel.includes('Manche 1/2') && panel.includes('+10') && panel.includes('+8'), 'points de la manche : ' + panel.replace(/\s+/g, ' '));
      assert.ok(panel.indexOf('Bea') < panel.indexOf('Ana'), 'Bea (30,0 s) devant Ana (30,5 s)');
      assert.ok(/Manche suivante.* dans \d+ s/.test(panel));
      await shot('14-resultats-manche');
      // Manche suivante : départ automatique, la grille suit le classement (Bea devant).
      await waitApp(() => window.copytrack.session && window.copytrack.session.cup && window.copytrack.session.cup.n === 1, null, 30000);
      await B.waitForFunction(() => window.copytrack.session && window.copytrack.session.cup && window.copytrack.session.cup.n === 1, null, { timeout: 30000 });
      assert.equal((await info(B)).slot, 0, 'la meilleure de la manche 1 part devant');
      assert.ok(!(await page.evaluate(() => !!document.getElementById('mp-cup'))), 'le panneau disparaît au départ');
      await waitApp(() => window.copytrack.session.state === 'racing', null, 30000);
      await B.waitForFunction(() => window.copytrack.session.state === 'racing', null, { timeout: 30000 });
      await B.evaluate(() => window.copytrack.session._finish(31.0));
      await page.evaluate(() => window.copytrack.session._finish(32.0));
      await waitApp(() => (document.getElementById('mp-cup') || {}).textContent && document.getElementById('mp-cup').textContent.includes('Championnat terminé'), null, 15000);
      const fin = await text(page, '#mp-cup');
      assert.ok(fin.includes('20 pts') && fin.includes('16 pts'), 'classement final : ' + fin.replace(/\s+/g, ' '));
      assert.ok(fin.indexOf('Bea') < fin.indexOf('Ana') && fin.includes('🥇'));
      await shot('15-podium');
      await clickBtn(page, 'Retour au salon');
      await waitApp(() => window.copytrack.mode === 'menu' && window.copytrack.ui.modalOpen);
    } finally {
      await app(() => { if (window.copytrack.room) window.copytrack.room.leave(); window.copytrack.ui.closeModal(); window.copytrack.showMenu('menu'); }).catch(() => {});
      await B.close();
    }
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
