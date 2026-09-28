begin;
\ir support/institutional_contribution_pending.sql
set local role authenticated;
do $$ declare result jsonb; accepted boolean; broken jsonb; begin
 foreach broken in array array[
  current_setting('test.institutional_application')::jsonb-'willExecute',
  jsonb_set(current_setting('test.institutional_application')::jsonb,'{nextConfiguration,currency}','"USD"'),
  jsonb_set(current_setting('test.institutional_application')::jsonb,'{answerEvidence,answeredBy}','"10000000-0000-4000-8000-000000000872"')
 ] loop
  accepted:=false;
  begin perform public.worker_apply_institutional_assumption_answer_v1('80000000-0000-4000-8000-000000000873',repeat('v',64),broken);accepted:=true;exception when others then null;end;
  if accepted then raise exception 'malformed candidate accepted';end if;
 end loop;
 result:=public.worker_apply_institutional_assumption_answer_v1('80000000-0000-4000-8000-000000000873',repeat('v',64),current_setting('test.institutional_application')::jsonb);
 if result->>'replayed' is distinct from 'false' then raise exception 'candidate not created'; end if;
 result:=public.worker_apply_institutional_assumption_answer_v1('80000000-0000-4000-8000-000000000873',repeat('v',64),current_setting('test.institutional_application')::jsonb);
 if result->>'replayed' is distinct from 'true' then raise exception 'candidate not idempotent'; end if;
 accepted:=false;
 begin perform public.worker_apply_institutional_assumption_answer_v1('80000000-0000-4000-8000-000000000873',repeat('v',64),jsonb_set(current_setting('test.institutional_application')::jsonb,'{answerEvidence,canonicalValue}','"999"'));accepted:=true;exception when others then null;end;
 if accepted then raise exception 'replay accepted altered evidence';end if;
 accepted:=false;
 begin perform public.review_institutional_configuration_v1('30000000-0000-4000-8000-000000000871',(result->>'candidateId')::uuid,current_setting('test.institutional_application')::jsonb->>'expectedConfigurationFingerprint','approved',current_setting('test.institutional_application')::jsonb->>'nextConfigurationFingerprint');accepted:=true;exception when insufficient_privilege then null;end;
 if accepted then raise exception 'worker actor reviewed without project access';end if;

 if public.worker_load_institutional_configuration_v1('80000000-0000-4000-8000-000000000873',repeat('v',64))->>'revision' is distinct from '1' then raise exception 'proposal silently replaced approved configuration'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.institutional_model_configurations where capital_project_id='30000000-0000-4000-8000-000000000871')<>2 then raise exception 'unexpected revision count';end if;
 if not exists(select 1 from pg_class where oid='private.institutional_model_configurations'::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'RLS missing';end if;
 if has_table_privilege('authenticated','private.institutional_model_configurations','SELECT') then raise exception 'private configuration exposed';end if;
 if not exists(select 1 from public.audit_events where resource_type='institutional_model_configurations') then raise exception 'revision audit missing';end if;
end $$;
-- Two proposed alternatives may share a parent; a stale sibling must remain rejectable.
insert into private.institutional_model_configurations(organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status)
select organization_id,capital_project_id,3,jsonb_set(configuration,'{assumptionBook,scenarioId}','"synthetic-sibling"'),private.institutional_config_hash(jsonb_set(configuration,'{assumptionBook,scenarioId}','"synthetic-sibling"')),parent_fingerprint,'review_required'
from private.institutional_model_configurations where capital_project_id='30000000-0000-4000-8000-000000000871' and revision=2;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000871","role":"authenticated"}',true);
set local role authenticated;
do $$ declare reviews jsonb; candidate jsonb; begin
 reviews:=public.read_institutional_configuration_reviews_v1('30000000-0000-4000-8000-000000000871');
 select value into candidate from jsonb_array_elements(reviews) where value->>'revision'='2';
 if candidate->>'status' is distinct from 'review_required' then raise exception 'review candidate missing';end if;
 perform public.review_institutional_configuration_v1('30000000-0000-4000-8000-000000000871',(candidate->>'candidateId')::uuid,candidate->>'parentFingerprint','approved',candidate->>'configurationFingerprint');
 if not exists(select 1 from jsonb_array_elements(public.read_institutional_configuration_reviews_v1('30000000-0000-4000-8000-000000000871')) where value->>'revision'='2' and value->>'status'='approved') then raise exception 'explicit review failed';end if;
 -- Replay uses the bound worker account, then returns to the human reviewer.
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000872","role":"authenticated"}',true);
 if (public.worker_load_institutional_configuration_v1('80000000-0000-4000-8000-000000000873',repeat('v',64))->>'revision') is distinct from '1' then raise exception 'retry parent changed';end if;
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000871","role":"authenticated"}',true);
end $$;
do $$ declare sibling jsonb; accepted boolean:=false; begin
 select value into sibling from jsonb_array_elements(public.read_institutional_configuration_reviews_v1('30000000-0000-4000-8000-000000000871')) where value->>'revision'='3';
 begin perform public.review_institutional_configuration_v1('30000000-0000-4000-8000-000000000871',(sibling->>'candidateId')::uuid,sibling->>'parentFingerprint','approved',sibling->>'configurationFingerprint');accepted:=true;exception when serialization_failure then null;end;
 if accepted then raise exception 'stale sibling approved';end if;
 perform public.review_institutional_configuration_v1('30000000-0000-4000-8000-000000000871',(sibling->>'candidateId')::uuid,sibling->>'parentFingerprint','rejected',sibling->>'configurationFingerprint');
end $$;
rollback;
