#!/usr/bin/env bash
# Teste supabase/etape18-maintenance.sql sur un PostgreSQL local : PGHOST=… PGPORT=… PGUSER=postgres tools/test-etape18-sql.sh   (npm run test:sql)
# Base jetable (copytrack_sqltest18) aux droits par défaut d'un projet Supabase, étapes 1 à 17 puis 18 (deux fois : relançable). On vérifie :
# sécurité (search_path, fonctions de déclencheur fermées à l'API mais toujours déclenchées), performance (index, règles RLS, clés primaires),
# conservation (purge_expired : invités inactifs depuis 12 mois et ce qui leur appartient, statistiques, erreurs, compteurs ; jamais un compte),
# remontée d'erreurs (log_errors : validation, nettoyage, plafonds), santé (health_report), archivage (archive_old_scores, lecture par son seul pilote).
set -euo pipefail
cd "$(dirname "$0")/.."
DB=copytrack_sqltest18
P="psql -v ON_ERROR_STOP=1 -q -X"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; psql -q -X -d postgres -c "drop database if exists '"$DB"'" >/dev/null 2>&1 || true' EXIT
$P -d postgres -c "drop database if exists $DB" -c "create database $DB"
cat > "$TMP/stub.sql" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}'::jsonb, is_anonymous boolean default false,
  encrypted_password text, created_at timestamptz default now(), updated_at timestamptz default now(), last_sign_in_at timestamptz);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz default now(), updated_at timestamptz default now(), refreshed_at timestamp);
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
SQL
$P -d $DB -f "$TMP/stub.sql"
for n in 1-communaute 2-classements 3-description 4-comptes 5-securite 6-telemetrie 7-fantomes 8-decouverte 9-secteurs 10-social 11-saisons 12-competition 13-communaute 14-securite 15-backend 15b-publication-verifiee 16-durcissement 17-securite; do
  $P -d $DB -f supabase/etape$n.sql >/dev/null
done

# Données d'avant l'étape : un compte ancien (jamais purgé), un invité inactif depuis 13 mois (purgé, avec son profil et ses temps), un invité
# créé il y a 13 mois mais dont la session vient d'être rafraîchie (gardé), un invité récent (gardé).
$P -d $DB >/dev/null <<'SQL'
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at, last_sign_in_at) values
  ('00000000-0000-0000-0000-0000000018a1', 'ancien18@accounts.copytrack.invalid', '{"username":"Ancien18"}', now() - interval '3 years', now() - interval '3 years', now() - interval '3 years');
insert into auth.users (id, is_anonymous, created_at, updated_at, last_sign_in_at) values
  ('00000000-0000-0000-0000-0000000018a2', true, now() - interval '13 months', now() - interval '13 months', now() - interval '13 months'),
  ('00000000-0000-0000-0000-0000000018a3', true, now() - interval '13 months', now() - interval '13 months', now() - interval '13 months'),
  ('00000000-0000-0000-0000-0000000018a4', true, now() - interval '2 days', now() - interval '2 days', now() - interval '2 days');
insert into auth.sessions (user_id, created_at, updated_at, refreshed_at) values
  ('00000000-0000-0000-0000-0000000018a3', now() - interval '13 months', now() - interval '13 months', (now() - interval '1 day')::timestamp);
insert into players (id, name) values ('00000000-0000-0000-0000-0000000018a1', 'Ancien18'), ('00000000-0000-0000-0000-0000000018a2', 'Oublie18'),
  ('00000000-0000-0000-0000-0000000018a3', 'Fidele18'), ('00000000-0000-0000-0000-0000000018a4', 'Nouveau18');
