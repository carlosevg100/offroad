-- 3S prospective physical consumer. Assemble after capture and plan contracts.
set search_path='';
create function private.worker_capture_material_production_v1(p_job_id uuid,p_capability_token text,p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.material_production_job_v1(p_job_id,p_capability_token);r private.material_production_recipes;pa private.material_production_plan_approvals;pc private.material_production_plan_precursors;plan public.deal_state_objects;policy private.capital_public_retention_policies;execution public.controlled_case_executions;d public.source_documents;v public.source_versions;rights private.source_rights_versions;body jsonb;fp text;closure text;prepared jsonb;stamp timestamptz:=clock_timestamp();op text;
begin
 if p_request_id is null or j.payload->>'incremental_trigger' is distinct from 'production_plan_approved' then raise exception 'material_production_plan_job_required' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('material-capture:'||j.organization_id::text||':'||j.id::text,0)) then raise exception 'material_production_retry' using errcode='40001';end if;
 select * into pa from private.material_production_plan_approvals where(organization_id,effect_job_id)=(j.organization_id,j.id);
 select * into pc from private.material_production_plan_precursors where(organization_id,id)=(j.organization_id,pa.precursor_id);
 select * into plan from public.deal_state_objects where(organization_id,id,intake_session_id)=(j.organization_id,pa.approved_plan_id,j.intake_session_id);
 if pc.id is null or plan.id is null or pa.actor_id is distinct from j.authorization_subject_id or plan.status<>'approved' or plan.object_fingerprint is distinct from pa.approved_plan_fingerprint or j.payload->>'trigger_fingerprint' is distinct from plan.object_fingerprint or not private.material_plan_precursor_current_v1(j.organization_id,pc.id,j.authorization_subject_id) then raise exception 'material_production_plan_unproven' using errcode='42501';end if;
 select * into execution from public.controlled_case_executions where(organization_id,id,intake_session_id,processing_run_id)=(j.organization_id,j.controlled_execution_id,j.intake_session_id,j.processing_run_id) for update nowait;
 if execution.id is null or execution.mode<>'primary' or execution.baseline_execution_id is not null then raise exception 'material_production_primary_execution_required' using errcode='42501';end if;
 if exists(select 1 from private.case_execution_inputs where(organization_id,execution_id)=(j.organization_id,execution.id)) then raise exception 'material_production_legacy_input_denied' using errcode='42501';end if;
 body:=private.material_production_live_inputs_v1(j.id,p_capability_token);
 body:=body||jsonb_build_object('material_reference_date',to_char(j.created_at at time zone 'UTC','YYYY-MM-DD'));
 body:=body||jsonb_build_object('_execution',jsonb_build_object('id',execution.id,'mode',execution.mode,'input_fingerprint',encode(extensions.digest(body::text,'sha256'),'hex'),'pipeline_version',execution.pipeline_version,'model_policy_version',execution.model_policy_version));
 fp:=private.material_production_input_fingerprint_v1(j.organization_id,j.intake_session_id,plan.id);
 select * into r from private.material_production_recipes where(organization_id,producer_job_id)=(j.organization_id,j.id);
 if r.id is not null then
 if r.input_fingerprint<>fp or r.context_fingerprint<>encode(extensions.digest(body::text,'sha256'),'hex') or not private.material_production_sources_current_v1(j.organization_id,r.id,j.authorization_subject_id) then raise exception 'material_production_capture_changed' using errcode='42501';end if;
 prepared:=private.material_production_allocate_v1(j.id,p_capability_token,r.id,p_request_id,'context',body);
 return jsonb_build_object('receipt',private.material_production_capture_dto_v1(j.organization_id,r.id),'canonicalBody',prepared->>'canonicalBody');
 end if;
 select p.* into policy from private.capital_public_retention_controls c join private.capital_public_retention_policies p on p.id=c.policy_id where c.singleton and c.enabled;
 if policy.id is null or not private.capital_public_retention_healthy_v1(j.leased_by,policy.id) then raise exception 'material_production_retention_unavailable' using errcode='42501';end if;
 -- Closure is exactly the consumed private corpus. Public research is fixed in
 -- its separate licensed-delivery phase before model/compiler dispatch.
 select encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_array(doc.id,right_pin.id,doc.document_version,version_row.declared_sha256) order by doc.id),'[]'::jsonb)::text,'sha256'),'hex') into closure
 from public.source_documents doc join public.source_versions version_row on(version_row.organization_id,version_row.id)=(doc.organization_id,doc.id)
 join lateral(select id from private.source_rights_versions where organization_id=doc.organization_id and source_version_id=doc.id order by revision desc limit 1) right_pin on true
 where doc.organization_id=j.organization_id and doc.intake_session_id=j.intake_session_id;
 insert into private.material_production_recipes(organization_id,work_id,session_id,producer_job_id,controlled_execution_id,production_plan_id,production_plan_version,production_plan_fingerprint,human_subject_id,worker_account_id,input_fingerprint,context_fingerprint,source_closure_fingerprint,calculation_version,renderer_version,retention_policy_id,captured_at,expires_at)
 values(j.organization_id,pc.work_id,j.intake_session_id,j.id,execution.id,plan.id,plan.object_version,plan.object_fingerprint,j.authorization_subject_id,auth.uid(),fp,encode(extensions.digest(body::text,'sha256'),'hex'),closure,'2026.09.10-v17','capital-material-package.v1',policy.id,stamp,stamp+make_interval(secs=>policy.maximum_retention_seconds)) returning * into r;
 for d in select * from public.source_documents where organization_id=j.organization_id and intake_session_id=j.intake_session_id order by id for share nowait loop
 select * into v from public.source_versions where(organization_id,id)=(j.organization_id,d.id) for share nowait;
 select * into rights from private.source_rights_versions where organization_id=j.organization_id and source_version_id=d.id order by revision desc limit 1 for share nowait;
 if v.id is null or rights.id is null or v.declared_sha256 is null or v.declared_sha256 is distinct from d.sha256 then raise exception 'material_production_source_unproven' using errcode='42501';end if;
 foreach op in array array['read','process','store','derive'] loop if not private.source_use_allowed_v1(j.organization_id,d.id,j.authorization_subject_id,op,'analysis') then raise exception 'material_production_source_denied' using errcode='42501';end if;end loop;
 insert into private.material_production_source_pins(organization_id,recipe_id,source_version_id,rights_version_id,document_version,declared_sha256) values(j.organization_id,r.id,d.id,rights.id,d.document_version,v.declared_sha256);
 end loop;
 prepared:=private.material_production_allocate_v1(j.id,p_capability_token,r.id,p_request_id,'context',body);
 update public.controlled_case_executions set status='running',input_fingerprint=r.context_fingerprint,started_at=coalesce(started_at,stamp) where(organization_id,id)=(j.organization_id,execution.id);
 return jsonb_build_object('receipt',private.material_production_capture_dto_v1(j.organization_id,r.id),'canonicalBody',prepared->>'canonicalBody');
