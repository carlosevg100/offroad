-- Synthetic rollback-only contract for the client presentation template and its versions. Every
-- command below is the real public RPC under the actual caller's JWT: the organization record, the
-- project record that overrides it, the refusals for a member without administration and for
-- another tenant, the refusal of a font the PDF renderer cannot embed, and, since stage 19
-- increment 5: versions are immutable; saving creates version 2 and moves the pointer; the same
-- content replays; the content of an older version moves the pointer back; each invalid structure
-- is refused with its named exception; a retired template is not returned but its versions stay
-- readable by id; the vault pins the exact version; a synthetic legacy row is backfilled; the
-- worker reads the current version of the project it holds a lease for and the logo object of that
-- organization only; another tenant and anon are refused.
begin;
\ir support/legacy_workspace_capabilities.sql
\ir support/execution_approval.sql

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values
  ('10000000-0000-4000-8000-000000000801','authenticated','authenticated','template-owner@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-000000000802','authenticated','authenticated','template-admin@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-000000000803','authenticated','authenticated','template-member@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-000000000804','authenticated','authenticated','template-foreign@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-000000000805','authenticated','authenticated','template-worker@example.invalid','{}','{}',now(),now(),false,false);
insert into public.organizations (id,organization_type,name,created_by) values
  ('20000000-0000-4000-8000-000000000801','company','Synthetic template tenant','10000000-0000-4000-8000-000000000801'),
  ('20000000-0000-4000-8000-000000000802','company','Synthetic foreign template tenant','10000000-0000-4000-8000-000000000804');
insert into public.organization_memberships (organization_id,user_id,role,status,joined_at) values
  ('20000000-0000-4000-8000-000000000801','10000000-0000-4000-8000-000000000801','owner','active',now()),
  ('20000000-0000-4000-8000-000000000801','10000000-0000-4000-8000-000000000802','admin','active',now()),
  ('20000000-0000-4000-8000-000000000801','10000000-0000-4000-8000-000000000803','member','active',now()),
  ('20000000-0000-4000-8000-000000000802','10000000-0000-4000-8000-000000000804','owner','active',now());
