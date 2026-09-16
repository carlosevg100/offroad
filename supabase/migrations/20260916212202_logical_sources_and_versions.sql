-- Stage 6: logical identity, immutable bytes and explicit uses.
set search_path='';
create table public.sources (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 origin_resource_id uuid, origin_resource_reference uuid not null, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), foreign key(organization_id,origin_resource_id) references private.access_resources(organization_id,id) on delete set null (origin_resource_id)
);
alter table public.source_documents add column logical_source_id uuid;
create table public.source_versions (
 id uuid primary key, organization_id uuid not null references public.organizations(id), source_id uuid not null,
 version_no integer not null check(version_no>0), legacy_document_version integer not null check(legacy_document_version>0),
 bucket_id text not null check(bucket_id='opportunity-documents'), object_path text not null,
 original_name text not null, mime_type text, byte_size bigint check(byte_size>=0),
 declared_sha256 text check(declared_sha256 ~ '^[a-f0-9]{64}$'),
 legacy_verification_claim timestamptz,
 initial_verification_state text not null check(initial_verification_state in ('legacy_unverified','pending_verification')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,source_id,version_no), unique(organization_id,bucket_id,object_path),
 foreign key(organization_id,source_id) references public.sources(organization_id,id)
);
create table public.source_bindings (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 source_version_id uuid not null, resource_id uuid, resource_reference uuid not null, request_id uuid not null,
 created_by uuid not null references auth.users(id), revoked_by uuid references auth.users(id), revoked_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,request_id),
 foreign key(organization_id,source_version_id) references public.source_versions(organization_id,id),
 foreign key(organization_id,resource_id) references private.access_resources(organization_id,id) on delete set null (resource_id),
 check(revoked_at is not null or revoked_by is null)
);
create unique index source_bindings_active_idx on public.source_bindings(organization_id,source_version_id,resource_id) where revoked_at is null;
create index sources_origin_idx on public.sources(organization_id,origin_resource_id);
create index sources_actor_idx on public.sources(created_by);
create index source_versions_actor_idx on public.source_versions(created_by);
create index source_bindings_resource_idx on public.source_bindings(organization_id,resource_id);
create index source_bindings_actor_idx on public.source_bindings(created_by);
create index source_bindings_revoker_idx on public.source_bindings(revoked_by);
-- Verification is an append-only receipt, separate from immutable version identity.
-- job_id is historical provenance validated by job_for_capability at insertion; deleting an
-- operational job must not delete its receipt or prevent removal of an intake.
create table private.source_version_verifications (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),source_version_id uuid not null,
 job_id uuid not null, observed_sha256 text not null check(observed_sha256 ~ '^[a-f0-9]{64}$'),
 observed_byte_size bigint not null check(observed_byte_size>=0),receipt_id text not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),unique(organization_id,job_id,receipt_id),
 foreign key(organization_id,source_version_id) references public.source_versions(organization_id,id)
);
create index source_verifications_version_idx on private.source_version_verifications(organization_id,source_version_id);

create function private.can_read_source_version_v1(p_organization_id uuid,p_version_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
 select 1 from public.source_versions v join public.sources s on s.organization_id=v.organization_id and s.id=v.source_id
 where v.organization_id=p_organization_id and v.id=p_version_id
 and private.can_access_resource_v1(s.organization_id,s.origin_resource_id,'read')
 and exists(select 1 from public.source_bindings b where b.organization_id=v.organization_id and b.source_version_id=v.id
 and b.revoked_at is null and private.can_access_resource_v1(b.organization_id,b.resource_id,'read')));
$$;
revoke all on function private.can_read_source_version_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.can_read_source_version_v1(uuid,uuid) to authenticated;
alter table public.sources enable row level security;
alter table public.sources force row level security;
alter table public.source_versions enable row level security;
alter table public.source_versions force row level security;
alter table public.source_bindings enable row level security;
alter table public.source_bindings force row level security;
alter table private.source_version_verifications enable row level security;
alter table private.source_version_verifications force row level security;
revoke all on public.sources,public.source_versions,public.source_bindings,private.source_version_verifications from public,anon,authenticated,service_role;
grant select on public.sources,public.source_versions,public.source_bindings to authenticated;
create policy sources_select_authorized on public.sources for select to authenticated using(private.can_access_resource_v1(organization_id,origin_resource_id,'read'));
create policy source_versions_select_authorized on public.source_versions for select to authenticated using(private.can_read_source_version_v1(organization_id,id));
create policy source_bindings_select_authorized on public.source_bindings for select to authenticated using(private.can_access_resource_v1(organization_id,resource_id,'read') and private.can_read_source_version_v1(organization_id,source_version_id));
create policy source_version_verifications_deny_clients on private.source_version_verifications for all to authenticated using(false) with check(false);

