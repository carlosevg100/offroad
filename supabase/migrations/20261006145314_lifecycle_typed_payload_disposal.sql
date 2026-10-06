-- Expiration erases typed derivative payloads while preserving immutable identity and fingerprints.
set search_path='';
create table private.typed_payload_disposals(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),resource_id uuid not null,rule_id uuid not null,
 disposed_at timestamptz not null default clock_timestamp(),worker_account_id uuid not null references auth.users(id),
 revision_count integer not null check(revision_count>=0),block_count integer not null check(block_count>=0),
 identity_fingerprint text not null check(identity_fingerprint~'^[a-f0-9]{64}$'),
 unique(organization_id,id),unique(organization_id,rule_id,resource_id),
 foreign key(organization_id,rule_id)references private.retention_rules(organization_id,id),
 foreign key(organization_id,resource_id)references private.access_resources(organization_id,id)
);
alter table private.typed_payload_disposals enable row level security;
alter table private.typed_payload_disposals force row level security;
revoke all on private.typed_payload_disposals from public,anon,authenticated,service_role;
create policy typed_disposals_deny on private.typed_payload_disposals for all to authenticated using(false)with check(false);
create trigger typed_disposals_immutable before update or delete on private.typed_payload_disposals for each row execute function private.deny_domain_audit_mutation_v1();
create trigger typed_disposals_no_truncate before truncate on private.typed_payload_disposals for each statement execute function private.deny_domain_audit_mutation_v1();
create index typed_disposals_worker_idx on private.typed_payload_disposals(worker_account_id);
alter table public.artifact_revisions add column payload_disposal_id uuid;
alter table public.artifact_blocks add column payload_disposal_id uuid;
alter table public.artifact_revisions add constraint artifact_revision_disposal_fk foreign key(organization_id,payload_disposal_id)references private.typed_payload_disposals(organization_id,id);
alter table public.artifact_blocks add constraint artifact_block_disposal_fk foreign key(organization_id,payload_disposal_id)references private.typed_payload_disposals(organization_id,id);
create index artifact_revision_disposal_idx on public.artifact_revisions(organization_id,payload_disposal_id)where payload_disposal_id is not null;
create index artifact_block_disposal_idx on public.artifact_blocks(organization_id,payload_disposal_id)where payload_disposal_id is not null;
alter table public.artifact_revisions drop constraint artifact_revisions_check2;
alter table public.artifact_revisions add constraint artifact_revision_payload_identity check(
 (payload_disposal_id is null and manifest_fingerprint=encode(extensions.digest(convert_to(manifest::text,'utf8'),'sha256'),'hex'))
 or(payload_disposal_id is not null and manifest='{"retention":"erased"}'::jsonb));
alter table public.artifact_blocks drop constraint artifact_blocks_check;
alter table public.artifact_blocks add constraint artifact_block_payload_identity check(
 (payload_disposal_id is null and content_fingerprint=encode(extensions.digest(convert_to(content::text,'utf8'),'sha256'),'hex'))
 or(payload_disposal_id is not null and content='{"retention":"erased"}'::jsonb and claims='[]'::jsonb));

create or replace function private.reject_artifact_history_mutation_v1()returns trigger language plpgsql security invoker set search_path=''as $$
declare disposal private.typed_payload_disposals;work uuid;row_before jsonb;row_after jsonb;
begin
 if tg_op='UPDATE'and tg_table_name in('artifact_revisions','artifact_blocks')then
  row_before:=to_jsonb(old);row_after:=to_jsonb(new);
  if row_before->>'payload_disposal_id'is not null or row_after->>'payload_disposal_id'is null then raise exception 'artifact_revision_immutable'using errcode='23514';end if;
  select*into disposal from private.typed_payload_disposals where organization_id=new.organization_id and id=(row_after->>'payload_disposal_id')::uuid;
  if tg_table_name='artifact_revisions'then
   select a.work_id into work from public.artifacts a where a.organization_id=new.organization_id and a.id=new.artifact_id;
   row_before:=row_before-'manifest'-'payload_disposal_id';row_after:=row_after-'manifest'-'payload_disposal_id';
  else
   select a.work_id into work from public.artifact_revisions r join public.artifacts a on(a.organization_id,a.id)=(r.organization_id,r.artifact_id)
    where r.organization_id=new.organization_id and r.id=new.revision_id;
   row_before:=row_before-'content'-'claims'-'payload_disposal_id';row_after:=row_after-'content'-'claims'-'payload_disposal_id';
  end if;
  if disposal.id is not null and disposal.resource_id=work and disposal.worker_account_id=auth.uid()
   and row_before=row_after and not private.resource_legal_hold_v1(new.organization_id,work)
   and not private.retention_access_allowed_v1(new.organization_id,work)
   and exists(select 1 from private.worker_tokens w where w.execution_account_user_id=auth.uid()and w.revoked_at is null)then return new;end if;
 end if;
 raise exception 'artifact_revision_immutable'using errcode='23514';
