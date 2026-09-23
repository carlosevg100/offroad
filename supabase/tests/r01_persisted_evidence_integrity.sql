-- Isolated rollback-only integrity contract.
begin;
\ir support/r01_preparation_setup.sql
create function pg_temp.integrity_denied(label text,command text,expected_code text,expected_message text default null)
returns void language plpgsql as $$begin
 begin execute command;exception when others then
  if sqlstate<>expected_code or (expected_message is not null and sqlerrm<>expected_message) then raise;end if;
  raise notice 'PASS: %',label;return;
 end;
 raise exception 'Expected integrity denial: %',label;
end $$;
create function pg_temp.integrity_state() returns jsonb language sql as $$
 select private.r01_preparation_authority_v1('20000000-0000-4000-8000-000000000731','30000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000090','10000000-0000-4000-8000-000000000731');
$$;
create temporary table integrity_before as select pg_temp.integrity_state() state;
select pg_temp.integrity_denied('fragment bytes without matching digest denied',
 $q$update private.receivables_evidence_fragments set compressed_payload=compressed_payload||decode('00','hex')$q$,'23514');
select pg_temp.integrity_denied('patch JSON without matching digest denied',
 $q$update private.receivables_method_supplement_patches set patch=patch||'{"changed":true}'$q$,'23514');
select pg_temp.integrity_denied('draft JSON without matching digest denied',
 $q$update private.receivables_method_supplement_drafts set draft=draft||'{"changed":true}'$q$,'23514');
select pg_temp.integrity_denied('patch identity cannot move to another id',
 $q$update private.receivables_method_supplement_patches set id=gen_random_uuid()$q$,'42501','receivables_history_identity_immutable');
select pg_temp.integrity_denied('draft identity cannot move to another id',
 $q$update private.receivables_method_supplement_drafts set id=gen_random_uuid()$q$,'42501','receivables_history_identity_immutable');
select pg_temp.integrity_denied('patch cannot change producing job',
 $q$update private.receivables_method_supplement_patches set processing_job_id=gen_random_uuid()$q$,'42501','receivables_history_identity_immutable');
select pg_temp.integrity_denied('draft cannot change revision identity',
 $q$update private.receivables_method_supplement_drafts set revision=revision+1$q$,'42501','receivables_history_identity_immutable');
select pg_temp.integrity_denied('patch cannot change dataset',
 $q$update private.receivables_method_supplement_patches set source_dataset_hash=repeat('0',64)$q$,'42501','receivables_history_identity_immutable');
select pg_temp.integrity_denied('draft cannot change dataset',
 $q$update private.receivables_method_supplement_drafts set source_dataset_hash=repeat('0',64)$q$,'42501','receivables_history_identity_immutable');

savepoint consistent_fragment;
update private.receivables_evidence_fragments set compressed_payload=compressed_payload||decode('00','hex'),
 payload_sha256=encode(extensions.digest(compressed_payload||decode('00','hex'),'sha256'),'hex');
do $$begin
 if pg_temp.integrity_state()=(select state from integrity_before) then raise exception 'fragment mutation reused prior authority snapshot';end if;
 raise notice 'PASS: consistent fragment mutation changes preparation snapshot; replay remains required';
end $$;
rollback to consistent_fragment;
savepoint consistent_patch;
update private.receivables_method_supplement_patches set patch=patch||'{"changed":true}',
 patch_fingerprint=encode(extensions.digest(convert_to((patch||'{"changed":true}')::text,'UTF8'),'sha256'),'hex');
do $$begin
 if pg_temp.integrity_state()=(select state from integrity_before) then raise exception 'patch mutation reused prior authority snapshot';end if;
 raise notice 'PASS: consistent patch mutation changes preparation snapshot';
end $$;
rollback to consistent_patch;
savepoint consistent_draft;
update private.receivables_method_supplement_drafts set draft=draft||'{"changed":true}',
 draft_fingerprint=encode(extensions.digest(convert_to((draft||'{"changed":true}')::text,'UTF8'),'sha256'),'hex');
do $$begin
 if pg_temp.integrity_state()=(select state from integrity_before) then raise exception 'draft mutation reused prior authority snapshot';end if;
 raise notice 'PASS: consistent draft mutation changes preparation snapshot';
