// Copytrack : fonction serveur « ice » (Supabase Edge Function, Deno) : serveurs STUN + relais TURN à identifiants à durée limitée pour le multijoueur.
// La logique est dans handler.js (testable sous Node : tools/test-ice.mjs) ; ce fichier la branche sur Deno.serve.
//
// SOURCE de la fonction : ne pas coller ce fichier dans Supabase. `npm run build:function` génère index.ts (autonome, sans import) : c'est lui qu'on colle.
// Variables d'environnement à définir dans Supabase (Edge Functions > ice > Secrets) : voir handler.js (Cloudflare : TURN_KEY_ID + TURN_KEY_API_TOKEN ;
// coturn : TURN_URLS + TURN_SECRET). Ne rien y mettre : le jeu garde alors son STUN par défaut.
import { createIceHandler } from './handler.js';

Deno.serve(createIceHandler({ env: Deno.env.toObject() }));
