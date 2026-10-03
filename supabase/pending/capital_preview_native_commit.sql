-- Forward preview projection protocol; assemble after consumed sources,
-- dispatch policy, consumption and execution ledger. No remote apply performed.
set search_path='';
create table private.capital_preview_task_projections(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,run_id uuid not null,
 task_id text not null,task_run_id uuid not null,role text not null check(role in('task_output','decision_contract')),
 capital_artifact_id uuid not null,retained_payload_id uuid not null,semantic_fingerprint text not null check(semantic_fingerprint~'^[a-f0-9]{64}$'),
 artifact_fingerprint text not null check(artifact_fingerprint~'^[a-f0-9]{64}$'),artifact_version integer not null check(artifact_version>0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,run_id,task_id,role),unique(organization_id,capital_artifact_id),
 foreign key(organization_id,work_id,run_id)references private.capital_preview_runs(organization_id,work_id,id),
 foreign key(organization_id,task_run_id)references public.capital_project_task_runs(organization_id,id),
 foreign key(organization_id,capital_artifact_id)references public.capital_project_artifacts(organization_id,id)deferrable initially deferred,
 foreign key(organization_id,retained_payload_id)references private.capital_public_retained_payloads(organization_id,id));
create index capital_preview_projection_run_idx on private.capital_preview_task_projections(organization_id,work_id,run_id);
create index capital_preview_projection_task_idx on private.capital_preview_task_projections(organization_id,task_run_id);
create index capital_preview_projection_retained_idx on private.capital_preview_task_projections(organization_id,retained_payload_id);
alter table private.capital_preview_task_projections enable row level security;
alter table private.capital_preview_task_projections force row level security;
create policy preview_projection_select on private.capital_preview_task_projections for select using(false);
create policy preview_projection_insert on private.capital_preview_task_projections for insert with check(false);
create policy preview_projection_update on private.capital_preview_task_projections for update using(false)with check(false);
create policy preview_projection_delete on private.capital_preview_task_projections for delete using(false);
revoke all on private.capital_preview_task_projections from public,anon,authenticated,service_role;
create trigger preview_projection_immutable before update or delete on private.capital_preview_task_projections for each row execute function private.reject_source_version_mutation_v1();
create trigger preview_projection_no_truncate before truncate on private.capital_preview_task_projections for each statement execute function private.reject_review_history_mutation_v1();
create trigger preview_projection_audit after insert on private.capital_preview_task_projections for each row execute function private.capture_identity_audit_v1();

alter table private.capital_preview_body_bases add constraint capital_preview_accepted_body_fk foreign key(organization_id,accepted_invocation_id)references private.capital_preview_accepted_invocations(organization_id,id);
-- Low-level closure deliberately never calls recipe/release, avoiding cycles.
create function private.capital_preview_projection_deadline_v1(p_org uuid,p_run uuid,p_subject uuid,p_task text)
returns timestamptz language plpgsql volatile security definer set search_path=''as $$
declare x private.capital_preview_task_projections;a private.capital_public_payload_allocations;deadline timestamptz;
begin
 select *into x from private.capital_preview_task_projections where organization_id=p_org and run_id=p_run and task_id=p_task and role='task_output';
 if x.id is null or not exists(select 1 from public.capital_project_task_runs tr join public.capital_project_artifacts c on(c.organization_id,c.id)=(tr.organization_id,x.capital_artifact_id)
 where tr.organization_id=p_org and tr.id=x.task_run_id and tr.status='succeeded'and tr.output_fingerprint=x.artifact_fingerprint and c.artifact_fingerprint=x.artifact_fingerprint and c.status not in('stale','superseded'))then return null;end if;
 select allocation.*into a from private.capital_public_retained_payloads retained join private.capital_public_payload_allocations allocation on(allocation.organization_id,allocation.id)=(retained.organization_id,retained.allocation_id)where retained.organization_id=p_org and retained.id=x.retained_payload_id;
 deadline:=private.capital_preview_run_deadline_v1(p_org,p_run,p_subject,true);
 if deadline is null or not private.capital_body_physical_receipt_v1(p_org,x.retained_payload_id)or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending')then return null;end if;
 deadline:=least(deadline,a.expires_at,a.purge_at);if deadline<=clock_timestamp()then return null;end if;return deadline;
end;$$;
create table private.capital_preview_native_bindings(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,run_id uuid not null,
 projection_id uuid not null,capital_artifact_id uuid not null,revision_id uuid not null,retained_payload_id uuid not null,final_fingerprint text not null check(final_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,projection_id),unique(organization_id,revision_id),
 foreign key(organization_id,work_id,run_id)references private.capital_preview_runs(organization_id,work_id,id),
 foreign key(organization_id,projection_id)references private.capital_preview_task_projections(organization_id,id),
 foreign key(organization_id,capital_artifact_id)references public.capital_project_artifacts(organization_id,id)deferrable initially deferred,
 foreign key(organization_id,revision_id)references public.artifact_revisions(organization_id,id)deferrable initially deferred,
 foreign key(organization_id,retained_payload_id)references private.capital_public_retained_payloads(organization_id,id));
create index preview_binding_work_idx on private.capital_preview_native_bindings(organization_id,work_id,run_id);
create index preview_binding_projection_idx on private.capital_preview_native_bindings(organization_id,projection_id);
create index preview_binding_artifact_idx on private.capital_preview_native_bindings(organization_id,capital_artifact_id);
create index preview_binding_retained_idx on private.capital_preview_native_bindings(organization_id,retained_payload_id);
alter table private.capital_preview_native_bindings enable row level security;
alter table private.capital_preview_native_bindings force row level security;
create policy preview_binding_select on private.capital_preview_native_bindings for select using(false);
create policy preview_binding_insert on private.capital_preview_native_bindings for insert with check(false);
create policy preview_binding_update on private.capital_preview_native_bindings for update using(false)with check(false);
create policy preview_binding_delete on private.capital_preview_native_bindings for delete using(false);
revoke all on private.capital_preview_native_bindings from public,anon,authenticated,service_role;
create trigger preview_binding_immutable before update or delete on private.capital_preview_native_bindings for each row execute function private.reject_source_version_mutation_v1();
create trigger preview_binding_no_truncate before truncate on private.capital_preview_native_bindings for each statement execute function private.reject_review_history_mutation_v1();
create trigger preview_binding_audit after insert on private.capital_preview_native_bindings for each row execute function private.capture_identity_audit_v1();
create function private.capital_preview_native_read_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid)returns boolean language plpgsql volatile security definer set search_path=''as $$
declare binding private.capital_preview_native_bindings;projection private.capital_preview_task_projections;deadline timestamptz;
begin
 select*into binding from private.capital_preview_native_bindings where organization_id=p_org and revision_id=p_revision;
 if binding.id is null then return true;end if;
 select*into projection from private.capital_preview_task_projections where organization_id=p_org and id=binding.projection_id;
 deadline:=private.capital_preview_projection_deadline_v1(p_org,binding.run_id,p_actor,projection.task_id);
 if deadline is null or not private.capital_body_subject_allowed_v1(p_org,binding.work_id,p_actor)or not exists(select 1 from public.artifact_revisions revision join public.artifacts artifact on(artifact.organization_id,artifact.id)=(revision.organization_id,revision.artifact_id)
 where revision.organization_id=p_org and revision.id=p_revision and artifact.head_revision_id=revision.id and artifact.work_id=binding.work_id)then return false;end if;
 return private.capital_body_physical_receipt_v1(p_org,binding.retained_payload_id)and private.capital_preview_allocation_deadline_v1(p_org,(select allocation_id from private.capital_public_retained_payloads where organization_id=p_org and id=binding.retained_payload_id),p_actor)is not null;
