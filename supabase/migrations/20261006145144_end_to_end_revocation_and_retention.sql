-- Stage22/1: lifecycle contracts. No retention deadline is silently assigned to customer data.
set search_path = '';
set local lock_timeout = '5s';

create table private.retention_rules (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 resource_id uuid not null, revision bigint not null check(revision>0),
 mode text not null check(mode in ('retain','expire')), expires_at timestamptz,
 basis_reference uuid not null, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,resource_id,revision),
 foreign key(organization_id,resource_id) references private.access_resources(organization_id,id),
 check((mode='expire')=(expires_at is not null))
);
create index retention_rules_actor_idx on private.retention_rules(created_by);
create table private.legal_holds (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 resource_id uuid not null, basis_reference uuid not null, created_by uuid not null references auth.users(id),
 released_at timestamptz, released_by uuid references auth.users(id), release_basis_reference uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,resource_id) references private.access_resources(organization_id,id),
 check((released_at is null and released_by is null and release_basis_reference is null)
 or (released_at is not null and released_by is not null and release_basis_reference is not null))
);
create index legal_holds_resource_idx on private.legal_holds(organization_id,resource_id) where released_at is null;
create index legal_holds_creator_idx on private.legal_holds(created_by);
create index legal_holds_releaser_idx on private.legal_holds(released_by);
create table private.revocation_runs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 domain_event_id uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,domain_event_id),
 foreign key(organization_id,domain_event_id) references private.domain_events(organization_id,id)
);
create table private.revocation_targets (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), run_id uuid not null,
 destination text not null check(destination in ('authority_outbox','search','cache','jobs','artifacts','storage')),
 state text not null default 'pending' check(state in ('pending','completed','blocked')),
 deadline_at timestamptz not null, completed_at timestamptz, receipt_fingerprint text check(receipt_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,run_id,destination),
 foreign key(organization_id,run_id) references private.revocation_runs(organization_id,id),
 check((state='completed')=(completed_at is not null and receipt_fingerprint is not null))
);
create index revocation_targets_pending_idx on private.revocation_targets(deadline_at) where state<>'completed';
create table private.retention_actions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 resource_id uuid not null, rule_id uuid not null, destination text not null,
 state text not null default 'pending' check(state in ('pending','leased','held','completed','blocked')),
 attempts integer not null default 0 check(attempts between 0 and 5), lease_expires_at timestamptz,
 worker_token_id uuid references private.worker_tokens(id), leased_account_id uuid references auth.users(id), capability_sha256 bytea,
 bucket_id text, object_path text, storage_object_id uuid, completed_at timestamptz,
 receipt_fingerprint text check(receipt_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 unique nulls not distinct(organization_id,rule_id,destination,bucket_id,object_path),
 foreign key(organization_id,resource_id) references private.access_resources(organization_id,id),
 foreign key(organization_id,rule_id) references private.retention_rules(organization_id,id),
 check((bucket_id is null)=(object_path is null)),
 check((state='completed')=(completed_at is not null and receipt_fingerprint is not null))
);
create index retention_actions_ready_idx on private.retention_actions(created_at,id) where state in ('pending','leased','held');
create index retention_actions_resource_idx on private.retention_actions(organization_id,resource_id);
create index retention_actions_worker_idx on private.retention_actions(worker_token_id);
create index retention_actions_account_idx on private.retention_actions(leased_account_id);

-- An immutable object identity survives Storage API DELETE. The receipt still has an FK,
-- now to this exact identity ledger; no receipt is rewritten and no Storage metadata is deleted here.
create table private.artifact_export_object_identities (
 id uuid primary key, organization_id uuid not null references public.organizations(id),
 bucket_id text not null check(bucket_id='case-artifacts'), object_path text not null,
 content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'), byte_length bigint not null check(byte_length>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,bucket_id,object_path)
);
insert into private.artifact_export_object_identities(id,organization_id,bucket_id,object_path,content_sha256,byte_length)
 select storage_object_id,organization_id,bucket_id,object_path,content_sha256,byte_length from public.artifact_export_receipts;
