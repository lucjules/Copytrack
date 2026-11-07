// Petites courbes sur un canvas (HUD d'entraînement, Replay Theater) : une fenêtre glissante de N valeurs par série, dessinée sans allocation.
//   const c = createTraceChart(canvas, { len: 90, series: [{ color, fill, max }] })
//   c.push([v0, v1, …])   une valeur par série (même ordre)        c.draw()   c.clear()
// drawSeries(g, values, { x, y, w, h, min, max, color, fill }) : une série complète (Theater : vitesse, écart).
export function createTraceChart(canvas, { len = 90, series = [] } = {}) {
  const g = canvas.getContext('2d');
  const bufs = series.map(() => new Float32Array(len));
  let head = 0, count = 0;
  return {
    push(vals) {
      for (let k = 0; k < bufs.length; k++) bufs[k][head] = vals[k] || 0;
      head = (head + 1) % len; count = Math.min(len, count + 1);
    },
    clear() { count = 0; head = 0; g.clearRect(0, 0, canvas.width, canvas.height); },
    draw() {
      const W = canvas.width, H = canvas.height;
      g.clearRect(0, 0, W, H);
      if (count < 2) return;
      for (let k = 0; k < bufs.length; k++) {
        const S = series[k], b = bufs[k], max = S.max || 1;
        g.beginPath();
        for (let i = 0; i < count; i++) {
          const idx = (head - count + i + len) % len;
          const x = (i / (len - 1)) * W, y = H - Math.max(0, Math.min(1, b[idx] / max)) * (H - 2) - 1;
          if (i) g.lineTo(x, y); else g.moveTo(x, y);
        }
        if (S.fill) { g.lineTo(((count - 1) / (len - 1)) * W, H); g.lineTo(0, H); g.closePath(); g.fillStyle = S.fill; g.fill(); }
        else { g.strokeStyle = S.color || '#fff'; g.lineWidth = S.width || 1.5; g.stroke(); }
      }
    },
  };
}

export function drawSeries(g, values, { x = 0, y = 0, w = 100, h = 40, min = 0, max = 1, color = '#fff', fill = '', width = 1.5, n = values.length } = {}) {
  if (n < 2) return;
  const span = max - min || 1;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const px = x + (i / (n - 1)) * w, py = y + h - ((Math.max(min, Math.min(max, values[i])) - min) / span) * h;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  if (fill) { g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); g.fillStyle = fill; g.fill(); }
  else { g.strokeStyle = color; g.lineWidth = width; g.stroke(); }
}
