-- Forward-only 3R. Applied after native M07, never edits its published migration.
set search_path='';
-- Authority of historical bodies is separate from eligibility for a new review.
do $$declare def text;needle text:= $s$and c.status not in ('stale','superseded')$s$;begin
 def:=pg_get_functiondef('private.capital_m07_native_read_allowed_v1(uuid,uuid,uuid)'::regprocedure);
 if position(needle in def)=0 then raise exception 'capital_review_authority_patch_missing';end if;
 execute replace(def,needle,'');
end $$;
-- An output's supersession is not revocation of its own historical input/body.
-- Dependent recipes still wake; every source/grant/purge event retains its wake.
do $$declare def text;needle text:=' union select recipe_id from private.capital_m07_native_bindings where organization_id=org and capital_artifact_id=(row_data->>''id'')::uuid';begin
 def:=pg_get_functiondef('private.wake_capital_m07_retention_v1()'::regprocedure);
 if position(needle in def)=0 then raise exception 'capital_review_retention_wake_patch_missing';end if;
 def:=replace(def,needle,'');
 -- An operational touch/phase does not change the recipe's consumed authority.
 if position('begin'||chr(10)||' if tg_table_name' in def)=0 then raise exception 'capital_review_retention_guard_patch_missing';end if;
 def:=replace(def,'begin'||chr(10)||' if tg_table_name','begin'||chr(10)||$guard$ if tg_table_name='capital_projects' and tg_op='UPDATE' and(to_jsonb(new)-array['updated_at','current_phase']) is not distinct from(to_jsonb(old)-array['updated_at','current_phase']) then return new;end if;
 if tg_table_name$guard$);
 execute def;
end $$;
-- Display readers keep the current-state gate; history/review sources keep rights and retention.
alter function private.read_capital_m07_result_v1(uuid) rename to read_capital_m07_result_before_review_cutover_v1;
revoke all on function private.read_capital_m07_result_before_review_cutover_v1(uuid) from public,anon,authenticated,service_role;
create function private.read_capital_m07_result_v1(p_revision_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb;begin
 if exists(select 1 from private.capital_m07_native_bindings b join public.capital_project_artifacts c on(c.organization_id,c.id)=(b.organization_id,b.capital_artifact_id)
 where b.revision_id=p_revision_id and c.status in('stale','superseded')) then raise exception 'capital_m07_read_denied' using errcode='42501';end if;
 result:=private.read_capital_m07_result_before_review_cutover_v1(p_revision_id);
 return result;
end $$;
revoke all on function private.read_capital_m07_result_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function private.read_capital_m07_result_v1(uuid) to authenticated;
-- Superseded output can have historical reviews; that history is not release.
alter function private.artifact_revision_release_v1(public.artifact_revisions) rename to artifact_revision_release_before_capital_cutover_v1;
revoke all on function private.artifact_revision_release_before_capital_cutover_v1(public.artifact_revisions) from public,anon,authenticated,service_role;
create function private.artifact_revision_release_v1(r public.artifact_revisions)
returns text language plpgsql stable security definer set search_path='' as $$begin
 if exists(select 1 from private.capital_m07_native_bindings b join public.capital_project_artifacts c on(c.organization_id,c.id)=(b.organization_id,b.capital_artifact_id)
 where b.organization_id=r.organization_id and b.revision_id=r.id and c.status in('stale','superseded')) then return 'blocked';end if;
 return private.artifact_revision_release_before_capital_cutover_v1(r);
end $$;
revoke all on function private.artifact_revision_release_v1(public.artifact_revisions) from public,anon,authenticated,service_role;

-- Preserve immutable decisions as history; more than one human transition is legitimate.
do $$declare c record;begin
 for c in select conname from pg_constraint where conrelid='public.capital_project_artifact_decisions'::regclass and contype='u'
  and pg_get_constraintdef(oid)='UNIQUE (organization_id, artifact_id)' loop
 execute format('alter table public.capital_project_artifact_decisions drop constraint %I',c.conname);end loop;
end $$;
create table private.capital_artifact_review_projections(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,
 capital_artifact_id uuid not null,revision_id uuid not null,review_id uuid not null,legacy_decision_id uuid,
 processing_job_id uuid,processing_run_id uuid,effect text not null check(effect in('confirm','return','revoke_approval')),
 command_id uuid not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,review_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,capital_artifact_id) references public.capital_project_artifacts(organization_id,id),
 foreign key(organization_id,revision_id) references public.artifact_revisions(organization_id,id),
 foreign key(organization_id,review_id) references public.artifact_reviews(organization_id,id),
 foreign key(organization_id,legacy_decision_id) references public.capital_project_artifact_decisions(organization_id,id),
 foreign key(organization_id,processing_job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,processing_run_id) references public.processing_runs(organization_id,id)
);
create index capital_artifact_review_work_idx on private.capital_artifact_review_projections(organization_id,work_id);
create index capital_artifact_review_artifact_idx on private.capital_artifact_review_projections(organization_id,capital_artifact_id);
create index capital_artifact_review_revision_idx on private.capital_artifact_review_projections(organization_id,revision_id);
create index capital_artifact_review_legacy_idx on private.capital_artifact_review_projections(organization_id,legacy_decision_id);
create index capital_artifact_review_job_idx on private.capital_artifact_review_projections(organization_id,processing_job_id);
create index capital_artifact_review_run_idx on private.capital_artifact_review_projections(organization_id,processing_run_id);
create index capital_artifact_review_command_idx on private.capital_artifact_review_projections(organization_id,command_id);
alter table private.capital_artifact_review_projections enable row level security;
alter table private.capital_artifact_review_projections force row level security;
revoke all on private.capital_artifact_review_projections from public,anon,authenticated,service_role;
create policy capital_review_deny_select on private.capital_artifact_review_projections as restrictive for select to anon,authenticated using(false);
create policy capital_review_deny_insert on private.capital_artifact_review_projections as restrictive for insert to anon,authenticated with check(false);
create policy capital_review_deny_update on private.capital_artifact_review_projections as restrictive for update to anon,authenticated using(false);
create policy capital_review_deny_delete on private.capital_artifact_review_projections as restrictive for delete to anon,authenticated using(false);
create trigger capital_review_immutable before update or delete on private.capital_artifact_review_projections for each row execute function private.reject_review_history_mutation_v1();
create trigger capital_review_no_truncate before truncate on private.capital_artifact_review_projections for each statement execute function private.reject_review_history_mutation_v1();
create trigger capital_review_audit after insert on private.capital_artifact_review_projections for each row execute function private.capture_identity_audit_v1();

alter function private.artifact_review_preparer_v1(public.artifact_revisions) rename to artifact_review_preparer_before_capital_cutover_v1;
revoke all on function private.artifact_review_preparer_before_capital_cutover_v1(public.artifact_revisions) from public,anon,authenticated,service_role;
create function private.artifact_review_preparer_v1(p_revision public.artifact_revisions) returns uuid language plpgsql stable security definer set search_path='' as $$
declare preparer uuid;begin
 select r.human_subject_id into preparer from private.capital_m07_native_bindings b join private.capital_m07_recipes r on(r.organization_id,r.id)=(b.organization_id,b.recipe_id)
 where b.organization_id=p_revision.organization_id and b.revision_id=p_revision.id;
 if found then return preparer;end if;
 return private.artifact_review_preparer_before_capital_cutover_v1(p_revision);
end $$;
revoke all on function private.artifact_review_preparer_v1(public.artifact_revisions) from public,anon,authenticated,service_role;

create function private.capital_artifact_approval_active_v2(p_org uuid,p_revision uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.artifact_reviews r where r.organization_id=p_org and r.revision_id=p_revision and r.act in('approve','reaffirm')
 and private.artifact_review_is_active_v1(p_org,r.id));
$$;
revoke all on function private.capital_artifact_approval_active_v2(uuid,uuid) from public,anon,authenticated,service_role;

create function private.read_capital_project_artifact_review_v2(p_project_id uuid,p_artifact_id uuid,p_revision_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare org uuid;actor uuid:=auth.uid();b private.capital_m07_native_bindings;c public.capital_project_artifacts;r public.artifact_revisions;recipe private.capital_m07_recipes;active boolean;begin
 select organization_id into org from public.capital_projects where id=p_project_id and status<>'archived';
 if org is null or not private.can_access_resource_v1(org,p_project_id,'read') then raise exception 'capital_artifact_review_denied' using errcode='42501';end if;
 select * into b from private.capital_m07_native_bindings where organization_id=org and work_id=p_project_id and capital_artifact_id=p_artifact_id and revision_id=p_revision_id;
 select * into c from public.capital_project_artifacts where organization_id=org and capital_project_id=p_project_id and id=p_artifact_id;
 select * into r from public.artifact_revisions where organization_id=org and id=p_revision_id;
 select * into recipe from private.capital_m07_recipes where organization_id=org and id=b.recipe_id;
 if b.id is null or c.id is null or r.id is null or recipe.id is null then raise exception 'capital_artifact_review_basis_unproven' using errcode='42501';end if;
 if not private.artifact_review_sources_allowed_v1(org,r.id,actor) then raise exception 'review_source_access_required' using errcode='42501';end if;
 active:=private.capital_artifact_approval_active_v2(org,r.id);
 return jsonb_build_object('projectId',p_project_id,'artifactId',c.id,'revisionId',r.id,'manifestFingerprint',r.manifest_fingerprint,'artifactFingerprint',c.artifact_fingerprint,
 'artifactType',c.artifact_type,'artifactVersion',c.artifact_version,
 'preparedBy',recipe.human_subject_id,'viewerId',actor,'workAccess',private.can_access_resource_v1(org,p_project_id,'work'),
 'policy',private.review_policy_snapshot_v1(org,p_project_id,actor),'status',case when c.status in('confirmed','approved') and not active then 'pending_confirmation' else c.status end,
 'approvalActive',active,'sourceCount',(select count(*) from private.capital_m07_recipe_components where organization_id=org and recipe_id=recipe.id and slot='source'));
end $$;
create function public.read_capital_project_artifact_review_v2(p_project_id uuid,p_artifact_id uuid,p_revision_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.read_capital_project_artifact_review_v2(p_project_id,p_artifact_id,p_revision_id);$$;

-- Preserve the released review body, including M07 substance, institutional and
-- execution closure. Native public eligibility is an additional explicit guard.
alter function private.review_artifact_revision_v1(uuid,text,text,uuid,text,boolean,uuid,uuid) rename to review_artifact_revision_before_capital_cutover_v1;
revoke all on function private.review_artifact_revision_before_capital_cutover_v1(uuid,text,text,uuid,text,boolean,uuid,uuid) from public,anon,authenticated,service_role;
create function private.review_artifact_revision_v1(p_revision_id uuid,p_expected_fingerprint text,p_act text,p_block_id uuid,p_note text,
 p_self_approval_declared boolean,p_command_id uuid,p_basis_review_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare b private.capital_m07_native_bindings;c public.capital_project_artifacts;existing public.artifact_reviews;org uuid;begin
 select * into b from private.capital_m07_native_bindings where revision_id=p_revision_id;
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
 return private.review_artifact_revision_before_capital_cutover_v1(p_revision_id,p_expected_fingerprint,p_act,p_block_id,p_note,p_self_approval_declared,p_command_id,p_basis_review_id);
end $$;
revoke all on function private.review_artifact_revision_v1(uuid,text,text,uuid,text,boolean,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.review_artifact_revision_v1(uuid,text,text,uuid,text,boolean,uuid,uuid) to authenticated;

create function private.enqueue_capital_artifact_revision_v2(p_org uuid,p_capital_artifact uuid,p_review uuid,p_decision uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c public.capital_project_artifacts;b private.capital_m07_native_bindings;r private.capital_m07_recipes;review public.artifact_reviews;
 job uuid:=gen_random_uuid();run uuid:=gen_random_uuid();next_no integer;begin
 select * into c from public.capital_project_artifacts where organization_id=p_org and id=p_capital_artifact;
 select * into b from private.capital_m07_native_bindings where organization_id=p_org and capital_artifact_id=c.id;
 select * into r from private.capital_m07_recipes where organization_id=p_org and id=b.recipe_id;
 select * into review from public.artifact_reviews where organization_id=p_org and id=p_review and revision_id=b.revision_id and act='return';
 if r.id is null or review.id is null or c.artifact_type<>'meeting_brief' then raise exception 'capital_artifact_revision_producer_unproven' using errcode='42501';end if;
 update public.capital_project_task_runs set status='invalidated',completed_at=clock_timestamp()
 where organization_id=p_org and id=b.task_run_id and status='succeeded';
 if not found then raise exception 'capital_artifact_revision_task_not_invalidateable' using errcode='55000';end if;
 select coalesce(max(run_no),0)+1 into next_no from public.processing_runs where organization_id=p_org and intake_session_id=r.session_id;
 insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,budget,versions,created_by)
 values(run,p_org,r.session_id,next_no,'manual','queued','origination-thesis-revision-2026.09.01-v1',
 jsonb_build_object('maxCalls',1,'maxCostUsd',1.55,'externalSearchMaxUsd',0),
 jsonb_build_object('planId',r.plan_id,'revisionOfArtifactId',c.id,'correctionDecisionId',p_decision,'revisionId',b.revision_id,'reviewId',review.id,'executor','origination-thesis-2026.09.01-v1'),review.reviewer_id);
 insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,kind,payload,max_attempts)
 values(job,p_org,run,r.session_id,'capital_project_analysis',jsonb_build_object('analysis_scope','origination_thesis','locale',r.locale,
 'capital_project_id',r.work_id,'capital_project_plan_id',r.plan_id,'capital_project_brief_id',r.brief_id,'capital_task_ids',jsonb_build_array('M07'),
 'capital_artifact_required',true,'revision_of_artifact_id',c.id,'correction_decision_id',p_decision,'revision_of_native_revision_id',b.revision_id,
 'revision_review_id',review.id,'revision_block_id',review.block_id,
 'trigger_event',jsonb_build_object('type','artifact_correction_requested','artifactId',c.id,'revisionId',b.revision_id,'decisionId',p_decision,'reviewId',review.id),
 'model_budget',jsonb_build_object('max_cost_usd',1.55,'max_calls',1)),2);
 update public.document_intake_sessions set current_run_id=run,status='processing',processing_started_at=clock_timestamp(),processing_completed_at=null,
 pipeline_version='origination-thesis-revision-2026.09.01-v1',updated_at=clock_timestamp() where organization_id=p_org and id=r.session_id;
 return jsonb_build_object('jobId',job,'runId',run);
end $$;
revoke all on function private.enqueue_capital_artifact_revision_v2(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.project_capital_artifact_review_v1() returns trigger language plpgsql volatile security definer set search_path='' as $$
declare b private.capital_m07_native_bindings;c public.capital_project_artifacts;decision uuid;queued jsonb;effect text;active boolean;begin
 select * into b from private.capital_m07_native_bindings where organization_id=new.organization_id and work_id=new.work_id and revision_id=new.revision_id;
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
 if not private.artifact_review_sources_allowed_v1(new.organization_id,new.revision_id,new.reviewer_id) then raise exception 'review_source_access_required' using errcode='42501';end if;
 return new;
end $$;
revoke all on function private.project_capital_artifact_review_v1() from public,anon,authenticated,service_role;
create trigger capital_artifact_review_bridge after insert on public.artifact_reviews for each row execute function private.project_capital_artifact_review_v1();

create function private.decide_capital_project_artifact_v2(p_project_id uuid,p_artifact_id uuid,p_revision_id uuid,p_manifest_fingerprint text,
 p_artifact_fingerprint text,p_decision text,p_note text,p_self_approval_declared boolean,p_command_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare basis jsonb;review jsonb;projection private.capital_artifact_review_projections;org uuid;begin
 if p_decision is null or p_decision not in('confirm','request_changes') then raise exception 'capital_artifact_review_invalid' using errcode='22023';end if;
 org:=private.lock_review_work_v1(p_project_id);
 basis:=private.read_capital_project_artifact_review_v2(p_project_id,p_artifact_id,p_revision_id);
 if(basis->>'manifestFingerprint',basis->>'artifactFingerprint') is distinct from(p_manifest_fingerprint,p_artifact_fingerprint)
 then raise exception 'capital_artifact_review_stale' using errcode='40001';end if;
 review:=private.review_artifact_revision_v1(p_revision_id,p_manifest_fingerprint,case p_decision when 'confirm' then 'approve' else 'return' end,null,p_note,p_self_approval_declared,p_command_id,null);
 select * into projection from private.capital_artifact_review_projections where organization_id=(select organization_id from public.capital_projects where id=p_project_id) and review_id=(review->>'reviewId')::uuid;
 if projection.id is null then raise exception 'capital_artifact_review_projection_missing';end if;
 return jsonb_build_object('reviewId',projection.review_id,'projectionId',projection.id,'decisionId',projection.legacy_decision_id,'jobId',projection.processing_job_id,'runId',projection.processing_run_id,
 'revisionId',p_revision_id,'artifactId',p_artifact_id,'replayed',review->'replayed');
end $$;
create function public.decide_capital_project_artifact_v2(p_project_id uuid,p_artifact_id uuid,p_revision_id uuid,p_manifest_fingerprint text,
 p_artifact_fingerprint text,p_decision text,p_note text,p_self_approval_declared boolean,p_command_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.decide_capital_project_artifact_v2(p_project_id,p_artifact_id,p_revision_id,p_manifest_fingerprint,p_artifact_fingerprint,p_decision,p_note,p_self_approval_declared,p_command_id);$$;

create function private.read_capital_project_revision_candidates_v2(p_project_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare org uuid;result jsonb:='[]';b record;basis jsonb;begin
 select organization_id into org from public.capital_projects where id=p_project_id and status<>'archived';
 if org is null or not private.can_access_resource_v1(org,p_project_id,'read') then raise exception 'capital_artifact_review_denied' using errcode='42501';end if;
 for b in select n.capital_artifact_id,n.revision_id from private.capital_m07_native_bindings n join public.capital_project_artifacts c on(c.organization_id,c.id)=(n.organization_id,n.capital_artifact_id)
 where n.organization_id=org and n.work_id=p_project_id and c.status not in('superseded','stale') order by c.artifact_version,n.revision_id loop
  if private.artifact_review_sources_allowed_v1(org,b.revision_id,auth.uid()) then
   basis:=private.read_capital_project_artifact_review_v2(p_project_id,b.capital_artifact_id,b.revision_id);
   result:=result||jsonb_build_array(basis);end if;
 end loop;
 return jsonb_build_object('projectId',p_project_id,'candidates',result,'selectionRequired',true);
end $$;
create function public.read_capital_project_revision_candidates_v2(p_project_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.read_capital_project_revision_candidates_v2(p_project_id);$$;

create function private.submit_advisor_artifact_revision_turn_v2(p_project_id uuid,p_message_id uuid,p_locale text,p_content text,
 p_artifact_id uuid,p_revision_id uuid,p_manifest_fingerprint text,p_artifact_fingerprint text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare org uuid;actor uuid:=auth.uid();content text:=trim(coalesce(p_content,''));basis jsonb;r private.capital_m07_recipes;b private.capital_m07_native_bindings;
 m public.agent_messages;conversation public.agent_conversations;ack uuid:=gen_random_uuid();review_result jsonb;begin
 if p_message_id is null or p_locale is null or p_locale not in('pt-BR','en-US') or char_length(content) not between 2 and 5000 then
  raise exception 'invalid_advisor_artifact_revision' using errcode='22023';end if;
 org:=private.lock_review_work_v1(p_project_id);
 if not private.can_access_resource_v1(org,p_project_id,'work') then raise exception 'review_work_access_required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('capital-review-message:'||p_message_id::text,0));
 basis:=private.read_capital_project_artifact_review_v2(p_project_id,p_artifact_id,p_revision_id);
 if(basis->>'manifestFingerprint',basis->>'artifactFingerprint') is distinct from(p_manifest_fingerprint,p_artifact_fingerprint)
 then raise exception 'capital_artifact_review_stale' using errcode='40001';end if;
 select * into b from private.capital_m07_native_bindings where organization_id=org and work_id=p_project_id and capital_artifact_id=p_artifact_id and revision_id=p_revision_id;
 select * into r from private.capital_m07_recipes where organization_id=org and id=b.recipe_id;
 select * into m from public.agent_messages where id=p_message_id;
 if m.id is not null then
  if(m.organization_id,m.created_by,m.locale,m.content,m.metadata->>'kind',m.metadata->>'projectId',m.metadata->>'artifactId',m.metadata->>'revisionId',m.metadata->>'manifestFingerprint',m.metadata->>'artifactFingerprint')
   is distinct from(org,actor,p_locale,content,'artifact_revision_request',p_project_id::text,p_artifact_id::text,p_revision_id::text,p_manifest_fingerprint,p_artifact_fingerprint)
   then raise exception 'advisor_revision_replay_mismatch' using errcode='23505';end if;
  review_result:=private.decide_capital_project_artifact_v2(p_project_id,p_artifact_id,p_revision_id,p_manifest_fingerprint,p_artifact_fingerprint,'request_changes',content,false,p_message_id);
  return review_result||jsonb_build_object('messageId',m.id,'conversationId',m.conversation_id,'replayed',true);
 end if;
 select * into conversation from public.agent_conversations where organization_id=org and intake_session_id=r.session_id order by created_at,id limit 1 for update;
 if conversation.id is null then
  insert into public.agent_conversations(organization_id,intake_session_id,state,created_by) values(org,r.session_id,'idle',actor) returning * into conversation;
 end if;
 if exists(select 1 from public.agent_messages where organization_id=org and conversation_id=conversation.id and role='user' and status in('queued','processing')) then raise exception 'advisor_message_in_progress' using errcode='55000';end if;
 insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,metadata,created_by)
 values(p_message_id,org,conversation.id,r.session_id,'user','completed',content,p_locale,
 jsonb_build_object('kind','artifact_revision_request','projectId',p_project_id,'artifactId',p_artifact_id,'revisionId',p_revision_id,'manifestFingerprint',p_manifest_fingerprint,'artifactFingerprint',p_artifact_fingerprint,'analysisScope','origination_thesis'),actor);
 review_result:=private.decide_capital_project_artifact_v2(p_project_id,p_artifact_id,p_revision_id,p_manifest_fingerprint,p_artifact_fingerprint,'request_changes',content,false,p_message_id);
 insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,reply_to_message_id,metadata,created_by)
 values(ack,org,conversation.id,r.session_id,'assistant','completed',case when p_locale='en-US' then 'I will revise the selected analysis using the adjustments you described.' else 'Vou revisar a análise escolhida com os ajustes que você descreveu.' end,p_locale,p_message_id,
 jsonb_build_object('kind','advisor_revision_started','activation',jsonb_build_object('analysisScope','origination_thesis','jobId',review_result->>'jobId','revisionOfArtifactId',p_artifact_id,'revisionId',p_revision_id,'reviewId',review_result->>'reviewId')),actor);
 update public.processing_jobs set payload=payload||jsonb_build_object('message_id',p_message_id,'trigger_event',jsonb_build_object('type','advisor_semantic_route','sourceMessageId',p_message_id,'assistantMessageId',ack,'revisionOfArtifactId',p_artifact_id,'revisionId',p_revision_id,'correctionDecisionId',review_result->>'decisionId','reviewId',review_result->>'reviewId'))
 where organization_id=org and id=(review_result->>'jobId')::uuid;
 if not found then raise exception 'advisor_revision_job_not_available';end if;
 update public.agent_conversations set state='analyzing',updated_at=clock_timestamp() where organization_id=org and id=conversation.id;
 return review_result||jsonb_build_object('messageId',p_message_id,'conversationId',conversation.id,'assistantMessageId',ack);
end $$;
create function public.submit_advisor_artifact_revision_turn_v2(p_project_id uuid,p_message_id uuid,p_locale text,p_content text,p_artifact_id uuid,p_revision_id uuid,p_manifest_fingerprint text,p_artifact_fingerprint text)
returns jsonb language sql security invoker set search_path='' as $$select private.submit_advisor_artifact_revision_turn_v2(p_project_id,p_message_id,p_locale,p_content,p_artifact_id,p_revision_id,p_manifest_fingerprint,p_artifact_fingerprint);$$;

-- No legacy writer can become an alternate human authority for a native result.
create or replace function private.decide_capital_project_artifact(p_artifact_id uuid,p_artifact_fingerprint text,p_decision text,p_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$begin raise exception 'capital_artifact_review_upgrade_required' using errcode='42501';end $$;
create or replace function private.request_origination_thesis_revision_v1(p_artifact_id uuid,p_artifact_fingerprint text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$begin raise exception 'capital_artifact_review_upgrade_required' using errcode='42501';end $$;
create or replace function private.request_company_debt_view_revision_v1(p_artifact_id uuid,p_artifact_fingerprint text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$begin raise exception 'capital_artifact_review_upgrade_required' using errcode='42501';end $$;
create or replace function private.request_capital_planning_revision_v1(p_artifact_id uuid,p_artifact_fingerprint text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$begin raise exception 'capital_artifact_review_upgrade_required' using errcode='42501';end $$;
create or replace function private.submit_advisor_artifact_revision_turn_v1(p_project_id uuid,p_message_id uuid,p_locale text,p_content text)
returns jsonb language plpgsql security definer set search_path='' as $$begin raise exception 'capital_artifact_review_upgrade_required' using errcode='42501';end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('private','public')
 and p.proname=any(array['read_capital_project_artifact_review_v2','read_capital_project_revision_candidates_v2','decide_capital_project_artifact_v2','submit_advisor_artifact_revision_turn_v2']) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;

-- Prospective S11 native consumption. No experimental contribution/1000 grant
-- is widened. Raw context, parsed response and final product live only in
-- finite-lived private Storage allocations; permanent rows contain identity.
set search_path='';

create table private.capital_s11_recipes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,job_id uuid not null,plan_id uuid not null,brief_id uuid not null,session_id uuid not null,
 revision_decision_id uuid,original_attempt integer not null check(original_attempt>0),
 human_subject_id uuid not null references auth.users(id),worker_account_id uuid not null references auth.users(id),
 plan_fingerprint text not null check(plan_fingerprint~'^[a-f0-9]{64}$'),
 context_fingerprint text not null check(context_fingerprint~'^[a-f0-9]{64}$'),
 base_authority_fingerprint text not null check(base_authority_fingerprint~'^[a-f0-9]{64}$'),
 as_of_date date not null,locale text not null check(locale in ('pt-BR','en-US')),
 renderer_version text not null check(renderer_version='capital-public-task-renderer.s11.v1'),
 captured_at timestamptz not null,expires_at timestamptz not null check(isfinite(expires_at)),
 retention_policy_id uuid not null references private.capital_public_retention_policies(id),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,job_id),unique nulls not distinct(organization_id,work_id,plan_id,brief_id,revision_decision_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,plan_id) references public.capital_project_plans(organization_id,id),
 foreign key(organization_id,brief_id) references public.capital_project_briefs(organization_id,id),
 foreign key(organization_id,session_id) references public.document_intake_sessions(organization_id,id),
 foreign key(organization_id,revision_decision_id) references public.capital_project_artifact_decisions(organization_id,id)
);
create index capital_s11_recipe_work_idx on private.capital_s11_recipes(organization_id,work_id);
create index capital_s11_recipe_plan_idx on private.capital_s11_recipes(organization_id,plan_id);
create index capital_s11_recipe_brief_idx on private.capital_s11_recipes(organization_id,brief_id);
create index capital_s11_recipe_session_idx on private.capital_s11_recipes(organization_id,session_id);
create index capital_s11_recipe_decision_idx on private.capital_s11_recipes(organization_id,revision_decision_id);
create index capital_s11_recipe_subject_idx on private.capital_s11_recipes(human_subject_id);
create index capital_s11_recipe_worker_idx on private.capital_s11_recipes(worker_account_id);
create index capital_s11_recipe_policy_idx on private.capital_s11_recipes(retention_policy_id);

create table private.capital_s11_body_bases (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,recipe_id uuid not null,kind text not null check(kind in ('context','prelude','parsed','final','derived')),
 semantic_fingerprint text check(semantic_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_s11_recipes(organization_id,work_id,id)
);
create index capital_s11_basis_recipe_idx on private.capital_s11_body_bases(organization_id,work_id,recipe_id);

alter table private.capital_public_payload_allocations add column s11_body_basis_id uuid,
 add constraint capital_s11_allocation_basis_fk foreign key(organization_id,s11_body_basis_id)
 references private.capital_s11_body_bases(organization_id,id);
-- Extend the installed family set instead of replacing another consumer's body gate.
do $$declare expression text;nulls text;begin
 select pg_get_constraintdef(oid)into strict expression from pg_constraint where conrelid='private.capital_public_payload_allocations'::regclass and conname='capital_public_payload_allocations_content_kind_check';
 alter table private.capital_public_payload_allocations drop constraint capital_public_payload_allocations_content_kind_check;
 execute 'alter table private.capital_public_payload_allocations add constraint capital_public_payload_allocations_content_kind_check check ('||substring(expression from 7)||' or content_kind=''s11_body'')';
 select pg_get_constraintdef(oid)into strict expression from pg_constraint where conrelid='private.capital_public_payload_allocations'::regclass and conname='capital_allocations_kind_invariant';
 select string_agg(quote_ident(attname),','order by attname)into nulls from pg_attribute where attrelid='private.capital_public_payload_allocations'::regclass and attnum>0 and not attisdropped and attname<>'s11_body_basis_id'and(attname like '%body_basis_id'or attname in('body_basis_id','delivery_id','license_id','licensing_organization_id'));
 if nulls is null then raise exception 'capital_s11_existing_origins_missing';end if;
 alter table private.capital_public_payload_allocations drop constraint capital_allocations_kind_invariant;
 execute 'alter table private.capital_public_payload_allocations add constraint capital_allocations_kind_invariant check ((s11_body_basis_id is null and '||substring(expression from 7)||') or(content_kind=''s11_body''and s11_body_basis_id is not null and num_nonnulls('||nulls||')=0))';
end$$;
create index capital_s11_allocation_basis_idx on private.capital_public_payload_allocations(organization_id,s11_body_basis_id);
create unique index capital_s11_allocation_request_idx on private.capital_public_payload_allocations(organization_id,job_id,request_id) where content_kind='s11_body';

create table private.capital_s11_recipe_components (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,recipe_id uuid not null,component_no integer not null check(component_no between 1 and 1000),
 slot text not null check(slot in ('company','brief','institution','research','source','revision','dependency')),
 reference_id uuid not null,version integer not null check(version>0),
 body_fingerprint text not null check(body_fingerprint~'^[a-f0-9]{64}$'),
 retained_payload_id uuid,license_id uuid,dependency_artifact_id uuid,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id,component_no),unique(organization_id,recipe_id,slot,reference_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_s11_recipes(organization_id,work_id,id),
 foreign key(organization_id,retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,license_id) references private.capital_public_delivery_licenses(organization_id,id),
 foreign key(organization_id,dependency_artifact_id) references public.capital_project_artifacts(organization_id,id),
 check((slot='source' and num_nonnulls(retained_payload_id,license_id)=2 and dependency_artifact_id is null)
 or(slot='dependency' and dependency_artifact_id is not null and license_id is null)
 or(slot not in ('source','dependency') and num_nonnulls(license_id,dependency_artifact_id)=0))
);
create index capital_s11_components_recipe_idx on private.capital_s11_recipe_components(organization_id,work_id,recipe_id);
create index capital_s11_components_retained_idx on private.capital_s11_recipe_components(organization_id,retained_payload_id);
create index capital_s11_components_license_idx on private.capital_s11_recipe_components(organization_id,license_id);
create index capital_s11_components_dependency_idx on private.capital_s11_recipe_components(organization_id,dependency_artifact_id);

create table private.capital_s11_recipe_seals (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,recipe_id uuid not null,task_run_id uuid not null,context_retained_payload_id uuid not null,
 recipe_fingerprint text not null check(recipe_fingerprint~'^[a-f0-9]{64}$'),
 reconstruction_fingerprint text not null check(reconstruction_fingerprint~'^[a-f0-9]{64}$'),
 prompt_fingerprint text not null check(prompt_fingerprint~'^[a-f0-9]{64}$'),
 primary_request_fingerprint text not null check(primary_request_fingerprint~'^[a-f0-9]{64}$'),
 fallback_request_fingerprint text not null check(fallback_request_fingerprint~'^[a-f0-9]{64}$'),
 research_status text not null check(research_status in ('succeeded','partial','abstained')),
 research_jurisdiction text not null check(research_jurisdiction in ('BR','US')), research_jurisdiction_needs_confirmation boolean not null, research_strategy_fingerprint text not null check(research_strategy_fingerprint~'^[a-f0-9]{64}$'),
 budget_version text not null check(budget_version='capital-s11-operational-budget.v1'),
 research_reservation_version text not null check(research_reservation_version='public-research-reservation.s11.v1'),
 research_reservation_micro_usd bigint not null check(research_reservation_micro_usd in (0,300000)),
 effective_budget_micro_usd bigint not null check(effective_budget_micro_usd between 1 and 3000000),
 effective_max_dispatches integer not null check(effective_max_dispatches between 1 and 2),
 sealed_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,task_run_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_s11_recipes(organization_id,work_id,id),
 foreign key(organization_id,task_run_id) references public.capital_project_task_runs(organization_id,id),
 foreign key(organization_id,context_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id)
);
create index capital_s11_seal_recipe_idx on private.capital_s11_recipe_seals(organization_id,work_id,recipe_id);
create index capital_s11_seal_retained_idx on private.capital_s11_recipe_seals(organization_id,context_retained_payload_id);


-- Compare only consumed mutable authority, not completed_artifacts or task
-- progress produced by this execution. This proof also works after the old
-- worker lease expires, so human/recovery reads retain the same current barrier.
create function private.capital_s11_base_authority_fingerprint_v1(p_org uuid,p_job uuid,p_session uuid,p_brief uuid,p_plan uuid,p_subject uuid,p_captured_at timestamptz)
returns text language sql volatile security definer set search_path='' as $$
 select encode(extensions.digest(jsonb_build_object(
 'session',(select jsonb_build_object('company',s.company_profile,'locale',s.locale,'privacy',s.privacy_status,'representation',s.representation_status) from public.document_intake_sessions s where s.organization_id=p_org and s.id=p_session),
 'brief',(select jsonb_build_object('id',b.id,'version',b.brief_version,'fingerprint',b.content_fingerprint,'status',b.status) from public.capital_project_briefs b where b.organization_id=p_org and b.id=p_brief),
 'plan',(select jsonb_build_object('id',p.id,'fingerprint',p.plan_fingerprint,'status',p.status) from public.capital_project_plans p where p.organization_id=p_org and p.id=p_plan),
 'professional',(select coalesce(jsonb_agg(to_jsonb(c) order by c.user_id),'[]') from public.professional_context_profiles c where c.organization_id=p_org and c.user_id in(p_subject,(select pr.created_by from public.processing_jobs j join public.processing_runs pr on pr.organization_id=j.organization_id and pr.id=j.processing_run_id where j.organization_id=p_org and j.id=p_job))),
 'institution',(select to_jsonb(c) from public.institution_capability_profiles c where c.organization_id=p_org),
 'methodology',(select jsonb_build_object('id',m.id,'version',m.version_number,'fingerprint',encode(extensions.digest(m.content::text,'sha256'),'hex')) from public.organization_methodologies m where m.organization_id=p_org and m.status='active'),
 'revision',(select jsonb_build_object('correction',j.payload->'revision_correction_note','artifact',j.payload->'revision_of_artifact_id','priorFingerprint',(select x.artifact_fingerprint from public.capital_project_artifacts x where x.organization_id=p_org and x.id::text=j.payload->>'revision_of_artifact_id')) from public.processing_jobs j where j.organization_id=p_org and j.id=p_job),
 'feedback',(select coalesce(jsonb_agg(to_jsonb(f) order by f.task_id),'[]') from(select distinct on(t.task_id) t.task_id,tr.id,tr.attempt_no,tr.quality_results,tr.error from public.capital_project_task_runs tr join public.capital_project_plan_tasks t on t.organization_id=tr.organization_id and t.id=tr.plan_task_id join public.processing_jobs j on j.organization_id=tr.organization_id and j.id=p_job where tr.organization_id=p_org and tr.capital_project_id=(j.payload->>'capital_project_id')::uuid and tr.processing_job_id in(p_job,coalesce(nullif(j.payload#>>'{trigger_event,priorJobId}','')::uuid,p_job)) and tr.status='failed' and jsonb_array_length(tr.quality_results)>0 and tr.completed_at<=p_captured_at order by t.task_id,tr.completed_at desc nulls last,tr.id desc) f)
 )::text,'sha256'),'hex');
$$;

-- Source bridges retain the consumer's license identity; publisher UUIDs are
-- NEVER inserted in artifact_dependency_links with consumer tenancy.
create function private.capital_s11_recipe_deadline_v1(p_org uuid,p_recipe uuid,p_subject uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_s11_recipes;c private.capital_s11_recipe_components;
 a private.capital_public_payload_allocations;bound timestamptz;deadline timestamptz;s private.capital_s11_recipe_seals;
begin
 select * into r from private.capital_s11_recipes where organization_id=p_org and id=p_recipe;
 if r.id is null or p_subject is null or not private.capital_body_subject_allowed_v1(p_org,r.work_id,p_subject)
 or not private.capital_body_subject_allowed_v1(p_org,r.work_id,r.human_subject_id) then return null;end if;
 if r.base_authority_fingerprint is distinct from private.capital_s11_base_authority_fingerprint_v1(p_org,r.job_id,r.session_id,r.brief_id,r.plan_id,r.human_subject_id,r.captured_at) then return null;end if;
 deadline:=r.expires_at;
 select * into s from private.capital_s11_recipe_seals where organization_id=p_org and recipe_id=r.id;
 if s.id is not null then
 select x.* into a from private.capital_public_retained_payloads p join private.capital_public_payload_allocations x on x.organization_id=p.organization_id and x.id=p.allocation_id where p.organization_id=p_org and p.id=s.context_retained_payload_id;
 if a.id is null or not private.capital_body_physical_receipt_v1(p_org,s.context_retained_payload_id) or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 deadline:=least(deadline,a.expires_at,a.purge_at);
 end if;
 for c in select * from private.capital_s11_recipe_components where organization_id=p_org and recipe_id=r.id order by component_no loop
 if c.slot='source' then
 select x.* into a from private.capital_public_retained_payloads p join private.capital_public_payload_allocations x on x.organization_id=p.organization_id and x.id=p.allocation_id
 where p.organization_id=p_org and p.id=c.retained_payload_id and x.content_kind='public_source' and x.license_id=c.license_id;
 if a.id is null or not private.capital_body_physical_receipt_v1(p_org,c.retained_payload_id) then return null;end if;
 bound:=private.capital_public_retention_deadline_v1(c.license_id,p_org,a.retained_at,a.policy_id);
 if bound is null or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 deadline:=least(deadline,bound,a.expires_at,a.purge_at);
 elsif c.slot='dependency' then
 if not exists(select 1 from public.capital_project_artifacts x where x.organization_id=p_org and x.capital_project_id=r.work_id and x.id=c.dependency_artifact_id and x.artifact_version=c.version and x.status not in ('stale','superseded')) then return null;end if;
 select allocation.* into a from private.capital_s11_task_projections bridge join private.capital_public_retained_payloads physical on physical.organization_id=bridge.organization_id and physical.id=bridge.derived_retained_payload_id
 join private.capital_public_payload_allocations allocation on allocation.organization_id=physical.organization_id and allocation.id=physical.allocation_id
 where bridge.organization_id=p_org and bridge.recipe_id=r.id and bridge.capital_artifact_id=c.dependency_artifact_id;
 if a.id is null or not private.capital_body_physical_receipt_v1(p_org,(select id from private.capital_public_retained_payloads where organization_id=p_org and allocation_id=a.id))
 or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 deadline:=least(deadline,a.expires_at,a.purge_at);
 end if;
 end loop;
 return case when deadline>clock_timestamp() then deadline end;
end; $$;

create function private.worker_prepare_capital_s11_recipe_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 c jsonb;r private.capital_s11_recipes;p private.capital_public_retention_policies;stamp timestamptz:=clock_timestamp();fp text;
begin
 if j.payload?'revision_of_artifact_id' and not exists(select 1 from public.capital_project_artifact_decisions d where d.organization_id=j.organization_id and d.id::text=j.payload->>'correction_decision_id' and d.artifact_id::text=j.payload->>'revision_of_artifact_id' and d.capital_project_id=coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid) and d.decision='request_changes' and d.decided_by=j.authorization_subject_id) then raise exception 'capital_s11_correction_denied' using errcode='42501';end if;
 if j.payload->>'analysis_scope' is distinct from 'capital_planning' or not(j.payload->'capital_task_ids'?'S11') then raise exception 'capital_s11_recipe_denied' using errcode='42501';end if;
 c:=private.worker_load_capital_project_context_v6(j.id,p_capability_token);
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
 if private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_recipe_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-s11-base-context.v1','recipeId',r.id,'jobId',j.id,'organizationId',j.organization_id,'workId',r.work_id,
 'planId',r.plan_id,'planFingerprint',r.plan_fingerprint,'asOfDate',r.as_of_date,'locale',r.locale,'contextFingerprint',r.context_fingerprint,
 'canonicalContext',c::text,'expiresAt',r.expires_at);
end; $$;

-- Table/API grants are closed until every concrete command below is installed.
do $$ declare t text;cmd text;begin
 foreach t in array array['capital_s11_recipes','capital_s11_body_bases','capital_s11_recipe_components','capital_s11_recipe_seals'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 foreach cmd in array array['select','insert','update','delete'] loop
 execute format('create policy %I on private.%I as restrictive for %s to anon,authenticated %s',t||'_deny_'||cmd,t,cmd,
 case when cmd='insert' then 'with check(false)' when cmd='update' then 'using(false) with check(false)' else 'using(false)' end);
 end loop;
 execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',t||'_no_truncate',t);
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated_at',t);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_source_version_mutation_v1()',t||'_immutable',t);
 execute format('create trigger %I after insert or update or delete on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 end loop;
end; $$;
revoke all on function private.capital_s11_recipe_deadline_v1(uuid,uuid,uuid),private.worker_prepare_capital_s11_recipe_v1(uuid,text) from public,anon,authenticated,service_role;

-- S11 retention is a separate origin family. Its DTO preserves the physical
-- protocol, but resolves its own server basis rather than inventing a contribution.
create function private.capital_s11_allocation_deadline_v1(p_org uuid,p_allocation uuid,p_subject uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;b private.capital_s11_body_bases;d timestamptz;
begin
 select * into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation and content_kind='s11_body';
 select * into b from private.capital_s11_body_bases where organization_id=p_org and id=a.s11_body_basis_id;
 if b.id is null then return null;end if;
 d:=private.capital_s11_recipe_deadline_v1(p_org,b.recipe_id,p_subject);
 if d is null or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 return case when least(d,a.expires_at,a.purge_at)>clock_timestamp() then least(d,a.expires_at) end;
end; $$;

alter function private.capital_capture_allocation_deadline_v2(uuid,uuid) rename to capital_capture_allocation_deadline_pre_s11_v2;
create function private.capital_capture_allocation_deadline_v2(p_org uuid,p_allocation uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;subject uuid;
begin
 select * into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation;
 if a.content_kind is distinct from 's11_body' then return private.capital_capture_allocation_deadline_pre_s11_v2(p_org,p_allocation);end if;
 select human_subject_id into subject from private.capital_s11_body_bases b join private.capital_s11_recipes r on r.organization_id=b.organization_id and r.id=b.recipe_id where b.organization_id=p_org and b.id=a.s11_body_basis_id;
 return private.capital_s11_allocation_deadline_v1(p_org,p_allocation,subject);
end; $$;

create function private.capital_s11_body_dto_v1(p_org uuid,p_allocation uuid,p_deadline timestamptz,p_replayed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare allocation private.capital_public_payload_allocations;receipt private.capital_public_retained_payloads;margin integer;
begin
 select * into strict allocation from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation;
 select * into receipt from private.capital_public_retained_payloads where organization_id=p_org and allocation_id=allocation.id;
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 return jsonb_build_object('schemaVersion','capital-retained-body.v1','retentionState',case when receipt.id is null then 'allocated' else 'retained' end,
 'allocationId',allocation.id,'retainedPayloadId',receipt.id,'bodyBasisId',allocation.s11_body_basis_id,'bucket',allocation.bucket_id,'path',allocation.object_path,
 'payloadFingerprint',allocation.payload_fingerprint,'byteLength',allocation.byte_length,'storageObjectId',receipt.storage_object_id,'storageVersion',receipt.storage_version,
 'retainedAt',allocation.retained_at,'uploadExpiresAt',allocation.upload_expires_at,'expiresAt',least(allocation.expires_at,p_deadline),
 'purgeAt',least(allocation.purge_at,p_deadline-make_interval(secs=>margin)),'replayed',p_replayed);
end; $$;

create function private.worker_commit_capital_s11_body_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid,p_storage_object_id uuid,
 p_storage_version text,p_verified_sha256 text,p_verified_size bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 allocation private.capital_public_payload_allocations;basis private.capital_s11_body_bases;receipt private.capital_public_retained_payloads;
 object_row storage.objects;deadline timestamptz;margin integer;replayed boolean:=false;result_dto jsonb;
begin
 select * into allocation from private.capital_public_payload_allocations where organization_id=job.organization_id and job_id=job.id and id=p_allocation_id and content_kind='s11_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id) then raise exception 'capital_body_retention_denied' using errcode='42501';end if;
 if p_storage_object_id is null or coalesce(length(p_storage_version),0) not between 1 and 1024 or p_verified_sha256 is distinct from allocation.payload_fingerprint or p_verified_size is distinct from allocation.byte_length then
 raise exception 'capital_body_proof_invalid' using errcode='22023';end if;
 deadline:=private.capital_s11_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 if deadline is null or least(allocation.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp()
 or not private.capital_public_retention_healthy_v1(job.leased_by,allocation.policy_id) then raise exception 'capital_body_retention_denied' using errcode='42501';end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 begin
 perform 1 from private.capital_public_payload_purge_queue where organization_id=job.organization_id and allocation_id=allocation.id and status='pending' for share nowait;
 if not found then raise exception 'capital_body_retention_denied' using errcode='42501';end if;
 select * into object_row from storage.objects where id=p_storage_object_id and bucket_id=allocation.bucket_id and name=allocation.object_path for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001';end;
 if object_row.id is null or object_row.version is distinct from p_storage_version or object_row.metadata->>'size' is distinct from allocation.byte_length::text
 or object_row.metadata->>'mimetype' is distinct from 'application/json' or (to_jsonb(object_row)->>'is_versioned')::boolean is true
 or (to_jsonb(object_row)->>'is_delete_marker')::boolean is true or to_jsonb(object_row)->>'archived_at' is not null or not private.capital_public_capture_bucket_safe_v1() then
 raise exception 'capital_body_proof_invalid' using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-body-request:'||job.organization_id::text||':'||job.id::text||':'||allocation.request_id::text,0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 select * into receipt from private.capital_public_retained_payloads where organization_id=job.organization_id and allocation_id=allocation.id;
 if found then
 if receipt.storage_object_id<>p_storage_object_id or receipt.storage_version<>p_storage_version or receipt.verified_sha256<>p_verified_sha256 or receipt.verified_size<>p_verified_size then
 raise exception 'capital_body_proof_conflict' using errcode='23505';end if;
 replayed:=true;
 else
 if allocation.upload_expires_at<=clock_timestamp() then raise exception 'capital_body_upload_expired' using errcode='42501';end if;
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 insert into private.capital_public_retained_payloads(organization_id,allocation_id,storage_object_id,storage_version,verified_sha256,verified_size,verified_by)
 values(job.organization_id,allocation.id,p_storage_object_id,p_storage_version,p_verified_sha256,p_verified_size,auth.uid()) returning * into receipt;
 update private.capital_public_payload_purge_queue set next_check_at=least(allocation.purge_at,deadline-make_interval(secs=>margin)),
 effective_purge_at=least(effective_purge_at,allocation.purge_at,deadline-make_interval(secs=>margin)),updated_at=clock_timestamp()
 where organization_id=job.organization_id and allocation_id=allocation.id;
 end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token)
 then raise exception 'capital_capture_denied' using errcode='42501';end if;
 result_dto:=private.capital_s11_body_dto_v1(job.organization_id,allocation.id,deadline,replayed);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return result_dto;
end; $$;

create function private.worker_read_capital_s11_allocation_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 allocation private.capital_public_payload_allocations;receipt private.capital_public_retained_payloads;
 physical_object storage.objects;deadline timestamptz;checked_deadline timestamptz;margin integer;result_dto jsonb;
begin
 if p_allocation_id is null then raise exception 'capital_body_read_invalid' using errcode='22023';end if;
 select a.* into allocation from private.capital_public_payload_allocations a
 where a.organization_id=job.organization_id and a.job_id=job.id and a.id=p_allocation_id and a.content_kind='s11_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id)
 or not private.capital_public_retention_healthy_v1(allocation.worker_token_id,allocation.policy_id)
 or not private.capital_public_capture_bucket_safe_v1() then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 deadline:=private.capital_s11_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 if deadline is null or least(allocation.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp() then
 raise exception 'capital_body_read_denied' using errcode='42501';end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 begin
 perform 1 from private.capital_public_payload_purge_queue q
 where q.organization_id=job.organization_id and q.allocation_id=allocation.id and q.status='pending' for share nowait;
 if not found then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 select o.* into physical_object from storage.objects o where o.bucket_id=allocation.bucket_id and o.name=allocation.object_path for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001';end;
 if physical_object.id is null or coalesce(length(physical_object.version),0) not between 1 and 1024
 or physical_object.metadata->>'size' is distinct from allocation.byte_length::text
 or physical_object.metadata->>'mimetype' is distinct from 'application/json'
 or (to_jsonb(physical_object)->>'is_versioned')::boolean is true
 or (to_jsonb(physical_object)->>'is_delete_marker')::boolean is true
 or to_jsonb(physical_object)->>'archived_at' is not null then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 select r.* into receipt from private.capital_public_retained_payloads r
 where r.organization_id=job.organization_id and r.allocation_id=allocation.id;
 if receipt.id is null then
 if allocation.upload_expires_at<=clock_timestamp() then raise exception 'capital_body_upload_expired' using errcode='42501';end if;
 else
 if receipt.storage_object_id is distinct from physical_object.id or receipt.storage_version is distinct from physical_object.version
 or receipt.verified_sha256 is distinct from allocation.payload_fingerprint or receipt.verified_size is distinct from allocation.byte_length
 or not private.capital_body_physical_receipt_v1(job.organization_id,receipt.id) then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 end if;
 result_dto:=private.capital_s11_body_dto_v1(job.organization_id,allocation.id,deadline,true)
 ||jsonb_build_object('storageObjectId',physical_object.id,'storageVersion',physical_object.version);
 -- No caller-supplied path/version/hash or storage header authorizes this scope.
 -- Re-run current rights and clock after constructing it, so an elapsed lease
 -- cannot escape through a slow closure/metadata lookup before either server gate.
 checked_deadline:=private.capital_s11_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
 if checked_deadline is null then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 if checked_deadline is distinct from deadline then raise exception 'capital_capture_retry' using errcode='40001';end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token)
 or least(allocation.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp()
 or (receipt.id is null and allocation.upload_expires_at<=clock_timestamp()) then
 raise exception 'capital_body_read_denied' using errcode='42501';end if;
 return result_dto;
end; $$;

create or replace function private.capital_body_storage_job_authority_v1(p_allocation uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare allocation private.capital_public_payload_allocations;headers jsonb;capability text;
begin
 if auth.uid() is null or p_allocation is null then return false;end if;
 begin
 headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 exception when invalid_text_representation then return false;end;
 if jsonb_typeof(headers) is distinct from 'object'
 or jsonb_typeof(headers->'x-offroad-job-id') is distinct from 'string'
 or jsonb_typeof(headers->'x-offroad-capability') is distinct from 'string' then return false;end if;
 select * into allocation from private.capital_public_payload_allocations a where a.id=p_allocation and a.content_kind in ('typed_body','public_source','m07_body','s11_body');
 if not found or headers->>'x-offroad-job-id' is distinct from allocation.job_id::text
 or (headers?'x-offroad-workspace' and headers->>'x-offroad-workspace' is distinct from allocation.organization_id::text) then return false;end if;
 capability:=headers->>'x-offroad-capability';
 if length(capability) not between 1 and 4096 or extensions.digest(capability,'sha256') is distinct from allocation.capability_sha256 then return false;end if;
 return private.capital_public_allocation_job_current_v1(allocation.id)
 and private.capital_public_capture_clock_current_v1(allocation.job_id,capability);
end; $$;

create function private.capital_s11_storage_allowed_v1(p_allocation uuid,p_mode text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare allocation private.capital_public_payload_allocations;human uuid;deadline timestamptz;margin integer;
begin
 if auth.uid() is null or p_mode is distinct from 'upload' or not private.capital_body_storage_job_authority_v1(p_allocation) or not private.capital_public_capture_bucket_safe_v1() then return false;end if;
 select * into allocation from private.capital_public_payload_allocations where id=p_allocation and content_kind='s11_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id)
 or not private.capital_public_retention_healthy_v1(allocation.worker_token_id,allocation.policy_id) then return false;end if;
 if exists(select 1 from storage.objects o where o.bucket_id=allocation.bucket_id and o.name=allocation.object_path
 and ((to_jsonb(o)->>'is_versioned')::boolean is true or (to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null)) then return false;end if;
 if p_mode='upload' and (allocation.upload_expires_at<=clock_timestamp()
 or exists(select 1 from private.capital_public_retained_payloads where organization_id=allocation.organization_id and allocation_id=allocation.id)) then return false;end if;
 select authorization_subject_id into human from public.processing_jobs where organization_id=allocation.organization_id and id=allocation.job_id;
 if not exists(select 1 from private.capital_public_payload_purge_queue where organization_id=allocation.organization_id and allocation_id=allocation.id and status='pending') then return false;end if;
 deadline:=private.capital_s11_allocation_deadline_v1(allocation.organization_id,allocation.id,human);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 return deadline is not null and least(allocation.purge_at,deadline-make_interval(secs=>margin))>clock_timestamp()
 and private.capital_body_retention_healthy_v1(allocation.policy_id,allocation.organization_id,allocation.id)
 and private.capital_body_storage_job_authority_v1(allocation.id);
end; $$;

-- Preserve current material/M07/public-source authority; dispatch only S11.
alter function private.worker_can_access_capital_public_payload_v1(text,text,text) rename to worker_can_access_capital_public_payload_pre_s11_v1;
create function private.worker_can_access_capital_public_payload_v1(p_bucket text,p_path text,p_mode text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;
begin
 -- Purge resolves the genuine leased janitor scope before kind dispatch.
 if p_mode in('purge','purge_select') then return private.worker_can_access_capital_public_payload_pre_s11_v1(p_bucket,p_path,p_mode);end if;
 select * into a from private.capital_public_payload_allocations where bucket_id=p_bucket and object_path=p_path;
 if a.content_kind is distinct from 's11_body' then return private.worker_can_access_capital_public_payload_pre_s11_v1(p_bucket,p_path,p_mode);end if;
 if exists(select 1 from storage.objects o where o.bucket_id=p_bucket and o.name=p_path and((to_jsonb(o)->>'is_versioned')::boolean is true or(to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null)) then return false;end if;
 return private.capital_s11_storage_allowed_v1(a.id,p_mode);
end$$;
revoke all on function private.capital_s11_storage_allowed_v1(uuid,text),private.worker_can_access_capital_public_payload_pre_s11_v1(text,text,text) from public,anon,authenticated,service_role;
revoke all on function private.worker_can_access_capital_public_payload_v1(text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_can_access_capital_public_payload_v1(text,text,text) to authenticated;
-- Policy expressions retain function OIDs across RENAME. Rebind them to the
-- current dispatch rather than granting clients the historical implementation.
do $$declare p record;ddl text;begin
 for p in select * from pg_policies where schemaname='storage' and tablename='objects' and(coalesce(qual,'') like '%worker_can_access_capital_public_payload_pre_s11_v1%' or coalesce(with_check,'') like '%worker_can_access_capital_public_payload_pre_s11_v1%') loop
 ddl:=format('alter policy %I on storage.objects',p.policyname);
 if p.qual is not null then ddl:=ddl||' using ('||replace(p.qual,'worker_can_access_capital_public_payload_pre_s11_v1','worker_can_access_capital_public_payload_v1')||')';end if;
 if p.with_check is not null then ddl:=ddl||' with check ('||replace(p.with_check,'worker_can_access_capital_public_payload_pre_s11_v1','worker_can_access_capital_public_payload_v1')||')';end if;
 execute ddl;
 end loop;
end$$;


-- The base is captured before research. Only SQL supplies its actual body; a
-- caller cannot smuggle a fresh context underneath a prior captured identity.
create function private.worker_prepare_capital_s11_context_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 r private.capital_s11_recipes;a private.capital_public_payload_allocations;b private.capital_s11_body_bases;
 c jsonb;p private.capital_public_retention_policies;fp text;bytes bigint;deadline timestamptz;stamp timestamptz:=clock_timestamp();
begin
 if not pg_try_advisory_xact_lock(hashtextextended('capital-s11-recipe:'||j.organization_id::text||':'||p_recipe_id::text,0)) then raise exception 'capital_s11_retry' using errcode='40001';end if;
 select * into r from private.capital_s11_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 if r.id is null or r.worker_account_id<>auth.uid() or r.human_subject_id<>j.authorization_subject_id or p_request_id is null then raise exception 'capital_s11_denied' using errcode='42501';end if;
 c:=private.worker_load_capital_project_context_v6(j.id,p_capability_token);
 fp:=encode(extensions.digest(c::text,'sha256'),'hex');bytes:=octet_length(c::text);
 if fp<>r.context_fingerprint or bytes not between 1 and 1048576 then raise exception 'capital_s11_context_changed' using errcode='40001';end if;
 select * into strict p from private.capital_public_retention_policies where id=r.retention_policy_id;
 deadline:=private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 if deadline is null or deadline-make_interval(secs=>p.purge_margin_seconds)<=stamp or not private.capital_public_retention_healthy_v1(j.leased_by,p.id) then raise exception 'capital_s11_retention_denied' using errcode='42501';end if;
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and job_id=j.id and request_id=p_request_id and content_kind='s11_body';
 if a.id is not null then
 select * into b from private.capital_s11_body_bases where organization_id=j.organization_id and id=a.s11_body_basis_id;
 if b.recipe_id<>r.id or b.kind<>'context' or a.payload_fingerprint<>fp or a.byte_length<>bytes then raise exception 'capital_s11_context_conflict' using errcode='23505';end if;
 if private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null then raise exception 'capital_s11_retention_denied' using errcode='42501';end if;
 else
 insert into private.capital_s11_body_bases(organization_id,work_id,recipe_id,kind) values(j.organization_id,r.work_id,r.id,'context') returning * into b;
 insert into private.capital_public_payload_allocations(id,organization_id,request_id,job_id,worker_token_id,worker_account_id,capability_sha256,policy_id,
 payload_fingerprint,byte_length,object_path,retained_at,expires_at,purge_at,upload_expires_at,s11_body_basis_id,content_kind)
 values(b.id,j.organization_id,p_request_id,j.id,j.leased_by,auth.uid(),j.capability_sha256,p.id,fp,bytes,j.organization_id::text||'/'||b.id::text||'/payload.json',stamp,deadline,
 deadline-make_interval(secs=>p.purge_margin_seconds),least(stamp+interval '5 minutes',deadline-make_interval(secs=>p.purge_margin_seconds)),b.id,'s11_body') returning * into a;
 insert into private.capital_public_payload_purge_queue(organization_id,allocation_id,next_check_at,effective_purge_at) values(j.organization_id,a.id,least(a.upload_expires_at,a.purge_at),a.purge_at);
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_denied' using errcode='42501';end if;
 return private.capital_s11_body_dto_v1(j.organization_id,a.id,deadline,true)||jsonb_build_object('canonicalBody',c::text);
end; $$;

create function private.capital_s11_recipe_dto_v1(p_org uuid,p_recipe uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r private.capital_s11_recipes;s private.capital_s11_recipe_seals;components jsonb;
begin
 select * into strict r from private.capital_s11_recipes where organization_id=p_org and id=p_recipe;
 select * into strict s from private.capital_s11_recipe_seals where organization_id=p_org and recipe_id=r.id;
 select coalesce(jsonb_agg(jsonb_build_object('slot',slot,'id',reference_id,'version',version,'bodyFingerprint',body_fingerprint) order by component_no),'[]') into components from private.capital_s11_recipe_components where organization_id=p_org and recipe_id=r.id;
 return jsonb_build_object('schemaVersion','capital-s11-recipe-receipt.v1','state','ready','recipeId',r.id,'producerTaskRunId',s.task_run_id,'producerTaskId','M04','finalTaskId','S11',
 'jobId',r.job_id,'organizationId',p_org,'workId',r.work_id,'planId',r.plan_id,'planFingerprint',r.plan_fingerprint,'locale',r.locale,'asOfDate',r.as_of_date,
 'rendererVersion',r.renderer_version,'recipeFingerprint',s.recipe_fingerprint,'reconstructionFingerprint',s.reconstruction_fingerprint,
 'contextRetainedPayloadId',s.context_retained_payload_id,'operationalBudget',jsonb_build_object('schemaVersion',s.budget_version,'researchReservationVersion',s.research_reservation_version,'researchReservationMicroUsd',s.research_reservation_micro_usd,'maxExposureMicroUsd',s.effective_budget_micro_usd,'maxDispatches',s.effective_max_dispatches),'components',components,'expiresAt',r.expires_at);
end; $$;

-- Component hashes here are observed JS reconstruction identities. Physical
-- hashes are separate server-derived allocation hashes and storage proofs.
create function private.worker_finalize_capital_s11_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,
 p_context_retained_payload_id uuid,p_components jsonb,p_reconstruction_fingerprint text,
 p_prompt_fingerprint text,p_primary_request_fingerprint text,p_fallback_request_fingerprint text,
 p_operator_budget_micro_usd bigint,p_operator_max_dispatches integer,p_research_status text,p_jurisdiction text,p_jurisdiction_needs_confirmation boolean,p_strategy_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 r private.capital_s11_recipes;s private.capital_s11_recipe_seals;a private.capital_public_payload_allocations;b private.capital_s11_body_bases;
 component jsonb;ordinal integer:=0;dep public.capital_project_artifacts;lic private.capital_public_delivery_licenses;deadline timestamptz;
 run uuid;fp text;expected uuid;expected_version integer;effective_budget bigint;effective_dispatches integer;research_reserve bigint;job_cost numeric;job_calls numeric;research_sources_wire text;research_fp text;
begin
 if p_jurisdiction is null or p_jurisdiction not in ('BR','US') or p_jurisdiction_needs_confirmation is null or p_strategy_fingerprint is null or p_strategy_fingerprint!~'^[a-f0-9]{64}$' then raise exception 'capital_s11_strategy_pin_invalid' using errcode='22023';end if;
 if p_research_status is null or p_research_status not in ('succeeded','partial','abstained') then raise exception 'capital_s11_research_status_invalid' using errcode='22023';end if;
 if p_operator_budget_micro_usd is null or p_operator_budget_micro_usd not between 1 and 3000000 or p_operator_max_dispatches is null or p_operator_max_dispatches not between 1 and 2
 or jsonb_typeof(j.payload#>'{model_budget,max_cost_usd}') is distinct from 'number' or jsonb_typeof(j.payload#>'{model_budget,max_calls}') is distinct from 'number' then raise exception 'capital_s11_budget_invalid' using errcode='22023';end if;
 job_cost:=(j.payload#>>'{model_budget,max_cost_usd}')::numeric;job_calls:=(j.payload#>>'{model_budget,max_calls}')::numeric;
 if job_cost<=0 or job_calls<1 or job_calls<>trunc(job_calls) then raise exception 'capital_s11_budget_denied' using errcode='42501';end if;
 -- Fixed server reservation: 12*(USD0.005 Perplexity + USD0.020 OpenAI search).
 -- Revisions perform no new search. Keep the conservative initial reservation
 -- for frozen/official research until a durable research-cost ledger exists.
 research_reserve:=case when j.payload?'revision_of_artifact_id' then 0 else 300000 end;
 effective_budget:=least(3000000,case when j.payload?'revision_of_artifact_id' then 800000 else 950000 end,floor(job_cost*1000000)::bigint)-research_reserve;
 effective_budget:=least(effective_budget,p_operator_budget_micro_usd);
 effective_dispatches:=least(2,job_calls::integer,p_operator_max_dispatches);
 if effective_budget<1 or effective_dispatches<1 then raise exception 'capital_s11_budget_denied' using errcode='42501';end if;
 if exists(select 1 from unnest(array[p_reconstruction_fingerprint,p_prompt_fingerprint,p_primary_request_fingerprint,p_fallback_request_fingerprint]) pin where pin is null or pin!~'^[a-f0-9]{64}$') or jsonb_typeof(p_components) is distinct from 'array' or jsonb_array_length(p_components) not between 7 and 1000 or octet_length(p_components::text)>262144 then raise exception 'capital_s11_recipe_invalid' using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-s11-recipe:'||j.organization_id::text||':'||p_recipe_id::text,0)) then raise exception 'capital_s11_retry' using errcode='40001';end if;
 select * into r from private.capital_s11_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 if r.id is null or r.worker_account_id<>auth.uid() or r.human_subject_id<>j.authorization_subject_id or exists(select 1 from private.capital_body_invocation_inputs i where i.organization_id=j.organization_id and i.job_id=j.id) then raise exception 'capital_s11_denied' using errcode='42501';end if;
 select z.* into a from private.capital_public_retained_payloads p join private.capital_public_payload_allocations z on z.organization_id=p.organization_id and z.id=p.allocation_id where p.organization_id=j.organization_id and p.id=p_context_retained_payload_id and z.job_id=j.id and z.content_kind='s11_body';
 select * into b from private.capital_s11_body_bases where organization_id=j.organization_id and id=a.s11_body_basis_id;
 if b.recipe_id is distinct from r.id or b.kind is distinct from 'context' or a.payload_fingerprint<>r.context_fingerprint or not private.capital_body_physical_receipt_v1(j.organization_id,p_context_retained_payload_id) then raise exception 'capital_s11_context_denied' using errcode='42501';end if;
 -- Snapshot rows are immutable. Every required private slot must be present once;
 -- supplied IDs can only identify actual objects in this recipe's native context.
 if exists(select 1 from unnest(array['company','brief','institution','research','revision']) k where(select count(*) from jsonb_array_elements(p_components) x where x->>'slot'=k)<>1)
 or not exists(select 1 from jsonb_array_elements(p_components) x where x->>'slot'='dependency') then raise exception 'capital_s11_recipe_invalid' using errcode='22023';end if;
 if not exists(select 1 from jsonb_array_elements(p_components) x where x->>'slot'='source') then raise exception 'capital_s11_published_source_required' using errcode='42501';end if;
 -- This closed two-field ASCII/UUID object uses the exact historical JS
 -- stable wire. It is deliberately not generic SQL jsonb::text canonicalization.
 select '['||coalesce(string_agg((x.value->'id')::text,',' order by x.ordinality),'')||']' into research_sources_wire from jsonb_array_elements(p_components) with ordinality x(value,ordinality) where x.value->>'slot'='source';
 research_fp:=encode(extensions.digest('{"jurisdiction":'||to_jsonb(p_jurisdiction)::text||',"jurisdictionNeedsConfirmation":'||(case when p_jurisdiction_needs_confirmation then 'true' else 'false' end)||',"sourceIds":'||research_sources_wire||',"status":'||to_jsonb(p_research_status)::text||',"strategyFingerprint":'||to_jsonb(p_strategy_fingerprint)::text||'}','sha256'),'hex');
 if not exists(select 1 from jsonb_array_elements(p_components) x where x->>'slot'='research' and x->>'bodyFingerprint'=research_fp) then raise exception 'capital_s11_research_pin_invalid' using errcode='22023';end if;
 fp:=encode(extensions.digest(jsonb_build_object('recipe',r.id,'context',r.context_fingerprint,'components',p_components,'reconstruction',p_reconstruction_fingerprint,'renderer',r.renderer_version,'prompt',p_prompt_fingerprint,'primaryRequest',p_primary_request_fingerprint,'fallbackRequest',p_fallback_request_fingerprint,'researchStatus',p_research_status,'researchJurisdiction',p_jurisdiction,'researchJurisdictionNeedsConfirmation',p_jurisdiction_needs_confirmation,'researchStrategyFingerprint',p_strategy_fingerprint,'originalAttempt',r.original_attempt,'budgetVersion','capital-s11-operational-budget.v1','researchReservationVersion','public-research-reservation.s11.v1','researchReservationMicroUsd',research_reserve,'effectiveBudgetMicroUsd',effective_budget,'effectiveMaxDispatches',effective_dispatches)::text,'sha256'),'hex');
 select * into s from private.capital_s11_recipe_seals where organization_id=j.organization_id and recipe_id=r.id;
 if s.id is not null then
 if s.context_retained_payload_id<>p_context_retained_payload_id or s.recipe_fingerprint<>fp or s.reconstruction_fingerprint<>p_reconstruction_fingerprint then raise exception 'capital_s11_recipe_conflict' using errcode='23505';end if;
 else
 for component in select value from jsonb_array_elements(p_components) loop
 ordinal:=ordinal+1;
 if jsonb_typeof(component) is distinct from 'object' or not(component?&array['slot','id','version','bodyFingerprint']) or component-array['slot','id','version','bodyFingerprint']<>'{}' or component->>'bodyFingerprint'!~'^[a-f0-9]{64}$' or jsonb_typeof(component->'version') is distinct from 'number' or(component->>'version')::numeric<>trunc((component->>'version')::numeric) or(component->>'version')::numeric<1 then raise exception 'capital_s11_recipe_invalid' using errcode='22023';end if;
 expected:=null;expected_version:=null;
 case component->>'slot'
 when 'company' then expected:=r.session_id;expected_version:=1;
 when 'brief' then expected:=r.brief_id;select brief_version into expected_version from public.capital_project_briefs where organization_id=j.organization_id and id=r.brief_id;
 when 'institution' then expected:=r.plan_id;select plan_version into expected_version from public.capital_project_plans where organization_id=j.organization_id and id=r.plan_id;
 when 'revision' then expected:=r.job_id;expected_version:=1;
 when 'research' then expected:=r.id;expected_version:=1;
 when 'dependency' then
 select * into dep from public.capital_project_artifacts where organization_id=j.organization_id and capital_project_id=r.work_id and id=(component->>'id')::uuid and status not in ('stale','superseded');
 if dep.id is null or not exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id join public.capital_project_plan_tasks m07 on m07.organization_id=pt.organization_id and m07.plan_id=r.plan_id and m07.task_id='M04' where tr.organization_id=j.organization_id and tr.id=dep.task_run_id and tr.status='succeeded' and pt.task_id=any(m07.dependencies)) then raise exception 'capital_s11_dependency_denied' using errcode='42501';end if;
 if component->>'bodyFingerprint' is distinct from encode(extensions.digest('{"artifactFingerprint":'||to_jsonb(dep.artifact_fingerprint)::text||'}','sha256'),'hex') then raise exception 'capital_s11_dependency_pin_invalid' using errcode='22023';end if;
 if not exists(select 1 from private.capital_s11_task_projections bridge join private.capital_public_retained_payloads physical on physical.organization_id=bridge.organization_id and physical.id=bridge.derived_retained_payload_id
 join private.capital_public_payload_allocations allocation on allocation.organization_id=physical.organization_id and allocation.id=physical.allocation_id
 where bridge.organization_id=j.organization_id and bridge.recipe_id=r.id and bridge.capital_artifact_id=dep.id and bridge.artifact_fingerprint=dep.artifact_fingerprint
 and private.capital_body_physical_receipt_v1(j.organization_id,physical.id) and private.capital_s11_allocation_deadline_v1(j.organization_id,allocation.id,j.authorization_subject_id) is not null)
 then raise exception 'capital_s11_dependency_body_denied' using errcode='42501';end if;
 expected:=dep.id;expected_version:=dep.artifact_version;
 when 'source' then
 select l.* into lic from private.capital_public_delivery_licenses l join private.capital_public_deliveries d on d.organization_id=l.organization_id and d.id=l.delivery_id join private.capital_public_input_snapshots snap on snap.organization_id=d.organization_id and snap.id=d.capture_id where l.organization_id=j.organization_id and l.delivery_id=(component->>'id')::uuid and snap.job_id=j.id;
 select z.* into a from private.capital_public_retained_payloads p join private.capital_public_payload_allocations z on z.organization_id=p.organization_id and z.id=p.allocation_id where p.organization_id=j.organization_id and z.job_id=j.id and z.content_kind='public_source' and z.license_id=lic.id order by p.created_at limit 1;
 if lic.id is null or a.id is null or not private.capital_body_physical_receipt_v1(j.organization_id,(select id from private.capital_public_retained_payloads where organization_id=j.organization_id and allocation_id=a.id)) or private.capital_public_retention_deadline_v1(lic.id,j.organization_id,a.retained_at,a.policy_id) is null then raise exception 'capital_s11_source_denied' using errcode='42501';end if;
 expected:=lic.delivery_id;expected_version:=1;
 else raise exception 'capital_s11_recipe_invalid' using errcode='22023';end case;
 if expected is distinct from (component->>'id')::uuid or expected_version is distinct from(component->>'version')::integer or (component->>'slot'<>'source' and(component?'licenseId' or component?'retainedPayloadId')) then raise exception 'capital_s11_component_denied' using errcode='42501';end if;
 insert into private.capital_s11_recipe_components(organization_id,work_id,recipe_id,component_no,slot,reference_id,version,body_fingerprint,retained_payload_id,license_id,dependency_artifact_id)
 values(j.organization_id,r.work_id,r.id,ordinal,component->>'slot',expected,expected_version,component->>'bodyFingerprint',case when component->>'slot'='source' then(select id from private.capital_public_retained_payloads where organization_id=j.organization_id and allocation_id=a.id) end,case when component->>'slot'='source' then lic.id end,case when component->>'slot'='dependency' then dep.id end);
 end loop;
 deadline:=private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 if deadline is null then raise exception 'capital_s11_denied' using errcode='42501';end if;
 run:=private.worker_start_capital_project_task(j.id,p_capability_token,'M04','offroad.capital_planning','2026.09.24-v2',p_reconstruction_fingerprint,jsonb_build_object('schemaVersion','capital-s11-task-context.v1','recipeId',r.id,'recipeFingerprint',fp,'contextRetainedPayloadId',p_context_retained_payload_id));
 insert into private.capital_s11_recipe_seals(organization_id,work_id,recipe_id,task_run_id,context_retained_payload_id,recipe_fingerprint,reconstruction_fingerprint,prompt_fingerprint,primary_request_fingerprint,fallback_request_fingerprint,research_status,research_jurisdiction,research_jurisdiction_needs_confirmation,research_strategy_fingerprint,budget_version,research_reservation_version,research_reservation_micro_usd,effective_budget_micro_usd,effective_max_dispatches,sealed_at)
 values(j.organization_id,r.work_id,r.id,run,p_context_retained_payload_id,fp,p_reconstruction_fingerprint,p_prompt_fingerprint,p_primary_request_fingerprint,p_fallback_request_fingerprint,p_research_status,p_jurisdiction,p_jurisdiction_needs_confirmation,p_strategy_fingerprint,'capital-s11-operational-budget.v1','public-research-reservation.s11.v1',research_reserve,effective_budget,effective_dispatches,clock_timestamp()) returning * into s;
 end if;
 if private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_denied' using errcode='42501';end if;
 return private.capital_s11_recipe_dto_v1(j.organization_id,r.id);
end; $$;

create function private.require_capital_s11_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)
returns private.capital_s11_recipes language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_s11_recipes;s private.capital_s11_recipe_seals;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('capital-s11-recipe:'||j.organization_id::text||':'||p_recipe_id::text,0)) then raise exception 'capital_s11_retry' using errcode='40001';end if;
 select * into r from private.capital_s11_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 select * into s from private.capital_s11_recipe_seals where organization_id=j.organization_id and recipe_id=r.id;
 if r.id is null or s.id is null or r.worker_account_id<>auth.uid() or r.human_subject_id<>j.authorization_subject_id
 or private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null
 or not private.capital_body_physical_receipt_v1(j.organization_id,s.context_retained_payload_id)
 or not private.capital_body_retention_healthy_v1(r.retention_policy_id,j.organization_id,(select allocation_id from private.capital_public_retained_payloads where organization_id=j.organization_id and id=s.context_retained_payload_id))
 or not exists(select 1 from public.capital_project_task_runs tr where tr.organization_id=j.organization_id and tr.id=s.task_run_id and tr.processing_job_id=j.id and tr.input_fingerprint=s.reconstruction_fingerprint and (tr.status in ('running','succeeded') or(tr.status='failed' and exists(select 1 from private.capital_s11_quality_failures q where q.organization_id=tr.organization_id and q.recipe_id=r.id and q.task_run_id=tr.id and q.quality_results=tr.quality_results and tr.error=jsonb_build_object('code','capital_s11_quality_failed'))) or(tr.status='failed' and exists(select 1 from private.capital_s11_execution_failures q where q.organization_id=tr.organization_id and q.recipe_id=r.id and q.task_run_id=tr.id and tr.quality_results='[]'::jsonb and tr.error=jsonb_build_object('code','capital_s11_execution_failed','reason',q.reason)))))
 or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_recipe_denied' using errcode='42501';end if;
 return r;
end; $$;

-- DRAFT, not applied. Root integrates after recipe tables and helpers, before
-- parsed-body/native writers. M07 has its own origin, pins and 24k budget.
set search_path='';
create table private.capital_s11_operations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,job_id uuid not null,recipe_id uuid not null,task_run_id uuid not null,
 worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 root_attempt_id uuid not null,renderer_version text not null check(renderer_version='capital-public-task-renderer.s11.v1'),
 max_dispatches integer not null default 2 check(max_dispatches between 1 and 2),max_exposure_micro_usd bigint not null default 3000000 check(max_exposure_micro_usd between 1 and 3000000),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,task_run_id),unique(organization_id,work_id,job_id,id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_s11_recipes(organization_id,work_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,task_run_id) references public.capital_project_task_runs(organization_id,id)
);
create table private.capital_s11_gateway_attempts (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,
 operation_id uuid not null,recipe_id uuid not null,invocation_id uuid not null,worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 previous_attempt_id uuid,root_attempt_id uuid not null,used_provider_fallback boolean not null,
 request_fingerprint text not null check(request_fingerprint~'^[a-f0-9]{64}$'),input_fingerprint text not null check(input_fingerprint~'^[a-f0-9]{64}$'),prompt_fingerprint text not null check(prompt_fingerprint~'^[a-f0-9]{64}$'),
 attempt_metadata jsonb not null,route jsonb not null,resources text[] not null check(resources=array['inference','prompt_cache','schema_cache']::text[]),
 purpose text not null check(purpose='case_analysis'),model text not null check(model in ('claude-sonnet-5','gpt-5.6-terra')),
 processing_decision_id uuid not null,allowed boolean not null,renderer_policy_fingerprint text not null check(renderer_policy_fingerprint~'^[a-f0-9]{64}$'),
 reservation_micro_usd bigint not null check(reservation_micro_usd between 0 and 3000000),server_reservation_micro_usd bigint not null check(server_reservation_micro_usd between reservation_micro_usd and 3000000),
 captured_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,invocation_id),unique(organization_id,operation_id,used_provider_fallback),unique(organization_id,work_id,job_id,operation_id,id),
 foreign key(organization_id,work_id,job_id,operation_id) references private.capital_s11_operations(organization_id,work_id,job_id,id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_s11_recipes(organization_id,work_id,id),
 foreign key(organization_id,processing_decision_id) references private.processing_eligibility_decisions(organization_id,id),
 foreign key(organization_id,previous_attempt_id) references private.capital_s11_gateway_attempts(organization_id,id),
 foreign key(organization_id,root_attempt_id) references private.capital_s11_gateway_attempts(organization_id,id) deferrable initially deferred,
 check((not used_provider_fallback and previous_attempt_id is null and root_attempt_id=id and model='claude-sonnet-5')
 or(used_provider_fallback and previous_attempt_id is not null and root_attempt_id<>id and model='gpt-5.6-terra'))
);
alter table private.capital_s11_operations add constraint capital_s11_operation_root_fk
 foreign key(organization_id,work_id,job_id,id,root_attempt_id) references private.capital_s11_gateway_attempts(organization_id,work_id,job_id,operation_id,id) deferrable initially deferred;
create table private.capital_s11_input_dispatches (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,
 operation_id uuid not null,attempt_id uuid not null,invocation_id uuid not null,dispatch_claim_id uuid not null default gen_random_uuid(),
 worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 request_fingerprint text not null check(request_fingerprint~'^[a-f0-9]{64}$'),reservation_micro_usd bigint not null,server_reservation_micro_usd bigint not null,
 claimed_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,attempt_id),unique(organization_id,invocation_id),unique(organization_id,dispatch_claim_id),
 unique(organization_id,work_id,job_id,operation_id,attempt_id,id),
 foreign key(organization_id,work_id,job_id,operation_id,attempt_id) references private.capital_s11_gateway_attempts(organization_id,work_id,job_id,operation_id,id),
 check(reservation_micro_usd between 0 and 3000000 and server_reservation_micro_usd between reservation_micro_usd and 3000000)
);
create table private.capital_s11_attempt_outcomes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,
 operation_id uuid not null,attempt_id uuid not null,input_receipt_id uuid not null,invocation_id uuid not null,
 worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 observation jsonb not null,outcome text not null check(outcome in ('accepted','invalid_output','provider_error','timeout','refusal')),
 outcome_fingerprint text not null check(outcome_fingerprint~'^[a-f0-9]{64}$'),cost_micro_usd bigint,server_exposure_micro_usd bigint not null,
 recorded_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,attempt_id),unique(organization_id,input_receipt_id),unique(organization_id,invocation_id),
 foreign key(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id) references private.capital_s11_input_dispatches(organization_id,work_id,job_id,operation_id,attempt_id,id),
 check(cost_micro_usd is null or cost_micro_usd between 0 and 9007199254740991),check(server_exposure_micro_usd between 0 and 9007199254740991)
);
create unique index capital_s11_outcomes_one_accepted on private.capital_s11_attempt_outcomes(organization_id,operation_id) where outcome='accepted';
create table private.capital_s11_accepted_invocations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,recipe_id uuid not null,
 input_receipt_id uuid not null,invocation_id uuid not null,output_fingerprint text not null check(output_fingerprint~'^[a-f0-9]{64}$'),accepted_identity jsonb not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,input_receipt_id),unique(organization_id,recipe_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_s11_recipes(organization_id,work_id,id),
 foreign key(organization_id,input_receipt_id) references private.capital_s11_input_dispatches(organization_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id)
);
-- Cover every composite FK and principal lookup; append-only audit has no raw bodies.
create index capital_s11_operation_recipe_idx on private.capital_s11_operations(organization_id,work_id,recipe_id);
create index capital_s11_operation_job_idx on private.capital_s11_operations(organization_id,job_id);
create index capital_s11_operation_root_idx on private.capital_s11_operations(organization_id,work_id,job_id,id,root_attempt_id);
create index capital_s11_attempt_op_idx on private.capital_s11_gateway_attempts(organization_id,work_id,job_id,operation_id);
create index capital_s11_attempt_recipe_idx on private.capital_s11_gateway_attempts(organization_id,work_id,recipe_id);
create index capital_s11_attempt_decision_idx on private.capital_s11_gateway_attempts(organization_id,processing_decision_id);
create index capital_s11_attempt_previous_idx on private.capital_s11_gateway_attempts(organization_id,previous_attempt_id);
create index capital_s11_attempt_root_idx on private.capital_s11_gateway_attempts(organization_id,root_attempt_id);
create index capital_s11_dispatch_attempt_idx on private.capital_s11_input_dispatches(organization_id,work_id,job_id,operation_id,attempt_id);
create index capital_s11_outcome_input_idx on private.capital_s11_attempt_outcomes(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id);
create index capital_s11_accepted_recipe_idx on private.capital_s11_accepted_invocations(organization_id,work_id,recipe_id);
create index capital_s11_accepted_job_idx on private.capital_s11_accepted_invocations(organization_id,job_id);
do $$declare t text;begin
 foreach t in array array['capital_s11_operations','capital_s11_gateway_attempts','capital_s11_input_dispatches','capital_s11_attempt_outcomes','capital_s11_accepted_invocations'] loop
 execute format('alter table private.%I enable row level security',t);execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 execute format('create policy deny_clients_select on private.%I as restrictive for select to anon,authenticated using(false)',t);
 execute format('create policy deny_clients_insert on private.%I as restrictive for insert to anon,authenticated with check(false)',t);
 execute format('create policy deny_clients_update on private.%I as restrictive for update to anon,authenticated using(false) with check(false)',t);
 execute format('create policy deny_clients_delete on private.%I as restrictive for delete to anon,authenticated using(false)',t);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_source_version_mutation_v1()',t||'_immutable',t);
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated_at',t);
 execute format('create trigger %I after insert or update or delete on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 if t<>'capital_s11_accepted_invocations' then
 execute format('create index %I on private.%I(worker_account_id)',t||'_worker_idx',t);execute format('create index %I on private.%I(human_subject_id)',t||'_subject_idx',t);
 end if;
 end loop;
end;$$;

-- Separate closed registry; existing contribution fingerprint function is unchanged.
create function private.capital_s11_attempt_outcome_fingerprint_v1(p_outcome jsonb)
returns text language plpgsql immutable security definer set search_path='' as $$
declare keys text[]:=array['schemaVersion','fingerprintVersion','outcomeFingerprint','invocationId','task','provider','configuredModel','schemaName',
 'adapterInputVersion','requestFingerprint','inputFingerprint','promptFingerprint','previousInvocationId','retryOrdinal','isSameModelRepair',
 'usedProviderFallback','processingDecisionId','inputAttestationReceiptId','fromCassette','outcome','failureCode','outputFingerprintVersion',
 'outputFingerprint','reportedModel','validationIssueCodeFingerprint','reservationMicroUsd','costMicroUsd','exposureMicroUsd','costStatus',
 'inputTokens','outputTokens','cachedInputTokens','latencyMillis'];
 key text;number_value numeric;wire text;tuple jsonb;kind text;status text;
begin
 if jsonb_typeof(p_outcome) is distinct from 'object' or octet_length(p_outcome::text)>8192
 or not(p_outcome?&keys) or p_outcome-keys<>'{}'::jsonb
 or p_outcome->>'schemaVersion' is distinct from 'gateway-attempt-outcome.v1'
 or p_outcome->>'fingerprintVersion' is distinct from 'gateway-attempt-outcome-fingerprint.v1'
 or p_outcome->>'task' is distinct from 'capital_planning'
 or p_outcome->>'provider' is distinct from (case when p_outcome->>'configuredModel'='claude-sonnet-5' then 'anthropic' else 'openai' end)
 or p_outcome->>'configuredModel' is null or p_outcome->>'configuredModel' not in ('claude-sonnet-5','gpt-5.6-terra')
 or p_outcome->>'schemaName' is distinct from 'capital_planning_map_v1'
 or p_outcome->>'adapterInputVersion' is distinct from 'gateway-adapter-input.v1' then
 raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 foreach key in array array['outcomeFingerprint','requestFingerprint','inputFingerprint','promptFingerprint'] loop
 if jsonb_typeof(p_outcome->key) is distinct from 'string' or p_outcome->>key !~ '^[a-f0-9]{64}$' then
 raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;end loop;
 foreach key in array array['invocationId','processingDecisionId','inputAttestationReceiptId'] loop
 if jsonb_typeof(p_outcome->key) is distinct from 'string' or p_outcome->>key !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
 raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;end loop;
 if p_outcome->'previousInvocationId'<>'null'::jsonb and(jsonb_typeof(p_outcome->'previousInvocationId') is distinct from 'string'
 or p_outcome->>'previousInvocationId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') then
 raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 foreach key in array array['isSameModelRepair','usedProviderFallback','fromCassette'] loop
 if jsonb_typeof(p_outcome->key) is distinct from 'boolean' then raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;end loop;
 if p_outcome->>'isSameModelRepair'<>'false' or p_outcome->>'fromCassette'<>'false' or p_outcome->>'retryOrdinal'<>'0'
 or((p_outcome->>'usedProviderFallback')::boolean and p_outcome->'previousInvocationId'='null'::jsonb)
 or(not(p_outcome->>'usedProviderFallback')::boolean and p_outcome->'previousInvocationId'<>'null'::jsonb) then
 raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 foreach key in array array['retryOrdinal','reservationMicroUsd','costMicroUsd','exposureMicroUsd','inputTokens','outputTokens','cachedInputTokens','latencyMillis'] loop
 if p_outcome->key='null'::jsonb and key in ('costMicroUsd','inputTokens','outputTokens','cachedInputTokens') then continue;end if;
 if jsonb_typeof(p_outcome->key) is distinct from 'number' then raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 number_value:=(p_outcome->>key)::numeric;
 if number_value<0 or number_value>9007199254740991 or trunc(number_value)<>number_value or scale(number_value)<>0 then raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 end loop;
 kind:=p_outcome->>'outcome';status:=p_outcome->>'costStatus';
 if kind is null or kind not in ('accepted','invalid_output','provider_error','timeout','refusal') or status is null or status not in ('measured','unknown') then
 raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 if(status='unknown' and exists(select 1 from unnest(array['costMicroUsd','inputTokens','outputTokens','cachedInputTokens']) k where p_outcome->k<>'null'::jsonb))
 or(status='measured' and exists(select 1 from unnest(array['costMicroUsd','inputTokens','outputTokens','cachedInputTokens']) k where p_outcome->k='null'::jsonb))
 or(kind in ('provider_error','timeout') and status<>'unknown')
 or(p_outcome->>'exposureMicroUsd')::numeric<>greatest((p_outcome->>'reservationMicroUsd')::numeric,coalesce((p_outcome->>'costMicroUsd')::numeric,(p_outcome->>'reservationMicroUsd')::numeric)) then
 raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 if kind='accepted' then
 if p_outcome->'failureCode'<>'null'::jsonb or p_outcome->>'outputFingerprintVersion' is distinct from 'gateway-parsed-output.v1'
 or jsonb_typeof(p_outcome->'outputFingerprint') is distinct from 'string' or p_outcome->>'outputFingerprint'!~'^[a-f0-9]{64}$'
 or p_outcome->>'reportedModel' is distinct from p_outcome->>'configuredModel' or p_outcome->'validationIssueCodeFingerprint'<>'null'::jsonb then
 raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 else
 if p_outcome->'outputFingerprintVersion'<>'null'::jsonb or p_outcome->'outputFingerprint'<>'null'::jsonb or p_outcome->'reportedModel'<>'null'::jsonb
 or jsonb_typeof(p_outcome->'failureCode') is distinct from 'string'
 or(kind='invalid_output' and p_outcome->>'failureCode' not in ('schema_invalid','deterministic_invalid','output_truncated'))
 or(kind='provider_error' and p_outcome->>'failureCode'<>'provider_failure')
 or(kind='timeout' and p_outcome->>'failureCode'<>'provider_timeout')
 or(kind='refusal' and p_outcome->>'failureCode'<>'provider_refusal') then raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 if kind='invalid_output' then
 if p_outcome->'validationIssueCodeFingerprint'<>'null'::jsonb and(jsonb_typeof(p_outcome->'validationIssueCodeFingerprint') is distinct from 'string'
 or p_outcome->>'validationIssueCodeFingerprint'!~'^[a-f0-9]{64}$') then raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 if p_outcome->>'failureCode' in ('schema_invalid','deterministic_invalid') and p_outcome->'validationIssueCodeFingerprint'='null'::jsonb then
 raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 elsif p_outcome->'validationIssueCodeFingerprint'<>'null'::jsonb then raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 end if;
 tuple:=jsonb_build_array(p_outcome->'fingerprintVersion',p_outcome->'invocationId',p_outcome->'task',p_outcome->'provider',p_outcome->'configuredModel',
 p_outcome->'schemaName',p_outcome->'adapterInputVersion',p_outcome->'requestFingerprint',p_outcome->'inputFingerprint',p_outcome->'promptFingerprint',
 p_outcome->'previousInvocationId',p_outcome->'retryOrdinal',p_outcome->'isSameModelRepair',p_outcome->'usedProviderFallback',p_outcome->'processingDecisionId',
 p_outcome->'inputAttestationReceiptId',p_outcome->'fromCassette',p_outcome->'outcome',p_outcome->'failureCode',p_outcome->'outputFingerprintVersion',
 p_outcome->'outputFingerprint',p_outcome->'reportedModel',p_outcome->'validationIssueCodeFingerprint',p_outcome->'reservationMicroUsd',p_outcome->'costMicroUsd',
 p_outcome->'exposureMicroUsd',p_outcome->'costStatus',p_outcome->'inputTokens',p_outcome->'outputTokens',p_outcome->'cachedInputTokens',p_outcome->'latencyMillis');
 select '['||string_agg(case when jsonb_typeof(x.value)='number' then ((x.value::text)::numeric)::bigint::text else x.value::text end,',' order by x.ordinality)||']'
 into wire from jsonb_array_elements(tuple) with ordinality x(value,ordinality);
 return encode(extensions.digest(wire,'sha256'),'hex');
end; $$;

-- Closed ASCII registry, independently verified against shared Node serialization.
-- Schema pin refers to actual logical Zod schema; physical SHA remains separate.
create function private.capital_s11_dispatch_policy_v1(p_model text,p_input_bytes bigint)
returns jsonb language plpgsql immutable security definer set search_path='' as $$
declare tuple jsonb;wire text;pricing_wire text;tokens bigint;bound bigint;provider text;output_rate bigint;
begin
 if p_input_bytes is null or p_input_bytes not between 1 and 100000 or p_model is null or p_model not in ('claude-sonnet-5','gpt-5.6-terra') then raise exception 'capital_s11_policy_invalid' using errcode='22023';end if;
 provider:=case when p_model='claude-sonnet-5' then 'anthropic' else 'openai' end;
 output_rate:=case when p_model='claude-sonnet-5' then 10000000 else 12000000 end;
 pricing_wire:=case when p_model='claude-sonnet-5' then '{"cacheWrite":2.5,"cachedInput":0.2,"input":2,"longContext":null,"output":10}'
 else '{"cacheWrite":2.5,"cachedInput":0.2,"input":2,"longContext":{"aboveInputTokens":272000,"inputMultiplier":2,"outputMultiplier":1.5},"output":12}' end;
 tuple:=jsonb_build_array('capital-s11-dispatch-policy.v1','capital-public-task-renderer.s11.v1',provider,p_model,'medium',
 '3a27694f0e520b374c3077048f3af27eb19dcb6e6aa2dc261e8201ac4024c54b',3304,
 '4049ec522b661267da0e33a26b2a61705f7cdc2576577c6e75467bba92da93b5',
 '31ca5d156de399e5b8c3db53c50bd67003d05709711894cda6fb36c7f2265516',8000,240000,
 'capital-planning-map:31ca5d156de399e5b8c3db53c50bd67003d05709711894cda6fb36c7f2265516');
 select '['||string_agg(x.value::text,',' order by x.ordinality)||','||pricing_wire||']' into wire from jsonb_array_elements(tuple) with ordinality x(value,ordinality);
 -- Logical schema (4641B) exceeds strict OpenAI schema (3461B). Reserve the
 -- larger schema on either route, plus fixed framing and 10 percent headroom.
 tokens:=100000+3304+4641+1024;
 bound:=ceil((tokens::numeric*2500000+8000::numeric*output_rate)*11/10000000)::bigint;
 return jsonb_build_object('fingerprint',encode(extensions.digest(wire,'sha256'),'hex'),'serverBoundMicroUsd',bound);
end;$$;

create function private.lock_capital_s11_operation_v1(p_org uuid,p_recipe uuid)
returns void language plpgsql security definer set search_path='' as $$begin
 if not pg_try_advisory_xact_lock(hashtextextended('capital-s11-operation:'||p_org::text||':'||p_recipe::text,0)) then
 raise exception 'capital_s11_processing_retry' using errcode='40001';end if;
end;$$;
create function private.capital_s11_attempt_assurances_current_v1(p_job public.processing_jobs,p_attempt private.capital_s11_gateway_attempts)
returns void language plpgsql security definer set search_path='' as $$
declare decision_row private.processing_eligibility_decisions;assurance_row private.provider_processing_assurances;
 assurance_uuid uuid;seen text[]:='{}';matches integer;
begin
 if p_attempt.organization_id<>p_job.organization_id or p_attempt.job_id<>p_job.id or not p_attempt.allowed
 or p_attempt.worker_account_id<>auth.uid() or p_attempt.human_subject_id<>p_job.authorization_subject_id then raise exception 'capital_s11_processing_denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock_shared(hashtextextended('provider-processing-assurances',0)) then raise exception 'capital_s11_processing_retry' using errcode='40001';end if;
 select * into decision_row from private.processing_eligibility_decisions where organization_id=p_job.organization_id and job_id=p_job.id and id=p_attempt.processing_decision_id;
 if decision_row.id is null or not decision_row.allowed or decision_row.route is distinct from p_attempt.route
 or decision_row.classification is distinct from 'restricted' or decision_row.purpose is distinct from 'case_analysis'
 or decision_row.policy_version is distinct from 'offroad-provider-retention-v2' or decision_row.resources is distinct from p_attempt.resources
 or cardinality(decision_row.assurance_ids)<>3 or(select count(distinct x) from unnest(decision_row.assurance_ids)x)<>3 then
 raise exception 'capital_s11_processing_denied' using errcode='42501';end if;
 for assurance_uuid in select x from unnest(decision_row.assurance_ids)x order by x loop
 begin select * into assurance_row from private.provider_processing_assurances where id=assurance_uuid for share nowait;
 exception when lock_not_available then raise exception 'capital_s11_processing_retry' using errcode='40001';end;
 if assurance_row.id is null or assurance_row.revoked_at is not null or assurance_row.reviewed_at>clock_timestamp()
 or assurance_row.valid_through<=clock_timestamp() or assurance_row.provider is distinct from p_attempt.route->>'provider'
 or assurance_row.account_ref is distinct from p_attempt.route->>'accountRef' or assurance_row.project_ref is distinct from p_attempt.route->>'projectRef'
 or assurance_row.credential_binding is distinct from p_attempt.route->>'credentialBinding' or assurance_row.endpoint is distinct from p_attempt.route->>'endpoint'
 or assurance_row.region is distinct from p_attempt.route->>'region' or(assurance_row.document->'models' ? p_attempt.model)is distinct from true
 or assurance_row.resource not in ('inference','prompt_cache','schema_cache') or assurance_row.resource=any(seen)
 or assurance_row.document->>'eligibility' is distinct from 'supported' or assurance_row.document->>'trainingUse' is distinct from 'prohibited'
 or(assurance_row.document->'purposes' ? 'case_analysis')is distinct from true or(assurance_row.document->'classifications' ? 'restricted')is distinct from true
 or(assurance_row.document->'rights' ? 'process')is distinct from true then raise exception 'capital_s11_processing_denied' using errcode='42501';end if;
 select count(*) into matches from private.provider_processing_assurances a where a.revoked_at is null
 and(a.provider,a.account_ref,a.project_ref,a.credential_binding,a.endpoint,a.region,a.resource)
 is not distinct from(assurance_row.provider,assurance_row.account_ref,assurance_row.project_ref,assurance_row.credential_binding,assurance_row.endpoint,assurance_row.region,assurance_row.resource)
 and a.document->'models' ? p_attempt.model;
 if matches<>1 then raise exception 'capital_s11_processing_denied' using errcode='42501';end if;
 seen:=array_append(seen,assurance_row.resource);
 end loop;
end;$$;
create function private.capital_s11_attempt_current_v1(p_job_id uuid,p_capability_token text,p_attempt private.capital_s11_gateway_attempts)
returns private.capital_s11_recipes language plpgsql security definer set search_path='' as $$
declare recipe private.capital_s11_recipes;job public.processing_jobs;op private.capital_s11_operations;seal private.capital_s11_recipe_seals;prior private.capital_s11_gateway_attempts;
begin
 recipe:=private.require_capital_s11_recipe_v1(p_job_id,p_capability_token,p_attempt.recipe_id);
 if exists(select 1 from private.capital_s11_quality_failures where organization_id=recipe.organization_id and recipe_id=recipe.id) or exists(select 1 from private.capital_s11_execution_failures where organization_id=recipe.organization_id and recipe_id=recipe.id) then raise exception 'capital_s11_execution_failed_terminal' using errcode='42501';end if;
 job:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 perform private.lock_capital_s11_operation_v1(recipe.organization_id,recipe.id);
 select * into op from private.capital_s11_operations where organization_id=recipe.organization_id and id=p_attempt.operation_id;
 select * into seal from private.capital_s11_recipe_seals where organization_id=recipe.organization_id and recipe_id=recipe.id;
 if op.id is null or seal.id is null or p_attempt.job_id<>recipe.job_id or p_attempt.work_id<>recipe.work_id
 or p_attempt.worker_account_id<>auth.uid() or p_attempt.human_subject_id<>job.authorization_subject_id
 or op.recipe_id<>recipe.id or op.job_id<>job.id or op.worker_account_id<>auth.uid() or op.human_subject_id<>job.authorization_subject_id
 or op.task_run_id<>seal.task_run_id or op.root_attempt_id<>p_attempt.root_attempt_id
 or p_attempt.input_fingerprint<>seal.reconstruction_fingerprint or p_attempt.prompt_fingerprint<>seal.prompt_fingerprint
 or p_attempt.request_fingerprint<>(case when p_attempt.used_provider_fallback then seal.fallback_request_fingerprint else seal.primary_request_fingerprint end) then
 raise exception 'capital_s11_processing_denied' using errcode='42501';end if;
 if p_attempt.previous_attempt_id is not null then
 select * into prior from private.capital_s11_gateway_attempts where organization_id=recipe.organization_id and id=p_attempt.previous_attempt_id;
 if prior.id is null or prior.operation_id<>op.id or prior.used_provider_fallback or prior.root_attempt_id<>p_attempt.root_attempt_id
 or prior.worker_account_id<>auth.uid() or prior.human_subject_id<>job.authorization_subject_id then raise exception 'capital_s11_processing_denied' using errcode='42501';end if;
 if prior.allowed then
 perform private.capital_s11_attempt_assurances_current_v1(job,prior);
 if not exists(select 1 from private.capital_s11_attempt_outcomes o where o.organization_id=recipe.organization_id and o.attempt_id=prior.id and o.outcome<>'accepted') then
 raise exception 'capital_s11_processing_denied' using errcode='42501';end if;
 end if;
 end if;
 if p_attempt.allowed then perform private.capital_s11_attempt_assurances_current_v1(job,p_attempt);end if;
 return recipe;
end;$$;

create function private.capital_s11_attempt_dto_v1(p_attempt private.capital_s11_gateway_attempts,p_replayed boolean)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion','capital-body-processing-decision.v2','allowed',p_attempt.allowed,'policyVersion',d.policy_version,
 'assuranceId',null,'assuranceIds',to_jsonb(d.assurance_ids),'decisionId',d.id,'classification',d.classification,'reasons',to_jsonb(d.reasons),
 'attemptReceiptId',p_attempt.id,'invocationId',p_attempt.invocation_id,'requestFingerprint',p_attempt.request_fingerprint,
 'eligibilityFingerprint',encode(extensions.digest(jsonb_build_object('decision',d.id,'recipe',p_attempt.recipe_id,'policy',p_attempt.renderer_policy_fingerprint)::text,'sha256'),'hex'),
 'replayed',p_replayed,'operationId',p_attempt.operation_id,'rootAttemptReceiptId',p_attempt.root_attempt_id)
 from private.processing_eligibility_decisions d where d.organization_id=p_attempt.organization_id and d.id=p_attempt.processing_decision_id;
$$;
create function private.worker_authorize_capital_s11_processing_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_attempt jsonb,p_route jsonb,p_resources text[],p_purpose text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare recipe private.capital_s11_recipes:=private.require_capital_s11_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);seal private.capital_s11_recipe_seals;
 op private.capital_s11_operations;a private.capital_s11_gateway_attempts;prior private.capital_s11_gateway_attempts;
 fallback boolean;invocation uuid;prior_invocation uuid;new_attempt_id uuid:=gen_random_uuid();model text;policy jsonb;decision jsonb;
 observed bigint;server_reserve bigint;stamp timestamptz:=clock_timestamp();deadline timestamptz;replayed boolean:=false;
begin
 perform private.lock_capital_s11_operation_v1(recipe.organization_id,recipe.id);
 if exists(select 1 from private.capital_s11_quality_failures where organization_id=recipe.organization_id and recipe_id=recipe.id) or exists(select 1 from private.capital_s11_execution_failures where organization_id=recipe.organization_id and recipe_id=recipe.id) then raise exception 'capital_s11_quality_failed_terminal' using errcode='42501';end if;
 select * into strict seal from private.capital_s11_recipe_seals where organization_id=recipe.organization_id and recipe_id=recipe.id;
 if jsonb_typeof(p_attempt)is distinct from 'object' or octet_length(p_attempt::text)>4096
 or not(p_attempt?&array['adapterInputVersion','task','schemaName','requestFingerprint','inputFingerprint','promptFingerprint','invocationId','retryOrdinal','isSameModelRepair','usedProviderFallback','reservationUsd'])
 or p_attempt-array['adapterInputVersion','task','schemaName','requestFingerprint','inputFingerprint','promptFingerprint','invocationId','retryOrdinal','isSameModelRepair','usedProviderFallback','reservationUsd','previousInvocationId']<>'{}'::jsonb
 or p_attempt->>'adapterInputVersion'is distinct from 'gateway-adapter-input.v1' or p_attempt->>'task'is distinct from 'capital_planning'
 or p_attempt->>'schemaName'is distinct from 'capital_planning_map_v1'
 or exists(select 1 from unnest(array['requestFingerprint','inputFingerprint','promptFingerprint'])k where jsonb_typeof(p_attempt->k)is distinct from 'string' or p_attempt->>k !~'^[a-f0-9]{64}$')
 or jsonb_typeof(p_attempt->'invocationId')is distinct from 'string' or p_attempt->>'invocationId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 or jsonb_typeof(p_attempt->'retryOrdinal')is distinct from 'number' or p_attempt->>'retryOrdinal'is distinct from '0'
 or jsonb_typeof(p_attempt->'isSameModelRepair')is distinct from 'boolean' or p_attempt->>'isSameModelRepair'is distinct from 'false'
 or jsonb_typeof(p_attempt->'usedProviderFallback')is distinct from 'boolean' or jsonb_typeof(p_attempt->'reservationUsd')is distinct from 'number'
 or(p_attempt->>'reservationUsd')::numeric not between 0 and 3
 or p_resources is null or cardinality(p_resources)<>3 or not(p_resources@>array['inference','prompt_cache','schema_cache']::text[]) or p_purpose is distinct from 'case_analysis' then
 raise exception 'capital_s11_processing_invalid' using errcode='22023';end if;
 invocation:=(p_attempt->>'invocationId')::uuid;fallback:=(p_attempt->>'usedProviderFallback')::boolean;
 if(fallback and(jsonb_typeof(p_attempt->'previousInvocationId')is distinct from 'string' or p_attempt->>'previousInvocationId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'))
 or(not fallback and p_attempt?'previousInvocationId')then raise exception 'capital_s11_processing_invalid' using errcode='22023';end if;
 if fallback then prior_invocation:=(p_attempt->>'previousInvocationId')::uuid;end if;
 model:=case when fallback then 'gpt-5.6-terra' else 'claude-sonnet-5' end;
 if jsonb_typeof(p_route)is distinct from 'object' or p_route->>'provider'is distinct from (case when fallback then 'openai' else 'anthropic' end) or p_route->>'model'is distinct from model
 or p_route->>'endpoint'is distinct from (case when fallback then 'https://api.openai.com/v1/responses' else 'https://api.anthropic.com/v1/messages' end) then raise exception 'capital_s11_processing_invalid' using errcode='22023';end if;
 if p_attempt->>'inputFingerprint'is distinct from seal.reconstruction_fingerprint or p_attempt->>'promptFingerprint'is distinct from seal.prompt_fingerprint
 or p_attempt->>'requestFingerprint'is distinct from (case when fallback then seal.fallback_request_fingerprint else seal.primary_request_fingerprint end) then
 raise exception 'capital_s11_processing_denied' using errcode='42501';end if;
 if exists(select 1 from private.capital_body_invocation_inputs x where x.organization_id=recipe.organization_id and x.invocation_id=invocation)
 or exists(select 1 from private.capital_body_gateway_attempts x where x.organization_id=recipe.organization_id and x.invocation_id=invocation) then
 raise exception 'capital_s11_processing_denied' using errcode='42501';end if;
 policy:=private.capital_s11_dispatch_policy_v1(model,100000);observed:=ceil((p_attempt->>'reservationUsd')::numeric*1000000)::bigint;
 server_reserve:=greatest(observed,(policy->>'serverBoundMicroUsd')::bigint);
 select * into op from private.capital_s11_operations where organization_id=recipe.organization_id and recipe_id=recipe.id;
 select * into a from private.capital_s11_gateway_attempts where organization_id=recipe.organization_id and invocation_id=invocation;
 if a.id is not null then
 if op.id is null or a.operation_id<>op.id or a.recipe_id<>recipe.id or a.attempt_metadata is distinct from p_attempt or a.route is distinct from p_route
 or a.reservation_micro_usd<>observed or a.server_reservation_micro_usd<>server_reserve or a.renderer_policy_fingerprint<>policy->>'fingerprint' then
 raise exception 'capital_s11_processing_conflict' using errcode='23505';end if;
 perform private.capital_s11_attempt_current_v1(p_job_id,p_capability_token,a);replayed:=true;
 else
 if op.id is null then
 if fallback then raise exception 'capital_s11_processing_denied' using errcode='42501';end if;
 insert into private.capital_s11_operations(organization_id,work_id,job_id,recipe_id,task_run_id,worker_account_id,human_subject_id,root_attempt_id,renderer_version,max_dispatches,max_exposure_micro_usd)
 values(recipe.organization_id,recipe.work_id,job.id,recipe.id,seal.task_run_id,auth.uid(),job.authorization_subject_id,new_attempt_id,recipe.renderer_version,seal.effective_max_dispatches,seal.effective_budget_micro_usd) returning * into op;
 elsif not fallback then raise exception 'capital_s11_processing_denied' using errcode='42501';
 end if;
 if op.job_id<>job.id or op.worker_account_id<>auth.uid() or op.human_subject_id<>job.authorization_subject_id or op.task_run_id<>seal.task_run_id then raise exception 'capital_s11_processing_denied' using errcode='42501';end if;
 if fallback then
 select * into prior from private.capital_s11_gateway_attempts where organization_id=recipe.organization_id and invocation_id=prior_invocation;
 if prior.id is null or prior.operation_id<>op.id or prior.used_provider_fallback or prior.id<>op.root_attempt_id
 or exists(select 1 from private.capital_s11_attempt_outcomes o where o.organization_id=recipe.organization_id and o.operation_id=op.id and o.outcome='accepted') then raise exception 'capital_s11_processing_denied' using errcode='42501';end if;
 perform private.capital_s11_attempt_current_v1(p_job_id,p_capability_token,prior);
 if prior.allowed and not exists(select 1 from private.capital_s11_attempt_outcomes o where o.organization_id=recipe.organization_id and o.attempt_id=prior.id and o.outcome<>'accepted') then
 raise exception 'capital_s11_processing_denied' using errcode='42501';end if;
 end if;
 deadline:=private.capital_s11_recipe_deadline_v1(recipe.organization_id,recipe.id,job.authorization_subject_id);
 if deadline is null or deadline<=clock_timestamp() then raise exception 'capital_s11_processing_denied' using errcode='42501';end if;
 decision:=private.provider_processing_decision_with_body_limit_v1(job,p_route,array['inference','prompt_cache','schema_cache'],p_purpose,least(deadline,recipe.expires_at));
 insert into private.capital_s11_gateway_attempts(id,organization_id,work_id,job_id,operation_id,recipe_id,invocation_id,worker_account_id,human_subject_id,
 previous_attempt_id,root_attempt_id,used_provider_fallback,request_fingerprint,input_fingerprint,prompt_fingerprint,attempt_metadata,route,resources,purpose,model,
 processing_decision_id,allowed,renderer_policy_fingerprint,reservation_micro_usd,server_reservation_micro_usd,captured_at)
 values(new_attempt_id,recipe.organization_id,recipe.work_id,job.id,op.id,recipe.id,invocation,auth.uid(),job.authorization_subject_id,
 case when fallback then prior.id else null end,op.root_attempt_id,fallback,p_attempt->>'requestFingerprint',p_attempt->>'inputFingerprint',p_attempt->>'promptFingerprint',p_attempt,p_route,
 array['inference','prompt_cache','schema_cache'],'case_analysis',model,(decision->>'decisionId')::uuid,(decision->>'allowed')::boolean,policy->>'fingerprint',observed,server_reserve,stamp) returning * into a;
 end if;
 perform private.require_capital_s11_recipe_v1(p_job_id,p_capability_token,recipe.id);
 return private.capital_s11_attempt_dto_v1(a,replayed);
end;$$;

create function private.worker_record_capital_s11_input_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);a private.capital_s11_gateway_attempts;
 recipe private.capital_s11_recipes;op private.capital_s11_operations;claim private.capital_s11_input_dispatches;exposure numeric;sends integer;fresh boolean:=false;
 policy jsonb;eligibility jsonb;deadline timestamptz;
begin
 select * into a from private.capital_s11_gateway_attempts where organization_id=job.organization_id and job_id=job.id and id=p_attempt_receipt_id;
 if a.id is null or not a.allowed then raise exception 'capital_s11_processing_denied' using errcode='42501';end if;
 recipe:=private.capital_s11_attempt_current_v1(p_job_id,p_capability_token,a);
 select * into strict op from private.capital_s11_operations where organization_id=job.organization_id and id=a.operation_id;
 policy:=private.capital_s11_dispatch_policy_v1(a.model,100000);
 if a.renderer_policy_fingerprint<>policy->>'fingerprint' or a.server_reservation_micro_usd<>greatest(a.reservation_micro_usd,(policy->>'serverBoundMicroUsd')::bigint)then raise exception 'capital_s11_processing_denied' using errcode='42501';end if;
 select * into claim from private.capital_s11_input_dispatches where organization_id=job.organization_id and attempt_id=a.id;
 if claim.id is null then
 if exists(select 1 from private.capital_s11_attempt_outcomes where organization_id=job.organization_id and operation_id=op.id and outcome='accepted')then raise exception 'capital_s11_processing_denied' using errcode='42501';end if;
 select count(*),coalesce(sum(greatest(d.server_reservation_micro_usd,coalesce(o.cost_micro_usd,d.server_reservation_micro_usd))),0) into sends,exposure
 from private.capital_s11_input_dispatches d left join private.capital_s11_attempt_outcomes o on o.organization_id=d.organization_id and o.input_receipt_id=d.id
 where d.organization_id=job.organization_id and d.operation_id=op.id;
 if sends>=op.max_dispatches or exposure+a.server_reservation_micro_usd>op.max_exposure_micro_usd then raise exception 'capital_s11_budget_denied' using errcode='42501';end if;
 -- Re-evaluate provider TTL at the one actual send grant. Replay does not reset it.
 deadline:=private.capital_s11_recipe_deadline_v1(recipe.organization_id,recipe.id,job.authorization_subject_id);
 eligibility:=private.resolve_capital_body_processing_v1(job,a.route,a.resources,a.purpose,least(deadline,recipe.expires_at));
 if eligibility->>'allowed'is distinct from 'true' then raise exception 'capital_s11_processing_denied' using errcode='42501';end if;
 insert into private.capital_s11_input_dispatches(organization_id,work_id,job_id,operation_id,attempt_id,invocation_id,worker_account_id,human_subject_id,
 request_fingerprint,reservation_micro_usd,server_reservation_micro_usd,claimed_at)
 values(job.organization_id,a.work_id,job.id,op.id,a.id,a.invocation_id,auth.uid(),job.authorization_subject_id,a.request_fingerprint,a.reservation_micro_usd,a.server_reservation_micro_usd,clock_timestamp())returning * into claim;fresh:=true;
 end if;
 if claim.operation_id<>op.id or claim.invocation_id<>a.invocation_id or claim.worker_account_id<>auth.uid() or claim.human_subject_id<>job.authorization_subject_id
 or claim.request_fingerprint<>a.request_fingerprint then raise exception 'capital_s11_processing_conflict' using errcode='23505';end if;
 perform private.capital_s11_attempt_current_v1(p_job_id,p_capability_token,a);
 return jsonb_build_object('schemaVersion','capital-body-input-dispatch.v3','receiptId',claim.id,'invocationId',a.invocation_id,'requestFingerprint',a.request_fingerprint,
 'operationId',op.id,'attemptReceiptId',a.id,'rootAttemptReceiptId',op.root_attempt_id,'dispatchClaimId',claim.dispatch_claim_id,
 'rendererPolicyFingerprint',a.renderer_policy_fingerprint,'reservationMicroUsd',a.reservation_micro_usd,'serverReservationMicroUsd',claim.server_reservation_micro_usd,
 'dispatchAllowed',fresh,'replayed',not fresh);
end;$$;

create function private.worker_record_capital_s11_attempt_outcome_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid,p_outcome jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);a private.capital_s11_gateway_attempts;prior private.capital_s11_gateway_attempts;
 recipe private.capital_s11_recipes;op private.capital_s11_operations;claim private.capital_s11_input_dispatches;recorded private.capital_s11_attempt_outcomes;
 common_fp text;replayed boolean:=false;
begin
 common_fp:=private.capital_s11_attempt_outcome_fingerprint_v1(p_outcome);
 if common_fp is distinct from p_outcome->>'outcomeFingerprint'then raise exception 'capital_s11_outcome_invalid' using errcode='22023';end if;
 select * into a from private.capital_s11_gateway_attempts where organization_id=job.organization_id and job_id=job.id and id=p_attempt_receipt_id;
 if a.id is null or not a.allowed then raise exception 'capital_s11_processing_denied' using errcode='42501';end if;
 recipe:=private.capital_s11_attempt_current_v1(p_job_id,p_capability_token,a);
 select * into strict op from private.capital_s11_operations where organization_id=job.organization_id and id=a.operation_id;
 select * into claim from private.capital_s11_input_dispatches where organization_id=job.organization_id and attempt_id=a.id;
 select * into prior from private.capital_s11_gateway_attempts where organization_id=job.organization_id and id=a.previous_attempt_id;
 if claim.id is null or claim.operation_id<>op.id or claim.worker_account_id<>auth.uid() or claim.human_subject_id<>job.authorization_subject_id
 or(p_outcome->>'invocationId',p_outcome->>'task',p_outcome->>'provider',p_outcome->>'configuredModel',p_outcome->>'schemaName',p_outcome->>'adapterInputVersion',
 p_outcome->>'requestFingerprint',p_outcome->>'inputFingerprint',p_outcome->>'promptFingerprint',p_outcome->>'previousInvocationId',p_outcome->>'retryOrdinal',
 p_outcome->>'isSameModelRepair',p_outcome->>'usedProviderFallback',p_outcome->>'processingDecisionId',p_outcome->>'inputAttestationReceiptId')
 is distinct from(a.invocation_id::text,'capital_planning'::text,(a.route->>'provider')::text,a.model,'capital_planning_map_v1'::text,'gateway-adapter-input.v1'::text,
 a.request_fingerprint,a.input_fingerprint,a.prompt_fingerprint,prior.invocation_id::text,'0'::text,'false'::text,a.used_provider_fallback::text,a.processing_decision_id::text,claim.id::text)
 or(p_outcome->>'reservationMicroUsd')::bigint<>a.reservation_micro_usd then raise exception 'capital_s11_outcome_denied' using errcode='42501';end if;
 select * into recorded from private.capital_s11_attempt_outcomes where organization_id=job.organization_id and attempt_id=a.id;
 if recorded.id is not null then
 if recorded.observation is distinct from p_outcome or recorded.outcome_fingerprint<>common_fp or recorded.input_receipt_id<>claim.id then raise exception 'capital_s11_outcome_conflict' using errcode='23505';end if;
 replayed:=true;
 else
 insert into private.capital_s11_attempt_outcomes(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id,invocation_id,worker_account_id,human_subject_id,
 observation,outcome,outcome_fingerprint,cost_micro_usd,server_exposure_micro_usd,recorded_at)
 values(job.organization_id,a.work_id,job.id,op.id,a.id,claim.id,a.invocation_id,auth.uid(),job.authorization_subject_id,p_outcome,p_outcome->>'outcome',common_fp,
 (p_outcome->>'costMicroUsd')::bigint,greatest(claim.server_reservation_micro_usd,coalesce((p_outcome->>'costMicroUsd')::bigint,claim.server_reservation_micro_usd)),clock_timestamp())returning * into recorded;
 end if;
 perform private.capital_s11_attempt_current_v1(p_job_id,p_capability_token,a);
 return jsonb_build_object('schemaVersion','capital-body-attempt-outcome-receipt.v1','receiptId',recorded.id,'operationId',op.id,'attemptReceiptId',a.id,'inputReceiptId',claim.id,
 'rootAttemptReceiptId',op.root_attempt_id,'invocationId',a.invocation_id,'requestFingerprint',a.request_fingerprint,'fingerprintVersion','gateway-attempt-outcome-fingerprint.v1',
 'outcomeFingerprint',recorded.outcome_fingerprint,'outcome',recorded.outcome,'failureCode',recorded.observation->'failureCode','replayed',replayed);
end;$$;
create function private.worker_record_capital_s11_accepted_v1(p_job_id uuid,p_capability_token text,p_input_receipt_id uuid,p_accepted jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);a private.capital_s11_gateway_attempts;
 recipe private.capital_s11_recipes;claim private.capital_s11_input_dispatches;outcome_row private.capital_s11_attempt_outcomes;accepted private.capital_s11_accepted_invocations;
 keys text[]:=array['schemaVersion','invocationId','adapterInputVersion','adapterRequestFingerprint','outputFingerprintVersion','outputFingerprint','inputFingerprint','promptFingerprint',
 'provider','configuredModel','reportedModel','schemaName','retryOrdinal','isSameModelRepair','usedProviderFallback','fromCassette','inputAttestationReceiptId'];
begin
 select * into claim from private.capital_s11_input_dispatches where organization_id=job.organization_id and job_id=job.id and id=p_input_receipt_id;
 if claim.id is null or claim.worker_account_id<>auth.uid() or claim.human_subject_id<>job.authorization_subject_id then raise exception 'capital_s11_accepted_denied' using errcode='42501';end if;
 select * into strict a from private.capital_s11_gateway_attempts where organization_id=job.organization_id and id=claim.attempt_id;
 recipe:=private.capital_s11_attempt_current_v1(p_job_id,p_capability_token,a);
 select * into outcome_row from private.capital_s11_attempt_outcomes where organization_id=job.organization_id and input_receipt_id=claim.id;
 if outcome_row.id is null or outcome_row.outcome<>'accepted' then raise exception 'capital_s11_accepted_denied' using errcode='42501';end if;
 if jsonb_typeof(p_accepted)is distinct from 'object' or not(p_accepted?&keys) or p_accepted-keys<>'{}'::jsonb or octet_length(p_accepted::text)>4096
 or p_accepted->>'schemaVersion'is distinct from 'gateway-accepted-invocation.v1'
 or p_accepted->>'adapterInputVersion'is distinct from 'gateway-adapter-input.v1' or p_accepted->>'outputFingerprintVersion'is distinct from 'gateway-parsed-output.v1'
 or p_accepted->>'provider'is distinct from a.route->>'provider' or p_accepted->>'configuredModel'is distinct from a.model or p_accepted->>'reportedModel'is distinct from a.model
 or p_accepted->>'schemaName'is distinct from 'capital_planning_map_v1' or p_accepted->>'invocationId'is distinct from a.invocation_id::text
 or p_accepted->>'inputAttestationReceiptId'is distinct from claim.id::text or p_accepted->>'adapterRequestFingerprint'is distinct from a.request_fingerprint
 or p_accepted->>'inputFingerprint'is distinct from a.input_fingerprint or p_accepted->>'promptFingerprint'is distinct from a.prompt_fingerprint
 or p_accepted->>'outputFingerprint'is distinct from outcome_row.observation->>'outputFingerprint'
 or jsonb_typeof(p_accepted->'retryOrdinal')is distinct from 'number' or p_accepted->>'retryOrdinal'is distinct from '0'
 or jsonb_typeof(p_accepted->'isSameModelRepair')is distinct from 'boolean' or p_accepted->>'isSameModelRepair'is distinct from 'false'
 or jsonb_typeof(p_accepted->'fromCassette')is distinct from 'boolean' or p_accepted->>'fromCassette'is distinct from 'false'
 or jsonb_typeof(p_accepted->'usedProviderFallback')is distinct from 'boolean' or p_accepted->>'usedProviderFallback'is distinct from a.used_provider_fallback::text
 then raise exception 'capital_s11_accepted_invalid' using errcode='22023';end if;
 select * into accepted from private.capital_s11_accepted_invocations where organization_id=job.organization_id and recipe_id=recipe.id;
 if accepted.id is not null then
 if accepted.input_receipt_id<>claim.id or accepted.accepted_identity is distinct from p_accepted then raise exception 'capital_s11_accepted_conflict' using errcode='23505';end if;
 else
 insert into private.capital_s11_accepted_invocations(organization_id,work_id,job_id,recipe_id,input_receipt_id,invocation_id,output_fingerprint,accepted_identity)
 values(job.organization_id,a.work_id,job.id,recipe.id,claim.id,a.invocation_id,p_accepted->>'outputFingerprint',p_accepted)returning * into accepted;
 end if;
 perform private.capital_s11_attempt_current_v1(p_job_id,p_capability_token,a);
 return jsonb_build_object('acceptedInvocationId',accepted.id,'inputReceiptId',claim.id,'invocationId',accepted.invocation_id,'outputFingerprint',accepted.output_fingerprint);
end;$$;

-- Both orders forbid the old body-input endpoint from supplying a receipt for a
-- native invocation. The trigger also closes the same-job legacy path after seal.
create function private.guard_capital_s11_legacy_input_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipe private.capital_s11_recipes;
begin
 select * into recipe from private.capital_s11_recipes where organization_id=new.organization_id and job_id=new.job_id;
 if recipe.id is not null then
 if not pg_try_advisory_xact_lock(hashtextextended('capital-s11-recipe:'||recipe.organization_id::text||':'||recipe.id::text,0)) then raise exception 'capital_s11_processing_retry' using errcode='40001';end if;
 if exists(select 1 from private.capital_s11_recipe_seals where organization_id=recipe.organization_id and recipe_id=recipe.id)then raise exception 'capital_s11_legacy_input_denied' using errcode='42501';end if;
 end if;
 if exists(select 1 from private.capital_s11_gateway_attempts where organization_id=new.organization_id and invocation_id=new.invocation_id)then raise exception 'capital_s11_legacy_input_denied' using errcode='42501';end if;
 return new;
end;$$;
create trigger capital_s11_legacy_input_guard before insert on private.capital_body_invocation_inputs for each row execute function private.guard_capital_s11_legacy_input_v1();

create function public.worker_authorize_capital_s11_processing_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_attempt jsonb,p_route jsonb,p_resources text[],p_purpose text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_authorize_capital_s11_processing_v1(p_job_id,p_capability_token,p_recipe_id,p_attempt,p_route,p_resources,p_purpose);$$;
create function public.worker_record_capital_s11_input_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_capital_s11_input_v1(p_job_id,p_capability_token,p_attempt_receipt_id);$$;
create function public.worker_record_capital_s11_attempt_outcome_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid,p_outcome jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_capital_s11_attempt_outcome_v1(p_job_id,p_capability_token,p_attempt_receipt_id,p_outcome);$$;
create function public.worker_record_capital_s11_accepted_v1(p_job_id uuid,p_capability_token text,p_input_receipt_id uuid,p_accepted jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_capital_s11_accepted_v1(p_job_id,p_capability_token,p_input_receipt_id,p_accepted);$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
 and p.proname in ('capital_s11_attempt_outcome_fingerprint_v1','capital_s11_dispatch_policy_v1','lock_capital_s11_operation_v1','capital_s11_attempt_assurances_current_v1',
 'capital_s11_attempt_current_v1','capital_s11_attempt_dto_v1','guard_capital_s11_legacy_input_v1') loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public')
 and p.proname in ('worker_authorize_capital_s11_processing_v1','worker_record_capital_s11_input_v1','worker_record_capital_s11_attempt_outcome_v1','worker_record_capital_s11_accepted_v1')loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);execute format('grant execute on function %s to authenticated',f.signature);end loop;
end;$$;

-- Assemble after S11 ledger, before native commit. No independent publication.
-- Internal products preserve accepted bytes through bounded Storage; CPA contains only pointers.
set search_path='';
alter table private.capital_s11_body_bases add column accepted_invocation_id uuid,add column parent_retained_payload_id uuid,add column task_id text,add column task_run_id uuid,
 add constraint capital_s11_basis_task_run_fk foreign key(organization_id,task_run_id) references public.capital_project_task_runs(organization_id,id),
 add constraint capital_s11_basis_accepted_fk foreign key(organization_id,accepted_invocation_id) references private.capital_s11_accepted_invocations(organization_id,id),
 add constraint capital_s11_basis_parent_fk foreign key(organization_id,parent_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 add constraint capital_s11_basis_derivation_check check(
 (kind='context' and accepted_invocation_id is null and parent_retained_payload_id is null and semantic_fingerprint is null and task_id is null and task_run_id is null)
 or(kind='parsed' and accepted_invocation_id is not null and parent_retained_payload_id is null and semantic_fingerprint is not null and task_id is null and task_run_id is null)
 or(kind='final' and accepted_invocation_id is not null and parent_retained_payload_id is not null and semantic_fingerprint is not null and task_id is null and task_run_id is null)
 or(kind='prelude' and accepted_invocation_id is null and parent_retained_payload_id is not null and semantic_fingerprint is not null and task_id in('M01','M02','M03') and task_run_id is not null)
 or(kind='derived' and accepted_invocation_id is not null and parent_retained_payload_id is not null and semantic_fingerprint is not null and task_id~'^[A-Z][0-9]{2}$' and task_run_id is not null));
create index capital_s11_basis_accepted_idx on private.capital_s11_body_bases(organization_id,accepted_invocation_id);
create index capital_s11_basis_task_run_idx on private.capital_s11_body_bases(organization_id,task_run_id);
create index capital_s11_basis_parent_idx on private.capital_s11_body_bases(organization_id,parent_retained_payload_id);

create function private.capital_s11_task_type_v1(p_task text) returns text language sql immutable set search_path='' as $$
 select case p_task
 when 'M01' then 'company_scope'
 when 'M02' then 'capital_intent'
 when 'M03' then 'constraint_register'
 when 'M04' then 'candidate_archetypes'
 when 'M05' then 'deliverable_definition'
 when 'M06' then 'capital_planning_execution_plan'
 when 'D01' then 'document_ingestion_status'
 when 'D02' then 'document_classification_status'
 when 'D03' then 'document_extraction_status'
 when 'D04' then 'document_fact_candidate_status'
 when 'D05' then 'entity_period_unit_resolution'
 when 'D06' then 'evidence_reconciliation_status'
 when 'D07' then 'accounting_identity_status'
 when 'C01' then 'business_model_reconstruction'
 when 'C02' then 'sector_regulatory_research'
 when 'C03' then 'financial_spreading'
 when 'C04' then 'earnings_quality_analysis'
 when 'C05' then 'debt_economic_map'
 when 'C06' then 'working_capital_analysis'
 when 'C07' then 'projection_normalization'
 when 'C08' then 'scenario_stress_analysis'
 when 'C09' then 'risk_mitigation_diagnostic'
 when 'C10' then 'capacity_assessment'
 when 'C11' then 'structuring_thesis'
 when 'S01' then 'request_need_comparison'
 when 'S02' then 'instrument_universe'
 when 'S03' then 'legal_economic_filters'
 when 'S04' then 'collateral_map'
 when 'S05' then 'structure_alternatives'
 when 'S06' then 'pricing_terms_research'
 when 'S07' then 'total_cost_comparison'
 when 'S08' then 'covenant_protection_design'
 when 'S09' then 'sources_uses'
 when 'S10' then 'alternative_comparison'
 end;
$$;
create table private.capital_s11_task_projections(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,
 recipe_id uuid not null,task_id text not null,task_run_id uuid not null,capital_artifact_id uuid not null,
 accepted_invocation_id uuid,parsed_retained_payload_id uuid,derived_retained_payload_id uuid not null,
 semantic_fingerprint text not null check(semantic_fingerprint~'^[a-f0-9]{64}$'),artifact_fingerprint text not null check(artifact_fingerprint~'^[a-f0-9]{64}$'),artifact_version integer not null check(artifact_version>0),
 transformation_version text not null default 'capital-planning-task.transform.v1' check(transformation_version='capital-planning-task.transform.v1'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id,task_id),unique(organization_id,task_run_id),unique(organization_id,capital_artifact_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_s11_recipes(organization_id,work_id,id),
 foreign key(organization_id,task_run_id) references public.capital_project_task_runs(organization_id,id),
 foreign key(organization_id,capital_artifact_id) references public.capital_project_artifacts(organization_id,id) deferrable initially deferred,
 foreign key(organization_id,accepted_invocation_id) references private.capital_s11_accepted_invocations(organization_id,id),
 foreign key(organization_id,parsed_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,derived_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 check(private.capital_s11_task_type_v1(task_id) is not null),
 check((task_id in('M01','M02','M03') and accepted_invocation_id is null and parsed_retained_payload_id is null) or(task_id not in('M01','M02','M03') and accepted_invocation_id is not null and parsed_retained_payload_id is not null))
);
create index capital_s11_task_projection_work_idx on private.capital_s11_task_projections(organization_id,work_id,recipe_id);
create index capital_s11_task_projection_accepted_idx on private.capital_s11_task_projections(organization_id,accepted_invocation_id);
create index capital_s11_task_projection_parsed_idx on private.capital_s11_task_projections(organization_id,parsed_retained_payload_id);
create index capital_s11_task_projection_retained_idx on private.capital_s11_task_projections(organization_id,derived_retained_payload_id);
alter table private.capital_s11_task_projections enable row level security;
alter table private.capital_s11_task_projections force row level security;
revoke all on private.capital_s11_task_projections from public,anon,authenticated,service_role;
create policy capital_s11_tasks_deny_select on private.capital_s11_task_projections as restrictive for select to anon,authenticated using(false);
create policy capital_s11_tasks_deny_insert on private.capital_s11_task_projections as restrictive for insert to anon,authenticated with check(false);
create policy capital_s11_tasks_deny_update on private.capital_s11_task_projections as restrictive for update to anon,authenticated using(false) with check(false);
create policy capital_s11_tasks_deny_delete on private.capital_s11_task_projections as restrictive for delete to anon,authenticated using(false);
create trigger capital_s11_tasks_immutable before update or delete on private.capital_s11_task_projections for each row execute function private.reject_review_history_mutation_v1();
create trigger capital_s11_tasks_no_truncate before truncate on private.capital_s11_task_projections for each statement execute function private.reject_review_history_mutation_v1();
create trigger capital_s11_tasks_updated_at before update on private.capital_s11_task_projections for each row execute function private.set_updated_at();
create trigger capital_s11_tasks_audit after insert on private.capital_s11_task_projections for each row execute function private.capture_identity_audit_v1();

create function private.require_capital_s11_task_run_v1(p_org uuid,p_recipe uuid,p_task_run uuid,p_authorized_job_id uuid default null)
returns public.capital_project_task_runs language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_s11_recipes;tr public.capital_project_task_runs;pt public.capital_project_plan_tasks;
begin
 select * into r from private.capital_s11_recipes where organization_id=p_org and id=p_recipe;
 select * into tr from public.capital_project_task_runs where organization_id=p_org and id=p_task_run;
 select * into pt from public.capital_project_plan_tasks where organization_id=p_org and id=tr.plan_task_id;
 if r.id is null or tr.id is null or tr.capital_project_id is distinct from r.work_id or(tr.processing_job_id is distinct from r.job_id and tr.processing_job_id is distinct from p_authorized_job_id)
 or(pt.task_id='M04' and tr.processing_job_id is distinct from r.job_id)
 or pt.plan_id is distinct from r.plan_id or private.capital_s11_task_type_v1(pt.task_id) is null
 or tr.executor_key is distinct from 'offroad.capital_planning' or tr.executor_version is distinct from '2026.09.24-v2'
 or tr.status not in('running','succeeded') then raise exception 'capital_s11_task_run_denied' using errcode='42501';end if;
 return tr;
end; $$;
create function private.capital_s11_task_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_recovery boolean default false)
returns private.capital_s11_recipes language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_s11_recipes;tr public.capital_project_task_runs;task text;grant_row jsonb;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('capital-s11-recipe:'||j.organization_id::text||':'||p_recipe_id::text,0)) then raise exception 'capital_s11_retry' using errcode='40001';end if;
 if p_recovery then
 grant_row:=private.worker_recover_capital_s11_result_v1(p_job_id,p_capability_token,p_recipe_id);
 if grant_row->>'state' is null or grant_row->>'state' not in('transform','commit','committed') then raise exception 'capital_s11_recovered_task_denied' using errcode='42501';end if;
 select * into r from private.capital_s11_recipes where organization_id=j.organization_id and id=p_recipe_id;
 perform private.require_capital_s11_task_run_v1(j.organization_id,r.id,p_task_run_id,j.id);
 if r.id is null or private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null then raise exception 'capital_s11_recovered_task_denied' using errcode='42501';end if;
 return r;
 end if;
 select * into r from private.capital_s11_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 tr:=private.require_capital_s11_task_run_v1(j.organization_id,r.id,p_task_run_id,case when p_recovery then j.id end);
 select task_id into task from public.capital_project_plan_tasks where organization_id=j.organization_id and id=tr.plan_task_id;
 if task not in('M01','M02','M03') or exists(select 1 from private.capital_s11_recipe_seals where organization_id=j.organization_id and recipe_id=r.id) then return private.require_capital_s11_recipe_v1(p_job_id,p_capability_token,p_recipe_id);end if;
 if r.id is null or r.worker_account_id is distinct from auth.uid() or r.human_subject_id is distinct from j.authorization_subject_id
 or private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null
 or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_prelude_denied' using errcode='42501';end if;
 return r;
end; $$;

create function private.worker_prepare_capital_s11_task_projection_core_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,
 p_task_run_id uuid,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid,p_recovery boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.capital_s11_recipes;grant_row jsonb;
 j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);ok private.capital_s11_accepted_invocations;
 tr public.capital_project_task_runs;task text;b private.capital_s11_body_bases;parent private.capital_s11_body_bases;a private.capital_public_payload_allocations;
 parent_a private.capital_public_payload_allocations;p private.capital_public_retention_policies;deadline timestamptz;fp text;bytes bigint;stamp timestamptz:=clock_timestamp();replayed boolean:=false;
begin
 r:=private.capital_s11_task_recipe_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_recovery);
 tr:=private.require_capital_s11_task_run_v1(j.organization_id,r.id,p_task_run_id,case when p_recovery then j.id end);
 select task_id into task from public.capital_project_plan_tasks where organization_id=j.organization_id and id=tr.plan_task_id;
 if exists(select 1 from private.capital_s11_quality_failures where organization_id=j.organization_id and recipe_id=r.id) or exists(select 1 from private.capital_s11_execution_failures where organization_id=j.organization_id and recipe_id=r.id) then raise exception 'capital_s11_quality_failed_terminal' using errcode='42501';end if;
 if p_request_id is null or jsonb_typeof(p_body) is distinct from 'object'
 or p_output_fingerprint is null or p_output_fingerprint!~'^[a-f0-9]{64}$' then raise exception 'capital_s11_output_invalid' using errcode='22023';end if;
 select * into ok from private.capital_s11_accepted_invocations where organization_id=j.organization_id and job_id=r.job_id and recipe_id=r.id and id=p_accepted_invocation_id;
 if task not in('M01','M02','M03') and ok.id is null then raise exception 'capital_s11_accepted_denied' using errcode='42501';end if;
 if p_body->>'schemaVersion' is distinct from 'capital-planning-task.v1' or p_body->>'taskId' is distinct from task
 or p_body->>'artifactType' is distinct from private.capital_s11_task_type_v1(task) or jsonb_typeof(p_body->'content') is distinct from 'object'
 or p_body-array['schemaVersion','taskId','artifactType','content']<>'{}'::jsonb then raise exception 'capital_s11_task_body_invalid' using errcode='22023';end if;
 select x.* into parent_a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=j.organization_id and q.id=p_parent_retained_payload_id and x.content_kind='s11_body';
 select * into parent from private.capital_s11_body_bases where organization_id=j.organization_id and id=parent_a.s11_body_basis_id;
 if parent.id is null or parent.recipe_id<>r.id or not private.capital_body_physical_receipt_v1(j.organization_id,p_parent_retained_payload_id)
 or(task in('M01','M02','M03') and(parent.kind is distinct from 'context' or p_accepted_invocation_id is not null or parent.accepted_invocation_id is not null or parent_a.payload_fingerprint is distinct from r.context_fingerprint))
 or(task not in('M01','M02','M03') and(parent.kind is distinct from 'parsed' or parent.accepted_invocation_id is distinct from ok.id or parent.semantic_fingerprint is distinct from ok.output_fingerprint)) then raise exception 'capital_s11_parent_denied' using errcode='42501';end if;
 select * into strict p from private.capital_public_retention_policies where id=r.retention_policy_id;
 deadline:=private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 deadline:=least(deadline,parent_a.expires_at,parent_a.purge_at);
 if deadline is null or deadline-make_interval(secs=>p.purge_margin_seconds)<=stamp or not private.capital_public_retention_healthy_v1(j.leased_by,p.id) then raise exception 'capital_s11_retention_denied' using errcode='42501';end if;
 fp:=encode(extensions.digest(p_body::text,'sha256'),'hex');bytes:=octet_length(p_body::text);
 if bytes not between 1 and 1048576 then raise exception 'capital_s11_body_size_invalid' using errcode='22023';end if;
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and job_id=j.id and request_id=p_request_id and content_kind='s11_body';
 if a.id is not null then
 select * into strict b from private.capital_s11_body_bases where organization_id=j.organization_id and id=a.s11_body_basis_id;
 if b.recipe_id<>r.id or b.kind is distinct from(case when task in('M01','M02','M03') then 'prelude' else 'derived' end) or b.task_id is distinct from task or b.task_run_id is distinct from tr.id or b.accepted_invocation_id is distinct from ok.id or b.parent_retained_payload_id is distinct from p_parent_retained_payload_id or b.semantic_fingerprint<>p_output_fingerprint or a.payload_fingerprint<>fp or a.byte_length<>bytes then raise exception 'capital_s11_output_conflict' using errcode='23505';end if;
 replayed:=true;
 if private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null then raise exception 'capital_s11_retention_denied' using errcode='42501';end if;
 else
 insert into private.capital_s11_body_bases(organization_id,work_id,recipe_id,kind,task_id,task_run_id,semantic_fingerprint,accepted_invocation_id,parent_retained_payload_id)
 values(j.organization_id,r.work_id,r.id,case when task in('M01','M02','M03') then 'prelude' else 'derived' end,task,tr.id,p_output_fingerprint,ok.id,p_parent_retained_payload_id) returning * into b;
 insert into private.capital_public_payload_allocations(id,organization_id,request_id,job_id,worker_token_id,worker_account_id,capability_sha256,policy_id,
 payload_fingerprint,byte_length,object_path,retained_at,expires_at,purge_at,upload_expires_at,s11_body_basis_id,content_kind)
 values(b.id,j.organization_id,p_request_id,j.id,j.leased_by,auth.uid(),j.capability_sha256,p.id,fp,bytes,j.organization_id::text||'/'||b.id::text||'/payload.json',stamp,deadline,
 deadline-make_interval(secs=>p.purge_margin_seconds),least(stamp+interval '5 minutes',deadline-make_interval(secs=>p.purge_margin_seconds)),b.id,'s11_body') returning * into a;
 insert into private.capital_public_payload_purge_queue(organization_id,allocation_id,next_check_at,effective_purge_at) values(j.organization_id,a.id,least(a.upload_expires_at,a.purge_at),a.purge_at);
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_denied' using errcode='42501';end if;
 return private.capital_s11_body_dto_v1(j.organization_id,a.id,deadline,replayed)||jsonb_build_object('canonicalBody',p_body::text);
end; $$;


create function private.capital_s11_task_projection_dto_v1(p_org uuid,p_recipe uuid,p_task_run uuid,p_replayed boolean)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion','capital-s11-task-projection-receipt.v1','recipeId',x.recipe_id,'taskId',x.task_id,'taskRunId',x.task_run_id,
 'capitalArtifactId',x.capital_artifact_id,'artifactFingerprint',x.artifact_fingerprint,'artifactVersion',x.artifact_version,
 'retainedPayloadId',x.derived_retained_payload_id,'replayed',p_replayed)
 from private.capital_s11_task_projections x where x.organization_id=p_org and x.recipe_id=p_recipe and x.task_run_id=p_task_run;
$$;
create function private.worker_commit_capital_s11_task_projection_core_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_retained_payload_id uuid,p_recovery boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_s11_recipes:=private.capital_s11_task_recipe_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_recovery);
 j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 tr public.capital_project_task_runs:=private.require_capital_s11_task_run_v1(j.organization_id,r.id,p_task_run_id,case when p_recovery then j.id end);
 pt public.capital_project_plan_tasks;old private.capital_s11_task_projections;
 a private.capital_public_payload_allocations;b private.capital_s11_body_bases;deps jsonb;dep text;dep_art public.capital_project_artifacts;
 projection jsonb;fp text;aid uuid:=gen_random_uuid();v integer;stamp timestamptz:=clock_timestamp();deadline timestamptz;
begin
 select * into tr from public.capital_project_task_runs where organization_id=j.organization_id and id=p_task_run_id for update;
 select * into strict pt from public.capital_project_plan_tasks where organization_id=j.organization_id and id=tr.plan_task_id;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=j.organization_id and q.id=p_retained_payload_id and x.content_kind='s11_body';
 select * into b from private.capital_s11_body_bases where organization_id=j.organization_id and id=a.s11_body_basis_id;
 deadline:=private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id);
 if a.id is null or b.kind is distinct from(case when pt.task_id in('M01','M02','M03') then 'prelude' else 'derived' end) or b.recipe_id is distinct from r.id or b.task_id is distinct from pt.task_id or b.task_run_id is distinct from tr.id or deadline is null
 or not private.capital_body_physical_receipt_v1(j.organization_id,p_retained_payload_id)
 or not private.capital_body_retention_healthy_v1(a.policy_id,j.organization_id,a.id) then raise exception 'capital_s11_task_body_denied' using errcode='42501';end if;
 select * into old from private.capital_s11_task_projections where organization_id=j.organization_id and recipe_id=r.id and task_id=pt.task_id;
 if old.id is not null then
 if old.task_run_id<>tr.id or old.derived_retained_payload_id<>p_retained_payload_id or old.semantic_fingerprint<>b.semantic_fingerprint
 or not exists(select 1 from public.capital_project_artifacts c where c.organization_id=j.organization_id and c.id=old.capital_artifact_id and c.artifact_fingerprint=old.artifact_fingerprint and c.status not in('stale','superseded')) then raise exception 'capital_s11_task_replay_denied' using errcode='42501';end if;
 return private.capital_s11_task_projection_dto_v1(j.organization_id,r.id,tr.id,true);
 end if;
 if tr.status<>'running' then raise exception 'capital_s11_task_run_denied' using errcode='42501';end if;
 deps:='[]';
 foreach dep in array pt.dependencies loop
 select c.* into dep_art from public.capital_project_artifacts c
 join public.capital_project_task_runs dr on dr.organization_id=c.organization_id and dr.id=c.task_run_id
 join public.capital_project_plan_tasks dp on dp.organization_id=dr.organization_id and dp.id=dr.plan_task_id
 where c.organization_id=j.organization_id and c.capital_project_id=r.work_id and c.plan_id=r.plan_id and dp.task_id=dep
 and dr.processing_job_id in(r.job_id,j.id) and dr.status='succeeded' and c.status not in('stale','superseded')
 order by c.artifact_version desc limit 1;
 if dep_art.id is null then raise exception 'capital_s11_task_dependencies_incomplete' using errcode='42501';end if;
 if private.capital_s11_task_type_v1(dep) is not null and not exists(select 1 from private.capital_s11_task_projections x join private.capital_public_retained_payloads q on q.organization_id=x.organization_id and q.id=x.derived_retained_payload_id join private.capital_public_payload_allocations z on z.organization_id=q.organization_id and z.id=q.allocation_id where x.organization_id=j.organization_id and x.recipe_id=r.id and x.capital_artifact_id=dep_art.id and x.artifact_fingerprint=dep_art.artifact_fingerprint and private.capital_s11_allocation_deadline_v1(j.organization_id,z.id,j.authorization_subject_id) is not null and private.capital_body_physical_receipt_v1(j.organization_id,q.id)) then raise exception 'capital_s11_task_dependency_body_denied' using errcode='42501';end if;
 deps:=deps||jsonb_build_array(jsonb_build_object('artifactId',dep_art.id,'artifactFingerprint',dep_art.artifact_fingerprint));
 end loop;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-artifact:'||r.work_id::text||':'||private.capital_s11_task_type_v1(pt.task_id),0)) then raise exception 'capital_s11_task_retry' using errcode='40001';end if;
 select coalesce(max(artifact_version),0)+1 into v from public.capital_project_artifacts where organization_id=j.organization_id and capital_project_id=r.work_id and artifact_type=private.capital_s11_task_type_v1(pt.task_id);
 projection:=jsonb_build_object('schemaVersion','capital-s11-task-projection.v1','recipeId',r.id,'taskId',pt.task_id,'retainedPayloadId',p_retained_payload_id,
 'semanticFingerprint',b.semantic_fingerprint,'physicalSha256',a.payload_fingerprint,'byteLength',a.byte_length);
 fp:=encode(extensions.digest(projection::text,'sha256'),'hex');
 insert into private.capital_s11_task_projections(organization_id,work_id,recipe_id,task_id,task_run_id,capital_artifact_id,accepted_invocation_id,parsed_retained_payload_id,derived_retained_payload_id,semantic_fingerprint,artifact_fingerprint,artifact_version)
 values(j.organization_id,r.work_id,r.id,pt.task_id,tr.id,aid,b.accepted_invocation_id,case when pt.task_id in('M01','M02','M03') then null else b.parent_retained_payload_id end,p_retained_payload_id,b.semantic_fingerprint,fp,v);
 update public.capital_project_artifacts set status='superseded',superseded_at=stamp where organization_id=j.organization_id and capital_project_id=r.work_id and artifact_type=private.capital_s11_task_type_v1(pt.task_id) and status in('draft','pending_confirmation');
 insert into public.capital_project_artifacts(id,organization_id,capital_project_id,plan_id,task_run_id,artifact_type,schema_version,artifact_version,status,input_fingerprint,artifact_fingerprint,content,evidence_refs,dependencies,processing_job_id,created_by_kind)
 values(aid,j.organization_id,r.work_id,r.plan_id,tr.id,private.capital_s11_task_type_v1(pt.task_id),'capital-s11-task-projection.v1',v,'draft',tr.input_fingerprint,fp,projection,'[]',deps,tr.processing_job_id,'worker');
 update public.capital_project_task_runs set status='succeeded',completed_at=stamp,output_reference=jsonb_build_object('type','capital_project_artifact','id',aid),output_fingerprint=fp,
 quality_results=jsonb_build_array(jsonb_build_object('id','bounded_output','passed',true)),usage='{}',error=null where organization_id=j.organization_id and id=tr.id;
 if private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_task_denied' using errcode='42501';end if;
 return private.capital_s11_task_projection_dto_v1(j.organization_id,r.id,tr.id,false);
end; $$;

-- Prospective recipes close generic writers for every post-model product, including abstentions.
create function private.guard_capital_s11_task_projection_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare task text;recipe uuid;scope text;
begin
 if tg_table_name='capital_project_artifacts' then
 select pt.task_id,r.id,j.payload->>'analysis_scope' into task,recipe,scope from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id join public.processing_jobs j on j.organization_id=tr.organization_id and j.id=tr.processing_job_id left join private.capital_s11_recipes r on r.organization_id=tr.organization_id and r.job_id=tr.processing_job_id where tr.organization_id=new.organization_id and tr.id=new.task_run_id;
 recipe:=coalesce(recipe,(select x.recipe_id from private.capital_s11_task_projections x where x.organization_id=new.organization_id and x.task_run_id=new.task_run_id and x.capital_artifact_id=new.id));
 if scope='capital_planning' and private.capital_s11_task_type_v1(task) is not null and not exists(select 1 from private.capital_s11_task_projections x where x.organization_id=new.organization_id and x.recipe_id=recipe and x.task_run_id=new.task_run_id and x.capital_artifact_id=new.id and x.artifact_fingerprint=new.artifact_fingerprint and new.schema_version='capital-s11-task-projection.v1' and new.content=jsonb_build_object('schemaVersion','capital-s11-task-projection.v1','recipeId',x.recipe_id,'taskId',x.task_id,'retainedPayloadId',x.derived_retained_payload_id,'semanticFingerprint',x.semantic_fingerprint,'physicalSha256',(select a.payload_fingerprint from private.capital_public_retained_payloads q join private.capital_public_payload_allocations a on a.organization_id=q.organization_id and a.id=q.allocation_id where q.organization_id=x.organization_id and q.id=x.derived_retained_payload_id),'byteLength',(select a.byte_length from private.capital_public_retained_payloads q join private.capital_public_payload_allocations a on a.organization_id=q.organization_id and a.id=q.allocation_id where q.organization_id=x.organization_id and q.id=x.derived_retained_payload_id))) then raise exception 'capital_s11_native_task_projection_required' using errcode='42501';end if;
 elsif new.status='succeeded' then
 select pt.task_id,r.id,j.payload->>'analysis_scope' into task,recipe,scope from public.capital_project_plan_tasks pt join public.processing_jobs j on j.organization_id=pt.organization_id and j.id=new.processing_job_id left join private.capital_s11_recipes r on r.organization_id=pt.organization_id and r.plan_id=pt.plan_id and r.job_id=new.processing_job_id where pt.organization_id=new.organization_id and pt.id=new.plan_task_id;
 recipe:=coalesce(recipe,(select x.recipe_id from private.capital_s11_task_projections x where x.organization_id=new.organization_id and x.task_run_id=new.id));
 if scope='capital_planning' and private.capital_s11_task_type_v1(task) is not null and not exists(select 1 from private.capital_s11_task_projections x where x.organization_id=new.organization_id and x.recipe_id=recipe and x.task_run_id=new.id and new.output_reference=jsonb_build_object('type','capital_project_artifact','id',x.capital_artifact_id) and new.output_fingerprint=x.artifact_fingerprint and new.error is null and new.usage='{}'::jsonb and new.quality_results=jsonb_build_array(jsonb_build_object('id','bounded_output','passed',true))) then raise exception 'capital_s11_native_task_projection_required' using errcode='42501';end if;
 end if;
 return new;
end; $$;
create trigger capital_s11_tasks_guard before insert on public.capital_project_artifacts for each row execute function private.guard_capital_s11_task_projection_v1();
create trigger capital_s11_task_completion_guard before update of status,output_reference,output_fingerprint on public.capital_project_task_runs for each row execute function private.guard_capital_s11_task_projection_v1();
alter function private.project_legacy_artifact_revision_v1(text,uuid,uuid) rename to project_legacy_artifact_revision_pre_s11_task_v1;
create function private.project_legacy_artifact_revision_v1(p_table text,p_org uuid,p_row uuid) returns integer language plpgsql security definer set search_path='' as $$
begin
 if p_table='capital_project_artifacts' and exists(select 1 from private.capital_s11_task_projections x where x.organization_id=p_org and x.capital_artifact_id=p_row) then return 0;end if;
 return private.project_legacy_artifact_revision_pre_s11_task_v1(p_table,p_org,p_row);
end; $$;

create function private.worker_read_capital_s11_task_body_core_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_recovery boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_s11_recipes:=private.capital_s11_task_recipe_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_recovery);x private.capital_s11_task_projections;a private.capital_public_payload_allocations;d timestamptz;
begin
 select * into x from private.capital_s11_task_projections where organization_id=r.organization_id and recipe_id=r.id and task_run_id=p_task_run_id;
 select z.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations z on z.organization_id=q.organization_id and z.id=q.allocation_id where q.organization_id=r.organization_id and q.id=x.derived_retained_payload_id;
 d:=private.capital_s11_allocation_deadline_v1(r.organization_id,a.id,r.human_subject_id);
 if x.id is null or d is null or not private.capital_body_retention_healthy_v1(a.policy_id,r.organization_id,a.id) or not private.capital_body_physical_receipt_v1(r.organization_id,x.derived_retained_payload_id) or not exists(select 1 from public.capital_project_artifacts c where c.organization_id=r.organization_id and c.id=x.capital_artifact_id and c.status not in('stale','superseded') and c.artifact_fingerprint=x.artifact_fingerprint) then raise exception 'capital_s11_task_body_denied' using errcode='42501';end if;
 if not private.capital_public_capture_clock_current_v1(p_job_id,p_capability_token) or private.capital_s11_allocation_deadline_v1(r.organization_id,a.id,r.human_subject_id) is null then raise exception 'capital_s11_task_body_denied' using errcode='42501';end if;
 return private.capital_s11_body_dto_v1(r.organization_id,a.id,d,true);
end; $$;

-- A denied physical read is never interpreted as an absent task. This metadata
-- lookup returns absence only after the exact current recovery grant and real
-- published TaskSpec have been checked independently.
create function private.worker_load_capital_s11_recovered_projection_state_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_s11_recipes;
 g jsonb;x private.capital_s11_task_projections;b jsonb;
begin
 g:=private.worker_recover_capital_s11_result_v1(p_job_id,p_capability_token,p_recipe_id);
 if g->>'state' is null or g->>'state' not in('transform','commit','committed') or private.capital_s11_task_type_v1(p_task_id) is null then raise exception 'capital_s11_recovered_task_denied' using errcode='42501';end if;
 select * into r from private.capital_s11_recipes where organization_id=j.organization_id and id=p_recipe_id;
 if r.id is null or not exists(select 1 from public.capital_project_plan_tasks t where t.organization_id=j.organization_id and t.plan_id=r.plan_id and t.task_id=p_task_id) then raise exception 'capital_s11_recovered_task_denied' using errcode='42501';end if;
 select * into x from private.capital_s11_task_projections where organization_id=j.organization_id and recipe_id=r.id and task_id=p_task_id;
 if x.id is null then
  if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_recovered_task_denied' using errcode='42501';end if;
  return jsonb_build_object('schemaVersion','capital-s11-recovered-projection-state.v1','recipeId',r.id,'taskId',p_task_id,'state','absent','projection',null,'body',null);
 end if;
 b:=private.worker_read_capital_s11_task_body_core_v1(j.id,p_capability_token,r.id,x.task_run_id,true);
 return jsonb_build_object('schemaVersion','capital-s11-recovered-projection-state.v1','recipeId',r.id,'taskId',p_task_id,'state','present','projection',private.capital_s11_task_projection_dto_v1(j.organization_id,r.id,x.task_run_id,true),'body',b);
end; $$;
create function public.worker_load_capital_s11_recovered_projection_state_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_id text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_load_capital_s11_recovered_projection_state_v1(p_job_id,p_capability_token,p_recipe_id,p_task_id);$$;
revoke all on function private.worker_load_capital_s11_recovered_projection_state_v1(uuid,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.worker_load_capital_s11_recovered_projection_state_v1(uuid,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.worker_load_capital_s11_recovered_projection_state_v1(uuid,text,uuid,text) to authenticated;

create function private.worker_prepare_capital_s11_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_task_run_id uuid,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.worker_prepare_capital_s11_task_projection_core_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_task_run_id,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id,false); $$;
create function private.worker_commit_capital_s11_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_retained_payload_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.worker_commit_capital_s11_task_projection_core_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_retained_payload_id,false); $$;
create function private.worker_prepare_capital_s11_recovered_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_task_run_id uuid,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.worker_prepare_capital_s11_task_projection_core_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_task_run_id,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id,true); $$;
create function private.worker_commit_capital_s11_recovered_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_retained_payload_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.worker_commit_capital_s11_task_projection_core_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_retained_payload_id,true); $$;
create function public.worker_prepare_capital_s11_recovered_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_task_run_id uuid,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_s11_recovered_task_projection_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_task_run_id,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id); $$;
create function public.worker_commit_capital_s11_recovered_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_commit_capital_s11_recovered_task_projection_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_retained_payload_id); $$;
create function private.worker_read_capital_s11_task_body_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.worker_read_capital_s11_task_body_core_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,false); $$;
create function private.worker_read_capital_s11_recovered_task_body_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.worker_read_capital_s11_task_body_core_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,true); $$;
create function public.worker_read_capital_s11_recovered_task_body_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_read_capital_s11_recovered_task_body_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id); $$;
create function public.worker_prepare_capital_s11_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_task_run_id uuid,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_s11_task_projection_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_task_run_id,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id); $$;
create function public.worker_commit_capital_s11_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_commit_capital_s11_task_projection_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_retained_payload_id); $$;
create function public.worker_read_capital_s11_task_body_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_read_capital_s11_task_body_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id); $$;
do $$declare f record;begin
 for f in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and(p.proname in('capital_s11_task_type_v1','require_capital_s11_task_run_v1','capital_s11_task_recipe_v1','capital_s11_task_projection_dto_v1','guard_capital_s11_task_projection_v1','project_legacy_artifact_revision_pre_s11_task_v1','project_legacy_artifact_revision_v1') or p.proname in('worker_read_capital_s11_task_body_core_v1','worker_read_capital_s11_recovered_task_body_v1','worker_prepare_capital_s11_task_projection_core_v1','worker_commit_capital_s11_task_projection_core_v1','worker_prepare_capital_s11_recovered_task_projection_v1','worker_commit_capital_s11_recovered_task_projection_v1','worker_prepare_capital_s11_task_projection_v1','worker_commit_capital_s11_task_projection_v1','worker_read_capital_s11_task_body_v1')) loop
 execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',f.nspname,f.proname,f.args);
 if f.proname in('worker_read_capital_s11_recovered_task_body_v1','worker_prepare_capital_s11_recovered_task_projection_v1','worker_commit_capital_s11_recovered_task_projection_v1','worker_prepare_capital_s11_task_projection_v1','worker_commit_capital_s11_task_projection_v1','worker_read_capital_s11_task_body_v1') then execute format('grant execute on function %I.%I(%s) to authenticated',f.nspname,f.proname,f.args);end if;
 end loop;
end; $$;

-- Concatenate AFTER capital_s11_execution_ledger.sql. This is not independently deployable.
set search_path='';
create table private.capital_s11_native_bindings (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,
 recipe_id uuid not null,producer_task_run_id uuid not null,task_run_id uuid not null,accepted_invocation_id uuid not null,parsed_retained_payload_id uuid not null,final_retained_payload_id uuid not null,
 capital_artifact_id uuid not null,revision_id uuid not null,final_fingerprint text not null check(final_fingerprint~'^[a-f0-9]{64}$'),
 transformation_version text not null check(transformation_version='capital-planning-map.transform.v1'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,task_run_id),unique(organization_id,revision_id),unique(organization_id,capital_artifact_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_s11_recipes(organization_id,work_id,id),
 foreign key(organization_id,producer_task_run_id) references private.capital_s11_recipe_seals(organization_id,task_run_id),
 foreign key(organization_id,task_run_id) references public.capital_project_task_runs(organization_id,id),
 foreign key(organization_id,accepted_invocation_id) references private.capital_s11_accepted_invocations(organization_id,id),
 foreign key(organization_id,parsed_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,final_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,capital_artifact_id) references public.capital_project_artifacts(organization_id,id) deferrable initially deferred,
 foreign key(organization_id,revision_id) references public.artifact_revisions(organization_id,id) deferrable initially deferred
);
create index capital_s11_native_recipe_idx on private.capital_s11_native_bindings(organization_id,work_id,recipe_id);
create index capital_s11_native_accepted_idx on private.capital_s11_native_bindings(organization_id,accepted_invocation_id);
create index capital_s11_native_parsed_idx on private.capital_s11_native_bindings(organization_id,parsed_retained_payload_id);
create index capital_s11_native_final_idx on private.capital_s11_native_bindings(organization_id,final_retained_payload_id);
alter table private.capital_s11_native_bindings enable row level security;
alter table private.capital_s11_native_bindings force row level security;
revoke all on private.capital_s11_native_bindings from public,anon,authenticated,service_role;
create policy capital_s11_native_deny_select on private.capital_s11_native_bindings as restrictive for select to anon,authenticated using(false);
create policy capital_s11_native_deny_insert on private.capital_s11_native_bindings as restrictive for insert to anon,authenticated with check(false);
create policy capital_s11_native_deny_update on private.capital_s11_native_bindings as restrictive for update to anon,authenticated using(false) with check(false);
create policy capital_s11_native_deny_delete on private.capital_s11_native_bindings as restrictive for delete to anon,authenticated using(false);
create trigger capital_s11_native_immutable before update or delete on private.capital_s11_native_bindings for each row execute function private.reject_review_history_mutation_v1();
create trigger capital_s11_native_no_truncate before truncate on private.capital_s11_native_bindings for each statement execute function private.reject_review_history_mutation_v1();
create trigger capital_s11_native_updated_at before update on private.capital_s11_native_bindings for each row execute function private.set_updated_at();
create trigger capital_s11_native_audit after insert on private.capital_s11_native_bindings for each row execute function private.capture_identity_audit_v1();



-- Every native read, review and derived read resolves this actual binding,
-- current private work authority, full licensed source bridge and physical body.
create function private.capital_s11_native_read_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare b private.capital_s11_native_bindings;a private.capital_public_payload_allocations;d timestamptz;r public.artifact_revisions;
 projection record;projection_deadline timestamptz;projection_count integer:=0;recipe_bound timestamptz;
begin
 select * into b from private.capital_s11_native_bindings where organization_id=p_org and revision_id=p_revision;
 if b.id is null then return true;end if;
 if not private.capital_body_subject_allowed_v1(p_org,b.work_id,p_actor) then return false;end if;
 select * into r from public.artifact_revisions where organization_id=p_org and id=p_revision;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=p_org and q.id=b.final_retained_payload_id;
 recipe_bound:=private.capital_s11_recipe_deadline_v1(p_org,b.recipe_id,p_actor);
 if recipe_bound is null then return false;end if;
 d:=private.capital_s11_physical_allocation_bound_v1(p_org,a.id,b.recipe_id);
 if d is null then return false;end if;
 d:=least(recipe_bound,d);
 if r.id is null or a.id is null or d is null or not exists(select 1 from public.capital_project_artifacts c where c.organization_id=p_org and c.id=b.capital_artifact_id and c.status not in ('stale','superseded'))
 or r.content_sha256 is distinct from a.payload_fingerprint or r.byte_length is distinct from a.byte_length
 or not private.capital_body_physical_receipt_v1(p_org,b.final_retained_payload_id)
 or not private.capital_body_physical_receipt_v1(p_org,b.parsed_retained_payload_id)
 or not private.capital_body_retention_healthy_v1(a.policy_id,p_org,a.id) then return false;end if;
 -- Every intermediate TaskSpec body is a finite physical dependency of this
 -- final map. A surviving final blob cannot outlive a purged C11/S10 or prelude.
 for projection in select p.*,x.id allocation_id,x.purge_at,tr.status task_status,tr.output_fingerprint,
  c.artifact_fingerprint current_fingerprint,c.status artifact_status
 from private.capital_s11_task_projections p
 join private.capital_public_retained_payloads q on q.organization_id=p.organization_id and q.id=p.derived_retained_payload_id
 join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id
 join public.capital_project_task_runs tr on tr.organization_id=p.organization_id and tr.id=p.task_run_id
 join public.capital_project_artifacts c on c.organization_id=p.organization_id and c.id=p.capital_artifact_id
 where p.organization_id=p_org and p.recipe_id=b.recipe_id loop
  projection_count:=projection_count+1;
  projection_deadline:=private.capital_s11_physical_allocation_bound_v1(p_org,projection.allocation_id,b.recipe_id);
  if projection_deadline is null or projection.task_status is distinct from 'succeeded'
   or projection.output_fingerprint is distinct from projection.artifact_fingerprint
   or projection.current_fingerprint is distinct from projection.artifact_fingerprint
   or projection.artifact_status in('stale','superseded')
   or not private.capital_body_physical_receipt_v1(p_org,projection.derived_retained_payload_id) then return false;end if;
  d:=least(d,projection_deadline,projection.purge_at);
 end loop;
 if projection_count<>34 then return false;end if;
 return least(d,a.purge_at)>clock_timestamp();
end; $$;

create function private.read_capital_s11_result_v1(p_revision_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare b private.capital_s11_native_bindings;a private.capital_public_payload_allocations;d timestamptz;result jsonb;r public.artifact_revisions;
begin
 select * into b from private.capital_s11_native_bindings where revision_id=p_revision_id;
 select * into r from public.artifact_revisions where id=p_revision_id;
 if b.id is null or r.id is null or private.artifact_revision_release_v1(r)='blocked' or not private.capital_s11_native_read_allowed_v1(b.organization_id,b.revision_id,auth.uid()) then raise exception 'capital_s11_read_denied' using errcode='42501';end if;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=b.organization_id and q.id=b.final_retained_payload_id;
 d:=private.capital_s11_allocation_deadline_v1(b.organization_id,a.id,auth.uid());
 result:=jsonb_build_object('schemaVersion','capital-s11-read-scope.v1','revisionId',b.revision_id,'recipeId',b.recipe_id,'finalFingerprint',b.final_fingerprint,'retention',private.capital_s11_body_dto_v1(b.organization_id,a.id,d,true));
 if private.artifact_revision_release_v1(r)='blocked' or not private.capital_s11_native_read_allowed_v1(b.organization_id,b.revision_id,auth.uid()) then raise exception 'capital_s11_read_denied' using errcode='42501';end if;
 return result;
end; $$;

-- Close the historical S11 writer by actual TaskSpec, not a caller-selected
-- content schema. Its other task families keep the original function unchanged.
alter function private.worker_record_capital_project_artifact(uuid,text,uuid,text,text,text,text,jsonb,jsonb,jsonb) rename to worker_record_capital_project_artifact_pre_s11;
create function private.worker_record_capital_project_artifact(p_job_id uuid,p_capability_token text,p_task_run_id uuid,p_artifact_type text,
 p_schema_version text,p_status text,p_input_fingerprint text,p_content jsonb,p_evidence_refs jsonb default '[]',p_dependencies jsonb default '[]')
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);
begin
 if (p_artifact_type='alternative_map' and j.payload->>'analysis_scope'='capital_planning') or exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id where tr.organization_id=j.organization_id and tr.id=p_task_run_id and pt.task_id='S11') then raise exception 'capital_s11_native_commit_required' using errcode='42501';end if;
 return private.worker_record_capital_project_artifact_pre_s11(p_job_id,p_capability_token,p_task_run_id,p_artifact_type,p_schema_version,p_status,p_input_fingerprint,p_content,p_evidence_refs,p_dependencies);
end; $$;
revoke all on function private.worker_record_capital_project_artifact_pre_s11(uuid,text,uuid,text,text,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

alter function private.worker_finish_capital_project_task(uuid,text,uuid,text,jsonb,text,jsonb,jsonb,jsonb) rename to worker_finish_capital_project_task_pre_s11;
create function private.worker_finish_capital_project_task(p_job_id uuid,p_capability_token text,p_task_run_id uuid,p_status text,
 p_output_reference jsonb default null,p_output_fingerprint text default null,p_quality_results jsonb default '[]',p_usage jsonb default '{}',p_error jsonb default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);
begin
 if p_status='failed' and exists(select 1 from private.capital_s11_recipe_seals z where z.organization_id=j.organization_id and z.task_run_id=p_task_run_id) then raise exception 'capital_s11_native_quality_required' using errcode='42501';end if;
 if p_status='succeeded' and exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id where tr.organization_id=j.organization_id and tr.id=p_task_run_id and pt.task_id='S11') then raise exception 'capital_s11_native_commit_required' using errcode='42501';end if;
 return private.worker_finish_capital_project_task_pre_s11(p_job_id,p_capability_token,p_task_run_id,p_status,p_output_reference,p_output_fingerprint,p_quality_results,p_usage,p_error);
end; $$;
revoke all on function private.worker_finish_capital_project_task_pre_s11(uuid,text,uuid,text,jsonb,text,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

alter function private.project_legacy_artifact_revision_v1(text,uuid,uuid) rename to project_legacy_artifact_revision_pre_s11_v1;
create function private.project_legacy_artifact_revision_v1(p_table text,p_org uuid,p_row uuid)
returns integer language plpgsql security definer set search_path='' as $$
begin
 if p_table='capital_project_artifacts' and exists(select 1 from private.capital_s11_native_bindings b where b.organization_id=p_org and b.capital_artifact_id=p_row) then return 0;end if;
 return private.project_legacy_artifact_revision_pre_s11_v1(p_table,p_org,p_row);
end; $$;
revoke all on function private.project_legacy_artifact_revision_pre_s11_v1(text,uuid,uuid) from public,anon,authenticated,service_role;

-- Pre-accepted terminal execution failures cite only real server ledger rows.
create table private.capital_s11_execution_failures (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,
 recipe_id uuid not null,task_run_id uuid not null,reason text not null check(reason in ('model_attempts_exhausted','processing_denied','budget_denied','accepted_body_unavailable')),
 outcome_ids uuid[] not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,task_run_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_s11_recipes(organization_id,work_id,id),
 foreign key(organization_id,task_run_id) references private.capital_s11_recipe_seals(organization_id,task_run_id)
);
create index capital_s11_execution_failure_work_idx on private.capital_s11_execution_failures(organization_id,work_id,recipe_id);
alter table private.capital_s11_execution_failures enable row level security;
alter table private.capital_s11_execution_failures force row level security;
revoke all on private.capital_s11_execution_failures from public,anon,authenticated,service_role;
create trigger capital_s11_execution_failure_immutable before update or delete on private.capital_s11_execution_failures for each row execute function private.reject_review_history_mutation_v1();
create trigger capital_s11_execution_failure_no_truncate before truncate on private.capital_s11_execution_failures for each statement execute function private.reject_review_history_mutation_v1();
create function private.worker_record_capital_s11_execution_failure_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_reason text,p_outcome_ids uuid[] default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_s11_recipes:=private.require_capital_s11_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 seal private.capital_s11_recipe_seals;old private.capital_s11_execution_failures;actual uuid[];supplied uuid[];tr public.capital_project_task_runs;replayed boolean:=false;op private.capital_s11_operations;exposure numeric;dispatches integer;server_bound bigint;
begin
 if p_reason is null or p_reason not in ('model_attempts_exhausted','processing_denied','budget_denied','accepted_body_unavailable') or array_position(p_outcome_ids,null) is not null then raise exception 'capital_s11_execution_failure_invalid' using errcode='22023';end if;
 if (p_reason<>'accepted_body_unavailable' and(exists(select 1 from private.capital_s11_accepted_invocations where organization_id=r.organization_id and recipe_id=r.id)
 or exists(select 1 from private.capital_s11_attempt_outcomes o join private.capital_s11_gateway_attempts a on a.organization_id=o.organization_id and a.id=o.attempt_id where a.organization_id=r.organization_id and a.recipe_id=r.id and o.outcome='accepted')))
 or exists(select 1 from private.capital_s11_native_bindings where organization_id=r.organization_id and recipe_id=r.id)
 or exists(select 1 from private.capital_s11_quality_failures where organization_id=r.organization_id and recipe_id=r.id) then raise exception 'capital_s11_execution_failure_proof_denied' using errcode='42501';end if;
 select coalesce(array_agg(o.id order by o.id),'{}'::uuid[]) into actual from private.capital_s11_attempt_outcomes o join private.capital_s11_gateway_attempts a on a.organization_id=o.organization_id and a.id=o.attempt_id where a.organization_id=r.organization_id and a.recipe_id=r.id;
 if p_outcome_ids is null then supplied:=actual;else select coalesce(array_agg(v order by v),'{}'::uuid[]) into supplied from unnest(p_outcome_ids) v;end if;
 if actual is distinct from supplied or(p_reason='model_attempts_exhausted' and(cardinality(actual)=0 or not exists(select 1 from private.capital_s11_gateway_attempts a join private.capital_s11_attempt_outcomes o on o.organization_id=a.organization_id and o.attempt_id=a.id where a.organization_id=r.organization_id and a.recipe_id=r.id and a.used_provider_fallback and o.outcome<>'accepted')))
 or(p_reason='processing_denied' and(cardinality(actual)<>0 or not exists(select 1 from private.capital_s11_gateway_attempts a where a.organization_id=r.organization_id and a.recipe_id=r.id and not a.allowed and not a.used_provider_fallback) or not exists(select 1 from private.capital_s11_gateway_attempts a where a.organization_id=r.organization_id and a.recipe_id=r.id and not a.allowed and a.used_provider_fallback))) then raise exception 'capital_s11_execution_failure_proof_denied' using errcode='42501';end if;
 if p_reason='accepted_body_unavailable' and(not exists(select 1 from private.capital_s11_accepted_invocations where organization_id=r.organization_id and recipe_id=r.id)
 or exists(select 1 from private.capital_s11_body_bases b join private.capital_public_payload_allocations a on a.organization_id=b.organization_id and a.s11_body_basis_id=b.id join private.capital_public_retained_payloads q on q.organization_id=a.organization_id and q.allocation_id=a.id where b.organization_id=r.organization_id and b.recipe_id=r.id and b.kind='parsed' and private.capital_body_physical_receipt_v1(q.organization_id,q.id))) then raise exception 'capital_s11_execution_failure_proof_denied' using errcode='42501';end if;
 if p_reason='budget_denied' then
 select * into op from private.capital_s11_operations where organization_id=r.organization_id and recipe_id=r.id;
 select count(*),coalesce(sum(greatest(d.server_reservation_micro_usd,coalesce(o.cost_micro_usd,d.server_reservation_micro_usd))),0) into dispatches,exposure from private.capital_s11_input_dispatches d left join private.capital_s11_attempt_outcomes o on o.organization_id=d.organization_id and o.input_receipt_id=d.id where d.organization_id=r.organization_id and d.operation_id=op.id;
 select case when dispatches=0 then least((private.capital_s11_dispatch_policy_v1('claude-sonnet-5',100000)->>'serverBoundMicroUsd')::bigint,(private.capital_s11_dispatch_policy_v1('gpt-5.6-terra',100000)->>'serverBoundMicroUsd')::bigint) else(private.capital_s11_dispatch_policy_v1('gpt-5.6-terra',100000)->>'serverBoundMicroUsd')::bigint end into server_bound;
 if not exists(select 1 from private.capital_s11_recipe_seals z where z.organization_id=r.organization_id and z.recipe_id=r.id and(dispatches>=z.effective_max_dispatches or exposure+server_bound>z.effective_budget_micro_usd)) then raise exception 'capital_s11_execution_failure_proof_denied' using errcode='42501';end if;
 end if;
 select * into strict seal from private.capital_s11_recipe_seals where organization_id=r.organization_id and recipe_id=r.id;
 select * into old from private.capital_s11_execution_failures where organization_id=r.organization_id and recipe_id=r.id;
 if old.id is not null then
 if (old.reason,old.outcome_ids) is distinct from(p_reason,supplied) then raise exception 'capital_s11_execution_failure_conflict' using errcode='23505';end if;
 replayed:=true;
 else
 select * into tr from public.capital_project_task_runs where organization_id=r.organization_id and id=seal.task_run_id for update;
 if tr.status is distinct from 'running' then raise exception 'capital_s11_execution_failure_task_denied' using errcode='42501';end if;
 insert into private.capital_s11_execution_failures(organization_id,work_id,recipe_id,task_run_id,reason,outcome_ids) values(r.organization_id,r.work_id,r.id,seal.task_run_id,p_reason,supplied) returning * into old;
 update public.capital_project_task_runs set status='failed',completed_at=clock_timestamp(),quality_results='[]',error=jsonb_build_object('code','capital_s11_execution_failed','reason',p_reason),usage='{}',output_reference=null,output_fingerprint=null where organization_id=r.organization_id and id=tr.id;
 end if;
 perform private.require_capital_s11_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 return jsonb_build_object('schemaVersion','capital-s11-execution-failure-receipt.v1','recipeId',r.id,'taskRunId',seal.task_run_id,'reason',old.reason,'outcomeIds',to_jsonb(old.outcome_ids),'replayed',replayed);
end; $$;

-- Terminal quality failures are native history, never a reusable execution grant.
create table private.capital_s11_quality_failures (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,
 recipe_id uuid not null,task_run_id uuid not null,accepted_invocation_id uuid not null,
 parsed_retained_payload_id uuid not null,final_retained_payload_id uuid not null,
 final_fingerprint text not null check(final_fingerprint~'^[a-f0-9]{64}$'),quality_results jsonb not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,task_run_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_s11_recipes(organization_id,work_id,id),
 foreign key(organization_id,task_run_id) references private.capital_s11_recipe_seals(organization_id,task_run_id),
 foreign key(organization_id,accepted_invocation_id) references private.capital_s11_accepted_invocations(organization_id,id),
 foreign key(organization_id,parsed_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,final_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id)
);
create index capital_s11_quality_work_recipe_idx on private.capital_s11_quality_failures(organization_id,work_id,recipe_id);
create index capital_s11_quality_accepted_idx on private.capital_s11_quality_failures(organization_id,accepted_invocation_id);
create index capital_s11_quality_parsed_idx on private.capital_s11_quality_failures(organization_id,parsed_retained_payload_id);
create index capital_s11_quality_final_idx on private.capital_s11_quality_failures(organization_id,final_retained_payload_id);
alter table private.capital_s11_quality_failures enable row level security;
alter table private.capital_s11_quality_failures force row level security;
revoke all on private.capital_s11_quality_failures from public,anon,authenticated,service_role;
create trigger capital_s11_quality_immutable before update or delete on private.capital_s11_quality_failures for each row execute function private.reject_review_history_mutation_v1();
create trigger capital_s11_quality_no_truncate before truncate on private.capital_s11_quality_failures for each statement execute function private.reject_review_history_mutation_v1();

create function private.capital_s11_quality_failure_dto_v1(p_org uuid,p_recipe uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion','capital-s11-quality-failure.v1','acceptedInvocationId',q.accepted_invocation_id,
 'parsedRetainedPayloadId',q.parsed_retained_payload_id,'finalRetainedPayloadId',q.final_retained_payload_id,'finalFingerprint',q.final_fingerprint,'qualityResults',q.quality_results)
 from private.capital_s11_quality_failures q where q.organization_id=p_org and q.recipe_id=p_recipe;
$$;

create function private.worker_record_capital_s11_quality_failure_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,
 p_accepted_invocation_id uuid,p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_s11_recipes:=private.require_capital_s11_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 seal private.capital_s11_recipe_seals;old private.capital_s11_quality_failures;ok private.capital_s11_accepted_invocations;
 pb private.capital_s11_body_bases;fb private.capital_s11_body_bases;pa private.capital_public_payload_allocations;fa private.capital_public_payload_allocations;tr public.capital_project_task_runs;
begin
 if jsonb_typeof(p_quality_results) is distinct from 'array' or jsonb_array_length(p_quality_results)<>4
 or exists(select 1 from jsonb_array_elements(p_quality_results) q where jsonb_typeof(q) is distinct from 'object' or not(q?&array['id','passed']) or q-array['id','passed']<>'{}' or jsonb_typeof(q->'passed') is distinct from 'boolean')
 or not exists(select 1 from jsonb_array_elements(p_quality_results) q where q->'passed'='false'::jsonb)
 or exists(select 1 from unnest(array['schema_valid','citations_allowed','recommendation_consistent','no_invented_terms']) k where(select count(*) from jsonb_array_elements(p_quality_results) q where q->>'id'=k)<>1)
 then raise exception 'capital_s11_quality_failure_invalid' using errcode='22023';end if;
 select * into strict seal from private.capital_s11_recipe_seals where organization_id=r.organization_id and recipe_id=r.id;
 select * into ok from private.capital_s11_accepted_invocations where organization_id=r.organization_id and recipe_id=r.id and id=p_accepted_invocation_id;
 select x.* into pa from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=r.organization_id and q.id=p_parsed_retained_payload_id and x.content_kind='s11_body';
 select x.* into fa from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=r.organization_id and q.id=p_final_retained_payload_id and x.content_kind='s11_body';
 select * into pb from private.capital_s11_body_bases where organization_id=r.organization_id and id=pa.s11_body_basis_id;
 select * into fb from private.capital_s11_body_bases where organization_id=r.organization_id and id=fa.s11_body_basis_id;
 if ok.id is null or pb.kind is distinct from 'parsed' or fb.kind is distinct from 'final' or pb.recipe_id is distinct from r.id or fb.recipe_id is distinct from r.id
 or pb.accepted_invocation_id is distinct from ok.id or fb.accepted_invocation_id is distinct from ok.id or fb.parent_retained_payload_id is distinct from p_parsed_retained_payload_id
 or pb.semantic_fingerprint is distinct from ok.output_fingerprint or fb.semantic_fingerprint is distinct from p_final_fingerprint
 or not private.capital_body_physical_receipt_v1(r.organization_id,p_parsed_retained_payload_id) or not private.capital_body_physical_receipt_v1(r.organization_id,p_final_retained_payload_id)
 or private.capital_s11_allocation_deadline_v1(r.organization_id,pa.id,r.human_subject_id) is null or private.capital_s11_allocation_deadline_v1(r.organization_id,fa.id,r.human_subject_id) is null
 then raise exception 'capital_s11_quality_failure_proof_denied' using errcode='42501';end if;
 select * into old from private.capital_s11_quality_failures where organization_id=r.organization_id and recipe_id=r.id;
 if old.id is not null then
 if (old.accepted_invocation_id,old.parsed_retained_payload_id,old.final_retained_payload_id,old.final_fingerprint,old.quality_results) is distinct from(p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results) then raise exception 'capital_s11_quality_failure_conflict' using errcode='23505';end if;
 return jsonb_build_object('schemaVersion','capital-s11-quality-failure-receipt.v1','recipeId',r.id,'taskRunId',seal.task_run_id,'qualityFailure',private.capital_s11_quality_failure_dto_v1(r.organization_id,r.id),'replayed',true);
 end if;
 select * into tr from public.capital_project_task_runs where organization_id=r.organization_id and id=seal.task_run_id for update;
 if tr.status is distinct from 'running' or exists(select 1 from private.capital_s11_native_bindings where organization_id=r.organization_id and recipe_id=r.id) then raise exception 'capital_s11_quality_failure_task_denied' using errcode='42501';end if;
 insert into private.capital_s11_quality_failures(organization_id,work_id,recipe_id,task_run_id,accepted_invocation_id,parsed_retained_payload_id,final_retained_payload_id,final_fingerprint,quality_results)
 values(r.organization_id,r.work_id,r.id,seal.task_run_id,ok.id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results);
 update public.capital_project_task_runs set status='failed',completed_at=clock_timestamp(),quality_results=p_quality_results,error=jsonb_build_object('code','capital_s11_quality_failed'),usage='{}',output_reference=null,output_fingerprint=null where organization_id=r.organization_id and id=tr.id;
 perform private.require_capital_s11_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 return jsonb_build_object('schemaVersion','capital-s11-quality-failure-receipt.v1','recipeId',r.id,'taskRunId',seal.task_run_id,'qualityFailure',private.capital_s11_quality_failure_dto_v1(r.organization_id,r.id),'replayed',false);
end; $$;

-- Explicit API denial policies and metadata-only audit match the stage contract.
do $$declare t text;op text;begin
 foreach t in array array['capital_s11_quality_failures','capital_s11_execution_failures'] loop
 foreach op in array array['select','insert','update','delete'] loop
 execute format('create policy %I on private.%I as restrictive for %s to anon,authenticated %s',t||'_deny_'||op,t,op,case when op='insert' then 'with check(false)' when op='update' then 'using(false) with check(false)' else 'using(false)' end);
 end loop;
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated_at',t);
 execute format('create trigger %I after insert on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 end loop;
end;$$;

create function private.capital_s11_commit_result_core_v1(p_org uuid,p_recipe uuid,p_accepted uuid,p_parsed uuid,p_final uuid,p_final_fingerprint text,p_quality_results jsonb,p_job uuid,p_capability text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_s11_recipes;s private.capital_s11_recipe_seals;b private.capital_s11_native_bindings;ok private.capital_s11_accepted_invocations;
 parsed private.capital_public_payload_allocations;final private.capital_public_payload_allocations;pb private.capital_s11_body_bases;fb private.capital_s11_body_bases;
 tr public.capital_project_task_runs;a public.artifacts;head public.artifact_revisions;manifest jsonb;projection jsonb;fp text;
 rid uuid:=gen_random_uuid();aid uuid:=gen_random_uuid();version integer;deps jsonb;receipt uuid;ref jsonb;stamp timestamptz:=clock_timestamp();deadline timestamptz;final_run uuid;authorized_job public.processing_jobs;
begin
 authorized_job:=private.capital_public_capture_job_v1(p_job,p_capability);
 if authorized_job.organization_id is distinct from p_org then raise exception 'capital_s11_task_denied' using errcode='42501';end if;
 if jsonb_typeof(p_quality_results) is distinct from 'array' or jsonb_array_length(p_quality_results)<>4
 or exists(select 1 from jsonb_array_elements(p_quality_results) q where jsonb_typeof(q) is distinct from 'object' or not(q?&array['id','passed']) or q-array['id','passed']<>'{}' or q->'passed' is distinct from 'true'::jsonb)
 or exists(select 1 from unnest(array['schema_valid','citations_allowed','recommendation_consistent','no_invented_terms']) k where(select count(*) from jsonb_array_elements(p_quality_results) q where q->>'id'=k)<>1) then raise exception 'capital_s11_quality_denied' using errcode='42501';end if;
 select * into strict r from private.capital_s11_recipes where organization_id=p_org and id=p_recipe;
 select * into strict s from private.capital_s11_recipe_seals where organization_id=p_org and recipe_id=r.id;
 if exists(select 1 from private.capital_s11_quality_failures where organization_id=p_org and recipe_id=r.id) or exists(select 1 from private.capital_s11_execution_failures where organization_id=p_org and recipe_id=r.id) then raise exception 'capital_s11_quality_failed_terminal' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-s11-recipe:'||p_org::text||':'||r.id::text,0)) then raise exception 'capital_s11_retry' using errcode='40001';end if;
 select * into ok from private.capital_s11_accepted_invocations where organization_id=p_org and recipe_id=r.id and id=p_accepted;
 select x.* into parsed from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=p_org and q.id=p_parsed and x.content_kind='s11_body';
 select x.* into final from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=p_org and q.id=p_final and x.content_kind='s11_body';
 select * into pb from private.capital_s11_body_bases where organization_id=p_org and id=parsed.s11_body_basis_id;
 select * into fb from private.capital_s11_body_bases where organization_id=p_org and id=final.s11_body_basis_id;
 if ok.id is null or pb.kind is distinct from 'parsed' or fb.kind is distinct from 'final' or pb.recipe_id<>r.id or fb.recipe_id<>r.id
 or pb.accepted_invocation_id<>ok.id or fb.accepted_invocation_id<>ok.id or fb.parent_retained_payload_id is distinct from p_parsed
 or pb.semantic_fingerprint<>ok.output_fingerprint or fb.semantic_fingerprint is distinct from p_final_fingerprint
 or not private.capital_body_physical_receipt_v1(p_org,p_parsed) or not private.capital_body_physical_receipt_v1(p_org,p_final) then raise exception 'capital_s11_commit_proof_denied' using errcode='42501';end if;
 deadline:=private.capital_s11_recipe_deadline_v1(p_org,r.id,r.human_subject_id);
 if deadline is null or least(deadline,parsed.purge_at,final.purge_at)<=clock_timestamp() or not private.capital_body_retention_healthy_v1(final.policy_id,p_org,final.id) then raise exception 'capital_s11_retention_denied' using errcode='42501';end if;
 select * into b from private.capital_s11_native_bindings where organization_id=p_org and recipe_id=r.id;
 if b.id is not null then
 if b.accepted_invocation_id<>p_accepted or b.parsed_retained_payload_id<>p_parsed or b.final_retained_payload_id<>p_final or b.final_fingerprint<>p_final_fingerprint then raise exception 'capital_s11_commit_conflict' using errcode='23505';end if;
 return jsonb_build_object('schemaVersion','capital-s11-commit-receipt.v1','recipeId',r.id,'producerTaskRunId',s.task_run_id,'taskRunId',b.task_run_id,'capitalArtifactId',b.capital_artifact_id,'revisionId',b.revision_id,'finalFingerprint',b.final_fingerprint,'artifactFingerprint',(select artifact_fingerprint from public.capital_project_artifacts where organization_id=p_org and id=b.capital_artifact_id),'artifactVersion',(select artifact_version from public.capital_project_artifacts where organization_id=p_org and id=b.capital_artifact_id),'replayed',true);
 end if;
 -- The paid response belongs to producer M04. It must already have an exact
 -- physical derived bridge; S11 starts only after its published predecessors.
 select * into tr from public.capital_project_task_runs where organization_id=p_org and id=s.task_run_id for update;
 if tr.status<>'succeeded' or tr.processing_job_id<>r.job_id or tr.input_fingerprint<>s.reconstruction_fingerprint or tr.plan_id<>r.plan_id
 or not exists(select 1 from private.capital_s11_task_projections d where d.organization_id=p_org and d.recipe_id=r.id and d.task_run_id=s.task_run_id and d.accepted_invocation_id=ok.id and d.parsed_retained_payload_id=p_parsed)
 then raise exception 'capital_s11_producer_not_committed' using errcode='42501';end if;
 if (authorized_job.payload->>'capital_project_plan_id',authorized_job.payload->>'capital_project_brief_id') is distinct from (r.plan_id::text,r.brief_id::text) then raise exception 'capital_s11_task_denied' using errcode='42501';end if;
 -- Existing server command checks the exact capability and all plan dependency
 -- statuses. This does not replace or reorder C11/S10 to accommodate the model.
 final_run:=private.worker_start_capital_project_task(p_job,p_capability,'S11','offroad.capital_planning','2026.09.24-v2',s.reconstruction_fingerprint,
 jsonb_build_object('schemaVersion','capital-s11-final-task-context.v1','recipeId',r.id,'producerTaskRunId',s.task_run_id,'acceptedInvocationId',ok.id));
 select * into tr from public.capital_project_task_runs where organization_id=p_org and id=final_run for update;
 if tr.status<>'running' or tr.processing_job_id<>p_job or tr.plan_id<>r.plan_id then raise exception 'capital_s11_task_denied' using errcode='42501';end if;
 if exists(select 1 from public.capital_project_plan_tasks pt cross join lateral unnest(pt.dependencies) needed(task_id)
 where pt.organization_id=p_org and pt.plan_id=r.plan_id and pt.task_id='S11' and not exists(
 select 1 from public.capital_project_plan_tasks dep join public.capital_project_task_runs rt on rt.organization_id=dep.organization_id and rt.plan_task_id=dep.id and rt.status='succeeded'
 join public.capital_project_artifacts ca on ca.organization_id=rt.organization_id and ca.task_run_id=rt.id and ca.status not in('stale','superseded')
 left join private.capital_s11_task_projections bridge on bridge.organization_id=ca.organization_id and bridge.capital_artifact_id=ca.id
 where dep.organization_id=p_org and dep.plan_id=r.plan_id and dep.task_id=needed.task_id
 and ((r.revision_decision_id is null and bridge.recipe_id=r.id and bridge.accepted_invocation_id=ok.id and private.capital_body_physical_receipt_v1(p_org,bridge.derived_retained_payload_id))
 or(r.revision_decision_id is not null and exists(select 1 from private.capital_s11_recipe_components rc where rc.organization_id=p_org and rc.recipe_id=r.id and rc.slot='dependency' and rc.dependency_artifact_id=ca.id and rc.version=ca.artifact_version)))))
 then raise exception 'capital_s11_final_dependencies_denied' using errcode='42501';end if;
 if exists(select 1 from private.capital_s11_recipe_components c join public.capital_project_artifacts d on d.organization_id=c.organization_id and d.id=c.dependency_artifact_id where c.organization_id=p_org and c.recipe_id=r.id and c.slot='dependency' and(d.status in ('stale','superseded') or d.artifact_version<>c.version)) then raise exception 'capital_s11_dependency_denied' using errcode='42501';end if;
 -- Both writers serialize the same plan/work identity. A reviewed current product
 -- can only be replaced after the existing explicit invalidation command.
 perform 1 from public.capital_project_plans where organization_id=p_org and id=r.plan_id for update;
 if exists(select 1 from public.capital_project_artifacts where organization_id=p_org and capital_project_id=r.work_id and artifact_type='alternative_map' and status in ('confirmed','approved')) then raise exception 'capital_artifact_confirmed_requires_invalidation' using errcode='42501';end if;
 select coalesce(max(artifact_version),0)+1 into version from public.capital_project_artifacts where organization_id=p_org and capital_project_id=r.work_id and artifact_type='alternative_map';
 select * into a from public.artifacts where organization_id=p_org and work_id=r.work_id and kind='work_product' and subject='S11 alternative map' for update;
 if a.id is null then insert into public.artifacts(organization_id,work_id,kind,subject) values(p_org,r.work_id,'work_product','S11 alternative map') returning * into a;end if;
 select * into head from public.artifact_revisions where organization_id=p_org and id=a.head_revision_id;
 manifest:=jsonb_build_object('schemaVersion','artifact-manifest.2026.09.26-v1','kind','work_product','audience','internal','format','json',
 'bytes',jsonb_build_object('sha256',final.payload_fingerprint,'byteLength',final.byte_length,'storage',jsonb_build_object('bucket',final.bucket_id,'path',final.object_path)),
 'method',null,'execution',null,'inputSnapshot',jsonb_build_object('fingerprint',s.reconstruction_fingerprint),'institutionalResult',null,
 'sources','[]'::jsonb,'claims','[]'::jsonb,'traces',jsonb_build_array('capital-s11-recipe:'||r.id::text,'capital-s11-accepted:'||ok.id::text),
 'template',null,'provenance',jsonb_build_object('producer','capital-s11-native-producer.v1','jobId',r.job_id,'taskRunId',final_run,'messageId',null,'capability',null),'legacy',null);
 perform private.validate_artifact_manifest_v1(manifest);
 projection:=jsonb_build_object('schemaVersion','capital-s11-projection.v1','revisionId',rid,'recipeId',r.id,'finalFingerprint',p_final_fingerprint,'physicalSha256',final.payload_fingerprint,'byteLength',final.byte_length);
 fp:=encode(extensions.digest(projection::text,'sha256'),'hex');
 select coalesce(jsonb_agg(jsonb_build_object('artifactId',dependency_artifact_id,'artifactFingerprint',d.artifact_fingerprint) order by c.component_no),'[]') into deps from private.capital_s11_recipe_components c join public.capital_project_artifacts d on d.organization_id=c.organization_id and d.id=c.dependency_artifact_id where c.organization_id=p_org and c.recipe_id=r.id and c.slot='dependency';
 -- Deferred exact FKs allow the trigger to see real native authority, never a
 -- caller-controlled schema marker, before inserting CPA and revision.
 insert into private.capital_s11_native_bindings(organization_id,work_id,recipe_id,producer_task_run_id,task_run_id,accepted_invocation_id,parsed_retained_payload_id,final_retained_payload_id,capital_artifact_id,revision_id,final_fingerprint,transformation_version)
 values(p_org,r.work_id,r.id,s.task_run_id,final_run,ok.id,p_parsed,p_final,aid,rid,p_final_fingerprint,'capital-planning-map.transform.v1') returning * into b;
 update public.capital_project_artifacts set status='superseded',superseded_at=stamp where organization_id=p_org and capital_project_id=r.work_id and artifact_type='alternative_map' and status in ('draft','pending_confirmation');
 insert into public.capital_project_artifacts(id,organization_id,capital_project_id,plan_id,task_run_id,artifact_type,schema_version,artifact_version,status,input_fingerprint,artifact_fingerprint,content,evidence_refs,dependencies,processing_job_id,created_by_kind)
 values(aid,p_org,r.work_id,r.plan_id,final_run,'alternative_map','capital-s11-projection.v1',version,'pending_confirmation',s.reconstruction_fingerprint,fp,projection,'[]',deps,r.job_id,'worker');
 insert into public.artifact_revisions(id,organization_id,artifact_id,revision_no,previous_revision_id,audience,origin,manifest,manifest_fingerprint,content_sha256,byte_length)
 values(rid,p_org,a.id,coalesce(head.revision_no,0)+1,head.id,'internal','worker',manifest,encode(extensions.digest(manifest::text,'sha256'),'hex'),final.payload_fingerprint,final.byte_length);
 insert into public.artifact_blocks(organization_id,revision_id,block_no,block_key,kind,content,claims,content_fingerprint) values(p_org,rid,1,'s11-result','section',projection,'[]',fp);
 update public.artifacts set head_revision_id=rid where organization_id=p_org and id=a.id;
 ref:=jsonb_build_object('artifactRevisionId',rid,'manifestFingerprint',encode(extensions.digest(manifest::text,'sha256'),'hex'));
 insert into private.review_basis_receipts(organization_id,work_id,basis_kind,basis_reference,reference_fingerprint,source_count,producer)
 values(p_org,r.work_id,'artifact_revision',ref,encode(extensions.digest(ref::text,'sha256'),'hex'),(select count(*) from private.capital_s11_recipe_components where organization_id=p_org and recipe_id=r.id and slot='source'),'capital-s11-native-producer.v1') returning id into receipt;
 update public.capital_project_task_runs set status='succeeded',completed_at=stamp,output_reference=jsonb_build_object('type','capital_project_artifact','id',aid,'revisionId',rid),output_fingerprint=fp,
 quality_results=p_quality_results,usage='{}',error=null
 where organization_id=p_org and id=final_run;
 if private.capital_s11_recipe_deadline_v1(p_org,r.id,r.human_subject_id) is null or least(deadline,parsed.purge_at,final.purge_at)<=clock_timestamp() then raise exception 'capital_s11_retention_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-s11-commit-receipt.v1','recipeId',r.id,'producerTaskRunId',s.task_run_id,'taskRunId',final_run,'capitalArtifactId',aid,'revisionId',rid,'finalFingerprint',p_final_fingerprint,'artifactFingerprint',fp,'artifactVersion',version,'replayed',false);
end; $$;

create function private.worker_commit_capital_s11_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,
 p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_s11_recipes:=private.require_capital_s11_recipe_v1(p_job_id,p_capability_token,p_recipe_id);result jsonb;
begin
 result:=private.capital_s11_commit_result_core_v1(r.organization_id,r.id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results,p_job_id,p_capability_token);
 if not private.capital_public_capture_clock_current_v1(p_job_id,p_capability_token) then raise exception 'capital_s11_denied' using errcode='42501';end if;
 return result;
end; $$;

-- MIN inheritance includes the parsed object itself, not just its recipe's
-- licensed sources. Purged/changed parent bytes deny the derivative immediately.
create function private.capital_s11_physical_allocation_bound_v1(p_org uuid,p_allocation uuid,p_recipe uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;b private.capital_s11_body_bases;d timestamptz;parent private.capital_public_payload_allocations;pb private.capital_s11_body_bases;
begin
 select * into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation and content_kind='s11_body';
 select * into b from private.capital_s11_body_bases where organization_id=p_org and id=a.s11_body_basis_id;
 if b.id is null or b.recipe_id is distinct from p_recipe then return null;end if;
 d:=a.expires_at;
 if d is null or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 if b.kind in('final','derived','prelude') then
 select x.* into parent from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=p_org and q.id=b.parent_retained_payload_id and x.content_kind='s11_body';
 select * into pb from private.capital_s11_body_bases where organization_id=p_org and id=parent.s11_body_basis_id;
 if pb.recipe_id is distinct from b.recipe_id or (b.kind='prelude' and(pb.kind is distinct from 'context' or b.accepted_invocation_id is not null or pb.accepted_invocation_id is not null or parent.payload_fingerprint is distinct from(select context_fingerprint from private.capital_s11_recipes where organization_id=p_org and id=b.recipe_id)))
 or(b.kind<>'prelude' and(pb.kind is distinct from 'parsed' or pb.accepted_invocation_id is distinct from b.accepted_invocation_id))
 or not private.capital_body_physical_receipt_v1(p_org,b.parent_retained_payload_id)
 or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=parent.id and q.status='pending') then return null;end if;
 d:=least(d,parent.expires_at,parent.purge_at);
 end if;
 if b.kind='final' then
  -- Every completed internal derivative belongs to this accepted body. A lost
  -- or purged predecessor also closes the final artifact's physical lineage.
  if exists(select 1 from private.capital_s11_task_projections bridge where bridge.organization_id=p_org and bridge.recipe_id=b.recipe_id and
   ((bridge.accepted_invocation_id is not null and bridge.accepted_invocation_id is distinct from b.accepted_invocation_id) or not private.capital_body_physical_receipt_v1(p_org,bridge.derived_retained_payload_id)
   or private.capital_s11_physical_allocation_bound_v1(p_org,(select allocation_id from private.capital_public_retained_payloads where organization_id=p_org and id=bridge.derived_retained_payload_id),p_recipe) is null)) then return null;end if;
  select least(d,min(x.purge_at),min(x.expires_at)) into d from private.capital_s11_task_projections bridge
  join private.capital_public_retained_payloads receipt on receipt.organization_id=bridge.organization_id and receipt.id=bridge.derived_retained_payload_id
  join private.capital_public_payload_allocations x on x.organization_id=receipt.organization_id and x.id=receipt.allocation_id
  where bridge.organization_id=p_org and bridge.recipe_id=b.recipe_id;
 end if;
 return case when least(d,a.expires_at,a.purge_at)>clock_timestamp() then least(d,a.expires_at) end;
end; $$;
revoke all on function private.capital_s11_physical_allocation_bound_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Authority/source closure remains current once per call. Physical ancestry is
-- evaluated under that exact recipe; the owner-only bound cannot grant access.
create or replace function private.capital_s11_allocation_deadline_v1(p_org uuid,p_allocation uuid,p_subject uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare b private.capital_s11_body_bases;d timestamptz;physical_bound timestamptz;
begin
 select z.* into b from private.capital_public_payload_allocations a join private.capital_s11_body_bases z on(z.organization_id,z.id)=(a.organization_id,a.s11_body_basis_id)
 where a.organization_id=p_org and a.id=p_allocation and a.content_kind='s11_body';
 if b.id is null then return null;end if;
 d:=private.capital_s11_recipe_deadline_v1(p_org,b.recipe_id,p_subject);
 if d is null then return null;end if;
 physical_bound:=private.capital_s11_physical_allocation_bound_v1(p_org,p_allocation,b.recipe_id);
 if physical_bound is null then return null;end if;
 return case when least(d,physical_bound)>clock_timestamp() then least(d,physical_bound) end;
end; $$;

-- A successor may read immutable retained bytes, but its grant never authorizes
-- model dispatch and never re-labels the recipe's original job or time.
create function private.worker_recover_capital_s11_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_s11_recipes;s private.capital_s11_recipe_seals;
 b private.capital_s11_native_bindings;ok private.capital_s11_accepted_invocations;parsed jsonb;final jsonb;a private.capital_public_payload_allocations;state text;d timestamptz;
begin
 select * into r from private.capital_s11_recipes where organization_id=j.organization_id and id=p_recipe_id and work_id=coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid);
 if r.id is null or (r.plan_id,r.brief_id,r.revision_decision_id) is distinct from ((j.payload->>'capital_project_plan_id')::uuid,(j.payload->>'capital_project_brief_id')::uuid,(j.payload->>'correction_decision_id')::uuid) or not private.capital_body_subject_allowed_v1(j.organization_id,r.work_id,j.authorization_subject_id) then raise exception 'capital_s11_recovery_denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-s11-recipe:'||j.organization_id::text||':'||r.id::text,0)) then raise exception 'capital_s11_retry' using errcode='40001';end if;
 d:=private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 select * into s from private.capital_s11_recipe_seals where organization_id=j.organization_id and recipe_id=r.id;
 if d is null or s.id is null or not private.capital_body_physical_receipt_v1(j.organization_id,s.context_retained_payload_id) then raise exception 'capital_s11_recovery_denied' using errcode='42501';end if;
 select * into ok from private.capital_s11_accepted_invocations where organization_id=j.organization_id and recipe_id=r.id;
 select * into b from private.capital_s11_native_bindings where organization_id=j.organization_id and recipe_id=r.id;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id join private.capital_s11_body_bases z on z.organization_id=x.organization_id and z.id=x.s11_body_basis_id where q.organization_id=j.organization_id and z.recipe_id=r.id and z.accepted_invocation_id=ok.id and z.kind='parsed' and q.id=coalesce((select f.parsed_retained_payload_id from private.capital_s11_quality_failures f where f.organization_id=j.organization_id and f.recipe_id=r.id),q.id) order by q.created_at limit 1;
 if a.id is not null and private.capital_body_physical_receipt_v1(j.organization_id,(select id from private.capital_public_retained_payloads where organization_id=j.organization_id and allocation_id=a.id)) and private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is not null then parsed:=private.capital_s11_body_dto_v1(j.organization_id,a.id,private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id),true);end if;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id join private.capital_s11_body_bases z on z.organization_id=x.organization_id and z.id=x.s11_body_basis_id where q.organization_id=j.organization_id and z.recipe_id=r.id and z.accepted_invocation_id=ok.id and z.kind='final' and q.id=coalesce((select f.final_retained_payload_id from private.capital_s11_quality_failures f where f.organization_id=j.organization_id and f.recipe_id=r.id),q.id) order by q.created_at limit 1;
 if a.id is not null and private.capital_body_physical_receipt_v1(j.organization_id,(select id from private.capital_public_retained_payloads where organization_id=j.organization_id and allocation_id=a.id)) and private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is not null then final:=private.capital_s11_body_dto_v1(j.organization_id,a.id,private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id),true);end if;
 state:=case when exists(select 1 from private.capital_s11_execution_failures q where q.organization_id=j.organization_id and q.recipe_id=r.id) then 'unresolved' when exists(select 1 from private.capital_s11_quality_failures q where q.organization_id=j.organization_id and q.recipe_id=r.id) then 'quality_failed' when b.id is not null then 'committed' when final is not null then 'commit' when parsed is not null then 'transform' else 'unresolved' end;
 if state='quality_failed' and(parsed is null or final is null or not exists(select 1 from public.capital_project_task_runs tr join private.capital_s11_quality_failures q on q.organization_id=tr.organization_id and q.task_run_id=tr.id where q.organization_id=j.organization_id and q.recipe_id=r.id and tr.status='failed' and tr.quality_results=q.quality_results and tr.error=jsonb_build_object('code','capital_s11_quality_failed'))) then raise exception 'capital_s11_recovery_denied' using errcode='42501';end if;
 if b.id is not null and not private.capital_s11_native_read_allowed_v1(j.organization_id,b.revision_id,j.authorization_subject_id) then raise exception 'capital_s11_recovery_denied' using errcode='42501';end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_recovery_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-s11-recovery-grant.v1','mode','recovery','state',state,'recipeId',r.id,'originalJobId',r.job_id,'authorizedJobId',j.id,
 'organizationId',j.organization_id,'workId',r.work_id,'taskRunId',s.task_run_id,'recipe',private.capital_s11_recipe_dto_v1(j.organization_id,r.id),
 'requestPins',jsonb_build_object('schemaVersion','capital-s11-reconstruction-pins.v1','promptFingerprint',s.prompt_fingerprint,'primaryRequestFingerprint',s.primary_request_fingerprint,'fallbackRequestFingerprint',s.fallback_request_fingerprint),
 'qualityFailure',private.capital_s11_quality_failure_dto_v1(j.organization_id,r.id),
 'reconstructionMetadata',jsonb_build_object('schemaVersion','capital-s11-reconstruction-metadata.v1','originalAttempt',r.original_attempt,'researchStatus',s.research_status,'jurisdiction',s.research_jurisdiction,'jurisdictionNeedsConfirmation',s.research_jurisdiction_needs_confirmation,'strategyFingerprint',s.research_strategy_fingerprint,'dependencies',(select coalesce(jsonb_agg(jsonb_build_object('id',c.reference_id,'artifactFingerprint',d.artifact_fingerprint) order by c.component_no),'[]') from private.capital_s11_recipe_components c join public.capital_project_artifacts d on d.organization_id=c.organization_id and d.id=c.dependency_artifact_id where c.organization_id=j.organization_id and c.recipe_id=r.id and c.slot='dependency')),
 'accepted',case when ok.id is null then null else jsonb_build_object('acceptedInvocationId',ok.id,'inputReceiptId',ok.input_receipt_id,'invocationId',ok.invocation_id,'outputFingerprint',ok.output_fingerprint,'provider',ok.accepted_identity->>'provider','reportedModel',ok.accepted_identity->>'reportedModel') end,
 'context',(select private.capital_s11_body_dto_v1(j.organization_id,x.id,private.capital_s11_allocation_deadline_v1(j.organization_id,x.id,j.authorization_subject_id),true) from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=j.organization_id and q.id=s.context_retained_payload_id),'sources',(select coalesce(jsonb_agg(jsonb_build_object('deliveryId',reference_id,'retainedPayloadId',retained_payload_id) order by component_no),'[]') from private.capital_s11_recipe_components where organization_id=j.organization_id and recipe_id=r.id and slot='source'),
 'parsed',parsed,'final',final,'revisionId',b.revision_id,'capitalArtifactId',b.capital_artifact_id,'expiresAt',d,'dispatchAllowed',false);
end; $$;

create function private.capital_s11_native_ancestry_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare rev uuid;
begin
 for rev in with recursive ancestry(id,path,depth) as(select p_revision,array[p_revision],0 union all select l.derived_from_revision_id,a.path||l.derived_from_revision_id,a.depth+1 from ancestry a join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=a.id and l.link_kind='artifact_revision' where a.depth<64 and not l.derived_from_revision_id=any(a.path)) select distinct id from ancestry loop
 if not private.capital_s11_native_read_allowed_v1(p_org,rev,p_actor) then return false;end if;
 end loop;
 -- Refuse when depth bound cannot prove the full ancestry; no silent truncation.
 if exists(with recursive ancestry(id,path,depth) as(select p_revision,array[p_revision],0 union all select l.derived_from_revision_id,a.path||l.derived_from_revision_id,a.depth+1 from ancestry a join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=a.id and l.link_kind='artifact_revision' where a.depth<64 and not l.derived_from_revision_id=any(a.path)) select 1 from ancestry a join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=a.id and l.link_kind='artifact_revision' where a.depth=64 and not l.derived_from_revision_id=any(a.path)) then return false;end if;
 return true;
end; $$;

alter function private.artifact_review_sources_allowed_v1(uuid,uuid,uuid) rename to artifact_review_sources_allowed_pre_s11_v1;
create function private.artifact_review_sources_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 if not private.capital_s11_native_ancestry_allowed_v1(p_org,p_revision,p_actor) then return false;end if;
 if not private.artifact_review_sources_allowed_pre_s11_v1(p_org,p_revision,p_actor) then return false;end if;
 return private.capital_s11_native_ancestry_allowed_v1(p_org,p_revision,p_actor);
end; $$;

alter function private.review_basis_receipt_authority_v1(uuid,uuid,text,jsonb,uuid) rename to review_basis_receipt_authority_pre_s11_v1;
create function private.review_basis_receipt_authority_v1(p_org uuid,p_work uuid,p_kind text,p_reference jsonb,p_actor uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare receipt private.review_basis_receipts;b private.capital_s11_native_bindings;
begin
 select * into receipt from private.review_basis_receipts where organization_id=p_org and work_id=p_work and basis_kind=p_kind and basis_reference=p_reference and reference_fingerprint=encode(extensions.digest(p_reference::text,'sha256'),'hex');
 if receipt.producer is distinct from 'capital-s11-native-producer.v1' then return private.review_basis_receipt_authority_pre_s11_v1(p_org,p_work,p_kind,p_reference,p_actor);end if;
 select * into b from private.capital_s11_native_bindings where organization_id=p_org and work_id=p_work and revision_id=(p_reference->>'artifactRevisionId')::uuid;
 if b.id is null or p_kind<>'artifact_revision' or receipt.source_count<>(select count(*) from private.capital_s11_recipe_components where organization_id=p_org and recipe_id=b.recipe_id and slot='source') then return 'unresolved';end if;
 if not private.capital_s11_native_ancestry_allowed_v1(p_org,b.revision_id,p_actor) then return 'denied';end if;
 return 'allowed';
end; $$;

alter function private.read_artifact_revision_v1(uuid) rename to read_artifact_revision_pre_s11_v1;
create function private.read_artifact_revision_v1(p_revision uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r public.artifact_revisions;result jsonb;
begin
 select * into r from public.artifact_revisions where id=p_revision;
 result:=private.read_artifact_revision_pre_s11_v1(p_revision);
 if not private.capital_s11_native_ancestry_allowed_v1(r.organization_id,r.id,auth.uid()) then
 result:=jsonb_set(jsonb_set(jsonb_set(result,'{blocks}','[]'),'{revision,manifest}', 'null'),'{restriction}',jsonb_build_object('kind','source_rights','linkIds','[]'::jsonb,'unresolvedRevisionIds',jsonb_build_array(r.id)));
 end if;
 return result;
end; $$;

create function private.wake_capital_s11_retention_v1() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare row_data jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;org uuid:=(row_data->>'organization_id')::uuid;allocation uuid;
begin
 if tg_table_name='capital_project_artifacts' then
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct a.organization_id,a.id from private.capital_public_payload_allocations a join private.capital_s11_body_bases b on b.organization_id=a.organization_id and b.id=a.s11_body_basis_id
 where a.organization_id=org and b.recipe_id in(select recipe_id from private.capital_s11_recipe_components where organization_id=org and dependency_artifact_id=(row_data->>'id')::uuid union select recipe_id from private.capital_s11_native_bindings where organization_id=org and capital_artifact_id=(row_data->>'id')::uuid);
 elsif tg_table_name='capital_public_payload_purge_queue' then
 allocation:=(row_data->>'allocation_id')::uuid;
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct a.organization_id,a.id from private.capital_public_payload_allocations a join private.capital_s11_body_bases b on b.organization_id=a.organization_id and b.id=a.s11_body_basis_id
 where a.organization_id=org and b.recipe_id in(
 select c.recipe_id from private.capital_s11_recipe_components c join private.capital_public_retained_payloads p on p.organization_id=c.organization_id and p.id=c.retained_payload_id where c.organization_id=org and p.allocation_id=allocation
 union select b0.recipe_id from private.capital_public_payload_allocations a0 join private.capital_s11_body_bases b0 on b0.organization_id=a0.organization_id and b0.id=a0.s11_body_basis_id where a0.organization_id=org and a0.id=allocation);
 else
 -- Authority writes only append wake identities. They never wait for purge
 -- leases while holding resource-policy locks; common drain owns q frontier.
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct a.organization_id,a.id from private.capital_public_payload_allocations a join private.capital_s11_body_bases b on b.organization_id=a.organization_id and b.id=a.s11_body_basis_id
 where a.organization_id=org or b.recipe_id in(select c.recipe_id from private.capital_s11_recipe_components c join private.capital_public_delivery_licenses l on l.organization_id=c.organization_id and l.id=c.license_id where l.licensing_organization_id=org);
 end if;
 return case when tg_op='DELETE' then old else new end;
end; $$;
do $$declare t text;begin
 foreach t in array array['source_rights_versions','resource_access_grants','barrier_memberships','access_group_memberships'] loop
 execute format('create trigger %I after insert or update or delete on private.%I for each row execute function private.wake_capital_s11_retention_v1()',t||'_wake_s11',t);
 end loop;
 foreach t in array array['source_bindings','organization_memberships','capital_projects'] loop
 execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.wake_capital_s11_retention_v1()',t||'_wake_s11',t);
 end loop;
end; $$;
create trigger capital_artifact_wake_s11 after update of status on public.capital_project_artifacts for each row when(new.status is distinct from old.status and new.status in ('stale','superseded')) execute function private.wake_capital_s11_retention_v1();
create trigger capital_purge_wake_s11 after update of status on private.capital_public_payload_purge_queue for each row when(new.status is distinct from old.status) execute function private.wake_capital_s11_retention_v1();

create function private.worker_read_capital_s11_recovery_body_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_retained_payload_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare grant_row jsonb:=private.worker_recover_capital_s11_result_v1(p_job_id,p_capability_token,p_recipe_id);j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 a private.capital_public_payload_allocations;b private.capital_s11_body_bases;s private.capital_s11_recipe_seals;d timestamptz;result jsonb;
begin
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=j.organization_id and q.id=p_retained_payload_id and x.content_kind='s11_body';
 select * into b from private.capital_s11_body_bases where organization_id=j.organization_id and id=a.s11_body_basis_id;
 select * into s from private.capital_s11_recipe_seals where organization_id=j.organization_id and recipe_id=p_recipe_id;
 if b.recipe_id is distinct from p_recipe_id or not private.capital_body_physical_receipt_v1(j.organization_id,p_retained_payload_id)
 or not((b.kind='context' and s.context_retained_payload_id=p_retained_payload_id)
 or(b.kind='parsed' and grant_row#>>'{parsed,retainedPayloadId}'=p_retained_payload_id::text)
 or(b.kind='final' and grant_row#>>'{final,retainedPayloadId}'=p_retained_payload_id::text)) then raise exception 'capital_s11_recovery_body_denied' using errcode='42501';end if;
 d:=private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id);
 if d is null or not private.capital_body_retention_healthy_v1(a.policy_id,j.organization_id,a.id) then raise exception 'capital_s11_recovery_body_denied' using errcode='42501';end if;
 result:=private.capital_s11_body_dto_v1(j.organization_id,a.id,d,true);
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) or private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null then raise exception 'capital_s11_recovery_body_denied' using errcode='42501';end if;
 return result;
end; $$;

-- The shared bounded body allocator accepts a recovery principal only through
-- this private discriminant; the ordinary command still requires the original job.


create function private.worker_prepare_capital_s11_output_core_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,
 p_kind text,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid,p_recovery boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.capital_s11_recipes;grant_row jsonb;
 j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);ok private.capital_s11_accepted_invocations;
 b private.capital_s11_body_bases;parent private.capital_s11_body_bases;a private.capital_public_payload_allocations;
 parent_a private.capital_public_payload_allocations;p private.capital_public_retention_policies;deadline timestamptz;fp text;bytes bigint;stamp timestamptz:=clock_timestamp();replayed boolean:=false;
begin
 if p_recovery then
 grant_row:=private.worker_recover_capital_s11_result_v1(p_job_id,p_capability_token,p_recipe_id);
 if p_kind is distinct from 'final' or grant_row->>'state' not in ('transform','commit') or grant_row#>>'{accepted,acceptedInvocationId}' is distinct from p_accepted_invocation_id::text or grant_row#>>'{parsed,retainedPayloadId}' is distinct from p_parent_retained_payload_id::text then raise exception 'capital_s11_recovery_denied' using errcode='42501';end if;
 select * into strict r from private.capital_s11_recipes where organization_id=j.organization_id and id=p_recipe_id;
 else r:=private.require_capital_s11_recipe_v1(p_job_id,p_capability_token,p_recipe_id);end if;
 if exists(select 1 from private.capital_s11_quality_failures where organization_id=j.organization_id and recipe_id=r.id) or exists(select 1 from private.capital_s11_execution_failures where organization_id=j.organization_id and recipe_id=r.id) then raise exception 'capital_s11_quality_failed_terminal' using errcode='42501';end if;
 if p_request_id is null or p_kind not in ('parsed','final') or p_kind is null or jsonb_typeof(p_body) is distinct from 'object'
 or p_output_fingerprint is null or p_output_fingerprint!~'^[a-f0-9]{64}$' then raise exception 'capital_s11_output_invalid' using errcode='22023';end if;
 select * into ok from private.capital_s11_accepted_invocations where organization_id=j.organization_id and job_id=r.job_id and recipe_id=r.id and id=p_accepted_invocation_id;
 if ok.id is null then raise exception 'capital_s11_accepted_denied' using errcode='42501';end if;
 if p_kind='parsed' then
 if p_output_fingerprint<>ok.output_fingerprint or p_parent_retained_payload_id is not null then raise exception 'capital_s11_output_invalid' using errcode='22023';end if;
 else
 if p_body->>'schemaVersion' is distinct from 'capital-planning-map.v1' then raise exception 'capital_s11_final_invalid' using errcode='22023';end if;
 select x.* into parent_a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=j.organization_id and q.id=p_parent_retained_payload_id and x.content_kind='s11_body';
 select * into parent from private.capital_s11_body_bases where organization_id=j.organization_id and id=parent_a.s11_body_basis_id;
 if parent.id is null or parent.kind<>'parsed' or parent.recipe_id<>r.id or parent.accepted_invocation_id<>ok.id or parent.semantic_fingerprint<>ok.output_fingerprint
 or not private.capital_body_physical_receipt_v1(j.organization_id,p_parent_retained_payload_id) then raise exception 'capital_s11_parent_denied' using errcode='42501';end if;
 end if;
 select * into strict p from private.capital_public_retention_policies where id=r.retention_policy_id;
 deadline:=private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 if p_kind='final' then deadline:=least(deadline,parent_a.expires_at,parent_a.purge_at);end if;
 if deadline is null or deadline-make_interval(secs=>p.purge_margin_seconds)<=stamp or not private.capital_public_retention_healthy_v1(j.leased_by,p.id) then raise exception 'capital_s11_retention_denied' using errcode='42501';end if;
 fp:=encode(extensions.digest(p_body::text,'sha256'),'hex');bytes:=octet_length(p_body::text);
 if bytes not between 1 and 1048576 then raise exception 'capital_s11_body_size_invalid' using errcode='22023';end if;
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and job_id=j.id and request_id=p_request_id and content_kind='s11_body';
 if a.id is not null then
 select * into strict b from private.capital_s11_body_bases where organization_id=j.organization_id and id=a.s11_body_basis_id;
 if b.recipe_id<>r.id or b.kind<>p_kind or b.accepted_invocation_id<>ok.id or b.parent_retained_payload_id is distinct from p_parent_retained_payload_id or b.semantic_fingerprint<>p_output_fingerprint or a.payload_fingerprint<>fp or a.byte_length<>bytes then raise exception 'capital_s11_output_conflict' using errcode='23505';end if;
 replayed:=true;
 if private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null then raise exception 'capital_s11_retention_denied' using errcode='42501';end if;
 else
 insert into private.capital_s11_body_bases(organization_id,work_id,recipe_id,kind,semantic_fingerprint,accepted_invocation_id,parent_retained_payload_id)
 values(j.organization_id,r.work_id,r.id,p_kind,p_output_fingerprint,ok.id,p_parent_retained_payload_id) returning * into b;
 insert into private.capital_public_payload_allocations(id,organization_id,request_id,job_id,worker_token_id,worker_account_id,capability_sha256,policy_id,
 payload_fingerprint,byte_length,object_path,retained_at,expires_at,purge_at,upload_expires_at,s11_body_basis_id,content_kind)
 values(b.id,j.organization_id,p_request_id,j.id,j.leased_by,auth.uid(),j.capability_sha256,p.id,fp,bytes,j.organization_id::text||'/'||b.id::text||'/payload.json',stamp,deadline,
 deadline-make_interval(secs=>p.purge_margin_seconds),least(stamp+interval '5 minutes',deadline-make_interval(secs=>p.purge_margin_seconds)),b.id,'s11_body') returning * into a;
 insert into private.capital_public_payload_purge_queue(organization_id,allocation_id,next_check_at,effective_purge_at) values(j.organization_id,a.id,least(a.upload_expires_at,a.purge_at),a.purge_at);
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_denied' using errcode='42501';end if;
 return private.capital_s11_body_dto_v1(j.organization_id,a.id,deadline,replayed)||jsonb_build_object('canonicalBody',p_body::text);
end; $$;

create function private.worker_prepare_capital_s11_output_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_kind text,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid default null)
returns jsonb language sql security definer set search_path='' as $$ select private.worker_prepare_capital_s11_output_core_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_kind,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id,false); $$;

create function private.worker_prepare_capital_s11_recovered_output_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_kind text,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid default null)
returns jsonb language sql security definer set search_path='' as $$ select private.worker_prepare_capital_s11_output_core_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_kind,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id,true); $$;

create function private.worker_commit_capital_s11_recovered_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,
 p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare grant_row jsonb:=private.worker_recover_capital_s11_result_v1(p_job_id,p_capability_token,p_recipe_id);j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);result jsonb;
begin
 if grant_row->>'state' not in ('commit','committed') or grant_row#>>'{accepted,acceptedInvocationId}' is distinct from p_accepted_invocation_id::text
 or grant_row#>>'{parsed,retainedPayloadId}' is distinct from p_parsed_retained_payload_id::text or grant_row#>>'{final,retainedPayloadId}' is distinct from p_final_retained_payload_id::text then raise exception 'capital_s11_recovery_denied' using errcode='42501';end if;
 result:=private.capital_s11_commit_result_core_v1(j.organization_id,p_recipe_id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results,p_job_id,p_capability_token);
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_recovery_denied' using errcode='42501';end if;
 return result;
end; $$;

alter function private.decide_capital_project_artifact(uuid,text,text,text) rename to decide_capital_project_artifact_pre_s11;
create function private.decide_capital_project_artifact(p_artifact_id uuid,p_artifact_fingerprint text,p_decision text,p_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.capital_s11_native_bindings where capital_artifact_id=p_artifact_id) then raise exception 'capital_s11_revision_review_required' using errcode='42501';end if;
 return private.decide_capital_project_artifact_pre_s11(p_artifact_id,p_artifact_fingerprint,p_decision,p_note);
end; $$;
revoke all on function private.decide_capital_project_artifact_pre_s11(uuid,text,text,text) from public,anon,authenticated,service_role;

-- Fixed concrete API surface only; internal cores and legacy aliases remain
-- inaccessible even when a caller can execute another RPC in private schema.
create function public.worker_prepare_capital_s11_recipe_v1(p_job_id uuid,p_capability_token text) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_s11_recipe_v1(p_job_id,p_capability_token); $$;
create function public.worker_prepare_capital_s11_context_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_s11_context_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id); $$;
create function public.worker_finalize_capital_s11_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_context_retained_payload_id uuid,p_components jsonb,p_reconstruction_fingerprint text,p_prompt_fingerprint text,p_primary_request_fingerprint text,p_fallback_request_fingerprint text,p_operator_budget_micro_usd bigint,p_operator_max_dispatches integer,p_research_status text,p_jurisdiction text,p_jurisdiction_needs_confirmation boolean,p_strategy_fingerprint text) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_finalize_capital_s11_recipe_v1(p_job_id,p_capability_token,p_recipe_id,p_context_retained_payload_id,p_components,p_reconstruction_fingerprint,p_prompt_fingerprint,p_primary_request_fingerprint,p_fallback_request_fingerprint,p_operator_budget_micro_usd,p_operator_max_dispatches,p_research_status,p_jurisdiction,p_jurisdiction_needs_confirmation,p_strategy_fingerprint); $$;
create function public.worker_commit_capital_s11_body_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid,p_storage_object_id uuid,p_storage_version text,p_verified_sha256 text,p_verified_size bigint) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_commit_capital_s11_body_v1(p_job_id,p_capability_token,p_allocation_id,p_storage_object_id,p_storage_version,p_verified_sha256,p_verified_size); $$;
create function public.worker_read_capital_s11_allocation_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_read_capital_s11_allocation_v1(p_job_id,p_capability_token,p_allocation_id); $$;
create function public.worker_prepare_capital_s11_output_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_kind text,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_s11_output_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_kind,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id); $$;
create function public.worker_prepare_capital_s11_recovered_output_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_kind text,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_s11_recovered_output_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_kind,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id); $$;
create function public.worker_commit_capital_s11_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_commit_capital_s11_result_v1(p_job_id,p_capability_token,p_recipe_id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results); $$;
create function public.worker_commit_capital_s11_recovered_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_commit_capital_s11_recovered_result_v1(p_job_id,p_capability_token,p_recipe_id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results); $$;
create function public.worker_recover_capital_s11_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_recover_capital_s11_result_v1(p_job_id,p_capability_token,p_recipe_id); $$;
create function public.worker_read_capital_s11_recovery_body_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_read_capital_s11_recovery_body_v1(p_job_id,p_capability_token,p_recipe_id,p_retained_payload_id); $$;
create function public.read_capital_s11_result_v1(p_revision_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.read_capital_s11_result_v1(p_revision_id); $$;

create function public.worker_record_capital_s11_execution_failure_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_reason text,p_outcome_ids uuid[] default null) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_record_capital_s11_execution_failure_v1(p_job_id,p_capability_token,p_recipe_id,p_reason,p_outcome_ids); $$;
create function public.worker_record_capital_s11_quality_failure_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.worker_record_capital_s11_quality_failure_v1(p_job_id,p_capability_token,p_recipe_id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results); $$;
do $$declare p record;begin
 for p in select n.nspname,p0.proname,pg_get_function_identity_arguments(p0.oid) args from pg_proc p0 join pg_namespace n on n.oid=p0.pronamespace where n.nspname in ('private','public') and(p0.proname like '%capital_s11%' or p0.proname like '%pre_s11%' or p0.proname in('capital_capture_allocation_deadline_v2','capital_body_storage_job_authority_v1','worker_record_capital_project_artifact','worker_finish_capital_project_task','project_legacy_artifact_revision_v1','artifact_review_sources_allowed_v1','review_basis_receipt_authority_v1','read_artifact_revision_v1','decide_capital_project_artifact')) loop
 execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',p.nspname,p.proname,p.args);
 if p.proname=any(array['worker_load_capital_s11_recovered_projection_state_v1','worker_prepare_capital_s11_recovered_task_projection_v1','worker_commit_capital_s11_recovered_task_projection_v1','worker_read_capital_s11_recovered_task_body_v1','worker_prepare_capital_s11_task_projection_v1','worker_commit_capital_s11_task_projection_v1','worker_read_capital_s11_task_body_v1','worker_record_capital_s11_execution_failure_v1','worker_record_capital_s11_quality_failure_v1','worker_prepare_capital_s11_recipe_v1','worker_prepare_capital_s11_context_v1','worker_finalize_capital_s11_recipe_v1','worker_commit_capital_s11_body_v1','worker_read_capital_s11_allocation_v1','worker_prepare_capital_s11_output_v1','worker_prepare_capital_s11_recovered_output_v1','worker_commit_capital_s11_result_v1','worker_commit_capital_s11_recovered_result_v1','worker_recover_capital_s11_result_v1','worker_read_capital_s11_recovery_body_v1','read_capital_s11_result_v1','worker_authorize_capital_s11_processing_v1','worker_record_capital_s11_input_v1','worker_record_capital_s11_attempt_outcome_v1','worker_record_capital_s11_accepted_v1','worker_record_capital_project_artifact','worker_finish_capital_project_task','read_artifact_revision_v1','decide_capital_project_artifact']) then execute format('grant execute on function %I.%I(%s) to authenticated',p.nspname,p.proname,p.args);end if;
 end loop;
end; $$;

-- Row guards close calls already compiled against the old private OID as well
-- as the public wrapper. Genuine native authority exists before these inserts.
create function private.guard_capital_s11_native_write_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='capital_project_artifacts' then
 if exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id where tr.organization_id=new.organization_id and tr.id=new.task_run_id and(pt.task_id='S11' or(new.artifact_type='alternative_map' and exists(select 1 from public.processing_jobs j where j.organization_id=tr.organization_id and j.id=tr.processing_job_id and j.payload->>'analysis_scope'='capital_planning'))))
 and not exists(select 1 from private.capital_s11_native_bindings b where b.organization_id=new.organization_id and b.task_run_id=new.task_run_id and b.capital_artifact_id=new.id and new.content->>'schemaVersion'='capital-s11-projection.v1' and new.content->>'revisionId'=b.revision_id::text) then raise exception 'capital_s11_native_commit_required' using errcode='42501';end if;
 elsif new.status='failed' and exists(select 1 from private.capital_s11_recipe_seals z where z.organization_id=new.organization_id and z.task_run_id=new.id) then
 if not exists(select 1 from private.capital_s11_quality_failures q where q.organization_id=new.organization_id and q.task_run_id=new.id and q.quality_results=new.quality_results and new.error=jsonb_build_object('code','capital_s11_quality_failed') and new.output_reference is null and new.output_fingerprint is null) and not exists(select 1 from private.capital_s11_execution_failures q where q.organization_id=new.organization_id and q.task_run_id=new.id and new.quality_results='[]'::jsonb and new.error=jsonb_build_object('code','capital_s11_execution_failed','reason',q.reason) and new.output_reference is null and new.output_fingerprint is null) then raise exception 'capital_s11_native_quality_required' using errcode='42501';end if;
 elsif new.status='succeeded' and exists(select 1 from public.capital_project_plan_tasks pt where pt.organization_id=new.organization_id and pt.id=new.plan_task_id and pt.task_id='S11')
 and not exists(select 1 from private.capital_s11_native_bindings b join public.capital_project_artifacts c on c.organization_id=b.organization_id and c.id=b.capital_artifact_id where b.organization_id=new.organization_id and b.task_run_id=new.id and new.output_reference->>'id'=c.id::text and new.output_fingerprint=c.artifact_fingerprint) then raise exception 'capital_s11_native_commit_required' using errcode='42501';end if;
 return new;
end; $$;
create trigger capital_artifact_native_s11_guard before insert on public.capital_project_artifacts for each row execute function private.guard_capital_s11_native_write_v1();
create trigger capital_task_native_s11_guard before update of status,output_reference,output_fingerprint,quality_results,error on public.capital_project_task_runs for each row execute function private.guard_capital_s11_native_write_v1();
revoke all on function private.guard_capital_s11_native_write_v1() from public,anon,authenticated,service_role;

create function private.worker_read_capital_s11_recovery_source_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_retained_payload_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare grant_row jsonb:=private.worker_recover_capital_s11_result_v1(p_job_id,p_capability_token,p_recipe_id);j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 c private.capital_s11_recipe_components;a private.capital_public_payload_allocations;q private.capital_public_retained_payloads;d timestamptz;margin integer;result jsonb;
begin
 select * into c from private.capital_s11_recipe_components where organization_id=j.organization_id and recipe_id=p_recipe_id and slot='source' and retained_payload_id=p_retained_payload_id;
 select * into q from private.capital_public_retained_payloads where organization_id=j.organization_id and id=c.retained_payload_id;
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and id=q.allocation_id and content_kind='public_source' and license_id=c.license_id and delivery_id=c.reference_id;
 if c.id is null or a.id is null or not private.capital_body_physical_receipt_v1(j.organization_id,q.id) then raise exception 'capital_s11_recovery_source_denied' using errcode='42501';end if;
 d:=private.capital_public_retention_deadline_v1(a.license_id,j.organization_id,a.retained_at,a.policy_id);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=a.policy_id;
 if d is null or least(a.purge_at,d-make_interval(secs=>margin))<=clock_timestamp() or not private.capital_body_retention_healthy_v1(a.policy_id,j.organization_id,a.id) then raise exception 'capital_s11_recovery_source_denied' using errcode='42501';end if;
 result:=jsonb_build_object('schemaVersion','capital-public-storage-scope.v1','state','complete','allocationId',a.id,'retainedPayloadId',q.id,'deliveryId',a.delivery_id,
 'bucket',a.bucket_id,'path',a.object_path,'payloadFingerprint',a.payload_fingerprint,'byteLength',a.byte_length,'storageObjectId',q.storage_object_id,'storageVersion',q.storage_version,
 'retainedAt',a.retained_at,'uploadExpiresAt',a.upload_expires_at,'expiresAt',least(a.expires_at,d),'purgeAt',least(a.purge_at,d-make_interval(secs=>margin)));
 if private.capital_s11_recipe_deadline_v1(j.organization_id,p_recipe_id,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_recovery_source_denied' using errcode='42501';end if;
 return result;
end; $$;
create function public.worker_read_capital_s11_recovery_source_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_read_capital_s11_recovery_source_v1(p_job_id,p_capability_token,p_recipe_id,p_retained_payload_id); $$;
revoke all on function private.worker_read_capital_s11_recovery_source_v1(uuid,text,uuid,uuid),public.worker_read_capital_s11_recovery_source_v1(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.worker_read_capital_s11_recovery_source_v1(uuid,text,uuid,uuid),public.worker_read_capital_s11_recovery_source_v1(uuid,text,uuid,uuid) to authenticated;

create function private.worker_revalidate_capital_s11_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_s11_recipes:=private.require_capital_s11_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
begin
 return private.capital_s11_recipe_dto_v1(r.organization_id,r.id);
end; $$;
create function public.worker_revalidate_capital_s11_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_revalidate_capital_s11_recipe_v1(p_job_id,p_capability_token,p_recipe_id); $$;
revoke all on function private.worker_revalidate_capital_s11_recipe_v1(uuid,text,uuid),public.worker_revalidate_capital_s11_recipe_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.worker_revalidate_capital_s11_recipe_v1(uuid,text,uuid),public.worker_revalidate_capital_s11_recipe_v1(uuid,text,uuid) to authenticated;

do $$declare t text;begin
 foreach t in array array['professional_context_profiles','institution_capability_profiles','organization_methodologies','capital_project_briefs','capital_project_plans'] loop
 execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.wake_capital_s11_retention_v1()',t||'_wake_s11',t);
 end loop;
end; $$;
create trigger capital_session_wake_s11 after update of company_profile,locale,privacy_status,representation_status on public.document_intake_sessions for each row execute function private.wake_capital_s11_retention_v1();

create function private.worker_find_capital_s11_recovery_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_s11_recipes;state text;
begin
 select * into r from private.capital_s11_recipes where organization_id=j.organization_id and work_id=coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid)
 and plan_id=(j.payload->>'capital_project_plan_id')::uuid and brief_id=(j.payload->>'capital_project_brief_id')::uuid
 and revision_decision_id is not distinct from(j.payload->>'correction_decision_id')::uuid;
 state:=case when r.id is null then 'none' when exists(select 1 from private.capital_s11_accepted_invocations a where a.organization_id=j.organization_id and a.recipe_id=r.id)
 and exists(select 1 from private.capital_s11_recipe_seals s where s.organization_id=j.organization_id and s.recipe_id=r.id)
 and private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is not null then 'recovery' else 'unresolved' end;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_recovery_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-s11-recovery-discovery.v1','state',state,'recipeId',r.id);
end; $$;
create function public.worker_find_capital_s11_recovery_v1(p_job_id uuid,p_capability_token text) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_find_capital_s11_recovery_v1(p_job_id,p_capability_token); $$;
revoke all on function private.worker_find_capital_s11_recovery_v1(uuid,text),public.worker_find_capital_s11_recovery_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_find_capital_s11_recovery_v1(uuid,text),public.worker_find_capital_s11_recovery_v1(uuid,text) to authenticated;

-- Native capture inherits no historical package/legacy confirmation. Every
-- derived revision needs its own exact current human review before external use.
alter function private.artifact_revision_release_v1(public.artifact_revisions) rename to artifact_revision_release_pre_s11_v1;
create function private.artifact_revision_release_v1(r public.artifact_revisions)
returns text language plpgsql stable security definer set search_path='' as $$
declare approved boolean;
begin
 if exists(with recursive ancestry(id) as(select r.id union select l.derived_from_revision_id from ancestry a join private.artifact_dependency_links l on l.organization_id=r.organization_id and l.revision_id=a.id and l.link_kind='artifact_revision') select 1 from ancestry a join private.capital_s11_native_bindings b on b.organization_id=r.organization_id and b.revision_id=a.id) then
 approved:=exists(select 1 from public.artifact_reviews v join public.artifacts a on a.organization_id=v.organization_id and a.id=v.artifact_id where v.organization_id=r.organization_id and v.artifact_id=r.artifact_id and v.revision_id=r.id and v.work_id=a.work_id and v.manifest_fingerprint=r.manifest_fingerprint and v.audience=r.audience and private.artifact_review_is_active_v1(r.organization_id,v.id));
 return case when approved then 'released' when r.audience='external' then 'blocked' else 'internal' end;
 end if;
 return private.artifact_revision_release_pre_s11_v1(r);
end; $$;
revoke all on function private.artifact_revision_release_pre_s11_v1(public.artifact_revisions),private.artifact_revision_release_v1(public.artifact_revisions) from public,anon,authenticated,service_role;

-- A native S11 uses licensed cross-tenant bridges, never publisher source UUIDs
-- in a consumer manifest. Its real, current recipe/source/body proof supplies
-- review substance without manufacturing financial claims or weakening history.
do $s11_review_substance$
declare definition text;needle text:='has_substance:=';replacement text;matches integer;
begin
 -- Forward review cuts preserve the original foundation under a renamed core.
 -- Locate that one guarded core rather than modifying the current wrapper.
 select count(*),max(pg_get_functiondef(p.oid)) into matches,definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname like 'review_artifact_revision%'
 and p.proargtypes='2950 25 25 2950 25 16 2950 2950'::oidvector
 and position('if not has_substance then raise exception ''review_substance_required''' in p.prosrc)>0
 and position(needle in p.prosrc)>0;
 if matches<>1 then raise exception 's11_review_substance_definition_drift';end if;
 replacement:='has_substance:=(exists(select 1 from private.capital_s11_native_bindings nb where nb.organization_id=org and nb.revision_id=r.id and exists(select 1 from private.capital_s11_recipe_components src where src.organization_id=nb.organization_id and src.recipe_id=nb.recipe_id and src.slot=''source'') and private.capital_s11_native_read_allowed_v1(org,r.id,actor))) or ';
 execute replace(definition,needle,replacement);
end $s11_review_substance$;

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

-- Prospective company-debt native consumption. No experimental contribution/1000 grant
-- is widened. Raw context, parsed response and final product live only in
-- finite-lived private Storage allocations; permanent rows contain identity.
set search_path='';

create table private.capital_debt_recipes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,job_id uuid not null,plan_id uuid not null,brief_id uuid not null,session_id uuid not null,
 revision_decision_id uuid,original_attempt integer not null check(original_attempt>0),
 human_subject_id uuid not null references auth.users(id),worker_account_id uuid not null references auth.users(id),
 plan_fingerprint text not null check(plan_fingerprint~'^[a-f0-9]{64}$'),
 context_fingerprint text not null check(context_fingerprint~'^[a-f0-9]{64}$'),
 base_authority_fingerprint text not null check(base_authority_fingerprint~'^[a-f0-9]{64}$'),
 as_of_date date not null,locale text not null check(locale in ('pt-BR','en-US')),
 renderer_version text not null check(renderer_version='capital-public-task-renderer.company-debt.v1'),
 captured_at timestamptz not null,expires_at timestamptz not null check(isfinite(expires_at)),
 retention_policy_id uuid not null references private.capital_public_retention_policies(id),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,job_id),unique nulls not distinct(organization_id,work_id,plan_id,brief_id,revision_decision_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,plan_id) references public.capital_project_plans(organization_id,id),
 foreign key(organization_id,brief_id) references public.capital_project_briefs(organization_id,id),
 foreign key(organization_id,session_id) references public.document_intake_sessions(organization_id,id),
 foreign key(organization_id,revision_decision_id) references public.capital_project_artifact_decisions(organization_id,id)
);
create index capital_debt_recipe_work_idx on private.capital_debt_recipes(organization_id,work_id);
create index capital_debt_recipe_plan_idx on private.capital_debt_recipes(organization_id,plan_id);
create index capital_debt_recipe_brief_idx on private.capital_debt_recipes(organization_id,brief_id);
create index capital_debt_recipe_session_idx on private.capital_debt_recipes(organization_id,session_id);
create index capital_debt_recipe_decision_idx on private.capital_debt_recipes(organization_id,revision_decision_id);
create index capital_debt_recipe_subject_idx on private.capital_debt_recipes(human_subject_id);
create index capital_debt_recipe_worker_idx on private.capital_debt_recipes(worker_account_id);
create index capital_debt_recipe_policy_idx on private.capital_debt_recipes(retention_policy_id);

create table private.capital_debt_body_bases (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,recipe_id uuid not null,kind text not null check(kind in ('context','prelude','parsed','final','derived')),
 semantic_fingerprint text check(semantic_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_debt_recipes(organization_id,work_id,id)
);
create index capital_debt_basis_recipe_idx on private.capital_debt_body_bases(organization_id,work_id,recipe_id);

alter table private.capital_public_payload_allocations add column debt_body_basis_id uuid,
 add constraint capital_debt_allocation_basis_fk foreign key(organization_id,debt_body_basis_id)
 references private.capital_debt_body_bases(organization_id,id);
do $$declare expression text;nulls text:='body_basis_id,m07_body_basis_id,delivery_id,license_id,licensing_organization_id';begin
 select pg_get_constraintdef(oid) into strict expression from pg_constraint where conrelid='private.capital_public_payload_allocations'::regclass and conname='capital_public_payload_allocations_content_kind_check';
 expression:=substring(expression from 7);
 alter table private.capital_public_payload_allocations drop constraint capital_public_payload_allocations_content_kind_check;
 execute 'alter table private.capital_public_payload_allocations add constraint capital_public_payload_allocations_content_kind_check check ('||expression||' or content_kind=''debt_body'')';
 select pg_get_constraintdef(oid) into strict expression from pg_constraint where conrelid='private.capital_public_payload_allocations'::regclass and conname='capital_allocations_kind_invariant';expression:=substring(expression from 7);
 if exists(select 1 from pg_attribute where attrelid='private.capital_public_payload_allocations'::regclass and attname='s11_body_basis_id' and not attisdropped) then nulls:=nulls||',s11_body_basis_id';end if;
 if exists(select 1 from pg_attribute where attrelid='private.capital_public_payload_allocations'::regclass and attname='material_body_basis_id' and not attisdropped) then nulls:=nulls||',material_body_basis_id';end if;
 alter table private.capital_public_payload_allocations drop constraint capital_allocations_kind_invariant;
 execute 'alter table private.capital_public_payload_allocations add constraint capital_allocations_kind_invariant check((debt_body_basis_id is null and '||expression||') or(content_kind=''debt_body'' and debt_body_basis_id is not null and num_nonnulls('||nulls||')=0))';
end$$;
create index capital_debt_allocation_basis_idx on private.capital_public_payload_allocations(organization_id,debt_body_basis_id);
create unique index capital_debt_allocation_request_idx on private.capital_public_payload_allocations(organization_id,job_id,request_id) where content_kind='debt_body';

create table private.capital_debt_recipe_components (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,recipe_id uuid not null,component_no integer not null check(component_no between 1 and 1000),
 slot text not null check(slot in ('company','brief','institution','research','source','revision','execution_plan')),
 reference_id uuid not null,version integer not null check(version>0),
 body_fingerprint text not null check(body_fingerprint~'^[a-f0-9]{64}$'),
 retained_payload_id uuid,license_id uuid,dependency_artifact_id uuid,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id,component_no),unique(organization_id,recipe_id,slot,reference_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_debt_recipes(organization_id,work_id,id),
 foreign key(organization_id,retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,license_id) references private.capital_public_delivery_licenses(organization_id,id),
 foreign key(organization_id,dependency_artifact_id) references public.capital_project_artifacts(organization_id,id),
 check((slot='source' and num_nonnulls(retained_payload_id,license_id)=2 and dependency_artifact_id is null)
 or(slot='execution_plan' and dependency_artifact_id is not null and license_id is null)
 or(slot not in ('source','execution_plan') and num_nonnulls(license_id,dependency_artifact_id)=0))
);
create index capital_debt_components_recipe_idx on private.capital_debt_recipe_components(organization_id,work_id,recipe_id);
create index capital_debt_components_retained_idx on private.capital_debt_recipe_components(organization_id,retained_payload_id);
create index capital_debt_components_license_idx on private.capital_debt_recipe_components(organization_id,license_id);
create index capital_debt_components_dependency_idx on private.capital_debt_recipe_components(organization_id,dependency_artifact_id);

create table private.capital_debt_recipe_seals (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,recipe_id uuid not null,execution_plan_task_run_id uuid not null,context_retained_payload_id uuid not null,
 recipe_fingerprint text not null check(recipe_fingerprint~'^[a-f0-9]{64}$'),
 reconstruction_fingerprint text not null check(reconstruction_fingerprint~'^[a-f0-9]{64}$'),
 prompt_fingerprint text not null check(prompt_fingerprint~'^[a-f0-9]{64}$'),
 primary_request_fingerprint text not null check(primary_request_fingerprint~'^[a-f0-9]{64}$'),
 fallback_request_fingerprint text not null check(fallback_request_fingerprint~'^[a-f0-9]{64}$'),
 research_status text not null check(research_status in ('succeeded','partial')),
 budget_version text not null check(budget_version='capital-debt-operational-budget.v1'),
 research_reservation_version text not null check(research_reservation_version='public-research-reservation.company-debt.v1'),
 research_reservation_micro_usd bigint not null check(research_reservation_micro_usd in (0,200000)),
 effective_budget_micro_usd bigint not null check(effective_budget_micro_usd between 1 and 950000),
 effective_max_dispatches integer not null check(effective_max_dispatches between 1 and 2),
 sealed_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,recipe_id,execution_plan_task_run_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_debt_recipes(organization_id,work_id,id),
 foreign key(organization_id,execution_plan_task_run_id) references public.capital_project_task_runs(organization_id,id),
 foreign key(organization_id,context_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id)
);
create index capital_debt_seal_recipe_idx on private.capital_debt_recipe_seals(organization_id,work_id,recipe_id);
create index capital_debt_seal_execution_plan_idx on private.capital_debt_recipe_seals(organization_id,execution_plan_task_run_id);
create index capital_debt_seal_retained_idx on private.capital_debt_recipe_seals(organization_id,context_retained_payload_id);


create function private.capital_debt_base_authority_fingerprint_v1(p_org uuid,p_job uuid,p_session uuid,p_brief uuid,p_plan uuid,p_subject uuid,p_captured_at timestamptz)
returns text language sql volatile security definer set search_path='' as $$
 select encode(extensions.digest(jsonb_build_object(
 'session',(select jsonb_build_object('company',s.company_profile,'locale',s.locale,'privacy',s.privacy_status,'representation',s.representation_status) from public.document_intake_sessions s where s.organization_id=p_org and s.id=p_session),
 'brief',(select jsonb_build_object('id',b.id,'version',b.brief_version,'fingerprint',b.content_fingerprint,'status',b.status) from public.capital_project_briefs b where b.organization_id=p_org and b.id=p_brief),
 'plan',(select jsonb_build_object('id',p.id,'fingerprint',p.plan_fingerprint,'status',p.status) from public.capital_project_plans p where p.organization_id=p_org and p.id=p_plan),
 'professional',(select coalesce(jsonb_agg(to_jsonb(c) order by c.user_id),'[]') from public.professional_context_profiles c where c.organization_id=p_org and c.user_id in(p_subject,(select pr.created_by from public.processing_jobs j join public.processing_runs pr on pr.organization_id=j.organization_id and pr.id=j.processing_run_id where j.organization_id=p_org and j.id=p_job))),
 'institution',(select to_jsonb(c) from public.institution_capability_profiles c where c.organization_id=p_org),
 'methodology',(select jsonb_build_object('id',m.id,'version',m.version_number,'fingerprint',encode(extensions.digest(m.content::text,'sha256'),'hex')) from public.organization_methodologies m where m.organization_id=p_org and m.status='active'),
 'revision',(select jsonb_build_object('correction',j.payload->'revision_correction_note','artifact',j.payload->'revision_of_artifact_id','priorFingerprint',(select x.artifact_fingerprint from public.capital_project_artifacts x where x.organization_id=p_org and x.id::text=j.payload->>'revision_of_artifact_id')) from public.processing_jobs j where j.organization_id=p_org and j.id=p_job),
 'feedback',(select coalesce(jsonb_agg(to_jsonb(f) order by f.task_id),'[]') from(select distinct on(t.task_id) t.task_id,tr.id,tr.attempt_no,tr.quality_results,tr.error from public.capital_project_task_runs tr join public.capital_project_plan_tasks t on t.organization_id=tr.organization_id and t.id=tr.plan_task_id join public.processing_jobs j on j.organization_id=tr.organization_id and j.id=p_job where tr.organization_id=p_org and tr.capital_project_id=(j.payload->>'capital_project_id')::uuid and tr.processing_job_id in(p_job,coalesce(nullif(j.payload#>>'{trigger_event,priorJobId}','')::uuid,p_job)) and tr.status='failed' and jsonb_array_length(tr.quality_results)>0 and tr.completed_at<=p_captured_at order by t.task_id,tr.completed_at desc nulls last,tr.id desc) f)
 )::text,'sha256'),'hex');
$$;

-- Source bridges retain the consumer's license identity; publisher UUIDs are
-- NEVER inserted in artifact_dependency_links with consumer tenancy.
create function private.capital_debt_recipe_deadline_v1(p_org uuid,p_recipe uuid,p_subject uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_debt_recipes;c private.capital_debt_recipe_components;
 a private.capital_public_payload_allocations;bound timestamptz;deadline timestamptz;s private.capital_debt_recipe_seals;
begin
 select * into r from private.capital_debt_recipes where organization_id=p_org and id=p_recipe;
 if r.id is null or p_subject is null or not private.capital_body_subject_allowed_v1(p_org,r.work_id,p_subject)
 or not private.capital_body_subject_allowed_v1(p_org,r.work_id,r.human_subject_id) then return null;end if;
 if r.base_authority_fingerprint is distinct from private.capital_debt_base_authority_fingerprint_v1(p_org,r.job_id,r.session_id,r.brief_id,r.plan_id,r.human_subject_id,r.captured_at) then return null;end if;
 deadline:=r.expires_at;
 select * into s from private.capital_debt_recipe_seals where organization_id=p_org and recipe_id=r.id;
 if s.id is not null then
 select x.* into a from private.capital_public_retained_payloads p join private.capital_public_payload_allocations x on x.organization_id=p.organization_id and x.id=p.allocation_id where p.organization_id=p_org and p.id=s.context_retained_payload_id;
 if a.id is null or not private.capital_body_physical_receipt_v1(p_org,s.context_retained_payload_id) or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 deadline:=least(deadline,a.expires_at,a.purge_at);
 end if;
 for c in select * from private.capital_debt_recipe_components where organization_id=p_org and recipe_id=r.id order by component_no loop
 if c.slot='source' then
 select x.* into a from private.capital_public_retained_payloads p join private.capital_public_payload_allocations x on x.organization_id=p.organization_id and x.id=p.allocation_id
 where p.organization_id=p_org and p.id=c.retained_payload_id and x.content_kind='public_source' and x.license_id=c.license_id;
 if a.id is null or not private.capital_body_physical_receipt_v1(p_org,c.retained_payload_id) then return null;end if;
 bound:=private.capital_public_retention_deadline_v1(c.license_id,p_org,a.retained_at,a.policy_id);
 if bound is null or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 deadline:=least(deadline,bound,a.expires_at,a.purge_at);
 elsif c.slot='execution_plan' then
 if not exists(select 1 from public.capital_project_artifacts x where x.organization_id=p_org and x.capital_project_id=r.work_id and x.id=c.dependency_artifact_id and x.artifact_version=c.version and x.status not in ('stale','superseded')) then return null;end if;
 select allocation.* into a from private.capital_debt_task_projections bridge join private.capital_public_retained_payloads physical on physical.organization_id=bridge.organization_id and physical.id=bridge.derived_retained_payload_id
 join private.capital_public_payload_allocations allocation on allocation.organization_id=physical.organization_id and allocation.id=physical.allocation_id
 where bridge.organization_id=p_org and bridge.recipe_id=r.id and bridge.capital_artifact_id=c.dependency_artifact_id;
 if a.id is null or not private.capital_body_physical_receipt_v1(p_org,(select id from private.capital_public_retained_payloads where organization_id=p_org and allocation_id=a.id))
 or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 deadline:=least(deadline,a.expires_at,a.purge_at);
 end if;
 end loop;
 return case when deadline>clock_timestamp() then deadline end;
end; $$;

create function private.capital_debt_capture_context_v1(p_job_id uuid,p_capability_token text) returns jsonb language plpgsql volatile security definer set search_path='' as $$declare c jsonb;begin
 c:=private.worker_load_capital_project_context_v6(p_job_id,p_capability_token);
 return c-array['completed_artifacts','dependency_artifacts'];
end$$;
revoke all on function private.capital_debt_capture_context_v1(uuid,text) from public,anon,authenticated,service_role;
create function private.worker_prepare_capital_debt_recipe_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 c jsonb;r private.capital_debt_recipes;p private.capital_public_retention_policies;stamp timestamptz:=clock_timestamp();fp text;
begin
 if j.payload?'revision_of_artifact_id' and not exists(select 1 from public.capital_project_artifact_decisions d where d.organization_id=j.organization_id and d.id::text=j.payload->>'correction_decision_id' and d.artifact_id::text=j.payload->>'revision_of_artifact_id' and d.capital_project_id=coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid) and d.decision='request_changes' and d.decided_by=j.authorization_subject_id) then raise exception 'capital_debt_correction_denied' using errcode='42501';end if;
 if j.payload->>'analysis_scope' is distinct from 'company_debt_view' or not(j.payload->'capital_task_ids'?'C11') then raise exception 'capital_debt_recipe_denied' using errcode='42501';end if;
 c:=private.capital_debt_capture_context_v1(j.id,p_capability_token);
 fp:=encode(extensions.digest(c::text,'sha256'),'hex');
 select x.* into p from private.capital_public_retention_policies x join private.capital_public_retention_controls ctl on ctl.policy_id=x.id where ctl.singleton and ctl.enabled;
 if p.id is null or not private.capital_public_retention_healthy_v1(j.leased_by,p.id) then raise exception 'capital_debt_retention_denied' using errcode='42501';end if;
 select * into r from private.capital_debt_recipes where organization_id=j.organization_id and job_id=j.id;
 if r.id is not null then
 if r.context_fingerprint<>fp or r.worker_account_id<>auth.uid() or r.human_subject_id<>j.authorization_subject_id then raise exception 'capital_debt_recipe_changed' using errcode='40001';end if;
 else
 if exists(select 1 from private.capital_debt_recipes existing where existing.organization_id=j.organization_id and existing.work_id=coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid) and existing.plan_id=(j.payload->>'capital_project_plan_id')::uuid and existing.brief_id=(j.payload->>'capital_project_brief_id')::uuid and existing.revision_decision_id is not distinct from (j.payload->>'correction_decision_id')::uuid) then raise exception 'capital_debt_recovery_required' using errcode='42501';end if;
 insert into private.capital_debt_recipes(organization_id,work_id,job_id,plan_id,brief_id,session_id,human_subject_id,worker_account_id,revision_decision_id,original_attempt,
 plan_fingerprint,context_fingerprint,base_authority_fingerprint,as_of_date,locale,renderer_version,captured_at,expires_at,retention_policy_id)
 values(j.organization_id,(j.payload->>'capital_project_id')::uuid,j.id,(j.payload->>'capital_project_plan_id')::uuid,(j.payload->>'capital_project_brief_id')::uuid,j.intake_session_id,
 j.authorization_subject_id,auth.uid(),(j.payload->>'correction_decision_id')::uuid,j.attempts,c#>>'{plan,fingerprint}',fp,private.capital_debt_base_authority_fingerprint_v1(j.organization_id,j.id,j.intake_session_id,(j.payload->>'capital_project_brief_id')::uuid,(j.payload->>'capital_project_plan_id')::uuid,j.authorization_subject_id,stamp),(stamp at time zone 'UTC')::date,c#>>'{session,locale}',
 'capital-public-task-renderer.company-debt.v1',stamp,stamp+make_interval(secs=>p.maximum_retention_seconds),p.id) returning * into r;
 end if;
 if private.capital_debt_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_debt_recipe_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-debt-base-context.v1','recipeId',r.id,'jobId',j.id,'organizationId',j.organization_id,'workId',r.work_id,
 'planId',r.plan_id,'planFingerprint',r.plan_fingerprint,'asOfDate',r.as_of_date,'locale',r.locale,'contextFingerprint',r.context_fingerprint,
 'canonicalContext',c::text,'expiresAt',r.expires_at);
end; $$;


-- Company-debt retention is a separate origin family. Its DTO preserves the physical
-- protocol, but resolves its own server basis rather than inventing a contribution.
create function private.capital_debt_allocation_deadline_v1(p_org uuid,p_allocation uuid,p_subject uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;b private.capital_debt_body_bases;d timestamptz;
begin
 select * into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation and content_kind='debt_body';
 select * into b from private.capital_debt_body_bases where organization_id=p_org and id=a.debt_body_basis_id;
 if b.id is null then return null;end if;
 d:=private.capital_debt_recipe_deadline_v1(p_org,b.recipe_id,p_subject);
 if d is null or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 return case when least(d,a.expires_at,a.purge_at)>clock_timestamp() then least(d,a.expires_at) end;
end; $$;

alter function private.capital_capture_allocation_deadline_v2(uuid,uuid) rename to capital_capture_allocation_deadline_pre_debt_v2;
create function private.capital_capture_allocation_deadline_v2(p_org uuid,p_allocation uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;subject uuid;
begin
 select * into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation;
 if a.content_kind is distinct from 'debt_body' then return private.capital_capture_allocation_deadline_pre_debt_v2(p_org,p_allocation);end if;
 select human_subject_id into subject from private.capital_debt_body_bases b join private.capital_debt_recipes r on r.organization_id=b.organization_id and r.id=b.recipe_id where b.organization_id=p_org and b.id=a.debt_body_basis_id;
 return private.capital_debt_allocation_deadline_v1(p_org,p_allocation,subject);
end; $$;

create function private.capital_debt_body_dto_v1(p_org uuid,p_allocation uuid,p_deadline timestamptz,p_replayed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare allocation private.capital_public_payload_allocations;receipt private.capital_public_retained_payloads;margin integer;
begin
 select * into strict allocation from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation;
 select * into receipt from private.capital_public_retained_payloads where organization_id=p_org and allocation_id=allocation.id;
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 return jsonb_build_object('schemaVersion','capital-retained-body.v1','retentionState',case when receipt.id is null then 'allocated' else 'retained' end,
 'allocationId',allocation.id,'retainedPayloadId',receipt.id,'bodyBasisId',allocation.debt_body_basis_id,'bucket',allocation.bucket_id,'path',allocation.object_path,
 'payloadFingerprint',allocation.payload_fingerprint,'byteLength',allocation.byte_length,'storageObjectId',receipt.storage_object_id,'storageVersion',receipt.storage_version,
 'retainedAt',allocation.retained_at,'uploadExpiresAt',allocation.upload_expires_at,'expiresAt',least(allocation.expires_at,p_deadline),
 'purgeAt',least(allocation.purge_at,p_deadline-make_interval(secs=>margin)),'replayed',p_replayed);
end; $$;

create function private.worker_commit_capital_debt_body_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid,p_storage_object_id uuid,
 p_storage_version text,p_verified_sha256 text,p_verified_size bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 allocation private.capital_public_payload_allocations;basis private.capital_debt_body_bases;receipt private.capital_public_retained_payloads;
 object_row storage.objects;deadline timestamptz;margin integer;replayed boolean:=false;result_dto jsonb;
begin
 select * into allocation from private.capital_public_payload_allocations where organization_id=job.organization_id and job_id=job.id and id=p_allocation_id and content_kind='debt_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id) then raise exception 'capital_body_retention_denied' using errcode='42501';end if;
 if p_storage_object_id is null or coalesce(length(p_storage_version),0) not between 1 and 1024 or p_verified_sha256 is distinct from allocation.payload_fingerprint or p_verified_size is distinct from allocation.byte_length then
 raise exception 'capital_body_proof_invalid' using errcode='22023';end if;
 deadline:=private.capital_debt_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 if deadline is null or least(allocation.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp()
 or not private.capital_public_retention_healthy_v1(job.leased_by,allocation.policy_id) then raise exception 'capital_body_retention_denied' using errcode='42501';end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 begin
 perform 1 from private.capital_public_payload_purge_queue where organization_id=job.organization_id and allocation_id=allocation.id and status='pending' for share nowait;
 if not found then raise exception 'capital_body_retention_denied' using errcode='42501';end if;
 select * into object_row from storage.objects where id=p_storage_object_id and bucket_id=allocation.bucket_id and name=allocation.object_path for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001';end;
 if object_row.id is null or object_row.version is distinct from p_storage_version or object_row.metadata->>'size' is distinct from allocation.byte_length::text
 or object_row.metadata->>'mimetype' is distinct from 'application/json' or (to_jsonb(object_row)->>'is_versioned')::boolean is true
 or (to_jsonb(object_row)->>'is_delete_marker')::boolean is true or to_jsonb(object_row)->>'archived_at' is not null or not private.capital_public_capture_bucket_safe_v1() then
 raise exception 'capital_body_proof_invalid' using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-body-request:'||job.organization_id::text||':'||job.id::text||':'||allocation.request_id::text,0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 select * into receipt from private.capital_public_retained_payloads where organization_id=job.organization_id and allocation_id=allocation.id;
 if found then
 if receipt.storage_object_id<>p_storage_object_id or receipt.storage_version<>p_storage_version or receipt.verified_sha256<>p_verified_sha256 or receipt.verified_size<>p_verified_size then
 raise exception 'capital_body_proof_conflict' using errcode='23505';end if;
 replayed:=true;
 else
 if allocation.upload_expires_at<=clock_timestamp() then raise exception 'capital_body_upload_expired' using errcode='42501';end if;
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 insert into private.capital_public_retained_payloads(organization_id,allocation_id,storage_object_id,storage_version,verified_sha256,verified_size,verified_by)
 values(job.organization_id,allocation.id,p_storage_object_id,p_storage_version,p_verified_sha256,p_verified_size,auth.uid()) returning * into receipt;
 update private.capital_public_payload_purge_queue set next_check_at=least(allocation.purge_at,deadline-make_interval(secs=>margin)),
 effective_purge_at=least(effective_purge_at,allocation.purge_at,deadline-make_interval(secs=>margin)),updated_at=clock_timestamp()
 where organization_id=job.organization_id and allocation_id=allocation.id;
 end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token)
 then raise exception 'capital_capture_denied' using errcode='42501';end if;
 result_dto:=private.capital_debt_body_dto_v1(job.organization_id,allocation.id,deadline,replayed);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return result_dto;
end; $$;

create function private.worker_read_capital_debt_allocation_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 allocation private.capital_public_payload_allocations;receipt private.capital_public_retained_payloads;
 physical_object storage.objects;deadline timestamptz;checked_deadline timestamptz;margin integer;result_dto jsonb;
begin
 if p_allocation_id is null then raise exception 'capital_body_read_invalid' using errcode='22023';end if;
 select a.* into allocation from private.capital_public_payload_allocations a
 where a.organization_id=job.organization_id and a.job_id=job.id and a.id=p_allocation_id and a.content_kind='debt_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id)
 or not private.capital_public_retention_healthy_v1(allocation.worker_token_id,allocation.policy_id)
 or not private.capital_public_capture_bucket_safe_v1() then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 deadline:=private.capital_debt_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 if deadline is null or least(allocation.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp() then
 raise exception 'capital_body_read_denied' using errcode='42501';end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 begin
 perform 1 from private.capital_public_payload_purge_queue q
 where q.organization_id=job.organization_id and q.allocation_id=allocation.id and q.status='pending' for share nowait;
 if not found then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 select o.* into physical_object from storage.objects o where o.bucket_id=allocation.bucket_id and o.name=allocation.object_path for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001';end;
 if physical_object.id is null or coalesce(length(physical_object.version),0) not between 1 and 1024
 or physical_object.metadata->>'size' is distinct from allocation.byte_length::text
 or physical_object.metadata->>'mimetype' is distinct from 'application/json'
 or (to_jsonb(physical_object)->>'is_versioned')::boolean is true
 or (to_jsonb(physical_object)->>'is_delete_marker')::boolean is true
 or to_jsonb(physical_object)->>'archived_at' is not null then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 select r.* into receipt from private.capital_public_retained_payloads r
 where r.organization_id=job.organization_id and r.allocation_id=allocation.id;
 if receipt.id is null then
 if allocation.upload_expires_at<=clock_timestamp() then raise exception 'capital_body_upload_expired' using errcode='42501';end if;
 else
 if receipt.storage_object_id is distinct from physical_object.id or receipt.storage_version is distinct from physical_object.version
 or receipt.verified_sha256 is distinct from allocation.payload_fingerprint or receipt.verified_size is distinct from allocation.byte_length
 or not private.capital_body_physical_receipt_v1(job.organization_id,receipt.id) then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 end if;
 result_dto:=private.capital_debt_body_dto_v1(job.organization_id,allocation.id,deadline,true)
 ||jsonb_build_object('storageObjectId',physical_object.id,'storageVersion',physical_object.version);
 -- No caller-supplied path/version/hash or storage header authorizes this scope.
 -- Re-run current rights and clock after constructing it, so an elapsed lease
 -- cannot escape through a slow closure/metadata lookup before either server gate.
 checked_deadline:=private.capital_debt_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
 if checked_deadline is null then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 if checked_deadline is distinct from deadline then raise exception 'capital_capture_retry' using errcode='40001';end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token)
 or least(allocation.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp()
 or (receipt.id is null and allocation.upload_expires_at<=clock_timestamp()) then
 raise exception 'capital_body_read_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-debt-worker-read-scope.v1','recipeId',(select recipe_id from private.capital_debt_body_bases where organization_id=job.organization_id and id=allocation.debt_body_basis_id),'retention',result_dto);
end; $$;

-- The base is captured before research. Only SQL supplies its actual body; a
-- caller cannot smuggle a fresh context underneath a prior captured identity.
create function private.worker_prepare_capital_debt_context_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 r private.capital_debt_recipes;a private.capital_public_payload_allocations;b private.capital_debt_body_bases;
 c jsonb;p private.capital_public_retention_policies;fp text;bytes bigint;deadline timestamptz;stamp timestamptz:=clock_timestamp();
begin
 if not pg_try_advisory_xact_lock(hashtextextended('capital-debt-recipe:'||j.organization_id::text||':'||p_recipe_id::text,0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 select * into r from private.capital_debt_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 if r.id is null or r.worker_account_id<>auth.uid() or r.human_subject_id<>j.authorization_subject_id or p_request_id is null then raise exception 'capital_debt_denied' using errcode='42501';end if;
 c:=private.capital_debt_capture_context_v1(j.id,p_capability_token);
 fp:=encode(extensions.digest(c::text,'sha256'),'hex');bytes:=octet_length(c::text);
 if fp<>r.context_fingerprint or bytes not between 1 and 1048576 then raise exception 'capital_debt_context_changed' using errcode='40001';end if;
 select * into strict p from private.capital_public_retention_policies where id=r.retention_policy_id;
 deadline:=private.capital_debt_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 if deadline is null or deadline-make_interval(secs=>p.purge_margin_seconds)<=stamp or not private.capital_public_retention_healthy_v1(j.leased_by,p.id) then raise exception 'capital_debt_retention_denied' using errcode='42501';end if;
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and job_id=j.id and request_id=p_request_id and content_kind='debt_body';
 if a.id is not null then
 select * into b from private.capital_debt_body_bases where organization_id=j.organization_id and id=a.debt_body_basis_id;
 if b.recipe_id<>r.id or b.kind<>'context' or a.payload_fingerprint<>fp or a.byte_length<>bytes then raise exception 'capital_debt_context_conflict' using errcode='23505';end if;
 if private.capital_debt_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null then raise exception 'capital_debt_retention_denied' using errcode='42501';end if;
 else
 insert into private.capital_debt_body_bases(organization_id,work_id,recipe_id,kind) values(j.organization_id,r.work_id,r.id,'context') returning * into b;
 insert into private.capital_public_payload_allocations(id,organization_id,request_id,job_id,worker_token_id,worker_account_id,capability_sha256,policy_id,
 payload_fingerprint,byte_length,object_path,retained_at,expires_at,purge_at,upload_expires_at,debt_body_basis_id,content_kind)
 values(b.id,j.organization_id,p_request_id,j.id,j.leased_by,auth.uid(),j.capability_sha256,p.id,fp,bytes,j.organization_id::text||'/'||b.id::text||'/payload.json',stamp,deadline,
 deadline-make_interval(secs=>p.purge_margin_seconds),least(stamp+interval '5 minutes',deadline-make_interval(secs=>p.purge_margin_seconds)),b.id,'debt_body') returning * into a;
 insert into private.capital_public_payload_purge_queue(organization_id,allocation_id,next_check_at,effective_purge_at) values(j.organization_id,a.id,least(a.upload_expires_at,a.purge_at),a.purge_at);
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_debt_denied' using errcode='42501';end if;
 return private.capital_debt_body_dto_v1(j.organization_id,a.id,deadline,true)||jsonb_build_object('canonicalBody',c::text);
end; $$;

create function private.capital_debt_recipe_dto_v1(p_org uuid,p_recipe uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r private.capital_debt_recipes;s private.capital_debt_recipe_seals;components jsonb;
begin
 select * into strict r from private.capital_debt_recipes where organization_id=p_org and id=p_recipe;
 select * into strict s from private.capital_debt_recipe_seals where organization_id=p_org and recipe_id=r.id;
 select coalesce(jsonb_agg(jsonb_build_object('slot',slot,'id',reference_id,'version',version,'bodyFingerprint',body_fingerprint) order by component_no),'[]') into components from private.capital_debt_recipe_components where organization_id=p_org and recipe_id=r.id;
 return jsonb_build_object('schemaVersion','capital-debt-recipe-receipt.v1','state','ready','recipeId',r.id,'executionPlanTaskRunId',s.execution_plan_task_run_id,'executionPlanTaskId','M06','finalTaskId','C11',
 'jobId',r.job_id,'organizationId',p_org,'workId',r.work_id,'planId',r.plan_id,'planFingerprint',r.plan_fingerprint,'locale',r.locale,'asOfDate',r.as_of_date,
 'rendererVersion',r.renderer_version,'recipeFingerprint',s.recipe_fingerprint,'reconstructionFingerprint',s.reconstruction_fingerprint,
 'contextRetainedPayloadId',s.context_retained_payload_id,'operationalBudget',jsonb_build_object('schemaVersion',s.budget_version,'researchReservationVersion',s.research_reservation_version,'researchReservationMicroUsd',s.research_reservation_micro_usd,'maxExposureMicroUsd',s.effective_budget_micro_usd,'maxDispatches',s.effective_max_dispatches),'components',components,'expiresAt',r.expires_at);
end; $$;

-- Component hashes here are observed JS reconstruction identities. Physical
-- hashes are separate server-derived allocation hashes and storage proofs.
create function private.worker_finalize_capital_debt_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,
 p_context_retained_payload_id uuid,p_components jsonb,p_reconstruction_fingerprint text,
 p_prompt_fingerprint text,p_primary_request_fingerprint text,p_fallback_request_fingerprint text,
 p_operator_budget_micro_usd bigint,p_operator_max_dispatches integer,p_research_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 r private.capital_debt_recipes;s private.capital_debt_recipe_seals;a private.capital_public_payload_allocations;b private.capital_debt_body_bases;
 component jsonb;ordinal integer:=0;dep public.capital_project_artifacts;lic private.capital_public_delivery_licenses;deadline timestamptz;
 run uuid;fp text;expected uuid;expected_version integer;effective_budget bigint;effective_dispatches integer;research_reserve bigint;job_cost numeric;job_calls numeric;research_sources_wire text;research_fp text;
begin
 if p_research_status is null or p_research_status not in ('succeeded','partial') then raise exception 'capital_debt_research_status_invalid' using errcode='22023';end if;
 if p_operator_budget_micro_usd is null or p_operator_budget_micro_usd not between 1 and 950000 or p_operator_max_dispatches is null or p_operator_max_dispatches not between 1 and 2
 or jsonb_typeof(j.payload#>'{model_budget,max_cost_usd}') is distinct from 'number' or jsonb_typeof(j.payload#>'{model_budget,max_calls}') is distinct from 'number' then raise exception 'capital_debt_budget_invalid' using errcode='22023';end if;
 job_cost:=(j.payload#>>'{model_budget,max_cost_usd}')::numeric;job_calls:=(j.payload#>>'{model_budget,max_calls}')::numeric;
 if job_cost<=0 or job_calls<1 or job_calls<>trunc(job_calls) then raise exception 'capital_debt_budget_denied' using errcode='42501';end if;
 -- Fixed server reservation: 8*(USD0.005 Perplexity + USD0.020 OpenAI search).
 -- Revisions perform no new search. Keep the conservative initial reservation
 -- for frozen/official research until a durable research-cost ledger exists.
 research_reserve:=case when j.payload?'revision_of_artifact_id' then 0 else 200000 end;
 effective_budget:=least(950000,case when j.payload?'revision_of_artifact_id' then 850000 else 950000 end,floor(job_cost*1000000)::bigint)-research_reserve;
 effective_budget:=least(effective_budget,p_operator_budget_micro_usd);
 effective_dispatches:=least(2,job_calls::integer,p_operator_max_dispatches);
 if effective_budget<1 or effective_dispatches<1 then raise exception 'capital_debt_budget_denied' using errcode='42501';end if;
 if exists(select 1 from unnest(array[p_reconstruction_fingerprint,p_prompt_fingerprint,p_primary_request_fingerprint,p_fallback_request_fingerprint]) pin where pin is null or pin!~'^[a-f0-9]{64}$') or jsonb_typeof(p_components) is distinct from 'array' or jsonb_array_length(p_components) not between 7 and 1000 or octet_length(p_components::text)>262144 then raise exception 'capital_debt_recipe_invalid' using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-debt-recipe:'||j.organization_id::text||':'||p_recipe_id::text,0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 select * into r from private.capital_debt_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 if r.id is null or r.worker_account_id<>auth.uid() or r.human_subject_id<>j.authorization_subject_id or exists(select 1 from private.capital_body_invocation_inputs i where i.organization_id=j.organization_id and i.job_id=j.id) then raise exception 'capital_debt_denied' using errcode='42501';end if;
 select z.* into a from private.capital_public_retained_payloads p join private.capital_public_payload_allocations z on z.organization_id=p.organization_id and z.id=p.allocation_id where p.organization_id=j.organization_id and p.id=p_context_retained_payload_id and z.job_id=j.id and z.content_kind='debt_body';
 select * into b from private.capital_debt_body_bases where organization_id=j.organization_id and id=a.debt_body_basis_id;
 if b.recipe_id is distinct from r.id or b.kind is distinct from 'context' or a.payload_fingerprint<>r.context_fingerprint or not private.capital_body_physical_receipt_v1(j.organization_id,p_context_retained_payload_id) then raise exception 'capital_debt_context_denied' using errcode='42501';end if;
 -- Snapshot rows are immutable. Every required private slot must be present once;
 -- supplied IDs can only identify actual objects in this recipe's native context.
 if exists(select 1 from unnest(array['company','brief','institution','research','revision','execution_plan']) k where(select count(*) from jsonb_array_elements(p_components) x where x->>'slot'=k)<>1)
 then raise exception 'capital_debt_recipe_invalid' using errcode='22023';end if;
 if not exists(select 1 from jsonb_array_elements(p_components) x where x->>'slot'='source') then raise exception 'capital_debt_published_source_required' using errcode='42501';end if;
 -- This closed two-field ASCII/UUID object uses the exact historical JS
 -- stable wire. It is deliberately not generic SQL jsonb::text canonicalization.
 select '['||coalesce(string_agg((x.value->'id')::text,',' order by x.ordinality),'')||']' into research_sources_wire from jsonb_array_elements(p_components) with ordinality x(value,ordinality) where x.value->>'slot'='source';
 research_fp:=encode(extensions.digest('{"sourceIds":'||research_sources_wire||',"status":'||to_jsonb(p_research_status)::text||'}','sha256'),'hex');
 if not exists(select 1 from jsonb_array_elements(p_components) x where x->>'slot'='research' and x->>'bodyFingerprint'=research_fp) then raise exception 'capital_debt_research_pin_invalid' using errcode='22023';end if;
 fp:=encode(extensions.digest(jsonb_build_object('recipe',r.id,'context',r.context_fingerprint,'components',p_components,'reconstruction',p_reconstruction_fingerprint,'renderer',r.renderer_version,'prompt',p_prompt_fingerprint,'primaryRequest',p_primary_request_fingerprint,'fallbackRequest',p_fallback_request_fingerprint,'researchStatus',p_research_status,'originalAttempt',r.original_attempt,'budgetVersion','capital-debt-operational-budget.v1','researchReservationVersion','public-research-reservation.company-debt.v1','researchReservationMicroUsd',research_reserve,'effectiveBudgetMicroUsd',effective_budget,'effectiveMaxDispatches',effective_dispatches)::text,'sha256'),'hex');
 select * into s from private.capital_debt_recipe_seals where organization_id=j.organization_id and recipe_id=r.id;
 if s.id is not null then
 if s.context_retained_payload_id<>p_context_retained_payload_id or s.recipe_fingerprint<>fp or s.reconstruction_fingerprint<>p_reconstruction_fingerprint then raise exception 'capital_debt_recipe_conflict' using errcode='23505';end if;
 else
 for component in select value from jsonb_array_elements(p_components) loop
 ordinal:=ordinal+1;
 if jsonb_typeof(component) is distinct from 'object' or not(component?&array['slot','id','version','bodyFingerprint']) or component-array['slot','id','version','bodyFingerprint']<>'{}' or component->>'bodyFingerprint'!~'^[a-f0-9]{64}$' or jsonb_typeof(component->'version') is distinct from 'number' or(component->>'version')::numeric<>trunc((component->>'version')::numeric) or(component->>'version')::numeric<1 then raise exception 'capital_debt_recipe_invalid' using errcode='22023';end if;
 expected:=null;expected_version:=null;
 case component->>'slot'
 when 'company' then expected:=r.session_id;expected_version:=1;
 when 'brief' then expected:=r.brief_id;select brief_version into expected_version from public.capital_project_briefs where organization_id=j.organization_id and id=r.brief_id;
 when 'institution' then expected:=r.plan_id;select plan_version into expected_version from public.capital_project_plans where organization_id=j.organization_id and id=r.plan_id;
 when 'revision' then expected:=r.job_id;expected_version:=1;
 when 'research' then expected:=r.id;expected_version:=1;
 when 'execution_plan' then
 select * into dep from public.capital_project_artifacts where organization_id=j.organization_id and capital_project_id=r.work_id and id=(component->>'id')::uuid and status not in ('stale','superseded');
 if dep.id is null or dep.artifact_type<>'company_debt_execution_plan' or not exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id where tr.organization_id=j.organization_id and tr.id=dep.task_run_id and tr.processing_job_id=j.id and tr.status='succeeded' and pt.plan_id=r.plan_id and pt.task_id='M06') then raise exception 'capital_debt_execution_plan_denied' using errcode='42501';end if;
 if component->>'bodyFingerprint' is distinct from encode(extensions.digest('{"artifactFingerprint":'||to_jsonb(dep.artifact_fingerprint)::text||',"capitalArtifactId":'||to_jsonb(dep.id::text)::text||',"taskId":"M06","taskRunId":'||to_jsonb(dep.task_run_id::text)::text||'}','sha256'),'hex') then raise exception 'capital_debt_execution_plan_pin_invalid' using errcode='22023';end if;
 if not exists(select 1 from private.capital_debt_task_projections bridge join private.capital_public_retained_payloads physical on physical.organization_id=bridge.organization_id and physical.id=bridge.derived_retained_payload_id join private.capital_public_payload_allocations allocation on allocation.organization_id=physical.organization_id and allocation.id=physical.allocation_id where bridge.organization_id=j.organization_id and bridge.recipe_id=r.id and bridge.capital_artifact_id=dep.id and bridge.artifact_fingerprint=dep.artifact_fingerprint and private.capital_body_physical_receipt_v1(j.organization_id,physical.id) and private.capital_debt_allocation_deadline_v1(j.organization_id,allocation.id,j.authorization_subject_id) is not null) then raise exception 'capital_debt_execution_plan_body_denied' using errcode='42501';end if;
 run:=dep.task_run_id;expected:=dep.id;expected_version:=dep.artifact_version;
 when 'source' then
 select l.* into lic from private.capital_public_delivery_licenses l join private.capital_public_deliveries d on d.organization_id=l.organization_id and d.id=l.delivery_id join private.capital_public_input_snapshots snap on snap.organization_id=d.organization_id and snap.id=d.capture_id where l.organization_id=j.organization_id and l.delivery_id=(component->>'id')::uuid and snap.job_id=j.id;
 select z.* into a from private.capital_public_retained_payloads p join private.capital_public_payload_allocations z on z.organization_id=p.organization_id and z.id=p.allocation_id where p.organization_id=j.organization_id and z.job_id=j.id and z.content_kind='public_source' and z.license_id=lic.id order by p.created_at limit 1;
 if lic.id is null or a.id is null or not private.capital_body_physical_receipt_v1(j.organization_id,(select id from private.capital_public_retained_payloads where organization_id=j.organization_id and allocation_id=a.id)) or private.capital_public_retention_deadline_v1(lic.id,j.organization_id,a.retained_at,a.policy_id) is null then raise exception 'capital_debt_source_denied' using errcode='42501';end if;
 expected:=lic.delivery_id;expected_version:=1;
 else raise exception 'capital_debt_recipe_invalid' using errcode='22023';end case;
 if expected is distinct from (component->>'id')::uuid or expected_version is distinct from(component->>'version')::integer or (component->>'slot'<>'source' and(component?'licenseId' or component?'retainedPayloadId')) then raise exception 'capital_debt_component_denied' using errcode='42501';end if;
 insert into private.capital_debt_recipe_components(organization_id,work_id,recipe_id,component_no,slot,reference_id,version,body_fingerprint,retained_payload_id,license_id,dependency_artifact_id)
 values(j.organization_id,r.work_id,r.id,ordinal,component->>'slot',expected,expected_version,component->>'bodyFingerprint',case when component->>'slot'='source' then(select id from private.capital_public_retained_payloads where organization_id=j.organization_id and allocation_id=a.id) end,case when component->>'slot'='source' then lic.id end,case when component->>'slot'='execution_plan' then dep.id end);
 end loop;
 deadline:=private.capital_debt_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 if deadline is null then raise exception 'capital_debt_denied' using errcode='42501';end if;
 if run is null then raise exception 'capital_debt_execution_plan_denied' using errcode='42501';end if;
 insert into private.capital_debt_recipe_seals(organization_id,work_id,recipe_id,execution_plan_task_run_id,context_retained_payload_id,recipe_fingerprint,reconstruction_fingerprint,prompt_fingerprint,primary_request_fingerprint,fallback_request_fingerprint,research_status,budget_version,research_reservation_version,research_reservation_micro_usd,effective_budget_micro_usd,effective_max_dispatches,sealed_at)
 values(j.organization_id,r.work_id,r.id,run,p_context_retained_payload_id,fp,p_reconstruction_fingerprint,p_prompt_fingerprint,p_primary_request_fingerprint,p_fallback_request_fingerprint,p_research_status,'capital-debt-operational-budget.v1','public-research-reservation.company-debt.v1',research_reserve,effective_budget,effective_dispatches,clock_timestamp()) returning * into s;
 end if;
 if private.capital_debt_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_debt_denied' using errcode='42501';end if;
 return private.capital_debt_recipe_dto_v1(j.organization_id,r.id);
end; $$;

create function private.require_capital_debt_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)
returns private.capital_debt_recipes language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_debt_recipes;s private.capital_debt_recipe_seals;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('capital-debt-recipe:'||j.organization_id::text||':'||p_recipe_id::text,0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 select * into r from private.capital_debt_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 select * into s from private.capital_debt_recipe_seals where organization_id=j.organization_id and recipe_id=r.id;
 if r.id is null or s.id is null or r.worker_account_id<>auth.uid() or r.human_subject_id<>j.authorization_subject_id
 or private.capital_debt_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null
 or not private.capital_body_physical_receipt_v1(j.organization_id,s.context_retained_payload_id)
 or not private.capital_body_retention_healthy_v1(r.retention_policy_id,j.organization_id,(select allocation_id from private.capital_public_retained_payloads where organization_id=j.organization_id and id=s.context_retained_payload_id))
 or not exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id where tr.organization_id=j.organization_id and tr.id=s.execution_plan_task_run_id and tr.processing_job_id=j.id and tr.status='succeeded' and pt.plan_id=r.plan_id and pt.task_id='M06')
 or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_debt_recipe_denied' using errcode='42501';end if;
 return r;
end; $$;
create function private.worker_revalidate_capital_debt_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare r private.capital_debt_recipes;begin r:=private.require_capital_debt_recipe_v1(p_job_id,p_capability_token,p_recipe_id);return private.capital_debt_recipe_dto_v1(r.organization_id,r.id);end$$;

create function private.capital_debt_storage_allowed_v1(p_allocation uuid,p_mode text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;headers jsonb;capability text;j public.processing_jobs;
begin
 if auth.uid() is null or p_mode is distinct from 'upload' or not private.capital_public_capture_bucket_safe_v1() then return false;end if;
 begin headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;exception when invalid_text_representation then return false;end;
 if jsonb_typeof(headers->'x-offroad-job-id') is distinct from 'string' or jsonb_typeof(headers->'x-offroad-capability') is distinct from 'string' then return false;end if;
 select * into a from private.capital_public_payload_allocations where id=p_allocation and content_kind='debt_body';
 if a.id is null or headers->>'x-offroad-job-id' is distinct from a.job_id::text or(headers?'x-offroad-workspace' and headers->>'x-offroad-workspace' is distinct from a.organization_id::text) then return false;end if;
 capability:=headers->>'x-offroad-capability';
 if length(capability) not between 1 and 4096 or extensions.digest(capability,'sha256') is distinct from a.capability_sha256 or not private.capital_public_allocation_job_current_v1(a.id) then return false;end if;
 j:=private.capital_public_capture_job_v1(a.job_id,capability);
 if a.upload_expires_at<=clock_timestamp() or exists(select 1 from private.capital_public_retained_payloads where(organization_id,allocation_id)=(a.organization_id,a.id)) or private.capital_debt_allocation_deadline_v1(a.organization_id,a.id,j.authorization_subject_id) is null then return false;end if;
 perform private.require_capital_body_retention_ready_v1(a.policy_id,a.organization_id,a.id);
 return private.capital_public_capture_clock_current_v1(j.id,capability);
exception when insufficient_privilege then return false;
end$$;
alter function private.worker_can_access_capital_public_payload_v1(text,text,text) rename to worker_can_access_capital_public_payload_pre_debt_v1;
create function private.worker_can_access_capital_public_payload_v1(p_bucket text,p_path text,p_mode text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;
begin
 -- Purge resolves the genuine leased janitor scope before kind dispatch.
 if p_mode in('purge','purge_select') then return private.worker_can_access_capital_public_payload_pre_debt_v1(p_bucket,p_path,p_mode);end if;
 select * into a from private.capital_public_payload_allocations where bucket_id=p_bucket and object_path=p_path;
 if a.content_kind is distinct from 'debt_body' then return private.worker_can_access_capital_public_payload_pre_debt_v1(p_bucket,p_path,p_mode);end if;
 if exists(select 1 from storage.objects o where o.bucket_id=p_bucket and o.name=p_path and((to_jsonb(o)->>'is_versioned')::boolean is true or(to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null)) then return false;end if;
 return private.capital_debt_storage_allowed_v1(a.id,p_mode);
end$$;
revoke all on function private.capital_debt_storage_allowed_v1(uuid,text),private.worker_can_access_capital_public_payload_pre_debt_v1(text,text,text) from public,anon,authenticated,service_role;
revoke all on function private.worker_can_access_capital_public_payload_v1(text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_can_access_capital_public_payload_v1(text,text,text) to authenticated;
-- Policy expressions retain function OIDs across RENAME. Rebind them to the
-- current dispatch rather than granting clients the historical implementation.
do $$declare p record;ddl text;begin
 for p in select * from pg_policies where schemaname='storage' and tablename='objects' and(coalesce(qual,'') like '%worker_can_access_capital_public_payload_pre_debt_v1%' or coalesce(with_check,'') like '%worker_can_access_capital_public_payload_pre_debt_v1%') loop
 ddl:=format('alter policy %I on storage.objects',p.policyname);
 if p.qual is not null then ddl:=ddl||' using ('||replace(p.qual,'worker_can_access_capital_public_payload_pre_debt_v1','worker_can_access_capital_public_payload_v1')||')';end if;
 if p.with_check is not null then ddl:=ddl||' with check ('||replace(p.with_check,'worker_can_access_capital_public_payload_pre_debt_v1','worker_can_access_capital_public_payload_v1')||')';end if;
 execute ddl;
 end loop;
end$$;

-- Private draft is assembled with ledger, physical TaskSpec producer and final writer.
do $$declare t text;cmd text;begin foreach t in array array['capital_debt_recipes','capital_debt_body_bases','capital_debt_recipe_components','capital_debt_recipe_seals'] loop
 execute format('alter table private.%I enable row level security',t);execute format('alter table private.%I force row level security',t);execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 foreach cmd in array array['select','insert','update','delete'] loop execute format('create policy %I on private.%I as restrictive for %s to anon,authenticated %s',t||'_deny_'||cmd,t,cmd,case when cmd='insert' then 'with check(false)' when cmd='update' then 'using(false) with check(false)' else 'using(false)' end);end loop;
 execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',t||'_no_truncate',t);
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated_at',t);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_source_version_mutation_v1()',t||'_immutable',t);
 execute format('create trigger %I after insert on private.%I for each row execute function private.capture_identity_audit_v1()',t||'_audit',t);
 end loop;end$$;
revoke all on function private.capital_debt_base_authority_fingerprint_v1(uuid,uuid,uuid,uuid,uuid,uuid,timestamptz),private.capital_debt_recipe_deadline_v1(uuid,uuid,uuid),private.worker_prepare_capital_debt_recipe_v1(uuid,text) from public,anon,authenticated,service_role;

-- DRAFT, not applied. Compile after the real debt recipe/closure helpers, before
-- physical parsed/final writers. M06 is an already succeeded physical execution
-- plan, not the paid invocation. This ledger never changes any TaskRun status.
set search_path='';
create table private.capital_debt_operations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,job_id uuid not null,recipe_id uuid not null,execution_plan_task_run_id uuid not null,
 worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 root_attempt_id uuid not null,renderer_version text not null check(renderer_version='capital-public-task-renderer.company-debt.v1'),
 max_dispatches integer not null default 2 check(max_dispatches between 1 and 2),max_exposure_micro_usd bigint not null default 950000 check(max_exposure_micro_usd between 1 and 950000),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,work_id,job_id,id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_debt_recipes(organization_id,work_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,execution_plan_task_run_id) references public.capital_project_task_runs(organization_id,id)
);
create table private.capital_debt_gateway_attempts (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,
 operation_id uuid not null,recipe_id uuid not null,invocation_id uuid not null,worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 previous_attempt_id uuid,root_attempt_id uuid not null,used_provider_fallback boolean not null,
 request_fingerprint text not null check(request_fingerprint~'^[a-f0-9]{64}$'),input_fingerprint text not null check(input_fingerprint~'^[a-f0-9]{64}$'),prompt_fingerprint text not null check(prompt_fingerprint~'^[a-f0-9]{64}$'),
 attempt_metadata jsonb not null,route jsonb not null,resources text[] not null check(resources=array['inference','prompt_cache','schema_cache']::text[]),
 purpose text not null check(purpose='case_analysis'),model text not null check(model in ('claude-sonnet-5','gpt-5.6-terra')),
 processing_decision_id uuid not null,allowed boolean not null,renderer_policy_fingerprint text not null check(renderer_policy_fingerprint~'^[a-f0-9]{64}$'),
 reservation_micro_usd bigint not null check(reservation_micro_usd between 0 and 950000),server_reservation_micro_usd bigint not null check(server_reservation_micro_usd between reservation_micro_usd and 950000),
 captured_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,invocation_id),unique(organization_id,operation_id,used_provider_fallback),unique(organization_id,work_id,job_id,operation_id,id),
 foreign key(organization_id,work_id,job_id,operation_id) references private.capital_debt_operations(organization_id,work_id,job_id,id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_debt_recipes(organization_id,work_id,id),
 foreign key(organization_id,processing_decision_id) references private.processing_eligibility_decisions(organization_id,id),
 foreign key(organization_id,previous_attempt_id) references private.capital_debt_gateway_attempts(organization_id,id),
 foreign key(organization_id,root_attempt_id) references private.capital_debt_gateway_attempts(organization_id,id) deferrable initially deferred,
 check((not used_provider_fallback and previous_attempt_id is null and root_attempt_id=id and model='claude-sonnet-5')
 or(used_provider_fallback and previous_attempt_id is not null and root_attempt_id<>id and model='gpt-5.6-terra'))
);
alter table private.capital_debt_operations add constraint capital_debt_operation_root_fk
 foreign key(organization_id,work_id,job_id,id,root_attempt_id) references private.capital_debt_gateway_attempts(organization_id,work_id,job_id,operation_id,id) deferrable initially deferred;
create table private.capital_debt_input_dispatches (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,
 operation_id uuid not null,attempt_id uuid not null,invocation_id uuid not null,dispatch_claim_id uuid not null default gen_random_uuid(),
 worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 request_fingerprint text not null check(request_fingerprint~'^[a-f0-9]{64}$'),reservation_micro_usd bigint not null,server_reservation_micro_usd bigint not null,
 claimed_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,attempt_id),unique(organization_id,invocation_id),unique(organization_id,dispatch_claim_id),
 unique(organization_id,work_id,job_id,operation_id,attempt_id,id),
 foreign key(organization_id,work_id,job_id,operation_id,attempt_id) references private.capital_debt_gateway_attempts(organization_id,work_id,job_id,operation_id,id),
 check(reservation_micro_usd between 0 and 950000 and server_reservation_micro_usd between reservation_micro_usd and 950000)
);
create table private.capital_debt_attempt_outcomes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,
 operation_id uuid not null,attempt_id uuid not null,input_receipt_id uuid not null,invocation_id uuid not null,
 worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 observation jsonb not null,outcome text not null check(outcome in ('accepted','invalid_output','provider_error','timeout','refusal')),
 outcome_fingerprint text not null check(outcome_fingerprint~'^[a-f0-9]{64}$'),cost_micro_usd bigint,server_exposure_micro_usd bigint not null,
 recorded_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,attempt_id),unique(organization_id,input_receipt_id),unique(organization_id,invocation_id),
 foreign key(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id) references private.capital_debt_input_dispatches(organization_id,work_id,job_id,operation_id,attempt_id,id),
 check(cost_micro_usd is null or cost_micro_usd between 0 and 9007199254740991),check(server_exposure_micro_usd between 0 and 9007199254740991)
);
create unique index capital_debt_outcomes_one_accepted on private.capital_debt_attempt_outcomes(organization_id,operation_id) where outcome='accepted';
create table private.capital_debt_accepted_invocations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,recipe_id uuid not null,
 input_receipt_id uuid not null,invocation_id uuid not null,output_fingerprint text not null check(output_fingerprint~'^[a-f0-9]{64}$'),accepted_identity jsonb not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,input_receipt_id),unique(organization_id,recipe_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_debt_recipes(organization_id,work_id,id),
 foreign key(organization_id,input_receipt_id) references private.capital_debt_input_dispatches(organization_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id)
);
-- Cover every composite FK and principal lookup; append-only audit has no raw bodies.
create index capital_debt_operation_recipe_idx on private.capital_debt_operations(organization_id,work_id,recipe_id);
create index capital_debt_operation_job_idx on private.capital_debt_operations(organization_id,job_id);
create index capital_debt_operation_execution_plan_idx on private.capital_debt_operations(organization_id,execution_plan_task_run_id);
create index capital_debt_operation_root_idx on private.capital_debt_operations(organization_id,work_id,job_id,id,root_attempt_id);
create index capital_debt_attempt_op_idx on private.capital_debt_gateway_attempts(organization_id,work_id,job_id,operation_id);
create index capital_debt_attempt_recipe_idx on private.capital_debt_gateway_attempts(organization_id,work_id,recipe_id);
create index capital_debt_attempt_decision_idx on private.capital_debt_gateway_attempts(organization_id,processing_decision_id);
create index capital_debt_attempt_previous_idx on private.capital_debt_gateway_attempts(organization_id,previous_attempt_id);
create index capital_debt_attempt_root_idx on private.capital_debt_gateway_attempts(organization_id,root_attempt_id);
create index capital_debt_dispatch_attempt_idx on private.capital_debt_input_dispatches(organization_id,work_id,job_id,operation_id,attempt_id);
create index capital_debt_outcome_input_idx on private.capital_debt_attempt_outcomes(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id);
create index capital_debt_accepted_recipe_idx on private.capital_debt_accepted_invocations(organization_id,work_id,recipe_id);
create index capital_debt_accepted_job_idx on private.capital_debt_accepted_invocations(organization_id,job_id);
do $$declare t text;begin
 foreach t in array array['capital_debt_operations','capital_debt_gateway_attempts','capital_debt_input_dispatches','capital_debt_attempt_outcomes','capital_debt_accepted_invocations'] loop
 execute format('alter table private.%I enable row level security',t);execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 execute format('create policy deny_clients_select on private.%I as restrictive for select to anon,authenticated using(false)',t);
 execute format('create policy deny_clients_insert on private.%I as restrictive for insert to anon,authenticated with check(false)',t);
 execute format('create policy deny_clients_update on private.%I as restrictive for update to anon,authenticated using(false) with check(false)',t);
 execute format('create policy deny_clients_delete on private.%I as restrictive for delete to anon,authenticated using(false)',t);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_source_version_mutation_v1()',t||'_immutable',t);
 execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',t||'_no_truncate',t);
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated_at',t);
 execute format('create trigger %I after insert or update or delete on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 if t<>'capital_debt_accepted_invocations' then
 execute format('create index %I on private.%I(worker_account_id)',t||'_worker_idx',t);execute format('create index %I on private.%I(human_subject_id)',t||'_subject_idx',t);
 end if;
 end loop;
end;$$;

-- Separate closed registry; existing contribution fingerprint function is unchanged.
create function private.capital_debt_attempt_outcome_fingerprint_v1(p_outcome jsonb)
returns text language plpgsql immutable security definer set search_path='' as $$
declare keys text[]:=array['schemaVersion','fingerprintVersion','outcomeFingerprint','invocationId','task','provider','configuredModel','schemaName',
 'adapterInputVersion','requestFingerprint','inputFingerprint','promptFingerprint','previousInvocationId','retryOrdinal','isSameModelRepair',
 'usedProviderFallback','processingDecisionId','inputAttestationReceiptId','fromCassette','outcome','failureCode','outputFingerprintVersion',
 'outputFingerprint','reportedModel','validationIssueCodeFingerprint','reservationMicroUsd','costMicroUsd','exposureMicroUsd','costStatus',
 'inputTokens','outputTokens','cachedInputTokens','latencyMillis'];
 key text;number_value numeric;wire text;tuple jsonb;kind text;status text;
begin
 if jsonb_typeof(p_outcome) is distinct from 'object' or octet_length(p_outcome::text)>8192
 or not(p_outcome?&keys) or p_outcome-keys<>'{}'::jsonb
 or p_outcome->>'schemaVersion' is distinct from 'gateway-attempt-outcome.v1'
 or p_outcome->>'fingerprintVersion' is distinct from 'gateway-attempt-outcome-fingerprint.v1'
 or p_outcome->>'task' is distinct from 'company_debt_view'
 or p_outcome->>'provider' is distinct from (case when p_outcome->>'configuredModel'='claude-sonnet-5' then 'anthropic' else 'openai' end)
 or p_outcome->>'configuredModel' is null or p_outcome->>'configuredModel' not in ('claude-sonnet-5','gpt-5.6-terra')
 or p_outcome->>'schemaName' is distinct from 'company_debt_diagnostic_v1'
 or p_outcome->>'adapterInputVersion' is distinct from 'gateway-adapter-input.v1' then
 raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 foreach key in array array['outcomeFingerprint','requestFingerprint','inputFingerprint','promptFingerprint'] loop
 if jsonb_typeof(p_outcome->key) is distinct from 'string' or p_outcome->>key !~ '^[a-f0-9]{64}$' then
 raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;end loop;
 foreach key in array array['invocationId','processingDecisionId','inputAttestationReceiptId'] loop
 if jsonb_typeof(p_outcome->key) is distinct from 'string' or p_outcome->>key !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
 raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;end loop;
 if p_outcome->'previousInvocationId'<>'null'::jsonb and(jsonb_typeof(p_outcome->'previousInvocationId') is distinct from 'string'
 or p_outcome->>'previousInvocationId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') then
 raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 foreach key in array array['isSameModelRepair','usedProviderFallback','fromCassette'] loop
 if jsonb_typeof(p_outcome->key) is distinct from 'boolean' then raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;end loop;
 if p_outcome->>'isSameModelRepair'<>'false' or p_outcome->>'fromCassette'<>'false' or p_outcome->>'retryOrdinal'<>'0'
 or((p_outcome->>'usedProviderFallback')::boolean and p_outcome->'previousInvocationId'='null'::jsonb)
 or(not(p_outcome->>'usedProviderFallback')::boolean and p_outcome->'previousInvocationId'<>'null'::jsonb) then
 raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 foreach key in array array['retryOrdinal','reservationMicroUsd','costMicroUsd','exposureMicroUsd','inputTokens','outputTokens','cachedInputTokens','latencyMillis'] loop
 if p_outcome->key='null'::jsonb and key in ('costMicroUsd','inputTokens','outputTokens','cachedInputTokens') then continue;end if;
 if jsonb_typeof(p_outcome->key) is distinct from 'number' then raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 number_value:=(p_outcome->>key)::numeric;
 if number_value<0 or number_value>9007199254740991 or trunc(number_value)<>number_value or scale(number_value)<>0 then raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 end loop;
 kind:=p_outcome->>'outcome';status:=p_outcome->>'costStatus';
 if kind is null or kind not in ('accepted','invalid_output','provider_error','timeout','refusal') or status is null or status not in ('measured','unknown') then
 raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 if(status='unknown' and exists(select 1 from unnest(array['costMicroUsd','inputTokens','outputTokens','cachedInputTokens']) k where p_outcome->k<>'null'::jsonb))
 or(status='measured' and exists(select 1 from unnest(array['costMicroUsd','inputTokens','outputTokens','cachedInputTokens']) k where p_outcome->k='null'::jsonb))
 or(kind in ('provider_error','timeout') and status<>'unknown')
 or(p_outcome->>'exposureMicroUsd')::numeric<>greatest((p_outcome->>'reservationMicroUsd')::numeric,coalesce((p_outcome->>'costMicroUsd')::numeric,(p_outcome->>'reservationMicroUsd')::numeric)) then
 raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 if kind='accepted' then
 if p_outcome->'failureCode'<>'null'::jsonb or p_outcome->>'outputFingerprintVersion' is distinct from 'gateway-parsed-output.v1'
 or jsonb_typeof(p_outcome->'outputFingerprint') is distinct from 'string' or p_outcome->>'outputFingerprint'!~'^[a-f0-9]{64}$'
 or p_outcome->>'reportedModel' is distinct from p_outcome->>'configuredModel' or p_outcome->'validationIssueCodeFingerprint'<>'null'::jsonb then
 raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 else
 if p_outcome->'outputFingerprintVersion'<>'null'::jsonb or p_outcome->'outputFingerprint'<>'null'::jsonb or p_outcome->'reportedModel'<>'null'::jsonb
 or jsonb_typeof(p_outcome->'failureCode') is distinct from 'string'
 or(kind='invalid_output' and p_outcome->>'failureCode' not in ('schema_invalid','deterministic_invalid','output_truncated'))
 or(kind='provider_error' and p_outcome->>'failureCode'<>'provider_failure')
 or(kind='timeout' and p_outcome->>'failureCode'<>'provider_timeout')
 or(kind='refusal' and p_outcome->>'failureCode'<>'provider_refusal') then raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 if kind='invalid_output' then
 if p_outcome->'validationIssueCodeFingerprint'<>'null'::jsonb and(jsonb_typeof(p_outcome->'validationIssueCodeFingerprint') is distinct from 'string'
 or p_outcome->>'validationIssueCodeFingerprint'!~'^[a-f0-9]{64}$') then raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 if p_outcome->>'failureCode' in ('schema_invalid','deterministic_invalid') and p_outcome->'validationIssueCodeFingerprint'='null'::jsonb then
 raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 elsif p_outcome->'validationIssueCodeFingerprint'<>'null'::jsonb then raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 end if;
 tuple:=jsonb_build_array(p_outcome->'fingerprintVersion',p_outcome->'invocationId',p_outcome->'task',p_outcome->'provider',p_outcome->'configuredModel',
 p_outcome->'schemaName',p_outcome->'adapterInputVersion',p_outcome->'requestFingerprint',p_outcome->'inputFingerprint',p_outcome->'promptFingerprint',
 p_outcome->'previousInvocationId',p_outcome->'retryOrdinal',p_outcome->'isSameModelRepair',p_outcome->'usedProviderFallback',p_outcome->'processingDecisionId',
 p_outcome->'inputAttestationReceiptId',p_outcome->'fromCassette',p_outcome->'outcome',p_outcome->'failureCode',p_outcome->'outputFingerprintVersion',
 p_outcome->'outputFingerprint',p_outcome->'reportedModel',p_outcome->'validationIssueCodeFingerprint',p_outcome->'reservationMicroUsd',p_outcome->'costMicroUsd',
 p_outcome->'exposureMicroUsd',p_outcome->'costStatus',p_outcome->'inputTokens',p_outcome->'outputTokens',p_outcome->'cachedInputTokens',p_outcome->'latencyMillis');
 select '['||string_agg(case when jsonb_typeof(x.value)='number' then ((x.value::text)::numeric)::bigint::text else x.value::text end,',' order by x.ordinality)||']'
 into wire from jsonb_array_elements(tuple) with ordinality x(value,ordinality);
 return encode(extensions.digest(wire,'sha256'),'hex');
end; $$;

-- Closed ASCII registry, independently verified against shared Node serialization.
-- Schema pin refers to actual logical Zod schema; physical SHA remains separate.
create function private.capital_debt_dispatch_policy_v1(p_model text,p_input_bytes bigint)
returns jsonb language plpgsql immutable security definer set search_path='' as $$
declare tuple jsonb;wire text;pricing_wire text;tokens bigint;bound bigint;provider text;output_rate bigint;
begin
 if p_input_bytes is null or p_input_bytes not between 1 and 100000 or p_model is null or p_model not in ('claude-sonnet-5','gpt-5.6-terra') then raise exception 'capital_debt_policy_invalid' using errcode='22023';end if;
 provider:=case when p_model='claude-sonnet-5' then 'anthropic' else 'openai' end;
 output_rate:=case when p_model='claude-sonnet-5' then 10000000 else 12000000 end;
 pricing_wire:=case when p_model='claude-sonnet-5' then '{"cacheWrite":2.5,"cachedInput":0.2,"input":2,"longContext":null,"output":10}'
 else '{"cacheWrite":2.5,"cachedInput":0.2,"input":2,"longContext":{"aboveInputTokens":272000,"inputMultiplier":2,"outputMultiplier":1.5},"output":12}' end;
 tuple:=jsonb_build_array('capital-debt-dispatch-policy.v1','capital-public-task-renderer.company-debt.v1',provider,p_model,'medium',
 '9199aef1808e15ec507b493d078ef3d95c7953c386a3df79eff132654eb06e0c',2820,
 '0f3a7e83259ae20672405d757fb3c4237467c9e21d5befffa57282f93d58893e',
 'company-debt-public-sources-1600.v1',8000,240000,
 'company-debt-diagnostic-v1');
 select '['||string_agg(x.value::text,',' order by x.ordinality)||','||pricing_wire||']' into wire from jsonb_array_elements(tuple) with ordinality x(value,ordinality);
 -- Logical schema (6146B) exceeds strict OpenAI schema (4432B). Reserve the
 -- larger schema on either route, plus fixed framing and 10 percent headroom.
 tokens:=100000+2820+6146+1024;
 bound:=ceil((tokens::numeric*2500000+8000::numeric*output_rate)*11/10000000)::bigint;
 return jsonb_build_object('fingerprint',encode(extensions.digest(wire,'sha256'),'hex'),'serverBoundMicroUsd',bound);
end;$$;

create function private.lock_capital_debt_operation_v1(p_org uuid,p_recipe uuid)
returns void language plpgsql security definer set search_path='' as $$begin
 if not pg_try_advisory_xact_lock(hashtextextended('capital-debt-operation:'||p_org::text||':'||p_recipe::text,0)) then
 raise exception 'capital_capture_retry' using errcode='40001';end if;
end;$$;
create function private.capital_debt_attempt_assurances_current_v1(p_job public.processing_jobs,p_attempt private.capital_debt_gateway_attempts)
returns void language plpgsql security definer set search_path='' as $$
declare decision_row private.processing_eligibility_decisions;assurance_row private.provider_processing_assurances;
 assurance_uuid uuid;seen text[]:='{}';matches integer;
begin
 if p_attempt.organization_id<>p_job.organization_id or p_attempt.job_id<>p_job.id or not p_attempt.allowed
 or p_attempt.worker_account_id<>auth.uid() or p_attempt.human_subject_id<>p_job.authorization_subject_id then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock_shared(hashtextextended('provider-processing-assurances',0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 select * into decision_row from private.processing_eligibility_decisions where organization_id=p_job.organization_id and job_id=p_job.id and id=p_attempt.processing_decision_id;
 if decision_row.id is null or not decision_row.allowed or decision_row.route is distinct from p_attempt.route
 or decision_row.classification is distinct from 'restricted' or decision_row.purpose is distinct from 'case_analysis'
 or decision_row.policy_version is distinct from 'offroad-provider-retention-v2' or decision_row.resources is distinct from p_attempt.resources
 or cardinality(decision_row.assurance_ids)<>3 or(select count(distinct x) from unnest(decision_row.assurance_ids)x)<>3 then
 raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 for assurance_uuid in select x from unnest(decision_row.assurance_ids)x order by x loop
 begin select * into assurance_row from private.provider_processing_assurances where id=assurance_uuid for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001';end;
 if assurance_row.id is null or assurance_row.revoked_at is not null or assurance_row.reviewed_at>clock_timestamp()
 or assurance_row.valid_through<=clock_timestamp() or assurance_row.provider is distinct from p_attempt.route->>'provider'
 or assurance_row.account_ref is distinct from p_attempt.route->>'accountRef' or assurance_row.project_ref is distinct from p_attempt.route->>'projectRef'
 or assurance_row.credential_binding is distinct from p_attempt.route->>'credentialBinding' or assurance_row.endpoint is distinct from p_attempt.route->>'endpoint'
 or assurance_row.region is distinct from p_attempt.route->>'region' or(assurance_row.document->'models' ? p_attempt.model)is distinct from true
 or assurance_row.resource not in ('inference','prompt_cache','schema_cache') or assurance_row.resource=any(seen)
 or assurance_row.document->>'eligibility' is distinct from 'supported' or assurance_row.document->>'trainingUse' is distinct from 'prohibited'
 or(assurance_row.document->'purposes' ? 'case_analysis')is distinct from true or(assurance_row.document->'classifications' ? 'restricted')is distinct from true
 or(assurance_row.document->'rights' ? 'process')is distinct from true then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 select count(*) into matches from private.provider_processing_assurances a where a.revoked_at is null
 and(a.provider,a.account_ref,a.project_ref,a.credential_binding,a.endpoint,a.region,a.resource)
 is not distinct from(assurance_row.provider,assurance_row.account_ref,assurance_row.project_ref,assurance_row.credential_binding,assurance_row.endpoint,assurance_row.region,assurance_row.resource)
 and a.document->'models' ? p_attempt.model;
 if matches<>1 then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 seen:=array_append(seen,assurance_row.resource);
 end loop;
end;$$;
create function private.capital_debt_attempt_current_v1(p_job_id uuid,p_capability_token text,p_attempt private.capital_debt_gateway_attempts)
returns private.capital_debt_recipes language plpgsql security definer set search_path='' as $$
declare recipe private.capital_debt_recipes;job public.processing_jobs;op private.capital_debt_operations;seal private.capital_debt_recipe_seals;prior private.capital_debt_gateway_attempts;
begin
 recipe:=private.require_capital_debt_recipe_v1(p_job_id,p_capability_token,p_attempt.recipe_id);
 if exists(select 1 from private.capital_debt_quality_failures where organization_id=recipe.organization_id and recipe_id=recipe.id) or exists(select 1 from private.capital_debt_execution_failures where organization_id=recipe.organization_id and recipe_id=recipe.id) then raise exception 'capital_debt_execution_failed_terminal' using errcode='42501';end if;
 job:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 perform private.lock_capital_debt_operation_v1(recipe.organization_id,recipe.id);
 select * into op from private.capital_debt_operations where organization_id=recipe.organization_id and id=p_attempt.operation_id;
 select * into seal from private.capital_debt_recipe_seals where organization_id=recipe.organization_id and recipe_id=recipe.id;
 if op.id is null or seal.recipe_id is null or p_attempt.job_id<>recipe.job_id or p_attempt.work_id<>recipe.work_id
 or p_attempt.worker_account_id<>auth.uid() or p_attempt.human_subject_id<>job.authorization_subject_id
 or op.recipe_id<>recipe.id or op.job_id<>job.id or op.worker_account_id<>auth.uid() or op.human_subject_id<>job.authorization_subject_id
 or op.execution_plan_task_run_id<>seal.execution_plan_task_run_id or op.root_attempt_id<>p_attempt.root_attempt_id
 or p_attempt.input_fingerprint<>seal.reconstruction_fingerprint or p_attempt.prompt_fingerprint<>seal.prompt_fingerprint
 or p_attempt.request_fingerprint<>(case when p_attempt.used_provider_fallback then seal.fallback_request_fingerprint else seal.primary_request_fingerprint end) then
 raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 if not exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt
 on(pt.organization_id,pt.id)=(tr.organization_id,tr.plan_task_id)
 where tr.organization_id=recipe.organization_id and tr.id=seal.execution_plan_task_run_id
 and tr.capital_project_id=recipe.work_id and tr.plan_id=recipe.plan_id and tr.status='succeeded' and pt.task_id='M06') then
 raise exception 'capital_debt_execution_plan_denied' using errcode='42501';end if;
 if p_attempt.previous_attempt_id is not null then
 select * into prior from private.capital_debt_gateway_attempts where organization_id=recipe.organization_id and id=p_attempt.previous_attempt_id;
 if prior.id is null or prior.operation_id<>op.id or prior.used_provider_fallback or prior.root_attempt_id<>p_attempt.root_attempt_id
 or prior.worker_account_id<>auth.uid() or prior.human_subject_id<>job.authorization_subject_id then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 if prior.allowed then
 perform private.capital_debt_attempt_assurances_current_v1(job,prior);
 if not exists(select 1 from private.capital_debt_attempt_outcomes o where o.organization_id=recipe.organization_id and o.attempt_id=prior.id and o.outcome<>'accepted') then
 raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 end if;
 end if;
 if p_attempt.allowed then perform private.capital_debt_attempt_assurances_current_v1(job,p_attempt);end if;
 return recipe;
end;$$;

create function private.capital_debt_attempt_dto_v1(p_attempt private.capital_debt_gateway_attempts,p_replayed boolean)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion','capital-body-processing-decision.v2','allowed',p_attempt.allowed,'policyVersion',d.policy_version,
 'assuranceId',null,'assuranceIds',to_jsonb(d.assurance_ids),'decisionId',d.id,'classification',d.classification,'reasons',to_jsonb(d.reasons),
 'attemptReceiptId',p_attempt.id,'invocationId',p_attempt.invocation_id,'requestFingerprint',p_attempt.request_fingerprint,
 'eligibilityFingerprint',encode(extensions.digest(jsonb_build_object('decision',d.id,'recipe',p_attempt.recipe_id,'policy',p_attempt.renderer_policy_fingerprint)::text,'sha256'),'hex'),
 'replayed',p_replayed,'operationId',p_attempt.operation_id,'rootAttemptReceiptId',p_attempt.root_attempt_id)
 from private.processing_eligibility_decisions d where d.organization_id=p_attempt.organization_id and d.id=p_attempt.processing_decision_id;
$$;
create function private.worker_authorize_capital_debt_processing_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_attempt jsonb,p_route jsonb,p_resources text[],p_purpose text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare recipe private.capital_debt_recipes:=private.require_capital_debt_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);seal private.capital_debt_recipe_seals;
 op private.capital_debt_operations;a private.capital_debt_gateway_attempts;prior private.capital_debt_gateway_attempts;
 fallback boolean;invocation uuid;prior_invocation uuid;new_attempt_id uuid:=gen_random_uuid();model text;policy jsonb;decision jsonb;
 observed bigint;server_reserve bigint;stamp timestamptz:=clock_timestamp();deadline timestamptz;replayed boolean:=false;
begin
 perform private.lock_capital_debt_operation_v1(recipe.organization_id,recipe.id);
 if exists(select 1 from private.capital_debt_quality_failures where organization_id=recipe.organization_id and recipe_id=recipe.id) or exists(select 1 from private.capital_debt_execution_failures where organization_id=recipe.organization_id and recipe_id=recipe.id) then raise exception 'capital_debt_quality_failed_terminal' using errcode='42501';end if;
 select * into strict seal from private.capital_debt_recipe_seals where organization_id=recipe.organization_id and recipe_id=recipe.id;
 if not exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt
 on(pt.organization_id,pt.id)=(tr.organization_id,tr.plan_task_id)
 where tr.organization_id=recipe.organization_id and tr.id=seal.execution_plan_task_run_id
 and tr.capital_project_id=recipe.work_id and tr.plan_id=recipe.plan_id and tr.status='succeeded' and pt.task_id='M06') then
 raise exception 'capital_debt_execution_plan_denied' using errcode='42501';end if;
 if jsonb_typeof(p_attempt)is distinct from 'object' or octet_length(p_attempt::text)>4096
 or not(p_attempt?&array['adapterInputVersion','task','schemaName','requestFingerprint','inputFingerprint','promptFingerprint','invocationId','retryOrdinal','isSameModelRepair','usedProviderFallback','reservationUsd'])
 or p_attempt-array['adapterInputVersion','task','schemaName','requestFingerprint','inputFingerprint','promptFingerprint','invocationId','retryOrdinal','isSameModelRepair','usedProviderFallback','reservationUsd','previousInvocationId']<>'{}'::jsonb
 or p_attempt->>'adapterInputVersion'is distinct from 'gateway-adapter-input.v1' or p_attempt->>'task'is distinct from 'company_debt_view'
 or p_attempt->>'schemaName'is distinct from 'company_debt_diagnostic_v1'
 or exists(select 1 from unnest(array['requestFingerprint','inputFingerprint','promptFingerprint'])k where jsonb_typeof(p_attempt->k)is distinct from 'string' or p_attempt->>k !~'^[a-f0-9]{64}$')
 or jsonb_typeof(p_attempt->'invocationId')is distinct from 'string' or p_attempt->>'invocationId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 or jsonb_typeof(p_attempt->'retryOrdinal')is distinct from 'number' or p_attempt->>'retryOrdinal'is distinct from '0'
 or jsonb_typeof(p_attempt->'isSameModelRepair')is distinct from 'boolean' or p_attempt->>'isSameModelRepair'is distinct from 'false'
 or jsonb_typeof(p_attempt->'usedProviderFallback')is distinct from 'boolean' or jsonb_typeof(p_attempt->'reservationUsd')is distinct from 'number'
 or(p_attempt->>'reservationUsd')::numeric not between 0 and 0.95
 or p_resources is null or cardinality(p_resources)<>3 or not(p_resources@>array['inference','prompt_cache','schema_cache']::text[]) or p_purpose is distinct from 'case_analysis' then
 raise exception 'capital_debt_processing_invalid' using errcode='22023';end if;
 invocation:=(p_attempt->>'invocationId')::uuid;fallback:=(p_attempt->>'usedProviderFallback')::boolean;
 if(fallback and(jsonb_typeof(p_attempt->'previousInvocationId')is distinct from 'string' or p_attempt->>'previousInvocationId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'))
 or(not fallback and p_attempt?'previousInvocationId')then raise exception 'capital_debt_processing_invalid' using errcode='22023';end if;
 if fallback then prior_invocation:=(p_attempt->>'previousInvocationId')::uuid;end if;
 model:=case when fallback then 'gpt-5.6-terra' else 'claude-sonnet-5' end;
 if jsonb_typeof(p_route)is distinct from 'object' or p_route->>'provider'is distinct from (case when fallback then 'openai' else 'anthropic' end) or p_route->>'model'is distinct from model
 or p_route->>'endpoint'is distinct from (case when fallback then 'https://api.openai.com/v1/responses' else 'https://api.anthropic.com/v1/messages' end) then raise exception 'capital_debt_processing_invalid' using errcode='22023';end if;
 if p_attempt->>'inputFingerprint'is distinct from seal.reconstruction_fingerprint or p_attempt->>'promptFingerprint'is distinct from seal.prompt_fingerprint
 or p_attempt->>'requestFingerprint'is distinct from (case when fallback then seal.fallback_request_fingerprint else seal.primary_request_fingerprint end) then
 raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 if exists(select 1 from private.capital_body_invocation_inputs x where x.organization_id=recipe.organization_id and x.invocation_id=invocation)
 or exists(select 1 from private.capital_body_gateway_attempts x where x.organization_id=recipe.organization_id and x.invocation_id=invocation) then
 raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 policy:=private.capital_debt_dispatch_policy_v1(model,100000);observed:=ceil((p_attempt->>'reservationUsd')::numeric*1000000)::bigint;
 server_reserve:=greatest(observed,(policy->>'serverBoundMicroUsd')::bigint);
 select * into op from private.capital_debt_operations where organization_id=recipe.organization_id and recipe_id=recipe.id;
 select * into a from private.capital_debt_gateway_attempts where organization_id=recipe.organization_id and invocation_id=invocation;
 if a.id is not null then
 if op.id is null or a.operation_id<>op.id or a.recipe_id<>recipe.id or a.attempt_metadata is distinct from p_attempt or a.route is distinct from p_route
 or a.reservation_micro_usd<>observed or a.server_reservation_micro_usd<>server_reserve or a.renderer_policy_fingerprint<>policy->>'fingerprint' then
 raise exception 'capital_debt_processing_conflict' using errcode='23505';end if;
 perform private.capital_debt_attempt_current_v1(p_job_id,p_capability_token,a);replayed:=true;
 else
 if op.id is null then
 if fallback then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 insert into private.capital_debt_operations(organization_id,work_id,job_id,recipe_id,execution_plan_task_run_id,worker_account_id,human_subject_id,root_attempt_id,renderer_version,max_dispatches,max_exposure_micro_usd)
 values(recipe.organization_id,recipe.work_id,job.id,recipe.id,seal.execution_plan_task_run_id,auth.uid(),job.authorization_subject_id,new_attempt_id,recipe.renderer_version,seal.effective_max_dispatches,seal.effective_budget_micro_usd) returning * into op;
 elsif not fallback then raise exception 'capital_debt_processing_denied' using errcode='42501';
 end if;
 if op.job_id<>job.id or op.worker_account_id<>auth.uid() or op.human_subject_id<>job.authorization_subject_id or op.execution_plan_task_run_id<>seal.execution_plan_task_run_id then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 if fallback then
 select * into prior from private.capital_debt_gateway_attempts where organization_id=recipe.organization_id and invocation_id=prior_invocation;
 if prior.id is null or prior.operation_id<>op.id or prior.used_provider_fallback or prior.id<>op.root_attempt_id
 or exists(select 1 from private.capital_debt_attempt_outcomes o where o.organization_id=recipe.organization_id and o.operation_id=op.id and o.outcome='accepted') then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 perform private.capital_debt_attempt_current_v1(p_job_id,p_capability_token,prior);
 if prior.allowed and not exists(select 1 from private.capital_debt_attempt_outcomes o where o.organization_id=recipe.organization_id and o.attempt_id=prior.id and o.outcome<>'accepted') then
 raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 end if;
 deadline:=private.capital_debt_recipe_deadline_v1(recipe.organization_id,recipe.id,job.authorization_subject_id);
 if deadline is null or deadline<=clock_timestamp() then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 decision:=private.provider_processing_decision_with_body_limit_v1(job,p_route,array['inference','prompt_cache','schema_cache'],p_purpose,least(deadline,recipe.expires_at));
 insert into private.capital_debt_gateway_attempts(id,organization_id,work_id,job_id,operation_id,recipe_id,invocation_id,worker_account_id,human_subject_id,
 previous_attempt_id,root_attempt_id,used_provider_fallback,request_fingerprint,input_fingerprint,prompt_fingerprint,attempt_metadata,route,resources,purpose,model,
 processing_decision_id,allowed,renderer_policy_fingerprint,reservation_micro_usd,server_reservation_micro_usd,captured_at)
 values(new_attempt_id,recipe.organization_id,recipe.work_id,job.id,op.id,recipe.id,invocation,auth.uid(),job.authorization_subject_id,
 case when fallback then prior.id else null end,op.root_attempt_id,fallback,p_attempt->>'requestFingerprint',p_attempt->>'inputFingerprint',p_attempt->>'promptFingerprint',p_attempt,p_route,
 array['inference','prompt_cache','schema_cache'],'case_analysis',model,(decision->>'decisionId')::uuid,(decision->>'allowed')::boolean,policy->>'fingerprint',observed,server_reserve,stamp) returning * into a;
 end if;
 perform private.require_capital_debt_recipe_v1(p_job_id,p_capability_token,recipe.id);
 return private.capital_debt_attempt_dto_v1(a,replayed);
end;$$;

create function private.worker_record_capital_debt_input_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);a private.capital_debt_gateway_attempts;
 recipe private.capital_debt_recipes;op private.capital_debt_operations;claim private.capital_debt_input_dispatches;exposure numeric;sends integer;fresh boolean:=false;
 policy jsonb;eligibility jsonb;deadline timestamptz;
begin
 select * into a from private.capital_debt_gateway_attempts where organization_id=job.organization_id and job_id=job.id and id=p_attempt_receipt_id;
 if a.id is null or not a.allowed then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 recipe:=private.capital_debt_attempt_current_v1(p_job_id,p_capability_token,a);
 select * into strict op from private.capital_debt_operations where organization_id=job.organization_id and id=a.operation_id;
 policy:=private.capital_debt_dispatch_policy_v1(a.model,100000);
 if a.renderer_policy_fingerprint<>policy->>'fingerprint' or a.server_reservation_micro_usd<>greatest(a.reservation_micro_usd,(policy->>'serverBoundMicroUsd')::bigint)then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 select * into claim from private.capital_debt_input_dispatches where organization_id=job.organization_id and attempt_id=a.id;
 if claim.id is null then
 if exists(select 1 from private.capital_debt_attempt_outcomes where organization_id=job.organization_id and operation_id=op.id and outcome='accepted')then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 select count(*),coalesce(sum(greatest(d.server_reservation_micro_usd,coalesce(o.cost_micro_usd,d.server_reservation_micro_usd))),0) into sends,exposure
 from private.capital_debt_input_dispatches d left join private.capital_debt_attempt_outcomes o on o.organization_id=d.organization_id and o.input_receipt_id=d.id
 where d.organization_id=job.organization_id and d.operation_id=op.id;
 if sends>=op.max_dispatches or exposure+a.server_reservation_micro_usd>op.max_exposure_micro_usd then raise exception 'capital_debt_budget_denied' using errcode='42501';end if;
 -- Re-evaluate provider TTL at the one actual send grant. Replay does not reset it.
 deadline:=private.capital_debt_recipe_deadline_v1(recipe.organization_id,recipe.id,job.authorization_subject_id);
 eligibility:=private.resolve_capital_body_processing_v1(job,a.route,a.resources,a.purpose,least(deadline,recipe.expires_at));
 if eligibility->>'allowed'is distinct from 'true' then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 insert into private.capital_debt_input_dispatches(organization_id,work_id,job_id,operation_id,attempt_id,invocation_id,worker_account_id,human_subject_id,
 request_fingerprint,reservation_micro_usd,server_reservation_micro_usd,claimed_at)
 values(job.organization_id,a.work_id,job.id,op.id,a.id,a.invocation_id,auth.uid(),job.authorization_subject_id,a.request_fingerprint,a.reservation_micro_usd,a.server_reservation_micro_usd,clock_timestamp())returning * into claim;fresh:=true;
 end if;
 if claim.operation_id<>op.id or claim.invocation_id<>a.invocation_id or claim.worker_account_id<>auth.uid() or claim.human_subject_id<>job.authorization_subject_id
 or claim.request_fingerprint<>a.request_fingerprint then raise exception 'capital_debt_processing_conflict' using errcode='23505';end if;
 perform private.capital_debt_attempt_current_v1(p_job_id,p_capability_token,a);
 return jsonb_build_object('schemaVersion','capital-body-input-dispatch.v3','receiptId',claim.id,'invocationId',a.invocation_id,'requestFingerprint',a.request_fingerprint,
 'operationId',op.id,'attemptReceiptId',a.id,'rootAttemptReceiptId',op.root_attempt_id,'dispatchClaimId',claim.dispatch_claim_id,
 'rendererPolicyFingerprint',a.renderer_policy_fingerprint,'reservationMicroUsd',a.reservation_micro_usd,'serverReservationMicroUsd',claim.server_reservation_micro_usd,
 'dispatchAllowed',fresh,'replayed',not fresh);
end;$$;

create function private.worker_record_capital_debt_attempt_outcome_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid,p_outcome jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);a private.capital_debt_gateway_attempts;prior private.capital_debt_gateway_attempts;
 recipe private.capital_debt_recipes;op private.capital_debt_operations;claim private.capital_debt_input_dispatches;recorded private.capital_debt_attempt_outcomes;
 common_fp text;replayed boolean:=false;
begin
 common_fp:=private.capital_debt_attempt_outcome_fingerprint_v1(p_outcome);
 if common_fp is distinct from p_outcome->>'outcomeFingerprint'then raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 select * into a from private.capital_debt_gateway_attempts where organization_id=job.organization_id and job_id=job.id and id=p_attempt_receipt_id;
 if a.id is null or not a.allowed then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 recipe:=private.capital_debt_attempt_current_v1(p_job_id,p_capability_token,a);
 select * into strict op from private.capital_debt_operations where organization_id=job.organization_id and id=a.operation_id;
 select * into claim from private.capital_debt_input_dispatches where organization_id=job.organization_id and attempt_id=a.id;
 select * into prior from private.capital_debt_gateway_attempts where organization_id=job.organization_id and id=a.previous_attempt_id;
 if claim.id is null or claim.operation_id<>op.id or claim.worker_account_id<>auth.uid() or claim.human_subject_id<>job.authorization_subject_id
 or(p_outcome->>'invocationId',p_outcome->>'task',p_outcome->>'provider',p_outcome->>'configuredModel',p_outcome->>'schemaName',p_outcome->>'adapterInputVersion',
 p_outcome->>'requestFingerprint',p_outcome->>'inputFingerprint',p_outcome->>'promptFingerprint',p_outcome->>'previousInvocationId',p_outcome->>'retryOrdinal',
 p_outcome->>'isSameModelRepair',p_outcome->>'usedProviderFallback',p_outcome->>'processingDecisionId',p_outcome->>'inputAttestationReceiptId')
 is distinct from(a.invocation_id::text,'company_debt_view'::text,(a.route->>'provider')::text,a.model,'company_debt_diagnostic_v1'::text,'gateway-adapter-input.v1'::text,
 a.request_fingerprint,a.input_fingerprint,a.prompt_fingerprint,prior.invocation_id::text,'0'::text,'false'::text,a.used_provider_fallback::text,a.processing_decision_id::text,claim.id::text)
 or(p_outcome->>'reservationMicroUsd')::bigint<>a.reservation_micro_usd then raise exception 'capital_debt_outcome_denied' using errcode='42501';end if;
 select * into recorded from private.capital_debt_attempt_outcomes where organization_id=job.organization_id and attempt_id=a.id;
 if recorded.id is not null then
 if recorded.observation is distinct from p_outcome or recorded.outcome_fingerprint<>common_fp or recorded.input_receipt_id<>claim.id then raise exception 'capital_debt_outcome_conflict' using errcode='23505';end if;
 replayed:=true;
 else
 insert into private.capital_debt_attempt_outcomes(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id,invocation_id,worker_account_id,human_subject_id,
 observation,outcome,outcome_fingerprint,cost_micro_usd,server_exposure_micro_usd,recorded_at)
 values(job.organization_id,a.work_id,job.id,op.id,a.id,claim.id,a.invocation_id,auth.uid(),job.authorization_subject_id,p_outcome,p_outcome->>'outcome',common_fp,
 (p_outcome->>'costMicroUsd')::bigint,greatest(claim.server_reservation_micro_usd,coalesce((p_outcome->>'costMicroUsd')::bigint,claim.server_reservation_micro_usd)),clock_timestamp())returning * into recorded;
 end if;
 perform private.capital_debt_attempt_current_v1(p_job_id,p_capability_token,a);
 return jsonb_build_object('schemaVersion','capital-body-attempt-outcome-receipt.v1','receiptId',recorded.id,'operationId',op.id,'attemptReceiptId',a.id,'inputReceiptId',claim.id,
 'rootAttemptReceiptId',op.root_attempt_id,'invocationId',a.invocation_id,'requestFingerprint',a.request_fingerprint,'fingerprintVersion','gateway-attempt-outcome-fingerprint.v1',
 'outcomeFingerprint',recorded.outcome_fingerprint,'outcome',recorded.outcome,'failureCode',recorded.observation->'failureCode','replayed',replayed);
end;$$;
create function private.worker_record_capital_debt_accepted_v1(p_job_id uuid,p_capability_token text,p_input_receipt_id uuid,p_accepted jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);a private.capital_debt_gateway_attempts;
 recipe private.capital_debt_recipes;claim private.capital_debt_input_dispatches;outcome_row private.capital_debt_attempt_outcomes;accepted private.capital_debt_accepted_invocations;
 keys text[]:=array['schemaVersion','invocationId','adapterInputVersion','adapterRequestFingerprint','outputFingerprintVersion','outputFingerprint','inputFingerprint','promptFingerprint',
 'provider','configuredModel','reportedModel','schemaName','retryOrdinal','isSameModelRepair','usedProviderFallback','fromCassette','inputAttestationReceiptId'];
begin
 select * into claim from private.capital_debt_input_dispatches where organization_id=job.organization_id and job_id=job.id and id=p_input_receipt_id;
 if claim.id is null or claim.worker_account_id<>auth.uid() or claim.human_subject_id<>job.authorization_subject_id then raise exception 'capital_debt_accepted_denied' using errcode='42501';end if;
 select * into strict a from private.capital_debt_gateway_attempts where organization_id=job.organization_id and id=claim.attempt_id;
 recipe:=private.capital_debt_attempt_current_v1(p_job_id,p_capability_token,a);
 select * into outcome_row from private.capital_debt_attempt_outcomes where organization_id=job.organization_id and input_receipt_id=claim.id;
 if outcome_row.id is null or outcome_row.outcome<>'accepted' then raise exception 'capital_debt_accepted_denied' using errcode='42501';end if;
 if jsonb_typeof(p_accepted)is distinct from 'object' or not(p_accepted?&keys) or p_accepted-keys<>'{}'::jsonb or octet_length(p_accepted::text)>4096
 or p_accepted->>'schemaVersion'is distinct from 'gateway-accepted-invocation.v1'
 or p_accepted->>'adapterInputVersion'is distinct from 'gateway-adapter-input.v1' or p_accepted->>'outputFingerprintVersion'is distinct from 'gateway-parsed-output.v1'
 or p_accepted->>'provider'is distinct from a.route->>'provider' or p_accepted->>'configuredModel'is distinct from a.model or p_accepted->>'reportedModel'is distinct from a.model
 or p_accepted->>'schemaName'is distinct from 'company_debt_diagnostic_v1' or p_accepted->>'invocationId'is distinct from a.invocation_id::text
 or p_accepted->>'inputAttestationReceiptId'is distinct from claim.id::text or p_accepted->>'adapterRequestFingerprint'is distinct from a.request_fingerprint
 or p_accepted->>'inputFingerprint'is distinct from a.input_fingerprint or p_accepted->>'promptFingerprint'is distinct from a.prompt_fingerprint
 or p_accepted->>'outputFingerprint'is distinct from outcome_row.observation->>'outputFingerprint'
 or jsonb_typeof(p_accepted->'retryOrdinal')is distinct from 'number' or p_accepted->>'retryOrdinal'is distinct from '0'
 or jsonb_typeof(p_accepted->'isSameModelRepair')is distinct from 'boolean' or p_accepted->>'isSameModelRepair'is distinct from 'false'
 or jsonb_typeof(p_accepted->'fromCassette')is distinct from 'boolean' or p_accepted->>'fromCassette'is distinct from 'false'
 or jsonb_typeof(p_accepted->'usedProviderFallback')is distinct from 'boolean' or p_accepted->>'usedProviderFallback'is distinct from a.used_provider_fallback::text
 then raise exception 'capital_debt_accepted_invalid' using errcode='22023';end if;
 select * into accepted from private.capital_debt_accepted_invocations where organization_id=job.organization_id and recipe_id=recipe.id;
 if accepted.id is not null then
 if accepted.input_receipt_id<>claim.id or accepted.accepted_identity is distinct from p_accepted then raise exception 'capital_debt_accepted_conflict' using errcode='23505';end if;
 else
 insert into private.capital_debt_accepted_invocations(organization_id,work_id,job_id,recipe_id,input_receipt_id,invocation_id,output_fingerprint,accepted_identity)
 values(job.organization_id,a.work_id,job.id,recipe.id,claim.id,a.invocation_id,p_accepted->>'outputFingerprint',p_accepted)returning * into accepted;
 end if;
 perform private.capital_debt_attempt_current_v1(p_job_id,p_capability_token,a);
 return jsonb_build_object('acceptedInvocationId',accepted.id,'inputReceiptId',claim.id,'invocationId',accepted.invocation_id,'outputFingerprint',accepted.output_fingerprint);
end;$$;

-- Both orders forbid the old body-input endpoint from supplying a receipt for a
-- native invocation. The trigger also closes the same-job legacy path after seal.
create function private.guard_capital_debt_legacy_input_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipe private.capital_debt_recipes;
begin
 select * into recipe from private.capital_debt_recipes where organization_id=new.organization_id and job_id=new.job_id;
 if recipe.id is not null then
 if not pg_try_advisory_xact_lock(hashtextextended('capital-debt-recipe:'||recipe.organization_id::text||':'||recipe.id::text,0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 if exists(select 1 from private.capital_debt_recipe_seals where organization_id=recipe.organization_id and recipe_id=recipe.id)then raise exception 'capital_debt_legacy_input_denied' using errcode='42501';end if;
 end if;
 if exists(select 1 from private.capital_debt_gateway_attempts where organization_id=new.organization_id and invocation_id=new.invocation_id)then raise exception 'capital_debt_legacy_input_denied' using errcode='42501';end if;
 return new;
end;$$;
create trigger capital_debt_legacy_input_guard before insert on private.capital_body_invocation_inputs for each row execute function private.guard_capital_debt_legacy_input_v1();

create function public.worker_authorize_capital_debt_processing_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_attempt jsonb,p_route jsonb,p_resources text[],p_purpose text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_authorize_capital_debt_processing_v1(p_job_id,p_capability_token,p_recipe_id,p_attempt,p_route,p_resources,p_purpose);$$;
create function public.worker_record_capital_debt_input_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_capital_debt_input_v1(p_job_id,p_capability_token,p_attempt_receipt_id);$$;
create function public.worker_record_capital_debt_attempt_outcome_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid,p_outcome jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_capital_debt_attempt_outcome_v1(p_job_id,p_capability_token,p_attempt_receipt_id,p_outcome);$$;
create function public.worker_record_capital_debt_accepted_v1(p_job_id uuid,p_capability_token text,p_input_receipt_id uuid,p_accepted jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_capital_debt_accepted_v1(p_job_id,p_capability_token,p_input_receipt_id,p_accepted);$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
 and p.proname in ('capital_debt_attempt_outcome_fingerprint_v1','capital_debt_dispatch_policy_v1','lock_capital_debt_operation_v1','capital_debt_attempt_assurances_current_v1',
 'capital_debt_attempt_current_v1','capital_debt_attempt_dto_v1','guard_capital_debt_legacy_input_v1') loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public')
 and p.proname in ('worker_authorize_capital_debt_processing_v1','worker_record_capital_debt_input_v1','worker_record_capital_debt_attempt_outcome_v1','worker_record_capital_debt_accepted_v1')loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);execute format('grant execute on function %s to authenticated',f.signature);end loop;
end;$$;

-- Assemble after company-debt ledger, before native commit. No independent publication.
-- Internal products preserve accepted bytes through bounded Storage; CPA contains only pointers.
set search_path='';
alter table private.capital_debt_body_bases add column accepted_invocation_id uuid,add column parent_retained_payload_id uuid,add column task_id text,add column task_run_id uuid,
 add constraint capital_debt_basis_task_run_fk foreign key(organization_id,task_run_id) references public.capital_project_task_runs(organization_id,id),
 add constraint capital_debt_basis_accepted_fk foreign key(organization_id,accepted_invocation_id) references private.capital_debt_accepted_invocations(organization_id,id),
 add constraint capital_debt_basis_parent_fk foreign key(organization_id,parent_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 add constraint capital_debt_basis_derivation_check check(
 (kind='context' and accepted_invocation_id is null and parent_retained_payload_id is null and semantic_fingerprint is null and task_id is null and task_run_id is null)
 or(kind='parsed' and accepted_invocation_id is not null and parent_retained_payload_id is null and semantic_fingerprint is not null and task_id is null and task_run_id is null)
 or(kind='final' and accepted_invocation_id is not null and parent_retained_payload_id is not null and semantic_fingerprint is not null and task_id is null and task_run_id is null)
 or(kind='prelude' and accepted_invocation_id is null and parent_retained_payload_id is not null and semantic_fingerprint is not null and task_id in('M01','M02','M03','M04','M05','M06') and task_run_id is not null)
 or(kind='derived' and accepted_invocation_id is not null and parent_retained_payload_id is not null and semantic_fingerprint is not null and task_id~'^[A-Z][0-9]{2}$' and task_run_id is not null));
create index capital_debt_basis_accepted_idx on private.capital_debt_body_bases(organization_id,accepted_invocation_id);
create index capital_debt_basis_task_run_idx on private.capital_debt_body_bases(organization_id,task_run_id);
create index capital_debt_basis_parent_idx on private.capital_debt_body_bases(organization_id,parent_retained_payload_id);

-- Parent scopes are proved separately from JS semantic fingerprints. No
-- final/derived body can outlive its real accepted parsed physical parent.
create or replace function private.capital_debt_allocation_deadline_v1(p_org uuid,p_allocation uuid,p_subject uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;b private.capital_debt_body_bases;parent private.capital_public_payload_allocations;pb private.capital_debt_body_bases;d timestamptz;
begin
 select * into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation and content_kind='debt_body';
 select * into b from private.capital_debt_body_bases where organization_id=p_org and id=a.debt_body_basis_id;
 if b.id is null then return null;end if;
 d:=private.capital_debt_recipe_deadline_v1(p_org,b.recipe_id,p_subject);
 if d is null or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 if b.parent_retained_payload_id is not null then
 select allocation.* into parent from private.capital_public_retained_payloads q join private.capital_public_payload_allocations allocation on(allocation.organization_id,allocation.id)=(q.organization_id,q.allocation_id) where(q.organization_id,q.id)=(p_org,b.parent_retained_payload_id) and allocation.content_kind='debt_body';
 select * into pb from private.capital_debt_body_bases where(organization_id,id)=(p_org,parent.debt_body_basis_id);
 if parent.id is null or pb.recipe_id is distinct from b.recipe_id or parent.id=a.id or not private.capital_body_physical_receipt_v1(p_org,b.parent_retained_payload_id)
 or not exists(select 1 from private.capital_public_payload_purge_queue q where(q.organization_id,q.allocation_id)=(p_org,parent.id) and q.status='pending')
 or(b.kind='prelude' and pb.kind is distinct from 'context')
 or(b.kind in('derived','final') and(pb.kind is distinct from 'parsed' or pb.accepted_invocation_id is distinct from b.accepted_invocation_id)) then return null;end if;
 d:=least(d,parent.expires_at,parent.purge_at);
 end if;
 return case when least(d,a.expires_at,a.purge_at)>clock_timestamp() then least(d,a.expires_at,a.purge_at) end;
end;$$;

create function private.capital_debt_task_type_v1(p_task text) returns text language sql immutable set search_path='' as $$
 select case p_task
 when 'M01' then 'company_resolution'
 when 'M02' then 'diagnostic_mandate'
 when 'M03' then 'constraint_register'
 when 'M04' then 'diagnostic_lenses'
 when 'M05' then 'diagnostic_definition'
 when 'M06' then 'company_debt_execution_plan'
 when 'D01' then 'document_ingestion_status'
 when 'D02' then 'document_classification_status'
 when 'D03' then 'document_extraction_status'
 when 'D04' then 'document_fact_candidate_status'
 when 'D05' then 'entity_period_unit_resolution'
 when 'D06' then 'evidence_reconciliation_status'
 when 'D07' then 'accounting_identity_status'
 when 'C01' then 'business_model_reconstruction'
 when 'C02' then 'sector_regulatory_research'
 when 'C03' then 'public_financial_spreading'
 when 'C04' then 'earnings_quality_analysis'
 when 'C05' then 'debt_economic_map'
 when 'C06' then 'working_capital_analysis'
 when 'C07' then 'projection_normalization'
 when 'C08' then 'scenario_stress_analysis'
 when 'C09' then 'risk_mitigation_diagnostic'
 when 'C10' then 'capacity_assessment'

 end;
$$;
create table private.capital_debt_task_projections(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,
 recipe_id uuid not null,task_id text not null,task_run_id uuid not null,capital_artifact_id uuid not null,
 accepted_invocation_id uuid,parsed_retained_payload_id uuid,derived_retained_payload_id uuid not null,
 semantic_fingerprint text not null check(semantic_fingerprint~'^[a-f0-9]{64}$'),artifact_fingerprint text not null check(artifact_fingerprint~'^[a-f0-9]{64}$'),artifact_version integer not null check(artifact_version>0),
 transformation_version text not null default 'company-debt-task.transform.v1' check(transformation_version='company-debt-task.transform.v1'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id,task_id),unique(organization_id,task_run_id),unique(organization_id,capital_artifact_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_debt_recipes(organization_id,work_id,id),
 foreign key(organization_id,task_run_id) references public.capital_project_task_runs(organization_id,id),
 foreign key(organization_id,capital_artifact_id) references public.capital_project_artifacts(organization_id,id) deferrable initially deferred,
 foreign key(organization_id,accepted_invocation_id) references private.capital_debt_accepted_invocations(organization_id,id),
 foreign key(organization_id,parsed_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,derived_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 check(private.capital_debt_task_type_v1(task_id) is not null),
 check((task_id in('M01','M02','M03','M04','M05','M06') and accepted_invocation_id is null and parsed_retained_payload_id is null) or(task_id not in('M01','M02','M03','M04','M05','M06') and accepted_invocation_id is not null and parsed_retained_payload_id is not null))
);
create index capital_debt_task_projection_work_idx on private.capital_debt_task_projections(organization_id,work_id,recipe_id);
create index capital_debt_task_projection_accepted_idx on private.capital_debt_task_projections(organization_id,accepted_invocation_id);
create index capital_debt_task_projection_parsed_idx on private.capital_debt_task_projections(organization_id,parsed_retained_payload_id);
create index capital_debt_task_projection_retained_idx on private.capital_debt_task_projections(organization_id,derived_retained_payload_id);
alter table private.capital_debt_task_projections enable row level security;
alter table private.capital_debt_task_projections force row level security;
revoke all on private.capital_debt_task_projections from public,anon,authenticated,service_role;
create policy capital_debt_tasks_deny_select on private.capital_debt_task_projections as restrictive for select to anon,authenticated using(false);
create policy capital_debt_tasks_deny_insert on private.capital_debt_task_projections as restrictive for insert to anon,authenticated with check(false);
create policy capital_debt_tasks_deny_update on private.capital_debt_task_projections as restrictive for update to anon,authenticated using(false) with check(false);
create policy capital_debt_tasks_deny_delete on private.capital_debt_task_projections as restrictive for delete to anon,authenticated using(false);
create trigger capital_debt_tasks_immutable before update or delete on private.capital_debt_task_projections for each row execute function private.reject_review_history_mutation_v1();
create trigger capital_debt_tasks_no_truncate before truncate on private.capital_debt_task_projections for each statement execute function private.reject_review_history_mutation_v1();
create trigger capital_debt_tasks_updated_at before update on private.capital_debt_task_projections for each row execute function private.set_updated_at();
create trigger capital_debt_tasks_audit after insert on private.capital_debt_task_projections for each row execute function private.capture_identity_audit_v1();

create function private.require_capital_debt_task_run_v1(p_org uuid,p_recipe uuid,p_task_run uuid,p_authorized_job_id uuid default null)
returns public.capital_project_task_runs language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_debt_recipes;tr public.capital_project_task_runs;pt public.capital_project_plan_tasks;
begin
 select * into r from private.capital_debt_recipes where organization_id=p_org and id=p_recipe;
 select * into tr from public.capital_project_task_runs where organization_id=p_org and id=p_task_run;
 select * into pt from public.capital_project_plan_tasks where organization_id=p_org and id=tr.plan_task_id;
 if r.id is null or tr.id is null or tr.capital_project_id is distinct from r.work_id or(tr.processing_job_id is distinct from r.job_id and tr.processing_job_id is distinct from p_authorized_job_id)
 or(pt.task_id in('M01','M02','M03','M04','M05','M06') and tr.processing_job_id is distinct from r.job_id)
 or pt.plan_id is distinct from r.plan_id or private.capital_debt_task_type_v1(pt.task_id) is null
 or tr.executor_key is distinct from 'offroad.company_debt_view' or tr.executor_version is distinct from '2026.09.01-v1'
 or tr.status not in('running','succeeded') then raise exception 'capital_debt_task_run_denied' using errcode='42501';end if;
 return tr;
end; $$;
create function private.capital_debt_task_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_recovery boolean default false)
returns private.capital_debt_recipes language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_debt_recipes;tr public.capital_project_task_runs;task text;grant_row jsonb;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('capital-debt-recipe:'||j.organization_id::text||':'||p_recipe_id::text,0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 if p_recovery then
 grant_row:=private.worker_recover_capital_debt_result_v1(p_job_id,p_capability_token,p_recipe_id);
 if grant_row->>'state' is null or grant_row->>'state' not in('transform','commit','committed') then raise exception 'capital_debt_recovered_task_denied' using errcode='42501';end if;
 select * into r from private.capital_debt_recipes where organization_id=j.organization_id and id=p_recipe_id;
 perform private.require_capital_debt_task_run_v1(j.organization_id,r.id,p_task_run_id,j.id);
 if r.id is null or private.capital_debt_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null then raise exception 'capital_debt_recovered_task_denied' using errcode='42501';end if;
 return r;
 end if;
 select * into r from private.capital_debt_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 tr:=private.require_capital_debt_task_run_v1(j.organization_id,r.id,p_task_run_id,case when p_recovery then j.id end);
 select task_id into task from public.capital_project_plan_tasks where organization_id=j.organization_id and id=tr.plan_task_id;
 if task not in('M01','M02','M03','M04','M05','M06') or exists(select 1 from private.capital_debt_recipe_seals where organization_id=j.organization_id and recipe_id=r.id) then return private.require_capital_debt_recipe_v1(p_job_id,p_capability_token,p_recipe_id);end if;
 if r.id is null or r.worker_account_id is distinct from auth.uid() or r.human_subject_id is distinct from j.authorization_subject_id
 or private.capital_debt_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null
 or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_debt_prelude_denied' using errcode='42501';end if;
 return r;
end; $$;

create function private.worker_prepare_capital_debt_task_projection_core_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,
 p_task_run_id uuid,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid,p_recovery boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.capital_debt_recipes;grant_row jsonb;
 j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);ok private.capital_debt_accepted_invocations;
 tr public.capital_project_task_runs;task text;b private.capital_debt_body_bases;parent private.capital_debt_body_bases;a private.capital_public_payload_allocations;
 parent_a private.capital_public_payload_allocations;p private.capital_public_retention_policies;deadline timestamptz;fp text;bytes bigint;stamp timestamptz:=clock_timestamp();replayed boolean:=false;
begin
 r:=private.capital_debt_task_recipe_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_recovery);
 tr:=private.require_capital_debt_task_run_v1(j.organization_id,r.id,p_task_run_id,case when p_recovery then j.id end);
 select task_id into task from public.capital_project_plan_tasks where organization_id=j.organization_id and id=tr.plan_task_id;
 if exists(select 1 from private.capital_debt_quality_failures where organization_id=j.organization_id and recipe_id=r.id) or exists(select 1 from private.capital_debt_execution_failures where organization_id=j.organization_id and recipe_id=r.id) then raise exception 'capital_debt_quality_failed_terminal' using errcode='42501';end if;
 if p_request_id is null or jsonb_typeof(p_body) is distinct from 'object'
 or p_output_fingerprint is null or p_output_fingerprint!~'^[a-f0-9]{64}$' then raise exception 'capital_debt_output_invalid' using errcode='22023';end if;
 select * into ok from private.capital_debt_accepted_invocations where organization_id=j.organization_id and job_id=r.job_id and recipe_id=r.id and id=p_accepted_invocation_id;
 if task not in('M01','M02','M03','M04','M05','M06') and ok.id is null then raise exception 'capital_debt_accepted_denied' using errcode='42501';end if;
 if p_body->>'schemaVersion' is distinct from 'company-debt-task.v1' or p_body->>'taskId' is distinct from task
 or p_body->>'artifactType' is distinct from private.capital_debt_task_type_v1(task) or jsonb_typeof(p_body->'content') is distinct from 'object'
 or p_body-array['schemaVersion','taskId','artifactType','content']<>'{}'::jsonb then raise exception 'capital_debt_task_body_invalid' using errcode='22023';end if;
 select x.* into parent_a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=j.organization_id and q.id=p_parent_retained_payload_id and x.content_kind='debt_body';
 select * into parent from private.capital_debt_body_bases where organization_id=j.organization_id and id=parent_a.debt_body_basis_id;
 if parent.id is null or parent.recipe_id<>r.id or not private.capital_body_physical_receipt_v1(j.organization_id,p_parent_retained_payload_id)
 or(task in('M01','M02','M03','M04','M05','M06') and(parent.kind is distinct from 'context' or p_accepted_invocation_id is not null or parent.accepted_invocation_id is not null or parent_a.payload_fingerprint is distinct from r.context_fingerprint))
 or(task not in('M01','M02','M03','M04','M05','M06') and(parent.kind is distinct from 'parsed' or parent.accepted_invocation_id is distinct from ok.id or parent.semantic_fingerprint is distinct from ok.output_fingerprint)) then raise exception 'capital_debt_parent_denied' using errcode='42501';end if;
 select * into strict p from private.capital_public_retention_policies where id=r.retention_policy_id;
 deadline:=private.capital_debt_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 deadline:=least(deadline,parent_a.expires_at,parent_a.purge_at);
 if deadline is null or deadline-make_interval(secs=>p.purge_margin_seconds)<=stamp or not private.capital_public_retention_healthy_v1(j.leased_by,p.id) then raise exception 'capital_debt_retention_denied' using errcode='42501';end if;
 fp:=encode(extensions.digest(p_body::text,'sha256'),'hex');bytes:=octet_length(p_body::text);
 if bytes not between 1 and 1048576 then raise exception 'capital_debt_body_size_invalid' using errcode='22023';end if;
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and job_id=j.id and request_id=p_request_id and content_kind='debt_body';
 if a.id is not null then
 select * into strict b from private.capital_debt_body_bases where organization_id=j.organization_id and id=a.debt_body_basis_id;
 if b.recipe_id<>r.id or b.kind is distinct from(case when task in('M01','M02','M03','M04','M05','M06') then 'prelude' else 'derived' end) or b.task_id is distinct from task or b.task_run_id is distinct from tr.id or b.accepted_invocation_id is distinct from ok.id or b.parent_retained_payload_id is distinct from p_parent_retained_payload_id or b.semantic_fingerprint<>p_output_fingerprint or a.payload_fingerprint<>fp or a.byte_length<>bytes then raise exception 'capital_debt_output_conflict' using errcode='23505';end if;
 replayed:=true;
 if private.capital_debt_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null then raise exception 'capital_debt_retention_denied' using errcode='42501';end if;
 else
 insert into private.capital_debt_body_bases(organization_id,work_id,recipe_id,kind,task_id,task_run_id,semantic_fingerprint,accepted_invocation_id,parent_retained_payload_id)
 values(j.organization_id,r.work_id,r.id,case when task in('M01','M02','M03','M04','M05','M06') then 'prelude' else 'derived' end,task,tr.id,p_output_fingerprint,ok.id,p_parent_retained_payload_id) returning * into b;
 insert into private.capital_public_payload_allocations(id,organization_id,request_id,job_id,worker_token_id,worker_account_id,capability_sha256,policy_id,
 payload_fingerprint,byte_length,object_path,retained_at,expires_at,purge_at,upload_expires_at,debt_body_basis_id,content_kind)
 values(b.id,j.organization_id,p_request_id,j.id,j.leased_by,auth.uid(),j.capability_sha256,p.id,fp,bytes,j.organization_id::text||'/'||b.id::text||'/payload.json',stamp,deadline,
 deadline-make_interval(secs=>p.purge_margin_seconds),least(stamp+interval '5 minutes',deadline-make_interval(secs=>p.purge_margin_seconds)),b.id,'debt_body') returning * into a;
 insert into private.capital_public_payload_purge_queue(organization_id,allocation_id,next_check_at,effective_purge_at) values(j.organization_id,a.id,least(a.upload_expires_at,a.purge_at),a.purge_at);
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_debt_denied' using errcode='42501';end if;
 return private.capital_debt_body_dto_v1(j.organization_id,a.id,deadline,replayed)||jsonb_build_object('canonicalBody',p_body::text);
end; $$;


create function private.capital_debt_task_projection_dto_v1(p_org uuid,p_recipe uuid,p_task_run uuid,p_replayed boolean)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion','capital-debt-task-projection-receipt.v1','recipeId',x.recipe_id,'taskId',x.task_id,'taskRunId',x.task_run_id,
 'capitalArtifactId',x.capital_artifact_id,'artifactFingerprint',x.artifact_fingerprint,'artifactVersion',x.artifact_version,
 'retainedPayloadId',x.derived_retained_payload_id,'replayed',p_replayed)
 from private.capital_debt_task_projections x where x.organization_id=p_org and x.recipe_id=p_recipe and x.task_run_id=p_task_run;
$$;
create function private.worker_commit_capital_debt_task_projection_core_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_retained_payload_id uuid,p_recovery boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_debt_recipes:=private.capital_debt_task_recipe_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_recovery);
 j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 tr public.capital_project_task_runs:=private.require_capital_debt_task_run_v1(j.organization_id,r.id,p_task_run_id,case when p_recovery then j.id end);
 pt public.capital_project_plan_tasks;old private.capital_debt_task_projections;
 a private.capital_public_payload_allocations;b private.capital_debt_body_bases;deps jsonb;dep text;dep_art public.capital_project_artifacts;
 projection jsonb;fp text;aid uuid:=gen_random_uuid();v integer;stamp timestamptz:=clock_timestamp();deadline timestamptz;
begin
 select * into tr from public.capital_project_task_runs where organization_id=j.organization_id and id=p_task_run_id for update;
 select * into strict pt from public.capital_project_plan_tasks where organization_id=j.organization_id and id=tr.plan_task_id;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=j.organization_id and q.id=p_retained_payload_id and x.content_kind='debt_body';
 select * into b from private.capital_debt_body_bases where organization_id=j.organization_id and id=a.debt_body_basis_id;
 deadline:=private.capital_debt_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id);
 if a.id is null or b.kind is distinct from(case when pt.task_id in('M01','M02','M03','M04','M05','M06') then 'prelude' else 'derived' end) or b.recipe_id is distinct from r.id or b.task_id is distinct from pt.task_id or b.task_run_id is distinct from tr.id or deadline is null
 or not private.capital_body_physical_receipt_v1(j.organization_id,p_retained_payload_id)
 or not private.capital_body_retention_healthy_v1(a.policy_id,j.organization_id,a.id) then raise exception 'capital_debt_task_body_denied' using errcode='42501';end if;
 select * into old from private.capital_debt_task_projections where organization_id=j.organization_id and recipe_id=r.id and task_id=pt.task_id;
 if old.id is not null then
 if old.task_run_id<>tr.id or old.derived_retained_payload_id<>p_retained_payload_id or old.semantic_fingerprint<>b.semantic_fingerprint
 or not exists(select 1 from public.capital_project_artifacts c where c.organization_id=j.organization_id and c.id=old.capital_artifact_id and c.artifact_fingerprint=old.artifact_fingerprint and c.status not in('stale','superseded')) then raise exception 'capital_debt_task_replay_denied' using errcode='42501';end if;
 return private.capital_debt_task_projection_dto_v1(j.organization_id,r.id,tr.id,true);
 end if;
 if tr.status<>'running' then raise exception 'capital_debt_task_run_denied' using errcode='42501';end if;
 deps:='[]';
 foreach dep in array pt.dependencies loop
 select c.* into dep_art from public.capital_project_artifacts c
 join public.capital_project_task_runs dr on dr.organization_id=c.organization_id and dr.id=c.task_run_id
 join public.capital_project_plan_tasks dp on dp.organization_id=dr.organization_id and dp.id=dr.plan_task_id
 where c.organization_id=j.organization_id and c.capital_project_id=r.work_id and c.plan_id=r.plan_id and dp.task_id=dep
 and dr.processing_job_id in(r.job_id,j.id) and dr.status='succeeded' and c.status not in('stale','superseded')
 order by c.artifact_version desc limit 1;
 if dep_art.id is null then raise exception 'capital_debt_task_dependencies_incomplete' using errcode='42501';end if;
 if private.capital_debt_task_type_v1(dep) is not null and not exists(select 1 from private.capital_debt_task_projections x join private.capital_public_retained_payloads q on q.organization_id=x.organization_id and q.id=x.derived_retained_payload_id join private.capital_public_payload_allocations z on z.organization_id=q.organization_id and z.id=q.allocation_id where x.organization_id=j.organization_id and x.recipe_id=r.id and x.capital_artifact_id=dep_art.id and x.artifact_fingerprint=dep_art.artifact_fingerprint and private.capital_debt_allocation_deadline_v1(j.organization_id,z.id,j.authorization_subject_id) is not null and private.capital_body_physical_receipt_v1(j.organization_id,q.id)) then raise exception 'capital_debt_task_dependency_body_denied' using errcode='42501';end if;
 deps:=deps||jsonb_build_array(jsonb_build_object('artifactId',dep_art.id,'artifactFingerprint',dep_art.artifact_fingerprint));
 end loop;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-artifact:'||r.work_id::text||':'||private.capital_debt_task_type_v1(pt.task_id),0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 select coalesce(max(artifact_version),0)+1 into v from public.capital_project_artifacts where organization_id=j.organization_id and capital_project_id=r.work_id and artifact_type=private.capital_debt_task_type_v1(pt.task_id);
 projection:=jsonb_build_object('schemaVersion','capital-debt-task-projection.v1','recipeId',r.id,'taskId',pt.task_id,'retainedPayloadId',p_retained_payload_id,
 'semanticFingerprint',b.semantic_fingerprint,'physicalSha256',a.payload_fingerprint,'byteLength',a.byte_length);
 fp:=encode(extensions.digest(projection::text,'sha256'),'hex');
 insert into private.capital_debt_task_projections(organization_id,work_id,recipe_id,task_id,task_run_id,capital_artifact_id,accepted_invocation_id,parsed_retained_payload_id,derived_retained_payload_id,semantic_fingerprint,artifact_fingerprint,artifact_version)
 values(j.organization_id,r.work_id,r.id,pt.task_id,tr.id,aid,b.accepted_invocation_id,case when pt.task_id in('M01','M02','M03','M04','M05','M06') then null else b.parent_retained_payload_id end,p_retained_payload_id,b.semantic_fingerprint,fp,v);
 update public.capital_project_artifacts set status='superseded',superseded_at=stamp where organization_id=j.organization_id and capital_project_id=r.work_id and artifact_type=private.capital_debt_task_type_v1(pt.task_id) and status in('draft','pending_confirmation');
 insert into public.capital_project_artifacts(id,organization_id,capital_project_id,plan_id,task_run_id,artifact_type,schema_version,artifact_version,status,input_fingerprint,artifact_fingerprint,content,evidence_refs,dependencies,processing_job_id,created_by_kind)
 values(aid,j.organization_id,r.work_id,r.plan_id,tr.id,private.capital_debt_task_type_v1(pt.task_id),'capital-debt-task-projection.v1',v,'draft',tr.input_fingerprint,fp,projection,'[]',deps,tr.processing_job_id,'worker');
 update public.capital_project_task_runs set status='succeeded',completed_at=stamp,output_reference=jsonb_build_object('type','capital_project_artifact','id',aid),output_fingerprint=fp,
 quality_results=jsonb_build_array(jsonb_build_object('id','bounded_output','passed',true)),usage='{}',error=null where organization_id=j.organization_id and id=tr.id;
 if private.capital_debt_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_debt_task_denied' using errcode='42501';end if;
 return private.capital_debt_task_projection_dto_v1(j.organization_id,r.id,tr.id,false);
end; $$;

-- Prospective recipes close generic writers for every post-model product, including abstentions.
create function private.guard_capital_debt_task_projection_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare task text;recipe uuid;scope text;
begin
 if tg_table_name='capital_project_artifacts' then
 select pt.task_id,r.id,j.payload->>'analysis_scope' into task,recipe,scope from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id join public.processing_jobs j on j.organization_id=tr.organization_id and j.id=tr.processing_job_id left join private.capital_debt_recipes r on r.organization_id=tr.organization_id and r.job_id=tr.processing_job_id where tr.organization_id=new.organization_id and tr.id=new.task_run_id;
 recipe:=coalesce(recipe,(select x.recipe_id from private.capital_debt_task_projections x where x.organization_id=new.organization_id and x.task_run_id=new.task_run_id and x.capital_artifact_id=new.id));
 if scope='company_debt_view' and private.capital_debt_task_type_v1(task) is not null and not exists(select 1 from private.capital_debt_task_projections x where x.organization_id=new.organization_id and x.recipe_id=recipe and x.task_run_id=new.task_run_id and x.capital_artifact_id=new.id and x.artifact_fingerprint=new.artifact_fingerprint and new.schema_version='capital-debt-task-projection.v1' and new.content=jsonb_build_object('schemaVersion','capital-debt-task-projection.v1','recipeId',x.recipe_id,'taskId',x.task_id,'retainedPayloadId',x.derived_retained_payload_id,'semanticFingerprint',x.semantic_fingerprint,'physicalSha256',(select a.payload_fingerprint from private.capital_public_retained_payloads q join private.capital_public_payload_allocations a on a.organization_id=q.organization_id and a.id=q.allocation_id where q.organization_id=x.organization_id and q.id=x.derived_retained_payload_id),'byteLength',(select a.byte_length from private.capital_public_retained_payloads q join private.capital_public_payload_allocations a on a.organization_id=q.organization_id and a.id=q.allocation_id where q.organization_id=x.organization_id and q.id=x.derived_retained_payload_id))) then raise exception 'capital_debt_native_task_projection_required' using errcode='42501';end if;
 elsif new.status='succeeded' then
 select pt.task_id,r.id,j.payload->>'analysis_scope' into task,recipe,scope from public.capital_project_plan_tasks pt join public.processing_jobs j on j.organization_id=pt.organization_id and j.id=new.processing_job_id left join private.capital_debt_recipes r on r.organization_id=pt.organization_id and r.plan_id=pt.plan_id and r.job_id=new.processing_job_id where pt.organization_id=new.organization_id and pt.id=new.plan_task_id;
 recipe:=coalesce(recipe,(select x.recipe_id from private.capital_debt_task_projections x where x.organization_id=new.organization_id and x.task_run_id=new.id));
 if scope='company_debt_view' and private.capital_debt_task_type_v1(task) is not null and not exists(select 1 from private.capital_debt_task_projections x where x.organization_id=new.organization_id and x.recipe_id=recipe and x.task_run_id=new.id and new.output_reference=jsonb_build_object('type','capital_project_artifact','id',x.capital_artifact_id) and new.output_fingerprint=x.artifact_fingerprint and new.error is null and new.usage='{}'::jsonb and new.quality_results=jsonb_build_array(jsonb_build_object('id','bounded_output','passed',true))) then raise exception 'capital_debt_native_task_projection_required' using errcode='42501';end if;
 end if;
 return new;
end; $$;
create trigger capital_debt_tasks_guard before insert on public.capital_project_artifacts for each row execute function private.guard_capital_debt_task_projection_v1();
create trigger capital_debt_task_completion_guard before update of status,output_reference,output_fingerprint on public.capital_project_task_runs for each row execute function private.guard_capital_debt_task_projection_v1();
alter function private.project_legacy_artifact_revision_v1(text,uuid,uuid) rename to project_legacy_artifact_revision_pre_debt_task_v1;
create function private.project_legacy_artifact_revision_v1(p_table text,p_org uuid,p_row uuid) returns integer language plpgsql security definer set search_path='' as $$
begin
 if p_table='capital_project_artifacts' and exists(select 1 from private.capital_debt_task_projections x where x.organization_id=p_org and x.capital_artifact_id=p_row) then return 0;end if;
 return private.project_legacy_artifact_revision_pre_debt_task_v1(p_table,p_org,p_row);
end; $$;

create function private.worker_read_capital_debt_task_body_core_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_recovery boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_debt_recipes:=private.capital_debt_task_recipe_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_recovery);x private.capital_debt_task_projections;a private.capital_public_payload_allocations;d timestamptz;
begin
 select * into x from private.capital_debt_task_projections where organization_id=r.organization_id and recipe_id=r.id and task_run_id=p_task_run_id;
 select z.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations z on z.organization_id=q.organization_id and z.id=q.allocation_id where q.organization_id=r.organization_id and q.id=x.derived_retained_payload_id;
 d:=private.capital_debt_allocation_deadline_v1(r.organization_id,a.id,r.human_subject_id);
 if x.id is null or d is null or not private.capital_body_retention_healthy_v1(a.policy_id,r.organization_id,a.id) or not private.capital_body_physical_receipt_v1(r.organization_id,x.derived_retained_payload_id) or not exists(select 1 from public.capital_project_artifacts c where c.organization_id=r.organization_id and c.id=x.capital_artifact_id and c.status not in('stale','superseded') and c.artifact_fingerprint=x.artifact_fingerprint) then raise exception 'capital_debt_task_body_denied' using errcode='42501';end if;
 if not private.capital_public_capture_clock_current_v1(p_job_id,p_capability_token) or private.capital_debt_allocation_deadline_v1(r.organization_id,a.id,r.human_subject_id) is null then raise exception 'capital_debt_task_body_denied' using errcode='42501';end if;
 return private.capital_debt_body_dto_v1(r.organization_id,a.id,d,true);
end; $$;

-- A denied physical read is never interpreted as an absent task. This metadata
-- lookup returns absence only after the exact current recovery grant and real
-- published TaskSpec have been checked independently.
create function private.worker_load_capital_debt_recovered_projection_state_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_debt_recipes;
 g jsonb;x private.capital_debt_task_projections;b jsonb;
begin
 g:=private.worker_recover_capital_debt_result_v1(p_job_id,p_capability_token,p_recipe_id);
 if g->>'state' is null or g->>'state' not in('transform','commit','committed') or private.capital_debt_task_type_v1(p_task_id) is null then raise exception 'capital_debt_recovered_task_denied' using errcode='42501';end if;
 select * into r from private.capital_debt_recipes where organization_id=j.organization_id and id=p_recipe_id;
 if r.id is null or not exists(select 1 from public.capital_project_plan_tasks t where t.organization_id=j.organization_id and t.plan_id=r.plan_id and t.task_id=p_task_id) then raise exception 'capital_debt_recovered_task_denied' using errcode='42501';end if;
 select * into x from private.capital_debt_task_projections where organization_id=j.organization_id and recipe_id=r.id and task_id=p_task_id;
 if x.id is null then
  if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_debt_recovered_task_denied' using errcode='42501';end if;
  return jsonb_build_object('schemaVersion','capital-debt-recovered-projection-state.v1','recipeId',r.id,'taskId',p_task_id,'state','absent','projection',null,'body',null);
 end if;
 b:=private.worker_read_capital_debt_task_body_core_v1(j.id,p_capability_token,r.id,x.task_run_id,true);
 return jsonb_build_object('schemaVersion','capital-debt-recovered-projection-state.v1','recipeId',r.id,'taskId',p_task_id,'state','present','projection',private.capital_debt_task_projection_dto_v1(j.organization_id,r.id,x.task_run_id,true),'body',b);
end; $$;
create function public.worker_load_capital_debt_recovered_projection_state_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_id text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_load_capital_debt_recovered_projection_state_v1(p_job_id,p_capability_token,p_recipe_id,p_task_id);$$;
revoke all on function private.worker_load_capital_debt_recovered_projection_state_v1(uuid,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.worker_load_capital_debt_recovered_projection_state_v1(uuid,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.worker_load_capital_debt_recovered_projection_state_v1(uuid,text,uuid,text) to authenticated;

create function private.worker_prepare_capital_debt_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_task_run_id uuid,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.worker_prepare_capital_debt_task_projection_core_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_task_run_id,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id,false); $$;
create function private.worker_commit_capital_debt_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_retained_payload_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.worker_commit_capital_debt_task_projection_core_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_retained_payload_id,false); $$;
create function private.worker_prepare_capital_debt_recovered_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_task_run_id uuid,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.worker_prepare_capital_debt_task_projection_core_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_task_run_id,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id,true); $$;
create function private.worker_commit_capital_debt_recovered_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_retained_payload_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.worker_commit_capital_debt_task_projection_core_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_retained_payload_id,true); $$;
create function public.worker_prepare_capital_debt_recovered_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_task_run_id uuid,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_debt_recovered_task_projection_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_task_run_id,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id); $$;
create function public.worker_commit_capital_debt_recovered_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_commit_capital_debt_recovered_task_projection_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_retained_payload_id); $$;
create function private.worker_read_capital_debt_task_body_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.worker_read_capital_debt_task_body_core_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,false); $$;
create function private.worker_read_capital_debt_recovered_task_body_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.worker_read_capital_debt_task_body_core_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,true); $$;
create function public.worker_read_capital_debt_recovered_task_body_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_read_capital_debt_recovered_task_body_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id); $$;
create function public.worker_prepare_capital_debt_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_task_run_id uuid,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_debt_task_projection_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_task_run_id,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id); $$;
create function public.worker_commit_capital_debt_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_commit_capital_debt_task_projection_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_retained_payload_id); $$;
create function public.worker_read_capital_debt_task_body_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_read_capital_debt_task_body_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id); $$;
do $$declare f record;begin
 for f in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and(p.proname in('capital_debt_task_type_v1','require_capital_debt_task_run_v1','capital_debt_task_recipe_v1','capital_debt_task_projection_dto_v1','guard_capital_debt_task_projection_v1','project_legacy_artifact_revision_pre_debt_task_v1','project_legacy_artifact_revision_v1') or p.proname in('worker_read_capital_debt_task_body_core_v1','worker_read_capital_debt_recovered_task_body_v1','worker_prepare_capital_debt_task_projection_core_v1','worker_commit_capital_debt_task_projection_core_v1','worker_prepare_capital_debt_recovered_task_projection_v1','worker_commit_capital_debt_recovered_task_projection_v1','worker_prepare_capital_debt_task_projection_v1','worker_commit_capital_debt_task_projection_v1','worker_read_capital_debt_task_body_v1')) loop
 execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',f.nspname,f.proname,f.args);
 if f.proname in('worker_read_capital_debt_recovered_task_body_v1','worker_prepare_capital_debt_recovered_task_projection_v1','worker_commit_capital_debt_recovered_task_projection_v1','worker_prepare_capital_debt_task_projection_v1','worker_commit_capital_debt_task_projection_v1','worker_read_capital_debt_task_body_v1') then execute format('grant execute on function %I.%I(%s) to authenticated',f.nspname,f.proname,f.args);end if;
 end loop;
end; $$;

-- Concatenate AFTER capital_debt_execution_ledger.sql. This is not independently deployable.
set search_path='';
create table private.capital_debt_native_bindings (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,
 recipe_id uuid not null,execution_plan_task_run_id uuid not null,task_run_id uuid not null,accepted_invocation_id uuid not null,parsed_retained_payload_id uuid not null,final_retained_payload_id uuid not null,
 capital_artifact_id uuid not null,revision_id uuid not null,final_fingerprint text not null check(final_fingerprint~'^[a-f0-9]{64}$'),
 transformation_version text not null check(transformation_version='company-debt-diagnostic.transform.v1'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,task_run_id),unique(organization_id,revision_id),unique(organization_id,capital_artifact_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_debt_recipes(organization_id,work_id,id),
 foreign key(organization_id,execution_plan_task_run_id) references public.capital_project_task_runs(organization_id,id),
 foreign key(organization_id,task_run_id) references public.capital_project_task_runs(organization_id,id),
 foreign key(organization_id,accepted_invocation_id) references private.capital_debt_accepted_invocations(organization_id,id),
 foreign key(organization_id,parsed_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,final_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,capital_artifact_id) references public.capital_project_artifacts(organization_id,id) deferrable initially deferred,
 foreign key(organization_id,revision_id) references public.artifact_revisions(organization_id,id) deferrable initially deferred
);
create index capital_debt_native_recipe_idx on private.capital_debt_native_bindings(organization_id,work_id,recipe_id);
create index capital_debt_native_accepted_idx on private.capital_debt_native_bindings(organization_id,accepted_invocation_id);
create index capital_debt_native_parsed_idx on private.capital_debt_native_bindings(organization_id,parsed_retained_payload_id);
create index capital_debt_native_final_idx on private.capital_debt_native_bindings(organization_id,final_retained_payload_id);
alter table private.capital_debt_native_bindings enable row level security;
alter table private.capital_debt_native_bindings force row level security;
revoke all on private.capital_debt_native_bindings from public,anon,authenticated,service_role;
create policy capital_debt_native_deny_select on private.capital_debt_native_bindings as restrictive for select to anon,authenticated using(false);
create policy capital_debt_native_deny_insert on private.capital_debt_native_bindings as restrictive for insert to anon,authenticated with check(false);
create policy capital_debt_native_deny_update on private.capital_debt_native_bindings as restrictive for update to anon,authenticated using(false) with check(false);
create policy capital_debt_native_deny_delete on private.capital_debt_native_bindings as restrictive for delete to anon,authenticated using(false);
create trigger capital_debt_native_immutable before update or delete on private.capital_debt_native_bindings for each row execute function private.reject_review_history_mutation_v1();
create trigger capital_debt_native_no_truncate before truncate on private.capital_debt_native_bindings for each statement execute function private.reject_review_history_mutation_v1();
create trigger capital_debt_native_updated_at before update on private.capital_debt_native_bindings for each row execute function private.set_updated_at();
create trigger capital_debt_native_audit after insert on private.capital_debt_native_bindings for each row execute function private.capture_identity_audit_v1();



-- Every native read, review and derived read resolves this actual binding,
-- current private work authority, full licensed source bridge and physical body.
create function private.capital_debt_native_read_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare b private.capital_debt_native_bindings;a private.capital_public_payload_allocations;d timestamptz;r public.artifact_revisions;
 projection record;projection_deadline timestamptz;projection_count integer:=0;
begin
 select * into b from private.capital_debt_native_bindings where organization_id=p_org and revision_id=p_revision;
 if b.id is null then return true;end if;
 if not private.capital_body_subject_allowed_v1(p_org,b.work_id,p_actor) then return false;end if;
 select * into r from public.artifact_revisions where organization_id=p_org and id=p_revision;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=p_org and q.id=b.final_retained_payload_id;
 d:=private.capital_debt_recipe_deadline_v1(p_org,b.recipe_id,p_actor);
 if d is null then return false;end if;
 projection_deadline:=private.capital_debt_physical_allocation_bound_v1(p_org,a.id,b.recipe_id);
 if projection_deadline is null then return false;end if;
 d:=least(d,projection_deadline);
 if r.id is null or a.id is null or d is null or not exists(select 1 from public.capital_project_artifacts c where c.organization_id=p_org and c.id=b.capital_artifact_id and c.status not in ('stale','superseded'))
 or r.content_sha256 is distinct from a.payload_fingerprint or r.byte_length is distinct from a.byte_length
 or not private.capital_body_physical_receipt_v1(p_org,b.final_retained_payload_id)
 or not private.capital_body_physical_receipt_v1(p_org,b.parsed_retained_payload_id)
 or not private.capital_body_retention_healthy_v1(a.policy_id,p_org,a.id) then return false;end if;
 -- Every intermediate TaskSpec body is a finite physical dependency of this
 -- final map. A surviving final blob cannot outlive a purged C09/C10 or prelude.
 for projection in select p.*,x.id allocation_id,x.purge_at,tr.status task_status,tr.output_fingerprint,
  c.artifact_fingerprint current_fingerprint,c.status artifact_status
 from private.capital_debt_task_projections p
 join private.capital_public_retained_payloads q on q.organization_id=p.organization_id and q.id=p.derived_retained_payload_id
 join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id
 join public.capital_project_task_runs tr on tr.organization_id=p.organization_id and tr.id=p.task_run_id
 join public.capital_project_artifacts c on c.organization_id=p.organization_id and c.id=p.capital_artifact_id
 where p.organization_id=p_org and p.recipe_id=b.recipe_id loop
  projection_count:=projection_count+1;
  projection_deadline:=private.capital_debt_physical_allocation_bound_v1(p_org,projection.allocation_id,b.recipe_id);
  if projection_deadline is null or projection.task_status is distinct from 'succeeded'
   or projection.output_fingerprint is distinct from projection.artifact_fingerprint
   or projection.current_fingerprint is distinct from projection.artifact_fingerprint
   or projection.artifact_status in('stale','superseded')
   or not private.capital_body_physical_receipt_v1(p_org,projection.derived_retained_payload_id) then return false;end if;
  d:=least(d,projection_deadline,projection.purge_at);
 end loop;
 if projection_count<>23 then return false;end if;
 return least(d,a.purge_at)>clock_timestamp();
end; $$;

create function private.read_capital_debt_result_v1(p_revision_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare b private.capital_debt_native_bindings;a private.capital_public_payload_allocations;d timestamptz;result jsonb;r public.artifact_revisions;
begin
 select * into b from private.capital_debt_native_bindings where revision_id=p_revision_id;
 select * into r from public.artifact_revisions where id=p_revision_id;
 if b.id is null or r.id is null or private.artifact_revision_release_v1(r)='blocked' or not private.capital_debt_native_read_allowed_v1(b.organization_id,b.revision_id,auth.uid()) then raise exception 'capital_debt_read_denied' using errcode='42501';end if;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=b.organization_id and q.id=b.final_retained_payload_id;
 d:=private.capital_debt_allocation_deadline_v1(b.organization_id,a.id,auth.uid());
 result:=jsonb_build_object('schemaVersion','capital-debt-read-scope.v1','revisionId',b.revision_id,'recipeId',b.recipe_id,'finalFingerprint',b.final_fingerprint,'retention',private.capital_debt_body_dto_v1(b.organization_id,a.id,d,true));
 if private.artifact_revision_release_v1(r)='blocked' or not private.capital_debt_native_read_allowed_v1(b.organization_id,b.revision_id,auth.uid()) then raise exception 'capital_debt_read_denied' using errcode='42501';end if;
 return result;
end; $$;

-- C11 is shared by several task DAGs; only its fixed company-debt job/plan
-- family belongs to this native writer. Current project entry is not authority.
create function private.capital_debt_native_task_family_v1(p_org uuid,p_task_run_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.capital_project_task_runs tr
 join public.capital_project_plan_tasks pt on(pt.organization_id,pt.id,pt.plan_id)=(tr.organization_id,tr.plan_task_id,tr.plan_id)
 join public.capital_project_plans p on(p.organization_id,p.id,p.capital_project_id)=(tr.organization_id,tr.plan_id,tr.capital_project_id)
 join public.processing_jobs j on(j.organization_id,j.id)=(tr.organization_id,tr.processing_job_id)
 where tr.organization_id=p_org and tr.id=p_task_run_id and pt.capital_project_id=tr.capital_project_id
 and p.entry_job='company_debt_view' and p.snapshot#>>'{job,id}'='company_debt_view'
 and j.payload->>'analysis_scope'='company_debt_view' and j.payload->>'capital_project_plan_id'=p.id::text
 and j.payload->>'capital_project_id'=p.capital_project_id::text and(j.work_id is null or j.work_id=p.capital_project_id));
$$;
revoke all on function private.capital_debt_native_task_family_v1(uuid,uuid) from public,anon,authenticated,service_role;

-- Close the historical C11 writer by actual TaskSpec, not a caller-selected
-- content schema. Its other task families keep the original function unchanged.
alter function private.worker_record_capital_project_artifact(uuid,text,uuid,text,text,text,text,jsonb,jsonb,jsonb) rename to worker_record_capital_project_artifact_pre_debt;
create function private.worker_record_capital_project_artifact(p_job_id uuid,p_capability_token text,p_task_run_id uuid,p_artifact_type text,
 p_schema_version text,p_status text,p_input_fingerprint text,p_content jsonb,p_evidence_refs jsonb default '[]',p_dependencies jsonb default '[]')
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);
begin
 if private.capital_debt_native_task_family_v1(j.organization_id,p_task_run_id) and ((p_artifact_type='company_debt_diagnostic' and j.payload->>'analysis_scope'='company_debt_view') or exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id where tr.organization_id=j.organization_id and tr.id=p_task_run_id and pt.task_id='C11')) then raise exception 'capital_debt_native_commit_required' using errcode='42501';end if;
 return private.worker_record_capital_project_artifact_pre_debt(p_job_id,p_capability_token,p_task_run_id,p_artifact_type,p_schema_version,p_status,p_input_fingerprint,p_content,p_evidence_refs,p_dependencies);
end; $$;
revoke all on function private.worker_record_capital_project_artifact_pre_debt(uuid,text,uuid,text,text,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

alter function private.worker_finish_capital_project_task(uuid,text,uuid,text,jsonb,text,jsonb,jsonb,jsonb) rename to worker_finish_capital_project_task_pre_debt;
create function private.worker_finish_capital_project_task(p_job_id uuid,p_capability_token text,p_task_run_id uuid,p_status text,
 p_output_reference jsonb default null,p_output_fingerprint text default null,p_quality_results jsonb default '[]',p_usage jsonb default '{}',p_error jsonb default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);
begin
 if p_status='failed' and exists(select 1 from private.capital_debt_recipe_seals z where z.organization_id=j.organization_id and z.execution_plan_task_run_id=p_task_run_id) then raise exception 'capital_debt_native_quality_required' using errcode='42501';end if;
 if p_status='succeeded' and private.capital_debt_native_task_family_v1(j.organization_id,p_task_run_id) and exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id where tr.organization_id=j.organization_id and tr.id=p_task_run_id and pt.task_id='C11') then raise exception 'capital_debt_native_commit_required' using errcode='42501';end if;
 return private.worker_finish_capital_project_task_pre_debt(p_job_id,p_capability_token,p_task_run_id,p_status,p_output_reference,p_output_fingerprint,p_quality_results,p_usage,p_error);
end; $$;
revoke all on function private.worker_finish_capital_project_task_pre_debt(uuid,text,uuid,text,jsonb,text,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

alter function private.project_legacy_artifact_revision_v1(text,uuid,uuid) rename to project_legacy_artifact_revision_pre_debt_v1;
create function private.project_legacy_artifact_revision_v1(p_table text,p_org uuid,p_row uuid)
returns integer language plpgsql security definer set search_path='' as $$
begin
 if p_table='capital_project_artifacts' and exists(select 1 from private.capital_debt_native_bindings b where b.organization_id=p_org and b.capital_artifact_id=p_row) then return 0;end if;
 return private.project_legacy_artifact_revision_pre_debt_v1(p_table,p_org,p_row);
end; $$;
revoke all on function private.project_legacy_artifact_revision_pre_debt_v1(text,uuid,uuid) from public,anon,authenticated,service_role;

-- Pre-accepted terminal execution failures cite only real server ledger rows.
create table private.capital_debt_execution_failures (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,
 recipe_id uuid not null,task_run_id uuid not null,reason text not null check(reason in ('model_attempts_exhausted','processing_denied','budget_denied','accepted_body_unavailable')),
 outcome_ids uuid[] not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,task_run_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_debt_recipes(organization_id,work_id,id),
 foreign key(organization_id,task_run_id) references public.capital_project_task_runs(organization_id,id)
);
create index capital_debt_execution_failure_work_idx on private.capital_debt_execution_failures(organization_id,work_id,recipe_id);
alter table private.capital_debt_execution_failures enable row level security;
alter table private.capital_debt_execution_failures force row level security;
revoke all on private.capital_debt_execution_failures from public,anon,authenticated,service_role;
create trigger capital_debt_execution_failure_immutable before update or delete on private.capital_debt_execution_failures for each row execute function private.reject_review_history_mutation_v1();
create trigger capital_debt_execution_failure_no_truncate before truncate on private.capital_debt_execution_failures for each statement execute function private.reject_review_history_mutation_v1();
create function private.worker_record_capital_debt_execution_failure_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_reason text,p_outcome_ids uuid[] default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_debt_recipes:=private.require_capital_debt_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 seal private.capital_debt_recipe_seals;old private.capital_debt_execution_failures;actual uuid[];supplied uuid[];tr public.capital_project_task_runs;replayed boolean:=false;op private.capital_debt_operations;exposure numeric;dispatches integer;server_bound bigint;
begin
 if p_reason is null or p_reason not in ('model_attempts_exhausted','processing_denied','budget_denied','accepted_body_unavailable') or array_position(p_outcome_ids,null) is not null then raise exception 'capital_debt_execution_failure_invalid' using errcode='22023';end if;
 if (p_reason<>'accepted_body_unavailable' and(exists(select 1 from private.capital_debt_accepted_invocations where organization_id=r.organization_id and recipe_id=r.id)
 or exists(select 1 from private.capital_debt_attempt_outcomes o join private.capital_debt_gateway_attempts a on a.organization_id=o.organization_id and a.id=o.attempt_id where a.organization_id=r.organization_id and a.recipe_id=r.id and o.outcome='accepted')))
 or exists(select 1 from private.capital_debt_native_bindings where organization_id=r.organization_id and recipe_id=r.id)
 or exists(select 1 from private.capital_debt_quality_failures where organization_id=r.organization_id and recipe_id=r.id) then raise exception 'capital_debt_execution_failure_proof_denied' using errcode='42501';end if;
 select coalesce(array_agg(o.id order by o.id),'{}'::uuid[]) into actual from private.capital_debt_attempt_outcomes o join private.capital_debt_gateway_attempts a on a.organization_id=o.organization_id and a.id=o.attempt_id where a.organization_id=r.organization_id and a.recipe_id=r.id;
 if p_outcome_ids is null then supplied:=actual;else select coalesce(array_agg(v order by v),'{}'::uuid[]) into supplied from unnest(p_outcome_ids) v;end if;
 if actual is distinct from supplied or(p_reason='model_attempts_exhausted' and(cardinality(actual)=0 or not exists(select 1 from private.capital_debt_gateway_attempts a join private.capital_debt_attempt_outcomes o on o.organization_id=a.organization_id and o.attempt_id=a.id where a.organization_id=r.organization_id and a.recipe_id=r.id and a.used_provider_fallback and o.outcome<>'accepted')
 and not exists(select 1 from private.capital_debt_recipe_seals sealed join private.capital_debt_operations operation on(operation.organization_id,operation.recipe_id)=(sealed.organization_id,sealed.recipe_id)
 where sealed.organization_id=r.organization_id and sealed.recipe_id=r.id and (
 (select count(*) from private.capital_debt_input_dispatches input where(input.organization_id,input.operation_id)=(operation.organization_id,operation.id))>=sealed.effective_max_dispatches
 or (select coalesce(sum(greatest(input.server_reservation_micro_usd,coalesce(outcome.cost_micro_usd,input.server_reservation_micro_usd))),0) from private.capital_debt_input_dispatches input left join private.capital_debt_attempt_outcomes outcome on(outcome.organization_id,outcome.input_receipt_id)=(input.organization_id,input.id) where(input.organization_id,input.operation_id)=(operation.organization_id,operation.id))+(private.capital_debt_dispatch_policy_v1('gpt-5.6-terra',100000)->>'serverBoundMicroUsd')::bigint>sealed.effective_budget_micro_usd))))
 or(p_reason='processing_denied' and(cardinality(actual)<>0 or not exists(select 1 from private.capital_debt_gateway_attempts a where a.organization_id=r.organization_id and a.recipe_id=r.id and not a.allowed and not a.used_provider_fallback) or not exists(select 1 from private.capital_debt_gateway_attempts a where a.organization_id=r.organization_id and a.recipe_id=r.id and not a.allowed and a.used_provider_fallback))) then raise exception 'capital_debt_execution_failure_proof_denied' using errcode='42501';end if;
 if p_reason='accepted_body_unavailable' and(not exists(select 1 from private.capital_debt_accepted_invocations where organization_id=r.organization_id and recipe_id=r.id)
 or exists(select 1 from private.capital_debt_body_bases b join private.capital_public_payload_allocations a on a.organization_id=b.organization_id and a.debt_body_basis_id=b.id join private.capital_public_retained_payloads q on q.organization_id=a.organization_id and q.allocation_id=a.id where b.organization_id=r.organization_id and b.recipe_id=r.id and b.kind='parsed' and private.capital_body_physical_receipt_v1(q.organization_id,q.id))) then raise exception 'capital_debt_execution_failure_proof_denied' using errcode='42501';end if;
 if p_reason='budget_denied' then
 select * into op from private.capital_debt_operations where organization_id=r.organization_id and recipe_id=r.id;
 select count(*),coalesce(sum(greatest(d.server_reservation_micro_usd,coalesce(o.cost_micro_usd,d.server_reservation_micro_usd))),0) into dispatches,exposure from private.capital_debt_input_dispatches d left join private.capital_debt_attempt_outcomes o on o.organization_id=d.organization_id and o.input_receipt_id=d.id where d.organization_id=r.organization_id and d.operation_id=op.id;
 select case when dispatches=0 then least((private.capital_debt_dispatch_policy_v1('claude-sonnet-5',100000)->>'serverBoundMicroUsd')::bigint,(private.capital_debt_dispatch_policy_v1('gpt-5.6-terra',100000)->>'serverBoundMicroUsd')::bigint) else(private.capital_debt_dispatch_policy_v1('gpt-5.6-terra',100000)->>'serverBoundMicroUsd')::bigint end into server_bound;
 if not exists(select 1 from private.capital_debt_recipe_seals z where z.organization_id=r.organization_id and z.recipe_id=r.id and(dispatches>=z.effective_max_dispatches or exposure+server_bound>z.effective_budget_micro_usd)) then raise exception 'capital_debt_execution_failure_proof_denied' using errcode='42501';end if;
 end if;
 select * into strict seal from private.capital_debt_recipe_seals where organization_id=r.organization_id and recipe_id=r.id;
 select * into old from private.capital_debt_execution_failures where organization_id=r.organization_id and recipe_id=r.id;
 if old.id is not null then
 if (old.reason,old.outcome_ids) is distinct from(p_reason,supplied) then raise exception 'capital_debt_execution_failure_conflict' using errcode='23505';end if;
 replayed:=true;
 else
 select * into tr from public.capital_project_task_runs where organization_id=r.organization_id and id=seal.execution_plan_task_run_id for update;
 if tr.status is distinct from 'succeeded' then raise exception 'capital_debt_execution_failure_task_denied' using errcode='42501';end if;
 insert into private.capital_debt_execution_failures(organization_id,work_id,recipe_id,task_run_id,reason,outcome_ids) values(r.organization_id,r.work_id,r.id,seal.execution_plan_task_run_id,p_reason,supplied) returning * into old;
 end if;
 perform private.require_capital_debt_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 return jsonb_build_object('schemaVersion','capital-debt-execution-failure-receipt.v1','recipeId',r.id,'executionPlanTaskRunId',seal.execution_plan_task_run_id,'reason',old.reason,'outcomeIds',to_jsonb(old.outcome_ids),'replayed',replayed);
end; $$;

-- Terminal quality failures are native history, never a reusable execution grant.
create table private.capital_debt_quality_failures (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,
 recipe_id uuid not null,task_run_id uuid not null,accepted_invocation_id uuid not null,
 parsed_retained_payload_id uuid not null,final_retained_payload_id uuid not null,
 final_fingerprint text not null check(final_fingerprint~'^[a-f0-9]{64}$'),quality_results jsonb not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,task_run_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_debt_recipes(organization_id,work_id,id),
 foreign key(organization_id,task_run_id) references public.capital_project_task_runs(organization_id,id),
 foreign key(organization_id,accepted_invocation_id) references private.capital_debt_accepted_invocations(organization_id,id),
 foreign key(organization_id,parsed_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,final_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id)
);
create index capital_debt_quality_work_recipe_idx on private.capital_debt_quality_failures(organization_id,work_id,recipe_id);
create index capital_debt_quality_accepted_idx on private.capital_debt_quality_failures(organization_id,accepted_invocation_id);
create index capital_debt_quality_parsed_idx on private.capital_debt_quality_failures(organization_id,parsed_retained_payload_id);
create index capital_debt_quality_final_idx on private.capital_debt_quality_failures(organization_id,final_retained_payload_id);
alter table private.capital_debt_quality_failures enable row level security;
alter table private.capital_debt_quality_failures force row level security;
revoke all on private.capital_debt_quality_failures from public,anon,authenticated,service_role;
create trigger capital_debt_quality_immutable before update or delete on private.capital_debt_quality_failures for each row execute function private.reject_review_history_mutation_v1();
create trigger capital_debt_quality_no_truncate before truncate on private.capital_debt_quality_failures for each statement execute function private.reject_review_history_mutation_v1();

create function private.capital_debt_quality_failure_dto_v1(p_org uuid,p_recipe uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion','capital-debt-quality-failure.v1','acceptedInvocationId',q.accepted_invocation_id,
 'parsedRetainedPayloadId',q.parsed_retained_payload_id,'finalRetainedPayloadId',q.final_retained_payload_id,'finalFingerprint',q.final_fingerprint,'qualityResults',q.quality_results)
 from private.capital_debt_quality_failures q where q.organization_id=p_org and q.recipe_id=p_recipe;
$$;

create function private.worker_record_capital_debt_quality_failure_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,
 p_accepted_invocation_id uuid,p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_debt_recipes:=private.require_capital_debt_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 seal private.capital_debt_recipe_seals;old private.capital_debt_quality_failures;ok private.capital_debt_accepted_invocations;
 pb private.capital_debt_body_bases;fb private.capital_debt_body_bases;pa private.capital_public_payload_allocations;fa private.capital_public_payload_allocations;tr public.capital_project_task_runs;
begin
 if jsonb_typeof(p_quality_results) is distinct from 'array' or jsonb_array_length(p_quality_results)<>7
 or exists(select 1 from jsonb_array_elements(p_quality_results) q where jsonb_typeof(q) is distinct from 'object' or not(q?&array['id','passed']) or q-array['id','passed']<>'{}' or jsonb_typeof(q->'passed') is distinct from 'boolean')
 or not exists(select 1 from jsonb_array_elements(p_quality_results) q where q->'passed'='false'::jsonb)
 or exists(select 1 from unnest(array['schema','citation_allowlist','business_evidence','capacity_boundary','next_batch','unsupported_material_numbers','scope_boundary']) k where(select count(*) from jsonb_array_elements(p_quality_results) q where q->>'id'=k)<>1)
 then raise exception 'capital_debt_quality_failure_invalid' using errcode='22023';end if;
 select * into strict seal from private.capital_debt_recipe_seals where organization_id=r.organization_id and recipe_id=r.id;
 select * into ok from private.capital_debt_accepted_invocations where organization_id=r.organization_id and recipe_id=r.id and id=p_accepted_invocation_id;
 select x.* into pa from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=r.organization_id and q.id=p_parsed_retained_payload_id and x.content_kind='debt_body';
 select x.* into fa from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=r.organization_id and q.id=p_final_retained_payload_id and x.content_kind='debt_body';
 select * into pb from private.capital_debt_body_bases where organization_id=r.organization_id and id=pa.debt_body_basis_id;
 select * into fb from private.capital_debt_body_bases where organization_id=r.organization_id and id=fa.debt_body_basis_id;
 if ok.id is null or pb.kind is distinct from 'parsed' or fb.kind is distinct from 'final' or pb.recipe_id is distinct from r.id or fb.recipe_id is distinct from r.id
 or pb.accepted_invocation_id is distinct from ok.id or fb.accepted_invocation_id is distinct from ok.id or fb.parent_retained_payload_id is distinct from p_parsed_retained_payload_id
 or pb.semantic_fingerprint is distinct from ok.output_fingerprint or fb.semantic_fingerprint is distinct from p_final_fingerprint
 or not private.capital_body_physical_receipt_v1(r.organization_id,p_parsed_retained_payload_id) or not private.capital_body_physical_receipt_v1(r.organization_id,p_final_retained_payload_id)
 or private.capital_debt_allocation_deadline_v1(r.organization_id,pa.id,r.human_subject_id) is null or private.capital_debt_allocation_deadline_v1(r.organization_id,fa.id,r.human_subject_id) is null
 then raise exception 'capital_debt_quality_failure_proof_denied' using errcode='42501';end if;
 select * into old from private.capital_debt_quality_failures where organization_id=r.organization_id and recipe_id=r.id;
 if old.id is not null then
 if (old.accepted_invocation_id,old.parsed_retained_payload_id,old.final_retained_payload_id,old.final_fingerprint,old.quality_results) is distinct from(p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results) then raise exception 'capital_debt_quality_failure_conflict' using errcode='23505';end if;
 return jsonb_build_object('schemaVersion','capital-debt-quality-failure-receipt.v1','recipeId',r.id,'executionPlanTaskRunId',seal.execution_plan_task_run_id,'qualityFailure',private.capital_debt_quality_failure_dto_v1(r.organization_id,r.id),'replayed',true);
 end if;
 select * into tr from public.capital_project_task_runs where organization_id=r.organization_id and id=seal.execution_plan_task_run_id for update;
 if tr.status is distinct from 'succeeded' or exists(select 1 from private.capital_debt_native_bindings where organization_id=r.organization_id and recipe_id=r.id) then raise exception 'capital_debt_quality_failure_task_denied' using errcode='42501';end if;
 insert into private.capital_debt_quality_failures(organization_id,work_id,recipe_id,task_run_id,accepted_invocation_id,parsed_retained_payload_id,final_retained_payload_id,final_fingerprint,quality_results)
 values(r.organization_id,r.work_id,r.id,seal.execution_plan_task_run_id,ok.id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results);
 perform private.require_capital_debt_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 return jsonb_build_object('schemaVersion','capital-debt-quality-failure-receipt.v1','recipeId',r.id,'executionPlanTaskRunId',seal.execution_plan_task_run_id,'qualityFailure',private.capital_debt_quality_failure_dto_v1(r.organization_id,r.id),'replayed',false);
end; $$;

-- Explicit API denial policies and metadata-only audit match the stage contract.
do $$declare t text;op text;begin
 foreach t in array array['capital_debt_quality_failures','capital_debt_execution_failures'] loop
 foreach op in array array['select','insert','update','delete'] loop
 execute format('create policy %I on private.%I as restrictive for %s to anon,authenticated %s',t||'_deny_'||op,t,op,case when op='insert' then 'with check(false)' when op='update' then 'using(false) with check(false)' else 'using(false)' end);
 end loop;
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated_at',t);
 execute format('create trigger %I after insert on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 end loop;
end;$$;

create function private.capital_debt_commit_result_core_v1(p_org uuid,p_recipe uuid,p_accepted uuid,p_parsed uuid,p_final uuid,p_final_fingerprint text,p_quality_results jsonb,p_job uuid,p_capability text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_debt_recipes;s private.capital_debt_recipe_seals;b private.capital_debt_native_bindings;ok private.capital_debt_accepted_invocations;
 parsed private.capital_public_payload_allocations;final private.capital_public_payload_allocations;pb private.capital_debt_body_bases;fb private.capital_debt_body_bases;
 tr public.capital_project_task_runs;a public.artifacts;head public.artifact_revisions;manifest jsonb;projection jsonb;fp text;
 rid uuid:=gen_random_uuid();aid uuid:=gen_random_uuid();version integer;deps jsonb;receipt uuid;ref jsonb;stamp timestamptz:=clock_timestamp();deadline timestamptz;final_run uuid;authorized_job public.processing_jobs;
begin
 authorized_job:=private.capital_public_capture_job_v1(p_job,p_capability);
 if authorized_job.organization_id is distinct from p_org then raise exception 'capital_debt_task_denied' using errcode='42501';end if;
 if jsonb_typeof(p_quality_results) is distinct from 'array' or jsonb_array_length(p_quality_results)<>7
 or exists(select 1 from jsonb_array_elements(p_quality_results) q where jsonb_typeof(q) is distinct from 'object' or not(q?&array['id','passed']) or q-array['id','passed']<>'{}' or q->'passed' is distinct from 'true'::jsonb)
 or exists(select 1 from unnest(array['schema','citation_allowlist','business_evidence','capacity_boundary','next_batch','unsupported_material_numbers','scope_boundary']) k where(select count(*) from jsonb_array_elements(p_quality_results) q where q->>'id'=k)<>1) then raise exception 'capital_debt_quality_denied' using errcode='42501';end if;
 select * into strict r from private.capital_debt_recipes where organization_id=p_org and id=p_recipe;
 select * into strict s from private.capital_debt_recipe_seals where organization_id=p_org and recipe_id=r.id;
 if exists(select 1 from private.capital_debt_quality_failures where organization_id=p_org and recipe_id=r.id) or exists(select 1 from private.capital_debt_execution_failures where organization_id=p_org and recipe_id=r.id) then raise exception 'capital_debt_quality_failed_terminal' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-debt-recipe:'||p_org::text||':'||r.id::text,0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 select * into ok from private.capital_debt_accepted_invocations where organization_id=p_org and recipe_id=r.id and id=p_accepted;
 select x.* into parsed from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=p_org and q.id=p_parsed and x.content_kind='debt_body';
 select x.* into final from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=p_org and q.id=p_final and x.content_kind='debt_body';
 select * into pb from private.capital_debt_body_bases where organization_id=p_org and id=parsed.debt_body_basis_id;
 select * into fb from private.capital_debt_body_bases where organization_id=p_org and id=final.debt_body_basis_id;
 if ok.id is null or pb.kind is distinct from 'parsed' or fb.kind is distinct from 'final' or pb.recipe_id<>r.id or fb.recipe_id<>r.id
 or pb.accepted_invocation_id<>ok.id or fb.accepted_invocation_id<>ok.id or fb.parent_retained_payload_id is distinct from p_parsed
 or pb.semantic_fingerprint<>ok.output_fingerprint or fb.semantic_fingerprint is distinct from p_final_fingerprint
 or not private.capital_body_physical_receipt_v1(p_org,p_parsed) or not private.capital_body_physical_receipt_v1(p_org,p_final) then raise exception 'capital_debt_commit_proof_denied' using errcode='42501';end if;
 deadline:=private.capital_debt_recipe_deadline_v1(p_org,r.id,r.human_subject_id);
 if deadline is null or least(deadline,parsed.purge_at,final.purge_at)<=clock_timestamp() or not private.capital_body_retention_healthy_v1(final.policy_id,p_org,final.id) then raise exception 'capital_debt_retention_denied' using errcode='42501';end if;
 if(select count(*) from private.capital_debt_task_projections d where d.organization_id=p_org and d.recipe_id=r.id)<>23
 or exists(select 1 from public.capital_project_plan_tasks pt where pt.organization_id=p_org and pt.plan_id=r.plan_id and pt.task_id<>'C11' and not exists(
  select 1 from private.capital_debt_task_projections d join public.capital_project_task_runs rt on(rt.organization_id,rt.id)=(d.organization_id,d.task_run_id)
  join private.capital_public_retained_payloads q on(q.organization_id,q.id)=(d.organization_id,d.derived_retained_payload_id)
  where d.organization_id=p_org and d.recipe_id=r.id and rt.plan_task_id=pt.id and rt.status='succeeded'
  and (case when pt.task_id in('M01','M02','M03','M04','M05','M06') then d.accepted_invocation_id is null and d.parsed_retained_payload_id is null else d.accepted_invocation_id=ok.id and d.parsed_retained_payload_id=p_parsed end)
  and private.capital_body_physical_receipt_v1(p_org,d.derived_retained_payload_id) and private.capital_debt_allocation_deadline_v1(p_org,q.allocation_id,r.human_subject_id) is not null))
 then raise exception 'capital_debt_complete_task_chain_required' using errcode='42501';end if;
 select * into b from private.capital_debt_native_bindings where organization_id=p_org and recipe_id=r.id;
 if b.id is not null then
 if b.accepted_invocation_id<>p_accepted or b.parsed_retained_payload_id<>p_parsed or b.final_retained_payload_id<>p_final or b.final_fingerprint<>p_final_fingerprint then raise exception 'capital_debt_commit_conflict' using errcode='23505';end if;
 return jsonb_build_object('schemaVersion','capital-debt-commit-receipt.v1','recipeId',r.id,'executionPlanTaskRunId',s.execution_plan_task_run_id,'taskRunId',b.task_run_id,'capitalArtifactId',b.capital_artifact_id,'revisionId',b.revision_id,'finalFingerprint',b.final_fingerprint,'artifactFingerprint',(select artifact_fingerprint from public.capital_project_artifacts where organization_id=p_org and id=b.capital_artifact_id),'artifactVersion',(select artifact_version from public.capital_project_artifacts where organization_id=p_org and id=b.capital_artifact_id),'replayed',true);
 end if;
 -- The paid response is separate from the real succeeded M06 execution plan. An exact
 -- physical prelude bridge is required; C11 starts only after C09/C10.
 select * into tr from public.capital_project_task_runs where organization_id=p_org and id=s.execution_plan_task_run_id for update;
 if tr.status<>'succeeded' or tr.processing_job_id<>r.job_id or tr.plan_id<>r.plan_id
 or not exists(select 1 from private.capital_debt_task_projections d where d.organization_id=p_org and d.recipe_id=r.id and d.task_run_id=s.execution_plan_task_run_id and d.accepted_invocation_id is null and d.parsed_retained_payload_id is null)
 then raise exception 'capital_debt_producer_not_committed' using errcode='42501';end if;
 if (authorized_job.payload->>'capital_project_plan_id',authorized_job.payload->>'capital_project_brief_id') is distinct from (r.plan_id::text,r.brief_id::text) then raise exception 'capital_debt_task_denied' using errcode='42501';end if;
 -- Existing server command checks the exact capability and all plan dependency
 -- statuses. This does not replace or reorder C09/C10 to accommodate the model.
 final_run:=private.worker_start_capital_project_task(p_job,p_capability,'C11','offroad.company_debt_view','2026.09.01-v1',s.reconstruction_fingerprint,
 jsonb_build_object('schemaVersion','capital-debt-final-task-context.v1','recipeId',r.id,'executionPlanTaskRunId',s.execution_plan_task_run_id,'acceptedInvocationId',ok.id));
 select * into tr from public.capital_project_task_runs where organization_id=p_org and id=final_run for update;
 if tr.status<>'running' or tr.processing_job_id<>p_job or tr.plan_id<>r.plan_id then raise exception 'capital_debt_task_denied' using errcode='42501';end if;
 if exists(select 1 from public.capital_project_plan_tasks pt cross join lateral unnest(pt.dependencies) needed(task_id)
 where pt.organization_id=p_org and pt.plan_id=r.plan_id and pt.task_id='C11' and not exists(
 select 1 from public.capital_project_plan_tasks dep join public.capital_project_task_runs rt on rt.organization_id=dep.organization_id and rt.plan_task_id=dep.id and rt.status='succeeded'
 join public.capital_project_artifacts ca on ca.organization_id=rt.organization_id and ca.task_run_id=rt.id and ca.status not in('stale','superseded')
 left join private.capital_debt_task_projections bridge on bridge.organization_id=ca.organization_id and bridge.capital_artifact_id=ca.id
 where dep.organization_id=p_org and dep.plan_id=r.plan_id and dep.task_id=needed.task_id
 and bridge.recipe_id=r.id and bridge.accepted_invocation_id=ok.id and private.capital_body_physical_receipt_v1(p_org,bridge.derived_retained_payload_id)))
 then raise exception 'capital_debt_final_dependencies_denied' using errcode='42501';end if;
 if exists(select 1 from private.capital_debt_recipe_components c join public.capital_project_artifacts d on d.organization_id=c.organization_id and d.id=c.dependency_artifact_id where c.organization_id=p_org and c.recipe_id=r.id and c.slot='execution_plan' and(d.status in ('stale','superseded') or d.artifact_version<>c.version)) then raise exception 'capital_debt_dependency_denied' using errcode='42501';end if;
 -- Both writers serialize the same plan/work identity. A reviewed current product
 -- can only be replaced after the existing explicit invalidation command.
 perform 1 from public.capital_project_plans where organization_id=p_org and id=r.plan_id for update;
 if exists(select 1 from public.capital_project_artifacts where organization_id=p_org and capital_project_id=r.work_id and artifact_type='company_debt_diagnostic' and status in ('confirmed','approved')) then raise exception 'capital_artifact_confirmed_requires_invalidation' using errcode='42501';end if;
 select coalesce(max(artifact_version),0)+1 into version from public.capital_project_artifacts where organization_id=p_org and capital_project_id=r.work_id and artifact_type='company_debt_diagnostic';
 select * into a from public.artifacts where organization_id=p_org and work_id=r.work_id and kind='work_product' and subject='C11 company debt diagnostic' for update;
 if a.id is null then insert into public.artifacts(organization_id,work_id,kind,subject) values(p_org,r.work_id,'work_product','C11 company debt diagnostic') returning * into a;end if;
 select * into head from public.artifact_revisions where organization_id=p_org and id=a.head_revision_id;
 manifest:=jsonb_build_object('schemaVersion','artifact-manifest.2026.09.26-v1','kind','work_product','audience','internal','format','json',
 'bytes',jsonb_build_object('sha256',final.payload_fingerprint,'byteLength',final.byte_length,'storage',jsonb_build_object('bucket',final.bucket_id,'path',final.object_path)),
 'method',null,'execution',null,'inputSnapshot',jsonb_build_object('fingerprint',s.reconstruction_fingerprint),'institutionalResult',null,
 'sources','[]'::jsonb,'claims','[]'::jsonb,'traces',jsonb_build_array('capital-debt-recipe:'||r.id::text,'capital-debt-accepted:'||ok.id::text),
 'template',null,'provenance',jsonb_build_object('producer','capital-debt-native-producer.v1','jobId',r.job_id,'taskRunId',final_run,'messageId',null,'capability',null),'legacy',null);
 perform private.validate_artifact_manifest_v1(manifest);
 projection:=jsonb_build_object('schemaVersion','capital-debt-projection.v1','revisionId',rid,'recipeId',r.id,'finalFingerprint',p_final_fingerprint,'physicalSha256',final.payload_fingerprint,'byteLength',final.byte_length);
 fp:=encode(extensions.digest(projection::text,'sha256'),'hex');
 select coalesce(jsonb_agg(jsonb_build_object('artifactId',dependency_artifact_id,'artifactFingerprint',d.artifact_fingerprint) order by c.component_no),'[]') into deps from private.capital_debt_recipe_components c join public.capital_project_artifacts d on d.organization_id=c.organization_id and d.id=c.dependency_artifact_id where c.organization_id=p_org and c.recipe_id=r.id and c.slot='execution_plan';
 -- Deferred exact FKs allow the trigger to see real native authority, never a
 -- caller-controlled schema marker, before inserting CPA and revision.
 insert into private.capital_debt_native_bindings(organization_id,work_id,recipe_id,execution_plan_task_run_id,task_run_id,accepted_invocation_id,parsed_retained_payload_id,final_retained_payload_id,capital_artifact_id,revision_id,final_fingerprint,transformation_version)
 values(p_org,r.work_id,r.id,s.execution_plan_task_run_id,final_run,ok.id,p_parsed,p_final,aid,rid,p_final_fingerprint,'company-debt-diagnostic.transform.v1') returning * into b;
 update public.capital_project_artifacts set status='superseded',superseded_at=stamp where organization_id=p_org and capital_project_id=r.work_id and artifact_type='company_debt_diagnostic' and status in ('draft','pending_confirmation');
 insert into public.capital_project_artifacts(id,organization_id,capital_project_id,plan_id,task_run_id,artifact_type,schema_version,artifact_version,status,input_fingerprint,artifact_fingerprint,content,evidence_refs,dependencies,processing_job_id,created_by_kind)
 values(aid,p_org,r.work_id,r.plan_id,final_run,'company_debt_diagnostic','capital-debt-projection.v1',version,'pending_confirmation',s.reconstruction_fingerprint,fp,projection,'[]',deps,r.job_id,'worker');
 insert into public.artifact_revisions(id,organization_id,artifact_id,revision_no,previous_revision_id,audience,origin,manifest,manifest_fingerprint,content_sha256,byte_length)
 values(rid,p_org,a.id,coalesce(head.revision_no,0)+1,head.id,'internal','worker',manifest,encode(extensions.digest(manifest::text,'sha256'),'hex'),final.payload_fingerprint,final.byte_length);
 insert into public.artifact_blocks(organization_id,revision_id,block_no,block_key,kind,content,claims,content_fingerprint) values(p_org,rid,1,'c11-result','section',projection,'[]',fp);
 update public.artifacts set head_revision_id=rid where organization_id=p_org and id=a.id;
 ref:=jsonb_build_object('artifactRevisionId',rid,'manifestFingerprint',encode(extensions.digest(manifest::text,'sha256'),'hex'));
 insert into private.review_basis_receipts(organization_id,work_id,basis_kind,basis_reference,reference_fingerprint,source_count,producer)
 values(p_org,r.work_id,'artifact_revision',ref,encode(extensions.digest(ref::text,'sha256'),'hex'),(select count(*) from private.capital_debt_recipe_components where organization_id=p_org and recipe_id=r.id and slot='source'),'capital-debt-native-producer.v1') returning id into receipt;
 update public.capital_project_task_runs set status='succeeded',completed_at=stamp,output_reference=jsonb_build_object('type','capital_project_artifact','id',aid,'revisionId',rid),output_fingerprint=fp,
 quality_results=p_quality_results,usage='{}',error=null
 where organization_id=p_org and id=final_run;
 if private.capital_debt_recipe_deadline_v1(p_org,r.id,r.human_subject_id) is null or least(deadline,parsed.purge_at,final.purge_at)<=clock_timestamp() then raise exception 'capital_debt_retention_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-debt-commit-receipt.v1','recipeId',r.id,'executionPlanTaskRunId',s.execution_plan_task_run_id,'taskRunId',final_run,'capitalArtifactId',aid,'revisionId',rid,'finalFingerprint',p_final_fingerprint,'artifactFingerprint',fp,'artifactVersion',version,'replayed',false);
end; $$;

create function private.worker_commit_capital_debt_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,
 p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_debt_recipes:=private.require_capital_debt_recipe_v1(p_job_id,p_capability_token,p_recipe_id);result jsonb;
begin
 result:=private.capital_debt_commit_result_core_v1(r.organization_id,r.id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results,p_job_id,p_capability_token);
 if not private.capital_public_capture_clock_current_v1(p_job_id,p_capability_token) then raise exception 'capital_debt_denied' using errcode='42501';end if;
 return result;
end; $$;

-- MIN inheritance includes the parsed object itself, not just its recipe's
-- licensed sources. Purged/changed parent bytes deny the derivative immediately.
create function private.capital_debt_physical_allocation_bound_v1(p_org uuid,p_allocation uuid,p_recipe uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;b private.capital_debt_body_bases;d timestamptz;parent private.capital_public_payload_allocations;pb private.capital_debt_body_bases;
begin
 select * into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation and content_kind='debt_body';
 select * into b from private.capital_debt_body_bases where organization_id=p_org and id=a.debt_body_basis_id;
 if b.id is null or b.recipe_id is distinct from p_recipe then return null;end if;
 d:=a.expires_at;
 if d is null or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 if b.kind in('final','derived','prelude') then
 select x.* into parent from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=p_org and q.id=b.parent_retained_payload_id and x.content_kind='debt_body';
 select * into pb from private.capital_debt_body_bases where organization_id=p_org and id=parent.debt_body_basis_id;
 if pb.recipe_id is distinct from b.recipe_id or (b.kind='prelude' and(pb.kind is distinct from 'context' or b.accepted_invocation_id is not null or pb.accepted_invocation_id is not null or parent.payload_fingerprint is distinct from(select context_fingerprint from private.capital_debt_recipes where organization_id=p_org and id=b.recipe_id)))
 or(b.kind<>'prelude' and(pb.kind is distinct from 'parsed' or pb.accepted_invocation_id is distinct from b.accepted_invocation_id))
 or not private.capital_body_physical_receipt_v1(p_org,b.parent_retained_payload_id)
 or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=parent.id and q.status='pending') then return null;end if;
 d:=least(d,parent.expires_at,parent.purge_at);
 end if;
 if b.kind='final' then
  -- Every completed internal derivative belongs to this accepted body. A lost
  -- or purged predecessor also closes the final artifact's physical lineage.
  if exists(select 1 from private.capital_debt_task_projections bridge where bridge.organization_id=p_org and bridge.recipe_id=b.recipe_id and
   ((bridge.accepted_invocation_id is not null and bridge.accepted_invocation_id is distinct from b.accepted_invocation_id) or not private.capital_body_physical_receipt_v1(p_org,bridge.derived_retained_payload_id)
   or private.capital_debt_physical_allocation_bound_v1(p_org,(select allocation_id from private.capital_public_retained_payloads where organization_id=p_org and id=bridge.derived_retained_payload_id),p_recipe) is null)) then return null;end if;
  select least(d,min(x.purge_at),min(x.expires_at)) into d from private.capital_debt_task_projections bridge
  join private.capital_public_retained_payloads receipt on receipt.organization_id=bridge.organization_id and receipt.id=bridge.derived_retained_payload_id
  join private.capital_public_payload_allocations x on x.organization_id=receipt.organization_id and x.id=receipt.allocation_id
  where bridge.organization_id=p_org and bridge.recipe_id=b.recipe_id;
 end if;
 return case when least(d,a.expires_at,a.purge_at)>clock_timestamp() then least(d,a.expires_at) end;
end; $$;
revoke all on function private.capital_debt_physical_allocation_bound_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Authority/source closure remains current once per call. Physical ancestry is
-- evaluated under that exact recipe; the owner-only bound cannot grant access.
create or replace function private.capital_debt_allocation_deadline_v1(p_org uuid,p_allocation uuid,p_subject uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare b private.capital_debt_body_bases;d timestamptz;physical_bound timestamptz;
begin
 select z.* into b from private.capital_public_payload_allocations a join private.capital_debt_body_bases z on(z.organization_id,z.id)=(a.organization_id,a.debt_body_basis_id)
 where a.organization_id=p_org and a.id=p_allocation and a.content_kind='debt_body';
 if b.id is null then return null;end if;
 d:=private.capital_debt_recipe_deadline_v1(p_org,b.recipe_id,p_subject);
 if d is null then return null;end if;
 physical_bound:=private.capital_debt_physical_allocation_bound_v1(p_org,p_allocation,b.recipe_id);
 if physical_bound is null then return null;end if;
 return case when least(d,physical_bound)>clock_timestamp() then least(d,physical_bound) end;
end; $$;

-- A successor may read immutable retained bytes, but its grant never authorizes
-- model dispatch and never re-labels the recipe's original job or time.
create function private.worker_recover_capital_debt_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_debt_recipes;s private.capital_debt_recipe_seals;
 b private.capital_debt_native_bindings;ok private.capital_debt_accepted_invocations;parsed jsonb;final jsonb;a private.capital_public_payload_allocations;state text;d timestamptz;
begin
 select * into r from private.capital_debt_recipes where organization_id=j.organization_id and id=p_recipe_id and work_id=coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid);
 if r.id is null or (r.plan_id,r.brief_id,r.revision_decision_id) is distinct from ((j.payload->>'capital_project_plan_id')::uuid,(j.payload->>'capital_project_brief_id')::uuid,(j.payload->>'correction_decision_id')::uuid) or not private.capital_body_subject_allowed_v1(j.organization_id,r.work_id,j.authorization_subject_id) then raise exception 'capital_debt_recovery_denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-debt-recipe:'||j.organization_id::text||':'||r.id::text,0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 d:=private.capital_debt_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 select * into s from private.capital_debt_recipe_seals where organization_id=j.organization_id and recipe_id=r.id;
 if d is null or s.id is null or not private.capital_body_physical_receipt_v1(j.organization_id,s.context_retained_payload_id) then raise exception 'capital_debt_recovery_denied' using errcode='42501';end if;
 select * into ok from private.capital_debt_accepted_invocations where organization_id=j.organization_id and recipe_id=r.id;
 select * into b from private.capital_debt_native_bindings where organization_id=j.organization_id and recipe_id=r.id;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id join private.capital_debt_body_bases z on z.organization_id=x.organization_id and z.id=x.debt_body_basis_id where q.organization_id=j.organization_id and z.recipe_id=r.id and z.accepted_invocation_id=ok.id and z.kind='parsed' and q.id=coalesce((select f.parsed_retained_payload_id from private.capital_debt_quality_failures f where f.organization_id=j.organization_id and f.recipe_id=r.id),q.id) order by q.created_at limit 1;
 if a.id is not null and private.capital_body_physical_receipt_v1(j.organization_id,(select id from private.capital_public_retained_payloads where organization_id=j.organization_id and allocation_id=a.id)) and private.capital_debt_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is not null then parsed:=private.capital_debt_body_dto_v1(j.organization_id,a.id,private.capital_debt_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id),true);end if;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id join private.capital_debt_body_bases z on z.organization_id=x.organization_id and z.id=x.debt_body_basis_id where q.organization_id=j.organization_id and z.recipe_id=r.id and z.accepted_invocation_id=ok.id and z.kind='final' and q.id=coalesce((select f.final_retained_payload_id from private.capital_debt_quality_failures f where f.organization_id=j.organization_id and f.recipe_id=r.id),q.id) order by q.created_at limit 1;
 if a.id is not null and private.capital_body_physical_receipt_v1(j.organization_id,(select id from private.capital_public_retained_payloads where organization_id=j.organization_id and allocation_id=a.id)) and private.capital_debt_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is not null then final:=private.capital_debt_body_dto_v1(j.organization_id,a.id,private.capital_debt_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id),true);end if;
 state:=case when exists(select 1 from private.capital_debt_execution_failures q where q.organization_id=j.organization_id and q.recipe_id=r.id) then 'unresolved' when exists(select 1 from private.capital_debt_quality_failures q where q.organization_id=j.organization_id and q.recipe_id=r.id) then 'quality_failed' when b.id is not null then 'committed' when final is not null then 'commit' when parsed is not null then 'transform' else 'unresolved' end;
 if state='quality_failed' and(parsed is null or final is null or not exists(select 1 from private.capital_debt_quality_failures q join private.capital_debt_recipe_seals sealed on(sealed.organization_id,sealed.recipe_id,sealed.execution_plan_task_run_id)=(q.organization_id,q.recipe_id,q.task_run_id) where q.organization_id=j.organization_id and q.recipe_id=r.id)) then raise exception 'capital_debt_recovery_denied' using errcode='42501';end if;
 if b.id is not null and not private.capital_debt_native_read_allowed_v1(j.organization_id,b.revision_id,j.authorization_subject_id) then raise exception 'capital_debt_recovery_denied' using errcode='42501';end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_debt_recovery_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-debt-recovery-grant.v1','mode','recovery','state',state,'recipeId',r.id,'originalJobId',r.job_id,'authorizedJobId',j.id,
 'organizationId',j.organization_id,'workId',r.work_id,'executionPlanTaskRunId',s.execution_plan_task_run_id,'recipe',private.capital_debt_recipe_dto_v1(j.organization_id,r.id),
 'requestPins',jsonb_build_object('schemaVersion','capital-debt-reconstruction-pins.v1','promptFingerprint',s.prompt_fingerprint,'primaryRequestFingerprint',s.primary_request_fingerprint,'fallbackRequestFingerprint',s.fallback_request_fingerprint),
 'qualityFailure',private.capital_debt_quality_failure_dto_v1(j.organization_id,r.id),
 'reconstructionMetadata',jsonb_build_object('schemaVersion','capital-debt-reconstruction-metadata.v1','originalAttempt',r.original_attempt,'researchStatus',s.research_status,'dependencies',(select coalesce(jsonb_agg(jsonb_build_object('id',c.reference_id,'artifactFingerprint',d.artifact_fingerprint) order by c.component_no),'[]') from private.capital_debt_recipe_components c join public.capital_project_artifacts d on d.organization_id=c.organization_id and d.id=c.dependency_artifact_id where c.organization_id=j.organization_id and c.recipe_id=r.id and c.slot='execution_plan')),
 'accepted',case when ok.id is null then null else jsonb_build_object('acceptedInvocationId',ok.id,'inputReceiptId',ok.input_receipt_id,'invocationId',ok.invocation_id,'outputFingerprint',ok.output_fingerprint,'provider',ok.accepted_identity->>'provider','reportedModel',ok.accepted_identity->>'reportedModel') end,
 'context',(select private.capital_debt_body_dto_v1(j.organization_id,x.id,private.capital_debt_allocation_deadline_v1(j.organization_id,x.id,j.authorization_subject_id),true) from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=j.organization_id and q.id=s.context_retained_payload_id),'sources',(select coalesce(jsonb_agg(jsonb_build_object('deliveryId',reference_id,'retainedPayloadId',retained_payload_id) order by component_no),'[]') from private.capital_debt_recipe_components where organization_id=j.organization_id and recipe_id=r.id and slot='source'),
 'parsed',parsed,'final',final,'revisionId',b.revision_id,'capitalArtifactId',b.capital_artifact_id,'expiresAt',d,'dispatchAllowed',false);
end; $$;

create function private.capital_debt_native_ancestry_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare rev uuid;
begin
 for rev in with recursive ancestry(id,path,depth) as(select p_revision,array[p_revision],0 union all select l.derived_from_revision_id,a.path||l.derived_from_revision_id,a.depth+1 from ancestry a join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=a.id and l.link_kind='artifact_revision' where a.depth<64 and not l.derived_from_revision_id=any(a.path)) select distinct id from ancestry loop
 if not private.capital_debt_native_read_allowed_v1(p_org,rev,p_actor) then return false;end if;
 end loop;
 -- Refuse when depth bound cannot prove the full ancestry; no silent truncation.
 if exists(with recursive ancestry(id,path,depth) as(select p_revision,array[p_revision],0 union all select l.derived_from_revision_id,a.path||l.derived_from_revision_id,a.depth+1 from ancestry a join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=a.id and l.link_kind='artifact_revision' where a.depth<64 and not l.derived_from_revision_id=any(a.path)) select 1 from ancestry a join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=a.id and l.link_kind='artifact_revision' where a.depth=64 and not l.derived_from_revision_id=any(a.path)) then return false;end if;
 return true;
end; $$;

alter function private.artifact_review_sources_allowed_v1(uuid,uuid,uuid) rename to artifact_review_sources_allowed_pre_debt_v1;
create function private.artifact_review_sources_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 if not private.capital_debt_native_ancestry_allowed_v1(p_org,p_revision,p_actor) then return false;end if;
 if not private.artifact_review_sources_allowed_pre_debt_v1(p_org,p_revision,p_actor) then return false;end if;
 return private.capital_debt_native_ancestry_allowed_v1(p_org,p_revision,p_actor);
end; $$;

alter function private.review_basis_receipt_authority_v1(uuid,uuid,text,jsonb,uuid) rename to review_basis_receipt_authority_pre_debt_v1;
create function private.review_basis_receipt_authority_v1(p_org uuid,p_work uuid,p_kind text,p_reference jsonb,p_actor uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare receipt private.review_basis_receipts;b private.capital_debt_native_bindings;
begin
 select * into receipt from private.review_basis_receipts where organization_id=p_org and work_id=p_work and basis_kind=p_kind and basis_reference=p_reference and reference_fingerprint=encode(extensions.digest(p_reference::text,'sha256'),'hex');
 if receipt.producer is distinct from 'capital-debt-native-producer.v1' then return private.review_basis_receipt_authority_pre_debt_v1(p_org,p_work,p_kind,p_reference,p_actor);end if;
 select * into b from private.capital_debt_native_bindings where organization_id=p_org and work_id=p_work and revision_id=(p_reference->>'artifactRevisionId')::uuid;
 if b.id is null or p_kind<>'artifact_revision' or receipt.source_count<>(select count(*) from private.capital_debt_recipe_components where organization_id=p_org and recipe_id=b.recipe_id and slot='source') then return 'unresolved';end if;
 if not private.capital_debt_native_ancestry_allowed_v1(p_org,b.revision_id,p_actor) then return 'denied';end if;
 return 'allowed';
end; $$;

alter function private.read_artifact_revision_v1(uuid) rename to read_artifact_revision_pre_debt_v1;
create function private.read_artifact_revision_v1(p_revision uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r public.artifact_revisions;result jsonb;
begin
 select * into r from public.artifact_revisions where id=p_revision;
 result:=private.read_artifact_revision_pre_debt_v1(p_revision);
 if not private.capital_debt_native_ancestry_allowed_v1(r.organization_id,r.id,auth.uid()) then
 result:=jsonb_set(jsonb_set(jsonb_set(result,'{blocks}','[]'),'{revision,manifest}', 'null'),'{restriction}',jsonb_build_object('kind','source_rights','linkIds','[]'::jsonb,'unresolvedRevisionIds',jsonb_build_array(r.id)));
 end if;
 return result;
end; $$;

create function private.wake_capital_debt_retention_v1() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare row_data jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;org uuid:=(row_data->>'organization_id')::uuid;allocation uuid;
begin
 if tg_table_name='capital_project_artifacts' then
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct a.organization_id,a.id from private.capital_public_payload_allocations a join private.capital_debt_body_bases b on b.organization_id=a.organization_id and b.id=a.debt_body_basis_id
 where a.organization_id=org and b.recipe_id in(select recipe_id from private.capital_debt_recipe_components where organization_id=org and dependency_artifact_id=(row_data->>'id')::uuid union select recipe_id from private.capital_debt_native_bindings where organization_id=org and capital_artifact_id=(row_data->>'id')::uuid);
 elsif tg_table_name='capital_public_payload_purge_queue' then
 allocation:=(row_data->>'allocation_id')::uuid;
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct a.organization_id,a.id from private.capital_public_payload_allocations a join private.capital_debt_body_bases b on b.organization_id=a.organization_id and b.id=a.debt_body_basis_id
 where a.organization_id=org and b.recipe_id in(
 select c.recipe_id from private.capital_debt_recipe_components c join private.capital_public_retained_payloads p on p.organization_id=c.organization_id and p.id=c.retained_payload_id where c.organization_id=org and p.allocation_id=allocation
 union select b0.recipe_id from private.capital_public_payload_allocations a0 join private.capital_debt_body_bases b0 on b0.organization_id=a0.organization_id and b0.id=a0.debt_body_basis_id where a0.organization_id=org and a0.id=allocation);
 else
 -- Authority writes only append wake identities. They never wait for purge
 -- leases while holding resource-policy locks; common drain owns q frontier.
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct a.organization_id,a.id from private.capital_public_payload_allocations a join private.capital_debt_body_bases b on b.organization_id=a.organization_id and b.id=a.debt_body_basis_id
 where a.organization_id=org or b.recipe_id in(select c.recipe_id from private.capital_debt_recipe_components c join private.capital_public_delivery_licenses l on l.organization_id=c.organization_id and l.id=c.license_id where l.licensing_organization_id=org);
 end if;
 return case when tg_op='DELETE' then old else new end;
end; $$;
do $$declare t text;begin
 foreach t in array array['source_rights_versions','resource_access_grants','barrier_memberships','access_group_memberships'] loop
 execute format('create trigger %I after insert or update or delete on private.%I for each row execute function private.wake_capital_debt_retention_v1()',t||'_wake_debt',t);
 end loop;
 foreach t in array array['source_bindings','organization_memberships','capital_projects'] loop
 execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.wake_capital_debt_retention_v1()',t||'_wake_debt',t);
 end loop;
end; $$;
create trigger capital_artifact_wake_debt after update of status on public.capital_project_artifacts for each row when(new.status is distinct from old.status and new.status in ('stale','superseded')) execute function private.wake_capital_debt_retention_v1();
create trigger capital_purge_wake_debt after update of status on private.capital_public_payload_purge_queue for each row when(new.status is distinct from old.status) execute function private.wake_capital_debt_retention_v1();

create function private.worker_read_capital_debt_recovery_body_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_retained_payload_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare grant_row jsonb:=private.worker_recover_capital_debt_result_v1(p_job_id,p_capability_token,p_recipe_id);j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 a private.capital_public_payload_allocations;b private.capital_debt_body_bases;s private.capital_debt_recipe_seals;d timestamptz;result jsonb;
begin
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=j.organization_id and q.id=p_retained_payload_id and x.content_kind='debt_body';
 select * into b from private.capital_debt_body_bases where organization_id=j.organization_id and id=a.debt_body_basis_id;
 select * into s from private.capital_debt_recipe_seals where organization_id=j.organization_id and recipe_id=p_recipe_id;
 if b.recipe_id is distinct from p_recipe_id or not private.capital_body_physical_receipt_v1(j.organization_id,p_retained_payload_id)
 or not((b.kind='context' and s.context_retained_payload_id=p_retained_payload_id)
 or(b.kind='parsed' and grant_row#>>'{parsed,retainedPayloadId}'=p_retained_payload_id::text)
 or(b.kind='final' and grant_row#>>'{final,retainedPayloadId}'=p_retained_payload_id::text)) then raise exception 'capital_debt_recovery_body_denied' using errcode='42501';end if;
 d:=private.capital_debt_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id);
 if d is null or not private.capital_body_retention_healthy_v1(a.policy_id,j.organization_id,a.id) then raise exception 'capital_debt_recovery_body_denied' using errcode='42501';end if;
 result:=private.capital_debt_body_dto_v1(j.organization_id,a.id,d,true);
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) or private.capital_debt_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null then raise exception 'capital_debt_recovery_body_denied' using errcode='42501';end if;
 return result;
end; $$;

-- The shared bounded body allocator accepts a recovery principal only through
-- this private discriminant; the ordinary command still requires the original job.


create function private.worker_prepare_capital_debt_output_core_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,
 p_kind text,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid,p_recovery boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.capital_debt_recipes;grant_row jsonb;
 j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);ok private.capital_debt_accepted_invocations;
 b private.capital_debt_body_bases;parent private.capital_debt_body_bases;a private.capital_public_payload_allocations;
 parent_a private.capital_public_payload_allocations;p private.capital_public_retention_policies;deadline timestamptz;fp text;bytes bigint;stamp timestamptz:=clock_timestamp();replayed boolean:=false;
begin
 if p_recovery then
 grant_row:=private.worker_recover_capital_debt_result_v1(p_job_id,p_capability_token,p_recipe_id);
 if p_kind is distinct from 'final' or grant_row->>'state' not in ('transform','commit') or grant_row#>>'{accepted,acceptedInvocationId}' is distinct from p_accepted_invocation_id::text or grant_row#>>'{parsed,retainedPayloadId}' is distinct from p_parent_retained_payload_id::text then raise exception 'capital_debt_recovery_denied' using errcode='42501';end if;
 select * into strict r from private.capital_debt_recipes where organization_id=j.organization_id and id=p_recipe_id;
 else r:=private.require_capital_debt_recipe_v1(p_job_id,p_capability_token,p_recipe_id);end if;
 if exists(select 1 from private.capital_debt_quality_failures where organization_id=j.organization_id and recipe_id=r.id) or exists(select 1 from private.capital_debt_execution_failures where organization_id=j.organization_id and recipe_id=r.id) then raise exception 'capital_debt_quality_failed_terminal' using errcode='42501';end if;
 if p_request_id is null or p_kind not in ('parsed','final') or p_kind is null or jsonb_typeof(p_body) is distinct from 'object'
 or p_output_fingerprint is null or p_output_fingerprint!~'^[a-f0-9]{64}$' then raise exception 'capital_debt_output_invalid' using errcode='22023';end if;
 select * into ok from private.capital_debt_accepted_invocations where organization_id=j.organization_id and job_id=r.job_id and recipe_id=r.id and id=p_accepted_invocation_id;
 if ok.id is null then raise exception 'capital_debt_accepted_denied' using errcode='42501';end if;
 if p_kind='parsed' then
 if p_output_fingerprint<>ok.output_fingerprint or p_parent_retained_payload_id is not null then raise exception 'capital_debt_output_invalid' using errcode='22023';end if;
 else
 if p_body->>'schemaVersion' is distinct from 'company-debt-diagnostic.v1' then raise exception 'capital_debt_final_invalid' using errcode='22023';end if;
 select x.* into parent_a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=j.organization_id and q.id=p_parent_retained_payload_id and x.content_kind='debt_body';
 select * into parent from private.capital_debt_body_bases where organization_id=j.organization_id and id=parent_a.debt_body_basis_id;
 if parent.id is null or parent.kind<>'parsed' or parent.recipe_id<>r.id or parent.accepted_invocation_id<>ok.id or parent.semantic_fingerprint<>ok.output_fingerprint
 or not private.capital_body_physical_receipt_v1(j.organization_id,p_parent_retained_payload_id) then raise exception 'capital_debt_parent_denied' using errcode='42501';end if;
 end if;
 select * into strict p from private.capital_public_retention_policies where id=r.retention_policy_id;
 deadline:=private.capital_debt_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 if p_kind='final' then deadline:=least(deadline,parent_a.expires_at,parent_a.purge_at);end if;
 if deadline is null or deadline-make_interval(secs=>p.purge_margin_seconds)<=stamp or not private.capital_public_retention_healthy_v1(j.leased_by,p.id) then raise exception 'capital_debt_retention_denied' using errcode='42501';end if;
 fp:=encode(extensions.digest(p_body::text,'sha256'),'hex');bytes:=octet_length(p_body::text);
 if bytes not between 1 and 1048576 then raise exception 'capital_debt_body_size_invalid' using errcode='22023';end if;
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and job_id=j.id and request_id=p_request_id and content_kind='debt_body';
 if a.id is not null then
 select * into strict b from private.capital_debt_body_bases where organization_id=j.organization_id and id=a.debt_body_basis_id;
 if b.recipe_id<>r.id or b.kind<>p_kind or b.accepted_invocation_id<>ok.id or b.parent_retained_payload_id is distinct from p_parent_retained_payload_id or b.semantic_fingerprint<>p_output_fingerprint or a.payload_fingerprint<>fp or a.byte_length<>bytes then raise exception 'capital_debt_output_conflict' using errcode='23505';end if;
 replayed:=true;
 if private.capital_debt_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null then raise exception 'capital_debt_retention_denied' using errcode='42501';end if;
 else
 insert into private.capital_debt_body_bases(organization_id,work_id,recipe_id,kind,semantic_fingerprint,accepted_invocation_id,parent_retained_payload_id)
 values(j.organization_id,r.work_id,r.id,p_kind,p_output_fingerprint,ok.id,p_parent_retained_payload_id) returning * into b;
 insert into private.capital_public_payload_allocations(id,organization_id,request_id,job_id,worker_token_id,worker_account_id,capability_sha256,policy_id,
 payload_fingerprint,byte_length,object_path,retained_at,expires_at,purge_at,upload_expires_at,debt_body_basis_id,content_kind)
 values(b.id,j.organization_id,p_request_id,j.id,j.leased_by,auth.uid(),j.capability_sha256,p.id,fp,bytes,j.organization_id::text||'/'||b.id::text||'/payload.json',stamp,deadline,
 deadline-make_interval(secs=>p.purge_margin_seconds),least(stamp+interval '5 minutes',deadline-make_interval(secs=>p.purge_margin_seconds)),b.id,'debt_body') returning * into a;
 insert into private.capital_public_payload_purge_queue(organization_id,allocation_id,next_check_at,effective_purge_at) values(j.organization_id,a.id,least(a.upload_expires_at,a.purge_at),a.purge_at);
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_debt_denied' using errcode='42501';end if;
 return private.capital_debt_body_dto_v1(j.organization_id,a.id,deadline,replayed)||jsonb_build_object('canonicalBody',p_body::text);
end; $$;

create function private.worker_prepare_capital_debt_output_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_kind text,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid default null)
returns jsonb language sql security definer set search_path='' as $$ select private.worker_prepare_capital_debt_output_core_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_kind,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id,false); $$;

create function private.worker_prepare_capital_debt_recovered_output_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_kind text,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid default null)
returns jsonb language sql security definer set search_path='' as $$ select private.worker_prepare_capital_debt_output_core_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_kind,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id,true); $$;

create function private.worker_commit_capital_debt_recovered_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,
 p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare grant_row jsonb:=private.worker_recover_capital_debt_result_v1(p_job_id,p_capability_token,p_recipe_id);j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);result jsonb;
begin
 if grant_row->>'state' not in ('commit','committed') or grant_row#>>'{accepted,acceptedInvocationId}' is distinct from p_accepted_invocation_id::text
 or grant_row#>>'{parsed,retainedPayloadId}' is distinct from p_parsed_retained_payload_id::text or grant_row#>>'{final,retainedPayloadId}' is distinct from p_final_retained_payload_id::text then raise exception 'capital_debt_recovery_denied' using errcode='42501';end if;
 result:=private.capital_debt_commit_result_core_v1(j.organization_id,p_recipe_id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results,p_job_id,p_capability_token);
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_debt_recovery_denied' using errcode='42501';end if;
 return result;
end; $$;

alter function private.decide_capital_project_artifact(uuid,text,text,text) rename to decide_capital_project_artifact_pre_debt;
create function private.decide_capital_project_artifact(p_artifact_id uuid,p_artifact_fingerprint text,p_decision text,p_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.capital_debt_native_bindings where capital_artifact_id=p_artifact_id) then raise exception 'capital_debt_revision_review_required' using errcode='42501';end if;
 return private.decide_capital_project_artifact_pre_debt(p_artifact_id,p_artifact_fingerprint,p_decision,p_note);
end; $$;
revoke all on function private.decide_capital_project_artifact_pre_debt(uuid,text,text,text) from public,anon,authenticated,service_role;

-- Fixed concrete API surface only; internal cores and legacy aliases remain
-- inaccessible even when a caller can execute another RPC in private schema.
create function public.worker_prepare_capital_debt_recipe_v1(p_job_id uuid,p_capability_token text) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_debt_recipe_v1(p_job_id,p_capability_token); $$;
create function public.worker_prepare_capital_debt_context_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_debt_context_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id); $$;
create function public.worker_finalize_capital_debt_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_context_retained_payload_id uuid,p_components jsonb,p_reconstruction_fingerprint text,p_prompt_fingerprint text,p_primary_request_fingerprint text,p_fallback_request_fingerprint text,p_operator_budget_micro_usd bigint,p_operator_max_dispatches integer,p_research_status text) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_finalize_capital_debt_recipe_v1(p_job_id,p_capability_token,p_recipe_id,p_context_retained_payload_id,p_components,p_reconstruction_fingerprint,p_prompt_fingerprint,p_primary_request_fingerprint,p_fallback_request_fingerprint,p_operator_budget_micro_usd,p_operator_max_dispatches,p_research_status); $$;
create function public.worker_commit_capital_debt_body_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid,p_storage_object_id uuid,p_storage_version text,p_verified_sha256 text,p_verified_size bigint) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_commit_capital_debt_body_v1(p_job_id,p_capability_token,p_allocation_id,p_storage_object_id,p_storage_version,p_verified_sha256,p_verified_size); $$;
create function public.worker_read_capital_debt_allocation_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_read_capital_debt_allocation_v1(p_job_id,p_capability_token,p_allocation_id); $$;
create function public.worker_prepare_capital_debt_output_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_kind text,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_debt_output_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_kind,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id); $$;
create function public.worker_prepare_capital_debt_recovered_output_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_kind text,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_debt_recovered_output_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_kind,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id); $$;
create function public.worker_commit_capital_debt_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_commit_capital_debt_result_v1(p_job_id,p_capability_token,p_recipe_id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results); $$;
create function public.worker_commit_capital_debt_recovered_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_commit_capital_debt_recovered_result_v1(p_job_id,p_capability_token,p_recipe_id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results); $$;
create function public.worker_recover_capital_debt_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_recover_capital_debt_result_v1(p_job_id,p_capability_token,p_recipe_id); $$;
create function public.worker_read_capital_debt_recovery_body_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_read_capital_debt_recovery_body_v1(p_job_id,p_capability_token,p_recipe_id,p_retained_payload_id); $$;
create function public.read_capital_debt_result_v1(p_revision_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.read_capital_debt_result_v1(p_revision_id); $$;

create function public.worker_record_capital_debt_execution_failure_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_reason text,p_outcome_ids uuid[] default null) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_record_capital_debt_execution_failure_v1(p_job_id,p_capability_token,p_recipe_id,p_reason,p_outcome_ids); $$;
create function public.worker_record_capital_debt_quality_failure_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.worker_record_capital_debt_quality_failure_v1(p_job_id,p_capability_token,p_recipe_id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results); $$;
do $$declare p record;begin
 for p in select n.nspname,p0.proname,pg_get_function_identity_arguments(p0.oid) args from pg_proc p0 join pg_namespace n on n.oid=p0.pronamespace where n.nspname in ('private','public') and(p0.proname like '%capital_debt%' or p0.proname like '%pre_debt%' or p0.proname in('capital_capture_allocation_deadline_v2','capital_body_storage_job_authority_v1','worker_record_capital_project_artifact','worker_finish_capital_project_task','project_legacy_artifact_revision_v1','artifact_review_sources_allowed_v1','review_basis_receipt_authority_v1','read_artifact_revision_v1','decide_capital_project_artifact')) loop
 execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',p.nspname,p.proname,p.args);
 if p.proname=any(array['worker_load_capital_debt_recovered_projection_state_v1','worker_prepare_capital_debt_recovered_task_projection_v1','worker_commit_capital_debt_recovered_task_projection_v1','worker_read_capital_debt_recovered_task_body_v1','worker_prepare_capital_debt_task_projection_v1','worker_commit_capital_debt_task_projection_v1','worker_read_capital_debt_task_body_v1','worker_record_capital_debt_execution_failure_v1','worker_record_capital_debt_quality_failure_v1','worker_prepare_capital_debt_recipe_v1','worker_prepare_capital_debt_context_v1','worker_finalize_capital_debt_recipe_v1','worker_commit_capital_debt_body_v1','worker_read_capital_debt_allocation_v1','worker_prepare_capital_debt_output_v1','worker_prepare_capital_debt_recovered_output_v1','worker_commit_capital_debt_result_v1','worker_commit_capital_debt_recovered_result_v1','worker_recover_capital_debt_result_v1','worker_read_capital_debt_recovery_body_v1','read_capital_debt_result_v1','worker_authorize_capital_debt_processing_v1','worker_record_capital_debt_input_v1','worker_record_capital_debt_attempt_outcome_v1','worker_record_capital_debt_accepted_v1','worker_record_capital_project_artifact','worker_finish_capital_project_task','read_artifact_revision_v1','decide_capital_project_artifact']) then execute format('grant execute on function %I.%I(%s) to authenticated',p.nspname,p.proname,p.args);end if;
 end loop;
end; $$;

-- Row guards close calls already compiled against the old private OID as well
-- as the public wrapper. Genuine native authority exists before these inserts.
create function private.guard_capital_debt_native_write_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='capital_project_artifacts' then
 if private.capital_debt_native_task_family_v1(new.organization_id,new.task_run_id) and exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id where tr.organization_id=new.organization_id and tr.id=new.task_run_id and(pt.task_id='C11' or(new.artifact_type='company_debt_diagnostic' and exists(select 1 from public.processing_jobs j where j.organization_id=tr.organization_id and j.id=tr.processing_job_id and j.payload->>'analysis_scope'='company_debt_view'))))
 and not exists(select 1 from private.capital_debt_native_bindings b where b.organization_id=new.organization_id and b.task_run_id=new.task_run_id and b.capital_artifact_id=new.id and new.content->>'schemaVersion'='capital-debt-projection.v1' and new.content->>'revisionId'=b.revision_id::text) then raise exception 'capital_debt_native_commit_required' using errcode='42501';end if;
 elsif new.status='failed' and exists(select 1 from private.capital_debt_recipe_seals z where z.organization_id=new.organization_id and z.execution_plan_task_run_id=new.id) then
 raise exception 'capital_debt_execution_plan_immutable' using errcode='42501';
 elsif new.status='succeeded' and private.capital_debt_native_task_family_v1(new.organization_id,new.id) and exists(select 1 from public.capital_project_plan_tasks pt where pt.organization_id=new.organization_id and pt.id=new.plan_task_id and pt.task_id='C11')
 and not exists(select 1 from private.capital_debt_native_bindings b join public.capital_project_artifacts c on c.organization_id=b.organization_id and c.id=b.capital_artifact_id where b.organization_id=new.organization_id and b.task_run_id=new.id and new.output_reference->>'id'=c.id::text and new.output_fingerprint=c.artifact_fingerprint) then raise exception 'capital_debt_native_commit_required' using errcode='42501';end if;
 return new;
end; $$;
create trigger capital_artifact_native_debt_guard before insert on public.capital_project_artifacts for each row execute function private.guard_capital_debt_native_write_v1();
create trigger capital_task_native_debt_guard before update of status,output_reference,output_fingerprint,quality_results,error on public.capital_project_task_runs for each row execute function private.guard_capital_debt_native_write_v1();
revoke all on function private.guard_capital_debt_native_write_v1() from public,anon,authenticated,service_role;

create function private.worker_read_capital_debt_recovery_source_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_retained_payload_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare grant_row jsonb:=private.worker_recover_capital_debt_result_v1(p_job_id,p_capability_token,p_recipe_id);j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 c private.capital_debt_recipe_components;a private.capital_public_payload_allocations;q private.capital_public_retained_payloads;d timestamptz;margin integer;result jsonb;
begin
 select * into c from private.capital_debt_recipe_components where organization_id=j.organization_id and recipe_id=p_recipe_id and slot='source' and retained_payload_id=p_retained_payload_id;
 select * into q from private.capital_public_retained_payloads where organization_id=j.organization_id and id=c.retained_payload_id;
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and id=q.allocation_id and content_kind='public_source' and license_id=c.license_id and delivery_id=c.reference_id;
 if c.id is null or a.id is null or not private.capital_body_physical_receipt_v1(j.organization_id,q.id) then raise exception 'capital_debt_recovery_source_denied' using errcode='42501';end if;
 d:=private.capital_public_retention_deadline_v1(a.license_id,j.organization_id,a.retained_at,a.policy_id);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=a.policy_id;
 if d is null or least(a.purge_at,d-make_interval(secs=>margin))<=clock_timestamp() or not private.capital_body_retention_healthy_v1(a.policy_id,j.organization_id,a.id) then raise exception 'capital_debt_recovery_source_denied' using errcode='42501';end if;
 result:=jsonb_build_object('schemaVersion','capital-public-storage-scope.v1','state','complete','allocationId',a.id,'retainedPayloadId',q.id,'deliveryId',a.delivery_id,
 'bucket',a.bucket_id,'path',a.object_path,'payloadFingerprint',a.payload_fingerprint,'byteLength',a.byte_length,'storageObjectId',q.storage_object_id,'storageVersion',q.storage_version,
 'retainedAt',a.retained_at,'uploadExpiresAt',a.upload_expires_at,'expiresAt',least(a.expires_at,d),'purgeAt',least(a.purge_at,d-make_interval(secs=>margin)));
 if private.capital_debt_recipe_deadline_v1(j.organization_id,p_recipe_id,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_debt_recovery_source_denied' using errcode='42501';end if;
 return result;
end; $$;
create function public.worker_read_capital_debt_recovery_source_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_read_capital_debt_recovery_source_v1(p_job_id,p_capability_token,p_recipe_id,p_retained_payload_id); $$;
revoke all on function private.worker_read_capital_debt_recovery_source_v1(uuid,text,uuid,uuid),public.worker_read_capital_debt_recovery_source_v1(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.worker_read_capital_debt_recovery_source_v1(uuid,text,uuid,uuid),public.worker_read_capital_debt_recovery_source_v1(uuid,text,uuid,uuid) to authenticated;

create or replace function private.worker_revalidate_capital_debt_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_debt_recipes:=private.require_capital_debt_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
begin
 return private.capital_debt_recipe_dto_v1(r.organization_id,r.id);
end; $$;
create function public.worker_revalidate_capital_debt_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_revalidate_capital_debt_recipe_v1(p_job_id,p_capability_token,p_recipe_id); $$;
revoke all on function private.worker_revalidate_capital_debt_recipe_v1(uuid,text,uuid),public.worker_revalidate_capital_debt_recipe_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.worker_revalidate_capital_debt_recipe_v1(uuid,text,uuid),public.worker_revalidate_capital_debt_recipe_v1(uuid,text,uuid) to authenticated;

do $$declare t text;begin
 foreach t in array array['professional_context_profiles','institution_capability_profiles','organization_methodologies','capital_project_briefs','capital_project_plans'] loop
 execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.wake_capital_debt_retention_v1()',t||'_wake_debt',t);
 end loop;
end; $$;
create trigger capital_session_wake_debt after update of company_profile,locale,privacy_status,representation_status on public.document_intake_sessions for each row execute function private.wake_capital_debt_retention_v1();

create function private.worker_find_capital_debt_recovery_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_debt_recipes;state text;
begin
 select * into r from private.capital_debt_recipes where organization_id=j.organization_id and work_id=coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid)
 and plan_id=(j.payload->>'capital_project_plan_id')::uuid and brief_id=(j.payload->>'capital_project_brief_id')::uuid
 and revision_decision_id is not distinct from(j.payload->>'correction_decision_id')::uuid;
 state:=case when r.id is null then 'none' when exists(select 1 from private.capital_debt_accepted_invocations a where a.organization_id=j.organization_id and a.recipe_id=r.id)
 and exists(select 1 from private.capital_debt_recipe_seals s where s.organization_id=j.organization_id and s.recipe_id=r.id)
 and private.capital_debt_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is not null then 'recovery' else 'unresolved' end;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_debt_recovery_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-debt-recovery-discovery.v1','state',state,'recipeId',r.id);
end; $$;
create function public.worker_find_capital_debt_recovery_v1(p_job_id uuid,p_capability_token text) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_find_capital_debt_recovery_v1(p_job_id,p_capability_token); $$;
revoke all on function private.worker_find_capital_debt_recovery_v1(uuid,text),public.worker_find_capital_debt_recovery_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_find_capital_debt_recovery_v1(uuid,text),public.worker_find_capital_debt_recovery_v1(uuid,text) to authenticated;

-- Native capture inherits no historical package/legacy confirmation. Every
-- derived revision needs its own exact current human review before external use.
alter function private.artifact_revision_release_v1(public.artifact_revisions) rename to artifact_revision_release_pre_debt_v1;
create function private.artifact_revision_release_v1(r public.artifact_revisions)
returns text language plpgsql stable security definer set search_path='' as $$
declare approved boolean;
begin
 if exists(with recursive ancestry(id) as(select r.id union select l.derived_from_revision_id from ancestry a join private.artifact_dependency_links l on l.organization_id=r.organization_id and l.revision_id=a.id and l.link_kind='artifact_revision') select 1 from ancestry a join private.capital_debt_native_bindings b on b.organization_id=r.organization_id and b.revision_id=a.id) then
 approved:=exists(select 1 from public.artifact_reviews v join public.artifacts a on a.organization_id=v.organization_id and a.id=v.artifact_id where v.organization_id=r.organization_id and v.artifact_id=r.artifact_id and v.revision_id=r.id and v.work_id=a.work_id and v.manifest_fingerprint=r.manifest_fingerprint and v.audience=r.audience and private.artifact_review_is_active_v1(r.organization_id,v.id));
 return case when approved then 'released' when r.audience='external' then 'blocked' else 'internal' end;
 end if;
 return private.artifact_revision_release_pre_debt_v1(r);
end; $$;
revoke all on function private.artifact_revision_release_pre_debt_v1(public.artifact_revisions),private.artifact_revision_release_v1(public.artifact_revisions) from public,anon,authenticated,service_role;

-- A native C11 uses licensed cross-tenant bridges, never publisher source UUIDs
-- in a consumer manifest. Its real, current recipe/source/body proof supplies
-- review substance without manufacturing financial claims or weakening history.
do $debt_review_substance$
declare definition text;needle text:='has_substance:=';replacement text;matches integer;
begin
 -- Forward review cuts preserve the original foundation under a renamed core.
 -- Locate that one guarded core rather than modifying the current wrapper.
 select count(*),max(pg_get_functiondef(p.oid)) into matches,definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname like 'review_artifact_revision%'
 and p.proargtypes='2950 25 25 2950 25 16 2950 2950'::oidvector
 and position('if not has_substance then raise exception ''review_substance_required''' in p.prosrc)>0
 and position(needle in p.prosrc)>0;
 if matches<>1 then raise exception 'debt_review_substance_definition_drift';end if;
 replacement:='has_substance:=(exists(select 1 from private.capital_debt_native_bindings nb where nb.organization_id=org and nb.revision_id=r.id and exists(select 1 from private.capital_debt_recipe_components src where src.organization_id=nb.organization_id and src.recipe_id=nb.recipe_id and src.slot=''source'') and private.capital_debt_native_read_allowed_v1(org,r.id,actor))) or ';
 execute replace(definition,needle,replacement);
end $debt_review_substance$;
-- A technical account is not the preparer for human separation-of-duty policy.
alter function private.artifact_review_preparer_v1(public.artifact_revisions) rename to artifact_review_preparer_pre_debt_v1;
create function private.artifact_review_preparer_v1(p_revision public.artifact_revisions)
returns uuid language plpgsql stable security definer set search_path='' as $$declare human uuid;begin
 select r.human_subject_id into human from private.capital_debt_native_bindings b join private.capital_debt_recipes r on(r.organization_id,r.id)=(b.organization_id,b.recipe_id) where(b.organization_id,b.revision_id)=(p_revision.organization_id,p_revision.id);
 if found then return human;end if;
 return private.artifact_review_preparer_pre_debt_v1(p_revision);
end$$;
revoke all on function private.artifact_review_preparer_pre_debt_v1(public.artifact_revisions),private.artifact_review_preparer_v1(public.artifact_revisions) from public,anon,authenticated,service_role;

-- Prospective C11 human return. The paid invocation stays distinct from the
-- already succeeded M06 execution-plan TaskRun. No historical task is cloned.
-- No M07 function or migration is edited. Human foundation remains the final
-- reviewer gate; only server-proven C11 bindings select the new producer.
set search_path='';

-- Historical input eligibility is not current display eligibility.
do $$declare def text;needle text:='and c.status not in (''stale'',''superseded'')';begin
 def:=pg_get_functiondef('private.capital_debt_native_read_allowed_v1(uuid,uuid,uuid)'::regprocedure);
 if position(needle in def)=0 then raise exception 'debt_revision_authority_definition_drift';end if;
 execute replace(def,needle,'and c.status<>''stale''');
end $$;
alter function private.read_capital_debt_result_v1(uuid) rename to read_capital_debt_result_before_revision_v1;
create function private.read_capital_debt_result_v1(p_revision_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$begin
 if exists(select 1 from private.capital_debt_native_bindings b join public.capital_project_artifacts c on(c.organization_id,c.id)=(b.organization_id,b.capital_artifact_id) where b.revision_id=p_revision_id and c.status in('stale','superseded')) then raise exception 'capital_debt_read_denied' using errcode='42501';end if;
 return private.read_capital_debt_result_before_revision_v1(p_revision_id);
end $$;
alter function private.artifact_revision_release_v1(public.artifact_revisions) rename to artifact_revision_release_before_debt_revision_v1;
create function private.artifact_revision_release_v1(r public.artifact_revisions) returns text language plpgsql stable security definer set search_path='' as $$begin
 if exists(select 1 from private.capital_debt_native_bindings b join public.capital_project_artifacts c on(c.organization_id,c.id)=(b.organization_id,b.capital_artifact_id) where b.organization_id=r.organization_id and b.revision_id=r.id and c.status in('stale','superseded')) then return 'blocked';end if;
 return private.artifact_revision_release_before_debt_revision_v1(r);
end $$;
revoke all on function private.artifact_revision_release_v1(public.artifact_revisions),private.artifact_revision_release_before_debt_revision_v1(public.artifact_revisions) from public,anon,authenticated,service_role;
-- Supersession of the output is not revocation of its own source history.
do $$declare def text;needle text:=' union select recipe_id from private.capital_debt_native_bindings where organization_id=org and capital_artifact_id=(row_data->>''id'')::uuid';begin
 def:=pg_get_functiondef('private.wake_capital_debt_retention_v1()'::regprocedure);
 if position(needle in def)=0 then raise exception 'debt_revision_wake_definition_drift';end if;
 def:=replace(def,needle,'');
 if position('begin'||chr(10)||' if tg_table_name' in def)=0 then raise exception 'debt_revision_wake_guard_drift';end if;
 def:=replace(def,'begin'||chr(10)||' if tg_table_name','begin'||chr(10)||$guard$ if tg_table_name='capital_projects' and tg_op='UPDATE' and(to_jsonb(new)-array['updated_at','current_phase']) is not distinct from(to_jsonb(old)-array['updated_at','current_phase']) then return new;end if;
 if tg_table_name$guard$);
 execute def;
end $$;

create function private.read_capital_debt_artifact_review_basis_v1(p_project_id uuid,p_artifact_id uuid,p_revision_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare org uuid;actor uuid:=auth.uid();b private.capital_debt_native_bindings;c public.capital_project_artifacts;r public.artifact_revisions;recipe private.capital_debt_recipes;active boolean;begin
 select organization_id into org from public.capital_projects where id=p_project_id and status<>'archived';
 if org is null or not private.can_access_resource_v1(org,p_project_id,'read') then raise exception 'capital_artifact_review_denied' using errcode='42501';end if;
 select * into b from private.capital_debt_native_bindings where organization_id=org and work_id=p_project_id and capital_artifact_id=p_artifact_id and revision_id=p_revision_id;
 select * into c from public.capital_project_artifacts where organization_id=org and capital_project_id=p_project_id and id=p_artifact_id;
 select * into r from public.artifact_revisions where organization_id=org and id=p_revision_id;
 select * into recipe from private.capital_debt_recipes where organization_id=org and id=b.recipe_id;
 if b.id is null or c.id is null or r.id is null or recipe.id is null then raise exception 'capital_artifact_review_basis_unproven' using errcode='42501';end if;
 if not private.artifact_review_sources_allowed_v1(org,r.id,actor) then raise exception 'review_source_access_required' using errcode='42501';end if;
 active:=private.capital_artifact_approval_active_v2(org,r.id);
 return jsonb_build_object('projectId',p_project_id,'artifactId',c.id,'revisionId',r.id,'manifestFingerprint',r.manifest_fingerprint,'artifactFingerprint',c.artifact_fingerprint,
 'artifactType',c.artifact_type,'artifactVersion',c.artifact_version,
 'preparedBy',recipe.human_subject_id,'viewerId',actor,'workAccess',private.can_access_resource_v1(org,p_project_id,'work'),
 'policy',private.review_policy_snapshot_v1(org,p_project_id,actor),'status',case when c.status in('confirmed','approved') and not active then 'pending_confirmation' else c.status end,
 'approvalActive',active,'sourceCount',(select count(*) from private.capital_debt_recipe_components where organization_id=org and recipe_id=recipe.id and slot='source'));
end $$;
create function private.enqueue_capital_debt_revision_v1(p_org uuid,p_capital_artifact uuid,p_review uuid,p_decision uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c public.capital_project_artifacts;b private.capital_debt_native_bindings;r private.capital_debt_recipes;review public.artifact_reviews;
 job uuid:=gen_random_uuid();run uuid:=gen_random_uuid();next_no integer;begin
 select * into c from public.capital_project_artifacts where organization_id=p_org and id=p_capital_artifact;
 select * into b from private.capital_debt_native_bindings where organization_id=p_org and capital_artifact_id=c.id;
 select * into r from private.capital_debt_recipes where organization_id=p_org and id=b.recipe_id;
 select * into review from public.artifact_reviews where organization_id=p_org and id=p_review and revision_id=b.revision_id and act='return';
 if r.id is null or review.id is null or c.artifact_type<>'company_debt_diagnostic' then raise exception 'capital_artifact_revision_producer_unproven' using errcode='42501';end if;
 update public.capital_project_task_runs set status='invalidated',completed_at=clock_timestamp()
 where organization_id=p_org and id=b.task_run_id and status='succeeded';
 if not found then raise exception 'capital_artifact_revision_task_not_invalidateable' using errcode='55000';end if;
 select coalesce(max(run_no),0)+1 into next_no from public.processing_runs where organization_id=p_org and intake_session_id=r.session_id;
 insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,budget,versions,created_by)
 values(run,p_org,r.session_id,next_no,'manual','queued','company-debt-revision-2026.09.01-v1',
 jsonb_build_object('maxCalls',1,'maxCostUsd',0.85,'externalSearchMaxUsd',0),
 jsonb_build_object('planId',r.plan_id,'revisionOfArtifactId',c.id,'correctionDecisionId',p_decision,'revisionId',b.revision_id,'reviewId',review.id,'executor','company-debt-view-2026.09.01-v1'),review.reviewer_id);
 insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,kind,payload,max_attempts)
 values(job,p_org,run,r.session_id,'capital_project_analysis',jsonb_build_object('analysis_scope','company_debt_view','locale',r.locale,
 'capital_project_id',r.work_id,'capital_project_plan_id',r.plan_id,'capital_project_brief_id',r.brief_id,'capital_task_ids',jsonb_build_array('C11'),
 'capital_artifact_required',true,'revision_of_artifact_id',c.id,'correction_decision_id',p_decision,'revision_of_native_revision_id',b.revision_id,
 'revision_review_id',review.id,'revision_block_id',review.block_id,
 'trigger_event',jsonb_build_object('type','artifact_correction_requested','artifactId',c.id,'revisionId',b.revision_id,'decisionId',p_decision,'reviewId',review.id),
 'model_budget',jsonb_build_object('max_cost_usd',0.85,'max_calls',1)),2);
 update public.document_intake_sessions set current_run_id=run,status='processing',processing_started_at=clock_timestamp(),processing_completed_at=null,
 pipeline_version='company-debt-revision-2026.09.01-v1',updated_at=clock_timestamp() where organization_id=p_org and id=r.session_id;
 return jsonb_build_object('jobId',job,'runId',run);
end $$;

alter function private.read_capital_project_artifact_review_v2(uuid,uuid,uuid) rename to read_capital_project_artifact_review_before_debt_return_v2;
create function private.read_capital_project_artifact_review_v2(p_project_id uuid,p_artifact_id uuid,p_revision_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$begin
 if exists(select 1 from private.capital_debt_native_bindings where work_id=p_project_id and capital_artifact_id=p_artifact_id and revision_id=p_revision_id) then return private.read_capital_debt_artifact_review_basis_v1(p_project_id,p_artifact_id,p_revision_id);end if;
 return private.read_capital_project_artifact_review_before_debt_return_v2(p_project_id,p_artifact_id,p_revision_id);
end $$;
alter function private.artifact_review_preparer_v1(public.artifact_revisions) rename to artifact_review_preparer_before_debt_return_v1;
create function private.artifact_review_preparer_v1(p_revision public.artifact_revisions) returns uuid language plpgsql stable security definer set search_path='' as $$declare preparer uuid;begin
 select r.human_subject_id into preparer from private.capital_debt_native_bindings b join private.capital_debt_recipes r on(r.organization_id,r.id)=(b.organization_id,b.recipe_id) where b.organization_id=p_revision.organization_id and b.revision_id=p_revision.id;
 if found then return preparer;end if;return private.artifact_review_preparer_before_debt_return_v1(p_revision);end $$;
alter function private.enqueue_capital_artifact_revision_v2(uuid,uuid,uuid,uuid) rename to enqueue_capital_artifact_revision_before_debt_return_v2;
create function private.enqueue_capital_artifact_revision_v2(p_org uuid,p_capital_artifact uuid,p_review uuid,p_decision uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$begin
 if exists(select 1 from private.capital_debt_native_bindings where organization_id=p_org and capital_artifact_id=p_capital_artifact) then return private.enqueue_capital_debt_revision_v1(p_org,p_capital_artifact,p_review,p_decision);end if;
 return private.enqueue_capital_artifact_revision_before_debt_return_v2(p_org,p_capital_artifact,p_review,p_decision);end $$;

create function private.project_capital_debt_artifact_review_v1() returns trigger language plpgsql volatile security definer set search_path='' as $$
declare b private.capital_debt_native_bindings;c public.capital_project_artifacts;decision uuid;queued jsonb;effect text;active boolean;begin
 select * into b from private.capital_debt_native_bindings where organization_id=new.organization_id and work_id=new.work_id and revision_id=new.revision_id;
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
create trigger capital_debt_artifact_review_bridge after insert on public.artifact_reviews for each row execute function private.project_capital_debt_artifact_review_v1();
alter function private.review_artifact_revision_v1(uuid,text,text,uuid,text,boolean,uuid,uuid) rename to review_artifact_revision_before_debt_return_v1;
create function private.review_artifact_revision_v1(p_revision_id uuid,p_expected_fingerprint text,p_act text,p_block_id uuid,p_note text,
 p_self_approval_declared boolean,p_command_id uuid,p_basis_review_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare b private.capital_debt_native_bindings;c public.capital_project_artifacts;existing public.artifact_reviews;org uuid;begin
 select * into b from private.capital_debt_native_bindings where revision_id=p_revision_id;
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
 return private.review_artifact_revision_before_debt_return_v1(p_revision_id,p_expected_fingerprint,p_act,p_block_id,p_note,p_self_approval_declared,p_command_id,p_basis_review_id);
end $$;

-- Every new private core stays inaccessible through PostgREST.
revoke all on function private.enqueue_capital_debt_revision_v1(uuid,uuid,uuid,uuid),private.enqueue_capital_artifact_revision_before_debt_return_v2(uuid,uuid,uuid,uuid),private.project_capital_debt_artifact_review_v1(),private.read_capital_debt_artifact_review_basis_v1(uuid,uuid,uuid),private.read_capital_project_artifact_review_before_debt_return_v2(uuid,uuid,uuid),private.artifact_review_preparer_before_debt_return_v1(public.artifact_revisions),private.read_capital_debt_result_before_revision_v1(uuid),private.review_artifact_revision_before_debt_return_v1(uuid,text,text,uuid,text,boolean,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.read_capital_project_artifact_review_v2(uuid,uuid,uuid),private.artifact_review_preparer_v1(public.artifact_revisions),private.enqueue_capital_artifact_revision_v2(uuid,uuid,uuid,uuid),private.review_artifact_revision_v1(uuid,text,text,uuid,text,boolean,uuid,uuid),private.read_capital_debt_result_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function private.read_capital_project_artifact_review_v2(uuid,uuid,uuid),private.review_artifact_revision_v1(uuid,text,text,uuid,text,boolean,uuid,uuid),private.read_capital_debt_result_v1(uuid) to authenticated;

-- A revision references original physical history. This row never copies it.
create table private.capital_debt_revision_inputs(
 organization_id uuid not null references public.organizations(id),recipe_id uuid not null,prior_recipe_id uuid not null,
 review_id uuid not null,prior_revision_id uuid not null,prior_final_retained_payload_id uuid not null,predecessor_recipe_id uuid not null,
 depth integer not null check(depth between 1 and 64),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,recipe_id),
 foreign key(organization_id,recipe_id) references private.capital_debt_recipes(organization_id,id),
 foreign key(organization_id,prior_recipe_id) references private.capital_debt_recipes(organization_id,id),
 foreign key(organization_id,predecessor_recipe_id) references private.capital_debt_recipes(organization_id,id),
 foreign key(organization_id,review_id) references public.artifact_reviews(organization_id,id),
 foreign key(organization_id,prior_revision_id) references public.artifact_revisions(organization_id,id),
 foreign key(organization_id,prior_final_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),check(recipe_id<>prior_recipe_id));
create index capital_debt_revision_prior_idx on private.capital_debt_revision_inputs(organization_id,prior_recipe_id);
create index capital_debt_revision_predecessor_idx on private.capital_debt_revision_inputs(organization_id,predecessor_recipe_id);
create index capital_debt_revision_review_idx on private.capital_debt_revision_inputs(organization_id,review_id);
create index capital_debt_revision_revision_idx on private.capital_debt_revision_inputs(organization_id,prior_revision_id);
create index capital_debt_revision_body_idx on private.capital_debt_revision_inputs(organization_id,prior_final_retained_payload_id);
alter table private.capital_debt_revision_inputs enable row level security;
alter table private.capital_debt_revision_inputs force row level security;
revoke all on private.capital_debt_revision_inputs from public,anon,authenticated,service_role;
create policy debt_revision_deny_select on private.capital_debt_revision_inputs as restrictive for select to anon,authenticated using(false);
create policy debt_revision_deny_insert on private.capital_debt_revision_inputs as restrictive for insert to anon,authenticated with check(false);
create policy debt_revision_deny_update on private.capital_debt_revision_inputs as restrictive for update to anon,authenticated using(false) with check(false);
create policy debt_revision_deny_delete on private.capital_debt_revision_inputs as restrictive for delete to anon,authenticated using(false);
create trigger debt_revision_updated before update on private.capital_debt_revision_inputs for each row execute function private.set_updated_at();
create trigger debt_revision_immutable before update or delete on private.capital_debt_revision_inputs for each row execute function private.reject_source_version_mutation_v1();
create trigger debt_revision_no_truncate before truncate on private.capital_debt_revision_inputs for each statement execute function private.reject_review_history_mutation_v1();
create trigger debt_revision_audit after insert on private.capital_debt_revision_inputs for each row execute function private.capture_identity_audit_v1();

-- Eligibility comes from the human projection and original approved dispatch.
-- The worker cannot grant another task or budget by altering its payload.
alter function private.execution_dispatch_is_current(uuid,boolean) rename to execution_dispatch_before_debt_revision_v1;
create function private.capital_debt_revision_dispatch_allowed_v1(p_job_id uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare walker uuid:=p_job_id;visited uuid[]:='{}';depth integer:=0;j public.processing_jobs;
 pr private.capital_artifact_review_projections;review public.artifact_reviews;b private.capital_debt_native_bindings;r private.capital_debt_recipes;
 run public.processing_runs;policy jsonb;
begin
 loop
 if walker=any(visited) or depth>=64 then return false;end if;visited:=visited||walker;depth:=depth+1;
 select * into j from public.processing_jobs where id=walker;
 select * into pr from private.capital_artifact_review_projections where organization_id=j.organization_id and processing_job_id=j.id and effect='return'
 and review_id::text=j.payload->>'revision_review_id' and legacy_decision_id::text=j.payload->>'correction_decision_id'
 and capital_artifact_id::text=j.payload->>'revision_of_artifact_id' and revision_id::text=j.payload->>'revision_of_native_revision_id';
 select * into review from public.artifact_reviews where organization_id=j.organization_id and id=pr.review_id and act='return' and reviewer_id=j.authorization_subject_id;
 select * into b from private.capital_debt_native_bindings where organization_id=j.organization_id and revision_id=pr.revision_id and capital_artifact_id=pr.capital_artifact_id;
 select * into r from private.capital_debt_recipes where organization_id=j.organization_id and id=b.recipe_id;
 select * into run from public.processing_runs where organization_id=j.organization_id and id=j.processing_run_id;
 if j.id is null or pr.id is null or review.id is null or b.id is null or r.id is null or run.id is null
 or j.kind<>'capital_project_analysis' or j.payload->>'analysis_scope' is distinct from 'company_debt_view'
 or j.payload->'capital_task_ids' is distinct from '["C11"]'::jsonb
 or j.payload->'model_budget' is distinct from '{"max_cost_usd":0.85,"max_calls":1}'::jsonb
 or run.budget is distinct from '{"maxCalls":1,"maxCostUsd":0.85,"externalSearchMaxUsd":0}'::jsonb
 or run.created_by<>review.reviewer_id or pr.work_id<>r.work_id or j.work_id<>r.work_id or j.intake_session_id<>r.session_id
 or r.plan_id::text is distinct from j.payload->>'capital_project_plan_id' or r.brief_id::text is distinct from j.payload->>'capital_project_brief_id'
 or not private.capital_body_subject_allowed_v1(j.organization_id,r.work_id,review.reviewer_id)
 or not exists(select 1 from public.capital_project_artifacts c where c.organization_id=j.organization_id and c.id=b.capital_artifact_id and c.status='superseded')
 or not private.artifact_review_sources_allowed_v1(j.organization_id,b.revision_id,review.reviewer_id)
 or not private.capital_debt_native_read_allowed_v1(j.organization_id,b.revision_id,review.reviewer_id) then return false;end if;
 policy:=private.review_policy_snapshot_v1(j.organization_id,r.work_id,review.reviewer_id);
 if (policy->>'assignmentRequired')::boolean and not(policy->'roles'?'reviewer' or policy->'roles'?'approver') then return false;end if;
 if r.revision_decision_id is null then return private.execution_dispatch_before_debt_revision_v1(r.job_id,true);end if;
 if private.capital_debt_recipe_deadline_v1(j.organization_id,r.id,review.reviewer_id) is null then return false;end if;
 walker:=r.job_id;
 end loop;
end $$;
create function private.execution_dispatch_is_current(p_job_id uuid,p_require_accepted boolean default true)
returns boolean language plpgsql volatile security definer set search_path='' as $$begin
 if private.execution_dispatch_before_debt_revision_v1(p_job_id,p_require_accepted) then return true;end if;
 return private.capital_debt_revision_dispatch_allowed_v1(p_job_id);
end $$;
create function private.queue_capital_debt_review_revision_v1() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.effect='return' and new.processing_job_id is not null and private.capital_debt_revision_dispatch_allowed_v1(new.processing_job_id) then
 update public.processing_jobs set status='queued',available_at=clock_timestamp() where organization_id=new.organization_id and id=new.processing_job_id and status='awaiting_approval';end if;
 return new;
end $$;
create trigger capital_debt_review_authorized_dispatch after insert on private.capital_artifact_review_projections for each row execute function private.queue_capital_debt_review_revision_v1();
revoke all on function private.execution_dispatch_before_debt_revision_v1(uuid,boolean),private.execution_dispatch_is_current(uuid,boolean),private.capital_debt_revision_dispatch_allowed_v1(uuid),private.queue_capital_debt_review_revision_v1() from public,anon,authenticated,service_role;

create function private.worker_load_capital_debt_revision_inputs_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 pr private.capital_artifact_review_projections;b private.capital_debt_native_bindings;r private.capital_debt_recipes;root_recipe private.capital_debt_recipes;
 lineage private.capital_debt_revision_inputs;seal private.capital_debt_recipe_seals;a private.capital_public_payload_allocations;
 predecessor record;predecessors jsonb:='[]';d timestamptz;bound timestamptz;visited uuid[]:='{}';depth integer:=0;
begin
 if not private.capital_debt_revision_dispatch_allowed_v1(j.id) then raise exception 'capital_debt_revision_inputs_denied' using errcode='42501';end if;
 select * into pr from private.capital_artifact_review_projections where organization_id=j.organization_id and processing_job_id=j.id and effect='return';
 select * into b from private.capital_debt_native_bindings where organization_id=j.organization_id and revision_id=pr.revision_id and capital_artifact_id=pr.capital_artifact_id;
 select * into r from private.capital_debt_recipes where organization_id=j.organization_id and id=b.recipe_id;
 select * into seal from private.capital_debt_recipe_seals where organization_id=j.organization_id and recipe_id=r.id;
 root_recipe:=r;
 while root_recipe.revision_decision_id is not null loop
 if root_recipe.id=any(visited) or depth>=64 then raise exception 'capital_debt_revision_ancestry_denied' using errcode='42501';end if;
 visited:=visited||root_recipe.id;depth:=depth+1;
 select * into lineage from private.capital_debt_revision_inputs where organization_id=j.organization_id and recipe_id=root_recipe.id;
 if lineage.recipe_id is null then raise exception 'capital_debt_revision_ancestry_denied' using errcode='42501';end if;
 select * into root_recipe from private.capital_debt_recipes where organization_id=j.organization_id and id=lineage.prior_recipe_id;
 if root_recipe.id is null then raise exception 'capital_debt_revision_ancestry_denied' using errcode='42501';end if;
 end loop;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on(x.organization_id,x.id)=(q.organization_id,q.allocation_id) where q.organization_id=j.organization_id and q.id=b.final_retained_payload_id;
 d:=private.capital_debt_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id);
 if d is null or seal.id is null or not private.capital_body_physical_receipt_v1(j.organization_id,b.final_retained_payload_id) then raise exception 'capital_debt_revision_inputs_denied' using errcode='42501';end if;
 for predecessor in select p.*,q.allocation_id from private.capital_debt_task_projections p join private.capital_public_retained_payloads q on(q.organization_id,q.id)=(p.organization_id,p.derived_retained_payload_id)
 join public.capital_project_task_runs tr on(tr.organization_id,tr.id)=(p.organization_id,p.task_run_id)
 join public.capital_project_artifacts c on(c.organization_id,c.id)=(p.organization_id,p.capital_artifact_id)
 where p.organization_id=j.organization_id and p.recipe_id=root_recipe.id and p.task_id in('M06','C09','C10')
 and tr.status='succeeded' and tr.output_fingerprint=p.artifact_fingerprint and c.artifact_fingerprint=p.artifact_fingerprint and c.status not in('stale','superseded')
 order by case p.task_id when 'M06' then 1 when 'C09' then 2 when 'C10' then 3 end loop
 bound:=private.capital_debt_allocation_deadline_v1(j.organization_id,predecessor.allocation_id,j.authorization_subject_id);
 if bound is null or not private.capital_body_physical_receipt_v1(j.organization_id,predecessor.derived_retained_payload_id) then raise exception 'capital_debt_revision_predecessor_denied' using errcode='42501';end if;
 d:=least(d,bound);
 predecessors:=predecessors||jsonb_build_array(jsonb_build_object('taskId',predecessor.task_id,'projection',private.capital_debt_task_projection_dto_v1(j.organization_id,root_recipe.id,predecessor.task_run_id,true),'retention',private.capital_debt_body_dto_v1(j.organization_id,predecessor.allocation_id,bound,true)));
 end loop;
 if jsonb_array_length(predecessors)<>3 or d<=clock_timestamp() or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_debt_revision_predecessor_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-debt-revision-inputs.v1','jobId',j.id,'organizationId',j.organization_id,'workId',r.work_id,'priorRecipeId',r.id,'predecessorRecipeId',root_recipe.id,'priorRevisionId',b.revision_id,'reviewId',pr.review_id,'decisionId',pr.legacy_decision_id,
 'prior',private.capital_debt_body_dto_v1(j.organization_id,a.id,d,true),'predecessors',predecessors,'researchStatus',seal.research_status,
 'sources',(select jsonb_agg(jsonb_build_object('deliveryId',reference_id,'retainedPayloadId',retained_payload_id) order by component_no) from private.capital_debt_recipe_components where organization_id=j.organization_id and recipe_id=r.id and slot='source'),'expiresAt',d);
end $$;
create function private.worker_read_capital_debt_revision_body_v1(p_job_id uuid,p_capability_token text,p_retained_payload_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$declare grant_row jsonb:=private.worker_load_capital_debt_revision_inputs_v1(p_job_id,p_capability_token);begin
 if grant_row#>>'{prior,retainedPayloadId}' is distinct from p_retained_payload_id::text then raise exception 'capital_debt_revision_body_denied' using errcode='42501';end if;
 return grant_row->'prior';end $$;
create function private.worker_read_capital_debt_revision_task_v1(p_job_id uuid,p_capability_token text,p_task_run_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$declare grant_row jsonb:=private.worker_load_capital_debt_revision_inputs_v1(p_job_id,p_capability_token);result jsonb;begin
 select x->'retention' into result from jsonb_array_elements(grant_row->'predecessors')x where x#>>'{projection,taskRunId}'=p_task_run_id::text;
 if result is null then raise exception 'capital_debt_revision_task_denied' using errcode='42501';end if;return result;end $$;
create function public.worker_load_capital_debt_revision_inputs_v1(p_job_id uuid,p_capability_token text) returns jsonb language sql security invoker set search_path='' as $$select private.worker_load_capital_debt_revision_inputs_v1(p_job_id,p_capability_token);$$;
create function public.worker_read_capital_debt_revision_body_v1(p_job_id uuid,p_capability_token text,p_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.worker_read_capital_debt_revision_body_v1(p_job_id,p_capability_token,p_retained_payload_id);$$;
create function public.worker_read_capital_debt_revision_task_v1(p_job_id uuid,p_capability_token text,p_task_run_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.worker_read_capital_debt_revision_task_v1(p_job_id,p_capability_token,p_task_run_id);$$;
revoke all on function private.worker_load_capital_debt_revision_inputs_v1(uuid,text),public.worker_load_capital_debt_revision_inputs_v1(uuid,text),private.worker_read_capital_debt_revision_body_v1(uuid,text,uuid),public.worker_read_capital_debt_revision_body_v1(uuid,text,uuid),private.worker_read_capital_debt_revision_task_v1(uuid,text,uuid),public.worker_read_capital_debt_revision_task_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.worker_load_capital_debt_revision_inputs_v1(uuid,text),public.worker_load_capital_debt_revision_inputs_v1(uuid,text),private.worker_read_capital_debt_revision_body_v1(uuid,text,uuid),public.worker_read_capital_debt_revision_body_v1(uuid,text,uuid),private.worker_read_capital_debt_revision_task_v1(uuid,text,uuid),public.worker_read_capital_debt_revision_task_v1(uuid,text,uuid) to authenticated;

create function private.worker_read_capital_debt_revision_source_v1(p_job_id uuid,p_capability_token text,p_retained_payload_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare grant_row jsonb:=private.worker_load_capital_debt_revision_inputs_v1(p_job_id,p_capability_token);j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 c private.capital_debt_recipe_components;a private.capital_public_payload_allocations;q private.capital_public_retained_payloads;d timestamptz;margin integer;result jsonb;
begin
 select * into c from private.capital_debt_recipe_components where organization_id=j.organization_id and recipe_id=(grant_row->>'priorRecipeId')::uuid and slot='source' and retained_payload_id=p_retained_payload_id;
 select * into q from private.capital_public_retained_payloads where organization_id=j.organization_id and id=c.retained_payload_id;
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and id=q.allocation_id and content_kind='public_source' and license_id=c.license_id and delivery_id=c.reference_id;
 if c.id is null or a.id is null or not private.capital_body_physical_receipt_v1(j.organization_id,q.id) then raise exception 'capital_debt_recovery_source_denied' using errcode='42501';end if;
 d:=private.capital_public_retention_deadline_v1(a.license_id,j.organization_id,a.retained_at,a.policy_id);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=a.policy_id;
 if d is null or least(a.purge_at,d-make_interval(secs=>margin))<=clock_timestamp() or not private.capital_body_retention_healthy_v1(a.policy_id,j.organization_id,a.id) then raise exception 'capital_debt_recovery_source_denied' using errcode='42501';end if;
 result:=jsonb_build_object('schemaVersion','capital-public-storage-scope.v1','state','complete','allocationId',a.id,'retainedPayloadId',q.id,'deliveryId',a.delivery_id,
 'bucket',a.bucket_id,'path',a.object_path,'payloadFingerprint',a.payload_fingerprint,'byteLength',a.byte_length,'storageObjectId',q.storage_object_id,'storageVersion',q.storage_version,
 'retainedAt',a.retained_at,'uploadExpiresAt',a.upload_expires_at,'expiresAt',least(a.expires_at,d),'purgeAt',least(a.purge_at,d-make_interval(secs=>margin)));
 if private.capital_debt_recipe_deadline_v1(j.organization_id,(grant_row->>'priorRecipeId')::uuid,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_debt_recovery_source_denied' using errcode='42501';end if;
 return result;
end; $$;

-- Old prepare commands cannot create a revision lacking physical ancestry.
alter function private.worker_prepare_capital_debt_recipe_v1(uuid,text) rename to worker_prepare_capital_debt_initial_recipe_v1;
create function public.worker_read_capital_debt_revision_source_v1(p_job_id uuid,p_capability_token text,p_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.worker_read_capital_debt_revision_source_v1(p_job_id,p_capability_token,p_retained_payload_id);$$;
revoke all on function private.worker_read_capital_debt_revision_source_v1(uuid,text,uuid),public.worker_read_capital_debt_revision_source_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.worker_read_capital_debt_revision_source_v1(uuid,text,uuid),public.worker_read_capital_debt_revision_source_v1(uuid,text,uuid) to authenticated;

create function private.capital_debt_revision_context_v1(p_job_id uuid,p_capability_token text,p_prior_body jsonb,p_predecessor_bodies jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare g jsonb:=private.worker_load_capital_debt_revision_inputs_v1(p_job_id,p_capability_token);c jsonb;ref jsonb;supplied jsonb;deps jsonb:='[]';
begin
 if jsonb_typeof(p_prior_body) is distinct from 'object' or p_prior_body->>'schemaVersion' is distinct from 'company-debt-diagnostic.v1'
 or encode(extensions.digest(p_prior_body::text,'sha256'),'hex') is distinct from g#>>'{prior,payloadFingerprint}'
 or octet_length(p_prior_body::text) is distinct from(g#>>'{prior,byteLength}')::bigint
 or jsonb_typeof(p_predecessor_bodies) is distinct from 'array' or jsonb_array_length(p_predecessor_bodies)<>3 then raise exception 'capital_debt_revision_body_changed' using errcode='42501';end if;
 for ref in select value from jsonb_array_elements(g->'predecessors') loop
 select x into supplied from jsonb_array_elements(p_predecessor_bodies)x where x->>'taskRunId'=ref#>>'{projection,taskRunId}';
 if supplied is null or (select count(*) from jsonb_array_elements(p_predecessor_bodies)x where x->>'taskRunId'=ref#>>'{projection,taskRunId}')<>1
 or (select count(*) from jsonb_object_keys(supplied))<>2 or not(supplied?'body')
 or encode(extensions.digest((supplied->'body')::text,'sha256'),'hex') is distinct from ref#>>'{retention,payloadFingerprint}'
 or octet_length((supplied->'body')::text) is distinct from(ref#>>'{retention,byteLength}')::bigint
 or supplied#>>'{body,schemaVersion}' is distinct from 'company-debt-task.v1'
 or supplied#>>'{body,taskId}' is distinct from ref->>'taskId' then raise exception 'capital_debt_revision_predecessor_changed' using errcode='42501';end if;
 if ref->>'taskId' in('C09','C10') then
 deps:=deps||jsonb_build_array(jsonb_build_object('task_id',ref->>'taskId','id',ref#>>'{projection,capitalArtifactId}','artifact_fingerprint',ref#>>'{projection,artifactFingerprint}','content',supplied#>'{body,content}','evidence_refs','[]'::jsonb));end if;
 end loop;
 c:=private.worker_load_capital_project_context_v6(p_job_id,p_capability_token);
 if c#>>'{revision,decision_id}' is distinct from g->>'decisionId' or c#>>'{revision,of_artifact_id}' is null then raise exception 'capital_debt_revision_context_denied' using errcode='42501';end if;
 c:=jsonb_set(c,'{revision,prior_content}',p_prior_body,false);
 c:=jsonb_set(c,'{dependency_artifacts}',deps,true);
 if c#>'{revision,prior_content}' is distinct from p_prior_body or c->'dependency_artifacts' is distinct from deps then raise exception 'capital_debt_revision_context_denied' using errcode='42501';end if;
 return c-array['completed_artifacts','dependency_artifacts'];
end $$;
revoke all on function private.capital_debt_revision_context_v1(uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;

create function private.worker_prepare_capital_debt_revision_recipe_v1(p_job_id uuid,p_capability_token text,p_prior_body jsonb,p_predecessor_bodies jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 g jsonb;c jsonb;r private.capital_debt_recipes;p private.capital_public_retention_policies;stamp timestamptz:=clock_timestamp();fp text;
begin
 if j.payload?'revision_of_artifact_id' and not exists(select 1 from public.capital_project_artifact_decisions d where d.organization_id=j.organization_id and d.id::text=j.payload->>'correction_decision_id' and d.artifact_id::text=j.payload->>'revision_of_artifact_id' and d.capital_project_id=coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid) and d.decision='request_changes' and d.decided_by=j.authorization_subject_id) then raise exception 'capital_debt_correction_denied' using errcode='42501';end if;
 if j.payload->>'analysis_scope' is distinct from 'company_debt_view' or j.payload->'capital_task_ids' is distinct from '["C11"]'::jsonb then raise exception 'capital_debt_recipe_denied' using errcode='42501';end if;
 g:=private.worker_load_capital_debt_revision_inputs_v1(j.id,p_capability_token);
 c:=private.capital_debt_revision_context_v1(j.id,p_capability_token,p_prior_body,p_predecessor_bodies);
 fp:=encode(extensions.digest(c::text,'sha256'),'hex');
 select x.* into p from private.capital_public_retention_policies x join private.capital_public_retention_controls ctl on ctl.policy_id=x.id where ctl.singleton and ctl.enabled;
 if p.id is null or not private.capital_public_retention_healthy_v1(j.leased_by,p.id) then raise exception 'capital_debt_retention_denied' using errcode='42501';end if;
 select * into r from private.capital_debt_recipes where organization_id=j.organization_id and job_id=j.id;
 if r.id is not null then
 if r.context_fingerprint<>fp or r.worker_account_id<>auth.uid() or r.human_subject_id<>j.authorization_subject_id then raise exception 'capital_debt_recipe_changed' using errcode='40001';end if;
 else
 if exists(select 1 from private.capital_debt_recipes existing where existing.organization_id=j.organization_id and existing.work_id=coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid) and existing.plan_id=(j.payload->>'capital_project_plan_id')::uuid and existing.brief_id=(j.payload->>'capital_project_brief_id')::uuid and existing.revision_decision_id is not distinct from (j.payload->>'correction_decision_id')::uuid) then raise exception 'capital_debt_recovery_required' using errcode='42501';end if;
 insert into private.capital_debt_recipes(organization_id,work_id,job_id,plan_id,brief_id,session_id,human_subject_id,worker_account_id,revision_decision_id,original_attempt,
 plan_fingerprint,context_fingerprint,base_authority_fingerprint,as_of_date,locale,renderer_version,captured_at,expires_at,retention_policy_id)
 values(j.organization_id,(j.payload->>'capital_project_id')::uuid,j.id,(j.payload->>'capital_project_plan_id')::uuid,(j.payload->>'capital_project_brief_id')::uuid,j.intake_session_id,
 j.authorization_subject_id,auth.uid(),(j.payload->>'correction_decision_id')::uuid,j.attempts,c#>>'{plan,fingerprint}',fp,private.capital_debt_base_authority_fingerprint_v1(j.organization_id,j.id,j.intake_session_id,(j.payload->>'capital_project_brief_id')::uuid,(j.payload->>'capital_project_plan_id')::uuid,j.authorization_subject_id,stamp),(stamp at time zone 'UTC')::date,c#>>'{session,locale}',
 'capital-public-task-renderer.company-debt.v1',stamp,stamp+make_interval(secs=>p.maximum_retention_seconds),p.id) returning * into r;
 end if;
 insert into private.capital_debt_revision_inputs(organization_id,recipe_id,prior_recipe_id,review_id,prior_revision_id,prior_final_retained_payload_id,predecessor_recipe_id,depth)
 values(j.organization_id,r.id,(g->>'priorRecipeId')::uuid,(g->>'reviewId')::uuid,(g->>'priorRevisionId')::uuid,(g#>>'{prior,retainedPayloadId}')::uuid,(g->>'predecessorRecipeId')::uuid,1+coalesce((select depth from private.capital_debt_revision_inputs where organization_id=j.organization_id and recipe_id=(g->>'priorRecipeId')::uuid),0)) on conflict do nothing;
 if not exists(select 1 from private.capital_debt_revision_inputs x join private.capital_debt_recipes prior on(prior.organization_id,prior.id)=(x.organization_id,x.prior_recipe_id) where x.organization_id=j.organization_id and x.recipe_id=r.id and x.prior_recipe_id=(g->>'priorRecipeId')::uuid and x.review_id=(g->>'reviewId')::uuid and x.prior_revision_id=(g->>'priorRevisionId')::uuid and x.predecessor_recipe_id=(g->>'predecessorRecipeId')::uuid and prior.captured_at<r.captured_at) then raise exception 'capital_debt_revision_lineage_changed' using errcode='42501';end if;
 if private.capital_debt_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_debt_recipe_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-debt-base-context.v1','recipeId',r.id,'jobId',j.id,'organizationId',j.organization_id,'workId',r.work_id,
 'planId',r.plan_id,'planFingerprint',r.plan_fingerprint,'asOfDate',r.as_of_date,'locale',r.locale,'contextFingerprint',r.context_fingerprint,
 'canonicalContext',c::text,'expiresAt',r.expires_at);
end; $$;


-- The existing recipe checks keep all source/authority/body restrictions. Only
-- a recorded human lineage can resolve an original predecessor projection.
do $$declare def text;needle text:='where bridge.organization_id=p_org and bridge.recipe_id=r.id and bridge.capital_artifact_id=c.dependency_artifact_id;';replacement text;begin
 def:=pg_get_functiondef('private.capital_debt_recipe_deadline_v1(uuid,uuid,uuid)'::regprocedure);
 if position(needle in def)=0 then raise exception 'debt_revision_dependency_deadline_drift';end if;
 replacement:='where bridge.organization_id=p_org and bridge.capital_artifact_id=c.dependency_artifact_id and(bridge.recipe_id=r.id or exists(select 1 from private.capital_debt_revision_inputs lineage where lineage.organization_id=p_org and lineage.recipe_id=r.id and lineage.predecessor_recipe_id=bridge.recipe_id and bridge.task_id =''M06''));';
 execute replace(def,needle,replacement);
end $$;
alter function private.capital_debt_recipe_deadline_v1(uuid,uuid,uuid) rename to capital_debt_recipe_deadline_before_revision_v1;
create function private.capital_debt_recipe_deadline_v1(p_org uuid,p_recipe uuid,p_subject uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare walker uuid:=p_recipe;visited uuid[]:='{}';depth integer:=0;r private.capital_debt_recipes;prior private.capital_debt_recipes;
 proof private.capital_debt_revision_inputs;a private.capital_public_payload_allocations;d timestamptz;bound timestamptz;
begin
 loop
 if walker=any(visited) or depth>=64 then return null;end if;visited:=visited||walker;depth:=depth+1;
 select * into r from private.capital_debt_recipes where organization_id=p_org and id=walker;
 if r.id is null then return null;end if;
 bound:=private.capital_debt_recipe_deadline_before_revision_v1(p_org,r.id,p_subject);
 if bound is null then return null;end if;d:=least(d,bound);
 if r.revision_decision_id is null then return d;end if;
 select * into proof from private.capital_debt_revision_inputs where organization_id=p_org and recipe_id=r.id;
 select * into prior from private.capital_debt_recipes where organization_id=p_org and id=proof.prior_recipe_id;
 if proof.recipe_id is null or prior.id is null or prior.captured_at>=r.captured_at or proof.depth>64 then return null;end if;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on(x.organization_id,x.id)=(q.organization_id,q.allocation_id)
 where q.organization_id=p_org and q.id=proof.prior_final_retained_payload_id;
 if a.id is null or not private.capital_body_physical_receipt_v1(p_org,proof.prior_final_retained_payload_id) then return null;end if;
 d:=least(d,a.expires_at,a.purge_at);if d<=clock_timestamp() then return null;end if;
 walker:=prior.id;
 end loop;
end $$;
revoke all on function private.capital_debt_recipe_deadline_before_revision_v1(uuid,uuid,uuid),private.capital_debt_recipe_deadline_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;


do $$declare def text;needle text:='if projection_count<>23 then return false;end if;';begin
 def:=pg_get_functiondef('private.capital_debt_native_read_allowed_v1(uuid,uuid,uuid)'::regprocedure);
 if position(needle in def)=0 or position('projection.artifact_status in(''stale'',''superseded'')' in def)=0 then raise exception 'debt_revision_projection_definition_drift';end if;
 def:=replace(def,'projection.artifact_status in(''stale'',''superseded'')','projection.artifact_status=''stale''');
 execute replace(def,needle,'if exists(select 1 from private.capital_debt_revision_inputs lineage where lineage.organization_id=p_org and lineage.recipe_id=b.recipe_id) then if projection_count<>0 then return false;end if; elsif projection_count<>23 then return false;end if;');
end $$;
alter function private.capital_debt_native_read_allowed_v1(uuid,uuid,uuid) rename to capital_debt_native_read_before_revision_v1;
create function private.capital_debt_native_read_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare walker uuid:=p_revision;visited uuid[]:='{}';b private.capital_debt_native_bindings;proof private.capital_debt_revision_inputs;
begin
 loop
 if walker=any(visited) or cardinality(visited)>=64 then return false;end if;visited:=visited||walker;
 if not private.capital_debt_native_read_before_revision_v1(p_org,walker,p_actor) then return false;end if;
 select * into b from private.capital_debt_native_bindings where organization_id=p_org and revision_id=walker;
 if b.id is null then return true;end if;
 select * into proof from private.capital_debt_revision_inputs where organization_id=p_org and recipe_id=b.recipe_id;
 if proof.recipe_id is null then return not exists(select 1 from private.capital_debt_recipes r where r.organization_id=p_org and r.id=b.recipe_id and r.revision_decision_id is not null);end if;
 walker:=proof.prior_revision_id;
 end loop;
end $$;

-- M06 is an actual succeeded physical execution plan, not a paid TaskRun.
create function private.capital_debt_execution_plan_allowed_v1(p_org uuid,p_recipe uuid,p_task_run uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_debt_recipes;proof private.capital_debt_revision_inputs;projection private.capital_debt_task_projections;allocation uuid;
begin
 select * into r from private.capital_debt_recipes where organization_id=p_org and id=p_recipe;
 select * into proof from private.capital_debt_revision_inputs where organization_id=p_org and recipe_id=r.id;
 select p.* into projection from private.capital_debt_task_projections p
 where p.organization_id=p_org and p.recipe_id=coalesce(proof.predecessor_recipe_id,r.id) and p.task_id='M06' and p.task_run_id=p_task_run;
 select q.allocation_id into allocation from private.capital_public_retained_payloads q where(q.organization_id,q.id)=(p_org,projection.derived_retained_payload_id);
 return r.id is not null and projection.id is not null
 and (r.revision_decision_id is null or(proof.recipe_id is not null and private.capital_debt_revision_dispatch_allowed_v1(r.job_id)))
 and exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on(pt.organization_id,pt.id)=(tr.organization_id,tr.plan_task_id)
 join public.capital_project_artifacts c on(c.organization_id,c.id)=(projection.organization_id,projection.capital_artifact_id)
 where tr.organization_id=p_org and tr.id=p_task_run and tr.capital_project_id=r.work_id and tr.plan_id=r.plan_id and pt.task_id='M06' and tr.status='succeeded'
 and tr.output_fingerprint=projection.artifact_fingerprint and c.artifact_fingerprint=projection.artifact_fingerprint and c.status not in('stale','superseded')
 and (tr.processing_job_id=r.job_id or(proof.recipe_id is not null and projection.recipe_id=proof.predecessor_recipe_id)))
 and private.capital_body_physical_receipt_v1(p_org,projection.derived_retained_payload_id)
 and private.capital_debt_allocation_deadline_v1(p_org,allocation,r.human_subject_id) is not null;
end $$;
-- Reuse the existing finite context allocator and physical writer. Only the
-- source of its canonical context changes, after physical prior-body validation.
do $$declare def text;needle text:='c:=private.capital_debt_capture_context_v1(j.id,p_capability_token);';begin
 def:=pg_get_functiondef('private.worker_prepare_capital_debt_context_v1(uuid,text,uuid,uuid)'::regprocedure);
 if position(needle in def)=0 then raise exception 'debt_revision_context_allocator_drift';end if;
 def:=replace(def,'private.worker_prepare_capital_debt_context_v1(p_job_id uuid, p_capability_token text, p_recipe_id uuid, p_request_id uuid)',
 'private.worker_prepare_capital_debt_revision_context_v1(p_job_id uuid, p_capability_token text, p_recipe_id uuid, p_request_id uuid, p_prior_body jsonb, p_predecessor_bodies jsonb)');
 if position('worker_prepare_capital_debt_revision_context_v1' in def)=0 then raise exception 'debt_revision_context_signature_drift';end if;
 execute replace(def,needle,'c:=private.capital_debt_revision_context_v1(j.id,p_capability_token,p_prior_body,p_predecessor_bodies);');
end $$;
create function public.worker_prepare_capital_debt_revision_recipe_v1(p_job_id uuid,p_capability_token text,p_prior_body jsonb,p_predecessor_bodies jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_prepare_capital_debt_revision_recipe_v1(p_job_id,p_capability_token,p_prior_body,p_predecessor_bodies)$$;
create function public.worker_prepare_capital_debt_revision_context_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_prior_body jsonb,p_predecessor_bodies jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_prepare_capital_debt_revision_context_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_prior_body,p_predecessor_bodies)$$;
revoke all on function private.worker_prepare_capital_debt_revision_recipe_v1(uuid,text,jsonb,jsonb),public.worker_prepare_capital_debt_revision_recipe_v1(uuid,text,jsonb,jsonb),private.worker_prepare_capital_debt_revision_context_v1(uuid,text,uuid,uuid,jsonb,jsonb),public.worker_prepare_capital_debt_revision_context_v1(uuid,text,uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.worker_prepare_capital_debt_revision_recipe_v1(uuid,text,jsonb,jsonb),public.worker_prepare_capital_debt_revision_recipe_v1(uuid,text,jsonb,jsonb),private.worker_prepare_capital_debt_revision_context_v1(uuid,text,uuid,uuid,jsonb,jsonb),public.worker_prepare_capital_debt_revision_context_v1(uuid,text,uuid,uuid,jsonb,jsonb) to authenticated;

-- Ordinary context capture cannot produce a revision with missing prior bytes.
create function private.worker_prepare_capital_debt_recipe_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);begin
 if j.payload?'revision_of_artifact_id' then raise exception 'capital_debt_revision_physical_input_required' using errcode='42501';end if;
 return private.worker_prepare_capital_debt_initial_recipe_v1(j.id,p_capability_token);
end $$;
revoke all on function private.worker_prepare_capital_debt_initial_recipe_v1(uuid,text),private.worker_prepare_capital_debt_recipe_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_prepare_capital_debt_recipe_v1(uuid,text) to authenticated;


revoke all on function private.capital_debt_execution_plan_allowed_v1(uuid,uuid,uuid),private.capital_debt_native_read_before_revision_v1(uuid,uuid,uuid),private.capital_debt_native_read_allowed_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- All paid admission and command replay keep M06's exact server-proven identity.
-- The initial branch remains unchanged; only the recorded human ancestry can
-- select the original execution-plan TaskRun under a returned C11 job.
do $$declare fn text;def text;needle text;replacement text;begin
 foreach fn in array array['private.worker_finalize_capital_debt_recipe_v1(uuid,text,uuid,uuid,jsonb,text,text,text,text,bigint,integer,text)','private.require_capital_debt_recipe_v1(uuid,text,uuid)'] loop
 def:=pg_get_functiondef(fn::regprocedure);
 needle:='tr.processing_job_id=j.id';
 if position(needle in def)=0 then raise exception 'debt_revision_m06_job_definition_drift';end if;
 def:=replace(def,needle,'(tr.processing_job_id=j.id or private.capital_debt_execution_plan_allowed_v1(j.organization_id,r.id,tr.id))');
 if fn like '%finalize%' then
 needle:='bridge.organization_id=j.organization_id and bridge.recipe_id=r.id and bridge.capital_artifact_id=dep.id';
 replacement:='bridge.organization_id=j.organization_id and(bridge.recipe_id=r.id or exists(select 1 from private.capital_debt_revision_inputs proof where proof.organization_id=j.organization_id and proof.recipe_id=r.id and proof.predecessor_recipe_id=bridge.recipe_id and bridge.task_id=''M06'')) and bridge.capital_artifact_id=dep.id';
 if position(needle in def)=0 then raise exception 'debt_revision_m06_body_definition_drift';end if;
 def:=replace(def,needle,replacement);
 end if;
 execute def;
 end loop;
end $$;

-- Revisions recompute only the C11 synthesis under a new accepted invocation.
-- The 23 original task products are inherited as physical ancestors, not cloned
-- or falsely attributed to the new invocation.
do $$declare def text;needle text;replacement text;start_at integer;end_at integer;begin
 def:=pg_get_functiondef('private.capital_debt_commit_result_core_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid,text)'::regprocedure);
 needle:='if(select count(*) from private.capital_debt_task_projections d where d.organization_id=p_org and d.recipe_id=r.id)<>23';
 start_at:=position(needle in def);end_at:=position('select * into b from private.capital_debt_native_bindings' in def);
 if start_at=0 or end_at<=start_at then raise exception 'debt_revision_commit_chain_definition_drift';end if;
 replacement:='if r.revision_decision_id is not null then
 if not exists(select 1 from private.capital_debt_revision_inputs proof join private.capital_debt_native_bindings prior on(prior.organization_id,prior.recipe_id)=(proof.organization_id,proof.prior_recipe_id)
 where proof.organization_id=p_org and proof.recipe_id=r.id and private.capital_debt_native_read_allowed_v1(p_org,prior.revision_id,r.human_subject_id)
 and not exists(select 1 from private.capital_debt_task_projections own where own.organization_id=p_org and own.recipe_id=r.id))
 then raise exception ''capital_debt_revision_task_chain_required'' using errcode=''42501'';end if;
 else '||substring(def from start_at for end_at-start_at)||'end if; ';
 def:=substring(def from 1 for start_at-1)||replacement||substring(def from end_at);
 needle:='if tr.status<>''succeeded'' or tr.processing_job_id<>r.job_id or tr.plan_id<>r.plan_id';
 replacement:='if not private.capital_debt_execution_plan_allowed_v1(p_org,r.id,s.execution_plan_task_run_id) or tr.status<>''succeeded'' or tr.plan_id<>r.plan_id';
 if position(needle in def)=0 then raise exception 'debt_revision_commit_m06_definition_drift';end if;def:=replace(def,needle,replacement);
 needle:='d.organization_id=p_org and d.recipe_id=r.id and d.task_run_id=s.execution_plan_task_run_id';
 replacement:='d.organization_id=p_org and(d.recipe_id=r.id or exists(select 1 from private.capital_debt_revision_inputs proof where proof.organization_id=p_org and proof.recipe_id=r.id and proof.predecessor_recipe_id=d.recipe_id and d.task_id=''M06'')) and d.task_run_id=s.execution_plan_task_run_id';
 if position(needle in def)=0 then raise exception 'debt_revision_commit_m06_bridge_definition_drift';end if;def:=replace(def,needle,replacement);
 needle:='and bridge.recipe_id=r.id and bridge.accepted_invocation_id=ok.id';
 replacement:='and((bridge.recipe_id=r.id and bridge.accepted_invocation_id=ok.id) or exists(select 1 from private.capital_debt_revision_inputs proof where proof.organization_id=p_org and proof.recipe_id=r.id and proof.predecessor_recipe_id=bridge.recipe_id and bridge.task_id=needed.task_id and bridge.task_id in(''C09'',''C10'')))';
 if position(needle in def)=0 then raise exception 'debt_revision_commit_dependencies_definition_drift';end if;execute replace(def,needle,replacement);
end $$;

create function private.link_capital_debt_revision_parent_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare proof private.capital_debt_revision_inputs;
begin
 select x.* into proof from private.capital_debt_native_bindings binding join private.capital_debt_revision_inputs x on(x.organization_id,x.recipe_id)=(binding.organization_id,binding.recipe_id)
 where binding.organization_id=new.organization_id and binding.revision_id=new.id;
 if proof.recipe_id is not null then
 insert into private.artifact_dependency_links(organization_id,revision_id,link_kind,derived_from_revision_id)
 values(new.organization_id,new.id,'artifact_revision',proof.prior_revision_id);
 end if;return new;
end $$;
create trigger capital_debt_revision_parent after insert on public.artifact_revisions for each row execute function private.link_capital_debt_revision_parent_v1();
revoke all on function private.link_capital_debt_revision_parent_v1() from public,anon,authenticated,service_role;

