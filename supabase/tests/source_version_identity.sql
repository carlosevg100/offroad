begin;
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.register_source_version_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a6660000-0000-4000-9000-000000000001','a6660000-0000-4000-9000-000000000002','opportunity-documents','a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/v1.pdf','same-name.pdf','application/pdf',10,repeat('a',64));
select public.register_source_version_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a6660000-0000-4000-9000-000000000003','a6660000-0000-4000-9000-000000000004','opportunity-documents','a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/v2.pdf','same-name.pdf','application/pdf',11,repeat('b',64),'a6660000-0000-4000-9000-000000000002');
do $$ declare r jsonb; begin
 if (select count(*) from public.source_versions where source_id='a6660000-0000-4000-9000-000000000002')<>2 then raise exception 'same logical source lost distinct versions'; end if;
 r:=public.register_intake_document_command('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a6660000-0000-4000-9000-000000000005','a6660000-0000-4000-9000-000000000006','opportunity-documents','a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/duplicate.pdf','same-name.pdf','application/pdf',10,repeat('a',64));
 if r->>'id'<>'a6660000-0000-4000-9000-000000000002' or r->>'duplicate'<>'true' then raise exception 'duplicate not idempotent'; end if;
 begin perform public.record_document_verification('a11b0000-0000-4000-9000-000000000001','a6660000-0000-4000-9000-000000000002',repeat('c',64),'clean'); raise exception 'client forged verification'; exception when insufficient_privilege then null; end;
 begin update public.source_versions set declared_sha256=repeat('c',64) where id='a6660000-0000-4000-9000-000000000002'; raise exception 'direct version mutation'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.document_profiles(organization_id,source_document_id,document_version,document_kind,information_class,evidence_rank,confidence,summary)
 values('a11b0000-0000-4000-9000-000000000001','a6660000-0000-4000-9000-000000000002',1,'other','company_document',7,0.5,'{"page":2,"cell":"Sheet1!B3"}');
insert into public.document_layers(organization_id,source_document_id,document_version,layer_kind,object_path,stats)
 values('a11b0000-0000-4000-9000-000000000001','a6660000-0000-4000-9000-000000000002',1,'pdf','a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/layer.json','{"page":2,"cell":"Sheet1!B3"}');
do $$ begin
 begin update public.source_documents set sha256=repeat('e',64) where id='a6660000-0000-4000-9000-000000000002'; raise exception 'destructive legacy hash update'; exception when object_not_in_prerequisite_state then null; end;
 begin update public.document_layers set document_version=2 where source_document_id='a6660000-0000-4000-9000-000000000002'; raise exception 'layer moved to other source version'; exception when foreign_key_violation then null; end;
end $$;
insert into storage.objects(bucket_id,name,owner_id,metadata) values('opportunity-documents','a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/v1.pdf','a11b0000-0000-4000-8000-000000000001','{"size":10}');
insert into storage.objects(bucket_id,name,owner_id,metadata) values('opportunity-documents','a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/unregistered.tmp','a11b0000-0000-4000-8000-000000000001','{"size":10}');
select set_config('storage.operation','object.upload_update',true);
select set_config('storage.allow_delete_query','true',true);
set local role authenticated;
do $$ begin
 update storage.objects set metadata='{"size":99}' where bucket_id='opportunity-documents' and name='a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/v1.pdf';
 if found then raise exception 'registered source bytes allow Storage overwrite'; end if;
 perform set_config('storage.operation','object.delete',true);
 delete from storage.objects where bucket_id='opportunity-documents' and name='a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/v1.pdf';
 if found then raise exception 'registered source bytes allow Storage deletion'; end if;
 delete from storage.objects where bucket_id='opportunity-documents' and name='a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/unregistered.tmp';
 if not found then raise exception 'unregistered upload cleanup unexpectedly denied'; end if;
end $$;
select public.bind_source_version_v1('a6660000-0000-4000-9000-000000000002','a11b0000-0000-4000-9000-000000000002','a6660000-0000-4000-9000-000000000007');
select public.remove_intake_document_command('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a6660000-0000-4000-9000-000000000008','a6660000-0000-4000-9000-000000000002');
do $$ declare r jsonb; begin
 r:=public.read_source_version_v1('a6660000-0000-4000-9000-000000000002');
 if r#>>'{profiles,0,summary,page}'<>'2' or r#>>'{layers,0,stats,cell}'<>'Sheet1!B3' then raise exception 'version lost page or cell anchor'; end if;
 if r#>>'{version,declared_sha256}'<>repeat('a',64) then raise exception 'removal destroyed another use'; end if;
 if exists(select 1 from public.source_documents where id='a6660000-0000-4000-9000-000000000002') then raise exception 'legacy projection kept removed upload'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.source_versions) or exists(select 1 from public.sources) or exists(select 1 from public.source_bindings) then raise exception 'member discovered sources'; end if;
 begin perform public.record_document_verification('a11b0000-0000-4000-9000-000000000001','a6660000-0000-4000-9000-000000000004',repeat('c',64),'clean'); raise exception 'ungranted member changed verification'; exception when insufficient_privilege then null; end;
 begin perform public.read_source_version_v1('a6660000-0000-4000-9000-000000000002'); raise exception 'member read version'; exception when insufficient_privilege then null; end;
 begin perform public.bind_source_version_v1('a6660000-0000-4000-9000-000000000002','a11b0000-0000-4000-9000-000000000002',gen_random_uuid()); raise exception 'member bound hidden version'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- An independent tenant presenting the same bytes gets its own source, never a presence oracle.
