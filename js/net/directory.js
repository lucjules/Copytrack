// Annuaire des salons PUBLICS : une liste de salons ouverts à tous, sans devoir échanger un code.
//
// Un canal Realtime commun (« copytrack-room-LOBBY » : 5 lettres, un vrai salon en a 6, il ne peut jamais y avoir collision) sert de tableau d'affichage : l'hôte d'un
// salon public s'y inscrit avec une fiche (code, son nom, circuit, nombre de joueurs, mode), qui disparaît dès qu'il part. Qui veut la liste s'y abonne SANS s'y inscrire.
// Les paquets de jeu, eux, ne passent jamais ici. Ce que la fiche contient est public : aucun identifiant de compte, aucune adresse.
//
// Les fiches viennent d'inconnus : chacune est validée (forme, longueurs, version compatible) avant d'être affichée, la liste est bornée. Une fausse fiche ne mène
// qu'à « Salle introuvable » : on ne peut pas faire entrer quelqu'un dans un salon qu'il n'a pas choisi de rejoindre.
import { Emitter } from './signaling.js';
import { ROOM_RE, MAX_PLAYERS } from './room.js';
import { PHYS_VER, NET_VER } from '../version.js';

export const LOBBY_CODE = 'LOBBY';
export const MAX_LISTED = 40;

const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').slice(0, n);

// Fiche d'un salon (ce que l'hôte annonce).
export function describeRoom(room) {
  const t = room.cup && !room.cup.finished && room.cupState ? room.cup.rounds[room.cupState.n] : room.track;
  return {
    code: room.code, host: room.meta.name, track: str(t && t.name, 40), players: room.list.length, max: MAX_PLAYERS,
    mode: room.cup && !room.cup.finished ? 'cup' : 'free', round: room.cup && room.cupState ? room.cupState.n + 1 : 0, rounds: room.cup ? room.cup.total : 0,
    v: PHYS_VER, net: NET_VER,
  };
}

// Valide une fiche reçue ; null si elle est invalide ou d'une autre version du jeu.
export function cleanListing(meta) {
  const r = meta && typeof meta === 'object' ? meta.room : null;
  if (!r || typeof r.code !== 'string' || !ROOM_RE.test(r.code) || r.v !== PHYS_VER || r.net !== NET_VER) return null;
  const n = (v, lo, hi) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.floor(+v))) : lo);
  return { code: r.code, host: str(r.host, 20) || '?', track: str(r.track, 40), players: n(r.players, 1, MAX_PLAYERS), max: MAX_PLAYERS, mode: r.mode === 'cup' ? 'cup' : 'free', round: n(r.round, 0, 10), rounds: n(r.rounds, 0, 10) };
}

export class PublicDirectory extends Emitter {
  // makeSignaling({ selfId, observe }) : voir defaultSignaling (room.js)
  constructor({ makeSignaling, selfId = Math.random().toString(36).slice(2) + Date.now().toString(36) }) {
    super();
    this.makeSignaling = makeSignaling; this.selfId = selfId;
    this.ann = null; this.watcher = null;
  }

  // Inscrit (ou met à jour) la fiche d'un salon.
  async announce(info) {
    if (this.ann) { this.ann.track({ room: info }); return; }
    const sig = this.ann = this.makeSignaling({ selfId: this.selfId + 'a', observe: false });
    try { await sig.join({ room: info }); } catch (e) { this.ann = null; throw e; }
  }

  retract() { if (this.ann) { try { this.ann.leave(); } catch { /* déjà fermé */ } this.ann = null; } }

  // Écoute la liste ; onChange(liste) à chaque évolution. Renvoie une fonction qui arrête l'écoute.
  async watch(onChange) {
    const sig = this.watcher = this.makeSignaling({ selfId: this.selfId + 'w', observe: true });
    const push = () => onChange([...sig.peers.values()].map(cleanListing).filter(Boolean).sort((a, b) => b.players - a.players || (a.code < b.code ? -1 : 1)).slice(0, MAX_LISTED));
    sig.on('join', push); sig.on('meta', push); sig.on('leave', push);
    await sig.join({});
    push();
    return () => { try { sig.leave(); } catch { /* déjà fermé */ } if (this.watcher === sig) this.watcher = null; };
  }

  close() { this.retract(); if (this.watcher) { try { this.watcher.leave(); } catch { /* déjà fermé */ } this.watcher = null; } }
}
