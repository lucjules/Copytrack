-- =====================================================================================
-- Copytrack : étape 7 (fantômes du haut des classements) — à lancer une fois dans Supabase > SQL Editor, après les étapes 1 à 6.
-- Peut être relancé sans danger.
--
-- La fonction serveur « submit-score » REJOUE déjà chaque course pour en vérifier le temps ; elle range maintenant avec le record le FANTÔME de la course
-- (une pose tous les 4 pas : position + orientation, et les changements de véhicule), au format des fantômes enregistrés du jeu. Les autres joueurs peuvent ainsi
-- affronter le top 10 d'un circuit.
--
--  - Le fantôme n'est lisible que par la fonction get_ghost (n° 1 à 10 d'un circuit, une version de physique) : la colonne n'est pas dans la liste des colonnes
--    lisibles de la table (étape 5). Ce sont des POSITIONS, jamais les commandes : on ne peut pas s'en servir pour renvoyer la course sous un autre nom.
--  - Les records enregistrés AVANT cette étape n'ont pas de fantôme (has_ghost = false) ; il leur en vient un quand leur auteur renvoie le même temps
--    (bouton « Envoyer mon record » du classement) ou en battant son record.
-- =====================================================================================

alter table public.scores add column if not exists ghost text check (ghost is null or char_length(ghost) <= 800000);
alter table public.scores add column if not exists ghost_veh jsonb;
alter table public.scores add column if not exists has_ghost boolean generated always as (ghost is not null) stored;

-- Seul l'indicateur est lisible directement (pour afficher le bouton 👻 dans le classement).
grant select (has_ghost) on public.scores to anon, authenticated;

-- Le fantôme du n° r (1 à 10) du classement d'un circuit, pour une version de physique. Même ordre que le classement du jeu (temps, puis ancienneté).
create or replace function public.get_ghost(k text, r int, pv int)
returns table (name text, "time" double precision, ghost text, ghost_veh jsonb)
language sql stable security definer set search_path = public as $$
  select p.name, s.time::double precision, s.ghost, s.ghost_veh
  from (
    select * from scores where track_key = k and phys_ver = pv order by time asc, updated_at asc offset greatest(r, 1) - 1 limit 1
  ) s join players p on p.id = s.player
  where r between 1 and 10 and s.ghost is not null;
$$;
grant execute on function public.get_ghost(text, int, int) to anon, authenticated;

notify pgrst, 'reload schema';
