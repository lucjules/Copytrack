// Profil : compte, sauvegardes, import et export de sauvegarde.
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
import { profile, exportCode, parseCode, applySave } from '../profile.js';
import { $, esc } from '../dom.js';
import { account } from '../account.js';
import { loadSettings, getRecord, medalTime, formatTime } from '../storage.js';
import { medalFor } from '../medals.js';
import { medalIcon } from '../ui.js';
import { CHAPTERS, CHAPTER_SIZE, UNLOCK_MEDALS, goalDone, chapterUnlocked, careerSummary, prerequisiteOf } from '../career.js';
import { locale } from '../i18n.js';
import { levelOf, ensureXp, LICENCES, hasLicence, masteryCount, MASTERY, LEVEL_REWARDS } from '../progression.js';
import { CATALOG } from '../cosmetics.js';
import { online } from '../online.js';
// Un seul écran à onglets sert trois entrées de l'accueil : Profil, Progression et Paramètres. Chaque entrée a son titre et ses onglets ; l'onglet courant
// (this.profileTab) dit laquelle est ouverte. Les anciens noms d'onglet ('options') mènent au premier onglet des paramètres liés à l'image.
export const HUBS = {
  profile: { title: 'Profil', tabs: [['account', 'Compte'], ['friends', 'Amis'], ['saves', 'Sauvegardes']] },
  progress: { title: 'Progression', tabs: [['records', 'Records et médailles'], ['level', 'Niveau et licences'], ['stats', 'Statistiques'], ['unlocks', 'Déblocages']] },
  settings: { title: 'Paramètres', tabs: [['audio', 'Audio'], ['gfx', 'Graphismes'], ['access', 'Accessibilité'], ['game', 'Jeu'], ['ui', 'Interface'], ['controls', 'Commandes']] },
};
export const TAB_HUB = Object.fromEntries(Object.entries(HUBS).flatMap(([hub, h]) => h.tabs.map(([t]) => [t, hub])));
export const LEGACY_TABS = { options: 'gfx' };

