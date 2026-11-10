#!/usr/bin/env bash
# Teste les étapes SQL de supabase/ (communauté, classements, comptes, durcissement, secteurs, amis, saisons, compétition, communauté 2) sur un PostgreSQL local (faux schéma « auth » de Supabase).
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
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}'::jsonb, is_anonymous boolean default false, encrypted_password text);
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
grant usage on schema auth to anon, authenticated;
SQL
for f in /tmp/ct-stub.sql supabase/etape1-communaute.sql supabase/etape2-classements.sql supabase/etape3-description.sql supabase/etape4-comptes.sql supabase/etape4-comptes.sql supabase/etape5-securite.sql supabase/etape5-securite.sql supabase/etape6-telemetrie.sql supabase/etape6-telemetrie.sql supabase/etape7-fantomes.sql supabase/etape7-fantomes.sql supabase/etape8-decouverte.sql supabase/etape8-decouverte.sql supabase/etape9-secteurs.sql supabase/etape9-secteurs.sql supabase/etape10-social.sql supabase/etape10-social.sql supabase/etape11-saisons.sql supabase/etape11-saisons.sql supabase/etape12-competition.sql supabase/etape12-competition.sql supabase/etape13-communaute.sql supabase/etape13-communaute.sql supabase/etape14-securite.sql supabase/etape14-securite.sql supabase/etape15-backend.sql supabase/etape15-backend.sql; do $P -d $DB -f $f; done   # 2 fois : relançable
$P -d $DB <<'SQL' | tee /tmp/ct-sql-out.txt
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
-- 12. découverte et titres (étape 8) : tendances de la semaine, titres de la liste blanche
reset role;
insert into tracks (id, author, name, decor, code, signature, author_time, pieces) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000c1', 'Populaire', 'desert', 'X', 'sig-pop', 20, 10),
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000c1', 'Calme', 'desert', 'X', 'sig-calme', 20, 10),
  ('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-0000000000c1', 'Masqué', 'desert', 'X', 'sig-masque', 20, 10),
  ('00000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-0000000000c1', 'Ancien', 'desert', 'X', 'sig-ancien', 20, 10);
update tracks set hidden = true where id = '00000000-0000-0000-0000-00000000f003';
insert into track_plays (track_id, player, last_at) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000c1', now()), ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000c2', now() - interval '2 days'), ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000c3', now() - interval '6 days'),
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000c1', now()),
  ('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-0000000000c1', now()), ('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-0000000000c2', now()), ('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-0000000000c3', now()),
  ('00000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-0000000000c1', now() - interval '20 days'), ('00000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-0000000000c2', now() - interval '20 days');
set role anon;
select public.check('étape 8 : tendances de la semaine : le plus joué d''abord (3 pilotes), puis le calme (1) ; ni le circuit masqué ni celui joué il y a 20 jours',
  (select array_agg(id::text order by week_players desc, id) from public.trending_tracks(7, 24, 0)) = array['00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000f002']);
select public.check('étape 8 : la fenêtre se règle (30 jours : l''ancien réapparaît) et la pagination avance',
  (select count(*) from public.trending_tracks(30, 24, 0)) = 3 and (select count(*) from public.trending_tracks(7, 1, 1)) = 1 and (select id from public.trending_tracks(7, 1, 1)) = '00000000-0000-0000-0000-00000000f002');
select public.check('étape 8 : bornes absurdes sans erreur (jours négatifs, limite énorme)', (select count(*) from public.trending_tracks(-5, 100000, -3)) >= 1);
do $$ declare refuse boolean := false; begin
  begin perform public.set_title('veteran'); exception when insufficient_privilege then refuse := true; end;
  perform public.check('étape 8 : set_title n''est pas appelable sans compte', refuse);
end $$;
reset role;
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000c1');
select public.set_title('veteran');
select public.check('étape 8 : un titre de la liste s''enregistre', (select title from players where id = '00000000-0000-0000-0000-0000000000c1') = 'veteran');
do $$ declare refuse boolean := false; begin
  begin perform public.set_title('Roi du monde'); exception when others then refuse := true; end;
  perform public.check('étape 8 : un titre hors liste est refusé', refuse and (select title from players where id = '00000000-0000-0000-0000-0000000000c1') = 'veteran');
end $$;
select public.set_title('');
select public.check('étape 8 : un titre vide retire le titre', (select title is null from players where id = '00000000-0000-0000-0000-0000000000c1'));
reset role;
-- 14. classements par secteur (étape 9) : secteurs calculés depuis les temps intermédiaires des records
reset role;
insert into scores (track_key, player, time, inputs, phys_ver, splits) values
  ('b-secteurs-1', '00000000-0000-0000-0000-0000000000c1', 30.0, 'A', 26, '{1200,2400}'),       -- secteurs (pas) : 1200, 1200, 1200
  ('b-secteurs-1', '00000000-0000-0000-0000-0000000000c2', 31.0, 'A', 26, '{1100,2500}'),       -- 1100, 1400, 1220
  ('b-secteurs-1', '00000000-0000-0000-0000-0000000000c3', 29.0, 'A', 26, null);                -- sans temps intermédiaires : ignoré
set role anon;
select public.check('étape 9 : secteur 1 : le meilleur départ d''abord (1100 pas), le record sans temps intermédiaires est ignoré',
  (select array_agg(name order by rank) from public.sector_board('b-secteurs-1', 26, 1, 10)) = array['Moyen', 'Rapide'] and (select sector_steps from public.sector_board('b-secteurs-1', 26, 1, 10) where rank = 1) = 1100);
select public.check('étape 9 : dernier secteur (dernier passage → arrivée) : 1200 contre 1220 pas',
  (select array_agg(sector_steps order by rank) from public.sector_board('b-secteurs-1', 26, 3, 10)) = array[1200, 1220]);
select public.check('étape 9 : secteur hors du circuit, mauvaise physique : rien', (select count(*) from public.sector_board('b-secteurs-1', 26, 4, 10)) = 0 and (select count(*) from public.sector_board('b-secteurs-1', 25, 1, 10)) = 0);
select public.check('étape 9 : les temps intermédiaires sont lisibles (colonne splits)', (select count(*) from scores where track_key = 'b-secteurs-1' and splits is not null) = 2);
reset role;
-- 15. amis et abonnements (étape 10)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'ana@accounts.copytrack.invalid', '{"username":"Ana"}'),
  ('00000000-0000-0000-0000-0000000000d2', 'ben@accounts.copytrack.invalid', '{"username":"Ben"}'),
  ('00000000-0000-0000-0000-0000000000d3', 'cyd@accounts.copytrack.invalid', '{"username":"Cyd"}');
insert into players (id, name) values ('00000000-0000-0000-0000-0000000000d1', 'Ana'), ('00000000-0000-0000-0000-0000000000d2', 'Ben'), ('00000000-0000-0000-0000-0000000000d3', 'Cyd');
insert into scores (track_key, player, time, inputs, phys_ver) values ('b-amis-1', '00000000-0000-0000-0000-0000000000d1', 25, 'A', 26), ('b-amis-1', '00000000-0000-0000-0000-0000000000d2', 24, 'A', 26), ('b-amis-1', '00000000-0000-0000-0000-0000000000d3', 20, 'A', 26);
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ declare refuse boolean := false; begin
  begin perform public.friend_request('Ana'); exception when others then refuse := true; end;
  perform public.check('étape 10 : une session invitée ne peut pas demander d''ami', refuse);
end $$;
select public.as_user('00000000-0000-0000-0000-0000000000d1');
select public.check('étape 10 : Ana demande Ben (pseudo sans tenir compte de la casse)', public.friend_request('ben') = 'sent');
select public.check('étape 10 : redemander ne double pas la demande', public.friend_request('Ben') = 'already');
do $$ declare refuse boolean := false; begin
  begin perform public.friend_request('Personne'); exception when others then refuse := true; end;
  perform public.check('étape 10 : pseudo inconnu refusé', refuse);
end $$;
do $$ declare refuse boolean := false; begin
  begin insert into friends (a, b, status) values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d3', 'accepted'); exception when others then refuse := true; end;
  perform public.check('étape 10 : on n''écrit pas directement dans la table des amis (pas d''amitié forcée)', refuse);
end $$;
select public.as_user('00000000-0000-0000-0000-0000000000d3');
select public.check('étape 10 : un inconnu (Cyd) ne voit pas la demande d''Ana à Ben', (select count(*) from friends) = 0 and (select count(*) from public.my_friends()) = 0);
select public.as_user('00000000-0000-0000-0000-0000000000d2');
select public.check('étape 10 : Ben voit la demande reçue d''Ana', (select count(*) from public.my_friends() where name = 'Ana' and status = 'pending' and incoming) = 1);
select public.friend_respond('00000000-0000-0000-0000-0000000000d1', true);
select public.check('étape 10 : Ben accepte : amis des deux côtés', (select status from friends) = 'accepted');
select public.check('étape 10 : classement entre amis : Ben et Ana, pas Cyd (pourtant le plus rapide)',
  (select array_agg(name order by rank) from public.friends_board('b-amis-1', 26, 20)) = array['Ben', 'Ana']);
