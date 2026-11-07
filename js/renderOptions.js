// Réglages de rendu partagés par la construction des maillages du circuit : fixés par le profil de qualité et par l'accessibilité (main.js, app/settings.js),
// lus par trackGeometry.js et trackMesh.js. Un seul objet visible ici, au lieu de trois variables de module modifiées par des fonctions éparpillées.
export const renderOptions = {
  // Profil « Potato » : les décorations du créateur (hors obstacles, qui ont un effet physique) ne sont pas dessinées.
  // Une vue d'éditeur (showAllDecos) y voit toujours tout.
  hideDecos: false,
  // Nombre de vraies lumières (PointLight / SpotLight) que les décorations lumineuses peuvent allumer en même temps : les plus proches de la
  // caméra. Fixé par le profil de qualité (0 = faisceaux visibles seulement). Le nombre de lumières de la scène ne change jamais en cours de
  // course (pas de recompilation des shaders) : seul leur réglage change à chaque image.
  lightBudget: { point: 4, spot: 2 },
  // Couleurs adaptées (daltonisme) : appliquées aux circuits construits après le changement.
  colorblind: false,
};
