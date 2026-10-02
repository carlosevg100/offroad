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
