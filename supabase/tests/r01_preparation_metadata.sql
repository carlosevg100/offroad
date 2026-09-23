-- A receipt is an immutable worker assertion, not an execution grant.
begin;
\ir support/r01_preparation_setup.sql
\ir support/r01_execution_profile.sql
update private.worker_tokens set execution_account_user_id='10000000-0000-4000-8000-000000000732' where id='a3300000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000732","role":"authenticated","aal":"aal1"}',true);
create temporary table r01_receipt_fixture as select gen_random_uuid() id,pg_temp.insert_r01_profile(payload) profile_id from r01_profile_test;
create function pg_temp.receipt_state() returns jsonb language sql as $$
 select private.load_r01_preparation_for_receipt_v1('80000000-0000-4000-8000-000000000731',repeat('u',64));
$$;
create temporary table r01_receipt_loaded as select pg_temp.receipt_state() state;
create function pg_temp.record_receipt(input_text text default '{}',expected text default null) returns uuid language sql as $$
 select private.record_r01_preparation_receipt_v1(f.id,'80000000-0000-4000-8000-000000000731',repeat('u',64),f.profile_id,
 coalesce(expected,s.state->>'authoritySnapshotHash'),input_text) from r01_receipt_fixture f cross join r01_receipt_loaded s;
$$;
create function pg_temp.receipt_denied(label text,command text,expected text default null) returns void language plpgsql as $$begin
 begin execute command;exception when others then
 if expected is not null and sqlerrm<>expected then raise;end if;
 if sqlstate not in ('42501','23505','22023') then raise;end if;
 raise notice 'PASS: %',label;return;end;
 raise exception 'Expected receipt denial: %',label;
end $$;
select pg_temp.record_receipt();

create function pg_temp.receipt_current() returns boolean language sql as $$
 select private.r01_preparation_receipt_current_v1('20000000-0000-4000-8000-000000000731',
 (select id from r01_receipt_fixture),'10000000-0000-4000-8000-000000000731');
$$;
create function pg_temp.metadata_assert(label text,actual boolean) returns void language plpgsql as $$begin
 if actual is not true then raise exception 'Metadata assertion failed: %',label;end if;
 raise notice 'PASS: %',label;
end $$;
create function pg_temp.metadata_mutation_denied(label text,command text) returns void language plpgsql as $$begin
 begin
  execute command;
  if pg_temp.receipt_current() is not false then raise exception 'Stale receipt remained current: %',label;end if;
  raise exception using errcode='ZX001',message='rollback successful mutation probe';
 exception when sqlstate 'ZX001' then raise notice 'PASS: %',label;
 end;
end $$;
select pg_temp.metadata_assert('unchanged receipt is current without granting execution',pg_temp.receipt_current());
select pg_temp.metadata_assert('loader and compact authority are identical',
 (select state->'authority'=private.r01_preparation_metadata_v2('20000000-0000-4000-8000-000000000731',
 '30000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000090','10000000-0000-4000-8000-000000000731') from r01_receipt_loaded));
select pg_temp.metadata_assert('receipt stores complete history pins',
 (select history_pins=authority_pins->'historyPins' and jsonb_array_length(history_pins)>0
 from private.r01_preparation_receipts where id=(select id from r01_receipt_fixture)));
