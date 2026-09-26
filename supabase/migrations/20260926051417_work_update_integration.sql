-- Stage 18, increment 5C: the seams between increments 3B, 4 and 5A.
--
-- 1. Adoption covers every dependent. The results of the institutional model get the result
--    milestone the execution results already have (kind execution_result, subject
--    institutional_model_result), through the single mapping of increment 2 and its backfill.
--    Adopting a ready update adopts its settled execution and institutional candidates in one act:
--    update_adopted references the new results of both kinds, then the results they replace. A
--    recomputed institutional result no longer supersedes anything when it completes: the work's
--    current institutional result becomes the adopted one only through the adoption, which marks
--    the results it replaces as previous (stored, readable, identifiable by superseded_by and by the
--    milestone). The institutional readers show as current only an established result: one a person
--    requested, or a recomputation whose update was adopted.
-- 2. Decline stops what it declines. Declining an update, or one candidate (waiting or scheduled, of
--    either kind), cancels its queued or leased jobs through the path of the authority sweep (status
--    cancelled, capability and lease cleared, last_error {"reason":"person_declined"}, the run
--    cancelled when no live job is left), so no result is written after the decline. The decline
--    locks those jobs before the project row and the work lock, the order in which every worker path
--    that commits a result or ends a job holds them, so a worker and a decline serialize without a
--    cycle: whichever takes the job first wins.
-- 3. A follow-up ends. A user_followup is fulfilled by the next execution a person requests in the
--    same work whose objectives cite its text (private.work_followup_executions records the execution
--    and the base it continues from): open to scheduled; ready when that execution commits its
--    result; adopted when a person adopts that result as the new base (adopt_work_update_v1); or
--    declined by a person with a reason (decline_work_update_v1).
-- 4. One lock order for the approval. The approve-and-calculate command takes the project row for no
--    key update (a text patch), and its graph step leaves no trace, and holds no lock, when it does
--    not queue the approval's own result, so the message-backed fallback never upgrades the project
--    row while it holds a work lock.
--
-- No public table, column or RPC is added; the public wrappers of increment 4 keep their signatures.
set search_path='';
-- The trigger swap locks private.institutional_model_results and the view is replaced: fail fast
-- instead of queueing behind a long transaction, as 3A did.
set local lock_timeout = '5s';

-- 0. The bodies restated in full below are pinned to the ones they replace (md5 of pg_proc.prosrc):
-- a parallel change stops this migration instead of being overwritten.
do $$begin
 if (select md5(prosrc) from pg_proc where oid='private.adopt_work_update_v1(uuid,uuid,integer)'::regprocedure)<>'9d45abb04fec8baf6893c443bdcf3196' then
  raise exception 'work_update_adoption_contract_changed';
 end if;
 if (select md5(prosrc) from pg_proc where oid='private.decline_work_update_v1(uuid,uuid,integer,text,uuid)'::regprocedure)<>'75cfe5474645c97bec9e3f1540aad0a6' then
  raise exception 'work_update_decline_contract_changed';
 end if;
 if (select md5(prosrc) from pg_proc where oid='private.work_update_view_v1(uuid)'::regprocedure)<>'3128f3ab2c274fc18b4f7c2ba49b4f52' then
  raise exception 'work_update_view_contract_changed';
 end if;
 if (select md5(prosrc) from pg_proc where oid='private.institutional_approval_through_graph_v1(uuid,uuid,uuid,uuid)'::regprocedure)<>'bf2115e2bc25f0df7293ad539e015f39' then
  raise exception 'institutional_approval_graph_contract_changed';
 end if;
end $$;

-- 1. The result milestone of an institutional result, from the single mapping of increment 2. The
-- mapping is extended by one branch; the four branches it had stay as they were.
do $contract$begin
 if position('institutional_model_configurations' in pg_get_viewdef('private.work_milestone_sources_v1'::regclass))=0
 or position('institutional_model_results' in pg_get_viewdef('private.work_milestone_sources_v1'::regclass))>0 then
  raise exception 'work_milestone_sources_contract_changed';
 end if;
