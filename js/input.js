// Entrées : clavier (codes physiques => QWERTY et AZERTY), manette, tactile.
// Toutes les actions sont reconfigurables (Options > Commandes).

// [action, libellé, touches par défaut]
export const KEY_ACTIONS = {
  race: [
    ['accelerate', 'Accélérer', ['KeyW', 'ArrowUp']],
    ['brake', 'Freiner / marche arrière', ['KeyS', 'ArrowDown']],
    ['left', 'Tourner à gauche', ['KeyA', 'ArrowLeft']],
    ['right', 'Tourner à droite', ['KeyD', 'ArrowRight']],
    ['drift', 'Dérapage', ['Space', 'ShiftLeft']],
    ['respawn', 'Dernier checkpoint', ['KeyR', '']],
    ['restart', 'Recommencer', ['Enter', 'Backspace']],
    ['camera', 'Changer de caméra', ['KeyC', '']],
    ['pause', 'Pause', ['Escape', 'KeyP']],
  ],
  editor: [
    ['ed.rotate', 'Pivoter la pièce', ['KeyR', '']],
    ['ed.levelUp', 'Monter d’un niveau', ['KeyE', 'PageUp']],
    ['ed.levelDown', 'Descendre d’un niveau', ['KeyC', 'PageDown']],
    ['ed.nextPiece', 'Pièce suivante', ['Tab', '']],
    ['ed.surface', 'Revêtement suivant', ['KeyB', '']],
    ['ed.erase', 'Gomme', ['KeyX', 'Delete']],
    ['ed.test', 'Tester le circuit', ['KeyT', '']],
    ['ed.recenter', 'Recentrer la vue', ['KeyF', 'Home']],
    ['ed.topView', 'Vue de dessus', ['KeyH', '']],
    ['ed.grid', 'Afficher / masquer la grille', ['KeyG', '']],
    ['ed.help', 'Liste des raccourcis', ['F1', '']],
  ],
};

// Boutons de manette (mapping standard) par défaut.
export const PAD_ACTIONS = [
  ['accelerate', 'Accélérer', [7, 0]],
  ['brake', 'Freiner', [6, 1]],
  ['drift', 'Dérapage', [2, -1]],
  ['respawn', 'Dernier checkpoint', [3, -1]],
  ['restart', 'Recommencer', [8, -1]],
  ['camera', 'Caméra', [5, -1]],
  ['pause', 'Pause', [9, -1]],
];

export function defaultKeys() {
  const out = {};
  for (const group of Object.values(KEY_ACTIONS)) for (const [id, , keys] of group) out[id] = keys.slice();
  return out;
}

export function defaultPad() {
  const out = {};
  for (const [id, , b] of PAD_ACTIONS) out[id] = b.slice();
  return out;
}

const NAMES = {
  Space: 'Espace', Enter: 'Entrée', Backspace: 'Retour', Escape: 'Échap', Tab: 'Tab',
  ShiftLeft: 'Maj G', ShiftRight: 'Maj D', ControlLeft: 'Ctrl G', ControlRight: 'Ctrl D',
  AltLeft: 'Alt', AltRight: 'Alt Gr', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  PageUp: 'Page ↑', PageDown: 'Page ↓', Home: 'Début', End: 'Fin', Delete: 'Suppr', Insert: 'Inser',
  NumpadEnter: 'Entrée (pavé)', CapsLock: 'Verr. maj',
};
let layoutMap = null;
if (typeof navigator !== 'undefined' && navigator.keyboard && navigator.keyboard.getLayoutMap) {
  navigator.keyboard.getLayoutMap().then((m) => { layoutMap = m; }).catch(() => {});
}
const learned = {};

// Libellé lisible d'une touche, adapté à la disposition du clavier si possible.
export function keyLabel(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  const fromLayout = (layoutMap && layoutMap.get(code)) || learned[code];
  if (fromLayout) return fromLayout.toUpperCase();
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Pavé ' + code.slice(6);
  return code;
}

