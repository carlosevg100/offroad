-- A field question belongs to an immutable producer binding, not just its field name.
-- A changed dataset/unit/limit gets a new question; prior answers and bindings remain historical.
do $migration$
declare
 definition text := pg_get_functiondef('private.worker_sync_receivables_information_requests_v1(uuid,text,jsonb)'::regprocedure);
 needle text := $needle$    select request.* into prior_request
    from public.capital_project_information_requests request
    where request.organization_id = job_row.organization_id
      and request.capital_project_id = session_row.capital_project_id
      and request.requirement_key = request_item ->> 'requirementKey'
    order by request.created_at desc, request.id desc limit 1 for update;$needle$;
 replacement text := $replacement$    if exists (
      select 1 from public.capital_project_information_requests request
      where request.organization_id = job_row.organization_id
        and request.capital_project_id = session_row.capital_project_id
        and request.requirement_key = request_item ->> 'requirementKey'
        and request.source_namespace <> projection_namespace
    ) then
      raise exception 'receivables_information_request_namespace_conflict' using errcode = '22023';
    end if;

    if projection_namespace = 'receivables_method_r01_fields' then
      with revised as (
      update public.capital_project_information_requests request set status = 'superseded'
      where request.organization_id = job_row.organization_id
        and request.capital_project_id = session_row.capital_project_id
        and request.source_namespace = projection_namespace
        and request.requirement_key = request_item ->> 'requirementKey'
        and request.status = 'open'
        and not exists (
          select 1 from private.receivables_information_request_bindings binding
          where binding.organization_id = request.organization_id
            and binding.information_request_id = request.id
            and binding.binding = request_item -> 'producerBinding'
        ) returning 1
      ) select superseded_count + count(*)::integer into superseded_count from revised;
    end if;

    select request.* into prior_request
    from public.capital_project_information_requests request
    where request.organization_id = job_row.organization_id
      and request.capital_project_id = session_row.capital_project_id
      and request.source_namespace = projection_namespace
      and request.requirement_key = request_item ->> 'requirementKey'
      and (projection_namespace <> 'receivables_method_r01_fields' or exists (
        select 1 from private.receivables_information_request_bindings binding
        where binding.organization_id = request.organization_id
          and binding.information_request_id = request.id
          and binding.binding = request_item -> 'producerBinding'
      ))
    order by (request.status = 'open') desc, request.created_at desc, request.id desc limit 1 for update;$replacement$;
 binder_definition text := pg_get_functiondef('private.worker_bind_receivables_information_request_fields_v1(uuid,text,jsonb)'::regprocedure);
 binder_needle text := $needle$      and request.requirement_key = request_item ->> 'requirementKey'
    order by request.created_at desc, request.id desc limit 1;$needle$;
 binder_replacement text := $replacement$      and request.requirement_key = request_item ->> 'requirementKey'
      and (request.id = (request_item ->> 'id')::uuid or request_item ->> 'id' is null or exists (
        select 1 from private.receivables_information_request_bindings existing
        where existing.organization_id = request.organization_id
          and existing.information_request_id = request.id and existing.binding = request_item -> 'producerBinding'
      ))
    order by (request.id = (request_item ->> 'id')::uuid) desc,
      (request.status = 'open') desc, request.created_at desc, request.id desc limit 1;$replacement$;
begin
 if (length(definition)-length(replace(definition,needle,'')))/length(needle) <> 1
   or (length(binder_definition)-length(replace(binder_definition,binder_needle,'')))/length(binder_needle) <> 1 then
   raise exception 'receivables_question_revision_contract_drift';
 end if;
 execute replace(definition,needle,replacement);
 execute replace(binder_definition,binder_needle,binder_replacement);
end;
$migration$;