end $contract$;
create or replace view private.work_milestone_sources_v1 with (security_invoker=true) as
select 'execution_result_receipts'::text as origin_table,r.id as origin_row_id,e.organization_id,e.work_id,
 'execution_result'::text as kind,'work_execution'::text as subject_kind,e.id as subject_id,
 private.work_milestone_label_v1(m.payload->>'purpose',m.payload#>>'{method,methodId}') as label,
 null::integer as revision,r.result_fingerprint as version_fingerprint,r.outcome,p.user_id as created_by,r.created_at as occurred_at,
 null::text as line_key
from private.execution_result_receipts r
join public.work_executions e on e.organization_id=r.organization_id and e.id=r.execution_id
join private.execution_manifests m on m.organization_id=e.organization_id and m.execution_id=e.id
join private.principals p on p.organization_id=e.organization_id and p.id=e.principal_id
union all
select 'capital_project_execution_brief_dispatches',d.id,d.organization_id,d.capital_project_id,
 'decision','execution_brief',d.execution_brief_id,
 private.work_milestone_label_v1(b.objective,'execution_brief'),
 d.approved_brief_version,d.approved_brief_fingerprint,null,d.accepted_by,d.accepted_at,
 'execution_brief'
from public.capital_project_execution_brief_dispatches d
join public.capital_project_execution_briefs b on b.organization_id=d.organization_id and b.id=d.execution_brief_id
where d.accepted_at is not null
union all
select 'capital_project_artifact_decisions',x.id,x.organization_id,x.capital_project_id,
 'decision','capital_project_artifact',x.artifact_id,
 private.work_milestone_label_v1(a.artifact_type,'capital_project_artifact'),
 a.artifact_version,x.artifact_fingerprint,null,x.decided_by,x.decided_at,
 'capital_project_artifact:'||a.artifact_type
from public.capital_project_artifact_decisions x
join public.capital_project_artifacts a on a.organization_id=x.organization_id and a.id=x.artifact_id
where x.decision='confirm'
union all
select 'institutional_model_configurations',c.id,c.organization_id,c.capital_project_id,
 'decision','institutional_model_configuration',c.id,
 'institutional_model_configuration',c.revision,c.configuration_fingerprint,null,c.reviewed_by,c.reviewed_at,
 'institutional_model_configuration'
from private.institutional_model_configurations c
where c.status='approved'
union all
-- A completed institutional result: the result of the deterministic calculation a person requested
-- or a recomputation produced, fingerprinted by its artifact.
select 'institutional_model_results',r.id,r.organization_id,r.capital_project_id,
 'execution_result','institutional_model_result',r.id,
 'institutional_model_result',null::integer,
 case when r.artifact->>'fingerprint' ~ '^[a-f0-9]{64}$' then r.artifact->>'fingerprint' else private.institutional_config_hash(r.artifact) end,
 'succeeded',r.requested_by,r.produced_at,
 null::text
from private.institutional_model_results r
where r.status='completed';
revoke all on private.work_milestone_sources_v1 from public,anon,authenticated,service_role;

-- In the transaction that completes the result, as the execution commit writes its own.
create function private.project_institutional_result_milestone_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform private.write_work_milestone_v1('institutional_model_results',new.id);
 return null;
end $$;
create trigger institutional_results_milestone after update of status on private.institutional_model_results for each row
 when (old.status='queued' and new.status='completed') execute function private.project_institutional_result_milestone_v1();

-- 2. A recomputed result supersedes nothing when it completes; the adoption does it (section 4). A
-- result a person requested keeps the invariant of the canonical revisions.
do $contract$begin
 if not exists(select 1 from pg_trigger t where t.tgrelid='private.institutional_model_results'::regclass and t.tgname='institutional_result_supersedes'
  and t.tgfoid='private.supersede_previous_institutional_results()'::regprocedure and not t.tgisinternal) then
  raise exception 'institutional_result_supersession_contract_changed';
 end if;
end $contract$;
drop trigger institutional_result_supersedes on private.institutional_model_results;
create trigger institutional_result_supersedes after update on private.institutional_model_results for each row
 when (old.status='queued' and new.status='completed' and new.canonical_revision_id is not null and new.recompute_candidate_id is null)
 execute function private.supersede_previous_institutional_results();

-- 3. What the institutional view may show as current: a result a person requested, or a recomputation
-- whose update a person adopted. A recomputation not adopted (pending, declined, superseded) stays
-- stored and is never current.
create function private.institutional_result_established_v1(p_org uuid,p_result uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.institutional_model_results r where r.organization_id=p_org and r.id=p_result
  and (r.recompute_candidate_id is null or exists(select 1 from public.institutional_recompute_candidates c
   join public.work_continuation_requests q on q.organization_id=c.organization_id and q.id=c.request_id
   where c.organization_id=r.organization_id and c.id=r.recompute_candidate_id and c.state='settled' and q.status='adopted')));
$$;

-- The result view (the download gate) reads its latest result and its comparisons among established
-- results only.
do $patch$
declare body text;needle text;
begin
 body:=pg_get_functiondef('private.read_institutional_model_results_v1(uuid)'::regprocedure);
 needle:=' select * into r from private.institutional_model_results where organization_id=org_id and capital_project_id=p_project_id order by created_at desc,id desc limit 1;';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_result_reader_contract_changed'; end if;
 body:=replace(body,needle,' select * into r from private.institutional_model_results x where x.organization_id=org_id and x.capital_project_id=p_project_id'
  ||' and private.institutional_result_established_v1(x.organization_id,x.id) order by x.created_at desc,x.id desc limit 1;');
 needle:=' where history.organization_id=org_id and history.capital_project_id=p_project_id';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_result_reader_contract_changed'; end if;
 body:=replace(body,needle,needle||' and private.institutional_result_established_v1(history.organization_id,history.id)');
 execute body;
end $patch$;
-- The revision history marks as current only an established result.
do $patch$
declare body text;needle text;
begin
 body:=pg_get_functiondef('private.read_project_revision_history_v1(uuid)'::regprocedure);
 needle:='''isCurrent'', v.id = latest.id and h.superseded_by is null and h.status = ''completed'',';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_revision_history_contract_changed'; end if;
 body:=replace(body,needle,'''isCurrent'', v.id = latest.id and h.superseded_by is null and h.status = ''completed'' and private.institutional_result_established_v1(h.organization_id, h.id),');
 execute body;
end $patch$;

-- 4. Follow-ups: the execution a follow-up led to and the base it continues from. One row per
-- follow-up and execution, immutable, closed to every API role. Written only by the trigger below.
create table private.work_followup_executions (
 id uuid primary key default gen_random_uuid(),
 -- Order of the executions of one follow-up; the newest is the one it currently leads to.
 sequence bigint generated always as identity,
 organization_id uuid not null references public.organizations(id),
 work_id uuid not null,
 request_id uuid not null,
 execution_id uuid not null,
 base_milestone_id uuid not null,
 base_decision_id uuid not null,
 base_revision integer not null check(base_revision>0),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 constraint work_followup_executions_sequence_key unique(sequence),
 constraint work_followup_executions_key unique(organization_id,request_id,execution_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,work_id,request_id) references public.work_continuation_requests(organization_id,work_id,id),
 foreign key(organization_id,execution_id) references public.work_executions(organization_id,id)
 -- The base is the one the follow-up named, validated when the follow-up was recorded. No foreign key
 -- to the milestones: their truncate guard stays the first refusal a truncation meets.
);
create index work_followup_executions_execution_idx on private.work_followup_executions(organization_id,execution_id);
create index work_followup_executions_request_idx on private.work_followup_executions(organization_id,request_id,sequence);
create index work_followup_executions_actor_idx on private.work_followup_executions(created_by);
alter table private.work_followup_executions enable row level security;
alter table private.work_followup_executions force row level security;
revoke all on private.work_followup_executions from public,anon,authenticated,service_role;
revoke all on sequence private.work_followup_executions_sequence_seq from public,anon,authenticated,service_role;
create policy work_followup_executions_deny_clients on private.work_followup_executions as restrictive for all to anon,authenticated using(false) with check(false);
create trigger work_followup_executions_immutable before update or delete on private.work_followup_executions for each row execute function private.reject_work_continuity_mutation_v1();
create trigger work_followup_executions_truncate_guard before truncate on private.work_followup_executions for each statement execute function private.reject_work_continuity_mutation_v1();
create trigger work_followup_executions_updated before update on private.work_followup_executions for each row execute function private.set_updated_at();

-- A follow-up is cited by an objective that carries its text: the same words, whatever the spacing
-- or the case.
create function private.work_followup_citation_v1(p_text text) returns text
language sql immutable set search_path='' as $$
 select lower(btrim(regexp_replace(coalesce(p_text,''),'\s+',' ','g')));
$$;

-- The follow-ups an execution fulfils: the person's own request (the session is the execution's
-- requesting human, so a recomputation the worker submits for that person never fulfils one) whose
-- objectives cite the text of an open follow-up of the same work, or of a scheduled one whose
-- execution ended without a result. Runs after the input snapshot, in the request's transaction,
-- which already holds the project row: the work lock comes after it, in the global order.
create function private.fulfil_work_followups_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare e public.work_executions;requester uuid;cited text[];f public.work_continuation_requests;current_link private.work_followup_executions;
begin
 if jsonb_typeof(new.payload#>'{decision,review,composition,objectives}') is distinct from 'array' then return null; end if;
 select * into e from public.work_executions x where x.organization_id=new.organization_id and x.id=new.execution_id;
 select p.user_id into requester from private.principals p where p.organization_id=e.organization_id and p.id=e.principal_id and p.kind='human';
 if requester is null or requester is distinct from auth.uid() then return null; end if;
 cited:=array(select distinct private.work_followup_citation_v1(o.value) from jsonb_array_elements_text(new.payload#>'{decision,review,composition,objectives}') o(value)
  where btrim(o.value)<>'');
 if cardinality(cited)=0 or not exists(select 1 from public.work_continuation_requests x where x.organization_id=e.organization_id and x.work_id=e.work_id
  and x.kind='user_followup' and x.status in ('open','scheduled') and private.work_followup_citation_v1(x.payload#>>'{objective,request}')=any(cited)) then
  return null;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('work-continuation:'||e.organization_id::text||':'||e.work_id::text,0));
 for f in select * from public.work_continuation_requests x where x.organization_id=e.organization_id and x.work_id=e.work_id and x.kind='user_followup'
  and x.status in ('open','scheduled') and private.work_followup_citation_v1(x.payload#>>'{objective,request}')=any(cited)
  order by x.created_at,x.id for update
 loop
  if f.status='scheduled' then
   select * into current_link from private.work_followup_executions l where l.organization_id=f.organization_id and l.request_id=f.id
    order by l.sequence desc limit 1;
   if current_link.id is not null and private.execution_is_live_v1(f.organization_id,current_link.execution_id) then continue; end if;
  end if;
  insert into private.work_followup_executions(organization_id,work_id,request_id,execution_id,base_milestone_id,base_decision_id,base_revision,created_by)
  values(f.organization_id,f.work_id,f.id,e.id,(f.payload#>>'{objective,baseMilestoneId}')::uuid,(f.payload#>>'{objective,baseDecisionId}')::uuid,
   (f.payload#>>'{objective,baseRevision}')::integer,requester);
  update public.work_continuation_requests set status='scheduled',revision=revision+1 where organization_id=f.organization_id and id=f.id;
 end loop;
 return null;
end $$;
create trigger execution_input_snapshots_work_followup after insert on private.execution_input_snapshots for each row execute function private.fulfil_work_followups_v1();

-- A scheduled follow-up is ready when the execution it currently leads to commits its result, in the
-- commit transaction, under the work lock the settlement of 3B takes there too.
create function private.advance_work_followups_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare l private.work_followup_executions;f public.work_continuation_requests;
begin
 for l in select * from private.work_followup_executions x where x.organization_id=new.organization_id and x.execution_id=new.execution_id order by x.sequence loop
  perform pg_advisory_xact_lock(hashtextextended('work-continuation:'||l.organization_id::text||':'||l.work_id::text,0));
  select * into f from public.work_continuation_requests where organization_id=l.organization_id and id=l.request_id for update;
  if f.status='scheduled' and not exists(select 1 from private.work_followup_executions y where y.organization_id=l.organization_id and y.request_id=l.request_id
   and y.sequence>l.sequence) then
   update public.work_continuation_requests set status='ready',revision=revision+1 where organization_id=f.organization_id and id=f.id;
  end if;
 end loop;
 return null;
end $$;
create trigger execution_result_receipts_work_followup after insert on private.execution_result_receipts for each row execute function private.advance_work_followups_v1();

-- 5. Adoption. A ready dependency update adopts every settled candidate of both kinds in one act; a
-- ready follow-up adopts the result of the execution it led to as the new base. update_adopted records
-- the decision (approved, on the revision the person saw) and references the new results, then what
-- they replace: for an update, the results of the executions and institutional results the candidates
-- cover; for a follow-up, the base it continues (so the adoption replaces that base). The adoption is
-- the only act that makes a recomputed institutional result current: every result it replaces, and
-- every older completed result of an earlier canonical revision (the invariant a completion applies to
-- a result a person requested), is marked as previous. Nothing else earlier changes.
create or replace function private.adopt_work_update_v1(p_command_id uuid,p_update_id uuid,p_expected_revision integer) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r public.work_continuation_requests;existing public.work_milestones;milestone uuid;adopted uuid[];replaced uuid[];link private.work_followup_executions;
 v_base uuid;v_label text;k record;n bigint;superseded bigint:=0;
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
 if r.kind not in ('dependency_update','user_followup') then raise exception 'work_update_not_found' using errcode='P0002'; end if;
 if r.status<>'ready' then raise exception 'work_update_not_ready' using errcode='55000'; end if;
 if r.revision<>p_expected_revision then raise exception 'work_update_changed' using errcode='40001'; end if;

 if r.kind='user_followup' then
  select * into link from private.work_followup_executions l where l.organization_id=r.organization_id and l.request_id=r.id order by l.sequence desc limit 1;
  adopted:=array(select m.id from public.work_milestones m where m.organization_id=r.organization_id and m.work_id=r.work_id and m.kind='execution_result'
   and m.subject_kind='work_execution' and m.subject_id=link.execution_id);
  if link.id is null or cardinality(adopted)=0 then raise exception 'work_update_result_missing' using errcode='55000'; end if;
  -- The base the follow-up continues must still be an approved base: otherwise the adoption would
  -- continue a line a later decision already replaced.
  v_base:=(r.payload#>>'{objective,baseMilestoneId}')::uuid;
  if not exists(select 1 from private.work_continuation_bases_v1(r.organization_id,r.work_id) b where b.milestone_id=v_base) then
   raise exception 'work_continuation_base_superseded' using errcode='40001';
  end if;
  replaced:=array[v_base];
  select p.label into v_label from public.work_milestones p where p.organization_id=r.organization_id and p.work_id=r.work_id and p.kind='continuation_proposed'
   and p.subject_kind='work_continuation_request' and p.subject_id=r.id;
  update public.work_continuation_requests set status='adopted',revision=revision+1 where organization_id=r.organization_id and id=r.id returning * into r;
  insert into public.work_milestones(id,organization_id,work_id,kind,subject_kind,subject_id,label,revision,outcome,created_by,occurred_at,reference_milestone_ids)
  values(milestone,r.organization_id,r.work_id,'update_adopted','work_continuation_request',r.id,coalesce(v_label,'user_followup'),p_expected_revision,'approved',
   auth.uid(),clock_timestamp(),adopted||replaced);
  return jsonb_build_object('updateId',r.id,'status',r.status,'revision',r.revision,'milestoneId',milestone,'references',to_jsonb(adopted||replaced),
   'adoptedResults',to_jsonb(adopted),'replacedResults','[]'::jsonb,'continuesFrom',v_base,'supersededResults',0,'replayed',false);
 end if;

 -- The results of the settled candidates, executions then institutional results, each in the order of
 -- their candidates; then the results of what they cover.
 adopted:=array(select m.id from public.work_recompute_candidates c join public.work_milestones m on m.organization_id=c.organization_id and m.work_id=c.work_id
  and m.kind='execution_result' and m.subject_kind='work_execution' and m.subject_id=c.execution_id
  where c.organization_id=r.organization_id and c.work_id=r.work_id and c.request_id=r.id and c.state='settled' order by c.created_at,c.id)
  ||array(select m.id from public.institutional_recompute_candidates c join public.work_milestones m on m.organization_id=c.organization_id and m.work_id=c.work_id
  and m.kind='execution_result' and m.subject_kind='institutional_model_result' and m.subject_id=c.result_id
  where c.organization_id=r.organization_id and c.work_id=r.work_id and c.request_id=r.id and c.state='settled' order by c.sequence);
 if cardinality(adopted)=0 then raise exception 'work_update_result_missing' using errcode='55000'; end if;
 replaced:=array(select x.id from (select distinct on (m.id) m.id,c.created_at,c.id as candidate,e.id as execution
   from public.work_recompute_candidates c cross join unnest(c.execution_ids) e(id)
   join public.work_milestones m on m.organization_id=c.organization_id and m.work_id=c.work_id and m.kind='execution_result' and m.subject_kind='work_execution' and m.subject_id=e.id
   where c.organization_id=r.organization_id and c.work_id=r.work_id and c.request_id=r.id and c.state='settled' and not (m.id=any(adopted))
   order by m.id,c.created_at,c.id,e.id) x order by x.created_at,x.candidate,x.execution)
  ||array(select x.id from (select distinct on (m.id) m.id,c.sequence,res.position
   from public.institutional_recompute_candidates c cross join unnest(c.result_ids) with ordinality res(id,position)
   join public.work_milestones m on m.organization_id=c.organization_id and m.work_id=c.work_id and m.kind='execution_result' and m.subject_kind='institutional_model_result'
    and m.subject_id=res.id
   where c.organization_id=r.organization_id and c.work_id=r.work_id and c.request_id=r.id and c.state='settled' and not (m.id=any(adopted))
   order by m.id,c.sequence,res.position) x order by x.sequence,x.position);
 update public.work_continuation_requests set status='adopted',revision=revision+1 where organization_id=r.organization_id and id=r.id returning * into r;
 insert into public.work_milestones(id,organization_id,work_id,kind,subject_kind,subject_id,label,revision,outcome,created_by,occurred_at,reference_milestone_ids)
 values(milestone,r.organization_id,r.work_id,'update_adopted','work_continuation_request',r.id,'dependency_update_adopted',p_expected_revision,'approved',
  auth.uid(),clock_timestamp(),adopted||replaced);
 for k in select c.result_id,c.result_ids,x.created_at,x.canonical_revision_id from public.institutional_recompute_candidates c
  join private.institutional_model_results x on x.organization_id=c.organization_id and x.id=c.result_id
  where c.organization_id=r.organization_id and c.work_id=r.work_id and c.request_id=r.id and c.state='settled' order by c.sequence
 loop
  update private.institutional_model_results h set superseded_by=k.result_id
  where h.organization_id=r.organization_id and h.capital_project_id=r.work_id and h.id<>k.result_id and h.status='completed' and h.superseded_by is null
   and (h.id=any(k.result_ids) or ((h.created_at,h.id)<(k.created_at,k.result_id) and h.canonical_revision_id is distinct from k.canonical_revision_id));
  get diagnostics n=row_count;
  superseded:=superseded+n;
 end loop;
 return jsonb_build_object('updateId',r.id,'status',r.status,'revision',r.revision,'milestoneId',milestone,'references',to_jsonb(adopted||replaced),
  'adoptedResults',to_jsonb(adopted),'replacedResults',to_jsonb(replaced),'supersededResults',superseded,'replayed',false);
end $$;

-- 6. Decline. The live jobs a decline stops: the jobs of the executions its scheduled execution
-- candidates produced and the jobs of its scheduled institutional candidates (one candidate, or every
-- open candidate of the update).
create function private.work_update_declinable_jobs_v1(p_org uuid,p_request uuid,p_candidate uuid) returns uuid[]
language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(x.id order by x.id),'{}'::uuid[]) from (
  select j.id from public.work_recompute_candidates c
  join public.processing_jobs j on j.organization_id=c.organization_id and j.execution_id=c.execution_id and j.kind='work_execution'
  where c.organization_id=p_org and c.request_id=p_request and c.state='scheduled' and c.execution_id is not null and (p_candidate is null or c.id=p_candidate)
   and j.status in ('queued','leased','awaiting_approval')
  union
  select j.id from public.institutional_recompute_candidates c
  join private.institutional_model_results r on r.organization_id=c.organization_id and r.id=c.result_id
  join public.processing_jobs j on j.organization_id=r.organization_id and j.intake_session_id=r.intake_session_id and j.kind='agent_operation_brief'
   and j.payload->>'institutional_recompute_candidate_id'=c.id::text
  where c.organization_id=p_org and c.request_id=p_request and c.state='scheduled' and (p_candidate is null or c.id=p_candidate)
   and j.status in ('queued','leased','awaiting_approval')) x;
$$;

-- Jobs that appeared after the decline locked its jobs (an execution the worker submitted meanwhile)
-- are locked without waiting: the decline holds the work lock by then, and waiting there could close
-- a cycle with a worker that holds the job and needs the work lock. A busy job refuses the decline,
-- which the person repeats.
create function private.lock_new_declinable_jobs_v1(p_org uuid,p_jobs uuid[],p_locked uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.processing_jobs where organization_id=p_org and id=any(p_jobs) and not (id=any(p_locked)) order by id for update nowait;
exception when lock_not_available then
 raise exception 'work_update_job_busy' using errcode='55000';
end $$;

-- The cancellation path of the authority sweep: the same states and the same shape of last_error,
-- with the person's decline as the reason; the run ends cancelled when no live job is left in it.
create function private.cancel_declined_jobs_v1(p_org uuid,p_jobs uuid[]) returns integer
language plpgsql security definer set search_path='' as $$
declare cancelled integer;
begin
 update public.processing_jobs set status='cancelled',capability_sha256=null,lease_expires_at=null,leased_by=null,
  last_error=jsonb_build_object('reason','person_declined'),updated_at=clock_timestamp()
 where organization_id=p_org and id=any(p_jobs) and status in ('queued','leased','awaiting_approval');
 get diagnostics cancelled=row_count;
 update public.processing_runs r set status='cancelled',completed_at=clock_timestamp(),error=jsonb_build_object('reason','person_declined'),updated_at=clock_timestamp()
 where r.organization_id=p_org and r.status in ('queued','running')
  and exists(select 1 from public.processing_jobs j where j.organization_id=r.organization_id and j.processing_run_id=r.id and j.id=any(p_jobs))
  and not exists(select 1 from public.processing_jobs j where j.organization_id=r.organization_id and j.processing_run_id=r.id and j.status in ('queued','leased','awaiting_approval'));
 return cancelled;
end $$;

-- A person declines an open, waiting, scheduled or ready update or follow-up, or one candidate of an
-- update that waits for authorization or is scheduled, of either kind. What it declines ends declined
-- with the person's reason and a decision milestone with outcome rejected; every wait it closes gets
-- its human_resolved; the holds of a declined update are released; and the queued or leased jobs of
-- what it declines are cancelled before the decline commits, so nothing it declined writes a result
-- afterwards. A candidate is declined before its job is cancelled, so the settlement triggers of 3B
-- and 5A find it closed and do nothing. Settled candidates and the results already committed stay as
-- they are: they are not adopted and never become current. A follow-up's execution is the person's
-- own request and is not cancelled.
create or replace function private.decline_work_update_v1(p_command_id uuid,p_update_id uuid,p_expected_revision integer,p_reason text,p_candidate_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r public.work_continuation_requests;c public.work_recompute_candidates;ic public.institutional_recompute_candidates;existing public.work_milestones;milestone uuid;
 wait public.work_milestones;v_reason text;v_subject text;v_state text;v_revision integer;proposal uuid;declined uuid[]:='{}';released bigint;n bigint;
 locked uuid[];jobs uuid[];cancelled integer:=0;
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
  if found then
   if c.organization_id<>r.organization_id or c.request_id<>r.id then raise exception 'work_continuation_access_denied' using errcode='42501'; end if;
   v_subject:='work_recompute_candidate';
  else
   select * into ic from public.institutional_recompute_candidates where id=p_candidate_id;
   if not found or ic.organization_id<>r.organization_id or ic.request_id<>r.id then raise exception 'work_continuation_access_denied' using errcode='42501'; end if;
   v_subject:='institutional_recompute_candidate';
  end if;
 end if;
 -- The authority check without any lock first, so a person without authority never waits and never
 -- locks a job; then the live jobs this decline stops, before the project row and the work lock.
 if auth.uid() is null or not private.evaluate_resource_policy_v1(r.organization_id,r.work_id,auth.uid(),'work','analysis') then
  raise exception 'work_continuation_access_denied' using errcode='42501';
 end if;
 locked:=private.work_update_declinable_jobs_v1(r.organization_id,r.id,p_candidate_id);
 perform 1 from public.processing_jobs where organization_id=r.organization_id and id=any(locked) order by id for update;
 perform private.lock_work_for_continuation_v1(r.organization_id,r.work_id);
 milestone:=private.work_command_milestone_id_v1(r.organization_id,p_command_id);
 select * into existing from public.work_milestones where organization_id=r.organization_id and id=milestone;
 if found then
  if existing.kind<>'decision' or existing.outcome<>'rejected' or existing.revision<>p_expected_revision or existing.created_by is distinct from auth.uid()
  or (p_candidate_id is null and (existing.subject_kind<>'work_continuation_request' or existing.subject_id<>r.id
   or (select x.decline_reason from public.work_continuation_requests x where x.id=r.id) is distinct from v_reason))
  or (p_candidate_id is not null and (existing.subject_kind<>v_subject or existing.subject_id<>p_candidate_id
   or coalesce((select x.reason from public.work_recompute_candidates x where x.id=p_candidate_id),
    (select x.reason from public.institutional_recompute_candidates x where x.id=p_candidate_id)) is distinct from v_reason)) then
   raise exception 'work_update_command_conflict' using errcode='22023';
  end if;
  select * into strict r from public.work_continuation_requests where id=p_update_id;
  return jsonb_build_object('updateId',r.id,'updateStatus',r.status,'updateRevision',r.revision,'candidateId',p_candidate_id,
   'candidateState',coalesce((select x.state from public.work_recompute_candidates x where x.id=p_candidate_id),
    (select x.state from public.institutional_recompute_candidates x where x.id=p_candidate_id)),'reason',v_reason,'milestoneId',existing.id,'replayed',true);
 end if;

 if p_candidate_id is not null then
  -- One candidate: waiting for authorization (an execution candidate) or scheduled (either kind).
  if v_subject='work_recompute_candidate' then
   select * into strict c from public.work_recompute_candidates where id=p_candidate_id for update;
   v_state:=c.state;v_revision:=c.revision;
  else
   select * into strict ic from public.institutional_recompute_candidates where id=p_candidate_id for update;
   v_state:=ic.state;v_revision:=ic.revision;
  end if;
  if v_state not in ('awaiting_authorization','scheduled') then raise exception 'work_update_candidate_not_waiting' using errcode='55000'; end if;
  if v_revision<>p_expected_revision then raise exception 'work_update_changed' using errcode='40001'; end if;
  jobs:=private.work_update_declinable_jobs_v1(r.organization_id,r.id,p_candidate_id);
  perform private.lock_new_declinable_jobs_v1(r.organization_id,jobs,locked);
  if v_state='awaiting_authorization' then
   select * into wait from public.work_milestones m where m.organization_id=c.organization_id and m.work_id=c.work_id and m.kind='awaiting_human'
    and m.subject_kind='work_recompute_candidate' and m.subject_id=c.id;
   if not found or exists(select 1 from public.work_milestones m where m.organization_id=c.organization_id and m.work_id=c.work_id and m.kind='human_resolved' and m.resolves_milestone_id=wait.id) then
    raise exception 'work_update_wait_missing' using errcode='55000';
   end if;
   update public.work_recompute_candidates set state='declined',reason=v_reason,revision=revision+1 where organization_id=c.organization_id and id=c.id;
   insert into public.work_milestones(organization_id,work_id,kind,subject_kind,subject_id,label,resolves_milestone_id,created_by,occurred_at,reference_milestone_ids)
   values(c.organization_id,c.work_id,'human_resolved','work_recompute_candidate',c.id,'dependency_recompute_declined',wait.id,auth.uid(),clock_timestamp(),array[wait.id]);
   insert into public.work_milestones(id,organization_id,work_id,kind,subject_kind,subject_id,label,revision,outcome,created_by,occurred_at,reference_milestone_ids)
   values(milestone,c.organization_id,c.work_id,'decision','work_recompute_candidate',c.id,'dependency_recompute_declined',p_expected_revision,'rejected',
    auth.uid(),clock_timestamp(),array[wait.id]);
  else
   -- A scheduled candidate has no wait: the decision is about a recomputation outside the log and
   -- references nothing.
   if v_subject='work_recompute_candidate' then
    update public.work_recompute_candidates set state='declined',reason=v_reason,revision=revision+1 where organization_id=c.organization_id and id=c.id;
   else
    update public.institutional_recompute_candidates set state='declined',reason=v_reason,revision=revision+1 where organization_id=ic.organization_id and id=ic.id;
   end if;
   insert into public.work_milestones(id,organization_id,work_id,kind,subject_kind,subject_id,label,revision,outcome,created_by,occurred_at,reference_milestone_ids)
   values(milestone,r.organization_id,r.work_id,'decision',v_subject,p_candidate_id,'dependency_recompute_declined',p_expected_revision,'rejected',
    auth.uid(),clock_timestamp(),'{}'::uuid[]);
  end if;
  cancelled:=private.cancel_declined_jobs_v1(r.organization_id,jobs);
  perform private.advance_dependency_update_request_v1(r.organization_id,r.id);
  select * into strict r from public.work_continuation_requests where id=p_update_id;
  return jsonb_build_object('updateId',r.id,'updateStatus',r.status,'updateRevision',r.revision,'candidateId',p_candidate_id,'candidateState','declined',
   'reason',v_reason,'milestoneId',milestone,'cancelledJobs',cancelled,'replayed',false);
 end if;

 -- The whole update or follow-up.
 select * into strict r from public.work_continuation_requests where id=p_update_id for update;
 if r.kind not in ('dependency_update','user_followup') then raise exception 'work_update_not_found' using errcode='P0002'; end if;
 if r.status not in ('open','awaiting_authorization','scheduled','ready') then raise exception 'work_update_not_open' using errcode='55000'; end if;
 if r.revision<>p_expected_revision then raise exception 'work_update_changed' using errcode='40001'; end if;
 jobs:=private.work_update_declinable_jobs_v1(r.organization_id,r.id,null);
 perform private.lock_new_declinable_jobs_v1(r.organization_id,jobs,locked);
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
 for ic in select * from public.institutional_recompute_candidates x where x.organization_id=r.organization_id and x.work_id=r.work_id and x.request_id=r.id
  and x.state='scheduled' order by x.sequence for update loop
  update public.institutional_recompute_candidates set state='declined',reason=v_reason,revision=revision+1 where organization_id=ic.organization_id and id=ic.id;
  declined:=declined||ic.id;
 end loop;
 cancelled:=private.cancel_declined_jobs_v1(r.organization_id,jobs);
 update private.dependency_recompute_holds set released_at=clock_timestamp() where organization_id=r.organization_id and request_id=r.id and released_at is null;
 get diagnostics released=row_count;
 update private.institutional_recompute_holds set released_at=clock_timestamp() where organization_id=r.organization_id and request_id=r.id and released_at is null;
 get diagnostics n=row_count;
 released:=released+n;
 update public.work_continuation_requests set status='declined',decline_reason=v_reason,revision=revision+1 where organization_id=r.organization_id and id=r.id returning * into r;
 select m.id into proposal from public.work_milestones m where m.organization_id=r.organization_id and m.work_id=r.work_id and m.kind='continuation_proposed'
  and m.subject_kind='work_continuation_request' and m.subject_id=r.id;
 insert into public.work_milestones(id,organization_id,work_id,kind,subject_kind,subject_id,label,revision,outcome,created_by,occurred_at,reference_milestone_ids)
 values(milestone,r.organization_id,r.work_id,'decision','work_continuation_request',r.id,
  case when r.kind='user_followup' then 'user_followup_declined' else 'dependency_update_declined' end,p_expected_revision,'rejected',
  auth.uid(),clock_timestamp(),case when proposal is null then '{}'::uuid[] else array[proposal] end);
 return jsonb_build_object('updateId',r.id,'updateStatus',r.status,'updateRevision',r.revision,'candidateId',null,'declinedCandidates',to_jsonb(declined),
  'releasedHolds',released,'cancelledJobs',cancelled,'reason',v_reason,'milestoneId',milestone,'replayed',false);
end $$;

-- 7. The read of a work's updates, as increment 4 defined it, with what increments 5A and 5C add, as
-- new keys only so a reader of the previous shape reads it unchanged: per update, the institutional
-- candidates and, per affected dependent, its kind, its institutional candidate, the facts that
-- invalidated an institutional result and its holds; per follow-up, its revision, the reason of a
-- decline, the execution it led to with the base it continues and that execution's state, and the
-- person's adoption or decline.
create or replace function private.work_update_view_v1(p_work_id uuid) returns jsonb
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
   -- What the web turns into a display name: the catalogue id of the method and, when the execution
   -- pinned a house release, the title the organization published that release under.
   jsonb_build_object('methodId',m.payload#>>'{method,methodId}','houseTitle',(select mr.title from private.execution_dependencies d
     join public.method_releases mr on mr.organization_id=d.organization_id and mr.id=d.house_release_id
     where d.organization_id=e.organization_id and d.execution_id=e.id and d.dependency_kind='method_release' and d.house_release_id is not null
     order by d.created_at desc,d.id desc limit 1)) as method,
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
     'label',lb.label,'method',lb.method,
     'resultMilestoneId',coalesce(lb.result::text,(select m.id::text from public.work_milestones m where m.organization_id=r.organization_id and m.work_id=r.work_id
       and m.kind='execution_result' and m.subject_kind='institutional_model_result' and m.subject_id=(a.value->>'executionId')::uuid),a.value->>'resultMilestoneId'),
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
        when 'method_release' then f.logical_key end,
       -- The premise as the basis records it: its metric and the definition the person adopted, under
       -- the same reading right as the name.
       'premise',case when f.dependency_kind='assumption_slot' then (select jsonb_build_object('fieldPath',d.field_path,'definition',dv.definition)
         from public.adoption_decisions d left join public.definition_versions dv on dv.organization_id=d.organization_id and dv.id=d.definition_version_id
         where d.organization_id=f.organization_id and d.id=coalesce((f.head->>'decisionId')::uuid,(f.pinned->>'decisionId')::uuid)
         and private.can_read_assumption_version_v1(f.organization_id,coalesce((f.head->>'versionId')::uuid,(f.pinned->>'versionId')::uuid))) end,
       'method',case when f.dependency_kind='method_release' then jsonb_build_object('methodId',f.logical_key,'houseTitle',(select mr.title from public.method_releases mr
         where mr.organization_id=f.organization_id and mr.id=coalesce((f.head->>'houseReleaseId')::uuid,(f.pinned->>'houseReleaseId')::uuid))) end)
       order by f.created_at,f.dependency_kind,f.logical_key,f.event_id),'[]'::jsonb)
      from private.execution_invalidations f where f.organization_id=r.organization_id and f.work_id=r.work_id and f.execution_id=(a.value->>'executionId')::uuid
      and f.event_id in (select (ev.value->>'eventId')::uuid from jsonb_array_elements(r.payload->'events') ev)),
     'holds',(select coalesce(jsonb_agg(jsonb_build_object('kind',h.hold_kind,'signal',h.signal,'subject',h.subject,'createdAt',h.created_at,'releasedAt',h.released_at)
       order by h.created_at,h.id),'[]'::jsonb)
      from private.dependency_recompute_holds h where h.organization_id=r.organization_id and h.request_id=r.id and h.execution_id=(a.value->>'executionId')::uuid),
     -- An institutional result as a dependent: its kind, its candidate, its facts and its holds.
     'dependentKind',coalesce(a.value->>'dependentKind','work_execution'),
     'institutionalCandidateId',(select k.id from public.institutional_recompute_candidates k where k.organization_id=r.organization_id and k.work_id=r.work_id
      and k.request_id=r.id and (a.value->>'executionId')::uuid=any(k.result_ids) order by k.sequence desc limit 1),
     'institutionalChanges',(select coalesce(jsonb_agg(jsonb_build_object('eventId',f.event_id,'dependencyKind',f.dependency_kind,'logicalKey',f.logical_key,
       'reasonClass',f.reason_class,'gap',f.gap,'pinned',f.pinned,'head',f.head,'viaSourceVersionIds',to_jsonb(f.via_source_version_ids),'createdAt',f.created_at,
       'name',case when f.dependency_kind='source_version' then (select v.original_name from public.source_versions v where v.organization_id=f.organization_id
         and v.id=coalesce((f.head->>'versionId')::uuid,(f.pinned->>'versionId')::uuid) and private.can_read_source_version_v1(v.organization_id,v.id)) end)
       order by f.created_at,f.dependency_kind,f.logical_key,f.event_id),'[]'::jsonb)
      from private.institutional_result_invalidations f where f.organization_id=r.organization_id and f.work_id=r.work_id and f.result_id=(a.value->>'executionId')::uuid
      and f.event_id in (select (ev.value->>'eventId')::uuid from jsonb_array_elements(r.payload->'events') ev)),
     'institutionalHolds',(select coalesce(jsonb_agg(jsonb_build_object('kind',h.hold_kind,'signal',h.signal,'subject',h.subject,'createdAt',h.created_at,'releasedAt',h.released_at)
       order by h.created_at,h.id),'[]'::jsonb)
      from private.institutional_recompute_holds h where h.organization_id=r.organization_id and h.request_id=r.id and h.result_id=(a.value->>'executionId')::uuid))
     order by a.value->>'executionId' collate "C"),'[]'::jsonb)
    from jsonb_array_elements(r.affected_executions) a left join labels lb on lb.id=(a.value->>'executionId')::uuid),
   'candidates',(select coalesce(jsonb_agg(jsonb_build_object('candidateId',k.id,'state',k.state,'reason',k.reason,'action',k.action,'revision',k.revision,
     'maxCostMicrousd',k.max_cost_microusd,'maxModelCalls',k.max_model_calls,'baseExecutionId',k.base_execution_id,
     'baseLabel',(select lb.label from labels lb where lb.id=k.base_execution_id),'baseMethod',(select lb.method from labels lb where lb.id=k.base_execution_id),'executionIds',to_jsonb(k.execution_ids),'executionId',k.execution_id,
     'resultMilestoneId',(select lb.result from labels lb where lb.id=k.execution_id),
     'waitMilestoneId',(select m.id from public.work_milestones m where m.organization_id=k.organization_id and m.work_id=k.work_id and m.kind='awaiting_human'
      and m.subject_kind='work_recompute_candidate' and m.subject_id=k.id),
     'waitOpen',k.state='awaiting_authorization',
     'createdAt',k.created_at,'updatedAt',k.updated_at) order by k.created_at,k.id),'[]'::jsonb)
    from public.work_recompute_candidates k where k.organization_id=r.organization_id and k.work_id=r.work_id and k.request_id=r.id),
   'institutionalCandidates',(select coalesce(jsonb_agg(jsonb_build_object('candidateId',k.id,'state',k.state,'reason',k.reason,'revision',k.revision,
     'baseResultId',k.base_result_id,'resultIds',to_jsonb(k.result_ids),'resultId',k.result_id,'resultStatus',x.status,
     'resultMilestoneId',(select m.id from public.work_milestones m where m.organization_id=k.organization_id and m.work_id=k.work_id and m.kind='execution_result'
      and m.subject_kind='institutional_model_result' and m.subject_id=k.result_id),
     'current',k.result_id is not null and private.institutional_result_established_v1(k.organization_id,k.result_id) and x.superseded_by is null,
     'createdAt',k.created_at,'updatedAt',k.updated_at) order by k.sequence),'[]'::jsonb)
    from public.institutional_recompute_candidates k left join private.institutional_model_results x on x.organization_id=k.organization_id and x.id=k.result_id
    where k.organization_id=r.organization_id and k.work_id=r.work_id and k.request_id=r.id),
   'unaffected',(select coalesce(jsonb_agg(jsonb_build_object('executionId',e.id,'label',lb.label,'method',lb.method,'resultMilestoneId',lb.result) order by e.created_at,e.id),'[]'::jsonb)
    from public.work_executions e join labels lb on lb.id=e.id
    where e.organization_id=r.organization_id and e.work_id=r.work_id and private.execution_is_live_v1(e.organization_id,e.id) and e.created_at<=r.updated_at
     and not exists(select 1 from jsonb_array_elements(r.affected_executions) a where a.value->>'executionId'=e.id::text)
     and not exists(select 1 from public.work_recompute_candidates k where k.organization_id=r.organization_id and k.request_id=r.id and k.execution_id=e.id))
  ) as body from requests r) u;

 select coalesce(jsonb_agg(jsonb_build_object('requestId',f.id,'status',f.status,'createdAt',f.created_at,'createdBy',f.created_by,
   'request',f.payload#>>'{objective,request}','baseMilestoneId',f.payload#>>'{objective,baseMilestoneId}','baseDecisionId',f.payload#>>'{objective,baseDecisionId}',
   'baseRevision',(f.payload#>>'{objective,baseRevision}')::integer,
   'milestoneId',(select m.id from public.work_milestones m where m.organization_id=f.organization_id and m.kind='continuation_proposed'
    and m.subject_kind='work_continuation_request' and m.subject_id=f.id),
   'revision',f.revision,'updatedAt',f.updated_at,'declineReason',f.decline_reason,
   -- The execution the follow-up currently leads to, the base it continues and where it stands.
   'execution',(select jsonb_build_object('executionId',l.execution_id,'baseMilestoneId',l.base_milestone_id,'baseDecisionId',l.base_decision_id,'baseRevision',l.base_revision,
     'linkedAt',l.created_at,
     'jobStatus',(select j.status from public.processing_jobs j where j.organization_id=l.organization_id and j.execution_id=l.execution_id and j.kind='work_execution'
      order by j.created_at desc,j.id desc limit 1),
     'resultMilestoneId',(select m.id from public.work_milestones m where m.organization_id=l.organization_id and m.work_id=l.work_id and m.kind='execution_result'
      and m.subject_kind='work_execution' and m.subject_id=l.execution_id),
     'method',(select jsonb_build_object('methodId',mf.payload#>>'{method,methodId}','houseTitle',(select mr.title from private.execution_dependencies d
       join public.method_releases mr on mr.organization_id=d.organization_id and mr.id=d.house_release_id
       where d.organization_id=mf.organization_id and d.execution_id=mf.execution_id and d.dependency_kind='method_release' and d.house_release_id is not null
       order by d.created_at desc,d.id desc limit 1))
      from private.execution_manifests mf where mf.organization_id=l.organization_id and mf.execution_id=l.execution_id))
    from private.work_followup_executions l where l.organization_id=f.organization_id and l.request_id=f.id order by l.sequence desc limit 1),
   'decision',(select jsonb_build_object('milestoneId',m.id,'kind',m.kind,'outcome',m.outcome,'revision',m.revision,'createdBy',m.created_by,'occurredAt',m.occurred_at)
    from public.work_milestones m where m.organization_id=f.organization_id and m.work_id=f.work_id and m.kind in ('update_adopted','decision')
    and m.subject_kind='work_continuation_request' and m.subject_id=f.id order by m.occurred_at desc,m.id limit 1)) order by f.created_at desc,f.id desc),'[]'::jsonb)
 into followups from (select x.* from public.work_continuation_requests x where x.organization_id=w.organization_id and x.work_id=w.id and x.kind='user_followup'
  order by x.created_at desc,x.id desc limit 10) f;

 return jsonb_build_object('schemaVersion','work-update-view.v1','workId',w.id,'conversationId',c.id,'milestones',milestones,'bases',bases,
  'updates',updates,'followups',followups);
