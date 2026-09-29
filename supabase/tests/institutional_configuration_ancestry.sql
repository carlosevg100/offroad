begin;
\ir support/institutional_setup_pending.sql
set local role authenticated;
select set_config('test.ancestry_capture',public.worker_load_institutional_model_context_v3(current_setting('test.setup_job')::uuid,repeat('w',64))::text,true);
select set_config('test.ancestry_root',public.worker_record_initial_institutional_candidate_v2(current_setting('test.setup_job')::uuid,repeat('w',64),'90000000-0000-4000-8000-000000000881',current_setting('test.setup_candidate')::jsonb,current_setting('test.ancestry_capture')::jsonb->'setupInputSnapshot')->>'candidateId',true);
reset role;
create function pg_temp.ancestry(p_id uuid) returns jsonb language sql as $$select private.institutional_configuration_ancestry_v1('20000000-0000-4000-8000-000000000881','30000000-0000-4000-8000-000000000881',p_id);$$;
do $$declare result jsonb;begin
 result:=pg_temp.ancestry(current_setting('test.ancestry_root')::uuid);
 if result->>'state'<>'captured_lineage' or result->>'authorization'<>'not_evaluated' or jsonb_array_length(result->'nodes')<>1 or jsonb_array_length(result->'sources')<>2 then raise exception 'ancestry_root_and_uncited_source: %',result;end if;
 if result is distinct from pg_temp.ancestry(current_setting('test.ancestry_root')::uuid) then raise exception 'ancestry_nondeterministic';end if;
 if private.institutional_configuration_ancestry_v1('20000000-0000-4000-8000-000000000882','30000000-0000-4000-8000-000000000881',current_setting('test.ancestry_root')::uuid)->>'state'<>'unresolved' then raise exception 'ancestry_foreign_tenant';end if;
 if private.institutional_configuration_ancestry_v1('20000000-0000-4000-8000-000000000881','30000000-0000-4000-8000-000000000882',current_setting('test.ancestry_root')::uuid)->>'reason'<>'work_mismatch' then raise exception 'ancestry_foreign_work';end if;
end $$;
-- Real 3E writer on each edge. Only messages/requests/jobs are privileged synthetic fixtures.
\ir support/institutional_contribution_builder.sql
select set_config('test.ancestry_child',pg_temp.add_ancestry_contribution(current_setting('test.ancestry_root')::uuid,'45')::text,true);
select set_config('test.ancestry_grandchild',pg_temp.add_ancestry_contribution(current_setting('test.ancestry_child')::uuid,'46')::text,true);
do $$declare result jsonb;begin
 result:=pg_temp.ancestry(current_setting('test.ancestry_grandchild')::uuid);
 if result->>'state'<>'captured_lineage' or jsonb_array_length(result->'nodes')<>3 or jsonb_array_length(result->'sources')<>2 then raise exception 'ancestry_two_real_contributions: %',result;end if;
 if result is distinct from pg_temp.ancestry(current_setting('test.ancestry_grandchild')::uuid) then raise exception 'ancestry_chain_nondeterministic';end if;
 begin
  update public.agent_messages set content='47' where id=(select answer_message_id from private.institutional_model_configurations where id=current_setting('test.ancestry_child')::uuid);
  result:=pg_temp.ancestry(current_setting('test.ancestry_grandchild')::uuid);
  if result->>'state'<>'unresolved' or result ? 'nodes' or result ? 'sources' then raise exception 'ancestry_mutated_ancestor_accepted';end if;
  raise exception 'rollback_mutation' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