-- Existing document IDs remain exact byte-version IDs. No entity/filename/hash inference.
insert into public.sources(id,organization_id,origin_resource_id,origin_resource_reference,created_by,created_at)
 select id,organization_id,coalesce(intake_session_id,opportunity_id),coalesce(intake_session_id,opportunity_id),created_by,created_at from public.source_documents;
insert into public.source_versions(id,organization_id,source_id,version_no,legacy_document_version,bucket_id,object_path,original_name,mime_type,byte_size,declared_sha256,initial_verification_state,created_by,created_at,legacy_verification_claim)
 select id,organization_id,id,1,document_version,bucket_id,object_path,original_name,mime_type,byte_size,sha256,'legacy_unverified',created_by,created_at,sha256_verified_at from public.source_documents;
insert into public.source_bindings(id,organization_id,source_version_id,resource_id,resource_reference,request_id,created_by,created_at)
 select id,organization_id,id,coalesce(intake_session_id,opportunity_id),coalesce(intake_session_id,opportunity_id),id,created_by,created_at from public.source_documents;

update public.source_documents set logical_source_id=id,sha256_verified_at=null;
alter table public.source_documents alter column logical_source_id set not null;
create index source_documents_logical_source_idx on public.source_documents(organization_id,logical_source_id);
alter table public.source_documents add foreign key(organization_id,logical_source_id) references public.sources(organization_id,id);

create function private.project_document_source_version_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare source_row public.sources; ordinal integer;
begin
 new.logical_source_id:=coalesce(new.logical_source_id,new.id);
 insert into public.sources(id,organization_id,origin_resource_id,origin_resource_reference,created_by,created_at)
 values(new.logical_source_id,new.organization_id,coalesce(new.intake_session_id,new.opportunity_id),coalesce(new.intake_session_id,new.opportunity_id),new.created_by,new.created_at) on conflict(id) do nothing;
 select * into source_row from public.sources where organization_id=new.organization_id and id=new.logical_source_id for update;
 if not found or source_row.origin_resource_id is distinct from coalesce(new.intake_session_id,new.opportunity_id) then raise exception 'source_scope_denied' using errcode='42501'; end if;
 select coalesce(max(version_no),0)+1 into ordinal from public.source_versions where organization_id=new.organization_id and source_id=new.logical_source_id;
 insert into public.source_versions(id,organization_id,source_id,version_no,legacy_document_version,bucket_id,object_path,original_name,mime_type,byte_size,declared_sha256,initial_verification_state,created_by,created_at)
 values(new.id,new.organization_id,new.logical_source_id,ordinal,new.document_version,new.bucket_id,new.object_path,new.original_name,new.mime_type,new.byte_size,new.sha256,'pending_verification',new.created_by,new.created_at);
 insert into public.source_bindings(id,organization_id,source_version_id,resource_id,resource_reference,request_id,created_by,created_at)
 values(new.id,new.organization_id,new.id,coalesce(new.intake_session_id,new.opportunity_id),coalesce(new.intake_session_id,new.opportunity_id),new.id,new.created_by,new.created_at);
 return new;
end $$;
revoke all on function private.project_document_source_version_v1() from public,anon,authenticated,service_role;
create trigger source_documents_project_version before insert on public.source_documents for each row execute function private.project_document_source_version_v1();

create function private.reject_source_version_mutation_v1() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'source_version_immutable' using errcode='55000'; end $$;
revoke all on function private.reject_source_version_mutation_v1() from public,anon,authenticated,service_role;
create trigger source_versions_immutable before update or delete on public.source_versions for each row execute function private.reject_source_version_mutation_v1();
create trigger source_verifications_immutable before update or delete on private.source_version_verifications for each row execute function private.reject_source_version_mutation_v1();

create function private.preserve_document_bytes_v1() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.organization_id,new.bucket_id,new.object_path,new.byte_size,new.sha256,new.document_version,new.logical_source_id)
 is distinct from (old.organization_id,old.bucket_id,old.object_path,old.byte_size,old.sha256,old.document_version,old.logical_source_id)
 then raise exception 'source_version_immutable' using errcode='55000'; end if;
 return new;
end $$;
revoke all on function private.preserve_document_bytes_v1() from public,anon,authenticated,service_role;
create trigger source_documents_preserve_bytes before update on public.source_documents for each row execute function private.preserve_document_bytes_v1();

-- A client-session RPC cannot attest that a server downloaded bytes. Retired for all callers.
create or replace function private.record_document_verification(p_organization_id uuid,p_document_id uuid,p_sha256 text,p_processing_status text)
returns void language plpgsql security definer set search_path='' as $$
begin raise exception 'document_verification_requires_worker_receipt' using errcode='42501'; end $$;
revoke all on function private.record_document_verification(uuid,uuid,text,text),public.record_document_verification(uuid,uuid,text,text) from public,anon,authenticated,service_role;

