// Onglet « Prefabs » de la palette : coller un morceau tout fait (chicane, saut, looping…), enregistrer SA sélection sous un nom, la partager par code, importer le code d'un ami.
// Les règles (format, validation) sont dans js/prefabs.js ; ici seulement l'interface. Ces méthodes s'ajoutent au prototype de EditorSession (voir editor.js).
import { esc } from '../dom.js';
import { listPrefabs, savePrefab, deletePrefab, newId } from '../storage.js';
import { STARTERS, starterClip, clipToCode, codeToClip, clipSummary } from '../prefabs.js';

const starterCache = new Map();
const starter = (def) => { if (!starterCache.has(def.id)) starterCache.set(def.id, starterClip(def)); return starterCache.get(def.id); };

export const prefabMethods = {
  // Dessine (ou redessine) le contenu de l'onglet : fournis, puis les miens, puis les actions.
  _buildPrefabPanel() {
    const panel = document.querySelector('#ed-palette [data-panel="prefabs"]');
    if (!panel) return;
    const mine = listPrefabs();
    panel.innerHTML = `<div class="pf-head">Morceaux fournis <small>clique, puis pose-les sur la grille (R pour pivoter)</small></div>
      <div class="pf-row">${STARTERS.map((d) => `<button class="pf-btn" type="button" data-pf-starter="${d.id}" title="${esc(d.hint)}"><b>${esc(d.name)}</b><small>${esc(clipSummary(starter(d)))}</small></button>`).join('')}</div>
      <div class="pf-head">Mes prefabs</div>
      <div class="pf-row">${mine.length ? mine.map((p) => `<span class="pf-mine"><button class="pf-btn" type="button" data-pf-mine="${esc(p.id)}"><b>${esc(p.name)}</b></button><button class="pf-x" type="button" data-pf-copy="${esc(p.id)}" title="Copier le code (à partager)" aria-label="Copier le code de ${esc(p.name)}">⧉</button><button class="pf-x" type="button" data-pf-del="${esc(p.id)}" title="Supprimer" aria-label="Supprimer ${esc(p.name)}">✕</button></span>`).join('') : '<span class="meta">Aucun : sélectionne une zone (outil Sélection) puis « Enregistrer la sélection ».</span>'}</div>
      <div class="pf-actions"><button class="btn small" type="button" data-pf="save">💾 Enregistrer la sélection</button><button class="btn small" type="button" data-pf="import">Importer un code</button></div>`;
    for (const b of panel.querySelectorAll('[data-pf-starter]')) b.onclick = () => this._usePrefab(starter(STARTERS.find((d) => d.id === b.dataset.pfStarter)));
    for (const b of panel.querySelectorAll('[data-pf-mine]')) b.onclick = () => { const p = mine.find((x) => x.id === b.dataset.pfMine); try { this._usePrefab(codeToClip(p.code).clip); } catch (e) { this.app.ui.flash(e.message); } };
    for (const b of panel.querySelectorAll('[data-pf-copy]')) b.onclick = () => { const p = mine.find((x) => x.id === b.dataset.pfCopy); this._copyText(p.code, 'Code du prefab copié : envoie-le à un ami (Importer un code).'); };
    for (const b of panel.querySelectorAll('[data-pf-del]')) b.onclick = () => { deletePrefab(b.dataset.pfDel); this.app.audio.erase(); this._buildPrefabPanel(); };
    panel.querySelector('[data-pf="save"]').onclick = () => this._savePrefabDialog();
    panel.querySelector('[data-pf="import"]').onclick = () => this._importPrefabDialog();
    this._buildCdecoSection(panel);
  },

  _usePrefab(clip) {
    if (!clip) return;
    this.clip = clip;
    this.startPaste();
  },

  _copyText(txt, msg) {
    const done = () => this.app.ui.flash(msg, 3);
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, () => this.app.ui.flash('Copie impossible.'));
    else this.app.ui.flash('Copie impossible.');
  },

  // Enregistre la zone sélectionnée sous un nom.
  _savePrefabDialog() {
    if (!this.sel) { this.app.ui.flash('Sélectionne d\'abord une zone (outil Sélection, Q).'); return; }
    const clip = this.copySel(true) ? this.clip : null;
    if (!clip) return;
    const f = document.createElement('div');
    f.className = 'form';
    f.innerHTML = `<label>Nom<input id="pf-name" maxlength="40" spellcheck="false" autocomplete="off" placeholder="Mon looping"></label><p class="meta">${esc(clipSummary(clip))} · enregistré dans ce navigateur (et partageable par code).</p>`;
    this.app.ui.modal({
      title: 'Enregistrer la sélection', body: f,
      actions: [{ label: 'Annuler' }, { label: 'Enregistrer', primary: true, onClick: () => {
        const name = f.querySelector('#pf-name').value.trim().slice(0, 40);
        if (!name) { this.app.ui.flash('Donne un nom au prefab.'); return false; }
        savePrefab({ id: newId(), name, code: clipToCode(clip, name) });
        this._buildPrefabPanel();
        this.app.ui.flash(`Prefab « ${name} » enregistré.`);
        return true;
      } }],
    });
    setTimeout(() => f.querySelector('#pf-name').focus(), 60);
  },

  _importPrefabDialog() {
    const f = document.createElement('div');
    f.className = 'form';
    f.innerHTML = '<label class="col">Code de prefab<textarea id="pf-code" rows="4" placeholder="SHP1:…" spellcheck="false"></textarea></label><p class="mp-err" id="pf-err" role="alert"></p>';
    this.app.ui.modal({
      title: 'Importer un prefab', body: f,
      actions: [{ label: 'Annuler' }, { label: 'Importer', primary: true, onClick: () => {
        try {
          const { name, clip } = codeToClip(f.querySelector('#pf-code').value);
          savePrefab({ id: newId(), name, code: clipToCode(clip, name) });
          this._buildPrefabPanel();
          this.app.ui.flash(`Prefab « ${name} » importé (${clipSummary(clip)}).`);
          return true;
        } catch (e) { f.querySelector('#pf-err').textContent = e.message; return false; }
      } }],
    });
  },
};
