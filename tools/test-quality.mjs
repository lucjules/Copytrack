// Tests de la qualité graphique : node tools/test-quality.mjs   (npm test)
import assert from 'node:assert/strict';
import * as THREE from '../js/vendor/three.module.min.js';
import {
  PROFILES, PROFILE_ORDER, Benchmark, frameStats, hardwareHints, pixelRatioFor, wantAntialias, stepDown, swapMaterials, QualityManager,
} from '../js/quality.js';

let failures = 0;
function test(name, fn) { try { fn(); console.log('  ok   ' + name); } catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 5).join('\n       ')); } }

// Simule l'animation du menu : fpsOf(profil) i/s, avec des à-coups éventuels (instants en ms → durée ajoutée).
function simulate(fpsOf, { start = 'ultra', hitches = {}, active = () => true, limit = 120000 } = {}) {
  let cur = start, result = null, t = 1000;
  const applied = [];
  const b = new Benchmark({ start, apply: (p) => { cur = p; applied.push(p); }, done: (r) => { result = r; } });
  let guard = 0;
  while (!b.finished && t < limit && guard++ < 1e6) {
    let dt = 1000 / fpsOf(cur);
    for (const [at, extra] of Object.entries(hitches)) if (t <= +at && t + dt > +at) dt += extra;
    t += dt;
    b.frame(t, active(t));
  }
  return { result, applied, t, b };
}

console.log('Profils');
test('six profils, du plus beau au plus léger, avec des réglages qui décroissent', () => {
  assert.deepEqual(PROFILE_ORDER, ['ultra', 'high', 'medium', 'low', 'potato', 'ultrapotato']);
  const ps = PROFILE_ORDER.map((n) => PROFILES[n]);
  for (let i = 1; i < ps.length; i++) {
    assert.ok(ps[i].shadow <= ps[i - 1].shadow, 'ombres décroissantes ' + ps[i].name);
    assert.ok(ps[i].pixelRatio.max <= ps[i - 1].pixelRatio.max);
    assert.ok(ps[i].terrainSeg <= ps[i - 1].terrainSeg);
  }
  assert.ok(PROFILES.ultra.shadow >= 4096 && PROFILES.ultra.env > 0 && PROFILES.ultra.pixelRatio.min >= 1.5, 'Ultra : ombres 4096, reflets, sur-échantillonnage');
  const p = PROFILES.potato;
  assert.equal(p.shadow, 0); assert.equal(p.decor, 'none'); assert.equal(p.mat, 'basic'); assert.equal(p.sky, 'flat'); assert.ok(p.pixelRatio.max < 1); assert.equal(p.hills, 0);
  const u = PROFILES.ultrapotato;
  assert.ok(u.pixelRatio.max <= 0.34 && u.far <= 450 && u.terrainSeg <= 4 && u.particles === 0 && u.fpsCap === 30 && u.lean && u.pixelated, 'Ultra Potato : image minuscule, 30 i/s, brouillard proche, sans extras');
  assert.equal(PROFILES.low.shadow, 0); assert.equal(PROFILES.low.mat, 'lambert'); assert.equal(PROFILES.low.decor, 'reduced');
  assert.equal(PROFILES.high.shadow, 2048); assert.equal(PROFILES.medium.shadow, 1024);
});
test('pixel ratio : Ultra sur-échantillonne un écran 1x, Potato descend sous 1, les autres restent bornés', () => {
  assert.equal(pixelRatioFor(PROFILES.ultra, 1), 1.5); assert.equal(pixelRatioFor(PROFILES.ultra, 3), 2);
  assert.equal(pixelRatioFor(PROFILES.high, 3), 2); assert.equal(pixelRatioFor(PROFILES.medium, 3), 1.25);
  assert.equal(pixelRatioFor(PROFILES.low, 2), 1); assert.ok(pixelRatioFor(PROFILES.potato, 3) <= 0.65);
});
test('antialiasing : coupé seulement pour Basse et Potato (choisi à la création du contexte)', () => {
  assert.equal(wantAntialias({ quality: 'auto', gfxProfile: '' }), true);
  assert.equal(wantAntialias({ quality: 'auto', gfxProfile: 'potato' }), false);
  assert.equal(wantAntialias({ quality: 'ultrapotato' }), false); assert.equal(wantAntialias({ quality: 'low' }), false); assert.equal(wantAntialias({ quality: 'ultra' }), true);
  assert.equal(stepDown('ultra'), 'high'); assert.equal(stepDown('potato'), 'ultrapotato'); assert.equal(stepDown('ultrapotato'), 'ultrapotato');
});

