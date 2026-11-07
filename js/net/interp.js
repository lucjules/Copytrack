// Tampon d'interpolation d'un joueur distant.
//
// Les paquets arrivent à ~20 Hz, avec de la gigue (et parfois dans le désordre : le canal n'est pas fiable). On ne
// dessine donc pas le dernier paquet reçu mais l'état du joueur il y a `delay` secondes (100 ms par défaut), en
// interpolant entre les deux paquets qui encadrent cet instant : c'est fluide tant que la gigue reste sous 100 ms.
//
// Temps : chaque paquet porte le pas de course de l'ÉMETTEUR (t = pas / 120 s). L'écart entre cette horloge et la nôtre
// est estimé par le plus petit (réception − t) récent, c'est-à-dire par les paquets les plus rapides.
//
// Téléportation (retour au checkpoint) : le compteur `tele` change. On ne glisse JAMAIS entre l'ancien et le nouvel
// emplacement : la voiture reste à l'ancien jusqu'à l'instant du premier paquet « après », puis apparaît à l'autre.
import * as THREE from '../vendor/three.module.min.js';

const DEFAULT_DELAY = 0.1;       // s
const MAX_EXTRAP = 0.25;                // s : au-delà, la voiture s'arrête sur place plutôt que de dériver
const HERMITE_MAX_GAP = 0.15;           // s : au-delà (paquets perdus), interpolation linéaire
const KEEP = 1.5;                       // s d'historique conservé
const OFFSET_WINDOW = 40;

export class SnapshotBuffer {
  constructor({ delay = DEFAULT_DELAY } = {}) {
    this.delay = delay;
    this.samples = [];                   // triés par t croissant
    this.offsets = [];
    this._tele = null;                   // compteur de téléportation du segment affiché à l'appel précédent
    this.out = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), speed: 0, vehicle: 'car', flags: 0, cp: 0, lap: 0, teleported: false, ready: false };
    this._q0 = new THREE.Quaternion(); this._q1 = new THREE.Quaternion();
  }

  get length() { return this.samples.length; }
  get latest() { return this.samples.length ? this.samples[this.samples.length - 1] : null; }

  // s : résultat de unpackSnapshot ; nowMs : horloge locale (performance.now()).
  push(s, nowMs) {
    const arr = this.samples;
    // Doublon ou trop ancien : ignoré.
    if (arr.length && s.t <= arr[0].t - 0.001) return false;
    let i = arr.length;
    while (i > 0 && arr[i - 1].t > s.t) i--;
    if (i > 0 && Math.abs(arr[i - 1].t - s.t) < 1e-9) return false;
    arr.splice(i, 0, {
      t: s.t, tele: s.tele, vehicle: s.vehicle, flags: s.flags, cp: s.cp, lap: s.lap,
      pos: new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z), vel: new THREE.Vector3(s.vel.x, s.vel.y, s.vel.z),
      quat: new THREE.Quaternion(s.quat.x, s.quat.y, s.quat.z, s.quat.w),
    });
    this.offsets.push(nowMs / 1000 - s.t);
    if (this.offsets.length > OFFSET_WINDOW) this.offsets.shift();
    return true;
  }

  get offset() { return this.offsets.length ? Math.min(...this.offsets) : 0; }

  // Instant (dans l'horloge de l'émetteur) à afficher quand notre horloge vaut nowMs.
  renderTime(nowMs) { return nowMs / 1000 - this.offset - this.delay; }

  // Remplit et renvoie this.out (réutilisé : aucune allocation par image). out.ready = faux tant qu'on n'a rien reçu.
  sample(nowMs) {
    const out = this.out, arr = this.samples;
    out.teleported = false;
    if (!arr.length) { out.ready = false; return out; }
    const rt = this.renderTime(nowMs);
    // Purge : on garde un paquet avant rt pour pouvoir interpoler.
    let k = 0;
    while (k + 1 < arr.length && arr[k + 1].t < rt - KEEP) k++;
    if (k > 0) arr.splice(0, k);

    let a, b = null, mode;
    if (rt <= arr[0].t) { a = arr[0]; mode = 'hold'; }
    else if (rt >= arr[arr.length - 1].t) { a = arr[arr.length - 1]; mode = 'extrap'; }
    else {
      let i = 0;
      while (i + 2 < arr.length && arr[i + 1].t <= rt) i++;
      a = arr[i]; b = arr[i + 1];
      mode = b.tele !== a.tele ? 'hold' : 'lerp';        // téléportation entre les deux : on reste sur place
    }
    // Le paquet « de base » affiché est `a` : quand le temps d'affichage franchit un paquet d'après téléportation,
    // `a` change de compteur et la voiture apparaît d'un coup (out.teleported, pour couper traces et lissages).
    if (this._tele !== null && a.tele !== this._tele) out.teleported = true;
    this._tele = a.tele;

    out.ready = true;
    out.vehicle = a.vehicle; out.flags = a.flags; out.cp = a.cp; out.lap = a.lap;
    if (mode === 'lerp') {
      const h = b.t - a.t, u = Math.max(0, Math.min(1, (rt - a.t) / h));
      if (h > HERMITE_MAX_GAP) out.pos.lerpVectors(a.pos, b.pos, u);
      else {
        // Hermite cubique : position ET vitesse aux deux bouts, donc pas de « cassure » aux paquets.
        const u2 = u * u, u3 = u2 * u;
        const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
        out.pos.set(
          h00 * a.pos.x + h10 * h * a.vel.x + h01 * b.pos.x + h11 * h * b.vel.x,
          h00 * a.pos.y + h10 * h * a.vel.y + h01 * b.pos.y + h11 * h * b.vel.y,
          h00 * a.pos.z + h10 * h * a.vel.z + h01 * b.pos.z + h11 * h * b.vel.z,
        );
      }
      out.quat.slerpQuaternions(a.quat, b.quat, u);        // orientation : slerp (chemin le plus court)
      out.speed = a.vel.length() + (b.vel.length() - a.vel.length()) * u;
      out.vehicle = u < 0.5 ? a.vehicle : b.vehicle; out.flags = u < 0.5 ? a.flags : b.flags;
      out.cp = u < 0.5 ? a.cp : b.cp; out.lap = u < 0.5 ? a.lap : b.lap;
    } else if (mode === 'extrap') {
      const dt = Math.max(0, Math.min(MAX_EXTRAP, rt - a.t));
      out.pos.copy(a.pos).addScaledVector(a.vel, dt);
      out.quat.copy(a.quat);
      out.speed = a.vel.length();
    } else {
      out.pos.copy(a.pos); out.quat.copy(a.quat); out.speed = a.vel.length();
    }
    return out;
  }
}