end $$;
-- A read-only integrity classification never confers currently revoked source rights.
do $$declare before jsonb;begin
 before:=pg_temp.ancestry(current_setting('test.ancestry_grandchild')::uuid);
 begin
  perform public.set_source_rights_v1('50000000-0000-4000-8000-000000000882',1,array['read','process','store'],array['analysis'],null,null,'50000000-0000-4000-8000-000000000882',repeat('b',64));
  if pg_temp.ancestry(current_setting('test.ancestry_grandchild')::uuid) is distinct from before then raise exception 'ancestry_rewrote_history_for_rights';end if;
  if private.institutional_setup_snapshot_authorized_v1((current_setting('test.ancestry_capture')::jsonb#>>'{setupInputSnapshot,id}')::uuid,current_setting('test.setup_job')::uuid) then raise exception 'ancestry_revocation_ignored_by_authority';end if;
  raise exception 'rollback_rights' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
end $$;
do $$declare last_id uuid:=current_setting('test.ancestry_grandchild')::uuid; result jsonb;i integer;begin
 for i in 4..128 loop last_id:=pg_temp.add_ancestry_contribution(last_id,(50+i)::text);end loop;
 result:=pg_temp.ancestry(last_id);
 if result->>'state'<>'captured_lineage' or jsonb_array_length(result->'nodes')<>128 then raise exception 'ancestry_128_boundary: %',result;end if;
 last_id:=pg_temp.add_ancestry_contribution(last_id,'179');result:=pg_temp.ancestry(last_id);
 if result->>'reason'<>'depth_limit' or result ? 'nodes' or result ? 'sources' then raise exception 'ancestry_truncated_chain_accepted: %',result;end if;
end $$;
-- Parent substitution cannot redirect an existing receipt, and a result without a receipt stays unknown.
do $$declare result jsonb; c private.institutional_model_configurations; orphan uuid;begin
 begin
  update private.institutional_model_configurations set parent_fingerprint=repeat('f',64) where id=current_setting('test.ancestry_child')::uuid;
  result:=pg_temp.ancestry(current_setting('test.ancestry_grandchild')::uuid);
  if result->>'reason'<>'contribution_parent_mismatch' or result ? 'nodes' or result ? 'sources' then raise exception 'ancestry_parent_substitution_accepted: %',result;end if;
  raise exception 'rollback_parent' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;
 when raise_exception then if sqlerrm<>'institutional_revision_immutable' then raise;end if;end;
 select * into strict c from private.institutional_model_configurations where id=current_setting('test.ancestry_child')::uuid;
 insert into private.institutional_model_configurations(organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status,answer_evidence)
 values(c.organization_id,c.capital_project_id,150,c.configuration||'{"syntheticOrphan":true}',private.institutional_config_hash(c.configuration||'{"syntheticOrphan":true}'),c.parent_fingerprint,'review_required',c.answer_evidence) returning id into orphan;
 result:=pg_temp.ancestry(orphan);
 if result->>'reason'<>'contribution_receipt_missing' or result ? 'nodes' or result ? 'sources' then raise exception 'ancestry_missing_receipt_accepted';end if;
end $$;
do $$declare kind text;candidate uuid;rev integer:=200;result jsonb;begin
 foreach kind in array array['initial_configuration','imported_workbook_proposal','unknown'] loop
  rev:=rev+1;
  insert into private.institutional_model_configurations(organization_id,capital_project_id,revision,configuration,configuration_fingerprint,status,answer_evidence)
  values('20000000-0000-4000-8000-000000000881','30000000-0000-4000-8000-000000000881',rev,jsonb_build_object('synthetic',kind),private.institutional_config_hash(jsonb_build_object('synthetic',kind)),'review_required',jsonb_build_object('kind',kind)) returning id into candidate;
  result:=pg_temp.ancestry(candidate);
  if result->>'state'<>'unresolved' or result ? 'nodes' or result ? 'sources' then raise exception 'ancestry_unsupported_origin_accepted: %',kind;end if;
 end loop;
 if has_function_privilege('anon','private.institutional_configuration_ancestry_v1(uuid,uuid,uuid)','EXECUTE') or has_function_privilege('authenticated','private.institutional_configuration_ancestry_v1(uuid,uuid,uuid)','EXECUTE') or has_function_privilege('service_role','private.institutional_configuration_ancestry_v1(uuid,uuid,uuid)','EXECUTE') then raise exception 'ancestry_client_grant';end if;
end $$;
select 'institutional_configuration_ancestry: PASS';
rollback;
