-- Lote 4, ficha C09: each file of a folder is read in a job of its own, outside the conversation turn and its
-- budget. The turn asks for the readings of its work's files; a file without one gets one reading job (one per
-- bytes, reader version and registry, at most 50 waiting per organization), and the turn names it as "in reading"
-- until it is ready or refused by name. A reading is kept per organization, bytes, reader version and registry,
-- so the same bytes in another work of the organization are not read again. Nothing here grants a client anything.

-- 1. The kind.
alter table public.processing_jobs drop constraint processing_jobs_kind_check;
alter table public.processing_jobs add constraint processing_jobs_kind_check check(kind in ('document_pipeline','preliminary_analysis','case_analysis','capital_project_analysis',
 'agent_operation_brief','execution_brief_proposal','work_conversation','work_execution','governed_evaluation','document_folder_reading'));

-- 2. The readings: private, written only by the reading job's command, read only by the conversation's command.
create table private.document_folder_readings (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 sha256 text not null,
 reader_version text not null,
 context_fingerprint text not null,
 status text not null,
 reading jsonb,
 refusal_code text,
 source_job_id uuid not null,
 created_at timestamptz not null default now(),
 constraint document_folder_readings_pkey primary key(organization_id,sha256,reader_version,context_fingerprint),
 constraint document_folder_readings_job_fkey foreign key(organization_id,source_job_id) references public.processing_jobs(organization_id,id),
 constraint document_folder_readings_identity_check check(sha256 ~ '^[a-f0-9]{64}$' and context_fingerprint ~ '^[a-f0-9]{64}$' and reader_version ~ '^[a-z0-9][a-z0-9.-]{0,79}$'),
 constraint document_folder_readings_status_check check((status='ready' and reading is not null and refusal_code is null)
  or (status='refused' and reading is null and refusal_code ~ '^[a-z][a-zA-Z0-9_]{0,59}$')),
 constraint document_folder_readings_reading_check check(reading is null or (jsonb_typeof(reading)='object' and octet_length(reading::text)<=1048576))
);
create index document_folder_readings_job_idx on private.document_folder_readings(organization_id,source_job_id);
alter table private.document_folder_readings enable row level security;
alter table private.document_folder_readings force row level security;
create policy document_folder_readings_deny on private.document_folder_readings as restrictive for all to public using(false) with check(false);
revoke all on private.document_folder_readings from public,anon,authenticated,service_role;
create trigger document_folder_readings_immutable before update or delete on private.document_folder_readings for each row execute function private.guard_contribution_immutable_v1();
comment on table private.document_folder_readings is 'One reading of a file of a folder (ficha C09) per organization, bytes, reader version and registry, or its refusal by name. Written by the reading job; read by the conversation of a work that holds the same bytes. No client grant.';

-- 3. The reading job's budget: one 16k extraction over one file and its fallback (packages/model-gateway, production-budgets).
create function private.document_folder_reading_budget_v1() returns jsonb
language sql immutable set search_path='' as $$ select jsonb_build_object('max_calls',2,'max_cost_usd',1.7); $$;
revoke all on function private.document_folder_reading_budget_v1() from public,anon,authenticated,service_role;

-- 4. For the conversation turn of a work: the reading of each named file of the work, ready, refused or pending, and one
-- reading job queued for each pending one that has none (at most 50 waiting per organization). The registry the
-- readings resolve entities against is part of the key; its fingerprint is the hash of its jsonb text.
create function private.worker_document_folder_readings_v1(p_job_id uuid,p_capability_token text,p_reader_version text,p_context jsonb,p_files jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare job_row public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);org uuid;work uuid;ctx text;
 f record;r private.document_folder_readings;out jsonb:='[]'::jsonb;waiting integer;run uuid;queued integer:=0;
