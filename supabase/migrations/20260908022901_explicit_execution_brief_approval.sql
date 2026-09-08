-- Proposing work is not authorization to execute it. The queue is the enforcement boundary,
-- including older activation RPCs: only document ingest and preliminary planning remain automatic.
alter table public.processing_jobs drop constraint processing_jobs_kind_check;
alter table public.processing_jobs add constraint processing_jobs_kind_check
  check (kind in ('document_pipeline','preliminary_analysis','case_analysis','agent_operation_brief','capital_project_analysis','execution_brief_proposal'));
alter table public.processing_jobs drop constraint processing_jobs_status_check;
alter table public.processing_jobs add constraint processing_jobs_status_check
  check (status in ('queued','awaiting_approval','leased','succeeded','failed','poison','cancelled'));

alter table public.capital_project_execution_briefs add column approval_input_fingerprint text
  check (approval_input_fingerprint is null or approval_input_fingerprint ~ '^[a-f0-9]{64}$');

create table public.capital_project_execution_brief_dispatches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  execution_brief_id uuid not null,
  plan_id uuid not null,
  processing_job_id uuid not null,
  input_fingerprint text not null check (input_fingerprint ~ '^[a-f0-9]{64}$'),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  approval_command_id uuid,
  accepted_event_id uuid,
  accepted_by uuid references auth.users(id) on delete restrict,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, execution_brief_id),
  unique (organization_id, processing_job_id),
  unique (organization_id, approval_command_id),
  foreign key (organization_id, capital_project_id) references public.capital_projects(organization_id,id) on delete cascade,
  foreign key (organization_id, execution_brief_id) references public.capital_project_execution_briefs(organization_id,id) on delete cascade,
  foreign key (organization_id, plan_id) references public.capital_project_plans(organization_id,id) on delete cascade,
  foreign key (organization_id, processing_job_id) references public.processing_jobs(organization_id,id) on delete cascade,
  foreign key (organization_id, accepted_event_id) references public.capital_project_execution_brief_events(organization_id,id) on delete restrict,
  check ((accepted_at is null and accepted_by is null and accepted_event_id is null and approval_command_id is null)
    or (accepted_at is not null and accepted_by is not null and accepted_event_id is not null and approval_command_id is not null))
);
create index execution_brief_dispatch_project_idx on public.capital_project_execution_brief_dispatches(organization_id,capital_project_id);
create index execution_brief_dispatch_plan_idx on public.capital_project_execution_brief_dispatches(organization_id,plan_id);
create index execution_brief_dispatch_actor_idx on public.capital_project_execution_brief_dispatches(accepted_by);
create index execution_brief_dispatch_event_idx on public.capital_project_execution_brief_dispatches(organization_id,accepted_event_id);
alter table public.capital_project_execution_brief_dispatches enable row level security;
alter table public.capital_project_execution_brief_dispatches force row level security;
create policy execution_brief_dispatch_select on public.capital_project_execution_brief_dispatches for select to authenticated
  using ((select private.can_access_capital_project(organization_id,capital_project_id)));
revoke all on public.capital_project_execution_brief_dispatches from public,anon,authenticated;
grant select on public.capital_project_execution_brief_dispatches to authenticated;
create trigger execution_brief_dispatch_updated before update on public.capital_project_execution_brief_dispatches
  for each row execute function private.set_updated_at();
create trigger execution_brief_dispatch_audit after insert or update on public.capital_project_execution_brief_dispatches
  for each row execute function private.capture_audit_event();

create or replace function private.execution_approval_input_fingerprint(p_organization_id uuid,p_session_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'documents', coalesce((select jsonb_agg(jsonb_build_array(d.id,d.document_version,d.sha256,d.classification,d.evidence_rank) order by d.id)
      from public.source_documents d where d.organization_id=p_organization_id and d.intake_session_id=p_session_id),'[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_array(m.id,m.content,m.metadata) order by m.id)
      from public.agent_messages m where m.organization_id=p_organization_id and m.intake_session_id=p_session_id and m.role='user' and m.metadata->>'kind' in ('request','execution_brief_edit','information_request_response')),'[]'::jsonb),
    'reviewed_facts', coalesce((select jsonb_agg(to_jsonb(c)-array['created_at','updated_at','processing_run_id'] order by c.id)
      from public.intake_field_candidates c where c.organization_id=p_organization_id and c.intake_session_id=p_session_id),'[]'::jsonb),
    'economic_context', (select to_jsonb(s)-array['status','current_run_id','pipeline_version','result_summary','processing_started_at','processing_completed_at','confirmed_at','created_at','updated_at']
      from public.document_intake_sessions s where s.organization_id=p_organization_id and s.id=p_session_id)
  )::text,'utf8'),'sha256'),'hex');
$$;
revoke all on function private.execution_approval_input_fingerprint(uuid,uuid) from public,anon,authenticated;

create or replace function private.execution_dispatch_is_current(p_job_id uuid,p_require_accepted boolean default true)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.capital_project_execution_brief_dispatches d
    join public.processing_jobs j on j.organization_id=d.organization_id and j.id=d.processing_job_id
    join public.capital_project_execution_briefs b on b.organization_id=d.organization_id and b.id=d.execution_brief_id
    join public.capital_project_plans p on p.organization_id=d.organization_id and p.id=d.plan_id
    where j.id=p_job_id and p.status='active' and b.plan_id=p.id
      and exists(select 1 from public.capital_projects project where project.organization_id=d.organization_id and project.id=d.capital_project_id and project.status<>'archived')
      and (not p_require_accepted or d.accepted_at is not null)
      and d.payload_fingerprint=encode(extensions.digest(convert_to(j.payload::text,'utf8'),'sha256'),'hex')
      and d.input_fingerprint=b.approval_input_fingerprint
      and d.input_fingerprint=private.execution_approval_input_fingerprint(j.organization_id,j.intake_session_id)
      and not exists (select 1 from public.capital_project_execution_briefs newer
        where newer.organization_id=b.organization_id and newer.capital_project_id=b.capital_project_id and newer.brief_version>b.brief_version)
      and not exists (select 1 from public.capital_project_execution_brief_events e
        where e.organization_id=b.organization_id and e.execution_brief_id=b.id and e.event_type in ('edit_requested','cancelled','superseded'))
  );
