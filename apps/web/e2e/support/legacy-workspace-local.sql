-- Existing-customer fixture for legacy executor coverage. Never part of application bootstrap.
begin;
select set_config('test.legacy_email', :'email', true);
do $$ declare actor uuid; org uuid; begin
 if current_setting('test.legacy_email') not like 'e2e-%@example.com' then
  raise exception 'Synthetic account required';
 end if;
 select id into strict actor from auth.users where email=current_setting('test.legacy_email');
 select organization_id into strict org from public.organization_memberships where user_id=actor and status='active';
 update public.organizations set organization_type='company',workspace_kind='institutional' where id=org;
 insert into private.workspace_capability_grants(organization_id,capability,enabled,basis,granted_by)
 select org,cap,true,'explicit_administration',actor from unnest(array['own_analysis','origination_representation','external_disclosure']) cap
 on conflict(organization_id,capability) do update set enabled=true,basis='explicit_administration';
 insert into public.onboarding_progress(organization_id,user_id,journey,current_step,answers)
 values(org,actor,'company','organization','{}')
 on conflict(organization_id,user_id,journey) do update set journey='company',current_step='organization',answers='{}',completed_at=null;
end $$;
commit;