end $$;

-- 8. The approval's lock order. The approve-and-calculate command took the project row for update
-- and then, in its graph step, the work lock; the 3B planner and settlement hold the work lock and
-- then take the project row for key share through their foreign key checks, which for update blocks:
-- an approval and a planner on the same work could deadlock. The command now takes the row for no key
-- update, as the increment 4 commands do: it still conflicts with the for update of turns and of the
-- execution request, and lets the key share checks through.
do $patch$
declare body text;needle text;
begin
 body:=pg_get_functiondef('private.review_institutional_configuration_and_calculate_v1(uuid,uuid,text,text,text,uuid,text)'::regprocedure);
 needle:=' perform 1 from public.capital_projects where organization_id=c.organization_id and id=p_project_id for update;';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_calculation_lock_contract_changed'; end if;
 body:=replace(body,needle,' perform 1 from public.capital_projects where organization_id=c.organization_id and id=p_project_id for no key update;');
 execute body;
end $patch$;
-- The command approves a candidate under review through private.review_institutional_configuration_v1
-- and its core private.review_institutional_configuration_before_sources_v1, which took the same row
-- for update again inside the command's transaction: the same patch for both, so the whole command
-- holds the row for no key update (measured with two sessions: with either still for update, the
-- planner's key share waits for the approval while the approval waits for the planner's work lock).
do $patch$
declare body text;needle text;
begin
 body:=pg_get_functiondef('private.review_institutional_configuration_v1(uuid,uuid,text,text,text)'::regprocedure);
 needle:=' perform 1 from public.capital_projects where organization_id=org_id and id=p_project_id for update;';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_review_lock_contract_changed'; end if;
 body:=replace(body,needle,' perform 1 from public.capital_projects where organization_id=org_id and id=p_project_id for no key update;');
 execute body;
 body:=pg_get_functiondef('private.review_institutional_configuration_before_sources_v1(uuid,uuid,text,text,text)'::regprocedure);
 needle:=' perform 1 from public.capital_projects where organization_id=c.organization_id and id=p_project_id for update;';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'institutional_review_lock_contract_changed'; end if;
 body:=replace(body,needle,' perform 1 from public.capital_projects where organization_id=c.organization_id and id=p_project_id for no key update;');
 execute body;
