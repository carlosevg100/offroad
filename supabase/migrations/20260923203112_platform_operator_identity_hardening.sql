-- Stage 17, correction 3O, second part, after the independent review: a declared identity is
-- verified against an active principal and its label; direct writes never inherit the last
-- principal in a ledger; revocations carry who and why; same-command races serialize; the
-- founder's user id leaves the tenant-visible approval JSON; truncation is barred.
set search_path='';

-- 1. Principals: revocation records who and why; nothing else changes after creation.
alter table private.platform_principals add column revoked_by name;
alter table private.platform_principals add column revoked_reason text check(revoked_reason is null or length(btrim(revoked_reason)) between 3 and 500);
alter table private.platform_principals add constraint platform_principals_revocation_check
 check((revoked_at is null and revoked_by is null and revoked_reason is null) or (revoked_at is not null and revoked_by is not null and revoked_reason is not null));
create or replace function private.guard_platform_principal_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'platform_principal_immutable' using errcode='23514';end if;
 if new.user_id<>old.user_id or new.role<>old.role or new.label<>old.label or new.granted_by<>old.granted_by or new.granted_at<>old.granted_at
 or (old.revoked_at is not null and (new.revoked_at is distinct from old.revoked_at or new.revoked_by is distinct from old.revoked_by or new.revoked_reason is distinct from old.revoked_reason))
 then raise exception 'platform_principal_immutable' using errcode='23514';end if;
 if old.revoked_at is null and new.revoked_at is not null then
  if new.revoked_reason is null or length(btrim(new.revoked_reason)) not between 3 and 500 then raise exception 'platform_principal_revocation_reason_required' using errcode='23514';end if;
  new.revoked_by:=current_user;
 end if;
 return new;
end $$;

-- 2. Truncation is never a way to erase a ledger or the principals.
create function private.guard_platform_ledger_truncate_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin raise exception 'platform_ledger_immutable' using errcode='23514';end $$;
revoke all on function private.guard_platform_ledger_truncate_v1() from public,anon,authenticated,service_role;
create trigger platform_principals_truncate_guard before truncate on private.platform_principals for each statement execute function private.guard_platform_ledger_truncate_v1();
create trigger execution_profile_registrations_truncate_guard before truncate on private.execution_profile_registrations for each statement execute function private.guard_platform_ledger_truncate_v1();
create trigger receivables_release_pause_events_truncate_guard before truncate on private.receivables_release_pause_events for each statement execute function private.guard_platform_ledger_truncate_v1();

-- 3. A declared actor is only accepted when it names an active principal; the ledger for pauses
-- takes the identity from the command alone, never from the row it happens to touch.
create function private.platform_actor_identity_v1() returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid;begin
 actor:=private.platform_actor_setting_v1('offroad.actor_user_id')::uuid;
 if actor is null then return null;end if;
 if not exists(select 1 from private.platform_principals p join auth.users u on u.id=p.user_id
  where p.user_id=actor and p.revoked_at is null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()))
 then raise exception 'platform_principal_required' using errcode='42501';end if;
 return actor;
end $$;
revoke all on function private.platform_actor_identity_v1() from public,anon,authenticated,service_role;

create or replace function private.ledger_receivables_release_pause_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare r private.receivables_analytical_release_grants;begin
 if tg_op='DELETE' then r:=old;else r:=new;end if;
 insert into private.receivables_release_pause_events(organization_id,operation,enabled,note,granted_by,granted_by_user_id,command_id)
 values(r.organization_id,tg_op,r.enabled,r.note,r.granted_by,private.platform_actor_identity_v1(),private.platform_actor_setting_v1('offroad.command_id')::uuid);
 if tg_op='DELETE' then return old;end if;return new;
end $$;

create or replace function private.bind_platform_attestation_actor_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid;label text;begin
 actor:=coalesce(new.actor_user_id,private.platform_actor_identity_v1());
 if actor is not null then
  select p.label into label from private.platform_principals p where p.user_id=actor and p.revoked_at is null;
  if label is null or btrim(new.actor)<>label then raise exception 'platform_principal_required' using errcode='42501';end if;
 end if;
 new.actor_user_id:=actor;
 return new;
end $$;

