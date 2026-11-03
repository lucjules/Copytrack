-- =====================================================================================
-- Copytrack : étape 2 (classements par circuit)
-- À coller dans Supabase > SQL Editor > New query, puis « Run » (après l'étape 1).
--
-- Les temps sont écrits UNIQUEMENT par la fonction serveur « submit-score », qui
-- rejoue la course (commandes enregistrées, physique déterministe) avant d'accepter
-- le temps. Le jeu, avec sa clé publique, peut seulement LIRE les classements.
-- =====================================================================================

create table if not exists public.scores (
  track_key text not null check (char_length(track_key) <= 80),
  player uuid not null references public.players (id) on delete cascade,
  time double precision not null check (time > 0 and time < 3600),
  inputs text not null check (char_length(inputs) <= 400000),
  phys_ver int not null,
  track_name text not null default '' check (char_length(track_name) <= 60),
  updated_at timestamptz not null default now(),
  primary key (track_key, player)
);
create index if not exists scores_board on public.scores (track_key, phys_ver, time);
alter table public.scores enable row level security;

drop policy if exists "Classements visibles par tous" on public.scores;
create policy "Classements visibles par tous" on public.scores
  for select using (true);
-- Aucune règle d'écriture : seule la fonction serveur (clé secrète, côté Supabase) écrit.

grant select on public.scores to anon, authenticated;
