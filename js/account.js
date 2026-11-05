// Comptes Copytrack : pseudo + mot de passe, sauvegarde cloud entre appareils. Les invités restent locaux.
//
// Mots de passe : jamais stockés ni vus par le jeu. Ils partent en HTTPS vers Supabase Auth (GoTrue), qui ne garde
// qu'un hachage bcrypt salé (auth.users.encrypted_password). Le pseudo sert d'identifiant : l'adresse technique
// « pseudo@accounts.copytrack.invalid » n'est jamais utilisée pour envoyer un e-mail (voir supabase/COMPTES.md).
//
// Données : chaque compte a sa propre portée de stockage local (storage.js : setScope) et une ligne cloud
// (table cloud_saves, lisible et modifiable par son seul propriétaire). La synchronisation fusionne (cloudsave.js)
// au lieu d'écraser : aucune progression perdue si deux appareils ont joué.
import { online, OnlineError } from './online.js';
import {
  getGlobal, setGlobal, setScope, getSessionFlag, setSessionFlag, dumpAll, restoreAll, onWrite, loadSettings, saveSettings,
} from './storage.js';
import { toCloud, fromCloud, mergeSaves, sameData, pickSynced, withoutGhosts, isSyncKey } from './cloudsave.js';
import { reloadProfile } from './profile.js';

// Domaine technique des adresses (doit être le même que dans supabase/etape4-comptes.sql).
export const ACCOUNT_EMAIL_DOMAIN = 'accounts.copytrack.invalid';
export const FORBIDDEN_NAMES = ['player', 'pilote'];
export const MAX_CLOUD_BYTES = 6_000_000;     // au-delà, les fantômes enregistrés ne partent pas dans le cloud

export const accountEmail = (name) => String(name).trim().toLowerCase() + '@' + ACCOUNT_EMAIL_DOMAIN;

// Pseudo : jamais « Player » / « Pilote ». Invité : 2 à 20 caractères lisibles ; compte : 3 à 20 lettres, chiffres ou _.
export function checkPseudo(raw, { account = false } = {}) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: 'Choisis un pseudo.' };
  if (FORBIDDEN_NAMES.includes(name.toLowerCase())) return { ok: false, error: '« Player » et « Pilote » sont réservés : choisis ton propre pseudo.' };
  if (account) {
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) return { ok: false, error: 'Le pseudo d’un compte fait 3 à 20 caractères : lettres, chiffres ou _ (sans espace ni accent).' };
  } else if (!/^[\p{L}\p{N} _.'-]{2,20}$/u.test(name)) {
    return { ok: false, error: 'Le pseudo fait 2 à 20 caractères (lettres, chiffres, espace, _ . - \').' };
  }
  return { ok: true, name };
}

// Mot de passe : 8 caractères au moins ; 72 octets au plus (bcrypt ignore la suite).
export function checkPassword(pw, pseudo = '') {
  const s = String(pw ?? '');
  if (s.length < 8) return { ok: false, error: 'Le mot de passe doit faire au moins 8 caractères.' };
  if (new TextEncoder().encode(s).length > 72) return { ok: false, error: 'Le mot de passe est trop long (72 octets au plus).' };
  if (pseudo && s.toLowerCase() === String(pseudo).toLowerCase()) return { ok: false, error: 'Le mot de passe ne doit pas être ton pseudo.' };
  return { ok: true };
}

class Account {
  constructor() {
    this.state = null;            // { uid, username, session } quand un compte est connecté
    this.status = 'idle';         // idle | syncing | ok | offline | error
    this.lastSync = 0;
    this.lastError = '';
    this._timer = null;
    this._running = null;
    this._dirty = false;
    this._wired = false;
  }

  get isAccount() { return !!this.state; }
  get username() { return this.state ? this.state.username : ''; }
  get uid() { return this.state ? this.state.uid : ''; }

  // ---- Démarrage ---------------------------------------------------------------------------
  // Un compte déjà connecté sur cet appareil est repris sans rien redemander. { kind: 'account' | 'expired' | 'none' }
  async restore() {
    const st = getGlobal('account', null);
    if (!st || !st.uid || !st.username || !st.session || !st.session.refresh_token) return { kind: 'none' };
    this._adopt(st);
    try {
      // Réseau lent ou absent : on n'attend pas plus de 6 s, le jeu démarre avec la sauvegarde locale du compte.
      await Promise.race([online.ensureSession(), new Promise((_, rej) => setTimeout(() => rej(new OnlineError('Délai dépassé.', 'offline')), 6000))]);
    } catch (e) {
      if (e.code === 'session-expired') { const name = st.username; this._forget(); return { kind: 'expired', username: name }; }
      // hors ligne : on joue avec la sauvegarde locale du compte, la synchronisation reprendra plus tard
    }
    setScope(st.uid);
    this._wire();
    return { kind: 'account', username: this.state.username };
  }

