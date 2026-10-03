-- Stage 20 / 3U brief producer precursor. Pending: never publish separately from
-- the v2 human command, both worker consumers and the exact dispatch guard.
-- Forward only; no history backfill, no permanent copy of loader context.
set search_path='';
create table private.execution_brief_input_captures (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 work_id uuid not null, session_id uuid not null, producer_job_id uuid not null,
 request_id uuid not null, producer_kind text not null check(producer_kind in ('agent_operation_brief','execution_brief_proposal')),
 source_pack_id text check(source_pack_id~'^[a-z0-9][a-z0-9_-]{1,79}$'),
 human_subject_id uuid not null references auth.users(id), input_fingerprint text not null check(input_fingerprint~'^[a-f0-9]{64}$'),
 context_fingerprint text not null check(context_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id), unique(organization_id,producer_job_id,request_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,session_id) references public.document_intake_sessions(organization_id,id),
 foreign key(organization_id,producer_job_id) references public.processing_jobs(organization_id,id)
);
create table private.execution_brief_input_source_pins (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, capture_id uuid not null,
 source_version_id uuid not null, rights_version_id uuid not null, source_document_version integer not null check(source_document_version>0),
 declared_sha256 text not null check(declared_sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,capture_id,source_version_id),
 foreign key(organization_id,capture_id) references private.execution_brief_input_captures(organization_id,id),
 foreign key(organization_id,source_version_id) references public.source_versions(organization_id,id),
 foreign key(organization_id,rights_version_id) references private.source_rights_versions(organization_id,id)
);
create table private.execution_brief_write_intents (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,capture_id uuid not null,
 producer_job_id uuid not null,transaction_id bigint not null,
 internal_fingerprint text not null check(internal_fingerprint~'^[a-f0-9]{64}$'),
 visible_fingerprint text not null check(visible_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,capture_id),
 foreign key(organization_id,capture_id) references private.execution_brief_input_captures(organization_id,id),
 foreign key(organization_id,producer_job_id) references public.processing_jobs(organization_id,id)
);
create table private.execution_brief_native_bindings (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,
 capture_id uuid not null,execution_brief_id uuid not null,plan_id uuid not null,
 brief_fingerprint text not null check(brief_fingerprint~'^[a-f0-9]{64}$'),
 storage_fingerprint text not null check(storage_fingerprint~'^[a-f0-9]{64}$'),
 plan_fingerprint text not null check(plan_fingerprint~'^[a-f0-9]{64}$'),
 -- Post-effect proof is distinct from the immutable compiler precursor.
 post_write_input_fingerprint text not null check(post_write_input_fingerprint~'^[a-f0-9]{64}$'),
 post_write_context_fingerprint text not null check(post_write_context_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,capture_id),unique(organization_id,execution_brief_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,capture_id) references private.execution_brief_input_captures(organization_id,id),
 foreign key(organization_id,execution_brief_id) references public.capital_project_execution_briefs(organization_id,id),
 foreign key(organization_id,plan_id) references public.capital_project_plans(organization_id,id)
);
-- Atomic producer completion stores only immutable result identities. It lets
-- a leased retry acknowledge committed work without recapturing changed inputs.
create table private.execution_brief_producer_completions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,capture_id uuid not null,producer_job_id uuid not null,request_id uuid not null,
 execution_brief_id uuid not null,plan_id uuid not null,assistant_message_id uuid,proposal_id uuid,activation_job_id uuid,dispatch_id uuid,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,capture_id),unique(organization_id,producer_job_id,request_id),
 foreign key(organization_id,capture_id) references private.execution_brief_input_captures(organization_id,id),
 foreign key(organization_id,producer_job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,execution_brief_id) references public.capital_project_execution_briefs(organization_id,id),
 foreign key(organization_id,plan_id) references public.capital_project_plans(organization_id,id),
 foreign key(organization_id,assistant_message_id) references public.agent_messages(organization_id,id),
 foreign key(organization_id,proposal_id) references public.agent_change_proposals(organization_id,id),
 foreign key(organization_id,activation_job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,dispatch_id) references public.capital_project_execution_brief_dispatches(organization_id,id)
);
create index execution_brief_completion_brief_fk on private.execution_brief_producer_completions(organization_id,execution_brief_id);
create index execution_brief_completion_plan_fk on private.execution_brief_producer_completions(organization_id,plan_id);
create index execution_brief_completion_message_fk on private.execution_brief_producer_completions(organization_id,assistant_message_id);
create index execution_brief_completion_proposal_fk on private.execution_brief_producer_completions(organization_id,proposal_id);
create index execution_brief_completion_activation_fk on private.execution_brief_producer_completions(organization_id,activation_job_id);
create index execution_brief_completion_dispatch_fk on private.execution_brief_producer_completions(organization_id,dispatch_id);
-- Index every composite FK and subject lookup. No direct read, even for workers.
create index execution_brief_capture_work_idx on private.execution_brief_input_captures(organization_id,work_id);
create index execution_brief_capture_session_idx on private.execution_brief_input_captures(organization_id,session_id);
create index execution_brief_capture_subject_idx on private.execution_brief_input_captures(human_subject_id);
create index execution_brief_source_version_idx on private.execution_brief_input_source_pins(organization_id,source_version_id);
create index execution_brief_source_rights_idx on private.execution_brief_input_source_pins(organization_id,rights_version_id);
create index execution_brief_intent_job_idx on private.execution_brief_write_intents(organization_id,producer_job_id);
create index execution_brief_binding_work_idx on private.execution_brief_native_bindings(organization_id,work_id);
create index execution_brief_binding_plan_idx on private.execution_brief_native_bindings(organization_id,plan_id);
do $ddl$ declare n text;begin
 foreach n in array array['execution_brief_input_captures','execution_brief_input_source_pins','execution_brief_write_intents','execution_brief_native_bindings','execution_brief_producer_completions'] loop
 execute format('alter table private.%I enable row level security',n);execute format('alter table private.%I force row level security',n);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);
 execute format('create policy %I on private.%I for select to authenticated using(false)',n||'_no_select',n);
 execute format('create policy %I on private.%I for insert to authenticated with check(false)',n||'_no_insert',n);
 execute format('create policy %I on private.%I for update to authenticated using(false) with check(false)',n||'_no_update',n);
 execute format('create policy %I on private.%I for delete to authenticated using(false)',n||'_no_delete',n);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_review_history_mutation_v1()',n||'_immutable',n);
 execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',n||'_no_truncate',n);
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',n||'_updated',n);
 execute format('create trigger %I after insert on private.%I for each row execute function private.capture_audit_event()',n||'_audit',n);
 end loop;
end $ddl$;

