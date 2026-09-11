-- The released R01 receivables analysis becomes universal. The founder approved the method on
-- 10 September 2026, so the reading is no longer a per-organization concession: every organization
-- reads its own current result. What stays operable without a deploy is the pause. A platform
-- release record holds the capability, the method it releases and the approval behind it; an
-- operator switching `released` to false closes the reading for everyone, and a single organization
-- can still be paused explicitly. Nothing here relaxes a policy, a grant or a check constraint:
-- the reader keeps returning `superseded` and `absent` exactly as before, tenant isolation is
-- untouched, and no external effect is created anywhere.

-- ---------------------------------------------------------------------------------------------
-- 1. The platform release record: one row per released capability, written by migrations or an
--    operator. It is not a tenant table and carries no organization.
-- ---------------------------------------------------------------------------------------------
create table if not exists private.platform_capability_releases (
  capability_key text primary key check (char_length(trim(capability_key)) between 3 and 200),
  released boolean not null default true,
  exposure text not null check (exposure in ('universal', 'allowlisted', 'internal', 'none')),
  method_id text not null check (char_length(trim(method_id)) between 3 and 120),
  method_version text not null check (char_length(trim(method_version)) between 3 and 120),
  method_maturity text not null check (method_maturity in ('tested', 'ready_for_founder', 'production')),
  approved_by text not null check (char_length(trim(approved_by)) between 3 and 200),
  approved_at date not null,
  approval_source text not null check (char_length(trim(approval_source)) between 3 and 500),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.platform_capability_releases enable row level security;
alter table private.platform_capability_releases force row level security;
drop policy if exists platform_capability_releases_deny on private.platform_capability_releases;
create policy platform_capability_releases_deny on private.platform_capability_releases
  as restrictive for all to public using (false) with check (false);
revoke all on table private.platform_capability_releases from public, anon, authenticated;

comment on table private.platform_capability_releases is
  'Platform-level release record of a capability: which method is released, at which rung, under whose approval, and whether it is open right now. Written only by migrations or an operator, never through the Data API. Setting released to false pauses the capability for every organization without a deploy; it never authorizes an external effect.';

insert into private.platform_capability_releases (
  capability_key, released, exposure, method_id, method_version, method_maturity,
  approved_by, approved_at, approval_source, note
) values (
  'finance.receivables-released-analysis', true, 'universal',
  'underwrite-receivables-pool', '2026.09.06-v1', 'production',
  'Carlos Eduardo Galves', date '2026-09-10',
  'instrução do fundador na sessão de coordenação de 10/09/2026',
  'A leitura mostra um cálculo sob premissas declaradas: sem direcionamento externo, sem recomendação de financiador e sem aprovação de crédito.'
) on conflict (capability_key) do nothing;

-- ---------------------------------------------------------------------------------------------
-- 2. The per-organization row becomes an explicit pause, never a requirement
-- ---------------------------------------------------------------------------------------------
-- The table is kept and keeps its meaning in one direction only: a row with `enabled = false`
-- closes the released reading for that single organization. A row with `enabled = true` is now a
-- historical no-op, harmless because the universal release already covers it.
comment on table private.receivables_analytical_release_grants is
  'Per-organization exception to the universal release of the R01 receivables analysis. Under universal exposure only enabled = false matters: it pauses the released reading for that organization. Written by operators, never through the Data API, and it never authorizes external direction, a financier recommendation or a credit approval.';

create or replace function private.receivables_analytical_release_enabled(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.platform_capability_releases release_row
    where release_row.capability_key = 'finance.receivables-released-analysis'
      and release_row.released
      and release_row.exposure = 'universal'
  )
  and not exists (
    select 1
    from private.receivables_analytical_release_grants paused
    where paused.organization_id = p_organization_id
      and not paused.enabled
  );
$$;

revoke all on function private.receivables_analytical_release_enabled(uuid) from public, anon, authenticated;

comment on function private.receivables_analytical_release_enabled(uuid) is
  'Whether the released R01 reading is open for one organization: the platform release is on under universal exposure and this organization is not explicitly paused.';

-- ---------------------------------------------------------------------------------------------
-- 3. The worker learns the same answer, from the same source
-- ---------------------------------------------------------------------------------------------
create or replace function private.worker_load_receivables_analytical_release_v1(
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
  v_open boolean;
  v_note text;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;
  v_open := private.receivables_analytical_release_enabled(job_row.organization_id);
  -- The reason travels with the answer: an explicit pause for this organization first, otherwise
  -- what the platform release record says about the capability.
  select paused.note into v_note
  from private.receivables_analytical_release_grants paused
  where paused.organization_id = job_row.organization_id
    and not paused.enabled;
  if v_note is null then
    select release_row.note into v_note
    from private.platform_capability_releases release_row
    where release_row.capability_key = 'finance.receivables-released-analysis';
  end if;
  -- `granted` is the stable wire name of "the release is open for this organization"; a worker
  -- built before the universal release reads it unchanged.
  return jsonb_build_object(
    'granted', v_open,
    'organizationId', job_row.organization_id,
    'note', v_note
  );
end;
$$;

revoke all on function private.worker_load_receivables_analytical_release_v1(uuid, text) from public, anon;
grant execute on function private.worker_load_receivables_analytical_release_v1(uuid, text) to authenticated;
