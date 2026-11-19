// Pages légales dans le jeu (0.12.4) : confidentialité, mentions légales, règles de la communauté, crédits et licences (textes : js/legal.js), et export des
// données du joueur (js/dataExport.js). Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
import { LEGAL_IDS, legalPage } from '../legal.js';
import { buildExport } from '../dataExport.js';
import { getLang } from '../i18n.js';
import { dumpAll } from '../storage.js';
import { online } from '../online.js';
import { GAME_NAME, VERSION, PHYS_VER, FILE_PREFIX } from '../version.js';

export const legalMethods = {
  // Une page légale dans une fenêtre, avec des onglets vers les trois autres. Le texte est déjà dans la langue du joueur (il ne passe pas par le dictionnaire).
  showLegal(id = 'confidentialite') {
    const lang = getLang(), page = legalPage(id, lang);
    const body = document.createElement('div');
    body.className = 'legal-page';
    body.innerHTML = `<div class="row legal-tabs" role="group">${LEGAL_IDS.map((k) => `<button type="button" class="btn small${k === page.id ? ' primary' : ''}" data-legal="${k}" aria-pressed="${k === page.id}">${legalPage(k, lang).title}</button>`).join('')}</div>
      <div class="legal-text">${page.html}</div>`;
    for (const b of body.querySelectorAll('[data-legal]')) b.onclick = () => { this.audio.click(); this.showLegal(b.dataset.legal); };
    this.ui.modal({ title: page.title, body, wide: true, actions: [{ label: 'Fermer', primary: true }] });
  },

  // Profil › Sauvegardes › Exporter mes données : un fichier JSON (appareil + serveur). Le serveur n'est lu que si une session en ligne existe déjà :
  // l'export n'en crée jamais une (un invité qui n'a jamais joué en ligne n'a rien sur le serveur).
  async exportMyData() {
    this.ui.flash('Préparation de l’export…', 2);
    const uid = online.session && online.session.access_token ? online.uid : null;
    const data = await buildExport({
      meta: { game: GAME_NAME, version: VERSION, physVer: PHYS_VER, identity: { kind: this.identity.kind, username: this.identity.username } },
      local: dumpAll({ shareable: true }), uid, get: (path) => online.rest(path),
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `${FILE_PREFIX}-donnees-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.ui.flash(data.server && data.server.status === 'ok' ? 'Export prêt : données de l’appareil et du serveur.' : 'Export prêt : données de l’appareil (rien sur le serveur depuis cet appareil).', 3);
  },
};
