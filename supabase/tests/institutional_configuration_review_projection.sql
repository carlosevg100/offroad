-- Run after the 3U configuration cut; rollback-only real setup/capture/approval producers.
begin;
\ir support/institutional_setup_pending.sql
set local role authenticated;
select set_config('test.review_capture',public.worker_load_institutional_model_context_v3(current_setting('test.setup_job')::uuid,repeat('w',64))::text,true);
select set_config('test.review_candidate',public.worker_record_initial_institutional_candidate_v2(current_setting('test.setup_job')::uuid,repeat('w',64),
 '90000000-0000-4000-8000-000000000881',current_setting('test.setup_candidate')::jsonb,current_setting('test.review_capture')::jsonb->'setupInputSnapshot')->>'candidateId',true);
reset role;
update public.agent_messages set status='completed' where organization_id='20000000-0000-4000-8000-000000000881' and status in ('queued','processing');
insert into public.organization_review_policies(organization_id,assignment_required,self_approval_allowed,updated_by)
values('20000000-0000-4000-8000-000000000881',false,true,'10000000-0000-4000-8000-000000000881')
on conflict(organization_id) do update set assignment_required=false,self_approval_allowed=true;
select set_config('test.review_basis',public.read_institutional_configuration_review_basis_v2('30000000-0000-4000-8000-000000000881',current_setting('test.review_candidate')::uuid)::text,true);

create function pg_temp.call_native_configuration(p_decision text,p_command uuid,p_declared boolean default true,p_locale text default 'en-US')
returns jsonb language sql security invoker set search_path='' as $$
 select public.review_institutional_configuration_and_calculate_v2('30000000-0000-4000-8000-000000000881',current_setting('test.review_candidate')::uuid,
  current_setting('test.review_basis')::jsonb->>'parentFingerprint',p_decision,current_setting('test.review_basis')::jsonb->>'configurationFingerprint',
  current_setting('test.review_basis')::jsonb->>'lineageFingerprint',p_command,p_locale,p_declared);
$$;
create function pg_temp.expect_native_configuration_error(p_sql text,p_error text) returns void language plpgsql security invoker as $$
begin
 begin execute p_sql;exception when others then if position(p_error in sqlerrm)>0 then return;end if;raise;end;
 raise exception 'expected_configuration_error_missing: %',p_error;
end $$;

set local role authenticated;
select pg_temp.expect_native_configuration_error($q$select pg_temp.call_native_configuration('approved',gen_random_uuid(),false)$q$,'capital_project_self_approval_forbidden');
select pg_temp.expect_native_configuration_error(format($q$select public.review_institutional_configuration_v1('30000000-0000-4000-8000-000000000881',%L,null,'approved',%L)$q$,
 current_setting('test.review_candidate'),current_setting('test.review_basis')::jsonb->>'configurationFingerprint'),'institutional_configuration_native_review_required');
select pg_temp.expect_native_configuration_error(format($q$select public.review_institutional_configuration_and_calculate_v1('30000000-0000-4000-8000-000000000881',%L,null,'approved',%L,gen_random_uuid(),'en-US')$q$,
 current_setting('test.review_candidate'),current_setting('test.review_basis')::jsonb->>'configurationFingerprint'),'institutional_configuration_native_review_required');
select pg_temp.expect_native_configuration_error(format($q$select public.review_institutional_configuration_and_calculate_v2('30000000-0000-4000-8000-000000000881',%L,null,'approved',%L,repeat('f',64),gen_random_uuid(),'en-US',true)$q$,
 current_setting('test.review_candidate'),current_setting('test.review_basis')::jsonb->>'configurationFingerprint'),'institutional_review_lineage_changed');