begin
 if job_row.kind<>'agent_operation_brief' then raise exception 'agent_operation_brief_capability_required' using errcode='42501';end if;
 org:=job_row.organization_id;
 select capital_project_id into work from public.document_intake_sessions where organization_id=org and id=job_row.intake_session_id;
 if work is null or job_row.authorization_subject_id is null then raise exception 'document_folder_reading_work_required' using errcode='42501';end if;
 if coalesce(p_reader_version,'') !~ '^[a-z0-9][a-z0-9.-]{0,79}$' or jsonb_typeof(p_context) is distinct from 'object' or octet_length(p_context::text)>262144
  or jsonb_typeof(p_files) is distinct from 'array' or jsonb_array_length(p_files)>1000 then raise exception 'document_folder_readings_invalid' using errcode='22023';end if;
 ctx:=encode(extensions.digest(p_context::text,'sha256'),'hex');
 select count(*) into waiting from public.processing_jobs where organization_id=org and kind='document_folder_reading' and status in ('queued','leased');
 for f in select x.n,d.id,d.sha256 from jsonb_array_elements(p_files) with ordinality x(v,n)
  left join public.source_documents d on d.organization_id=org and d.id::text=x.v->>'documentId' and d.sha256 ~ '^[a-f0-9]{64}$'
   and exists(select 1 from public.document_intake_sessions s where s.organization_id=d.organization_id and s.id=d.intake_session_id and s.capital_project_id=work)
  order by x.n loop
  -- Only a file of the job's own work is answered; anything else is refused by name, never looked up.
  if f.id is null then raise exception 'document_folder_reading_file_denied' using errcode='42501';end if;
  select * into r from private.document_folder_readings where organization_id=org and sha256=f.sha256 and reader_version=p_reader_version and context_fingerprint=ctx;
  if r.status is not null then
   out:=out||jsonb_build_array(jsonb_build_object('documentId',f.id,'sha256',f.sha256,'status',r.status,'reading',r.reading,'refusalCode',r.refusal_code));
   continue;
  end if;
  if not exists(select 1 from public.processing_jobs j where j.organization_id=org and j.kind='document_folder_reading' and j.status in ('queued','leased')
    and j.payload->>'sha256'=f.sha256 and j.payload->>'reader_version'=p_reader_version and j.payload->>'context_fingerprint'=ctx) and waiting<50 then
   if run is null then
    insert into public.processing_runs(organization_id,intake_session_id,run_no,trigger,pipeline_version,created_by,budget)
    values(org,job_row.intake_session_id,(select coalesce(max(run_no),0)+1 from public.processing_runs where organization_id=org and intake_session_id=job_row.intake_session_id),
     'manual','document-folder-reading-v1',job_row.authorization_subject_id,jsonb_build_object('perJob',private.document_folder_reading_budget_v1()))
    returning id into run;
   end if;
   insert into public.processing_jobs(organization_id,processing_run_id,intake_session_id,kind,payload,max_attempts)
   values(org,run,job_row.intake_session_id,'document_folder_reading',jsonb_build_object('source_document_id',f.id,'sha256',f.sha256,'reader_version',p_reader_version,
    'context_fingerprint',ctx,'context',p_context,'model_budget',private.document_folder_reading_budget_v1()),2);
   waiting:=waiting+1;queued:=queued+1;
  end if;
  out:=out||jsonb_build_array(jsonb_build_object('documentId',f.id,'sha256',f.sha256,'status','pending','reading',null,'refusalCode',null));
 end loop;
 return jsonb_build_object('contextFingerprint',ctx,'queued',queued,'files',out);
