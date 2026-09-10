-- Local Playwright inputs only: reconciled synthetic source facts, never model outputs,
-- approval receipts or completed financial calculations. No trigger/guard is disabled.
begin;
select set_config('e2e.setup_email', :'email', true);
select set_config('e2e.setup_facts', :'facts', true);
do $$declare actor uuid;org uuid;s public.document_intake_sessions;r uuid:=gen_random_uuid();d uuid:=gen_random_uuid();begin
 if current_setting('e2e.setup_email') not like 'e2e-institutional-%@example.com' then raise exception 'Synthetic E2E account required';end if;
 select id into strict actor from auth.users where email=current_setting('e2e.setup_email');
 select id into strict org from public.organizations where created_by=actor;
 select * into strict s from public.document_intake_sessions where organization_id=org order by created_at limit 1;
 if s.capital_project_id is null then raise exception 'Synthetic onboarding project absent';end if;
 insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by) values(r,org,s.id,1,'manual','succeeded','synthetic-reconciled-input-v1',actor);
 insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,sha256,sha256_verified_at,scan_result,processing_status,created_by)
 values(d,org,s.id,org::text||'/'||s.id::text||'/synthetic-accounts.xlsx','Synthetic reconciled accounts.xlsx',repeat('a',64),now(),'{"verdict":"clean"}','ready',actor);
 insert into public.processing_jobs(organization_id,processing_run_id,intake_session_id,source_document_id,kind,status,payload)
 values(org,r,s.id,d,'document_pipeline','succeeded',jsonb_build_object('sha256',repeat('a',64),'document_version',1));
 insert into public.intake_field_candidates(organization_id,intake_session_id,source_document_id,processing_run_id,extractor_key,field_path,field_group,label,normalized_value,value_type,information_class,evidence_rank,source_anchor,confidence,anchor_verified,period_start,period_end,entity_name,entity_scope,review_state,reviewed_by,reviewed_at,currency,unit,value_scale,extraction_method,created_by)
 select org,s.id,d,r,f#>>'{key,fieldPath}',f#>>'{key,fieldPath}','historical_financials',f#>>'{key,fieldPath}',(f->>'value')::jsonb,'number','audited',1,f#>'{accepted,anchor}',1,true,(f#>>'{accepted,periodStart}')::date,(f#>>'{accepted,periodEnd}')::date,f#>>'{accepted,entityName}',f#>>'{accepted,entityScope}','accepted',actor,now(),'BRL','currency',1,'user_entry',actor from jsonb_array_elements(current_setting('e2e.setup_facts')::jsonb) f;
 update public.document_intake_sessions set status='review_ready',current_run_id=r where id=s.id;
 perform set_config('e2e.setup_project',s.capital_project_id::text,true);
end $$;
select current_setting('e2e.setup_project');
commit;
