// Service worker généré par tools/gen-sw.mjs : ne pas modifier à la main.
// Jeu hors ligne : les fichiers du jeu sont gardés en cache ; le réseau reste prioritaire
// pour récupérer les mises à jour quand il est disponible.
const CACHE = 'copytrack-25970fa8ef';
const FILES = [
  "./",
  "css/style.css",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon.svg",
  "index.html",
  "js/account.js",
  "js/audio.js",
  "js/autopilot.js",
  "js/builtinObstacles.js",
  "js/camflip.js",
  "js/carModel.js",
  "js/career.js",
  "js/cloudsave.js",
  "js/constants.js",
  "js/cosmetics.js",
  "js/daily.js",
  "js/decoData.js",
  "js/decos.js",
  "js/editor.js",
  "js/editorPick.js",
  "js/editorTools.js",
  "js/garage.js",
  "js/geo.js",
  "js/input.js",
  "js/inspector.js",
  "js/main.js",
  "js/music.js",
  "js/net/interp.js",
  "js/net/room.js",
  "js/net/signaling.js",
  "js/net/snapshot.js",
  "js/net/transport.js",
  "js/obstacleMesh.js",
  "js/obstacles.js",
  "js/online.js",
  "js/particles.js",
  "js/physics.js",
  "js/pieces.js",
  "js/profile.js",
  "js/race.js",
  "js/raceLogic.js",
  "js/remoteCar.js",
  "js/replay.js",
  "js/ribbons.js",
  "js/scenery.js",
  "js/skids.js",
  "js/storage.js",
  "js/track.js",
  "js/trackMesh.js",
  "js/tracks.js",
  "js/ui.js",
  "js/vendor/THREE_LICENSE.txt",
  "js/vendor/TransformControls.js",
  "js/vendor/three.module.min.js",
  "js/verify.js",
  "js/welcome.js",
  "manifest.webmanifest"
];

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
