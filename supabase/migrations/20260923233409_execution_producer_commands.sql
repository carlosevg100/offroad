-- Stage 17, increment 4A, second part: the tenant-facing producer path. A basis RPC assembles, from
-- persisted rows only, everything a contract needs (identity, authority revision, policy fingerprint,
-- the single released profile, the working basis envelope, its decision pins and the verified source
-- pins); a public producer wrapper resolves the profile on the server, never from the client, and
-- hands the request to the human wrapper; readers return an execution's identity and state, and its
-- result bytes only while the reader's own inputs are still current.
set search_path='';

-- Exactly one released, universal, compiled deterministic profile may serve a method.
create function private.execution_released_profile_v1(p_method_id text) returns private.execution_method_profiles
language plpgsql stable security definer set search_path='' as $$
declare p private.execution_method_profiles;n integer;begin
 select count(*) into n from private.execution_method_profiles x
  join private.platform_method_releases r on r.id=x.platform_release_id
  join private.platform_capability_releases c on c.capability_key=r.capability_key and c.method_id=r.method_id and c.method_version=r.version
  where r.method_id=p_method_id and x.payload->>'adapter'='compiled-single-deterministic.v1' and c.released and c.exposure='universal' and private.platform_method_reference_available_v1(r.id);
 if n=0 then raise exception 'execution_method_unavailable' using errcode='42501';end if;
 if n>1 then raise exception 'execution_profile_ambiguous' using errcode='42501';end if;
 select x.* into strict p from private.execution_method_profiles x
  join private.platform_method_releases r on r.id=x.platform_release_id
  join private.platform_capability_releases c on c.capability_key=r.capability_key and c.method_id=r.method_id and c.method_version=r.version
  where r.method_id=p_method_id and x.payload->>'adapter'='compiled-single-deterministic.v1' and c.released and c.exposure='universal' and private.platform_method_reference_available_v1(r.id);
 return p;
end $$;
revoke all on function private.execution_released_profile_v1(text) from public,anon,authenticated,service_role;

create function private.execution_contract_basis_v1(p_work_id uuid,p_version_id uuid,p_method_id text default 'prepare-capital-structure-decision') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare w public.capital_projects;human private.principals;rev bigint;policy_hash text;p private.execution_method_profiles;
 v public.assumption_versions;s public.assumption_sets;basis jsonb;entry jsonb;adoptions jsonb:='[]';hypotheses jsonb:='[]';
 sources jsonb:='[]';unverified jsonb:='[]';src record;rights_rev integer;res uuid;hash text;
