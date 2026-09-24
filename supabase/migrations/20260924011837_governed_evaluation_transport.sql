-- Stage 17, increment 5, database half: governed evaluations. An evaluation is a platform job, not a
-- tenant execution. It runs only inside an organization an operator registered for evaluations, is
-- requested and read only by a registered evaluator principal, and reaches a provider only through the
-- worker, one declared, reserved and journaled operation at a time. Contract, snapshot, budget,
-- receipts and result live in evaluation tables beside the execution core, which keeps every column,
-- constraint, receipt index and commit rule it had. The transport is installed closed: its switch
-- starts unreleased, and the worker image deployed today neither claims nor sees the new job kind.
set search_path='';

-- The three functions restated explicitly below are pinned to the bodies they replace, so a parallel
-- change to any of them stops this migration instead of being overwritten.
do $$begin
 if (select md5(prosrc) from pg_proc where oid='private.require_platform_principal_v1(uuid,boolean)'::regprocedure)<>'66cdd8354cca9e2d8f804b932ca919bd'
 or (select md5(prosrc) from pg_proc where oid='private.platform_principal_live_v1(uuid)'::regprocedure)<>'cf7da1d562ef513d35d2083fa696bed2'
 or (select md5(prosrc) from pg_proc where oid='private.worker_authorize_provider_processing_v1(uuid,text,jsonb,text[],text)'::regprocedure)<>'cb0045099eefa951d250eb7fca10dcc2'
 then raise exception 'evaluation_restated_contract_changed';end if;
end $$;

-- 1. Evaluator principals. An evaluator requests and reads evaluations and nothing else: operator
-- commands and every declared ledger identity accept the founder and operators only.
alter table private.platform_principals drop constraint platform_principals_role_check;
alter table private.platform_principals add constraint platform_principals_role_check check(role in ('founder','operator','evaluator'));

create or replace function private.require_platform_principal_v1(p_user_id uuid,p_founder boolean default false) returns private.platform_principals
language plpgsql security invoker set search_path='' as $$
declare p private.platform_principals;begin
 perform private.require_platform_method_operator_v1();
 if p_user_id is null then raise exception 'platform_principal_required' using errcode='42501';end if;
 select * into p from private.platform_principals where user_id=p_user_id and revoked_at is null;
 -- Operator commands take the founder or an operator; an evaluator never acts as either.
 if not found or p.role not in ('founder','operator') or (p_founder and p.role<>'founder') then raise exception 'platform_principal_required' using errcode='42501';end if;
 perform 1 from auth.users u where u.id=p_user_id and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp());
 if not found then raise exception 'platform_principal_required' using errcode='42501';end if;
 return p;
end $$;

-- A declared ledger identity (offroad.actor_user_id) names the founder or an operator, never an evaluator.
create or replace function private.platform_principal_live_v1(p_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.platform_principals p join auth.users u on u.id=p.user_id
  where p.user_id=p_user_id and p.role in ('founder','operator') and p.revoked_at is null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()));
$$;

create function private.platform_evaluator_live_v1(p_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.platform_principals p join auth.users u on u.id=p.user_id
  where p.user_id=p_user_id and p.role='evaluator' and p.revoked_at is null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()));
$$;

-- Operator surface only, like every platform command. The principal row stays shared-locked until
-- the command commits: a revocation waits for it, and every later command sees the revocation.
create function private.require_platform_evaluator_v1(p_user_id uuid) returns private.platform_principals
language plpgsql security invoker set search_path='' as $$
declare p private.platform_principals;begin
 perform private.require_platform_method_operator_v1();
 if p_user_id is null then raise exception 'platform_principal_required' using errcode='42501';end if;
 select * into p from private.platform_principals where user_id=p_user_id and revoked_at is null for share;
 if not found or p.role<>'evaluator' then raise exception 'platform_principal_required' using errcode='42501';end if;
 perform 1 from auth.users u where u.id=p_user_id and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp());
 if not found then raise exception 'platform_principal_required' using errcode='42501';end if;
 return p;
end $$;