create function private.execution_brief_capture_context_v1(p_job uuid,p_capability text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job,p_capability);context jsonb;pack text;
begin
 if j.kind='agent_operation_brief' then context:=private.worker_load_agent_context_v5(p_job,p_capability);
 elsif j.kind='execution_brief_proposal' then context:=private.worker_load_execution_brief_proposal_v4(p_job,p_capability);
 else raise exception 'execution_brief_capture_kind_denied' using errcode='42501';end if;
 select b.source_pack_id into pack from private.gold_case_bindings b join public.document_intake_sessions s on(s.organization_id,s.capital_project_id)=(b.organization_id,b.capital_project_id) where(s.organization_id,s.id)=(j.organization_id,j.intake_session_id);
 return context||jsonb_build_object('source_pack_id',pack);
end $$;
-- Only inputs actually consumed by deterministic brief compilation. No task
-- progress, assistant drafts or output rows that this execution itself adds.
create function private.execution_brief_capture_projection_v1(p_context jsonb,p_kind text)
returns jsonb language sql immutable set search_path='' as $$
 select case p_kind when 'agent_operation_brief' then jsonb_build_object(
  'project',p_context->'project','session',p_context->'session_id','locale',p_context->'locale',
  'messageId',p_context->'message_id','message',p_context->'message',
  'documents',p_context->'documents','sourcePack',p_context->'source_pack_id',
  'plan',p_context->'active_plan','previousBrief',p_context->'latest_execution_brief',
  'sector',p_context->'governed_sector_context_inputs','receivables',p_context->'confirmed_receivables_scope')
 else jsonb_build_object('project',p_context->'project','locale',p_context->'locale','objective',p_context->'objective',
  'request',p_context->'initial_work_request','documents',p_context->'documents','plan',p_context->'plan',
  'target',p_context->'target_job_id','targetKind',p_context->'target_kind','sourcePack',p_context->'source_pack_id',
  'sector',p_context->'governed_sector_context_inputs','receivables',p_context->'confirmed_receivables_scope') end;
