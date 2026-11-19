// Surveillance quotidienne du jeu en ligne (0.12.5), en LECTURE SEULE avec la clé publique du jeu : rien n'est écrit, rien n'est supprimé.
//   node tools/surveillance.mjs                 (réseau nécessaire ; derrière un proxy : NODE_USE_ENV_PROXY=1)
//   SITE_URL=https://… node tools/surveillance.mjs
// Lancée chaque jour par .github/workflows/surveillance.yml : une ALERTE fait échouer le travail, et GitHub prévient le propriétaire du dépôt par e-mail.
// Elle fait aussi quelques requêtes à la base chaque jour : un projet Supabase gratuit sans activité pendant 7 jours est mis en pause.
// Constats :
//   - le site répond (200) et porte le nom du jeu ;
//   - la fonction submit-score répond, avec la version de physique du dépôt ;
//   - health_report() (étape SQL 18) : erreurs du jeu sur 24 h (trop d'installations touchées = alerte), purge nocturne en retard, physique.
import { PHYS_VER, GAME_NAME } from '../js/version.js';
import { CONFIG } from '../js/config.js';

export const LIMITS = { errorInstalls24h: 10, errors24h: 500, purgeLateHours: 48 };
const SITE = process.env.SITE_URL || 'https://lucjules.github.io/Copytrack/';

// Juge un rapport de santé : renvoie [{ niveau: 'ok' | 'info' | 'ALERTE', msg }]. Pur (testé : tools/test-surveillance.mjs).
export function judgeHealth(h, { physVer = PHYS_VER, now = Date.now(), limits = LIMITS } = {}) {
  const out = [], say = (niveau, msg) => out.push({ niveau, msg });
  if (!h || typeof h !== 'object') { say('ALERTE', 'health_report : réponse illisible'); return out; }
  const inst = +h.error_installs_24h || 0, errs = +h.errors_24h || 0;
  say(inst > limits.errorInstalls24h || errs > limits.errors24h ? 'ALERTE' : 'ok',
    `erreurs du jeu sur 24 h : ${errs} (${inst} installation${inst > 1 ? 's' : ''} touchée${inst > 1 ? 's' : ''} ; alerte au-delà de ${limits.errorInstalls24h} installations ou ${limits.errors24h} erreurs)`);
  if (h.purge_scheduled) {
    const last = h.purge_last ? Date.parse(h.purge_last) : NaN, late = !Number.isFinite(last) || now - last > limits.purgeLateHours * 3600000;
    say(late ? 'ALERTE' : 'ok', `purge nocturne : dernière le ${h.purge_last || 'jamais'}${late ? ` (plus de ${limits.purgeLateHours} h : la tâche pg_cron ne tourne plus ?)` : ''}`);
  } else say('info', 'purge nocturne : pg_cron absent, purge à lancer à la main (select public.purge_expired();)');
  if (h.phys_ver != null) say(+h.phys_ver > physVer ? 'ALERTE' : 'ok', `physique : plus récente en base ${h.phys_ver}, dépôt ${physVer}`);
  say('info', `activité : ${+h.scores_24h || 0} temps et ${+h.runs_24h || 0} parties (statistiques) sur 24 h, ${+h.players_7d || 0} nouveaux pilotes sur 7 jours, ${+h.tracks || 0} circuits publiés${h.feedback_24h != null ? `, ${+h.feedback_24h || 0} avis de testeurs sur 24 h` : ''}`);
  return out;
}

async function main() {
  const url = CONFIG.supabase && CONFIG.supabase.url, key = CONFIG.supabase && CONFIG.supabase.key;
  const results = [], say = (niveau, msg) => results.push({ niveau, msg });
  const fetchT = (u, o = {}) => fetch(u, { ...o, signal: globalThis.AbortSignal.timeout(20000) });
  try {
    const r = await fetchT(SITE), html = await r.text();
    say(r.status === 200 && html.includes(`<title>${GAME_NAME}`) ? 'ok' : (r.status === 200 ? 'info' : 'ALERTE'),
      `site ${SITE} : ${r.status}${r.status === 200 && !html.includes(`<title>${GAME_NAME}`) ? ` (le nom « ${GAME_NAME} » n'est pas encore en ligne : version précédente servie)` : ''}`);
  } catch (e) { say('ALERTE', `site ${SITE} : injoignable (${e.message})`); }
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  try {
    const r = await fetchT(url + '/functions/v1/submit-score', { headers: h });
    const b = await r.json().catch(() => null);
    say(r.status === 200 && b && b.physVer === PHYS_VER ? 'ok' : 'ALERTE', `submit-score : ${r.status}${b ? `, physique ${b.physVer} (dépôt ${PHYS_VER})` : ''}`);
  } catch (e) { say('ALERTE', `submit-score : injoignable (${e.message})`); }
  try {
    const r = await fetchT(url + '/rest/v1/rpc/health_report', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: '{}' });
    if (r.status === 404) say('info', 'health_report absente : étape SQL 18 pas encore appliquée (supabase/etape18-maintenance.sql)');
    else if (r.status !== 200) say('ALERTE', `base : health_report répond ${r.status}`);
    else results.push(...judgeHealth(await r.json()));
  } catch (e) { say('ALERTE', `base : injoignable (${e.message})`); }
  for (const x of results) console.log(`${x.niveau.padEnd(6)} ${x.msg}`);
  const alerts = results.filter((x) => x.niveau === 'ALERTE').length;
  console.log(alerts ? `\n${alerts} alerte(s).` : '\nAucune alerte.');
  process.exit(alerts ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
