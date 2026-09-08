-- Synthetic rollback-only consent boundary regression. Legacy metadata setup uses the
-- shared fixture helper; the owner calls the real public approval RPC directly.
begin;
\ir support/execution_approval.sql

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values ('10000000-0000-4000-8000-000000000901','authenticated','authenticated','approval-owner@example.invalid','{}','{}',now(),now(),false,false);
insert into public.organizations (id,organization_type,name,created_by)
values ('20000000-0000-4000-8000-000000000901','company','Synthetic approval tenant','10000000-0000-4000-8000-000000000901');
insert into public.organization_memberships (organization_id,user_id,role,status,joined_at)
values ('20000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000901','owner','active',now());
insert into public.document_intake_sessions (id,organization_id,started_by,journey,locale)
values ('40000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000901','company','pt-BR');
insert into public.source_documents (id,organization_id,intake_session_id,object_path,original_name,sha256,processing_status,created_by)
values ('50000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901/40000000-0000-4000-8000-000000000901/source.pdf','synthetic-source.pdf',repeat('a',64),'ready','10000000-0000-4000-8000-000000000901');
insert into public.processing_runs (id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
values ('70000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901',1,'manual','queued','approval-fixture-v1','10000000-0000-4000-8000-000000000901');
insert into public.processing_jobs (id,organization_id,intake_session_id,processing_run_id,kind,status,payload)
values ('80000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901','70000000-0000-4000-8000-000000000901','case_analysis','queued','{"analysis_scope":"full_case"}');


update public.source_documents set scan_result='{"verdict":"clean"}' where id='50000000-0000-4000-8000-000000000901';
update public.document_intake_sessions set pipeline_version='scope-test-v1',status='review_ready' where id='40000000-0000-4000-8000-000000000901';
insert into public.preliminary_understandings(organization_id,intake_session_id,processing_run_id,object_version,status,input_fingerprint,object_fingerprint,payload,decided_by,decided_at)
values('20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901','70000000-0000-4000-8000-000000000901',1,'confirmed',repeat('b',64),repeat('c',64),'{}','10000000-0000-4000-8000-000000000901',now());
-- The SQL test seeds only the trusted-worker metadata projection, not financial data.
insert into private.receivables_evidence_fragments(organization_id,intake_session_id,source_document_id,document_version,processing_run_id,content_kind,schema_version,source_sha256,content_sha256,payload_sha256,uncompressed_bytes,compressed_payload)
values('20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901','50000000-0000-4000-8000-000000000901',1,'70000000-0000-4000-8000-000000000901','document_layer','2026.08.28-v1',repeat('a',64),repeat('b',64),repeat('c',64),2,'xx');
insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,sha256,processing_status,created_by,scan_result)
select '50000000-0000-4000-8000-000000000902',organization_id,intake_session_id,'20000000-0000-4000-8000-000000000901/40000000-0000-4000-8000-000000000901/other.pdf','synthetic-other.pdf',repeat('f',64),processing_status,created_by,scan_result from public.source_documents where id='50000000-0000-4000-8000-000000000901';
insert into private.receivables_evidence_fragments(organization_id,intake_session_id,source_document_id,document_version,processing_run_id,content_kind,schema_version,source_sha256,content_sha256,payload_sha256,uncompressed_bytes,compressed_payload)
select organization_id,intake_session_id,'50000000-0000-4000-8000-000000000902',document_version,processing_run_id,content_kind,schema_version,repeat('f',64),content_sha256,payload_sha256,uncompressed_bytes,compressed_payload from private.receivables_evidence_fragments where source_document_id='50000000-0000-4000-8000-000000000901';
do $$ declare source jsonb; manifest jsonb; begin
 source:=jsonb_build_object('sourceDocumentId','50000000-0000-4000-8000-000000000901','documentVersion',1,'contentKind','document_layer','sourceSha256',repeat('a',64),'contentSha256',repeat('b',64),'schemaVersion','2026.08.28-v1','fileName','synthetic-source.pdf');
 manifest:=jsonb_build_object('schemaVersion','receivables-evidence-manifest.v1','fingerprint',repeat('d',64),'sources',jsonb_build_array(source,source||jsonb_build_object('sourceDocumentId','50000000-0000-4000-8000-000000000902','fileName','synthetic-other.pdf','sourceSha256',repeat('f',64))));
 update public.document_intake_sessions set result_summary=jsonb_build_object('case_state',jsonb_build_object('receivablesVertical',jsonb_build_object('sourceManifest',manifest,'candidates',jsonb_build_array(jsonb_build_object('documentId','50000000-0000-4000-8000-000000000901','fileName','synthetic-source.pdf','sheet','Titles','headerRow',1),jsonb_build_object('documentId','50000000-0000-4000-8000-000000000902','fileName','synthetic-other.pdf','sheet','Other','headerRow',1))))) where id='40000000-0000-4000-8000-000000000901';