begin
 if auth.uid() is null then raise exception 'execution_subject_required' using errcode='42501';end if;
 select * into w from public.capital_projects where id=p_work_id;
 if not found then raise exception 'execution_access_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||w.organization_id::text,0));
 select * into human from private.principals where organization_id=w.organization_id and user_id=auth.uid() and kind='human' and revoked_at is null;
 if not found or not private.evaluate_resource_policy_v1(w.organization_id,w.id,auth.uid(),'work','analysis') or w.status='archived'
 then raise exception 'execution_access_denied' using errcode='42501';end if;
 if not private.execution_producer_enabled_v1(w.organization_id) then raise exception 'execution_producer_denied' using errcode='42501';end if;
 p:=private.execution_released_profile_v1(p_method_id);
 perform private.require_execution_release_v1(p.id);
 insert into private.authorization_revisions(organization_id,resource_id,subject_user_id) values(w.organization_id,private.resource_root_v1(w.organization_id,w.id),auth.uid()) on conflict do nothing;
 select revision into strict rev from private.authorization_revisions where organization_id=w.organization_id and resource_id=private.resource_root_v1(w.organization_id,w.id) and subject_user_id=auth.uid();
 policy_hash:=private.execution_policy_fingerprint_v1(w.organization_id,w.id,human.id,rev);
 select av.* into v from public.assumption_versions av where av.organization_id=w.organization_id and av.id=p_version_id and av.classification='working_basis';
 if not found or not private.can_read_assumption_version_v1(w.organization_id,v.id) then raise exception 'execution_basis_denied' using errcode='42501';end if;
 select * into strict s from public.assumption_sets where organization_id=w.organization_id and id=v.set_id;
 if s.work_id is distinct from w.id then raise exception 'execution_basis_denied' using errcode='42501';end if;
 basis:=private.execution_json_projection_v1(v.canonical_snapshot);
 for entry in select value from jsonb_array_elements(basis->'entries') loop
  if entry->>'kind'='observation' then adoptions:=adoptions||jsonb_build_object('id',entry->>'decisionId','assumptionVersionId',v.id,'fingerprint',v.content_fingerprint);
  else hypotheses:=hypotheses||jsonb_build_object('id',entry->>'decisionId','assumptionVersionId',v.id,'fingerprint',v.content_fingerprint);end if;
 end loop;
 -- Every source the basis rests on: adopted observations and contractual definitions. A source is
 -- pinned only with retained bytes verified by the worker, its rights revision and a live binding
 -- to this work; anything else is reported, never pinned.
 for src in
  with refs as (
   select o.source_version_id,o.source_rights_version_id as rights_version_id
   from jsonb_array_elements(basis->'entries') e
   join public.adoption_decisions a on a.organization_id=w.organization_id and a.id=(e.value->>'decisionId')::uuid
   join public.observations o on o.organization_id=a.organization_id and o.id=a.reference_observation_id
   where o.source_version_id is not null
   union
   select d.contract_source_version_id,d.contract_rights_version_id
   from jsonb_array_elements(basis->'entries') e
   join public.adoption_decisions a on a.organization_id=w.organization_id and a.id=(e.value->>'decisionId')::uuid
   join public.definition_versions d on d.organization_id=a.organization_id and d.id=a.definition_version_id
   where d.contract_source_version_id is not null)
  select distinct source_version_id,rights_version_id from refs
 loop
  rights_rev:=null;res:=null;hash:=null;
  select r.revision into rights_rev from private.source_rights_versions r where r.organization_id=w.organization_id and r.id=src.rights_version_id and r.source_version_id=src.source_version_id;
  select x.observed_sha256 into hash from private.source_version_verifications x where x.organization_id=w.organization_id and x.source_version_id=src.source_version_id order by x.created_at desc limit 1;
  select sb.resource_id into res from public.source_bindings sb join private.access_resources ar on ar.organization_id=sb.organization_id and ar.id=sb.resource_id
   where sb.organization_id=w.organization_id and sb.source_version_id=src.source_version_id and sb.revoked_at is null and (ar.id=w.id or ar.parent_resource_id=w.id)
   order by (ar.id=w.id) desc limit 1;
  if rights_rev is null then unverified:=unverified||jsonb_build_object('sourceVersionId',src.source_version_id,'reason','rights_missing');
  elsif hash is null or not private.execution_source_bytes_verified_v1(w.organization_id,src.source_version_id,hash) then unverified:=unverified||jsonb_build_object('sourceVersionId',src.source_version_id,'reason','bytes_unverified');
  elsif res is null then unverified:=unverified||jsonb_build_object('sourceVersionId',src.source_version_id,'reason','binding_missing');
  else sources:=sources||jsonb_build_object('resourceId',res,'sourceVersionId',src.source_version_id,'contentHash',hash,'rightsRevision',rights_rev::text);end if;
 end loop;
 return jsonb_build_object('schemaVersion','execution-contract-basis.v1','organizationId',w.organization_id,'workId',w.id,'principalId',human.id,
  'authorityRevision',rev::text,'policyFingerprint',policy_hash,'purpose',s.purpose,'contextKey',s.context_key,'versionId',v.id,
  'envelope',jsonb_build_object('canonical',v.canonical_snapshot,'fingerprint',v.content_fingerprint),
  'adoptions',adoptions,'hypotheses',hypotheses,'sources',sources,'unverifiedSources',unverified,
  'profile',jsonb_build_object('id',p.id,'platformReleaseId',p.platform_release_id,'method',p.payload->'method','tools',p.payload->'tools',
   'allowedEffects',p.payload->'allowedEffects','limits',p.payload->'limits','fingerprint',p.payload->>'fingerprint'));
