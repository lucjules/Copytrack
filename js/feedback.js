// Avis d'un testeur (phase 4 de la 1.0) : les questions, les valeurs permises et l'avis envoyé au serveur (supabase/etape19-avis.sql, submit_feedback).
// Module pur (testé sous Node : tools/test-avis.mjs) ; la fenêtre est dans js/app/feedback.js. Les mêmes bornes que la table : une valeur hors bornes ne
// part jamais (le serveur la refuserait).
import { VERSION, PHYS_VER } from './version.js';

// Notes de 1 à 5 (« note ») ou équilibrages de -2 à +2 (« equilibre » : 0 = juste).
export const SCALES = [
  { key: 'fun', label: 'Plaisir de jeu', type: 'note', ends: ['Aucun', 'Énorme'] },
  { key: 'drift', label: 'Dérapage', type: 'equilibre', ends: ['Trop dur à tenir', 'Trop facile'] },
  { key: 'walls', label: 'Chocs contre les murs', type: 'equilibre', ends: ['Trop punitifs', 'Pas assez'] },
  { key: 'air', label: 'Contrôle en l’air', type: 'equilibre', ends: ['Trop faible', 'Trop fort'] },
  { key: 'difficulty', label: 'Difficulté des circuits', type: 'equilibre', ends: ['Trop durs', 'Trop faciles'] },
  { key: 'camera', label: 'Caméra', type: 'note', ends: ['Gênante', 'Parfaite'] },
];
export const CHOICES = {
  device: [['ordinateur', 'Ordinateur'], ['telephone', 'Téléphone'], ['tablette', 'Tablette']],
  controls: [['clavier', 'Clavier'], ['manette', 'Manette'], ['tactile', 'Écran tactile']],
  experience: [['debutant', 'Je joue rarement aux jeux de course'], ['habitue', 'Je joue souvent aux jeux de course']],
};
export const LIMITS = { tracks_note: 300, comment: 1000, pseudo: 24 };
export const ASK_AFTER_FINISHES = 6;      // la fenêtre d'avis est proposée une fois, après 6 courses finies (aux joueurs qui ont accepté les statistiques)

const range = (s) => (s.type === 'note' ? [1, 5] : [-2, 2]);

// Appareil probable (valeur par défaut du formulaire) : tactile et grand écran = tablette ; tactile = téléphone ; sinon ordinateur.
export function guessDevice({ touch = false, minSide = 1000 } = {}) {
  return !touch ? 'ordinateur' : minSide >= 600 ? 'tablette' : 'telephone';
}

// Construit l'avis à envoyer. answers : { device, controls, experience, fun, …, tracks_note, comment, withPseudo } ; ctx : { install, pseudo }.
// Lève une Error au message lisible si une réponse manque ou sort des bornes.
export function buildFeedback(answers = {}, { install = '', pseudo = '' } = {}) {
  if (!/^[0-9a-f]{16}$/.test(install)) throw new Error('Identifiant d’installation manquant : recharge la page.');
  const out = { install, version: VERSION, pv: PHYS_VER };
  for (const [k, list] of Object.entries(CHOICES)) {
    if (!list.some(([v]) => v === answers[k])) throw new Error('Réponds à toutes les questions du haut (appareil, commandes, expérience).');
    out[k] = answers[k];
  }
  for (const s of SCALES) {
    const v = Number(answers[s.key]), [lo, hi] = range(s);
    if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`Choisis une valeur pour « ${s.label} ».`);
    out[s.key] = v;
  }
  for (const k of ['tracks_note', 'comment']) out[k] = String(answers[k] || '').replace(/\s+/g, ' ').trim().slice(0, LIMITS[k]);
  const p = String(pseudo || '').trim().slice(0, LIMITS.pseudo);
  if (answers.withPseudo && p) out.pseudo = p;
  return out;
}
