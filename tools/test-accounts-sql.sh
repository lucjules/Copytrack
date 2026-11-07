#!/usr/bin/env bash
# Teste les étapes SQL de supabase/ (communauté, classements, comptes, durcissement) sur un PostgreSQL local (faux schéma « auth » de Supabase).
# Usage : PGHOST=/tmp PGPORT=54329 PGUSER=postgres tools/test-accounts-sql.sh   (pas inclus dans npm test : il faut un serveur PostgreSQL)
set -euo pipefail
cd "$(dirname "$0")/.."
DB=copytrack_sqltest
P="psql -v ON_ERROR_STOP=1 -q -X"
$P -d postgres -c "drop database if exists $DB" -c "create database $DB"
cat > /tmp/ct-stub.sql <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}'::jsonb, is_anonymous boolean default false, encrypted_password text);
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
grant usage on schema auth to anon, authenticated;
SQL
for f in /tmp/ct-stub.sql supabase/etape1-communaute.sql supabase/etape2-classements.sql supabase/etape3-description.sql supabase/etape4-comptes.sql supabase/etape4-comptes.sql supabase/etape5-securite.sql supabase/etape5-securite.sql supabase/etape6-telemetrie.sql supabase/etape6-telemetrie.sql supabase/etape7-fantomes.sql supabase/etape7-fantomes.sql; do $P -d $DB -f $f; done   # 2 fois : relançable
$P -d $DB <<'SQL'
\set ON_ERROR_STOP off
create function public.as_user(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u::text, false); end $$;
grant execute on function public.as_user(uuid) to public;
create table public.res (name text, ok boolean);
grant all on public.res to public;
create function public.check(n text, c boolean) returns void language plpgsql security definer as $$ begin insert into public.res values (n, coalesce(c,false)); end $$;
grant execute on function public.check(text, boolean) to public;

