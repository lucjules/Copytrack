// Garage : personnalisation purement visuelle du véhicule (forme, couleurs, LED,
// dessins, ornements, ailerons, roues). Aucune option ne change les performances.
import * as THREE from './vendor/three.module.min.js';
import { Track } from './track.js';
import { TrackView } from './trackMesh.js';
import { createCar } from './carModel.js';
import {
  CATALOG, COLOR_CHOICES, PRESETS, THEMES, PALETTES, sanitizeLoadout, exclusiveOf,
} from './cosmetics.js';
import { COLLECTIONS, COLLECTION_COINS, collectionProgress } from './rewards.js';
import { profile, saveProfile, owns, missingItems, totalCost, buy, setLoadout } from './profile.js';
import { $, esc } from './dom.js';
import { DEFAULT_DECOR } from './themes.js';
import { studioMethods } from './garage/studio.js';

export class GarageSession {
  constructor(app) {
    this.app = app;
    this.track = new Track('Garage');
    this.track.add({ t: 'platform', x: 0, z: 0, l: 0, r: 0 });
    this.track.decor = DEFAULT_DECOR;
    this.view = new TrackView(this.track, app.materials);
    app.scenery.trackGroup.add(this.view.group);
    app.scenery.setTrack(this.track, 'garage', { decor: true });

    this.draft = sanitizeLoadout(profile().loadout);
    this.moto = false;
    this.cat = 'body';
    this.angle = 0.6;
    this.pitch = 0.28;
    this.dist = 9;
    this.drag = null;
    this.car = null;
    this._rebuildCar();

    this._h = {
      down: (e) => { this.drag = { x: e.clientX, y: e.clientY }; this.idle = 3; },
      move: (e) => {
        if (!this.drag) return;
        this.angle -= (e.clientX - this.drag.x) * 0.008;
        this.pitch = Math.max(0.05, Math.min(1.1, this.pitch + (e.clientY - this.drag.y) * 0.004));
        this.drag = { x: e.clientX, y: e.clientY };
      },
      up: () => { this.drag = null; },
      wheel: (e) => { e.preventDefault(); this.dist = Math.max(5, Math.min(18, this.dist * Math.pow(1.001, e.deltaY))); },
    };
    const el = app.renderer.domElement;
    el.addEventListener('pointerdown', this._h.down);
    window.addEventListener('pointermove', this._h.move);
    window.addEventListener('pointerup', this._h.up);
    el.addEventListener('wheel', this._h.wheel, { passive: false });

    app.camera.fov = 45;
    app.camera.up.set(0, 1, 0);
    app.camera.updateProjectionMatrix();
    this.idle = 0;
    this._render();
  }

  _rebuildCar() {
    if (this.car) this.car.dispose();
    this.app.audio.setVoice(this.draft.custom.fx);
    this.car = createCar(this.draft, { moto: this.moto });
    this.car.group.position.set(12, 0.4, 12);
    this.car.group.rotation.y = Math.PI;
    this.app.scene.add(this.car.group);
  }

  // Tente d'enregistrer l'équipement : seulement si tout est débloqué.
  _commitDraft() {
    if (missingItems(this.draft).length === 0) {
      setLoadout(this.draft);
      return true;
    }
    return false;
  }

  setDraft(patch) {
    this.draft = sanitizeLoadout({ ...this.draft, ...patch });
    this._rebuildCar();
    this._commitDraft();
    this._render();
    this.app.audio.click();
  }

  toggleMoto() {
    this.moto = !this.moto;
    this.car.setMoto(this.moto);
    this.app.audio.transform();
    this._render();
  }

  // ---------------------------------------------------------------- Interface
  _card(label, sub, opts = {}) {
    const b = document.createElement('button');
    b.className = 'gcard' + (opts.on ? ' on' : '') + (opts.locked ? ' locked' : '');
    b.innerHTML = `<span class="gl">${esc(label)}</span><span class="gs">${sub}</span>`;
    return b;
  }

