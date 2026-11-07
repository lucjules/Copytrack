// Écrans de liste : carrière, circuits du joueur, défi du jour, circuit suivant, menu, tutoriel.
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
import { medalIcon } from '../ui.js';
import { $, esc } from '../dom.js';
import { RaceSession } from '../race.js';
import { medalFor } from '../medals.js';
import { Track, hashString } from '../track.js';
import { DECORS } from '../themes.js';
import { PIECES } from '../pieces.js';
import { thumbnail } from '../editorTools.js';
import { dailyChallenge, dayKey } from '../daily.js';
import { CHAPTERS, CHAPTER_SIZE, UNLOCK_MEDALS, PROFILS, goalFor, goalLabel, goalDone, chapterUnlocked, chapterState, careerSummary } from '../career.js';
import { getRecord, listMyTracks, deleteMyTrack, formatTime } from '../storage.js';
export const screenMethods = {
  showMenu(screen = 'menu') {
    this._dispose();
    const pool = this.builtins.filter((b) => b.track.path);
    const demo = pool[Math.floor(Math.random() * pool.length)];
    this.mode = 'menu';
    this.ui.setMode('menu');
    this.camera.fov = 60;
    this.camera.updateProjectionMatrix();
    this.session = new RaceSession(this, demo.track, { demo: true, seed: demo.key });
    this.audio.music.play('menu');
    this.showScreen(screen);
    this._resize();
  },

  showScreen(name) {
    this._screen = name;
    if (name === 'menu') {
      const r = getRecord('daily-' + dayKey());
      $('daily-best').textContent = r ? formatTime(r.time) : 'nouveau';
    }
    if (name === 'tracks') this._renderTracks();
    if (name === 'mytracks') this._renderMyTracks();
    if (name === 'community') this._renderCommunity(true);
    // Options et Commandes sont des onglets de l'écran Profil (les anciens appels showScreen('options') y mènent toujours).
    if (name === 'options' || name === 'controls') { this.profileTab = name; name = 'profile'; }
    if (name === 'profile') this._renderProfile();
    this.ui.showScreen(name);
  },

  // ---- Tutoriel (premier lancement, ou Options > Revoir le tutoriel) -------------
  tutorial(step = 0) {
    const touch = document.body.classList.contains('touch');
    const K = (a) => this._keysOf(a);
    const steps = [
      {
        title: 'Bienvenue dans Copytrack !',
        body: `<p>Passe les <b>checkpoints</b> puis l'<b>arrivée</b>, le plus vite possible.</p>
          <ul class="tuto">
            <li>${touch ? 'Boutons ▲ / ▼ à droite' : `<b>${K('accelerate')}</b> / <b>${K('brake')}</b>`} : accélérer / freiner</li>
            <li>${touch ? 'Boutons ◀ ▶ à gauche' : `<b>${K('left')}</b> / <b>${K('right')}</b>`} : tourner</li>
            <li>Manette : gâchettes et stick gauche</li>
          </ul>`,
      },
      {
        title: 'Glisser, voler, atterrir',
        body: `<ul class="tuto">
            <li><b>Dérapage</b> : freine en virage, garde le volant.</li>
            <li><b>Mini-turbo</b> : une longue glisse donne une poussée.</li>
            <li><b>En l'air</b> : gaz = nez en bas, frein = nez en haut. Atterris à plat.</li>
            <li><b>Vitesse</b> : la voiture accélère longtemps, la vitesse de pointe se mérite. Le turbo va encore plus vite.</li>
            <li><b>Murs</b> : un choc te ralentit et te fait tourner, frotter une barrière te freine. Lève le pied avant d'y aller.</li>
            <li>Loopings, tubes, routes sur un mur : il faut de la vitesse pour rester plaqué (sur un mur à 90°, environ 110 km/h minimum, sinon tu décroches).</li>
            <li><b>Gravité inversée</b> : la plaque rose ⇅ t'envoie au plafond, une 2e te ramène.</li>
          </ul>`,
      },
      {
        title: 'Plaques, checkpoints et carrière',
        body: `<ul class="tuto">
            <li><b>Plaques</b> : moto 🏍, bateau ⛵ (sur l'eau), deltaplane 🪂. Repasser dessus te rend ta voiture.</li>
            <li><b>${touch ? '⟲' : K('respawn')}</b> : revenir au dernier checkpoint · <b>${touch ? '↺' : K('restart')}</b> : recommencer.</li>
            <li><b>Obstacles</b> : piques mortelles, boules et marteaux bousculent. Leur rythme est fixe.</li>
            <li><b>Carrière</b> : 11 chapitres de 6 circuits, un objectif bonus ★ chacun.</li>
            <li>Un <b>défi du jour</b> chaque jour. Replays et fantômes partageables.</li>
          </ul>`,
      },
    ];
    const s = steps[step];
    const actions = [];
    if (step > 0) actions.push({ label: '← Précédent', onClick: () => { setTimeout(() => this.tutorial(step - 1), 0); return true; } });
    if (step < steps.length - 1) actions.push({ label: 'Suivant →', primary: true, onClick: () => { setTimeout(() => this.tutorial(step + 1), 0); return true; } });
    else actions.push({ label: 'C\'est parti !', primary: true, onClick: () => { this.settings.tutorialDone = true; this.saveSettings(); return true; } });
    if (step < steps.length - 1) actions.push({ label: 'Passer', onClick: () => { this.settings.tutorialDone = true; this.saveSettings(); return true; } });
    this.ui.modal({ title: `${s.title} (${step + 1}/${steps.length})`, body: s.body, actions });
  },

  nextTrack() {
    const opts = this.session ? this.session.opts : {};
    if (opts.builtinIndex == null || opts.builtinIndex >= this.builtins.length - 1) return;
    const next = opts.builtinIndex + 1;
    const medalOf = (i) => { const b = this.builtins[i]; const rec = getRecord(b.key); return rec ? medalFor(rec.time, b.def.medals) : null; };
    const ch = Math.floor(next / CHAPTER_SIZE);
    if (!chapterUnlocked(ch, medalOf, this.builtins.length)) {
      this.ui.flash(`Chapitre ${ch + 1} verrouillé : gagne ${UNLOCK_MEDALS} médailles au chapitre ${ch}.`, 2.6);
      this.audio.error();
      return;
    }
    this.playBuiltin(next);
  },

  // ------------------------------------------------------------ Écrans
  _renderTracks() {
    const list = $('track-list');
    list.innerHTML = '';
    const medalOf = (i) => { const b = this.builtins[i]; const rec = getRecord(b.key); return rec ? medalFor(rec.time, b.def.medals) : null; };
    // Bilan de la carrière
    {
      const ids = this.builtins.map((b, i) => { const m = medalOf(i); return m ? m.id : null; });
      const gd = this.builtins.filter((b) => goalDone(b.key + '#goal')).length;
      const sm = careerSummary(ids, gd);
      const box = document.createElement('div');
      box.className = 'career-summary' + (sm.complete ? ' complete' : sm.finished ? ' finished' : '');
      box.innerHTML = `<div class="cs-main"><b>${sm.pct} %</b><span>de la carrière</span></div>
        <div class="cs-bar"><i style="width:${sm.pct}%"></i></div>
        <div class="cs-stats">${sm.medals} / ${sm.total} médailles · ${sm.crystal} cristal · ${sm.goals} / ${sm.total} objectifs bonus</div>
        ${sm.complete ? '<p class="cs-msg">✦ Carrière complète : 66 cristaux et 66 objectifs. Il n’y a plus rien à finir ici.</p>' : sm.finished ? '<p class="cs-msg">🏁 Carrière terminée : une médaille sur chaque circuit. Reste les cristaux et les objectifs bonus.</p>' : ''}`;
      list.appendChild(box);
    }
    // Défi du jour
    const dailyBox = document.createElement('div');
    dailyBox.className = 'track-group';
    dailyBox.innerHTML = '<h3 class="group-title"><i style="background:#ffd23e"></i>Défi du jour</h3>';
    const dGrid = document.createElement('div');
    dGrid.className = 'card-grid';
    const dc = document.createElement('div');
    dc.className = 'card daily-card';
    dc.tabIndex = 0;
    const today = dayKey();
    const drec = getRecord('daily-' + today);
    dc.innerHTML = `<h3>Défi du ${today.split('-').reverse().join('/')}</h3>
      <div class="meta">Un nouveau circuit chaque jour, le même pour tout le monde.</div>
      <div class="best">${drec ? formatTime(drec.time) : '<span class="meta">Pas encore de temps aujourd’hui</span>'}<button class="btn board-btn" data-board="1" title="Classement du jour">🏆</button></div>`;
    dc.querySelector('[data-board]').addEventListener('click', (e) => {
      e.stopPropagation(); this.audio.click();
      const c = dailyChallenge();
      if (c) this.leaderboardModal(c.key, c.track.name, c.track);
    });
    const goDaily = () => { this.audio.click(); this.playDaily(); };
    dc.addEventListener('click', goDaily);
    dc.addEventListener('keydown', (e) => { if (e.key === 'Enter') goDaily(); });
    dGrid.appendChild(dc);
    dailyBox.appendChild(dGrid);
    list.appendChild(dailyBox);

    const total = this.builtins.length;
    for (let ch = 0; ch * CHAPTER_SIZE < total; ch++) {
      const open = chapterUnlocked(ch, medalOf, total);
      const idx = [];
      for (let i = ch * CHAPTER_SIZE; i < Math.min(total, (ch + 1) * CHAPTER_SIZE); i++) idx.push(i);
      const medals = idx.filter((i) => medalOf(i)).length;
      const goals = idx.filter((i) => goalDone(this.builtins[i].key + '#goal')).length;
      const C = CHAPTERS[ch] || { name: `Chapitre ${ch + 1}`, desc: '' };
      const cst = chapterState(idx.map((i) => { const m = medalOf(i); return m ? m.id : null; }), goals, idx.length);
      const g = document.createElement('div');
      g.className = 'track-group' + (cst.id !== 'open' ? ' ch-' + cst.id : '');
      g.innerHTML = `<div class="chapter-head"><h3 class="group-title"><i style="background:${open ? '#5ff2ff' : '#555'}"></i>Chapitre ${ch + 1} · ${esc(C.name)}${open ? '' : ' 🔒'}</h3>
        <span class="prog">${medals} / ${idx.length} médailles · ${goals} / ${idx.length} objectifs bonus</span>${cst.label ? `<span class="ch-badge ${cst.id}">${cst.label}</span>` : ''}</div>
        <p class="chapter-desc">${esc(C.desc)}${open ? '' : ` — Gagne ${UNLOCK_MEDALS} médailles au chapitre ${ch} pour l’ouvrir.`}</p>`;
      const grid = document.createElement('div');
      grid.className = 'card-grid';
      for (const i of idx) {
        const b = this.builtins[i];
        const rec = getRecord(b.key);
        const medal = rec ? medalFor(rec.time, b.def.medals) : null;
        const goal = goalFor(b.def, i);
        const gdone = goalDone(b.key + '#goal');
        const tags = this._trackTags(b.track);
        const pf = PROFILS[b.def.profil];
        const card = document.createElement('div');
        card.className = 'card ' + b.track.decor + (open ? '' : ' locked');
        card.tabIndex = 0;
        if (b.def.appris) card.title = b.def.appris;
        card.innerHTML = `<div class="num">${i + 1}</div>
          <img class="thumb" alt="" src="${thumbnail(b.track, 'b-' + b.key)}">
          <h3>${esc(b.def.name)}<span class="decor-chip" style="color:${DECORS[b.track.decor].chip}">${esc(DECORS[b.track.decor].label)}</span></h3>
          <div class="meta"><span class="diff">${'◆'.repeat(b.def.difficulty)}${'◇'.repeat(5 - b.def.difficulty)}</span> · ${b.track.tiles.length} pièces</div>
          ${tags.length || pf ? `<div class="tags">${pf ? `<span class="tag profil ${pf.cls}" title="${esc(pf.tip)}">${esc(pf.label)}</span>` : ''}${tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
          <div class="goal${gdone ? ' done' : ''}">★ ${esc(goalLabel(goal))}${gdone ? ' ✓' : ''}</div>
          <div class="best">${b.def.medals ? medalIcon(medal) : ''}${rec ? formatTime(rec.time) : '<span class="meta">Pas encore de temps</span>'}<button class="btn board-btn" data-board="1" title="Classement en ligne">🏆</button></div>
          ${open ? '' : '<div class="lock">🔒</div>'}`;
        card.querySelector('[data-board]').addEventListener('click', (e) => { e.stopPropagation(); this.audio.click(); this.leaderboardModal(b.key, b.def.name, b.track); });
        const go = () => {
          this.audio.click();
          if (!open) { this.ui.flash(`Chapitre verrouillé : gagne ${UNLOCK_MEDALS} médailles au chapitre ${ch}.`); this.audio.error(); return; }
          this.playBuiltin(i);
        };
        card.addEventListener('click', go);
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        grid.appendChild(card);
      }
      g.appendChild(grid);
      list.appendChild(g);
    }
  },

  _trackTags(track) {
    const tags = [];
    const has = (fn) => track.tiles.some(fn);
    if (has((t) => PIECES[t.t].kind === 'loop')) tags.push('Looping');
    if (has((t) => t.t === 'steep' || t.t === 'steep4')) tags.push('Sauts');
    if (has((t) => t.t === 'bank' || t.t === 'bankBig')) tags.push('Virage relevé');
    if (has((t) => t.t === 'tube' || t.t === 'tubeMid')) tags.push('Tube');
    if (has((t) => t.t === 'cork' || t.t === 'corkL')) tags.push('Tire-bouchon');
    if (has((t) => PIECES[t.t].kind === 'fork')) tags.push('Bifurcation');
    if (has((t) => PIECES[t.t].kind === 'ring')) tags.push('Anneaux');
    if (has((t) => t.t === 'wall' || t.o || PIECES[t.t].roll)) tags.push('Mur');
    if (has((t) => t.s === 'water' || t.s === 'boat')) tags.push('Bateau');
    if (has((t) => t.s === 'glider')) tags.push('Deltaplane');
    if (has((t) => t.s === 'moto')) tags.push('Moto');
    if (has((t) => t.s === 'ice')) tags.push('Verglas');
    if (has((t) => t.s === 'bounce')) tags.push('Rebond');
    if (has((t) => t.s === 'gravity')) tags.push('Gravité');
    if (has((t) => t.s === 'wind')) tags.push('Vent');
    if (has((t) => t.s === 'powder')) tags.push('Terrain');
    if (has((t) => t.tn)) tags.push('Tunnel');
    if (has((t) => t.nb && !t.o && !PIECES[t.t].roll)) tags.push('Sans bordures');     // les transitions de mur n'ont jamais de bordures : ce n'est pas un choix du créateur
    if ((track.laps || 1) > 1) tags.push(`${track.laps} tours`);
    return tags.slice(0, 6);
  },

  playDaily() {
    const t0 = performance.now();
    const c = dailyChallenge();
    if (!c) { this.ui.flash('Le défi du jour n’a pas pu être généré.'); return; }
    this.playTrack(c.track, { trackKey: c.key, medals: c.medals, difficulty: 3, seed: c.key, daily: true });
    if (performance.now() - t0 > 50) this.ui.flash('Nouveau défi du jour !', 1.5);
  },

  _renderMyTracks() {
    const list = $('my-list');
    list.innerHTML = '';
    const tracks = listMyTracks();
    if (!tracks.length) {
      list.innerHTML = '<div class="empty">Aucun circuit. Crée-en un ou importe un code.</div>';
      return;
    }
    for (const entry of tracks) {
      let track = null;
      try { track = Track.decode(entry.code); } catch { /* code abîmé */ }
      const rec = track ? getRecord(track.userKey) || getRecord('u-' + hashString(track.encode())) : null;
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `${track ? `<img class="thumb" alt="" src="${thumbnail(track, 'u-' + entry.code.length + '-' + hashString(entry.code))}">` : ''}
        <h3>${esc(entry.name)}</h3>
        <div class="meta">${track ? track.tiles.length : '?'} pièces${track && track.laps > 1 ? ` · ${track.laps} tours` : ''} · modifié le ${new Date(entry.updated || Date.now()).toLocaleDateString('fr-FR')}</div>
        <div class="best">${rec ? formatTime(rec.time) : '<span class="meta">Pas encore de temps</span>'}</div>
        <div class="actions">
          <button class="btn primary" data-a="play">Jouer</button>
          <button class="btn" data-a="edit">Éditer</button>
          <button class="btn" data-a="share">Partager</button>
          <button class="btn danger" data-a="del">Supprimer</button>
        </div>`;
      card.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        if (!a) return;
        this.audio.click();
        if (a.dataset.a === 'play') this.playCode(entry.code, entry.id);
        if (a.dataset.a === 'edit') this.openEditor({ code: entry.code, entryId: entry.id, name: entry.name });
        if (a.dataset.a === 'share') this.shareModal(entry.code, entry.name, track);
        if (a.dataset.a === 'del') {
          this.ui.modal({
            title: 'Supprimer ce circuit ?',
            body: `<p>« ${esc(entry.name)} » sera supprimé de ce navigateur.</p>`,
            actions: [
              { label: 'Annuler' },
              { label: 'Supprimer', danger: true, onClick: () => { deleteMyTrack(entry.id); this._renderMyTracks(); } },
            ],
          });
        }
      });
      list.appendChild(card);
    }
  },
};
