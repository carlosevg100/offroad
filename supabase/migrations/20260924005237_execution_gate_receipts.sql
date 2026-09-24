-- Stage 17, increment 4C-3: an execution request carries its professional gates and leaves a
-- receipt of them. The v2 basis adds, from persisted rows only, which company the basis is about,
-- whether that company is registered for this work and whether public research was recorded for
-- it. The v2 producer refuses blocked gates, gates for another method and gates whose registration
-- disagrees with the server, hands the request to the unchanged v1 producer and, in the same
-- transaction, stores the canonical gates text with a SHA-256 computed here. No v1 function
-- changes, and nothing here grants execution to an organization.
set search_path='';

-- 1. What the database knows about the company a basis is about.
--
-- Dominant entity: the entity of most decisions pinned by the basis entries, through
-- public.adoption_decisions.entity_id (20260917160856_contextual_adoptions_and_assumptions.sql,
-- line 16). A tie goes to the smallest entity id; a basis without entries has no entity.
--
-- Registered means either of:
-- a) the entity is the active subject of a dossier of this work or of a resource under it, and it
--    has a current reviewed identifier. Subject: public.dossier_entity_links.relationship,
--    valid_from, valid_until and withdrawn_at (20260916190600_entity_and_dossier_identity.sql,
--    lines 42 to 44). Dossier of the work: public.dossiers.resource_id (same file, line 5) is the
--    work or a resource whose private.access_resources.parent_resource_id
--    (20260915204116_explicit_legacy_resource_access.sql, line 7) is the work, the scope that the
--    v1 basis and list_work_observations_v1 already use; an observation's entity must be linked in
--    the observation's own dossier, which is usually an intake session under the work.
--    Identifier: public.entity_identifiers.review_state, valid_from and valid_until
--    (20260916190600, lines 30 and 32).
-- b) the work's legacy company is verified: public.capital_projects.company_id
--    (20260901035248_universal_capital_projects.sql, line 8) and public.companies.verification_status
--    (20260815014649_platform_foundation.sql, line 84).
--
-- Research: the runs the worker records for the work's intake sessions, whether it searched live
-- or reused the public company memory: public.public_research_runs.intake_session_id, status and
-- created_at (20260826200143_agent_workspace_foundation.sql, lines 7, 9 and 15), joined through
-- public.document_intake_sessions.capital_project_id (20260901035248, line 95). 'succeeded' and
-- 'partial' are recorded research; 'abstained' is the schema's state for research attempted
-- without a usable source. private.public_company_source_memory is not read: its migration
-- (20260903134819_public_company_source_memory.sql, line 3) keeps it to a live worker capability,
-- and its stored_at would tell one organization when another last researched the same company.
create function private.execution_company_basis_v1(p_org uuid,p_work uuid,p_entries jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare w public.capital_projects;dominant uuid;registered boolean;recorded_at timestamptz;abstained_at timestamptz;begin
 select * into strict w from public.capital_projects where organization_id=p_org and id=p_work;
 select a.entity_id into dominant from jsonb_array_elements(coalesce(p_entries,'[]'::jsonb)) e
  join public.adoption_decisions a on a.organization_id=p_org and a.id=(e.value->>'decisionId')::uuid
  group by a.entity_id order by count(*) desc,a.entity_id limit 1;
 registered:=(dominant is not null
  and exists(select 1 from public.dossier_entity_links l
   join public.dossiers d on d.organization_id=l.organization_id and d.id=l.dossier_id
   join private.access_resources r on r.organization_id=d.organization_id and r.id=d.resource_id
   where l.organization_id=p_org and l.entity_id=dominant and l.relationship='subject' and l.withdrawn_at is null
   and l.valid_from<=now() and (l.valid_until is null or l.valid_until>now()) and (r.id=w.id or r.parent_resource_id=w.id))
  and exists(select 1 from public.entity_identifiers i where i.entity_id=dominant and i.review_state='reviewed'
   and i.valid_from<=now() and (i.valid_until is null or i.valid_until>now())))
  or exists(select 1 from public.companies c where c.organization_id=w.organization_id and c.id=w.company_id and c.verification_status='verified');
 select max(x.created_at) filter(where x.status in ('succeeded','partial')),max(x.created_at) filter(where x.status='abstained')
  into recorded_at,abstained_at
  from public.public_research_runs x join public.document_intake_sessions s on s.organization_id=x.organization_id and s.id=x.intake_session_id
  where x.organization_id=p_org and s.capital_project_id=w.id;
 return jsonb_build_object('entityId',dominant,'registration',case when registered then 'registered' else 'missing' end,
  'research',case when recorded_at is not null then 'recorded' when abstained_at is not null then 'abstained' else 'missing' end,
  'researchAsOf',coalesce(recorded_at,abstained_at));
end $$;
revoke all on function private.execution_company_basis_v1(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- 2. The v2 basis is the v1 basis, with every v1 check run first and unchanged, plus the company
-- block computed over the same persisted envelope.
create function private.execution_contract_basis_v2(p_work_id uuid,p_version_id uuid,p_method_id text default 'prepare-capital-structure-decision') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare b jsonb;begin
 b:=private.execution_contract_basis_v1(p_work_id,p_version_id,p_method_id);
 return b||jsonb_build_object('schemaVersion','execution-contract-basis.v2',
  'company',private.execution_company_basis_v1((b->>'organizationId')::uuid,p_work_id,private.execution_json_projection_v1(b#>>'{envelope,canonical}')->'entries'));
end $$;
revoke all on function private.execution_contract_basis_v2(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.execution_contract_basis_v2(uuid,uuid,text) to authenticated;
create function public.execution_contract_basis_v2(p_work_id uuid,p_version_id uuid,p_method_id text default 'prepare-capital-structure-decision') returns jsonb language sql volatile security invoker set search_path='' as $$ select private.execution_contract_basis_v2(p_work_id,p_version_id,p_method_id); $$;
revoke all on function public.execution_contract_basis_v2(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.execution_contract_basis_v2(uuid,uuid,text) to authenticated;

-- 3. The gates text. Closed at every level: every key is in the allowlist below, every string is a
-- bounded token or an enumerated state, every count a non-negative integer, and there is no free
-- text anywhere. The bytes must already be the house canonical text (executionCanonicalText in
-- packages/agent-contracts: keys in UTF-16 order, no whitespace), so the stored text and its
-- SHA-256 are exactly what the client serialized. Duplicate keys are refused by the shared
-- projection helper before jsonb could silently keep the last one. Both helpers are stable, not
-- immutable, because to_jsonb is.
create function private.execution_gates_canonical_text_v1(p_value jsonb) returns text
language plpgsql stable security invoker set search_path='' as $$
begin
 -- Exact for the closed gates schema only: its keys are ASCII, so C collation is UTF-16 order, its
 -- strings are tokens that need no escape and its numbers are integers.
 if jsonb_typeof(p_value)='object' then
  return '{'||coalesce((select string_agg(to_jsonb(k.key)::text||':'||private.execution_gates_canonical_text_v1(k.value),',' order by k.key collate "C")
   from jsonb_each(p_value) k),'')||'}';
 elsif jsonb_typeof(p_value)='array' then
  return '['||coalesce((select string_agg(private.execution_gates_canonical_text_v1(e.value),',' order by e.n)
   from jsonb_array_elements(p_value) with ordinality e(value,n)),'')||']';
 end if;
 return p_value::text;
end $$;
revoke all on function private.execution_gates_canonical_text_v1(jsonb) from public,anon,authenticated,service_role;

create function private.execution_gates_projection_v1(p_gates_text text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare g jsonb;m jsonb;v jsonb;item jsonb;
 token constant text:='^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$';
 counter constant text:='^(0|[1-9][0-9]{0,8})$';
begin
 if p_gates_text is null or octet_length(p_gates_text)>262144 then raise exception 'execution_gates_invalid' using errcode='22023';end if;
 begin
  g:=private.execution_json_projection_v1(p_gates_text);
  if jsonb_typeof(g) is distinct from 'object'
  or g-array['schemaVersion','gatesVersion','blocked','companyRegistration','research','methodSelection','conventions','voice']<>'{}'::jsonb
  or not g?&array['schemaVersion','gatesVersion','blocked','companyRegistration','research','methodSelection','conventions','voice']
  or jsonb_typeof(g->'schemaVersion') is distinct from 'string' or coalesce(g->>'schemaVersion','')<>'execution-gates.v1'
  or jsonb_typeof(g->'gatesVersion') is distinct from 'string' or coalesce(g->>'gatesVersion','') !~ token
  or jsonb_typeof(g->'blocked') is distinct from 'boolean'
  or jsonb_typeof(g->'companyRegistration') is distinct from 'string' or coalesce(g->>'companyRegistration','') not in ('registered','missing')
  or jsonb_typeof(g->'research') is distinct from 'string' or coalesce(g->>'research','') not in ('recorded','abstained','missing')
  then raise exception 'execution_gates_invalid' using errcode='22023';end if;
  m:=g->'methodSelection';
  if jsonb_typeof(m) is distinct from 'object'
  or m-array['selectionVersion','situationIds','methodId','methodVersion']<>'{}'::jsonb
  or not m?&array['selectionVersion','situationIds','methodId','methodVersion']
  or jsonb_typeof(m->'selectionVersion') is distinct from 'string' or coalesce(m->>'selectionVersion','') !~ token
  or jsonb_typeof(m->'methodId') is distinct from 'string' or coalesce(m->>'methodId','') !~ '^[a-z][a-z0-9-]{2,79}$'
  or jsonb_typeof(m->'methodVersion') is distinct from 'string' or coalesce(m->>'methodVersion','') !~ token
  or jsonb_typeof(m->'situationIds') is distinct from 'array' or jsonb_array_length(m->'situationIds')>32
  or exists(select 1 from jsonb_array_elements(m->'situationIds') s
   where jsonb_typeof(s.value) is distinct from 'string' or coalesce(s.value#>>'{}','') !~ '^[a-z][a-z0-9-]{0,79}$')
  or (select count(distinct s.value) from jsonb_array_elements(m->'situationIds') s)<>jsonb_array_length(m->'situationIds')
  then raise exception 'execution_gates_invalid' using errcode='22023';end if;
  if jsonb_typeof(g->'conventions') is distinct from 'array' or jsonb_array_length(g->'conventions')>256
  or (select count(distinct x.value->>'key') from jsonb_array_elements(g->'conventions') x)<>jsonb_array_length(g->'conventions')
  then raise exception 'execution_gates_invalid' using errcode='22023';end if;
  for item in select x.value from jsonb_array_elements(g->'conventions') x loop
   if jsonb_typeof(item) is distinct from 'object'
   or item-array['key','version','status','effective']<>'{}'::jsonb or not item?&array['key','version','status','effective']
   or jsonb_typeof(item->'key') is distinct from 'string' or coalesce(item->>'key','') !~ '^[a-z][a-z0-9_.-]{0,127}$'
   or (jsonb_typeof(item->'version') is distinct from 'null' and (jsonb_typeof(item->'version') is distinct from 'string' or coalesce(item->>'version','') !~ token))
   or (jsonb_typeof(item->'status') is distinct from 'null' and (jsonb_typeof(item->'status') is distinct from 'string'
    or coalesce(item->>'status','') not in ('required_missing','draft','approved','expired')))
   or jsonb_typeof(item->'effective') is distinct from 'string' or coalesce(item->>'effective','') not in ('approved','gap')
   then raise exception 'execution_gates_invalid' using errcode='22023';end if;
  end loop;
  v:=g->'voice';
  if jsonb_typeof(v) is distinct from 'object'
  or v-array['version','blockCount','warnCount']<>'{}'::jsonb or not v?&array['version','blockCount','warnCount']
  or jsonb_typeof(v->'version') is distinct from 'string' or coalesce(v->>'version','') !~ token
  or jsonb_typeof(v->'blockCount') is distinct from 'number' or coalesce(v->>'blockCount','') !~ counter
  or jsonb_typeof(v->'warnCount') is distinct from 'number' or coalesce(v->>'warnCount','') !~ counter
  then raise exception 'execution_gates_invalid' using errcode='22023';end if;
  if private.execution_gates_canonical_text_v1(g) is distinct from p_gates_text then raise exception 'execution_gates_invalid' using errcode='22023';end if;
 exception when data_exception then raise exception 'execution_gates_invalid' using errcode='22023';
 end;
 return g;
end $$;
revoke all on function private.execution_gates_projection_v1(text) from public,anon,authenticated,service_role;

-- 4. Receipts: one per execution, written only with the execution it describes, never changed,
-- deleted or truncated. The fingerprint is the SHA-256 of the stored canonical text or nothing.
create table private.execution_gate_receipts (
 organization_id uuid not null,
 execution_id uuid not null,
 gates_version text not null,
 canonical_gates text not null,
 gates_fingerprint text not null,
 blocked boolean not null,
 created_at timestamptz not null default now(),
 constraint execution_gate_receipts_pkey primary key(organization_id,execution_id),
 constraint execution_gate_receipts_execution_fkey foreign key(organization_id,execution_id) references public.work_executions(organization_id,id),
 constraint execution_gate_receipts_version_check check(gates_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
 constraint execution_gate_receipts_size_check check(octet_length(canonical_gates) between 2 and 262144),
 constraint execution_gate_receipts_fingerprint_check check(gates_fingerprint=encode(extensions.digest(convert_to(canonical_gates,'UTF8'),'sha256'),'hex')),
 constraint execution_gate_receipts_projection_check check(gates_version is not distinct from (canonical_gates::jsonb->>'gatesVersion')
  and blocked is not distinct from (canonical_gates::jsonb->>'blocked')::boolean)
);
alter table private.execution_gate_receipts enable row level security;
alter table private.execution_gate_receipts force row level security;
create policy execution_gate_receipts_deny on private.execution_gate_receipts as restrictive for all to public using(false) with check(false);
revoke all on private.execution_gate_receipts from public,anon,authenticated,service_role;
create trigger execution_gate_receipts_immutable before update or delete on private.execution_gate_receipts for each row execute function private.guard_contribution_immutable_v1();
create trigger execution_gate_receipts_truncate_guard before truncate on private.execution_gate_receipts for each statement execute function private.guard_platform_ledger_truncate_v1();
comment on table private.execution_gate_receipts is 'Immutable receipt of the professional gates a v2 producer request carried: canonical text with only allowlisted keys and tokens, and its server-side SHA-256. Written in the same transaction as the execution; no client or worker grant.';

-- 5. The v2 producer. Gates are checked before anything else runs; the registration is compared
-- only after the v2 basis has checked the caller's access to the work, so a refusal never tells a
-- caller without access what the work's registration is. The v1 producer then runs unchanged in
-- this transaction, and its conflict reaches the caller exactly as v1 raises it.
create function private.request_work_execution_producer_v2(p_contract_text text,p_snapshot_text text,p_gates_text text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare g jsonb;c jsonb;target_work uuid;target_version uuid;versions text[];basis jsonb;r jsonb;ex uuid;org uuid;fp text;prior private.execution_gate_receipts;begin
 if auth.uid() is null then raise exception 'execution_subject_required' using errcode='42501';end if;
 g:=private.execution_gates_projection_v1(p_gates_text);
 if (g->>'blocked')::boolean then raise exception 'execution_gates_blocked' using errcode='42501';end if;
 if p_contract_text is null or octet_length(p_contract_text)>1048576 or p_snapshot_text is null or octet_length(p_snapshot_text)>8388608
 then raise exception 'execution_contract_denied' using errcode='42501';end if;
 begin
  c:=private.execution_json_projection_v1(p_contract_text);
  if jsonb_typeof(c#>'{inputs,adoptions}') is distinct from 'array' or jsonb_typeof(c#>'{inputs,hypotheses}') is distinct from 'array'
  then raise exception 'execution_contract_denied' using errcode='42501';end if;
  target_work:=(c->>'workId')::uuid;
  select array_agg(distinct x.value->>'assumptionVersionId') into versions
   from jsonb_array_elements((c#>'{inputs,adoptions}')||(c#>'{inputs,hypotheses}')) x;
  -- Gates are evaluated over one basis version: the contract must pin exactly one.
  if coalesce(cardinality(versions),0)=1 and versions[1] is not null then target_version:=versions[1]::uuid;end if;
 exception when data_exception then raise exception 'execution_contract_denied' using errcode='42501';
 end;
 if c#>>'{method,methodId}' is distinct from g#>>'{methodSelection,methodId}'
 or c#>>'{method,methodVersion}' is distinct from g#>>'{methodSelection,methodVersion}'
 or target_version is null then raise exception 'execution_gates_mismatch' using errcode='42501';end if;
 basis:=private.execution_contract_basis_v2(target_work,target_version,c#>>'{method,methodId}');
 if basis#>>'{company,registration}' is distinct from g->>'companyRegistration' then raise exception 'execution_gates_mismatch' using errcode='42501';end if;
 r:=private.request_work_execution_producer_v1(p_contract_text,p_snapshot_text);
 ex:=(r->>'executionId')::uuid;
 select organization_id into strict org from public.capital_projects where id=target_work;
 fp:=encode(extensions.digest(convert_to(p_gates_text,'UTF8'),'sha256'),'hex');
 if coalesce((r->>'replayed')::boolean,false) then
  -- A replay names the same execution only with the same gates. Other gates under the same
  -- request, or gates for an execution requested without them, are the conflicting retry v1
  -- reports, and no receipt is written.
  select * into prior from private.execution_gate_receipts where organization_id=org and execution_id=ex;
  if not found or prior.gates_fingerprint<>fp then raise exception 'execution_request_conflict' using errcode='23505',detail=ex::text;end if;
 else
  insert into private.execution_gate_receipts(organization_id,execution_id,gates_version,canonical_gates,gates_fingerprint,blocked)
  values(org,ex,g->>'gatesVersion',p_gates_text,fp,(g->>'blocked')::boolean);
 end if;
 return r||jsonb_build_object('gatesFingerprint',fp);
end $$;
revoke all on function private.request_work_execution_producer_v2(text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.request_work_execution_producer_v2(text,text,text) to authenticated;
create function public.request_work_execution_v2(p_contract_text text,p_snapshot_text text,p_gates_text text) returns jsonb language sql volatile security invoker set search_path='' as $$ select private.request_work_execution_producer_v2(p_contract_text,p_snapshot_text,p_gates_text); $$;
revoke all on function public.request_work_execution_v2(text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.request_work_execution_v2(text,text,text) to authenticated;

-- 6. The v2 reader is the v1 reader, with every v1 check run first and unchanged, plus the receipt.
create function private.read_work_execution_v2(p_execution_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r jsonb;x private.execution_gate_receipts;begin
 r:=private.read_work_execution_v1(p_execution_id);
 select g.* into x from private.execution_gate_receipts g join public.work_executions e on e.organization_id=g.organization_id and e.id=g.execution_id
  where e.id=p_execution_id;
 return r||jsonb_build_object('schemaVersion','work-execution-read.v2','gates',case when x.execution_id is null then null
  else jsonb_build_object('gatesVersion',x.gates_version,'blocked',x.blocked,'fingerprint',x.gates_fingerprint,'canonical',x.canonical_gates::jsonb,'createdAt',x.created_at) end);
end $$;
revoke all on function private.read_work_execution_v2(uuid) from public,anon,authenticated,service_role;
grant execute on function private.read_work_execution_v2(uuid) to authenticated;
create function public.read_work_execution_v2(p_execution_id uuid) returns jsonb language sql volatile security invoker set search_path='' as $$ select private.read_work_execution_v2(p_execution_id); $$;
revoke all on function public.read_work_execution_v2(uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_work_execution_v2(uuid) to authenticated;
