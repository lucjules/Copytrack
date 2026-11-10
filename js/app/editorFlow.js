// Passages entre le menu et l'éditeur : ouverture, aide, retour, essai d'un circuit.
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
import { keyLabel } from '../input.js';
import { medalIcon } from '../ui.js';
import { esc } from '../dom.js';
import { MEDALS } from '../medals.js';
import { Track, hashString } from '../track.js';
import { getEditorDraft, formatTime } from '../storage.js';
import { saveProof } from '../authorProof.js';
export const editorFlowMethods = {
  // L'éditeur (et l'inspecteur, les outils de remplissage, les familles de pièces…) pèse un quart du code du jeu : il n'est chargé qu'à la première
  // ouverture, pas au démarrage. Un second appel pendant le chargement est ignoré.
  async openEditor(state) {
    if (this._openingEditor) return;
    this._openingEditor = true;
    try {
      const { EditorSession } = await import('../editor.js');
      this._dispose();
      this.mode = 'editor';
      this.ui.showScreen(null);
      this.ui.setMode('editor');
      this.session = new EditorSession(this, state || getEditorDraft() || {});
      this.audio.music.play('menu');
      this._resize();
    } finally { this._openingEditor = false; }
  },

  _keysOf(action) {
    const k = (this.input.bindings[action] || []).filter(Boolean).map(keyLabel);
    return k.length ? k.join(' / ') : '—';
  },

  editorHelp() {
    const L = (a) => this._keysOf(a);
    const rows = [
      ['Clic', 'Poser (glisser : plusieurs)'],
      ['Clic droit', 'Supprimer'],
      ['Clic droit glissé', 'Tourner la vue'],
      ['Clic molette', 'Pipette'],
      ['Clic molette glissé', 'Déplacer la vue'],
      ['Molette', 'Zoom (Alt : taille du décor)'],
      ['Maj + molette', 'Niveau + / −'],
      ['Maj + souris', 'Inspecter : déplacer à la verticale'],
      [L('ed.levelUp') + ' / ' + L('ed.levelDown'), 'Niveau + / −'],
      [L('ed.rotate'), 'Pivoter (Maj : sens inverse)'],
      [L('ed.mirror'), 'Miroir gauche / droite'],
      [L('ed.nextPiece'), 'Pièce suivante (Maj : précédente)'],
      ['Q', 'Sélection de zone'],
      [L('ed.inspect'), 'Inspecter (propriétés, gizmos)'],
      ['Ctrl + D', 'Dupliquer la pièce inspectée'],
      ['Ctrl + C / X / V / A', 'Copier / couper / coller / tout'],
      [L('ed.levelView'), 'Vue par niveau'],
      [L('ed.verify'), 'Vérifier le circuit'],
      [L('ed.params'), 'Niveau : nom, description, réglages'],
      ['Maj + ' + L('ed.test'), 'Tester depuis la pièce visée'],
      [L('ed.surface'), 'Revêtement suivant'],
      [L('ed.fill'), 'Pot de peinture (pièces liées ou zone vide fermée)'],
      [L('ed.snap'), 'Accrochage des décors'],
      [L('ed.scaleUp') + ' / ' + L('ed.scaleDown'), 'Taille du décor'],
      [L('ed.erase'), 'Gomme (répéter : filtre)'],
      [`${L('accelerate')} ${L('left')} ${L('brake')} ${L('right')}`, 'Déplacer la vue'],
      [L('ed.recenter') + ' · ' + L('ed.topView') + ' · ' + L('ed.grid'), 'Recentrer · dessus · grille'],
      [L('ed.test'), 'Tester'],
      ['Ctrl + Z / Y / S', 'Annuler / rétablir / enregistrer'],
      ['Manette', 'Stick droit : curseur · A : poser · B : effacer · X : pivoter · Y : tester · LB/RB : niveau'],
    ];
    this.ui.modal({
      title: 'Raccourcis de l’éditeur',
      wide: true,
      body: `<div class="kbd-list">${rows.map(([k, v]) => `<b>${esc(k)}</b><span>${esc(v)}</span>`).join('')}</div>
        <p style="margin-top:14px">Touches modifiables : Paramètres › Commandes.</p>`,
      actions: [{ label: 'OK', primary: true }],
    });
  },

  leaveEditor() {
    this.showMenu('menu');
  },

  // Test depuis l'éditeur. verify : course complète qui vérifie le circuit (temps de l'auteur).
  testTrack(state, spawn = null, verify = false) {
    this.editorState = state;
    const track = Track.decode(state.code);
    this.playTrack(track, { fromEditor: true, verify: verify && !spawn, trackKey: 'e-' + hashString(state.code), seed: 'editeur-test', spawn });
    if (!track.count('finish') && !verify) this.ui.flash('Essai libre : ce circuit n’a pas d’arrivée (Échap pour revenir à l’éditeur).', 3);
    else if (spawn) this.ui.flash('Test depuis la pièce visée : sans checkpoints, médaille ni vérification.', 2.6);
    else if (verify) this.ui.flash('Vérification : termine le circuit. Ton temps deviendra la médaille cristal.', 2.6);
  },

  // Appelé quand le joueur termine la vérification de son circuit depuis l'éditeur :
  // il choisit alors de publier ou de revenir à l'éditeur.
  onEditorTestFinished(time, track) {
    // « Refaire un meilleur temps » : on garde le meilleur des deux.
    if (!(track.verified && track.vt <= time)) {
      track.setVerified(time);
      const run = this.session && this.session.lastRun;
      if (run) saveProof(track, run);      // la course de vérification : le serveur la rejouera à la publication (js/authorProof.js)
    }
    time = track.vt;
    if (this.editorState) this.editorState.code = track.encode();
    const m = track.derivedMedals;
    setTimeout(() => {
      this.ui.modal({
        title: 'Circuit vérifié ✔',
        body: `<p>Ton temps <b>${formatTime(time)}</b> devient la médaille <b>cristal</b> de « ${esc(track.name)} ».</p>
          <p class="meta">${MEDALS.map((x) => `${medalIcon(x)}${formatTime(m[x.id])}`).join(' · ')}</p>
          <p>Publie-le, ou modifie-le (le tracé devra être revérifié).</p>`,
        actions: [
          { label: '🌐 Publier', primary: true, onClick: () => { this.publishTrack(track).then((ok) => { if (ok) this.quitRace(); }); return true; } },
          { label: 'Retour à l’éditeur', onClick: () => { this.quitRace(); return true; } },
          { label: 'Refaire un meilleur temps', onClick: () => { if (this.session && this.session.restart) this.session.restart(); return true; } },
        ],
      });
    }, 900);
  },
};
