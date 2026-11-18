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
// 0.11.4 : l'évènement « change » n'arrive pas toujours (navigateur sans écran, certaines vues intégrées) : la requête est aussi relue toutes les 2 s, et fn
// n'est appelée que si la valeur a vraiment changé (les deux voies ne la signalent qu'une fois).
export function watchSystemMotion(fn) {
  try {
    const m = globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)');
    if (!m || !m.addEventListener) return () => {};
    let last = m.matches;
    const h = () => { if (m.matches !== last) { last = m.matches; fn(last); } };
    m.addEventListener('change', h);
    const iv = globalThis.setInterval ? globalThis.setInterval(h, 2000) : null;
    return () => { m.removeEventListener('change', h); if (iv !== null) globalThis.clearInterval(iv); };
  } catch { return () => {}; }
}
