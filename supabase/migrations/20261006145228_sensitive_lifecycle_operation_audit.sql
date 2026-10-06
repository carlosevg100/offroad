-- Metadata-only sensitive-operation records are emitted by command boundaries, never by RLS row evaluation.
set search_path='';
create function private.append_sensitive_operation_v1(p_org uuid,p_resource uuid,p_version uuid,p_operation text,p_allowed boolean,p_actor uuid default auth.uid())
returns void language plpgsql security definer set search_path=''as $$declare policy text;begin
 if p_operation not in('read','search','processing','download')then raise exception 'audit_operation_invalid'using errcode='22023';end if;
 policy:=encode(extensions.digest(jsonb_build_object('version','resource-policy.v22','organization',p_org,'resource',p_resource,
  'actor',p_actor,'decision',coalesce(p_allowed,false),'authorityRevision',coalesce((select max(d.audit_event_id)from private.domain_events d where d.organization_id=p_org),0),'operation',p_operation,'rule',coalesce((select jsonb_agg(jsonb_build_array(r.id,r.revision)order by r.revision,r.id)from private.retention_rules r where r.organization_id=p_org and r.resource_id=p_resource),'[]'))::text,'sha256'),'hex');
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
 values(p_org,p_actor,p_operation||case when coalesce(p_allowed,false) then '.allowed'else '.denied'end,'resource',p_resource::text,
  jsonb_build_object('schemaVersion','sensitive-operation.v1','resourceVersionId',p_version,'policyVersion','resource-policy.v22','policyFingerprint',policy,'result',case when coalesce(p_allowed,false) then 'allow'else 'deny'end));
end;$$;
revoke all on function private.append_sensitive_operation_v1(uuid,uuid,uuid,text,boolean,uuid)from public,anon,authenticated,service_role;

create function private.read_audited_artifact_revision_v1(p_revision uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare r public.artifact_revisions;result jsonb;begin
 select*into r from public.artifact_revisions where id=p_revision;
 result:=private.read_artifact_revision_v1(p_revision);
 if r.id is not null then perform private.append_sensitive_operation_v1(r.organization_id,r.work_id,r.id,'read',result->'restriction'='null'::jsonb);end if;
 return result;
end;$$;
create or replace function public.read_artifact_revision_v1(p_revision_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.read_audited_artifact_revision_v1(p_revision_id);$$;
create function private.read_audited_artifact_head_v1(p_work uuid,p_kind text,p_subject text)returns jsonb language plpgsql security definer set search_path=''as $$
declare org uuid;result jsonb;begin
 result:=private.read_artifact_head_v1(p_work,p_kind,p_subject);
 select organization_id into org from private.access_resources where id=p_work;
 if org is not null then perform private.append_sensitive_operation_v1(org,p_work,(result#>>'{revision,id}')::uuid,'read',result is not null and result->'restriction'='null'::jsonb);end if;
 return result;
end;$$;
create or replace function public.read_artifact_head_v1(p_work_id uuid,p_kind text,p_subject text)returns jsonb language sql security invoker set search_path=''as $$select private.read_audited_artifact_head_v1(p_work_id,p_kind,p_subject);$$;

create function private.search_audited_resources_v1(p_org uuid,p_resource uuid,p_query text,p_limit integer default 12,p_purpose text default 'analysis')
returns table(chunk_id uuid,content text,source_document_id uuid,source_anchor jsonb,citation_key text,score real)
language plpgsql security definer set search_path=''as $$declare allowed boolean;begin
 -- Existing search acquires the policy lock and filters every source at candidate and delivery time.
 return query select*from private.search_authorized_resources_v1(p_org,p_resource,p_query,p_limit,p_purpose);
 allowed:=p_purpose='analysis'and private.can_access_resource_v1(p_org,p_resource,'read');
 if exists(select 1 from private.access_resources where organization_id=p_org and id=p_resource)and auth.uid()is not null then
  perform private.append_sensitive_operation_v1(p_org,p_resource,null,'search',allowed);
 end if;
end;$$;
create or replace function public.search_authorized_resources_v1(p_organization_id uuid,p_resource_id uuid,p_query text,p_limit integer default 12,p_purpose text default 'analysis')
returns table(chunk_id uuid,content text,source_document_id uuid,source_anchor jsonb,citation_key text,score real)
language sql security invoker set search_path=''as $$select*from private.search_audited_resources_v1(p_organization_id,p_resource_id,p_query,p_limit,p_purpose);$$;

create function private.capture_processing_operation_v1()returns trigger language plpgsql security definer set search_path=''as $$
declare job public.processing_jobs;begin
 if tg_table_name='processing_eligibility_decisions'then
  select*into job from public.processing_jobs where organization_id=new.organization_id and id=new.job_id;
  perform private.append_sensitive_operation_v1(new.organization_id,job.intake_session_id,new.id,'processing',new.allowed,job.authorization_subject_id);
 else
  perform private.append_sensitive_operation_v1(new.organization_id,new.intake_session_id,null,'search',true,new.actor_user_id);
 end if;return new;
end;$$;
create trigger processing_operation_audit after insert on private.processing_eligibility_decisions for each row execute function private.capture_processing_operation_v1();
create trigger retrieval_operation_audit after insert on private.retrieval_audit_events for each row execute function private.capture_processing_operation_v1();
revoke all on function private.capture_processing_operation_v1()from public,anon,authenticated,service_role;

do $$declare f record;begin for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private'and p.proname in('read_audited_artifact_revision_v1','read_audited_artifact_head_v1','search_audited_resources_v1')loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.oid::regprocedure);
 execute format('grant execute on function %s to authenticated',f.oid::regprocedure);end loop;end;$$;

-- Archive only the typed decision receipt, never arbitrary legacy metadata.
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
   'fingerprint',d.fingerprint,'state',d.protected_state)order by d.audit_event_id),'[]')into changes from private.domain_events d
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
