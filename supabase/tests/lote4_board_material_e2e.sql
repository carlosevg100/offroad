-- The board discussion (C47, prepare-board-capital-discussion 2026.10.27-v1) end to end through its real producer. Every
-- prior the board material reads (the debt table, covenant, weekly cash, the packaging line investment, projection, FP&A
-- challenge, receivables and the 2027 plan through evaluate-financing-paths) is published as production holds it and
-- completed through the common producer (requested, claimed, reserved, settled, committed) over a confirmed premise card.
-- The discussion's basis is a confirmed premise card too: its sources by role as [method, packet fingerprint, money
-- scale], the meeting, one deliberation and page, and the adopted identity of the plan's CCB with the debt table's
-- Bradesco row. The payload is assembled slot for slot as composeBoundBoardCapitalDiscussion returns it for that basis,
-- carrying each stored result verbatim, and is issued through request_work_execution_v4 under the published manifestHash
-- 48a38410... Then the same priors, tampered (output fingerprint, method version, manifest hash, a pin to an execution
-- not completed, a pin to an execution of another organization), are each refused by name. No predicate is replaced;
-- the stored rows are rewritten only where the tamper is the storage itself. Synthetic and rolled back.
begin;
\ir support/execution_adopted_result_setup.sql

-- Two confirmed premise cards of the work, each a basis as a person confirms it: an investment card (the basis every
-- prior result reads) and the board discussion's card (its sources by role and the adopted identity of the plan's CCB
-- and the debt table's Bradesco row). Proposed by a leased agent turn, confirmed by the owner.
insert into private.worker_tokens(id,label,token_sha256) values
 ('a3300000-0000-4000-8000-000000000947','Board e2e premise worker',extensions.digest('synthetic-board-e2e-premise-worker-token','sha256'));
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
 values('10000000-0000-4000-8000-000000000947','authenticated','authenticated','board-e2e-worker@example.invalid','{}','{}',now(),now(),false,false);
insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,created_by) values
 ('a11b0000-0000-4000-9000-000000000941','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000006','a11b0000-0000-4000-9000-000000000003',
  'user','processing','Vale a pena a linha de embalagem?','pt-BR','a11b0000-0000-4000-8000-000000000001'),
 ('a11b0000-0000-4000-9000-000000000951','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000006','a11b0000-0000-4000-9000-000000000003',
  'user','processing','Conselho na quarta. Prepara a discussão de estrutura de capital.','pt-BR','a11b0000-0000-4000-8000-000000000001');
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,kind,status,payload,attempts,leased_by,leased_account_user_id,lease_expires_at,capability_sha256) values
 ('a11b0000-0000-4000-9000-000000000942','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000005','a11b0000-0000-4000-9000-000000000003',
  'agent_operation_brief','leased','{"message_id":"a11b0000-0000-4000-9000-000000000941","locale":"pt-BR"}'::jsonb,1,
  'a3300000-0000-4000-8000-000000000947','10000000-0000-4000-8000-000000000947',now()+interval '10 minutes',extensions.digest(repeat('i',64),'sha256')),
 ('a11b0000-0000-4000-9000-000000000952','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000005','a11b0000-0000-4000-9000-000000000003',
  'agent_operation_brief','leased','{"message_id":"a11b0000-0000-4000-9000-000000000951","locale":"pt-BR"}'::jsonb,1,
  'a3300000-0000-4000-8000-000000000947','10000000-0000-4000-8000-000000000947',now()+interval '10 minutes',extensions.digest(repeat('j',64),'sha256'));
