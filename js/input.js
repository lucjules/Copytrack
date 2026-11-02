// Entrées : clavier (QWERTY et AZERTY via e.code), manette, commandes tactiles.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // touches enfoncées depuis la dernière lecture
    this.touch = { left: false, right: false, gas: false, brake: false, drift: false };
    this.gamepadPrev = {};
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  down(...codes) {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  // Vrai une seule fois par appui.
  hit(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  clearHits() {
    this.pressed.clear();
  }

  _gamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  // Événements de manette convertis en codes "virtuels".
  pollGamepadButtons() {
    const p = this._gamepad();
    if (!p) return;
    const map = { 9: 'Escape', 3: 'KeyR', 8: 'Enter', 5: 'KeyC' };
    for (const [idx, code] of Object.entries(map)) {
      const b = p.buttons[idx];
      const on = !!(b && b.pressed);
      if (on && !this.gamepadPrev[idx]) this.pressed.add(code);
      this.gamepadPrev[idx] = on;
    }
  }

  drive() {
    const t = this.touch;
    let steer = 0;
    if (this.down('ArrowLeft', 'KeyA') || t.left) steer -= 1;
    if (this.down('ArrowRight', 'KeyD') || t.right) steer += 1;
    let throttle = this.down('ArrowUp', 'KeyW') || t.gas;
    let brake = this.down('ArrowDown', 'KeyS') || t.brake;
    let drift = this.down('Space', 'ShiftLeft', 'ShiftRight') || t.drift;
    const p = this._gamepad();
    if (p) {
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.15) steer = Math.max(-1, Math.min(1, ax));
      if (p.buttons[14] && p.buttons[14].pressed) steer = -1;
      if (p.buttons[15] && p.buttons[15].pressed) steer = 1;
      const rt = p.buttons[7] ? p.buttons[7].value : 0;
      const lt = p.buttons[6] ? p.buttons[6].value : 0;
      if (rt > 0.2 || (p.buttons[0] && p.buttons[0].pressed)) throttle = true;
      if (lt > 0.2 || (p.buttons[1] && p.buttons[1].pressed)) brake = true;
      if (p.buttons[2] && p.buttons[2].pressed) drift = true;
    }
    return { steer, throttle, brake, drift };
  }

  anyDriveKey() {
    const d = this.drive();
    return d.throttle || d.brake || d.steer !== 0;
  }
}