end; $$;
select pg_temp.fixture_approve_execution('80000000-0000-4000-8000-000000000901');
-- Nonprocessable states fail without reopening the case or recording consent.
do $$ declare rejected boolean:=false; begin
 update public.document_intake_sessions set status='confirmed' where id='40000000-0000-4000-8000-000000000901';
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000901","role":"authenticated"}',true);
 begin perform public.confirm_receivables_evidence_scope_v1('40000000-0000-4000-8000-000000000901',repeat('d',64),'{"documentId":"50000000-0000-4000-8000-000000000901","sheet":"Titles","headerRow":1}','{}','2026-09-01','90000000-0000-4000-8000-000000000904'); exception when object_not_in_prerequisite_state then rejected:=true; end;
 if not rejected or exists(select 1 from private.receivables_evidence_scopes where organization_id='20000000-0000-4000-8000-000000000901') then raise exception 'confirmed case implicitly reopened'; end if;
 update public.document_intake_sessions set status='review_ready' where id='40000000-0000-4000-8000-000000000901';
 perform set_config('request.jwt.claims','',true);
end; $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000902","role":"authenticated"}',true);
do $$ declare rejected boolean:=false; begin
 begin perform public.read_receivables_evidence_scope_v1('40000000-0000-4000-8000-000000000901'); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'cross tenant scope read allowed'; end if;
 rejected:=false;
 begin perform public.confirm_receivables_evidence_scope_v1('40000000-0000-4000-8000-000000000901',repeat('d',64),'{"documentId":"50000000-0000-4000-8000-000000000901","sheet":"Titles","headerRow":1}','{}','2026-09-01','90000000-0000-4000-8000-000000000902'); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'cross tenant scope write allowed'; end if;
end; $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000901","role":"authenticated"}',true);
do $$ declare ctx jsonb; a jsonb; b jsonb; primary_tape jsonb:='{"documentId":"50000000-0000-4000-8000-000000000901","sheet":"Titles","headerRow":1}'; rejected boolean; begin
 ctx:=public.read_receivables_evidence_scope_v1('40000000-0000-4000-8000-000000000901');
 if ctx->>'state'<>'unconfirmed' then raise exception 'expected unconfirmed'; end if;
 rejected:=false;
 begin perform public.confirm_receivables_evidence_scope_v1('40000000-0000-4000-8000-000000000901',repeat('e',64),primary_tape,'{}','2026-09-01','90000000-0000-4000-8000-000000000901'); exception when serialization_failure then rejected:=true; end;
 if not rejected then raise exception 'stale manifest accepted'; end if;
 rejected:=false;
 begin perform public.confirm_receivables_evidence_scope_v1('40000000-0000-4000-8000-000000000901',repeat('d',64),jsonb_set(primary_tape,'{headerRow}','2'),'{}','2026-09-01','90000000-0000-4000-8000-000000000901'); exception when invalid_parameter_value then rejected:=true; end;
 if not rejected then raise exception 'undiscovered candidate accepted'; end if;
 rejected:=false;
 begin perform public.confirm_receivables_evidence_scope_v1('40000000-0000-4000-8000-000000000901',repeat('d',64),primary_tape,array['50000000-0000-4000-8000-000000000902'::uuid],'2026-09-01','90000000-0000-4000-8000-000000000901'); exception when invalid_parameter_value then rejected:=true; end;
 if not rejected then raise exception 'another pool accepted as complement'; end if;
 a:=public.confirm_receivables_evidence_scope_v1('40000000-0000-4000-8000-000000000901',repeat('d',64),primary_tape,'{}','2026-09-01','90000000-0000-4000-8000-000000000901');
 b:=public.confirm_receivables_evidence_scope_v1('40000000-0000-4000-8000-000000000901',repeat('d',64),primary_tape,'{}','2026-09-01','90000000-0000-4000-8000-000000000901');
 if a->'scope' is distinct from b->'scope' or a->'processingRunId' is distinct from b->'processingRunId' or b->>'replayed'<>'true' then raise exception 'confirmation replay changed identity'; end if;
 if public.read_receivables_evidence_scope_v1('40000000-0000-4000-8000-000000000901')->>'state'<>'current' then raise exception 'confirmed scope not current'; end if;
 rejected:=false;
 begin perform public.confirm_receivables_evidence_scope_v1('40000000-0000-4000-8000-000000000901',repeat('d',64),primary_tape,'{}','2026-08-01','90000000-0000-4000-8000-000000000901'); exception when unique_violation then rejected:=true; end;
 if not rejected then raise exception 'replayed command accepted changed date'; end if;
 rejected:=false;
 begin perform public.worker_load_case_input_v2('80000000-0000-4000-8000-000000000901',repeat('x',64)); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'worker accepted invalid capability'; end if;
