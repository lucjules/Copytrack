// Replay Theater : point d'entrée de l'application (« Revoir la course » à l'arrivée, « Regarder mon record » de la fiche du circuit).
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance. La salle elle-même : theater/session.js.
import { $, esc } from '../dom.js';
import { RaceSession } from '../race.js';
import { traceFromInputs, traceFromBot } from '../analysis/trace.js';
import { makeReference, alignTrace } from '../analysis/reference.js';
import { coach } from '../analysis/coach.js';
import { formatTime } from '../storage.js';
import { drillForTip } from '../skills.js';

const later = () => new Promise((r) => setTimeout(r, 0));

export const theaterAppMethods = {
  // main : la course regardée ({ inputs, time, label }, rejouée exactement) ; compare : jusqu'à 3 courses ({ kind: 'inputs' | 'gold' | 'ghost', label, … }) ;
  // back : où revenir ({ hub, from } : la fiche du circuit ; { track, opts } : la course).
  openTheater({ track, opts = {}, main, compare = [], back = null, panel = false }) {
    this._replayBack = back;
    this._dispose();
    this.mode = 'race';
    this.ui.showScreen(null);
    this.ui.setMode('race');
    this.session = new RaceSession(this, track, { ...opts, replay: { inputs: main.inputs, time: main.time }, trackKey: null, medals: opts.medals || null, theater: { label: main.label, compare, panel } });
    $('replay-bar').classList.remove('hidden');
    this._resize();
  },

  // Écran d'arrivée : trois conseils du coach (analysis/coach.js) face à une référence PLUS RAPIDE (le record, sinon le fantôme or). Calculés après
  // l'affichage de l'écran (deux courses rejouées : une fraction de seconde), jamais pendant la course.
  async _finishCoach(session, time) {
    const el = $('fin-coach');
    el.classList.add('hidden'); el.innerHTML = '';
    const o = session.opts;
    if (!session.lastRun || o.fromEditor || o.spawn || o.multi || o.academy || o.mode || session.replay) return;
    await later(); await later();
    if (this.session !== session) return;
    let refTr = null, refLabel = '', refRun = null;
    try {
      const prev = session.prevRun;
      if (prev && prev.time < time - 1e-9) { refTr = traceFromInputs(session.track, prev.inputs); refLabel = `comparé à ton record (${formatTime(prev.time)})`; refRun = { kind: 'inputs', label: 'Mon record', inputs: prev.inputs, time: prev.time }; }
      else if (session.track.path) {
        await later();
        const g = traceFromBot(session.track);
        if (g && g.time < time - 1e-9) { refTr = g; refLabel = `comparé au fantôme or (${formatTime(g.time)})`; refRun = { kind: 'gold', label: 'Fantôme or' }; }
      }
      if (!refTr || this.session !== session) return;
      await later();
      const mine = traceFromInputs(session.track, session.lastRun.inputs), ref = makeReference(session.track, refTr);
      if (!ref || this.session !== session) return;
      alignTrace(refTr, ref); alignTrace(mine, ref);
      const tips = coach(mine, refTr).slice(0, 3);
      if (!tips.length) return;
      // Conseil adapté (E12) : le premier conseil qui désigne un geste mène à l'exercice de l'Académie qui le travaille.
      const train = tips.map((t) => drillForTip(t.id)).find(Boolean);
      el.innerHTML = `<h3>💡 Conseils <small>${esc(refLabel)}</small></h3><ol>${tips.map((t) => `<li>${esc(t.text)}</li>`).join('')}</ol>
        <button class="btn small" type="button" id="fin-coach-watch">🎬 Voir ces passages dans le Replay Theater</button>
        ${train ? `<button class="btn small" type="button" id="fin-coach-train">🎓 S’entraîner : ${esc(train.drill.name)}</button>` : ''}`;
      el.classList.remove('hidden');
      if (train) $('fin-coach-train').onclick = () => { this.audio.click(); this.quitRace(); setTimeout(() => this.drillIntro(train.index), 0); };
      $('fin-coach-watch').onclick = () => {
        this.audio.click();
        this.openTheater({ track: session.track, opts: session.opts, main: { ...session.lastRun, label: 'Cette course' }, compare: [refRun], back: { track: session.track, opts: { ...session.opts } }, panel: true });
      };
    } catch { el.classList.add('hidden'); }
  },
};
