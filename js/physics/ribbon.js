// Conduite sur les rubans 3D (loopings, vrilles, tubes, murs, plafond) : entrée, conduite, sortie et raccord d'un ruban à l'autre.
// Ces méthodes s'ajoutent au prototype de CarPhysics (voir physics.js) : `this` est la voiture.
import { CELL, DT, ROAD_HALF } from '../constants.js';
import { PIECES, PLATES, rotVec, tileCenter, isRibbon, tileParam, beltSpeed, isSideTile, hasNoRails } from '../pieces.js';
import { ribbonOf, frameLocal } from '../ribbons.js';
import { RAIN_GRIP } from '../sim/env.js';
import { CAR, SIDE_AERO, SIDE_HOLD, SIDE_MIN_SPEED, SIDE_GRACE, surfaceCoeffs } from './specs.js';
import { clamp } from '../mathutil.js';
import { dasin, datan2, dcos, dsin, hypot2, hypot3 } from '../dmath.js';

const FL = {};
const CC = { x: 0, z: 0 };
const TMP = { x: 0, z: 0 };
const BASIS = { e1x: 0, e1y: 0, e1z: 0, e2x: 0, e2y: 0, e2z: 0 };

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

export const ribbonMethods = {
  // Sur un ruban, l'état est exprimé dans le plan de la route :
  //   e1 = sens de parcours, e2 = droite, n = normale.
  //   vs, vd : vitesse le long de e1 / e2 ; psi : cap de la voiture par rapport à e1.
  // Le résultat est un tampon partagé : valable jusqu'au prochain appel (chaque appelant l'utilise aussitôt).
  _basis(R, F) {
    const d = R.dir;
    BASIS.e1x = F.tx * d; BASIS.e1y = F.ty * d; BASIS.e1z = F.tz * d;
    BASIS.e2x = F.rx * d; BASIS.e2y = F.ry * d; BASIS.e2z = F.rz * d;
    return BASIS;
  },

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
        if (!isRibbon(tile) || this.excl.has(tile)) continue;
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
          R.psi = datan2(h.x * B.e2x + h.y * B.e2y + h.z * B.e2z, h.x * B.e1x + h.y * B.e1y + h.z * B.e1z);
          this.rib = R;
          this.ev.loopIn = true;
          this._ribPlace(R);
          return true;
        }
      }
    }
    return false;
  },

  // Atterrissage en plein milieu d'un ruban (retombée sur le haut d'un L, au fond d'un looping...).
  _tryLandRibbon() {
    const p = this.pos, q = this.prev, v = this.vel;
    const tiles = this.track.tilesAt(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    for (const tile of tiles) {
      if (!isRibbon(tile) || this.excl.has(tile)) continue;
      const rib = ribbonOf(tile);
      // Point du ruban le plus proche (recherche grossière puis affinage).
      let bu = -1, bd = Infinity;
      for (let i = 0; i <= 32; i++) {
        const F = frameWorld(tile, rib, i / 32, this.F);
        const dx = p.x - F.px, dy = p.y - F.py, dz = p.z - F.pz;
        const d = dx * dx + dy * dy + dz * dz;
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
      if (F.ny * this.gSign < 0.2) continue;            // on ne se pose que sur une route face à la gravité
      const dn = (p.x - F.qx) * F.nx + (p.y - F.qy) * F.ny + (p.z - F.qz) * F.nz;
      const dq = (q.x - F.qx) * F.nx + (q.y - F.qy) * F.ny + (q.z - F.qz) * F.nz;
      const vn = v.x * F.nx + v.y * F.ny + v.z * F.nz;
      if (!(dn <= 0.05 && dq >= -0.3 && dn > -1.5 && vn < 0)) continue;
      if (Math.abs(dl) > ROAD_HALF + (hasNoRails(tile) ? 0 : 0.3)) continue;
      const vt = v.x * F.tx + v.y * F.ty + v.z * F.tz;
      const R = { tile, rib, u, dir: vt >= 0 ? 1 : -1, dl: 0, vs: 0, vd: 0, psi: 0 };
      R.dl = clamp(dl * R.dir, -ROAD_HALF + 1, ROAD_HALF - 1) * R.dir;
      const B = this._basis(R, F);
      R.vs = v.x * B.e1x + v.y * B.e1y + v.z * B.e1z;
      R.vd = v.x * B.e2x + v.y * B.e2y + v.z * B.e2z;
      const h = this.fwd;
      R.psi = datan2(h.x * B.e2x + h.y * B.e2y + h.z * B.e2z, h.x * B.e1x + h.y * B.e1y + h.z * B.e1z);
      this.ev.land = -vn;
      const kq = this._landing(F.nx, F.ny, F.nz);
      R.vs *= kq; R.vd *= kq;
      this.rib = R;
      this._ribPlace(R);
      return true;
    }
    return false;
  },

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
      c = dcos(phi); s = dsin(phi);
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
  },

  _ribStep(inp) {
    const R = this.rib, dt = DT, tile = R.tile, rib = R.rib;
    const F = frameWorld(tile, rib, R.u, this.F);

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
    const B = this._basis(R, F);

    // Inversion de gravité sur un ruban (vrille, looping, transition mur <-> plafond...) : la gravité suit la route. Sur le plan vertical
    // exact (mur) la gravité reste normale : la marge de 3° évite de rester « à l'envers » en revenant d'un plafond sur un mur.
    if (tile.s === 'flip' || PIECES[tile.t].autoFlip) {
      const ng = F.ny >= -0.05 ? 1 : -1;
      if (ng !== this.gSign) { this.gSign = ng; this.ev.flip = true; }
    }
    // Gravité projetée dans le plan de la route (vrille, mur, envers, paroi du tube...).
    const g = this.g * this.gSign;
    // Route sur le côté (pièces 90°) : l'appui aérodynamique (vitesse²) compense la glissade le long du plan ; la gravité, elle, ne change pas.
    // En dessous de ~80 km/h il ne compense plus assez : la voiture glisse vers le bord du bas et tombe.
    const sidePiece = isSideTile(tile);
    const hold = sidePiece ? Math.min(1, SIDE_HOLD * R.vs * R.vs / Math.max(1, this.g)) : 0;
    R.vs -= g * B.e1y * dt;
    R.vd -= g * B.e2y * dt * (1 - hold);
    // Décrochage : sur un plan penché de plus de 45°, sans la vitesse minimale la voiture ne tient pas (plus de « magie »). Après un court
    // délai elle quitte la paroi et tombe, avec la vitesse qu'elle avait.
    if (sidePiece && Math.abs(F.ny) < 0.7 && Math.abs(R.vs) < SIDE_MIN_SPEED) {
      R.lowT = (R.lowT || 0) + dt;
      if (R.lowT > SIDE_GRACE) { this.ev.wallOff = true; this._ribPlace(R); this._ribDetach(); return; }
    } else if (R.lowT) R.lowT = Math.max(0, R.lowT - 2 * dt);
    R.psi -= R.dir * kg * R.vs * dt;

    // Revêtements actifs sur ce ruban : mêmes effets qu'au sol, sans aide particulière.
    const mod = tile.s, f = tileParam(tile) / 100;
    const C = surfaceCoeffs(mod, f);
    const extraDrag = C.extraDrag, vmaxK = C.vmaxK, rearK = C.rearK;
    let gripK = C.grip, tractK = C.traction, beltE1 = 0;
    if (this.stunT > 0) { gripK *= CAR.stunGrip; tractK *= CAR.stunTraction; }       // choc contre une paroi : la voiture encaisse
    const P = this.params;
    if (P.grip !== 1) gripK *= P.grip;                                       // adhérence de tout le circuit (sim/params.js)
    if (P.windOn) { R.vs += (P.windX * B.e1x + P.windZ * B.e1z) * dt; R.vd += (P.windX * B.e2x + P.windZ * B.e2z) * dt; }      // vent de tout le circuit
    const E = this.env;
    if (E) {                                                                 // environnement (sim/env.js) : la pluie mouille aussi les rubans (pas de flaques), rafales
      const st = this.clock || 0;
      if (E.rain && mod !== 'water') gripK *= 1 - RAIN_GRIP * E.rainAt(st);
      if (E.gust) { const g = E.gustAt(st); R.vs += (g.x * B.e1x + g.z * B.e1z) * dt; R.vd += (g.x * B.e2x + g.z * B.e2z) * dt; }
    }
    if (mod === 'boost') this._boostPad(f);
    else if (mod === 'gravity') this._gravityPad(f);
    else if (mod === 'wind') {
      // Vent : soufflé selon l'axe latéral de la pièce, projeté dans le plan de la route.
      const a = ((tileParam(tile) - 100) / 100) * CAR.wind;
      rotVec(tile.r, 1, 0, TMP);
      R.vs += (TMP.x * B.e1x + TMP.z * B.e1z) * a * dt;
      R.vd += (TMP.x * B.e2x + TMP.z * B.e2z) * a * dt;
    } else if (mod === 'conveyor') beltE1 = beltSpeed(tileParam(tile)) * R.dir;
    else if (mod === 'spring' && this.plateLock !== 'spring') {
      this.plateLock = 'spring'; this.ev.spring = true;
      R.vd += ((tileParam(tile) - 100) / 100) * CAR.spring * R.dir;
    } else if (PLATES[mod]) this._transformPlate(mod);
    else this._timedMods(mod);
    if (!PLATES[mod] && mod !== 'spring' && mod !== 'flip') this.plateLock = '';
    R.vs += beltE1 - this.beltS;   // même prise de vitesse en montant sur un tapis de ruban
    this.beltS = beltE1;

    // Pneus dans le repère voiture.
    // Appui réel des roues : gravité normale + effet de la courbure (centrifuge).
    // Au sol plat il vaut g ; sur un mur vertical, 0 ; à l'envers sur du plat, -g.
    // Route sur le côté (90°) : l'appui vient aussi de la vitesse (SIDE_AERO), jamais d'un changement de gravité.
    let press = R.vs * R.vs * kn + R.vd * R.vd * kc + g * F.ny;
    if (sidePiece) press += SIDE_AERO * R.vs * R.vs * Math.sqrt(Math.max(0, 1 - F.ny * F.ny));      // appui aérodynamique, nul à plat, maximal à la verticale
    const gAbs = this.g;
    // Conduite identique au sol sur les pièces spéciales (virages relevés, tubes, loopings,
    // tire-bouchons) tant que la voiture est plaquée. Seule la montée en L garde la
    // physique d'appui réelle : sur le mur vertical, plus d'adhérence ni de moteur.
    const lPiece = tile.t === 'wall' || tile.t === 'ramp90' || tile.t === 'crest90' || !!sidePiece;
    // Vrille : la voiture est guidée par la route sur toute la pièce, appui ou pas (elle garde son adhérence et son moteur).
    const guided = tile.t === 'twist';
    const load = lPiece ? clamp(press / gAbs, 0, 1.6) : press > 0 || guided ? 1 : 0;
    this.press = press;
    R.vs -= beltE1;   // tapis roulant : dynamique dans le repère de la bande
    const c = dcos(R.psi), s = dsin(R.psi);
    let vx = R.vs * c + R.vd * s, vy = -R.vs * s + R.vd * c;
    const ax = (this._longitudinal(vx, inp, this.k.maxSpeed * vmaxK, Math.min(1, load) * tractK, extraDrag, dt, Math.min(1, load)) - vx) / dt;
    // Ruban posé à l'envers (miroir) : son axe latéral pointe vers la gauche du pilote.
    // Les commandes restent dans le repère du pilote, même sur une pièce inversée.
    // Le repère latéral du ruban est déjà orienté par sa normale : ne pas inverser
    // le volant une seconde fois sur les sections retournées.
    this.rearK = rearK;
    const t = this._tires(vx, vy, this.omega, ax, load * gripK, dt);
    this.rearK = 1;
    vx = t.vx; vy = t.vy; this.omega = t.w;
    // Retour dans le plan de la route avec le MÊME cap, puis la voiture pivote.
    R.vs = vx * c - vy * s + beltE1;
    R.vd = vx * s + vy * c;
    if (this._glassCheck(mod === 'glass', tile, dt)) { this._ribPlace(R); this._ribDetach(); return; }      // la dalle cède : la voiture se détache et tombe
    if (this.ev.sink) { this._ribPlace(R); return; }
    R.psi += this.omega * dt;
    this.yawRate = -this.omega;
    this.fwdSpeed = vx;
    this.slip = Math.abs(vy);

    // Avancée le long du ruban et écart latéral.
    R.dl += R.dir * R.vd * dt;
    const hw = F.hw || ROAD_HALF;
    if (F.wrap) {
      // Tube : pas de bord, on peut faire le tour.
    } else if (hasNoRails(tile) || Math.abs(R.dl) > hw + 1.5) {
      // Sans bordure, ou voiture restée haut sur la paroi quand le tube se rouvre.
      if (Math.abs(R.dl) > hw + 0.3) { this._ribPlace(R); this._ribDetach(); return; }
    } else {
      const lim = hw - CAR.radius - 0.2;
      if (Math.abs(R.dl) > lim) {
        const side = Math.sign(R.dl) * R.dir;          // côté du mur, dans l'axe e2
        const into = R.vd * side;                      // vitesse vers le mur
        R.vs *= Math.max(0, 1 - CAR.wallScrape * dt);    // frottement contre la paroi
        if (into > 0) {
          if (into > 2) this.ev.wall = into;
          R.vs *= 1 - Math.min(CAR.wallLossMax, into * CAR.wallLoss);      // perte proportionnelle à l'impact
          R.vd -= side * into * (1 + CAR.wallE);                            // rebond
          if (into > 1.5) {
            R.psi += -side * Math.min(CAR.wallSpinMax, into * CAR.wallSpin) * 0.3;       // le choc fait pivoter la voiture
            this.stunT = Math.max(this.stunT, Math.min(0.8, 0.1 + into * CAR.wallStun));
          }
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
        this.vel.y += Math.sqrt(2 * this.g * hop) * this.gSign;
        this._ribDetach();
        return;
      }
    } else if (press < -0.6 && R.u > mu && R.u < 1 - mu && mod !== 'magnet') {
      this._ribPlace(R);
      this._ribDetach();
      return;
    }
    this._ribPlace(R);
    this._ribObstacles(R);
  },

  // Obstacles (piques, bumpers, marteaux...) sur un ruban (looping, mur, tube, vrille) : avant 0.9.48 ils n'agissaient que sur les routes
  // posées au sol (_collide n'est jamais appelé en mode ruban) : la voiture les traversait. Le contact est calculé comme au sol (même
  // fonction), puis le déplacement et la vitesse obtenus sont ramenés dans le repère du ruban (abscisse u, écart latéral dl, vitesses vs / vd).
  // Un choc ne détache jamais la voiture du ruban (comme un mur) : seule la physique du ruban décide du décrochage.
  _ribObstacles(R) {
    if (!this.track.obstacles.length || this.hazardGrace > 0) return;
    const p = this.pos, v = this.vel;
    const x0 = p.x, y0 = p.y, z0 = p.z;
    this._obstacles();
    if (this.ev.sink) return;                                   // contact létal (piques) : fin du pas
    const dx = p.x - x0, dy = p.y - y0, dz = p.z - z0;
    if (dx === 0 && dy === 0 && dz === 0 && this.ev.shock === 0) { this.grounded = true; return; }
    const F = this._cross(R, frameWorld(R.tile, R.rib, R.u, this.F));
    const B = this._basis(R, F);
    R.vs = v.x * B.e1x + v.y * B.e1y + v.z * B.e1z;
    R.vd = v.x * B.e2x + v.y * B.e2y + v.z * B.e2z;
    R.u = clamp(R.u + (R.dir * (dx * B.e1x + dy * B.e1y + dz * B.e1z)) / F.ds, 0, 1);
    if (!F.wrap) {
      const lim = (F.hw || ROAD_HALF) - 0.2;
      R.dl = clamp(R.dl + R.dir * (dx * B.e2x + dy * B.e2y + dz * B.e2z), -lim, lim);
    } else R.dl += R.dir * (dx * B.e2x + dy * B.e2y + dz * B.e2z);
    this._ribPlace(R);                                          // (remet aussi grounded = true : _obstacles l'avait peut-être levé)
  },

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
    const c = dcos(R.psi), s = dsin(R.psi);
    this.fwd.x = B.e1x * c + B.e2x * s; this.fwd.y = B.e1y * c + B.e2y * s; this.fwd.z = B.e1z * c + B.e2z * s;
    if (hypot2(this.fwd.x, this.fwd.z) > 0.3) this.yaw = datan2(-this.fwd.x, -this.fwd.z);
    this.grounded = true;
    this.surfType = 'road';
    this.surfMod = R.tile.s || '';
  },

  _ribDetach() {
    this.pitch = dasin(clamp(this.fwd.y, -1, 1)); this.pitchRate = 0; this.airTime = 0;
    const t = this.rib && this.rib.tile;
    this.fallWhy = this.ev.wallOff ? 'wall' : t && PIECES[t.t].kind === 'loop' ? 'loop' : t && t.t === 'twist' ? 'twist' : t && t.v ? 'inv' : 'crest';
    this.rib = null;
    this.grounded = false;
    this.ev.loopFall = true;
  },

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
      const v = this.vel;
      if (F.kc > 1e-4 && F2.kc > 1e-4) {
        // Tube -> tube : on garde la position sur la paroi (même au plafond).
        N.dl = R.dl * Math.sign(F.rx * F2.rx + F.ry * F2.ry + F.rz * F2.rz || 1);
      } else {
        N.dl = clamp((px - F2.px) * F2.rx + (py - F2.py) * F2.ry + (pz - F2.pz) * F2.rz, -ROAD_HALF + 1, ROAD_HALF - 1);
      }
      this._cross(N, F2);
      const B2 = this._basis(N, F2);
      N.vs = v.x * B2.e1x + v.y * B2.e1y + v.z * B2.e1z;
      N.vd = v.x * B2.e2x + v.y * B2.e2y + v.z * B2.e2z;
      const h = this.fwd;
      N.psi = datan2(h.x * B2.e2x + h.y * B2.e2y + h.z * B2.e2z, h.x * B2.e1x + h.y * B2.e1y + h.z * B2.e1z);
      this.rib = N;
      this._ribPlace(N);
      return;
    }
    // Retour au sol : on garde la vitesse et le cap réels de la voiture.
    this.rib = null;
    this.ev.loopOut = true;
    const h = this.fwd;
    if (hypot2(h.x, h.z) > 0.2) this.yaw = datan2(-h.x, -h.z);
    this.prevYaw = this.yaw;
    const gsx = this.gSign;
    if (this.n.y * gsx > 0.6 && F.ny * gsx > 0.6) {
      this.grounded = true;
      this.vel.y = gsx > 0 ? Math.min(this.vel.y, 0) : Math.max(this.vel.y, 0);
      this.n.x = 0; this.n.y = gsx; this.n.z = 0;
    } else {
      this.grounded = false;
    }
    this._updateFwd();
  },

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
        if (tile === curTile || seen.has(tile) || !isRibbon(tile) || this.excl.has(tile)) continue;
        seen.add(tile);
        const rib = ribbonOf(tile);
        for (let end = 0; end < 2; end++) {
          const G = frameWorld(tile, rib, end, this.F3);
          const dist = hypot3(G.px - px, G.py - py, G.pz - pz);
          if (dist > 3.5) continue;
          const sg = end === 0 ? 1 : -1;
          if (G.tx * sg * fx + G.ty * sg * fy + G.tz * sg * fz < 0.7) continue;
          if (G.nx * F.nx + G.ny * F.ny + G.nz * F.nz < 0.6) continue;
          return { tile, rib, end };
        }
      }
    }
    return null;
  },
};