export const profileMethods = {
  async _renderProfile() {
    const tab = TAB_HUB[LEGACY_TABS[this.profileTab] || this.profileTab] ? (LEGACY_TABS[this.profileTab] || this.profileTab) : 'account';
    this.profileTab = tab;
    const hub = HUBS[TAB_HUB[tab]];
    $('prof-heading').textContent = hub.title;
    const tabs = $('prof-tabs');
    tabs.innerHTML = hub.tabs.map(([id, label]) => `<button class="tab${id === tab ? ' on' : ''}" role="tab" aria-selected="${id === tab}" data-ptab="${id}">${esc(label)}</button>`).join('');
    document.querySelectorAll('.prof-panel').forEach((el) => el.classList.toggle('hidden', el.dataset.ppanel !== tab));
    if (tab === 'account') { this._renderOptions(); this._renderProfileAccount(); }       // (_renderOptions remplit aussi le champ du pseudonyme)
    else if (tab === 'friends') this._renderFriendsBox($('friends-body'));
    else if (tab === 'saves') this._renderSaves();
    else if (tab === 'level') this._renderProgressBox($('prog-level'));
    else if (tab === 'records') this._renderRecords($('prog-records'));
    else if (tab === 'stats') this._renderStats($('prog-stats'));
    else if (tab === 'unlocks') this._renderUnlocks($('prog-unlocks'));
    else if (tab === 'controls') { this._renderOptions(); this._renderControls(); }
    else this._renderOptions();                 // audio, graphismes, accessibilité, jeu, interface : les réglages sont remplis depuis les préférences
  },

  _renderProfileAccount() {
    const p = profile();
    const body = $('profile-body');
    body.innerHTML = `
      <div><div class="meta">Identifiant joueur</div><div class="prof-id">${esc(p.id)}</div></div>
      <div class="prof-account" id="prof-account"></div>
      <p class="prof-note">Records, médailles, niveau et titres : menu <b>Progression</b>. Code joueur, import et export : onglet <b>Sauvegardes</b>.</p>`;
    this._renderAccountBox(body.querySelector('#prof-account'));
  },

  // Progression > Statistiques : les compteurs du profil, rien d'autre.
  _renderStats(box) {
    const p = profile(), st = p.stats || {};
    const gd = this.builtins.filter((b) => goalDone(b.key + '#goal')).length;
    const row = (label, value) => `<span>${esc(label)}</span><b>${value}</b>`;
    box.innerHTML = `<h3 class="opt-h">Statistiques</h3>
      <div class="prof-grid">
        ${row('Courses terminées', st.races | 0)}
        ${row('Pièces', '◆ ' + (p.coins | 0))}
        ${row('Pièces gagnées au total', st.earned | 0)}
        ${row('Médailles obtenues', Object.keys(p.medals || {}).length)}
        ${row('Objectifs bonus réussis', `${gd} / ${this.builtins.length}`)}
        ${row('Turbos pris', st.turbos | 0)}
        ${row('Jours de défi du jour', (p.dailyDays || []).length)}
        ${row('Meilleure série de jours', Math.max(p.dailyBest | 0, 0))}
        ${row('Mutations du jour terminées', (p.mutDays || []).length)}
        ${row('Leçons de l’Académie', Object.keys(p.academy || {}).length)}
        ${row('Collections complétées', Object.keys(p.collections || {}).length)}
      </div>`;
  },

  // Progression > Records et médailles : bilan de la carrière puis chaque circuit officiel, chapitre par chapitre ; une ligne ouvre la fiche du circuit.
  _renderRecords(box) {
    const medalOf = (i) => { const b = this.builtins[i]; const rec = getRecord(b.key); return rec ? medalFor(medalTime(rec), b.def.medals) : null; };
    const ids = this.builtins.map((b, i) => { const m = medalOf(i); return m ? m.id : null; });
    const gd = this.builtins.filter((b) => goalDone(b.key + '#goal')).length;
    const sm = careerSummary(ids, gd);
    let html = `<div class="career-summary${sm.complete ? ' complete' : sm.finished ? ' finished' : ''}"><div class="cs-main"><b>${sm.pct} %</b><span>de la carrière</span></div>
      <div class="cs-bar"><i style="width:${sm.pct}%"></i></div>
      <div class="cs-stats">${sm.medals} / ${sm.total} médailles · ${sm.crystal} cristal · ${sm.goals} / ${sm.total} objectifs bonus</div></div>`;
    for (let c = 0; c * CHAPTER_SIZE < this.builtins.length; c++) {
      const idx = this.builtins.map((b, i) => i).filter((i) => Math.floor(i / CHAPTER_SIZE) === c);
      const ch = CHAPTERS[c];
      html += `<h3 class="opt-h">Chapitre ${c + 1}${ch ? ' · ' + esc(ch.name) : ''}</h3><ul class="rec-list">`;
      for (const i of idx) {
        const b = this.builtins[i], rec = getRecord(b.key), m = medalOf(i);
        html += `<li><button class="btn rec-row" data-rec="${i}"><span class="rec-name">${esc(b.def.name)}</span>${medalIcon(m)}<b class="rec-time">${rec ? formatTime(rec.time) : '—'}</b>${goalDone(b.key + '#goal') ? '<span class="rec-goal" title="Objectif bonus réussi">★</span>' : '<span class="rec-goal off">☆</span>'}</button></li>`;
      }
      html += '</ul>';
    }
    box.innerHTML = html;
    for (const b of box.querySelectorAll('[data-rec]')) b.onclick = () => { this.audio.click(); this.openBuiltinHub(+b.dataset.rec, 'profile'); };
  },

  // Progression > Déblocages : chapitres de la carrière (ouverts ou à gagner), titres, récompenses de niveau.
  _renderUnlocks(box) {
    const medalOf = (i) => { const b = this.builtins[i]; const rec = getRecord(b.key); return rec ? medalFor(medalTime(rec), b.def.medals) : null; };
    const total = this.builtins.length, chapters = Math.ceil(total / CHAPTER_SIZE);
    let html = '<h3 class="opt-h">Chapitres de la carrière</h3><ul class="chap-list">';
    for (let c = 0; c < chapters; c++) {
      const open = chapterUnlocked(c, medalOf, total), ch = CHAPTERS[c];
      html += `<li class="${open ? 'got' : ''}"><b>${open ? '🔓' : '🔒'} Chapitre ${c + 1}${ch ? ' · ' + esc(ch.name) : ''}</b>${open ? '' : `<small>Gagne ${UNLOCK_MEDALS} médailles au chapitre ${prerequisiteOf(c) + 1}.</small>`}</li>`;
    }
    html += '</ul><div id="unl-titles"></div><div id="unl-rewards" class="lvl-rewards meta"></div>';
    box.innerHTML = html;
    this._renderTitlesBox(box.querySelector('#unl-titles'));
    const L = levelOf(profile().xp), label = (cat, id) => ((CATALOG[cat] || []).find((x) => x.id === id) || {}).label || id;
    box.querySelector('#unl-rewards').innerHTML = `<span>Récompenses de niveau (garage) :</span><ul>${LEVEL_REWARDS.map(([lvl, cat, id]) => `<li class="${L.level >= lvl ? 'got' : ''}"><span>${L.level >= lvl ? '✓' : '🔒'}</span> <span>Niveau ${lvl} : ${esc(label(cat, id))}</span></li>`).join('')}</ul>`;
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
      <input type="file" id="prof-file" accept=".shw,.txt" class="hidden">
      <h3 class="opt-h">Zone sensible</h3>
      <div class="opt-row"><span>Effacer tous les records de cet appareil</span><button class="btn subtle" data-action="reset-records">Effacer les records</button></div>`;
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
    box.innerHTML = `<h3>Pilote</h3>
      <p class="prof-level"><b>Niveau ${L.level}</b> <span class="meta">${L.max ? 'niveau maximal' : `${L.into} / ${L.need} XP`}</span></p>
      <span class="xp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></span>
      <p class="meta">L’expérience vient des courses terminées et des objectifs : médailles, objectifs bonus, défi du jour, Académie, défis de maîtrise. Elle ne rend jamais une voiture plus rapide.</p>
      <div class="prof-licences">${LICENCES.map((x) => `<span class="licence${hasLicence(x.id) ? ' got' : ''}">🪪 <span>${esc(x.label)}</span></span>`).join('')}</div>
      ${next ? `<p class="meta">Pour la <b>${esc(next.label)}</b> :</p><ul class="lic-req">${next.req.map(([k, n, txt]) => `<li class="${(ctx[k] || 0) >= n ? 'done' : ''}">${(ctx[k] || 0) >= n ? '✓' : '·'} <span>${esc(txt)}</span> <small>(${Math.min(ctx[k] || 0, n)} / ${n})</small></li>`).join('')}</ul>` : '<p class="meta">Toutes les licences sont à toi.</p>'}
      <p><span>Défis de maîtrise : <b>${masteryCount()} / ${this.builtins.length * MASTERY.length}</b></span> <small class="meta">${MASTERY.map((m) => `${m.icon} <span>${esc(m.label)}</span>`).join(' · ')}</small></p>`;
  },

  // Amis (E15, supabase/etape10-social.sql) : comptes seulement. Demandes reçues (accepter, refuser), envoyées (annuler), amis (retirer), ajout par pseudo.
  async _renderFriendsBox(box) {
    if (!box) return;
    if (this.identity.kind !== 'account') {
      box.innerHTML = '<h3>Amis</h3><p class="prof-note">Un compte est nécessaire pour avoir des amis : leurs temps apparaissent dans l’onglet « Amis » des classements.</p>';
      return;
    }
    box.innerHTML = '<h3>Amis</h3><p class="meta">Chargement…</p>';
    let list;
    try { list = await online.friends(); } catch (e) { box.innerHTML = `<h3>Amis</h3><p class="prof-note">Amis indisponibles : ${esc(e.message)}</p>`; return; }
    const inc = list.filter((f) => f.incoming), out = list.filter((f) => f.status === 'pending' && !f.incoming), ok = list.filter((f) => f.status === 'accepted');
    const row = (f, btns) => `<li><span class="lb-name">${esc(f.name)}</span>${btns}</li>`;
    box.innerHTML = `<h3>Amis</h3>
      <form class="friend-add row"><input type="text" maxlength="24" placeholder="Pseudo d’un compte" aria-label="Pseudo d’un compte" required><button class="btn primary" type="submit">Demander en ami</button></form>
      <p class="mp-err friend-err" role="alert"></p>
      ${inc.length ? `<p class="meta">Demandes reçues</p><ul class="friend-list">${inc.map((f) => row(f, `<button class="btn small primary" data-fa="yes" data-id="${f.id}">Accepter</button><button class="btn small" data-fa="no" data-id="${f.id}">Refuser</button>`)).join('')}</ul>` : ''}
      ${ok.length ? `<p class="meta">${ok.length} ami${ok.length > 1 ? 's' : ''}</p><ul class="friend-list">${ok.map((f) => row(f, `<button class="btn small subtle" data-fa="rm" data-id="${f.id}" title="Retirer de mes amis">✕</button>`)).join('')}</ul>` : '<p class="prof-note">Pas encore d’amis : demande un pilote par son pseudo.</p>'}
      ${out.length ? `<p class="meta">Demandes envoyées</p><ul class="friend-list">${out.map((f) => row(f, `<button class="btn small subtle" data-fa="rm" data-id="${f.id}">Annuler</button>`)).join('')}</ul>` : ''}`;
    const err = box.querySelector('.friend-err');
    box.querySelector('.friend-add').onsubmit = async (e) => {
      e.preventDefault();
      const input = box.querySelector('.friend-add input');
      try {
        const r = await online.friendRequest(input.value, this.settings.playerName);
        this.ui.flash(r === 'accepted' ? 'Vous êtes amis !' : r === 'already' ? 'Déjà dans ta liste.' : 'Demande envoyée.', 2);
        this._renderFriendsBox(box);
      } catch (ex) { err.textContent = ex.message; }
    };
    for (const b of box.querySelectorAll('[data-fa]')) b.onclick = async () => {
      this.audio.click();
      try {
        if (b.dataset.fa === 'rm') await online.friendRemove(b.dataset.id);
        else await online.friendRespond(b.dataset.id, b.dataset.fa === 'yes');
        this._renderFriendsBox(box);
      } catch (ex) { err.textContent = ex.message; }
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