create or replace function private.register_source_version_v1(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
  p_document_id uuid,
  p_bucket_id text,
  p_object_path text,
  p_original_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_sha256 text,
  p_source_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  existing public.intake_domain_events;
  event_row public.intake_domain_events;
  document_row public.source_documents;
  duplicate_row public.source_documents;
  document_payload jsonb;
  occurred_at timestamptz := clock_timestamp();
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status not in ('collecting', 'failed') then
    raise exception 'intake_session_not_collecting' using errcode = '55000';
  end if;
  if p_event_id is null or p_document_id is null
    or p_bucket_id <> 'opportunity-documents'
    or char_length(trim(coalesce(p_original_name, ''))) not between 1 and 500
    or char_length(trim(coalesce(p_object_path, ''))) not between 1 and 1024
    or p_object_path not like p_organization_id::text || '/' || p_session_id::text || '/%'
    or p_byte_size not between 1 and 52428800
    or p_sha256 !~ '^[a-f0-9]{64}$'
    or char_length(coalesce(nullif(trim(p_mime_type), ''), '')) > 255 then
    raise exception 'intake_document_command_invalid' using errcode = '22023';
  end if;

  if p_source_id is not null and not exists(select 1 from public.sources where organization_id=p_organization_id and id=p_source_id and origin_resource_id=p_session_id) then raise exception 'source_identity_denied' using errcode='42501'; end if;

  document_payload := jsonb_strip_nulls(jsonb_build_object(
    'id', p_document_id,
    'sourceId', p_source_id,
    'originalName', trim(p_original_name),
    'objectPath', p_object_path,
    'sha256', p_sha256,
    'byteSize', p_byte_size,
    'mimeType', nullif(trim(coalesce(p_mime_type, '')), '')
  ));

  -- Preserve command idempotency before looking for a content duplicate. A true replay returns
  -- the result of the original event; a newly generated command for the same bytes returns the
  -- canonical document without appending a second receipt.
  select * into existing
  from public.intake_domain_events event
  where event.organization_id = p_organization_id and event.event_id = p_event_id;
  if found then
    if existing.intake_session_id is distinct from p_session_id
      or existing.event_type <> 'document_received'
      or existing.payload is distinct from jsonb_build_object('document', document_payload, 'actorId', actor_id) then
      raise exception 'intake_event_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'id', p_document_id,
      'original_name', existing.payload -> 'document' ->> 'originalName',
      'byte_size', (existing.payload -> 'document' ->> 'byteSize')::bigint,
      'duplicate', false,
      'replayed', true
    );
  end if;

  select document.* into duplicate_row
  from public.source_documents document
  where document.organization_id = p_organization_id
    and document.intake_session_id = p_session_id
    and document.sha256 = p_sha256
  order by document.created_at, document.id
  limit 1;

  if found then
    if p_source_id is not null and duplicate_row.logical_source_id is distinct from p_source_id then raise exception 'source_identity_conflict' using errcode='23505'; end if;
    return jsonb_build_object(
      'id', duplicate_row.id,
      'original_name', duplicate_row.original_name,
      'byte_size', duplicate_row.byte_size,
      'duplicate', true,
      'replayed', false
    );
  end if;

  begin
    insert into public.source_documents (
      id, organization_id, opportunity_id, intake_session_id, bucket_id, object_path,
      original_name, mime_type, byte_size, sha256, created_by, logical_source_id
    ) values (
      p_document_id, p_organization_id, null, p_session_id, p_bucket_id, p_object_path,
      trim(p_original_name), nullif(trim(coalesce(p_mime_type, '')), ''), p_byte_size,
      p_sha256, actor_id, p_source_id
    ) returning * into document_row;
  exception when unique_violation then
    -- Two identical uploads can pass the first lookup concurrently. Only the scope/hash conflict
    -- is an idempotent duplicate; UUID or object-path collisions remain genuine errors.
    select document.* into duplicate_row
    from public.source_documents document
    where document.organization_id = p_organization_id
      and document.intake_session_id = p_session_id
      and document.sha256 = p_sha256
    order by document.created_at, document.id
    limit 1;

    if found then
      if p_source_id is not null and duplicate_row.logical_source_id is distinct from p_source_id then raise exception 'source_identity_conflict' using errcode='23505'; end if;
      return jsonb_build_object(
        'id', duplicate_row.id,
        'original_name', duplicate_row.original_name,
        'byte_size', duplicate_row.byte_size,
        'duplicate', true,
        'replayed', false
      );
    end if;
    raise;
  end;

  event_row := private.append_intake_domain_event(
    p_organization_id, p_session_id, p_event_id, 'document_received',
    jsonb_build_object('document', document_payload, 'actorId', actor_id),
    occurred_at, actor_id
  );

  return jsonb_build_object(
    'id', document_row.id,
    'original_name', document_row.original_name,
    'byte_size', document_row.byte_size,
    'duplicate', false,
    'event_id', event_row.event_id,
    'replayed', false
  );
end;
$$;

