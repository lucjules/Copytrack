// Accessibilité (Copytrack Evolution, E22) : réduction des animations. Réglage `reduceMotion` : 'auto' suit le système
// (prefers-reduced-motion), 'on' réduit toujours, 'off' jamais. Réduites : transitions des écrans et des fenêtres coupées (classe
// body.reduce-motion, css/style.css), tremblements et effets de caméra du ressenti à zéro (race/camera.js). Rien ne change dans la course.
export function systemReducedMotion() {
  try { return !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
}
export function reducedMotion(setting, system = systemReducedMotion()) {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return !!system;
}
// Suit les changements du réglage système ; fn(réduit) à chaque changement. Renvoie une fonction pour arrêter.
export function watchSystemMotion(fn) {
  try {
    const m = globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)');
    if (!m || !m.addEventListener) return () => {};
    const h = () => fn(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  } catch { return () => {}; }
}
