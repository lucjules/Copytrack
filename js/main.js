// Point d'entrée : crée le moteur de rendu et orchestre menu / course / éditeur.
import * as THREE from './vendor/three.module.min.js';
import { Scenery } from './scenery.js';
import { createTrackMaterials, setColorblind, setHideDecos, setLightBudget } from './trackMesh.js';
import { Particles } from './particles.js';
import { Input, KEY_ACTIONS, PAD_ACTIONS, keyLabel, padLabel, defaultKeys, defaultPad } from './input.js';
import { GarageSession, } from './garage.js';
import { CATEGORIES } from './cosmetics.js';
import { profile, saveProfile, exportCode, parseCode, applySave, addCoins } from './profile.js';
import { GameAudio } from './audio.js';
import { UI, $, esc, medalIcon } from './ui.js';
import { RaceSession, medalFor, MEDALS } from './race.js';
import { EditorSession } from './editor.js';
import { BUILTIN_TRACKS, buildBuiltin } from './tracks.js';
import { Track, hashString, DECORS } from './track.js';
import { PIECES } from './pieces.js';
import { VERSION } from './constants.js';
import { thumbnail } from './editorTools.js';
import { online } from './online.js';
import { account, checkPseudo } from './account.js';
import { runWelcome } from './welcome.js';
import { Room, defaultSignaling, normalizeCode, ROOM_RE, MAX_PLAYERS } from './net/room.js';
import { encodeGhost, decodeGhost, PHYS_VER } from './replay.js';
const PV = PHYS_VER;
import { dailyChallenge, dayKey } from './daily.js';
import { CHAPTERS, CHAPTER_SIZE, UNLOCK_MEDALS, goalFor, goalLabel, goalDone, chapterUnlocked } from './career.js';
import {
  loadSettings, saveSettings, getRecord, saveRecord, listMyTracks, deleteMyTrack, saveMyTrack, newId,
  getEditorDraft, formatTime, purgeOldRecords, clearRecords, setImportedGhost,
} from './storage.js';

import { QualityManager, Benchmark, PROFILES, PROFILE_LABELS, BENCH_VERSION, hardwareHints, wantAntialias } from './quality.js';

