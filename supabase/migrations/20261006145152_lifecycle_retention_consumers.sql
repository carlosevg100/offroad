-- Stage22/2: bounded cleanup consumers, independently authenticated from revoked jobs.
set search_path='';
set local lock_timeout='5s';

create function private.process_revocation_targets_v1(p_worker_token text,p_limit integer default 20)
returns integer language plpgsql security definer set search_path='' as $$
declare worker uuid:=private.capital_public_purge_worker_v1(p_worker_token);r private.revocation_runs;receipt text;n integer:=0;cancelled integer;
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
  receipt:=encode(extensions.digest(jsonb_build_object('eventId',r.domain_event_id,'workerId',worker,
   'completedAt',clock_timestamp(),'cancelledRoundtripTasks',cancelled,'disposition','current_authority_revalidated_shared_evidence_preserved',
   'privateSearchRows',(select count(*) from public.case_retrieval_chunks where organization_id=r.organization_id),
   'exportReceipts',(select count(*) from public.artifact_export_receipts where organization_id=r.organization_id))::text,'sha256'),'hex');
  update private.revocation_targets set state='completed',completed_at=clock_timestamp(),receipt_fingerprint=receipt
  where organization_id=r.organization_id and run_id=r.id and destination<>'authority_outbox' and state='pending';
  n:=n+1;
 end loop;
 return n;
end;$$;

-- Latest explicit rule only. No policy seed, blanket tenant expiry, or data-creating fixture.
create function private.plan_retention_actions_v1(p_worker_token text,p_limit integer default 20)
returns integer language plpgsql security definer set search_path='' as $$
declare worker uuid:=private.capital_public_purge_worker_v1(p_worker_token);r private.retention_rules;n integer:=0;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'retention_limit_invalid' using errcode='22023';end if;
 for r in select rr.* from private.retention_rules rr where rr.mode='expire' and rr.expires_at<=clock_timestamp()
 and not exists(select 1 from private.retention_rules later where later.organization_id=rr.organization_id and later.resource_id=rr.resource_id and later.revision>rr.revision)
 order by rr.expires_at,rr.id limit p_limit for update skip locked loop
  perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||r.organization_id::text,0));
  if exists(select 1 from private.retention_rules later where later.organization_id=r.organization_id and later.resource_id=r.resource_id and later.revision>r.revision) then continue;end if;
  if private.resource_legal_hold_v1(r.organization_id,r.resource_id) then continue;end if;
  insert into private.retention_actions(organization_id,resource_id,rule_id,destination,bucket_id,object_path,storage_object_id)
  select r.organization_id,r.resource_id,r.id,'storage',e.bucket_id,e.object_path,e.storage_object_id
  from public.artifact_export_receipts e where e.organization_id=r.organization_id and e.work_id=r.resource_id on conflict do nothing;
  -- Original bytes shared with a still-live resource are preserved; expired bindings do not
  -- authorize them, and their mere existence is not a reason to erase another person's evidence.
  insert into private.retention_actions(organization_id,resource_id,rule_id,destination,bucket_id,object_path,storage_object_id)
  select r.organization_id,r.resource_id,r.id,'storage',v.bucket_id,v.object_path,o.id
  from public.source_versions v left join storage.objects o on o.bucket_id=v.bucket_id and o.name=v.object_path
  where v.organization_id=r.organization_id and exists(select 1 from public.source_bindings b where b.organization_id=v.organization_id and b.source_version_id=v.id and private.resource_root_v1(b.organization_id,b.resource_id)=r.resource_id)
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
  n:=n+1;
 end loop;
 return n;
end;$$;

create function private.retention_action_authorized_v1(p_worker_token text,p_action_id uuid,p_capability text,p_completed boolean default false)
returns private.retention_actions language plpgsql security definer set search_path='' as $$
declare worker uuid:=private.capital_public_purge_worker_v1(p_worker_token);a private.retention_actions;
begin
 select * into a from private.retention_actions where id=p_action_id for update;
 if a.id is null or a.worker_token_id is distinct from worker or a.leased_account_id is distinct from auth.uid()
 or a.capability_sha256 is distinct from extensions.digest(p_capability,'sha256')
 or not ((a.state='leased' and a.lease_expires_at>clock_timestamp()) or (p_completed and a.state='completed'))
 then raise exception 'retention_action_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||a.organization_id::text,0));
 if private.resource_legal_hold_v1(a.organization_id,a.resource_id) or private.storage_has_legal_hold_v1(a.bucket_id,a.object_path)
 then raise exception 'retention_action_held' using errcode='42501';end if;
 return a;
