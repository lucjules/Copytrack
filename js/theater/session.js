// Replay Theater (Copytrack Evolution, E6) : le replay devient une salle d'analyse. Jusqu'à quatre courses sur la piste en même temps (la course
// regardée, rejouée EXACTEMENT par ses commandes, et jusqu'à trois à comparer : un autre record, le fantôme or, un fantôme en ligne), une barre de
// temps où l'on se déplace (en avant comme en arrière), les secteurs et les incidents marqués dessus, et un panneau d'analyse (trajectoires sur la
// carte, vitesses, écarts, secteurs). Construit SUR le mode replay de la course (même rendu, mêmes caméras, même export vidéo) : rien n'est dupliqué.
// Ces méthodes s'ajoutent au prototype de RaceSession (voir race.js) : `this` est l'instance.
//
// Se déplacer dans le temps : un retour en arrière recommence la course et la rejoue sans image ni son jusqu'au pas voulu (la physique est
// déterministe : on retombe exactement au même endroit qu'en lecture continue ; tools/test-browser.mjs le vérifie).
import * as THREE from '../vendor/three.module.min.js';
import { $ } from '../dom.js';
import { DT } from '../constants.js';
import { GhostRunner, newGhostPose } from '../replay.js';
import { parseGhost, decodeFloats } from '../ghostFormat.js';
import { createCar } from '../carModel.js';
import { makeNameLabel } from '../remoteCar.js';
import { formatTime } from '../storage.js';
import { REPLAY_CAMS } from '../race/shared.js';
import { traceFromInputs, traceFromGhost, traceFromBot } from '../analysis/trace.js';
import { makeReference, alignTrace } from '../analysis/reference.js';
import { sectors } from '../analysis/sectors.js';
import { buildTheaterUi, drawTheaterPanel, renderTheaterSectors, renderTheaterRuns } from './panel.js';

export const THEATER_COLORS = ['#ffd23e', '#ff7ad9', '#5ff2ff', '#57f2a6'];
export const THEATER_SPEEDS = [0.25, 0.5, 1, 2, 4];
// Pendant un déplacement dans le temps, la course est rejouée sans son, sans particules, sans vibrations ni messages.
const NOOP = new Proxy(function noop() {}, { get: () => NOOP, apply: () => undefined });
const later = () => new Promise((r) => setTimeout(r, 0));

