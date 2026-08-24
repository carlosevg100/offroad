-- Governed retrieval: isolated case context, a versioned house playbook, mandate notes that are
-- semantically searchable only after structured hard filters, and precedents that are unusable
-- until authorization, anonymization and governance have all passed.
--
-- Retrieval is not evidence creation. Every returned passage retains a citation, every case row
-- is scoped to the claimed job's organization and intake session/opportunity, and no tenant can
-- write the index that will later ground an answer about its own case.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------------------------
-- Case retrieval index. The worker writes page/sheet/section chunks after the deterministic
-- parser has produced stable anchors. Tenants may read their own case index, never write it.
-- ---------------------------------------------------------------------------------------------

create table public.case_retrieval_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  intake_session_id uuid not null,
  opportunity_id uuid,
  source_document_id uuid not null,
  document_version integer not null check (document_version > 0),
  processing_run_id uuid not null,
  chunk_key text not null check (char_length(chunk_key) between 3 and 500),
  content text not null check (char_length(content) between 20 and 12000),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  locale text not null default 'mixed' check (locale in ('pt-BR', 'en-US', 'mixed')),
  source_anchor jsonb not null check (jsonb_typeof(source_anchor) = 'object'),
  tags text[] not null default '{}',
  search_vector tsvector generated always as (to_tsvector('simple'::regconfig, content)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, source_document_id, document_version, chunk_key),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions (organization_id, id) on delete cascade,
  foreign key (organization_id, opportunity_id)
    references public.opportunities (organization_id, id) on delete cascade,
  foreign key (organization_id, source_document_id)
    references public.source_documents (organization_id, id) on delete cascade,
  foreign key (organization_id, processing_run_id)
    references public.processing_runs (organization_id, id) on delete cascade
);

create index case_retrieval_chunks_session_idx
  on public.case_retrieval_chunks (organization_id, intake_session_id, source_document_id, document_version);
create index case_retrieval_chunks_opportunity_idx
  on public.case_retrieval_chunks (organization_id, opportunity_id, source_document_id)
  where opportunity_id is not null;
create index case_retrieval_chunks_search_idx
  on public.case_retrieval_chunks using gin (search_vector);
create index case_retrieval_chunks_run_idx
  on public.case_retrieval_chunks (organization_id, processing_run_id);

-- ---------------------------------------------------------------------------------------------
-- House playbook. Only one version is active. Approval is explicit and chunks cite the source
-- file/section that governed them. Browser sessions cannot see this platform asset.
-- ---------------------------------------------------------------------------------------------

create table public.house_playbook_versions (
  id uuid primary key default gen_random_uuid(),
  semantic_version text not null unique,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('draft', 'approved', 'superseded', 'retired')),
  approval_basis text not null check (approval_basis in ('migration', 'founder_review', 'credit_committee')),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'approved' or approved_at is not null),
  check (approval_basis = 'migration' or approved_by is not null)
);

create unique index house_playbook_one_approved_idx
  on public.house_playbook_versions (status)
  where status = 'approved';

create table public.house_playbook_chunks (
  id uuid primary key default gen_random_uuid(),
  playbook_version_id uuid not null references public.house_playbook_versions (id) on delete cascade,
  chunk_key text not null check (char_length(chunk_key) between 3 and 240),
  domain text not null check (char_length(domain) between 2 and 120),
  archetype text,
  locale text not null check (locale in ('pt-BR', 'en-US', 'mixed')),
  content text not null check (char_length(content) between 20 and 12000),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  source_ref text not null check (char_length(source_ref) between 3 and 500),
  tags text[] not null default '{}',
  search_vector tsvector generated always as (to_tsvector('simple'::regconfig, content)) stored,
  created_at timestamptz not null default now(),
  unique (playbook_version_id, chunk_key)
);

create index house_playbook_chunks_version_domain_idx
  on public.house_playbook_chunks (playbook_version_id, domain, archetype);
create index house_playbook_chunks_search_idx
  on public.house_playbook_chunks using gin (search_vector);

-- ---------------------------------------------------------------------------------------------
-- Open mandate notes. Structured criteria stay in mandate observations/versions and always run
-- first. This is the only retrieval table with embeddings: vectors help find nuance in notes but
-- cannot create eligibility, ticket, tenor, sector or collateral fit.
-- ---------------------------------------------------------------------------------------------

