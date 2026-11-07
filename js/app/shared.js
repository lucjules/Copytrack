// Éléments partagés par les familles de méthodes de App (voir main.js).
// Champ de vision : 0 = réglage d'origine (affiché « normal » plutôt que « 0° »).
export const fovText = (v) => (v === 0 ? 'normal' : (v > 0 ? '+' : '') + v + '°');