  _render() {
    const p = profile();
    $('garage-coins').textContent = `◆ ${p.coins}`;
    document.querySelectorAll('#garage-tabs .tab').forEach((t) => t.classList.toggle('on', t.dataset.cat === this.cat));
    $('garage-moto').classList.toggle('on', this.moto);
    const list = $('garage-list');
    list.innerHTML = '';

    if (this.cat === 'colors') {
      for (const [key, label] of [['color', 'Peinture'], ['color2', 'Secondaire'], ['decalColor', 'Dessins']]) {
        const row = document.createElement('div');
        row.className = 'crow';
        row.innerHTML = `<b>${label}</b>`;
        const sw = document.createElement('div');
        sw.className = 'swatches';
        for (const c of COLOR_CHOICES) {
          const s = document.createElement('button');
          s.className = 'swatch' + (this.draft[key].toLowerCase() === c ? ' on' : '');
          s.style.background = c;
          s.onclick = () => this.setDraft({ [key]: c });
          sw.appendChild(s);
        }
        const custom = document.createElement('input');
        custom.type = 'color';
        custom.value = this.draft[key];
        custom.className = 'cpick';
        custom.title = 'Couleur personnalisée';
        custom.oninput = () => { this.draft[key] = custom.value; this._rebuildCar(); this._commitDraft(); };
        sw.appendChild(custom);
        row.appendChild(sw);
        list.appendChild(row);
      }
      // Palettes de thème (0.9.57) : peinture, secondaire et dessins d'un coup (gratuit, visuel seulement).
      const ph = document.createElement('div');
      ph.className = 'ghead';
      ph.textContent = 'Palettes : un clic règle les trois couleurs';
      list.appendChild(ph);
      for (const pal of PALETTES) {
        const th = THEMES.find((x) => x.id === pal.theme);
        const [c1, c2, c3] = pal.colors;
        const on = this.draft.color.toLowerCase() === c1 && this.draft.color2.toLowerCase() === c2 && this.draft.decalColor.toLowerCase() === c3;
        const c = this._card(pal.label, 'Palette', { on });
        const dots = document.createElement('span');
        dots.className = 'gpal';
        dots.innerHTML = (th ? `<i class="gic">${th.icon}</i>` : '') + pal.colors.map((k) => `<i style="background:${k}"></i>`).join('');
        c.appendChild(dots);
        c.onclick = () => { this.setDraft({ color: c1, color2: c2, decalColor: c3 }); this.app.audio.click(); };
        list.appendChild(c);
      }
    } else if (this.cat === 'studio') {
      this._renderStudio(list);
    } else if (this.cat === 'collections') {
      const h0 = document.createElement('div');
      h0.className = 'ghead';
      h0.textContent = `Quatre éléments qui vont ensemble : les posséder tous rapporte ${COLLECTION_COINS} ◆ (une fois)`;
      list.appendChild(h0);
      for (const col of COLLECTIONS) {
        const pr = collectionProgress(col), claimed = !!(p.collections && p.collections[col.id]);
        const c = this._card(`${col.label} · ${pr.have}/${pr.total}`, pr.done ? (claimed ? '✔ Complète' : '★ Complète') : col.items.map(([cat, id]) => ((CATALOG[cat] || []).find((x) => x.id === id) || {}).label || id).join(' · '), { on: pr.done, locked: !pr.done });
        c.onclick = () => { this.app.audio.click(); const first = col.items.find(([cat, id]) => !owns(cat, id)) || col.items[0]; this.setCat(first[0]); };
        list.appendChild(c);
      }
    } else if (this.cat === 'presets') {
      const presetCard = (pr) => {
        const miss = missingItems(pr.loadout);
        const cost = totalCost(miss);
        const c = this._card(pr.label, miss.length ? `🔒 ${cost} ◆` : 'Disponible', { on: JSON.stringify(sanitizeLoadout(pr.loadout)) === JSON.stringify(this.draft), locked: miss.length > 0 });
        c.onclick = () => { this.draft = sanitizeLoadout(pr.loadout); this._rebuildCar(); this._commitDraft(); this._render(); this.app.audio.click(); };
        return c;
      };
      for (const pr of PRESETS.filter((x) => !x.theme)) list.appendChild(presetCard(pr));
      // Thèmes de saison (0.9.57) : un titre par thème, puis ses préréglages.
      for (const th of THEMES) {
        const mine = PRESETS.filter((x) => x.theme === th.id);
        if (!mine.length) continue;
        const hh = document.createElement('div');
        hh.className = 'ghead';
        hh.textContent = `${th.icon} ${th.label}`;
        list.appendChild(hh);
        for (const pr of mine) list.appendChild(presetCard(pr));
      }
      const h = document.createElement('div');
      h.className = 'ghead';
      h.textContent = 'Mes presets';
      list.appendChild(h);
      p.presets.forEach((slot, i) => {
        const c = this._card(slot ? `Slot ${i + 1}` : `Slot ${i + 1} (vide)`, slot ? 'Charger' : 'Vide', {});
        c.onclick = () => {
          if (!slot) return;
          this.draft = sanitizeLoadout(slot); this._rebuildCar(); this._commitDraft(); this._render(); this.app.audio.click();
        };
        const save = document.createElement('span');
        save.className = 'gsave';
        save.textContent = '💾';
        save.title = 'Enregistrer l\'équipement actuel dans ce slot';
        save.onclick = (e) => { e.stopPropagation(); p.presets[i] = { ...this.draft }; saveProfile(); this._render(); this.app.ui.flash(`Preset enregistré dans le slot ${i + 1}`); };
        c.appendChild(save);
        list.appendChild(c);
      });
    } else {
      for (const it of CATALOG[this.cat]) {
        const own = owns(this.cat, it.id);
        const ex = exclusiveOf(this.cat, it.id);
        const c = this._card(it.label, own ? (it.cost ? '✔ Débloqué' : ex ? '★ Exclusif' : 'Gratuit') : ex ? `🔒 ${ex}` : `🔒 ${it.cost} ◆`, { on: this.draft[this.cat] === it.id, locked: !own });
        c.onclick = () => {
          this.setDraft({ [this.cat]: it.id });
          if (this.cat === 'horn') this.app.audio.horn(it.id);
          if (this.cat === 'bike' && !this.moto) this.toggleMoto();
        };
        list.appendChild(c);
      }
    }

    // Barre d'achat
    const miss = missingItems(this.draft);
    const bar = $('garage-buy');
    if (miss.length) {
      const cost = totalCost(miss);
      const lock = miss.map(([c, id]) => exclusiveOf(c, id)).find(Boolean);         // un exclusif ne s'achète pas : on dit comment l'obtenir
      bar.classList.remove('hidden');
      $('garage-buy-text').innerHTML = lock
        ? `Aperçu : élément <b>exclusif</b> — ${esc(lock)}`
        : `Aperçu : <b>${miss.length}</b> élément${miss.length > 1 ? 's' : ''} à débloquer · <b>${cost} ◆</b>${cost > p.coins ? ' <span class="warn">(pièces insuffisantes)</span>' : ''}`;
      $('garage-buy-btn').disabled = !!lock || cost > p.coins;
    } else bar.classList.add('hidden');
  }

