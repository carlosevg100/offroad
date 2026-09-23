-- Stage 17, increment 4A, first part: the producer path gets its authority before any tenant can
-- request an execution. A producer grant per organization is written only by an identity-bound
-- operator command and ledgered; the platform capability release row, until now edited by loose
-- SQL, gets a ledger of every write and an identity-bound command. Enabling a producer for an
-- organization the founder does not belong to is the founder's act. Nothing here requests, claims
-- or executes anything.
set search_path='';

-- 1. Producer grants: one row per organization, enabled or not, never deleted, always ledgered.
create table private.execution_producer_grants (
 organization_id uuid primary key references public.organizations(id),
 enabled boolean not null,
 note text check(note is null or char_length(note)<=500),
 granted_by text not null check(char_length(btrim(granted_by)) between 3 and 200),
 granted_by_user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table private.execution_producer_grants enable row level security;
alter table private.execution_producer_grants force row level security;
create policy execution_producer_grants_deny on private.execution_producer_grants as restrictive for all to public using(false) with check(false);
revoke all on private.execution_producer_grants from public,anon,authenticated,service_role;
create trigger execution_producer_grants_updated_at before update on private.execution_producer_grants for each row execute function private.set_updated_at();

create function private.guard_execution_producer_grant_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin raise exception 'platform_ledger_immutable' using errcode='23514';end $$;
revoke all on function private.guard_execution_producer_grant_v1() from public,anon,authenticated,service_role;
create trigger execution_producer_grants_delete_guard before delete on private.execution_producer_grants for each row execute function private.guard_execution_producer_grant_v1();
create trigger execution_producer_grants_truncate_guard before truncate on private.execution_producer_grants for each statement execute function private.guard_platform_ledger_truncate_v1();

create table private.execution_producer_grant_events (
 sequence bigint generated always as identity primary key,
 organization_id uuid not null,
 operation text not null check(operation in ('INSERT','UPDATE')),
 enabled boolean not null,
 note text,
 granted_by text not null,
 granted_by_user_id uuid references auth.users(id),
 command_id uuid,
 recorded_by name not null default current_user,
 session_user_name name not null default session_user,
 application_name text not null default coalesce(current_setting('application_name',true),''),
 created_at timestamptz not null default now()
);
alter table private.execution_producer_grant_events enable row level security;
alter table private.execution_producer_grant_events force row level security;
create policy execution_producer_grant_events_deny on private.execution_producer_grant_events as restrictive for all to public using(false) with check(false);
revoke all on private.execution_producer_grant_events from public,anon,authenticated,service_role;
revoke all on sequence private.execution_producer_grant_events_sequence_seq from public,anon,authenticated,service_role;
create trigger execution_producer_grant_events_immutable before update or delete on private.execution_producer_grant_events for each row execute function private.guard_contribution_immutable_v1();
create trigger execution_producer_grant_events_truncate_guard before truncate on private.execution_producer_grant_events for each statement execute function private.guard_platform_ledger_truncate_v1();

-- The ledger takes the identity from the validated command alone, never from the row it touches.
create function private.ledger_execution_producer_grant_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.execution_producer_grant_events(organization_id,operation,enabled,note,granted_by,granted_by_user_id,command_id)
 values(new.organization_id,tg_op,new.enabled,new.note,new.granted_by,private.platform_actor_identity_v1(),private.platform_actor_setting_v1('offroad.command_id')::uuid);
 return new;
end $$;
revoke all on function private.ledger_execution_producer_grant_v1() from public,anon,authenticated,service_role;
create trigger execution_producer_grants_ledger after insert or update on private.execution_producer_grants for each row execute function private.ledger_execution_producer_grant_v1();

create function private.execution_producer_enabled_v1(p_organization uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.execution_producer_grants g where g.organization_id=p_organization and g.enabled);
$$;
revoke all on function private.execution_producer_enabled_v1(uuid) from public,anon,authenticated,service_role;

create function private.grant_execution_producer_v1(p_command uuid,p_organization uuid,p_enabled boolean,p_note text,p_actor_user_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare p private.platform_principals;prior private.execution_producer_grant_events;begin
 if p_command is null or p_organization is null or p_enabled is null or (p_note is not null and char_length(p_note)>500) then raise exception 'execution_producer_grant_invalid' using errcode='22023';end if;
 perform 1 from public.organizations where id=p_organization;
 if not found then raise exception 'execution_producer_grant_invalid' using errcode='22023';end if;
 -- Enabling a producer for an organization the founder does not belong to is releasing execution
 -- to a real client: the founder's act. The founder's own workspace and every pause are operator acts.
 p:=private.require_platform_principal_v1(p_actor_user_id,p_enabled and not exists(
  select 1 from public.organization_memberships m join private.platform_principals f on f.user_id=m.user_id and f.role='founder' and f.revoked_at is null
  where m.organization_id=p_organization and m.status='active'));
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.execution_producer_grant_events where command_id=p_command order by sequence desc limit 1;
 if found then
  if prior.organization_id<>p_organization or prior.enabled is distinct from p_enabled or prior.granted_by_user_id is distinct from p_actor_user_id or prior.note is distinct from p_note
  then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return;
 end if;
 perform set_config('offroad.actor_user_id',p_actor_user_id::text,true);
 perform set_config('offroad.command_id',p_command::text,true);
 insert into private.execution_producer_grants(organization_id,enabled,note,granted_by,granted_by_user_id)
 values(p_organization,p_enabled,p_note,left(p.label,120),p_actor_user_id)
 on conflict(organization_id) do update set enabled=excluded.enabled,note=excluded.note,granted_by=excluded.granted_by,granted_by_user_id=excluded.granted_by_user_id;
 perform set_config('offroad.actor_user_id','',true);perform set_config('offroad.command_id','',true);
end $$;
revoke all on function private.grant_execution_producer_v1(uuid,uuid,boolean,text,uuid) from public,anon,authenticated,service_role;

-- 2. Capability releases: every write is ledgered; activation goes through an identity-bound command.
create table private.platform_capability_release_events (
 sequence bigint generated always as identity primary key,
 capability_key text not null,
 operation text not null check(operation in ('INSERT','UPDATE','DELETE')),
 released boolean not null,
 exposure text not null,
 method_id text not null,
 method_version text not null,
 actor_user_id uuid references auth.users(id),
 command_id uuid,
 reason text,
 recorded_by name not null default current_user,
 session_user_name name not null default session_user,
 application_name text not null default coalesce(current_setting('application_name',true),''),
 created_at timestamptz not null default now()
);
alter table private.platform_capability_release_events enable row level security;
alter table private.platform_capability_release_events force row level security;
create policy platform_capability_release_events_deny on private.platform_capability_release_events as restrictive for all to public using(false) with check(false);
revoke all on private.platform_capability_release_events from public,anon,authenticated,service_role;
revoke all on sequence private.platform_capability_release_events_sequence_seq from public,anon,authenticated,service_role;
create trigger platform_capability_release_events_immutable before update or delete on private.platform_capability_release_events for each row execute function private.guard_contribution_immutable_v1();
create trigger platform_capability_release_events_truncate_guard before truncate on private.platform_capability_release_events for each statement execute function private.guard_platform_ledger_truncate_v1();

create function private.ledger_platform_capability_release_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare r private.platform_capability_releases;begin
 if tg_op='DELETE' then r:=old;else r:=new;end if;
 insert into private.platform_capability_release_events(capability_key,operation,released,exposure,method_id,method_version,actor_user_id,command_id,reason)
 values(r.capability_key,tg_op,r.released,r.exposure,r.method_id,r.method_version,private.platform_actor_identity_v1(),private.platform_actor_setting_v1('offroad.command_id')::uuid,private.platform_actor_setting_v1('offroad.command_reason'));
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function private.ledger_platform_capability_release_v1() from public,anon,authenticated,service_role;
create trigger platform_capability_releases_ledger after insert or update or delete on private.platform_capability_releases for each row execute function private.ledger_platform_capability_release_v1();
create trigger platform_capability_releases_truncate_guard before truncate on private.platform_capability_releases for each statement execute function private.guard_platform_ledger_truncate_v1();

-- Releasing a capability is an operator act: the corpus behind it already carries the founder's
-- content approval, and reaching a real client is contained by the producer grant above. The R01
-- key keeps its own serialized command from correction 3K.
create function private.release_platform_capability_v1(p_command uuid,p_capability_key text,p_released boolean,p_exposure text,p_actor_user_id uuid,p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
declare c private.platform_capability_releases;prior private.platform_capability_release_events;begin
 perform private.require_platform_principal_v1(p_actor_user_id);
 if p_command is null or p_capability_key is null or p_released is null or p_exposure not in ('universal','allowlisted','internal','none')
 or p_reason is null or length(btrim(p_reason)) not between 10 and 2000 or p_capability_key='finance.receivables-released-analysis'
 then raise exception 'platform_capability_release_invalid' using errcode='22023';end if;
 select * into c from private.platform_capability_releases where capability_key=p_capability_key for update;
 if not found then raise exception 'platform_capability_release_invalid' using errcode='22023';end if;
 -- A published corpus is the only thing that can be released: the release row must exist for the
 -- same method and version and, when it went through candidates, its last decision must be publication.
 if p_released and not exists(select 1 from private.platform_method_releases b where b.capability_key=c.capability_key and b.method_id=c.method_id and b.version=c.method_version
  and (not exists(select 1 from private.platform_method_candidates x where x.release_id=b.id)
   or (select e.action='published' from private.platform_method_candidates x join private.platform_method_publication_events e on e.candidate_id=x.id where x.release_id=b.id order by e.sequence desc limit 1)))
 then raise exception 'platform_method_reviews_required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.platform_capability_release_events where command_id=p_command order by sequence desc limit 1;
 if found then
  if prior.capability_key<>p_capability_key or prior.released is distinct from p_released or prior.exposure is distinct from p_exposure or prior.actor_user_id is distinct from p_actor_user_id or prior.reason is distinct from btrim(p_reason)
  then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return;
 end if;
 perform set_config('offroad.actor_user_id',p_actor_user_id::text,true);
 perform set_config('offroad.command_id',p_command::text,true);
 perform set_config('offroad.command_reason',btrim(p_reason),true);
 update private.platform_capability_releases set released=p_released,exposure=p_exposure,updated_at=now() where capability_key=p_capability_key;
 perform set_config('offroad.actor_user_id','',true);perform set_config('offroad.command_id','',true);perform set_config('offroad.command_reason','',true);
end $$;
revoke all on function private.release_platform_capability_v1(uuid,text,boolean,text,uuid,text) from public,anon,authenticated,service_role;
