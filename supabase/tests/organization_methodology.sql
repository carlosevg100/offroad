-- Methodology is versioned, written only by whoever manages the organization, and isolated by tenant.

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  ('10000000-0000-4000-8000-000000000401', 'authenticated', 'authenticated',
   'methodology-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000402', 'authenticated', 'authenticated',
   'methodology-member@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000403', 'authenticated', 'authenticated',
   'methodology-stranger@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false);

insert into public.organizations (id, organization_type, name, created_by) values
  ('20000000-0000-4000-8000-000000000401', 'originator', 'Methodology Workspace A', '10000000-0000-4000-8000-000000000401'),
  ('20000000-0000-4000-8000-000000000402', 'originator', 'Methodology Workspace B', '10000000-0000-4000-8000-000000000403');
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values
  ('20000000-0000-4000-8000-000000000401', '10000000-0000-4000-8000-000000000401', 'owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000401', '10000000-0000-4000-8000-000000000402', 'member', 'active', now()),
  ('20000000-0000-4000-8000-000000000402', '10000000-0000-4000-8000-000000000403', 'owner', 'active', now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000401","role":"authenticated","aal":"aal1"}', true);

do $$
declare
  first jsonb;
  second jsonb;
  content jsonb := '{"schemaVersion":"organization-methodology.v1","capabilitiesReference":"institution_capability_profiles","thresholds":[{"metric":"leverage","comparator":"<=","value":"3.5","scope":"screening"}]}'::jsonb;
begin
  first := public.save_organization_methodology_v1('20000000-0000-4000-8000-000000000401', content);
  second := public.save_organization_methodology_v1('20000000-0000-4000-8000-000000000401', content || '{"mandatoryMetrics":["dscr"]}'::jsonb, 'reviewed');
  if (first ->> 'version')::int <> 1 or (second ->> 'version')::int <> 2 then
    raise exception 'versions did not advance: % %', first, second;
  end if;
  if (select count(*) from public.organization_methodologies where organization_id = '20000000-0000-4000-8000-000000000401' and status = 'active') <> 1 then
    raise exception 'more than one active methodology';
  end if;
  if (select version_number from public.organization_methodologies where organization_id = '20000000-0000-4000-8000-000000000401' and status = 'active') <> 2 then
    raise exception 'the active methodology is not the latest';
  end if;
  if (select confirmed_by from public.organization_methodologies where organization_id = '20000000-0000-4000-8000-000000000401' and status = 'active') is null then
    raise exception 'a reviewed methodology records who confirmed it';
  end if;
end;
$$;

-- A member reads; a member does not write.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000402","role":"authenticated","aal":"aal1"}', true);
do $$
declare
  accepted boolean := true;
begin
  if (select count(*) from public.organization_methodologies where organization_id = '20000000-0000-4000-8000-000000000401') <> 2 then
    raise exception 'member cannot read the methodology of their own organization';
  end if;
  begin
    perform public.save_organization_methodology_v1('20000000-0000-4000-8000-000000000401',
      '{"schemaVersion":"organization-methodology.v1","capabilitiesReference":"institution_capability_profiles"}'::jsonb);
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'a member wrote the methodology'; end if;
  begin
    insert into public.organization_methodologies (organization_id, version_number, content, created_by)
    values ('20000000-0000-4000-8000-000000000401', 9, '{"schemaVersion":"organization-methodology.v1"}'::jsonb, '10000000-0000-4000-8000-000000000402');
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'the Data API accepted a direct insert'; end if;
end;
$$;

-- Another tenant sees nothing and writes nothing.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000403","role":"authenticated","aal":"aal1"}', true);
do $$
declare
  accepted boolean := true;
begin
  if (select count(*) from public.organization_methodologies where organization_id = '20000000-0000-4000-8000-000000000401') <> 0 then
    raise exception 'tenant B read tenant A methodology';
  end if;
  begin
    perform public.save_organization_methodology_v1('20000000-0000-4000-8000-000000000401',
      '{"schemaVersion":"organization-methodology.v1","capabilitiesReference":"institution_capability_profiles"}'::jsonb);
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant B wrote tenant A methodology'; end if;
end;
$$;

-- Capabilities never enter the methodology through the back door.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000401","role":"authenticated","aal":"aal1"}', true);
do $$
declare
  accepted boolean := true;
begin
  begin
    perform public.save_organization_methodology_v1('20000000-0000-4000-8000-000000000401',
      '{"schemaVersion":"organization-methodology.v1","capabilitiesReference":"here","operatingModels":["distribution"]}'::jsonb);
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'a methodology carrying capabilities was accepted'; end if;
end;
$$;

select 'organization_methodology_passed' as result;

rollback;
