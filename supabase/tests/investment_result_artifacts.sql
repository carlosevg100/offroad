-- Investment decision results as execution_result revisions: the SQL mapping is the contract's
-- mapping of the shared synthetic C32 packet, the projector dispatches on the packet's schema and
-- both functions stay closed to API roles. Everything rolls back.
begin;
set local statement_timeout='60s';
-- The fixture the contract test maps (packages/domain-contracts/src/investment-result-blocks.test.ts).
-- psql runs from the repository root.
\set packet_text `cat packages/domain-contracts/src/fixtures/investment-result-packet.json`
\set blocks_text `cat packages/domain-contracts/src/fixtures/investment-result-blocks.json`
select set_config('test.investment.packet',:'packet_text',true) is not null as packet_loaded,
 set_config('test.investment.blocks',:'blocks_text',true) is not null as blocks_loaded;

-- 1. Same packet, same blocks, key for key and claim for claim.
do $$
declare got jsonb:=private.execution_result_investment_blocks_v1(current_setting('test.investment.packet')::jsonb);
begin
 if got<>current_setting('test.investment.blocks')::jsonb then
  raise exception 'SQL investment blocks differ from the contract blocks: %',got;
 end if;
 raise notice 'PASS: the SQL mapping of the shared investment packet equals the contract mapping';
end $$;

-- 2. Anything but an investment packet is refused by the mapping.
do $$
begin
 begin
  perform private.execution_result_investment_blocks_v1(jsonb_set(current_setting('test.investment.packet')::jsonb,'{schemaVersion}','"capital-procedure-packet.v2"'));
  raise exception 'mapping accepted a capital packet';
 exception when sqlstate '22023' then null;
 end;
 begin
  perform private.execution_result_investment_blocks_v1(current_setting('test.investment.packet')::jsonb-'comparison');
  raise exception 'mapping accepted a packet without comparison';
 exception when sqlstate '22023' then null;
 end;
 raise notice 'PASS: the investment mapping refuses other packets';
end $$;

-- 3. The projector maps both packet kinds and traces the investment packet by its own fingerprint.
do $$
declare src text:=pg_get_functiondef('private.project_execution_result_artifact_v1(uuid,uuid,uuid,uuid)'::regprocedure);
begin
 if position('execution_result_investment_blocks_v1' in src)=0 or position('investment-decision-packet:' in src)=0 or position('capital-procedure-packet:' in src)=0 then
  raise exception 'projector does not dispatch on the packet schema';
 end if;
 raise notice 'PASS: the projector dispatches on the packet schema';
end $$;

-- 4. Closed to every API role.
do $$ declare f text;
begin
 foreach f in array array['private.execution_result_investment_blocks_v1(jsonb)','private.project_execution_result_artifact_v1(uuid,uuid,uuid,uuid)'] loop
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE') then
   raise exception 'function exposed: %',f; end if;
 end loop;
 raise notice 'PASS: investment artifact functions closed to API roles';
end $$;

select 'investment_result_artifacts_passed' as result;
rollback;
