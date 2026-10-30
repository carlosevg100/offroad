-- Preserve documentary duration units at preliminary confirmation. A field name is not proof
-- that a duration is measured in months. Human-declared months remain explicit session inputs.
do $guard$
begin
 if (select md5(prosrc) from pg_proc where oid='private.decide_advisor_preliminary_v1(uuid,text,text,text)'::regprocedure) <> '33dbc603c171120cf4835192fc9a26df' then
  raise exception 'preliminary_term_unexpected_function_body';
 end if;
end $guard$;

CREATE OR REPLACE FUNCTION private.decide_advisor_preliminary_v1(p_project_id uuid, p_object_fingerprint text, p_decision text, p_correction text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  project_row public.capital_projects;
  session_row public.document_intake_sessions;
  understanding_row public.preliminary_understandings;
  payload jsonb;
  archetype text;
  objective text;
  amount numeric;
  currency text;
  term_months integer;
  sector text;
  geography text;
  company_patch jsonb;
  confirmed_id uuid;
begin
 perform private.require_resource_access_v1(p_project_id,'work');
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_decision not in ('confirmed', 'changes_requested')
    or p_object_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_preliminary_understanding_decision' using errcode = '22023';
  end if;

  select project.* into project_row
  from public.capital_projects project
  join public.organization_memberships membership
    on membership.organization_id = project.organization_id
  where project.id = p_project_id
    and membership.user_id = actor_id
    and membership.status = 'active'
    and project.status <> 'archived'
    and project.entry_job in ('structure_from_documents', 'review_existing_operation')
  for update of project;
  if not found then raise exception 'capital_project_not_found' using errcode = 'P0002'; end if;

  select session.* into strict session_row
  from public.document_intake_sessions session
  where session.organization_id = project_row.organization_id
    and session.capital_project_id = project_row.id
  order by session.created_at asc
  limit 1
  for update;

  select understanding.* into understanding_row
  from public.preliminary_understandings understanding
  where understanding.organization_id = project_row.organization_id
    and understanding.intake_session_id = session_row.id
  order by understanding.object_version desc
  limit 1
  for update;
  if not found or understanding_row.object_fingerprint <> p_object_fingerprint then
    raise exception 'current_preliminary_understanding_required' using errcode = '55000';
  end if;
  if understanding_row.status = 'confirmed' and p_decision = 'confirmed' then
    return understanding_row.id;
  end if;
  if understanding_row.status <> 'pending_confirmation' then
    raise exception 'current_preliminary_understanding_required' using errcode = '55000';
  end if;

  if p_decision = 'changes_requested' then
    return private.decide_preliminary_understanding(
      project_row.organization_id,
      session_row.id,
      p_object_fingerprint,
      p_decision,
      p_correction
    );
  end if;

  payload := understanding_row.payload;
  archetype := coalesce(nullif(payload #>> '{operation,archetypeId}', ''), 'other');
  if archetype not in (
    'working_capital', 'growth_expansion', 'acquisition', 'refinance',
    'equipment_finance', 'venture_debt', 'other'
  ) then archetype := 'other'; end if;
  objective := left(coalesce(
    nullif(payload #>> '{operation,objective}', ''),
    nullif(payload #>> '{operation,operationSummary}', ''),
    nullif(payload ->> 'summary', '')
  ), 4000);
  if coalesce(payload #>> '{operation,requestedAmount}', '') ~ '^\d+(\.\d+)?$' then
    amount := (payload #>> '{operation,requestedAmount}')::numeric;
  end if;
  currency := case when payload #>> '{operation,currency}' in ('BRL', 'USD', 'EUR')
    then payload #>> '{operation,currency}' else null end;
  if coalesce(payload #>> '{operation,requestedTermMonths}', '') ~ '^\d+$' then
    term_months := (payload #>> '{operation,requestedTermMonths}')::integer;
    if term_months not between 1 and 360 then term_months := null; end if;
  end if;
  -- Never project a day count or an unproved historical number into month-based memory.
  if term_months is not null and coalesce(payload #>> '{operation,requestedTermDays}', '') ~ '^[0-9]+$' then
    raise exception 'preliminary_term_unit_conflict' using errcode = '22023';
  end if;
  if term_months is not null and session_row.requested_term_months is distinct from term_months
    and not exists (
      select 1 from public.intake_field_candidates c
      where c.organization_id=project_row.organization_id and c.intake_session_id=session_row.id
        and c.field_path='transaction.desired_term_months' and c.anchor_verified
        and c.source_document_id is not null and c.review_state not in ('rejected','not_applicable','superseded')
        and c.unit='months' and c.normalized_value #>> '{}' = term_months::text
        and coalesce(c.source_anchor->>'quote','') ~* ('(^|[^0-9.,])'||term_months::text||'[[:space:]]*(mês|meses|months?)([^[:alpha:]]|$)')
    ) then
    raise exception 'preliminary_term_unit_unconfirmed' using errcode = '22023';
  end if;
  sector := left(nullif(trim(coalesce(payload #>> '{company,sector}', '')), ''), 120);
  geography := upper(nullif(trim(coalesce(payload #>> '{company,geography}', '')), ''));
  if geography !~ '^[A-Z]{2}$' then geography := null; end if;

  perform private.record_intake_capital_need_command(
    project_row.organization_id,
    session_row.id,
    gen_random_uuid(),
    archetype,
    objective,
    amount,
    currency,
    null,
    term_months,
    null,
    null,
    sector,
    geography,
    '{}'::text[],
    '{}'::text[],
    null
  );
  perform private.set_intake_archetype_command(
    project_row.organization_id,
    session_row.id,
    gen_random_uuid(),
    archetype,
    'medium',
    'Rota confirmada pelo usuário a partir do entendimento preliminar deste projeto.',
    array['novos documentos', 'correção do objetivo', 'uso misto dos recursos']::text[]
  );

  company_patch := jsonb_strip_nulls(jsonb_build_object(
    'name', nullif(payload #>> '{company,name}', ''),
    'legal_name', nullif(payload #>> '{company,legalName}', ''),
    'website', nullif(payload #>> '{company,website}', ''),
    'description', nullif(payload #>> '{company,companySummary}', '')
  ));
  update public.document_intake_sessions session
  set company_profile = coalesce(session.company_profile, '{}'::jsonb) || company_patch
  where session.organization_id = project_row.organization_id
    and session.id = session_row.id;

  -- The projection above may have marked this same locked row as superseded. No concurrent
  -- input can intervene while the project, session, and preliminary row locks are held.
  update public.preliminary_understandings understanding
  set status = 'confirmed',
      correction = null,
      decided_by = actor_id,
      decided_at = now()
  where understanding.organization_id = project_row.organization_id
    and understanding.intake_session_id = session_row.id
    and understanding.id = understanding_row.id
    and understanding.object_fingerprint = p_object_fingerprint
    and understanding.status in ('pending_confirmation', 'superseded')
  returning understanding.id into confirmed_id;
  if confirmed_id is null then
    raise exception 'current_preliminary_understanding_required' using errcode = '55000';
  end if;

  update public.document_intake_sessions session
  set status = 'collecting'
  where session.organization_id = project_row.organization_id
    and session.id = session_row.id
    and session.status = 'review_ready';

  return confirmed_id;
end;
$function$;
