// Mesure du chargement (phase 3 de la 1.0) : le jeu servi comme par GitHub Pages (HTTP/2, fichiers compressés en gzip, aucun cache), dans Chromium,
// avec un réseau mobile simulé. Donne, pour une première visite : le temps jusqu'à l'écran d'accueil utilisable, jusqu'au menu, le poids transféré
// et le nombre de requêtes ; puis la même chose pour une visite suivante (service worker et cache). Rien n'est envoyé sur Internet.
//   node tools/mesure-chargement.mjs                 tous les profils réseau
//   node tools/mesure-chargement.mjs --json f.json   écrit aussi les chiffres dans un fichier
// Les profils sont ceux de Chrome : « 4G » (9 Mbit/s, 85 ms) et « 4G lente » (1,6 Mbit/s, 150 ms). Objectif de la 1.0 : accueil en moins de 5 s en 4G.
import http2 from 'node:http2';
import { readFileSync, existsSync, writeFileSync, mkdtempSync, statSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PROFILES = { '4G': { down: 9e6, up: 1.5e6, rtt: 85 }, '4G lente': { down: 1.6e6, up: 0.75e6, rtt: 150 } };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const COMPRESS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.txt']);

// Serveur local HTTP/2 + TLS (certificat jetable), gzip comme GitHub Pages. Renvoie { url, close }.
export async function serve() {
  const dir = mkdtempSync(join(tmpdir(), 'mesure-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem')], { stdio: 'ignore' });
  const gz = new Map();
  const server = http2.createSecureServer({ key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')), allowHTTP1: true }, (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'https://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = normalize(join(root, p));
    if (!f.startsWith(root) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    const ext = extname(f), headers = { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'max-age=600' };
    let body = readFileSync(f);
    if (COMPRESS.has(ext) && /gzip/.test(req.headers['accept-encoding'] || '')) {
      if (!gz.has(f)) gz.set(f, gzipSync(body, { level: 9 }));
      body = gz.get(f); headers['content-encoding'] = 'gzip';
    }
    res.writeHead(200, headers); res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `https://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) };
}

// Une visite : temps jusqu'à l'accueil utilisable (formulaire affiché ET style chargé), jusqu'au menu (après « Jouer en invité »), octets et requêtes.
async function visit(ctx, url, prof, { fresh }) {
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  if (fresh) await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (prof) await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: prof.down / 8, uploadThroughput: prof.up / 8, latency: prof.rtt });
  let bytes = 0, reqs = 0;
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; reqs++; });
  const t0 = Date.now();
  await p.goto(url, { waitUntil: 'commit' });
  // (« visible » au sens du navigateur ET style appliqué : avant la feuille de style, la classe hidden n'agit pas encore et rien n'est dessiné)
  await p.waitForFunction(() => { const w = document.getElementById('welcome'); return w && !w.classList.contains('hidden') && getComputedStyle(w).position === 'fixed'; }, null, { timeout: 120000, polling: 50 })
    .catch(async () => { await p.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 120000, polling: 50 }); });
  const welcome = Date.now() - t0, b1 = bytes, r1 = reqs;
  if (await p.evaluate(() => !window.copytrack)) {
    await p.fill('#wl-name', 'Mesure');
    await p.click('#wl-submit');
  }
  await p.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 120000, polling: 50 });
  const menu = Date.now() - t0;
  await p.waitForTimeout(1500);
  const out = { welcomeS: +(welcome / 1000).toFixed(2), menuS: +(menu / 1000).toFixed(2), welcomeKo: Math.round(b1 / 1024), welcomeReqs: r1, totalKo: Math.round(bytes / 1024), totalReqs: reqs };
  await p.close();
  return out;
}

export async function measure({ profiles = PROFILES } = {}) {
  const require = createRequire(import.meta.url);
  let chromium;
  try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }
  const srv = await serve();
  const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
  const results = {};
  try {
    for (const [name, prof] of Object.entries(profiles)) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'fr-FR', ignoreHTTPSErrors: true });
      results[name] = { premiere: await visit(ctx, srv.url, prof, { fresh: true }) };
      await (await ctx.newPage()).goto(srv.url, { waitUntil: 'load' });      // (laisse le service worker s'installer)
      await new Promise((r) => setTimeout(r, 4000));
      results[name].suivante = await visit(ctx, srv.url, prof, { fresh: false });
      await ctx.close();
    }
  } finally { await browser.close(); await srv.close(); }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await measure();
  for (const [name, v] of Object.entries(r)) {
    for (const [k, x] of Object.entries(v)) console.log(`${name.padEnd(9)} ${k.padEnd(9)} accueil ${x.welcomeS.toFixed(1)} s (${x.welcomeKo} Ko, ${x.welcomeReqs} requêtes) · menu ${x.menuS.toFixed(1)} s · total ${x.totalKo} Ko, ${x.totalReqs} requêtes`);
  }
  const i = process.argv.indexOf('--json');
  if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(r, null, 1) + '\n');
}
