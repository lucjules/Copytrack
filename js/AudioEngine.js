// Moteur de musique procédurale « French Touch / rally house / nu-disco » à ~124 BPM, 100 % Web Audio API (aucun fichier audio).
//
//   const music = new AudioEngine();
//   music.init();                 // à appeler dans un clic / une touche (débloque l'AudioContext)
//   music.start();                // lance la boucle
//   music.updateWithCarSpeed(0.7);// 0 = arrêt / menu, 1 = vitesse max ; > 1 ou boost : couche supplémentaire
//   music.stop();
//
// Légèreté : un seul ordonnanceur à l'avance (setInterval 25 ms, 120 ms d'avance), aucun nœud permanent par note (oscillateurs et bruits
// jetables, un tampon de bruit partagé), aucun travail dans la boucle de rendu : updateWithCarSpeed ne fait que viser des valeurs.
//
// Sidechain : à chaque kick, les bus « basse » et « synthés » s'abaissent puis remontent (GainNode programmé à l'avance, calé sur le kick).
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Harmonie relevée sur le morceau de référence (Rally House #4, ~123 BPM) : pédale de ré (D) sur toute la boucle, accords
// Dmaj7(#11) / D(#5) qui oscillent et un Dm7 en couleur plus sombre. Basse sur D2 (73 Hz).
const BARS = [
  { root: 38, chord: [62, 69, 73, 80] },   // D A C# G#
  { root: 38, chord: [62, 69, 73, 75] },   // D A C# D#
  { root: 38, chord: [62, 65, 69, 72] },   // Dm7 (D F A C)
  { root: 38, chord: [62, 69, 73, 80] },
];
// Basse funky sur 16 doubles-croches : 0 = silence, sinon décalage en demi-tons (12 = octave) ; 'g' = note courte « fantôme ».
const BASS = [0, 'x', 0, 12, 'x', 0, 7, 'x', 0, 'x', 12, 0, 'x', 10, 'x', 7];
const STAB_STEPS = new Set([2, 5, 10, 13]);          // stabs disco syncopés
const BPM_BASE = 124, BPM_BOOST = 4;
// Mode « chill » (courses) : tempo lent, accords de 7e/9e feutrés, basse ronde, percussions discrètes.
const CHILL = [
  { root: 38, chord: [65, 69, 72, 76] },   // Dm9
  { root: 34, chord: [62, 65, 69, 72] },   // Bbmaj7
  { root: 41, chord: [60, 64, 69, 72] },   // Fmaj7
  { root: 33, chord: [60, 64, 67, 72] },   // Am7
];

export class AudioEngine {
  constructor({ volume = 0.5 } = {}) {
    this.ctx = null; this.running = false; this.volume = volume;
    this.speed = 0; this.boost = false; this.mode = 'house';              // cibles (lissées côté audio)
    this._step = 0; this._next = 0; this._timer = null; this._bpm = BPM_BASE; this._bar = 0;
    this.stats = { scheduled: 0 };
  }

  // Crée l'AudioContext (à appeler pendant un geste de l'utilisateur) et le graphe fixe : 7 nœuds seulement.
  init(sharedCtx) {
    if (sharedCtx && !this.ctx) this.ctx = sharedCtx, this._shared = true;
    if (this.ctx && this.out) { if (this.ctx.state === 'suspended') this.ctx.resume(); return this; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!this.ctx && !AC) return this;
    const ctx = this.ctx || (this.ctx = new AC({ latencyHint: 'interactive' }));
    // master : filtre passe-bas global (l'« ouverture » de la musique) -> compresseur doux -> sortie
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 380; this.lp.Q.value = 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.14;
    this.lp.connect(comp); comp.connect(this.out); this.out.connect(ctx.destination);
    // bus : kick/percussions (sans sidechain), basse et synthés (avec sidechain)
    this.drums = ctx.createGain(); this.bassBus = ctx.createGain(); this.synthBus = ctx.createGain();
    this.drums.connect(this.lp); this.bassBus.connect(this.lp); this.synthBus.connect(this.lp);
    this.drums.gain.value = 0.9; this.bassBus.gain.value = 0.8; this.synthBus.gain.value = 0.5;
    // bruit blanc partagé (1 s)
    const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
    return this;
  }

  // mode : 'house' (menu, groove French Touch à 124 BPM) ou 'chill' (courses, tempo lent et doux).
  start(mode = 'house') {
    this.mode = mode;
    if (!this.ctx) this.init();
    if (!this.ctx || this.running) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.running = true;
    this._step = 0; this._bar = 0; this._next = this.ctx.currentTime + 0.06;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t); this.out.gain.setValueAtTime(this.out.gain.value, t); this.out.gain.linearRampToValueAtTime(this.volume, t + 0.6);
    this._timer = setInterval(() => this._tick(), 25);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this._timer); this._timer = null;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t); this.out.gain.setValueAtTime(this.out.gain.value, t); this.out.gain.linearRampToValueAtTime(0, t + 0.4);
  }

  setVolume(v) { this.volume = clamp(v, 0, 1); if (this.ctx && this.running) this.out.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05); }

  // speedRatio : 0 (menu / arrêt) à 1 (vitesse maximale) ; au-delà de 1 = boost. Appel bon marché (aucune allocation, 2 paramètres lissés).
  updateWithCarSpeed(speedRatio) {
    const r = clamp(+speedRatio || 0, 0, 1.5);
    this.speed = Math.min(1, r); this.boost = r > 1;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Menu / arrêt : passe-bas serré (≈ 300 Hz, kick et basse douce) ; en course il s'ouvre jusqu'à ≈ 9 kHz.
    const chill = this.mode === 'chill';
    const cutoff = chill ? 1400 + 3200 * this.speed : 300 * Math.pow(30, this.speed) * (this.boost ? 1.25 : 1);
    this.lp.frequency.setTargetAtTime(cutoff, t, 0.25);
    this.lp.Q.setTargetAtTime(0.8 + 2.2 * (1 - this.speed) * 0.4 + (this.boost ? 0.8 : 0), t, 0.3);
    this.synthBus.gain.setTargetAtTime(0.18 + 0.5 * this.speed, t, 0.4);
  }

  // Tempo effectif : 124 BPM, jusqu'à +4 à pleine vitesse avec boost.
  get bpm() { return this.mode === 'chill' ? 92 + 6 * this.speed : BPM_BASE + (this.boost ? BPM_BOOST : this.speed > 0.9 ? 2 : 0); }

  // ---- Ordonnanceur ------------------------------------------------------------------------------------------------------------
  _tick() {
    const ctx = this.ctx;
    while (this._next < ctx.currentTime + 0.12) {
      this._play(this._step, this._next);
      this._next += 60 / this.bpm / 4;                 // une double-croche
      if (++this._step >= 16) { this._step = 0; this._bar = (this._bar + 1) % BARS.length; }
    }
  }

  _playChill(step, t) {
    const s = this.speed, bar = CHILL[this._bar];
    this.stats.scheduled++;
    if (step === 0 || step === 10) { this._kick(t, 0.7); this._duck(t); }
    if (step === 8) this._clap(t, 0.28);
    if (step % 4 === 2 && s > 0.1) this._hat(t, 0.14 + 0.1 * s, false);
    if (step === 0 || step === 6 || step === 11) this._bass(t, bar.root + (step === 11 ? 7 : 0), step === 6, true);
    if (step === 0) this._pad(t, bar.chord, 60 / this.bpm * 3.8);
    if (step === 3 || step === 7 || step === 14) this._pluck(t, bar.chord[(step + this._bar) % 4] + 12);
  }

  _pad(t, chord, len) {
    const ctx = this.ctx, f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1800, t + len * 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.085, t + 0.35); g.gain.linearRampToValueAtTime(0.0001, t + len);
    for (const m of chord) for (const det of [-9, 9]) {
      const o = ctx.createOscillator();
      o.type = 'triangle'; o.frequency.value = mtof(m); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + len + 0.05);
    }
    f.connect(g); g.connect(this.synthBus);
  }

  _pluck(t, midi) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sine'; o.frequency.value = mtof(midi); f.type = 'lowpass'; f.frequency.value = 2400;
    this._env(g, t, 0.004, 0.13, 0.45);
    o.connect(f); f.connect(g); g.connect(this.synthBus); o.start(t); o.stop(t + 0.55);
  }

  _play(step, t) {
    if (this.mode === 'chill') return this._playChill(step, t);
    const s = this.speed, bar = BARS[this._bar];
    this.stats.scheduled++;
    if (step % 4 === 0) { this._kick(t); this._duck(t); }                                // 4-on-the-floor + sidechain
    if (s > 0.12 && (step === 4 || step === 12)) this._clap(t, 0.5 + 0.4 * s);          // clap sur les temps 2 et 4
    if (s > 0.2 && step % 4 === 2) this._hat(t, 0.35 + 0.35 * s, false);                 // hi-hat à contretemps
    if (s > 0.55 && step % 2 === 1) this._hat(t, 0.12 + 0.12 * s, false);               // doubles-croches de hats en pleine course
    if (s > 0.35 && step === 14) this._hat(t, 0.3, true);                               // hat ouvert
    const b = BASS[step];
    if (b !== 0) this._bass(t, bar.root + (b === 'x' ? 0 : b), b === 'x');
    if (s > 0.15 && STAB_STEPS.has(step)) this._stab(t, bar.chord, 0.55 + 0.3 * s, 1);
    if (this.boost && (step === 0 || step === 8)) this._stab(t, bar.chord.map((m) => m + 12), 0.4, 2);   // 2e couche de synthé au boost
    if (this.boost && step % 2 === 0) this._arp(t, bar.chord[(step / 2 + this._bar) % 4] + 24);
  }

  // Sidechain : le basse et les synthés plongent à chaque kick (≈ 8 % du volume) puis remontent en 0,2 s.
  _duck(t) {
    for (const [bus, base] of [[this.bassBus, 0.8], [this.synthBus, null]]) {
      const g = bus.gain;
      const hi = base ?? Math.max(0.05, 0.18 + 0.5 * this.speed);
      g.cancelScheduledValues(t);
      g.setValueAtTime(hi * 0.08, t);
      g.linearRampToValueAtTime(hi, t + 0.2);
    }
  }

  _env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }

  _kick(t, v = 1) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(165, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.09);
    this._env(g, t, 0.003, v, 0.3);
    o.connect(g); g.connect(this.drums); o.start(t); o.stop(t + 0.36);
    const c = ctx.createBufferSource(), cg = ctx.createGain();                          // clic d'attaque
    c.buffer = this.noise; this._env(cg, t, 0.001, 0.35, 0.012);
    c.connect(cg); cg.connect(this.drums); c.start(t, 0, 0.03);
  }

  _clap(t, v) {
    const ctx = this.ctx;
    for (let i = 0; i < 3; i++) {                                                      // trois petites rafales : effet « clap »
      const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), tt = t + i * 0.011;
      n.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.8;
      this._env(g, tt, 0.002, v * 0.45, i === 2 ? 0.16 : 0.012);
      n.connect(f); f.connect(g); g.connect(this.drums); n.start(tt, Math.random() * 0.5, 0.22);
    }
  }

  _hat(t, v, open) {
    const ctx = this.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 6500;
    this._env(g, t, 0.001, v * 0.4, open ? 0.2 : 0.04);
    n.connect(f); f.connect(g); g.connect(this.drums); n.start(t, Math.random() * 0.5, open ? 0.25 : 0.06);
  }

  // Basse : dent de scie + carré une octave dessous, passe-bas résonant dont la fréquence plonge (le « wow » funky).
  _bass(t, midi, ghost, soft) {
    const ctx = this.ctx, f = ctx.createBiquadFilter(), g = ctx.createGain(), len = soft ? 0.4 : ghost ? 0.07 : 0.16;
    f.type = 'lowpass'; f.Q.value = soft ? 1.5 : 9;
    f.frequency.setValueAtTime(260 + 900 * (0.3 + this.speed), t); f.frequency.exponentialRampToValueAtTime(110, t + len);
    this._env(g, t, 0.005, ghost ? 0.3 : 0.6, len);
    for (const [type, m, v] of soft ? [['triangle', midi, 0.9], ['sine', midi - 12, 0.7]] : [['sawtooth', midi, 0.7], ['square', midi - 12, 0.5]]) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = type; o.frequency.value = mtof(m); og.gain.value = v;
      o.connect(og); og.connect(f); o.start(t); o.stop(t + len + 0.1);
    }
    f.connect(g); g.connect(this.bassBus);
  }

  // Stab disco : accord de dents de scie désaccordées, filtre qui se referme (modulation de filtre).
  _stab(t, chord, v, layer) {
    const ctx = this.ctx, f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(layer === 2 ? 5200 : 3400, t); f.frequency.exponentialRampToValueAtTime(layer === 2 ? 1400 : 650, t + 0.2);
    this._env(g, t, 0.006, v * 0.16, 0.22);
    for (const m of chord) for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + 0.3);
    }
    f.connect(g); g.connect(this.synthBus);
  }

  _arp(t, midi) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'square'; o.frequency.value = mtof(midi); f.type = 'lowpass'; f.frequency.value = 3800;
    this._env(g, t, 0.003, 0.07, 0.1);
    o.connect(f); f.connect(g); g.connect(this.synthBus); o.start(t); o.stop(t + 0.14);
  }
}
