// Point d'entrée : crée le moteur de rendu et orchestre menu / course / éditeur.
import * as THREE from './vendor/three.module.min.js';
import { Scenery } from './scenery.js';
import { createTrackMaterials } from './trackMesh.js';
import { Particles } from './particles.js';
import { Input } from './input.js';
import { GameAudio } from './audio.js';
import { UI, $, esc, medalIcon } from './ui.js';
import { RaceSession, medalFor } from './race.js';
import { EditorSession } from './editor.js';
import { BUILTIN_TRACKS, buildBuiltin } from './tracks.js';
import { Track, hashString } from './track.js';
import { CAR_COLORS } from './carModel.js';
import {
  loadSettings, saveSettings, getRecord, listMyTracks, deleteMyTrack, saveMyTrack, newId,
  getEditorDraft, formatTime,
} from './storage.js';

class App {
  constructor() {
    this.settings = loadSettings();
    const canvas = $('gl');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(66, 1, 0.3, 5000);
    this.materials = createTrackMaterials();
    this.scenery = new Scenery(this.scene, this.settings.quality);
    this.particles = new Particles(this.scene);
    this.input = new Input();
    this.audio = new GameAudio();
    this.audio.setVolume(this.settings.volume);
    this.ui = new UI(this);
    this.session = null;
    this.mode = null;

    this.builtins = BUILTIN_TRACKS.map((def, index) => {
      const track = buildBuiltin(def);
      return { def, track, index, key: `b-${def.id}-${hashString(track.encode())}` };
    });

    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.body.classList.add('touch');
    this._applyQuality();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this._wire();
    this._wireTouch();
  }

  saveSettings() {
    saveSettings(this.settings);
  }