end;$$;
create function private.read_capital_preview_result_body_v1(p_revision_id uuid)returns jsonb language plpgsql volatile security definer set search_path=''as $$
declare binding private.capital_preview_native_bindings;revision public.artifact_revisions;allocation private.capital_public_payload_allocations;deadline timestamptz;result jsonb;
begin
 select*into binding from private.capital_preview_native_bindings where revision_id=p_revision_id;
 select*into revision from public.artifact_revisions where id=p_revision_id;
 if binding.id is null or revision.id is null or private.artifact_revision_release_v1(revision)='blocked'or not private.capital_preview_native_read_allowed_v1(binding.organization_id,p_revision_id,auth.uid())then raise exception 'capital_preview_human_read_denied'using errcode='42501';end if;
 select a.*into strict allocation from private.capital_public_retained_payloads q join private.capital_public_payload_allocations a on(a.organization_id,a.id)=(q.organization_id,q.allocation_id)where q.organization_id=binding.organization_id and q.id=binding.retained_payload_id;
 deadline:=private.capital_preview_allocation_deadline_v1(binding.organization_id,allocation.id,auth.uid());
 -- This envelope's recipeId is the complete finite RUN, never a paid boundary.
 result:=jsonb_build_object('schemaVersion','capital-preview-read-scope.v1','workId',binding.work_id,'artifactId',binding.capital_artifact_id,'revisionId',binding.revision_id,'recipeId',binding.run_id,'finalFingerprint',binding.final_fingerprint,'retention',private.capital_preview_body_dto_v1(binding.organization_id,allocation.id,deadline,true));
 if private.artifact_revision_release_v1(revision)='blocked'or not private.capital_preview_native_read_allowed_v1(binding.organization_id,p_revision_id,auth.uid())then raise exception 'capital_preview_human_read_denied'using errcode='42501';end if;return result;
end;$$;
create function public.read_capital_preview_result_body_v1(p_revision_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.read_capital_preview_result_body_v1(p_revision_id);$$;
-- Exact native bridge replaces the legacy projector only for preview CPA.
alter function private.project_legacy_artifact_revision_v1(text,uuid,uuid)rename to project_legacy_artifact_revision_pre_preview_v1;
create function private.project_legacy_artifact_revision_v1(p_table text,p_org uuid,p_row uuid)returns integer language plpgsql security definer set search_path=''as $$
begin
 if p_table='capital_project_artifacts'and exists(select 1 from private.capital_preview_task_projections where organization_id=p_org and capital_artifact_id=p_row)then return 0;end if;
 return private.project_legacy_artifact_revision_pre_preview_v1(p_table,p_org,p_row);end;$$;
revoke all on function private.project_legacy_artifact_revision_pre_preview_v1(text,uuid,uuid)from public,anon,authenticated,service_role;
alter function private.artifact_revision_release_v1(public.artifact_revisions)rename to artifact_revision_release_pre_preview_v1;
create function private.artifact_revision_release_v1(p_revision public.artifact_revisions)returns text language plpgsql volatile security definer set search_path=''as $$
begin
 if not private.capital_preview_native_read_allowed_v1(p_revision.organization_id,p_revision.id,auth.uid())then return'blocked';end if;
 return private.artifact_revision_release_pre_preview_v1(p_revision);end;$$;
revoke all on function private.artifact_revision_release_pre_preview_v1(public.artifact_revisions)from public,anon,authenticated,service_role;

create function private.worker_commit_capital_preview_task_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_task_run_id uuid,p_retained_payload_id uuid,p_role text)
returns jsonb language plpgsql security definer set search_path=''as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_preview_runs;
 tr public.capital_project_task_runs;pt public.capital_project_plan_tasks;b private.capital_preview_body_bases;a private.capital_public_payload_allocations;
 x private.capital_preview_task_projections;dep text;dx private.capital_preview_task_projections;deps jsonb:='[]';projection jsonb;fp text;aid uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();version integer;typ text;manifest jsonb;revision_result jsonb;
