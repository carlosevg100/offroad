-- Lote 4 reads its priors as completed executions of the same work: the board discussion (C47) its reviewed
-- results by role, the folder update (C09) its prior inventory. The verdicts refuse each failure by name; the
-- resolver reaches the stored rows and the normal rights machinery; the v4 producer is the only door and only
-- for these two methods; the quarter close keeps v3; the folder's storage gate never writes. Synthetic and rolled back.
begin;
\ir support/execution_commands_fixture.sql

-- 1. Identity verdicts over row data: another organization and another work are not found; an execution
-- without a succeeded result is refused by name; an unknown reader is invalid.
do $$
declare o uuid:='a11b0000-0000-4000-9000-000000000001';w uuid:='a11b0000-0000-4000-9000-000000000002';x uuid:='a11b0000-0000-4000-9000-0000000000ff';k text;
begin
 foreach k in array array['board_material','document_folder'] loop
  if private.lote4_prior_identity_v1(k,o,w,true,o,w,'succeeded') is not null then raise exception '% refused a succeeded prior of the same work',k;end if;
  if private.lote4_prior_identity_v1(k,o,w,false,null,null,null) is distinct from k||'_prior_not_found' then raise exception '% missing prior not refused',k;end if;
  if private.lote4_prior_identity_v1(k,o,w,true,x,w,'succeeded') is distinct from k||'_prior_not_found' then raise exception '% cross organization prior not refused as not found',k;end if;
  if private.lote4_prior_identity_v1(k,o,w,true,o,x,'succeeded') is distinct from k||'_prior_not_found' then raise exception '% cross work prior not refused as not found',k;end if;
  if private.lote4_prior_identity_v1(k,o,w,true,o,w,'partial') is distinct from k||'_prior_not_completed' then raise exception '% partial prior not refused',k;end if;
  if private.lote4_prior_identity_v1(k,o,w,true,o,w,null) is distinct from k||'_prior_not_completed' then raise exception '% uncommitted prior not refused',k;end if;
 end loop;
 if private.lote4_prior_identity_v1('quarter',o,w,true,o,w,'succeeded') is distinct from 'execution_priors_invalid' then raise exception 'unknown reader accepted';end if;
 raise notice 'PASS: identity verdicts';
end $$;

-- 2. Board source content: method and version per role, release, packet fingerprint, the stored result text byte
-- for byte, the prior's sources pinned again, and the declared money scale against the one its method adopts in.
do $$
declare fp text:=repeat('a',64);
 contract jsonb:=jsonb_build_object('method',jsonb_build_object('methodId','build-company-debt-table','methodVersion','2026.10.23-v1'),
  'inputs',jsonb_build_object('sources',jsonb_build_array(jsonb_build_object('resourceId','a11b0000-0000-4000-9000-000000000003','sourceVersionId','a4171000-0000-4000-9000-000000000010','contentHash',repeat('f',64),'rightsRevision','1'))));
 canonical text:='{"fingerprint":"'||fp||'","schemaVersion":"debt-table-packet.v1"}';
 result jsonb:=canonical::jsonb;
 ref jsonb:=jsonb_build_object('role','tabela-divida','executionId','a11b0000-0000-4000-9000-0000000000aa','resultFingerprint',fp);
 src jsonb:=jsonb_build_object('id','tabela-divida','packet',canonical,'moneyScale','reais');
 sources jsonb:=contract#>'{inputs,sources}';
