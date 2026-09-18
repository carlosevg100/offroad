-- Give immutable source-dependency records a stable audited identity.
set search_path='';
alter table private.contribution_source_dependencies
 add column id uuid not null default gen_random_uuid(),
 add column updated_at timestamptz not null default now(),
 add unique(organization_id,id);
create trigger contribution_source_dependencies_updated before update on private.contribution_source_dependencies
 for each row execute function private.set_updated_at();
create trigger contribution_source_dependencies_audit after insert or update or delete on private.contribution_source_dependencies
 for each row execute function private.capture_identity_audit_v1();
drop policy contribution_sources_deny on private.contribution_source_dependencies;
create policy contribution_sources_deny_select on private.contribution_source_dependencies for select to authenticated using(false);
create policy contribution_sources_deny_insert on private.contribution_source_dependencies for insert to authenticated with check(false);
create policy contribution_sources_deny_update on private.contribution_source_dependencies for update to authenticated using(false) with check(false);
create policy contribution_sources_deny_delete on private.contribution_source_dependencies for delete to authenticated using(false);
do $$ declare body text; begin
 select pg_get_functiondef('private.pin_contribution_sources_v1(uuid,uuid,uuid[],uuid,uuid)'::regprocedure) into body;
 if position('insert into private.contribution_source_dependencies select' in body)=0
 or position('insert into private.contribution_source_dependencies values' in body)=0 then raise exception 'contribution_dependency_insert_contract_changed';end if;
 body:=replace(body,'insert into private.contribution_source_dependencies select',
 'insert into private.contribution_source_dependencies(organization_id,revision_id,source_version_id,rights_version_id) select');
 body:=replace(body,'insert into private.contribution_source_dependencies values',
 'insert into private.contribution_source_dependencies(organization_id,revision_id,source_version_id,rights_version_id) values');
 execute body;
end $$;
