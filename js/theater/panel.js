// Interface du Replay Theater : barre de temps (repères de secteurs et d'incidents), commandes, légende des courses, et panneau d'analyse
// (trajectoires sur la carte du circuit, vitesses et écart le long du parcours, tableau des secteurs). Voir theater/session.js.
import { $, esc } from '../dom.js';
import { formatTime } from '../storage.js';
import { createTrackMap } from '../ui/trackMap.js';
import { drawSeries } from '../ui/traceChart.js';
import { timeAtS } from '../analysis/reference.js';
import { t } from '../i18n.js';           // texte dessiné sur le canvas : hors du DOM, donc traduit ici

const sec = (t) => (t >= 60 ? formatTime(t) : t.toFixed(3));
const signed = (t) => (Math.abs(t) >= 60 ? formatTime(t, true) : (t >= 0 ? '+' : '−') + Math.abs(t).toFixed(3));

export function buildTheaterUi(s, T) {
  const el = $('theater');
  el.innerHTML = `<ul class="th-runs" id="th-runs"></ul>
    <div class="th-line"><span id="th-time" class="th-time">00:00.000</span>
      <div class="th-track"><input type="range" id="th-seek" min="0" max="${T.total}" step="1" value="0" aria-label="Position dans le replay"><div class="th-marks" id="th-marks"></div></div>
      <span class="th-time">${T.runs[0].time ? formatTime(T.runs[0].time) : ''}</span></div>
    <div class="th-ctl">
      <button class="btn icon" id="th-play" data-th="play" aria-label="Pause">❚❚</button>
      <button class="btn icon" data-th="slower" aria-label="Plus lent" title="Plus lent (←)">−</button><span id="th-speed" class="th-speed">×1</span><button class="btn icon" data-th="faster" aria-label="Plus vite" title="Plus vite (→)">+</button>
      <button class="btn" data-th="cam" title="Changer de caméra (C)">🎥 <span id="th-cam"></span></button>
      <button class="btn" data-th="panel" aria-pressed="${T.panel}" title="Trajectoires, vitesses, écarts et secteurs">📈 Analyse</button>
      <button class="btn" data-th="quit" title="Quitter (Échap)">✕ Quitter</button>
    </div>`;
  renderTheaterRuns(T);
  el.classList.remove('hidden');
  $('theater-panel').innerHTML = `<canvas id="th-map" class="th-map" tabindex="0" aria-label="Trajectoires des courses sur la carte du circuit"></canvas>
    <canvas id="th-chart" class="th-chart" width="560" height="170" aria-label="Vitesse et écart le long du parcours"></canvas>
    <div class="th-sectors" id="th-sectors"><p class="meta">Analyse des courses…</p></div>
    <div class="th-coach hidden" id="th-coach"></div>`;
  $('theater-panel').classList.toggle('hidden', !T.panel);
  const seek = $('th-seek');
  let pending = null, timer = 0;
  const go = () => { timer = 0; if (pending != null) { s.theaterSeek(pending); pending = null; } };
  seek.addEventListener('pointerdown', () => { T.dragging = true; });
  seek.addEventListener('input', () => { pending = +seek.value; if (!timer) timer = setTimeout(go, 120); });
  seek.addEventListener('change', () => { pending = +seek.value; if (timer) clearTimeout(timer); go(); T.dragging = false; });
  const act = { play: () => s.theaterTogglePause(), slower: () => s.theaterSpeed(-1), faster: () => s.theaterSpeed(1), cam: () => s.theaterCamera(), panel: () => s.theaterTogglePanel(), quit: () => s.app.endReplay() };
  for (const b of el.querySelectorAll('[data-th]')) b.addEventListener('click', () => { s.app.audio.click(); act[b.dataset.th](); b.blur(); });
}

// Légende : chaque course, son temps, son écart avec la course regardée (le temps du fantôme or est connu une fois l'analyse faite).
export function renderTheaterRuns(T) {
  const main = T.runs[0].time;
  $('th-runs').innerHTML = T.runs.map((r, i) => `<li><i style="background:${r.color}"></i><b>${esc(r.label)}</b> <span>${r.time ? sec(r.time) : '…'}</span>${i && r.time && main ? ` <em class="${r.time - main >= 0 ? 'bad' : 'good'}" title="Écart avec la course regardée">${signed(r.time - main)}</em>` : ''}</li>`).join('');
}

