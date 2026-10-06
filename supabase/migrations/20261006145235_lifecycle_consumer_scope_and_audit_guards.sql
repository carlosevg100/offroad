set search_path='';
-- The resource is the artifact's work identity, not a field of an immutable revision.
create or replace function private.read_audited_artifact_revision_v1(p_revision uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare r public.artifact_revisions;work uuid;result jsonb;begin
 select*into r from public.artifact_revisions where id=p_revision;
 result:=private.read_artifact_revision_v1(p_revision);
 if r.id is not null then
  select a.work_id into work from public.artifacts a where a.organization_id=r.organization_id and a.id=r.artifact_id;
  perform private.append_sensitive_operation_v1(r.organization_id,work,r.id,'read',result->'restriction'='null'::jsonb);
 end if;return result;
end;$$;
create function private.read_audited_export_receipt_v1(p_receipt uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare r public.artifact_export_receipts;result jsonb;begin
 result:=private.read_artifact_export_receipt_v1(p_receipt);
 select*into r from public.artifact_export_receipts where id=p_receipt;
 if r.id is not null then perform private.append_sensitive_operation_v1(r.organization_id,r.work_id,r.revision_id,'download',true);end if;
 return result;
end;$$;
create or replace function public.read_artifact_export_receipt_v1(p_receipt_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.read_audited_export_receipt_v1(p_receipt_id);$$;
revoke all on function private.read_audited_export_receipt_v1(uuid)from public,anon,authenticated,service_role;
grant execute on function private.read_audited_export_receipt_v1(uuid)to authenticated;
create function private.resource_is_within_v1(p_org uuid,p_resource uuid,p_scope uuid)returns boolean language sql stable security definer set search_path=''as $$
 with recursive scope(id,depth)as(select p_resource,0 union all select r.parent_resource_id,s.depth+1 from scope s join private.access_resources r
 on r.organization_id=p_org and r.id=s.id where r.parent_resource_id is not null and s.depth<64)
 select exists(select 1 from scope where id=p_scope);
$$;
revoke all on function private.resource_is_within_v1(uuid,uuid,uuid)from public,anon,authenticated,service_role;
create table private.retention_plan_receipts(
 organization_id uuid not null references public.organizations(id),rule_id uuid not null,
 planned_at timestamptz not null default clock_timestamp(),receipt_fingerprint text not null check(receipt_fingerprint~'^[a-f0-9]{64}$'),
 primary key(organization_id,rule_id),foreign key(organization_id,rule_id)references private.retention_rules(organization_id,id)
);
alter table private.retention_plan_receipts enable row level security;
alter table private.retention_plan_receipts force row level security;
revoke all on private.retention_plan_receipts from public,anon,authenticated,service_role;
create policy retention_plans_deny on private.retention_plan_receipts for all to authenticated using(false)with check(false);
create trigger retention_plan_immutable before update or delete on private.retention_plan_receipts for each row execute function private.deny_domain_audit_mutation_v1();
create trigger retention_plan_no_truncate before truncate on private.retention_plan_receipts for each statement execute function private.deny_domain_audit_mutation_v1();

create or replace function private.process_revocation_targets_v1(p_worker_token text,p_limit integer default 20)
returns integer language plpgsql security definer set search_path='' as $$
declare worker uuid:=private.capital_public_purge_worker_v1(p_worker_token);r private.revocation_runs;receipt text;n integer:=0;cancelled integer;t private.revocation_targets;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'revocation_limit_invalid' using errcode='22023';end if;
 for r in select rr.* from private.revocation_runs rr join private.event_outbox o on o.organization_id=rr.organization_id and o.event_id=rr.domain_event_id
 where o.status='completed' and exists(select 1 from private.revocation_targets t where t.organization_id=rr.organization_id and t.run_id=rr.id and t.state='pending')
 order by rr.created_at,rr.id limit p_limit for update of rr skip locked loop
  perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||r.organization_id::text,0));
  if exists(select 1 from public.processing_jobs j where j.organization_id=r.organization_id and j.status in ('queued','leased','awaiting_approval') and not private.job_authority_is_current_v1(j.id)) then continue;end if;
  update private.artifact_roundtrip_tasks t set state='cancelled',capability_sha256=null,lease_expires_at=null,failure_code='source_revoked'
  where t.organization_id=r.organization_id and t.state in ('queued','leased') and not private.artifact_roundtrip_task_allowed_v1(t);
  get diagnostics cancelled=row_count;
  -- A permission change does not erase shared evidence. Search, Storage and artifacts use
  -- current policy at each use; the private case index has no user-owned cached authorization.
  -- The only query cache is licensed public research, not a private financial-content cache.
  -- The receipt identifies that disposition explicitly, rather than certifying byte erasure.
  for t in select*from private.revocation_targets where organization_id=r.organization_id and run_id=r.id and destination<>'authority_outbox'and state='pending'for update loop
   receipt:=encode(extensions.digest(jsonb_build_object('eventId',r.domain_event_id,'destination',t.destination,'workerId',worker,
    'completedAt',clock_timestamp(),'cancelledRoundtripTasks',case when t.destination='jobs'then cancelled else 0 end,
    'disposition','current_authority_revalidated_shared_evidence_preserved','boundary',case t.destination
     when 'search'then 'candidate_and_delivery_source_policy'when 'cache'then 'no_private_authorization_cache'
     when 'jobs'then 'current_job_and_roundtrip_capability'when 'artifacts'then 'revision_ancestry_and_review_policy'else 'authenticated_storage_operation_policy'end)::text,'sha256'),'hex');
   update private.revocation_targets set state='completed',completed_at=clock_timestamp(),receipt_fingerprint=receipt where id=t.id;
  end loop;
  n:=n+1;
 end loop;
 return n;
end;$$;


create or replace function private.plan_retention_actions_v1(p_worker_token text,p_limit integer default 20)
returns integer language plpgsql security definer set search_path='' as $$
declare worker uuid:=private.capital_public_purge_worker_v1(p_worker_token);r private.retention_rules;n integer:=0;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'retention_limit_invalid' using errcode='22023';end if;
 for r in select rr.* from private.retention_rules rr where not exists(select 1 from private.retention_plan_receipts done where done.organization_id=rr.organization_id and done.rule_id=rr.id)and rr.mode='expire' and rr.expires_at<=clock_timestamp()
 and not exists(select 1 from private.retention_rules later where later.organization_id=rr.organization_id and later.resource_id=rr.resource_id and later.revision>rr.revision)
 order by rr.expires_at,rr.id limit p_limit for update skip locked loop
  perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||r.organization_id::text,0));
  if exists(select 1 from private.retention_rules later where later.organization_id=r.organization_id and later.resource_id=r.resource_id and later.revision>r.revision) then continue;end if;
  if private.resource_legal_hold_v1(r.organization_id,r.resource_id) then continue;end if;
  insert into private.retention_actions(organization_id,resource_id,rule_id,destination,bucket_id,object_path,storage_object_id)
  select r.organization_id,r.resource_id,r.id,'storage',e.bucket_id,e.object_path,e.storage_object_id
  from public.artifact_export_receipts e where e.organization_id=r.organization_id and private.resource_is_within_v1(e.organization_id,e.work_id,r.resource_id) on conflict do nothing;
  -- Original bytes shared with a still-live resource are preserved; expired bindings do not
  -- authorize them, and their mere existence is not a reason to erase another person's evidence.
  insert into private.retention_actions(organization_id,resource_id,rule_id,destination,bucket_id,object_path,storage_object_id)
  select r.organization_id,r.resource_id,r.id,'storage',v.bucket_id,v.object_path,o.id
  from public.source_versions v left join storage.objects o on o.bucket_id=v.bucket_id and o.name=v.object_path
  where v.organization_id=r.organization_id and exists(select 1 from public.source_bindings b where b.organization_id=v.organization_id and b.source_version_id=v.id and private.resource_is_within_v1(b.organization_id,b.resource_id,r.resource_id))
  and not exists(select 1 from public.source_bindings b where b.organization_id=v.organization_id and b.source_version_id=v.id and b.revoked_at is null
   and (private.retention_access_allowed_v1(b.organization_id,b.resource_id) or private.resource_legal_hold_v1(b.organization_id,b.resource_id))) on conflict do nothing;
  insert into private.retention_actions(organization_id,resource_id,rule_id,destination,bucket_id,object_path,storage_object_id)
  select r.organization_id,r.resource_id,r.id,'storage',l.bucket_id,l.object_path,o.id from public.document_layers l
  join private.retention_actions original on original.organization_id=l.organization_id and original.rule_id=r.id and original.bucket_id='opportunity-documents'
  join public.source_versions v on v.organization_id=l.organization_id and v.id=l.source_document_id and v.object_path=original.object_path
  left join storage.objects o on o.bucket_id=l.bucket_id and o.name=l.object_path
  where l.organization_id=r.organization_id on conflict do nothing;
  -- Existing licensed/public and typed body capture queue owns its physical erasure receipt.
  -- Expiry here closes use immediately; its own licensed deadline is never extended by this rule.
  update public.processing_jobs j set status='cancelled',capability_sha256=null,lease_expires_at=null,leased_by=null,last_error=jsonb_build_object('reason','retention_expired')
  where j.organization_id=r.organization_id and j.status in ('queued','leased','awaiting_approval') and not private.job_authority_is_current_v1(j.id);
  delete from public.case_retrieval_chunks c using public.source_versions v,private.retention_actions a
  where c.organization_id=r.organization_id and v.organization_id=c.organization_id and v.id=c.source_document_id
  and a.organization_id=v.organization_id and a.rule_id=r.id and a.bucket_id=v.bucket_id and a.object_path=v.object_path;
  insert into private.retention_plan_receipts(organization_id,rule_id,receipt_fingerprint)values(r.organization_id,r.id,encode(extensions.digest(jsonb_build_object('ruleId',r.id,'workerId',worker,'plannedAt',clock_timestamp(),'storageTargets',(select count(*)from private.retention_actions a where a.organization_id=r.organization_id and a.rule_id=r.id))::text,'sha256'),'hex'));
  n:=n+1;
 end loop;
 return n;
end;$$;