begin
 if private.board_material_prior_content_v1('tabela-divida',ref,src,sources,contract,canonical,result,true) is not null then raise exception 'a matching board source refused';end if;
 if private.board_material_prior_content_v1('plano-2027',ref,src,sources,contract,canonical,result,true) is distinct from 'board_material_prior_method_mismatch' then raise exception 'wrong role method not refused';end if;
 if private.board_material_prior_content_v1('tabela-divida',ref,src,sources,jsonb_set(contract,'{method,methodVersion}','"2026.10.19-v2"'),canonical,result,true) is distinct from 'board_material_prior_method_mismatch' then raise exception 'wrong version not refused';end if;
 if private.board_material_prior_content_v1('nono',ref,src,sources,contract,canonical,result,true) is distinct from 'board_material_priors_invalid' then raise exception 'unknown role not refused';end if;
 if private.board_material_prior_content_v1('tabela-divida',ref,src,sources,contract,canonical,result,false) is distinct from 'board_material_prior_not_released' then raise exception 'unreleased method not refused';end if;
 if private.board_material_prior_content_v1('tabela-divida',jsonb_set(ref,'{resultFingerprint}',to_jsonb(repeat('b',64))),src,sources,contract,canonical,result,true) is distinct from 'board_material_prior_fingerprint_mismatch' then raise exception 'wrong fingerprint not refused';end if;
 -- Byte for byte: the same JSON with other spacing is another input.
 if private.board_material_prior_content_v1('tabela-divida',ref,jsonb_set(src,'{packet}',to_jsonb(replace(canonical,',',', '))),sources,contract,canonical,result,true) is distinct from 'board_material_prior_input_mismatch' then raise exception 'respaced packet not refused';end if;
 if private.board_material_prior_content_v1('tabela-divida',ref,jsonb_set(src,'{id}','"covenant"'),sources,contract,canonical,result,true) is distinct from 'board_material_prior_input_mismatch' then raise exception 'source of another role not refused';end if;
 if private.board_material_prior_content_v1('tabela-divida',ref,null,sources,contract,canonical,result,true) is distinct from 'board_material_prior_input_mismatch' then raise exception 'missing source not refused';end if;
 if private.board_material_prior_content_v1('tabela-divida',ref,src,'[]',contract,canonical,result,true) is distinct from 'board_material_prior_source_unpinned' then raise exception 'unpinned source not refused';end if;
 if private.board_material_prior_content_v1('tabela-divida',ref,src,jsonb_set(sources,'{0,contentHash}',to_jsonb(repeat('e',64))),contract,canonical,result,true) is distinct from 'board_material_prior_source_unpinned' then raise exception 'source with other bytes not refused';end if;
 if private.board_material_prior_content_v1('tabela-divida',ref,jsonb_set(src,'{moneyScale}','"millions"'),sources,contract,canonical,result,true) is distinct from 'board_material_prior_scale_mismatch' then raise exception 'divergent scale not refused';end if;
 if private.board_material_prior_content_v1('tabela-divida',ref,src-'moneyScale',sources,contract,canonical,result,true) is distinct from 'board_material_prior_scale_invalid' then raise exception 'undeclared scale not refused';end if;
 if private.board_material_prior_content_v1('tabela-divida',ref,jsonb_set(src,'{moneyScale}','"milhares"'),sources,contract,canonical,result,true) is distinct from 'board_material_prior_scale_invalid' then raise exception 'unknown scale not refused';end if;
 -- The table: lotes 2 and 3 and the investment in reais, the 2027 plan in millions, the relative cost unknown.
 if private.board_material_prior_scale_v1('millions','evaluate-financing-paths','2026.10.27-v1') is not null
  or private.board_material_prior_scale_v1('reais','evaluate-financing-paths','2026.10.27-v1') is distinct from 'board_material_prior_scale_mismatch'
  or private.board_material_prior_scale_v1('reais','analyze-investment-project','2026.10.09-v2') is not null
  or private.board_material_prior_scale_v1('reais','monetize-receivables-for-working-capital','2026.10.26-v1') is not null
  or private.board_material_prior_scale_v1('reais','analyze-relative-debt-cost','2026.10.19-v2') is distinct from 'board_material_prior_scale_unknown'
  or private.board_material_prior_scale_v1('reais','evaluate-financing-paths','2026.10.28-v1') is distinct from 'board_material_prior_scale_unknown' then raise exception 'scale table wrong';end if;
 if exists(select 1 from unnest(private.board_material_prior_roles_v1()) r where r<>'custo-relativo'
  and private.prior_method_money_scale_v1(private.board_material_prior_method_v1(r)->>'methodId',private.board_material_prior_method_v1(r)->>'methodVersion') is null) then raise exception 'a released role without a scale';end if;
 raise notice 'PASS: board source content verdicts';
