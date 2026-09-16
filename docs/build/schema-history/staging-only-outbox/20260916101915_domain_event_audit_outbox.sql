set local lock_timeout = '5s';
-- Durable authority events; no historical audit is relabelled as a new event.
alter table public.audit_events add constraint audit_events_organization_id_id_key unique (organization_id,id);
alter table private.human_intervention_ledger add constraint human_intervention_ledger_organization_id_id_key unique(organization_id,id);
alter table private.retrieval_audit_events add constraint retrieval_audit_events_organization_id_id_key unique(organization_id,id);
alter table private.worker_tokens add column event_outbox_polled_at timestamptz;

create table private.domain_events (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id),
 aggregate_kind text not null check (aggregate_kind in ('membership','resource_grant','workspace_capability','commercial_account_link')),
 aggregate_id uuid not null,
 aggregate_version bigint not null check(aggregate_version>0),
 event_version integer not null default 1 check(event_version=1),
 actor_user_id uuid,
 actor_kind text not null check(actor_kind in ('user','system')),
 reason text not null check(reason in ('created','changed','removed')),
 effect text not null default 'revalidate_authority' check(effect='revalidate_authority'),
 correlation_id uuid not null,
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 protected_state jsonb not null check(jsonb_typeof(protected_state)='object'),
 audit_event_id bigint not null,
 human_intervention_id uuid,
 retrieval_audit_event_id bigint,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,aggregate_kind,aggregate_id,aggregate_version),
 foreign key(organization_id,audit_event_id) references public.audit_events(organization_id,id),
 foreign key(organization_id,human_intervention_id) references private.human_intervention_ledger(organization_id,id),
 foreign key(organization_id,retrieval_audit_event_id) references private.retrieval_audit_events(organization_id,id)
);
create index domain_events_audit_idx on private.domain_events(organization_id,audit_event_id);
create index domain_events_human_idx on private.domain_events(organization_id,human_intervention_id);
create index domain_events_retrieval_idx on private.domain_events(organization_id,retrieval_audit_event_id);
create table private.event_outbox (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 event_id uuid not null,
 status text not null default 'pending' check(status in ('pending','leased','completed','blocked')),
 attempts integer not null default 0 check(attempts>=0),
 lease_expires_at timestamptz,
 capability_sha256 bytea,
 worker_token_id uuid references private.worker_tokens(id),
 leased_account_user_id uuid,
 completed_at timestamptz,
 applied_count integer not null default 0 check(applied_count>=0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,event_id),
 foreign key(organization_id,event_id) references private.domain_events(organization_id,id)
);
create index event_outbox_ready_idx on private.event_outbox(created_at,id) where status in ('pending','leased');
create index event_outbox_tenant_pending_idx on private.event_outbox(organization_id,status) where status<>'completed';
create index event_outbox_health_idx on private.event_outbox(created_at) where status<>'completed';
create index event_outbox_worker_idx on private.event_outbox(worker_token_id);
create table private.access_decision_events (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 domain_event_id uuid not null,
 processing_job_id uuid not null,
 decision text not null check(decision='deny'),
 reason text not null check(reason='authorization_revoked'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,domain_event_id,processing_job_id),
 foreign key(organization_id,domain_event_id) references private.domain_events(organization_id,id),
 foreign key(organization_id,processing_job_id) references public.processing_jobs(organization_id,id)
);
create index access_decision_events_job_idx on private.access_decision_events(organization_id,processing_job_id);

