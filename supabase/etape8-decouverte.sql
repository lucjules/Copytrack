-- =====================================================================================
-- Copytrack : étape 8 (découverte des circuits, titres) — à lancer une fois dans Supabase > SQL Editor, après les étapes 1 à 7.
-- Peut être relancé sans danger.
--
--  1. trending_tracks : les circuits les plus joués CETTE SEMAINE (nombre de pilotes distincts qui y ont couru dans les derniers jours), pour l'onglet « Cette semaine » et le « Circuit de la semaine »
--     de la communauté. Le comptage vient de track_plays (étape 5 : une ligne par pilote et par circuit, avec la date de sa dernière partie).
--  2. Titres : players.title (un identifiant de la liste blanche ci-dessous, ou vide) et set_title. Un titre est DÉCORATIF (il s'affiche à côté du pseudo dans les classements) : le serveur
--     ne vérifie pas qu'il est mérité (il ne connaît pas la progression du joueur), il vérifie seulement qu'il est dans la liste. La liste est celle de js/rewards.js (un test les compare).
-- =====================================================================================

-- 1. Tendances de la semaine.
create or replace function public.trending_tracks(days int default 7, lim int default 24, off int default 0)
returns table (id uuid, week_players bigint)
language sql stable security definer set search_path = public as $$
  select t.id, count(p.player) as week_players
  from tracks t join track_plays p on p.track_id = t.id
  where not t.hidden and p.last_at > now() - make_interval(days => least(greatest(coalesce(days, 7), 1), 30))
  group by t.id
  order by week_players desc, t.likes desc, t.created_at desc
  limit least(greatest(coalesce(lim, 24), 1), 50) offset greatest(coalesce(off, 0), 0);
$$;
grant execute on function public.trending_tracks(int, int, int) to anon, authenticated;

-- 2. Titres.
alter table public.players add column if not exists title text check (title is null or title ~ '^[a-z0-9-]{1,20}$');

create or replace function public.set_title(t text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Non connecté'; end if;
  if coalesce(t, '') <> '' and t <> all (array['diplome', 'mecano', 'globetrotter', 'cristallin', 'legende', 'fidele', 'collectionneur', 'veteran', 'derapeur']) then raise exception 'Titre inconnu'; end if;
  update players set title = nullif(coalesce(t, ''), '') where id = uid;
end $$;
revoke all on function public.set_title(text) from public, anon;
grant execute on function public.set_title(text) to authenticated;

notify pgrst, 'reload schema';