end$$;
revoke all on function private.worker_capture_material_production_v1(uuid,text,uuid) from public,anon,authenticated,service_role;

create function private.material_production_commit_dto_v1(p_org uuid,p_recipe uuid,p_replayed boolean)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion','capital-material-commit.v1','recipeId',r.id,'workId',r.work_id,'productionPlanId',r.production_plan_id,'materialObjectId',b.material_object_id,'revisionId',b.revision_id,'reportRetainedPayloadId',b.report_retained_payload_id,'stateRetainedPayloadId',b.state_retained_payload_id,'packageRetainedPayloadId',b.package_retained_payload_id,'bundleFingerprint',b.bundle_fingerprint,'replayed',p_replayed) from private.material_production_recipes r join private.material_production_bindings b on(b.organization_id,b.recipe_id)=(r.organization_id,r.id) where(r.organization_id,r.id)=(p_org,p_recipe);
$$;
create function private.material_production_commit_core_v1(p_org uuid,p_recipe uuid,p_report uuid,p_state uuid,p_package uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.material_production_recipes;b private.material_production_bindings;q private.capital_public_retained_payloads;a private.capital_public_payload_allocations;body private.material_production_body_bases;report_allocation private.capital_public_payload_allocations;state_allocation private.capital_public_payload_allocations;package_allocation private.capital_public_payload_allocations;retained uuid;kind text;bundle_fp text;projection jsonb;manifest jsonb;artifact public.artifacts;head public.artifact_revisions;revision uuid:=gen_random_uuid();material_id uuid;stamp timestamptz:=clock_timestamp();ref jsonb;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('material-production:'||p_org::text||':'||p_recipe::text,0)) then raise exception 'material_production_retry' using errcode='40001';end if;
 select * into r from private.material_production_recipes where(organization_id,id)=(p_org,p_recipe);
 if r.id is null or not exists(select 1 from private.material_production_research_seals where(organization_id,recipe_id)=(p_org,r.id)) or not exists(select 1 from private.material_production_seals where(organization_id,recipe_id)=(p_org,r.id)) or private.material_production_deadline_v1(p_org,r.id,r.human_subject_id) is null then raise exception 'material_production_commit_denied' using errcode='42501';end if;
 foreach retained in array array[p_report,p_state,p_package] loop
 select * into q from private.capital_public_retained_payloads where(organization_id,id)=(p_org,retained);
 select * into a from private.capital_public_payload_allocations where(organization_id,id,content_kind)=(p_org,q.allocation_id,'material_body');
 select * into body from private.material_production_body_bases where(organization_id,id,recipe_id)=(p_org,a.material_body_basis_id,r.id);
 kind:=case retained when p_report then 'calculation_report' when p_state then 'case_state' when p_package then 'material_package' end;
 if body.kind is distinct from kind or not private.capital_body_physical_receipt_v1(p_org,retained) or private.material_production_allocation_deadline_v1(p_org,a.id,r.human_subject_id) is null then raise exception 'material_production_commit_physical_proof_denied' using errcode='42501';end if;
 perform private.require_capital_body_retention_ready_v1(a.policy_id,p_org,a.id);
 if kind='calculation_report' then if body.report_status is distinct from 'succeeded' then raise exception 'material_production_unsuccessful_report_denied' using errcode='42501';end if;report_allocation:=a;elsif kind='case_state' then state_allocation:=a;else package_allocation:=a;end if;
 end loop;
 bundle_fp:=encode(extensions.digest(jsonb_build_array('capital-material-bundle.v1',r.id,r.context_fingerprint,r.production_plan_fingerprint,r.calculation_version,r.renderer_version,(select source_fingerprint from private.material_production_research_seals where organization_id=p_org and recipe_id=r.id),report_allocation.payload_fingerprint,state_allocation.payload_fingerprint,package_allocation.payload_fingerprint)::text,'sha256'),'hex');
 select * into b from private.material_production_bindings where(organization_id,recipe_id)=(p_org,r.id);
 if b.id is not null then
 if(b.report_retained_payload_id,b.state_retained_payload_id,b.package_retained_payload_id,b.bundle_fingerprint) is distinct from(p_report,p_state,p_package,bundle_fp) then raise exception 'material_production_commit_conflict' using errcode='23505';end if;
 return private.material_production_commit_dto_v1(p_org,r.id,true);
 end if;
 perform 1 from public.document_intake_sessions where(organization_id,id)=(p_org,r.session_id) for update nowait;
 if exists(select 1 from public.deal_state_objects where organization_id=p_org and intake_session_id=r.session_id and object_type='material_artifact' and status in('confirmed','approved')) then raise exception 'material_production_confirmed_requires_invalidation' using errcode='42501';end if;
 select product.* into artifact from public.artifacts product where product.organization_id=p_org and product.work_id=r.work_id and product.kind='work_product' and product.subject='Material production package' for update;
 if artifact.id is null then insert into public.artifacts(organization_id,work_id,kind,subject) values(p_org,r.work_id,'work_product','Material production package') returning * into artifact;end if;
 select * into head from public.artifact_revisions where(organization_id,id)=(p_org,artifact.head_revision_id);
 projection:=jsonb_build_object('schemaVersion','capital-material-projection.v1','revisionId',revision,'recipeId',r.id,'bundleFingerprint',bundle_fp,'physicalSha256',package_allocation.payload_fingerprint,'byteLength',package_allocation.byte_length);
 manifest:=jsonb_build_object('schemaVersion','artifact-manifest.2026.09.26-v1','kind','work_product','audience','internal','format','json','bytes',jsonb_build_object('sha256',package_allocation.payload_fingerprint,'byteLength',package_allocation.byte_length,'storage',jsonb_build_object('bucket',package_allocation.bucket_id,'path',package_allocation.object_path)),'method',null,'execution',null,'inputSnapshot',jsonb_build_object('fingerprint',r.context_fingerprint),'institutionalResult',null,'sources','[]'::jsonb,'claims','[]'::jsonb,'traces',jsonb_build_array('material-production-recipe:'||r.id::text,'material-production-plan:'||r.production_plan_id::text),'template',null,'provenance',jsonb_build_object('producer','capital-material-native-producer.v1','jobId',r.producer_job_id,'taskRunId',null,'messageId',null,'capability',null),'legacy',null);
 perform private.validate_artifact_manifest_v1(manifest);
 material_id:=private.append_deal_state_object(p_org,r.session_id,'material_artifact','pending_confirmation',r.input_fingerprint,projection,jsonb_build_array(jsonb_build_object('objectType','production_plan','objectFingerprint',r.production_plan_fingerprint)),null,'worker');
 insert into private.material_production_bindings(organization_id,work_id,recipe_id,material_object_id,revision_id,report_retained_payload_id,state_retained_payload_id,package_retained_payload_id,bundle_fingerprint) values(p_org,r.work_id,r.id,material_id,revision,p_report,p_state,p_package,bundle_fp);
 insert into public.artifact_revisions(id,organization_id,artifact_id,revision_no,previous_revision_id,audience,origin,manifest,manifest_fingerprint,content_sha256,byte_length) values(revision,p_org,artifact.id,coalesce(head.revision_no,0)+1,head.id,'internal','worker',manifest,encode(extensions.digest(manifest::text,'sha256'),'hex'),package_allocation.payload_fingerprint,package_allocation.byte_length);
 insert into public.artifact_blocks(organization_id,revision_id,block_no,block_key,kind,content,claims,content_fingerprint) values(p_org,revision,1,'material-package','section',projection,'[]',encode(extensions.digest(projection::text,'sha256'),'hex'));
 update public.artifacts set head_revision_id=revision where(organization_id,id)=(p_org,artifact.id);
 -- All three old projections store exact references, never bodies or a second
 -- copy of compiler results. The physical service alone resolves their bytes.
 insert into private.case_execution_results(organization_id,execution_id,report,manifest,comparison) values(p_org,r.controlled_execution_id,jsonb_build_object('schemaVersion','capital-material-report-projection.v1','recipeId',r.id,'retainedPayloadId',p_report,'physicalSha256',report_allocation.payload_fingerprint,'byteLength',report_allocation.byte_length),jsonb_build_object('schemaVersion','capital-material-execution-projection.v1','recipeId',r.id,'revisionId',revision,'bundleFingerprint',bundle_fp,'inputFingerprint',r.context_fingerprint),null);
 update public.document_intake_sessions set result_summary=(result_summary-'case_state'-'case_manifest')||jsonb_build_object('case_state',jsonb_build_object('schemaVersion','capital-material-state-projection.v1','recipeId',r.id,'retainedPayloadId',p_state,'physicalSha256',state_allocation.payload_fingerprint,'byteLength',state_allocation.byte_length),'case_manifest',projection) where(organization_id,id)=(p_org,r.session_id);
 update public.controlled_case_executions set status='succeeded',report_fingerprint=report_allocation.payload_fingerprint,manifest_fingerprint=bundle_fp,completed_at=stamp where(organization_id,id)=(p_org,r.controlled_execution_id);
 ref:=jsonb_build_object('artifactRevisionId',revision,'manifestFingerprint',encode(extensions.digest(manifest::text,'sha256'),'hex'));
 insert into private.review_basis_receipts(organization_id,work_id,basis_kind,basis_reference,reference_fingerprint,source_count,producer) values(p_org,r.work_id,'artifact_revision',ref,encode(extensions.digest(ref::text,'sha256'),'hex'),(select count(*) from private.material_production_source_pins where(organization_id,recipe_id)=(p_org,r.id)),'capital-material-native-producer.v1');
 if private.material_production_deadline_v1(p_org,r.id,r.human_subject_id) is null then raise exception 'material_production_commit_denied' using errcode='42501';end if;
 return private.material_production_commit_dto_v1(p_org,r.id,false);