-- 2. Evaluation organizations: registered only through the identity-bound operator command, never
-- edited, removed or truncated, and ledgered with the acting principal and command.
create table private.platform_evaluation_organizations (
 organization_id uuid primary key references public.organizations(id),
 note text check(note is null or char_length(note)<=500),
 registered_by_user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index platform_evaluation_organizations_actor_idx on private.platform_evaluation_organizations(registered_by_user_id);
create table private.platform_evaluation_organization_events (
 sequence bigint generated always as identity primary key,
 command_id uuid not null unique,
 organization_id uuid not null references private.platform_evaluation_organizations(organization_id),
 note text,
 actor_user_id uuid not null references auth.users(id),
 recorded_by name not null default current_user,
 session_user_name name not null default session_user,
 application_name text not null default coalesce(current_setting('application_name',true),''),
 created_at timestamptz not null default now()
);
create index platform_evaluation_organization_events_organization_idx on private.platform_evaluation_organization_events(organization_id);
create index platform_evaluation_organization_events_actor_idx on private.platform_evaluation_organization_events(actor_user_id);

create function private.guard_platform_evaluation_organization_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op<>'INSERT' then raise exception 'platform_ledger_immutable' using errcode='23514';end if;
 -- Only the command inserts: it declares its command id and the live operator it verified.
 if private.platform_actor_setting_v1('offroad.command_id') is null
 or private.platform_actor_identity_v1() is distinct from new.registered_by_user_id
 then raise exception 'platform_evaluation_organization_command_required' using errcode='42501';end if;
 return new;
end $$;
create trigger platform_evaluation_organizations_guard before insert or update or delete on private.platform_evaluation_organizations
 for each row execute function private.guard_platform_evaluation_organization_v1();
create function private.ledger_platform_evaluation_organization_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.platform_evaluation_organization_events(command_id,organization_id,note,actor_user_id)
 values(private.platform_actor_setting_v1('offroad.command_id')::uuid,new.organization_id,new.note,new.registered_by_user_id);
 return new;
end $$;
create trigger platform_evaluation_organizations_ledger after insert on private.platform_evaluation_organizations
 for each row execute function private.ledger_platform_evaluation_organization_v1();
create trigger platform_evaluation_organization_events_immutable before update or delete on private.platform_evaluation_organization_events
 for each row execute function private.guard_contribution_immutable_v1();

create function private.register_platform_evaluation_organization_v1(p_command uuid,p_organization uuid,p_note text,p_actor_user_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare prior private.platform_evaluation_organization_events;begin
 if p_command is null or p_organization is null or (p_note is not null and char_length(p_note)>500) then raise exception 'platform_evaluation_organization_invalid' using errcode='22023';end if;
 perform 1 from public.organizations where id=p_organization;
 if not found then raise exception 'platform_evaluation_organization_invalid' using errcode='22023';end if;
 -- Evaluations spend and journal inside the organization. One the founder does not belong to is a
 -- client's, and only the founder registers it; the founder's own workspace is an operator act.
 perform private.require_platform_principal_v1(p_actor_user_id,not exists(
  select 1 from public.organization_memberships m join private.platform_principals f on f.user_id=m.user_id and f.role='founder' and f.revoked_at is null
  where m.organization_id=p_organization and m.status='active'));
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.platform_evaluation_organization_events where command_id=p_command;
 if found then
  if prior.organization_id<>p_organization or prior.note is distinct from p_note or prior.actor_user_id<>p_actor_user_id
  then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-evaluation-organization:'||p_organization::text,0));
 if exists(select 1 from private.platform_evaluation_organizations where organization_id=p_organization)
 then raise exception 'platform_evaluation_organization_registered' using errcode='23505';end if;
 perform set_config('offroad.actor_user_id',p_actor_user_id::text,true);
 perform set_config('offroad.command_id',p_command::text,true);
 insert into private.platform_evaluation_organizations(organization_id,note,registered_by_user_id) values(p_organization,p_note,p_actor_user_id);
 perform set_config('offroad.actor_user_id','',true);perform set_config('offroad.command_id','',true);
end $$;

-- 3. Evaluation storage beside the execution core. The identity row holds the exact contract and
-- snapshot bytes; budget, operation receipts and the result mirror the execution tables. Nothing
-- here makes an execution column nullable or touches the kernel receipt index.
create table private.governed_evaluations (
 id uuid primary key,
 organization_id uuid not null references private.platform_evaluation_organizations(organization_id),
 requested_by_user_id uuid not null references auth.users(id),
 request_id uuid not null,
 processing_run_id uuid not null,
 serialization_version text not null check(serialization_version='offroad-execution-json-utf16-v1'),
 contract_text text not null check(octet_length(contract_text) between 1 and 1048576),
 contract_fingerprint text not null check(contract_fingerprint ~ '^[a-f0-9]{64}$'),
 contract jsonb generated always as (private.execution_json_projection_v1(contract_text)) stored,
 snapshot_text text not null check(octet_length(snapshot_text) between 1 and 8388608 and private.execution_json_projection_v1(snapshot_text) is not null),
 snapshot_fingerprint text not null check(snapshot_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,requested_by_user_id,request_id),
 unique(organization_id,processing_run_id),
 foreign key(organization_id,processing_run_id) references public.processing_runs(organization_id,id),
 check(contract_fingerprint=encode(extensions.digest(convert_to(contract_text,'UTF8'),'sha256'),'hex')),
 check(snapshot_fingerprint=encode(extensions.digest(convert_to(snapshot_text,'UTF8'),'sha256'),'hex'))
);
create index governed_evaluations_requester_idx on private.governed_evaluations(requested_by_user_id);
create table private.governed_evaluation_request_events (
 sequence bigint generated always as identity primary key,
 organization_id uuid not null,
 evaluation_id uuid not null unique,
 request_id uuid not null,
 actor_user_id uuid not null references auth.users(id),
 contract_fingerprint text not null check(contract_fingerprint ~ '^[a-f0-9]{64}$'),
 snapshot_fingerprint text not null check(snapshot_fingerprint ~ '^[a-f0-9]{64}$'),
 recorded_by name not null default current_user,
 session_user_name name not null default session_user,
 application_name text not null default coalesce(current_setting('application_name',true),''),
 created_at timestamptz not null default now(),
 foreign key(organization_id,evaluation_id) references private.governed_evaluations(organization_id,id)
);
create index governed_evaluation_request_events_evaluation_idx on private.governed_evaluation_request_events(organization_id,evaluation_id);
create index governed_evaluation_request_events_actor_idx on private.governed_evaluation_request_events(actor_user_id);
create table private.evaluation_budget_accounts (
 evaluation_id uuid primary key,
 organization_id uuid not null,
 spent_microusd bigint not null default 0 check(spent_microusd between 0 and 9007199254740991),
 reserved_microusd bigint not null default 0 check(reserved_microusd between 0 and 9007199254740991),
 spent_calls bigint not null default 0 check(spent_calls between 0 and 9007199254740991),
 reserved_calls bigint not null default 0 check(reserved_calls between 0 and 9007199254740991),
 active_duration_ms bigint not null default 0 check(active_duration_ms between 0 and 9007199254740991),
 accounted_at timestamptz, lease_id uuid,
 -- First time a send was refused for lack of budget, duration or time. Never cleared.
 exhausted_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,evaluation_id),
 foreign key(organization_id,evaluation_id) references private.governed_evaluations(organization_id,id)
);
create table private.evaluation_operation_receipts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 evaluation_id uuid not null,
 operation_id uuid not null,
 lease_id uuid not null,
 tool_id text not null check(char_length(tool_id) between 1 and 200),
 tool_version text not null check(char_length(tool_version) between 1 and 120),
 route jsonb not null check(jsonb_typeof(route)='object'),
 resources text[] not null check(cardinality(resources) between 1 and 11),
 decision_id uuid not null,
 reserved_microusd bigint not null check(reserved_microusd between 0 and 9007199254740991),
 reserved_calls bigint not null check(reserved_calls between 1 and 9007199254740991),
 state text not null check(state in ('reserved','settled','uncertain')),
 spent_microusd bigint check(spent_microusd between 0 and reserved_microusd),
 spent_calls bigint check(spent_calls between 0 and reserved_calls),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,evaluation_id,operation_id),
 foreign key(organization_id,evaluation_id) references private.governed_evaluations(organization_id,id),
 foreign key(organization_id,decision_id) references private.processing_eligibility_decisions(organization_id,id),
 check((state='settled')=(spent_microusd is not null and spent_calls is not null))
);
create index evaluation_operation_receipts_decision_idx on private.evaluation_operation_receipts(organization_id,decision_id);
create table private.evaluation_result_receipts (
 evaluation_id uuid primary key,
 organization_id uuid not null,
 lease_id uuid not null,
 contract_fingerprint text not null check(contract_fingerprint ~ '^[a-f0-9]{64}$'),
 input_fingerprint text not null check(input_fingerprint ~ '^[a-f0-9]{64}$'),
 result_fingerprint text not null,
 canonical_result text not null check(octet_length(canonical_result) between 1 and 8388608 and private.execution_json_projection_v1(canonical_result) is not null),
 outcome text not null check(outcome in ('succeeded','partial')),
 reason text not null check(reason in ('evaluated','budget_exhausted','operation_uncertain','transport_denied','evaluation_failed')),
 created_at timestamptz not null default now(),
 unique(organization_id,evaluation_id),
 foreign key(organization_id,evaluation_id) references private.governed_evaluations(organization_id,id),
 check(result_fingerprint=encode(extensions.digest(convert_to(canonical_result,'UTF8'),'sha256'),'hex')),
 check((outcome='succeeded')=(reason='evaluated'))
);

-- A receipt only moves forward from reserved; its identity, route, decision and reservation never change.
create function private.guard_evaluation_operation_receipt_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op<>'UPDATE' or old.state<>'reserved' or new.state not in ('settled','uncertain')
 or (to_jsonb(new)-array['state','spent_microusd','spent_calls','updated_at']) is distinct from (to_jsonb(old)-array['state','spent_microusd','spent_calls','updated_at'])
 then raise exception 'evaluation_receipt_immutable' using errcode='23514';end if;
 return new;
end $$;
create trigger evaluation_operation_receipts_guard before update or delete on private.evaluation_operation_receipts
 for each row execute function private.guard_evaluation_operation_receipt_v1();
create trigger evaluation_operation_receipts_updated before update on private.evaluation_operation_receipts
 for each row execute function private.set_updated_at();
create trigger evaluation_budget_accounts_undeletable before delete on private.evaluation_budget_accounts
 for each row execute function private.guard_contribution_immutable_v1();
create trigger evaluation_budget_accounts_updated before update on private.evaluation_budget_accounts
 for each row execute function private.set_updated_at();
