// Réglages propres à un DÉPLOIEMENT du jeu : le serveur en ligne (classements, communauté, comptes, salons) et le relais réseau du multijoueur.
// Pour héberger ta propre version, change ces valeurs ici, ou, sans toucher au code, définis avant le chargement du jeu (dans index.html) :
//   <script>window.COPYTRACK_CONFIG = { supabase: { url: 'https://….supabase.co', key: 'sb_publishable_…' }, iceServers: [ … ] };</script>
// Sans réseau, ou si la section est vide, le jeu marche normalement : seules les fonctions en ligne répondent « hors ligne ».
const DEFAULTS = {
  // Projet Supabase. La clé est la clé PUBLIQUE (« publishable » / anon) : elle est faite pour être dans le navigateur ; la sécurité vient des règles
  // de la base (supabase/*.sql) et de la fonction serveur submit-score. La clé SECRÈTE n'apparaît jamais ici.
  supabase: {
    url: 'https://vakhnbmqnwvkekwuntbz.supabase.co',
    key: 'sb_publishable_wBsMno7Qs4N-dM7usIm5OQ_0aEv-N1o',
  },
  // Serveurs ICE du multijoueur (WebRTC). STUN (gratuit) suffit pour la plupart des box ; 10 à 20 % des paires (réseaux d'entreprise, 4G à NAT symétrique) ont
  // besoin d'un relais TURN, payant ou à héberger : ajoute-le ici, par exemple
  //   { urls: 'turn:turn.example.com:3478', username: '…', credential: '…' }
  // (les identifiants d'un relais TURN sont lisibles par les joueurs : utilise des identifiants à durée limitée fournis par ton relais, pas un compte permanent).
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ],
  // Fonction serveur « ice » (supabase/functions/ice) : renvoie STUN + relais TURN à identifiants à DURÉE LIMITÉE, demandés à l'ouverture d'une salle. Absente ou en panne :
  // le jeu retombe sur iceServers ci-dessus (STUN seul). '' la désactive. Voir supabase/MULTI.md.
  iceUrl: undefined,
};

const override = (typeof globalThis !== 'undefined' && globalThis.COPYTRACK_CONFIG) || {};
export const CONFIG = {
  supabase: { ...DEFAULTS.supabase, ...(override.supabase || {}) },
  iceServers: Array.isArray(override.iceServers) ? override.iceServers : DEFAULTS.iceServers,
  iceUrl: typeof override.iceUrl === 'string' ? override.iceUrl : `${(override.supabase && override.supabase.url) || DEFAULTS.supabase.url}/functions/v1/ice`,
};
