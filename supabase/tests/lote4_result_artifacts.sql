-- Lote 4 results (folder inventory, received proposal, financing paths, board discussion) as execution_result
-- revisions: each SQL mapping is the contract's mapping of the shared synthetic packet, the projector and the
-- cited reply dispatch on the packet's schema, the premise cards keep their own contexts, and every function
-- stays closed to API roles. Everything rolls back.
begin;
set local statement_timeout='60s';
-- The fixtures the contract tests map (packages/domain-contracts/src/lote4-*-result-blocks.test.ts).
-- psql runs from the repository root.
\set rp_packet `cat packages/domain-contracts/src/fixtures/received-proposal-result-packet.json`
\set rp_blocks `cat packages/domain-contracts/src/fixtures/received-proposal-result-blocks.json`
\set df_packet `cat packages/domain-contracts/src/fixtures/document-folder-result-packet.json`
\set df_blocks `cat packages/domain-contracts/src/fixtures/document-folder-result-blocks.json`
\set du_packet `cat packages/domain-contracts/src/fixtures/document-folder-update-result-packet.json`
\set du_blocks `cat packages/domain-contracts/src/fixtures/document-folder-update-result-blocks.json`
\set fp_packet `cat packages/domain-contracts/src/fixtures/financing-paths-result-packet.json`
\set fp_blocks `cat packages/domain-contracts/src/fixtures/financing-paths-result-blocks.json`
\set bm_packet `cat packages/domain-contracts/src/fixtures/board-material-result-packet.json`
\set bm_blocks `cat packages/domain-contracts/src/fixtures/board-material-result-blocks.json`
select set_config('test.rp.packet',:'rp_packet',true) is not null, set_config('test.rp.blocks',:'rp_blocks',true) is not null,
 set_config('test.df.packet',:'df_packet',true) is not null, set_config('test.df.blocks',:'df_blocks',true) is not null,
 set_config('test.du.packet',:'du_packet',true) is not null, set_config('test.du.blocks',:'du_blocks',true) is not null,
 set_config('test.fp.packet',:'fp_packet',true) is not null, set_config('test.fp.blocks',:'fp_blocks',true) is not null,
 set_config('test.bm.packet',:'bm_packet',true) is not null, set_config('test.bm.blocks',:'bm_blocks',true) is not null;

-- 1. Same packet, same blocks, key for key and claim for claim.
do $$
begin
 if private.execution_result_received_proposal_blocks_v1(current_setting('test.rp.packet')::jsonb)<>current_setting('test.rp.blocks')::jsonb then
  raise exception 'SQL received proposal blocks differ from the contract blocks'; end if;
 if private.execution_result_document_folder_blocks_v1(current_setting('test.df.packet')::jsonb)<>current_setting('test.df.blocks')::jsonb then
  raise exception 'SQL folder inventory blocks differ from the contract blocks'; end if;
 if private.execution_result_document_folder_blocks_v1(current_setting('test.du.packet')::jsonb)<>current_setting('test.du.blocks')::jsonb then
  raise exception 'SQL folder update blocks differ from the contract blocks'; end if;
 if private.execution_result_financing_paths_blocks_v1(current_setting('test.fp.packet')::jsonb)<>current_setting('test.fp.blocks')::jsonb then
  raise exception 'SQL financing paths blocks differ from the contract blocks'; end if;
 if private.execution_result_board_material_blocks_v1(current_setting('test.bm.packet')::jsonb)<>current_setting('test.bm.blocks')::jsonb then
  raise exception 'SQL board discussion blocks differ from the contract blocks'; end if;
 raise notice 'PASS: the SQL mappings of the shared lote 4 packets equal the contract mappings';
end $$;

-- 1b. A packet without readings or result maps to empty tables and null sections, never to an error.
do $$
declare got jsonb;
begin
 got:=private.execution_result_received_proposal_blocks_v1(jsonb_set(jsonb_set(current_setting('test.rp.packet')::jsonb,'{readings}','null'),'{result,evaluation}','null'));
 if got->0->'content'->'lender'<>'null'::jsonb or got->1->'claims'<>'[]'::jsonb or got->5->'claims'<>'[]'::jsonb or got->6->'content'->'rows'<>'[]'::jsonb
  or got->4->'content'->'collateral'<>'null'::jsonb then raise exception 'received proposal without readings mapped wrongly'; end if;
 got:=private.execution_result_document_folder_blocks_v1(jsonb_set(jsonb_set(jsonb_set(current_setting('test.df.packet')::jsonb,'{readings}','null'),'{result,inventory}','null'),'{result,priorInventory}','null'));
 if got->0->'claims'<>'[]'::jsonb or got->0->'content'->'asOf'<>'null'::jsonb or got->1->'content'->'rows'<>'[]'::jsonb or got->3->'content'->'stated'<>'false'::jsonb then
  raise exception 'folder without readings mapped wrongly'; end if;
 got:=private.execution_result_financing_paths_blocks_v1(jsonb_set(jsonb_set(current_setting('test.fp.packet')::jsonb,'{readings}','null'),'{result,evaluation}','null'));
 if got->0->'claims'<>'[]'::jsonb or got->1->'claims'<>'[]'::jsonb or got->2->'content'->'rows'<>'[]'::jsonb or got->3->'content'->'rows'<>'[]'::jsonb then
  raise exception 'financing paths without readings mapped wrongly'; end if;
 got:=private.execution_result_board_material_blocks_v1(jsonb_set(jsonb_set(current_setting('test.bm.packet')::jsonb,'{readings}','null'),'{result,discussion}','null'));
 if got->0->'content'->'stage'<>'null'::jsonb or got->1->'content'->'rows'<>'[]'::jsonb or got->7->'claims'<>'[]'::jsonb or got->11->'content'->'rows'='[]'::jsonb then
  raise exception 'board discussion without discussion mapped wrongly'; end if;
 raise notice 'PASS: a framed packet maps without numbers';
