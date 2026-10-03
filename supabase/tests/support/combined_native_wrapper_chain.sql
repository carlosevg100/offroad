-- Catalogue/ACL proof only. Runtime denial suites are run separately below.
begin;
set local search_path='';
do $$declare item record;body text;role_name text;
begin
 for item in select * from(values
 ('private.review_basis_receipt_authority_v1(uuid,uuid,text,jsonb,uuid)','private.review_basis_receipt_authority_before_work_update_v2('),
 ('private.review_basis_receipt_authority_before_work_update_v2(uuid,uuid,text,jsonb,uuid)','private.review_basis_receipt_authority_pre_debt_v1('),
 ('private.review_basis_receipt_authority_pre_debt_v1(uuid,uuid,text,jsonb,uuid)','private.review_basis_receipt_authority_pre_s11_v1(')
 )as chain(signature,expected_call) loop
  body:=pg_get_functiondef(item.signature::regprocedure);
  if position(item.expected_call in body)=0 then raise exception 'combined_native_wrapper_chain_lost';end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(role_name,item.signature,'EXECUTE') then raise exception 'combined_native_receipt_authority_exposed';end if;
  end loop;
 end loop;
 body:=pg_get_functiondef('private.worker_commit_capital_m07_result_v1(uuid,text,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure);
 if position('private.capital_m07_commit_result_core_v1(' in body)=0
 or position('private.worker_record_m07_assessment_index_v1(' in body)=0
 or position('private.capital_public_capture_clock_current_v1(' in body)=0 then raise exception 'combined_native_m07_atomic_index_or_authority_lost';end if;
 if to_regprocedure('private.assessment_input_snapshot_before_institutional_v1(uuid,uuid,uuid)')is null
 or to_regprocedure('private.assessment_input_snapshot_before_research_v1(uuid,uuid,uuid)')is null then raise exception 'combined_native_snapshot_authority_chain_lost';end if;
 raise notice 'PASS combined native receipt authority chain and M07 atomic index; catalogue/ACL only';
end$$;
rollback;
