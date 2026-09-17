begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
insert into public.capital_projects(id,organization_id,project_name,created_by)
values('a7730000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000001','Synthetic second dossier','a11b0000-0000-4000-8000-000000000002');
insert into public.document_intake_sessions(id,organization_id,started_by,journey,capital_project_id)
values('a7730000-0000-4000-9000-000000000002','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-8000-000000000002','originator','a7730000-0000-4000-9000-000000000001');
insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,mime_type,created_by,processing_status)
values('a7730000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000001','a7730000-0000-4000-9000-000000000002','a11b0000-0000-4000-9000-000000000001/a7730000-0000-4000-9000-000000000002/synthetic.txt','Synthetic second private source','text/plain','a11b0000-0000-4000-8000-000000000002','ready');
insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,pipeline_version,created_by)
values('a7730000-0000-4000-9000-000000000004','a11b0000-0000-4000-9000-000000000001','a7730000-0000-4000-9000-000000000002',1,'manual','synthetic-rights','a11b0000-0000-4000-8000-000000000002');
insert into public.case_retrieval_chunks(organization_id,intake_session_id,source_document_id,document_version,processing_run_id,chunk_key,content,content_hash,source_anchor)
values('a11b0000-0000-4000-9000-000000000001','a7730000-0000-4000-9000-000000000002','a7730000-0000-4000-9000-000000000003',1,'a7730000-0000-4000-9000-000000000004','forbidden-dossier','confidential confidential confidential confidential',encode(extensions.digest('confidential confidential confidential confidential','sha256'),'hex'),'{}');
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.search_authorized_resources_v1('a11b0000-0000-4000-9000-000000000001','a7730000-0000-4000-9000-000000000002','confidential')) then raise exception 'organization administrator read another dossier through batched search'; end if;
 if exists(select 1 from private.search_authorized_resources_v1('a11b0000-0000-4000-9000-000000000001','a7730000-0000-4000-9000-000000000002','confidential')) then raise exception 'private entrypoint bypassed dossier authorization'; end if;
 if (select count(*) from public.search_authorized_resources_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','confidential'))<>1 then raise exception 'search mixed dossier candidates or lost the authorized source'; end if;
 perform set_config('request.headers','{"x-offroad-workspace":"a7730000-0000-4000-9000-000000000099"}',true);
 if exists(select 1 from public.search_authorized_resources_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','confidential')) then raise exception 'search ignored selected workspace'; end if;
end $$;
reset role;
select 'source_rights_search_isolation' as test,'PASS' as result;
rollback;
