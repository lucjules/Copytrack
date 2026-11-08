// Académie : menu des six leçons et des exercices évalués (E12), introduction, bilan à l'arrivée. Les données et les règles sont dans academy.js
// (leçons) et skills.js (compétences, exercices) ; la mesure d'un exercice, dans analysis/drill.js.
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
import { esc } from '../dom.js';
import { buildBuiltin } from '../tracks.js';
import { goalLabel } from '../career.js';
import { LESSONS, lessonDone, lessonsDone, nextLesson, completeLesson, LESSON_COINS, GRADUATE_COINS } from '../academy.js';
import { SKILLS, DRILLS, GRADE_NAMES, GRADE_ICONS, DRILL_COINS, drillLevel, drillBest, skillLevel, weakestDrill, gradeDrill, valueOf, describeMeasure, goalTexts, recordDrill } from '../skills.js';
import { measureRun, drillAdvice } from '../analysis/drill.js';
import { formatTime } from '../storage.js';

const bestText = (d, v) => (v == null ? '' : d.measure === 'zoneSpeed' ? `${Math.round(v)} km/h` : d.measure === 'zoneTime' ? `${v.toFixed(2).replace('.', ',')} s`
  : d.measure === 'landings' ? `${v} / 3` : v >= 21 ? 'renforcé sans choc' : v >= 20 ? 'mini-turbo renforcé' : v >= 10 ? 'mini-turbo simple' : '');

