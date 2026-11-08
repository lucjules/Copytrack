// Groupes et calques de l'éditeur (Copytrack Evolution, E9) : des pièces et décorations rangées dans des groupes numérotés (1 à 63) et nommés.
// Un groupe sert de CALQUE dans l'éditeur (masqué : ni dessiné ni visable ; verrouillé : visible mais ni sélectionnable ni modifiable) et, avec la
// logique du circuit (E10), de cible aux règles (« montrer le groupe Porte nord au 2e checkpoint »). Masquer et verrouiller sont des états de
// l'éditeur, pas du circuit : ils ne partent pas dans le code. Ces méthodes s'ajoutent au prototype d'EditorSession : `this` est l'instance.
import { esc } from '../dom.js';
import { MAX_GROUP } from '../track.js';

export const groupMethods = {
  _layerOk(o) {
    const g = o && o.g;
    if (!g) return true;
    return !(this.hiddenGroups && this.hiddenGroups.has(g)) && !(this.lockedGroups && this.lockedGroups.has(g));
  },

  _groupCounts() {
    const c = new Map(), bump = (g, k) => { const v = c.get(g) || [0, 0]; v[k]++; c.set(g, v); };
    for (const t of this.track.tiles) if (t.g) bump(t.g, 0);
    for (const d of this.track.decos) if (d.g) bump(d.g, 1);
    return c;
  },

  setGroupHidden(g, hidden) {
    if (!this.hiddenGroups) this.hiddenGroups = new Set();
    if (hidden) this.hiddenGroups.add(g); else this.hiddenGroups.delete(g);
    this.view.setGroupVisible(g, !hidden);
  },
  setGroupLocked(g, locked) {
    if (!this.lockedGroups) this.lockedGroups = new Set();
    if (locked) this.lockedGroups.add(g); else this.lockedGroups.delete(g);
  },

  // Met les pièces et décorations sélectionnées dans le groupe g (0 : hors de tout groupe). Les pièces sont réinsérées (leur champ fait partie
  // du modèle, comme une option) ; l'opération s'annule comme les autres.
  assignSelection(g) {
    const tiles = this._selTiles(), decos = this._selDecos();
    if (!tiles.length && !decos.length) { this.app.ui.flash('Sélectionne d’abord des pièces (outil Sélection, Q).'); return 0; }
    for (const t of tiles) { this.track.remove(t); this.track.add({ ...t, g }); }
    for (const d of decos) { if (g) d.g = g; else delete d.g; }
    this.track.version++;
    this._changed();
    this._commit();
    return tiles.length + decos.length;
  },

  // Sélectionne tout un groupe (rectangle qui l'englobe ; la sélection ne retient ensuite que ses membres visibles et déverrouillés).
  selectGroup(g) {
    const cells = [];
    for (const t of this.track.tiles) if (t.g === g) for (let i = 0; i < 2; i++) cells.push([t.x, t.z]);
    for (const d of this.track.decos) if (d.g === g) cells.push([Math.floor(d.x / 32), Math.floor(d.z / 32)]);
    if (!cells.length) return;
    this.setTool('select');
    this.sel = { x0: Math.min(...cells.map((c) => c[0])), z0: Math.min(...cells.map((c) => c[1])), x1: Math.max(...cells.map((c) => c[0])) + 2, z1: Math.max(...cells.map((c) => c[1])) + 2 };
    this._selInfo();
  },

  openGroups() {
    const body = document.createElement('div');
    body.className = 'ed-groups';
    const render = () => {
      const counts = this._groupCounts();
      const ids = [...new Set([...counts.keys(), ...this.track.groupNames().map(([g]) => g)])].sort((a, b) => a - b);
      const free = Array.from({ length: MAX_GROUP }, (_, i) => i + 1).find((g) => !ids.includes(g));
      const hasSel = this._selTiles().length + this._selDecos().length > 0;
      body.innerHTML = `<p class="meta">Un groupe rassemble des pièces et des décorations : un calque à masquer ou verrouiller pendant l'édition, et la cible des règles de logique du circuit. ${hasSel ? '' : 'Sélectionne des pièces (outil Sélection, Q) pour les ranger dans un groupe.'}</p>
        ${ids.length ? `<table class="ed-gtable"><thead><tr><th>N°</th><th>Nom</th><th>Contenu</th><th>Calque</th><th></th></tr></thead><tbody>${ids.map((g) => {
          const [nt, nd] = counts.get(g) || [0, 0];
          const hid = this.hiddenGroups && this.hiddenGroups.has(g), lock = this.lockedGroups && this.lockedGroups.has(g);
          return `<tr data-g="${g}"><td>${g}</td><td><input type="text" maxlength="24" value="${esc(this.track.groups[g] || '')}" placeholder="Groupe ${g}" aria-label="Nom du groupe ${g}"></td>
            <td>${nt} pièce${nt > 1 ? 's' : ''}${nd ? `, ${nd} déco.` : ''}</td>
            <td><button class="btn small" data-a="hide" aria-pressed="${!!hid}" title="${hid ? 'Afficher' : 'Masquer'} (édition seulement)">${hid ? '🙈' : '👁'}</button><button class="btn small" data-a="lock" aria-pressed="${!!lock}" title="${lock ? 'Déverrouiller' : 'Verrouiller'} (édition seulement)">${lock ? '🔒' : '🔓'}</button></td>
            <td><button class="btn small" data-a="sel" title="Sélectionner ce groupe">Sélectionner</button><button class="btn small" data-a="add"${hasSel ? '' : ' disabled'} title="Ranger la sélection dans ce groupe">+ Sélection</button></td></tr>`;
        }).join('')}</tbody></table>` : '<p>Aucun groupe pour l’instant.</p>'}
        <div class="row"><button class="btn" data-a="new"${hasSel && free ? '' : ' disabled'}>+ Nouveau groupe avec la sélection</button><button class="btn" data-a="out"${hasSel ? '' : ' disabled'}>Sortir la sélection de son groupe</button></div>`;
      for (const tr of body.querySelectorAll('tr[data-g]')) {
        const g = +tr.dataset.g;
        tr.querySelector('input').onchange = (e) => { this.track.setGroupName(g, e.target.value); this._changed(false); this._commit(); };
        tr.querySelector('[data-a="hide"]').onclick = () => { this.setGroupHidden(g, !(this.hiddenGroups && this.hiddenGroups.has(g))); render(); };
        tr.querySelector('[data-a="lock"]').onclick = () => { this.setGroupLocked(g, !(this.lockedGroups && this.lockedGroups.has(g))); render(); };
        tr.querySelector('[data-a="sel"]').onclick = () => { this.selectGroup(g); render(); };
        tr.querySelector('[data-a="add"]').onclick = () => { const n = this.assignSelection(g); if (n) this.app.ui.flash(`${n} élément${n > 1 ? 's' : ''} dans le groupe ${g}.`); render(); };
      }
      const nb = body.querySelector('[data-a="new"]');
      nb.onclick = () => { const n = this.assignSelection(free); if (n) this.app.ui.flash(`Groupe ${free} créé (${n} élément${n > 1 ? 's' : ''}).`); render(); };
      body.querySelector('[data-a="out"]').onclick = () => { this.assignSelection(0); render(); };
    };
    render();
    this.app.ui.modal({ title: 'Groupes et calques', body, actions: [{ label: 'Fermer', primary: true }] });
  },
};
