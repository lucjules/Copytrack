// Race Hub : la fiche d'un circuit, avant de courir. Chaque sélection de circuit y mène (carrière, défi du jour, mes circuits, communauté,
// favoris) ; « Jouer » lance la course avec les options du descripteur (trackDescriptor.js), sans rien recalculer.
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
//
// Hiérarchie : en-tête (nom, décor, source, favori), grande mini-carte (ui/trackMap.js), puis à côté : lancement (record, fantômes, Jouer),
// classement à onglets (ui/leaderboardPanel.js : seuls les onglets dont les données existent), records à regarder.
// Tout ce qui est local s'affiche tout de suite ; le classement en ligne arrive ensuite, dans son panneau. Rien n'attend le réseau pour jouer.
import { $, esc } from '../dom.js';
import { RaceSession } from '../race.js';
import { Track } from '../track.js';
import { DECORS } from '../themes.js';
import { PHYS_VER } from '../version.js';
import { medalFor, MEDALS } from '../medals.js';
import { medalIcon } from '../ui.js';
import { online } from '../online.js';
import { dailyChallenge } from '../daily.js';
import { dailyMutation, streakOf } from '../mutations.js';
import { MUTATION_COINS, STREAK_STEPS } from '../rewards.js';
import { goalLabel, goalDone, PROFILS } from '../career.js';
import { starsText, STAR_LABELS } from '../difficulty.js';
import { getRecord, getImportedGhost, listMyTracks, formatTime } from '../storage.js';
import { profile, saveProfile } from '../profile.js';
import { isFavorite, toggleFavorite, cleanFavorites } from '../favorites.js';
import { describeDaily, describeUser, describeCommunity, personalRecord, quickRaceIndex, describeVariant, hubCategories } from '../trackDescriptor.js';
import { createTrackMap } from '../ui/trackMap.js';
import { isTraining } from '../hudProfile.js';
import { SURFACES } from '../pieces.js';
import { mountLeaderboard } from '../ui/leaderboardPanel.js';
import { thumbnail } from '../editorTools.js';