insert into public.organizations(id,organization_type,name,created_by) values('a6660000-0000-4000-9000-000000000021','institutional','Synthetic source tenant B','a11b0000-0000-4000-8000-000000000002');
insert into public.organization_memberships(organization_id,user_id,role,status) values('a6660000-0000-4000-9000-000000000021','a11b0000-0000-4000-8000-000000000002','owner','active');
insert into public.capital_projects(id,organization_id,project_name,created_by) values('a6660000-0000-4000-9000-000000000022','a6660000-0000-4000-9000-000000000021','Synthetic source B','a11b0000-0000-4000-8000-000000000002');
insert into public.document_intake_sessions(id,organization_id,started_by,journey,capital_project_id) values('a6660000-0000-4000-9000-000000000023','a6660000-0000-4000-9000-000000000021','a11b0000-0000-4000-8000-000000000002','company','a6660000-0000-4000-9000-000000000022');
select set_config('request.headers','{"x-offroad-workspace":"a6660000-0000-4000-9000-000000000021"}',true);
set local role authenticated;
do $$ declare r jsonb; begin
 r:=public.register_source_version_v1('a6660000-0000-4000-9000-000000000021','a6660000-0000-4000-9000-000000000023','a6660000-0000-4000-9000-000000000024','a6660000-0000-4000-9000-000000000025','opportunity-documents','a6660000-0000-4000-9000-000000000021/a6660000-0000-4000-9000-000000000023/same.pdf','same-name.pdf','application/pdf',10,repeat('a',64));
 if r->>'id'<>'a6660000-0000-4000-9000-000000000025' or r->>'duplicate'<>'false' then raise exception 'cross tenant hash dedup leaked'; end if;
 begin perform public.read_source_version_v1('a6660000-0000-4000-9000-000000000002'); raise exception 'foreign version disclosed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
-- Only a leased, authorized document job can persist a matching byte-verification receipt.
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,source_document_id,kind,status,lease_expires_at,capability_sha256)
 values('a6660000-0000-4000-9000-000000000010','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000005','a11b0000-0000-4000-9000-000000000003','a6660000-0000-4000-9000-000000000004','document_pipeline','leased',now()+interval '10 minutes',extensions.digest(repeat('q',64),'sha256'));
select set_config('test.source_receipt',jsonb_build_object('verdict','clean','organizationId','a11b0000-0000-4000-9000-000000000001','sourceDocumentId','a6660000-0000-4000-9000-000000000004','operationId','a6660000-0000-4000-9000-000000000010','documentVersion',1,'expectedSha256',repeat('b',64),'observedSha256',repeat('b',64),'expectedByteSize',11,'observedByteSize',11,'receiptId','sha256:'||repeat('f',64))::text,true);
set local role authenticated;
select public.worker_record_document_result('a6660000-0000-4000-9000-000000000010',repeat('q',64),current_setting('test.source_receipt')::jsonb,null,null);
select public.worker_record_document_result('a6660000-0000-4000-9000-000000000010',repeat('q',64),current_setting('test.source_receipt')::jsonb,null,null);
do $$ begin
 if public.read_source_version_v1('a6660000-0000-4000-9000-000000000004')#>>'{verification,state}'<>'verified' then raise exception 'worker verification not recorded'; end if;
 begin perform public.worker_record_document_result('a6660000-0000-4000-9000-000000000010',repeat('q',64),current_setting('test.source_receipt')::jsonb||jsonb_build_object('observedSha256',repeat('e',64)),null,null); raise exception 'receipt for other bytes accepted'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.source_version_verifications where source_version_id='a6660000-0000-4000-9000-000000000004')<>1 then raise exception 'verification replay duplicated receipt'; end if;
end $$;
update private.resource_access_grants set revoked_at=now() where resource_id='a11b0000-0000-4000-9000-000000000002';
set local role authenticated;
do $$ begin
 begin perform public.worker_record_document_result('a6660000-0000-4000-9000-000000000010',repeat('q',64),current_setting('test.source_receipt')::jsonb,null,null); raise exception 'revoked job confirmed bytes'; exception when insufficient_privilege then null; end;
 begin perform public.authorize_source_version_download_v1('a6660000-0000-4000-9000-000000000002'); raise exception 'revoked subject retained version download'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.source_version_verifications where source_version_id='a6660000-0000-4000-9000-000000000004')<>1 then raise exception 'revocation destroyed historical verification receipt'; end if;
end $$;
select 'source_version_identity: PASS' as result;
rollback;
