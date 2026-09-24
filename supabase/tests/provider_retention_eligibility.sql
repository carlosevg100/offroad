-- Synthetic and rollback-only. Never execute this fixture in production.
begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,source_document_id,kind,status,available_at,leased_by,leased_account_user_id,lease_expires_at,capability_sha256)
values('a7710000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000005','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000004','document_pipeline','leased',now(),'a3300000-0000-4000-8000-000000000001','a11b0000-0000-4000-8000-000000000002',now()+interval '10 minutes',extensions.digest(repeat('d',64),'sha256'));
create function pg_temp.retention_route() returns jsonb language sql as $$select '{"provider":"openai","model":"gpt-5.6-terra","accountRef":"synthetic-account","projectRef":"synthetic-project","credentialBinding":"synthetic-version","endpoint":"https://api.openai.com/v1/responses","region":"global"}'::jsonb$$;
create function pg_temp.retention_assurance(p_id uuid,p_model text default 'gpt-5.6-terra') returns jsonb language sql as $$
 select (pg_temp.retention_route()-'model')||jsonb_build_object('id',p_id,'policyVersion','offroad-provider-retention-v2','models',jsonb_build_array(p_model),'resource','inference','eligibility','supported','purposes','["case_analysis"]'::jsonb,'classifications','["restricted"]'::jsonb,'rights','["process"]'::jsonb,'trainingUse','prohibited','retention',jsonb_build_object('requestContentSeconds',0,'abuseMonitoringSeconds',2592000,'applicationStateSeconds',0,'cacheSeconds',86400,'metadataSeconds',2592000,'exceptions','["legal_hold"]'::jsonb),'zeroRetention','not_contracted','evidence',(select jsonb_agg(jsonb_build_object('kind',k,'reference','synthetic-proof','sha256',repeat('a',64))) from unnest(array['provider_terms','account_configuration','credential_binding']) k),'reviewedBy','Synthetic reviewer','reviewedAt',clock_timestamp()-interval '1 hour','validThrough',clock_timestamp()+interval '1 day','revokedAt',null);
$$;
-- Founder decision of 24/09/2026: the same verification may carry no date, valid until revoked or superseded.
create function pg_temp.open_ended_assurance(p_id uuid,p_model text default 'gpt-5.6-terra') returns jsonb language sql as $$
 select pg_temp.retention_assurance(p_id,p_model)||'{"validThrough":null}'::jsonb;
$$;
-- The one active assurance on the synthetic route is bounded by every dimension, dated or not.
create function pg_temp.assert_exact_scope(p_label text) returns void language plpgsql as $$
declare k text;route jsonb:=pg_temp.retention_route();begin
 if private.provider_resource_allowed_v1(route,'inference','case_analysis','restricted',2592000) is null then raise exception '%: limited retention incorrectly denied',p_label;end if;
 if private.provider_resource_allowed_v1(route,'file_upload','case_analysis','restricted',2592000) is not null then raise exception '%: file inherited inference approval',p_label;end if;
 if private.provider_resource_allowed_v1(route||'{"model":"gpt-5.6-sol"}','inference','case_analysis','restricted',2592000) is not null then raise exception '%: model inherited other model approval',p_label;end if;
 foreach k in array array['accountRef','projectRef','credentialBinding','endpoint','region'] loop
  if private.provider_resource_allowed_v1(jsonb_set(route,array[k],'"other"'),'inference','case_analysis','restricted',2592000) is not null then raise exception '%: route boundary lost: %',p_label,k;end if;
 end loop;
 if private.provider_resource_allowed_v1(route,'inference','evaluation','restricted',2592000) is not null then raise exception '%: purpose mismatch accepted',p_label;end if;
 if private.provider_resource_allowed_v1(route,'inference','case_analysis','public',2592000) is not null then raise exception '%: classification mismatch accepted',p_label;end if;
 if private.provider_resource_allowed_v1(route,'inference','case_analysis','restricted',2591999) is not null then raise exception '%: retention limit exceeded',p_label;end if;