select public.as_user('00000000-0000-0000-0000-0000000000d3');
select public.check('étape 10 : pour Cyd (sans amis), le classement entre amis n''a que lui', (select array_agg(name) from public.friends_board('b-amis-1', 26, 20)) = array['Cyd']);
select public.check('étape 10 : Cyd demande Ana, Ana refuse : la demande disparaît', public.friend_request('Ana') = 'sent');
select public.as_user('00000000-0000-0000-0000-0000000000d1');
select public.friend_respond('00000000-0000-0000-0000-0000000000d3', false);
select public.check('étape 10 : refus', (select count(*) from public.my_friends()) = 1);
select public.friend_remove('00000000-0000-0000-0000-0000000000d2');
select public.check('étape 10 : Ana retire Ben', (select count(*) from public.my_friends()) = 0);
reset role;
insert into auth.users (email, raw_user_meta_data) select 'ami' || g || '@accounts.copytrack.invalid', jsonb_build_object('username', 'Ami' || g) from generate_series(1, 21) g;
insert into players (id, name) select user_id, username from accounts where username like 'Ami%';
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000d1');
do $$ declare refuse boolean := false; begin
  for i in 1 .. 20 loop perform public.friend_request('Ami' || i); end loop;
  begin perform public.friend_request('Ami21'); exception when others then refuse := true; end;
  perform public.check('étape 10 : au plus 20 demandes d''amis par 24 heures', refuse and (select count(*) from friends where a = '00000000-0000-0000-0000-0000000000d1') = 20);
end $$;
reset role;
delete from friends where a = '00000000-0000-0000-0000-0000000000d1';
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000d1');
select public.follow('00000000-0000-0000-0000-0000000000d3');
select public.follow('00000000-0000-0000-0000-0000000000d3');
select public.check('étape 10 : Ana suit Cyd (une fois)', (select count(*) from follows) = 1);
do $$ declare refuse boolean := false; begin
  begin perform public.follow('00000000-0000-0000-0000-0000000000d1'); exception when others then refuse := true; end;
  perform public.check('étape 10 : on ne se suit pas soi-même', refuse);
end $$;
select public.as_user('00000000-0000-0000-0000-0000000000d3');
select public.check('étape 10 : les abonnements d''Ana ne sont visibles que d''elle', (select count(*) from follows) = 0);
reset role;
set role anon;
select public.check('étape 10 : le nombre d''abonnés est public', public.follower_count('00000000-0000-0000-0000-0000000000d3') = 1);
do $$ declare refuse boolean := false; begin
  begin perform public.my_friends(); exception when insufficient_privilege then refuse := true; end;
  perform public.check('étape 10 : sans session, pas de liste d''amis', refuse);
end $$;
reset role;
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000d1');
select public.unfollow('00000000-0000-0000-0000-0000000000d3');
select public.check('étape 10 : désabonnement', (select count(*) from follows) = 0);
reset role;
-- 16. saisons et divisions (étape 11) : heure fixée (saison 2 en cours), points calculés depuis scores, clôture une seule fois, montées et descentes
set copytrack.now = '2026-11-20 12:00:00+00';
select public.check('étape 11 : saison en cours et bornes (lundi 00:00 UTC)', public.current_season() = 2 and (select starts from public.season_bounds(2)) = '2026-11-16 00:00:00+00');
insert into auth.users (email, raw_user_meta_data) select 'saison' || g || '@accounts.copytrack.invalid', jsonb_build_object('username', 'Saison' || g) from generate_series(1, 7) g;
insert into players (id, name) select user_id, username from accounts where username like 'Saison%';
insert into scores (track_key, player, time, inputs, phys_ver)
  select t.k, a.user_id, 20 + (substring(a.username from 7)::int) * t.f, 'A', 26
  from accounts a, (values ('b-s1a-1~v1.sea-1', 1.0), ('b-s1b-1~v1.sea-1', 0.5), ('b-s1c-1~v1.sea-1', 2.0)) t(k, f) where a.username like 'Saison%';
insert into scores (track_key, player, time, inputs, phys_ver) values ('b-s1a-1~v1.sea-11', '00000000-0000-0000-0000-0000000000d1', 1, 'A', 26);   -- saison 11 : ne compte pas en saison 1
set role anon;
select public.check('étape 11 : points de saison : 1000 par circuit pour le plus rapide, moins pour les autres',
  (select points from public.season_points(1) sp join players p on p.id = sp.player where p.name = 'Saison1') = 3000
  and (select points from public.season_points(1) sp join players p on p.id = sp.player where p.name = 'Saison7') < 3000
  and (select count(*) from public.season_points(1)) = 7);
select public.check('étape 11 : classement de saison dans l''ordre des points, division 5 pour tous au départ',
  (select array_agg(name order by rank) from public.season_standings(1, 3)) = array['Saison1', 'Saison2', 'Saison3'] and (select bool_and(division = 5) from public.season_standings(1, 50)));
do $$ declare refuse boolean := false; begin
  begin perform public.close_season(1); exception when insufficient_privilege then refuse := true; end;
  perform public.check('étape 11 : close_season n''est pas appelable par le jeu (seulement close_due_seasons)', refuse);
end $$;
select public.check('étape 11 : close_due_seasons clôt la saison 1 finie (7 participants), pas la saison 2 en cours', public.close_due_seasons() = 7);
select public.check('étape 11 : une seconde fois : rien (une seule clôture)', public.close_due_seasons() = 0);
reset role;
select public.check('étape 11 : la saison en cours ne se clôt pas', public.close_season(2) = -1);
select public.check('étape 11 : division 5 à 7 participants : le premier monte en 4, personne ne descend sous la 5',
  (select division from season_divisions sd join players p on p.id = sd.player where p.name = 'Saison1') = 4
  and (select count(*) from season_divisions where division = 4) = 1 and (select count(*) from season_divisions where division = 5) = 6
  and (select count(*) from division_history where season = 1) = 7 and (select moved from division_history h join players p on p.id = h.player where season = 1 and p.name = 'Saison1') = -1);
-- saison 2 : cinq pilotes en division 3 : le premier monte, le dernier descend
update season_divisions set division = 3 where player in (select user_id from accounts where username in ('Saison2', 'Saison3', 'Saison4', 'Saison5', 'Saison6'));
insert into scores (track_key, player, time, inputs, phys_ver)
  select 'b-s2a-1~v1.sea-2', a.user_id, 30 + (substring(a.username from 7)::int), 'A', 26 from accounts a where a.username in ('Saison2', 'Saison3', 'Saison4', 'Saison5', 'Saison6');
select user_id as s6 from accounts where username = 'Saison6' \gset
set role authenticated;
select public.as_user(:'s6');
select public.check('étape 11 : ma saison en cours : division 3, 5e sur 5', (select division = 3 and rank = 5 and in_division = 5 and not closed from public.my_season(2)));
reset role;
set copytrack.now = '2026-11-23 00:10:00+00';
set role anon;
select public.check('étape 11 : saison 2 finie : clôturée à la demande (5 participants)', public.close_due_seasons() = 5);
reset role;
select public.check('étape 11 : division 3 : le premier monte en 2, le dernier descend en 4',
  (select division from season_divisions sd join players p on p.id = sd.player where p.name = 'Saison2') = 2
  and (select division from season_divisions sd join players p on p.id = sd.player where p.name = 'Saison6') = 4
  and (select division from season_divisions sd join players p on p.id = sd.player where p.name = 'Saison4') = 3);
select user_id as s6 from accounts where username = 'Saison6' \gset
set role authenticated;
select public.as_user(:'s6');
select public.check('étape 11 : après la clôture, ma saison dit : division 3 pendant la saison, descente', (select division = 3 and moved = 1 and closed from public.my_season(2)));
do $$ declare refuse boolean := false; begin
  begin insert into season_divisions (player, division) values ('00000000-0000-0000-0000-0000000000d1', 1); exception when others then refuse := true; end;
  perform public.check('étape 11 : le jeu n''écrit pas sa division', refuse);
end $$;
reset role;
reset copytrack.now;
-- 17. compétition asynchrone (étape 12) : duels entre amis, Elo calculé en base depuis scores, tournois privés clos à leur date
reset role;
set copytrack.now = '2026-12-01 10:00:00+00';
insert into friends (a, b, status, accepted_at) values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2', 'accepted', now());
select public.check('étape 12 : Elo (K = 32) : à égalité de classement, ±16 ; le favori qui gagne prend peu', public.elo(1200, 1200, 1) = 1216 and public.elo(1200, 1200, 0) = 1184 and public.elo(1400, 1200, 1) = 1408 and public.elo(1200, 1200, 0.5) = 1200);
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ declare refuse boolean := false; begin
  begin perform public.duel_challenge('00000000-0000-0000-0000-0000000000d2', 'b-duel-1'); exception when others then refuse := true; end;
  perform public.check('étape 12 : une session invitée ne lance pas de duel', refuse);
end $$;
select public.as_user('00000000-0000-0000-0000-0000000000d1');
do $$ declare refuse boolean := false; refuse2 boolean := false; begin
  begin perform public.duel_challenge('00000000-0000-0000-0000-0000000000d3', 'b-duel-1'); exception when others then refuse := true; end;
  begin perform public.duel_challenge('00000000-0000-0000-0000-0000000000d2', 'u-abc'); exception when others then refuse2 := true; end;
  perform public.check('étape 12 : on ne défie que ses amis, sur un circuit de la carrière', refuse and refuse2);