select pg_temp.metadata_assert('foreign organization denied',not private.r01_preparation_receipt_current_v1(gen_random_uuid(),(select id from r01_receipt_fixture),'10000000-0000-4000-8000-000000000731'));
select pg_temp.metadata_assert('foreign subject denied',not private.r01_preparation_receipt_current_v1('20000000-0000-4000-8000-000000000731',(select id from r01_receipt_fixture),'10000000-0000-4000-8000-000000000732'));
select pg_temp.metadata_assert('absent receipt denied',not private.r01_preparation_receipt_current_v1('20000000-0000-4000-8000-000000000731',gen_random_uuid(),'10000000-0000-4000-8000-000000000731'));
set local time zone 'America/Sao_Paulo';
select pg_temp.metadata_assert('receipt current in Sao Paulo timezone',pg_temp.receipt_current());
set local time zone 'Pacific/Auckland';
select pg_temp.metadata_assert('receipt current in Auckland timezone',pg_temp.receipt_current());
set local time zone 'UTC';
select pg_temp.metadata_mutation_denied('human revocation invalidates receipt',$q$update private.principals set revoked_at=clock_timestamp() where organization_id='20000000-0000-4000-8000-000000000731' and user_id='10000000-0000-4000-8000-000000000731'$q$);
select pg_temp.metadata_mutation_denied('binding revocation invalidates receipt',$q$update public.source_bindings set revoked_at=clock_timestamp(),revoked_by='10000000-0000-4000-8000-000000000731' where source_version_id='10000000-0000-4000-8000-000000000001'$q$);
select pg_temp.metadata_mutation_denied('organization pause invalidates receipt',$q$insert into private.receivables_analytical_release_grants(organization_id,enabled,note,granted_by) values('20000000-0000-4000-8000-000000000731',false,'Synthetic test','synthetic-test')$q$);
select pg_temp.metadata_mutation_denied('work archival invalidates receipt',$q$update public.capital_projects set status='archived',archived_at=clock_timestamp(),archived_by='10000000-0000-4000-8000-000000000731' where id='30000000-0000-4000-8000-000000000731'$q$);
select pg_temp.metadata_mutation_denied('consistent fragment mutation invalidates receipt',$q$update private.receivables_evidence_fragments set compressed_payload=compressed_payload||decode('00','hex'),payload_sha256=encode(extensions.digest(compressed_payload||decode('00','hex'),'sha256'),'hex')$q$);
select pg_temp.metadata_mutation_denied('uncompressed byte count is pinned',$q$update private.receivables_evidence_fragments set uncompressed_bytes=uncompressed_bytes+1$q$);
select pg_temp.metadata_mutation_denied('fragment timestamp is pinned',$q$update private.receivables_evidence_fragments set created_at=created_at+interval '1 second'$q$);
select pg_temp.metadata_mutation_denied('fragment content kind is pinned',$q$update private.receivables_evidence_fragments set content_kind='nfe_archive'$q$);
select pg_temp.metadata_mutation_denied('fragment schema is pinned',$q$update private.receivables_evidence_fragments set schema_version='changed-schema-v1'$q$);
select pg_temp.metadata_mutation_denied('fragment deletion invalidates receipt',$q$delete from private.receivables_evidence_fragments$q$);
select pg_temp.metadata_mutation_denied('consistent patch mutation invalidates receipt',$q$update private.receivables_method_supplement_patches set patch=patch||'{"changed":true}',patch_fingerprint=encode(extensions.digest(convert_to((patch||'{"changed":true}')::text,'UTF8'),'sha256'),'hex')$q$);
select pg_temp.metadata_mutation_denied('consistent draft mutation invalidates receipt',$q$update private.receivables_method_supplement_drafts set draft=draft||'{"changed":true}',draft_fingerprint=encode(extensions.digest(convert_to((draft||'{"changed":true}')::text,'UTF8'),'sha256'),'hex')$q$);
select pg_temp.metadata_mutation_denied('draft deletion invalidates receipt',$q$delete from private.receivables_method_supplement_drafts$q$);
select pg_temp.metadata_mutation_denied('changed support candidates invalidate same confirmed scope',$q$update public.document_intake_sessions set result_summary=jsonb_set(result_summary,'{case_state,receivablesVertical,supportSheetCandidates}','[{"changed":true}]') where id='10000000-0000-4000-8000-000000000090'$q$);


select pg_temp.metadata_mutation_denied('new fragment winner invalidates receipt',$q$
 insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
 values('70000000-0000-4000-8000-000000000883','20000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000090',2,'manual','running','synthetic-metadata','10000000-0000-4000-8000-000000000731');
 insert into private.receivables_evidence_fragments
 select (jsonb_populate_record(null::private.receivables_evidence_fragments,to_jsonb(f)||jsonb_build_object(
 'processing_run_id','70000000-0000-4000-8000-000000000883','created_at',clock_timestamp()+interval '1 second'))).*
 from private.receivables_evidence_fragments f$q$);