  _adopt(st) {
    this.state = st;
    online.useAccount(st.session, st.username);
    online.onAccountSession = (session) => { if (this.state) { this.state.session = session; setGlobal('account', this.state); } };
  }

  _forget() {
    this.state = null;
    setGlobal('account', null);
    online.onAccountSession = null;
    setScope('');          // d'abord la portée invité : useGuest() efface la session anonyme de l'INVITÉ, pas celle du compte
    online.useGuest();
  }

  // ---- Invité ------------------------------------------------------------------------------
  // Pseudo temporaire : valable pour cette session du navigateur ; la progression reste locale (portée « invité »).
  startGuest(rawName) {
    const c = checkPseudo(rawName);
    if (!c.ok) throw new OnlineError(c.error, 'invalid');
    setScope('');
    const s = loadSettings();
    s.playerName = c.name;
    saveSettings(s);
    setSessionFlag('guest', '1');
    return { kind: 'guest', username: c.name };
  }

  // Invité de cette session ? (pseudo valide mémorisé + marqueur de session)
  resumeGuest() {
    if (getSessionFlag('guest') !== '1') return null;
    const c = checkPseudo(loadSettings().playerName);
    return c.ok ? { kind: 'guest', username: c.name } : null;
  }

  lastGuestName() { const c = checkPseudo(loadSettings().playerName); return c.ok ? c.name : ''; }
  lastAccountName() { return getGlobal('lastAccount', ''); }
  // Y a-t-il quelque chose à reprendre ? (un profil vierge, créé au premier lancement, ne compte pas)
  hasGuestProgress() {
    const d = pickSynced(dumpAll());
    if (Object.keys(d).some((k) => k.startsWith('rec3.') || k.startsWith('ghostImp.'))) return true;
    try { if (JSON.parse(d.tracks || '[]').length) return true; } catch { /* abîmé : ignoré */ }
    try {
      const p = JSON.parse(d.profile || '{}');
      return !!((p.stats && p.stats.races) || p.coins || Object.keys(p.owned || {}).length || Object.keys(p.medals || {}).length);
    } catch { return false; }
  }
  leaveGuest() { setSessionFlag('guest', null); }

  // ---- Comptes -----------------------------------------------------------------------------
  async usernameAvailable(name) {
    try {
      return await online.rest('/rest/v1/rpc/username_available', { method: 'POST', auth: false, body: { n: name } }) === true;
    } catch (e) {
      if (e.code === 'offline') throw e;
      throw new OnlineError('Comptes non installés sur le serveur (étape 4 SQL).', 'no-schema');
    }
  }

  async signUp(rawName, password, { keepGuest = false } = {}) {
    const c = checkPseudo(rawName, { account: true });
    if (!c.ok) throw new OnlineError(c.error, 'invalid');
    const p = checkPassword(password, c.name);
    if (!p.ok) throw new OnlineError(p.error, 'invalid');
    // La progression de l'invité est lue AVANT de changer de portée.
    const guestDump = keepGuest ? pickSynced(dumpAll()) : null;
    const tutorialDone = !!loadSettings().tutorialDone;
    if (!(await this.usernameAvailable(c.name))) throw new OnlineError('Ce pseudo est déjà pris.', 'name-taken');
    const d = await online.rest('/auth/v1/signup', { method: 'POST', auth: false, body: { email: accountEmail(c.name), password, data: { username: c.name } } });
    if (!d || !d.access_token) throw new OnlineError('Compte créé, mais le serveur exige une confirmation par e-mail (voir COMPTES.md).', 'server-config');
    this._begin(d, c.name);
    if (guestDump) restoreAll(guestDump, true);
    const s = loadSettings(); s.playerName = c.name; s.tutorialDone = tutorialDone; saveSettings(s);
    reloadProfile();
    try { await online.ensurePlayer(c.name); await this.sync(); } catch { /* le compte existe ; la synchronisation reprendra */ }
    return { kind: 'account', username: c.name };
  }

