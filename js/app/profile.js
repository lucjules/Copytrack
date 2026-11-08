// Profil : compte, sauvegardes, import et export de sauvegarde.
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
import { profile, exportCode, parseCode, applySave } from '../profile.js';
import { $, esc } from '../dom.js';
import { account } from '../account.js';
import { loadSettings } from '../storage.js';
import { locale } from '../i18n.js';
import { levelOf, ensureXp, LICENCES, hasLicence, masteryCount, MASTERY, LEVEL_REWARDS } from '../progression.js';
import { CATALOG } from '../cosmetics.js';
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
      <div class="prof-progress" id="prof-progress"></div>
      <div class="prof-account" id="prof-account"></div>
      <div class="prof-titles" id="prof-titles"></div>
      <p class="prof-note">Code joueur et import / export : onglet <b>Sauvegardes</b>.</p>`;
    this._renderProgressBox(body.querySelector('#prof-progress'));
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

  // Progression du pilote (E14) : niveau et expérience, licences (et ce qui manque pour la suivante), défis de maîtrise, récompenses de niveau.
  _renderProgressBox(box) {
    ensureXp(this.builtins.map((b) => b.key));
    const p = profile(), L = levelOf(p.xp), ctx = this._licenceContext();
    const pct = L.max ? 100 : Math.round((L.into / Math.max(1, L.need)) * 100);
    const next = LICENCES.find((x) => !hasLicence(x.id));
    const label = (cat, id) => ((CATALOG[cat] || []).find((x) => x.id === id) || {}).label || id;
    box.innerHTML = `<h3>Pilote</h3>
      <p class="prof-level"><b>Niveau ${L.level}</b> <span class="meta">${L.max ? 'niveau maximal' : `${L.into} / ${L.need} XP`}</span></p>
      <span class="xp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></span>
      <p class="meta">L’expérience vient des courses terminées et des objectifs : médailles, objectifs bonus, défi du jour, Académie, défis de maîtrise. Elle ne rend jamais une voiture plus rapide.</p>
      <div class="prof-licences">${LICENCES.map((x) => `<span class="licence${hasLicence(x.id) ? ' got' : ''}">🪪 <span>${esc(x.label)}</span></span>`).join('')}</div>
      ${next ? `<p class="meta">Pour la <b>${esc(next.label)}</b> :</p><ul class="lic-req">${next.req.map(([k, n, txt]) => `<li class="${(ctx[k] || 0) >= n ? 'done' : ''}">${(ctx[k] || 0) >= n ? '✓' : '·'} <span>${esc(txt)}</span> <small>(${Math.min(ctx[k] || 0, n)} / ${n})</small></li>`).join('')}</ul>` : '<p class="meta">Toutes les licences sont à toi.</p>'}
      <p><span>Défis de maîtrise : <b>${masteryCount()} / ${this.builtins.length * MASTERY.length}</b></span> <small class="meta">${MASTERY.map((m) => `${m.icon} <span>${esc(m.label)}</span>`).join(' · ')}</small></p>
      <div class="lvl-rewards meta"><span>Récompenses de niveau (garage) :</span><ul>${LEVEL_REWARDS.map(([lvl, cat, id]) => `<li class="${L.level >= lvl ? 'got' : ''}"><span>${L.level >= lvl ? '✓' : '🔒'}</span> <span>Niveau ${lvl} : ${esc(label(cat, id))}</span></li>`).join('')}</ul></div>`;
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
    const label = () => ({ idle: 'en attente', syncing: 'synchronisation…', ok: account.lastSync ? 'à jour (' + new Date(account.lastSync).toLocaleTimeString(locale()) + ')' : 'à jour', offline: 'hors ligne : reprise dès le retour du réseau', error: 'erreur : ' + account.lastError }[account.status] || '');
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
    const when = obj.t ? new Date(obj.t).toLocaleString(locale()) : '?';
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
