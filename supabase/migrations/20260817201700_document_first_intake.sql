create table public.document_intake_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  started_by uuid not null references auth.users (id),
  journey text not null check (journey in ('company', 'originator')),
  locale text not null default 'pt-BR' check (locale in ('pt-BR', 'en-US')),
  status text not null default 'collecting' check (status in ('collecting', 'processing', 'review_ready', 'confirmed', 'failed', 'cancelled')),
  opportunity_id uuid,
  extraction_version text not null default 'rede-horizonte-v1',
  result_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(result_summary) = 'object'),
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id)
);

create index document_intake_sessions_org_status_idx
  on public.document_intake_sessions (organization_id, status, created_at desc);
create index document_intake_sessions_started_by_idx
  on public.document_intake_sessions (started_by, created_at desc);

alter table public.source_documents
  alter column opportunity_id drop not null,
  add column intake_session_id uuid,
  add column document_kind text,
  add column evidence_rank smallint check (evidence_rank is null or evidence_rank between 1 and 6),
  add constraint source_documents_scope_check check (opportunity_id is not null or intake_session_id is not null),
  add constraint source_documents_intake_session_fkey
    foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions (organization_id, id);

create index source_documents_intake_session_idx
  on public.source_documents (organization_id, intake_session_id, processing_status, created_at)
  where intake_session_id is not null;

create table public.intake_field_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_session_id uuid not null,
  source_document_id uuid,
  extractor_key text not null,
  field_path text not null check (field_path ~ '^[a-z0-9_.]+$'),
  field_group text not null check (field_group in ('company', 'transaction', 'historical_financials', 'interim_financials', 'projections', 'project', 'leverage', 'collateral')),
  label text not null,
  raw_value text,
  normalized_value jsonb not null,
  value_type text not null check (value_type in ('text', 'number', 'date', 'boolean', 'list')),
  unit text,
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  period_start date,
  period_end date,
  information_class text not null check (information_class in ('audited', 'reviewed', 'accounting', 'management', 'bank_statement', 'projection', 'company_document', 'calculated')),
  evidence_rank smallint not null check (evidence_rank between 1 and 7),
  source_anchor jsonb not null check (jsonb_typeof(source_anchor) = 'object'),
  confidence numeric(5, 4) not null check (confidence between 0 and 1),
  extraction_method text not null check (extraction_method in ('native_text', 'ocr', 'spreadsheet_cell', 'deterministic_calculation', 'user_entry')),
  is_primary boolean not null default false,
  review_state text not null default 'proposed' check (review_state in ('proposed', 'accepted', 'edited', 'rejected', 'not_applicable', 'superseded')),
  reviewer_comment text,
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, intake_session_id, extractor_key),
  foreign key (organization_id, intake_session_id) references public.document_intake_sessions (organization_id, id) on delete cascade,
  foreign key (organization_id, source_document_id) references public.source_documents (organization_id, id),
  check (period_end is null or period_start is null or period_end >= period_start)
);

create index intake_field_candidates_review_idx
  on public.intake_field_candidates (organization_id, intake_session_id, field_group, review_state, field_path);
create index intake_field_candidates_source_idx
  on public.intake_field_candidates (organization_id, source_document_id)
  where source_document_id is not null;
create unique index intake_field_candidates_primary_idx
  on public.intake_field_candidates (organization_id, intake_session_id, field_path)
  where is_primary and review_state not in ('rejected', 'superseded');

create table public.intake_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_session_id uuid not null,
  issue_type text not null check (issue_type in ('conflict', 'missing', 'validation')),
  priority text not null check (priority in ('critical', 'analysis', 'diligence', 'complementary')),
  field_group text check (field_group is null or field_group in ('company', 'transaction', 'historical_financials', 'interim_financials', 'projections', 'project', 'leverage', 'collateral')),
  field_path text,
  candidate_ids uuid[] not null default '{}'::uuid[],
  title text not null,
  description text not null,
  resolution_hint text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, intake_session_id) references public.document_intake_sessions (organization_id, id) on delete cascade
);

create index intake_issues_open_idx
  on public.intake_issues (organization_id, intake_session_id, status, priority, issue_type);

create or replace function private.can_access_intake_session(
  p_organization_id uuid,
  p_session_id uuid
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
      from public.document_intake_sessions session
      join public.organization_memberships membership
        on membership.organization_id = session.organization_id
      where session.organization_id = p_organization_id
        and session.id = p_session_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    );
$$;

create or replace function private.can_access_document_scope(
  p_organization_id uuid,
  p_scope_id uuid,
  p_permission text default 'document.read'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.can_access_opportunity(p_organization_id, p_scope_id, p_permission)), false)
    or coalesce((select private.can_access_intake_session(p_organization_id, p_scope_id)), false);
$$;

revoke all on function private.can_access_intake_session(uuid, uuid) from public;
revoke all on function private.can_access_document_scope(uuid, uuid, text) from public;
grant execute on function private.can_access_intake_session(uuid, uuid) to authenticated;
grant execute on function private.can_access_document_scope(uuid, uuid, text) to authenticated;

