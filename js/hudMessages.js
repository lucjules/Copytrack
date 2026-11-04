// Messages au centre de l'écran en course : courts, triés par importance, jamais empilés. Minimaliste.
//
// Règles :
//  - un message n'en remplace un autre que s'il est au moins aussi important ; un message mineur ne coupe pas un message important ;
//  - le même message n'est pas répété dans la seconde qui suit ;
//  - ce qui se voit ou s'entend déjà (ressort, anneau, mini-turbo, réception réussie) n'a plus de message.
export const PRIO = { info: 1, event: 2, penalty: 3, final: 4 };

export class MessageGate {
  constructor() { this.until = 0; this.prio = 0; this.text = ''; this.at = new Map(); }

  // Renvoie true si le message doit s'afficher (maintenant : horloge en ms).
  offer(text, durMs, prio, now) {
    if (!text) { this.until = 0; this.prio = 0; this.text = ''; return false; }
    const last = this.at.get(text);
    if (last !== undefined && now - last < 1000) return false;           // pas de répétition immédiate
    if (now < this.until && prio < this.prio) return false;              // un message moins important ne coupe pas le courant
    this.until = now + durMs; this.prio = prio; this.text = text;
    this.at.set(text, now);
    if (this.at.size > 40) for (const k of [...this.at.keys()].slice(0, 20)) this.at.delete(k);
    return true;
  }
}

// Textes (courts) et importance de chaque message.
export const MSG = {
  offTrack: ['Hors piste', PRIO.penalty, 1.0],
  spikes: ['Piques', PRIO.penalty, 1.1],
  glass: ['Verre brisé', PRIO.penalty, 1.1],
  sink: ['Coulé', PRIO.penalty, 1.1],
  missing: (n) => [n > 1 ? `${n} checkpoints manquants` : 'Checkpoint manquant', PRIO.penalty, 1.2],
  fall: { loop: ['Trop lent', PRIO.penalty, 1.1], twist: ['Décroché', PRIO.penalty, 1.1], inv: ['Gravité', PRIO.penalty, 1.1] },   // « crest » : plus de message
  gravity: (pct) => [`Gravité ${pct} %`, PRIO.event, 1.1],
  flip: (inverted) => [inverted ? 'Gravité inversée' : 'Gravité normale', PRIO.event, 1.1],
  vehicle: { moto: ['Moto', PRIO.event, 1.0], boat: ['Bateau', PRIO.event, 1.0], glider: ['Deltaplane', PRIO.event, 1.0], car: ['Voiture', PRIO.event, 1.0] },
  lap: (lap, laps) => [lap === laps ? 'Dernier tour' : `Tour ${lap}/${laps}`, PRIO.event, 1.2],
  reverse: ['Volant inversé', PRIO.info, 1.0],
  cut: ['Moteur coupé', PRIO.info, 0.9],
  badLanding: ['Réception ratée', PRIO.info, 0.8],
  keepClock: ['Chrono maintenu', PRIO.penalty, 1.1],
};
