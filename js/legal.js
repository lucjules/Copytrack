// Pages légales (0.12.4) : crédits et licences, confidentialité, mentions légales, règles de la communauté. Une seule source, en français et en anglais,
// affichée dans le jeu (js/app/legal.js) et par la page autonome legal.html (lien partageable, lisible sans lancer le jeu ni créer de compte).
// Module pur (testé sous Node : tools/test-legal.mjs). Les textes anglais sont écrits ici et non dans le dictionnaire (js/i18n/en) : un texte juridique se
// relit d'un bloc, dans chaque langue. Toute évolution des données envoyées par le jeu (nouvelle table, nouveau service) doit être reportée ici.
import { GAME_NAME, VERSION } from './version.js';
import { CONFIG } from './config.js';

export const LEGAL_IDS = ['confidentialite', 'mentions', 'regles', 'credits'];
export const LEGAL_UPDATED = '2026-11-19';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const link = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>`;
const date = (lang) => new Date(LEGAL_UPDATED + 'T12:00:00Z').toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// Comment joindre l'éditeur : l'adresse réservée au jeu si elle est réglée (js/config.js, legal.contact), sinon la page du projet.
export function contactHtml(lang = 'fr', legal = CONFIG.legal) {
  const c = String(legal.contact || '').trim();
  if (/^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(c)) return `<a href="mailto:${esc(c)}">${esc(c)}</a>`;
  const issues = String(legal.source || '').replace(/\/+$/, '') + '/issues';
  return lang === 'en' ? `the project page (${link(issues, 'open an issue')})` : `la page du projet (${link(issues, 'ouvrir une demande')})`;
}

const PAGES = {
  // -------------------------------------------------------------------------------------------------------------------------------------------- confidentialité
  confidentialite: {
    fr: (L) => ({
      title: 'Confidentialité',
      html: `<p class="meta">Mise à jour le ${date('fr')} (${esc(GAME_NAME)} ${esc(VERSION)}).</p>