-- The board card's sources: role -> [method, packet fingerprint, money scale]; filled once the priors are completed.
create temporary table board_roles(role text primary key,method text,version text,manifest text,executor text,schema_in text,schema_out text,scale text,profile uuid,exec uuid,fingerprint text);
insert into board_roles values
 ('tabela-divida','build-company-debt-table','2026.10.23-v1','3602b80383f4497d73ba67b1f567ab99f088a1b9929d9112874b01a30ea67379','@offroad/financial-model#prepareDebtTablePacket','debt-table-packet-input.v1','debt-table-packet.v1','reais',
  'a4774000-0000-4000-9000-000000000011','a4774000-0000-4000-9000-000000000111',repeat('1',64)),
 ('covenant','measure-covenant-headroom','2026.10.23-v1','729794a4dd27c16f15abae1986b414c966f369f49e3b27b3e24197fe9b68bc67','@offroad/financial-model#prepareCovenantHeadroomPacket','covenant-headroom-packet-input.v1','covenant-headroom-packet.v1','reais',
  'a4774000-0000-4000-9000-000000000012','a4774000-0000-4000-9000-000000000112',repeat('2',64)),
 ('caixa-semanal','project-weekly-cash','2026.10.23-v1','b7e135f7e60457bfd79f19817a064f1d69bf7301c1f7efcefed736e771362fb1','@offroad/financial-model#prepareWeeklyCashPacket','weekly-cash-packet-input.v1','weekly-cash-packet.v1','reais',
  'a4774000-0000-4000-9000-000000000013','a4774000-0000-4000-9000-000000000113',repeat('3',64)),
 ('linha-embalagem','analyze-investment-project','2026.10.09-v2','aff463906b33b63104790fe9beb18521511dffbbf4cb63344c015e79496cf9d2','@offroad/financial-model#prepareInvestmentDecisionPacket','investment-decision-packet-input.v1','investment-decision-packet.v1','reais',
  'a4774000-0000-4000-9000-000000000014','a4774000-0000-4000-9000-000000000114',repeat('4',64)),
 ('projecao','build-operating-projection','2026.10.26-v1','4caf3653c36d13d238967cc35b0f34f3a4f641fe55cb5f42b60f471127a5614a','@offroad/financial-model#prepareOperatingProjectionPacket','operating-projection-packet-input.v1','operating-projection-packet.v1','reais',
  'a4774000-0000-4000-9000-000000000015','a4774000-0000-4000-9000-000000000115',repeat('5',64)),
 ('plano-fpa','challenge-financial-projection','2026.10.26-v1','1180b9a1e88f3e9bf0857f0f98232fac2cdd34c7496388c9d61f2a2580c2ff64','@offroad/financial-model#prepareProjectionChallengePacket','projection-challenge-packet-input.v1','projection-challenge-packet.v1','reais',
  'a4774000-0000-4000-9000-000000000016','a4774000-0000-4000-9000-000000000116',repeat('6',64)),
 ('recebiveis','monetize-receivables-for-working-capital','2026.10.26-v1','40acfbd4ff347ee89baad9310dacefc9c73c9d501a13241c0a4d0b3ebd23b3e5','@offroad/financial-model#prepareReceivablesFundingPacket','receivables-funding-packet-input.v1','receivables-funding-packet.v1','reais',
  'a4774000-0000-4000-9000-000000000017','a4774000-0000-4000-9000-000000000117',repeat('7',64)),
 ('plano-2027','evaluate-financing-paths','2026.10.27-v1','e306d411ea0e88bcbabe3bb3a62e80bfd43d1e65055477cfcda042d549606af4','@offroad/financial-model#prepareCapitalPathsPacket','capital-structure-paths-packet-input.v1','capital-structure-paths-packet.v1','millions',
  'a4774000-0000-4000-9000-000000000019','a4774000-0000-4000-9000-000000000119',repeat('9',64));
grant select on board_roles to authenticated;

