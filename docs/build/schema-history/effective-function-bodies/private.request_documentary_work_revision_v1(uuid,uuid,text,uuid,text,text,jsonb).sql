CREATE OR REPLACE FUNCTION private.request_documentary_work_revision_v1(p_project_id uuid, p_execution_brief_id uuid, p_expected_fingerprint text, p_message_id uuid, p_locale text, p_content text, p_plan jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  project_row public.capital_projects;
  session_row public.document_intake_sessions;
  brief_row public.capital_project_execution_briefs;
  message_row public.agent_messages;
  conversation_id uuid;
  plan_id uuid;
  result jsonb;
  request_time timestamptz;
  content text := trim(coalesce(p_content,''));
begin
 perform private.require_resource_access_v1(p_project_id,'work');
  if caller_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_message_id is null or p_execution_brief_id is null or p_locale not in ('pt-BR','en-US')
    or p_expected_fingerprint is null or p_expected_fingerprint !~ '^[a-f0-9]{64}$' or char_length(content) not between 3 and 8000 then
    raise exception 'invalid_documentary_work_revision' using errcode='22023';
  end if;
  select p.* into project_row from public.capital_projects p
    join public.organization_memberships m on m.organization_id=p.organization_id
    where p.id=p_project_id and m.user_id=caller_id and m.status='active' and p.status<>'archived' for update of p;
  if not found then raise exception 'capital_project_not_found' using errcode='P0002'; end if;
  perform private.assert_capital_project_review_action(project_row.organization_id,project_row.id,'prepare');
  if project_row.access_basis<>'authorized_private' or not private.is_released_documentary_plan_v1(p_plan,project_row.entry_job) then
    raise exception 'documentary_work_scope_invalid' using errcode='42501';
  end if;
  select s.* into strict session_row from public.document_intake_sessions s
    where s.organization_id=project_row.organization_id and s.capital_project_id=p_project_id
    order by s.created_at asc limit 1 for update;
  -- A committed command remains replayable after the successor brief has appeared. Compare
  -- every semantic input first; a reused UUID is never authority to alter a different request.
  select m.* into message_row from public.agent_messages m where m.id=p_message_id;
  if found then
    if message_row.organization_id=project_row.organization_id and message_row.intake_session_id=session_row.id
      and message_row.created_by=caller_id and message_row.content=content and message_row.locale=p_locale
      and message_row.metadata->>'kind'='execution_brief_edit'
      and message_row.metadata->>'workRequestRevision'='true'
      and message_row.metadata->>'executionBriefId'=p_execution_brief_id::text
      and message_row.metadata->>'expectedBriefFingerprint'=p_expected_fingerprint
      and message_row.metadata->>'requestedPlanFingerprint'=encode(extensions.digest(convert_to(p_plan::text,'utf8'),'sha256'),'hex') then
      return message_row.metadata->'commandResult'||jsonb_build_object('replayed',true);
    end if;
    raise exception 'documentary_revision_message_already_in_use' using errcode='23505';
  end if;
  perform 1 from public.capital_project_plans p where p.organization_id=project_row.organization_id
    and p.capital_project_id=p_project_id and p.status='active' for update;
  select b.* into brief_row from public.capital_project_execution_briefs b
    where b.organization_id=project_row.organization_id and b.capital_project_id=p_project_id
    order by b.brief_version desc limit 1;
  if brief_row.id is distinct from p_execution_brief_id or brief_row.brief_fingerprint is distinct from p_expected_fingerprint then
    raise exception 'execution_brief_edit_stale' using errcode='40001';
  end if;
  if exists(select 1 from public.processing_jobs j where j.organization_id=project_row.organization_id
    and j.intake_session_id=session_row.id and j.status in ('queued','leased')) then
    raise exception 'advisor_message_in_progress' using errcode='55000';
  end if;
  if not exists(select 1 from public.preliminary_understandings u where u.organization_id=project_row.organization_id
      and u.intake_session_id=session_row.id and u.status='confirmed')
    or not exists(select 1 from public.source_documents d where d.organization_id=project_row.organization_id and d.intake_session_id=session_row.id)
    or exists(select 1 from public.source_documents d where d.organization_id=project_row.organization_id
      and d.intake_session_id=session_row.id and d.processing_status<>'ready') then
    raise exception 'documentary_revision_inputs_not_ready' using errcode='55000';
  end if;
  if not exists(select 1 from public.organizations o join public.organization_rollout_policies r on r.organization_id=o.id
    where o.id=project_row.organization_id and o.pipeline_enabled and r.state in ('canary','active')) then
    raise exception 'documentary_revision_pipeline_unavailable' using errcode='55000';
  end if;
  select c.id into conversation_id from public.agent_conversations c
    where c.organization_id=project_row.organization_id and c.intake_session_id=session_row.id;
  if conversation_id is null then raise exception 'advisor_conversation_not_found' using errcode='P0002'; end if;
  plan_id := private.record_capital_project_plan(p_project_id,p_plan);
  -- The canonical recorder deduplicates exact snapshots, including historical graphs. Returning
  -- to one is explicit here: restore its active pointer, never its former brief approval.
  if exists(select 1 from public.capital_project_plans p where p.id=plan_id and p.status='superseded') then
    update public.capital_project_plans set status='superseded',updated_at=now()
      where organization_id=project_row.organization_id and capital_project_id=p_project_id and status='active';
    update public.capital_project_plans set status='active',updated_at=now()
      where id=plan_id and organization_id=project_row.organization_id and capital_project_id=p_project_id;
  end if;
  if not exists(select 1 from public.capital_project_plans p where p.id=plan_id and p.status='active') then
    raise exception 'documentary_revision_plan_unavailable' using errcode='40001';
  end if;
  request_time:=greatest(clock_timestamp(),coalesce((select max(m.created_at)+interval '1 microsecond'
    from public.agent_messages m where m.organization_id=project_row.organization_id and m.intake_session_id=session_row.id),'-infinity'::timestamptz));
  insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,metadata,created_by,created_at)
    values(p_message_id,project_row.organization_id,conversation_id,session_row.id,'user','completed',content,p_locale,
      jsonb_build_object('kind','execution_brief_edit','workRequestRevision',true,'executionBriefId',brief_row.id,
        'expectedBriefFingerprint',brief_row.brief_fingerprint,'expectedBriefVersion',brief_row.brief_version,
        'requestedPlanFingerprint',encode(extensions.digest(convert_to(p_plan::text,'utf8'),'sha256'),'hex')),caller_id,request_time);
  insert into public.capital_project_execution_brief_events(organization_id,capital_project_id,execution_brief_id,event_type,actor_type,actor_user_id,event_payload)
    values(project_row.organization_id,p_project_id,brief_row.id,'edit_requested','user',caller_id,
      jsonb_build_object('messageId',p_message_id,'expectedFingerprint',brief_row.brief_fingerprint,'expectedVersion',brief_row.brief_version,
        'requestFingerprint',encode(extensions.digest(convert_to(content,'utf8'),'sha256'),'hex'),'workRequestRevision',true));
  -- Reuse every ready document under the same pipeline contract. This existing command enforces
  -- monthly budgets, tenant membership and the canonical approval-holding trigger atomically.
  result:=private.begin_processing_run(project_row.organization_id,session_row.id,'manual','[]'::jsonb,session_row.pipeline_version,'{}'::jsonb);
  result:=result||jsonb_build_object('message_id',p_message_id,'plan_id',plan_id,'replayed',false);
  update public.agent_messages set metadata=metadata||jsonb_build_object('commandResult',result)
    where id=p_message_id and organization_id=project_row.organization_id;
  return result;
end;
$function$
