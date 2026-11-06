// Contenu du panneau selon la sélection : pièce, pièce mobile, caractéristiques, couleurs, décoration.
// Ces méthodes s'ajoutent au prototype de Inspector (voir inspector.js) : `this` est l'instance.
import { MAX_LEVEL } from '../constants.js';
import { PIECES, SURFACES, SURFACE_ORDER, surfaceAllowed, flagAllowed, THEMES, MOVER, moverParams, paramText, ORIENTS, tileOri } from '../pieces.js';
import { FAMILIES, familyOf, validValues, withTrait, isFamilyMember, REPLACED_BY_OPTION } from '../families.js';
import { styleFor } from '../trackGeometry.js';
import { DECO_COLORS } from '../decoData.js';
import { safeUrl } from '../decos.js';
import { isObstacle } from '../obstacles.js';
import { h } from '../dom.js';
import { LEGACY_CP, MIRROR_TYPES } from '../inspector.js';
const isStartFinish = (type) => { const sp = PIECES[type] && PIECES[type].special; return sp === 'start' || sp === 'finish'; };

export const bodyMethods = {
  _tileBody(t) {
    const ed = this.ed, P = PIECES[t.t];
    const rows = [];
    const group = (text) => rows.push(h('div', { class: 'insp-group' }, text));
    group('Position');
    rows.push(this._num('Case X', () => t.x, (v) => ed._applyTilePatch(t, { x: Math.round(v) }), { step: 1 }));
    rows.push(this._num('Case Z', () => t.z, (v) => ed._applyTilePatch(t, { z: Math.round(v) }), { step: 1 }));
    rows.push(this._num('Niveau', () => t.l, (v) => ed._applyTilePatch(t, { l: v }), { step: 0.5, min: 0, max: MAX_LEVEL }));
    // Rotation : quatre boutons liés à tile.r
    const rot = h('div', { class: 'insp-rot', role: 'group', 'aria-label': 'Rotation' }, [0, 1, 2, 3].map((r) => {
      const b = h('button', { class: 'btn', onclick: () => this._apply(() => ed._applyTilePatch(t, { r })) }, `${r * 90}°`);
      this._sync.push(() => { b.classList.toggle('on', t.r === r); b.setAttribute('aria-pressed', String(t.r === r)); });
      return b;
    }));
    rows.push(h('div', { class: 'insp-row' }, h('span', {}, 'Rotation'), rot));

    // Caractéristiques (pièce d'une famille : listes déroulantes) ou Type (autres pièces de même empreinte)
    const fam = familyOf(t.t);
    if (fam) {
      group('Caractéristiques · ' + FAMILIES[fam.fam].label);
      for (const tr of FAMILIES[fam.fam].traits) rows.push(this._traitSelect(t, fam.fam, tr));
      rows.push(h('div', { class: 'insp-note' }, `Empreinte ${P.size}×${P.size} case${P.size > 1 ? 's' : ''}.`));
    } else {
      group('Type');
      const types = Object.keys(PIECES).filter((k) => PIECES[k].size === P.size && (k === t.t || (!isStartFinish(k) && !isFamilyMember(k) && !REPLACED_BY_OPTION.has(k))));
      rows.push(this._select('Type', types.map((k) => [k, PIECES[k].label]), () => t.t, (v) => ed._retypeTile(t, v), isStartFinish(t.t)));
      if (MIRROR_TYPES[t.t]) {
        rows.push(h('div', { class: 'insp-row' }, h('span', {}, 'Miroir'),
          h('button', { class: 'btn', title: 'Version gauche / droite de la pièce', onclick: () => this._apply(() => ed._retypeTile(t, MIRROR_TYPES[t.t])) }, '⇋ Inverser gauche / droite')));
      }
      if (LEGACY_CP[t.t]) {
        rows.push(h('div', { class: 'insp-row' }, h('span', {}, 'Checkpoint'),
          h('button', { class: 'btn', title: 'Remplace cette pièce par une route normale portant l’option Checkpoint', onclick: () => this._apply(() => ed._legacyToOption(t)) }, '→ Convertir en option')));
      }
    }

    // Revêtement (une bifurcation en a deux : voie directe / voie déportée)
    const fork = P.kind === 'fork';
    group(fork ? 'Revêtement · voie directe' : 'Revêtement');
    const surfs = SURFACE_ORDER.filter((s) => s === (t.s || '') || surfaceAllowed(t.t, s, t.o | 0));
    rows.push(this._select('Type', surfs.map((s) => [s, SURFACES[s].label]), () => t.s || '', (v) => ed.track.setSurface(t, v, SURFACES[v] && SURFACES[v].def != null ? ed._surfParamValue(v) : 0) || true));
    const S = SURFACES[t.s || ''];
    if (S && S.def != null) {
      rows.push(this._range(S.param || 'Intensité', () => t.p || S.def, (v) => ed.track.setSurface(t, t.s, v) || true, { min: S.min, max: S.max, step: 1, fmt: (v) => paramText(t.s, v) }));
    }
    if (fork) {
      group('Revêtement · voie déportée');
      const s2s = SURFACE_ORDER.filter((s) => s && (s === (t.s2 || '') || surfaceAllowed(t.t, s, t.o | 0)));
      rows.push(this._select('Type', [['', 'Comme la voie directe'], ['-', 'Route normale'], ...s2s.map((s) => [s, SURFACES[s].label])], () => t.s2 || '',
        (v) => ed.track.setSurface2(t, v, v && SURFACES[v] && SURFACES[v].def != null ? ed._surfParamValue(v) : 0) || true));
      const S2 = SURFACES[t.s2 || ''];
      if (S2 && S2.def != null) {
        rows.push(this._range(S2.param || 'Intensité', () => t.p2 || S2.def, (v) => ed.track.setSurface2(t, t.s2, v) || true, { min: S2.min, max: S2.max, step: 1, fmt: (v) => paramText(t.s2, v) }));
      }
    }

    // Options
    group('Options');
    const flag = (f, label, hint) => this._check(label, () => t[f], (on) => (on !== !!t[f] ? ed.track.toggleFlag(t, f) || false : true), !flagAllowed(t.t, f, t) && !t[f], hint);
    // Orientation (0.9.3) : sol, mur gauche / droit (vus dans le sens de la flèche), plafond (à l'envers : gravité inversée).
    rows.push(this._select('Orientation', ORIENTS.map((x) => [String(x.id), x.label]), () => String(tileOri(t)),
      (v) => {
        const n = +v;
        if (n === tileOri(t)) return true;
        const ok = n === 3 ? ed.track.toggleFlag(t, 'v') : ed.track.toggleFlag(t, 'o', n);
        if (!ok) ed.app.ui.flash(n === 3 ? 'Pas la place à l’envers : monte d’abord, ou libère le niveau en dessous.' : n ? 'Pas la place pour un mur : la route descend de 2 niveaux sous son niveau (monte d’abord, libère le dessous).' : 'Pas la place pour remettre la route à plat.');
        return ok || false;
      }, false, (v) => +v === 1 || +v === 2 ? !flagAllowed(t.t, 'o', null, +v) : false));
    rows.push(flag('nb', 'Sans bordures', 'Plus de rebord'));
    rows.push(flag('tn', 'Tunnel', 'Voûte autour de la route'));
    // Checkpoint : simple case à cocher (portique sur route, balise sur plateforme). L'ancien anneau aérien (cp = 2) reste lisible :
    // il s'affiche « aérien (ancien) » et se convertit en portique en cochant / décochant.
    rows.push(this._check(t.cp === 2 ? 'Checkpoint (aérien, ancien)' : 'Checkpoint', () => !!t.cp,
      (on) => { if (on === !!t.cp) return true; return ed.track.toggleFlag(t, 'cp', t.cp || 1) || false; },
      !!P.special || (!flagAllowed(t.t, 'cp', t, 1) && !t.cp), 'Route : portique. Plateforme : balise au sol.'));
    rows.push(flag('tb', 'Anneau turbo', 'Anneau à traverser pour un coup de turbo (ligne droite plate, à l’endroit)'));
    // Thème (visuel)
    rows.push(this._select('Thème', THEMES.map((x) => [String(x.id), x.label]), () => String(t.th || 0),
      (v) => { const n = +v, cur = t.th || 0; if (n === cur) return true; return ed.track.toggleFlag(t, 'th', n === 0 ? cur : n) || false; },
      !flagAllowed(t.t, 'th', t)));
    // Mouvement + réglages
    const mvOk = flagAllowed(t.t, 'mv', t) || !!t.mv;
    rows.push(this._select('Mouvement', [['0', 'Aucun'], ['1', 'Ascenseur'], ['2', 'Glissière'], ['3', 'Rotation']], () => String(t.mv || 0),
      (v) => { const n = +v; if (n === (t.mv || 0)) return true; return ed.track.toggleFlag(t, 'mv', n === 0 ? t.mv : n) || false; }, !mvOk));
    if (t.mv) rows.push(...this._moverRows(t));
    return rows;
  },

  // Vitesse et amplitude de l'ascenseur / de la glissière / de la rotation.
  _moverRows(t) {
    const ed = this.ed, M = MOVER[t.mv];
    const rows = [];
    const sign = () => (moverParams(t).speed < 0 ? -1 : 1);
    rows.push(this._range('Vitesse', () => Math.abs(moverParams(t).speed), (v) => ed.track.setMover(t, v * sign(), undefined),
      { min: Math.abs(M.speed.min) === M.speed.max ? 25 : M.speed.min, max: M.speed.max, step: 5, fmt: (v) => v + ' %' }));
    rows.push(this._range(t.mv === 1 ? 'Hauteur' : t.mv === 2 ? 'Distance' : 'Angle', () => moverParams(t).amp, (v) => ed.track.setMover(t, undefined, v),
      { min: M.amp.min, max: M.amp.max, step: M.amp.step, fmt: (v) => (t.mv === 3 && v >= 360 ? 'Tour complet' : v + M.amp.unit) }));
    if (t.mv === 3) {
      rows.push(this._check('Sens inverse', () => moverParams(t).speed < 0, (on) => ed.track.setMover(t, (on ? -1 : 1) * Math.abs(moverParams(t).speed), undefined), false, 'Tourne dans l’autre sens'));
    }
    rows.push(h('div', { class: 'insp-row' }, h('span', {}, ''),
      h('button', { class: 'btn', title: `Vitesse et amplitude d’origine (${M.label})`, onclick: () => this._apply(() => ed.track.setMover(t, 0, 0)) }, '↺ Valeurs par défaut')));
    return rows;
  },

  // Menu déroulant d'une caractéristique de famille : les combinaisons qui n'existent pas sont grisées.
  _traitSelect(t, fam, tr) {
    const sel = h('select', {}, tr.values.map(([v, text]) => h('option', { value: v }, text)));
    sel.setAttribute('aria-label', tr.label);
    sel.addEventListener('change', () => this._apply(() => this._setTrait(t, fam, tr.id, sel.value)));
    this._sync.push(() => {
      const cur = familyOf(t.t);
      if (!cur) return;
      const ok = validValues(fam, cur.traits, tr.id);
      sel.value = cur.traits[tr.id];
      for (const o of sel.options) o.disabled = !ok.has(o.value) && o.value !== cur.traits[tr.id];
    });
    return h('label', { class: 'insp-row' }, h('span', {}, tr.label), sel);
  },

  _setTrait(t, fam, id, value) {
    const cur = familyOf(t.t);
    if (!cur) return false;
    const type = withTrait(fam, cur.traits, id, value);
    if (!type || type === t.t) return true;
    if (this.ed._retypeFamily(t, type)) return true;
    this.ed.app.ui.flash(`Pas la place (${PIECES[type].size}×${PIECES[type].size}).`, 2.4);
    return false;
  },

  // Onglet Couleurs : couleurs de la chaussée, des lignes et des bordures d'une pièce ; couleur d'une décoration.
  _colorsBody(obj) {
    return this.sel.kind === 'tile' ? this._tileColors(obj) : this._decoColors(obj);
  },

  _colorRow(label, get, def, set, reset) {
    const input = h('input', { type: 'color', 'aria-label': label });
    const code = h('span', { class: 'code' });
    const undo = h('button', { class: 'btn', title: 'Revenir à la couleur d’origine', 'aria-label': `${label} : couleur d’origine`, onclick: () => this._apply(() => reset()) }, '↺');
    input.addEventListener('input', () => this._apply(() => set(input.value), { live: true }));
    input.addEventListener('change', () => this.ed._commit());
    this._sync.push(() => {
      const own = get();
      if (document.activeElement !== input) input.value = own || def();
      code.textContent = own ? own : 'origine';
      undo.disabled = !own;
    });
    return h('div', { class: 'insp-color' }, h('span', {}, label), input, code, undo);
  },

  _tileColors(t) {
    const ed = this.ed;
    const rows = [h('div', { class: 'insp-group' }, 'Couleurs de la pièce')];
    const defaults = () => { const b = styleFor({ ...t, col: null }); return { road: b.road[0], line: b.line, rail: b.railA }; };
    for (const [key, label] of [['road', 'Route'], ['line', 'Lignes'], ['rail', 'Bordures']]) {
      rows.push(this._colorRow(label, () => (t.col && t.col[key]) || '', () => defaults()[key],
        (v) => ed.track.setColors(t, { ...t.col, [key]: v }), () => ed.track.setColors(t, { ...t.col, [key]: undefined })));
    }
    rows.push(h('div', { class: 'insp-row' }, h('span', {}, ''),
      h('button', { class: 'btn', onclick: () => this._apply(() => ed.track.setColors(t, null)) }, '↺ Tout réinitialiser')));
    rows.push(h('div', { class: 'insp-note' }, 'Visuel seulement : aucun effet sur le jeu ni la vérification.'));
    return rows;
  },

  _decoColors(d) {
    const ed = this.ed;
    const touch = () => { ed.track.version++; return true; };
    const rows = [h('div', { class: 'insp-group' }, 'Couleur de la décoration')];
    const sw = h('div', { class: 'insp-swatches', role: 'group', 'aria-label': 'Couleurs prédéfinies' }, DECO_COLORS.map((c, i) => {
      const b = h('button', { class: 'swatch', style: `background:${c}`, title: `Couleur ${i + 1}`, onclick: () => this._apply(() => { d.c = i + 1; d.cc = ''; return touch(); }) });
      this._sync.push(() => b.classList.toggle('on', !d.cc && (d.c | 0) === i + 1));
      return b;
    }));
    rows.push(h('div', { class: 'insp-row' }, h('span', {}, 'Palette'), sw));
    rows.push(h('div', { class: 'insp-row' }, h('span', {}, 'Naturelle'),
      h('button', { class: 'btn', onclick: () => this._apply(() => { d.c = 0; d.cc = ''; return touch(); }) }, 'Couleurs d’origine')));
    rows.push(this._colorRow('Libre', () => d.cc || '', () => (d.c > 0 ? DECO_COLORS[d.c - 1] : '#ffffff'),
      (v) => { d.cc = v; return touch(); }, () => { d.cc = ''; return touch(); }));
    return rows;
  },

  _decoBody(d) {
    const ed = this.ed;
    const touch = () => { ed.track.version++; return true; };
    const rows = [h('div', { class: 'insp-group' }, 'Position')];
    rows.push(this._num('X', () => d.x, (v) => { d.x = v; return touch(); }, { step: 0.5 }));
    rows.push(this._num('Hauteur', () => d.y, (v) => { d.y = v; return touch(); }, { step: 0.5 }));
    rows.push(this._num('Z', () => d.z, (v) => { d.z = v; return touch(); }, { step: 0.5 }));
    rows.push(this._range('Rotation', () => Math.round(((d.ry || 0) * 180 / Math.PI + 360) % 360), (v) => { d.ry = v * Math.PI / 180; return touch(); }, { min: 0, max: 359, step: 1, fmt: (v) => v + '°' }));
    const obst = isObstacle(d.k);
    rows.push(this._range('Taille', () => d.s, (v) => { d.s = v; return touch(); }, { min: obst ? 0.5 : 0.3, max: obst ? 2.5 : 6, step: 0.05, fmt: (v) => '×' + (+v).toFixed(2) }));
    if (d.k === 'plaque') {
      const url = h('input', { type: 'text', maxlength: 400, placeholder: 'https://…', spellcheck: false });
      url.addEventListener('change', () => {
        if (url.value && !safeUrl(url.value)) { ed.app.ui.flash('URL https:// invalide.'); ed.app.audio.error(); this._syncPanel(); return; }
        this._apply(() => { d.u = url.value; return touch(); });
      });
      this._sync.push(() => { if (document.activeElement !== url) url.value = d.u || ''; });
      rows.push(h('label', { class: 'insp-row' }, h('span', {}, 'Image'), url));
    }
    if (obst) rows.push(this._range('Décalage', () => d.ph || 0, (v) => { d.ph = Math.max(0, Math.min(0.95, Math.round(v * 20) / 20)); return touch(); }, { min: 0, max: 0.95, step: 0.05, fmt: (v) => Math.round(v * 100) + ' %' }));
    return rows;
  },
};
