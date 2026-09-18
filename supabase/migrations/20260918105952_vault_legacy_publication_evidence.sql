-- Preserve platform-owned legacy bytes and their import provenance. A migration is not
-- a human publication. These candidates remain in the platform library for stage 13/14.
alter table public.house_playbook_versions add column legacy_publication_provenance jsonb;
update public.house_playbook_versions set
 legacy_publication_provenance=jsonb_build_object('kind','legacy_candidate','previousStatus',status,'approvalBasis',approval_basis,'recordedApprovalAt',approved_at,'recordedApprover',approved_by,'humanPublicationEvidence',null,'reviewStage',14),
 status='draft'
where status='approved' and (approval_basis='migration' or approved_by is null);
create or replace function private.house_usage_allowed_v1(p_version uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.house_playbook_versions v join auth.users u on u.id=v.approved_by
 where v.id=p_version and v.status='approved' and v.approval_basis in ('founder_review','credit_committee') and v.approved_at is not null
 and v.usage_license='offroad_owned_private_analysis_v1' and (v.usage_expires_at is null or v.usage_expires_at>clock_timestamp())
 and u.deleted_at is null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now()));
$$;
-- Existing published method release registry is independent and is deliberately unchanged.
