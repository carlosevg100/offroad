begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  ('10000000-0000-4000-8000-000000000731', 'authenticated', 'authenticated',
   'supplement-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000732', 'authenticated', 'authenticated',
   'supplement-worker@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false);

insert into public.organizations (id, organization_type, name, created_by) values (
  '20000000-0000-4000-8000-000000000731', 'originator', 'Supplement Tenant',
  '10000000-0000-4000-8000-000000000731'
);
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values (
  '20000000-0000-4000-8000-000000000731', '10000000-0000-4000-8000-000000000731',
  'owner', 'active', now()
);
insert into public.capital_projects (id, organization_id, project_name, entry_job, created_by) values (
  '30000000-0000-4000-8000-000000000731', '20000000-0000-4000-8000-000000000731',
  'Receivables Supplement Test', 'capital_planning', '10000000-0000-4000-8000-000000000731'
);
insert into public.document_intake_sessions (
  id, organization_id, capital_project_id, started_by, journey, locale
) values (
  '40000000-0000-4000-8000-000000000731', '20000000-0000-4000-8000-000000000731',
  '30000000-0000-4000-8000-000000000731', '10000000-0000-4000-8000-000000000731',
  'company', 'pt-BR'
);
insert into public.processing_runs (
  id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
) values (
  '70000000-0000-4000-8000-000000000731', '20000000-0000-4000-8000-000000000731',
  '40000000-0000-4000-8000-000000000731', 1, 'manual', 'running', 'supplement-store-test-v1',
  '10000000-0000-4000-8000-000000000731'
);
insert into public.processing_jobs (
  id, organization_id, processing_run_id, intake_session_id, kind, status, payload,
  attempts, lease_expires_at, capability_sha256
) values (
  '80000000-0000-4000-8000-000000000731', '20000000-0000-4000-8000-000000000731',
  '70000000-0000-4000-8000-000000000731', '40000000-0000-4000-8000-000000000731',
  'case_analysis', 'leased', '{"analysis_scope":"full_case"}'::jsonb, 1,
  now() + interval '10 minutes', extensions.digest(repeat('u',64), 'sha256')
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000732","role":"authenticated","aal":"aal1"}', true);

do $$
declare
  patch jsonb := jsonb_build_object(
    'schemaVersion','2026.09.07-v1','patchId','document:cash-1','sourceDatasetHash',repeat('a',64),
    'suppliedBy',jsonb_build_object('actorType','document_worker','actorId','worker-1','suppliedAt','2026-09-07T00:00:00.000Z','evidence',jsonb_build_array(jsonb_build_object('sourceClass','provided_document','sourceId','cash-1','anchor','row:1'))),
    'sections',jsonb_build_object('cashReceipts',jsonb_build_object('value',jsonb_build_array())),
    'evidence',jsonb_build_object('cashReconciliation',jsonb_build_array(jsonb_build_object('sourceClass','provided_document','sourceId','cash-1','anchor','row:1')))
  );
  draft jsonb := jsonb_build_object(
    'schemaVersion','2026.09.07-v1','sourceDatasetHash',repeat('a',64),'revision',1,
    'appliedPatchIds',jsonb_build_array('document:cash-1'),'sections',jsonb_build_object(),
    'evidence',jsonb_build_object(),'conflicts',jsonb_build_array()
  );
  first_result jsonb;
  replay_result jsonb;
  loaded jsonb;
  case_input jsonb;
  accepted boolean;
begin
  first_result := public.worker_apply_receivables_method_supplement_patch_v1(
    '80000000-0000-4000-8000-000000000731', repeat('u',64), patch, draft
  );
  if (first_result ->> 'replayed')::boolean
    or first_result ->> 'revision' <> '1'
    or coalesce(first_result ->> 'draft_fingerprint','') !~ '^[0-9a-f]{64}$' then
    raise exception 'supplement patch was not recorded: %', first_result;
  end if;

  replay_result := public.worker_apply_receivables_method_supplement_patch_v1(
    '80000000-0000-4000-8000-000000000731', repeat('u',64), patch, draft
  );
  if replay_result ->> 'draft_id' <> first_result ->> 'draft_id'
    or not (replay_result ->> 'replayed')::boolean then
    raise exception 'identical supplement patch did not replay: %', replay_result;
  end if;

  loaded := public.worker_load_receivables_method_supplement_draft_v1(
    '80000000-0000-4000-8000-000000000731', repeat('u',64)
  );
  if loaded -> 'draft' <> draft or loaded ->> 'revision' <> '1' then
    raise exception 'supplement draft did not round-trip: %', loaded;
  end if;

  case_input := public.worker_load_case_input(
    '80000000-0000-4000-8000-000000000731', repeat('u',64)
  );
  if case_input #>> '{receivables_method_supplement_draft,draft,sourceDatasetHash}' <> repeat('a',64) then
    raise exception 'private supplement was not attached to case input: %', case_input;
  end if;

  begin
    perform public.worker_load_receivables_method_supplement_draft_v1(
      '80000000-0000-4000-8000-000000000731', repeat('x',64)
    );
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'invalid capability loaded the private supplement'; end if;

  begin
    perform public.worker_apply_receivables_method_supplement_patch_v1(
      '80000000-0000-4000-8000-000000000731', repeat('u',64),
      jsonb_set(patch, '{patchId}', '"document:cash-2"'::jsonb),
      jsonb_set(jsonb_set(draft, '{appliedPatchIds}', '["document:cash-1","document:cash-2"]'::jsonb), '{revision}', '3'::jsonb)
    );
    accepted := true;
  exception when serialization_failure then accepted := false;
  end;
  if accepted then raise exception 'a skipped supplement revision was accepted'; end if;
end;
$$;

-- Workspace users cannot query exact patches or drafts through the Data API role.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000731","role":"authenticated","aal":"aal1"}', true);
do $$
declare accepted boolean;
begin
  begin
    perform 1 from private.receivables_method_supplement_patches;
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant role read private supplement patches'; end if;
  begin
    perform 1 from private.receivables_method_supplement_drafts;
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant role read private supplement drafts'; end if;
end;
$$;

rollback;