-- These tables are a private command boundary, not an organization-membership projection.
do $$ declare t text; begin
 foreach t in array array['domain_events','event_outbox','access_decision_events'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated',t);
  execute format('create policy deny_client_select on private.%I for select to authenticated using(false)',t);
  execute format('create policy deny_client_insert on private.%I for insert to authenticated with check(false)',t);
  execute format('create policy deny_client_update on private.%I for update to authenticated using(false) with check(false)',t);
  execute format('create policy deny_client_delete on private.%I for delete to authenticated using(false)',t);
 end loop;
end $$;
create function private.deny_domain_audit_mutation_v1() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'domain_audit_immutable' using errcode='42501'; end $$;
revoke all on function private.deny_domain_audit_mutation_v1() from public,anon,authenticated,service_role;
create trigger domain_events_immutable before update or delete on private.domain_events for each row execute function private.deny_domain_audit_mutation_v1();
create trigger access_decision_events_immutable before update or delete on private.access_decision_events for each row execute function private.deny_domain_audit_mutation_v1();

-- Not callable by a user or the worker: only the protected mutation trigger produces events.
create function private.append_domain_event_v1(p_id uuid,p_organization_id uuid,p_kind text,p_aggregate_id uuid,p_reason text,p_state jsonb,p_human_intervention_id uuid default null,p_retrieval_event_id bigint default null,p_correlation_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare existing private.domain_events; digest text; revision bigint; audit_id bigint;
begin
 digest:=encode(extensions.digest(jsonb_build_object('organization',p_organization_id,'kind',p_kind,'aggregate',p_aggregate_id,'reason',p_reason,'state',p_state,'actor',auth.uid(),'humanIntervention',p_human_intervention_id,'retrievalEvent',p_retrieval_event_id,'correlation',coalesce(p_correlation_id,p_id))::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('domain-event:'||p_id::text,0));
 select * into existing from private.domain_events where id=p_id;
 if found then
  if existing.fingerprint<>digest then raise exception 'domain_event_retry_conflict' using errcode='22023'; end if;
  return existing.id;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_kind||':'||p_aggregate_id::text,0));
 select coalesce(max(aggregate_version),0)+1 into revision from private.domain_events
 where organization_id=p_organization_id and aggregate_kind=p_kind and aggregate_id=p_aggregate_id;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
 values(p_organization_id,auth.uid(),'domain.'||p_reason,p_kind,p_aggregate_id::text,jsonb_build_object('domain_event_id',p_id,'aggregate_version',revision,'correlation_id',coalesce(p_correlation_id,p_id))) returning id into audit_id;
 insert into private.domain_events(id,organization_id,aggregate_kind,aggregate_id,aggregate_version,actor_user_id,actor_kind,reason,correlation_id,fingerprint,protected_state,audit_event_id,human_intervention_id,retrieval_audit_event_id)
 values(p_id,p_organization_id,p_kind,p_aggregate_id,revision,auth.uid(),case when auth.uid() is null then 'system' else 'user' end,p_reason,coalesce(p_correlation_id,p_id),digest,p_state,audit_id,p_human_intervention_id,p_retrieval_event_id);
 insert into private.event_outbox(organization_id,event_id) values(p_organization_id,p_id);
 return p_id;
end $$;
revoke all on function private.append_domain_event_v1(uuid,uuid,text,uuid,text,jsonb,uuid,bigint,uuid) from public,anon,authenticated,service_role;

create function private.capture_authority_domain_event_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare before_state jsonb; after_state jsonb; row_state jsonb; fields text[]; kind text; org uuid; aggregate uuid; correlation uuid;
begin
 correlation:=nullif(current_setting('offroad.domain_event_correlation',true),'')::uuid;
 if correlation is null then
  correlation:=gen_random_uuid();
  perform set_config('offroad.domain_event_correlation',correlation::text,true);
 end if;
 kind:=tg_argv[0];
 fields:=case kind
  when 'membership' then array['organization_id','user_id','role','status']
  when 'resource_grant' then array['organization_id','id','resource_kind','resource_id','subject_user_id','subject_role','action','grant_basis','valid_from','expires_at','revoked_at']
  when 'workspace_capability' then array['organization_id','id','capability','enabled','basis','revision']
  when 'commercial_account_link' then array['organization_id','id','account_owner_organization_id','commercial_account_id'] end;
 if fields is null then raise exception 'unregistered_domain_event_source'; end if;
 if tg_op<>'INSERT' then select jsonb_object_agg(key,value) into before_state from jsonb_each(to_jsonb(old)) where key=any(fields); end if;
 if tg_op<>'DELETE' then select jsonb_object_agg(key,value) into after_state from jsonb_each(to_jsonb(new)) where key=any(fields); end if;
 if before_state is not distinct from after_state then return coalesce(new,old); end if;
 row_state:=coalesce(after_state,before_state); org:=(row_state->>'organization_id')::uuid;
 aggregate:=(row_state->>case when kind='membership' then 'user_id' else 'id' end)::uuid;
 perform private.append_domain_event_v1(gen_random_uuid(),org,kind,aggregate,
 case tg_op when 'INSERT' then 'created' when 'DELETE' then 'removed' else 'changed' end,
 jsonb_build_object('before',before_state,'after',after_state),null,null,correlation);
 return coalesce(new,old);
end $$;
revoke all on function private.capture_authority_domain_event_v1() from public,anon,authenticated,service_role;
create trigger membership_domain_event after insert or update or delete on public.organization_memberships for each row execute function private.capture_authority_domain_event_v1('membership');
create trigger resource_grant_domain_event after insert or update or delete on private.resource_access_grants for each row execute function private.capture_authority_domain_event_v1('resource_grant');
create trigger workspace_capability_domain_event after insert or update or delete on private.workspace_capability_grants for each row execute function private.capture_authority_domain_event_v1('workspace_capability');
create trigger commercial_account_link_domain_event after insert or update or delete on private.account_organizations for each row execute function private.capture_authority_domain_event_v1('commercial_account_link');

create function private.claim_event_outbox_v1(p_worker_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare worker_id uuid; item private.event_outbox; event private.domain_events; capability text; blocked bigint; oldest double precision;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=now())) then
  raise exception 'worker_account_required' using errcode='42501';
 end if;
 worker_id:=private.worker_identity(p_worker_token);
 update private.worker_tokens set event_outbox_polled_at=clock_timestamp() where id=worker_id;
 -- A crash is recoverable through an expired lease; repeated crashes are explicit poison.
 update private.event_outbox set status='blocked',updated_at=clock_timestamp()
 where id in (select id from private.event_outbox where status='leased' and lease_expires_at<clock_timestamp() and attempts>=5 order by created_at,id limit 100 for update skip locked);
 select count(*) into blocked from private.event_outbox where status='blocked';
 select coalesce(extract(epoch from clock_timestamp()-min(created_at)),0) into oldest from private.event_outbox where status<>'completed';
 select * into item from private.event_outbox
 where status='pending' or (status='leased' and lease_expires_at<clock_timestamp() and attempts<5)
 order by created_at,id limit 1 for update skip locked;
 if not found then return jsonb_build_object('claimed',false,'blockedCount',blocked,'oldestPendingSeconds',greatest(oldest,0)); end if;
 capability:=encode(extensions.gen_random_bytes(32),'hex');
 update private.event_outbox set status='leased',attempts=attempts+1,lease_expires_at=clock_timestamp()+interval '60 seconds',
 capability_sha256=extensions.digest(capability,'sha256'),worker_token_id=worker_id,leased_account_user_id=auth.uid(),updated_at=clock_timestamp() where id=item.id;
 select * into event from private.domain_events where organization_id=item.organization_id and id=item.event_id;
 return jsonb_build_object('claimed',true,'outboxId',item.id,'capability',capability,'blockedCount',blocked,'oldestPendingSeconds',greatest(oldest,0),
 'event',jsonb_build_object('id',event.id,'organizationId',event.organization_id,'aggregateKind',event.aggregate_kind,'aggregateId',event.aggregate_id,
 'aggregateVersion',event.aggregate_version,'eventVersion',event.event_version,'actorKind',event.actor_kind,'actorId',event.actor_user_id,
 'reason',event.reason,'effect',event.effect,'correlationId',event.correlation_id));