-- 4. Commands serialize per command id and compare every effect on replay.
create or replace function private.register_execution_method_profile_v1(p_command uuid,p_profile uuid,p_release text,p_canonical_payload text,p_adapter_source_commit text,p_review_evidence jsonb,p_actor_user_id uuid,p_reason text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare reg private.execution_profile_registrations;fp text;evidence_hash text;begin
 perform private.require_platform_principal_v1(p_actor_user_id);
 if p_command is null or p_profile is null or p_release is null or p_canonical_payload is null or p_adapter_source_commit is null
 or p_reason is null or length(btrim(p_reason)) not between 10 and 2000
 or p_review_evidence is null or jsonb_typeof(p_review_evidence)<>'object' or p_review_evidence->>'result' is distinct from 'approved'
 or coalesce(length(btrim(p_review_evidence->>'reviewer')),0) not between 3 and 200
 or p_review_evidence->>'sourcePath' is null or p_review_evidence->>'sourcePath' !~ '^packages/credit-playbook/knowledge/reviews/' or p_review_evidence->>'sourcePath' like '%..%'
 or p_review_evidence->>'sourceHash' is null or p_review_evidence->>'sourceHash' !~ '^[a-f0-9]{64}$'
 then raise exception 'execution_profile_registration_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 fp:=encode(extensions.digest(convert_to(p_canonical_payload,'UTF8'),'sha256'),'hex');
 evidence_hash:=encode(extensions.digest(convert_to(p_review_evidence::text,'UTF8'),'sha256'),'hex');
 select * into reg from private.execution_profile_registrations where command_id=p_command;
 if found then
  if reg.profile_id<>p_profile or reg.payload_fingerprint<>fp or reg.platform_release_id<>p_release or reg.actor_user_id is distinct from p_actor_user_id
  or reg.review_evidence_hash<>evidence_hash or reg.reason is distinct from btrim(p_reason) then raise exception 'platform_method_request_reused' using errcode='22023';end if;
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

create or replace function private.pause_receivables_release_v1(p_command uuid,p_organization uuid,p_enabled boolean,p_note text,p_actor_user_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare p private.platform_principals;prior private.receivables_release_pause_events;begin
 p:=private.require_platform_principal_v1(p_actor_user_id);
 if p_command is null or p_organization is null or p_enabled is null or (p_note is not null and char_length(p_note)>500) then raise exception 'receivables_release_pause_invalid' using errcode='22023';end if;
 perform 1 from public.organizations where id=p_organization;
 if not found then raise exception 'receivables_release_pause_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.receivables_release_pause_events where command_id=p_command order by sequence desc limit 1;
 if found then
  if prior.organization_id<>p_organization or prior.enabled is distinct from p_enabled or prior.granted_by_user_id is distinct from p_actor_user_id or prior.note is distinct from p_note
  then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return;
 end if;
 perform set_config('offroad.actor_user_id',p_actor_user_id::text,true);
 perform set_config('offroad.command_id',p_command::text,true);
 insert into private.receivables_analytical_release_grants(organization_id,enabled,note,granted_by,granted_by_user_id)
 values(p_organization,p_enabled,p_note,left(p.label,120),p_actor_user_id)
 on conflict(organization_id) do update set enabled=excluded.enabled,note=excluded.note,granted_by=excluded.granted_by,granted_by_user_id=excluded.granted_by_user_id,updated_at=now();
 perform set_config('offroad.actor_user_id','',true);perform set_config('offroad.command_id','',true);
end $$;

-- 5. The founder's user id lives in a private column, not in the approval JSON tenants can list.
-- Releases published before the principal registry existed keep a null column: their content
-- approval was recorded by label, and no identity is bound after the fact. Only publications
-- made through the identity-bound command fill it. Release rows are immutable, so no backfill
-- runs here.
alter table private.platform_method_releases add column approved_by_user_id uuid references auth.users(id);

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
 insert into private.platform_method_releases(id,method_id,version,manifest_hash,manifest,components,evidence,approval,capability_key,approved_by_user_id)
 values(c.release_id,c.method_id,c.version,c.bundle->'manifest'->>'manifestHash',c.bundle->'manifest',c.bundle->'components',c.bundle->'evidence',
 jsonb_build_object('approvedBy',a.actor,'approvedAt',a.evidence->>'occurredAt','approvalSource',a.evidence->>'sourcePath','sourceHash',a.evidence->>'sourceHash','sourceCommit',c.bundle->>'sourceCommit','candidateFingerprint',c.fingerprint,'executionEnabled',false),cap,a.actor_user_id);
 insert into private.platform_method_publication_events(command_id,candidate_id,action,request_fingerprint,reason) values(p_command,c.id,'published',fp,btrim(p_reason));
 return c.release_id;
end $$;
