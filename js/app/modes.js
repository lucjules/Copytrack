// Modes de jeu, règles de partie et paquets (lot 13) : l'interface. Les règles et validations sont dans rules.js et mods.js. Ces méthodes s'ajoutent au prototype de App.
import { h } from '../dom.js';
import { listModes, saveMode, deleteMode, listMyTracks, newId, MODES_MAX } from '../storage.js';
import { Track } from '../track.js';
import { GOALS, goalLabel, goalMet } from '../career.js';
import { profile, saveProfile, owns, setLoadout } from '../profile.js';
import { DEFAULT_LOADOUT } from '../cosmetics.js';
import { sanitizeUi } from '../uitheme.js';
import { saveCustomDeco } from '../storage.js';
import {
  BUILTIN_MODES, VEHICLE_CHOICES, GRAVITY_CHOICES, sanitizeRules, sanitizeMode, sanitizeGoal, applyRules, describeRules, encodeMode, decodeMode, DEFAULT_RULES,
} from '../rules.js';
import { PACK_KINDS, encodePack, decodePack, describePack, ownedCar } from '../mods.js';
import { MAX_CUSTOM_CAMS } from '../camprefs.js';
import { listCustomDecos } from '../storage.js';
import { communityModes, publishMode, reportMode, deleteCommunityMode, modePlayed, modeRulesOf } from '../online/community.js';
import { parseVariant, variantFits } from '../variants.js';
import { online } from '../online.js';