create table public.mandate_note_embeddings (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.fund_directory (id) on delete cascade,
  observation_id uuid references public.fund_mandate_observations (id) on delete cascade,
  note_kind text not null check (note_kind in ('conversation_note', 'coverage_note', 'published_commentary')),
  observed_at date not null check (observed_at <= current_date),
  content text not null check (char_length(content) between 20 and 12000),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  citation jsonb not null check (jsonb_typeof(citation) = 'object'),
  embedding extensions.vector(1536),
  embedding_model text check (embedding_model is null or char_length(embedding_model) between 3 and 120),
  created_at timestamptz not null default now(),
  check ((embedding is null) = (embedding_model is null)),
  unique (observation_id),
  unique (fund_id, content_hash, observed_at)
);

create index mandate_note_embeddings_fund_date_idx
  on public.mandate_note_embeddings (fund_id, observed_at desc);
create index mandate_note_embeddings_search_idx
  on public.mandate_note_embeddings using gin (to_tsvector('simple'::regconfig, content));
create index mandate_note_embeddings_vector_idx
  on public.mandate_note_embeddings using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;
create or replace function private.index_mandate_observation_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_note text := trim(coalesce(new.note, ''));
begin
  if char_length(normalized_note) < 20 then
    return new;
  end if;

  insert into public.mandate_note_embeddings (
    fund_id, observation_id, note_kind, observed_at, content, content_hash, citation
  ) values (
    new.fund_id,
    new.id,
    case new.provenance
      when 'conversation' then 'conversation_note'
      when 'published' then 'published_commentary'
      else 'coverage_note'
    end,
    new.observed_at,
    normalized_note,
    encode(extensions.digest(normalized_note, 'sha256'), 'hex'),
    jsonb_strip_nulls(jsonb_build_object(
      'key', 'mandate-observation:' || new.id::text,
      'label', 'Mandate observation ' || new.criterion,
      'anchor', jsonb_build_object(
        'observationId', new.id,
        'criterion', new.criterion,
        'provenance', new.provenance,
        'observedAt', new.observed_at
      ),
      'sourceUrl', new.source_url
    ))
  ) on conflict (observation_id) do nothing;

  return new;
end;
$$;

revoke all on function private.index_mandate_observation_note() from public, anon, authenticated;

create trigger fund_mandate_observations_index_note
  after insert on public.fund_mandate_observations
  for each row execute function private.index_mandate_observation_note();

insert into public.mandate_note_embeddings (
  fund_id, observation_id, note_kind, observed_at, content, content_hash, citation
)
select
  observation.fund_id,
  observation.id,
  case observation.provenance
    when 'conversation' then 'conversation_note'
    when 'published' then 'published_commentary'
    else 'coverage_note'
  end,
  observation.observed_at,
  trim(observation.note),
  encode(extensions.digest(trim(observation.note), 'sha256'), 'hex'),
  jsonb_strip_nulls(jsonb_build_object(
    'key', 'mandate-observation:' || observation.id::text,
    'label', 'Mandate observation ' || observation.criterion,
    'anchor', jsonb_build_object(
      'observationId', observation.id,
      'criterion', observation.criterion,
      'provenance', observation.provenance,
      'observedAt', observation.observed_at
    ),
    'sourceUrl', observation.source_url
  ))
from public.fund_mandate_observations observation
where char_length(trim(coalesce(observation.note, ''))) >= 20
on conflict (observation_id) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Precedents. Authorization points to the original case, but the governed record and its chunks
-- contain only the approved anonymized representation. Retrieval joins every gate each time, so
-- revoking consent immediately removes the precedent without rebuilding an index.
-- ---------------------------------------------------------------------------------------------

create table public.precedent_authorizations (
  id uuid primary key default gen_random_uuid(),
  source_organization_id uuid not null,
  source_opportunity_id uuid not null,
  status text not null check (status in ('draft', 'active', 'revoked', 'expired')),
  authorized_purposes text[] not null check (cardinality(authorized_purposes) > 0),
  scope jsonb not null check (jsonb_typeof(scope) = 'object'),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (source_organization_id, source_opportunity_id)
    references public.opportunities (organization_id, id) on delete restrict,
  check (status <> 'active' or (approved_by is not null and approved_at is not null)),
  check (status <> 'revoked' or revoked_at is not null),
  check (expires_at is null or expires_at > created_at)
);