insert into public.document_intake_sessions (id,organization_id,started_by,journey,locale)
values ('40000000-0000-4000-8000-000000000801','20000000-0000-4000-8000-000000000801','10000000-0000-4000-8000-000000000801','company','pt-BR');

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated','aal','aal1')::text,true);
$$;
create function pg_temp.expect_denied(p_sql text,p_message text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
  begin
    execute p_sql;
  exception when insufficient_privilege then
    if sqlerrm not in (p_message,'resource_access_denied') then raise exception 'expected % but got %',p_message,sqlerrm; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'command was not denied: %',p_sql; end if;
end;
$$;
create function pg_temp.expect_not_found(p_sql text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
  begin
    execute p_sql;
  exception when no_data_found or insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'foreign tenant command was not rejected: %',p_sql; end if;
end;
$$;
create function pg_temp.expect_invalid(p_sql text,p_message text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
  begin
    execute p_sql;
  exception when invalid_parameter_value then
    if sqlerrm not in (p_message,'resource_access_denied') then raise exception 'expected % but got %',p_message,sqlerrm; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'invalid template was accepted: %',p_sql; end if;
end;
$$;
create function pg_temp.expect_immutable(p_sql text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
  begin
    execute p_sql;
  exception when object_not_in_prerequisite_state then
    if sqlerrm<>'presentation_template_version_immutable' then raise exception 'expected presentation_template_version_immutable but got %',sqlerrm; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'a version was rewritten: %',p_sql; end if;
end;
$$;
create function pg_temp.client_template(p_fonts jsonb default null,p_logo jsonb default null) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'template_key','synthetic-client','template_version','2026.09.11-v1','origin','client_supplied',
    'colors',jsonb_build_object('ink','1B2430','paper','FFFFFF','accent','1F4E79','muted','6B7780','warning','A66C1F','danger','A23B3B'),
    'fonts',coalesce(p_fonts,jsonb_build_object('display','Arial','body','Arial','pdf_display','Helvetica','pdf_body','Helvetica')),
    'logo',p_logo,'confidentiality_label','CONFIDENCIAL');
$$;
-- A client structure: the house sections reordered, sources first and required, the direction
-- section for the advisor audience only.
create function pg_temp.client_structure() returns jsonb language sql immutable as $$
  select jsonb_build_object('schemaVersion','2026.09.27-structure-v1','sections',jsonb_build_array(
    jsonb_build_object('key','source-register','title',jsonb_build_object('pt-BR','Fontes','en-US','Sources'),'audiences',jsonb_build_array('internal','advisor','external'),
      'fields',jsonb_build_array(jsonb_build_object('key','sources','kind','source_list','required',true,'title',jsonb_build_object('pt-BR','Fontes citadas','en-US','Cited sources')))),
    jsonb_build_object('key','decision-headline','title',jsonb_build_object('pt-BR','Situação','en-US','Situation'),'audiences',jsonb_build_array('internal','advisor','external'),
      'fields',jsonb_build_array(jsonb_build_object('key','headline-metrics','kind','number','required',true,'title',jsonb_build_object('pt-BR','Indicadores','en-US','Indicators')))),
    jsonb_build_object('key','analytical-direction','title',jsonb_build_object('pt-BR','Direção','en-US','Direction'),'audiences',jsonb_build_array('advisor'),
      'fields',jsonb_build_array(jsonb_build_object('key','leading-alternative','kind','text','required',false,'title',jsonb_build_object('pt-BR','Alternativa','en-US','Alternative'))))));
$$;
create function pg_temp.structure_with_section(p_section jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('schemaVersion','2026.09.27-structure-v1','sections',jsonb_build_array(p_section));
$$;
create temporary table template_test_state (key text primary key, value text not null) on commit drop;
grant select, insert, update on template_test_state to authenticated;

do $$
declare s public.document_intake_sessions;
begin
  select * into strict s from public.document_intake_sessions where id='40000000-0000-4000-8000-000000000801';
  perform set_config('test.project_id',s.capital_project_id::text,true);
  perform set_config('test.org_id',s.organization_id::text,true);
end;
$$;

-- A member without administration reads the surface but never writes the identity.
-- Collaboration requires an explicit project grant, independent of membership.
select pg_temp.as_user('10000000-0000-4000-8000-000000000801');
select public.grant_resource_access_v1(current_setting('test.project_id')::uuid,'10000000-0000-4000-8000-000000000803','read');
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-000000000803');
do $$
declare ctx jsonb;
begin
  ctx:=public.read_presentation_template_v1(current_setting('test.project_id')::uuid);
  if ctx->>'can_manage'<>'false' or ctx->'effective'<>'null'::jsonb or ctx->'organization'<>'null'::jsonb
    or jsonb_array_length(ctx->'pdf_fonts')<>3 or jsonb_array_length(ctx->'house_structure'->'sections')<>5
    or ctx#>>'{house_structure,sections,0,key}'<>'decision-headline' then
    raise exception 'default context is wrong: %',ctx;
  end if;
end;
$$;
select pg_temp.expect_denied($q$select public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,pg_temp.client_template())$q$,'presentation_template_management_denied');
select pg_temp.expect_denied($q$select public.set_presentation_template_v1(null,current_setting('test.project_id')::uuid,pg_temp.client_template())$q$,'presentation_template_management_denied');

-- Another tenant never learns that the project exists and reads no template row.
select pg_temp.as_user('10000000-0000-4000-8000-000000000804');
select pg_temp.expect_not_found($q$select public.read_presentation_template_v1(current_setting('test.project_id')::uuid)$q$);
select pg_temp.expect_not_found($q$select public.set_presentation_template_v1(null,current_setting('test.project_id')::uuid,pg_temp.client_template())$q$);
select pg_temp.expect_not_found($q$select public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,pg_temp.client_template())$q$);

-- Content permission is explicit; administration alone was tested above and is not reading authority.
select pg_temp.as_user('10000000-0000-4000-8000-000000000801');
select public.grant_resource_access_v1(current_setting('test.project_id')::uuid,'10000000-0000-4000-8000-000000000802','manage');

-- An administrator stores the organization identity: version 1 with the house structure, and a
-- replay of the same definition is idempotent. The existing three-argument call keeps working.
select pg_temp.as_user('10000000-0000-4000-8000-000000000802');
do $$
declare first jsonb; replay jsonb; ctx jsonb; stored public.presentation_templates; version_row public.presentation_template_versions;
begin
  first:=public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,pg_temp.client_template());
  replay:=public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,pg_temp.client_template());
  if first->>'status'<>'stored' or (first->>'replayed')::boolean or not (replay->>'replayed')::boolean
    or first->>'template_id'<>replay->>'template_id' or first->>'fingerprint'<>replay->>'fingerprint'
    or first->>'fingerprint' !~ '^[a-f0-9]{64}$' or (first->>'version_no')::integer<>1 or first->>'version_id'<>replay->>'version_id'
    or first->>'definition_fingerprint'=first->>'fingerprint' then
    raise exception 'organization template was not stored idempotently as version 1: % %',first,replay;
  end if;
  select * into strict stored from public.presentation_templates where id=(first->>'template_id')::uuid;
  select * into strict version_row from public.presentation_template_versions where id=(first->>'version_id')::uuid;
  if stored.scope<>'organization' or stored.capital_project_id is not null or stored.origin<>'client_supplied'
    or stored.current_version_id<>version_row.id or stored.retired_at is not null or version_row.version_no<>1 or version_row.template_id<>stored.id
    or version_row.definition->'fonts'->>'pdf_display'<>'Helvetica' or version_row.definition->'colors'->>'accent'<>'1F4E79'
    or jsonb_array_length(version_row.structure->'sections')<>5 or version_row.structure#>>'{sections,0,key}'<>'decision-headline'
    or version_row.fingerprint<>encode(extensions.digest(jsonb_build_object('definition',version_row.definition,'structure',version_row.structure)::text,'sha256'),'hex') then
    raise exception 'stored organization template or its version is wrong: % %',to_jsonb(stored),to_jsonb(version_row);
  end if;
  ctx:=public.read_presentation_template_v1(current_setting('test.project_id')::uuid);
  if ctx->>'can_manage'<>'true' or ctx#>>'{effective,scope}'<>'organization'
    or ctx#>>'{effective,fingerprint}'<>first->>'fingerprint' or ctx#>>'{effective,version_id}'<>first->>'version_id'
    or (ctx#>>'{effective,version_no}')::integer<>1 or jsonb_array_length(ctx#>'{effective,versions}')<>1
    or (ctx#>>'{effective,versions,0,is_current}')::boolean is not true or ctx#>>'{effective,versions,0,version_id}'<>first->>'version_id'
    or ctx#>'{effective,structure}'<>version_row.structure or ctx->'project'<>'null'::jsonb then
    raise exception 'organization template did not become effective as version 1: %',ctx;
  end if;
  insert into template_test_state values ('template_id',stored.id::text),('version_1',version_row.id::text),('fingerprint_1',version_row.fingerprint);
end;
$$;

-- A changed structure creates version 2 and moves the pointer; the history lists both; the exact
-- version 1 stays readable by id with the content it had.
do $$
declare second jsonb; ctx jsonb; exact jsonb;
begin
  second:=public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,pg_temp.client_template(),pg_temp.client_structure());
  if second->>'status'<>'stored' or (second->>'replayed')::boolean or (second->>'version_no')::integer<>2 or (second->>'reused_version')::boolean
    or second->>'template_id'<>(select value from template_test_state where key='template_id')
    or second->>'fingerprint'=(select value from template_test_state where key='fingerprint_1') then
    raise exception 'a structure change did not create version 2: %',second;
  end if;
  ctx:=public.read_presentation_template_v1(current_setting('test.project_id')::uuid);
  if ctx#>>'{effective,version_id}'<>second->>'version_id' or (ctx#>>'{effective,version_no}')::integer<>2
    or ctx#>>'{effective,structure,sections,0,key}'<>'source-register' or jsonb_array_length(ctx#>'{effective,versions}')<>2
    or (ctx#>>'{effective,versions,0,version_no}')::integer<>2 or (ctx#>>'{effective,versions,1,version_no}')::integer<>1
    or (ctx#>>'{effective,versions,1,is_current}')::boolean then
    raise exception 'the pointer did not move to version 2: %',ctx;
  end if;
  exact:=public.read_presentation_template_version_v1((select value from template_test_state where key='version_1')::uuid);
  if (exact->>'version_no')::integer<>1 or (exact->>'is_current')::boolean or (exact->>'retired')::boolean
    or exact#>>'{structure,sections,0,key}'<>'decision-headline' or exact->>'fingerprint'<>(select value from template_test_state where key='fingerprint_1')
    or exact->>'template_id'<>(select value from template_test_state where key='template_id') then
    raise exception 'version 1 is not readable exactly as stored: %',exact;
  end if;
  insert into template_test_state values ('version_2',second->>'version_id');
end;
$$;

-- The content of version 1 again: the pointer moves back to version 1, nothing is rewritten.
do $$
declare back jsonb; ctx jsonb;
begin
  back:=public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,pg_temp.client_template());
  if (back->>'replayed')::boolean or not (back->>'reused_version')::boolean or (back->>'version_no')::integer<>1
    or back->>'version_id'<>(select value from template_test_state where key='version_1')
    or (select count(*) from public.presentation_template_versions where template_id=(select value from template_test_state where key='template_id')::uuid)<>2 then
    raise exception 'older content did not move the pointer back without a new row: %',back;
  end if;
  ctx:=public.read_presentation_template_v1(current_setting('test.project_id')::uuid);
  if (ctx#>>'{effective,version_no}')::integer<>1 then raise exception 'pointer did not return to version 1: %',ctx; end if;
  -- Back to version 2 for the rest of the contract.
  back:=public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,pg_temp.client_template(),pg_temp.client_structure());
  if (back->>'version_no')::integer<>2 or not (back->>'reused_version')::boolean then raise exception 'version 2 was not reused: %',back; end if;
end;
$$;

-- The project record overrides the organization record for that project only, with its own versions.
do $$
declare project_result jsonb; ctx jsonb;
begin
  project_result:=public.set_presentation_template_v1(null,current_setting('test.project_id')::uuid,
    jsonb_set(pg_temp.client_template(),'{template_key}','"synthetic-project"'));
  ctx:=public.read_presentation_template_v1(current_setting('test.project_id')::uuid);
  if ctx#>>'{effective,scope}'<>'project' or ctx#>>'{effective,template_key}'<>'synthetic-project'
    or ctx#>>'{organization,template_key}'<>'synthetic-client'
    or ctx#>>'{effective,fingerprint}'<>project_result->>'fingerprint'
    or ctx#>>'{effective,fingerprint}'=ctx#>>'{organization,fingerprint}'
    or (ctx#>>'{effective,version_no}')::integer<>1 or (ctx#>>'{organization,version_no}')::integer<>2 then
    raise exception 'project override did not win: %',ctx;
  end if;
  insert into template_test_state values ('project_template_id',project_result->>'template_id'),('project_version_1',project_result->>'version_id');
end;
$$;

-- Each invalid structure is refused with its named exception and nothing is written.
select pg_temp.expect_invalid(
  $q$select public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,pg_temp.client_template(),jsonb_build_object('schemaVersion','2026.09.27-structure-v1','sections',jsonb_build_array()))$q$,
  'presentation_template_structure_empty');
select pg_temp.expect_invalid(
  $q$select public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,pg_temp.client_template(),pg_temp.structure_with_section(jsonb_build_object('key','empty','title',jsonb_build_object('pt-BR','Vazia','en-US','Empty'),'audiences',jsonb_build_array('internal'),'fields',jsonb_build_array())))$q$,
  'presentation_template_structure_empty');
select pg_temp.expect_invalid(
  $q$select public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,pg_temp.client_template(),jsonb_build_object('schemaVersion','2026.09.27-structure-v1','sections',jsonb_build_array(pg_temp.client_structure()#>'{sections,0}',pg_temp.client_structure()#>'{sections,0}')))$q$,
  'presentation_template_structure_duplicate_key');
select pg_temp.expect_invalid(
  $q$select public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,pg_temp.client_template(),pg_temp.structure_with_section(jsonb_build_object('key','pictures','title',jsonb_build_object('pt-BR','Imagens','en-US','Pictures'),'audiences',jsonb_build_array('internal'),'fields',jsonb_build_array(jsonb_build_object('key','photo','kind','image','required',false,'title',jsonb_build_object('pt-BR','Foto','en-US','Photo'))))))$q$,
  'presentation_template_structure_unknown_kind');
select pg_temp.expect_invalid(
  $q$select public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,pg_temp.client_template(),pg_temp.structure_with_section(jsonb_build_object('key','headline','title',jsonb_build_object('pt-BR','Síntese','en-US','Summary'),'audiences',jsonb_build_array('internal'),'fields',jsonb_build_array(jsonb_build_object('kind','number','required',true,'title',jsonb_build_object('pt-BR','Número','en-US','Number'))))))$q$,
  'presentation_template_structure_required_without_key');
select pg_temp.expect_invalid(
  $q$select public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,pg_temp.client_template(),pg_temp.structure_with_section(jsonb_build_object('key','headline','title',jsonb_build_object('pt-BR','Síntese','en-US','Summary'),'audiences',jsonb_build_array('board'),'fields',jsonb_build_array(jsonb_build_object('key','metric','kind','number','required',true,'title',jsonb_build_object('pt-BR','Número','en-US','Number'))))))$q$,
  'presentation_template_structure_unknown_audience');