end $$;
revoke all on function private.claim_event_outbox_v1(text) from public,anon;
grant execute on function private.claim_event_outbox_v1(text) to authenticated;
create function public.claim_event_outbox_v1(p_worker_token text) returns jsonb language sql security invoker set search_path='' as $$ select private.claim_event_outbox_v1(p_worker_token) $$;
revoke all on function public.claim_event_outbox_v1(text) from public,anon;
grant execute on function public.claim_event_outbox_v1(text) to authenticated;

create function private.complete_event_outbox_v1(p_worker_token text,p_outbox_id uuid,p_capability text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare worker_id uuid; item private.event_outbox; job record; applied integer:=0; remaining boolean;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=now())) then
  raise exception 'worker_account_required' using errcode='42501';
 end if;
 worker_id:=private.worker_identity(p_worker_token);
 select * into item from private.event_outbox where id=p_outbox_id for update;
 if not found or item.worker_token_id is distinct from worker_id or item.leased_account_user_id is distinct from auth.uid()
 or item.capability_sha256 is distinct from extensions.digest(p_capability,'sha256') then raise exception 'event_capability_invalid' using errcode='42501'; end if;
 if item.status='completed' then return jsonb_build_object('completed',true,'replayed',true,'appliedCount',item.applied_count); end if;
 if item.status<>'leased' or item.lease_expires_at<=clock_timestamp() then raise exception 'event_lease_expired' using errcode='42501'; end if;
 -- A delayed event never overrides a subsequent regrant: the current authority wins.
 for job in select j.id from public.processing_jobs j where j.organization_id=item.organization_id
  and j.status in ('queued','leased','awaiting_approval') and not private.job_authority_is_current_v1(j.id)
  order by j.id limit 100 for update of j skip locked loop
  if not private.lock_job_authority_v1(job.id) then
   insert into private.access_decision_events(organization_id,domain_event_id,processing_job_id,decision,reason)
   values(item.organization_id,item.event_id,job.id,'deny','authorization_revoked');
   update public.processing_jobs set status='cancelled',capability_sha256=null,lease_expires_at=null,leased_by=null,
    last_error=jsonb_build_object('reason','authorization_revoked'),updated_at=clock_timestamp() where id=job.id;
   applied:=applied+1;
  end if;
 end loop;
 update public.processing_runs r set status='cancelled',completed_at=clock_timestamp(),
  error=jsonb_build_object('reason','authorization_revoked'),updated_at=clock_timestamp()
 where r.organization_id=item.organization_id and r.status in ('queued','running')
  and exists(select 1 from private.access_decision_events a join public.processing_jobs j
   on j.organization_id=a.organization_id and j.id=a.processing_job_id
   where a.organization_id=item.organization_id and a.domain_event_id=item.event_id and j.processing_run_id=r.id)
  and not exists(select 1 from public.processing_jobs j where j.organization_id=r.organization_id and j.processing_run_id=r.id and j.status in ('queued','leased','awaiting_approval'));
 select exists(select 1 from public.processing_jobs j where j.organization_id=item.organization_id
  and j.status in ('queued','leased','awaiting_approval') and not private.job_authority_is_current_v1(j.id)) into remaining;
 update private.event_outbox set status=case when remaining then 'pending' else 'completed' end,
 completed_at=case when remaining then null else clock_timestamp() end,applied_count=applied_count+applied,
 attempts=case when remaining then 0 else attempts end,updated_at=clock_timestamp() where id=item.id;
 return jsonb_build_object('completed',not remaining,'replayed',false,'appliedCount',item.applied_count+applied);