end $$;

-- 1c. Selections without arithmetic: the folder shows the prior inventory when the update has none, the
-- recommendation without its path carries no claims, and the board's earlier version is listed by fingerprint.
do $$
declare p jsonb; got jsonb;
begin
 p:=jsonb_set(current_setting('test.du.packet')::jsonb,'{result,inventory}','null');
 got:=private.execution_result_document_folder_blocks_v1(p);
 if got->1->'content'->'rows'<>private.execution_result_document_folder_blocks_v1(jsonb_set(p,'{result,inventory}',p#>'{result,priorInventory}'))->1->'content'->'rows' then
  raise exception 'folder did not fall back to the prior inventory'; end if;
 got:=private.execution_result_financing_paths_blocks_v1(jsonb_set(current_setting('test.fp.packet')::jsonb,'{readings,recommendation}','null'));
 if got->1->'claims'<>'[]'::jsonb or exists(select 1 from jsonb_array_elements(got#>'{3,content,rows}') r(v) where r.v->'recommended'<>'null'::jsonb) then
  raise exception 'paths without a recommendation mapped wrongly'; end if;
 got:=private.execution_result_board_material_blocks_v1(current_setting('test.bm.packet')::jsonb);
 if got#>>'{0,content,priorVersionFingerprint}' is distinct from current_setting('test.bm.packet')::jsonb#>>'{result,discussion,versions,0,fingerprint}' then
  raise exception 'board earlier version not listed'; end if;
 raise notice 'PASS: selections copy without arithmetic';
end $$;

-- 2. Each mapping refuses another packet and an id too long for its claim.
do $$
begin
 begin perform private.execution_result_received_proposal_blocks_v1(current_setting('test.fp.packet')::jsonb); raise exception 'received proposal accepted a paths packet';
 exception when sqlstate '22023' then null; end;
 begin perform private.execution_result_document_folder_blocks_v1(current_setting('test.rp.packet')::jsonb); raise exception 'folder accepted a proposal packet';
 exception when sqlstate '22023' then null; end;
 begin perform private.execution_result_financing_paths_blocks_v1(current_setting('test.fp.packet')::jsonb-'result'); raise exception 'paths accepted a packet without result';
 exception when sqlstate '22023' then null; end;
 begin perform private.execution_result_board_material_blocks_v1(current_setting('test.df.packet')::jsonb); raise exception 'board accepted a folder packet';
 exception when sqlstate '22023' then null; end;
 begin perform private.execution_result_received_proposal_blocks_v1(jsonb_set(current_setting('test.rp.packet')::jsonb,'{readings,asks,0,id}',to_jsonb(repeat('x',141))));
  raise exception 'received proposal accepted an ask id too long for its claim';
 exception when sqlstate '22023' then null; end;
 begin perform private.execution_result_financing_paths_blocks_v1(jsonb_set(current_setting('test.fp.packet')::jsonb,'{readings,paths,0,id}',to_jsonb(repeat('x',141))));
  raise exception 'paths accepted a path id too long for its claim';
 exception when sqlstate '22023' then null; end;
 begin perform private.execution_result_board_material_blocks_v1(jsonb_set(current_setting('test.bm.packet')::jsonb,'{result,discussion,identity,0,figureId}',to_jsonb(repeat('x',141))));
  raise exception 'board accepted a figure id too long for its claim';
 exception when sqlstate '22023' then null; end;
 raise notice 'PASS: the lote 4 mappings refuse other packets';
end $$;

-- 3. The projector and the reply dispatch on every lote 4 schema and keep lotes 1 to 3; the premise card names each context.
do $$
declare src text:=pg_get_functiondef('private.project_execution_result_artifact_v1(uuid,uuid,uuid,uuid)'::regprocedure);
 reply text:=pg_get_functiondef('private.record_execution_result_reply_v1(uuid,uuid,uuid)'::regprocedure);
 prem text:=pg_get_functiondef('private.worker_record_agent_response_with_premises_v1(uuid,text,uuid,jsonb,jsonb)'::regprocedure);
 k text;
begin
 foreach k in array array['received-proposal-packet.v1','document-folder-inventory-packet.v1','capital-structure-paths-packet.v1','board-capital-discussion-packet.v1',
  'operating-projection-packet.v1','projection-challenge-packet.v1','receivables-funding-packet.v1','quarter-update-packet.v1',
  'debt-table-packet.v1','covenant-headroom-packet.v1','weekly-cash-packet.v1','debt-capacity-packet.v1','financing-comparison-packet.v1','investment-decision-packet.v1'] loop
  if position(k in src)=0 or position(k in reply)=0 then raise exception 'not dispatched: %',k; end if;
 end loop;
 foreach k in array array['execution_result_received_proposal_blocks_v1','execution_result_document_folder_blocks_v1','execution_result_financing_paths_blocks_v1',
  'execution_result_board_material_blocks_v1','execution_result_operating_projection_blocks_v1','execution_result_quarter_update_blocks_v1',
  'execution_result_debt_table_blocks_v1','execution_result_capacity_blocks_v1','execution_result_comparison_blocks_v1','execution_result_investment_blocks_v1'] loop
  if position(k in src)=0 then raise exception 'projector lost %',k; end if;
 end loop;
 foreach k in array array['''pasta:''','''proposta-recebida:''','''caminhos:''','''conselho:''','''received_proposal''','''capital_paths''','''board_capital''',
  'document_folder_inventory|document_folder_inventory_update','''trimestre:''','''recebiveis:''','''divida:''','''propostas:'''] loop
  if position(k in prem)=0 then raise exception 'premise card lost %',k; end if;
 end loop;
 raise notice 'PASS: projector, reply and premise card cover lote 4 and keep lotes 1 to 3';
end $$;

-- 3b. The folder card's prefix admits the inventory and its update and nothing else.
do $$
declare re text:='^(?:document_folder_inventory|document_folder_inventory_update)\.[0-9a-f-]{36}\.[A-Za-z0-9_.-]{1,200}$';
begin
 if 'document_folder_inventory.ec26b33b-1494-5748-b4d4-f88c093dcf19.subject.entity' !~ re or 'document_folder_inventory_update.ec26b33b-1494-5748-b4d4-f88c093dcf19.files.1' !~ re
  or 'document_folder_inventory_other.ec26b33b-1494-5748-b4d4-f88c093dcf19.x' ~ re or 'received_proposal.ec26b33b-1494-5748-b4d4-f88c093dcf19.x' ~ re then
  raise exception 'folder prefix wrong'; end if;
 raise notice 'PASS: folder card prefix';
end $$;

-- 4. A lote 4 proposal must use its own context; the objectives persist.
do $$
declare c text:=pg_get_constraintdef((select oid from pg_constraint where conname='work_premise_proposals_context_key_check'));
 m text:=pg_get_constraintdef((select oid from pg_constraint where conname='work_premise_proposals_method_id_check'));
 o text:=pg_get_constraintdef((select oid from pg_constraint where conname='capital_project_objective_preflights_objective_kind_check'));
 k text;
begin
 foreach k in array array['organize-document-folder','evaluate-received-proposal','evaluate-financing-paths','prepare-board-capital-discussion','update-after-quarter-close','analyze-investment-project'] loop
  if position(k in c)=0 or position(k in m)=0 then raise exception 'premise checks miss %',k; end if;
 end loop;
 foreach k in array array['document_folder','received_proposal','financing_paths','board_capital_discussion','quarter_update','ambiguous'] loop
  if position(''''||k||'''' in o)=0 or position(''''||k||'''' in pg_get_functiondef('private.worker_record_objective_plan_preflight_v1(uuid,text,jsonb,jsonb)'::regprocedure))=0 then
   raise exception 'objective kind missing: %',k; end if;
 end loop;
 raise notice 'PASS: lote 4 premise contexts and objectives are constrained';
end $$;

-- 5. Closed to every API role.
do $$ declare f text;
begin
 foreach f in array array['private.execution_result_received_proposal_blocks_v1(jsonb)','private.execution_result_document_folder_blocks_v1(jsonb)',
  'private.execution_result_financing_paths_blocks_v1(jsonb)','private.execution_result_board_material_blocks_v1(jsonb)',
  'private.project_execution_result_artifact_v1(uuid,uuid,uuid,uuid)','private.record_execution_result_reply_v1(uuid,uuid,uuid)'] loop
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE') then
   raise exception 'function exposed: %',f; end if;
 end loop;
 raise notice 'PASS: lote 4 artifact functions closed to API roles';
end $$;

-- 5b. The premise recording keeps the grants it had: authorized by the job capability inside, never by the role.
do $$ declare f text:='private.worker_record_agent_response_with_premises_v1(uuid,text,uuid,jsonb,jsonb)';
begin
 if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE') then raise exception 'premise recording exposed: %',f; end if;
 if position('job_for_capability' in pg_get_functiondef(f::regprocedure))=0 then raise exception 'premise recording lost its capability check'; end if;
 raise notice 'PASS: premise recording stays behind the job capability';
end $$;

select 'lote4_result_artifacts_passed' as result;
rollback;