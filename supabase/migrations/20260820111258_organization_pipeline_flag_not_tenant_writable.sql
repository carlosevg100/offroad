-- A column-level revoke is silent while a table-level UPDATE grant stands: Postgres reads the
-- table grant as covering every column, including ones added later. The previous migration
-- therefore left `pipeline_enabled` writable by any member — a tenant could switch its own
-- extractor. Grants have to be stated per column for the exclusion to mean anything.
--
-- Verified against the project after applying:
--   has_column_privilege('authenticated', …, 'pipeline_enabled', 'update') = false
--   has_column_privilege('authenticated', …, 'name', 'update')             = true
revoke update on table public.organizations from authenticated;

grant update (
  organization_type, name, legal_name, country_code, website, verification_status,
  created_by, created_at, updated_at, state_code, city, sector, subsector, provider_type,
  description
) on table public.organizations to authenticated;
