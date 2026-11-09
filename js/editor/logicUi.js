// Éditeur de la logique du circuit (Copytrack Evolution, E11) : créer des règles ÉVÉNEMENT → CONDITIONS → ACTIONS sans écrire de code, les lire en
// phrases, voir ce qui empêcherait de finir, et les essayer (T : en essai depuis l'éditeur, chaque règle déclenchée est annoncée). Les règles agissent
// sur les groupes (▦, editor/groups.js). Ces méthodes s'ajoutent au prototype d'EditorSession : `this` est l'instance. Moteur : sim/logic.js.
import { esc } from '../dom.js';
import { sanitizeLogic, LOGIC_MAX, LOGIC_OPS } from '../sim/logic.js';
import { SCRIPT_ACTIONS } from '../scripts.js';
import { describeRule, checkLogic, scriptsToLogic, VEH_LABEL } from '../logicText.js';

const EVENTS = [['start', 'Au départ'], ['cp', 'Au passage d’un checkpoint'], ['lap', 'Au début d’un tour'], ['time', 'Au bout d’un temps de course'], ['zone', 'Quand la voiture entre sur un groupe'], ['veh', 'Quand la voiture change de véhicule']];
const CONDS = [['cps', 'Checkpoints passés'], ['lap', 'Tour'], ['var', 'Compteur'], ['veh', 'Véhicule'], ['shown', 'Groupe visible'], ['hidden', 'Groupe caché']];
const ACTS = [['show', 'Montrer un groupe'], ['hide', 'Cacher un groupe'], ['toggle', 'Basculer un groupe'], ['grav', 'Régler la gravité'], ['var', 'Changer un compteur'], ['fx', 'Effet visuel ou sonore']];
const defEvent = (k, g) => ({ start: ['start'], cp: ['cp', 1], lap: ['lap', 2], time: ['time', 600], zone: ['zone', g], veh: ['veh', 'moto'] }[k]);
const defCond = (k, g) => ({ cps: ['cps', '>=', 1], lap: ['lap', '>=', 2], var: ['var', 0, '>=', 1], veh: ['veh', 'moto'], shown: ['shown', g], hidden: ['hidden', g] }[k]);
const defAct = (k, g) => ({ show: ['show', g], hide: ['hide', g], toggle: ['toggle', g], grav: ['grav', 60], var: ['var', 0, '+', 1], fx: ['fx', 'msg', 'Bravo !'] }[k]);
const opt = (list, cur) => list.map(([k, l]) => `<option value="${esc(String(k))}"${String(k) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`).join('');

