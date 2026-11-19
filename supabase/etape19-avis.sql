-- =====================================================================================
-- Étape 19 (0.13.0, phase 4 de la 1.0) : avis des testeurs, envoyés depuis le jeu (Paramètres › Donner mon avis, js/app/feedback.js).
-- RELANÇABLE, ne supprime aucune donnée en s'appliquant. Suppose l'étape 18 (purge_expired, health_report, maintenance_log).
--
-- Un avis : l'identifiant d'installation aléatoire des statistiques, la version du jeu et de la physique, le type d'appareil et de commandes, l'expérience
-- du joueur (débutant ou habitué), six notes (plaisir et équilibrages), deux textes libres courts, et le pseudo SEULEMENT si le joueur coche « joindre
-- mon pseudo ». Personne ne lit la table depuis le jeu (ni anon ni authenticated) : l'éditeur la lit dans le tableau de bord ou par le connecteur.
-- Conservation : 12 mois (purge_expired, page Confidentialité). Plafonds : 5 avis par installation et par jour, 300 par heure en tout.
-- Vérification : verify-prod.sql, lignes « étape 19 ». Test : tools/test-etape19-sql.sh (npm run test:sql).
-- =====================================================================================

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  install text not null check (install ~ '^[0-9a-f]{16}$'),
  version text not null check (char_length(version) between 1 and 24),
  phys_ver int not null check (phys_ver between 1 and 10000),
  device text not null check (device in ('ordinateur', 'telephone', 'tablette')),
  controls text not null check (controls in ('clavier', 'manette', 'tactile')),
  experience text not null check (experience in ('debutant', 'habitue')),
  -- Notes : plaisir et caméra de 1 (pas du tout) à 5 (beaucoup) ; équilibrages de -2 (trop dur, trop punitif, trop faible) à +2 (trop facile, pas assez, trop fort), 0 = juste.
  fun smallint not null check (fun between 1 and 5),
  camera smallint not null check (camera between 1 and 5),
  drift smallint not null check (drift between -2 and 2),
  walls smallint not null check (walls between -2 and 2),
  air smallint not null check (air between -2 and 2),
  difficulty smallint not null check (difficulty between -2 and 2),
  tracks_note text not null default '' check (char_length(tracks_note) <= 300),
  comment text not null default '' check (char_length(comment) <= 1000),
  pseudo text check (pseudo is null or char_length(pseudo) between 1 and 24)
);
create index if not exists feedback_created on public.feedback (created_at);
create index if not exists feedback_install on public.feedback (install, created_at);
alter table public.feedback enable row level security;
revoke all on public.feedback from public, anon, authenticated;

-- Un avis (objet JSON) ; renvoie l'identifiant de la ligne, ou 0 si un plafond est atteint (sans erreur : le jeu dit « merci » et réessaie plus tard).
-- Une valeur invalide lève une erreur explicite (le jeu ne l'envoie jamais : il valide avant, js/feedback.js).
create or replace function public.submit_feedback(f jsonb) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare inst text := f->>'install'; new_id bigint;
begin
  if f is null or jsonb_typeof(f) <> 'object' then raise exception 'Avis invalide'; end if;
  if inst is null or inst !~ '^[0-9a-f]{16}$' then raise exception 'Avis invalide'; end if;
  if (select count(*) from feedback where created_at > now() - interval '1 hour') >= 300 then return 0; end if;
  if (select count(*) from feedback where install = inst and created_at > now() - interval '1 day') >= 5 then return 0; end if;
  insert into feedback (install, version, phys_ver, device, controls, experience, fun, camera, drift, walls, air, difficulty, tracks_note, comment, pseudo)
  values (inst, f->>'version', (f->>'pv')::int, f->>'device', f->>'controls', f->>'experience',
          (f->>'fun')::smallint, (f->>'camera')::smallint, (f->>'drift')::smallint, (f->>'walls')::smallint, (f->>'air')::smallint, (f->>'difficulty')::smallint,
          left(regexp_replace(coalesce(f->>'tracks_note', ''), 'https?://\S+', '<url>', 'g'), 300),
          left(regexp_replace(coalesce(f->>'comment', ''), 'https?://\S+', '<url>', 'g'), 1000),
          nullif(left(btrim(coalesce(f->>'pseudo', '')), 24), ''))
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.submit_feedback(jsonb) from public, anon, authenticated;
grant execute on function public.submit_feedback(jsonb) to anon, authenticated;

-- La purge de l'étape 18, avec les avis de plus de 12 mois en plus (même résultat sinon).
create or replace function public.purge_expired() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare g int := 0; r int := 0; e int := 0; c int := 0; m int := 0; a int := 0; res jsonb;
begin
  with d as (
    delete from auth.users u
    where u.is_anonymous
      and greatest(u.created_at, coalesce(u.last_sign_in_at, u.created_at), coalesce(u.updated_at, u.created_at),
            coalesce((select max(greatest(s.created_at, coalesce(s.updated_at, s.created_at), coalesce(s.refreshed_at::timestamptz, s.created_at)))
                      from auth.sessions s where s.user_id = u.id), u.created_at))
          < now() - interval '12 months'
    returning 1)
  select count(*) into g from d;
  with d as (delete from run_stats where created_at < now() - interval '12 months' returning 1) select count(*) into r from d;
  with d as (delete from client_errors where created_at < now() - interval '90 days' returning 1) select count(*) into e from d;
  with d as (delete from feedback where created_at < now() - interval '12 months' returning 1) select count(*) into a from d;
  with d as (delete from rate_hits where at < clock_timestamp() - interval '1 hour' returning 1) select count(*) into c from d;
  with d as (delete from submit_rate where at < now() - interval '1 hour' returning 1) select count(*) + c into c from d;
  with d as (delete from maintenance_log where at < now() - interval '400 days' returning 1) select count(*) into m from d;
  res := jsonb_build_object('invites', g, 'statistiques', r, 'erreurs', e, 'avis', a, 'compteurs', c, 'journal', m);
  begin
    execute 'delete from cron.job_run_details where end_time < now() - interval ''30 days''';
  exception when others then null;
  end;
  insert into maintenance_log (what, result) values ('purge_expired', res);
  return res;
end $$;
revoke all on function public.purge_expired() from public, anon, authenticated;

-- Santé : le nombre d'avis reçus sur 24 h en plus (tools/surveillance.mjs l'affiche).
create or replace function public.health_report() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'at', now(),
    'phys_ver', (select max(phys_ver) from scores),
    'scores_24h', (select count(*) from scores where updated_at > now() - interval '24 hours'),
    'runs_24h', (select count(*) from run_stats where created_at > now() - interval '24 hours'),
    'errors_24h', (select coalesce(sum(hits), 0) from client_errors where created_at > now() - interval '24 hours'),
    'error_installs_24h', (select count(distinct install) from client_errors where created_at > now() - interval '24 hours'),
    'installs_24h', (select count(distinct install) from run_stats where created_at > now() - interval '24 hours'),
    'feedback_24h', (select count(*) from feedback where created_at > now() - interval '24 hours'),
    'players_7d', (select count(*) from players where created_at > now() - interval '7 days'),
    'tracks', (select count(*) from tracks where not hidden),
    'purge_last', (select max(at) from maintenance_log where what = 'purge_expired'),
    'purge_scheduled', exists (select 1 from pg_extension where extname = 'pg_cron')
  );
$$;
revoke all on function public.health_report() from public, anon, authenticated;
grant execute on function public.health_report() to anon, authenticated;

notify pgrst, 'reload schema';
