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

select public.worker_load_preliminary_assessment_input_v3(job_id,repeat('c',64)) from native_assessment_ids;
select public.worker_record_agent_assessment_v2(job_id,repeat('c',64),pg_temp.native_assessment_proposal('native:placeholder:first','53000000-0000-4000-8000-000000000126',repeat('e',64))) from native_assessment_ids;
select public.worker_record_agent_assessment_v2(job_id,repeat('c',64),pg_temp.native_assessment_proposal('native:placeholder:second','55000000-0000-4000-8000-000000000126',repeat('f',64))) from native_assessment_ids;
do $$begin
 if not exists(select 1 from public.capital_project_decisions where id='53000000-0000-4000-8000-000000000126' and revision=1 and decision_fingerprint=repeat('e',64))
  or not exists(select 1 from public.capital_project_decisions where id='55000000-0000-4000-8000-000000000126' and revision=2 and decision_fingerprint=repeat('f',64)) then
  raise exception 'captured placeholder was overwritten';end if;
end $$;
select set_config('test.assessment_basis',public.read_assessment_review_basis_v2(project_id,'55000000-0000-4000-8000-000000000126')::text,true) from native_assessment_ids;
select public.review_assessment_v2(project_id,'55000000-0000-4000-8000-000000000126',2,repeat('f',64),
 current_setting('test.assessment_basis')::jsonb->>'proposalFingerprint','54000000-0000-4000-8000-000000000126','rejected',false,false) from native_assessment_ids;
select public.worker_record_agent_assessment_v2(job_id,repeat('c',64),pg_temp.native_assessment_proposal('native:after:rejection','56000000-0000-4000-8000-000000000126',repeat('a',64))) from native_assessment_ids;
do $$declare basis jsonb;begin
 if not exists(select 1 from public.capital_project_decisions where id='55000000-0000-4000-8000-000000000126' and status='rejected' and reviewed_by='user' and revision=2)
  or not exists(select 1 from public.capital_project_decisions where id='56000000-0000-4000-8000-000000000126' and status='open' and revision=3) then
  raise exception 'rejection without freeze did not preserve human history and permit a new proposal';end if;
 select public.read_assessment_review_basis_v2(project_id,'55000000-0000-4000-8000-000000000126') into basis from native_assessment_ids;
 if (basis->>'frozen')::boolean then raise exception 'rejection none acquired freeze effect';end if;
end $$;
-- A new proposal cannot mutate the rejected body through a browser write.
select pg_temp.expect_assessment_error($q$update public.capital_project_decisions set rationale_summary='Changed by a later reader' where id='55000000-0000-4000-8000-000000000126'$q$,'permission denied');
rollback;
