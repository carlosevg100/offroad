-- Each information-request producer owns its namespace. A generic case assessment
-- must not close or replace specialist diligence/premise questions persisted in the same run.
do $migration$
declare
 definition text := pg_get_functiondef('private.worker_record_agent_assessment_v1(uuid,text,jsonb)'::regprocedure);
 supersede_needle text := $needle$    and request.status = 'open'
    and not (request.requirement_key = any(coalesce(request_keys, '{}'::text[])));$needle$;
 lookup_needle text := $needle$      and request.requirement_key = request_item ->> 'requirementKey'
      and request.status = 'open'$needle$;
 preflight_needle text := $needle$  for coverage_item in$needle$;
begin
 if (length(definition)-length(replace(definition,supersede_needle,'')))/length(supersede_needle) <> 1
   or (length(definition)-length(replace(definition,lookup_needle,'')))/length(lookup_needle) <> 1
   or (length(definition)-length(replace(definition,preflight_needle,'')))/length(preflight_needle) <> 1 then
   raise exception 'assessment_request_namespace_contract_drift';
 end if;
 definition := replace(definition,supersede_needle,
   $replacement$    and request.source_namespace = 'agent_assessment'
    and request.status = 'open'
    and not (request.requirement_key = any(coalesce(request_keys, '{}'::text[])));$replacement$);
 definition := replace(definition,lookup_needle,
   $replacement$      and request.source_namespace = 'agent_assessment'
      and request.requirement_key = request_item ->> 'requirementKey'
      and request.status = 'open'$replacement$);
 definition := replace(definition,preflight_needle,
   $replacement$  if exists (
    select 1 from public.capital_project_information_requests request
    where request.organization_id = job_row.organization_id
      and request.capital_project_id = session_row.capital_project_id
      and request.source_namespace <> 'agent_assessment'
      and request.requirement_key = any(coalesce(request_keys, '{}'::text[]))
  ) then
    raise exception 'agent_information_request_namespace_conflict' using errcode = '22023';
  end if;

  for coverage_item in$replacement$);
 execute definition;
end;
$migration$;