export const academyMethods = {
  // Remplace {accelerate} {brake} {left} {right} {respawn} par les touches du joueur (ou les boutons à l'écran sur tactile).
  _lessonText(html) {
    const touch = document.body.classList.contains('touch');
    const TOUCH = { accelerate: '▲', brake: '▼', left: '◀', right: '▶', respawn: '⟲' };
    return html.replace(/\{(accelerate|brake|left|right|respawn)\}/g, (_, a) => (touch ? TOUCH[a] : esc(this._keysOf(a))));
  },

  academyMenu() {
    const body = document.createElement('div');
    const done = lessonsDone(), weak = weakestDrill();
    body.innerHTML = `<p>Six leçons de deux minutes, chacune sur un seul geste. Pas de chrono, pas de médaille : on s'entraîne. <b>+${LESSON_COINS} ◆</b> la première fois qu'une leçon est réussie, <b>+${GRADUATE_COINS} ◆</b> au diplôme.</p>
      <ol class="academy-list">${LESSONS.map((L, i) => `<li class="${lessonDone(L.id) ? 'done' : ''}"><span class="ac-st">${lessonDone(L.id) ? '✓' : i + 1}</span>
        <span class="ac-name"><b>${esc(L.name)}</b><small>${esc(goalLabel(L.goal))}</small></span>
        <button class="btn${nextLesson() === i ? ' primary' : ''}" data-lesson="${i}">${lessonDone(L.id) ? 'Refaire' : 'Jouer'}</button></li>`).join('')}</ol>
      <p class="meta">${done} / ${LESSONS.length} leçons réussies${done === LESSONS.length ? ' · 🎓 Diplômé !' : ''}</p>
      <h3 class="ac-h">Exercices évalués</h3>
      <p>Chaque exercice mesure un geste et le note <b>bronze</b>, <b>argent</b> ou <b>or</b>. Ta meilleure note fait le niveau de la compétence. <b>+${DRILL_COINS[1] + DRILL_COINS[2] + DRILL_COINS[3]} ◆</b> par exercice, une fois.</p>
      <div class="ac-skills">${SKILLS.map((sk) => { const l = skillLevel(sk.id); return `<span class="ac-skill${l >= 3 ? ' ac-gold' : ''}">${sk.icon} <span>${esc(sk.name)}</span> <b>${GRADE_ICONS[l]}</b></span>`; }).join('')}</div>
      ${weak ? `<p class="ac-weak">🎯 Point faible : <b>${esc(weak.skill.name)}</b> — exercice conseillé : <b>${esc(weak.drill.name)}</b>.</p>` : '<p class="ac-weak">🥇 Toutes les compétences sont en or.</p>'}
      <ol class="academy-list ac-drills">${DRILLS.map((d, i) => { const l = drillLevel(d.id), b = bestText(d, drillBest(d.id)); return `<li class="${l >= 3 ? 'done' : ''}"><span class="ac-st">${l ? GRADE_ICONS[l] : '·'}</span>
        <span class="ac-name"><b>${esc(d.name)}</b><small>${esc(SKILLS.find((sk) => sk.id === d.skill).name)}${b ? ` · meilleure mesure : ${esc(b)}` : ''}</small></span>
        <button class="btn${weak && weak.index === i ? ' primary' : ''}" data-drill="${i}">${l ? 'Refaire' : 'Jouer'}</button></li>`; }).join('')}</ol>`;
    for (const b of body.querySelectorAll('[data-lesson]')) b.onclick = () => { this.audio.click(); this.ui.closeModal(); this.lessonIntro(+b.dataset.lesson); };
    for (const b of body.querySelectorAll('[data-drill]')) b.onclick = () => { this.audio.click(); this.ui.closeModal(); this.drillIntro(+b.dataset.drill); };
    this.ui.modal({ title: '🎓 Académie', body, actions: [{ label: 'Fermer', primary: true }] });
  },

  // Exercice évalué : consignes, les trois objectifs (bronze, argent, or), la note actuelle.
  drillIntro(i) {
    const d = DRILLS[i];
    if (!d) return;
    const l = drillLevel(d.id), b = bestText(d, drillBest(d.id));
    const body = `<ul class="tuto">${d.intro.map((t) => `<li>${this._lessonText(t)}</li>`).join('')}</ul>
      <ol class="ac-goals">${goalTexts(d).map((g, k) => `<li class="${l > k ? 'done' : ''}">${GRADE_ICONS[k + 1]} <span>${esc(g)}</span></li>`).join('')}</ol>
      <p class="meta">${l ? `Ta note : <b>${GRADE_NAMES[l]}</b>${b ? ` · meilleure mesure : ${esc(b)}` : ''}` : 'Pas encore de note.'}</p>`;
    this.ui.modal({
      title: `Exercice · ${d.name}`, body,
      actions: [{ label: 'Commencer', primary: true, onClick: () => { setTimeout(() => this.playDrill(i), 0); return true; } }, { label: 'Retour', onClick: () => { setTimeout(() => this.academyMenu(), 0); return true; } }],
    });
  },

  playDrill(i) {
    const d = DRILLS[i];
    if (!d) return;
    const track = buildBuiltin({ ...d, id: 'drill-' + d.id, name: d.name });
    this.playTrack(track, { academy: { drill: i, tip: d.tip }, trackKey: null, difficulty: 1, seed: 'drill-' + d.id });
  },

  // Arrivée d'un exercice : la course est rejouée et mesurée (analysis/drill.js), notée, enregistrée ; le bilan donne la mesure, les objectifs et un conseil.
  onDrillFinished(session, time) {
    const i = session.opts.academy.drill, d = DRILLS[i];
    let m = null;
    try { m = measureRun(session.track, session.recorder.encode(), d); } catch { m = null; }
    const g = gradeDrill(d, m), r = recordDrill(d.id, g, valueOf(d, m));
    if (r.coins) this.ui.updateCoins();
    let advice = '';
    try { advice = drillAdvice(d, m, session.track, g); } catch { advice = d.tip; }
    const weak = weakestDrill();
    const actions = [{ label: 'Réessayer', primary: g < 3, onClick: () => { session.restart(); return true; } }];
    if (weak && weak.index !== i) actions.push({ label: `Point faible : ${weak.drill.name}`, primary: g >= 3, onClick: () => { setTimeout(() => this.drillIntro(weak.index), 0); return true; } });
    actions.push({ label: 'Académie', onClick: () => { setTimeout(() => { this.quitRace(); }, 0); return true; } });
    this.ui.modal({
      title: g ? `${GRADE_ICONS[g]} Note : ${GRADE_NAMES[g]}` : 'Pas encore de note',
      body: `<p class="ac-measure"><b>${esc(describeMeasure(d, m))}</b> <small>(${esc(formatTime(time))})</small></p>
        <ol class="ac-goals">${goalTexts(d).map((txt, k) => `<li class="${g > k ? 'done' : ''}">${GRADE_ICONS[k + 1]} <span>${esc(txt)}</span></li>`).join('')}</ol>`
        + (r.lvl > r.prev ? `<p>Nouvelle note : <b>${GRADE_NAMES[r.lvl]}</b>${r.coins ? ` · +${r.coins} ◆` : ''}</p>` : r.newBest ? '<p>Meilleure mesure battue.</p>' : '')
        + (advice ? `<p class="ac-advice">💡 ${esc(advice)}</p>` : ''),
      actions,
    });
  },

  lessonIntro(i) {
    const L = LESSONS[i];
    if (!L) return;
    const body = `<ul class="tuto">${L.intro.map((t) => `<li>${this._lessonText(t)}</li>`).join('')}</ul><p class="academy-goal">🎯 Objectif : <b>${esc(goalLabel(L.goal))}</b></p>`;
    this.ui.modal({
      title: `Leçon ${i + 1} · ${L.name}`, body,
      actions: [{ label: 'Commencer', primary: true, onClick: () => { setTimeout(() => this.playLesson(i), 0); return true; } }, { label: 'Retour', onClick: () => { setTimeout(() => this.academyMenu(), 0); return true; } }],
    });
  },

  playLesson(i) {
    const L = LESSONS[i];
    if (!L) return;
    const track = buildBuiltin({ ...L, id: 'academy-' + L.id, name: L.name });
    this.playTrack(track, { academy: { index: i, tip: `Objectif : ${goalLabel(L.goal)}. ${L.tip}` }, trackKey: null, difficulty: 1, seed: 'academy-' + L.id });
  },

  // Arrivée d'une leçon : on la juge (objectif atteint ou non) et on propose la suite.
  onAcademyFinished(session, time) {
    if (session.opts.academy.drill != null) { this.onDrillFinished(session, time); return; }
    const i = session.opts.academy.index, L = LESSONS[i];
    const r = completeLesson(i, { ...session.stats, vehicle: session.phys.vehicle, time });
    if (r.coins) this.ui.updateCoins();
    if (r.passed) this.checkRewards();
    const next = i + 1 < LESSONS.length ? i + 1 : null;
    const actions = [];
    if (r.passed && next != null) actions.push({ label: 'Leçon suivante', primary: true, onClick: () => { setTimeout(() => this.lessonIntro(next), 0); return true; } });
    actions.push({ label: r.passed ? 'Rejouer' : 'Réessayer', primary: !(r.passed && next != null), onClick: () => { session.restart(); return true; } });
    actions.push({ label: 'Académie', onClick: () => { setTimeout(() => { this.quitRace(); }, 0); return true; } });
    const hints = {
      nowall: 'Un muret touché : ralentis avant le virage et garde la route.', norespawn: 'Tu as dû réapparaître : regarde les obstacles avant de passer.',
      turbo: 'Pas assez de mini-turbos : volant à fond d’abord, puis frein environ une seconde, et relâche.', perfect: 'Retombe à plat : accélérer baisse le nez, freiner le relève.',
      vehicle: 'Tu n’es pas en moto à l’arrivée : roule sur la plaque orange et ne repasse pas dessus.',
    };
    this.ui.modal({
      title: r.passed ? (r.graduated ? '🎓 Diplôme !' : '✓ Leçon réussie') : 'Pas tout à fait…',
      body: `<p>${r.passed ? `Objectif atteint : <b>${esc(r.text)}</b>.` : `Objectif : <b>${esc(r.text)}</b>. ${esc(hints[L.goal.id] || '')}`}</p>`
        + (r.coins ? `<p>+${r.coins} ◆${r.graduated ? ' (dont le bonus de diplôme)' : ''}</p>` : '')
        + (r.graduated ? '<p>Les six leçons sont réussies. L’éditeur et la carrière n’ont plus de secret pour toi : essaie le chapitre bonus <b>Atelier</b>.</p>' : ''),
      actions,
    });
  },
};
