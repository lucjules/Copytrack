// Pilote automatique simple qui suit la ligne centrale d'un circuit scripté.
// Utilisé pour la démo du menu et pour valider les circuits (tools/sim.mjs).
import { CAR, steerLimitSpeed } from './physics/specs.js';
import { rolledRibbon, isSideTile } from './pieces.js';
import { dasin, datan, datan2, dcos, dexp, dpow, dsin, hypot2, hypot3 } from './dmath.js';

const AIR_NONE = 0, AIR_BRAKE = 1, AIR_GAS = 2;

export class Autopilot {
  constructor(path, opts = {}) {
    this.path = path;
    this.idx = 0;
    this.latLimit = opts.latLimit ?? CAR.latGrip * 0.62;     // 0.9.11 : la voiture est à l'avant limité (frontShare 0,42) : l'adhérence réellement utilisable est ~0,79 × latGrip
    this.brakeDecel = opts.brakeDecel ?? 10;   // 0.9.12 : 20 -> 10 : le moteur est 2× plus vif et la gravité plus faible (descentes qui décollent) : le pilote anticipe ses freinages
    this.vCap = opts.vCap ?? (path.pilot && path.pilot.vCap) ?? 52;     // 0.9.4 : le moteur monte bien plus haut, mais le pilote reste prudent (glace, murs punitifs, sauts calés pour ~190 km/h)
    // PHYS_VER 36 : le braquage permis diminue avec la vitesse (loi PolyTrack) : un virage serré se prend aussi sous la vitesse où l'angle suffit
    // encore (avec une marge pour les corrections de trajectoire).
    this.steerMargin = opts.steerMargin ?? 0.85;
    this.envGrip = 1;
    this.K = CAR;
    this.yawDamp = opts.yawDamp ?? 0.25;
    this.lookK = opts.lookK ?? 0.35;
    this.steerGain = opts.steerGain ?? 3.6;
    const n = path.length;
    // Distances cumulées (3D) et rayon de courbure horizontal en chaque point.
    this.dist = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      const a = path[i - 1], b = path[i];
      this.dist[i] = this.dist[i - 1] + hypot3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    this.radius = new Float32Array(n).fill(1e4);
    this.radiusGeo = new Float32Array(n).fill(1e4);      // rayon géométrique (sans l'aide du relèvement) : c'est lui qui fixe l'angle de braquage nécessaire
    for (let i = 1; i < n - 1; i++) {
      const a = path[Math.max(0, i - 2)], b = path[i], c = path[Math.min(n - 1, i + 2)];
      if (a[3] === 1 || b[3] === 1 || c[3] === 1) continue; // looping, tube... : pas de limite de courbe
      const h1 = datan2(b[2] - a[2], b[0] - a[0]);
      const h2 = datan2(c[2] - b[2], c[0] - b[0]);
      let dh = h2 - h1;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const len = hypot2(b[0] - a[0], b[2] - a[2]) * 0.5 + hypot2(c[0] - b[0], c[2] - b[2]) * 0.5;
      if (Math.abs(dh) > 1e-3 && len > 0.5) {
        this.radiusGeo[i] = Math.max(2, len / Math.abs(dh));
        this.radius[i] = this.radiusGeo[i] * (b[3] === 2 ? 1.7 : 1);      // virage relevé : le relèvement aide l'adhérence, pas le braquage
      }
    }
  }

  // Hauteur du chemin le plus proche plus loin devant (approximation du sol d'arrivée).
  _groundBelow(y) {
    let best = -Infinity;
    for (let k = this.idx; k < Math.min(this.path.length, this.idx + 60); k++) {
      const q = this.path[k];
      if (q[1] <= y + 0.5 && q[1] > best) best = q[1];
    }
    return best === -Infinity ? y : best;
  }

  // Pente (rad) du chemin à une distance donnée.
  _pathSlopeAt(d) {
    const path = this.path, n = path.length;
    let k = this.idx;
    while (k < n - 2 && this.dist[k] < d) k++;
    const a = path[Math.max(0, k - 2)], b = path[Math.min(n - 1, k + 2)];
    const h = hypot2(b[0] - a[0], b[2] - a[2]);
    return h > 0.5 ? datan2(b[1] - a[1], h) : 0;
  }