end;$$;

create function private.dispose_typed_retention_payloads_v1(p_worker_token text,p_limit integer default 20)returns integer
language plpgsql security definer set search_path=''as $$
declare worker uuid:=private.capital_public_purge_worker_v1(p_worker_token);candidate record;disposal_id uuid;revisions integer;blocks integer;fingerprint text;total integer:=0;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'disposal_limit_invalid'using errcode='22023';end if;
 for candidate in select rr.organization_id,rr.resource_id,rr.id rule_id,a.work_id from private.retention_rules rr
 join private.retention_plan_receipts plan on(plan.organization_id,plan.rule_id)=(rr.organization_id,rr.id)
 join public.artifacts a on a.organization_id=rr.organization_id and private.resource_is_within_v1(a.organization_id,a.work_id,rr.resource_id)
 where rr.mode='expire'and rr.expires_at<=clock_timestamp()
 and not exists(select 1 from private.retention_rules newer where newer.organization_id=rr.organization_id and newer.resource_id=rr.resource_id and newer.revision>rr.revision)
 and not exists(select 1 from private.typed_payload_disposals done where done.organization_id=rr.organization_id and done.rule_id=rr.id and done.resource_id=a.work_id)
 group by rr.organization_id,rr.resource_id,rr.id,a.work_id order by rr.id,a.work_id limit p_limit loop
  perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||candidate.organization_id::text,0));
  if private.resource_legal_hold_v1(candidate.organization_id,candidate.work_id)or private.retention_access_allowed_v1(candidate.organization_id,candidate.work_id)then continue;end if;
  if exists(select 1 from private.typed_payload_disposals done where done.organization_id=candidate.organization_id and done.rule_id=candidate.rule_id and done.resource_id=candidate.work_id)then continue;end if;
  select count(*)into revisions from public.artifact_revisions r join public.artifacts a on(a.organization_id,a.id)=(r.organization_id,r.artifact_id)
   where r.organization_id=candidate.organization_id and a.work_id=candidate.work_id and r.payload_disposal_id is null;
  select count(*)into blocks from public.artifact_blocks b join public.artifact_revisions r on(r.organization_id,r.id)=(b.organization_id,b.revision_id)
   join public.artifacts a on(a.organization_id,a.id)=(r.organization_id,r.artifact_id)where a.organization_id=candidate.organization_id and a.work_id=candidate.work_id and b.payload_disposal_id is null;
  select encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_array(r.id,r.manifest_fingerprint,r.content_sha256)order by r.id),'[]')::text,'sha256'),'hex')into fingerprint
   from public.artifact_revisions r join public.artifacts a on(a.organization_id,a.id)=(r.organization_id,r.artifact_id)where a.organization_id=candidate.organization_id and a.work_id=candidate.work_id;
  insert into private.typed_payload_disposals(organization_id,resource_id,rule_id,worker_account_id,revision_count,block_count,identity_fingerprint)
   values(candidate.organization_id,candidate.work_id,candidate.rule_id,auth.uid(),revisions,blocks,fingerprint)returning id into disposal_id;
  update public.artifact_blocks b set content='{"retention":"erased"}',claims='[]',payload_disposal_id=disposal_id
   from public.artifact_revisions r,public.artifacts a where(r.organization_id,r.id)=(b.organization_id,b.revision_id)and(a.organization_id,a.id)=(r.organization_id,r.artifact_id)
   and a.organization_id=candidate.organization_id and a.work_id=candidate.work_id and b.payload_disposal_id is null;
  update public.artifact_revisions r set manifest='{"retention":"erased"}',payload_disposal_id=disposal_id
   from public.artifacts a where(a.organization_id,a.id)=(r.organization_id,r.artifact_id)and a.organization_id=candidate.organization_id and a.work_id=candidate.work_id and r.payload_disposal_id is null;
  total:=total+1;
 end loop;return total;
end;$$;
revoke all on function private.dispose_typed_retention_payloads_v1(text,integer)from public,anon,authenticated,service_role;

