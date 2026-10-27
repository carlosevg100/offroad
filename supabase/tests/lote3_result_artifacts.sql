-- Lote 3 results (operating projection, projection challenge, receivables funding, quarter update) as
-- execution_result revisions: each SQL mapping is the contract's mapping of the shared synthetic packet,
-- the projector and the cited reply dispatch on the packet's schema, the premise cards keep their own
-- contexts, and every function stays closed to API roles. Everything rolls back.
begin;
set local statement_timeout='60s';
-- The fixtures the contract test maps (packages/domain-contracts/src/lote3-result-blocks.test.ts).
-- psql runs from the repository root.
\set op_packet `cat packages/domain-contracts/src/fixtures/operating-projection-result-packet.json`
\set op_blocks `cat packages/domain-contracts/src/fixtures/operating-projection-result-blocks.json`
\set pc_packet `cat packages/domain-contracts/src/fixtures/projection-challenge-result-packet.json`
\set pc_blocks `cat packages/domain-contracts/src/fixtures/projection-challenge-result-blocks.json`
\set rf_packet `cat packages/domain-contracts/src/fixtures/receivables-funding-result-packet.json`
\set rf_blocks `cat packages/domain-contracts/src/fixtures/receivables-funding-result-blocks.json`
\set qu_packet `cat packages/domain-contracts/src/fixtures/quarter-update-result-packet.json`
\set qu_blocks `cat packages/domain-contracts/src/fixtures/quarter-update-result-blocks.json`
select set_config('test.op.packet',:'op_packet',true) is not null, set_config('test.op.blocks',:'op_blocks',true) is not null,
 set_config('test.pc.packet',:'pc_packet',true) is not null, set_config('test.pc.blocks',:'pc_blocks',true) is not null,
 set_config('test.rf.packet',:'rf_packet',true) is not null, set_config('test.rf.blocks',:'rf_blocks',true) is not null,
 set_config('test.qu.packet',:'qu_packet',true) is not null, set_config('test.qu.blocks',:'qu_blocks',true) is not null;

-- 1. Same packet, same blocks, key for key and claim for claim.
do $$
begin
 if private.execution_result_operating_projection_blocks_v1(current_setting('test.op.packet')::jsonb)<>current_setting('test.op.blocks')::jsonb then
  raise exception 'SQL operating projection blocks differ from the contract blocks'; end if;
 if private.execution_result_projection_challenge_blocks_v1(current_setting('test.pc.packet')::jsonb)<>current_setting('test.pc.blocks')::jsonb then
  raise exception 'SQL projection challenge blocks differ from the contract blocks'; end if;
 if private.execution_result_receivables_funding_blocks_v1(current_setting('test.rf.packet')::jsonb)<>current_setting('test.rf.blocks')::jsonb then
  raise exception 'SQL receivables funding blocks differ from the contract blocks'; end if;
 if private.execution_result_quarter_update_blocks_v1(current_setting('test.qu.packet')::jsonb)<>current_setting('test.qu.blocks')::jsonb then
  raise exception 'SQL quarter update blocks differ from the contract blocks'; end if;
 raise notice 'PASS: the SQL mappings of the shared lote 3 packets equal the contract mappings';
end $$;

