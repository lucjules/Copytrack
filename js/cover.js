// La caméra est-elle à l'abri (0.12.2) ? Dans un tunnel, dans un tube, ou juste sous une route : la météo décorative (pluie, neige…) s'y estompe
// au lieu de tomber à travers le toit. Purement visuel : la course ne l'utilise pas.
import { PIECES, baseY, sampleLocal, toLocal, isFloor, TUNNEL_TOP } from './pieces.js';
import { CELL, ROAD_HALF } from './constants.js';
import { ribbonOf, frameLocal } from './ribbons.js';

const L = {}, S = {}, F = {};
const UNDER = 12;          // une route à moins de 12 m au-dessus de la caméra la couvre

export function coveredAt(track, x, y, z) {
  if (!track) return false;
  for (const tile of track.tilesAt(Math.floor(x / CELL), Math.floor(z / CELL))) {
    const P = PIECES[tile.t];
    if (!P) continue;
    toLocal(tile, x, z, L);
    const base = baseY(tile);
    // Tube (ruban refermé) : la caméra dans son volume.
    const rib = P.kind === 'ribbon' ? ribbonOf(tile) : null;
    if (rib) {
      frameLocal(rib, 0.5, F);
      if (F.wrap && F.kc > 0) {
        // Distance à l'axe du tube (centre de la section = point bas + n / kc), échantillonné tous les ~2 m.
        const R = 1 / F.kc, n = Math.max(8, Math.ceil(rib.len / 2));
        for (let i = 0; i <= n; i++) {
          frameLocal(rib, i / n, F);
          const ax = F.px + F.nx * R, ay = F.py + F.ny * R, az = F.pz + F.nz * R;
          if (Math.hypot(L.lx - ax, y - ay, L.lz - az) < R - 0.3) return true;
        }
      }
      continue;
    }
    if (!isFloor(tile)) continue;
    sampleLocal(tile, L.lx, L.lz, S);
    if (!S.inFootprint || (P.kind !== 'area' && Math.abs(S.d) > ROAD_HALF + 1)) continue;
    if (tile.v) { if (base > y + 0.5 && base < y + UNDER) return true; continue; }
    if (tile.tn && y > S.h - 1 && y < S.h + TUNNEL_TOP) return true;                 // sous la voûte d'un tunnel
    if (S.h > y + 1.5 && S.h < y + UNDER) return true;                                // sous le tablier d'une route
  }
  return false;
}
