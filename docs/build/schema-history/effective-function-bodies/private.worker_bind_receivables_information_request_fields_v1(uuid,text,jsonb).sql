CREATE OR REPLACE FUNCTION private.worker_bind_receivables_information_request_fields_v1(p_job_id uuid, p_capability_token text, p_projection jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  request_item jsonb;
  request_row public.capital_project_information_requests;
  binding jsonb;
  binding_hash text;
  prior private.receivables_information_request_bindings;
  bound_count integer := 0;
  replayed_count integer := 0;
begin
  if job_row.kind not in ('case_analysis','agent_operation_brief')
    or jsonb_typeof(p_projection) <> 'object'
    or p_projection ->> 'schemaVersion' <> 'project-information-request-projection.v1'
    or p_projection ->> 'sourceNamespace' <> 'receivables_method_r01_fields'
    or jsonb_typeof(p_projection -> 'requests') <> 'array'
    or jsonb_array_length(p_projection -> 'requests') > 3 then
    raise exception 'receivables_information_request_binding_projection_invalid' using errcode = '22023';
  end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
    and session.capital_project_id is not null;
  if not found or p_projection ->> 'projectId' <> session_row.capital_project_id::text then
    raise exception 'receivables_information_request_binding_project_mismatch' using errcode = '42501';
  end if;

  for request_item in select value from jsonb_array_elements(p_projection -> 'requests') value
  loop
    binding := request_item -> 'producerBinding';
    if jsonb_typeof(binding) <> 'object'
      or binding ->> 'schemaVersion' <> 'receivables-information-request-binding.v1'
      or binding ->> 'methodId' <> 'R01'
      or coalesce(binding ->> 'sourceDatasetHash','') !~ '^[0-9a-f]{64}$'
      or coalesce(binding ->> 'fieldPath','') !~ '^/(policy|structure)/[A-Za-z0-9/]+$'
      or binding ->> 'valueKind' not in ('integer','percentage','boolean','enum','string_list','money','multiple')
      or binding ->> 'unit' not in ('days','percent_0_100','boolean','enum','text_list','currency_major','multiple')
      or jsonb_typeof(binding -> 'options') <> 'array'
      or jsonb_array_length(binding -> 'options') > 12
      or octet_length(binding::text) > 8192 then
      raise exception 'receivables_information_request_binding_invalid' using errcode = '22023';
    end if;

    select request.* into request_row
    from public.capital_project_information_requests request
    where request.organization_id = job_row.organization_id
      and request.capital_project_id = session_row.capital_project_id
      and request.source_namespace = 'receivables_method_r01_fields'
      and request.requirement_key = request_item ->> 'requirementKey'
      and (request.id = (request_item ->> 'id')::uuid or request_item ->> 'id' is null or exists (
        select 1 from private.receivables_information_request_bindings existing
        where existing.organization_id = request.organization_id
          and existing.information_request_id = request.id and existing.binding = request_item -> 'producerBinding'
      ))
    order by (request.id = (request_item ->> 'id')::uuid) desc,
      (request.status = 'open') desc, request.created_at desc, request.id desc limit 1;
    if not found then
      raise exception 'receivables_information_request_not_projected' using errcode = 'P0002';
    end if;

    binding_hash := encode(extensions.digest(convert_to(binding::text, 'UTF8'), 'sha256'), 'hex');
    select stored.* into prior
    from private.receivables_information_request_bindings stored
    where stored.organization_id = job_row.organization_id
      and stored.information_request_id = request_row.id;
    if found then
      if prior.binding_fingerprint <> binding_hash then
        raise exception 'receivables_information_request_binding_immutable_conflict' using errcode = '23505';
      end if;
      replayed_count := replayed_count + 1;
      continue;
    end if;
    insert into private.receivables_information_request_bindings (
      organization_id, capital_project_id, information_request_id, source_namespace,
      binding_fingerprint, binding
    ) values (
      job_row.organization_id, session_row.capital_project_id, request_row.id,
      'receivables_method_r01_fields', binding_hash, binding
    );
    bound_count := bound_count + 1;
  end loop;
  return jsonb_build_object('bound_count', bound_count, 'replayed_count', replayed_count);
end;
$function$
