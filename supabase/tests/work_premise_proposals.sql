-- Premise proposals: the worker proposes with the job capability, only the person's confirmation
-- writes the working basis (as that person), retries are idempotent and nothing else can write.
begin;
\ir support/contextual_adoption_setup.sql
-- A leased agent turn on the fixture's work, with an explicit synthetic worker account.
insert into private.worker_tokens(id,label,token_sha256) values
 ('a3300000-0000-4000-8000-000000000911','Premise proposal test worker',extensions.digest('synthetic-premise-proposal-worker-token','sha256'));
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
 values('10000000-0000-4000-8000-000000000913','authenticated','authenticated','premise-worker@example.invalid','{}','{}',now(),now(),false,false);
insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,created_by)
 values('a11b0000-0000-4000-9000-000000000911','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000006','a11b0000-0000-4000-9000-000000000003',
  'user','processing','Precisamos financiar a linha nova de embalagem. Que caminhos fazem sentido?','pt-BR','a11b0000-0000-4000-8000-000000000001');
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,kind,status,payload,attempts,leased_by,leased_account_user_id,lease_expires_at,capability_sha256)
 values('a11b0000-0000-4000-9000-000000000912','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000005','a11b0000-0000-4000-9000-000000000003',
  'agent_operation_brief','leased','{"message_id":"a11b0000-0000-4000-9000-000000000911","locale":"pt-BR"}'::jsonb,1,
  'a3300000-0000-4000-8000-000000000911','10000000-0000-4000-8000-000000000913',now()+interval '10 minutes',extensions.digest(repeat('p',64),'sha256'));
insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,mime_type,created_by,processing_status)
 values('a11b0000-0000-4000-9000-000000000913','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',
  'a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/estudo.xlsx','estudo-linha-embalagem.xlsx','text/plain','a11b0000-0000-4000-8000-000000000001','ready');

select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000913","role":"authenticated","aal":"aal1"}',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000913',true);
set local role authenticated;
do $$
declare h jsonb:='[]'; premises jsonb; n int; aid text:='ac400000-0000-4000-9000-000000004004';
begin
 for n in 1..3 loop
  h:=h||jsonb_build_array(jsonb_build_object('fieldPath','investment.'||aid||'.project.annualMaintenanceCapex'||n,
   'dimensions',jsonb_build_object('entityId',null,'perimeter','standalone','periodStart','2025-12-31','periodEnd','2036-12-31','currency','BRL','unit','currency','scale','1','scenario','base','definitionVersionId',null),
   'value',jsonb_build_object('type','list','value',jsonb_build_array('600000','600000')),'reason','Origem: premissa da casa. Manutenção de R$ 0,6 milhão por ano'));
 end loop;
 premises:=jsonb_build_object('methodId','analyze-investment-project','methodVersion','2026.10.09-v2','facts','{}'::jsonb,'hypotheses',h,
  'summary',jsonb_build_object('cases',jsonb_build_array('base')),'fingerprint',repeat('a',64));
 -- Unknown keys and foreign field paths are refused before anything is written.
 begin perform public.worker_record_agent_response_with_premises_v1('a11b0000-0000-4000-9000-000000000912',repeat('p',64),gen_random_uuid(),
   '{"state":"idle","reply":"Resposta sintética."}',premises||'{"grantsExecution":true}'); raise exception 'premise_extra_key_accepted';
 exception when invalid_parameter_value then if sqlerrm <> 'invalid_premise_proposal' then raise; end if; end;
 begin perform public.worker_record_agent_response_with_premises_v1('a11b0000-0000-4000-9000-000000000912',repeat('p',64),gen_random_uuid(),
   '{"state":"idle","reply":"Resposta sintética."}',jsonb_set(premises,'{hypotheses,0,fieldPath}','"operating_projection.revenue.amounts"')); raise exception 'premise_foreign_path_accepted';
 exception when invalid_parameter_value then if sqlerrm <> 'invalid_premise_hypothesis' then raise; end if; end;
 begin perform public.worker_record_agent_response_with_premises_v1('a11b0000-0000-4000-9000-000000000912',repeat('x',64),gen_random_uuid(),
   '{"state":"idle","reply":"Resposta sintética."}',premises); raise exception 'premise_without_capability_accepted';
 exception when insufficient_privilege then null; end;
 perform public.worker_record_agent_response_with_premises_v1('a11b0000-0000-4000-9000-000000000912',repeat('p',64),'a11b0000-0000-4000-9000-000000000914',
   '{"state":"idle","reply":"Resposta sintética com premissas."}',premises);
 if jsonb_array_length(public.worker_load_premise_evidence_v1('a11b0000-0000-4000-9000-000000000912',repeat('p',64)))<>0 then raise exception 'premise_evidence_invented'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.work_premise_proposals where source_message_id='a11b0000-0000-4000-9000-000000000911' and assistant_message_id='a11b0000-0000-4000-9000-000000000914' and status='proposed')<>1
 then raise exception 'premise_proposal_not_recorded_with_reply'; end if;
 perform set_config('test.premise.id',(select id::text from public.work_premise_proposals limit 1),true);
