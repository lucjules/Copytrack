// Transport de jeu : WebRTC pair à pair en maillage complet (chaque joueur est relié directement à tous les autres).
//
// COMMENT ÇA MARCHE (la partie délicate, en clair)
// ------------------------------------------------
// 1. Annuaire. Les joueurs d'une salle se découvrent par la signalisation (signaling.js : Supabase Realtime). Quand le
//    joueur B apparaît, A et B doivent maintenant ouvrir un tuyau direct. Un navigateur ne connaît pas l'adresse de l'autre :
//    il faut un échange d'informations par un tiers. C'est le rôle de la signalisation, et seulement ça.
// 2. Qui commence ? Pour chaque PAIRE, le joueur dont l'identifiant est le plus petit (ordre alphabétique) est
//    l'« initiateur » : lui seul crée la connexion et les canaux, l'autre ne fait que répondre. Pas de double offre
//    simultanée (« glare ») : c'est la règle la plus simple pour l'éviter.
// 3. Offre / réponse (SDP). L'initiateur crée un RTCPeerConnection + deux canaux de données, fabrique une OFFRE (description
//    de ce qu'il sait faire), la garde (setLocalDescription) et l'envoie par la signalisation. L'autre la reçoit
//    (setRemoteDescription), fabrique une RÉPONSE, la garde et la renvoie. Chacun connaît alors les capacités de l'autre.
// 4. Candidats ICE. En parallèle, chaque navigateur découvre ses adresses possibles (locale, publique vue par un serveur STUN,
//    éventuellement un relais TURN) et les envoie au fur et à mesure (« trickle ICE »). Un candidat reçu AVANT la description
//    distante est mis en attente puis appliqué ensuite. Le navigateur essaie les paires d'adresses jusqu'à en trouver une qui
//    marche : le tuyau s'ouvre, la signalisation n'est plus utilisée pour cette paire.
// 5. Deux canaux par paire :
//      « state » : non fiable, non ordonné (maxRetransmits 0) = UDP pur. Un paquet de position perdu est déjà périmé 50 ms plus
//                  tard : le retransmettre ne ferait qu'ajouter du retard. On saute l'envoi si la file d'envoi dépasse 16 Ko.
//      « ctl »   : fiable et ordonné, pour les messages rares qui ne doivent pas se perdre (prêt, départ, arrivée, ping).
// 6. Réseaux fermés. STUN (gratuit) suffit pour la plupart des box. Environ 10 à 20 % des paires (réseaux d'entreprise, 4G à
//    NAT symétrique) échouent sans relais : il faut alors un serveur TURN (payant, ou à héberger) à ajouter dans ICE_SERVERS.
//    Une paire qui échoue est signalée (état « failed ») : le joueur reste dans la salle mais ne voit pas / n'est pas vu de cet autre.
// 7. Coût : N joueurs = N·(N−1)/2 connexions ; chacun envoie son état N−1 fois. À 8 joueurs : 7 liens, ~0,8 Ko/s chacun.
export const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  // { urls: 'turn:turn.example.com:3478', username: '…', credential: '…' },   // relais pour les réseaux qui bloquent le P2P
];

export const MAX_BUFFERED = 16 * 1024;

export class PeerLink {
  constructor(mesh, id, initiator) {
    this.mesh = mesh; this.id = id; this.initiator = initiator;
    this.pc = null; this.state = null; this.ctl = null;
    this.pending = [];             // candidats ICE reçus avant la description distante
    this.remoteSet = false;
    this.status = 'connecting';    // connecting | open | failed | closed
    this.restarts = 0;
  }
}

export class PeerMesh {
  // signaling : voir signaling.js ; handlers : { onMessage(id, 'ctl'|'state', data), onLink(id, status) }
  constructor({ selfId, signaling, handlers, iceServers = ICE_SERVERS, RTC = globalThis.RTCPeerConnection }) {
    this.selfId = selfId; this.signaling = signaling; this.h = handlers; this.ice = iceServers; this.RTC = RTC;
    this.links = new Map();
    this.stats = { sent: 0, recv: 0, skipped: 0 };
    signaling.on('signal', (from, data) => this._onSignal(from, data));
  }

  // Un joueur est apparu dans la salle : on ouvre (ou on attend) la connexion.
  addPeer(id) {
    if (this.links.has(id) || id === this.selfId) return;
    const link = new PeerLink(this, id, this.selfId < id);
    this.links.set(id, link);
    this._setup(link);
    if (link.initiator) this._offer(link);
  }

  removePeer(id) {
    const l = this.links.get(id);
    if (!l) return;
    this._close(l, 'closed');
    this.links.delete(id);
  }

  closeAll() { for (const id of [...this.links.keys()]) this.removePeer(id); }

