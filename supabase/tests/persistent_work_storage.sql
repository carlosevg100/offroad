-- Rollback-only synthetic contract. No production fixtures or external provider calls.
begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
insert into public.capital_projects(id,organization_id,project_name,created_by)
values('a4100000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000001','Synthetic standalone work','a11b0000-0000-4000-8000-000000000001');
insert into public.work_contexts(organization_id,work_id,purpose)
values('a11b0000-0000-4000-9000-000000000001','a4100000-0000-4000-9000-000000000001','Synthetic conceptual question');
insert into public.agent_conversations(id,organization_id,work_id,created_by)
values('a4100000-0000-4000-9000-000000000002','a11b0000-0000-4000-9000-000000000001','a4100000-0000-4000-9000-000000000001','a11b0000-0000-4000-8000-000000000001');
insert into public.agent_messages(id,organization_id,work_id,conversation_id,role,status,content,locale,created_by)
values('a4100000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000001','a4100000-0000-4000-9000-000000000001','a4100000-0000-4000-9000-000000000002','user','queued','Synthetic question without company','pt-BR','a11b0000-0000-4000-8000-000000000001');
insert into public.processing_runs(id,organization_id,work_id,run_no,trigger,pipeline_version,created_by)
values('a4100000-0000-4000-9000-000000000004','a11b0000-0000-4000-9000-000000000001','a4100000-0000-4000-9000-000000000001',1,'answer','work-conversation-v1','a11b0000-0000-4000-8000-000000000001');
insert into public.processing_jobs(id,organization_id,work_id,processing_run_id,kind,payload,available_at)
values('a4100000-0000-4000-9000-000000000005','a11b0000-0000-4000-9000-000000000001','a4100000-0000-4000-9000-000000000001','a4100000-0000-4000-9000-000000000004','work_conversation',
'{"message_id":"a4100000-0000-4000-9000-000000000003","locale":"pt-BR","model_budget":{"max_calls":1,"max_cost_usd":0.25}}',(select coalesce(min(available_at),now())-interval '1 day' from public.processing_jobs));
-- A tenant read can follow progress but cannot read private payload/capability columns.
set local role authenticated;
do $$ begin
 if (select count(*) from public.agent_messages where work_id='a4100000-0000-4000-9000-000000000001')<>1 then raise exception 'own work not readable'; end if;
 if (select count(*) from public.work_contexts where work_id='a4100000-0000-4000-9000-000000000001')<>1 then raise exception 'own context not readable'; end if;
 begin perform payload from public.processing_jobs; raise exception 'private payload exposed'; exception when insufficient_privilege then null; end;
 begin update public.work_contexts set purpose='forged'; raise exception 'direct context write accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.agent_messages where work_id='a4100000-0000-4000-9000-000000000001') or exists(select 1 from public.work_contexts where work_id='a4100000-0000-4000-9000-000000000001') then raise exception 'membership became work access'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
do $$ begin
 begin insert into public.processing_jobs(organization_id,work_id,processing_run_id,kind,payload) values('a11b0000-0000-4000-9000-000000000001','a4100000-0000-4000-9000-000000000001','a4100000-0000-4000-9000-000000000004','document_pipeline','{}'); raise exception 'document job accepted without intake'; exception when check_violation or insufficient_privilege then null; end;
 begin update public.agent_messages set work_id='a11b0000-0000-4000-9000-000000000002' where id='a4100000-0000-4000-9000-000000000003'; raise exception 'crossed transcript accepted'; exception when check_violation then null; end;
 begin update public.work_contexts set authorized_services=array['publish']; raise exception 'service escalation accepted'; exception when check_violation then null; end;
 if exists(select 1 from public.document_intake_sessions where capital_project_id='a4100000-0000-4000-9000-000000000001') then raise exception 'standalone work synthesized intake'; end if;
end $$;
insert into private.worker_tokens(label,token_sha256) values('Synthetic persistent work worker',extensions.digest(repeat('j',64),'sha256'));
do $$ declare claim jsonb; ctx jsonb; result jsonb; begin
 claim:=public.worker_claim_job_v4(repeat('j',64),600);
 if claim->>'job_id'<>'a4100000-0000-4000-9000-000000000005' or claim->>'work_id'<>'a4100000-0000-4000-9000-000000000001' or claim->>'intake_session_id' is not null then raise exception 'direct work claim mismatch'; end if;
 ctx:=public.worker_load_work_turn_v1((claim->>'job_id')::uuid,claim->>'capability_token');
 if ctx->>'message'<>'Synthetic question without company' or ctx->'messages'<>'[]'::jsonb then raise exception 'turn context mismatch'; end if;
 begin perform public.worker_load_agent_context_v5((claim->>'job_id')::uuid,claim->>'capability_token'); raise exception 'work capability reached intake executor'; exception when insufficient_privilege then null; end;
 begin perform public.worker_commit_work_turn_v1((claim->>'job_id')::uuid,claim->>'capability_token',repeat('0',64),'{"kind":"answer","content":"stale"}','{}'); raise exception 'stale context accepted'; exception when serialization_failure then null; end;
 -- Revocation after the model starts prevents delivery; restoring a delegated principal does
 -- not grant additional source or intake permissions.
 update private.principals set revoked_at=now() where processing_job_id=(claim->>'job_id')::uuid;
 begin perform public.worker_commit_work_turn_v1((claim->>'job_id')::uuid,claim->>'capability_token',ctx->>'fingerprint','{"kind":"answer","content":"revoked"}','{}'); raise exception 'revoked work delivered'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.agent_messages where reply_to_message_id='a4100000-0000-4000-9000-000000000003') then raise exception 'revoked response persisted'; end if;
 update private.principals set revoked_at=null where processing_job_id=(claim->>'job_id')::uuid;
 result:=public.worker_commit_work_turn_v1((claim->>'job_id')::uuid,claim->>'capability_token',ctx->>'fingerprint','{"kind":"answer","content":"Synthetic bounded answer"}','{"costUsd":0,"calls":0}');
 if not exists(select 1 from public.agent_messages where id=(result->>'messageId')::uuid and work_id=(claim->>'work_id')::uuid and intake_session_id is null) then raise exception 'response lost work identity'; end if;
 if (select status from public.processing_runs where id='a4100000-0000-4000-9000-000000000004')<>'succeeded' then raise exception 'atomic completion failed'; end if;
end $$;
select 'persistent_work_storage: PASS' result;
rollback;