<p>${esc(GAME_NAME)} se joue sans compte, sans publicité, sans traceur et sans mesure d'audience. Voici exactement ce que le jeu garde, ce qu'il envoie, à qui, combien de temps, et comment exercer tes droits.</p>
<h3>Qui est responsable</h3>
<p>Le jeu est publié par ${esc(L.publisher)}, un particulier, à titre non professionnel (voir les mentions légales). Contact : ${contactHtml('fr', L)}.</p>
<h3>Sur ton appareil</h3>
<p>Ta progression, tes records, tes circuits, tes réglages et le brouillon de l'éditeur sont rangés dans le stockage local de ton navigateur. Ils sont nécessaires au jeu et ne partent nulle part tant que tu n'utilises pas une fonction en ligne. Pour les effacer : les réglages de ton navigateur (données du site), ou Profil › Sauvegardes › Effacer les records.</p>
<h3>Ce qui part sur le serveur, et pourquoi</h3>
<ul>
<li><b>Compte</b> (seulement si tu en crées un) : ton pseudo, ton mot de passe (gardé sous forme de hachage bcrypt par le service d'authentification : personne ne peut le lire) et la date de création. <b>Aucune adresse e-mail</b> n'est demandée. Sert à retrouver ta progression sur un autre appareil (sauvegarde dans le cloud).</li>
<li><b>Jeu en ligne</b> (invité ou compte) : une session à identifiant aléatoire ; tes temps (avec les commandes de la course, que le serveur rejoue pour vérifier le temps), les circuits que tu publies, tes commentaires, mentions « j'aime », signalements, abonnements, amis, duels et tournois, avec ton pseudo. Le pseudo, les temps, les circuits publiés et les commentaires sont <b>visibles par les autres joueurs</b>.</li>
<li><b>Protection contre les abus</b> : des compteurs (identifiant de session et heure) limitent les envois ; ils sont effacés au bout d'une heure environ.</li>
<li><b>Statistiques anonymes</b> (seulement si tu as dit oui) : le temps de tes arrivées et abandons et ton nombre d'essais sur les circuits officiels, avec un identifiant aléatoire propre à l'appareil, jamais lié à ton pseudo ni à ton compte. Elles servent à régler la difficulté et les médailles. Tu peux retirer ton accord à tout moment (Paramètres › Jeu).</li>
<li><b>Multijoueur</b> : les joueurs d'une salle se connectent directement entre eux (WebRTC). Les autres joueurs de la salle et les serveurs de mise en relation (STUN de Google, et un relais si le réseau l'exige) voient ton adresse IP le temps de la partie.</li>
<li><b>Hébergement du site</b> : comme tout hébergeur, GitHub reçoit l'adresse IP et le type de navigateur de chaque visiteur (journaux techniques gérés par GitHub).</li>
</ul>
<p>Bases légales (RGPD) : l'exécution du service que tu demandes (compte, jeu en ligne, multijoueur, art. 6.1.b) ; notre intérêt légitime à protéger le service (compteurs, art. 6.1.f) ; ton consentement (statistiques, art. 6.1.a). Les polices du jeu sont servies par le site lui-même : aucune requête vers un service de polices tiers.</p>
<h3>Où sont les données, et qui les voit</h3>
<ul>
<li><b>Supabase</b> (base de données, authentification, fonctions serveur), sous-traitant : serveurs à Londres, Royaume-Uni, pays qui bénéficie d'une décision d'adéquation de la Commission européenne.</li>
<li><b>GitHub, Inc.</b> (hébergement du site), États-Unis.</li>
<li><b>Google</b> (serveurs STUN), pour le multijoueur seulement.</li>
</ul>
<p>Rien n'est vendu ni utilisé pour de la publicité.</p>
<h3>Combien de temps</h3>
<ul>
<li>Compte, sauvegarde, temps, circuits publiés, commentaires : tant que le compte existe. Profil › Supprimer le compte efface le tout, immédiatement et définitivement.</li>
<li>Données d'une session invitée : 12 mois au plus après sa dernière activité.</li>
<li>Statistiques anonymes : 12 mois au plus.</li>
<li>Compteurs contre les abus : environ une heure.</li>
</ul>
<h3>Tes droits</h3>
<p>Tu peux accéder à tes données, les corriger, les effacer, les récupérer (Profil › Sauvegardes › <b>Exporter mes données</b> : un fichier JSON), t'opposer à un traitement, le limiter et retirer ton consentement. Pour toute demande : ${contactHtml('fr', L)}. Tu peux aussi adresser une réclamation à la CNIL (${link('https://www.cnil.fr/fr/plaintes', 'cnil.fr')}).</p>
<h3>Âge</h3>
<p>Créer un compte, publier un circuit ou écrire un commentaire est réservé aux joueurs de <b>15 ans ou plus</b>, ou à ceux qui ont l'accord d'un parent (article 45 de la loi Informatique et Libertés). Le jeu en invité, sans rien publier, reste ouvert à tous.</p>
<h3>Sécurité</h3>
<p>Connexions chiffrées (HTTPS), règles d'accès vérifiées ligne par ligne dans la base (personne ne lit ni ne modifie les données d'un autre joueur), mots de passe hachés, temps revérifiés par le serveur.</p>`,
    }),
    en: (L) => ({
      title: 'Privacy',
      html: `<p class="meta">Updated ${date('en')} (${esc(GAME_NAME)} ${esc(VERSION).replace('bêta', 'beta')}).</p>
