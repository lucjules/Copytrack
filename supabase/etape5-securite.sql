-- =====================================================================================
-- Copytrack : étape 5 (durcissement) — à lancer une fois dans Supabase > SQL Editor, après les étapes 1 à 4.
-- Peut être relancé sans danger.
--
--  1. Les commandes enregistrées (colonne scores.inputs) ne sont plus lisibles par le jeu : n'importe qui pouvait
--     télécharger le replay du n°1 et le renvoyer sous son nom (le serveur vérifie la course, pas son auteur).
--  2. Un pilote ne peut plus stocker un nombre illimité de temps (clés de circuit inventées) : 2000 lignes au plus.
--  3. Un signalement ne compte que s'il vient d'un profil créé depuis plus de 24 h : trois comptes jetables ne
--     suffisent plus pour masquer le circuit de quelqu'un.
--  4. Le compteur de parties d'un circuit n'augmente qu'une fois par heure et par pilote.
-- =====================================================================================

-- 1. Lecture des classements : seulement les colonnes utiles (jamais « inputs »).
revoke select on public.scores from anon, authenticated;
grant select (track_key, player, time, phys_ver, track_name, updated_at) on public.scores to anon, authenticated;

-- 2. Plafond de lignes par pilote.
create or replace function public.scores_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from scores where player = new.player) >= 2000 then
    raise exception 'Trop de temps enregistrés pour ce pilote.';
  end if;
  return new;
end $$;
drop trigger if exists scores_limit on public.scores;
create trigger scores_limit before insert on public.scores
  for each row execute function public.scores_limit();

-- 3. Signalements : seuls les profils de plus de 24 h comptent pour masquer un circuit.
alter table public.track_reports add column if not exists counts boolean not null default true;
create or replace function public.report_track(t uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int; old_enough boolean;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  select coalesce(created_at < now() - interval '24 hours', false) into old_enough from players where id = uid;
  insert into track_reports (track_id, player, counts) values (t, uid, old_enough) on conflict do nothing;
  select count(*) into n from track_reports where track_id = t and counts;
  update tracks set reports = (select count(*) from track_reports where track_id = t), hidden = (n >= 3) where id = t;
end $$;

-- 4. Parties : une fois par heure et par pilote et par circuit.
create table if not exists public.track_plays (
  track_id uuid not null references public.tracks (id) on delete cascade,
  player uuid not null references auth.users (id) on delete cascade,
  last_at timestamptz not null default now(),
  primary key (track_id, player)
);
alter table public.track_plays enable row level security;
create or replace function public.track_played(t uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); done boolean;
begin
  if uid is null then return; end if;
  insert into track_plays (track_id, player) values (t, uid)
    on conflict (track_id, player) do update set last_at = now() where track_plays.last_at < now() - interval '1 hour'
    returning true into done;
  if done then update tracks set plays = plays + 1 where id = t; end if;
end $$;

notify pgrst, 'reload schema';
