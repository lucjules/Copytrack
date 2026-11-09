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
// PW_ONLY=<texte>[|<texte>…] : ne lance que les tests dont le nom contient l'un des textes (mise au point ; certains tests supposent l'état
// laissé par les précédents).
async function test(name, fn) {
  if (process.env.PW_ONLY && !process.env.PW_ONLY.split('|').some((x) => name.includes(x))) return;
  const before = errors.length;
  try { await fn(); if (errors.length > before) throw new Error('erreurs de la page : ' + errors.slice(before).join(' | ')); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 5).join('\n       ')); }
}

const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
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
    // Prototype de rollback (E18) : le monde à 4 voitures qui se percutent est le même dans Chromium que sous Node (condition d'un vrai rollback).
    const { referenceRace } = await import('./bench-rollback.mjs'), { BUILTIN_TRACKS: BT, buildBuiltin: bb } = await import('../js/tracks.js');
    const node = referenceRace(bb(BT.find((d) => d.id === 'eclats')), 4, 600).hash;
    const web = await page.evaluate(async () => { const { referenceRace: rr } = await import('/tools/bench-rollback.mjs'), { BUILTIN_TRACKS: B, buildBuiltin: b } = await import('/js/tracks.js'); return rr(b(B.find((d) => d.id === 'eclats')), 4, 600).hash; });
    assert.equal(web, node, 'monde de rollback : Chromium = Node');
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
    // La question des statistiques anonymes (posée une fois, puis toutes les 8 s tant qu'elle n'a pas de réponse) : répondue ici pour qu'elle ne s'ouvre
    // pas au milieu d'un autre test ; elle a son propre test (test-browser-i18n.mjs).
    await app(() => { window.copytrack.settings.telemetry = false; window.copytrack.saveSettings(); if (window.copytrack.ui.modalOpen) window.copytrack.ui.closeModal(); });
    assert.ok(await app(() => !document.getElementById('menu').classList.contains('hidden')), 'le menu doit être visible');
    assert.equal(await app(() => window.copytrack.builtins.length), 72);
  });

  await test('carrière : 72 circuits listés, le premier se lance et se conduit', async () => {
    await click('[data-action="play"]');
    await waitApp(() => document.querySelectorAll('#track-list .card:not(.daily-card):not(.season-card)').length === 72);      // (hors défi du jour et circuits de la saison de la semaine, qui s'ajoutent en tête)
    await shot('03-carriere');
    await click('#track-list .track-group:not(.ch-open) .card:not(.daily-card):not(.season-card):not(.locked)');
    await waitApp(() => !document.getElementById('race-hub').classList.contains('hidden'));     // une carte ouvre la fiche du circuit (Race Hub)
    await click('#hub-play');
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
    await app(async () => { const { profile, saveProfile } = await import('/js/profile.js'); const p = profile(); p.dailyDays = []; p.mutDays = []; p.dailyBest = 0; saveProfile(); });
    await click('[data-action="daily"]');
    await waitApp(() => !document.getElementById('race-hub').classList.contains('hidden'), null, 40000);
    assert.match(await page.evaluate(() => document.getElementById('hub-sub').textContent), /Défi du jour · \d\d\/\d\d\/\d{4}/);
    // Défi du jour 2 : la série, et la mutation du jour en tête des catégories de record
    assert.match(await page.evaluate(() => document.querySelector('.hub-daily').textContent), /Série : 0 jour[\s\S]*Mutation du jour : /);
    assert.match(await page.evaluate(() => document.querySelector('.hub-cats [data-cat]:not([data-cat=""])').textContent), /Mutation du jour : /);
    await click('.hub-cats [data-cat]:not([data-cat=""])');
    await waitApp(() => /^daily-\d{4}-\d\d-\d\d~v1\./.test(window.copytrack._hub.desc.key));
    await click('#hub-play');
    await waitApp(() => window.copytrack.mode === 'race' && window.copytrack.session.state === 'racing', null, 40000);
    assert.equal(await app(() => window.copytrack.session.opts.mutation), true);
    await app(() => window.copytrack.session._finish(window.copytrack.session.logic.steps / 120 + 30));
    await waitApp(() => !document.getElementById('finish').classList.contains('hidden'));
    await waitApp(() => /🔥 Série : 1 jour · mutation du jour \+30 ◆ · \+30 ◆/.test(document.getElementById('toast').textContent), null, 5000);
    assert.deepEqual(await app(async () => { const p = (await import('/js/profile.js')).profile(); return [p.dailyDays.length, p.mutDays.length]; }), [1, 1]);
    await app(() => window.copytrack.quitRace());
    await waitApp(() => window.copytrack.mode === 'menu' || !document.getElementById('race-hub').classList.contains('hidden'), null, 20000);
    await app(() => { window.copytrack._hub && window.copytrack.closeRaceHub && window.copytrack.closeRaceHub(); window.copytrack.showMenu('menu'); });
    await click('[data-action="daily"]');
    await waitApp(() => !document.getElementById('race-hub').classList.contains('hidden'), null, 40000);
    assert.match(await page.evaluate(() => document.querySelector('.hub-daily').textContent), /Série : 1 jour \(défi du jour fait\)[\s\S]*✓ terminée aujourd’hui/);
    await click('#hub-play');
    await waitApp(() => window.copytrack.mode === 'race', null, 40000);
    await page.waitForTimeout(600);
    await app(() => window.copytrack.quitRace());
    await waitApp(() => window.copytrack.mode === 'menu' || !document.getElementById('race-hub').classList.contains('hidden'), null, 20000);
    await app(() => window.copytrack.showMenu('menu'));
    await app(async () => { const { profile, saveProfile } = await import('/js/profile.js'); const p = profile(); p.dailyDays = []; p.mutDays = []; p.dailyBest = 0; saveProfile(); });
  });

  await test('progression du pilote : expérience à l’arrivée, défi de maîtrise dans la fiche, niveau et licences dans le profil', async () => {
    await app(async () => { const { profile, saveProfile } = await import('/js/profile.js'); const p = profile(); p.xp = 0; p.mastery = {}; p.licences = {}; p.xpDay = null; saveProfile(); });
    await app(() => { window.copytrack.showMenu('tracks'); window.copytrack.openBuiltinHub(0, 'tracks'); });
    await waitApp(() => /Maîtrise/.test(document.getElementById('hub-facts').textContent) && /0 \/ 4/.test(document.querySelector('.hub-mastery').textContent));
    await click('#hub-play');
    await waitApp(() => window.copytrack.mode === 'race' && window.copytrack.session.state === 'racing', null, 40000);
    await app(() => window.copytrack.session._finish(window.copytrack.session.logic.steps / 120 + 25));
    await waitApp(() => !document.getElementById('finish').classList.contains('hidden') && !document.getElementById('fin-xp').classList.contains('hidden'));
    assert.match(await page.evaluate(() => document.getElementById('fin-xp').textContent), /^\+\d+ XP\s+Niveau \d+[\s\S]*Première arrivée du jour sur ce circuit \+20[\s\S]*Défi de maîtrise \+40/);
    assert.ok(await app(async () => (await import('/js/profile.js')).profile().xp >= 60));
    await app(() => window.copytrack.quitRace());
    await waitApp(() => !document.getElementById('race-hub').classList.contains('hidden'), null, 20000);
    assert.match(await page.evaluate(() => document.querySelector('.hub-mastery').textContent), /1 \/ 4/, 'arrivée sans choc : un défi de maîtrise');
    await app(() => { window.copytrack.closeRaceHub(); window.copytrack.showScreen('profile'); });
    await waitApp(() => document.querySelector('.prof-progress') && /Niveau \d+/.test(document.querySelector('.prof-progress').textContent));
    assert.match(await page.evaluate(() => document.querySelector('.prof-progress').textContent), /Licence C[\s\S]*Licence S[\s\S]*Pour la Licence C[\s\S]*Défis de maîtrise : 1 \/ 288/);
    await app(async () => { const { profile, saveProfile } = await import('/js/profile.js'); const p = profile(); p.xp = 0; p.mastery = {}; p.xpDay = null; saveProfile(); window.copytrack.showMenu('menu'); });
  });

  await test('Race Hub : fiche immédiate (carte, légende, onglets), favori, dernières courses, replay du record, retour à la fiche', async () => {
    await app(async () => { const m = await import('/js/storage.js'); m.clearRecords(); const { profile, saveProfile } = await import('/js/profile.js'); profile().favorites = []; profile().favDel = {}; saveProfile(); });
    const ms = await app(() => { const t = performance.now(); window.copytrack.showMenu('tracks'); window.copytrack.openBuiltinHub(1, 'tracks'); return performance.now() - t; });
    assert.ok(!(await app(() => document.getElementById('race-hub').classList.contains('hidden'))), 'la fiche est affichée');
    assert.ok(ms < 1500, `fiche affichée en ${ms.toFixed(0)} ms (menu compris)`);
    const t2 = await app(() => { const t = performance.now(); window.copytrack.openBuiltinHub(1, 'tracks'); return performance.now() - t; });
    assert.ok(t2 < 100, `ouvrir la fiche ne doit pas attendre le réseau (${t2.toFixed(0)} ms)`);
    // la carte est dessinée (des pixels de route), la légende et les faits sont là
    const lit = await app(() => { const c = document.getElementById('hub-map'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 7) if (d[i] + d[i + 1] + d[i + 2] > 200) n++; return n; });
    assert.ok(lit > 200, 'la carte doit montrer le circuit (' + lit + ' pixels clairs)');
    assert.match(await page.evaluate(() => document.getElementById('hub-legend').textContent), /Départ[\s\S]*Arrivée/);
    assert.match(await page.evaluate(() => document.getElementById('hub-facts').textContent), /Distance de course[\s\S]*Médailles[\s\S]*Objectif bonus/);
    const tabs = await page.evaluate(() => [...document.querySelectorAll('#hub-board .lb-tabs .tab')].map((t) => t.textContent));
    assert.deepEqual(tabs, ['🌍 Mondial', '⏱ Secteurs', '👤 Personnel'], 'seulement les onglets dont les données existent');
    await waitApp(() => /Classement indisponible/.test(document.getElementById('hub-board').textContent), null, 15000);     // hors ligne ici : un état propre, pas un faux classement
    await click('#hub-board .lb-tabs [data-tab="personal"]');
    assert.match(await page.evaluate(() => document.getElementById('hub-board').textContent), /Pas encore de temps sur ce circuit/);
    assert.equal(await page.evaluate(() => document.getElementById('hub-watch').disabled), true, 'pas de record : rien à regarder');
    // zoom de la carte
    await click('[data-action="hub-zoom-in"]');
    assert.ok(await app(() => window.copytrack._hub.map.zoom > 1));
    await click('[data-action="hub-zoom-fit"]');
    // favori
    await click('#hub-fav');
    assert.equal(await page.evaluate(() => document.getElementById('hub-fav').getAttribute('aria-pressed')), 'true');
    await shot('07a-race-hub');
    // course depuis la fiche, arrivée simulée : elle compte dans les dernières courses et devient le record à regarder
    await click('#hub-play');
    await waitApp(() => window.copytrack.mode === 'race' && window.copytrack.session.state === 'racing', null, 40000);
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(800); await page.keyboard.up('ArrowUp');
    await app(() => window.copytrack.session._finish(window.copytrack.session.logic.steps / 120));
    await waitApp(() => !document.getElementById('finish').classList.contains('hidden'));
    assert.equal(await page.evaluate(() => document.getElementById('fin-hub').classList.contains('hidden')), false, '« Fiche du circuit » à l’arrivée');
    await click('#fin-hub');
    await waitApp(() => !document.getElementById('race-hub').classList.contains('hidden'), null, 20000);
    await click('#hub-board .lb-tabs [data-tab="personal"]');
    assert.match(await page.evaluate(() => document.getElementById('hub-board').textContent), /Mon record[\s\S]*Ma dernière course/);
    assert.equal(await page.evaluate(() => document.getElementById('hub-watch').disabled), false);
    await click('#hub-watch');
    await waitApp(() => window.copytrack.session && window.copytrack.session.replay && !document.getElementById('replay-bar').classList.contains('hidden'), null, 20000);
    await app(() => window.copytrack.endReplay());
    await waitApp(() => !document.getElementById('race-hub').classList.contains('hidden'), null, 20000);
    // Retour : vers la liste d'où l'on vient, avec le favori en tête
    await page.keyboard.press('Escape');
    await waitApp(() => !document.getElementById('tracks').classList.contains('hidden'));
    assert.match(await page.evaluate(() => (document.querySelector('#track-list .fav-group') || {}).textContent || ''), /Favoris/);
    await click('#track-list .fav-group .card');
    await waitApp(() => !document.getElementById('race-hub').classList.contains('hidden'));
    await click('#race-hub [data-action="hub-back"]');
    await waitApp(() => !document.getElementById('tracks').classList.contains('hidden'));
    await click('#tracks [data-action="back"]');
  });

  await test('catégorie de record : départ en moto, classement à part, retour à la fiche dans la même catégorie', async () => {
    await app(() => { window.copytrack.showMenu('tracks'); window.copytrack.openBuiltinHub(0, 'tracks'); });
    await waitApp(() => document.querySelector('#hub-launch [data-cat="veh-moto"]'));
    await click('#hub-launch [data-cat="veh-moto"]');
    assert.equal(await page.evaluate(() => document.querySelector('#hub-launch [data-cat="veh-moto"]').getAttribute('aria-checked')), 'true');
    assert.match(await app(() => window.copytrack._hub.desc.key), /~v1\.veh-moto$/);
    assert.match(await page.evaluate(() => document.getElementById('hub-launch').textContent), /Classement et record à part/);
    await click('#hub-play');
    await waitApp(() => window.copytrack.mode === 'race' && window.copytrack.session && window.copytrack.session.state, null, 40000);
    assert.equal(await app(() => window.copytrack.session.phys.vehicle), 'moto', 'la course part en moto');
    assert.match(await app(() => window.copytrack.session.trackKey), /~v1\.veh-moto$/);
    assert.equal(await app(() => window.copytrack.session.medals), null, 'pas de médailles dans une catégorie');
    await app(() => window.copytrack.quitRace());
    await waitApp(() => !document.getElementById('race-hub').classList.contains('hidden'), null, 20000);
    assert.equal(await page.evaluate(() => document.querySelector('#hub-launch [data-cat="veh-moto"]').getAttribute('aria-checked')), 'true', 'la fiche revient dans la catégorie choisie');
    await click('#hub-launch [data-cat=""]');
    assert.doesNotMatch(await app(() => window.copytrack._hub.desc.key), /~/);
    await click('#race-hub [data-action="hub-back"]');
    await click('#tracks [data-action="back"]');
  });

  await test('HUD d’entraînement : référence (à défaut le fantôme or), écart en direct, ligne dans la scène, moins de 0,3 ms par image ; Classique inchangé', async () => {
    assert.ok(await page.evaluate(() => document.getElementById('hud-train').classList.contains('hidden')), 'profil Classique : rien de plus');
    await app(() => { window.copytrack.showMenu('tracks'); window.copytrack.openBuiltinHub(2, 'tracks'); });
    await click('#hub-launch [data-hudtrain]');
    assert.equal(await app(() => window.copytrack.settings.hudProfile), 'training');
    await click('#hub-play');
    await waitApp(() => window.copytrack.mode === 'race' && window.copytrack.session && window.copytrack.session.state === 'racing', null, 40000);
    await waitApp(() => window.copytrack.session._train && window.copytrack.session._train.lt, null, 20000);
    assert.match(await page.evaluate(() => document.getElementById('tr-ref').textContent), /fantôme or[\s\S]*à défaut/);
    assert.ok(await app(() => window.copytrack.session._train.obj.length > 0), 'ligne et repères de freinage posés dans la scène');
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(2500); await page.keyboard.up('ArrowUp');
    assert.match(await page.evaluate(() => document.getElementById('tr-delta').textContent), /^[+-]/, 'écart en direct affiché');
    assert.match(await page.evaluate(() => document.getElementById('tr-vmax').textContent), /Vmax \d+ km\/h/);
    const cost = await app(() => { const T = window.copytrack.session._train; return T.cost / T.costN; });
    assert.ok(cost < 0.3, `${cost.toFixed(3)} ms par image en moyenne`);
    await shot('07c-hud-entrainement');
    assert.ok(await page.evaluate(() => document.body.classList.contains('hud-no-hint')), 'profil Entraînement : aide des touches cachée');
    await app(() => window.copytrack.quitRace());
    await waitApp(() => !document.getElementById('race-hub').classList.contains('hidden'), null, 20000);
    await click('#hub-launch [data-hudtrain]');
    assert.equal(await app(() => window.copytrack.settings.hudProfile), 'classic');
    assert.ok(await page.evaluate(() => !document.body.classList.contains('hud-no-hint')));
    await click('#race-hub [data-action="hub-back"]');
    await click('#tracks [data-action="back"]');
  });

  await test('Replay Theater : record comparé au fantôme or, se déplacer dans le temps donne exactement la lecture continue, analyse, caméras, retour', async () => {
    const corpus = JSON.parse(readFileSync(join(root, 'tools/compat/corpus.json'), 'utf8'));
    const run = corpus.runs.find((r) => /retour/.test(r.label));
    await app(async (r) => {
      const a = window.copytrack, i = a.builtins.findIndex((b) => b.def.id === 'eclats'), s = await import('/js/storage.js');
      s.saveRecord(a.builtins[i].key, { time: r.time, inputs: r.inputs, pv: (await import('/js/version.js')).PHYS_VER, date: Date.now(), splits: [] });
      a.showMenu('tracks'); a.openBuiltinHub(i, 'tracks');
    }, run);
    await page.locator('#hub-cmp').selectOption('gold');
    await click('#hub-watch');
    await waitApp(() => window.copytrack.session && window.copytrack.session._th && window.copytrack.session._th.traces, null, 30000);
    assert.equal(await page.evaluate(() => document.querySelectorAll('#th-runs li').length), 2, 'deux courses : le record et le fantôme or');
    assert.ok(await app(() => window.copytrack.session._th.marks.some((m) => m.kind === 'respawn')), 'le retour au checkpoint est marqué sur la barre de temps');
    const exact = await app(() => {
      const s = window.copytrack.session; s.replayPaused = true;
      s.theaterSeek(1800); const a = [s.phys.pos.x, s.phys.pos.y, s.phys.pos.z, s.phys.vel.x, s.logic.steps];
      s.theaterSeek(300); s.theaterSeek(1800); const b = [s.phys.pos.x, s.phys.pos.y, s.phys.pos.z, s.phys.vel.x, s.logic.steps];
      s.theaterSeek(s._th.total);
      return { same: a.every((v, i) => v === b[i]), finished: s.state, time: s.logic.time };
    });
    assert.ok(exact.same, 'revenir en arrière puis avancer redonne exactement la même voiture');
    assert.equal(exact.finished, 'finished'); assert.equal(exact.time, run.time, 'le replay redonne le temps du record');
    // le curseur de la barre de temps suit
    await app(() => window.copytrack.session.theaterSeek(1200));
    assert.equal(await page.evaluate(() => +document.getElementById('th-seek').value), 1200);
    // panneau d'analyse : secteurs (12) et écarts
    if (await page.evaluate(() => document.getElementById('theater-panel').classList.contains('hidden'))) await click('#theater [data-th="panel"]');
    await waitApp(() => document.querySelectorAll('#th-sectors tbody tr').length === 2);
    assert.equal(await page.evaluate(() => document.querySelectorAll('#th-sectors thead th').length), 13);
    // caméras : Libre puis Cinématique
    const cams = await app(() => { const s = window.copytrack.session, out = []; for (let i = 0; i < s.camList.length + 4; i++) { s.theaterCamera(); out.push(s.theaterCameraName()); } return out; });
    assert.ok(cams.includes('Libre') && cams.includes('Cinématique'), cams.join(', '));
    await app(() => { const s = window.copytrack.session; s.replayCam = s.camList.length + 3; s.replayPaused = false; });
    await page.waitForTimeout(1500);
    const cost = await app(() => { const T = window.copytrack.session._th; return T.cost / T.costN; });
    assert.ok(cost < 3, `interface du Theater : ${cost.toFixed(2)} ms par image en moyenne`);
    await shot('07d-replay-theater');
    await click('#theater [data-th="quit"]');
    await waitApp(() => !document.getElementById('race-hub').classList.contains('hidden'), null, 20000);
    assert.ok(await page.evaluate(() => document.getElementById('theater').classList.contains('hidden')));
    // « Revoir la course » à l'arrivée : le Theater, avec le record à côté
    await click('#hub-play');
    await waitApp(() => window.copytrack.mode === 'race' && window.copytrack.session.state === 'racing', null, 40000);
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(600); await page.keyboard.up('ArrowUp');
    await app(() => window.copytrack.session._finish(window.copytrack.session.logic.steps / 120));
    await waitApp(() => !document.getElementById('finish').classList.contains('hidden'));
    // Coach à l'arrivée : une course prudente (pilote automatique lent) face au record : des conseils localisés, avec leurs mesures.
    await app(async (r) => {
      const a = window.copytrack, s = a.session, { traceFromBot } = await import('/js/analysis/trace.js');
      const slow = traceFromBot(s.track, { latK: 0.4 });
      s.lastRun = { inputs: slow.inputs, time: slow.time }; s.prevRun = { inputs: r.inputs, time: r.time };
      await a._finishCoach(s, slow.time);
    }, run);
    await waitApp(() => !document.getElementById('fin-coach').classList.contains('hidden'), null, 20000);
    assert.ok(await page.evaluate(() => document.querySelectorAll('#fin-coach li').length >= 1));
    assert.match(await page.evaluate(() => document.querySelector('#fin-coach li').textContent), /^Secteur \d+ : .*\d+(\.\d+)? s perdues/);
    assert.match(await page.evaluate(() => document.querySelector('#fin-coach h3').textContent), /comparé à ton record/);
    assert.match(await page.evaluate(() => (document.getElementById('fin-coach-train') || {}).textContent || ''), /^🎓 S’entraîner : /, 'conseil adapté : un exercice de l’Académie');
    await click('#fin-replay');
    await waitApp(() => window.copytrack.session && window.copytrack.session._th, null, 20000);
    assert.deepEqual(await app(() => window.copytrack.session._th.runs.map((r) => r.label)), ['Cette course', 'Ancien record'], 'nouveau record : comparé à l’ancien');
    // Coach dans le Theater : la course prudente perd du temps face au record ; repères sur la barre et conseils cliquables.
    await waitApp(() => window.copytrack.session._th.traces, null, 30000);
    if (await page.evaluate(() => document.getElementById('theater-panel').classList.contains('hidden'))) await click('#theater [data-th="panel"]');
    await waitApp(() => document.querySelectorAll('#th-coach li').length >= 1, null, 10000);
    assert.ok(await app(() => window.copytrack.session._th.marks.some((m) => m.kind === 'coach')), 'repère du coach sur la barre de temps');
    await app(() => { window.copytrack.session.replayPaused = true; });       // (en lecture, le pas avancerait entre le clic et la vérification)
    await click('#th-coach [data-tip="0"]');
    assert.ok(await app(() => { const s = window.copytrack.session; return Math.abs(s.tick - Math.max(0, s._th.tips[0].tick - 360)) <= 1; }), 'le conseil amène 3 s avant le passage');
    await app(() => window.copytrack.endReplay());
    await waitApp(() => window.copytrack.session && !window.copytrack.session.replay && window.copytrack.mode === 'race', null, 20000);
    await app(() => window.copytrack.quitRace());
    await waitApp(() => !document.getElementById('race-hub').classList.contains('hidden'), null, 20000);
    await click('#race-hub [data-action="hub-back"]');
    await click('#tracks [data-action="back"]');
  });

  await test('course rapide : un clic lance le prochain circuit sans médaille', async () => {
    const expect = await app(async () => { const d = await import('/js/trackDescriptor.js'); const s = await import('/js/storage.js'); return d.quickRaceIndex(window.copytrack.builtins, s.getRecord); });
    await click('[data-action="quick"]');
    await waitApp(() => window.copytrack.mode === 'race' && window.copytrack.session, null, 40000);
    assert.equal(await app(() => window.copytrack.session.opts.builtinIndex), expect);
    await app(() => window.copytrack.quitRace());
    await waitApp(() => window.copytrack.mode === 'menu');
    await app(() => window.copytrack.showScreen('menu'));
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

  await test('garage : atelier de voiture (pièces libres, peinture, dessin, effets, code) : la voiture change, le profil garde, le code revient', async () => {
    await click('[data-action="garage"]');
    await waitApp(() => window.copytrack.mode === 'garage');
    await page.waitForTimeout(400);
    const meshes = () => app(() => { let n = 0; window.copytrack.session.car.group.traverse((o) => { if (o.isMesh) n++; }); return n; });
    const base = await meshes();
    await click('#garage-tabs [data-cat="studio"]');
    await page.waitForTimeout(200);
    assert.ok(await page.locator('.studio').count(), 'l\'atelier s\'affiche');
    await click('.studio .row button:has-text("+ Cylindre")');
    await click('.studio .row button:has-text("+ Sphère")');
    await page.waitForTimeout(400);
    assert.equal(await app(() => window.copytrack.session.draft.custom.parts.length), 2);
    assert.ok((await meshes()) >= base + 2, 'les pièces sont dans le modèle 3D');
    // symétrique : une copie de l'autre côté
    await page.locator('.studio input[type="checkbox"]').first().check();
    await page.waitForTimeout(400);
    // peinture : numéro et texte => livrée sur les flancs
    await click('.stabs button:has-text("Peinture")');
    await page.locator('.studio input[placeholder="07"]').fill('42');
    await page.waitForTimeout(400);
    assert.equal(await app(() => window.copytrack.session.draft.custom.paint.num), '42');
    // dessin : un pixel
    await click('.stabs button:has-text("Dessin")');
    const cv = page.locator('canvas.pixcv');
    const box = await cv.boundingBox();
    await page.mouse.click(box.x + 10, box.y + 10);
    assert.notEqual(await app(() => window.copytrack.session.draft.custom.draw), '0'.repeat(256), 'le pixel est posé');
    // effets
    await click('.stabs button:has-text("Effets")');
    await page.locator('.studio select').selectOption('square');
    await page.waitForTimeout(300);
    // enregistré dans le profil (gratuit)
    const saved = await app(() => { const c = JSON.parse(JSON.stringify(window.copytrack.session.draft.custom)); return { parts: c.parts.length, num: c.paint.num, eng: c.fx.engine }; });
    assert.deepEqual(saved, { parts: 2, num: '42', eng: 'square' }, 'deux pièces, numéro, timbre');
    const inProfile = await app(async () => (await import('/js/profile.js')).profile().loadout.custom.parts.length);
    assert.equal(inProfile, 2, 'la personnalisation est enregistrée sans rien acheter');
    // code : exporter puis tout retirer puis réimporter
    await click('.stabs button:has-text("Code")');
    const code = await page.locator('textarea.codebox').first().inputValue();
    assert.ok(code.startsWith('SHC1:'));
    await click('.studio button:has-text("Retirer toute la personnalisation")');
    assert.equal(await app(() => window.copytrack.session.draft.custom.parts.length), 0);
    await click('.stabs button:has-text("Code")');
    await page.locator('textarea.codebox').nth(1).fill(code);
    await click('.studio button:has-text("Importer")');
    await page.waitForTimeout(300);
    assert.equal(await app(() => window.copytrack.session.draft.custom.parts.length), 2, 'le code redonne la voiture');
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

  await test('personnalisation de l\'interface : thème, accent, compteur, HUD déplaçable, caméra du joueur utilisée en course', async () => {
    await app(() => window.copytrack.showScreen('profile'));
    await click('#prof-tabs [data-ptab="options"]');
    await page.locator('#opt-ui-theme').selectOption('midnight');
    assert.equal(await app(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()), '#070b1c', 'le thème est posé sur la page');
    await page.locator('#opt-ui-speedo').selectOption('ring');
    assert.equal(await app(() => document.body.dataset.speedo), 'ring');
    await page.locator('#opt-ui-hide input[data-hide="hint"]').check();
    assert.ok(await app(() => document.body.classList.contains('hud-no-hint')));
    // HUD : on glisse le chrono
    await click('[data-action="hud-editor"]');
    await waitApp(() => document.body.classList.contains('hud-editing'));
    const top = page.locator('#hud .hud-top');
    const b = await top.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + 10); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2 + 200, b.y + 110, { steps: 6 }); await page.mouse.up();
    const moved = await app(() => window.copytrack.settings.ui.hud.top);
    assert.ok(moved && moved[0] > 5 && moved[1] > 5, 'le chrono a été déplacé : ' + JSON.stringify(moved));
    await click('[data-action="hud-done"]');
    assert.ok(!(await app(() => document.body.classList.contains('hud-editing'))));
    assert.ok(await app(() => document.getElementById('hud').classList.contains('hidden')), 'le HUD se recache hors course');
    // caméra du joueur
    await app(() => window.copytrack.openCameraEditor());
    await click('#modal-body button:has-text("+ Nouvelle")');
    await page.waitForTimeout(100);
    await click('#modal-body button:has-text("Utiliser en course")');
    await click('#modal-actions button.primary');
    assert.equal(await app(() => window.copytrack.settings.cameras.length), 1);
    assert.equal(await app(() => window.copytrack.settings.camera), 4);
    await app(() => window.copytrack.playBuiltin(0));
    await waitApp(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, 40000);
    assert.deepEqual(await app(() => [window.copytrack.session.camList.length, window.copytrack.session.camMode]), [5, 4], 'la caméra du joueur est en service');
    await page.keyboard.press('c'); await page.waitForTimeout(150);
    assert.equal(await app(() => window.copytrack.session.camMode), 0, 'la touche caméra fait le tour de la liste complète');
    await app(() => window.copytrack.quitRace());
    await waitApp(() => window.copytrack.mode === 'menu');
    await app(() => window.copytrack.resetUi());
    assert.equal(await app(() => document.body.dataset.speedo), 'default');
  });

  await test('environnements (E19) : flaques et givre posés sur la route, pluie à la densité de la course, éclaboussure dans une flaque, tout retiré en quittant', async () => {
    await app(async () => {
      const A = window.copytrack;
      const { scriptTrack } = await import('/js/track.js'); const { envOf } = await import('/js/sim/env.js');
      const t = scriptTrack('Pluie', 'start S3 S3 S3 S3 finish');
      for (let s = 1; s < 999; s++) { t.setParams({ rain: 100, frost: 60, envSeed: s, envVary: true }); const E = envOf(t); if (E.patches.some((p) => p.kind === 'puddle') && E.patches.some((p) => p.kind === 'frost')) break; }
      A.playTrack(t, { trackKey: null });
    });
    await waitApp(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, 40000);
    const r = await app(() => {
      const A = window.copytrack, S = A.session, F = S.envFx, E = S.phys.env;
      const pud = E.patches.find((p) => p.kind === 'puddle');
      F.frame(0.016, A.camera, S.logic.steps, { x: pud.x, y: pud.y, z: pud.z }, 30, true, A);
      return { fx: !!F, meshes: F.group.children.length, inScene: !!A.scene.getObjectByName('env'), q: A.scenery.q.particles, rain: !!F.rain, obj: !!(F.rain && F.rain.obj), range: F.rain && F.rain.obj ? F.rain.obj.geometry.drawRange.count : 0, n: F.rain && F.rain.n, inPatch: F.inPatch === pud };
    });
    assert.ok(r.fx && r.inScene, 'les effets d’environnement sont en place');
    assert.equal(r.meshes, 2, 'flaques et plaques de givre');
    assert.ok(r.rain, 'la pluie existe');
    if (r.q > 0) assert.ok(r.obj && r.range > 0 && r.range <= r.n * 2, `pluie visible (${r.range} / ${r.n * 2})`);
    else assert.equal(r.obj, false, 'qualité sans particules : pas de gouttes (les flaques restent)');
    assert.ok(r.inPatch, 'la voiture est dans la flaque');
    await app(() => window.copytrack.quitRace());
    await waitApp(() => window.copytrack.mode === 'menu');
    assert.equal(await app(() => !!window.copytrack.scene.getObjectByName('env')), false, 'retiré en quittant');
  });

  await test('laboratoire (E20) : les commandes d’un record rejouées sous deux réglages, écart par secteur et courbe, circuit intact', async () => {
    const sig = await app(async () => {
      const A = window.copytrack;
      const { BUILTIN_TRACKS, buildBuiltin } = await import('/js/tracks.js'); const { traceFromBot } = await import('/js/analysis/trace.js');
      const track = buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === 'serpent')), run = traceFromBot(track);
      window.__lab = track;
      A.openLab({ track }, { inputs: run.inputs, time: run.time });
      return track.signature();
    });
    await waitApp(() => document.querySelector('#lab-out table.lab-sec'), null, 30000);
    const r = await page.evaluate(() => ({ rows: document.querySelectorAll('#lab-out .lab-sec tr').length, chart: !!document.querySelector('#lab-out svg.lab-chart polyline'), text: document.getElementById('lab-out').textContent }));
    assert.ok(r.rows >= 3 && r.chart, `${r.rows} lignes, courbe ${r.chart}`);
    assert.match(r.text, /Profil Simulation/); assert.match(r.text, /se séparent au secteur/);
    await page.evaluate(() => { document.getElementById('lab-b').value = 'classic'; [...document.querySelectorAll('#modal-actions button')].find((b) => b.textContent.trim() === 'Comparer').click(); });
    await waitApp(() => /même circuit/.test(document.getElementById('lab-out').textContent), null, 30000);
    assert.equal(await app(() => window.__lab.signature()), sig, 'le circuit n’a pas changé');
    await app(() => window.copytrack.ui.closeModal());
  });

  await test('décors réglables, pièce perso et déclencheurs : météo et heure qui défile, pièce posée dans le circuit, message et éclat joués en course', async () => {
    const r = await app(async () => {
      const A = window.copytrack;
      const { scriptTrack } = await import('/js/track.js');
      const t = scriptTrack('Perso', 'start S3 R S2 finish', { decor: 'desert' });
      t.setParams({ ambiance: { sky: 'night', weather: 'snow', cycle: 'fast', sunAz: 90, tint: '#334466' }, scripts: [{ x: 0, z: 0, a: 'msg', v: 'Bravo !' }, { x: 0, z: 0, a: 'burst', v: '#ff00ff' }] });
      t.addDeco({ k: 'custom', x: 10, y: 0, z: 10, ry: 0, s: 1, c: 0, cp: [{ s: 'box', sx: 3, sy: 3, sz: 3, c: '#ff0000' }, { s: 'sphere', y: 4, g: 1 }] });
      A.playTrack(t, { trackKey: null });
      return t.encode();
    });
    await waitApp(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, 40000);
    const info = await app(() => {
      const A = window.copytrack, S = A.session;
      const before = JSON.stringify(A.scenery.theme.sky.top);
      const out = { weather: A.scenery.theme.weather, cycle: !!A.scenery._cycle, hasCustom: S.track.decos.some((d) => d.k === 'custom') };
      S.phys.pos.x = 16; S.phys.pos.z = 16;       // case (0, 0)
      S._scriptsUpdate();
      out.msg = document.getElementById('hud-msg').textContent;
      out.done = S._scDone.size;
      S._scriptsUpdate();
      out.doneAgain = S._scDone.size;
      out.before = before;
      return out;
    });
    const wx = await app(async () => {
      const { Weather } = await import('/js/weather.js'); const THREE = await import('/js/vendor/three.module.min.js');
      const sc = new THREE.Scene(), w = new Weather(sc), cam = new THREE.PerspectiveCamera(); const out = {};
      for (const k of ['rain', 'snow', 'embers', 'dust', 'petals']) { w.set(k, 1); w.update(0.05, cam); out[k] = [w.kind, sc.children.length, Number.isFinite(w.pos[0])]; }
      w.set('', 1); out.none = sc.children.length; w.set('rain', 0); out.off = w.kind; w.dispose();
      return out;
    });
    assert.deepEqual(wx, { rain: ['rain', 1, true], snow: ['snow', 1, true], embers: ['embers', 1, true], dust: ['dust', 1, true], petals: ['petals', 1, true], none: 0, off: '' }, 'les cinq météos se construisent, bougent et se retirent');
    assert.deepEqual([info.weather, info.cycle, info.hasCustom], ['snow', true, true], 'météo, heure qui défile, pièce perso dans le circuit');
    assert.equal(info.msg.trim(), 'Bravo !', 'le message du déclencheur s\'affiche');
    assert.deepEqual([info.done, info.doneAgain], [2, 2], 'chaque déclencheur ne part qu\'une fois par essai');
    await page.waitForTimeout(1500);
    assert.notEqual(await app(() => JSON.stringify(window.copytrack.scenery.theme.sky.top)), info.before, 'l\'heure a défilé');
    await app(() => { window.copytrack.quitRace(); });
    await waitApp(() => window.copytrack.mode === 'menu');
    // le code du circuit porte tout (météo, déclencheurs, pièce perso) : on le rouvre
    const back = await app(async (code) => { const { Track } = await import('/js/track.js'); const t = Track.decode(code); return [t.ambiance.weather, t.scripts.length, t.decos.filter((d) => d.k === 'custom')[0].cp.length]; }, r);
    assert.deepEqual(back, ['snow', 2, 2]);
    // éditeur : l'atelier de pièces, les déclencheurs et les réglages d'ambiance s'ouvrent
    await app(() => window.copytrack.openEditor({ code: null }));
    await page.waitForTimeout(1000);
    await app(() => window.copytrack.session.openParams());
    assert.ok(await page.locator('#pp-weather').count() && await page.locator('#pp-cycle').count(), 'réglages météo et heure');
    await click('#pp-scripts');
    await page.waitForTimeout(300);
    await click('#modal-body button[data-sc="add"]');
    assert.ok(await page.locator('#modal-body .sc-row').count() === 1, 'un déclencheur ajouté');
    await app(() => window.copytrack.ui.closeModal());
    await app(() => window.copytrack.session._cdecoDialog(null));
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#modal-body canvas.cdv').count(), 3, 'vues de face, de dessus et en 3D (E9)');
    await click('#modal-actions button.primary');
    const lib = await app(async () => (await import('/js/storage.js')).listCustomDecos().length);
    assert.equal(lib, 1, 'la pièce est dans la bibliothèque');
    const used = await app(async () => { const E = window.copytrack.session; const { listCustomDecos } = await import('/js/storage.js'); E._buildPrefabPanel(); E._useCdeco(listCustomDecos()[0]); return [E.tool, E.deco.cp.length]; });
    assert.deepEqual(used, ['deco:custom', 1], 'la pièce est prête à être posée');
    await app(() => window.copytrack.showScreen('menu'));
  });

  await test('modes de jeu et paquets : menu, créer un mode, le jouer (règles appliquées, bilan), exporter puis réimporter un paquet', async () => {
    await app(() => window.copytrack.showScreen('menu'));
    await click('[data-action="modes"]');
    await waitApp(() => document.querySelectorAll('#modal-body .mode-row').length >= 6);
    assert.ok(await page.locator('#modal-body [data-md="packs"]').count());
    // un mode fourni : « Sauts lunaires » (gravité 40 %), sur le premier circuit
    await page.locator('#modal-body .mode-row[data-mode="lune"] button.primary').evaluate((el) => el.click());
    await waitApp(() => document.querySelector('#modal-title') && document.querySelector('#modal-title').textContent.includes('Jouer le mode'));
    await click('#modal-actions button.primary');
    await waitApp(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, 40000);
    const g = await app(() => [window.copytrack.session.track.g0, !!window.copytrack.session.opts.mode, window.copytrack.session.trackKey]);
    assert.deepEqual(g, [40, true, null], 'règles appliquées, aucun record ni classement');
    await app(() => window.copytrack.session._finish(33.3));
    await waitApp(() => document.querySelector('#modal-title') && /réussi|Pas tout/.test(document.querySelector('#modal-title').textContent));
    assert.ok(await app(() => window.copytrack.ui.modalOpen), 'le bilan du mode s\'affiche');
    await click('#modal-actions button:has-text("Modes")');
    await waitApp(() => window.copytrack.mode === 'menu');
    await page.waitForTimeout(300);
    // créer un mode (via l'API de stockage) puis le retrouver dans « Mes modes »
    await app(async () => { const { saveMode } = await import('/js/storage.js'); saveMode({ id: 'm1', name: 'Mon essai', desc: '', rules: { g0: 70 }, goal: { id: 'norespawn' } }); window.copytrack.modesMenu(); });
    await waitApp(() => document.querySelector('#modal-body .mode-row[data-mode="m1"]'));
    // paquet : exporter puis réimporter (la voiture, l'interface et le mode)
    await click('#modal-body [data-md="packs"]');
    await waitApp(() => document.querySelector('#modal-body [data-pk="export"]'));
    await click('#modal-body [data-pk="export"]');
    const code = await page.locator('#modal-body textarea').first().inputValue();
    assert.ok(code.startsWith('SHX1:'), 'code de paquet');
    await app(async () => { const { deleteMode } = await import('/js/storage.js'); deleteMode('m1'); });
    await page.locator('#modal-body textarea').nth(1).fill(code);
    await waitApp(() => document.querySelector('#modal-body [data-pk="apply"]'));
    await click('#modal-body [data-pk="apply"]');
    const modes = await app(async () => (await import('/js/storage.js')).listModes().map((m) => m.name));
    assert.deepEqual(modes, ['Mon essai'], 'le mode revient avec le paquet');
    await app(() => window.copytrack.ui.closeModal());
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

  await test('aucun bouton inaccessible : écrans et fenêtres principaux sur cinq tailles d\'écran (dans l\'écran, ou dans un conteneur qui défile jusqu\'à lui)', async () => {
    const old = page.viewportSize();
    const REACH = () => {
  const vw = innerWidth, vh = innerHeight, bad = [];
  const root = [...document.querySelectorAll('#modal:not(.hidden), .screen:not(.hidden)')].pop();
  const scope = document.querySelector('#modal:not(.hidden)') || document.querySelector('.screen:not(.hidden)') || document.body;
  for (const el of scope.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea')) {
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || el.disabled) continue;
    let r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (el.closest('.hidden')) continue;
    // atteignable : dans l'écran, ou dans un conteneur qui défile et dont le contenu est accessible en défilant (haut >= début du contenu)
    const inside = r.left >= -2 && r.right <= vw + 2 && r.top >= -2 && r.bottom <= vh + 2;
    if (inside) continue;
    let p = el.parentElement, ok = false;
    while (p && p !== document.body) {
      const o = getComputedStyle(p); const sy = /(auto|scroll)/.test(o.overflowY), sx = /(auto|scroll)/.test(o.overflowX);
      if ((sy && p.scrollHeight > p.clientHeight + 1) || (sx && p.scrollWidth > p.clientWidth + 1)) {
        // l'élément doit pouvoir être amené à l'écran : son décalage dans le conteneur est >= 0
        const pr = p.getBoundingClientRect();
        if (r.top >= pr.top - 2 + (-p.scrollTop) - 2 && r.left >= pr.left - 2 - p.scrollLeft - 2 || true) { const offTop = r.top - pr.top + p.scrollTop, offLeft = r.left - pr.left + p.scrollLeft; if (offTop >= -2 && offLeft >= -2) { ok = true; break; } }
      }
      p = p.parentElement;
    }
    if (!ok) bad.push((el.dataset.action || el.id || el.className || el.tagName).toString().slice(0, 40) + ` @${Math.round(r.left)},${Math.round(r.top)}-${Math.round(r.right)},${Math.round(r.bottom)}`);
  }
  return bad.slice(0, 6);
};
    const states = [['menu', () => window.copytrack.showMenu('menu')], ['tracks', () => window.copytrack.showScreen('tracks')], ['mytracks', () => window.copytrack.showScreen('mytracks')], ['community', () => window.copytrack.showScreen('community')],
      ['profil', () => { window.copytrack.profileTab = 'account'; window.copytrack.showScreen('profile'); }], ['options', () => window.copytrack.showScreen('options')], ['commandes', () => window.copytrack.showScreen('controls')],
      ['académie', () => window.copytrack.academyMenu()], ['compétition', () => window.copytrack.competitionMenu()], ['multijoueur', () => window.copytrack.multiMenu()], ['import', () => window.copytrack.importModal(false)],
      ['aide', () => window.copytrack.helpModal()], ['tutoriel', () => window.copytrack.tutorial()]];
    const bad = [];
    try {
      for (const [w, h] of [[1280, 720], [1366, 768], [1024, 600], [390, 844], [844, 390]]) {
        await page.setViewportSize({ width: w, height: h });
        for (const [n, f] of states) {
          await app(() => { window.copytrack.ui.closeModal(); window.copytrack.showMenu('menu'); });
          await page.waitForTimeout(150);
          await app(f); await page.waitForTimeout(350);
          const r = await app(REACH);
          if (r.length) bad.push(`${w}x${h} ${n} : ${r.join(' | ')}`);
        }
      }
    } finally { await app(() => { window.copytrack.ui.closeModal(); window.copytrack.showMenu('menu'); }); await page.setViewportSize(old); }
    assert.deepEqual(bad, [], 'boutons hors d\'atteinte :\n' + bad.join('\n'));
  });

  await test('fenêtres hautes (académie) sur un écran de 700 px de haut : le titre et le dernier bouton restent atteignables (la fenêtre défile au lieu de déborder)', async () => {
    const old = page.viewportSize();
    await page.setViewportSize({ width: 1280, height: 700 });
    try {
      await app(() => { window.copytrack.ui.closeModal(); window.copytrack.academyMenu(); });
      await page.waitForTimeout(400);
      const r = await app(() => { const el = document.querySelector('#modal:not(.hidden) .modal-panel'); const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: innerHeight, scroll: el.scrollHeight > el.clientHeight, ov: getComputedStyle(el).overflowY }; });
      assert.ok(r.top >= -1 && r.bottom <= r.h + 1, `la fenêtre tient dans l'écran (haut ${r.top}, bas ${r.bottom} / ${r.h})`);
      assert.ok(r.scroll && /auto|scroll/.test(r.ov), 'son contenu défile');
    } finally { await app(() => window.copytrack.ui.closeModal()); await page.setViewportSize(old); }
  });

  await test('académie : menu des six leçons, leçon 1 jouée et réussie, bilan, retour au menu des leçons', async () => {
    const btn = (label) => page.evaluate((l) => { const b = [...document.querySelectorAll('#modal-actions button')].find((x) => x.textContent.trim() === l); if (!b) throw new Error('bouton introuvable : ' + l); b.click(); }, label);
    await app(async () => { const { profile, saveProfile } = await import('/js/profile.js'); const p = profile(); p.academy = {}; saveProfile(); window.copytrack.academyMenu(); });
    await waitApp(() => document.querySelectorAll('.academy-list:not(.ac-drills) li').length === 6 && document.querySelectorAll('.ac-drills li').length === 4);
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
    await waitApp(() => window.copytrack.mode === 'menu' && document.querySelectorAll('.academy-list:not(.ac-drills) li.done').length === 1, null, 10000);
    await app(async () => { const { profile, saveProfile } = await import('/js/profile.js'); const p = profile(); p.academy = {}; p.coins = 0; saveProfile(); window.copytrack.ui.closeModal(); });
  });

  await test('académie, exercices évalués : point faible, consignes et objectifs, course mesurée (rejouée) et notée or, retour au menu', async () => {
    const btn = (label) => page.evaluate((l) => { const b = [...document.querySelectorAll('#modal-actions button')].find((x) => x.textContent.trim() === l); if (!b) throw new Error('bouton introuvable : ' + l); b.click(); }, label);
    await app(async () => { const { profile, saveProfile } = await import('/js/profile.js'); const p = profile(); p.drills = {}; p.coins = 0; saveProfile(); window.copytrack.academyMenu(); });
    await waitApp(() => document.querySelectorAll('.ac-drills li').length === 4);
    assert.match(await page.evaluate(() => document.querySelector('.ac-weak').textContent), /Point faible : Trajectoire — exercice conseillé : Chicanes/);
    await app(() => document.querySelector('[data-drill="0"]').click());
    await waitApp(() => window.copytrack.ui.modalOpen && /Exercice · Chicanes/.test(document.getElementById('modal-title').textContent));
    assert.equal(await page.evaluate(() => document.querySelectorAll('.ac-goals li').length), 3);
    await btn('Commencer');
    await waitApp(() => window.copytrack.mode === 'race' && window.copytrack.session && window.copytrack.session.opts.academy, null, 30000);
    await waitApp(() => window.copytrack.session.state === 'racing', null, 30000);
    // La course : les commandes du pilote automatique à 100 % de son adhérence (le niveau de l'or), mesurées comme celles d'un joueur.
    await app(async () => {
      const s = window.copytrack.session, { traceFromBot } = await import('/js/analysis/trace.js');
      const run = traceFromBot(s.track, { latK: 1 });
      s.recorder = { encode: () => run.inputs };
      s._finish(run.time);
    });
    await waitApp(() => /Note : or/.test(document.getElementById('modal-title').textContent), null, 20000);
    assert.match(await page.evaluate(() => document.querySelector('.ac-measure').textContent), /^\d+ km\/h de moyenne dans les chicanes/);
    assert.equal(await page.evaluate(() => document.querySelectorAll('.ac-goals li.done').length), 3);
    assert.deepEqual(await app(async () => { const p = (await import('/js/profile.js')).profile(); return [p.drills.chicanes.lvl, p.coins]; }), [3, 50]);
    await shot('17b-exercice-or');
    await btn('Académie');
    await waitApp(() => window.copytrack.mode === 'menu' && document.querySelectorAll('.ac-drills li.done').length === 1, null, 10000);
    assert.match(await page.evaluate(() => document.querySelector('.ac-weak').textContent), /Point faible : Freinage/);
    await app(async () => { const { profile, saveProfile } = await import('/js/profile.js'); const p = profile(); p.drills = {}; p.coins = 0; saveProfile(); window.copytrack.ui.closeModal(); });
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

  await test('ressenti de course : coup de FOV au turbo, aspiration derrière une voiture, vibrations graduées ; le réglage « Sensations » à 0 coupe tout', async () => {
    await app(() => { window.copytrack.settings.feel = 1; window.copytrack.playBuiltin(0); });
    await waitApp(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, 40000);
    const rumbles = await app(() => { window.__rumble = 0; const i = window.copytrack.input, o = i.rumble.bind(i); i.rumble = (...a) => { window.__rumble++; return o(...a); }; return 0; });
    assert.equal(rumbles, 0);
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(1500);
    const fov0 = await app(() => window.copytrack.camera.fov);
    await app(() => { window.copytrack.session._feel.punchT = 0; });
    await page.waitForTimeout(120);
    const fov1 = await app(() => window.copytrack.camera.fov);
    assert.ok(fov1 > fov0 + 0.4, `coup de FOV : ${fov0.toFixed(2)} -> ${fov1.toFixed(2)}`);
    // Une voiture 12 m devant, dans l'axe : l'aspiration monte et renforce les lignes de vitesse.
    await app(() => { const s = window.copytrack.session, y = s.phys.yaw, p = s.renderPos; s.remote.set('fantome', { group: { visible: true, position: { x: p.x - Math.sin(y) * 12, z: p.z - Math.cos(y) * 12 } }, update() {}, dispose() {} }); });
    await page.waitForTimeout(600);
    const slip = await app(() => window.copytrack.session._feel.slip);
    assert.ok(slip > 0.15, 'aspiration : ' + slip);
    assert.ok(await app(() => window.__rumble) > 0, 'la manette a reçu des vibrations graduées');
    // Réglage à zéro : l'aspiration retombe, plus de coup de FOV de la part de ce réglage.
    await app(() => { window.copytrack.settings.feel = 0; });
    await page.waitForTimeout(900);
    assert.ok(await app(() => window.copytrack.session._feel.slip) < 0.05, 'plus d\'aspiration à 0 %');
    const before = await app(() => window.__rumble); await page.waitForTimeout(500);
    assert.equal(await app(() => window.__rumble), before, 'plus de vibrations à 0 %');
    await page.keyboard.up('ArrowUp');
    await app(() => { const s = window.copytrack.session; s.remote.delete('fantome'); window.copytrack.settings.feel = 1; });
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
    assert.deepEqual(after.am, { sky: 'night', fog: 'thick', music: 'none', weather: '', sunAz: -1, tint: '', gtint: '', fogC: '', cycle: '' });
    assert.ok(await app((c) => { const t = window.copytrack.session.track.constructor.decode(c); return t.ambiance.fog === 'thick'; }, after.code), 'le code relu garde l\'ambiance');
    await shot('22-ambiance-nuit');
    // --- adhérence et vent (paramètres de simulation, E8) : ils changent la course, donc la signature
    const sig0 = await app(() => window.copytrack.session.track.signature());
    await app(() => window.copytrack.session.openParams());
    await waitApp(() => document.getElementById('pp-grip'));
    await page.evaluate(() => { const g = document.getElementById('pp-grip'); g.value = '70'; g.dispatchEvent(new Event('input')); const w = document.getElementById('pp-wind'); w.value = '40'; w.dispatchEvent(new Event('input')); document.getElementById('pp-winddir').value = '90'; [...document.querySelectorAll('#modal-actions button')].find((b) => b.textContent.trim() === 'Appliquer').click(); });
    await waitApp(() => window.copytrack.session.track.grip === 70);
    assert.deepEqual(await app(() => { const t = window.copytrack.session.track; return [t.grip, t.wind, t.windDir]; }), [70, 40, 90]);
    assert.notEqual(await app(() => window.copytrack.session.track.signature()), sig0, 'la signature change');
    await app(() => window.copytrack.session.track.setParams({ grip: 100, wind: 0, windDir: 0 }));
    assert.equal(await app(() => window.copytrack.session.track.signature()), sig0, 'revenue aux valeurs par défaut, la signature aussi');
    // --- conditions (environnements déterministes, E19) : pluie, givre, rafales, graine
    await app(() => window.copytrack.session.openParams());
    await waitApp(() => document.getElementById('pp-rain'));
    const dis = await page.evaluate(() => [document.getElementById('pp-ev').disabled, document.getElementById('pp-es').disabled]);
    assert.deepEqual(dis, [true, true], 'sans pluie : ni variation ni graine');
    await page.evaluate(() => {
      const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); };
      set('pp-rain', '60'); set('pp-gust', '30'); document.getElementById('pp-ev').checked = true; document.getElementById('pp-es').value = '33';
      document.getElementById('pp-pm').value = 'arcade'; document.getElementById('pp-vm').checked = true;
      [...document.querySelectorAll('#modal-actions button')].find((b) => b.textContent.trim() === 'Appliquer').click();
    });
    await waitApp(() => window.copytrack.session.track.rain === 60);
    assert.deepEqual(await app(() => { const t = window.copytrack.session.track; return [t.rain, t.frost, t.gust, t.envVary, t.envSeed]; }), [60, 0, 30, true, 33]);
    assert.deepEqual(await app(() => { const t = window.copytrack.session.track; return [t.pm, t.vm]; }), ['arcade', 2], 'profil et véhicules v2 (E20)');
    assert.notEqual(await app(() => window.copytrack.session.track.signature()), sig0, 'les conditions changent la signature');
    await app(() => window.copytrack.session.track.setParams({ rain: 0, gust: 0, envVary: false, envSeed: 0, pm: '', vm: 1 }));
    assert.equal(await app(() => window.copytrack.session.track.signature()), sig0);
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

  await test('éditeur : groupes et calques (ranger la sélection, nommer, masquer = ni dessiné ni visable, verrouiller), aperçu 3D des pièces perso', async () => {
    await app(() => window.copytrack.openEditor({ code: window.copytrack.builtins[1].track.encode(), name: 'Groupes' }));
    await waitApp(() => window.copytrack.mode === 'editor' && window.copytrack.session && window.copytrack.session.openGroups, null, 20000);
    await app(() => { const s = window.copytrack.session; s.setTool('select'); s.sel = { x0: -500, z0: -500, x1: 500, z1: 500 }; });
    await click('[data-ed="groups"]');
    await waitApp(() => document.querySelector('.ed-groups [data-a="new"]'));
    await click('.ed-groups [data-a="new"]');
    await waitApp(() => document.querySelectorAll('.ed-gtable tr[data-g]').length === 1);
    const n = await app(() => window.copytrack.session.track.tiles.filter((t) => t.g === 1).length);
    assert.equal(n, await app(() => window.copytrack.session.track.tiles.length), 'toutes les pièces sélectionnées sont dans le groupe 1');
    await page.locator('.ed-gtable tr[data-g="1"] input').fill('Tout');
    await page.locator('.ed-gtable tr[data-g="1"] input').dispatchEvent('change');
    assert.deepEqual(await app(() => window.copytrack.session.track.groupNames()), [[1, 'Tout']]);
    // masquer : le maillage du groupe disparaît et rien n'est plus visable
    await click('.ed-gtable tr[data-g="1"] [data-a="hide"]');
    // (le maillage se reconstruit à l'image suivante : on l'attend, sans quoi le test dépend de la charge de la machine)
    await waitApp(() => { const v = window.copytrack.session.view; const gs = v.group.children.filter((c) => c.userData.g === 1); return gs.length > 0 && gs.every((c) => !c.visible); }, null, 10000);      // calque masqué
    assert.equal(await app(() => window.copytrack.session._selTiles().length), 0, 'un calque masqué ne se sélectionne pas');
    await click('.ed-gtable tr[data-g="1"] [data-a="hide"]');
    await waitApp(() => window.copytrack.session.view.group.children.filter((c) => c.userData.g === 1).every((c) => c.visible), null, 10000);
    await click('.ed-gtable tr[data-g="1"] [data-a="lock"]');
    assert.equal(await app(() => window.copytrack.session._selTiles().length), 0, 'un calque verrouillé ne se sélectionne pas');
    await click('.ed-gtable tr[data-g="1"] [data-a="lock"]');
    await shot('23-groupes');
    // le code garde les groupes ; annuler les retire
    assert.deepEqual(await app(() => { const T = window.copytrack.session.track.constructor; const u = T.decode(window.copytrack.session.track.encode()); return [u.usedGroups(), u.groupNames()]; }), [[1], [[1, 'Tout']]]);
    await app(() => window.copytrack.ui.closeModal());
    await app(() => window.copytrack.session.undo());
    await app(() => window.copytrack.session.undo());
    assert.equal(await app(() => window.copytrack.session.track.usedGroups().length), 0, 'annuler retire le groupe');
    // atelier des pièces perso : aperçu 3D
    await app(() => window.copytrack.session._cdecoDialog(null));
    await waitApp(() => document.querySelector('#modal canvas.cdv3d'));
    await page.waitForTimeout(300);
    await app(() => window.copytrack.ui.closeModal());
    await app(() => window.copytrack.leaveEditor());
    await waitApp(() => window.copytrack.mode === 'menu');
  });

  await test('éditeur de logique : une porte qui s’ouvre au checkpoint (règle créée au clic, groupe caché au départ), essai : la règle s’annonce et la porte s’ouvre', async () => {
    await app(async () => {
      const { scriptTrack } = await import('/js/track.js');
      const t = scriptTrack('Porte', 'start S3 S3 C S3 S3 S3 S3 finish');
      const cp = t.tiles.findIndex((x) => x.t === 'checkpoint');
      t.tiles[cp + 2].g = 2; t.tiles[cp + 3].g = 2; t.setGroupName(2, 'Porte');
      window.copytrack.openEditor({ code: t.encode(), name: 'Porte' });
    });
    await waitApp(() => window.copytrack.mode === 'editor' && window.copytrack.session && window.copytrack.session.openLogic, null, 20000);
    await click('[data-ed="logic"]');
    await waitApp(() => document.getElementById('lg-new'));
    await click('#lg-new');
    await waitApp(() => document.getElementById('lg-ok'));
    assert.match(await page.evaluate(() => document.querySelector('.ed-lsentence').textContent), /Quand le checkpoint n° 1 est passé : montrer « Porte »/);
    await click('#lg-ok');
    await waitApp(() => document.querySelector('[data-off="2"]'));
    await page.locator('[data-off="2"]').check();
    assert.equal(await page.evaluate(() => document.querySelectorAll('.ed-lissues li').length), 0, 'aucun problème signalé');
    await click('#modal-actions button.primary');
    await waitApp(() => window.copytrack.session.track.lg);
    assert.deepEqual(await app(() => window.copytrack.session.track.lg.off), [2]);
    // essai depuis l'éditeur : la porte est cachée au départ, la règle s'annonce au checkpoint
    await app(() => window.copytrack.session.test());
    await waitApp(() => window.copytrack.mode === 'race' && window.copytrack.session.state === 'racing', null, 40000);
    assert.ok(await app(() => window.copytrack.session.sim.lgc.state.hidden.has(2)), 'porte cachée au départ');
    assert.ok(await app(() => window.copytrack.session.view.group.children.filter((c) => c.userData.g === 2).every((c) => !c.visible)), 'porte invisible');
    await page.keyboard.down('ArrowUp');
    await waitApp(() => !window.copytrack.session.sim.lgc.state.hidden.has(2), null, 20000);
    await page.keyboard.up('ArrowUp');
    await waitApp(() => /⚙ Règle 1 : Quand le checkpoint n° 1 est passé/.test(document.getElementById('flash') ? document.getElementById('flash').textContent : document.body.textContent), null, 5000);
    await page.waitForTimeout(100);
    assert.ok(await app(() => window.copytrack.session.view.group.children.filter((c) => c.userData.g === 2).every((c) => c.visible)), 'la porte apparaît');
    await shot('24-logique-porte');
    await app(() => window.copytrack.quitRace());
    await waitApp(() => window.copytrack.mode === 'editor', null, 20000);
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
    await page.evaluate(() => document.querySelector('#comm-list .card h3').click());           // la carte (hors boutons) ouvre la fiche
    await waitApp(() => !document.getElementById('race-hub').classList.contains('hidden'));
    assert.match(await page.evaluate(() => document.getElementById('hub-sub').textContent), /Communauté/);
    assert.match(await page.evaluate(() => document.getElementById('hub-facts').textContent), /Joué/);
    await click('#race-hub [data-action="hub-back"]');
    await waitApp(() => !document.getElementById('community').classList.contains('hidden'));
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
      // Règles de la partie : l'hôte les choisit, l'invité les reçoit ; elles s'appliquent au circuit de chacun.
      assert.ok(await page.locator('.mp-rules').count(), 'le bloc des règles est dans le salon de l\'hôte');
      await page.evaluate(() => window.copytrack.room.setRules({ offroad: 1, sameCars: 1 }));
      await B.waitForFunction(() => window.copytrack.room && window.copytrack.room.rules && window.copytrack.room.rules.offroad === 1, null, { timeout: 10000 });
      await clickBtn(page, 'Lancer le championnat');
      await waitApp(() => window.copytrack.mode === 'race' && window.copytrack.session && window.copytrack.session.cup, null, 30000);
      await B.waitForFunction(() => window.copytrack.mode === 'race' && window.copytrack.session && window.copytrack.session.cup, null, { timeout: 30000 });
      const info = (p) => p.evaluate(() => { const s = window.copytrack.session; return { n: s.cup.n, total: s.cup.total, slot: s.cup.slot, count: s.cup.count, collisions: s.cup.collisions, x: s.phys.pos.x, z: s.phys.pos.z, track: s.track.name }; });
      const ia = await info(page), ib = await info(B);
      assert.deepEqual(await Promise.all([page, B].map((p) => p.evaluate(() => window.copytrack.session.track.offroad))), [1, 1], 'la règle de la partie (hors piste) s\'applique chez les deux joueurs');
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
      // Reconnexion (E16) : coupure simulée de 3 s chez Bea ; sa place est gardée, elle revient seule, les liaisons se refont, la manche continue.
      const beaId = await B.evaluate(() => window.copytrack.room.selfId);
      await B.evaluate(() => window.copytrack.room.signaling.simulateCut(3000));
      await waitApp((id) => (window.copytrack.room.members.get(id) || {}).link === 'away', beaId, 10000);
      assert.equal(await B.evaluate(() => window.copytrack.room.reconnecting && !window.copytrack.room.closed), true, 'Bea se sait coupée, la salle reste ouverte chez elle');
      assert.equal(await B.evaluate(() => window.copytrack.session && window.copytrack.session.state), 'racing', 'sa course continue');
      await waitApp((id) => (window.copytrack.room.members.get(id) || {}).link === 'open', beaId, 30000);
      await B.waitForFunction(() => !window.copytrack.room.reconnecting && window.copytrack.room.list.some((m) => !m.self && m.link === 'open'), null, { timeout: 30000 });
      assert.equal(await page.evaluate(() => window.copytrack.room.cupState.roster.length), 2, 'Bea est toujours sur la grille');
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

  // E22 : aides à la conduite (catégorie « assisté »), animations réduites, caméra libre de l'éditeur, parcours complet au tactile.
  await test('aides à la conduite : course rangée dans « assisté » sans médailles, commandes effectives enregistrées ; animations réduites ; caméra libre', async () => {
    await app(() => { const A = window.copytrack; A.settings.aids = { autoGas: true, antiSpin: true }; A.saveSettings(); A.playBuiltin(0); });
    await waitApp(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, 40000);
    await page.waitForTimeout(1500);
    const r = await app(() => { const S = window.copytrack.session; return { key: S.trackKey, medals: S.medals, aids: !!S.aids, thr: S.lastInput && S.lastInput.throttle, speed: S.phys.fwdSpeed }; });
    assert.match(r.key, /~v1\.as-1$/, 'catégorie « assisté »');
    assert.equal(r.medals, null, 'sans médailles');
    assert.ok(r.aids && r.thr === true && r.speed > 5, `accélération automatique sans toucher au clavier (${r.speed.toFixed(1)} m/s)`);
    const rec = await app(async () => {
      const S = window.copytrack.session, { decodeInputs, inputAt } = await import('/js/replay.js');
      const d = decodeInputs(S.recorder.encode()), last = inputAt(d, Math.max(0, S.tick - 2));
      return !!last.throttle;
    });
    assert.ok(rec, 'les gaz de l’aide sont dans les commandes enregistrées');
    await app(() => window.copytrack.quitRace());
    await waitApp(() => window.copytrack.mode === 'menu');
    await app(() => { const A = window.copytrack; A.settings.aids = {}; A.saveSettings(); });
    // Animations réduites : le réglage, puis le système
    await app(() => { const A = window.copytrack; A.settings.reduceMotion = 'on'; A._applyAccess(); });
    const m = await page.evaluate(() => ({ cls: document.body.classList.contains('reduce-motion'), off: window.copytrack.motionOff, dur: getComputedStyle(document.querySelector('.screen:not(.hidden)') || document.body).animationDuration }));
    assert.ok(m.cls && m.off, 'réglage « Oui »');
    assert.ok(/^(0s|1e-06s|0\.000001s)$/.test(m.dur) || parseFloat(m.dur) < 0.001, `transition coupée (${m.dur})`);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await app(() => { const A = window.copytrack; A.settings.reduceMotion = 'auto'; A._applyAccess(); });
    assert.equal(await page.evaluate(() => document.body.classList.contains('reduce-motion')), true, '« Système » suit prefers-reduced-motion');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await waitApp(() => !document.body.classList.contains('reduce-motion'), null, 10000);      // et suit son changement
    // Caméra libre de l'éditeur : au ras du sol, puis retour aux bornes habituelles
    await app(() => window.copytrack.openEditor({ code: window.copytrack.builtins[1].track.encode(), name: 'Caméra' }));
    await waitApp(() => window.copytrack.mode === 'editor' && window.copytrack.session && window.copytrack.session.toggleFreeCam, null, 20000);
    await click('[data-ed="freecam"]');
    const fc = await app(() => { const s = window.copytrack.session; s.dist = 2; s.dist = Math.max(s.minDist(), s.dist); return { on: s.freeCam, min: s.minDist(), pitch: s.pitch, pressed: document.querySelector('[data-ed="freecam"]').getAttribute('aria-pressed') }; });
    assert.deepEqual([fc.on, fc.min, fc.pressed], [true, 3, 'true']); assert.ok(fc.pitch <= 0.12);
    await page.waitForTimeout(150);
    assert.ok(await app(() => window.copytrack.camera.position.y >= 0.8), 'jamais sous le terrain');
    await click('[data-ed="freecam"]');
    assert.deepEqual(await app(() => { const s = window.copytrack.session; return [s.freeCam, s.pitch >= 0.2, s.dist >= 25]; }), [false, true, true]);
    await app(() => window.copytrack.leaveEditor());
    await waitApp(() => window.copytrack.mode === 'menu');
  });

  await test('accueil sur téléphone (paysage, portrait) : les 12 tuiles sont entières à l’écran, aucune n’est recouverte, le bouton plein écran ne gêne rien', async () => {
    const ctxP = await browser.newContext({ locale: 'fr-FR', viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    const pp = await ctxP.newPage();
    pp.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await pp.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
    try {
      await pp.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
      await pp.locator('#wl-name').fill('Pouce');
      await pp.locator('#wl-submit').evaluate((el) => el.click());
      await pp.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 40000 });
      await pp.evaluate(() => { const A = window.copytrack; A.settings.telemetry = false; A.settings.tutorialDone = true; A.saveSettings(); A.ui.closeModal(); A.quality.apply('ultrapotato'); });
      await pp.waitForTimeout(1200);
      await pp.evaluate(() => window.copytrack.ui.closeModal());
      for (const [w, h] of [[844, 390], [390, 844], [667, 375]]) {
        await pp.setViewportSize({ width: w, height: h });
        await pp.waitForTimeout(400);
        const r = await pp.evaluate(() => {
          const tiles = [...document.querySelectorAll('#menu .menu-buttons .btn.big')];
          const fs = document.getElementById('fs-btn').getBoundingClientRect();
          const out = { n: tiles.length, cut: [], covered: [], fsOver: [] };
          for (const t of tiles) {
            const r = t.getBoundingClientRect(), c = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            if (r.left < -1 || r.top < -1 || r.right > window.innerWidth + 1 || r.bottom > window.innerHeight + 1) out.cut.push(t.dataset.action);
            if (!c || !t.contains(c)) out.covered.push(t.dataset.action);
            if (!document.getElementById('fs-btn').classList.contains('hidden') && r.left < fs.right && r.right > fs.left && r.top < fs.bottom && r.bottom > fs.top) out.fsOver.push(t.dataset.action);
          }
          return out;
        });
        assert.equal(r.n, 6, `${w}x${h} : 6 tuiles`);
        // Les deux sous-menus s'ouvrent, tiennent à l'écran, et le clic sur « Mes circuits » mène bien à son écran.
        for (const sub of ['create', 'online']) {
          await pp.evaluate((n) => document.querySelector(`#menu [data-action="sub-${n}"]`).click(), sub);
          const q = await pp.evaluate((n) => { const el = document.getElementById('menu-sub-' + n), r = el.getBoundingClientRect(); return { shown: !el.classList.contains('hidden'), inside: r.left >= -1 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1, n: el.querySelectorAll('button').length }; }, sub);
          assert.deepEqual([q.shown, q.inside], [true, true], `${w}x${h} : sous-menu ${sub} ouvert et entier`);
          assert.ok(q.n >= 2);
        }
        assert.equal(await pp.evaluate(() => document.getElementById('menu-sub-create').classList.contains('hidden')), true, 'un seul sous-menu à la fois');
        await pp.evaluate(() => document.querySelector('#menu [data-action="sub-online"]').click());
        assert.deepEqual([r.cut, r.covered, r.fsOver], [[], [], []], `${w}x${h} : tuiles coupées, recouvertes, sous le bouton plein écran`);
      }
    } finally { await ctxP.close(); }
  });

  await test('parcours complet au tactile : accueil, carrière, fiche, course aux boutons tactiles, pause, quitter', async () => {
    const ctxT = await browser.newContext({ locale: 'fr-FR', viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    const pt = await ctxT.newPage();
    pt.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    pt.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
    await pt.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
    const wait = (fn, arg, timeout = 30000) => pt.waitForFunction(fn, arg, { timeout });
    const tap = async (sel) => { const l = pt.locator(sel).first(); await l.scrollIntoViewIfNeeded(); await l.tap({ timeout: 30000 }); };      // un vrai toucher : échoue si un autre élément le recouvre
    // Deux pages en WebGL logiciel sur la même machine : on allège le rendu des deux (ce n'est pas l'objet du test), puis on rend celui d'avant.
    const q0 = await app(() => window.copytrack.scenery.quality);
    await app(() => window.copytrack.quality.apply('ultrapotato'));
    try {
      await pt.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
      await pt.locator('#wl-name').fill('Pouce');
      await tap('#wl-submit');
      await wait(() => window.copytrack && window.copytrack.mode === 'menu');
      assert.ok(await pt.evaluate(() => document.body.classList.contains('touch')), 'appareil tactile reconnu');
      await pt.evaluate(() => { const A = window.copytrack; A.settings.telemetry = false; A.settings.tutorialDone = true; A.saveSettings(); A.ui.closeModal(); A.quality.apply('ultrapotato'); });
      // Au premier lancement, les fenêtres (consentement, tutoriel) arrivent l'une après l'autre : on les ferme jusqu'à ce que l'accueil soit libre.
      for (let k = 0; k < 6; k++) { await pt.waitForTimeout(500); await pt.evaluate(() => window.copytrack.ui.closeModal()); }
      await tap('[data-action="play"]');
      await wait(() => !document.getElementById('tracks').classList.contains('hidden') && document.querySelector('#track-list .card .num'));
      await tap('#track-list .card:has(.num) .thumb');
      await wait(() => !document.getElementById('race-hub').classList.contains('hidden'));
      await tap('#hub-play');
      await wait(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, 40000);
      assert.equal(await pt.evaluate(() => document.getElementById('touch').classList.contains('hidden')), false, 'commandes tactiles affichées');
      await pt.locator('#touch [data-t="gas"]').dispatchEvent('pointerdown');
      await pt.waitForTimeout(1500);
      const sp = await pt.evaluate(() => window.copytrack.session.phys.fwdSpeed);
      await pt.locator('#touch [data-t="gas"]').dispatchEvent('pointerup');
      assert.ok(sp > 5, `le bouton ▲ fait avancer la voiture (${sp.toFixed(1)} m/s)`);
      await pt.locator('#touch [data-t="pause"]').dispatchEvent('pointerdown');
      await pt.locator('#touch [data-t="pause"]').dispatchEvent('pointerup');
      await wait(() => window.copytrack.session && window.copytrack.session.state === 'paused');
      await tap('#pause [data-action="quit"]');
      await wait(() => window.copytrack.mode !== 'race');
    } finally {
      await ctxT.close();
      await app((q) => window.copytrack.quality.apply(q), q0);
    }
  });

  // E21 : communauté 2 (commentaires, playlists, hasard, recommandations, statistiques, modes publiés), serveur Supabase SIMULÉ.
  await test('communauté 2 : pour toi, au hasard, statistiques, commentaires, playlist jouée dans l’ordre, mode publié classé (serveur simulé)', async () => {
    const ME = '00000000-0000-0000-0000-0000000000e1';
    const ctx3 = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    const p3 = await ctx3.newPage();
    p3.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    p3.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
    await p3.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const calls = [];
    let rows = [], cmts = [{ id: 1, author: 'x', name: 'Ana', title: null, body: 'Joli virage !', created_at: '2026-11-17T10:00:00Z', mine: false, can_delete: false }], lists = [];
    await p3.route(/supabase\.co/, async (route) => {
      const req = route.request(), url = decodeURIComponent(req.url()), body = req.postData() ? JSON.parse(req.postData()) : null;
      calls.push({ url, body });
      const J = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
      if (url.includes('/auth/v1/')) return J({ access_token: 'jeton', refresh_token: 'r', expires_in: 3600, user: { id: ME } });
      const rpc = /\/rpc\/(\w+)/.exec(url);
      if (rpc) {
        switch (rpc[1]) {
          case 'recommended_tracks': return J([{ id: rows[1].id, score: 2 }, { id: rows[0].id, score: 1 }]);
          case 'random_track': return J(rows[2].id);
          case 'track_stats': return J([{ players: 12, runs: 40, finishes: 30, finish_rate: 0.75, median_time: 41.5, top_time: 35.2, avg_respawns: 1, quit_progress: 0.4 }]);
          case 'track_comments_list': return J(cmts);
          case 'comment_add': cmts = [{ id: 2, author: ME, name: 'Testeur', title: null, body: body.msg, created_at: '2026-11-18T10:00:00Z', mine: true, can_delete: true }, ...cmts]; return J(2);
          case 'playlists_list': return J(body.mine ? lists : lists.filter((l) => l.public));
          case 'playlist_save': lists = [{ id: 5, owner: ME, name: body.pname, owner_name: 'Testeur', public: body.is_public, n: body.items.length, tracks: body.items, updated_at: '2026-11-18' }]; return J(5);
          case 'modes_list': return J([{ id: 3, owner: 'x', owner_name: 'Ana', name: 'Lune', description: 'Gravité basse', variant: 'v1.g-40', goal: { id: 'norespawn' }, plays: 4, created_at: '2026-11-17' }]);
          case 'mode_played': return J(null);
          case 'friends_board': case 'sector_board': return J([]);
          default: return J(null);
        }
      }
      if (url.includes('/rest/v1/tracks')) {
        const ids = /id=in\.\(([^)]*)\)/.exec(url), one = /id=eq\.([0-9a-f-]{36})/.exec(url);
        if (ids) return J(rows.filter((r) => ids[1].split(',').includes(r.id)));
        if (one) return J(rows.filter((r) => r.id === one[1]));
        return J(rows);
      }
      if (url.includes('/rest/v1/track_likes') || url.includes('/rest/v1/follows')) return J([]);
      if (url.includes('/rest/v1/scores')) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' });
      return J([]);
    });
    const ap = (fn, arg) => p3.evaluate(fn, arg), wait = (fn, arg, timeout = 30000) => p3.waitForFunction(fn, arg, { timeout });
    const clk = (sel) => p3.locator(sel).first().evaluate((el) => el.click());
    const until = async (fn, ms = 10000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('délai dépassé'); await new Promise((r) => setTimeout(r, 50)); } };
    try {
      await p3.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
      await p3.locator('#wl-name').fill('Testeur');
      await clk('#wl-submit');
      await wait(() => window.copytrack && window.copytrack.mode === 'menu');
      rows = await ap(() => [0, 3, 5].map((i, k) => { const b = window.copytrack.builtins[i]; return { id: `00000000-0000-0000-0000-0000000000a${k}`, name: ['Alpha', 'Bravo', 'Charlie'][k], decor: b.def.decor, code: b.track.encode(), author_time: 20, pieces: b.track.tiles.length, laps: 1, plays: 3, likes: 1, created_at: '2026-11-01', author: 'x', players: { name: 'Ana' }, description: '' }; }));
      await ap(async () => { const { online } = await import('/js/online.js'); online.kind = 'account'; window.copytrack.identity = { kind: 'account', username: 'Testeur' }; window.copytrack._comm = null; });
      // Pour toi : dans l'ordre des recommandations
      await ap(() => window.copytrack.showMenu('community'));
      await wait(() => document.querySelectorAll('#comm-list .card').length >= 1);
      await clk('#comm-tabs [data-sort="foryou"]');
      await wait(() => [...document.querySelectorAll('#comm-list .card h3')].map((h) => h.textContent).join() === 'Bravo,Alpha');
      // Au hasard : la fiche du circuit tiré, avec ses statistiques et ses commentaires
      await clk('#comm-random');
      await wait(() => window.copytrack._hub && document.getElementById('hub-name').textContent === 'Charlie');
      await wait(() => /12 pilotes/.test(document.getElementById('hub-stats').textContent));
      assert.match(await p3.evaluate(() => document.getElementById('hub-stats').textContent), /75 % des parties vont au bout.*temps médian/);
      await wait(() => /Joli virage/.test(document.getElementById('hub-clist').textContent));
      await p3.locator('#hub-cmsg').fill('  Bravo pour le saut  ');
      await clk('#hub-csend');
      await wait(() => /Bravo pour le saut/.test(document.getElementById('hub-clist').textContent));
      assert.equal(calls.find((c) => c.url.includes('/rpc/comment_add')).body.msg, 'Bravo pour le saut');
      assert.ok(await p3.evaluate(() => !!document.querySelector('#hub-clist [data-c="2"] [data-ca="del"]')), 'mon commentaire : supprimable');
      // Playlist : créée depuis la fiche, puis jouée dans l'ordre
      await clk('#hub-sub [data-hub="playlist"]');
      await wait(() => document.getElementById('pl-new'));
      await p3.locator('#pl-new').fill('Ma liste');
      await clk('#pl-create');
      await until(() => calls.some((c) => c.url.includes('/rpc/playlist_save')));
      assert.deepEqual(calls.find((c) => c.url.includes('/rpc/playlist_save')).body.items, [rows[2].id]);
      await ap((ids) => { const pl = { id: 5, name: 'Ma liste', public: true, n: 2, tracks: ids }; window.copytrack.openPlaylist(pl, true); }, [rows[2].id, rows[0].id]);
      await wait(() => document.querySelectorAll('.playlist-list li').length === 2);
      await clk('.playlist [data-pk="run"]');
      await wait(() => document.getElementById('hub-name').textContent === 'Charlie' && /Ma liste · 1 \/ 2/.test(document.getElementById('hub-sub').textContent));
      await clk('#hub-sub [data-pl-next]');
      await wait(() => document.getElementById('hub-name').textContent === 'Alpha' && /2 \/ 2/.test(document.getElementById('hub-sub').textContent));
      // Mode publié : sa fiche s'ouvre sur sa catégorie (son classement)
      await ap(() => { window.copytrack.closeRaceHub(); window.copytrack.communityModesDialog(); });
      await wait(() => document.querySelector('[data-cmode="3"]'));
      assert.match(await p3.evaluate(() => document.querySelector('[data-cmode="3"]').textContent), /Lune.*par Ana.*Gravité de départ 40 %/);
      await p3.evaluate(() => [...document.querySelectorAll('[data-cmode="3"] button')].find((b) => b.textContent === 'Jouer (classé)').click());
      await wait(() => [...document.querySelectorAll('#modal-actions button')].some((b) => b.textContent === 'Ouvrir la fiche'));
      await p3.evaluate(() => [...document.querySelectorAll('#modal-actions button')].find((b) => b.textContent === 'Ouvrir la fiche').click());
      await wait(() => window.copytrack._hub && /~v1\.g-40$/.test(window.copytrack._hub.desc.key));
      assert.match(await p3.evaluate(() => document.querySelector('#hub-launch [data-cat="__cur"]').textContent), /🌐 Lune/);
      await until(() => calls.some((c) => c.url.includes('/rpc/mode_played')));
    } finally {
      await ctx3.close();
    }
  });

  // E15 : saisons, secteurs, amis, abonnements, avec un serveur Supabase SIMULÉ (routes Playwright) et l'horloge de la saison 2 (mercredi 18 novembre 2026).
  await test('saison de la semaine, classements par secteur et entre amis, amis du profil, abonnements, compétition (serveur simulé)', async () => {
    const ME = '00000000-0000-0000-0000-0000000000e1', ANA = '00000000-0000-0000-0000-0000000000e2';
    const ctx2 = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    await ctx2.addInitScript(() => { const real = Date.now.bind(Date), off = Date.UTC(2026, 10, 18, 12) - real(); Date.now = () => real() + off; });
    const p2 = await ctx2.newPage();
    p2.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    p2.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
    await p2.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const calls = [];
    let duelKey = '';
    let friends = [{ id: ANA, name: 'Ana', status: 'pending', incoming: true, since: '2026-11-17T10:00:00Z' }];
    await p2.route(/supabase\.co/, async (route) => {
      const req = route.request(), url = req.url(), body = req.postData() ? JSON.parse(req.postData()) : null;
      calls.push({ url, method: req.method(), body });
      const J = (b, headers = {}) => route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(b) });
      if (url.includes('/auth/v1/')) return J({ access_token: 'jeton', refresh_token: 'r', expires_in: 3600, user: { id: ME } });
      const rpc = /\/rpc\/(\w+)/.exec(url);
      if (rpc) {
        switch (rpc[1]) {
          case 'close_due_seasons': return J(0);
          case 'season_standings': return J([{ rank: 1, player: ANA, name: 'Ana', division: 4, points: 2950, tracks: 3 }, { rank: 2, player: ME, name: 'Testeur', division: 5, points: 1890, tracks: 2 }]);
          case 'my_season': return J([{ division: 5, points: 1890, rank: 1, in_division: 6, moved: null, closed: false }]);
          case 'sector_board': return J([{ rank: 1, player: ANA, name: 'Ana', sector_steps: 600 + body.i, time: 30.5 }]);
          case 'friends_board': return J([{ rank: 1, player: ANA, name: 'Ana', time: 25.25, updated_at: '2026-11-17T10:00:00Z' }, { rank: 2, player: ME, name: 'Testeur', time: 26, updated_at: '2026-11-18T10:00:00Z' }]);
          case 'my_friends': return J(friends);
          case 'friend_respond': friends = friends.map((f) => ({ ...f, status: 'accepted', incoming: false })); return J(null);
          case 'friend_request': friends = [...friends, { id: '00000000-0000-0000-0000-0000000000e3', name: 'Ben', status: 'pending', incoming: false }]; return J('sent');
          case 'settle_due': return J(0);
          case 'my_duels': return J([
            { id: 5, opponent: ANA, opponent_name: 'Ana', mine: true, track_key: duelKey, track_name: 'Circuit du duel', status: 'accepted', ends_at: '2026-11-19T12:00:00Z', my_time: null, their_time: null, result: null, delta: null },
            { id: 6, opponent: ANA, opponent_name: 'Ana', mine: false, track_key: duelKey, track_name: 'Circuit du duel', status: 'pending', ends_at: '2026-11-19T12:00:00Z', my_time: null, their_time: null, result: null, delta: null },
            { id: 4, opponent: ANA, opponent_name: 'Ana', mine: true, track_key: duelKey, track_name: 'Circuit du duel', status: 'settled', ends_at: '2026-11-17T12:00:00Z', my_time: 30, their_time: 31, result: 'win', delta: 16 }]);
          case 'my_tournaments': return J([{ id: 9, name: 'Coupe', code: 'ABC234', track_key: duelKey, track_name: 'Circuit du duel', ends_at: '2026-11-20T12:00:00Z', closed: false, players: 3, my_rank: null, owner: true }]);
          case 'friends_ratings': return J([{ rank: 1, player: ME, name: 'Testeur', rating: 1216, games: 1, wins: 1 }, { rank: 2, player: ANA, name: 'Ana', rating: 1184, games: 1, wins: 0 }]);
          case 'tournament_board': return J([{ rank: 1, player: ANA, name: 'Ana', time: 39 }, { rank: 2, player: ME, name: 'Testeur', time: null }]);
          case 'duel_challenge': return J(7);
          case 'tournament_join': return J(10);
          case 'tournament_create': return J([{ id: 11, code: 'XYZ789' }]);
          default: return J(null);
        }
      }
      if (url.includes('/rest/v1/scores')) return J([], { 'content-range': '*/0' });
      return J([]);
    });
    const ap = (fn, arg) => p2.evaluate(fn, arg), wait = (fn, arg, timeout = 30000) => p2.waitForFunction(fn, arg, { timeout });
    const clk = (sel) => p2.locator(sel).first().evaluate((el) => el.click());
    // Le panneau se redessine après chaque réponse du serveur : entre l'attente de l'élément et son usage il peut disparaître un instant. On réessaie.
    const retry = async (fn, n = 40) => { for (let k = 0; ; k++) { try { return await fn(); } catch (e) { if (k >= n) throw e; await new Promise((r) => setTimeout(r, 100)); } } };
    const until = async (fn, ms = 10000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('délai dépassé'); await new Promise((r) => setTimeout(r, 50)); } };
    try {
      await p2.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
      await p2.locator('#wl-name').fill('Testeur');
      await clk('#wl-submit');
      await wait(() => window.copytrack && window.copytrack.mode === 'menu');
      // Écran Circuits : la saison de la semaine, ses trois circuits
      await ap(() => window.copytrack.showMenu('tracks'));
      await wait(() => document.querySelectorAll('.season-group .season-card').length === 3);
      assert.match(await p2.evaluate(() => document.querySelector('.season-group .group-title').textContent), /Saison 2 de la semaine/);
      await clk('.season-group .season-card');
      await wait(() => window.copytrack._hub && /~v1\.sea-2$/.test(window.copytrack._hub.desc.key));
      assert.match(await p2.evaluate(() => document.querySelector('.hub-cats [aria-checked="true"]').textContent), /Saison 2/);
      const tabs = await p2.evaluate(() => [...document.querySelectorAll('#hub-board .lb-tabs .tab')].map((t) => t.textContent));
      assert.deepEqual(tabs, ['📅 Saison', '🌍 Mondial', '⏱ Secteurs', '👤 Personnel'], 'invité : pas d’onglet Amis');
      await wait(() => /Division 5 · Débutant[\s\S]*Ana[\s\S]*2950 pts/.test(document.getElementById('hub-board').textContent));
      assert.ok(calls.some((c) => c.url.includes('/rpc/close_due_seasons')), 'les saisons finies sont closes avant lecture');
      assert.deepEqual(calls.find((c) => c.url.includes('/rpc/season_standings')).body, { n: 2, lim: 20 });
      // Secteurs : un bouton par secteur ; le secteur choisi part au serveur
      await clk('#hub-board [data-tab="sectors"]');
      await wait(() => document.querySelectorAll('#hub-board [data-sector]').length >= 2 && /Ana[\s\S]*00:05\.008/.test(document.getElementById('hub-board').textContent));
      await clk('#hub-board [data-sector="2"]');
      await wait(() => /00:05\.017/.test(document.getElementById('hub-board').textContent));
      assert.equal(calls.filter((c) => c.url.includes('/rpc/sector_board')).pop().body.i, 2);
      // Compte : l'onglet Amis apparaît
      await ap(async () => { const { online } = await import('/js/online.js'); online.kind = 'account'; window.copytrack.identity = { kind: 'account', username: 'Testeur' }; });
      await ap(() => window.copytrack.openBuiltinHub(window.copytrack._hub.base.index, 'tracks'));
      await clk('#hub-board [data-tab="friends"]');
      await wait(() => /Ana[\s\S]*00:25\.250[\s\S]*Testeur/.test(document.getElementById('hub-board').textContent));
      // Profil › Amis : accepter une demande, en envoyer une
      await ap(() => { window.copytrack.closeRaceHub(); window.copytrack.showScreen('profile'); });
      await wait(() => document.querySelector('.prof-friends [data-fa="yes"]'));
      await clk('.prof-friends [data-fa="yes"]');
      await wait(() => /1 ami(?!s)[\s\S]*Ana/.test((document.querySelector('.prof-friends') || {}).textContent || ''));   // le panneau se redessine après le clic : il peut être absent un instant
      assert.deepEqual(calls.find((c) => c.url.includes('/rpc/friend_respond')).body, { other: ANA, accept: true });
      await p2.locator('.prof-friends .friend-add input').fill('Ben');
      await clk('.prof-friends .friend-add button');
      await wait(() => /Demandes envoyées[\s\S]*Ben/.test((document.querySelector('.prof-friends') || {}).textContent || ''));
      assert.equal(calls.find((c) => c.url.includes('/rpc/friend_request')).body.target_name, 'Ben');
      // Communauté › Abonnements : personne de suivi
      await ap(() => window.copytrack.showScreen('community'));
      await clk('#comm-tabs [data-sort="followed"]');
      await wait(() => /Tu ne suis encore personne/.test(document.getElementById('comm-status').textContent));
      // E17 : Compétition (duels classés, tournois privés)
      duelKey = await ap(() => window.copytrack.builtins[2].key);
      await ap(() => { window.copytrack.showMenu('menu'); window.copytrack.competitionMenu(); });
      await wait(() => document.querySelector('.competition .duel-list'));
      assert.match(await p2.evaluate(() => document.querySelector('.competition').textContent), /Mon classement : 1216[\s\S]*🏆 Victoire · 00:30\.000 — 00:31\.000 · Elo \+16[\s\S]*Coupe/);
      await clk('.competition [data-duel-yes="6"]');
      await until(() => calls.some((c) => c.url.includes('/rpc/duel_respond')));
      assert.deepEqual(calls.find((c) => c.url.includes('/rpc/duel_respond')).body, { duel: 6, accept: true });
      await wait(() => document.querySelector('.competition .duel-new'));
      await retry(() => ap((k) => { const f = document.querySelector('.competition .duel-new'); f.querySelector('.duel-track').value = k; f.requestSubmit(); }, duelKey));
      await until(() => calls.some((c) => c.url.includes('/rpc/duel_challenge')));
      assert.deepEqual(calls.find((c) => c.url.includes('/rpc/duel_challenge')).body.track, duelKey);
      await wait(() => document.querySelector('.competition .tour-join'));
      await retry(() => ap(() => { const f = document.querySelector('.competition .tour-join'); f.querySelector('input').value = 'abc234'; f.requestSubmit(); }));
      await until(() => calls.some((c) => c.url.includes('/rpc/tournament_join')));
      await wait(() => document.querySelector('.competition [data-tour-board="9"]'));
      await clk('.competition [data-tour-board="9"]');
      await wait(() => /Ana[\s\S]*00:39\.000/.test(document.querySelector('.competition .tour-board').textContent));
      await clk('.competition [data-duel-play="5"]');
      await wait(() => window.copytrack.mode === 'race' && window.copytrack.session && /~v1\.duel-5$/.test(window.copytrack.session.trackKey), null, 30000);
      await ap(() => window.copytrack.quitRace());
    } finally { await ctx2.close(); }
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