create or replace function private.register_intake_document_command(p_organization_id uuid,p_session_id uuid,p_event_id uuid,p_document_id uuid,p_bucket_id text,p_object_path text,p_original_name text,p_mime_type text,p_byte_size bigint,p_sha256 text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.register_source_version_v1(p_organization_id,p_session_id,p_event_id,p_document_id,p_bucket_id,p_object_path,p_original_name,p_mime_type,p_byte_size,p_sha256,null);
$$;
create function public.register_source_version_v1(p_organization_id uuid,p_session_id uuid,p_event_id uuid,p_document_id uuid,p_bucket_id text,p_object_path text,p_original_name text,p_mime_type text,p_byte_size bigint,p_sha256 text,p_source_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
 select private.register_source_version_v1(p_organization_id,p_session_id,p_event_id,p_document_id,p_bucket_id,p_object_path,p_original_name,p_mime_type,p_byte_size,p_sha256,p_source_id);
$$;
revoke all on function private.register_source_version_v1(uuid,uuid,uuid,uuid,text,text,text,text,bigint,text,uuid),public.register_source_version_v1(uuid,uuid,uuid,uuid,text,text,text,text,bigint,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.register_source_version_v1(uuid,uuid,uuid,uuid,text,text,text,text,bigint,text,uuid),public.register_source_version_v1(uuid,uuid,uuid,uuid,text,text,text,text,bigint,text,uuid) to authenticated;

create function private.bind_source_version_v1(p_version_id uuid,p_resource_id uuid,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.source_versions; b public.source_bindings; result uuid;
begin
 select * into v from public.source_versions where id=p_version_id;
 if not found or not private.can_read_source_version_v1(v.organization_id,v.id)
 or not private.can_access_resource_v1(v.organization_id,p_resource_id,'work')
 then raise exception 'source_binding_denied' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'request_id_required' using errcode='22023'; end if;
 perform 1 from public.sources where id=v.source_id for update;
 select * into b from public.source_bindings where organization_id=v.organization_id and request_id=p_request_id;
 if found then
  if b.source_version_id<>v.id or b.resource_id<>p_resource_id or b.created_by<>auth.uid() then raise exception 'source_binding_idempotency_conflict' using errcode='23505'; end if;
  return b.id;
 end if;
 select id into result from public.source_bindings where organization_id=v.organization_id and source_version_id=v.id and resource_id=p_resource_id and revoked_at is null;
 if result is not null then return result; end if;
 insert into public.source_bindings(organization_id,source_version_id,resource_id,resource_reference,request_id,created_by)
 values(v.organization_id,v.id,p_resource_id,p_resource_id,p_request_id,auth.uid()) returning id into result;
 return result;
end $$;
create function public.bind_source_version_v1(p_version_id uuid,p_resource_id uuid,p_request_id uuid)
returns uuid language sql security invoker set search_path='' as $$select private.bind_source_version_v1(p_version_id,p_resource_id,p_request_id);$$;
revoke all on function private.bind_source_version_v1(uuid,uuid,uuid),public.bind_source_version_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.bind_source_version_v1(uuid,uuid,uuid),public.bind_source_version_v1(uuid,uuid,uuid) to authenticated;

create function private.read_source_version_v1(p_version_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.source_versions;
begin
 select * into v from public.source_versions where id=p_version_id;
 if not found or not private.can_read_source_version_v1(v.organization_id,v.id) then raise exception 'source_version_denied' using errcode='42501'; end if;
 return jsonb_build_object('version',to_jsonb(v),'verification',
 (select jsonb_build_object('state','verified','sha256',observed_sha256,'byte_size',observed_byte_size,'verified_at',created_at) from private.source_version_verifications where organization_id=v.organization_id and source_version_id=v.id order by created_at desc,id limit 1),
 'profiles',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.document_profiles p where p.organization_id=v.organization_id and p.source_document_id=v.id and p.document_version=v.legacy_document_version),
 'layers',(select coalesce(jsonb_agg(to_jsonb(l)),'[]') from public.document_layers l where l.organization_id=v.organization_id and l.source_document_id=v.id and l.document_version=v.legacy_document_version));
end $$;
create function public.read_source_version_v1(p_version_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.read_source_version_v1(p_version_id);$$;
revoke all on function private.read_source_version_v1(uuid),public.read_source_version_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function private.read_source_version_v1(uuid),public.read_source_version_v1(uuid) to authenticated;

-- Extraction, citations and job history refer to the durable version, not the removable projection.
alter table public.evidence_facts drop constraint evidence_facts_organization_id_source_document_id_fkey;
alter table public.evidence_facts add constraint evidence_facts_organization_id_source_document_id_fkey foreign key(organization_id,source_document_id) references public.source_versions(organization_id,id);
alter table public.intake_field_candidates drop constraint intake_field_candidates_organization_id_source_document_id_fkey;
alter table public.intake_field_candidates add constraint intake_field_candidates_organization_id_source_document_id_fkey foreign key(organization_id,source_document_id) references public.source_versions(organization_id,id);
alter table public.processing_jobs drop constraint processing_jobs_organization_id_source_document_id_fkey;
alter table public.processing_jobs add constraint processing_jobs_organization_id_source_document_id_fkey foreign key(organization_id,source_document_id) references public.source_versions(organization_id,id);
alter table public.document_profiles drop constraint document_profiles_organization_id_source_document_id_fkey;
alter table public.document_profiles add constraint document_profiles_organization_id_source_document_id_fkey foreign key(organization_id,source_document_id) references public.source_versions(organization_id,id);
alter table public.document_layers drop constraint document_layers_organization_id_source_document_id_fkey;
alter table public.document_layers add constraint document_layers_organization_id_source_document_id_fkey foreign key(organization_id,source_document_id) references public.source_versions(organization_id,id);
alter table public.case_retrieval_chunks drop constraint case_retrieval_chunks_organization_id_source_document_id_fkey;
alter table public.case_retrieval_chunks add constraint case_retrieval_chunks_organization_id_source_document_id_fkey foreign key(organization_id,source_document_id) references public.source_versions(organization_id,id);
alter table private.receivables_evidence_fragments drop constraint receivables_evidence_fragment_organization_id_source_docum_fkey;
alter table private.receivables_evidence_fragments add constraint receivables_evidence_fragment_organization_id_source_docum_fkey foreign key(organization_id,source_document_id) references public.source_versions(organization_id,id);

create function private.register_source_verification_v1(p_job_id uuid,p_capability_token text,p_receipt jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token); v public.source_versions;
begin
 if j.kind<>'document_pipeline' or j.leased_account_user_id is distinct from auth.uid() then raise exception 'source_verification_denied' using errcode='42501'; end if;
 select v0.* into v from public.source_versions v0 join public.source_documents d on d.organization_id=v0.organization_id and d.id=v0.id
 where v0.organization_id=j.organization_id and v0.id=j.source_document_id and d.intake_session_id=j.intake_session_id;
 if not found or not exists(select 1 from public.source_bindings where organization_id=j.organization_id and source_version_id=v.id and resource_id=j.intake_session_id and revoked_at is null)
 then raise exception 'source_verification_denied' using errcode='42501'; end if;
 if not coalesce(p_receipt->>'verdict'='clean' and p_receipt->>'organizationId'=v.organization_id::text and p_receipt->>'sourceDocumentId'=v.id::text
 and p_receipt->>'operationId'=j.id::text and (p_receipt->>'documentVersion')::integer=v.legacy_document_version
 and p_receipt->>'observedSha256'=v.declared_sha256 and p_receipt->>'expectedSha256'=v.declared_sha256
 and (p_receipt->>'observedByteSize')::bigint=v.byte_size and (p_receipt->>'expectedByteSize')::bigint=v.byte_size
 and p_receipt->>'receiptId' ~ '^sha256:[a-f0-9]{64}$',false)
 then raise exception 'source_verification_receipt_mismatch' using errcode='22023'; end if;
 insert into private.source_version_verifications(organization_id,source_version_id,job_id,observed_sha256,observed_byte_size,receipt_id)
 values(v.organization_id,v.id,j.id,v.declared_sha256,v.byte_size,p_receipt->>'receiptId') on conflict(organization_id,job_id,receipt_id) do nothing;
 -- Compatibility projection only; authority is the immutable verification receipt.
 update public.source_documents set sha256_verified_at=now() where organization_id=v.organization_id and id=v.id;
end $$;
revoke all on function private.register_source_verification_v1(uuid,text,jsonb) from public,anon,authenticated,service_role;

create function private.source_storage_read_v1(p_bucket text,p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select (not exists(select 1 from public.source_versions where bucket_id=p_bucket and object_path=p_path) and not exists(select 1 from public.document_layers where bucket_id=p_bucket and object_path=p_path))
 or exists(select 1 from public.document_layers where bucket_id=p_bucket and object_path=p_path and private.can_read_source_version_v1(organization_id,source_document_id))
 or exists(select 1 from public.source_versions where bucket_id=p_bucket and object_path=p_path and private.can_read_source_version_v1(organization_id,id))
 or private.worker_can_access_document_storage_v1(p_bucket,p_path,false);
$$;
create function private.source_storage_is_unbound_v1(p_bucket text,p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.source_versions where bucket_id=p_bucket and object_path=p_path)
 and not exists(select 1 from public.document_layers where bucket_id=p_bucket and object_path=p_path);
$$;
revoke all on function private.source_storage_read_v1(text,text),private.source_storage_is_unbound_v1(text,text) from public,anon,authenticated,service_role;
grant execute on function private.source_storage_read_v1(text,text),private.source_storage_is_unbound_v1(text,text) to authenticated;
create policy source_version_storage_read on storage.objects as restrictive for select to authenticated using(private.source_storage_read_v1(bucket_id,name));
create policy source_version_storage_no_update on storage.objects as restrictive for update to authenticated using(private.source_storage_is_unbound_v1(bucket_id,name)) with check(private.source_storage_is_unbound_v1(bucket_id,name));
create policy source_version_storage_no_delete on storage.objects as restrictive for delete to authenticated using(private.source_storage_is_unbound_v1(bucket_id,name));

create trigger sources_audit after insert or update or delete on public.sources for each row execute function private.capture_identity_audit_v1();
create trigger source_versions_audit after insert on public.source_versions for each row execute function private.capture_identity_audit_v1();
create trigger source_bindings_audit after insert or update or delete on public.source_bindings for each row execute function private.capture_identity_audit_v1();
create trigger source_verifications_audit after insert on private.source_version_verifications for each row execute function private.capture_identity_audit_v1();

create or replace function private.worker_record_document_result(
  p_job_id uuid,
  p_capability_token text,
  p_scan_result jsonb,
  p_profile jsonb,
  p_layer jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  document_row public.source_documents;
  profile_id uuid;
  layer_id uuid;
  prior_kind text;
  next_kind text;
  classification_version integer;
  classification_event public.intake_domain_events;
begin
  if job_row.source_document_id is null then
    raise exception 'job_has_no_document' using errcode = '22023';
  end if;

  select * into document_row
  from public.source_documents document
  where document.organization_id = job_row.organization_id and document.id = job_row.source_document_id;
  if not found then
    raise exception 'source_document_not_found' using errcode = 'P0002';
  end if;

  if document_row.intake_session_id is not null then
    perform 1
    from public.document_intake_sessions session
    where session.organization_id = job_row.organization_id
      and session.id = document_row.intake_session_id
    for update;
    if not found then
      raise exception 'intake_session_not_found' using errcode = 'P0002';
    end if;
  end if;

  select * into document_row
  from public.source_documents document
  where document.organization_id = job_row.organization_id and document.id = job_row.source_document_id
  for update;

  if not found then
    raise exception 'source_document_not_found' using errcode = 'P0002';
  end if;

  if p_scan_result is not null then
    if p_scan_result->>'verdict'='clean' then perform private.register_source_verification_v1(p_job_id,p_capability_token,p_scan_result); end if;
    update public.source_documents
    set scan_result = p_scan_result,
        processing_status = case
          when coalesce(p_scan_result->>'verdict', 'clean') = 'clean' then 'processing'
          else 'rejected'
        end
    where organization_id = job_row.organization_id and id = document_row.id;
  end if;

  if p_layer is not null then
    insert into public.document_layers (
      organization_id, source_document_id, document_version, processing_run_id, layer_kind,
      object_path, sha256, byte_size, parser_versions, stats, status
    )
    values (
      job_row.organization_id, document_row.id, document_row.document_version, job_row.processing_run_id,
      p_layer->>'layer_kind', p_layer->>'object_path', p_layer->>'sha256',
      (p_layer->>'byte_size')::bigint,
      coalesce(p_layer->'parser_versions', '{}'::jsonb), coalesce(p_layer->'stats', '{}'::jsonb),
      coalesce(p_layer->>'status', 'ready')
    )
    on conflict (organization_id, source_document_id, document_version) do update
    set processing_run_id = excluded.processing_run_id,
        layer_kind = excluded.layer_kind,
        object_path = excluded.object_path,
        sha256 = excluded.sha256,
        byte_size = excluded.byte_size,
        parser_versions = excluded.parser_versions,
        stats = excluded.stats,
        status = excluded.status
    returning id into layer_id;
  end if;

  if p_profile is not null then
    select profile.document_kind into prior_kind
    from public.document_profiles profile
    where profile.organization_id = job_row.organization_id
      and profile.source_document_id = document_row.id
      and profile.document_version = document_row.document_version;

    insert into public.document_profiles as dp (
      organization_id, source_document_id, document_version, processing_run_id, document_kind,
      title, entity_name, entity_role, entity_scope, period_start, period_end, fiscal_year,
      currency, scale, accounting_basis, information_class, evidence_rank, language,
      quality, summary, suggested_folder, suggested_name, classifier, confidence
    )
    values (
      job_row.organization_id, document_row.id, document_row.document_version, job_row.processing_run_id,
      p_profile->>'document_kind', p_profile->>'title', p_profile->>'entity_name',
      p_profile->>'entity_role', p_profile->>'entity_scope',
      (p_profile->>'period_start')::date, (p_profile->>'period_end')::date,
      (p_profile->>'fiscal_year')::integer, p_profile->>'currency', (p_profile->>'scale')::numeric,
      p_profile->>'accounting_basis', p_profile->>'information_class',
      (p_profile->>'evidence_rank')::smallint, p_profile->>'language',
      coalesce(p_profile->'quality', '{}'::jsonb), coalesce(p_profile->'summary', '{}'::jsonb),
      p_profile->>'suggested_folder', p_profile->>'suggested_name',
      coalesce(p_profile->'classifier', '{}'::jsonb), (p_profile->>'confidence')::numeric
    )
    on conflict (organization_id, source_document_id, document_version) do update
    set processing_run_id = excluded.processing_run_id,
        document_kind = excluded.document_kind,
        title = excluded.title,
        entity_name = excluded.entity_name,
        entity_role = excluded.entity_role,
        entity_scope = excluded.entity_scope,
        period_start = excluded.period_start,
        period_end = excluded.period_end,
        fiscal_year = excluded.fiscal_year,
        currency = excluded.currency,
        scale = excluded.scale,
        accounting_basis = excluded.accounting_basis,
        information_class = excluded.information_class,
        evidence_rank = excluded.evidence_rank,
        language = excluded.language,
        quality = excluded.quality,
        summary = excluded.summary,
        suggested_folder = excluded.suggested_folder,
        suggested_name = excluded.suggested_name,
        classifier = excluded.classifier,
        confidence = excluded.confidence
    where dp.review_state = 'proposed'
    returning dp.id, dp.document_kind into profile_id, next_kind;

    if profile_id is not null
      and document_row.intake_session_id is not null
      and next_kind is distinct from prior_kind then
      select count(*)::integer + 1 into classification_version
      from public.intake_domain_events event
      where event.organization_id = job_row.organization_id
        and event.intake_session_id = document_row.intake_session_id
        and event.event_type = 'document_classified'
        and event.payload -> 'document' ->> 'id' = document_row.id::text;

      classification_event := private.append_intake_domain_event(
        job_row.organization_id,
        document_row.intake_session_id,
        gen_random_uuid(),
        'document_classified',
        jsonb_build_object(
          'document', jsonb_build_object('id', document_row.id, 'kind', next_kind),
          'classificationVersion', classification_version
        ),
        clock_timestamp(),
        (select auth.uid())
      );
    end if;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'profile_id', profile_id,
    'layer_id', layer_id,
    'classification_event_id', classification_event.event_id
  ));
end;
$$;

create or replace function private.remove_intake_document_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
  p_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  existing public.intake_domain_events;
  event_row public.intake_domain_events;
  document_row public.source_documents;
  receipt_path text;
  event_payload jsonb;
  occurred_at timestamptz := clock_timestamp();
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status not in ('collecting', 'failed') then
    raise exception 'document_not_removable' using errcode = '55000';
  end if;

  event_payload := jsonb_build_object('documentId', p_document_id, 'actorId', actor_id);
  select * into existing
  from public.intake_domain_events event
  where event.organization_id = p_organization_id and event.event_id = p_event_id;
  if found then
    if existing.intake_session_id is distinct from p_session_id
      or existing.event_type <> 'document_removed'
      or existing.payload is distinct from event_payload then
      raise exception 'intake_event_idempotency_conflict' using errcode = '23505';
    end if;
    select received.payload -> 'document' ->> 'objectPath' into receipt_path
    from public.intake_domain_events received
    where received.organization_id = p_organization_id
      and received.intake_session_id = p_session_id
      and received.event_type = 'document_received'
      and received.payload -> 'document' ->> 'id' = p_document_id::text
    order by received.sequence desc
    limit 1;
    return jsonb_build_object('id', p_document_id, 'object_path', null::text, 'replayed', true);
  end if;

  select * into document_row
  from public.source_documents document
  where document.organization_id = p_organization_id
    and document.intake_session_id = p_session_id
    and document.opportunity_id is null
    and document.id = p_document_id
  for update;
  if not found then
    raise exception 'document_not_removable' using errcode = 'P0002';
  end if;

  event_row := private.append_intake_domain_event(
    p_organization_id, p_session_id, p_event_id, 'document_removed',
    event_payload, occurred_at, actor_id
  );

  update public.source_bindings set revoked_at=now(),revoked_by=actor_id,updated_at=now() where organization_id=p_organization_id and source_version_id=p_document_id and resource_id=p_session_id and revoked_at is null;

  delete from public.source_documents
  where organization_id = p_organization_id
    and intake_session_id = p_session_id
    and id = p_document_id;

  return jsonb_build_object(
    'id', p_document_id,
    'object_path', null::text,
    'event_id', event_row.event_id,
    'replayed', false
  );
end;
$$;

-- This is an active-use edge, not the durable byte lineage: its existing cascade is preserved.
create function private.detach_document_source_binding_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.source_bindings set revoked_at=now(),revoked_by=auth.uid(),updated_at=now()
 where organization_id=old.organization_id and source_version_id=old.id and resource_id=coalesce(old.intake_session_id,old.opportunity_id) and revoked_at is null;
 return old;
end $$;
revoke all on function private.detach_document_source_binding_v1() from public,anon,authenticated,service_role;
create trigger source_documents_detach_binding after delete on public.source_documents for each row execute function private.detach_document_source_binding_v1();
alter table public.source_versions add unique(organization_id,id,legacy_document_version);
alter table public.document_profiles add constraint document_profiles_exact_source_version_fkey foreign key(organization_id,source_document_id,document_version) references public.source_versions(organization_id,id,legacy_document_version);
alter table public.document_layers add constraint document_layers_exact_source_version_fkey foreign key(organization_id,source_document_id,document_version) references public.source_versions(organization_id,id,legacy_document_version);
create function private.can_export_source_version_v1(p_organization_id uuid,p_version_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
 select 1 from public.source_versions v join public.sources s on s.organization_id=v.organization_id and s.id=v.source_id
 where v.organization_id=p_organization_id and v.id=p_version_id
 and private.evaluate_resource_policy_v1(s.organization_id,s.origin_resource_id,auth.uid(),'read','export')
 and exists(select 1 from public.source_bindings b where b.organization_id=v.organization_id and b.source_version_id=v.id and b.revoked_at is null
 and private.evaluate_resource_policy_v1(b.organization_id,b.resource_id,auth.uid(),'read','export')));
$$;
revoke all on function private.can_export_source_version_v1(uuid,uuid) from public,anon,authenticated,service_role;
create function private.authorize_source_version_download_v1(p_version_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.source_versions;
begin
 select * into v from public.source_versions where id=p_version_id;
 if not found or not private.can_export_source_version_v1(v.organization_id,v.id) then raise exception 'source_download_denied' using errcode='42501'; end if;
 return jsonb_build_object('id',v.id,'bucket_id',v.bucket_id,'object_path',v.object_path,'original_name',v.original_name);
end $$;
create function public.authorize_source_version_download_v1(p_version_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.authorize_source_version_download_v1(p_version_id);$$;
revoke all on function private.authorize_source_version_download_v1(uuid),public.authorize_source_version_download_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function private.authorize_source_version_download_v1(uuid),public.authorize_source_version_download_v1(uuid) to authenticated;
create or replace function private.source_storage_read_v1(p_bucket text,p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select (not exists(select 1 from public.source_versions where bucket_id=p_bucket and object_path=p_path) and not exists(select 1 from public.document_layers where bucket_id=p_bucket and object_path=p_path))
 or exists(select 1 from public.document_layers where bucket_id=p_bucket and object_path=p_path and private.can_export_source_version_v1(organization_id,source_document_id))
 or exists(select 1 from public.source_versions where bucket_id=p_bucket and object_path=p_path and private.can_export_source_version_v1(organization_id,id))
 or private.worker_can_access_document_storage_v1(p_bucket,p_path,false);
$$;
create function private.bind_document_job_version_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare v public.source_versions;
begin
 if new.kind='document_pipeline' and new.source_document_id is not null then
  select * into v from public.source_versions where organization_id=new.organization_id and id=new.source_document_id;
  if not found then raise exception 'job_source_version_missing' using errcode='23503'; end if;
  if new.payload ? 'source_version_id' and new.payload->>'source_version_id' is distinct from v.id::text then raise exception 'job_source_version_conflict' using errcode='22023'; end if;
  new.payload:=new.payload||jsonb_build_object('source_version_id',v.id,'source_id',v.source_id);
 end if;
 return new;
end $$;
revoke all on function private.bind_document_job_version_v1() from public,anon,authenticated,service_role;
create trigger processing_jobs_source_version before insert or update of source_document_id,payload on public.processing_jobs for each row execute function private.bind_document_job_version_v1();
create index source_versions_storage_lookup_idx on public.source_versions(bucket_id,object_path);
create index document_layers_storage_lookup_idx on public.document_layers(bucket_id,object_path);
create function private.sync_source_projection_binding_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare previous_resource uuid:=coalesce(old.intake_session_id,old.opportunity_id); next_resource uuid:=coalesce(new.intake_session_id,new.opportunity_id);
begin
 if next_resource is distinct from previous_resource then
  if not private.can_access_resource_v1(new.organization_id,previous_resource,'work') or not private.can_access_resource_v1(new.organization_id,next_resource,'work')
  then raise exception 'source_projection_scope_denied' using errcode='42501'; end if;
  insert into public.source_bindings(organization_id,source_version_id,resource_id,resource_reference,request_id,created_by)
  values(new.organization_id,new.id,next_resource,next_resource,gen_random_uuid(),auth.uid()) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function private.sync_source_projection_binding_v1() from public,anon,authenticated,service_role;
create trigger source_documents_sync_binding after update of intake_session_id,opportunity_id on public.source_documents for each row execute function private.sync_source_projection_binding_v1();

alter table public.sources add check(origin_resource_id is null or origin_resource_id=origin_resource_reference);
alter table public.source_bindings add check(resource_id is null or resource_id=resource_reference);
