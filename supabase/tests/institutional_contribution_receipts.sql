begin;
\ir support/institutional_contribution_pending.sql
-- Pre-existing result remains replayable without receiving invented historical evidence.
do $$declare result jsonb;begin
 begin
  insert into private.institutional_model_configurations(organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status,answer_message_id,answer_evidence)
  values('20000000-0000-4000-8000-000000000871','30000000-0000-4000-8000-000000000871',2,current_setting('test.institutional_application')::jsonb->'nextConfiguration',current_setting('test.institutional_application')::jsonb->>'nextConfigurationFingerprint',current_setting('test.institutional_application')::jsonb->>'expectedConfigurationFingerprint','review_required','90000000-0000-4000-8000-000000000871',current_setting('test.institutional_application')::jsonb->'answerEvidence');
  result:=public.worker_apply_institutional_assumption_answer_v1('80000000-0000-4000-8000-000000000873',repeat('v',64),current_setting('test.institutional_application')::jsonb);
  if result->>'replayed' is distinct from 'true' or exists(select 1 from private.institutional_contribution_receipts where organization_id='20000000-0000-4000-8000-000000000871') then raise exception 'legacy replay manufactured evidence';end if;
  raise exception 'legacy_fixture_rollback' using errcode='P0002';
 exception when no_data_found then if sqlerrm<>'legacy_fixture_rollback' then raise;end if;end;
end $$;
-- Every negative is before publication and must leave neither a candidate nor a receipt.
set local role authenticated;
do $$declare broken jsonb; accepted boolean;begin
 foreach broken in array array[
  jsonb_set(current_setting('test.institutional_application')::jsonb,'{answerEvidence,responseFingerprint}',to_jsonb(repeat('0',64))),
  jsonb_set(current_setting('test.institutional_application')::jsonb,'{answerEvidence,answeredBy}','"10000000-0000-4000-8000-000000000872"'),
  jsonb_set(current_setting('test.institutional_application')::jsonb,'{answerEvidence,period}','"2028"'),
  jsonb_set(current_setting('test.institutional_application')::jsonb,'{answerEvidence,assumptionId}','"investment"'),
  jsonb_set(current_setting('test.institutional_application')::jsonb,'{expectedConfigurationFingerprint}',to_jsonb(repeat('1',64))),
  jsonb_set(current_setting('test.institutional_application')::jsonb,'{nextConfiguration,currency}','"USD"')
 ] loop
  accepted:=false;
  begin perform public.worker_apply_institutional_assumption_answer_v1('80000000-0000-4000-8000-000000000873',repeat('v',64),broken);accepted:=true;exception when others then null;end;
  if accepted then raise exception 'unbound contribution accepted';end if;
 end loop;
end $$;
reset role;
do $$begin
 if exists(select 1 from private.institutional_contribution_receipts where organization_id='20000000-0000-4000-8000-000000000871')
 or (select count(*) from private.institutional_model_configurations where organization_id='20000000-0000-4000-8000-000000000871')<>1 then raise exception 'negative wrote partial result';end if;
end $$;
-- Expiry after the candidate and receipt insert rolls back both (the exception is caught outside the RPC).
create function pg_temp.expire_contribution_lease() returns trigger language plpgsql as $$begin
 perform pg_sleep(1.5);return new;end $$;
create trigger zz_expire_contribution after insert on private.institutional_contribution_receipts for each row execute function pg_temp.expire_contribution_lease();
update public.processing_jobs set lease_expires_at=clock_timestamp()+interval '1 second' where id='80000000-0000-4000-8000-000000000873';
set local role authenticated;
do $$declare accepted boolean:=false;begin
 begin perform public.worker_apply_institutional_assumption_answer_v1('80000000-0000-4000-8000-000000000873',repeat('v',64),current_setting('test.institutional_application')::jsonb);accepted:=true;
 exception when insufficient_privilege then if sqlerrm<>'institutional_capture_denied' then raise;end if;end;
 if accepted then raise exception 'expired publication accepted';end if;
end $$;
reset role;
drop trigger zz_expire_contribution on private.institutional_contribution_receipts;
update public.processing_jobs set lease_expires_at=clock_timestamp()+interval '10 minutes' where id='80000000-0000-4000-8000-000000000873';
do $$begin
 if exists(select 1 from private.institutional_contribution_receipts where organization_id='20000000-0000-4000-8000-000000000871')
 or (select count(*) from private.institutional_model_configurations where organization_id='20000000-0000-4000-8000-000000000871')<>1 then raise exception 'expiry left orphan';end if;