end$$;
revoke all on function private.material_production_commit_dto_v1(uuid,uuid,boolean),private.material_production_commit_core_v1(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function private.worker_revalidate_material_production_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.material_production_job_v1(p_job_id,p_capability_token);r private.material_production_recipes;
begin
 select * into r from private.material_production_recipes where(organization_id,id,producer_job_id)=(j.organization_id,p_recipe_id,j.id);
 if r.id is null or not private.material_production_sources_current_v1(j.organization_id,r.id,j.authorization_subject_id) then raise exception 'material_production_revalidate_denied' using errcode='42501';end if;
 return private.material_production_capture_dto_v1(j.organization_id,r.id);
end$$;
create function private.worker_prepare_material_production_output_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_kind text,p_body jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$begin
 if p_kind not in('calculation_report','case_state','material_package') then raise exception 'material_production_output_kind_denied' using errcode='42501';end if;
 return private.material_production_allocate_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_kind,p_body);
end$$;
create function private.worker_commit_material_production_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_report_retained_payload_id uuid,p_state_retained_payload_id uuid,p_package_retained_payload_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.material_production_job_v1(p_job_id,p_capability_token);result jsonb;
begin
 if not exists(select 1 from private.material_production_recipes where(organization_id,id,producer_job_id)=(j.organization_id,p_recipe_id,j.id)) then raise exception 'material_production_commit_denied' using errcode='42501';end if;
 result:=private.material_production_commit_core_v1(j.organization_id,p_recipe_id,p_report_retained_payload_id,p_state_retained_payload_id,p_package_retained_payload_id);
 if not private.material_production_clock_current_v1(j.id,p_capability_token) then raise exception 'material_production_commit_denied' using errcode='42501';end if;
 return result;
