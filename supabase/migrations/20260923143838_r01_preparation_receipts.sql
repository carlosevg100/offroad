-- Stage 17: private preparation assertion, never an execution grant.
-- A recorded worker assertion is NEVER an execution authorization. The future consumer
-- must replay the pinned preparer and apply the published readiness gate independently.
set search_path='';
create table private.r01_preparation_receipts (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id),
 work_id uuid not null,intake_session_id uuid not null,
 subject_user_id uuid not null references auth.users(id),
 producer_job_id uuid not null, producer_processing_run_id uuid not null,
 worker_token_id uuid not null references private.worker_tokens(id), worker_account_user_id uuid not null references auth.users(id),
 -- Hash identifies the authenticated attempt without retaining the bearer secret.
 producer_capability_sha256 bytea not null check(octet_length(producer_capability_sha256)=32),
 producer_attempt integer not null check(producer_attempt>0),
 preparer_id text not null check(preparer_id='r01-preparation.2026-09-23.v1'),
 preparer_source_commit text not null check(preparer_source_commit='585bb62b0c54b43addaefb43b6fc0a41b4aceeb6'),
 preparer_snapshot_hash text not null check(preparer_snapshot_hash='da0fe862d642ae02f9c1dc32d6b94eedbcbb79e2e7795c8cbed13fbf1b0757f0'),
 preparer_artifact_hash text not null check(preparer_artifact_hash='c3043ee77b56adfd6b3ce234c0ead8ae3892bfbefb6753426ef37e6db6547f15'),
 platform_release_id text not null references private.platform_method_releases(id),
 execution_profile_id uuid not null references private.execution_method_profiles(id),
 profile_fingerprint text not null check(profile_fingerprint ~ '^[a-f0-9]{64}$'),
 authority_snapshot_hash text not null check(authority_snapshot_hash ~ '^[a-f0-9]{64}$'),
 -- Compact metadata only. Exact raw payload remains in existing immutable sources/history.
 authority_pins jsonb not null check(jsonb_typeof(authority_pins)='object'),
 history_pins jsonb not null check(jsonb_typeof(history_pins)='array'),
 response_pins jsonb not null check(jsonb_typeof(response_pins)='array'),
 canonical_input text not null check(octet_length(canonical_input)<=33554432),
 input_fingerprint text not null check(input_fingerprint=encode(extensions.digest(convert_to(canonical_input,'UTF8'),'sha256'),'hex')),
 requires_consumer_replay boolean not null default true check(requires_consumer_replay),
 grants_execution boolean not null default false check(not grants_execution),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,intake_session_id) references public.document_intake_sessions(organization_id,id),
 foreign key(organization_id,producer_job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,producer_processing_run_id) references public.processing_runs(organization_id,id)
);
alter table private.r01_preparation_receipts enable row level security;
alter table private.r01_preparation_receipts force row level security;
revoke all on private.r01_preparation_receipts from public,anon,authenticated,service_role;
create policy r01_preparation_receipts_select on private.r01_preparation_receipts for select to public using(false);
create policy r01_preparation_receipts_insert on private.r01_preparation_receipts for insert to public with check(false);
create policy r01_preparation_receipts_update on private.r01_preparation_receipts for update to public using(false) with check(false);
create policy r01_preparation_receipts_delete on private.r01_preparation_receipts for delete to public using(false);
create index r01_receipt_work_idx on private.r01_preparation_receipts(organization_id,work_id);
create index r01_receipt_session_idx on private.r01_preparation_receipts(organization_id,intake_session_id);
create index r01_receipt_job_idx on private.r01_preparation_receipts(organization_id,producer_job_id);
create index r01_receipt_run_idx on private.r01_preparation_receipts(organization_id,producer_processing_run_id);
create index r01_receipt_subject_idx on private.r01_preparation_receipts(subject_user_id);
create index r01_receipt_worker_idx on private.r01_preparation_receipts(worker_token_id);
create index r01_receipt_account_idx on private.r01_preparation_receipts(worker_account_user_id);
create index r01_receipt_release_idx on private.r01_preparation_receipts(platform_release_id);
create index r01_receipt_profile_idx on private.r01_preparation_receipts(execution_profile_id);
create trigger r01_preparation_receipts_updated before update on private.r01_preparation_receipts
 for each row execute function private.set_updated_at();
