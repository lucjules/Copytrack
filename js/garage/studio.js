// Atelier du garage (lot 10) : éditeur de voiture libre. Onglets : Pièces, Peinture, Dessin, Effets, Code.
// Ces méthodes s'ajoutent au prototype de GarageSession (voir garage.js) : `this` est la session. Tout est gratuit et purement visuel.
import { h } from '../dom.js';
import {
  MAX_PARTS, PART_SHAPES, SHAPE_LABELS, PATTERNS, PATTERN_LABELS, ENGINES, ENGINE_LABELS, DRAW, DRAW_PALETTE, EMPTY_DRAW,
  newPart, setPixel, floodFill, drawFromRgba, encodeCar, decodeCar, sanitizeCustom, cloneCustom, DEFAULT_CUSTOM,
} from '../custom.js';
import { sanitizeLoadout } from '../cosmetics.js';

const TABS = [['parts', 'Formes'], ['paint', 'Peinture'], ['draw', 'Dessin'], ['fx', 'Effets'], ['code', 'Code']];

export const studioMethods = {
  // Modifie la personnalisation du brouillon, la valide, l'enregistre (gratuit) et reconstruit la voiture (regroupé : un curseur tire plusieurs fois par seconde).
  _studioSet(mutator, rerender = false) {
    const c = cloneCustom(this.draft.custom);
    mutator(c);
    this.draft = sanitizeLoadout({ ...this.draft, custom: c });
    clearTimeout(this._studioT);
    this._studioT = setTimeout(() => { this._rebuildCar(); this._commitDraft(); }, 120);
    if (rerender) this._render();
  },

  _sRow(label, ...ctl) { return h('div', { class: 'srow' }, h('span', {}, label), ...ctl); },
  _sRange(label, min, max, step, value, onInput) {
    const out = h('output', {}, String(value));
    const input = h('input', { type: 'range', min, max, step, value });
    input.oninput = () => { out.textContent = input.value; onInput(Number(input.value)); };
    return this._sRow(label, input, out);
  },
  _sColor(label, value, onInput, allowNone = false) {
    const input = h('input', { type: 'color', value: value || '#ffffff', class: 'cpick' });
    input.oninput = () => onInput(input.value);
    const kids = [input];
    if (allowNone) kids.push(h('button', { class: 'btn small', type: 'button', onclick: () => { onInput(''); this._render(); } }, value ? 'Défaut' : '✓ Défaut'));
    return this._sRow(label, ...kids);
  },
  _sSelect(label, options, value, onChange) {
    const sel = h('select', {}, ...options.map(([v, t]) => { const o = h('option', { value: v }, t); if (v === value) o.selected = true; return o; }));
    sel.onchange = () => onChange(sel.value);
    return this._sRow(label, sel);
  },
  _sCheck(label, value, onChange) {
    const c = h('input', { type: 'checkbox' });
    c.checked = !!value;
    c.onchange = () => onChange(c.checked);
    return this._sRow(label, c);
  },

  _renderStudio(list) {
    const tab = this.studioTab || 'parts';
    list.appendChild(h('div', { class: 'tabs stabs' }, ...TABS.map(([id, label]) => h('button', { class: 'tab' + (id === tab ? ' on' : ''), type: 'button', onclick: () => { this.studioTab = id; this._render(); } }, label))));
    const box = h('div', { class: 'studio' });
    list.appendChild(box);
    ({ parts: this._studioParts, paint: this._studioPaint, draw: this._studioDraw, fx: this._studioFx, code: this._studioCode }[tab]).call(this, box);
  },

  // ---------------------------------------------------------------- pièces libres
  _studioParts(box) {
    const C = this.draft.custom;
    box.appendChild(h('p', { class: 'meta' }, `Jusqu'à ${MAX_PARTS} pièces posées sur la voiture (et le deltaplane). « Symétrique » en crée une copie de l'autre côté.`));
    box.appendChild(h('div', { class: 'row wrap' }, ...PART_SHAPES.map((s) => h('button', {
      class: 'btn small', type: 'button', disabled: C.parts.length >= MAX_PARTS,
      onclick: () => { this.studioPart = C.parts.length; this._studioSet((c) => c.parts.push(newPart(s)), true); },
    }, '+ ' + SHAPE_LABELS[s]))));
    if (!C.parts.length) return;
    if (this.studioPart == null || this.studioPart >= C.parts.length) this.studioPart = 0;
    box.appendChild(h('div', { class: 'row wrap' }, ...C.parts.map((p, i) => h('button', { class: 'tab' + (i === this.studioPart ? ' on' : ''), type: 'button', onclick: () => { this.studioPart = i; this._render(); } }, `${i + 1} ${SHAPE_LABELS[p.s]}`))));
    const i = this.studioPart, p = C.parts[i];
    const set = (k) => (v) => this._studioSet((c) => { c.parts[i][k] = v; });
    box.append(
      this._sRange('Gauche ↔ droite', -1.6, 1.6, 0.05, p.x, set('x')),
      this._sRange('Hauteur', 0, 2.6, 0.05, p.y, set('y')),
      this._sRange('Arrière ↔ avant', -3, 3, 0.05, p.z, set('z')),
      this._sRange('Largeur', 0.05, 2, 0.05, p.sx, set('sx')),
      this._sRange('Épaisseur', 0.05, 2, 0.05, p.sy, set('sy')),
      this._sRange('Longueur', 0.05, 3, 0.05, p.sz, set('sz')),
      this._sRange('Rotation', 0, 345, 15, p.ry, set('ry')),
      this._sColor('Couleur', p.c, set('c')),
      this._sCheck('Symétrique', p.m, (v) => this._studioSet((c) => { c.parts[i].m = v ? 1 : 0; })),
      this._sCheck('Lumineuse', p.g, (v) => this._studioSet((c) => { c.parts[i].g = v ? 1 : 0; })),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', disabled: C.parts.length >= MAX_PARTS, onclick: () => this._studioSet((c) => { c.parts.push({ ...c.parts[i], z: c.parts[i].z + 0.3 }); this.studioPart = c.parts.length - 1; }, true) }, 'Dupliquer'),
        h('button', { class: 'btn small danger', type: 'button', onclick: () => { this._studioSet((c) => c.parts.splice(i, 1)); this.studioPart = Math.max(0, i - 1); this._render(); } }, 'Supprimer')),
    );
  },

  // ---------------------------------------------------------------- peinture avancée
  _studioPaint(box) {
    const P = this.draft.custom.paint;
    const set = (k) => (v) => this._studioSet((c) => { c.paint[k] = v; });
    box.append(
      this._sCheck('Dégradé', P.grad, (v) => this._studioSet((c) => { c.paint.grad = v; })),
      this._sColor('Couleur du dégradé', P.gradC, set('gradC')),
      this._sSelect('Sens', [['v', 'Haut → bas'], ['h', 'Avant → arrière']], P.gradDir, set('gradDir')),
      this._sSelect('Motif', PATTERNS.map((k) => [k, PATTERN_LABELS[k]]), P.pat, set('pat')),
      this._sColor('Couleur du motif', P.patC, set('patC')),
      this._sRange('Intensité du motif', 0.05, 1, 0.05, P.patA, set('patA')),
      this._sRow('Texte (8 car. max)', Object.assign(h('input', { type: 'text', maxlength: 8, value: P.text, placeholder: 'TEXTE' }), { oninput() { set('text')(this.value); } })),
      this._sColor('Couleur du texte', P.textC, set('textC')),
      this._sRow('Numéro (3 chiffres)', Object.assign(h('input', { type: 'text', maxlength: 3, inputmode: 'numeric', value: P.num, placeholder: '07' }), { oninput() { set('num')(this.value); } })),
      this._sColor('Couleur du numéro', P.numC, set('numC')),
      this._sRow('Plaque (8 car. max)', Object.assign(h('input', { type: 'text', maxlength: 8, value: P.plate, placeholder: 'COPY-01' }), { oninput() { set('plate')(this.value); } })),
    );
    box.appendChild(h('p', { class: 'meta' }, 'La livrée recouvre les deux flancs (le dessin et le numéro d\'un côté, le texte en bas). Les couleurs de base se règlent dans « Couleurs ».'));
  },

  // ---------------------------------------------------------------- dessin 16 × 16
  _studioDraw(box) {
    if (this.studioColor == null) this.studioColor = 3;
    if (!this.studioTool) this.studioTool = 'pen';
    const cell = 18;
    const cv = h('canvas', { width: DRAW * cell, height: DRAW * cell, class: 'pixcv' });
    const g = cv.getContext('2d');
    const redraw = () => {
      const d = this.draft.custom.draw;
      for (let y = 0; y < DRAW; y++) for (let x = 0; x < DRAW; x++) {
        const i = parseInt(d[y * DRAW + x], 16);
        g.fillStyle = (x + y) % 2 ? '#2a2c3d' : '#34374b'; g.fillRect(x * cell, y * cell, cell, cell);
        if (i) { g.fillStyle = DRAW_PALETTE[i]; g.fillRect(x * cell, y * cell, cell, cell); }
      }
    };
    const act = (e) => {
      const r = cv.getBoundingClientRect();
      const x = Math.floor(((e.clientX - r.left) / r.width) * DRAW), y = Math.floor(((e.clientY - r.top) / r.height) * DRAW);
      const idx = this.studioTool === 'erase' ? 0 : this.studioColor;
      this._studioSet((c) => { c.draw = this.studioTool === 'fill' ? floodFill(c.draw, x, y, idx) : setPixel(c.draw, x, y, idx); });
      redraw();
    };
    let down = false;
    cv.onpointerdown = (e) => { down = true; cv.setPointerCapture(e.pointerId); act(e); };
    cv.onpointermove = (e) => { if (down && this.studioTool !== 'fill') act(e); };
    cv.onpointerup = () => { down = false; };
    redraw();
    box.appendChild(h('p', { class: 'meta' }, 'Un dessin de 16 × 16 pixels, collé sur les flancs. Clique ou glisse pour dessiner.'));
    box.appendChild(cv);
    box.appendChild(h('div', { class: 'swatches' }, ...DRAW_PALETTE.map((c, i) => (i ? h('button', {
      class: 'swatch' + (this.studioColor === i && this.studioTool !== 'erase' ? ' on' : ''), type: 'button', style: `background:${c}`,
      onclick: () => { this.studioColor = i; if (this.studioTool === 'erase') this.studioTool = 'pen'; this._render(); },
    }) : null))));
    const tool = (id, label) => h('button', { class: 'btn small' + (this.studioTool === id ? ' primary' : ''), type: 'button', onclick: () => { this.studioTool = id; this._render(); } }, label);
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    file.onchange = async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      try {
        const bmp = await createImageBitmap(f);
        const tmp = h('canvas', { width: DRAW, height: DRAW });
        const t = tmp.getContext('2d', { willReadFrequently: true });
        t.imageSmoothingEnabled = true;
        const k = Math.min(DRAW / bmp.width, DRAW / bmp.height);
        t.drawImage(bmp, (DRAW - bmp.width * k) / 2, (DRAW - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
        const d = drawFromRgba(t.getImageData(0, 0, DRAW, DRAW).data);
        this._studioSet((c) => { c.draw = d; }, true);
      } catch { this.app.ui.flash('Image illisible.'); }
    };
    box.appendChild(h('div', { class: 'row wrap' }, tool('pen', '✏ Crayon'), tool('fill', '🪣 Pot'), tool('erase', '⌫ Gomme'),
      h('button', { class: 'btn small', type: 'button', onclick: () => file.click() }, '🖼 Importer une image'),
      h('button', { class: 'btn small danger', type: 'button', onclick: () => this._studioSet((c) => { c.draw = EMPTY_DRAW; }, true) }, 'Tout effacer'), file));
  },

  // ---------------------------------------------------------------- effets
  _studioFx(box) {
    const F = this.draft.custom.fx;
    const set = (k) => (v) => this._studioSet((c) => { c.fx[k] = v; });
    box.append(
      this._sColor('Couleur de la traînée', F.trailC, set('trailC'), true),
      this._sRange('Longueur de la traînée', 0.5, 2, 0.1, F.trailLen, set('trailLen')),
      this._sColor('Étincelles de dérapage', F.spark, set('spark'), true),
      this._sColor('Fumée de dérapage', F.smoke, set('smoke'), true),
      this._sSelect('Timbre du moteur', ENGINES.map((k) => [k, ENGINE_LABELS[k]]), F.engine, (v) => { set('engine')(v); this.app.audio.setVoice({ ...F, engine: v }); }),
      this._sRange('Hauteur du moteur', 0.7, 1.4, 0.05, F.pitch, (v) => { set('pitch')(v); this.app.audio.setVoice({ ...F, pitch: v }); }),
      this._sRange('Hauteur du klaxon', 0.6, 1.6, 0.05, F.hornPitch, (v) => { set('hornPitch')(v); this.app.audio.setVoice({ ...F, hornPitch: v }); }),
      h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: () => { this.app.audio.setVoice(F); this.app.audio.horn(this.draft.horn); } }, '🔊 Essayer le klaxon')),
    );
    box.appendChild(h('p', { class: 'meta' }, 'Une couleur de traînée active la traînée même sans celle du catalogue. Rien de ceci ne change la conduite.'));
  },

  // ---------------------------------------------------------------- code partageable
  _studioCode(box) {
    const code = encodeCar(this.draft);
    const out = h('textarea', { readonly: true, rows: 4, class: 'codebox' }, code);
    const inp = h('textarea', { rows: 3, class: 'codebox', placeholder: 'Colle ici un code de voiture (SHC1:…)' });
    box.append(
      h('p', { class: 'meta' }, 'Le code contient ta voiture (catalogue et atelier). Les éléments payants restent à débloquer chez celui qui l\'importe.'),
      out,
      h('div', { class: 'row' }, h('button', { class: 'btn small primary', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(code); this.app.ui.flash('Code copié !'); } catch { out.select(); this.app.ui.flash('Copie impossible : sélectionne le texte.'); } } }, 'Copier mon code')),
      inp,
      h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: () => {
        try {
          this.draft = sanitizeLoadout(decodeCar(inp.value));
          this._rebuildCar(); this._commitDraft(); this._render();
          this.app.ui.flash('Voiture importée.');
        } catch (e) { this.app.ui.flash(e.message); }
      } }, 'Importer'),
      h('button', { class: 'btn small danger', type: 'button', onclick: () => { this.draft = sanitizeLoadout({ ...this.draft, custom: DEFAULT_CUSTOM }); this._rebuildCar(); this._commitDraft(); this._render(); } }, 'Retirer toute la personnalisation')),
    );
  },
};

export { sanitizeCustom };
