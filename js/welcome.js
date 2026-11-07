// Écran d'accueil : le menu principal ne s'ouvre qu'une fois le pseudo défini.
//   Invité   : pseudo pour la session, progression locale sur cet appareil ;
//   Compte   : pseudo + mot de passe, progression sauvegardée dans le cloud (récupérable depuis n'importe quel appareil).
// Un compte déjà connecté sur cet appareil, ou un invité de la session en cours, passe directement.
import { account, checkPseudo, checkPassword } from './account.js';
import { $ } from './dom.js';


const MODES = {
  guest: {
    submit: 'Jouer en invité',
    hint: 'Choisis un pseudo. Progression sur cet appareil ; un compte la suit partout.',
    pw: false, pw2: false, keep: false,
  },
  login: {
    submit: 'Se connecter',
    hint: 'Retrouve ta progression, tes circuits et tes records depuis n’importe quel appareil.',
    pw: true, pw2: false, keep: false,
  },
  signup: {
    submit: 'Créer mon compte',
    hint: 'Pseudo unique de 3 à 20 lettres, chiffres ou _ ; mot de passe de 8 caractères au moins. Sans e-mail : pas de récupération, note-le.',
    pw: true, pw2: true, keep: true,
  },
};

// Résout { kind: 'guest' | 'account', username } quand le joueur est identifié.
export async function runWelcome() {
  const restored = await account.restore();
  if (restored.kind === 'account') return restored;
  const guest = account.resumeGuest();
  if (guest) return guest;
  return new Promise((resolve) => showForm(resolve, restored.kind === 'expired' ? restored.username : ''));
}

function showForm(done, expiredName) {
  const root = $('welcome'), form = $('wl-form');
  const name = $('wl-name'), pw = $('wl-pw'), pw2 = $('wl-pw2'), keep = $('wl-keep'), err = $('wl-error'), submit = $('wl-submit');
  const tabs = [...root.querySelectorAll('[data-wl]')];
  let mode = expiredName ? 'login' : 'guest';
  const guestProgress = account.hasGuestProgress();

  const setError = (m) => { err.textContent = m || ''; };
  function setMode(m, focus = true) {
    mode = m;
    const cfg = MODES[m];
    tabs.forEach((t) => { const on = t.dataset.wl === m; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    $('wl-hint').textContent = cfg.hint;
    $('wl-pw-wrap').hidden = !cfg.pw;
    $('wl-pw2-wrap').hidden = !cfg.pw2;
    $('wl-keep-wrap').hidden = !(cfg.keep && guestProgress);
    pw.autocomplete = m === 'signup' ? 'new-password' : 'current-password';
    submit.textContent = cfg.submit;
    name.value = m === 'guest' ? account.lastGuestName() : (m === 'login' ? expiredName || account.lastAccountName() : '');
    pw.value = ''; pw2.value = '';
    setError(m === 'login' && expiredName ? 'Ta session a expiré : reconnecte-toi.' : '');
    if (focus) (name.value && cfg.pw ? pw : name).focus();
  }
  tabs.forEach((t) => { t.onclick = () => setMode(t.dataset.wl); });
  root.querySelector('.wl-tabs').onkeydown = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = tabs.findIndex((t) => t.dataset.wl === mode);
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    setMode(n.dataset.wl); n.focus();
  };

  let busy = false;
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    // Validation locale d'abord : messages précis, sans appel réseau.
    const c = checkPseudo(name.value, { account: mode !== 'guest' });
    if (!c.ok && !(mode === 'login')) { setError(c.error); name.focus(); return; }
    if (mode === 'login' && !pw.value) { setError('Entre ton mot de passe.'); pw.focus(); return; }
    if (mode === 'signup') {
      const p = checkPassword(pw.value, c.name);
      if (!p.ok) { setError(p.error); pw.focus(); return; }
      if (pw.value !== pw2.value) { setError('Les deux mots de passe ne sont pas identiques.'); pw2.focus(); return; }
    }
    busy = true; submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = mode === 'guest' ? '…' : 'Un instant…';
    try {
      let id;
      if (mode === 'guest') id = account.startGuest(name.value);
      else if (mode === 'login') id = await account.signIn(name.value, pw.value);
      else id = await account.signUp(name.value, pw.value, { keepGuest: keep.checked && guestProgress });
      pw.value = ''; pw2.value = '';
      root.classList.add('hidden');
      done(id);
    } catch (ex) {
      setError(ex && ex.message ? ex.message : 'Une erreur est survenue.');
      busy = false; submit.disabled = false; submit.textContent = label;
      (ex && (ex.code === 'bad-credentials') ? pw : ex && ex.code === 'name-taken' ? name : pw).focus();
    }
  };

  root.classList.remove('hidden');
  setMode(mode);
}
