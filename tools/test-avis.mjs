// Avis des testeurs (phase 4 de la 1.0, js/feedback.js et js/app/feedback.js) : réponses validées avec les MÊMES bornes que la table (étape SQL 19),
// pseudo seulement s'il est demandé, proposition unique et seulement aux joueurs qui ont accepté les statistiques ; branchements.
//   node tools/test-avis.mjs   (npm test)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';
import { SCALES, CHOICES, LIMITS, ASK_AFTER_FINISHES, buildFeedback, guessDevice } from '../js/feedback.js';
import { feedbackMethods } from '../js/app/feedback.js';
import { legalPage } from '../js/legal.js';
import { VERSION, PHYS_VER } from '../js/version.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const SQL = read('supabase/etape19-avis.sql');
const ok = { device: 'telephone', controls: 'tactile', experience: 'debutant', fun: 4, drift: -1, walls: 0, air: 2, difficulty: -2, camera: 5 };
const ctx = { install: '0123456789abcdef', pseudo: 'Bea' };

test('un avis complet : champs attendus, version et physique du jeu, textes nettoyés et bornés, pas de pseudo sans la case', () => {
  const f = buildFeedback({ ...ok, tracks_note: '  Temple   trop dur ', comment: 'x'.repeat(2000) }, ctx);
  assert.deepEqual(Object.keys(f).sort(), ['air', 'camera', 'comment', 'controls', 'device', 'difficulty', 'drift', 'experience', 'fun', 'install', 'pv', 'tracks_note', 'version', 'walls']);
  assert.equal(f.version, VERSION); assert.equal(f.pv, PHYS_VER);
  assert.equal(f.tracks_note, 'Temple trop dur'); assert.equal(f.comment.length, LIMITS.comment);
  assert.equal(buildFeedback({ ...ok, withPseudo: true }, ctx).pseudo, 'Bea');
  assert.equal(buildFeedback({ ...ok, withPseudo: true }, { ...ctx, pseudo: '' }).pseudo, undefined);
});

test('réponse manquante ou hors bornes : message lisible, rien n’est construit', () => {
  assert.throws(() => buildFeedback({ ...ok, experience: undefined }, ctx), /questions du haut/);
  assert.throws(() => buildFeedback({ ...ok, fun: 6 }, ctx), /Plaisir de jeu/);
  assert.throws(() => buildFeedback({ ...ok, drift: NaN }, ctx), /Dérapage/);
  assert.throws(() => buildFeedback({ ...ok, air: 3 }, ctx), /Contrôle en l’air/);
  assert.throws(() => buildFeedback(ok, { install: 'xyz' }), /Identifiant/);
});

test('mêmes bornes que la table de l’étape SQL 19 (notes 1-5, équilibrages -2..+2, choix, longueurs)', () => {
  for (const s of SCALES) {
    const [lo, hi] = s.type === 'note' ? [1, 5] : [-2, 2];
    assert.match(SQL, new RegExp(`${s.key} smallint not null check \\(${s.key} between ${lo} and ${hi}\\)`), s.key);
  }
  for (const [k, list] of Object.entries(CHOICES)) assert.match(SQL, new RegExp(`${k} text not null check \\(${k} in \\(${list.map(([v]) => `'${v}'`).join(', ')}\\)\\)`), k);
  assert.match(SQL, new RegExp(`char_length\\(tracks_note\\) <= ${LIMITS.tracks_note}`)); assert.match(SQL, new RegExp(`char_length\\(comment\\) <= ${LIMITS.comment}`));
});

test('appareil deviné pour le formulaire : ordinateur, téléphone, tablette', () => {
  assert.equal(guessDevice({ touch: false }), 'ordinateur');
  assert.equal(guessDevice({ touch: true, minSide: 390 }), 'telephone');
  assert.equal(guessDevice({ touch: true, minSide: 820 }), 'tablette');
});

test('proposition unique : après 6 courses finies, aux joueurs qui ont accepté les statistiques, à l’accueil, jamais deux fois', () => {
  const app = (s) => { let shown = 0; return { settings: { finishes: ASK_AFTER_FINISHES, telemetry: true, ...s }, mode: 'menu', ui: { modalOpen: false, modal: () => { shown++; } }, saveSettings() {}, get shown() { return shown; }, ...feedbackMethods }; };
  const a = app(); assert.equal(a.maybeAskFeedback(), true); assert.equal(a.shown, 1); assert.equal(a.maybeAskFeedback(), false, 'jamais deux fois');
  assert.equal(app({ telemetry: false }).maybeAskFeedback(), false, 'sans accord pour les statistiques : jamais');
  assert.equal(app({ finishes: ASK_AFTER_FINISHES - 1 }).maybeAskFeedback(), false, 'trop tôt');
  assert.equal(app({ feedbackSent: 1 }).maybeAskFeedback(), false, 'déjà envoyé');
  const b = app(); b.settings.finishes = 0; b.noteFinish(); assert.equal(b.settings.finishes, 1);
});

test('branchements : Paramètres et barre du bas, action du menu, compteur de courses, accueil, envoi sans session ; la page Confidentialité le dit', () => {
  const html = read('index.html');
  assert.equal((html.match(/data-action="feedback"/g) || []).length, 2);
  assert.match(read('js/app/wiring.js'), /case 'feedback': this\.showFeedback\(\)/);
  assert.match(read('js/main.js'), /feedbackMethods/);
  assert.match(read('js/race/finish.js'), /app\.noteFinish\(\)/);
  assert.match(read('js/app/screens.js'), /this\.maybeAskFeedback\(\)/);
  assert.match(read('js/online.js'), /rpc\/submit_feedback', \{ method: 'POST', body: \{ f \}, auth: false \}/);
  assert.match(legalPage('confidentialite', 'fr').html, /<b>Avis<\/b>/); assert.match(legalPage('confidentialite', 'en').html, /<b>Feedback<\/b>/);
  assert.match(legalPage('confidentialite', 'fr').html, /Statistiques anonymes et avis : 12 mois/);
});

await finish('Les avis des testeurs sont validés comme la table, envoyés sans pseudo par défaut, et proposés une seule fois.');
