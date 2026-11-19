// Garde du démarrage (script classique, chargé AVANT js/main.js : il tourne même quand les modules du jeu ne se chargent pas).
//
// Pourquoi : juste après une mise en ligne, le navigateur peut garder dans son cache HTTP un ANCIEN fichier (GitHub Pages le permet 10 minutes) à côté
// des nouveaux. Un module qui demande à un autre une fonction que l'ancienne version n'avait pas (« does not provide an export named … ») fait échouer
// tout le graphe de modules : rien ne s'exécute et le jeu restait sur « Chargement… », sans un mot (0.9.65 : `headingGuided` de js/pieces.js).
// Ce qu'il fait : si le chargement des modules échoue, il recharge UNE fois les fichiers du jeu en contournant le cache (liste de sw.js), puis la page.
// Si cela ne suffit pas, ou si rien n'a démarré au bout de 30 s, il l'écrit à l'écran avec un bouton « Réessayer ». js/main.js lève
// `window.__copytrackBooted` dès qu'il s'exécute, ce qui désarme la garde (et autorise une nouvelle réparation lors d'une prochaine mise à jour).
(function () {
  'use strict';
  const KEY = 'copytrack.repair';
  const FR = !navigator.language || /^fr/i.test(navigator.language);
  const T = FR
    ? { offline: 'Hors ligne : le jeu n’a pas pu démarrer depuis sa copie sur cet appareil. Reconnecte-toi, puis réessaie.', fixing: 'Mise à jour du jeu…', failed: 'Le jeu n’a pas pu démarrer : une mise à jour est peut-être en cours de mise en ligne. Réessaie dans quelques minutes, ou recharge en vidant le cache (Ctrl + Maj + R ; sur mobile : effacer les données du site).', slow: 'Le chargement est long. Si rien ne se passe, réessaie.', retry: 'Réessayer' }
    : { offline: 'Offline: the game could not start from its copy on this device. Reconnect, then try again.', fixing: 'Updating the game…', failed: 'The game could not start: an update may still be going live. Try again in a few minutes, or reload while clearing the cache (Ctrl + Shift + R; on mobile: clear the site data).', slow: 'Loading is taking a while. If nothing happens, try again.', retry: 'Try again' };
  const store = {
    get: function () { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } },
    set: function () { try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* stockage refusé : la réparation reste possible au bouton */ } },
    clear: function () { try { sessionStorage.removeItem(KEY); } catch (e) { /* idem */ } },
  };
  let busy = false;
  const loading = document.getElementById('loading');
  const tagline0 = loading && loading.querySelector('.tagline') ? loading.querySelector('.tagline').textContent : '';

  function booted() { return !!window.__copytrackBooted; }
  function say(text, button) {
    const l = document.getElementById('loading');
    const tag = l && l.querySelector('.tagline');
    if (!tag) return;
    l.classList.remove('hidden');
    tag.textContent = text;
    tag.setAttribute('data-noi18n', '');
    if (button && !l.querySelector('.boot-retry')) {
      const b = document.createElement('button');
      b.className = 'btn primary boot-retry';
      b.type = 'button';
      b.textContent = T.retry;
      b.style.marginTop = '16px';
      b.addEventListener('click', function () { store.clear(); repair(); });
      l.appendChild(b);
    }
  }

  // Recharge chaque fichier du jeu depuis le réseau (cache: 'reload' : le cache HTTP est contourné puis mis à jour), vide les caches du service
  // worker, puis recharge la page. Une seule fois par session de navigation : un second échec s'affiche au lieu de boucler.
  function repair() {
    if (busy) return;
    // (0.12.6) Hors ligne, ne rien effacer : vider les caches du service worker détruirait la seule copie du jeu sur l'appareil, et le rechargement
    // échouerait (page d'erreur du navigateur). On le dit, avec « Réessayer » pour quand le réseau revient.
    if (navigator.onLine === false) { say(T.offline, true); return; }
    if (store.get()) { say(T.failed, true); return; }
    busy = true;
    store.set();
    say(T.fixing, false);
    let files = ['./', 'index.html', 'sw.js'];
    fetch('sw.js', { cache: 'reload' }).then(function (r) { return r.text(); }).then(function (src) {
      const m = /const FILES = (\[[\s\S]*?\]);/.exec(src);
      if (m) { try { files = files.concat(JSON.parse(m[1]).filter(function (f) { return /\.(js|css|html|webmanifest)$/.test(f); })); } catch (e) { /* liste illisible : on garde l'essentiel */ } }
    }).catch(function () { /* hors ligne : on recharge quand même */ }).then(function () {
      return Promise.all(files.map(function (f) { return fetch(f, { cache: 'reload' }).catch(function () { return null; }); }));
    }).then(function () {
      if (!window.caches) return null;
      return caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf('copytrack-') === 0; }).map(function (k) { return caches.delete(k); })); });
    }).catch(function () { return null; }).then(function () { location.reload(); });
  }

  const MODULE_FAIL = /export named|does not provide an export|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unexpected token|is not defined|SyntaxError/i;
  function onError(ev) {
    if (booted()) return;
    const msg = (ev && (ev.message || (ev.error && ev.error.message) || (ev.reason && ev.reason.message))) || '';
    const target = ev && ev.target;
    const scriptFail = target && target.tagName === 'SCRIPT';      // module introuvable (404) ou réseau coupé
    if (scriptFail || MODULE_FAIL.test(String(msg))) repair();
  }
  window.addEventListener('error', onError, true);
  window.addEventListener('unhandledrejection', onError);

  // Démarré : la garde se retire et une réparation redevient possible à la prochaine mise à jour.
  const timer = setInterval(function () {
    if (!booted()) return;
    clearInterval(timer);
    store.clear();
    const b = loading && loading.querySelector('.boot-retry');      // message « chargement long » affiché entre-temps : on le retire
    if (b) { b.remove(); loading.querySelector('.tagline').textContent = tagline0; }
    window.removeEventListener('error', onError, true);
    window.removeEventListener('unhandledrejection', onError);
  }, 250);
  // Rien après 30 s (connexion très lente, ou navigateur qui ne signale pas l'échec) : on le dit, sans recharger d'office.
  setTimeout(function () { if (!booted() && !busy) say(T.slow, true); }, 30000);
})();