create trigger r01_preparation_receipts_audit after insert on private.r01_preparation_receipts
 for each row execute function private.capture_identity_audit_v1();
create trigger r01_preparation_receipts_immutable before update or delete on private.r01_preparation_receipts
 for each row execute function private.guard_contribution_immutable_v1();

create function private.record_r01_preparation_receipt_v1(
 p_receipt uuid,p_job uuid,p_capability text,p_profile uuid,
 p_expected_authority_snapshot_hash text,p_canonical_input text
) returns uuid language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs; profile private.execution_method_profiles; state jsonb;
 prior private.r01_preparation_receipts; observed_hash text; input_hash text; hp jsonb; rp jsonb;
begin
 if p_receipt is null or p_job is null or p_profile is null or p_capability is null
 or p_expected_authority_snapshot_hash is null or p_expected_authority_snapshot_hash !~ '^[a-f0-9]{64}$'
 or p_canonical_input is null or octet_length(p_canonical_input)>33554432 then
 raise exception 'r01_receipt_invalid' using errcode='22023';end if;
 -- Acquire account -> token -> policy BEFORE the loader's session -> work locks.
 perform 1 from auth.users where id=auth.uid() and deleted_at is null
 and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'r01_receipt_denied' using errcode='42501';end if;
 select * into j from public.processing_jobs where id=p_job;
 if not found then raise exception 'r01_receipt_denied' using errcode='42501';end if;
 perform 1 from private.worker_tokens where id=j.leased_by and status='active' and revoked_at is null
 and execution_account_user_id=auth.uid() for share;
 if not found then raise exception 'r01_receipt_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||j.organization_id::text,0));
 state:=private.worker_load_receivables_preparation_v1(p_job,p_capability);
 j:=private.job_for_capability(p_job,p_capability);
 if state#>>'{authority,subjectId}' is distinct from j.authorization_subject_id::text
 or state#>>'{authority,organizationId}' is distinct from j.organization_id::text
 or state#>>'{authority,sessionId}' is distinct from j.intake_session_id::text
 then raise exception 'r01_receipt_denied' using errcode='42501';end if;
 -- No semantic mapping for canonical adoptions has been published yet.
 if jsonb_array_length(state#>'{authority,adoptionPins}') is distinct from 0
 or jsonb_array_length(state#>'{input,resolvedValues}') is distinct from 0
 then raise exception 'r01_receipt_adoption_binding_unavailable' using errcode='42501';end if;
 -- Snapshot hash is generated by the DB over the freshly reloaded DB snapshot.
 -- Loader wrapper must provide exactly this hash to the runtime before preparation.
 -- Its serialization is PG JSONB text, NOT the financial/input canonical serializer.
 observed_hash:=encode(extensions.digest(convert_to(state::text,'UTF8'),'sha256'),'hex');
 if observed_hash is distinct from p_expected_authority_snapshot_hash then
 raise exception 'r01_receipt_authority_changed' using errcode='42501';end if;
 select p.* into profile from private.execution_method_profiles p join private.platform_method_releases r on r.id=p.platform_release_id
 where p.id=p_profile and r.id='r01-2026.09.06-v1'
 and r.manifest_hash='17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090'
 and p.payload->>'fingerprint'='7fc3be6e6169c027b1ba2f11f61abefdeccd5f0e087bd980a35c85e6575297b9';
 if not found or private.platform_method_reference_available_v1(profile.platform_release_id) is not true then raise exception 'r01_receipt_profile_denied' using errcode='42501';end if;
 -- Syntax/duplicate-key/canonical representation validator only, not financial truth.
 perform private.execution_json_projection_v1(p_canonical_input);
 input_hash:=encode(extensions.digest(convert_to(p_canonical_input,'UTF8'),'sha256'),'hex');
 select coalesce(jsonb_agg(jsonb_build_object('revision',h#>'{resultingDraft,revision}',
 'patchId',h#>'{patch,patchId}',
 'patchHash',encode(extensions.digest(convert_to((h->'patch')::text,'UTF8'),'sha256'),'hex'),
 'draftHash',encode(extensions.digest(convert_to((h->'resultingDraft')::text,'UTF8'),'sha256'),'hex')) order by ord),'[]') into hp
 from jsonb_array_elements(state#>'{input,history}') with ordinality x(h,ord);
 select coalesce(jsonb_agg(jsonb_build_object('messageId',a->'messageId','requestId',a#>'{answeredRequest,id}',
 'authorityHash',encode(extensions.digest(convert_to(a::text,'UTF8'),'sha256'),'hex')) order by a->>'messageId'),'[]') into rp
 from jsonb_array_elements(state#>'{input,responses}') a;
 perform pg_advisory_xact_lock(hashtextextended('r01-receipt:'||p_receipt::text,0));
 select * into prior from private.r01_preparation_receipts where id=p_receipt;
 if found then
 if prior.organization_id is distinct from j.organization_id or prior.producer_job_id is distinct from j.id
 or prior.subject_user_id is distinct from j.authorization_subject_id or prior.execution_profile_id is distinct from p_profile
 or prior.authority_snapshot_hash is distinct from observed_hash or prior.input_fingerprint is distinct from input_hash
 or prior.producer_capability_sha256 is distinct from j.capability_sha256 or prior.producer_attempt is distinct from j.attempts
 then raise exception 'r01_receipt_replay_conflict' using errcode='23505';end if;
 perform private.job_for_capability(p_job,p_capability);
 if j.lease_expires_at<=clock_timestamp() or private.job_authority_is_current_v1(j.id) is not true then raise exception 'r01_receipt_denied' using errcode='42501';end if;
 return prior.id;end if;
 -- No arbitrary grant or financial result is created here.
 insert into private.r01_preparation_receipts(id,organization_id,work_id,intake_session_id,subject_user_id,
 producer_job_id,producer_processing_run_id,worker_token_id,worker_account_user_id,producer_capability_sha256,producer_attempt,
 preparer_id,preparer_source_commit,preparer_snapshot_hash,preparer_artifact_hash,
 platform_release_id,execution_profile_id,profile_fingerprint,authority_snapshot_hash,authority_pins,history_pins,response_pins,canonical_input,input_fingerprint)
 values(p_receipt,j.organization_id,(state#>>'{authority,workId}')::uuid,j.intake_session_id,j.authorization_subject_id,
 j.id,j.processing_run_id,j.leased_by,auth.uid(),j.capability_sha256,j.attempts,
 'r01-preparation.2026-09-23.v1','585bb62b0c54b43addaefb43b6fc0a41b4aceeb6',
 'da0fe862d642ae02f9c1dc32d6b94eedbcbb79e2e7795c8cbed13fbf1b0757f0','c3043ee77b56adfd6b3ce234c0ead8ae3892bfbefb6753426ef37e6db6547f15',
 profile.platform_release_id,profile.id,profile.payload_fingerprint,observed_hash,state->'authority',hp,rp,p_canonical_input,input_hash);
 -- Recheck authoritative lease after work, not only its initial copied row.
 perform private.job_for_capability(p_job,p_capability);
 if private.job_authority_is_current_v1(j.id) is not true or j.lease_expires_at<=clock_timestamp()
 then raise exception 'r01_receipt_denied' using errcode='42501';end if;
 return p_receipt;
end $$;
revoke all on function private.record_r01_preparation_receipt_v1(uuid,uuid,text,uuid,text,text) from public,anon,authenticated,service_role;


create function private.load_r01_preparation_for_receipt_v1(p_job uuid,p_capability text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare state jsonb;begin
 state:=private.worker_load_receivables_preparation_v1(p_job,p_capability);
 return state||jsonb_build_object('authoritySnapshotHash',encode(extensions.digest(convert_to(state::text,'UTF8'),'sha256'),'hex'));
end $$;
revoke all on function private.load_r01_preparation_for_receipt_v1(uuid,text) from public,anon,authenticated,service_role;

-- Encoding conversion is STABLE in PostgreSQL. This helper has no indexed callers.
alter function private.r01_scope_dataset_hash_v1(jsonb) stable;
-- Make JSON initialization casts explicit without changing applied migration history.
do $$declare old text;body text;begin
 old:=pg_get_functiondef('private.r01_preparation_authority_v1(uuid,uuid,uuid,uuid)'::regprocedure);
 body:=replace(old,'jsonb:=''[]''','jsonb:=''[]''::jsonb');
 if body=old then raise exception 'r01_loader_initialization_contract_changed';end if;
 execute body;
end $$;
