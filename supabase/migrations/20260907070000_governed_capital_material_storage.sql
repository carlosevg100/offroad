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
