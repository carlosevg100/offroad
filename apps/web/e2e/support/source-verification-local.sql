-- Local E2E setup only: a bounded lease for the real Storage + E0 receipt boundary.
-- This file does not attest bytes. The TypeScript harness downloads and verifies them.
begin;
select set_config('test.source_session', :'session_id', true) as unused \gset
select set_config('test.source_actor', :'owner_email', true) as unused \gset
select set_config('test.source_capability', :'capability', true) as unused \gset
create temp table source_verification_jobs (job jsonb) on commit drop;
do $$
declare s public.document_intake_sessions; d public.source_documents; actor uuid;
 worker_id uuid; credential_id uuid; run_id uuid; job_row public.processing_jobs;
begin
 select id into actor from auth.users where email=current_setting('test.source_actor');
 select * into s from public.document_intake_sessions where id=current_setting('test.source_session')::uuid and started_by=actor;
 if s.id is null or not exists(select 1 from auth.users where id=actor and email like 'e2e-%@example.com') then raise exception 'synthetic_source_scope_required'; end if;
 select id into worker_id from auth.users where email='local-worker@offroad.invalid';
 select id into credential_id from private.worker_tokens where label='local-e2e-worker' and revoked_at is null;
 if worker_id is null or credential_id is null then raise exception 'local_worker_required'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.headers',jsonb_build_object('x-offroad-workspace',s.organization_id)::text,true);
 insert into public.processing_runs(organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
 select s.organization_id,s.id,coalesce(max(run_no),0)+1,'manual','running','local-fixture-byte-verification-only',actor
 from public.processing_runs where organization_id=s.organization_id and intake_session_id=s.id returning id into run_id;
 for d in select * from public.source_documents where organization_id=s.organization_id and intake_session_id=s.id and sha256_verified_at is null loop
  insert into public.processing_jobs(organization_id,processing_run_id,intake_session_id,source_document_id,kind,status,attempts,leased_by,leased_account_user_id,lease_expires_at,capability_sha256,payload)
  values(s.organization_id,run_id,s.id,d.id,'document_pipeline','leased',1,credential_id,worker_id,now()+interval '10 minutes',extensions.digest(current_setting('test.source_capability'),'sha256'),
   jsonb_build_object('source_document_id',d.id,'document_version',d.document_version,'original_name',d.original_name,'mime_type',d.mime_type,'byte_size',d.byte_size,'sha256',d.sha256,'object_path',d.object_path)) returning * into job_row;
  insert into source_verification_jobs values(jsonb_build_object('claimed',true,'job_id',job_row.id,'organization_id',s.organization_id,'intake_session_id',s.id,'processing_run_id',run_id,'kind','document_pipeline','attempt',1,'lease_expires_at',job_row.lease_expires_at,'payload',job_row.payload));
 end loop;
end $$;
select coalesce(jsonb_agg(job),'[]'::jsonb) from source_verification_jobs;
commit;
