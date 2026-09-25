-- Stage 18, increment 4 (migration C of work_dependencies_and_continuity): continuation commands,
-- adoption and the read of a work's updates. A person continues a work from its conversation from an
-- explicit approved base, and decides about the dependency updates of increment 3: adopts a ready
-- update, authorizes a costed recomputation or declines. Every command is a security definer core in
-- private behind a security invoker wrapper in public, idempotent by an id the caller chooses, checks
-- the person's current authority on the work with the rule of the execution request, and writes every
-- row and milestone of the act in one transaction. Results and decisions already recorded are never
-- changed: new milestones reference them.
--
-- public.work_milestones gains explicit references (reference_milestone_ids, validated on insert to
-- name earlier milestones of the same work) and the outcome of a decision (approved or rejected; the
-- decisions projected by increment 2 are all approvals and keep a null outcome). The order and the
-- references the continuation contract reads (packages/work-plan/src/continuation.ts) come from one
-- function, private.work_milestone_log_v1, which the read RPC returns and the commands validate
-- against, so the conversation and the database apply the same rule to the same log.
--
-- public.work_continuation_requests gains the shape of user_followup and the reason a person gives
-- when declining an update. No function is changed by text.
set search_path='';

-- 1. Milestones: explicit references and the outcome of a decision.
alter table public.work_milestones add column reference_milestone_ids uuid[] not null default '{}'::uuid[];
alter table public.work_milestones add constraint work_milestones_references_shape
 check(cardinality(reference_milestone_ids)<=500 and array_position(reference_milestone_ids,null) is null and not (id=any(reference_milestone_ids)));
do $contract$
declare kind_rule text;outcome_rule text;
begin
 -- The two checks of increment 2 that tie an outcome to execution results only, found by definition.
 select c.conname into kind_rule from pg_constraint c where c.conrelid='public.work_milestones'::regclass and c.contype='c'
  and pg_get_constraintdef(c.oid)='CHECK (((kind = ''execution_result''::text) = (outcome IS NOT NULL)))';
 select c.conname into outcome_rule from pg_constraint c where c.conrelid='public.work_milestones'::regclass and c.contype='c'
  and pg_get_constraintdef(c.oid)='CHECK ((outcome = ANY (ARRAY[''succeeded''::text, ''partial''::text])))';
 if kind_rule is null or outcome_rule is null then raise exception 'work_milestone_outcome_contract_changed'; end if;
 execute format('alter table public.work_milestones drop constraint %I',kind_rule);
 execute format('alter table public.work_milestones drop constraint %I',outcome_rule);
end $contract$;
-- A result keeps its outcome; a decision is approved or rejected (the projected approvals of increment 2
-- carry none and are approvals); an adoption is an approval; every other kind carries none. Decisions
-- and adoptions name the revision they were taken on.
alter table public.work_milestones add constraint work_milestones_outcome_kind check(case kind
 when 'execution_result' then outcome is not null and outcome in ('succeeded','partial')
 when 'decision' then outcome is null or outcome in ('approved','rejected')
 when 'update_adopted' then outcome is not null and outcome='approved'
 else outcome is null end);
alter table public.work_milestones add constraint work_milestones_decision_revision check(kind not in ('decision','update_adopted') or revision is not null);

-- A reference names an earlier milestone of the same work, once.
create function private.validate_work_milestone_references_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if cardinality(new.reference_milestone_ids)>0 and (
  (select count(distinct r) from unnest(new.reference_milestone_ids) r)<>cardinality(new.reference_milestone_ids)
  or exists(select 1 from unnest(new.reference_milestone_ids) r where not exists(
   select 1 from public.work_milestones m where m.organization_id=new.organization_id and m.work_id=new.work_id and m.id=r))) then
  raise exception 'work_milestone_reference_invalid' using errcode='23514';
 end if;
 return new;
end $$;
create trigger work_milestones_references before insert on public.work_milestones for each row execute function private.validate_work_milestone_references_v1();

-- The references the continuation contract reads: the explicit ones, then the wait a resolution
-- resolves and the milestone a newer one supersedes, each once, in that order.
create function private.work_milestone_references_v1(p_references uuid[],p_resolves uuid,p_supersedes uuid) returns uuid[]
language sql immutable set search_path='' as $$
 select coalesce(array_agg(x.id order by x.position),'{}'::uuid[]) from (
  select distinct on (r.id) r.id,r.position from unnest(coalesce(p_references,'{}'::uuid[])||array[p_resolves,p_supersedes]) with ordinality r(id,position)
  where r.id is not null order by r.id,r.position) x;
$$;

