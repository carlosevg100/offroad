-- Invoke after the FIRST actual HTTP worker_commit_capital_preview_task_v1
-- succeeds and before finishTask. Its Auth/job/body/binding come from the SDK;
-- no artifact, authorization, receipt or TaskRun is fabricated here.
create function pg_temp.prove_preview_native_artifact_publication(p_job uuid,p_account uuid)returns jsonb language plpgsql as $$
declare binding private.capital_preview_native_bindings;projection private.capital_preview_task_projections;run private.capital_preview_runs;revision public.artifact_revisions;artifact public.artifacts;blocks jsonb;count_before bigint;count_after bigint;checks integer:=0;old_claims text:=current_setting('request.jwt.claims',true);content_sha text;content_bytes bigint;result jsonb;source_org uuid;source_binding uuid;
begin
 select *into strict run from private.capital_preview_runs where job_id=p_job and worker_account_id=p_account;
 select *into binding from private.capital_preview_native_bindings where organization_id=run.organization_id and run_id=run.id order by created_at,id limit 1;
 if binding.id is null then raise exception 'preview_publication_actual_binding_missing';end if;
 select *into strict projection from private.capital_preview_task_projections where organization_id=run.organization_id and id=binding.projection_id;
 select *into strict revision from public.artifact_revisions where organization_id=run.organization_id and id=binding.revision_id;
 select *into strict artifact from public.artifacts where organization_id=run.organization_id and id=revision.artifact_id;
 select jsonb_agg(jsonb_build_object('blockKey',block_key,'kind',kind,'content',content,'claims',claims)order by block_no)into blocks from public.artifact_blocks where organization_id=run.organization_id and revision_id=revision.id;
 content_sha:=revision.manifest#>>'{bytes,sha256}';content_bytes:=(revision.manifest#>>'{bytes,byteLength}')::bigint;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_account,'role','authenticated')::text,true);
 if not private.capital_preview_revision_storage_allowed_v1(run.organization_id,run.work_id,revision.id,run.human_subject_id,artifact.subject,revision.manifest,blocks,'[]',content_sha,content_bytes)then raise exception 'preview_publication_actual_positive_denied';end if;checks:=checks+1;
 if private.capital_preview_revision_storage_allowed_v1(gen_random_uuid(),run.work_id,revision.id,run.human_subject_id,artifact.subject,revision.manifest,blocks,'[]',content_sha,content_bytes)then raise exception 'preview_publication_cross_tenant_allowed';end if;checks:=checks+1;
 if private.capital_preview_revision_storage_allowed_v1(run.organization_id,gen_random_uuid(),revision.id,run.human_subject_id,artifact.subject,revision.manifest,blocks,'[]',content_sha,content_bytes)then raise exception 'preview_publication_wrong_work_allowed';end if;checks:=checks+1;
 if private.capital_preview_revision_storage_allowed_v1(run.organization_id,run.work_id,gen_random_uuid(),run.human_subject_id,artifact.subject,revision.manifest,blocks,'[]',content_sha,content_bytes)then raise exception 'preview_publication_wrong_revision_allowed';end if;checks:=checks+1;
 if private.capital_preview_revision_storage_allowed_v1(run.organization_id,run.work_id,revision.id,gen_random_uuid(),artifact.subject,revision.manifest,blocks,'[]',content_sha,content_bytes)then raise exception 'preview_publication_wrong_subject_allowed';end if;checks:=checks+1;
 if private.capital_preview_revision_storage_allowed_v1(run.organization_id,run.work_id,revision.id,run.human_subject_id,artifact.subject,revision.manifest,blocks,'[]',repeat('f',64),content_bytes)then raise exception 'preview_publication_wrong_physical_hash_allowed';end if;checks:=checks+1;
 if private.capital_preview_revision_storage_allowed_v1(run.organization_id,run.work_id,revision.id,run.human_subject_id,artifact.subject,revision.manifest,jsonb_set(blocks,'{0,content}',jsonb_build_object('unguarded',true)),'[]',content_sha,content_bytes)then raise exception 'preview_publication_unbound_content_allowed';end if;checks:=checks+1;
 begin
 perform private.create_artifact_revision_v1(run.organization_id,run.work_id,'work_product',artifact.subject,'internal','worker',revision.manifest,blocks,'[]',content_sha,content_bytes,null,null,run.human_subject_id,revision.id,true);
 raise exception 'preview_publication_shared_core_weakened';
 exception when insufficient_privilege then null;end;checks:=checks+1;
 select count(*)into count_before from public.artifact_revisions where organization_id=run.organization_id;
 result:=private.create_capital_preview_artifact_revision_v1(run.organization_id,run.work_id,'work_product',artifact.subject,'internal','worker',revision.manifest,blocks,'[]',content_sha,content_bytes,null,null,run.human_subject_id,revision.id,true);
 select count(*)into count_after from public.artifact_revisions where organization_id=run.organization_id;
 if count_before<>count_after or (result->>'revision_id')::uuid is distinct from revision.id then raise exception 'preview_publication_replay_changed_history';end if;checks:=checks+1;
 begin
 update public.processing_jobs set lease_expires_at=clock_timestamp()-interval'1 second'where id=p_job;
 if private.capital_preview_revision_storage_allowed_v1(run.organization_id,run.work_id,revision.id,run.human_subject_id,artifact.subject,revision.manifest,blocks,'[]',content_sha,content_bytes)then raise exception 'preview_publication_expired_lease_allowed';end if;
 raise exception 'rollback expiry'using errcode='PZ001';exception when sqlstate'PZ001'then null;end;checks:=checks+1;
 select source.organization_id,source.source_binding_id into source_org,source_binding from private.capital_preview_consumed_basis_sources source where source.organization_id=run.publisher_organization_id and source.basis_id=run.basis_id order by source.file_name limit 1;
 -- The SDK/source fixture chooses its own real published source, never an
 -- unrelated corpus binding. This negative is invoked only when that FK exists.
 if source_binding is null then raise exception 'preview_publication_source_fixture_missing';end if;
 begin
 update public.source_bindings set revoked_at=clock_timestamp()where organization_id=source_org and id=source_binding;
 if private.capital_preview_revision_storage_allowed_v1(run.organization_id,run.work_id,revision.id,run.human_subject_id,artifact.subject,revision.manifest,blocks,'[]',content_sha,content_bytes)then raise exception 'preview_publication_revoked_source_allowed';end if;
 raise exception 'rollback source'using errcode='PZ001';exception when sqlstate'PZ001'then null;end;checks:=checks+1;
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 return jsonb_build_object('schemaVersion','capital-preview-native-publication-proof.v1','nativePhysicalRevision',true,'sharedCoreStillDenies',true,'replayPreservesHistory',true,'checksPassed',checks);
end;$$;
