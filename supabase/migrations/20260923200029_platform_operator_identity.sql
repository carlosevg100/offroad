-- Stage 17, correction 3O: human authority on the platform is bound to an identity in auth.users,
-- never to a text label alone. Founder and operators are registered principals; method profiles,
-- release pauses and content approvals are recorded with the acting principal and ledgered.
-- Nothing here grants execution, widens an API grant or touches the producer.
set search_path='';

-- 1. Platform principals. Only revocation may change a row; nothing is deleted.
create table private.platform_principals (
 user_id uuid primary key references auth.users(id),
 role text not null check(role in ('founder','operator')),
 label text not null check(length(btrim(label)) between 3 and 200),
 granted_by name not null default current_user,
 granted_at timestamptz not null default now(),
 revoked_at timestamptz,
 check(revoked_at is null or revoked_at>=granted_at)
);
alter table private.platform_principals enable row level security;
alter table private.platform_principals force row level security;
create policy platform_principals_deny on private.platform_principals as restrictive for all to public using(false) with check(false);
revoke all on private.platform_principals from public,anon,authenticated,service_role;
create function private.guard_platform_principal_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'platform_principal_immutable' using errcode='23514';end if;
 if new.user_id<>old.user_id or new.role<>old.role or new.label<>old.label or new.granted_by<>old.granted_by or new.granted_at<>old.granted_at
 or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)
 then raise exception 'platform_principal_immutable' using errcode='23514';end if;
 return new;
end $$;
revoke all on function private.guard_platform_principal_v1() from public,anon,authenticated,service_role;
create trigger platform_principals_guard before update or delete on private.platform_principals for each row execute function private.guard_platform_principal_v1();

-- The founder, where that account exists (production). Disposable databases seed their own.
insert into private.platform_principals(user_id,role,label)
select 'b60448ce-965a-4303-ae39-50447450c2aa','founder','Carlos Eduardo Vasques Galves, fundador da Offroad'
where exists(select 1 from auth.users where id='b60448ce-965a-4303-ae39-50447450c2aa') on conflict do nothing;

create function private.require_platform_principal_v1(p_user_id uuid,p_founder boolean default false) returns private.platform_principals
language plpgsql security invoker set search_path='' as $$
declare p private.platform_principals;begin
 perform private.require_platform_method_operator_v1();
 if p_user_id is null then raise exception 'platform_principal_required' using errcode='42501';end if;
 select * into p from private.platform_principals where user_id=p_user_id and revoked_at is null;
 if not found or (p_founder and p.role<>'founder') then raise exception 'platform_principal_required' using errcode='42501';end if;
 perform 1 from auth.users u where u.id=p_user_id and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp());
 if not found then raise exception 'platform_principal_required' using errcode='42501';end if;
 return p;
end $$;
revoke all on function private.require_platform_principal_v1(uuid,boolean) from public,anon,authenticated,service_role;
create function private.platform_founder_registered_v1() returns boolean language sql stable security definer set search_path='' as
$$select exists(select 1 from private.platform_principals where role='founder' and revoked_at is null)$$;
revoke all on function private.platform_founder_registered_v1() from public,anon,authenticated,service_role;
create function private.platform_actor_setting_v1(p_name text) returns text language sql stable set search_path='' as
$$select nullif(current_setting(p_name,true),'')$$;
revoke all on function private.platform_actor_setting_v1(text) from public,anon,authenticated,service_role;