end $$;

-- A member without work access sees nothing and cannot confirm.
select set_config('request.jwt.claims','{"sub":"a11b0000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ declare dims jsonb:=current_setting('test.adoption.dimensions')::jsonb; begin
 if exists(select 1 from public.work_premise_proposals) then raise exception 'premise_proposal_disclosed_without_access'; end if;
 begin perform public.confirm_work_premise_proposal_v1(current_setting('test.premise.id')::uuid,repeat('a',64),(dims->>'entityId')::uuid,(dims->>'definitionVersionId')::uuid);
  raise exception 'premise_confirmed_without_access'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- The owner confirms: three hypotheses become one basis written by the owner, with the chosen entity and definition.
select set_config('request.jwt.claims','{"sub":"a11b0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare dims jsonb:=current_setting('test.adoption.dimensions')::jsonb; p uuid:=current_setting('test.premise.id')::uuid; v uuid; basis jsonb; begin
 begin insert into public.work_premise_proposals(organization_id,capital_project_id,intake_session_id,source_message_id,assistant_message_id,method_id,method_version,purpose,context_key,facts,hypotheses,summary,fingerprint)
  values('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-9000-000000000003',gen_random_uuid(),gen_random_uuid(),'analyze-investment-project','2026.10.09-v2','prepare-capital-structure-decision','investimento','{}','[{}]','{}',repeat('b',64));
  raise exception 'premise_direct_insert_allowed'; exception when insufficient_privilege then null; end;
 begin perform public.confirm_work_premise_proposal_v1(p,repeat('c',64),(dims->>'entityId')::uuid,(dims->>'definitionVersionId')::uuid); raise exception 'changed_premise_confirmed';
 exception when serialization_failure then null; end;
 v:=public.confirm_work_premise_proposal_v1(p,repeat('a',64),(dims->>'entityId')::uuid,(dims->>'definitionVersionId')::uuid);
 if public.confirm_work_premise_proposal_v1(p,repeat('a',64),(dims->>'entityId')::uuid,(dims->>'definitionVersionId')::uuid)<>v then raise exception 'premise_retry_not_idempotent'; end if;
 basis:=(public.read_adoption_basis_v1(v)->>'canonical')::jsonb;
 if jsonb_array_length(basis->'entries')<>3 or basis->>'contextKey'<>'investimento' or basis->>'purpose'<>'prepare-capital-structure-decision' then raise exception 'premise_basis_wrong'; end if;
 if exists(select 1 from jsonb_array_elements(basis->'entries') e where e->>'kind'<>'hypothesis' or e->'dimensions'->>'entityId'<>dims->>'entityId'
   or e->'dimensions'->>'definitionVersionId'<>dims->>'definitionVersionId' or e->>'actorId'<>'a11b0000-0000-4000-8000-000000000001' or e->>'reason' not like 'Origem: %')
 then raise exception 'premise_basis_identity_wrong'; end if;
 if (select status from public.work_premise_proposals where id=p)<>'confirmed' then raise exception 'premise_not_marked_confirmed'; end if;
 begin update public.work_premise_proposals set status='proposed' where id=p; if found then raise exception 'premise_direct_update_allowed'; end if;
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.work_premise_proposals'::regclass)
   or has_table_privilege('anon','public.work_premise_proposals','select')
   or has_table_privilege('authenticated','public.work_premise_proposals','insert')
   or has_table_privilege('authenticated','public.work_premise_proposals','update')
   or has_function_privilege('anon','public.confirm_work_premise_proposal_v1(uuid,text,uuid,uuid)','execute')
 then raise exception 'premise_authority_boundary_changed'; end if;
end $$;
select 'work_premise_proposals' as test,'PASS' as result;
rollback;
