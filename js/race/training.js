// HUD d'entraînement (Copytrack Evolution, E5) : écart en direct contre une course de référence, mini-secteurs, vitesse maxi, forces g, courbes
// gaz / frein / vitesse, ligne de la référence et repères de ses freinages, dans la scène. Actif avec le profil de HUD « Entraînement »
// (hudProfile.js). Ne LIT que la course : rien ici ne touche à la physique, au chrono ni à l'enregistrement.
// Ces méthodes s'ajoutent au prototype de RaceSession (voir race.js) : `this` est l'instance.
//
// Référence (réglage) : mon record (ses commandes rejouées : la course exacte), le fantôme or (le pilote automatique, circuits intégrés) ou le
// record mondial (positions du fantôme du n° 1, en ligne). Celle demandée manque ? On prend la suivante et on le dit.
import * as THREE from '../vendor/three.module.min.js';
import { $ } from '../dom.js';
import { DT } from '../constants.js';
import { PHYS_VER } from '../version.js';
import { online } from '../online.js';
import { formatTime } from '../storage.js';
import { decodeFloats } from '../ghostFormat.js';
import { Simulation } from '../simulation.js';
import { Autopilot } from '../autopilot.js';
import { InputRecorder, quantSteer } from '../replay.js';
import { traceFromInputs, traceFromGhost } from '../analysis/trace.js';
import { makeReference, alignTrace } from '../analysis/reference.js';
import { brakingPoints } from '../analysis/sectors.js';
import { createLiveTracker } from '../analysis/live.js';
import { createTraceChart } from '../ui/traceChart.js';
import { isTraining, sanitizeTraining } from '../hudProfile.js';

const G = 9.81;
const UI_MS = 100;                 // le texte du HUD se met à jour 10 fois par seconde (le calcul, à chaque image)
const cache = new Map();           // références déjà calculées (un nouvel essai ne les refait pas)
const CACHE_MAX = 6;
const remember = (k, v) => { if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value); cache.set(k, v); return v; };
const later = () => new Promise((r) => setTimeout(r, 0));

// Le fantôme or : les commandes du pilote automatique (mêmes réglages que le fantôme or de la course), rejouées en trace.
function goldTrace(track) {
  const sim = new Simulation(track), rec = new InputRecorder();
  sim.start();
  const bot = new Autopilot(track.path, { latLimit: 56 * 0.8 });
  bot.reset(sim.phys);
  for (let i = 0; i < 120 * 300; i++) {
    const inp = bot.control(sim.phys);
    inp.steer = quantSteer(inp.steer);
    rec.push(inp, false);
    const ev = sim.step(inp);
    if (sim.lost) { sim.rewind(); bot.reset(sim.phys); }
    if (ev && ev.type === 'finish') return traceFromInputs(track, rec.encode());
  }
  return null;
}

