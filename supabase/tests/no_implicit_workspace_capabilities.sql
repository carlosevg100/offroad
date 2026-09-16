-- No legacy fixture adapter: labels and old registration parameters confer no authority.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('a2220000-0000-4000-8000-000000000001','explicit-capability-owner@example.invalid','{}'),
 ('a2220000-0000-4000-8000-000000000002','legacy-signup@example.invalid','{"registration_role":"capital_provider","role":"owner"}');
select set_config('request.jwt.claim.sub','a2220000-0000-4000-8000-000000000001',true);
select set_config('request.headers','{}',true);
set local role authenticated;
do $$ declare label text; org uuid; context jsonb; begin
 foreach label in array array['company','originator','capital_provider','institutional','personal'] loop
  org:=public.create_organization_with_owner_v1(label,'Synthetic explicit capability');
  perform set_config('request.headers',jsonb_build_object('x-offroad-workspace',org)::text,true);
  context:=public.get_workspace_context_v1();
  if context#>>'{capabilities,own_analysis}'<>'true'
   or context#>>'{capabilities,mandate_management}'<>'false'
   or context#>>'{capabilities,origination_representation}'<>'false'
   or context#>>'{capabilities,external_disclosure}'<>'false' then
   raise exception 'Commercial label % granted capabilities',label;
  end if;
  perform public.set_workspace_capability_v1('origination_representation',true,0);
  if public.get_workspace_context_v1()#>>'{capabilities,origination_representation}'<>'true' then
   raise exception 'Explicit grant was not respected';
  end if;
  if label<>'personal' then
   update public.organizations set organization_type='capital_provider' where id=org;
   context:=public.get_workspace_context_v1();
   if context#>>'{capabilities,mandate_management}'<>'false'
    or context#>>'{capabilities,origination_representation}'<>'true' then
    raise exception 'Label edit changed authority';
   end if;
  end if;
 end loop;
end $$;
select set_config('request.jwt.claim.sub','a2220000-0000-4000-8000-000000000002',true);
select set_config('request.headers','{}',true);
do $$ declare org uuid; context jsonb; begin
 org:=public.initialize_professional_onboarding('capital_provider','Synthetic legacy signup','CEO','pt-BR');
 context:=public.get_workspace_context_v1();
 if context->>'workspace_kind'<>'personal' or context#>>'{capabilities,mandate_management}'<>'false' then
  raise exception 'Legacy registration retained commercial default';
 end if;
 if org<>public.initialize_professional_onboarding('company','Synthetic legacy signup',null,'pt-BR') then
  raise exception 'Compatibility command lost idempotence';
 end if;
 if exists(select 1 from public.onboarding_progress where organization_id=org) then
  raise exception 'Compatibility command fabricated commercial intake';
 end if;
end $$;
reset role;
do $$ begin
 if to_regprocedure('private.organization_has_workspace_capability(text,text)') is not null
  or to_regprocedure('private.require_workspace_capability(text,text)') is not null then
  raise exception 'Label-based authority helpers remain installed';
 end if;
end $$;
select 'no_implicit_workspace_capabilities: PASS' result;
rollback;
