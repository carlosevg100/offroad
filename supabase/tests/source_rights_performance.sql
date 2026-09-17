begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
insert into public.case_retrieval_chunks(organization_id,intake_session_id,source_document_id,document_version,processing_run_id,chunk_key,content,content_hash,source_anchor)
select 'a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000004',1,'a11b0000-0000-4000-9000-000000000005','rights-perf-'||n,body,encode(extensions.digest(body,'sha256'),'hex'),'{}'
from (select n,repeat('Synthetic confidential source evidence for retrieval performance. ',100)||n as body from generate_series(1,500) n) fixture;
analyze public.case_retrieval_chunks;
analyze private.source_rights_versions;
create temporary table rights_search_measurement(plan jsonb);
grant all on rights_search_measurement to authenticated;
set local role authenticated;
do $$ declare plan jsonb; begin
 execute $query$explain(analyze,buffers,format json) select * from public.search_authorized_resources_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','confidential',12)$query$ into plan;
 if (plan#>>'{0,Plan,Actual Rows}')::integer<>12 then raise exception 'performance probe did not exercise bounded search'; end if;
 if (plan#>>'{0,Execution Time}')::numeric>2000 then raise exception 'authorized retrieval exceeded two seconds for 501 chunks: %',plan#>>'{0,Execution Time}'; end if;
 insert into rights_search_measurement values(plan);
end $$;
reset role;
-- These indexes serve latest-right lookup and both directions of the dependency graph.
do $$ begin
 if not exists(select 1 from pg_indexes where schemaname='private' and tablename='source_rights_versions' and indexdef like '%(organization_id, source_version_id, revision)%')
 or not exists(select 1 from pg_indexes where schemaname='private' and tablename='resource_dependencies' and indexdef like '%(organization_id, derived_version_id, source_version_id)%')
 or not exists(select 1 from pg_indexes where schemaname='private' and tablename='resource_dependencies' and indexdef like '%(organization_id, source_version_id, source_rights_version_id)%') then raise exception 'rights/dependency lookup index missing'; end if;
end $$;
select 'source_rights_performance' as test,'PASS' as result,plan from rights_search_measurement;
rollback;
