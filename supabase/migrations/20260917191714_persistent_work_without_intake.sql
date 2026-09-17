-- Stage 10, additive storage/consumer contract. No new producer is enabled here.
-- Legacy jobs retain their intake authorization. Only work_conversation resolves work directly.
set search_path='';
create table public.work_contexts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 work_id uuid not null, purpose text not null default '' check(length(purpose)<=8000),
 audience text check(length(audience)<=500), deadline timestamptz check(deadline is null or isfinite(deadline)),
 commitment text not null default 'exploring' check(commitment in ('exploring','preparing','deciding')),
 authorized_services text[] not null default array['conversation']::text[] check(authorized_services=array['conversation']::text[]),
 stage text not null default 'understand' check(stage in ('understand','investigate','analyze','decide','prepare','monitor')),
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,work_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id) on delete cascade
);
comment on column public.work_contexts.authorized_services is 'Stage 10 permits conversation only; this declaration never grants execution, source access, publishing or external effects.';
create table public.work_dossiers (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 work_id uuid not null,dossier_id uuid not null,linked_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,work_id,dossier_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id) on delete cascade,
 foreign key(organization_id,dossier_id) references public.dossiers(organization_id,id) on delete cascade
);
create index work_dossiers_dossier_idx on public.work_dossiers(organization_id,dossier_id);
create index work_dossiers_actor_idx on public.work_dossiers(linked_by);
alter table public.work_contexts enable row level security;
alter table public.work_contexts force row level security;
revoke all on public.work_contexts from public,anon,authenticated,service_role;
grant select on public.work_contexts to authenticated;
create policy work_contexts_select on public.work_contexts for select to authenticated using((select private.can_access_capital_project(organization_id,work_id)));
create policy work_contexts_deny_insert on public.work_contexts for insert to authenticated with check(false);
create policy work_contexts_deny_update on public.work_contexts for update to authenticated using(false) with check(false);
create policy work_contexts_deny_delete on public.work_contexts for delete to authenticated using(false);
create trigger work_contexts_updated before update on public.work_contexts for each row execute function private.set_updated_at();
create trigger work_contexts_audit after insert or update or delete on public.work_contexts for each row execute function private.capture_identity_audit_v1();
alter table public.work_dossiers enable row level security;
alter table public.work_dossiers force row level security;
revoke all on public.work_dossiers from public,anon,authenticated,service_role;
grant select on public.work_dossiers to authenticated;
create policy work_dossiers_select on public.work_dossiers for select to authenticated using((select private.can_access_capital_project(organization_id,work_id)) and (select private.can_read_dossier_v1(dossier_id)));
create policy work_dossiers_deny_insert on public.work_dossiers for insert to authenticated with check(false);
create policy work_dossiers_deny_update on public.work_dossiers for update to authenticated using(false) with check(false);
create policy work_dossiers_deny_delete on public.work_dossiers for delete to authenticated using(false);
create trigger work_dossiers_updated before update on public.work_dossiers for each row execute function private.set_updated_at();
create trigger work_dossiers_audit after insert or update or delete on public.work_dossiers for each row execute function private.capture_identity_audit_v1();
alter table public.agent_conversations add column work_id uuid,
 add foreign key(organization_id,work_id) references public.capital_projects(organization_id,id) on delete cascade;
create index agent_conversations_work_idx on public.agent_conversations(organization_id,work_id);
alter table public.agent_messages add column work_id uuid,
 add foreign key(organization_id,work_id) references public.capital_projects(organization_id,id) on delete cascade;
create index agent_messages_work_idx on public.agent_messages(organization_id,work_id);
alter table public.processing_runs add column work_id uuid,
 add foreign key(organization_id,work_id) references public.capital_projects(organization_id,id) on delete cascade;
create index processing_runs_work_idx on public.processing_runs(organization_id,work_id);
alter table public.processing_jobs add column work_id uuid,
 add foreign key(organization_id,work_id) references public.capital_projects(organization_id,id) on delete cascade;