begin
 r:=private.require_capital_preview_run_v1(j.id,p_capability_token,p_run_id,true);
 select *into tr from public.capital_project_task_runs where organization_id=j.organization_id and id=p_task_run_id for update;
 select *into pt from public.capital_project_plan_tasks where organization_id=j.organization_id and id=tr.plan_task_id;
 if tr.id is null or tr.processing_job_id<>j.id or tr.capital_project_id<>r.work_id or tr.plan_id<>r.plan_id or p_role not in('task_output','decision_contract')then raise exception 'capital_preview_task_denied'using errcode='42501';end if;
 select allocation.*into a from private.capital_public_retained_payloads retained join private.capital_public_payload_allocations allocation on(allocation.organization_id,allocation.id)=(retained.organization_id,retained.allocation_id)where retained.organization_id=j.organization_id and retained.id=p_retained_payload_id;
 select *into b from private.capital_preview_body_bases where organization_id=j.organization_id and id=a.preview_body_basis_id;
 if b.run_id is distinct from r.id or b.task_run_id is distinct from tr.id or b.task_id is distinct from pt.task_id or b.kind is distinct from p_role
 or private.capital_preview_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id)is null or not private.capital_body_physical_receipt_v1(j.organization_id,p_retained_payload_id)then raise exception 'capital_preview_task_body_denied'using errcode='42501';end if;
 select *into x from private.capital_preview_task_projections where organization_id=j.organization_id and run_id=r.id and task_id=pt.task_id and role=p_role;
 if x.id is null then
 if tr.status<>'running'then raise exception 'capital_preview_task_denied'using errcode='42501';end if;
 foreach dep in array pt.dependencies loop
 if private.capital_preview_projection_deadline_v1(j.organization_id,r.id,j.authorization_subject_id,dep)is null then raise exception 'capital_preview_parent_denied'using errcode='42501';end if;
 select *into strict dx from private.capital_preview_task_projections where organization_id=j.organization_id and run_id=r.id and task_id=dep and role='task_output';
 deps:=deps||jsonb_build_array(jsonb_build_object('artifactId',dx.capital_artifact_id,'artifactFingerprint',dx.artifact_fingerprint));end loop;
 if exists(select 1 from private.capital_preview_recipes rr join private.capital_preview_recipe_seals ss on(ss.organization_id,ss.recipe_id)=(rr.organization_id,rr.id)where rr.organization_id=j.organization_id and rr.run_id=r.id and rr.plan_task_id=pt.id)and not exists(select 1 from private.capital_preview_recipes recipe join private.capital_preview_accepted_invocations accepted on(accepted.organization_id,accepted.recipe_id)=(recipe.organization_id,recipe.id)
 join private.capital_preview_body_bases parsed on(parsed.organization_id,parsed.accepted_invocation_id)=(accepted.organization_id,accepted.id)
 join private.capital_public_payload_allocations allocation on(allocation.organization_id,allocation.preview_body_basis_id)=(parsed.organization_id,parsed.id)
 join private.capital_public_retained_payloads retained on(retained.organization_id,retained.allocation_id)=(allocation.organization_id,allocation.id)
 where recipe.organization_id=j.organization_id and recipe.run_id=r.id and recipe.plan_task_id=pt.id and parsed.kind='accepted_parsed'and private.capital_body_physical_receipt_v1(j.organization_id,retained.id)
 and private.capital_preview_allocation_deadline_v1(j.organization_id,allocation.id,j.authorization_subject_id)is not null)then raise exception 'capital_preview_paid_parent_required'using errcode='42501';end if;
 typ:=case when p_role='decision_contract'then'preview_decision_contract'else(select step->>'artifactType'from jsonb_array_elements(private.capital_preview_workflow_v1(r.composition)->'steps')step where step->>'taskId'=pt.task_id)end;
 if typ is null or typ=''then raise exception 'capital_preview_output_type_missing'using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('capital-artifact:'||r.work_id::text||':'||typ,0));
 select coalesce(max(artifact_version),0)+1 into version from public.capital_project_artifacts where organization_id=j.organization_id and capital_project_id=r.work_id and artifact_type=typ;
 projection:=jsonb_build_object('schemaVersion','capital-preview-task-projection.v1','revisionId',rid,'runId',r.id,'taskId',pt.task_id,'role',p_role,'retainedPayloadId',p_retained_payload_id,'semanticFingerprint',b.semantic_fingerprint,'physicalSha256',a.payload_fingerprint,'byteLength',a.byte_length);
 fp:=encode(extensions.digest(projection::text,'sha256'),'hex');
 insert into private.capital_preview_task_projections(organization_id,work_id,run_id,task_id,task_run_id,role,capital_artifact_id,retained_payload_id,semantic_fingerprint,artifact_fingerprint,artifact_version)
 values(j.organization_id,r.work_id,r.id,pt.task_id,tr.id,p_role,aid,p_retained_payload_id,b.semantic_fingerprint,fp,version)returning*into x;
 insert into private.capital_preview_native_bindings(organization_id,work_id,run_id,projection_id,capital_artifact_id,revision_id,retained_payload_id,final_fingerprint)values(r.organization_id,r.work_id,r.id,x.id,aid,rid,p_retained_payload_id,b.semantic_fingerprint);
 manifest:=jsonb_build_object('schemaVersion','artifact-manifest.2026.09.26-v1','kind','work_product','audience','internal','format','json',
 'bytes',jsonb_build_object('sha256',a.payload_fingerprint,'byteLength',a.byte_length,'storage',jsonb_build_object('bucket',a.bucket_id,'path',a.object_path)),
 'method',null,'execution',null,'inputSnapshot',jsonb_build_object('fingerprint',tr.input_fingerprint),'institutionalResult',null,'sources','[]'::jsonb,'claims','[]'::jsonb,
 'traces',jsonb_build_array('capital-preview-run:'||r.id::text,'capital-preview-task:'||tr.id::text),'template',null,'provenance',jsonb_build_object('producer','capital-preview-native-producer.v1','jobId',j.id,'taskRunId',tr.id,'messageId',null,'capability',null),'legacy',null);
 revision_result:=private.create_artifact_revision_v1(r.organization_id,r.work_id,'work_product','Preview '||typ,'internal','worker',manifest,jsonb_build_array(jsonb_build_object('key','preview-result','kind','section','content',projection,'claims','[]'::jsonb)),'[]',a.payload_fingerprint,a.byte_length,null,null,r.human_subject_id,rid,true);
 insert into public.capital_project_artifacts(id,organization_id,capital_project_id,plan_id,task_run_id,artifact_type,schema_version,artifact_version,status,input_fingerprint,artifact_fingerprint,content,evidence_refs,dependencies,processing_job_id,created_by_kind)
 values(aid,j.organization_id,r.work_id,r.plan_id,tr.id,typ,'capital-preview-task-projection.v1',version,'draft',tr.input_fingerprint,fp,projection,'[]',deps,j.id,'worker');
 else
 if(x.task_run_id,x.retained_payload_id,x.semantic_fingerprint)is distinct from(tr.id,p_retained_payload_id,b.semantic_fingerprint)then raise exception 'capital_preview_task_conflict'using errcode='23505';end if;
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token)or private.capital_preview_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id)is null then raise exception 'capital_preview_task_denied'using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-preview-task-commit.v1','runId',r.id,'taskId',pt.task_id,'taskRunId',tr.id,'role',p_role,'capitalArtifactId',x.capital_artifact_id,'artifactFingerprint',x.artifact_fingerprint,'artifactVersion',x.artifact_version,'retainedPayloadId',x.retained_payload_id,'semanticFingerprint',x.semantic_fingerprint,'replayed',x.capital_artifact_id<>aid);
end;$$;
create function private.worker_revalidate_capital_preview_boundary_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)
returns jsonb language plpgsql security definer set search_path=''as $$
declare r private.capital_preview_recipes:=private.require_capital_preview_recipe_v1(p_job_id,p_capability_token,p_recipe_id);s private.capital_preview_recipe_seals;pt public.capital_project_plan_tasks;dep text;
begin
 select *into strict s from private.capital_preview_recipe_seals where organization_id=r.organization_id and recipe_id=r.id;
 select *into strict pt from public.capital_project_plan_tasks where organization_id=r.organization_id and id=r.plan_task_id;
 foreach dep in array pt.dependencies loop
 if private.capital_preview_projection_deadline_v1(r.organization_id,r.run_id,r.human_subject_id,dep)is null then raise exception 'capital_preview_parent_denied'using errcode='42501';end if;
 end loop;
 return jsonb_build_object('schemaVersion','capital-preview-boundary-receipt.v1','state','ready','recipeId',r.id,'boundaryId',r.id,'boundary',r.boundary,'jobId',r.job_id,'organizationId',r.organization_id,'workId',r.work_id,'planId',r.plan_id,'planTaskId',r.plan_task_id,'rendererVersion',r.renderer_version,
 'reconstructionFingerprint',s.reconstruction_fingerprint,'promptFingerprint',s.prompt_fingerprint,'primaryRequestFingerprint',s.primary_request_fingerprint,'fallbackRequestFingerprint',s.fallback_request_fingerprint,'inputRetainedPayloadId',s.input_retained_payload_id,'consumedBasisFingerprint',s.consumed_basis_fingerprint,
 'operationalBudget',jsonb_build_object('maxExposureMicroUsd',s.effective_budget_micro_usd,'maxDispatches',s.effective_max_dispatches),'expiresAt',r.expires_at);
