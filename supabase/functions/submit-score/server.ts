// Copytrack : fonction serveur « submit-score » (Supabase Edge Function, Deno).
//
// Reçoit une course terminée (clé du circuit, commandes enregistrées, temps), la REJOUE
// avec le vrai code du jeu, et n'enregistre le temps que s'il est confirmé.
// La logique est dans handler.js (testable sous Node : tools/test-submit-handler.mjs) ; ce fichier la branche sur Deno.serve.
//
// SOURCE de la fonction : ne pas coller ce fichier dans Supabase.
// `node tools/build-function.mjs` (ou `npm run build:function`) regroupe ce fichier et le
// code du jeu (physique, circuits) en un seul fichier autonome, sans import :
// supabase/functions/submit-score/index.ts, à coller dans Supabase. À refaire quand la
// physique du jeu change (PHYS_VER), puis redéployer la fonction.
// La clé secrète (SUPABASE_SERVICE_ROLE_KEY) est fournie automatiquement par Supabase
// à la fonction : elle n'apparaît nulle part dans le jeu.
// Réglage facultatif : ALLOWED_ORIGIN (par exemple https://mon-jeu.example) restreint les appels depuis un navigateur à ce site ; sans lui, tout site peut
// appeler la fonction (elle exige de toute façon un jeton Supabase valide).
import { createHandler } from './handler.js';

Deno.serve(createHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  allowedOrigin: Deno.env.get('ALLOWED_ORIGIN') ?? '*',
}));