end;$$;
create function private.worker_claim_retention_action_v1(p_worker_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare worker uuid:=private.capital_public_purge_worker_v1(p_worker_token);a private.retention_actions;cap text;blocked bigint;held bigint;oldest double precision;
begin
 perform private.process_revocation_targets_v1(p_worker_token,20);
 perform private.plan_retention_actions_v1(p_worker_token,20);
 update private.retention_actions set state='blocked',updated_at=clock_timestamp() where state='leased' and lease_expires_at<=clock_timestamp() and attempts>=5;
 select count(*) into blocked from private.retention_actions where state='blocked';
 select count(*) into held from private.retention_actions where state<>'completed' and private.storage_has_legal_hold_v1(bucket_id,object_path);
 select coalesce(extract(epoch from clock_timestamp()-min(created_at)),0) into oldest from private.retention_actions where state<>'completed' and not private.storage_has_legal_hold_v1(bucket_id,object_path);
 select * into a from private.retention_actions where destination='storage' and (state='pending' or(state='leased' and lease_expires_at<=clock_timestamp() and attempts<5))
 and not private.storage_has_legal_hold_v1(bucket_id,object_path) order by created_at,id limit 1 for update skip locked;
 if a.id is null then return jsonb_build_object('claimed',false,'blockedCount',blocked,'heldCount',held,'oldestPendingSeconds',greatest(oldest,0));end if;
 perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||a.organization_id::text,0));
 if private.resource_legal_hold_v1(a.organization_id,a.resource_id) then return jsonb_build_object('claimed',false,'blockedCount',blocked,'heldCount',held+1,'oldestPendingSeconds',greatest(oldest,0));end if;
 if exists(select 1 from storage.objects o where o.bucket_id=a.bucket_id and o.name=a.object_path and
 ((to_jsonb(o)->>'is_versioned')::boolean is true or(to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null)) then raise exception 'retention_versioned_object_unsupported' using errcode='42501';end if;
 cap:=encode(extensions.gen_random_bytes(32),'hex');
 update private.retention_actions set state='leased',attempts=attempts+1,worker_token_id=worker,leased_account_id=auth.uid(),capability_sha256=extensions.digest(cap,'sha256'),lease_expires_at=clock_timestamp()+interval '60 seconds' where id=a.id returning * into a;
 return jsonb_build_object('claimed',true,'blockedCount',blocked,'heldCount',held,'oldestPendingSeconds',greatest(oldest,0),'actionId',a.id,'capability',cap,'bucket',a.bucket_id,'path',a.object_path,'leaseExpiresAt',a.lease_expires_at);
end;$$;
create function private.worker_revalidate_retention_action_v1(p_worker_token text,p_action_id uuid,p_capability text)
returns boolean language plpgsql security definer set search_path='' as $$begin perform private.retention_action_authorized_v1(p_worker_token,p_action_id,p_capability);return true;end;$$;
create function private.worker_ack_retention_action_v1(p_worker_token text,p_action_id uuid,p_capability text,p_storage_absence_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$declare a private.retention_actions;fp text;begin
 a:=private.retention_action_authorized_v1(p_worker_token,p_action_id,p_capability,true);
 if a.state='completed' then return jsonb_build_object('completed',true,'replayed',true);end if;
 if p_storage_absence_confirmed is distinct from true or exists(select 1 from storage.objects where bucket_id=a.bucket_id and name=a.object_path)
 then raise exception 'retention_absence_unconfirmed' using errcode='42501';end if;
 fp:=encode(extensions.digest(jsonb_build_object('actionId',a.id,'objectId',a.storage_object_id,'bucket',a.bucket_id,'path',a.object_path,'absenceConfirmed',true,'actorId',auth.uid(),'at',clock_timestamp())::text,'sha256'),'hex');
 update private.retention_actions set state='completed',completed_at=clock_timestamp(),receipt_fingerprint=fp where id=a.id;
 return jsonb_build_object('completed',true,'replayed',false);
end;$$;
create function private.worker_retry_retention_action_v1(p_worker_token text,p_action_id uuid,p_capability text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$declare a private.retention_actions;begin
 a:=private.retention_action_authorized_v1(p_worker_token,p_action_id,p_capability);
 if p_reason is null or p_reason not in ('storage_delete_failed','storage_absence_unconfirmed') then raise exception 'retention_retry_invalid' using errcode='22023';end if;
 update private.retention_actions set state=case when attempts>=5 then 'blocked' else 'pending' end,lease_expires_at=null,capability_sha256=null
 where id=a.id;
 return jsonb_build_object('retryScheduled',a.attempts<5,'blocked',a.attempts>=5);
end;$$;

create function private.retention_storage_allowed_v1(p_bucket text,p_path text,p_mode text)
returns boolean language sql volatile security definer set search_path='' as $$
 select p_mode in ('delete','metadata') and storage.allow_any_operation(array['object.delete','object.delete_many','object.get_authenticated_info','object.head_authenticated_info'])
 and not private.storage_has_legal_hold_v1(p_bucket,p_path)
 and exists(select 1 from private.retention_actions a join private.worker_tokens w on w.id=a.worker_token_id join auth.users u on u.id=a.leased_account_id
 where a.bucket_id=p_bucket and a.object_path=p_path
 and not exists(select 1 from storage.objects o where o.bucket_id=p_bucket and o.name=p_path and o.id is distinct from a.storage_object_id) and a.state='leased' and a.lease_expires_at>clock_timestamp() and a.leased_account_id=auth.uid()
 and w.status='active' and w.revoked_at is null and w.execution_account_user_id=auth.uid() and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()));
$$;
create policy retention_storage_delete on storage.objects for delete to authenticated using(private.retention_storage_allowed_v1(bucket_id,name,'delete'));
create policy retention_storage_metadata on storage.objects for select to authenticated using(private.retention_storage_allowed_v1(bucket_id,name,'metadata'));
-- Preserve the restrictive source binding guard; only the exact cleanup lease may delete it.
create or replace function private.source_storage_is_unbound_v1(p_bucket text,p_path text)
returns boolean language sql volatile security definer set search_path='' as $$
 select(not exists(select 1 from public.source_versions where bucket_id=p_bucket and object_path=p_path)
 and not exists(select 1 from public.document_layers where bucket_id=p_bucket and object_path=p_path))
 or private.retention_storage_allowed_v1(p_bucket,p_path,'delete');
$$;

create function public.worker_claim_retention_action_v1(p_worker_token text) returns jsonb language sql security invoker set search_path='' as $$select private.worker_claim_retention_action_v1(p_worker_token);$$;
create function public.worker_revalidate_retention_action_v1(p_worker_token text,p_action_id uuid,p_capability text) returns boolean language sql security invoker set search_path='' as $$select private.worker_revalidate_retention_action_v1(p_worker_token,p_action_id,p_capability);$$;
create function public.worker_ack_retention_action_v1(p_worker_token text,p_action_id uuid,p_capability text,p_storage_absence_confirmed boolean) returns jsonb language sql security invoker set search_path='' as $$select private.worker_ack_retention_action_v1(p_worker_token,p_action_id,p_capability,p_storage_absence_confirmed);$$;
create function public.worker_retry_retention_action_v1(p_worker_token text,p_action_id uuid,p_capability text,p_reason text) returns jsonb language sql security invoker set search_path='' as $$select private.worker_retry_retention_action_v1(p_worker_token,p_action_id,p_capability,p_reason);$$;
do $$declare f record;begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('private','public') and p.proname in('process_revocation_targets_v1','plan_retention_actions_v1','retention_action_authorized_v1','worker_claim_retention_action_v1','worker_revalidate_retention_action_v1','worker_ack_retention_action_v1','worker_retry_retention_action_v1','retention_storage_allowed_v1') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.oid::regprocedure);
 if f.proname like 'worker_%' or f.proname='retention_storage_allowed_v1' then execute format('grant execute on function %s to authenticated',f.oid::regprocedure);end if;
 end loop;
end;$$;

-- Once physical destruction was admitted, a new hold cannot promise to preserve that scope.
-- Both commands take the same organization policy lock; existing holds block the claim.
create or replace function private.place_legal_hold_v1(p_resource_id uuid,p_basis_reference uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=private.policy_admin_context_v1();hold uuid;
begin
 if p_basis_reference is null or not exists(select 1 from private.access_resources where organization_id=org and id=p_resource_id)
 then raise exception 'legal_hold_invalid' using errcode='22023';end if;
 if exists(select 1 from private.retention_actions a where a.organization_id=org and a.state<>'completed' and a.attempts>0
 and (a.resource_id=p_resource_id or private.resource_root_v1(org,a.resource_id)=p_resource_id))
 or exists(select 1 from private.capital_public_payload_purge_queue q join private.capital_public_payload_allocations a on a.organization_id=q.organization_id and a.id=q.allocation_id
 join public.processing_jobs j on j.organization_id=a.organization_id and j.id=a.job_id where a.organization_id=org and q.status<>'purged' and q.attempts>0
 and (j.authorization_resource_id=p_resource_id or private.resource_root_v1(org,j.authorization_resource_id)=p_resource_id))
 then raise exception 'legal_hold_destruction_already_started' using errcode='55000';end if;
 insert into private.legal_holds(organization_id,resource_id,basis_reference,created_by) values(org,p_resource_id,p_basis_reference,auth.uid()) returning id into hold;
 return hold;
end;$$;

create or replace function private.source_storage_read_v1(p_bucket text,p_path text)
returns boolean language sql volatile security definer set search_path='' as $$
 select(not exists(select 1 from public.source_versions where bucket_id=p_bucket and object_path=p_path)and not exists(select 1 from public.document_layers where bucket_id=p_bucket and object_path=p_path))
 or exists(select 1 from public.document_layers where bucket_id=p_bucket and object_path=p_path and private.can_export_source_version_v1(organization_id,source_document_id))
 or exists(select 1 from public.source_versions where bucket_id=p_bucket and object_path=p_path and private.can_export_source_version_v1(organization_id,id))
 or private.worker_can_access_document_storage_v1(p_bucket,p_path,false)
 or private.artifact_roundtrip_storage_allowed_v1(p_bucket,p_path,false)
 or private.retention_storage_allowed_v1(p_bucket,p_path,'metadata');
$$;

create or replace function private.set_retention_rule_v1(p_resource_id uuid,p_mode text,p_expires_at timestamptz,p_basis_reference uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=private.policy_admin_context_v1();r private.retention_rules;
begin
 if p_basis_reference is null or p_mode is null or p_mode not in ('retain','expire') or (p_mode='expire') is distinct from(p_expires_at is not null)
 or(p_expires_at is not null and(not isfinite(p_expires_at) or p_expires_at<=clock_timestamp()))
 or not exists(select 1 from private.access_resources where organization_id=org and id=p_resource_id)
 then raise exception 'retention_rule_invalid' using errcode='22023';end if;
 if exists(select 1 from private.retention_actions where organization_id=org and resource_id=p_resource_id)
 then raise exception 'retention_disposal_already_admitted' using errcode='55000';end if;
 insert into private.retention_rules(organization_id,resource_id,revision,mode,expires_at,basis_reference,created_by)
 values(org,p_resource_id,(select coalesce(max(revision),0)+1 from private.retention_rules where organization_id=org and resource_id=p_resource_id),p_mode,p_expires_at,p_basis_reference,auth.uid()) returning * into r;
 perform private.policy_invalidate_jobs_v1(org);
 return jsonb_build_object('ruleId',r.id,'revision',r.revision,'mode',r.mode,'expiresAt',r.expires_at);
end;$$;