reset role;
-- Native command validates current assignment and membership before creating any act.
do $$begin
 begin
  update public.organization_review_policies set assignment_required=true where organization_id='20000000-0000-4000-8000-000000000881';
  perform pg_temp.expect_native_configuration_error($q$select pg_temp.call_native_configuration('approved',gen_random_uuid())$q$,'review_assignment_required');
  perform pg_temp.expect_native_configuration_error($q$select pg_temp.call_native_configuration('rejected',gen_random_uuid(),false)$q$,'review_assignment_required');
  raise exception 'rollback_assignment' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
 begin
  update public.organization_memberships set status='suspended' where organization_id='20000000-0000-4000-8000-000000000881' and user_id='10000000-0000-4000-8000-000000000881';
  perform pg_temp.expect_native_configuration_error($q$select pg_temp.call_native_configuration('approved',gen_random_uuid())$q$,'institutional_result_forbidden');
  perform pg_temp.expect_native_configuration_error(format('select public.read_institutional_configuration_review_basis_v2(''30000000-0000-4000-8000-000000000881'',%L)',current_setting('test.review_candidate')),'institutional_result_forbidden');
  raise exception 'rollback_suspension' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
 perform pg_temp.expect_native_configuration_error(format($q$select public.review_institutional_configuration_and_calculate_v2('30000000-0000-4000-8000-000000000881',%L,repeat('f',64),'approved',%L,%L,gen_random_uuid(),'en-US',true)$q$,
  current_setting('test.review_candidate'),current_setting('test.review_basis')::jsonb->>'configurationFingerprint',current_setting('test.review_basis')::jsonb->>'lineageFingerprint'),'institutional_review_stale');
 perform pg_temp.expect_native_configuration_error(format($q$select public.review_institutional_configuration_and_calculate_v2('30000000-0000-4000-8000-000000000881',%L,null,'approved',repeat('f',64),%L,gen_random_uuid(),'en-US',true)$q$,
  current_setting('test.review_candidate'),current_setting('test.review_basis')::jsonb->>'lineageFingerprint'),'institutional_review_stale');
 raise notice 'PASS assignment_required; suspended_subject; parent_and_configuration_cas';
end $$;
do $$begin
 if current_setting('test.review_basis')::jsonb->>'sourceCount'<>'2' then raise exception 'captured_uncited_source_missing';end if;
 if current_setting('test.review_basis')::jsonb->>'preparedBy'<>'10000000-0000-4000-8000-000000000881' then raise exception 'original_preparer_missing';end if;
 if exists(select 1 from private.institutional_configuration_review_projections) then raise exception 'denied_commands_projected';end if;
 raise notice 'PASS native_basis_two_sources; original_preparer; declaration; old_two_doors; lineage_cas';
end $$;

-- Reject is a complete native decision with no deterministic request/job; replay does not queue.
do $$declare cmd uuid:=gen_random_uuid();result jsonb;again jsonb;begin
 begin
  result:=pg_temp.call_native_configuration('rejected',cmd,false);
  again:=pg_temp.call_native_configuration('rejected',cmd,false);
  if again->>'replayed'<>'true' or result->>'decisionId'<>again->>'decisionId' then raise exception 'rejection_replay_duplicate';end if;
  if exists(select 1 from private.institutional_model_results where id=cmd)
   or exists(select 1 from public.processing_jobs where payload->>'message_id'=cmd::text)
   or private.institutional_configuration_review_effective_v1('20000000-0000-4000-8000-000000000881',current_setting('test.review_candidate')::uuid)
   then raise exception 'rejected_configuration_executed';end if;
  if (select effects from public.work_decisions where command_id=cmd)<>array['none']::text[] then raise exception 'rejection_has_effect';end if;
  raise exception 'rollback_reject' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
 raise notice 'PASS rejection_native; rejection_replay; rejection_zero_jobs';
end $$;

