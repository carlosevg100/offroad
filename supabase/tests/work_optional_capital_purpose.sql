-- Rollback-only public-command regression. Synthetic actors follow the established authorization fixture.
begin;
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
set local role authenticated;
do $$
declare result jsonb; work_id uuid; before_sessions bigint; before_companies bigint;
begin
  select count(*) into before_sessions from public.document_intake_sessions;
  select count(*) into before_companies from public.companies;
  result:=public.start_work_v1('aecc0000-0000-4000-8000-000000000001','pt-BR',
    'Synthetic optional purpose','Synthetic analysis with no financing purpose declared',
    'capital_planning','public_information',null,null,false);
  work_id:=(result->>'workId')::uuid;
  perform set_config('test.optional_purpose_work',work_id::text,true);
  if result->>'intake_session_id' is not null
    or (select count(*) from public.document_intake_sessions)<>before_sessions
    or (select count(*) from public.companies)<>before_companies then
    raise exception 'optional_purpose_entry_manufactured_intake_or_company';
  end if;
end $$;
-- Explicit document boundary for exercising the existing compatibility recorder, not a new entry prerequisite.
select public.accept_private_workspace_terms('pt-BR','Synthetic purpose owner','',true,true);
do $$ declare session_id uuid; event_id uuid:='aecc0000-0000-4000-8000-000000000002'; r jsonb; replay jsonb; before_objective text; purpose text; begin
  session_id:=public.prepare_work_document_intake_v1(current_setting('test.optional_purpose_work')::uuid,'pt-BR');
  perform set_config('test.optional_purpose_session',session_id::text,true);
  if not exists(select 1 from public.document_intake_sessions where id=session_id and archetype is null) then
    raise exception 'optional_purpose_setup_not_unclassified';
  end if;
  r:=public.record_intake_capital_need_command('a11b0000-0000-4000-9000-000000000001',session_id,event_id,null,
    'Synthetic declared analytical objective',10,'BRL','no_rush',24,0);
  replay:=public.record_intake_capital_need_command('a11b0000-0000-4000-9000-000000000001',session_id,event_id,null,
    'Synthetic declared analytical objective',10,'BRL','no_rush',24,0);
  if r->>'replayed'<>'false' or replay->>'replayed'<>'true' or r->>'sequence' is distinct from replay->>'sequence' then
    raise exception 'optional_purpose_event_replay_changed';
  end if;
  if not exists(select 1 from public.document_intake_sessions where id=session_id and archetype is null
    and capital_objective='Synthetic declared analytical objective') then
    raise exception 'optional_purpose_invented_classification_or_lost_objective';
  end if;
  begin
    perform public.record_intake_capital_need_command('a11b0000-0000-4000-9000-000000000001',session_id,event_id,null,'Changed objective');
    raise exception 'optional_purpose_changed_replay_accepted';
  exception when unique_violation then null; end;
  before_objective:=(select capital_objective from public.document_intake_sessions where id=session_id);
  begin
    perform public.record_intake_capital_need_command('a11b0000-0000-4000-9000-000000000001',session_id,gen_random_uuid(),'capital_planning','Unsupported category');
    raise exception 'optional_purpose_unsupported_enum_accepted';
  exception when invalid_parameter_value then
    if sqlerrm<>'intake_capital_need_command_invalid' then raise; end if;
  end;
  begin
    perform public.record_intake_capital_need_command('a11b0000-0000-4000-9000-000000000001',session_id,gen_random_uuid(),null,'Invalid amount',-1);
    raise exception 'optional_purpose_other_validation_weakened';
  exception when invalid_parameter_value then
    if sqlerrm<>'intake_capital_need_command_invalid' then raise; end if;
  end;
  if (select capital_objective from public.document_intake_sessions where id=session_id) is distinct from before_objective then
    raise exception 'optional_purpose_denial_wrote_projection';
  end if;
  -- Existing legacy session has no canonical work context; NULL is still not a legacy intake declaration.
  begin
    perform public.record_intake_capital_need_command('a11b0000-0000-4000-9000-000000000001',
      'a11b0000-0000-4000-9000-000000000003',gen_random_uuid(),null,'Legacy NULL');
    raise exception 'optional_purpose_legacy_null_accepted';
  exception when invalid_parameter_value then
    if sqlerrm<>'intake_capital_need_command_invalid' then raise; end if;
  end;
  foreach purpose in array array['working_capital','growth_expansion','acquisition','refinance','equipment_finance','venture_debt','other'] loop
    perform public.record_intake_capital_need_command('a11b0000-0000-4000-9000-000000000001',session_id,gen_random_uuid(),purpose,'Explicit synthetic purpose');
  end loop;
  if (select archetype from public.document_intake_sessions where id=session_id) is not null then
    raise exception 'optional_purpose_recorder_changed_session_archetype';
  end if;
end $$;
reset role;
do $$ declare session_id uuid:=current_setting('test.optional_purpose_session')::uuid; begin
  if (select count(*) from public.intake_domain_events where intake_session_id=session_id and event_id='aecc0000-0000-4000-8000-000000000002')<>1
    or exists(select 1 from public.intake_domain_events where intake_session_id=session_id
      and event_id='aecc0000-0000-4000-8000-000000000002' and payload->'frame' ? 'useOfProceeds') then
    raise exception 'optional_purpose_frame_invented_use_or_replayed_event';
  end if;
  if exists(select 1 from public.intake_domain_events where event_type='capital_need_declared'
    and intake_session_id='a11b0000-0000-4000-9000-000000000003') then
    raise exception 'optional_purpose_legacy_denial_wrote_event';
  end if;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
  begin
    perform public.record_intake_capital_need_command('a11b0000-0000-4000-9000-000000000001',
      current_setting('test.optional_purpose_session')::uuid,gen_random_uuid(),null,'Unauthorized member');
    raise exception 'optional_purpose_membership_bypassed_work';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select public.revoke_resource_access_v1(current_setting('test.optional_purpose_work')::uuid,'a11b0000-0000-4000-8000-000000000001');
do $$ begin
  begin
    perform public.record_intake_capital_need_command('a11b0000-0000-4000-9000-000000000001',
      current_setting('test.optional_purpose_session')::uuid,gen_random_uuid(),null,'Revoked owner');
    raise exception 'optional_purpose_revoked_creator_bypassed_work';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare f oid:='private.record_intake_capital_need_command(uuid,uuid,uuid,text,text,numeric,text,text,integer,integer,text,text,text,text[],text[],text)'::regprocedure; begin
  if (select count(*) from public.intake_domain_events where intake_session_id=current_setting('test.optional_purpose_session')::uuid
    and event_type='capital_need_declared')<>8 then
    raise exception 'optional_purpose_denials_added_events';
  end if;
  if not has_function_privilege('authenticated',f,'EXECUTE')
    or has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE')
    or not exists(select 1 from pg_proc where oid=f and prosecdef and proconfig=array['search_path=""']) then
    raise exception 'optional_purpose_acl_or_settings_changed';
  end if;
end $$;
select 'work_optional_capital_purpose: PASS'  result;
rollback;