end$$;
create function private.worker_recover_material_production_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.material_production_job_v1(p_job_id,p_capability_token);r private.material_production_recipes;b private.material_production_bindings;outputs jsonb;
begin
 select * into r from private.material_production_recipes where(organization_id,producer_job_id)=(j.organization_id,j.id);
 if r.id is null then return null;end if;
 if not private.material_production_sources_current_v1(j.organization_id,r.id,j.authorization_subject_id) or private.material_production_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null then raise exception 'material_production_recovery_denied' using errcode='42501';end if;
 if exists(select 1 from private.material_production_terminals where(organization_id,recipe_id)=(j.organization_id,r.id)) then
 if not exists(select 1 from private.material_production_terminals t join private.capital_public_retained_payloads q on(q.organization_id,q.id)=(t.organization_id,t.report_retained_payload_id) where(t.organization_id,t.recipe_id)=(j.organization_id,r.id) and private.capital_body_physical_receipt_v1(j.organization_id,q.id) and private.material_production_allocation_deadline_v1(j.organization_id,q.allocation_id,j.authorization_subject_id) is not null) then raise exception 'material_production_recovery_denied' using errcode='42501';end if;
 if exists(select 1 from private.material_production_terminals t left join private.capital_public_retained_payloads q on(q.organization_id,q.id)=(t.organization_id,t.case_state_retained_payload_id) where(t.organization_id,t.recipe_id)=(j.organization_id,r.id) and t.case_state_retained_payload_id is not null and(q.id is null or not private.capital_body_physical_receipt_v1(j.organization_id,q.id) or private.material_production_allocation_deadline_v1(j.organization_id,q.allocation_id,j.authorization_subject_id) is null)) then raise exception 'material_production_recovery_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-material-terminal-recovery.v1','authorizedJobId',j.id,'capture',private.material_production_capture_dto_v1(j.organization_id,r.id),'report',private.material_production_scope_v1(j.organization_id,(select q.allocation_id from private.material_production_terminals t join private.capital_public_retained_payloads q on(q.organization_id,q.id)=(t.organization_id,t.report_retained_payload_id) where(t.organization_id,t.recipe_id)=(j.organization_id,r.id))),'caseState',(select private.material_production_scope_v1(j.organization_id,q.allocation_id) from private.material_production_terminals t join private.capital_public_retained_payloads q on(q.organization_id,q.id)=(t.organization_id,t.case_state_retained_payload_id) where(t.organization_id,t.recipe_id)=(j.organization_id,r.id)),'terminal',private.material_production_terminal_dto_v1(j.organization_id,r.id,true));
 end if;
 if not exists(select 1 from private.material_production_seals where(organization_id,recipe_id)=(j.organization_id,r.id)) then return jsonb_build_object('schemaVersion','capital-material-recovery-unresolved.v1','state','unresolved','recipeId',r.id);end if;
 select jsonb_agg(private.material_production_scope_v1(j.organization_id,a.id) order by basis.kind) into outputs from private.material_production_body_bases basis join private.capital_public_payload_allocations a on(a.organization_id,a.material_body_basis_id)=(basis.organization_id,basis.id) join private.capital_public_retained_payloads q on(q.organization_id,q.allocation_id)=(a.organization_id,a.id) where(basis.organization_id,basis.recipe_id)=(j.organization_id,r.id) and basis.kind<>'context' and private.material_production_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is not null and private.capital_body_physical_receipt_v1(j.organization_id,q.id);
 select * into b from private.material_production_bindings where(organization_id,recipe_id)=(j.organization_id,r.id);
 if coalesce(jsonb_array_length(outputs),0)<>3 then if b.id is not null then raise exception 'material_production_recovery_denied' using errcode='42501';end if;return jsonb_build_object('schemaVersion','capital-material-recovery-unresolved.v1','state','unresolved','recipeId',r.id);end if;
 select * into b from private.material_production_bindings where(organization_id,recipe_id)=(j.organization_id,r.id);
 if not private.material_production_clock_current_v1(j.id,p_capability_token) then raise exception 'material_production_recovery_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-material-recovery.v1','state',case when b.id is null then 'commit' else 'committed' end,'authorizedJobId',j.id,'capture',private.material_production_capture_dto_v1(j.organization_id,r.id),'outputs',outputs,'commit',case when b.id is not null then private.material_production_commit_dto_v1(j.organization_id,r.id,true) end);
