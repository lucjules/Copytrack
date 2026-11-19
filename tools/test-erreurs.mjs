// Erreurs du jeu remontées au serveur (0.12.5, js/errorReport.js) : rien sans accord, message nettoyé, seulement le code du jeu, regroupement,
// file bornée, envoi par lots, reprise après échec, retrait de l'accord.   node tools/test-erreurs.mjs   (npm test)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';
import { ErrorReport, cleanMessage, sourceOf, browserInfo, MAX_DISTINCT, ERR_QUEUE_KEY } from '../js/errorReport.js';
import { VERSION, PHYS_VER } from '../js/version.js';

const ORIGIN = 'https://lucjules.github.io/Copytrack';
const mk = (o = {}) => {
  const mem = new Map(), sent = [];
  let on = o.on !== undefined ? o.on : true, t = 1_000_000;
  const r = new ErrorReport({
    store: { get: (k, d) => (mem.has(k) ? JSON.parse(mem.get(k)) : d), set: (k, v) => mem.set(k, JSON.stringify(v)) },
    send: o.send || (async (lot) => { sent.push(lot); }), enabled: () => on, install: () => '0123456789abcdef', origin: ORIGIN,
    userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0', now: () => t, schedule: () => 0,
  });
  return { r, mem, sent, setOn: (v) => { on = v; }, tick: (ms) => { t += ms; } };
};
const err = (message, file = 'js/race.js', line = 12) => { const e = new Error(message); e.stack = `Error: ${message}\n    at RaceSession.update (${ORIGIN}/${file}?v=3:${line}:7)\n    at loop (${ORIGIN}/js/main.js:200:3)`; return e; };

test('rien n’est gardé ni envoyé sans l’accord du joueur (le même que celui des statistiques)', async () => {
  const { r, sent, mem } = mk({ on: false });
  assert.equal(r.capture('error', err('boum')), false);
  assert.equal(await r.flush(), 0);
  assert.equal(sent.length, 0); assert.equal(mem.has(ERR_QUEUE_KEY), false);
});

test('message nettoyé : adresses, e-mails, identifiants remplacés ; 300 caractères au plus ; jamais vide', () => {
  assert.equal(cleanMessage('Échec de https://x.supabase.co/rest/v1/scores?player=eq.1 pour bob@mail.fr'), 'Échec de <url> pour <email>');
  assert.equal(cleanMessage('session 0b9f3c2e-1111-4222-8333-444455556666 / jeton 0123456789abcdef0123'), 'session <id> / jeton <id>');
  assert.equal(cleanMessage('é'.repeat(500)).length, 300);
  assert.equal(cleanMessage(''), '(sans message)');
});

test('fichier et ligne : seulement le code du jeu (chemin relatif, sans paramètres) ; une erreur d’extension ou d’un autre site est ignorée', () => {
  assert.equal(sourceOf(err('x').stack, ORIGIN), 'js/race.js:12:7');
  assert.equal(sourceOf('', ORIGIN, `${ORIGIN}/js/editor.js`, 40, 2), 'js/editor.js:40:2');
  assert.equal(sourceOf('at f (chrome-extension://abc/content.js:1:1)', ORIGIN), '');
  const { r } = mk();
  const ext = new Error('extension'); ext.stack = 'Error: extension\n    at f (chrome-extension://abc/content.js:1:1)';
  assert.equal(r.capture('error', ext), false);
  assert.equal(r.capture('error', 'Script error.'), false);
  assert.equal(r.capture('error', 'autre site', { file: 'https://pub.example/ad.js', line: 1 }), false);
  assert.equal(r.capture('inconnu', err('x')), false);
});

test('une même erreur répétée ne fait qu’une ligne (occurrences comptées) ; au plus 30 erreurs distinctes gardées', () => {
  const { r } = mk();
  for (let i = 0; i < 5; i++) r.capture('loop', err('NaN dans la caméra'));
  assert.equal(r.queue.length, 1); assert.equal(r.queue[0].hits, 5);
  for (let i = 0; i < 40; i++) r.capture('error', err('erreur ' + i, 'js/ui.js', i + 1));
  assert.equal(r.queue.length, MAX_DISTINCT);
});

test('envoi : lots de 20 au plus, les champs prévus seulement (version, physique, navigateur, téléphone) ; la file se vide', async () => {
  const { r, sent } = mk();
  for (let i = 0; i < 25; i++) r.capture('error', err('erreur ' + i, 'js/ui.js', i + 1));
  assert.equal(await r.flush(), 25);
  assert.deepEqual(sent.map((l) => l.length), [20, 5]);
  assert.deepEqual(Object.keys(sent[0][0]).sort(), ['browser', 'hits', 'install', 'kind', 'message', 'mobile', 'pv', 'source', 'version']);
  assert.deepEqual({ ...sent[0][0], message: undefined, source: undefined }, { install: '0123456789abcdef', version: VERSION, pv: PHYS_VER, kind: 'error', message: undefined, source: undefined, browser: 'firefox', mobile: true, hits: 1 });
  assert.equal(r.queue.length, 0);
});

test('échec réseau : la file est gardée et l’envoi attend (attente croissante) ; retirer l’accord vide la file', async () => {
  let fail = true;
  const { r, tick } = mk({ send: async () => { if (fail) throw new Error('hors ligne'); } });
  r.capture('error', err('boum'));
  assert.equal(await r.flush(), 0); assert.equal(r.queue.length, 1);
  fail = false;
  assert.equal(await r.flush(), 0, 'trop tôt : l’attente n’est pas finie');
  tick(61_000);
  assert.equal(await r.flush(), 1);
  r.capture('error', err('encore'));
  r.forget(); assert.equal(r.queue.length, 0);
});

test('navigateur : famille et téléphone seulement', () => {
  assert.deepEqual(browserInfo('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0'), { browser: 'edge', mobile: false });
  assert.deepEqual(browserInfo('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'), { browser: 'safari', mobile: true });
  assert.deepEqual(browserInfo('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36'), { browser: 'chrome', mobile: false });
});

test('branchements : erreurs non rattrapées, promesses rejetées (hors ligne exclu), boucle de jeu ; retirer l’accord vide aussi cette file', () => {
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /addEventListener\('error'/); assert.match(main, /addEventListener\('unhandledrejection'[^\n]*code === 'offline'/);
  assert.match(main, /this\.errors\.capture\('loop', e\)/);
  assert.match(readFileSync(new URL('../js/app/settings.js', import.meta.url), 'utf8'), /this\.telemetry\.forget\(\); this\.errors\.forget\(\);/);
  assert.match(readFileSync(new URL('../js/online.js', import.meta.url), 'utf8'), /rpc\/log_errors', \{ method: 'POST', body: \{ events \}, auth: false \}/);
});

await finish('Les erreurs du jeu ne remontent qu’avec l’accord du joueur, nettoyées, regroupées et bornées.');