alter table public.artifact_export_receipts drop constraint artifact_export_receipts_storage_object_id_fkey;
alter table public.artifact_export_receipts add constraint artifact_export_receipts_object_identity_fk
 foreign key(organization_id,storage_object_id) references private.artifact_export_object_identities(organization_id,id);
create function private.capture_export_object_identity_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from storage.objects o where o.id=new.storage_object_id and o.bucket_id=new.bucket_id and o.name=new.object_path)
 then raise exception 'export_object_identity_missing' using errcode='42501';end if;
 insert into private.artifact_export_object_identities(id,organization_id,bucket_id,object_path,content_sha256,byte_length)
 values(new.storage_object_id,new.organization_id,new.bucket_id,new.object_path,new.content_sha256,new.byte_length) on conflict do nothing;
 if not exists(select 1 from private.artifact_export_object_identities i where i.id=new.storage_object_id and i.organization_id=new.organization_id
 and i.bucket_id=new.bucket_id and i.object_path=new.object_path and i.content_sha256=new.content_sha256 and i.byte_length=new.byte_length)
 then raise exception 'export_object_identity_conflict' using errcode='42501';end if;
 return new;
end;$$;
create trigger artifact_export_object_identity before insert on public.artifact_export_receipts for each row execute function private.capture_export_object_identity_v1();

