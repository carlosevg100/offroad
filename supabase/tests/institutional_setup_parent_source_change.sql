-- Changing source eligibility preserves the captured editorial parent and all source versions.
begin;
\ir support/institutional_closure_setup.sql
\ir support/institutional_contribution_builder.sql
select set_config('test.parent_contribution',pg_temp.add_ancestry_contribution(current_setting('test.setup_candidate_id')::uuid,'9')::text,true);
select set_config('test.parent_fp',(select configuration_fingerprint from private.institutional_model_configurations where id=current_setting('test.parent_contribution')::uuid),true);
set local role authenticated;
select public.review_institutional_configuration_v1('30000000-0000-4000-8000-000000000881',current_setting('test.parent_contribution')::uuid,current_setting('test.setup_candidate')::jsonb->>'configurationFingerprint','approved',
 current_setting('test.parent_fp'));
reset role;
update public.agent_messages set status='completed' where organization_id='20000000-0000-4000-8000-000000000881' and status in ('queued','processing');
-- Replacing a consumed but uncited source removes old calculation eligibility,
-- but cannot remove the editorial parent or its exclusive source version.
insert into public.source_documents(id,organization_id,intake_session_id,logical_source_id,object_path,original_name,sha256,document_version,sha256_verified_at,scan_result,processing_status,created_by)
select '50000000-0000-4000-8000-000000000884',organization_id,intake_session_id,logical_source_id,object_path||'.v2',original_name,repeat('e',64),2,clock_timestamp(),scan_result,processing_status,created_by from public.source_documents where id='50000000-0000-4000-8000-000000000882';
select set_config('test.setup_context',public.read_institutional_model_setup_v1('30000000-0000-4000-8000-000000000881')::text,true);
select set_config('test.next_submission',gen_random_uuid()::text,true);
set local role authenticated;
select public.submit_institutional_model_setup_v1('30000000-0000-4000-8000-000000000881',current_setting('test.setup_context')::jsonb->>'sourceManifestFingerprint',jsonb_set(current_setting('test.setup_configuration')::jsonb,'{assumptionBook,scenarioName}','"Second captured setup"'),current_setting('test.setup_sources')::jsonb,current_setting('test.next_submission')::uuid,'en-US');
reset role;
update public.processing_jobs set status='leased',attempts=1,lease_expires_at=clock_timestamp()+interval '10 minutes',capability_sha256=extensions.digest(repeat('w',64),'sha256') where payload->>'message_id'=current_setting('test.next_submission');
select set_config('test.next_job',(select id::text from public.processing_jobs where payload->>'message_id'=current_setting('test.next_submission')),true);
set local role authenticated;
select set_config('test.next_capture',public.worker_load_institutional_model_context_v3(current_setting('test.next_job')::uuid,repeat('w',64))::text,true);
reset role;
do $$declare s private.institutional_model_setup_submissions;c jsonb;conf jsonb;assumptions jsonb;overrides jsonb;begin
 select * into strict s from private.institutional_model_setup_submissions where id=current_setting('test.next_submission')::uuid;
 select jsonb_agg(value||jsonb_build_object('sourceType','offroad_scenario','confidence','low','evidence','[]'::jsonb) order by ord),jsonb_agg(jsonb_build_object('assumptionId',value->>'id','values',value->'values','rationale',value->>'rationale','requestedBy',s.submitted_by,'createdAt',s.submitted_at) order by ord) into assumptions,overrides from jsonb_array_elements(s.configuration#>'{assumptionBook,assumptions}') with ordinality a(value,ord);
 conf:=jsonb_set(jsonb_set(s.configuration,'{assumptionBook,assumptions}',assumptions),'{assumptionBook,overrides}',overrides,true);
 c:=current_setting('test.setup_candidate')::jsonb||jsonb_build_object('configuration',conf,'configurationFingerprint',pg_temp.fixture_institutional_hash(conf),'sourceBindings',s.source_reviews,'submission',jsonb_build_object('id',s.id,'actorId',s.submitted_by,'submittedAt',s.submitted_at));
 perform set_config('test.next_candidate',c::text,true);
end $$;

set local role authenticated;
select set_config('test.next_stored',public.worker_record_initial_institutional_candidate_v2(current_setting('test.next_job')::uuid,repeat('w',64),current_setting('test.next_submission')::uuid,current_setting('test.next_candidate')::jsonb,current_setting('test.next_capture')::jsonb->'setupInputSnapshot')::text,true);
reset role;
do $$declare c private.institutional_model_configurations;lineage jsonb;again jsonb;begin
 select * into strict c from private.institutional_model_configurations where id=(current_setting('test.next_stored')::jsonb->>'candidateId')::uuid;
 if jsonb_array_length(current_setting('test.next_capture')::jsonb->'approvedConfigurations')<>0 then raise exception 'source_replacement_did_not_remove_calculation_eligibility';end if;
 if c.parent_fingerprint is distinct from current_setting('test.parent_fp') then raise exception 'captured_parent_replaced_by_later_approval';end if;
 lineage:=private.institutional_configuration_ancestry_v1(c.organization_id,c.capital_project_id,c.id);
 if lineage->>'state'<>'captured_lineage' or jsonb_array_length(lineage->'nodes')<>3
  or lineage#>>'{nodes,0,kind}'<>'setup' or lineage#>>'{nodes,1,kind}'<>'contribution' or jsonb_array_length(lineage->'sources')<>3
 then raise exception 'mixed_setup_contribution_chain_invalid: %',lineage;end if;
 again:=public.worker_record_initial_institutional_candidate_v2(current_setting('test.next_job')::uuid,repeat('w',64),current_setting('test.next_submission')::uuid,current_setting('test.next_candidate')::jsonb,current_setting('test.next_capture')::jsonb->'setupInputSnapshot');
 if again->>'replayed'<>'true' then raise exception 'captured_parent_replay_changed';end if;
 begin
  update private.institutional_setup_parent_pins set parent_fingerprint=repeat('f',64) where snapshot_id=(current_setting('test.next_capture')::jsonb#>>'{setupInputSnapshot,id}')::uuid;
  raise exception 'parent_pin_mutable';
 exception when others then if sqlerrm<>'review_history_immutable' then raise;end if;end;
end $$;
rollback;
