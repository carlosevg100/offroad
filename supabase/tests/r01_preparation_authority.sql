begin;
\ir support/r01_preparation_setup.sql
create function pg_temp.load_r01(subject uuid default '10000000-0000-4000-8000-000000000731') returns jsonb language sql as $$
 select private.r01_preparation_authority_v1('20000000-0000-4000-8000-000000000731','30000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000090',subject);
$$;
create function pg_temp.r01_denied(label text,command text,expected_code text default '42501') returns void language plpgsql as $$begin
 begin execute command;exception when others then if sqlstate<>expected_code then raise;end if;raise notice 'PASS: %',label;return;end;
 raise exception 'Missing R01 denial: %',label;
end $$;
do $$declare got jsonb;want jsonb;begin
 select input into want from r01_loader_fixture;
 got:=pg_temp.load_r01();
 if got->'input' is distinct from want or got#>>'{authority,datasetHash}' is distinct from want#>>'{currentDraft,sourceDatasetHash}' then
  raise exception 'r01 preparation authority did not match pinned synthetic fixture';
 end if;
 raise notice 'PASS: exact scope hash, verified fragment and contiguous history';
end $$;
select pg_temp.r01_denied('worker account has no human authority',$q$select pg_temp.load_r01('10000000-0000-4000-8000-000000000732')$q$);
select pg_temp.r01_denied('another work cannot borrow this session',$q$select private.r01_preparation_authority_v1('20000000-0000-4000-8000-000000000731',gen_random_uuid(),'10000000-0000-4000-8000-000000000090','10000000-0000-4000-8000-000000000731')$q$);
savepoint changed_scope;
update public.document_intake_sessions set result_summary=jsonb_set(result_summary,'{case_state,receivablesVertical,sourceManifest,fingerprint}',to_jsonb(repeat('a',64))) where id='10000000-0000-4000-8000-000000000090';
select pg_temp.r01_denied('changed manifest denies preparation',$q$select pg_temp.load_r01()$q$);
rollback to changed_scope;
select pg_temp.r01_denied('revision mutation denied before corrupting history',$q$update private.receivables_method_supplement_drafts set revision=2 where intake_session_id='10000000-0000-4000-8000-000000000090'$q$);
select pg_temp.r01_denied('altered stored patch bytes denied at write',$q$update private.receivables_method_supplement_patches set patch=jsonb_set(patch,'{sections,accounting,value,allowanceBalance}','"999"') where intake_session_id='10000000-0000-4000-8000-000000000090'$q$,'23514');
select pg_temp.r01_denied('altered fragment bytes denied at write',$q$update private.receivables_evidence_fragments set compressed_payload=compressed_payload||decode('00','hex') where intake_session_id='10000000-0000-4000-8000-000000000090'$q$,'23514');
savepoint newer_unrelated_dataset;
insert into private.receivables_method_supplement_drafts(organization_id,capital_project_id,intake_session_id,source_dataset_hash,revision,draft_fingerprint,caused_by_patch_id,draft)
select organization_id,capital_project_id,intake_session_id,repeat('0',64),revision,draft_fingerprint,caused_by_patch_id,draft
from private.receivables_method_supplement_drafts where intake_session_id='10000000-0000-4000-8000-000000000090';
do $$begin
 if pg_temp.load_r01()#>>'{authority,datasetHash}' is distinct from '2f825e42d7b1f9ce7f564c55f66ab9ba4822bc6af38586f2c4e42715f4eb5fb8' then raise exception 'unrelated dataset won';end if;
 raise notice 'PASS: newer draft in another dataset cannot replace the selected history';
end $$;
rollback to newer_unrelated_dataset;
savepoint denied_session;
-- Same source is readable through its origin and another binding; only the target
-- session is denied. This isolates the loader's session guard from source-use checks.
update public.sources set origin_resource_id='30000000-0000-4000-8000-000000000731',origin_resource_reference='30000000-0000-4000-8000-000000000731'
where organization_id='20000000-0000-4000-8000-000000000731' and id=(select source_id from public.source_versions where organization_id='20000000-0000-4000-8000-000000000731' and id='10000000-0000-4000-8000-000000000001');
insert into public.source_bindings(organization_id,source_version_id,resource_id,resource_reference,request_id,created_by)
values('20000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000731',
'30000000-0000-4000-8000-000000000731',gen_random_uuid(),'10000000-0000-4000-8000-000000000731');
select set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000731"}',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000731","role":"authenticated","aal":"aal1"}',true);
select public.set_resource_policy_grant_v1('10000000-0000-4000-8000-000000000090','10000000-0000-4000-8000-000000000731',null,'read','deny');
do $$begin
 if private.evaluate_resource_policy_v1('20000000-0000-4000-8000-000000000731','30000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000731','read','analysis') is not true
 or private.source_use_allowed_v1('20000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000731','read','analysis') is not true then
 raise exception 'session-denial fixture did not isolate the target resource';end if;
end $$;
select pg_temp.r01_denied('session deny overrides work allow and other source binding',$q$select pg_temp.load_r01()$q$);
rollback to denied_session;
savepoint withdrawn_binding;
update public.source_bindings set revoked_at=clock_timestamp(),revoked_by='10000000-0000-4000-8000-000000000731' where source_version_id='10000000-0000-4000-8000-000000000001';
select pg_temp.r01_denied('withdrawn source binding denies preparation',$q$select pg_temp.load_r01()$q$);
rollback to withdrawn_binding;
savepoint scope_pause;
insert into private.receivables_analytical_release_grants(organization_id,enabled,note,granted_by)
values('20000000-0000-4000-8000-000000000731',false,'Synthetic pause','synthetic-test');
select pg_temp.r01_denied('organization pause denies preparation',$q$select pg_temp.load_r01()$q$);
rollback to scope_pause;
savepoint revoked_subject;
update private.principals set revoked_at=clock_timestamp() where organization_id='20000000-0000-4000-8000-000000000731' and user_id='10000000-0000-4000-8000-000000000731';
select pg_temp.r01_denied('revoked subject denies preparation',$q$select pg_temp.load_r01()$q$);
rollback to revoked_subject;
do $$declare f text;begin
 foreach f in array array['private.r01_preparation_authority_v1(uuid,uuid,uuid,uuid)','private.worker_load_receivables_preparation_v1(uuid,text)',
 'private.r01_adopted_value_v1(uuid,uuid,text,uuid,uuid,text,uuid)','private.r01_scope_dataset_hash_v1(jsonb)'] loop
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE') then
   raise exception 'r01 loader exposes private function: %',f;
  end if;
 end loop;
 raise notice 'PASS: preparation helpers deny every application role';
end $$;
select 'r01_preparation_authority: PASS' result;
rollback;
