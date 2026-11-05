// Musique du jeu : le menu joue le MP3 déposé dans assets/music-menu.mp3 (en boucle ; sans ce fichier, repli sur un groove house
// synthétisé) ; les courses jouent une musique chill synthétisée (AudioEngine.js) dont l'intensité suit la vitesse.
// Coupure nette entre les deux.
import { AudioEngine } from './AudioEngine.js';

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.volume = 0.45;
    this.synth = null;
    this.kind = null;       // morceau en cours
    this.want = null;       // morceau demandé (lancé dès que l'audio est débloqué)
    this._timer = null;
    this.src = null;        // lecteur du MP3 de course
    this.bufs = {};         // MP3 décodés ; null : fichier absent
  }

  setVolume(v) {
    this.volume = v;
    if (this.synth) this.synth.setVolume(v * 0.7);
    if (this.out) this.out.gain.setTargetAtTime(v * 0.6, this.audio.ctx.currentTime, 0.1);
  }

  // kind : 'menu' ou 'game'. L'ancien morceau est coupé (fondu de 0,4 s), le nouveau démarre une fois le silence fait.
  play(kind = 'game') {
    kind = kind === 'menu' ? 'menu' : 'game';
    this.want = kind;
    const ctx = this.audio.ctx;
    if (!ctx || this.kind === kind) return;
    clearTimeout(this._timer);
    if (!this.synth) this.synth = new AudioEngine({ volume: 1 }).init(ctx);
    const wasPlaying = this.synth.running || !!this.src;
    if (this.synth.running) this.synth.stop();
    this._stopFile();
    this.kind = kind;
    this._timer = setTimeout(async () => {
      if (this.want !== kind) return;
      if (kind === 'menu') {
        const buf = await this._load('menu');
        if (this.want !== kind) return;
        if (buf) { this._playFile(buf); return; }
      }
      this.synth.setVolume(this.volume * 0.7);
      this.synth.updateWithCarSpeed(kind === 'menu' ? 0.5 : 0);
      this.synth.start(kind === 'menu' ? 'house' : 'chill');
    }, wasPlaying ? 450 : 0);
  }

  // Cherche assets/music-<kind>.mp3 (une seule fois) ; null s'il n'existe pas ou ne se décode pas.
  async _load(kind) {
    if (this.bufs[kind] !== undefined) return this.bufs[kind];
    try {
      const r = await fetch(`assets/music-${kind}.mp3`);
      if (!r.ok) throw new Error(r.status);
      this.bufs[kind] = await this.audio.ctx.decodeAudioData(await r.arrayBuffer());
    } catch (e) { this.bufs[kind] = null; }
    return this.bufs[kind];
  }

  _playFile(buf) {
    const ctx = this.audio.ctx;
    if (!this.out) { this.out = ctx.createGain(); this.out.connect(ctx.destination); }
    this.out.gain.value = this.volume * 0.6;
    const g = ctx.createGain(), s = ctx.createBufferSource();
    g.gain.value = 0; g.gain.setTargetAtTime(1, ctx.currentTime, 0.2);
    s.buffer = buf; s.loop = true; s.connect(g).connect(this.out); s.start();
    this.src = s; this.fade = g;
  }

  _stopFile() {
    if (!this.src) return;
    const t = this.audio.ctx.currentTime;
    this.fade.gain.cancelScheduledValues(t); this.fade.gain.setValueAtTime(this.fade.gain.value, t); this.fade.gain.linearRampToValueAtTime(0, t + 0.35);
    this.src.stop(t + 0.4); this.src = null;
  }

  // Vitesse de la voiture, de 0 à 1 (au-delà : boost) ; sans effet au menu.
  setSpeed(r) { if (this.synth && this.kind === 'game' && this.synth.running) this.synth.updateWithCarSpeed(Math.min(1, r)); }

  stop() {
    this.want = null; this.kind = null;
    clearTimeout(this._timer);
    if (this.synth) this.synth.stop();
    this._stopFile();
  }

  // Appelé quand l'AudioContext vient d'être débloqué par un clic.
  resume() {
    if (this.want) { const k = this.want; this.kind = null; this.play(k); }
  }
}