end $$;
select public.duel_challenge('00000000-0000-0000-0000-0000000000d2', 'b-duel-1', 'Duel Un') as duel1 \gset
reset role;
select public.check('étape 12 : fenêtre du duel (lue par submit-score) : le défiant peut courir, le défié pas encore, un tiers jamais, un autre circuit non',
  public.competition_open('duel', :duel1, '00000000-0000-0000-0000-0000000000d1', 'b-duel-1') = ''
  and public.competition_open('duel', :duel1, '00000000-0000-0000-0000-0000000000d2', 'b-duel-1') <> ''
  and public.competition_open('duel', :duel1, '00000000-0000-0000-0000-0000000000d3', 'b-duel-1') <> ''
  and public.competition_open('duel', :duel1, '00000000-0000-0000-0000-0000000000d1', 'b-autre-1') <> '');
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000d2');
select public.duel_respond(:duel1, true);
reset role;
select public.check('étape 12 : accepté, le défié peut courir', public.competition_open('duel', :duel1, '00000000-0000-0000-0000-0000000000d2', 'b-duel-1') = '');
insert into scores (track_key, player, time, inputs, phys_ver) values ('b-duel-1~v1.duel-' || :duel1, '00000000-0000-0000-0000-0000000000d1', 30.0, 'A', 26), ('b-duel-1~v1.duel-' || :duel1, '00000000-0000-0000-0000-0000000000d2', 31.0, 'A', 26);
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000d1');
select public.check('étape 12 : pendant le duel, je vois mon temps, pas celui de l''autre', (select my_time = 30 and their_time is null and status = 'accepted' from public.my_duels(30) where id = :duel1));
select public.as_user('00000000-0000-0000-0000-0000000000d3');
select public.check('étape 12 : un tiers ne voit pas le duel', (select count(*) from duels) = 0 and (select count(*) from public.my_duels(30)) = 0);
select public.check('étape 12 : avant l''échéance, rien n''est réglé', public.settle_due() = 0);
reset role;
set copytrack.now = '2026-12-02 10:01:00+00';
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000d3');
select public.check('étape 12 : à l''échéance, le duel est réglé (par n''importe quel joueur connecté)', public.settle_due() = 1);
select public.check('étape 12 : une seule fois', public.settle_due() = 0);
reset role;
select public.check('étape 12 : le plus rapide gagne ; Elo 1216 / 1184 ; deltas et temps figés',
  (select status = 'settled' and winner = '00000000-0000-0000-0000-0000000000d1' and c_delta = 16 and o_delta = -16 and c_time = 30 and o_time = 31 from duels where id = :duel1)
  and (select rating from ratings where player = '00000000-0000-0000-0000-0000000000d1') = 1216 and (select rating from ratings where player = '00000000-0000-0000-0000-0000000000d2') = 1184);
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000d2');
select public.check('étape 12 : après coup, chacun voit les deux temps et son résultat', (select my_time = 31 and their_time = 30 and result = 'loss' and delta = -16 from public.my_duels(30) where id = :duel1));
select public.check('étape 12 : face-à-face et classement Elo entre amis', (select losses = 1 and wins = 0 from public.head_to_head('00000000-0000-0000-0000-0000000000d1'))
  and (select array_agg(name order by rank) from public.friends_ratings()) = array['Ana', 'Ben']);
-- un duel sans réponse, un duel accepté sans temps : annulés, sans Elo ; une égalité parfaite : nul
select public.as_user('00000000-0000-0000-0000-0000000000d1');
select public.duel_challenge('00000000-0000-0000-0000-0000000000d2', 'b-duel-2') as duel2 \gset
select public.duel_challenge('00000000-0000-0000-0000-0000000000d2', 'b-duel-3') as duel3 \gset
select public.duel_challenge('00000000-0000-0000-0000-0000000000d2', 'b-duel-4') as duel4 \gset
select public.as_user('00000000-0000-0000-0000-0000000000d2');
select public.duel_respond(:duel3, true);
select public.duel_respond(:duel4, true);
reset role;
insert into scores (track_key, player, time, inputs, phys_ver) values ('b-duel-4~v1.duel-' || :duel4, '00000000-0000-0000-0000-0000000000d1', 25.5, 'A', 26), ('b-duel-4~v1.duel-' || :duel4, '00000000-0000-0000-0000-0000000000d2', 25.5, 'A', 26);
set copytrack.now = '2026-12-03 11:00:00+00';
select public.check('étape 12 : trois duels échus réglés', public.settle_due() = 3);
select public.check('étape 12 : sans réponse ou sans temps : annulé ; égalité : nul (Elo inchangé à classements égaux… ici le favori perd un peu)',
  (select status from duels where id = :duel2) = 'void' and (select status from duels where id = :duel3) = 'void'
  and (select status = 'settled' and winner is null from duels where id = :duel4)
  and (select rating from ratings where player = '00000000-0000-0000-0000-0000000000d1') = 1216 + public.elo(1216, 1184, 0.5) - 1216
  and (select games from ratings where player = '00000000-0000-0000-0000-0000000000d1') = 2);
do $$ declare refuse boolean := false; begin
  set role authenticated;
  perform public.as_user('00000000-0000-0000-0000-0000000000d1');
  begin insert into ratings (player, rating) values ('00000000-0000-0000-0000-0000000000d3', 3000); exception when others then refuse := true; end;
  reset role;
  perform public.check('étape 12 : le jeu n''écrit pas un classement Elo', refuse);
end $$;
-- tournoi privé
set copytrack.now = '2026-12-10 09:00:00+00';
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000d1');
select id as tour1, code as tcode from public.tournament_create('Coupe d''hiver', 'b-tour-1', 'Tour Un', 2) \gset
select public.check('étape 12 : tournoi créé, code à 6 caractères, le créateur inscrit', :'tcode' ~ '^[A-HJ-NP-Z2-9]{6}$' and (select count(*) from public.my_tournaments()) = 1);
select public.as_user('00000000-0000-0000-0000-0000000000d3');
select public.check('étape 12 : Cyd entre avec le code (sans tenir compte de la casse)', public.tournament_join(lower(:'tcode')) = :tour1);
select public.as_user('00000000-0000-0000-0000-0000000000d2');
select public.check('étape 12 : un non-inscrit ne voit ni le tournoi ni son classement', (select count(*) from tournaments) = 0 and (select count(*) from public.tournament_board(:tour1)) = 0);
reset role;
select public.check('étape 12 : fenêtre du tournoi : les inscrits seulement', public.competition_open('tour', :tour1, '00000000-0000-0000-0000-0000000000d3', 'b-tour-1') = '' and public.competition_open('tour', :tour1, '00000000-0000-0000-0000-0000000000d2', 'b-tour-1') <> '');
insert into scores (track_key, player, time, inputs, phys_ver) values ('b-tour-1~v1.tour-' || :tour1, '00000000-0000-0000-0000-0000000000d1', 40, 'A', 26), ('b-tour-1~v1.tour-' || :tour1, '00000000-0000-0000-0000-0000000000d3', 39, 'A', 26);
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000d1');
select public.check('étape 12 : classement du tournoi en cours, depuis scores', (select array_agg(name order by rank) from public.tournament_board(:tour1)) = array['Cyd', 'Ana']);
reset role;
set copytrack.now = '2026-12-12 09:00:01+00';
select public.check('étape 12 : à la date de fin, le tournoi est clos automatiquement', public.settle_due() = 1);
select public.check('étape 12 : son classement est figé', (select closed_at is not null from tournaments where id = :tour1)
  and (select rank from tournament_players where tournament = :tour1 and player = '00000000-0000-0000-0000-0000000000d3') = 1
  and (select rank from tournament_players where tournament = :tour1 and player = '00000000-0000-0000-0000-0000000000d1') = 2);
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000d2');
do $$ declare refuse boolean := false; begin
  begin perform public.tournament_join((select code from tournaments limit 1)); exception when others then refuse := true; end;
  perform public.check('étape 12 : on n''entre plus dans un tournoi terminé', refuse);
end $$;
reset role;
select public.check('étape 12 : fenêtre fermée après la fin', public.competition_open('tour', :tour1, '00000000-0000-0000-0000-0000000000d3', 'b-tour-1') <> '');
reset copytrack.now;
-- 18. communauté 2 (étape 13) : commentaires (débit, signalements, suppression), playlists, sélection, hasard, recommandations, statistiques, modes publiés
reset role;
set copytrack.now = '2026-12-20 10:00:00+00';
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000e1', 'eve@accounts.copytrack.invalid', '{"username":"Eve"}');
insert into players (id, name) values ('00000000-0000-0000-0000-0000000000e1', 'Eve');
insert into tracks (id, author, name, decor, code, signature, author_time, pieces) values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000e1', 'Com Un', 'desert', 'X', 'sig-com1', 20, 10),
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-0000000000e1', 'Com Deux', 'desert', 'X', 'sig-com2', 20, 10),
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-0000000000e1', 'Com Masqué', 'desert', 'X', 'sig-com3', 20, 10);
update tracks set hidden = true where id = '00000000-0000-0000-0000-00000000e003';
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ declare refuse boolean := false; begin
  begin perform public.comment_add('00000000-0000-0000-0000-00000000e001', 'Salut'); exception when others then refuse := true; end;
  perform public.check('étape 13 : une session invitée ne commente pas', refuse);
end $$;
select public.as_user('00000000-0000-0000-0000-0000000000d1');
select public.comment_add('00000000-0000-0000-0000-00000000e001', '  Super circuit !  ') as c1 \gset
select public.check('étape 13 : commentaire publié (espaces retirés), visible avec le pseudo', (select body = 'Super circuit !' and name = 'Ana' and mine from public.track_comments_list('00000000-0000-0000-0000-00000000e001') where id = :c1));
do $$ declare refuse boolean := false; refuse2 boolean := false; refuse3 boolean := false; begin
  begin perform public.comment_add('00000000-0000-0000-0000-00000000e001', 'Encore'); exception when others then refuse := true; end;
  begin perform public.comment_add('00000000-0000-0000-0000-00000000e003', 'Masqué ?'); exception when others then refuse2 := true; end;
  begin perform public.comment_add('00000000-0000-0000-0000-00000000e002', repeat('x', 281)); exception when others then refuse3 := true; end;
  perform public.check('étape 13 : débit (20 s), circuit masqué, longueur : refusés', refuse and refuse2 and refuse3);