create index precedent_authorizations_source_idx
  on public.precedent_authorizations (source_organization_id, source_opportunity_id, status);
create index precedent_authorizations_active_idx
  on public.precedent_authorizations (expires_at, id)
  where status = 'active';

create table public.governed_precedents (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid not null references public.precedent_authorizations (id) on delete restrict,
  precedent_kind text not null check (precedent_kind in ('structure', 'reconciliation', 'risk_pattern', 'remediation', 'decline')),
  anonymization_status text not null check (anonymization_status in ('pending', 'approved', 'rejected')),
  governance_status text not null check (governance_status in ('draft', 'approved', 'retired')),
  anonymized_payload_hash text not null check (anonymized_payload_hash ~ '^[a-f0-9]{64}$'),
  anonymization_report jsonb not null check (jsonb_typeof(anonymization_report) = 'object'),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check (governance_status <> 'approved' or (
    anonymization_status = 'approved' and approved_by is not null and approved_at is not null
  )),
  unique (authorization_id, anonymized_payload_hash)
);

create index governed_precedents_authorization_idx
  on public.governed_precedents (authorization_id, governance_status, anonymization_status);

create table public.governed_precedent_chunks (
  id uuid primary key default gen_random_uuid(),
  precedent_id uuid not null references public.governed_precedents (id) on delete cascade,
  citation_key text not null check (char_length(citation_key) between 3 and 240),
  content text not null check (char_length(content) between 20 and 12000),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  tags text[] not null default '{}',
  search_vector tsvector generated always as (to_tsvector('simple'::regconfig, content)) stored,
  created_at timestamptz not null default now(),
  unique (precedent_id, citation_key)
);

create index governed_precedent_chunks_precedent_idx
  on public.governed_precedent_chunks (precedent_id);
create index governed_precedent_chunks_search_idx
  on public.governed_precedent_chunks using gin (search_vector);

-- Content-free retrieval audit. No query text or passage is logged, only hashes and ids.
create table private.retrieval_audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  intake_session_id uuid not null,
  processing_run_id uuid not null,
  query_hash text not null check (query_hash ~ '^[a-f0-9]{64}$'),
  playbook_version text,
  allowed_fund_count integer not null default 0 check (allowed_fund_count >= 0),
  result_ids jsonb not null check (jsonb_typeof(result_ids) = 'array'),
  actor_user_id uuid references auth.users (id),
  occurred_at timestamptz not null default now(),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions (organization_id, id) on delete cascade,
  foreign key (organization_id, processing_run_id)
    references public.processing_runs (organization_id, id) on delete cascade
);

create index retrieval_audit_case_time_idx
  on private.retrieval_audit_events (organization_id, intake_session_id, occurred_at desc);

create trigger case_retrieval_chunks_set_updated_at
  before update on public.case_retrieval_chunks
  for each row execute function private.set_updated_at();

create trigger case_retrieval_chunks_audit
  after insert or update or delete on public.case_retrieval_chunks
  for each row execute function private.capture_audit_event();

-- ---------------------------------------------------------------------------------------------
-- RLS and least privilege.
-- ---------------------------------------------------------------------------------------------

create or replace function private.is_offroad_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.organization_memberships membership
    join public.organizations organization_record on organization_record.id = membership.organization_id
    where membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and organization_record.organization_type = 'offroad'
  );
$$;

revoke all on function private.is_offroad_member() from public, anon;
grant execute on function private.is_offroad_member() to authenticated;

alter table public.case_retrieval_chunks enable row level security;
alter table public.case_retrieval_chunks force row level security;
alter table public.house_playbook_versions enable row level security;
alter table public.house_playbook_versions force row level security;
alter table public.house_playbook_chunks enable row level security;
alter table public.house_playbook_chunks force row level security;
alter table public.mandate_note_embeddings enable row level security;
alter table public.mandate_note_embeddings force row level security;
alter table public.precedent_authorizations enable row level security;
alter table public.precedent_authorizations force row level security;
alter table public.governed_precedents enable row level security;
alter table public.governed_precedents force row level security;
alter table public.governed_precedent_chunks enable row level security;
alter table public.governed_precedent_chunks force row level security;