  // En l'air (PHYS_VER 37) : le pilote cherche où il retombe (sa trajectoire balistique contre le chemin devant) et son assiette à ce moment-là si la rotation
  // continue ; si elle l'amènerait au-delà de la pente de la réception (plus piqué en tournant vers le bas, plus cabré en tournant vers le haut), il freine.
  // Il relâche dès que la rotation restante l'y amène : le frein n'agit que sur la rotation, pas sur la vitesse. En gravité inversée : rien (pas de plafond prévu).
  _airControl(phys) {
    if (phys.gSign < 0 || phys.vehicle === 'glider') return AIR_NONE;
    const p = phys.pos, v = phys.vel, path = this.path, n = path.length, hv = hypot2(v.x, v.z);
    if (hv < 2) return AIR_NONE;
    const ux = v.x / hv, uz = v.z / hv, g = phys.g;
    for (let k = this.idx; k < n && k < this.idx + 240; k++) {
      const q = path[k], d = (q[0] - p.x) * ux + (q[2] - p.z) * uz;
      if (d <= 1) continue;
      const t = d / hv;
      if (p.y + v.y * t - 0.5 * g * t * t > q[1] + 0.3) continue;
      const a = path[Math.max(0, k - 2)], b = path[Math.min(n - 1, k + 2)], h = hypot2(b[0] - a[0], b[2] - a[2]);
      const slope = h > 0.5 ? datan2(b[1] - a[1], h) : 0;
      if (phys.airTime + t < 0.35) return AIR_NONE;      // vol trop court : la réception ne coûte rien
      const pr = phys.pitchRate, kS = CAR.airSpin;
      const err = phys.pitch + (pr * (1 - dexp(-kS * t))) / kS - slope;
      // L'aérofrein amortit AUSSI le lacet : une voiture qui tourne (saut dans un virage) arriverait de travers. Dans ce cas il ne freine que si la réception coûterait
      // de la vitesse (au-delà de landOk) ; sinon il vise la réception parfaite.
      const tol = Math.abs(phys.omega) > 0.1 ? CAR.landOk * 0.8 : 0.03;
      if (Math.abs(err) > tol && err * pr > 0) return AIR_BRAKE;
      return err > 0.03 ? AIR_GAS : AIR_NONE;      // trop cabrée à la réception : les gaz font descendre le nez d'un rien
    }
    return AIR_NONE;
  }

  // Point de reprise (départ, réapparition) : le point du tracé le plus proche, cherché sur TOUT le tracé (0.9.67 : avant, les 400 premiers points seulement ;
  // sur un circuit long, un checkpoint au-delà se raccrochait au premier passage voisin et le pilote faisait demi-tour), parmi ceux orientés dans le sens
  // de la voiture (un tronçon voisin parcouru dans l'autre sens n'est pas un point de reprise).
  reset(phys) {
    this.idx = 0;
    if (!phys) return;
    const p = phys.pos, path = this.path, fx = -dsin(phys.yaw), fz = -dcos(phys.yaw);
    let best = 0, bd = Infinity;
    for (let i = 0; i < path.length; i++) {
      const q = path[i], a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      const dx = q[0] - p.x, dz = q[2] - p.z, dy = (q[1] - p.y) * 3;
      const d = dx * dx + dz * dz + dy * dy;
      if (d >= bd) continue;
      const tx = b[0] - a[0], tz = b[2] - a[2];
      if (tx * fx + tz * fz < 0 && d > 25) continue;      // tronçon parcouru dans l'autre sens (sauf s'il est sous la voiture : à 5 m près)
      bd = d; best = i;
    }
    this.idx = best;
  }