end $$;
set local role authenticated;
select public.worker_apply_institutional_assumption_answer_v1('80000000-0000-4000-8000-000000000873',repeat('v',64),current_setting('test.institutional_application')::jsonb);
select public.worker_apply_institutional_assumption_answer_v1('80000000-0000-4000-8000-000000000873',repeat('v',64),current_setting('test.institutional_application')::jsonb);
do $$declare accepted boolean:=false;begin
 begin perform public.worker_apply_institutional_assumption_answer_v1('80000000-0000-4000-8000-000000000873',repeat('v',64),current_setting('test.institutional_application')::jsonb||'{"additional":"unbound"}'::jsonb);accepted:=true;
 exception when insufficient_privilege then if sqlerrm<>'institutional_contribution_replay_mismatch' then raise;end if;end;
 if accepted then raise exception 'altered application replay accepted';end if;
end $$;
reset role;
do $$declare r private.institutional_contribution_receipts; operation text; accepted boolean;begin
 select * into strict r from private.institutional_contribution_receipts where organization_id='20000000-0000-4000-8000-000000000871';
 if r.canonical_value<>'0.45' or r.prior_value<>'0.5' or r.period<>'2027' or r.assumption_id<>'cost-ratio'
 or r.binding is distinct from current_setting('test.institutional_request')::jsonb->'producerBinding'
 or r.application_fingerprint is distinct from private.institutional_config_hash(current_setting('test.institutional_application')::jsonb)
 or not exists(select 1 from private.institutional_model_configurations where id=r.parent_configuration_id and revision=1 and configuration_fingerprint=r.parent_fingerprint)
 or not exists(select 1 from private.institutional_model_configurations where id=r.candidate_id and revision=2 and status='review_required' and configuration_fingerprint=r.candidate_fingerprint)
 then raise exception 'incomplete contribution evidence';end if;
 if private.institutional_configuration_capture_state_v1(r.organization_id,r.candidate_id)->>'state'<>'unresolved' then raise exception 'transformation falsely closes ancestry';end if;
 foreach operation in array array['update private.institutional_contribution_receipts set canonical_value=''123''','delete from private.institutional_contribution_receipts','truncate private.institutional_contribution_receipts'] loop
  accepted:=false;begin execute operation;accepted:=true;exception when others then null;end;
  if accepted then raise exception 'mutable contribution receipt';end if;
 end loop;
 if not exists(select 1 from public.audit_events where resource_type='institutional_contribution_receipts') then raise exception 'missing audit';end if;
end $$;
-- Replay revalidates inputs; a stale receipt cannot bless a changed answer.
do $$declare mutation text;accepted boolean;begin
 foreach mutation in array array[
  'update public.agent_messages set content=''46'' where id=''90000000-0000-4000-8000-000000000871''',
  'update private.institutional_information_request_bindings set binding=binding||''{"unexpected":"changed"}''::jsonb where organization_id=''20000000-0000-4000-8000-000000000871'''
 ] loop
  begin
   begin execute mutation;
   exception when others then
    if sqlerrm='institutional_binding_immutable' and mutation like 'update private.institutional_information_request_bindings%' then continue;end if;raise;
   end;
   accepted:=false;
   begin perform public.worker_apply_institutional_assumption_answer_v1('80000000-0000-4000-8000-000000000873',repeat('v',64),current_setting('test.institutional_application')::jsonb);accepted:=true;
   exception when others then
    if sqlerrm not in ('institutional_response_binding_mismatch','institutional_contribution_replay_mismatch') then raise;end if;
   end;
   if accepted then raise exception 'changed evidence accepted on replay';end if;
   raise exception 'mutation_fixture_rollback' using errcode='ZX001';
  exception when sqlstate 'ZX001' then null;end;
 end loop;
end $$;
-- Review may change status; replay keeps the original parent ID and one receipt.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000871","role":"authenticated"}',true);
set local role authenticated;
select public.review_institutional_configuration_v1('30000000-0000-4000-8000-000000000871',(select (value->>'candidateId')::uuid from jsonb_array_elements(public.read_institutional_configuration_reviews_v1('30000000-0000-4000-8000-000000000871')) where value->>'revision'='2'),current_setting('test.institutional_application')::jsonb->>'expectedConfigurationFingerprint','approved',current_setting('test.institutional_application')::jsonb->>'nextConfigurationFingerprint');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000872","role":"authenticated"}',true);
do $$begin
 if public.worker_apply_institutional_assumption_answer_v1('80000000-0000-4000-8000-000000000873',repeat('v',64),current_setting('test.institutional_application')::jsonb)->>'replayed' is distinct from 'true' then raise exception 'review changed original parent';end if;
end $$;
reset role;
rollback;