insert into scores (track_key, player, time, inputs, phys_ver) values
  ('b-eclats-1', '00000000-0000-0000-0000-0000000018a2', 30, 'x', 38),
  ('b-eclats-1', '00000000-0000-0000-0000-0000000018a1', 31, 'x', 30),
  ('b-eclats-1~v1.sea-3', '00000000-0000-0000-0000-0000000018a1', 32, 'x', 30),
  ('b-canyon-1', '00000000-0000-0000-0000-0000000018a1', 40, 'x', 38),
  ('b-canyon-1', '00000000-0000-0000-0000-0000000018a3', 41, 'x', 36);
insert into run_stats (install, track, outcome, time, phys_ver, created_at) values
  ('0123456789abcdef', 'eclats', 'finish', 30, 38, now() - interval '13 months'), ('0123456789abcdef', 'eclats', 'finish', 31, 38, now() - interval '1 hour');
insert into rate_hits (kind, player, at) values ('submit', '00000000-0000-0000-0000-0000000018a1', clock_timestamp() - interval '2 hours'), ('submit', '00000000-0000-0000-0000-0000000018a1', clock_timestamp());
insert into submit_rate (player, at) values ('00000000-0000-0000-0000-0000000018a1', now() - interval '2 hours'), ('00000000-0000-0000-0000-0000000018a1', now());
SQL

$P -d $DB -f supabase/etape18-maintenance.sql >/dev/null
$P -d $DB -f supabase/etape18-maintenance.sql >/dev/null          # relançable

$P -d $DB -At > "$TMP/out.txt" <<'SQL'
\set ON_ERROR_STOP off
create table public.res18 (name text, ok boolean);
grant all on public.res18 to public;
create function public.check18(n text, c boolean) returns void language plpgsql security definer as $$ begin insert into public.res18 values (n, coalesce(c, false)); end $$;
grant execute on function public.check18(text, boolean) to public;
create function public.as_user(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false); end $$;
grant execute on function public.as_user(uuid) to public;

-- 1. sécurité
select check18('search_path fixé sur les 5 fonctions signalées', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('cloud_saves_touch', 'season_clock', 'season_bounds', 'current_season', 'elo') and array_to_string(proconfig, ',') like 'search_path=%') = 5);
select check18('fonctions de déclencheur : ni anon ni authenticated ne peuvent les appeler par l''API', not exists (select 1 from pg_proc p, unnest(array['anon', 'authenticated']) r
  where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype and has_function_privilege(r, p.oid, 'execute')));
set role authenticated;
select as_user('00000000-0000-0000-0000-0000000018a1');
insert into cloud_saves (user_id, data) values ('00000000-0000-0000-0000-0000000018a1', '{"profile":{"coins":1}}');
update cloud_saves set data = '{"profile":{"coins":2}}' where user_id = '00000000-0000-0000-0000-0000000018a1';
reset role;
select check18('…mais elles se déclenchent toujours (sauvegarde cloud créée puis mise à jour par le joueur, numéro de version avancé)',
  (select data->'profile'->>'coins' = '2' and rev >= 1 from cloud_saves where user_id = '00000000-0000-0000-0000-0000000018a1'));
set role authenticated;
select as_user('00000000-0000-0000-0000-0000000018a4');
update players set name = 'Nouveau18b' where id = '00000000-0000-0000-0000-0000000018a4';
reset role;
select check18('…un joueur renomme toujours son profil (déclencheur de réservation du pseudo)', (select name from players where id = '00000000-0000-0000-0000-0000000018a4') = 'Nouveau18b');

-- 2. performance
select check18('aucune règle RLS n''évalue auth.uid() à chaque ligne', not exists (select 1 from pg_policies where schemaname = 'public'
  and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), 'SELECT auth\.uid\(\) AS uid', '', 'g') ~ 'auth\.uid\(\)'));
select check18('les 16 règles réécrites existent toujours (mêmes noms)', (select count(*) from pg_policies where schemaname = 'public' and policyname in ('Voir son compte',
  'Créer sa sauvegarde', 'Lire sa sauvegarde', 'Modifier sa sauvegarde', 'Modes visibles', 'Duels visibles des duellistes', 'Mes abonnements', 'Amis visibles des deux intéressés',
  'Créer son profil', 'Modifier son profil', 'Playlists visibles', 'Commentaires visibles', 'Voir ses j''aime', 'Circuits visibles', 'Supprimer ses circuits')) >= 15);