create trigger document_intake_sessions_set_updated_at before update on public.document_intake_sessions
  for each row execute function private.set_updated_at();
create trigger intake_field_candidates_set_updated_at before update on public.intake_field_candidates
  for each row execute function private.set_updated_at();
create trigger intake_issues_set_updated_at before update on public.intake_issues
  for each row execute function private.set_updated_at();

create trigger document_intake_sessions_audit after insert or update or delete on public.document_intake_sessions
  for each row execute function private.capture_audit_event();
create trigger intake_field_candidates_audit after insert or update or delete on public.intake_field_candidates
  for each row execute function private.capture_audit_event();
create trigger intake_issues_audit after insert or update or delete on public.intake_issues
  for each row execute function private.capture_audit_event();

alter table public.document_intake_sessions enable row level security;
alter table public.intake_field_candidates enable row level security;
alter table public.intake_issues enable row level security;

create policy document_intake_sessions_select on public.document_intake_sessions for select to authenticated
  using ((select private.can_access_intake_session(organization_id, id)));
create policy document_intake_sessions_insert on public.document_intake_sessions for insert to authenticated
  with check ((select private.is_org_member(organization_id)) and started_by = (select auth.uid()));
create policy document_intake_sessions_update on public.document_intake_sessions for update to authenticated
  using ((select private.can_access_intake_session(organization_id, id)))
  with check ((select private.can_access_intake_session(organization_id, id)));

create policy intake_field_candidates_select on public.intake_field_candidates for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy intake_field_candidates_insert on public.intake_field_candidates for insert to authenticated
  with check ((select private.can_access_intake_session(organization_id, intake_session_id)) and created_by = (select auth.uid()));
create policy intake_field_candidates_update on public.intake_field_candidates for update to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)))
  with check ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy intake_field_candidates_delete on public.intake_field_candidates for delete to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

create policy intake_issues_select on public.intake_issues for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy intake_issues_insert on public.intake_issues for insert to authenticated
  with check ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy intake_issues_update on public.intake_issues for update to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)))
  with check ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy intake_issues_delete on public.intake_issues for delete to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

drop policy source_documents_select on public.source_documents;
drop policy source_documents_insert on public.source_documents;
drop policy source_documents_update on public.source_documents;

create policy source_documents_select on public.source_documents for select to authenticated
  using (
    (opportunity_id is not null and (select private.can_access_opportunity(organization_id, opportunity_id, 'document.read')))
    or (intake_session_id is not null and (select private.can_access_intake_session(organization_id, intake_session_id)))
  );
create policy source_documents_insert on public.source_documents for insert to authenticated
  with check (
    created_by = (select auth.uid()) and (
      (opportunity_id is not null and (select private.can_access_opportunity(organization_id, opportunity_id, 'document.upload')))
      or (intake_session_id is not null and (select private.can_access_intake_session(organization_id, intake_session_id)))
    )
  );
create policy source_documents_update on public.source_documents for update to authenticated
  using (
    (opportunity_id is not null and (select private.can_access_opportunity(organization_id, opportunity_id, 'document.write')))
    or (intake_session_id is not null and (select private.can_access_intake_session(organization_id, intake_session_id)))
  )
  with check (
    (opportunity_id is not null and (select private.can_access_opportunity(organization_id, opportunity_id, 'document.write')))
    or (intake_session_id is not null and (select private.can_access_intake_session(organization_id, intake_session_id)))
  );

grant select, insert, update on public.document_intake_sessions to authenticated;
grant select, insert, update, delete on public.intake_field_candidates to authenticated;
grant select, insert, update, delete on public.intake_issues to authenticated;

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'text/csv',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]
where id = 'opportunity-documents';

drop policy opportunity_documents_select on storage.objects;
drop policy opportunity_documents_insert on storage.objects;
drop policy opportunity_documents_update on storage.objects;
drop policy opportunity_documents_delete on storage.objects;

create policy opportunity_documents_select
on storage.objects for select to authenticated
using (
  bucket_id = 'opportunity-documents'
  and (select private.can_access_document_scope(
    private.storage_organization_id(name),
    private.storage_opportunity_id(name),
    'document.read'
  ))
);

create policy opportunity_documents_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'opportunity-documents'
  and (select private.can_access_document_scope(
    private.storage_organization_id(name),
    private.storage_opportunity_id(name),
    'document.upload'
  ))
);

create policy opportunity_documents_update
on storage.objects for update to authenticated
using (
  bucket_id = 'opportunity-documents'
  and (select private.can_access_document_scope(
    private.storage_organization_id(name),
    private.storage_opportunity_id(name),
    'document.write'
  ))
)
with check (
  bucket_id = 'opportunity-documents'
  and (select private.can_access_document_scope(
    private.storage_organization_id(name),
    private.storage_opportunity_id(name),
    'document.write'
  ))
);

create policy opportunity_documents_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'opportunity-documents'
  and (select private.can_access_document_scope(
    private.storage_organization_id(name),
    private.storage_opportunity_id(name),
    'document.delete'
  ))
);
