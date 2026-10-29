-- A lote 4 card the person rejects or corrects in a later message, with nothing proposed in its place, is superseded by
-- that turn's job and can no longer be confirmed. Synthetic and rolled back.
begin;
\ir support/contextual_adoption_setup.sql
insert into private.worker_tokens(id,label,token_sha256) values
 ('a3300000-0000-4000-8000-000000000921','Premise invalidation test worker',extensions.digest('synthetic-premise-invalidation-worker-token','sha256'));
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
 values('10000000-0000-4000-8000-000000000923','authenticated','authenticated','premise-invalidation-worker@example.invalid','{}','{}',now(),now(),false,false);
-- The request (turn one) and the rejection (turn two), each with its own leased turn.
insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,created_by) values
 ('a11b0000-0000-4000-9000-000000000921','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000006','a11b0000-0000-4000-9000-000000000003',
  'user','processing','Conselho na quarta. Prepara a discussão de estrutura de capital.','pt-BR','a11b0000-0000-4000-8000-000000000001'),
 ('a11b0000-0000-4000-9000-000000000931','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000006','a11b0000-0000-4000-9000-000000000003',
  'user','processing','A CCB do plano não é a do Bradesco.','pt-BR','a11b0000-0000-4000-8000-000000000001');
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,kind,status,payload,attempts,leased_by,leased_account_user_id,lease_expires_at,capability_sha256) values
 ('a11b0000-0000-4000-9000-000000000922','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000005','a11b0000-0000-4000-9000-000000000003',
  'agent_operation_brief','leased','{"message_id":"a11b0000-0000-4000-9000-000000000921","locale":"pt-BR"}'::jsonb,1,
  'a3300000-0000-4000-8000-000000000921','10000000-0000-4000-8000-000000000923',now()+interval '10 minutes',extensions.digest(repeat('p',64),'sha256')),
 ('a11b0000-0000-4000-9000-000000000932','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000005','a11b0000-0000-4000-9000-000000000003',
  'agent_operation_brief','leased','{"message_id":"a11b0000-0000-4000-9000-000000000931","locale":"pt-BR"}'::jsonb,1,
  'a3300000-0000-4000-8000-000000000921','10000000-0000-4000-8000-000000000923',now()+interval '10 minutes',extensions.digest(repeat('q',64),'sha256'));

select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000923","role":"authenticated","aal":"aal1"}',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000923',true);
set local role authenticated;
do $$
declare aid text:='ac400000-0000-4000-9000-000000004047'; premises jsonb;
begin
 -- Turn one proposes the board card, with the proposed identity of the plan's CCB and the Bradesco row.
 premises:=jsonb_build_object('methodId','prepare-board-capital-discussion','methodVersion','2026.10.27-v1','facts','{}'::jsonb,
  'hypotheses',jsonb_build_array(jsonb_build_object('fieldPath','board_capital.'||aid||'.link.ccb-bradesco',
   'dimensions',jsonb_build_object('entityId',null,'perimeter','standalone','periodStart','2026-09-28','periodEnd','2026-09-30','currency','BRL','unit','identity','scale','1','scenario','base','definitionVersionId',null),
   'value',jsonb_build_object('type','list','value',jsonb_build_array('plano-2027','ccb-bradesco','tabela-divida','ccb-bradesco')),
   'reason','Origem: premissa da casa. Identificação proposta do mesmo contrato')),
  'summary','{}'::jsonb,'fingerprint',repeat('b',64));
 perform public.worker_record_agent_response_with_premises_v1('a11b0000-0000-4000-9000-000000000922',repeat('p',64),'a11b0000-0000-4000-9000-000000000924',
   '{"state":"idle","reply":"Resposta sintética com o cartão."}',premises);
 -- Only the turn's own job, only a lote 4 method.
 begin perform public.worker_supersede_premise_proposals_v1('a11b0000-0000-4000-9000-000000000932',repeat('x',64),'prepare-board-capital-discussion');
  raise exception 'supersede_without_capability'; exception when insufficient_privilege then null; end;
 begin perform public.worker_supersede_premise_proposals_v1('a11b0000-0000-4000-9000-000000000932',repeat('q',64),'analyze-investment-project');
  raise exception 'supersede_of_other_method'; exception when invalid_parameter_value then null; end;
 -- The card's own turn never supersedes it.
 if public.worker_supersede_premise_proposals_v1('a11b0000-0000-4000-9000-000000000922',repeat('p',64),'prepare-board-capital-discussion')<>0 then
  raise exception 'own_card_superseded'; end if;
 -- Turn two: the person rejects the identity and nothing can be proposed in its place.
 if public.worker_supersede_premise_proposals_v1('a11b0000-0000-4000-9000-000000000932',repeat('q',64),'prepare-board-capital-discussion')<>1 then
  raise exception 'rejected_card_not_superseded'; end if;
end $$;
reset role;
do $$ begin
 if (select status from public.work_premise_proposals where source_message_id='a11b0000-0000-4000-9000-000000000921')<>'superseded' then raise exception 'card_still_open'; end if;
 perform set_config('test.premise.id',(select id::text from public.work_premise_proposals where source_message_id='a11b0000-0000-4000-9000-000000000921'),true);
end $$;

-- The owner tries to confirm the earlier card: refused, nothing adopted.
select set_config('request.jwt.claims','{"sub":"a11b0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare dims jsonb:=current_setting('test.adoption.dimensions')::jsonb; begin
 begin perform public.confirm_work_premise_proposal_v1(current_setting('test.premise.id')::uuid,repeat('b',64),(dims->>'entityId')::uuid,(dims->>'definitionVersionId')::uuid);
  raise exception 'superseded_card_confirmed';
 exception when serialization_failure then if sqlerrm <> 'premise_proposal_changed' then raise; end if; end;
 raise notice 'PASS: a rejected lote 4 card is superseded by the later turn and cannot be confirmed';
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.worker_supersede_premise_proposals_v1(uuid,text,text)','execute')
   or has_function_privilege('authenticated','private.document_folder_reading_lock_v1(uuid,text,text)','execute') then raise exception 'supersede_grants_wrong'; end if;
 raise notice 'PASS: supersede closed to anon';
end $$;
rollback;