do $$ begin
  if (select count(*) from public.presentation_template_versions)<>3 then raise exception 'a refused structure wrote a version'; end if;
end $$;

-- A font the PDF renderer cannot embed is refused, so no file is ever produced with a silent
-- substitution. The same refusal covers a colour that is not a six-digit hex and a logo reference
-- that does not exist in the organization's own storage prefix.
select pg_temp.expect_invalid(
  $q$select public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,pg_temp.client_template(jsonb_build_object('display','Founders Grotesk','body','Founders Grotesk','pdf_display','Founders Grotesk','pdf_body','Helvetica')))$q$,
  'unsupported_presentation_template_font');
select pg_temp.expect_invalid(
  $q$select public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,jsonb_set(pg_temp.client_template(),'{colors,ink}','"nothex"'))$q$,
  'invalid_presentation_template_colors');
select pg_temp.expect_invalid(
  $q$select public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,pg_temp.client_template(null,jsonb_build_object('object_path','20000000-0000-4000-8000-000000000802/logo.png','sha256',repeat('a',64),'byte_length',1024,'content_type','image/png')))$q$,
  'invalid_presentation_template_logo');

-- The vault pins the exact version: the current version of the organization template and its
-- fingerprint. A later version of the template does not move the pin, and the pin still resolves.
select set_config('request.headers',jsonb_build_object('x-offroad-workspace',current_setting('test.org_id'))::text,true);
select public.submit_vault_entry_version_v1('a5190000-0000-4000-9000-000000000501','a5190000-0000-4000-9000-000000000502',null,'template','Synthetic template pin',null,(select value from template_test_state where key='template_id')::uuid);
do $$
declare later jsonb;
begin
  later:=public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,jsonb_set(pg_temp.client_template(),'{template_version}','"2026.09.27-v2"'),pg_temp.client_structure());
  if (later->>'version_no')::integer<>3 then raise exception 'version 3 was not created: %',later; end if;
  insert into template_test_state values ('version_3',later->>'version_id');