  _setup(link) {
    const pc = new this.RTC({ iceServers: this.ice });
    link.pc = pc;
    pc.onicecandidate = (e) => { if (e.candidate) this.signaling.send(link.id, { k: 'ice', c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'failed') {
        // Une seule relance d'ICE (changement de réseau, Wi-Fi → 4G) avant d'abandonner.
        if (link.initiator && link.restarts < 1) { link.restarts++; this._offer(link, true); } else this._status(link, 'failed');
      } else if (s === 'closed') this._status(link, 'closed');
    };
    if (link.initiator) {
      this._channels(link, pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 }), pc.createDataChannel('ctl', { ordered: true }));
    } else {
      pc.ondatachannel = (e) => this._channels(link, e.channel);
    }
  }

  _channels(link, ...chans) {
    for (const ch of chans) {
      ch.binaryType = 'arraybuffer';
      if (ch.label === 'state') link.state = ch; else if (ch.label === 'ctl') link.ctl = ch; else continue;
      ch.onopen = () => { if (link.state && link.ctl && link.state.readyState === 'open' && link.ctl.readyState === 'open') this._status(link, 'open'); };
      ch.onclose = () => { if (link.status === 'open') this._status(link, 'closed'); };
      ch.onmessage = (e) => {
        this.stats.recv += e.data.byteLength || e.data.length || 0;
        if (ch.label === 'ctl') { let m; try { m = JSON.parse(e.data); } catch { return; } if (m && typeof m === 'object') this.h.onMessage(link.id, 'ctl', m); }
        else this.h.onMessage(link.id, 'state', e.data);
      };
      if (ch.readyState === 'open') ch.onopen();
    }
  }

  _status(link, s) {
    if (link.status === s) return;
    link.status = s;
    this.h.onLink(link.id, s);
  }

  async _offer(link, iceRestart = false) {
    try {
      const offer = await link.pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      await link.pc.setLocalDescription(offer);
      this.signaling.send(link.id, { k: 'desc', d: link.pc.localDescription.toJSON ? link.pc.localDescription.toJSON() : link.pc.localDescription });
    } catch { this._status(link, 'failed'); }
  }

  async _onSignal(from, data) {
    if (!data || typeof data !== 'object') return;
    let link = this.links.get(from);
    if (!link) { this.addPeer(from); link = this.links.get(from); if (!link) return; }
    try {
      if (data.k === 'desc' && data.d) {
        // Seul le non-initiateur reçoit des offres ; seul l'initiateur reçoit des réponses.
        if (data.d.type === 'offer' && !link.initiator) {
          if (link.remoteSet) { /* relance ICE : nouvelle offre sur la même connexion */ }
          await link.pc.setRemoteDescription(data.d);
          link.remoteSet = true;
          await this._flush(link);
          const answer = await link.pc.createAnswer();
          await link.pc.setLocalDescription(answer);
          this.signaling.send(from, { k: 'desc', d: link.pc.localDescription.toJSON ? link.pc.localDescription.toJSON() : link.pc.localDescription });
        } else if (data.d.type === 'answer' && link.initiator) {
          await link.pc.setRemoteDescription(data.d);
          link.remoteSet = true;
          await this._flush(link);
        }
      } else if (data.k === 'ice' && data.c) {
        if (link.remoteSet) await link.pc.addIceCandidate(data.c); else link.pending.push(data.c);
      }
    } catch { /* message de signalisation invalide ou tardif : ignoré */ }
  }

  async _flush(link) {
    const q = link.pending.splice(0);
    for (const c of q) { try { await link.pc.addIceCandidate(c); } catch { /* candidat périmé */ } }
  }

  _close(link, status) {
    try { link.state && link.state.close(); link.ctl && link.ctl.close(); link.pc && link.pc.close(); } catch { /* déjà fermé */ }
    this._status(link, status);
  }

  // Un paquet d'état à tous (canal non fiable). Un lien dont la file d'envoi est pleine est sauté : mieux vaut perdre un
  // paquet que d'accumuler du retard.
  broadcastState(buf) {
    for (const l of this.links.values()) {
      const ch = l.state;
      if (!ch || ch.readyState !== 'open') continue;
      if (ch.bufferedAmount > MAX_BUFFERED) { this.stats.skipped++; continue; }
      try { ch.send(buf); this.stats.sent += buf.byteLength; } catch { /* canal en cours de fermeture */ }
    }
  }

  // Un message fiable : à un joueur (id) ou à tous.
  sendCtl(msg, id = null) {
    const text = JSON.stringify(msg);
    for (const l of this.links.values()) {
      if (id && l.id !== id) continue;
      if (l.ctl && l.ctl.readyState === 'open') { try { l.ctl.send(text); } catch { /* fermeture en cours */ } }
    }
  }

  openIds() { return [...this.links.values()].filter((l) => l.status === 'open').map((l) => l.id); }
}
