-- =====================================================================================
-- Copytrack : étape 6 (statistiques de jeu anonymes) — à lancer une fois dans Supabase > SQL Editor, après les étapes 1 à 5.
-- Peut être relancé sans danger.
--
-- Le jeu (avec l'accord du joueur, réglage « statistiques ») envoie, pour les circuits intégrés et le défi du jour : l'issue d'une partie (arrivée ou
-- abandon), son temps, la progression à l'abandon, le numéro d'essai, la médaille. Un identifiant d'installation aléatoire sert à ne compter qu'un
-- meilleur temps par joueur ; il n'est lié ni au pseudo ni au compte. Elles servent à régler les médailles et la difficulté (tools/telemetry-report.mjs).
--
--  - La table n'est lisible ni modifiable par le jeu (aucun droit pour anon / authenticated) : seule la clé de service (tableau de bord, outils) la lit.
--  - L'écriture passe par log_runs : valide chaque ligne, ignore les invalides, au plus 300 lignes par heure et par installation.
--  - Conservation : à purger de temps en temps (delete from public.run_stats where created_at < now() - interval '180 days').
-- =====================================================================================

create table if not exists public.run_stats (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  install text not null check (install ~ '^[0-9a-f]{16}$'),
  track text not null check (track ~ '^[a-z0-9_]{1,40}$'),
  outcome text not null check (outcome in ('finish', 'quit')),
  time real not null check (time >= 0.5 and time < 3600),
  progress real check (progress >= 0 and progress <= 1),
  respawns int not null default 0 check (respawns between 0 and 1000),
  attempt int not null default 1 check (attempt between 1 and 100000),
  phys_ver int not null check (phys_ver between 1 and 100000),
  medal text check (medal in ('cristal', 'or', 'argent', 'bronze'))
);
create index if not exists run_stats_track on public.run_stats (track, phys_ver, outcome);
create index if not exists run_stats_install on public.run_stats (install, created_at);
alter table public.run_stats enable row level security;
revoke all on public.run_stats from anon, authenticated;

create or replace function public.log_runs(events jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  e jsonb; n int := 0; inst text; recent int;
begin
  if events is null or jsonb_typeof(events) <> 'array' or jsonb_array_length(events) > 50 then
    raise exception 'Lot invalide';
  end if;
  for e in select * from jsonb_array_elements(events) loop
    begin
      inst := e->>'install';
      if inst is null or inst !~ '^[0-9a-f]{16}$' then continue; end if;
      select count(*) into recent from run_stats where install = inst and created_at > now() - interval '1 hour';
      if recent >= 300 then exit; end if;       -- (le décompte voit déjà les lignes de ce lot)
      insert into run_stats (install, track, outcome, time, progress, respawns, attempt, phys_ver, medal)
      values (
        inst, e->>'track', e->>'outcome', (e->>'time')::real, (e->>'progress')::real,
        coalesce((e->>'respawns')::int, 0), coalesce((e->>'attempt')::int, 1), (e->>'pv')::int, e->>'medal'
      );
      n := n + 1;
    exception when others then
      null;          -- ligne invalide (type, contrainte) : ignorée, les autres passent
    end;
  end loop;
  return n;
end $$;
grant execute on function public.log_runs(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