create trigger typed_disposals_audit after insert on private.typed_payload_disposals for each row execute function private.capture_identity_audit_v1();
create or replace function private.worker_claim_retention_action_v1(p_worker_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare worker uuid:=private.capital_public_purge_worker_v1(p_worker_token);a private.retention_actions;cap text;blocked bigint;held bigint;oldest double precision;
begin
 perform private.process_revocation_targets_v1(p_worker_token,20);
 perform private.plan_retention_actions_v1(p_worker_token,20);
 perform private.dispose_typed_retention_payloads_v1(p_worker_token,20);
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

create or replace function private.worker_claim_audit_batch_v1(p_worker_token text)returns jsonb language plpgsql security definer set search_path=''as $$
declare worker uuid:=private.capital_public_purge_worker_v1(p_worker_token);b private.audit_export_batches;w private.audit_archive_wakes;events jsonb;changes jsonb;payload text;first_id bigint;last_id bigint;cap text;blocked bigint;oldest double precision;
begin
 update private.audit_export_batches set state='blocked'where state='leased'and lease_expires_at<=clock_timestamp()and attempts>=5;
 select count(*)into blocked from private.audit_export_batches where state='blocked';
 select coalesce(extract(epoch from clock_timestamp()-min(created_at)),0)into oldest from private.audit_export_batches where state<>'completed';
 select*into b from private.audit_export_batches where state='pending'or(state='leased'and lease_expires_at<=clock_timestamp()and attempts<5)order by created_at,id limit 1 for update skip locked;
 if b.id is null then
  select*into w from private.audit_archive_wakes q where q.last_event_id>q.archived_through_id
  and not exists(select 1 from private.audit_export_batches prior where prior.organization_id=q.organization_id and prior.state<>'completed')
  order by q.updated_at,q.organization_id limit 1 for update skip locked;
  if w.organization_id is null then return jsonb_build_object('claimed',false,'blockedCount',blocked,'oldestPendingSeconds',greatest(oldest,0));end if;
  select min(id),max(id),jsonb_agg(event order by id)into first_id,last_id,events from(select id,jsonb_build_object('id',id,'actorId',actor_user_id,
   'action',case when action~'^[a-zA-Z0-9_.:-]{1,100}$'then action else 'legacy.unspecified'end,
   'resourceType',case when resource_type~'^[a-zA-Z0-9_.:-]{1,100}$'then resource_type else 'legacy_unspecified'end,
   'resourceId',case when resource_id~'^[a-f0-9-]{36}$'then resource_id else null end,'occurredAt',occurred_at,'decision',case when metadata->>'schemaVersion'='sensitive-operation.v1'then jsonb_build_object('resourceVersionId',case when metadata->>'resourceVersionId'~'^[a-f0-9-]{36}$'then metadata->>'resourceVersionId'else null end,'policyVersion','resource-policy.v22','policyFingerprint',case when metadata->>'policyFingerprint'~'^[a-f0-9]{64}$'then metadata->>'policyFingerprint'else null end,'result',case when metadata->>'result'in('allow','deny')then metadata->>'result'else null end)else null end)event
   from public.audit_events where organization_id=w.organization_id and id>w.archived_through_id order by id limit 500)q;
  if first_id is null then raise exception 'audit_archive_cursor_invalid'using errcode='55000';end if;
  select coalesce(jsonb_agg(jsonb_build_object('eventId',d.id,'kind',d.aggregate_kind,'aggregateId',d.aggregate_id,'revision',d.aggregate_version,'reason',d.reason,
   'fingerprint',d.fingerprint,'state',jsonb_build_object('before',(d.protected_state->'before')-'basis','after',(d.protected_state->'after')-'basis'))order by d.audit_event_id),'[]')into changes from private.domain_events d
   where d.organization_id=w.organization_id and d.audit_event_id between first_id and last_id
   and d.aggregate_kind in('membership','resource_grant','workspace_capability','commercial_account_link');
  payload:=jsonb_build_object('schemaVersion','audit-archive.v1','organizationId',w.organization_id,'firstEventId',first_id,'lastEventId',last_id,'events',events,'authorityChanges',changes)::text;
  insert into private.audit_export_batches(organization_id,first_event_id,last_event_id,canonical_payload,payload_sha256)
  values(w.organization_id,first_id,last_id,payload,encode(extensions.digest(convert_to(payload,'utf8'),'sha256'),'hex'))returning*into b;
 end if;
 cap:=encode(extensions.gen_random_bytes(32),'hex');
 update private.audit_export_batches set state='leased',attempts=attempts+1,worker_token_id=worker,leased_account_id=auth.uid(),capability_sha256=extensions.digest(cap,'sha256'),lease_expires_at=clock_timestamp()+interval '120 seconds'where id=b.id returning*into b;
 return jsonb_build_object('claimed',true,'blockedCount',blocked,'oldestPendingSeconds',greatest(oldest,0),'batchId',b.id,'organizationId',b.organization_id,
 'capability',cap,'canonicalPayload',b.canonical_payload,'sha256',b.payload_sha256,'leaseExpiresAt',b.lease_expires_at);
end;$$;