<p>${esc(GAME_NAME)} can be played without an account, without ads, trackers or audience measurement. Here is exactly what the game keeps, what it sends, to whom, for how long, and how to exercise your rights.</p>
<h3>Who is responsible</h3>
<p>The game is published by ${esc(L.publisher)}, a private individual, on a non-professional basis (see the legal notice). Contact: ${contactHtml('en', L)}.</p>
<h3>On your device</h3>
<p>Your progress, records, tracks, settings and editor draft are stored in your browser's local storage. They are needed by the game and go nowhere unless you use an online feature. To erase them: your browser settings (site data), or Profile › Saves › Clear records.</p>
<h3>What is sent to the server, and why</h3>
<ul>
<li><b>Account</b> (only if you create one): your username, your password (kept as a bcrypt hash by the authentication service: nobody can read it) and the creation date. <b>No email address</b> is requested. Used to find your progress on another device (cloud save).</li>
<li><b>Online play</b> (guest or account): a session with a random identifier; your times (with the race inputs, which the server replays to check the time), the tracks you publish, your comments, likes, reports, follows, friends, duels and tournaments, with your username. Usernames, times, published tracks and comments are <b>visible to other players</b>.</li>
<li><b>Abuse protection</b>: counters (session identifier and time) limit submissions; they are erased after about one hour.</li>
<li><b>Anonymous statistics</b> (only if you said yes): your finish and retirement times and number of attempts on the official tracks, with a random identifier specific to the device, never linked to your username or account. They are used to tune difficulty and medals. You can withdraw your consent at any time (Settings › Game).</li>
<li><b>Multiplayer</b>: players in a room connect directly to each other (WebRTC). The other players in the room and the connection servers (Google STUN, and a relay if the network requires one) see your IP address for the duration of the game.</li>
<li><b>Website hosting</b>: like any host, GitHub receives the IP address and browser type of each visitor (technical logs managed by GitHub).</li>
</ul>
<p>Legal bases (GDPR): performance of the service you request (account, online play, multiplayer, Art. 6(1)(b)); our legitimate interest in protecting the service (counters, Art. 6(1)(f)); your consent (statistics, Art. 6(1)(a)). The game's fonts are served by the site itself: no request to a third-party font service.</p>
<h3>Where the data is, and who sees it</h3>
<ul>
<li><b>Supabase</b> (database, authentication, server functions), processor: servers in London, United Kingdom, a country covered by a European Commission adequacy decision.</li>
<li><b>GitHub, Inc.</b> (website hosting), United States.</li>
<li><b>Google</b> (STUN servers), for multiplayer only.</li>
</ul>
<p>Nothing is sold or used for advertising.</p>
<h3>How long</h3>
<ul>
<li>Account, cloud save, times, published tracks, comments: as long as the account exists. Profile › Delete account erases all of it, immediately and permanently.</li>
<li>Guest session data: at most 12 months after its last activity.</li>
<li>Anonymous statistics: at most 12 months.</li>
<li>Abuse counters: about one hour.</li>
</ul>
<h3>Your rights</h3>
<p>You can access, correct, erase and retrieve your data (Profile › Saves › <b>Export my data</b>: a JSON file), object to or restrict processing, and withdraw your consent. For any request: ${contactHtml('en', L)}. You can also lodge a complaint with the French data protection authority, the CNIL (${link('https://www.cnil.fr/fr/plaintes', 'cnil.fr')}), or with your own country's authority.</p>
<h3>Age</h3>
<p>Creating an account, publishing a track or writing a comment is reserved for players <b>aged 15 or over</b>, or with a parent's consent (Article 45 of the French Data Protection Act). Guest play, without publishing anything, remains open to everyone.</p>
<h3>Security</h3>
<p>Encrypted connections (HTTPS), access rules checked row by row in the database (nobody can read or change another player's data), hashed passwords, times re-checked by the server.</p>`,
    }),
  },
  // -------------------------------------------------------------------------------------------------------------------------------------------- mentions légales
  mentions: {
    fr: (L) => ({
      title: 'Mentions légales',
      html: `<h3>Éditeur</h3>
<p>${esc(GAME_NAME)} est publié par ${esc(L.publisher)}, particulier, à titre non professionnel et gratuit. Conformément à l'article 6, III, 2 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique, l'éditeur ne publie pas son identité ; ses coordonnées sont connues de l'hébergeur. Directeur de la publication : l'éditeur. Contact : ${contactHtml('fr', L)}.</p>
<h3>Hébergeur du site</h3>
<p>GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis · +1 877 448 4820 · ${link('https://github.com', 'github.com')}</p>
<h3>Services en ligne</h3>
<p>Classements, comptes, communauté et salons : Supabase (${link('https://supabase.com', 'supabase.com')}), serveurs au Royaume-Uni.</p>
<h3>Propriété intellectuelle</h3>
<p>Le code du jeu est publié sous licence MIT (${link(L.source, 'code source')}). Décors, véhicules, pièces, circuits officiels, icônes, musique et sons ont été créés pour le jeu. Les éléments tiers et leurs licences sont listés dans « Crédits et licences ». Les circuits, pseudos et commentaires publiés par les joueurs restent sous la responsabilité de leurs auteurs.</p>
<h3>Signaler un contenu</h3>
<p>Chaque circuit et chaque commentaire publiés ont un bouton « Signaler ». Pour un contenu illicite ou une demande urgente : ${contactHtml('fr', L)}.</p>`,
    }),
    en: (L) => ({
      title: 'Legal notice',
      html: `<h3>Publisher</h3>
<p>${esc(GAME_NAME)} is published by ${esc(L.publisher)}, a private individual, on a non-professional, free-of-charge basis. In accordance with Article 6, III, 2 of French law no. 2004-575 of 21 June 2004 (LCEN), the publisher does not disclose their identity; their details are known to the host. Publication director: the publisher. Contact: ${contactHtml('en', L)}.</p>
<h3>Website host</h3>
<p>GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, United States · +1 877 448 4820 · ${link('https://github.com', 'github.com')}</p>
<h3>Online services</h3>
<p>Leaderboards, accounts, community and rooms: Supabase (${link('https://supabase.com', 'supabase.com')}), servers in the United Kingdom.</p>
<h3>Intellectual property</h3>
<p>The game's code is published under the MIT licence (${link(L.source, 'source code')}). Scenery, vehicles, pieces, official tracks, icons, music and sounds were created for the game. Third-party components and their licences are listed under "Credits and licences". Tracks, usernames and comments published by players remain the responsibility of their authors.</p>
<h3>Report content</h3>
<p>Every published track and comment has a "Report" button. For illegal content or an urgent request: ${contactHtml('en', L)}.</p>`,
    }),
  },
  // -------------------------------------------------------------------------------------------------------------------------------------------- règles
  regles: {
    fr: (L) => ({
      title: 'Règles de la communauté',
      html: `<p>Elles valent pour les pseudos, les noms et descriptions de circuits, les commentaires et les salons.</p>
<ul>
<li><b>Respect</b> : ni insulte, ni harcèlement, ni propos haineux ou discriminatoires, ni contenu sexuel, violent ou illégal.</li>
<li><b>Vie privée</b> : aucune donnée personnelle, ni la tienne ni celle d'un autre (nom, adresse, téléphone, e-mail, photo).</li>
<li><b>Jeu propre</b> : pas de triche. Les temps sont rejoués par le serveur ; un temps impossible est refusé.</li>
<li><b>Tes créations</b> : publie des circuits que tu as faits toi-même ; ne reproduis pas un circuit d'un autre jeu. En publiant, tu permets aux autres joueurs d'y jouer, de le partager et d'en modifier une copie dans le jeu.</li>
<li><b>Pas de spam</b> ni de publicité.</li>
<li><b>Âge</b> : 15 ans ou plus pour publier, ou avec l'accord d'un parent.</li>
</ul>
<h3>Modération</h3>
<p>Chaque circuit et chaque commentaire peuvent être signalés. Trois signalements de comptes différents masquent un contenu en attendant la modération ; les modérateurs peuvent masquer ou rétablir un contenu. Un compte qui enfreint ces règles à répétition peut être supprimé. Contact : ${contactHtml('fr', L)}.</p>`,
    }),
    en: (L) => ({
      title: 'Community rules',
      html: `<p>They apply to usernames, track names and descriptions, comments and rooms.</p>
<ul>
<li><b>Respect</b>: no insults, harassment, hateful or discriminatory remarks, and no sexual, violent or illegal content.</li>
<li><b>Privacy</b>: no personal data, neither yours nor anyone else's (name, address, phone number, email, photo).</li>
<li><b>Fair play</b>: no cheating. Times are replayed by the server; an impossible time is rejected.</li>
<li><b>Your creations</b>: publish tracks you made yourself; do not reproduce a track from another game. By publishing, you allow other players to play it, share it and edit a copy of it in the game.</li>
<li><b>No spam</b> or advertising.</li>
<li><b>Age</b>: 15 or over to publish, or with a parent's consent.</li>
</ul>
<h3>Moderation</h3>
<p>Every track and comment can be reported. Three reports from different accounts hide content pending moderation; moderators can hide or restore content. An account that repeatedly breaks these rules may be deleted. Contact: ${contactHtml('en', L)}.</p>`,
    }),
  },
  // -------------------------------------------------------------------------------------------------------------------------------------------- crédits
  credits: {
    fr: (L) => ({
      title: 'Crédits et licences',
      html: `<p><b>${esc(GAME_NAME)}</b> ${esc(VERSION)} · code publié sous licence MIT (${link(L.source, 'code source')}, fichier LICENSE).</p>
<p>Décors, véhicules, pièces, circuits officiels et icônes ont été créés pour le jeu. La musique et les sons sont synthétisés en direct par le jeu : il n'utilise aucun fichier audio.</p>
<h3>Composants tiers</h3>
<ul>
<li><b>three.js</b> r170 et son module TransformControls : licence MIT, © 2010-2024 three.js authors.</li>
<li><b>Chakra Petch</b> (police du jeu) : SIL Open Font License 1.1, © 2018 The Chakra Petch Project Authors.</li>
<li><b>Unbounded</b>, <b>IBM Plex Sans</b> et <b>IBM Plex Mono</b> (polices du wiki) : SIL Open Font License 1.1, © 2022 The Unbounded Project Authors, © 2017-2019 IBM Corp.</li>
</ul>
<p>Le texte complet de chaque licence accompagne le code : LICENSE, THIRD-PARTY-NOTICES.md, js/vendor/THREE_LICENSE.txt, assets/fonts/OFL.txt, wiki/fonts/OFL.txt.</p>`,
    }),
    en: (L) => ({
      title: 'Credits and licences',
      html: `<p><b>${esc(GAME_NAME)}</b> ${esc(VERSION).replace('bêta', 'beta')} · code published under the MIT licence (${link(L.source, 'source code')}, LICENSE file).</p>
<p>Scenery, vehicles, pieces, official tracks and icons were created for the game. Music and sounds are synthesised live by the game: it uses no audio file.</p>
<h3>Third-party components</h3>
<ul>
<li><b>three.js</b> r170 and its TransformControls module: MIT licence, © 2010-2024 three.js authors.</li>
<li><b>Chakra Petch</b> (game font): SIL Open Font License 1.1, © 2018 The Chakra Petch Project Authors.</li>
<li><b>Unbounded</b>, <b>IBM Plex Sans</b> and <b>IBM Plex Mono</b> (wiki fonts): SIL Open Font License 1.1, © 2022 The Unbounded Project Authors, © 2017-2019 IBM Corp.</li>
</ul>
<p>The full text of each licence ships with the code: LICENSE, THIRD-PARTY-NOTICES.md, js/vendor/THREE_LICENSE.txt, assets/fonts/OFL.txt, wiki/fonts/OFL.txt.</p>`,
    }),
  },
};

// Une page : { id, title, html } dans la langue demandée (français par défaut). `legal` : réglages de js/config.js (les tests en passent d'autres).
export function legalPage(id, lang = 'fr', legal = CONFIG.legal) {
  const P = PAGES[id] || PAGES.confidentialite;
  const make = P[lang === 'en' ? 'en' : 'fr'];
  return { id: PAGES[id] ? id : 'confidentialite', ...make(legal) };
}