end;$$;
create function private.worker_recover_capital_preview_accepted_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)
returns jsonb language plpgsql security definer set search_path=''as $$
declare r private.capital_preview_recipes:=private.require_capital_preview_recipe_v1(p_job_id,p_capability_token,p_recipe_id);accepted private.capital_preview_accepted_invocations;retained private.capital_public_retained_payloads;a private.capital_public_payload_allocations;
begin
 perform private.worker_revalidate_capital_preview_boundary_v1(p_job_id,p_capability_token,r.id);
 if exists(select 1 from private.capital_preview_execution_failures where organization_id=r.organization_id and recipe_id=r.id)then raise exception 'capital_preview_execution_failed_terminal'using errcode='42501';end if;
 select*into accepted from private.capital_preview_accepted_invocations where organization_id=r.organization_id and recipe_id=r.id;
 if accepted.id is null then return null;end if;
 select physical.*into retained from private.capital_public_retained_payloads physical join private.capital_public_payload_allocations allocation on(allocation.organization_id,allocation.id)=(physical.organization_id,physical.allocation_id)
 join private.capital_preview_body_bases b on(b.organization_id,b.id)=(allocation.organization_id,allocation.preview_body_basis_id)
 where b.organization_id=r.organization_id and b.run_id=r.run_id and b.recipe_id=r.id and b.kind='accepted_parsed'and b.accepted_invocation_id=accepted.id order by b.created_at limit 1;
 if retained.id is null then raise exception 'capital_preview_accepted_body_unavailable'using errcode='42501';end if;
 select*into strict a from private.capital_public_payload_allocations where organization_id=r.organization_id and id=retained.allocation_id;
 return jsonb_build_object('binding',jsonb_build_object('recipeId',r.id,'boundaryId',r.id,'invocationId',accepted.invocation_id,'inputReceiptId',accepted.input_receipt_id,'outputFingerprint',accepted.output_fingerprint),
 'scope',private.worker_read_capital_preview_allocation_v1(p_job_id,p_capability_token,a.id));
end;$$;
-- Public invoker wrappers expose only exact commands; private read/closure cores
-- remain unavailable, so an absent projection is never a substitute for denial.
create function public.worker_prepare_capital_preview_run_v1(p_job_id uuid,p_capability_token text,p_publisher_org uuid,p_basis_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.worker_prepare_capital_preview_run_v1(p_job_id,p_capability_token,p_publisher_org,p_basis_id);$$;
create function public.worker_prepare_capital_preview_body_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_request_id uuid,p_kind text,p_body jsonb,p_recipe_id uuid default null,p_file_name text default null,p_task_id text default null,p_task_run_id uuid default null,p_accepted_invocation_id uuid default null,p_semantic_fingerprint text default null)returns jsonb language sql security invoker set search_path=''as $$select private.worker_prepare_capital_preview_body_v1(p_job_id,p_capability_token,p_run_id,p_request_id,p_kind,p_body,p_recipe_id,p_file_name,p_task_id,p_task_run_id,p_accepted_invocation_id,p_semantic_fingerprint);$$;
create function public.worker_commit_capital_preview_body_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid,p_storage_object_id uuid,p_storage_version text,p_verified_sha256 text,p_verified_size bigint)returns jsonb language sql security invoker set search_path=''as $$select private.worker_commit_capital_preview_body_v1(p_job_id,p_capability_token,p_allocation_id,p_storage_object_id,p_storage_version,p_verified_sha256,p_verified_size);$$;
create function public.worker_read_capital_preview_allocation_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.worker_read_capital_preview_allocation_v1(p_job_id,p_capability_token,p_allocation_id);$$;
create function public.worker_prepare_capital_preview_boundary_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_boundary text)returns jsonb language sql security invoker set search_path=''as $$select private.worker_prepare_capital_preview_boundary_v1(p_job_id,p_capability_token,p_run_id,p_boundary);$$;
create function public.worker_seal_capital_preview_boundary_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_input_retained_payload_id uuid,p_model_input jsonb,p_pins jsonb,p_consumed_basis_fingerprint text)returns jsonb language sql security invoker set search_path=''as $$select private.worker_seal_capital_preview_boundary_v1(p_job_id,p_capability_token,p_recipe_id,p_input_retained_payload_id,p_model_input,p_pins,p_consumed_basis_fingerprint);$$;
create function public.worker_revalidate_capital_preview_boundary_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.worker_revalidate_capital_preview_boundary_v1(p_job_id,p_capability_token,p_recipe_id);$$;
create function public.worker_recover_capital_preview_accepted_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.worker_recover_capital_preview_accepted_v1(p_job_id,p_capability_token,p_recipe_id);$$;
create function public.worker_commit_capital_preview_task_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_task_run_id uuid,p_retained_payload_id uuid,p_role text)returns jsonb language sql security invoker set search_path=''as $$select private.worker_commit_capital_preview_task_v1(p_job_id,p_capability_token,p_run_id,p_task_run_id,p_retained_payload_id,p_role);$$;
create function private.worker_record_capital_preview_execution_failure_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=''as $$
declare r private.capital_preview_recipes:=private.require_capital_preview_recipe_v1(p_job_id,p_capability_token,p_recipe_id);seal private.capital_preview_recipe_seals;run private.capital_preview_runs;old private.capital_preview_execution_failures;
 ids uuid[];calls integer;boundary_calls integer;exposure bigint;bound bigint;proof boolean:=false;replayed boolean:=false;
