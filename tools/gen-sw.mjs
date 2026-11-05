// Régénère sw.js : liste des fichiers à garder en cache pour jouer hors ligne.
// À lancer après avoir ajouté un fichier : node tools/gen-sw.mjs
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}
const files = ['index.html', 'manifest.webmanifest'];
for (const d of ['css', 'js', 'icons']) {
  for (const f of await walk(join(root, d))) {
    if (/\.(js|css|png|svg|txt)$/.test(f)) files.push(relative(root, f).split('\\').join('/'));
  }
}
files.sort();
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
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
`;
await writeFile(join(root, 'sw.js'), src);
console.log(`sw.js : ${files.length} fichiers, cache ${version}`);
