-- Lote 2 results (debt table, covenant headroom, weekly cash) as execution_result revisions: each SQL
-- mapping is the contract's mapping of the shared synthetic packet, the projector and the cited reply
-- dispatch on the packet's schema, the premise cards keep their own contexts, and every function stays
-- closed to API roles. Everything rolls back.
begin;
set local statement_timeout='60s';
-- The fixtures the contract test maps (packages/domain-contracts/src/lote2-result-blocks.test.ts).
-- psql runs from the repository root.
\set dt_packet `cat packages/domain-contracts/src/fixtures/debt-table-result-packet.json`
\set dt_blocks `cat packages/domain-contracts/src/fixtures/debt-table-result-blocks.json`
\set ch_packet `cat packages/domain-contracts/src/fixtures/covenant-headroom-result-packet.json`
\set ch_blocks `cat packages/domain-contracts/src/fixtures/covenant-headroom-result-blocks.json`
\set wc_packet `cat packages/domain-contracts/src/fixtures/weekly-cash-result-packet.json`
\set wc_blocks `cat packages/domain-contracts/src/fixtures/weekly-cash-result-blocks.json`
select set_config('test.dt.packet',:'dt_packet',true) is not null, set_config('test.dt.blocks',:'dt_blocks',true) is not null,
 set_config('test.ch.packet',:'ch_packet',true) is not null, set_config('test.ch.blocks',:'ch_blocks',true) is not null,
 set_config('test.wc.packet',:'wc_packet',true) is not null, set_config('test.wc.blocks',:'wc_blocks',true) is not null;

-- 1. Same packet, same blocks, key for key and claim for claim.
do $$
begin
 if private.execution_result_debt_table_blocks_v1(current_setting('test.dt.packet')::jsonb)<>current_setting('test.dt.blocks')::jsonb then
  raise exception 'SQL debt table blocks differ from the contract blocks'; end if;
 if private.execution_result_covenant_headroom_blocks_v1(current_setting('test.ch.packet')::jsonb)<>current_setting('test.ch.blocks')::jsonb then
  raise exception 'SQL covenant headroom blocks differ from the contract blocks'; end if;
 if private.execution_result_weekly_cash_blocks_v1(current_setting('test.wc.packet')::jsonb)<>current_setting('test.wc.blocks')::jsonb then
  raise exception 'SQL weekly cash blocks differ from the contract blocks'; end if;
 raise notice 'PASS: the SQL mappings of the shared lote 2 packets equal the contract mappings';
end $$;

-- 1b. A packet without a result maps to empty tables and null sections, never to an error.
do $$
declare got jsonb;
begin
 got:=private.execution_result_weekly_cash_blocks_v1(jsonb_set(jsonb_set(current_setting('test.wc.packet')::jsonb,'{result,weekly}','null'),'{readings}','null'));
 if got->0->'claims'<>'[]'::jsonb or got->1->'content'->'rows'<>'[]'::jsonb or got->0->'content'->'minimumCash'<>'null'::jsonb then
  raise exception 'weekly cash without result mapped wrongly: %',got->0; end if;
 got:=private.execution_result_debt_table_blocks_v1(jsonb_set(current_setting('test.dt.packet')::jsonb,'{result,table}','null'));
 if got->1->'claims'<>'[]'::jsonb or got->4->'content'->'profile'<>'null'::jsonb then raise exception 'debt table without result mapped wrongly'; end if;
 raise notice 'PASS: a framed packet maps without numbers';
end $$;

-- 2. Each mapping refuses another packet.
do $$
begin
 begin perform private.execution_result_debt_table_blocks_v1(current_setting('test.ch.packet')::jsonb); raise exception 'debt table accepted a covenant packet';
 exception when sqlstate '22023' then null; end;
 begin perform private.execution_result_covenant_headroom_blocks_v1(current_setting('test.wc.packet')::jsonb); raise exception 'covenant accepted a weekly cash packet';
 exception when sqlstate '22023' then null; end;
 begin perform private.execution_result_weekly_cash_blocks_v1(current_setting('test.dt.packet')::jsonb-'result'); raise exception 'weekly cash accepted a packet without result';
 exception when sqlstate '22023' then null; end;
 begin perform private.execution_result_debt_table_blocks_v1(jsonb_set(current_setting('test.dt.packet')::jsonb,'{result,table,rows,0,id}',to_jsonb(repeat('x',141))));
  raise exception 'debt table accepted an id too long for its claim';
 exception when sqlstate '22023' then null; end;
 raise notice 'PASS: the lote 2 mappings refuse other packets';
end $$;

-- 3. The projector and the reply dispatch on every lote 2 schema; the premise card names each context.
do $$
declare src text:=pg_get_functiondef('private.project_execution_result_artifact_v1(uuid,uuid,uuid,uuid)'::regprocedure);
 reply text:=pg_get_functiondef('private.record_execution_result_reply_v1(uuid,uuid,uuid)'::regprocedure);
 prem text:=pg_get_functiondef('private.worker_record_agent_response_with_premises_v1(uuid,text,uuid,jsonb,jsonb)'::regprocedure);
 k text;
begin
 foreach k in array array['debt-table-packet.v1','covenant-headroom-packet.v1','weekly-cash-packet.v1'] loop
  if position(k in src)=0 or position(k in reply)=0 then raise exception 'not dispatched: %',k; end if;
 end loop;
 foreach k in array array['execution_result_debt_table_blocks_v1','execution_result_covenant_headroom_blocks_v1','execution_result_weekly_cash_blocks_v1',
  'execution_result_capacity_blocks_v1','execution_result_comparison_blocks_v1','execution_result_investment_blocks_v1'] loop
  if position(k in src)=0 then raise exception 'projector lost %',k; end if;
 end loop;
 foreach k in array array['''divida:''','''covenant:''','''caixa:''','''debt_table''','''weekly_cash''','''capacidade:''','''propostas:'''] loop
  if position(k in prem)=0 then raise exception 'premise card lost %',k; end if;
 end loop;
 raise notice 'PASS: projector, reply and premise card cover lote 2 and keep lote 1';
end $$;

-- 4. A lote 2 proposal must use its own context; another method's context is refused by the table.
do $$
declare c text:=pg_get_constraintdef((select oid from pg_constraint where conname='work_premise_proposals_context_key_check'));
begin
 if position('build-company-debt-table' in c)=0 or position('measure-covenant-headroom' in c)=0 or position('project-weekly-cash' in c)=0 then
  raise exception 'context check misses a lote 2 method'; end if;
 raise notice 'PASS: lote 2 premise contexts are constrained';
end $$;

-- 5. Closed to every API role.
do $$ declare f text;
begin
 foreach f in array array['private.execution_result_debt_table_blocks_v1(jsonb)','private.execution_result_covenant_headroom_blocks_v1(jsonb)',
  'private.execution_result_weekly_cash_blocks_v1(jsonb)','private.project_execution_result_artifact_v1(uuid,uuid,uuid,uuid)',
  'private.record_execution_result_reply_v1(uuid,uuid,uuid)','private.worker_record_agent_response_with_premises_v1(uuid,text,uuid,jsonb,jsonb)'] loop
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE') then
   raise exception 'function exposed: %',f; end if;
 end loop;
 raise notice 'PASS: lote 2 artifact functions closed to API roles';
end $$;

select 'lote2_result_artifacts_passed' as result;
rollback;