begin
 perform private.lock_capital_preview_operation_v1(r.organization_id,r.id);
 select*into strict seal from private.capital_preview_recipe_seals where organization_id=r.organization_id and recipe_id=r.id;
 select*into strict run from private.capital_preview_runs where organization_id=r.organization_id and id=r.run_id;
 select coalesce(array_agg(o.id order by o.id),'{}'::uuid[])into ids from private.capital_preview_attempt_outcomes o join private.capital_preview_gateway_attempts a on(a.organization_id,a.id)=(o.organization_id,o.attempt_id)where a.organization_id=r.organization_id and a.recipe_id=r.id;
 select count(*),coalesce(sum(greatest(d.server_reservation_micro_usd,coalesce(o.cost_micro_usd,d.server_reservation_micro_usd))),0)into calls,exposure from private.capital_preview_input_dispatches d join private.capital_preview_operations operation on(operation.organization_id,operation.id)=(d.organization_id,d.operation_id)
 join private.capital_preview_recipes recipe on(recipe.organization_id,recipe.id)=(operation.organization_id,operation.recipe_id)left join private.capital_preview_attempt_outcomes o on(o.organization_id,o.input_receipt_id)=(d.organization_id,d.id)where recipe.organization_id=r.organization_id and recipe.run_id=r.run_id;
 select count(*)into boundary_calls from private.capital_preview_input_dispatches d join private.capital_preview_operations op on(op.organization_id,op.id)=(d.organization_id,d.operation_id)where op.organization_id=r.organization_id and op.recipe_id=r.id;
 bound:=(private.capital_preview_dispatch_policy_v1(r.boundary,'gpt-5.6-terra',seal.input_bytes)->>'serverBoundMicroUsd')::bigint;
 if boundary_calls=0 then bound:=least(bound,(private.capital_preview_dispatch_policy_v1(r.boundary,'claude-sonnet-5',seal.input_bytes)->>'serverBoundMicroUsd')::bigint);end if;
 if p_reason='accepted_body_unavailable'then
 proof:=exists(select 1 from private.capital_preview_accepted_invocations where organization_id=r.organization_id and recipe_id=r.id)and not exists(select 1 from private.capital_preview_body_bases b join private.capital_public_payload_allocations a on(a.organization_id,a.preview_body_basis_id)=(b.organization_id,b.id)join private.capital_public_retained_payloads q on(q.organization_id,q.allocation_id)=(a.organization_id,a.id)where b.organization_id=r.organization_id and b.recipe_id=r.id and b.kind='accepted_parsed'and private.capital_body_physical_receipt_v1(q.organization_id,q.id));
 elsif not exists(select 1 from private.capital_preview_accepted_invocations where organization_id=r.organization_id and recipe_id=r.id)and not exists(select 1 from private.capital_preview_attempt_outcomes o join private.capital_preview_gateway_attempts a on(a.organization_id,a.id)=(o.organization_id,o.attempt_id)where a.organization_id=r.organization_id and a.recipe_id=r.id and o.outcome='accepted')then
 if p_reason='processing_denied'then proof:=cardinality(ids)=0 and(select count(distinct used_provider_fallback)from private.capital_preview_gateway_attempts where organization_id=r.organization_id and recipe_id=r.id and not allowed)=2;
 elsif p_reason='budget_denied'then proof:=calls>=run.effective_max_dispatches or boundary_calls>=seal.effective_max_dispatches or exposure+bound>run.effective_budget_micro_usd;
 elsif p_reason='model_attempts_exhausted'then proof:=cardinality(ids)>0 and(boundary_calls>=seal.effective_max_dispatches or calls>=run.effective_max_dispatches or exposure+bound>run.effective_budget_micro_usd or exists(select 1 from private.capital_preview_gateway_attempts a join private.capital_preview_attempt_outcomes o on(o.organization_id,o.attempt_id)=(a.organization_id,a.id)where a.organization_id=r.organization_id and a.recipe_id=r.id and a.used_provider_fallback and o.outcome<>'accepted'));end if;
 end if;
 if proof is distinct from true then raise exception 'capital_preview_failure_proof_denied'using errcode='42501';end if;
 select*into old from private.capital_preview_execution_failures where organization_id=r.organization_id and recipe_id=r.id;
 if old.id is not null then if(old.reason,old.outcome_ids)is distinct from(p_reason,ids)then raise exception 'capital_preview_failure_conflict'using errcode='23505';end if;replayed:=true;
 else insert into private.capital_preview_execution_failures(organization_id,recipe_id,reason,outcome_ids)values(r.organization_id,r.id,p_reason,ids);end if;
 if not private.capital_public_capture_clock_current_v1(p_job_id,p_capability_token)then raise exception 'capital_preview_denied'using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-preview-boundary-failure.v1','recipeId',r.id,'boundaryId',r.id,'reason',p_reason,'replayed',replayed);
end;$$;
create function public.worker_record_capital_preview_execution_failure_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_reason text)returns jsonb language sql security invoker set search_path=''as $$select private.worker_record_capital_preview_execution_failure_v1(p_job_id,p_capability_token,p_recipe_id,p_reason);$$;

create table private.capital_preview_run_results(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,run_id uuid not null,
 consumed_basis_fingerprint text not null check(consumed_basis_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,run_id),foreign key(organization_id,run_id)references private.capital_preview_runs(organization_id,id));
create index capital_preview_result_run_idx on private.capital_preview_run_results(organization_id,run_id);
alter table private.capital_preview_run_results enable row level security;
alter table private.capital_preview_run_results force row level security;
create policy preview_result_select on private.capital_preview_run_results for select using(false);
create policy preview_result_insert on private.capital_preview_run_results for insert with check(false);
create policy preview_result_update on private.capital_preview_run_results for update using(false)with check(false);
create policy preview_result_delete on private.capital_preview_run_results for delete using(false);
revoke all on private.capital_preview_run_results from public,anon,authenticated,service_role;
create trigger preview_result_immutable before update or delete on private.capital_preview_run_results for each row execute function private.reject_source_version_mutation_v1();
create trigger preview_result_no_truncate before truncate on private.capital_preview_run_results for each statement execute function private.reject_review_history_mutation_v1();
create trigger preview_result_audit after insert on private.capital_preview_run_results for each row execute function private.capture_identity_audit_v1();
create function private.capital_preview_usage_v1(p_org uuid,p_run uuid,p_recipe uuid default null)returns jsonb language sql stable security definer set search_path=''as $$
 select jsonb_build_object('modelCalls',count(*),'costUsd',coalesce(sum(o.cost_micro_usd),0)::numeric/1000000,'unknownCostCalls',count(*)filter(where o.cost_micro_usd is null),
 'latencyMs',coalesce(sum((o.observation->>'latencyMillis')::bigint),0))from private.capital_preview_input_dispatches d
 join private.capital_preview_operations op on(op.organization_id,op.id)=(d.organization_id,d.operation_id)
 join private.capital_preview_recipes r on(r.organization_id,r.id)=(op.organization_id,op.recipe_id)
 left join private.capital_preview_attempt_outcomes o on(o.organization_id,o.input_receipt_id)=(d.organization_id,d.id)
 where r.organization_id=p_org and r.run_id=p_run and(p_recipe is null or r.id=p_recipe);
$$;
create function private.worker_capital_preview_boundary_usage_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare r private.capital_preview_recipes:=private.require_capital_preview_recipe_v1(p_job_id,p_capability_token,p_recipe_id);model text;
begin
 perform private.worker_revalidate_capital_preview_boundary_v1(p_job_id,p_capability_token,r.id);
 select a.accepted_identity->>'reportedModel'into model from private.capital_preview_accepted_invocations a where a.organization_id=r.organization_id and a.recipe_id=r.id;
 if model is null then raise exception 'capital_preview_accepted_required'using errcode='42501';end if;
 return private.capital_preview_usage_v1(r.organization_id,r.run_id,r.id)||jsonb_build_object('model',model);