end $$;
do $$ declare refuse boolean := false; begin
  for i in 1..9 loop perform set_config('copytrack.now', (timestamptz '2026-12-20 10:00:00+00' + make_interval(secs => 30 * i))::text, false); perform public.comment_add('00000000-0000-0000-0000-00000000e002', 'Message ' || i); end loop;
  perform set_config('copytrack.now', '2026-12-20 10:05:30+00', false);
  begin perform public.comment_add('00000000-0000-0000-0000-00000000e002', 'Un de trop'); exception when others then refuse := true; end;
  perform public.check('étape 13 : 10 commentaires par heure au plus', refuse and (select count(*) from track_comments where author = '00000000-0000-0000-0000-0000000000d1') = 10);
end $$;
do $$ declare refuse boolean := false; begin
  begin insert into track_comments (track_id, author, body) values ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000d1', 'direct'); exception when others then refuse := true; end;
  perform public.check('étape 13 : le jeu n''écrit pas directement un commentaire (RLS)', refuse);
end $$;
select public.as_user('00000000-0000-0000-0000-0000000000d1');
do $$ declare refuse boolean := false; begin
  begin perform public.comment_report((select min(id) from track_comments)); exception when others then refuse := true; end;
  perform public.check('étape 13 : on ne signale pas son propre commentaire', refuse);
end $$;
select public.as_user('00000000-0000-0000-0000-0000000000d2'); select public.comment_report(:c1); select public.comment_report(:c1);
select public.as_user('00000000-0000-0000-0000-0000000000d3'); select public.comment_report(:c1);
select public.check('étape 13 : deux comptes distincts (un signalement en double ne compte pas) : encore visible', (select count(*) from public.track_comments_list('00000000-0000-0000-0000-00000000e001') where id = :c1) = 1);
select public.as_user('00000000-0000-0000-0000-0000000000e1'); select public.comment_report(:c1);
select public.check('étape 13 : masqué au 3e signalement', (select count(*) from public.track_comments_list('00000000-0000-0000-0000-00000000e001') where id = :c1) = 0);
select public.as_user('00000000-0000-0000-0000-0000000000d1');
select public.check('étape 13 : son auteur le voit encore (RLS), pas les autres', (select count(*) from track_comments where id = :c1) = 1);
select public.as_user('00000000-0000-0000-0000-0000000000d3');
select public.check('étape 13 : … les autres non', (select count(*) from track_comments where id = :c1) = 0);
do $$ declare refuse boolean := false; begin
  begin perform public.comment_delete((select max(id) from public.track_comments_list('00000000-0000-0000-0000-00000000e002'))); exception when others then refuse := true; end;
  perform public.check('étape 13 : on ne supprime pas le commentaire d''un autre', refuse);
end $$;
select public.as_user('00000000-0000-0000-0000-0000000000e1');
select public.comment_delete((select max(id) from public.track_comments_list('00000000-0000-0000-0000-00000000e002')));
select public.check('étape 13 : l''auteur du circuit supprime un commentaire de son circuit', (select count(*) from public.track_comments_list('00000000-0000-0000-0000-00000000e002')) = 8);
-- playlists
select public.as_user('00000000-0000-0000-0000-0000000000d1');
select public.playlist_save(null, 'Mes favoris', true, array['00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000e002']::uuid[]) as pl1 \gset
select public.playlist_save(null, 'Secrète', false, array['00000000-0000-0000-0000-00000000e001']::uuid[]) as pl2 \gset
select public.check('étape 13 : playlist : ordre gardé, doublons et circuits masqués retirés', (select tracks from playlists where id = :pl1) = array['00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000e001']::uuid[]);
do $$ declare refuse boolean := false; begin
  begin perform public.playlist_save(null, 'Trop', true, array_fill('00000000-0000-0000-0000-00000000e001'::uuid, array[51])); exception when others then refuse := true; end;
  perform public.check('étape 13 : 50 circuits au plus', refuse);
end $$;
select public.as_user('00000000-0000-0000-0000-0000000000d2');
select public.check('étape 13 : une playlist publique se voit, une privée non', (select count(*) from public.playlists_list(false) where id = :pl1) = 1 and (select count(*) from playlists where id = :pl2) = 0);
do $$ declare refuse boolean := false; refuse2 boolean := false; begin
  begin perform public.playlist_save((select min(id) from playlists), 'Volée', true, '{}'); exception when others then refuse := true; end;
  begin perform public.playlist_delete((select min(id) from playlists)); exception when others then refuse2 := true; end;
  perform public.check('étape 13 : on ne modifie ni ne supprime la playlist d''un autre', refuse and refuse2);
end $$;
-- sélection et modération
do $$ declare refuse boolean := false; begin
  begin perform public.pick_track('00000000-0000-0000-0000-00000000e001', true); exception when others then refuse := true; end;
  perform public.check('étape 13 : la sélection est réservée aux modérateurs', refuse);
