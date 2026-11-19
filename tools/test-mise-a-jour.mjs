// Nouvelle version en ligne (0.13.1, js/updateCheck.js et js/app/update.js) : version lue dans js/version.js, une seule annonce, erreurs réseau
// silencieuses, pas plus d'une vérification par minute ; bandeau branché, caché pendant une course, traduit.
//   node tools/test-mise-a-jour.mjs   (npm test)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';
import { parseVersion, createUpdateChecker, MIN_GAP_MS } from '../js/updateCheck.js';
import { VERSION } from '../js/version.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('la version se lit dans le texte de js/version.js (le vrai fichier compris)', () => {
  assert.equal(parseVersion(read('js/version.js')), VERSION);
  assert.equal(parseVersion("export const VERSION = 'bêta 9.9.9';"), 'bêta 9.9.9');
  assert.equal(parseVersion('<html>404</html>'), null);
  assert.equal(parseVersion(null), null);
});

test('même version : rien ; autre version : une seule annonce ; réseau en panne : silence ; au plus une vérification par minute', async () => {
  let t = 0, text = `export const VERSION = '${VERSION}';`, fail = false, calls = 0;
  const seen = [];
  const c = createUpdateChecker({ current: VERSION, now: () => t, onNew: (v) => seen.push(v), fetchText: async (url) => { calls++; assert.match(url, /^js\/version\.js\?u=\d+$/); if (fail) throw new Error('hors ligne'); return text; } });
  assert.equal(await c.check(), false);
  t += 10; assert.equal(await c.check(), false); assert.equal(calls, 1, 'trop tôt : pas de nouvelle requête');
  t += MIN_GAP_MS; fail = true; assert.equal(await c.check(), false); assert.deepEqual(seen, []);
  t += MIN_GAP_MS; fail = false; text = "export const VERSION = 'bêta 0.99.0';";
  assert.equal(await c.check(), true); assert.deepEqual(seen, ['bêta 0.99.0']);
  t += MIN_GAP_MS; assert.equal(await c.check(true), false); assert.deepEqual(seen, ['bêta 0.99.0'], 'une seule annonce');
});

test('bandeau : lancé au démarrage, caché pendant une course, bouton Recharger, traduit', () => {
  assert.match(read('js/main.js'), /this\.startUpdateCheck\(\)/);
  assert.match(read('js/main.js'), /updateMethods/);
  assert.match(read('css/style.css'), /body\.in-race #update-bar \{ display: none; \}/);
  const u = read('js/app/update.js');
  assert.match(u, /location\.reload\(\)/); assert.match(u, /cache: 'no-store'/);
  assert.match(read('js/i18n/en/shell.js'), /'Nouvelle version disponible :': 'New version available:'/);
});

await finish('Une nouvelle version en ligne est détectée et proposée, sans jamais interrompre une course.');
