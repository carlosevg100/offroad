-- Every retained start path must enter the same work/authority boundary.
-- Synthetic, rollback-only; no model or provider calls.
begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
\ir support/provider_research_plan_snapshot.sql
\ir support/provider_case_fit_plan_snapshot.sql
\ir support/workspace_analysis_plan.sql
insert into public.onboarding_progress(organization_id,user_id,journey,current_step)
values('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-8000-000000000001','originator','organization');
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
set local role authenticated;
do $$ declare r jsonb; p jsonb:=pg_temp.provider_research_plan_fixture(); work uuid; request uuid; criteria jsonb; before_sessions bigint; before_companies bigint; before_groups bigint; begin
 select count(*) into before_sessions from public.document_intake_sessions;
 select count(*) into before_companies from public.companies;
 select count(*) into before_groups from public.workspace_project_groups;
 r:=public.start_advisor_project_in_group_v1(gen_random_uuid(),'pt-BR','Synthetic group adapter','company_debt_view','Synthetic group entry','public_information',p,null);
 if r->>'intake_session_id' is not null then raise exception 'group adapter created intake'; end if;
 r:=public.submit_advisor_turn_v1((r->>'workId')::uuid,gen_random_uuid(),'pt-BR','Synthetic next turn');
 if r->>'jobId' is null then raise exception 'submit adapter failed to enqueue'; end if;
 request:=gen_random_uuid();
 r:=public.start_provider_research_project_v1(request,'pt-BR','Synthetic research entry','Synthetic research question',p,null);
 if r->>'executionState'<>'conversation_only' or r->>'intake_session_id' is not null or r->>'research_job_id' is not null then raise exception 'research entry activated intake-based execution'; end if;
 perform set_config('test.adapter_work',r->>'workId',true);
 perform set_config('test.adapter_request',request::text,true);
 request:=gen_random_uuid();
 criteria:=jsonb_build_object('schemaVersion','provider-case-criteria.v1','asOf',now(),'currency','BRL','source',jsonb_build_object('kind','user_confirmed','referenceId',request));
 r:=public.start_provider_case_fit_project_v1(request,'pt-BR','Synthetic fit entry','Synthetic case-fit question',pg_temp.provider_case_fit_plan_fixture(),null,null,null,criteria);
 if r->>'executionState'<>'conversation_only' or r->>'intake_session_id' is not null or r->>'research_job_id' is not null then raise exception 'case-fit entry activated intake-based execution'; end if;
 request:=gen_random_uuid();
 r:=public.start_public_company_debt_view_v1(request,'pt-BR','Synthetic specialized debt','Synthetic subject',null,'{"focus":"Synthetic debt question"}',jsonb_set(pg_temp.plan_for('company_debt_view'),'{job,firstWorkProduct}','"company_debt_diagnostic"'));
 if r->>'executionState'<>'conversation_only' or r->>'intake_session_id' is not null then raise exception 'specialized debt entry manufactured intake'; end if;
 begin perform public.start_public_company_debt_view_v1(request,'pt-BR','Synthetic specialized debt','Synthetic subject',null,'{"focus":"Changed question"}',jsonb_set(pg_temp.plan_for('company_debt_view'),'{job,firstWorkProduct}','"company_debt_diagnostic"')); raise exception 'specialized replay discarded changed input'; exception when invalid_parameter_value then null; end;
 request:=gen_random_uuid();
 r:=public.start_public_origination_thesis_v1(request,'pt-BR','Synthetic specialized thesis','Synthetic subject',null,'{"meetingContext":"Synthetic meeting question"}',jsonb_set(pg_temp.plan_for('origination_thesis'),'{job,firstWorkProduct}','"meeting_brief"'));
 if r->>'executionState'<>'conversation_only' or r->>'intake_session_id' is not null then raise exception 'specialized thesis entry manufactured intake'; end if;
 work:=public.start_public_capital_project('pt-BR','Synthetic public entry','company_debt_view','Synthetic subject',null);
 if not exists(select 1 from public.capital_projects where id=work and company_id is null) then raise exception 'public UUID is not work identity'; end if;
 if not exists(select 1 from public.dossiers where resource_id=work and profile->>'name'='Synthetic subject') then raise exception 'declared subject lost'; end if;
 work:=public.start_public_capital_project_v2('pt-BR','Synthetic public planned','company_debt_view','Synthetic subject',null,p);
 work:=public.start_public_onboarding_capital_project('pt-BR','Synthetic public onboarding','company_debt_view','Synthetic subject',null);
 work:=public.start_public_onboarding_capital_project_v2('pt-BR','Synthetic public onboarding planned','company_debt_view','Synthetic subject',null,p);
 if not exists(select 1 from public.onboarding_progress where answers->>'work_id'=work::text) then raise exception 'onboarding lost work identity'; end if;
 if (select count(*) from public.document_intake_sessions)<>before_sessions or (select count(*) from public.companies)<>before_companies or (select count(*) from public.workspace_project_groups)<>before_groups then raise exception 'legacy entry manufactured intake, company or folder'; end if;
 if exists(select 1 from public.processing_jobs where work_id=work and kind<>'work_conversation') then raise exception 'legacy entry bypassed execution boundary'; end if;
