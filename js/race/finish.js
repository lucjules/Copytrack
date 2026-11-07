// Évènements de course (checkpoint, tour, arrivée), records, récompenses et écran de fin.
// Ces méthodes s'ajoutent au prototype de RaceSession (voir race.js) : `this` est l'instance.
import { DT } from '../constants.js';
import { MSG, PRIO } from '../hudMessages.js';
import { F_FINISHED } from '../net/snapshot.js';
import { saveRecord, encodeFloats, formatTime } from '../storage.js';
import { rewardCoins } from '../profile.js';
import { MEDALS, medalFor } from '../medals.js';
import { PHYS_VER } from '../version.js';
import { goalMet, goalLabel, completeGoal, goalDone } from '../career.js';
export const finishMethods = {
  _event(ev) {
    const app = this.app;
    const p = this.phys.pos;
    if (ev.type === 'checkpoint' || ev.type === 'lap') this._snapStats();
    if (ev.type === 'checkpoint') {
      let diff = null;
      if (this.record && this.record.splits && this.record.splits[ev.index - 1] != null) {
        diff = (ev.steps - this.record.splits[ev.index - 1]) * DT;
      }
      if (!this.demo) {
        app.audio.checkpoint(diff == null ? null : diff <= 0);
        app.ui.hud.split(diff, ev.steps * DT);
        app.ui.hud.checkpoints(this.logic.collected.size, this.logic.cps.length, this.logic.lap, this.logic.laps);
      }
      app.particles.burst(p.x, p.y + 2, p.z, 30, 12, 0.9, 0.8, '#ffbf3c', 4, 2);
    } else if (ev.type === 'lap') {
      let diff = null;
      if (this.record && this.record.splits && this.record.splits[ev.index - 1] != null) diff = (ev.steps - this.record.splits[ev.index - 1]) * DT;
      if (!this.demo) {
        app.audio.checkpoint(diff == null ? null : diff <= 0);
        app.ui.hud.split(diff, ev.steps * DT);
        this._say(MSG.lap(ev.lap, ev.laps));
        app.ui.hud.checkpoints(0, this.logic.cps.length, ev.lap, ev.laps);
      }
      app.particles.burst(p.x, p.y + 2, p.z, 40, 14, 1, 0.8, '#ff4f9a', 4, 2);
    } else if (ev.type === 'missing') {
      if (!this.demo) {
        this._say(MSG.missing(ev.remaining));
        app.audio.error();
      }
    } else if (ev.type === 'finish') {
      app.particles.burst(p.x, p.y + 2, p.z, 60, 16, 1.4, 1.0, '#ff4f9a', 5, 3);
      app.particles.burst(p.x, p.y + 2, p.z, 40, 14, 1.4, 0.8, '#5ff2ff', 5, 3);
      if (this.demo) { this.finishT = 0; this.state = 'finished'; return; }
      this._finish(ev.steps * DT);
    }
  },

  _finish(time) {
    const app = this.app;
    this.state = 'finished';
    app.audio.engine(null);          // plus de bruit de moteur une fois le niveau terminé
    this.finishT = 0;
    if (this.replay) { this._replayEnded(); return; }
    if (this.multi) {
      // Multijoueur : ni record, ni pièces, ni classement en ligne (le chrono y suit des règles différentes). Le temps est
      // annoncé aux autres ; on peut recommencer tout de suite (R ou T), sans jamais repasser par le salon.
      this._sendNet(F_FINISHED);
      const best = this.multi.room.reportFinish(Math.round(time / DT));
      app.audio.finish(best);
      app.ui.hud.time(time, true);
      app.ui.hud.message(`🏁 ${formatTime(time)}${best ? ' · meilleur temps' : ''} · R : nouvel essai`, 6, PRIO.final);
      return;
    }
    // Dernière course, rejouable depuis l'écran d'arrivée.
    this.lastRun = { inputs: this.recorder.encode(), time };
    const prev = this.record;
    // Un record d'une autre version de la physique n'est plus comparable (et n'a pas de commandes rejouables) : il ne bloque pas le nouveau.
    const prevValid = prev && prev.pv === PHYS_VER;
    const isRecord = (!prevValid || time < prev.time - 1e-9) && !this.opts.spawn;
    if (isRecord && this.trackKey) {
      const ghost = new Float32Array(this.ghostRec);
      const rec = {
        time,
        splits: this.logic.splits.slice(),
        ghost: encodeFloats(ghost),
        inputs: this.recorder.encode(),
        pv: PHYS_VER,
        date: Date.now(),
        name: app.settings.playerName,
      };
      saveRecord(this.trackKey, rec);
    }
    app.audio.finish(isRecord);
    const medal = medalFor(time, this.medals);
    const prevMedal = prev ? medalFor(prev.time, this.medals) : null;
    let reward = null;
    if (this.opts.fromEditor && this.opts.spawn) {
      // Test partiel : pas de vérification ni de médaille.
    } else if (this.opts.fromEditor && this.opts.verify) {
      app.onEditorTestFinished(time, this.track);
    } else if (this.medals) {
      const tier = medal ? MEDALS.indexOf(medal) : -1;
      reward = rewardCoins({ tier, difficulty: this.opts.difficulty || 1, trackKey: this.trackKey, user: !!this.opts.userMap });
      app.ui.updateCoins();
    }
    // Objectif bonus (carrière).
    let goal = null;
    if (this.opts.goal && !this.opts.spawn) {
      const met = goalMet(this.opts.goal, { ...this.stats, vehicle: this.phys.vehicle, time });
      const already = goalDone(this.opts.goalKey);
      const coins = met ? completeGoal(this.opts.goalKey) : 0;
      if (coins) app.ui.updateCoins();
      goal = { label: goalLabel(this.opts.goal), met, coins, already };
    }
    app.ui.showFinish({
      goal,
      reward,
      verified: !!(this.opts.fromEditor && this.opts.verify),
      derived: this.opts.fromEditor && this.opts.verify ? this.track.derivedMedals : null,
      unverifiedUser: !!this.opts.userMap && !this.medals,
      time,
      prevTime: prev ? prev.time : null,
      isRecord,
      medal,
      newMedal: medal && (!prevMedal || MEDALS.indexOf(medal) < MEDALS.indexOf(prevMedal)),
      medals: this.medals,
      fromEditor: !!this.opts.fromEditor,
      hasNext: !!this.opts.hasNext,
      canReplay: true,
      canBoard: !!(this.trackKey && /^(b-|daily-|u-)/.test(this.trackKey) && !this.opts.spawn && !this.opts.fromEditor),
      canShareGhost: !!(this.trackKey && (isRecord || (this.record && this.record.inputs)) && !this.opts.spawn),
    });
    if (isRecord) this.loadRecord();
    // Classement en ligne : le record est envoyé (et vérifié par rejeu côté serveur).
    app.onRaceFinished(this, time, isRecord);
    app.ui.hud.time(time, true);
    if (this.record) app.ui.hud.el.best.innerHTML = `Record ${formatTime(this.record.time)}`;
  },
};