end;
$$;
reset role;
do $$
declare pinned public.vault_entry_versions; org_template uuid:=(select value from template_test_state where key='template_id')::uuid;
  current_version uuid:=(select value from template_test_state where key='version_2')::uuid;
begin
  select * into strict pinned from public.vault_entry_versions where id='a5190000-0000-4000-9000-000000000502';
  if pinned.presentation_template_id<>org_template or pinned.presentation_template_version_id<>current_version
    or pinned.reference_fingerprint<>(select fingerprint from public.presentation_template_versions where id=current_version) then
    raise exception 'the vault did not pin the exact version that was current: %',to_jsonb(pinned);
  end if;
  if (select current_version_id from public.presentation_templates where id=org_template)=current_version then raise exception 'version 3 did not become current'; end if;
  -- The reference check, as the vault evaluates it, resolves the pinned version even though it is no longer current.
  if not private.vault_reference_allowed_v1(current_setting('test.org_id')::uuid,'a5190000-0000-4000-9000-000000000502','analysis') then
    raise exception 'the vault pin to the exact version does not resolve';
  end if;
end $$;
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-000000000802');
select set_config('request.headers','{}',true);

-- Versions are immutable for everyone, including the database owner: no update, delete or truncate.
-- A plain truncate is already refused by the foreign key from presentation_templates before any
-- trigger fires; with cascade the foreign-key check passes and the guard is what refuses, before
-- any row of the cascade set is removed.
reset role;
select pg_temp.expect_immutable($q$update public.presentation_template_versions set fingerprint=repeat('b',64)$q$);
select pg_temp.expect_immutable($q$delete from public.presentation_template_versions$q$);
select pg_temp.expect_immutable($q$truncate public.presentation_template_versions cascade$q$);
do $$ begin
  -- Organization versions 1, 2 and 3 plus the project version 1; two template rows.
  if (select count(*) from public.presentation_template_versions)<>4 or (select count(*) from public.presentation_templates)<>2 then
    raise exception 'the refused truncate removed rows';
  end if;