end$$;
-- Human reading and artifact review close over every physically retained parent.
-- This low-level gate never calls release/review-active (which call this gate),
-- avoiding a review→sources→native→release recursion.
create function private.material_production_revision_allowed_v1(p_org uuid,p_revision uuid,p_subject uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare b private.material_production_bindings;r private.material_production_recipes;retained uuid;a private.capital_public_payload_allocations;
begin
 select * into b from private.material_production_bindings where(organization_id,revision_id)=(p_org,p_revision);
 select * into r from private.material_production_recipes where(organization_id,id)=(p_org,b.recipe_id);
 if r.id is null or private.material_production_deadline_v1(p_org,r.id,p_subject) is null then return false;end if;
 foreach retained in array array[b.report_retained_payload_id,b.state_retained_payload_id,b.package_retained_payload_id] loop
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on(x.organization_id,x.id)=(q.organization_id,q.allocation_id) where(q.organization_id,q.id)=(p_org,retained);
 if a.id is null or not private.capital_body_physical_receipt_v1(p_org,retained) or private.material_production_allocation_deadline_v1(p_org,a.id,p_subject) is null then return false;end if;
 perform private.require_capital_body_retention_ready_v1(a.policy_id,p_org,a.id);
 end loop;
 return true;
end$$;
alter function private.artifact_review_sources_allowed_v1(uuid,uuid,uuid) rename to artifact_review_sources_allowed_pre_material_v1;
create function private.artifact_review_sources_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$begin
 if exists(select 1 from private.material_production_bindings where(organization_id,revision_id)=(p_org,p_revision)) then return private.material_production_revision_allowed_v1(p_org,p_revision,p_actor);end if;
 return private.artifact_review_sources_allowed_pre_material_v1(p_org,p_revision,p_actor);
end$$;
revoke all on function private.worker_revalidate_material_production_v1(uuid,text,uuid),private.worker_prepare_material_production_output_v1(uuid,text,uuid,uuid,text,jsonb),private.worker_commit_material_production_v1(uuid,text,uuid,uuid,uuid,uuid),private.worker_recover_material_production_v1(uuid,text),private.material_production_revision_allowed_v1(uuid,uuid,uuid),private.artifact_review_sources_allowed_pre_material_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function private.worker_read_material_production_allocation_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.material_production_job_v1(p_job_id,p_capability_token);a private.capital_public_payload_allocations;o storage.objects;q private.capital_public_retained_payloads;scope jsonb;
begin
 select * into a from private.capital_public_payload_allocations where(organization_id,id,job_id,content_kind)=(j.organization_id,p_allocation_id,j.id,'material_body');
 if a.id is null or private.material_production_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null or not private.capital_public_retention_healthy_v1(j.leased_by,a.policy_id) then raise exception 'material_production_body_read_denied' using errcode='42501';end if;
 perform private.require_capital_body_retention_ready_v1(a.policy_id,j.organization_id,a.id);
 select * into o from storage.objects where bucket_id=a.bucket_id and name=a.object_path for share nowait;
 select * into q from private.capital_public_retained_payloads where(organization_id,allocation_id)=(j.organization_id,a.id);
 if o.id is null or coalesce(length(o.version),0) not between 1 and 1024 or o.metadata->>'size' is distinct from a.byte_length::text or o.metadata->>'mimetype' is distinct from 'application/json' or(to_jsonb(o)->>'is_versioned')::boolean is true or(to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null or not private.capital_public_capture_bucket_safe_v1() then raise exception 'material_production_body_read_denied' using errcode='42501';end if;
 if q.id is null then if a.upload_expires_at<=clock_timestamp() then raise exception 'material_production_upload_expired' using errcode='42501';end if;
 elsif(q.storage_object_id,q.storage_version,q.verified_sha256,q.verified_size) is distinct from(o.id,o.version,a.payload_fingerprint,a.byte_length) or not private.capital_body_physical_receipt_v1(j.organization_id,q.id) then raise exception 'material_production_body_read_denied' using errcode='42501';end if;
 scope:=private.material_production_scope_v1(j.organization_id,a.id)||jsonb_build_object('storageObjectId',o.id,'storageVersion',o.version);
 if not private.material_production_clock_current_v1(j.id,p_capability_token) or private.material_production_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null then raise exception 'material_production_body_read_denied' using errcode='42501';end if;
 return scope;
end$$;
create function private.read_material_production_result_v1(p_revision_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare b private.material_production_bindings;q private.capital_public_retained_payloads;org uuid;
begin
 select * into b from private.material_production_bindings where revision_id=p_revision_id;
 org:=b.organization_id;
 if org is null or not private.can_access_resource_v1(org,b.work_id,'read') or not private.material_production_revision_allowed_v1(org,p_revision_id,auth.uid()) then raise exception 'material_production_result_read_denied' using errcode='42501';end if;
 select * into strict q from private.capital_public_retained_payloads where(organization_id,id)=(org,b.package_retained_payload_id);
 return jsonb_build_object('schemaVersion','capital-material-read-scope.v1','revisionId',p_revision_id,'recipeId',b.recipe_id,'bundleFingerprint',b.bundle_fingerprint,'scope',private.material_production_scope_v1(org,q.allocation_id));
end$$;
-- Public worker wrappers preserve authenticated JWT + capability checks; no
-- Storage key or raw body read is granted to their caller by these functions.
do $$declare name text;args text;params text;argtypes text;
begin
 for name,args,params,argtypes in select * from(values
 ('worker_capture_material_production_v1','p_job_id uuid,p_capability_token text,p_request_id uuid','p_job_id,p_capability_token,p_request_id','uuid,text,uuid'),
 ('worker_seal_material_production_context_v1','p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_context_retained_payload_id uuid','p_job_id,p_capability_token,p_recipe_id,p_context_retained_payload_id','uuid,text,uuid,uuid'),
 ('worker_revalidate_material_production_v1','p_job_id uuid,p_capability_token text,p_recipe_id uuid','p_job_id,p_capability_token,p_recipe_id','uuid,text,uuid'),
 ('worker_prepare_material_production_output_v1','p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_kind text,p_body jsonb','p_job_id,p_capability_token,p_recipe_id,p_request_id,p_kind,p_body','uuid,text,uuid,uuid,text,jsonb'),
 ('worker_commit_material_production_body_v1','p_job_id uuid,p_capability_token text,p_allocation_id uuid,p_storage_object_id uuid,p_storage_version text,p_verified_sha256 text,p_verified_size bigint','p_job_id,p_capability_token,p_allocation_id,p_storage_object_id,p_storage_version,p_verified_sha256,p_verified_size','uuid,text,uuid,uuid,text,text,bigint'),
 ('worker_commit_material_production_v1','p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_report_retained_payload_id uuid,p_state_retained_payload_id uuid,p_package_retained_payload_id uuid','p_job_id,p_capability_token,p_recipe_id,p_report_retained_payload_id,p_state_retained_payload_id,p_package_retained_payload_id','uuid,text,uuid,uuid,uuid,uuid'),
 ('worker_recover_material_production_v1','p_job_id uuid,p_capability_token text','p_job_id,p_capability_token','uuid,text'),
 ('worker_read_material_production_allocation_v1','p_job_id uuid,p_capability_token text,p_allocation_id uuid','p_job_id,p_capability_token,p_allocation_id','uuid,text,uuid'),
 ('read_material_production_result_v1','p_revision_id uuid','p_revision_id','uuid')
 ) v(name,args,params,argtypes) loop
 execute format('create function public.%I(%s) returns jsonb language sql security invoker set search_path='''' as $wrapper$ select private.%I(%s); $wrapper$',name,args,name,params);
 execute format('revoke all on function private.%I(%s),public.%I(%s) from public,anon,authenticated,service_role',name,argtypes,name,argtypes);
 execute format('grant execute on function private.%I(%s),public.%I(%s) to authenticated',name,argtypes,name,argtypes);
 end loop;
end$$;
revoke all on function private.material_production_revision_allowed_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function private.material_production_storage_allowed_v1(p_allocation uuid,p_mode text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;headers jsonb;capability text;j public.processing_jobs;
begin
 if auth.uid() is null or p_mode is distinct from 'upload' or not private.capital_public_capture_bucket_safe_v1() then return false;end if;
 begin headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;exception when invalid_text_representation then return false;end;
 if jsonb_typeof(headers->'x-offroad-job-id') is distinct from 'string' or jsonb_typeof(headers->'x-offroad-capability') is distinct from 'string' then return false;end if;
 select * into a from private.capital_public_payload_allocations where id=p_allocation and content_kind='material_body';
 if a.id is null or headers->>'x-offroad-job-id' is distinct from a.job_id::text or(headers?'x-offroad-workspace' and headers->>'x-offroad-workspace' is distinct from a.organization_id::text) then return false;end if;
 capability:=headers->>'x-offroad-capability';
 if length(capability) not between 1 and 4096 or extensions.digest(capability,'sha256') is distinct from a.capability_sha256 or not private.capital_public_allocation_job_current_v1(a.id) then return false;end if;
 j:=private.material_production_job_v1(a.job_id,capability);
 if a.upload_expires_at<=clock_timestamp() or exists(select 1 from private.capital_public_retained_payloads where(organization_id,allocation_id)=(a.organization_id,a.id)) or private.material_production_allocation_deadline_v1(a.organization_id,a.id,j.authorization_subject_id) is null then return false;end if;
 perform private.require_capital_body_retention_ready_v1(a.policy_id,a.organization_id,a.id);
 return private.material_production_clock_current_v1(j.id,capability);
exception when insufficient_privilege then return false;
end$$;
alter function private.worker_can_access_capital_public_payload_v1(text,text,text) rename to worker_can_access_capital_public_payload_pre_material_v1;
create function private.worker_can_access_capital_public_payload_v1(p_bucket text,p_path text,p_mode text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;
begin
 -- Purge resolves the genuine leased janitor scope before kind dispatch.
 if p_mode in('purge','purge_select') then return private.worker_can_access_capital_public_payload_pre_material_v1(p_bucket,p_path,p_mode);end if;
 select * into a from private.capital_public_payload_allocations where bucket_id=p_bucket and object_path=p_path;
 if a.content_kind is distinct from 'material_body' then return private.worker_can_access_capital_public_payload_pre_material_v1(p_bucket,p_path,p_mode);end if;
 if exists(select 1 from storage.objects o where o.bucket_id=p_bucket and o.name=p_path and((to_jsonb(o)->>'is_versioned')::boolean is true or(to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null)) then return false;end if;
 return private.material_production_storage_allowed_v1(a.id,p_mode);
end$$;
revoke all on function private.material_production_storage_allowed_v1(uuid,text),private.worker_can_access_capital_public_payload_pre_material_v1(text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_can_access_capital_public_payload_v1(text,text,text) to authenticated;
-- Policy expressions retain function OIDs across RENAME. Rebind them to the
-- current dispatch rather than granting clients the historical implementation.
do $$declare p record;ddl text;begin
 for p in select * from pg_policies where schemaname='storage' and tablename='objects' and(coalesce(qual,'') like '%worker_can_access_capital_public_payload_pre_material_v1%' or coalesce(with_check,'') like '%worker_can_access_capital_public_payload_pre_material_v1%') loop
 ddl:=format('alter policy %I on storage.objects',p.policyname);
 if p.qual is not null then ddl:=ddl||' using ('||replace(p.qual,'worker_can_access_capital_public_payload_pre_material_v1','worker_can_access_capital_public_payload_v1')||')';end if;
 if p.with_check is not null then ddl:=ddl||' with check ('||replace(p.with_check,'worker_can_access_capital_public_payload_pre_material_v1','worker_can_access_capital_public_payload_v1')||')';end if;
 execute ddl;
 end loop;
end$$;

-- Runtime classification is a capability-bound server decision, never a caller
-- feature flag. Non-material case jobs retain their own legitimate pipeline.
create function private.worker_read_material_production_dispatch_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.material_production_job_v1(p_job_id,p_capability_token);w uuid;cutoff timestamptz;mode text;
 r private.material_production_recipes;pa private.material_production_plan_approvals;pc private.material_production_plan_precursors;s public.deal_state_objects;plan uuid;request uuid;
begin
 select capital_project_id into strict w from public.document_intake_sessions where(organization_id,id)=(j.organization_id,j.intake_session_id);
 select activated_at into strict cutoff from private.material_production_cutover where singleton;
 select * into r from private.material_production_recipes where(organization_id,producer_job_id)=(j.organization_id,j.id);
 select * into pa from private.material_production_plan_approvals where(organization_id,effect_job_id)=(j.organization_id,j.id);
 select * into pc from private.material_production_plan_precursors where(organization_id,producer_job_id)=(j.organization_id,j.id);
 if r.id is not null or pa.id is not null then
  if pa.id is null then raise exception 'material_dispatch_approval_unresolved' using errcode='42501';end if;
  select * into pc from private.material_production_plan_precursors where(organization_id,id)=(j.organization_id,pa.precursor_id);
  if pa.actor_id is distinct from j.authorization_subject_id or not private.material_plan_precursor_current_v1(j.organization_id,pc.id,j.authorization_subject_id)
   or(r.id is not null and r.production_plan_id<>pa.approved_plan_id) then raise exception 'material_dispatch_denied' using errcode='42501';end if;
  mode:='material';plan:=pa.approved_plan_id;
 elsif pc.id is not null then
  if not private.material_plan_precursor_current_v1(j.organization_id,pc.id,j.authorization_subject_id) then raise exception 'material_dispatch_plan_stale' using errcode='42501';end if;
  mode:='plan';plan:=pc.plan_id;request:=pc.request_id;
 elsif j.created_at<cutoff then mode:='legacy';
 else
  select * into s from public.deal_state_objects where organization_id=j.organization_id and intake_session_id=j.intake_session_id and object_type='structure_decision' order by object_version desc limit 1;
  if j.payload->>'incremental_trigger'='structure_confirmed' and s.status in('confirmed','approved') and j.payload->>'trigger_fingerprint'=s.object_fingerprint then mode:='plan';
  else mode:='case';end if;
 end if;
 perform private.material_production_job_v1(p_job_id,p_capability_token);
 return jsonb_build_object('schemaVersion','capital-material-dispatch.v1','mode',mode,'workId',w,'productionPlanId',plan,'planRequestId',request);
end$$;
revoke all on function private.worker_read_material_production_dispatch_v1(uuid,text) from public,anon,authenticated,service_role;
create function public.worker_read_material_production_dispatch_v1(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_read_material_production_dispatch_v1(p_job_id,p_capability_token);$$;
revoke all on function public.worker_read_material_production_dispatch_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_read_material_production_dispatch_v1(uuid,text),public.worker_read_material_production_dispatch_v1(uuid,text) to authenticated;
