-- Keep the project label distinct from its canonical company. The selected entry task
-- supplies a bounded objective only when no explicit objective or focus was provided.
create or replace function private.worker_load_execution_brief_proposal_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);
  target public.processing_jobs; s public.document_intake_sessions; p public.capital_projects; plan public.capital_project_plans;
begin
  if j.kind<>'execution_brief_proposal' then raise exception 'execution_proposal_capability_required' using errcode='42501'; end if;
  select * into target from public.processing_jobs where id=(j.payload->>'approval_target_job_id')::uuid
    and organization_id=j.organization_id and intake_session_id=j.intake_session_id and processing_run_id=j.processing_run_id for update;
  if not found or target.status<>'awaiting_approval' or target.kind not in ('case_analysis','capital_project_analysis') then
    raise exception 'execution_proposal_target_unavailable' using errcode='40001';
  end if;
  select * into s from public.document_intake_sessions where id=j.intake_session_id and organization_id=j.organization_id for update;
  select * into p from public.capital_projects where id=s.capital_project_id and organization_id=j.organization_id and status<>'archived' for update;
  if not found then raise exception 'execution_proposal_project_unavailable' using errcode='P0002'; end if;
  select * into plan from public.capital_project_plans where organization_id=j.organization_id and capital_project_id=p.id and status='active'
    and (target.kind='case_analysis' or id::text=target.payload->>'capital_project_plan_id');
  if not found and target.kind<>'case_analysis' then raise exception 'execution_proposal_plan_unavailable' using errcode='40001'; end if;
  return jsonb_build_object('target_job_id',target.id,'target_kind',target.kind,'project',jsonb_build_object('id',p.id,'name',p.project_name,'company_name',nullif(trim(s.company_profile->>'name'),''),'access_basis',p.access_basis,'entry_job',p.entry_job),
    'plan',plan.snapshot,'input_fingerprint',private.execution_approval_input_fingerprint(j.organization_id,j.intake_session_id),'locale',s.locale,'objective',coalesce(nullif(s.capital_objective,''),
      (select content from public.agent_messages where organization_id=j.organization_id and intake_session_id=j.intake_session_id and role='user' order by created_at desc limit 1),
      (select nullif(trim(b.content->>'focus'),'') from public.capital_project_briefs b
        where b.organization_id=j.organization_id and b.capital_project_id=p.id and b.id::text=target.payload->>'capital_project_brief_id'),
      case when p.entry_job='company_debt_view' then
        case when s.locale='en-US' then 'Analyze debt and financial capacity for ' else 'Analisar a dívida e a capacidade financeira de ' end
        ||coalesce(nullif(trim(s.company_profile->>'name'),''),p.project_name)
      else p.project_name end),
    'documents',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',original_name) order by id)
      from public.source_documents where organization_id=j.organization_id and intake_session_id=j.intake_session_id and processing_status='ready'),'[]'::jsonb));
end;
$$;
revoke all on function private.worker_load_execution_brief_proposal_v1(uuid,text) from public,anon,authenticated;
grant execute on function private.worker_load_execution_brief_proposal_v1(uuid,text) to authenticated;
