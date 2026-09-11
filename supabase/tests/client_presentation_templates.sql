-- Synthetic rollback-only contract for the client presentation template. Every command below is
-- the real public RPC under the actual caller's JWT: the organization record, the project record
-- that overrides it, the refusals for a member without administration and for another tenant, and
-- the refusal of a font the PDF renderer cannot embed.
begin;

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values
  ('10000000-0000-4000-8000-000000000801','authenticated','authenticated','template-owner@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-000000000802','authenticated','authenticated','template-admin@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-000000000803','authenticated','authenticated','template-member@example.invalid','{}','{}',now(),now(),false,false),
  ('10000000-0000-4000-8000-000000000804','authenticated','authenticated','template-foreign@example.invalid','{}','{}',now(),now(),false,false);
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
    if sqlerrm<>p_message then raise exception 'expected % but got %',p_message,sqlerrm; end if;
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
  exception when no_data_found then rejected:=true;
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
    if sqlerrm<>p_message then raise exception 'expected % but got %',p_message,sqlerrm; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'invalid template was accepted: %',p_sql; end if;
end;
$$;
create function pg_temp.client_template(p_fonts jsonb default null,p_logo jsonb default null) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'template_key','synthetic-client','template_version','2026.09.11-v1','origin','client_supplied',
    'colors',jsonb_build_object('ink','1B2430','paper','FFFFFF','accent','1F4E79','muted','6B7780','warning','A66C1F','danger','A23B3B'),
    'fonts',coalesce(p_fonts,jsonb_build_object('display','Arial','body','Arial','pdf_display','Helvetica','pdf_body','Helvetica')),
    'logo',p_logo,'confidentiality_label','CONFIDENCIAL');
$$;

do $$
declare s public.document_intake_sessions;
begin
  select * into strict s from public.document_intake_sessions where id='40000000-0000-4000-8000-000000000801';
  perform set_config('test.project_id',s.capital_project_id::text,true);
  perform set_config('test.org_id',s.organization_id::text,true);
end;
$$;

-- A member without administration reads the surface but never writes the identity.
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-000000000803');
do $$
declare ctx jsonb;
begin
  ctx:=public.read_presentation_template_v1(current_setting('test.project_id')::uuid);
  if ctx->>'can_manage'<>'false' or ctx->'effective'<>'null'::jsonb or ctx->'organization'<>'null'::jsonb
    or jsonb_array_length(ctx->'pdf_fonts')<>3 then
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

-- An administrator stores the organization identity; a replay of the same definition is idempotent.
select pg_temp.as_user('10000000-0000-4000-8000-000000000802');
do $$
declare first jsonb; replay jsonb; ctx jsonb; stored public.presentation_templates;
begin
  first:=public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,pg_temp.client_template());
  replay:=public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,pg_temp.client_template());
  if first->>'status'<>'stored' or (first->>'replayed')::boolean or not (replay->>'replayed')::boolean
    or first->>'template_id'<>replay->>'template_id' or first->>'fingerprint'<>replay->>'fingerprint'
    or first->>'fingerprint' !~ '^[a-f0-9]{64}$' then
    raise exception 'organization template was not stored idempotently: % %',first,replay;
  end if;
  select * into strict stored from public.presentation_templates where id=(first->>'template_id')::uuid;
  if stored.scope<>'organization' or stored.capital_project_id is not null or stored.origin<>'client_supplied'
    or stored.definition->'fonts'->>'pdf_display'<>'Helvetica' or stored.definition->'colors'->>'accent'<>'1F4E79' then
    raise exception 'stored organization template is wrong: %',to_jsonb(stored);
  end if;
  ctx:=public.read_presentation_template_v1(current_setting('test.project_id')::uuid);
  if ctx->>'can_manage'<>'true' or ctx#>>'{effective,scope}'<>'organization'
    or ctx#>>'{effective,fingerprint}'<>first->>'fingerprint' or ctx->'project'<>'null'::jsonb then
    raise exception 'organization template did not become effective: %',ctx;
  end if;
end;
$$;

-- The project record overrides the organization record for that project only.
do $$
declare project_result jsonb; ctx jsonb;
begin
  project_result:=public.set_presentation_template_v1(null,current_setting('test.project_id')::uuid,
    jsonb_set(pg_temp.client_template(),'{template_key}','"synthetic-project"'));
  ctx:=public.read_presentation_template_v1(current_setting('test.project_id')::uuid);
  if ctx#>>'{effective,scope}'<>'project' or ctx#>>'{effective,template_key}'<>'synthetic-project'
    or ctx#>>'{organization,template_key}'<>'synthetic-client'
    or ctx#>>'{effective,fingerprint}'<>project_result->>'fingerprint'
    or ctx#>>'{effective,fingerprint}'=ctx#>>'{organization,fingerprint}' then
    raise exception 'project override did not win: %',ctx;
  end if;
end;
$$;

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

-- Clearing returns the delivery to the Offroad template without deleting the organization record.
do $$
declare cleared jsonb; replay jsonb; ctx jsonb;
begin
  cleared:=public.set_presentation_template_v1(null,current_setting('test.project_id')::uuid,null);
  replay:=public.set_presentation_template_v1(null,current_setting('test.project_id')::uuid,null);
  ctx:=public.read_presentation_template_v1(current_setting('test.project_id')::uuid);
  if cleared->>'status'<>'cleared' or (cleared->>'replayed')::boolean or not (replay->>'replayed')::boolean
    or ctx#>>'{effective,scope}'<>'organization' or ctx->'project'<>'null'::jsonb then
    raise exception 'clearing the project override did not return to the organization identity: % %',cleared,ctx;
  end if;
  perform public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,null);
  ctx:=public.read_presentation_template_v1(current_setting('test.project_id')::uuid);
  if ctx->'effective'<>'null'::jsonb then raise exception 'clearing the organization identity did not return to the Offroad template: %',ctx; end if;
end;
$$;

-- Tenant boundary on the new table: the member reads what its organization stored, the foreign
-- tenant reads nothing, and neither can write the table directly.
do $$ begin
  perform public.set_presentation_template_v1(current_setting('test.org_id')::uuid,null,pg_temp.client_template());
end $$;
select pg_temp.as_user('10000000-0000-4000-8000-000000000803');
do $$
declare rejected boolean:=false;
begin
  if (select count(*) from public.presentation_templates)<>1 then raise exception 'organization member cannot read its own template'; end if;
  begin
    update public.presentation_templates set fingerprint=repeat('b',64);
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected and (select count(*) from public.presentation_templates where fingerprint=repeat('b',64))>0 then
    raise exception 'a member without administration rewrote the identity directly';
  end if;
end;
$$;
select pg_temp.as_user('10000000-0000-4000-8000-000000000804');
do $$ begin
  if (select count(*) from public.presentation_templates)<>0 then raise exception 'foreign tenant reads another organization template'; end if;
end $$;
reset role;
rollback;
select 'client_presentation_templates_passed' as result;
