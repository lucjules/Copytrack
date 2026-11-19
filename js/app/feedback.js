// Avis des testeurs dans le jeu (phase 4 de la 1.0) : la fenêtre « Donner mon avis » (questions : js/feedback.js ; serveur : supabase/etape19-avis.sql),
// ouverte depuis Paramètres et la barre du bas de l'accueil, et proposée UNE fois après quelques courses aux joueurs qui ont accepté les statistiques.
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
import { SCALES, CHOICES, LIMITS, ASK_AFTER_FINISHES, buildFeedback, guessDevice } from '../feedback.js';
import { online } from '../online.js';
import { esc } from '../dom.js';

export const feedbackMethods = {
  // Une course finie (hors éditeur) : compte, pour proposer l'avis au bon moment.
  noteFinish() {
    this.settings.finishes = Math.min(1e6, (this.settings.finishes | 0) + 1);
    this.saveSettings();
  },

  // Au retour à l'accueil : une seule fois, après ASK_AFTER_FINISHES courses, si le joueur a accepté les statistiques (il a déjà dit qu'il voulait aider).
  maybeAskFeedback() {
    const s = this.settings;
    if (s.feedbackAsked || s.feedbackSent || s.telemetry !== true || (s.finishes | 0) < ASK_AFTER_FINISHES || this.ui.modalOpen || this.mode !== 'menu') return false;
    s.feedbackAsked = Date.now(); this.saveSettings();
    this.ui.modal({
      title: 'Ton avis compte',
      body: '<p>Tu joues à la version d’essai du jeu. Deux minutes pour dire ce que tu en penses ? Les réponses servent à régler le dérapage, les murs, le contrôle en l’air et les médailles avant la 1.0.</p>',
      actions: [{ label: 'Donner mon avis', primary: true, onClick: () => { setTimeout(() => this.showFeedback(), 60); return true; } }, { label: 'Plus tard' }],
    });
    return true;
  },

  showFeedback() {
    const touch = document.body.classList.contains('touch');
    const minSide = Math.min(screen.width || 1000, screen.height || 1000);
    let lastPad = false;
    try { lastPad = [...(navigator.getGamepads ? navigator.getGamepads() : [])].some(Boolean); } catch { /* API absente */ }
    const defaults = { device: guessDevice({ touch, minSide }), controls: touch ? 'tactile' : lastPad ? 'manette' : 'clavier' };
    const radios = (name, list, cur) => list.map(([v, label]) => `<label class="fb-choice"><input type="radio" name="fb-${name}" value="${v}"${v === cur ? ' checked' : ''}><span>${esc(label)}</span></label>`).join('');
    const scale = (s) => {
      const vals = s.type === 'note' ? [1, 2, 3, 4, 5] : [-2, -1, 0, 1, 2];
      return `<fieldset class="fb-scale"><legend>${esc(s.label)}</legend><span class="fb-end">${esc(s.ends[0])}</span>${vals.map((v) => `<label class="fb-dot" title="${v}"><input type="radio" name="fb-${s.key}" value="${v}"><span>${s.type === 'equilibre' && v === 0 ? 'juste' : v > 0 && s.type === 'equilibre' ? '+' + v : v}</span></label>`).join('')}<span class="fb-end">${esc(s.ends[1])}</span></fieldset>`;
    };
    const f = document.createElement('form');
    f.className = 'feedback-form';
    f.noValidate = true;
    f.innerHTML = `<p class="meta">Version d’essai : tes réponses règlent le jeu avant la 1.0. Les notes sont obligatoires, le reste non. Anonyme, sauf si tu joins ton pseudo.</p>
      ${this.settings.telemetry === true ? '' : '<p class="meta">Les temps de tes courses aident aussi à régler les médailles : <button type="button" class="link-btn" data-fb="stats">accepter les statistiques anonymes</button>.</p>'}
      <div class="fb-row"><span class="fb-q">Appareil</span>${radios('device', CHOICES.device, defaults.device)}</div>
      <div class="fb-row"><span class="fb-q">Commandes</span>${radios('controls', CHOICES.controls, defaults.controls)}</div>
      <div class="fb-row"><span class="fb-q">Expérience</span>${radios('experience', CHOICES.experience, '')}</div>
      ${SCALES.map(scale).join('')}
      <label class="col">Circuits marquants (trop dur, bloquant, préféré…)<textarea name="tracks_note" rows="2" maxlength="${LIMITS.tracks_note}"></textarea></label>
      <label class="col">Autre chose à dire ?<textarea name="comment" rows="3" maxlength="${LIMITS.comment}"></textarea></label>
      <label class="wl-check"><input type="checkbox" name="withPseudo"><span>Joindre mon pseudo (${esc(this.settings.playerName || '')}) pour qu’on puisse te répondre</span></label>
      <p class="mp-err" role="alert"></p>`;
    const err = f.querySelector('.mp-err');
    const statsBtn = f.querySelector('[data-fb="stats"]');
    if (statsBtn) statsBtn.onclick = () => { this.setTelemetry(true); statsBtn.closest('p').remove(); };
    const send = () => {
      const fd = new FormData(f), answers = { withPseudo: fd.get('withPseudo') === 'on', tracks_note: fd.get('tracks_note'), comment: fd.get('comment') };
      for (const k of Object.keys(CHOICES)) answers[k] = fd.get('fb-' + k);
      for (const s of SCALES) answers[s.key] = fd.get('fb-' + s.key) == null ? NaN : Number(fd.get('fb-' + s.key));
      let payload;
      try { payload = buildFeedback(answers, { install: this.telemetry.installId, pseudo: this.settings.playerName }); }
      catch (e) { err.textContent = e.message; return false; }
      err.textContent = 'Envoi…';
      online.sendFeedback(payload).then((id) => {
        this.settings.feedbackSent = Date.now(); this.saveSettings();
        this.ui.closeModal();
        this.ui.flash(id ? 'Merci ! Ton avis est envoyé.' : 'Merci ! Beaucoup d’avis en ce moment : réessaie demain.', 3);
      }, (e) => { err.textContent = (e && e.message) || 'Envoi impossible pour le moment.'; });
      return false;      // (la fenêtre reste ouverte jusqu'à la réponse du serveur)
    };
    f.onsubmit = (e) => { e.preventDefault(); send(); };
    this.ui.modal({ title: 'Donner mon avis', body: f, wide: true, actions: [{ label: 'Envoyer', primary: true, onClick: send }, { label: 'Plus tard' }] });
  },
};
