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
import { CELL, DT, LEVEL_H, ROAD_TOP } from './constants.js';
import { PLATES, RING_R, RING_Y, toLocal, sampleLocal, rotVec, tileParam, beltSpeed, glassSeconds } from './pieces.js';
import { CAR, SPECS, GLIDE, surfaceCoeffs } from './physics/specs.js';
import { paramsOf } from './sim/params.js';
import { envOf } from './sim/env.js';
import { clamp } from './mathutil.js';
import { wallMethods } from './physics/walls.js';
import { obstacleMethods } from './physics/obstacles.js';
import { ribbonMethods } from './physics/ribbon.js';
import { dacos, dasin, datan, datan2, dcos, dexp, dpow, dsin, dtan, hypot2, hypot3 } from './dmath.js';

const L1 = { lx: 0, lz: 0 };
const L2 = { lx: 0, lz: 0 };
const S1 = {};
const W1 = { x: 0, z: 0 };
const BELT = { x: 0, z: 0 };
const MOV = {};
const TMP = { x: 0, z: 0 };
const BK = { vx: 0, vy: 0, w: 0 };

export class CarPhysics {
  constructor(track) {
    this.track = track;
    this.params = paramsOf(track);     // adhérence et vent de tout le circuit (sim/params.js) : par défaut, rien ne change
    this.env = envOf(track);           // pluie, flaques, givre, rafales (sim/env.js) : null par défaut, et alors rien ne change
    this.pos = { x: 0, y: 0, z: 0 };
    this.prev = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.n = { x: 0, y: 1, z: 0 };
    this.fwd = { x: 0, y: 0, z: -1 };   // direction du nez (visuelle et physique)
    this.surf = {};
    this.surfM = {};
    this.F = {}; this.F0 = {}; this.F2 = {}; this.F3 = {};
    this.ev = {
      wall: 0, land: 0, boostHit: false, bounce: false, loopIn: false, loopOut: false, loopFall: false,
      transform: false, gravity: false, miniTurbo: 0, landQ: '', sink: false, ring: false, flip: false, glass: false, spring: false, reverse: false, cut: false, spike: false, shock: 0,
    };
    this.rib = null;
    this.vehicle = 'car';
    this.gravMul = 1;
    this.glassTime = new Map();   // dalle de verre -> secondes de contact cumulées
    this.brokenVer = 0;           // change à chaque dalle brisée ou restaurée (le rendu compare ce numéro, pas la taille de l'ensemble)
    this.broken = new Set();      // dalles de verre brisées (sans collision) jusqu'au prochain place()
    this.excl = this.broken;      // ce qui n'a plus de collision : le verre brisé ; avec une logique de circuit, aussi les groupes cachés (setLogicExclusion)
    this.hiddenDecos = null;      // décorations (obstacles) des groupes cachés par la logique
    this.setBounds();
    this.place(0, 0.4, 0, 0);
  }

  // Logique du circuit (sim/logic.js) : les pièces et décorations des groupes cachés n'ont plus de collision. Les ensembles sont tenus à jour par le
  // moteur de logique ; sans logique, rien de tout cela n'existe et this.excl reste l'ensemble du verre brisé (mêmes calculs qu'avant, au bit près).
  setLogicExclusion(tiles, decos) {
    const broken = () => this.broken;
    this.excl = { has: (t) => broken().has(t) || tiles.has(t) };
    this.hiddenDecos = decos;
  }

  get g() {
    return CAR.gravity * this.gravMul;
  }

  // Chrono de la course (s) : donne la position des pièces mobiles et des obstacles. this.clock = pas de course, fixé par l'appelant
  // avant chaque pas (même valeur en course, en replay, après un retour au checkpoint et dans la vérification en ligne).
  get time() {
    return (this.clock || 0) * DT;
  }

  // Réglages du véhicule actuel (voiture ou moto).
  get k() {
    return SPECS[this.vehicle] || CAR;
  }

  // Hors piste : sur le terrain, ou perdue dans le ciel en gravité inversée.
  get offTrack() {
    return (this.grounded && this.surfType === 'ground' && !this.track.offroad) || this.lost;
  }

  get mode() {
    return this.rib ? 'ribbon' : 'ground';
  }

  setBounds() {
    const b = this.track.bounds();
    const m = CELL * 3;
    this.bx0 = b.minX - m; this.bx1 = b.maxX + m;
    this.skyY = b.maxY + 140;   // au-delà, une voiture en gravité inversée est perdue
    this.bz0 = b.minZ - m; this.bz1 = b.maxZ + m;
  }

