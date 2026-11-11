// Aides de caméra de poursuite (phase 1 après l'audit 0.9.59) : anticipation des virages, compensation du retard de suivi à haute vitesse, visée vers la
// zone de réception pendant un saut, pente de la route, et transition « voiture quittant un ruban » (mur, looping, vrille).
//
// Module PUR et VISUEL : il LIT l'état de la voiture (position, vitesse, cap, normale) et le circuit (surfaceAt), il n'écrit RIEN dans la physique. Il n'a donc
// aucun effet sur les temps, les replays, les fantômes ni la vérification serveur (fermeture de verify.js : ce fichier n'en fait pas partie). Chaque effet
// est multiplié par `scale` (le réglage « Sensations », 0 à 150 % ; 0 avec « animations réduites ») : à 0, plus aucune aide n'est ajoutée (seuls les réglages de base de distance et de champ, ci-dessous, restent).
//
// Une instance par course (`new CamAssist()`), `reset()` à chaque coupure (départ, réapparition), `update(dt, p, track, scale)` à chaque image.

const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const finite = (...v) => v.every(Number.isFinite);

// Réglages (secondes, radians, mètres). Choisis d'après les mesures de docs/AUDIT-PHASE1-CAMERA-EDITEUR.md.
export const RIG = {
  yawTau: 0.12,            // lissage du taux de lacet mesuré (s)
  leadGain: 0.16,          // anticipation : angle (rad) = taux de lacet (rad/s) × ce gain (s) ; la caméra regarde un peu plus loin dans le virage
  leadMax: 0.30,           //   … plafonnée à ≈ 17°
  leadV0: 8, leadV1: 30,   //   … nulle sous 8 m/s, pleine à 30 m/s (108 km/h)
  lagComp: 0.0625,         // compense 75 % du retard du suivi horizontal (1 / 12 par seconde) : la caméra ne s'éloigne plus à mesure qu'on accélère
  pullK: 0.02, pullMax: 1.6,   // recul de la caméra avec la vitesse (m par m/s, plafond) : avant 0,03 et 2,5
  fovK: 0.2, fovMax: 14,       // ouverture du champ avec la vitesse (° par m/s, plafond) : avant 0,24 et 18
  slopeLook: 0.7, slopeMax: 0.45,  // la visée suit la pente de la route (part de la pente, plafond)
  airFrom: 0.12, airTo: 0.45,  // le saut commence à compter après 0,12 s en l'air, plein effet à 0,45 s
  aimMax: 0.55,            // part de la direction « zone de réception » mélangée à la visée normale
  aimShiftMax: 0.2,        // écart maximal (rad, ≈ 11°) entre la visée normale et la visée finale : la voiture reste toujours dans le champ
  horizon: 3, step: 1 / 20,    // trajectoire prédite : 3 s au plus, un point tous les 50 ms
  exitHold: 0.08, exitBlend: 0.55, exitRate: 14,   // sortie d'un ruban : la caméra suit d'abord la voiture, puis rejoint le haut du monde en ≈ 0,6 s
};

export class CamAssist {
  constructor() { this.out = { lead: 0, comp: 0, slope: 0, aimW: 0, aim: { x: 0, y: 0, z: 0 }, heightK: 1, upMix: 0, upRate: 6, exiting: false }; this.tmp = {}; this.reset(); }

  reset(p = null) {
    this.lastYaw = p && Number.isFinite(p.yaw) ? p.yaw : null;
    this.yawRate = 0;
    this.airT = 0;
    this.sinceRib = Infinity;
    this.hasAim = false;
    this.ax = 0; this.ay = 0; this.az = 0;
    const o = this.out;
    o.lead = 0; o.comp = 0; o.slope = 0; o.aimW = 0; o.heightK = 1; o.upMix = 0; o.upRate = 6; o.exiting = false;
  }