end $$;
revoke all on function private.worker_document_folder_readings_v1(uuid,text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.worker_document_folder_readings_v1(uuid,text,text,jsonb,jsonb) to authenticated;
create function public.worker_document_folder_readings_v1(p_job_id uuid,p_capability_token text,p_reader_version text,p_context jsonb,p_files jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.worker_document_folder_readings_v1(p_job_id,p_capability_token,p_reader_version,p_context,p_files); $$;
revoke all on function public.worker_document_folder_readings_v1(uuid,text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.worker_document_folder_readings_v1(uuid,text,text,jsonb,jsonb) to authenticated;

-- 5. For the reading job: its file, the bytes it was queued for, its latest ready layer and the registry.
create function private.worker_document_folder_reading_input_v1(p_job_id uuid,p_capability_token text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare job_row public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);d public.source_documents;l public.document_layers;
begin
 if job_row.kind<>'document_folder_reading' then raise exception 'document_folder_reading_capability_required' using errcode='42501';end if;
 select sd.* into d from public.source_documents sd where sd.organization_id=job_row.organization_id and sd.id::text=job_row.payload->>'source_document_id'
  and exists(select 1 from public.document_intake_sessions s where s.organization_id=sd.organization_id and s.id=sd.intake_session_id and s.capital_project_id=job_row.work_id);
 if d.id is null or d.sha256 is distinct from job_row.payload->>'sha256' then raise exception 'document_folder_reading_file_changed' using errcode='42501';end if;
 select * into l from public.document_layers where organization_id=d.organization_id and source_document_id=d.id and status='ready' order by document_version desc,created_at desc limit 1;
 return jsonb_build_object('sourceDocumentId',d.id,'sha256',d.sha256,'mimeType',d.mime_type,'readerVersion',job_row.payload->>'reader_version',
  'contextFingerprint',job_row.payload->>'context_fingerprint','context',job_row.payload->'context','layerObjectPath',l.object_path,'layerSha256',l.sha256);
end $$;
revoke all on function private.worker_document_folder_reading_input_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_document_folder_reading_input_v1(uuid,text) to authenticated;
create function public.worker_document_folder_reading_input_v1(p_job_id uuid,p_capability_token text) returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.worker_document_folder_reading_input_v1(p_job_id,p_capability_token); $$;
revoke all on function public.worker_document_folder_reading_input_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.worker_document_folder_reading_input_v1(uuid,text) to authenticated;

-- 6. The reading job records its reading or its refusal once; a second record of the same key keeps the first.
create function private.worker_record_document_folder_reading_v1(p_job_id uuid,p_capability_token text,p_status text,p_reading jsonb,p_refusal_code text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare job_row public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);n integer;
begin
 if job_row.kind<>'document_folder_reading' then raise exception 'document_folder_reading_capability_required' using errcode='42501';end if;
 insert into private.document_folder_readings(organization_id,sha256,reader_version,context_fingerprint,status,reading,refusal_code,source_job_id)
 values(job_row.organization_id,job_row.payload->>'sha256',job_row.payload->>'reader_version',job_row.payload->>'context_fingerprint',p_status,
  case when p_status='ready' then p_reading end,case when p_status='refused' then p_refusal_code end,job_row.id)
 on conflict do nothing;
 get diagnostics n=row_count;
 return jsonb_build_object('recorded',n=1);
exception when check_violation then raise exception 'document_folder_reading_invalid' using errcode='22023';
end $$;
revoke all on function private.worker_record_document_folder_reading_v1(uuid,text,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_record_document_folder_reading_v1(uuid,text,text,jsonb,text) to authenticated;
create function public.worker_record_document_folder_reading_v1(p_job_id uuid,p_capability_token text,p_status text,p_reading jsonb,p_refusal_code text) returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.worker_record_document_folder_reading_v1(p_job_id,p_capability_token,p_status,p_reading,p_refusal_code); $$;
revoke all on function public.worker_record_document_folder_reading_v1(uuid,text,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.worker_record_document_folder_reading_v1(uuid,text,text,jsonb,text) to authenticated;

-- 7. The storage gate: the document pipeline keeps its access; a leased folder reading job may read, never write, the
-- ready layer of the one file it was queued for, of its own organization and work. The conversation reads no layer.
create or replace function private.worker_can_access_document_storage_v1(p_bucket text,p_object_path text,p_write boolean)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
 select auth.uid() is not null and (exists(select 1 from public.processing_jobs j
 join public.source_documents d on d.organization_id=j.organization_id and d.id=j.source_document_id
 where j.kind='document_pipeline' and j.status='leased' and j.lease_expires_at>now()
 and j.leased_account_user_id=auth.uid() and private.job_authority_is_current_v1(j.id)
 and ((not p_write and p_bucket='opportunity-documents' and p_object_path=d.object_path)
 or (p_bucket='document-layers' and p_object_path=j.payload->>'layer_object_path')))
 or (not coalesce(p_write,true) and p_bucket='document-layers' and exists(select 1 from public.processing_jobs j
 join public.document_layers l on l.organization_id=j.organization_id and l.source_document_id::text=j.payload->>'source_document_id'
  and l.bucket_id='document-layers' and l.object_path=p_object_path and l.status='ready'
 join public.source_documents d on d.organization_id=l.organization_id and d.id=l.source_document_id and d.sha256=j.payload->>'sha256'
 join public.document_intake_sessions ds on ds.organization_id=d.organization_id and ds.id=d.intake_session_id
 where j.kind='document_folder_reading' and j.status='leased' and j.lease_expires_at>now()
 and j.leased_account_user_id=auth.uid() and private.job_authority_is_current_v1(j.id)
 and j.work_id is not null and ds.capital_project_id=j.work_id)));
$function$