const sel = (options, value, onChange) => {
  const s = h('select', {}, ...options.map(([v, t]) => { const o = h('option', { value: String(v) }, t); if (String(v) === String(value)) o.selected = true; return o; }));
  s.onchange = () => onChange(s.value);
  return s;
};
const row = (label, ...c) => h('div', { class: 'srow' }, h('span', {}, label), ...c);
const OFFROAD = [[-1, 'Celui du circuit'], [1, 'Autorisé'], [0, 'Interdit']];
const LAPS = [[0, 'Celui du circuit'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']];

export const modesMethods = {
  // Contrôles des règles (modes et salons multijoueur) : renvoie un élément ; onChange reçoit les règles validées.
  _rulesControls(rules, onChange, { room = false } = {}) {
    let r = sanitizeRules(rules);
    const set = (patch) => { r = sanitizeRules({ ...r, ...patch }); onChange(r); };
    const box = h('div', { class: 'studio' },
      row('Gravité de départ', sel(GRAVITY_CHOICES, r.g0, (v) => set({ g0: +v }))),
      row('Véhicule de départ', sel(VEHICLE_CHOICES, r.veh0, (v) => set({ veh0: v }))),
      row('Vitesse de départ', sel([[-1, 'Celle du circuit'], [0, 'Arrêté'], [100, '100 km/h'], [200, '200 km/h']], r.v0, (v) => set({ v0: +v }))),
      row('Hors piste', sel(OFFROAD, r.offroad, (v) => set({ offroad: +v }))),
      row('Tours (circuits fermés)', sel(LAPS, r.laps, (v) => set({ laps: +v }))),
    );
    const chk = (label, key, on, off = '') => { const c = h('input', { type: 'checkbox' }); c.checked = r[key] === on; c.onchange = () => set({ [key]: c.checked ? on : off }); box.appendChild(row(label, c)); };
    chk('Sans obstacles', 'obstacles', 'off', '');
    if (room) chk('Voitures identiques (même apparence pour tous)', 'sameCars', 1, 0);
    return box;
  },

  // Dans le salon (hôte) : les règles de la partie.
  _roomRulesBlock(room) {
    const wrap = h('details', { class: 'mp-rules' }, h('summary', {}, 'Règles de la partie'));
    wrap.appendChild(this._rulesControls(room.rules || DEFAULT_RULES, (r) => room.setRules(r), { room: true }));
    wrap.appendChild(h('p', { class: 'meta' }, 'Les règles s\'appliquent à tous les joueurs, à chaque course. Ce sont des réglages que les circuits savent déjà porter : aucune voiture ne change de performances.'));
    if (room.rules) wrap.open = true;
    return wrap;
  },

  // ---------------------------------------------------------------- menu des modes
  modesMenu() {
    const body = h('div', { class: 'studio' });
    const render = () => {
      body.replaceChildren();
      body.appendChild(h('p', { class: 'meta' }, 'Un mode = des règles + un objectif, à jouer sur le circuit de ton choix (sans records ni classements). Pas de pièces à gagner : tout est pour le plaisir. Publié (🌐), un mode a son classement sur chaque circuit de la carrière.'));
      const card = (m, own) => h('div', { class: 'srow mode-row', 'data-mode': m.id },
        h('span', { class: 'mode-name' }, h('b', {}, m.name), h('small', {}, ...[m.desc, ...describeRules(m.rules), m.goal ? '🎯 ' + goalLabel(m.goal) : ''].filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x])))),
        h('button', { class: 'btn small primary', type: 'button', onclick: () => { this.ui.closeModal(); this._pickTrackForMode(m); } }, 'Jouer'),
        ...(own ? [
          h('button', { class: 'btn small', type: 'button', title: 'Modifier', onclick: () => { this.ui.closeModal(); this._modeDialog(m); } }, '✎'),
          h('button', { class: 'btn small', type: 'button', title: 'Publier dans la communauté : ce mode aura son classement sur chaque circuit', 'data-md-pub': m.id, onclick: async () => {
            try { await publishMode(m, this.settings.playerName); this.ui.flash(`Mode « ${m.name} » publié : Modes de jeu › Modes publiés.`, 3); } catch (e) { this.ui.flash(e.message, 4); }
          } }, '🌐'),
          h('button', { class: 'btn small', type: 'button', title: 'Copier le code (à partager)', onclick: async () => { try { await navigator.clipboard.writeText(encodeMode(m)); this.ui.flash('Code du mode copié : envoie-le à un ami (Importer un code).'); } catch { this.ui.flash('Copie impossible.'); } } }, '⧉'),
          h('button', { class: 'btn small danger', type: 'button', title: 'Supprimer', onclick: () => { deleteMode(m.id); render(); } }, '✕')] : []));
      body.appendChild(h('h4', { class: 'opt-h' }, 'Modes fournis'));
      for (const m of BUILTIN_MODES) body.appendChild(card({ ...m, rules: sanitizeRules(m.rules) }, false));
      const mine = listModes();
      body.appendChild(h('h4', { class: 'opt-h' }, 'Mes modes'));
      if (!mine.length) body.appendChild(h('p', { class: 'meta' }, 'Aucun : crée ton premier mode.'));
      for (const m of mine) body.appendChild(card(m, true));
      body.appendChild(h('div', { class: 'row wrap' },
        h('button', { class: 'btn small', type: 'button', 'data-md': 'new', disabled: mine.length >= MODES_MAX, onclick: () => { this.ui.closeModal(); this._modeDialog(null); } }, '✦ Créer un mode'),
        h('button', { class: 'btn small', type: 'button', 'data-md': 'import', onclick: () => { this.ui.closeModal(); this._modeImportDialog(); } }, 'Importer un code'),
        h('button', { class: 'btn small', type: 'button', 'data-md': 'published', onclick: () => { this.ui.closeModal(); this.communityModesDialog(); } }, '🌐 Modes publiés'),
        h('button', { class: 'btn small', type: 'button', 'data-md': 'packs', onclick: () => { this.ui.closeModal(); this.packsDialog(); } }, '📦 Paquets (mods)')));
    };
    render();
    this.ui.modal({ title: 'Modes de jeu', body, wide: true, actions: [{ label: 'Fermer', primary: true }] });
  },

  _modeImportDialog() {
    const ta = h('textarea', { rows: 3, class: 'codebox', placeholder: 'Colle ici un code de mode (SHM1:…)' });
    this.ui.modal({ title: 'Importer un mode', body: h('div', {}, ta), actions: [{ label: 'Retour', onClick: () => { setTimeout(() => this.modesMenu(), 0); return true; } }, { label: 'Importer', primary: true, onClick: () => {
      try { const m = decodeMode(ta.value); saveMode({ ...m, id: newId() }); this.ui.flash(`Mode « ${m.name} » importé.`); setTimeout(() => this.modesMenu(), 0); return true; }
      catch (e) { this.ui.flash(e.message); return false; }
    } }] });
  },

  _modeDialog(existing) {
    const m = sanitizeMode(existing || { name: 'Mon mode', rules: {}, goal: null });
    const name = h('input', { type: 'text', maxlength: 24, value: m.name });
    const desc = h('input', { type: 'text', maxlength: 100, value: m.desc, placeholder: 'Description (facultative)' });
    const goalBox = h('div', {});
    const GOAL_OPTS = [['', 'Aucun objectif'], ...Object.keys(GOALS).map((id) => [id, goalLabel(sanitizeGoal({ id, n: 2, v: 'moto', t: 60 }))])];
    const drawGoal = () => {
      goalBox.replaceChildren();
      goalBox.appendChild(row('Objectif', sel(GOAL_OPTS, m.goal ? m.goal.id : '', (v) => { m.goal = v ? sanitizeGoal({ id: v, n: 2, v: 'moto', t: 60 }) : null; drawGoal(); })));
      const g = m.goal;
      if (!g) return;
      const num = (key, lo, hi, label) => { const i = h('input', { type: 'number', min: lo, max: hi, value: g[key] }); i.onchange = () => { m.goal = sanitizeGoal({ ...g, [key]: i.value }); drawGoal(); }; goalBox.appendChild(row(label, i)); };
      if (g.n !== undefined) num('n', 1, 9, 'Nombre');
      if (g.t !== undefined) num('t', 5, 900, 'Temps maximum (s)');
      if (g.v !== undefined) goalBox.appendChild(row('Véhicule', sel([['moto', 'Moto'], ['boat', 'Bateau'], ['glider', 'Deltaplane'], ['car', 'Voiture']], g.v, (v) => { m.goal = sanitizeGoal({ ...g, v }); drawGoal(); })));
      goalBox.appendChild(h('p', { class: 'meta' }, '🎯 ' + goalLabel(g)));
    };
    drawGoal();
    const body = h('div', { class: 'studio' }, row('Nom', name), row('Description', desc), this._rulesControls(m.rules, (r) => { m.rules = r; }), goalBox);
    this.ui.modal({ title: existing ? 'Modifier le mode' : 'Créer un mode', body, wide: true, actions: [{ label: 'Annuler', onClick: () => { setTimeout(() => this.modesMenu(), 0); return true; } }, { label: 'Enregistrer', primary: true, onClick: () => {
      const clean = sanitizeMode({ ...m, name: name.value, desc: desc.value });
      saveMode({ ...clean, id: existing ? existing.id : newId() });
      this.ui.flash(`Mode « ${clean.name} » enregistré.`);
      setTimeout(() => this.modesMenu(), 0);
      return true;
    } }] });
  },

  // ---------------------------------------------------------------- modes publiés (E21)
  // Les modes de la communauté : leurs règles sont une catégorie de record, donc leur classement sur chaque circuit est celui de cette catégorie.
  async communityModesDialog() {
    const body = h('div', { class: 'studio' }, h('p', { class: 'meta' }, 'Chargement…'));
    this.ui.modal({ title: '🌐 Modes publiés', body, wide: true, actions: [{ label: 'Retour', onClick: () => { setTimeout(() => this.modesMenu(), 0); return true; } }] });
    let rows;
    try { rows = await communityModes(); } catch (e) { body.replaceChildren(h('p', { class: 'lb-off' }, `Modes publiés indisponibles : ${e.message}`)); return; }
    if (!document.body.contains(body)) return;
    body.replaceChildren(h('p', { class: 'meta' }, 'Choisis un mode puis un circuit de la carrière : sa fiche s’ouvre sur la catégorie du mode, avec son classement. L’objectif du mode reste à titre indicatif.'));
    if (!rows.length) body.appendChild(h('p', { class: 'meta' }, 'Aucun mode publié pour l’instant : publie le tien avec 🌐 dans « Mes modes ».'));
    for (const r of rows) {
      let rules;
      try { rules = modeRulesOf(r.variant); } catch { continue; }
      const goal = sanitizeGoal(r.goal);
      const mine = r.owner === online.uid;
      body.appendChild(h('div', { class: 'srow mode-row', 'data-cmode': r.id },
        h('span', { class: 'mode-name' }, h('b', {}, r.name), h('small', {}, ...[`par ${r.owner_name || '—'}`, r.description, ...describeRules(rules), goal ? '🎯 ' + goalLabel(goal) : '', `▶ ${r.plays}`].filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x])))),
        h('button', { class: 'btn small primary', type: 'button', onclick: () => { this.ui.closeModal(); this._pickTrackForPublishedMode(r); } }, 'Jouer (classé)'),
        mine ? h('button', { class: 'btn small danger', type: 'button', title: 'Retirer de la communauté', onclick: async () => { try { await deleteCommunityMode(r.id); this.ui.flash('Mode retiré.'); this.ui.closeModal(); this.communityModesDialog(); } catch (e) { this.ui.flash(e.message, 3); } } }, '✕')
          : h('button', { class: 'btn small subtle', type: 'button', title: 'Signaler (masqué après 3 signalements)', onclick: async () => { try { await reportMode(r.id); this.ui.flash('Merci, le signalement est enregistré.'); } catch (e) { this.ui.flash(e.message, 3); } } }, '⚑')));
    }
  },

  _pickTrackForPublishedMode(r) {
    const opts = this.builtins.map((b) => [String(b.index), b.def.name]);
    let chosen = opts[0][0];
    const body = h('div', {}, h('p', {}, h('b', {}, r.name)), row('Circuit', sel(opts, chosen, (v) => { chosen = v; })));
    this.ui.modal({ title: 'Jouer le mode (classé)', body, actions: [{ label: 'Retour', onClick: () => { setTimeout(() => this.communityModesDialog(), 0); return true; } }, { label: 'Ouvrir la fiche', primary: true, onClick: () => {
      const i = +chosen, b = this.builtins[i];
      setTimeout(() => {
        this.openBuiltinHub(i, 'tracks');
        modePlayed(r.id);
        if (!r.variant) { this.ui.flash('Ce mode ne change aucune règle de course : classement officiel.', 3); return; }
        const v = parseVariant(r.variant);
        if (!variantFits(b.track, v)) { this.ui.flash('Ce mode ne change rien sur ce circuit : classement officiel.', 3); return; }
        this._hub.modeLabel = r.name;
        this._setHubCategory(v);
      }, 0);
      return true;
    } }] });
  },

  // ---------------------------------------------------------------- jouer un mode
  _pickTrackForMode(mode) {
    const mine = listMyTracks();
    const opts = [...this.builtins.map((b) => ['b:' + b.index, b.def.name]), ...mine.map((e) => ['m:' + e.id, '★ ' + e.name])];
    let chosen = opts[0][0];
    const body = h('div', {}, h('p', {}, h('b', {}, mode.name)), h('p', { class: 'meta' }, ...(describeRules(mode.rules).length ? describeRules(mode.rules).flatMap((x, i) => (i ? [' · ', x] : [x])) : ['Aucune règle changée'])), row('Circuit', sel(opts, chosen, (v) => { chosen = v; })));
    this.ui.modal({ title: 'Jouer le mode', body, actions: [{ label: 'Retour', onClick: () => { setTimeout(() => this.modesMenu(), 0); return true; } }, { label: 'Jouer', primary: true, onClick: () => {
      let track;
      if (chosen.startsWith('b:')) track = this.builtins[+chosen.slice(2)].track;
      else { const e = mine.find((x) => x.id === chosen.slice(2)); try { track = Track.decode(e.code); } catch { this.ui.flash('Circuit illisible.'); return false; } }
      this.playMode(mode, track);
      return true;
    } }] });
  },

  playMode(mode, track) {
    const t = applyRules(track, mode.rules);
    this.playTrack(t, { mode, trackKey: null, difficulty: 1, seed: 'mode-' + mode.name, modeTrack: track });
  },

  // Arrivée d'un mode : l'objectif est jugé ; ni record, ni pièces, ni classement.
  onModeFinished(session, time) {
    const mode = session.opts.mode;
    const st = { ...session.stats, vehicle: session.phys.vehicle, time };
    const met = mode.goal ? goalMet(mode.goal, st) : true;
    const again = () => { session.restart(); return true; };
    this.ui.modal({
      title: met ? '✓ Mode réussi' : 'Pas tout à fait…',
      body: h('div', {}, h('p', {}, h('b', {}, mode.name), ` · ${time.toFixed(2)} s`), mode.goal ? h('p', {}, `🎯 ${goalLabel(mode.goal)} : ${met ? 'réussi' : 'raté'}`) : h('p', { class: 'meta' }, 'Pas d\'objectif : le plaisir de rouler.')),
      actions: [{ label: 'Rejouer', primary: true, onClick: again }, { label: 'Modes', onClick: () => { setTimeout(() => { this.quitRace(); }, 0); return true; } }],
    });
  },

  // ---------------------------------------------------------------- paquets (mods)
  packsDialog() {
    const body = h('div', { class: 'studio' });
    const checks = new Map();
    body.appendChild(h('p', { class: 'meta' }, 'Un paquet regroupe tes personnalisations dans UN code à envoyer à un ami. Il ne contient que des données, toutes revérifiées à l\'import ; les éléments payants du catalogue ne sont pas offerts.'));
    body.appendChild(h('h4', { class: 'opt-h' }, 'Exporter'));
    const have = { car: true, ui: true, cameras: (this.settings.cameras || []).length > 0, parts: listCustomDecos().length > 0, modes: listModes().length > 0 };
    for (const [k, label] of PACK_KINDS) { const c = h('input', { type: 'checkbox' }); c.checked = have[k]; c.disabled = !have[k]; checks.set(k, c); body.appendChild(row(label, c)); }
    const out = h('textarea', { rows: 3, class: 'codebox', readonly: true, placeholder: 'Le code du paquet apparaît ici' });
    const nm = h('input', { type: 'text', maxlength: 30, value: 'Mon paquet' });
    body.appendChild(row('Nom du paquet', nm));
    body.appendChild(h('div', { class: 'row' }, h('button', { class: 'btn small primary', type: 'button', 'data-pk': 'export', onclick: async () => {
      const pack = { name: nm.value };
      if (checks.get('car').checked) pack.car = profile().loadout;
      if (checks.get('ui').checked) pack.ui = this.settings.ui;
      if (checks.get('cameras').checked) pack.cameras = this.settings.cameras;
      if (checks.get('parts').checked) pack.parts = listCustomDecos().map((p) => ({ name: p.name, parts: p.parts }));
      if (checks.get('modes').checked) pack.modes = listModes();
      try { out.value = encodePack(pack); try { await navigator.clipboard.writeText(out.value); this.ui.flash('Code du paquet copié !'); } catch { out.select(); } } catch (e) { this.ui.flash(e.message); }
    } }, 'Créer et copier le code')));
    body.appendChild(out);
    body.appendChild(h('h4', { class: 'opt-h' }, 'Importer'));
    const inp = h('textarea', { rows: 3, class: 'codebox', placeholder: 'Colle ici un code de paquet (SHX1:…)' });
    const preview = h('div', {});
    let pack = null;
    inp.oninput = () => {
      preview.replaceChildren(); pack = null;
      if (!inp.value.trim()) return;
      try {
        pack = decodePack(inp.value);
        preview.appendChild(h('p', {}, h('b', {}, pack.name)));
        for (const [k, text] of describePack(pack)) { const c = h('input', { type: 'checkbox', 'data-imp': k }); c.checked = true; preview.appendChild(row(text, c)); }
        preview.appendChild(h('div', { class: 'row' }, h('button', { class: 'btn small primary', type: 'button', 'data-pk': 'apply', onclick: () => { this._applyPack(pack, new Set([...preview.querySelectorAll('[data-imp]')].filter((c) => c.checked).map((c) => c.dataset.imp))); } }, 'Appliquer la sélection')));
      } catch (e) { preview.appendChild(h('p', { class: 'meta' }, e.message)); }
    };
    body.append(inp, preview);
    this.ui.modal({ title: 'Paquets (mods)', body, wide: true, actions: [{ label: 'Retour', onClick: () => { setTimeout(() => this.modesMenu(), 0); return true; } }] });
  },

  _applyPack(pack, kinds) {
    const done = [];
    if (kinds.has('car') && pack.car) { setLoadout(ownedCar(pack.car, (c, id) => owns(c, id), DEFAULT_LOADOUT)); done.push('voiture'); }
    if (kinds.has('ui') && pack.ui) { this.settings.ui = sanitizeUi(pack.ui); this.applyUiPrefs(); done.push('interface'); }
    if (kinds.has('cameras') && pack.cameras) { this.settings.cameras = [...(this.settings.cameras || []), ...pack.cameras].slice(0, MAX_CUSTOM_CAMS); done.push('caméras'); }
    if (kinds.has('parts') && pack.parts) { for (const p of pack.parts) saveCustomDeco({ id: newId(), name: p.name, parts: p.parts }); done.push('pièces'); }
    if (kinds.has('modes') && pack.modes) { for (const m of pack.modes) saveMode({ ...m, id: newId() }); done.push('modes'); }
    this.saveSettings(); saveProfile();
    this.ui.flash(done.length ? `Paquet « ${pack.name} » appliqué : ${done.join(' · ')}.` : 'Rien de sélectionné.', 3.5);
    this.ui.updateCoins();
  },
};