create index processing_jobs_work_idx on public.processing_jobs(organization_id,work_id);
-- Backfill only the new relationship, under the migration transaction lock. The approval
-- guard recognizes this one exact, session-derived addition, never a status/payload change.
do $$ declare body text; begin
 select pg_get_functiondef('private.guard_execution_approval_queue()'::regprocedure) into body;
 if position('if tg_op=''UPDATE'' and private.requires_execution_brief_approval(old.id)' in body)=0 then raise exception 'work_backfill_guard_contract_changed'; end if;
 body:=replace(body,'if tg_op=''UPDATE'' and private.requires_execution_brief_approval(old.id)',
 E'if tg_op=''UPDATE'' and old.work_id is null and new.work_id is not null
 and (to_jsonb(new)-array[''work_id'',''updated_at'']) is not distinct from (to_jsonb(old)-array[''work_id'',''updated_at''])
 and exists(select 1 from public.document_intake_sessions s where s.organization_id=new.organization_id and s.id=new.intake_session_id and s.capital_project_id=new.work_id) then return new; end if;
 if tg_op=''UPDATE'' and private.requires_execution_brief_approval(old.id)');
 execute body;
end $$;
update public.agent_conversations r set work_id=s.capital_project_id from public.document_intake_sessions s
 where s.organization_id=r.organization_id and s.id=r.intake_session_id and s.capital_project_id is not null;
alter table public.agent_conversations alter column intake_session_id drop not null;
update public.agent_messages r set work_id=s.capital_project_id from public.document_intake_sessions s
 where s.organization_id=r.organization_id and s.id=r.intake_session_id and s.capital_project_id is not null;
alter table public.agent_messages alter column intake_session_id drop not null;
update public.processing_runs r set work_id=s.capital_project_id from public.document_intake_sessions s
 where s.organization_id=r.organization_id and s.id=r.intake_session_id and s.capital_project_id is not null;
alter table public.processing_runs alter column intake_session_id drop not null;
update public.processing_jobs r set work_id=s.capital_project_id from public.document_intake_sessions s
 where s.organization_id=r.organization_id and s.id=r.intake_session_id and s.capital_project_id is not null;
alter table public.processing_jobs alter column intake_session_id drop not null;
-- Cross-object consistency also covers privileged legacy inserts. No surrogate session is made.
create function private.bind_persistent_work_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare expected_work uuid; expected_session uuid;
begin
 if new.intake_session_id is not null then
  select capital_project_id into expected_work from public.document_intake_sessions
   where organization_id=new.organization_id and id=new.intake_session_id;
  if new.work_id is not null and new.work_id is distinct from expected_work then raise exception 'work_session_mismatch' using errcode='23514'; end if;
  new.work_id:=expected_work;
 end if;
 if tg_table_name='agent_messages' then
  select work_id,intake_session_id into expected_work,expected_session from public.agent_conversations where organization_id=new.organization_id and id=new.conversation_id;
  if not found or new.work_id is distinct from expected_work or new.intake_session_id is distinct from expected_session then raise exception 'work_conversation_mismatch' using errcode='23514'; end if;
 elsif tg_table_name='processing_jobs' then
  select work_id,intake_session_id into expected_work,expected_session from public.processing_runs where organization_id=new.organization_id and id=new.processing_run_id;
  if not found or new.work_id is distinct from expected_work or new.intake_session_id is distinct from expected_session then raise exception 'work_run_mismatch' using errcode='23514'; end if;
 end if;
 if tg_op='UPDATE' and old.work_id is not null and old.work_id is distinct from new.work_id then raise exception 'work_identity_immutable' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function private.bind_persistent_work_v1() from public,anon,authenticated,service_role;
create trigger aaa_agent_conversations_work before insert or update on public.agent_conversations for each row execute function private.bind_persistent_work_v1();
create trigger aaa_agent_messages_work before insert or update on public.agent_messages for each row execute function private.bind_persistent_work_v1();
create trigger aaa_processing_runs_work before insert or update on public.processing_runs for each row execute function private.bind_persistent_work_v1();
create trigger aaa_processing_jobs_work before insert or update on public.processing_jobs for each row execute function private.bind_persistent_work_v1();
alter table public.agent_conversations add constraint conversation_work_or_intake check(work_id is not null or intake_session_id is not null);
alter table public.agent_messages add constraint message_work_or_intake check(work_id is not null or intake_session_id is not null);
alter table public.processing_runs add constraint run_work_or_intake check(intake_session_id is not null or (work_id is not null and pipeline_version='work-conversation-v1'));
alter table public.processing_jobs drop constraint processing_jobs_kind_check;
alter table public.processing_jobs add constraint processing_jobs_kind_check check(kind in ('document_pipeline','preliminary_analysis','case_analysis','capital_project_analysis','agent_operation_brief','execution_brief_proposal','work_conversation'));
alter table public.processing_jobs add constraint job_intake_by_kind check(
 (kind='work_conversation' and work_id is not null and intake_session_id is null and source_document_id is null and controlled_execution_id is null)
 or (kind<>'work_conversation' and intake_session_id is not null));
create unique index conversation_work_without_intake_idx on public.agent_conversations(organization_id,work_id) where intake_session_id is null;
create unique index processing_runs_work_number_idx on public.processing_runs(organization_id,work_id,run_no) where intake_session_id is null;
create unique index processing_jobs_work_message_idx on public.processing_jobs(organization_id,((payload->>'message_id'))) where kind='work_conversation';
drop policy agent_conversations_select on public.agent_conversations;
create policy agent_conversations_select on public.agent_conversations for select to authenticated using(
 case when intake_session_id is not null then (select private.can_access_intake_session(organization_id,intake_session_id))
 else (select private.can_access_capital_project(organization_id,work_id)) end);
drop policy agent_messages_select on public.agent_messages;
create policy agent_messages_select on public.agent_messages for select to authenticated using(
 case when intake_session_id is not null then (select private.can_access_intake_session(organization_id,intake_session_id))
 else (select private.can_access_capital_project(organization_id,work_id)) end);
drop policy processing_runs_select on public.processing_runs;
create policy processing_runs_select on public.processing_runs for select to authenticated using(
 case when intake_session_id is not null then (select private.can_access_intake_session(organization_id,intake_session_id))
 else (select private.can_access_capital_project(organization_id,work_id)) end);
drop policy processing_jobs_select on public.processing_jobs;
create policy processing_jobs_select on public.processing_jobs for select to authenticated using(
 case when intake_session_id is not null then (select private.can_access_intake_session(organization_id,intake_session_id))
 else (select private.can_access_capital_project(organization_id,work_id)) end);
-- Replace only the resource used by the new kind. Existing source/intake/review/approval
-- predicates are retained byte-for-byte, including principal revocation and authorization revision.
do $$ declare body text; before_body text; begin
 select pg_get_functiondef('private.bind_job_authority_v1()'::regprocedure) into before_body;
 body:=replace(before_body,'private.resource_root_v1(new.organization_id,new.intake_session_id)',
 'private.resource_root_v1(new.organization_id,case when new.kind=''work_conversation'' then new.work_id else new.intake_session_id end)');
 if body=before_body then raise exception 'work_binding_contract_changed'; end if; execute body;
 select pg_get_functiondef('private.job_authority_is_current_v1(uuid)'::regprocedure) into before_body;
 body:=replace(before_body,'j.intake_session_id','(case when j.kind=''work_conversation'' then j.work_id else j.intake_session_id end)');
 if body=before_body then raise exception 'work_authority_contract_changed'; end if; execute body;
 -- New consumer API returns the direct work identity. The current consumer remains compatible
 -- and cannot claim the new kind before the matching worker has been deployed.
 select pg_get_functiondef('private.worker_claim_job_v2(text,integer)'::regprocedure) into before_body;
 body:=replace(before_body,'private.worker_claim_job_v2(', 'private.worker_claim_job_v4(');
 body:=replace(body,'''intake_session_id'', job_row.intake_session_id', '''work_id'', job_row.work_id, ''intake_session_id'', job_row.intake_session_id');
 if position('''work_id'', job_row.work_id' in body)=0 then raise exception 'work_claim_contract_changed'; end if; execute body;
 body:=replace(before_body,'and (not private.requires_execution_brief_approval(id)', 'and kind<>''work_conversation'' and (not private.requires_execution_brief_approval(id)');
 if body=before_body then raise exception 'work_claim_filter_contract_changed'; end if; execute body;
end $$;
revoke all on function private.worker_claim_job_v4(text,integer) from public,anon,authenticated,service_role;
grant execute on function private.worker_claim_job_v4(text,integer) to authenticated;
create function public.worker_claim_job_v4(p_worker_token text,p_lease_seconds integer default 600) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_claim_job_v4(p_worker_token,p_lease_seconds); $$;
revoke all on function public.worker_claim_job_v4(text,integer) from public,anon,service_role;
grant execute on function public.worker_claim_job_v4(text,integer) to authenticated;
grant select(work_id) on public.processing_jobs to authenticated;

create function private.work_turn_context_v1(p_job_id uuid) returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('workId',j.work_id,'messageId',m.id,'locale',m.locale,'message',m.content,
 'context',jsonb_build_object('purpose',c.purpose,'audience',c.audience,'deadline',c.deadline,'commitment',c.commitment,'stage',c.stage,'revision',c.revision),
 'messages',coalesce((select jsonb_agg(jsonb_build_object('role',h.role,'content',h.content) order by h.created_at,h.id)
 from (select prior.id,prior.role,prior.content,prior.created_at from public.agent_messages prior
 where prior.organization_id=j.organization_id and prior.conversation_id=m.conversation_id and prior.id<>m.id and prior.status='completed'
 and (prior.created_at,prior.id)<=(m.created_at,m.id) order by prior.created_at desc,prior.id desc limit 12) h),'[]'::jsonb))
 from public.processing_jobs j join public.agent_messages m on m.organization_id=j.organization_id and m.work_id=j.work_id and m.id::text=j.payload->>'message_id'
 join public.work_contexts c on c.organization_id=j.organization_id and c.work_id=j.work_id
 where j.id=p_job_id and j.kind='work_conversation' and m.role='user';
$$;
revoke all on function private.work_turn_context_v1(uuid) from public,anon,authenticated,service_role;
create function private.worker_load_work_turn_v1(p_job_id uuid,p_capability_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token); context jsonb;
begin
 if j.kind<>'work_conversation' then raise exception 'work_conversation_capability_required' using errcode='42501'; end if;
 context:=private.work_turn_context_v1(j.id);
 if context is null then raise exception 'work_turn_not_found' using errcode='P0002'; end if;
 update public.agent_messages set status='processing' where organization_id=j.organization_id and id=(context->>'messageId')::uuid and status='queued';
 return context||jsonb_build_object('fingerprint',encode(extensions.digest(context::text,'sha256'),'hex'));
end $$;
create function public.worker_load_work_turn_v1(p_job_id uuid,p_capability_token text) returns jsonb
language sql security invoker set search_path='' as $$ select private.worker_load_work_turn_v1(p_job_id,p_capability_token); $$;

create function private.worker_commit_work_turn_v1(p_job_id uuid,p_capability_token text,p_fingerprint text,p_response jsonb,p_spend jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token); m public.agent_messages; context jsonb; response_id uuid;
begin
 if j.kind<>'work_conversation' then raise exception 'work_conversation_capability_required' using errcode='42501'; end if;
 perform 1 from public.work_contexts where organization_id=j.organization_id and work_id=j.work_id for share;
 context:=private.work_turn_context_v1(j.id);
 if context is null or p_fingerprint is distinct from encode(extensions.digest(context::text,'sha256'),'hex') then raise exception 'work_turn_context_changed' using errcode='40001'; end if;
 if coalesce(jsonb_typeof(p_response)<>'object' or p_response-array['kind','content']<>'{}'::jsonb
 or p_response->>'kind' not in ('answer','clarification','execution_needed') or length(btrim(p_response->>'content')) not between 1 and 8000,true) then raise exception 'invalid_work_response' using errcode='22023'; end if;
 select * into strict m from public.agent_messages where organization_id=j.organization_id and id=(context->>'messageId')::uuid for update;
 if m.status not in ('queued','processing') then raise exception 'work_turn_already_settled' using errcode='55000'; end if;
 response_id:=gen_random_uuid();
 insert into public.agent_messages(id,organization_id,work_id,conversation_id,intake_session_id,role,status,content,locale,reply_to_message_id,metadata,created_by)
 values(response_id,j.organization_id,j.work_id,m.conversation_id,m.intake_session_id,'assistant','completed',p_response->>'content',m.locale,m.id,
 jsonb_build_object('kind',p_response->>'kind','contextFingerprint',p_fingerprint,'contract','work-conversation-v1'),j.authorization_subject_id);
 update public.agent_messages set status='completed' where organization_id=j.organization_id and id=m.id;
 update public.agent_conversations set state=case when p_response->>'kind'='clarification' then 'asking' else 'idle' end where organization_id=j.organization_id and id=m.conversation_id;
 perform private.worker_complete_job(j.id,p_capability_token,jsonb_build_object('assistantMessageId',response_id,'spend',p_spend));
 return jsonb_build_object('messageId',response_id);
end $$;
create function public.worker_commit_work_turn_v1(p_job_id uuid,p_capability_token text,p_fingerprint text,p_response jsonb,p_spend jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.worker_commit_work_turn_v1(p_job_id,p_capability_token,p_fingerprint,p_response,p_spend); $$;
revoke all on function private.worker_load_work_turn_v1(uuid,text),public.worker_load_work_turn_v1(uuid,text),
 private.worker_commit_work_turn_v1(uuid,text,text,jsonb,jsonb),public.worker_commit_work_turn_v1(uuid,text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.worker_load_work_turn_v1(uuid,text),public.worker_load_work_turn_v1(uuid,text),
 private.worker_commit_work_turn_v1(uuid,text,text,jsonb,jsonb),public.worker_commit_work_turn_v1(uuid,text,text,jsonb,jsonb) to authenticated;

create function private.settle_failed_work_turn_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind='work_conversation' and new.status in ('failed','poison','cancelled') and old.status is distinct from new.status then
  update public.agent_messages set status='failed',error_code='work_turn_failed'
   where organization_id=new.organization_id and work_id=new.work_id and id::text=new.payload->>'message_id' and status in ('queued','processing');
  update public.agent_conversations set state='failed' where organization_id=new.organization_id and work_id=new.work_id and intake_session_id is null;
 end if;
 return new;
end $$;
revoke all on function private.settle_failed_work_turn_v1() from public,anon,authenticated,service_role;
create trigger processing_jobs_settle_work_turn after update of status on public.processing_jobs for each row execute function private.settle_failed_work_turn_v1();