-- The milestone log of a work, numbered 1..n in the order the continuation contract reads it: by the
-- time of the act, but never before anything a milestone references. The effective time of a
-- milestone is the latest act time among it and every milestone it reaches, its depth the longest
-- chain of references below it; ties fall to the time of writing and the id.
create function private.work_milestone_log_v1(p_org uuid,p_work uuid)
returns table(milestone_id uuid,sequence integer,kind text,subject_kind text,subject_id uuid,label text,revision integer,outcome text,
 reference_ids uuid[],created_by uuid,occurred_at timestamptz,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 with recursive m as (
  select x.id,x.kind,x.subject_kind,x.subject_id,x.label,x.revision,x.outcome,x.created_by,x.occurred_at,x.created_at,
   private.work_milestone_references_v1(x.reference_milestone_ids,x.resolves_milestone_id,x.supersedes_milestone_id) as refs
  from public.work_milestones x where x.organization_id=p_org and x.work_id=p_work),
 reach(id,ancestor,distance) as (
  select m.id,m.id,0 from m
  union
  select r.id,a.ref,r.distance+1 from reach r join m on m.id=r.ancestor cross join lateral unnest(m.refs) a(ref)),
 placed as (
  select r.id,max(m.occurred_at) as effective,max(r.distance) as depth from reach r join m on m.id=r.ancestor group by r.id)
 select m.id,(row_number() over(order by p.effective,p.depth,m.created_at,m.id))::integer,m.kind,m.subject_kind,m.subject_id,m.label,m.revision,m.outcome,
  m.refs,m.created_by,m.occurred_at,m.created_at
 from m join placed p on p.id=m.id order by 2;
$$;

-- The approved bases of a continuation, the rule of approvedBases in continuation.ts: a decision or an
-- adoption approved by a person that no later decision or adoption replaced, where replacing means
-- referencing it or sharing a reference with it. A decision about one recompute candidate authorizes
-- or declines a cost; it is about spending, not about a result, and takes no part in the rule.
create function private.work_continuation_bases_v1(p_org uuid,p_work uuid)
returns table(milestone_id uuid,decision_id uuid,revision integer,label text,kind text,sequence integer)
language sql stable security definer set search_path='' as $$
 with log as (select * from private.work_milestone_log_v1(p_org,p_work)),
 deciding as (select * from log l where l.kind in ('decision','update_adopted') and not (l.kind='decision' and l.subject_kind='work_recompute_candidate'))
 select d.milestone_id,d.subject_id,d.revision,d.label,d.kind,d.sequence from deciding d
 where coalesce(d.outcome,'approved')='approved'
  and not exists(select 1 from deciding l where l.sequence>d.sequence and (d.milestone_id=any(l.reference_ids) or l.reference_ids && d.reference_ids))
 order by d.sequence;
$$;

-- 2. Continuation requests: the shape of a person's follow-up and the reason of a person's decline.
alter table public.work_continuation_requests add constraint work_continuation_requests_followup_shape check(kind<>'user_followup' or (
 payload->>'schemaVersion'='work-followup-request.v1' and payload->>'workId'=work_id::text
 and coalesce(payload->>'conversationId','') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and jsonb_typeof(payload->'objective')='object'
 and jsonb_typeof(payload#>'{objective,request}')='string' and char_length(payload#>>'{objective,request}') between 1 and 8000
 and payload#>>'{objective,request}'=btrim(payload#>>'{objective,request}')
 and coalesce(payload#>>'{objective,baseMilestoneId}','') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and coalesce(payload#>>'{objective,baseDecisionId}','') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and jsonb_typeof(payload#>'{objective,baseRevision}')='number' and payload#>>'{objective,baseRevision}' ~ '^[1-9][0-9]{0,8}$'
 and payload-array['schemaVersion','workId','conversationId','objective']='{}'::jsonb
 and (payload->'objective')-array['request','baseMilestoneId','baseDecisionId','baseRevision']='{}'::jsonb
 and affected_executions='[]'::jsonb));
alter table public.work_continuation_requests add column decline_reason text;
alter table public.work_continuation_requests add constraint work_continuation_requests_decline_reason
 check(decline_reason is null or (status='declined' and decline_reason ~ '^person_declined:(not_needed|cost_not_justified|inputs_disputed|other)$'));
-- The reason is written once, by the transition to declined, and never changes afterwards.
create function private.guard_work_continuation_decline_reason_v1() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.decline_reason is distinct from old.decline_reason and (old.decline_reason is not null or old.status='declined' or new.status<>'declined') then
  raise exception 'work_continuation_request_transition_invalid' using errcode='23514';
 end if;
 return new;
end $$;
create trigger work_continuation_requests_decline_reason before update on public.work_continuation_requests for each row execute function private.guard_work_continuation_decline_reason_v1();

-- 3. Shared pieces of the commands.
-- The person's current authority on the work, the rule of the execution request: a live account, an
-- active human principal of the organization and the resource policy for work on the work, for
-- analysis, read under the shared resource policy lock; an archived work takes no command.
create function private.require_work_continuation_authority_v1(p_org uuid,p_work uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'work_continuation_access_denied' using errcode='42501'; end if;
 perform 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'work_continuation_access_denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||p_org::text,0));
 if not exists(select 1 from public.capital_projects w where w.organization_id=p_org and w.id=p_work and w.status<>'archived')
 or not exists(select 1 from private.principals p where p.organization_id=p_org and p.user_id=auth.uid() and p.kind='human' and p.revoked_at is null)
 or not private.evaluate_resource_policy_v1(p_org,p_work,auth.uid(),'work','analysis') then
  raise exception 'work_continuation_access_denied' using errcode='42501';
 end if;
end $$;

-- A command takes the lock the planner, the settlement and the worker take for the work, then checks
-- the authority again under it. The first check, without any lock, keeps a person without authority
-- from ever waiting on the work.
create function private.lock_work_for_continuation_v1(p_org uuid,p_work uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.evaluate_resource_policy_v1(p_org,p_work,auth.uid(),'work','analysis') then
  raise exception 'work_continuation_access_denied' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('work-continuation:'||p_org::text||':'||p_work::text,0));
 perform private.require_work_continuation_authority_v1(p_org,p_work);
end $$;

-- The milestone a command records under the id its caller chose, stable per organization.
create function private.work_command_milestone_id_v1(p_org uuid,p_command uuid) returns uuid
language sql immutable set search_path='' as $$ select md5('work-continuation-command:'||p_org::text||':'||p_command::text)::uuid; $$;

-- The conversation append_work_turn_v1 writes to: the one of the work's document intake session when
-- the work has one, otherwise the work's own. With create, a missing intake conversation is opened
-- as submit_advisor_turn_v1 opens it.
create function private.work_turn_conversation_v1(p_org uuid,p_work uuid,p_create boolean) returns public.agent_conversations
language plpgsql volatile security definer set search_path='' as $$
declare session uuid;c public.agent_conversations;
begin
 select s.id into session from public.document_intake_sessions s where s.organization_id=p_org and s.capital_project_id=p_work order by s.created_at,s.id limit 1;
 if session is null then
  select * into c from public.agent_conversations x where x.organization_id=p_org and x.work_id=p_work and x.intake_session_id is null;
 else
  select * into c from public.agent_conversations x where x.organization_id=p_org and x.intake_session_id=session;
  if not found and p_create then
   insert into public.agent_conversations(organization_id,intake_session_id,state,created_by) values(p_org,session,'idle',auth.uid()) returning * into c;
  end if;
 end if;
 return c;
end $$;

-- 4. A follow-up typed in the work's conversation, from an explicit base: an approved decision or
-- adoption of the work that nothing replaced, named by its milestone, its decision and the revision it
-- was taken on. The user turn is recorded in the conversation append_work_turn_v1 uses, so it works
-- with or without an intake session; the request and its continuation_proposed milestone, which
-- references the base, are recorded in the same transaction. Nothing is enqueued and no model is
-- called. The request id chosen by the caller is also the id of the user turn.
create function private.request_work_continuation_v1(p_request_id uuid,p_work_id uuid,p_locale text,p_content text,
 p_base_milestone_id uuid,p_base_decision_id uuid,p_base_revision integer) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare w public.capital_projects;v_content text:=btrim(coalesce(p_content,''));v_objective text;prior public.work_continuation_requests;
 base_row public.work_milestones;base_kind text;c public.agent_conversations;body jsonb;proposal uuid;base jsonb;
begin
 v_objective:=btrim(regexp_replace(v_content,'\s+',' ','g'));
 if p_request_id is null or p_work_id is null or p_locale is null or p_locale not in ('pt-BR','en-US') or char_length(v_content) not between 1 and 8000
 or p_base_milestone_id is null or p_base_decision_id is null or p_base_revision is null or p_base_revision<1 then
  raise exception 'invalid_work_continuation' using errcode='22023';
 end if;
 select * into w from public.capital_projects where id=p_work_id;
 if not found then raise exception 'work_continuation_access_denied' using errcode='42501'; end if;
 perform private.lock_work_for_continuation_v1(w.organization_id,w.id);

 -- The same request again returns what it recorded; the same id with anything else is refused.
 select * into prior from public.work_continuation_requests where id=p_request_id;
 if found then
  if prior.organization_id<>w.organization_id or prior.work_id<>w.id or prior.kind<>'user_followup' or prior.created_by is distinct from auth.uid()
  or prior.payload#>>'{objective,request}' is distinct from v_objective
  or prior.payload#>>'{objective,baseMilestoneId}' is distinct from p_base_milestone_id::text
  or prior.payload#>>'{objective,baseDecisionId}' is distinct from p_base_decision_id::text
  or prior.payload#>>'{objective,baseRevision}' is distinct from p_base_revision::text
  or not exists(select 1 from public.agent_messages m where m.id=prior.id and m.locale=p_locale and m.content=v_content) then
   raise exception 'work_continuation_replay_conflict' using errcode='22023';
  end if;
  select m.id into proposal from public.work_milestones m where m.organization_id=prior.organization_id and m.kind='continuation_proposed'
   and m.subject_kind='work_continuation_request' and m.subject_id=prior.id;
  select jsonb_build_object('milestoneId',m.id,'decisionId',m.subject_id,'revision',m.revision,'kind',m.kind,'label',m.label) into base
  from public.work_milestones m where m.organization_id=prior.organization_id and m.id=p_base_milestone_id;
  return jsonb_build_object('requestId',prior.id,'workId',prior.work_id,'conversationId',prior.payload->>'conversationId','messageId',prior.id,
   'milestoneId',proposal,'status',prior.status,'base',base,'replayed',true);
 end if;
 if exists(select 1 from public.agent_messages where id=p_request_id) then raise exception 'work_continuation_replay_conflict' using errcode='22023'; end if;

 -- The base, by reference only.
 select * into base_row from public.work_milestones m where m.organization_id=w.organization_id and m.work_id=w.id and m.id=p_base_milestone_id;
 if not found then raise exception 'work_continuation_base_not_found' using errcode='P0002'; end if;
 if base_row.kind not in ('decision','update_adopted') or coalesce(base_row.outcome,'approved')<>'approved'
 or (base_row.kind='decision' and base_row.subject_kind='work_recompute_candidate') then
  raise exception 'work_continuation_base_not_approved' using errcode='22023';
 end if;
 if base_row.subject_id<>p_base_decision_id or base_row.revision is distinct from p_base_revision then
  raise exception 'work_continuation_base_mismatch' using errcode='40001';
 end if;
 if not exists(select 1 from private.work_continuation_bases_v1(w.organization_id,w.id) b where b.milestone_id=base_row.id) then
  raise exception 'work_continuation_base_superseded' using errcode='40001';
 end if;
 base:=jsonb_build_object('milestoneId',base_row.id,'decisionId',base_row.subject_id,'revision',base_row.revision,'kind',base_row.kind,'label',base_row.label);

 -- The turn, in the conversation append_work_turn_v1 uses.
 c:=private.work_turn_conversation_v1(w.organization_id,w.id,true);
 if c.id is null then raise exception 'work_conversation_unavailable' using errcode='55000'; end if;
 perform 1 from public.agent_conversations where organization_id=c.organization_id and id=c.id for update;
 if exists(select 1 from public.agent_messages m where m.organization_id=c.organization_id and m.conversation_id=c.id and m.role='user' and m.status in ('queued','processing')) then
  raise exception 'advisor_message_in_progress' using errcode='55000';
 end if;
 insert into public.agent_messages(id,organization_id,work_id,conversation_id,intake_session_id,role,status,content,locale,metadata,created_by)
 values(p_request_id,w.organization_id,w.id,c.id,c.intake_session_id,'user','completed',v_content,p_locale,
  jsonb_build_object('kind','work_continuation','projectId',w.id,'requestId',p_request_id,'base',base),auth.uid());

 body:=jsonb_build_object('schemaVersion','work-followup-request.v1','workId',w.id,'conversationId',c.id,
  'objective',jsonb_build_object('request',v_objective,'baseMilestoneId',base_row.id,'baseDecisionId',base_row.subject_id,'baseRevision',base_row.revision));
 insert into public.work_continuation_requests(id,organization_id,work_id,kind,status,payload,payload_fingerprint,created_by)
 values(p_request_id,w.organization_id,w.id,'user_followup','open',body,private.continuation_fingerprint_v1(body),auth.uid());
 insert into public.work_milestones(organization_id,work_id,kind,subject_kind,subject_id,label,created_by,occurred_at,reference_milestone_ids)
 values(w.organization_id,w.id,'continuation_proposed','work_continuation_request',p_request_id,private.work_milestone_label_v1(v_objective,'user_followup'),
  auth.uid(),clock_timestamp(),array[base_row.id]) returning id into proposal;
 update public.agent_conversations set updated_at=now() where organization_id=c.organization_id and id=c.id;
 update public.capital_projects set updated_at=now() where organization_id=w.organization_id and id=w.id;
 return jsonb_build_object('requestId',p_request_id,'workId',w.id,'conversationId',c.id,'messageId',p_request_id,'milestoneId',proposal,
  'status','open','base',base,'replayed',false);
end $$;

-- 5. Adoption: a ready dependency update, at the revision the person saw, becomes adopted. The
-- update_adopted milestone records the decision (approved, on that revision) and references the
-- results of the settled candidates and the results they replace. Nothing earlier changes.
create function private.adopt_work_update_v1(p_command_id uuid,p_update_id uuid,p_expected_revision integer) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r public.work_continuation_requests;existing public.work_milestones;milestone uuid;adopted uuid[];replaced uuid[];
begin
 if p_command_id is null or p_update_id is null or p_expected_revision is null or p_expected_revision<1 then
  raise exception 'invalid_work_update_command' using errcode='22023';
 end if;
 select * into r from public.work_continuation_requests where id=p_update_id;
 if not found then raise exception 'work_continuation_access_denied' using errcode='42501'; end if;
 perform private.lock_work_for_continuation_v1(r.organization_id,r.work_id);
 milestone:=private.work_command_milestone_id_v1(r.organization_id,p_command_id);
 select * into existing from public.work_milestones where organization_id=r.organization_id and id=milestone;
 if found then
  if existing.kind<>'update_adopted' or existing.work_id<>r.work_id or existing.subject_id<>r.id or existing.revision<>p_expected_revision
  or existing.created_by is distinct from auth.uid() then
   raise exception 'work_update_command_conflict' using errcode='22023';
  end if;
  select * into strict r from public.work_continuation_requests where id=p_update_id;
  return jsonb_build_object('updateId',r.id,'status',r.status,'revision',r.revision,'milestoneId',existing.id,
   'references',to_jsonb(existing.reference_milestone_ids),'replayed',true);
 end if;
 select * into strict r from public.work_continuation_requests where id=p_update_id for update;
 if r.kind<>'dependency_update' then raise exception 'work_update_not_found' using errcode='P0002'; end if;
 if r.status<>'ready' then raise exception 'work_update_not_ready' using errcode='55000'; end if;
 if r.revision<>p_expected_revision then raise exception 'work_update_changed' using errcode='40001'; end if;
 -- The results of the settled candidates, then the results of the executions they cover.
 adopted:=array(select m.id from public.work_recompute_candidates c join public.work_milestones m on m.organization_id=c.organization_id and m.work_id=c.work_id
  and m.kind='execution_result' and m.subject_kind='work_execution' and m.subject_id=c.execution_id
  where c.organization_id=r.organization_id and c.work_id=r.work_id and c.request_id=r.id and c.state='settled' order by c.created_at,c.id);
 if cardinality(adopted)=0 then raise exception 'work_update_result_missing' using errcode='55000'; end if;
 replaced:=array(select x.id from (select distinct on (m.id) m.id,c.created_at,c.id as candidate,e.id as execution
   from public.work_recompute_candidates c cross join unnest(c.execution_ids) e(id)
   join public.work_milestones m on m.organization_id=c.organization_id and m.work_id=c.work_id and m.kind='execution_result' and m.subject_kind='work_execution' and m.subject_id=e.id
   where c.organization_id=r.organization_id and c.work_id=r.work_id and c.request_id=r.id and c.state='settled' and not (m.id=any(adopted))
   order by m.id,c.created_at,c.id,e.id) x order by x.created_at,x.candidate,x.execution);
 update public.work_continuation_requests set status='adopted',revision=revision+1 where organization_id=r.organization_id and id=r.id returning * into r;
 insert into public.work_milestones(id,organization_id,work_id,kind,subject_kind,subject_id,label,revision,outcome,created_by,occurred_at,reference_milestone_ids)
 values(milestone,r.organization_id,r.work_id,'update_adopted','work_continuation_request',r.id,'dependency_update_adopted',p_expected_revision,'approved',
  auth.uid(),clock_timestamp(),adopted||replaced);
 return jsonb_build_object('updateId',r.id,'status',r.status,'revision',r.revision,'milestoneId',milestone,'references',to_jsonb(adopted||replaced),
  'adoptedResults',to_jsonb(adopted),'replacedResults',to_jsonb(replaced),'replayed',false);
end $$;

-- 6. Authorization: a candidate awaiting authorization, at the revision the person saw, becomes
-- scheduled for the worker of increment 3B. A human_resolved milestone resolves its awaiting_human
-- wait, a decision milestone records the authorization, and the request takes the status the 3B
-- status function gives it. A candidate whose heads have moved is refused: the next planning
-- supersedes it.
create function private.authorize_work_update_v1(p_command_id uuid,p_candidate_id uuid,p_expected_revision integer) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare c public.work_recompute_candidates;existing public.work_milestones;milestone uuid;wait public.work_milestones;resolution uuid;v_status text;
begin
 if p_command_id is null or p_candidate_id is null or p_expected_revision is null or p_expected_revision<1 then
  raise exception 'invalid_work_update_command' using errcode='22023';
 end if;
 select * into c from public.work_recompute_candidates where id=p_candidate_id;
 if not found then raise exception 'work_continuation_access_denied' using errcode='42501'; end if;
 perform private.lock_work_for_continuation_v1(c.organization_id,c.work_id);
 milestone:=private.work_command_milestone_id_v1(c.organization_id,p_command_id);
 select * into existing from public.work_milestones where organization_id=c.organization_id and id=milestone;
 if found then
  if existing.kind<>'decision' or existing.subject_kind<>'work_recompute_candidate' or existing.subject_id<>c.id or existing.outcome<>'approved'
  or existing.revision<>p_expected_revision or existing.created_by is distinct from auth.uid() then
   raise exception 'work_update_command_conflict' using errcode='22023';
  end if;
  select * into strict c from public.work_recompute_candidates where id=p_candidate_id;
  return jsonb_build_object('candidateId',c.id,'state',c.state,'revision',c.revision,'updateId',c.request_id,
   'updateStatus',(select x.status from public.work_continuation_requests x where x.id=c.request_id),'milestoneId',existing.id,'replayed',true);
 end if;
 select * into strict c from public.work_recompute_candidates where id=p_candidate_id for update;
 if c.state<>'awaiting_authorization' then raise exception 'work_update_candidate_not_waiting' using errcode='55000'; end if;
 if c.revision<>p_expected_revision then raise exception 'work_update_changed' using errcode='40001'; end if;
 if not private.dependency_recompute_candidate_current_v1(c.organization_id,c.id) then raise exception 'work_update_candidate_stale' using errcode='40001'; end if;
 select * into wait from public.work_milestones m where m.organization_id=c.organization_id and m.work_id=c.work_id and m.kind='awaiting_human'
  and m.subject_kind='work_recompute_candidate' and m.subject_id=c.id;
 if not found or exists(select 1 from public.work_milestones m where m.organization_id=c.organization_id and m.work_id=c.work_id and m.kind='human_resolved' and m.resolves_milestone_id=wait.id) then
  raise exception 'work_update_wait_missing' using errcode='55000';
 end if;
 update public.work_recompute_candidates set state='scheduled',revision=revision+1 where organization_id=c.organization_id and id=c.id returning * into c;
 insert into public.work_milestones(organization_id,work_id,kind,subject_kind,subject_id,label,resolves_milestone_id,created_by,occurred_at,reference_milestone_ids)
 values(c.organization_id,c.work_id,'human_resolved','work_recompute_candidate',c.id,'dependency_recompute_authorization',wait.id,auth.uid(),clock_timestamp(),array[wait.id])
 returning id into resolution;
 insert into public.work_milestones(id,organization_id,work_id,kind,subject_kind,subject_id,label,revision,outcome,created_by,occurred_at,reference_milestone_ids)
 values(milestone,c.organization_id,c.work_id,'decision','work_recompute_candidate',c.id,'dependency_recompute_authorization',p_expected_revision,'approved',
  auth.uid(),clock_timestamp(),array[wait.id]);
 v_status:=private.advance_dependency_update_request_v1(c.organization_id,c.request_id);
 return jsonb_build_object('candidateId',c.id,'state',c.state,'revision',c.revision,'updateId',c.request_id,'updateStatus',v_status,
  'milestoneId',milestone,'resolutionMilestoneId',resolution,'replayed',false);
end $$;

-- 7. Decline: a person declines an open, waiting, scheduled or ready update, or one candidate that
-- waits for authorization. The update or the candidate ends declined with the person's reason code,
-- a decision milestone with outcome rejected records it, and every wait it closes gets its
-- human_resolved. Declining an update also declines its candidates still waiting or scheduled and
-- releases its holds; settled candidates and their results stay as they are.
create function private.decline_work_update_v1(p_command_id uuid,p_update_id uuid,p_expected_revision integer,p_reason text,p_candidate_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r public.work_continuation_requests;c public.work_recompute_candidates;existing public.work_milestones;milestone uuid;wait public.work_milestones;
 v_reason text;proposal uuid;declined uuid[]:='{}';released integer;v_status text;
begin
 if p_command_id is null or p_update_id is null or p_expected_revision is null or p_expected_revision<1 or p_reason is null
 or p_reason not in ('not_needed','cost_not_justified','inputs_disputed','other') then
  raise exception 'invalid_work_update_command' using errcode='22023';
 end if;
 v_reason:='person_declined:'||p_reason;
 select * into r from public.work_continuation_requests where id=p_update_id;
 if not found then raise exception 'work_continuation_access_denied' using errcode='42501'; end if;
 if p_candidate_id is not null then
  select * into c from public.work_recompute_candidates where id=p_candidate_id;
  if not found or c.organization_id<>r.organization_id or c.request_id<>r.id then raise exception 'work_continuation_access_denied' using errcode='42501'; end if;
 end if;
 perform private.lock_work_for_continuation_v1(r.organization_id,r.work_id);
 milestone:=private.work_command_milestone_id_v1(r.organization_id,p_command_id);
 select * into existing from public.work_milestones where organization_id=r.organization_id and id=milestone;
 if found then
  if existing.kind<>'decision' or existing.outcome<>'rejected' or existing.revision<>p_expected_revision or existing.created_by is distinct from auth.uid()
  or (p_candidate_id is null and (existing.subject_kind<>'work_continuation_request' or existing.subject_id<>r.id
   or (select x.decline_reason from public.work_continuation_requests x where x.id=r.id) is distinct from v_reason))
  or (p_candidate_id is not null and (existing.subject_kind<>'work_recompute_candidate' or existing.subject_id<>p_candidate_id
   or (select x.reason from public.work_recompute_candidates x where x.id=p_candidate_id) is distinct from v_reason)) then
   raise exception 'work_update_command_conflict' using errcode='22023';
  end if;
  select * into strict r from public.work_continuation_requests where id=p_update_id;
  return jsonb_build_object('updateId',r.id,'updateStatus',r.status,'updateRevision',r.revision,'candidateId',p_candidate_id,
   'candidateState',(select x.state from public.work_recompute_candidates x where x.id=p_candidate_id),'reason',v_reason,'milestoneId',existing.id,'replayed',true);
 end if;

 if p_candidate_id is not null then
  -- One candidate waiting for authorization.
  select * into strict c from public.work_recompute_candidates where id=p_candidate_id for update;
  if c.state<>'awaiting_authorization' then raise exception 'work_update_candidate_not_waiting' using errcode='55000'; end if;
  if c.revision<>p_expected_revision then raise exception 'work_update_changed' using errcode='40001'; end if;
  select * into wait from public.work_milestones m where m.organization_id=c.organization_id and m.work_id=c.work_id and m.kind='awaiting_human'
   and m.subject_kind='work_recompute_candidate' and m.subject_id=c.id;
  if not found or exists(select 1 from public.work_milestones m where m.organization_id=c.organization_id and m.work_id=c.work_id and m.kind='human_resolved' and m.resolves_milestone_id=wait.id) then
   raise exception 'work_update_wait_missing' using errcode='55000';
  end if;
  update public.work_recompute_candidates set state='declined',reason=v_reason,revision=revision+1 where organization_id=c.organization_id and id=c.id returning * into c;
  insert into public.work_milestones(organization_id,work_id,kind,subject_kind,subject_id,label,resolves_milestone_id,created_by,occurred_at,reference_milestone_ids)
  values(c.organization_id,c.work_id,'human_resolved','work_recompute_candidate',c.id,'dependency_recompute_declined',wait.id,auth.uid(),clock_timestamp(),array[wait.id]);
  insert into public.work_milestones(id,organization_id,work_id,kind,subject_kind,subject_id,label,revision,outcome,created_by,occurred_at,reference_milestone_ids)
  values(milestone,c.organization_id,c.work_id,'decision','work_recompute_candidate',c.id,'dependency_recompute_declined',p_expected_revision,'rejected',
   auth.uid(),clock_timestamp(),array[wait.id]);
  v_status:=private.advance_dependency_update_request_v1(c.organization_id,c.request_id);
  select * into strict r from public.work_continuation_requests where id=p_update_id;
  return jsonb_build_object('updateId',r.id,'updateStatus',r.status,'updateRevision',r.revision,'candidateId',c.id,'candidateState',c.state,
   'reason',v_reason,'milestoneId',milestone,'replayed',false);
 end if;

 -- The whole update.
 select * into strict r from public.work_continuation_requests where id=p_update_id for update;
 if r.kind<>'dependency_update' then raise exception 'work_update_not_found' using errcode='P0002'; end if;
 if r.status not in ('open','awaiting_authorization','scheduled','ready') then raise exception 'work_update_not_open' using errcode='55000'; end if;
 if r.revision<>p_expected_revision then raise exception 'work_update_changed' using errcode='40001'; end if;
 for c in select * from public.work_recompute_candidates x where x.organization_id=r.organization_id and x.work_id=r.work_id and x.request_id=r.id
  and x.state in ('awaiting_authorization','scheduled') order by x.created_at,x.id for update loop
  if c.state='awaiting_authorization' then
   select * into wait from public.work_milestones m where m.organization_id=c.organization_id and m.work_id=c.work_id and m.kind='awaiting_human'
    and m.subject_kind='work_recompute_candidate' and m.subject_id=c.id
    and not exists(select 1 from public.work_milestones z where z.organization_id=m.organization_id and z.work_id=m.work_id and z.kind='human_resolved' and z.resolves_milestone_id=m.id);
   if found then
    insert into public.work_milestones(organization_id,work_id,kind,subject_kind,subject_id,label,resolves_milestone_id,created_by,occurred_at,reference_milestone_ids)
    values(c.organization_id,c.work_id,'human_resolved','work_recompute_candidate',c.id,'dependency_recompute_declined',wait.id,auth.uid(),clock_timestamp(),array[wait.id]);
   end if;
  end if;
  update public.work_recompute_candidates set state='declined',reason=v_reason,revision=revision+1 where organization_id=c.organization_id and id=c.id;
  declined:=declined||c.id;
 end loop;
 update private.dependency_recompute_holds set released_at=clock_timestamp() where organization_id=r.organization_id and request_id=r.id and released_at is null;
 get diagnostics released=row_count;
 update public.work_continuation_requests set status='declined',decline_reason=v_reason,revision=revision+1 where organization_id=r.organization_id and id=r.id returning * into r;
 select m.id into proposal from public.work_milestones m where m.organization_id=r.organization_id and m.work_id=r.work_id and m.kind='continuation_proposed'
  and m.subject_kind='work_continuation_request' and m.subject_id=r.id;
 insert into public.work_milestones(id,organization_id,work_id,kind,subject_kind,subject_id,label,revision,outcome,created_by,occurred_at,reference_milestone_ids)
 values(milestone,r.organization_id,r.work_id,'decision','work_continuation_request',r.id,'dependency_update_declined',p_expected_revision,'rejected',
  auth.uid(),clock_timestamp(),case when proposal is null then '{}'::uuid[] else array[proposal] end);
 return jsonb_build_object('updateId',r.id,'updateStatus',r.status,'updateRevision',r.revision,'candidateId',null,'declinedCandidates',to_jsonb(declined),
  'releasedHolds',released,'reason',v_reason,'milestoneId',milestone,'replayed',false);
end $$;

-- 8. The read of a work's updates, for a person who can read the work (the read authority of
-- public.work_milestones): the milestone log and the approved bases the continuation contract reads,
-- the open and the ten most recent closed dependency updates with, per affected execution, the facts
-- that invalidated it, its candidate and the holds that apply with their signal, the candidates with
-- their results and waits, the executions the update left valid, and the recent follow-ups. The
-- private tables stay closed; they are read here under that authority only. Names of sources and
-- assumption fields appear only to a person who can read them.
create function private.work_update_view_v1(p_work_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare w public.capital_projects;c public.agent_conversations;milestones jsonb;bases jsonb;updates jsonb;followups jsonb;
begin
 select * into w from public.capital_projects where id=p_work_id;
 if not found or not private.can_access_capital_project(w.organization_id,w.id) then
  raise exception 'work_continuation_access_denied' using errcode='42501';
 end if;
 c:=private.work_turn_conversation_v1(w.organization_id,w.id,false);
 select coalesce(jsonb_agg(jsonb_build_object('milestoneId',l.milestone_id,'sequence',l.sequence,'kind',l.kind,'subjectKind',l.subject_kind,'subjectId',l.subject_id,
   'label',l.label,'revision',l.revision,'outcome',l.outcome,'references',to_jsonb(l.reference_ids),'createdBy',l.created_by,'occurredAt',l.occurred_at) order by l.sequence),'[]'::jsonb)
 into milestones from private.work_milestone_log_v1(w.organization_id,w.id) l;
 select coalesce(jsonb_agg(jsonb_build_object('milestoneId',b.milestone_id,'decisionId',b.decision_id,'revision',b.revision,'label',b.label,'kind',b.kind) order by b.sequence),'[]'::jsonb)
 into bases from private.work_continuation_bases_v1(w.organization_id,w.id) b;

 with requests as (
  select x.* from public.work_continuation_requests x where x.organization_id=w.organization_id and x.work_id=w.id and x.kind='dependency_update'
   and x.status in ('open','awaiting_authorization','scheduled','ready')
  union all
  select y.* from (select x.* from public.work_continuation_requests x where x.organization_id=w.organization_id and x.work_id=w.id and x.kind='dependency_update'
   and x.status in ('adopted','declined','superseded') order by x.updated_at desc,x.id desc limit 10) y),
 labels as (
  select e.id,private.work_milestone_label_v1(m.payload->>'purpose',m.payload#>>'{method,methodId}') as label,
   (select r.id from public.work_milestones r where r.organization_id=e.organization_id and r.work_id=e.work_id and r.kind='execution_result' and r.subject_kind='work_execution' and r.subject_id=e.id) as result
  from public.work_executions e left join private.execution_manifests m on m.organization_id=e.organization_id and m.execution_id=e.id
  where e.organization_id=w.organization_id and e.work_id=w.id)
 select coalesce(jsonb_agg(u.body order by u.open desc,u.updated_at desc,u.id desc),'[]'::jsonb) into updates from (
  select r.id,r.updated_at,r.status in ('open','awaiting_authorization','scheduled','ready') as open,jsonb_build_object(
   'requestId',r.id,'status',r.status,'revision',r.revision,'createdAt',r.created_at,'updatedAt',r.updated_at,'supersededByRequestId',r.superseded_by_request_id,
   'declineReason',r.decline_reason,
   'proposalMilestoneId',(select m.id from public.work_milestones m where m.organization_id=r.organization_id and m.work_id=r.work_id and m.kind='continuation_proposed'
    and m.subject_kind='work_continuation_request' and m.subject_id=r.id),
   'decision',(select jsonb_build_object('milestoneId',m.id,'kind',m.kind,'outcome',m.outcome,'revision',m.revision,'createdBy',m.created_by,'occurredAt',m.occurred_at)
    from public.work_milestones m where m.organization_id=r.organization_id and m.work_id=r.work_id and m.kind in ('update_adopted','decision')
    and m.subject_kind='work_continuation_request' and m.subject_id=r.id order by m.occurred_at desc,m.id limit 1),
   'events',r.payload->'events',
   'affected',(select coalesce(jsonb_agg(jsonb_build_object('executionId',a.value->>'executionId','rootExecutionId',a.value->>'rootExecutionId',
     'label',lb.label,'resultMilestoneId',coalesce(lb.result::text,a.value->>'resultMilestoneId'),
     'candidateId',(select k.id from public.work_recompute_candidates k where k.organization_id=r.organization_id and k.work_id=r.work_id and k.request_id=r.id
      and (a.value->>'executionId')::uuid=any(k.execution_ids) order by k.created_at desc,k.id desc limit 1),
     'changes',(select coalesce(jsonb_agg(jsonb_build_object('eventId',f.event_id,'dependencyKind',f.dependency_kind,'logicalKey',f.logical_key,'reasonClass',f.reason_class,
       'gap',f.gap,'pinned',f.pinned,'head',f.head,'viaSourceVersionIds',to_jsonb(f.via_source_version_ids),'createdAt',f.created_at,
       'name',case f.dependency_kind
        when 'source_version' then (select v.original_name from public.source_versions v where v.organization_id=f.organization_id
         and v.id=coalesce((f.head->>'versionId')::uuid,(f.pinned->>'versionId')::uuid) and private.can_read_source_version_v1(v.organization_id,v.id))
        when 'assumption_slot' then (select d.field_path from public.adoption_decisions d where d.organization_id=f.organization_id
         and d.id=coalesce((f.head->>'decisionId')::uuid,(f.pinned->>'decisionId')::uuid)
         and private.can_read_assumption_version_v1(f.organization_id,coalesce((f.head->>'versionId')::uuid,(f.pinned->>'versionId')::uuid)))
        when 'method_release' then f.logical_key end) order by f.created_at,f.dependency_kind,f.logical_key,f.event_id),'[]'::jsonb)
      from private.execution_invalidations f where f.organization_id=r.organization_id and f.work_id=r.work_id and f.execution_id=(a.value->>'executionId')::uuid
      and f.event_id in (select (ev.value->>'eventId')::uuid from jsonb_array_elements(r.payload->'events') ev)),
     'holds',(select coalesce(jsonb_agg(jsonb_build_object('kind',h.hold_kind,'signal',h.signal,'subject',h.subject,'createdAt',h.created_at,'releasedAt',h.released_at)
       order by h.created_at,h.id),'[]'::jsonb)
      from private.dependency_recompute_holds h where h.organization_id=r.organization_id and h.request_id=r.id and h.execution_id=(a.value->>'executionId')::uuid))
     order by a.value->>'executionId' collate "C"),'[]'::jsonb)
    from jsonb_array_elements(r.affected_executions) a left join labels lb on lb.id=(a.value->>'executionId')::uuid),
   'candidates',(select coalesce(jsonb_agg(jsonb_build_object('candidateId',k.id,'state',k.state,'reason',k.reason,'action',k.action,'revision',k.revision,
     'maxCostMicrousd',k.max_cost_microusd,'maxModelCalls',k.max_model_calls,'baseExecutionId',k.base_execution_id,
     'baseLabel',(select lb.label from labels lb where lb.id=k.base_execution_id),'executionIds',to_jsonb(k.execution_ids),'executionId',k.execution_id,
     'resultMilestoneId',(select lb.result from labels lb where lb.id=k.execution_id),
     'waitMilestoneId',(select m.id from public.work_milestones m where m.organization_id=k.organization_id and m.work_id=k.work_id and m.kind='awaiting_human'
      and m.subject_kind='work_recompute_candidate' and m.subject_id=k.id),
     'waitOpen',k.state='awaiting_authorization',
     'createdAt',k.created_at,'updatedAt',k.updated_at) order by k.created_at,k.id),'[]'::jsonb)
    from public.work_recompute_candidates k where k.organization_id=r.organization_id and k.work_id=r.work_id and k.request_id=r.id),
   'unaffected',(select coalesce(jsonb_agg(jsonb_build_object('executionId',e.id,'label',lb.label,'resultMilestoneId',lb.result) order by e.created_at,e.id),'[]'::jsonb)
    from public.work_executions e join labels lb on lb.id=e.id
    where e.organization_id=r.organization_id and e.work_id=r.work_id and private.execution_is_live_v1(e.organization_id,e.id) and e.created_at<=r.updated_at
     and not exists(select 1 from jsonb_array_elements(r.affected_executions) a where a.value->>'executionId'=e.id::text)
     and not exists(select 1 from public.work_recompute_candidates k where k.organization_id=r.organization_id and k.request_id=r.id and k.execution_id=e.id))
  ) as body from requests r) u;

 select coalesce(jsonb_agg(jsonb_build_object('requestId',f.id,'status',f.status,'createdAt',f.created_at,'createdBy',f.created_by,
   'request',f.payload#>>'{objective,request}','baseMilestoneId',f.payload#>>'{objective,baseMilestoneId}','baseDecisionId',f.payload#>>'{objective,baseDecisionId}',
   'baseRevision',(f.payload#>>'{objective,baseRevision}')::integer,
   'milestoneId',(select m.id from public.work_milestones m where m.organization_id=f.organization_id and m.kind='continuation_proposed'
    and m.subject_kind='work_continuation_request' and m.subject_id=f.id)) order by f.created_at desc,f.id desc),'[]'::jsonb)
 into followups from (select x.* from public.work_continuation_requests x where x.organization_id=w.organization_id and x.work_id=w.id and x.kind='user_followup'
  order by x.created_at desc,x.id desc limit 10) f;

 return jsonb_build_object('schemaVersion','work-update-view.v1','workId',w.id,'conversationId',c.id,'milestones',milestones,'bases',bases,
  'updates',updates,'followups',followups);
end $$;

-- 9. The public entries: security invoker wrappers over the private cores.
create function public.request_work_continuation_v1(p_request_id uuid,p_work_id uuid,p_locale text,p_content text,
 p_base_milestone_id uuid,p_base_decision_id uuid,p_base_revision integer) returns jsonb
language sql security invoker set search_path='' as $$
 select private.request_work_continuation_v1(p_request_id,p_work_id,p_locale,p_content,p_base_milestone_id,p_base_decision_id,p_base_revision);
$$;
create function public.adopt_work_update_v1(p_command_id uuid,p_update_id uuid,p_expected_revision integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.adopt_work_update_v1(p_command_id,p_update_id,p_expected_revision); $$;
create function public.authorize_work_update_v1(p_command_id uuid,p_candidate_id uuid,p_expected_revision integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.authorize_work_update_v1(p_command_id,p_candidate_id,p_expected_revision); $$;
create function public.decline_work_update_v1(p_command_id uuid,p_update_id uuid,p_expected_revision integer,p_reason text,p_candidate_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.decline_work_update_v1(p_command_id,p_update_id,p_expected_revision,p_reason,p_candidate_id); $$;
create function public.work_update_view_v1(p_work_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.work_update_view_v1(p_work_id); $$;

-- 10. Grants: the five entries and their cores to authenticated only; every helper closed to every
-- API role.
do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='private' and p.proname in ('validate_work_milestone_references_v1','work_milestone_references_v1','work_milestone_log_v1','work_continuation_bases_v1',
   'guard_work_continuation_decline_reason_v1','require_work_continuation_authority_v1','lock_work_for_continuation_v1','work_command_milestone_id_v1',
   'work_turn_conversation_v1','request_work_continuation_v1','adopt_work_update_v1','authorize_work_update_v1','decline_work_update_v1','work_update_view_v1'))
 or (n.nspname='public' and p.proname in ('request_work_continuation_v1','adopt_work_update_v1','authorize_work_update_v1','decline_work_update_v1','work_update_view_v1'))
 loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname in ('request_work_continuation_v1','adopt_work_update_v1','authorize_work_update_v1','decline_work_update_v1','work_update_view_v1') then
   execute format('grant execute on function %s to authenticated',f.signature);
  end if;
 end loop;
end $$;

comment on column public.work_milestones.reference_milestone_ids is 'Earlier milestones of the same work this milestone is about, validated on insert: the base of a continuation, the wait an authorization or decline resolves, the results an adoption adopts and the results they replace. The continuation contract reads these, then resolves_milestone_id and supersedes_milestone_id (private.work_milestone_references_v1).';
comment on column public.work_milestones.outcome is 'execution_result: succeeded or partial. decision: approved or rejected; the approvals projected by increment 2 carry none and are approvals. update_adopted: approved. Every other kind: none.';
comment on column public.work_continuation_requests.decline_reason is 'The reason code a person gave when declining the update (person_declined:<code>), written once with the transition to declined. Null for requests the system ended.';
comment on table public.work_continuation_requests is 'Continuation requests of a work. dependency_update: opened or merged by the outbox consumer, at most one open per work, payload dependency-update-request.v1 with the fingerprint of packages/work-plan/src/continuation.ts, affected executions with their root and result milestone; adopted, authorized or declined by a person through adopt_work_update_v1, authorize_work_update_v1 and decline_work_update_v1. user_followup: a person''s follow-up from an explicit approved base, written by request_work_continuation_v1 with payload work-followup-request.v1. Readable by whoever can read the work; no client insert, update or delete; the status only moves forward.';
comment on table public.work_milestones is 'Immutable milestones of a work. execution_result by the execution commit transaction; decision by the transaction that accepts an execution brief dispatch, confirms a capital project artifact or approves an institutional model configuration, and by the commands that authorize or decline an update; awaiting_human by the recompute planner; human_resolved by the commands that authorize or decline a waiting candidate; continuation_proposed by the outbox consumer (dependency update) and by request_work_continuation_v1 (follow-up); update_adopted by adopt_work_update_v1. Readable by whoever can read the work; no client insert, update or delete.';
