-- 3T: approval of the internal package requests a follow-up brief; execution
-- remains a distinct 3U human act. No external release or model dispatch occurs.
set search_path='';
create table private.material_package_review_projections(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,binding_id uuid not null,revision_id uuid not null,review_id uuid not null,decision_id uuid not null,package_review_id uuid,actor_id uuid not null references auth.users(id),effect_job_id uuid,effect_run_id uuid,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,review_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),foreign key(organization_id,binding_id) references private.material_production_bindings(organization_id,id),foreign key(organization_id,revision_id) references public.artifact_revisions(organization_id,id),foreign key(organization_id,review_id) references public.artifact_reviews(organization_id,id),foreign key(organization_id,decision_id) references public.work_decisions(organization_id,id),foreign key(organization_id,package_review_id) references public.deal_state_objects(organization_id,id),foreign key(organization_id,effect_job_id) references public.processing_jobs(organization_id,id),foreign key(organization_id,effect_run_id) references public.processing_runs(organization_id,id),check((effect_job_id is null)=(effect_run_id is null))
);
create table private.material_package_review_intents(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,review_id uuid not null,actor_id uuid not null references auth.users(id),transaction_id bigint not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(organization_id,id),unique(organization_id,review_id),foreign key(organization_id,review_id) references public.artifact_reviews(organization_id,id)
);
do $$declare n text;c text;begin
 foreach n in array array['material_package_review_projections','material_package_review_intents'] loop
 execute format('alter table private.%I enable row level security',n);execute format('alter table private.%I force row level security',n);execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);
 execute format('create policy %I on private.%I as restrictive for select to anon,authenticated using(false)',n||'_no_select',n);execute format('create policy %I on private.%I as restrictive for insert to anon,authenticated with check(false)',n||'_no_insert',n);execute format('create policy %I on private.%I as restrictive for update to anon,authenticated using(false) with check(false)',n||'_no_update',n);execute format('create policy %I on private.%I as restrictive for delete to anon,authenticated using(false)',n||'_no_delete',n);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_review_history_mutation_v1()',n||'_immutable',n);execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',n||'_no_truncate',n);execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',n||'_updated_at',n);execute format('create trigger %I after insert on private.%I for each row execute function private.capture_identity_audit_v1()',n||'_audit',n);
 end loop;
 foreach c in array array['work_id','binding_id','revision_id','decision_id','package_review_id','effect_job_id','effect_run_id'] loop execute format('create index %I on private.material_package_review_projections(organization_id,%I)','material_package_projection_'||c||'_fk',c);end loop;
