-- Public research cache: public-only project gate, capability binding, replay and no Data API
-- access. Fixtures are rolled back.

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values (
  '10000000-0000-4000-8000-000000000291', 'authenticated', 'authenticated',
  'public-cache-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, now(), now(), false, false
);
insert into public.organizations (id, organization_type, name, created_by) values (
  '20000000-0000-4000-8000-000000000291', 'originator', 'Public Cache Workspace',
  '10000000-0000-4000-8000-000000000291'
);
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values (
  '20000000-0000-4000-8000-000000000291', '10000000-0000-4000-8000-000000000291',
  'owner', 'active', now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000291","role":"authenticated","aal":"aal1"}',
  true
);

create temporary table cache_test_ids (session_id uuid, project_id uuid, run_id uuid, job_id uuid);
create temporary table cache_test_claim (job_id uuid, capability_token text, query_id text);
do $$
declare
  session_id uuid;
  project_id uuid;
  run_id uuid := '40000000-0000-4000-8000-000000000291';
  job_id uuid := '50000000-0000-4000-8000-000000000291';
begin
  session_id := public.start_public_capital_project(
    'pt-BR', 'Projeto Cache Público', 'company_debt_view', 'Companhia Cache S.A.', ''
  );
  select session.capital_project_id into project_id
  from public.document_intake_sessions session where session.id = session_id;
  insert into cache_test_ids values (session_id, project_id, run_id, job_id);
end;
$$;

reset role;
do $$
declare ids cache_test_ids%rowtype;
begin
  select * into ids from cache_test_ids;
  insert into public.processing_runs (
    id, organization_id, intake_session_id, run_no, trigger, status,
    pipeline_version, budget, versions, created_by
  ) values (
    ids.run_id, '20000000-0000-4000-8000-000000000291', ids.session_id, 1, 'manual', 'queued',
    'public-cache-test-v1', '{}', '{}', '10000000-0000-4000-8000-000000000291'
  );
  insert into public.processing_jobs (
    id, organization_id, processing_run_id, intake_session_id, kind, payload, max_attempts
  ) values (
    ids.job_id, '20000000-0000-4000-8000-000000000291', ids.run_id, ids.session_id,
    'capital_project_analysis', jsonb_build_object(
      'analysis_scope', 'company_debt_view', 'locale', 'pt-BR',
      'capital_project_id', ids.project_id,
      'capital_project_plan_id', '60000000-0000-4000-8000-000000000291',
      'capital_project_brief_id', '70000000-0000-4000-8000-000000000291',
      'capital_task_ids', jsonb_build_array('M01'), 'capital_artifact_required', true,
      'model_budget', jsonb_build_object('max_cost_usd', 0.10, 'max_calls', 1)
    ), 2
  );
  insert into private.worker_tokens (label, token_sha256)
  values ('public-cache-worker-test', extensions.digest(repeat('w', 64), 'sha256'))
  on conflict (token_sha256) do update set status = 'active', revoked_at = null;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000291","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  claim jsonb;
  query_text text := 'Companhia Cache site oficial';
  query_id text;
  entries jsonb;
  loaded jsonb;
  rejected boolean := false;
begin
  claim := public.worker_claim_job(repeat('w', 64), 600);
  query_id := encode(extensions.digest(convert_to('identity:' || query_text, 'utf8'), 'sha256'), 'hex');
  entries := jsonb_build_array(jsonb_build_object(
    'schemaVersion', 'public-research-cache.v1', 'queryId', query_id,
    'query', jsonb_build_object(
      'id', query_id, 'topic', 'identity', 'query', query_text, 'domainAllowlist', '[]'::jsonb
    ),
    'sources', jsonb_build_array(jsonb_build_object(
      'provider', 'official', 'topic', 'identity', 'title', 'Fonte oficial',
      'url', 'https://dados.cvm.gov.br/teste', 'snippet', 'Material público.',
      'publishedAt', null, 'retrievedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'contentHash', repeat('a', 64)
    )),
    'storedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'validUntil', to_char((now() + interval '24 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'reusePolicy', 'public_raw_material_only'
  ));
  perform public.worker_store_public_research_cache(
    (claim ->> 'job_id')::uuid, claim ->> 'capability_token', entries
  );
  loaded := public.worker_load_public_research_cache(
    (claim ->> 'job_id')::uuid, claim ->> 'capability_token', array[query_id]
  );
  if jsonb_array_length(loaded) <> 1
    or loaded #>> '{0,reusePolicy}' <> 'public_raw_material_only'
    or loaded #>> '{0,query,query}' <> query_text then
    raise exception 'public cache did not replay the exact public record: %', loaded;
  end if;

  begin
    perform public.worker_load_public_research_cache(
      (claim ->> 'job_id')::uuid, repeat('x', 64), array[query_id]
    );
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'public cache accepted a guessed capability'; end if;
  insert into cache_test_claim values (
    (claim ->> 'job_id')::uuid, claim ->> 'capability_token', query_id
  );
end;
$$;

reset role;
update public.capital_projects
set access_basis = 'authorized_private'
where id = (select project_id from cache_test_ids);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000291","role":"authenticated","aal":"aal1"}',
  true
);
do $$
declare
  claim cache_test_claim%rowtype;
  rejected boolean := false;
begin
  select * into claim from cache_test_claim;
  begin
    perform public.worker_load_public_research_cache(
      claim.job_id, claim.capability_token, array[claim.query_id]
    );
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'private project could read the cross-project public cache'; end if;
end;
$$;

reset role;
do $$
declare rejected boolean := false;
begin
  set local role anon;
  begin
    perform count(*) from private.public_research_query_cache;
  exception when insufficient_privilege then rejected := true;
  end;
  reset role;
  if not rejected then raise exception 'anonymous role read the private public-research cache'; end if;
end;
$$;

rollback;
