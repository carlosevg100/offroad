-- Resolve a retained request before validating new-entry fields, then enforce current authority.
-- Replay reads the already-enqueued job; it never creates work or revives a historical request.
do $migration$
declare signature text; body text; previous text;
begin
 foreach signature in array array[
  'private.start_public_company_debt_view_v1(uuid,text,text,text,text,jsonb,jsonb)',
  'private.start_public_origination_thesis_v1(uuid,text,text,text,text,jsonb,jsonb)'
 ] loop
  select pg_get_functiondef(signature::regprocedure) into body;
  previous:=body;
  body:=replace(body,E'  where brief.organization_id=(select organization_id from private.workspace_membership_v1())\n    and brief.request_id = p_request_id','  where brief.request_id = p_request_id');
  if body=previous then raise exception 'specialized_replay_scope_contract_changed'; end if;
  previous:=body;
  body:=replace(body,
   '      work_result:=private.enqueue_work_turn_v1(existing_brief.capital_project_id,p_request_id);',
   $replacement$      select jsonb_build_object('jobId',job.id,'status',job.status) into work_result
      from public.processing_jobs job where job.work_id=existing_brief.capital_project_id
        and job.organization_id=existing_brief.organization_id and job.kind='work_conversation'
        and job.payload->>'message_id'=p_request_id::text order by job.created_at desc,job.id desc limit 1;
      work_result:=coalesce(work_result,'{}'::jsonb)||jsonb_build_object('workId',existing_brief.capital_project_id);$replacement$);
  if body=previous then raise exception 'specialized_replay_enqueue_contract_changed'; end if;
  execute body;
 end loop;
end;
$migration$;