end $$;
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-000000000802');

-- Clearing retires the organization record: it is no longer returned or effective, its versions
-- stay readable by id, and storing a definition again revives it with the next version.
do $$
declare cleared jsonb; replay jsonb; ctx jsonb; exact jsonb; revived jsonb;
begin
  cleared:=public.set_presentation_template_v1(null,current_setting('test.project_id')::uuid,null);
  replay:=public.set_presentation_template_v1(null,current_setting('test.project_id')::uuid,null);
  ctx:=public.read_presentation_template_v1(current_setting('test.project_id')::uuid);
  if cleared->>'status'<>'cleared' or (cleared->>'replayed')::boolean or not (replay->>'replayed')::boolean
    or ctx#>>'{effective,scope}'<>'organization' or ctx->'project'<>'null'::jsonb then
    raise exception 'retiring the project override did not return to the organization identity: % %',cleared,ctx;
  end if;
  if (select retired_at from public.presentation_templates where id=(select value from template_test_state where key='project_template_id')::uuid) is null
    or (select count(*) from public.presentation_template_versions where template_id=(select value from template_test_state where key='project_template_id')::uuid)<>1 then
    raise exception 'retiring deleted the project template or its version';
  end if;
  exact:=public.read_presentation_template_version_v1((select value from template_test_state where key='project_version_1')::uuid);
  if not (exact->>'retired')::boolean or exact->>'template_key'<>'synthetic-project' then raise exception 'the retired project version is not readable by id: %',exact; end if;
  perform public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,null);
  ctx:=public.read_presentation_template_v1(current_setting('test.project_id')::uuid);
  if ctx->'effective'<>'null'::jsonb or ctx->'organization'<>'null'::jsonb then raise exception 'retiring the organization identity did not return to the Offroad template: %',ctx; end if;
  revived:=public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,jsonb_set(pg_temp.client_template(),'{template_key}','"synthetic-revived"'));
  ctx:=public.read_presentation_template_v1(current_setting('test.project_id')::uuid);
  if (revived->>'version_no')::integer<>4 or ctx#>>'{effective,template_key}'<>'synthetic-revived' or jsonb_array_length(ctx#>'{effective,versions}')<>4
    or (select retired_at from public.presentation_templates where id=(select value from template_test_state where key='template_id')::uuid) is not null then
    raise exception 'storing again did not revive the retired template as version 4: % %',revived,ctx;
  end if;
  insert into template_test_state values ('version_4',revived->>'version_id');