-- No membership projection of audit or lifecycle tables; all clients use bounded commands.
do $$declare t text;begin
 foreach t in array array['retention_rules','legal_holds','revocation_runs','revocation_targets','retention_actions','artifact_export_object_identities'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 execute format('create policy %I on private.%I for all to authenticated using(false) with check(false)',t||'_deny',t);
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated',t);
 execute format('create trigger %I after insert or update or delete on private.%I for each row execute function private.capture_identity_audit_v1()',t||'_audit',t);
 end loop;
 foreach t in array array['retention_rules','revocation_runs','artifact_export_object_identities'] loop
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.deny_domain_audit_mutation_v1()',t||'_immutable',t);
 execute format('create trigger %I before truncate on private.%I for each statement execute function private.deny_domain_audit_mutation_v1()',t||'_no_truncate',t);
 end loop;
end;$$;

create function private.record_revocation_run_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare run uuid;
begin
 insert into private.revocation_runs(organization_id,domain_event_id) values(new.organization_id,new.id) returning id into run;
 -- Every controlled destination starts pending; only an actual consumer receipt closes it.
 insert into private.revocation_targets(organization_id,run_id,destination,deadline_at)
 select new.organization_id,run,destination,clock_timestamp()+interval '5 minutes' from unnest(array['authority_outbox','search','cache','jobs','artifacts','storage']) destination;
 return new;
end;$$;
create trigger domain_event_revocation_run after insert on private.domain_events for each row execute function private.record_revocation_run_v1();
create function private.record_revocation_outbox_receipt_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update private.revocation_targets t set state=case when new.status='completed' then 'completed' else 'blocked' end,
 completed_at=case when new.status='completed' then new.completed_at end,
 receipt_fingerprint=case when new.status='completed' then encode(extensions.digest(jsonb_build_object('outboxId',new.id,'eventId',new.event_id,'appliedCount',new.applied_count,'completedAt',new.completed_at)::text,'sha256'),'hex') end
 from private.revocation_runs r where r.organization_id=new.organization_id and r.domain_event_id=new.event_id
 and t.organization_id=r.organization_id and t.run_id=r.id and t.destination='authority_outbox';
 return new;
end;$$;
create trigger event_outbox_revocation_receipt after update of status on private.event_outbox for each row when(new.status in ('completed','blocked')) execute function private.record_revocation_outbox_receipt_v1();

create function private.set_retention_rule_v1(p_resource_id uuid,p_mode text,p_expires_at timestamptz,p_basis_reference uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=private.policy_admin_context_v1(); r private.retention_rules;
begin
 if p_basis_reference is null or p_mode is null or p_mode not in ('retain','expire') or (p_mode='expire') is distinct from (p_expires_at is not null)
 or (p_expires_at is not null and p_expires_at<=clock_timestamp()) or not exists(select 1 from private.access_resources where organization_id=org and id=p_resource_id)
 then raise exception 'retention_rule_invalid' using errcode='22023';end if;
 insert into private.retention_rules(organization_id,resource_id,revision,mode,expires_at,basis_reference,created_by)
 values(org,p_resource_id,(select coalesce(max(revision),0)+1 from private.retention_rules where organization_id=org and resource_id=p_resource_id),p_mode,p_expires_at,p_basis_reference,auth.uid()) returning * into r;
 return jsonb_build_object('ruleId',r.id,'revision',r.revision,'mode',r.mode,'expiresAt',r.expires_at);
end;$$;
create function private.place_legal_hold_v1(p_resource_id uuid,p_basis_reference uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=private.policy_admin_context_v1(); hold uuid;
begin
 if p_basis_reference is null or not exists(select 1 from private.access_resources where organization_id=org and id=p_resource_id)
 then raise exception 'legal_hold_invalid' using errcode='22023';end if;
 insert into private.legal_holds(organization_id,resource_id,basis_reference,created_by) values(org,p_resource_id,p_basis_reference,auth.uid()) returning id into hold;
 return hold;
end;$$;
create function private.release_legal_hold_v1(p_hold_id uuid,p_basis_reference uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare org uuid:=private.policy_admin_context_v1();hold private.legal_holds;
begin
 select * into hold from private.legal_holds where organization_id=org and id=p_hold_id for update;
 if hold.id is null or p_basis_reference is null then raise exception 'legal_hold_denied' using errcode='42501';end if;
 if hold.released_at is not null then return false;end if;
 update private.legal_holds set released_at=clock_timestamp(),released_by=auth.uid(),release_basis_reference=p_basis_reference where id=hold.id;
 return true;
end;$$;
create function private.read_revocation_status_v1(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=private.policy_admin_context_v1();run private.revocation_runs;targets jsonb;
begin
 select * into run from private.revocation_runs where organization_id=org and id=p_run_id;
 if run.id is null then raise exception 'revocation_status_denied' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('destination',destination,'state',state,'deadlineAt',deadline_at,'completedAt',completed_at,'receiptFingerprint',receipt_fingerprint) order by destination),'[]') into targets from private.revocation_targets where organization_id=org and run_id=run.id;
 return jsonb_build_object('runId',run.id,'eventId',run.domain_event_id,'targets',targets,'completed',not exists(select 1 from private.revocation_targets where organization_id=org and run_id=run.id and state<>'completed'));
end;$$;
-- Metadata allowlist, bounded pagination. Raw legacy financial metadata never leaves this command.
create function private.export_authorized_audit_v1(p_after_id bigint default 0,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=private.policy_admin_context_v1(); rows jsonb;
begin
 if p_after_id is null or p_after_id<0 or p_limit is null or p_limit not between 1 and 500 then raise exception 'audit_export_invalid' using errcode='22023';end if;
 select coalesce(jsonb_agg(payload order by id),'[]') into rows from(select id,jsonb_build_object('id',id,'actorId',actor_user_id,'action',action,'resourceType',resource_type,'resourceId',resource_id,'occurredAt',occurred_at) payload from public.audit_events where organization_id=org and id>p_after_id order by id limit p_limit) q;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,metadata)values(org,auth.uid(),'audit.export','audit_batch',jsonb_build_object('afterId',p_after_id,'rowCount',jsonb_array_length(rows)));
 return jsonb_build_object('schemaVersion','authorized-audit.v1','organizationId',org,'events',rows,'fingerprint',encode(extensions.digest(rows::text,'sha256'),'hex'));
end;$$;

create function public.set_retention_rule_v1(p_resource_id uuid,p_mode text,p_expires_at timestamptz,p_basis_reference uuid) returns jsonb language sql security invoker set search_path='' as $$select private.set_retention_rule_v1(p_resource_id,p_mode,p_expires_at,p_basis_reference);$$;
create function public.place_legal_hold_v1(p_resource_id uuid,p_basis_reference uuid) returns uuid language sql security invoker set search_path='' as $$select private.place_legal_hold_v1(p_resource_id,p_basis_reference);$$;
create function public.release_legal_hold_v1(p_hold_id uuid,p_basis_reference uuid) returns boolean language sql security invoker set search_path='' as $$select private.release_legal_hold_v1(p_hold_id,p_basis_reference);$$;
create function public.read_revocation_status_v1(p_run_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.read_revocation_status_v1(p_run_id);$$;
create function public.export_authorized_audit_v1(p_after_id bigint default 0,p_limit integer default 100) returns jsonb language sql security invoker set search_path='' as $$select private.export_authorized_audit_v1(p_after_id,p_limit);$$;
do $$declare f record;begin
 for f in select p.oid,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.proname in ('capture_export_object_identity_v1','record_revocation_run_v1','record_revocation_outbox_receipt_v1','set_retention_rule_v1','place_legal_hold_v1','release_legal_hold_v1','read_revocation_status_v1','export_authorized_audit_v1') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.oid::regprocedure);
 if f.proname in ('set_retention_rule_v1','place_legal_hold_v1','release_legal_hold_v1','read_revocation_status_v1','export_authorized_audit_v1') then execute format('grant execute on function %s to authenticated',f.oid::regprocedure);end if;
 end loop;
end;$$;

create function private.retention_access_allowed_v1(p_org uuid,p_resource uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 with recursive scope(id,depth) as(select p_resource,0 union all select r.parent_resource_id,s.depth+1
 from scope s join private.access_resources r on r.organization_id=p_org and r.id=s.id where r.parent_resource_id is not null and s.depth<64),
 latest as(select distinct on(r.resource_id) r.* from private.retention_rules r join scope s on s.id=r.resource_id where r.organization_id=p_org order by r.resource_id,r.revision desc)
 select not exists(select 1 from latest where mode='expire' and expires_at<=clock_timestamp())
 and not exists(select 1 from private.retention_actions a join scope s on s.id=a.resource_id where a.organization_id=p_org);
$$;
-- A hold only stops destruction. It is never consulted by a read/execute/publication allow.
create function private.resource_legal_hold_v1(p_org uuid,p_resource uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 with recursive scope(id,depth) as(select p_resource,0 union all select r.parent_resource_id,s.depth+1
 from scope s join private.access_resources r on r.organization_id=p_org and r.id=s.id where r.parent_resource_id is not null and s.depth<64)
 select exists(select 1 from private.legal_holds h join scope s on s.id=h.resource_id where h.organization_id=p_org and h.released_at is null);
$$;
create function private.storage_has_legal_hold_v1(p_bucket text,p_path text) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from private.artifact_export_object_identities i join public.artifact_export_receipts e
 on e.organization_id=i.organization_id and e.storage_object_id=i.id where i.bucket_id=p_bucket and i.object_path=p_path
 and private.resource_legal_hold_v1(e.organization_id,e.work_id))
 or exists(select 1 from private.capital_public_payload_allocations a join public.processing_jobs j on j.organization_id=a.organization_id and j.id=a.job_id
 where a.bucket_id=p_bucket and a.object_path=p_path and private.resource_legal_hold_v1(j.organization_id,j.authorization_resource_id))
 or exists(select 1 from public.source_versions v join public.source_bindings b on b.organization_id=v.organization_id and b.source_version_id=v.id
 where v.bucket_id=p_bucket and v.object_path=p_path and private.resource_legal_hold_v1(b.organization_id,b.resource_id))
 or exists(select 1 from public.document_layers l join public.source_bindings b on b.organization_id=l.organization_id and b.source_version_id=l.source_document_id
 where l.bucket_id=p_bucket and l.object_path=p_path and private.resource_legal_hold_v1(b.organization_id,b.resource_id));
$$;
revoke all on function private.retention_access_allowed_v1(uuid,uuid),private.resource_legal_hold_v1(uuid,uuid),private.storage_has_legal_hold_v1(text,text) from public,anon,authenticated,service_role;
grant execute on function private.storage_has_legal_hold_v1(text,text) to authenticated;
create policy lifecycle_storage_legal_hold on storage.objects as restrictive for delete to authenticated using(not private.storage_has_legal_hold_v1(bucket_id,name));
create trigger audit_events_append_only before update or delete on public.audit_events for each row execute function private.deny_domain_audit_mutation_v1();
create trigger audit_events_no_truncate before truncate on public.audit_events for each statement execute function private.deny_domain_audit_mutation_v1();

-- Explicit full effective definition, retaining all existing barriers and publication restrictions.
CREATE OR REPLACE FUNCTION private.evaluate_resource_policy_v1(p_org uuid, p_resource uuid, p_subject uuid, p_action text, p_purpose text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare root uuid; principal uuid; groups uuid[]; allowed boolean;
begin
 if p_subject is null or p_action is null or p_action not in ('read','work','manage','publish') or p_purpose is null or p_purpose not in ('analysis','retrieval','publication','export') then return false; end if;
 select p.id into principal from private.principals p join auth.users u on u.id=p.user_id
 join public.organization_memberships m on m.organization_id=p.organization_id and m.user_id=p.user_id
 where p.organization_id=p_org and p.user_id=p_subject and p.kind='human' and p.revoked_at is null and m.status='active'
 and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp());
 if principal is null then return false; end if;
 if not private.retention_access_allowed_v1(p_org,p_resource) then return false;end if;
 if p_action='publish' and not exists(select 1 from private.access_resources where organization_id=p_org and id=p_resource and resource_kind in ('vault_scope','vault_entry')) then return false;end if;
 root:=private.resource_root_v1(p_org,p_resource); if root is null then return false; end if;
 -- Both the child and root can narrow purposes. Missing resources never grant authority.
 if exists(select 1 from private.access_resources where organization_id=p_org and id in (root,p_resource) and not(p_purpose=any(allowed_purposes))) then return false; end if;
 select coalesce(array_agg(id),'{}'::uuid[]) into groups from private.policy_group_ids_v1(p_org,principal) id;
 -- Role grants administer relationships through the separate administrative command only.
 -- They never satisfy content actions, including destructive legacy 'manage' paths.
 select coalesce(bool_or(g.effect='allow'),false) and not coalesce(bool_or(g.effect='deny'),false) into allowed
 from private.resource_access_grants g
 where g.organization_id=p_org and g.resource_id in (root,p_resource) and (g.subject_user_id=p_subject or g.subject_group_id=any(groups))
 and (g.action=p_action or (g.action='manage' and p_action<>'publish') or (p_action='read' and g.action='work'))
 and g.revoked_at is null and g.valid_from<=clock_timestamp() and (g.expires_at is null or g.expires_at>clock_timestamp());
 if not allowed then return false; end if;
 -- All barriers must pass; an explicit deny dominates every allow and every group.
 if exists(
  select 1 from private.information_barriers b where b.organization_id=p_org and b.resource_id in(root,p_resource) and b.enabled and (
   not exists(select 1 from private.barrier_memberships m where m.organization_id=p_org and m.barrier_id=b.id and m.effect='allow'
    and (m.principal_id=principal or m.group_id=any(groups)) and m.revoked_at is null and m.valid_from<=clock_timestamp() and (m.expires_at is null or m.expires_at>clock_timestamp()))
   or exists(select 1 from private.barrier_memberships m where m.organization_id=p_org and m.barrier_id=b.id and m.effect='deny'
    and (m.principal_id=principal or m.group_id=any(groups)) and m.revoked_at is null and m.valid_from<=clock_timestamp() and (m.expires_at is null or m.expires_at>clock_timestamp()))
  )) then return false; end if;
 return true;
end $function$
;