end $$;

-- 3. Folder prior content: method and version, release, packet fingerprint, the update's base equal to the
-- prior's stored base, the prior's sources pinned again.
do $$
declare fp text:=repeat('a',64);
 contract jsonb:=jsonb_build_object('method',jsonb_build_object('methodId','organize-document-folder','methodVersion','2026.10.27-v1'),'inputs',jsonb_build_object('sources','[]'::jsonb));
 base jsonb:=jsonb_build_object('envelope',jsonb_build_object('canonical','{"entries":[]}','fingerprint',repeat('c',64)),'scope',jsonb_build_object('workId','w','purpose','p','versionId','v'));
 snapshot jsonb:=jsonb_build_object('schemaVersion','document-folder-inventory-packet-input.v1','analysis',jsonb_build_object('base',base,'update',null));
 result jsonb:=jsonb_build_object('schemaVersion','document-folder-inventory-packet.v1','fingerprint',fp);
 ref jsonb:=jsonb_build_object('role','inventario','executionId','a11b0000-0000-4000-9000-0000000000aa','resultFingerprint',fp);
begin
 if private.document_folder_prior_content_v1(ref,base,'[]',contract,snapshot,result,true) is not null then raise exception 'a matching prior inventory refused';end if;
 if private.document_folder_prior_content_v1(ref,base,'[]',jsonb_set(contract,'{method,methodId}','"evaluate-financing-paths"'),snapshot,result,true) is distinct from 'document_folder_prior_method_mismatch' then raise exception 'other method not refused';end if;
 if private.document_folder_prior_content_v1(ref,base,'[]',contract,snapshot,result,false) is distinct from 'document_folder_prior_not_released' then raise exception 'unreleased not refused';end if;
 if private.document_folder_prior_content_v1(jsonb_set(ref,'{resultFingerprint}',to_jsonb(repeat('b',64))),base,'[]',contract,snapshot,result,true) is distinct from 'document_folder_prior_fingerprint_mismatch' then raise exception 'fingerprint not refused';end if;
 if private.document_folder_prior_content_v1(ref,jsonb_set(base,'{envelope,canonical}','"{\"entries\": []}"'),'[]',contract,snapshot,result,true) is distinct from 'document_folder_prior_input_mismatch' then raise exception 'respaced base not refused';end if;
 if private.document_folder_prior_content_v1(ref,null,'[]',contract,snapshot,result,true) is distinct from 'document_folder_prior_input_mismatch' then raise exception 'missing base not refused';end if;
 if private.document_folder_prior_content_v1(ref,base,'[]',jsonb_set(contract,'{inputs,sources}',jsonb_build_array(jsonb_build_object('sourceVersionId','x','contentHash','y','resourceId','z'))),snapshot,result,true)
  is distinct from 'document_folder_prior_source_unpinned' then raise exception 'unpinned source not refused';end if;
 raise notice 'PASS: folder prior content verdicts';
end $$;

-- 4. The resolver against stored rows: a reference of the wrong shape, an execution that does not exist, one not
-- committed, one of another work, a committed one of another method, and one whose source rights were revoked.
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select pg_temp.expect_execution_command_error($q$select private.lote4_prior_resolve_v1('board_material','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','tabela-divida','{"role":"covenant"}','{}','[]',auth.uid())$q$,'board_material_priors_invalid','board reference of another role refused');
select pg_temp.expect_execution_command_error($q$select private.lote4_prior_resolve_v1('document_folder','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','inventario',jsonb_build_object('role','inventario','executionId','a11b0000-0000-4000-9000-0000000000ee','resultFingerprint',repeat('a',64),'extra',1),'{}','[]',auth.uid())$q$,'document_folder_priors_invalid','folder reference with extra keys refused');
select pg_temp.expect_execution_command_error($q$select private.lote4_prior_resolve_v1('board_material','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','tabela-divida',jsonb_build_object('role','tabela-divida','executionId','a11b0000-0000-4000-9000-0000000000ee','resultFingerprint',repeat('a',64)),'{}','[]',auth.uid())$q$,'board_material_prior_not_found','unknown execution refused');
insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,mime_type,byte_size,sha256,created_by,processing_status)
values('a4171000-0000-4000-9000-000000000010','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',
 'a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/synthetic-prior.txt','Synthetic prior source','text/plain',1,repeat('f',64),'a11b0000-0000-4000-8000-000000000001','ready');