end $$;
revoke all on function private.execution_contract_basis_v1(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.execution_contract_basis_v1(uuid,uuid,text) to authenticated;
create function public.execution_contract_basis_v1(p_work_id uuid,p_version_id uuid,p_method_id text default 'prepare-capital-structure-decision') returns jsonb language sql volatile security invoker set search_path='' as $$ select private.execution_contract_basis_v1(p_work_id,p_version_id,p_method_id); $$;
revoke all on function public.execution_contract_basis_v1(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.execution_contract_basis_v1(uuid,uuid,text) to authenticated;

-- The producer never receives a profile id from the client: the server resolves the single released
-- profile for the contract's method and refuses any method bytes that differ from it.
create function private.request_work_execution_producer_v1(p_contract_text text,p_snapshot_text text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare c jsonb;w public.capital_projects;p private.execution_method_profiles;ex uuid;begin
 if auth.uid() is null then raise exception 'execution_subject_required' using errcode='42501';end if;
 if p_contract_text is null or octet_length(p_contract_text)>1048576 or p_snapshot_text is null or octet_length(p_snapshot_text)>8388608
 then raise exception 'execution_contract_denied' using errcode='42501';end if;
 c:=private.execution_json_projection_v1(p_contract_text);
 select * into w from public.capital_projects where id=(c->>'workId')::uuid;
 if not found then raise exception 'execution_access_denied' using errcode='42501';end if;
 if not exists(select 1 from private.principals where organization_id=w.organization_id and user_id=auth.uid() and kind='human' and revoked_at is null)
 then raise exception 'execution_access_denied' using errcode='42501';end if;
 if not private.execution_producer_enabled_v1(w.organization_id) then raise exception 'execution_producer_denied' using errcode='42501';end if;
 p:=private.execution_released_profile_v1(c#>>'{method,methodId}');
 if c->'method' is distinct from p.payload->'method' then raise exception 'execution_contract_denied' using errcode='42501';end if;
 begin
  return private.request_work_execution_v1(p.id,p_contract_text,p_snapshot_text);
 exception when unique_violation then
  if sqlerrm<>'execution_request_conflict' then raise;end if;
  -- The same request id already produced an execution of this human: name it, so the caller follows it instead of duplicating.
  select e.id into ex from public.work_executions e join private.principals h on h.organization_id=e.organization_id and h.id=e.principal_id
   where e.organization_id=w.organization_id and h.user_id=auth.uid() and e.request_id=(c->>'requestId')::uuid;
  raise exception 'execution_request_conflict' using errcode='23505',detail=coalesce(ex::text,'');
 end;
exception when data_exception then raise exception 'execution_contract_denied' using errcode='42501';
end $$;
revoke all on function private.request_work_execution_producer_v1(text,text) from public,anon,authenticated,service_role;
grant execute on function private.request_work_execution_producer_v1(text,text) to authenticated;
create function public.request_work_execution_v1(p_contract_text text,p_snapshot_text text) returns jsonb language sql volatile security invoker set search_path='' as $$ select private.request_work_execution_producer_v1(p_contract_text,p_snapshot_text); $$;
revoke all on function public.request_work_execution_v1(text,text) from public,anon,authenticated,service_role;
grant execute on function public.request_work_execution_v1(text,text) to authenticated;

-- Readers: a participant of the work reads identity and state; result bytes only while the reader's
-- own inputs are current. Lease ids and capability hashes never leave the database.
create function private.execution_read_access_v1(p_org uuid,p_work uuid) returns void language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'execution_subject_required' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||p_org::text,0));
 if not exists(select 1 from private.principals where organization_id=p_org and user_id=auth.uid() and kind='human' and revoked_at is null)
 or not private.evaluate_resource_policy_v1(p_org,p_work,auth.uid(),'read','analysis') then raise exception 'execution_access_denied' using errcode='42501';end if;
end $$;
revoke all on function private.execution_read_access_v1(uuid,uuid) from public,anon,authenticated,service_role;

create function private.read_work_execution_v1(p_execution_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare e public.work_executions;j public.processing_jobs;run public.processing_runs;m private.execution_manifests;o private.execution_operation_receipts;r private.execution_result_receipts;current boolean;begin
 select * into e from public.work_executions where id=p_execution_id;
 if not found then raise exception 'execution_access_denied' using errcode='42501';end if;
 perform private.execution_read_access_v1(e.organization_id,e.work_id);
 select * into j from public.processing_jobs where organization_id=e.organization_id and execution_id=e.id and kind='work_execution';
 select * into run from public.processing_runs where organization_id=e.organization_id and id=e.processing_run_id;
 select * into m from private.execution_manifests where organization_id=e.organization_id and execution_id=e.id;
 select * into o from private.execution_operation_receipts where organization_id=e.organization_id and execution_id=e.id and operation_id=e.id;
 select * into r from private.execution_result_receipts where organization_id=e.organization_id and execution_id=e.id;
 current:=private.execution_inputs_current_v1(e.organization_id,e.id,auth.uid());
 return jsonb_build_object('schemaVersion','work-execution-read.v1','executionId',e.id,'workId',e.work_id,'requestId',e.request_id,'processingRunId',e.processing_run_id,'createdAt',e.created_at,
  'job',case when j.id is null then null else jsonb_build_object('status',j.status,'attempts',j.attempts,'lastErrorCode',j.last_error->>'code','availableAt',j.available_at,'updatedAt',j.updated_at) end,
  'run',case when run.id is null then null else jsonb_build_object('status',run.status,'completedAt',run.completed_at,'usage',run.usage) end,
  'manifest',case when m.id is null then null else jsonb_build_object('contractFingerprint',m.payload_fingerprint,'inputFingerprint',m.snapshot_fingerprint,'purpose',m.payload->>'purpose','method',m.payload->'method','budget',m.payload->'budget','requestedAt',m.payload->>'requestedAt') end,
  'operation',case when o.id is null then null else jsonb_build_object('state',o.state,'settledOutcome',o.settled_outcome,'settledReason',o.settled_reason,'resultFingerprint',o.result_fingerprint) end,
  'result',case when r.id is null then null
   when not current then jsonb_build_object('withheld','inputs_not_current','outcome',r.outcome,'reason',r.reason,'resultFingerprint',r.result_fingerprint,'committedAt',r.created_at)
   else jsonb_build_object('outcome',r.outcome,'reason',r.reason,'resultFingerprint',r.result_fingerprint,'canonicalResult',r.canonical_result,'committedAt',r.created_at) end,
  'inputsCurrent',current);
end $$;
revoke all on function private.read_work_execution_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function private.read_work_execution_v1(uuid) to authenticated;
create function public.read_work_execution_v1(p_execution_id uuid) returns jsonb language sql volatile security invoker set search_path='' as $$ select private.read_work_execution_v1(p_execution_id); $$;
revoke all on function public.read_work_execution_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_work_execution_v1(uuid) to authenticated;

create function private.list_work_executions_v1(p_work_id uuid,p_before uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare w public.capital_projects;cursor_at timestamptz;rows jsonb;begin
 select * into w from public.capital_projects where id=p_work_id;
 if not found then raise exception 'execution_access_denied' using errcode='42501';end if;
 perform private.execution_read_access_v1(w.organization_id,w.id);
 if p_before is not null then
  select created_at into cursor_at from public.work_executions where organization_id=w.organization_id and work_id=w.id and id=p_before;
  if cursor_at is null then raise exception 'execution_cursor_invalid' using errcode='22023';end if;
 end if;
 select coalesce(jsonb_agg(x.item order by x.created_at desc,x.id desc),'[]'::jsonb) into rows from (
  select e.created_at,e.id,jsonb_build_object('executionId',e.id,'requestId',e.request_id,'processingRunId',e.processing_run_id,'createdAt',e.created_at,
   'jobStatus',j.status,'runStatus',run.status,'outcome',r.outcome,'reason',r.reason,'purpose',m.payload->>'purpose') item
  from public.work_executions e
  left join public.processing_jobs j on j.organization_id=e.organization_id and j.execution_id=e.id and j.kind='work_execution'
  left join public.processing_runs run on run.organization_id=e.organization_id and run.id=e.processing_run_id
  left join private.execution_result_receipts r on r.organization_id=e.organization_id and r.execution_id=e.id
  left join private.execution_manifests m on m.organization_id=e.organization_id and m.execution_id=e.id
  where e.organization_id=w.organization_id and e.work_id=w.id
  and (p_before is null or (e.created_at,e.id)<(cursor_at,p_before))
  order by e.created_at desc,e.id desc limit 26) x;
 return rows;
end $$;
revoke all on function private.list_work_executions_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.list_work_executions_v1(uuid,uuid) to authenticated;
create function public.list_work_executions_v1(p_work_id uuid,p_before uuid default null) returns jsonb language sql volatile security invoker set search_path='' as $$ select private.list_work_executions_v1(p_work_id,p_before); $$;
revoke all on function public.list_work_executions_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.list_work_executions_v1(uuid,uuid) to authenticated;
