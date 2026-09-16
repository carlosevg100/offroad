-- Complete the rolling registration cutover after the compatible web is deployed.
-- Existing explicit grants remain unchanged. New labels confer no commercial authority.
create or replace function private.seed_workspace_foundation_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare account_id uuid;
begin
 insert into private.commercial_accounts(organization_id) values(new.id) returning id into account_id;
 insert into private.account_organizations(organization_id,account_owner_organization_id,commercial_account_id,linked_by)
 values(new.id,new.id,account_id,new.created_by);
 if new.organization_type<>'offroad' then
  insert into private.workspace_capability_grants(organization_id,capability,basis)
  values(new.id,'own_analysis','workspace_foundation');
 end if;
 return new;
end $$;

create or replace function public.initialize_professional_onboarding(
 p_journey text,p_full_name text,p_job_title text default null,p_locale text default 'pt-BR'
) returns uuid language plpgsql security invoker set search_path='' as $$
begin
 if p_journey is null or p_journey not in ('company','originator','capital_provider') then
  raise exception 'invalid_journey' using errcode='22023';
 end if;
 -- Historical market-side metadata is accepted for wire compatibility, never for authority.
 return public.initialize_workspace_v1(p_full_name,p_locale);
end $$;

drop function private.require_workspace_capability(text,text);
drop function private.organization_has_workspace_capability(text,text);
