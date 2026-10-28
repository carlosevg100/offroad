-- Lote 4, ficha C09: each file of a folder is read in a job of its own, outside the conversation turn and its
-- budget. The turn asks for the readings of its work's files; a file without one gets one reading job of its own
-- wait (its work and person; at most 50 waiting per organization), and the turn names it as "in reading" until it is
-- ready or refused by name. A reading is kept per organization, bytes, reader version and registry, so the same bytes
-- in another work of the organization are not read again; it is given only for a file whose own rights the person
-- still holds. Nothing here grants a client anything.

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

-- 4. What waits on readings: the turn that named a file still being read, with the files it named, the registry and how the
-- person framed the request (so the folder is organized as asked when the readings are done). One open wait per work,
-- reader version and registry. A wait closes only when a turn of its work read the complete set (consumed_at); until then
-- every reading recorded in the organization carries it on: it queues what the wait still lacks and, when nothing is
-- lacking, schedules one continuation turn (again if that turn did not finish), under the wait's own authority.
create table private.document_folder_reading_waits (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 id uuid not null default gen_random_uuid(),
 work_id uuid not null,
 intake_session_id uuid not null,
 conversation_id uuid not null,
 -- The person's message the folder request came from: the author and date of its answers, never the continuation's.
 source_message_id uuid not null,
 -- The person who asked: every job queued for this wait runs with this person's authority over the work, rechecked when it is queued.
 subject_id uuid not null references auth.users(id),
 locale text not null,
 reader_version text not null,
 context_fingerprint text not null,
 context jsonb not null,
 document_ids uuid[] not null,
 framing jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 consumed_at timestamptz,
 resume_message_id uuid,
 constraint document_folder_reading_waits_pkey primary key(organization_id,id),
 constraint document_folder_reading_waits_work_fkey foreign key(organization_id,work_id) references public.capital_projects(organization_id,id) on delete cascade,
 constraint document_folder_reading_waits_session_fkey foreign key(organization_id,intake_session_id) references public.document_intake_sessions(organization_id,id) on delete cascade,
 constraint document_folder_reading_waits_shape_check check(locale in ('pt-BR','en-US') and context_fingerprint ~ '^[a-f0-9]{64}$' and cardinality(document_ids) between 1 and 1000
  and (framing is null or (jsonb_typeof(framing)='object' and octet_length(framing::text)<=65536)) and octet_length(context::text)<=262144)
);
create unique index document_folder_reading_waits_open_idx on private.document_folder_reading_waits(organization_id,work_id,reader_version,context_fingerprint) where consumed_at is null;
alter table private.document_folder_reading_waits enable row level security;
alter table private.document_folder_reading_waits force row level security;
create policy document_folder_reading_waits_deny on private.document_folder_reading_waits as restrictive for all to public using(false) with check(false);
revoke all on private.document_folder_reading_waits from public,anon,authenticated,service_role;
comment on table private.document_folder_reading_waits is 'A conversation turn of a work waiting on folder readings (ficha C09): carried on by every reading recorded in the organization until a turn consumes the complete set. No client grant.';

