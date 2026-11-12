// Point d'entrée : crée le moteur de rendu et orchestre menu / course / éditeur.
import * as THREE from './vendor/three.module.min.js';
import { Scenery } from './scenery.js';
import { createTrackMaterials } from './trackMesh.js';
import { renderOptions } from './renderOptions.js';
import { Particles } from './particles.js';
import { Input } from './input.js';
import { GarageSession } from './garage.js';
import { CATEGORIES } from './cosmetics.js';
import { profile } from './profile.js';
import { GameAudio } from './audio.js';
import { UI } from './ui.js';
import { $, esc } from './dom.js';
import { RaceSession } from './race.js';
import { BUILTIN_TRACKS, buildBuiltin } from './tracks.js';
import { Track, hashString, lossText, lossBlocking } from './track.js';
import { VERSION, PHYS_VER } from './version.js';
import { online } from './online.js';
import { account } from './account.js';
import { runWelcome } from './welcome.js';
import { initI18n } from './i18n/boot.js';
import { describeBuiltin, describeUser } from './trackDescriptor.js';
import { loadSettings, saveSettings, getRecord, saveRecord, saveMyTrack, newId, formatTime, purgeOldRecords, getJSON, setJSON } from './storage.js';
import { Telemetry } from './telemetry.js';
import { ghostFromHash } from './replay.js';
import { QualityManager, PROFILE_LABELS, wantAntialias } from './quality.js';
import { multiMethods } from './app/multi.js';
import { academyMethods } from './app/academy.js';
import { competitionMethods } from './app/competition.js';
import { labMethods } from './app/lab.js';
import { rewardsMethods } from './app/rewards.js';
import { communityMethods } from './app/community.js';
import { screenMethods } from './app/screens.js';
import { settingsMethods } from './app/settings.js';
import { profileMethods } from './app/profile.js';
import { wiringMethods } from './app/wiring.js';
import { editorFlowMethods } from './app/editorFlow.js';
import { uiCustomMethods } from './app/uicustom.js';
import { modesMethods } from './app/modes.js';
import { raceHubMethods } from './app/raceHub.js';
import { theaterAppMethods } from './app/theater.js';