create function pg_temp.metadata_forged_pins_denied(label text,override jsonb) returns void language plpgsql as $$
declare new_id uuid:=gen_random_uuid();begin
 insert into private.r01_preparation_receipts
 select (jsonb_populate_record(null::private.r01_preparation_receipts,to_jsonb(r)||override||jsonb_build_object('id',new_id))).*
 from private.r01_preparation_receipts r where id=(select id from r01_receipt_fixture);
 perform pg_temp.metadata_assert(label,not private.r01_preparation_receipt_current_v1('20000000-0000-4000-8000-000000000731',new_id,'10000000-0000-4000-8000-000000000731'));
end $$;
select pg_temp.metadata_forged_pins_denied('old receipt version is not upgraded from current state',
 jsonb_build_object('authority_pins',jsonb_set(authority_pins,'{schemaVersion}','"r01-preparation-authority.v1"')))
 from private.r01_preparation_receipts where id=(select id from r01_receipt_fixture);
select pg_temp.metadata_forged_pins_denied('missing history pins denied','{"history_pins":[]}');
select pg_temp.metadata_forged_pins_denied('profile payload digest is not the published profile fingerprint',
 '{"profile_fingerprint":"7fc3be6e6169c027b1ba2f11f61abefdeccd5f0e087bd980a35c85e6575297b9"}');
select pg_temp.metadata_forged_pins_denied('malformed response pin denied','{"response_pins":[{}]}');
select pg_temp.metadata_forged_pins_denied('nonempty adoption pins still denied',
 jsonb_build_object('authority_pins',jsonb_set(authority_pins,'{adoptionPins}','[{}]')))
 from private.r01_preparation_receipts where id=(select id from r01_receipt_fixture);

select pg_temp.metadata_mutation_denied('new valid rights revision requires new preparation',$q$
 insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
 select organization_id,source_version_id,revision+1,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by
 from private.source_rights_versions where source_version_id='10000000-0000-4000-8000-000000000001' order by revision desc limit 1$q$);

savepoint equivalent_verification;
insert into private.source_version_verifications(organization_id,source_version_id,job_id,observed_sha256,observed_byte_size,receipt_id)
select organization_id,source_version_id,job_id,observed_sha256,observed_byte_size,'sha256:'||repeat('d',64)
from private.source_version_verifications where source_version_id='10000000-0000-4000-8000-000000000001' limit 1;
select pg_temp.metadata_assert('equivalent verification does not change source identity',pg_temp.receipt_current());
rollback to equivalent_verification;
select pg_temp.metadata_assert('mutation probes rolled back to valid baseline',pg_temp.receipt_current());
select pg_temp.receipt_denied('current receipt still cannot authorize execution',$q$select private.require_execution_release_v1(profile_id) from r01_receipt_fixture$q$,'execution_r01_provenance_unavailable');
do $$declare r text;begin
 foreach r in array array['anon','authenticated','service_role'] loop
 if has_function_privilege(r,'private.r01_preparation_metadata_v2(uuid,uuid,uuid,uuid)','EXECUTE')
 or has_function_privilege(r,'private.r01_preparation_receipt_current_v1(uuid,uuid,uuid)','EXECUTE') then raise exception 'Metadata authority exposed';end if;
 end loop;
 raise notice 'PASS: metadata authority private to trusted commands';
end $$;

savepoint temporal_ancestor;
insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,sha256,processing_status,scan_result,created_by)
values('10000000-0000-4000-8000-000000000884','20000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000090',
 '20000000-0000-4000-8000-000000000731/10000000-0000-4000-8000-000000000090/synthetic-expiring.txt','synthetic-expiring.txt',encode(extensions.digest('synthetic-expiring-884','sha256'),'hex'),'ready','{"verdict":"clean"}',
 '10000000-0000-4000-8000-000000000731');
insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,expires_at,evidence_kind,evidence_reference,evidence_sha256,created_by)
select organization_id,source_version_id,2,operations,purposes,audience,valid_from,clock_timestamp()+interval '3 seconds',evidence_kind,evidence_reference,evidence_sha256,created_by
from private.source_rights_versions where source_version_id='10000000-0000-4000-8000-000000000884' and revision=1;
insert into private.resource_dependencies(organization_id,derived_version_id,source_version_id,source_rights_version_id,created_by)
select organization_id,'10000000-0000-4000-8000-000000000001',source_version_id,id,created_by from private.source_rights_versions
where source_version_id='10000000-0000-4000-8000-000000000884' and revision=2;
-- A new document in the session changes the approval input; the dispatch must be approved again before any loader runs.
select pg_temp.fixture_approve_execution('80000000-0000-4000-8000-000000000731',true);
update r01_receipt_fixture set id=gen_random_uuid();
update r01_receipt_loaded set state=pg_temp.receipt_state();
select pg_temp.record_receipt();
select pg_temp.metadata_assert('transitive right initially valid under fixed revision',pg_temp.receipt_current());
select pg_sleep(3.1);
select pg_temp.metadata_assert('same fixed transitive right expires without a revision change',not pg_temp.receipt_current());
insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
select organization_id,source_version_id,3,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by
from private.source_rights_versions where source_version_id='10000000-0000-4000-8000-000000000884' and revision=1;
select pg_temp.metadata_assert('new permissive current right cannot revive expired pinned edge',
 not private.source_use_allowed_v1('20000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000731','derive','analysis') and not pg_temp.receipt_current());
rollback to temporal_ancestor;

savepoint history_at_limit;
set local statement_timeout='45s';
insert into private.receivables_method_supplement_patches(organization_id,capital_project_id,intake_session_id,processing_run_id,processing_job_id,source_dataset_hash,patch_id,patch_fingerprint,patch)
select p.organization_id,p.capital_project_id,p.intake_session_id,p.processing_run_id,p.processing_job_id,p.source_dataset_hash,
 'metadata-perf:'||n,encode(extensions.digest(convert_to('{}','UTF8'),'sha256'),'hex'),'{}'::jsonb
from private.receivables_method_supplement_patches p cross join generate_series(2,10000) n;
insert into private.receivables_method_supplement_drafts(organization_id,capital_project_id,intake_session_id,source_dataset_hash,revision,draft_fingerprint,caused_by_patch_id,draft)
select organization_id,capital_project_id,intake_session_id,source_dataset_hash,split_part(patch_id,':',2)::integer,
 encode(extensions.digest(convert_to('{}','UTF8'),'sha256'),'hex'),id,'{}'::jsonb
from private.receivables_method_supplement_patches where patch_id like 'metadata-perf:%';
set local statement_timeout='10s';
do $$declare started timestamptz:=clock_timestamp();m jsonb;begin
 m:=private.r01_preparation_metadata_v2('20000000-0000-4000-8000-000000000731','30000000-0000-4000-8000-000000000731',
 '10000000-0000-4000-8000-000000000090','10000000-0000-4000-8000-000000000731');
 if jsonb_array_length(m->'historyPins')<>10000 then raise exception 'history at limit was truncated';end if;
 raise notice 'r01_metadata_performance: revisions=10000 elapsed_ms=% bytes=%',
 extract(epoch from(clock_timestamp()-started))*1000,octet_length(m::text);
 raise notice 'PASS: full ten-thousand revision metadata projection without truncation';
end $$;
rollback to history_at_limit;
do $$declare identity text;body text;begin
 foreach identity in array array[
 'private.r01_preparation_metadata_v2(uuid,uuid,uuid,uuid)',
 'private.r01_preparation_receipt_current_v1(uuid,uuid,uuid)',
 'private.receivables_scope_sources_current(uuid,uuid,jsonb)'] loop
 body:=regexp_replace(pg_get_functiondef(identity::regprocedure),'--[^\n]*','','g');
 if body ~* '(compressed_payload|canonical_input|[a-z]+\.draft[^_a-z]|[a-z]+\.patch[^_a-z])'
 or body ~* 'select[[:space:]]+([a-z]+\.)?\*[[:space:]]' then raise exception 'Metadata query reads broad payload: %',identity;end if;
 end loop;
 raise notice 'PASS: compact authority functions do not select financial blobs';
end $$;
select 'r01_preparation_metadata: PASS' result;
rollback;
