-- Synthetic loopback E2E only: real parsed fragments, never a fabricated financial result.
begin;
select set_config('offroad.scope_session', :'session_id', true);
select set_config('offroad.scope_owner', :'owner_email', true);
select set_config('offroad.scope_fixture', :'fixture', true);
do $$
declare s public.document_intake_sessions; item jsonb; fixture jsonb:=current_setting('offroad.scope_fixture')::jsonb;
begin
 select intake.* into strict s from public.document_intake_sessions intake join auth.users u on u.id=intake.started_by
 where intake.id=current_setting('offroad.scope_session')::uuid and u.email=current_setting('offroad.scope_owner') and u.email like 'e2e-%@example.com';
 -- Intentionally incomplete company financial evidence: this case tests deterministic pool
 -- scope, not a provider-generated company brief. Keep the actual requested amount.
 delete from public.intake_field_candidates where organization_id=s.organization_id and intake_session_id=s.id
   and field_path ~ '^(historical_financials|interim_financials|projections|debt|leverage)[.]';
 for item in select value from jsonb_array_elements(fixture->'sources') loop
  insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,sha256,processing_status,scan_result,created_by)
  values((item->>'id')::uuid,s.organization_id,s.id,s.organization_id||'/'||s.id||'/'||(item->>'id'),item->>'name',item->>'sourceHash','ready','{"verdict":"clean"}',s.started_by);
  insert into private.receivables_evidence_fragments(organization_id,intake_session_id,source_document_id,document_version,processing_run_id,content_kind,schema_version,source_sha256,content_sha256,payload_sha256,uncompressed_bytes,compressed_payload)
  values(s.organization_id,s.id,(item->>'id')::uuid,1,s.current_run_id,item->>'contentKind','2026.08.28-v1',item->>'sourceHash',item->>'contentHash',item->>'payloadHash',(item->>'bytes')::integer,decode(item->>'payload','base64'));
 end loop;
 update public.document_intake_sessions set status='review_ready',
 result_summary=jsonb_set(coalesce(result_summary,'{}'),'{case_state}',coalesce(result_summary->'case_state','{}')||jsonb_build_object('receivablesVertical',fixture->'report')) where id=s.id;
end $$;
commit;
