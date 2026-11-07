// Multijoueur : salons (privés par code, ou publics), circuit commun, lobby, départ en course à plusieurs, classement du salon, championnat (manches).
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
import { esc } from '../dom.js';
import { buildBuiltin } from '../tracks.js';
import { Track } from '../track.js';
import { applyRules, describeRules } from '../rules.js';
import { online } from '../online.js';
import { Room, defaultSignaling, normalizeCode, ROOM_RE, MAX_PLAYERS } from '../net/room.js';
import { buildPlaylist, poolFor, POOLS, liveOrder } from '../net/championship.js';
import { PublicDirectory, describeRoom, LOBBY_CODE } from '../net/directory.js';
import { createIceLoader } from '../net/ice.js';
import { listMyTracks, formatTime } from '../storage.js';
const STEPS_PER_S = 120;
const fmtSteps = (steps) => (steps == null ? '—' : formatTime(steps / STEPS_PER_S));
export const multiMethods = {
  _roomOpts() {
    this._iceLoader = this._iceLoader || createIceLoader();
    return { name: this.settings.playerName, makeSignaling: (o) => defaultSignaling(o, this._tokenFn()), getIce: this._iceLoader };
  },

  _bindRoom(room) {
    room.on('start', ({ trackId, track, startLocal, cup }) => this._startMultiRace(room, track || { id: trackId }, startLocal, cup));
    room.on('error', (e) => { this.ui.flash(e.message); });
    room.on('members', () => { this._updateBoard(); this._syncDirectory(room); });
    room.on('results', () => this._updateBoard());
    room.on('live', () => this._updateBoard());
    room.on('track', () => this._syncDirectory(room));
    room.on('cup', () => this._syncDirectory(room));
    room.on('cupround', (info) => this._onCupRound(room, info));
    room.on('cupwait', (info) => { if (!this.ui.modalOpen) this._showCupPanel(room, { wait: info }); });
    room.on('cupstop', () => {
      this._removeCupPanel();
      if (this.session && this.session.cup && this.session.multi.room === room) this._leaveRaceToLobby(room);
      else this.ui.flash('L\'hôte a arrêté le championnat.', 3);
    });
    room.on('closed', () => {
      this._removeBoard(); this._removeCupPanel();
      if (this._dir) this._dir.retract();
      if (this.room === room) this.room = null;
      if (this.session && this.session.opts && this.session.opts.multi) this.showMenu('menu');
    });
  },

  // ---- Salons publics ----------------------------------------------------------------------------------------------
  _directory() {
    this._dir = this._dir || new PublicDirectory({ makeSignaling: ({ selfId, observe }) => defaultSignaling({ code: LOBBY_CODE, selfId, observe }, this._tokenFn()) });
    return this._dir;
  },

  // Le créateur d'un salon public y annonce sa fiche (circuit, joueurs, mode) ; elle disparaît quand il part ou décoche « public ».
  _syncDirectory(room) {
    const pub = this._mpExtra && this._mpExtra.pub && room.meta.host && !room.closed;
    if (!pub && !this._dir) return;
    clearTimeout(this._dirT);
    this._dirT = setTimeout(() => {
      if (!pub) { this._dir.retract(); return; }
      this._directory().announce(describeRoom(room)).catch(() => { this.ui.flash('Annuaire des salons publics injoignable.', 3); this._mpExtra.pub = false; });
    }, 700);
  },

  multiPublic() {
    const body = document.createElement('div');
    const note = document.createElement('p');
    note.className = 'meta'; note.textContent = 'Recherche des salons publics…';
    const list = document.createElement('div');
    list.className = 'mp-public';
    const err = document.createElement('p');
    err.className = 'mp-err'; err.setAttribute('role', 'alert');
    body.append(note, list, err);
    let stop = null, closed = false;
    const join = async (code) => {
      err.textContent = '';
      try { const room = await Room.join(code, this._roomOpts()); this.room = room; this._bindRoom(room); this.ui.closeModal(); this.multiLobby(room); }
      catch (e) { err.textContent = e.message || 'Impossible de rejoindre.'; }
    };
    const render = (rows) => {
      note.textContent = rows.length ? `${rows.length} salon${rows.length > 1 ? 's' : ''} public${rows.length > 1 ? 's' : ''}` : 'Aucun salon public pour le moment. Crée le tien (« Salon public » dans le salon) !';
      list.innerHTML = rows.map((r) => `<div class="mp-pub"><span><b>${esc(r.host)}</b> · ${r.mode === 'cup' ? `🏆 championnat${r.rounds ? ` ${r.round || 1}/${r.rounds}` : ''}` : 'course libre'}${r.track ? ' · ' + esc(r.track) : ''}</span><i>${r.players}/${r.max}</i><button class="btn" data-code="${esc(r.code)}"${r.players >= r.max ? ' disabled' : ''}>Rejoindre</button></div>`).join('');
      for (const b of list.querySelectorAll('button[data-code]')) b.onclick = () => join(b.dataset.code);
    };
    this.ui.modal({
      title: 'Salons publics', body, actions: [{ label: 'Retour', onClick: () => { this.multiMenu(); return false; } }],
      onClose: () => { closed = true; if (stop) stop(); },
    });
    this._directory().watch(render).then((s) => { if (closed) s(); else stop = s; }).catch((e) => { note.textContent = ''; err.textContent = e.message || 'Annuaire injoignable.'; });
  },

  // ---- Circuits du multijoueur : intégrés, communauté (ID) ou code envoyé par l'hôte ----------------------------------
  // spec : { id, name, sig } avec id = 'b-…' (intégré), 'c:<uuid>' (communauté) ou 'u:<signature>' (code transmis par l'hôte).
  async _loadCommunityTrack(uuid) {
    this._mpCache = this._mpCache || new Map();
    if (this._mpCache.has(uuid)) return this._mpCache.get(uuid);
    const rows = await online.rest('/rest/v1/tracks?select=id,name,code&id=eq.' + encodeURIComponent(uuid), { auth: false });
    if (!rows || !rows[0] || !rows[0].code) throw new Error('Circuit introuvable (ID inconnu, ou retiré de la communauté).');
    const track = Track.decode(rows[0].code);
    const out = { track, name: rows[0].name || track.name };
    this._mpCache.set(uuid, out);
    return out;
  },

  // Transforme ce que l'hôte propose (ID, code collé, circuit local) en spec partageable, après l'avoir vraiment chargé.
  async _specFromInput(text) {
    const t = String(text || '').trim();
    if (!t) throw new Error('Colle un ID de circuit de la communauté ou un code de circuit.');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.exec(t);
    if (uuid) {
      const { track, name } = await this._loadCommunityTrack(uuid[0].toLowerCase());
      return { id: 'c:' + uuid[0].toLowerCase(), name, sig: track.signature() };
    }
    let track;
    try { track = Track.decode(t); } catch { throw new Error('Ni un ID de circuit, ni un code de circuit valide.'); }
    const errs = track.validate();
    if (errs.length) throw new Error('Circuit injouable : ' + errs.join(' '));
    const code = track.encode();
    if (code.length > 400000) throw new Error('Circuit trop gros pour être envoyé aux autres joueurs.');
    return { id: 'u:' + track.signature(), name: track.name, sig: track.signature(), code };
  },

  async _resolveMultiTrack(room, spec) {
    let track;
    if (spec.id.startsWith('b-')) {
      const b = this.builtins.find((x) => x.key === spec.id);
      if (!b) throw new Error('Circuit intégré inconnu : mets le jeu à jour.');
      return buildBuiltin(b.def);
    }
    if (spec.id.startsWith('c:')) track = (await this._loadCommunityTrack(spec.id.slice(2))).track;
    else if (spec.id.startsWith('u:')) track = Track.decode(await room.waitForCode(spec.id));
    else throw new Error('Circuit inconnu.');
    // Tous les joueurs doivent courir sur exactement le même circuit.
    if (spec.sig && track.signature() !== spec.sig) throw new Error('Ce circuit n\'est pas identique à celui de l\'hôte (modifié depuis sa publication ?).');
    return track;
  },

  multiMenu() {
    if (this.room && !this.room.closed) { this.multiLobby(this.room); return; }
    const wrap = document.createElement('div');
    wrap.innerHTML = `<p><b>Course libre</b> : même circuit, chacun à son rythme, en voitures fantômes (aucune collision), chacun son chrono et on recommence quand on veut (R).
      <b>Championnat</b> : plusieurs circuits à la suite, départ commun sur une grille, des points par place, collisions douces en option.
      Jusqu'à ${MAX_PLAYERS} joueurs. Une salle se rejoint avec un code de 6 caractères, ou depuis la liste des salons publics.</p>
      <label class="mp-join"><span>Rejoindre une salle</span><input id="mp-code" maxlength="8" placeholder="CODE" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
      <p class="mp-err" id="mp-err" role="alert"></p>`;
    const err = (m) => { wrap.querySelector('#mp-err').textContent = m || ''; };
    const busy = (b) => document.querySelectorAll('#modal-actions button').forEach((x) => { x.disabled = b; });
    const go = async (fn) => {
      err(''); busy(true);
      try { const room = await fn(); this.room = room; this._bindRoom(room); this.ui.closeModal(); this.multiLobby(room); }
      catch (e) { err(e.message || 'Impossible de se connecter.'); busy(false); }
    };
    this.ui.modal({
      title: 'Multijoueur', body: wrap,
      actions: [
        { label: 'Créer une salle', primary: true, onClick: () => { go(() => Room.create(this._roomOpts())); return false; } },
        { label: 'Rejoindre', onClick: () => {
          const code = normalizeCode(wrap.querySelector('#mp-code').value);
          if (!ROOM_RE.test(code)) { err('Code invalide : 6 caractères (lettres et chiffres, sans 0, O, 1, I).'); return false; }
          go(() => Room.join(code, this._roomOpts())); return false;
        } },
        { label: 'Salons publics', onClick: () => { this.multiPublic(); return false; } },
        { label: 'Fermer' },
      ],
    });
    setTimeout(() => { const i = wrap.querySelector('#mp-code'); if (i) i.focus(); }, 50);
  },

  multiLobby(room) {
    const body = document.createElement('div');
    const code = document.createElement('div');
    code.className = 'mp-code';
    code.innerHTML = `<small>Code de la salle</small><b>${esc(room.code)}</b>`;
    const list = document.createElement('ul');
    list.className = 'mp-list';
    const modeRow = document.createElement('div');
    modeRow.className = 'mp-mode';
    const trackRow = document.createElement('div');
    trackRow.className = 'mp-track';
    const pick = document.createElement('div');
    pick.className = 'mp-pick';
    const note = document.createElement('p');
    note.className = 'meta';
    const msg = document.createElement('p');
    msg.className = 'mp-err'; msg.setAttribute('role', 'alert');
    body.append(code, list, modeRow, trackRow, pick, msg, note);
    const LINK = { self: '', open: '● connecté', connecting: '… connexion', failed: '✕ liaison impossible', closed: '✕ déconnecté', incompatible: '✕ autre version' };
    // Choix de l'hôte, gardés d'une ouverture du salon à l'autre : circuits ajoutés à la liste, mode, nombre de manches, sélection, collisions, salon public.
    const extra = this._mpExtra = Object.assign({ mine: [], community: [], mode: 'free', rounds: 3, pool: 'all', collisions: true, pub: false }, this._mpExtra);
    const render = () => {
      list.innerHTML = room.list.map((m) => `<li class="${m.self ? 'me' : ''}"><span>${m.id === room.hostId ? '★ ' : ''}${esc(m.name)}${m.self ? ' (toi)' : ''}</span><i>${LINK[m.link] || ''}${m.link === 'open' && m.rtt ? ` · ${Math.round(m.rtt)} ms` : ''}</i></li>`).join('');
      modeRow.innerHTML = ''; trackRow.innerHTML = ''; pick.innerHTML = '';
      const host = room.isHost, cup = extra.mode === 'cup';
      const start = document.querySelector('#modal-actions [data-mp="start"]');
      if (start) {
        start.hidden = !host;
        start.disabled = cup ? false : !room.track;
        start.textContent = cup ? (room.cupActive ? 'Relancer un championnat' : 'Lancer le championnat') : room.started ? 'Relancer pour tous' : 'Lancer la course';
      }
      const running = room.cupActive;
      if (!host) {
        trackRow.textContent = running ? `Championnat en cours : manche ${Math.min(room.cup.total, (room.cupState ? room.cupState.n : room.cup.played) + 1)} sur ${room.cup.total}.`
          : room.track ? `Circuit : ${room.track.name || room.track.id}` : 'L\'hôte choisit le circuit…';
        note.textContent = (running ? 'Tu rejoins à la prochaine manche.' : room.started ? 'Course en cours : rejoins-la.' : 'En attente de l\'hôte.') + (room.rules ? ' Règles : ' + describeRules(room.rules).join(' · ') + '.' : '');
        return;
      }
      // Mode : course libre (chacun à son rythme) ou championnat (manches, points).
      modeRow.innerHTML = `<span>Mode</span><label><input type="radio" name="mp-mode" value="free"${cup ? '' : ' checked'}> Course libre</label><label><input type="radio" name="mp-mode" value="cup"${cup ? ' checked' : ''}> Championnat</label>`;
      for (const r of modeRow.querySelectorAll('input')) r.onchange = () => { extra.mode = r.value; render(); };
      const opt = (v, label, selected) => `<option value="${esc(v)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;
      if (cup) {
        const cfg = document.createElement('div');
        cfg.className = 'mp-cupcfg';
        cfg.innerHTML = `<label><span>Manches</span><select data-k="rounds">${[2, 3, 4, 5, 6].map((n) => opt(String(n), n + ' circuits', n === extra.rounds)).join('')}</select></label>`
          + `<label><span>Circuits</span><select data-k="pool">${Object.entries(POOLS).map(([k, v]) => opt(k, v, k === extra.pool)).join('')}</select></label>`
          + `<label class="chk"><input type="checkbox" data-k="collisions"${extra.collisions ? ' checked' : ''}> Collisions douces (les voitures se poussent)</label>`;
        for (const el of cfg.querySelectorAll('[data-k]')) el.onchange = () => { extra[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.dataset.k === 'rounds' ? +el.value : el.value; };
        pick.append(cfg);
        note.textContent = running ? 'Un championnat est en cours : « Relancer » le remplace.' : 'Barème : 10, 8, 6, 5, 4, 3, 2, 1 points par place. Les circuits sont tirés au sort, du plus facile au plus dur.';
      } else {
        note.textContent = 'Partage le code. Chacun court à son rythme.';
        const sel = document.createElement('select');
        const mine = listMyTracks();
        sel.innerHTML = '<option value="">Choisis un circuit…</option>'
          + '<optgroup label="Circuits intégrés">' + this.builtins.map((b) => opt('b:' + b.key, b.def.name, room.trackId === b.key)).join('') + '</optgroup>'
          + (mine.length ? '<optgroup label="Mes circuits">' + mine.map((e) => opt('m:' + e.id, e.name)).join('') + '</optgroup>' : '')
          + (extra.community.length ? '<optgroup label="Communauté">' + extra.community.map((r) => opt('c:' + r.id, r.name, room.trackId === 'c:' + r.id)).join('') + '</optgroup>' : '');
        sel.onchange = async () => {
          msg.textContent = '';
          const v = sel.value; if (!v) return;
          try {
            let spec;
            if (v.startsWith('b:')) spec = { id: v.slice(2), name: (this.builtins.find((b) => b.key === v.slice(2)) || { def: {} }).def.name };
            else if (v.startsWith('m:')) spec = await this._specFromInput(mine.find((e) => e.id === v.slice(2)).code);
            else spec = await this._specFromInput(v.slice(2));
            room.selectTrack(spec);
          } catch (e) { msg.textContent = e.message; }
          render();
        };
        trackRow.append(Object.assign(document.createElement('span'), { textContent: 'Circuit' }), sel);
        const row = document.createElement('div');
        row.className = 'mp-load';
        row.innerHTML = '<input id="mp-id" placeholder="ID d\'un circuit de la communauté, ou code de circuit" spellcheck="false" autocomplete="off"><button class="btn" data-mp="load">Charger</button><button class="btn" data-mp="browse">Parcourir la communauté</button>';
        row.querySelector('[data-mp="load"]').onclick = async () => {
          msg.textContent = '';
          try { room.selectTrack(await this._specFromInput(row.querySelector('#mp-id').value)); this.audio.click(); } catch (e) { msg.textContent = e.message; }
          render();
        };
        row.querySelector('[data-mp="browse"]').onclick = async () => {
          msg.textContent = 'Chargement…';
          try { extra.community = (await online.listTracks({ sort: 'popular', limit: 30 })).map((r) => ({ id: r.id, name: `${r.name} · ${(r.players && r.players.name) || '?'}` })); msg.textContent = extra.community.length ? 'Liste de la communauté ajoutée au menu « Circuit ».' : 'Aucun circuit publié.'; }
          catch (e) { msg.textContent = e.message; return; }
          const keep = msg.textContent; render(); msg.textContent = keep;
        };
        pick.append(row);
      }
      // Salon public : visible dans la liste « Salons publics » (réservé au créateur du salon).
      if (room.meta.host) {
        const pub = document.createElement('label');
        pub.className = 'chk mp-pubchk';
        pub.innerHTML = `<input type="checkbox"${extra.pub ? ' checked' : ''}> Salon public (visible dans la liste, sans code)`;
        pub.querySelector('input').onchange = (e) => { extra.pub = e.target.checked; this._syncDirectory(room); };
        pick.append(pub);
      }
      pick.append(this._roomRulesBlock(room));
      if (running) {
        const stop = document.createElement('button');
        stop.className = 'btn danger'; stop.textContent = 'Arrêter le championnat';
        stop.onclick = () => { room.stopCup(); render(); };
        pick.append(stop);
      }
    };
    const EVENTS = ['members', 'track', 'cup', 'cupstop', 'cupround', ...(room.meta.host ? [] : ['rules'])];       // l'hôte ne redessine pas ses propres réglages sous ses doigts
    const sub = () => { if (document.body.contains(body)) render(); };
    for (const e of EVENTS) room.on(e, sub);
    const off = () => { for (const e of EVENTS) room.off(e, sub); };
    this.ui.modal({
      title: 'Salle multijoueur', body,
      actions: [
        { label: 'Lancer la course', primary: true, attrs: { 'data-mp': 'start' }, onClick: () => {
          if (extra.mode === 'cup') {
            const rounds = buildPlaylist(poolFor(this.builtins, extra.pool, { rounds: extra.rounds }), { rounds: extra.rounds });
            if (!rounds.length) { msg.textContent = 'Aucun circuit dans cette sélection.'; return false; }
            off(); room.startCup({ rounds, collisions: extra.collisions }); return true;
          }
          off(); room.start(); return true;
        } },
        { label: 'Quitter la salle', danger: true, onClick: () => { off(); room.leave(); return true; } },
      ],
    });
    render();
  },

  async _startMultiRace(room, spec, startLocal, cup = null) {
    let track;
    try { track = await this._resolveMultiTrack(room, spec); }
    catch (e) { this.ui.flash(e.message || 'Circuit impossible à charger.', 4); room.backToLobby(); if (!this.ui.modalOpen) this.multiLobby(room); return; }
    track = applyRules(track, room.rules);          // règles de la partie choisies par l'hôte (rules.js)
    this.ui.closeModal();
    this._removeCupPanel();
    // Course libre : chacun court à son rythme, le départ commun n'a de sens que pour le tout premier essai. Championnat : départ commun à chaque manche (grille).
    this.playTrack(track, { multi: { room, startLocal: Math.min(startLocal, performance.now() + 4000), cup }, trackKey: null, seed: spec.id, difficulty: 1 });
    this._mountBoard(room);
  },

  _leaveRaceToLobby(room) {
    this._removeBoard(); this._removeCupPanel();
    this._dispose();
    this.mode = 'menu';
    this.showMenu('menu');
    if (!room.closed) { room.backToLobby(); this.multiLobby(room); }
  },

  confirmLeaveMulti() {
    const room = this.session && this.session.opts.multi && this.session.opts.multi.room;
    if (!room || this.ui.modalOpen) return;
    if (this.session.cup) {
      // Championnat : on ne repasse pas par le salon (les autres sont en course) ; quitter = quitter la salle, la manche continue sans toi.
      this.ui.modal({
        title: 'Quitter le championnat ?', body: '<p>Tu quittes la salle : la manche continue sans toi et tu perds les points de ce championnat.</p>',
        actions: [{ label: 'Continuer', primary: true }, { label: 'Quitter', danger: true, onClick: () => { this._removeBoard(); this._removeCupPanel(); room.leave(); return true; } }],
      });
      return;
    }
    this.ui.modal({
      title: 'Quitter la course ?', body: '<p>Les autres continuent. Tu retournes au salon.</p>',
      actions: [{ label: 'Continuer', primary: true }, { label: 'Quitter la course', danger: true, onClick: () => { this._leaveRaceToLobby(room); return true; } }],
    });
  },

  // ---- Tableau de la salle (pendant la course) -------------------------------------------------------------------------
  // Course libre : meilleur temps de chacun. Championnat : classement EN DIRECT de la manche (place, avancement ou temps d'arrivée).
  _mountBoard(room) {
    this._removeBoard();
    const el = document.createElement('div');
    el.id = 'mp-board'; el.className = 'mp-board';
    el.setAttribute('aria-label', 'Temps de la salle');
    document.body.appendChild(el);
    this._board = { el, room };
    this._updateBoard();
  },

  _updateBoard() {
    const b = this._board;
    if (!b) return;
    const s = this.session;
    if (s && s.cup && s.multi && s.multi.room === b.room && b.room.cup) { b.el.innerHTML = this._cupBoardHtml(b.room, s); return; }
    const rows = b.room.ranking();
    b.el.innerHTML = `<div class="mp-board-h">Salle ${esc(b.room.code)} · ${esc((b.room.track && b.room.track.name) || '')}</div>`
      + rows.map((r, i) => `<div class="mp-board-r${r.self ? ' me' : ''}"><b>${r.best != null ? i + 1 : '–'}</b><span>${esc(r.name)}</span><i>${r.best != null ? formatTime(r.best / 120) : '--:--.---'}</i><em>${r.n ? '×' + r.n : ''}</em></div>`).join('')
      + '<div class="mp-board-f">R : nouvel essai · Échap : quitter</div>';
  },

  _cupBoardHtml(room, s) {
    const cup = room.cup, n = s.cup.n;
    const order = liveOrder(room.liveEntries((id) => (id === room.selfId ? s.prog : s.progOf(id))));
    const me = order.findIndex((e) => e.self) + 1;
    const total = (cup.rounds[n] && cup.rounds[n].name) || '';
    return `<div class="mp-board-h">Manche ${n + 1}/${cup.total} · ${esc(total)}</div>`
      + `<div class="mp-board-pos"><b>${me || '–'}</b><small>/${order.length}</small></div>`
      + order.map((e, i) => `<div class="mp-board-r${e.self ? ' me' : ''}${e.gone ? ' gone' : ''}"><b>${i + 1}</b><span>${esc(e.name)}</span><i>${e.finished != null ? '🏁 ' + fmtSteps(e.finished) : e.gone ? '✕' : Math.round(Math.min(1, e.prog) * 100) + ' %'}</i></div>`).join('')
      + '<div class="mp-board-f">R : retour au checkpoint (le chrono court) · Échap : quitter</div>';
  },

  // ---- Panneau de manche : résultats, classement général, manche suivante, podium ---------------------------------------
  _removeCupPanel() {
    if (this._cupPanel) { clearInterval(this._cupPanel.timer); this._cupPanel.el.remove(); this._cupPanel = null; }
  },

  _onCupRound(room, info) {
    this._removeBoard();
    const s = this.session;
    if (s && s.cup && s.multi.room === room) s.cupRoundOver();       // ceux qui roulent encore s'arrêtent : manche close par l'hôte
    this._showCupPanel(room, { round: info });
  },

  _showCupPanel(room, ctx) {
    this._removeCupPanel();
    const el = document.createElement('div');
    el.id = 'mp-cup'; el.className = 'mp-cup';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Championnat');
    const cup = room.cup;
    const nameOf = (id) => esc(cup.names.get(id) || '?');
    const medal = (i) => ['🥇', '🥈', '🥉'][i] || String(i + 1);
    let html;
    if (ctx.round) {
      const { n, result, standings, final } = ctx.round;
      const rt = cup.rounds[n];
      html = `<h2>${final ? '🏆 Championnat terminé' : `Manche ${n + 1}/${cup.total}`}</h2><p class="meta">${esc((rt && rt.name) || '')}</p>`
        + '<h3>Résultats de la manche</h3><div class="mp-tab">'
        + result.order.map((id, i) => `<div class="mp-row${id === room.selfId ? ' me' : ''}"><b>${result.times[id] != null ? medal(i) : '✕'}</b><span>${nameOf(id)}</span><i>${result.times[id] != null ? fmtSteps(result.times[id]) : 'sans temps'}</i><em>${result.points[id] ? '+' + result.points[id] : ''}</em></div>`).join('')
        + `</div><h3>${final ? 'Classement final' : 'Classement général'}</h3><div class="mp-tab">`
        + standings.map((r, i) => `<div class="mp-row${r.id === room.selfId ? ' me' : ''}"><b>${final ? medal(i) : i + 1}</b><span>${esc(r.name)}</span><i>${r.points} pt${r.points > 1 ? 's' : ''}</i><em>${r.wins ? r.wins + ' 🏁' : ''}</em></div>`).join('')
        + '</div>'
        + (final ? '<div class="mp-cup-act"><button class="btn primary" data-act="lobby">Retour au salon</button></div>'
          : '<p class="mp-next" data-next></p><div class="mp-cup-act"><button class="btn danger" data-act="leave">Quitter le championnat</button></div>');
    } else {
      const k = ctx.wait ? ctx.wait.n + 1 : 1;
      html = `<h2>🏆 Championnat en cours</h2><p>Manche ${k}/${cup ? cup.total : '?'} : tu rejoins à la prochaine manche.</p><div class="mp-cup-act"><button class="btn danger" data-act="leave">Quitter</button></div>`;
    }
    el.innerHTML = html;
    document.body.appendChild(el);
    const act = (name, fn) => { const b = el.querySelector(`[data-act="${name}"]`); if (b) b.onclick = fn; };
    act('lobby', () => this._leaveRaceToLobby(room));
    act('leave', () => { this._removeBoard(); this._removeCupPanel(); room.leave(); });
    this._cupPanel = { el, timer: null };
    const next = el.querySelector('[data-next]');
    if (next) {
      const tick = () => {
        const st = room.cupState;
        if (!document.body.contains(el) || !st) { clearInterval(this._cupPanel && this._cupPanel.timer); return; }
        const left = Math.max(0, Math.ceil((st.until - room.now()) / 1000));
        const nx = cup.rounds[cup.played];
        next.textContent = `Manche suivante${nx && nx.name ? ' : ' + nx.name : ''} dans ${left} s`;
      };
      tick();
      this._cupPanel.timer = setInterval(tick, 250);
    }
  },
};