do $$ declare t text;begin
 foreach t in array array['governed_evaluations','governed_evaluation_request_events','evaluation_result_receipts'] loop
  execute format('create trigger %I before update or delete on private.%I for each row execute function private.guard_contribution_immutable_v1()',t||'_immutable',t);
 end loop;
 foreach t in array array['platform_evaluation_organizations','platform_evaluation_organization_events','governed_evaluations','governed_evaluation_request_events',
  'evaluation_budget_accounts','evaluation_operation_receipts','evaluation_result_receipts'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('create policy %I on private.%I as restrictive for all to public using(false) with check(false)',t||'_deny',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before truncate on private.%I for each statement execute function private.guard_platform_ledger_truncate_v1()',t||'_truncate_guard',t);
 end loop;
end $$;
revoke all on sequence private.platform_evaluation_organization_events_sequence_seq,private.governed_evaluation_request_events_sequence_seq from public,anon,authenticated,service_role;
comment on table private.governed_evaluations is 'Immutable identity of a governed evaluation: requester, request, run, and the exact contract and snapshot bytes. Platform data inside a registered evaluation organization; never a tenant execution.';
comment on table private.evaluation_operation_receipts is 'One reserved provider operation of a governed evaluation, bound to its journaled eligibility decision. Separate from the pinned-kernel receipts of work executions.';

-- 4. The job kind. Evaluation jobs and runs belong to no work and no intake session; the tenant
-- select policies on jobs and runs therefore never match them. The execution identity constraint
-- already holds for evaluation jobs (their execution_id stays null) and is not changed.
alter table public.processing_jobs add column evaluation_id uuid;
alter table public.processing_jobs add constraint processing_jobs_evaluation_fk foreign key(organization_id,evaluation_id) references private.governed_evaluations(organization_id,id);
create unique index processing_jobs_evaluation_unique on public.processing_jobs(organization_id,evaluation_id) where evaluation_id is not null;
alter table public.processing_jobs drop constraint processing_jobs_kind_check;
alter table public.processing_jobs add constraint processing_jobs_kind_check check(kind in ('document_pipeline','preliminary_analysis','case_analysis','capital_project_analysis','agent_operation_brief','execution_brief_proposal','work_conversation','work_execution','governed_evaluation'));
alter table public.processing_jobs drop constraint job_intake_by_kind;
alter table public.processing_jobs add constraint job_intake_by_kind check(
 (kind in ('work_conversation','work_execution') and work_id is not null and intake_session_id is null and source_document_id is null and controlled_execution_id is null)
 or (kind='governed_evaluation' and work_id is null and intake_session_id is null and source_document_id is null and controlled_execution_id is null)
 or (kind not in ('work_conversation','work_execution','governed_evaluation') and intake_session_id is not null));
alter table public.processing_jobs add constraint job_evaluation_identity check((kind='governed_evaluation')=(evaluation_id is not null));
alter table public.processing_runs drop constraint run_work_or_intake;
alter table public.processing_runs add constraint run_work_or_intake check(intake_session_id is not null
 or (work_id is not null and pipeline_version in ('work-conversation-v1','pinned-work-execution-v1'))
 or (work_id is null and pipeline_version='governed-evaluation-v1'));

-- 5. No existing claim, capability consumer or authority binding may handle an evaluation.
do $patch$ declare name text;old text;body text;begin
 foreach name in array array['worker_claim_job','worker_claim_job_v2','worker_claim_job_v4'] loop
  select pg_get_functiondef(to_regprocedure('private.'||name||'(text,integer)')) into old;
  body:=replace(old,'where kind<>''work_execution'' and ((status','where kind not in (''work_execution'',''governed_evaluation'') and ((status');
  if body=old then raise exception 'evaluation_legacy_claim_contract_changed: %',name;end if;execute body;
 end loop;
 select pg_get_functiondef('private.job_for_capability(uuid,text)'::regprocedure) into old;
 body:=replace(old,'kind<>''work_execution'' and status=''leased''','kind not in (''work_execution'',''governed_evaluation'') and status=''leased''');
 if body=old then raise exception 'evaluation_legacy_capability_contract_changed';end if;execute body;
end $patch$;

-- A job of the new kind binds no tenant resource or subject: its authority is the registered
-- evaluation organization and the live evaluator of its identity row, rechecked by every command.
do $patch$ declare original text;needle text;begin
 original:=pg_get_functiondef('private.bind_job_authority_v1()'::regprocedure);
 needle:=E'begin\n root_id := private.resource_root_v1(';
 if position(needle in original)=0 or position('governed_evaluation' in original)>0 then raise exception 'evaluation_job_authority_contract_changed';end if;
 execute replace(original,needle,$body$begin
 if new.kind='governed_evaluation' then
  if new.evaluation_id is null or new.work_id is not null or new.intake_session_id is not null or not exists(
   select 1 from private.governed_evaluations e
   join private.platform_evaluation_organizations o on o.organization_id=e.organization_id
   join public.processing_runs r on r.organization_id=e.organization_id and r.id=e.processing_run_id
   where e.organization_id=new.organization_id and e.id=new.evaluation_id and e.processing_run_id=new.processing_run_id
   and r.pipeline_version='governed-evaluation-v1' and r.created_by=e.requested_by_user_id
   and private.platform_evaluator_live_v1(e.requested_by_user_id))
  then raise exception 'job_authorization_denied' using errcode='42501';end if;
  new.authorization_subject_id:=null;new.authorization_resource_id:=null;new.authorization_revision:=null;new.review_execution_authorization_id:=null;
  return new;
 end if;
 root_id := private.resource_root_v1($body$);
end $patch$;

-- 6. One provider decision for every consumer. The body below is the stage 16 decision, unchanged;
-- only the job arrives resolved. The legacy entry point still resolves it through the legacy
-- capability, which refuses evaluations; the evaluation transport resolves it through its lease.
create function private.provider_processing_decision_v1(p_job public.processing_jobs,p_route jsonb,p_resources text[],p_purpose text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=p_job;
 ids uuid[]:='{}';reasons text[]:='{}';resource text;assurance uuid;decision_id uuid;
 classification text:='restricted';retention_limit integer:=2592000;rights_deadline timestamptz;begin
 if j.id is null then raise exception 'job_capability_invalid' using errcode='42501';end if;
 -- Only route metadata reaches the audit store. Neither prompts, URLs to company documents,
 -- content, credentials nor arbitrary model-supplied fields are accepted here.
 if p_route is null or jsonb_typeof(p_route)<>'object'
 or p_route-array['provider','model','accountRef','projectRef','credentialBinding','endpoint','region']<>'{}'::jsonb
 or not (p_route ?& array['provider','model','accountRef','projectRef','credentialBinding','endpoint','region'])
 or octet_length(p_route::text)>2000 or p_resources is null or cardinality(p_resources) not between 1 and 11
 or not (p_resources <@ array['inference','inline_document','file_upload','prompt_cache','schema_cache','batch','background','external_search','external_tool','embedding','persisted_state'])
 or p_purpose is null or p_purpose not in ('public_research','document_processing','case_analysis','artifact_generation','localization','evaluation')
 then raise exception 'processing_route_invalid' using errcode='22023';end if;
 if 'external_search'=any(p_resources) then
  if p_purpose<>'public_research' or not (p_resources <@ array['external_search','inference','prompt_cache','schema_cache']) then raise exception 'processing_public_route_invalid' using errcode='22023';end if;
  classification:='public';
 end if;
 -- Current source rights and responsibility are checked again on each attempt.
 if not private.job_sources_rights_current_v1(j.id) then raise exception 'processing_source_rights_denied' using errcode='42501';end if;
 -- Include current and pinned rights throughout the same dependency closure used by authorization.
 with recursive dependencies(id) as (
 select d.id from public.source_documents d where d.organization_id=j.organization_id
 and ((j.source_document_id is not null and d.id=j.source_document_id)
 or (j.source_document_id is null and d.intake_session_id=j.intake_session_id))
 union select d.source_version_id from dependencies g join private.resource_dependencies d
 on d.organization_id=j.organization_id and d.derived_version_id=g.id
 ), obligations as (
 select r.expires_at,r.store_until from dependencies g join lateral(select x.* from private.source_rights_versions x
 where x.organization_id=j.organization_id and x.source_version_id=g.id order by x.revision desc limit 1) r on true
 union all
 select r.expires_at,r.store_until from dependencies g join private.resource_dependencies d
 on d.organization_id=j.organization_id and d.derived_version_id=g.id
 join private.source_rights_versions r on r.organization_id=d.organization_id and r.id=d.source_rights_version_id
 ) select min(least(expires_at,store_until)) into rights_deadline from obligations;
 if rights_deadline is not null and classification<>'public' then retention_limit:=greatest(0,least(retention_limit,floor(extract(epoch from rights_deadline-clock_timestamp()))));end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('provider-processing-assurances',0));
 foreach resource in array p_resources loop
  assurance:=private.provider_resource_allowed_v1(p_route,resource,p_purpose,classification,retention_limit);
  if assurance is null then reasons:=array_append(reasons,'processing_resource_ineligible:'||resource);
  else ids:=array_append(ids,assurance);end if;
 end loop;
 insert into private.processing_eligibility_decisions(organization_id,job_id,route,resources,purpose,classification,allowed,assurance_ids,reasons,policy_version)
 values(j.organization_id,j.id,p_route,p_resources,p_purpose,classification,cardinality(reasons)=0,ids,reasons,'offroad-provider-retention-v2') returning id into decision_id;
 return jsonb_build_object('allowed',cardinality(reasons)=0,'policyVersion','offroad-provider-retention-v2','assuranceId',case when cardinality(ids)=1 then ids[1] else null end,'assuranceIds',ids,'decisionId',decision_id,'classification',classification,'reasons',to_jsonb(reasons));
end $$;
create or replace function private.worker_authorize_provider_processing_v1(p_job_id uuid,p_capability_token text,p_route jsonb,p_resources text[],p_purpose text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 return private.provider_processing_decision_v1(private.job_for_capability(p_job_id,p_capability_token),p_route,p_resources,p_purpose);
end $$;

-- 7. The transport switch: a capability release row, installed closed. It names no method and has no
-- platform_method_releases row, so the method release command can pause it and never open it; only
-- the transport command below opens it. Every write is ledgered by the existing release ledger.
insert into private.platform_capability_releases(capability_key,released,exposure,method_id,method_version,method_maturity,approved_by,approved_at,approval_source,note)
values('governed-evaluation-transport',false,'internal','governed-evaluation-transport','2026.09.24-v1','tested',
 'Stage 17 executor under the standing execution authority',date '2026-09-23',
 'docs/build/arcabouco-stage0/FOUNDER-ACTS.md, founder instruction of 2026-09-23 (stage 17, increment 5)',
 'Evaluation transport switch, not a method release. Installed closed; opened only by release_governed_evaluation_transport_v1.');

-- Shared row lock: an operator's pause waits for in-flight claims and sends, and every later claim
-- or send reads the committed switch.
create function private.governed_evaluation_transport_released_v1() returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare released boolean;begin
 select c.released into released from private.platform_capability_releases c where c.capability_key='governed-evaluation-transport' for share;
 return coalesce(released,false);
end $$;

create function private.release_governed_evaluation_transport_v1(p_command uuid,p_released boolean,p_actor_user_id uuid,p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
declare prior private.platform_capability_release_events;begin
 perform private.require_platform_principal_v1(p_actor_user_id);
 if p_command is null or p_released is null or p_reason is null or length(btrim(p_reason)) not between 10 and 2000
 then raise exception 'platform_capability_release_invalid' using errcode='22023';end if;
 perform 1 from private.platform_capability_releases where capability_key='governed-evaluation-transport' for update;
 if not found then raise exception 'platform_capability_release_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.platform_capability_release_events where command_id=p_command order by sequence desc limit 1;
 if found then
  if prior.capability_key<>'governed-evaluation-transport' or prior.released is distinct from p_released or prior.actor_user_id is distinct from p_actor_user_id or prior.reason is distinct from btrim(p_reason)
  then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return;
 end if;
 perform set_config('offroad.actor_user_id',p_actor_user_id::text,true);
 perform set_config('offroad.command_id',p_command::text,true);
 perform set_config('offroad.command_reason',btrim(p_reason),true);
 update private.platform_capability_releases set released=p_released,updated_at=now() where capability_key='governed-evaluation-transport';
 perform set_config('offroad.actor_user_id','',true);perform set_config('offroad.command_id','',true);perform set_config('offroad.command_reason','',true);
end $$;

-- 8. Evaluation authority. Order mirrors the execution consumer: account, credential, transport,
-- evaluator, job. The requesting evaluator must still hold the role for any step to proceed.
create function private.lock_governed_evaluation_v1(p_job_id uuid,p_require_transport boolean) returns public.processing_jobs
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;e private.governed_evaluations;begin
 select * into j from public.processing_jobs where id=p_job_id and kind='governed_evaluation';
 if not found then raise exception 'evaluation_authority_denied' using errcode='42501';end if;
 select * into e from private.governed_evaluations where organization_id=j.organization_id and id=j.evaluation_id;
 if not found or not exists(select 1 from private.platform_evaluation_organizations o where o.organization_id=e.organization_id)
 then raise exception 'evaluation_authority_denied' using errcode='42501';end if;
 if p_require_transport and not private.governed_evaluation_transport_released_v1() then raise exception 'evaluation_transport_paused' using errcode='42501';end if;
 perform 1 from private.platform_principals p join auth.users u on u.id=p.user_id
  where p.user_id=e.requested_by_user_id and p.role='evaluator' and p.revoked_at is null
  and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()) for share of p;
 if not found then raise exception 'evaluation_authority_denied' using errcode='42501';end if;
 select * into strict j from public.processing_jobs where id=p_job_id for update;
 if j.evaluation_id is distinct from e.id or j.processing_run_id is distinct from e.processing_run_id then raise exception 'evaluation_authority_denied' using errcode='42501';end if;
 return j;
end $$;

create function private.evaluation_for_lease_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid,p_require_transport boolean,p_allow_completed boolean default false)
returns public.processing_jobs language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;begin
 perform 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'evaluation_lease_denied' using errcode='42501';end if;
 select * into j from public.processing_jobs where id=p_job_id and kind='governed_evaluation';
 perform 1 from private.worker_tokens where id=j.leased_by and execution_account_user_id=auth.uid() and status='active' and revoked_at is null for share;
 if not found then raise exception 'evaluation_lease_denied' using errcode='42501';end if;
 j:=private.lock_governed_evaluation_v1(p_job_id,p_require_transport);
 if p_lease_id is null or p_capability_token is null or length(p_capability_token)<32
 or j.lease_id is distinct from p_lease_id or j.capability_sha256 is distinct from extensions.digest(p_capability_token,'sha256')
 or j.leased_account_user_id is distinct from auth.uid()
 or not (j.status='leased' or (p_allow_completed and j.status='succeeded'))
 or j.lease_expires_at is null or j.lease_expires_at<=clock_timestamp()
 then raise exception 'evaluation_lease_denied' using errcode='42501';end if;
 return j;
end $$;

create function private.account_evaluation_duration_v1(p_job public.processing_jobs) returns private.evaluation_budget_accounts
language plpgsql security definer set search_path='' as $$
declare b private.evaluation_budget_accounts;t timestamptz:=clock_timestamp();until_at timestamptz;delta bigint;begin
 select * into strict b from private.evaluation_budget_accounts where organization_id=p_job.organization_id and evaluation_id=p_job.evaluation_id for update;
 -- Every leased interval is charged at most once; queue wait after lease expiry is excluded.
 if b.accounted_at is not null and b.lease_id=p_job.lease_id then
  until_at:=least(t,p_job.lease_expires_at);
  delta:=greatest(0,floor(extract(epoch from (until_at-b.accounted_at))*1000)::bigint);
  update private.evaluation_budget_accounts set active_duration_ms=active_duration_ms+delta,
   accounted_at=b.accounted_at+delta*interval '1 millisecond' where evaluation_id=b.evaluation_id returning * into b;
 end if;
 return b;
end $$;

-- Technical terminalization: it never produces a result, releases a reservation or revives authority.
create function private.close_exhausted_evaluations_v1() returns void
language plpgsql security definer set search_path='' as $$
declare c record;j public.processing_jobs;b private.evaluation_budget_accounts;begin
 for c in select id from public.processing_jobs
 where kind='governed_evaluation' and attempts>=max_attempts
 and (status='queued' or (status='leased' and lease_expires_at<=clock_timestamp())) order by available_at,id limit 16
 loop
  select * into j from public.processing_jobs where id=c.id for update skip locked;
  if not found then continue;end if;
  if j.attempts<j.max_attempts or not(j.status='queued' or (j.status='leased' and j.lease_expires_at<=clock_timestamp())) then continue;end if;
  b:=private.account_evaluation_duration_v1(j);
  update private.evaluation_operation_receipts set state='uncertain' where organization_id=j.organization_id and evaluation_id=j.evaluation_id and state='reserved';
  update public.processing_jobs set status='failed',capability_sha256=null,lease_expires_at=null,
   last_error=jsonb_build_object('code','evaluation_attempts_exhausted','retryable',false) where id=j.id;
  update public.processing_runs set status='failed',completed_at=clock_timestamp(),error=jsonb_build_object('code','evaluation_attempts_exhausted'),
   usage=jsonb_build_object('costMicrousd',b.spent_microusd,'modelCalls',b.spent_calls,'activeDurationMs',b.active_duration_ms)
   where id=j.processing_run_id and organization_id=j.organization_id;
  update private.evaluation_budget_accounts set accounted_at=null where evaluation_id=b.evaluation_id;
 end loop;
end $$;

-- 9. Request: operator surface, evaluator identity, no public wrapper and no API grant. The contract
-- is refused unless it is exactly an evaluation contract; sources are content hashes only.
create function private.request_governed_evaluation_v1(p_contract_text text,p_snapshot_text text,p_actor_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb;v_org uuid;v_execution uuid;v_run uuid;v_request uuid;v_requested timestamptz;v_expires timestamptz;
 v_job uuid:=gen_random_uuid();next_no integer;existing private.governed_evaluations;digest text;input_hash text;
 uuid_pattern constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';begin
 perform private.require_platform_evaluator_v1(p_actor_user_id);
 if p_contract_text is null or octet_length(p_contract_text) not between 1 and 1048576
 or p_snapshot_text is null or octet_length(p_snapshot_text) not between 1 and 8388608
 then raise exception 'evaluation_contract_denied' using errcode='42501';end if;
 begin
  c:=private.execution_json_projection_v1(p_contract_text);
  if jsonb_typeof(c)<>'object' or jsonb_typeof(c->'organizationId') is distinct from 'string' or c->>'organizationId' !~ uuid_pattern
  then raise exception 'evaluation_contract_denied' using errcode='42501';end if;
  v_org:=(c->>'organizationId')::uuid;
 exception when data_exception then raise exception 'evaluation_contract_denied' using errcode='42501';
 end;
 if not exists(select 1 from private.platform_evaluation_organizations where organization_id=v_org)
 then raise exception 'evaluation_organization_required' using errcode='42501';end if;
 begin
  if c-array['schemaVersion','executionId','organizationId','requestId','processingRunId','purpose','audience','tools','budget','inputs','requestedAt']<>'{}'::jsonb
  or not (c ?& array['schemaVersion','executionId','organizationId','requestId','processingRunId','purpose','audience','tools','budget','inputs','requestedAt'])
  or c->'schemaVersion' is distinct from '"governed-evaluation-contract.v1"'::jsonb
  or c->'purpose' is distinct from '"evaluation"'::jsonb
  or exists(select 1 from unnest(array['executionId','requestId','processingRunId']) f where jsonb_typeof(c->f) is distinct from 'string' or c->>f !~ uuid_pattern)
  -- Audience: the evaluation panel of one case version and one script.
  or jsonb_typeof(c->'audience') is distinct from 'object'
  or (c->'audience')-array['kind','caseId','caseVersion','scriptId']<>'{}'::jsonb
  or c#>'{audience,kind}' is distinct from '"evaluation_panel"'::jsonb
  or exists(select 1 from unnest(array['caseId','caseVersion','scriptId']) f
   where jsonb_typeof(c->'audience'->f) is distinct from 'string' or char_length(btrim(c->'audience'->>f)) not between 1 and 200)
  -- Tools: provider routes only, read-only, each named once.
  or jsonb_typeof(c->'tools') is distinct from 'array' or jsonb_array_length(c->'tools') not between 1 and 32
  or exists(select 1 from jsonb_array_elements(c->'tools') t
   where jsonb_typeof(t) is distinct from 'object' or t-array['id','version','effect']<>'{}'::jsonb
   or jsonb_typeof(t->'id') is distinct from 'string' or t->>'id' !~ '^provider:(openai|anthropic|perplexity|firecrawl):[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'
   or jsonb_typeof(t->'version') is distinct from 'string' or char_length(t->>'version') not between 1 and 120
   or t->'effect' is distinct from '"read_only"'::jsonb)
  or (select count(distinct t->>'id') from jsonb_array_elements(c->'tools') t)<>jsonb_array_length(c->'tools')
  -- Budget: integer microdollars and calls, at least one call and one second, and an expiry.
  or jsonb_typeof(c->'budget') is distinct from 'object'
  or (c->'budget')-array['maxCostMicrousd','maxModelCalls','maxDurationMs','expiresAt']<>'{}'::jsonb
  or exists(select 1 from unnest(array['maxCostMicrousd','maxModelCalls','maxDurationMs']) f
   where jsonb_typeof(c->'budget'->f) is distinct from 'number' or c->'budget'->>f !~ '^[0-9]{1,16}$' or (c->'budget'->>f)::bigint>9007199254740991)
  or (c#>>'{budget,maxModelCalls}')::bigint<1 or (c#>>'{budget,maxDurationMs}')::bigint<1000
  or jsonb_typeof(c#>'{budget,expiresAt}') is distinct from 'string' or jsonb_typeof(c->'requestedAt') is distinct from 'string'
  -- Inputs: the snapshot fingerprint and sources as sha256 content hashes, with no text and no URL.
  or jsonb_typeof(c->'inputs') is distinct from 'object'
  or (c->'inputs')-array['fingerprint','sources']<>'{}'::jsonb
  or jsonb_typeof(c#>'{inputs,fingerprint}') is distinct from 'string'
  or jsonb_typeof(c#>'{inputs,sources}') is distinct from 'array' or jsonb_array_length(c#>'{inputs,sources}')>10000
  or exists(select 1 from jsonb_array_elements(c#>'{inputs,sources}') s
   where jsonb_typeof(s) is distinct from 'object' or s-'contentHash'<>'{}'::jsonb
   or jsonb_typeof(s->'contentHash') is distinct from 'string' or s->>'contentHash' !~ '^[a-f0-9]{64}$')
  or (select count(distinct s->>'contentHash') from jsonb_array_elements(c#>'{inputs,sources}') s)<>jsonb_array_length(c#>'{inputs,sources}')
  then raise exception 'evaluation_contract_denied' using errcode='42501';end if;
  v_execution:=(c->>'executionId')::uuid;v_request:=(c->>'requestId')::uuid;v_run:=(c->>'processingRunId')::uuid;
  v_requested:=(c->>'requestedAt')::timestamptz;v_expires:=(c#>>'{budget,expiresAt}')::timestamptz;
  perform private.execution_json_projection_v1(p_snapshot_text);
  input_hash:=encode(extensions.digest(convert_to(p_snapshot_text,'UTF8'),'sha256'),'hex');
  if c#>>'{inputs,fingerprint}' is distinct from input_hash then raise exception 'evaluation_contract_denied' using errcode='42501';end if;
 exception when data_exception then raise exception 'evaluation_contract_denied' using errcode='42501';
 end;
 digest:=encode(extensions.digest(convert_to(p_contract_text,'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('governed-evaluation-request:'||v_org::text||':'||p_actor_user_id::text||':'||v_request::text,0));
 select * into existing from private.governed_evaluations where organization_id=v_org and requested_by_user_id=p_actor_user_id and request_id=v_request;
 if found then
  -- The same request id already produced an evaluation of this evaluator: replay it, or name it.
  if existing.contract_fingerprint<>digest or existing.snapshot_fingerprint<>input_hash
  then raise exception 'execution_request_conflict' using errcode='23505',detail=existing.id::text;end if;
  return jsonb_build_object('executionId',existing.id,'processingRunId',existing.processing_run_id,'requestId',existing.request_id,
   'jobId',(select id from public.processing_jobs where organization_id=existing.organization_id and evaluation_id=existing.id),'replayed',true);
 end if;
 if exists(select 1 from private.governed_evaluations where id=v_execution or processing_run_id=v_run) or exists(select 1 from public.processing_runs where id=v_run)
 then raise exception 'execution_request_conflict' using errcode='23505',detail=coalesce((select id::text from private.governed_evaluations where id=v_execution or processing_run_id=v_run limit 1),'');end if;
 if v_expires<=clock_timestamp() or v_expires<=v_requested or v_requested>clock_timestamp()
 then raise exception 'evaluation_contract_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('governed-evaluation-runs:'||v_org::text,0));
 select coalesce(max(run_no),0)+1 into next_no from public.processing_runs
  where organization_id=v_org and intake_session_id is null and work_id is null and pipeline_version='governed-evaluation-v1';
 insert into public.processing_runs(id,organization_id,run_no,trigger,pipeline_version,budget,created_by)
 values(v_run,v_org,next_no,'manual','governed-evaluation-v1',c->'budget',p_actor_user_id);
 insert into private.governed_evaluations(id,organization_id,requested_by_user_id,request_id,processing_run_id,serialization_version,contract_text,contract_fingerprint,snapshot_text,snapshot_fingerprint)
 values(v_execution,v_org,p_actor_user_id,v_request,v_run,'offroad-execution-json-utf16-v1',p_contract_text,digest,p_snapshot_text,input_hash);
 insert into private.evaluation_budget_accounts(evaluation_id,organization_id) values(v_execution,v_org);
 insert into public.processing_jobs(id,organization_id,processing_run_id,kind,evaluation_id,payload)
 values(v_job,v_org,v_run,'governed_evaluation',v_execution,jsonb_build_object('executionId',v_execution));
 insert into private.governed_evaluation_request_events(organization_id,evaluation_id,request_id,actor_user_id,contract_fingerprint,snapshot_fingerprint)
 values(v_org,v_execution,v_request,p_actor_user_id,digest,input_hash);
 return jsonb_build_object('executionId',v_execution,'processingRunId',v_run,'requestId',v_request,'jobId',v_job,'replayed',false);
end $$;

-- 10. Worker commands. Claim, renew, reserve, settle and commit mirror the pinned execution consumer;
-- the claim is additionally closed while the transport switch is off.
create function private.claim_governed_evaluation_v1(p_worker_token text,p_job_id uuid,p_lease_seconds integer default 60) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;worker uuid;cap text;lease uuid:=gen_random_uuid();e private.governed_evaluations;b private.evaluation_budget_accounts;t timestamptz;begin
 perform 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'worker_account_required' using errcode='42501';end if;
 worker:=private.worker_identity(p_worker_token);
 if not exists(select 1 from private.worker_tokens where id=worker and revoked_at is null and execution_account_user_id=auth.uid()) then raise exception 'worker_token_invalid' using errcode='42501';end if;
 j:=private.lock_governed_evaluation_v1(p_job_id,true);
 t:=clock_timestamp();
 if not ((j.status='queued' and j.available_at<=t) or (j.status='leased' and j.lease_expires_at<=t)) then return jsonb_build_object('claimed',false);end if;
 b:=private.account_evaluation_duration_v1(j);
 select * into strict e from private.governed_evaluations where organization_id=j.organization_id and id=j.evaluation_id;
 if j.attempts>=j.max_attempts then raise exception 'evaluation_attempts_exhausted' using errcode='55000';end if;
 -- A send whose worker disappeared may have been charged: it is never released as unspent.
 update private.evaluation_operation_receipts set state='uncertain' where organization_id=j.organization_id and evaluation_id=j.evaluation_id and state='reserved';
 cap:=encode(extensions.gen_random_bytes(32),'hex');
 update public.processing_jobs set status='leased',attempts=attempts+1,leased_by=worker,leased_account_user_id=auth.uid(),
 lease_id=lease,lease_expires_at=t+make_interval(secs=>least(greatest(coalesce(p_lease_seconds,60),1),3600)),capability_sha256=extensions.digest(cap,'sha256')
 where id=j.id returning * into j;
 update private.evaluation_budget_accounts set lease_id=lease,accounted_at=t where evaluation_id=b.evaluation_id;
 update public.processing_runs set status='running',started_at=coalesce(started_at,t) where organization_id=j.organization_id and id=j.processing_run_id;
 return jsonb_build_object('claimed',true,'jobId',j.id,'leaseId',lease,'capability',cap,'attempt',j.attempts,
 'executionId',e.id,'contractText',e.contract_text,'contractFingerprint',e.contract_fingerprint,'snapshotText',e.snapshot_text,
 'elapsedDurationMs',b.active_duration_ms,'leaseExpiresAt',j.lease_expires_at,
 'budgetExpired',b.exhausted_at is not null or (e.contract#>>'{budget,expiresAt}')::timestamptz<=clock_timestamp() or b.active_duration_ms>=(e.contract#>>'{budget,maxDurationMs}')::bigint);
end $$;

create function private.worker_claim_evaluation_v1(p_worker_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare worker uuid;c record;r jsonb;previous_timeout text:=current_setting('lock_timeout');begin
 perform 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'worker_account_binding_required' using errcode='42501';end if;
 worker:=private.worker_identity(p_worker_token);
 if not exists(select 1 from private.worker_tokens t join auth.users u on u.id=t.execution_account_user_id
 where t.id=worker and t.execution_account_user_id=auth.uid() and t.status='active' and t.revoked_at is null
 and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()))
 then raise exception 'worker_account_binding_required' using errcode='42501';end if;
 -- Paused in the database, without a deploy: nothing is claimed while the switch is off.
 if not exists(select 1 from private.platform_capability_releases where capability_key='governed-evaluation-transport' and released)
 then return jsonb_build_object('claimed',false);end if;
 perform private.close_exhausted_evaluations_v1();
 -- Candidate discovery holds no job-row lock. Claim preserves transport/evaluator/job order.
 for c in select j.id from public.processing_jobs j
 join private.governed_evaluations e on e.organization_id=j.organization_id and e.id=j.evaluation_id
 where j.kind='governed_evaluation' and j.attempts<j.max_attempts
 and ((j.status='queued' and j.available_at<=clock_timestamp()) or (j.status='leased' and j.lease_expires_at<=clock_timestamp()))
 and private.platform_evaluator_live_v1(e.requested_by_user_id)
 order by j.available_at,j.created_at,j.id limit 16
 loop
  begin
   perform set_config('lock_timeout','100ms',true);
   r:=private.claim_governed_evaluation_v1(p_worker_token,c.id,60);
   perform set_config('lock_timeout',previous_timeout,true);
   if (r->>'claimed')::boolean then return r;end if;
  exception when lock_not_available or insufficient_privilege then
   perform set_config('lock_timeout',previous_timeout,true);
  end;
 end loop;
 return jsonb_build_object('claimed',false);
end $$;

-- A pause stops claims and sends; renewal, settlement and commit still let work already paid for land.
create function private.worker_renew_evaluation_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;e private.governed_evaluations;b private.evaluation_budget_accounts;t timestamptz;remaining bigint;begin
 j:=private.evaluation_for_lease_v1(p_job_id,p_capability_token,p_lease_id,false);
 b:=private.account_evaluation_duration_v1(j);
 select * into strict e from private.governed_evaluations where organization_id=j.organization_id and id=j.evaluation_id;
 t:=clock_timestamp();
 if j.lease_expires_at<=t then raise exception 'evaluation_lease_denied' using errcode='42501';end if;
 update public.processing_jobs set lease_expires_at=t+interval '60 seconds' where id=j.id returning * into j;
 remaining:=greatest(0,least((e.contract#>>'{budget,maxDurationMs}')::bigint-b.active_duration_ms,
 floor(extract(epoch from ((e.contract#>>'{budget,expiresAt}')::timestamptz-t))*1000)::bigint));
 return jsonb_build_object('allowed',true,'jobId',j.id,'leaseId',j.lease_id,'executionId',e.id,'organizationId',j.organization_id,
 'processingRunId',j.processing_run_id,'contractFingerprint',e.contract_fingerprint,'leaseExpiresAt',j.lease_expires_at,
 'elapsedDurationMs',b.active_duration_ms,'remainingDurationMs',remaining);
end $$;

-- Every send, repair and fallback is its own operation: a declared route at its declared version, the
-- remaining budget, and the provider decision with purpose evaluation, journaled before anything moves.
create function private.worker_reserve_evaluation_operation_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid,p_operation_id uuid,p_route jsonb,p_resources jsonb,p_reserved_microusd bigint,p_reserved_calls integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;e private.governed_evaluations;b private.evaluation_budget_accounts;r private.evaluation_operation_receipts;
 v_route jsonb;v_tool text;v_version text;v_resources text[];d jsonb;begin
 j:=private.evaluation_for_lease_v1(p_job_id,p_capability_token,p_lease_id,true);
 b:=private.account_evaluation_duration_v1(j);
 select * into strict e from private.governed_evaluations where organization_id=j.organization_id and id=j.evaluation_id;
 if p_operation_id is null or p_route is null or jsonb_typeof(p_route)<>'object'
 or jsonb_typeof(p_route->'provider') is distinct from 'string' or jsonb_typeof(p_route->'model') is distinct from 'string' or jsonb_typeof(p_route->'toolVersion') is distinct from 'string'
 or p_resources is null or jsonb_typeof(p_resources)<>'array' or jsonb_array_length(p_resources) not between 1 and 11
 or exists(select 1 from jsonb_array_elements(p_resources) x where jsonb_typeof(x)<>'string')
 or p_reserved_microusd is null or p_reserved_microusd not between 0 and 9007199254740991 or p_reserved_calls is null or p_reserved_calls<1
 then raise exception 'evaluation_operation_invalid' using errcode='22023';end if;
 v_route:=p_route-'toolVersion';
 v_tool:='provider:'||(p_route->>'provider')||':'||(p_route->>'model');
 v_version:=p_route->>'toolVersion';
 select array_agg(x.value order by x.ordinality) into v_resources from jsonb_array_elements_text(p_resources) with ordinality x(value,ordinality);
 -- Only a tool the contract declared, at its declared version, may transmit anything.
 if not exists(select 1 from jsonb_array_elements(e.contract->'tools') t where t->>'id'=v_tool and t->>'version'=v_version and t->>'effect'='read_only')
 then raise exception 'execution_operation_denied' using errcode='42501';end if;
 select * into r from private.evaluation_operation_receipts where organization_id=j.organization_id and evaluation_id=j.evaluation_id and operation_id=p_operation_id for update;
 if found then
  if r.tool_id<>v_tool or r.tool_version<>v_version or r.route<>v_route or r.resources<>v_resources or r.reserved_microusd<>p_reserved_microusd or r.reserved_calls<>p_reserved_calls
  then raise exception 'evaluation_operation_conflict' using errcode='23505';end if;
  -- A replay never authorizes a second transmission.
  return jsonb_build_object('allowed',true,'operationId',r.operation_id,'decisionId',r.decision_id,'state',r.state,'replayed',true,'mayExecute',false);
 end if;
 if b.active_duration_ms>=(e.contract#>>'{budget,maxDurationMs}')::bigint or clock_timestamp()>=(e.contract#>>'{budget,expiresAt}')::timestamptz
 or b.spent_microusd+b.reserved_microusd>(e.contract#>>'{budget,maxCostMicrousd}')::bigint-p_reserved_microusd
 or b.spent_calls+b.reserved_calls>(e.contract#>>'{budget,maxModelCalls}')::bigint-p_reserved_calls
 then
  update private.evaluation_budget_accounts set exhausted_at=coalesce(exhausted_at,clock_timestamp()) where evaluation_id=b.evaluation_id;
  return jsonb_build_object('allowed',false,'state','partial_budget_exhausted','mayExecute',false);
 end if;
 d:=private.provider_processing_decision_v1(j,v_route,v_resources,'evaluation');
 if not (d->>'allowed')::boolean then
  return jsonb_build_object('allowed',false,'decisionId',d->>'decisionId','reasons',d->'reasons','mayExecute',false);
 end if;
 insert into private.evaluation_operation_receipts(organization_id,evaluation_id,operation_id,lease_id,tool_id,tool_version,route,resources,decision_id,reserved_microusd,reserved_calls,state)
 values(j.organization_id,j.evaluation_id,p_operation_id,p_lease_id,v_tool,v_version,v_route,v_resources,(d->>'decisionId')::uuid,p_reserved_microusd,p_reserved_calls,'reserved');
 update private.evaluation_budget_accounts set reserved_microusd=reserved_microusd+p_reserved_microusd,reserved_calls=reserved_calls+p_reserved_calls where evaluation_id=b.evaluation_id;
 return jsonb_build_object('allowed',true,'operationId',p_operation_id,'decisionId',d->>'decisionId','state','reserved','replayed',false,'mayExecute',true);
end $$;

-- Settled: the provider reported usage within the reservation. Uncertain: usage is unknown, and the
-- whole reservation stays charged against the budget.
create function private.worker_settle_evaluation_operation_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid,p_operation_id uuid,p_outcome text,p_spent_microusd bigint,p_spent_calls integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;b private.evaluation_budget_accounts;r private.evaluation_operation_receipts;begin
 j:=private.evaluation_for_lease_v1(p_job_id,p_capability_token,p_lease_id,false);
 b:=private.account_evaluation_duration_v1(j);
 if p_operation_id is null or p_outcome is null or p_outcome not in ('settled','uncertain')
 or (p_outcome='settled' and (p_spent_microusd is null or p_spent_calls is null))
 or (p_outcome='uncertain' and (p_spent_microusd is not null or p_spent_calls is not null))
 then raise exception 'evaluation_settlement_invalid' using errcode='22023';end if;
 select * into r from private.evaluation_operation_receipts where organization_id=j.organization_id and evaluation_id=j.evaluation_id and operation_id=p_operation_id for update;
 if not found or r.lease_id is distinct from p_lease_id then raise exception 'evaluation_operation_lease_denied' using errcode='42501';end if;
 if p_outcome='settled' and (p_spent_microusd not between 0 and r.reserved_microusd or p_spent_calls not between 0 and r.reserved_calls)
 then raise exception 'evaluation_settlement_invalid' using errcode='22023';end if;
 if r.state<>'reserved' then
  if r.state=p_outcome and r.spent_microusd is not distinct from p_spent_microusd and r.spent_calls is not distinct from p_spent_calls::bigint
  then return jsonb_build_object('settled',true,'state',r.state,'replayed',true);end if;
  raise exception 'evaluation_settlement_conflict' using errcode='23505';
 end if;
 if p_outcome='settled' then
  update private.evaluation_operation_receipts set state='settled',spent_microusd=p_spent_microusd,spent_calls=p_spent_calls where id=r.id;
  update private.evaluation_budget_accounts set reserved_microusd=reserved_microusd-r.reserved_microusd,reserved_calls=reserved_calls-r.reserved_calls,
   spent_microusd=spent_microusd+p_spent_microusd,spent_calls=spent_calls+p_spent_calls where evaluation_id=b.evaluation_id;
 else
  update private.evaluation_operation_receipts set state='uncertain' where id=r.id;
 end if;
 return jsonb_build_object('settled',true,'state',p_outcome,'replayed',false);
end $$;

-- Success only when every receipt is settled, no send was denied and the budget held; otherwise the
-- one partial reason the database derives. Every route used is authorized again at publication.
create function private.worker_commit_evaluation_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid,p_contract_hash text,p_input_hash text,p_result_text text,p_outcome text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;e private.governed_evaluations;b private.evaluation_budget_accounts;r private.evaluation_result_receipts;
 used record;result_hash text;required text;begin
 j:=private.evaluation_for_lease_v1(p_job_id,p_capability_token,p_lease_id,false,true);
 select * into strict e from private.governed_evaluations where organization_id=j.organization_id and id=j.evaluation_id;
 if e.contract_fingerprint is distinct from p_contract_hash or e.snapshot_fingerprint is distinct from p_input_hash then raise exception 'evaluation_result_input_mismatch' using errcode='42501';end if;
 if p_result_text is null or octet_length(p_result_text) not between 1 and 8388608
 or p_outcome is null or p_outcome not in ('succeeded','partial')
 or p_reason is null or p_reason not in ('evaluated','budget_exhausted','operation_uncertain','transport_denied','evaluation_failed')
 or (p_outcome='succeeded')<>(p_reason='evaluated')
 then raise exception 'evaluation_result_invalid' using errcode='22023';end if;
 perform private.execution_json_projection_v1(p_result_text);
 result_hash:=encode(extensions.digest(convert_to(p_result_text,'UTF8'),'sha256'),'hex');
 select * into r from private.evaluation_result_receipts where organization_id=j.organization_id and evaluation_id=j.evaluation_id;
 if found then
  if r.lease_id<>p_lease_id or r.result_fingerprint<>result_hash or r.outcome<>p_outcome or r.reason<>p_reason then raise exception 'execution_result_conflict' using errcode='23505';end if;
  return jsonb_build_object('committed',true,'replayed',true,'outcome',r.outcome,'reason',r.reason);
 end if;
 if j.status<>'leased' then raise exception 'evaluation_lease_denied' using errcode='42501';end if;
 b:=private.account_evaluation_duration_v1(j);
 -- Publication is the last boundary of every send: each route this evaluation used is authorized
 -- again with purpose evaluation and journaled, so a revoked or lapsed assurance denies here.
 for used in select distinct x.route,x.resources from private.evaluation_operation_receipts x
 where x.organization_id=j.organization_id and x.evaluation_id=j.evaluation_id loop
  perform private.provider_processing_decision_v1(j,used.route,used.resources,'evaluation');
 end loop;
 required:=case
  when exists(select 1 from private.processing_eligibility_decisions d where d.organization_id=j.organization_id and d.job_id=j.id and not d.allowed) then 'transport_denied'
  when b.exhausted_at is not null or clock_timestamp()>=(e.contract#>>'{budget,expiresAt}')::timestamptz or b.active_duration_ms>=(e.contract#>>'{budget,maxDurationMs}')::bigint then 'budget_exhausted'
  when exists(select 1 from private.evaluation_operation_receipts x where x.organization_id=j.organization_id and x.evaluation_id=j.evaluation_id and x.state<>'settled') then 'operation_uncertain'
 end;
 if (required is not null and (p_outcome<>'partial' or p_reason<>required))
 or (required is null and p_outcome='partial' and p_reason<>'evaluation_failed')
 then raise exception 'evaluation_partial_result_required' using errcode='55000';end if;
 if p_outcome='succeeded' and not exists(select 1 from private.evaluation_operation_receipts x where x.organization_id=j.organization_id and x.evaluation_id=j.evaluation_id and x.state='settled')
 then raise exception 'evaluation_receipt_required' using errcode='55000';end if;
 -- Recheck the lease clock after every lock wait, immediately before publication.
 if j.lease_expires_at<=clock_timestamp() then raise exception 'evaluation_lease_denied' using errcode='42501';end if;
 insert into private.evaluation_result_receipts(organization_id,evaluation_id,lease_id,contract_fingerprint,input_fingerprint,result_fingerprint,canonical_result,outcome,reason)
 values(j.organization_id,j.evaluation_id,p_lease_id,p_contract_hash,p_input_hash,result_hash,p_result_text,p_outcome,p_reason);
 update public.processing_jobs set status='succeeded',result=jsonb_build_object('executionId',j.evaluation_id,'outcome',p_outcome,'reason',p_reason,'resultFingerprint',result_hash) where id=j.id;
 update public.processing_runs set status=p_outcome,completed_at=clock_timestamp(),usage=jsonb_build_object('costMicrousd',b.spent_microusd,'modelCalls',b.spent_calls,'activeDurationMs',b.active_duration_ms)
 where organization_id=j.organization_id and id=j.processing_run_id;
 update private.evaluation_budget_accounts set accounted_at=null where evaluation_id=b.evaluation_id;
 return jsonb_build_object('committed',true,'replayed',false,'outcome',p_outcome,'reason',p_reason);
end $$;

create function public.worker_claim_evaluation_v1(p_worker_token text) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_claim_evaluation_v1(p_worker_token);$$;
create function public.worker_renew_evaluation_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_renew_evaluation_v1(p_job_id,p_capability_token,p_lease_id);$$;
create function public.worker_reserve_evaluation_operation_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid,p_operation_id uuid,p_route jsonb,p_resources jsonb,p_reserved_microusd bigint,p_reserved_calls integer) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_reserve_evaluation_operation_v1(p_job_id,p_capability_token,p_lease_id,p_operation_id,p_route,p_resources,p_reserved_microusd,p_reserved_calls);$$;
create function public.worker_settle_evaluation_operation_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid,p_operation_id uuid,p_outcome text,p_spent_microusd bigint,p_spent_calls integer) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_settle_evaluation_operation_v1(p_job_id,p_capability_token,p_lease_id,p_operation_id,p_outcome,p_spent_microusd,p_spent_calls);$$;
create function public.worker_commit_evaluation_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid,p_contract_hash text,p_input_hash text,p_result_text text,p_outcome text,p_reason text) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_commit_evaluation_v1(p_job_id,p_capability_token,p_lease_id,p_contract_hash,p_input_hash,p_result_text,p_outcome,p_reason);$$;

-- 11. Read: evaluator only, operator surface, no public wrapper. Tenant readers never reach these rows:
-- read_work_execution_v1 and list_work_executions_v1 read work executions alone.
create function private.read_governed_evaluation_v1(p_execution_id uuid,p_actor_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e private.governed_evaluations;j public.processing_jobs;run public.processing_runs;b private.evaluation_budget_accounts;r private.evaluation_result_receipts;
 receipts jsonb;decisions jsonb;begin
 perform private.require_platform_evaluator_v1(p_actor_user_id);
 select * into e from private.governed_evaluations where id=p_execution_id;
 if not found then raise exception 'evaluation_access_denied' using errcode='42501';end if;
 select * into j from public.processing_jobs where organization_id=e.organization_id and evaluation_id=e.id;
 select * into run from public.processing_runs where organization_id=e.organization_id and id=e.processing_run_id;
 select * into strict b from private.evaluation_budget_accounts where organization_id=e.organization_id and evaluation_id=e.id;
 select * into r from private.evaluation_result_receipts where organization_id=e.organization_id and evaluation_id=e.id;
 select coalesce(jsonb_agg(jsonb_build_object('operationId',x.operation_id,'toolId',x.tool_id,'toolVersion',x.tool_version,'route',x.route,'resources',to_jsonb(x.resources),
  'decisionId',x.decision_id,'state',x.state,'reservedMicrousd',x.reserved_microusd,'reservedCalls',x.reserved_calls,'spentMicrousd',x.spent_microusd,'spentCalls',x.spent_calls,
  'createdAt',x.created_at) order by x.created_at,x.operation_id),'[]'::jsonb) into receipts
 from private.evaluation_operation_receipts x where x.organization_id=e.organization_id and x.evaluation_id=e.id;
 select coalesce(jsonb_agg(jsonb_build_object('decisionId',d.id,'allowed',d.allowed,'purpose',d.purpose,'resources',to_jsonb(d.resources),'reasons',to_jsonb(d.reasons),'createdAt',d.created_at)
  order by d.created_at,d.id),'[]'::jsonb) into decisions
 from private.processing_eligibility_decisions d where d.organization_id=e.organization_id and d.job_id=j.id;
 return jsonb_build_object('schemaVersion','governed-evaluation-read.v1','executionId',e.id,'organizationId',e.organization_id,'requestId',e.request_id,
  'processingRunId',e.processing_run_id,'requestedBy',e.requested_by_user_id,'createdAt',e.created_at,
  'contractFingerprint',e.contract_fingerprint,'inputFingerprint',e.snapshot_fingerprint,'audience',e.contract->'audience','budget',e.contract->'budget',
  'state',jsonb_build_object('job',j.status,'attempts',j.attempts,'lastErrorCode',j.last_error->>'code','run',run.status,'completedAt',run.completed_at),
  'outcome',r.outcome,'reason',r.reason,
  'result',case when r.evaluation_id is null then null else jsonb_build_object('resultFingerprint',r.result_fingerprint,'canonicalResult',r.canonical_result,'committedAt',r.created_at) end,
  'receipts',receipts,'decisions',decisions,
  'cost',jsonb_build_object('spentMicrousd',b.spent_microusd,'reservedMicrousd',b.reserved_microusd,'spentCalls',b.spent_calls,'reservedCalls',b.reserved_calls,
   'activeDurationMs',b.active_duration_ms,'exhausted',b.exhausted_at is not null),
  -- Confirmed spend plus every reservation not confirmed as unspent: the most this evaluation may have cost.
  'totalCostMicrousd',b.spent_microusd+b.reserved_microusd);
end $$;

-- 12. Grants. The worker-facing claim, renew, reserve, settle and commit are granted exactly like the
-- pinned execution consumer: the private implementation and its public invoker wrapper to
-- authenticated. Everything else is closed to every API role.
do $$declare f record;begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='private' and p.proname in ('require_platform_principal_v1','platform_principal_live_v1','platform_evaluator_live_v1','require_platform_evaluator_v1',
  'guard_platform_evaluation_organization_v1','ledger_platform_evaluation_organization_v1','register_platform_evaluation_organization_v1','guard_evaluation_operation_receipt_v1',
  'provider_processing_decision_v1','governed_evaluation_transport_released_v1','release_governed_evaluation_transport_v1','lock_governed_evaluation_v1','evaluation_for_lease_v1',
  'account_evaluation_duration_v1','close_exhausted_evaluations_v1','request_governed_evaluation_v1','claim_governed_evaluation_v1','read_governed_evaluation_v1',
  'worker_claim_evaluation_v1','worker_renew_evaluation_v1','worker_reserve_evaluation_operation_v1','worker_settle_evaluation_operation_v1','worker_commit_evaluation_v1'))
 or (n.nspname='public' and p.proname in ('worker_claim_evaluation_v1','worker_renew_evaluation_v1','worker_reserve_evaluation_operation_v1','worker_settle_evaluation_operation_v1','worker_commit_evaluation_v1'))
 loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname in ('worker_claim_evaluation_v1','worker_renew_evaluation_v1','worker_reserve_evaluation_operation_v1','worker_settle_evaluation_operation_v1','worker_commit_evaluation_v1') then
   execute format('grant execute on function %s to authenticated',f.signature);
  end if;
 end loop;
end $$;

-- 13. Boot contract. The worker requires its list to be a subset of the database's, so an extra key
-- keeps every deployed image booting, and an image requiring this key refuses an older database.
do $$declare body text;begin
 select pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure) into body;
 if position('governed-evaluation-consumer.v1' in body)>0 then raise exception 'evaluation_capability_already_registered';end if;
 if position('pinned-execution-consumer.v1' in body)=0 then raise exception 'runtime_capability_anchor_missing';end if;
 body:=replace(body,'pinned-execution-consumer.v1','pinned-execution-consumer.v1","governed-evaluation-consumer.v1');
 execute body;
end $$;