end;$$;
create function private.worker_finish_capital_preview_task_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_task_run_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare r private.capital_preview_runs:=private.require_capital_preview_run_v1(p_job_id,p_capability_token,p_run_id,true);tr public.capital_project_task_runs;x private.capital_preview_task_projections;
begin
 select*into tr from public.capital_project_task_runs where organization_id=r.organization_id and id=p_task_run_id for update;
 select*into x from private.capital_preview_task_projections where organization_id=r.organization_id and run_id=r.id and task_run_id=tr.id and role='task_output';
 if x.id is null or tr.processing_job_id<>r.job_id or tr.status not in('running','succeeded')then raise exception 'capital_preview_task_denied'using errcode='42501';end if;
 if x.task_id=(private.capital_preview_workflow_v1(r.composition)->'steps'-> -1 ->>'taskId')and not exists(select 1 from private.capital_preview_task_projections contract where contract.organization_id=r.organization_id and contract.run_id=r.id and contract.task_run_id=tr.id and contract.role='decision_contract'and private.capital_body_physical_receipt_v1(r.organization_id,contract.retained_payload_id))then raise exception 'capital_preview_contract_missing'using errcode='42501';end if;
 if exists(select 1 from private.capital_preview_recipes recipe join private.capital_preview_execution_failures f on(f.organization_id,f.recipe_id)=(recipe.organization_id,recipe.id)where recipe.organization_id=r.organization_id and recipe.run_id=r.id and recipe.plan_task_id=tr.plan_task_id)then raise exception 'capital_preview_execution_failed_terminal'using errcode='42501';end if;
 update public.capital_project_task_runs set status='succeeded',completed_at=coalesce(completed_at,clock_timestamp()),output_reference=jsonb_build_object('type','capital_project_artifact','id',x.capital_artifact_id),output_fingerprint=x.artifact_fingerprint,
 quality_results=jsonb_build_array(jsonb_build_object('id','bounded_output','passed',true)),usage='{}',error=null where organization_id=r.organization_id and id=tr.id;
 if private.capital_preview_projection_deadline_v1(r.organization_id,r.id,r.human_subject_id,x.task_id)is null then raise exception 'capital_preview_task_denied'using errcode='42501';end if;
 return jsonb_build_object('finished',true);
end;$$;
create function private.worker_finalize_capital_preview_run_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_consumed_basis jsonb)returns jsonb language plpgsql security definer set search_path=''as $$
declare r private.capital_preview_runs:=private.require_capital_preview_run_v1(p_job_id,p_capability_token,p_run_id,true);step jsonb;input_pin jsonb;old private.capital_preview_run_results;last_task text;
begin
 if jsonb_typeof(p_consumed_basis)is distinct from'object'or p_consumed_basis->>'schemaVersion'is distinct from'capital-preview-consumed-basis.v1'or p_consumed_basis->>'composition'is distinct from r.composition or jsonb_typeof(p_consumed_basis->'fingerprint')is distinct from'string'or p_consumed_basis->>'fingerprint'!~'^[a-f0-9]{64}$'
 or p_consumed_basis-array['schemaVersion','composition','inputFingerprints','anchors','entries','fingerprint']<>'{}'::jsonb or jsonb_typeof(p_consumed_basis->'inputFingerprints')is distinct from'array'or jsonb_typeof(p_consumed_basis->'anchors')is distinct from'array'
 or p_consumed_basis->'entries'is distinct from private.capital_preview_consumed_corpus_registry_v1()->'entries'
 or jsonb_array_length(p_consumed_basis->'inputFingerprints')<>jsonb_array_length(private.capital_preview_workflow_v1(r.composition)->'steps')then raise exception 'capital_preview_final_basis_denied'using errcode='42501';end if;
 for step in select value from jsonb_array_elements(private.capital_preview_workflow_v1(r.composition)->'steps')loop
 last_task:=step->>'taskId';if private.capital_preview_projection_deadline_v1(r.organization_id,r.id,r.human_subject_id,last_task)is null then raise exception 'capital_preview_result_incomplete'using errcode='42501';end if;
 select value into input_pin from jsonb_array_elements(p_consumed_basis->'inputFingerprints')where value->>'taskId'=last_task;
 if input_pin is null or not exists(select 1 from private.capital_preview_body_bases b join private.capital_public_payload_allocations a on(a.organization_id,a.preview_body_basis_id)=(b.organization_id,b.id)join private.capital_public_retained_payloads q on(q.organization_id,q.allocation_id)=(a.organization_id,a.id)
 where b.organization_id=r.organization_id and b.run_id=r.id and b.task_id=last_task and b.kind='actual_input'and b.semantic_fingerprint=input_pin->>'fingerprint'and private.capital_body_physical_receipt_v1(r.organization_id,q.id)and private.capital_preview_allocation_deadline_v1(r.organization_id,a.id,r.human_subject_id)is not null)then raise exception 'capital_preview_actual_input_missing'using errcode='42501';end if;
 end loop;
 if not exists(select 1 from private.capital_preview_task_projections x join private.capital_public_retained_payloads q on(q.organization_id,q.id)=(x.organization_id,x.retained_payload_id)join private.capital_public_payload_allocations a on(a.organization_id,a.id)=(q.organization_id,q.allocation_id)
 where x.organization_id=r.organization_id and x.run_id=r.id and x.task_id=last_task and x.role='decision_contract'and private.capital_body_physical_receipt_v1(r.organization_id,q.id)and private.capital_preview_allocation_deadline_v1(r.organization_id,a.id,r.human_subject_id)is not null)then raise exception 'capital_preview_contract_missing'using errcode='42501';end if;
 select*into old from private.capital_preview_run_results where organization_id=r.organization_id and run_id=r.id;
 if old.id is null then insert into private.capital_preview_run_results(organization_id,run_id,consumed_basis_fingerprint)values(r.organization_id,r.id,p_consumed_basis->>'fingerprint');
 elsif old.consumed_basis_fingerprint<>p_consumed_basis->>'fingerprint'then raise exception 'capital_preview_final_basis_conflict'using errcode='23505';end if;
 return jsonb_build_object('completed',true,'runId',r.id);
