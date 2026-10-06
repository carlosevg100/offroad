-- Stage 23: one current authority, explicit compatibility, no destructive history cleanup.
set search_path = '';

create function private.worker_load_compatibility_context_v1(p_job_id uuid,p_capability_token text,p_loader text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb;
begin
 perform private.job_for_capability(p_job_id,p_capability_token);
 if p_loader in ('worker_load_agent_context','worker_load_agent_context_v2','worker_load_agent_context_v3') then
  perform private.require_receivables_scope_aware_reader(p_job_id,p_capability_token);
  return private.worker_load_agent_context_v5(p_job_id,p_capability_token);
 elsif p_loader='worker_load_agent_context_v4' then
  perform private.require_receivables_support_sheet_reader(p_job_id,p_capability_token);
  return private.worker_load_agent_context_v5(p_job_id,p_capability_token) #- array['confirmed_receivables_scope','supportSheetCandidates'];
 elsif p_loader in ('worker_load_capital_project_context','worker_load_capital_project_context_v2','worker_load_capital_project_context_v3','worker_load_capital_project_context_v4','worker_load_capital_project_context_v5') then
  return private.worker_load_capital_project_context_v6(p_job_id,p_capability_token);
 end if;
 raise exception 'legacy_loader_not_classified' using errcode='42501';
end;$$;
revoke all on function private.worker_load_compatibility_context_v1(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_load_compatibility_context_v1(uuid,text,text) to authenticated;
comment on function private.worker_load_compatibility_context_v1(uuid,text,text) is 'Compatibility only. Current job authority and canonical loader apply. No legacy implementation is directly exposed.';

create or replace function public.worker_load_agent_context(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.worker_load_compatibility_context_v1(p_job_id,p_capability_token,'worker_load_agent_context');
$$;
revoke all on function private.worker_load_agent_context(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.worker_load_agent_context(uuid,text) from public,anon,service_role;
grant execute on function public.worker_load_agent_context(uuid,text) to authenticated;
create or replace function public.worker_load_agent_context_v2(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.worker_load_compatibility_context_v1(p_job_id,p_capability_token,'worker_load_agent_context_v2');
$$;
revoke all on function private.worker_load_agent_context_v2(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.worker_load_agent_context_v2(uuid,text) from public,anon,service_role;
grant execute on function public.worker_load_agent_context_v2(uuid,text) to authenticated;
create or replace function public.worker_load_agent_context_v3(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.worker_load_compatibility_context_v1(p_job_id,p_capability_token,'worker_load_agent_context_v3');
$$;
revoke all on function private.worker_load_agent_context_v3(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.worker_load_agent_context_v3(uuid,text) from public,anon,service_role;
grant execute on function public.worker_load_agent_context_v3(uuid,text) to authenticated;
create or replace function public.worker_load_agent_context_v4(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.worker_load_compatibility_context_v1(p_job_id,p_capability_token,'worker_load_agent_context_v4');
$$;
revoke all on function private.worker_load_agent_context_v4(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.worker_load_agent_context_v4(uuid,text) from public,anon,service_role;
grant execute on function public.worker_load_agent_context_v4(uuid,text) to authenticated;
create or replace function public.worker_load_capital_project_context(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.worker_load_compatibility_context_v1(p_job_id,p_capability_token,'worker_load_capital_project_context');
$$;
revoke all on function private.worker_load_capital_project_context(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.worker_load_capital_project_context(uuid,text) from public,anon,service_role;
grant execute on function public.worker_load_capital_project_context(uuid,text) to authenticated;
create or replace function public.worker_load_capital_project_context_v2(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.worker_load_compatibility_context_v1(p_job_id,p_capability_token,'worker_load_capital_project_context_v2');
$$;
revoke all on function private.worker_load_capital_project_context_v2(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.worker_load_capital_project_context_v2(uuid,text) from public,anon,service_role;
grant execute on function public.worker_load_capital_project_context_v2(uuid,text) to authenticated;
create or replace function public.worker_load_capital_project_context_v3(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.worker_load_compatibility_context_v1(p_job_id,p_capability_token,'worker_load_capital_project_context_v3');
$$;
revoke all on function private.worker_load_capital_project_context_v3(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.worker_load_capital_project_context_v3(uuid,text) from public,anon,service_role;
grant execute on function public.worker_load_capital_project_context_v3(uuid,text) to authenticated;
create or replace function public.worker_load_capital_project_context_v4(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.worker_load_compatibility_context_v1(p_job_id,p_capability_token,'worker_load_capital_project_context_v4');
$$;
revoke all on function private.worker_load_capital_project_context_v4(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.worker_load_capital_project_context_v4(uuid,text) from public,anon,service_role;
grant execute on function public.worker_load_capital_project_context_v4(uuid,text) to authenticated;
create or replace function public.worker_load_capital_project_context_v5(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.worker_load_compatibility_context_v1(p_job_id,p_capability_token,'worker_load_capital_project_context_v5');
$$;
revoke all on function private.worker_load_capital_project_context_v5(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.worker_load_capital_project_context_v5(uuid,text) from public,anon,service_role;
grant execute on function public.worker_load_capital_project_context_v5(uuid,text) to authenticated;

-- Internal historical dependencies are retained; zero counters with track_functions=none are not proof of disuse.
do $$ declare f record;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private'and p.proname like 'worker_load%'and p.proname like '%before%' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.oid::regprocedure);
 end loop;
end;$$;

-- Tenant membership and identity administration do not grant access to reusable private content.
do $$ declare body text;begin
 select pg_get_functiondef('private.can_read_presentation_template_v1(uuid,uuid)'::regprocedure) into body;
 if position('private.is_org_member(t.organization_id)'in body)=0 then raise exception 'template_reader_definition_changed';end if;
 body:=replace(body,'private.is_org_member(t.organization_id)','private.method_scope_allowed_v1(t.organization_id,''read'')');execute body;
 select pg_get_functiondef('private.set_presentation_template_v1(uuid,uuid,jsonb,jsonb)'::regprocedure) into body;
 if position('if p_project_id is not null then perform private.require_resource_access_v1'in body)=0 then raise exception 'template_writer_definition_changed';end if;
 body:=replace(body,'if p_project_id is not null then perform private.require_resource_access_v1',
 'if p_project_id is null and not private.method_scope_allowed_v1(p_organization_id,''work'') then raise exception ''template_authoring_denied'' using errcode=''42501'';end if; if p_project_id is not null then perform private.require_resource_access_v1');execute body;
end;$$;

drop policy presentation_templates_select on public.presentation_templates;
create policy presentation_templates_select on public.presentation_templates for select to authenticated
using(private.can_read_presentation_template_v1(organization_id,id));

create function private.brand_template_object_read_allowed_v1(p_path text) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.presentation_templates t join public.presentation_template_versions v
 on v.organization_id=t.organization_id and v.template_id=t.id
 where v.definition#>>'{logo,object_path}'=p_path and t.organization_id=private.storage_organization_id(p_path)
 and private.can_read_presentation_template_v1(t.organization_id,t.id));
$$;
revoke all on function private.brand_template_object_read_allowed_v1(text) from public,anon,authenticated,service_role;
grant execute on function private.brand_template_object_read_allowed_v1(text) to authenticated;
drop policy brand_templates_objects_select on storage.objects;
create policy brand_templates_objects_select on storage.objects for select to authenticated
using(bucket_id='brand-templates'and private.brand_template_object_read_allowed_v1(name));

drop policy brand_templates_objects_insert on storage.objects;
create policy brand_templates_objects_insert on storage.objects for insert to authenticated
with check(bucket_id='brand-templates'and private.method_scope_allowed_v1(private.storage_organization_id(name),'work')and private.can_manage_organization(private.storage_organization_id(name)));
drop policy brand_templates_objects_update on storage.objects;
create policy brand_templates_objects_update on storage.objects for update to authenticated
using(bucket_id='brand-templates'and private.method_scope_allowed_v1(private.storage_organization_id(name),'work')and private.can_manage_organization(private.storage_organization_id(name)))
with check(bucket_id='brand-templates'and private.method_scope_allowed_v1(private.storage_organization_id(name),'work')and private.can_manage_organization(private.storage_organization_id(name)));
drop policy brand_templates_objects_delete on storage.objects;
create policy brand_templates_objects_delete on storage.objects for delete to authenticated
using(bucket_id='brand-templates'and private.method_scope_allowed_v1(private.storage_organization_id(name),'work')and private.can_manage_organization(private.storage_organization_id(name)));

create or replace function private.worker_can_read_brand_template_v1(p_object_path text) returns boolean
language sql volatile security definer set search_path='' as $$
 select auth.uid()is not null and exists(select 1 from public.processing_jobs j
 join public.presentation_templates t on t.organization_id=j.organization_id
 join public.presentation_template_versions v on v.organization_id=t.organization_id and v.template_id=t.id
 where j.status='leased'and j.kind='capital_project_analysis'and j.leased_account_user_id=auth.uid()
 and j.lease_expires_at>clock_timestamp()and j.organization_id=private.storage_organization_id(p_object_path)
 and v.definition#>>'{logo,object_path}'=p_object_path
 and private.job_authority_is_current_v1(j.id)and private.job_sources_rights_current_v1(j.id)
 and case when t.capital_project_id is not null then
 t.capital_project_id=j.authorization_resource_id and private.resource_access_as_subject_v1(t.organization_id,t.capital_project_id,j.authorization_subject_id,'read')
 else exists(select 1 from public.vault_scopes s where s.organization_id=t.organization_id
 and private.evaluate_resource_policy_v1(t.organization_id,s.id,j.authorization_subject_id,'read','analysis'))end);
$$;
revoke all on function private.worker_can_read_brand_template_v1(text) from public,anon,service_role;
grant execute on function private.worker_can_read_brand_template_v1(text) to authenticated;
