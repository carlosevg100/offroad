-- Governed capital-project material storage: one leased worker capability may write exactly
-- one content-addressed object, the project member may read it, and an unrelated tenant may not.

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  ('10000000-0000-4000-8000-000000000761', 'authenticated', 'authenticated',
   'material-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
   '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000762', 'authenticated', 'authenticated',
   'material-worker@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
   '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000763', 'authenticated', 'authenticated',
   'material-outsider@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
   '{}'::jsonb, now(), now(), false, false);

insert into public.organizations (id, organization_type, name, created_by) values
  ('20000000-0000-4000-8000-000000000761', 'originator', 'Material Owner Tenant',
   '10000000-0000-4000-8000-000000000761'),
  ('20000000-0000-4000-8000-000000000763', 'originator', 'Material Outsider Tenant',
   '10000000-0000-4000-8000-000000000763');

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values
  ('20000000-0000-4000-8000-000000000761', '10000000-0000-4000-8000-000000000761', 'owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000763', '10000000-0000-4000-8000-000000000763', 'owner', 'active', now());

insert into public.capital_projects (id, organization_id, project_name, entry_job, created_by) values (
  '30000000-0000-4000-8000-000000000761', '20000000-0000-4000-8000-000000000761',
  'Governed Material Test', 'prepare_materials_and_process', '10000000-0000-4000-8000-000000000761'
);

insert into public.document_intake_sessions (
  id, organization_id, capital_project_id, started_by, journey, locale
) values (
  '40000000-0000-4000-8000-000000000761', '20000000-0000-4000-8000-000000000761',
  '30000000-0000-4000-8000-000000000761', '10000000-0000-4000-8000-000000000761',
  'company', 'pt-BR'
);

insert into public.processing_runs (
  id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
) values (
  '70000000-0000-4000-8000-000000000761', '20000000-0000-4000-8000-000000000761',
  '40000000-0000-4000-8000-000000000761', 1, 'manual', 'running', 'material-storage-test-v1',
  '10000000-0000-4000-8000-000000000761'
);

insert into public.processing_jobs (
  id, organization_id, processing_run_id, intake_session_id, kind, status, payload,
  attempts, lease_expires_at, capability_sha256
) values (
  '80000000-0000-4000-8000-000000000761', '20000000-0000-4000-8000-000000000761',
  '70000000-0000-4000-8000-000000000761', '40000000-0000-4000-8000-000000000761',
  'capital_project_analysis', 'leased',
  '{"capital_project_id":"30000000-0000-4000-8000-000000000761"}'::jsonb,
  1, now() + interval '10 minutes', extensions.digest(repeat('c', 64), 'sha256')
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000762","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  authorized jsonb;
  completed jsonb;
  object_path text;
  sibling_path text;
  sibling_rejected boolean := false;
begin
  authorized := public.worker_authorize_capital_project_material_upload_v1(
    '80000000-0000-4000-8000-000000000761', repeat('c', 64), repeat('a', 64), 128,
    'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  object_path := authorized ->> 'object_path';
  sibling_path := replace(object_path, repeat('a', 64), repeat('b', 64));

  if object_path <> concat(
    '20000000-0000-4000-8000-000000000761/',
    '30000000-0000-4000-8000-000000000761/materials/', repeat('a', 64), '.xlsx'
  ) or (authorized ->> 'replayed')::boolean then
    raise exception 'upload authorization did not mint the exact expected path: %', authorized;
  end if;

  begin
    insert into storage.objects (bucket_id, name, owner_id)
    values ('case-artifacts', sibling_path, '10000000-0000-4000-8000-000000000762');
  exception when insufficient_privilege then
    sibling_rejected := true;
  end;
  if not sibling_rejected then
    raise exception 'worker capability allowed a sibling object path';
  end if;

  insert into storage.objects (bucket_id, name, owner_id)
  values ('case-artifacts', object_path, '10000000-0000-4000-8000-000000000762');

  completed := public.worker_complete_capital_project_material_upload_v1(
    '80000000-0000-4000-8000-000000000761', repeat('c', 64),
    (authorized ->> 'grant_id')::uuid, 'storage-etag-test'
  );
  if completed ->> 'object_path' <> object_path
    or completed ->> 'storage_etag' <> 'storage-etag-test'
    or (completed ->> 'replayed')::boolean then
    raise exception 'stored material was not closed correctly: %', completed;
  end if;

  if (select state from private.capital_project_material_upload_grants
      where id = (authorized ->> 'grant_id')::uuid) <> 'stored' then
    raise exception 'material grant did not reach stored state';
  end if;
end;
$$;

-- The project member can read the completed object even though the worker created it.
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000761","role":"authenticated","aal":"aal1"}',
  true
);

do $$
begin
  if (select count(*) from storage.objects
      where bucket_id = 'case-artifacts' and name like '%/materials/%') <> 1 then
    raise exception 'project member could not read the governed material';
  end if;
end;
$$;

-- An authenticated user from another tenant cannot discover the object.
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000763","role":"authenticated","aal":"aal1"}',
  true
);

do $$
begin
  if exists (select 1 from storage.objects
             where bucket_id = 'case-artifacts' and name like '%/materials/%') then
    raise exception 'unrelated tenant could read the governed material';
  end if;
end;
$$;

rollback;
