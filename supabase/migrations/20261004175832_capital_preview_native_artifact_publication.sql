-- Forward-only after native preview + its exact upload-authority correction.
-- The shared artifact core is preserved byte for byte. A private preview-only
-- projection publisher retains its work/head/version/lineage logic, and its
-- parity test blocks future core drift until this closed projection is updated.
create function private.capital_preview_revision_storage_allowed_v1(p_org uuid,p_work uuid,p_revision uuid,p_rights_subject uuid,p_subject text,p_manifest jsonb,p_blocks jsonb,p_links jsonb,p_content_sha256 text,p_byte_length bigint)returns boolean
language plpgsql volatile security definer set search_path=''as $$
declare binding private.capital_preview_native_bindings;projection private.capital_preview_task_projections;run private.capital_preview_runs;
 allocation private.capital_public_payload_allocations;basis private.capital_preview_body_bases;task public.capital_project_task_runs;plan_task public.capital_project_plan_tasks;content jsonb;typ text;
begin
 if auth.uid()is null or p_revision is null then return false;end if;
 select *into binding from private.capital_preview_native_bindings where organization_id=p_org and work_id=p_work and revision_id=p_revision;
 select *into projection from private.capital_preview_task_projections where organization_id=p_org and id=binding.projection_id;
 select *into run from private.capital_preview_runs where organization_id=p_org and id=binding.run_id;
 if binding.id is null or projection.id is null or run.id is null or run.worker_account_id is distinct from auth.uid()
 or run.work_id is distinct from p_work or run.human_subject_id is distinct from p_rights_subject
 or(projection.run_id,projection.work_id,projection.capital_artifact_id,projection.retained_payload_id,projection.semantic_fingerprint)is distinct from(binding.run_id,binding.work_id,binding.capital_artifact_id,binding.retained_payload_id,binding.final_fingerprint)then return false;end if;
 select a.*into allocation from private.capital_public_retained_payloads retained join private.capital_public_payload_allocations a on(a.organization_id,a.id)=(retained.organization_id,retained.allocation_id)where retained.organization_id=p_org and retained.id=binding.retained_payload_id;
 select *into basis from private.capital_preview_body_bases where organization_id=p_org and id=allocation.preview_body_basis_id;
 select *into task from public.capital_project_task_runs where organization_id=p_org and id=projection.task_run_id;
 select *into plan_task from public.capital_project_plan_tasks where organization_id=p_org and id=task.plan_task_id;
 if allocation.id is null or allocation.content_kind is distinct from'preview_body'or allocation.job_id is distinct from run.job_id
 or allocation.worker_account_id is distinct from auth.uid()or task.status is distinct from'running'
 or(task.processing_job_id,task.capital_project_id,task.plan_id,plan_task.task_id)is distinct from(run.job_id,p_work,run.plan_id,projection.task_id)
 or(basis.run_id,basis.task_run_id,basis.task_id,basis.kind,basis.semantic_fingerprint)is distinct from(run.id,task.id,projection.task_id,projection.role,projection.semantic_fingerprint)
 or projection.role not in('task_output','decision_contract')
 or private.capital_preview_allocation_deadline_v1(p_org,allocation.id,p_rights_subject)is null
 or not private.capital_public_allocation_job_current_v1(allocation.id)
 or not private.capital_body_physical_receipt_v1(p_org,binding.retained_payload_id)then return false;end if;
 typ:=case when projection.role='decision_contract'then'preview_decision_contract'else(select step->>'artifactType'from jsonb_array_elements(private.capital_preview_workflow_v1(run.composition)->'steps')step where step->>'taskId'=projection.task_id)end;
 content:=jsonb_build_object('schemaVersion','capital-preview-task-projection.v1','revisionId',p_revision,'runId',run.id,'taskId',projection.task_id,'role',projection.role,'retainedPayloadId',binding.retained_payload_id,'semanticFingerprint',projection.semantic_fingerprint,'physicalSha256',allocation.payload_fingerprint,'byteLength',allocation.byte_length);
 if typ is null or p_subject is distinct from'Preview '||typ
 or p_content_sha256 is distinct from allocation.payload_fingerprint or p_byte_length is distinct from allocation.byte_length
 or projection.artifact_fingerprint is distinct from encode(extensions.digest(content::text,'sha256'),'hex')
 or p_manifest#>'{bytes}'is distinct from jsonb_build_object('sha256',allocation.payload_fingerprint,'byteLength',allocation.byte_length,'storage',jsonb_build_object('bucket',allocation.bucket_id,'path',allocation.object_path))
 or p_manifest#>'{inputSnapshot}'is distinct from jsonb_build_object('fingerprint',task.input_fingerprint)
 or p_manifest#>'{provenance}'is distinct from jsonb_build_object('producer','capital-preview-native-producer.v1','jobId',run.job_id,'taskRunId',task.id,'messageId',null,'capability',null)
 or p_manifest->>'format'is distinct from'json'or p_manifest->'sources'is distinct from'[]'::jsonb or p_manifest->'claims'is distinct from'[]'::jsonb
 or p_blocks is distinct from jsonb_build_array(jsonb_build_object('blockKey','preview-result','kind','section','content',content,'claims','[]'::jsonb))or p_links is distinct from'[]'::jsonb then return false;end if;
 return true;
