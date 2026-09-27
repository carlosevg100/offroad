-- Publication cannot lose its identity requirement; profile replay binds every effect.
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
 -- Publication always requires an active founder and a live account; no label-only bootstrap.
 perform 1 from auth.users u where u.id=a.actor_user_id and u.deleted_at is null
  and (u.banned_until is null or u.banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'platform_founder_identity_required' using errcode='42501';end if;
 perform 1 from private.platform_principals p where p.user_id=a.actor_user_id and p.role='founder' and p.revoked_at is null for share;
 if not found then raise exception 'platform_founder_identity_required' using errcode='42501';end if;
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
  or reg.review_evidence_hash<>evidence_hash or reg.reason is distinct from btrim(p_reason)
  or (select p.adapter_source_commit from private.execution_method_profiles p where p.id=reg.profile_id) is distinct from p_adapter_source_commit then raise exception 'platform_method_request_reused' using errcode='22023';end if;
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