-- 1. inscription d'un compte : la ligne accounts naît du déclencheur
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a1', 'alice@accounts.copytrack.invalid', '{"username":"Alice"}');
select public.check('inscription crée le compte', (select username from accounts where user_id='00000000-0000-0000-0000-0000000000a1') = 'Alice');
-- 2. pseudo identique à la casse près : refusé
do $$ begin insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a2', 'alice2@accounts.copytrack.invalid', '{"username":"ALICE"}'); exception when others then null; end $$;
select public.check('pseudo refusé si adresse et pseudo diffèrent', not exists (select 1 from auth.users where id='00000000-0000-0000-0000-0000000000a2'));
do $$ begin insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a3', 'ALICE@accounts.copytrack.invalid', '{"username":"ALICE"}'); exception when others then null; end $$;
select public.check('pseudo unique sans tenir compte de la casse', not exists (select 1 from auth.users where id='00000000-0000-0000-0000-0000000000a3'));
-- 3. pseudo par défaut, format, mauvais domaine
do $$ begin insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a4', 'pilote@accounts.copytrack.invalid', '{"username":"Pilote"}'); exception when others then null; end $$;
select public.check('« Pilote » refusé', not exists (select 1 from auth.users where id='00000000-0000-0000-0000-0000000000a4'));
do $$ begin insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a5', 'bob@gmail.com', '{"username":"bob"}'); exception when others then null; end $$;
select public.check('mauvais domaine refusé', not exists (select 1 from auth.users where id='00000000-0000-0000-0000-0000000000a5'));
-- 4. invité (anonyme) : pas de compte, pas d'erreur
insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-0000000000b1', true);
select public.check('invité sans compte', not exists (select 1 from accounts where user_id='00000000-0000-0000-0000-0000000000b1'));
-- 5. verrou de pseudo sur players
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ begin insert into players (id, name) values ('00000000-0000-0000-0000-0000000000b1', 'alice'); exception when others then null; end $$;
select public.check('un invité ne prend pas le pseudo d''un compte', not exists (select 1 from players where id='00000000-0000-0000-0000-0000000000b1'));
do $$ begin insert into players (id, name) values ('00000000-0000-0000-0000-0000000000b1', 'Pilote'); exception when others then null; end $$;
select public.check('nom par défaut refusé pour les joueurs', not exists (select 1 from players where id='00000000-0000-0000-0000-0000000000b1'));
insert into players (id, name) values ('00000000-0000-0000-0000-0000000000b1', 'Zoé');
select public.check('pseudo libre accepté', exists (select 1 from players where name='Zoé'));
select public.as_user('00000000-0000-0000-0000-0000000000a1');
insert into players (id, name) values ('00000000-0000-0000-0000-0000000000a1', 'Alice');
select public.check('le compte prend son propre pseudo', exists (select 1 from players where name='Alice'));
-- 6. sauvegarde cloud : isolation, version, anti-écrasement
insert into cloud_saves (user_id, data) values ('00000000-0000-0000-0000-0000000000a1', '{"profile":{"coins":5}}');
select public.check('Alice écrit sa sauvegarde', (select rev from cloud_saves) = 1);
update cloud_saves set data='{"profile":{"coins":9}}' where user_id='00000000-0000-0000-0000-0000000000a1' and rev=1;
select public.check('la version monte à chaque écriture', (select rev from cloud_saves) = 2);
do $$ declare n int; begin update cloud_saves set data='{}' where user_id='00000000-0000-0000-0000-0000000000a1' and rev=1; get diagnostics n = row_count; perform public.check('écriture avec une vieille version : 0 ligne', n = 0); end $$;
update cloud_saves set rev=99 where user_id='00000000-0000-0000-0000-0000000000a1';
select public.check('le client ne choisit pas la version', (select rev from cloud_saves) = 3);
select public.as_user('00000000-0000-0000-0000-0000000000b1');
select public.check('Zoé (invitée) ne voit pas la sauvegarde d''Alice', (select count(*) from cloud_saves) = 0);
do $$ begin insert into cloud_saves (user_id, data) values ('00000000-0000-0000-0000-0000000000b1', '{}'); exception when others then null; end $$;
select public.check('un invité ne crée pas de sauvegarde cloud', (select count(*) from cloud_saves) = 0);
select public.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin insert into cloud_saves (user_id, data) values ('00000000-0000-0000-0000-0000000000b1', '{}'); exception when others then null; end $$;
select public.check('on n''écrit pas pour un autre', (select count(*) from cloud_saves where user_id='00000000-0000-0000-0000-0000000000b1') = 0);
do $$ begin insert into cloud_saves (user_id, data) values ('00000000-0000-0000-0000-0000000000a1', '[]'); exception when others then null; end $$;
select public.check('sauvegarde = objet JSON', (select count(*) from cloud_saves) = 1);
-- 7. fonctions publiques
select public.check('username_available : pris', not username_available('ALICE'));
select public.check('username_available : libre', username_available('Nouveau_1'));
select public.check('username_available : « player » réservé', not username_available('Player'));
select public.check('les comptes ne sont pas lisibles par les autres', (select count(*) from accounts) = 1);
-- 8. suppression du compte
select delete_account();
reset role;
select public.check('suppression : compte, sauvegarde et profil partent', not exists (select 1 from auth.users where id='00000000-0000-0000-0000-0000000000a1') and not exists (select 1 from cloud_saves) and not exists (select 1 from accounts where username='Alice') and not exists (select 1 from players where name='Alice'));
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ begin perform delete_account(); exception when others then null; end $$;
reset role;
select public.check('un invité ne peut pas « supprimer son compte »', exists (select 1 from auth.users where id='00000000-0000-0000-0000-0000000000b1'));
-- 9. durcissement (étape 5) : les commandes enregistrées ne sont plus lisibles, plafond de temps par pilote
reset role;
insert into scores (track_key, player, time, inputs, phys_ver) values ('b-essai-1', '00000000-0000-0000-0000-0000000000b1', 20.5, 'AAAA', 26);
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ declare refuse boolean := false; begin
  begin perform inputs from scores limit 1; exception when insufficient_privilege then refuse := true; end;
  perform public.check('étape 5 : la colonne « inputs » n''est plus lisible par le jeu', refuse);
end $$;
select public.check('étape 5 : les classements restent lisibles (colonnes utiles)', (select count(*) from scores where track_key = 'b-essai-1' and time = 20.5) = 1);
reset role;
do $$ declare refuse boolean := false; begin
  for i in 1..1999 loop insert into scores (track_key, player, time, inputs, phys_ver) values ('k' || i, '00000000-0000-0000-0000-0000000000b1', 30, 'A', 26); end loop;
  begin insert into scores (track_key, player, time, inputs, phys_ver) values ('k-de-trop', '00000000-0000-0000-0000-0000000000b1', 30, 'A', 26); exception when others then refuse := true; end;
  perform public.check('étape 5 : 2000 temps au plus par pilote', refuse and (select count(*) from scores where player = '00000000-0000-0000-0000-0000000000b1') = 2000);
end $$;
-- 10. statistiques de jeu anonymes (étape 6) : écriture par log_runs seulement, lignes invalides ignorées, cadence limitée
reset role;
set role anon;
do $$ declare n int; begin
  n := public.log_runs('[
    {"install":"00000000000000a1","track":"eclats","outcome":"finish","time":21.5,"respawns":0,"attempt":2,"pv":26,"medal":"or"},
    {"install":"00000000000000a1","track":"eclats","outcome":"quit","time":12.2,"progress":0.4,"attempt":3,"pv":26},
    {"install":"pas-un-id","track":"eclats","outcome":"finish","time":20,"pv":26},
    {"install":"00000000000000a2","track":"BAD TRACK","outcome":"finish","time":20,"pv":26},
    {"install":"00000000000000a2","track":"eclats","outcome":"finish","time":-4,"pv":26}
  ]'::jsonb);
  perform public.check('étape 6 : seules les lignes valides sont enregistrées', n = 2);
