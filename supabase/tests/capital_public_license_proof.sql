-- 3Q metadata foundation. Internal proof evaluation only: no complete delivery, raw
-- storage, production data or runtime writer. Every synthetic record is rolled back.
begin;
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_persistent_work_fixture.sql
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('10000000-0000-4000-8000-000000003091','authenticated','authenticated','capture-license@example.invalid','{"provider":"email","providers":["email"]}','{}',now(),now(),false,false);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000003091","role":"authenticated"}',true);
insert into public.organizations(id,organization_type,name,created_by)
values('20000000-0000-4000-8000-000000003091','offroad','Synthetic capture license publisher','10000000-0000-4000-8000-000000003091');
insert into public.organization_memberships(organization_id,user_id,role,status)
values('20000000-0000-4000-8000-000000003091','10000000-0000-4000-8000-000000003091','owner','active');
insert into public.capital_projects(id,organization_id,project_name,created_by)
values('30000000-0000-4000-8000-000000003091','20000000-0000-4000-8000-000000003091','Synthetic public license origin','10000000-0000-4000-8000-000000003091');
select set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000003091"}',true);
create temp table capture_license_fixture(version_id uuid,binding_id uuid,right_id uuid,payload jsonb);
-- Independent root and child source versions; explicit publisher rights per exact payload.
do $$ declare v uuid; b uuid; r uuid; sample jsonb; n integer;
begin
 for n in 1..3 loop
  v:=gen_random_uuid();
  sample:=jsonb_build_object('url','https://example.invalid/synthetic/'||n,'title','Synthetic source '||n,
   'snippet','Licensed synthetic excerpt '||n,'contentHash',repeat(case when n=1 then 'a' else 'b' end,64),
   'retrievedAt','2026-09-30T00:00:00Z');
  insert into public.sources(id,organization_id,origin_resource_id,origin_resource_reference,created_by)
  values(v,'20000000-0000-4000-8000-000000003091','30000000-0000-4000-8000-000000003091','30000000-0000-4000-8000-000000003091','10000000-0000-4000-8000-000000003091');
  insert into public.source_versions(id,organization_id,source_id,version_no,legacy_document_version,bucket_id,object_path,original_name,initial_verification_state,created_by)
  values(v,'20000000-0000-4000-8000-000000003091',v,1,1,'opportunity-documents','20000000-0000-4000-8000-000000003091/synthetic/'||v,'Synthetic public excerpt','pending_verification','10000000-0000-4000-8000-000000003091');
  insert into public.source_bindings(organization_id,source_version_id,resource_id,resource_reference,request_id,created_by)
  values('20000000-0000-4000-8000-000000003091',v,'30000000-0000-4000-8000-000000003091','30000000-0000-4000-8000-000000003091',gen_random_uuid(),'10000000-0000-4000-8000-000000003091') returning id into b;
  r:=public.declare_public_source_reuse_v1(v,0,sample->>'url',private.public_source_payload_sha256_v1(sample),now()+interval '60 days',now()+interval '60 days',v,repeat('a',64));
  insert into pg_temp.capture_license_fixture values(v,b,r,sample);
 end loop;
end; $$;

do $$ declare root record; child record; proof jsonb; replay jsonb; delivered timestamptz; wrong jsonb; changed jsonb;
 org constant uuid:='20000000-0000-4000-8000-000000003091'; actor constant uuid:='10000000-0000-4000-8000-000000003091';
 latest_id uuid; dependency_id uuid; third record; bad_right uuid;
