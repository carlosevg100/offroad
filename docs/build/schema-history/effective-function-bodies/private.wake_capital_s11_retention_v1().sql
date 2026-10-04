CREATE OR REPLACE FUNCTION private.wake_capital_s11_retention_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare row_data jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;org uuid:=(row_data->>'organization_id')::uuid;allocation uuid;
begin
 if tg_table_name='capital_projects' and tg_op='UPDATE' and(to_jsonb(new)-array['updated_at','current_phase']) is not distinct from(to_jsonb(old)-array['updated_at','current_phase']) then return new;end if;
 if tg_table_name='capital_project_artifacts' then
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct a.organization_id,a.id from private.capital_public_payload_allocations a join private.capital_s11_body_bases b on b.organization_id=a.organization_id and b.id=a.s11_body_basis_id
 where a.organization_id=org and b.recipe_id in(select recipe_id from private.capital_s11_recipe_components where organization_id=org and dependency_artifact_id=(row_data->>'id')::uuid);
 elsif tg_table_name='capital_public_payload_purge_queue' then
 allocation:=(row_data->>'allocation_id')::uuid;
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct a.organization_id,a.id from private.capital_public_payload_allocations a join private.capital_s11_body_bases b on b.organization_id=a.organization_id and b.id=a.s11_body_basis_id
 where a.organization_id=org and b.recipe_id in(
 select c.recipe_id from private.capital_s11_recipe_components c join private.capital_public_retained_payloads p on p.organization_id=c.organization_id and p.id=c.retained_payload_id where c.organization_id=org and p.allocation_id=allocation
 union select b0.recipe_id from private.capital_public_payload_allocations a0 join private.capital_s11_body_bases b0 on b0.organization_id=a0.organization_id and b0.id=a0.s11_body_basis_id where a0.organization_id=org and a0.id=allocation);
 else
 -- Authority writes only append wake identities. They never wait for purge
 -- leases while holding resource-policy locks; common drain owns q frontier.
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct a.organization_id,a.id from private.capital_public_payload_allocations a join private.capital_s11_body_bases b on b.organization_id=a.organization_id and b.id=a.s11_body_basis_id
 where a.organization_id=org or b.recipe_id in(select c.recipe_id from private.capital_s11_recipe_components c join private.capital_public_delivery_licenses l on l.organization_id=c.organization_id and l.id=c.license_id where l.licensing_organization_id=org);
 end if;
 return case when tg_op='DELETE' then old else new end;
end; $function$
