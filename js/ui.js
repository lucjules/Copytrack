// Interface DOM : écrans, HUD, fenêtres modales, notifications.
import { formatTime } from './storage.js';
import { MEDALS, medalFor } from './race.js';
import { keyLabel } from './input.js';
import { profile } from './profile.js';

export const $ = (id) => document.getElementById(id);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function medalIcon(m) {
  return `<i class="medal ${m ? m.id : 'none'}" title="${m ? m.label : 'Aucune médaille'}"></i>`;
}

const SCREENS = ['loading', 'menu', 'tracks', 'mytracks', 'options', 'controls', 'profile'];

class Hud {
  constructor() {
    this.el = {
      time: $('hud-time'), split: $('hud-split'), cp: $('hud-cp'), best: $('hud-best'),
      medals: $('hud-medals'), speed: $('hud-speed'), boost: $('hud-boost'), center: $('hud-center'),
      msg: $('hud-msg'), hint: $('hud-hint'), track: $('hud-track'),
    };
    this._last = {};
  }

  reset(session) {
    const e = this.el;
    e.track.textContent = session.track.name;
    this.checkpoints(0, session.logic.cps.length);
    const rec = session.record;
    e.best.innerHTML = rec ? `Record ${formatTime(rec.time)}` : 'Pas encore de record';
    const medals = session.medals;
    if (medals) {
      e.medals.innerHTML = MEDALS.map((m) => {
        const got = rec && rec.time <= medals[m.id];
        return `<div class="${got ? 'got' : ''}">${medalIcon(m)}${formatTime(medals[m.id])}</div>`;
      }).join('');
    } else e.medals.innerHTML = '';
    e.split.textContent = '';
    e.center.textContent = '';
    e.msg.classList.remove('on');
    this.time(0);
    const inp = session.app.input;
    const k = (id) => (inp.bindings[id] || []).filter(Boolean).map(keyLabel).join(' / ') || '—';
    e.hint.textContent = `${k('accelerate')} ${k('brake')} ${k('left')} ${k('right')} · ${k('drift')} : dérapage · ${k('respawn')} : dernier checkpoint · ${k('restart')} : recommencer · ${k('camera')} : caméra · ${k('pause')} : pause`;
    e.hint.style.opacity = '1';
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => { e.hint.style.opacity = '0'; }, 7000);
  }

  time(t, final = false) {
    const txt = formatTime(t);
    if (txt !== this._last.time) { this.el.time.textContent = txt; this._last.time = txt; }
    this.el.time.style.color = final ? 'var(--good)' : '';
  }

  split(diff, t) {
    const e = this.el.split;
    clearTimeout(this._splitT);
    if (diff == null) {
      e.className = 'hud-split';
      e.textContent = formatTime(t);
    } else {
      e.className = 'hud-split ' + (diff <= 0 ? 'good' : 'bad');
      e.textContent = formatTime(diff, true);
    }
    e.style.opacity = '1';
    this._splitT = setTimeout(() => { e.style.opacity = '0'; }, 2600);
  }

  checkpoints(n, m) {
    this.el.cp.textContent = m ? `◆ ${n} / ${m}` : '◆ —';
  }

  speed(kmh, boost) {
    const v = Math.round(kmh);
    if (v !== this._last.speed) { this.el.speed.textContent = v; this._last.speed = v; }
    const b = Math.round((boost / 1.6) * 100);
    if (b !== this._last.boost) { this.el.boost.style.width = b + '%'; this._last.boost = b; }
  }

  center(text, pop = false) {
    const e = this.el.center;
    e.textContent = text;
    if (pop) { e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }
  }

  message(text, dur = 1.5) {
    const e = this.el.msg;
    e.textContent = text;
    e.classList.add('on');
    clearTimeout(this._msgT);
    this._msgT = setTimeout(() => e.classList.remove('on'), dur * 1000);
  }
}

export class UI {
  constructor(app) {
    this.app = app;
    this.hud = new Hud();
  }

