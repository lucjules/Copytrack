// Collisions douces entre voitures (manche multijoueur, option « collisions ») : chaque voiture est un disque de rayon CAR_R ; deux voitures qui se
// chevauchent se repoussent. Aucun serveur, aucun arbitre : CHAQUE joueur applique SA moitié du choc à SA voiture, à partir de la position (interpolée) que
// l'autre affiche. Le résultat est symétrique à quelques centimètres près et reste doux : la poussée par pas est plafonnée, une voiture qui vient d'apparaître
// (retour au checkpoint) ou qui a fini ne bouscule personne et n'est pas bousculée.
// Ce n'est PAS de la physique rejouable : ni records, ni classements en ligne en manche (le chrono multijoueur n'est jamais vérifié par le serveur).

export const CAR_R = 1.15;               // m : demi-largeur d'une voiture + marge
export const REACH_Y = 1.8;              // m : au-delà de cet écart de hauteur, on passe au-dessus / en dessous (pont, looping)
export const RESTITUTION = 0.35;
export const MAX_DV_STEP = 0.32;         // m/s ajoutés au plus par pas de 1/120 s (≈ 38 m/s², soit environ 4 g)
export const MAX_SHIFT_STEP = 0.05;      // m de déplacement de correction au plus par pas
export const PROTECT_S = 2.0;            // s de protection après un retour au checkpoint

// self : { pos, vel } (modifié) ; others : [{ pos, vel }] déjà filtrés (visibles, ni arrivés ni téléportés à l'instant). Renvoie le nombre de contacts.
export function softCollide(self, others, { radius = CAR_R, reachY = REACH_Y } = {}) {
  let hits = 0;
  const min = radius * 2;
  for (const o of others) {
    const dx = self.pos.x - o.pos.x, dz = self.pos.z - o.pos.z, dy = self.pos.y - o.pos.y;
    if (Math.abs(dy) > reachY || Math.abs(dx) >= min || Math.abs(dz) >= min) continue;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) continue;
    let d = Math.sqrt(d2), nx, nz;
    if (d < 1e-4) {                       // exactement superposées (départ identique) : on se sépare selon sa propre vitesse, à défaut selon l'axe x
      const sp = Math.hypot(self.vel.x, self.vel.z);
      nx = sp > 0.5 ? -self.vel.z / sp : 1; nz = sp > 0.5 ? self.vel.x / sp : 0; d = 0;
    } else { nx = dx / d; nz = dz / d; }
    const pen = min - d;
    // Vitesse relative le long de la normale (qui va de l'autre vers nous) : négative = on se rapproche.
    const rv = (self.vel.x - o.vel.x) * nx + (self.vel.z - o.vel.z) * nz;
    let dv = Math.min(MAX_DV_STEP, pen * 1.2);
    if (rv < 0) dv += Math.min(8, -rv * 0.5 * (1 + RESTITUTION));        // notre moitié de l'impulsion (l'autre voiture prend l'autre moitié)
    self.vel.x += nx * dv; self.vel.z += nz * dv;
    const shift = Math.min(MAX_SHIFT_STEP, pen * 0.5);
    self.pos.x += nx * shift; self.pos.z += nz * shift;
    hits++;
  }
  return hits;
}