end $$;
revoke all on function private.complete_event_outbox_v1(text,uuid,text) from public,anon;
grant execute on function private.complete_event_outbox_v1(text,uuid,text) to authenticated;
create function public.complete_event_outbox_v1(p_worker_token text,p_outbox_id uuid,p_capability text) returns jsonb language sql security invoker set search_path='' as $$ select private.complete_event_outbox_v1(p_worker_token,p_outbox_id,p_capability) $$;
revoke all on function public.complete_event_outbox_v1(text,uuid,text) from public,anon;
grant execute on function public.complete_event_outbox_v1(text,uuid,text) to authenticated;

-- Every future effect requiring propagation must call this inside its own transaction.
create function private.require_domain_event_propagation_v1(p_organization_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.event_outbox where organization_id=p_organization_id and status<>'completed') then
  raise exception 'authority_propagation_pending' using errcode='55000';
 end if;
end $$;
revoke all on function private.require_domain_event_propagation_v1(uuid) from public,anon,authenticated,service_role;

create trigger event_outbox_updated_at before update on private.event_outbox for each row execute function private.set_updated_at();
-- Domain and access-decision rows are themselves immutable material audit records; they do
-- not recursively capture_audit_event. Their updated_at remains their insertion timestamp.
create or replace function public.worker_runtime_schema_contract_v1()
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_set(c,'{capabilities}',(c->'capabilities')||'["explicit-resource-access.v1","explicit-workspace-context.v1","authenticated-document-storage.v1","review-bound-execution.v1","legacy-storage-rotation.v1","domain-event-outbox.v1"]'::jsonb)
 from (select private.worker_runtime_schema_contract_before_resource_access_v1() c) previous;