end;
$$;

-- Tenant boundary on the versions table: the member reads what its organization stored, the
-- foreign tenant reads nothing and cannot read a version by id, and neither writes directly.
select pg_temp.as_user('10000000-0000-4000-8000-000000000803');
do $$
declare rejected boolean:=false;
begin
  if (select count(*) from public.presentation_templates)<>2 then raise exception 'organization member cannot read its own templates'; end if;
  if (select count(*) from public.presentation_template_versions where template_id=(select value from template_test_state where key='template_id')::uuid)<>4 then
    raise exception 'organization member cannot read the versions of its own template';
  end if;
  begin
    update public.presentation_template_versions set fingerprint=repeat('b',64);
  exception when insufficient_privilege or object_not_in_prerequisite_state then rejected:=true;
  end;
  if not rejected and (select count(*) from public.presentation_template_versions where fingerprint=repeat('b',64))>0 then
    raise exception 'a member without administration rewrote a version directly';
  end if;
end;
$$;
select pg_temp.as_user('10000000-0000-4000-8000-000000000804');
do $$ begin
  if (select count(*) from public.presentation_templates)<>0 or (select count(*) from public.presentation_template_versions)<>0 then
    raise exception 'foreign tenant reads another organization template or version';
  end if;
end $$;
select pg_temp.expect_not_found($q$select public.read_presentation_template_version_v1((select value from template_test_state where key='version_1')::uuid)$q$);

-- Anonymous callers have neither the table nor the readers.
reset role;
set local role anon;
do $$
declare rejected boolean:=false;
begin
  begin
    perform count(*) from public.presentation_template_versions;
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'anon reads template versions'; end if;
  if has_function_privilege('anon','public.read_presentation_template_version_v1(uuid)','EXECUTE')
    or has_function_privilege('anon','public.set_presentation_template_v1(uuid,uuid,jsonb,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.worker_read_presentation_template_version_v1(uuid,text)','EXECUTE') then
    raise exception 'anon may execute a template command';
  end if;
end $$;
reset role;