  async signIn(rawName, password) {
    const c = checkPseudo(rawName, { account: true });
    if (!c.ok || !password) throw new OnlineError('Pseudo ou mot de passe incorrect.', 'bad-credentials');
    const d = await online.rest('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email: accountEmail(c.name), password } });
    this._begin(d, c.name);
    // Casse exacte du pseudo, telle qu'enregistrée.
    try {
      const rows = await online.rest('/rest/v1/accounts?select=username&user_id=eq.' + encodeURIComponent(this.state.uid));
      if (rows && rows[0] && rows[0].username) { this.state.username = rows[0].username; setGlobal('account', this.state); online.player = { id: this.state.uid, name: this.state.username }; }
    } catch { /* le pseudo saisi fait foi */ }
    const s = loadSettings(); s.playerName = this.state.username; saveSettings(s);
    reloadProfile();
    online.ensurePlayer(this.state.username).catch(() => {});      // profil en ligne (classements, circuits) : sans bloquer
    try { await this.sync(); } catch (e) { if (e.code === 'session-expired') throw e; /* hors ligne : reprise plus tard */ }
    return { kind: 'account', username: this.state.username };
  }

  _begin(d, name) {
    const session = online._norm(d);
    this._adopt({ uid: session.user.id, username: name, session });
    setGlobal('account', this.state);
    setGlobal('lastAccount', name);
    setScope(this.state.uid);
    setSessionFlag('guest', null);
    this._wire();
  }

  // Déconnexion : dernière synchronisation, puis retour à l'invité (la page doit être rechargée ensuite).
  async signOut() {
    if (!this.state) return;
    try { await this.sync(); } catch { /* hors ligne : les données restent dans la portée locale du compte */ }
    this._forget();
    setSessionFlag('guest', null);
  }

  // Suppression définitive du compte et de ses données cloud ; les données locales du compte sont effacées aussi.
  async deleteAccount() {
    if (!this.state) return;
    await online.rest('/rest/v1/rpc/delete_account', { method: 'POST', body: {} });
    restoreAll({}, false);      // efface la portée locale du compte
    this._forget();
    setSessionFlag('guest', null);
  }

  // ---- Synchronisation ----------------------------------------------------------------------
  _wire() {
    if (this._wired) return;
    this._wired = true;
    onWrite((key) => { if (this.state && isSyncKey(key)) this.scheduleSync(); });
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => { if (this._dirty) this.sync().catch(() => {}); });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && this._dirty) this.sync().catch(() => {}); });
    }
  }

  scheduleSync(delay = 4000) {
    if (!this.state) return;
    this._dirty = true;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => { this.sync().catch(() => {}); }, delay);
  }

  // Lit le cloud, fusionne avec le local, écrit le résultat (avec contrôle de version : jamais d'écrasement aveugle).
  sync() {
    if (!this.state) return Promise.resolve('guest');
    if (this._running) return this._running;
    clearTimeout(this._timer);
    this.status = 'syncing';
    this._running = this._doSync()
      .then((r) => { this.status = 'ok'; this.lastSync = Date.now(); this.lastError = ''; this._dirty = false; return r; })
      .catch((e) => { this.status = e.code === 'offline' ? 'offline' : 'error'; this.lastError = e.message; throw e; })
      .finally(() => { this._running = null; });
    return this._running;
  }

  async _doSync() {
    const uid = this.state.uid;
    for (let attempt = 0; attempt < 4; attempt++) {
      const rows = await online.rest(`/rest/v1/cloud_saves?select=data,rev&user_id=eq.${encodeURIComponent(uid)}`);
      const row = rows && rows[0];
      const local = toCloud(dumpAll());
      const merged = row ? mergeSaves(local, row.data) : local;
      // Le résultat fusionné devient aussi la version locale (sans déclencher de nouvelle synchronisation).
      if (!sameData(merged, local)) { restoreAll(fromCloud(merged), true); reloadProfile(); }
      if (row && sameData(merged, row.data)) return 'à jour';
      let data = merged;
      if (JSON.stringify(data).length > MAX_CLOUD_BYTES) data = withoutGhosts(data);
      if (!row) {
        try {
          await online.rest('/rest/v1/cloud_saves', { method: 'POST', body: { user_id: uid, data }, headers: { Prefer: 'return=minimal' } });
          return 'envoyé';
        } catch (e) { if (e.code === 'duplicate' || /23505|duplicate/i.test(e.message)) continue; throw e; }
      }
      const done = await online.rest(`/rest/v1/cloud_saves?user_id=eq.${encodeURIComponent(uid)}&rev=eq.${row.rev}`, {
        method: 'PATCH', body: { data }, headers: { Prefer: 'return=representation' },
      });
      if (Array.isArray(done) && done.length) return 'envoyé';
      // Un autre appareil a écrit entre-temps : on relit et on refusionne.
    }
    throw new OnlineError('Synchronisation interrompue (conflit répété) : réessaie dans un instant.', 'conflict');
  }
}

export const account = new Account();
