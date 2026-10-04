-- Prospective forward. Do not modify applied previews or raise statement_timeout.
-- Exact source guard; CREATE OR REPLACE retains the legitimate invoker command ACL.
do $$begin
 if md5((select prosrc from pg_proc where oid='private.worker_finalize_capital_preview_run_v1(uuid,text,uuid,jsonb)'::regprocedure))<>'d186b1060c004bb828d0f4ae5c287df0'
 then raise exception 'capital_preview_finalize_source_changed';end if;
 if to_regprocedure('private.require_capital_preview_run_proof_v1(uuid,text,uuid,boolean)')is null
 or to_regprocedure('private.capital_preview_projection_leaf_deadline_v1(uuid,uuid,text,timestamptz)')is null
 then raise exception 'capital_preview_finalize_proof_missing';end if;
end $$;
create function private.require_capital_preview_finalize_leaves_v1(p_run private.capital_preview_runs,p_consumed_basis jsonb,p_run_deadline timestamptz)
returns text language plpgsql volatile security definer set search_path=''as $$
declare step jsonb;input_pin jsonb;last_task text;
begin
 if p_run_deadline is null or p_run_deadline<=clock_timestamp()then raise exception 'capital_preview_result_incomplete'using errcode='42501';end if;
 for step in select value from jsonb_array_elements(private.capital_preview_workflow_v1(p_run.composition)->'steps')loop
 last_task:=step->>'taskId';
 if private.capital_preview_projection_leaf_deadline_v1(p_run.organization_id,p_run.id,last_task,p_run_deadline)is null
 then raise exception 'capital_preview_result_incomplete'using errcode='42501';end if;
 select value into input_pin from jsonb_array_elements(p_consumed_basis->'inputFingerprints')where value->>'taskId'=last_task;
 if input_pin is null or not exists(select 1 from private.capital_preview_body_bases b
 join private.capital_public_payload_allocations a on(a.organization_id,a.preview_body_basis_id)=(b.organization_id,b.id)
 join private.capital_public_retained_payloads q on(q.organization_id,q.allocation_id)=(a.organization_id,a.id)
 where b.organization_id=p_run.organization_id and b.run_id=p_run.id and b.task_id=last_task and b.kind='actual_input'
 and b.semantic_fingerprint=input_pin->>'fingerprint'and a.content_kind='preview_body'
 and private.capital_body_physical_receipt_v1(p_run.organization_id,q.id)
 and least(a.expires_at,a.purge_at,p_run_deadline)>clock_timestamp()
 and exists(select 1 from private.capital_public_payload_purge_queue purge where purge.organization_id=p_run.organization_id and purge.allocation_id=a.id and purge.status='pending'))
 then raise exception 'capital_preview_actual_input_missing'using errcode='42501';end if;
 end loop;
 if not exists(select 1 from private.capital_preview_task_projections x
 join private.capital_public_retained_payloads q on(q.organization_id,q.id)=(x.organization_id,x.retained_payload_id)
 join private.capital_public_payload_allocations a on(a.organization_id,a.id)=(q.organization_id,q.allocation_id)
 where x.organization_id=p_run.organization_id and x.run_id=p_run.id and x.task_id=last_task and x.role='decision_contract'
 and a.content_kind='preview_body'and private.capital_body_physical_receipt_v1(p_run.organization_id,q.id)
 and least(a.expires_at,a.purge_at,p_run_deadline)>clock_timestamp()
 and exists(select 1 from private.capital_public_payload_purge_queue purge where purge.organization_id=p_run.organization_id and purge.allocation_id=a.id and purge.status='pending'))
 then raise exception 'capital_preview_contract_missing'using errcode='42501';end if;
 return last_task;
end $$;
revoke all on function private.require_capital_preview_finalize_leaves_v1(private.capital_preview_runs,jsonb,timestamptz)from public,anon,authenticated,service_role;

create or replace function private.worker_finalize_capital_preview_run_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_consumed_basis jsonb)
returns jsonb language plpgsql security definer set search_path=''as $$
declare r private.capital_preview_runs;proof record;old private.capital_preview_run_results;
begin
 select *into strict proof from private.require_capital_preview_run_proof_v1(p_job_id,p_capability_token,p_run_id,true);
 r:=proof.run_row;
 if jsonb_typeof(p_consumed_basis)is distinct from'object'or p_consumed_basis->>'schemaVersion'is distinct from'capital-preview-consumed-basis.v1'
 or p_consumed_basis->>'composition'is distinct from r.composition or jsonb_typeof(p_consumed_basis->'fingerprint')is distinct from'string'
 or p_consumed_basis->>'fingerprint'!~'^[a-f0-9]{64}$'
 or p_consumed_basis-array['schemaVersion','composition','inputFingerprints','anchors','entries','fingerprint']<>'{}'::jsonb
 or jsonb_typeof(p_consumed_basis->'inputFingerprints')is distinct from'array'or jsonb_typeof(p_consumed_basis->'anchors')is distinct from'array'
 or p_consumed_basis->'entries'is distinct from private.capital_preview_consumed_corpus_registry_v1()->'entries'
 or jsonb_array_length(p_consumed_basis->'inputFingerprints')<>jsonb_array_length(private.capital_preview_workflow_v1(r.composition)->'steps')
 then raise exception 'capital_preview_final_basis_denied'using errcode='42501';end if;
 perform private.require_capital_preview_finalize_leaves_v1(r,p_consumed_basis,proof.run_deadline);
 select *into old from private.capital_preview_run_results where organization_id=r.organization_id and run_id=r.id;
 if old.id is null then insert into private.capital_preview_run_results(organization_id,run_id,consumed_basis_fingerprint)
 values(r.organization_id,r.id,p_consumed_basis->>'fingerprint');
 elsif old.consumed_basis_fingerprint<>p_consumed_basis->>'fingerprint'then raise exception 'capital_preview_final_basis_conflict'using errcode='23505';end if;
 -- Full live actor/job/capability/work/manifest/source/right closure again after the write.
 -- No caller-provided proof, cache, RPC-global deadline or timeout change.
 select *into strict proof from private.require_capital_preview_run_proof_v1(p_job_id,p_capability_token,p_run_id,true);
 r:=proof.run_row;
 perform private.require_capital_preview_finalize_leaves_v1(r,p_consumed_basis,proof.run_deadline);
 return jsonb_build_object('completed',true,'runId',r.id);
end $$;
