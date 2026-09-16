-- Existing-customer fixture provisioning only. Included inside each legacy test transaction.
-- The real organization trigger now grants own_analysis only. These explicit fixture grants
-- retain the older suites' declared company/advisor/financier setup without restoring that
-- production default. New identity/capability tests deliberately do not include this adapter.
create function pg_temp.provision_legacy_fixture_capabilities() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.organization_type in ('company','originator') then
  insert into private.workspace_capability_grants(organization_id,capability,enabled,basis,granted_by)
  values(new.id,'origination_representation',true,'explicit_administration',new.created_by),
        (new.id,'external_disclosure',true,'explicit_administration',new.created_by)
  on conflict(organization_id,capability) do nothing;
 elsif new.organization_type='capital_provider' then
  insert into private.workspace_capability_grants(organization_id,capability,enabled,basis,granted_by)
  values(new.id,'mandate_management',true,'explicit_administration',new.created_by)
  on conflict(organization_id,capability) do nothing;
 end if;
 return new;
end $$;
create trigger zz_synthetic_legacy_workspace_capabilities after insert on public.organizations
for each row execute function pg_temp.provision_legacy_fixture_capabilities();
