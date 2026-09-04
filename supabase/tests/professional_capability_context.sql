-- Professional context is durable across projects, optional, and isolated by user and tenant.

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  ('10000000-0000-4000-8000-000000000301', 'authenticated', 'authenticated',
   'context-owner-a@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
   '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000302', 'authenticated', 'authenticated',
   'context-owner-b@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
   '{}'::jsonb, now(), now(), false, false);

insert into public.organizations (id, organization_type, name, created_by) values
  ('20000000-0000-4000-8000-000000000301', 'originator', 'Context Workspace A', '10000000-0000-4000-8000-000000000301'),
  ('20000000-0000-4000-8000-000000000302', 'originator', 'Context Workspace B', '10000000-0000-4000-8000-000000000302');
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values
  ('20000000-0000-4000-8000-000000000301', '10000000-0000-4000-8000-000000000301', 'owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000302', '10000000-0000-4000-8000-000000000302', 'owner', 'active', now());
insert into public.onboarding_progress (organization_id, user_id, journey, current_step) values
  ('20000000-0000-4000-8000-000000000301', '10000000-0000-4000-8000-000000000301', 'originator', 'organization'),
  ('20000000-0000-4000-8000-000000000302', '10000000-0000-4000-8000-000000000302', 'originator', 'organization');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000301","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  saved jsonb;
begin
  saved := public.save_professional_capability_context_v2(
    '20000000-0000-4000-8000-000000000301',
    array['institutional_work', 'independent_practice'],
    array['banker', 'financial_advisor'],
    array['dcm', 'corporate_banking', 'structured_finance'],
    array['prepare_meetings', 'originate_ideas', 'structure_transactions'],
    'Banco Exemplo', false
  );
  if saved ->> 'status' <> 'complete' then
    raise exception 'complete professional context was not persisted: %', saved;
  end if;
  -- Several roles and several areas survive. Collapsing them into one was the defect this
  -- shape exists to fix: a banker who also advises is not one or the other.
  if (select professional_roles from public.professional_context_profiles
      where organization_id = '20000000-0000-4000-8000-000000000301'
        and user_id = '10000000-0000-4000-8000-000000000301')
      <> array['banker', 'financial_advisor'] then
    raise exception 'multiple professional roles were not preserved';
  end if;
  if (select cardinality(practice_areas) from public.professional_context_profiles
      where organization_id = '20000000-0000-4000-8000-000000000301'
        and user_id = '10000000-0000-4000-8000-000000000301') <> 3 then
    raise exception 'practice areas were not preserved';
  end if;
  if (select institution_name from public.professional_context_profiles
      where organization_id = '20000000-0000-4000-8000-000000000301'
        and user_id = '10000000-0000-4000-8000-000000000301') <> 'Banco Exemplo' then
    raise exception 'declared organization was not preserved';
  end if;
  -- The organization gets its name and nothing more. Saying a person works at a bank is not
  -- evidence that the bank lends from its balance sheet, structures or distributes.
  if (select institution_name from public.institution_capability_profiles
      where organization_id = '20000000-0000-4000-8000-000000000301') <> 'Banco Exemplo' then
    raise exception 'declared organization name did not reach the institution profile';
  end if;
  if (select cardinality(operating_models) + cardinality(product_families)
      from public.institution_capability_profiles
      where organization_id = '20000000-0000-4000-8000-000000000301') <> 0 then
    raise exception 'onboarding invented an institutional capability';
  end if;
  if (select answers #>> '{professional_context,status}' from public.onboarding_progress
      where organization_id = '20000000-0000-4000-8000-000000000301') <> 'complete' then
    raise exception 'onboarding did not record professional context completion';
  end if;
end;
$$;

-- An organization name only means something for someone who says they work at one.
do $$
begin
  perform public.save_professional_capability_context_v2(
    '20000000-0000-4000-8000-000000000301',
    array['independent_practice'],
    array['independent_consultant'],
    array['credit'],
    array['analyze_investments'],
    'Empresa Que Nao Existe', false
  );
  if (select institution_name from public.professional_context_profiles
      where organization_id = '20000000-0000-4000-8000-000000000301'
        and user_id = '10000000-0000-4000-8000-000000000301') is not null then
    raise exception 'an affiliation nobody declared was recorded';
  end if;
end;
$$;

-- Values outside the published vocabulary are refused rather than stored as free text.
do $$
declare
  accepted boolean := true;
begin
  begin
    perform public.save_professional_capability_context_v2(
      '20000000-0000-4000-8000-000000000301',
      p_professional_roles => array['chief_vibes_officer']
    );
  exception when others then accepted := false;
  end;
  if accepted then raise exception 'an unpublished role was accepted'; end if;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000302","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  accepted boolean := true;
begin
  if (select count(*) from public.professional_context_profiles
      where organization_id = '20000000-0000-4000-8000-000000000301') <> 0
    or (select count(*) from public.institution_capability_profiles
      where organization_id = '20000000-0000-4000-8000-000000000301') <> 0 then
    raise exception 'tenant B read tenant A professional context';
  end if;
  begin
    perform public.save_professional_capability_context_v2(
      '20000000-0000-4000-8000-000000000301', p_professional_roles => array['financial_advisor']
    );
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant B wrote tenant A professional context'; end if;
end;
$$;

-- A user may explicitly defer the profile. That decision is stored so it is not requested on
-- every conversation, while a later settings update remains possible.
do $$
declare
  skipped jsonb;
begin
  skipped := public.save_professional_capability_context_v2(
    '20000000-0000-4000-8000-000000000302', p_skip => true
  );
  if skipped ->> 'status' <> 'skipped'
    or (select disclosure_status from public.professional_context_profiles
      where organization_id = '20000000-0000-4000-8000-000000000302') <> 'skipped' then
    raise exception 'explicit context deferral was not preserved';
  end if;
end;
$$;

rollback;