-- An injected failure after the result/queue write must roll back native act and old projection.
create function pg_temp.fail_configuration_result_insert() returns trigger language plpgsql as $$begin raise exception 'synthetic_after_result_failure' using errcode='ZX002';end $$;
create trigger synthetic_configuration_result_failure after insert on private.institutional_model_results for each row execute function pg_temp.fail_configuration_result_insert();
set local role authenticated;
select pg_temp.expect_native_configuration_error($q$select pg_temp.call_native_configuration('approved','94000000-0000-4000-8000-000000000881')$q$,'synthetic_after_result_failure');
reset role;
drop trigger synthetic_configuration_result_failure on private.institutional_model_results;
do $$begin
 if exists(select 1 from private.institutional_configuration_review_projections)
  or exists(select 1 from public.work_decisions where command_id='94000000-0000-4000-8000-000000000881')
  or exists(select 1 from public.agent_messages where id='94000000-0000-4000-8000-000000000881')
  or exists(select 1 from public.processing_jobs where payload->>'message_id'='94000000-0000-4000-8000-000000000881')
  or (select status from private.institutional_model_configurations where id=current_setting('test.review_candidate')::uuid)<>'review_required'
 then raise exception 'post_result_failure_left_partial_state';end if;
 raise notice 'PASS atomic_failure_rolls_back_act_projection_message_job';
end $$;

select set_config('test.review_command',gen_random_uuid()::text,true);
set local role authenticated;
select set_config('test.review_approved',pg_temp.call_native_configuration('approved',current_setting('test.review_command')::uuid)::text,true);
select set_config('test.review_replay',pg_temp.call_native_configuration('approved',current_setting('test.review_command')::uuid)::text,true);
select pg_temp.expect_native_configuration_error(format($q$select pg_temp.call_native_configuration('approved',%L,true,'pt-BR')$q$,current_setting('test.review_command')),'institutional_native_review_replay_mismatch');
reset role;
do $$declare p private.institutional_configuration_review_projections;d public.work_decisions;basis private.review_basis_receipts;begin
 select * into strict p from private.institutional_configuration_review_projections where configuration_id=current_setting('test.review_candidate')::uuid;
 select * into strict d from public.work_decisions where id=p.decision_id;
 select * into strict basis from private.review_basis_receipts where id=p.basis_receipt_id;
 if (p.actor_id,p.prepared_by,p.outcome,p.self_approval_declared) is distinct from
  ('10000000-0000-4000-8000-000000000881'::uuid,'10000000-0000-4000-8000-000000000881'::uuid,'approved'::text,true)
  or d.effects<>array['recompute']::text[] or d.decided_by<>p.actor_id or d.created_at<>p.created_at
  or basis.source_count<>2 or (select count(*) from private.review_basis_source_links where receipt_id=basis.id)<>2
 then raise exception 'native_projection_author_basis_incorrect';end if;
 if current_setting('test.review_replay')::jsonb->>'replayed'<>'true'
  or current_setting('test.review_approved')::jsonb->>'decisionId'<>current_setting('test.review_replay')::jsonb->>'decisionId'
  or (select count(*) from private.institutional_model_results where id=p.command_id)<>1
  or (select count(*) from public.processing_jobs where payload->>'message_id'=p.command_id::text)<>1
  or not private.institutional_configuration_review_effective_v1(p.organization_id,p.configuration_id)
 then raise exception 'native_approval_replay_effect_incorrect';end if;
 if has_function_privilege('authenticated','private.apply_institutional_configuration_calculation_before_projection_v1(uuid,uuid,text,text,text,uuid,text)','EXECUTE')
  or has_function_privilege('authenticated','private.apply_institutional_configuration_review_before_projection_v1(uuid,uuid,text,text,text)','EXECUTE')
  or has_table_privilege('authenticated','private.institutional_configuration_review_projections','INSERT')
 then raise exception 'native_approval_primitive_exposed';end if;
 raise notice 'PASS approval_native_act; exact_basis_receipt; immutable_authorship; one_calc_job; exact_replay; private_primitives';
end $$;

