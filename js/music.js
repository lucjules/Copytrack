// Musique du jeu, entièrement synthétisée (AudioEngine.js) : le menu joue un groove French Touch / house à 124 BPM,
// les courses une version chill (tempo lent, accords doux) dont l'intensité suit la vitesse. Coupure nette entre les deux.
import { AudioEngine } from './AudioEngine.js';

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.volume = 0.45;
    this.synth = null;
    this.kind = null;       // morceau en cours
    this.want = null;       // morceau demandé (lancé dès que l'audio est débloqué)
    this._timer = null;
  }

  setVolume(v) {
    this.volume = v;
    if (this.synth) this.synth.setVolume(v * 0.7);
  }

  // kind : 'menu' ou 'game'. L'ancien morceau est coupé (fondu de 0,4 s), le nouveau démarre une fois le silence fait.
  play(kind = 'game') {
    kind = kind === 'menu' ? 'menu' : 'game';
    this.want = kind;
    const ctx = this.audio.ctx;
    if (!ctx || this.kind === kind) return;
    clearTimeout(this._timer);
    if (!this.synth) this.synth = new AudioEngine({ volume: 1 }).init(ctx);
    const wasPlaying = this.synth.running;
    if (wasPlaying) this.synth.stop();
    this.kind = kind;
    this._timer = setTimeout(() => {
      if (this.want !== kind) return;
      this.synth.setVolume(this.volume * 0.7);
      this.synth.updateWithCarSpeed(kind === 'menu' ? 0.5 : 0);
      this.synth.start(kind === 'menu' ? 'house' : 'chill');
    }, wasPlaying ? 450 : 0);
  }

  // Vitesse de la voiture, de 0 à 1 (au-delà : boost) ; sans effet au menu.
  setSpeed(r) { if (this.synth && this.kind === 'game' && this.synth.running) this.synth.updateWithCarSpeed(Math.min(1, r)); }

  stop() {
    this.want = null; this.kind = null;
    clearTimeout(this._timer);
    if (this.synth) this.synth.stop();
  }

  // Appelé quand l'AudioContext vient d'être débloqué par un clic.
  resume() {
    if (this.want) { const k = this.want; this.kind = null; this.play(k); }
  }
}