const MENU_FPS_CAP = 30;     // images par seconde au plus dans les menus

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
      resize: () => this._resize(), views: () => (this.session && this.session.view ? [this.session.view] : []), setDecoHidden: (v) => { renderOptions.hideDecos = !!v; }, setLights: (b) => { renderOptions.lightBudget = b || { point: 0, spot: 0 }; },
    });
    this.input = new Input();
    this.telemetry = new Telemetry({ store: { get: getJSON, set: setJSON }, send: (events) => online.logRuns(events), enabled: () => this.settings.telemetry === true });
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
    this._wireUiCustom();
    this._wireTouch();
    this._wireEggs();
    window.addEventListener('orientationchange', () => this._resize());
    document.addEventListener('fullscreenchange', () => this._resize());
    document.addEventListener('visibilitychange', () => this._onVisibility());
  }

  // Course en solo interrompue par autre chose que le joueur (onglet masqué, téléphone verrouillé, écran « tourne ton téléphone ») : elle passe en pause. Avant 0.9.59 la
  // boucle s'arrêtait seulement (plus d'images dans un onglet masqué) et la course reprenait d'elle-même au retour, voiture lancée, sans prévenir ; en portrait sur un
  // téléphone elle continuait même SOUS l'écran qui demande de tourner l'appareil. En multijoueur il n'y a pas de pause (les autres courent) : rien ne change.
  _autoPause() {
    const S = this.session;
    if (this.mode === 'race' && S && !S.multi && !S.replay && !S.demo && (S.state === 'racing' || S.state === 'countdown') && typeof S.pause === 'function') S.pause();
  }

  // Onglet masqué : pause (voir _autoPause) et son coupé (la musique continuait de jouer dans un onglet en arrière-plan) ; il revient avec l'onglet.
  _onVisibility() {
    const hidden = document.visibilityState === 'hidden';
    if (hidden) this._autoPause();
    const ctx = this.audio && this.audio.ctx;
    if (!ctx || typeof ctx.suspend !== 'function') return;
    if (hidden && ctx.state === 'running') { this._audioHeld = true; ctx.suspend().catch(() => {}); }
    else if (!hidden && this._audioHeld) { this._audioHeld = false; if (ctx.state === 'suspended') ctx.resume().catch(() => {}); }
  }

  saveSettings() {
    saveSettings(this.settings);
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.session && this.session.kind === 'editor') this.session._refreshUI();
    const portrait = h > w && document.body.classList.contains('touch');
    const rotate = portrait && (this.mode === 'race' || this.mode === 'editor');
    $('rotate-hint').classList.toggle('hidden', !rotate);
    if (rotate) this._autoPause();          // l'écran « tourne ton téléphone » recouvre tout : la course n'avance pas derrière lui
    this._fsButton();
  }

  // Bouton plein écran (tactile) : en course et sur l'écran d'accueil seulement ; sur les autres écrans, il recouvrirait leurs boutons du bas
  // (sur un téléphone en paysage, « Jouer » de la fiche d'un circuit : trouvé par le parcours tactile, E22). Profil › Options › Plein écran reste là.
  _fsButton() {
    $('fs-btn').classList.toggle('hidden', !(document.body.classList.contains('touch') && (this.mode === 'race' || (this.mode === 'menu' && (this._screen || 'menu') === 'menu')) && !document.fullscreenElement));
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

  // Descripteur d'un circuit de la carrière (trackDescriptor.js) : clé, médailles, objectif, verrou de chapitre et options de lancement.
  describeBuiltin(i) {
    return describeBuiltin(this.builtins[i], { total: this.builtins.length, builtins: this.builtins, getRecord });
  }

  playBuiltin(i, extra = {}) {
    this.launchDesc(this.describeBuiltin(i), extra);
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
    // Musique du circuit : celle de l'auteur (ambiance.js) ou le chill de course ; en multijoueur ou en leçon, toujours le chill.
    const mus = !(opts && (opts.multi || opts.academy)) && track.ambiance ? track.ambiance.music : '';
    if (mus === 'none') this.audio.music.stop(); else this.audio.music.play(mus === 'menu' ? 'menu' : 'game');
    this._resize();
  }

  // Une erreur dans une image de la boucle (voir `loop`). Rien n'est avalé en silence : elle est journalisée (console, window.__ctErrors). Pendant une course :
  // 1re erreur d'une série : retour au dernier checkpoint (l'état de la course est peut-être incohérent) ; 2e dans les 5 s : la course est abandonnée proprement
  // (retour au menu, message) ; au-delà, le jeu continue de tourner sans rien tenter de plus.
  _loopError(e) {
    const now = performance.now();
    (window.__ctErrors || (window.__ctErrors = [])).push({ t: Math.round(now), msg: String(e && e.message || e), stack: String(e && e.stack || '').split('\n').slice(0, 4).join(' | ') });
    if (window.__ctErrors.length > 20) window.__ctErrors.shift();
    if (this.mode !== 'race' || !this.session) {      // hors course : rien à reprendre, la boucle continue ; mais le joueur doit le savoir (au plus un message toutes les 15 s : une erreur peut revenir à chaque image)
      this._errTimes = [];
      if (window.__ctErrors.length <= 2) console.error('Copytrack : erreur dans la boucle de jeu', e);
      if (!this._errFlashAt || now - this._errFlashAt > 15000) { this._errFlashAt = now; try { this.ui.flash('Une erreur d’affichage est survenue (détails dans la console du navigateur).', 3.5); } catch { /* l'interface elle-même peut être la cause */ } }
      return;
    }
    this._errTimes = (this._errTimes || []).filter((x) => now - x < 5000);
    this._errTimes.push(now);
    if (this._errTimes.length === 1 || this._errTimes.length === 2) console.error('Copytrack : erreur dans la boucle de jeu', e);
    try {
      const S = this.session;
      if (this._errTimes.length === 1 && S.state === 'racing' && !S.replay && typeof S.respawn === 'function') { S.respawn(); this.ui.flash('Incident : retour au dernier checkpoint.', 2.5); }
      else if (this._errTimes.length === 2) { this.quitRace(); this.ui.flash('Une erreur est survenue : la course a été interrompue.', 4); }
    } catch (e2) { console.error('Copytrack : la reprise après erreur a échoué', e2); }
  }

  playCode(code, entryId = null) {
    let track;
    try { track = Track.decode(code); } catch { this.ui.flash('Code de circuit invalide.'); return; }
    // Circuits de joueurs : médailles déduites du temps de l'auteur, seulement s'il l'a fini (trackDescriptor.js).
    this.launchDesc(describeUser(track, entryId ? { id: entryId } : null));
  }

  // ---- Replays et fantômes ------------------------------------------------
  // « Revoir la course » (écran d'arrivée) : le Replay Theater, avec le record d'avant (ou le record) à côté pour comparer.
  watchReplay() {
    const s = this.session;
    if (!(s instanceof RaceSession) || !s.lastRun) return;
    const compare = [];
    if (s.prevRun && Math.abs(s.prevRun.time - s.lastRun.time) > 1e-9) compare.push({ kind: 'inputs', label: s.lastRunWasRecord ? 'Ancien record' : 'Mon record', inputs: s.prevRun.inputs, time: s.prevRun.time });
    this.openTheater({ track: s.track, opts: s.opts, main: { ...s.lastRun, label: 'Cette course' }, compare, back: { track: s.track, opts: { ...s.opts } } });
  }

  endReplay() {
    $('replay-bar').classList.add('hidden');
    const back = this._replayBack;
    this._replayBack = null;
    if (!back) { this.showMenu('menu'); return; }
    if (back.hub) { this._backToHub(back.hub, back.from); return; }        // replay ouvert depuis la fiche du circuit (raceHub.js)
    this.playTrack(back.track, back.opts);
  }

  quitRace() {
    const opts = this.session ? this.session.opts : {};
    if (opts.multi) { this._leaveRaceToLobby(opts.multi.room); return; }
    if (opts.academy) { this.showMenu('menu'); this.academyMenu(); return; }
    if (opts.mode) { this.showMenu('menu'); this.modesMenu(); return; }
    if (opts.fromEditor) this.openEditor(this.editorState);
    else if (opts.fromHub && this._lastDesc && this._lastDesc.key === opts.trackKey) this._backToHub(this._lastDesc, opts.fromHub);     // course lancée depuis la fiche : on y revient
    else if (opts.builtinIndex != null || opts.daily) this.showMenu('tracks');
    else if (opts.userEntry) this.showMenu('mytracks');
    else if (opts.community) this.showMenu('community');
    else this.showMenu('menu');
  }

  // ------------------------------------------------------------ Multijoueur
  // Salons : création / jonction par code. Supabase Realtime ne sert qu'à se trouver ; la course passe en WebRTC (net/).
  _tokenFn() { return () => online.ensureSession().then((s) => s.access_token); }

  _removeBoard() { if (this._board) { this._board.el.remove(); this._board = null; } }

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
        trackKey: key, code: key.startsWith('u-') ? (session.opts.officialTrack || session.track).encode() : '',      // variante : le code du circuit d'origine
        inputs: session.lastRun.inputs, time, physVer: PHYS_VER,
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
        ? `🌍 Classement indisponible : serveur d'une autre version (v${PHYS_VER}). Record gardé ici. Recharge la page.`
        : '🌍 Classement : ' + e.message;
    }
  }

  // Garantit que le record local de `key` est au moins aussi bon que `time`, puis rafraîchit l'écran de sélection s'il est affiché.
  _ensureLocalRecord(key, time, session = null) {
    const cur = getRecord(key);
    if (!cur || time < cur.time - 1e-9) {
      saveRecord(key, {
        time, splits: session && session.logic ? session.logic.splits.slice() : [], ghost: null,
        inputs: session && session.lastRun ? session.lastRun.inputs : null, pv: PHYS_VER, date: Date.now(), name: this.settings.playerName,
      });
    }
    this.refreshProgress();
  }

  // Les listes (niveaux, défi du jour, mes circuits) sont reconstruites à chaque affichage : on ne fait que relancer l'écran courant.
  refreshProgress() {
    if (this.mode === 'menu' && ['menu', 'tracks', 'mytracks'].includes(this._screen)) this.showScreen(this._screen);
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

  // ------------------------------------------------------------ Boucle
  start() {
    const hash = location.hash;
    this.showMenu('menu');
    this._startBench();
    this.telemetry.scheduleFlush(15000);
    setTimeout(() => this.askTelemetry(), 4000);
    setTimeout(() => this.checkRewards(), 2500);          // rattrape ce qui est déjà mérité (joueur existant)
    // Premier lancement : petit tutoriel (sauf si on arrive par un lien de circuit).
    if (!this.settings.tutorialDone && !hash.startsWith('#t=') && !hash.startsWith('#g=')) setTimeout(() => { if (!this.ui.modalOpen) this.tutorial(); }, 700);
    if (hash.startsWith('#g=')) {
      try {
        const ghost = ghostFromHash(hash);
        history.replaceState(null, '', location.pathname + location.search);
        setTimeout(() => this.openGhostLink(ghost), 400);
      } catch (e) { history.replaceState(null, '', location.pathname + location.search); this.ui.flash(e.message, 4); }
    }
    if (hash.startsWith('#t=')) {
      try {
        const track = Track.decode(hash);
        history.replaceState(null, '', location.pathname + location.search);
        // Phase 4 : un lien qui perdrait des pièces à la lecture (version plus récente du jeu) peut se jouer (pour voir) mais pas s'enregistrer ni s'ouvrir dans l'éditeur.
        const loss = lossText(track), blocked = lossBlocking(track);
        this.ui.modal({
          title: 'Circuit partagé',
          body: `<p>« ${esc(track.name)} » · ${track.tiles.length} pièces${track.author ? ' · par ' + esc(track.author) : ''}</p>${loss ? `<p class="mp-err" role="alert">${esc(loss)}${blocked ? ' Mets le jeu à jour pour l’enregistrer ou l’éditer.' : ''}</p>` : ''}`,
          actions: [
            { label: 'Jouer', primary: true, onClick: () => this.playCode(track.encode()) },
            ...(blocked ? [] : [{ label: 'Ouvrir dans l’éditeur', onClick: () => {
              const entry = saveMyTrack({ id: newId(), name: track.name, code: track.encode() });
              this.openEditor({ code: entry.code, entryId: entry.id, name: entry.name });
            } }]),
            { label: 'Annuler' },
          ],
        });
      } catch { this.ui.flash('Lien de circuit invalide.'); }
    }
    let last = performance.now();
    let rawLast = last;
    const frame = (now) => {
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
      if (this.mode === 'menu' && !this.ui.modalOpen && this.input.hit('Escape')) { if (this._screen === 'race-hub') this.closeRaceHub(); else this.showScreen('menu'); }
      if (this.session) this.session.update(dt);
      // Profil Ultra Potato : on ne dessine qu'une image sur deux (la physique et les commandes continuent à pleine vitesse). Dans les menus (rien à
      // piloter, une simple animation de fond) on dessine à 30 images/s au plus : la machine chauffe moins et la batterie dure. Le banc d'essai de la
      // qualité, qui mesure justement cette animation, passe avant.
      const profileCap = this.quality.profile && this.quality.profile.fpsCap;
      const cap = this.mode === 'menu' && !this.bench ? Math.min(MENU_FPS_CAP, profileCap || MENU_FPS_CAP) : profileCap;
      if (!cap || now - (this._lastDraw || 0) >= 1000 / cap - 4) { this._lastDraw = now; this.renderer.render(this.scene, this.camera); }
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
    };
    // La boucle du jeu NE DOIT JAMAIS S'ARRÊTER : avant 0.9.54, `requestAnimationFrame(loop)` était la dernière instruction du corps, donc UNE exception (physique, course,
    // rendu, interface) la tuait pour de bon : écran figé jusqu'au rechargement, sans message, alors que les boutons de la page répondaient encore (le « gel complet »).
    // Désormais la prochaine image est toujours demandée, les touches « appuyées cette image » toujours effacées, et l'erreur est traitée (voir _loopError).
    const loop = (now) => {
      try { frame(now); } catch (e) { this._loopError(e); } finally {
        try { this.input.clearHits(); } catch { /* sans importance */ }
        requestAnimationFrame(loop);
      }
    };
    requestAnimationFrame(loop);
  }
}

