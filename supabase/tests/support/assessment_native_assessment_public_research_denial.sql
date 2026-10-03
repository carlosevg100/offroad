begin;
\ir native_assessment_setup.sql
create function pg_temp.expect_assessment_error(p_sql text,p_error text) returns void language plpgsql security invoker as $$
begin
 begin execute p_sql;exception when others then if position(p_error in sqlerrm)>0 then return;end if;raise;end;
 raise exception 'expected assessment rejection: %',p_error;
end $$;
create function pg_temp.native_assessment_proposal(p_ref text,p_id uuid,p_fingerprint text) returns jsonb language sql security invoker as $$
 select jsonb_build_object('schemaVersion','dcm-agent-assessment.v1','projectId',project_id,'assessmentRef',p_ref,'coverage','[]'::jsonb,'requests','[]'::jsonb,
 'decisions',jsonb_build_array(jsonb_build_object('schemaVersion','dcm-decision.v1','id',p_id,'projectId',project_id,'decisionKey','case.structure_direction',
 'revision',1,'status','open','question','A análise está pronta para revisão?','recommendation',null,'alternatives','[]'::jsonb,
 'rationaleSummary','Proposta sem escolha financeira.','evidence','[]'::jsonb,'assumptions','[]'::jsonb,'unresolved','[]'::jsonb,
 'confidence','insufficient','proposedBy','deal_captain','createdAt',clock_timestamp(),'fingerprint',p_fingerprint))) from native_assessment_ids;
$$;
select set_config('test.assessment',pg_temp.native_assessment_proposal('native:first','53000000-0000-4000-8000-000000000126',repeat('e',64))::text,true);
select pg_temp.expect_assessment_error($q$select public.worker_record_agent_assessment_v2(job_id,repeat('c',64),current_setting('test.assessment')::jsonb) from native_assessment_ids$q$,'assessment_primary_capture_required');
select public.worker_load_preliminary_assessment_input_v3(job_id,repeat('c',64)) from native_assessment_ids;
select pg_temp.expect_assessment_error($q$select public.worker_record_agent_assessment_v1(job_id,repeat('c',64),current_setting('test.assessment')::jsonb) from native_assessment_ids$q$,'assessment_native_writer_required');
select public.worker_record_agent_assessment_v2(job_id,repeat('c',64),current_setting('test.assessment')::jsonb) from native_assessment_ids;
select set_config('test.assessment_basis',public.read_assessment_review_basis_v2(project_id,'53000000-0000-4000-8000-000000000126')::text,true) from native_assessment_ids;
do $$begin
 if(current_setting('test.assessment_basis')::jsonb->>'totalSourceCount')::integer<>1 then raise exception 'uncited delivered source missing';end if;
end $$;
create function pg_temp.review_native_assessment(p_command uuid,p_declared boolean) returns jsonb language sql security invoker as $$
 select public.review_assessment_v2(project_id,'53000000-0000-4000-8000-000000000126',1,repeat('e',64),
 current_setting('test.assessment_basis')::jsonb->>'proposalFingerprint',p_command,'approved',true,p_declared) from native_assessment_ids;
$$;
-- Capability-bound public research is not certified by a document-only snapshot.
select public.worker_record_public_research(job_id,repeat('c',64),
 '[{"topic":"identity","query":"Empresa Exemplo site oficial Brasil"}]'::jsonb,
 jsonb_build_object('status','succeeded','providerChain',jsonb_build_array('official'),'failures','[]'::jsonb,
 'sources',jsonb_build_array(jsonb_build_object('topic','identity','provider','official','title','Empresa Exemplo',
 'url','https://example.com/institucional','snippet','Contexto público entregue à análise.',
 'retrievedAt','2026-10-02T12:00:00.000Z','contentHash',repeat('1',64))))) from native_assessment_ids;
select pg_temp.expect_assessment_error($q$select public.read_assessment_review_basis_v2(project_id,'53000000-0000-4000-8000-000000000126') from native_assessment_ids$q$,'assessment_review_source_denied');
select pg_temp.expect_assessment_error($q$select pg_temp.review_native_assessment('54000000-0000-4000-8000-000000000126',true)$q$,'assessment_review_source_denied');
select pg_temp.expect_assessment_error($q$select public.worker_record_agent_assessment_v2(job_id,repeat('c',64),pg_temp.native_assessment_proposal('native:research','55000000-0000-4000-8000-000000000126',repeat('f',64))) from native_assessment_ids$q$,'assessment_public_research_capture_required');
reset role;
do $$begin
 if exists(select 1 from private.assessment_review_projections where command_id='54000000-0000-4000-8000-000000000126') then
 raise exception 'unlicensed public research produced human approval';end if;
end $$;
rollback;
