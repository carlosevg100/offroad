-- Stage 17, correction 3O, third part, after the second independent review: the profile ledger
-- verifies a declared identity the same way the pause ledger does; a malformed declared identity
-- is refused as a missing principal; revocation records the session user, not the function owner;
-- an explicit attestation identity must also be a live account; principal labels are stored
-- trimmed; attestations, publication events, releases and profiles also refuse truncation.
set search_path='';

create function private.platform_principal_live_v1(p_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.platform_principals p join auth.users u on u.id=p.user_id
  where p.user_id=p_user_id and p.revoked_at is null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()));
$$;
revoke all on function private.platform_principal_live_v1(uuid) from public,anon,authenticated,service_role;

create or replace function private.platform_actor_identity_v1() returns uuid language plpgsql stable security definer set search_path='' as $$
declare raw text;actor uuid;begin
 raw:=private.platform_actor_setting_v1('offroad.actor_user_id');
 if raw is null then return null;end if;
 begin actor:=raw::uuid;exception when invalid_text_representation then raise exception 'platform_principal_required' using errcode='42501';end;
 if not private.platform_principal_live_v1(actor) then raise exception 'platform_principal_required' using errcode='42501';end if;
 return actor;
end $$;

create or replace function private.ledger_execution_profile_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.execution_profile_registrations(profile_id,platform_release_id,payload_fingerprint,review_evidence_hash,actor_user_id,command_id,reason)
 values(new.id,new.platform_release_id,new.payload_fingerprint,encode(extensions.digest(convert_to(new.review_evidence::text,'UTF8'),'sha256'),'hex'),
  private.platform_actor_identity_v1(),private.platform_actor_setting_v1('offroad.command_id')::uuid,private.platform_actor_setting_v1('offroad.command_reason'));
 return new;
end $$;

create or replace function private.guard_platform_principal_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'platform_principal_immutable' using errcode='23514';end if;
 if new.user_id<>old.user_id or new.role<>old.role or new.label<>old.label or new.granted_by<>old.granted_by or new.granted_at<>old.granted_at
 or (old.revoked_at is not null and (new.revoked_at is distinct from old.revoked_at or new.revoked_by is distinct from old.revoked_by or new.revoked_reason is distinct from old.revoked_reason))
 then raise exception 'platform_principal_immutable' using errcode='23514';end if;
 if old.revoked_at is null and new.revoked_at is not null then
  if new.revoked_reason is null or length(btrim(new.revoked_reason)) not between 3 and 500 then raise exception 'platform_principal_revocation_reason_required' using errcode='23514';end if;
  new.revoked_by:=session_user;
 end if;
 return new;
end $$;

alter table private.platform_principals add constraint platform_principals_label_trimmed check(label=btrim(label));

create or replace function private.bind_platform_attestation_actor_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid;label text;begin
 actor:=coalesce(new.actor_user_id,private.platform_actor_identity_v1());
 if actor is not null then
  if not private.platform_principal_live_v1(actor) then raise exception 'platform_principal_required' using errcode='42501';end if;
  select p.label into label from private.platform_principals p where p.user_id=actor and p.revoked_at is null;
  if label is null or btrim(new.actor)<>label then raise exception 'platform_principal_required' using errcode='42501';end if;
 end if;
 new.actor_user_id:=actor;
 return new;
end $$;

create trigger platform_method_attestations_truncate_guard before truncate on private.platform_method_attestations for each statement execute function private.guard_platform_ledger_truncate_v1();
create trigger platform_method_publication_events_truncate_guard before truncate on private.platform_method_publication_events for each statement execute function private.guard_platform_ledger_truncate_v1();
create trigger platform_method_releases_truncate_guard before truncate on private.platform_method_releases for each statement execute function private.guard_platform_ledger_truncate_v1();
create trigger execution_method_profiles_truncate_guard before truncate on private.execution_method_profiles for each statement execute function private.guard_platform_ledger_truncate_v1();
