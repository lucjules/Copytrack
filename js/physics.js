// Physique de la voiture : pas fixe, déterministe, sans moteur externe.
//
// Modèle « bicyclette » : le volant oriente les roues avant ; ce sont les pneus
// (adhérence limitée, avant et arrière) qui font tourner la voiture. Il en découle
// naturellement le sous-virage, le survirage, le dérapage et le contre-braquage.
// En l'air il n'y a aucune adhérence : le volant tourne les roues, pas la voiture.
//
// Le même modèle s'applique au sol et sur les rubans 3D (loopings, vrilles, murs,
// routes à l'envers) : seul change le plan de la route, avec la gravité projetée.
// La personnalisation du véhicule (forme, LED, dessins...) est purement visuelle :
// aucune de ces constantes n'en dépend.
import { CELL, DT, ROAD_HALF, RAIL_W, RAIL_H, SLAB_T, LEVEL_H, ROAD_TOP } from './constants.js';
import {
  PIECES, PLATES, RING_R, RING_Y, toLocal, sampleLocal, rotVec, tileCenter, isRibbon, isFloor, tileParam,
} from './pieces.js';
import { ribbonOf, frameLocal } from './ribbons.js';

export const CAR = {
  accel: 28,          // m/s² à bas régime
  maxSpeed: 54,       // vitesse visée moteur (m/s)
  boostSpeed: 78,
  boostAccel: 38,
  boostTime: 1.6,
  brake: 42,
  reverseAccel: 15,
  reverseMax: 15,
  roll: 0.6,
  drag: 0.0023,
  coast: 2.0,
  // Châssis (modèle bicyclette)
  a: 1.35,            // centre de gravité -> essieu avant (m)
  b: 1.4,             // centre de gravité -> essieu arrière (m)
  yawK: 1.9,          // inertie de lacet ramenée à la masse (m²)
  corner: 230,        // rigidité de dérive d'un essieu (m/s² par rad)
  latGrip: 56,        // adhérence latérale totale (m/s²), partagée avant / arrière
  frontShare: 0.48,   // part avant (un peu moins que l'arrière : comportement stable)
  steerMax: 0.6,      // angle de braquage maxi des roues (rad) à basse vitesse
  steerAlat: 52,      // l'angle utile diminue avec la vitesse (le volant reste précis)
  driftRear: 0.65,    // adhérence arrière restante quand on freine en virage (dérapage)
  driftSteer: 1.3,    // braquage autorisé en plus pendant le dérapage
  driftMin: 12,       // vitesse mini (m/s) pour qu'un freinage en virage fasse déraper
  driftBrake: 0.75,   // part du freinage absorbée par la glisse quand on dérape
  yawDamp: 0.6,
  steerIn: 7,         // vitesse de braquage
  steerOut: 12,       // retour au centre
  gravity: 25,
  snap: 0.7,
  step: 1.6,
  launch: 2.0,        // vitesse normale (m/s) au-delà de laquelle la route « tombe » sous la voiture : elle décolle
  airPitchAcc: 4.2,  // tangage en l'air : gaz = nez vers le bas, frein = nez vers le haut (rad/s²)
  airPitchDamp: 2.6,
  landOk: 0.38,      // écart d'angle toléré à la réception (rad) sans perte de vitesse (une bosse de pente passe)
  mtTime1: 0.7,      // durée de glisse pour un mini-turbo (s)
  mtTime2: 1.5,      // durée pour un mini-turbo renforcé
  lipHopMin: 2,      // saut en haut d'un L : hauteur mini (m)
  lipHopMax: 4,      // hauteur maxi (m), atteinte vers 180 km/h
  lipHopK: 600,      // hauteur = vitesse² / lipHopK, bornée
  bounce: 14,         // vitesse verticale donnée par un revêtement Rebond (100 %)
  wind: 20,           // accélération latérale du vent à 100 %
  radius: 1.0,
  probe: 1.25,
  height: 1.3,
};

// Réglages propres à la moto (plaque moto) : plus vive et plus agile que la voiture,
// un peu moins rapide en pointe. Les personnalisations du garage, elles, ne changent rien.
export const MOTO = {
  ...CAR,
  accel: 32,          // démarre plus fort
  maxSpeed: 51,       // vitesse de pointe un peu plus basse
  brake: 36,          // freine un peu moins (une seule roue avant)
  a: 1.15, b: 1.2,    // empattement plus court : tourne plus serré
  yawK: 1.25,         // plus légère, change de cap plus vite
  latGrip: 60,        // penche dans les virages : un peu plus d'appui latéral
  frontShare: 0.5,
  steerMax: 0.75,     // braque plus à basse vitesse
  steerAlat: 66,      // et garde plus de braquage à haute vitesse
  driftRear: 0.76,    // glisse moins au freinage en virage
  driftSteer: 1.15,
  steerIn: 9,
  steerOut: 14,
  airPitchAcc: 5.2,   // plus vive en l'air
};

// Bateau (plaque bateau) : rapide sur l'eau, glisse un peu, se traîne sur la route.
export const BOAT = {
  ...CAR,
  accel: 26,
  maxSpeed: 50,
  brake: 26,
  latGrip: 44,        // la coque glisse plus qu'un pneu
  frontShare: 0.46,
  steerMax: 0.55,
  steerAlat: 48,
  yawK: 2.1,
  yawDamp: 0.9,
  driftRear: 0.7,
};

// Voiture-deltaplane (plaque deltaplane) : une voiture un peu plus lourde au sol,
// qui plane en l'air et s'y dirige en inclinant l'aile.
export const GLIDER = {
  ...CAR,
  accel: 25,
  maxSpeed: 51,
  airPitchAcc: 3.4,
};
const SPECS = { car: CAR, moto: MOTO, boat: BOAT, glider: GLIDER };

