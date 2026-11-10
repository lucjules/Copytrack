// Compare le dépôt à ce qui est RÉELLEMENT en ligne, en LECTURE SEULE (deux GET avec la clé publique du jeu ; rien n'est écrit, rien n'est supprimé).
// Usage : node tools/check-deployed.mjs            (réseau nécessaire ; l'URL et la clé viennent de js/config.js ; derrière un proxy : NODE_USE_ENV_PROXY=1 node tools/check-deployed.mjs)
// Sortie : une ligne par constat, « ok » / « ÉCART » / « inconnu » ; code de sortie 1 s'il y a un écart.
//   - submit-score déployé : version de physique (GET d'état) = celle du dépôt ?  actions publish-track présentes ?  limites annoncées ?
//   - base : le schéma public exposé (racine PostgREST) contient-il les objets de l'étape SQL 15 (colonne tracks.author_verified, fonctions rate_check / submit_best / publish_track) ?
//     Les fonctions réservées au service (revoke … from anon) ne figurent PAS dans ce schéma : leur absence ici est NORMALE, elle est notée « non exposé » et non comme un écart.
//   - ice : le déploiement répond-il, et exige-t-il un jeton (401 sans jeton = fail-closed attendu) ?
import { PHYS_VER } from '../js/version.js';
import { CONFIG } from '../js/config.js';

const url = CONFIG && CONFIG.supabase && CONFIG.supabase.url, key = CONFIG && CONFIG.supabase && CONFIG.supabase.key;
if (!url || !key) { console.log('inconnu : js/config.js ne donne ni URL ni clé Supabase'); process.exit(2); }
let bad = 0, unknown = 0;
const say = (kind, msg) => { if (kind === 'ÉCART') bad++; if (kind === 'inconnu') unknown++; console.log(`${kind.padEnd(7)} ${msg}`); };
const get = async (path, headers = {}) => { const r = await fetch(url + path, { headers, signal: globalThis.AbortSignal.timeout(15000) }); let body = null; try { body = await r.json(); } catch { /* corps non JSON */ } return { status: r.status, body }; };

try {
  const fh = { apikey: key, Authorization: `Bearer ${key}` };      // (la passerelle des fonctions exige un en-tête d'autorisation, comme le jeu en envoie)
  const s = await get('/functions/v1/submit-score', fh);
  if (s.status === 405) say('ÉCART', 'submit-score : le GET d\'état répond 405 « Méthode non autorisée » : c\'est l\'ANCIENNE fonction (avant 0.9.54), qui ne sait ni annoncer sa version de physique ni publier un circuit → la redéployer');
  else if (s.status !== 200 || !s.body) say('ÉCART', `submit-score : le GET d'état répond ${s.status} (fonction absente ou inattendue)`);
  else {
    say(s.body.physVer === PHYS_VER ? 'ok' : 'ÉCART', `submit-score : version de physique déployée ${s.body.physVer}, dépôt ${PHYS_VER}${s.body.physVer === PHYS_VER ? '' : ' → REDÉPLOYER la fonction (ou le jeu est en avance/retard sur elle)'}`);
    const acts = Array.isArray(s.body.actions) ? s.body.actions : [];
    say(acts.includes('publish-track') ? 'ok' : 'ÉCART', `submit-score : actions annoncées ${JSON.stringify(acts)} (publish-track attendue)`);
    say(s.body.rate && s.body.rate.globalMax ? 'ok' : 'ÉCART', `submit-score : limites annoncées ${JSON.stringify(s.body.rate)}`);
  }
} catch (e) { say('inconnu', 'submit-score : ' + e.message); }

try {
  const i = await fetch(url + '/functions/v1/ice', { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: '{}', signal: globalThis.AbortSignal.timeout(15000) }).then((r) => ({ status: r.status }));
  say(i.status === 401 || i.status === 403 ? 'ok' : (i.status === 404 ? 'ÉCART' : 'inconnu'), `ice : réponse ${i.status} avec la seule clé publique (401/403 = session exigée, attendu ; 404 = fonction non déployée ; 200 = version ouverte à tous). Cette réponse ne distingue PAS la version d'avant 0.9.54 (déjà authentifiée) de la nouvelle : seul le déploiement dit la version`);
} catch (e) { say('inconnu', 'ice : ' + e.message); }

try {
  const o = await get('/rest/v1/', { apikey: key });
  if (o.status !== 200 || !o.body) say('inconnu', `base : la racine PostgREST répond ${o.status} (liste du schéma non accessible avec la clé publique)`);
  else {
    const defs = o.body.definitions || {}, paths = Object.keys(o.body.paths || {});
    say('ok', `base : ${Object.keys(defs).length} table(s)/vue(s) exposée(s), ${paths.filter((p) => p.startsWith('/rpc/')).length} fonction(s) rpc exposée(s)`);
    const cols = (defs.tracks && defs.tracks.properties) || null;
    if (!cols) say('inconnu', 'base : table tracks absente du schéma exposé');
    else say(cols.author_verified ? 'ok' : 'ÉCART', `base : colonne tracks.author_verified ${cols.author_verified ? 'présente (étape SQL 15 appliquée)' : 'ABSENTE → étape SQL 15 (supabase/etape15-backend.sql) NON appliquée'}`);
    for (const f of ['rate_check', 'submit_best', 'publish_track']) say('info', `base : rpc/${f} ${paths.includes('/rpc/' + f) ? 'exposée à la clé publique (ANORMAL pour une fonction réservée au service : vérifier les droits)' : 'non exposée à la clé publique (normal : réservée au service)'}`);
    for (const t of ['rate_hits', 'track_binds']) say('info', `base : table ${t} ${defs[t] ? 'exposée à la clé publique (ANORMAL : tables internes)' : 'non exposée (normal)'}`);
  }
} catch (e) { say('inconnu', 'base : ' + e.message); }

console.log(bad ? `${bad} écart(s) entre le dépôt et ce qui est en ligne` : unknown ? `${unknown} point(s) NON vérifié(s) : rien n'est prouvé` : 'aucun écart constaté');
process.exit(bad ? 1 : unknown ? 2 : 0);
