-- Requires assessment_input_capture.sql and 3P. Prospectively fixed producer
-- lineage; no promotion of old decisions lacking actual delivered inputs.
set search_path='';
create table private.assessment_proposal_receipts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,
 assessment_decision_id uuid not null,decision_key text not null,decision_revision integer not null check(decision_revision>0),
 decision_fingerprint text not null check(decision_fingerprint~'^[a-f0-9]{64}$'),
 job_id uuid not null,prepared_by uuid not null references auth.users(id),assessment_ref text not null,
 assessment_fingerprint text not null check(assessment_fingerprint~'^[a-f0-9]{64}$'),
 input_fingerprint text not null check(input_fingerprint~'^[a-f0-9]{64}$'),snapshot_ids uuid[] not null check(cardinality(snapshot_ids)>0),
 source_count integer not null check(source_count>=0),corpus_count integer not null check(corpus_count>=0),public_source_count integer not null check(public_source_count>=0),
 total_source_count integer generated always as(source_count+corpus_count+public_source_count) stored,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,assessment_decision_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,assessment_decision_id) references public.capital_project_decisions(organization_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id)
);
create index assessment_proposal_work_idx on private.assessment_proposal_receipts(organization_id,work_id);
create index assessment_proposal_job_idx on private.assessment_proposal_receipts(organization_id,job_id);
create index assessment_proposal_preparer_idx on private.assessment_proposal_receipts(prepared_by);
create table private.assessment_review_projections(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,
 assessment_decision_id uuid not null,proposal_receipt_id uuid not null,basis_receipt_id uuid not null,decision_id uuid not null,command_id uuid not null,
 actor_id uuid not null references auth.users(id),prepared_by uuid not null references auth.users(id),self_approval_declared boolean not null,
 outcome text not null check(outcome in ('approved','rejected')),frozen boolean not null,
 proposal_fingerprint text not null check(proposal_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,assessment_decision_id),unique(organization_id,command_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,assessment_decision_id) references public.capital_project_decisions(organization_id,id),
 foreign key(organization_id,proposal_receipt_id) references private.assessment_proposal_receipts(organization_id,id),
 foreign key(organization_id,basis_receipt_id) references private.review_basis_receipts(organization_id,id),
 foreign key(organization_id,decision_id) references public.work_decisions(organization_id,id),
 check(outcome<>'approved' or frozen)
);
create index assessment_review_work_idx on private.assessment_review_projections(organization_id,work_id);
create index assessment_review_proposal_idx on private.assessment_review_projections(organization_id,proposal_receipt_id);
create index assessment_review_basis_idx on private.assessment_review_projections(organization_id,basis_receipt_id);
create index assessment_review_decision_idx on private.assessment_review_projections(organization_id,decision_id);
create index assessment_review_actor_idx on private.assessment_review_projections(actor_id);
create index assessment_review_preparer_idx on private.assessment_review_projections(prepared_by);

-- Open assessments can be rejected without inventing a financing recommendation.
-- The other checks, including confirmed needing reviewer, remain unchanged.
do $$declare target text;matches integer;begin
 select count(*),min(conname) into matches,target from pg_constraint where conrelid='public.capital_project_decisions'::regclass
  and contype='c' and pg_get_constraintdef(oid) ~ 'status.*open.*recommendation IS NOT NULL';
 if matches<>1 then raise exception 'assessment_recommendation_constraint_unresolved';end if;
 execute format('alter table public.capital_project_decisions drop constraint %I',target);
end $$;
alter table public.capital_project_decisions add constraint assessment_status_recommendation_required
 check(status in ('open','rejected') or recommendation is not null);

