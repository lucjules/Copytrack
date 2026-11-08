// « Mes pièces » : l'atelier de pièces décoratives de l'éditeur (lot 12). On assemble des formes simples, on voit la pièce de face et de dessus, on l'enregistre dans sa
// bibliothèque, puis on la pose comme n'importe quelle décoration. Les règles sont dans customDeco.js. Ces méthodes s'ajoutent au prototype de EditorSession.
import { h } from '../dom.js';
import { createPartsPreview } from './preview3d.js';
import { listCustomDecos, saveCustomDeco, deleteCustomDeco, newId } from '../storage.js';
import { MAX_DECO_PARTS, DECO_SHAPES, DECO_SHAPE_LABELS, sanitizeDecoPart, sanitizeDecoParts, encodeDeco, decodeDeco, MAX_CUSTOM_DECOS } from '../customDeco.js';

// Dessin 2D d'une pièce : vue de face (x, y) et de dessus (x, z), à l'échelle de l'espace de travail (±8 m, 12 m de haut).
function drawDeco(cv, parts, sel, view) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#23243a'; g.fillRect(0, 0, W, H);
  const sx = W / 16, sy = view === 'front' ? H / 12 : H / 16;
  const X = (x) => W / 2 + x * sx, Y = (y, z) => (view === 'front' ? H - y * sy : H / 2 + z * sy);
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
  for (let i = -8; i <= 8; i += 2) { g.beginPath(); g.moveTo(X(i), 0); g.lineTo(X(i), H); g.stroke(); }
  parts.forEach((p, i) => {
    const w = p.sx * sx, hh = (view === 'front' ? p.sy * sy : p.sz * sy);
    const cx = X(p.x), cy = Y(p.y, p.z);
    g.fillStyle = p.c; g.globalAlpha = p.g ? 1 : 0.9;
    g.strokeStyle = i === sel ? '#ffffff' : 'rgba(0,0,0,0.5)'; g.lineWidth = i === sel ? 2 : 1;
    g.beginPath();
    if (p.s === 'sphere' || p.s === 'ring') g.ellipse(cx, cy, w / 2, hh / 2, 0, 0, 6.3);
    else if (p.s === 'cone' && view === 'front') { g.moveTo(cx, cy - hh / 2); g.lineTo(cx + w / 2, cy + hh / 2); g.lineTo(cx - w / 2, cy + hh / 2); g.closePath(); }
    else if (p.s === 'cyl' && view === 'top') g.ellipse(cx, cy, w / 2, hh / 2, 0, 0, 6.3);
    else g.rect(cx - w / 2, cy - hh / 2, w, hh);
    g.fill(); g.stroke();
  });
  g.globalAlpha = 1;
}