end $$;
rollback to consistent_draft;
savepoint missing_history;
delete from private.receivables_method_supplement_drafts;
delete from private.receivables_method_supplement_patches;
select pg_temp.integrity_denied('history deletion remains possible and denies preparation',$q$select pg_temp.integrity_state()$q$,'42501','r01_preparation_history_missing');
rollback to missing_history;
savepoint missing_fragment;
delete from private.receivables_evidence_fragments;
select pg_temp.integrity_denied('fragment deletion remains possible and denies preparation',$q$select pg_temp.integrity_state()$q$,'42501');
rollback to missing_fragment;
savepoint history_gap;
insert into private.receivables_method_supplement_drafts(organization_id,capital_project_id,intake_session_id,source_dataset_hash,revision,draft_fingerprint,caused_by_patch_id,draft)
select organization_id,capital_project_id,intake_session_id,source_dataset_hash,3,
 encode(extensions.digest(convert_to(jsonb_set(draft,'{revision}','3')::text,'UTF8'),'sha256'),'hex'),caused_by_patch_id,jsonb_set(draft,'{revision}','3')
from private.receivables_method_supplement_drafts;
select pg_temp.integrity_denied('valid digest cannot hide a gap in revisions',$q$select pg_temp.integrity_state()$q$,'42501','r01_preparation_history_invalid');
rollback to history_gap;

savepoint clean_session_cascade;
-- A valid independent session/run/job, without immutable source verification or receipt.
insert into public.document_intake_sessions(id,organization_id,capital_project_id,started_by,journey,locale)
values('10000000-0000-4000-8000-000000000881','20000000-0000-4000-8000-000000000731','30000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000731','company','pt-BR');
insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
values('70000000-0000-4000-8000-000000000881','20000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000881',1,'manual','queued','synthetic-integrity','10000000-0000-4000-8000-000000000731');
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,kind,status,payload)
values('80000000-0000-4000-8000-000000000881','20000000-0000-4000-8000-000000000731','70000000-0000-4000-8000-000000000881','10000000-0000-4000-8000-000000000881','case_analysis','queued','{"analysis_scope":"full_case"}');
insert into private.receivables_method_supplement_patches(id,organization_id,capital_project_id,intake_session_id,processing_run_id,processing_job_id,source_dataset_hash,patch_id,patch_fingerprint,patch)
values('a0000000-0000-4000-8000-000000000881','20000000-0000-4000-8000-000000000731','30000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000881',
 '70000000-0000-4000-8000-000000000881','80000000-0000-4000-8000-000000000881',repeat('0',64),'synthetic-cleanup',encode(extensions.digest('{}','sha256'),'hex'),'{}');
insert into private.receivables_method_supplement_drafts(organization_id,capital_project_id,intake_session_id,source_dataset_hash,revision,draft_fingerprint,caused_by_patch_id,draft)
values('20000000-0000-4000-8000-000000000731','30000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000881',repeat('0',64),1,
 encode(extensions.digest('{}','sha256'),'hex'),'a0000000-0000-4000-8000-000000000881','{}');
select pg_temp.integrity_denied('dependent draft still protects patch deletion',
 $q$delete from private.receivables_method_supplement_patches where id='a0000000-0000-4000-8000-000000000881'$q$,'23503');
delete from private.receivables_method_supplement_drafts where intake_session_id='10000000-0000-4000-8000-000000000881';
delete from public.document_intake_sessions where id='10000000-0000-4000-8000-000000000881';
do $$begin
 if exists(select 1 from private.receivables_method_supplement_patches where intake_session_id='10000000-0000-4000-8000-000000000881') then raise exception 'session cascade left a patch';end if;
 raise notice 'PASS: eligible session cascade removes patch after dependent draft cleanup';
end $$;
rollback to clean_session_cascade;

savepoint fragment_run_cascade;
insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
values('70000000-0000-4000-8000-000000000882','20000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000090',2,'manual','queued','synthetic-integrity','10000000-0000-4000-8000-000000000731');
insert into private.receivables_evidence_fragments(organization_id,intake_session_id,source_document_id,document_version,processing_run_id,content_kind,schema_version,source_sha256,content_sha256,payload_sha256,codec,uncompressed_bytes,compressed_payload,created_at)
select organization_id,intake_session_id,source_document_id,document_version,'70000000-0000-4000-8000-000000000882',content_kind,schema_version,source_sha256,content_sha256,payload_sha256,codec,uncompressed_bytes,compressed_payload,created_at
from private.receivables_evidence_fragments where processing_run_id='70000000-0000-4000-8000-000000000731';
delete from public.processing_runs where id='70000000-0000-4000-8000-000000000882';
do $$begin
 if exists(select 1 from private.receivables_evidence_fragments where processing_run_id='70000000-0000-4000-8000-000000000882') then raise exception 'run cascade left a fragment';end if;
 raise notice 'PASS: eligible run cascade removes its fragment without deleting source history';
end $$;
rollback to fragment_run_cascade;
do $$declare r text;begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,'private.guard_receivables_history_mutation_v1()','EXECUTE') then raise exception 'history guard exposed';end if;
 end loop;
 raise notice 'PASS: history mutation implementation remains private';
end $$;
select 'r01_persisted_evidence_integrity: PASS' result;
rollback;