-- Conflicting decision history invalidates approval, delegated execution and descendants.
\ir support/institutional_contribution_builder.sql
do $$declare child uuid;c private.institutional_model_configurations;begin
 begin
  child:=pg_temp.add_ancestry_contribution(current_setting('test.review_candidate')::uuid,'45');
  select * into strict c from private.institutional_model_configurations where id=child;
  update public.agent_messages set content='46' where id=c.answer_message_id;
  if private.institutional_configuration_ancestry_before_review_projection_v1(c.organization_id,c.capital_project_id,c.id)->>'state'<>'unresolved'
   or not private.institutional_configuration_requires_native_review_v1(c.organization_id,c.id) then raise exception 'damaged_native_capture_boundary_lost';end if;
  perform pg_temp.expect_native_configuration_error(format('select public.review_institutional_configuration_and_calculate_v1(%L,%L,%L,''approved'',%L,gen_random_uuid(),''en-US'')',
   c.capital_project_id,c.id,c.parent_fingerprint,c.configuration_fingerprint),'institutional_configuration_native_review_required');
  perform pg_temp.expect_native_configuration_error(format('select public.review_institutional_configuration_v1(%L,%L,%L,''approved'',%L)',
   c.capital_project_id,c.id,c.parent_fingerprint,c.configuration_fingerprint),'institutional_configuration_native_review_required');
  raise exception 'rollback_damaged_native' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
 raise notice 'PASS damaged_native_lineage_cannot_fallback_to_two_legacy_doors';
end $$;

do $$declare p private.institutional_configuration_review_projections;d public.work_decisions;conflict jsonb;begin
 begin
  select * into strict p from private.institutional_configuration_review_projections where configuration_id=current_setting('test.review_candidate')::uuid;
  select * into strict d from public.work_decisions where id=p.decision_id;
  conflict:=private.append_work_decision_v1(p.organization_id,p.work_id,d.decision_key,d.kind,d.basis,array['none']::text[],'in_product',null,
   'Synthetic disputed configuration',p.actor_id,null,gen_random_uuid(),d.review_mode,d.policy_snapshot,p_outcome=>'rejected');
  if conflict->>'contested'<>'true' or private.institutional_configuration_review_effective_v1(p.organization_id,p.configuration_id)
   or private.review_execution_authority_current_v1(p.command_id,p.work_id,p.actor_id)
   or private.institutional_configuration_ancestry_v1(p.organization_id,p.work_id,p.configuration_id)->>'state'<>'unresolved'
  then raise exception 'contested_approval_remains_authority';end if;
  perform pg_temp.expect_native_configuration_error(format('select pg_temp.call_native_configuration(''approved'',%L)',p.command_id),'institutional_configuration_review_not_effective');
  raise exception 'rollback_contest' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
 raise notice 'PASS contested_approval_blocks_delegation_lineage_replay';
end $$;

-- Current rights on a delivered uncited source are required even on the same-command replay.
do $$begin
 begin
  perform public.set_source_rights_v1('50000000-0000-4000-8000-000000000882',1,array['store'],array['analysis'],null,null,gen_random_uuid(),repeat('d',64));
  perform pg_temp.expect_native_configuration_error(format('select pg_temp.call_native_configuration(''approved'',%L)',current_setting('test.review_command')),'institutional_review_source_denied');
  perform pg_temp.expect_native_configuration_error(format('select public.read_institutional_configuration_review_basis_v2(''30000000-0000-4000-8000-000000000881'',%L)',current_setting('test.review_candidate')),'institutional_review_source_denied');
  raise exception 'rollback_rights' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
 raise notice 'PASS uncited_source_revocation_blocks_replay_and_reader';
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000882","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.expect_native_configuration_error(format('select pg_temp.call_native_configuration(''approved'',%L)',current_setting('test.review_command')),'institutional_result_forbidden');
reset role;
do $$begin raise notice 'PASS foreign_subject_denied';end $$;
rollback;
