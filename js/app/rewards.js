// Récompenses côté application : rassembler les compteurs (médailles, leçons, défis du jour…), donner ce qui est mérité, afficher le titre choisi dans le profil.
// Les règles sont dans rewards.js. Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
import { esc } from '../dom.js';
import { profile } from '../profile.js';
import { getRecord } from '../storage.js';
import { medalFor } from '../medals.js';
import { lessonsDone } from '../academy.js';
import { online } from '../online.js';
import { TITLES, emptyContext, earnedTitles, grantRewards, chooseTitle, titleLabel } from '../rewards.js';

export const rewardsMethods = {
  _rewardContext() {
    const p = profile(), ctx = emptyContext();
    const medals = this.builtins.map((b) => { const rec = getRecord(b.key); return rec ? medalFor(rec.time, b.def.medals) : null; });
    this.builtins.forEach((b, i) => {
      const m = medals[i];
      if (!m) return;
      if (b.def.decor === 'atelier') ctx.atelierMedals++; else ctx.coreMedals++;
      if (m.id === 'cristal') ctx.crystals++;
    });
    return Object.assign(ctx, {
      totalTracks: this.builtins.length, academy: lessonsDone(), dailyDays: (p.dailyDays || []).length, races: (p.stats && p.stats.races) || 0, turbos: (p.stats && p.stats.turbos) || 0,
      collections: Object.keys(p.collections || {}).length,
    });
  },

  // À appeler après une course, une leçon, une collection… : donne ce qui est mérité et le dit (un message à la fois, pour qu'on les lise).
  checkRewards() {
    const r = grantRewards(this._rewardContext());
    const msgs = [
      ...r.exclusives.map((e) => `🎁 Exclusif débloqué : ${e.label} (garage)`),
      ...r.collections.map((c) => `🏆 Collection « ${c.label} » complète : +${c.coins} ◆`),
      ...r.titles.map((t) => `🎖 Nouveau titre : ${titleLabel(t)} (Profil)`),
    ];
    if (r.collections.length) this.ui.updateCoins();
    msgs.forEach((m, i) => setTimeout(() => this.ui.flash(m, 3.2), 600 + i * 3400));
    return r;
  },

  _renderTitlesBox(el) {
    if (!el) return;
    const ctx = this._rewardContext(), p = profile(), have = new Set(earnedTitles(ctx));
    el.innerHTML = `<h3 class="opt-h">Titre affiché au classement</h3>
      <label><span>Titre</span><select id="prof-title"><option value="">Aucun</option>${TITLES.filter((t) => have.has(t.id)).map((t) => `<option value="${t.id}"${p.title === t.id ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label>
      <ul class="title-list">${TITLES.map((t) => `<li class="${have.has(t.id) ? 'got' : ''}"><b>${have.has(t.id) ? '🎖' : '🔒'} ${esc(t.label)}</b><small>${esc(t.how)}</small></li>`).join('')}</ul>
      <p class="meta">Un titre est purement décoratif : il s'affiche à côté de ton pseudo dans les classements en ligne.</p>`;
    el.querySelector('#prof-title').onchange = (e) => {
      if (!chooseTitle(e.target.value, ctx)) return;
      online.setTitle(e.target.value).catch(() => { /* sans réseau ou sans l'étape 8 : le titre reste local */ });
      this.ui.flash(e.target.value ? `Titre : ${titleLabel(e.target.value)}` : 'Titre retiré');
    };
  },
};
