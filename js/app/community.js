// Communauté : partage, classements en ligne, publication, import de circuits et de fantômes, aide.
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
import { medalIcon } from '../ui.js';
import { $, esc } from '../dom.js';
import { MEDALS, medalFor } from '../medals.js';
import { Track } from '../track.js';
import { PHYS_VER } from '../version.js';
import { thumbnail } from '../editorTools.js';
import { online } from '../online.js';
import { encodeGhost, decodeGhost, ghostLink, GHOST_LINK_MAX } from '../replay.js';
import { getRecord, saveMyTrack, newId, formatTime, setImportedGhost } from '../storage.js';
export const communityMethods = {
  shareGhost() {
    const s = this.session;
    if (!s || !s.trackKey) return;
    const rec = getRecord(s.trackKey);
    if (!rec || !rec.inputs || rec.pv !== PHYS_VER) { this.ui.flash('Pas encore de course enregistrée avec cette version.'); return; }
    const code = encodeGhost({ trackKey: s.trackKey, time: rec.time, name: this.settings.playerName, inputs: rec.inputs });
    const link = ghostLink(location.href, code);
    const long = link.length > GHOST_LINK_MAX;
    const copy = (txt, msg) => { if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => this.ui.flash(msg), () => this.ui.flash('Copie impossible : sélectionne le texte.')); else this.ui.flash('Copie impossible : sélectionne le texte.'); return false; };
    this.ui.modal({
      title: 'Partager mon fantôme',
      body: `<p>Un ami qui ouvre le <b>lien</b> (ou colle le code dans « Importer ») court contre ton temps de ${formatTime(rec.time)}.</p>
        ${long ? '<p class="meta">⚠ Ce lien est long : certaines messageries le coupent. Préfère le code.</p>' : ''}
        <textarea class="code" readonly rows="4">${esc(code)}</textarea>`,
      actions: [
        { label: 'Copier le lien', primary: !long, onClick: () => copy(link, 'Lien copié !') },
        { label: 'Copier le code', primary: long, onClick: () => copy(code, 'Code copié !') },
        { label: 'Fermer' },
      ],
    });
  },

  // Un lien « …#g=SHG1… » ouvre ce défi : fantôme importé, puis course contre lui (circuits intégrés et défi du jour ; un circuit de joueur doit déjà être chez toi).
  openGhostLink(ghost) {
    const b = this.builtins.find((x) => x.key === ghost.trackKey);
    const daily = ghost.trackKey.startsWith('daily-');
    if (ghost.v !== PHYS_VER) { this.ui.flash('Ce fantôme vient d\'une autre version du jeu : recharge la page (ou celle de ton ami).', 5); return; }
    const where = b ? `« ${b.def.name} »` : daily ? 'le défi du jour' : 'un circuit de joueur';
    this.ui.modal({
      title: 'Défi partagé',
      body: `<p><b>${esc(ghost.name)}</b> t'envoie son fantôme : <b>${formatTime(ghost.time)}</b> sur ${esc(where)}. Saurais-tu le battre ?</p>`
        + (b || daily ? '' : '<p class="meta">Ce circuit n\'est pas intégré au jeu : le fantôme est enregistré, il apparaîtra quand tu joueras ce circuit.</p>'),
      actions: [
        ...(b || daily ? [{ label: 'Courir contre lui', primary: true, onClick: () => { setImportedGhost(ghost.trackKey, ghost); setTimeout(() => (b ? this.playBuiltin(this.builtins.indexOf(b)) : this.playDaily()), 0); return true; } }] : [{ label: 'Garder le fantôme', primary: true, onClick: () => { setImportedGhost(ghost.trackKey, ghost); this.ui.flash('Fantôme enregistré.'); return true; } }]),
        { label: 'Annuler' },
      ],
    });
  },

  importGhostCode(code) {
    try {
      const g = decodeGhost(code);
      if (g.v !== PHYS_VER) { this.ui.flash('Ce fantôme vient d\'une autre version du jeu.'); return true; }
      setImportedGhost(g.trackKey, g);
      const b = this.builtins.find((x) => x.key === g.trackKey);
      this.ui.flash(`Fantôme de ${g.name} (${formatTime(g.time)}) importé${b ? ` pour « ${b.def.name} »` : ''}. Il apparaîtra en violet.`, 3.5);
      return true;
    } catch (e) { this.ui.flash(e.message); return true; }
  },

  shareModal(code, name, track = null) {
    let tr = track;
    if (!tr) { try { tr = Track.decode(code); } catch { tr = null; } }
    const verified = !!(tr && tr.verified);
    const url = location.href.split('#')[0] + '#t=' + encodeURIComponent(code);
    const ta = document.createElement('textarea');
    ta.readOnly = true;
    ta.value = code;
    const wrap = document.createElement('div');
    wrap.innerHTML = verified
      ? `<p>✔ Vérifié (${formatTime(tr.vt)}) : médailles déduites de ton temps. Copie le code ou le lien de « ${esc(name)} ».</p>`
      : `<p>⚠ <b>Non vérifié</b> : termine-le une fois pour fixer les médailles. Partageable, mais sans médailles ni pièces.</p>`;
    wrap.appendChild(ta);
    const copy = (txt, msg) => {
      const done = () => this.ui.flash(msg);
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, () => { ta.select(); document.execCommand('copy'); done(); });
      else { ta.select(); document.execCommand('copy'); done(); }
      return false;
    };
    const actions = [];
    if (!verified && this.session && this.session.kind === 'editor') actions.push({ label: '✔ Vérifier d’abord', primary: true, onClick: () => { this.session.verify(); } });
    if (verified && tr) actions.push({ label: '🌐 Publier dans la communauté', primary: true, onClick: () => { this.publishTrack(tr); return true; } });
    actions.push({ label: 'Copier le code', onClick: () => copy(code, 'Code copié !') });
    actions.push({ label: 'Copier le lien', onClick: () => copy(url, 'Lien copié !') });
    actions.push({ label: 'Fermer' });
    this.ui.modal({ title: 'Partager le circuit', body: wrap, actions });
  },

  async leaderboardModal(trackKey, name, track = null) {
    const body = document.createElement('div');
    body.innerHTML = '<p class="meta">Chargement du classement…</p>';
    this.ui.modal({ title: `🏆 ${name}`, body, actions: [{ label: 'Fermer', primary: true }] });
    const render = async () => {
      let lb;
      try { lb = await online.leaderboard(trackKey, PHYS_VER, 10); } catch (e) { body.innerHTML = `<p>Classement indisponible : ${esc(e.message)}</p>`; return; }
      const rec = getRecord(trackKey);
      const canSend = rec && rec.inputs && rec.pv === PHYS_VER && (!lb.me || rec.time < lb.me.time - 1e-6) && this.settings.onlineScores !== false;
      const rows = lb.top.map((r, i) => `<li class="${r.player === online.uid ? 'me' : ''}"><b>${i + 1}</b><span>${esc((r.players && r.players.name) || '—')}</span><i>${formatTime(r.time)}</i>${r.has_ghost && i < 10 ? `<button class="rival-btn" data-rank="${i + 1}" title="Affronter son fantôme" aria-label="Affronter le fantôme n° ${i + 1}">👻</button>` : '<span class="rival-none"></span>'}</li>`).join('');
      const anyGhost = lb.top.some((r) => r.has_ghost);
      body.innerHTML = `${lb.top.length ? `<ol class="board">${rows}</ol>` : '<p>Aucun temps pour l’instant : sois le premier !</p>'}
        ${anyGhost ? '<p class="meta">👻 : affronte le fantôme d’un des dix premiers (sa course rejouée par le serveur ; seulement ses positions, jamais ses commandes).</p>' : ''}
        <p class="mp-err" id="lb-err" role="alert"></p>
        <p class="meta">${lb.total} pilote${lb.total > 1 ? 's' : ''} classé${lb.total > 1 ? 's' : ''}${lb.me ? ` · ta place : <b>${lb.me.rank}${lb.me.rank === 1 ? 'er' : 'e'}</b> (${formatTime(lb.me.time)})` : ''}.
        Chaque temps est vérifié : le serveur rejoue la course avant de l’accepter.</p>
        ${canSend ? `<button class="btn primary" id="lb-send">Envoyer mon record (${formatTime(rec.time)})</button>` : ''}`;
      for (const b of body.querySelectorAll('.rival-btn')) b.onclick = async () => {
        const err = body.querySelector('#lb-err');
        b.disabled = true; err.textContent = '';
        try {
          const g = await online.ghost(trackKey, +b.dataset.rank, PHYS_VER);
          if (!g) { err.textContent = 'Pas de fantôme pour ce temps (record d’avant cette fonction : son auteur doit le renvoyer).'; b.disabled = false; return; }
          this.ui.closeModal();
          this.raceWithRivals(trackKey, track, [g]);
        } catch (e) { err.textContent = e.message || 'Fantôme indisponible.'; b.disabled = false; }
      };
      const send = body.querySelector('#lb-send');
      if (send) send.onclick = async () => {
        send.disabled = true; send.textContent = 'Vérification…';
        try {
          await online.submitScore({ trackKey, code: trackKey.startsWith('u-') && track ? track.encode() : '', inputs: rec.inputs, time: rec.time, physVer: PHYS_VER }, this.settings.playerName);
          render();
        } catch (e) { send.textContent = e.message; }
      };
    };
    render();
  },

  // Lance (ou relance) la course d'un circuit avec des fantômes rivaux : ceux du haut d'un classement en ligne.
  raceWithRivals(trackKey, track, rivals) {
    const s = this.session;
    if (s && s.trackKey === trackKey && s.setRivals && !s.replay && !s.multi && s.kind !== 'editor') { s.setRivals(rivals); s.restart(); this.ui.hideOverlay('finish'); return; }
    if (trackKey.startsWith('b-')) {
      const i = this.builtins.findIndex((b) => b.key === trackKey);
      if (i < 0) { this.ui.flash('Circuit introuvable.'); return; }
      this.playBuiltin(i);
    } else if (trackKey.startsWith('daily-')) this.playDaily();
    else if (track) this.playTrack(track, { trackKey: track.userKey, userMap: true, medals: track.derivedMedals, difficulty: 2, seed: track.name });
    else { this.ui.flash('Ouvre d’abord le circuit pour affronter ce fantôme.'); return; }
    if (this.session && this.session.setRivals) this.session.setRivals(rivals);
  },

  // ---- Communauté (circuits publiés en ligne) ----------------------------------
  // Publication : c'est ici (et seulement ici) qu'on choisit le nom et la description du circuit.
  publishTrack(track) {
    if (!track.verified) { this.ui.flash('Vérifie d’abord ton circuit (« ✔ Vérifier » dans l’éditeur) pour pouvoir le publier.'); return Promise.resolve(false); }
    return new Promise((resolve) => {
      const f = document.createElement('div');
      f.className = 'form';
      f.innerHTML = `<label>Nom<input id="pub-name" maxlength="40" spellcheck="false" autocomplete="off"></label>
        <label class="col">Description<textarea id="pub-desc" maxlength="200" rows="3" placeholder="Ce qui rend ton circuit unique (200 caractères au plus)"></textarea></label>
        <p class="meta">Nom et description modifiables après publication.</p>
        <p class="mp-err" id="pub-err" role="alert"></p>`;
      const name = f.querySelector('#pub-name'), desc = f.querySelector('#pub-desc'), err = f.querySelector('#pub-err');
      name.value = track.name && track.name !== 'Mon circuit' ? track.name : '';
      desc.value = track.desc || '';
      // Différé : la fenêtre d'où l'on vient se referme juste après ce clic et ne doit pas fermer celle-ci.
      setTimeout(() => this.ui.modal({
        title: 'Publier dans la communauté', body: f,
        actions: [
          { label: 'Annuler', onClick: () => { resolve(false); return true; } },
          { label: '🌐 Publier', primary: true, onClick: () => {
            const n = name.value.trim().slice(0, 40);
            if (!n) { err.textContent = 'Donne un nom à ton circuit.'; name.focus(); return false; }
            track.name = n;
            track.desc = desc.value.replace(/\s+/g, ' ').trim().slice(0, 200);
            this._doPublish(track).then(() => resolve(true));
            return true;
          } },
        ],
      }), 60);
      setTimeout(() => name.focus(), 120);
    });
  },

  async _doPublish(track) {
    this.ui.flash('Publication en cours…', 6);
    try {
      await online.publish(track, this.settings.playerName);
      this.ui.flash(`« ${track.name} » est publié ! Retrouve-le dans Communauté › Mes publications.`, 3.5);
      this.audio.checkpoint(true);
    } catch (e) {
      this.ui.flash(e.message, 4);
      this.audio.error();
    }
  },

  async _renderCommunity(reset = false) {
    const list = $('comm-list'), status = $('comm-status'), more = $('comm-more');
    if (!this._comm) {
      this._comm = { sort: 'recent', search: '', offset: 0 };
      document.querySelectorAll('#comm-tabs .tab').forEach((b) => b.addEventListener('click', () => {
        this.audio.click();
        this._comm.sort = b.dataset.sort;
        document.querySelectorAll('#comm-tabs .tab').forEach((x) => x.classList.toggle('on', x === b));
        this._renderCommunity(true);
      }));
      let tm = null;
      $('comm-search').addEventListener('input', (e) => {
        clearTimeout(tm);
        tm = setTimeout(() => { this._comm.search = e.target.value; this._renderCommunity(true); }, 350);
      });
      more.addEventListener('click', () => { this.audio.click(); this._renderCommunity(false); });
    }
    const C = this._comm;
    if (reset) { C.offset = 0; list.innerHTML = ''; }
    const req = (this._commReq = (this._commReq || 0) + 1);
    status.textContent = 'Chargement…';
    more.classList.add('hidden');
    let rows, likes;
    try {
      [rows, likes] = await Promise.all([
        online.listTracks({ sort: C.sort === 'mine' ? 'recent' : C.sort, mine: C.sort === 'mine', search: C.search, offset: C.offset, limit: 24 }),
        online.myLikes().catch(() => new Set()),
      ]);
    } catch (e) {
      if (req !== this._commReq) return;
      status.innerHTML = `<b>Communauté indisponible</b> : ${esc(e.message)}`;
      return;
    }
    if (req !== this._commReq || !$('community') || $('community').classList.contains('hidden')) return;
    C.offset += rows.length;
    status.textContent = !rows.length && reset
      ? (C.sort === 'mine' ? 'Rien de publié. Termine un circuit puis « Partager › Publier ».' : 'Aucun circuit trouvé.')
      : '';
    more.classList.toggle('hidden', rows.length < 24);
    for (const row of rows) list.appendChild(this._communityCard(row, likes));
  },

  _communityCard(row, likes) {
    let track = null;
    try { track = Track.decode(row.code); } catch { /* code abîmé */ }
    const mine = row.author === online.uid;
    const key = track ? track.userKey : '';
    const rec = key ? getRecord(key) : null;
    const medals = track ? track.derivedMedals : null;
    const medal = rec && medals ? medalFor(rec.time, medals) : null;
    const liked = likes.has(row.id);
    const card = document.createElement('div');
    card.className = 'card ' + (row.decor || '');
    card.innerHTML = `${track ? `<img class="thumb" alt="" src="${thumbnail(track, 'c-' + row.id)}">` : ''}
      <h3>${esc(row.name)}</h3>
      ${row.description ? `<p class="desc">${esc(row.description)}</p>` : ''}
      <div class="meta">par <b>${esc((row.players && row.players.name) || '—')}</b>${row.laps > 1 ? ` · ${row.laps} tours` : ''}</div>
      <div class="meta" title="Temps de l’auteur">${medalIcon(MEDALS[0])} <b>${formatTime(row.author_time)}</b> · ▶ ${row.plays}</div>
      <div class="best">${medals ? medalIcon(medal) : ''}${rec ? formatTime(rec.time) : '<span class="meta">Pas encore de temps</span>'}</div>
      <div class="actions main">
        <button class="btn primary" data-a="play"${track ? '' : ' disabled'}>Jouer</button>
        <button class="btn like${liked ? ' on' : ''}" data-a="like" title="J’aime"><span class="hrt">${liked ? '♥' : '♡'}</span> <span class="nl">${row.likes}</span></button>
      </div>
      <div class="actions sub">
        <button class="btn" data-a="board" title="Classement">🏆</button>
        <button class="btn" data-a="copy" title="Copier dans Mes circuits">⧉ Copier</button>
        ${mine ? '<button class="btn" data-a="edit" title="Nom et description">✎</button><button class="btn danger" data-a="del" title="Retirer de la communauté">✕</button>' : '<button class="btn subtle" data-a="report" title="Signaler">⚑</button>'}
      </div>`;
    card.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-a]');
      if (!a) return;
      this.audio.click();
      const act = a.dataset.a;
      if (act === 'play' && track) {
        this.playTrack(track, { trackKey: key, seed: track.name, userMap: true, medals, difficulty: 2, community: row.id });
        online.played(row.id);
      } else if (act === 'like') {
        try {
          const n = await online.toggleLike(row.id, this.settings.playerName);
          const now = !a.classList.contains('on');
          a.classList.toggle('on', now); a.querySelector('.hrt').textContent = now ? '♥' : '♡';
          card.querySelector('.nl').textContent = n;
        } catch (err) { this.ui.flash(err.message); }
      } else if (act === 'board' && track) {
        this.leaderboardModal(key, row.name, track);
      } else if (act === 'copy' && track) {
        saveMyTrack({ id: newId(), name: track.name, code: track.encode() });
        this.ui.flash('Copié dans « Mes circuits ».');
      } else if (act === 'edit') {
        const f = document.createElement('div');
        f.className = 'form';
        f.innerHTML = `<label>Nom<input id="em-name" maxlength="40"></label>
          <label>Description<textarea id="em-desc" maxlength="200" rows="3" placeholder="Ce qui rend ton circuit unique (200 caractères)"></textarea></label>
          <p class="meta">Le circuit lui-même, ses médailles et ses classements ne changent pas.</p>`;
        f.querySelector('#em-name').value = row.name;
        f.querySelector('#em-desc').value = row.description || '';
        this.ui.modal({
          title: 'Modifier le circuit publié',
          body: f,
          actions: [{ label: 'Annuler' }, { label: 'Enregistrer', primary: true, onClick: () => {
            const n = f.querySelector('#em-name').value.trim().slice(0, 40), d = f.querySelector('#em-desc').value.replace(/\s+/g, ' ').trim().slice(0, 200);
            if (!n) { this.ui.flash('Il faut un nom.'); return false; }
            online.updateTrackMeta(row.id, n, d).then(() => {
              row.name = n; row.description = d;
              card.replaceWith(this._communityCard(row, likes));
              this.ui.flash('Circuit mis à jour.');
            }, (err) => this.ui.flash(err.message, 4));
            return true;
          } }],
        });
      } else if (act === 'del') {
        this.ui.modal({
          title: 'Retirer ce circuit ?',
          body: `<p>« ${esc(row.name)} » disparaît de la communauté.</p>`,
          actions: [{ label: 'Annuler' }, { label: 'Retirer', danger: true, onClick: () => {
            online.deleteTrack(row.id).then(() => { card.remove(); this.ui.flash('Circuit retiré.'); }, (err) => this.ui.flash(err.message));
          } }],
        });
      } else if (act === 'report') {
        this.ui.modal({
          title: 'Signaler ce circuit ?',
          body: '<p>Contenu inapproprié ? Après 3 signalements, le circuit est masqué.</p>',
          actions: [{ label: 'Annuler' }, { label: 'Signaler', danger: true, onClick: () => {
            online.report(row.id, this.settings.playerName).then(() => this.ui.flash('Merci, le signalement est enregistré.'), (err) => this.ui.flash(err.message));
          } }],
        });
      }
    });
    return card;
  },

  importModal(fromEditor = false) {
    const ta = document.createElement('textarea');
    ta.placeholder = 'Colle ici un code de circuit (SHW…), un lien de partage ou un code de fantôme (SHG1:…)';
    const wrap = document.createElement('div');
    wrap.innerHTML = '<p>Colle le code d’un circuit Copytrack, ou le code du fantôme d’un ami.</p>';
    wrap.appendChild(ta);
    const parse = () => {
      if (/^\s*SHG1:/.test(ta.value)) { this.importGhostCode(ta.value); return null; }
      try { return Track.decode(ta.value); } catch { this.ui.flash('Code de circuit invalide.'); return null; }
    };
    const actions = fromEditor
      ? [
        { label: 'Charger dans l’éditeur', primary: true, onClick: () => { const t = parse(); if (!t) return false; this.session.loadCode(t.encode()); return true; } },
        { label: 'Annuler' },
      ]
      : [
        { label: 'Jouer', primary: true, onClick: () => { const t = parse(); if (!t) return false; this.playCode(t.encode()); return true; } },
        { label: 'Enregistrer + éditer', onClick: () => {
          const t = parse(); if (!t) return false;
          const entry = saveMyTrack({ id: newId(), name: t.name, code: t.encode() });
          this.openEditor({ code: entry.code, entryId: entry.id, name: entry.name });
          return true;
        } },
        { label: 'Annuler' },
      ];
    this.ui.modal({ title: 'Importer un circuit', body: wrap, actions });
    setTimeout(() => ta.focus(), 50);
  },

  helpModal() {
    this.ui.modal({
      title: 'Commandes',
      body: `<div class="help-grid">
        <b>↑ / Z / W</b><span>Accélérer</span>
        <b>↓ / S</b><span>Freiner, marche arrière</span>
        <b>← → / Q D / A D</b><span>Tourner</span>
        <b>Frein en virage</b><span>Dérapage (l'arrière décroche ; garde le volant pour prolonger la glisse)</span>
        <b>R</b><span>Revenir au dernier checkpoint (le chrono revient au temps du checkpoint)</span>
        <b>T / Entrée</b><span>Recommencer le niveau</span>
        <b>C</b><span>Changer de caméra</span>
        <b>Échap</b><span>Pause</span>
        <b>Manette</b><span>Gâchettes : gaz / frein · stick : direction · freiner en virage : dérapage · Y : checkpoint</span>
      </div>
      <p style="margin-top:14px">Passe les checkpoints ◆ puis l’arrivée. Bleu : boost · verglas : glisse · tremplin : saut · plaque rose ⇅ : gravité inversée. Attention aux piques et aux obstacles mobiles.</p>`,
      actions: [{ label: 'OK', primary: true }],
    });
  },
};
