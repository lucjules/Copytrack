// Empreinte de build de la fonction serveur « submit-score » (supabase/functions/submit-score/index.ts).
//
// Pourquoi : `check-deployed` ne comparait que `physVer`. Or plusieurs corrections du serveur (temps non numérique confirmé, roulis d'obstacle absent de la clé de classement, phase 4)
// n'ont PAS changé PHYS_VER : une fonction périmée répondait « ok » alors qu'elle gardait la faille. L'empreinte est un SHA-256 (16 premiers caractères hexadécimaux) du contenu du
// fichier généré lui-même : tout changement du code déployé (physique, vérification, gestionnaire) la change.
//
// Elle est écrite par `tools/build-function.mjs` en DERNIÈRE ligne du fichier (`globalThis.__COPYTRACK_BUILD__ = "…";`), publiée par le GET d'état de la fonction (champ `build`),
// et comparée par `tools/check-deployed.mjs` à celle du fichier du dépôt. L'empreinte porte sur tout ce qui précède cette dernière ligne.
import { createHash } from 'node:crypto';

const LINE = (stamp) => `globalThis.__COPYTRACK_BUILD__ = "${stamp}";\n`;
const PARSE = /^([\s\S]*\n)globalThis\.__COPYTRACK_BUILD__ = "([0-9a-f]{16})";\n$/;

export const stampOf = (body) => createHash('sha256').update(body).digest('hex').slice(0, 16);

// Ajoute la ligne d'empreinte à un fichier généré (l'empreinte porte sur le texte qui précède, terminé par un retour à la ligne).
export function addStamp(body) {
  const text = body.endsWith('\n') ? body : body + '\n';
  return text + LINE(stampOf(text));
}

// Lit l'empreinte d'un fichier généré : { stamp, valid } (valid : elle correspond bien au contenu qui la précède), ou null si le fichier n'en porte pas.
export function readStamp(file) {
  const m = PARSE.exec(String(file));
  return m ? { stamp: m[2], valid: stampOf(m[1]) === m[2] } : null;
}

// Verdict de la comparaison entre l'empreinte annoncée par la fonction EN LIGNE (deployed : chaîne, ou absente) et celle du fichier du dépôt (repo : résultat de readStamp, ou null).
// kind : 'ok' | 'ÉCART' | 'inconnu' (mêmes mots que tools/check-deployed.mjs).
export function judgeBuild(deployed, repo) {
  if (!repo) return { kind: 'inconnu', msg: 'le fichier du dépôt (submit-score/index.ts) ne porte pas d\'empreinte : relancer `npm run build:function`' };
  if (!repo.valid) return { kind: 'ÉCART', msg: `l'empreinte du fichier du dépôt (${repo.stamp}) ne correspond pas à son contenu : fichier modifié à la main ? relancer \`npm run build:function\`` };
  if (typeof deployed !== 'string' || !/^[0-9a-f]{16}$/.test(deployed)) return { kind: 'ÉCART', msg: `la fonction déployée n'annonce pas d'empreinte de build : c'est une version d'AVANT ce contrôle (même si physVer est le bon, elle peut garder des corrections manquantes) → REDÉPLOYER supabase/functions/submit-score/index.ts (dépôt : ${repo.stamp})` };
  if (deployed !== repo.stamp) return { kind: 'ÉCART', msg: `empreinte déployée ${deployed}, dépôt ${repo.stamp} → le code en ligne n'est pas celui du dépôt : REDÉPLOYER supabase/functions/submit-score/index.ts` };
  return { kind: 'ok', msg: `empreinte de build identique (${deployed}) : la fonction en ligne est exactement le fichier du dépôt` };
}