end; $$;
reset role;
do $$ begin
 if private.execution_dispatch_is_current('80000000-0000-4000-8000-000000000901',true) then raise exception 'scope failed to invalidate prior approval'; end if;
 if not exists(select 1 from public.processing_jobs j join private.receivables_evidence_scopes s on s.processing_run_id=j.processing_run_id where s.organization_id='20000000-0000-4000-8000-000000000901' and j.kind='case_analysis' and j.status='awaiting_approval') then raise exception 'new analysis not held for approval'; end if;
 if has_table_privilege('authenticated','private.receivables_evidence_scopes','SELECT') or has_table_privilege('authenticated','private.receivables_evidence_scopes','INSERT') then raise exception 'private confirmation became client writable'; end if;
end; $$;
-- An old worker cannot read past a confirmed scope; the new reader carries it.
do $$ declare planner uuid; ctx jsonb; rejected boolean; old_name text; begin
 select j.id into planner from public.processing_jobs j join private.receivables_evidence_scopes s on s.processing_run_id=j.processing_run_id
  where s.organization_id='20000000-0000-4000-8000-000000000901' and j.kind='execution_brief_proposal';
 update public.processing_jobs set status='leased',capability_sha256=extensions.digest(repeat('c',64),'sha256'),lease_expires_at=now()+interval '10 minutes' where id=planner;
 ctx:=public.worker_load_execution_brief_proposal_v3(planner,repeat('c',64));
 if ctx#>>'{confirmed_receivables_scope,state}'<>'current' then raise exception 'new proposal reader omitted scope'; end if;
 foreach old_name in array array['public.worker_load_execution_brief_proposal_v1','public.worker_load_execution_brief_proposal_v2','private.worker_load_execution_brief_proposal_v1','private.worker_load_execution_brief_proposal_v2'] loop
  rejected:=false;
  begin execute format('select %s($1,$2)',old_name) using planner,repeat('c',64); exception when object_not_in_prerequisite_state then rejected:=true; end;
  if not rejected then raise exception 'legacy reader ignored confirmed scope'; end if;
 end loop;
 if has_function_privilege('authenticated','private.worker_load_proposal_v1_before_scope(uuid,text)','EXECUTE') then raise exception 'scope fence clone exposed'; end if;