$$;
revoke all on function private.execution_dispatch_is_current(uuid,boolean) from public,anon,authenticated;

create or replace function private.requires_execution_brief_approval(p_job_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.processing_jobs j join public.document_intake_sessions s
    on s.organization_id=j.organization_id and s.id=j.intake_session_id
    where j.id=p_job_id and j.kind in ('capital_project_analysis','case_analysis') and s.capital_project_id is not null);
$$;
revoke all on function private.requires_execution_brief_approval(uuid) from public,anon,authenticated;

create or replace function private.guard_execution_approval_queue()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and private.requires_execution_brief_approval(old.id)
    and (new.organization_id,new.intake_session_id,new.processing_run_id,new.kind,new.payload)
      is distinct from (old.organization_id,old.intake_session_id,old.processing_run_id,old.kind,old.payload) then
    raise exception 'approved_dispatch_identity_immutable' using errcode='42501';
  end if;
  if new.kind not in ('capital_project_analysis','case_analysis') then return new; end if;
  if not exists(select 1 from public.document_intake_sessions s where s.organization_id=new.organization_id and s.id=new.intake_session_id and s.capital_project_id is not null) then return new; end if;
  if tg_op='INSERT' then
    if new.status in ('queued','leased') then new.status:='awaiting_approval'; end if;
  elsif new.status in ('queued','leased','succeeded') then
    if not private.execution_dispatch_is_current(new.id,true) then
      raise exception 'execution_brief_approval_required' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_execution_approval_queue() from public,anon,authenticated;
create trigger zz_execution_approval_queue before insert or update on public.processing_jobs
  for each row execute function private.guard_execution_approval_queue();
-- Legacy queued work has no implicit consent. It must be replanned and explicitly approved.
update public.processing_jobs set status='awaiting_approval'
  where private.requires_execution_brief_approval(id) and status='queued';

-- A capability remains necessary, but is not sufficient after the plan or source context changes.
create or replace function private.job_for_capability(p_job_id uuid,p_capability_token text)
returns public.processing_jobs language plpgsql security definer set search_path = '' as $$
declare job_row public.processing_jobs;
begin
  if p_capability_token is null or char_length(p_capability_token)<32 then
    raise exception 'job_capability_invalid' using errcode='42501';
  end if;
  select * into job_row from public.processing_jobs where id=p_job_id and status='leased'
    and capability_sha256=extensions.digest(p_capability_token,'sha256') and lease_expires_at>now() for update;
  if not found then raise exception 'job_capability_invalid' using errcode='42501'; end if;
  if private.requires_execution_brief_approval(job_row.id) then
    perform 1 from public.document_intake_sessions where organization_id=job_row.organization_id and id=job_row.intake_session_id for update;
    perform 1 from public.capital_projects p join public.document_intake_sessions s
      on s.organization_id=p.organization_id and s.capital_project_id=p.id
      where s.organization_id=job_row.organization_id and s.id=job_row.intake_session_id for update of p;
    if not private.execution_dispatch_is_current(job_row.id,true) then
      raise exception 'execution_brief_approval_required' using errcode='42501';
    end if;
  end if;
  return job_row;
end;
$$;
revoke all on function private.job_for_capability(uuid,text) from public,anon,authenticated;