end;$$;
create function private.worker_recover_capital_preview_run_v1(p_job_id uuid,p_capability_token text,p_run_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare r private.capital_preview_runs:=private.require_capital_preview_run_v1(p_job_id,p_capability_token,p_run_id,false);result private.capital_preview_run_results;refs jsonb:='[]';x private.capital_preview_task_projections;last_task text;expected integer;
begin
 select*into result from private.capital_preview_run_results where organization_id=r.organization_id and run_id=r.id;
 if result.id is null and not exists(select 1 from private.capital_preview_task_projections where organization_id=r.organization_id and run_id=r.id)then return jsonb_build_object('state','absent');end if;
 perform private.require_capital_preview_run_v1(p_job_id,p_capability_token,r.id,true);
 expected:=jsonb_array_length(private.capital_preview_workflow_v1(r.composition)->'steps')+1;
 for x in select*from private.capital_preview_task_projections where organization_id=r.organization_id and run_id=r.id order by task_id,role loop
 if not exists(select 1 from public.capital_project_task_runs t join public.capital_project_artifacts c on(c.organization_id,c.id)=(t.organization_id,x.capital_artifact_id)where t.organization_id=x.organization_id and t.id=x.task_run_id and t.processing_job_id=p_job_id and t.status in('running','succeeded')and c.artifact_fingerprint=x.artifact_fingerprint and c.task_run_id=t.id)or not private.capital_body_physical_receipt_v1(r.organization_id,x.retained_payload_id)then raise exception 'capital_preview_recovery_denied'using errcode='42501';end if;
 refs:=refs||jsonb_build_array(jsonb_build_object('taskId',x.task_id,'role',x.role,'capitalArtifactId',x.capital_artifact_id,'artifactFingerprint',x.artifact_fingerprint,'taskRunId',x.task_run_id,'status',(select status from public.capital_project_task_runs where organization_id=x.organization_id and id=x.task_run_id),'semanticFingerprint',x.semantic_fingerprint,
 'scope',(select private.worker_read_capital_preview_allocation_v1(p_job_id,p_capability_token,q.allocation_id)from private.capital_public_retained_payloads q where q.organization_id=r.organization_id and q.id=x.retained_payload_id)));
 end loop;
 if result.id is null then return jsonb_build_object('state','partial','runId',r.id,'refs',refs,'usage',private.capital_preview_usage_v1(r.organization_id,r.id));end if;
 if jsonb_array_length(refs)<>expected then raise exception 'capital_preview_recovery_incomplete'using errcode='42501';end if;
 return jsonb_build_object('state','completed','runId',r.id,'refs',refs,'consumedBasisFingerprint',result.consumed_basis_fingerprint,'usage',private.capital_preview_usage_v1(r.organization_id,r.id));
end;$$;
create function public.worker_finish_capital_preview_task_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_task_run_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.worker_finish_capital_preview_task_v1(p_job_id,p_capability_token,p_run_id,p_task_run_id);$$;
create function public.worker_finalize_capital_preview_run_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_consumed_basis jsonb)returns jsonb language sql security invoker set search_path=''as $$select private.worker_finalize_capital_preview_run_v1(p_job_id,p_capability_token,p_run_id,p_consumed_basis);$$;
create function public.worker_recover_capital_preview_run_v1(p_job_id uuid,p_capability_token text,p_run_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.worker_recover_capital_preview_run_v1(p_job_id,p_capability_token,p_run_id);$$;
create function public.worker_capital_preview_boundary_usage_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.worker_capital_preview_boundary_usage_v1(p_job_id,p_capability_token,p_recipe_id);$$;

create function private.guard_capital_preview_native_writer_v1()returns trigger language plpgsql security definer set search_path=''as $$
declare j public.processing_jobs;x private.capital_preview_task_projections;b private.capital_preview_native_bindings;
begin
 select*into j from public.processing_jobs where organization_id=new.organization_id and id=new.processing_job_id;
 if j.payload->>'analysis_scope'is distinct from'integration_preview'then return new;end if;
 if tg_table_name='capital_project_artifacts'then
 select*into x from private.capital_preview_task_projections where organization_id=new.organization_id and capital_artifact_id=new.id;
 select*into b from private.capital_preview_native_bindings where organization_id=new.organization_id and capital_artifact_id=new.id;
 if x.id is null or b.id is null or new.content is distinct from jsonb_build_object('schemaVersion','capital-preview-task-projection.v1','revisionId',b.revision_id,'runId',x.run_id,'taskId',x.task_id,'role',x.role,'retainedPayloadId',x.retained_payload_id,'semanticFingerprint',x.semantic_fingerprint,
 'physicalSha256',(select a.payload_fingerprint from private.capital_public_retained_payloads q join private.capital_public_payload_allocations a on(a.organization_id,a.id)=(q.organization_id,q.allocation_id)where q.organization_id=x.organization_id and q.id=x.retained_payload_id),
 'byteLength',(select a.byte_length from private.capital_public_retained_payloads q join private.capital_public_payload_allocations a on(a.organization_id,a.id)=(q.organization_id,q.allocation_id)where q.organization_id=x.organization_id and q.id=x.retained_payload_id))or new.artifact_fingerprint is distinct from x.artifact_fingerprint or new.task_run_id is distinct from x.task_run_id or new.schema_version is distinct from'capital-preview-task-projection.v1'then raise exception 'capital_preview_native_projection_required'using errcode='42501';end if;
 elsif new.status='succeeded'then
 if exists(select 1 from private.capital_preview_runs run join public.capital_project_plan_tasks pt on(pt.organization_id,pt.id)=(new.organization_id,new.plan_task_id)where run.organization_id=new.organization_id and run.job_id=new.processing_job_id and pt.task_id=(private.capital_preview_workflow_v1(run.composition)->'steps'-> -1 ->>'taskId')and not exists(select 1 from private.capital_preview_task_projections contract where contract.organization_id=run.organization_id and contract.run_id=run.id and contract.task_run_id=new.id and contract.role='decision_contract'and private.capital_body_physical_receipt_v1(run.organization_id,contract.retained_payload_id)))then raise exception 'capital_preview_contract_missing'using errcode='42501';end if;
 select*into x from private.capital_preview_task_projections where organization_id=new.organization_id and task_run_id=new.id and role='task_output';
 if x.id is null or new.output_reference is distinct from jsonb_build_object('type','capital_project_artifact','id',x.capital_artifact_id)or new.output_fingerprint is distinct from x.artifact_fingerprint or new.usage<>'{}'::jsonb or new.error is not null or new.quality_results is distinct from jsonb_build_array(jsonb_build_object('id','bounded_output','passed',true))then raise exception 'capital_preview_native_completion_required'using errcode='42501';end if;
 end if;return new;
end;$$;
create trigger preview_native_artifact_guard before insert or update of content,artifact_fingerprint,task_run_id on public.capital_project_artifacts for each row execute function private.guard_capital_preview_native_writer_v1();
create trigger preview_native_task_guard before update of status,output_reference,output_fingerprint on public.capital_project_task_runs for each row execute function private.guard_capital_preview_native_writer_v1();
alter function private.artifact_review_sources_allowed_v1(uuid,uuid,uuid)rename to artifact_review_sources_allowed_pre_preview_v1;
create function private.artifact_review_sources_allowed_v1(p_org uuid,p_revision uuid,p_subject uuid)returns boolean language plpgsql volatile security definer set search_path=''as $$
begin
 if not private.capital_preview_native_read_allowed_v1(p_org,p_revision,p_subject)then return false;end if;
 return private.artifact_review_sources_allowed_pre_preview_v1(p_org,p_revision,p_subject);end;$$;
revoke all on function private.artifact_review_sources_allowed_pre_preview_v1(uuid,uuid,uuid)from public,anon,authenticated,service_role;

-- Locate the original substance core explicitly, preserving all wrappers.
do $$declare def text;matches integer;needle text:='if not has_substance then raise exception ''review_substance_required''';begin
 select count(*),max(pg_get_functiondef(p.oid))into matches,def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'and p.proname like 'review_artifact_revision%'and p.proargtypes='2950 25 25 2950 25 16 2950 2950'::oidvector and position(needle in p.prosrc)>0;
 if matches<>1 then raise exception 'capital_preview_review_substance_core_ambiguous';end if;
 execute replace(def,needle,'if not has_substance and exists(select 1 from private.capital_preview_native_bindings where(organization_id,revision_id)=(org,r.id)) then has_substance:=private.capital_preview_native_read_allowed_v1(org,r.id,actor);end if; '||needle);
end;$$;
revoke all on function private.artifact_revision_release_v1(public.artifact_revisions),private.artifact_review_sources_allowed_v1(uuid,uuid,uuid),private.project_legacy_artifact_revision_v1(text,uuid,uuid)from public,anon,authenticated,service_role;

do $$declare f record;begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private')and p.proname like '%capital_preview%'loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 if f.proname in('read_capital_preview_result_body_v1','worker_finish_capital_preview_task_v1','worker_finalize_capital_preview_run_v1','worker_recover_capital_preview_run_v1','worker_capital_preview_boundary_usage_v1','worker_record_capital_preview_execution_failure_v1','publish_capital_preview_consumed_basis_v1','worker_prepare_capital_preview_run_v1','worker_prepare_capital_preview_body_v1','worker_commit_capital_preview_body_v1','worker_read_capital_preview_allocation_v1','worker_prepare_capital_preview_boundary_v1','worker_seal_capital_preview_boundary_v1','worker_revalidate_capital_preview_boundary_v1','worker_recover_capital_preview_accepted_v1','worker_commit_capital_preview_task_v1','worker_authorize_capital_preview_processing_v1','worker_record_capital_preview_input_v1','worker_record_capital_preview_attempt_outcome_v1','worker_record_capital_preview_accepted_v1')then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end;$$;

create function private.worker_lookup_capital_preview_boundary_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_boundary text)returns jsonb language plpgsql security definer set search_path=''as $$
declare r private.capital_preview_runs:=private.require_capital_preview_run_v1(p_job_id,p_capability_token,p_run_id,true);recipe private.capital_preview_recipes;begin
 if p_boundary not in('questions','synthesis')then raise exception 'capital_preview_boundary_invalid'using errcode='22023';end if;
 select*into recipe from private.capital_preview_recipes where organization_id=r.organization_id and run_id=r.id and boundary=p_boundary;
 if recipe.id is null then raise exception 'capital_preview_boundary_unavailable'using errcode='42501';end if;
 perform private.require_capital_preview_recipe_v1(p_job_id,p_capability_token,recipe.id);return jsonb_build_object('recipeId',recipe.id);end;$$;