export const trainingMethods = {
  _trainSetup() {
    const el = $('hud-train');
    this._train = null;
    if (!el) return;
    el.classList.add('hidden');
    const s = this.app.settings;
    if (this.demo || this.replay || this.multi || this.opts.academy || this.opts.fromEditor || this.opts.mode || !isTraining(s.hudProfile)) return;
    const cfg = sanitizeTraining(s.training);
    const T = this._train = { cfg, refTrace: null, lt: null, kind: '', label: '', vmax: 0, lastUi: 0, lastPush: -4, lastV: 0, gLon: 0, chart: null, obj: [], cost: 0, costN: 0 };
    el.innerHTML = `<div class="tr-ref" id="tr-ref">Chargement de la référence…</div>
      <div class="tr-delta${cfg.w.delta ? '' : ' hidden'}" id="tr-delta">—</div>
      <div class="tr-sector${cfg.w.sector ? '' : ' hidden'}" id="tr-sector"></div>
      <div class="tr-row"><span class="${cfg.w.vmax ? '' : 'hidden'}" id="tr-vmax"></span><span class="${cfg.w.g ? '' : 'hidden'}" id="tr-g"></span></div>
      <canvas class="tr-chart${cfg.w.traces ? '' : ' hidden'}" id="tr-chart" width="200" height="44" aria-hidden="true"></canvas>`;
    el.classList.remove('hidden');
    if (cfg.w.traces) T.chart = createTraceChart($('tr-chart'), { len: 90, series: [{ fill: 'rgba(87, 242, 166, 0.35)', max: 1 }, { fill: 'rgba(255, 90, 110, 0.5)', max: 1 }, { color: '#ffffff', max: 110 }] });
    this._trainLoadRef(T);
  },

  _trainStatus(txt) { const e = $('tr-ref'); if (e) e.textContent = txt; },

  async _trainLoadRef(T) {
    T.loading = true;
    try { await this._trainFindRef(T); } finally { T.loading = false; }
  },

  async _trainFindRef(T) {
    await later();                   // la première image d'abord : le calcul (une course rejouée, ~0,1 s) se fait pendant le décompte
    const want = T.cfg.ref;
    const order = want === 'world' ? ['world', 'record', 'gold'] : want === 'gold' ? ['gold', 'record'] : ['record', 'gold'];
    for (const kind of order) {
      if (this._train !== T) return;
      let tr = null, label = '';
      try {
        if (kind === 'record') {
          const r = this.record;
          if (r && r.inputs && r.pv === PHYS_VER) {
            const k = `${this.trackKey}|record|${r.time}`;
            tr = cache.get(k) || remember(k, traceFromInputs(this.track, r.inputs));
            label = `Référence : mon record · ${formatTime(r.time)}`;
          }
        } else if (kind === 'gold') {
          if (this.track.path) {
            const k = `${this.trackKey}|gold`;
            tr = cache.get(k) || remember(k, goldTrace(this.track));
            label = tr ? `Référence : fantôme or · ${formatTime(tr.time)}` : '';
          }
        } else if (kind === 'world' && this.trackKey && /^(b-|daily-|u-)/.test(this.trackKey)) {
          const g = await online.ghost(this.trackKey, 1, PHYS_VER);
          if (g) { tr = traceFromGhost(this.track, decodeFloats(g.ghost), g.veh, { time: g.time }); label = `Référence : record mondial · ${g.name} · ${formatTime(g.time)}`; }
        }
      } catch { tr = null; }
      if (this._train !== T) return;
      if (!tr || tr.n < 10 || (kind !== 'world' && !tr.finished)) continue;      // une référence rejouée doit aller jusqu'à l'arrivée
      const ref = makeReference(this.track, tr);
      if (!ref) continue;
      if (!tr.sm || tr.ref !== ref) alignTrace(tr, ref);
      T.refTrace = tr; T.kind = kind; T.label = label;
      T.lt = createLiveTracker(tr);
      if (this.state === 'racing') T.lt.relocate(this.phys.pos.x, this.phys.pos.y, this.phys.pos.z, this.logic.steps * DT);
      this._trainScene(T);
      this._trainStatus(label + (kind !== want ? ' (à défaut)' : ''));
      return;
    }
    if (this._train === T) this._trainStatus('Pas de référence : termine une course pour te comparer à toi-même.');
  },

  // Dans la scène : la ligne de la référence (couleur : gaz vert, frein rouge, roue libre blanc) et ses points de freinage.
  _trainScene(T) {
    this._trainClearScene(T);
    const tr = T.refTrace, scene = this.app.scene;
    if (T.cfg.w.line && tr.n > 1) {
      const pos = new Float32Array(tr.n * 3), col = new Float32Array(tr.n * 3);
      for (let i = 0; i < tr.n; i++) {
        pos[i * 3] = tr.pos[i * 3]; pos[i * 3 + 1] = tr.pos[i * 3 + 1] + 0.45; pos[i * 3 + 2] = tr.pos[i * 3 + 2];
        const b = tr.brk && tr.brk[i], th = tr.thr ? tr.thr[i] : 1;
        col[i * 3] = b ? 1 : th ? 0.35 : 0.95; col[i * 3 + 1] = b ? 0.3 : th ? 1 : 0.95; col[i * 3 + 2] = b ? 0.35 : th ? 0.65 : 0.95;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }));
      line.frustumCulled = false;
      scene.add(line); T.obj.push(line);
    }
    if (T.cfg.w.brakes && tr.brk) {
      const geo = new THREE.ConeGeometry(0.7, 1.6, 8), mat = new THREE.MeshBasicMaterial({ color: 0xff4f5e, transparent: true, opacity: 0.9 });
      for (const b of brakingPoints(tr).slice(0, 60)) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(tr.pos[b.i * 3], tr.pos[b.i * 3 + 1] + 2.2, tr.pos[b.i * 3 + 2]);
        m.rotation.x = Math.PI;              // pointe vers la route
        scene.add(m); T.obj.push(m);
      }
    }
  },

  _trainClearScene(T) {
    const geos = new Set(), mats = new Set();
    for (const o of T.obj) { this.app.scene.remove(o); geos.add(o.geometry); mats.add(o.material); }
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    T.obj = [];
  },

  // Nouvel essai : compteurs remis à zéro ; un nouveau record devient la référence (si c'est celle choisie).
  _trainReset() {
    const T = this._train;
    if (!T) return;
    T.vmax = 0; T.lastPush = -4; T.lastV = 0; T.gLon = 0;
    if (T.lt) T.lt.reset();
    if (T.chart) T.chart.clear();
    const sec = $('tr-sector'); if (sec) sec.textContent = '';
    const d = $('tr-delta'); if (d) { d.textContent = '—'; d.className = 'tr-delta' + (T.cfg.w.delta ? '' : ' hidden'); }
    const r = this.record;
    if (!T.loading && T.kind !== 'world' && T.cfg.ref !== 'gold' && r && r.inputs && r.pv === PHYS_VER && (T.kind !== 'record' || Math.abs(r.time - T.refTrace.time) > 1e-9)) {
      T.lt = null; this._trainStatus('Chargement de la référence…');
      this._trainLoadRef(T);
    }
  },

  _trainRespawn() {
    const T = this._train;
    if (T && T.lt) T.lt.relocate(this.phys.pos.x, this.phys.pos.y, this.phys.pos.z, this.logic.steps * DT);
  },

  _trainFinish(time) {
    const T = this._train;
    if (!T || !T.lt) return;
    const done = T.lt.finish(time);
    if (done && T.cfg.w.sector) this._trainSector(done);
    const d = $('tr-delta');
    if (d && T.refTrace.time != null) { const x = time - T.refTrace.time; d.textContent = formatTime(x, true); d.className = 'tr-delta ' + (x <= 0 ? 'good' : 'bad'); }
  },

  _trainSector(s) {
    const e = $('tr-sector');
    if (!e) return;
    e.textContent = `S${s.k} ${formatTime(s.mine).replace(/^00:/, '')}${s.diff == null ? '' : ' ' + formatTime(s.diff, true).replace(/^([+-])00:/, '$1')}`;
    e.className = 'tr-sector ' + (s.diff == null ? '' : s.diff <= 0 ? 'good' : 'bad');
  },

  // À chaque image (course en cours) : le suivi et les mesures ; le texte, 10 fois par seconde.
  _trainUpdate() {
    const T = this._train;
    if (!T || this.state !== 'racing') return;
    const t0 = performance.now();
    const p = this.phys, steps = this.logic.steps, t = steps * DT, v = p.speed;
    if (v > T.vmax) T.vmax = v;
    let res = null;
    if (T.lt) { res = T.lt.update(p.pos.x, p.pos.y, p.pos.z, t); if (res.done && T.cfg.w.sector) this._trainSector(res.done); }
    if (steps - T.lastPush >= 4) {
      const inp = this.lastInput || {};
      T.gLon = steps > T.lastPush ? (v - T.lastV) / ((steps - T.lastPush) * DT) / G : 0;
      T.lastV = v; T.lastPush = steps;
      if (T.chart) T.chart.push([inp.throttle ? 1 : 0, inp.brake ? 1 : 0, v]);
    }
    const now = performance.now();
    if (now - T.lastUi >= UI_MS) {
      T.lastUi = now;
      if (T.cfg.w.delta && res && res.delta != null) { const d = $('tr-delta'); d.textContent = formatTime(res.delta, true); d.className = 'tr-delta ' + (res.delta <= 0 ? 'good' : 'bad'); }
      if (T.cfg.w.vmax) $('tr-vmax').textContent = `Vmax ${Math.round(T.vmax * 3.6)} km/h`;
      if (T.cfg.w.g) $('tr-g').textContent = `g ${(Math.abs(v * p.omega) / G).toFixed(1)} lat · ${T.gLon.toFixed(1)} long`;
      if (T.chart) T.chart.draw();
    }
    T.cost += performance.now() - t0; T.costN++;
  },

  _trainDispose() {
    const T = this._train;
    this._train = null;
    if (T) this._trainClearScene(T);
    const el = $('hud-train');
    if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
  },
};