-- 2. Method profiles: immutable and always ledgered; the command binds the acting principal.
create table private.execution_profile_registrations (
 sequence bigint generated always as identity primary key,
 profile_id uuid not null unique references private.execution_method_profiles(id),
 platform_release_id text not null,
 payload_fingerprint text not null check(payload_fingerprint ~ '^[a-f0-9]{64}$'),
 review_evidence_hash text not null check(review_evidence_hash ~ '^[a-f0-9]{64}$'),
 actor_user_id uuid references auth.users(id),
 command_id uuid unique,
 reason text check(reason is null or length(btrim(reason)) between 10 and 2000),
 recorded_by name not null default current_user,
 session_user_name name not null default session_user,
 application_name text not null default coalesce(current_setting('application_name',true),''),
 created_at timestamptz not null default now()
);
alter table private.execution_profile_registrations enable row level security;
alter table private.execution_profile_registrations force row level security;
create policy execution_profile_registrations_deny on private.execution_profile_registrations as restrictive for all to public using(false) with check(false);
revoke all on private.execution_profile_registrations from public,anon,authenticated,service_role;
revoke all on sequence private.execution_profile_registrations_sequence_seq from public,anon,authenticated,service_role;
create trigger execution_profile_registrations_immutable before update or delete on private.execution_profile_registrations for each row execute function private.guard_contribution_immutable_v1();
create function private.ledger_execution_profile_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.execution_profile_registrations(profile_id,platform_release_id,payload_fingerprint,review_evidence_hash,actor_user_id,command_id,reason)
 values(new.id,new.platform_release_id,new.payload_fingerprint,encode(extensions.digest(convert_to(new.review_evidence::text,'UTF8'),'sha256'),'hex'),
  private.platform_actor_setting_v1('offroad.actor_user_id')::uuid,private.platform_actor_setting_v1('offroad.command_id')::uuid,private.platform_actor_setting_v1('offroad.command_reason'));
 return new;
end $$;
revoke all on function private.ledger_execution_profile_v1() from public,anon,authenticated,service_role;
create trigger execution_method_profiles_ledger after insert on private.execution_method_profiles for each row execute function private.ledger_execution_profile_v1();

