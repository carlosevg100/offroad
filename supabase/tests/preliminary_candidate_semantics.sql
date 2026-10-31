-- The real capability-scoped RPC must carry the metadata used by the worker.
-- Synthetic identities and source declarations; caller owns no production data.
begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
update public.document_intake_sessions set current_run_id='a11b0000-0000-4000-9000-000000000005'
where id='a11b0000-0000-4000-9000-000000000003';
insert into public.intake_field_candidates(id,organization_id,intake_session_id,source_document_id,processing_run_id,extractor_key,field_path,field_group,label,raw_value,normalized_value,value_type,unit,currency,value_scale,period_start,period_end,entity_name,entity_scope,information_class,evidence_rank,source_anchor,confidence,extraction_method,anchor_verified,created_by)
values('a7720000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000004','a11b0000-0000-4000-9000-000000000005','synthetic-semantic-probe','transaction.desired_term_months','transaction','Documentary duration','120 dias','"120"','number','days','BRL',1,'2026-10-01','2026-10-29','Synthetic cedent','standalone','company_document',3,'{"quote":"Prazo de até 120 dias."}',0.99,'native_text',true,'a11b0000-0000-4000-8000-000000000001');
insert into public.intake_field_candidates(id,organization_id,intake_session_id,source_document_id,processing_run_id,extractor_key,field_path,field_group,label,raw_value,normalized_value,value_type,unit,information_class,evidence_rank,source_anchor,confidence,extraction_method,anchor_verified,review_state,reviewed_by,reviewed_at,created_by)
values('a7720000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000004','a11b0000-0000-4000-9000-000000000005','synthetic-rejected-probe','transaction.desired_term_months','transaction','Rejected interpretation','120 meses','"120"','number','months','company_document',3,'{"quote":"Prazo de 120 meses."}',0.99,'native_text',true,'rejected','a11b0000-0000-4000-8000-000000000001',now(),'a11b0000-0000-4000-8000-000000000001');
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,source_document_id,kind,status,payload,available_at,leased_by,leased_account_user_id,lease_expires_at,capability_sha256)
values('a7720000-0000-4000-9000-000000000002','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000005','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000004','preliminary_analysis','leased','{"analysis_scope":"preliminary_understanding"}',now(),'a3300000-0000-4000-8000-000000000001','a11b0000-0000-4000-8000-000000000002',now()+interval '10 minutes',extensions.digest(repeat('p',64),'sha256'));
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$
declare body jsonb; c jsonb;
begin
 body:=public.worker_load_preliminary_input_v2('a7720000-0000-4000-9000-000000000002',repeat('p',64));
 if exists(select 1 from jsonb_array_elements(body->'candidates') where value->>'id'='a7720000-0000-4000-9000-000000000003') then
  raise exception 'rejected_candidate_reentered_preliminary_input';
 end if;
 select value into strict c from jsonb_array_elements(body->'candidates') where value->>'id'='a7720000-0000-4000-9000-000000000001';
 if c->>'unit' is distinct from 'days' or c->>'normalized_value' is distinct from '120'
   or c->'source_anchor'->>'quote' is distinct from 'Prazo de até 120 dias.'
   or (c->>'anchor_verified')::boolean is distinct from true then
  raise exception 'preliminary_candidate_duration_semantics_missing';
 end if;
 if c->>'currency' is distinct from 'BRL' or (c->>'value_scale')::numeric is distinct from 1
   or c->>'period_start' is distinct from '2026-10-01' or c->>'period_end' is distinct from '2026-10-29'
   or c->>'entity_name' is distinct from 'Synthetic cedent' or c->>'entity_scope' is distinct from 'standalone'
   or c->>'review_state' is distinct from 'proposed' then
  raise exception 'preliminary_candidate_context_semantics_missing';
 end if;
 begin
  perform public.worker_load_preliminary_input_v2('a7720000-0000-4000-9000-000000000002',repeat('x',64));
  raise exception 'invalid_capability_loaded_candidate_semantics';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
do $$ begin
 begin
  perform public.worker_load_preliminary_input_v2('a7720000-0000-4000-9000-000000000002',repeat('p',64));
  raise exception 'other_identity_loaded_lease_candidate_semantics';
 exception when insufficient_privilege then null; end;
end $$;
select 'preliminary_candidate_semantics: PASS' as result;
rollback;