  _progress(phys, range = 40) {
    const p = phys.pos, path = this.path;
    let best = this.idx, bd = Infinity;
    const end = Math.min(path.length - 1, this.idx + range);
    for (let i = this.idx; i <= end; i++) {
      const q = path[i];
      const dx = q[0] - p.x, dz = q[2] - p.z, dy = (q[1] - p.y) * 3;
      const d = dx * dx + dz * dz + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    this.idx = best;
  }

  // En gravité inversée (au plafond), la droite du pilote est la gauche du monde et
  // « nez en haut » vise le bas : on traduit les commandes calculées en repère monde.
  control(phys) {
    const c = this._control(phys);
    // Sur un ruban, le volant est calculé dans le repère de la route (cap relatif psi, écart dl) : il n'y a rien à retourner, même sur une pièce posée
    // à l'envers (son repère est déjà orienté par sa normale : droite = tangente × normale, voir ribbons.js frameLocal). Avant 0.9.59 le volant y était
    // inversé : sur un virage relevé, un tire-bouchon ou un looping posé au plafond, le pilote braquait du mauvais côté et finissait plaqué contre la paroi.
    if (phys.rib) { /* repère de la route : rien à traduire */ }
    else if (phys.gSign < 0) c.steer = -c.steer;
    // 0.9.11 : sur une dalle « volant inversé », la physique renverse le braquage (physics.js, reverseActive). Le pilote le sait : sans cela
    // toute correction aggravait l'écart (rétroaction positive) et le moindre bruit de volant sortait la voiture de la route.
    const reverseActive = phys.rib ? phys.rib.tile.s === 'reverse' : phys.grounded && phys.surfMod === 'reverse';
    if (reverseActive) c.steer = -c.steer;
    return c;
  }

  // Vitesse cible selon les courbes à venir (adhérence, et angle de braquage permis à cette vitesse : PHYS_VER 36).
  _vTarget(v) {
    const path = this.path;
    let vTarget = this.vCap;
    const horizon = 15 + (v * v) / (2 * this.brakeDecel);
    for (let k = this.idx; k < path.length && this.dist[k] - this.dist[this.idx] < horizon; k++) {
      const vMax = Math.min(Math.sqrt(this.latLimit * this.radius[k]), steerLimitSpeed(this.K, this.radiusGeo[k], this.envGrip) * this.steerMargin);
      const dd = this.dist[k] - this.dist[this.idx];
      const allowed = Math.sqrt(vMax * vMax + 2 * this.brakeDecel * dd);
      if (allowed < vTarget) vTarget = allowed;
    }
    return vTarget;
  }

  _control(phys) {
    this._progress(phys);
    this.envGrip = phys.envGrip ?? 1;      // pluie, givre, adhérence du circuit : le braquage permis rétrécit, le pilote ralentit d'autant
    this.K = phys.k || CAR;                // réglages du véhicule et du profil en cours (moto, Arcade, Simulation… : leur angle de braquage permis)
    if (phys.rib) {
      const R = phys.rib;
      // Revenir au centre : cap visé proportionnel à l'écart, puis braquage vers ce cap.
      const d2 = R.dir * R.dl;
      const vs = Math.max(8, Math.abs(R.vs));
      const psiDes = dasin(Math.max(-0.5, Math.min(0.5, (-1.2 * d2) / vs)));
      // Sur un mur, on vise la DIRECTION DE MARCHE (cap + glisse), pas le cap seul : la gravité fait glisser la voiture vers le bas et il faut garder le nez
      // un peu vers le haut (en crabe) pour tenir sa ligne (PHYS_VER 37) ; viser le cap laissait la voiture descendre de plusieurs mètres.
      const travel = isSideTile(R.tile) && Math.abs(R.vs) > 5 ? datan2(R.vd, Math.abs(R.vs)) : R.psi;
      // Braquage d'anticipation : celui qui fait tourner la voiture aussi vite que la pièce tourne sous elle (courbure géodésique kg, PHYS_VER 37 : plus de guidage),
      // rapporté à l'angle de braquage permis à cette vitesse. Sans lui, le pilote ne corrigeait qu'après coup et sortait des loopings décalés et des tire-bouchons de travers.
      const K = this.K, L = K.a + K.b, vAbs = Math.abs(R.vs);
      const dMax = Math.min(K.steerMax, K.steerC * this.envGrip * dpow(Math.max(1, vAbs), -K.steerN));
      // (et, sur un mur, de quoi tenir le nez qui pique vers le bas : R.sag. Pas dans un tube : la paroi y fait tourner la voiture d'elle-même.)
      const ff = rolledRibbon(R.tile) ? datan(L * (R.dir * (R.kg || 0) + (R.sag || 0) / Math.max(8, vAbs))) / Math.max(1e-3, dMax) : 0;
      const st = ff + (psiDes - travel) * 6 - phys.omega * 0.35;
      // 0.9.12 : sur un mur le pilote respecte aussi sa vitesse maximale (avant, gaz à fond : avec le moteur mesuré la vitesse montait sans limite).
      // PHYS_VER 36 : et la vitesse des virages à venir (un virage relevé se tient au braquage, qui est borné selon la vitesse).
      // (seulement sur un ruban « au sol » : virage relevé, tube… Sur une route roulée (mur, 45°) la projection horizontale du tracé ne dit rien de son
      // virage, et lever le pied ferait passer sous la vitesse minimale de mur.)
      const vT = rolledRibbon(R.tile) ? this.vCap : this._vTarget(Math.abs(R.vs));
      return { throttle: Math.abs(R.vs) < Math.min(this.vCap, vT - 0.5), brake: Math.abs(R.vs) > vT + 6, steer: Math.max(-1, Math.min(1, st)), drift: false };
    }
    const path = this.path, p = phys.pos;
    if (!phys.grounded && phys.vehicle === 'glider') {
      // Deltaplane : on vise la route devant (cap) et on garde un peu d'altitude au-dessus.
      let j = this.idx;
      while (j < path.length - 1 && this.dist[j] - this.dist[this.idx] < 30) j++;
      const tq = path[j];
      const fx = -dsin(phys.yaw), fz = -dcos(phys.yaw);
      const tx = tq[0] - p.x, tz = tq[2] - p.z;
      const ang = datan2(fx * tz - fz * tx, fx * tx + fz * tz);
      // Plané : on vise la route 30 m devant, 3 m au-dessus, par la vitesse verticale voulue (cabrer = brake, piquer = gaz).
      // Une dalle est solide : passer SOUS la route visée, c'est la percuter.
      const hv = Math.max(8, hypot2(phys.vel.x, phys.vel.z));
      const wantVy = (tq[1] + 3 - p.y) / (Math.max(10, hypot2(tx, tz)) / hv);
      // Prochaine reprise de route après un vide (saut de plus de 30 m entre deux points) : altitude voulue = sa hauteur + 3 m
      // + 1 m par 9 m restant (finesse d'environ 9). Trop haut : on pique pour garder de la vitesse ; trop bas : on cabre.
      let landK = -1;
      for (let k = this.idx + 1; k < path.length && k < this.idx + 80; k++) {
        if (hypot2(path[k][0] - path[k - 1][0], path[k][2] - path[k - 1][2]) > 30) { landK = k; break; }
      }
      let low, high;
      if (landK > 0 && landK > j) {
        const rest = hypot2(path[landK][0] - p.x, path[landK][2] - p.z);
        const want = path[landK][1] + 3 + rest / 9;
        low = p.y < want; high = p.y > want + 4;
      } else { low = phys.vel.y < wantVy + 2; high = phys.vel.y > wantVy + 6; }
      const dive = phys.speed < 24 || (high && phys.speed < 42);
      const pull = !dive && (low || phys.speed > 56);
      return { throttle: dive, brake: pull, steer: Math.max(-1, Math.min(1, ang * 2.2)), drift: false };
    }
    if (!phys.grounded) {
      // En l'air : le volant n'agit pas ; l'aérofrein amortit la rotation, les gaz penchent le nez d'un rien (PHYS_VER 37 : rien d'autre ne redresse la voiture).
      const a = this._airControl(phys);
      return { throttle: a === AIR_GAS, brake: a === AIR_BRAKE, steer: 0, drift: false };
    }
    const v = Math.max(0, phys.fwdSpeed);
    const look = 8 + v * this.lookK;
    let j = this.idx;
    while (j < path.length - 1 && this.dist[j] - this.dist[this.idx] < look && path[j + 1][3] !== 1) j++;
    if (path[j + 1] && path[j + 1][3] === 1 && j === this.idx) j++;
    let tq = path[j];
    // Visée arrêtée par l'entrée d'un ruban (mur, looping, tube : sa projection au sol ne dit rien de sa direction) : on prolonge la visée dans l'axe
    // d'entrée du ruban, pour y arriver ALIGNÉ (sans guidage du cap sur les rubans, une entrée de travers part dans la bordure ou tombe du mur).
    const short = look - (this.dist[j] - this.dist[this.idx]);
    if (short > 2 && j > 0 && path[j + 1] && path[j + 1][3] === 1) {
      const a = path[j - 1], ex = tq[0] - a[0], ez = tq[2] - a[2], el = hypot2(ex, ez);
      if (el > 0.1) tq = [tq[0] + (ex / el) * short, tq[1], tq[2] + (ez / el) * short];
    }
    const fx = -dsin(phys.yaw), fz = -dcos(phys.yaw);
    const tx = tq[0] - p.x, tz = tq[2] - p.z;
    const cross = fx * tz - fz * tx;
    const dot = fx * tx + fz * tz;
    const ang = datan2(cross, dot);
    const steer = Math.max(-1, Math.min(1, ang * this.steerGain - (phys.omega || 0) * this.yawDamp));

    const vTarget = this._vTarget(v);
    const throttle = v < vTarget - 0.5;
    const brake = v > vTarget + 2.5;
    let st = steer;
    // Freiner en braquant fort fait déraper : le pilote freine avec un braquage modéré.
    if (brake && Math.abs(st) > 0.45) st = Math.sign(st) * 0.45;
    return { throttle, brake, steer: st, drift: false };
  }
}
