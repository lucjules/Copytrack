// Sons entièrement synthétisés avec la Web Audio API (aucun fichier audio).
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.engineOn = false;
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
    const gears = [0, 13, 24, 35, 46, 58, 999];
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

  boost() {
    this.noise(0.6, 300, 0.3, 'bandpass', 0, 2600);
    this.tone(180, 0.4, 'sawtooth', 0.08, 0, 520);
  }

  bounce() {
    this.tone(220, 0.35, 'sine', 0.25, 0, 880);
    this.tone(330, 0.25, 'triangle', 0.12, 0.05, 990);
  }

  whoosh() {
    this.noise(0.9, 400, 0.18, 'bandpass', 0, 1800);
  }

  thud(strength) {
    const v = Math.min(0.5, strength * 0.025);
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