  _applyQuality() {
    const low = this.settings.quality === 'low';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : 2));
    this.renderer.shadowMap.enabled = !low;
    this.scenery.setQuality(this.settings.quality);
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ Navigation
  _dispose() {
    if (this.session) this.session.dispose();
    this.session = null;
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
    this.showScreen(screen);
  }

  showScreen(name) {
    if (name === 'tracks') this._renderTracks();
    if (name === 'mytracks') this._renderMyTracks();
    if (name === 'options') this._renderOptions();
    this.ui.showScreen(name);
  }

  playBuiltin(i) {
    const b = this.builtins[i];
    this.playTrack(b.track, { trackKey: b.key, medals: b.def.medals, hasNext: i < this.builtins.length - 1, builtinIndex: i, seed: b.key });
  }

  playTrack(track, opts) {
    const errs = track.validate();
    if (errs.length) { this.ui.flash(errs.join(' ')); return; }
    this._dispose();
    this.mode = 'race';
    this.ui.showScreen(null);
    this.ui.setMode('race');
    this.session = new RaceSession(this, track, opts);
  }

  playCode(code, entryId = null) {
    let track;
    try { track = Track.decode(code); } catch { this.ui.flash('Code de circuit invalide.'); return; }
    this.playTrack(track, { trackKey: 'u-' + hashString(track.encode()), userEntry: entryId, seed: track.name });
  }

  quitRace() {
    const opts = this.session ? this.session.opts : {};
    if (opts.fromEditor) this.openEditor(this.editorState);
    else if (opts.builtinIndex != null) this.showMenu('tracks');
    else if (opts.userEntry) this.showMenu('mytracks');
    else this.showMenu('menu');
  }

  nextTrack() {
    const opts = this.session ? this.session.opts : {};
    if (opts.builtinIndex != null && opts.builtinIndex < this.builtins.length - 1) this.playBuiltin(opts.builtinIndex + 1);
  }

  openEditor(state) {
    this._dispose();
    this.mode = 'editor';
    this.ui.showScreen(null);
    this.ui.setMode('editor');
    this.session = new EditorSession(this, state || getEditorDraft() || {});
  }

  leaveEditor() {
    this.showMenu('menu');
  }

  testTrack(state) {
    this.editorState = state;
    const track = Track.decode(state.code);
    this.playTrack(track, { fromEditor: true, trackKey: 'e-' + hashString(state.code), seed: 'editeur-test' });
  }

  // ------------------------------------------------------------ Écrans
  _renderTracks() {
    const list = $('track-list');
    list.innerHTML = '';
    this.builtins.forEach((b, i) => {
      const rec = getRecord(b.key);
      const medal = rec ? medalFor(rec.time, b.def.medals) : null;
      const card = document.createElement('div');
      card.className = 'card';
      card.tabIndex = 0;
      card.innerHTML = `<div class="num">${i + 1}</div>
        <h3>${esc(b.def.name)}</h3>
        <div class="meta"><span class="diff">${'◆'.repeat(b.def.difficulty)}${'◇'.repeat(4 - b.def.difficulty)}</span> · ${b.track.tiles.length} pièces</div>
        <div class="best">${b.def.medals ? medalIcon(medal) : ''}${rec ? formatTime(rec.time) : '<span class="meta">Pas encore de temps</span>'}</div>`;
      const go = () => { this.audio.click(); this.playBuiltin(i); };
      card.addEventListener('click', go);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      list.appendChild(card);
    });
  }

  _renderMyTracks() {
    const list = $('my-list');
    list.innerHTML = '';
    const tracks = listMyTracks();
    if (!tracks.length) {
      list.innerHTML = '<div class="empty">Aucun circuit enregistré pour l’instant. Crée le tien dans l’éditeur, ou importe un code partagé.</div>';
      return;
    }
    for (const entry of tracks) {
      let track = null;
      try { track = Track.decode(entry.code); } catch { /* code abîmé */ }
      const rec = track ? getRecord('u-' + hashString(track.encode())) : null;
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<h3>${esc(entry.name)}</h3>
        <div class="meta">${track ? track.tiles.length : '?'} pièces · modifié le ${new Date(entry.updated || Date.now()).toLocaleDateString('fr-FR')}</div>
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
        if (a.dataset.a === 'share') this.shareModal(entry.code, entry.name);
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
    $('opt-ghost').checked = s.ghost;
    $('opt-name').value = s.playerName;
    const sw = $('opt-colors');
    sw.innerHTML = '';
    for (const c of CAR_COLORS) {
      const b = document.createElement('button');
      b.className = 'swatch' + (c === s.carColor ? ' on' : '');
      b.style.background = c;
      b.title = c;
      b.addEventListener('click', () => {
        s.carColor = c;
        this.saveSettings();
        this._renderOptions();
      });
      sw.appendChild(b);
    }
  }

  shareModal(code, name) {
    const url = location.href.split('#')[0] + '#t=' + encodeURIComponent(code);
    const ta = document.createElement('textarea');
    ta.readOnly = true;
    ta.value = code;
    const wrap = document.createElement('div');
    wrap.innerHTML = `<p>Copie ce code (ou le lien) pour partager « ${esc(name)} ». N’importe qui pourra l’importer dans Shardway.</p>`;
    wrap.appendChild(ta);
    const copy = (txt, msg) => {
      const done = () => this.ui.flash(msg);
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, () => { ta.select(); document.execCommand('copy'); done(); });
      else { ta.select(); document.execCommand('copy'); done(); }
      return false;
    };
    this.ui.modal({
      title: 'Partager le circuit',
      body: wrap,
      actions: [
        { label: 'Copier le code', primary: true, onClick: () => copy(code, 'Code copié !') },
        { label: 'Copier le lien', onClick: () => copy(url, 'Lien copié !') },
        { label: 'Fermer' },
      ],
    });
  }

  importModal(fromEditor = false) {
    const ta = document.createElement('textarea');
    ta.placeholder = 'Colle ici un code SHW1:… ou un lien de partage';
    const wrap = document.createElement('div');
    wrap.innerHTML = '<p>Colle le code d’un circuit Shardway.</p>';
    wrap.appendChild(ta);
    const parse = () => {
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
        <b>Espace / Maj</b><span>Dérapage (frein à main)</span>
        <b>R</b><span>Revenir au dernier checkpoint</span>
        <b>Entrée / Retour</b><span>Recommencer la course</span>
        <b>C</b><span>Changer de caméra</span>
        <b>Échap</b><span>Pause</span>
        <b>Manette</b><span>Gâchettes : gaz / frein · stick : direction · X : dérapage · Y : checkpoint</span>
      </div>
      <p style="margin-top:14px">Passe par tous les checkpoints ◆ puis franchis l’arrivée le plus vite possible. Les accélérateurs bleus donnent un gros coup de boost, le verglas fait glisser, les tremplins font décoller.</p>`,
      actions: [{ label: 'OK', primary: true }],
    });
  }

  // ------------------------------------------------------------ Câblage
  _wire() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) { this.audio.click(); this._action(btn.dataset.action); return; }
      const ed = e.target.closest('[data-ed]');
      if (ed && this.session instanceof EditorSession) { this.audio.click(); this._editorAction(ed.dataset.ed); }
    });

    $('opt-volume').addEventListener('input', (e) => {
      this.settings.volume = parseFloat(e.target.value);
      this.audio.setVolume(this.settings.volume);
      this.saveSettings();
    });
    $('opt-quality').addEventListener('change', (e) => {
      this.settings.quality = e.target.value;
      this._applyQuality();
      this.saveSettings();
      this.showMenu('options');
    });
    $('opt-ghost').addEventListener('change', (e) => { this.settings.ghost = e.target.checked; this.saveSettings(); });
    $('opt-name').addEventListener('input', (e) => { this.settings.playerName = e.target.value.slice(0, 20) || 'Pilote'; this.saveSettings(); });
  }

  _action(a) {
    const s = this.session;
    switch (a) {
      case 'play': this.showScreen('tracks'); break;
      case 'editor': this.openEditor(); break;
      case 'mytracks': this.showScreen('mytracks'); break;
      case 'import': this.importModal(false); break;
      case 'options': this.showScreen('options'); break;
      case 'help': this.helpModal(); break;
      case 'back': this.showScreen('menu'); break;
      case 'new-track': this.openEditor({ name: 'Mon circuit', code: null, fresh: true }); break;
      case 'resume': if (s && s.resume) s.resume(); break;
      case 'restart': if (s && s.restart) { this.ui.hideOverlay('pause'); s.restart(); } break;
      case 'quit': this.quitRace(); break;
      case 'next': this.nextTrack(); break;
      case 'reset-records':
        this.ui.modal({
          title: 'Effacer les records ?',
          body: '<p>Tous les temps et fantômes enregistrés dans ce navigateur seront supprimés.</p>',
          actions: [
            { label: 'Annuler' },
            { label: 'Effacer', danger: true, onClick: () => {
              Object.keys(localStorage).filter((k) => k.startsWith('shardway.rec.')).forEach((k) => localStorage.removeItem(k));
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
    switch (a) {
      case 'menu': this.leaveEditor(); break;
      case 'undo': ed.undo(); break;
      case 'redo': ed.redo(); break;
      case 'save': ed.save(); break;
      case 'test': ed.test(); break;
      case 'rotate': ed.rotate(1); break;
      case 'lvl-up': ed.setLevel(ed.level + 1); break;
      case 'lvl-down': ed.setLevel(ed.level - 1); break;
      case 'export': this.shareModal(ed.track.encode(), ed.track.name); break;
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

  // ------------------------------------------------------------ Boucle
  start() {
    const hash = location.hash;
    this.showMenu('menu');
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
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.input.pollGamepadButtons();
      if (this.ui.modalOpen && this.input.hit('Escape')) this.ui.closeModal();
      if (this.mode === 'menu' && this.input.hit('Escape')) this.showScreen('menu');
      if (this.session) this.session.update(dt);
      this.renderer.render(this.scene, this.camera);
      this.input.clearHits();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

try {
  const app = new App();
  window.shardway = app;
  app.start();
} catch (err) {
  console.error(err);
  const l = document.getElementById('loading');
  l.classList.remove('hidden');
  l.querySelector('.tagline').textContent = 'Impossible de démarrer le jeu (WebGL indisponible ?) : ' + err.message;
}