end$$;
create index material_package_projection_actor_fk on private.material_package_review_projections(actor_id);
create index material_package_intent_actor_fk on private.material_package_review_intents(actor_id);
create function private.material_package_review_current_v1(p_org uuid,p_revision uuid,p_actor uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare b private.material_production_bindings;r private.material_production_recipes;m public.deal_state_objects;h public.artifacts;
begin
 select * into b from private.material_production_bindings where(organization_id,revision_id)=(p_org,p_revision);
 select * into r from private.material_production_recipes where(organization_id,id)=(p_org,b.recipe_id);
 select a.* into h from public.artifacts a join public.artifact_revisions v on(v.organization_id,v.artifact_id)=(a.organization_id,a.id) where(v.organization_id,v.id)=(p_org,p_revision);
 select * into m from public.deal_state_objects where organization_id=p_org and intake_session_id=r.session_id and object_type='material_artifact' order by object_version desc limit 1 for share nowait;
 return r.id is not null and h.head_revision_id=p_revision and m.id=b.material_object_id and m.status in('pending_confirmation','approved') and private.can_access_resource_v1(p_org,b.work_id,'work') and private.material_production_revision_allowed_v1(p_org,p_revision,p_actor);
end$$;
-- Current authority is package-specific; immutable common review history stays intact.
create function private.material_package_approval_is_current_v1(p_org uuid,p_review uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare v public.artifact_reviews;r public.artifact_revisions;policy jsonb;preparer uuid;
begin
 select * into v from public.artifact_reviews where(organization_id,id)=(p_org,p_review);
 if v.id is null or v.act not in('approve','reaffirm') or not private.artifact_review_is_active_v1(p_org,v.id)
  or not exists(select 1 from private.material_production_bindings where(organization_id,revision_id)=(p_org,v.revision_id))
  or not private.material_production_revision_allowed_v1(p_org,v.revision_id,v.reviewer_id) then return false;end if;
 select * into r from public.artifact_revisions where(organization_id,id)=(p_org,v.revision_id);
 policy:=private.review_policy_snapshot_v1(p_org,v.work_id,v.reviewer_id);
 if coalesce((policy->>'assignmentRequired')::boolean,true) and not(policy->'roles' ? 'approver') then return false;end if;
 preparer:=private.artifact_review_preparer_v1(r);
 if preparer=v.reviewer_id and (not coalesce((policy->>'selfApprovalAllowed')::boolean,false) or not v.self_approval_declared) then return false;end if;
 return true;
end$$;
revoke all on function private.material_package_approval_is_current_v1(uuid,uuid) from public,anon,authenticated,service_role;
alter function private.artifact_review_preparer_v1(public.artifact_revisions) rename to artifact_review_preparer_pre_material_package_v1;
create function private.artifact_review_preparer_v1(p_revision public.artifact_revisions) returns uuid language plpgsql stable security definer set search_path='' as $$declare actor uuid;begin
 select r.human_subject_id into actor from private.material_production_bindings b join private.material_production_recipes r on(r.organization_id,r.id)=(b.organization_id,b.recipe_id) where(b.organization_id,b.revision_id)=(p_revision.organization_id,p_revision.id);
 if found then return actor;end if;return private.artifact_review_preparer_pre_material_package_v1(p_revision);
end$$;
-- Preserve every common-review guard. Add substance only for physically proved native products.
do $$declare def text;needle text:='if not has_substance then raise exception ''review_substance_required''';matches integer;begin
 select count(*),max(pg_get_functiondef(p.oid)) into matches,def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'review_artifact_revision%' and p.proargtypes='2950 25 25 2950 25 16 2950 2950'::oidvector and position(needle in p.prosrc)>0;
 if matches<>1 then raise exception 'material_package_review_substance_core_ambiguous';end if;
 execute replace(def,needle,'if not has_substance and exists(select 1 from private.material_production_bindings where(organization_id,revision_id)=(org,r.id)) then has_substance:=private.material_package_review_current_v1(org,r.id,actor);end if; '||needle);
end$$;
-- Internal approval cannot authorize external downloads, including descendants.
alter function private.artifact_revision_release_v1(public.artifact_revisions) rename to artifact_revision_release_pre_material_package_v1;
create function private.artifact_revision_release_v1(r public.artifact_revisions) returns text language plpgsql stable security definer set search_path='' as $$begin
 if exists(with recursive ancestry(id) as(select r.id union select d.derived_from_revision_id from ancestry a join private.artifact_dependency_links d on d.organization_id=r.organization_id and d.revision_id=a.id and d.link_kind='artifact_revision') select 1 from ancestry a join private.material_production_bindings b on(b.organization_id,b.revision_id)=(r.organization_id,a.id)) then return case when r.audience='external' then 'blocked' else 'internal' end;end if;
 return private.artifact_revision_release_pre_material_package_v1(r);
end$$;
alter function private.enqueue_incremental_deal_state_analysis(uuid,uuid,text) rename to enqueue_incremental_deal_state_analysis_pre_material_package_v1;
create function private.enqueue_incremental_deal_state_analysis(p_organization_id uuid,p_session_id uuid,p_trigger_source text) returns jsonb language plpgsql volatile security definer set search_path='' as $$begin
 if p_trigger_source='material_package_approved' and exists(select 1 from private.material_production_recipes where(organization_id,session_id)=(p_organization_id,p_session_id)) and not exists(select 1 from private.material_package_review_intents i join public.artifact_reviews v on(v.organization_id,v.id)=(i.organization_id,i.review_id) join private.material_production_bindings b on(b.organization_id,b.revision_id)=(v.organization_id,v.revision_id) join private.material_production_recipes r on(r.organization_id,r.id)=(b.organization_id,b.recipe_id) where i.organization_id=p_organization_id and r.session_id=p_session_id and i.actor_id=auth.uid() and i.transaction_id=txid_current() and not exists(select 1 from private.material_package_review_projections p where(p.organization_id,p.review_id)=(i.organization_id,i.review_id)) and v.act='approve' and private.material_package_review_current_v1(i.organization_id,v.revision_id,auth.uid())) then raise exception 'material_package_native_review_required' using errcode='42501';end if;
 return private.enqueue_incremental_deal_state_analysis_pre_material_package_v1(p_organization_id,p_session_id,p_trigger_source);
end$$;
create function private.project_material_package_review_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare b private.material_production_bindings;r private.material_production_recipes;m public.deal_state_objects;decision jsonb;basis jsonb;prior jsonb;previous public.work_decisions;effect jsonb;package_id uuid;key text;outcome text;
begin
 select * into b from private.material_production_bindings where(organization_id,revision_id)=(new.organization_id,new.revision_id);
 if b.id is null or new.act not in('approve','revoke_approval') then return new;end if;
 if new.reviewer_id is distinct from auth.uid() or not private.material_package_review_current_v1(new.organization_id,new.revision_id,new.reviewer_id) then raise exception 'material_package_review_current_required' using errcode='42501';end if;
 select * into strict r from private.material_production_recipes where(organization_id,id)=(b.organization_id,b.recipe_id);
 select * into strict m from public.deal_state_objects where(organization_id,id)=(b.organization_id,b.material_object_id);
 key:='material-package:'||b.revision_id::text;prior:=private.work_decision_precedence_v1(b.organization_id,b.work_id,key);
 select * into previous from public.work_decisions where(organization_id,id)=(b.organization_id,(prior->>'currentId')::uuid);
 basis:=jsonb_build_object('artifacts',jsonb_build_array(jsonb_build_object('artifactRevisionId',new.revision_id,'manifestFingerprint',new.manifest_fingerprint)),'milestones','[]'::jsonb,'assessments','[]'::jsonb,'decisions',case when previous.id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('decisionId',previous.id,'revision',previous.revision,'fingerprint',previous.fingerprint)) end,'execution',null,'configuration',null);
 outcome:=case when new.act='approve' then 'approved' else 'rejected' end;
 decision:=private.append_work_decision_v1(b.organization_id,b.work_id,key,'approve_material_package',basis,array['none']::text[],'in_product',null,new.note,new.reviewer_id,nullif((prior->>'lastRevision')::integer,0),new.command_id,new.review_mode,new.policy_snapshot,null,new.created_at,outcome);
 if new.act='approve' and not exists(select 1 from private.material_package_review_projections where(organization_id,binding_id)=(b.organization_id,b.id) and effect_job_id is not null and exists(select 1 from public.processing_jobs j where(j.organization_id,j.id)=(b.organization_id,effect_job_id) and j.status<>'cancelled')) then
 package_id:=private.append_deal_state_object(b.organization_id,r.session_id,'package_review','approved',r.input_fingerprint,jsonb_build_object('schemaVersion','2026.08.29-v1','nativeMaterialRevisionId',b.revision_id,'approval',jsonb_build_object('actorId',new.reviewer_id,'approvedAt',new.created_at,'scope','internal_material_package','artifactFingerprint',m.object_fingerprint)),jsonb_build_array(jsonb_build_object('objectType','production_plan','objectFingerprint',r.production_plan_fingerprint),jsonb_build_object('objectType','material_artifact','objectFingerprint',m.object_fingerprint)),new.reviewer_id,'user');
 insert into private.material_package_review_intents(organization_id,review_id,actor_id,transaction_id) values(new.organization_id,new.id,new.reviewer_id,txid_current());
 effect:=private.enqueue_incremental_deal_state_analysis(b.organization_id,r.session_id,'material_package_approved');
 if not exists(select 1 from public.processing_jobs where(organization_id,id,intake_session_id)=(b.organization_id,(effect->>'job_id')::uuid,r.session_id) and status='awaiting_approval' and authorization_subject_id=new.reviewer_id) then raise exception 'material_package_followup_approval_required' using errcode='42501';end if;
 end if;
 if new.act='revoke_approval' and not exists(select 1 from public.artifact_reviews v where(v.organization_id,v.revision_id)=(b.organization_id,b.revision_id) and v.act in('approve','reaffirm') and private.material_package_approval_is_current_v1(v.organization_id,v.id)) then
 package_id:=private.append_deal_state_object(b.organization_id,r.session_id,'package_review','pending_confirmation',r.input_fingerprint,jsonb_build_object('schemaVersion','2026.08.29-v1','nativeMaterialRevisionId',b.revision_id,'approval',null),jsonb_build_array(jsonb_build_object('objectType','production_plan','objectFingerprint',r.production_plan_fingerprint),jsonb_build_object('objectType','material_artifact','objectFingerprint',m.object_fingerprint)),new.reviewer_id,'user');
 update public.processing_jobs j set status='cancelled',capability_sha256=null,leased_by=null,lease_expires_at=null,last_error=jsonb_build_object('reason','material_package_approval_revoked') where j.organization_id=b.organization_id and j.status not in('succeeded','failed','poison','cancelled') and exists(select 1 from private.material_package_review_projections p where(p.organization_id,p.binding_id)=(b.organization_id,b.id) and(p.effect_job_id=j.id or j.payload->>'approval_target_job_id'=p.effect_job_id::text));
 update public.processing_runs x set status='cancelled',completed_at=clock_timestamp() where x.organization_id=b.organization_id and exists(select 1 from public.processing_jobs j where(j.organization_id,j.processing_run_id,j.status)=(x.organization_id,x.id,'cancelled') and j.last_error->>'reason'='material_package_approval_revoked');
 end if;
 insert into private.material_package_review_projections(organization_id,work_id,binding_id,revision_id,review_id,decision_id,package_review_id,actor_id,effect_job_id,effect_run_id) values(b.organization_id,b.work_id,b.id,b.revision_id,new.id,(decision->>'decisionId')::uuid,package_id,new.reviewer_id,(effect->>'job_id')::uuid,(effect->>'processing_run_id')::uuid);
 return new;
end$$;
create trigger material_package_review_projection after insert on public.artifact_reviews for each row execute function private.project_material_package_review_v1();
create function private.decide_material_package_v1(p_work_id uuid,p_revision_id uuid,p_manifest_fingerprint text,p_act text,p_note text,p_self_approval_declared boolean,p_command_id uuid,p_basis_review_id uuid default null) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare org uuid;review jsonb;p private.material_package_review_projections;begin
 org:=private.lock_review_work_v1(p_work_id);
 if p_act not in('approve','revoke_approval') or not exists(select 1 from private.material_production_bindings where(organization_id,work_id,revision_id)=(org,p_work_id,p_revision_id)) or not private.material_package_review_current_v1(org,p_revision_id,auth.uid()) then raise exception 'material_package_review_denied' using errcode='42501';end if;
 review:=private.review_artifact_revision_v1(p_revision_id,p_manifest_fingerprint,p_act,null,p_note,p_self_approval_declared,p_command_id,p_basis_review_id);
 select * into strict p from private.material_package_review_projections where(organization_id,review_id)=(org,(review->>'reviewId')::uuid);
 if p_act='approve' and not private.material_package_approval_is_current_v1(org,p.review_id) then raise exception 'material_package_approval_revoked' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-material-package-review.v1','workId',p_work_id,'revisionId',p_revision_id,'reviewId',p.review_id,'decisionId',p.decision_id,'act',p_act,'effect',case when p.effect_job_id is null then 'none' else 'request_followup_brief' end,'jobId',p.effect_job_id,'runId',p.effect_run_id,'replayed',(review->>'replayed')::boolean);
end$$;
create function public.decide_material_package_v1(p_work_id uuid,p_revision_id uuid,p_manifest_fingerprint text,p_act text,p_note text,p_self_approval_declared boolean,p_command_id uuid,p_basis_review_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.decide_material_package_v1(p_work_id,p_revision_id,p_manifest_fingerprint,p_act,p_note,p_self_approval_declared,p_command_id,p_basis_review_id);$$;
create function private.read_material_package_review_basis_v1(p_work_id uuid,p_revision_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare org uuid;r public.artifact_revisions;b private.material_production_bindings;recipe private.material_production_recipes;begin
 org:=private.lock_review_work_v1(p_work_id);
 select * into b from private.material_production_bindings where(organization_id,work_id,revision_id)=(org,p_work_id,p_revision_id);
 select * into r from public.artifact_revisions where(organization_id,id)=(org,p_revision_id);
 select * into recipe from private.material_production_recipes where(organization_id,id)=(org,b.recipe_id);
 if b.id is null or not private.material_package_review_current_v1(org,p_revision_id,auth.uid()) then raise exception 'material_package_review_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-material-package-review-basis.v1','workId',p_work_id,'revisionId',p_revision_id,'manifestFingerprint',r.manifest_fingerprint,'recipeId',b.recipe_id,'materialObjectId',b.material_object_id,'productionPlanId',recipe.production_plan_id,'bundleFingerprint',b.bundle_fingerprint,'preparedBy',recipe.human_subject_id,'audience','internal','activeApprovalReviewIds',coalesce((select jsonb_agg(v.id order by v.created_at,v.id) from public.artifact_reviews v where(v.organization_id,v.revision_id)=(org,p_revision_id) and v.act in('approve','reaffirm') and private.material_package_approval_is_current_v1(v.organization_id,v.id)),'[]'::jsonb),'review',private.read_artifact_revision_reviews_v1(p_revision_id));
end$$;
create function public.read_material_package_review_basis_v1(p_work_id uuid,p_revision_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.read_material_package_review_basis_v1(p_work_id,p_revision_id);$$;
revoke all on function private.read_material_package_review_basis_v1(uuid,uuid),public.read_material_package_review_basis_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.read_material_package_review_basis_v1(uuid,uuid),public.read_material_package_review_basis_v1(uuid,uuid) to authenticated;
revoke all on function private.material_package_review_current_v1(uuid,uuid,uuid),private.artifact_review_preparer_pre_material_package_v1(public.artifact_revisions),private.artifact_review_preparer_v1(public.artifact_revisions),private.artifact_revision_release_pre_material_package_v1(public.artifact_revisions),private.artifact_revision_release_v1(public.artifact_revisions),private.enqueue_incremental_deal_state_analysis_pre_material_package_v1(uuid,uuid,text),private.enqueue_incremental_deal_state_analysis(uuid,uuid,text),private.project_material_package_review_v1(),private.decide_material_package_v1(uuid,uuid,text,text,text,boolean,uuid,uuid),public.decide_material_package_v1(uuid,uuid,text,text,text,boolean,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.enqueue_incremental_deal_state_analysis(uuid,uuid,text),private.decide_material_package_v1(uuid,uuid,text,text,text,boolean,uuid,uuid),public.decide_material_package_v1(uuid,uuid,text,text,text,boolean,uuid,uuid) to authenticated;
-- Approval history never substitutes current rights/retention for the requested follow-up.
alter function private.job_authority_is_current_v1(uuid) rename to job_authority_is_current_pre_material_package_v1;
create function private.job_authority_is_current_v1(p_job_id uuid) returns boolean language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;p private.material_package_review_projections;v public.artifact_reviews;b private.material_production_bindings;target uuid;
begin
 if not private.job_authority_is_current_pre_material_package_v1(p_job_id) then return false;end if;
 select * into j from public.processing_jobs where id=p_job_id;
 target:=case when j.kind='execution_brief_proposal' then(j.payload->>'approval_target_job_id')::uuid else j.id end;
 select * into p from private.material_package_review_projections where(organization_id,effect_job_id)=(j.organization_id,target);
 if p.id is null then return true;end if;
 select * into v from public.artifact_reviews where(organization_id,id)=(p.organization_id,p.review_id);
 select * into b from private.material_production_bindings where(organization_id,id)=(p.organization_id,p.binding_id);
 return v.id is not null and private.material_package_approval_is_current_v1(v.organization_id,v.id) and private.material_production_revision_allowed_v1(b.organization_id,b.revision_id,j.authorization_subject_id);
end$$;
revoke all on function private.job_authority_is_current_pre_material_package_v1(uuid),private.job_authority_is_current_v1(uuid) from public,anon,authenticated,service_role;
