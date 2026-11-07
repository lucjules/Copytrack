// Effets sonores synthétisés (Web Audio API). La musique est gérée à part (voir music.js).
import { Music } from './music.js';

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.engineOn = false;
    this.music = new Music(this);
  }

  setMusicVolume(v) {
    this.music.setVolume(v);
  }

  // Doit être appelé suite à une interaction utilisateur.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    // Bruit blanc réutilisable
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // Moteur : deux oscillateurs + filtre passe-bas
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 900;
    this.engFilter.Q.value = 4;
    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    this.osc1.connect(this.engFilter);
    this.osc2.connect(g2).connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.master);
    this.osc1.start();
    this.osc2.start();

    // Crissement (dérapage)
    this.skid = this._loopNoise('bandpass', 1400, 2.5);
    // Vent
    this.wind = this._loopNoise('lowpass', 500, 0.7);
    this.music.resume();
  }

  _loopNoise(type, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return { src, f, g };
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  // Mise à jour continue du moteur (appelée chaque image).
  engine(state) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!state) {
      this.engGain.gain.setTargetAtTime(0, t, 0.08);
      this.skid.g.gain.setTargetAtTime(0, t, 0.05);
      this.wind.g.gain.setTargetAtTime(0, t, 0.1);
      return;
    }
    const sp = Math.abs(state.speed);
    const gears = [0, 16, 31, 46, 61, 76, 90, 999];   // 0.9.5 : calées sur la vitesse de pointe de 0.9.4 (95 m/s, 112 en boost)
    let g = 0;
    while (sp > gears[g + 1]) g++;
    const frac = (sp - gears[g]) / (gears[g + 1] - gears[g]);
    const rpm = Math.min(1.15, 0.25 + frac * 0.85);
    const base = 55 + g * 6 + rpm * 120 + (state.boost ? 25 : 0);
    this.osc1.frequency.setTargetAtTime(base, t, 0.03);
    this.osc2.frequency.setTargetAtTime(base * 0.5, t, 0.03);
    this.engFilter.frequency.setTargetAtTime(500 + rpm * 1500 + (state.throttle ? 600 : 0), t, 0.05);
    const vol = (state.throttle ? 0.16 : 0.09) + rpm * 0.05;
    this.engGain.gain.setTargetAtTime(vol, t, 0.05);
    this.skid.g.gain.setTargetAtTime(Math.min(0.22, Math.max(0, state.slip - 3) * 0.03), t, 0.04);
    this.wind.g.gain.setTargetAtTime(Math.min(0.25, sp * sp * 0.00006), t, 0.1);
  }

  _env(node, t, a, d, peak) {
    if (!Number.isFinite(peak) || !Number.isFinite(t)) return;   // un son raté ne doit jamais bloquer le jeu
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  tone(freq, dur = 0.15, type = 'sine', vol = 0.25, delay = 0, slideTo = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    this._env(g, t, 0.01, dur, vol);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur = 0.2, freq = 800, vol = 0.3, type = 'lowpass', delay = 0, sweepTo = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    this._env(g, t, 0.01, dur, vol);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  countdown(final) {
    this.tone(final ? 880 : 440, final ? 0.45 : 0.18, 'triangle', 0.3);
  }

  checkpoint(better) {
    const base = better === false ? 520 : 660;
    [0, 4, 7].forEach((s, i) => this.tone(base * 2 ** (s / 12), 0.18, 'triangle', 0.22, i * 0.06));
  }

  finish(record) {
    const notes = record ? [0, 4, 7, 12, 16] : [0, 4, 7, 12];
    notes.forEach((s, i) => this.tone(523 * 2 ** (s / 12), 0.35, 'triangle', 0.25, i * 0.09));
    if (record) this.noise(1.0, 3000, 0.08, 'highpass', 0.3);
  }

  miniTurbo(level) {
    this.noise(0.35, 500, 0.22, 'bandpass', 0, 2400);
    this.tone(level === 2 ? 520 : 380, 0.25, 'square', 0.06, 0, level === 2 ? 1040 : 760);
  }

  perfectLanding() {
    this.tone(660, 0.12, 'triangle', 0.12);
    this.tone(990, 0.18, 'triangle', 0.1, 0.08);
  }

  // Klaxon (cosmétique) : plusieurs timbres.
  horn(kind = 'classic') {
    if (kind === 'duo') { this.tone(440, 0.18, 'square', 0.08); this.tone(554, 0.22, 'square', 0.08, 0.2); }
    else if (kind === 'tuba') { this.tone(147, 0.45, 'sawtooth', 0.12); this.tone(196, 0.45, 'square', 0.05); }
    else if (kind === 'arcade') { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.09, 'square', 0.07, i * 0.08)); }
    else { this.tone(392, 0.32, 'square', 0.09); this.tone(494, 0.32, 'square', 0.07); }
  }

  boost() {
    this.noise(0.6, 300, 0.3, 'bandpass', 0, 2600);
    this.tone(180, 0.4, 'sawtooth', 0.08, 0, 520);
  }

  bounce() {
    this.tone(220, 0.35, 'sine', 0.25, 0, 880);
    this.tone(330, 0.25, 'triangle', 0.12, 0.05, 990);
  }

  transform() {
    this.noise(0.5, 600, 0.2, 'bandpass', 0, 3200);
    this.tone(160, 0.5, 'sawtooth', 0.1, 0, 640);
    this.tone(640, 0.3, 'triangle', 0.12, 0.35, 1280);
  }

  whoosh() {
    this.noise(0.9, 400, 0.18, 'bandpass', 0, 1800);
  }

  thud(strength = 20) {
    const v = Math.min(0.5, (Number.isFinite(strength) ? strength : 20) * 0.025);
    if (v < 0.03) return;
    this.noise(0.18, 260, v, 'lowpass');
    this.tone(70, 0.15, 'sine', v * 0.8, 0, 40);
  }

  land(strength) {
    const v = Math.min(0.4, strength * 0.03);
    if (v < 0.04) return;
    this.noise(0.25, 180, v, 'lowpass');
  }

  respawn() {
    this.tone(300, 0.2, 'sine', 0.2, 0, 900);
  }

  click() {
    this.tone(1200, 0.05, 'square', 0.06);
  }

  place() {
    this.tone(320, 0.08, 'triangle', 0.18, 0, 520);
  }

  erase() {
    this.tone(400, 0.08, 'triangle', 0.15, 0, 200);
  }

  error() {
    this.tone(160, 0.15, 'square', 0.12);
  }
}
