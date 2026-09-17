begin;
\ir support/contextual_adoption_setup.sql
-- Exercise real legacy and explicit bindings through the installed triggers.
do $$ declare org uuid:='a11b0000-0000-4000-9000-000000000001'; actor uuid:='a11b0000-0000-4000-8000-000000000001'; company uuid; request uuid; opportunity uuid; run uuid; version uuid; fingerprint text; scenario uuid; begin
 insert into public.companies(organization_id,legal_name,jurisdiction_code,created_by) values(org,'Synthetic execution entity','BR',actor) returning id into company;
 insert into public.capital_requests(organization_id,company_id,purpose,requested_amount,currency,created_by) values(org,company,'Synthetic execution test',100,'BRL',actor) returning id into request;
 insert into public.opportunities(organization_id,company_id,capital_request_id,title,purpose,requested_amount,currency,lead_user_id,created_by) values(org,company,request,'Synthetic execution','Synthetic execution test',100,'BRL',actor,actor) returning id into opportunity;
 insert into public.calculation_runs(organization_id,opportunity_id,input_hash,engine_version,policy_version,status,created_by) values(org,opportunity,repeat('a',64),'synthetic-v1','synthetic-v1','complete',actor) returning id,adoption_basis_version_id into run,version;
 if (select classification from public.assumption_versions where id=version)<>'legacy_execution' then raise exception 'legacy producer was promoted to adoption'; end if;
 begin update public.calculation_runs set adoption_basis_fingerprint=repeat('0',64) where id=run; raise exception 'execution fingerprint overwritten'; exception when object_not_in_prerequisite_state then null; end;
 insert into public.structure_scenarios(organization_id,opportunity_id,name,scenario_kind,created_by) values(org,opportunity,'Synthetic legacy scenario','custom',actor) returning id into scenario;
 insert into public.scenario_versions(organization_id,structure_scenario_id,version_number,terms,input_hash,created_by) values(org,scenario,1,'{}',repeat('a',64),actor);
 version:=public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb||jsonb_build_object('workId',opportunity));
 select content_fingerprint into fingerprint from public.assumption_versions where id=version;
 insert into public.calculation_runs(organization_id,opportunity_id,input_hash,engine_version,policy_version,status,created_by,adoption_basis_version_id,adoption_basis_fingerprint) values(org,opportunity,repeat('b',64),'synthetic-v1','synthetic-v1','complete',actor,version,fingerprint);
 begin insert into public.calculation_runs(organization_id,opportunity_id,input_hash,engine_version,policy_version,status,created_by,adoption_basis_version_id,adoption_basis_fingerprint) values(org,opportunity,repeat('c',64),'synthetic-v1','synthetic-v1','complete',actor,version,repeat('c',64)); raise exception 'wrong fingerprint bound to execution'; exception when insufficient_privilege then null; end;
end $$;
-- The historical adapter can be exercised without fabricating absent historical input values.
select set_config('test.adoption.legacy',private.create_legacy_adoption_basis_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','claim_decisions',jsonb_build_object('id',gen_random_uuid(),'intake_session_id','a11b0000-0000-4000-9000-000000000003','decided_by','a11b0000-0000-4000-8000-000000000001','claim_fingerprint',repeat('a',64)))::text,true);
set local role authenticated;
do $$ declare v jsonb; begin
 v:=(public.read_adoption_basis_v1(current_setting('test.adoption.legacy')::uuid)->>'canonical')::jsonb;
 if v->>'classification'<>'legacy_execution' or v->>'inputAvailability'<>'not_reconstructed' or v ? 'entries' then raise exception 'legacy reference invented adopted inputs'; end if;
 if v->>'claimFingerprint'<>repeat('a',64) then raise exception 'legacy fingerprint changed'; end if;
end $$;
reset role;
do $$ declare t text; begin
 foreach t in array array['calculation_runs','structure_scenarios','scenario_versions','claim_decisions'] loop
  if (select count(*) from pg_attribute where attrelid=('public.'||t)::regclass and attname in ('adoption_basis_version_id','adoption_basis_fingerprint') and attnotnull)<>2 then raise exception 'execution binding nullable for %',t; end if;
  if not exists(select 1 from pg_trigger where tgrelid=('public.'||t)::regclass and tgfoid='private.bind_execution_adoption_v1()'::regprocedure and not tgisinternal) then raise exception 'execution binding trigger missing for %',t; end if;
 end loop;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
 begin perform public.read_adoption_basis_v1(current_setting('test.adoption.legacy')::uuid); raise exception 'legacy snapshot leaked to member'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'contextual_adoption_execution' as test,'PASS' as result;
rollback;