create policy case_retrieval_chunks_select_scoped on public.case_retrieval_chunks
  for select to authenticated
  using (
    case
      when opportunity_id is not null
        then (select private.can_access_opportunity(organization_id, opportunity_id, 'evidence.read'))
      else (select private.is_org_member(organization_id))
    end
  );

create policy house_playbook_versions_internal on public.house_playbook_versions
  for select to authenticated using ((select private.is_offroad_member()));
create policy house_playbook_chunks_internal on public.house_playbook_chunks
  for select to authenticated using ((select private.is_offroad_member()));
create policy mandate_note_embeddings_internal on public.mandate_note_embeddings
  for select to authenticated using ((select private.is_offroad_member()));
create policy precedent_authorizations_internal on public.precedent_authorizations
  for select to authenticated using ((select private.is_offroad_member()));
create policy governed_precedents_internal on public.governed_precedents
  for select to authenticated using ((select private.is_offroad_member()));
create policy governed_precedent_chunks_internal on public.governed_precedent_chunks
  for select to authenticated using ((select private.is_offroad_member()));

revoke all on public.case_retrieval_chunks from public, anon;
revoke all on public.house_playbook_versions from public, anon;
revoke all on public.house_playbook_chunks from public, anon;
revoke all on public.mandate_note_embeddings from public, anon;
revoke all on public.precedent_authorizations from public, anon;
revoke all on public.governed_precedents from public, anon;
revoke all on public.governed_precedent_chunks from public, anon;

grant select on public.case_retrieval_chunks to authenticated;
grant select on public.house_playbook_versions to authenticated;
grant select on public.house_playbook_chunks to authenticated;
grant select on public.mandate_note_embeddings to authenticated;
grant select on public.precedent_authorizations to authenticated;
grant select on public.governed_precedents to authenticated;
grant select on public.governed_precedent_chunks to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Authenticated case search. Exact organization and opportunity are mandatory even though RLS
-- also checks them; defence in depth keeps a future policy change from widening a search.
-- ---------------------------------------------------------------------------------------------