create function private.register_execution_method_profile_v1(p_command uuid,p_profile uuid,p_release text,p_canonical_payload text,p_adapter_source_commit text,p_review_evidence jsonb,p_actor_user_id uuid,p_reason text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare reg private.execution_profile_registrations;fp text;begin
 perform private.require_platform_principal_v1(p_actor_user_id);
 if p_command is null or p_profile is null or p_release is null or p_canonical_payload is null or p_adapter_source_commit is null
 or p_reason is null or length(btrim(p_reason)) not between 10 and 2000
 or p_review_evidence is null or jsonb_typeof(p_review_evidence)<>'object' or p_review_evidence->>'result' is distinct from 'approved'
 or coalesce(length(btrim(p_review_evidence->>'reviewer')),0) not between 3 and 200
 or p_review_evidence->>'sourcePath' is null or p_review_evidence->>'sourcePath' !~ '^packages/credit-playbook/knowledge/reviews/' or p_review_evidence->>'sourcePath' like '%..%'
 or p_review_evidence->>'sourceHash' is null or p_review_evidence->>'sourceHash' !~ '^[a-f0-9]{64}$'
 then raise exception 'execution_profile_registration_invalid' using errcode='22023';end if;
 fp:=encode(extensions.digest(convert_to(p_canonical_payload,'UTF8'),'sha256'),'hex');
 select * into reg from private.execution_profile_registrations where command_id=p_command;
 if found then
  if reg.profile_id<>p_profile or reg.payload_fingerprint<>fp or reg.platform_release_id<>p_release or reg.actor_user_id is distinct from p_actor_user_id then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return p_profile;
 end if;
 if exists(select 1 from private.execution_method_profiles where id=p_profile) then raise exception 'execution_profile_registration_invalid' using errcode='22023';end if;
 perform set_config('offroad.actor_user_id',p_actor_user_id::text,true);
 perform set_config('offroad.command_id',p_command::text,true);
 perform set_config('offroad.command_reason',btrim(p_reason),true);
 insert into private.execution_method_profiles(id,platform_release_id,serialization_version,canonical_payload,payload_fingerprint,adapter_source_commit,review_evidence)
 values(p_profile,p_release,'offroad-execution-json-utf16-v1',p_canonical_payload,fp,p_adapter_source_commit,p_review_evidence);
 perform set_config('offroad.actor_user_id','',true);perform set_config('offroad.command_id','',true);perform set_config('offroad.command_reason','',true);
 return p_profile;
end $$;
revoke all on function private.register_execution_method_profile_v1(uuid,uuid,text,text,text,jsonb,uuid,text) from public,anon,authenticated,service_role;

-- 3. Release pauses: identity-bound command and ledger. Direct writes stay possible for the
-- operator and are ledgered without an identity; the command is the governed path.
alter table private.receivables_analytical_release_grants add column granted_by_user_id uuid references auth.users(id);
create table private.receivables_release_pause_events (
 sequence bigint generated always as identity primary key,
 organization_id uuid not null,
 operation text not null check(operation in ('INSERT','UPDATE','DELETE')),
 enabled boolean,
 note text,
 granted_by text,
 granted_by_user_id uuid references auth.users(id),
 command_id uuid,
 recorded_by name not null default current_user,
 session_user_name name not null default session_user,
 application_name text not null default coalesce(current_setting('application_name',true),''),
 created_at timestamptz not null default now()
);
alter table private.receivables_release_pause_events enable row level security;
alter table private.receivables_release_pause_events force row level security;
create policy receivables_release_pause_events_deny on private.receivables_release_pause_events as restrictive for all to public using(false) with check(false);
revoke all on private.receivables_release_pause_events from public,anon,authenticated,service_role;
revoke all on sequence private.receivables_release_pause_events_sequence_seq from public,anon,authenticated,service_role;
create trigger receivables_release_pause_events_immutable before update or delete on private.receivables_release_pause_events for each row execute function private.guard_contribution_immutable_v1();
create function private.ledger_receivables_release_pause_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare r private.receivables_analytical_release_grants;begin
 if tg_op='DELETE' then r:=old;else r:=new;end if;
 insert into private.receivables_release_pause_events(organization_id,operation,enabled,note,granted_by,granted_by_user_id,command_id)
 values(r.organization_id,tg_op,r.enabled,r.note,r.granted_by,coalesce(r.granted_by_user_id,private.platform_actor_setting_v1('offroad.actor_user_id')::uuid),private.platform_actor_setting_v1('offroad.command_id')::uuid);
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function private.ledger_receivables_release_pause_v1() from public,anon,authenticated,service_role;
create trigger receivables_release_pause_ledger after insert or update or delete on private.receivables_analytical_release_grants for each row execute function private.ledger_receivables_release_pause_v1();

create function private.pause_receivables_release_v1(p_command uuid,p_organization uuid,p_enabled boolean,p_note text,p_actor_user_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare p private.platform_principals;prior private.receivables_release_pause_events;begin
 p:=private.require_platform_principal_v1(p_actor_user_id);
 if p_command is null or p_organization is null or p_enabled is null or (p_note is not null and char_length(p_note)>500) then raise exception 'receivables_release_pause_invalid' using errcode='22023';end if;
 perform 1 from public.organizations where id=p_organization;
 if not found then raise exception 'receivables_release_pause_invalid' using errcode='22023';end if;
 select * into prior from private.receivables_release_pause_events where command_id=p_command;
 if found then
  if prior.organization_id<>p_organization or prior.enabled is distinct from p_enabled or prior.granted_by_user_id is distinct from p_actor_user_id then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return;
 end if;
 perform set_config('offroad.actor_user_id',p_actor_user_id::text,true);
 perform set_config('offroad.command_id',p_command::text,true);
 insert into private.receivables_analytical_release_grants(organization_id,enabled,note,granted_by,granted_by_user_id)
 values(p_organization,p_enabled,p_note,p.label,p_actor_user_id)
 on conflict(organization_id) do update set enabled=excluded.enabled,note=excluded.note,granted_by=excluded.granted_by,granted_by_user_id=excluded.granted_by_user_id,updated_at=now();
 perform set_config('offroad.actor_user_id','',true);perform set_config('offroad.command_id','',true);
end $$;
revoke all on function private.pause_receivables_release_v1(uuid,uuid,boolean,text,uuid) from public,anon,authenticated,service_role;

-- 4. Content approvals carry the founder's identity once a founder is registered.
alter table private.platform_method_attestations add column actor_user_id uuid references auth.users(id);
create function private.bind_platform_attestation_actor_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.actor_user_id:=coalesce(new.actor_user_id,private.platform_actor_setting_v1('offroad.actor_user_id')::uuid);
 return new;
end $$;
revoke all on function private.bind_platform_attestation_actor_v1() from public,anon,authenticated,service_role;
create trigger platform_method_attestations_actor before insert on private.platform_method_attestations for each row execute function private.bind_platform_attestation_actor_v1();

create function private.attest_platform_method_candidate_v2(p_id uuid,p_candidate uuid,p_fingerprint text,p_kind text,p_actor_user_id uuid,p_evidence jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare p private.platform_principals;result uuid;begin
 p:=private.require_platform_principal_v1(p_actor_user_id,p_kind='content_approval');
 perform set_config('offroad.actor_user_id',p_actor_user_id::text,true);
 result:=private.attest_platform_method_candidate_v1(p_id,p_candidate,p_fingerprint,p_kind,p.label,p_evidence);
 perform set_config('offroad.actor_user_id','',true);
 if not exists(select 1 from private.platform_method_attestations where id=result and actor_user_id=p_actor_user_id) then raise exception 'platform_method_request_reused' using errcode='22023';end if;
 return result;
end $$;
revoke all on function private.attest_platform_method_candidate_v2(uuid,uuid,text,text,uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function private.publish_platform_method_v1(p_command uuid,p_candidate uuid,p_fingerprint text,p_reason text) returns text
language plpgsql security invoker set search_path='' as $$
declare c private.platform_method_candidates; a private.platform_method_attestations;cap text; fp text; prior private.platform_method_publication_events;begin
 perform private.require_platform_method_operator_v1();
 select * into c from private.platform_method_candidates where id=p_candidate for update;
 if c.id is null or p_fingerprint is distinct from c.fingerprint then raise exception 'platform_method_publication_stale' using errcode='40001';end if;
 if p_command is null or p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then raise exception 'platform_method_publication_invalid' using errcode='22023';end if;
 fp:=encode(extensions.digest(jsonb_build_object('candidate',p_candidate,'fingerprint',p_fingerprint,'reason',btrim(p_reason),'action','published')::text,'sha256'),'hex');
 select * into prior from private.platform_method_publication_events where command_id=p_command;
 if found then if prior.request_fingerprint is distinct from fp then raise exception 'platform_method_request_reused' using errcode='22023';end if;return c.release_id;end if;
 if exists(select 1 from private.platform_method_publication_events where candidate_id=c.id) then raise exception 'platform_method_already_decided' using errcode='22023';end if;
 if (select count(*) from private.platform_method_attestations where candidate_id=c.id and candidate_fingerprint=c.fingerprint)<>2 then raise exception 'platform_method_reviews_required' using errcode='42501';end if;
 select * into strict a from private.platform_method_attestations where candidate_id=c.id and kind='content_approval';
 -- Once a founder is registered, a content approval without the founder's identity does not publish.
 if private.platform_founder_registered_v1() and not exists(select 1 from private.platform_principals p where p.user_id=a.actor_user_id and p.role='founder' and p.revoked_at is null)
 then raise exception 'platform_founder_identity_required' using errcode='42501';end if;
 cap:='method.'||c.method_id||'.'||c.version;
 -- Catalogue publication does not release an executor. A later execution gate owns activation.
 insert into private.platform_capability_releases(capability_key,released,exposure,method_id,method_version,method_maturity,approved_by,approved_at,approval_source,note)
 values(cap,false,'internal',c.method_id,c.version,'tested',a.actor,(a.evidence->>'occurredAt')::timestamptz::date,a.evidence->>'sourcePath','Published corpus only; execution remains disabled.');
 insert into private.platform_method_releases(id,method_id,version,manifest_hash,manifest,components,evidence,approval,capability_key)
 values(c.release_id,c.method_id,c.version,c.bundle->'manifest'->>'manifestHash',c.bundle->'manifest',c.bundle->'components',c.bundle->'evidence',
 jsonb_build_object('approvedBy',a.actor,'approvedByUserId',a.actor_user_id,'approvedAt',a.evidence->>'occurredAt','approvalSource',a.evidence->>'sourcePath','sourceHash',a.evidence->>'sourceHash','sourceCommit',c.bundle->>'sourceCommit','candidateFingerprint',c.fingerprint,'executionEnabled',false),cap);
 insert into private.platform_method_publication_events(command_id,candidate_id,action,request_fingerprint,reason) values(p_command,c.id,'published',fp,btrim(p_reason));
 return c.release_id;
end $$;
revoke all on function private.publish_platform_method_v1(uuid,uuid,text,text) from public,anon,authenticated,service_role;