-- The person a job queued for a wait runs as: the wait's subject, only for a job of the wait's own session and a run that
-- person created, and only while that person still has work access to the session's resource. The job trigger asks it.
create function private.document_folder_wait_job_subject_v1(p_org uuid,p_wait uuid,p_session uuid,p_run uuid,p_root uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select w.subject_id from private.document_folder_reading_waits w join public.processing_runs r on r.organization_id=w.organization_id and r.id=p_run and r.created_by=w.subject_id
 where w.organization_id=p_org and w.id=p_wait and w.intake_session_id=p_session and r.intake_session_id=p_session
  and private.resource_access_as_subject_v1(p_org,p_root,w.subject_id,'work');
$$;
revoke all on function private.document_folder_wait_job_subject_v1(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Serializes the turn's question and the reading's record for one organization, reader version and registry, so a wait
-- is never written after the last reading's record looked for it.
create function private.document_folder_reading_lock_v1(p_org uuid,p_reader_version text,p_context_fingerprint text) returns void
language sql volatile security definer set search_path='' as $$
 select pg_advisory_xact_lock(hashtextextended('document-folder-reading:'||p_org::text||':'||p_reader_version||':'||p_context_fingerprint,0));
$$;
revoke all on function private.document_folder_reading_lock_v1(uuid,text,text) from public,anon,authenticated,service_role;

-- The state of one file for a person and a wait: refused when the person no longer holds the file's own rights (its
-- session and document, revocation included), the stored reading when there is one, refused when its wait's reading
-- jobs for those bytes ended three times without a reading, otherwise pending.
create function private.document_folder_file_state_v1(p_org uuid,p_document uuid,p_subject uuid,p_wait uuid,p_reader_version text,p_context_fingerprint text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d public.source_documents;r private.document_folder_readings;
begin
 select * into d from public.source_documents where organization_id=p_org and id=p_document;
 if d.id is null or not private.source_use_allowed_v1(p_org,d.id,p_subject,'process','analysis') or not private.source_use_allowed_v1(p_org,d.id,p_subject,'store','analysis') then
  return jsonb_build_object('status','refused','reading',null,'refusalCode','source_rights_revoked');
 end if;
 select * into r from private.document_folder_readings where organization_id=p_org and sha256=d.sha256 and reader_version=p_reader_version and context_fingerprint=p_context_fingerprint;
 if r.status is not null then return jsonb_build_object('status',r.status,'reading',r.reading,'refusalCode',r.refusal_code);end if;
 if p_wait is not null and (select count(*) from public.processing_jobs j where j.organization_id=p_org and j.kind='document_folder_reading'
   and j.status in ('failed','poison','cancelled') and j.payload->>'document_folder_wait_id'=p_wait::text and j.payload->>'sha256'=d.sha256
   and j.payload->>'reader_version'=p_reader_version and j.payload->>'context_fingerprint'=p_context_fingerprint)>=3 then
  return jsonb_build_object('status','refused','reading',null,'refusalCode','reading_failed');
 end if;
 return jsonb_build_object('status','pending','reading',null,'refusalCode',null);
end $$;
revoke all on function private.document_folder_file_state_v1(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;

-- One reading job per pending file of a wait that has none of its own, while fewer than 50 wait in the organization. A
-- job belongs to one wait: the jobs of one call share one run, created by the wait's person, run with that person's
-- authority (the job trigger rechecks it) and carry the target file in source_document_id, so the job's authority checks
-- that file's own rights. Another wait's job for the same bytes is never relied on.
create function private.document_folder_reading_enqueue_v1(p_org uuid,p_wait uuid,p_documents uuid[]) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare w private.document_folder_reading_waits;waiting integer;run uuid;queued integer:=0;d record;
begin
 select * into w from private.document_folder_reading_waits where organization_id=p_org and id=p_wait;
 if w.id is null then return 0;end if;
 -- A job whose reading is already recorded (its lease about to end) no longer takes a place.
 select count(*) into waiting from public.processing_jobs j where j.organization_id=p_org and j.kind='document_folder_reading' and j.status in ('queued','leased')
  and not exists(select 1 from private.document_folder_readings r where r.organization_id=j.organization_id and r.sha256=j.payload->>'sha256'
   and r.reader_version=j.payload->>'reader_version' and r.context_fingerprint=j.payload->>'context_fingerprint');
 for d in select distinct on (sd.sha256) sd.id,sd.sha256 from unnest(p_documents) with ordinality u(id,n) join public.source_documents sd on sd.organization_id=p_org and sd.id=u.id
  join public.document_intake_sessions ss on ss.organization_id=sd.organization_id and ss.id=sd.intake_session_id and ss.capital_project_id=w.work_id
  where sd.sha256 ~ '^[a-f0-9]{64}$'
   and private.document_folder_file_state_v1(p_org,sd.id,w.subject_id,w.id,w.reader_version,w.context_fingerprint)->>'status'='pending'
   and not exists(select 1 from public.processing_jobs j where j.organization_id=p_org and j.kind='document_folder_reading' and j.status in ('queued','leased')
    and j.payload->>'document_folder_wait_id'=w.id::text and j.payload->>'sha256'=sd.sha256)
  order by sd.sha256,u.n loop
  exit when waiting>=50;
  if run is null then
   insert into public.processing_runs(organization_id,intake_session_id,run_no,trigger,pipeline_version,created_by,budget)
   values(p_org,w.intake_session_id,(select coalesce(max(run_no),0)+1 from public.processing_runs where organization_id=p_org and intake_session_id=w.intake_session_id),
    'manual','document-folder-reading-v1',w.subject_id,jsonb_build_object('perJob',private.document_folder_reading_budget_v1()))
   returning id into run;
  end if;
  insert into public.processing_jobs(organization_id,processing_run_id,intake_session_id,source_document_id,kind,payload,max_attempts)
  values(p_org,run,w.intake_session_id,d.id,'document_folder_reading',jsonb_build_object('source_document_id',d.id,'sha256',d.sha256,'reader_version',w.reader_version,
   'context_fingerprint',w.context_fingerprint,'context',w.context,'document_folder_wait_id',w.id,'model_budget',private.document_folder_reading_budget_v1()),2);
  waiting:=waiting+1;queued:=queued+1;
 end loop;
 return queued;
end $$;
revoke all on function private.document_folder_reading_enqueue_v1(uuid,uuid,uuid[]) from public,anon,authenticated,service_role;

-- For the conversation turn of a work: the reading of each named file of the work, ready, refused or pending. With any
-- pending, the turn's wait is kept (or renewed, the continuation to be scheduled again) and its files queued; with none,
-- the turn reads the complete set and the wait of its work closes as consumed.
create function private.worker_document_folder_readings_v1(p_job_id uuid,p_capability_token text,p_reader_version text,p_context jsonb,p_files jsonb,p_framing jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare job_row public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);org uuid;work uuid;ctx text;conversation uuid;source uuid;wait uuid;
 f record;st jsonb;open_wait uuid;out jsonb:='[]'::jsonb;pending uuid[]:='{}';named uuid[]:='{}';queued integer:=0;
begin
 if job_row.kind<>'agent_operation_brief' then raise exception 'agent_operation_brief_capability_required' using errcode='42501';end if;
 org:=job_row.organization_id;
 select capital_project_id into work from public.document_intake_sessions where organization_id=org and id=job_row.intake_session_id;
 if work is null or job_row.authorization_subject_id is null then raise exception 'document_folder_reading_work_required' using errcode='42501';end if;
 if coalesce(p_reader_version,'') !~ '^[a-z0-9][a-z0-9.-]{0,79}$' or jsonb_typeof(p_context) is distinct from 'object' or octet_length(p_context::text)>262144
  or jsonb_typeof(p_files) is distinct from 'array' or jsonb_array_length(p_files)>1000
  or (p_framing is not null and (jsonb_typeof(p_framing) is distinct from 'object' or octet_length(p_framing::text)>65536)) then raise exception 'document_folder_readings_invalid' using errcode='22023';end if;
 ctx:=encode(extensions.digest(p_context::text,'sha256'),'hex');
 perform private.document_folder_reading_lock_v1(org,p_reader_version,ctx);
 select id into open_wait from private.document_folder_reading_waits where organization_id=org and work_id=work and reader_version=p_reader_version
  and context_fingerprint=ctx and consumed_at is null;
 for f in select x.n,d.id,d.sha256 from jsonb_array_elements(p_files) with ordinality x(v,n)
  left join public.source_documents d on d.organization_id=org and d.id::text=x.v->>'documentId' and d.sha256 ~ '^[a-f0-9]{64}$'
   and exists(select 1 from public.document_intake_sessions s where s.organization_id=d.organization_id and s.id=d.intake_session_id and s.capital_project_id=work)
  order by x.n loop
  -- Only a file of the job's own work is answered; anything else is refused by name, never looked up.
  if f.id is null then raise exception 'document_folder_reading_file_denied' using errcode='42501';end if;
  named:=named||f.id;
  -- The file's own rights under the job's person come first: a file whose rights were withdrawn is refused, its stored
  -- reading never given and nothing queued for it.
  st:=private.document_folder_file_state_v1(org,f.id,job_row.authorization_subject_id,open_wait,p_reader_version,ctx);
  if st->>'status'<>'pending' then
   out:=out||jsonb_build_array(jsonb_build_object('documentId',f.id,'sha256',f.sha256,'status',st->>'status','reading',st->'reading','refusalCode',st->>'refusalCode'));
  else
   pending:=pending||f.id;
   out:=out||jsonb_build_array(jsonb_build_object('documentId',f.id,'sha256',f.sha256,'status','pending','reading',null,'refusalCode',null));
  end if;
 end loop;
 if cardinality(pending)>0 then
  -- A resumed turn keeps the person's original message as the source; its own message is the system's continuation.
  source:=coalesce(nullif(job_row.payload#>>'{document_folder_resume,source_message_id}','')::uuid,nullif(job_row.payload->>'message_id','')::uuid);
  select m.conversation_id into conversation from public.agent_messages m where m.organization_id=org and m.id=source and m.role='user'
   and coalesce(m.metadata->>'origin','person')<>'system';
  if conversation is not null then
   insert into private.document_folder_reading_waits(organization_id,work_id,intake_session_id,conversation_id,source_message_id,subject_id,locale,reader_version,context_fingerprint,context,document_ids,framing)
   values(org,work,job_row.intake_session_id,conversation,source,job_row.authorization_subject_id,coalesce(job_row.payload->>'locale','pt-BR'),p_reader_version,ctx,p_context,named,p_framing)
   on conflict(organization_id,work_id,reader_version,context_fingerprint) where consumed_at is null do update set document_ids=excluded.document_ids,framing=excluded.framing,
    conversation_id=excluded.conversation_id,source_message_id=excluded.source_message_id,subject_id=excluded.subject_id,locale=excluded.locale,
    intake_session_id=excluded.intake_session_id,resume_message_id=null,updated_at=now()
   returning id into wait;
   queued:=private.document_folder_reading_enqueue_v1(org,wait,pending);
  end if;
 else
  -- The turn reads the complete set: the wait of its work is consumed.
  update private.document_folder_reading_waits set consumed_at=now(),updated_at=now() where organization_id=org and work_id=work and reader_version=p_reader_version
   and context_fingerprint=ctx and consumed_at is null;
 end if;
 return jsonb_build_object('contextFingerprint',ctx,'queued',queued,'files',out);
end $$;
revoke all on function private.worker_document_folder_readings_v1(uuid,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.worker_document_folder_readings_v1(uuid,text,text,jsonb,jsonb,jsonb) to authenticated;
create function public.worker_document_folder_readings_v1(p_job_id uuid,p_capability_token text,p_reader_version text,p_context jsonb,p_files jsonb,p_framing jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.worker_document_folder_readings_v1(p_job_id,p_capability_token,p_reader_version,p_context,p_files,p_framing); $$;
revoke all on function public.worker_document_folder_readings_v1(uuid,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.worker_document_folder_readings_v1(uuid,text,text,jsonb,jsonb,jsonb) to authenticated;

revoke all on function public.worker_document_folder_readings_v1(uuid,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.worker_document_folder_readings_v1(uuid,text,text,jsonb,jsonb,jsonb) to authenticated;

-- 5. For the reading job: its file, the bytes it was queued for, its latest ready layer and the registry.
create function private.worker_document_folder_reading_input_v1(p_job_id uuid,p_capability_token text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare job_row public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);d public.source_documents;l public.document_layers;
begin
 if job_row.kind<>'document_folder_reading' then raise exception 'document_folder_reading_capability_required' using errcode='42501';end if;
 -- The capability already holds the target file's own rights (source_document_id); checked again here by name.
 if job_row.source_document_id is null or not private.source_use_allowed_v1(job_row.organization_id,job_row.source_document_id,job_row.authorization_subject_id,'process','analysis')
  then raise exception 'document_folder_reading_rights_revoked' using errcode='42501';end if;
 select sd.* into d from public.source_documents sd where sd.organization_id=job_row.organization_id and sd.id=job_row.source_document_id
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


-- 6. The reading job records its reading or its refusal once; a second record of the same key keeps the first. Then it
-- carries on every open wait of the organization, of any work or session: it queues the files a wait still lacks (the
-- limit of 50, taken by any session, left them out) and, for a wait whose files are all read, schedules a continuation
-- turn without a new message of the person, unless one is scheduled and not ended. The continuation is the system's: its
-- message is written by the worker account, marked origin system, never authored by the person; the brief job carries
-- the resume (source message and framing). Each job runs with its wait's person, rechecked when it is queued. A wait
-- closes only when a turn consumes the complete set. The two notice texts equal documentFolderResumeNotices in
-- apps/document-worker/src/document-folder-premises-proposal.ts.
create function private.document_folder_reading_advance_v1(p_org uuid) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare w private.document_folder_reading_waits;missing uuid[];run uuid;message uuid;resumed integer:=0;
begin
 for w in select * from private.document_folder_reading_waits where organization_id=p_org and consumed_at is null order by created_at,id for update loop
  -- A wait whose person lost access to the work is left as it is: nothing is queued in that person's name.
  if not private.resource_access_as_subject_v1(w.organization_id,private.resource_root_v1(w.organization_id,w.intake_session_id),w.subject_id,'work') then continue;end if;
  select coalesce(array_agg(u.id),'{}') into missing from unnest(w.document_ids) u(id)
  where private.document_folder_file_state_v1(w.organization_id,u.id,w.subject_id,w.id,w.reader_version,w.context_fingerprint)->>'status'='pending';
  if cardinality(missing)>0 then
   perform private.document_folder_reading_enqueue_v1(w.organization_id,w.id,missing);
   continue;
  end if;
  -- One continuation at a time: scheduled again only when the last one ended without consuming the set, at most three
  -- for a wait, and only by a worker account (the continuation's message is the system's, written by that account).
  if w.resume_message_id is not null and exists(select 1 from public.processing_jobs j where j.organization_id=w.organization_id and j.kind='agent_operation_brief'
    and j.payload->>'message_id'=w.resume_message_id::text and j.status in ('queued','leased','awaiting_approval','succeeded')) then continue;end if;
  if auth.uid() is null or (select count(*) from public.agent_messages m where m.organization_id=w.organization_id and m.conversation_id=w.conversation_id
    and m.metadata->>'kind'='document_folder_resume' and m.metadata->>'waitId'=w.id::text)>=3 then continue;end if;
  message:=gen_random_uuid();
  insert into public.processing_runs(organization_id,intake_session_id,run_no,trigger,status,pipeline_version,budget,versions,created_by)
  values(w.organization_id,w.intake_session_id,(select coalesce(max(run_no),0)+1 from public.processing_runs where organization_id=w.organization_id and intake_session_id=w.intake_session_id),
   'answer','queued','advisor-conversation-2026.09.01-v1',jsonb_build_object('maxCalls',1,'maxCostUsd',0.25),jsonb_build_object('agentContract','advisor-conversation-2026.09.01-v1'),w.subject_id)
  returning id into run;
  -- The conversation's turn loader reads a queued message of the conversation; this one is the system's, by the worker account.
  insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,metadata,created_by)
  values(message,w.organization_id,w.conversation_id,w.intake_session_id,'user','queued',
   case when w.locale='en-US' then 'Folder reading completed.' else 'Leitura da pasta concluída.' end,
   w.locale,jsonb_build_object('kind','document_folder_resume','origin','system','waitId',w.id,'projectId',w.work_id),auth.uid());
  insert into public.processing_jobs(organization_id,processing_run_id,intake_session_id,kind,payload,max_attempts)
  values(w.organization_id,run,w.intake_session_id,'agent_operation_brief',jsonb_build_object('message_id',message,'locale',w.locale,'surface','project_workspace',
   'document_folder_resume',jsonb_build_object('wait_id',w.id,'source_message_id',w.source_message_id,'framing',w.framing)),2);
  update public.agent_conversations set state='analyzing',updated_at=now() where organization_id=w.organization_id and id=w.conversation_id;
  update private.document_folder_reading_waits set resume_message_id=message,updated_at=now() where organization_id=w.organization_id and id=w.id;
  resumed:=resumed+1;
 end loop;
 return resumed;
end $$;
revoke all on function private.document_folder_reading_advance_v1(uuid) from public,anon,authenticated,service_role;

create function private.worker_record_document_folder_reading_v1(p_job_id uuid,p_capability_token text,p_status text,p_reading jsonb,p_refusal_code text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare job_row public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);n integer;resumed integer;
begin
 if job_row.kind<>'document_folder_reading' then raise exception 'document_folder_reading_capability_required' using errcode='42501';end if;
 perform private.document_folder_reading_lock_v1(job_row.organization_id,job_row.payload->>'reader_version',job_row.payload->>'context_fingerprint');
 begin
  insert into private.document_folder_readings(organization_id,sha256,reader_version,context_fingerprint,status,reading,refusal_code,source_job_id)
  values(job_row.organization_id,job_row.payload->>'sha256',job_row.payload->>'reader_version',job_row.payload->>'context_fingerprint',p_status,
   case when p_status='ready' then p_reading end,case when p_status='refused' then p_refusal_code end,job_row.id)
  on conflict do nothing;
 exception when check_violation then raise exception 'document_folder_reading_invalid' using errcode='22023';
 end;
 get diagnostics n=row_count;
 resumed:=private.document_folder_reading_advance_v1(job_row.organization_id);
 return jsonb_build_object('recorded',n=1,'resumed',resumed);
end $$;
revoke all on function private.worker_record_document_folder_reading_v1(uuid,text,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_record_document_folder_reading_v1(uuid,text,text,jsonb,text) to authenticated;
create function public.worker_record_document_folder_reading_v1(p_job_id uuid,p_capability_token text,p_status text,p_reading jsonb,p_refusal_code text) returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.worker_record_document_folder_reading_v1(p_job_id,p_capability_token,p_status,p_reading,p_refusal_code); $$;
revoke all on function public.worker_record_document_folder_reading_v1(uuid,text,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.worker_record_document_folder_reading_v1(uuid,text,text,jsonb,text) to authenticated;

-- A reading job or a continuation that ends without its result (failed for good, poison, or cancelled, by the outbox
-- when its person lost access included) carries on the same drain: every open wait of the organization is queued
-- again under its own person, and a complete wait gets its continuation again. Bounded by the three ended jobs per
-- file and the three continuations per wait above.
create function private.document_folder_reading_job_ended_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform private.document_folder_reading_advance_v1(new.organization_id);
 return null;
end $$;
revoke all on function private.document_folder_reading_job_ended_v1() from public,anon,authenticated,service_role;
create trigger processing_jobs_document_folder_reading_ended after update of status on public.processing_jobs for each row
 when (new.status in ('failed','poison','cancelled') and old.status is distinct from new.status
  and (new.kind='document_folder_reading' or (new.kind='agent_operation_brief' and new.payload ? 'document_folder_resume')))
 execute function private.document_folder_reading_job_ended_v1();

-- 7. The storage gate: the document pipeline keeps its access; a leased folder reading job may read, never write, the
-- ready layer of the one file it was queued for (source_document_id, whose own rights the job's authority checks), of
-- its own organization and work. The conversation reads no layer.
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
 join public.document_layers l on l.organization_id=j.organization_id and l.source_document_id=j.source_document_id
  and l.bucket_id='document-layers' and l.object_path=p_object_path and l.status='ready'
 join public.source_documents d on d.organization_id=l.organization_id and d.id=l.source_document_id and d.sha256=j.payload->>'sha256'
 join public.document_intake_sessions ds on ds.organization_id=d.organization_id and ds.id=d.intake_session_id
 where j.kind='document_folder_reading' and j.status='leased' and j.lease_expires_at>now()
 and j.leased_account_user_id=auth.uid() and private.job_authority_is_current_v1(j.id)
 and j.work_id is not null and ds.capital_project_id=j.work_id)));
$function$;

-- 8. The job trigger: a job queued for a folder reading wait (a reading job, or the continuation turn) runs as the wait's
-- person, only for the wait's session, a run that person created and while that person keeps work access. Every other
-- branch is the effective body unchanged.
create or replace function private.bind_job_authority_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare subject_id uuid := auth.uid(); root_id uuid; parent_subject uuid;
begin
 if new.kind='governed_evaluation' then
  if new.evaluation_id is null or new.work_id is not null or new.intake_session_id is not null or not exists(
   select 1 from private.governed_evaluations e
   join private.platform_evaluation_organizations o on o.organization_id=e.organization_id
   join public.processing_runs r on r.organization_id=e.organization_id and r.id=e.processing_run_id
   where e.organization_id=new.organization_id and e.id=new.evaluation_id and e.processing_run_id=new.processing_run_id
   and r.pipeline_version='governed-evaluation-v1' and r.created_by=e.requested_by_user_id
   and private.platform_evaluator_live_v1(e.requested_by_user_id))
  then raise exception 'job_authorization_denied' using errcode='42501';end if;
  new.authorization_subject_id:=null;new.authorization_resource_id:=null;new.authorization_revision:=null;new.review_execution_authorization_id:=null;
  return new;
 end if;
 root_id := private.resource_root_v1(new.organization_id,case when new.kind in ('work_conversation','work_execution') then new.work_id else new.intake_session_id end);

 if new.kind='work_execution' then
  select p.user_id into subject_id from public.work_executions e
  join private.principals p on p.organization_id=e.organization_id and p.id=e.principal_id and p.kind='human' and p.revoked_at is null
  join public.processing_runs r on r.organization_id=e.organization_id and r.id=e.processing_run_id and r.created_by=p.user_id
  join private.execution_manifests m on m.organization_id=e.organization_id and m.execution_id=e.id
  where e.organization_id=new.organization_id and e.id=new.execution_id and e.work_id=new.work_id and e.processing_run_id=new.processing_run_id
  and r.work_id=e.work_id and r.pipeline_version='pinned-work-execution-v1'
  and m.payload->>'principalId'=p.id::text and m.payload->>'workId'=e.work_id::text;
  if subject_id is null then raise exception 'job_authorization_denied' using errcode='42501';end if;
 elsif new.kind in ('document_folder_reading','agent_operation_brief') and coalesce(new.payload->>'document_folder_wait_id',new.payload#>>'{document_folder_resume,wait_id}') is not null then
  -- A folder reading job or a continuation turn queued for a wait runs as the wait's person, rechecked here (ficha C09).
  subject_id:=private.document_folder_wait_job_subject_v1(new.organization_id,coalesce(new.payload->>'document_folder_wait_id',new.payload#>>'{document_folder_resume,wait_id}')::uuid,
   new.intake_session_id,new.processing_run_id,root_id);
  if subject_id is null then raise exception 'job_authorization_denied' using errcode='42501';end if;
 elsif new.kind='agent_operation_brief' and new.payload ? 'institutional_recompute_candidate_id' then
  subject_id:=private.institutional_recompute_job_subject_v1(new.organization_id,(new.payload->>'institutional_recompute_candidate_id')::uuid,nullif(new.payload->>'message_id','')::uuid,new.intake_session_id,new.processing_run_id,root_id);
  if subject_id is null then raise exception 'job_authorization_denied' using errcode='42501';end if;
  new.review_execution_authorization_id:=(new.payload->>'message_id')::uuid;
 elsif new.kind='agent_operation_brief' and private.review_execution_authority_current_v1(nullif(new.payload->>'message_id','')::uuid,root_id,subject_id) then
 new.review_execution_authorization_id:=(new.payload->>'message_id')::uuid;
 elsif subject_id is null then
  select created_by into subject_id from public.processing_runs where organization_id=new.organization_id and id=new.processing_run_id;
 elsif not private.resource_access_as_subject_v1(new.organization_id,root_id,subject_id,'work') then
  -- Follow-up work inherits a currently leased parent or the parent just completed
  -- by this transaction. A completed job from an earlier transaction confers nothing.
  select j.authorization_subject_id into parent_subject from public.processing_jobs j
  where j.organization_id=new.organization_id and j.authorization_resource_id=root_id
  and exists(select 1 from public.processing_runs r where r.organization_id=new.organization_id and r.id=new.processing_run_id and r.created_by=j.authorization_subject_id)
  and j.leased_account_user_id=subject_id
  and ((j.status='leased' and j.lease_expires_at>now()) or (j.status='succeeded' and j.xmin=pg_current_xact_id()::xid))
  and private.job_authority_is_current_v1(j.id) order by j.created_at desc limit 1;
  subject_id:=parent_subject;
 end if;
 if new.review_execution_authorization_id is null and not private.resource_access_as_subject_v1(new.organization_id,root_id,subject_id,'work') then raise exception 'job_authorization_denied' using errcode='42501'; end if;
 insert into private.authorization_revisions(organization_id,resource_id,subject_user_id) values(new.organization_id,root_id,subject_id) on conflict do nothing;
 new.authorization_subject_id:=subject_id;
 new.authorization_resource_id:=root_id;
 select revision into new.authorization_revision from private.authorization_revisions
 where organization_id=new.organization_id and resource_id=root_id and subject_user_id=subject_id for share;
 return new;
end $function$;