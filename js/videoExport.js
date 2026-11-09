// Export d'un replay en vidéo : le canvas 3D est enregistré (MediaRecorder) pendant que le replay se joue, puis proposé en téléchargement (WebM).
// Sans son (le replay n'a pas de piste audio) et sans interface : seulement la scène. Module sans dépendance au jeu : il prend un canvas.

// Premier format d'enregistrement que le navigateur sait écrire (WebM VP9 si possible, sinon VP8 ou H.264) ; null si MediaRecorder n'est pas disponible.
export function pickMime(MR = globalThis.MediaRecorder) {
  if (!MR || typeof MR.isTypeSupported !== 'function') return null;
  for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']) if (MR.isTypeSupported(m)) return m;
  return null;
}

export function videoSupported(canvas, MR = globalThis.MediaRecorder) {
  return !!(canvas && typeof canvas.captureStream === 'function' && pickMime(MR));
}

export class CanvasRecorder {
  // opts : { fps, bitsPerSecond, MR } (MR : pour les tests)
  constructor(canvas, { fps = 60, bitsPerSecond = 8_000_000, MR = globalThis.MediaRecorder } = {}) {
    const mime = pickMime(MR);
    if (!canvas || typeof canvas.captureStream !== 'function' || !mime) throw new Error('L\'enregistrement vidéo n\'est pas disponible dans ce navigateur.');
    this.mime = mime;
    this.stream = canvas.captureStream(fps);
    this.chunks = [];
    this.rec = new MR(this.stream, { mimeType: mime, videoBitsPerSecond: bitsPerSecond });
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.startedAt = 0;
  }

  start() { this.startedAt = performance.now(); this.rec.start(500); return this; }       // un morceau toutes les 500 ms : rien n'est perdu si l'onglet se ferme

  // Arrête et renvoie le fichier (Blob) ; tout est libéré.
  stop() {
    return new Promise((resolve) => {
      const done = () => { for (const t of this.stream.getTracks()) t.stop(); resolve(new Blob(this.chunks, { type: this.mime.split(';')[0] })); };
      if (this.rec.state === 'inactive') { done(); return; }
      this.rec.onstop = done;
      this.rec.stop();
    });
  }

  cancel() {
    try { this.rec.onstop = null; if (this.rec.state !== 'inactive') this.rec.stop(); } catch { /* déjà arrêté */ }
    for (const t of this.stream.getTracks()) t.stop();
    this.chunks = [];
  }

  get seconds() { return this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0; }
}

// Nom de fichier sûr : lettres, chiffres, tirets.
export const videoFileName = (name, time, mime = 'video/webm') => `copytrack-${String(name || 'replay').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'replay'}-${Number.isFinite(time) ? time.toFixed(2).replace('.', '_') + 's' : 'clip'}.${/mp4/.test(mime) ? 'mp4' : 'webm'}`;

// Propose le fichier au téléchargement.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
