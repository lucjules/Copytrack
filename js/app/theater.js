// Replay Theater : point d'entrée de l'application (« Revoir la course » à l'arrivée, « Regarder mon record » de la fiche du circuit).
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance. La salle elle-même : theater/session.js.
import { $ } from '../dom.js';
import { RaceSession } from '../race.js';

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
};