class App {
  // identity : { kind: 'guest' | 'account', username } décidé par l'écran d'accueil (welcome.js), toujours avant le menu.
  constructor(identity) {
    this.identity = identity;
    this.settings = loadSettings();
    this.settings.playerName = identity.username;      // jamais de pseudo par défaut : celui de l'invité ou du compte
    // Une seule fois : les anciennes installations avaient « Haute » par défaut ; elles passent en détection automatique.
    if (!this.settings.gfxMigrated) { this.settings.gfxMigrated = 1; this.settings.quality = 'auto'; }
    saveSettings(this.settings);
    const canvas = $('gl');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: wantAntialias(this.settings), powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(66, 1, 0.3, 5000);
    this.materials = createTrackMaterials();
    this.scenery = new Scenery(this.scene, this.settings.quality);
    this.particles = new Particles(this.scene);
    this.quality = new QualityManager({
      renderer: this.renderer, scene: this.scene, camera: this.camera, scenery: this.scenery, particles: this.particles,
      resize: () => this._resize(), views: () => (this.session && this.session.view ? [this.session.view] : []), setDecoHidden: setHideDecos, setLights: setLightBudget,
    });
    this.input = new Input();
    this.input.setBindings(this.settings.keys, this.settings.pad);
    this.input.setPadConfig({ deadzone: this.settings.padDeadzone, sens: this.settings.padSens, rumble: this.settings.haptics });
    purgeOldRecords();
    profile();
    $('menu-foot').textContent = `Copytrack ${VERSION} · un jeu de course original · propulsé par three.js`;
    this.audio = new GameAudio();
    this.audio.setVolume(this.settings.volume);
    this.audio.setMusicVolume(this.settings.musicVolume);
    this.ui = new UI(this);
    this.session = null;
    this.mode = null;

    this.builtins = BUILTIN_TRACKS.map((def, index) => {
      const track = buildBuiltin(def);
      return { def, track, index, key: `b-${def.id}-${hashString(track.encode())}` };
    });

    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) { document.body.classList.add('touch'); this.input.touchActive = true; }
    document.body.classList.toggle('drag-steer', this.settings.touchMode === 'drag');
    this._applyQuality();
    this._applyAccess();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this._wire();
    this._wireTouch();
    this._wireEggs();
    window.addEventListener('orientationchange', () => this._resize());
    document.addEventListener('fullscreenchange', () => this._resize());
  }

  saveSettings() {
    saveSettings(this.settings);
  }

  // Profil réellement appliqué : le choix du joueur, ou (automatique) le résultat de la détection (« Haute » en attendant).
  _qualityName() {
    const q = this.settings.quality;
    return q === 'auto' ? (this.settings.gfxProfile || 'high') : (PROFILES[q] ? q : 'high');
  }

  _applyQuality() {
    this.quality.apply(this._qualityName());
    this._renderQualityInfo();
  }

  _renderQualityInfo() {
    const el = $('opt-quality-info');
    if (!el) return;
    const s = this.settings, now = PROFILE_LABELS[this.quality.name] || '';
    el.textContent = s.quality === 'auto'
      ? (this.bench ? 'Détection en cours sur l’animation du menu…' : s.gfxProfile ? `Détecté : ${PROFILE_LABELS[s.gfxProfile]} (${s.gfxFps} i/s). Baisse auto si ça saccade.` : `Profil actuel : ${now}.`)
      : `Profil choisi : ${now}.`;
  }

  // Benchmark invisible : on mesure la fluidité de l'animation de fond du menu (voir quality.js), sans rien montrer.
  _startBench(force = false) {
    const s = this.settings;
    if (s.quality !== 'auto' || this.bench) return;
    if (!force && s.gfxProfile && s.gfxV === BENCH_VERSION) return;
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const hints = hardwareHints({
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '', ua: navigator.userAgent, touch: document.body.classList.contains('touch'),
      width: window.innerWidth, cores: navigator.hardwareConcurrency, memory: navigator.deviceMemory,
    });
    this.bench = new Benchmark({
      start: hints.start,
      apply: (p) => this.quality.apply(p),
      done: (r) => {
        s.gfxProfile = r.profile; s.gfxV = BENCH_VERSION; s.gfxFps = r.fps;
        this.saveSettings();
        this.bench = null;
        this._renderQualityInfo();
      },
    });
    this._renderQualityInfo();
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.session instanceof EditorSession) this.session._refreshUI();
    const portrait = h > w && document.body.classList.contains('touch');
    $('rotate-hint').classList.toggle('hidden', !(portrait && (this.mode === 'race' || this.mode === 'editor')));
    $('fs-btn').classList.toggle('hidden', !(document.body.classList.contains('touch') && (this.mode === 'race' || this.mode === 'menu') && !document.fullscreenElement));
  }

  // ------------------------------------------------------------ Navigation
  _dispose() {
    $('garage').classList.add('hidden');
    $('replay-bar').classList.add('hidden');
    if (this.session) this.session.dispose();
    this.session = null;
    this._removeBoard();
    this.ui.closeModal();
  }

  showMenu(screen = 'menu') {
    this._dispose();
    const pool = this.builtins.filter((b) => b.track.path);
    const demo = pool[Math.floor(Math.random() * pool.length)];
    this.mode = 'menu';
    this.ui.setMode('menu');
    this.camera.fov = 60;
    this.camera.updateProjectionMatrix();
    this.session = new RaceSession(this, demo.track, { demo: true, seed: demo.key });
    this.audio.music.play('menu', 7, 0);
    this.showScreen(screen);
    this._resize();
  }

  showScreen(name) {
    this._screen = name;
    if (name === 'menu') {
      const r = getRecord('daily-' + dayKey());
      $('daily-best').textContent = r ? formatTime(r.time) : 'nouveau';
    }
    if (name === 'tracks') this._renderTracks();
    if (name === 'mytracks') this._renderMyTracks();
    if (name === 'community') this._renderCommunity(true);
    // Options et Commandes sont des onglets de l'écran Profil (les anciens appels showScreen('options') y mènent toujours).
    if (name === 'options' || name === 'controls') { this.profileTab = name; name = 'profile'; }
    if (name === 'profile') this._renderProfile();
    this.ui.showScreen(name);
  }

  playBuiltin(i) {
    const b = this.builtins[i];
    this.playTrack(b.track, {
      trackKey: b.key, medals: b.def.medals, difficulty: b.def.difficulty, hasNext: i < this.builtins.length - 1, builtinIndex: i, seed: b.key,
      goal: goalFor(b.def, i), goalKey: b.key + '#goal',
    });
  }

  playTrack(track, opts) {
    // Un essai lancé depuis l'éditeur n'exige pas d'arrivée (Phase 3) ; la vérification et les courses normales, si.
    const errs = track.validate({ test: !!(opts && opts.fromEditor && !opts.verify) });
    if (errs.length) { this.ui.flash(errs.join(' ')); return; }
    this._dispose();
    this.mode = 'race';
    this.ui.showScreen(null);
    this.ui.setMode('race');
    $('replay-bar').classList.add('hidden');
    this.session = new RaceSession(this, track, opts);
    this.audio.music.play(track.decor || 'desert', [...(track.name || 'x')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 99991, 7) + 1, 1);
    this._resize();
  }

  playCode(code, entryId = null) {
    let track;
    try { track = Track.decode(code); } catch { this.ui.flash('Code de circuit invalide.'); return; }
    // Circuits de joueurs : médailles déduites du temps de l'auteur, seulement s'il l'a fini.
    this.playTrack(track, { trackKey: track.userKey, userEntry: entryId, seed: track.name, userMap: true, medals: track.derivedMedals, difficulty: 2 });
  }

  // ---- Tutoriel (premier lancement, ou Options > Revoir le tutoriel) -------------
  tutorial(step = 0) {
    const touch = document.body.classList.contains('touch');
    const K = (a) => this._keysOf(a);
    const steps = [
      {
        title: 'Bienvenue dans Copytrack !',
        body: `<p>Passe les <b>checkpoints</b> puis l'<b>arrivée</b>, le plus vite possible.</p>
          <ul class="tuto">
            <li>${touch ? 'Boutons ▲ / ▼ à droite' : `<b>${K('accelerate')}</b> / <b>${K('brake')}</b>`} : accélérer / freiner</li>
            <li>${touch ? 'Boutons ◀ ▶ à gauche' : `<b>${K('left')}</b> / <b>${K('right')}</b>`} : tourner</li>
            <li>Manette : gâchettes et stick gauche</li>
          </ul>`,
      },
      {
        title: 'Glisser, voler, atterrir',
        body: `<ul class="tuto">
            <li><b>Dérapage</b> : freine en virage, garde le volant.</li>
            <li><b>Mini-turbo</b> : une longue glisse donne une poussée.</li>
            <li><b>En l'air</b> : gaz = nez en bas, frein = nez en haut. Atterris à plat.</li>
            <li>Loopings, tubes, routes sur le côté : il faut de la vitesse pour rester plaqué.</li>
            <li><b>Gravité inversée</b> : la plaque rose ⇅ t'envoie au plafond, une 2e te ramène.</li>
          </ul>`,
      },
      {
        title: 'Plaques, checkpoints et carrière',
        body: `<ul class="tuto">
            <li><b>Plaques</b> : moto 🏍, bateau ⛵ (sur l'eau), deltaplane 🪂. Repasser dessus te rend ta voiture.</li>
            <li><b>${touch ? '⟲' : K('respawn')}</b> : revenir au dernier checkpoint · <b>${touch ? '↺' : K('restart')}</b> : recommencer.</li>
            <li><b>Obstacles</b> : piques mortelles, boules et marteaux bousculent. Leur rythme est fixe.</li>
            <li><b>Carrière</b> : 11 chapitres de 6 circuits, un objectif bonus ★ chacun.</li>
            <li>Un <b>défi du jour</b> chaque jour. Replays et fantômes partageables.</li>
          </ul>`,
      },
    ];
    const s = steps[step];
    const actions = [];
    if (step > 0) actions.push({ label: '← Précédent', onClick: () => { setTimeout(() => this.tutorial(step - 1), 0); return true; } });
    if (step < steps.length - 1) actions.push({ label: 'Suivant →', primary: true, onClick: () => { setTimeout(() => this.tutorial(step + 1), 0); return true; } });
    else actions.push({ label: 'C\'est parti !', primary: true, onClick: () => { this.settings.tutorialDone = true; this.saveSettings(); return true; } });
    if (step < steps.length - 1) actions.push({ label: 'Passer', onClick: () => { this.settings.tutorialDone = true; this.saveSettings(); return true; } });
    this.ui.modal({ title: `${s.title} (${step + 1}/${steps.length})`, body: s.body, actions });
  }

  // ---- Replays et fantômes ------------------------------------------------
  watchReplay() {
    const s = this.session;
    if (!(s instanceof RaceSession) || !s.lastRun) return;
    const back = { track: s.track, opts: { ...s.opts } };
    this._replayBack = back;
    this._dispose();
    this.mode = 'race';
    this.ui.showScreen(null);
    this.ui.setMode('race');
    this.session = new RaceSession(this, back.track, { ...back.opts, replay: s.lastRun, trackKey: null, medals: back.opts.medals });
    $('replay-bar').classList.remove('hidden');
    this._resize();
  }

  endReplay() {
    $('replay-bar').classList.add('hidden');
    const back = this._replayBack;
    this._replayBack = null;
    if (!back) { this.showMenu('menu'); return; }
    this.playTrack(back.track, back.opts);
  }

  shareGhost() {
    const s = this.session;
    if (!s || !s.trackKey) return;
    const rec = getRecord(s.trackKey);
    if (!rec || !rec.inputs || rec.pv !== PHYS_VER) { this.ui.flash('Pas encore de course enregistrée avec cette version.'); return; }
    const code = encodeGhost({ trackKey: s.trackKey, time: rec.time, name: this.settings.playerName, inputs: rec.inputs });
    this.ui.modal({
      title: 'Partager mon fantôme',
      body: `<p>Un ami qui l'importe courra contre ton temps de ${formatTime(rec.time)}.</p><textarea class="code" readonly rows="4">${esc(code)}</textarea>`,
      actions: [
        { label: 'Copier', primary: true, onClick: () => { navigator.clipboard && navigator.clipboard.writeText(code); this.ui.flash('Code copié'); return false; } },
        { label: 'Fermer' },
      ],
    });
  }

  importGhostCode(code) {
    try {
      const g = decodeGhost(code);
      if (g.v !== PHYS_VER) { this.ui.flash('Ce fantôme vient d\'une autre version du jeu.'); return true; }
      setImportedGhost(g.trackKey, g);
      const b = this.builtins.find((x) => x.key === g.trackKey);
      this.ui.flash(`Fantôme de ${g.name} (${formatTime(g.time)}) importé${b ? ` pour « ${b.def.name} »` : ''}. Il apparaîtra en violet.`, 3.5);
      return true;
    } catch (e) { this.ui.flash(e.message); return true; }
  }

  quitRace() {
    const opts = this.session ? this.session.opts : {};
    if (opts.multi) { this._leaveRaceToLobby(opts.multi.room); return; }
    if (opts.fromEditor) this.openEditor(this.editorState);
    else if (opts.builtinIndex != null || opts.daily) this.showMenu('tracks');
    else if (opts.userEntry) this.showMenu('mytracks');
    else if (opts.community) this.showMenu('community');
    else this.showMenu('menu');
  }

  // ------------------------------------------------------------ Multijoueur
  // Salons : création / jonction par code. Supabase Realtime ne sert qu'à se trouver ; la course passe en WebRTC (net/).
  _tokenFn() { return () => online.ensureSession().then((s) => s.access_token); }

  _roomOpts() {
    return { name: this.settings.playerName, makeSignaling: (o) => defaultSignaling(o, this._tokenFn()) };
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
        note.textContent = room.started ? 'Une course est en cours : tu peux la rejoindre depuis le circuit choisi par l\'hôte.' : 'En attente du départ donné par l\'hôte.';
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
  }

  async _startMultiRace(room, spec, startLocal) {
    let track;
    try { track = await this._resolveMultiTrack(room, spec); }
    catch (e) { this.ui.flash(e.message || 'Circuit impossible à charger.', 4); room.backToLobby(); if (!this.ui.modalOpen) this.multiLobby(room); return; }
    this.ui.closeModal();
    // Chacun court à son rythme : le départ commun n'a de sens que pour le tout premier essai.
    this.playTrack(track, { multi: { room, startLocal: Math.min(startLocal, performance.now() + 4000) }, trackKey: null, seed: spec.id, difficulty: 1 });
    this._mountBoard(room);
  }

  _leaveRaceToLobby(room) {
    this._removeBoard();
    this._dispose();
    this.mode = 'menu';
    this.showMenu('menu');
    if (!room.closed) { room.backToLobby(); this.multiLobby(room); }
  }

  confirmLeaveMulti() {
    const room = this.session && this.session.opts.multi && this.session.opts.multi.room;
    if (!room || this.ui.modalOpen) return;
    this.ui.modal({
      title: 'Quitter la course ?', body: '<p>Les autres continuent. Tu retournes au salon.</p>',
      actions: [{ label: 'Continuer', primary: true }, { label: 'Quitter la course', danger: true, onClick: () => { this._leaveRaceToLobby(room); return true; } }],
    });
  }

  // Tableau des temps de la salle (meilleur essai de chacun), affiché pendant la course, sans jamais bloquer le jeu.
  _mountBoard(room) {
    this._removeBoard();
    const el = document.createElement('div');
    el.id = 'mp-board'; el.className = 'mp-board';
    el.setAttribute('aria-label', 'Temps de la salle');
    document.body.appendChild(el);
    this._board = { el, room };
    this._updateBoard();
  }

  _updateBoard() {
    const b = this._board;
    if (!b) return;
    const rows = b.room.ranking();
    b.el.innerHTML = `<div class="mp-board-h">Salle ${esc(b.room.code)} · ${esc((b.room.track && b.room.track.name) || '')}</div>`
      + rows.map((r, i) => `<div class="mp-board-r${r.self ? ' me' : ''}"><b>${r.best != null ? i + 1 : '–'}</b><span>${esc(r.name)}</span><i>${r.best != null ? formatTime(r.best / 120) : '--:--.---'}</i><em>${r.n ? '×' + r.n : ''}</em></div>`).join('')
      + '<div class="mp-board-f">R : nouvel essai · Échap : quitter</div>';
  }

  _removeBoard() { if (this._board) { this._board.el.remove(); this._board = null; } }

  nextTrack() {
    const opts = this.session ? this.session.opts : {};
    if (opts.builtinIndex == null || opts.builtinIndex >= this.builtins.length - 1) return;
    const next = opts.builtinIndex + 1;
    const medalOf = (i) => { const b = this.builtins[i]; const rec = getRecord(b.key); return rec ? medalFor(rec.time, b.def.medals) : null; };
    const ch = Math.floor(next / CHAPTER_SIZE);
    if (!chapterUnlocked(ch, medalOf, this.builtins.length)) {
      this.ui.flash(`Chapitre ${ch + 1} verrouillé : gagne ${UNLOCK_MEDALS} médailles au chapitre ${ch}.`, 2.6);
      this.audio.error();
      return;
    }
    this.playBuiltin(next);
  }

  openEditor(state) {
    this._dispose();
    this.mode = 'editor';
    this.ui.showScreen(null);
    this.ui.setMode('editor');
    this.session = new EditorSession(this, state || getEditorDraft() || {});
    this.audio.music.play('menu', 3, 0);
    this._resize();
  }

  _keysOf(action) {
    const k = (this.input.bindings[action] || []).filter(Boolean).map(keyLabel);
    return k.length ? k.join(' / ') : '—';
  }

  editorHelp() {
    const L = (a) => this._keysOf(a);
    const rows = [
      ['Clic', 'Poser (glisser : plusieurs)'],
      ['Clic droit', 'Supprimer'],
      ['Clic droit glissé', 'Tourner la vue'],
      ['Clic molette', 'Pipette'],
      ['Clic molette glissé', 'Déplacer la vue'],
      ['Molette', 'Zoom (Alt : taille du décor)'],
      ['Maj + molette', 'Niveau + / −'],
      ['Maj + souris', 'Inspecter : déplacer à la verticale'],
      [L('ed.levelUp') + ' / ' + L('ed.levelDown'), 'Niveau + / −'],
      [L('ed.rotate'), 'Pivoter (Maj : sens inverse)'],
      [L('ed.mirror'), 'Miroir gauche / droite'],
      [L('ed.nextPiece'), 'Pièce suivante (Maj : précédente)'],
      ['Q', 'Sélection de zone'],
      [L('ed.inspect'), 'Inspecter (propriétés, gizmos)'],
      ['Ctrl + D', 'Dupliquer la pièce inspectée'],
      ['Ctrl + C / X / V / A', 'Copier / couper / coller / tout'],
      [L('ed.levelView'), 'Vue par niveau'],
      [L('ed.verify'), 'Vérifier le circuit'],
      [L('ed.params'), 'Niveau : nom, description, réglages'],
      ['Maj + ' + L('ed.test'), 'Tester depuis la pièce visée'],
      [L('ed.surface'), 'Revêtement suivant'],
      [L('ed.fill'), 'Pot de peinture (pièces liées ou zone vide fermée)'],
      [L('ed.snap'), 'Accrochage des décors'],
      [L('ed.scaleUp') + ' / ' + L('ed.scaleDown'), 'Taille du décor'],
      [L('ed.erase'), 'Gomme (répéter : filtre)'],
      [`${L('accelerate')} ${L('left')} ${L('brake')} ${L('right')}`, 'Déplacer la vue'],
      [L('ed.recenter') + ' · ' + L('ed.topView') + ' · ' + L('ed.grid'), 'Recentrer · dessus · grille'],
      [L('ed.test'), 'Tester'],
      ['Ctrl + Z / Y / S', 'Annuler / rétablir / enregistrer'],
      ['Manette', 'Stick droit : curseur · A : poser · B : effacer · X : pivoter · Y : tester · LB/RB : niveau'],
    ];
    this.ui.modal({
      title: 'Raccourcis de l’éditeur',
      wide: true,
      body: `<div class="kbd-list">${rows.map(([k, v]) => `<b>${esc(k)}</b><span>${esc(v)}</span>`).join('')}</div>
        <p style="margin-top:14px">Touches modifiables : Profil › Commandes.</p>`,
      actions: [{ label: 'OK', primary: true }],
    });
  }

  leaveEditor() {
    this.showMenu('menu');
  }

  // Test depuis l'éditeur. verify : course complète qui vérifie le circuit (temps de l'auteur).
  testTrack(state, spawn = null, verify = false) {
    this.editorState = state;
    const track = Track.decode(state.code);
    this.playTrack(track, { fromEditor: true, verify: verify && !spawn, trackKey: 'e-' + hashString(state.code), seed: 'editeur-test', spawn });
    if (!track.count('finish') && !verify) this.ui.flash('Essai libre : ce circuit n’a pas d’arrivée (Échap pour revenir à l’éditeur).', 3);
    else if (spawn) this.ui.flash('Test depuis la pièce visée : sans checkpoints, médaille ni vérification.', 2.6);
    else if (verify) this.ui.flash('Vérification : termine le circuit. Ton temps deviendra la médaille cristal.', 2.6);
  }

  // ------------------------------------------------------------ Écrans
  _renderTracks() {
    const list = $('track-list');
    list.innerHTML = '';
    const medalOf = (i) => { const b = this.builtins[i]; const rec = getRecord(b.key); return rec ? medalFor(rec.time, b.def.medals) : null; };
    // Défi du jour
    const dailyBox = document.createElement('div');
    dailyBox.className = 'track-group';
    dailyBox.innerHTML = '<h3 class="group-title"><i style="background:#ffd23e"></i>Défi du jour</h3>';
    const dGrid = document.createElement('div');
    dGrid.className = 'card-grid';
    const dc = document.createElement('div');
    dc.className = 'card daily-card';
    dc.tabIndex = 0;
    const today = dayKey();
    const drec = getRecord('daily-' + today);
    dc.innerHTML = `<h3>Défi du ${today.split('-').reverse().join('/')}</h3>
      <div class="meta">Un nouveau circuit chaque jour, le même pour tout le monde.</div>
      <div class="best">${drec ? formatTime(drec.time) : '<span class="meta">Pas encore de temps aujourd’hui</span>'}<button class="btn board-btn" data-board="1" title="Classement du jour">🏆</button></div>`;
    dc.querySelector('[data-board]').addEventListener('click', (e) => {
      e.stopPropagation(); this.audio.click();
      const c = dailyChallenge();
      if (c) this.leaderboardModal(c.key, c.track.name, c.track);
    });
    const goDaily = () => { this.audio.click(); this.playDaily(); };
    dc.addEventListener('click', goDaily);
    dc.addEventListener('keydown', (e) => { if (e.key === 'Enter') goDaily(); });
    dGrid.appendChild(dc);
    dailyBox.appendChild(dGrid);
    list.appendChild(dailyBox);

    const decorColor = { desert: '#ff8c5a', polar: '#7fe9ff', jungle: '#2dffb0', city: '#ff3d8a', isles: '#ffd66b', volcano: '#ff5a2a', orbit: '#b9a6ff', caves: '#b48cff', sky: '#9fd8ff', reef: '#2fd3b5', factory: '#ffb070' };
    const total = this.builtins.length;
    for (let ch = 0; ch * CHAPTER_SIZE < total; ch++) {
      const open = chapterUnlocked(ch, medalOf, total);
      const idx = [];
      for (let i = ch * CHAPTER_SIZE; i < Math.min(total, (ch + 1) * CHAPTER_SIZE); i++) idx.push(i);
      const medals = idx.filter((i) => medalOf(i)).length;
      const goals = idx.filter((i) => goalDone(this.builtins[i].key + '#goal')).length;
      const C = CHAPTERS[ch] || { name: `Chapitre ${ch + 1}`, desc: '' };
      const g = document.createElement('div');
      g.className = 'track-group';
      g.innerHTML = `<div class="chapter-head"><h3 class="group-title"><i style="background:${open ? '#5ff2ff' : '#555'}"></i>Chapitre ${ch + 1} · ${esc(C.name)}${open ? '' : ' 🔒'}</h3>
        <span class="prog">${medals} / ${idx.length} médailles · ${goals} / ${idx.length} objectifs bonus</span></div>
        <p class="chapter-desc">${esc(C.desc)}${open ? '' : ` — Gagne ${UNLOCK_MEDALS} médailles au chapitre ${ch} pour l’ouvrir.`}</p>`;
      const grid = document.createElement('div');
      grid.className = 'card-grid';
      for (const i of idx) {
        const b = this.builtins[i];
        const rec = getRecord(b.key);
        const medal = rec ? medalFor(rec.time, b.def.medals) : null;
        const goal = goalFor(b.def, i);
        const gdone = goalDone(b.key + '#goal');
        const tags = this._trackTags(b.track);
        const card = document.createElement('div');
        card.className = 'card ' + b.track.decor + (open ? '' : ' locked');
        card.tabIndex = 0;
        card.innerHTML = `<div class="num">${i + 1}</div>
          <img class="thumb" alt="" src="${thumbnail(b.track, 'b-' + b.key)}">
          <h3>${esc(b.def.name)}<span class="decor-chip" style="color:${decorColor[b.track.decor] || '#fff'}">${esc(DECORS[b.track.decor].label)}</span></h3>
          <div class="meta"><span class="diff">${'◆'.repeat(b.def.difficulty)}${'◇'.repeat(5 - b.def.difficulty)}</span> · ${b.track.tiles.length} pièces</div>
          ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
          <div class="goal${gdone ? ' done' : ''}">★ ${esc(goalLabel(goal))}${gdone ? ' ✓' : ''}</div>
          <div class="best">${b.def.medals ? medalIcon(medal) : ''}${rec ? formatTime(rec.time) : '<span class="meta">Pas encore de temps</span>'}<button class="btn board-btn" data-board="1" title="Classement en ligne">🏆</button></div>
          ${open ? '' : '<div class="lock">🔒</div>'}`;
        card.querySelector('[data-board]').addEventListener('click', (e) => { e.stopPropagation(); this.audio.click(); this.leaderboardModal(b.key, b.def.name, b.track); });
        const go = () => {
          this.audio.click();
          if (!open) { this.ui.flash(`Chapitre verrouillé : gagne ${UNLOCK_MEDALS} médailles au chapitre ${ch}.`); this.audio.error(); return; }
          this.playBuiltin(i);
        };
        card.addEventListener('click', go);
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        grid.appendChild(card);
      }
      g.appendChild(grid);
      list.appendChild(g);
    }
  }

  _trackTags(track) {
    const tags = [];
    const has = (fn) => track.tiles.some(fn);
    if (has((t) => PIECES[t.t].kind === 'loop')) tags.push('Looping');
    if (has((t) => t.t === 'steep')) tags.push('Sauts');
    if (has((t) => t.t === 'bank' || t.t === 'bankBig')) tags.push('Virage relevé');
    if (has((t) => t.t === 'tube' || t.t === 'tubeMid')) tags.push('Tube');
    if (has((t) => t.t === 'cork' || t.t === 'corkL')) tags.push('Tire-bouchon');
    if (has((t) => PIECES[t.t].kind === 'fork')) tags.push('Bifurcation');
    if (has((t) => PIECES[t.t].kind === 'ring')) tags.push('Anneaux');
    if (has((t) => t.t === 'wall')) tags.push('Mur');
    if (has((t) => t.s === 'water' || t.s === 'boat')) tags.push('Bateau');
    if (has((t) => t.s === 'glider')) tags.push('Deltaplane');
    if (has((t) => t.s === 'moto')) tags.push('Moto');
    if (has((t) => t.s === 'ice')) tags.push('Verglas');
    if (has((t) => t.s === 'bounce')) tags.push('Rebond');
    if (has((t) => t.s === 'gravity')) tags.push('Gravité');
    if (has((t) => t.s === 'wind')) tags.push('Vent');
    if (has((t) => t.s === 'powder')) tags.push('Terrain');
    if (has((t) => t.tn)) tags.push('Tunnel');
    if (has((t) => t.nb)) tags.push('Sans bordures');
    if ((track.laps || 1) > 1) tags.push(`${track.laps} tours`);
    return tags.slice(0, 6);
  }

  playDaily() {
    const t0 = performance.now();
    const c = dailyChallenge();
    if (!c) { this.ui.flash('Le défi du jour n’a pas pu être généré.'); return; }
    this.playTrack(c.track, { trackKey: c.key, medals: c.medals, difficulty: 3, seed: c.key, daily: true });
    if (performance.now() - t0 > 50) this.ui.flash('Nouveau défi du jour !', 1.5);
  }

  // ------------------------------------------------------------ Commandes
  _renderControls(tab = this._bindTab || 'race') {
    this._bindTab = tab;
    document.querySelectorAll('#bind-tabs .tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
    $('bind-hint').textContent = tab === 'pad'
      ? 'Clique une case, puis le bouton voulu (Échap : annuler). Éditeur : stick droit = curseur, gâchettes = zoom.'
      : 'Clique une case, puis la touche voulue (Échap : annuler, × : vider).';
    const list = $('bind-list');
    list.innerHTML = '';
    const s = this.settings;
    if (tab === 'pad') {
      const slider = (label, key, min, max, step, fmt) => {
        const row = document.createElement('div');
        row.className = 'bind-slider';
        row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}"><b>${fmt(s[key])}</b>`;
        const inp = row.querySelector('input'), out = row.querySelector('b');
        inp.oninput = () => {
          s[key] = parseFloat(inp.value); out.textContent = fmt(s[key]); this.saveSettings();
          this.input.setPadConfig({ deadzone: s.padDeadzone, sens: s.padSens, rumble: s.haptics });
        };
        list.appendChild(row);
      };
      slider('Zone morte du stick', 'padDeadzone', 0, 0.4, 0.01, (v) => Math.round(v * 100) + ' %');
      slider('Sensibilité de la direction', 'padSens', 0.6, 1.6, 0.05, (v) => '×' + v.toFixed(2));
      const groups = [['Course', PAD_ACTIONS.race], ['Menus', PAD_ACTIONS.menu], ['Éditeur', PAD_ACTIONS.editor]];
      for (const [gl, acts] of groups) {
        const gh = document.createElement('div');
        gh.className = 'bind-group';
        gh.textContent = gl;
        list.appendChild(gh);
        for (const [id, label] of acts) {
          const cur = this.input.pad[id] || [-1, -1];
          const lbl = document.createElement('div');
          lbl.className = 'lbl';
          lbl.textContent = label;
          list.appendChild(lbl);
          for (let slot = 0; slot < 2; slot++) {
            const b = document.createElement('button');
            b.className = 'bind-key';
            b.innerHTML = `<span>${padLabel(cur[slot])}</span>`;
            b.addEventListener('click', () => this._capturePad(id, slot, b));
            list.appendChild(b);
          }
        }
      }
      return;
    }
    const group = KEY_ACTIONS[tab];
    for (const [id, label] of group) {
      const cur = this.input.bindings[id] || ['', ''];
      const lbl = document.createElement('div');
      lbl.className = 'lbl';
      lbl.textContent = label;
      list.appendChild(lbl);
      for (let slot = 0; slot < 2; slot++) {
        const b = document.createElement('button');
        b.className = 'bind-key';
        b.innerHTML = `<span>${esc(keyLabel(cur[slot]))}</span>${cur[slot] ? '<span class="x" title="Vider">×</span>' : ''}`;
        b.addEventListener('click', (e) => {
          if (e.target.classList.contains('x')) {
            this._setKey(id, slot, '');
            this._renderControls();
            return;
          }
          b.classList.add('wait');
          b.innerHTML = '<span>Appuie sur une touche…</span>';
          this.input.captureKey((code) => {
            if (code) {
              const moved = this._setKey(id, slot, code, tab);
              if (moved) this.ui.flash(`« ${keyLabel(code)} » retirée de : ${moved}`);
            }
            this._renderControls();
          });
        });
        list.appendChild(b);
      }
    }
    void s;
  }

  _setKey(id, slot, code, tab = null) {
    const keys = this.input.bindings;
    let moved = null;
    if (code && tab) {
      for (const [other, label] of KEY_ACTIONS[tab]) {
        const arr = keys[other];
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] === code && !(other === id && i === slot)) { arr[i] = ''; moved = label; }
        }
      }
    }
    keys[id] = (keys[id] || ['', '']).slice();
    keys[id][slot] = code;
    this.settings.keys = { ...keys };
    this.saveSettings();
    return moved;
  }

  _capturePad(id, slot, btn) {
    btn.classList.add('wait');
    btn.innerHTML = '<span>Appuie sur un bouton…</span>';
    this.input.padButtonPressed();
    const started = performance.now();
    let cancelled = false;
    this.input.captureKey(() => { cancelled = true; });
    const poll = () => {
      if (cancelled || performance.now() - started > 8000) { this.input.capture = null; this._renderControls(); return; }
      const i = this.input.padButtonPressed();
      if (i >= 0) {
        this.input.capture = null;
        for (const arr of Object.values(this.input.pad)) for (let k = 0; k < arr.length; k++) if (arr[k] === i) arr[k] = -1;
        this.input.pad[id][slot] = i;
        this.settings.pad = JSON.parse(JSON.stringify(this.input.pad));
        this.saveSettings();
        this._renderControls();
        return;
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }

  _renderMyTracks() {
    const list = $('my-list');
    list.innerHTML = '';
    const tracks = listMyTracks();
    if (!tracks.length) {
      list.innerHTML = '<div class="empty">Aucun circuit. Crée-en un ou importe un code.</div>';
      return;
    }
    for (const entry of tracks) {
      let track = null;
      try { track = Track.decode(entry.code); } catch { /* code abîmé */ }
      const rec = track ? getRecord(track.userKey) || getRecord('u-' + hashString(track.encode())) : null;
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `${track ? `<img class="thumb" alt="" src="${thumbnail(track, 'u-' + entry.code.length + '-' + hashString(entry.code))}">` : ''}
        <h3>${esc(entry.name)}</h3>
        <div class="meta">${track ? track.tiles.length : '?'} pièces${track && track.laps > 1 ? ` · ${track.laps} tours` : ''} · modifié le ${new Date(entry.updated || Date.now()).toLocaleDateString('fr-FR')}</div>
        <div class="best">${rec ? formatTime(rec.time) : '<span class="meta">Pas encore de temps</span>'}</div>
        <div class="actions">
          <button class="btn primary" data-a="play">Jouer</button>
          <button class="btn" data-a="edit">Éditer</button>
          <button class="btn" data-a="share">Partager</button>
          <button class="btn danger" data-a="del">Supprimer</button>
        </div>`;
      card.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        if (!a) return;
        this.audio.click();
        if (a.dataset.a === 'play') this.playCode(entry.code, entry.id);
        if (a.dataset.a === 'edit') this.openEditor({ code: entry.code, entryId: entry.id, name: entry.name });
        if (a.dataset.a === 'share') this.shareModal(entry.code, entry.name, track);
        if (a.dataset.a === 'del') {
          this.ui.modal({
            title: 'Supprimer ce circuit ?',
            body: `<p>« ${esc(entry.name)} » sera supprimé de ce navigateur.</p>`,
            actions: [
              { label: 'Annuler' },
              { label: 'Supprimer', danger: true, onClick: () => { deleteMyTrack(entry.id); this._renderMyTracks(); } },
            ],
          });
        }
      });
      list.appendChild(card);
    }
  }

  _renderOptions() {
    const s = this.settings;
    $('opt-volume').value = s.volume;
    $('opt-quality').value = s.quality;
    this._renderQualityInfo();
    $('opt-ghost').checked = s.ghost;
    $('opt-ghostgold').checked = s.ghostGold !== false;
    $('opt-ghostimp').checked = s.ghostImported !== false;
    $('opt-onlinescores').checked = s.onlineScores !== false;
    $('opt-name').value = s.playerName;
    $('opt-name').readOnly = this.identity.kind === 'account';     // le pseudo d'un compte ne change pas
    $('opt-name').title = this.identity.kind === 'account' ? 'Pseudo du compte (non modifiable)' : '';
    $('opt-touch').value = s.touchMode;
    $('opt-haptics').checked = s.haptics;
    $('opt-music').value = s.musicVolume;
    $('opt-fps').checked = !!s.showFps;
    $('opt-speedfx').checked = s.speedFx !== false;
    $('opt-cb').checked = !!s.colorblind;
    $('opt-fov').value = s.fovAdd; $('opt-fov-v').textContent = (s.fovAdd > 0 ? '+' : '') + s.fovAdd + '°';
    $('opt-shake').value = s.shakeAmt; $('opt-shake-v').textContent = Math.round(s.shakeAmt * 100) + ' %';
    $('opt-ui').value = s.uiScale; $('opt-ui-v').textContent = Math.round(s.uiScale * 100) + ' %';
  }

  // Taille de l'interface, compteur d'images, couleurs adaptées.
  _applyAccess() {
    const s = this.settings;
    document.documentElement.style.setProperty('--ui-scale', String(s.uiScale || 1));
    document.body.classList.toggle('cb', !!s.colorblind);
    $('fps').classList.toggle('hidden', !s.showFps);
    if (this._cbApplied !== !!s.colorblind) {
      this._cbApplied = !!s.colorblind;
      setColorblind(this._cbApplied);
      if (this.session) this.ui.flash('Couleurs appliquées à la prochaine course');
    }
  }

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
    if (!verified && this.session instanceof EditorSession) actions.push({ label: '✔ Vérifier d’abord', primary: true, onClick: () => { this.session.verify(); } });
    if (verified && tr) actions.push({ label: '🌐 Publier dans la communauté', primary: true, onClick: () => { this.publishTrack(tr); return true; } });
    actions.push({ label: 'Copier le code', onClick: () => copy(code, 'Code copié !') });
    actions.push({ label: 'Copier le lien', onClick: () => copy(url, 'Lien copié !') });
    actions.push({ label: 'Fermer' });
    this.ui.modal({ title: 'Partager le circuit', body: wrap, actions });
  }

  // ---- Classements en ligne --------------------------------------------------------
  // Fin de course : si c'est un record local, on l'envoie (le serveur rejoue la course).
  async onRaceFinished(session, time, isRecord) {
    const key = session.trackKey;
    if (!key || !/^(b-|daily-|u-)/.test(key) || session.opts.fromEditor || session.opts.spawn || session.replay) return;
    if (this.settings.onlineScores === false || !isRecord || !session.lastRun) return;
    const el = $('fin-online');
    el.classList.remove('hidden');
    el.className = 'fin-online';
    el.textContent = '🌍 Envoi au classement…';
    try {
      const r = await online.submitScore({
        trackKey: key, code: key.startsWith('u-') ? session.track.encode() : '',
        inputs: session.lastRun.inputs, time, physVer: PV,
      }, this.settings.playerName);
      // Le serveur a accepté la course : on s'assure que la progression locale la contient (mise à jour sûre si l'écriture de
      // fin de course avait échoué : stockage plein, autre onglet…). Les médailles et le menu se lisent depuis ces records.
      this._ensureLocalRecord(key, time, session);
      if (this.session !== session) return;
      el.className = 'fin-online ok';
      el.textContent = r.improved
        ? `🌍 Classement mondial : ${r.rank}${r.rank === 1 ? 'er' : 'e'} sur ${r.total}${r.rank === 1 ? ' — meilleur temps du monde !' : ''}`
        : `🌍 Meilleur temps en ligne : ${formatTime(r.best)} (${r.rank}${r.rank === 1 ? 'er' : 'e'} sur ${r.total})`;
    } catch (e) {
      if (this.session !== session) return;
      el.className = 'fin-online ko';
      // Version de physique différente : le plus souvent, la fonction serveur « submit-score » n'a pas été redéployée après
      // une mise à jour du jeu (ou la page est une ancienne version en cache). Le record reste enregistré sur l'appareil.
      el.textContent = /Version du jeu différente/.test(e.message)
        ? `🌍 Classement indisponible : serveur d'une autre version (v${PV}). Record gardé ici. Recharge la page.`
        : '🌍 Classement : ' + e.message;
    }
  }

  // Garantit que le record local de `key` est au moins aussi bon que `time`, puis rafraîchit l'écran de sélection s'il est affiché.
  _ensureLocalRecord(key, time, session = null) {
    const cur = getRecord(key);
    if (!cur || time < cur.time - 1e-9) {
      saveRecord(key, {
        time, splits: session && session.logic ? session.logic.splits.slice() : [], ghost: null,
        inputs: session && session.lastRun ? session.lastRun.inputs : null, pv: PV, date: Date.now(), name: this.settings.playerName,
      });
    }
    this.refreshProgress();
  }

  // Les listes (niveaux, défi du jour, mes circuits) sont reconstruites à chaque affichage : on ne fait que relancer l'écran courant.
  refreshProgress() {
    if (this.mode === 'menu' && ['menu', 'tracks', 'mytracks'].includes(this._screen)) this.showScreen(this._screen);
  }

  async leaderboardModal(trackKey, name, track = null) {
    const body = document.createElement('div');
    body.innerHTML = '<p class="meta">Chargement du classement…</p>';
    this.ui.modal({ title: `🏆 ${name}`, body, actions: [{ label: 'Fermer', primary: true }] });
    const render = async () => {
      let lb;
      try { lb = await online.leaderboard(trackKey, PV, 10); } catch (e) { body.innerHTML = `<p>Classement indisponible : ${esc(e.message)}</p>`; return; }
      const rec = getRecord(trackKey);
      const canSend = rec && rec.inputs && rec.pv === PV && (!lb.me || rec.time < lb.me.time - 1e-6) && this.settings.onlineScores !== false;
      const rows = lb.top.map((r, i) => `<li class="${r.player === online.uid ? 'me' : ''}"><b>${i + 1}</b><span>${esc((r.players && r.players.name) || '—')}</span><i>${formatTime(r.time)}</i></li>`).join('');
      body.innerHTML = `${lb.top.length ? `<ol class="board">${rows}</ol>` : '<p>Aucun temps pour l’instant : sois le premier !</p>'}
        <p class="meta">${lb.total} pilote${lb.total > 1 ? 's' : ''} classé${lb.total > 1 ? 's' : ''}${lb.me ? ` · ta place : <b>${lb.me.rank}${lb.me.rank === 1 ? 'er' : 'e'}</b> (${formatTime(lb.me.time)})` : ''}.
        Chaque temps est vérifié : le serveur rejoue la course avant de l’accepter.</p>
        ${canSend ? `<button class="btn primary" id="lb-send">Envoyer mon record (${formatTime(rec.time)})</button>` : ''}`;
      const send = body.querySelector('#lb-send');
      if (send) send.onclick = async () => {
        send.disabled = true; send.textContent = 'Vérification…';
        try {
          await online.submitScore({ trackKey, code: trackKey.startsWith('u-') && track ? track.encode() : '', inputs: rec.inputs, time: rec.time, physVer: PV }, this.settings.playerName);
          render();
        } catch (e) { send.textContent = e.message; }
      };
    };
    render();
  }

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
  }

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
  }

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
  }

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
  }

  // Appelé quand le joueur termine la vérification de son circuit depuis l'éditeur :
  // il choisit alors de publier ou de revenir à l'éditeur.
  onEditorTestFinished(time, track) {
    // « Refaire un meilleur temps » : on garde le meilleur des deux.
    if (!(track.verified && track.vt <= time)) track.setVerified(time);
    time = track.vt;
    if (this.editorState) this.editorState.code = track.encode();
    const m = track.derivedMedals;
    setTimeout(() => {
      this.ui.modal({
        title: 'Circuit vérifié ✔',
        body: `<p>Ton temps <b>${formatTime(time)}</b> devient la médaille <b>cristal</b> de « ${esc(track.name)} ».</p>
          <p class="meta">${MEDALS.map((x) => `${medalIcon(x)}${formatTime(m[x.id])}`).join(' · ')}</p>
          <p>Publie-le, ou modifie-le (le tracé devra être revérifié).</p>`,
        actions: [
          { label: '🌐 Publier', primary: true, onClick: () => { this.publishTrack(track).then((ok) => { if (ok) this.quitRace(); }); return true; } },
          { label: 'Retour à l’éditeur', onClick: () => { this.quitRace(); return true; } },
          { label: 'Refaire un meilleur temps', onClick: () => { if (this.session && this.session.restart) this.session.restart(); return true; } },
        ],
      });
    }, 900);
  }

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
  }

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
  }

  // ------------------------------------------------------------ Câblage
  _wire() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) { this.audio.click(); this._action(btn.dataset.action); return; }
      const ed = e.target.closest('[data-ed]');
      if (ed && this.session instanceof EditorSession) { this.audio.click(); this._editorAction(ed.dataset.ed); return; }
      const sel = e.target.closest('[data-sel]');
      if (sel && this.session instanceof EditorSession) { this.audio.click(); this.session.selAction(sel.dataset.sel); }
    });

    $('opt-volume').addEventListener('input', (e) => {
      this.settings.volume = parseFloat(e.target.value);
      this.audio.setVolume(this.settings.volume);
      this.saveSettings();
    });
    $('opt-quality').addEventListener('change', (e) => {
      this.settings.quality = e.target.value;
      if (this.bench) { this.bench.finished = true; this.bench = null; }
      this._applyQuality();
      this.saveSettings();
      this.showMenu('options');
      this._startBench();
    });
    $('opt-quality-redo').addEventListener('click', () => {
      this.settings.quality = 'auto';
      this.settings.gfxProfile = '';
      $('opt-quality').value = 'auto';
      this.saveSettings();
      this.showMenu('options');
      this._startBench(true);
    });
    $('opt-ghost').addEventListener('change', (e) => { this.settings.ghost = e.target.checked; this.saveSettings(); });
    $('opt-ghostgold').addEventListener('change', (e) => { this.settings.ghostGold = e.target.checked; this.saveSettings(); });
    $('opt-ghostimp').addEventListener('change', (e) => { this.settings.ghostImported = e.target.checked; this.saveSettings(); });
    $('opt-onlinescores').addEventListener('change', (e) => { this.settings.onlineScores = e.target.checked; this.saveSettings(); });
    $('opt-music').addEventListener('input', (e) => {
      this.settings.musicVolume = parseFloat(e.target.value);
      this.audio.setMusicVolume(this.settings.musicVolume);
      this.saveSettings();
    });
    $('opt-fps').addEventListener('change', (e) => { this.settings.showFps = e.target.checked; this._applyAccess(); this.saveSettings(); });
    $('opt-speedfx').addEventListener('change', (e) => { this.settings.speedFx = e.target.checked; this.saveSettings(); });
    $('opt-cb').addEventListener('change', (e) => { this.settings.colorblind = e.target.checked; this._applyAccess(); this.saveSettings(); });
    const slider = (id, key, fmt) => {
      const inp = $(id), out = $(id + '-v');
      inp.addEventListener('input', () => {
        this.settings[key] = parseFloat(inp.value);
        if (out) out.textContent = fmt(this.settings[key]);
        this._applyAccess();
        this.saveSettings();
      });
    };
    slider('opt-fov', 'fovAdd', (v) => (v > 0 ? '+' : '') + v + '°');
    slider('opt-shake', 'shakeAmt', (v) => Math.round(v * 100) + ' %');
    slider('opt-ui', 'uiScale', (v) => Math.round(v * 100) + ' %');
    $('opt-touch').addEventListener('change', (e) => {
      this.settings.touchMode = e.target.value;
      document.body.classList.toggle('drag-steer', e.target.value === 'drag');
      this.saveSettings();
    });
    $('opt-haptics').addEventListener('change', (e) => {
      this.settings.haptics = e.target.checked; this.saveSettings();
      this.input.setPadConfig({ rumble: e.target.checked });
    });
    // Pseudo d'invité modifiable (jamais « Player » / « Pilote », jamais vide) ; celui d'un compte est figé.
    $('opt-name').addEventListener('input', (e) => {
      if (this.identity.kind === 'account') { e.target.value = this.identity.username; return; }
      const c = checkPseudo(e.target.value);
      e.target.setCustomValidity(c.ok ? '' : c.error);
      e.target.classList.toggle('bad', !c.ok);
      if (c.ok) { this.settings.playerName = c.name; this.identity.username = c.name; this.saveSettings(); }
    });
    $('opt-name').addEventListener('blur', (e) => {
      if (this.identity.kind !== 'account' && !checkPseudo(e.target.value).ok) { e.target.value = this.settings.playerName; e.target.classList.remove('bad'); this.ui.flash('Pseudo inchangé : ' + checkPseudo(e.target.value).error); }
    });
    document.querySelectorAll('#prof-tabs .tab').forEach((t) => t.addEventListener('click', () => { this.audio.click(); this.setProfileTab(t.dataset.ptab); }));
    document.querySelectorAll('#bind-tabs .tab').forEach((t) => t.addEventListener('click', () => { this.audio.click(); this._renderControls(t.dataset.tab); }));
  }

  _action(a) {
    const s = this.session;
    switch (a) {
      case 'play': this.showScreen('tracks'); break;
      case 'daily': this.playDaily(); break;
      case 'community': this.showScreen('community'); break;
      case 'multi': this.multiMenu(); break;
      case 'tutorial': this.tutorial(); break;
      case 'editor': this.openEditor(); break;
      case 'mytracks': this.showScreen('mytracks'); break;
      case 'import': this.importModal(false); break;
      case 'options': this.showScreen('options'); break;
      case 'controls': this.showScreen('controls'); break;
      case 'profile': this.profileTab = 'account'; this.showScreen('profile'); break;
      case 'garage': this.openGarage(); break;
      case 'garage-back': this.showMenu('menu'); break;
      case 'garage-buy': if (s instanceof GarageSession) s.buyDraft(); break;
      case 'garage-revert': if (s instanceof GarageSession) s.revertDraft(); break;
      case 'garage-moto': if (s instanceof GarageSession) s.toggleMoto(); break;
      case 'fullscreen': this.toggleFullscreen(); break;
      case 'reset-keys':
        this.input.setBindings(defaultKeys(), defaultPad());
        this.settings.keys = defaultKeys();
        this.settings.pad = defaultPad();
        this.saveSettings();
        this._renderControls();
        this.ui.flash('Commandes par défaut rétablies.');
        break;
      case 'help': this.helpModal(); break;
      case 'back': this.showScreen('menu'); break;
      case 'new-track': this.openEditor({ name: 'Mon circuit', code: null, fresh: true }); break;
      case 'resume': if (s && s.resume) s.resume(); break;
      case 'restart': if (s && s.restart) { this.ui.hideOverlay('pause'); s.restart(); } break;
      case 'quit': this.quitRace(); break;
      case 'watch-replay': this.watchReplay(); break;
      case 'share-ghost': this.shareGhost(); break;
      case 'leaderboard': {
        const s = this.session;
        if (s && s.trackKey) this.leaderboardModal(s.trackKey, s.track.name, s.track);
        break;
      }
      case 'next': this.nextTrack(); break;
      case 'reset-records':
        this.ui.modal({
          title: 'Effacer les records ?',
          body: '<p>Tous les temps et fantômes enregistrés dans ce navigateur seront supprimés.</p>',
          actions: [
            { label: 'Annuler' },
            { label: 'Effacer', danger: true, onClick: () => {
              clearRecords();
              this.ui.flash('Records effacés.');
            } },
          ],
        });
        break;
      default: break;
    }
  }

  _editorAction(a) {
    const ed = this.session;
    if (a === 'menu-toggle') { ed.toggleMenu(); return; }
    ed.toggleMenu(false);          // toute autre action (y compris un élément du menu hamburger) referme le menu
    switch (a) {
      case 'menu': this.leaveEditor(); break;
      case 'undo': ed.undo(); break;
      case 'redo': ed.redo(); break;
      case 'save': ed.save(); break;
      case 'test': ed.test(); break;
      case 'rotate': ed.rotate(1); break;
      case 'lvl-up': ed.setLevel(ed.level + 1); break;
      case 'lvl-down': ed.setLevel(ed.level - 1); break;
      case 'help': this.editorHelp(); break;
      case 'verify': ed.verify(); break;
      case 'params': ed.openParams(); break;
      case 'testhere': ed.testHere(); break;
      case 'levelview': ed.toggleLevelView(); break;
      case 'export': this.shareModal(ed.track.encode(), ed.track.name, ed.track); break;
      case 'import': this.importModal(true); break;
      case 'new':
        this.ui.modal({
          title: 'Nouveau circuit ?',
          body: '<p>Le circuit actuel sera remplacé (pense à l’enregistrer d’abord).</p>',
          actions: [{ label: 'Annuler' }, { label: 'Nouveau', primary: true, onClick: () => ed.newTrack() }],
        });
        break;
      default: break;
    }
  }

  _wireTouch() {
    const t = this.input.touch;
    const zone = $('t-zone');
    let zx = null;
    zone.addEventListener('pointerdown', (e) => { e.preventDefault(); zx = e.clientX; t.analog = 0; try { zone.setPointerCapture(e.pointerId); } catch { /* pointeur synthétique */ } this.audio.unlock(); });
    zone.addEventListener('pointermove', (e) => { if (zx != null) t.analog = Math.max(-1, Math.min(1, (e.clientX - zx) / 55)); });
    const end = () => { zx = null; t.analog = null; };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    document.querySelectorAll('#touch [data-t]').forEach((b) => {
      const k = b.dataset.t;
      const on = (e) => {
        e.preventDefault();
        b.classList.add('on');
        if (k in t) t[k] = true;
        else if (k === 'respawn') this.input.pressed.add('KeyR');
        else if (k === 'pause') this.input.pressed.add('Escape');
        else if (k === 'restart') this.input.pressed.add('Enter');
        this.audio.unlock();
      };
      const off = (e) => {
        e.preventDefault();
        b.classList.remove('on');
        if (k in t) t[k] = false;
      };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
    });
  }

  // ------------------------------------------------------------ Garage / profil
  openGarage() {
    this._dispose();
    this.mode = 'garage';
    this.ui.showScreen(null);
    this.ui.setMode('garage');
    this.session = new GarageSession(this);
    $('garage').classList.remove('hidden');
    const tabs = $('garage-tabs');
    tabs.innerHTML = '';
    for (const c of CATEGORIES) {
      const b = document.createElement('button');
      b.className = 'tab';
      b.dataset.cat = c.id;
      b.textContent = c.label;
      b.onclick = () => { this.audio.click(); this.session.setCat(c.id); };
      tabs.appendChild(b);
    }
    this.session._render();
    this._resize();
  }

  toggleFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    const p = el.requestFullscreen ? el.requestFullscreen() : null;
    if (p && p.then) {
      p.then(() => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }).catch(() => this.ui.flash('Plein écran indisponible sur cet appareil.'));
    }
  }

  // Écran Profil : quatre onglets (Compte, Sauvegardes, Options, Commandes).
  setProfileTab(tab) { this.profileTab = tab; this._renderProfile(); }

  async _renderProfile() {
    const tab = ['account', 'saves', 'options', 'controls'].includes(this.profileTab) ? this.profileTab : 'account';
    this.profileTab = tab;
    document.querySelectorAll('#prof-tabs .tab').forEach((t) => { const on = t.dataset.ptab === tab; t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); });
    document.querySelectorAll('.prof-panel').forEach((el) => el.classList.toggle('hidden', el.dataset.ppanel !== tab));
    if (tab === 'account') this._renderProfileAccount();
    else if (tab === 'saves') this._renderSaves();
    else if (tab === 'options') this._renderOptions();
    else this._renderControls();
  }

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
      <p class="prof-note">Code joueur et import / export : onglet <b>Sauvegardes</b>.</p>`;
    this._renderAccountBox(body.querySelector('#prof-account'));
  }

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
  }

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
  }

  _showCode(code) {
    const ta = document.createElement('textarea');
    ta.readOnly = true; ta.value = code;
    this.ui.modal({ title: 'Ton code joueur', body: ta, actions: [{ label: 'Fermer', primary: true }] });
    setTimeout(() => ta.select(), 50);
  }

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
  }

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
  }

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
  }

  // ------------------------------------------------------------ Easter eggs
  _wireEggs() {
    const konami = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
    let ki = 0, typed = '';
    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'menu' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      ki = e.code === konami[ki] ? ki + 1 : e.code === konami[0] ? 1 : 0;
      if (ki === konami.length) {
        ki = 0;
        const p = profile();
        if (!p.eggs.konami) {
          p.eggs.konami = 1; p.owned['led:rainbow'] = 1; addCoins(100);
          saveProfile(); this.ui.updateCoins();
          this.ui.flash('↑↑↓↓←→←→BA : LED arc-en-ciel débloquée et +100 ◆ !', 4);
        } else this.ui.flash('Tu connais déjà ce code 😉');
        this.audio.finish(true);
      }
      if (e.key.length === 1) {
        typed = (typed + e.key.toLowerCase()).slice(-8);
        if (typed.endsWith('moto') && this.session && this.session.car) { this.session.car.setMoto(!this.session.car.isMoto); this.audio.transform(); }
        if (typed.endsWith('disco')) this._disco = !this._disco;
      }
    });
    let clicks = 0, ct = 0;
    document.querySelector('#menu .logo').addEventListener('click', () => {
      const now = performance.now();
      clicks = now - ct < 700 ? clicks + 1 : 1; ct = now;
      if (clicks >= 7) {
        clicks = 0;
        const p = profile();
        $('menu').querySelector('.logo').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg) scale(1.15)' }, { transform: 'rotate(720deg)' }], { duration: 900 });
        this.audio.finish(true);
        if (!p.eggs.logo) { p.eggs.logo = 1; addCoins(25); saveProfile(); this.ui.updateCoins(); this.ui.flash('Tu as cliqué sur le logo 7 fois : +25 ◆ !', 3); }
        else this.ui.flash('Copytrack vous salue ✦', 2);
      }
    });
  }

  // ------------------------------------------------------------ Navigation manette
  _padNav(m) {
    const visible = (el) => el.offsetParent !== null || el.getClientRects().length > 0;
    let root = null;
    if (this.ui.modalOpen) root = $('modal');
    else {
      for (const id of ['finish', 'pause']) if (!$(id).classList.contains('hidden')) { root = $(id); break; }
    }
    if (!root) root = [...document.querySelectorAll('.screen:not(.hidden), #garage:not(.hidden)')][0] || null;
    if (!root) return;
    if (m.back) {
      if (this.ui.modalOpen) { this.ui.closeModal(); return; }
      const back = root.querySelector('[data-action="back"], [data-action="garage-back"], [data-action="options"]');
      if (back) back.click();
      return;
    }
    const items = [...root.querySelectorAll('button:not([disabled]), .card, .gcard, select, input[type=checkbox], input[type=range]')].filter(visible);
    if (!items.length) return;
    let cur = document.activeElement;
    if (!items.includes(cur)) { items[0].focus(); return; }
    if (m.confirm) { cur.click(); return; }
    if (cur.type === 'range' && m.dx) {
      const step = parseFloat(cur.step) || 1;
      cur.value = parseFloat(cur.value) + m.dx * step * 2;
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (!m.dx && !m.dy) return;
    const r0 = cur.getBoundingClientRect();
    const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = null, bs = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
      const along = m.dx ? dx * m.dx : dy * m.dy;
      const cross = m.dx ? Math.abs(dy) : Math.abs(dx);
      if (along <= 4) continue;
      const score = along + cross * 2.2;
      if (score < bs) { bs = score; best = el; }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); this.audio.click(); }
  }

  // ------------------------------------------------------------ Boucle
  start() {
    const hash = location.hash;
    this.showMenu('menu');
    this._startBench();
    // Premier lancement : petit tutoriel (sauf si on arrive par un lien de circuit).
    if (!this.settings.tutorialDone && !hash.startsWith('#t=')) setTimeout(() => { if (!this.ui.modalOpen) this.tutorial(); }, 700);
    if (hash.startsWith('#t=')) {
      try {
        const track = Track.decode(hash);
        history.replaceState(null, '', location.pathname + location.search);
        this.ui.modal({
          title: 'Circuit partagé',
          body: `<p>« ${esc(track.name)} » · ${track.tiles.length} pièces${track.author ? ' · par ' + esc(track.author) : ''}</p>`,
          actions: [
            { label: 'Jouer', primary: true, onClick: () => this.playCode(track.encode()) },
            { label: 'Ouvrir dans l’éditeur', onClick: () => {
              const entry = saveMyTrack({ id: newId(), name: track.name, code: track.encode() });
              this.openEditor({ code: entry.code, entryId: entry.id, name: entry.name });
            } },
            { label: 'Annuler' },
          ],
        });
      } catch { this.ui.flash('Lien de circuit invalide.'); }
    }
    let last = performance.now();
    let rawLast = last;
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      rawLast = last;
      last = now;
      const gmode = this.mode === 'race' ? 'race' : this.mode === 'editor' ? 'editor' : 'menu';
      this.input.pollGamepad(this.ui.modalOpen ? "menu" : gmode);
      const inMenuUi = this.ui.modalOpen || this.mode === 'menu' || this.mode === 'garage'
        || (this.mode === 'race' && (!$('finish').classList.contains('hidden') || !$('pause').classList.contains('hidden')));
      if (inMenuUi) {
        if (this.mode === 'race') this.input.pollGamepad('menu');
        const m = this.input.padMenu();
        if (m && (m.dx || m.dy || m.confirm || m.back) && !this.input.capture) this._padNav(m);
      }
      if (this._disco && this.scenery) this.scenery.sky.material.uniforms.horizon.value.setHSL((now / 4000) % 1, 0.8, 0.55);
      if (this.ui.modalOpen && this.input.hit('Escape')) this.ui.closeModal();
      if (this.mode === 'menu' && !this.ui.modalOpen && this.input.hit('Escape')) this.showScreen('menu');
      if (this.session) this.session.update(dt);
      this.renderer.render(this.scene, this.camera);
      this.quality.tick();
      if (this.bench) {
        // La mesure ne compte que l'animation du menu, visible et sans fenêtre ouverte ; si le joueur part ailleurs, on se rabat sur un profil sûr.
        if (this.mode !== 'menu') { this.bench.abort(); this.bench = null; this._renderQualityInfo(); }
        else this.bench.frame(now, !this.ui.modalOpen && document.visibilityState === 'visible');
      } else {
        const racing = this.mode === 'race' && this.session && this.session.state === 'racing';
        const nm = this.quality.watch((now - rawLast) / 1000, racing, this.settings.quality === 'auto');
        if (nm) { this.settings.gfxProfile = nm; this.saveSettings(); this.ui.flash(`Qualité réduite automatiquement : ${PROFILE_LABELS[nm]}`, 2.5); this._renderQualityInfo(); }
      }
      if (this.settings.showFps) {
        this._fpsN = (this._fpsN || 0) + 1; this._fpsT = (this._fpsT || 0) + dt;
        if (this._fpsT >= 0.5) { $('fps').textContent = `${Math.round(this._fpsN / this._fpsT)} i/s`; this._fpsN = 0; this._fpsT = 0; }
      }
      this.input.clearHits();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

// Application installable et jouable hors ligne (service worker), si le contexte le permet.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* pas grave : le jeu marche sans */ }); });
}

(async () => {
  try {
    // 1. Pseudo d'abord : invité (session) ou compte. Le menu et le jeu ne se chargent qu'ensuite.
    const identity = await runWelcome();
    // 2. Le jeu, avec la progression du bon joueur (la portée de stockage est déjà choisie).
    const app = new App(identity);
    window.shardway = app;
    window.copytrack = app;
    app.start();
    if (identity.kind === 'account') account.sync().catch(() => { /* hors ligne : reprise plus tard */ });
  } catch (err) {
    console.error(err);
    const l = document.getElementById('loading');
    l.classList.remove('hidden');
    l.querySelector('.tagline').textContent = 'Impossible de démarrer le jeu (WebGL indisponible ?) : ' + err.message;
  }
})();
