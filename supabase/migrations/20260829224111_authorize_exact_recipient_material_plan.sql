-- Company authorization is bound to an exact, technically reviewed recipient and material plan.
-- It remains separate from the operational act of making a qualified introduction.

alter table public.qualified_introduction_targets
  add column mandate_revalidated_at timestamptz,
  add column mandate_revalidated_by uuid references auth.users (id),
  add column mandate_revalidation_note text,
  add constraint qualified_introduction_targets_mandate_revalidation check (
    (mandate_revalidated_at is null and mandate_revalidated_by is null)
    or (mandate_revalidated_at is not null and mandate_revalidated_by is not null
      and length(trim(mandate_revalidation_note)) >= 3)
  );

alter table public.qualified_introduction_plans
  add column authorization_snapshot jsonb
    check (authorization_snapshot is null or jsonb_typeof(authorization_snapshot) = 'object'),
  add constraint qualified_introduction_plans_authorization_snapshot check (
    (status = 'authorized') = (authorization_snapshot is not null)
  ) not valid;

drop function private.resolve_qualified_introduction_target(uuid, text, uuid, jsonb, boolean, text);

create function private.resolve_qualified_introduction_target(
  p_target_id uuid,
  p_contact_source text,
  p_contact_id uuid,
  p_mandate_fingerprint text,
  p_material_manifest jsonb,
  p_is_anchor boolean,
  p_reviewer_id uuid,
  p_resolution_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.qualified_introduction_targets;
  plan public.qualified_introduction_plans;
  directory_contact public.market_provider_contacts;
  registered_contact public.provider_contacts;
  contact_name text;
  contact_title text;
  contact_email text;
  recipient_id uuid;
begin
  if p_mandate_fingerprint !~ '^[0-9a-f]{64}$'
    or length(trim(p_resolution_note)) < 3
    or not exists (select 1 from auth.users where id = p_reviewer_id) then
    raise exception 'qualified_introduction_resolution_attestation_invalid' using errcode = '22023';
  end if;

  select row.* into target
  from public.qualified_introduction_targets row
  where row.id = p_target_id
  for update;
  if not found then
    raise exception 'qualified_introduction_target_not_found' using errcode = 'P0002';
  end if;
  if p_mandate_fingerprint is distinct from target.mandate_fingerprint then
    raise exception 'qualified_introduction_mandate_changed' using errcode = '55000';
  end if;

  select row.* into plan
  from public.qualified_introduction_plans row
  where row.organization_id = target.organization_id and row.id = target.plan_id
  for update;
  if plan.status <> 'draft' then
    raise exception 'draft_qualified_introduction_plan_required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_material_manifest) <> 'array' or jsonb_array_length(p_material_manifest) = 0 then
    raise exception 'qualified_introduction_material_manifest_required' using errcode = '22023';
  end if;

  if target.provider_source = 'directory' then
    if p_contact_source <> 'directory_market' then
      raise exception 'directory_market_contact_required' using errcode = '22023';
    end if;
    select row.* into directory_contact
    from public.market_provider_contacts row
    where row.id = p_contact_id
      and row.fund_directory_id = target.fund_directory_id
      and row.status = 'active'
      and (row.valid_until is null or row.valid_until >= current_date)
    for share;
    if not found then
      raise exception 'current_directory_contact_not_found' using errcode = 'P0002';
    end if;
    contact_name := directory_contact.full_name;
    contact_title := directory_contact.job_title;
    contact_email := directory_contact.email;
  else
    if p_contact_source <> 'registered_provider' then
      raise exception 'registered_provider_contact_required' using errcode = '22023';
    end if;
    select row.* into registered_contact
    from public.provider_contacts row
    where row.id = p_contact_id
      and row.organization_id = target.provider_organization_id
      and row.fund_id = target.provider_fund_id
      and row.status = 'active'
    for share;
    if not found then
      raise exception 'current_registered_contact_not_found' using errcode = 'P0002';
    end if;
    contact_name := registered_contact.full_name;
    contact_title := registered_contact.job_title;
    contact_email := registered_contact.email;
  end if;

  insert into public.qualified_introduction_recipients (
    organization_id, intake_session_id, plan_id, target_id,
    provider_source, provider_id, fund_directory_id, provider_organization_id, provider_fund_id,
    recipient_name, contact_source, contact_uuid, contact_id, contact_name, contact_email,
    contact_job_title, mandate_fingerprint, rationale, material_manifest, position, is_anchor
  ) values (
    target.organization_id, target.intake_session_id, target.plan_id, target.id,
    target.provider_source, target.provider_id, target.fund_directory_id,
    target.provider_organization_id, target.provider_fund_id,
    target.provider_name, p_contact_source, p_contact_id, p_contact_id::text,
    contact_name, contact_email, contact_title, target.mandate_fingerprint,
    target.rationale, p_material_manifest, target.position, p_is_anchor
  )
  on conflict (organization_id, target_id) where target_id is not null
  do update set
    contact_source = excluded.contact_source,
    contact_uuid = excluded.contact_uuid,
    contact_id = excluded.contact_id,
    contact_name = excluded.contact_name,
    contact_email = excluded.contact_email,
    contact_job_title = excluded.contact_job_title,
    mandate_fingerprint = excluded.mandate_fingerprint,
    material_manifest = excluded.material_manifest,
    is_anchor = excluded.is_anchor
  returning id into recipient_id;

  update public.qualified_introduction_targets
  set contact_status = 'resolved',
      resolved_contact_source = p_contact_source,
      resolved_contact_id = p_contact_id,
      resolved_contact_name = contact_name,
      resolved_contact_job_title = contact_title,
      resolved_contact_email = contact_email,
      resolved_at = now(),
      resolution_note = trim(p_resolution_note),
      mandate_revalidated_at = now(),
      mandate_revalidated_by = p_reviewer_id,
      mandate_revalidation_note = trim(p_resolution_note)
  where organization_id = target.organization_id and id = target.id;

  return recipient_id;
end;
$$;

revoke all on function private.resolve_qualified_introduction_target(
  uuid, text, uuid, text, jsonb, boolean, uuid, text
) from public, anon, authenticated;
grant execute on function private.resolve_qualified_introduction_target(
  uuid, text, uuid, text, jsonb, boolean, uuid, text
) to service_role;

drop function public.attest_qualified_introduction_plan_technical_review(uuid, text);
drop function private.attest_qualified_introduction_plan_technical_review(uuid, text);

create function private.attest_qualified_introduction_plan_technical_review(
  p_plan_id uuid,
  p_material_fingerprint text,
  p_reviewer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan public.qualified_introduction_plans;
  policy public.market_distribution_policies;
  recipient_count integer;
  resolved_count integer;
begin
  if not exists (select 1 from auth.users where id = p_reviewer_id) then
    raise exception 'qualified_introduction_reviewer_invalid' using errcode = '22023';
  end if;
  select row.* into plan
  from public.qualified_introduction_plans row
  where row.id = p_plan_id
  for update;
  if not found then
    raise exception 'qualified_introduction_plan_not_found' using errcode = 'P0002';
  end if;
  if plan.status <> 'draft'
    or p_material_fingerprint is distinct from plan.material_fingerprint then
    raise exception 'current_draft_qualified_introduction_plan_required' using errcode = '22023';
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
          or recipient.contact_uuid is null
          or recipient.contact_email is null
          or jsonb_typeof(recipient.material_manifest) <> 'array'
          or jsonb_array_length(recipient.material_manifest) = 0
        )
    )
  then
    raise exception 'qualified_introduction_recipient_plan_not_ready' using errcode = '22023';
  end if;

  update public.qualified_introduction_plans
  set technical_review_fingerprint = p_material_fingerprint,
      technical_reviewed_by = p_reviewer_id,
      technical_reviewed_at = now()
  where id = plan.id;
  return plan.id;