end $$;
select private.record_provider_processing_assurance_v1(pg_temp.retention_assurance('a7160000-0000-4000-9000-000000000001'),'Synthetic stage 16 proof');
select pg_temp.assert_exact_scope('dated assurance');
do $$ declare k text;v jsonb;begin
 begin perform private.record_provider_processing_assurance_v1(pg_temp.retention_assurance(gen_random_uuid()),'Synthetic overlap');raise exception 'overlapping assurance accepted';exception when unique_violation then null;end;
 -- Dropping the date does not bypass the overlap: a replacement is a revocation plus a new identity.
 begin perform private.record_provider_processing_assurance_v1(pg_temp.open_ended_assurance(gen_random_uuid()),'Synthetic open-ended overlap');raise exception 'overlapping open-ended assurance accepted';exception when unique_violation then null;end;
 foreach k in array array['trainingUse','eligibility','zeroRetention'] loop
  begin perform private.record_provider_processing_assurance_v1(pg_temp.retention_assurance(gen_random_uuid())-k,'Synthetic omitted obligation');raise exception 'missing obligation accepted: %',k;exception when sqlstate '22023' then null;end;
 end loop;
 begin perform private.record_provider_processing_assurance_v1(pg_temp.retention_assurance(gen_random_uuid())||jsonb_build_object('validThrough',clock_timestamp()-interval '1 minute'),'Synthetic expired assurance');raise exception 'expired assurance accepted';exception when sqlstate '22023' then null;end;
 -- The validity is always stated: an omitted key, or a value that is neither a date nor null, is refused.
 begin perform private.record_provider_processing_assurance_v1(pg_temp.retention_assurance(gen_random_uuid(),'synthetic-unstated-model')-'validThrough','Synthetic unstated validity');raise exception 'unstated validity accepted';exception when sqlstate '22023' then null;end;
 foreach v in array array['0','""','{}','[]']::jsonb[] loop
  begin perform private.record_provider_processing_assurance_v1(pg_temp.retention_assurance(gen_random_uuid(),'synthetic-unstated-model')||jsonb_build_object('validThrough',v),'Synthetic malformed validity');raise exception 'malformed validity accepted: %',v;exception when sqlstate '22023' then null;end;
 end loop;
 foreach k in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(k,'private.record_provider_processing_assurance_v1(jsonb,text)','EXECUTE') or has_function_privilege(k,'private.revoke_provider_processing_assurance_v1(uuid,text)','EXECUTE') then raise exception 'self attestation exposed to %',k;end if;
  if has_table_privilege(k,'private.provider_processing_assurances','SELECT,INSERT,UPDATE,DELETE') or has_table_privilege(k,'private.processing_eligibility_decisions','SELECT,INSERT,UPDATE,DELETE') then raise exception 'private provider authority exposed to %',k;end if;
 end loop;
