-- Forward only. Preserve the applied native preview bodies and all existing review cores.
-- The public decide command already requires this exact immutable projection.
alter function private.artifact_review_preparer_v1(public.artifact_revisions)
 rename to artifact_review_preparer_before_preview_projection_v1;
create function private.artifact_review_preparer_v1(p_revision public.artifact_revisions)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare preparer uuid;begin
 select r.human_subject_id into preparer from private.capital_preview_native_bindings b
 join private.capital_preview_runs r on(r.organization_id,r.id)=(b.organization_id,b.run_id)
 where b.organization_id=p_revision.organization_id and b.revision_id=p_revision.id and exists(select 1 from public.artifacts a where a.organization_id=p_revision.organization_id and a.id=p_revision.artifact_id and a.work_id=b.work_id);
 if found then return preparer;end if;
 return private.artifact_review_preparer_before_preview_projection_v1(p_revision);
end $$;
revoke all on function private.artifact_review_preparer_before_preview_projection_v1(public.artifact_revisions),
 private.artifact_review_preparer_v1(public.artifact_revisions) from public,anon,authenticated,service_role;

create function private.project_capital_preview_artifact_review_v1()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare b private.capital_preview_native_bindings;c public.capital_project_artifacts;
 projection private.capital_preview_task_projections;decision uuid;effect text;active boolean;begin
 select * into b from private.capital_preview_native_bindings
 where organization_id=new.organization_id and work_id=new.work_id and revision_id=new.revision_id;
 if b.id is null or new.act not in('approve','revoke_approval') then return new;end if;
 select * into c from public.capital_project_artifacts
 where organization_id=new.organization_id and capital_project_id=new.work_id and id=b.capital_artifact_id for update;
 select * into projection from private.capital_preview_task_projections where organization_id=new.organization_id and id=b.projection_id and run_id=b.run_id and work_id=new.work_id and capital_artifact_id=c.id;
 if c.id is null or projection.id is null or c.artifact_fingerprint is distinct from projection.artifact_fingerprint
 or not private.artifact_review_sources_allowed_v1(new.organization_id,new.revision_id,new.reviewer_id)
 or not private.can_access_resource_v1(new.organization_id,new.work_id,'work')
 then raise exception 'review_source_access_required' using errcode='42501';end if;
 if new.act='approve' then
  if c.status in('stale','superseded') then raise exception 'capital_artifact_review_target_inactive' using errcode='42501';end if;
  effect:='confirm';
  select p.legacy_decision_id into decision from private.capital_artifact_review_projections p
  where p.organization_id=new.organization_id and p.capital_artifact_id=c.id and p.revision_id=new.revision_id and p.effect='confirm'
  order by p.created_at,p.id limit 1;
  if decision is null then
   insert into public.capital_project_artifact_decisions(organization_id,capital_project_id,artifact_id,artifact_fingerprint,decision,note,decided_by,decided_at)
   values(new.organization_id,new.work_id,c.id,c.artifact_fingerprint,'confirm',new.note,new.reviewer_id,new.created_at) returning id into decision;
  end if;
  update public.capital_project_artifacts set status='confirmed',superseded_at=null
  where organization_id=new.organization_id and id=c.id;
 else
  effect:='revoke_approval';active:=private.capital_artifact_approval_active_v2(new.organization_id,new.revision_id);
  if not active and c.status in('confirmed','approved') then
   update public.capital_project_artifacts set status='pending_confirmation',superseded_at=null
   where organization_id=new.organization_id and id=c.id;
  end if;
 end if;
 insert into private.capital_artifact_review_projections(organization_id,work_id,capital_artifact_id,revision_id,review_id,legacy_decision_id,
 processing_job_id,processing_run_id,effect,command_id)
 values(new.organization_id,new.work_id,c.id,new.revision_id,new.id,decision,null,null,effect,new.command_id);
 if not private.artifact_review_sources_allowed_v1(new.organization_id,new.revision_id,new.reviewer_id)
 or not private.can_access_resource_v1(new.organization_id,new.work_id,'work')
 then raise exception 'review_source_access_required' using errcode='42501';end if;
 return new;
end $$;
revoke all on function private.project_capital_preview_artifact_review_v1() from public,anon,authenticated,service_role;
create trigger capital_preview_artifact_review_bridge after insert on public.artifact_reviews
 for each row execute function private.project_capital_preview_artifact_review_v1();
