-- Stage 23: metadata and real permission checks, no production fixture required.
begin;
do $$ declare name text;definition text;begin
 foreach name in array array['worker_load_agent_context','worker_load_agent_context_v2','worker_load_agent_context_v3','worker_load_agent_context_v4','worker_load_capital_project_context','worker_load_capital_project_context_v2','worker_load_capital_project_context_v3','worker_load_capital_project_context_v4','worker_load_capital_project_context_v5'] loop
  if has_function_privilege('authenticated',format('private.%I(uuid,text)',name),'EXECUTE')or has_function_privilege('anon',format('private.%I(uuid,text)',name),'EXECUTE')or has_function_privilege('service_role',format('private.%I(uuid,text)',name),'EXECUTE')then raise exception 'legacy_implementation_still_exposed:%',name;end if;
  select pg_get_functiondef(to_regprocedure(format('public.%I(uuid,text)',name)))into definition;
  if position('private.worker_load_compatibility_context_v1'in definition)=0 then raise exception 'legacy_wrapper_uses_old_authority:%',name;end if;
 end loop;
end;$$;
select 'legacy_private_endpoints_denied_public_adapters_canonical' as test,'PASS' as result;

do $$ begin
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'and p.proname like 'worker_load%'and p.proname like '%before%'and(has_function_privilege('anon',p.oid,'EXECUTE')or has_function_privilege('authenticated',p.oid,'EXECUTE')or has_function_privilege('service_role',p.oid,'EXECUTE')))then raise exception 'historical_dependency_exposed';end if;
 if has_function_privilege('anon','private.worker_load_compatibility_context_v1(uuid,text,text)','EXECUTE')then raise exception 'compatibility_adapter_anonymous';end if;
end;$$;
select 'historical_dependencies_internal_no_anonymous_adapter' as test,'PASS' as result;

set local role authenticated;
do $$ begin
 begin perform private.worker_load_capital_project_context_v2('00000000-0000-4000-8000-000000000001',repeat('x',64));raise exception 'legacy_private_call_succeeded';exception when insufficient_privilege then null;end;
 begin perform public.worker_load_agent_context_v2('00000000-0000-4000-8000-000000000001',repeat('x',64));raise exception 'legacy_adapter_accepted_forged_capability';exception when insufficient_privilege then null;end;
end;$$;
reset role;
select 'direct_legacy_call_and_forged_adapter_capability_denied' as test,'PASS' as result;

do $$ begin
 -- These nine policies cover own identity, public organizational configuration or an explicit
 -- resource predicate. Their full installed expressions remain pinned by the stage-zero checker.
 if exists(select 1 from pg_policies where schemaname in('public','storage')and cmd='SELECT'and qual~'is_org_member|is_org_owner'
 and tablename not in('access_requests','institution_capability_profiles','onboarding_progress','organization_legal_acceptances','organization_memberships','organization_review_policies','organization_rollout_policies','organizations','professional_context_profiles'))then raise exception 'private_content_membership_policy_remaining';end if;
 if exists(select 1 from pg_policies where schemaname='storage'and policyname like 'brand_templates_objects_%'and coalesce(qual,with_check)~'is_org_member')then raise exception 'brand_membership_bypass';end if;
 if position('method_scope_allowed_v1'in pg_get_functiondef('private.can_read_presentation_template_v1(uuid,uuid)'::regprocedure))=0 then raise exception 'template_reader_without_vault_authority';end if;
end;$$;
select 'private_content_has_no_membership_only_read_policy' as test,'PASS' as result;

do $$ declare body text;begin
 select pg_get_functiondef('private.save_organization_methodology(uuid,jsonb,text)'::regprocedure)into body;
 if position('public.method_releases'in body)=0 or position('''candidate'''in body)=0 or position('private.require_vault_actor_v1'in body)=0 then raise exception 'methodology_autonomous_writer';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'and p.proname like 'worker_load%'and p.prosrc like '%methodology.status = ''active''%')then raise exception 'accepted_legacy_methodology_used_as_publication';end if;
end;$$;
select 'legacy_methodology_is_only_candidate_under_vault_authority' as test,'PASS' as result;

do $$ declare body text;begin
 select pg_get_functiondef('private.worker_can_read_brand_template_v1(text)'::regprocedure)into body;
 if position('job_authority_is_current_v1'in body)=0 or position('job_sources_rights_current_v1'in body)=0 or position('presentation_template_versions'in body)=0 then raise exception 'worker_logo_organization_lease_bypass';end if;
end;$$;
select 'worker_logo_requires_current_job_rights_and_registered_exact_path' as test,'PASS' as result;
do $$ declare relation regclass;name text;actor text;begin
 foreach name in array array['public.information_pack_items','public.information_pack_revisions','public.pack_access_events','public.pack_distribution_authorizations','public.pack_distribution_next_steps','public.pack_distribution_shares','public.pack_recipient_responses','public.qualified_contact_preparations'] loop
  relation:=to_regclass(name);
  if relation is not null then
   foreach actor in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(actor,relation,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'unreleased_distribution_access:%:%',name,actor;end if;
   end loop;
  end if;
 end loop;
end;$$;
select 'unreleased_distribution_has_no_data_api_table_grant' as test,'PASS' as result;
rollback;