-- Publication of each method as production holds it: a released capability, the method release with its manifest, and
-- the registered execution profile (the synthetic fixture's shape, the real identities).
create function pg_temp.publish(p_profile uuid,p_method text,p_version text,p_manifest text,p_executor text) returns uuid language plpgsql as $$
begin
 insert into private.platform_capability_releases(capability_key,released,exposure,method_id,method_version,method_maturity,approved_by,approved_at,approval_source)
 values('method.'||p_method||'.'||p_version,true,'universal',p_method,p_version,'tested','Synthetic approver',current_date,'Synthetic rollback-only fixture')
 on conflict do nothing;
 insert into private.platform_method_releases(id,method_id,version,manifest_hash,manifest,components,evidence,approval,capability_key)
 values(p_method||'-'||p_version,p_method,p_version,p_manifest,
  jsonb_build_object('budget',jsonb_build_object('currency','BRL','maxCostMinorUnits',0,'maxModelCalls',0,'maxDurationMs',31000),'compiler',jsonb_build_object('hash',repeat('b',64),'version','test-v1')),
  '[]','["Synthetic fixture; not professional approval"]','{}','method.'||p_method||'.'||p_version);
 insert into private.execution_method_profiles(id,platform_release_id,serialization_version,canonical_payload,payload_fingerprint,adapter_source_commit,review_evidence)
 select p_profile,r.id,'offroad-execution-json-utf16-v1',payload::text,encode(extensions.digest(payload::text,'sha256'),'hex'),repeat('c',40),
  jsonb_build_object('result','approved','subjectCommit',repeat('c',40),'reviewer','Synthetic independent reviewer','sourceHash',repeat('d',64))
 from private.platform_method_releases r, lateral (select jsonb_build_object('schemaVersion','execution-profile.v1','adapter','compiled-single-deterministic.v1','grantsExecution',false,
  'method',jsonb_build_object('platformReleaseId',r.id,'houseReleaseId',null,'methodId',r.method_id,'methodVersion',r.version,'manifestHash',r.manifest_hash,'baseManifestHash',r.manifest_hash,
   'compilerVersion','test-v1','compilerHash',repeat('b',64),'executor',jsonb_build_object('key',p_executor,'version',p_version,'sourceClosureHash',repeat('c',64),'inputContractHash',repeat('d',64),'outputContractHash',repeat('e',64)),'formulas','[]'::jsonb),
  'tools','[]'::jsonb,'allowedEffects','["read_only"]'::jsonb,'limits',jsonb_build_object('maxCostMicrousd',0,'maxModelCalls',0,'maxDurationMs',31000),'originalBudget',r.manifest->'budget') payload) f
 where r.id=p_method||'-'||p_version;
 return p_profile;
end $$;

-- An execution contract over a profile, a basis version and a snapshot, as the common producer issues it.
create function pg_temp.contract_for(p_profile uuid,p_exec uuid,p_version uuid,p_snapshot text,p_sources jsonb) returns jsonb language plpgsql as $$
declare p private.execution_method_profiles;human uuid;revision bigint;policy text;org uuid:='a11b0000-0000-4000-9000-000000000001';work uuid:='a11b0000-0000-4000-9000-000000000002';c jsonb;begin
 select * into strict p from private.execution_method_profiles where id=p_profile;
 select id into strict human from private.principals where organization_id=org and user_id='a11b0000-0000-4000-8000-000000000001' and kind='human';
 insert into private.authorization_revisions(organization_id,resource_id,subject_user_id) values(org,work,'a11b0000-0000-4000-8000-000000000001') on conflict do nothing;
 select r.revision into revision from private.authorization_revisions r where organization_id=org and resource_id=work and subject_user_id='a11b0000-0000-4000-8000-000000000001';
 policy:=private.execution_policy_fingerprint_v1(org,work,human,revision);
 c:=jsonb_build_object('schemaVersion','execution-contract.v1','executionId',p_exec,'organizationId',org,'workId',work,'principalId',human,'requestId',p_exec,'processingRunId',p_exec,
  'purpose',(select st.purpose from public.assumption_versions v join public.assumption_sets st on st.organization_id=v.organization_id and st.id=v.set_id where v.id=p_version),'method',(p.canonical_payload::jsonb)->'method','tools','[]'::jsonb,'allowedEffects','["read_only"]'::jsonb,
  'audience',jsonb_build_object('kind','work_participants','workId',work,'policyFingerprint',policy),
  'policy',jsonb_build_object('version','execution-authority.v1','authorityRevision',revision::text,'fingerprint',policy),
  'inputs',jsonb_build_object('snapshotId',p_exec,'fingerprint',encode(extensions.digest(p_snapshot,'sha256'),'hex'),'sources',p_sources,'adoptions','[]'::jsonb,'hypotheses','[]'::jsonb),
  'budget',jsonb_build_object('maxCostMicrousd',0,'maxModelCalls',0,'maxDurationMs',31000,'expiresAt',clock_timestamp()+interval '1 hour'),'requestedAt',clock_timestamp());
 return jsonb_set(c,array['inputs',case when exists(select 1 from private.assumption_version_items i join public.adoption_decisions a on a.organization_id=i.organization_id and a.id=i.decision_id
   where i.version_id=p_version and a.kind='hypothesis') then 'hypotheses' else 'adoptions' end],(select jsonb_agg(jsonb_build_object('id',i.decision_id,'assumptionVersionId',v.id,'fingerprint',v.content_fingerprint))
  from public.assumption_versions v join private.assumption_version_items i on i.organization_id=v.organization_id and i.version_id=v.id where v.id=p_version));
end $$;
-- A prior executed and completed through the common producer: requested, claimed, reserved, settled and committed.
create function pg_temp.complete_prior(p_profile uuid,p_exec uuid,p_version uuid,p_snapshot text,p_result text,p_commit boolean default true) returns jsonb language plpgsql as $$
declare c jsonb;req jsonb;claim jsonb;p jsonb;begin
 select canonical_payload::jsonb into p from private.execution_method_profiles where id=p_profile;
 c:=pg_temp.contract_for(p_profile,p_exec,p_version,p_snapshot,'[]');
 req:=private.request_work_execution_v1(p_profile,c::text,p_snapshot);
 if not p_commit then return req;end if;
 claim:=private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',(req->>'jobId')::uuid,60);
 perform private.reserve_execution_operation_v1((req->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,p_exec,claim->>'contractFingerprint',
  p#>>'{method,executor,key}',p#>>'{method,executor,version}','read_only',0,0);
 perform private.settle_execution_operation_v2((req->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,p_exec,claim->>'contractFingerprint',p_result,'succeeded','calculated',0,0);
 perform private.commit_work_execution_result_v1((req->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',c#>>'{inputs,fingerprint}',p_result,'succeeded','calculated');
 return req;
end $$;
-- A basis version as an envelope and scope, as each prior's input and the discussion carry it.
create function pg_temp.envelope_of(p_version uuid) returns jsonb language sql as $$
 select jsonb_build_object('envelope',jsonb_build_object('canonical',v.canonical_snapshot,'fingerprint',v.content_fingerprint),
  'scope',jsonb_build_object('versionId',v.id,'workId',s.work_id,'purpose',s.purpose))
 from public.assumption_versions v join public.assumption_sets s on s.organization_id=v.organization_id and s.id=v.set_id where v.id=p_version $$;

-- The investment card, confirmed: the basis of every prior.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000947","role":"authenticated","aal":"aal1"}',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000947',true);
set local role authenticated;
do $$
declare dims jsonb:=jsonb_build_object('entityId',null,'perimeter','standalone','periodStart','2026-01-01','periodEnd','2026-12-31','currency','BRL','unit','currency','scale','1','scenario','base','definitionVersionId',null);
begin
 perform public.worker_record_agent_response_with_premises_v1('a11b0000-0000-4000-9000-000000000942',repeat('i',64),'a11b0000-0000-4000-9000-000000000943','{"state":"idle","reply":"Cartão sintético."}',
  jsonb_build_object('methodId','analyze-investment-project','methodVersion','2026.10.09-v2','facts','{}'::jsonb,'summary','{}'::jsonb,'fingerprint',repeat('a',64),
   'hypotheses',jsonb_build_array(jsonb_build_object('fieldPath','investment.ac400000-0000-4000-9000-000000004004.project.annualMaintenanceCapex','dimensions',dims,
    'value',jsonb_build_object('type','list','value',jsonb_build_array('600000','600000')),'reason','Origem: premissa da casa. Manutenção de R$ 0,6 milhão por ano'))));
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"a11b0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
select set_config('test.e2e.investment',public.confirm_work_premise_proposal_v1((select id from public.work_premise_proposals where source_message_id='a11b0000-0000-4000-9000-000000000941'),repeat('a',64),
 (current_setting('test.adoption.dimensions')::jsonb->>'entityId')::uuid,(current_setting('test.adoption.dimensions')::jsonb->>'definitionVersionId')::uuid)::text,true);
reset role;

-- Every prior the board material reads, published and completed through the common producer over that basis.
select pg_temp.publish(profile,method,version,manifest,executor) from board_roles;
select pg_temp.complete_prior(profile,exec,current_setting('test.e2e.investment')::uuid,
 (jsonb_build_object('schemaVersion',schema_in,'adoptionLinks','[]'::jsonb,'decision',pg_temp.envelope_of(current_setting('test.e2e.investment')::uuid)))::text,
 jsonb_build_object('schemaVersion',schema_out,'fingerprint',fingerprint)::text) from board_roles order by role;

-- The board card: the meeting, each reviewed result by role as [method, packet fingerprint, money scale], and the
-- adopted identity of the plan's CCB with the debt table's Bradesco row. Proposed by the agent turn, confirmed by the owner.
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000947","role":"authenticated","aal":"aal1"}',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000947',true);
set local role authenticated;
select public.worker_record_agent_response_with_premises_v1('a11b0000-0000-4000-9000-000000000952',repeat('j',64),'a11b0000-0000-4000-9000-000000000953','{"state":"idle","reply":"Cartão sintético."}',
 jsonb_build_object('methodId','prepare-board-capital-discussion','methodVersion','2026.10.27-v1','facts','{}'::jsonb,'summary','{}'::jsonb,'fingerprint',repeat('b',64),
  'hypotheses',(select jsonb_agg(jsonb_build_object('fieldPath','board_capital.b0a4d000-0000-4000-9000-000000000047.'||h.path,
   'dimensions',jsonb_build_object('entityId',null,'perimeter','standalone','periodStart','2026-01-01','periodEnd','2026-12-31','currency','BRL','unit',h.unit,'scale','1','scenario','base','definitionVersionId',null),
   'value',h.value,'reason','Origem: premissa da casa. Cartão sintético do conselho') order by h.path)
  from (select 'source.'||role path,'identity' unit,jsonb_build_object('type','list','value',jsonb_build_array(method,fingerprint,scale)) value from board_roles
   union all values ('link.ccb-bradesco','identity',jsonb_build_object('type','list','value',jsonb_build_array('ccb-bradesco','ccb-plano'))),
    ('meeting.date','date',jsonb_build_object('type','date','value','2026-11-04')),('meeting.askedOn','date',jsonb_build_object('type','date','value','2026-10-28')),
    ('meeting.leadDays','days',jsonb_build_object('type','number','value','7')),('meeting.minutesPerPage','minutes',jsonb_build_object('type','number','value','3')),
    ('meeting.outlineConfirmed','convention',jsonb_build_object('type','boolean','value',true)),
    ('deliberation.estrutura.title','text',jsonb_build_object('type','text','value','Estrutura de capital de 2027')),
    ('deliberation.estrutura.subject','text',jsonb_build_object('type','text','value','Caminho de financiamento do plano de 2027')),
    ('deliberation.estrutura.authority','identity',jsonb_build_object('type','list','value',jsonb_build_array('conselho'))),
    ('page.abertura.role','convention',jsonb_build_object('type','text','value','opening')),
    ('page.abertura.title','text',jsonb_build_object('type','text','value','O que o conselho decide')),
    ('page.abertura.lines','text',jsonb_build_object('type','list','value',jsonb_build_array('Caminho do plano de 2027'))),
    ('summary.opening','text',jsonb_build_object('type','text','value','Abertura sintética')),
    ('summary.closing','text',jsonb_build_object('type','text','value','Fechamento sintético'))) h)));
reset role;
select set_config('request.jwt.claims','{"sub":"a11b0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
select set_config('test.e2e.board',public.confirm_work_premise_proposal_v1((select id from public.work_premise_proposals where source_message_id='a11b0000-0000-4000-9000-000000000951'),repeat('b',64),
 (current_setting('test.adoption.dimensions')::jsonb->>'entityId')::uuid,(current_setting('test.adoption.dimensions')::jsonb->>'definitionVersionId')::uuid)::text,true);
reset role;

-- The composed discussion, slot for slot as composeBoundBoardCapitalDiscussion builds it from this basis: every operand
-- selected by field path, unit and type in the analysis' dimensions (absent ones declared missing with the lowest
-- resolved definition), the sources and links in key order, and each reviewed result verbatim from its stored row.
create temporary table board_slots(path text,unit text,type text,sel jsonb);
create function pg_temp.compose_board(p_version uuid,p_question text) returns jsonb language plpgsql as $$
declare b jsonb;env jsonb:=pg_temp.envelope_of(p_version);prefix text:='board_capital.b0a4d000-0000-4000-9000-000000000047.';e jsonb;borrowed jsonb;
 sources jsonb;links jsonb;meeting jsonb;deliberations jsonb;pages jsonb;
begin
 b:=(env#>>'{envelope,canonical}')::jsonb;
 select jsonb_build_object('definitionVersionId',x.v#>>'{dimensions,definitionVersionId}','definitionKind',x.v->>'definitionKind') into borrowed
  from jsonb_array_elements(b->'entries') x(v) where x.v->>'fieldPath' like prefix||'%' order by x.v#>>'{dimensions,definitionVersionId}' collate "C" limit 1;
 select x.v into e from jsonb_array_elements(b->'entries') x(v) where x.v->>'fieldPath'=prefix||'meeting.date';
 truncate board_slots;
 insert into board_slots select replace(x.v->>'fieldPath',prefix,''),x.v#>>'{dimensions,unit}',x.v#>>'{value,type}',
  jsonb_build_object('decisionId',x.v->>'decisionId','definitionVersionId',x.v#>>'{dimensions,definitionVersionId}','definitionKind',x.v->>'definitionKind','missingReason',null)
  from jsonb_array_elements(b->'entries') x(v) where x.v->>'fieldPath' like prefix||'%';
 select jsonb_agg(jsonb_build_object('id',substr(path,8),'reading',sel) order by substr(path,8) collate "C") into sources from board_slots where path like 'source.%';
 select jsonb_agg(jsonb_build_object('id',substr(path,6),'reading',sel) order by substr(path,6) collate "C") into links from board_slots where path like 'link.%';
 select jsonb_agg(jsonb_build_object('id',k,'title',pg_temp.slot('deliberation.'||k||'.title','text','text',borrowed,e),'subject',pg_temp.slot('deliberation.'||k||'.subject','text','text',borrowed,e),
  'recommendation',case when exists(select 1 from board_slots where path='deliberation.'||k||'.recommendation') then pg_temp.slot('deliberation.'||k||'.recommendation','text','text',borrowed,e) end,
  'authority',pg_temp.slot('deliberation.'||k||'.authority','identity','list',borrowed,e),'deadlines','[]'::jsonb) order by k collate "C") into deliberations
  from (select distinct split_part(path,'.',2) k from board_slots where path like 'deliberation.%') x;
 select jsonb_agg(jsonb_build_object('id',k,'role',pg_temp.slot('page.'||k||'.role','convention','text',borrowed,e),'title',pg_temp.slot('page.'||k||'.title','text','text',borrowed,e),
  'lines',pg_temp.slot('page.'||k||'.lines','text','list',borrowed,e),'recommendation',null,'options',null) order by k collate "C") into pages
  from (select distinct split_part(path,'.',2) k from board_slots where path like 'page.%') x;
 meeting:=jsonb_build_object('date',pg_temp.slot('meeting.date','date','date',borrowed,e),'askedOn',pg_temp.slot('meeting.askedOn','date','date',borrowed,e),
  'leadDays',pg_temp.slot('meeting.leadDays','days','number',borrowed,e),'minutesPerPage',pg_temp.slot('meeting.minutesPerPage','minutes','number',borrowed,e),
  'agendaMinutes',null,'nextMeetingDate',null,'template',null,'outlineConfirmed',pg_temp.slot('meeting.outlineConfirmed','convention','boolean',borrowed,e));
 return jsonb_build_object('schemaVersion','board-capital-discussion-packet-input.v1','question',p_question,'analysis',jsonb_build_object(
  'sources',(select jsonb_agg(jsonb_build_object('id',x.v->>'id','packet',(select r.canonical_result from board_roles br join private.execution_result_receipts r on r.execution_id=br.exec where br.role=x.v->>'id'))
    order by x.n) from jsonb_array_elements(sources) with ordinality x(v,n)),
  'discussion',jsonb_build_object('envelope',env->'envelope','scope',env->'scope','entityId',e#>>'{dimensions,entityId}','perimeter',e#>>'{dimensions,perimeter}','currency',e#>>'{dimensions,currency}',
   'openingDate',e#>>'{dimensions,periodStart}','endDate',e#>>'{dimensions,periodEnd}','numericInterpretations','[]'::jsonb,'analysisId','b0a4d000-0000-4000-9000-000000000047','scenario',e#>>'{dimensions,scenario}',
   'meeting',meeting,'sources',sources,'topics','[]'::jsonb,'deliberations',deliberations,'figures','[]'::jsonb,'materialFigureIds',pg_temp.slot('figures.material','identity','list',borrowed,e),
   'indicative','[]'::jsonb,'pages',pages,'summary',jsonb_build_object('opening',pg_temp.slot('summary.opening','text','text',borrowed,e),'closing',pg_temp.slot('summary.closing','text','text',borrowed,e)),
   'appendix','[]'::jsonb,'questions','[]'::jsonb,'omissions','[]'::jsonb,'informed','[]'::jsonb,'links',coalesce(links,'[]'::jsonb))));
end $$;
create function pg_temp.slot(p_path text,p_unit text,p_type text,p_borrowed jsonb,p_anchor jsonb) returns jsonb language sql as $$
 select coalesce((select sel from board_slots where path=p_path and unit=p_unit and type=p_type),
  jsonb_build_object('decisionId',null,'definitionVersionId',p_borrowed->>'definitionVersionId','definitionKind',p_borrowed->>'definitionKind',
   'missingReason','No contribution adopted for '||p_path||' in scenario '||(p_anchor#>>'{dimensions,scenario}'))) $$;

-- The C47 profile as production registered it (manifestHash 48a38410...), and the issuance through the v4 producer.
select pg_temp.publish('a4774000-0000-4000-9000-000000000047','prepare-board-capital-discussion','2026.10.27-v1','48a38410ef49409ebd2ea5f017a25c498443c337da193ac4a0a931f843094a98',
 '@offroad/financial-model#prepareBoardCapitalDiscussionPacket');
-- The fixture organization has no founder member, so enabling its producer is the founder's act.
insert into private.platform_principals(user_id,role,label) values('a11b0000-0000-4000-8000-000000000001','founder','Synthetic founder') on conflict do nothing;
select private.grant_execution_producer_v1('c4774000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000001',true,'Synthetic producer grant by the founder','a11b0000-0000-4000-8000-000000000001');
create temporary table board_request(name text primary key,contract jsonb,snapshot text,refs jsonb,gates text);
grant select on board_request to authenticated;
create function pg_temp.board_request(p_name text,p_exec uuid,p_refs jsonb) returns void language plpgsql as $$
declare snap text:=pg_temp.compose_board(current_setting('test.e2e.board')::uuid,'Conselho na quarta: estrutura de capital')::text;company jsonb;
begin
 -- The gates as the request carries them: the company as the basis reads it, the method selected, nothing blocked.
 company:=public.execution_contract_basis_v2('a11b0000-0000-4000-9000-000000000002',current_setting('test.e2e.board')::uuid,'prepare-board-capital-discussion')->'company';
 insert into board_request values(p_name,pg_temp.contract_for('a4774000-0000-4000-9000-000000000047',p_exec,current_setting('test.e2e.board')::uuid,snap,'[]'),snap,p_refs,
  private.execution_gates_canonical_text_v1(jsonb_build_object('schemaVersion','execution-gates.v1','gatesVersion','2026.09.24-v1','blocked',false,
   'companyRegistration',company->>'registration','research',company->>'research','conventions','[]'::jsonb,'voice',jsonb_build_object('version','2026.09.24-v1','blockCount',0,'warnCount',0),
   'methodSelection',jsonb_build_object('methodId','prepare-board-capital-discussion','methodVersion','2026.10.27-v1','selectionVersion','2026.09.24-v1','situationIds','[]'::jsonb))));
end $$;
select pg_temp.board_request('issued','a4774000-0000-4000-9000-000000000470',
 (select jsonb_agg(jsonb_build_object('role',role,'executionId',exec,'resultFingerprint',fingerprint)) from board_roles));
set local role authenticated;
create temporary table board_issued as select public.request_work_execution_v4(contract::text,snapshot,gates,refs) r from board_request where name='issued';
reset role;
do $$
declare r jsonb:=(select r from board_issued);c jsonb:=(select contract from board_request where name='issued');p jsonb:=(select snapshot::jsonb from board_request where name='issued');
begin
 if r->>'executionId' is distinct from 'a4774000-0000-4000-9000-000000000470' or (r->>'replayed')::boolean then raise exception 'board discussion not issued';end if;
 if jsonb_array_length(r->'priorResults')<>8 or exists(select 1 from board_roles b where not exists(select 1 from jsonb_array_elements(r->'priorResults') x(v)
   where x.v->>'role'=b.role and x.v->>'executionId'=b.exec::text and x.v->>'methodId'=b.method and x.v->>'methodVersion'=b.version and x.v->>'resultFingerprint'=b.fingerprint
    and x.v->>'inputFingerprint'=(select payload_fingerprint from private.execution_input_snapshots where execution_id=b.exec))) then raise exception 'priors not resolved as completed';end if;
 if (select count(*) from private.execution_prior_results where execution_id='a4774000-0000-4000-9000-000000000470')<>8 then raise exception 'priors not recorded with the execution';end if;
 if (select payload#>>'{method,manifestHash}' from private.execution_manifests where execution_id='a4774000-0000-4000-9000-000000000470')
  is distinct from '48a38410ef49409ebd2ea5f017a25c498443c337da193ac4a0a931f843094a98' then raise exception 'issued under another manifest';end if;
 if not private.board_material_priors_recorded_v1(c,p) or not private.execution_capital_payload_current_v1(c,p,'a11b0000-0000-4000-8000-000000000001') then
  raise exception 'the issued payload does not pass its own provenance';end if;
 if not exists(select 1 from jsonb_array_elements(p#>'{analysis,discussion,links}') x(v) where x.v->>'id'='ccb-bradesco' and x.v#>>'{reading,decisionId}' is not null) then
  raise exception 'the adopted link is not in the issued discussion';end if;
 raise notice 'PASS: board discussion issued through the v4 producer over 8 completed priors, recorded, with the published manifestHash and its provenance';
end $$;

-- The same priors, tampered: each request is refused by name and leaves nothing behind.
create function pg_temp.board_refused(p_name text,p_exec uuid,p_role text,p_ref jsonb,p_expected text) returns void language plpgsql as $$
begin
 perform pg_temp.board_request(p_name,p_exec,(select jsonb_agg(case when role=p_role then jsonb_build_object('role',role,'executionId',exec,'resultFingerprint',fingerprint)||p_ref
  else jsonb_build_object('role',role,'executionId',exec,'resultFingerprint',fingerprint) end) from board_roles));
 set local role authenticated;
 perform pg_temp.expect_execution_command_error(format($q$select public.request_work_execution_v4(contract::text,snapshot,gates,refs) from board_request where name=%L$q$,p_name),p_expected,p_name);
 reset role;
 if exists(select 1 from public.work_executions where id=p_exec) or exists(select 1 from private.execution_prior_results where execution_id=p_exec) then raise exception '% left a row',p_name;end if;
end $$;
grant execute on function pg_temp.expect_execution_command_error(text,text,text) to authenticated;
-- (1) The output fingerprint: the plan's pin names a packet its stored result does not have.
select pg_temp.board_refused('tampered output fingerprint','a4774000-0000-4000-9000-000000000471','plano-2027',jsonb_build_object('resultFingerprint',repeat('8',64)),'board_material_prior_fingerprint_mismatch');
-- (2) The method version: the plan's stored manifest rewritten to another version of its method.
create temporary table board_manifest as select id,canonical_payload from private.execution_manifests where execution_id='a4774000-0000-4000-9000-000000000119';
-- The stored rows are rewritten as storage tampering would, consistently: the manifest's own fingerprint recomputed and
-- the result receipt naming it, so the prior's closure still reads and the verdict that refuses is the content's own.
create function pg_temp.rewrite_manifest(p_text text) returns void language plpgsql as $$
declare fp text:=encode(extensions.digest(convert_to(p_text,'UTF8'),'sha256'),'hex');begin
 update private.execution_manifests m set canonical_payload=p_text,payload_fingerprint=fp from board_manifest b where m.id=b.id;
 update private.execution_result_receipts set contract_fingerprint=fp where execution_id='a4774000-0000-4000-9000-000000000119';
end $$;
alter table private.execution_manifests disable trigger execution_manifests_immutable;
alter table private.execution_result_receipts disable trigger execution_result_receipts_immutable;
select pg_temp.rewrite_manifest(replace(canonical_payload,'"methodVersion": "2026.10.27-v1"','"methodVersion": "2026.10.28-v1"')) from board_manifest;
select pg_temp.board_refused('tampered method version','a4774000-0000-4000-9000-000000000472','plano-2027','{}','board_material_prior_method_mismatch');
-- (3) The manifest hash: the plan's stored manifest names a hash its method version was not published with.
select pg_temp.rewrite_manifest(replace(canonical_payload,'e306d411ea0e88bcbabe3bb3a62e80bfd43d1e65055477cfcda042d549606af4',repeat('e',64))) from board_manifest;
select pg_temp.board_refused('tampered manifest hash','a4774000-0000-4000-9000-000000000473','plano-2027','{}','board_material_prior_manifest_mismatch');
select pg_temp.rewrite_manifest(canonical_payload) from board_manifest;
alter table private.execution_manifests enable trigger execution_manifests_immutable;
alter table private.execution_result_receipts enable trigger execution_result_receipts_immutable;
-- (4) A pin to an execution of the plan that was requested and never completed.
select pg_temp.complete_prior('a4774000-0000-4000-9000-000000000019','a4774000-0000-4000-9000-000000000129',current_setting('test.e2e.investment')::uuid,
 (jsonb_build_object('schemaVersion','capital-structure-paths-packet-input.v1','adoptionLinks','[]'::jsonb,'decision',pg_temp.envelope_of(current_setting('test.e2e.investment')::uuid)))::text,null,false);
select pg_temp.board_refused('pin to an execution not completed','a4774000-0000-4000-9000-000000000474','plano-2027',jsonb_build_object('executionId','a4774000-0000-4000-9000-000000000129'),'board_material_prior_not_completed');
-- (5) A pin to an execution of another organization, with its own work, principal and run.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
 values('a4774000-0000-4000-8000-000000000001','authenticated','authenticated','board-e2e-foreign@example.invalid','{}','{}',now(),now(),false,false);
insert into public.organizations(id,organization_type,name,created_by) values('a4774000-0000-4000-9000-0000000000f1','company','Synthetic foreign board tenant','a4774000-0000-4000-8000-000000000001');
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('a4774000-0000-4000-9000-0000000000f1','a4774000-0000-4000-8000-000000000001','owner','active',now());
insert into public.capital_projects(id,organization_id,project_name,created_by) values('a4774000-0000-4000-9000-0000000000f2','a4774000-0000-4000-9000-0000000000f1','Synthetic foreign work','a4774000-0000-4000-8000-000000000001');
insert into public.document_intake_sessions(id,organization_id,capital_project_id,started_by,journey) values('a4774000-0000-4000-9000-0000000000f3','a4774000-0000-4000-9000-0000000000f1','a4774000-0000-4000-9000-0000000000f2','a4774000-0000-4000-8000-000000000001','company');
insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,pipeline_version,created_by)
 values('a4774000-0000-4000-9000-0000000000f4','a4774000-0000-4000-9000-0000000000f1','a4774000-0000-4000-9000-0000000000f3',1,'manual','synthetic-board-e2e','a4774000-0000-4000-8000-000000000001');
insert into public.work_executions(id,organization_id,work_id,principal_id,request_id,processing_run_id)
 select 'a4774000-0000-4000-9000-0000000000f5','a4774000-0000-4000-9000-0000000000f1','a4774000-0000-4000-9000-0000000000f2',id,'a4774000-0000-4000-9000-0000000000f5','a4774000-0000-4000-9000-0000000000f4'
 from private.principals where organization_id='a4774000-0000-4000-9000-0000000000f1' and user_id='a4774000-0000-4000-8000-000000000001' and kind='human';
select pg_temp.board_refused('pin to an execution of another organization','a4774000-0000-4000-9000-000000000475','plano-2027',jsonb_build_object('executionId','a4774000-0000-4000-9000-0000000000f5'),'board_material_prior_not_found');
-- The untampered priors still resolve: the issued request replays as the same execution with the same priors.
set local role authenticated;
create temporary table board_replay as select public.request_work_execution_v4(contract::text,snapshot,gates,refs) r from board_request where name='issued';
reset role;
do $$begin
 if (select r->>'replayed' from board_replay) is distinct from 'true' or (select r->>'executionId' from board_replay) is distinct from 'a4774000-0000-4000-9000-000000000470'
  or (select count(*) from private.execution_prior_results where execution_id='a4774000-0000-4000-9000-000000000470')<>8 then raise exception 'the issued request did not replay over its priors';end if;
 raise notice 'PASS: the issued request replays over the same recorded priors';
end $$;
rollback;
