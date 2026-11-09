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
end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}'::jsonb, is_anonymous boolean default false, encrypted_password text);
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
grant usage on schema auth to anon, authenticated;
SQL
for f in /tmp/ct-stub.sql supabase/etape1-communaute.sql supabase/etape2-classements.sql supabase/etape3-description.sql supabase/etape4-comptes.sql supabase/etape4-comptes.sql supabase/etape5-securite.sql supabase/etape5-securite.sql supabase/etape6-telemetrie.sql supabase/etape6-telemetrie.sql supabase/etape7-fantomes.sql supabase/etape7-fantomes.sql supabase/etape8-decouverte.sql supabase/etape8-decouverte.sql supabase/etape9-secteurs.sql supabase/etape9-secteurs.sql supabase/etape10-social.sql supabase/etape10-social.sql supabase/etape11-saisons.sql supabase/etape11-saisons.sql supabase/etape12-competition.sql supabase/etape12-competition.sql supabase/etape13-communaute.sql supabase/etape13-communaute.sql; do $P -d $DB -f $f; done   # 2 fois : relançable
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
-- 13. aucun mot de passe en clair dans nos tables
select public.check('aucune colonne mot de passe dans le schéma public', not exists (select 1 from information_schema.columns where table_schema='public' and column_name ilike '%pass%'));
select case when ok then '  ok   ' else '  FAIL ' end || name from public.res order by ok, name;
select 'RESULT ' || case when bool_and(ok) and count(*) = 107 + 29 then 'tous les tests SQL passent' else 'ÉCHEC' end from public.res;
SQL