const MAX_RIVALS = 3;
const WIND_LABEL = ['vers le nord', 'vers le nord-est', 'vers l’est', 'vers le sud-est', 'vers le sud', 'vers le sud-ouest', 'vers l’ouest', 'vers le nord-ouest'];
const SOURCE_LABEL = { builtin: 'Carrière', daily: 'Défi du jour', user: 'Mes circuits', community: 'Communauté' };
const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${m} m`);

// Référence de favori d'un descripteur (favorites.js), ou '' s'il ne peut pas en être un (défi du jour, code ouvert sans être enregistré).
export function favRefOf(desc) {
  if (desc.source === 'builtin') return desc.builtinId ? 'b:' + desc.builtinId : '';
  if (desc.source === 'user' && desc.entryId) return 'm:' + desc.entryId;
  if (desc.source === 'community' && desc.communityId) return 'c:' + desc.communityId;
  return '';
}

export const raceHubMethods = {
  // Lance une course à partir d'un descripteur : c'est le seul chemin (cartes, hub, circuit suivant, course rapide). extra : fromHub, rivals.
  launchDesc(desc, extra = {}) {
    this._lastDesc = desc;
    this.playTrack(desc.track, { ...desc.launch, ...extra });
    if (desc.communityId && this.session instanceof RaceSession) online.played(desc.communityId).catch(() => { /* hors ligne : le compteur attendra */ });
  },

  // from : l'écran où revenir (tracks, mytracks, community, menu).
  openRaceHub(desc, { from = 'tracks' } = {}) {
    if (this._hub && this._hub.map) this._hub.map.dispose();
    this._hub = { desc, base: desc.official || desc, from, rivals: new Map(), map: null, board: null };
    this.showScreen('race-hub');
    const play = $('hub-play');
    if (play && !play.disabled && matchMedia('(pointer: fine)').matches) play.focus({ preventScroll: true });
  },

  closeRaceHub() {
    const h = this._hub;
    if (h && h.map) { h.map.dispose(); h.map = null; }
    this.showScreen(h ? h.from : 'tracks');
  },

  // Après une course ou un replay lancé du hub : retour au menu (scène de démonstration), puis à la fiche.
  _backToHub(desc, from) {
    this.showMenu(from);
    this.openRaceHub(desc, { from });
  },

  _renderHub() {
    const h = this._hub;
    if (!h) return;
    const d = h.desc;
    const dec = DECORS[d.decor] || {};
    $('hub-name').textContent = d.name;
    const src = d.source === 'builtin' ? `${SOURCE_LABEL.builtin} · Circuit ${d.index + 1}` : d.source === 'daily' ? `${SOURCE_LABEL.daily} · ${String(d.day || '').split('-').reverse().join('/')}`
      : d.source === 'community' && d.author ? `${SOURCE_LABEL.community} · par ${d.author}` : SOURCE_LABEL[d.source] || '';
    $('hub-sub').innerHTML = `<span class="decor-chip" style="color:${dec.chip || 'inherit'}">${esc(dec.label || d.decor)}</span> <span>${esc(src)}</span>`;
    this._renderHubFav();
    this._renderHubFacts();
    this._renderHubMap();
    this._renderHubLaunch();
    this._renderHubRecords();
    h.board = mountLeaderboard($('hub-board'), d, {
      app: this,
      rivalOn: (rank) => h.rivals.has(rank),
      onRival: (row, rank, btn) => this._toggleHubRival(row, rank, btn),
      onChange: () => this._renderHubRecords(),
    }, { tab: h.board ? h.board.tab : null });
  },

  _renderHubFav() {
    const d = this._hub.desc, btn = $('hub-fav'), ref = favRefOf(d);
    btn.classList.toggle('hidden', !ref);
    if (!ref) return;
    const on = isFavorite(profile(), ref);
    btn.textContent = on ? '★ Favori' : '☆ Favori';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Retirer des favoris' : 'Ajouter aux favoris (Circuits › Favoris)';
  },

  toggleHubFavorite() {
    const d = this._hub && this._hub.desc;
    const ref = d && favRefOf(d);
    if (!ref) return;
    const on = toggleFavorite(profile(), ref, d.name);
    saveProfile();
    this.audio.click();
    this.ui.flash(on ? `« ${d.name} » ajouté aux favoris.` : `« ${d.name} » retiré des favoris.`, 1.6);
    this._renderHubFav();
  },

  _renderHubFacts() {
    const d = this._hub.desc;
    const rows = [];
    if (d.stars) rows.push(['Difficulté', `<span class="diff" title="${esc(STAR_LABELS[d.stars] || '')}">${starsText(d.stars)}</span>${d.source === 'builtin' ? '' : ' <small class="meta">estimée</small>'}`]);
    rows.push([d.lengthKind === 'race' ? 'Distance de course' : 'Longueur de piste', `${d.lengthKind === 'race' ? '' : '≈ '}${km(d.lengthM)}`]);
    if (d.laps > 1) rows.push(['Tours', String(d.laps)]);
    rows.push(['Pièces', String(d.tiles)]);
    if (d.profil && PROFILS[d.profil]) rows.push(['Profil', esc(PROFILS[d.profil].label)]);
    if (d.track.grip !== 100) rows.push(['Adhérence', `${d.track.grip} %`]);
    if (d.track.wind) rows.push(['Vent', `${d.track.wind} % · ${WIND_LABEL[Math.round(d.track.windDir / 45) % 8]}`]);
    if (d.source === 'community') rows.push(['Joué', `▶ ${d.plays} · ♥ ${d.likes}`]);
    if (d.medals) rows.push(['Médailles', `<span class="hub-medals">${MEDALS.map((m) => `<span title="${esc(m.label)}">${medalIcon(m)} ${formatTime(d.medals[m.id])}</span>`).join('')}</span>`]);
    if (d.goal) { const done = goalDone(d.goalKey); rows.push(['Objectif bonus', `<span class="${done ? 'goal-done' : ''}">★ ${esc(goalLabel(d.goal))}${done ? ' ✓' : ''}</span>`]); }
    $('hub-facts').innerHTML = `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>${d.desc ? `<p class="hub-desc">${esc(d.desc)}</p>` : ''}${d.learn ? `<p class="hub-desc meta">${esc(d.learn)}</p>` : ''}`;
  },

  _renderHubMap() {
    const h = this._hub, cv = $('hub-map');
    if (h.map) h.map.dispose();
    h.map = createTrackMap(cv, h.desc.track);
    const z = h.map.geom.zones, M = h.map.geom.markers;
    const items = [['#2fd3b5', 'Départ'], ['#ff4f9a', 'Arrivée']];
    if (M.checkpoints.length) items.push(['#ffbf3c', `Checkpoints (${M.checkpoints.length})${M.checkpoints.some((c) => c.n) ? '' : ' · dans l’ordre de ton choix'}`]);
    for (const s of z) items.push([SURFACES[s].c[1], SURFACES[s].label]);
    if (M.movers.length) items.push(['#ff7ad9', 'Pièces mobiles']);
    if (M.obstacles.length) items.push(['#ff3b3b', 'Obstacles']);
    $('hub-legend').innerHTML = items.map(([c, l]) => `<li><i style="background:${c}"></i>${esc(l)}</li>`).join('');
  },

  _renderHubLaunch() {
    const h = this._hub, d = h.desc, s = this.settings;
    const rec = personalRecord(d, getRecord);
    const medal = rec && d.medals ? medalFor(rec.time, d.medals) : null;
    const chips = [['ghost', 'Mon record', s.ghost !== false, !!rec]];
    if (d.track.path && d.medals) chips.push(['ghostGold', 'Fantôme or', s.ghostGold !== false, true]);
    if (d.key && getImportedGhost(d.key)) chips.push(['ghostImported', 'Fantôme importé', s.ghostImported !== false, true]);
    const rivals = [...h.rivals.entries()].sort((a, b) => a[0] - b[0]);
    const cats = hubCategories(h.base);
    const train = isTraining(s.hudProfile);
    $('hub-launch').innerHTML = `${d.source === 'daily' ? this._hubDailyBox(d) : ''}<div class="hub-pb">${rec ? `<span class="meta">Mon record</span><b>${medal ? medalIcon(medal) + ' ' : ''}${formatTime(rec.time)}</b>` : '<span class="meta">Pas encore de temps : à toi d’ouvrir la voie.</span>'}</div>
      <div class="hub-ghosts" role="group" aria-label="Fantômes"><span class="meta">Fantômes</span>
        ${chips.map(([k, l, on, ok]) => `<button class="chip${on ? ' on' : ''}" data-ghost="${k}" aria-pressed="${on}"${ok ? '' : ' disabled title="Pas encore de record sur ce circuit"'}>${esc(l)}</button>`).join('')}
        ${rivals.map(([rank, g]) => `<button class="chip on rival" data-rival="${rank}" aria-pressed="true" title="Retirer ce rival">👻 ${rank}. ${esc(g.name)} · ${formatTime(g.time)} ✕</button>`).join('')}
        <button class="chip${train ? ' on' : ''}" data-hudtrain aria-pressed="${train}" title="Écart en direct, secteurs, courbes, ligne et freinages de la référence (Options › Personnalisation)">🎯 HUD d’entraînement</button>
      </div>
      ${rivals.length < MAX_RIVALS && h.board && h.board.boards.some((b) => b.id === 'world') ? '<p class="meta hub-hint">Ajoute jusqu’à 3 rivaux en ligne avec 👻 dans le classement mondial.</p>' : ''}
      ${cats.length ? `<div class="hub-cats" role="radiogroup" aria-label="Catégorie de record"><span class="meta">Catégorie de record</span>
        <button class="chip${d.variant ? '' : ' on'}" role="radio" aria-checked="${!d.variant}" data-cat="">🏁 Officiel</button>
        ${cats.map((c) => { const on = d.variantStr && d.key.endsWith('~v1.' + c.id); return `<button class="chip${on ? ' on' : ''}" role="radio" aria-checked="${!!on}" data-cat="${c.id}">${esc(c.label)}</button>`; }).join('')}
        ${d.variant ? '<p class="meta hub-hint">Classement et record à part, sans médailles ni pièces : le record officiel ne bouge pas.</p>' : ''}</div>` : ''}
      ${d.locked ? `<p class="hub-lock" role="status">🔒 ${esc(d.locked)}</p>` : ''}
      <button class="btn big primary hub-play" id="hub-play"${d.locked ? ' disabled' : ''}>▶ Jouer <kbd>Entrée</kbd></button>`;
    for (const b of $('hub-launch').querySelectorAll('[data-ghost]')) b.onclick = () => {
      this.audio.click();
      const k = b.dataset.ghost;
      s[k] = s[k] === false;
      this.saveSettings();
      this._renderHubLaunch();
    };
    for (const b of $('hub-launch').querySelectorAll('[data-rival]')) b.onclick = () => { this.audio.click(); h.rivals.delete(+b.dataset.rival); this._renderHubLaunch(); if (h.board) h.board.refresh(); };
    for (const b of $('hub-launch').querySelectorAll('[data-cat]')) b.onclick = () => {
      this.audio.click();
      const c = cats.find((x) => x.id === b.dataset.cat);
      this._setHubCategory(c ? c.v : null);
    };
    $('hub-launch').querySelector('[data-hudtrain]').onclick = () => {
      this.audio.click();
      if (isTraining(s.hudProfile)) this.setHudProfile(this._hudBeforeTraining || 'classic');
      else { this._hudBeforeTraining = s.hudProfile; this.setHudProfile('training'); }
      this._renderHubLaunch();
    };
    $('hub-play').onclick = () => this.hubPlay();
  },

  // Défi du jour 2 (E13) : la série de jours et la mutation du jour (une catégorie de record, proposée en tête des catégories).
  _hubDailyBox(d) {
    const p = profile(), st = streakOf(p.dailyDays), best = Math.max(p.dailyBest | 0, st.best);
    const next = STREAK_STEPS.find(([n]) => n > best);
    const M = (d.official || d).mutation, mutDone = M && Array.isArray(p.mutDays) && p.mutDays.includes(M.day);
    return `<div class="hub-daily">
      <p class="hub-streak"><span>🔥 Série : <b>${st.current} jour${st.current > 1 ? 's' : ''}</b></span>${st.today ? ' <span>(défi du jour fait)</span>' : st.current ? ' <span>— termine le défi aujourd’hui pour la prolonger</span>' : ''}
        <span>· meilleure : ${best}</span>${next ? ` <span>· prochain palier : ${next[0]} jours (+${next[1]} ◆)</span>` : ''}</p>
      ${M ? `<p class="hub-mutation"><span>${M.icon}</span> <span>Mutation du jour : <b>${esc(M.label)}</b></span> — <span>${esc(M.desc)}</span> <span>${mutDone ? '✓ terminée aujourd’hui' : `+${MUTATION_COINS} ◆ à la première arrivée`}</span></p>` : ''}</div>`;
  },

  // Catégorie de record (variante) : même fiche, autre clé de classement ; les rivaux choisis appartenaient à l'autre classement.
  _setHubCategory(v) {
    const h = this._hub;
    if (!h) return;
    h.desc = v ? describeVariant(h.base, v) : h.base;
    h.rivals.clear();
    this._renderHub();
    const b = $('hub-launch').querySelector('[data-cat][aria-checked="true"]');
    if (b) b.focus({ preventScroll: true });
  },

  async _toggleHubRival(row, rank, btn) {
    const h = this._hub;
    if (!h) return;
    if (h.rivals.has(rank)) h.rivals.delete(rank);
    else {
      if (h.rivals.size >= MAX_RIVALS) throw new Error('Trois rivaux au plus : retires-en un d’abord.');
      const g = await online.ghost(h.desc.key, rank, PHYS_VER);
      if (!g) throw new Error('Pas de fantôme pour ce temps (record d’avant cette fonction : son auteur doit le renvoyer).');
      if (this._hub !== h) return;
      h.rivals.set(rank, g);
    }
    if (btn) { const on = h.rivals.has(rank); btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    this._renderHubLaunch();
  },

  hubPlay() {
    const h = this._hub;
    if (!h || h.desc.locked) { this.audio.error(); return; }
    this.audio.click();
    const rivals = [...h.rivals.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g);
    if (h.map) { h.map.dispose(); h.map = null; }
    this.launchDesc(h.desc, { fromHub: h.from, ...(rivals.length ? { rivals } : {}) });
    if (h.desc.variant) { const c = hubCategories(h.base).find((x) => h.desc.key.endsWith('~v1.' + x.id)); if (c) this.ui.flash(`Catégorie : ${c.label} · classement à part`, 2.2); }
  },

  _renderHubRecords() {
    const d = this._hub.desc;
    const rec = personalRecord(d, getRecord);
    const can = !!(rec && rec.inputs && rec.pv === PHYS_VER);
    const h = this._hub, ranked = d.key && /^(b-|daily-|u-)/.test(d.key);
    const opts = [['', 'Rien'], ...(d.track.path ? [['gold', 'Le fantôme or']] : []), ...(ranked ? [['world', 'Le record mondial']] : []), ...(h.rivals.size ? [['rivals', `Mes rivaux choisis (${h.rivals.size})`]] : [])];
    if (!opts.some(([k]) => k === h.compare)) h.compare = '';
    $('hub-records').innerHTML = `<h3>Records</h3>
      <label class="hub-cmp"><span>Comparer avec</span><select id="hub-cmp"${can ? '' : ' disabled'}>${opts.map(([k, l]) => `<option value="${k}"${k === h.compare ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <button class="btn" id="hub-watch"${can ? '' : ' disabled'}>🎬 Regarder mon record${rec ? ` (${formatTime(rec.time)})` : ''}</button>
      <p class="meta">${can ? 'Replay Theater : ta course exacte, une barre de temps pour aller et venir, caméras libre et cinématique, et l’analyse (trajectoires, vitesses, secteurs) face à la course choisie.' : rec ? 'Ce record vient d’une ancienne version du jeu : il ne se rejoue plus.' : 'Termine une course pour pouvoir la revoir.'}</p>`;
    if (can) {
      $('hub-cmp').onchange = (e) => { h.compare = e.target.value; };
      $('hub-watch').onclick = () => { this.audio.click(); this.watchRecord(d, rec, h.compare); };
    }
  },

  // Replay Theater du record personnel (commandes enregistrées : la course exacte), comparé à `cmp` ('' | 'gold' | 'world' | 'rivals'), puis retour à la fiche.
  async watchRecord(desc, rec, cmp = '') {
    const h = this._hub, from = h ? h.from : 'tracks';
    const compare = [];
    if (cmp === 'gold') compare.push({ kind: 'gold', label: 'Fantôme or' });
    if (cmp === 'rivals' && h) for (const [rank, g] of [...h.rivals.entries()].sort((a, b) => a[0] - b[0])) compare.push({ kind: 'ghost', label: `${rank}. ${g.name}`, ghost: g.ghost, veh: g.veh, time: g.time });
    if (cmp === 'world') {
      try {
        const g = await online.ghost(desc.key, 1, PHYS_VER);
        if (g) compare.push({ kind: 'ghost', label: `1. ${g.name}`, ghost: g.ghost, veh: g.veh, time: g.time });
        else this.ui.flash('Pas de fantôme pour le record mondial : replay seul.', 2.5);
      } catch (e) { this.ui.flash(`Record mondial indisponible (${e.message}) : replay seul.`, 3); }
      if (this._hub !== h) return;
    }
    if (h && h.map) { h.map.dispose(); h.map = null; }
    this.openTheater({ track: desc.track, opts: desc.launch, main: { inputs: rec.inputs, time: rec.time, label: 'Mon record' }, compare, back: { hub: desc, from }, panel: compare.length > 0 });
  },

  // Fiche du circuit de la course en cours (écran d'arrivée).
  openSessionHub() {
    const s = this.session, d = this._lastDesc;
    if (!s || !d || !s.opts || d.key !== s.opts.trackKey) return;
    const from = s.opts.fromHub || (d.source === 'user' ? 'mytracks' : d.source === 'community' ? 'community' : 'tracks');
    this._backToHub(d, from);
  },

  // ---- Points d'entrée ---------------------------------------------------------------------------------------------------------------
  openBuiltinHub(i, from = 'tracks') { this.openRaceHub(this.describeBuiltin(i), { from }); },

  openDailyHub(from = 'menu') {
    const c = dailyChallenge();
    if (!c) { this.ui.flash('Le défi du jour n’a pas pu être généré.'); return; }
    if (from === 'menu') this.showMenu('menu');
    let m = null;
    try { m = dailyMutation(c.day); } catch { m = null; }
    this.openRaceHub(describeDaily(c, m), { from });
  },

  openUserHub(entry, from = 'mytracks') {
    let track;
    try { track = Track.decode(entry.code); } catch { this.ui.flash('Code de circuit invalide.'); return; }
    this.openRaceHub(describeUser(track, entry), { from });
  },

  openCommunityHub(row, from = 'community') {
    let track;
    try { track = Track.decode(row.code); } catch { this.ui.flash('Ce circuit est abîmé : impossible de l’ouvrir.'); return; }
    this.openRaceHub(describeCommunity(track, row), { from });
  },

  async openFavorite(fav) {
    const [kind, id] = [fav.ref.slice(0, 1), fav.ref.slice(2)];
    if (kind === 'b') {
      const i = this.builtins.findIndex((b) => b.def.id === id);
      if (i < 0) { this.ui.flash('Ce circuit n’existe plus.'); return; }
      this.openBuiltinHub(i, 'tracks');
    } else if (kind === 'm') {
      const e = listMyTracks().find((t) => t.id === id);
      if (!e) { this.ui.flash('Ce circuit a été supprimé de Mes circuits.'); return; }
      this.openUserHub(e, 'tracks');
    } else if (kind === 'c') {
      this.ui.flash('Ouverture…', 0.8);
      let row;
      try { row = await online.trackById(id); } catch (e) { this.ui.flash(`Communauté indisponible : ${e.message}`); return; }
      if (!row) { this.ui.flash('Ce circuit a été retiré de la communauté.'); return; }
      this.openCommunityHub(row, 'tracks');
    }
  },

  // Course rapide : le prochain circuit de la carrière sans médaille, sinon le défi du jour. Un clic, pas de fiche.
  quickRace() {
    const i = quickRaceIndex(this.builtins, getRecord);
    if (i != null) { this.ui.flash(`Course rapide : ${this.builtins[i].def.name}`, 1.8); this.playBuiltin(i); return; }
    const c = dailyChallenge();
    if (!c) { this.ui.flash('Le défi du jour n’a pas pu être généré.'); return; }
    this.ui.flash('Course rapide : toute la carrière est médaillée, voici le défi du jour !', 2.4);
    this.launchDesc(describeDaily(c));
  },

  // Groupe « Favoris » en tête de l'écran Circuits.
  _renderFavorites(list) {
    const favs = cleanFavorites(profile().favorites);
    if (!favs.length) return;
    const box = document.createElement('div');
    box.className = 'track-group fav-group';
    box.innerHTML = '<h3 class="group-title"><i style="background:#ffbf3c"></i>★ Favoris</h3>';
    const grid = document.createElement('div');
    grid.className = 'card-grid fav-grid';
    const mine = listMyTracks();
    for (const f of favs) {
      const kind = f.ref.slice(0, 1), id = f.ref.slice(2);
      let img = '', sub = '';
      if (kind === 'b') { const b = this.builtins.find((x) => x.def.id === id); if (!b) continue; img = thumbnail(b.track, 'b-' + b.key); sub = 'Carrière'; }
      else if (kind === 'm') { const e = mine.find((t) => t.id === id); if (!e) continue; try { img = thumbnail(Track.decode(e.code), 'm-' + e.id + '-' + e.code.length); } catch { img = ''; } sub = 'Mes circuits'; }
      else sub = 'Communauté · en ligne';
      const card = document.createElement('div');
      card.className = 'card fav-card';
      card.tabIndex = 0;
      card.innerHTML = `${img ? `<img class="thumb" alt="" src="${img}">` : '<div class="thumb fav-online">🌐</div>'}<h3>${esc(f.name || '—')}</h3><div class="meta">${esc(sub)}</div>`;
      const go = () => { this.audio.click(); this.openFavorite(f); };
      card.addEventListener('click', go);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      grid.appendChild(card);
    }
    if (!grid.children.length) return;
    box.appendChild(grid);
    list.appendChild(box);
  },
};