end $$;
do $$ declare doc jsonb; route jsonb:=pg_temp.retention_route()||'{"model":"synthetic-expiry-model"}';
 open_doc jsonb; open_id uuid:=gen_random_uuid(); open_route jsonb:=pg_temp.retention_route()||'{"model":"synthetic-open-model"}';begin
 doc:=pg_temp.retention_assurance(gen_random_uuid(),'synthetic-expiry-model')||jsonb_build_object('validThrough',clock_timestamp()+interval '500 milliseconds');
 perform private.record_provider_processing_assurance_v1(doc,'Synthetic expiry boundary');
 open_doc:=pg_temp.open_ended_assurance(open_id,'synthetic-open-model');
 perform private.record_provider_processing_assurance_v1(open_doc,'Synthetic open-ended assurance');
 if (select valid_through from private.provider_processing_assurances where id=open_id) is not null then raise exception 'open-ended assurance stored a date';end if;
 if private.provider_resource_allowed_v1(route,'inference','case_analysis','restricted',2592000) is null then raise exception 'unexpired assurance denied';end if;
 if private.provider_resource_allowed_v1(open_route,'inference','case_analysis','restricted',2592000) is distinct from open_id then raise exception 'open-ended assurance denied';end if;
 perform pg_sleep(0.6);
 if private.provider_resource_allowed_v1(route,'inference','case_analysis','restricted',2592000) is not null then raise exception 'expired assurance reused';end if;
 if private.provider_resource_allowed_v1(open_route,'inference','case_analysis','restricted',2592000) is distinct from open_id then raise exception 'open-ended assurance expired with the dated one';end if;
 -- A new resource or model beside an open-ended assurance still has no assurance of its own.
 if private.provider_resource_allowed_v1(open_route,'file_upload','case_analysis','restricted',2592000) is not null
 or private.provider_resource_allowed_v1(open_route||'{"model":"synthetic-unassured-model"}','inference','case_analysis','restricted',2592000) is not null
 then raise exception 'open-ended assurance inherited by a new resource or model';end if;
 -- Training use is still checked without a date.
 perform private.record_provider_processing_assurance_v1(pg_temp.open_ended_assurance(gen_random_uuid(),'synthetic-training-model')||'{"trainingUse":"permitted"}'::jsonb,'Synthetic open-ended training use');
 if private.provider_resource_allowed_v1(pg_temp.retention_route()||'{"model":"synthetic-training-model"}','inference','case_analysis','restricted',2592000) is not null then raise exception 'open-ended assurance allowed training use';end if;
 -- Revocation ends it at once, and the same identity and document cannot be recorded again.
 perform private.revoke_provider_processing_assurance_v1(open_id,'Synthetic open-ended withdrawal');
 if private.provider_resource_allowed_v1(open_route,'inference','case_analysis','restricted',2592000) is not null then raise exception 'revoked open-ended assurance reused';end if;
 begin perform private.record_provider_processing_assurance_v1(open_doc,'Synthetic record after withdrawal');raise exception 'revoked open-ended identity recorded again';exception when sqlstate '22023' then null;end;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ declare d jsonb;begin
 d:=public.worker_authorize_provider_processing_v1('a7710000-0000-4000-9000-000000000001',repeat('d',64),pg_temp.retention_route(),array['inference'],'case_analysis');
 if d->>'allowed'<>'true' or d->>'classification'<>'restricted' then raise exception 'current worker processing denied';end if;
 d:=public.worker_authorize_provider_processing_v1('a7710000-0000-4000-9000-000000000001',repeat('d',64),pg_temp.retention_route(),array['file_upload'],'case_analysis');
 if d->>'allowed'<>'false' then raise exception 'worker uploaded under inference approval';end if;
 begin perform private.record_provider_processing_assurance_v1('{}','Synthetic self attestation');raise exception 'worker self attested';exception when insufficient_privilege then null;end;
 begin perform public.worker_authorize_provider_processing_v1('a7710000-0000-4000-9000-000000000001',repeat('x',64),pg_temp.retention_route(),array['inference'],'case_analysis');raise exception 'forged capability authorized processing';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- A derived document cannot outlive a source outside its own job's direct document.
savepoint dependency_retention;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,mime_type,created_by,processing_status)
values('a7160000-0000-4000-9000-000000000099','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/dependency.txt','Synthetic dependency','text/plain','a11b0000-0000-4000-8000-000000000001','ready');
insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,expires_at,store_until,evidence_kind,evidence_reference,evidence_sha256,created_by)
select organization_id,source_version_id,2,operations,purposes,audience,valid_from,clock_timestamp()+interval '1 day',clock_timestamp()+interval '1 day',evidence_kind,evidence_reference,evidence_sha256,created_by
from private.source_rights_versions where source_version_id='a7160000-0000-4000-9000-000000000099' and revision=1;
insert into private.resource_dependencies(organization_id,derived_version_id,source_version_id,source_rights_version_id,created_by)
select organization_id,'a11b0000-0000-4000-9000-000000000004',source_version_id,id,created_by from private.source_rights_versions where source_version_id='a7160000-0000-4000-9000-000000000099' and revision=2;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ declare d jsonb;begin
 d:=public.worker_authorize_provider_processing_v1('a7710000-0000-4000-9000-000000000001',repeat('d',64),pg_temp.retention_route(),array['inference'],'case_analysis');
 if d->>'allowed'<>'false' then raise exception 'dependency deadline did not constrain retention';end if;