export const logicUiMethods = {
  // Groupes proposés dans les listes : ceux qui contiennent quelque chose ou qui ont un nom.
  _logicGroups() {
    const ids = [...new Set([...this.track.usedGroups(), ...this.track.groupNames().map(([g]) => g)])].sort((a, b) => a - b);
    return ids.map((g) => [g, this.track.groups[g] || `Groupe ${g}`]);
  },

  openLogic() {
    const T = this.track;
    const draft = JSON.parse(JSON.stringify(sanitizeLogic(T.lg) || { v: 1, off: [], vars: 0, rules: [] }));
    const body = document.createElement('div');
    body.className = 'ed-logic';
    let editing = -1, rule = null;
    const groups = this._logicGroups(), g0 = groups.length ? groups[0][0] : 1;
    const gsel = (cur, cls) => `<select class="${cls}">${opt(groups.length ? groups : [[cur, 'Groupe ' + cur]], cur)}</select>`;

    const list = () => {
      const issues = checkLogic(T, draft);
      const conv = T.scripts && T.scripts.length ? scriptsToLogic(T) : null;
      body.innerHTML = `<p class="meta">Des règles « quand… si… alors… » jouées pendant la course, identiques pour tous et vérifiées par le serveur. Elles montrent ou cachent des groupes (une pièce cachée n’a plus de collision), changent la gravité, tiennent des compteurs, jouent des effets. Essaie avec T : chaque règle déclenchée s’affiche.</p>
        ${groups.length ? '' : '<p class="lb-off">Crée d’abord des groupes (bouton ▦, F4) : les règles agissent sur eux.</p>'}
        <div class="ed-lrow"><span>Groupes cachés au départ</span><span class="ed-loff">${groups.map(([g, n]) => `<label><input type="checkbox" data-off="${g}"${draft.off.includes(g) ? ' checked' : ''}> ${esc(n)}</label>`).join('') || '<span class="meta">aucun groupe</span>'}</span></div>
        <label class="ed-lrow"><span>Compteurs</span><select id="lg-vars">${opt([[0, 'aucun'], [1, '1'], [2, '2'], [3, '3'], [4, '4']], draft.vars)}</select></label>
        ${issues.length ? `<ul class="ed-lissues">${issues.map((i) => `<li class="${i.level}">${i.level === 'error' ? '⛔' : '⚠'} ${esc(i.msg)}</li>`).join('')}</ul>` : ''}
        <ol class="ed-lrules">${draft.rules.map((r, i) => `<li><span>${esc(describeRule(r, T))}</span><span class="ed-lbtns">
          <button class="btn small" data-mv="${i},-1" ${i ? '' : 'disabled'} aria-label="Monter la règle ${i + 1}">▲</button><button class="btn small" data-mv="${i},1" ${i < draft.rules.length - 1 ? '' : 'disabled'} aria-label="Descendre la règle ${i + 1}">▼</button>
          <button class="btn small" data-ed-rule="${i}">Modifier</button><button class="btn small danger" data-del="${i}" aria-label="Supprimer la règle ${i + 1}">✕</button></span></li>`).join('')}</ol>
        ${draft.rules.length ? '' : '<p class="meta">Aucune règle. Sans règle, le circuit n’a pas de logique.</p>'}
        <div class="row"><button class="btn primary" id="lg-new"${draft.rules.length >= LOGIC_MAX.rules ? ' disabled' : ''}>+ Nouvelle règle</button>
        ${conv ? `<button class="btn" id="lg-conv" title="Chaque case à déclencheur devient un groupe ; ses effets deviennent une règle « quand la voiture entre sur ce groupe ». La logique change la signature du circuit : à revérifier.">Convertir les ${T.scripts.length} déclencheur${T.scripts.length > 1 ? 's' : ''} de cases</button>` : ''}</div>`;
      for (const c of body.querySelectorAll('[data-off]')) c.onchange = () => { const g = +c.dataset.off; draft.off = c.checked ? [...draft.off, g] : draft.off.filter((x) => x !== g); list(); };
      body.querySelector('#lg-vars').onchange = (e) => { draft.vars = +e.target.value; list(); };
      for (const b of body.querySelectorAll('[data-mv]')) b.onclick = () => { const [i, d] = b.dataset.mv.split(',').map(Number); const r = draft.rules.splice(i, 1)[0]; draft.rules.splice(i + d, 0, r); list(); };
      for (const b of body.querySelectorAll('[data-del]')) b.onclick = () => { draft.rules.splice(+b.dataset.del, 1); list(); };
      for (const b of body.querySelectorAll('[data-ed-rule]')) b.onclick = () => { editing = +b.dataset.edRule; rule = JSON.parse(JSON.stringify(draft.rules[editing])); edit(); };
      body.querySelector('#lg-new').onclick = () => { editing = -1; rule = { on: ['cp', 1], if: [], do: [defAct('show', g0)], once: true }; edit(); };
      const cv = body.querySelector('#lg-conv');
      if (cv) cv.onclick = () => {
        const r = scriptsToLogic(T);
        if (!r) return;
        for (const [t, g] of r.assign) { T.remove(t); T.add({ ...t, g }); }
        for (const [g, n] of r.names) T.setGroupName(g, n);
        T.setParams({ scripts: [] });
        Object.assign(draft, JSON.parse(JSON.stringify(r.lg)));
        this._changed(); this._commit();
        this.app.ui.flash(r.names.length > 1 ? `${r.names.length} cases converties en groupes et en règles.` : 'Une case convertie en groupe et en règle.', 2.4);
        this.openLogic();
      };
    };

    // Formulaire d'une règle : l'évènement, les conditions, les actions ; chaque ligne lit ses champs à chaque changement.
    const edit = () => {
      const on = rule.on;
      const evParam = on[0] === 'cp' ? `<input type="number" class="lg-ev-n" min="0" max="999" value="${on[1]}" title="0 : n’importe quel checkpoint"> <span class="meta">n° (0 : chacun)</span>`
        : on[0] === 'lap' ? `<input type="number" class="lg-ev-n" min="1" max="99" value="${on[1]}">`
        : on[0] === 'time' ? `<input type="number" class="lg-ev-t" min="0.1" max="900" step="0.1" value="${(on[1] / 120).toFixed(1)}"> <span class="meta">s</span>`
        : on[0] === 'zone' ? gsel(on[1], 'lg-ev-g') : on[0] === 'veh' ? `<select class="lg-ev-v">${opt(Object.entries(VEH_LABEL), on[1])}</select>` : '';
      const condRow = (c, i) => {
        const p = c[0] === 'cps' || c[0] === 'lap' ? `<select class="lg-op">${opt(LOGIC_OPS.map((o) => [o, o]), c[1])}</select><input type="number" class="lg-n" value="${c[2]}">`
          : c[0] === 'var' ? `<select class="lg-i">${opt([0, 1, 2, 3].map((k) => [k, 'n° ' + (k + 1)]), c[1])}</select><select class="lg-op">${opt(LOGIC_OPS.map((o) => [o, o]), c[2])}</select><input type="number" class="lg-n" value="${c[3]}">`
          : c[0] === 'veh' ? `<select class="lg-v">${opt(Object.entries(VEH_LABEL), c[1])}</select>` : gsel(c[1], 'lg-g');
        return `<li data-c="${i}"><select class="lg-kind">${opt(CONDS, c[0])}</select>${p}<button class="btn small danger" data-rmc="${i}" aria-label="Retirer la condition">✕</button></li>`;
      };
      const actRow = (a, i) => {
        let p = '';
        if (['show', 'hide', 'toggle'].includes(a[0])) p = gsel(a[1], 'lg-g');
        else if (a[0] === 'grav') p = `<input type="number" class="lg-n" min="15" max="250" step="5" value="${a[1]}"> <span class="meta">%</span>`;
        else if (a[0] === 'var') p = `<select class="lg-i">${opt([0, 1, 2, 3].map((k) => [k, 'n° ' + (k + 1)]), a[1])}</select><select class="lg-op">${opt([['=', '='], ['+', '+'], ['-', '−']], a[2])}</select><input type="number" class="lg-n" value="${a[3]}">`;
        else if (a[0] === 'fx') {
          const A = SCRIPT_ACTIONS.find((x) => x[0] === a[1]) || SCRIPT_ACTIONS[0];
          const v = A[2] === null ? `<input type="text" class="lg-fxv" maxlength="40" value="${esc(a[2])}">` : A[2] === 'color' ? `<input type="color" class="lg-fxv" value="${esc(a[2] || '#ffd23e')}">` : `<select class="lg-fxv">${opt(A[2], a[2])}</select>`;
          p = `<select class="lg-fxa">${opt(SCRIPT_ACTIONS.map(([k, l]) => [k, l]), a[1])}</select>${v}`;
        }
        return `<li data-a="${i}"><select class="lg-kind">${opt(ACTS, a[0])}</select>${p}<button class="btn small danger" data-rma="${i}" aria-label="Retirer l’action"${rule.do.length > 1 ? '' : ' disabled'}>✕</button></li>`;
      };
      body.innerHTML = `<h4>${editing < 0 ? 'Nouvelle règle' : `Règle ${editing + 1}`}</h4>
        <div class="ed-lrow"><span>Quand</span><span><select id="lg-ev">${opt(EVENTS, on[0])}</select> ${evParam}</span></div>
        <div class="ed-lrow"><span>Si (toutes vraies)</span><ul class="ed-lconds">${rule.if.map(condRow).join('')}</ul></div>
        <button class="btn small" id="lg-addc"${rule.if.length >= LOGIC_MAX.conds ? ' disabled' : ''}>+ Condition</button>
        <div class="ed-lrow"><span>Alors</span><ul class="ed-lacts">${rule.do.map(actRow).join('')}</ul></div>
        <button class="btn small" id="lg-adda"${rule.do.length >= LOGIC_MAX.acts ? ' disabled' : ''}>+ Action</button>
        <label class="ed-lrow"><span>Une seule fois par essai</span><input type="checkbox" id="lg-once"${rule.once ? ' checked' : ''}></label>
        <p class="ed-lsentence">${esc(describeRule(sanitizeLogic({ rules: [rule] }) ? sanitizeLogic({ rules: [rule] }).rules[0] : rule, T))}</p>
        <div class="row"><button class="btn primary" id="lg-ok">Valider la règle</button><button class="btn" id="lg-back">Retour</button></div>`;
      const num = (el, d = 0) => (el ? Number(el.value) : d);
      body.querySelector('#lg-ev').onchange = (e) => { rule.on = defEvent(e.target.value, g0); edit(); };
      const evN = body.querySelector('.lg-ev-n'), evT = body.querySelector('.lg-ev-t'), evG = body.querySelector('.lg-ev-g'), evV = body.querySelector('.lg-ev-v');
      if (evN) evN.onchange = () => { rule.on = [on[0], num(evN)]; edit(); };
      if (evT) evT.onchange = () => { rule.on = ['time', Math.max(1, Math.round(num(evT) * 120))]; edit(); };
      if (evG) evG.onchange = () => { rule.on = ['zone', num(evG)]; edit(); };
      if (evV) evV.onchange = () => { rule.on = ['veh', evV.value]; edit(); };
      for (const li of body.querySelectorAll('[data-c]')) {
        const i = +li.dataset.c, q = (c) => li.querySelector(c);
        li.querySelector('.lg-kind').onchange = (e) => { rule.if[i] = defCond(e.target.value, g0); edit(); };
        const read = () => {
          const k = rule.if[i][0];
          rule.if[i] = k === 'cps' || k === 'lap' ? [k, q('.lg-op').value, num(q('.lg-n'))] : k === 'var' ? ['var', num(q('.lg-i')), q('.lg-op').value, num(q('.lg-n'))] : k === 'veh' ? ['veh', q('.lg-v').value] : [k, num(q('.lg-g'))];
          edit();
        };
        for (const el of li.querySelectorAll('select:not(.lg-kind), input')) el.onchange = read;
      }
      for (const li of body.querySelectorAll('[data-a]')) {
        const i = +li.dataset.a, q = (c) => li.querySelector(c);
        li.querySelector('.lg-kind').onchange = (e) => { rule.do[i] = defAct(e.target.value, g0); edit(); };
        const read = () => {
          const k = rule.do[i][0];
          if (['show', 'hide', 'toggle'].includes(k)) rule.do[i] = [k, num(q('.lg-g'))];
          else if (k === 'grav') rule.do[i] = ['grav', num(q('.lg-n'), 100)];
          else if (k === 'var') rule.do[i] = ['var', num(q('.lg-i')), q('.lg-op').value, num(q('.lg-n'))];
          else if (k === 'fx') {
            const a = q('.lg-fxa').value, A = SCRIPT_ACTIONS.find((x) => x[0] === a);
            const prevA = rule.do[i][1];
            rule.do[i] = ['fx', a, a !== prevA ? (A[2] === null ? 'Bravo !' : A[2] === 'color' ? '#ffd23e' : A[2][0][0]) : q('.lg-fxv').value];
          }
          edit();
        };
        for (const el of li.querySelectorAll('select:not(.lg-kind), input')) el.onchange = read;
      }
      for (const b of body.querySelectorAll('[data-rmc]')) b.onclick = () => { rule.if.splice(+b.dataset.rmc, 1); edit(); };
      for (const b of body.querySelectorAll('[data-rma]')) b.onclick = () => { rule.do.splice(+b.dataset.rma, 1); edit(); };
      body.querySelector('#lg-addc').onclick = () => { rule.if.push(defCond('cps', g0)); edit(); };
      body.querySelector('#lg-adda').onclick = () => { rule.do.push(defAct('fx', g0)); edit(); };
      body.querySelector('#lg-once').onchange = (e) => { rule.once = e.target.checked; };
      body.querySelector('#lg-back').onclick = () => list();
      body.querySelector('#lg-ok').onclick = () => {
        const clean = sanitizeLogic({ rules: [rule] });
        if (!clean) { this.app.ui.flash('Cette règle ne fait rien : ajoute une action valable.'); return; }
        if (editing < 0) draft.rules.push(clean.rules[0]); else draft.rules[editing] = clean.rules[0];
        list();
      };
    };

    list();
    this.app.ui.modal({
      title: 'Logique du circuit', body, wide: true,
      actions: [{ label: 'Annuler' }, { label: 'Enregistrer', primary: true, onClick: () => {
        const before = JSON.stringify(T.lg);
        T.setLogic(draft);
        if (JSON.stringify(T.lg) !== before) {
          this._changed(); this._commit();
          this.app.ui.flash(T.lg ? `Logique enregistrée : ${T.lg.rules.length} règle${T.lg.rules.length > 1 ? 's' : ''}. Elle change la course : à revérifier.` : 'Logique retirée.', 3);
        }
        return true;
      } }],
    });
  },
};