export const theaterMethods = {
  _theaterSetup() {
    const th = this.opts.theater;
    this._th = null;
    if (!th || !this.replay) return;
    const T = this._th = {
      runs: [{ label: th.label || 'Course', time: this.opts.replay.time, color: THEATER_COLORS[0], kind: 'inputs', inputs: this.opts.replay.inputs }],
      total: this.replay.length, lastUi: 0, lastPanel: 0, panel: !!th.panel, dragging: false, traces: null, sectors: null, marks: [], off: [], cost: 0, costN: 0,
    };
    for (const c of (th.compare || []).slice(0, 3)) {
      const color = THEATER_COLORS[T.runs.length];
      const car = createCar(null, { ghost: true, ghostColor: color });
      car.group.visible = false;
      const label = makeNameLabel(`${c.label} · ${c.time ? formatTime(c.time) : '—'}`);
      if (label) car.group.add(label);
      this.app.scene.add(car.group);
      if (c.kind === 'ghost') {
        const g = parseGhost(c.ghost, c.veh);
        if (!g) { car.dispose(); continue; }
        this.rivals.push({ name: c.label, time: c.time, data: g.data, veh: g.veh, car, label, last: null });
      } else {
        const runner = c.kind === 'gold' ? new GhostRunner(this.track, { bot: true, latK: 0.8 }) : new GhostRunner(this.track, { inputs: c.inputs });
        this.ghosts.push({ runner, car, label, q: new THREE.Quaternion(), pq: new THREE.Quaternion(), pose: newGhostPose(), pose0: newGhostPose() });
      }
      T.runs.push({ ...c, color });
    }
    buildTheaterUi(this, T);
    document.body.classList.add('theater-on');
    this._theaterBindFree();
    this._theaterAnalyse(T);
  },

  // Analyse des courses (traces, référence commune, secteurs) : en tâche de fond, une course à la fois ; la lecture n'attend pas.
  async _theaterAnalyse(T) {
    const traces = [];
    for (const r of T.runs) {
      await later();
      if (this._th !== T) return;
      let tr = null;
      try {
        if (r.kind === 'inputs') tr = traceFromInputs(this.track, r.inputs);
        else if (r.kind === 'gold') tr = traceFromBot(this.track);
        else if (r.kind === 'ghost') tr = traceFromGhost(this.track, decodeFloats(r.ghost), r.veh, { time: r.time });
      } catch { tr = null; }
      traces.push(tr);
    }
    if (this._th !== T || !traces[0]) return;
    const ref = makeReference(this.track, traces[0]);
    if (!ref) return;
    for (const tr of traces) if (tr) alignTrace(tr, ref);
    T.traces = traces;
    T.runs.forEach((r, i) => { if (!r.time && traces[i] && traces[i].finished) r.time = traces[i].time; });
    renderTheaterRuns(T);
    T.sectors = traces.map((tr) => (tr ? sectors(tr, { count: 12 }) : null));
    // Repères sur la barre de temps (en pas de lecture : la course regardée peut avoir reculé à un checkpoint, le chrono aussi, pas la lecture).
    const main = traces[0], tickOf = (i) => (main.k ? main.k[Math.max(0, Math.min(main.n - 1, i))] : (i + 1) * main.every);
    const iAtT = (t) => { let i = 0; while (i < main.n - 1 && main.t[i] < t) i++; return i; };
    T.marks = [];
    for (const s of T.sectors[0] || []) if (s.k < 12) T.marks.push({ kind: 'sector', tick: tickOf(iAtT(s.t1)), label: `S${s.k + 1}` });
    for (const e of main.events) if (e.k === 'respawn' || e.k === 'wall') T.marks.push({ kind: e.k, tick: tickOf(e.i), label: e.k === 'respawn' ? 'Retour au checkpoint' : 'Choc' });
    renderTheaterSectors(this, T);
    if (this._onTheaterAnalysed) this._onTheaterAnalysed(T);
  },

  // Va au pas de lecture `step` : en avant, on rejoue jusque-là ; en arrière, on recommence puis on rejoue (sans image ni son).
  theaterSeek(step) {
    const T = this._th;
    if (!T) return;
    const target = Math.max(0, Math.min(T.total, Math.round(step)));
    if (target < this.tick) this.restart();
    if (target === this.tick) return;
    const app = this.app, saved = { audio: app.audio, particles: app.particles, input: app.input, hud: app.ui.hud };
    app.audio = NOOP; app.particles = NOOP; app.input = NOOP; app.ui.hud = NOOP;
    try { while (this.tick < target && this.state !== 'finished') this._stepOnce(); }
    finally { app.audio = saved.audio; app.particles = saved.particles; app.input = saved.input; app.ui.hud = saved.hud; }
    this.acc = 0;
    this._camCut();
    this._theaterUi(true);
  },

  theaterTogglePause() { this.replayPaused = !this.replayPaused; this._replayHud(); this._theaterUi(true); },
  theaterSpeed(dir) {
    const i = THEATER_SPEEDS.indexOf(this.replaySpeed);
    this.replaySpeed = THEATER_SPEEDS[Math.max(0, Math.min(THEATER_SPEEDS.length - 1, (i < 0 ? 2 : i) + dir))];
    this._replayHud(); this._theaterUi(true);
  },
  theaterCamera() {
    this.replayCam = (this.replayCam + 1) % (this.camList.length + REPLAY_CAMS.length);
    if (this.replayCam < this.camList.length) this.camMode = this.replayCam;
    this._theaterUi(true);
  },
  theaterCameraName() {
    return this.replayCam < this.camList.length ? this.camList[this.replayCam].name : REPLAY_CAMS[this.replayCam - this.camList.length].name;
  },
  theaterTogglePanel() {
    const T = this._th;
    if (!T) return;
    T.panel = !T.panel;
    $('theater-panel').classList.toggle('hidden', !T.panel);
    const b = document.querySelector('#theater [data-th="panel"]');
    if (b) b.setAttribute('aria-pressed', T.panel ? 'true' : 'false');
    if (T.panel && T.map) T.map.resize();
    this._theaterUi(true);
  },

  // Interface à 10 images par seconde ; panneau d'analyse à 5.
  _theaterUi(force = false) {
    const T = this._th;
    if (!T) return;
    const t0 = performance.now(), now = t0;
    if (force || now - T.lastUi >= 100) {
      T.lastUi = now;
      const seek = $('th-seek');
      if (seek && !T.dragging) seek.value = String(this.tick);
      $('th-time').textContent = formatTime(this.logic.steps * DT);
      $('th-play').textContent = this.replayPaused ? '▶' : '❚❚';
      $('th-play').setAttribute('aria-label', this.replayPaused ? 'Lecture' : 'Pause');
      $('th-speed').textContent = `×${this.replaySpeed}`;
      $('th-cam').textContent = this.theaterCameraName();
    }
    if (T.panel && (force || now - T.lastPanel >= 200)) { T.lastPanel = now; drawTheaterPanel(this, T); }
    T.cost += performance.now() - t0; T.costN++;
  },

  // Caméra libre : glisser sur la scène pour tourner autour de la voiture, molette pour s'approcher.
  _theaterBindFree() {
    const T = this._th, cv = this.app.renderer.domElement;
    let drag = null;
    const isFree = () => { const rc = this.replayCam >= this.camList.length ? REPLAY_CAMS[this.replayCam - this.camList.length] : null; return rc && rc.free; };
    const down = (e) => { if (isFree()) drag = { x: e.clientX, y: e.clientY }; };
    const move = (e) => {
      if (!drag || !this._free) return;
      this._free.yaw -= (e.clientX - drag.x) * 0.008;
      this._free.pitch = Math.max(-0.2, Math.min(1.45, this._free.pitch + (e.clientY - drag.y) * 0.006));
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = () => { drag = null; };
    const wheel = (e) => { if (!isFree() || !this._free) return; this._free.dist = Math.max(4, Math.min(80, this._free.dist * (e.deltaY > 0 ? 1.12 : 1 / 1.12))); };
    cv.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); cv.addEventListener('wheel', wheel, { passive: true });
    T.off.push(() => { cv.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); cv.removeEventListener('wheel', wheel); });
  },

  _theaterDispose() {
    const T = this._th;
    this._th = null;
    if (!T) return;
    for (const f of T.off) f();
    if (T.map) T.map.dispose();
    for (const g of this.ghosts) if (g.label && g.label.userData.map) { g.label.userData.map.dispose(); g.label.removeFromParent(); }
    $('theater').classList.add('hidden');
    $('theater-panel').classList.add('hidden');
    document.body.classList.remove('theater-on');
  },
};