begin
 select * into strict root from pg_temp.capture_license_fixture where payload->>'url'='https://example.invalid/synthetic/1';
 select * into strict child from pg_temp.capture_license_fixture where payload->>'url'='https://example.invalid/synthetic/2';
 delivered:=clock_timestamp();
 proof:=private.capital_public_license_proof_v1(org,root.version_id,root.right_id,root.binding_id,root.payload->>'url',private.public_source_payload_sha256_v1(root.payload),delivered);
 if proof is null or jsonb_array_length(proof->'pins')<>1 or proof#>>'{pins,0,sourceBindingId}' is distinct from root.binding_id::text
  then raise exception 'license_exact_pin_positive failed'; end if;
 replay:=private.capital_public_license_proof_v1(org,root.version_id,root.right_id,root.binding_id,root.payload->>'url',private.public_source_payload_sha256_v1(root.payload),delivered,proof->'pins',proof->>'dependencyFingerprint');
 if replay is distinct from proof then raise exception 'license_proof_replay_changed'; end if;
 if not private.capital_public_payload_valid_v1(root.payload) or private.capital_public_payload_valid_v1(root.payload||'{"privateValue":100}') then
  raise exception 'public_projection_cannot_license_extra_content failed'; end if;
 changed:=jsonb_set(root.payload,'{retrievedAt}','"2026-09-30T01:00:00Z"');
 if private.public_source_payload_sha256_v1(root.payload) is distinct from private.public_source_payload_sha256_v1(changed)
  or extensions.digest(root.payload::text,'sha256')=extensions.digest(changed::text,'sha256') then raise exception 'integral_and_public_hashes_conflated'; end if;
 if private.capital_public_license_proof_v1(org,root.version_id,root.right_id,root.binding_id,root.payload->>'url',repeat('c',64),delivered) is not null then
  raise exception 'wrong_payload_licensed'; end if;
 if private.capital_public_license_proof_v1(org,root.version_id,child.right_id,root.binding_id,root.payload->>'url',private.public_source_payload_sha256_v1(root.payload),delivered) is not null then
  raise exception 'wrong_direct_right_pin_licensed'; end if;
 if private.capital_public_license_proof_v1(org,root.version_id,root.right_id,child.binding_id,root.payload->>'url',private.public_source_payload_sha256_v1(root.payload),delivered) is not null then
  raise exception 'wrong_publication_binding_licensed'; end if;
 if private.capital_public_license_proof_v1(org,root.version_id,root.right_id,root.binding_id,root.payload->>'url',private.public_source_payload_sha256_v1(root.payload),delivered-interval '1 day') is not null then
  raise exception 'later_right_or_binding_completed_prior_intent'; end if;
 -- Append fixtures inside subtransactions; roll them back with a dedicated marker so
 -- immutable rights are never rewritten or deleted to restore a permissive state.
 begin
  insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,expires_at,store_until,evidence_kind,evidence_reference,evidence_sha256,created_by,public_source_url,public_payload_sha256)
  select organization_id,source_version_id,revision+1,array['read','store','derive'],purposes,audience,clock_timestamp(),expires_at,store_until,evidence_kind,evidence_reference,evidence_sha256,created_by,public_source_url,public_payload_sha256 from private.source_rights_versions where id=root.right_id;
  if private.capital_public_license_proof_v1(org,root.version_id,root.right_id,root.binding_id,root.payload->>'url',private.public_source_payload_sha256_v1(root.payload),delivered,proof->'pins',proof->>'dependencyFingerprint') is not null then raise exception 'current_right_without_process_allowed'; end if;
  raise exception 'fixture_rollback' using errcode='P3091';
 exception when sqlstate 'P3091' then null; end;
 begin
  insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,expires_at,store_until,evidence_kind,evidence_reference,evidence_sha256,created_by,public_source_url,public_payload_sha256)
  select organization_id,source_version_id,revision+1,operations,purposes,audience,clock_timestamp()+interval '1 day',expires_at,store_until,evidence_kind,evidence_reference,evidence_sha256,created_by,public_source_url,public_payload_sha256 from private.source_rights_versions where id=root.right_id returning id into latest_id;
  if private.capital_public_license_proof_v1(org,root.version_id,latest_id,root.binding_id,root.payload->>'url',private.public_source_payload_sha256_v1(root.payload),clock_timestamp()) is not null then raise exception 'future_direct_right_allowed'; end if;
  raise exception 'fixture_rollback' using errcode='P3091';
 exception when sqlstate 'P3091' then null; end;
 begin
  update public.source_bindings set revoked_at=clock_timestamp(),revoked_by=actor where id=root.binding_id;
  if private.capital_public_license_proof_v1(org,root.version_id,root.right_id,root.binding_id,root.payload->>'url',private.public_source_payload_sha256_v1(root.payload),delivered,proof->'pins',proof->>'dependencyFingerprint') is not null then raise exception 'revoked_same_binding_replayed'; end if;
  -- A replacement publication must not authorize the captured binding.
  insert into public.source_bindings(organization_id,source_version_id,resource_id,resource_reference,request_id,created_by)
  values(org,root.version_id,'30000000-0000-4000-8000-000000003091','30000000-0000-4000-8000-000000003091',gen_random_uuid(),actor);
  if private.capital_public_license_proof_v1(org,root.version_id,root.right_id,root.binding_id,root.payload->>'url',private.public_source_payload_sha256_v1(root.payload),delivered,proof->'pins',proof->>'dependencyFingerprint') is not null then raise exception 'replacement_binding_reauthorized_captured_binding'; end if;
  raise exception 'fixture_rollback' using errcode='P3091';
 exception when sqlstate 'P3091' then null; end;
 begin
  update public.organizations set organization_type='originator' where id=org;
  if private.capital_public_license_proof_v1(org,root.version_id,root.right_id,root.binding_id,root.payload->>'url',private.public_source_payload_sha256_v1(root.payload),delivered,proof->'pins',proof->>'dependencyFingerprint') is not null then raise exception 'non_offroad_publisher_licensed'; end if;
  raise exception 'fixture_rollback' using errcode='P3091';
 exception when sqlstate 'P3091' then null; end;
 begin
  insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,expires_at,store_until,evidence_kind,evidence_reference,evidence_sha256,created_by,public_source_url,public_payload_sha256,created_at)
  select organization_id,source_version_id,revision+1,operations,purposes,audience,clock_timestamp()-interval '1 day',expires_at,store_until,evidence_kind,evidence_reference,evidence_sha256,created_by,public_source_url,public_payload_sha256,clock_timestamp()+interval '1 day' from private.source_rights_versions where id=root.right_id returning id into latest_id;
  if private.capital_public_license_proof_v1(org,root.version_id,latest_id,root.binding_id,root.payload->>'url',private.public_source_payload_sha256_v1(root.payload),clock_timestamp()) is not null then raise exception 'later_created_right_with_backdated_valid_from_allowed'; end if;
  raise exception 'fixture_rollback' using errcode='P3091';
 exception when sqlstate 'P3091' then null; end;
 begin
  insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,expires_at,store_until,evidence_kind,evidence_reference,evidence_sha256,created_by,public_source_url,public_payload_sha256)
  select organization_id,source_version_id,revision+1,operations,purposes,audience,clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour',evidence_kind,evidence_reference,evidence_sha256,created_by,public_source_url,public_payload_sha256 from private.source_rights_versions where id=root.right_id;
  if private.capital_public_license_proof_v1(org,root.version_id,root.right_id,root.binding_id,root.payload->>'url',private.public_source_payload_sha256_v1(root.payload),delivered,proof->'pins',proof->>'dependencyFingerprint') is not null then raise exception 'expired_current_right_allowed'; end if;
  raise exception 'fixture_rollback' using errcode='P3091';
 exception when sqlstate 'P3091' then null; end;
 -- Real endpoint establishes an indirect pin, then proof includes both its exact right
 -- and the child's current-at-observation right.
 dependency_id:=public.add_source_dependency_v1(root.version_id,child.version_id);
 delivered:=clock_timestamp();
 proof:=private.capital_public_license_proof_v1(org,root.version_id,root.right_id,root.binding_id,root.payload->>'url',private.public_source_payload_sha256_v1(root.payload),delivered);
 if proof is null or jsonb_array_length(proof->'pins')<>3
  or not exists(select 1 from jsonb_array_elements(proof->'pins') p where p->>'sourceVersionId'=child.version_id::text and p->>'rightsVersionId'=child.right_id::text and p->>'role'='dependency') then
  raise exception 'indirect_public_source_not_pinned'; end if;
 begin
  insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,expires_at,store_until,evidence_kind,evidence_reference,evidence_sha256,created_by,public_source_url,public_payload_sha256)
  select organization_id,source_version_id,revision+1,array['read','store','derive'],purposes,audience,clock_timestamp(),expires_at,store_until,evidence_kind,evidence_reference,evidence_sha256,created_by,public_source_url,public_payload_sha256 from private.source_rights_versions where id=child.right_id;
  if private.capital_public_license_proof_v1(org,root.version_id,root.right_id,root.binding_id,root.payload->>'url',private.public_source_payload_sha256_v1(root.payload),delivered,proof->'pins',proof->>'dependencyFingerprint') is not null then raise exception 'ancestor_current_right_without_process_allowed'; end if;
  raise exception 'fixture_rollback' using errcode='P3091';
 exception when sqlstate 'P3091' then null; end;
 begin
  -- A valid installed dependency may pin an older restrictive right while the latest
  -- right is permissive. The latest boolean alone must not authorize that pin.
  select * into strict third from pg_temp.capture_license_fixture where payload->>'url'='https://example.invalid/synthetic/3';
  insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,expires_at,store_until,evidence_kind,evidence_reference,evidence_sha256,created_by,public_source_url,public_payload_sha256)
  select organization_id,source_version_id,revision+1,array['read','store','derive'],purposes,audience,clock_timestamp(),expires_at,store_until,evidence_kind,evidence_reference,evidence_sha256,created_by,public_source_url,public_payload_sha256 from private.source_rights_versions where id=third.right_id returning id into bad_right;
  insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,expires_at,store_until,evidence_kind,evidence_reference,evidence_sha256,created_by,public_source_url,public_payload_sha256)
  select organization_id,source_version_id,revision+2,operations,purposes,audience,clock_timestamp(),expires_at,store_until,evidence_kind,evidence_reference,evidence_sha256,created_by,public_source_url,public_payload_sha256 from private.source_rights_versions where id=third.right_id;
  insert into private.resource_dependencies(organization_id,derived_version_id,source_version_id,source_rights_version_id,created_by)
  values(org,root.version_id,third.version_id,bad_right,actor);
  if private.capital_public_license_proof_v1(org,root.version_id,root.right_id,root.binding_id,root.payload->>'url',private.public_source_payload_sha256_v1(root.payload),clock_timestamp()) is not null then raise exception 'ancestor_pinned_right_without_process_allowed_despite_latest'; end if;
  raise exception 'fixture_rollback' using errcode='P3091';
 exception when sqlstate 'P3091' then null; end;
 begin
  -- Corrupt graph fixture only, bypassing the public command that prevents cycles;
  -- proof must still fail closed when confronted with a graph installed by an older writer.
  insert into private.resource_dependencies(organization_id,derived_version_id,source_version_id,source_rights_version_id,created_by)
  values(org,child.version_id,root.version_id,root.right_id,actor);
  if private.capital_public_license_proof_v1(org,root.version_id,root.right_id,root.binding_id,root.payload->>'url',private.public_source_payload_sha256_v1(root.payload),clock_timestamp()) is not null then raise exception 'closure_cycle_licensed'; end if;
  raise exception 'fixture_rollback' using errcode='P3091';
 exception when sqlstate 'P3091' then null; end;
end; $$;
select 'capital_public_license_proof' as test,'PASS' as result;
rollback;