-- Preserve the installed worker body, including its complete specialist request
-- batch. Change only the placeholder in-place branch after a real capture.
alter function private.worker_record_agent_assessment_v1(uuid,text,jsonb) rename to worker_record_agent_assessment_before_native_v1;
revoke all on function private.worker_record_agent_assessment_before_native_v1(uuid,text,jsonb) from public,anon,authenticated,service_role;
do $$declare body text;needle text:='if found and prior_decision.status = ''open'' and prior_decision.recommendation is null then';begin
 body:=pg_get_functiondef('private.worker_record_agent_assessment_before_native_v1(uuid,text,jsonb)'::regprocedure);
 if position(needle in body)=0 then raise exception 'assessment_placeholder_guard_target_missing';end if;
 body:=replace(body,needle,'if found and prior_decision.status = ''open'' and prior_decision.recommendation is null
  and not exists(select 1 from private.assessment_proposal_receipts where organization_id=job_row.organization_id and assessment_decision_id=prior_decision.id) then');
 body:=replace(body,'if found and prior_decision.status in (''confirmed'', ''rejected'') then',
  'if found and prior_decision.status in (''confirmed'', ''rejected'') and private.assessment_worker_freeze_required_v1(job_row.organization_id,session_row.capital_project_id,prior_decision.id) then');
 body:=replace(body,'if found and prior_decision.reviewed_by is not null then',
  'if found and prior_decision.reviewed_by is not null and private.assessment_worker_freeze_required_v1(job_row.organization_id,session_row.capital_project_id,prior_decision.id) then');
 -- A later machine proposal may refer to the predecessor but never changes the
 -- human row. Null-recommendation predecessors also stay open as historical indices.
 body:=replace(body,'where decision.organization_id = job_row.organization_id' || chr(10) || '        and decision.id = prior_decision.id;',
  'where decision.organization_id = job_row.organization_id' || chr(10) || '        and decision.id = prior_decision.id and prior_decision.reviewed_by is null and prior_decision.recommendation is not null;');
 execute body;
end $$;

create function private.worker_record_agent_assessment_v1(p_job_id uuid,p_capability_token text,p_assessment jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 if exists(select 1 from private.assessment_input_snapshots where organization_id=j.organization_id and job_id=j.id) then
  raise exception 'assessment_native_writer_required' using errcode='42501';end if;
 return private.worker_record_agent_assessment_before_native_v1(p_job_id,p_capability_token,p_assessment);
end $$;
revoke all on function private.worker_record_agent_assessment_v1(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.worker_record_agent_assessment_v1(uuid,text,jsonb) to authenticated;

create function private.assessment_proposal_authority_v1(p_org uuid,p_receipt uuid,p_actor uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare p private.assessment_proposal_receipts;d public.capital_project_decisions;snapshot uuid;state text;counted integer;actual_fp text;actual_sources integer;actual_corpus integer;actual_public integer;
begin
 select * into p from private.assessment_proposal_receipts where organization_id=p_org and id=p_receipt;
 if p.id is null then return 'unresolved';end if;
 -- The documentary capture does not certify external research merely because
 -- metadata was saved by the old collector. Never convert those sources to zero.
 if exists(select 1 from public.processing_jobs j join public.public_research_runs r on(r.organization_id,r.processing_run_id)=(j.organization_id,j.processing_run_id)
  join public.public_research_sources rs on(rs.organization_id,rs.research_run_id)=(r.organization_id,r.id)
  where j.organization_id=p_org and j.id=p.job_id and j.kind in('case_analysis','preliminary_analysis')) then return 'unresolved';end if;
 select * into d from public.capital_project_decisions where organization_id=p_org and id=p.assessment_decision_id;
 if d.id is null or (d.capital_project_id,d.decision_key,d.revision,d.decision_fingerprint,d.assessment_ref)
  is distinct from (p.work_id,p.decision_key,p.decision_revision,p.decision_fingerprint,p.assessment_ref) then return 'unresolved';end if;
 select count(*) into counted from private.assessment_input_snapshots where organization_id=p_org and work_id=p.work_id and job_id=p.job_id
  and id=any(p.snapshot_ids) and human_subject_id=p.prepared_by;
 if counted<>cardinality(p.snapshot_ids) then return 'unresolved';end if;
 select encode(extensions.digest(jsonb_agg(jsonb_build_object('id',id,'fingerprint',content_fingerprint) order by id)::text,'sha256'),'hex')
 into actual_fp from private.assessment_input_snapshots where organization_id=p_org and id=any(p.snapshot_ids);
 select count(distinct source_version_id) into actual_sources from private.assessment_input_source_links where organization_id=p_org and snapshot_id=any(p.snapshot_ids);
 select count(distinct chunk_id) into actual_corpus from private.assessment_input_corpus_links where organization_id=p_org and snapshot_id=any(p.snapshot_ids) and corpus_kind='house_playbook';
 select count(*)into actual_public from(select distinct 'm07:'||recipe_component_id::text as id from private.assessment_input_public_links where organization_id=p_org and snapshot_id=any(p.snapshot_ids)union select distinct 'research:'||delivery_id::text from private.assessment_research_source_links where organization_id=p_org and snapshot_id=any(p.snapshot_ids))x;
 if(actual_fp,actual_sources,actual_corpus,actual_public) is distinct from(p.input_fingerprint,p.source_count,p.corpus_count,p.public_source_count)
 then return 'unresolved';end if;
 foreach snapshot in array p.snapshot_ids loop
  state:=private.assessment_input_snapshot_authority_v1(p_org,snapshot,p_actor);
  if state<>'allowed' then return state;end if;
 end loop;
 return 'allowed';
end $$;
revoke all on function private.assessment_proposal_authority_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.assessment_proposal_fingerprint_v1(p_org uuid,p_receipt uuid)
returns text language sql stable security definer set search_path='' as $$
 select encode(extensions.digest(jsonb_build_object('workId',p.work_id,'assessmentId',p.assessment_decision_id,
  'decisionKey',p.decision_key,'revision',p.decision_revision,'decisionFingerprint',p.decision_fingerprint,
  'assessmentFingerprint',p.assessment_fingerprint,'inputFingerprint',p.input_fingerprint,
  'preparedBy',p.prepared_by,'jobId',p.job_id,'assessmentRef',p.assessment_ref)::text,'sha256'),'hex')
 from private.assessment_proposal_receipts p where organization_id=p_org and id=p_receipt;
$$;
revoke all on function private.assessment_proposal_fingerprint_v1(uuid,uuid) from public,anon,authenticated,service_role;

create function private.assessment_review_effective_v1(p_org uuid,p_work uuid,p_assessment uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare projection private.assessment_review_projections;state jsonb;decision public.work_decisions;
begin
 select * into projection from private.assessment_review_projections where organization_id=p_org and work_id=p_work and assessment_decision_id=p_assessment;
 if projection.id is null then return false;end if;
 select * into decision from public.work_decisions where organization_id=p_org and id=projection.decision_id;
 if decision.id is null or(decision.work_id,decision.kind,decision.outcome,decision.decided_by,decision.command_id)
  is distinct from(p_work,'confirm_assessment'::text,projection.outcome,projection.actor_id,projection.command_id)
  or not exists(select 1 from private.review_basis_receipts r where(r.organization_id,r.id,r.work_id)=(p_org,projection.basis_receipt_id,p_work)
   and r.basis_kind='assessment' and jsonb_build_array(r.basis_reference)=decision.basis->'assessments'
   and r.source_count=(select count(*) from private.review_basis_source_links l where(l.organization_id,l.receipt_id)=(p_org,r.id))) then return false;end if;
 state:=private.work_decision_precedence_v1(p_org,p_work,'assessment:'||p_assessment::text);
 return coalesce(state->>'state'='current' and(state->>'currentId')::uuid=projection.decision_id,false);
end $$;
revoke all on function private.assessment_review_effective_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.assessment_worker_freeze_required_v1(p_org uuid,p_work uuid,p_assessment uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare projection private.assessment_review_projections;
begin
 select * into projection from private.assessment_review_projections where organization_id=p_org and work_id=p_work and assessment_decision_id=p_assessment;
 -- Uncaptured historical decisions retain the installed conservative behavior.
 if projection.id is null then return true;end if;
 return projection.frozen and private.assessment_review_effective_v1(p_org,p_work,p_assessment);
end $$;
revoke all on function private.assessment_worker_freeze_required_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.worker_record_agent_assessment_v2(p_job_id uuid,p_capability_token text,p_assessment jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;work uuid;ids uuid[];source_count integer;corpus_count integer;public_count integer;fp text;inputs_fp text;
 result jsonb;d public.capital_project_decisions;old private.assessment_proposal_receipts;snapshot uuid;state text;dec jsonb;
begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 if j.kind='capital_project_analysis' then raise exception 'assessment_m07_index_producer_required' using errcode='42501';end if;
 if not exists(select 1 from private.assessment_input_snapshots where organization_id=j.organization_id and job_id=j.id and origin='public_research')then raise exception 'assessment_research_capture_required'using errcode='42501';end if;
 if exists(select 1 from public.public_research_runs r join public.public_research_sources s on(s.organization_id,s.research_run_id)=(r.organization_id,r.id)
  where r.organization_id=j.organization_id and r.processing_run_id=j.processing_run_id) then
  raise exception 'assessment_public_research_capture_required' using errcode='42501';end if;
 select capital_project_id into work from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id;
 perform 1 from public.capital_projects where organization_id=j.organization_id and id=work for no key update;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||j.organization_id::text,0));
 if not exists(select 1 from private.assessment_input_snapshots where organization_id=j.organization_id and job_id=j.id
  and ((j.kind='case_analysis' and origin='case_effective_input') or(j.kind='preliminary_analysis' and origin='preliminary_input')
   or(j.kind='capital_project_analysis' and origin='m07_final'))) then raise exception 'assessment_primary_capture_required' using errcode='42501';end if;
 select array_agg(id order by id),encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_object('id',id,'fingerprint',content_fingerprint) order by id),'[]')::text,'sha256'),'hex')
  into ids,inputs_fp from private.assessment_input_snapshots where organization_id=j.organization_id and work_id=work and job_id=j.id;
 foreach snapshot in array ids loop
  state:=private.assessment_input_snapshot_authority_v1(j.organization_id,snapshot,j.authorization_subject_id);
  if state<>'allowed' then raise exception 'assessment_input_authority_denied' using errcode='42501';end if;
 end loop;
 select count(distinct source_version_id) into source_count from private.assessment_input_source_links where organization_id=j.organization_id and snapshot_id=any(ids);
 select count(distinct chunk_id) into corpus_count from private.assessment_input_corpus_links where organization_id=j.organization_id and snapshot_id=any(ids) and corpus_kind='house_playbook';
 select count(*)into public_count from(select distinct 'm07:'||recipe_component_id::text as id from private.assessment_input_public_links where organization_id=j.organization_id and snapshot_id=any(ids)union select distinct 'research:'||delivery_id::text from private.assessment_research_source_links where organization_id=j.organization_id and snapshot_id=any(ids))x;
 fp:=encode(extensions.digest(convert_to(p_assessment::text,'utf8'),'sha256'),'hex');
 if exists(select 1 from private.assessment_proposal_receipts where organization_id=j.organization_id and work_id=work and job_id=j.id
  and assessment_ref=p_assessment->>'assessmentRef' and (assessment_fingerprint<>fp or input_fingerprint<>inputs_fp)) then
  raise exception 'assessment_proposal_replay_changed' using errcode='23505';end if;
 result:=private.worker_record_agent_assessment_before_native_v1(j.id,p_capability_token,p_assessment);
 for dec in select value from jsonb_array_elements(p_assessment->'decisions') loop
  select * into d from public.capital_project_decisions where organization_id=j.organization_id and capital_project_id=work
   and decision_key=dec->>'decisionKey' and decision_fingerprint=dec->>'fingerprint' and assessment_ref=p_assessment->>'assessmentRef';
  -- A frozen human predecessor makes the installed writer intentionally skip this
  -- proposal. It receives no receipt and is never relabelled as a native approval.
  if d.id is null then continue;end if;
  select * into old from private.assessment_proposal_receipts where organization_id=j.organization_id and assessment_decision_id=d.id;
  if old.id is not null then
   if old.assessment_fingerprint<>fp or old.input_fingerprint<>inputs_fp or old.prepared_by<>j.authorization_subject_id or old.job_id<>j.id then
    raise exception 'assessment_proposal_replay_changed' using errcode='23505';end if;
  else
   insert into private.assessment_proposal_receipts(organization_id,work_id,assessment_decision_id,decision_key,decision_revision,decision_fingerprint,
    job_id,prepared_by,assessment_ref,assessment_fingerprint,input_fingerprint,snapshot_ids,source_count,corpus_count,public_source_count)
   values(j.organization_id,work,d.id,d.decision_key,d.revision,d.decision_fingerprint,j.id,j.authorization_subject_id,d.assessment_ref,fp,inputs_fp,ids,source_count,corpus_count,public_count);
  end if;
 end loop;
 foreach snapshot in array ids loop
  if private.assessment_input_snapshot_authority_v1(j.organization_id,snapshot,j.authorization_subject_id)<>'allowed' then raise exception 'assessment_input_authority_denied' using errcode='42501';end if;
 end loop;
 perform private.job_for_capability(p_job_id,p_capability_token);
 return result;
end $$;
create function public.worker_record_agent_assessment_v2(p_job_id uuid,p_capability_token text,p_assessment jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_agent_assessment_v2(p_job_id,p_capability_token,p_assessment);$$;
revoke all on function private.worker_record_agent_assessment_v2(uuid,text,jsonb),public.worker_record_agent_assessment_v2(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.worker_record_agent_assessment_v2(uuid,text,jsonb),public.worker_record_agent_assessment_v2(uuid,text,jsonb) to authenticated;

-- M07 stores an index to the retained final only. No model-authored financial
-- recommendation, rationale, evidence or readout crosses into permanent rows.
create function private.worker_record_m07_assessment_index_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_final_retained_payload_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;sid uuid;s private.assessment_input_snapshots;old public.capital_project_decisions;d public.capital_project_decisions;
 receipt private.assessment_proposal_receipts;fp text;inputs_fp text;assessment_ref text;new_id uuid;
begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 if j.kind<>'capital_project_analysis' then raise exception 'assessment_m07_job_required' using errcode='42501';end if;
 sid:=private.worker_capture_m07_assessment_inputs_v1(j.id,p_capability_token,p_recipe_id,p_final_retained_payload_id);
 select * into strict s from private.assessment_input_snapshots where organization_id=j.organization_id and id=sid;
 perform 1 from public.capital_projects where organization_id=j.organization_id and id=s.work_id for no key update;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||j.organization_id::text,0));
 if private.assessment_input_snapshot_authority_v1(j.organization_id,s.id,j.authorization_subject_id)<>'allowed' then
  raise exception 'assessment_input_authority_denied' using errcode='42501';end if;
 assessment_ref:='m07-index:'||p_recipe_id::text;
 fp:=encode(extensions.digest(jsonb_build_object('schema','m07-assessment-index.v1','recipeId',p_recipe_id,
  'finalRetainedPayloadId',p_final_retained_payload_id,'snapshotFingerprint',s.content_fingerprint)::text,'sha256'),'hex');
 inputs_fp:=encode(extensions.digest(jsonb_build_array(jsonb_build_object('id',s.id,'fingerprint',s.content_fingerprint))::text,'sha256'),'hex');
 select p.* into receipt from private.assessment_proposal_receipts p where p.organization_id=j.organization_id and p.work_id=s.work_id and p.assessment_ref=worker_record_m07_assessment_index_v1.assessment_ref and p.job_id=j.id;
 if receipt.id is not null then
  if receipt.assessment_fingerprint<>fp or receipt.input_fingerprint<>inputs_fp or receipt.prepared_by<>j.authorization_subject_id then
   raise exception 'assessment_proposal_replay_changed' using errcode='23505';end if;
  perform private.job_for_capability(j.id,p_capability_token);
  return jsonb_build_object('assessmentId',receipt.assessment_decision_id,'proposalReceiptId',receipt.id,'replayed',true);
 end if;
 select * into old from public.capital_project_decisions where organization_id=j.organization_id and capital_project_id=s.work_id
  and decision_key='capital_strategy.assessment_review' order by revision desc limit 1 for update;
 if old.id is not null and old.reviewed_by is not null and private.assessment_worker_freeze_required_v1(j.organization_id,s.work_id,old.id) then
  return jsonb_build_object('skippedHumanFrozen',true,'assessmentId',old.id);end if;
 new_id:=gen_random_uuid();
 insert into public.capital_project_decisions(id,organization_id,capital_project_id,decision_key,revision,status,question,recommendation,
  alternatives,rationale_summary,evidence,assumptions,unresolved,confidence,proposed_by,reviewed_by,supersedes_decision_id,schema_version,
  decision_fingerprint,assessment_ref,created_by)
 values(new_id,j.organization_id,s.work_id,'capital_strategy.assessment_review',coalesce(old.revision,0)+1,'open',
  'A análise está pronta para confirmação humana?',null,'[]','Índice da análise; conteúdo sujeito à política de retenção.',
  '[]','[]','[]','insufficient','deal_captain',null,old.id,'dcm-decision.v1',fp,assessment_ref,j.authorization_subject_id)
 returning * into d;
 insert into private.assessment_proposal_receipts(organization_id,work_id,assessment_decision_id,decision_key,decision_revision,decision_fingerprint,
  job_id,prepared_by,assessment_ref,assessment_fingerprint,input_fingerprint,snapshot_ids,source_count,corpus_count,public_source_count)
 values(j.organization_id,s.work_id,d.id,d.decision_key,d.revision,d.decision_fingerprint,j.id,j.authorization_subject_id,assessment_ref,fp,inputs_fp,array[s.id],0,0,s.public_source_count)
 returning * into receipt;
 if private.assessment_proposal_authority_v1(j.organization_id,receipt.id,j.authorization_subject_id)<>'allowed' then
  raise exception 'assessment_input_authority_denied' using errcode='42501';end if;
 perform private.job_for_capability(j.id,p_capability_token);
 return jsonb_build_object('assessmentId',d.id,'proposalReceiptId',receipt.id,'replayed',false);
end $$;
create function public.worker_record_m07_assessment_index_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_final_retained_payload_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_m07_assessment_index_v1(p_job_id,p_capability_token,p_recipe_id,p_final_retained_payload_id);$$;
revoke all on function private.worker_record_m07_assessment_index_v1(uuid,text,uuid,uuid),public.worker_record_m07_assessment_index_v1(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.worker_record_m07_assessment_index_v1(uuid,text,uuid,uuid),public.worker_record_m07_assessment_index_v1(uuid,text,uuid,uuid) to authenticated;

create function private.preserve_native_assessment_proposal_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.assessment_proposal_receipts where organization_id=old.organization_id and assessment_decision_id=old.id) then
  if tg_op='DELETE' then raise exception 'assessment_proposal_immutable' using errcode='23514';end if;
  if (to_jsonb(new)-array['status','reviewed_by','updated_at']) is distinct from (to_jsonb(old)-array['status','reviewed_by','updated_at']) then
   raise exception 'assessment_proposal_immutable' using errcode='23514';end if;
  if (new.status,new.reviewed_by) is distinct from (old.status,old.reviewed_by)
   and (new.reviewed_by is not null or old.reviewed_by is not null)
   and not exists(select 1 from private.assessment_review_projections p join public.work_decisions d on(d.organization_id,d.id)=(p.organization_id,p.decision_id)
    where p.organization_id=old.organization_id and p.assessment_decision_id=old.id and p.actor_id=auth.uid()
     and d.decided_by=auth.uid() and d.outcome=p.outcome and (new.reviewed_by='user')
     and ((p.outcome='approved' and new.status=case when old.recommendation is null then 'open' else 'confirmed' end)
       or(p.outcome='rejected' and new.status='rejected'))) then
   raise exception 'assessment_native_review_required' using errcode='42501';end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.preserve_native_assessment_proposal_v1() from public,anon,authenticated,service_role;
create trigger assessment_proposal_preserve before update or delete on public.capital_project_decisions
 for each row execute function private.preserve_native_assessment_proposal_v1();

create function private.read_assessment_review_basis_v2(p_work_id uuid,p_assessment_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare p private.assessment_proposal_receipts;d public.capital_project_decisions;org uuid;actor uuid:=auth.uid();policy jsonb;state text;projection private.assessment_review_projections;
begin
 select organization_id into org from public.capital_projects where id=p_work_id and status<>'archived';
 if org is null or not private.can_access_resource_v1(org,p_work_id,'read') then raise exception 'assessment_review_denied' using errcode='42501';end if;
 perform 1 from auth.users where id=actor and deleted_at is null and(banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'assessment_review_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||org::text,0));
 select * into p from private.assessment_proposal_receipts where organization_id=org and work_id=p_work_id and assessment_decision_id=p_assessment_id;
 if p.id is null then raise exception 'assessment_proposal_capture_required' using errcode='42501';end if;
 state:=private.assessment_proposal_authority_v1(org,p.id,actor);
 if state<>'allowed' then raise exception 'assessment_review_source_denied' using errcode='42501';end if;
 select * into strict d from public.capital_project_decisions where organization_id=org and id=p.assessment_decision_id;
 select * into projection from private.assessment_review_projections where organization_id=org and assessment_decision_id=d.id;
 policy:=private.review_policy_snapshot_v1(org,p_work_id,actor);
 return jsonb_build_object('workId',p_work_id,'assessmentId',d.id,'decisionKey',p.decision_key,'revision',p.decision_revision,
  'decisionFingerprint',p.decision_fingerprint,'proposalFingerprint',private.assessment_proposal_fingerprint_v1(org,p.id),'preparedBy',p.prepared_by,'viewerId',actor,
  'workAccess',private.can_access_resource_v1(org,p_work_id,'work'),'policy',policy,'totalSourceCount',p.total_source_count,
  'documentSourceCount',p.source_count,'houseSourceCount',p.corpus_count,'publicSourceCount',p.public_source_count,
  'status',d.status,'nativeOutcome',case when private.assessment_review_effective_v1(org,p_work_id,d.id) then projection.outcome else null end,'frozen',coalesce(projection.frozen,false) and private.assessment_review_effective_v1(org,p_work_id,d.id),'nativeDecisionId',projection.decision_id);
end $$;
create function public.read_assessment_review_basis_v2(p_work_id uuid,p_assessment_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.read_assessment_review_basis_v2(p_work_id,p_assessment_id);$$;
revoke all on function private.read_assessment_review_basis_v2(uuid,uuid),public.read_assessment_review_basis_v2(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.read_assessment_review_basis_v2(uuid,uuid),public.read_assessment_review_basis_v2(uuid,uuid) to authenticated;

create function private.review_assessment_v2(p_work_id uuid,p_assessment_id uuid,p_expected_revision integer,p_expected_decision_fingerprint text,
 p_expected_proposal_fingerprint text,p_command_id uuid,p_outcome text,p_freeze boolean,p_self_approval_declared boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare org uuid;actor uuid:=auth.uid();p private.assessment_proposal_receipts;d public.capital_project_decisions;existing private.assessment_review_projections;
 policy jsonb;mode text;ref jsonb;basis jsonb;receipt uuid;versions uuid[];decision jsonb;effects text[];current_state jsonb;
begin
 if p_command_id is null or p_freeze is null or p_self_approval_declared is null or p_outcome not in ('approved','rejected') or p_outcome is null
  or p_expected_revision is null or p_expected_revision<1 or p_expected_decision_fingerprint is null or p_expected_decision_fingerprint!~'^[a-f0-9]{64}$'
  or p_expected_proposal_fingerprint is null or p_expected_proposal_fingerprint!~'^[a-f0-9]{64}$' or(p_outcome='approved' and not p_freeze)
  then raise exception 'assessment_review_invalid' using errcode='22023';end if;
 select organization_id into org from public.capital_projects where id=p_work_id and status<>'archived';
 if org is null or not private.can_access_resource_v1(org,p_work_id,'read') then raise exception 'assessment_review_denied' using errcode='42501';end if;
 perform 1 from auth.users where id=actor and deleted_at is null and(banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'assessment_review_denied' using errcode='42501';end if;
 perform 1 from public.capital_projects where organization_id=org and id=p_work_id and status<>'archived' for no key update;
 if not found then raise exception 'assessment_review_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||org::text,0));
 perform 1 from public.organization_memberships where organization_id=org and user_id=actor and status='active' for share nowait;
 if not found or not private.can_access_resource_v1(org,p_work_id,'read') then raise exception 'assessment_review_denied' using errcode='42501';end if;
 policy:=private.review_policy_snapshot_v1(org,p_work_id,actor);
 if not private.can_access_resource_v1(org,p_work_id,'work')
  or ((policy->>'assignmentRequired')::boolean and not(policy->'roles'?'approver' or(p_outcome='rejected' and policy->'roles'?'reviewer')))
  or(not(policy->>'assignmentRequired')::boolean and not private.can_access_resource_v1(org,p_work_id,'work'))
  then raise exception 'review_assignment_required' using errcode='42501';end if;
 select * into p from private.assessment_proposal_receipts where organization_id=org and work_id=p_work_id and assessment_decision_id=p_assessment_id;
 if p.id is null then raise exception 'assessment_proposal_capture_required' using errcode='42501';end if;
 select * into d from public.capital_project_decisions where organization_id=org and id=p.assessment_decision_id for update;
 if(d.revision,d.decision_fingerprint,private.assessment_proposal_fingerprint_v1(org,p.id)) is distinct from(p_expected_revision,p_expected_decision_fingerprint,p_expected_proposal_fingerprint)
  then raise exception 'assessment_review_stale' using errcode='40001';end if;
 if private.assessment_proposal_authority_v1(org,p.id,actor)<>'allowed' then raise exception 'assessment_review_source_denied' using errcode='42501';end if;
 if p_outcome='approved' and p.prepared_by=actor and(not(policy->>'selfApprovalAllowed')::boolean or not p_self_approval_declared)
  then raise exception 'capital_project_self_approval_forbidden' using errcode='42501';end if;
 select * into existing from private.assessment_review_projections where organization_id=org and command_id=p_command_id;
 if existing.id is not null then
  if(existing.work_id,existing.assessment_decision_id,existing.proposal_receipt_id,existing.actor_id,existing.outcome,existing.frozen,existing.self_approval_declared,existing.proposal_fingerprint)
   is distinct from(p_work_id,d.id,p.id,actor,p_outcome,p_freeze,p_self_approval_declared,p_expected_proposal_fingerprint) then
   raise exception 'assessment_review_replay_changed' using errcode='23505';end if;
  current_state:=private.work_decision_precedence_v1(org,p_work_id,'assessment:'||d.id::text);
  if current_state->>'state' is distinct from 'current' or(current_state->>'currentId')::uuid is distinct from existing.decision_id then raise exception 'assessment_review_not_effective' using errcode='42501';end if;
  return jsonb_build_object('decisionId',existing.decision_id,'assessmentId',d.id,'outcome',existing.outcome,'frozen',existing.frozen,'replayed',true);
 end if;
 if d.status not in ('open','directional') or exists(select 1 from private.assessment_review_projections where organization_id=org and assessment_decision_id=d.id)
  or d.id is distinct from(select x.id from public.capital_project_decisions x where x.organization_id=org and x.capital_project_id=p_work_id and x.decision_key=d.decision_key order by revision desc limit 1)
  then raise exception 'assessment_review_stale' using errcode='40001';end if;
 select coalesce(array_agg(distinct source_version_id order by source_version_id),'{}'::uuid[]) into versions from private.assessment_input_source_links
  where organization_id=org and snapshot_id=any(p.snapshot_ids);
 ref:=jsonb_build_object('decisionKey',d.decision_key,'revision',d.revision,'decisionFingerprint',d.decision_fingerprint);
 receipt:=private.record_review_basis_receipt_v1(org,p_work_id,'assessment',ref,versions,'agent_assessment');
 basis:=jsonb_build_object('artifacts','[]'::jsonb,'milestones','[]'::jsonb,'assessments',jsonb_build_array(ref),'decisions','[]'::jsonb,'execution',null,'configuration',null);
 effects:=case when p_freeze then array['freeze_assessment']::text[] else array['none']::text[] end;
 mode:=case when(policy->>'assignmentRequired')::boolean then 'assigned' when(policy->>'selfApprovalAllowed')::boolean then 'individual' else 'open' end;
 decision:=private.append_work_decision_v1(org,p_work_id,'assessment:'||d.id::text,'confirm_assessment',basis,effects,'in_product',null,null,
  actor,null,p_command_id,mode,policy,jsonb_build_object('table','capital_project_decisions','id',d.id),p_outcome=>p_outcome);
 if(decision->>'contested')::boolean then raise exception 'assessment_native_review_contested' using errcode='40001';end if;
 insert into private.assessment_review_projections(organization_id,work_id,assessment_decision_id,proposal_receipt_id,basis_receipt_id,decision_id,command_id,
  actor_id,prepared_by,self_approval_declared,outcome,frozen,proposal_fingerprint)
 values(org,p_work_id,d.id,p.id,receipt,(decision->>'decisionId')::uuid,p_command_id,actor,p.prepared_by,p_self_approval_declared,p_outcome,p_freeze,p_expected_proposal_fingerprint);
 update public.capital_project_decisions set status=case when p_outcome='rejected' then 'rejected' when recommendation is null then 'open' else 'confirmed' end,
  reviewed_by='user' where organization_id=org and id=d.id;
 if private.assessment_proposal_authority_v1(org,p.id,actor)<>'allowed' then raise exception 'assessment_review_source_denied' using errcode='42501';end if;
 return jsonb_build_object('decisionId',decision->>'decisionId','assessmentId',d.id,'outcome',p_outcome,'frozen',p_freeze,'replayed',false);
end $$;
create function public.review_assessment_v2(p_work_id uuid,p_assessment_id uuid,p_expected_revision integer,p_expected_decision_fingerprint text,
 p_expected_proposal_fingerprint text,p_command_id uuid,p_outcome text,p_freeze boolean,p_self_approval_declared boolean)
returns jsonb language sql security invoker set search_path='' as $$select private.review_assessment_v2(p_work_id,p_assessment_id,p_expected_revision,p_expected_decision_fingerprint,p_expected_proposal_fingerprint,p_command_id,p_outcome,p_freeze,p_self_approval_declared);$$;
revoke all on function private.review_assessment_v2(uuid,uuid,integer,text,text,uuid,text,boolean,boolean),public.review_assessment_v2(uuid,uuid,integer,text,text,uuid,text,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function private.review_assessment_v2(uuid,uuid,integer,text,text,uuid,text,boolean,boolean),public.review_assessment_v2(uuid,uuid,integer,text,text,uuid,text,boolean,boolean) to authenticated;

do $$declare t text;begin
 foreach t in array array['assessment_proposal_receipts','assessment_review_projections'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('create policy %I on private.%I for select to authenticated using(false)',t||'_deny_select',t);
  execute format('create policy %I on private.%I for insert to authenticated with check(false)',t||'_deny_insert',t);
  execute format('create policy %I on private.%I for update to authenticated using(false) with check(false)',t||'_deny_update',t);
  execute format('create policy %I on private.%I for delete to authenticated using(false)',t||'_deny_delete',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_review_history_mutation_v1()',t||'_immutable',t);
  execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',t||'_no_truncate',t);
  execute format('create trigger %I after insert on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 end loop;
end $$;

-- Preserve all installed generic and M07 checks. The original recursive body
-- calls this name for dependency decisions, so supplementation reaches ancestors.
alter function private.work_decision_basis_authority_v1(uuid,uuid,jsonb,jsonb,uuid,uuid[])
 rename to work_decision_basis_authority_before_assessment_capture_v1;
revoke all on function private.work_decision_basis_authority_before_assessment_capture_v1(uuid,uuid,jsonb,jsonb,uuid,uuid[])
 from public,anon,authenticated,service_role;
create function private.work_decision_basis_authority_v1(p_org uuid,p_work uuid,p_basis jsonb,p_report jsonb,p_actor uuid,p_seen uuid[] default '{}')
returns text language plpgsql volatile security definer set search_path='' as $$
declare state text;ref jsonb;receipt private.assessment_proposal_receipts;
begin
 state:=private.work_decision_basis_authority_before_assessment_capture_v1(p_org,p_work,p_basis,p_report,p_actor,p_seen);
 if state='denied' then return state;end if;
 for ref in select value from jsonb_array_elements(p_basis->'assessments') loop
  select * into receipt from private.assessment_proposal_receipts where organization_id=p_org and work_id=p_work
   and decision_key=ref->>'decisionKey' and decision_revision=(ref->>'revision')::integer and decision_fingerprint=ref->>'decisionFingerprint';
  if receipt.id is not null then
   if private.assessment_proposal_authority_v1(p_org,receipt.id,p_actor)='denied' then return 'denied';end if;
   if private.assessment_proposal_authority_v1(p_org,receipt.id,p_actor)<>'allowed' then state:='unresolved';end if;
  end if;
 end loop;
 return state;
end $$;
revoke all on function private.work_decision_basis_authority_v1(uuid,uuid,jsonb,jsonb,uuid,uuid[]) from public,anon,authenticated,service_role;
