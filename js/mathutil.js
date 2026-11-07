// Petits utilitaires numériques partagés (la physique, l'audio, les traînées). Ne dépend de rien.
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
