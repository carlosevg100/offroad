-- Financing comparison results as execution_result revisions: the SQL mapping is the contract's
-- mapping of the shared synthetic C02 packet, the projector dispatches on the packet's schema and
-- both functions stay closed to API roles. Everything rolls back.
begin;
set local statement_timeout='60s';
-- The fixture the contract test maps (packages/domain-contracts/src/comparison-result-blocks.test.ts).
-- psql runs from the repository root.
\set packet_text `cat packages/domain-contracts/src/fixtures/comparison-result-packet.json`
\set blocks_text `cat packages/domain-contracts/src/fixtures/comparison-result-blocks.json`
select set_config('test.comparison.packet',:'packet_text',true) is not null as packet_loaded,
 set_config('test.comparison.blocks',:'blocks_text',true) is not null as blocks_loaded;

-- 1. Same packet, same blocks, key for key and claim for claim.
do $$
declare got jsonb:=private.execution_result_comparison_blocks_v1(current_setting('test.comparison.packet')::jsonb);
begin
 if got<>current_setting('test.comparison.blocks')::jsonb then raise exception 'SQL comparison blocks differ from the contract blocks: %',got; end if;
 raise notice 'PASS: the SQL mapping of the shared comparison packet equals the contract mapping';
end $$;

-- 2. Anything but a comparison packet is refused by the mapping.
do $$
begin
 begin
  perform private.execution_result_comparison_blocks_v1(jsonb_set(current_setting('test.comparison.packet')::jsonb,'{schemaVersion}','"investment-decision-packet.v1"'));
  raise exception 'mapping accepted an investment packet';
 exception when sqlstate '22023' then null;
 end;
 begin
  perform private.execution_result_comparison_blocks_v1(current_setting('test.comparison.packet')::jsonb-'comparison');
  raise exception 'mapping accepted a packet without comparison';
 exception when sqlstate '22023' then null;
 end;
 raise notice 'PASS: the comparison mapping refuses other packets';
end $$;

-- 3. The projector maps all three packet kinds and traces the comparison by its own fingerprint.
do $$
declare src text:=pg_get_functiondef('private.project_execution_result_artifact_v1(uuid,uuid,uuid,uuid)'::regprocedure);
begin
 if position('execution_result_comparison_blocks_v1' in src)=0 or position('financing-comparison-packet:' in src)=0
  or position('execution_result_investment_blocks_v1' in src)=0 or position('capital-procedure-packet:' in src)=0 then
  raise exception 'projector does not dispatch on the packet schema';
 end if;
 raise notice 'PASS: the projector dispatches on the packet schema';
end $$;

-- 4. Closed to every API role.
do $$ declare f text;
begin
 foreach f in array array['private.execution_result_comparison_blocks_v1(jsonb)','private.project_execution_result_artifact_v1(uuid,uuid,uuid,uuid)'] loop
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE') then
   raise exception 'function exposed: %',f; end if;
 end loop;
 raise notice 'PASS: comparison artifact functions closed to API roles';
end $$;

select 'comparison_result_artifacts_passed' as result;
rollback;