create function public.worker_lookup_capital_preview_boundary_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_boundary text)returns jsonb language sql security invoker set search_path=''as $$select private.worker_lookup_capital_preview_boundary_v1(p_job_id,p_capability_token,p_run_id,p_boundary);$$;
revoke all on function private.worker_lookup_capital_preview_boundary_v1(uuid,text,uuid,text),public.worker_lookup_capital_preview_boundary_v1(uuid,text,uuid,text)from public,anon,authenticated,service_role;
grant execute on function private.worker_lookup_capital_preview_boundary_v1(uuid,text,uuid,text),public.worker_lookup_capital_preview_boundary_v1(uuid,text,uuid,text)to authenticated;

-- Human review resolves the actual private CPA↔revision bridge. A generated
-- preview never gains an approval merely because the body is physically ready.
create function private.read_capital_preview_review_basis_v1(p_project_id uuid,p_artifact_id uuid,p_revision_id uuid)returns jsonb language plpgsql volatile security definer set search_path=''as $$
declare org uuid;actor uuid:=auth.uid();binding private.capital_preview_native_bindings;run private.capital_preview_runs;c public.capital_project_artifacts;revision public.artifact_revisions;active boolean;begin
 select organization_id into org from public.capital_projects where id=p_project_id and status<>'archived';
 if org is null or not private.can_access_resource_v1(org,p_project_id,'read')then raise exception 'capital_artifact_review_denied'using errcode='42501';end if;
 select*into binding from private.capital_preview_native_bindings where organization_id=org and work_id=p_project_id and capital_artifact_id=p_artifact_id and revision_id=p_revision_id;
 select*into run from private.capital_preview_runs where organization_id=org and id=binding.run_id;
 select*into c from public.capital_project_artifacts where organization_id=org and id=p_artifact_id and capital_project_id=p_project_id;
 select*into revision from public.artifact_revisions where organization_id=org and id=p_revision_id;
 if binding.id is null or run.id is null or c.id is null or revision.id is null or not private.capital_preview_native_read_allowed_v1(org,revision.id,actor)then raise exception 'capital_artifact_review_basis_unproven'using errcode='42501';end if;
 active:=private.capital_artifact_approval_active_v2(org,revision.id);
 return jsonb_build_object('projectId',p_project_id,'artifactId',c.id,'revisionId',revision.id,'manifestFingerprint',revision.manifest_fingerprint,'artifactFingerprint',c.artifact_fingerprint,'artifactType',c.artifact_type,'artifactVersion',c.artifact_version,'preparedBy',run.human_subject_id,'viewerId',actor,'workAccess',private.can_access_resource_v1(org,p_project_id,'work'),'policy',private.review_policy_snapshot_v1(org,p_project_id,actor),'status',case when c.status in('confirmed','approved')and not active then 'pending_confirmation'else c.status end,'approvalActive',active,'sourceCount',17);
end;$$;
alter function private.read_capital_project_artifact_review_v2(uuid,uuid,uuid)rename to read_capital_project_artifact_review_before_preview_v2;
create function private.read_capital_project_artifact_review_v2(p_project_id uuid,p_artifact_id uuid,p_revision_id uuid)returns jsonb language plpgsql volatile security definer set search_path=''as $$begin
 if exists(select 1 from private.capital_preview_native_bindings where work_id=p_project_id and capital_artifact_id=p_artifact_id and revision_id=p_revision_id)then return private.read_capital_preview_review_basis_v1(p_project_id,p_artifact_id,p_revision_id);end if;
 return private.read_capital_project_artifact_review_before_preview_v2(p_project_id,p_artifact_id,p_revision_id);end;$$;
revoke all on function private.read_capital_preview_review_basis_v1(uuid,uuid,uuid),private.read_capital_project_artifact_review_before_preview_v2(uuid,uuid,uuid),private.read_capital_project_artifact_review_v2(uuid,uuid,uuid)from public,anon,authenticated,service_role;
grant execute on function private.read_capital_project_artifact_review_v2(uuid,uuid,uuid)to authenticated;
