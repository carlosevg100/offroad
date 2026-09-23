CREATE OR REPLACE FUNCTION private.get_workspace_bootstrap()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  resolved_organization_id uuid;
  membership_record public.organization_memberships;
  organization_record public.organizations;
  progress_record public.onboarding_progress;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  -- Changed: the same resolver every creator uses.
  select resolved.organization_id into resolved_organization_id
  from private.workspace_membership_v1() resolved;
  if resolved_organization_id is null then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;

  select membership.*
  into strict membership_record
  from public.organization_memberships membership
  where membership.organization_id = resolved_organization_id
    and membership.user_id = caller_id;

  select organization.*
  into strict organization_record
  from public.organizations organization
  where organization.id = membership_record.organization_id;

  select progress.*
  into progress_record
  from public.onboarding_progress progress
  where progress.organization_id = membership_record.organization_id
    and progress.user_id = caller_id
  order by progress.updated_at desc
  limit 1;

  return jsonb_build_object(
    'user_id', caller_id,
    'access_administration',jsonb_build_object('canAdminister',membership_record.role in ('owner','admin') and exists(select 1 from private.principals p join auth.users u on u.id=p.user_id where p.organization_id=resolved_organization_id and p.user_id=caller_id and p.revoked_at is null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()))),
    'email', coalesce(auth.jwt() ->> 'email', ''),
    'membership', jsonb_build_object(
      'organization_id', membership_record.organization_id,
      'role', membership_record.role
    ),
    'organization', jsonb_build_object(
      'id', organization_record.id,
      'name', organization_record.name,
      'legal_name', organization_record.legal_name,
      'website', organization_record.website,
      'description', organization_record.description,
      'organization_type', organization_record.organization_type,
      'workspace_kind',organization_record.workspace_kind,
      'capabilities',private.get_workspace_context_v1()->'capabilities',
      'verification_status', organization_record.verification_status
    ),
    'onboarding', case when progress_record.user_id is null then null else jsonb_build_object(
      'journey', progress_record.journey,
      'current_step', progress_record.current_step,
      'answers', progress_record.answers,
      'completed_at', progress_record.completed_at
    ) end,
    'workspace_ready', organization_record.organization_type in ('personal','institutional') or progress_record.completed_at is not null
  );
end;
$function$