export const cdecoMethods = {
  // Section ajoutée au bas de l'onglet Prefabs.
  _buildCdecoSection(panel) {
    const mine = listCustomDecos();
    const sec = h('div', { class: 'cd-sec' },
      h('div', { class: 'pf-head' }, 'Mes pièces décoratives ', h('small', {}, `jusqu'à ${MAX_CUSTOM_DECOS} par circuit`)),
      h('div', { class: 'pf-row' }, ...(mine.length ? mine.map((p) => h('span', { class: 'cd-mine' },
        h('button', { class: 'pf-btn', type: 'button', 'data-cd-use': p.id, onclick: () => this._useCdeco(p) }, h('b', {}, p.name), h('small', {}, `${p.parts.length} forme${p.parts.length > 1 ? 's' : ''}`)),
        h('button', { class: 'pf-x', type: 'button', title: 'Modifier', onclick: () => this._cdecoDialog(p) }, '✎'),
        h('button', { class: 'pf-x', type: 'button', title: 'Copier le code (à partager)', onclick: () => this._copyText(encodeDeco(p.name, p.parts), 'Code de la pièce copié : envoie-le à un ami (Importer un code).') }, '⧉'),
        h('button', { class: 'pf-x', type: 'button', title: 'Supprimer', onclick: () => { deleteCustomDeco(p.id); this.app.audio.erase(); this._buildPrefabPanel(); } }, '✕'))) : [h('span', { class: 'meta' }, 'Aucune : crée ta première pièce.')])),
      h('div', { class: 'pf-actions' },
        h('button', { class: 'btn small', type: 'button', 'data-cd': 'new', onclick: () => this._cdecoDialog(null) }, '✦ Créer une pièce'),
        h('button', { class: 'btn small', type: 'button', 'data-cd': 'import', onclick: () => this._cdecoImportDialog() }, 'Importer un code')));
    panel.appendChild(sec);
  },

  _useCdeco(p) {
    this.deco.cp = sanitizeDecoParts(p.parts);
    this.setTool('deco:custom');
    this.app.ui.flash(`Pièce « ${p.name} » prête : clique pour la poser.`, 2.5);
  },

  _cdecoImportDialog() {
    const ta = h('textarea', { rows: 3, class: 'codebox', placeholder: 'Colle ici un code de pièce (SHD1:…)' });
    this.app.ui.modal({ title: 'Importer une pièce', body: h('div', {}, ta), actions: [{ label: 'Annuler' }, { label: 'Importer', primary: true, onClick: () => {
      try { const d = decodeDeco(ta.value); saveCustomDeco({ id: newId(), name: d.name, parts: d.parts }); this.app.ui.flash(`Pièce « ${d.name} » importée.`); this._buildPrefabPanel(); return true; }
      catch (e) { this.app.ui.flash(e.message); return false; }
    } }] });
  },

  // Fenêtre de création / modification d'une pièce.
  _cdecoDialog(existing) {
    const parts = existing ? sanitizeDecoParts(existing.parts) : [sanitizeDecoPart({ s: 'box', x: 0, y: 1, z: 0, sx: 3, sy: 2, sz: 3, c: '#8f7cff' })];
    let sel = 0;
    const name = h('input', { type: 'text', maxlength: 24, value: existing ? existing.name : 'Ma pièce' });
    const front = h('canvas', { width: 240, height: 180, class: 'pixcv cdv' }), top = h('canvas', { width: 240, height: 240, class: 'pixcv cdv' });
    const ctl = h('div', { class: 'studio' });
    const p3d = h('canvas', { width: 240, height: 180, class: 'pixcv cdv cdv3d', title: 'Aperçu 3D : glisser pour tourner', 'aria-label': 'Aperçu 3D de la pièce' });
    const preview = createPartsPreview(p3d);
    const redraw = () => { drawDeco(front, parts, sel, 'front'); drawDeco(top, parts, sel, 'top'); if (preview) preview.set(parts); };
    const row = (label, min, max, step, key) => {
      const p = parts[sel], out = h('output', {}, String(p[key])), r = h('input', { type: 'range', min, max, step, value: p[key] });
      r.oninput = () => { parts[sel] = sanitizeDecoPart({ ...parts[sel], [key]: Number(r.value) }); out.textContent = parts[sel][key]; redraw(); };
      return h('div', { class: 'srow' }, h('span', {}, label), r, out);
    };
    const build = () => {
      ctl.replaceChildren();
      ctl.appendChild(h('div', { class: 'row wrap' }, ...parts.map((p, i) => h('button', { class: 'tab' + (i === sel ? ' on' : ''), type: 'button', onclick: () => { sel = i; build(); redraw(); } }, `${i + 1} ${DECO_SHAPE_LABELS[p.s]}`)),
        ...DECO_SHAPES.map((s) => h('button', { class: 'btn small', type: 'button', disabled: parts.length >= MAX_DECO_PARTS, onclick: () => { parts.push(sanitizeDecoPart({ s, x: 0, y: 1, z: 0, sx: 2, sy: 2, sz: 2, c: '#c0c6e0' })); sel = parts.length - 1; build(); redraw(); } }, '+ ' + DECO_SHAPE_LABELS[s]))));
      const p = parts[sel];
      if (!p) return;
      const col = h('input', { type: 'color', value: p.c, class: 'cpick' });
      col.oninput = () => { parts[sel] = sanitizeDecoPart({ ...parts[sel], c: col.value }); redraw(); };
      const glow = h('input', { type: 'checkbox' }); glow.checked = !!p.g;
      glow.onchange = () => { parts[sel] = sanitizeDecoPart({ ...parts[sel], g: glow.checked }); redraw(); };
      ctl.append(row('Gauche ↔ droite', -8, 8, 0.1, 'x'), row('Hauteur', 0, 12, 0.1, 'y'), row('Avant ↔ arrière', -8, 8, 0.1, 'z'),
        row('Largeur', 0.1, 8, 0.1, 'sx'), row('Hauteur de la forme', 0.1, 10, 0.1, 'sy'), row('Profondeur', 0.1, 8, 0.1, 'sz'), row('Rotation', 0, 345, 15, 'ry'),
        h('div', { class: 'srow' }, h('span', {}, 'Couleur'), col), h('div', { class: 'srow' }, h('span', {}, 'Lumineuse'), glow),
        h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', disabled: parts.length >= MAX_DECO_PARTS, onclick: () => { parts.push({ ...parts[sel], x: parts[sel].x + 0.5 }); sel = parts.length - 1; build(); redraw(); } }, 'Dupliquer'),
          h('button', { class: 'btn small danger', type: 'button', disabled: parts.length <= 1, onclick: () => { parts.splice(sel, 1); sel = Math.max(0, sel - 1); build(); redraw(); } }, 'Supprimer la forme')));
    };
    const body = h('div', {}, h('div', { class: 'srow' }, h('span', {}, 'Nom'), name), h('div', { class: 'row wrap' }, front, top, ...(preview ? [p3d] : [])), h('p', { class: 'meta' }, 'Vue de face (à gauche), de dessus (au milieu) et en 3D (glisser pour tourner) ; 1 case = 2 m. La pièce se pose ensuite comme une décoration (taille, rotation, couleur réglables).'), ctl);
    build(); redraw();
    this.app.ui.modal({ title: existing ? 'Modifier la pièce' : 'Créer une pièce', body, wide: true, onClose: () => { if (preview) preview.dispose(); }, actions: [{ label: 'Annuler' }, { label: 'Enregistrer', primary: true, onClick: () => {
      const clean = sanitizeDecoParts(parts);
      if (!clean.length) { this.app.ui.flash('Ajoute au moins une forme.'); return false; }
      const e = saveCustomDeco({ id: existing ? existing.id : newId(), name: name.value.trim() || 'Ma pièce', parts: clean });
      this.app.ui.flash(`Pièce « ${e.name} » enregistrée.`);
      this._buildPrefabPanel();
      return true;
    } }] });
  },
};
