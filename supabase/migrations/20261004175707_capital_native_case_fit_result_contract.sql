-- Correct the prospective guard to the published strict provider-case-fit.v1
-- product. Preserve recipe closure, exact predecessor, physical bytes and the
-- existing authority/retention/non-approval guards. Original stage SQL is immutable.
set search_path='';
do $patch$
declare definition text;needle text:=$needle$or(p_task_id in('M01','K02')and encode(extensions.digest(p_content->>'objective','sha256'),'hex')is distinct from r.objective_fingerprint)$needle$;replacement text:=$replacement$or((p_task_id='M01'or(p_task_id='K02'and r.family='provider_research'))and encode(extensions.digest(p_content->>'objective','sha256'),'hex')is distinct from r.objective_fingerprint)
 or(p_task_id='K02'and r.family='provider_case_fit'and(
 p_content?'objective'or p_content->>'organizationId'is distinct from r.organization_id::text or p_content->>'scope'is distinct from'research_case_fit'
 or p_content->>'planFingerprint'is distinct from r.plan_fingerprint
 or not exists(select 1 from public.capital_project_briefs brief where brief.organization_id=r.organization_id and brief.id=r.brief_id
 and brief.content_fingerprint=r.brief_fingerprint and
 p_content->'caseCriteria' = ((brief.content->'caseCriteria') || case when brief.content#>'{caseCriteria,sector}'is not null then jsonb_build_object('sector',btrim(brief.content#>>'{caseCriteria,sector}',U&' \0009\000a\000b\000c\000d\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff'))else'{}'::jsonb end || case when brief.content#>'{caseCriteria,geography}'is not null then jsonb_build_object('geography',btrim(brief.content#>>'{caseCriteria,geography}',U&' \0009\000a\000b\000c\000d\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff'))else'{}'::jsonb end)
 )))$replacement$;
begin
 definition:=pg_get_functiondef('private.worker_prepare_capital_native_result_v1(uuid,text,uuid,text,text,jsonb,uuid)'::regprocedure);
 if md5(definition) is distinct from '1e7ca172e2372ad4cd064a6e5104baca' then raise exception 'capital_native_casefit_installed_definition_drift';end if;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'capital_native_casefit_contract_guard_drift';end if;
 execute replace(definition,needle,replacement);
end $patch$;
revoke all on function private.worker_prepare_capital_native_result_v1(uuid,text,uuid,text,text,jsonb,uuid)from public,anon,authenticated,service_role;
grant execute on function private.worker_prepare_capital_native_result_v1(uuid,text,uuid,text,text,jsonb,uuid)to authenticated;
