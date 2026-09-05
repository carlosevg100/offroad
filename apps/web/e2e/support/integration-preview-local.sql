-- Local stack only (CI e2e job and developer stacks): the worker service account, its token and
-- the integration_preview grant for every organization created during the journey. Nothing here
-- is a migration and nothing here runs against production.

-- 1. The worker's hashed credential. The plaintext is the fixed local token the CI exports.
insert into private.worker_tokens (label, token_sha256)
values ('local-e2e-worker', extensions.digest(repeat('e2e-worker-token-', 4), 'sha256'))
on conflict (token_sha256) do update set status = 'active', revoked_at = null;

-- 2. Every organization created in this stack runs the internal preview: the journey signs up a
--    fresh workspace, so the grant has to follow the insert. The database setting
--    `offroad.local_preview_mode` picks the router: `deterministic` (zero model calls, the quality
--    job) or `live` (the live gate).
create or replace function private.grant_integration_preview_locally()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator_email text;
begin
  -- Only the workspaces the preview journey signs up; the other journeys keep the released routes.
  select lower(coalesce(u.email, '')) into creator_email from auth.users u where u.id = new.created_by;
  if creator_email like 'e2e-preview-%' then
    -- psql variables do not reach a dollar-quoted body, so the mode comes from a database setting
    -- the workflow writes (`alter database ... set offroad.local_preview_mode`); default deterministic.
    insert into private.integration_preview_grants (organization_id, note, granted_by, mode)
    values (
      new.id, 'Stack local: Caso 01 em validação interna (E2E)', 'local-e2e',
      case when coalesce(current_setting('offroad.local_preview_mode', true), '') = 'live' then 'live' else 'deterministic' end
    )
    on conflict (organization_id) do update set mode = excluded.mode;
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_grant_integration_preview_locally on public.organizations;
create trigger organizations_grant_integration_preview_locally
  after insert on public.organizations
  for each row execute function private.grant_integration_preview_locally();
