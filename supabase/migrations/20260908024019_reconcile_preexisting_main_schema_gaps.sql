-- Forward reconciliation of pre-existing main schema omissions observed in staging/production.
-- Fresh databases already have these objects. Never replay an old worker definition over the
-- approval capability, pending-job accounting or stale-retry protections installed later.
-- No tenant data is read or rewritten by this migration.

do $reconcile$
declare
  definition text;
  assertion_anchor text := 'will_retry := coalesce(p_retryable, true)';
begin
  if to_regclass('public.intent_envelopes') is null
    or to_regprocedure('private.worker_load_capital_project_context_v6(uuid,text)') is null
    or to_regprocedure('private.job_for_failure_capability(uuid,text)') is null
    or to_regprocedure('private.can_access_document_scope(uuid,uuid,text)') is null then
    raise exception 'main schema reconciliation prerequisites missing';
  end if;

  if to_regclass('private.intent_objective_routing_metrics_by_day') is null then
    execute $metrics$
-- Shadow semantic-routing observability. The model-classified objective and the compatibility
-- objective are already stored inside intent_envelopes.classifier. This view turns that signal
-- into aggregate, content-free evidence for deciding whether the semantic route is safe to
-- promote. It never exposes messages, envelopes, organization/project identifiers or documents.

create or replace view private.intent_objective_routing_metrics_by_day
with (security_invoker = true) as
  select
    envelope.created_at::date as day,
    envelope.model,
    case
      when envelope.classifier #>> '{objectiveRouting,schemaVersion}' = 'objective-routing-observation.v1'
        then 'recorded'
      else 'not_recorded'
    end as observation_state,
    coalesce(envelope.classifier #>> '{objectiveRouting,semantic,status}', 'unavailable') as semantic_status,
    coalesce(envelope.classifier #>> '{objectiveRouting,semantic,objectiveKind}', 'unavailable') as semantic_objective_kind,
    coalesce(envelope.classifier #>> '{objectiveRouting,compatibility,objectiveKind}', 'unavailable') as compatibility_objective_kind,
    case envelope.classifier #>> '{objectiveRouting,objectiveKindAgreement}'
      when 'true' then true
      when 'false' then false
      else null
    end as objective_kind_agreement,
    coalesce(envelope.classifier #>> '{objectiveRouting,semantic,reasonCode}', 'unavailable') as reason_code,
    count(*) as observations,
    round(avg(
      case
        when (envelope.classifier #>> '{objectiveRouting,semantic,confidence}')
          ~ '^(0(\.[0-9]+)?|1(\.0+)?)$'
          then (envelope.classifier #>> '{objectiveRouting,semantic,confidence}')::numeric
        else null
      end
    ), 4) as average_semantic_confidence,
    round(sum(envelope.cost_usd), 4) as classifier_cost_usd
  from public.intent_envelopes envelope
  group by
    envelope.created_at::date,
    envelope.model,
    observation_state,
    semantic_status,
    semantic_objective_kind,
    compatibility_objective_kind,
    objective_kind_agreement,
    reason_code;

comment on view private.intent_objective_routing_metrics_by_day is
  'Content-free daily shadow metrics for semantic objective routing versus the compatibility route. '
  'No tenant, message, project, envelope or document content is exposed.';

revoke all on private.intent_objective_routing_metrics_by_day from public, anon, authenticated;
$metrics$;
  end if;

  if to_regclass('private.capital_project_material_upload_grants') is null then
    if to_regprocedure('public.worker_authorize_capital_project_material_upload_v1(uuid,text,text,bigint,text,text)') is not null
      or to_regprocedure('public.worker_complete_capital_project_material_upload_v1(uuid,text,uuid,text)') is not null then
      raise exception 'partial material storage schema: refusing reconciliation';
    end if;
    execute $storage$
-- Governed binary materials for capital projects.
--
-- The worker intentionally has no service-role key. A leased job therefore receives a narrow,
-- short-lived database grant for one content-addressed object path. Storage RLS accepts only that
-- exact path, and the worker re-downloads and hashes the bytes before closing the grant.

create table private.capital_project_material_upload_grants (
  id uuid primary key default gen_random_uuid(),
  worker_account_id uuid not null references auth.users(id) on delete restrict,
  organization_id uuid not null,
  capital_project_id uuid not null,
  processing_job_id uuid not null,
  object_path text not null unique check (char_length(object_path) between 80 and 1000),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  byte_length bigint not null check (byte_length between 1 and 104857600),
  format text not null check (format in ('xlsx', 'pptx', 'docx')),
  mime_type text not null,
  state text not null default 'authorized' check (state in ('authorized', 'stored', 'failed')),
  storage_etag text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  stored_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, processing_job_id)
    references public.processing_jobs(organization_id, id) on delete cascade,
  check (
    (state = 'stored' and storage_etag is not null and stored_at is not null)
    or (state <> 'stored' and storage_etag is null and stored_at is null)
  )
);

create index capital_project_material_upload_grants_active_idx
  on private.capital_project_material_upload_grants (worker_account_id, object_path, expires_at)
  where state in ('authorized', 'stored');

revoke all on private.capital_project_material_upload_grants from public, anon, authenticated;

create or replace function private.worker_can_access_capital_project_material(
  p_object_path text,
  p_write boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from private.capital_project_material_upload_grants grant_row
      where grant_row.worker_account_id = (select auth.uid())
        and grant_row.object_path = p_object_path
        and grant_row.expires_at > now()
        and (
          (p_write and grant_row.state = 'authorized')
          or (not p_write and grant_row.state in ('authorized', 'stored'))
        )
    );
$$;

revoke all on function private.worker_can_access_capital_project_material(text, boolean)
  from public, anon, authenticated;
grant execute on function private.worker_can_access_capital_project_material(text, boolean)
  to authenticated;

create or replace function private.can_read_completed_capital_project_material(
  p_organization_id uuid,
  p_capital_project_id uuid,
  p_object_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from private.capital_project_material_upload_grants grant_row
      join public.capital_projects project
        on project.organization_id = grant_row.organization_id
        and project.id = grant_row.capital_project_id
      join public.organization_memberships membership
        on membership.organization_id = grant_row.organization_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
      where grant_row.organization_id = p_organization_id
        and grant_row.capital_project_id = p_capital_project_id
        and grant_row.object_path = p_object_path
        and grant_row.state = 'stored'
        and project.status <> 'archived'
    );
$$;

revoke all on function private.can_read_completed_capital_project_material(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function private.can_read_completed_capital_project_material(uuid, uuid, text)
  to authenticated;

drop policy if exists case_artifacts_objects_select on storage.objects;
create policy case_artifacts_objects_select
on storage.objects for select to authenticated
using (
  bucket_id = 'case-artifacts'
  and (
    -- `materials/` is a publication boundary, not an ordinary project document folder.
    -- The pre-existing document capability is intentionally broad enough to read project
    -- documents, so exclude this namespace before consulting it; otherwise a project member
    -- can observe the bytes between upload and independent hash verification.
    (
      split_part(name, '/', 3) <> 'materials'
      and (select private.can_access_document_scope(
        private.storage_organization_id(name),
        private.storage_opportunity_id(name),
        'document.read'
      ))
    )
    or (select private.can_read_completed_capital_project_material(
      private.storage_organization_id(name),
      private.storage_opportunity_id(name),
      name
    ))
    or (select private.worker_can_access_capital_project_material(name, false))
  )
);

drop policy if exists case_artifacts_objects_insert on storage.objects;
create policy case_artifacts_objects_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'case-artifacts'
  and (
    -- Generated materials enter this namespace only through an exact, single-use worker
    -- capability. A normal project-document write grant must not bypass that boundary.
    (
      split_part(name, '/', 3) <> 'materials'
      and (select private.can_access_document_scope(
        private.storage_organization_id(name),
        private.storage_opportunity_id(name),
        'document.write'
      ))
    )
    or (select private.worker_can_access_capital_project_material(name, true))
  )
);

create or replace function private.worker_authorize_capital_project_material_upload_v1(
  p_job_id uuid,
  p_capability_token text,
  p_content_sha256 text,
  p_byte_length bigint,
  p_format text,
  p_mime_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  project_id uuid;
  expected_mime text;
  target_path text;
  grant_row private.capital_project_material_upload_grants;
begin
  if job_row.kind <> 'capital_project_analysis'
    or coalesce(p_content_sha256, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_byte_length, 0) not between 1 and 104857600
    or p_format not in ('xlsx', 'pptx', 'docx') then
    raise exception 'capital_project_material_upload_invalid' using errcode = '22023';
  end if;
  begin
    project_id := (job_row.payload ->> 'capital_project_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'capital_project_material_project_invalid' using errcode = '22023';
  end;
  if project_id is null or not exists (
    select 1 from public.capital_projects project
    where project.organization_id = job_row.organization_id
      and project.id = project_id
      and project.status <> 'archived'
  ) then
    raise exception 'capital_project_material_project_not_available' using errcode = 'P0002';
  end if;

  expected_mime := case p_format
    when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    when 'pptx' then 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  end;
  if p_mime_type is distinct from expected_mime then
    raise exception 'capital_project_material_mime_invalid' using errcode = '22023';
  end if;
  target_path := format('%s/%s/materials/%s.%s', job_row.organization_id, project_id, p_content_sha256, p_format);

  delete from private.capital_project_material_upload_grants expired
  where expired.expires_at <= now() and expired.state <> 'stored';

  insert into private.capital_project_material_upload_grants (
    worker_account_id, organization_id, capital_project_id, processing_job_id,
    object_path, content_sha256, byte_length, format, mime_type, expires_at
  ) values (
    (select auth.uid()), job_row.organization_id, project_id, job_row.id,
    target_path, p_content_sha256, p_byte_length, p_format, p_mime_type,
    least(job_row.lease_expires_at, now() + interval '15 minutes')
  )
  on conflict (object_path) do update
  set worker_account_id = excluded.worker_account_id,
      processing_job_id = excluded.processing_job_id,
      expires_at = case
        when private.capital_project_material_upload_grants.state = 'stored'
          then greatest(private.capital_project_material_upload_grants.expires_at, excluded.expires_at)
        else excluded.expires_at
      end,
      state = case when private.capital_project_material_upload_grants.state = 'stored' then 'stored' else 'authorized' end
  where private.capital_project_material_upload_grants.organization_id = excluded.organization_id
    and private.capital_project_material_upload_grants.capital_project_id = excluded.capital_project_id
    and private.capital_project_material_upload_grants.content_sha256 = excluded.content_sha256
    and private.capital_project_material_upload_grants.byte_length = excluded.byte_length
    and private.capital_project_material_upload_grants.format = excluded.format
    and private.capital_project_material_upload_grants.mime_type = excluded.mime_type
  returning * into grant_row;

  if grant_row.id is null then
    raise exception 'capital_project_material_upload_conflict' using errcode = '23505';
  end if;
  return jsonb_build_object(
    'grant_id', grant_row.id,
    'object_path', grant_row.object_path,
    'state', grant_row.state,
    'storage_etag', grant_row.storage_etag,
    'replayed', grant_row.state = 'stored'
  );
end;
$$;

create or replace function public.worker_authorize_capital_project_material_upload_v1(
  p_job_id uuid,
  p_capability_token text,
  p_content_sha256 text,
  p_byte_length bigint,
  p_format text,
  p_mime_type text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_authorize_capital_project_material_upload_v1(
    p_job_id, p_capability_token, p_content_sha256, p_byte_length, p_format, p_mime_type
  );
$$;

create or replace function private.worker_complete_capital_project_material_upload_v1(
  p_job_id uuid,
  p_capability_token text,
  p_grant_id uuid,
  p_storage_etag text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  grant_row private.capital_project_material_upload_grants;
begin
  if p_grant_id is null or char_length(trim(coalesce(p_storage_etag, ''))) not between 1 and 500 then
    raise exception 'capital_project_material_completion_invalid' using errcode = '22023';
  end if;
  select * into grant_row
  from private.capital_project_material_upload_grants grant_item
  where grant_item.id = p_grant_id
    and grant_item.organization_id = job_row.organization_id
    and grant_item.processing_job_id = job_row.id
    and grant_item.worker_account_id = (select auth.uid())
    and grant_item.expires_at > now()
  for update;
  if not found then
    raise exception 'capital_project_material_upload_grant_not_available' using errcode = 'P0002';
  end if;
  if grant_row.state = 'stored' then
    if grant_row.storage_etag is distinct from p_storage_etag then
      raise exception 'capital_project_material_upload_already_completed' using errcode = '23505';
    end if;
    return jsonb_build_object('object_path', grant_row.object_path, 'storage_etag', grant_row.storage_etag, 'replayed', true);
  end if;
  if grant_row.state <> 'authorized' or not exists (
    select 1 from storage.objects object_row
    where object_row.bucket_id = 'case-artifacts' and object_row.name = grant_row.object_path
  ) then
    raise exception 'capital_project_material_object_not_stored' using errcode = 'P0002';
  end if;
  update private.capital_project_material_upload_grants grant_item
  set state = 'stored', storage_etag = trim(p_storage_etag), stored_at = now()
  where grant_item.id = grant_row.id;
  return jsonb_build_object('object_path', grant_row.object_path, 'storage_etag', trim(p_storage_etag), 'replayed', false);
end;
$$;

create or replace function public.worker_complete_capital_project_material_upload_v1(
  p_job_id uuid,
  p_capability_token text,
  p_grant_id uuid,
  p_storage_etag text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_complete_capital_project_material_upload_v1(
    p_job_id, p_capability_token, p_grant_id, p_storage_etag
  );
$$;

revoke all on function private.worker_authorize_capital_project_material_upload_v1(uuid, text, text, bigint, text, text)
  from public, anon, authenticated;
revoke all on function private.worker_complete_capital_project_material_upload_v1(uuid, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.worker_authorize_capital_project_material_upload_v1(uuid, text, text, bigint, text, text)
  from public, anon;
revoke all on function public.worker_complete_capital_project_material_upload_v1(uuid, text, uuid, text)
  from public, anon;
grant execute on function private.worker_authorize_capital_project_material_upload_v1(uuid, text, text, bigint, text, text)
  to authenticated;
grant execute on function private.worker_complete_capital_project_material_upload_v1(uuid, text, uuid, text)
  to authenticated;
grant execute on function public.worker_authorize_capital_project_material_upload_v1(uuid, text, text, bigint, text, text)
  to authenticated;
grant execute on function public.worker_complete_capital_project_material_upload_v1(uuid, text, uuid, text)
  to authenticated;

comment on table private.capital_project_material_upload_grants is
  'Short-lived, content-addressed Storage capabilities for one leased capital-project job; never exposed through the Data API.';
comment on function public.worker_authorize_capital_project_material_upload_v1(uuid, text, text, bigint, text, text) is
  'Mints one exact case-artifacts path under a leased job capability; it does not grant bucket-wide access.';
$storage$;
  end if;
  -- Existing implementations are preserved; a partial deployment must be reviewed, not hidden.
  if to_regprocedure('public.worker_authorize_capital_project_material_upload_v1(uuid,text,text,bigint,text,text)') is null
    or to_regprocedure('private.worker_authorize_capital_project_material_upload_v1(uuid,text,text,bigint,text,text)') is null
    or to_regprocedure('public.worker_complete_capital_project_material_upload_v1(uuid,text,uuid,text)') is null
    or to_regprocedure('private.worker_complete_capital_project_material_upload_v1(uuid,text,uuid,text)') is null
    or not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='case_artifacts_objects_select' and qual like '%can_read_completed_capital_project_material%')
    or not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='case_artifacts_objects_insert' and with_check like '%worker_can_access_capital_project_material%') then
    raise exception 'material storage reconciliation incomplete';
  end if;

  select pg_get_functiondef('private.worker_load_capital_project_context_v6(uuid,text)'::regprocedure) into definition;
  if position('select distinct on (plan_task.task_id, artifact.artifact_type)' in definition)=0 then
    execute $artifacts$
-- A terminal preview task writes both its method artifact and the cross-surface decision contract.
-- The context loader used to keep only one row per task id, so the newer decision contract hid the
-- method artifact. On the following turn this erased the previous meeting brief and, with it, the
-- unanswered governed questions. Keep the latest row per task *and artifact type* instead.

do $$
declare
  function_definition text := pg_get_functiondef(
    'private.worker_load_capital_project_context_v6(uuid,text)'::regprocedure
  );
  old_distinct text := 'select distinct on (plan_task.task_id)';
  new_distinct text := 'select distinct on (plan_task.task_id, artifact.artifact_type)';
  old_inner_order text := 'order by plan_task.task_id, artifact.created_at desc, artifact.id desc';
  new_inner_order text := 'order by plan_task.task_id, artifact.artifact_type, artifact.created_at desc, artifact.id desc';
  old_outer_order text := ') order by latest.task_id)';
  new_outer_order text := ') order by latest.task_id, latest.artifact_type)';
begin
  if position(old_distinct in function_definition) = 0
    or position(old_inner_order in function_definition) = 0
    or position(old_outer_order in function_definition) = 0 then
    raise exception 'capital project context artifact selection drifted; refusing unsafe rewrite';
  end if;

  execute replace(
    replace(
      replace(function_definition, old_distinct, new_distinct),
      old_inner_order, new_inner_order
    ),
    old_outer_order, new_outer_order
  );
end;
$$;

comment on function private.worker_load_capital_project_context_v6(uuid, text) is
  'Loads governed project context and the latest artifact per task and artifact type, preserving method memory alongside cross-surface decision contracts.';
$artifacts$;
  end if;

  if to_regprocedure('private.assert_job_failure_record(jsonb)') is null then
    execute $failure_assert$
-- A failed job that cannot explain itself is refused, not recorded.
--
-- The worker now builds every failure with the envelope (code, stage, retryable, cause). The
-- observability views find historical rows without a cause; this migration stops new ones at
-- the boundary: `worker_fail_job` asserts the shape before writing, so a regression in any
-- executor surfaces as a refused call, not as a silent row.

create or replace function private.assert_job_failure_record(p_error jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  cause jsonb := p_error -> 'cause';
begin
  if p_error is null or jsonb_typeof(p_error) <> 'object' then
    raise exception 'invalid_failure_record' using errcode = '22023', detail = 'error must be an object';
  end if;
  if coalesce(p_error ->> 'code', '') !~ '^[a-z0-9_]{3,120}$' then
    raise exception 'invalid_failure_record' using errcode = '22023', detail = 'code missing or malformed';
  end if;
  if coalesce(p_error ->> 'stage', '') = '' or char_length(p_error ->> 'stage') > 80 then
    raise exception 'invalid_failure_record' using errcode = '22023', detail = 'stage missing';
  end if;
  if jsonb_typeof(p_error -> 'retryable') <> 'boolean' then
    raise exception 'invalid_failure_record' using errcode = '22023', detail = 'retryable must be boolean';
  end if;
  if cause is null or jsonb_typeof(cause) <> 'object' then
    raise exception 'invalid_failure_record' using errcode = '22023', detail = 'cause missing';
  end if;
  if coalesce(cause ->> 'name', '') = '' or char_length(cause ->> 'name') > 80 then
    raise exception 'invalid_failure_record' using errcode = '22023', detail = 'cause.name missing';
  end if;
  if coalesce(cause ->> 'class', '') not in (
    'budget', 'model_exhausted', 'model_invalid_output', 'model_policy', 'quality_gate',
    'invalid_input', 'schema_mismatch', 'db_constraint', 'db_timeout', 'authorization',
    'transient', 'worker_error'
  ) then
    raise exception 'invalid_failure_record' using errcode = '22023', detail = 'cause.class outside the taxonomy';
  end if;
  if coalesce(cause ->> 'message', '') = '' or char_length(cause ->> 'message') > 300 then
    raise exception 'invalid_failure_record' using errcode = '22023', detail = 'cause.message missing or too long';
  end if;
  -- Defence in depth for the scrub the worker already applies: no value that could have come
  -- out of a document reaches a telemetry row.
  if (cause ->> 'message') ~ '[0-9]{4,}'
    or (cause ->> 'message') ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then
    raise exception 'invalid_failure_record' using errcode = '22023', detail = 'cause.message carries a value';
  end if;
end;
$$;

revoke all on function private.assert_job_failure_record(jsonb) from public, anon, authenticated;

comment on function private.assert_job_failure_record(jsonb) is
  'Refuses a failure record that does not carry code, stage, retryable and a scrubbed cause. Called by worker_fail_job.';

$failure_assert$;
  end if;
  select pg_get_functiondef('private.worker_fail_job(uuid,text,jsonb,boolean,integer)'::regprocedure) into definition;
  -- These are later protections that replaying the historical CREATE OR REPLACE would destroy.
  if position('private.job_for_failure_capability' in definition)=0
    or position('private.execution_dispatch_is_current' in definition)=0
    or position(chr(39)||'awaiting_approval'||chr(39) in definition)=0 then
    raise exception 'approval failure protections missing: refusing reconciliation';
  end if;
  if position('perform private.assert_job_failure_record(p_error);' in definition)=0 then
    if array_length(string_to_array(definition,assertion_anchor),1)<>2 then
      raise exception 'worker failure assertion insertion point drifted';
    end if;
    execute replace(definition, assertion_anchor,
      'perform private.assert_job_failure_record(p_error);' || chr(10) || '  ' || assertion_anchor);
  end if;
end;
$reconcile$;
