-- The content-hash fixture is the deterministic replacement for the worker in local and CI.
-- It must produce the same two pieces of lineage as the real pipeline: document profiles and
-- an immutable diagnostic snapshot. Without them the UI can extract fields while still claiming
-- that every document is missing, and a ready case can never cross the confirmation gate.

create or replace function private.record_fallback_document_profiles(
  p_organization_id uuid,
  p_session_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  document_row record;
  profile_id uuid;
  classification_version integer;
  recorded integer := 0;
begin
  if actor_id is null
    or not (select private.can_access_intake_session(p_organization_id, p_session_id)) then
    raise exception 'fallback_profile_access_denied' using errcode = '42501';
  end if;
  if coalesce((select organization.pipeline_enabled
    from public.organizations organization
    where organization.id = p_organization_id), false)
    and coalesce((select policy.state
      from public.organization_rollout_policies policy
      where policy.organization_id = p_organization_id), 'active') in ('shadow', 'canary', 'active') then
    raise exception 'fallback_profile_pipeline_enabled' using errcode = '55000';
  end if;

  for document_row in
    select document.id, document.document_version, fixture.document_kind,
      fixture.information_class, fixture.evidence_rank, fixture.period_start,
      fixture.period_end, fixture.scale
    from public.source_documents document
    join (values
      ('00_Ficha_Cadastral_Rede_Horizonte.docx', '7986231b1f6f224957ecdbba57dac9c8529cfca51f054e4002fbc335102ba44a', 'company_registration', 'company_document', 7, null::date, null::date, null::numeric),
      ('01_Carta_CFO_Pedido_e_Racional_Expansao.docx', '037a0734272d09982a1af360ac4208c3a68f6a55f3f70416b687d0c7ddd65509', 'capital_request_letter', 'company_document', 7, null::date, null::date, null::numeric),
      ('02_Demonstracoes_Financeiras_Auditadas_2023_2025.pdf', 'b41aa3edc1ba60ab440adae0f95ebfa0061fd15b492e95ff12a4e34db4be68f0', 'audited_financial_statements', 'audited', 1, date '2023-01-01', date '2025-12-31', 1000000::numeric),
      ('03_Export_ERP_Contabilidade_2024_Jul2026.xlsx', '1c46f5376f6f71cec2adeb375976b1c57c0bc23fd3cdbbee1b472501c797fc2b', 'erp_export', 'accounting', 3, date '2024-01-01', date '2026-07-31', 1000000::numeric),
      ('04_Mapa_Divida_Garantias_Jul2026.xlsx', 'e5a9db039d372e72e668da77df1959716d2435fb135411af1046a288ebec6031', 'debt_schedule', 'management', 5, null::date, date '2026-07-31', 1000000::numeric),
      ('05_Business_Plan_3_Novas_Lojas_2026_2030.xlsx', 'd2bbb79f6de57b0f15c6d4ab7f3b21c1427c9e6a01c62c9831115cf256280a5b', 'business_plan', 'projection', 6, date '2026-01-01', date '2030-12-31', 1000000::numeric),
      ('06_Parecer_Contabil_Informacoes_Intermediarias_Jul2026.pdf', '9dca71cb1fc06e3b8c85dea44ca8452e7c20ba4b492c0e69f8abce0c05c19b15', 'reviewed_interim_statements', 'reviewed', 2, date '2026-01-01', date '2026-07-31', 1000000::numeric),
      ('07_Memorial_Descritivo_Expansao_3_Lojas.pdf', 'd1469dbf6a75d82494544bd149f793f23fe7bcc6030c5b2608f2ad8b46e23fc5', 'project_memorandum', 'company_document', 7, null::date, null::date, null::numeric)
    ) as fixture(original_name, sha256, document_kind, information_class, evidence_rank, period_start, period_end, scale)
      on fixture.original_name = document.original_name
      and fixture.sha256 = document.sha256
    where document.organization_id = p_organization_id
      and document.intake_session_id = p_session_id
      and document.sha256_verified_at is not null
      and document.processing_status = 'ready'
  loop
    insert into public.document_profiles as profile (
      organization_id, source_document_id, document_version, processing_run_id,
      document_kind, title, entity_name, entity_role, entity_scope, period_start,
      period_end, currency, scale, accounting_basis, information_class, evidence_rank,
      language, quality, summary, suggested_folder, classifier, confidence
    ) values (
      p_organization_id, document_row.id, document_row.document_version, null,
      document_row.document_kind, document_row.document_kind,
      'Rede Horizonte Alimentos S.A.', 'borrower', 'consolidated',
      document_row.period_start, document_row.period_end, 'BRL', document_row.scale,
      case when document_row.information_class in ('audited', 'reviewed', 'accounting', 'management', 'projection')
        then document_row.information_class else null end,
      document_row.information_class, document_row.evidence_rank, 'pt',
      jsonb_build_object('fixtureVerified', true), '{}'::jsonb,
      case when document_row.document_kind in ('audited_financial_statements', 'reviewed_interim_statements', 'erp_export') then 'financial'
        when document_row.document_kind = 'debt_schedule' then 'debt_and_collateral'
        when document_row.document_kind in ('business_plan', 'project_memorandum') then 'project_and_plan'
        else 'institutional_and_corporate' end,
      jsonb_build_object('method', 'verified_content_hash_fixture', 'version', '2026.09.01-v1'),
      1
    )
    on conflict (organization_id, source_document_id, document_version) do update
    set document_kind = excluded.document_kind,
        period_start = excluded.period_start,
        period_end = excluded.period_end,
        scale = excluded.scale,
        accounting_basis = excluded.accounting_basis,
        information_class = excluded.information_class,
        evidence_rank = excluded.evidence_rank,
        quality = excluded.quality,
        classifier = excluded.classifier,
        confidence = excluded.confidence
    where profile.review_state = 'proposed'
    returning profile.id into profile_id;

    if profile_id is not null then
      recorded := recorded + 1;
    end if;

    -- These candidates come from an exact byte-for-byte fixture match after the server has
    -- recomputed the file digest. Their anchors are therefore verified evidence, not a browser
    -- assertion. This update stays inside the allowlisted hash branch above; model and unknown
    -- document candidates remain unverified until the real verifier says otherwise.
    update public.intake_field_candidates candidate
    set anchor_verified = true,
        anchor_precision = case
          when candidate.source_anchor ? 'cell' then 'cell'
          when candidate.source_anchor ? 'range' then 'row'
          when candidate.source_anchor ? 'sheet' then 'block'
          when candidate.source_anchor ? 'section' then 'block'
          when candidate.source_anchor ? 'page' then 'page'
          else 'document'
        end,
        verifier_flags = coalesce(candidate.verifier_flags, '[]'::jsonb)
          || jsonb_build_array('verified_content_hash_fixture')
    where candidate.organization_id = p_organization_id
      and candidate.intake_session_id = p_session_id
      and candidate.source_document_id = document_row.id
      and candidate.review_state = 'proposed'
      and jsonb_typeof(candidate.source_anchor) = 'object'
      and candidate.source_anchor <> '{}'::jsonb;

    if not exists (
      select 1
      from public.intake_domain_events event
      where event.organization_id = p_organization_id
        and event.intake_session_id = p_session_id
        and event.event_type = 'document_classified'
        and event.payload -> 'document' ->> 'id' = document_row.id::text
        and event.payload -> 'document' ->> 'kind' = document_row.document_kind
    ) then
      select count(*)::integer + 1 into classification_version
      from public.intake_domain_events event
      where event.organization_id = p_organization_id
        and event.intake_session_id = p_session_id
        and event.event_type = 'document_classified'
        and event.payload -> 'document' ->> 'id' = document_row.id::text;

      perform private.append_intake_domain_event(
        p_organization_id,
        p_session_id,
        gen_random_uuid(),
        'document_classified',
        jsonb_build_object(
          'document', jsonb_build_object('id', document_row.id, 'kind', document_row.document_kind),
          'classificationVersion', classification_version
        ),
        clock_timestamp(),
        actor_id
      );
    end if;
  end loop;

  return recorded;
end;
$$;

create or replace function public.record_fallback_document_profiles(
  p_organization_id uuid,
  p_session_id uuid
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.record_fallback_document_profiles(p_organization_id, p_session_id);
$$;

revoke all on function private.record_fallback_document_profiles(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.record_fallback_document_profiles(uuid, uuid)
  from public, anon;
grant execute on function private.record_fallback_document_profiles(uuid, uuid)
  to authenticated;
grant execute on function public.record_fallback_document_profiles(uuid, uuid)
  to authenticated;

create or replace function private.record_fallback_case_snapshot(
  p_organization_id uuid,
  p_session_id uuid,
  p_manifest jsonb,
  p_case_state jsonb,
  p_understanding_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  run_row public.processing_runs;
  manifest_id uuid;
  v_input_fingerprint text := p_manifest ->> 'inputFingerprint';
  v_manifest_fingerprint text := p_manifest ->> 'manifestFingerprint';
  v_schema_version text := p_manifest ->> 'schemaVersion';
  understanding_status text;
begin
  if actor_id is null
    or not (select private.can_access_intake_session(p_organization_id, p_session_id)) then
    raise exception 'fallback_case_snapshot_access_denied' using errcode = '42501';
  end if;
  if coalesce((select organization.pipeline_enabled
    from public.organizations organization
    where organization.id = p_organization_id), false)
    and coalesce((select policy.state
      from public.organization_rollout_policies policy
      where policy.organization_id = p_organization_id), 'active') in ('shadow', 'canary', 'active') then
    raise exception 'fallback_case_snapshot_pipeline_enabled' using errcode = '55000';
  end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = p_organization_id
    and session.id = p_session_id
  for update;
  if not found then raise exception 'intake_session_not_found' using errcode = 'P0002'; end if;

  select run.* into run_row
  from public.processing_runs run
  where run.organization_id = p_organization_id
    and run.id = session_row.current_run_id
    and run.intake_session_id = p_session_id;
  if not found
    or run_row.status <> 'succeeded'
    or run_row.pipeline_version <> 'fixture-analysis-2026.09.01' then
    raise exception 'fallback_analysis_run_required' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.preliminary_understandings understanding
    where understanding.organization_id = p_organization_id
      and understanding.intake_session_id = p_session_id
      and understanding.status = 'confirmed'
  ) then
    raise exception 'preliminary_understanding_not_confirmed' using errcode = '55000';
  end if;

  if coalesce(jsonb_typeof(p_manifest), 'null') <> 'object'
    or coalesce(jsonb_typeof(p_case_state), 'null') <> 'object'
    or coalesce(jsonb_typeof(p_understanding_payload), 'null') <> 'object'
    or v_input_fingerprint !~ '^[0-9a-f]{64}$'
    or v_manifest_fingerprint !~ '^[0-9a-f]{64}$'
    or coalesce(v_schema_version, '') = ''
    or p_manifest ->> 'caseId' <> p_session_id::text
    or p_manifest ->> 'runId' <> run_row.id::text
    or p_manifest ->> 'locale' <> session_row.locale
    or p_understanding_payload ->> 'schemaVersion' <> '2026.08.31-v2'
    or p_understanding_payload ->> 'caseId' <> p_session_id::text
    or p_understanding_payload ->> 'locale' <> session_row.locale
    or p_understanding_payload -> 'readiness' is distinct from p_case_state -> 'readiness'
    or p_understanding_payload -> 'reconciliation' is distinct from p_case_state -> 'reconciliation'
    or p_understanding_payload -> 'operationTruth' is distinct from p_case_state -> 'operationTruth'
    or p_understanding_payload -> 'capacity' is distinct from p_case_state -> 'capacity'
    or p_understanding_payload -> 'trajectory' is distinct from p_case_state -> 'trajectory'
    or p_understanding_payload -> 'desk' is distinct from p_case_state -> 'desk'
    or p_understanding_payload -> 'clientQuestions' is distinct from p_case_state -> 'clientQuestions'
    or p_understanding_payload -> 'brief' is distinct from p_case_state -> 'brief'
    or p_understanding_payload -> 'briefBlockedBy' is distinct from p_case_state -> 'briefBlockedBy'
    or p_understanding_payload -> 'redFlagTruth' is distinct from p_case_state -> 'redFlagTruth'
    or coalesce(jsonb_typeof(p_case_state #> '{readiness,blockers}'), 'null') <> 'array'
    or p_understanding_payload #>> '{externalResearch,status}' <> 'abstained'
    or coalesce((p_understanding_payload #>> '{externalResearch,sourceCount}')::integer, -1) <> 0 then
    raise exception 'invalid_fallback_case_snapshot' using errcode = '22023';
  end if;

  insert into public.case_artifact_manifests (
    organization_id, intake_session_id, processing_run_id, schema_version, locale,
    input_fingerprint, manifest_fingerprint, manifest, created_by
  ) values (
    p_organization_id, p_session_id, run_row.id, v_schema_version, session_row.locale,
    v_input_fingerprint, v_manifest_fingerprint, p_manifest, actor_id
  )
  on conflict (organization_id, manifest_fingerprint) do nothing
  returning id into manifest_id;

  if manifest_id is null then
    select stored.id into manifest_id
    from public.case_artifact_manifests stored
    where stored.organization_id = p_organization_id
      and stored.manifest_fingerprint = v_manifest_fingerprint
      and stored.intake_session_id = p_session_id
      and stored.processing_run_id = run_row.id
      and stored.manifest = p_manifest;
    if manifest_id is null then
      raise exception 'case_manifest_fingerprint_collision' using errcode = '23505';
    end if;
  end if;

  update public.document_intake_sessions session
  set result_summary = session.result_summary || jsonb_build_object(
    'case_state', p_case_state,
    'case_manifest', jsonb_build_object(
      'id', manifest_id,
      'fingerprint', v_manifest_fingerprint,
      'input_fingerprint', v_input_fingerprint,
      'schema_version', v_schema_version
    )
  )
  where session.organization_id = p_organization_id
    and session.id = p_session_id;

  understanding_status := case
    when jsonb_array_length(p_case_state #> '{readiness,blockers}') = 0 then 'pending_confirmation'
    else 'draft'
  end;
  perform private.append_deal_state_object(
    p_organization_id, p_session_id, 'understanding_snapshot', understanding_status,
    v_input_fingerprint, p_understanding_payload, '[]'::jsonb, null, 'worker'
  );
  perform private.append_deal_state_object(
    p_organization_id, p_session_id, 'finding_register', 'draft', v_input_fingerprint,
    jsonb_build_object(
      'schemaVersion', '2026.08.29-v1',
      'readiness', p_case_state -> 'readiness',
      'reconciliation', p_case_state -> 'reconciliation',
      'redFlagTruth', p_case_state -> 'redFlagTruth',
      'receivablesVertical', p_case_state -> 'receivablesVertical'
    ),
    '[]'::jsonb, null, 'worker'
  );

  return manifest_id;
end;
$$;

create or replace function public.record_fallback_case_snapshot(
  p_organization_id uuid,
  p_session_id uuid,
  p_manifest jsonb,
  p_case_state jsonb,
  p_understanding_payload jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_fallback_case_snapshot(
    p_organization_id, p_session_id, p_manifest, p_case_state, p_understanding_payload
  );
$$;

revoke all on function private.record_fallback_case_snapshot(uuid, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.record_fallback_case_snapshot(uuid, uuid, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function private.record_fallback_case_snapshot(uuid, uuid, jsonb, jsonb, jsonb)
  to authenticated;
grant execute on function public.record_fallback_case_snapshot(uuid, uuid, jsonb, jsonb, jsonb)
  to authenticated;
