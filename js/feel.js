// Ressenti de course (0.9.20) : de petits retours visuels, sonores et tactiles qui ponctuent la conduite, calculés d'après l'état de la voiture. Tout est VISUEL / SONORE / TACTILE : rien ici ne touche à la
// physique, aux temps ni aux replays (la voiture roule exactement pareil avec ou sans). Fonctions pures, sans rendu : race.js les appelle et applique le résultat (caméra, HUD, audio, manette).
// Un réglage « Sensations » (0 à 150 %) les met à l'échelle ; à 0, plus aucun de ces effets.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Lignes de vitesse sur les bords de l'écran, GRADUÉES : elles naissent dès 126 km/h (35 m/s) et atteignent leur plein effet vers 360 km/h (avant, rien avant 223 km/h). 0 à 1.
export const speedLines = (speed) => smooth(35, 100, Math.abs(speed));

// « Coup » de champ de vision quand un turbo ou un mini-turbo démarre : +amp degrés, qui retombent en dur secondes (t : secondes depuis le coup).
export const FOV_PUNCH = { amp: 5, dur: 0.42 };
export function fovPunch(t, scale = 1) {
  if (!(t >= 0) || t >= FOV_PUNCH.dur) return 0;
  const k = 1 - t / FOV_PUNCH.dur;
  return FOV_PUNCH.amp * k * k * scale;
}

// Tassement de la caméra à une réception : descend d'autant plus que le choc est fort (impact : ev.land de la physique, au-delà de 4 on a déjà un effet), puis remonte en 0,4 s. Mètres, vers le bas.
export const DIP = { max: 0.65, dur: 0.4, perImpact: 0.035 };
export function landingDip(impact, t, scale = 1) {
  if (!(impact > 4) || !(t >= 0) || t >= DIP.dur) return 0;
  const peak = Math.min(DIP.max, (impact - 4) * DIP.perImpact + 0.12) * scale;
  const k = t / DIP.dur;
  return peak * Math.sin(Math.PI * Math.min(1, k * 1.35)) * (1 - k);       // descend vite (premier tiers), remonte doucement
}

// Aspiration : on roule derrière une autre voiture (fantôme, rival, joueur distant). others : [{ x, z }] ; self : { x, z, fx, fz } (fx, fz : l'avant de notre voiture, unitaire).
// Renvoie 0 à 1 : maximal juste derrière, dans l'axe ; nul au-delà de range ou en dehors de l'axe ; nul si l'autre est derrière nous.
export const SLIP = { range: 30, half: 3.4 };
export function slipstream(self, others, { range = SLIP.range, half = SLIP.half } = {}) {
  let best = 0;
  for (const o of others) {
    const dx = o.x - self.x, dz = o.z - self.z;
    const along = dx * self.fx + dz * self.fz;
    if (along < 2.5 || along > range) continue;                                 // derrière nous, collé à nous, ou trop loin
    const lateral = Math.abs(dx * -self.fz + dz * self.fx);
    if (lateral >= half) continue;
    best = Math.max(best, (1 - along / range) * (1 - lateral / half));
  }
  return clamp(best * 1.6, 0, 1);                                               // le facteur 1,6 : l'effet se voit déjà à mi-distance
}

// Vibrations de manette GRADUÉES (avant : seulement des coups ponctuels) : un grondement léger qui monte avec la vitesse, plus fort hors piste et en dérapage, des pulsations en turbo.
// Renvoie { strong, weak } entre 0 et 1 (à multiplier par le réglage).
export function rumbleLevels({ speed = 0, slip = 0, offTrack = false, boosting = false, grounded = true, scale = 1 } = {}) {
  if (!grounded) return { strong: 0, weak: 0 };
  const v = clamp(Math.abs(speed) / 90, 0, 1);
  let strong = 0, weak = 0.03 + 0.07 * v;
  if (offTrack) { strong += 0.18 + 0.2 * v; weak += 0.15; }
  const s = clamp((slip - 2) / 8, 0, 1);
  if (s > 0) { strong += 0.12 + 0.25 * s; weak += 0.1 * s; }
  if (boosting) { strong += 0.25; weak += 0.3; }
  return { strong: clamp(strong * scale, 0, 1), weak: clamp(weak * scale, 0, 1) };
}

// Croisement : on dépasse (ou on se fait dépasser par) une autre voiture à moins de 6 m en travers, vite : une seule détection par voiture et par passage. update(self, others, dt) renvoie le nombre de passages.
export class PassTracker {
  constructor() { this.side = new Map(); this.cool = 0; }
  reset() { this.side.clear(); this.cool = 0; }
  // others : [{ id, x, z, speed }] ; self : { x, z, fx, fz, speed }
  update(self, others, dt = 0) {
    if (this.cool > 0) this.cool -= dt;
    let n = 0;
    const seen = new Set();
    for (const o of others) {
      seen.add(o.id);
      const dx = o.x - self.x, dz = o.z - self.z;
      const along = dx * self.fx + dz * self.fz, lateral = Math.abs(dx * -self.fz + dz * self.fx);
      if (lateral > 25 || Math.abs(along) > 60) { this.side.delete(o.id); continue; }       // loin : on oublie
      const sgn = along >= 0 ? 1 : -1, prev = this.side.get(o.id);
      this.side.set(o.id, sgn);
      if (prev !== undefined && prev !== sgn && lateral < 6 && Math.abs(self.speed - (o.speed || 0)) > 6 && this.cool <= 0) { n++; this.cool = 0.3; }
    }
    for (const id of [...this.side.keys()]) if (!seen.has(id)) this.side.delete(id);
    return n;
  }
}

// Réglage « Sensations » : 0 à 1,5 ; absent ou invalide : 1.
export const feelScale = (v) => (Number.isFinite(+v) && v !== null && v !== '' ? clamp(+v, 0, 1.5) : 1);
