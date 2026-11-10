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
import { estimateDifficulty, starsText, STAR_LABELS } from '../difficulty.js';
import { getRecord, medalTime, saveMyTrack, newId, formatTime, setImportedGhost } from '../storage.js';
import { describeUser, describeCommunity } from '../trackDescriptor.js';
import { renderWorldBoard } from '../ui/leaderboardPanel.js';
import { trackIdOf } from '../telemetry.js';
import { locale } from '../i18n.js';
import { comments, addComment, deleteComment, reportComment, playlists, savePlaylist, deletePlaylist, tracksByIds, picks, randomTrack, recommended, trackStats } from '../online/community.js';

const when = (d) => { const t = new Date(d); return Number.isFinite(t.getTime()) ? t.toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; };
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

  // Fenêtre « 🏆 » (cartes, écran d'arrivée) : le même classement mondial que le Race Hub (ui/leaderboardPanel.js) ; ici, 👻 lance la course contre ce fantôme.
  leaderboardModal(trackKey, name, track = null) {
    const body = document.createElement('div');
    body.className = 'lb-panel';
    this.ui.modal({ title: `🏆 ${name}`, body, actions: [{ label: 'Fermer', primary: true }] });
    renderWorldBoard(body, { key: trackKey, track, recordKeys: [trackKey] }, {
      app: this,
      onRival: async (row, rank) => {
        const g = await online.ghost(trackKey, rank, PHYS_VER);
        if (!g) throw new Error('Pas de fantôme pour ce temps (record d’avant cette fonction : son auteur doit le renvoyer).');
        this.ui.closeModal();
        this.raceWithRivals(trackKey, track, [g]);
      },
    });
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
    else if (track) this.launchDesc(describeUser(track));
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
        <p class="meta">Difficulté estimée : <b>${starsText(estimateDifficulty(track).stars)} ${STAR_LABELS[estimateDifficulty(track).stars]}</b> (d’après la géométrie ; affichée sur la carte).</p>
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
      if ($('comm-random')) $('comm-random').addEventListener('click', () => { this.audio.click(); this.communityRandom(); });
    }
    const C = this._comm;
    if (reset) { C.offset = 0; list.innerHTML = ''; }
    const req = (this._commReq = (this._commReq || 0) + 1);
    status.textContent = 'Chargement…';
    more.classList.add('hidden');
    if (C.sort === 'playlists' && !C.search.trim()) { this._renderPlaylists(req); return; }
    let rows, likes;
    try {
      const trending = C.sort === 'trending' && !C.search.trim();
      // Sélection des modérateurs et recommandations (E21, supabase/etape13-communaute.sql).
      const special = C.search.trim() ? null : C.sort === 'picks' ? picks({ offset: C.offset, limit: 24 }) : C.sort === 'foryou' ? (C.offset ? Promise.resolve([]) : recommended(24)) : null;
      // Abonnements (E15) : les circuits des auteurs suivis (supabase/etape10-social.sql).
      const authors = C.sort === 'followed' ? [...(await online.myFollows())] : null;
      if (authors && !authors.length) { if (req === this._commReq) { status.textContent = 'Tu ne suis encore personne : ouvre un circuit de la communauté et touche « Suivre ».'; list.innerHTML = ''; } return; }
      const list0 = special || (trending ? online.trending({ offset: C.offset, limit: 24 }).then((r) => (r === null ? online.listTracks({ sort: 'played', offset: C.offset, limit: 24 }) : r))
        : online.listTracks({ sort: ['mine', 'followed', 'picks', 'foryou', 'playlists'].includes(C.sort) ? 'recent' : C.sort === 'trending' ? 'played' : C.sort, mine: C.sort === 'mine', authors, search: C.search, offset: C.offset, limit: 24 }));
      [rows, likes] = await Promise.all([list0, online.myLikes().catch(() => new Set())]);
    } catch (e) {
      if (req !== this._commReq) return;
      status.innerHTML = `<b>Communauté indisponible</b> : ${esc(e.message)}`;
      return;
    }
    if (req !== this._commReq || !$('community') || $('community').classList.contains('hidden')) return;
    C.offset += rows.length;
    status.textContent = !rows.length && reset
      ? (C.sort === 'mine' ? 'Rien de publié. Termine un circuit puis « Partager › Publier ».' : C.sort === 'picks' && !C.search.trim() ? 'La sélection est vide pour l’instant.'
        : C.sort === 'foryou' && !C.search.trim() ? 'Pas encore de recommandation : aime quelques circuits, elles viennent de ce que tu aimes.' : 'Aucun circuit trouvé.')
      : '';
    more.classList.toggle('hidden', rows.length < 24 || C.sort === 'foryou');
    for (const row of rows) list.appendChild(this._communityCard(row, likes));
    if (reset) this._renderFeatured(likes, req);
  },

  // « Circuit de la semaine » : celui où le plus de pilotes différents ont couru ces 7 derniers jours (au moins 2 pilotes), en tête de l'écran, hors recherche et hors « Mes publications ».
  async _renderFeatured(likes, req) {
    const box = $('comm-featured');
    if (!box) return;
    const C = this._comm;
    box.classList.add('hidden'); box.innerHTML = '';
    if (C.search.trim() || C.sort === 'mine') return;
    let top = this._featured && Date.now() - this._featured.at < 600000 ? this._featured.row : undefined;
    if (top === undefined) {
      try { const r = await online.trending({ limit: 1 }); top = r && r[0] && r[0].week_players >= 2 ? r[0] : null; } catch { top = null; }
      this._featured = { at: Date.now(), row: top };
    }
    if (!top || req !== this._commReq || !$('community') || $('community').classList.contains('hidden')) return;
    box.innerHTML = '<h3 class="featured-h">⭐ Circuit de la semaine</h3>';
    box.appendChild(this._communityCard(top, likes));
    box.classList.remove('hidden');
  },

  _communityCard(row, likes) {
    let track = null;
    try { track = Track.decode(row.code); } catch { /* code abîmé */ }
    const mine = row.author === online.uid;
    const key = track ? track.userKey : '';
    const rec = key ? getRecord(key) : null;
    const medals = track ? track.derivedMedals : null;
    const medal = rec && medals ? medalFor(medalTime(rec), medals) : null;
    const liked = likes.has(row.id);
    const est = track ? estimateDifficulty(track) : null;
    const card = document.createElement('div');
    card.className = 'card ' + (row.decor || '');
    card.innerHTML = `${track ? `<img class="thumb" alt="" src="${thumbnail(track, 'c-' + row.id)}">` : ''}
      <h3>${esc(row.name)}</h3>
      ${row.description ? `<p class="desc">${esc(row.description)}</p>` : ''}
      <div class="meta">par <b>${esc((row.players && row.players.name) || '—')}</b>${row.laps > 1 ? ` · ${row.laps} tours` : ''}</div>
      <div class="meta" title="Temps de l’auteur">${medalIcon(MEDALS[0])} <b>${formatTime(row.author_time)}</b> · ▶ ${row.plays}${row.week_players ? ` · 🔥 ${row.week_players} pilote${row.week_players > 1 ? 's' : ''} cette semaine` : ''}</div>
      ${est ? `<div class="meta diff" title="Difficulté estimée d’après la géométrie du circuit (virages serrés, murs, loopings, obstacles, pièces mobiles, longueur) : une indication, pas une mesure.">${starsText(est.stars)} ${STAR_LABELS[est.stars]}</div>` : ''}
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
    card.tabIndex = 0;
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === card && track) { this.audio.click(); this.openCommunityHub(row, 'community'); } });
    card.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-a]');
      if (!a) { if (track) { this.audio.click(); this.openCommunityHub(row, 'community'); } return; }      // la carte : la fiche du circuit
      this.audio.click();
      const act = a.dataset.a;
      if (act === 'play' && track) {
        this.launchDesc(describeCommunity(track, row));
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

  // ---------------------------------------------------------------- Communauté 2 (E21)
  // Un circuit au hasard (de préférence jamais joué) : sa fiche. Les derniers tirés sont évités.
  async communityRandom() {
    this._randAvoid = this._randAvoid || [];
    let row;
    try { row = await randomTrack(this._randAvoid); } catch (e) { this.ui.flash(`Communauté indisponible : ${e.message}`, 3); return; }
    if (!row) { this.ui.flash('Aucun circuit à proposer pour l’instant.'); return; }
    this._randAvoid = [...this._randAvoid, row.id].slice(-30);
    this.openCommunityHub(row, 'community');
  },

  // Onglet « Playlists » : les miennes, puis les publiques.
  async _renderPlaylists(req) {
    const list = $('comm-list'), status = $('comm-status'), more = $('comm-more');
    list.innerHTML = ''; more.classList.add('hidden'); status.textContent = 'Chargement…';
    let mine = [], pub = [];
    try { [mine, pub] = await Promise.all([playlists({ mine: true }), playlists({ mine: false })]); }
    catch (e) { if (req === this._commReq) status.innerHTML = `<b>Playlists indisponibles</b> : ${esc(e.message)}`; return; }
    if (req !== this._commReq) return;
    status.textContent = mine.length || pub.length ? '' : 'Aucune playlist. Ouvre la fiche d’un circuit de la communauté et touche « 🎵 Playlist ».';
    const card = (pl, own) => {
      const c = document.createElement('div');
      c.className = 'card playlist-card';
      c.dataset.pl = pl.id;
      c.innerHTML = `<h3>🎵 ${esc(pl.name)}</h3><div class="meta"><span>${own ? (pl.public ? 'publique' : 'privée') : `par ${esc(pl.owner_name || '—')}`}</span> · <span>${pl.n} circuit${pl.n > 1 ? 's' : ''}</span></div>
        <div class="actions main"><button class="btn primary" data-pa="open">Ouvrir</button>${own ? '<button class="btn danger" data-pa="del" title="Supprimer la playlist">✕</button>' : ''}</div>`;
      c.addEventListener('click', (e) => {
        const a = e.target.closest('[data-pa]');
        this.audio.click();
        if (a && a.dataset.pa === 'del') {
          deletePlaylist(pl.id).then(() => { c.remove(); this.ui.flash('Playlist supprimée.'); }, (err) => this.ui.flash(err.message, 3));
          return;
        }
        this.openPlaylist(pl, own);
      });
      return c;
    };
    if (mine.length) { const h = document.createElement('h3'); h.className = 'group-title playlist-h'; h.textContent = 'Mes playlists'; list.appendChild(h); for (const pl of mine) list.appendChild(card(pl, true)); }
    const others = pub.filter((pl) => pl.owner !== online.uid);
    if (others.length) { const h = document.createElement('h3'); h.className = 'group-title playlist-h'; h.textContent = 'Playlists publiques'; list.appendChild(h); for (const pl of others) list.appendChild(card(pl, false)); }
  },

  // Une playlist : ses circuits, dans l'ordre ; « Jouer dans l'ordre » ouvre la fiche du premier, la fiche propose ensuite le suivant.
  async openPlaylist(pl, own = false) {
    const body = document.createElement('div');
    body.className = 'playlist';
    body.innerHTML = '<p class="meta">Chargement…</p>';
    this.ui.modal({ title: `🎵 ${pl.name}`, body, wide: true, actions: [{ label: 'Fermer' }] });
    let rows;
    try { rows = await tracksByIds(pl.tracks); } catch (e) { body.innerHTML = `<p class="lb-off">${esc(e.message)}</p>`; return; }
    if (!document.body.contains(body)) return;
    if (!rows.length) { body.innerHTML = '<p class="meta">Cette playlist est vide (ses circuits ont peut-être été retirés).</p>'; return; }
    const draw = () => {
      body.innerHTML = `<ol class="playlist-list">${rows.map((r, i) => `<li><b>${esc(r.name)}</b> <small class="meta">par ${esc((r.players && r.players.name) || '—')}</small>
        <button class="btn small" data-pi="${i}" data-pk="hub">Fiche</button>${own ? `<button class="btn small danger" data-pi="${i}" data-pk="rm" title="Retirer de la playlist">✕</button>` : ''}</li>`).join('')}</ol>
        <button class="btn primary" data-pk="run">▶ Jouer dans l’ordre</button>`;
    };
    draw();
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pk]');
      if (!b) return;
      this.audio.click();
      const i = +b.dataset.pi;
      if (b.dataset.pk === 'run' || b.dataset.pk === 'hub') {
        this._playlist = { id: pl.id, name: pl.name, rows };
        this.ui.closeModal();
        this.openCommunityHub(rows[b.dataset.pk === 'run' ? 0 : i], 'community');
      } else if (b.dataset.pk === 'rm') {
        const keep = rows.filter((_, k) => k !== i);
        try { await savePlaylist({ id: pl.id, name: pl.name, isPublic: pl.public, tracks: keep.map((r) => r.id) }, this.settings.playerName); } catch (err) { this.ui.flash(err.message, 3); return; }
        rows = keep; pl.tracks = keep.map((r) => r.id); pl.n = keep.length;
        draw();
      }
    });
  },

  // Fiche d'un circuit de la communauté : l'ajouter à une de mes playlists, ou en créer une.
  async addToPlaylist(d) {
    const body = document.createElement('div');
    body.className = 'form';
    body.innerHTML = '<p class="meta">Chargement…</p>';
    this.ui.modal({ title: '🎵 Ajouter à une playlist', body, actions: [{ label: 'Fermer' }] });
    let mine;
    try { mine = await playlists({ mine: true }); } catch (e) { body.innerHTML = `<p class="lb-off">${esc(e.message)}</p>`; return; }
    if (!document.body.contains(body)) return;
    body.innerHTML = `${mine.length ? `<div class="playlist-pick">${mine.map((pl) => `<button class="btn" data-pl="${pl.id}"${pl.tracks.includes(d.communityId) ? ' disabled' : ''}>${esc(pl.name)} <small>(${pl.n})</small></button>`).join('')}</div>` : ''}
      <label>Nouvelle playlist<input id="pl-new" maxlength="40" placeholder="Nom de la playlist"></label>
      <label title="Une playlist publique est visible de tous dans Communauté › Playlists">Publique<input type="checkbox" id="pl-pub" checked></label>
      <button class="btn primary" id="pl-create">Créer avec ce circuit</button>`;
    const done = (name) => { this.ui.closeModal(); this.ui.flash(`Ajouté à « ${name} ».`, 2); };
    body.querySelectorAll('[data-pl]').forEach((b) => b.addEventListener('click', async () => {
      const pl = mine.find((x) => String(x.id) === b.dataset.pl);
      try { await savePlaylist({ id: pl.id, name: pl.name, isPublic: pl.public, tracks: [...pl.tracks, d.communityId] }, this.settings.playerName); } catch (e) { this.ui.flash(e.message, 3); return; }
      done(pl.name);
    }));
    body.querySelector('#pl-create').addEventListener('click', async () => {
      const name = body.querySelector('#pl-new').value.trim();
      if (!name) { this.ui.flash('Il faut un nom.'); return; }
      try { await savePlaylist({ name, isPublic: body.querySelector('#pl-pub').checked, tracks: [d.communityId] }, this.settings.playerName); } catch (e) { this.ui.flash(e.message, 3); return; }
      done(name);
    });
  },

  // Commentaires d'un circuit de la communauté (fiche du circuit).
  async _renderHubComments(d) {
    const box = $('hub-comments');
    if (!box) return;
    if (d.source !== 'community' || !d.communityId) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    const account = this.identity && this.identity.kind === 'account';
    box.innerHTML = `<h3>Commentaires</h3>
      ${account ? '<div class="hub-cform"><textarea id="hub-cmsg" maxlength="280" rows="2" placeholder="Ton avis sur ce circuit (280 caractères)"></textarea><button class="btn small primary" id="hub-csend">Publier</button></div>' : '<p class="meta">Un compte est nécessaire pour commenter (Profil › Compte).</p>'}
      <ul class="hub-clist" id="hub-clist"><li class="meta">Chargement…</li></ul>`;
    const listEl = box.querySelector('#hub-clist');
    const load = async () => {
      let rows;
      try { rows = await comments(d.communityId); } catch (e) { listEl.innerHTML = `<li class="lb-off">Commentaires indisponibles : ${esc(e.message)}</li>`; return; }
      if (!this._hub || this._hub.desc.communityId !== d.communityId) return;
      listEl.innerHTML = rows.length ? rows.map((c) => `<li data-c="${c.id}"><b>${esc(c.name)}</b> <small class="meta">${esc(when(c.created_at))}</small>
        ${c.can_delete ? '<button class="btn small subtle" data-ca="del" title="Supprimer">✕</button>' : ''}${c.mine ? '' : '<button class="btn small subtle" data-ca="report" title="Signaler">⚑</button>'}<p>${esc(c.body)}</p></li>`).join('')
        : '<li class="meta">Pas encore de commentaire.</li>';
    };
    listEl.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-ca]');
      if (!b) return;
      this.audio.click();
      const id = +b.closest('[data-c]').dataset.c;
      try {
        if (b.dataset.ca === 'del') { await deleteComment(id); this.ui.flash('Commentaire supprimé.'); }
        else { await reportComment(id); this.ui.flash('Merci, le signalement est enregistré. Après 3 signalements, le commentaire est masqué.', 3); }
      } catch (err) { this.ui.flash(err.message, 3); return; }
      load();
    });
    if (account) box.querySelector('#hub-csend').addEventListener('click', async () => {
      const ta = box.querySelector('#hub-cmsg');
      this.audio.click();
      try { await addComment(d.communityId, ta.value, this.settings.playerName); } catch (e) { this.ui.flash(e.message, 3); return; }
      ta.value = '';
      load();
    });
    load();
  },

  // Statistiques du circuit, calculées par le serveur depuis les statistiques anonymes des joueurs (run_stats) : rien sous 5 pilotes.
  async _loadHubStats(d) {
    const box = $('hub-stats');
    if (!box) return;
    const key = d.variant ? null : trackIdOf(d.key);
    if (!key) { box.remove(); return; }
    let s;
    try { s = await trackStats(key, PHYS_VER); } catch { box.remove(); return; }
    if (!document.body.contains(box)) return;
    if (!s) { box.innerHTML = '<span class="meta">📊 Pas encore assez de pilotes pour des statistiques.</span>'; return; }
    box.innerHTML = `📊 <span>${s.players} pilotes</span> · <span>${Math.round(s.finishRate * 100)} % des parties vont au bout</span>${s.median != null ? ` · <span>temps médian ${formatTime(s.median)}</span>` : ''}${s.top != null ? ` · <span>10 % des pilotes sous ${formatTime(s.top)}</span>` : ''}`;
  },

  // Fiche d'un circuit d'une playlist en cours : la position, et le circuit suivant.
  _hubPlaylistBar(d) {
    const P = this._playlist;
    if (!P || d.source !== 'community') return null;
    const i = P.rows.findIndex((r) => r.id === d.communityId);
    if (i < 0) return null;
    const bar = document.createElement('span');
    bar.className = 'hub-playlist';
    bar.innerHTML = `<span>🎵 ${esc(P.name)} · ${i + 1} / ${P.rows.length}</span>${i + 1 < P.rows.length ? ' <button class="btn small" type="button" data-pl-next>⏭ Suivant</button>' : ''}`;
    const nb = bar.querySelector('[data-pl-next]');
    if (nb) nb.onclick = () => { this.audio.click(); this.openCommunityHub(P.rows[i + 1], 'community'); };
    return bar;
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
