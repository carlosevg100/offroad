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
  saved := public.save_professional_capability_context_v1(
    '20000000-0000-4000-8000-000000000301',
    'bank', 'dcm_banker', 'DCM',
    array['prepare_meetings', 'originate_ideas', 'structure_transactions'],
    'Banco Exemplo',
    array['balance_sheet_lending', 'structuring', 'distribution'],
    array['bilateral_credit', 'capital_markets'],
    'Brasil e Estados Unidos.', false
  );
  if saved ->> 'status' <> 'complete' then
    raise exception 'complete professional context was not persisted: %', saved;
  end if;
  if (select operating_models from public.institution_capability_profiles
      where organization_id = '20000000-0000-4000-8000-000000000301')
      <> array['balance_sheet_lending', 'structuring', 'distribution'] then
    raise exception 'institution operating models were not preserved';
  end if;
  if (select institution_name from public.professional_context_profiles
      where organization_id = '20000000-0000-4000-8000-000000000301'
        and user_id = '10000000-0000-4000-8000-000000000301') <> 'Banco Exemplo' then
    raise exception 'user institution name was not preserved';
  end if;
  if (select answers #>> '{professional_context,status}' from public.onboarding_progress
      where organization_id = '20000000-0000-4000-8000-000000000301') <> 'complete' then
    raise exception 'onboarding did not record professional context completion';
  end if;
end;
$$;

do $$
declare
  saved jsonb;
begin
  saved := public.save_professional_capability_context_v1(
    '20000000-0000-4000-8000-000000000301',
    'credit_fund', 'credit_analyst', 'Crédito privado',
    array['analyze_investments'],
    'Gestora Exemplo',
    array['investing'],
    array['structured_flexible_capital'],
    'Analisa crédito e estrutura antes do comitê.', false
  );
  if saved ->> 'professional_role' <> 'credit_analyst' then
    raise exception 'credit analyst was collapsed into a generic role: %', saved;
  end if;
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
    perform public.save_professional_capability_context_v1(
      '20000000-0000-4000-8000-000000000301', p_professional_role => 'advisor'
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
  skipped := public.save_professional_capability_context_v1(
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