-- 1b. A packet without a result maps to empty tables and null sections, never to an error.
do $$
declare got jsonb;
begin
 got:=private.execution_result_operating_projection_blocks_v1(jsonb_set(current_setting('test.op.packet')::jsonb,'{readings}','null'));
 if got->0->'content'->'calibration'<>'null'::jsonb or got->1->'claims'<>'[]'::jsonb or got->1->'content'->'rows'<>'[]'::jsonb or got->4->'content'->'largestCashReduction'<>'null'::jsonb then
  raise exception 'operating projection without readings mapped wrongly: %',got->0; end if;
 got:=private.execution_result_operating_projection_blocks_v1(jsonb_set(current_setting('test.op.packet')::jsonb,'{readings,projected}','null'));
 if got->1->'content'->'rows'<>'[]'::jsonb or got->5->'content'->'rows'='[]'::jsonb then raise exception 'operating projection without a projection mapped wrongly'; end if;
 got:=private.execution_result_projection_challenge_blocks_v1(jsonb_set(current_setting('test.pc.packet')::jsonb,'{readings}','null'));
 if got->0->'claims'<>'[]'::jsonb or got->0->'content'->'gap'<>'null'::jsonb or got->1->'content'->'rows'<>'[]'::jsonb then
  raise exception 'projection challenge without readings mapped wrongly'; end if;
 got:=private.execution_result_receivables_funding_blocks_v1(jsonb_set(jsonb_set(current_setting('test.rf.packet')::jsonb,'{result,funding}','null'),'{readings}','null'));
 if got->0->'claims'<>'[]'::jsonb or got->0->'content'->'referenceDate'<>'null'::jsonb or got->1->'content'->'rows'<>'[]'::jsonb or got->2->'content'->'rows'<>'[]'::jsonb then
  raise exception 'receivables funding without result mapped wrongly'; end if;
 got:=private.execution_result_quarter_update_blocks_v1(jsonb_set(jsonb_set(current_setting('test.qu.packet')::jsonb,'{result,update}','null'),'{readings}','null'));
 if got->0->'claims'<>'[]'::jsonb or got->0->'content'->'tightestWeek'<>'null'::jsonb or got->1->'content'->'rows'<>'[]'::jsonb or got->4->'content'->'steps'<>'[]'::jsonb then
  raise exception 'quarter update without result mapped wrongly'; end if;
 raise notice 'PASS: a framed packet maps without numbers';
end $$;