$$;

-- Existing external-publication commands must not outrun authority propagation.
do $$ declare signature text; body text; marker text; replacement text; begin
 foreach signature in array array['private.authorize_pack_distribution(uuid,uuid,uuid,text,text,jsonb)','private.authorize_qualified_introduction_plan(uuid,text)'] loop
  body:=pg_get_functiondef(signature::regprocedure);
  if signature like '%authorize_pack_distribution%' then
   marker:=E'  insert into public.pack_distribution_authorizations (';
   replacement:=E'  perform private.require_domain_event_propagation_v1(p_organization_id);\n  insert into public.pack_distribution_authorizations (';
  else
   marker:=E'  update public.qualified_introduction_plans';
   replacement:=E'  perform private.require_domain_event_propagation_v1(plan.organization_id);\n  update public.qualified_introduction_plans';
  end if;
  if strpos(body,marker)=0 then raise exception 'external_effect_contract_changed: %',signature; end if;
  execute replace(body,marker,replacement);
 end loop;
end $$;

-- Operator recovery after repairing a poisoned consumer. No client/worker RPC can use it.
create function private.retry_blocked_event_outbox_v1(p_organization_id uuid,p_outbox_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare item private.event_outbox;
begin
 select * into item from private.event_outbox where organization_id=p_organization_id and id=p_outbox_id for update;
 if not found then raise exception 'event_outbox_not_found' using errcode='P0002'; end if;
 if item.status='pending' then return false; end if;
 if item.status<>'blocked' then raise exception 'blocked_event_required' using errcode='55000'; end if;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
 values(item.organization_id,auth.uid(),'event_outbox.requeued','event_outbox',item.id::text,
  jsonb_build_object('domain_event_id',item.event_id,'reason','retry_after_consumer_repair','previous_attempts',item.attempts));
 update private.event_outbox set status='pending',attempts=0,lease_expires_at=null,capability_sha256=null,
  worker_token_id=null,leased_account_user_id=null,updated_at=clock_timestamp() where id=item.id;
 return true;
end $$;
revoke all on function private.retry_blocked_event_outbox_v1(uuid,uuid) from public,anon,authenticated,service_role;
create index processing_jobs_live_outbox_authority_idx on public.processing_jobs(organization_id,id)
 where status in ('queued','leased','awaiting_approval');
