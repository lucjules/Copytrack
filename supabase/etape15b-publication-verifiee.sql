-- =====================================================================================
-- Copytrack : étape 15b (verrouillage de la publication) — À LANCER SEULEMENT APRÈS :
--   1. l'étape 15 (etape15-backend.sql) ;
--   2. le déploiement de la nouvelle fonction submit-score (qui sait publier : action « publish-track ») ;
--   3. la mise en ligne de la version du jeu qui publie par cette fonction (0.9.54 ou plus).
-- Sinon les anciens clients ne pourront plus publier. Peut être relancée sans danger. AUCUNE donnée supprimée.
--
-- Après cette étape, plus aucun pilote ne peut écrire dans tracks directement : tout circuit publié passe par publish_track, donc par le REJEU de la
-- course de l'auteur. Son temps (author_time) est celui du serveur, et author_verified = true.
-- Retour arrière : « grant insert on public.tracks to authenticated; » (voir etape15-retour.sql).
-- =====================================================================================
revoke insert on public.tracks from authenticated;
notify pgrst, 'reload schema';