$$;
create function private.execution_brief_capture_source_ids_v1(p_context jsonb)
returns uuid[] language sql immutable set search_path='' as $$
 select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) from (
  select (x->>'id')::uuid id from jsonb_array_elements(coalesce(p_context->'documents','[]')) x
  union select (x->>'source_document_id')::uuid from jsonb_array_elements(coalesce(p_context#>'{governed_sector_context_inputs,candidates}','[]')) x where x->>'source_document_id' is not null
  union select (x->>'sourceDocumentId')::uuid from jsonb_array_elements(coalesce(p_context#>'{confirmed_receivables_scope,scope,sourceRevisions}','[]')) x
 ) sources;
$$;
create function private.execution_brief_capture_sources_current_v1(p_org uuid,p_capture uuid,p_subject uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare pin private.execution_brief_input_source_pins;r private.source_rights_versions;op text;
begin
 for pin in select * from private.execution_brief_input_source_pins where organization_id=p_org and capture_id=p_capture order by source_version_id loop
  select * into r from private.source_rights_versions where organization_id=p_org and source_version_id=pin.source_version_id order by revision desc limit 1 for share nowait;
  if r.id is distinct from pin.rights_version_id or not exists(select 1 from public.source_versions v join public.source_documents d on (d.organization_id,d.id)=(v.organization_id,v.id) where v.organization_id=p_org and v.id=pin.source_version_id and v.declared_sha256=pin.declared_sha256 and d.document_version=pin.source_document_version and d.sha256=pin.declared_sha256) then return false;end if;
  foreach op in array array['read','process','store','derive'] loop
   if not private.source_use_allowed_v1(p_org,pin.source_version_id,p_subject,op,'analysis') then return false;end if;
  end loop;
 end loop;
 return true;
end $$;
create function private.worker_capture_execution_brief_inputs_v1(p_job_id uuid,p_capability_token text,p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);s public.document_intake_sessions;c jsonb;fp text;inputfp text;subject uuid;capture private.execution_brief_input_captures;source uuid;v public.source_versions;d public.source_documents;r private.source_rights_versions;op text;
begin
 if p_request_id is null then raise exception 'execution_brief_capture_request_required' using errcode='22023';end if;
 if (j.kind='agent_operation_brief' and p_request_id is distinct from(j.payload->>'message_id')::uuid) or(j.kind='execution_brief_proposal' and p_request_id<>j.id) then raise exception 'execution_brief_capture_request_denied' using errcode='42501';end if;
 c:=private.execution_brief_capture_context_v1(j.id,p_capability_token);
 select * into strict s from public.document_intake_sessions where (organization_id,id)=(j.organization_id,j.intake_session_id);
 select created_by into subject from public.processing_runs where (organization_id,id)=(j.organization_id,j.processing_run_id);
 if subject is null or not private.capital_body_subject_allowed_v1(j.organization_id,s.capital_project_id,subject) then raise exception 'execution_brief_capture_subject_denied' using errcode='42501';end if;
 fp:=encode(extensions.digest(private.execution_brief_capture_projection_v1(c,j.kind)::text,'sha256'),'hex');
 inputfp:=private.execution_approval_input_fingerprint(j.organization_id,j.intake_session_id);
 select * into capture from private.execution_brief_input_captures where (organization_id,producer_job_id,request_id)=(j.organization_id,j.id,p_request_id);
 if capture.id is not null then
  if (capture.context_fingerprint,capture.input_fingerprint,capture.human_subject_id) is distinct from(fp,inputfp,subject) or not private.execution_brief_capture_sources_current_v1(j.organization_id,capture.id,subject) then raise exception 'execution_brief_capture_replay_changed' using errcode='40001';end if;
 else
  insert into private.execution_brief_input_captures(organization_id,work_id,session_id,producer_job_id,request_id,producer_kind,source_pack_id,human_subject_id,input_fingerprint,context_fingerprint)
  values(j.organization_id,s.capital_project_id,s.id,j.id,p_request_id,j.kind,c->>'source_pack_id',subject,inputfp,fp) returning * into capture;
  foreach source in array private.execution_brief_capture_source_ids_v1(c) loop
   select * into v from public.source_versions where (organization_id,id)=(j.organization_id,source) for share nowait;
   select * into d from public.source_documents where (organization_id,id)=(j.organization_id,source) for share nowait;
   select * into r from private.source_rights_versions where organization_id=j.organization_id and source_version_id=source order by revision desc limit 1 for share nowait;
   if v.id is null or d.id is null or r.id is null or v.declared_sha256 is null or v.declared_sha256 is distinct from d.sha256 then raise exception 'execution_brief_source_unproven' using errcode='42501';end if;
   foreach op in array array['read','process','store','derive'] loop
    if not private.source_use_allowed_v1(j.organization_id,source,subject,op,'analysis') then raise exception 'execution_brief_source_denied' using errcode='42501';end if;
   end loop;
   insert into private.execution_brief_input_source_pins(organization_id,capture_id,source_version_id,rights_version_id,source_document_version,declared_sha256) values(j.organization_id,capture.id,source,r.id,d.document_version,v.declared_sha256);
  end loop;
 end if;
 return jsonb_build_object('schemaVersion','execution-brief-input-capture.v1','captureId',capture.id,'producerJobId',j.id,'workId',capture.work_id,'inputFingerprint',inputfp,'contextFingerprint',fp,'context',c,'sourceCount',(select count(*) from private.execution_brief_input_source_pins where organization_id=j.organization_id and capture_id=capture.id));
end $$;
create function public.worker_capture_execution_brief_inputs_v1(p_job_id uuid,p_capability_token text,p_request_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.worker_capture_execution_brief_inputs_v1(p_job_id,p_capability_token,p_request_id);$$;
-- Writers/transaction v7/proposal v2 and the human command are assembled by the
-- same increment. No caller-controlled source list, publisher or human declaration.
do $grants$ declare p record;begin
 for p in select n.nspname,routine.proname,pg_get_function_identity_arguments(routine.oid) args from pg_proc routine join pg_namespace n on n.oid=routine.pronamespace where n.nspname in('private','public') and routine.proname in('execution_brief_capture_context_v1','execution_brief_capture_projection_v1','execution_brief_capture_source_ids_v1','execution_brief_capture_sources_current_v1','worker_capture_execution_brief_inputs_v1') loop
 execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',p.nspname,p.proname,p.args);
 if p.proname='worker_capture_execution_brief_inputs_v1' then execute format('grant execute on function %I.%I(%s) to authenticated',p.nspname,p.proname,p.args);end if;
 end loop;
end $grants$;

-- A write intent exists only in this transaction. A leaked/replayed capture UUID
-- cannot make an old API eligible to write later, or admit different output bytes.
create function private.authorize_execution_brief_write_v1(p_job uuid,p_capability text,p_capture uuid,p_internal jsonb,p_visible jsonb)
returns void language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job,p_capability);c private.execution_brief_input_captures;context jsonb;
begin
 select * into c from private.execution_brief_input_captures where (organization_id,id,producer_job_id)=(j.organization_id,p_capture,j.id);
 if c.id is null then raise exception 'execution_brief_capture_required' using errcode='42501';end if;
 context:=private.execution_brief_capture_context_v1(j.id,p_capability);
 if c.context_fingerprint is distinct from encode(extensions.digest(private.execution_brief_capture_projection_v1(context,j.kind)::text,'sha256'),'hex')
 or c.input_fingerprint is distinct from private.execution_approval_input_fingerprint(j.organization_id,j.intake_session_id)
 or not private.capital_body_subject_allowed_v1(j.organization_id,c.work_id,c.human_subject_id)
 or not private.execution_brief_capture_sources_current_v1(j.organization_id,c.id,c.human_subject_id)
 then raise exception 'execution_brief_capture_inputs_changed' using errcode='40001';end if;
 if p_internal is null or p_visible is null then raise exception 'execution_brief_capture_product_required' using errcode='22023';end if;
 insert into private.execution_brief_write_intents(organization_id,capture_id,producer_job_id,transaction_id,internal_fingerprint,visible_fingerprint)
 values(j.organization_id,c.id,j.id,txid_current(),encode(extensions.digest(p_internal::text,'sha256'),'hex'),encode(extensions.digest(p_visible::text,'sha256'),'hex'));
end $$;

-- Lease-independent consumed-state proof for human review and dispatch. The
-- writer fixes this only after its transaction-local precursor intent was checked.
-- It records hashes, never a second permanent context or a replacement precursor.
create function private.execution_brief_post_write_context_fingerprint_v1(p_org uuid,p_session uuid,p_work uuid,p_plan uuid)
returns text language sql stable security definer set search_path='' as $$
 select encode(extensions.digest(jsonb_build_object(
  'schemaVersion','execution-brief-post-write-context.v1',
  'input',private.execution_approval_input_fingerprint(p_org,p_session),
  'work',(select to_jsonb(w)-array['created_at','updated_at','status'] from public.capital_projects w where(w.organization_id,w.id)=(p_org,p_work)),
  'plan',(select jsonb_build_array(p.id,p.plan_fingerprint,p.snapshot) from public.capital_project_plans p where(p.organization_id,p.id,p.capital_project_id)=(p_org,p_plan,p_work)),
  'sourcePack',(select b.source_pack_id from private.gold_case_bindings b where(b.organization_id,b.capital_project_id)=(p_org,p_work)),
  'receivables',private.receivables_evidence_scope_context(p_org,p_session)
 )::text,'sha256'),'hex');
$$;
revoke all on function private.execution_brief_post_write_context_fingerprint_v1(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

alter function private.worker_record_capital_project_execution_brief_v1(uuid,text,jsonb,jsonb,uuid,jsonb) rename to write_execution_brief_before_native_capture_v1;
revoke all on function private.write_execution_brief_before_native_capture_v1(uuid,text,jsonb,jsonb,uuid,jsonb) from public,anon,authenticated,service_role;
create function private.worker_record_capital_project_execution_brief_v1(p_job_id uuid,p_capability_token text,p_internal_snapshot jsonb,p_visible_snapshot jsonb,p_parent_brief_id uuid default null,p_change_summary jsonb default '[]')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);i private.execution_brief_write_intents;result jsonb;b public.capital_project_execution_briefs;p public.capital_project_plans;c private.execution_brief_input_captures;
begin
 select * into i from private.execution_brief_write_intents where organization_id=j.organization_id and producer_job_id=j.id and transaction_id=txid_current()
 and internal_fingerprint=encode(extensions.digest(p_internal_snapshot::text,'sha256'),'hex') and visible_fingerprint=encode(extensions.digest(p_visible_snapshot::text,'sha256'),'hex');
 if i.id is null then raise exception 'execution_brief_native_producer_required' using errcode='42501';end if;
 select * into strict c from private.execution_brief_input_captures where (organization_id,id)=(j.organization_id,i.capture_id);
 result:=private.write_execution_brief_before_native_capture_v1(j.id,p_capability_token,p_internal_snapshot,p_visible_snapshot,p_parent_brief_id,p_change_summary);
 if coalesce((result->>'replayed')::boolean,false) then raise exception 'execution_brief_new_capture_requires_new_product_revision' using errcode='40001';end if; -- Never attach a new precursor to an older product.
 select * into strict b from public.capital_project_execution_briefs where (organization_id,id)=(j.organization_id,(result->>'id')::uuid);
 select * into strict p from public.capital_project_plans where (organization_id,id)=(j.organization_id,b.plan_id);
 if b.capital_project_id<>c.work_id or b.internal_snapshot is distinct from p_internal_snapshot or b.visible_snapshot is distinct from p_visible_snapshot then raise exception 'execution_brief_native_output_mismatch' using errcode='23514';end if;
 insert into private.execution_brief_native_bindings(organization_id,work_id,capture_id,execution_brief_id,plan_id,brief_fingerprint,storage_fingerprint,plan_fingerprint,post_write_input_fingerprint,post_write_context_fingerprint)
 values(j.organization_id,c.work_id,c.id,b.id,p.id,b.brief_fingerprint,b.storage_fingerprint,p.plan_fingerprint,
 private.execution_approval_input_fingerprint(j.organization_id,c.session_id),
 private.execution_brief_post_write_context_fingerprint_v1(j.organization_id,c.session_id,c.work_id,p.id));
 if not private.execution_brief_capture_sources_current_v1(j.organization_id,c.id,c.human_subject_id) then raise exception 'execution_brief_capture_sources_changed' using errcode='42501';end if;
 return result||jsonb_build_object('captureId',c.id);
end $$;
revoke all on function private.worker_record_capital_project_execution_brief_v1(uuid,text,jsonb,jsonb,uuid,jsonb),private.authorize_execution_brief_write_v1(uuid,text,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
-- The retired public writer is closed too; native v2/v7 call the guarded
-- primitive through their owner transaction, never an authenticated bypass.
revoke all on function public.worker_record_capital_project_execution_brief_v1(uuid,text,jsonb,jsonb,uuid,jsonb) from public,anon,authenticated,service_role;
create function private.record_execution_brief_producer_completion_v1(p_job uuid,p_capture uuid,p_result jsonb)
returns void language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;c private.execution_brief_input_captures;n private.execution_brief_native_bindings;d public.capital_project_execution_brief_dispatches;v_brief_id uuid;v_message_id uuid;v_proposal_id uuid;v_target_job_id uuid;
begin
 select * into strict j from public.processing_jobs where id=p_job;
 select * into c from private.execution_brief_input_captures where(organization_id,id,producer_job_id)=(j.organization_id,p_capture,j.id);
 select * into n from private.execution_brief_native_bindings where(organization_id,capture_id)=(j.organization_id,c.id);
 if c.id is null or n.id is null or not exists(select 1 from private.execution_brief_write_intents i where(i.organization_id,i.capture_id,i.producer_job_id,i.transaction_id)=(j.organization_id,c.id,j.id,txid_current())) then raise exception 'execution_brief_completion_unproven' using errcode='42501';end if;
 v_brief_id:=coalesce((p_result#>>'{execution_brief,id}')::uuid,(p_result->>'execution_brief_id')::uuid);
 v_message_id:=(p_result->>'message_id')::uuid;v_proposal_id:=(p_result->>'proposal_id')::uuid;
 v_target_job_id:=coalesce((p_result#>>'{activation,job_id}')::uuid,(p_result->>'processing_job_id')::uuid);
 if v_brief_id is distinct from n.execution_brief_id or(j.kind='agent_operation_brief' and(v_message_id is null or not exists(select 1 from public.agent_messages m where(m.organization_id,m.id,m.intake_session_id,m.reply_to_message_id)=(j.organization_id,v_message_id,c.session_id,c.request_id) and m.role='assistant' and m.status='completed')))
 or(j.kind='execution_brief_proposal' and(v_message_id is not null or v_proposal_id is not null)) then raise exception 'execution_brief_completion_result_mismatch' using errcode='23514';end if;
 if v_proposal_id is not null and not exists(select 1 from public.agent_change_proposals p where(p.organization_id,p.id,p.intake_session_id)=(j.organization_id,v_proposal_id,c.session_id)) then raise exception 'execution_brief_completion_result_mismatch' using errcode='23514';end if;
 select * into d from public.capital_project_execution_brief_dispatches where(organization_id,execution_brief_id,capital_project_id)=(j.organization_id,n.execution_brief_id,c.work_id);
 if v_target_job_id is not null and(d.id is null or d.processing_job_id<>v_target_job_id) or p_result#>>'{approval,dispatch_id}' is not null and(p_result#>>'{approval,dispatch_id}')::uuid is distinct from d.id then raise exception 'execution_brief_completion_dispatch_mismatch' using errcode='23514';end if;
 insert into private.execution_brief_producer_completions(organization_id,capture_id,producer_job_id,request_id,execution_brief_id,plan_id,assistant_message_id,proposal_id,activation_job_id,dispatch_id)
 values(j.organization_id,c.id,j.id,c.request_id,n.execution_brief_id,n.plan_id,v_message_id,v_proposal_id,v_target_job_id,d.id);
end$$;
revoke all on function private.record_execution_brief_producer_completion_v1(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- Historical briefs retain their existing read regime. No new write is allowed
-- through any of the older response/writer APIs without this native transaction.
create function private.worker_record_execution_brief_proposal_v2(p_job_id uuid,p_capability_token text,p_capture_id uuid,p_internal_snapshot jsonb,p_visible_snapshot jsonb,p_expected_input_fingerprint text,p_plan jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.authorize_execution_brief_write_v1(p_job_id,p_capability_token,p_capture_id,p_internal_snapshot,p_visible_snapshot);
 result:=private.worker_record_execution_brief_proposal_v1(p_job_id,p_capability_token,p_internal_snapshot,p_visible_snapshot,p_expected_input_fingerprint,p_plan);
 perform private.record_execution_brief_producer_completion_v1(p_job_id,p_capture_id,result);
 return result||jsonb_build_object('captureId',p_capture_id);
end $$;
create function public.worker_record_execution_brief_proposal_v2(p_job_id uuid,p_capability_token text,p_capture_id uuid,p_internal_snapshot jsonb,p_visible_snapshot jsonb,p_expected_input_fingerprint text,p_plan jsonb default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.worker_record_execution_brief_proposal_v2(p_job_id,p_capability_token,p_capture_id,p_internal_snapshot,p_visible_snapshot,p_expected_input_fingerprint,p_plan);$$;
create function private.worker_record_agent_response_and_activate_v7(p_job_id uuid,p_capability_token text,p_capture_id uuid,p_assistant_message_id uuid,p_response jsonb,p_proposal jsonb default null,p_activation jsonb default null,p_execution_brief_internal jsonb default null,p_execution_brief_visible jsonb default null,p_execution_brief_change_summary jsonb default '[]',p_expected_input_fingerprint text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb;
begin
 if p_execution_brief_internal is not null or p_execution_brief_visible is not null or p_activation is not null then
 perform private.authorize_execution_brief_write_v1(p_job_id,p_capability_token,p_capture_id,p_execution_brief_internal,p_execution_brief_visible);
 elsif p_capture_id is not null then raise exception 'execution_brief_capture_without_product' using errcode='22023';end if;
 result:=private.worker_record_agent_response_and_activate_v6(p_job_id,p_capability_token,p_assistant_message_id,p_response,p_proposal,p_activation,p_execution_brief_internal,p_execution_brief_visible,p_execution_brief_change_summary,p_expected_input_fingerprint);
 if p_capture_id is not null then perform private.record_execution_brief_producer_completion_v1(p_job_id,p_capture_id,result);end if;
 return result;
end $$;
create function public.worker_record_agent_response_and_activate_v7(p_job_id uuid,p_capability_token text,p_capture_id uuid,p_assistant_message_id uuid,p_response jsonb,p_proposal jsonb default null,p_activation jsonb default null,p_execution_brief_internal jsonb default null,p_execution_brief_visible jsonb default null,p_execution_brief_change_summary jsonb default '[]',p_expected_input_fingerprint text default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.worker_record_agent_response_and_activate_v7(p_job_id,p_capability_token,p_capture_id,p_assistant_message_id,p_response,p_proposal,p_activation,p_execution_brief_internal,p_execution_brief_visible,p_execution_brief_change_summary,p_expected_input_fingerprint);$$;
do $grants$ declare p record;begin
 for p in select n.nspname,routine.proname,pg_get_function_identity_arguments(routine.oid) args from pg_proc routine join pg_namespace n on n.oid=routine.pronamespace where n.nspname in('private','public') and routine.proname in('worker_record_execution_brief_proposal_v2','worker_record_agent_response_and_activate_v7') loop
 execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',p.nspname,p.proname,p.args);
 execute format('grant execute on function %I.%I(%s) to authenticated',p.nspname,p.proname,p.args);
 end loop;
end $grants$;

create table private.execution_brief_review_projections (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,
 execution_brief_id uuid not null,capture_id uuid not null,dispatch_id uuid not null,
 decision_id uuid not null,basis_receipt_id uuid not null,command_id uuid not null,
 actor_id uuid not null references auth.users(id),prepared_by uuid not null references auth.users(id),
 self_approval_declared boolean not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,execution_brief_id),unique(organization_id,command_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,execution_brief_id) references public.capital_project_execution_briefs(organization_id,id),
 foreign key(organization_id,capture_id) references private.execution_brief_input_captures(organization_id,id),
 foreign key(organization_id,dispatch_id) references public.capital_project_execution_brief_dispatches(organization_id,id),
 foreign key(organization_id,decision_id) references public.work_decisions(organization_id,id),
 foreign key(organization_id,basis_receipt_id) references private.review_basis_receipts(organization_id,id)
);
create index execution_brief_review_work_idx on private.execution_brief_review_projections(organization_id,work_id);
create index execution_brief_review_capture_idx on private.execution_brief_review_projections(organization_id,capture_id);
create index execution_brief_review_dispatch_idx on private.execution_brief_review_projections(organization_id,dispatch_id);
create index execution_brief_review_decision_idx on private.execution_brief_review_projections(organization_id,decision_id);
create index execution_brief_review_basis_idx on private.execution_brief_review_projections(organization_id,basis_receipt_id);
create index execution_brief_review_actor_idx on private.execution_brief_review_projections(actor_id);
create index execution_brief_review_preparer_idx on private.execution_brief_review_projections(prepared_by);
alter table private.execution_brief_review_projections enable row level security;
alter table private.execution_brief_review_projections force row level security;
revoke all on private.execution_brief_review_projections from public,anon,authenticated,service_role;
create policy execution_brief_review_no_select on private.execution_brief_review_projections for select to authenticated using(false);
create policy execution_brief_review_no_insert on private.execution_brief_review_projections for insert to authenticated with check(false);
create policy execution_brief_review_no_update on private.execution_brief_review_projections for update to authenticated using(false) with check(false);
create policy execution_brief_review_no_delete on private.execution_brief_review_projections for delete to authenticated using(false);
create trigger execution_brief_review_immutable before update or delete on private.execution_brief_review_projections for each row execute function private.reject_review_history_mutation_v1();
create trigger execution_brief_review_no_truncate before truncate on private.execution_brief_review_projections for each statement execute function private.reject_review_history_mutation_v1();
create trigger execution_brief_review_updated before update on private.execution_brief_review_projections for each row execute function private.set_updated_at();
create trigger execution_brief_review_audit after insert on private.execution_brief_review_projections for each row execute function private.capture_audit_event();

create function private.execution_brief_native_basis_current_v1(p_org uuid,p_brief uuid,p_subject uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare n private.execution_brief_native_bindings;c private.execution_brief_input_captures;
begin
 select * into n from private.execution_brief_native_bindings where (organization_id,execution_brief_id)=(p_org,p_brief);
 if n.id is null then return false;end if;
 select * into strict c from private.execution_brief_input_captures where (organization_id,id)=(p_org,n.capture_id);
 return private.capital_body_subject_allowed_v1(p_org,n.work_id,p_subject)
 and private.capital_body_subject_allowed_v1(p_org,n.work_id,c.human_subject_id)
 and private.execution_brief_capture_sources_current_v1(p_org,c.id,p_subject)
 and private.execution_brief_capture_sources_current_v1(p_org,c.id,c.human_subject_id)
 and c.source_pack_id is not distinct from(select b.source_pack_id from private.gold_case_bindings b where(b.organization_id,b.capital_project_id)=(p_org,c.work_id))
 and n.post_write_input_fingerprint=private.execution_approval_input_fingerprint(p_org,c.session_id)
 and n.post_write_context_fingerprint=private.execution_brief_post_write_context_fingerprint_v1(p_org,c.session_id,n.work_id,n.plan_id)
 and exists(select 1 from public.capital_project_execution_briefs b join public.capital_project_plans p on (p.organization_id,p.id)=(b.organization_id,b.plan_id)
 where b.organization_id=p_org and b.id=p_brief and b.capital_project_id=n.work_id and b.brief_fingerprint=n.brief_fingerprint and b.storage_fingerprint=n.storage_fingerprint
 and p.id=n.plan_id and p.plan_fingerprint=n.plan_fingerprint and p.status='active');
end $$;
create function private.execution_brief_native_review_effective_v1(p_org uuid,p_brief uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare n private.execution_brief_native_bindings;p private.execution_brief_review_projections;d public.work_decisions;precedence jsonb;
begin
 select * into n from private.execution_brief_native_bindings where (organization_id,execution_brief_id)=(p_org,p_brief);
 if n.id is null then return true;end if;
 select * into p from private.execution_brief_review_projections where (organization_id,execution_brief_id)=(p_org,p_brief);
 if p.id is null then return false;end if;
 select * into d from public.work_decisions where (organization_id,id)=(p_org,p.decision_id);
 precedence:=private.work_decision_precedence_v1(p_org,p.work_id,'execution:'||p_brief::text);
 return d.kind='authorize_execution' and d.outcome='approved' and d.decided_by=p.actor_id and d.command_id=p.command_id
 and precedence->>'state'='current' and precedence->>'currentId'=d.id::text
 and private.execution_brief_native_basis_current_v1(p_org,p_brief,p.actor_id)
 and exists(select 1 from private.review_basis_receipts b where (b.organization_id,b.id,b.work_id)=(p_org,p.basis_receipt_id,p.work_id)
 and b.basis_kind='execution' and b.basis_reference=d.basis->'execution'
 and b.source_count=(select count(*) from private.review_basis_source_links l where (l.organization_id,l.receipt_id)=(p_org,b.id)));
end $$;
alter function private.approve_advisor_execution_brief_v1(uuid,uuid,text,uuid) rename to apply_execution_brief_approval_before_native_capture_v1;
revoke all on function private.apply_execution_brief_approval_before_native_capture_v1(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
create function private.approve_advisor_execution_brief_v1(p_project_id uuid,p_execution_brief_id uuid,p_expected_fingerprint text,p_command_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
 if exists(select 1 from private.execution_brief_native_bindings where work_id=p_project_id and execution_brief_id=p_execution_brief_id) then raise exception 'execution_brief_native_review_required' using errcode='42501';end if;
 return private.apply_execution_brief_approval_before_native_capture_v1(p_project_id,p_execution_brief_id,p_expected_fingerprint,p_command_id);
end $$;

-- A pre-approval dispatch has no approved_brief_fingerprint yet. Validate
-- against the actual captured output instead of filling approval fields early.
create function private.record_execution_brief_native_receipt_v1(p_org uuid,p_work uuid,p_brief uuid,p_reference jsonb,p_versions uuid[])
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare receipt private.review_basis_receipts;expected uuid[];actual uuid[];reference_hash text;
begin
 if not exists(select 1 from private.execution_brief_native_bindings n join public.capital_project_execution_brief_dispatches d on (d.organization_id,d.execution_brief_id,d.capital_project_id)=(n.organization_id,n.execution_brief_id,n.work_id)
 where (n.organization_id,n.work_id,n.execution_brief_id)=(p_org,p_work,p_brief) and n.brief_fingerprint=p_reference->>'briefFingerprint' and d.payload_fingerprint=p_reference->>'payloadFingerprint' and d.input_fingerprint=p_reference->>'inputFingerprint') then raise exception 'execution_brief_native_receipt_reference_missing' using errcode='23514';end if;
 select coalesce(array_agg(pin.source_version_id order by pin.source_version_id),'{}'::uuid[]) into expected from private.execution_brief_input_source_pins pin join private.execution_brief_native_bindings n on (n.organization_id,n.capture_id)=(pin.organization_id,pin.capture_id) where (n.organization_id,n.work_id,n.execution_brief_id)=(p_org,p_work,p_brief);
 if expected is distinct from p_versions then raise exception 'execution_brief_native_receipt_sources_mismatch' using errcode='23514';end if;
 reference_hash:=encode(extensions.digest(p_reference::text,'sha256'),'hex');
 select * into receipt from private.review_basis_receipts where (organization_id,work_id,basis_kind,reference_fingerprint)=(p_org,p_work,'execution',reference_hash);
 if receipt.id is not null then
 select coalesce(array_agg(source_version_id order by source_version_id),'{}'::uuid[]) into actual from private.review_basis_source_links where (organization_id,receipt_id)=(p_org,receipt.id);
 if receipt.basis_reference is distinct from p_reference or receipt.source_count<>cardinality(expected) or actual<>expected then raise exception 'execution_brief_native_receipt_replay_mismatch' using errcode='23505';end if;
 return receipt.id;
 end if;
 insert into private.review_basis_receipts(organization_id,work_id,basis_kind,basis_reference,reference_fingerprint,source_count,producer) values(p_org,p_work,'execution',p_reference,reference_hash,cardinality(expected),'execution_brief_dispatch') returning * into receipt;
 insert into private.review_basis_source_links(organization_id,receipt_id,source_version_id) select p_org,receipt.id,v from unnest(expected) v;
 return receipt.id;
end $$;
revoke all on function private.record_execution_brief_native_receipt_v1(uuid,uuid,uuid,jsonb,uuid[]) from public,anon,authenticated,service_role;

create function private.approve_advisor_execution_brief_v2(p_project_id uuid,p_execution_brief_id uuid,p_expected_fingerprint text,p_expected_capture_id uuid,p_command_id uuid,p_self_approval_declared boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare org uuid;actor uuid:=auth.uid();n private.execution_brief_native_bindings;c private.execution_brief_input_captures;dispatch public.capital_project_execution_brief_dispatches;policy jsonb;mode text;prepared uuid;versions uuid[];basis jsonb;receipt uuid;decision jsonb;projection private.execution_brief_review_projections;result jsonb;
begin
 select organization_id into org from public.capital_projects where id=p_project_id and status<>'archived';
 if org is null or actor is null or p_command_id is null or p_self_approval_declared is null or not private.can_access_resource_v1(org,p_project_id,'read') then raise exception 'execution_brief_review_forbidden' using errcode='42501';end if;
 -- Same ordering as the existing worker/approval transaction: job, session,
 -- work, dispatch. Capture is immutable; rights get share locks below.
 select * into dispatch from public.capital_project_execution_brief_dispatches where (organization_id,capital_project_id,execution_brief_id)=(org,p_project_id,p_execution_brief_id);
 if dispatch.id is null then raise exception 'execution_brief_dispatch_missing' using errcode='42501';end if;
 perform 1 from public.processing_jobs where (organization_id,id)=(org,dispatch.processing_job_id) for update;
 perform 1 from public.document_intake_sessions s join public.processing_jobs j on (j.organization_id,j.intake_session_id)=(s.organization_id,s.id) where j.organization_id=org and j.id=dispatch.processing_job_id for update of s;
 perform 1 from public.capital_projects where (organization_id,id)=(org,p_project_id) for update;
 select * into dispatch from public.capital_project_execution_brief_dispatches where (organization_id,id)=(org,dispatch.id) for update;
 perform 1 from auth.users where id=actor and deleted_at is null and(banned_until is null or banned_until<=clock_timestamp()) for share nowait;
 if not found then raise exception 'execution_brief_review_forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||org::text,0));
 perform 1 from public.organization_memberships where organization_id=org and user_id=actor and status='active' for share nowait;
 if not found or not private.can_access_resource_v1(org,p_project_id,'read') then raise exception 'execution_brief_review_forbidden' using errcode='42501';end if;
 select * into n from private.execution_brief_native_bindings where (organization_id,work_id,execution_brief_id,capture_id)=(org,p_project_id,p_execution_brief_id,p_expected_capture_id);
 if n.id is null or n.brief_fingerprint is distinct from p_expected_fingerprint or not private.execution_brief_native_basis_current_v1(org,p_execution_brief_id,actor) then raise exception 'execution_brief_native_basis_changed' using errcode='40001';end if;
 policy:=private.review_policy_snapshot_v1(org,p_project_id,actor);
 if ((policy->>'assignmentRequired')::boolean and not(policy->'roles'?'approver')) or(not(policy->>'assignmentRequired')::boolean and not private.can_access_resource_v1(org,p_project_id,'work')) then raise exception 'review_assignment_required' using errcode='42501';end if;
 prepared:=private.execution_brief_preparer_v1(p_execution_brief_id);
 if prepared is null then raise exception 'execution_brief_preparer_unproven' using errcode='42501';end if;
 if prepared=actor and(not(policy->>'selfApprovalAllowed')::boolean or not p_self_approval_declared) then raise exception 'capital_project_self_approval_forbidden' using errcode='42501';end if;
 mode:=case when(policy->>'assignmentRequired')::boolean then 'assigned' when(policy->>'selfApprovalAllowed')::boolean then 'individual' else 'open' end;
 select * into projection from private.execution_brief_review_projections where (organization_id,command_id)=(org,p_command_id);
 if projection.id is not null then
 if (projection.work_id,projection.execution_brief_id,projection.capture_id,projection.actor_id,projection.self_approval_declared) is distinct from(p_project_id,p_execution_brief_id,p_expected_capture_id,actor,p_self_approval_declared) or not private.execution_brief_native_review_effective_v1(org,p_execution_brief_id) then raise exception 'execution_brief_native_replay_changed' using errcode='23505';end if;
 return jsonb_build_object('status','already_approved','processing_job_id',dispatch.processing_job_id,'decisionId',projection.decision_id,'basisReceiptId',projection.basis_receipt_id,'captureId',projection.capture_id,'replayed',true);
 end if;
 if exists(select 1 from private.execution_brief_review_projections where (organization_id,execution_brief_id)=(org,p_execution_brief_id)) then raise exception 'execution_brief_native_review_already_fixed' using errcode='40001';end if;
 select coalesce(array_agg(source_version_id order by source_version_id),'{}'::uuid[]) into versions from private.execution_brief_input_source_pins where organization_id=org and capture_id=n.capture_id;
 basis:=jsonb_build_object('briefFingerprint',n.brief_fingerprint,'payloadFingerprint',dispatch.payload_fingerprint,'inputFingerprint',dispatch.input_fingerprint);
 receipt:=private.record_execution_brief_native_receipt_v1(org,p_project_id,p_execution_brief_id,basis,versions);
 decision:=private.append_work_decision_v1(org,p_project_id,'execution:'||p_execution_brief_id::text,'authorize_execution',jsonb_build_object('artifacts','[]'::jsonb,'milestones','[]'::jsonb,'assessments','[]'::jsonb,'decisions','[]'::jsonb,'execution',basis,'configuration',null),array['queue_execution']::text[],'in_product',null,null,actor,null,p_command_id,mode,policy,jsonb_build_object('table','capital_project_execution_briefs','id',p_execution_brief_id),p_outcome=>'approved');
 if(decision->>'contested')::boolean then raise exception 'execution_brief_native_review_contested' using errcode='40001';end if;
 insert into private.execution_brief_review_projections(organization_id,work_id,execution_brief_id,capture_id,dispatch_id,decision_id,basis_receipt_id,command_id,actor_id,prepared_by,self_approval_declared)
 values(org,p_project_id,p_execution_brief_id,n.capture_id,dispatch.id,(decision->>'decisionId')::uuid,receipt,p_command_id,actor,prepared,p_self_approval_declared);
 result:=private.apply_execution_brief_approval_before_native_capture_v1(p_project_id,p_execution_brief_id,p_expected_fingerprint,p_command_id);
 if not exists(select 1 from public.capital_project_execution_brief_dispatches where (organization_id,id,approval_command_id,accepted_by)=(org,dispatch.id,p_command_id,actor) and accepted_at is not null) or not private.execution_brief_native_review_effective_v1(org,p_execution_brief_id) then raise exception 'execution_brief_native_effect_missing' using errcode='23514';end if;
 return result||jsonb_build_object('decisionId',decision->'decisionId','basisReceiptId',receipt,'captureId',n.capture_id,'replayed',false);
end $$;
create function public.approve_advisor_execution_brief_v2(p_project_id uuid,p_execution_brief_id uuid,p_expected_fingerprint text,p_expected_capture_id uuid,p_command_id uuid,p_self_approval_declared boolean)
returns jsonb language sql security invoker set search_path='' as $$select private.approve_advisor_execution_brief_v2(p_project_id,p_execution_brief_id,p_expected_fingerprint,p_expected_capture_id,p_command_id,p_self_approval_declared);$$;

alter function private.execution_dispatch_is_current(uuid,boolean) rename to execution_dispatch_before_native_brief_review_v1;
revoke all on function private.execution_dispatch_before_native_brief_review_v1(uuid,boolean) from public,anon,authenticated,service_role;
create function private.execution_dispatch_is_current(p_job_id uuid,p_require_accepted boolean default true)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare d public.capital_project_execution_brief_dispatches;
begin
 if not private.execution_dispatch_before_native_brief_review_v1(p_job_id,p_require_accepted) then return false;end if;
 select * into d from public.capital_project_execution_brief_dispatches where processing_job_id=p_job_id;
 if exists(select 1 from private.execution_brief_native_bindings where (organization_id,execution_brief_id)=(d.organization_id,d.execution_brief_id)) then
  if not private.execution_brief_native_basis_current_v1(d.organization_id,d.execution_brief_id,coalesce(d.accepted_by,private.execution_brief_preparer_v1(d.execution_brief_id))) then return false;end if;
  if p_require_accepted and not private.execution_brief_native_review_effective_v1(d.organization_id,d.execution_brief_id) then return false;end if;
 end if;
 return true;
end $$;
do $grants$ declare p record;begin
 for p in select n.nspname,routine.proname,pg_get_function_identity_arguments(routine.oid) args from pg_proc routine join pg_namespace n on n.oid=routine.pronamespace where n.nspname in('private','public') and routine.proname in('execution_brief_native_basis_current_v1','execution_brief_native_review_effective_v1','approve_advisor_execution_brief_v1','approve_advisor_execution_brief_v2','execution_dispatch_is_current') loop
 execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',p.nspname,p.proname,p.args);
 if p.proname in('approve_advisor_execution_brief_v1','approve_advisor_execution_brief_v2') then execute format('grant execute on function %I.%I(%s) to authenticated',p.nspname,p.proname,p.args);end if;
 end loop;
end $grants$;

create function private.read_execution_brief_review_basis_v2(p_project_id uuid,p_execution_brief_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare org uuid;actor uuid:=auth.uid();n private.execution_brief_native_bindings;c private.execution_brief_input_captures;d public.capital_project_execution_brief_dispatches;prepared uuid;policy jsonb;
begin
 select organization_id into org from public.capital_projects where id=p_project_id and status<>'archived';
 if org is null or actor is null or not private.can_access_resource_v1(org,p_project_id,'read') then raise exception 'execution_brief_review_forbidden' using errcode='42501';end if;
 select * into n from private.execution_brief_native_bindings where (organization_id,work_id,execution_brief_id)=(org,p_project_id,p_execution_brief_id);
 if n.id is null or not private.execution_brief_native_basis_current_v1(org,p_execution_brief_id,actor) then raise exception 'execution_brief_native_basis_changed' using errcode='42501';end if;
 select * into strict c from private.execution_brief_input_captures where (organization_id,id)=(org,n.capture_id);
 select * into d from public.capital_project_execution_brief_dispatches where (organization_id,capital_project_id,execution_brief_id)=(org,p_project_id,p_execution_brief_id);
 if d.id is null then raise exception 'execution_brief_dispatch_missing' using errcode='42501';end if;
 prepared:=private.execution_brief_preparer_v1(p_execution_brief_id);policy:=private.review_policy_snapshot_v1(org,p_project_id,actor);
 return jsonb_build_object('schemaVersion','execution-brief-review-basis.v2','workId',p_project_id,'executionBriefId',p_execution_brief_id,'captureId',c.id,
 'briefFingerprint',n.brief_fingerprint,'payloadFingerprint',d.payload_fingerprint,'inputFingerprint',c.input_fingerprint,
 'preparedBy',prepared,'viewerId',actor,'policy',policy,'workAccess',private.can_access_resource_v1(org,p_project_id,'work'),
 'sourceCount',(select count(*) from private.execution_brief_input_source_pins where organization_id=org and capture_id=c.id),
 'approvalEffective',d.accepted_at is not null and private.execution_brief_native_review_effective_v1(org,p_execution_brief_id));
end $$;
create function public.read_execution_brief_review_basis_v2(p_project_id uuid,p_execution_brief_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.read_execution_brief_review_basis_v2(p_project_id,p_execution_brief_id);$$;
revoke all on function private.read_execution_brief_review_basis_v2(uuid,uuid),public.read_execution_brief_review_basis_v2(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.read_execution_brief_review_basis_v2(uuid,uuid),public.read_execution_brief_review_basis_v2(uuid,uuid) to authenticated;

create function private.worker_recover_execution_brief_product_v1(p_job_id uuid,p_capability_token text,p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);c private.execution_brief_input_captures;n private.execution_brief_native_bindings;v private.execution_brief_producer_completions;product jsonb;
begin
 if j.kind not in('agent_operation_brief','execution_brief_proposal') or j.status<>'leased' or j.leased_account_user_id is distinct from auth.uid() or j.lease_expires_at<=clock_timestamp() or not private.job_authority_is_current_v1(j.id)
 or p_request_id is null or(j.kind='agent_operation_brief' and p_request_id is distinct from(j.payload->>'message_id')::uuid) or(j.kind='execution_brief_proposal' and p_request_id<>j.id) then raise exception 'execution_brief_recovery_denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock_shared(hashtextextended('resource-policy:'||j.organization_id::text,0)) then raise exception 'execution_brief_recovery_retry' using errcode='40001';end if;
 select * into c from private.execution_brief_input_captures where(organization_id,producer_job_id,request_id)=(j.organization_id,j.id,p_request_id);
 if c.id is null then return jsonb_build_object('schemaVersion','execution-brief-product-recovery.v1','state','none','producerJobId',j.id,'requestId',p_request_id,'captureId',null,'product',null);end if;
 perform 1 from public.document_intake_sessions where(organization_id,id)=(j.organization_id,c.session_id) for share nowait;
 perform 1 from public.capital_projects where(organization_id,id)=(j.organization_id,c.work_id) for share nowait;
 if not private.capital_body_subject_allowed_v1(j.organization_id,c.work_id,j.authorization_subject_id) or not private.capital_body_subject_allowed_v1(j.organization_id,c.work_id,c.human_subject_id) or not private.execution_brief_capture_sources_current_v1(j.organization_id,c.id,j.authorization_subject_id) or not private.execution_brief_capture_sources_current_v1(j.organization_id,c.id,c.human_subject_id) then raise exception 'execution_brief_recovery_denied' using errcode='42501';end if;
 select * into v from private.execution_brief_producer_completions where(organization_id,capture_id,producer_job_id,request_id)=(j.organization_id,c.id,j.id,p_request_id);
 select * into n from private.execution_brief_native_bindings where(organization_id,capture_id)=(j.organization_id,c.id);
 if v.id is null then
 if n.id is not null then raise exception 'execution_brief_recovery_completion_missing' using errcode='42501';end if;
 -- No product was committed. Do not re-run a model or invent its missing response.
 if c.input_fingerprint is distinct from private.execution_approval_input_fingerprint(j.organization_id,c.session_id) or c.context_fingerprint is distinct from encode(extensions.digest(private.execution_brief_capture_projection_v1(private.execution_brief_capture_context_v1(j.id,p_capability_token),j.kind)::text,'sha256'),'hex') then raise exception 'execution_brief_recovery_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','execution-brief-product-recovery.v1','state','unresolved','producerJobId',j.id,'requestId',p_request_id,'captureId',c.id,'product',null);
 end if;
 if n.id is null or(v.execution_brief_id,v.plan_id) is distinct from(n.execution_brief_id,n.plan_id) or not private.execution_brief_native_basis_current_v1(j.organization_id,n.execution_brief_id,j.authorization_subject_id)
 or exists(select 1 from public.capital_project_execution_briefs newer where newer.organization_id=j.organization_id and newer.capital_project_id=c.work_id and newer.brief_version>(select brief_version from public.capital_project_execution_briefs where organization_id=j.organization_id and id=n.execution_brief_id))
 or exists(select 1 from public.capital_project_execution_brief_events e where(e.organization_id,e.execution_brief_id)=(j.organization_id,n.execution_brief_id) and e.event_type in('edit_requested','cancelled','superseded')) then raise exception 'execution_brief_recovery_denied' using errcode='42501';end if;
 if v.dispatch_id is not null and not exists(select 1 from public.capital_project_execution_brief_dispatches d where(d.organization_id,d.id,d.execution_brief_id,d.capital_project_id,d.plan_id)=(j.organization_id,v.dispatch_id,n.execution_brief_id,c.work_id,n.plan_id) and(v.activation_job_id is null or d.processing_job_id=v.activation_job_id) and private.execution_dispatch_is_current(d.processing_job_id,false)) then raise exception 'execution_brief_recovery_denied' using errcode='42501';end if;
 if v.assistant_message_id is not null and not exists(select 1 from public.agent_messages m where(m.organization_id,m.id,m.intake_session_id,m.reply_to_message_id)=(j.organization_id,v.assistant_message_id,c.session_id,c.request_id) and m.role='assistant' and m.status='completed') then raise exception 'execution_brief_recovery_denied' using errcode='42501';end if;
 product:=jsonb_build_object('schemaVersion','execution-brief-native-product-receipt.v1','producerKind',c.producer_kind,'captureId',c.id,'producerJobId',j.id,'requestId',c.request_id,'workId',c.work_id,'executionBriefId',v.execution_brief_id,'briefFingerprint',n.brief_fingerprint,'planId',v.plan_id,'planFingerprint',n.plan_fingerprint,'assistantMessageId',v.assistant_message_id,'proposalId',v.proposal_id,'activationJobId',v.activation_job_id,'dispatchId',v.dispatch_id);
 if not private.job_authority_is_current_v1(j.id) then raise exception 'execution_brief_recovery_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','execution-brief-product-recovery.v1','state','committed','producerJobId',j.id,'requestId',p_request_id,'captureId',c.id,'product',product);
end$$;
create function public.worker_recover_execution_brief_product_v1(p_job_id uuid,p_capability_token text,p_request_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_recover_execution_brief_product_v1(p_job_id,p_capability_token,p_request_id);$$;
revoke all on function private.worker_recover_execution_brief_product_v1(uuid,text,uuid),public.worker_recover_execution_brief_product_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.worker_recover_execution_brief_product_v1(uuid,text,uuid),public.worker_recover_execution_brief_product_v1(uuid,text,uuid) to authenticated;
