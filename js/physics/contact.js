// Réponse d'un contact de paroi (bordure, mur, paroi d'un ruban) : UNE seule règle, partagée par le sol (walls.js) et les rubans (ribbon.js).
// Entrée : `ap`, la vitesse d'APPROCHE normale (m/s, > 0) ; sortie : ce que le contact coûte. Pas de décision par type de pièce : seule la violence du choc compte.
// Les constantes (wallMu, wallHard*, wallSpin*, wallStun*) sont lues dans les réglages du véhicule (this.k) : les profils physiques peuvent les adoucir ou les durcir.
// Aucun dmath nécessaire : additions, multiplications, min / max seulement (déterministe).

// Rebond (coefficient de restitution) d'un contact : wallE pour un vrai choc, nul pour un simple appui. Seuil de restitution classique des moteurs physiques : sous wallRest m/s
// d'approche, le rebond croît linéairement de 0 à wallE. Sans lui, une voiture PRESSÉE contre la paroi (volant tenu vers elle) rebondissait à chaque pas puis était repoussée, et
// chaque petit rebond coûtait du frottement : la voiture oscillait à ~1,5 m/s (le seuil du modèle basse vitesse) indéfiniment, gaz à fond.
export const wallBounce = (K, ap) => (ap < K.wallRest ? K.wallE * ap / K.wallRest : K.wallE);

// Perte de vitesse TANGENTE par frottement de Coulomb (m/s) : proportionnelle à l'impulsion normale (1 + e) × ap. Nulle sans appui.
export const wallFriction = (K, ap) => K.wallMu * ap * (1 + wallBounce(K, ap));

// Part de la vitesse GLOBALE perdue par un choc violent (0 en dessous de wallHardFrom).
export const wallHardLoss = (K, ap) => (ap > K.wallHardFrom ? Math.min(K.wallHardMax, (ap - K.wallHardFrom) * K.wallHardK) : 0);

// Rotation (rad/s) donnée à la voiture par le choc ; 0 pour un frôlement.
export const wallSpinOf = (K, ap) => (ap > K.wallSpinFrom ? Math.min(K.wallSpinMax, (ap - K.wallSpinFrom) * K.wallSpin) : 0);

// Durée (s) pendant laquelle la voiture « encaisse » (moteur et adhérence réduits) ; 0 pour un frôlement.
export const wallStunOf = (K, ap) => (ap > K.wallStunFrom ? Math.min(K.wallStunMax, (ap - K.wallStunFrom) * K.wallStun) : 0);

// Vitesse de rotation CIBLE (rad/s, avant multiplication par le « haut » local) qu'un contact impose pour écarter le nez du mur : wallYaw × ap × (part de l'avance parallèle au mur), plafonnée.
// k = +1 sonde avant, −1 arrière ; fx, fz : sens d'avance ; nx, nz : normale du mur ; cy, sy : cos et sin du cap. On IMPOSE un minimum (jamais on n'accumule : deux sondes qui se
// touchent tour à tour ne peuvent pas emballer la rotation) ; de plein fouet (avance perpendiculaire au mur) la cible est nulle : `unstick` (walls.js) dégage la voiture.
// Avant 0.9.60 un contact oblique persistant (nez à quelques degrés dans la paroi) n'avait AUCUN couple : la voiture raclait sans fin et perdait son élan.
export function wallYawTarget(K, ap, k, fx, fz, nx, nz, cy, sy) {
  const along = Math.abs(fx * -nz + fz * nx);
  const dn = -cy * nx + sy * nz;                                   // d(avance)/d(cap) · normale : sens dans lequel tourner le nez pour l'éloigner du mur
  return -k * (dn >= 0 ? 1 : -1) * Math.min(K.wallYawMax, K.wallYaw * ap * along);
}