  showScreen(name) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
    $('coins').classList.toggle('hidden', !['menu', 'tracks', 'mytracks', 'profile'].includes(name));
    const first = name && $(name).querySelector('button');
    if (first && matchMedia('(pointer: fine)').matches) first.focus({ preventScroll: true });
  }

  updateCoins() {
    const c = $('coins');
    if (c) c.textContent = `◆ ${profile().coins}`;
  }

  setMode(mode) {
    const showCoins = mode === 'menu';
    $('coins').classList.toggle('hidden', !showCoins);
    this.updateCoins();
    $('hud').classList.toggle('hidden', mode !== 'race');
    $('editor').classList.toggle('hidden', mode !== 'editor');
    $('touch').classList.toggle('hidden', !(mode === 'race' && document.body.classList.contains('touch')));
    this.hideOverlay('pause');
    this.hideOverlay('finish');
  }

  showOverlay(id) {
    $(id).classList.remove('hidden');
    const b = $(id).querySelector('.btn.primary');
    if (b && matchMedia('(pointer: fine)').matches) b.focus({ preventScroll: true });
  }

  hideOverlay(id) {
    $(id).classList.add('hidden');
  }

  flash(text, dur = 2.4) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('on'), dur * 1000);
  }

  // actions : [{ label, primary, danger, onClick }] ; onClick renvoie false pour garder la fenêtre ouverte.
  modal({ title, body, actions = [] }) {
    $('modal-title').textContent = title;
    const b = $('modal-body');
    b.innerHTML = '';
    if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
    const a = $('modal-actions');
    a.innerHTML = '';
    for (const act of actions) {
      const btn = document.createElement('button');
      btn.className = 'btn' + (act.primary ? ' primary' : '') + (act.danger ? ' danger' : '');
      btn.textContent = act.label;
      btn.addEventListener('click', () => {
        this.app.audio.click();
        const keep = act.onClick ? act.onClick() === false : false;
        if (!keep) this.closeModal();
      });
      a.appendChild(btn);
    }
    $('modal').classList.remove('hidden');
    this.modalOpen = true;
  }

  closeModal() {
    $('modal').classList.add('hidden');
    this.modalOpen = false;
  }

  showFinish(info) {
    $('fin-title').textContent = info.isRecord ? (info.prevTime == null ? 'Premier temps !' : 'Nouveau record !') : 'Arrivée !';
    $('fin-title').className = info.isRecord ? 'fin-record' : '';
    $('fin-time').textContent = formatTime(info.time);
    $('fin-medal').innerHTML = info.medals ? medalIcon(info.medal) : '';
    const lines = [];
    if (info.prevTime != null) {
      const d = info.time - info.prevTime;
      lines.push(`Ancien record : <b>${formatTime(info.prevTime)}</b> (${formatTime(d, true)})`);
    }
    if (info.medals) {
      if (info.medal) lines.push(`${info.newMedal ? 'Médaille obtenue' : 'Médaille'} : <b>${info.medal.label}</b>`);
      const best = Math.min(info.time, info.prevTime ?? Infinity);
      const next = [...MEDALS].reverse().find((m) => best > info.medals[m.id]);
      if (next) lines.push(`Prochain objectif : ${medalIcon(next)}<b>${formatTime(info.medals[next.id])}</b>`);
      else lines.push('Toutes les médailles sont à toi ✦');
    }
    const rw = $('fin-reward');
    if (info.reward) {
      rw.innerHTML = `+${info.reward.coins} ◆ pièces${info.reward.first ? '<small>Bonus : première fois à ce niveau de médaille ×2</small>' : ''}`;
    } else if (info.verified) {
      rw.innerHTML = 'Circuit vérifié ✔<small>Ton temps devient la médaille bronze, les autres sont déduites.</small>';
    } else if (info.unverifiedUser) {
      rw.innerHTML = '<small>Circuit non vérifié : pas de médailles ni de pièces.</small>';
    } else rw.innerHTML = '';
    if (info.verified && info.derived) {
      lines.push(MEDALS.slice().reverse().map((m) => `${medalIcon(m)}<b>${formatTime(info.derived[m.id])}</b>`).join(' · '));
    }
    $('fin-detail').innerHTML = lines.join('<br>');
    $('fin-next').classList.toggle('hidden', !info.hasNext);
    $('fin-quit').textContent = info.fromEditor ? 'Retour à l’éditeur' : 'Menu';
    this.showOverlay('finish');
  }
}

export { medalFor };