// Vol plané : portance proportionnelle à v² et à l'incidence, traînée, virage incliné.
export const GLIDE = {
  lift: 0.021,         // portance (m/s² par (m/s)²) à incidence de vol
  liftMaxG: 1.6,       // portance maxi (en g)
  drag: 0.0009,        // traînée de forme
  induced: 0.03,       // traînée induite (part de la portance)
  trim: 0.08,          // incidence sans action (rad)
  up: 0.34,            // incidence en cabrant (frein)
  down: -0.16,         // incidence en piquant (gaz)
  turn: 0.95,          // vitesse de virage maxi (rad/s)
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const L1 = { lx: 0, lz: 0 }, L2 = { lx: 0, lz: 0 };
const S1 = {}, S2 = {};
const W1 = { x: 0, z: 0 };
const FL = {};
const CC = { x: 0, z: 0 };
const TMP = { x: 0, z: 0 };
const HIT = { dx: 0, dz: 0, nx: 0, nz: 0 };
const BK = { vx: 0, vy: 0, w: 0 };

// Repère d'un ruban en coordonnées monde.
export function frameWorld(tile, rib, u, F) {
  frameLocal(rib, u, FL);
  const c = tileCenter(tile, CC);
  const r = tile.r;
  rotVec(r, FL.px, FL.pz, TMP); F.px = TMP.x + c.x; F.pz = TMP.z + c.z; F.py = FL.py;
  rotVec(r, FL.tx, FL.tz, TMP); F.tx = TMP.x; F.tz = TMP.z; F.ty = FL.ty;
  rotVec(r, FL.nx, FL.nz, TMP); F.nx = TMP.x; F.nz = TMP.z; F.ny = FL.ny;
  rotVec(r, FL.rx, FL.rz, TMP); F.rx = TMP.x; F.rz = TMP.z; F.ry = FL.ry;
  F.ds = FL.ds;
  F.kc = FL.kc; F.hw = FL.hw; F.wrap = FL.wrap;
  return F;
}

export class CarPhysics {
  constructor(track) {
    this.track = track;
    this.pos = { x: 0, y: 0, z: 0 };
    this.prev = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.n = { x: 0, y: 1, z: 0 };
    this.fwd = { x: 0, y: 0, z: -1 };   // direction du nez (visuelle et physique)
    this.surf = {};
    this.F = {}; this.F0 = {}; this.F2 = {}; this.F3 = {};
    this.ev = {
      wall: 0, land: 0, boostHit: false, bounce: false, loopIn: false, loopOut: false, loopFall: false,
      moto: false, gravity: false, miniTurbo: 0, landQ: '', sink: false, ring: false,
    };
    this.rib = null;
    this.vehicle = 'car';
    this.gravMul = 1;
    this.setBounds();
    this.place(0, 0.4, 0, 0);
  }

  get g() {
    return CAR.gravity * this.gravMul;
  }

  // Réglages du véhicule actuel (voiture ou moto).
  get k() {
    return SPECS[this.vehicle] || CAR;
  }

  // Compatibilité : « moto » est un des véhicules possibles.
  get moto() { return this.vehicle === 'moto'; }
  set moto(v) { this.vehicle = v ? 'moto' : 'car'; }

  get mode() {
    return this.rib ? 'ribbon' : 'ground';
  }

  setBounds() {
    const b = this.track.bounds();
    const m = CELL * 3;
    this.bx0 = b.minX - m; this.bx1 = b.maxX + m;
    this.bz0 = b.minZ - m; this.bz1 = b.maxZ + m;
  }

  place(x, y, z, yaw) {
    this.pos.x = x; this.pos.y = y; this.pos.z = z;
    this.prev.x = x; this.prev.y = y; this.prev.z = z;
    this.vel.x = 0; this.vel.y = 0; this.vel.z = 0;
    this.yaw = yaw; this.prevYaw = yaw; this.yawRate = 0; this.omega = 0;
    this.steer = 0; this.steerAngle = 0; this.boost = 0; this.boostF = 1; this.slip = 0; this.airTime = 0; this.fwdSpeed = 0;
    this.driftT = 0; this.bounceCD = 0; this.driftCharge = 0;
    this.pitch = 0; this.pitchRate = 0; this.landQ = ''; this.aoa = 0.08; this.glidePitch = 0;
    this.rib = null;
    this.gravMul = 1;
    this.vehicle = 'car';
    this.plateLock = '';
    this.sinkT = 0;
    const s = this.track.surfaceAt(x, y + 0.5, z, this.surf, 3);
    this.pos.y = s.h;
    this.prev.y = s.h;
    this.grounded = true;
    this._setGround(s, false);
    this._updateFwd();
  }

  get speed() {
    const v = this.vel;
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }

  _updateFwd() {
    if (this.rib) return;
    this.fwd.x = -Math.sin(this.yaw); this.fwd.y = 0; this.fwd.z = -Math.cos(this.yaw);
  }

  _setGround(s, triggers = true) {
    this.n.x = s.nx; this.n.y = s.ny; this.n.z = s.nz;
    this.surfType = s.type;
    this.surfMod = s.mod || '';
    this.surfTile = s.tile;
    this.surfP = s.tile ? tileParam(s.tile) / 100 : 1;
    if (!triggers || !s.tile) return;
    const mod = this.surfMod;
    if (mod === 'boost') {
      if (this.boost < CAR.boostTime - 0.2) this.ev.boostHit = true;
      this.boost = CAR.boostTime;
      this.boostF = this.surfP;
    } else if (mod === 'gravity') {
      const gm = this.surfP;
      if (Math.abs(gm - this.gravMul) > 0.01) { this.gravMul = gm; this.ev.gravity = true; }
    }
    // Plaques de transformation (moto, bateau, deltaplane) : une suite de plaques collées
    // ne compte que pour UNE transformation ; repasser sur la même plaque ramène la voiture.
    if (PLATES[mod]) {
      if (this.plateLock !== mod) {
        this.plateLock = mod;
        this.vehicle = this.vehicle === PLATES[mod] ? 'car' : PLATES[mod];
        this.ev.moto = true;
      }
    } else this.plateLock = '';
  }

  // ---------------------------------------------------------------- Pneus
  // Angle des roues avant selon la vitesse : à haute vitesse, un petit angle suffit.
  _steerAngle(speed, drift) {
    const K = this.k;
    const v2 = Math.max(1, speed * speed);
    // Angle géométrique du virage limite + marge de dérive du pneu avant (saturation).
    const slipSat = (K.latGrip * K.frontShare) / K.corner;
    let max = Math.min(K.steerMax, Math.atan((K.a + K.b) * K.steerAlat / v2) + slipSat);
    max *= 1 + (K.driftSteer - 1) * drift;
    return this.steer * max;
  }

  // Modèle bicyclette, repère voiture (x avant, y droite, w lacet > 0 = vers la droite).
  // ax : accélération longitudinale (moteur, freins) ; grip : multiplicateur d'adhérence.
  _tires(vx, vy, w, ax, grip, dt) {
    const drift = this.driftT, K = this.k;
    const delta = this._steerAngle(Math.abs(vx), drift);
    this.steerAngle = delta;
    const L = K.a + K.b;
    const maxF = K.latGrip * grip * K.frontShare;
    const maxR = K.latGrip * grip * (1 - K.frontShare) * (1 - (1 - K.driftRear) * drift);
    if (Math.abs(vx) < 1.5 && grip > 0.3) {
      // Manœuvre au pas : roulement sans glissement.
      vx += ax * dt;
      BK.vx = vx; BK.vy = vy * 0.6; BK.w = (vx * Math.tan(delta)) / L;
      return BK;
    }
    const den = Math.max(Math.abs(vx), 6);
    const sgn = vx >= 0 ? 1 : -1;
    const af = Math.atan2(vy + K.a * w, den) - delta * sgn;
    const ar = Math.atan2(vy - K.b * w, den);
    const Ff = clamp(-K.corner * af, -maxF, maxF);
    const Fr = clamp(-K.corner * ar, -maxR, maxR);
    const cd = Math.cos(delta), sd = Math.sin(delta);
    // (La rotation du repère est prise en compte en reprojetant la vitesse à chaque pas.)
    vx += (ax - Ff * sd) * dt;
    vy += (Ff * cd + Fr) * dt;
    w += ((K.a * Ff * cd - K.b * Fr) / K.yawK - w * K.yawDamp) * dt;
    BK.vx = vx; BK.vy = vy; BK.w = w;
    return BK;
  }

  step(inp) {
    const dt = DT, p = this.pos, v = this.vel, ev = this.ev;
    ev.wall = 0; ev.land = 0; ev.boostHit = false; ev.bounce = false;
    ev.loopIn = false; ev.loopOut = false; ev.loopFall = false; ev.moto = false; ev.gravity = false; ev.miniTurbo = 0; ev.landQ = ''; ev.sink = false; ev.ring = false;
    this.prev.x = p.x; this.prev.y = p.y; this.prev.z = p.z;
    this.prevYaw = this.yaw;

    // Volant progressif (retour au centre plus rapide).
    const target = clamp(inp.steer || 0, -1, 1);
    const back = Math.abs(target) < Math.abs(this.steer) || target * this.steer < 0;
    const K = this.k;
    const sr = (back ? K.steerOut : K.steerIn) * dt;
    this.steer += clamp(target - this.steer, -sr, sr);
    if (this.boost > 0) this.boost = Math.max(0, this.boost - dt);
    if (this.bounceCD > 0) this.bounceCD -= dt;
    // Dérapage : il n'y a plus de bouton, c'est le frein pris en virage à bonne vitesse
    // qui fait décrocher l'arrière. Tant qu'on garde le volant et que ça glisse,
    // la dérive se prolonge doucement ; sinon l'arrière raccroche vite.
    const turning = Math.abs(this.steer) > 0.5;      // volant franchement tourné
    if (inp.brake && !inp.throttle && turning && this.fwdSpeed > K.driftMin && this.grounded) {
      this.driftT = Math.min(1, this.driftT + dt * 5);
    } else if (turning && this.driftT > 0 && this.fwdSpeed > K.driftMin * 0.7) {
      this.driftT = Math.max(0, this.driftT - dt * 0.3);
    } else {
      this.driftT = Math.max(0, this.driftT - dt * 3.5);
    }
    // Mini-turbo : une glisse assez longue se « charge » ; quand l'arrière raccroche,
    // la voiture reçoit une petite poussée (plus forte si la glisse a duré).
    if (this.driftT > 0.3 && this.grounded && this.slip > 0.04 * this.fwdSpeed && this.fwdSpeed > 10) {
      this.driftCharge += dt;
    } else if (this.driftT < 0.25) {
      if (this.driftCharge >= CAR.mtTime1 && this.grounded) {
        const lvl = this.driftCharge >= CAR.mtTime2 ? 2 : 1;
        const f = lvl === 2 ? 0.55 : 0.32;
        this.boostF = this.boost > 0 ? Math.max(this.boostF, f) : f;
        this.boost = Math.max(this.boost, lvl === 2 ? 0.8 : 0.55);
        ev.miniTurbo = lvl;
      }
      this.driftCharge = 0;
    }

    if (this.rib) { this._ribStep(inp); return; }

    let fx = -Math.sin(this.yaw), fy = 0, fz = -Math.cos(this.yaw);

    if (this.grounded) {
      const n = this.n;
      const d = fx * n.x + fy * n.y + fz * n.z;
      fx -= n.x * d; fy -= n.y * d; fz -= n.z * d;
      let len = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
      fx /= len; fy /= len; fz /= len;
      let rx = fy * n.z - fz * n.y, ry = fz * n.x - fx * n.z, rz = fx * n.y - fy * n.x;
      len = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
      rx /= len; ry /= len; rz /= len;

      let vf = v.x * fx + v.y * fy + v.z * fz;
      let vr = v.x * rx + v.y * ry + v.z * rz;
      const g = this.g;
      vf -= g * fy * dt;
      vr -= g * ry * dt;

      // Effet du revêtement (le paramètre f vaut 1 à 100 %).
      const mod = this.surfMod, f = this.surfP;
      const ground = this.surfType === 'ground';
      let grip = 1, traction = 1, vmaxK = 1, extraDrag = 0;
      if (ground) { grip = 0.55; traction = 0.7; vmaxK = 0.45; extraDrag = 5; }
      else if (mod === 'ice') { grip = clamp(0.2 / f, 0.05, 0.85); traction = 0.45; }
      else if (mod === 'sand') { grip = 0.8; traction = 0.65; vmaxK = clamp(1 - 0.45 * f, 0.25, 1); extraDrag = 5 * f; }
      else if (mod === 'mud') { grip = 0.7; traction = 0.55; vmaxK = clamp(1 - 0.5 * f, 0.2, 1); extraDrag = 6 * f; }
      else if (mod === 'magnet') grip = 1.45 * f;
      else if (mod === 'drift') grip = clamp(0.5 / f, 0.18, 1.2);
      else if (mod === 'slow') extraDrag = 14 * f;
      else if (mod === 'water') {
        if (this.vehicle === 'boat') { grip = 0.85; traction = 1; vmaxK = 1; }
        else {
          // Une voiture dans l'eau : elle patine, se noie si elle s'arrête.
          grip = 0.35; traction = 0.3; vmaxK = 0.3; extraDrag = 9;
          if (Math.abs(vf) < 5) this.sinkT += dt; else this.sinkT = Math.max(0, this.sinkT - dt);
          if (this.sinkT > 1.2) { this.sinkT = 0; this.ev.sink = true; }
        }
      }
      else if (mod === 'wind') {
        const a = ((tileParam(this.surfTile) - 100) / 100) * CAR.wind;
        rotVec(this.surfTile.r, 1, 0, TMP);
        vf += (TMP.x * fx + TMP.z * fz) * a * dt;
        vr += (TMP.x * rx + TMP.z * rz) * a * dt;
      }

      // Le bateau hors de l'eau racle la route.
      if (this.vehicle === 'boat' && mod !== 'water') { grip = Math.min(grip, 0.8); traction *= 0.4; vmaxK = Math.min(vmaxK, 0.3); extraDrag += 7; }
      if (mod !== 'water') this.sinkT = 0;
      const ax = (this._longitudinal(vf, inp, K.maxSpeed * vmaxK, traction, extraDrag, dt) - vf) / dt;
      const r = this._tires(vf, vr, this.omega, ax, grip, dt);
      vf = r.vx; vr = r.vy; this.omega = r.w;
      this.yaw -= this.omega * dt;
      this.yawRate = -this.omega;

      v.x = fx * vf + rx * vr;
      v.y = fy * vf + ry * vr;
      v.z = fz * vf + rz * vr;
      this.slip = Math.abs(vr);
      this.fwdSpeed = vf;
      this.airTime = 0;
      this.pitch = Math.asin(clamp(fy, -1, 1));   // assiette au sol : sert d'assiette de départ en l'air
      this.pitchRate = 0;
    } else {
      // En l'air : trajectoire balistique, la voiture garde son cap (le volant ne
      // tourne que les roues). La rotation acquise au décollage s'amortit doucement.
      // Exception : le deltaplane plane et vire en inclinant son aile.
      if (this.vehicle === 'glider') { this._glide(inp, dt); fx = -Math.sin(this.yaw); fz = -Math.cos(this.yaw); }
      else v.y -= this.g * dt;
      this.omega *= Math.exp(-1.5 * dt);
      this.yaw -= this.omega * dt;
      this.yawRate = -this.omega;
      this.steerAngle = this._steerAngle(Math.hypot(v.x, v.z), this.driftT);
      const k = 1 - 0.0006 * this.speed * dt;
      v.x *= k; v.y *= k; v.z *= k;
      this.slip = 0;
      this.fwdSpeed = v.x * fx + v.z * fz;
      this.airTime += dt;
      // Tangage : gaz = le nez plonge, frein = le nez se lève. Sans action, la voiture
      // garde son assiette (sa rotation s'amortit).
      const pin = this.vehicle === 'glider' ? 0 : (inp.brake ? 1 : 0) - (inp.throttle ? 1 : 0);
      this.pitchRate += pin * K.airPitchAcc * dt;
      this.pitchRate *= Math.exp(-CAR.airPitchDamp * dt);
      if (this.vehicle === 'glider') this.pitch = this.glidePitch;
      else this.pitch = clamp(this.pitch + this.pitchRate * dt, -1.4, 1.4);
    }

    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    this._rings();
    if (this._tryEnterRibbon()) return;
    if (!this.grounded && this._tryLandRibbon()) return;
    this._walls();
    this._bounds();

    // Contact avec la chaussée.
    const s = this.track.surfaceAt(p.x, p.y, p.z, this.surf, CAR.step);
    const gap = p.y - s.h;
    const vn = v.x * s.nx + v.y * s.ny + v.z * s.nz;
    const magnet = s.mod === 'magnet';
    const mk = magnet ? tileParam(s.tile) / 100 : 1;
    const launch = magnet ? CAR.launch * (1 + 2 * mk) : CAR.launch;
    const snap = magnet ? CAR.snap * (1 + mk) : CAR.snap;
    if (this.grounded && gap < snap && gap > -CAR.step && vn < launch) {
      p.y = s.h;
      const sp = this.speed;
      v.x -= s.nx * vn; v.y -= s.ny * vn; v.z -= s.nz * vn;
      const sp2 = this.speed;
      if (sp2 > 1e-4) { const k = sp / sp2; v.x *= k; v.y *= k; v.z *= k; }
      this._setGround(s);
    } else if (!this.grounded && gap <= 0.02 && gap > -CAR.step && vn <= 0.5) {
      p.y = s.h;
      if (vn < 0) {
        v.x -= s.nx * vn; v.y -= s.ny * vn; v.z -= s.nz * vn;
        ev.land = -vn;
        const k = this._landing(s.nx, s.ny, s.nz);
        v.x *= k; v.y *= k; v.z *= k;
      }
      this.grounded = true;
      this._setGround(s);
    } else {
      this.grounded = false;
    }

    // Revêtement Rebond : propulse la voiture vers le haut.
    if (this.grounded && this.surfMod === 'bounce' && this.bounceCD <= 0) {
      const n = this.n;
      const vn2 = v.x * n.x + v.y * n.y + v.z * n.z;
      const add = Math.max(0, CAR.bounce * this.surfP - vn2);
      v.x += n.x * add; v.y += n.y * add; v.z += n.z * add;
      this.grounded = false;
      this.bounceCD = 0.4;
      ev.bounce = true;
    }
    this._updateFwd();
  }

  // Nouvelle vitesse longitudinale : moteur, freins, résistances.
  // load : part du poids qui appuie les roues sur la route (1 au sol, 0 sur un mur vertical).
  _longitudinal(vf, inp, vmax, traction, extraDrag, dt, load = 1) {
    const K = this.k;
    let a = 0;
    if (inp.throttle) {
      if (vf < -0.5) a += K.brake * traction;
      else { const x = vf / vmax; a += K.accel * traction * (1 - x * x); }
    }
    if (inp.brake) {
      // En dérapage, l'énergie part surtout dans la glisse : on ralentit moins.
      if (vf > 0.5) a -= K.brake * traction * (1 - CAR.driftBrake * this.driftT);
      else if (!inp.throttle) {
        const x = Math.max(0, -vf) / CAR.reverseMax;
        a -= CAR.reverseAccel * traction * (1 - x * x);
      }
    }
    if (this.boost > 0) {
      const f = this.boostF;
      const vb = K.maxSpeed + (CAR.boostSpeed - K.maxSpeed) * f;
      const x = Math.max(0, vf) / vb;
      a += CAR.boostAccel * f * Math.max(0, 1 - x * x);
    }
    let res = CAR.roll * load + CAR.drag * vf * vf + extraDrag * load;
    if (!inp.throttle && !inp.brake) res += CAR.coast * load;
    res += 4 * this.driftT * load;
    const dvr = res * dt;
    if (Math.abs(vf) <= dvr) vf = 0; else vf -= Math.sign(vf) * dvr;
    return vf + a * dt;
  }

  _bounds() {
    const p = this.pos, v = this.vel;
    if (p.x < this.bx0) { p.x = this.bx0; if (v.x < 0) v.x = 0; }
    if (p.x > this.bx1) { p.x = this.bx1; if (v.x > 0) v.x = 0; }
    if (p.z < this.bz0) { p.z = this.bz0; if (v.z < 0) v.z = 0; }
    if (p.z > this.bz1) { p.z = this.bz1; if (v.z > 0) v.z = 0; }
  }

  // Bordures : la voiture glisse le long du mur, perd un peu de vitesse au choc,
  // et le choc freine sa rotation. Pas de réalignement automatique.
  _walls() {
    const p = this.pos, v = this.vel;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const pfx = -Math.sin(this.prevYaw), pfz = -Math.cos(this.prevYaw);
    let hit = 0;
    for (let k = -1; k <= 1; k += 2) {
      const off = CAR.probe * k;
      for (let iter = 0; iter < 2; iter++) {
        const c = this._probe(p.x + fx * off, p.z + fz * off,
          this.prev.x + pfx * off, this.prev.z + pfz * off, p.y);
        if (!c) break;
        p.x += c.dx; p.z += c.dz;
        const vn = v.x * c.nx + v.z * c.nz;
        if (vn < 0) {
          v.x -= c.nx * vn * 1.05;
          v.z -= c.nz * vn * 1.05;
          if (-vn > hit) hit = -vn;
        }
      }
    }
    if (hit > 0) {
      const loss = Math.min(0.2, hit * 0.006);
      v.x *= 1 - loss; v.y *= 1 - loss; v.z *= 1 - loss;
      this.omega *= Math.max(0.3, 1 - hit * 0.05);
      this.ev.wall = hit;
    }
  }

  _probe(x, z, px, pz, y) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    const tiles = this.track.tilesAt(cx, cz);
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const P = PIECES[tile.t];
      if (P.kind === 'area' || tile.nb || !isFloor(tile)) continue;
      toLocal(tile, x, z, L1);
      sampleLocal(tile, L1.lx, L1.lz, S1);
      if (!S1.inFootprint) continue;
      if (y > S1.h + RAIL_H - 0.15 || y + CAR.height < S1.h - SLAB_T - 0.2) continue;
      const ad = Math.abs(S1.d), R = CAR.radius;
      const inner = ROAD_HALF, outer = ROAD_HALF + RAIL_W;
      if (ad + R <= inner || ad - R >= outer) continue;
      toLocal(tile, px, pz, L2);
      sampleLocal(tile, L2.lx, L2.lz, S2);
      const inside = Math.abs(S2.d) < (inner + outer) * 0.5;
      const sgn = S1.d >= 0 ? 1 : -1;
      const targetD = inside ? inner - R : outer + R;
      const push = (targetD - ad) * sgn;
      rotVec(tile.r, S1.gx, S1.gz, W1);
      HIT.dx = W1.x * push; HIT.dz = W1.z * push;
      const ns = inside ? -sgn : sgn;
      HIT.nx = W1.x * ns; HIT.nz = W1.z * ns;
      return HIT;
    }
    return null;
  }

  // ---------------------------------------------------------------- Rubans
  // Sur un ruban, l'état est exprimé dans le plan de la route :
  //   e1 = sens de parcours, e2 = droite, n = normale.
  //   vs, vd : vitesse le long de e1 / e2 ; psi : cap de la voiture par rapport à e1.
  _basis(R, F) {
    const d = R.dir;
    return {
      e1x: F.tx * d, e1y: F.ty * d, e1z: F.tz * d,
      e2x: F.rx * d, e2y: F.ry * d, e2z: F.rz * d,
    };
  }

  // Détecte le franchissement d'une extrémité de ruban (plan perpendiculaire à la route).
  _tryEnterRibbon() {
    const p = this.pos, q = this.prev, v = this.vel;
    if (this.speed < 3) return false;
    const c1x = Math.floor(p.x / CELL), c1z = Math.floor(p.z / CELL);
    const c2x = Math.floor(q.x / CELL), c2z = Math.floor(q.z / CELL);
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 1 && c1x === c2x && c1z === c2z) break;
      const tiles = pass === 0 ? this.track.tilesAt(c1x, c1z) : this.track.tilesAt(c2x, c2z);
      for (const tile of tiles) {
        if (!isRibbon(tile)) continue;
        const rib = ribbonOf(tile);
        for (let end = 0; end < 2; end++) {
          const F = frameWorld(tile, rib, end, this.F);
          const sg = end === 0 ? 1 : -1;
          const tx = F.tx * sg, ty = F.ty * sg, tz = F.tz * sg;
          const dc = (p.x - F.px) * tx + (p.y - F.py) * ty + (p.z - F.pz) * tz;
          const dp = (q.x - F.px) * tx + (q.y - F.py) * ty + (q.z - F.pz) * tz;
          if (!(dp < 0 && dc >= 0)) continue;
          const dl = (p.x - F.px) * F.rx + (p.y - F.py) * F.ry + (p.z - F.pz) * F.rz;
          const dn = (p.x - F.px) * F.nx + (p.y - F.py) * F.ny + (p.z - F.pz) * F.nz;
          if (Math.abs(dl) > ROAD_HALF + 0.6 || dn < -1.4 || dn > 3.2) continue;
          const vs = v.x * tx + v.y * ty + v.z * tz;
          if (vs < 2.5) continue;
          if (this.grounded && (this.n.x * F.nx + this.n.y * F.ny + this.n.z * F.nz) < 0.35) continue;
          const R = { tile, rib, u: clamp(end === 0 ? dc / F.ds : 1 - dc / F.ds, 0, 1), dir: sg, dl: clamp(dl, -ROAD_HALF + 1, ROAD_HALF - 1), vs: 0, vd: 0, psi: 0 };
          const B = this._basis(R, F);
          R.vs = v.x * B.e1x + v.y * B.e1y + v.z * B.e1z;
          R.vd = v.x * B.e2x + v.y * B.e2y + v.z * B.e2z;
          const h = this.fwd;
          R.psi = Math.atan2(h.x * B.e2x + h.y * B.e2y + h.z * B.e2z, h.x * B.e1x + h.y * B.e1y + h.z * B.e1z);
          this.rib = R;
          this.ev.loopIn = true;
          this._ribPlace(R);
          return true;
        }
      }
    }
    return false;
  }

  // Vol plané du deltaplane : portance perpendiculaire à la vitesse, traînée,
  // incidence pilotée (gaz = piquer, frein = cabrer), virage incliné au volant.
  _glide(inp, dt) {
    const v = this.vel, G = GLIDE;
    const hv = Math.hypot(v.x, v.z);
    const sp = Math.max(1e-3, Math.hypot(hv, v.y));
    const aoaT = inp.brake ? G.up : inp.throttle ? G.down : G.trim;
    this.aoa += (aoaT - this.aoa) * Math.min(1, dt * 3);
    let L = G.lift * sp * sp * Math.max(0, 0.6 + 4 * this.aoa);
    L = Math.min(L, G.liftMaxG * this.g);
    const D = G.drag * sp * sp + G.induced * L;
    const dx = v.x / sp, dy = v.y / sp, dz = v.z / sp;
    let lx = -dx * dy, ly = 1 - dy * dy, lz = -dz * dy;
    const ll = Math.hypot(lx, ly, lz) || 1;
    lx /= ll; ly /= ll; lz /= ll;
    v.x += (L * lx - D * dx) * dt;
    v.y += (L * ly - D * dy - this.g) * dt;
    v.z += (L * lz - D * dz) * dt;
    // Virage : l'aile s'incline, la trajectoire et le nez tournent ensemble.
    const yr = this.steer * G.turn * Math.min(1, hv / 15);
    const a = -yr * dt, c = Math.cos(a), s = Math.sin(a);
    const vx = v.x * c + v.z * s, vz = v.z * c - v.x * s;
    v.x = vx; v.z = vz;
    this.yaw += a;
    this.omega = yr;
    const traj = Math.atan2(v.y, Math.max(1e-3, Math.hypot(v.x, v.z)));
    this.glidePitch = traj + this.aoa;
  }

  // Anneaux turbo : traverser le disque donne une poussée.
  _rings() {
    const p = this.pos, q = this.prev;
    const tiles = this.track.tilesAt(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    for (const tile of tiles) {
      if (tile.t !== 'ring') continue;
      toLocal(tile, p.x, p.z, L1);
      toLocal(tile, q.x, q.z, L2);
      if (L1.lz * L2.lz > 0 || L1.lz === L2.lz) continue;
      const k = L2.lz / (L2.lz - L1.lz);
      const lx = L2.lx + (L1.lx - L2.lx) * k, y = q.y + (p.y - q.y) * k;
      const cy = tile.l * LEVEL_H + ROAD_TOP + RING_Y;
      if (Math.hypot(lx, y - cy) > RING_R) continue;
      this.boost = Math.max(this.boost, 1.3);
      this.boostF = Math.max(this.boost > 0 ? this.boostF : 0, 0.9);
      this.ev.ring = true;
      this.ev.boostHit = true;
    }
  }

  // Qualité de la réception : nez aligné avec la route et voiture dans l'axe de sa
  // trajectoire = aucune perte ; nez planté ou réception de travers = perte de vitesse.
  // Renvoie le facteur appliqué à la vitesse.
  _landing(nx, ny, nz) {
    if (this.airTime < 0.35) return 1;
    const v = this.vel;
    const c = Math.cos(this.pitch), sn = Math.sin(this.pitch);
    const fx = -Math.sin(this.yaw) * c, fy = sn, fz = -Math.cos(this.yaw) * c;
    const mis = Math.abs(Math.asin(clamp(fx * nx + fy * ny + fz * nz, -1, 1)));
    const hv = Math.hypot(v.x, v.z);
    let side = 0;
    if (hv > 4) {
      const hx = -Math.sin(this.yaw), hz = -Math.cos(this.yaw);
      side = Math.acos(clamp((v.x * hx + v.z * hz) / hv, -1, 1));
      if (side > Math.PI / 2) side = Math.PI - side;   // en marche arrière, on compare à l'arrière
    }
    const loss = clamp((mis - CAR.landOk) * 0.45, 0, 0.35) + clamp((side - 0.35) * 0.3, 0, 0.2);
    if (mis < 0.12 && side < 0.15 && this.airTime > 0.6) this.ev.landQ = 'perfect';
    else if (loss > 0.12) this.ev.landQ = 'bad';
    else this.ev.landQ = 'ok';
    this.landQ = this.ev.landQ;
    this.pitchRate = 0;
    return 1 - loss;
  }

  // Atterrissage en plein milieu d'un ruban (retombée sur le haut d'un L, au fond d'un looping...).
  _tryLandRibbon() {
    const p = this.pos, q = this.prev, v = this.vel;
    const tiles = this.track.tilesAt(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    for (const tile of tiles) {
      if (!isRibbon(tile)) continue;
      const rib = ribbonOf(tile);
      // Point du ruban le plus proche (recherche grossière puis affinage).
      let bu = -1, bd = Infinity;
      for (let i = 0; i <= 32; i++) {
        const F = frameWorld(tile, rib, i / 32, this.F);
        const d = (p.x - F.px) ** 2 + (p.y - F.py) ** 2 + (p.z - F.pz) ** 2;
        if (d < bd) { bd = d; bu = i / 32; }
      }
      let u = bu;
      for (let it = 0; it < 4; it++) {
        const F = frameWorld(tile, rib, u, this.F);
        const dt = (p.x - F.px) * F.tx + (p.y - F.py) * F.ty + (p.z - F.pz) * F.tz;
        u = clamp(u + dt / F.ds, 0, 1);
      }
      if (u <= 0.002 || u >= 0.998) continue;          // les extrémités passent par _tryEnterRibbon
      const F = frameWorld(tile, rib, u, this.F);
      const dl = (p.x - F.px) * F.rx + (p.y - F.py) * F.ry + (p.z - F.pz) * F.rz;
      if (F.kc > 1e-4) this._cross({ dl }, F); else { F.qx = F.px; F.qy = F.py; F.qz = F.pz; }
      if (F.ny < 0.2) continue;                         // on ne se pose pas sur un mur ou un plafond
      const dn = (p.x - F.qx) * F.nx + (p.y - F.qy) * F.ny + (p.z - F.qz) * F.nz;
      const dq = (q.x - F.qx) * F.nx + (q.y - F.qy) * F.ny + (q.z - F.qz) * F.nz;
      const vn = v.x * F.nx + v.y * F.ny + v.z * F.nz;
      if (!(dn <= 0.05 && dq >= -0.3 && dn > -1.5 && vn < 0)) continue;
      if (Math.abs(dl) > ROAD_HALF + (tile.nb ? 0 : 0.3)) continue;
      const vt = v.x * F.tx + v.y * F.ty + v.z * F.tz;
      const R = { tile, rib, u, dir: vt >= 0 ? 1 : -1, dl: 0, vs: 0, vd: 0, psi: 0 };
      R.dl = clamp(dl * R.dir, -ROAD_HALF + 1, ROAD_HALF - 1) * R.dir;
      const B = this._basis(R, F);
      R.vs = v.x * B.e1x + v.y * B.e1y + v.z * B.e1z;
      R.vd = v.x * B.e2x + v.y * B.e2y + v.z * B.e2z;
      const h = this.fwd;
      R.psi = Math.atan2(h.x * B.e2x + h.y * B.e2y + h.z * B.e2z, h.x * B.e1x + h.y * B.e1y + h.z * B.e1z);
      this.ev.land = -vn;
      const kq = this._landing(F.nx, F.ny, F.nz);
      R.vs *= kq; R.vd *= kq;
      this.rib = R;
      this._ribPlace(R);
      return true;
    }
    return false;
  }

  // Section courbe (tube) : repère de la route au point de la voiture.
  // Avec kc = courbure transversale et phi = kc * dl, la chaussée remonte de chaque côté :
  // position = centre + r sin(phi)/kc + n (1 - cos(phi))/kc, normale tournée de phi.
  // Remplit F.qx/qy/qz (point de contact) et remplace n et r par leurs valeurs locales.
  _cross(R, F) {
    const kc = F.kc || 0;
    if (F.wrap && kc > 0) {
      const C = (2 * Math.PI) / kc;
      R.dl = ((((R.dl + C / 2) % C) + C) % C) - C / 2;
    }
    let X = R.dl, Y = 0, c = 1, s = 0;
    if (kc > 1e-5) {
      const phi = kc * R.dl;
      c = Math.cos(phi); s = Math.sin(phi);
      X = s / kc; Y = (1 - c) / kc;
    }
    F.qx = F.px + F.rx * X + F.nx * Y;
    F.qy = F.py + F.ry * X + F.ny * Y;
    F.qz = F.pz + F.rz * X + F.nz * Y;
    if (s !== 0) {
      const nx = F.nx * c - F.rx * s, ny = F.ny * c - F.ry * s, nz = F.nz * c - F.rz * s;
      const rx = F.rx * c + F.nx * s, ry = F.ry * c + F.ny * s, rz = F.rz * c + F.nz * s;
      F.nx = nx; F.ny = ny; F.nz = nz; F.rx = rx; F.ry = ry; F.rz = rz;
    }
    F.cc = c; F.cs = s;
    return F;
  }

  _ribStep(inp) {
    const R = this.rib, dt = DT, tile = R.tile, rib = R.rib;
    let F = frameWorld(tile, rib, R.u, this.F);

    // La route tourne sous la voiture : son cap relatif change d'autant
    // (il faut braquer pour suivre un virage à l'envers).
    const dU = 0.006;
    const u0 = Math.max(0, R.u - dU), u1 = Math.min(1, R.u + dU);
    const A0 = frameWorld(tile, rib, u0, this.F0), A2 = frameWorld(tile, rib, u1, this.F2);
    const k = 1 / (F.ds * (u1 - u0));
    const kg0 = ((A2.tx - A0.tx) * F.rx + (A2.ty - A0.ty) * F.ry + (A2.tz - A0.tz) * F.rz) * k;
    const kn0 = ((A2.tx - A0.tx) * F.nx + (A2.ty - A0.ty) * F.ny + (A2.tz - A0.tz) * F.nz) * k;
    // Au point de la voiture (section courbe) : normale et axe latéral tournés.
    this._cross(R, F);
    const kc = F.kc || 0;
    const kn = kn0 * F.cc - kg0 * F.cs, kg = kg0 * F.cc + kn0 * F.cs;
    let B = this._basis(R, F);

    // Gravité projetée dans le plan de la route (vrille, mur, envers, paroi du tube...).
    const g = this.g;
    R.vs -= g * B.e1y * dt;
    R.vd -= g * B.e2y * dt;
    R.psi -= R.dir * kg * R.vs * dt;

    // Revêtements actifs sur ce ruban.
    const mod = tile.s, f = tileParam(tile) / 100;
    let extraDrag = 0;
    if (mod === 'boost') {
      if (this.boost < CAR.boostTime - 0.2) this.ev.boostHit = true;
      this.boost = CAR.boostTime; this.boostF = f;
    } else if (mod === 'slow') extraDrag = 14 * f;
    else if (mod === 'sand') extraDrag = 5 * f;
    else if (mod === 'mud') extraDrag = 6 * f;

    // Pneus dans le repère voiture.
    // Appui réel des roues : gravité normale + effet de la courbure (centrifuge).
    // Au sol plat il vaut g ; sur un mur vertical, 0 ; à l'envers sur du plat, -g.
    const press = R.vs * R.vs * kn + R.vd * R.vd * kc + g * F.ny;
    const load = clamp(press / g, 0, 1.6);
    this.press = press;
    const c = Math.cos(R.psi), s = Math.sin(R.psi);
    let vx = R.vs * c + R.vd * s, vy = -R.vs * s + R.vd * c;
    const ax = (this._longitudinal(vx, inp, this.k.maxSpeed, Math.min(1, load), extraDrag, dt, Math.min(1, load)) - vx) / dt;
    const t = this._tires(vx, vy, this.omega, ax, load, dt);
    vx = t.vx; vy = t.vy; this.omega = t.w;
    // Retour dans le plan de la route avec le MÊME cap, puis la voiture pivote.
    R.vs = vx * c - vy * s;
    R.vd = vx * s + vy * c;
    R.psi += this.omega * dt;
    this.yawRate = -this.omega;
    this.fwdSpeed = vx;
    this.slip = Math.abs(vy);

    // Avancée le long du ruban et écart latéral.
    R.dl += R.dir * R.vd * dt;
    const hw = F.hw || ROAD_HALF;
    if (F.wrap) {
      // Tube : pas de bord, on peut faire le tour.
    } else if (tile.nb || Math.abs(R.dl) > hw + 1.5) {
      // Sans bordure, ou voiture restée haut sur la paroi quand le tube se rouvre.
      if (Math.abs(R.dl) > hw + 0.3) { this._ribPlace(R); this._ribDetach(); return; }
    } else {
      const lim = hw - CAR.radius - 0.2;
      if (Math.abs(R.dl) > lim) {
        const side = Math.sign(R.dl) * R.dir;          // côté du mur, dans l'axe e2
        const into = R.vd * side;                      // vitesse vers le mur
        if (into > 0) {
          if (into > 2) this.ev.wall = into;
          R.vs *= 1 - Math.min(0.15, into * 0.01);      // perte unique au choc
          R.vd -= side * into * 1.3;                     // rebond léger
          R.psi *= 0.7;                                  // le mur redresse la voiture
          this.omega *= 0.5;
        }
        R.dl = clamp(R.dl, -lim, lim);
      }
    }
    const uBefore = R.u;
    R.u += (R.dir * R.vs * dt) / F.ds;
    if (R.u > 1 || R.u < 0) { this._ribEnd(R.u > 1 ? 1 : 0); return; }

    // Décrochage : rien ne retient la voiture contre la route si l'appui devient négatif
    // (route plate à l'envers, sommet bombé pris trop vite, haut d'un looping trop lent).
    // Sur un mur vertical l'appui est nul : pas de décrochage, mais ni adhérence ni moteur.
    const mu = rib.minU || 0;
    // Haut d'un L pris en montant : le rebord guide la voiture le long de l'arrondi
    // (sans adhérence), puis la fait sauter un petit peu en arrivant sur le plateau.
    // Trop lente, elle s'arrête dans l'arrondi et redescend en arrière.
    if (tile.t === 'crest90' && R.dir === 1) {
      if (uBefore < rib.lipU && R.u >= rib.lipU && R.vs > 3) {
        this._ribPlace(R);
        // Hauteur du saut selon la vitesse : ~2 m en arrivant doucement, ~4 m à fond.
        const hop = clamp((R.vs * R.vs) / CAR.lipHopK, CAR.lipHopMin, CAR.lipHopMax);
        this.vel.y += Math.sqrt(2 * this.g * hop);
        this._ribDetach();
        return;
      }
    } else if (press < -0.6 && R.u > mu && R.u < 1 - mu) {
      this._ribPlace(R);
      this._ribDetach();
      return;
    }
    this._ribPlace(R);
  }

  // Place la voiture sur le ruban (position, vitesse, orientation monde).
  _ribPlace(R) {
    const F = this._cross(R, frameWorld(R.tile, R.rib, R.u, this.F));
    const B = this._basis(R, F);
    const p = this.pos, v = this.vel;
    p.x = F.qx; p.y = F.qy; p.z = F.qz;
    v.x = B.e1x * R.vs + B.e2x * R.vd;
    v.y = B.e1y * R.vs + B.e2y * R.vd;
    v.z = B.e1z * R.vs + B.e2z * R.vd;
    this.n.x = F.nx; this.n.y = F.ny; this.n.z = F.nz;
    const c = Math.cos(R.psi), s = Math.sin(R.psi);
    this.fwd.x = B.e1x * c + B.e2x * s; this.fwd.y = B.e1y * c + B.e2y * s; this.fwd.z = B.e1z * c + B.e2z * s;
    if (Math.hypot(this.fwd.x, this.fwd.z) > 0.3) this.yaw = Math.atan2(-this.fwd.x, -this.fwd.z);
    this.grounded = true;
    this.surfType = 'road';
    this.surfMod = '';
  }

  _ribDetach() {
    this.pitch = Math.asin(clamp(this.fwd.y, -1, 1)); this.pitchRate = 0; this.airTime = 0;
    const t = this.rib && this.rib.tile;
    this.fallWhy = t && PIECES[t.t].kind === 'loop' ? 'loop' : t && t.t === 'twist' ? 'twist' : t && t.v ? 'inv' : 'crest';
    this.rib = null;
    this.grounded = false;
    this.ev.loopFall = true;
  }

  // Fin de ruban : passe au ruban suivant s'il est raccordé, sinon retour au sol.
  _ribEnd(endU) {
    const R = this.rib;
    R.u = endU;
    this._ribPlace(R);
    const F = frameWorld(R.tile, R.rib, endU, this.F);
    // Sens de sortie : vers l'extérieur du ruban (la voiture peut redescendre en arrière).
    const d = endU === 1 ? 1 : -1;
    const fx = F.tx * d, fy = F.ty * d, fz = F.tz * d;
    const px = this.pos.x, py = this.pos.y, pz = this.pos.z;
    const next = this._matchRibbon(R.tile, F, fx, fy, fz);
    if (next) {
      const N = { tile: next.tile, rib: next.rib, u: next.end, dir: next.end === 0 ? 1 : -1, dl: 0, vs: 0, vd: 0, psi: R.psi };
      const F2 = frameWorld(next.tile, next.rib, next.end, this.F2);
      const B2 = this._basis(N, F2);
      const v = this.vel;
      N.dl = clamp((px - F2.px) * F2.rx + (py - F2.py) * F2.ry + (pz - F2.pz) * F2.rz, -ROAD_HALF + 1, ROAD_HALF - 1);
      N.vs = v.x * B2.e1x + v.y * B2.e1y + v.z * B2.e1z;
      N.vd = v.x * B2.e2x + v.y * B2.e2y + v.z * B2.e2z;
      const h = this.fwd;
      N.psi = Math.atan2(h.x * B2.e2x + h.y * B2.e2y + h.z * B2.e2z, h.x * B2.e1x + h.y * B2.e1y + h.z * B2.e1z);
      this.rib = N;
      this._ribPlace(N);
      return;
    }
    // Retour au sol : on garde la vitesse et le cap réels de la voiture.
    this.rib = null;
    this.ev.loopOut = true;
    const h = this.fwd;
    if (Math.hypot(h.x, h.z) > 0.2) this.yaw = Math.atan2(-h.x, -h.z);
    this.prevYaw = this.yaw;
    if (F.ny > 0.6) {
      this.grounded = true;
      this.vel.y = Math.min(this.vel.y, 0);
      this.n.x = 0; this.n.y = 1; this.n.z = 0;
    } else {
      this.grounded = false;
    }
    this._updateFwd();
  }

  _matchRibbon(curTile, F, fx, fy, fz) {
    const seen = new Set();
    const px = F.px, py = F.py, pz = F.pz;
    const cells = new Set();
    for (const off of [0, 1.5]) {
      // Les extrémités tombent pile sur une frontière de case : on regarde les cases voisines.
      for (const dx of [-0.6, 0, 0.6]) {
        for (const dz of [-0.6, 0, 0.6]) {
          cells.add(Math.floor((px + fx * off + dx) / CELL) + ',' + Math.floor((pz + fz * off + dz) / CELL));
        }
      }
    }
    for (const c of cells) {
      const [cx, cz] = c.split(',').map(Number);
      for (const tile of this.track.tilesAt(cx, cz)) {
        if (tile === curTile || seen.has(tile) || !isRibbon(tile)) continue;
        seen.add(tile);
        const rib = ribbonOf(tile);
        for (let end = 0; end < 2; end++) {
          const G = frameWorld(tile, rib, end, this.F3);
          const dist = Math.hypot(G.px - px, G.py - py, G.pz - pz);
          if (dist > 3.5) continue;
          const sg = end === 0 ? 1 : -1;
          if (G.tx * sg * fx + G.ty * sg * fy + G.tz * sg * fz < 0.7) continue;
          if (G.nx * F.nx + G.ny * F.ny + G.nz * F.nz < 0.6) continue;
          return { tile, rib, end };
        }
      }
    }
    return null;
  }
}