// Les familles de méthodes vivent dans app/ ; elles s'ajoutent au prototype (`this` est l'instance).
Object.assign(App.prototype, multiMethods, academyMethods, competitionMethods, labMethods, rewardsMethods, communityMethods, screenMethods, settingsMethods, profileMethods, wiringMethods, editorFlowMethods, uiCustomMethods, modesMethods, raceHubMethods, theaterAppMethods);


// Application installable et jouable hors ligne (service worker), si le contexte le permet.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* pas grave : le jeu marche sans */ }); });
}

(async () => {
  try {
    // 0. La langue d'abord (réglage de l'appareil) : l'écran d'accueil lui-même est traduit.
    await initI18n();
    // 1. Pseudo d'abord : invité (session) ou compte. Le menu et le jeu ne se chargent qu'ensuite.
    const identity = await runWelcome();
    // 2. Le jeu, avec la progression du bon joueur (la portée de stockage est déjà choisie).
    const app = new App(identity);
    window.copytrack = app;      // accès de débogage et des tests navigateur (tools/test-browser.mjs)
    app.start();
    if (identity.kind === 'account') account.sync().catch(() => { /* hors ligne : reprise plus tard */ });
  } catch (err) {
    console.error(err);
    const l = document.getElementById('loading');
    l.classList.remove('hidden');
    l.querySelector('.tagline').textContent = 'Impossible de démarrer le jeu (WebGL indisponible ?) : ' + err.message;
  }
})();