end $$;
do $$ declare refuse boolean := false; begin
  begin perform 1 from run_stats limit 1; exception when insufficient_privilege then refuse := true; end;
  perform public.check('étape 6 : le jeu ne peut pas lire les statistiques', refuse);
end $$;
do $$ declare refuse boolean := false; begin
  begin perform public.log_runs((select jsonb_agg('{"install":"00000000000000a3","track":"x","outcome":"quit","time":5,"pv":26}'::jsonb) from generate_series(1, 51))); exception when others then refuse := true; end;
  perform public.check('étape 6 : un lot de plus de 50 lignes est refusé', refuse);
end $$;
do $$ declare total int := 0; begin
  for i in 1..8 loop
    total := total + public.log_runs((select jsonb_agg('{"install":"00000000000000a4","track":"x","outcome":"quit","time":5,"pv":26}'::jsonb) from generate_series(1, 50)));
  end loop;
  perform public.check('étape 6 : au plus 300 lignes par heure et par installation', total = 300);
end $$;
reset role;
select public.check('étape 6 : la clé de service lit les statistiques', (select count(*) from run_stats where install = '00000000000000a1') = 2);
-- 11. fantômes du haut des classements (étape 7) : lisibles par get_ghost seulement, du n° 1 au n° 10, dans l'ordre du classement
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'c1@accounts.copytrack.invalid'), ('00000000-0000-0000-0000-0000000000c2', 'c2@accounts.copytrack.invalid'), ('00000000-0000-0000-0000-0000000000c3', 'c3@accounts.copytrack.invalid') on conflict do nothing;
insert into players (id, name) values ('00000000-0000-0000-0000-0000000000c1', 'Rapide'), ('00000000-0000-0000-0000-0000000000c2', 'Moyen'), ('00000000-0000-0000-0000-0000000000c3', 'Lent') on conflict do nothing;
insert into scores (track_key, player, time, inputs, phys_ver, ghost, ghost_veh) values ('b-fantome-1', '00000000-0000-0000-0000-0000000000c1', 19.9, 'AAAA', 26, 'R0hPU1Q=', '[[3,1]]');
insert into scores (track_key, player, time, inputs, phys_ver) values ('b-fantome-1', '00000000-0000-0000-0000-0000000000c2', 21.0, 'AAAA', 26);
insert into scores (track_key, player, time, inputs, phys_ver, ghost) values ('b-fantome-1', '00000000-0000-0000-0000-0000000000c3', 22.0, 'AAAA', 26, 'T1RIRVI=');
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ declare refuse boolean := false; begin
  begin perform ghost from scores limit 1; exception when insufficient_privilege then refuse := true; end;
  perform public.check('étape 7 : la colonne « ghost » n''est lisible que par get_ghost', refuse);
end $$;
select public.check('étape 7 : has_ghost est lisible (bouton 👻 du classement)', (select count(*) from scores where track_key = 'b-fantome-1' and has_ghost) = 2);
select public.check('étape 7 : get_ghost(1) rend le fantôme du premier, avec son nom, son temps et ses véhicules',
  (select name = 'Rapide' and time = 19.9 and ghost = 'R0hPU1Q=' and ghost_veh = '[[3,1]]'::jsonb from public.get_ghost('b-fantome-1', 1, 26)));
select public.check('étape 7 : un record sans fantôme (2e) ne rend rien', (select count(*) from public.get_ghost('b-fantome-1', 2, 26)) = 0);
select public.check('étape 7 : le 3e a son fantôme ; mauvaise physique, rang 0 ou 11 : rien',
  (select count(*) from public.get_ghost('b-fantome-1', 3, 26)) = 1 and (select count(*) from public.get_ghost('b-fantome-1', 1, 25)) = 0
  and (select count(*) from public.get_ghost('b-fantome-1', 0, 26)) = 0 and (select count(*) from public.get_ghost('b-fantome-1', 11, 26)) = 0);
reset role;
-- 12. aucun mot de passe en clair dans nos tables
select public.check('aucune colonne mot de passe dans le schéma public', not exists (select 1 from information_schema.columns where table_schema='public' and column_name ilike '%pass%'));
select case when ok then '  ok   ' else '  FAIL ' end || name from public.res order by ok, name;
select 'RESULT ' || case when bool_and(ok) and count(*) = 38 then 'tous les tests SQL passent' else 'ÉCHEC' end from public.res;
SQL