-- 1c. An option keeps the label of its option in the result, and none when the result does not carry it.
do $$
declare p jsonb:=current_setting('test.rf.packet')::jsonb; got jsonb; first text;
begin
 first:=p#>>'{readings,options,0,id}';
 got:=private.execution_result_receivables_funding_blocks_v1(jsonb_set(p,'{result,funding,options}',
  (select jsonb_agg(o.v) from jsonb_array_elements(p#>'{result,funding,options}') o(v) where o.v->>'id'<>first)));
 if got#>'{2,content,rows,0,label}'<>'null'::jsonb or got#>>'{2,claims,0,claimId}'<>'cost:'||first then raise exception 'receivables option label mapped wrongly'; end if;
 raise notice 'PASS: option labels come from the result';
end $$;

-- 2. Each mapping refuses another packet and an id too long for its claim.
do $$
begin
 begin perform private.execution_result_operating_projection_blocks_v1(current_setting('test.pc.packet')::jsonb); raise exception 'operating projection accepted a challenge packet';
 exception when sqlstate '22023' then null; end;
 begin perform private.execution_result_projection_challenge_blocks_v1(current_setting('test.rf.packet')::jsonb); raise exception 'challenge accepted a receivables packet';
 exception when sqlstate '22023' then null; end;
 begin perform private.execution_result_receivables_funding_blocks_v1(current_setting('test.rf.packet')::jsonb-'result'); raise exception 'receivables funding accepted a packet without result';
 exception when sqlstate '22023' then null; end;
 begin perform private.execution_result_quarter_update_blocks_v1(current_setting('test.op.packet')::jsonb); raise exception 'quarter update accepted a projection packet';
 exception when sqlstate '22023' then null; end;
 begin perform private.execution_result_operating_projection_blocks_v1(jsonb_set(current_setting('test.op.packet')::jsonb,'{readings,projected,base,0,periodId}',to_jsonb(repeat('x',141))));
  raise exception 'operating projection accepted a period too long for its claim';
 exception when sqlstate '22023' then null; end;
 begin perform private.execution_result_projection_challenge_blocks_v1(jsonb_set(current_setting('test.pc.packet')::jsonb,'{readings,assumptions,0,assumptionId}',to_jsonb(repeat('x',141))));
  raise exception 'challenge accepted an assumption id too long for its claim';
 exception when sqlstate '22023' then null; end;
 begin perform private.execution_result_receivables_funding_blocks_v1(jsonb_set(current_setting('test.rf.packet')::jsonb,'{readings,options,0,id}',to_jsonb(repeat('x',141))));
  raise exception 'receivables funding accepted an option id too long for its claim';
 exception when sqlstate '22023' then null; end;
 raise notice 'PASS: the lote 3 mappings refuse other packets';
end $$;

-- 3. The projector and the reply dispatch on every lote 3 schema and keep lotes 1 and 2; the premise card names each context.
do $$
declare src text:=pg_get_functiondef('private.project_execution_result_artifact_v1(uuid,uuid,uuid,uuid)'::regprocedure);
 reply text:=pg_get_functiondef('private.record_execution_result_reply_v1(uuid,uuid,uuid)'::regprocedure);
 prem text:=pg_get_functiondef('private.worker_record_agent_response_with_premises_v1(uuid,text,uuid,jsonb,jsonb)'::regprocedure);
 k text;
begin
 foreach k in array array['operating-projection-packet.v1','projection-challenge-packet.v1','receivables-funding-packet.v1','quarter-update-packet.v1',
  'debt-table-packet.v1','covenant-headroom-packet.v1','weekly-cash-packet.v1','debt-capacity-packet.v1','financing-comparison-packet.v1','investment-decision-packet.v1'] loop
  if position(k in src)=0 or position(k in reply)=0 then raise exception 'not dispatched: %',k; end if;
 end loop;
 foreach k in array array['execution_result_operating_projection_blocks_v1','execution_result_projection_challenge_blocks_v1','execution_result_receivables_funding_blocks_v1',
  'execution_result_quarter_update_blocks_v1','execution_result_debt_table_blocks_v1','execution_result_covenant_headroom_blocks_v1','execution_result_weekly_cash_blocks_v1',
  'execution_result_capacity_blocks_v1','execution_result_comparison_blocks_v1','execution_result_investment_blocks_v1'] loop
  if position(k in src)=0 then raise exception 'projector lost %',k; end if;
 end loop;
 foreach k in array array['''projecao:''','''critica:''','''recebiveis:''','''trimestre:''','''operating_projection''','''projection_challenge''','''receivables_funding''','''quarter_update''',
  '''divida:''','''covenant:''','''caixa:''','''capacidade:''','''propostas:'''] loop
  if position(k in prem)=0 then raise exception 'premise card lost %',k; end if;
 end loop;
 raise notice 'PASS: projector, reply and premise card cover lote 3 and keep lotes 1 and 2';
end $$;

-- 4. A lote 3 proposal must use its own context; another method's context is refused by the table.
do $$
declare c text:=pg_get_constraintdef((select oid from pg_constraint where conname='work_premise_proposals_context_key_check'));
 m text:=pg_get_constraintdef((select oid from pg_constraint where conname='work_premise_proposals_method_id_check'));
begin
 if position('build-operating-projection' in c)=0 or position('challenge-financial-projection' in c)=0 or position('monetize-receivables-for-working-capital' in c)=0
  or position('update-after-quarter-close' in c)=0 or position('project-weekly-cash' in c)=0 then raise exception 'context check misses a method'; end if;
 if position('monetize-receivables-for-working-capital' in m)=0 or position('update-after-quarter-close' in m)=0 then raise exception 'method check wrong'; end if;
 raise notice 'PASS: lote 3 premise contexts are constrained';
end $$;

-- 5. Closed to every API role.
do $$ declare f text;
begin
 foreach f in array array['private.execution_result_operating_projection_blocks_v1(jsonb)','private.execution_result_projection_challenge_blocks_v1(jsonb)',
  'private.execution_result_receivables_funding_blocks_v1(jsonb)','private.execution_result_quarter_update_blocks_v1(jsonb)',
  'private.project_execution_result_artifact_v1(uuid,uuid,uuid,uuid)','private.record_execution_result_reply_v1(uuid,uuid,uuid)'] loop
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE') then
   raise exception 'function exposed: %',f; end if;
 end loop;
 raise notice 'PASS: lote 3 artifact functions closed to API roles';
end $$;

-- 5b. The premise recording keeps the grants it had: authorized by the job capability inside, never by the role.
do $$ declare f text:='private.worker_record_agent_response_with_premises_v1(uuid,text,uuid,jsonb,jsonb)';
begin
 if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE') then raise exception 'premise recording exposed: %',f; end if;
 if position('job_for_capability' in pg_get_functiondef(f::regprocedure))=0 then raise exception 'premise recording lost its capability check'; end if;
 raise notice 'PASS: premise recording stays behind the job capability';
end $$;

select 'lote3_result_artifacts_passed' as result;
rollback;