insert into private.source_version_verifications(organization_id,source_version_id,job_id,observed_sha256,observed_byte_size,receipt_id)
values('a11b0000-0000-4000-9000-000000000001','a4171000-0000-4000-9000-000000000010','a4171000-0000-4000-9000-000000000099',repeat('f',64),1,'synthetic-only-prior-source');
update execution_fixture set contract=jsonb_set(contract,'{inputs,sources}',jsonb_build_array(jsonb_build_object('resourceId','a11b0000-0000-4000-9000-000000000003','sourceVersionId','a4171000-0000-4000-9000-000000000010','contentHash',repeat('f',64),'rightsRevision','1')));
update execution_fixture set request=private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',contract::text,'{}');
create temporary table prior_ref as select jsonb_build_object('role','tabela-divida','executionId',request->>'executionId','resultFingerprint',repeat('a',64)) ref,
 jsonb_build_object('role','inventario','executionId',request->>'executionId','resultFingerprint',repeat('a',64)) folder from execution_fixture;
select pg_temp.expect_execution_command_error($q$select private.lote4_prior_resolve_v1('board_material','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','tabela-divida',ref,'{}','[]',auth.uid()) from prior_ref$q$,'board_material_prior_not_completed','uncommitted board prior refused');
select pg_temp.expect_execution_command_error($q$select private.lote4_prior_resolve_v1('document_folder','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-0000000000ef','inventario',folder,'{}','[]',auth.uid()) from prior_ref$q$,'document_folder_prior_not_found','an uncommitted prior of another work is not found');
update execution_fixture set claim=public.worker_claim_execution_v1('synthetic-policy-worker-fixture-token-v1',array[repeat('a',64)]);
select public.worker_reserve_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid) from execution_fixture;
select public.worker_settle_execution_v2((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'{"calculation":"synthetic"}','succeeded','calculated') from execution_fixture;
select public.worker_commit_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{"calculation":"synthetic"}','succeeded','calculated') from execution_fixture;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select pg_temp.expect_execution_command_error($q$select private.lote4_prior_resolve_v1('board_material','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-0000000000ef','tabela-divida',ref,'{}','[]',auth.uid()) from prior_ref$q$,'board_material_prior_not_found','a committed prior of another work is not found, never named as existing');
select pg_temp.expect_execution_command_error($q$select private.lote4_prior_resolve_v1('board_material','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','tabela-divida',ref,'{}',(select contract#>'{inputs,sources}' from execution_fixture),auth.uid()) from prior_ref$q$,'board_material_prior_method_mismatch','committed board prior of another method refused');
select pg_temp.expect_execution_command_error($q$select private.lote4_prior_resolve_v1('document_folder','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','inventario',folder,'{}',(select contract#>'{inputs,sources}' from execution_fixture),auth.uid()) from prior_ref$q$,'document_folder_prior_method_mismatch','committed folder prior of another method refused');
select private.set_source_rights_v1('a4171000-0000-4000-9000-000000000010',1,array['process','store','derive','export'],array['analysis','retrieval'],null,null,gen_random_uuid(),repeat('c',64));
select pg_temp.expect_execution_command_error($q$select private.lote4_prior_resolve_v1('board_material','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','tabela-divida',ref,'{}',(select contract#>'{inputs,sources}' from execution_fixture),auth.uid()) from prior_ref$q$,'board_material_prior_rights_denied','prior with revoked source rights refused at request time');
do $$begin
 if private.lote4_latest_prior_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002',private.board_material_prior_method_v1('tabela-divida'),auth.uid()) is not null
  or private.lote4_latest_prior_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002',private.document_folder_prior_method_v1(),auth.uid()) is not null
  or jsonb_array_length(private.board_material_latest_priors_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002',auth.uid()))<>0 then
  raise exception 'synthetic method read as a lote 4 prior';end if;
 raise notice 'PASS: latest prior only of the expected method';
end $$;

-- 5. The v4 producer is the only door of the board discussion and the folder update; it refuses any other method,
-- the quarter close keeps v3, and malformed reference lists are refused before anything is recorded.
select pg_temp.expect_execution_command_error($q$select public.request_work_execution_v4(contract::text,'{}','{}','[]') from execution_fixture$q$,'execution_priors_method_denied','another method cannot use the lote 4 door');
select pg_temp.expect_execution_command_error($q$select public.request_work_execution_v4(jsonb_set(contract,'{method,methodId}','"update-after-quarter-close"')::text,'{}','{}','[]') from execution_fixture$q$,'execution_priors_method_denied','the quarter close does not use the lote 4 door');
select pg_temp.expect_execution_command_error($q$select public.request_work_execution_v4(jsonb_set(contract,'{method,methodId}','"prepare-board-capital-discussion"')::text,
 '{"analysis":{"sources":[{"id":"tabela-divida","packet":"{}","moneyScale":"reais"}]}}','{}','[]') from execution_fixture$q$,'board_material_priors_invalid','board without a reference per source refused');
select pg_temp.expect_execution_command_error($q$select public.request_work_execution_v4(jsonb_set(contract,'{method,methodId}','"prepare-board-capital-discussion"')::text,
 '{"analysis":{"sources":[{"id":"tabela-divida","packet":"{}"},{"id":"tabela-divida","packet":"{}"}]}}','{}',
 jsonb_build_array(jsonb_build_object('role','tabela-divida'),jsonb_build_object('role','covenant'))) from execution_fixture$q$,'board_material_priors_invalid','board with a repeated source refused');
select pg_temp.expect_execution_command_error($q$select public.request_work_execution_v4(jsonb_set(contract,'{method,methodId}','"prepare-board-capital-discussion"')::text,
 '{"analysis":{"sources":[{"id":"outro","packet":"{}"}]}}','{}',jsonb_build_array(jsonb_build_object('role','outro'))) from execution_fixture$q$,'board_material_priors_invalid','board source of an unknown role refused');
select pg_temp.expect_execution_command_error($q$select public.request_work_execution_v4(jsonb_set(contract,'{method,methodId}','"organize-document-folder"')::text,
 '{"analysis":{"base":{},"update":null}}','{}',jsonb_build_array(jsonb_build_object('role','inventario'))) from execution_fixture$q$,'document_folder_priors_invalid','a first inventory does not read a prior');
select pg_temp.expect_execution_command_error($q$select public.request_work_execution_v3(jsonb_set(contract,'{method,methodId}','"prepare-board-capital-discussion"')::text,'{}','{}','[]') from execution_fixture$q$,'quarter_update_priors_method_denied','the board discussion cannot use the quarter door');

-- 6. The provenance checks the lote 4 branches will call answer false without a v4 record.
do $$
declare c jsonb:=jsonb_build_object('organizationId','a11b0000-0000-4000-9000-000000000001','workId','a11b0000-0000-4000-9000-000000000002','executionId','a11b0000-0000-4000-9000-0000000000c7');
begin
 if private.board_material_priors_recorded_v1(c,'{"analysis":{"sources":[{"id":"tabela-divida","packet":"{}","moneyScale":"reais"}]}}') then raise exception 'board priors without a v4 record accepted';end if;
 if private.board_material_priors_recorded_v1(c,'{"analysis":{"sources":[]}}') then raise exception 'board without sources accepted';end if;
 if not private.document_folder_prior_recorded_v1(c,'{"analysis":{"base":{},"update":null}}') then raise exception 'a first inventory refused';end if;
 if private.document_folder_prior_recorded_v1(c,'{"analysis":{"base":{},"update":{}}}') then raise exception 'an update without a v4 record accepted';end if;
 if private.document_folder_prior_recorded_v1(c,'{"analysis":{}}') then raise exception 'a folder without base accepted';end if;
 raise notice 'PASS: provenance checks require the v4 record';
end $$;

-- 7. The pins table takes the lote 4 roles, each only with its method.
do $$
declare c text:=pg_get_constraintdef((select oid from pg_constraint where conname='execution_prior_results_method_check'));
begin
 if position('plano-2027' in c)=0 or position('evaluate-financing-paths' in c)=0 or position('inventario' in c)=0 or position('organize-document-folder' in c)=0
  or position('weekly_cash' in c)=0 then raise exception 'pins method check misses a role';end if;
 raise notice 'PASS: pins carry the lote 4 roles';
end $$;

-- 8. The folder's storage gate never writes and opens nothing without a leased job of the same work.
do $$
declare f text:=pg_get_functiondef('private.worker_can_access_document_storage_v1(text,text,boolean)'::regprocedure);
begin
 if private.worker_can_access_document_storage_v1('document-layers','a/b/c.json',false) or private.worker_can_access_document_storage_v1('document-layers','a/b/c.json',true) then
  raise exception 'storage gate open without a job';end if;
 if position('agent_operation_brief' in f)=0 or position('not coalesce(p_write,true)' in f)=0 or position('ds.capital_project_id=js.capital_project_id' in f)=0
  or position('j.payload->>''layer_object_path''' in f)=0 then raise exception 'storage gate shape changed';end if;
 raise notice 'PASS: storage gate reads only';
end $$;

-- 9. Grants: the doors for authenticated only; every helper and the pins closed.
do $$ declare f text;
begin
 foreach f in array array['public.request_work_execution_v4(text,text,text,jsonb)','public.board_material_prior_results_v1(uuid)','public.worker_board_material_priors_v1(uuid,text)',
  'public.document_folder_prior_v1(uuid)','public.worker_document_folder_prior_v1(uuid,text)','public.worker_document_folder_evidence_v1(uuid,text)'] loop
  if not has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE') then raise exception 'door grant wrong: %',f;end if;
 end loop;
 foreach f in array array['private.board_material_prior_method_v1(text)','private.board_material_prior_roles_v1()','private.document_folder_prior_method_v1()',
  'private.prior_method_released_v1(text,text)','private.prior_method_money_scale_v1(text,text)','private.board_material_prior_scale_v1(text,text,text)',
  'private.lote4_prior_identity_v1(text,uuid,uuid,boolean,uuid,uuid,text)','private.prior_sources_pinned_v1(jsonb,jsonb)',
  'private.board_material_prior_content_v1(text,jsonb,jsonb,jsonb,jsonb,text,jsonb,boolean)','private.document_folder_prior_content_v1(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,boolean)',
  'private.lote4_prior_resolve_v1(text,uuid,uuid,text,jsonb,jsonb,jsonb,uuid)','private.board_material_priors_recorded_v1(jsonb,jsonb)','private.document_folder_prior_recorded_v1(jsonb,jsonb)',
  'private.lote4_latest_prior_v1(uuid,uuid,jsonb,uuid)','private.board_material_latest_priors_v1(uuid,uuid,uuid)','private.document_folder_decision_kind_v1(text)'] loop
  if has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE') then raise exception 'helper exposed: %',f;end if;
 end loop;
 foreach f in array array['private.worker_board_material_priors_v1(uuid,text)','private.worker_document_folder_prior_v1(uuid,text)','private.worker_document_folder_evidence_v1(uuid,text)'] loop
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE') or position('job_for_capability' in pg_get_functiondef(f::regprocedure))=0 then raise exception 'worker door wrong: %',f;end if;
 end loop;
 if has_table_privilege('authenticated','private.execution_prior_results','SELECT') or has_table_privilege('service_role','private.execution_prior_results','SELECT') then raise exception 'prior pins exposed';end if;
 raise notice 'PASS: lote 4 priors doors and helpers granted narrowly';
end $$;

select 'lote4_priors_passed' as result;
rollback;