end $$;
reset role;
rollback to savepoint dependency_retention;
select private.revoke_provider_processing_assurance_v1('a7160000-0000-4000-9000-000000000001','Synthetic operator withdrawal');
set local role authenticated;
do $$ declare d jsonb;begin
 d:=public.worker_authorize_provider_processing_v1('a7710000-0000-4000-9000-000000000001',repeat('d',64),pg_temp.retention_route(),array['inference'],'case_analysis');
 if d->>'allowed'<>'false' then raise exception 'revoked assurance reused';end if;
end $$;
reset role;
-- The replacement mirrors the act of 24/09/2026: a new identity for the same verification, without a date.
select private.record_provider_processing_assurance_v1(pg_temp.open_ended_assurance('a7160000-0000-4000-9000-000000000002'),'Synthetic replacement reviewed');
select pg_temp.assert_exact_scope('open-ended replacement');
set local role authenticated;
do $$ declare d jsonb;begin
 d:=public.worker_authorize_provider_processing_v1('a7710000-0000-4000-9000-000000000001',repeat('d',64),pg_temp.retention_route(),array['inference'],'case_analysis');
 if d->>'allowed'<>'true' or d->>'assuranceId'<>'a7160000-0000-4000-9000-000000000002' then raise exception 'open-ended replacement denied';end if;
 d:=public.worker_authorize_provider_processing_v1('a7710000-0000-4000-9000-000000000001',repeat('d',64),pg_temp.retention_route(),array['inference','file_upload'],'case_analysis');
 if d->>'allowed'<>'false' or d->'reasons'<>'["processing_resource_ineligible:file_upload"]'::jsonb then raise exception 'new resource inherited the open-ended replacement';end if;
 d:=public.worker_authorize_provider_processing_v1('a7710000-0000-4000-9000-000000000001',repeat('d',64),pg_temp.retention_route()||'{"model":"gpt-5.6-sol"}',array['inference'],'case_analysis');
 if d->>'allowed'<>'false' then raise exception 'new model inherited the open-ended replacement';end if;
end $$;
reset role;
select private.revoke_provider_processing_assurance_v1('a7160000-0000-4000-9000-000000000002','Synthetic open-ended withdrawal');
set local role authenticated;
do $$ declare d jsonb;begin
 d:=public.worker_authorize_provider_processing_v1('a7710000-0000-4000-9000-000000000001',repeat('d',64),pg_temp.retention_route(),array['inference'],'case_analysis');
 if d->>'allowed'<>'false' then raise exception 'revoked open-ended replacement reused';end if;
end $$;
reset role;
select private.record_provider_processing_assurance_v1(pg_temp.open_ended_assurance('a7160000-0000-4000-9000-000000000003'),'Synthetic second replacement');
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',1,array['read'],array['analysis'],null,null,gen_random_uuid(),repeat('a',64));
reset role;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
 begin perform public.worker_authorize_provider_processing_v1('a7710000-0000-4000-9000-000000000001',repeat('d',64),pg_temp.retention_route(),array['inference'],'case_analysis');raise exception 'revoked source leaked to provider';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.processing_eligibility_decisions where job_id='a7710000-0000-4000-9000-000000000001')<>7 then raise exception 'processing audit missing';end if;
 if (select count(*) from private.provider_processing_assurance_events where assurance_id='a7160000-0000-4000-9000-000000000001')<>2
 or (select count(*) from private.provider_processing_assurance_events where assurance_id='a7160000-0000-4000-9000-000000000002')<>2 then raise exception 'operator audit missing';end if;
end $$;
select 'provider_retention_eligibility: PASS' as result;
rollback;
