// Déclencheurs de circuit dans l'éditeur (lot 12) : on pose des effets visuels et sonores sur des cases ; la voiture les joue en passant dessus.
// Règles et validation : js/scripts.js. Ces méthodes s'ajoutent au prototype de EditorSession (voir editor.js).
import { h } from '../dom.js';
import { SCRIPT_ACTIONS, MAX_SCRIPTS, sanitizeScript, sanitizeScripts } from '../scripts.js';

export const scriptsUiMethods = {
  _scriptsDialog() {
    const T = this.track;
    const list = sanitizeScripts(T.scripts);
    const box = h('div', { class: 'studio' });
    const render = () => {
      box.replaceChildren();
      box.appendChild(h('p', { class: 'meta' }, `Jusqu'à ${MAX_SCRIPTS} déclencheurs. Quand la voiture passe sur la case, l'effet se joue une fois par essai. Visuel et sonore seulement : aucun effet sur la conduite, les temps ni la vérification.`));
      list.forEach((s, i) => {
        const def = SCRIPT_ACTIONS.find((a) => a[0] === s.a);
        const x = h('input', { type: 'number', value: s.x, min: -500, max: 500, class: 'cellin' }), z = h('input', { type: 'number', value: s.z, min: -500, max: 500, class: 'cellin' });
        x.onchange = () => { list[i] = sanitizeScript({ ...list[i], x: x.value }); render(); };
        z.onchange = () => { list[i] = sanitizeScript({ ...list[i], z: z.value }); render(); };
        const act = h('select', {}, ...SCRIPT_ACTIONS.map(([id, label]) => { const o = h('option', { value: id }, label); if (id === s.a) o.selected = true; return o; }));
        act.onchange = () => { list[i] = sanitizeScript({ ...list[i], a: act.value, v: act.value === 'msg' ? 'Bravo !' : '' }); render(); };
        let val;
        if (def[2] === null) { val = h('input', { type: 'text', maxlength: 40, value: s.v, placeholder: 'Message (40 car. max)' }); val.onchange = () => { list[i] = sanitizeScript({ ...list[i], v: val.value }) || list[i]; render(); }; }
        else if (def[2] === 'color') { val = h('input', { type: 'color', value: s.v, class: 'cpick' }); val.oninput = () => { list[i].v = val.value; }; }
        else { val = h('select', {}, ...def[2].map(([k, l]) => { const o = h('option', { value: k }, l); if (k === s.v) o.selected = true; return o; })); val.onchange = () => { list[i].v = val.value; }; }
        box.appendChild(h('div', { class: 'srow sc-row' }, h('span', { class: 'sc-cell' }, 'Case ', x, z),
          h('button', { class: 'btn small', type: 'button', title: 'Prendre la case sous le curseur de l\'éditeur', onclick: () => { const c = this.lastHoverCell; if (c) { list[i] = sanitizeScript({ ...list[i], x: c.cx, z: c.cz }); render(); } else this.app.ui.flash('Survole d\'abord la grille avec le curseur.'); } }, '⌖ Case visée'),
          act, val, h('button', { class: 'btn small danger', type: 'button', onclick: () => { list.splice(i, 1); render(); } }, '✕')));
      });
      box.appendChild(h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', disabled: list.length >= MAX_SCRIPTS, 'data-sc': 'add', onclick: () => { const c = this.lastHoverCell || { cx: 0, cz: 0 }; list.push(sanitizeScript({ x: c.cx, z: c.cz, a: 'msg', v: 'Bravo !' })); render(); } }, '+ Ajouter un déclencheur')));
    };
    render();
    this.app.ui.modal({ title: 'Déclencheurs du circuit', body: box, wide: true, actions: [{ label: 'Annuler' }, { label: 'Appliquer', primary: true, onClick: () => {
      T.setParams({ scripts: list });
      this._changed(false);
      this._commit();
      return true;
    } }] });
  },
};