select check18('chaque clé étrangère de public a un index qui la couvre', not exists (
  select 1 from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace
    and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey::int2[])));
select check18('rate_hits et submit_rate ont une clé primaire', (select count(*) from pg_constraint where contype = 'p' and conrelid in ('public.rate_hits'::regclass, 'public.submit_rate'::regclass)) = 2);
select check18('la limite de cadence répond toujours (0 : passage permis)', public.rate_check('essai', '00000000-0000-0000-0000-0000000018a1', 100, 1000, 10000, false, 100000) = 0);
select check18('…et écrit dans rate_hits (identifiant attribué par la nouvelle clé primaire)', (select count(*) = 1 and min(id) is not null from rate_hits where kind = 'essai'));
-- une RLS réécrite garde son sens : chacun lit SA sauvegarde, pas celle d'un autre
set role authenticated;
select as_user('00000000-0000-0000-0000-0000000018a4');
select check18('RLS inchangée : un autre joueur ne lit pas la sauvegarde cloud d''un compte', (select count(*) from cloud_saves) = 0);
select as_user('00000000-0000-0000-0000-0000000018a1');
select check18('RLS inchangée : le compte lit la sienne', (select count(*) from cloud_saves) = 1);
reset role;

-- 3. conservation
set role authenticated;
select as_user('00000000-0000-0000-0000-0000000018a1');
do $$ begin perform public.purge_expired(); insert into res18 values ('purge_expired refusée à un joueur', false); exception when insufficient_privilege then insert into res18 values ('purge_expired refusée à un joueur', true); end $$;
reset role;
select public.purge_expired();
select check18('purge : l''invité inactif depuis 12 mois est effacé, avec son profil et ses temps', not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000018a2')
  and not exists (select 1 from players where id = '00000000-0000-0000-0000-0000000018a2') and not exists (select 1 from scores where player = '00000000-0000-0000-0000-0000000018a2'));
select check18('purge : l''invité ancien mais encore actif (session rafraîchie hier) et l''invité récent sont gardés', (select count(*) from auth.users where id in
  ('00000000-0000-0000-0000-0000000018a3', '00000000-0000-0000-0000-0000000018a4')) = 2);
