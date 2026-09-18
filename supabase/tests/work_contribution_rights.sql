begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
set local role authenticated;
select public.submit_work_contribution_v1('a11b0000-0000-4000-9000-000000000002','a4120000-0000-4000-9000-000000000001','a4120000-0000-4000-9000-000000000002',null,null,'Synthetic derived note',array['a11b0000-0000-4000-9000-000000000004']::uuid[]);
select public.promote_contribution_to_work_v1('a4120000-0000-4000-9000-000000000002','a4120000-0000-4000-9000-000000000003');
do $$ declare result jsonb; begin
 result:=public.promote_contribution_to_work_v1('a4120000-0000-4000-9000-000000000002','a4120000-0000-4000-9000-000000000004');
 if result->>'revisionId'<>'a4120000-0000-4000-9000-000000000003' or result->>'replayed'<>'true' then raise exception 'repeated sharing duplicated disclosure';end if;
 begin perform public.submit_work_contribution_v1('a11b0000-0000-4000-9000-000000000002','a4120000-0000-4000-9000-000000000001','a4120000-0000-4000-9000-000000000002',null,null,'substituted content');raise exception 'request UUID replaced content';exception when invalid_parameter_value then null;end;
end $$;
select public.submit_work_contribution_v1('a11b0000-0000-4000-9000-000000000002','a4120000-0000-4000-9000-000000000010','a4120000-0000-4000-9000-000000000011',null,'a4120000-0000-4000-9000-000000000003','Synthetic branch inheriting source rights');
-- Rebasing a restricted candidate onto an unrestricted shared base retains both parents.
select public.submit_work_contribution_v1('a11b0000-0000-4000-9000-000000000002','a4120000-0000-4000-9000-000000000020','a4120000-0000-4000-9000-000000000021',null,null,'Synthetic unrestricted base');
select public.promote_contribution_to_work_v1('a4120000-0000-4000-9000-000000000021','a4120000-0000-4000-9000-000000000022');
select public.submit_work_contribution_v1('a11b0000-0000-4000-9000-000000000002','a4120000-0000-4000-9000-000000000010','a4120000-0000-4000-9000-000000000012','a4120000-0000-4000-9000-000000000011','a4120000-0000-4000-9000-000000000022','Synthetic rebased candidate');
-- Withdrawing derive while preserving read must hide both originals and copied descendants.
reset role;
do $$ begin
 if exists(select 1 from private.contribution_source_dependencies d where d.organization_id='a11b0000-0000-4000-9000-000000000001'
 and not exists(select 1 from public.audit_events a where a.organization_id=d.organization_id and a.resource_type='contribution_source_dependencies' and a.resource_id=d.id::text and a.action='insert' and a.metadata='{"operation":"INSERT"}'::jsonb)) then raise exception 'source dependency lacks content-free audit';end if;
 if (select count(*) from pg_policies where schemaname='private' and tablename='contribution_source_dependencies')<>4 then raise exception 'dependency policies must be explicit per command';end if;
end $$;
insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
select organization_id,source_version_id,revision+1,array['read','store'],purposes,audience,now(),'human_declaration',evidence_reference,evidence_sha256,created_by
from private.source_rights_versions where source_version_id='a11b0000-0000-4000-9000-000000000004' order by revision desc limit 1;
set local role authenticated;
do $$ begin
 if not exists(select 1 from public.source_versions where id='a11b0000-0000-4000-9000-000000000004') then raise exception 'fixture should retain direct source read';end if;
 if exists(select 1 from public.contribution_revisions where id in ('a4120000-0000-4000-9000-000000000002','a4120000-0000-4000-9000-000000000003','a4120000-0000-4000-9000-000000000011','a4120000-0000-4000-9000-000000000012')) then raise exception 'derivative survived withdrawal of derive';end if;
 begin perform public.submit_work_contribution_v1('a11b0000-0000-4000-9000-000000000002','a4120000-0000-4000-9000-000000000010',gen_random_uuid(),'a4120000-0000-4000-9000-000000000012',null,'Omit source to launder lineage');raise exception 'omission laundered source restriction';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.headers','{"x-offroad-workspace":"a4120000-0000-4000-9000-000000000099"}',true);
do $$ begin
 if exists(select 1 from public.work_channels) then raise exception 'wrong workspace read channels';end if;
 begin perform public.list_work_people_v1('a11b0000-0000-4000-9000-000000000002');raise exception 'wrong workspace enumerated people';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'work_contribution_rights: PASS' result;
rollback;