export const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start', 'L3', 'R3', '↑', '↓', '←', '→', 'Home'];
export function padLabel(i) {
  return i == null || i < 0 ? '—' : PAD_NAMES[i] || 'Bouton ' + i;
}

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // touches enfoncées depuis la dernière lecture
    this.touch = { left: false, right: false, gas: false, brake: false, drift: false };
    this.gamepadPrev = {};
    this.bindings = defaultKeys();
    this.pad = defaultPad();
    this.capture = null;
    window.addEventListener('keydown', (e) => {
      if (e.key && e.key.length === 1) learned[e.code] = e.key;
      if (this.capture) {
        e.preventDefault();
        const cb = this.capture;
        this.capture = null;
        cb(e.code === 'Escape' ? null : e.code);
        return;
      }
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown', 'Tab', 'F1', 'Home'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  setBindings(keys, pad) {
    this.bindings = { ...defaultKeys(), ...(keys || {}) };
    this.pad = { ...defaultPad(), ...(pad || {}) };
  }

  // Attend la prochaine touche (null si Échap).
  captureKey(cb) {
    this.capture = cb;
  }

  down(...codes) {
    for (const c of codes) if (c && this.keys.has(c)) return true;
    return false;
  }

  // Vrai une seule fois par appui.
  hit(code) {
    if (code && this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  // Action reconfigurable maintenue.
  held(action) {
    const b = this.bindings[action];
    return b ? this.down(...b) : false;
  }

  // Action reconfigurable déclenchée (une fois par appui).
  act(action) {
    const b = this.bindings[action];
    if (!b) return false;
    let r = false;
    for (const c of b) if (this.hit(c)) r = true;
    return r;
  }

  clearHits() {
    this.pressed.clear();
  }

  _gamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  _padPressed(p, i) {
    const b = i >= 0 ? p.buttons[i] : null;
    return !!(b && (b.pressed || b.value > 0.3));
  }

  // Boutons de manette convertis en appuis d'actions (codes virtuels).
  pollGamepadButtons() {
    const p = this._gamepad();
    if (!p) return;
    for (const action of ['respawn', 'restart', 'camera', 'pause']) {
      for (const i of this.pad[action] || []) {
        const on = this._padPressed(p, i);
        const k = action + i;
        if (on && !this.gamepadPrev[k]) {
          const code = (this.bindings[action] || []).find((c) => c) || action;
          this.pressed.add(code);
        }
        this.gamepadPrev[k] = on;
      }
    }
  }

  // Bouton de manette nouvellement enfoncé (pour la configuration).
  padButtonPressed() {
    const p = this._gamepad();
    if (!p) return -1;
    for (let i = 0; i < p.buttons.length; i++) {
      const on = this._padPressed(p, i);
      const was = this.gamepadPrev['cfg' + i];
      this.gamepadPrev['cfg' + i] = on;
      if (on && !was) return i;
    }
    return -1;
  }

  drive() {
    const t = this.touch;
    let steer = 0;
    if (this.held('left') || t.left) steer -= 1;
    if (this.held('right') || t.right) steer += 1;
    let throttle = this.held('accelerate') || t.gas;
    let brake = this.held('brake') || t.brake;
    let drift = this.held('drift') || t.drift;
    const p = this._gamepad();
    if (p) {
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.15) steer = Math.max(-1, Math.min(1, (ax - Math.sign(ax) * 0.15) / 0.85));
      if (this._padPressed(p, 14)) steer = -1;
      if (this._padPressed(p, 15)) steer = 1;
      if ((this.pad.accelerate || []).some((i) => this._padPressed(p, i))) throttle = true;
      if ((this.pad.brake || []).some((i) => this._padPressed(p, i))) brake = true;
      if ((this.pad.drift || []).some((i) => this._padPressed(p, i))) drift = true;
    }
    return { steer, throttle, brake, drift };
  }
}
