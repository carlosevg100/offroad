-- Legacy opportunities have their own resource authority; never route their observations
-- through a broader company or project dossier.
create or replace function private.register_resource_dossier_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.resource_kind in ('company','capital_project','intake_session','opportunity') then
  insert into public.dossiers(organization_id,resource_id,legacy_company_id) values(new.organization_id,new.id,new.company_id) on conflict do nothing;
 end if;
 return new;
end $$;
insert into public.dossiers(organization_id,resource_id,legacy_company_id)
select r.organization_id,r.id,o.company_id from private.access_resources r
join public.opportunities o on o.organization_id=r.organization_id and o.id=r.id
where r.resource_kind='opportunity'
on conflict(organization_id,resource_id) do nothing;
