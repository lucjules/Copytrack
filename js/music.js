// Musique du jeu : deux morceaux MP3 joués en boucle, un pour le menu (assets/music-menu.mp3, version filtrée et feutrée)
// et un pour les courses (assets/music-game.mp3, version complète).
export class Music {
  constructor(audio) {
    this.audio = audio;
    this.volume = 0.45;
    this.src = null;
    this.bufs = {};
    this.loading = {};
    this.want = null;
    this.kind = null;
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

  // kind : 'menu' ou autre (course). Garde la boucle en cours si c'est déjà la bonne, sinon fondu enchaîné vers l'autre.
  play(kind = 'game') {
    kind = kind === 'menu' ? 'menu' : 'game';
    this.want = kind;
    const ctx = this.audio.ctx;
    if (!ctx || this.kind === kind) return;
    const buf = this.bufs[kind];
    if (!buf) {
      if (!this.loading[kind]) {
        this.loading[kind] = fetch(`assets/music-${kind}.mp3`)
          .then((r) => r.arrayBuffer())
          .then((b) => ctx.decodeAudioData(b))
          .then((d) => { this.bufs[kind] = d; if (this.want === kind) this.play(kind); })
          .catch(() => { this.loading[kind] = null; });
      }
      return;
    }
    this.stop(0.8);
    this.want = kind;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf; s.loop = true;
    g.gain.value = 0; g.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
    s.connect(g).connect(this._gain());
    s.start();
    this.src = s; this.fade = g; this.kind = kind;
  }

  stop(fade = 0.3) {
    this.want = null;
    if (this.src) {
      const ctx = this.audio.ctx, s = this.src, g = this.fade, t = ctx.currentTime;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade);
      s.stop(t + fade + 0.05);
      this.src = null; this.kind = null;
    }
  }

  // Appelé quand l'AudioContext vient d'être débloqué par un clic.
  resume() {
    if (this.want) this.play(this.want);
  }
}
