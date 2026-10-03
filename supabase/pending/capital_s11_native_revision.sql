-- Prospective human S11 return, after 3R and S11 native consumption.
-- No M07 function or migration is edited. Human foundation remains the final
-- reviewer gate; only server-proven S11 bindings select the new producer.
set search_path='';

-- Historical input eligibility is not current display eligibility.
do $$declare def text;needle text:='and c.status not in (''stale'',''superseded'')';begin
 def:=pg_get_functiondef('private.capital_s11_native_read_allowed_v1(uuid,uuid,uuid)'::regprocedure);
 if position(needle in def)=0 then raise exception 's11_revision_authority_definition_drift';end if;
 execute replace(def,needle,'and c.status<>''stale''');
end $$;
alter function private.read_capital_s11_result_v1(uuid) rename to read_capital_s11_result_before_revision_v1;
create function private.read_capital_s11_result_v1(p_revision_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$begin
 if exists(select 1 from private.capital_s11_native_bindings b join public.capital_project_artifacts c on(c.organization_id,c.id)=(b.organization_id,b.capital_artifact_id) where b.revision_id=p_revision_id and c.status in('stale','superseded')) then raise exception 'capital_s11_read_denied' using errcode='42501';end if;
 return private.read_capital_s11_result_before_revision_v1(p_revision_id);
end $$;
alter function private.artifact_revision_release_v1(public.artifact_revisions) rename to artifact_revision_release_before_s11_revision_v1;
create function private.artifact_revision_release_v1(r public.artifact_revisions) returns text language plpgsql stable security definer set search_path='' as $$begin
 if exists(select 1 from private.capital_s11_native_bindings b join public.capital_project_artifacts c on(c.organization_id,c.id)=(b.organization_id,b.capital_artifact_id) where b.organization_id=r.organization_id and b.revision_id=r.id and c.status in('stale','superseded')) then return 'blocked';end if;
 return private.artifact_revision_release_before_s11_revision_v1(r);
end $$;
revoke all on function private.artifact_revision_release_v1(public.artifact_revisions),private.artifact_revision_release_before_s11_revision_v1(public.artifact_revisions) from public,anon,authenticated,service_role;
-- Supersession of the output is not revocation of its own source history.
do $$declare def text;needle text:=' union select recipe_id from private.capital_s11_native_bindings where organization_id=org and capital_artifact_id=(row_data->>''id'')::uuid';begin
 def:=pg_get_functiondef('private.wake_capital_s11_retention_v1()'::regprocedure);
 if position(needle in def)=0 then raise exception 's11_revision_wake_definition_drift';end if;
 def:=replace(def,needle,'');
 if position('begin'||chr(10)||' if tg_table_name' in def)=0 then raise exception 's11_revision_wake_guard_drift';end if;
 def:=replace(def,'begin'||chr(10)||' if tg_table_name','begin'||chr(10)||$guard$ if tg_table_name='capital_projects' and tg_op='UPDATE' and(to_jsonb(new)-array['updated_at','current_phase']) is not distinct from(to_jsonb(old)-array['updated_at','current_phase']) then return new;end if;
 if tg_table_name$guard$);
 execute def;
end $$;

create function private.read_capital_s11_artifact_review_basis_v1(p_project_id uuid,p_artifact_id uuid,p_revision_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare org uuid;actor uuid:=auth.uid();b private.capital_s11_native_bindings;c public.capital_project_artifacts;r public.artifact_revisions;recipe private.capital_s11_recipes;active boolean;begin
 select organization_id into org from public.capital_projects where id=p_project_id and status<>'archived';
 if org is null or not private.can_access_resource_v1(org,p_project_id,'read') then raise exception 'capital_artifact_review_denied' using errcode='42501';end if;
 select * into b from private.capital_s11_native_bindings where organization_id=org and work_id=p_project_id and capital_artifact_id=p_artifact_id and revision_id=p_revision_id;
 select * into c from public.capital_project_artifacts where organization_id=org and capital_project_id=p_project_id and id=p_artifact_id;
 select * into r from public.artifact_revisions where organization_id=org and id=p_revision_id;
 select * into recipe from private.capital_s11_recipes where organization_id=org and id=b.recipe_id;
 if b.id is null or c.id is null or r.id is null or recipe.id is null then raise exception 'capital_artifact_review_basis_unproven' using errcode='42501';end if;
 if not private.artifact_review_sources_allowed_v1(org,r.id,actor) then raise exception 'review_source_access_required' using errcode='42501';end if;
 active:=private.capital_artifact_approval_active_v2(org,r.id);
 return jsonb_build_object('projectId',p_project_id,'artifactId',c.id,'revisionId',r.id,'manifestFingerprint',r.manifest_fingerprint,'artifactFingerprint',c.artifact_fingerprint,
 'artifactType',c.artifact_type,'artifactVersion',c.artifact_version,
 'preparedBy',recipe.human_subject_id,'viewerId',actor,'workAccess',private.can_access_resource_v1(org,p_project_id,'work'),
 'policy',private.review_policy_snapshot_v1(org,p_project_id,actor),'status',case when c.status in('confirmed','approved') and not active then 'pending_confirmation' else c.status end,
 'approvalActive',active,'sourceCount',(select count(*) from private.capital_s11_recipe_components where organization_id=org and recipe_id=recipe.id and slot='source'));
end $$;
create function private.enqueue_capital_s11_revision_v1(p_org uuid,p_capital_artifact uuid,p_review uuid,p_decision uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c public.capital_project_artifacts;b private.capital_s11_native_bindings;r private.capital_s11_recipes;review public.artifact_reviews;
 job uuid:=gen_random_uuid();run uuid:=gen_random_uuid();next_no integer;begin
 select * into c from public.capital_project_artifacts where organization_id=p_org and id=p_capital_artifact;
 select * into b from private.capital_s11_native_bindings where organization_id=p_org and capital_artifact_id=c.id;
 select * into r from private.capital_s11_recipes where organization_id=p_org and id=b.recipe_id;
 select * into review from public.artifact_reviews where organization_id=p_org and id=p_review and revision_id=b.revision_id and act='return';
 if r.id is null or review.id is null or c.artifact_type<>'alternative_map' then raise exception 'capital_artifact_revision_producer_unproven' using errcode='42501';end if;
 update public.capital_project_task_runs set status='invalidated',completed_at=clock_timestamp()
 where organization_id=p_org and id=b.task_run_id and status='succeeded';
 if not found then raise exception 'capital_artifact_revision_task_not_invalidateable' using errcode='55000';end if;
 select coalesce(max(run_no),0)+1 into next_no from public.processing_runs where organization_id=p_org and intake_session_id=r.session_id;
 insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,budget,versions,created_by)
 values(run,p_org,r.session_id,next_no,'manual','queued','capital-planning-revision-2026.09.24-v2',
 jsonb_build_object('maxCalls',1,'maxCostUsd',0.8,'externalSearchMaxUsd',0),
 jsonb_build_object('planId',r.plan_id,'revisionOfArtifactId',c.id,'correctionDecisionId',p_decision,'revisionId',b.revision_id,'reviewId',review.id,'executor','capital-planning-2026.09.24-v2'),review.reviewer_id);
 insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,kind,payload,max_attempts)
 values(job,p_org,run,r.session_id,'capital_project_analysis',jsonb_build_object('analysis_scope','capital_planning','locale',r.locale,
 'capital_project_id',r.work_id,'capital_project_plan_id',r.plan_id,'capital_project_brief_id',r.brief_id,'capital_task_ids',jsonb_build_array('M04','S11'),
 'capital_artifact_required',true,'revision_of_artifact_id',c.id,'correction_decision_id',p_decision,'revision_of_native_revision_id',b.revision_id,
 'revision_review_id',review.id,'revision_block_id',review.block_id,
 'trigger_event',jsonb_build_object('type','artifact_correction_requested','artifactId',c.id,'revisionId',b.revision_id,'decisionId',p_decision,'reviewId',review.id),
 'model_budget',jsonb_build_object('max_cost_usd',0.8,'max_calls',1)),2);
 update public.document_intake_sessions set current_run_id=run,status='processing',processing_started_at=clock_timestamp(),processing_completed_at=null,
 pipeline_version='capital-planning-revision-2026.09.24-v2',updated_at=clock_timestamp() where organization_id=p_org and id=r.session_id;
 return jsonb_build_object('jobId',job,'runId',run);
end $$;

alter function private.read_capital_project_artifact_review_v2(uuid,uuid,uuid) rename to read_capital_project_artifact_review_before_s11_revision_v2;
create function private.read_capital_project_artifact_review_v2(p_project_id uuid,p_artifact_id uuid,p_revision_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$begin
 if exists(select 1 from private.capital_s11_native_bindings where work_id=p_project_id and capital_artifact_id=p_artifact_id and revision_id=p_revision_id) then return private.read_capital_s11_artifact_review_basis_v1(p_project_id,p_artifact_id,p_revision_id);end if;
 return private.read_capital_project_artifact_review_before_s11_revision_v2(p_project_id,p_artifact_id,p_revision_id);
end $$;
alter function private.artifact_review_preparer_v1(public.artifact_revisions) rename to artifact_review_preparer_before_s11_revision_v1;
create function private.artifact_review_preparer_v1(p_revision public.artifact_revisions) returns uuid language plpgsql stable security definer set search_path='' as $$declare preparer uuid;begin
 select r.human_subject_id into preparer from private.capital_s11_native_bindings b join private.capital_s11_recipes r on(r.organization_id,r.id)=(b.organization_id,b.recipe_id) where b.organization_id=p_revision.organization_id and b.revision_id=p_revision.id;
 if found then return preparer;end if;return private.artifact_review_preparer_before_s11_revision_v1(p_revision);end $$;
alter function private.enqueue_capital_artifact_revision_v2(uuid,uuid,uuid,uuid) rename to enqueue_capital_artifact_revision_before_s11_v2;
create function private.enqueue_capital_artifact_revision_v2(p_org uuid,p_capital_artifact uuid,p_review uuid,p_decision uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$begin
 if exists(select 1 from private.capital_s11_native_bindings where organization_id=p_org and capital_artifact_id=p_capital_artifact) then return private.enqueue_capital_s11_revision_v1(p_org,p_capital_artifact,p_review,p_decision);end if;
 return private.enqueue_capital_artifact_revision_before_s11_v2(p_org,p_capital_artifact,p_review,p_decision);end $$;

create function private.project_capital_s11_artifact_review_v1() returns trigger language plpgsql volatile security definer set search_path='' as $$
declare b private.capital_s11_native_bindings;c public.capital_project_artifacts;decision uuid;queued jsonb;effect text;active boolean;begin
 select * into b from private.capital_s11_native_bindings where organization_id=new.organization_id and work_id=new.work_id and revision_id=new.revision_id;
 if b.id is null or new.act not in('approve','return','revoke_approval') then return new;end if;
 select * into c from public.capital_project_artifacts where organization_id=new.organization_id and id=b.capital_artifact_id for update;
 if not private.artifact_review_sources_allowed_v1(new.organization_id,new.revision_id,new.reviewer_id)
 or not private.can_access_resource_v1(new.organization_id,new.work_id,'work') then raise exception 'review_source_access_required' using errcode='42501';end if;
 if new.act in('approve','return') and c.status in('stale','superseded') then raise exception 'capital_artifact_review_target_inactive' using errcode='42501';end if;
 if new.act='approve' then
  effect:='confirm';
  -- Multiple real reviewers preserve the first transition's author and timestamp.
  select p.legacy_decision_id into decision from private.capital_artifact_review_projections p where p.organization_id=new.organization_id and p.revision_id=new.revision_id and p.effect='confirm' order by p.created_at,p.id limit 1;
  if decision is null then
   insert into public.capital_project_artifact_decisions(organization_id,capital_project_id,artifact_id,artifact_fingerprint,decision,note,decided_by,decided_at)
   values(new.organization_id,new.work_id,c.id,c.artifact_fingerprint,'confirm',new.note,new.reviewer_id,new.created_at) returning id into decision;
  end if;
  update public.capital_project_artifacts set status='confirmed',superseded_at=null where organization_id=new.organization_id and id=c.id;
 elsif new.act='return' then
  effect:='return';
  if char_length(trim(coalesce(new.note,''))) not between 2 and 5000 then raise exception 'capital_artifact_return_note_required' using errcode='22023';end if;
  insert into public.capital_project_artifact_decisions(organization_id,capital_project_id,artifact_id,artifact_fingerprint,decision,note,decided_by,decided_at)
  values(new.organization_id,new.work_id,c.id,c.artifact_fingerprint,'request_changes',new.note,new.reviewer_id,new.created_at) returning id into decision;
  queued:=private.enqueue_capital_artifact_revision_v2(new.organization_id,c.id,new.id,decision);
  update public.capital_project_artifacts set status='superseded',superseded_at=clock_timestamp() where organization_id=new.organization_id and id=c.id;
 else
  effect:='revoke_approval';active:=private.capital_artifact_approval_active_v2(new.organization_id,new.revision_id);
  if not active and c.status in('confirmed','approved') then
   update public.capital_project_artifacts set status='pending_confirmation',superseded_at=null where organization_id=new.organization_id and id=c.id;
  end if;
 end if;
 insert into private.capital_artifact_review_projections(organization_id,work_id,capital_artifact_id,revision_id,review_id,legacy_decision_id,
 processing_job_id,processing_run_id,effect,command_id)
 values(new.organization_id,new.work_id,c.id,new.revision_id,new.id,decision,(queued->>'jobId')::uuid,(queued->>'runId')::uuid,effect,new.command_id);
 if not private.artifact_review_sources_allowed_v1(new.organization_id,new.revision_id,new.reviewer_id) then
 raise exception 'review_source_access_required' using errcode='42501';end if;
 return new;
end $$;
create trigger capital_s11_artifact_review_bridge after insert on public.artifact_reviews for each row execute function private.project_capital_s11_artifact_review_v1();
alter function private.review_artifact_revision_v1(uuid,text,text,uuid,text,boolean,uuid,uuid) rename to review_artifact_revision_before_s11_revision_v1;
create function private.review_artifact_revision_v1(p_revision_id uuid,p_expected_fingerprint text,p_act text,p_block_id uuid,p_note text,
 p_self_approval_declared boolean,p_command_id uuid,p_basis_review_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare b private.capital_s11_native_bindings;c public.capital_project_artifacts;existing public.artifact_reviews;org uuid;begin
 select * into b from private.capital_s11_native_bindings where revision_id=p_revision_id;
 if b.id is not null then
  org:=private.lock_review_work_v1(b.work_id);
  if org is distinct from b.organization_id or not private.can_access_resource_v1(org,b.work_id,'work') then raise exception 'review_work_access_required' using errcode='42501';end if;
  select * into c from public.capital_project_artifacts where organization_id=org and id=b.capital_artifact_id for update;
  select * into existing from public.artifact_reviews where organization_id=org and work_id=b.work_id and command_id=p_command_id;
  if p_act in('approve','return','reaffirm') and c.status in('stale','superseded') and(existing.id is null or p_act<>'return') then
   raise exception 'capital_artifact_review_target_inactive' using errcode='42501';end if;
  if existing.id is not null and existing.act=p_act and p_act in('approve','reaffirm') and not private.artifact_review_is_active_v1(org,existing.id) then raise exception 'capital_artifact_review_not_effective' using errcode='42501';end if;
  if p_act='return' and char_length(trim(coalesce(p_note,''))) not between 2 and 5000 then raise exception 'capital_artifact_return_note_required' using errcode='22023';end if;
 end if;
 return private.review_artifact_revision_before_s11_revision_v1(p_revision_id,p_expected_fingerprint,p_act,p_block_id,p_note,p_self_approval_declared,p_command_id,p_basis_review_id);
end $$;

-- The S11 consumption migration already bound substance to its physical
-- native bridge. Assert that foundation was preserved through the 3R rename.
do $$declare def text;begin
 def:=pg_get_functiondef('private.review_artifact_revision_before_capital_cutover_v1(uuid,text,text,uuid,text,boolean,uuid,uuid)'::regprocedure);
 if position('private.capital_s11_native_read_allowed_v1(org,r.id,actor)' in def)=0 then raise exception 's11_review_substance_definition_drift';end if;
end $$;
-- Every new private core stays inaccessible through PostgREST.
revoke all on function private.enqueue_capital_s11_revision_v1(uuid,uuid,uuid,uuid),private.enqueue_capital_artifact_revision_before_s11_v2(uuid,uuid,uuid,uuid),private.project_capital_s11_artifact_review_v1(),private.read_capital_s11_artifact_review_basis_v1(uuid,uuid,uuid),private.read_capital_project_artifact_review_before_s11_revision_v2(uuid,uuid,uuid),private.artifact_review_preparer_before_s11_revision_v1(public.artifact_revisions),private.read_capital_s11_result_before_revision_v1(uuid),private.review_artifact_revision_before_s11_revision_v1(uuid,text,text,uuid,text,boolean,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.read_capital_project_artifact_review_v2(uuid,uuid,uuid),private.artifact_review_preparer_v1(public.artifact_revisions),private.enqueue_capital_artifact_revision_v2(uuid,uuid,uuid,uuid),private.review_artifact_revision_v1(uuid,text,text,uuid,text,boolean,uuid,uuid),private.read_capital_s11_result_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function private.read_capital_project_artifact_review_v2(uuid,uuid,uuid),private.review_artifact_revision_v1(uuid,text,text,uuid,text,boolean,uuid,uuid),private.read_capital_s11_result_v1(uuid) to authenticated;

-- A revision references original physical history. This row never copies it.
create table private.capital_s11_revision_inputs(
 organization_id uuid not null references public.organizations(id),recipe_id uuid not null,prior_recipe_id uuid not null,
 review_id uuid not null,prior_revision_id uuid not null,prior_final_retained_payload_id uuid not null,predecessor_recipe_id uuid not null,
 depth integer not null check(depth between 1 and 64),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,recipe_id),
 foreign key(organization_id,recipe_id) references private.capital_s11_recipes(organization_id,id),
 foreign key(organization_id,prior_recipe_id) references private.capital_s11_recipes(organization_id,id),
 foreign key(organization_id,predecessor_recipe_id) references private.capital_s11_recipes(organization_id,id),
 foreign key(organization_id,review_id) references public.artifact_reviews(organization_id,id),
 foreign key(organization_id,prior_revision_id) references public.artifact_revisions(organization_id,id),
 foreign key(organization_id,prior_final_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),check(recipe_id<>prior_recipe_id));
create index capital_s11_revision_prior_idx on private.capital_s11_revision_inputs(organization_id,prior_recipe_id);
create index capital_s11_revision_predecessor_idx on private.capital_s11_revision_inputs(organization_id,predecessor_recipe_id);
create index capital_s11_revision_review_idx on private.capital_s11_revision_inputs(organization_id,review_id);
create index capital_s11_revision_revision_idx on private.capital_s11_revision_inputs(organization_id,prior_revision_id);
create index capital_s11_revision_body_idx on private.capital_s11_revision_inputs(organization_id,prior_final_retained_payload_id);
alter table private.capital_s11_revision_inputs enable row level security;
alter table private.capital_s11_revision_inputs force row level security;
revoke all on private.capital_s11_revision_inputs from public,anon,authenticated,service_role;
create policy s11_revision_deny_select on private.capital_s11_revision_inputs as restrictive for select to anon,authenticated using(false);
create policy s11_revision_deny_insert on private.capital_s11_revision_inputs as restrictive for insert to anon,authenticated with check(false);
create policy s11_revision_deny_update on private.capital_s11_revision_inputs as restrictive for update to anon,authenticated using(false) with check(false);
create policy s11_revision_deny_delete on private.capital_s11_revision_inputs as restrictive for delete to anon,authenticated using(false);
create trigger s11_revision_updated before update on private.capital_s11_revision_inputs for each row execute function private.set_updated_at();
create trigger s11_revision_immutable before update or delete on private.capital_s11_revision_inputs for each row execute function private.reject_source_version_mutation_v1();
create trigger s11_revision_no_truncate before truncate on private.capital_s11_revision_inputs for each statement execute function private.reject_review_history_mutation_v1();
create trigger s11_revision_audit after insert on private.capital_s11_revision_inputs for each row execute function private.capture_identity_audit_v1();

-- Eligibility comes from the human projection and original approved dispatch.
-- The worker cannot grant M04 by altering task IDs or a budget in its payload.
alter function private.execution_dispatch_is_current(uuid,boolean) rename to execution_dispatch_before_s11_revision_v1;
create function private.capital_s11_revision_dispatch_allowed_v1(p_job_id uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare walker uuid:=p_job_id;visited uuid[]:='{}';depth integer:=0;j public.processing_jobs;
 pr private.capital_artifact_review_projections;review public.artifact_reviews;b private.capital_s11_native_bindings;r private.capital_s11_recipes;
 run public.processing_runs;policy jsonb;
begin
 loop
 if walker=any(visited) or depth>=64 then return false;end if;visited:=visited||walker;depth:=depth+1;
 select * into j from public.processing_jobs where id=walker;
 select * into pr from private.capital_artifact_review_projections where organization_id=j.organization_id and processing_job_id=j.id and effect='return'
 and review_id::text=j.payload->>'revision_review_id' and legacy_decision_id::text=j.payload->>'correction_decision_id'
 and capital_artifact_id::text=j.payload->>'revision_of_artifact_id' and revision_id::text=j.payload->>'revision_of_native_revision_id';
 select * into review from public.artifact_reviews where organization_id=j.organization_id and id=pr.review_id and act='return' and reviewer_id=j.authorization_subject_id;
 select * into b from private.capital_s11_native_bindings where organization_id=j.organization_id and revision_id=pr.revision_id and capital_artifact_id=pr.capital_artifact_id;
 select * into r from private.capital_s11_recipes where organization_id=j.organization_id and id=b.recipe_id;
 select * into run from public.processing_runs where organization_id=j.organization_id and id=j.processing_run_id;
 if j.id is null or pr.id is null or review.id is null or b.id is null or r.id is null or run.id is null
 or j.kind<>'capital_project_analysis' or j.payload->>'analysis_scope' is distinct from 'capital_planning'
 or j.payload->'capital_task_ids' is distinct from '["M04","S11"]'::jsonb
 or j.payload->'model_budget' is distinct from '{"max_cost_usd":0.8,"max_calls":1}'::jsonb
 or run.budget is distinct from '{"maxCalls":1,"maxCostUsd":0.8,"externalSearchMaxUsd":0}'::jsonb
 or run.created_by<>review.reviewer_id or pr.work_id<>r.work_id or j.work_id<>r.work_id or j.intake_session_id<>r.session_id
 or r.plan_id::text is distinct from j.payload->>'capital_project_plan_id' or r.brief_id::text is distinct from j.payload->>'capital_project_brief_id'
 or not private.capital_body_subject_allowed_v1(j.organization_id,r.work_id,review.reviewer_id)
 or not exists(select 1 from public.capital_project_artifacts c where c.organization_id=j.organization_id and c.id=b.capital_artifact_id and c.status='superseded')
 or not private.artifact_review_sources_allowed_v1(j.organization_id,b.revision_id,review.reviewer_id)
 or not private.capital_s11_native_read_allowed_v1(j.organization_id,b.revision_id,review.reviewer_id) then return false;end if;
 policy:=private.review_policy_snapshot_v1(j.organization_id,r.work_id,review.reviewer_id);
 if (policy->>'assignmentRequired')::boolean and not(policy->'roles'?'reviewer' or policy->'roles'?'approver') then return false;end if;
 if r.revision_decision_id is null then return private.execution_dispatch_before_s11_revision_v1(r.job_id,true);end if;
 if private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,review.reviewer_id) is null then return false;end if;
 walker:=r.job_id;
 end loop;
end $$;
create function private.execution_dispatch_is_current(p_job_id uuid,p_require_accepted boolean default true)
returns boolean language plpgsql volatile security definer set search_path='' as $$begin
 if private.execution_dispatch_before_s11_revision_v1(p_job_id,p_require_accepted) then return true;end if;
 return private.capital_s11_revision_dispatch_allowed_v1(p_job_id);
end $$;
create function private.queue_capital_s11_review_revision_v1() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.effect='return' and new.processing_job_id is not null and private.capital_s11_revision_dispatch_allowed_v1(new.processing_job_id) then
 update public.processing_jobs set status='queued',available_at=clock_timestamp() where organization_id=new.organization_id and id=new.processing_job_id and status='awaiting_approval';end if;
 return new;
end $$;
create trigger capital_s11_review_authorized_dispatch after insert on private.capital_artifact_review_projections for each row execute function private.queue_capital_s11_review_revision_v1();
revoke all on function private.execution_dispatch_before_s11_revision_v1(uuid,boolean),private.execution_dispatch_is_current(uuid,boolean),private.capital_s11_revision_dispatch_allowed_v1(uuid),private.queue_capital_s11_review_revision_v1() from public,anon,authenticated,service_role;

create function private.worker_load_capital_s11_revision_inputs_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 pr private.capital_artifact_review_projections;b private.capital_s11_native_bindings;r private.capital_s11_recipes;root_recipe private.capital_s11_recipes;
 lineage private.capital_s11_revision_inputs;seal private.capital_s11_recipe_seals;a private.capital_public_payload_allocations;
 predecessor record;predecessors jsonb:='[]';d timestamptz;bound timestamptz;visited uuid[]:='{}';depth integer:=0;
begin
 if not private.capital_s11_revision_dispatch_allowed_v1(j.id) then raise exception 'capital_s11_revision_inputs_denied' using errcode='42501';end if;
 select * into pr from private.capital_artifact_review_projections where organization_id=j.organization_id and processing_job_id=j.id and effect='return';
 select * into b from private.capital_s11_native_bindings where organization_id=j.organization_id and revision_id=pr.revision_id and capital_artifact_id=pr.capital_artifact_id;
 select * into r from private.capital_s11_recipes where organization_id=j.organization_id and id=b.recipe_id;
 select * into seal from private.capital_s11_recipe_seals where organization_id=j.organization_id and recipe_id=r.id;
 root_recipe:=r;
 while root_recipe.revision_decision_id is not null loop
 if root_recipe.id=any(visited) or depth>=64 then raise exception 'capital_s11_revision_ancestry_denied' using errcode='42501';end if;
 visited:=visited||root_recipe.id;depth:=depth+1;
 select * into lineage from private.capital_s11_revision_inputs where organization_id=j.organization_id and recipe_id=root_recipe.id;
 if lineage.recipe_id is null then raise exception 'capital_s11_revision_ancestry_denied' using errcode='42501';end if;
 select * into root_recipe from private.capital_s11_recipes where organization_id=j.organization_id and id=lineage.prior_recipe_id;
 if root_recipe.id is null then raise exception 'capital_s11_revision_ancestry_denied' using errcode='42501';end if;
 end loop;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on(x.organization_id,x.id)=(q.organization_id,q.allocation_id) where q.organization_id=j.organization_id and q.id=b.final_retained_payload_id;
 d:=private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id);
 if d is null or seal.id is null or not private.capital_body_physical_receipt_v1(j.organization_id,b.final_retained_payload_id) then raise exception 'capital_s11_revision_inputs_denied' using errcode='42501';end if;
 for predecessor in select p.*,q.allocation_id from private.capital_s11_task_projections p join private.capital_public_retained_payloads q on(q.organization_id,q.id)=(p.organization_id,p.derived_retained_payload_id)
 join public.capital_project_task_runs tr on(tr.organization_id,tr.id)=(p.organization_id,p.task_run_id)
 join public.capital_project_artifacts c on(c.organization_id,c.id)=(p.organization_id,p.capital_artifact_id)
 where p.organization_id=j.organization_id and p.recipe_id=root_recipe.id and p.task_id in('M01','M02','C11','S10')
 and tr.status='succeeded' and tr.output_fingerprint=p.artifact_fingerprint and c.artifact_fingerprint=p.artifact_fingerprint and c.status not in('stale','superseded')
 order by case p.task_id when 'M01' then 1 when 'M02' then 2 when 'C11' then 3 when 'S10' then 4 end loop
 bound:=private.capital_s11_allocation_deadline_v1(j.organization_id,predecessor.allocation_id,j.authorization_subject_id);
 if bound is null or not private.capital_body_physical_receipt_v1(j.organization_id,predecessor.derived_retained_payload_id) then raise exception 'capital_s11_revision_predecessor_denied' using errcode='42501';end if;
 d:=least(d,bound);
 predecessors:=predecessors||jsonb_build_array(jsonb_build_object('taskId',predecessor.task_id,'projection',private.capital_s11_task_projection_dto_v1(j.organization_id,root_recipe.id,predecessor.task_run_id,true),'retention',private.capital_s11_body_dto_v1(j.organization_id,predecessor.allocation_id,bound,true)));
 end loop;
 if jsonb_array_length(predecessors)<>4 or d<=clock_timestamp() or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_revision_predecessor_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-s11-revision-inputs.v1','jobId',j.id,'organizationId',j.organization_id,'workId',r.work_id,'priorRecipeId',r.id,'predecessorRecipeId',root_recipe.id,'priorRevisionId',b.revision_id,'reviewId',pr.review_id,'decisionId',pr.legacy_decision_id,
 'prior',private.capital_s11_body_dto_v1(j.organization_id,a.id,d,true),'predecessors',predecessors,'researchStatus',seal.research_status,
 'jurisdiction',seal.research_jurisdiction,'jurisdictionNeedsConfirmation',seal.research_jurisdiction_needs_confirmation,'strategyFingerprint',seal.research_strategy_fingerprint,
 'sources',(select jsonb_agg(jsonb_build_object('deliveryId',reference_id,'retainedPayloadId',retained_payload_id) order by component_no) from private.capital_s11_recipe_components where organization_id=j.organization_id and recipe_id=r.id and slot='source'),'expiresAt',d);
end $$;
create function private.worker_read_capital_s11_revision_body_v1(p_job_id uuid,p_capability_token text,p_retained_payload_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$declare grant_row jsonb:=private.worker_load_capital_s11_revision_inputs_v1(p_job_id,p_capability_token);begin
 if grant_row#>>'{prior,retainedPayloadId}' is distinct from p_retained_payload_id::text then raise exception 'capital_s11_revision_body_denied' using errcode='42501';end if;
 return grant_row->'prior';end $$;
create function private.worker_read_capital_s11_revision_task_v1(p_job_id uuid,p_capability_token text,p_task_run_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$declare grant_row jsonb:=private.worker_load_capital_s11_revision_inputs_v1(p_job_id,p_capability_token);result jsonb;begin
 select x->'retention' into result from jsonb_array_elements(grant_row->'predecessors')x where x#>>'{projection,taskRunId}'=p_task_run_id::text;
 if result is null then raise exception 'capital_s11_revision_task_denied' using errcode='42501';end if;return result;end $$;
create function public.worker_load_capital_s11_revision_inputs_v1(p_job_id uuid,p_capability_token text) returns jsonb language sql security invoker set search_path='' as $$select private.worker_load_capital_s11_revision_inputs_v1(p_job_id,p_capability_token);$$;
create function public.worker_read_capital_s11_revision_body_v1(p_job_id uuid,p_capability_token text,p_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.worker_read_capital_s11_revision_body_v1(p_job_id,p_capability_token,p_retained_payload_id);$$;
create function public.worker_read_capital_s11_revision_task_v1(p_job_id uuid,p_capability_token text,p_task_run_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.worker_read_capital_s11_revision_task_v1(p_job_id,p_capability_token,p_task_run_id);$$;
revoke all on function private.worker_load_capital_s11_revision_inputs_v1(uuid,text),public.worker_load_capital_s11_revision_inputs_v1(uuid,text),private.worker_read_capital_s11_revision_body_v1(uuid,text,uuid),public.worker_read_capital_s11_revision_body_v1(uuid,text,uuid),private.worker_read_capital_s11_revision_task_v1(uuid,text,uuid),public.worker_read_capital_s11_revision_task_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.worker_load_capital_s11_revision_inputs_v1(uuid,text),public.worker_load_capital_s11_revision_inputs_v1(uuid,text),private.worker_read_capital_s11_revision_body_v1(uuid,text,uuid),public.worker_read_capital_s11_revision_body_v1(uuid,text,uuid),private.worker_read_capital_s11_revision_task_v1(uuid,text,uuid),public.worker_read_capital_s11_revision_task_v1(uuid,text,uuid) to authenticated;

create function private.worker_read_capital_s11_revision_source_v1(p_job_id uuid,p_capability_token text,p_retained_payload_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare grant_row jsonb:=private.worker_load_capital_s11_revision_inputs_v1(p_job_id,p_capability_token);j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 c private.capital_s11_recipe_components;a private.capital_public_payload_allocations;q private.capital_public_retained_payloads;d timestamptz;margin integer;result jsonb;
begin
 select * into c from private.capital_s11_recipe_components where organization_id=j.organization_id and recipe_id=(grant_row->>'priorRecipeId')::uuid and slot='source' and retained_payload_id=p_retained_payload_id;
 select * into q from private.capital_public_retained_payloads where organization_id=j.organization_id and id=c.retained_payload_id;
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and id=q.allocation_id and content_kind='public_source' and license_id=c.license_id and delivery_id=c.reference_id;
 if c.id is null or a.id is null or not private.capital_body_physical_receipt_v1(j.organization_id,q.id) then raise exception 'capital_s11_recovery_source_denied' using errcode='42501';end if;
 d:=private.capital_public_retention_deadline_v1(a.license_id,j.organization_id,a.retained_at,a.policy_id);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=a.policy_id;
 if d is null or least(a.purge_at,d-make_interval(secs=>margin))<=clock_timestamp() or not private.capital_body_retention_healthy_v1(a.policy_id,j.organization_id,a.id) then raise exception 'capital_s11_recovery_source_denied' using errcode='42501';end if;
 result:=jsonb_build_object('schemaVersion','capital-public-storage-scope.v1','state','complete','allocationId',a.id,'retainedPayloadId',q.id,'deliveryId',a.delivery_id,
 'bucket',a.bucket_id,'path',a.object_path,'payloadFingerprint',a.payload_fingerprint,'byteLength',a.byte_length,'storageObjectId',q.storage_object_id,'storageVersion',q.storage_version,
 'retainedAt',a.retained_at,'uploadExpiresAt',a.upload_expires_at,'expiresAt',least(a.expires_at,d),'purgeAt',least(a.purge_at,d-make_interval(secs=>margin)));
 if private.capital_s11_recipe_deadline_v1(j.organization_id,(grant_row->>'priorRecipeId')::uuid,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_recovery_source_denied' using errcode='42501';end if;
 return result;
end; $$;

-- Old prepare commands cannot create a revision lacking physical ancestry.
alter function private.worker_prepare_capital_s11_recipe_v1(uuid,text) rename to worker_prepare_capital_s11_initial_recipe_v1;
create function public.worker_read_capital_s11_revision_source_v1(p_job_id uuid,p_capability_token text,p_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.worker_read_capital_s11_revision_source_v1(p_job_id,p_capability_token,p_retained_payload_id);$$;
revoke all on function private.worker_read_capital_s11_revision_source_v1(uuid,text,uuid),public.worker_read_capital_s11_revision_source_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.worker_read_capital_s11_revision_source_v1(uuid,text,uuid),public.worker_read_capital_s11_revision_source_v1(uuid,text,uuid) to authenticated;

create function private.capital_s11_revision_context_v1(p_job_id uuid,p_capability_token text,p_prior_body jsonb,p_predecessor_bodies jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare g jsonb:=private.worker_load_capital_s11_revision_inputs_v1(p_job_id,p_capability_token);c jsonb;ref jsonb;supplied jsonb;deps jsonb:='[]';
begin
 if jsonb_typeof(p_prior_body) is distinct from 'object' or p_prior_body->>'schemaVersion' is distinct from 'capital-planning-map.v1'
 or encode(extensions.digest(p_prior_body::text,'sha256'),'hex') is distinct from g#>>'{prior,payloadFingerprint}'
 or octet_length(p_prior_body::text) is distinct from(g#>>'{prior,byteLength}')::bigint
 or jsonb_typeof(p_predecessor_bodies) is distinct from 'array' or jsonb_array_length(p_predecessor_bodies)<>4 then raise exception 'capital_s11_revision_body_changed' using errcode='42501';end if;
 for ref in select value from jsonb_array_elements(g->'predecessors') loop
 select x into supplied from jsonb_array_elements(p_predecessor_bodies)x where x->>'taskRunId'=ref#>>'{projection,taskRunId}';
 if supplied is null or (select count(*) from jsonb_array_elements(p_predecessor_bodies)x where x->>'taskRunId'=ref#>>'{projection,taskRunId}')<>1
 or (select count(*) from jsonb_object_keys(supplied))<>2 or not(supplied?'body')
 or encode(extensions.digest((supplied->'body')::text,'sha256'),'hex') is distinct from ref#>>'{retention,payloadFingerprint}'
 or octet_length((supplied->'body')::text) is distinct from(ref#>>'{retention,byteLength}')::bigint
 or supplied#>>'{body,schemaVersion}' is distinct from 'capital-planning-task.v1'
 or supplied#>>'{body,taskId}' is distinct from ref->>'taskId' then raise exception 'capital_s11_revision_predecessor_changed' using errcode='42501';end if;
 if ref->>'taskId' in('C11','S10') then
 deps:=deps||jsonb_build_array(jsonb_build_object('task_id',ref->>'taskId','id',ref#>>'{projection,capitalArtifactId}','artifact_fingerprint',ref#>>'{projection,artifactFingerprint}','content',supplied#>'{body,content}','evidence_refs','[]'::jsonb));end if;
 end loop;
 c:=private.worker_load_capital_project_context_v6(p_job_id,p_capability_token);
 if c#>>'{revision,decision_id}' is distinct from g->>'decisionId' or c#>>'{revision,of_artifact_id}' is null then raise exception 'capital_s11_revision_context_denied' using errcode='42501';end if;
 c:=jsonb_set(c,'{revision,prior_content}',p_prior_body,false);
 c:=jsonb_set(c,'{dependency_artifacts}',deps,true);
 if c#>'{revision,prior_content}' is distinct from p_prior_body or c->'dependency_artifacts' is distinct from deps then raise exception 'capital_s11_revision_context_denied' using errcode='42501';end if;
 return c;
end $$;
revoke all on function private.capital_s11_revision_context_v1(uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;

create function private.worker_prepare_capital_s11_revision_recipe_v1(p_job_id uuid,p_capability_token text,p_prior_body jsonb,p_predecessor_bodies jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 g jsonb;c jsonb;r private.capital_s11_recipes;p private.capital_public_retention_policies;stamp timestamptz:=clock_timestamp();fp text;
begin
 if j.payload?'revision_of_artifact_id' and not exists(select 1 from public.capital_project_artifact_decisions d where d.organization_id=j.organization_id and d.id::text=j.payload->>'correction_decision_id' and d.artifact_id::text=j.payload->>'revision_of_artifact_id' and d.capital_project_id=coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid) and d.decision='request_changes' and d.decided_by=j.authorization_subject_id) then raise exception 'capital_s11_correction_denied' using errcode='42501';end if;
 if j.payload->>'analysis_scope' is distinct from 'capital_planning' or j.payload->'capital_task_ids' is distinct from '["M04","S11"]'::jsonb then raise exception 'capital_s11_recipe_denied' using errcode='42501';end if;
 g:=private.worker_load_capital_s11_revision_inputs_v1(j.id,p_capability_token);
 c:=private.capital_s11_revision_context_v1(j.id,p_capability_token,p_prior_body,p_predecessor_bodies);
 fp:=encode(extensions.digest(c::text,'sha256'),'hex');
 select x.* into p from private.capital_public_retention_policies x join private.capital_public_retention_controls ctl on ctl.policy_id=x.id where ctl.singleton and ctl.enabled;
 if p.id is null or not private.capital_public_retention_healthy_v1(j.leased_by,p.id) then raise exception 'capital_s11_retention_denied' using errcode='42501';end if;
 select * into r from private.capital_s11_recipes where organization_id=j.organization_id and job_id=j.id;
 if r.id is not null then
 if r.context_fingerprint<>fp or r.worker_account_id<>auth.uid() or r.human_subject_id<>j.authorization_subject_id then raise exception 'capital_s11_recipe_changed' using errcode='40001';end if;
 else
 if exists(select 1 from private.capital_s11_recipes existing where existing.organization_id=j.organization_id and existing.work_id=coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid) and existing.plan_id=(j.payload->>'capital_project_plan_id')::uuid and existing.brief_id=(j.payload->>'capital_project_brief_id')::uuid and existing.revision_decision_id is not distinct from (j.payload->>'correction_decision_id')::uuid) then raise exception 'capital_s11_recovery_required' using errcode='42501';end if;
 insert into private.capital_s11_recipes(organization_id,work_id,job_id,plan_id,brief_id,session_id,human_subject_id,worker_account_id,revision_decision_id,original_attempt,
 plan_fingerprint,context_fingerprint,base_authority_fingerprint,as_of_date,locale,renderer_version,captured_at,expires_at,retention_policy_id)
 values(j.organization_id,(j.payload->>'capital_project_id')::uuid,j.id,(j.payload->>'capital_project_plan_id')::uuid,(j.payload->>'capital_project_brief_id')::uuid,j.intake_session_id,
 j.authorization_subject_id,auth.uid(),(j.payload->>'correction_decision_id')::uuid,j.attempts,c#>>'{plan,fingerprint}',fp,private.capital_s11_base_authority_fingerprint_v1(j.organization_id,j.id,j.intake_session_id,(j.payload->>'capital_project_brief_id')::uuid,(j.payload->>'capital_project_plan_id')::uuid,j.authorization_subject_id,stamp),(stamp at time zone 'UTC')::date,c#>>'{session,locale}',
 'capital-public-task-renderer.s11.v1',stamp,stamp+make_interval(secs=>p.maximum_retention_seconds),p.id) returning * into r;
 end if;
 insert into private.capital_s11_revision_inputs(organization_id,recipe_id,prior_recipe_id,review_id,prior_revision_id,prior_final_retained_payload_id,predecessor_recipe_id,depth)
 values(j.organization_id,r.id,(g->>'priorRecipeId')::uuid,(g->>'reviewId')::uuid,(g->>'priorRevisionId')::uuid,(g#>>'{prior,retainedPayloadId}')::uuid,(g->>'predecessorRecipeId')::uuid,1+coalesce((select depth from private.capital_s11_revision_inputs where organization_id=j.organization_id and recipe_id=(g->>'priorRecipeId')::uuid),0)) on conflict do nothing;
 if not exists(select 1 from private.capital_s11_revision_inputs x join private.capital_s11_recipes prior on(prior.organization_id,prior.id)=(x.organization_id,x.prior_recipe_id) where x.organization_id=j.organization_id and x.recipe_id=r.id and x.prior_recipe_id=(g->>'priorRecipeId')::uuid and x.review_id=(g->>'reviewId')::uuid and x.prior_revision_id=(g->>'priorRevisionId')::uuid and x.predecessor_recipe_id=(g->>'predecessorRecipeId')::uuid and prior.captured_at<r.captured_at) then raise exception 'capital_s11_revision_lineage_changed' using errcode='42501';end if;
 if private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_recipe_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-s11-base-context.v1','recipeId',r.id,'jobId',j.id,'organizationId',j.organization_id,'workId',r.work_id,
 'planId',r.plan_id,'planFingerprint',r.plan_fingerprint,'asOfDate',r.as_of_date,'locale',r.locale,'contextFingerprint',r.context_fingerprint,
 'canonicalContext',c::text,'expiresAt',r.expires_at);
end; $$;


-- The existing recipe checks keep all source/authority/body restrictions. Only
-- a recorded human lineage can resolve an original predecessor projection.
do $$declare def text;needle text:='where bridge.organization_id=p_org and bridge.recipe_id=r.id and bridge.capital_artifact_id=c.dependency_artifact_id;';replacement text;begin
 def:=pg_get_functiondef('private.capital_s11_recipe_deadline_v1(uuid,uuid,uuid)'::regprocedure);
 if position(needle in def)=0 then raise exception 's11_revision_dependency_deadline_drift';end if;
 replacement:='where bridge.organization_id=p_org and bridge.capital_artifact_id=c.dependency_artifact_id and(bridge.recipe_id=r.id or exists(select 1 from private.capital_s11_revision_inputs lineage where lineage.organization_id=p_org and lineage.recipe_id=r.id and lineage.predecessor_recipe_id=bridge.recipe_id and bridge.task_id in(''M01'',''M02'',''C11'',''S10'')));';
 execute replace(def,needle,replacement);
end $$;
alter function private.capital_s11_recipe_deadline_v1(uuid,uuid,uuid) rename to capital_s11_recipe_deadline_before_revision_v1;
create function private.capital_s11_recipe_deadline_v1(p_org uuid,p_recipe uuid,p_subject uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare walker uuid:=p_recipe;visited uuid[]:='{}';depth integer:=0;r private.capital_s11_recipes;prior private.capital_s11_recipes;
 proof private.capital_s11_revision_inputs;a private.capital_public_payload_allocations;d timestamptz;bound timestamptz;
begin
 loop
 if walker=any(visited) or depth>=64 then return null;end if;visited:=visited||walker;depth:=depth+1;
 select * into r from private.capital_s11_recipes where organization_id=p_org and id=walker;
 if r.id is null then return null;end if;
 bound:=private.capital_s11_recipe_deadline_before_revision_v1(p_org,r.id,p_subject);
 if bound is null then return null;end if;d:=least(d,bound);
 if r.revision_decision_id is null then return d;end if;
 select * into proof from private.capital_s11_revision_inputs where organization_id=p_org and recipe_id=r.id;
 select * into prior from private.capital_s11_recipes where organization_id=p_org and id=proof.prior_recipe_id;
 if proof.recipe_id is null or prior.id is null or prior.captured_at>=r.captured_at or proof.depth>64 then return null;end if;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on(x.organization_id,x.id)=(q.organization_id,q.allocation_id)
 where q.organization_id=p_org and q.id=proof.prior_final_retained_payload_id;
 if a.id is null or not private.capital_body_physical_receipt_v1(p_org,proof.prior_final_retained_payload_id) then return null;end if;
 d:=least(d,a.expires_at,a.purge_at);if d<=clock_timestamp() then return null;end if;
 walker:=prior.id;
 end loop;
end $$;
revoke all on function private.capital_s11_recipe_deadline_before_revision_v1(uuid,uuid,uuid),private.capital_s11_recipe_deadline_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- A superseded intermediate is still its immutable historical input; stale,
-- revoked, missing, mismatched or expired history never becomes eligible.
do $$declare def text;needle text:='if projection_count<>34 then return false;end if;';replacement text;begin
 def:=pg_get_functiondef('private.capital_s11_native_read_allowed_v1(uuid,uuid,uuid)'::regprocedure);
 if position(needle in def)=0 or position('projection.artifact_status in(''stale'',''superseded'')' in def)=0 then raise exception 's11_revision_projection_read_drift';end if;
 def:=replace(def,'projection.artifact_status in(''stale'',''superseded'')','projection.artifact_status=''stale''');
 replacement:='if exists(select 1 from private.capital_s11_recipes recipe where recipe.organization_id=p_org and recipe.id=b.recipe_id and recipe.revision_decision_id is not null) then
 if projection_count<>1 or not exists(select 1 from private.capital_s11_task_projections p where p.organization_id=p_org and p.recipe_id=b.recipe_id and p.task_id=''M04'' and p.task_run_id=b.producer_task_run_id and p.accepted_invocation_id=b.accepted_invocation_id and p.parsed_retained_payload_id=b.parsed_retained_payload_id) then return false;end if;
 elsif projection_count<>34 then return false;end if;';
 execute replace(def,needle,replacement);
end $$;
alter function private.capital_s11_native_read_allowed_v1(uuid,uuid,uuid) rename to capital_s11_native_read_before_revision_v1;
create function private.capital_s11_native_read_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare walker uuid:=p_revision;visited uuid[]:='{}';depth integer:=0;b private.capital_s11_native_bindings;proof private.capital_s11_revision_inputs;
begin
 loop
 if walker=any(visited) or depth>=64 then return false;end if;visited:=visited||walker;depth:=depth+1;
 if not private.capital_s11_native_read_before_revision_v1(p_org,walker,p_actor) then return false;end if;
 select * into b from private.capital_s11_native_bindings where organization_id=p_org and revision_id=walker;
 if b.id is null then return true;end if;
 if not exists(select 1 from private.capital_s11_recipes r where r.organization_id=p_org and r.id=b.recipe_id and r.revision_decision_id is not null) then return true;end if;
 select * into proof from private.capital_s11_revision_inputs where organization_id=p_org and recipe_id=b.recipe_id;
 if proof.recipe_id is null then return false;end if;walker:=proof.prior_revision_id;
 end loop;
end $$;
revoke all on function private.capital_s11_native_read_before_revision_v1(uuid,uuid,uuid),private.capital_s11_native_read_allowed_v1(uuid,uuid,uuid),private.worker_prepare_capital_s11_revision_recipe_v1(uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;

-- A real human return authorizes a new M04 attempt while preserving the original
-- succeeded producer as an immutable physical ancestor. Generic task start keeps
-- its existing invalidation requirement and is never widened.
create function private.start_capital_s11_revision_producer_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_input_fingerprint text,p_context_manifest jsonb)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 r private.capital_s11_recipes;pt public.capital_project_plan_tasks;old public.capital_project_task_runs;
 g jsonb;item jsonb;result uuid;attempt integer;
begin
 g:=private.worker_load_capital_s11_revision_inputs_v1(j.id,p_capability_token);
 select * into r from private.capital_s11_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 if r.id is null or r.revision_decision_id is distinct from(g->>'decisionId')::uuid
 or not exists(select 1 from private.capital_s11_revision_inputs proof where proof.organization_id=j.organization_id and proof.recipe_id=r.id and proof.review_id=(g->>'reviewId')::uuid and proof.predecessor_recipe_id=(g->>'predecessorRecipeId')::uuid)
 or p_input_fingerprint is null or p_input_fingerprint!~'^[a-f0-9]{64}$'
 or p_context_manifest->>'schemaVersion' is distinct from 'capital-s11-task-context.v1'
 or p_context_manifest->>'recipeId' is distinct from r.id::text
 or not private.capital_s11_revision_dispatch_allowed_v1(j.id)
 then raise exception 'capital_s11_revision_producer_denied' using errcode='42501';end if;
 perform 1 from public.capital_project_plans p where p.organization_id=j.organization_id and p.id=r.plan_id and p.capital_project_id=r.work_id and p.status='active' for update;
 if not found then raise exception 'capital_s11_revision_plan_denied' using errcode='42501';end if;
 select * into pt from public.capital_project_plan_tasks where organization_id=j.organization_id and plan_id=r.plan_id and task_id='M04';
 if pt.id is null or pt.dependencies is distinct from array['M01','M02']::text[] then raise exception 'capital_s11_revision_task_spec_denied' using errcode='42501';end if;
 for item in select value from jsonb_array_elements(g->'predecessors') where value->>'taskId'=any(pt.dependencies) loop
 if not exists(select 1 from public.capital_project_task_runs tr where tr.organization_id=j.organization_id and tr.id=(item#>>'{projection,taskRunId}')::uuid and tr.plan_id=r.plan_id and tr.status='succeeded') then raise exception 'capital_s11_revision_predecessor_denied' using errcode='42501';end if;
 end loop;
 select * into old from public.capital_project_task_runs where organization_id=j.organization_id and plan_task_id=pt.id order by attempt_no desc limit 1 for update;
 if old.id is not null and old.processing_job_id=j.id then
 if old.input_fingerprint=p_input_fingerprint and old.executor_key='offroad.capital_planning' and old.executor_version='2026.09.24-v2' and old.status in('running','succeeded') then return old.id;end if;
 raise exception 'capital_s11_revision_attempt_conflict' using errcode='23505';end if;
 if old.id is null or old.status<>'succeeded' then raise exception 'capital_s11_revision_prior_producer_denied' using errcode='42501';end if;
 attempt:=old.attempt_no+1;if attempt>10 then raise exception 'capital_task_attempt_limit' using errcode='54000';end if;
 insert into public.capital_project_task_runs(organization_id,capital_project_id,plan_id,plan_task_id,processing_job_id,attempt_no,status,trigger_event,context_manifest,input_fingerprint,executor_key,executor_version,started_at)
 values(j.organization_id,r.work_id,r.plan_id,pt.id,j.id,attempt,'running',coalesce(j.payload->'trigger_event','{}'),p_context_manifest,p_input_fingerprint,'offroad.capital_planning','2026.09.24-v2',clock_timestamp()) returning id into result;
 if not private.capital_s11_revision_dispatch_allowed_v1(j.id) then raise exception 'capital_s11_revision_authority_changed' using errcode='42501';end if;
 return result;
end $$;
revoke all on function private.start_capital_s11_revision_producer_v1(uuid,text,uuid,text,jsonb) from public,anon,authenticated,service_role;

-- Reuse the existing finite context allocator and physical writer. Only the
-- source of its canonical context changes, after physical prior-body validation.
do $$declare def text;needle text:='c:=private.worker_load_capital_project_context_v6(j.id,p_capability_token);';begin
 def:=pg_get_functiondef('private.worker_prepare_capital_s11_context_v1(uuid,text,uuid,uuid)'::regprocedure);
 if position(needle in def)=0 then raise exception 's11_revision_context_allocator_drift';end if;
 def:=replace(def,'private.worker_prepare_capital_s11_context_v1(p_job_id uuid, p_capability_token text, p_recipe_id uuid, p_request_id uuid)',
 'private.worker_prepare_capital_s11_revision_context_v1(p_job_id uuid, p_capability_token text, p_recipe_id uuid, p_request_id uuid, p_prior_body jsonb, p_predecessor_bodies jsonb)');
 if position('worker_prepare_capital_s11_revision_context_v1' in def)=0 then raise exception 's11_revision_context_signature_drift';end if;
 execute replace(def,needle,'c:=private.capital_s11_revision_context_v1(j.id,p_capability_token,p_prior_body,p_predecessor_bodies);');
end $$;
create function public.worker_prepare_capital_s11_revision_recipe_v1(p_job_id uuid,p_capability_token text,p_prior_body jsonb,p_predecessor_bodies jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_prepare_capital_s11_revision_recipe_v1(p_job_id,p_capability_token,p_prior_body,p_predecessor_bodies)$$;
create function public.worker_prepare_capital_s11_revision_context_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_prior_body jsonb,p_predecessor_bodies jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_prepare_capital_s11_revision_context_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_prior_body,p_predecessor_bodies)$$;
revoke all on function private.worker_prepare_capital_s11_revision_recipe_v1(uuid,text,jsonb,jsonb),public.worker_prepare_capital_s11_revision_recipe_v1(uuid,text,jsonb,jsonb),private.worker_prepare_capital_s11_revision_context_v1(uuid,text,uuid,uuid,jsonb,jsonb),public.worker_prepare_capital_s11_revision_context_v1(uuid,text,uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.worker_prepare_capital_s11_revision_recipe_v1(uuid,text,jsonb,jsonb),public.worker_prepare_capital_s11_revision_recipe_v1(uuid,text,jsonb,jsonb),private.worker_prepare_capital_s11_revision_context_v1(uuid,text,uuid,uuid,jsonb,jsonb),public.worker_prepare_capital_s11_revision_context_v1(uuid,text,uuid,uuid,jsonb,jsonb) to authenticated;

-- Ordinary context capture cannot produce a revision with missing prior bytes.
create function private.worker_prepare_capital_s11_recipe_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);begin
 if j.payload?'revision_of_artifact_id' then raise exception 'capital_s11_revision_physical_input_required' using errcode='42501';end if;
 return private.worker_prepare_capital_s11_initial_recipe_v1(j.id,p_capability_token);
end $$;
revoke all on function private.worker_prepare_capital_s11_initial_recipe_v1(uuid,text),private.worker_prepare_capital_s11_recipe_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_prepare_capital_s11_recipe_v1(uuid,text) to authenticated;

-- Seal revisions only against their four exact original physical predecessors.
do $$declare def text;needle text;replacement text;begin
 def:=pg_get_functiondef('private.worker_finalize_capital_s11_recipe_v1(uuid,text,uuid,uuid,jsonb,text,text,text,text,bigint,integer,text,text,boolean,text)'::regprocedure);
 needle:=$n0$if dep.id is null or not exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id join public.capital_project_plan_tasks m07 on m07.organization_id=pt.organization_id and m07.plan_id=r.plan_id and m07.task_id='M04' where tr.organization_id=j.organization_id and tr.id=dep.task_run_id and tr.status='succeeded' and pt.task_id=any(m07.dependencies)) then raise exception 'capital_s11_dependency_denied' using errcode='42501';end if;$n0$;replacement:=$r0$if r.revision_decision_id is not null then
 if dep.id is null or not exists(select 1 from private.capital_s11_revision_inputs lineage
 join private.capital_s11_task_projections proof on proof.organization_id=lineage.organization_id and proof.recipe_id=lineage.predecessor_recipe_id
 join public.capital_project_task_runs tr on tr.organization_id=proof.organization_id and tr.id=proof.task_run_id
 where lineage.organization_id=j.organization_id and lineage.recipe_id=r.id and proof.capital_artifact_id=dep.id
 and proof.task_id in('M01','M02','C11','S10') and proof.artifact_fingerprint=dep.artifact_fingerprint and tr.plan_id=r.plan_id and tr.status='succeeded')
 then raise exception 'capital_s11_revision_dependency_denied' using errcode='42501';end if;
 else if dep.id is null or not exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id join public.capital_project_plan_tasks m07 on m07.organization_id=pt.organization_id and m07.plan_id=r.plan_id and m07.task_id='M04' where tr.organization_id=j.organization_id and tr.id=dep.task_run_id and tr.status='succeeded' and pt.task_id=any(m07.dependencies)) then raise exception 'capital_s11_dependency_denied' using errcode='42501';end if; end if;$r0$;
 if position(needle in def)=0 then raise exception 's11_revision_seal_drift_0';end if;def:=replace(def,needle,replacement);
 needle:=$n1$bridge.organization_id=j.organization_id and bridge.recipe_id=r.id and bridge.capital_artifact_id=dep.id and bridge.artifact_fingerprint=dep.artifact_fingerprint$n1$;replacement:=$r1$bridge.organization_id=j.organization_id and bridge.capital_artifact_id=dep.id and bridge.artifact_fingerprint=dep.artifact_fingerprint
 and(bridge.recipe_id=r.id or exists(select 1 from private.capital_s11_revision_inputs lineage where lineage.organization_id=j.organization_id and lineage.recipe_id=r.id and lineage.predecessor_recipe_id=bridge.recipe_id and bridge.task_id in('M01','M02','C11','S10')))$r1$;
 if position(needle in def)=0 then raise exception 's11_revision_seal_drift_1';end if;def:=replace(def,needle,replacement);
 needle:=$n2$run:=private.worker_start_capital_project_task(j.id,p_capability_token,'M04','offroad.capital_planning','2026.09.24-v2',p_reconstruction_fingerprint,jsonb_build_object('schemaVersion','capital-s11-task-context.v1','recipeId',r.id,'recipeFingerprint',fp,'contextRetainedPayloadId',p_context_retained_payload_id));$n2$;replacement:=$r2$if r.revision_decision_id is not null then
 if (select count(*) from jsonb_array_elements(p_components) c where c->>'slot'='dependency')<>4
 or exists(select 1 from private.capital_s11_task_projections proof join private.capital_s11_revision_inputs lineage on lineage.organization_id=proof.organization_id and lineage.predecessor_recipe_id=proof.recipe_id
 where lineage.organization_id=j.organization_id and lineage.recipe_id=r.id and proof.task_id in('M01','M02','C11','S10')
 and not exists(select 1 from jsonb_array_elements(p_components) c where c->>'slot'='dependency' and c->>'id'=proof.capital_artifact_id::text))
 then raise exception 'capital_s11_revision_dependency_closure_invalid' using errcode='42501';end if;
 run:=private.start_capital_s11_revision_producer_v1(j.id,p_capability_token,r.id,p_reconstruction_fingerprint,jsonb_build_object('schemaVersion','capital-s11-task-context.v1','recipeId',r.id,'recipeFingerprint',fp,'contextRetainedPayloadId',p_context_retained_payload_id));
 else run:=private.worker_start_capital_project_task(j.id,p_capability_token,'M04','offroad.capital_planning','2026.09.24-v2',p_reconstruction_fingerprint,jsonb_build_object('schemaVersion','capital-s11-task-context.v1','recipeId',r.id,'recipeFingerprint',fp,'contextRetainedPayloadId',p_context_retained_payload_id)); end if;$r2$;
 if position(needle in def)=0 then raise exception 's11_revision_seal_drift_2';end if;def:=replace(def,needle,replacement);
 execute def;end $$;

-- The new M04 depends on the original M01/M02 physical projections selected by
-- its human lineage. No other task or recipe can obtain a cross-job dependency.
do $$declare def text;needle text;replacement text;begin
 def:=pg_get_functiondef('private.worker_commit_capital_s11_task_projection_core_v1(uuid,text,uuid,uuid,uuid,boolean)'::regprocedure);
 needle:='and dr.processing_job_id in(r.job_id,j.id) and dr.status=''succeeded'' and c.status not in(''stale'',''superseded'')';
 replacement:='and(dr.processing_job_id in(r.job_id,j.id) or(pt.task_id=''M04'' and dep in(''M01'',''M02'') and exists(select 1 from private.capital_s11_revision_inputs lineage join private.capital_s11_task_projections proof on proof.organization_id=lineage.organization_id and proof.recipe_id=lineage.predecessor_recipe_id where lineage.organization_id=j.organization_id and lineage.recipe_id=r.id and proof.task_id=dep and proof.task_run_id=dr.id and proof.capital_artifact_id=c.id and proof.artifact_fingerprint=c.artifact_fingerprint))) and dr.status=''succeeded'' and c.status not in(''stale'',''superseded'')';
 if position(needle in def)=0 then raise exception 's11_revision_projection_dependency_job_drift';end if;def:=replace(def,needle,replacement);
 needle:='x.organization_id=j.organization_id and x.recipe_id=r.id and x.capital_artifact_id=dep_art.id and x.artifact_fingerprint=dep_art.artifact_fingerprint';
 replacement:='x.organization_id=j.organization_id and x.capital_artifact_id=dep_art.id and x.artifact_fingerprint=dep_art.artifact_fingerprint and(x.recipe_id=r.id or(pt.task_id=''M04'' and dep in(''M01'',''M02'') and exists(select 1 from private.capital_s11_revision_inputs lineage where lineage.organization_id=j.organization_id and lineage.recipe_id=r.id and lineage.predecessor_recipe_id=x.recipe_id and x.task_id=dep)))';
 if position(needle in def)=0 then raise exception 's11_revision_projection_dependency_body_drift';end if;execute replace(def,needle,replacement);
end $$;

-- Generic derived artifacts inherit the real revision ancestry as well as the
-- native recipe closure. Only the immutable server-selected lineage chooses it.
create function private.link_capital_s11_revision_parent_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare proof private.capital_s11_revision_inputs;
begin
 select x.* into proof from private.capital_s11_native_bindings binding join private.capital_s11_revision_inputs x on x.organization_id=binding.organization_id and x.recipe_id=binding.recipe_id
 where binding.organization_id=new.organization_id and binding.revision_id=new.id;
 if proof.recipe_id is not null then
 insert into private.artifact_dependency_links(organization_id,revision_id,link_kind,derived_from_revision_id)
 values(new.organization_id,new.id,'artifact_revision',proof.prior_revision_id);
 end if;return new;
end $$;
create trigger capital_s11_revision_parent after insert on public.artifact_revisions for each row execute function private.link_capital_s11_revision_parent_v1();
revoke all on function private.link_capital_s11_revision_parent_v1() from public,anon,authenticated,service_role;