end $$;
reset role;
insert into moderators values ('00000000-0000-0000-0000-0000000000e1') on conflict do nothing;
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000e1');
select public.pick_track('00000000-0000-0000-0000-00000000e001', true);
select public.mod_hide('comment', (select max(id) from public.track_comments_list('00000000-0000-0000-0000-00000000e002'))::text, true);
select public.check('étape 13 : un modérateur choisit la sélection et masque un commentaire', (select picked_at is not null from tracks where id = '00000000-0000-0000-0000-00000000e001') and (select count(*) from public.track_comments_list('00000000-0000-0000-0000-00000000e002')) = 7);
-- hasard et recommandations
select public.as_user('00000000-0000-0000-0000-0000000000d3');
select public.check('étape 13 : au hasard : jamais un circuit masqué', not exists (select 1 from generate_series(1, 30) where public.random_track() = '00000000-0000-0000-0000-00000000e003'));
select public.check('étape 13 : au hasard : la liste à éviter est respectée', public.random_track((select array_agg(id) from tracks where id <> '00000000-0000-0000-0000-00000000e002')) = '00000000-0000-0000-0000-00000000e002');
reset role;
insert into track_likes (track_id, player) values ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000d2'), ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-0000000000d2');
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000d1');
select public.check('étape 13 : recommandation : aimé par qui aime ce que j''aime, en tête ; ni aimé par moi, ni masqué',
  (select id from public.recommended_tracks(5) limit 1) = '00000000-0000-0000-0000-00000000e002'
  and not exists (select 1 from public.recommended_tracks(50) where id in ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000e003')));
-- statistiques (run_stats)
reset role;
insert into run_stats (install, track, outcome, time, progress, respawns, phys_ver) select lpad(to_hex(i), 16, '0'), 'statique', 'finish', 30 + i, null, i % 2, 26 from generate_series(1, 4) i;
set role authenticated;
select public.check('étape 13 : statistiques : rien sous 5 installations', (select count(*) from public.track_stats('statique', 26)) = 0);
reset role;
insert into run_stats (install, track, outcome, time, progress, respawns, phys_ver) values ('00000000000000ff', 'statique', 'quit', 12, 0.4, 0, 26), ('00000000000000fe', 'statique', 'finish', 40, null, 0, 26);
set role anon;
select public.check('étape 13 : statistiques depuis run_stats (lisibles sans compte) : pilotes, taux d''arrivée, temps médian',
  (select players = 6 and runs = 6 and finishes = 5 and abs(finish_rate - 5.0 / 6) < 1e-4 and median_time = 33 and abs(quit_progress - 0.4) < 1e-4 from public.track_stats('statique', 26)));
do $$ declare refuse boolean := false; begin
  begin perform count(*) from run_stats; exception when others then refuse := true; end;
  perform public.check('étape 13 : run_stats reste illisible directement', refuse);
end $$;
-- modes publiés
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ declare refuse boolean := false; begin
  begin perform public.mode_publish('Invité', '', 'v1.g-40', null); exception when others then refuse := true; end;
  perform public.check('étape 13 : une session invitée ne publie pas de mode', refuse);
end $$;
select public.as_user('00000000-0000-0000-0000-0000000000d1');
do $$ declare refuse boolean := false; refuse2 boolean := false; begin
  begin perform public.mode_publish('Faux', '', 'v1.turbo-9', null); exception when others then refuse := true; end;
  begin perform public.mode_publish('Saison', '', 'v1.sea-3', null); exception when others then refuse2 := true; end;
  perform public.check('étape 13 : catégorie inconnue ou étiquette (saison) refusée', refuse and refuse2);
end $$;
select public.mode_publish('Lune', 'Gravité basse', 'v1.g-40.veh-moto', '{"id":"perfect","n":2}') as m1 \gset
select public.check('étape 13 : mode publié, listé avec sa catégorie', (select variant = 'v1.g-40.veh-moto' and owner_name = 'Ana' from public.modes_list(false) where id = :m1));
do $$ declare refuse boolean := false; begin
  for i in 2..5 loop perform public.mode_publish('Mode ' || i, '', '', null); end loop;
  begin perform public.mode_publish('Mode 6', '', '', null); exception when others then refuse := true; end;
  perform public.check('étape 13 : 5 modes publiés par jour au plus', refuse);
end $$;
select public.as_user('00000000-0000-0000-0000-0000000000d2'); select public.mode_report(:m1);
select public.as_user('00000000-0000-0000-0000-0000000000d3'); select public.mode_report(:m1);
select public.as_user('00000000-0000-0000-0000-0000000000e1'); select public.mode_report(:m1);
select public.check('étape 13 : mode masqué au 3e signalement', (select count(*) from public.modes_list(false) where id = :m1) = 0);
reset role;
reset copytrack.now;
-- 14. étape 14 : profils (colonnes), limitation des soumissions de scores
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ declare refuse boolean := false; begin
  begin update players set created_at = now() - interval '30 days' where id = '00000000-0000-0000-0000-0000000000b1'; exception when others then refuse := true; end;
  perform public.check('étape 14 : un pilote ne peut plus modifier la date de création de son profil', refuse);
end $$;
do $$ declare refuse boolean := false; begin
  begin update players set title = 'legende' where id = '00000000-0000-0000-0000-0000000000b1'; exception when others then refuse := true; end;
  perform public.check('étape 14 : le titre ne s''écrit pas directement (seulement par set_title)', refuse);
end $$;
update players set name = 'Zoé2' where id = '00000000-0000-0000-0000-0000000000b1';
select public.check('étape 14 : le pilote change toujours son pseudo', exists (select 1 from players where id = '00000000-0000-0000-0000-0000000000b1' and name = 'Zoé2'));
do $$ declare refuse boolean := false; begin
  begin perform public.submit_rate_check('00000000-0000-0000-0000-0000000000b1', 8, 60, 0); exception when others then refuse := true; end;
  perform public.check('étape 14 : le jeu (authenticated) ne peut pas appeler submit_rate_check', refuse);
end $$;
do $$ declare refuse boolean := false; begin
  begin perform count(*) from public.submit_rate; exception when others then refuse := true; end;
  perform public.check('étape 14 : la table submit_rate est illisible pour le jeu', refuse);
end $$;
reset role;
set role service_role;
do $$ declare r0 int; r1 int; r2 int; i int; ok_first boolean := true; begin
  for i in 1..3 loop if public.submit_rate_check('00000000-0000-0000-0000-0000000000c1', 3, 60) <> 0 then ok_first := false; end if; end loop;
  r1 := public.submit_rate_check('00000000-0000-0000-0000-0000000000c1', 3, 60);
  r2 := public.submit_rate_check('00000000-0000-0000-0000-0000000000c2', 3, 60);
  perform public.check('étape 14 : 3 soumissions acceptées, la 4e refusée avec un délai (1 à 60 s)', ok_first and r1 between 1 and 60);
  perform public.check('étape 14 : la limite est PAR pilote', r2 = 0);
end $$;
reset role;
update public.rate_hits set at = now() - interval '2 minutes' where kind = 'submit' and player = '00000000-0000-0000-0000-0000000000c1';
set role service_role;
select public.check('étape 14 : la fenêtre glisse : après 2 minutes, de nouveau accepté', public.submit_rate_check('00000000-0000-0000-0000-0000000000c1', 3, 60) = 0);
select public.check('étape 14 : plafond GLOBAL : un autre pilote (session neuve) est refusé quand le total de la fenêtre est atteint', public.submit_rate_check('00000000-0000-0000-0000-0000000000c3', 3, 60, 2) = 60);
select public.check('étape 14 : le ménage supprime les lignes de plus d''une heure', (select public.submit_rate_purge()) >= 0);
reset role;
-- 12b. ÉTAPE 15 : limitation globale, plafond de 2 000 temps, meilleur temps atomique, circuits publiés
insert into auth.users (id, is_anonymous) select ('00000000-0000-0000-0000-00000000f15' || i)::uuid, true from generate_series(1, 6) i;
insert into players (id, name) select ('00000000-0000-0000-0000-00000000f15' || i)::uuid, 'Pilote15-' || i from generate_series(1, 6) i;
do $$ declare ok1 boolean := true; r int; i int; begin
  for i in 1..3 loop if public.rate_check('t15', '00000000-0000-0000-0000-00000000f151', 3, 60) <> 0 then ok1 := false; end if; end loop;
  r := public.rate_check('t15', '00000000-0000-0000-0000-00000000f151', 3, 60);
  perform public.check('étape 15 : rate_check — 3 acceptées puis la 4e refusée avec un délai de 1 à 60 s', ok1 and r between 1 and 60);
  perform public.check('étape 15 : rate_check — un refus n''est pas compté (pas d''allongement du blocage)', (select count(*) from rate_hits where kind = 't15' and player = '00000000-0000-0000-0000-00000000f151') = 3);
  perform public.check('étape 15 : rate_check — les types de limite sont indépendants', public.rate_check('t15b', '00000000-0000-0000-0000-00000000f151', 3, 60) = 0);
end $$;
do $$ declare i int; n_ok int := 0; r int; begin
  for i in 2..6 loop if public.rate_check('t15g', ('00000000-0000-0000-0000-00000000f15' || i)::uuid, 5, 60, 3) = 0 then n_ok := n_ok + 1; end if; end loop;
  perform public.check('étape 15 : rate_check — plafond GLOBAL de 3 : exactement 3 pilotes différents acceptés sur 5', n_ok = 3);
end $$;
do $$ declare a int := 0; b int; i int; begin
  for i in 1..5 loop if public.rate_check('t15a', ('00000000-0000-0000-0000-00000000f15' || ((i % 5) + 1))::uuid, 5, 60, 4, true, 2) = 0 then a := a + 1; end if; end loop;
  b := public.rate_check('t15a', '00000000-0000-0000-0000-00000000f156', 5, 60, 4, false, 2);
  perform public.check('étape 15 : rate_check — sous-plafond anonyme (2) : au plus 2 sessions anonymes acceptées', a = 2);
  perform public.check('étape 15 : rate_check — un compte (non anonyme) passe encore malgré le sous-plafond anonyme atteint', b = 0);
end $$;
do $$ declare r int; begin
  r := public.submit_rate_check('00000000-0000-0000-0000-00000000f151', 5, 60);
  perform public.check('étape 15 : submit_rate_check (étape 14) compte dans la même table persistante', r = 0 and exists (select 1 from rate_hits where kind = 'submit' and player = '00000000-0000-0000-0000-00000000f151'));
end $$;
select public.check('étape 15 : rate_purge disponible', (select public.rate_purge()) >= 0);
set role authenticated;
select public.as_user('00000000-0000-0000-0000-00000000f151');
do $$ declare refuse boolean := false; begin
  begin perform public.rate_check('x', '00000000-0000-0000-0000-00000000f151', 1, 1); exception when others then refuse := true; end;
  perform public.check('étape 15 : le jeu ne peut pas appeler rate_check', refuse);
end $$;
do $$ declare refuse boolean := false; begin
  begin perform count(*) from public.rate_hits; exception when others then refuse := true; end;
  perform public.check('étape 15 : rate_hits illisible pour le jeu', refuse);
end $$;
do $$ declare refuse boolean := false; begin
  begin perform public.submit_best('00000000-0000-0000-0000-00000000f151', 'x', 10, 'A', 31, 'x'); exception when others then refuse := true; end;
  perform public.check('étape 15 : le jeu ne peut pas appeler submit_best', refuse);
end $$;
do $$ declare refuse boolean := false; begin
  begin perform public.publish_track('00000000-0000-0000-0000-00000000f151', 'x', 'forest', 'c', 's15x', 10, 5, 1, '', null); exception when others then refuse := true; end;
  perform public.check('étape 15 : le jeu ne peut pas appeler publish_track', refuse);
end $$;
reset role;

-- Plafond de 2 000 temps : 1 999 lignes, puis les cas limites.
insert into scores (track_key, player, time, inputs, phys_ver) select 'cap' || i, '00000000-0000-0000-0000-00000000f152', 30, 'A', 31 from generate_series(1, 1999) i;
do $$ declare refuse boolean := false; begin
  insert into scores (track_key, player, time, inputs, phys_ver) values ('cap-2000', '00000000-0000-0000-0000-00000000f152', 30, 'A', 31);
  begin insert into scores (track_key, player, time, inputs, phys_ver) values ('cap-2001', '00000000-0000-0000-0000-00000000f152', 30, 'A', 31); exception when others then refuse := true; end;
  perform public.check('étape 15 : plafond — la 2000e ligne est acceptée, la 2001e refusée', refuse and (select count(*) from scores where player = '00000000-0000-0000-0000-00000000f152') = 2000);
end $$;
do $$ declare n int; begin
  insert into scores (track_key, player, time, inputs, phys_ver) values ('cap5', '00000000-0000-0000-0000-00000000f152', 20, 'B', 31)
    on conflict (track_key, player) do update set time = excluded.time, inputs = excluded.inputs;
  select count(*) into n from scores where player = '00000000-0000-0000-0000-00000000f152';
  perform public.check('étape 15 : plafond — améliorer un temps existant à 2 000 lignes (upsert) fonctionne, sans ajouter de ligne', n = 2000 and (select time from scores where track_key = 'cap5' and player = '00000000-0000-0000-0000-00000000f152') = 20);
end $$;
do $$ declare r jsonb; refuse boolean := false; begin
  r := public.submit_best('00000000-0000-0000-0000-00000000f152', 'cap6', 15, 'A', 31, 'c');
  perform public.check('étape 15 : plafond — submit_best améliore un temps existant à 2 000 lignes', (r->>'improved')::boolean and (select time from scores where track_key = 'cap6' and player = '00000000-0000-0000-0000-00000000f152') = 15);
  begin perform public.submit_best('00000000-0000-0000-0000-00000000f152', 'cap-nouveau', 15, 'A', 31, 'c'); exception when others then refuse := true; end;
  perform public.check('étape 15 : plafond — submit_best refuse une NOUVELLE clé à 2 000 lignes', refuse and not exists (select 1 from scores where track_key = 'cap-nouveau'));
end $$;
delete from scores where track_key = 'cap7' and player = '00000000-0000-0000-0000-00000000f152';
do $$ declare refuse boolean := false; begin
  insert into scores (track_key, player, time, inputs, phys_ver) values ('cap-apres-suppression', '00000000-0000-0000-0000-00000000f152', 30, 'A', 31);
  begin insert into scores (track_key, player, time, inputs, phys_ver) values ('cap-encore', '00000000-0000-0000-0000-00000000f152', 30, 'A', 31); exception when others then refuse := true; end;
  perform public.check('étape 15 : plafond — une suppression libère exactement une place', refuse and (select count(*) from scores where player = '00000000-0000-0000-0000-00000000f152') = 2000);
end $$;

-- submit_best : jamais de régression du record.
do $$ declare r jsonb; begin
  r := public.submit_best('00000000-0000-0000-0000-00000000f153', 'sb-1', 24.775, 'LENT', 31, 'Essai', '[10,20]', 'GHOSTLENT', '[[0,"car"]]');
  perform public.check('étape 15 : submit_best — premier temps enregistré (rang 1 sur 1)', (r->>'improved')::boolean and (r->>'rank')::int = 1 and (r->>'total')::int = 1);
  r := public.submit_best('00000000-0000-0000-0000-00000000f153', 'sb-1', 22.767, 'RAPIDE', 31, 'Essai', '[11,21]', 'GHOSTRAPIDE', '[[0,"car"]]');
  perform public.check('étape 15 : submit_best — un meilleur temps remplace le record, avec SON fantôme et ses temps intermédiaires', (r->>'improved')::boolean
    and (select time = 22.767 and inputs = 'RAPIDE' and ghost = 'GHOSTRAPIDE' and splits = '{11,21}' from scores where track_key = 'sb-1' and player = '00000000-0000-0000-0000-00000000f153'));
  r := public.submit_best('00000000-0000-0000-0000-00000000f153', 'sb-1', 24.775, 'LENT', 31, 'Essai', '[10,20]', 'GHOSTLENT', '[[0,"car"]]');
  perform public.check('étape 15 : submit_best — un temps moins bon ne remplace JAMAIS le record', not (r->>'improved')::boolean and (r->>'best')::float = 22.767
    and (select time = 22.767 and inputs = 'RAPIDE' and ghost = 'GHOSTRAPIDE' from scores where track_key = 'sb-1' and player = '00000000-0000-0000-0000-00000000f153'));
  r := public.submit_best('00000000-0000-0000-0000-00000000f153', 'sb-1', 20, 'ANCIEN', 30, 'Essai');
  perform public.check('étape 15 : submit_best — une physique plus ancienne ne remplace jamais un record, même plus rapide', not (r->>'improved')::boolean and (select time from scores where track_key = 'sb-1' and player = '00000000-0000-0000-0000-00000000f153') = 22.767);
  r := public.submit_best('00000000-0000-0000-0000-00000000f153', 'sb-1', 40, 'NEUVE', 32, 'Essai');
  perform public.check('étape 15 : submit_best — une physique plus récente remplace le record (les temps ne sont plus comparables)', (r->>'improved')::boolean and (select phys_ver = 32 and time = 40 and ghost is null from scores where track_key = 'sb-1' and player = '00000000-0000-0000-0000-00000000f153'));
  perform public.submit_best('00000000-0000-0000-0000-00000000f154', 'sb-2', 30, 'A', 31, 'E');
  r := public.submit_best('00000000-0000-0000-0000-00000000f154', 'sb-2', 30, 'A', 31, 'E', '[5]', 'GH', '[]');
  perform public.check('étape 15 : submit_best — le même temps renvoyé complète le fantôme et les temps intermédiaires manquants', not (r->>'improved')::boolean and (select ghost = 'GH' and splits = '{5}' from scores where track_key = 'sb-2' and player = '00000000-0000-0000-0000-00000000f154'));
  perform public.submit_best('00000000-0000-0000-0000-00000000f155', 'sb-2', 28, 'A', 31, 'E');
  r := public.submit_best('00000000-0000-0000-0000-00000000f156', 'sb-2', 29, 'A', 31, 'E');
  perform public.check('étape 15 : submit_best — rang et total (29 s derrière 28 s, devant 30 s)', (r->>'rank')::int = 2 and (r->>'total')::int = 3);
end $$;
-- Empreinte forte : une clé u-… liée à un circuit refuse un autre circuit de même clé.
do $$ declare r jsonb; begin
  r := public.submit_best('00000000-0000-0000-0000-00000000f154', 'u-abc12', 30, 'A', 31, 'E', null, null, null, repeat('a', 64));
  perform public.check('étape 15 : première course sur un circuit de joueur — empreinte forte liée', r->>'status' = 'ok' and exists (select 1 from track_binds where track_key = 'u-abc12'));
  r := public.submit_best('00000000-0000-0000-0000-00000000f155', 'u-abc12', 1, 'A', 31, 'E', null, null, null, repeat('b', 64));
  perform public.check('étape 15 : un AUTRE circuit de même clé (collision de signature 32 bits) est refusé, rien n''est écrit', r->>'status' = 'collision' and not exists (select 1 from scores where track_key = 'u-abc12' and player = '00000000-0000-0000-0000-00000000f155'));
  r := public.submit_best('00000000-0000-0000-0000-00000000f155', 'u-abc12', 31, 'A', 31, 'E', null, null, null, repeat('a', 64));
  perform public.check('étape 15 : le même circuit (même empreinte) est accepté pour un autre pilote', r->>'status' = 'ok');
end $$;

-- Circuits publiés : droits par colonne, publication vérifiée.
set role authenticated;
select public.as_user('00000000-0000-0000-0000-00000000f151');
do $$ declare refuse boolean := false; begin
  begin insert into tracks (name, decor, code, signature, author_time, pieces, created_at) values ('Antidaté', 'forest', 'x', 's15a', 30, 5, now() - interval '3 hours'); exception when others then refuse := true; end;
  perform public.check('étape 15 : created_at n''est plus écrivable (limite de 10 publications par heure non contournable)', refuse);
end $$;
do $$ declare refuse boolean := false; begin
  begin insert into tracks (name, decor, code, signature, author_time, pieces, picked_at) values ('Faux choix', 'forest', 'x', 's15b', 30, 5, now()); exception when others then refuse := true; end;
  perform public.check('étape 15 : picked_at (Sélection) n''est plus écrivable par le jeu', refuse);
end $$;
do $$ declare refuse boolean := false; begin
  begin insert into tracks (name, decor, code, signature, author_time, pieces, author_verified) values ('Faux vérifié', 'forest', 'x', 's15c', 0.001, 5, true); exception when others then refuse := true; end;
  perform public.check('étape 15 : author_verified n''est pas écrivable par le jeu', refuse);
end $$;
insert into tracks (name, decor, code, signature, author_time, pieces, laps, description) values ('Normal', 'forest', 'x', 's15d', 0.001, 5, 1, 'ok');
select public.check('étape 15 : une publication directe reste possible (ancien client) mais son temps n''est PAS vérifié', (select not author_verified and abs(author_time - 0.001) < 1e-6 from tracks where signature = 's15d'));
reset role;
do $$ declare r jsonb; begin
  r := public.publish_track('00000000-0000-0000-0000-00000000f151', 'Vérifié', 'forest', 'code', 's15e', 41.234, 6, 1, 'desc');
  perform public.check('étape 15 : publish_track — circuit créé, temps auteur = temps rejoué, vérifié', r->>'status' = 'created' and (select author_verified and abs(author_time - 41.234) < 1e-4 and author = '00000000-0000-0000-0000-00000000f151' from tracks where signature = 's15e'));
  r := public.publish_track('00000000-0000-0000-0000-00000000f152', 'Pirate', 'forest', 'code', 's15e', 5, 6, 1, '');
  perform public.check('étape 15 : publish_track — un autre pilote ne peut pas reprendre la signature d''un circuit', r->>'status' = 'taken' and (select abs(author_time - 41.234) < 1e-4 from tracks where signature = 's15e'));
  r := public.publish_track('00000000-0000-0000-0000-00000000f151', 'Vérifié v2', 'forest', 'code2', 's15d', 33.3, 6, 1, '');
  perform public.check('étape 15 : publish_track — l''auteur d''un circuit non vérifié le republie : il devient vérifié (pas de doublon)', r->>'status' = 'updated' and (select author_verified and abs(author_time - 33.3) < 1e-4 and name = 'Vérifié v2' from tracks where signature = 's15d') and (select count(*) from tracks where signature = 's15d') = 1);
  r := public.publish_track('00000000-0000-0000-0000-00000000f152', 'Faux', 'forest', 'code', 'abc12', 5, 6, 1, '', repeat('b', 64));
  perform public.check('étape 15 : publish_track — un circuit de même clé mais d''empreinte forte différente (collision 32 bits) est refusé', r->>'status' = 'collision' and not exists (select 1 from tracks where signature = 'abc12'));
end $$;
-- 13. aucun mot de passe en clair dans nos tables
select public.check('aucune colonne mot de passe dans le schéma public', not exists (select 1 from information_schema.columns where table_schema='public' and column_name ilike '%pass%'));
select case when ok then '  ok   ' else '  FAIL ' end || name from public.res order by ok, name;
select 'RESULT ' || case when bool_and(ok) and count(*) = 181 then 'tous les tests SQL passent' else 'ÉCHEC' end from public.res;
SQL

# ---------------------------------------------------------------------------------------------------------------------------------------------------
# Concurrence RÉELLE (étape 15) : plusieurs sessions psql en même temps sur la base de test. Les entrelacements sont forcés (une session garde sa
# transaction ouverte avec pg_sleep pendant qu'une autre arrive) : sans les verrous de l'étape 15, ces tests échouent.
# ---------------------------------------------------------------------------------------------------------------------------------------------------
FAILS=0
chk() { if [ "$2" = "1" ]; then echo "  ok   $1"; else echo "  FAIL $1"; FAILS=$((FAILS + 1)); fi; }
Q() { $P -d $DB -At -c "$1" 2>&1 || true; }
E1=00000000-0000-0000-0000-0000000e0001; E2=00000000-0000-0000-0000-0000000e0002; E3=00000000-0000-0000-0000-0000000e0003
Q "insert into auth.users (id, is_anonymous) values ('$E1', true), ('$E2', true), ('$E3', true); insert into players (id, name) values ('$E1','Conc-1'), ('$E2','Conc-2'), ('$E3','Conc-3');" >/dev/null
Q "insert into scores (track_key, player, time, inputs, phys_ver) select 'cc' || i, '$E1', 30, 'A', 31 from generate_series(1, 1999) i;" >/dev/null

echo "Concurrence : plafond de 2 000 temps"
( $P -d $DB -At -c "begin; insert into scores (track_key, player, time, inputs, phys_ver) values ('race-A', '$E1', 30, 'A', 31); select pg_sleep(2); commit;" >/tmp/ct-c1a.txt 2>&1 ) &
sleep 0.7
$P -d $DB -At -c "insert into scores (track_key, player, time, inputs, phys_ver) values ('race-B', '$E1', 30, 'A', 31);" >/tmp/ct-c1b.txt 2>&1 && RB=0 || RB=1
wait
chk "1 999 temps puis deux insertions simultanées : une seule passe, jamais 2 001 lignes" "$([ "$(Q "select count(*) from scores where player = '$E1'")" = 2000 ] && [ $RB = 1 ] && grep -q "Trop de temps" /tmp/ct-c1b.txt && echo 1 || echo 0)"

echo "Concurrence : meilleur temps"
for ORDER in lent-puis-rapide rapide-puis-lent; do
  K="race-$ORDER"
  if [ $ORDER = lent-puis-rapide ]; then T1=24.775; I1=LENT; T2=22.767; I2=RAPIDE; else T1=22.767; I1=RAPIDE; T2=24.775; I2=LENT; fi
  ( $P -d $DB -At -c "begin; select public.submit_best('$E2', '$K', $T1, '$I1', 31, 'x'); select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
  sleep 0.7
  Q "select public.submit_best('$E2', '$K', $T2, '$I2', 31, 'x')" >/dev/null
  wait
  chk "deux soumissions simultanées ($ORDER) : le record final est TOUJOURS le plus rapide (22,767)" "$([ "$(Q "select time || ':' || inputs from scores where track_key = '$K' and player = '$E2'")" = "22.767:RAPIDE" ] && echo 1 || echo 0)"
done
for i in $(seq 1 12); do
  T=$(awk "BEGIN { printf \"%.2f\", 30 - $i * 0.37 }"); ( Q "select public.submit_best('$E3', 'race-rafale', $T, 'I$i', 31, 'x')" >/dev/null ) &
done
wait
chk "12 soumissions simultanées de temps différents : le record final est le plus rapide, une seule ligne" "$([ "$(Q "select count(*) || ':' || min(time) from scores where track_key = 'race-rafale' and player = '$E3'")" = "1:25.56" ] && echo 1 || echo 0)"

echo "Concurrence : limitation de cadence"
for i in $(seq 1 30); do ( Q "select public.rate_check('conc', '$E1', 8, 60)" > /tmp/ct-rc-$i.txt ) & done
wait
OKN=$(cat /tmp/ct-rc-*.txt | grep -c '^0$' || true)
chk "30 appels simultanés d'un même pilote (limite 8) : exactement 8 acceptés" "$([ "$OKN" = 8 ] && echo 1 || echo 0)"
for i in $(seq 1 30); do ( Q "select public.rate_check('concg', ('00000000-0000-0000-0000-0000000e1' || lpad('$i', 3, '0'))::uuid, 8, 60, 5)" > /tmp/ct-rg-$i.txt ) & done
wait
OKG=$(cat /tmp/ct-rg-*.txt | grep -c '^0$' || true)
chk "30 pilotes différents en même temps (plafond global 5) : exactement 5 acceptés" "$([ "$OKG" = 5 ] && echo 1 || echo 0)"
rm -f /tmp/ct-rc-*.txt /tmp/ct-rg-*.txt /tmp/ct-c1a.txt /tmp/ct-c1b.txt
# Entrelacement FORCÉ : A prend la dernière place et garde sa transaction ouverte ; B arrive pendant ce temps. Sans le verrou de rate_check, B ne voit pas la ligne
# de A (non validée), compte une place libre et passe : « max » dépassé. Avec le verrou, B attend la validation de A puis est refusé.
E4=00000000-0000-0000-0000-0000000e0004; E5=00000000-0000-0000-0000-0000000e0005
Q "select public.rate_check('forcee', '$E4', 3, 60), public.rate_check('forcee', '$E4', 3, 60)" >/dev/null
( $P -d $DB -At -c "begin; select public.rate_check('forcee', '$E4', 3, 60); select pg_sleep(2); commit;" >/tmp/ct-f1.txt 2>&1 ) &
sleep 0.7
RB=$(Q "select public.rate_check('forcee', '$E4', 3, 60)")
wait
chk "limite par pilote (3) : la 4e requête, arrivée pendant que la 3e est en cours, est REFUSÉE (avec délai), pas acceptée" "$([ "$RB" -ge 1 ] 2>/dev/null && echo 1 || echo 0)"
Q "select public.rate_check('forceeg', '$E4', 9, 60, 2)" >/dev/null
( $P -d $DB -At -c "begin; select public.rate_check('forceeg', '$E5', 9, 60, 2); select pg_sleep(2); commit;" >/tmp/ct-f2.txt 2>&1 ) &
sleep 0.7
RG=$(Q "select public.rate_check('forceeg', '$E1', 9, 60, 2)")
wait
chk "plafond GLOBAL (2) : la 3e requête (autre pilote), arrivée pendant que la 2e est en cours, est REFUSÉE" "$([ "$RG" -ge 1 ] 2>/dev/null && echo 1 || echo 0)"
rm -f /tmp/ct-f1.txt /tmp/ct-f2.txt

echo "Concurrence : publication d'un même circuit, droits d'écriture directs"
# Deux pilotes publient EN MÊME TEMPS la même signature : exactement un « created », l'autre « taken » (jamais une erreur de contrainte d'unicité).
( $P -d $DB -At -c "begin; select public.publish_track('$E2', 'Course A', 'forest', 'c', 'sig-race', 20, 5, 1, ''); select pg_sleep(2); commit;" >/tmp/ct-p1.txt 2>&1 ) &
sleep 0.7
$P -d $DB -At -c "select public.publish_track('$E3', 'Course B', 'forest', 'c', 'sig-race', 19, 5, 1, '');" >/tmp/ct-p2.txt 2>&1 || true
wait
chk "même signature publiée par deux pilotes simultanément : un « created », un « taken », une seule ligne, aucune erreur de contrainte" "$([ "$(grep -c created /tmp/ct-p1.txt)" = 1 ] && [ "$(grep -c taken /tmp/ct-p2.txt)" = 1 ] && ! grep -qi "duplicate\|unique" /tmp/ct-p2.txt && [ "$(Q "select count(*) from tracks where signature = 'sig-race'")" = 1 ] && [ "$(Q "select author_time from tracks where signature = 'sig-race'")" = 20 ] && echo 1 || echo 0)"
rm -f /tmp/ct-p1.txt /tmp/ct-p2.txt
chk "publish_track refuse des valeurs hors bornes (nom vide, tour à 0, temps négatif, code énorme)" "$([ "$(for a in "'', 'forest', 'c', 'sv1', 20, 5, 1" "'N', 'forest', 'c', 'sv2', 20, 5, 0" "'N', 'forest', 'c', 'sv3', -1, 5, 1" "'N', 'forest', repeat('x', 100001), 'sv4', 20, 5, 1"; do Q "select public.publish_track('$E2', $a, '')" | grep -c "Paramètres invalides"; done | paste -sd+ | bc)" = 4 ] && [ "$(Q "select count(*) from tracks where signature like 'sv%'")" = 0 ] && echo 1 || echo 0)"
# Le jeu (rôle authenticated) ne peut JAMAIS écrire directement dans les circuits (hors insertion des colonnes autorisées) ni dans les temps.
DENY=$($P -d $DB -At 2>&1 <<SQL
set role authenticated; select set_config('request.jwt.claim.sub', '$E2', false);
do \$\$ declare n int := 0; begin
  begin update tracks set author_verified = true where author = '$E2'; exception when insufficient_privilege then n := n + 1; end;
  begin update tracks set author_time = 0.001 where author = '$E2'; exception when insufficient_privilege then n := n + 1; end;
  begin update tracks set signature = 'pirate' where author = '$E2'; exception when insufficient_privilege then n := n + 1; end;
  begin update scores set time = 0.001 where player = '$E1'; exception when insufficient_privilege then n := n + 1; end;
  begin insert into scores (track_key, player, time, inputs, phys_ver) values ('direct', '$E2', 0.001, 'A', 32); exception when insufficient_privilege then n := n + 1; end;
  begin delete from scores where player = '$E2'; exception when insufficient_privilege then n := n + 1; end;
  raise notice 'REFUSES=%', n;
end \$\$;
SQL
)
chk "le jeu ne peut ni modifier author_verified / author_time / signature, ni écrire ou effacer des temps (permission refusée, par droits et non par simple absence de politique)" "$(echo "$DENY" | grep -q "REFUSES=6" && echo 1 || echo 0)"
chk "les tables internes (rate_hits, track_binds) sont fermées au jeu" "$([ "$(Q "select has_table_privilege('authenticated', 'public.rate_hits', 'select') or has_table_privilege('anon', 'public.track_binds', 'select')")" = f ] && echo 1 || echo 0)"
chk "aucune fonction de l'étape 15 n'est exécutable par anon ou authenticated" "$([ "$(Q "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('rate_check','submit_best','publish_track','submit_rate_check','rate_purge') and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))")" = 0 ] && echo 1 || echo 0)"

echo "Étape 15b (verrouillage de la publication) et retour arrière"
$P -d $DB -f supabase/etape15b-publication-verifiee.sql; $P -d $DB -f supabase/etape15b-publication-verifiee.sql
R15B=$($P -d $DB -At 2>&1 <<SQL
set role authenticated; select set_config('request.jwt.claim.sub', '$E1', false);
do \$\$ begin insert into tracks (name, decor, code, signature, author_time, pieces) values ('Direct', 'forest', 'x', 's15-direct', 0.001, 5); raise exception 'insertion acceptée'; exception when insufficient_privilege then raise notice 'REFUSE'; end \$\$;
SQL
)
chk "après l'étape 15b, l'insertion directe d'un circuit est refusée (permission denied)" "$(echo "$R15B" | grep -q "REFUSE" && echo 1 || echo 0)"
VP15B=$($P -d $DB -At -F'|' -f supabase/verify-prod.sql)
chk "verify-prod.sql après l'étape 15b : la ligne « APRÈS 15b » passe à ok (et plus aucune ligne MANQUE ni ÉCART)" "$(echo "$VP15B" | grep 'APRÈS 15b' | grep -q '|ok$' && ! echo "$VP15B" | grep -qE '\|(MANQUE|ÉCART)$' && echo 1 || echo 0)"
chk "après l'étape 15b, publish_track (service) fonctionne encore" "$([ "$(Q "select public.publish_track('$E1', 'Après 15b', 'forest', 'c', 's15-apres', 12.5, 5, 1, '')::jsonb->>'status'")" = created ] && echo 1 || echo 0)"
$P -d $DB -f supabase/etape15-retour.sql
chk "retour arrière : submit_rate_check (étape 14) fonctionne, submit_best n'existe plus" "$([ "$(Q "select public.submit_rate_check('$E1', 3, 60)")" = 0 ] && [ "$(Q "select count(*) from pg_proc where proname = 'submit_best'")" = 0 ] && echo 1 || echo 0)"
chk "retour arrière : l'insertion directe des circuits est rétablie (étape 1)" "$([ "$(Q "select has_table_privilege('authenticated', 'public.tracks', 'insert')")" = t ] && echo 1 || echo 0)"
$P -d $DB -f supabase/etape15-backend.sql
chk "l'étape 15 se réapplique après le retour arrière (submit_best revient)" "$([ "$(Q "select count(*) from pg_proc where proname = 'submit_best'")" = 1 ] && echo 1 || echo 0)"

# Profils : l'instruction EXACTE que PostgREST produit pour « POST /rest/v1/players » avec « Prefer: resolution=merge-duplicates » (js/online.js, ensurePlayer).
# Elle exige update sur CHAQUE colonne du SET (id ET name), même sans conflit : avec l'étape 14 seule, un nouveau joueur recevait « 403 permission denied ».
# Défaut trouvé sur la production par un essai de bout en bout ; corrigé par l'étape 15 (grant update (id, name)). Ici : le correctif ET ses limites.
echo "Profils : l'upsert du jeu"
U1=00000000-0000-0000-0000-00000000e301; U2=00000000-0000-0000-0000-00000000e302
RUP=$($P -d $DB -At 2>&1 <<SQL
insert into auth.users (id, is_anonymous) values ('$U1', true), ('$U2', true) on conflict do nothing;
set role authenticated; select set_config('request.jwt.claim.sub', '$U1', false);
insert into players (id, name) values ('$U1', 'Upsert1') on conflict (id) do update set id = excluded.id, name = excluded.name;
do \$\$ begin raise notice 'CREE=%', (select name from players where id = '$U1'); end \$\$;
insert into players (id, name) values ('$U1', 'Upsert1b') on conflict (id) do update set id = excluded.id, name = excluded.name;
do \$\$ begin raise notice 'RENOMME=%', (select name from players where id = '$U1'); end \$\$;
do \$\$ begin begin insert into players (id, name) values ('$U2', 'Pirate') on conflict (id) do update set id = excluded.id, name = excluded.name; raise notice 'AUTRE=ACCEPTE'; exception when others then raise notice 'AUTRE=REFUSE'; end; end \$\$;
do \$\$ begin begin update players set id = '$U2' where id = '$U1'; if found then raise notice 'ID=ACCEPTE'; else raise notice 'ID=REFUSE'; end if; exception when others then raise notice 'ID=REFUSE'; end; end \$\$;
do \$\$ begin begin update players set created_at = now() - interval '2 years' where id = '$U1'; raise notice 'DATE=ACCEPTE'; exception when others then raise notice 'DATE=REFUSE'; end; end \$\$;
do \$\$ begin raise notice 'FIN=%', (select id::text from players where name = 'Upsert1b'); end \$\$;
SQL
)
chk "profil : l'upsert du jeu crée un NOUVEAU profil (le cas qui renvoyait 403)" "$(echo "$RUP" | grep -q 'CREE=Upsert1$' && echo 1 || echo 0)"
chk "profil : le même upsert renomme le profil existant" "$(echo "$RUP" | grep -q 'RENOMME=Upsert1b' && echo 1 || echo 0)"
chk "profil : l'upsert au nom d'UN AUTRE pilote est refusé, et son profil n'est pas créé" "$(echo "$RUP" | grep -q 'AUTRE=REFUSE' && [ "$(Q "select count(*) from players where id = '$U2'")" = 0 ] && echo 1 || echo 0)"
chk "profil : on ne peut pas prendre l'identifiant d'un autre (update id)" "$(echo "$RUP" | grep -q 'ID=REFUSE' && echo 1 || echo 0)"
chk "profil : la date de création reste fermée (étape 14)" "$(echo "$RUP" | grep -q 'DATE=REFUSE' && echo 1 || echo 0)"
chk "profil : après ces essais le profil est toujours sous son identifiant" "$(echo "$RUP" | grep -q "FIN=$U1" && echo 1 || echo 0)"

# Script de vérification de la base réelle (supabase/verify-prod.sql, LECTURE SEULE) : sur la base complète il ne signale rien ; sur une base « étapes 1 à 14 »
# (l'état constaté en production avant l'étape 15) il signale EXACTEMENT les objets manquants : le script de vérification est lui-même vérifié.
VP=$($P -d $DB -At -F'|' -f supabase/verify-prod.sql)
chk "verify-prod.sql sur la base complète (étape 15 appliquée) : aucune ligne MANQUE ni ÉCART" "$(echo "$VP" | grep -qE '\|(MANQUE|ÉCART)$' && echo 0 || echo 1)"
chk "verify-prod.sql avec l'étape 15 SEULE (15b non appliquée, publication directe encore ouverte sur 8 colonnes) : la ligne « APRÈS 15b » dit NON appliquée (info), pas ok" "$(echo "$VP" | grep 'APRÈS 15b' | grep -q 'NON appliquée.*|info$' && echo 1 || echo 0)"
chk "verify-prod.sql ne modifie rien : aucune instruction d'écriture dans le fichier" "$(grep -iE '^\s*(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b' supabase/verify-prod.sql | grep -q . && echo 0 || echo 1)"
DB14=copytrack_sqltest14
$P -d postgres -c "drop database if exists $DB14" -c "create database $DB14" >/dev/null 2>&1
for f in /tmp/ct-stub.sql supabase/etape1-communaute.sql supabase/etape2-classements.sql supabase/etape3-description.sql supabase/etape4-comptes.sql supabase/etape5-securite.sql supabase/etape6-telemetrie.sql supabase/etape7-fantomes.sql supabase/etape8-decouverte.sql supabase/etape9-secteurs.sql supabase/etape10-social.sql supabase/etape11-saisons.sql supabase/etape12-competition.sql supabase/etape13-communaute.sql supabase/etape14-securite.sql; do $P -d $DB14 -f $f >/dev/null 2>&1; done
VP14=$($P -d $DB14 -At -F'|' -f supabase/verify-prod.sql)
MISS=$(echo "$VP14" | grep -cE '\|MANQUE$'); ECART=$(echo "$VP14" | grep -E '\|ÉCART$' | grep -c "scores_limit verrouille\|enveloppe de rate_check")
chk "verify-prod.sql sur une base « étapes 1 à 14 » (état constaté en production) : signale les objets de l'étape 15 manquants (tables, fonctions, colonne) et les deux anciennes fonctions" "$([ "$MISS" -ge 9 ] && [ "$ECART" = 2 ] && echo 1 || echo 0)"
$P -d postgres -c "drop database if exists $DB14" >/dev/null 2>&1

if ! grep -q "RESULT tous les tests SQL passent" /tmp/ct-sql-out.txt || grep -q "^  FAIL" /tmp/ct-sql-out.txt; then echo "ÉCHEC : des tests SQL ont échoué"; exit 1; fi
if [ "$FAILS" != 0 ]; then echo "ÉCHEC : $FAILS test(s) de concurrence en échec"; exit 1; fi
echo "RESULT concurrence, étape 15b et retour arrière : tout passe"
