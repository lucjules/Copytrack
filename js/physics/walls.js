// Collisions de la voiture avec les murs (bordures), les toits de tunnel, les dalles et les limites du monde.
// Ces méthodes s'ajoutent au prototype de CarPhysics (voir physics.js) : `this` est la voiture.
import { CELL, DT, ROAD_HALF, RAIL_W, RAIL_H, SLAB_T } from '../constants.js';
import { PIECES, toLocal, sampleLocal, rotVec, isFloor, isCeilingFloor, baseY, TUNNEL_TOP } from '../pieces.js';
import { CAR } from './specs.js';
import { wallBounce, wallFriction, wallHardLoss, wallSpinOf, wallStunOf, wallYawTarget } from './contact.js';
import { dcos, dsin, hypot2 } from '../dmath.js';

const L1 = { lx: 0, lz: 0 };
const L2 = { lx: 0, lz: 0 };
const S1 = {};
const S2 = {};
const W1 = { x: 0, z: 0 };
const MOV = {};
const MQ1 = {};
const MQ2 = {};
const HIT = { dx: 0, dz: 0, nx: 0, nz: 0 };

export const wallMethods = {
  _bounds() {
    const p = this.pos, v = this.vel;
    if (p.x < this.bx0) { p.x = this.bx0; if (v.x < 0) v.x = 0; }
    if (p.x > this.bx1) { p.x = this.bx1; if (v.x > 0) v.x = 0; }
    if (p.z < this.bz0) { p.z = this.bz0; if (v.z < 0) v.z = 0; }
    if (p.z > this.bz1) { p.z = this.bz1; if (v.z > 0) v.z = 0; }
  },

  // Bordures : la voiture glisse le long du mur, perd un peu de vitesse au choc,
  // et le choc freine sa rotation. Pas de réalignement automatique.
  // Toit d'un tunnel : une voiture qui saute à l'intérieur n'en sort pas par le haut (les parois la retiennent déjà sur les côtés).
  // Seule une voiture déjà dessous est retenue : celle qui survole le tunnel passe au-dessus.
  _tunnelRoof() {
    const inv = this.gSign < 0;      // gravité inversée : la voiture « tombe » vers le haut, SA tête est le point de contact (pos.y) et son corps est dessous
    const p = this.pos, q = this.prev, v = this.vel;
    const tiles = this.track.tilesAt(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (!tile.tn || tile.v || this.excl.has(tile) || !isFloor(tile)) continue;
      toLocal(tile, p.x, p.z, L1);
      sampleLocal(tile, L1.lx, L1.lz, S1);
      if (!S1.inFootprint || Math.abs(S1.d) > ROAD_HALF + RAIL_W) continue;
      const roof = S1.h + TUNNEL_TOP, top = inv ? p.y : p.y + CAR.height, qTop = inv ? q.y : q.y + CAR.height;
      if (top > roof && qTop <= roof + 0.05) {
        p.y = inv ? roof : roof - CAR.height;
        if (v.y > 0) v.y = -v.y * 0.2;
        if (inv) this._pinned = true;      // gravité inversée : le toit est le « plafond » de la voiture, mais il n'a pas de surface roulable : la voiture reste plaquée en l'air (voir pinT)
      }
    }
  },

  // Dalles pleines (gravité normale, véhicule en l'air) : le dessous et la tranche d'une dalle arrêtent la voiture.
  // Sans cela, un deltaplane (ou un saut) qui arrive sous une rampe ou contre la face d'une plate-forme la traversait, ou était
  // téléporté dessus par l'aide de montée. Trois cas selon la position au pas précédent :
  //   au-dessus de la dalle  : réception normale (rien à faire) ;
  //   en dessous             : la voiture est plaquée sous la dalle (comme le toit d'un tunnel) ;
  //   hors de l'emprise      : choc de face, la voiture reste devant la tranche.
  _slabs() {
    // GRAVITÉ INVERSÉE : les dalles sont volontairement ignorées. Les circuits officiels s'en servent (« Cristal Fêlé » : après une plaque d'inversion, la voiture « tombe » au
    // plafond, 8 niveaux plus haut, en traversant les routes intermédiaires) : les bloquer fait passer ce circuit de 33 s à 70 s (voir docs/PHYSIQUE-CONTACTS.md). Le toit d'un
    // TUNNEL, lui, retient la voiture inversée (_tunnelRoof).
    if (this.gSign < 0 || this.grounded || this.rib) return;
    const p = this.pos, q = this.prev, v = this.vel, H = CAR.height;
    const tiles = this.track.tilesAt(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (tile.mv || tile.v || this.excl.has(tile) || !isFloor(tile) || PIECES[tile.t].kind === 'loop') continue;
      const area = PIECES[tile.t].kind === 'area';
      toLocal(tile, p.x, p.z, L1);
      sampleLocal(tile, L1.lx, L1.lz, S1);
      if (!S1.inFootprint || (!area && Math.abs(S1.d) > ROAD_HALF)) continue;
      const hP = S1.h;
      if (!(p.y < hP - 0.3 && p.y + H > hP - SLAB_T)) continue;       // pas dans la dalle (ou à peine : réception normale)
      toLocal(tile, q.x, q.z, L2);
      sampleLocal(tile, L2.lx, L2.lz, S2);
      const qIn = S2.inFootprint && (area || Math.abs(S2.d) <= ROAD_HALF);
      if (qIn) {
        const hQ = S2.h;
        if (q.y >= hQ - 0.3) continue;                                  // arrivait par le haut
        if (q.y + H <= hQ - SLAB_T + 0.3) {                             // arrivait par le dessous
          p.y = hP - SLAB_T - H;
          if (v.y > 0) v.y = -v.y * 0.2;
          this.ev.wall = Math.max(this.ev.wall, 2);
        }
        continue;                                                       // déjà dans la dalle (cas ancien) : inchangé
      }
      // Rebord bas (moins de CAR.step sous le dessus) : aide de montée, la voiture est posée sur la dalle.
      if (p.y >= hP - CAR.step) { p.y = hP + 0.02; continue; }
      // Face de la dalle : on revient devant, et on annule la vitesse qui pousse contre elle.
      const dx = p.x - q.x, dz = p.z - q.z, dl = hypot2(dx, dz);
      p.x = q.x; p.z = q.z;
      if (dl > 1e-6) {
        const nx = dx / dl, nz = dz / dl, vn = v.x * nx + v.z * nz;
        if (vn > 0) { v.x -= nx * vn * 1.2; v.z -= nz * vn * 1.2; this.ev.wall = Math.max(this.ev.wall, vn); }
      }
    }
  },


  // again : seconde passe du même pas (après un obstacle qui a poussé la voiture) : même correction de position et de vitesse, sans recompter le frottement ni l'arrêt.
  _walls(again = false) {
    const p = this.pos, v = this.vel, K = this.k;
    const fx = -dsin(this.yaw), fz = -dcos(this.yaw);
    const pfx = -dsin(this.prevYaw), pfz = -dcos(this.prevYaw);
    let hit = 0, touch = false, sx = 0, sz = 0, lnx = 0, lnz = 0, kHit = 1;
    for (let k = -1; k <= 1; k += 2) {
      const off = CAR.probe * k;
      for (let iter = 0; iter < 2; iter++) {
        const c = this._probe(p.x + fx * off, p.z + fz * off,
          this.prev.x + pfx * off, this.prev.z + pfz * off, p.y, p.x, p.z);
        if (!c) break;
        touch = true; lnx = c.nx; lnz = c.nz;
        p.x += c.dx; p.z += c.dz;
        const vn = v.x * c.nx + v.z * c.nz;
        if (vn < 0) {
          // Impact (physics/contact.js) : la composante NORMALE rebondit (wallE) ; sur la tangente, un frottement de Coulomb proportionnel à l'impulsion normale. Rien d'autre
          // n'est retiré ici : un frôlement (vn faible) conserve l'essentiel de l'élan.
          const ap = -vn;
          const e1 = 1 + wallBounce(K, ap);
          v.x -= c.nx * vn * e1;
          v.z -= c.nz * vn * e1;
          const tx = v.x - c.nx * (v.x * c.nx + v.z * c.nz), tz = v.z - c.nz * (v.x * c.nx + v.z * c.nz), tl = Math.sqrt(tx * tx + tz * tz);
          if (tl > 1e-6) { const dv = Math.min(tl, wallFriction(K, ap)) / tl; v.x -= tx * dv; v.z -= tz * dv; }
          // Couple du contact : le mur écarte le nez de la paroi (contact avant) ou l'en rapproche (contact arrière) : voir contact.js (wallYawTarget).
          const want = wallYawTarget(K, ap, k, fx, fz, c.nx, c.nz, dcos(this.yaw), dsin(this.yaw)) * this._upSign();
          if (want * this.omega < want * want) this.omega = want;
          if (ap > hit) { hit = ap; sx = c.nx; sz = c.nz; kHit = k; }
        }
      }
    }
    // Voiture arrêtée contre un mur (voir _tires) : le délai ne court que tant qu'elle touche et ne roule pas.
    if (!again) {
      if (touch && this.speed < 2.5) this.stuckT = Math.min(1, this.stuckT + DT); else this.stuckT = Math.max(0, this.stuckT - 2 * DT);
      // Plaquée à l'arrêt contre un mur (stuckT), le contact la fait pivoter vers la tangente du mur, puis jusqu'à ce que le nez s'en écarte (≈ 12°). Avant 0.9.54 seul le
      // volant pouvait la dégager : un braquage faible, ou du mauvais côté, la laissait collée indéfiniment, gaz à fond, vitesse nulle, sans retour automatique ; et une fois
      // la voiture un peu tournée, le frottement du mur (wallScrape) mangeait toute la poussée du moteur (elle rampait à ~3 m/s le long de la paroi). Le dégagement est donc
      // ARMÉ quand elle est vraiment plaquée (touche, < 4 m/s, depuis 0,25 s), puis maintenu tant qu'elle touche, reste lente (< 8 m/s) et au plus 5 s ;
      // il ne concerne jamais une voiture qui frôle un mur en roulant.
      this.unstick = 0;
      // Phase 2 : le contact d'une voiture pressée « clignote » (rebond, repoussée, rebond : un pas sur cinq) ; le dégagement ne tournait donc qu'un pas sur cinq pendant que le volant,
      // lui, poussait le nez dans la paroi à chaque pas : la voiture restait nez au mur à ~1 m/s pendant dix secondes. Le contact est donc retenu `touchMemory` secondes (et sa normale).
      if (touch) { this.touchT = CAR.touchMemory; this.wnx = lnx; this.wnz = lnz; } else this.touchT = Math.max(0, this.touchT - DT);
      const near = touch || this.touchT > 0;
      if (near && this.speed < 4) this.crawlT = Math.min(1, this.crawlT + DT); else this.crawlT = Math.max(0, this.crawlT - 2 * DT);      // (à l'arrêt OU rampant : le frottement tient la voiture à ~3 m/s)
      if (near && this.crawlT > 0.25) this.unstickT = 5;
      else if (this.unstickT > 0) this.unstickT = near ? this.unstickT - DT : this.unstickT - 3 * DT;
      if (near && this.unstickT > 0 && this.speed < 8) {
        const into = fx * this.wnx + fz * this.wnz;            // < 0 : le nez regarde le mur ; > 0 : il s'en écarte
        const cross = fx * this.wnz - fz * this.wnx;           // sens de rotation le plus court vers la tangente ; ≈ 0 de plein fouet : on garde le sens déjà pris (sinon il change à chaque pas)
        if (Math.abs(cross) > 0.15 || !this.unstickDir) this.unstickDir = cross >= 0 ? 1 : -1;
        if (into < 0.2) this.unstick = this.unstickDir * CAR.stuckAlign * Math.min(1, Math.max(0.25, (0.2 - into) * 3));
      }
      if (this.unstickT <= 0) this.unstickDir = 0;
    }
    if (touch && !again) {
      // Frottement visqueux de contact : racler un mur longtemps freine un peu (wallScrape, 0,12 /s), sans jamais clouer la voiture (avant 0.9.60 : 2 /s = équilibre à ~23 km/h).
      const k = Math.max(0, 1 - K.wallScrape * DT);
      v.x *= k; v.y *= k; v.z *= k;
    }
    // Un CHOC se paie une fois : perte globale (choc violent), rotation, moteur réduit. Une voiture PRESSÉE contre le mur (volant tenu vers lui) le heurte de nouveau à chaque pas, d'une
    // fraction de m/s : après `wallFresh` secondes de contact continu c'est du frottement (impulsion de Coulomb ci-dessus + wallScrape), pas un nouveau choc.
    if (!again) this.wallRun = touch ? Math.min(2, this.wallRun + DT) : Math.max(0, this.wallRun - 0.5 * DT);      // (le contact « clignote » quand la voiture rebondit puis est repoussée : il ne redevient un choc neuf qu'après un moment sans contact)
    const fresh = this.wallRun <= CAR.wallFresh || this.speed > CAR.wallFreshSpeed;
    if (hit > 0) {
      if (fresh) { const loss = wallHardLoss(K, hit); v.x *= 1 - loss; v.y *= 1 - loss; v.z *= 1 - loss; }
      this.ev.wall = hit;
      const spin = fresh ? wallSpinOf(K, hit) : 0;
      if (spin > 0) {
        // Le choc fait pivoter la voiture : le mur repousse la sonde qui le touche (avant k = +1, arrière k = −1), donc le nez s'écarte du mur pour un choc de l'avant et s'en rapproche pour un
        // choc de l'arrière. Avant 0.9.60 le signe était inversé : un choc oblique de l'avant tournait le nez CONTRE le mur (voiture « nez au mur », 5 s pour s'en dégager).
        // d(cap)/d(yaw) = (-cos yaw, sin yaw) : composante du déplacement du nez le long de la normale du mur.
        const dn = -dcos(this.yaw) * sx + dsin(this.yaw) * sz;
        this.omega += -kHit * (dn >= 0 ? 1 : -1) * this._upSign() * spin;      // (autour du haut local : même choc au plafond)
      }
      const stun = fresh ? wallStunOf(K, hit) : 0;
      if (stun > 0) this.stunT = Math.max(this.stunT, stun);
    }
  },

  // (mx, mz) : centre de la voiture, pour juger la hauteur d'une sonde sur une pièce en pente (voir _probeTile).
  _probe(x, z, px, pz, y, mx, mz) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    const tiles = this.track.tilesAt(cx, cz);
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (tile.mv || this.excl.has(tile)) continue;
      if (this._probeTile(tile, x, z, px, pz, y, mx, mz)) return HIT;
    }
    // Pièces mobiles : bordures à leur position du moment. L'index les range dans toutes les cases qu'elles balaient : celles de cette case suffisent.
    if (!this.track.hasMovers) return null;
    const time = this.time;
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (!tile.mv || this.excl.has(tile)) continue;
      const o = this.track.moverOffset(tile, time, MOV);
      if (o.a) {
        // Pièce tournante : on interroge sa géométrie « au repos », puis on remet le résultat dans le repère du monde.
        const q = this.track.moverLocal(o, x, z, MQ1), q2 = this.track.moverLocal(o, px, pz, MQ2);
        if (this._probeTile(tile, q.x, q.z, q2.x, q2.z, y - o.y)) {
          const c = dcos(o.a), sn = dsin(o.a), dx = HIT.dx, dz = HIT.dz, nx = HIT.nx, nz = HIT.nz;
          HIT.dx = c * dx + sn * dz; HIT.dz = -sn * dx + c * dz;
          HIT.nx = c * nx + sn * nz; HIT.nz = -sn * nx + c * nz;
          return HIT;
        }
      } else if (this._probeTile(tile, x - o.x, z - o.z, px - o.x, pz - o.z, y - o.y)) return HIT;
    }
    return null;
  },

  _probeTile(tile, x, z, px, pz, y, mx, mz) {
    const P = PIECES[tile.t];
    if (P.kind === 'area' || (tile.nb && !tile.tn) || !(isFloor(tile) || isCeilingFloor(tile))) return false;
    // 0.9.59 : voiture POSÉE sur une pièce en pente. La hauteur de la bordure est celle de la route SOUS LA SONDE (1,25 m devant ou derrière le centre), alors que
    // `y` est celle du centre : sur une pente raide l'écart dépassait la hauteur de la bordure. Au bord intérieur d'un virage montant serré (rayon 4 m), la route monte
    // de plusieurs mètres en 1,25 m : aucune des deux sondes ne « voyait » la bordure et la voiture la traversait ; sur une ligne droite d'inclinaison 4, la sonde du
    // bas ne la voyait pas non plus. On juge donc la sonde à la hauteur qu'a la voiture AU-DESSUS DE LA ROUTE (elle épouse la pente). En l'air, rien ne change.
    let dh = 0;
    if (P.rise && this.grounded && mx !== undefined) {
      toLocal(tile, mx, mz, L2);
      sampleLocal(tile, L2.lx, L2.lz, S2);
      if (S2.inFootprint) dh = S2.h;
    }
    toLocal(tile, x, z, L1);
    sampleLocal(tile, L1.lx, L1.lz, S1);
    if (!S1.inFootprint) return false;
    if (dh) { dh = S1.h - dh; y += tile.v ? -dh : dh; }
    // Pièce à l'envers : rails et dalle sont symétriques par rapport à la base.
    const H = CAR.height, gsg = this.gSign;
    const ylo = gsg > 0 ? y : y - H, yhi = gsg > 0 ? y + H : y;
    if (tile.v) {
      const hv = 2 * baseY(tile) - S1.h;
      if (ylo > hv + SLAB_T + 0.2 || yhi < hv - RAIL_H + 0.15) return false;
    } else if (ylo > S1.h + (tile.tn ? TUNNEL_TOP : RAIL_H) - 0.15 || yhi < S1.h - SLAB_T - 0.2) return false;      // tunnel : les parois montent jusqu'au toit
    const ad = Math.abs(S1.d), R = CAR.radius;
    const inner = ROAD_HALF, outer = ROAD_HALF + RAIL_W;
    if (ad + R <= inner || ad - R >= outer) return false;
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
    return true;
  },
};