end $patch$;

-- The graph step leaves nothing behind when it does not queue the approval's own result: its effect
-- and every lock it took roll back with its subtransaction, and the outbox applies the event later,
-- as when the step fails. The fallback that follows (the message-backed calculation) takes the
-- project row for update through the turn it posts; with no work lock held by then, that upgrade
-- cannot close a cycle with a planner waiting for a work lock.
create or replace function private.institutional_approval_through_graph_v1(p_org uuid,p_work uuid,p_configuration uuid,p_request uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare applied boolean;
begin
 if not private.institutional_update_through_graph_v1(p_org,p_work,auth.uid()) then return false; end if;
 begin
  perform set_config('offroad.institutional_approval_request',p_request::text,true);
  applied:=private.apply_outbox_dependency_effect_v1(p_org,p_configuration);
  perform set_config('offroad.institutional_approval_request','',true);
  if applied and exists(select 1 from private.institutional_model_results r where r.organization_id=p_org and r.id=p_request
   and r.capital_project_id=p_work and r.recompute_candidate_id is not null and r.status='queued' and r.requested_by=auth.uid()) then
   return true;
  end if;
  raise exception 'institutional_graph_step_unproductive';
 exception when raise_exception then
  if sqlerrm<>'institutional_graph_step_unproductive' then raise; end if;
  return false;
 end;
end $$;

-- 9. Grants: everything created here closed to every API role; the restated and patched functions
-- keep their grants (the public wrappers of increment 4 are unchanged).
do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in ('project_institutional_result_milestone_v1','institutional_result_established_v1','work_followup_citation_v1',
  'fulfil_work_followups_v1','advance_work_followups_v1','work_update_declinable_jobs_v1','lock_new_declinable_jobs_v1','cancel_declined_jobs_v1')
 loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
end $$;

comment on table private.work_followup_executions is 'The execution a user_followup led to: the first execution a person requested in the same work whose objectives cite the follow-up''s text, with the base (milestone, decision and revision) the follow-up continues. A newer row replaces the older only when the older execution ended without a result. Written only by the input snapshot trigger of the execution request. Immutable; closed to every API role.';
comment on column public.work_continuation_requests.status is 'dependency_update: open, awaiting_authorization, scheduled, ready, then adopted, declined or superseded. user_followup: open; scheduled when an execution a person requests cites it; ready when that execution commits its result; adopted when a person adopts that result as a base; declined by a person. Forward only.';
comment on function private.institutional_result_established_v1(uuid,uuid) is 'Whether an institutional result may be shown as current: requested by a person (through a message), or recomputed by a candidate whose update a person adopted.';

-- 10. The result milestone of every institutional result already completed, from the same mapping,
-- once (the backfill of increment 2 is idempotent and writes only what is missing).
do $backfill$
declare written bigint;
begin
 written:=private.backfill_work_milestones_v1();
 raise notice 'work milestone backfill: % milestones',written;
end $backfill$;