  // p : la physique de la voiture (lue seulement). track : le circuit (surfaceAt / ceilingSurfaceAt). scale : réglage « Sensations ».
  update(dt, p, track, scale = 1) {
    const o = this.out;
    if (!(dt > 0) || !Number.isFinite(dt) || !p || !finite(p.yaw, p.pos.x, p.pos.y, p.pos.z, p.vel.x, p.vel.y, p.vel.z)) return o;
    dt = Math.min(dt, 0.1);
    const k = clamp(Number.isFinite(scale) ? scale : 1, 0, 1.5);
    // Taux de lacet de la voiture (rad/s), lissé.
    if (this.lastYaw === null) this.lastYaw = p.yaw;
    const raw = clamp(wrap(p.yaw - this.lastYaw) / dt, -6, 6);
    this.lastYaw = p.yaw;
    this.yawRate += (raw - this.yawRate) * (1 - Math.exp(-dt / RIG.yawTau));
    const sp = Math.hypot(p.vel.x, p.vel.z);
    const fwd = p.fwdSpeed > 0 || !p.grounded;
    // 1. Anticipation du virage.
    o.lead = fwd ? clamp(this.yawRate * RIG.leadGain, -RIG.leadMax, RIG.leadMax) * smoothstep(RIG.leadV0, RIG.leadV1, sp) * k : 0;
    // 2. Compensation du retard de suivi.
    o.comp = RIG.lagComp * k;
    // 3. Pente de la route devant la voiture (au sol, hors ruban) : la visée la suit.
    o.slope = 0;
    if (p.grounded && !p.rib && p.n && p.n.y > 0.3) {
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      o.slope = clamp((-(p.n.x * fx + p.n.z * fz) / p.n.y) * RIG.slopeLook, -RIG.slopeMax, RIG.slopeMax) * k;
    }
    // 4. Temps en l'air et sortie de ruban.
    if (p.rib) { this.sinceRib = 0; this.airT = 0; }
    else {
      this.sinceRib = Math.min(60, this.sinceRib + dt);
      this.airT = p.grounded ? Math.max(0, this.airT - 4 * dt) : this.airT + dt;
    }
    o.exiting = !p.rib && this.sinceRib < RIG.exitBlend + RIG.exitHold + 0.2;
    // 5. Visée vers la zone de réception.
    const w = smoothstep(RIG.airFrom, RIG.airTo, this.airT) * k;
    o.aimW = Math.min(1, w) * RIG.aimMax;
    o.heightK = 1 + 0.18 * Math.min(1, w);
    if (w > 0.001 && track) this._predict(p, track);
    if (this.hasAim) { o.aim.x = this.ax; o.aim.y = this.ay; o.aim.z = this.az; }
    else o.aimW = 0;
    // 6. Haut de la caméra : après un ruban, elle accompagne la voiture (qui se redresse seule en ~0,2 s) puis rejoint le haut du monde.
    if (o.exiting && k > 0) {
      o.upMix = smoothstep(RIG.exitHold, RIG.exitHold + RIG.exitBlend, this.sinceRib);     // 0 : le haut de la voiture ; 1 : le haut du monde
      o.upRate = RIG.exitRate;
    } else { o.upMix = 1; o.upRate = 4; }
    return o;
  }

  // Point où la voiture retombera, par une trajectoire balistique prédite (visuelle) ; lissé pour ne pas trembler.
  _predict(p, track) {
    const g = (Number.isFinite(p.g) ? p.g : 19) * (p.gSign < 0 ? -1 : 1);
    let x = p.pos.x, y = p.pos.y, z = p.pos.z, vy = p.vel.y;
    const vx = p.vel.x, vz = p.vel.z;
    let hit = null;
    const t0 = p.time || 0;
    for (let t = RIG.step; t <= RIG.horizon; t += RIG.step) {
      vy -= g * RIG.step; x += vx * RIG.step; y += vy * RIG.step; z += vz * RIG.step;
      const s = p.gSign < 0 ? track.ceilingSurfaceAt(x, y, z, this.tmp, 0.6) : track.surfaceAt(x, y, z, this.tmp, 0.6, null, t0 + t);
      const h = s.h;
      if (Number.isFinite(h) && (p.gSign < 0 ? y >= h : y <= h) && t > 0.1) { hit = { x, y: h, z }; break; }
    }
    if (!hit) hit = { x, y, z };                                   // rien trouvé dans l'horizon : on vise là où la trajectoire mène
    if (!this.hasAim) { this.ax = hit.x; this.ay = hit.y; this.az = hit.z; this.hasAim = true; }
    else { const a = 0.25; this.ax += (hit.x - this.ax) * a; this.ay += (hit.y - this.ay) * a; this.az += (hit.z - this.az) * a; }
  }
}

// Mélange de deux directions de visée (vecteurs unitaires a → b) limité à `maxAngle` rad d'écart avec a. Renvoie le vecteur résultat unitaire dans out.
export function limitedAim(a, b, w, maxAngle, out) {
  const dot = clamp(a.x * b.x + a.y * b.y + a.z * b.z, -1, 1);
  const full = Math.acos(dot);
  if (full < 1e-6 || w <= 0) { out.x = a.x; out.y = a.y; out.z = a.z; return out; }
  const ang = Math.min(full * w, maxAngle);
  const t = ang / full;
  const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
  const l = Math.hypot(x, y, z) || 1;
  out.x = x / l; out.y = y / l; out.z = z / l;
  return out;
}
