// Académie : menu des six leçons, introduction de chaque leçon, bilan à l'arrivée. Les données et les règles sont dans academy.js.
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
import { esc } from '../dom.js';
import { buildBuiltin } from '../tracks.js';
import { goalLabel } from '../career.js';
import { LESSONS, lessonDone, lessonsDone, nextLesson, completeLesson, LESSON_COINS, GRADUATE_COINS } from '../academy.js';

export const academyMethods = {
  // Remplace {accelerate} {brake} {left} {right} {respawn} par les touches du joueur (ou les boutons à l'écran sur tactile).
  _lessonText(html) {
    const touch = document.body.classList.contains('touch');
    const TOUCH = { accelerate: '▲', brake: '▼', left: '◀', right: '▶', respawn: '⟲' };
    return html.replace(/\{(accelerate|brake|left|right|respawn)\}/g, (_, a) => (touch ? TOUCH[a] : esc(this._keysOf(a))));
  },

  academyMenu() {
    const body = document.createElement('div');
    const done = lessonsDone();
    body.innerHTML = `<p>Six leçons de deux minutes, chacune sur un seul geste. Pas de chrono, pas de médaille : on s'entraîne. <b>+${LESSON_COINS} ◆</b> la première fois qu'une leçon est réussie, <b>+${GRADUATE_COINS} ◆</b> au diplôme.</p>
      <ol class="academy-list">${LESSONS.map((L, i) => `<li class="${lessonDone(L.id) ? 'done' : ''}"><span class="ac-st">${lessonDone(L.id) ? '✓' : i + 1}</span>
        <span class="ac-name"><b>${esc(L.name)}</b><small>${esc(goalLabel(L.goal))}</small></span>
        <button class="btn${nextLesson() === i ? ' primary' : ''}" data-lesson="${i}">${lessonDone(L.id) ? 'Refaire' : 'Jouer'}</button></li>`).join('')}</ol>
      <p class="meta">${done} / ${LESSONS.length} leçons réussies${done === LESSONS.length ? ' · 🎓 Diplômé !' : ''}</p>`;
    for (const b of body.querySelectorAll('[data-lesson]')) b.onclick = () => { this.audio.click(); this.ui.closeModal(); this.lessonIntro(+b.dataset.lesson); };
    this.ui.modal({ title: '🎓 Académie', body, actions: [{ label: 'Fermer', primary: true }] });
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
    const i = session.opts.academy.index, L = LESSONS[i];
    const r = completeLesson(i, { ...session.stats, vehicle: session.phys.vehicle, time });
    if (r.coins) this.ui.updateCoins();
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