console.log('Indices matériels');
test('GPU logiciel → Potato ; carte gamer → Ultra ; Intel de bureau → Moyenne ; mobile modeste → Basse ; inconnu → Haute', () => {
  assert.equal(hardwareHints({ renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)' }).start, 'potato');
  assert.equal(hardwareHints({ renderer: 'llvmpipe (LLVM 15.0.7, 256 bits)' }).start, 'potato');
  assert.equal(hardwareHints({ renderer: 'V3D 4.2.14.0', ua: 'Mozilla/5.0 (X11; Linux aarch64) Chrome/120' }).start, 'ultrapotato');
  assert.equal(hardwareHints({ renderer: 'Mesa VideoCore VII', ua: 'Mozilla/5.0 (X11; Linux armv7l)' }).tiny, true);
  assert.equal(hardwareHints({ renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11)', cores: 16 }).start, 'ultra');
  assert.equal(hardwareHints({ renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)', cores: 4, memory: 8 }).start, 'medium');
  assert.equal(hardwareHints({ renderer: 'Intel(R) HD Graphics', cores: 2, memory: 2 }).start, 'low');
  assert.equal(hardwareHints({ renderer: 'Mali-G52', ua: 'Mozilla/5.0 (Linux; Android 11) Mobile', touch: true, width: 412, cores: 8 }).start, 'low');
  assert.equal(hardwareHints({ renderer: 'Apple GPU', ua: 'iPhone', touch: true, width: 390, cores: 6, memory: 4 }).start, 'medium');
  assert.equal(hardwareHints({ renderer: '' }).start, 'high');
  assert.equal(hardwareHints({ renderer: 'ANGLE (NVIDIA GeForce GTX 1060)', cores: 2 }).start, 'medium', 'peu de cœurs : prudence');
});

console.log('Statistiques et benchmark');
test('frameStats : médiane et 90e centile, insensibles à un à-coup isolé', () => {
  const dts = Array(100).fill(16.7); dts[10] = 400; dts[50] = 300;
  const s = frameStats(dts);
  assert.ok(Math.abs(s.fps - 60) < 0.5, 'médiane ~60 i/s malgré 2 à-coups : ' + s.fps); assert.ok(s.p90fps > 55);
  assert.equal(frameStats([]).fps, 0);
  assert.ok(frameStats([33, 33, 33, 33]).fps < 31);
});
test('PC gamer (60 i/s partout) : Ultra gardé du premier coup, une seule étape', () => {
  const { result, applied } = simulate(() => 60, { start: 'ultra' });
  assert.equal(result.profile, 'ultra'); assert.equal(result.steps.length, 1); assert.deepEqual(applied, ['ultra']); assert.ok(result.passed);
});
test('vieux PC de bureau : Ultra 14 i/s, Haute 24, Moyenne 38, Basse 61 → Basse retenue, descente dans l’ordre', () => {
  const fps = { ultra: 14, high: 24, medium: 38, low: 61, potato: 144 };
  const { result, applied, t } = simulate((p) => fps[p], { start: 'ultra' });
  assert.equal(result.profile, 'low'); assert.deepEqual(applied, ['ultra', 'high', 'medium', 'low']);
  assert.ok(result.steps.every((s, i) => s.pass === (i === 3)));
  assert.ok(t < 40000, 'la détection reste courte : ' + Math.round(t / 1000) + ' s');
});
test('machine très faible : même Potato échoue → Ultra Potato, et le test s’arrête là', () => {
  const { result, applied } = simulate(() => 20, { start: 'high' });
  assert.equal(result.profile, 'ultrapotato'); assert.equal(result.passed, false); assert.equal(applied.at(-1), 'ultrapotato');
  assert.equal(new Set(applied).size, applied.length, 'chaque profil n’est essayé qu’une fois');
});
test('mobile : on démarre bas et on s’arrête dès que 60 i/s sont tenus (pas de montée inutile)', () => {
  const { result, applied } = simulate((p) => (p === 'low' ? 30 : p === 'potato' ? 60 : 60), { start: 'medium' });
  assert.equal(result.profile, 'medium'); assert.deepEqual(applied, ['medium']);
  const r2 = simulate((p) => (p === 'low' ? 30 : 60), { start: 'low' });
  assert.equal(r2.result.profile, 'potato');
});
test('chargement initial ignoré : des à-coups de 600 ms au début n’abaissent pas le profil', () => {
  const { result } = simulate(() => 60, { start: 'ultra', hitches: { 1500: 600, 2400: 900, 3000: 500, 4200: 700 } });
  assert.equal(result.profile, 'ultra', JSON.stringify(result.steps));
});
test('le même à-coup en pleine mesure relance l’étape au lieu de la fausser', () => {
  const clean = simulate(() => 60, { start: 'high' });
  const noisy = simulate(() => 60, { start: 'high', hitches: { 5200: 800, 6100: 500 } });
  assert.equal(noisy.result.profile, 'high'); assert.ok(noisy.t > clean.t, 'étape rallongée');
});
test('une machine lente n’est PAS sauvée par les à-coups ignorés : elle échoue quand même', () => {
  const { result } = simulate((p) => (p === 'ultra' ? 25 : 60), { start: 'ultra', hitches: { 3000: 700 } });
  assert.equal(result.profile, 'high');
});
test('pause : fenêtre ouverte / onglet masqué = le temps ne compte pas ; la détection reprend ensuite', () => {
  let paused = true;
  const { result, t } = simulate(() => 60, { start: 'ultra', active: (t) => !(t > 2000 && t < 20000) });
  assert.equal(result.profile, 'ultra'); assert.ok(t > 20000, 'rien n’a été conclu pendant la pause'); void paused;
});
test('abandon (le joueur lance une course) : profil plus sûr que celui qui était testé, sans conclure', () => {
  let cur = '';
  const b = new Benchmark({ start: 'ultra', apply: (p) => { cur = p; } });
  for (let t = 0; t < 800; t += 16.7) b.frame(1000 + t, true);
  assert.equal(b.abort(), 'high'); assert.equal(cur, 'high'); assert.ok(b.finished && b.result === null);
});

console.log('Matériaux et gestionnaire');
function sceneWith() {
  const sc = new THREE.Scene();
  const std = new THREE.MeshStandardMaterial({ color: '#ff0000', vertexColors: false, flatShading: true });
  const glow = new THREE.MeshStandardMaterial({ color: '#222222', emissive: '#00ffff', emissiveIntensity: 0.8 });
  const vc = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
  const g = new THREE.BoxGeometry(1, 1, 1);
  const meshes = [new THREE.Mesh(g, std), new THREE.Mesh(g, glow), new THREE.Mesh(g, vc), new THREE.InstancedMesh(g, std, 4), new THREE.Mesh(g, new THREE.MeshBasicMaterial())];
  meshes.forEach((m) => sc.add(m));
  return { sc, meshes, std, glow, vc };
}
test('Lambert / Basic : couleurs, sommets colorés, transparence et lueurs conservés ; retour au Standard intact', () => {
  const { sc, meshes, std, glow, vc } = sceneWith();
  swapMaterials(sc, 'lambert');
  assert.ok(meshes[0].material.isMeshLambertMaterial && meshes[0].material.color.getHexString() === 'ff0000');
  assert.equal(meshes[0].material.flatShading, true);
  assert.ok(meshes[1].material.emissive.getHexString() === '00ffff');
  assert.ok(meshes[2].material.vertexColors && meshes[2].material.transparent && meshes[2].material.opacity === 0.6 && meshes[2].material.side === THREE.DoubleSide);
  assert.equal(meshes[0].material, meshes[3].material, 'un même matériau d’origine → une seule copie (instanciés compris)');
  assert.ok(meshes[4].material.isMeshBasicMaterial, 'les matériaux Basic existants ne sont pas touchés');
  swapMaterials(sc, 'basic');
  assert.ok(meshes[0].material.isMeshBasicMaterial && meshes[0].material.color.getHexString() === 'ff0000');
  const gc = meshes[1].material.color; assert.ok(gc.r === 0 && gc.g > 0.5 && Math.abs(gc.g - gc.b) < 1e-9, 'une pièce lumineuse garde sa lueur cyan : ' + gc.getHexString());
  assert.ok(meshes[2].material.vertexColors);
  swapMaterials(sc, 'standard');
  assert.equal(meshes[0].material, std); assert.equal(meshes[1].material, glow); assert.equal(meshes[2].material, vc);
});
test('la copie suit les changements de couleur de l’original (voiture repeinte) et les nouveaux maillages sont convertis', () => {
  const { sc, meshes, std } = sceneWith();
  swapMaterials(sc, 'lambert');
  std.color.set('#00ff00');
  swapMaterials(sc, 'lambert');
  assert.equal(meshes[0].material.color.getHexString(), '00ff00');
  const late = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#0000ff' }));
  sc.add(late); swapMaterials(sc, 'lambert');
  assert.ok(late.material.isMeshLambertMaterial);
});
test('QualityManager.apply règle le rendu : pixel ratio, ombres, tonalité, portée, matériaux, décor, particules', () => {
  const sc = new THREE.Scene(); const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()); sc.add(mesh);
  const calls = { ratio: null, qualityArg: null, hidden: null, rebuilt: 0, resized: 0, scale: null };
  const renderer = { shadowMap: { enabled: true, type: 0 }, toneMapping: 0, toneMappingExposure: 1, setPixelRatio: (r) => { calls.ratio = r; } };
  const camera = { far: 5000, updateProjectionMatrix() {} };
  const scenery = { setQuality: (p) => { calls.qualityArg = p.name; } };
  const mgr = new QualityManager({ renderer, scene: sc, camera, scenery, particles: { setScale: (k) => { calls.scale = k; } }, resize: () => calls.resized++, views: () => [{ rebuild: () => calls.rebuilt++ }], setDecoHidden: (v) => { calls.hidden = v; } });
  mgr.apply('ultra');
  assert.equal(renderer.shadowMap.enabled, true); assert.equal(renderer.toneMapping, THREE.NeutralToneMapping); assert.ok(calls.ratio >= 1.5 && calls.qualityArg === 'ultra');
  assert.ok(mesh.material.isMeshStandardMaterial);
  mgr.apply('potato');
  assert.equal(renderer.shadowMap.enabled, false); assert.equal(renderer.toneMapping, THREE.NoToneMapping); assert.ok(calls.ratio <= 0.65);
  assert.equal(camera.far, 1400); assert.equal(calls.hidden, true); assert.equal(calls.rebuilt, 1, 'les décorations du créateur sont retirées de la vue');
  assert.ok(mesh.material.isMeshBasicMaterial); assert.equal(calls.scale, 0.25); assert.ok(calls.resized >= 2);
  mgr.apply('low'); assert.equal(calls.hidden, false); assert.ok(mesh.material.isMeshLambertMaterial); assert.equal(renderer.shadowMap.enabled, false);
  mgr.apply('high'); assert.ok(mesh.material.isMeshStandardMaterial); assert.equal(renderer.shadowMap.enabled, true);
});
test('filet de sécurité en course : sous 42 i/s pendant 5 s on descend d’un profil, une seule fois par 10 s ; jamais hors mode automatique', () => {
  globalThis.document = { visibilityState: 'visible' };
  const sc = new THREE.Scene();
  const mgr = new QualityManager({ renderer: { shadowMap: {}, setPixelRatio() {} }, scene: sc, camera: { updateProjectionMatrix() {} }, scenery: { setQuality() {} }, resize() {} });
  mgr.apply('high');
  let changed = null;
  for (let i = 0; i < 400; i++) changed = mgr.watch(1 / 30, true, false) || changed;
  assert.equal(changed, null, 'profil choisi à la main : jamais touché'); assert.equal(mgr.name, 'high');
  for (let i = 0; i < 400; i++) changed = mgr.watch(1 / 30, true, true) || changed;
  assert.equal(changed, 'medium');
  for (let i = 0; i < 100; i++) mgr.watch(1 / 60, true, true);
  assert.equal(mgr.name, 'medium', 'à 60 i/s on ne descend pas');
  delete globalThis.document;
});

console.log(failures ? `\n${failures} test(s) en échec` : '\nTous les tests de qualité passent.');
process.exit(failures ? 1 : 0);