end; $$;
-- A delayed request must sort after the latest serialized confirmation even if the
-- database clock regresses. Seed a future audit timestamp, then use the real command.
do $$ declare prior private.receivables_evidence_scopes; future_id uuid:=gen_random_uuid(); future_time timestamptz:=clock_timestamp()+interval '1 day'; result jsonb; latest_id uuid; begin
 select * into prior from private.receivables_evidence_scopes where organization_id='20000000-0000-4000-8000-000000000901' order by confirmed_at desc limit 1;
 insert into private.receivables_evidence_scopes(id,organization_id,capital_project_id,intake_session_id,command_id,request_fingerprint,fingerprint,scope,confirmed_by,confirmed_at)
 values(future_id,prior.organization_id,prior.capital_project_id,prior.intake_session_id,gen_random_uuid(),prior.request_fingerprint,prior.fingerprint,
  prior.scope||jsonb_build_object('id',future_id,'confirmedAt',to_char(future_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),prior.confirmed_by,future_time);
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000901","role":"authenticated"}',true);
 result:=public.confirm_receivables_evidence_scope_v1(prior.intake_session_id,repeat('d',64),prior.scope->'primaryTape','{}','2026-09-02','90000000-0000-4000-8000-000000000905');
 perform set_config('request.jwt.claims','',true);
 select id into latest_id from private.receivables_evidence_scopes where organization_id=prior.organization_id and intake_session_id=prior.intake_session_id order by confirmed_at desc,id desc limit 1;
 if latest_id::text<>result#>>'{scope,id}' or (result#>>'{scope,confirmedAt}')::timestamptz<=future_time then raise exception 'confirmation order did not follow serialized write'; end if;
end; $$;
-- Record a real new proposal: omission fails, exact visible/internal scope binding succeeds.
do $$ declare j uuid; ctx jsonb; sc jsonb; src jsonb; b public.capital_project_execution_briefs; internal jsonb; visible jsonb; assumptions jsonb; result jsonb; rejected boolean:=false; begin
 select job.id into j from public.processing_jobs job join private.receivables_evidence_scopes scope_row on scope_row.processing_run_id=job.processing_run_id
  where scope_row.organization_id='20000000-0000-4000-8000-000000000901' and job.kind='execution_brief_proposal' order by scope_row.confirmed_at desc limit 1;
 update public.processing_jobs set status='leased',capability_sha256=extensions.digest(repeat('c',64),'sha256'),lease_expires_at=now()+interval '10 minutes' where id=j;
 ctx:=public.worker_load_execution_brief_proposal_v3(j,repeat('c',64)); sc:=ctx#>'{confirmed_receivables_scope,scope}'; src:=sc#>'{sourceRevisions,0}';
 select * into b from public.capital_project_execution_briefs where organization_id='20000000-0000-4000-8000-000000000901' order by brief_version desc limit 1;
 -- Bounded storage fixture covers the actual active plan task IDs in one workstream.
 internal:=jsonb_build_object('schemaVersion','execution-brief.v1','fingerprint',repeat('e',64),'planVersion','scope-test-v1','authority','{}'::jsonb,
  'objective','Validate synthetic scope','proposedDeliverable','Synthetic scope contract','executionMode','confirm_before_expensive_work','currentContext','[]'::jsonb,'assumptions','[]'::jsonb,'checkpoints','[]'::jsonb,
  'workstreams',jsonb_build_array(jsonb_build_object('key','scope','label','Scope','purpose','Validate scope','output','Scope contract','sourceTaskIds',b.internal_snapshot#>'{workstreams,0,sourceTaskIds}','sources','[]'::jsonb,'analyses','[]'::jsonb,'dependencies','[]'::jsonb)));
 visible:=(internal-array['planVersion','authority'])||jsonb_build_object('workstreams',jsonb_build_array((internal#>'{workstreams,0}')-array['key','sourceTaskIds']));
 begin perform public.worker_record_execution_brief_proposal_v1(j,repeat('c',64),internal,visible,ctx->>'input_fingerprint',null);
 exception when invalid_parameter_value then rejected:=true; end;
 if not rejected then raise exception 'proposal omitted confirmed scope'; end if;
 assumptions:=jsonb_build_array(jsonb_build_object('label','Confirmed scope','value','Synthetic pool and user-confirmed date','editable',true,
  'basis',jsonb_build_object('scopeFingerprint',sc->>'fingerprint','reportingDate',sc->>'reportingDate','primaryDocumentId',sc#>>'{primaryTape,documentId}',
   'headerRow',sc#>'{primaryTape,headerRow}','selectedSourceCount',jsonb_array_length(sc->'sourceRevisions'),'documentVersion',src->'documentVersion','sourceSha256',src->>'sourceSha256','contentSha256',src->>'contentSha256')::text));
 internal:=jsonb_set(internal,'{assumptions}',assumptions); visible:=jsonb_set(visible,'{assumptions}',assumptions);
 result:=public.worker_record_execution_brief_proposal_v1(j,repeat('c',64),internal,visible,ctx->>'input_fingerprint',null);
 if result->>'status'<>'proposed' then raise exception 'bound scope proposal did not persist'; end if;
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000901","role":"authenticated"}',true);
 perform public.approve_advisor_execution_brief_v1((ctx#>>'{project,id}')::uuid,(result->>'execution_brief_id')::uuid,repeat('e',64),gen_random_uuid());
 perform set_config('request.jwt.claims','',true);
 j:=(result->>'processing_job_id')::uuid;
 update public.processing_jobs set status='leased',capability_sha256=extensions.digest(repeat('z',64),'sha256'),lease_expires_at=now()+interval '10 minutes' where id=j;
 ctx:=public.worker_load_case_input_v2(j,repeat('z',64));
 if ctx#>>'{confirmed_receivables_scope,state}'<>'current' then raise exception 'new case reader omitted current scope'; end if;
 rejected:=false;
 begin perform public.worker_load_case_input(j,repeat('z',64)); exception when object_not_in_prerequisite_state then rejected:=true; end;
 if not rejected then raise exception 'old case reader ignored scope'; end if;

end; $$;
update private.receivables_evidence_fragments set content_sha256=repeat('e',64) where organization_id='20000000-0000-4000-8000-000000000901';
do $$ begin
 if private.receivables_evidence_scope_context('20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901')->>'state'<>'stale' then raise exception 'changed content retained scope'; end if;
end; $$;
-- Deletion keeps the historical scope but removes its source FK edge and freshness.
delete from public.source_documents where id='50000000-0000-4000-8000-000000000901';
do $$ begin
 if private.receivables_evidence_scope_context('20000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901')->>'state'<>'stale' then raise exception 'deleted source retained scope'; end if;
 if exists(select 1 from private.receivables_scope_sources where organization_id='20000000-0000-4000-8000-000000000901') then raise exception 'deleted source retained FK edge'; end if;
end; $$;
select 'confirmed scope, tenant isolation, replay, held analysis and stale/deleted content verified' as result;
rollback;
