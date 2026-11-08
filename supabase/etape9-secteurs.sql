-- =====================================================================================
-- Copytrack : étape 9 (classements par secteur) — à lancer une fois dans Supabase > SQL Editor, après les étapes 1 à 8.
-- Peut être relancé sans danger. Copytrack Evolution, E15.
--
-- La fonction serveur « submit-score » rejoue déjà chaque course ; elle range maintenant avec le record ses TEMPS INTERMÉDIAIRES (en pas de simulation,
-- 1/120 s : un par checkpoint passé, et par tour). Un secteur va d'un passage au suivant : le secteur 1 du départ au premier checkpoint, le dernier du
-- dernier passage à l'arrivée. sector_board donne les meilleurs secteurs parmi les records d'un circuit (ce sont les secteurs des records, pas le
-- meilleur secteur jamais roulé par chacun : seul le record est rejoué par le serveur).
--
-- Les records enregistrés AVANT cette étape n'ont pas de temps intermédiaires : tools/backfill-sectors.mjs les calcule en rejouant leur course (clé de
-- service, sur ta machine), ou ils arrivent quand leur auteur renvoie son record.
-- =====================================================================================

alter table public.scores add column if not exists splits int[] check (splits is null or cardinality(splits) <= 400);
grant select (splits) on public.scores to anon, authenticated;       -- publics, comme les temps

-- Meilleurs temps du secteur i (1 = du départ au premier passage ; n + 1 = du dernier passage à l'arrivée) parmi les records d'un circuit.
create or replace function public.sector_board(k text, pv int, i int, lim int default 10)
returns table (rank bigint, player uuid, name text, sector_steps int, "time" double precision)
language sql stable security definer set search_path = public as $$
  with s as (
    select sc.player, sc.time, sc.splits, cardinality(sc.splits) as n
    from scores sc where sc.track_key = k and sc.phys_ver = pv and sc.splits is not null
  ), sec as (
    select s.player, s.time,
      case when i between 1 and s.n + 1 then
        (case when i <= s.n then s.splits[i] else round(s.time * 120)::int end) - (case when i = 1 then 0 else s.splits[i - 1] end)
      end as st
    from s
  )
  select row_number() over (order by sec.st, sec.time) as rank, sec.player, p.name, sec.st, sec.time::double precision
  from sec join players p on p.id = sec.player
  where sec.st is not null and sec.st > 0
  order by sec.st, sec.time
  limit greatest(1, least(coalesce(lim, 10), 50));
$$;
grant execute on function public.sector_board(text, int, int, int) to anon, authenticated;

notify pgrst, 'reload schema';
