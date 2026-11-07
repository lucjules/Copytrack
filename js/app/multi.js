// Multijoueur : salons, circuit commun, lobby, départ en course à plusieurs, classement du salon.
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
import { esc } from '../dom.js';
import { buildBuiltin } from '../tracks.js';
import { Track } from '../track.js';
import { online } from '../online.js';
import { Room, defaultSignaling, normalizeCode, ROOM_RE, MAX_PLAYERS } from '../net/room.js';
import { listMyTracks, formatTime } from '../storage.js';
export const multiMethods = {
  _roomOpts() {
    return { name: this.settings.playerName, makeSignaling: (o) => defaultSignaling(o, this._tokenFn()) };
  },

  _bindRoom(room) {
    room.on('start', ({ trackId, track, startLocal }) => this._startMultiRace(room, track || { id: trackId }, startLocal));
    room.on('error', (e) => { this.ui.flash(e.message); });
    room.on('members', () => this._updateBoard());
    room.on('results', () => this._updateBoard());
    room.on('closed', () => {
      this._removeBoard();
      if (this.room === room) this.room = null;
      if (this.session && this.session.opts && this.session.opts.multi) this.showMenu('menu');
    });
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
    wrap.innerHTML = `<p>Courez sur le même circuit, chacun à son rythme : vous vous voyez en voitures fantômes (aucune collision), chacun a son chrono
      et recommence quand il veut (R). Jusqu'à ${MAX_PLAYERS} joueurs. Une salle se rejoint avec un code de 6 caractères.</p>
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
    const trackRow = document.createElement('div');
    trackRow.className = 'mp-track';
    const pick = document.createElement('div');
    pick.className = 'mp-pick';
    const note = document.createElement('p');
    note.className = 'meta';
    const msg = document.createElement('p');
    msg.className = 'mp-err'; msg.setAttribute('role', 'alert');
    body.append(code, list, trackRow, pick, msg, note);
    const LINK = { self: '', open: '● connecté', connecting: '… connexion', failed: '✕ liaison impossible', closed: '✕ déconnecté', incompatible: '✕ autre version' };
    const extra = this._mpExtra = this._mpExtra || { mine: [], community: [] };   // circuits ajoutés à la liste de l'hôte
    const render = () => {
      list.innerHTML = room.list.map((m) => `<li class="${m.self ? 'me' : ''}"><span>${m.id === room.hostId ? '★ ' : ''}${esc(m.name)}${m.self ? ' (toi)' : ''}</span><i>${LINK[m.link] || ''}${m.link === 'open' && m.rtt ? ` · ${Math.round(m.rtt)} ms` : ''}</i></li>`).join('');
      trackRow.innerHTML = ''; pick.innerHTML = '';
      const host = room.isHost;
      const start = document.querySelector('#modal-actions [data-mp="start"]');
      if (start) { start.hidden = !host; start.disabled = !room.track; start.textContent = room.started ? 'Relancer pour tous' : 'Lancer la course'; }
      if (!host) {
        trackRow.textContent = room.track ? `Circuit : ${room.track.name || room.track.id}` : 'L\'hôte choisit le circuit…';
        note.textContent = room.started ? 'Course en cours : rejoins-la.' : 'En attente de l\'hôte.';
        return;
      }
      note.textContent = 'Partage le code. Chacun court à son rythme.';
      const sel = document.createElement('select');
      const opt = (v, label, selected) => `<option value="${esc(v)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;
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
    };
    const sub = () => { if (document.body.contains(body)) render(); };
    room.on('members', sub); room.on('track', sub);
    const off = () => { room.off('members', sub); room.off('track', sub); };
    this.ui.modal({
      title: 'Salle multijoueur', body,
      actions: [
        { label: 'Lancer la course', primary: true, onClick: () => { off(); room.start(); return true; }, attrs: { 'data-mp': 'start' } },
        { label: 'Quitter la salle', danger: true, onClick: () => { off(); room.leave(); return true; } },
      ],
    });
    render();
  },

  async _startMultiRace(room, spec, startLocal) {
    let track;
    try { track = await this._resolveMultiTrack(room, spec); }
    catch (e) { this.ui.flash(e.message || 'Circuit impossible à charger.', 4); room.backToLobby(); if (!this.ui.modalOpen) this.multiLobby(room); return; }
    this.ui.closeModal();
    // Chacun court à son rythme : le départ commun n'a de sens que pour le tout premier essai.
    this.playTrack(track, { multi: { room, startLocal: Math.min(startLocal, performance.now() + 4000) }, trackKey: null, seed: spec.id, difficulty: 1 });
    this._mountBoard(room);
  },

  _leaveRaceToLobby(room) {
    this._removeBoard();
    this._dispose();
    this.mode = 'menu';
    this.showMenu('menu');
    if (!room.closed) { room.backToLobby(); this.multiLobby(room); }
  },

  confirmLeaveMulti() {
    const room = this.session && this.session.opts.multi && this.session.opts.multi.room;
    if (!room || this.ui.modalOpen) return;
    this.ui.modal({
      title: 'Quitter la course ?', body: '<p>Les autres continuent. Tu retournes au salon.</p>',
      actions: [{ label: 'Continuer', primary: true }, { label: 'Quitter la course', danger: true, onClick: () => { this._leaveRaceToLobby(room); return true; } }],
    });
  },

  // Tableau des temps de la salle (meilleur essai de chacun), affiché pendant la course, sans jamais bloquer le jeu.
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
    const rows = b.room.ranking();
    b.el.innerHTML = `<div class="mp-board-h">Salle ${esc(b.room.code)} · ${esc((b.room.track && b.room.track.name) || '')}</div>`
      + rows.map((r, i) => `<div class="mp-board-r${r.self ? ' me' : ''}"><b>${r.best != null ? i + 1 : '–'}</b><span>${esc(r.name)}</span><i>${r.best != null ? formatTime(r.best / 120) : '--:--.---'}</i><em>${r.n ? '×' + r.n : ''}</em></div>`).join('')
      + '<div class="mp-board-f">R : nouvel essai · Échap : quitter</div>';
  },
};
