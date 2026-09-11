-- The issuer side may not browse the market directory, and it should not need to. The recipients
-- of a pack are the providers of its own approved shortlist; this resolves each of those targets
-- into the registered organization that can open a pack, or states that it has no product access.
-- It reveals nothing about the market beyond the targets the project already selected.

create or replace function private.resolve_pack_distribution_candidates(
  p_organization_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan public.qualified_introduction_plans;
  candidates jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not (select private.can_access_intake_session(p_organization_id, p_session_id)) then
    raise exception 'pack_distribution_forbidden' using errcode = '42501';
  end if;

  select row.* into plan
  from public.qualified_introduction_plans row
  where row.organization_id = p_organization_id
    and row.intake_session_id = p_session_id
    and row.status <> 'revoked'
  order by case row.status when 'authorized' then 0 else 1 end, row.updated_at desc
  limit 1;
  if not found then
    return jsonb_build_object('plan_id', null, 'plan_status', null, 'candidates', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'targetId', candidate.target_id,
    'position', candidate.position,
    'providerName', candidate.provider_name,
    'rationale', candidate.rationale,
    'recipientKind', case when candidate.recipient_organization_id is not null
      then 'registered_organization' else 'directory_entry' end,
    'recipientOrganizationId', candidate.recipient_organization_id,
    'recipientDirectoryId', candidate.fund_directory_id,
    'deliverable', candidate.recipient_organization_id is not null,
    'shareId', candidate.share_id,
    'sharedRevisionId', candidate.shared_revision_id,
    'preparationId', candidate.preparation_id,
    'preparationStatus', candidate.preparation_status,
    'candidateFit', candidate.candidate_fit
  ) order by candidate.position), '[]'::jsonb)
  into candidates
  from (
    select
      target.id as target_id,
      target.position,
      target.provider_name,
      target.rationale,
      target.fund_directory_id,
      case
        when target.provider_source = 'registered' then target.provider_organization_id
        else (
          select directory.claimed_by_organization_id
          from public.fund_directory directory
          join public.organizations recipient
            on recipient.id = directory.claimed_by_organization_id
           and recipient.organization_type = 'capital_provider'
          where directory.id = target.fund_directory_id
        )
      end as recipient_organization_id,
      share.id as share_id,
      share.pack_revision_id as shared_revision_id,
      preparation.id as preparation_id,
      preparation.status as preparation_status,
      preparation.candidate_fit
    from public.qualified_introduction_targets target
    left join public.qualified_contact_preparations preparation
      on preparation.organization_id = target.organization_id
     and preparation.target_id = target.id
    left join public.pack_distribution_shares share
      on share.organization_id = target.organization_id
     and share.intake_session_id = target.intake_session_id
     and share.status = 'active'
     and (
       share.recipient_organization_id = case
         when target.provider_source = 'registered' then target.provider_organization_id
         else (
           select directory.claimed_by_organization_id
           from public.fund_directory directory
           where directory.id = target.fund_directory_id
         )
       end
       or share.recipient_directory_id = target.fund_directory_id
     )
    where target.organization_id = p_organization_id
      and target.plan_id = plan.id
  ) candidate;

  return jsonb_build_object(
    'plan_id', plan.id,
    'plan_status', plan.status,
    'candidates', candidates
  );
end;
$$;

create or replace function public.resolve_pack_distribution_candidates(
  p_organization_id uuid,
  p_session_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.resolve_pack_distribution_candidates(p_organization_id, p_session_id);
$$;

revoke all on function private.resolve_pack_distribution_candidates(uuid, uuid) from public, anon;
revoke all on function public.resolve_pack_distribution_candidates(uuid, uuid) from public, anon;
grant execute on function private.resolve_pack_distribution_candidates(uuid, uuid) to authenticated;
grant execute on function public.resolve_pack_distribution_candidates(uuid, uuid) to authenticated;

comment on function public.resolve_pack_distribution_candidates(uuid, uuid) is
  'Resolves the approved shortlist targets of a project into recipients that can open a pack inside the product, or records that a target has no product access.';