end;
$$;

revoke all on function private.attest_qualified_introduction_plan_technical_review(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function private.attest_qualified_introduction_plan_technical_review(uuid, text, uuid)
  to service_role;

create or replace function private.authorize_qualified_introduction_plan(
  p_plan_id uuid,
  p_material_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function private.revoke_qualified_introduction_plan(p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare plan public.qualified_introduction_plans;
begin
  select * into plan from public.qualified_introduction_plans row where row.id = p_plan_id for update;
  if not found then raise exception 'qualified_introduction_plan_not_found' using errcode = 'P0002'; end if;
  if not (select private.can_access_intake_session(plan.organization_id, plan.intake_session_id)) then
    raise exception 'qualified_introduction_plan_forbidden' using errcode = '42501';
  end if;
  if plan.status <> 'authorized' or exists (
    select 1 from public.qualified_introductions introduction
    where introduction.organization_id = plan.organization_id and introduction.plan_id = plan.id
  ) then raise exception 'qualified_introduction_plan_cannot_be_revoked' using errcode = '22023'; end if;

  update public.qualified_introduction_plans
  set status = 'revoked', authorized_by = null, authorized_at = null,
      authorization_snapshot = null,
      revoked_by = (select auth.uid()), revoked_at = now()
  where id = plan.id;
  update public.document_intake_sessions
  set privacy_status = 'private', updated_at = now()
  where organization_id = plan.organization_id and id = plan.intake_session_id;
  return plan.id;
end;
$$;

create or replace function private.enforce_qualified_introduction_release()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  plan public.qualified_introduction_plans;
  session_row public.document_intake_sessions;
  recipient public.qualified_introduction_recipients;
  authorized_recipient jsonb;
begin
  select * into plan
  from public.qualified_introduction_plans row
  where row.organization_id = new.organization_id and row.id = new.plan_id;
  select * into session_row
  from public.document_intake_sessions row
  where row.organization_id = new.organization_id and row.id = new.intake_session_id;
  select * into recipient
  from public.qualified_introduction_recipients row
  where row.organization_id = new.organization_id and row.id = new.recipient_id;
  select value into authorized_recipient
  from jsonb_array_elements(coalesce(plan.authorization_snapshot -> 'recipients', '[]'::jsonb)) item(value)
  where value ->> 'recipientId' = new.recipient_id::text
  limit 1;

  if plan.id is null
    or plan.status <> 'authorized'
    or plan.intake_session_id <> new.intake_session_id
    or plan.case_fingerprint <> new.case_fingerprint
    or plan.material_fingerprint <> new.material_fingerprint
    or plan.identity_policy <> session_row.identity_policy
    or session_row.representation_status <> 'verified'
    or session_row.privacy_status <> 'distribution_authorized'
    or recipient.id is null
    or recipient.plan_id <> plan.id
    or recipient.provider_source <> new.provider_source
    or recipient.provider_id <> new.provider_id
    or recipient.fund_directory_id is distinct from new.fund_directory_id
    or recipient.provider_organization_id is distinct from new.provider_organization_id
    or recipient.provider_fund_id is distinct from new.provider_fund_id
    or recipient.contact_source <> new.contact_source
    or recipient.contact_uuid <> new.contact_uuid
    or recipient.contact_id <> new.contact_id
    or recipient.contact_name <> new.contact_name
    or recipient.contact_email <> new.contact_email
    or recipient.mandate_fingerprint <> new.mandate_fingerprint
    or recipient.material_manifest <> new.material_manifest
    or authorized_recipient is null
    or authorized_recipient ->> 'contactId' <> new.contact_uuid::text
    or authorized_recipient -> 'materialManifest' <> new.material_manifest
    or coalesce(new.authorization_snapshot ->> 'identityPolicy', '') <> plan.identity_policy
    or coalesce(new.authorization_snapshot ->> 'planId', '') <> plan.id::text
    or coalesce(new.authorization_snapshot ->> 'materialFingerprint', '') <> plan.material_fingerprint
  then
    raise exception 'qualified_introduction_release_gate_failed' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.worker_load_market_distribution_context(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  policy public.market_distribution_policies;
  plan public.qualified_introduction_plans;
  recipient_payload jsonb := '[]'::jsonb;
  introduction_payload jsonb := '[]'::jsonb;
  recipient_ids jsonb := '[]'::jsonb;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;
  select * into policy from public.market_distribution_policies row
  where row.status in ('active', 'invalidated')
    and row.valid_from <= current_date
    and (row.valid_until is null or row.valid_until >= current_date)
  order by row.valid_from desc, case row.status when 'invalidated' then 0 else 1 end
  limit 1;
  if not found then return null; end if;
  select * into plan from public.qualified_introduction_plans row
  where row.organization_id = job_row.organization_id
    and row.intake_session_id = job_row.intake_session_id
    and row.status in ('draft', 'authorized')
  order by case row.status when 'authorized' then 0 else 1 end, row.updated_at desc
  limit 1;
  if found then
    select coalesce(jsonb_agg(jsonb_build_object(
      'fundId', recipient.provider_id::text,
      'providerSource', recipient.provider_source,
      'providerOrganizationId', recipient.provider_organization_id,
      'providerFundId', recipient.provider_fund_id,
      'contactId', recipient.contact_id,
      'contactName', recipient.contact_name,
      'contactEmail', recipient.contact_email,
      'rationale', recipient.rationale,
      'materialKinds', recipient.material_manifest,
      'materialFingerprint', plan.material_fingerprint,
      'mandateFingerprint', recipient.mandate_fingerprint,
      'order', recipient.position,
      'anchor', recipient.is_anchor
    ) order by recipient.position), '[]'::jsonb),
    coalesce(jsonb_agg(to_jsonb(recipient.id::text) order by recipient.position), '[]'::jsonb)
    into recipient_payload, recipient_ids
    from public.qualified_introduction_recipients recipient
    where recipient.organization_id = plan.organization_id and recipient.plan_id = plan.id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', introduction.id::text,
      'fundId', introduction.provider_id::text,
      'providerSource', introduction.provider_source,
      'contactId', introduction.contact_id,
      'materialFingerprint', introduction.material_fingerprint,
      'authorizationId', introduction.plan_id::text,
      'introducedBy', introduction.introduced_by::text,
      'introducedAt', introduction.introduced_at
    ) order by introduction.introduced_at), '[]'::jsonb)
    into introduction_payload
    from public.qualified_introductions introduction
    where introduction.organization_id = plan.organization_id and introduction.plan_id = plan.id;
  end if;
  return jsonb_build_object(
    'version', policy.version,
    'status', policy.status,
    'mandateMaxAgeMonths', policy.mandate_max_age_months,
    'waveLimit', policy.wave_limit,
    'learningGateAnchorCount', policy.learning_gate_anchor_count,
    'recipients', recipient_payload,
    'authorization', case when plan.id is not null and plan.status = 'authorized'
      then plan.authorization_snapshot else null end,
    'introductions', introduction_payload,
    'materialRelease', jsonb_build_object(
      'technicalReview', jsonb_build_object(
        'approved', plan.technical_reviewed_by is not null,
        'fingerprint', plan.technical_review_fingerprint,
        'reviewedBy', plan.technical_reviewed_by::text,
        'reviewedAt', plan.technical_reviewed_at
      ),
      'companyAuthorization', jsonb_build_object(
        'authorized', plan.id is not null and plan.status = 'authorized',
        'fingerprint', case when plan.status = 'authorized' then plan.material_fingerprint else null end,
        'scope', case when plan.status = 'authorized' then jsonb_build_array('qualified_introduction') else '[]'::jsonb end,
        'recipientIds', case when plan.status = 'authorized' then recipient_ids else '[]'::jsonb end
      )
    )
  );
end;
$$;

drop view private.lender_feedback_rollup;
create view private.lender_feedback_rollup
with (security_invoker = true)
as
with active_feedback as (
  select feedback.*
  from public.qualified_introduction_feedback_events feedback
  where not exists (
    select 1
    from public.qualified_introduction_feedback_events replacement
    where replacement.organization_id = feedback.organization_id
      and replacement.supersedes_event_id = feedback.id
  )
)
select
  introduction.provider_source,
  introduction.provider_id,
  introduction.fund_directory_id,
  introduction.provider_organization_id,
  introduction.provider_fund_id,
  introduction.mandate_fingerprint,
  count(distinct introduction.id) as introduction_count,
  count(distinct introduction.id) filter (where feedback.event_type = 'introduction_accepted') as accepted_count,
  count(distinct introduction.id) filter (where feedback.event_type = 'case_declined') as declined_count,
  coalesce(sum(feedback.requested_information_count) filter (where feedback.event_type = 'diligence_requested'), 0) as requested_information_count,
  count(distinct introduction.id) filter (where feedback.event_type = 'process_advanced') as advanced_count,
  count(distinct introduction.id) filter (where feedback.event_type = 'proposal_issued') as proposal_count,
  count(distinct introduction.id) filter (where feedback.event_type = 'funded') as funded_count,
  max(feedback.occurred_at) as latest_signal_at
from public.qualified_introductions introduction
left join active_feedback feedback
  on feedback.organization_id = introduction.organization_id
 and feedback.qualified_introduction_id = introduction.id
group by introduction.provider_source, introduction.provider_id, introduction.fund_directory_id,
  introduction.provider_organization_id, introduction.provider_fund_id, introduction.mandate_fingerprint;

revoke all on private.lender_feedback_rollup from public, anon, authenticated;
grant select on private.lender_feedback_rollup to service_role;
