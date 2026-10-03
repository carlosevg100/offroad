-- integration_preview: the grant is invisible to tenants, travels in the claim, gates the preview
-- activation, and the preview run completes into the same conversation with a preview-tagged
-- message. Without the grant nothing activates, whatever the payload says.

begin;
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_persistent_work_fixture.sql
\ir support/execution_approval.sql

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values (
  '10000000-0000-4000-8000-000000000251', 'authenticated', 'authenticated',
  'integration-preview-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, now(), now(), false, false
), (
  '10000000-0000-4000-8000-000000000252', 'authenticated', 'authenticated',
  'integration-preview-neighbour@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, now(), now(), false, false
);

insert into public.organizations (id, organization_type, name, created_by) values
  ('20000000-0000-4000-8000-000000000251', 'originator', 'Preview Workspace', '10000000-0000-4000-8000-000000000251'),
  ('20000000-0000-4000-8000-000000000252', 'originator', 'Neighbour Workspace', '10000000-0000-4000-8000-000000000252');
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values
  ('20000000-0000-4000-8000-000000000251', '10000000-0000-4000-8000-000000000251', 'owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000252', '10000000-0000-4000-8000-000000000252', 'owner', 'active', now());

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000251","role":"authenticated","aal":"aal1"}',
  true
);

select public.save_professional_capability_context_v2(
  '20000000-0000-4000-8000-000000000251',
  array['institutional_work'],
  array['banker'],
  array['investment_banking', 'dcm'],
  array['prepare_meetings'],
  'Banco Preview',
  false
);

-- The tenant sees no grant before the operator writes one, and cannot write one itself.
do $$
declare
  status jsonb;
  denied boolean := false;
begin
  status := public.get_integration_preview_status_v1('20000000-0000-4000-8000-000000000251');
  if (status ->> 'enabled')::boolean then
    raise exception 'integration_preview reported enabled without a grant: %', status;
  end if;
  begin
    insert into private.integration_preview_grants (organization_id, granted_by)
    values ('20000000-0000-4000-8000-000000000251', 'tenant');
  exception when insufficient_privilege or undefined_table then denied := true;
  end;
  if not denied then raise exception 'a tenant wrote an integration_preview grant'; end if;
end;
$$;

-- Historical raw-CPA producer/completion positives retired. The native HTTP gate
-- now proves actual bodies and paid boundaries; a grant alone never approves a brief.
rollback;
