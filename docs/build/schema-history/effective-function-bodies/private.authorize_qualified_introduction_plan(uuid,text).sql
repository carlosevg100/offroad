CREATE OR REPLACE FUNCTION private.authorize_qualified_introduction_plan(p_plan_id uuid, p_material_fingerprint text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  plan public.qualified_introduction_plans;
  session_row public.document_intake_sessions;
  policy public.market_distribution_policies;
  recipient_count integer;
  resolved_count integer;
  snapshot jsonb;
begin
  select row.* into plan
  from public.qualified_introduction_plans row
  where row.id = p_plan_id
  for update;
  if not found then
    raise exception 'qualified_introduction_plan_not_found' using errcode = 'P0002';
  end if;
  if not (select private.can_access_intake_session(plan.organization_id, plan.intake_session_id)) then
    raise exception 'qualified_introduction_plan_forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = plan.organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
  ) then
    raise exception 'qualified_introduction_authorizer_role_required' using errcode = '42501';
  end if;

  select row.* into session_row
  from public.document_intake_sessions row
  where row.organization_id = plan.organization_id and row.id = plan.intake_session_id
  for update;
  if session_row.representation_status <> 'verified' then
    raise exception 'verified_representation_required' using errcode = '42501';
  end if;
  if session_row.identity_policy is distinct from plan.identity_policy then
    raise exception 'qualified_introduction_identity_policy_changed' using errcode = '22023';
  end if;
  if plan.status <> 'draft'
    or p_material_fingerprint is distinct from plan.material_fingerprint then
    raise exception 'current_draft_qualified_introduction_plan_required' using errcode = '22023';
  end if;
  if plan.technical_reviewed_by is null
    or plan.technical_reviewed_at is null
    or plan.technical_review_fingerprint is distinct from plan.material_fingerprint then
    raise exception 'qualified_introduction_technical_review_required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.deal_state_objects state_object
    where state_object.organization_id = plan.organization_id
      and state_object.intake_session_id = plan.intake_session_id
      and state_object.object_type = 'match_screen'
      and state_object.object_fingerprint = plan.match_screen_fingerprint
      and state_object.status = 'approved'
      and state_object.superseded_at is null
  ) then
    raise exception 'current_approved_match_screen_required' using errcode = '55000';
  end if;

  select row.* into policy
  from public.market_distribution_policies row
  where row.status = 'active'
    and row.valid_from <= current_date
    and (row.valid_until is null or row.valid_until >= current_date)
  order by row.valid_from desc
  limit 1;
  if not found then
    raise exception 'active_market_distribution_policy_required' using errcode = '22023';
  end if;

  select count(*) into recipient_count
  from public.qualified_introduction_recipients recipient
  where recipient.organization_id = plan.organization_id and recipient.plan_id = plan.id;
  select count(*) into resolved_count
  from public.qualified_introduction_targets target
  where target.organization_id = plan.organization_id
    and target.plan_id = plan.id
    and target.contact_status = 'resolved';
  if recipient_count = 0
    or recipient_count <> resolved_count
    or recipient_count > least(plan.wave_limit, policy.wave_limit)
    or exists (
      select 1 from public.qualified_introduction_targets target
      where target.organization_id = plan.organization_id
        and target.plan_id = plan.id
        and target.contact_status = 'unresolved'
    )
    or exists (
      select 1
      from public.qualified_introduction_recipients recipient
      join public.qualified_introduction_targets target
        on target.organization_id = recipient.organization_id and target.id = recipient.target_id
      where recipient.organization_id = plan.organization_id
        and recipient.plan_id = plan.id
        and (
          target.contact_status <> 'resolved'
          or target.resolved_contact_id is distinct from recipient.contact_uuid
          or target.mandate_fingerprint is distinct from recipient.mandate_fingerprint
          or target.mandate_revalidated_at is null
          or target.mandate_revalidated_at < now() - make_interval(months => policy.mandate_max_age_months)
        )
    )
  then
    raise exception 'qualified_introduction_recipient_plan_not_ready' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'scope', 'qualified_introduction',
    'planId', plan.id,
    'matchScreenFingerprint', plan.match_screen_fingerprint,
    'materialFingerprint', plan.material_fingerprint,
    'identityPolicy', plan.identity_policy,
    'recipients', jsonb_agg(jsonb_build_object(
      'recipientId', recipient.id,
      'targetId', recipient.target_id,
      'providerSource', recipient.provider_source,
      'providerId', recipient.provider_id,
      'recipientName', recipient.recipient_name,
      'contactSource', recipient.contact_source,
      'contactId', recipient.contact_uuid,
      'contactName', recipient.contact_name,
      'contactEmail', recipient.contact_email,
      'mandateFingerprint', recipient.mandate_fingerprint,
      'materialManifest', recipient.material_manifest
    ) order by recipient.position)
  ) into snapshot
  from public.qualified_introduction_recipients recipient
  where recipient.organization_id = plan.organization_id and recipient.plan_id = plan.id;

  perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||plan.organization_id::text,0));
 if not private.evaluate_resource_policy_v1(plan.organization_id,plan.intake_session_id,auth.uid(),'work','publication') then raise exception 'resource_access_denied' using errcode='42501'; end if;
 perform private.require_domain_event_propagation_v1(plan.organization_id);
  update public.qualified_introduction_plans
  set status = 'authorized',
      authorized_by = (select auth.uid()),
      authorized_at = now(),
      authorization_snapshot = snapshot
  where id = plan.id;
  update public.document_intake_sessions
  set privacy_status = 'distribution_authorized', updated_at = now()
  where organization_id = plan.organization_id and id = plan.intake_session_id;
  return plan.id;
end;
$function$
