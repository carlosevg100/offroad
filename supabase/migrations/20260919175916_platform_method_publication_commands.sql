-- Controlled platform corpus ingress. No tenant actor or worker receives this authority.
-- Commands are SECURITY INVOKER, executable only by the existing database operator.
set search_path = '';

create table private.platform_method_candidates (
 id uuid primary key,
 release_id text not null unique check(release_id ~ '^[a-z][a-z0-9._-]{2,199}$'),
 method_id text not null check(method_id ~ '^[a-z][a-z0-9-]{2,119}$'),
 version text not null check(version ~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{2}-v[0-9]+$'),
 bundle jsonb not null check(jsonb_typeof(bundle)='object'),
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 author text not null check(length(btrim(author)) between 3 and 200),
 submitted_by name not null default current_user,
 created_at timestamptz not null default now(),
 unique(method_id,version)
);
create table private.platform_method_attestations (
 id uuid primary key,
 candidate_id uuid not null references private.platform_method_candidates(id),
 kind text not null check(kind in ('technical_review','content_approval')),
 candidate_fingerprint text not null check(candidate_fingerprint ~ '^[a-f0-9]{64}$'),
 actor text not null check(length(btrim(actor)) between 3 and 200),
 evidence jsonb not null check(jsonb_typeof(evidence)='object'),
 recorded_by name not null default current_user,
 created_at timestamptz not null default now(),
 unique(candidate_id,kind)
);
create table private.platform_method_publication_events (
 sequence bigint generated always as identity primary key,
 command_id uuid not null unique,
 candidate_id uuid not null references private.platform_method_candidates(id),
 action text not null check(action in ('published','retired')),
 request_fingerprint text not null check(request_fingerprint ~ '^[a-f0-9]{64}$'),
 reason text not null check(length(btrim(reason)) between 10 and 2000),
 recorded_by name not null default current_user,
 created_at timestamptz not null default now()
);
create index platform_method_events_candidate on private.platform_method_publication_events(candidate_id,sequence desc);

alter table private.platform_method_candidates enable row level security;
alter table private.platform_method_candidates force row level security;
alter table private.platform_method_attestations enable row level security;
alter table private.platform_method_attestations force row level security;
alter table private.platform_method_publication_events enable row level security;
alter table private.platform_method_publication_events force row level security;
create policy platform_method_candidates_deny on private.platform_method_candidates as restrictive for all to public using(false) with check(false);
create policy platform_method_attestations_deny on private.platform_method_attestations as restrictive for all to public using(false) with check(false);
create policy platform_method_events_deny on private.platform_method_publication_events as restrictive for all to public using(false) with check(false);
revoke all on private.platform_method_candidates,private.platform_method_attestations,private.platform_method_publication_events from public,anon,authenticated,service_role;
revoke all on sequence private.platform_method_publication_events_sequence_seq from public,anon,authenticated,service_role;
create trigger platform_method_candidates_immutable before update or delete on private.platform_method_candidates for each row execute function private.guard_contribution_immutable_v1();
create trigger platform_method_attestations_immutable before update or delete on private.platform_method_attestations for each row execute function private.guard_contribution_immutable_v1();
create trigger platform_method_events_immutable before update or delete on private.platform_method_publication_events for each row execute function private.guard_contribution_immutable_v1();

-- The operator records verified human evidence; an actor string is never an access grant.
-- Keep the operational command separate from Data API and worker capabilities.
create function private.require_platform_method_operator_v1() returns void
language plpgsql security invoker set search_path='' as $$
begin
 if current_user <> 'postgres' then raise exception 'platform_method_operator_required' using errcode='42501';end if;
end $$;
revoke all on function private.require_platform_method_operator_v1() from public,anon,authenticated,service_role;

create function private.submit_platform_method_candidate_v1(p_id uuid,p_release_id text,p_bundle jsonb,p_author text) returns text
language plpgsql security invoker set search_path='' as $$
declare fp text; existing private.platform_method_candidates; pin jsonb; component jsonb;begin
 perform private.require_platform_method_operator_v1();
 if p_id is null or p_release_id is null or p_author is null or length(btrim(p_author)) not between 3 and 200
 or jsonb_typeof(p_bundle) is distinct from 'object' or octet_length(p_bundle::text)>2000000
 or not p_bundle ?& array['manifest','manifestText','components','evidence','sourceCommit']
 or (select count(*) from jsonb_object_keys(p_bundle))<>5
 or p_bundle->>'sourceCommit' is null or p_bundle->>'sourceCommit' !~ '^[a-f0-9]{40}$'
 or jsonb_typeof(p_bundle->'manifestText') is distinct from 'string'
 or jsonb_typeof(p_bundle->'manifest') is distinct from 'object'
 or jsonb_typeof(p_bundle->'components') is distinct from 'array'
 or jsonb_array_length(p_bundle->'components')=0
 or jsonb_typeof(p_bundle->'evidence') is distinct from 'array'
 or jsonb_array_length(p_bundle->'evidence')=0 then raise exception 'platform_method_bundle_invalid' using errcode='22023';end if;
 -- Manifest bytes are the compiler's stable JSON payload, before its manifestHash field.
 if (p_bundle->>'manifestText')::jsonb is distinct from (p_bundle->'manifest')-'manifestHash'
 or encode(extensions.digest(p_bundle->>'manifestText','sha256'),'hex') is distinct from p_bundle->'manifest'->>'manifestHash'
 or p_bundle->'manifest'->>'schemaVersion' is distinct from 'compiled-procedure-manifest.v1'
 or p_bundle->'manifest'->>'authoringStatus' is distinct from 'ready_for_review'
 or p_bundle->'manifest'->'pendingContent' is distinct from '[]'::jsonb
 or p_bundle->'manifest'->'grantsExecution' is distinct from 'false'::jsonb
 or coalesce(p_bundle->'manifest'->'procedure'->>'maturity','') not in ('tested','ready_for_founder','production')
 or p_bundle->'manifest'->'procedure'->>'id' is null
 or p_bundle->'manifest'->'procedure'->>'version' is null
 then raise exception 'platform_method_manifest_invalid' using errcode='22023';end if;
 if p_bundle->'components' is distinct from (select jsonb_agg(x->'component' order by ord) from jsonb_array_elements(p_bundle->'manifest'->'components') with ordinality t(x,ord))
 then raise exception 'platform_method_components_mismatch' using errcode='22023';end if;
 for component in select * from jsonb_array_elements(p_bundle->'components') loop
  if ((component->'invariants') @> '["law","contractual_definition","traceability","verification","access_barriers","deterministic_financial_math"]'::jsonb) is distinct from true
  or component->'rights'->'inheritSourceRestrictions' is distinct from 'true'::jsonb
  then raise exception 'platform_method_invariants_required' using errcode='22023';end if;
 end loop;
 for pin in select * from jsonb_array_elements(p_bundle->'evidence') loop
  if jsonb_typeof(pin) is distinct from 'object' or not pin ?& array['path','hash'] or (select count(*) from jsonb_object_keys(pin))<>2
  or pin->>'hash' is null or pin->>'hash' !~ '^[a-f0-9]{64}$' or pin->>'path' is null or pin->>'path' !~ '^packages/credit-playbook/knowledge/reviews/'
  or pin->>'path' like '%..%' then raise exception 'platform_method_evidence_invalid' using errcode='22023';end if;
 end loop;
 if (select count(distinct x->>'path') from jsonb_array_elements(p_bundle->'evidence') x)<>jsonb_array_length(p_bundle->'evidence') then raise exception 'platform_method_evidence_duplicate' using errcode='22023';end if;
 fp:=encode(extensions.digest(jsonb_build_object('releaseId',p_release_id,'bundle',p_bundle,'author',btrim(p_author))::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('platform-method:'||(p_bundle->'manifest'->'procedure'->>'id'),0));
 select * into existing from private.platform_method_candidates where id=p_id;
 if found then if existing.fingerprint is distinct from fp then raise exception 'platform_method_request_reused' using errcode='22023';end if;return fp;end if;
 insert into private.platform_method_candidates(id,release_id,method_id,version,bundle,fingerprint,author)
 values(p_id,p_release_id,p_bundle->'manifest'->'procedure'->>'id',p_bundle->'manifest'->'procedure'->>'version',p_bundle,fp,btrim(p_author));
 return fp;
end $$;
revoke all on function private.submit_platform_method_candidate_v1(uuid,text,jsonb,text) from public,anon,authenticated,service_role;

create function private.attest_platform_method_candidate_v1(p_id uuid,p_candidate uuid,p_fingerprint text,p_kind text,p_actor text,p_evidence jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare c private.platform_method_candidates; existing private.platform_method_attestations;begin
 perform private.require_platform_method_operator_v1();
 select * into c from private.platform_method_candidates where id=p_candidate for update;
 if c.id is null or p_fingerprint is distinct from c.fingerprint then raise exception 'platform_method_attestation_stale' using errcode='40001';end if;
 if p_id is null or p_kind not in ('technical_review','content_approval') or p_kind is null
 or p_actor is null or length(btrim(p_actor)) not between 3 and 200
 or jsonb_typeof(p_evidence) is distinct from 'object'
 or not p_evidence ?& array['sourcePath','sourceHash','occurredAt','result','manifestHash','sourceCommit','humanApproval']
 or (select count(*) from jsonb_object_keys(p_evidence))<>7
 or p_evidence->>'sourcePath' is null or p_evidence->>'sourcePath' !~ '^packages/credit-playbook/knowledge/reviews/' or p_evidence->>'sourcePath' like '%..%'
 or p_evidence->>'sourceHash' is null or p_evidence->>'sourceHash' !~ '^[a-f0-9]{64}$'
 or p_evidence->>'result' is distinct from 'approved'
 or p_evidence->>'manifestHash' is distinct from c.bundle->'manifest'->>'manifestHash'
 or p_evidence->>'sourceCommit' is distinct from c.bundle->>'sourceCommit'
 or p_evidence->>'occurredAt' is null or (p_evidence->>'occurredAt')::timestamptz>now()
 or (p_kind='content_approval' and p_evidence->'humanApproval' is distinct from 'true'::jsonb)
 or (p_kind='technical_review' and btrim(p_actor)=c.author)
 then raise exception 'platform_method_attestation_invalid' using errcode='22023';end if;
 if not exists(select 1 from jsonb_array_elements(c.bundle->'evidence') x where x->>'path'=p_evidence->>'sourcePath' and x->>'hash'=p_evidence->>'sourceHash') then raise exception 'platform_method_unpinned_attestation' using errcode='22023';end if;
 if exists(select 1 from private.platform_method_publication_events where candidate_id=c.id) then raise exception 'platform_method_already_decided' using errcode='22023';end if;
 select * into existing from private.platform_method_attestations where id=p_id;
 if found then
  if existing.candidate_id<>p_candidate or existing.kind<>p_kind or existing.actor<>btrim(p_actor) or existing.evidence<>p_evidence then raise exception 'platform_method_request_reused' using errcode='22023';end if;return p_id;
 end if;
 insert into private.platform_method_attestations(id,candidate_id,kind,candidate_fingerprint,actor,evidence) values(p_id,p_candidate,p_kind,p_fingerprint,btrim(p_actor),p_evidence);
 return p_id;
end $$;
revoke all on function private.attest_platform_method_candidate_v1(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;

create function private.publish_platform_method_v1(p_command uuid,p_candidate uuid,p_fingerprint text,p_reason text) returns text
language plpgsql security invoker set search_path='' as $$
declare c private.platform_method_candidates; a private.platform_method_attestations;cap text; fp text; prior private.platform_method_publication_events;begin
 perform private.require_platform_method_operator_v1();
 select * into c from private.platform_method_candidates where id=p_candidate for update;
 if c.id is null or p_fingerprint is distinct from c.fingerprint then raise exception 'platform_method_publication_stale' using errcode='40001';end if;
 if p_command is null or p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then raise exception 'platform_method_publication_invalid' using errcode='22023';end if;
 fp:=encode(extensions.digest(jsonb_build_object('candidate',p_candidate,'fingerprint',p_fingerprint,'reason',btrim(p_reason),'action','published')::text,'sha256'),'hex');
 select * into prior from private.platform_method_publication_events where command_id=p_command;
 if found then if prior.request_fingerprint is distinct from fp then raise exception 'platform_method_request_reused' using errcode='22023';end if;return c.release_id;end if;
 if exists(select 1 from private.platform_method_publication_events where candidate_id=c.id) then raise exception 'platform_method_already_decided' using errcode='22023';end if;
 if (select count(*) from private.platform_method_attestations where candidate_id=c.id and candidate_fingerprint=c.fingerprint)<>2 then raise exception 'platform_method_reviews_required' using errcode='42501';end if;
 select * into strict a from private.platform_method_attestations where candidate_id=c.id and kind='content_approval';
 cap:='method.'||c.method_id||'.'||c.version;
 -- Catalogue publication does not release an executor. A later execution gate owns activation.
 insert into private.platform_capability_releases(capability_key,released,exposure,method_id,method_version,method_maturity,approved_by,approved_at,approval_source,note)
 values(cap,false,'internal',c.method_id,c.version,'tested',a.actor,(a.evidence->>'occurredAt')::timestamptz::date,a.evidence->>'sourcePath','Published corpus only; execution remains disabled.');
 insert into private.platform_method_releases(id,method_id,version,manifest_hash,manifest,components,evidence,approval,capability_key)
 values(c.release_id,c.method_id,c.version,c.bundle->'manifest'->>'manifestHash',c.bundle->'manifest',c.bundle->'components',c.bundle->'evidence',
 jsonb_build_object('approvedBy',a.actor,'approvedAt',a.evidence->>'occurredAt','approvalSource',a.evidence->>'sourcePath','sourceHash',a.evidence->>'sourceHash','sourceCommit',c.bundle->>'sourceCommit','candidateFingerprint',c.fingerprint,'executionEnabled',false),cap);
 insert into private.platform_method_publication_events(command_id,candidate_id,action,request_fingerprint,reason) values(p_command,c.id,'published',fp,btrim(p_reason));
 return c.release_id;
end $$;
revoke all on function private.publish_platform_method_v1(uuid,uuid,text,text) from public,anon,authenticated,service_role;

create function private.retire_platform_method_v1(p_command uuid,p_candidate uuid,p_fingerprint text,p_reason text) returns text
language plpgsql security invoker set search_path='' as $$
declare c private.platform_method_candidates;fp text;prior private.platform_method_publication_events;begin
 perform private.require_platform_method_operator_v1();
 select * into c from private.platform_method_candidates where id=p_candidate for update;
 if c.id is null or p_fingerprint is distinct from c.fingerprint then raise exception 'platform_method_retirement_stale' using errcode='40001';end if;
 if p_command is null or p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then raise exception 'platform_method_retirement_invalid' using errcode='22023';end if;
 fp:=encode(extensions.digest(jsonb_build_object('candidate',p_candidate,'fingerprint',p_fingerprint,'reason',btrim(p_reason),'action','retired')::text,'sha256'),'hex');
 select * into prior from private.platform_method_publication_events where command_id=p_command;
 if found then if prior.request_fingerprint is distinct from fp then raise exception 'platform_method_request_reused' using errcode='22023';end if;return c.release_id;end if;
 if (select action from private.platform_method_publication_events where candidate_id=c.id order by sequence desc limit 1) is distinct from 'published' then raise exception 'platform_method_not_published' using errcode='22023';end if;
 update private.platform_capability_releases set released=false,updated_at=now() where capability_key=(select capability_key from private.platform_method_releases where id=c.release_id);
 insert into private.platform_method_publication_events(command_id,candidate_id,action,request_fingerprint,reason) values(p_command,c.id,'retired',fp,btrim(p_reason));
 return c.release_id;
end $$;
revoke all on function private.retire_platform_method_v1(uuid,uuid,text,text) from public,anon,authenticated,service_role;

create function private.platform_method_reference_available_v1(p_release text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.platform_method_releases b join private.platform_capability_releases c on c.capability_key=b.capability_key
 where b.id=p_release and c.method_id=b.method_id and c.method_version=b.version
 and case when exists(select 1 from private.platform_method_candidates x where x.release_id=b.id)
 then (select e.action='published' from private.platform_method_candidates x join private.platform_method_publication_events e on e.candidate_id=x.id where x.release_id=b.id order by e.sequence desc limit 1)
 else c.released end)
$$;
revoke all on function private.platform_method_reference_available_v1(text) from public,anon,authenticated,service_role;

-- Preserve exact current readers; only separate corpus publication from execution activation.
do $patch$
declare body text;needle text;replacement text;begin
 body:=pg_get_functiondef('private.compose_method_v1(uuid,text,jsonb,uuid,text)'::regprocedure);
 needle:='not exists(select 1 from private.platform_capability_releases x where x.capability_key=b.capability_key and x.released and x.method_id=b.method_id and x.method_version=b.version)';
 if position(needle in body)=0 then raise exception 'platform_method_compose_anchor_missing';end if;
 execute replace(body,needle,'not private.platform_method_reference_available_v1(b.id)');
 body:=pg_get_functiondef('private.list_method_releases_v1(integer)'::regprocedure);
 needle:='where c.released and c.method_id=b.method_id and c.method_version=b.version';
 if position(needle in body)=0 then raise exception 'platform_method_reader_anchor_missing';end if;
 execute replace(body,needle,'where private.platform_method_reference_available_v1(b.id)');
end $patch$;
