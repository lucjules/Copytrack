// Nouvelle version en ligne (0.13.1) : un onglet resté ouvert ne savait jamais qu'une version plus récente était publiée, et pouvait même charger
// des fichiers des deux versions (écrans ouverts plus tard) : affichages bizarres. Le jeu relit donc js/version.js sur le réseau toutes les
// 30 minutes et au retour sur l'onglet ; si la version a changé, il propose de recharger (js/app/update.js), jamais au milieu d'une course.
// Module pur (testé sous Node : tools/test-mise-a-jour.mjs).

export const CHECK_EVERY_MS = 30 * 60 * 1000;
export const MIN_GAP_MS = 60 * 1000;      // au plus une vérification par minute (retours rapides sur l'onglet)

// La version écrite dans le texte de js/version.js, ou null.
export function parseVersion(text) {
  const m = /export const VERSION = '([^']{1,40})'/.exec(String(text || ''));
  return m ? m[1] : null;
}

// current : la version qui tourne ; fetchText(url) : Promise<string> ; onNew(version) : appelé UNE fois quand une autre version est en ligne.
// Les erreurs réseau sont silencieuses (hors ligne : rien à proposer).
export function createUpdateChecker({ current, fetchText, onNew, now = Date.now }) {
  let notified = false, last = -Infinity, busy = false;
  return {
    get notified() { return notified; },
    async check(force = false) {
      if (notified || busy || (!force && now() - last < MIN_GAP_MS)) return false;
      busy = true; last = now();
      try {
        const v = parseVersion(await fetchText('js/version.js?u=' + Math.floor(now() / 1000)));
        if (v && v !== current) { notified = true; onNew(v); return true; }
      } catch { /* hors ligne, serveur indisponible : on réessaiera */ } finally { busy = false; }
      return false;
    },
  };
}
