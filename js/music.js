// Musique générée en direct (Web Audio) : une ambiance par décor, composée à la volée
// à partir d'une gamme, d'un tempo et d'une graine. Aucun fichier audio.
// Basse + accords tenus + arpège + charleston, programmés un peu en avance.

const THEMES = {
  desert:  { bpm: 112, root: 45, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 3, 4], arp: 'square',   pad: 'sawtooth', bright: 1600 },
  polar:   { bpm: 96,  root: 50, scale: [0, 2, 4, 7, 9],        prog: [0, 3, 4, 2], arp: 'triangle', pad: 'sine',     bright: 2600 },
  jungle:  { bpm: 120, root: 43, scale: [0, 3, 5, 7, 10],       prog: [0, 2, 3, 4], arp: 'square',   pad: 'triangle', bright: 2000 },
  city:    { bpm: 124, root: 46, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 3, 5, 4], arp: 'sawtooth', pad: 'sawtooth', bright: 2200 },
  isles:   { bpm: 104, root: 48, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 4, 5, 3], arp: 'triangle', pad: 'triangle', bright: 2400 },
  volcano: { bpm: 128, root: 40, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 1, 5, 4], arp: 'sawtooth', pad: 'sawtooth', bright: 1400 },
  orbit:   { bpm: 100, root: 47, scale: [0, 2, 4, 6, 7, 9, 11], prog: [0, 2, 4, 1], arp: 'sine',     pad: 'sine',     bright: 3000 },
  menu:    { bpm: 92,  root: 48, scale: [0, 2, 4, 7, 9],        prog: [0, 5, 3, 4], arp: 'triangle', pad: 'sine',     bright: 2000 },
};

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.volume = 0.45;
    this.cur = null;
    this.timer = null;
  }

  setVolume(v) {
    this.volume = v;
    if (this.out) this.out.gain.setTargetAtTime(v * 0.32, this.audio.ctx.currentTime, 0.1);
  }

  // Lance (ou garde) la musique d'un thème. intensity : 0 menu calme, 1 course.
  play(themeId, seed = 1, intensity = 1) {
    const ctx = this.audio.ctx;
    if (!ctx) { this.pending = [themeId, seed, intensity]; return; }
    const key = themeId + ':' + seed + ':' + intensity;
    if (this.cur === key) return;
    this.stop(0.6);
    this.cur = key;
    const T = THEMES[themeId] || THEMES.menu;
    const R = rng(seed * 2654435761 + themeId.length * 97);
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = this.volume * 0.32;
      this.out.connect(ctx.destination);
    }
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
    bus.connect(this.out);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = T.bright; lp.Q.value = 0.7;
    lp.connect(bus);
    // Écho léger pour l'arpège.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = (60 / T.bpm) * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    delay.connect(fb).connect(delay);
    delay.connect(lp);

    // Motifs : arpège de 16 pas, rythme de basse, charleston.
    const arpSteps = [];
    for (let i = 0; i < 16; i++) arpSteps.push(R() < (intensity ? 0.72 : 0.45) ? Math.floor(R() * 5) : -1);
    const bassHits = [0, 6, 8, 11, 14].filter((x, i) => i === 0 || R() < 0.7);
    const hatEvery = R() < 0.5 ? 2 : 4;
    this.song = { T, ctx, lp, bus, delay, arpSteps, bassHits, hatEvery, intensity, step: 0, next: ctx.currentTime + 0.12 };
    const tick = () => this._schedule();
    this.timer = setInterval(tick, 60);
    tick();
  }

  _note(time, freq, dur, type, vol, dest) {
    const ctx = this.song.ctx;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0008, time + dur);
    o.connect(g).connect(dest);
    o.start(time); o.stop(time + dur + 0.05);
  }

  _hat(time, vol) {
    const a = this.audio, ctx = this.song.ctx;
    if (!a.noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = a.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time); g.gain.exponentialRampToValueAtTime(0.0005, time + 0.05);
    src.connect(f).connect(g).connect(this.song.lp);
    src.start(time, Math.random() * 1.5, 0.08);
  }

  _schedule() {
    const S = this.song;
    if (!S) return;
    const { T, ctx } = S;
    const sixteenth = 60 / T.bpm / 4;
    while (S.next < ctx.currentTime + 0.25) {
      const st = S.step % 16;
      const bar = Math.floor(S.step / 16);
      const deg = T.prog[bar % T.prog.length];
      const sc = T.scale;
      const chord = [0, 2, 4].map((k) => {
        const i = deg + k;
        return T.root + 12 + sc[i % sc.length] + 12 * Math.floor(i / sc.length);
      });
      // Accord tenu en début de mesure.
      if (st === 0) for (const m of chord) this._note(S.next, hz(m), sixteenth * 16, T.pad, 0.05, S.lp);
      // Basse.
      if (S.bassHits.includes(st)) this._note(S.next, hz(chord[0] - 24), sixteenth * 2.2, 'triangle', 0.22, S.lp);
      // Arpège (seulement en course ou une mesure sur deux au menu).
      const a = S.arpSteps[st];
      if (a >= 0 && (S.intensity || bar % 2 === 1)) {
        const i = deg + a;
        const m = T.root + 24 + sc[i % sc.length] + 12 * Math.floor(i / sc.length);
        this._note(S.next, hz(m), sixteenth * 1.6, T.arp, 0.045, S.delay);
        this._note(S.next, hz(m), sixteenth * 1.6, T.arp, 0.05, S.lp);
      }
      if (S.intensity && st % S.hatEvery === 0) this._hat(S.next, st % 8 === 4 ? 0.05 : 0.025);
      S.next += sixteenth;
      S.step++;
    }
  }

  stop(fade = 0.4) {
    clearInterval(this.timer);
    this.timer = null;
    const S = this.song;
    this.song = null;
    this.cur = null;
    if (S) {
      const t = S.ctx.currentTime;
      S.bus.gain.cancelScheduledValues(t);
      S.bus.gain.setTargetAtTime(0, t, fade / 3);
      setTimeout(() => { try { S.bus.disconnect(); } catch { /* déjà coupé */ } }, fade * 1000 + 400);
    }
  }

  // Appelé après le premier geste de l'utilisateur (le contexte audio existe alors).
  resume() {
    if (this.pending && this.audio.ctx) {
      const p = this.pending; this.pending = null;
      this.play(...p);
    }
  }
}
