// Interface personnalisée (lot 11) : thèmes, couleurs, HUD déplaçable, caméras du joueur. Tout est validé ; rien ne touche au jeu.
// node tools/test-interface.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { sanitizeUi, themeVars, THEMES, DEFAULT_UI, CSS_VARS, HUD_PIECES } from '../js/uitheme.js';
import { sanitizeCam, sanitizeCams, cameraList, clampCamIndex, MAX_CUSTOM_CAMS, CAM_LIMITS } from '../js/camprefs.js';
import { CAM_MODES } from '../js/race/shared.js';

console.log('Interface');
test('valeurs inconnues ou hors bornes : retour aux valeurs sûres', () => {
  const u = sanitizeUi({ theme: 'x', accent: 'red', panelA: 9, radius: 999, font: 'comic', speedo: 'zz', timer: 'q', hudScale: 0.1, hud: { top: [999, -999], nope: [1, 1], tl: 'a' }, hide: { hint: 1, zz: 1 } });
  assert.deepEqual([u.theme, u.accent, u.panelA, u.radius, u.font, u.speedo, u.timer, u.hudScale], ['default', '', 1, 28, 'default', 'default', 'normal', 0.7]);
  assert.deepEqual(u.hud, { top: [48, -48] }); assert.deepEqual(u.hide, { hint: true });
  assert.deepEqual(sanitizeUi(null), DEFAULT_UI); assert.deepEqual(sanitizeUi('x'), DEFAULT_UI);
});
test('noms hérités de Object (__proto__, constructor…) : refusés comme n\'importe quelle valeur inconnue', () => {
  const u = sanitizeUi({ theme: '__proto__', font: 'constructor', speedo: 'toString', timer: 'hasOwnProperty' });
  assert.deepEqual([u.theme, u.font, u.speedo, u.timer], ['default', 'default', 'default', 'normal']);
  assert.doesNotThrow(() => themeVars({ theme: '__proto__', font: 'constructor' }));
});
test('les variables CSS produites sont toutes connues (aucune ne reste posée après un changement de thème)', () => {
  for (const id of Object.keys(THEMES)) for (const k of Object.keys(themeVars({ theme: id, accent: '#112233', accent2: '#445566', panelA: 0.5, radius: 8, font: 'mono', hud: { top: [1, 2], br: [3, 4] } }))) assert.ok(CSS_VARS.includes(k), id + ' ' + k);
  for (const k of Object.keys(HUD_PIECES)) assert.ok(CSS_VARS.includes('--hx-' + k) && CSS_VARS.includes('--hy-' + k));
});
test('couleurs et opacité : l\'accent remplace le dégradé, l\'opacité garde la teinte du thème', () => {
  const v = themeVars({ theme: 'midnight', accent: '#112233', panelA: 0.5 });
  assert.equal(v['--cyan'], '#112233'); assert.match(v['--grad'], /#112233/);
  assert.match(v['--panel'], /^rgba\(10, 18, 44, 0\.5\)$/);
  assert.equal(themeVars({})['--panel'], undefined, 'le thème par défaut ne pose rien');
});
test('HUD : les décalages sont en vw/vh (ils suivent la taille de l\'écran)', () => {
  const v = themeVars({ hud: { tr: [-12.34, 5] } });
  assert.equal(v['--hx-tr'], '-12.3vw'); assert.equal(v['--hy-tr'], '5vh'); assert.equal(v['--hud-scale'], '1');
});

console.log('Caméras');
test('une caméra du joueur est bornée, son nom nettoyé ; au plus 6', () => {
  const c = sanitizeCam({ name: '  <b>Ma cam</b> très très longue ', dist: 999, height: -4, look: 'x', fov: 5 });
  assert.equal(c.dist, CAM_LIMITS.dist[1]); assert.equal(c.height, CAM_LIMITS.height[0]); assert.equal(c.fov, CAM_LIMITS.fov[0]);
  assert.ok(c.name.length <= 16 && !/[<>/]/.test(c.name));
  assert.equal(sanitizeCam(null), null);
  assert.equal(sanitizeCams(Array.from({ length: 20 }, () => ({}))).length, MAX_CUSTOM_CAMS);
  assert.deepEqual(sanitizeCams('x'), []);
});
test('liste complète : les 4 caméras d\'origine d\'abord, puis celles du joueur ; un indice périmé retombe sur la première', () => {
  const l = cameraList(CAM_MODES, [{ name: 'Haute', dist: 20, height: 12 }]);
  assert.equal(l.length, CAM_MODES.length + 1); assert.equal(l[0].name, CAM_MODES[0].name); assert.equal(l[CAM_MODES.length].name, 'Haute');
  assert.equal(clampCamIndex(CAM_MODES.length, l), CAM_MODES.length); assert.equal(clampCamIndex(99, l), 0); assert.equal(clampCamIndex(-1, l), 0); assert.equal(clampCamIndex('2', l), 0);
  for (const c of l.slice(CAM_MODES.length)) for (const k of Object.keys(CAM_LIMITS)) assert.ok(c[k] >= CAM_LIMITS[k][0] && c[k] <= CAM_LIMITS[k][1]);
});

console.log('Profils de HUD et HUD d’entraînement');
test('profils : valeur inconnue -> Classique ; le profil ajoute ses éléments cachés à ceux du joueur', async () => {
  const H = await import('../js/hudProfile.js');
  assert.equal(H.sanitizeHudProfile('training'), 'training');
  for (const bad of ['', '__proto__', 'constructor', 42, null]) assert.equal(H.sanitizeHudProfile(bad), 'classic');
  assert.deepEqual(H.effectiveHide({ hide: {} }, 'classic'), {}, 'Classique : le HUD d’avant');
  assert.deepEqual(H.effectiveHide({ hide: { boost: true } }, 'classic'), { boost: true });
  const m = H.effectiveHide({ hide: { boost: true } }, 'competitive');
  assert.ok(m.boost && m.hint && m.medals && m.track && !m.split, 'union des deux');
  assert.equal(H.isTraining('training'), true); assert.equal(H.isTraining('minimal'), false);
});
test('réglages d’entraînement : tout affiché par défaut, référence validée', async () => {
  const H = await import('../js/hudProfile.js');
  const d = H.sanitizeTraining(null);
  assert.equal(d.ref, 'record'); assert.ok(Object.values(d.w).every(Boolean));
  const t = H.sanitizeTraining({ ref: 'world', w: { line: false, nope: false } });
  assert.equal(t.ref, 'world'); assert.equal(t.w.line, false); assert.equal(t.w.delta, true); assert.equal('nope' in t.w, false);
  assert.equal(H.sanitizeTraining({ ref: '__proto__' }).ref, 'record');
});

finish('Tous les tests de l\'interface personnalisée passent.');