end $$;
-- A message id from a different work is not a replay credential, even for the same creator.
select public.accept_private_workspace_terms('pt-BR','Synthetic owner','',true,true);
do $$ declare a jsonb; b jsonb; begin
 a:=public.start_work_v1(gen_random_uuid(),'pt-BR','Synthetic replay A','Synthetic original A','company_debt_view','public_information',null,null,false);
 b:=public.start_work_v1(gen_random_uuid(),'pt-BR','Synthetic replay B','Synthetic original B','company_debt_view','public_information',null,null,false);
 perform public.prepare_work_document_intake_v1((a->>'workId')::uuid,'pt-BR');
 perform public.prepare_work_document_intake_v1((b->>'workId')::uuid,'pt-BR');
 begin perform public.append_advisor_message_v1((b->>'workId')::uuid,(a->>'message_id')::uuid,'pt-BR','Synthetic original A'); raise exception 'append cross-work replay accepted'; exception when insufficient_privilege then null; end;
 begin perform public.submit_advisor_turn_v1((b->>'workId')::uuid,(a->>'message_id')::uuid,'pt-BR','Synthetic original A'); raise exception 'submit cross-work replay accepted'; exception when insufficient_privilege then null; end;
end $$;
select public.revoke_resource_access_v1(current_setting('test.adapter_work')::uuid,'a11b0000-0000-4000-8000-000000000001');
do $$ begin
 begin perform public.start_provider_research_project_v1(current_setting('test.adapter_request')::uuid,'pt-BR','Synthetic research entry','Synthetic research question',pg_temp.provider_research_plan_fixture(),null); raise exception 'legacy creator replay bypassed revocation'; exception when insufficient_privilege then null; end;
 begin perform public.queue_advisor_initial_turn_v1(current_setting('test.adapter_work')::uuid); raise exception 'legacy creator queue bypassed revocation'; exception when insufficient_privilege then null; end;
 begin perform public.append_advisor_message_v1(current_setting('test.adapter_work')::uuid,gen_random_uuid(),'pt-BR','Residual write'); raise exception 'legacy creator append bypassed revocation'; exception when insufficient_privilege then null; end;
end $$;
-- Resuming the old documentary onboarding cannot restore a revoked creator's authority.
reset role;
update public.onboarding_progress set completed_at=null,answers='{}'
 where organization_id='a11b0000-0000-4000-9000-000000000001' and user_id='a11b0000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare session_id uuid; work_id uuid; begin
 session_id:=public.start_onboarding_intake('pt-BR','Synthetic documentary onboarding','identified_restricted',true);
 select capital_project_id into strict work_id from public.document_intake_sessions where id=session_id;
 perform public.revoke_resource_access_v1(work_id,'a11b0000-0000-4000-8000-000000000001');
 begin perform public.start_onboarding_intake('pt-BR','Residual creator rename','identified_restricted',true); raise exception 'onboarding resumed revoked creator access'; exception when insufficient_privilege then null; end;
end $$;
select 'persistent_work_legacy_adapters: PASS' result;
rollback;
