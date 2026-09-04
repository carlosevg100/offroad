-- Shadow envelopes are tenant data written only by the worker: members read, nobody writes
-- through the Data API, and another tenant sees nothing.

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  ('10000000-0000-4000-8000-000000000501', 'authenticated', 'authenticated',
   'envelope-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000502', 'authenticated', 'authenticated',
   'envelope-stranger@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false);

insert into public.organizations (id, organization_type, name, created_by) values
  ('20000000-0000-4000-8000-000000000501', 'originator', 'Envelope Workspace A', '10000000-0000-4000-8000-000000000501'),
  ('20000000-0000-4000-8000-000000000502', 'originator', 'Envelope Workspace B', '10000000-0000-4000-8000-000000000502');
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values
  ('20000000-0000-4000-8000-000000000501', '10000000-0000-4000-8000-000000000501', 'owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000502', '10000000-0000-4000-8000-000000000502', 'owner', 'active', now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000501","role":"authenticated","aal":"aal1"}', true);

do $$
declare
  accepted boolean := true;
begin
  -- Reading an empty table is allowed; writing it directly is not, for anyone.
  if (select count(*) from public.intent_envelopes where organization_id = '20000000-0000-4000-8000-000000000501') <> 0 then
    raise exception 'unexpected envelopes';
  end if;
  begin
    insert into public.intent_envelopes (organization_id, message_id, processing_job_id, envelope, model)
    values ('20000000-0000-4000-8000-000000000501', gen_random_uuid(), gen_random_uuid(),
            '{"schemaVersion":"intent-envelope.v1"}'::jsonb, 'anthropic/claude-sonnet-5');
    accepted := true;
  exception when insufficient_privilege or foreign_key_violation then accepted := false;
  end;
  if accepted then raise exception 'the Data API accepted a direct envelope insert'; end if;

  -- The command exists for the worker and refuses a caller without a job capability.
  begin
    perform public.worker_record_intent_envelope(gen_random_uuid(), 'not-a-capability',
      '{"schemaVersion":"intent-envelope.v1"}'::jsonb, '{}'::jsonb, 'anthropic/claude-sonnet-5', 0);
    accepted := true;
  exception when others then accepted := false;
  end;
  if accepted then raise exception 'a caller without a capability recorded an envelope'; end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000502","role":"authenticated","aal":"aal1"}', true);
do $$
begin
  if (select count(*) from public.intent_envelopes where organization_id = '20000000-0000-4000-8000-000000000501') <> 0 then
    raise exception 'tenant B read tenant A envelopes';
  end if;
end;
$$;

do $$
begin
  if has_table_privilege('anon', 'public.intent_envelopes', 'select')
    or has_table_privilege('authenticated', 'public.intent_envelopes', 'insert')
    or has_table_privilege('authenticated', 'public.intent_envelopes', 'update')
    or has_function_privilege('anon', 'public.worker_record_intent_envelope(uuid, text, jsonb, jsonb, text, numeric)', 'execute') then
    raise exception 'envelope grants are wider than the design';
  end if;
end;
$$;

select 'intent_envelopes_shadow_passed' as result;

rollback;
