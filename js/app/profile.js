// Profil : compte, sauvegardes, import et export de sauvegarde.
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
import { profile, exportCode, parseCode, applySave } from '../profile.js';
import { $, esc } from '../dom.js';
import { account } from '../account.js';
import { loadSettings } from '../storage.js';
export const profileMethods = {
  async _renderProfile() {
    const tab = ['account', 'saves', 'options', 'controls'].includes(this.profileTab) ? this.profileTab : 'account';
    this.profileTab = tab;
    document.querySelectorAll('#prof-tabs .tab').forEach((t) => { const on = t.dataset.ptab === tab; t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); });
    document.querySelectorAll('.prof-panel').forEach((el) => el.classList.toggle('hidden', el.dataset.ppanel !== tab));
    if (tab === 'account') this._renderProfileAccount();
    else if (tab === 'saves') this._renderSaves();
    else if (tab === 'options') this._renderOptions();
    else this._renderControls();
  },

  _renderProfileAccount() {
    const p = profile();
    const body = $('profile-body');
    const medals = Object.values(p.medals);
    body.innerHTML = `
      <div><div class="meta">Identifiant joueur</div><div class="prof-id">${esc(p.id)}</div></div>
      <div class="prof-grid">
        <span>Pièces</span><b>◆ ${p.coins}</b>
        <span>Courses terminées</span><b>${p.stats.races}</b>
        <span>Pièces gagnées au total</span><b>${p.stats.earned}</b>
        <span>Médailles obtenues</span><b>${medals.length}</b>
      </div>
      <div class="prof-account" id="prof-account"></div>
      <div class="prof-titles" id="prof-titles"></div>
      <p class="prof-note">Code joueur et import / export : onglet <b>Sauvegardes</b>.</p>`;
    this._renderAccountBox(body.querySelector('#prof-account'));
    this._renderTitlesBox(body.querySelector('#prof-titles'));
  },

  _renderSaves() {
    const p = profile();
    const body = $('saves-body');
    body.innerHTML = `
      <p class="prof-note">Ton <b>code joueur</b> contient toute ta progression : une sauvegarde manuelle. Avec un compte, elle se synchronise toute seule.</p>
      <div class="row">
        <button class="btn primary" data-p="copy">Copier mon code joueur</button>
        <button class="btn" data-p="download">Télécharger (.shw)</button>
        <button class="btn" data-p="paste">Importer un code</button>
        <button class="btn" data-p="file">Importer un fichier</button>
      </div>
      <input type="file" id="prof-file" accept=".shw,.txt" class="hidden">`;
    body.querySelector('[data-p="copy"]').onclick = async () => {
      const code = await exportCode();
      try { await navigator.clipboard.writeText(code); this.ui.flash(`Code copié (${Math.round(code.length / 1024)} Ko)`); }
      catch { this._showCode(code); }
    };
    body.querySelector('[data-p="download"]').onclick = async () => {
      const code = await exportCode();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
      a.download = `copytrack-${p.id}.shw`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    body.querySelector('[data-p="paste"]').onclick = () => this._importSaveModal();
    const file = body.querySelector('#prof-file');
    body.querySelector('[data-p="file"]').onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files[0];
      if (f) this._askImport(await f.text());
    };
  },

  // Bloc « compte » de l'écran Profil : état de la synchronisation, déconnexion, suppression.
  _renderAccountBox(box) {
    if (this.identity.kind !== 'account') {
      box.innerHTML = `<div class="meta">Mode invité · <b>${esc(this.identity.username)}</b></div>
        <p class="prof-note">Progression locale. Un compte la suit partout.</p>
        <div class="row"><button class="btn primary" data-a="acct">Créer un compte / Se connecter</button></div>`;
      box.querySelector('[data-a="acct"]').onclick = () => { account.leaveGuest(); location.reload(); };
      return;
    }
    const label = () => ({ idle: 'en attente', syncing: 'synchronisation…', ok: account.lastSync ? 'à jour (' + new Date(account.lastSync).toLocaleTimeString('fr-FR') + ')' : 'à jour', offline: 'hors ligne : reprise dès le retour du réseau', error: 'erreur : ' + account.lastError }[account.status] || '');
    box.innerHTML = `<div class="meta">Compte · <b>${esc(account.username)}</b> · sauvegarde cloud <span id="acct-st"></span></div>
      <div class="row">
        <button class="btn" data-a="sync">Synchroniser maintenant</button>
        <button class="btn" data-a="out">Se déconnecter</button>
        <button class="btn danger" data-a="del">Supprimer le compte</button>
      </div>`;
    const st = box.querySelector('#acct-st');
    const paint = () => { st.textContent = label(); };
    paint();
    box.querySelector('[data-a="sync"]').onclick = () => {
      paint(); st.textContent = 'synchronisation…';
      account.sync().then(() => { paint(); this.ui.flash('Sauvegarde synchronisée'); }, (e) => { paint(); this.ui.flash(e.message); });
    };
    box.querySelector('[data-a="out"]').onclick = async () => {
      this.ui.flash('Déconnexion…');
      await account.signOut();
      location.reload();
    };
    box.querySelector('[data-a="del"]').onclick = () => this.ui.modal({
      title: 'Supprimer le compte ?',
      body: `<p>Le compte <b>${esc(account.username)}</b>, sa sauvegarde, tes circuits publiés et tes temps en ligne seront effacés. Irréversible.</p>`,
      actions: [
        { label: 'Supprimer définitivement', danger: true, onClick: () => { account.deleteAccount().then(() => location.reload(), (e) => this.ui.flash(e.message)); } },
        { label: 'Annuler', primary: true },
      ],
    });
  },

  _showCode(code) {
    const ta = document.createElement('textarea');
    ta.readOnly = true; ta.value = code;
    this.ui.modal({ title: 'Ton code joueur', body: ta, actions: [{ label: 'Fermer', primary: true }] });
    setTimeout(() => ta.select(), 50);
  },

  _importSaveModal() {
    const ta = document.createElement('textarea');
    ta.placeholder = 'SHWP1:…';
    const wrap = document.createElement('div');
    wrap.innerHTML = '<p>Colle ici un code joueur Copytrack.</p>';
    wrap.appendChild(ta);
    this.ui.modal({ title: 'Importer une sauvegarde', body: wrap, actions: [
      { label: 'Continuer', primary: true, onClick: () => { const v = ta.value; setTimeout(() => this._askImport(v), 50); } },
      { label: 'Annuler' },
    ] });
    setTimeout(() => ta.focus(), 50);
  },

  async _askImport(text) {
    let obj;
    try { obj = await parseCode(text); } catch (e) { this.ui.flash(e.message); return; }
    const when = obj.t ? new Date(obj.t).toLocaleString('fr-FR') : '?';
    this.ui.modal({
      title: 'Restaurer cette sauvegarde ?',
      body: `<p>Joueur <b>${esc(obj.id || '?')}</b>, du ${esc(when)}.</p><p><b>Fusionner</b> : meilleurs records, circuits réunis. <b>Remplacer</b> : efface tes données.</p>`,
      actions: [
        { label: 'Fusionner', primary: true, onClick: () => { applySave(obj, 'merge'); this._afterImport(); } },
        { label: 'Remplacer', danger: true, onClick: () => { applySave(obj, 'replace'); this._afterImport(); } },
        { label: 'Annuler' },
      ],
    });
  },

  _afterImport() {
    this.settings = loadSettings();
    this.settings.playerName = this.identity.username;   // un code joueur ne change pas le pseudo du joueur connecté
    this.saveSettings();
    if (this.identity.kind === 'account') account.scheduleSync(500);
    this.input.setBindings(this.settings.keys, this.settings.pad);
    this.audio.setVolume(this.settings.volume);
    this._applyQuality();
    this.ui.flash('Sauvegarde restaurée !');
    this.profileTab = 'saves';
    this.showMenu('profile');
  },
};