create or replace function private.bind_execution_brief_dispatch(p_brief_id uuid,p_job_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare b public.capital_project_execution_briefs; j public.processing_jobs; d public.capital_project_execution_brief_dispatches;
begin
  select * into b from public.capital_project_execution_briefs where id=p_brief_id;
  select * into j from public.processing_jobs where id=p_job_id;
  if b.id is null or j.id is null or b.organization_id<>j.organization_id
    or j.kind not in ('capital_project_analysis','case_analysis')
    or not exists(select 1 from public.document_intake_sessions s where s.organization_id=b.organization_id and s.id=j.intake_session_id and s.capital_project_id=b.capital_project_id)
    or (j.payload ? 'capital_project_id' and j.payload->>'capital_project_id' is distinct from b.capital_project_id::text)
    or (j.kind='capital_project_analysis' and j.payload->>'capital_project_plan_id' is distinct from b.plan_id::text) then
    raise exception 'execution_brief_dispatch_mismatch' using errcode='22023';
  end if;
  select * into d from public.capital_project_execution_brief_dispatches where organization_id=b.organization_id and execution_brief_id=b.id;
  if found then
    if d.processing_job_id<>j.id then raise exception 'execution_brief_dispatch_already_bound' using errcode='23505'; end if;
    return d.id;
  end if;
  if b.approval_input_fingerprint is null or b.approval_input_fingerprint is distinct from private.execution_approval_input_fingerprint(j.organization_id,j.intake_session_id) then
    raise exception 'execution_brief_inputs_stale' using errcode='40001';
  end if;
  if j.status<>'awaiting_approval' then raise exception 'execution_brief_dispatch_not_pending' using errcode='40001'; end if;
  insert into public.capital_project_execution_brief_dispatches(organization_id,capital_project_id,execution_brief_id,plan_id,processing_job_id,input_fingerprint,payload_fingerprint)
    values(b.organization_id,b.capital_project_id,b.id,b.plan_id,j.id,
      b.approval_input_fingerprint,
      encode(extensions.digest(convert_to(j.payload::text,'utf8'),'sha256'),'hex')) returning id into p_brief_id;
  update public.processing_jobs set status='cancelled'
    where organization_id=j.organization_id and intake_session_id=j.intake_session_id
      and kind='execution_brief_proposal' and payload->>'approval_target_job_id'=j.id::text and status='queued';
  return p_brief_id;
end;
$$;
revoke all on function private.bind_execution_brief_dispatch(uuid,uuid) from public,anon,authenticated;

create or replace function private.approve_advisor_execution_brief_v1(
  p_project_id uuid,p_execution_brief_id uuid,p_expected_fingerprint text,p_command_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  project_row public.capital_projects; b public.capital_project_execution_briefs;
  d public.capital_project_execution_brief_dispatches; j public.processing_jobs; event_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_command_id is null or p_expected_fingerprint is null or p_expected_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_execution_brief_approval' using errcode='22023';
  end if;
  select * into project_row from public.capital_projects p where p.id=p_project_id and p.status<>'archived'
    and private.can_access_capital_project(p.organization_id,p.id);
  if not found then raise exception 'capital_project_not_found' using errcode='P0002'; end if;
  select * into d from public.capital_project_execution_brief_dispatches
    where organization_id=project_row.organization_id and capital_project_id=p_project_id and execution_brief_id=p_execution_brief_id;
  if not found then raise exception 'execution_brief_dispatch_unavailable' using errcode='P0002'; end if;
  -- Same order as worker capabilities: target job, session, project. No bulk job locks in writers.
  select * into j from public.processing_jobs where organization_id=d.organization_id and id=d.processing_job_id for update;
  perform 1 from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id for update;
  perform 1 from public.capital_projects where organization_id=d.organization_id and id=p_project_id for update;
  select * into d from public.capital_project_execution_brief_dispatches where id=d.id for update;
  select * into b from public.capital_project_execution_briefs where organization_id=d.organization_id and id=p_execution_brief_id;
  if b.brief_fingerprint is distinct from p_expected_fingerprint
    or not private.execution_dispatch_is_current(j.id,false) then
    raise exception 'execution_brief_approval_stale' using errcode='40001';
  end if;
  if exists(select 1 from public.capital_project_execution_brief_dispatches other
    where other.organization_id=d.organization_id and other.approval_command_id=p_command_id and other.id<>d.id) then
    raise exception 'execution_brief_approval_command_conflict' using errcode='23505';
  end if;
  if d.accepted_at is not null then
    return jsonb_build_object('execution_brief_id',b.id,'processing_job_id',j.id,'status','already_approved','replayed',true);
  end if;
  if exists(select 1 from public.agent_messages m where m.organization_id=j.organization_id and m.intake_session_id=j.intake_session_id and m.role='user' and m.status in ('queued','processing')) then
    raise exception 'advisor_message_in_progress' using errcode='55000';
  end if;
  if j.status<>'awaiting_approval' then raise exception 'execution_brief_dispatch_not_pending' using errcode='40001'; end if;
  -- Separate downstream economic/representation/external-effect gates remain enforced by the
  -- original queued payload and its executor; this consent authorizes only that bounded work.
  insert into public.capital_project_execution_brief_events(organization_id,capital_project_id,execution_brief_id,event_type,actor_type,actor_user_id,event_payload)
    values(d.organization_id,p_project_id,b.id,'accepted','user',auth.uid(),jsonb_build_object(
      'commandId',p_command_id,'briefFingerprint',b.brief_fingerprint,'processingJobId',j.id,
      'payloadFingerprint',d.payload_fingerprint,'inputFingerprint',d.input_fingerprint)) returning id into event_id;
  update public.capital_project_execution_brief_dispatches set approval_command_id=p_command_id,
    accepted_event_id=event_id,accepted_by=auth.uid(),accepted_at=now() where id=d.id;
  update public.processing_jobs set status='queued',available_at=now() where id=j.id;
  update public.processing_runs set status='queued',completed_at=null where organization_id=j.organization_id and id=j.processing_run_id;
  update public.document_intake_sessions set current_run_id=j.processing_run_id,status='processing',processing_started_at=now(),processing_completed_at=null
    where organization_id=j.organization_id and id=j.intake_session_id;
  return jsonb_build_object('execution_brief_id',b.id,'processing_job_id',j.id,'status','queued','replayed',false);
end;
$$;
create or replace function public.approve_advisor_execution_brief_v1(
  p_project_id uuid,p_execution_brief_id uuid,p_expected_fingerprint text,p_command_id uuid
) returns jsonb language sql security invoker set search_path='' as $$
  select private.approve_advisor_execution_brief_v1(p_project_id,p_execution_brief_id,p_expected_fingerprint,p_command_id);
$$;
revoke all on function private.approve_advisor_execution_brief_v1(uuid,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.approve_advisor_execution_brief_v1(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function private.approve_advisor_execution_brief_v1(uuid,uuid,text,uuid) to authenticated;
grant execute on function public.approve_advisor_execution_brief_v1(uuid,uuid,text,uuid) to authenticated;

create or replace function private.read_advisor_execution_brief_approval_v1(p_project_id uuid,p_execution_brief_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b public.capital_project_execution_briefs; d public.capital_project_execution_brief_dispatches; state text; reason text;
begin
  select * into b from public.capital_project_execution_briefs where id=p_execution_brief_id and capital_project_id=p_project_id
    and private.can_access_capital_project(organization_id,capital_project_id);
  if not found then raise exception 'execution_brief_not_found' using errcode='P0002'; end if;
  select * into d from public.capital_project_execution_brief_dispatches where organization_id=b.organization_id and execution_brief_id=b.id;
  state:=case when d.id is null then 'unavailable'
    when not private.execution_dispatch_is_current(d.processing_job_id,false) then 'superseded'
    when d.accepted_at is null and not exists(select 1 from public.processing_jobs j where j.id=d.processing_job_id and j.status='awaiting_approval') then 'unavailable'
    when d.accepted_at is null then 'proposed' else 'approved' end;
  reason:=case state when 'approved' then 'approved' when 'proposed' then 'approval_required' when 'superseded' then 'context_changed'
    else case
      when exists(select 1 from public.preliminary_understandings u join public.document_intake_sessions s on s.organization_id=u.organization_id and s.id=u.intake_session_id
        where s.organization_id=b.organization_id and s.capital_project_id=b.capital_project_id and u.status='pending_confirmation') then 'awaiting_preliminary_confirmation'
      when exists(select 1 from public.processing_jobs j join public.document_intake_sessions s on s.organization_id=j.organization_id and s.id=j.intake_session_id
        where s.organization_id=b.organization_id and s.capital_project_id=b.capital_project_id and j.kind='execution_brief_proposal' and j.status in ('queued','leased')) then 'plan_generation_pending'
      when exists(select 1 from public.capital_project_information_requests r where r.organization_id=b.organization_id and r.capital_project_id=b.capital_project_id and r.status='open') then 'required_information_missing'
      else 'dispatch_unavailable' end end;
  return jsonb_build_object('status',state,'reason',reason,'execution_brief_id',b.id,'brief_fingerprint',b.brief_fingerprint,
    'processing_job_id',d.processing_job_id,'accepted_at',d.accepted_at);
end;
$$;
create or replace function public.read_advisor_execution_brief_approval_v1(p_project_id uuid,p_execution_brief_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.read_advisor_execution_brief_approval_v1(p_project_id,p_execution_brief_id);
$$;
revoke all on function private.read_advisor_execution_brief_approval_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.read_advisor_execution_brief_approval_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function private.read_advisor_execution_brief_approval_v1(uuid,uuid) to authenticated;
grant execute on function public.read_advisor_execution_brief_approval_v1(uuid,uuid) to authenticated;

create or replace function private.worker_record_agent_response_and_activate_v6(
  p_job_id uuid,p_capability_token text,p_assistant_message_id uuid,p_response jsonb,
  p_proposal jsonb default null,p_activation jsonb default null,p_execution_brief_internal jsonb default null,
  p_execution_brief_visible jsonb default null,p_execution_brief_change_summary jsonb default '[]'::jsonb,p_expected_input_fingerprint text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare recorded jsonb; dispatch_id uuid; pending_job public.processing_jobs; source_job public.processing_jobs;
begin
  if p_activation is not null and (p_execution_brief_internal is null or p_execution_brief_visible is null) then
    raise exception 'execution_brief_pair_required' using errcode='22023';
  end if;
  if p_activation is not null then
    source_job:=private.job_for_capability(p_job_id,p_capability_token);
    perform 1 from public.document_intake_sessions where organization_id=source_job.organization_id and id=source_job.intake_session_id for update;
    perform 1 from public.capital_projects p join public.document_intake_sessions s on s.organization_id=p.organization_id and s.capital_project_id=p.id
      where s.organization_id=source_job.organization_id and s.id=source_job.intake_session_id for update of p;
    if p_expected_input_fingerprint is distinct from private.execution_approval_input_fingerprint(source_job.organization_id,source_job.intake_session_id) then
      raise exception 'execution_proposal_inputs_changed' using errcode='40001';
    end if;
  end if;
  recorded:=private.worker_record_agent_response_and_activate_v5(p_job_id,p_capability_token,p_assistant_message_id,
    p_response,p_proposal,p_activation,p_execution_brief_internal,p_execution_brief_visible,p_execution_brief_change_summary);
  if p_activation is not null then
    dispatch_id:=private.bind_execution_brief_dispatch((recorded#>>'{execution_brief,id}')::uuid,(recorded#>>'{activation,job_id}')::uuid);
    select * into pending_job from public.processing_jobs where id=(recorded#>>'{activation,job_id}')::uuid;
    if pending_job.status='awaiting_approval' then
      update public.document_intake_sessions set status='review_ready',processing_completed_at=now()
        where organization_id=pending_job.organization_id and id=pending_job.intake_session_id;
      update public.agent_conversations set state='idle' where organization_id=pending_job.organization_id and intake_session_id=pending_job.intake_session_id;
    end if;
    recorded:=recorded||jsonb_build_object('approval',jsonb_build_object('status','proposed','dispatch_id',dispatch_id));
  end if;
  return recorded;
end;
$$;
create or replace function public.worker_record_agent_response_and_activate_v6(
  p_job_id uuid,p_capability_token text,p_assistant_message_id uuid,p_response jsonb,
  p_proposal jsonb default null,p_activation jsonb default null,p_execution_brief_internal jsonb default null,
  p_execution_brief_visible jsonb default null,p_execution_brief_change_summary jsonb default '[]'::jsonb,p_expected_input_fingerprint text default null
) returns jsonb language sql security invoker set search_path='' as $$
  select private.worker_record_agent_response_and_activate_v6(p_job_id,p_capability_token,p_assistant_message_id,
    p_response,p_proposal,p_activation,p_execution_brief_internal,p_execution_brief_visible,p_execution_brief_change_summary,p_expected_input_fingerprint);
$$;
revoke all on function private.worker_record_agent_response_and_activate_v6(uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function public.worker_record_agent_response_and_activate_v6(uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function private.worker_record_agent_response_and_activate_v6(uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text) to authenticated;
grant execute on function public.worker_record_agent_response_and_activate_v6(uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text) to authenticated;

-- Hold the same project lock while inserting a new brief, an edit request, a user turn or a
-- document revision. Capability-bound result writes then serialize against changed inputs.
create or replace function private.lock_execution_approval_context()
returns trigger language plpgsql security definer set search_path='' as $$
declare project_id uuid; session_id uuid;
begin
  if tg_op='DELETE' then
    if tg_table_name='agent_messages' and old.role<>'user' then return old; end if;
    session_id:=old.intake_session_id;
    select capital_project_id into project_id from public.document_intake_sessions where organization_id=old.organization_id and id=session_id;
    perform 1 from public.document_intake_sessions where organization_id=old.organization_id and id=session_id for update;
    perform 1 from public.capital_projects where organization_id=old.organization_id and id=project_id for update;
    return old;
  end if;
  if tg_table_name='agent_messages' and new.role<>'user' then return new; end if;
  if tg_table_name in ('capital_project_execution_briefs','capital_project_execution_brief_events') then
    project_id:=new.capital_project_id;
    select id into session_id from public.document_intake_sessions
      where organization_id=new.organization_id and capital_project_id=project_id order by created_at limit 1;
  elsif tg_table_name='document_intake_sessions' then
    if old.capital_project_id is not null and new.capital_project_id is distinct from old.capital_project_id then
      raise exception 'advisor_session_project_immutable' using errcode='42501';
    end if;
    session_id:=new.id; project_id:=new.capital_project_id;
  else
    session_id:=new.intake_session_id;
    select capital_project_id into project_id from public.document_intake_sessions where organization_id=new.organization_id and id=session_id;
  end if;
  if project_id is not null then
    perform 1 from public.document_intake_sessions where organization_id=new.organization_id and id=session_id for update;
    perform 1 from public.capital_projects where organization_id=new.organization_id and id=project_id for update;
  end if;
  if tg_table_name='capital_project_execution_briefs' then
    new.approval_input_fingerprint:=private.execution_approval_input_fingerprint(new.organization_id,session_id);
  end if;
  return new;
end;
$$;
revoke all on function private.lock_execution_approval_context() from public,anon,authenticated;
create trigger execution_approval_brief_lock before insert on public.capital_project_execution_briefs
  for each row execute function private.lock_execution_approval_context();
create trigger execution_approval_event_lock before insert on public.capital_project_execution_brief_events
  for each row execute function private.lock_execution_approval_context();
create trigger execution_approval_message_lock before insert or delete or update of content,metadata on public.agent_messages
  for each row execute function private.lock_execution_approval_context();
create trigger execution_approval_document_lock before insert or update or delete on public.source_documents
  for each row execute function private.lock_execution_approval_context();

-- Keep stale consent out of the claim candidate set, rather than repeatedly failing the oldest
-- queued job and starving unrelated work. The UPDATE guard and capability guard recheck races.
do $migration$
declare definition text; old_clause text := $old$where (status = 'queued' and available_at <= now())
     or (status = 'leased' and lease_expires_at < now())$old$;
begin
  select pg_get_functiondef('private.worker_claim_job(text,integer)'::regprocedure) into definition;
  if position(old_clause in definition)=0 then raise exception 'worker_claim_job approval patch drift'; end if;
  execute replace(definition,old_clause,$new$where ((status = 'queued' and available_at <= now())
     or (status = 'leased' and lease_expires_at < now()))
    and (not private.requires_execution_brief_approval(id) or private.execution_dispatch_is_current(id,true))$new$);
  for definition in select pg_get_functiondef(oid) from pg_proc where oid in (
    'private.worker_complete_job(uuid,text,jsonb)'::regprocedure,
    'private.worker_fail_job(uuid,text,jsonb,boolean,integer)'::regprocedure
  ) loop
    if position('count(*) filter (where status in (''queued'', ''leased''))' in definition)=0 then
      raise exception 'worker aggregate approval patch drift';
    end if;
    execute replace(definition,'count(*) filter (where status in (''queued'', ''leased''))',
      'count(*) filter (where status in (''queued'', ''leased'', ''awaiting_approval''))');
  end loop;
end;
$migration$;

-- The deterministic planner can persist the same validated immutable brief contract.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('private.worker_record_capital_project_execution_brief_v1(uuid,text,jsonb,jsonb,uuid,jsonb)'::regprocedure) into definition;
  if position('job_row.kind not in (''agent_operation_brief'', ''capital_project_analysis'')' in definition)=0 then raise exception 'proposal brief capability patch drift'; end if;
  execute replace(definition,'job_row.kind not in (''agent_operation_brief'', ''capital_project_analysis'')',
    'job_row.kind not in (''agent_operation_brief'', ''capital_project_analysis'', ''execution_brief_proposal'')');
end;
$migration$;

create trigger execution_approval_candidate_lock before insert or update or delete on public.intake_field_candidates
  for each row execute function private.lock_execution_approval_context();
-- Session mutation already holds the session row; the project lock serializes economic changes
-- with capability-bound material writes without hashing operational status/timestamp churn.
create trigger execution_approval_session_lock before update on public.document_intake_sessions
  for each row execute function private.lock_execution_approval_context();

-- Failure reporting is deliberately narrower than output mutation: a valid current lease may
-- report spent budget and terminate stale work, but cannot retry it or promote any artifact.
create or replace function private.job_for_failure_capability(p_job_id uuid,p_capability_token text)
returns public.processing_jobs language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;
begin
  if p_capability_token is null or char_length(p_capability_token)<32 then raise exception 'job_capability_invalid' using errcode='42501'; end if;
  select * into j from public.processing_jobs where id=p_job_id and status='leased'
    and capability_sha256=extensions.digest(p_capability_token,'sha256') and lease_expires_at>now() for update;
  if not found then raise exception 'job_capability_invalid' using errcode='42501'; end if;
  return j;
end;
$$;
revoke all on function private.job_for_failure_capability(uuid,text) from public,anon,authenticated;
do $migration$
declare definition text; function_oid regprocedure;
begin
  select pg_get_functiondef('private.worker_fail_job(uuid,text,jsonb,boolean,integer)'::regprocedure) into definition;
  if position('private.job_for_capability(p_job_id, p_capability_token)' in definition)=0
    or position('will_retry := coalesce(p_retryable, true) and job_row.attempts < job_row.max_attempts;' in definition)=0 then
    raise exception 'stale failure cleanup patch drift';
  end if;
  definition:=replace(definition,'private.job_for_capability(p_job_id, p_capability_token)','private.job_for_failure_capability(p_job_id, p_capability_token)');
  execute replace(definition,'will_retry := coalesce(p_retryable, true) and job_row.attempts < job_row.max_attempts;',
    'will_retry := coalesce(p_retryable, true) and job_row.attempts < job_row.max_attempts and (not private.requires_execution_brief_approval(job_row.id) or private.execution_dispatch_is_current(job_row.id,true));');

  foreach function_oid in array array[
    'private.submit_advisor_turn_v1(uuid,uuid,text,text)'::regprocedure,
    'private.submit_advisor_execution_brief_edit_v1(uuid,uuid,text,uuid,text,text)'::regprocedure,
    'private.submit_advisor_information_response_v1(uuid,uuid,timestamptz,uuid,text,text,text)'::regprocedure,
    'private.submit_advisor_artifact_revision_turn_v1(uuid,uuid,text,text)'::regprocedure
  ] loop
    select pg_get_functiondef(function_oid) into definition;
    if position('select project.* into project_row' in definition)=0 then raise exception 'advisor lock order patch drift: %',function_oid; end if;
    execute replace(definition,'select project.* into project_row',$lock$perform 1 from public.document_intake_sessions approval_session
      join public.organization_memberships approval_member on approval_member.organization_id=approval_session.organization_id
      where approval_session.capital_project_id=p_project_id and approval_member.user_id=auth.uid() and approval_member.status='active'
      order by approval_session.id for update of approval_session;
    select project.* into project_row$lock$);
  end loop;
end;
$migration$;

-- Every entrypoint receives a real proposal bridge, including direct public routes and the
-- existing private enqueue after canonical information gates. This is deterministic planning.
create or replace function private.enqueue_execution_brief_proposal()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status<>'awaiting_approval' or not private.requires_execution_brief_approval(new.id) then return new; end if;
  insert into public.processing_jobs(organization_id,processing_run_id,intake_session_id,kind,payload,max_attempts)
    values(new.organization_id,new.processing_run_id,new.intake_session_id,'execution_brief_proposal',
      jsonb_build_object('approval_target_job_id',new.id,'locale',coalesce(new.payload->>'locale','pt-BR')),2);
  return new;
end;
$$;
revoke all on function private.enqueue_execution_brief_proposal() from public,anon,authenticated;
create trigger execution_approval_proposal_enqueue after insert on public.processing_jobs
  for each row execute function private.enqueue_execution_brief_proposal();

create or replace function private.worker_load_execution_brief_proposal_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);
  target public.processing_jobs; s public.document_intake_sessions; p public.capital_projects; plan public.capital_project_plans;
begin
  if j.kind<>'execution_brief_proposal' then raise exception 'execution_proposal_capability_required' using errcode='42501'; end if;
  select * into target from public.processing_jobs where id=(j.payload->>'approval_target_job_id')::uuid
    and organization_id=j.organization_id and intake_session_id=j.intake_session_id and processing_run_id=j.processing_run_id for update;
  if not found or target.status<>'awaiting_approval' or target.kind not in ('case_analysis','capital_project_analysis') then
    raise exception 'execution_proposal_target_unavailable' using errcode='40001';
  end if;
  select * into s from public.document_intake_sessions where id=j.intake_session_id and organization_id=j.organization_id for update;
  select * into p from public.capital_projects where id=s.capital_project_id and organization_id=j.organization_id and status<>'archived' for update;
  if not found then raise exception 'execution_proposal_project_unavailable' using errcode='P0002'; end if;
  select * into plan from public.capital_project_plans where organization_id=j.organization_id and capital_project_id=p.id and status='active'
    and (target.kind='case_analysis' or id::text=target.payload->>'capital_project_plan_id');
  if not found and target.kind<>'case_analysis' then raise exception 'execution_proposal_plan_unavailable' using errcode='40001'; end if;
  return jsonb_build_object('target_job_id',target.id,'target_kind',target.kind,'project',jsonb_build_object('id',p.id,'name',p.project_name,'access_basis',p.access_basis,'entry_job',p.entry_job),
    'plan',plan.snapshot,'input_fingerprint',private.execution_approval_input_fingerprint(j.organization_id,j.intake_session_id),'locale',s.locale,'objective',coalesce(nullif(s.capital_objective,''),
      (select content from public.agent_messages where organization_id=j.organization_id and intake_session_id=j.intake_session_id and role='user' order by created_at desc limit 1),p.project_name),
    'documents',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',original_name) order by id)
      from public.source_documents where organization_id=j.organization_id and intake_session_id=j.intake_session_id and processing_status='ready'),'[]'::jsonb));
end;
$$;
create or replace function public.worker_load_execution_brief_proposal_v1(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.worker_load_execution_brief_proposal_v1(p_job_id,p_capability_token);
$$;
revoke all on function private.worker_load_execution_brief_proposal_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.worker_load_execution_brief_proposal_v1(uuid,text) from public,anon,authenticated;
grant execute on function private.worker_load_execution_brief_proposal_v1(uuid,text) to authenticated;
grant execute on function public.worker_load_execution_brief_proposal_v1(uuid,text) to authenticated;

-- Reuse the canonical validator without impersonating an end-user JWT. This private
-- clone is callable only by the capability-bound missing-plan bridge below.
do $migration$
declare definition text;
begin
  definition:=pg_get_functiondef('private.record_capital_project_plan(uuid,jsonb)'::regprocedure);
  if position('caller_id uuid := (select auth.uid());' in definition)=0 then
    raise exception 'capital plan actor validator drift';
  end if;
  definition:=replace(definition,'private.record_capital_project_plan(p_project_id uuid, p_snapshot jsonb)',
    'private.record_execution_proposal_plan_as_actor(p_project_id uuid, p_snapshot jsonb, p_actor_id uuid)');
  if position('private.record_execution_proposal_plan_as_actor(' in definition)=0 then raise exception 'capital plan signature drift'; end if;
  definition:=replace(definition,'caller_id uuid := (select auth.uid());','caller_id uuid := p_actor_id;');
  execute definition;
end;
$migration$;
revoke all on function private.record_execution_proposal_plan_as_actor(uuid,jsonb,uuid) from public,anon,authenticated;
create or replace function private.record_execution_proposal_missing_plan(p_job_id uuid,p_capability_token text,p_plan jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare context jsonb; j public.processing_jobs; s public.document_intake_sessions;
begin
  context:=private.worker_load_execution_brief_proposal_v1(p_job_id,p_capability_token);
  if context->'plan'<>'null'::jsonb then raise exception 'execution_proposal_plan_replacement_forbidden' using errcode='42501'; end if;
  select * into strict j from public.processing_jobs where id=(context->>'target_job_id')::uuid;
  if j.kind<>'case_analysis' then raise exception 'execution_proposal_plan_scope_invalid' using errcode='42501'; end if;
  select * into strict s from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id;
  return private.record_execution_proposal_plan_as_actor(s.capital_project_id,p_plan,s.started_by);
end;
$$;
revoke all on function private.record_execution_proposal_missing_plan(uuid,text,jsonb) from public,anon,authenticated;

create or replace function private.worker_record_execution_brief_proposal_v1(
  p_job_id uuid,p_capability_token text,p_internal_snapshot jsonb,p_visible_snapshot jsonb,p_expected_input_fingerprint text,p_plan jsonb default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb; persisted jsonb; target_id uuid; j public.processing_jobs;
begin
  context:=private.worker_load_execution_brief_proposal_v1(p_job_id,p_capability_token);
  if p_expected_input_fingerprint is distinct from context->>'input_fingerprint' then
    raise exception 'execution_proposal_inputs_changed' using errcode='40001';
  end if;
  target_id:=(context->>'target_job_id')::uuid;
  if context->'plan'='null'::jsonb then
    if p_plan is null then raise exception 'execution_proposal_plan_required' using errcode='22023'; end if;
    perform private.record_execution_proposal_missing_plan(p_job_id,p_capability_token,p_plan);
  elsif p_plan is not null then
    raise exception 'execution_proposal_plan_replacement_forbidden' using errcode='42501';
  end if;
  persisted:=private.worker_record_capital_project_execution_brief_v1(p_job_id,p_capability_token,p_internal_snapshot,p_visible_snapshot,null,'[]'::jsonb);
  perform private.bind_execution_brief_dispatch((persisted->>'id')::uuid,target_id);
  select * into j from public.processing_jobs where id=target_id;
  perform private.worker_complete_job(p_job_id,p_capability_token,jsonb_build_object('execution_brief_id',persisted->>'id','status','proposed'));
  update public.document_intake_sessions set status='review_ready',processing_completed_at=now()
    where organization_id=j.organization_id and id=j.intake_session_id and current_run_id=j.processing_run_id;
  return jsonb_build_object('execution_brief_id',persisted->>'id','processing_job_id',target_id,'status','proposed');
end;
$$;
create or replace function public.worker_record_execution_brief_proposal_v1(
  p_job_id uuid,p_capability_token text,p_internal_snapshot jsonb,p_visible_snapshot jsonb,p_expected_input_fingerprint text,p_plan jsonb default null
) returns jsonb language sql security invoker set search_path='' as $$
  select private.worker_record_execution_brief_proposal_v1(p_job_id,p_capability_token,p_internal_snapshot,p_visible_snapshot,p_expected_input_fingerprint,p_plan);
$$;
revoke all on function private.worker_record_execution_brief_proposal_v1(uuid,text,jsonb,jsonb,text,jsonb) from public,anon,authenticated;
revoke all on function public.worker_record_execution_brief_proposal_v1(uuid,text,jsonb,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function private.worker_record_execution_brief_proposal_v1(uuid,text,jsonb,jsonb,text,jsonb) to authenticated;
grant execute on function public.worker_record_execution_brief_proposal_v1(uuid,text,jsonb,jsonb,text,jsonb) to authenticated;

-- Existing held jobs also receive a forward path after deployment; no prior consent is inferred.
insert into public.processing_jobs(organization_id,processing_run_id,intake_session_id,kind,payload,max_attempts)
  select j.organization_id,j.processing_run_id,j.intake_session_id,'execution_brief_proposal',
    jsonb_build_object('approval_target_job_id',j.id,'locale',coalesce(j.payload->>'locale','pt-BR')),2
  from public.processing_jobs j where j.status='awaiting_approval' and private.requires_execution_brief_approval(j.id)
    and not exists(select 1 from public.processing_jobs planner where planner.kind='execution_brief_proposal' and planner.payload->>'approval_target_job_id'=j.id::text);

create or replace function private.worker_load_agent_context_v2(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token); context jsonb;
begin
  if j.kind<>'agent_operation_brief' then raise exception 'agent_operation_brief_capability_required' using errcode='42501'; end if;
  perform 1 from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id for update;
  perform 1 from public.capital_projects p join public.document_intake_sessions s on s.organization_id=p.organization_id and s.capital_project_id=p.id
    where s.organization_id=j.organization_id and s.id=j.intake_session_id for update of p;
  context:=public.worker_load_agent_context(p_job_id,p_capability_token);
  return context||jsonb_build_object('approval_input_fingerprint',private.execution_approval_input_fingerprint(j.organization_id,j.intake_session_id));
end;
$$;
create or replace function public.worker_load_agent_context_v2(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  return private.worker_load_agent_context_v2(p_job_id,p_capability_token);
end;
$$;
revoke all on function private.worker_load_agent_context_v2(uuid,text) from public,anon,authenticated;
revoke all on function public.worker_load_agent_context_v2(uuid,text) from public,anon,authenticated;
grant execute on function private.worker_load_agent_context_v2(uuid,text) to authenticated;
grant execute on function public.worker_load_agent_context_v2(uuid,text) to authenticated;

-- New clients understand deterministic proposal jobs. Older worker images cannot lease an
-- unknown kind during a migration-first rollout; they keep the existing compatible kinds.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('private.worker_claim_job(text,integer)'::regprocedure) into definition;
  execute replace(definition,'private.worker_claim_job(', 'private.worker_claim_job_v2(');
  if position('and (not private.requires_execution_brief_approval(id)' in definition)=0 then raise exception 'worker claim compatibility patch drift'; end if;
  execute replace(definition,'and (not private.requires_execution_brief_approval(id)',
    'and kind <> ''execution_brief_proposal'' and (not private.requires_execution_brief_approval(id)');
end;
$migration$;
create or replace function public.worker_claim_job_v2(p_worker_token text,p_lease_seconds integer default 600)
returns jsonb language sql security invoker set search_path='' as $$
  select private.worker_claim_job_v2(p_worker_token,p_lease_seconds);
$$;
revoke all on function private.worker_claim_job_v2(text,integer) from public,anon,authenticated;
revoke all on function public.worker_claim_job_v2(text,integer) from public,anon,authenticated;
grant execute on function private.worker_claim_job_v2(text,integer) to authenticated;
grant execute on function public.worker_claim_job_v2(text,integer) to authenticated;


-- Stale queued work and abandoned expired leases must terminate rather than block the queue.
-- Live stale leases still report spend through worker_fail_job; no stale output is promoted.
create or replace function private.settle_stale_execution_jobs_v1()
returns void language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;
begin
  for j in select * from public.processing_jobs jobs
    where (jobs.status='queued' or (jobs.status='leased' and jobs.lease_expires_at<now()))
      and private.requires_execution_brief_approval(jobs.id) and not private.execution_dispatch_is_current(jobs.id,true)
    order by jobs.available_at for update skip locked limit 20
  loop
    perform 1 from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id for update;
    perform 1 from public.capital_projects p join public.document_intake_sessions s on s.organization_id=p.organization_id and s.capital_project_id=p.id
      where s.organization_id=j.organization_id and s.id=j.intake_session_id for update of p;
    if private.execution_dispatch_is_current(j.id,true) then continue; end if;
    update public.processing_jobs set status='cancelled',capability_sha256=null,leased_by=null,lease_expires_at=null,
      last_error=jsonb_build_object('reason','execution_approval_superseded') where id=j.id;
    update public.processing_runs r set status='cancelled',completed_at=now()
      where r.organization_id=j.organization_id and r.id=j.processing_run_id
        and not exists(select 1 from public.processing_jobs p where p.organization_id=r.organization_id and p.processing_run_id=r.id and p.status in ('queued','leased','awaiting_approval'));
    update public.document_intake_sessions set status='review_ready'
      where organization_id=j.organization_id and id=j.intake_session_id and current_run_id=j.processing_run_id and status='processing'
        and not exists(select 1 from public.processing_jobs p where p.organization_id=j.organization_id and p.processing_run_id=j.processing_run_id and p.status in ('queued','leased'));
  end loop;
end;
$$;
revoke all on function private.settle_stale_execution_jobs_v1() from public,anon,authenticated;
do $migration$
declare definition text; function_oid regprocedure;
begin
  foreach function_oid in array array['private.worker_claim_job(text,integer)'::regprocedure,'private.worker_claim_job_v2(text,integer)'::regprocedure] loop
    select pg_get_functiondef(function_oid) into definition;
    if position('-- reclaim expired leases' in definition)=0 then raise exception 'worker stale cleanup patch drift'; end if;
    execute replace(definition,'-- reclaim expired leases',E'perform private.settle_stale_execution_jobs_v1();\n  -- reclaim expired leases');
  end loop;
end;
$migration$;