  buyDraft() {
    const miss = missingItems(this.draft);
    if (!miss.length) return;
    if (!buy(miss)) { this.app.ui.flash('Pas assez de pièces.'); this.app.audio.error(); return; }
    setLoadout(this.draft);
    this.app.audio.checkpoint(true);
    this.app.ui.flash('Éléments débloqués et équipés !');
    this.app.ui.updateCoins();
    this._render();
  }

  revertDraft() {
    this.draft = sanitizeLoadout(profile().loadout);
    this._rebuildCar();
    this._render();
  }

  setCat(c) {
    this.cat = c;
    this._render();
  }

  update(dt) {
    if (!this.drag && this.idle <= 0) this.angle += dt * 0.35;
    else this.idle -= dt;
    this.car.update(dt, performance.now() / 1000);
    const c = new THREE.Vector3(12, 1.1, 12);
    const cp = Math.cos(this.pitch);
    const cam = this.app.camera;
    // Le véhicule est décalé vers la gauche de l'écran pour laisser la place au panneau.
    cam.position.set(c.x + Math.sin(this.angle) * cp * this.dist, c.y + Math.sin(this.pitch) * this.dist, c.z + Math.cos(this.angle) * cp * this.dist);
    cam.lookAt(c);
    const w = window.innerWidth;
    if (w > 800) cam.setViewOffset(w, window.innerHeight, w * 0.17, 0, w, window.innerHeight);
    else cam.clearViewOffset();
    this.app.scenery.update(c, cam, 30);
  }

  dispose() {
    const el = this.app.renderer.domElement;
    el.removeEventListener('pointerdown', this._h.down);
    window.removeEventListener('pointermove', this._h.move);
    window.removeEventListener('pointerup', this._h.up);
    el.removeEventListener('wheel', this._h.wheel);
    this.app.camera.clearViewOffset();
    this.car.dispose();
    this.view.dispose();
    if (missingItems(this.draft).length === 0) setLoadout(this.draft);
  }
}


Object.assign(GarageSession.prototype, studioMethods);
