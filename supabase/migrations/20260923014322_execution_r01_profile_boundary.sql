-- Stage 17 / 3D: attest the unchanged R01 profile, keep its execution closed.
-- No release mutation, profile insertion, grants, producer or customer activation.
set search_path='';

create or replace function private.validate_execution_profile_storage_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare p jsonb:=private.execution_json_projection_v1(new.canonical_payload);r private.platform_method_releases;begin
 select * into strict r from private.platform_method_releases where id=new.platform_release_id;
 -- R01 is a separate, fixed historical adapter, never a compiled-budget fallback.
 if r.method_id='underwrite-receivables-pool' or p#>>'{method,methodId}'='underwrite-receivables-pool'
 or p->>'adapter'='legacy-r01-artifact.v1' then
  if r.id is distinct from 'r01-2026.09.06-v1'
  or r.method_id is distinct from 'underwrite-receivables-pool' or r.version is distinct from '2026.09.06-v1'
  or r.manifest_hash is distinct from '17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090'
  or r.manifest is distinct from $r01_manifest${"schemaVersion":"legacy-procedure-adapter.v1","procedure":{"id":"underwrite-receivables-pool","version":"2026.09.06-v1","maturity":"production"},"source":{"path":"receivables/underwrite-receivables-pool.md","hash":"9f5cf24e6751c708a7ff9825afebdd1878e2e07fc652c295df7493cb8e246264"},"compiler":{"version":"2026.09.18-v1","sources":[{"path":"packages/credit-playbook/src/build-method-manifest.ts","hash":"38dacf680a45fc8e55dc2a862fa8cf950e6b34d626b485a85bc088b997decaec"},{"path":"packages/credit-playbook/src/method-component.ts","hash":"50a0dc0769ce9bd9d6f909f2a7242d69ed63bcd00e62850772b007ee37dd74e0"},{"path":"packages/credit-playbook/src/procedure-compiler.ts","hash":"f33177013196299df7c1345ed030b4af548fc815978b0c8ca639936620d8e93a"},{"path":"packages/credit-playbook/src/procedure-contract.ts","hash":"a5d53552cb262804d32573ee5d954cf5b225dc605851cc1d76cea19be29f70c7"},{"path":"packages/credit-playbook/src/procedure-markdown.ts","hash":"e4a0b52163edbdfe7d7ed3e8b0f4dd34ca9415628fd1e48b768cb1285b8ebf21"},{"path":"packages/credit-playbook/src/review-record.ts","hash":"d44342d3d38509c2a616b737e4d9f79e151305a35b918ce2e0dc9d3de5cd013a"},{"path":"pnpm-lock.yaml","hash":"9c58538e770b8ae181c088a42ba33a5456fbbc112eda3188b9898c084464df5b"},{"path":"tsconfig.base.json","hash":"0b80c49c86ed761d3e51788378c8e43cbcabebf8ccfbdd520c147223e9d543da"}],"hash":"757a3e46d1fc3fd4225e0f91e3302759bd59bb2aae5a3390a8a4db9b55c6bf2e"},"adapterHash":"caf448f8e194522a4fed02a967098ae8da0b6a6cb0ea22995c4b15d3e5c5d288","compositionStatus":"legacy_contract","grantsExecution":false,"pendingContent":["typed component contracts require explicit authorship"],"executor":{"module":"@offroad/receivables-analysis","exportName":"underwriteReceivablesPool","sourceClosureHash":"37ed5a9a2253f25e3c2b8d79d0e9cabf92c76e9bb3d06a74e52380d164c7e9e6"},"evidence":[{"path":"packages/credit-playbook/knowledge/reviews/runs/underwrite-receivables-pool-2026-09-10-adversarial/run.json","hash":"c28b9da4748cadeafaa1d3e66f6c4bec18f0bd3e4734c09e9d270347a058c99c"},{"path":"packages/credit-playbook/knowledge/reviews/runs/underwrite-receivables-pool-2026-09-10-consistency/run.json","hash":"4b7a1f6ee4aa6bcfa2e2e57cce17389288645862f5527ed9ff2d0d98c15e8e2c"},{"path":"packages/credit-playbook/knowledge/reviews/runs/underwrite-receivables-pool-2026-09-10-gold/run.json","hash":"47686335ebeedd9a0a651019d617963765162afd8119c3b1cbf2f2b81a330833"},{"path":"packages/credit-playbook/knowledge/reviews/underwrite-receivables-pool-2026-09-10-independent-review.json","hash":"829490e6200a23a7b62736706e3c7655ff5d81cc36ff980b06541a8d36a09e01"},{"path":"packages/receivables-analysis/src/underwrite.test.ts","hash":"511f0c30353dc6c0c2d038d7f7738e9f7cb566ab827b8a373d7ee5d773f7e2b7"}],"manifestHash":"17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090"}$r01_manifest$::jsonb
  or p is distinct from $r01_profile${"adapter":"legacy-r01-artifact.v1","allowedEffects":["read_only"],"containment":{"maxCostMicrousd":0,"maxDurationMs":31000,"maxModelCalls":0,"version":"r01-runtime-containment.2026-09-22.v1"},"contractHashAlgorithm":"published-artifact-schema-export-sha256-v1","descriptors":{"input":{"artifactHash":"25e7fb90c4dcb08f3550d4969762320e2a7592625cc15c8f0a61d6939610edb5","exportName":"receivablesPoolUnderwritingInputSchema","schemaVersion":"published-artifact-schema-export.v1"},"output":{"artifactHash":"25e7fb90c4dcb08f3550d4969762320e2a7592625cc15c8f0a61d6939610edb5","exportName":"receivablesPoolUnderwritingSchema","schemaVersion":"published-artifact-schema-export.v1"}},"fingerprint":"7fc3be6e6169c027b1ba2f11f61abefdeccd5f0e087bd980a35c85e6575297b9","formulaCoverage":"executor_source_closure","grantsExecution":false,"limits":{"maxCostMicrousd":0,"maxDurationMs":31000,"maxModelCalls":0},"manifestHashAlgorithm":"method-stable-json-utf16-sha256-v1","method":{"baseManifestHash":"17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090","compilerHash":"757a3e46d1fc3fd4225e0f91e3302759bd59bb2aae5a3390a8a4db9b55c6bf2e","compilerVersion":"2026.09.18-v1","executor":{"inputContractHash":"898aeeb044bf8a66d85fb82df0d9dbc0f79f913c0f5402fa461669819949e3de","key":"@offroad/receivables-analysis#underwriteReceivablesPool","outputContractHash":"ee6b50df3822914a29c00d8750ed1d7f84c2dbf1ea8d08021d23917dd3491e2d","sourceClosureHash":"37ed5a9a2253f25e3c2b8d79d0e9cabf92c76e9bb3d06a74e52380d164c7e9e6","version":"2026.09.06-v1"},"formulas":[],"houseReleaseId":null,"manifestHash":"17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090","methodId":"underwrite-receivables-pool","methodVersion":"2026.09.06-v1","platformReleaseId":"r01-2026.09.06-v1"},"originalBudget":null,"schemaVersion":"execution-profile.v1","selectedComponentId":"legacy:R01","sourceFingerprint":"9e71b791b0f5a9c586c2865e6c3d61b8490d56d34918b1f8c1ea0fe9a8054c3a","tools":[]}$r01_profile$::jsonb
  then raise exception 'execution_r01_profile_mismatch' using errcode='23514';end if;
 else
 if p->>'schemaVersion' is distinct from 'execution-profile.v1'
 or p->>'adapter' is distinct from 'compiled-single-deterministic.v1'
 or p->>'grantsExecution' is distinct from 'false'
 or p#>>'{method,platformReleaseId}' is distinct from r.id
 or p#>>'{method,manifestHash}' is distinct from r.manifest_hash
 or p#>>'{method,baseManifestHash}' is distinct from r.manifest_hash
 or p#>>'{method,methodId}' is distinct from r.method_id
 or p#>>'{method,methodVersion}' is distinct from r.version
 or p#>'{method,houseReleaseId}' is distinct from 'null'::jsonb
 or p->'tools' is distinct from '[]'::jsonb
 or p->'allowedEffects' is distinct from '["read_only"]'::jsonb
 or p#>'{limits,maxCostMicrousd}' is distinct from '0'::jsonb
 or p#>'{limits,maxModelCalls}' is distinct from '0'::jsonb
 or p#>'{originalBudget}' is distinct from r.manifest->'budget'
 or p#>'{limits,maxDurationMs}' is distinct from r.manifest#>'{budget,maxDurationMs}'
 or coalesce((p#>>'{limits,maxDurationMs}')::bigint,0) not between 1 and 9007199254740991
 or p#>'{method,compilerHash}' is distinct from r.manifest#>'{compiler,hash}'
 or p#>'{method,compilerVersion}' is distinct from r.manifest#>'{compiler,version}'
 then raise exception 'execution_profile_release_mismatch' using errcode='23514';end if;
 end if;
 -- Operator-only storage of a reviewed derivation; a hash is not its own attestation.
 -- The actual adapter/test review is required by deployment, before inserting a profile.
 if new.review_evidence->>'result' is distinct from 'approved'
 or new.review_evidence->>'subjectCommit' is distinct from new.adapter_source_commit
 or coalesce(new.review_evidence->>'reviewer','')=''
 or coalesce(new.review_evidence->>'sourceHash','') !~ '^[a-f0-9]{64}$'
 then raise exception 'execution_profile_review_required' using errcode='23514';end if;
 return new;
end $$;

create or replace function private.require_execution_release_v1(p_profile uuid) returns private.execution_method_profiles
language plpgsql security definer set search_path='' as $$
declare p private.execution_method_profiles;r private.platform_method_releases;c private.platform_capability_releases;begin
 select * into p from private.execution_method_profiles where id=p_profile;
 if not found then raise exception 'execution_profile_unavailable' using errcode='42501';end if;
 select * into strict r from private.platform_method_releases where id=p.platform_release_id;
 -- Storage attests an adapter; it does not attest source provenance or authorize a job.
 -- Remove only together with the reviewed R01 provenance/producer bridge and real queue proof.
 if r.method_id='underwrite-receivables-pool' or p.payload->>'adapter'='legacy-r01-artifact.v1' then
  raise exception 'execution_r01_provenance_unavailable' using errcode='42501';
 end if;
 select * into c from private.platform_capability_releases where capability_key=r.capability_key for share;
 if not found or not c.released or c.exposure<>'universal' or c.method_id<>r.method_id or c.method_version<>r.version
 or not private.platform_method_reference_available_v1(r.id)
 then raise exception 'execution_method_unavailable' using errcode='42501';end if;
 return p;
end $$;