create or replace function public.search_case_retrieval(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_query text,
  p_limit integer default 12
)
returns table (
  chunk_id uuid,
  content text,
  source_document_id uuid,
  source_anchor jsonb,
  citation_key text,
  score real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with query as (
    select websearch_to_tsquery('simple'::regconfig, trim(p_query)) as value
  )
  select
    chunk.id,
    chunk.content,
    chunk.source_document_id,
    chunk.source_anchor,
    chunk.chunk_key,
    ts_rank_cd(chunk.search_vector, query.value)::real
  from public.case_retrieval_chunks chunk
  cross join query
  where p_query is not null
    and char_length(trim(p_query)) >= 2
    and chunk.organization_id = p_organization_id
    and chunk.opportunity_id = p_opportunity_id
    and chunk.search_vector @@ query.value
  order by ts_rank_cd(chunk.search_vector, query.value) desc, chunk.id
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;

revoke all on function public.search_case_retrieval(uuid, uuid, text, integer) from public, anon;
grant execute on function public.search_case_retrieval(uuid, uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Worker writes parser-anchored case chunks through the current job capability.
-- ---------------------------------------------------------------------------------------------

create or replace function private.worker_record_retrieval_chunks(
  p_job_id uuid,
  p_capability_token text,
  p_chunks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  document_row public.source_documents;
  entry jsonb;
  written integer := 0;
  v_content text;
  v_hash text;
begin
  if job_row.kind <> 'document_pipeline' or job_row.source_document_id is null then
    raise exception 'document_pipeline_capability_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) > 2000 then
    raise exception 'retrieval_chunks_invalid' using errcode = '22023';
  end if;

  select * into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id;
  if not found then raise exception 'intake_session_not_found' using errcode = 'P0002'; end if;

  select * into document_row
  from public.source_documents document
  where document.organization_id = job_row.organization_id
    and document.id = job_row.source_document_id
    and document.intake_session_id = job_row.intake_session_id;
  if not found then raise exception 'source_document_not_in_job' using errcode = '22023'; end if;

  delete from public.case_retrieval_chunks
  where organization_id = job_row.organization_id
    and source_document_id = document_row.id
    and document_version = document_row.document_version;

  for entry in select value from jsonb_array_elements(p_chunks) loop
    v_content := trim(coalesce(entry ->> 'content', ''));
    v_hash := coalesce(entry ->> 'content_hash', '');
    if char_length(v_content) not between 20 and 12000
      or v_hash !~ '^[a-f0-9]{64}$'
      or v_hash <> encode(extensions.digest(v_content, 'sha256'), 'hex')
      or jsonb_typeof(entry -> 'source_anchor') <> 'object'
      or char_length(coalesce(entry ->> 'chunk_key', '')) not between 3 and 500 then
      raise exception 'retrieval_chunk_invalid' using errcode = '22023';
    end if;

    insert into public.case_retrieval_chunks (
      organization_id, intake_session_id, opportunity_id, source_document_id, document_version,
      processing_run_id, chunk_key, content, content_hash, locale, source_anchor, tags
    ) values (
      job_row.organization_id, job_row.intake_session_id, session_row.opportunity_id,
      document_row.id, document_row.document_version, job_row.processing_run_id,
      entry ->> 'chunk_key', v_content, v_hash,
      case when entry ->> 'locale' in ('pt-BR', 'en-US', 'mixed') then entry ->> 'locale' else 'mixed' end,
      entry -> 'source_anchor',
      coalesce(
        array(select jsonb_array_elements_text(coalesce(entry -> 'tags', '[]'::jsonb))),
        '{}'::text[]
      )
    );
    written := written + 1;
  end loop;

  return jsonb_build_object('written', written, 'source_document_id', document_row.id);
end;
$$;

create or replace function public.worker_record_retrieval_chunks(
  p_job_id uuid,
  p_capability_token text,
  p_chunks jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_retrieval_chunks(p_job_id, p_capability_token, p_chunks);
$$;

revoke all on function private.worker_record_retrieval_chunks(uuid, text, jsonb) from public, anon;
revoke all on function public.worker_record_retrieval_chunks(uuid, text, jsonb) from public, anon;
grant execute on function private.worker_record_retrieval_chunks(uuid, text, jsonb) to authenticated;
grant execute on function public.worker_record_retrieval_chunks(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Worker retrieval. Allowed fund ids must come from the structured mandate screen. No query can
-- retrieve a note for a fund that did not pass that screen. Precedents are re-gated at read time.
-- ---------------------------------------------------------------------------------------------

create or replace function private.worker_load_retrieval_context(
  p_job_id uuid,
  p_capability_token text,
  p_query text,
  p_allowed_fund_ids uuid[] default '{}',
  p_precedent_purpose text default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  query_value tsquery;
  active_playbook public.house_playbook_versions;
  result jsonb;
  result_ids jsonb;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;
  if p_query is null or char_length(trim(p_query)) < 2 then
    raise exception 'retrieval_query_required' using errcode = '22023';
  end if;
  query_value := websearch_to_tsquery('simple'::regconfig, trim(p_query));

  select * into active_playbook
  from public.house_playbook_versions version
  where version.status = 'approved'
  order by version.created_at desc
  limit 1;

  with ranked as (
    select
      'case'::text as source,
      chunk.id,
      chunk.content,
      jsonb_build_object(
        'key', chunk.chunk_key,
        'label', document.original_name || ', ' || coalesce(chunk.source_anchor ->> 'id', chunk.chunk_key),
        'anchor', chunk.source_anchor,
        'sourceDocumentId', chunk.source_document_id
      ) as citation,
      ts_rank_cd(chunk.search_vector, query_value)::real as score
    from public.case_retrieval_chunks chunk
    join public.source_documents document
      on document.organization_id = chunk.organization_id and document.id = chunk.source_document_id
    where chunk.organization_id = job_row.organization_id
      and chunk.intake_session_id = job_row.intake_session_id
      and chunk.search_vector @@ query_value

    union all

    select
      'house_playbook',
      chunk.id,
      chunk.content,
      jsonb_build_object('key', chunk.chunk_key, 'label', chunk.source_ref, 'anchor', jsonb_build_object('sourceRef', chunk.source_ref)),
      ts_rank_cd(chunk.search_vector, query_value)::real
    from public.house_playbook_chunks chunk
    where active_playbook.id is not null
      and chunk.playbook_version_id = active_playbook.id
      and chunk.search_vector @@ query_value

    union all

    select
      'mandate_note',
      note.id,
      note.content,
      note.citation,
      ts_rank_cd(to_tsvector('simple'::regconfig, note.content), query_value)::real
    from public.mandate_note_embeddings note
    where note.fund_id = any(coalesce(p_allowed_fund_ids, '{}'))
      and to_tsvector('simple'::regconfig, note.content) @@ query_value

    union all

    select
      'precedent',
      chunk.id,
      chunk.content,
      jsonb_build_object('key', chunk.citation_key, 'label', 'Precedente anonimizado', 'anchor', jsonb_build_object('citationKey', chunk.citation_key)),
      ts_rank_cd(chunk.search_vector, query_value)::real
    from public.governed_precedent_chunks chunk
    join public.governed_precedents precedent on precedent.id = chunk.precedent_id
    join public.precedent_authorizations precedent_authorization
      on precedent_authorization.id = precedent.authorization_id
    where p_precedent_purpose is not null
      and precedent_authorization.status = 'active'
      and (precedent_authorization.expires_at is null or precedent_authorization.expires_at > now())
      and p_precedent_purpose = any(precedent_authorization.authorized_purposes)
      and precedent.anonymization_status = 'approved'
      and precedent.governance_status = 'approved'
      and chunk.search_vector @@ query_value
  ), source_ranked as (
    select
      ranked.*,
      row_number() over (partition by source order by score desc, id) as source_rank
    from ranked
    where score > 0
  ), limited as (
    -- Interleave sources so a large case index cannot crowd the approved playbook (or the
    -- allowed mandate notes) out of the bounded response. Relevance still orders each source.
    select source, id, content, citation, score
    from source_ranked
    order by source_rank, score desc, source, id
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'source', source,
      'id', id,
      'content', content,
      'citation', citation,
      'score', score
    ) order by score desc, source, id), '[]'::jsonb),
    coalesce(jsonb_agg(to_jsonb(id) order by score desc, source, id), '[]'::jsonb)
  into result, result_ids
  from limited;

  insert into private.retrieval_audit_events (
    organization_id, intake_session_id, processing_run_id, query_hash, playbook_version,
    allowed_fund_count, result_ids, actor_user_id
  ) values (
    job_row.organization_id, job_row.intake_session_id, job_row.processing_run_id,
    encode(extensions.digest(trim(p_query), 'sha256'), 'hex'), active_playbook.semantic_version,
    coalesce(cardinality(p_allowed_fund_ids), 0), result_ids, (select auth.uid())
  );

  return jsonb_build_object(
    'playbook_version', active_playbook.semantic_version,
    'results', result,
    'abstained', jsonb_array_length(result) = 0
  );
end;
$$;

create or replace function public.worker_load_retrieval_context(
  p_job_id uuid,
  p_capability_token text,
  p_query text,
  p_allowed_fund_ids uuid[] default '{}',
  p_precedent_purpose text default null,
  p_limit integer default 20
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_retrieval_context(
    p_job_id, p_capability_token, p_query, p_allowed_fund_ids, p_precedent_purpose, p_limit
  );
$$;

revoke all on function private.worker_load_retrieval_context(uuid, text, text, uuid[], text, integer) from public, anon;
revoke all on function public.worker_load_retrieval_context(uuid, text, text, uuid[], text, integer) from public, anon;
grant execute on function private.worker_load_retrieval_context(uuid, text, text, uuid[], text, integer) to authenticated;
grant execute on function public.worker_load_retrieval_context(uuid, text, text, uuid[], text, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Initial approved playbook snapshot. A future content change creates another version and
-- supersedes this one; it never edits these rows in place.
-- ---------------------------------------------------------------------------------------------

insert into public.house_playbook_versions (
  id, semantic_version, content_hash, status, approval_basis, approved_at
) values (
  '71000000-0000-4000-8000-000000000001',
  '2026.08.24-v2',
  encode(extensions.digest('credit-playbook:2026.08.24-v2', 'sha256'), 'hex'),
  'approved',
  'migration',
  now()
);

insert into public.house_playbook_chunks (
  id, playbook_version_id, chunk_key, domain, archetype, locale, content, content_hash, source_ref, tags
)
select
  seed.id,
  '71000000-0000-4000-8000-000000000001'::uuid,
  seed.chunk_key,
  seed.domain,
  seed.archetype,
  'pt-BR',
  seed.content,
  encode(extensions.digest(seed.content, 'sha256'), 'hex'),
  seed.source_ref,
  seed.tags
from (values
  (
    '71100000-0000-4000-8000-000000000001'::uuid,
    'evidence-hierarchy', 'evidence', null::text,
    'Informação auditada e conciliada prevalece sobre informação gerencial; projeção nunca substitui histórico e conflito entre fontes permanece visível até resolução.',
    'packages/credit-playbook/src/types.ts#evidence-hierarchy',
    array['evidence','reconciliation']::text[]
  ),
  (
    '71100000-0000-4000-8000-000000000002'::uuid,
    'capacity-before-structure', 'credit-analysis', null::text,
    'A estrutura proposta vem depois da capacidade de pagamento. Caixa, dívida, serviço da dívida, garantias e downside limitam volume, prazo e amortização; o pedido da empresa não define capacidade.',
    'packages/credit-playbook/src/archetypes.ts#capacity',
    array['capacity','structure']::text[]
  ),
  (
    '71100000-0000-4000-8000-000000000003'::uuid,
    'growth-expansion', 'archetype', 'growth_expansion',
    'Expansão exige histórico de execução, orçamento por etapa, cronograma de desembolso, ramp-up, capital de giro incremental e cobertura da dívida no cenário de atraso. O financiamento deve acompanhar o uso dos recursos e a geração de caixa.',
    'packages/credit-playbook/src/archetypes.ts#growth_expansion',
    array['growth','capex','ramp-up']::text[]
  ),
  (
    '71100000-0000-4000-8000-000000000004'::uuid,
    'working-capital', 'archetype', 'working_capital',
    'Capital de giro exige explicar o ciclo financeiro, sazonalidade, necessidade permanente versus pico, concentração de clientes, qualidade dos recebíveis e fonte de liquidação. Buraco estrutural de caixa não deve ser apresentado como pico sazonal.',
    'packages/credit-playbook/src/archetypes.ts#working_capital',
    array['working-capital','receivables','liquidity']::text[]
  ),
  (
    '71100000-0000-4000-8000-000000000005'::uuid,
    'refinance', 'archetype', 'refinance',
    'Refinanciamento exige mapa integral da dívida, vencimentos, custo, garantias, covenants e eventos de default. Alongar prazo só cria valor quando o novo perfil cabe no caixa e não apenas empurra um déficit não resolvido.',
    'packages/credit-playbook/src/archetypes.ts#refinance',
    array['refinance','debt-schedule','maturity']::text[]
  ),
  (
    '71100000-0000-4000-8000-000000000006'::uuid,
    'acquisition', 'archetype', 'acquisition',
    'Aquisição exige preço, fontes e usos, estrutura societária, histórico e projeção pró-forma combinada, sinergias separadas, dívida assumida e capacidade de serviço antes e depois da integração. Sinergia não comprovada não deve sustentar dívida.',
    'packages/credit-playbook/src/archetypes.ts#acquisition',
    array['acquisition','pro-forma','integration']::text[]
  ),
  (
    '71100000-0000-4000-8000-000000000007'::uuid,
    'receivables', 'archetype', 'receivables',
    'Financiamento lastreado em recebíveis exige fita reconciliada, existência e elegibilidade por título, concentração por sacado e grupo, aging, atraso, perda, recuperação, diluição, recompra, cessão, registro e rastreabilidade do caixa. O veículo não substitui a análise da carteira.',
    'packages/receivables-analysis/src/playbook.ts',
    array['receivables','fidc','eligibility','cash']::text[]
  ),
  (
    '71100000-0000-4000-8000-000000000008'::uuid,
    'mandate-hard-filters', 'matching', null::text,
    'Mandato é filtro estruturado antes de qualquer nota semântica. Atividade, instrumento, ticket, prazo, setor, geografia, garantia, alavancagem e DSCR podem excluir uma operação; uma conversa parecida não transforma exclusão em aderência.',
    'packages/fund-mandate/src/fit.ts',
    array['mandate','hard-filter','matching']::text[]
  )
) as seed(id, chunk_key, domain, archetype, content, source_ref, tags);