select check18('purge : un compte n''est jamais purgé, même inactif depuis 3 ans', exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000018a1'));
select check18('purge : statistiques de plus de 12 mois effacées, récentes gardées', (select count(*) from run_stats where install = '0123456789abcdef') = 1);
select check18('purge : compteurs de plus d''une heure effacés', (select count(*) from rate_hits where at < clock_timestamp() - interval '1 hour') = 0 and (select count(*) from submit_rate) = 1);
select check18('purge : une ligne au journal de maintenance', (select count(*) from maintenance_log where what = 'purge_expired') >= 1);

-- 5. erreurs remontées et santé
set role anon;
select as_user(null);
select check18('log_errors : un lot valide est écrit sans session', public.log_errors('[{"install":"00000000000000aa","version":"bêta 0.12.5","pv":38,"kind":"error","message":"x is undefined at https://site.example/a.js?q=1","source":"js/race.js:12:3","browser":"firefox","mobile":true,"hits":3},{"install":"pas-hexa","version":"v","pv":38,"kind":"error","message":"m"},{"install":"00000000000000aa","version":"v","pv":38,"kind":"inconnu","message":"m"}]'::jsonb) = 1);
do $$ begin perform public.log_errors((select jsonb_agg(jsonb_build_object('install', '00000000000000bb', 'version', 'v', 'pv', 38, 'kind', 'error', 'message', 'm')) from generate_series(1, 21)));
  insert into res18 values ('log_errors : un lot de plus de 20 est refusé', false); exception when others then insert into res18 values ('log_errors : un lot de plus de 20 est refusé', true); end $$;
select public.log_errors((select jsonb_agg(jsonb_build_object('install', '00000000000000cc', 'version', 'v', 'pv', 38, 'kind', 'loop', 'message', repeat('é', 400))) from generate_series(1, 20))) from generate_series(1, 4);
reset role;
select check18('log_errors : adresse retirée du message, champs gardés', (select message = 'x is undefined at <url>' and source = 'js/race.js:12:3' and browser = 'firefox' and mobile and hits = 3 from client_errors where install = '00000000000000aa'));
select check18('log_errors : lignes invalides ignorées (identifiant, type)', (select count(*) from client_errors where install = '00000000000000aa') = 1);
select check18('log_errors : 60 lignes par installation et par heure au plus ; message coupé à 300', (select count(*) = 60 and max(char_length(message)) = 300 from client_errors where install = '00000000000000cc'));
select check18('client_errors : ni anon ni authenticated ne la lisent', not has_table_privilege('anon', 'public.client_errors', 'select') and not has_table_privilege('authenticated', 'public.client_errors', 'select'));
set role anon;
select check18('health_report : lisible sans session, chiffres agrégés', (select (r->>'errors_24h')::int = 63 and (r->>'error_installs_24h')::int = 2 and (r->>'runs_24h')::int = 1
  and (r->>'phys_ver')::int = 38 and r ? 'purge_last' and r->>'purge_scheduled' = 'false' from (select public.health_report() r) h));
reset role;

-- 4. archivage
set role authenticated;
do $$ begin perform public.archive_old_scores(38); insert into res18 values ('archive_old_scores refusée à un joueur', false); exception when insufficient_privilege then insert into res18 values ('archive_old_scores refusée à un joueur', true); end $$;
reset role;
select check18('archivage : seuls les temps hors saison d''une autre physique partent (2)', public.archive_old_scores(38) = 2);
select check18('archivage : les temps de la physique gardée et ceux des saisons restent', (select count(*) from scores where phys_ver = 38) = 1 and exists (select 1 from scores where track_key = 'b-eclats-1~v1.sea-3'));
select check18('archivage : les lignes archivées sont intactes (temps, physique, date d''archivage)', (select count(*) from scores_archive where phys_ver in (30, 36) and archived_at is not null and time in (31, 41)) = 2);
set role authenticated;
select as_user('00000000-0000-0000-0000-0000000018a1');
select check18('archivage : un pilote lit SES temps archivés, pas ceux des autres', (select count(*) from scores_archive) = 1);
reset role;
set role anon;
do $$ begin perform 1 from scores_archive limit 1; insert into res18 values ('archivage : invisible sans session', false); exception when insufficient_privilege then insert into res18 values ('archivage : invisible sans session', true); end $$;
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-0000000018a1';
select check18('archivage : un compte supprimé emporte ses temps archivés', not exists (select 1 from scores_archive where player = '00000000-0000-0000-0000-0000000018a1'));

select case when ok then '  ok   ' else '  FAIL ' end || name from public.res18 order by ctid;
select 'COMPTE ' || count(*) || ' ' || count(*) filter (where not ok) from public.res18;
SQL
grep -v "^COMPTE" "$TMP/out.txt" | grep -E "^  (ok|FAIL)" || true
N="$(grep '^COMPTE' "$TMP/out.txt" || echo 'COMPTE 0 0')"
if grep -q "^  FAIL" "$TMP/out.txt" || [ "$N" != "COMPTE 33 0" ]; then echo "ÉCHEC : étape 18 ($N)"; grep -iv "^  ok" "$TMP/out.txt" | head -20; exit 1; fi
echo "RESULT étape 18 : sécurité, performance, conservation, erreurs, santé et archivage vérifiés ; relançable"