end;$$;
revoke all on function private.capital_preview_revision_storage_allowed_v1(uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,text,bigint)from public,anon,authenticated,service_role;

-- Derive the dedicated publisher only from the exact current core. No shared
-- function mutation, grants or caller-controlled schema marker admits storage.
do $patch$declare core regprocedure:='private.create_artifact_revision_v1(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,text,bigint,jsonb,uuid,uuid,uuid,boolean)'::regprocedure;
 definition text;source text;needle text;replacement text;begin
 select prosrc into source from pg_proc where oid=core;
 if md5(source)is distinct from'868467d82112dcafa2fb10198aa513ce'then raise exception 'capital_preview_artifact_core_source_drift'using errcode='55000';end if;
 definition:=pg_get_functiondef(core);
 needle:=E'begin\n if p_org is null';
 replacement:=E'begin\n if p_kind is distinct from ''work_product'' or p_origin is distinct from ''worker'' or p_audience is distinct from ''internal'' or p_legacy_ref is not null or p_lock_work is distinct from true or not private.capital_preview_revision_storage_allowed_v1(p_org,p_work,p_revision_id,p_rights_subject,p_subject,p_manifest,p_blocks,p_links,p_content_sha256,p_byte_length) then raise exception ''capital_preview_native_publication_denied'' using errcode=''42501'';end if;\n if p_org is null';
 if(length(source)-length(replace(source,needle,'')))/length(needle)<>1 then raise exception 'capital_preview_artifact_core_source_drift'using errcode='55000';end if;
 definition:=replace(definition,needle,replacement);
 needle:='if jsonb_typeof(p_manifest#>''{bytes,storage}'')=''object'' and not exists(';
 replacement:='if jsonb_typeof(p_manifest#>''{bytes,storage}'')=''object'' and not private.capital_preview_revision_storage_allowed_v1(p_org,p_work,p_revision_id,p_rights_subject,p_subject,p_manifest,p_blocks,p_links,p_content_sha256,p_byte_length) and not exists(';
 if(length(source)-length(replace(source,needle,'')))/length(needle)<>1 then raise exception 'capital_preview_artifact_core_source_drift'using errcode='55000';end if;
 definition:=replace(definition,needle,replacement);
 -- Native physical substance is recognized only inside this closed publisher;
 -- no source, execution, financial claim or legacy evidence is fabricated.
 needle:='or jsonb_typeof(p_manifest->''legacy'')=''object'';';
 replacement:='or jsonb_typeof(p_manifest->''legacy'')=''object'' or private.capital_preview_revision_storage_allowed_v1(p_org,p_work,p_revision_id,p_rights_subject,p_subject,p_manifest,p_blocks,p_links,p_content_sha256,p_byte_length);';
 if(length(source)-length(replace(source,needle,'')))/length(needle)<>1 then raise exception 'capital_preview_artifact_core_source_drift'using errcode='55000';end if;
 definition:=replace(definition,needle,replacement);
 definition:=replace(definition,'CREATE OR REPLACE FUNCTION private.create_artifact_revision_v1(','CREATE OR REPLACE FUNCTION private.create_capital_preview_artifact_revision_v1(');
 execute definition;
end;$patch$;
revoke all on function private.create_capital_preview_artifact_revision_v1(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,text,bigint,jsonb,uuid,uuid,uuid,boolean)from public,anon,authenticated,service_role;

-- Only the preview native committer switches publisher; every existing scope,
-- task/body/parent guard, lock and replay branch remains byte-identical.
do $patch$declare target regprocedure:='private.worker_commit_capital_preview_task_v1(uuid,text,uuid,uuid,uuid,text)'::regprocedure;source text;definition text;begin
 select prosrc into source from pg_proc where oid=target;
 if md5(source)is distinct from'7654c85dda567ee1b3577f9ee1581034'then raise exception 'capital_preview_native_commit_source_drift'using errcode='55000';end if;
 definition:=pg_get_functiondef(target);
 if(length(source)-length(replace(source,'private.create_artifact_revision_v1(','')))/length('private.create_artifact_revision_v1(')<>1
 or(length(source)-length(replace(source,'''key'',''preview-result''','')))/length('''key'',''preview-result''')<>1 then raise exception 'capital_preview_native_commit_source_drift'using errcode='55000';end if;
 definition:=replace(definition,'private.create_artifact_revision_v1(','private.create_capital_preview_artifact_revision_v1(');
 definition:=replace(definition,'''key'',''preview-result''','''blockKey'',''preview-result''');
 execute definition;
end;$patch$;
-- CREATE OR REPLACE preserves the original legitimate command ACL.
-- Its SECURITY INVOKER public wrapper requires existing authenticated EXECUTE.