  place(x, y, z, yaw, gs = 1) {
    this.pos.x = x; this.pos.y = y; this.pos.z = z;
    this.prev.x = x; this.prev.y = y; this.prev.z = z;
    this.vel.x = 0; this.vel.y = 0; this.vel.z = 0;
    this.yaw = yaw; this.prevYaw = yaw; this.yawRate = 0; this.omega = 0;
    this.steer = 0; this.steerAngle = 0; this.boost = 0; this.boostF = 1; this.slip = 0; this.airTime = 0; this.fwdSpeed = 0;
    this.driftT = 0; this.bounceCD = 0; this.driftCharge = 0; this.stunT = 0;
    this.pitch = 0; this.pitchRate = 0; this.landQ = ''; this.aoa = 0.08; this.glidePitch = 0; this.bankT = 0;
    this.rib = null;
    this.gravMul = 1;
    this.vehicle = 'car';
    this.gSign = gs < 0 ? -1 : 1;   // sens de la gravité : 1 normal, -1 inversée (vers le haut)
    this.lost = false;
    this._flipNow = false;
    this._springNow = false;
    this.cutT = 0;
    // Verre fragile (Phase 3) : temps de contact cumulé par dalle, et dalles brisées dans cette course (elles n'ont plus de collision).
    // Tout (re)départ — départ, réapparition, retour au checkpoint — les restaure.
    this.glassTime.clear(); this.broken.clear(); this.brokenVer++;
    this.graceT = 1.5;   // protection après un (re)départ : ni verre cassé ni piques (évite les boucles de retours)
    this.beltX = 0; this.beltZ = 0; this.beltS = 0;
    this.plateLock = '';
    this.sinkT = 0;
    this.hazardGrace = 0.8; // sécurité après respawn pour éviter les réapparitions en boucle
    const s = this.gSign > 0 ? this.track.surfaceAt(x, y + 0.5, z, this.surf, 3, this.excl, this.time) : this.track.ceilingSurfaceAt(x, y - 0.5, z, this.surf, 3, this.excl);
    if (this.gSign < 0) {
      this.n.x = 0; this.n.y = -1; this.n.z = 0;
      if (!Number.isFinite(s.h)) { s.h = y; s.type = 'none'; }
    }
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

  // Sens du « haut » local de la voiture : +1 toit vers le ciel, -1 retournée. Le volant fait tourner la voiture
  // AUTOUR de ce haut-là, pas autour du haut du monde (au plafond, la droite du pilote est la gauche du monde).
  // Au sol on le lit sur la normale du contact ; en l'air, c'est l'assiette, qui suit le sens de la gravité.
  _upSign() {
    if (this.grounded) {
      const ny = this.n.y;
      if (ny > 0.05) return 1;
      if (ny < -0.05) return -1;
    }
    return this.gSign;
  }

  _updateFwd() {
    if (this.rib) return;
    this.fwd.x = -dsin(this.yaw); this.fwd.y = 0; this.fwd.z = -dcos(this.yaw);
  }

  _setGround(s, triggers = true) {
    this.n.x = s.nx; this.n.y = s.ny; this.n.z = s.nz;
    this.surfType = s.type;
    this.surfMod = s.mod || '';
    this.surfTile = s.tile;
    // Pourcentage de réglage du revêtement touché (celui de la voie touchée pour une bifurcation à deux revêtements).
    this.surfPct = s.tile ? tileParam({ s: s.mod || '', p: s.p }) : 100;
    this.surfP = this.surfPct / 100;
    this.surfLx = s.lx; this.surfLz = s.lz;
    if (!triggers || !s.tile) return;
    const mod = this.surfMod;
    if (this._timedMods(mod)) return;
    if (mod === 'spring') {
      // Ressort latéral : une seule poussée par passage.
      if (this.plateLock !== 'spring') { this.plateLock = 'spring'; this.lockTile = s.tile; this._springNow = true; this.ev.spring = true; }
      return;
    }
    if (mod === 'boost') this._boostPad(this.surfP);
    else if (mod === 'gravity') this._gravityPad(this.surfP);
    else if (mod === 'flip' && this.plateLock !== 'flip') {
      // Inversion de gravité : une suite de plaques collées ne compte qu'une fois.
      this.plateLock = 'flip';
      this.lockTile = s.tile;
      this.gSign = -this.gSign;
      this._flipNow = true;
      this.ev.flip = true;
      return;
    }
    if (mod === 'flip') return;
    // Plaques de transformation (moto, bateau, deltaplane) : une suite de plaques collées
    // ne compte que pour UNE transformation ; repasser sur la même plaque ramène la voiture.
    if (PLATES[mod]) this._transformPlate(mod);
    else this.plateLock = '';
  }

  // Pastilles et plaques : mêmes effets au sol (_setGround) et sur un ruban (_ribStep).
  _boostPad(f) {
    if (this.boost < CAR.boostTime - 0.2) this.ev.boostHit = true;
    this.boost = CAR.boostTime;
    this.boostF = f;
  }

  _gravityPad(f) {
    if (Math.abs(f - this.gravMul) > 0.01) { this.gravMul = f; this.ev.gravity = true; }
  }

  // Plaques de transformation (moto, bateau, deltaplane) : une suite de plaques collées ne compte que pour UNE transformation ;
  // repasser sur la même plaque ramène la voiture.
  _transformPlate(mod) {
    if (this.plateLock === mod) return;
    this.plateLock = mod;
    this.vehicle = this.vehicle === PLATES[mod] ? 'car' : PLATES[mod];
    this.ev.transform = true;
  }

  // Revêtements qui modifient les commandes (volant inversé, moteur coupé) : actifs tant
  // qu'on roule dessus, puis encore un court instant.
  _timedMods(mod) {
    if (mod === 'reverse') { if (this.surfMod !== mod) this.ev.reverse = true; return true; }
    if (mod === 'cut') { if (this.cutT <= 0) this.ev.cut = true; this.cutT = CAR.cutTime; return true; }
    return false;
  }

  // Sens et vitesse du tapis roulant au point (lx, lz) de la pièce (repère monde).
  _pct(tile) {
    return tile === this.surfTile ? this.surfPct : tileParam(tile);
  }

  _belt(tile, lx, lz, out) {
    sampleLocal(tile, lx, lz, S1);
    const sp = beltSpeed(this._pct(tile));
    rotVec(tile.r, S1.gz, -S1.gx, W1);
    out.x = W1.x * sp; out.z = W1.z * sp;
    return out;
  }

  // Verre fragile (Phase 3) : plus de condition de vitesse. Chaque dalle a un compte à rebours de contact CUMULÉ (réglage de la
  // pièce, en secondes). Quand il est écoulé, la dalle est brisée : elle n'a plus aucune collision (la voiture tombe) jusqu'au
  // prochain (re)départ, qui la restaure. Renvoie true à l'instant où la dalle cède.
  _glassCheck(on, tile, dt) {
    if (!on || !tile || this.graceT > 0 || this.broken.has(tile)) return false;
    const t = (this.glassTime.get(tile) || 0) + dt;
    this.glassTime.set(tile, t);
    if (t < glassSeconds(this._pct(tile))) return false;
    this.broken.add(tile); this.brokenVer++;
    this.ev.glass = true; this.ev.glassTile = tile;
    return true;
  }

  // ---------------------------------------------------------------- Pneus
  // Angle des roues avant selon la vitesse : à haute vitesse, un petit angle suffit.
  _steerAngle(speed, drift) {
    const K = this.k;
    const v2 = Math.max(1, speed * speed);
    // Angle géométrique du virage limite + marge de dérive du pneu avant (saturation).
    const slipSat = (K.latGrip * K.frontShare) / K.corner;
    let max = Math.min(K.steerMax, datan((K.a + K.b) * K.steerAlat / v2) + slipSat);
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
    const maxR = K.latGrip * grip * (1 - K.frontShare) * (1 - (1 - K.driftRear) * drift) * (this.rearK ?? 1);
    if (Math.abs(vx) < 1.5) {
      // À très basse vitesse, le modèle de dérive (angles calculés avec une
      // vitesse plancher) peut générer une force latérale qui annule la traction,
      // surtout sur la glace où grip < 0.3. Garder une réponse longitudinale
      // déterministe et amortir la vitesse latérale selon l'adhérence évite le
      // blocage à l'arrêt tout en conservant davantage de glisse sur la glace.
      vx += ax * dt;
      const lateralDamp = clamp(0.35 + grip * 0.3, 0.35, 0.85);
      BK.vx = vx; BK.vy = vy * lateralDamp;
      BK.w = (vx * dtan(delta) / L) * clamp(grip, 0.2, 1);
      return BK;
    }
    const den = Math.max(Math.abs(vx), 6);
    const sgn = vx >= 0 ? 1 : -1;
    const af = datan2(vy + K.a * w, den) - delta * sgn;
    const ar = datan2(vy - K.b * w, den);
    const Ff = clamp(-K.corner * af, -maxF, maxF);
    const Fr = clamp(-K.corner * ar, -maxR, maxR);
    const cd = dcos(delta), sd = dsin(delta);
    // (La rotation du repère est prise en compte en reprojetant la vitesse à chaque pas.)
    vx += (ax - Ff * sd) * dt;
    vy += (Ff * cd + Fr) * dt;
    w += ((K.a * Ff * cd - K.b * Fr) / K.yawK - w * K.yawDamp) * dt;
    BK.vx = vx; BK.vy = vy; BK.w = w;
    return BK;
  }

  step(inp) {
    this._beginStep();
    inp = this._controls(inp);
    this._driftState(inp);
    if (this.rib) { this._ribStep(inp); return; }
    if (this.grounded) { if (this._driveGround(inp)) return; } else this._flyAir(inp);
    if (this._collide()) return;
    this._roadContact();
  }

  // Début de pas : minuteries, évènements remis à zéro, position précédente.
  _beginStep() {
    const dt = DT, p = this.pos, ev = this.ev;
    if (this.graceT > 0) this.graceT -= dt;
    ev.wall = 0; ev.land = 0; ev.boostHit = false; ev.bounce = false;
    if (this.hazardGrace > 0) this.hazardGrace = Math.max(0, this.hazardGrace - dt);
    ev.loopIn = false; ev.loopOut = false; ev.loopFall = false; ev.transform = false; ev.gravity = false; ev.miniTurbo = 0; ev.landQ = ''; ev.sink = false; ev.ring = false; ev.flip = false; ev.glass = false; ev.glassTile = null; ev.spring = false; ev.reverse = false; ev.cut = false; ev.spike = false; ev.shock = 0; ev.wallOff = false;
    this.prev.x = p.x; this.prev.y = p.y; this.prev.z = p.z;
    this.prevYaw = this.yaw;
  }

  // Commandes : volant inversé / moteur coupé, volant progressif, minuteries du boost, du rebond et du choc. Renvoie les commandes à appliquer.
  _controls(inp) {
    const dt = DT;
    // Volant inversé / moteur coupé : les commandes sont modifiées un court instant.
    // Volant inversé : seulement tant que les roues touchent une pièce qui l'a (ruban : la pièce sous les roues ;
    // sol : surfMod est celui du dernier contact, donc il ne compte que si on est posé). En l'air, volant normal.
    const reverseActive = this.rib ? this.rib.tile.s === 'reverse' : this.grounded && this.surfMod === 'reverse';
    if (reverseActive) inp = { ...inp, steer: -(inp.steer || 0) };
    if (this.cutT > 0) { this.cutT -= dt; if (inp.throttle) inp = { ...inp, throttle: false }; }
    // Volant progressif (retour au centre plus rapide).
    const target = clamp(inp.steer || 0, -1, 1);
    const back = Math.abs(target) < Math.abs(this.steer) || target * this.steer < 0;
    const K = this.k;
    const sr = (back ? K.steerOut : K.steerIn) * dt;
    this.steer += clamp(target - this.steer, -sr, sr);
    if (this.boost > 0) this.boost = Math.max(0, this.boost - dt);
    if (this.bounceCD > 0) this.bounceCD -= dt;
    if (this.stunT > 0) this.stunT = Math.max(0, this.stunT - dt);
    return inp;
  }

  // État de dérapage et mini-turbo.
  _driftState(inp) {
    const dt = DT, K = this.k, ev = this.ev;
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
  }

  // Voiture posée sur une route ou sur le terrain : dynamique dans le plan du sol, revêtement, tapis, pièces mobiles. Renvoie true si le pas se termine ici (noyade).
  _driveGround(inp) {
    const dt = DT, v = this.vel, K = this.k;
    let fx = -dsin(this.yaw), fy = 0, fz = -dcos(this.yaw);
    const n = this.n;
    const d = fx * n.x + fy * n.y + fz * n.z;
    fx -= n.x * d; fy -= n.y * d; fz -= n.z * d;
    let len = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
    fx /= len; fy /= len; fz /= len;
    let rx = fy * n.z - fz * n.y, ry = fz * n.x - fx * n.z, rz = fx * n.y - fy * n.x;
    len = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
    rx /= len; ry /= len; rz /= len;

    // Tapis roulant : la voiture roule sur une bande qui avance ; la dynamique se fait
    // dans le repère de la bande, puis on rajoute sa vitesse.
    // En montant sur la bande, la voiture prend sa vitesse d'un coup (et la garde en sortant).
    let belt = this.surfMod === 'conveyor' && this.surfTile ? this._belt(this.surfTile, this.surfLx, this.surfLz, BELT) : null;
    // Pièce mobile (glissière, rotation) : la voiture est portée par la pièce, comme par un tapis.
    // Rotation : vitesse du sol au point de contact = ω × r ; la voiture tourne aussi avec la pièce (même cap).
    if (this.surfTile && this.surfTile.mv >= 2) {
      const o = this.track.moverOffset(this.surfTile, this.time, MOV);
      if (!belt) { belt = BELT; BELT.x = 0; BELT.z = 0; }
      if (this.surfTile.mv === 2) { belt.x += o.vx; belt.z += o.vz; }
      else {
        belt.x += o.w * (this.pos.z - o.cz); belt.z -= o.w * (this.pos.x - o.cx);
        this.yaw += o.w * dt;
      }
    }
    if (belt) {
      v.x += belt.x - this.beltX; v.z += belt.z - this.beltZ;
      this.beltX = belt.x; this.beltZ = belt.z;
      v.x -= belt.x; v.z -= belt.z;
    } else { this.beltX = 0; this.beltZ = 0; }
    let vf = v.x * fx + v.y * fy + v.z * fz;
    let vr = v.x * rx + v.y * ry + v.z * rz;
    const g = this.g * this.gSign;
    vf -= g * fy * dt;
    vr -= g * ry * dt;

    // Effet du revêtement (le paramètre f vaut 1 à 100 %).
    const mod = this.surfMod, f = this.surfP;
    const ground = this.surfType === 'ground';
    const C = surfaceCoeffs(ground ? '' : mod, f);
    let grip = C.grip, traction = C.traction, vmaxK = C.vmaxK, extraDrag = C.extraDrag;
    const rearK = C.rearK;
    if (this.stunT > 0) { grip *= CAR.stunGrip; traction *= CAR.stunTraction; }       // choc contre un mur : la voiture encaisse
    if (ground) { grip = 0.55; traction = 0.7; vmaxK = 0.45; extraDrag = 5; }
    else if (mod === 'water' || (mod === 'boat' && this.vehicle === 'boat')) {      // la plaque bateau agit comme de l'eau pour un bateau seulement (route normale pour les autres)
      if (this.vehicle === 'boat') { grip = 0.85; traction = 1; vmaxK = 1; }
      else {
        // Une voiture dans l'eau : elle patine, se noie si elle s'arrête.
        grip = 0.35; traction = 0.3; vmaxK = 0.3; extraDrag = 9;
        if (this.graceT <= 0 && Math.abs(vf) < 5) this.sinkT += dt; else this.sinkT = Math.max(0, this.sinkT - dt);
        if (this.sinkT > 1.2) { this.sinkT = 0; this.ev.sink = true; }
      }
    }
    else if (mod === 'wind') {
      const a = ((this._pct(this.surfTile) - 100) / 100) * CAR.wind;
      rotVec(this.surfTile.r, 1, 0, TMP);
      vf += (TMP.x * fx + TMP.z * fz) * a * dt;
      vr += (TMP.x * rx + TMP.z * rz) * a * dt;
    }

    // Le bateau hors de l'eau racle la route.
    const wet = mod === 'water' || mod === 'boat';
    if (this.vehicle === 'boat' && !wet) { grip = Math.min(grip, 0.8); traction *= 0.4; vmaxK = Math.min(vmaxK, 0.3); extraDrag += 7; }
    if (!wet) this.sinkT = 0;
    const P = this.params;
    if (P.grip !== 1) grip *= P.grip;                                       // adhérence de tout le circuit
    if (P.windOn) { vf += (P.windX * fx + P.windZ * fz) * dt; vr += (P.windX * rx + P.windZ * rz) * dt; }      // vent de tout le circuit
    const E = this.env;
    if (E) {                                                                // environnement (sim/env.js) : pluie et flaques hors de l'eau, givre, rafales
      const st = this.clock || 0;
      if (!wet) grip *= E.gripAt(this.pos.x, this.pos.y, this.pos.z, st);
      if (E.gust) { const g = E.gustAt(st); vf += (g.x * fx + g.z * fz) * dt; vr += (g.x * rx + g.z * rz) * dt; }
    }
    const ax = (this._longitudinal(vf, inp, K.maxSpeed * vmaxK, traction, extraDrag, dt) - vf) / dt;
    this.rearK = rearK;
    const r = this._tires(vf, vr, this.omega, ax, grip, dt);
    this.rearK = 1;
    vf = r.vx; vr = r.vy; this.omega = r.w;
    const us = this._upSign();
    this.yaw -= this.omega * us * dt;   // rotation autour du haut local
    this.yawRate = -this.omega * us;

    v.x = fx * vf + rx * vr;
    v.y = fy * vf + ry * vr;
    v.z = fz * vf + rz * vr;
    if (belt) { v.x += belt.x; v.z += belt.z; }
    if (this._glassCheck(mod === 'glass', this.surfTile, dt)) this.grounded = false;      // la dalle cède : la voiture tombe
    if (this.ev.sink) return true;
    this.slip = Math.abs(vr);
    this.fwdSpeed = vf;
    this.airTime = 0;
    this.pitch = dasin(clamp(fy, -1, 1));   // assiette au sol : sert d'assiette de départ en l'air
    this.pitchRate = 0;
    return false;
  }

  // En l'air : trajectoire balistique, rotation, tangage, vol plané.
  _flyAir(inp) {
    const dt = DT, v = this.vel, K = this.k;
    let fx = -dsin(this.yaw), fz = -dcos(this.yaw);
    // En l'air : trajectoire balistique, la voiture garde son cap (le volant ne
    // tourne que les roues). La rotation acquise au décollage s'amortit doucement.
    // Exception : le deltaplane plane et vire en inclinant son aile.
    if (this.vehicle === 'glider') { this._glide(inp, dt); fx = -dsin(this.yaw); fz = -dcos(this.yaw); }
    else v.y -= this.g * this.gSign * dt;
    this.omega *= dexp(-1.5 * dt);
    // Un tout petit peu de contrôle en l'air : le volant fait pivoter la voiture lentement.
    if (this.vehicle !== 'glider') this.omega = clamp(this.omega + this.steer * CAR.airSteer * dt, -CAR.airSteerMax, CAR.airSteerMax);
    const us = this._upSign();
    this.yaw -= this.omega * us * dt;
    this.yawRate = -this.omega * us;
    this.steerAngle = this._steerAngle(hypot2(v.x, v.z), this.driftT);
    const k = 1 - 0.0006 * this.speed * dt;
    v.x *= k; v.y *= k; v.z *= k;
    this.slip = 0;
    this.fwdSpeed = v.x * fx + v.z * fz;
    this.airTime += dt;
    // Tangage : gaz = le nez plonge, frein = le nez se lève. Sans action, la voiture
    // garde son assiette (sa rotation s'amortit).
    const pin = this.vehicle === 'glider' ? 0 : (inp.brake ? 1 : 0) - (inp.throttle ? 1 : 0);
    // Relever le nez (S) est plus vif que plonger : on remet vite la voiture à plat.
    this.pitchRate += pin * this.gSign * K.airPitchAcc * (pin > 0 ? CAR.airPitchUpK : 1) * dt;   // au plafond, « nez en haut » = vers le bas du monde
    this.pitchRate *= dexp(-CAR.airPitchDamp * dt);
    if (this.vehicle === 'glider') this.pitch = this.glidePitch;
    else this.pitch = clamp(this.pitch + this.pitchRate * dt, -1.4, 1.4);
  }

  // Déplacement puis collisions (anneaux, entrée de ruban, murs, toits, dalles, obstacles, limites). Renvoie true si le pas se termine ici.
  _collide() {
    const dt = DT, p = this.pos, v = this.vel;
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    this._rings();
    if (this.ev.sink) return true;
    if (this._tryEnterRibbon()) return true;
    if (!this.grounded && this._tryLandRibbon()) return true;
    this._walls();
    this._tunnelRoof();
    this._slabs();
    this._obstacles();
    if (this.ev.sink) return true; // fin immédiate du pas après un contact létal
    this._bounds();
    return false;
  }

  // Contact avec la chaussée : adhérence, décollage, réception, revêtements à effet unique (rebond, inversion, ressort).
  _roadContact() {
    const dt = DT, p = this.pos, v = this.vel, ev = this.ev;
    // Contact avec la chaussée.
    // En gravité inversée, le « sol » est le dessous des pièces posées à l'envers.
    const gs = this.gSign;
    const s = gs > 0 ? this.track.surfaceAt(p.x, p.y, p.z, this.surf, CAR.step, this.excl, this.time) : this.track.ceilingSurfaceAt(p.x, p.y, p.z, this.surf, CAR.step, this.excl);
    const gap = gs * (p.y - s.h);
    const vn = v.x * s.nx + v.y * s.ny + v.z * s.nz;
    // Aimant : la voiture reste collée à la route quoi qu'il arrive (bosses, vitesse).
    const magnet = s.mod === 'magnet';
    const launch = magnet ? Infinity : CAR.launch;
    const snap = magnet ? CAR.step : CAR.snap;
    // Aimant : au-dessus d'une route aimantée, la voiture est attirée vers la surface le long de SA normale, pas selon
    // la gravité du monde. Endroit ou envers, c'est la même règle (au plafond, la normale pointe vers le bas du monde).
    if (!this.grounded) {
      const m = gs > 0 ? this.track.surfaceAt(p.x, p.y, p.z, this.surfM, CAR.magnetRange, this.excl, this.time) : this.track.ceilingSurfaceAt(p.x, p.y, p.z, this.surfM, CAR.magnetRange, this.excl);
      const mg = gs * (p.y - m.h);
      if (m.mod === 'magnet' && mg > 0.02 && mg < CAR.magnetRange) {
        const a = CAR.magnetAcc * (1 - mg / CAR.magnetRange) * dt;
        v.x -= m.nx * a; v.y -= m.ny * a; v.z -= m.nz * a;
      }
    }
    // Décollage : seule compte la vitesse avec laquelle la route « tombe » sous la voiture (vn = vitesse × sinus de l'angle de raccord), sans
    // exemption d'angle. Un raccord doux (pente, bosse, sommet de côte) pris lentement reste collé à la route, le même pris à 300 km/h décolle.
    // Un vol de moins de 0,35 s ne coûte rien à la réception.
    const stick = vn < launch;
    if (this.grounded && gap < snap && gap > -CAR.step && stick) {
      p.y = s.h;
      const sp = this.speed;
      v.x -= s.nx * vn; v.y -= s.ny * vn; v.z -= s.nz * vn;
      const sp2 = this.speed;
      if (sp2 > 1e-4) { const k = sp / sp2; v.x *= k; v.y *= k; v.z *= k; }
      this._setGround(s);
    } else if (!this.grounded && gap <= 0.02 && gap > -CAR.step && vn <= 0.5) {
      p.y = s.h;
      // Une nouvelle plaque peut agir (mais pas la même, si on retombe dessus).
      if ((this.plateLock === 'flip' || this.plateLock === 'spring') && s.tile !== this.lockTile) this.plateLock = '';
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
    // Plaque d'inversion : la voiture est projetée vers le nouveau « bas ».
    if (this._flipNow) {
      this._flipNow = false;
      const n = this.n;
      v.x += n.x * CAR.flipKick; v.y += n.y * CAR.flipKick; v.z += n.z * CAR.flipKick;
      this.grounded = false;
      this.pitch = dasin(clamp(this.fwd.y, -1, 1));
      this.airTime = 0;
    }
    // Ressort latéral : poussée sur le côté (vers la droite de la pièce si réglage > 100 %)
    // et petit saut pour passer par-dessus la bordure.
    if (this._springNow) {
      this._springNow = false;
      const t = this.surfTile;
      if (t) {
        sampleLocal(t, this.surfLx, this.surfLz, S1);
        rotVec(t.r, S1.gx, S1.gz, W1);
        const k = ((this._pct(t) - 100) / 100) * CAR.spring;
        const n = this.n;
        v.x += W1.x * k + n.x * CAR.springHop; v.y += n.y * CAR.springHop; v.z += W1.z * k + n.z * CAR.springHop;
        this.grounded = false;
        this.pitch = dasin(clamp(this.fwd.y, -1, 1));
        this.airTime = 0;
      }
    }
    // Gravité inversée sans plafond : la voiture finit perdue dans le ciel.
    if (gs < 0 && !this.grounded && p.y > this.skyY) this.lost = true;
    this._updateFwd();
  }

  // Nouvelle vitesse longitudinale : moteur, freins, résistances.
  // load : part du poids qui appuie les roues sur la route (1 au sol, 0 sur un mur vertical).
  _longitudinal(vf, inp, vmax, traction, extraDrag, dt, load = 1) {
    const K = this.k;
    let a = 0;
    if (inp.throttle) {
      if (vf < -0.5) a += K.brake * traction;
      else { const x = Math.max(0, vf / vmax); a += K.accel * traction * (1 - dpow(x, CAR.accelCurve)); }
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

  // ---------------------------------------------------------------- Obstacles
  // ---------------------------------------------------------------- Rubans
  // Vol plané du deltaplane : portance perpendiculaire à la vitesse, traînée,
  // incidence pilotée (gaz = piquer, frein = cabrer), virage incliné au volant.
  _glide(inp, dt) {
    const v = this.vel, G = GLIDE;
    const hv = hypot2(v.x, v.z);
    const sp = Math.max(1e-3, hypot2(hv, v.y));
    const aoaT = inp.brake ? G.up : inp.throttle ? G.down : G.trim;
    this.aoa += (aoaT - this.aoa) * Math.min(1, dt * 3);
    let L = G.lift * sp * sp * Math.max(0, 0.6 + 4 * this.aoa);
    L = Math.min(L, G.liftMaxG * this.g);
    const D = G.drag * sp * sp + G.induced * L;
    const dx = v.x / sp, dy = v.y / sp, dz = v.z / sp;
    const gu = this.gSign;   // « haut » selon la gravité
    let lx = -dx * dy * gu, ly = (1 - dy * dy) * gu, lz = -dz * dy * gu;
    const ll = hypot3(lx, ly, lz) || 1;
    lx /= ll; ly /= ll; lz /= ll;
    v.x += (L * lx - D * dx) * dt;
    v.y += (L * ly - D * dy - this.g * gu) * dt;
    v.z += (L * lz - D * dz) * dt;
    // Virage : l'aile s'incline, la trajectoire et le nez tournent ensemble.
    // Roulis : le virage suit le volant avec un petit retard (aile qui s'incline), plus vif et utilisable dès 9 m/s.
    this.bankT = (this.bankT || 0) + (this.steer - (this.bankT || 0)) * Math.min(1, dt * G.turnRamp);
    const yr = this.bankT * G.turn * Math.min(1, hv / G.turnSpeed);
    const a = -yr * gu * dt, c = dcos(a), s = dsin(a);
    const vx = v.x * c + v.z * s, vz = v.z * c - v.x * s;
    v.x = vx; v.z = vz;
    this.yaw += a;
    this.omega = yr;
    const traj = datan2(v.y, Math.max(1e-3, hypot2(v.x, v.z)));
    this.glidePitch = traj + this.aoa;
  }

  // Anneaux turbo : traverser le disque donne une poussée.
  _rings() {
    const p = this.pos, q = this.prev;
    const tiles = this.track.tilesAt(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    for (const tile of tiles) {
      if (tile.t !== 'ring' && !tile.tb) continue;      // anneau turbo : pièce flottante ou option d'une ligne droite
      if (this.excl !== this.broken && this.excl.has(tile)) continue;      // caché par la logique du circuit
      toLocal(tile, p.x, p.z, L1);
      toLocal(tile, q.x, q.z, L2);
      if (L1.lz * L2.lz > 0 || L1.lz === L2.lz) continue;
      const k = L2.lz / (L2.lz - L1.lz);
      const lx = L2.lx + (L1.lx - L2.lx) * k, y = q.y + (p.y - q.y) * k;
      const cy = tile.l * LEVEL_H + ROAD_TOP + RING_Y;
      if (hypot2(lx, y - cy) > RING_R) continue;
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
    const c = dcos(this.pitch), sn = dsin(this.pitch);
    const fx = -dsin(this.yaw) * c, fy = sn, fz = -dcos(this.yaw) * c;
    const mis = Math.abs(dasin(clamp(fx * nx + fy * ny + fz * nz, -1, 1)));
    const hv = hypot2(v.x, v.z);
    let side = 0;
    if (hv > 4) {
      const hx = -dsin(this.yaw), hz = -dcos(this.yaw);
      side = dacos(clamp((v.x * hx + v.z * hz) / hv, -1, 1));
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

}

// Les familles de méthodes vivent dans physics/ ; elles s'ajoutent au prototype (`this` est la voiture).
Object.assign(CarPhysics.prototype, wallMethods, obstacleMethods, ribbonMethods);