-- Backfill on a synthetic legacy row: a template inserted the way the old command inserted it, with
-- no pointer, becomes version 1 with the house structure; a legacy vault pin on its definition
-- fingerprint receives that version. The statements are the migration's own, on a synthetic row.
do $$
declare legacy public.presentation_templates; legacy_definition jsonb; version_row public.presentation_template_versions; pinned public.vault_entry_versions; scope uuid;
begin
  legacy_definition:=private.validate_presentation_template('20000000-0000-4000-8000-000000000802',jsonb_set(pg_temp.client_template(),'{template_key}','"synthetic-legacy"'));
  insert into public.presentation_templates (organization_id,capital_project_id,scope,template_key,template_version,origin,definition,fingerprint,created_by,updated_by)
  values ('20000000-0000-4000-8000-000000000802',null,'organization','synthetic-legacy','2026.09.11-v1','client_supplied',legacy_definition,
    encode(extensions.digest(legacy_definition::text,'sha256'),'hex'),'10000000-0000-4000-8000-000000000804','10000000-0000-4000-8000-000000000804')
  returning * into legacy;
  select id into strict scope from public.vault_scopes where organization_id='20000000-0000-4000-8000-000000000802';
  insert into public.vault_entries(id,organization_id,scope_id,kind,created_by) values('a5190000-0000-4000-9000-000000000601','20000000-0000-4000-8000-000000000802',scope,'template','10000000-0000-4000-8000-000000000804');
  insert into public.vault_entry_versions(id,organization_id,entry_id,revision,previous_version_id,title,presentation_template_id,reference_fingerprint,dependency_manifest,provenance,content_fingerprint,request_fingerprint,created_by)
  values('a5190000-0000-4000-9000-000000000602','20000000-0000-4000-8000-000000000802','a5190000-0000-4000-9000-000000000601',1,null,'Synthetic legacy template pin',legacy.id,legacy.fingerprint,'[]'::jsonb,'{"kind":"synthetic_legacy"}'::jsonb,repeat('d',64),repeat('e',64),'10000000-0000-4000-8000-000000000804');
  if legacy.current_version_id is not null then raise exception 'legacy row already had a pointer'; end if;
  insert into public.presentation_template_versions (organization_id, template_id, version_no, definition, structure, fingerprint, created_by, created_at, updated_at)
  select t.organization_id, t.id, 1, t.definition, private.presentation_template_house_structure_v1(),
    encode(extensions.digest(jsonb_build_object('definition', t.definition, 'structure', private.presentation_template_house_structure_v1())::text, 'sha256'), 'hex'),
    t.created_by, t.created_at, t.created_at
  from public.presentation_templates t
  where t.current_version_id is null;
  update public.presentation_templates t set current_version_id = v.id
  from public.presentation_template_versions v
  where v.organization_id = t.organization_id and v.template_id = t.id and v.version_no = 1 and t.current_version_id is null;
  alter table public.vault_entry_versions disable trigger vault_version_immutable;
  update public.vault_entry_versions v set presentation_template_version_id = t.current_version_id
  from public.presentation_templates t
  where t.organization_id = v.organization_id and t.id = v.presentation_template_id
    and v.presentation_template_version_id is null and t.fingerprint = v.reference_fingerprint;
  alter table public.vault_entry_versions enable trigger vault_version_immutable;
  select * into strict legacy from public.presentation_templates where id=legacy.id;
  select * into strict version_row from public.presentation_template_versions where id=legacy.current_version_id;
  select * into strict pinned from public.vault_entry_versions where id='a5190000-0000-4000-9000-000000000602';
  if version_row.version_no<>1 or version_row.definition<>legacy.definition or version_row.structure<>private.presentation_template_house_structure_v1()
    or version_row.created_by<>legacy.created_by or version_row.created_at<>legacy.created_at or pinned.presentation_template_version_id<>version_row.id then
    raise exception 'backfill of the synthetic legacy row is wrong: % % %',to_jsonb(legacy),to_jsonb(version_row),to_jsonb(pinned);
  end if;
  if (select count(*) from public.presentation_template_versions where organization_id='20000000-0000-4000-8000-000000000801')<>5 then
    raise exception 'backfill touched rows that already had a pointer';
  end if;
end $$;

