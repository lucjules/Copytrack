// Laboratoire de comparaison (Copytrack Evolution, E20) : depuis la fiche d'un circuit, rejoue les commandes du record personnel sous deux
// réglages physiques (profils, véhicules v1 / v2, adhérence, pluie) et affiche l'écart secteur par secteur et le long du circuit. Le calcul est
// dans analysis/lab.js ; le circuit n'est jamais modifié. Ces méthodes s'ajoutent au prototype de App.
import { esc } from '../dom.js';
import { formatTime } from '../storage.js';
import { LAB_SETUPS, labCompare } from '../analysis/lab.js';

const signed = (x) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toFixed(3).replace('.', ',')} s`;

// Courbe de l'écart (B − A) le long du circuit, en SVG : au-dessus de la ligne, B est en retard.
function deltaSvg(d, length) {
  const n = d.dt.length;
  if (n < 2) return '';
  let m = 0.05;
  for (let i = 0; i < n; i++) if (Number.isFinite(d.dt[i])) m = Math.max(m, Math.abs(d.dt[i]));
  const W = 320, H = 90, pts = [];
  for (let i = 0; i < n; i++) if (Number.isFinite(d.dt[i])) pts.push(`${((d.s[i] / length) * W).toFixed(1)},${(H / 2 + (d.dt[i] / m) * (H / 2 - 4)).toFixed(1)}`);
  return `<svg class="lab-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Écart le long du circuit"><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" class="lab-axis"/><polyline points="${pts.join(' ')}" class="lab-line"/></svg>`;
}

export const labMethods = {
  // desc : fiche du circuit ; rec : le record personnel (commandes enregistrées).
  openLab(desc, rec) {
    const body = document.createElement('div');
    body.className = 'lab';
    const opts = (sel) => LAB_SETUPS.map((s) => `<option value="${s.id}"${s.id === sel ? ' selected' : ''}>${esc(s.label)}</option>`).join('');
    body.innerHTML = `<p class="meta">Les commandes de ton record (${formatTime(rec.time)}), rejouées à l’identique sous deux réglages. Le circuit ne change pas : chaque réglage s’applique à une copie.</p>
      <div class="lab-pick"><label>A<select id="lab-a">${opts('track')}</select></label><label>B<select id="lab-b">${opts('sim')}</select></label></div>
      <div id="lab-out"></div>`;
    const run = () => {
      const out = body.querySelector('#lab-out'), a = body.querySelector('#lab-a').value, b = body.querySelector('#lab-b').value;
      out.innerHTML = '<p class="meta">Calcul…</p>';
      setTimeout(() => {                               // laisse s'afficher « Calcul… » : deux courses entières sont rejouées
        if (!document.body.contains(body)) return;
        let r;
        try { r = labCompare(desc.track, rec.inputs, a, b); } catch (e) { out.innerHTML = `<p class="lb-off">${esc(e.message)}</p>`; return; }
        if (!r) { out.innerHTML = '<p class="lb-off">Pas de ligne de référence pour ce circuit.</p>'; return; }
        const res = (R) => (R.finished ? formatTime(R.time) : `<span>non terminée</span> · <span>${Math.round(R.reached * 100)} % du parcours</span>`);
        const rows = r.cmp.map((c) => `<tr><td>${c.k}</td><td>${c.a.toFixed(3).replace('.', ',')}</td><td>${c.b.toFixed(3).replace('.', ',')}</td><td class="${c.diff < -0.0005 ? 'lab-neg' : c.diff > 0.0005 ? 'lab-pos' : ''}">${signed(-c.diff)}</td></tr>`).join('');
        out.innerHTML = `${r.same ? '<p class="meta">Les deux réglages donnent le même circuit : aucun écart possible.</p>' : ''}
          <table class="lab-res"><tr><th></th><th>Réglage</th><th>Résultat</th></tr>
            <tr><td>A</td><td>${esc(r.A.setup.label)}</td><td>${res(r.A)}</td></tr><tr><td>B</td><td>${esc(r.B.setup.label)}</td><td>${res(r.B)}</td></tr></table>
          <p>${r.firstDiff ? `Les deux courses se séparent au secteur <b>${r.firstDiff}</b>.` : 'Aucun écart : les deux réglages donnent exactement la même course.'}</p>
          ${deltaSvg(r.delta, r.ref.length)}
          <table class="lab-sec"><tr><th>Secteur</th><th>A (s)</th><th>B (s)</th><th>B face à A</th></tr>${rows}</table>`;
      }, 30);
    };
    this.ui.modal({ title: '🧪 Laboratoire', body, wide: true, actions: [{ label: 'Fermer' }, { label: 'Comparer', primary: true, onClick: () => { run(); return false; } }] });
    run();
  },
};
