-- Synthetic fault injection after result persistence; all changes roll back.
begin;
\ir support/execution_artifact_setup.sql
create function pg_temp.fail_projection() returns trigger language plpgsql as $$begin raise exception 'synthetic_projection_failure';end $$;
create trigger synthetic_projection_failure before insert on public.artifact_revisions for each row execute function pg_temp.fail_projection();
select pg_temp.commit_execution('a5203000-0000-4000-9000-000000000001',current_setting('test.producers.packet'),pg_temp.source_version('synthetic-recovery'));
drop trigger synthetic_projection_failure on public.artifact_revisions;

create temporary table recovery_counts as select
 (select count(*) from public.processing_jobs) jobs,
 (select count(*) from private.execution_result_receipts) results,
 (select count(*) from private.execution_operation_receipts) operations,
 (select coalesce(sum(spent_microusd),0) from private.execution_budget_accounts) spent;

do $$
declare ex uuid:='a5203000-0000-4000-9000-000000000001';org uuid:='a11b0000-0000-4000-9000-000000000001';fp text;r jsonb;again jsonb;j uuid;
begin
 select result_fingerprint into strict fp from private.execution_result_receipts where execution_id=ex;
 select id into strict j from public.processing_jobs where execution_id=ex;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 set local role authenticated;
 r:=public.read_work_execution_v2(ex);
 if r#>>'{artifactProjection,state}'<>'missing' or r#>>'{result,resultFingerprint}'<>fp then raise exception 'persisted result missing projection not observable';end if;
 reset role;
 perform pg_temp.refused(format('set local role authenticated;select public.recover_execution_result_artifact_v1(%L,%L)',ex,repeat('f',64)),
  'execution_result_fingerprint_mismatch','wrong expected result cannot recover');
 set local role authenticated;
 r:=public.recover_execution_result_artifact_v1(ex,fp);
 again:=public.recover_execution_result_artifact_v1(ex,fp);
 if r->>'recorded'<>'true' or r->>'replayed'<>'false' or again->>'replayed'<>'true'
  or r->>'revisionId'<>again->>'revisionId' then raise exception 'recovery is not exact and idempotent: % %',r,again;end if;
 if public.read_work_execution_v2(ex)#>>'{artifactProjection,state}'<>'available' then raise exception 'recovered projection not observable';end if;
 reset role;
 if (select count(*) from public.artifact_revisions where id=pg_temp.revision_of(ex))<>1
  or (select count(*) from public.audit_events where resource_id=ex::text and action='execution_artifact_recovered')<>1
  or not exists(select 1 from public.artifact_revisions where id=pg_temp.revision_of(ex) and origin='worker' and created_by is null and manifest#>>'{provenance,jobId}'=j::text)
 then raise exception 'recovery duplicated or rewrote provenance';end if;
 if private.record_execution_result_artifact_v1('a11b0000-0000-4000-9000-000000000099',ex,j)->>'recorded'='true'
 then raise exception 'UUID-only cross scope replay';end if;
 raise notice 'PASS: failed artifact keeps committed result; authorized recovery and replay preserve identity and provenance';
end $$;

-- Revocation is enforced even for an existing projection: neither replay nor the
-- state reader can use the original successful result as an authority bypass.
do $$
declare ex uuid:='a5203000-0000-4000-9000-000000000001';sv uuid;fp text;rev integer;
begin
 select source_version_id into strict sv from private.execution_source_bindings where execution_id=ex;
 select result_fingerprint into strict fp from private.execution_result_receipts where execution_id=ex;
 select max(revision) into rev from private.source_rights_versions where source_version_id=sv;
 set local role authenticated;
 perform public.set_source_rights_v1(sv,rev,array['process'],array['analysis'],null,null,sv,repeat('a',64));
 if public.read_work_execution_v2(ex)#>>'{artifactProjection,state}'<>'restricted' then raise exception 'source restriction not observable';end if;
 reset role;
 perform pg_temp.refused(format('set local role authenticated;select public.recover_execution_result_artifact_v1(%L,%L)',ex,fp),
  'execution_recovery_access_denied','revoked source denies recovery replay');
end $$;

-- Unknown schema is explicitly unsupported, not an invitation to rerun a model.
do $$
declare ex uuid:='a5203000-0000-4000-9000-000000000002';fp text;r jsonb;
begin
 perform pg_temp.commit_execution(ex,'{"status":"partial","reason":"budget_exhausted"}',null);
 select result_fingerprint into strict fp from private.execution_result_receipts where execution_id=ex;
 set local role authenticated;
 if public.read_work_execution_v2(ex)#>>'{artifactProjection,state}'<>'unsupported' then raise exception 'unsupported not observable';end if;
 r:=public.recover_execution_result_artifact_v1(ex,fp);
 if r->>'recorded'<>'false' or r->>'reason'<>'execution_result_unmappable' then raise exception 'unsupported recovery fabricated projection';end if;
 reset role;
end $$;

-- Check only the original recovery's accounting: the unsupported fixture above
-- deliberately adds one independent execution with zero cost.
do $$
begin
 if exists(select 1 from recovery_counts c where c.jobs+1<>(select count(*) from public.processing_jobs)
  or c.results+1<>(select count(*) from private.execution_result_receipts)
  or c.operations+1<>(select count(*) from private.execution_operation_receipts)
  or c.spent<>(select coalesce(sum(spent_microusd),0) from private.execution_budget_accounts))
 then raise exception 'artifact recovery changed execution accounting';end if;
 if has_function_privilege('authenticated','private.project_execution_result_artifact_v1(uuid,uuid,uuid,uuid)','execute')
  or has_function_privilege('anon','public.recover_execution_result_artifact_v1(uuid,text)','execute')
  or has_function_privilege('service_role','public.recover_execution_result_artifact_v1(uuid,text)','execute')
 then raise exception 'recovery grants too broad';end if;
end $$;
-- A different authorized person can recover after the original requester leaves.
savepoint original_requester_revoked;
create trigger synthetic_projection_failure before insert on public.artifact_revisions for each row execute function pg_temp.fail_projection();
select pg_temp.commit_execution('a5203000-0000-4000-9000-000000000003',current_setting('test.producers.packet'),pg_temp.source_version('synthetic-successor'));
drop trigger synthetic_projection_failure on public.artifact_revisions;
do $$
declare ex uuid:='a5203000-0000-4000-9000-000000000003';fp text;p uuid;r jsonb;
begin
 select result_fingerprint into strict fp from private.execution_result_receipts where execution_id=ex;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');
 perform pg_temp.refused(format('set local role authenticated;select public.recover_execution_result_artifact_v1(%L,%L)',ex,fp),
  'review_work_access_required','membership alone cannot recover');
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 perform public.grant_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002','work');
 select id into strict p from private.principals where organization_id='a11b0000-0000-4000-9000-000000000001'
  and user_id='a11b0000-0000-4000-8000-000000000001' and kind='human';
 perform public.revoke_principal_access_v1(p);
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');
 set local role authenticated;
 r:=public.recover_execution_result_artifact_v1(ex,fp);
 reset role;
 if r->>'recorded'<>'true' or not exists(select 1 from public.audit_events where resource_id=ex::text
  and action='execution_artifact_recovered' and actor_user_id='a11b0000-0000-4000-8000-000000000002')
 then raise exception 'successor could not recover with current authority';end if;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 perform pg_temp.refused(format('set local role authenticated;select public.recover_execution_result_artifact_v1(%L,%L)',ex,fp),
  'review_work_access_required','revoked requester cannot use recovery');
end $$;
rollback to original_requester_revoked;
select 'PASS: execution_artifact_recovery' as result;
rollback;