// Repères de la barre de temps et tableau des secteurs (quand l'analyse est prête).
export function renderTheaterSectors(s, T) {
  $('th-marks').innerHTML = T.marks.map((m) => `<i class="th-mark ${m.kind}" style="left:${(100 * m.tick / Math.max(1, T.total)).toFixed(2)}%" title="${esc(m.label)}"></i>`).join('');
  const tipsEl = $('th-coach');
  tipsEl.classList.toggle('hidden', !(T.tips && T.tips.length));
  if (T.tips && T.tips.length) {
    tipsEl.innerHTML = `<h4>💡 Conseils face à « ${esc(T.runs[1].label)} »</h4><ol>${T.tips.map((t, i) => `<li><button class="btn small" type="button" data-tip="${i}" title="Aller à ce passage (3 s avant)">▶</button> ${esc(t.text)}</li>`).join('')}</ol>`;
    for (const b of tipsEl.querySelectorAll('[data-tip]')) b.onclick = () => { s.app.audio.click(); s.theaterSeek(Math.max(0, T.tips[+b.dataset.tip].tick - 360)); };
  }
  const S = T.sectors, main = S[0];
  if (!main || !main.length) { $('th-sectors').innerHTML = '<p class="meta">Secteurs indisponibles pour cette course.</p>'; return; }
  const best = main.map((_, k) => Math.min(...S.filter(Boolean).map((x) => (x[k] ? x[k].dt : Infinity))));
  const head = `<tr><th></th>${main.map((x) => `<th>S${x.k}</th>`).join('')}</tr>`;
  const rows = T.runs.map((r, i) => {
    const x = S[i];
    if (!x) return `<tr><th><i style="background:${r.color}"></i></th><td colspan="${main.length}" class="meta">indisponible</td></tr>`;
    return `<tr><th><i style="background:${r.color}" title="${esc(r.label)}"></i></th>${main.map((m, k) => {
      const v = x[k];
      if (!v) return '<td>—</td>';
      const d = i ? v.dt - m.dt : 0;
      return `<td class="${Math.abs(v.dt - best[k]) < 1e-9 ? 'best' : ''}">${sec(v.dt)}${i ? `<small class="${d > 0 ? 'bad' : 'good'}">${signed(d)}</small>` : ''}</td>`;
    }).join('')}</tr>`;
  }).join('');
  $('th-sectors').innerHTML = `<table class="th-table"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  if (T.panel) drawTheaterPanel(s, T);
}

// Indice d'échantillon de la course regardée au pas de lecture `tick`.
function mainIndex(tr, tick) {
  if (!tr.k) return Math.min(tr.n - 1, Math.max(0, Math.floor(tick / tr.every) - 1));
  let lo = 0, hi = tr.n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tr.k[mid] <= tick) lo = mid; else hi = mid; }
  return lo;
}

export function drawTheaterPanel(s, T) {
  // Carte : trajectoires et voitures (positions de la scène : celles qu'on voit).
  if (!T.map) T.map = createTrackMap($('th-map'), s.track);
  const ov = [];
  if (T.traces) T.traces.forEach((tr, i) => {
    if (!tr) return;
    const pts = [];
    for (let k = 0; k < tr.n; k += 3) pts.push([tr.pos[k * 3], tr.pos[k * 3 + 2]]);
    ov.push({ pts, color: T.runs[i].color, width: i ? 1.6 : 2.4 });
  });
  const cars = [s.car.group, ...s.ghosts.map((g) => g.car.group), ...s.rivals.map((r) => r.car.group)];
  cars.forEach((g, i) => { if (i === 0 || g.visible) ov.push({ x: g.position.x, z: g.position.z, color: T.runs[i] ? T.runs[i].color : '#fff', r: i ? 4 : 6 }); });
  T.map.setOverlays(ov);
  // Courbes : vitesse (km/h) de chaque course le long du parcours, et l'écart de chaque course comparée avec la course regardée.
  const cv = $('th-chart'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, W, H);
  if (!T.traces || !T.traces[0]) { g.fillStyle = '#c2b3d6'; g.font = '13px sans-serif'; g.fillText(t('Analyse des courses…'), 10, 20); return; }
  const main = T.traces[0], L = main.ref.length, N = 160, top = H * 0.6;
  let vmax = 30;
  for (const tr of T.traces) if (tr) for (let i = 0; i < tr.n; i++) vmax = Math.max(vmax, tr.v[i]);
  const grid = new Float32Array(N);
  T.traces.forEach((tr, i) => {
    if (!tr) return;
    let j = 0;
    for (let k = 0; k < N; k++) { const sk = (L * k) / (N - 1); while (j < tr.n - 1 && tr.sm[j] < sk) j++; grid[k] = tr.v[j]; }
    drawSeries(g, grid, { x: 0, y: 4, w: W, h: top - 8, min: 0, max: vmax, color: T.runs[i].color, width: i ? 1.2 : 2 });
  });
  g.fillStyle = '#c2b3d6'; g.font = '11px sans-serif';
  g.fillText(t('vitesse (max {v} km/h)', { v: Math.round(vmax * 3.6) }), 6, 14);
  if (T.traces.length > 1) {
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.moveTo(0, top + (H - top) / 2); g.lineTo(W, top + (H - top) / 2); g.stroke();
    let span = 0.2;
    const series = T.traces.map((tr, i) => {
      if (!i || !tr) return null;
      const d = new Float32Array(N);
      for (let k = 0; k < N; k++) { const sk = (L * k) / (N - 1), a = timeAtS(tr, sk), b = timeAtS(main, sk); d[k] = a == null || b == null ? (k ? d[k - 1] : 0) : a - b; span = Math.max(span, Math.abs(d[k])); }
      return d;
    });
    series.forEach((d, i) => { if (d) drawSeries(g, d, { x: 0, y: top, w: W, h: H - top, min: -span, max: span, color: T.runs[i].color, width: 1.4 }); });
    g.fillStyle = '#c2b3d6'; g.fillText(t('écart avec la course regardée (± {s} s ; au-dessus : plus lent)', { s: span.toFixed(2) }), 6, top + 12);
  }
  // Curseur : où en est la course regardée.
  const i = mainIndex(main, s.tick), x = (main.sm[i] / L) * W;
  g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
}
