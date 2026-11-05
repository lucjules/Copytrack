// Musique du jeu : un morceau MP3 (assets/music.mp3) joué en boucle, partout (menu et courses).
export class Music {
  constructor(audio) {
    this.audio = audio;
    this.volume = 0.45;
    this.src = null;
    this.buf = null;
    this.loading = null;
    this.want = false;
  }

  _gain() {
    const ctx = this.audio.ctx;
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = this.volume * 0.6;
      this.out.connect(ctx.destination);
    }
    return this.out;
  }

  setVolume(v) {
    this.volume = v;
    if (this.out) this.out.gain.setTargetAtTime(v * 0.6, this.audio.ctx.currentTime, 0.1);
  }

  // Lance la boucle (sans la relancer si elle joue déjà). Les arguments (décor, graine…) sont ignorés : un seul morceau.
  play() {
    this.want = true;
    if (!this.audio.ctx || this.src) return;
    if (!this.buf) {
      if (!this.loading) {
        this.loading = fetch('assets/music.mp3')
          .then((r) => r.arrayBuffer())
          .then((b) => this.audio.ctx.decodeAudioData(b))
          .then((buf) => { this.buf = buf; if (this.want) this.play(); })
          .catch(() => { this.loading = null; });
      }
      return;
    }
    const ctx = this.audio.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.buf;
    s.loop = true;
    s.connect(this._gain());
    s.start();
    this.src = s;
  }

  stop() {
    this.want = false;
    if (this.src) { try { this.src.stop(); } catch (e) { /* déjà arrêtée */ } this.src = null; }
  }

  // Appelé quand l'AudioContext vient d'être débloqué par un clic.
  resume() {
    if (this.want) this.play();
  }
}
