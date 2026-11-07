// Régénère sw.js : liste des fichiers à garder en cache pour jouer hors ligne.
// À lancer après avoir ajouté un fichier : node tools/gen-sw.mjs
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
async function walk(dir) {
  const out = [];
  let list = [];
  try { list = await readdir(dir, { withFileTypes: true }); } catch { return out; }   // dossier absent (ex. assets/)
  for (const e of list) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}
// Fichiers que seul le serveur exécute (vérification des temps) : inutiles hors ligne, donc hors du cache.
const SERVER_ONLY = new Set(['js/verify.js']);
const files = ['index.html', 'manifest.webmanifest'];
for (const d of ['css', 'js', 'icons', 'assets']) {
  for (const f of await walk(join(root, d))) {
    const rel = relative(root, f).split('\\').join('/');
    if (SERVER_ONLY.has(rel)) continue;
    if (/\.(js|css|png|svg|txt|mp3)$/.test(f)) files.push(rel);
  }
}
files.sort();

// ---- index.html : modulepreload des modules chargés au démarrage ---------------------------------------------------------------------
// Sans cela le navigateur découvre les ~60 modules l'un après l'autre (chacun n'est connu qu'une fois son parent analysé) : une cascade de
// requêtes. On liste donc la fermeture des import STATIQUES de js/main.js, en largeur d'abord (les import() dynamiques, comme l'éditeur,
// ne sont pas préchargés : ils ne sont chargés qu'à la demande).
function staticClosure(entry) {
  const order = [], seen = new Set([entry]);
  for (let i = 0, q = [entry]; i < q.length; i++) {
    order.push(q[i]);
    const text = readFileSync(join(root, q[i]), 'utf8');
    for (const m of text.matchAll(/^\s*(?:import|export)\b[^;]*?from\s*['"](\.[^'"]+)['"]|^\s*import\s*['"](\.[^'"]+)['"]/gm)) {
      const target = relative(root, join(root, dirname(q[i]), m[1] || m[2])).split('\\').join('/');
      if (!seen.has(target)) { seen.add(target); q.push(target); }
    }
  }
  return order;
}
const preload = staticClosure('js/main.js').map((f) => `  <link rel="modulepreload" href="${f}">`).join('\n');
{
  const indexPath = join(root, 'index.html');
  let html = readFileSync(indexPath, 'utf8');
  const re = /( {2}<!-- modulepreload:start[^\n]*-->)[\s\S]*?(\n {2}<!-- modulepreload:end -->)/;
  if (!re.test(html)) throw new Error('index.html : marqueurs modulepreload absents');
  html = html.replace(re, (_, a, b) => a + '\n' + preload + b);
  writeFileSync(indexPath, html);
}
const h = createHash('sha1');
for (const f of files) h.update(f).update(await readFile(join(root, f)));
const version = h.digest('hex').slice(0, 10);
const src = `// Service worker généré par tools/gen-sw.mjs : ne pas modifier à la main.
// Jeu hors ligne : les fichiers du jeu sont gardés en cache ; le réseau reste prioritaire
// pour récupérer les mises à jour quand il est disponible.
const CACHE = 'copytrack-${version}';
const FILES = ${JSON.stringify(['./', ...files], null, 2)};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => (k.startsWith('shardway-') || k.startsWith('copytrack-')) && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      // Seules les réponses complètes (200) se gardent : une réponse partielle (206, lecture du MP3 par morceaux) ferait échouer cache.put.
      if (res.status === 200) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
`;
await writeFile(join(root, 'sw.js'), src);
console.log(`sw.js : ${files.length} fichiers, cache ${version}`);
