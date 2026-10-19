-- The cited conversation reply: the commit calls it after the artifact producer, it cites only an
-- existing revision, it never raises, and it is closed to every API role. Everything rolls back.
begin;
set local statement_timeout='60s';

do $$
declare body text;r jsonb;
begin
 select pg_get_functiondef(p.oid) into body from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname='commit_work_execution_result_v1';
 if position('perform private.record_execution_result_reply_v1(j.organization_id,j.execution_id,j.id);' in body)
    < position('perform private.record_execution_result_artifact_v1(j.organization_id,j.execution_id,j.id);' in body) then
  raise exception 'reply is not called after the artifact producer'; end if;
 r:=private.record_execution_result_reply_v1(gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
 if r->>'recorded'<>'false' or r->>'reason'<>'revision_missing' then raise exception 'reply without revision: %',r; end if;
 if has_function_privilege('authenticated','private.record_execution_result_reply_v1(uuid,uuid,uuid)','EXECUTE')
 or has_function_privilege('service_role','private.record_execution_result_reply_v1(uuid,uuid,uuid)','EXECUTE') then
  raise exception 'reply function exposed'; end if;
 raise notice 'PASS: reply wired after the artifact, cites only existing revisions, closed to API roles';
end $$;

select 'execution_result_reply_passed' as result;
rollback;