-- The worker reads the current version of the project its leased job belongs to (the project
-- record wins), and reads the logo object of that organization only while it holds the lease.
-- The job is seeded without a JWT, as the material storage contract seeds it: the synthetic lease
-- trigger binds no account until the worker account is set explicitly below.
select set_config('request.jwt.claims','{}',true);
insert into public.processing_runs (id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by)
values ('70000000-0000-4000-8000-000000000801','20000000-0000-4000-8000-000000000801','40000000-0000-4000-8000-000000000801',1,'manual','running','template-version-test-v1','10000000-0000-4000-8000-000000000801');
insert into public.processing_jobs (id, organization_id, processing_run_id, intake_session_id, kind, status, payload, attempts, lease_expires_at, capability_sha256)
values ('80000000-0000-4000-8000-000000000801','20000000-0000-4000-8000-000000000801','70000000-0000-4000-8000-000000000801','40000000-0000-4000-8000-000000000801',
  'capital_project_analysis','leased',
  jsonb_build_object('capital_project_id',current_setting('test.project_id'),'capital_project_plan_id',pg_temp.fixture_execution_plan('40000000-0000-4000-8000-000000000801')),
  1, now() + interval '10 minutes', extensions.digest(repeat('c', 64), 'sha256'));
select pg_temp.fixture_approve_execution('80000000-0000-4000-8000-000000000801',true);
update public.processing_jobs set leased_account_user_id='10000000-0000-4000-8000-000000000805' where id='80000000-0000-4000-8000-000000000801';
insert into storage.objects (bucket_id, name, owner_id) values
  ('brand-templates', '20000000-0000-4000-8000-000000000801/presentation-templates/'||repeat('a',64)||'.png', '10000000-0000-4000-8000-000000000801'),
  ('brand-templates', '20000000-0000-4000-8000-000000000802/presentation-templates/'||repeat('b',64)||'.png', '10000000-0000-4000-8000-000000000804');
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-000000000805');
do $$
declare read jsonb; project_version jsonb;
begin
  read:=public.worker_read_presentation_template_version_v1('80000000-0000-4000-8000-000000000801',repeat('c',64));
  -- The project template is retired at this point, so the revived organization version 4 (house structure) applies.
  if read#>>'{template,version_id}'<>(select value from template_test_state where key='version_4') or read#>>'{template,scope}'<>'organization'
    or (read#>>'{template,version_no}')::integer<>4 or read#>>'{template,structure,sections,0,key}'<>'decision-headline'
    or read#>>'{template,fingerprint}' !~ '^[a-f0-9]{64}$' or read#>>'{template,definition,template_key}'<>'synthetic-revived' then
    raise exception 'the worker did not read the current organization version: %',read;
  end if;
  if (select count(*) from storage.objects where bucket_id='brand-templates')<>1
    or not exists (select 1 from storage.objects where bucket_id='brand-templates' and name like '20000000-0000-4000-8000-000000000801/%') then
    raise exception 'the worker read the logo object of another organization, or not its own';
  end if;
end $$;
select pg_temp.as_user('10000000-0000-4000-8000-000000000802');
do $$
declare revived jsonb;
begin
  revived:=public.set_presentation_template_v1(null,current_setting('test.project_id')::uuid,jsonb_set(pg_temp.client_template(),'{template_key}','"synthetic-project"'),pg_temp.client_structure());
  if (revived->>'version_no')::integer<>2 then raise exception 'the retired project template was not revived as version 2: %',revived; end if;
end $$;
select pg_temp.as_user('10000000-0000-4000-8000-000000000805');
do $$
declare read jsonb;
begin
  read:=public.worker_read_presentation_template_version_v1('80000000-0000-4000-8000-000000000801',repeat('c',64));
  if read#>>'{template,scope}'<>'project' or read#>>'{template,template_key}'<>'synthetic-project' or (read#>>'{template,version_no}')::integer<>2 then
    raise exception 'the project version did not win for the worker: %',read;
  end if;
end $$;
-- Without the capability the worker reads nothing, and a stranger with the capability of no job
-- reads nothing either.
select pg_temp.expect_denied($q$select public.worker_read_presentation_template_version_v1('80000000-0000-4000-8000-000000000801',repeat('f',64))$q$,'job_capability_invalid');
reset role;
update public.processing_jobs set lease_expires_at=now()-interval '1 minute' where id='80000000-0000-4000-8000-000000000801';
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-000000000805');
do $$ begin
  if (select count(*) from storage.objects where bucket_id='brand-templates')<>0 then raise exception 'the worker reads logo objects after its lease expired'; end if;
end $$;
reset role;
rollback;
select 'client_presentation_templates_passed' as result;
