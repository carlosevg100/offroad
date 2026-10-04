CREATE OR REPLACE FUNCTION private.worker_prepare_capital_native_result_v1(p_job_id uuid, p_capability_token text, p_recipe_id uuid, p_task_id text, p_artifact_type text, p_content jsonb, p_predecessor_revision_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_native_recipes;s private.capital_native_result_seals;
 previous private.capital_native_result_bindings;ps private.capital_native_result_seals;typ text;schema_name text;run uuid;input_fp text;body_fp text;expected_previous text;
begin
 select * into r from private.capital_native_recipes where organization_id=j.organization_id and id=p_recipe_id and job_id=j.id;
 if not found or private.capital_native_recipe_deadline_v1(r.organization_id,r.id,j.authorization_subject_id)is null
 or not exists(select 1 from private.capital_native_recipe_closures where organization_id=r.organization_id and recipe_id=r.id)then raise exception 'capital_native_result_recipe_denied'using errcode='42501';end if;
 typ:=r.family||case p_task_id when'M01'then'_scope'when'K01'then'_sources'when'K02'then''else'!denied'end;
 schema_name:=replace(r.family,'_','-')||case p_task_id when'M01'then'-scope.v1'when'K01'then'-sources.v1'when'K02'then case when r.executor_version='2026.09.10-v2' then'.v2'else'.v1'end end;
 if p_task_id not in('M01','K01','K02')or p_artifact_type is distinct from typ or jsonb_typeof(p_content)<>'object'
 or p_content->>'schemaVersion'is distinct from schema_name or p_content->>'projectId'is distinct from r.work_id::text or p_content->>'planId'is distinct from r.plan_id::text
 or (p_content->>'asOf')::timestamptz is distinct from r.as_of or((p_task_id='M01'or(p_task_id='K02'and r.family='provider_research'))and encode(extensions.digest(p_content->>'objective','sha256'),'hex')is distinct from r.objective_fingerprint)
 or(p_task_id='K02'and r.family='provider_case_fit'and(
 p_content?'objective'or p_content->>'organizationId'is distinct from r.organization_id::text or p_content->>'scope'is distinct from'research_case_fit'
 or p_content->>'planFingerprint'is distinct from r.plan_fingerprint
 or not exists(select 1 from public.capital_project_briefs brief where brief.organization_id=r.organization_id and brief.id=r.brief_id
 and brief.content_fingerprint=r.brief_fingerprint and
 p_content->'caseCriteria' = ((brief.content->'caseCriteria') || case when brief.content#>'{caseCriteria,sector}'is not null then jsonb_build_object('sector',btrim(brief.content#>>'{caseCriteria,sector}',U&' \0009\000a\000b\000c\000d\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff'))else'{}'::jsonb end || case when brief.content#>'{caseCriteria,geography}'is not null then jsonb_build_object('geography',btrim(brief.content#>>'{caseCriteria,geography}',U&' \0009\000a\000b\000c\000d\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff'))else'{}'::jsonb end)
 )))
 or(p_task_id='K02'and(p_content->'shortlistAuthorized'is distinct from'false'::jsonb or p_content->'externalEffectAllowed'is distinct from'false'::jsonb))
 or(p_content?'grantsApproval')or(p_content?'grantsExternalEffect')then raise exception 'capital_native_result_content_denied'using errcode='22023';end if;
 if r.catalog_fingerprint is not null and p_content#>>'{publicCatalog,sourceFingerprint}'is distinct from r.catalog_fingerprint then raise exception 'capital_native_result_catalog_denied'using errcode='22023';end if;
 expected_previous:=case p_task_id when'K01'then'M01'when'K02'then'K01'end;
 if expected_previous is null then
 if p_predecessor_revision_id is not null then raise exception 'capital_native_result_dependencies_denied'using errcode='22023';end if;
 else
 select b.* into previous from private.capital_native_result_bindings b join private.capital_native_result_seals seal on seal.organization_id=b.organization_id and seal.id=b.seal_id
 where b.organization_id=r.organization_id and b.revision_id=p_predecessor_revision_id and b.recipe_id=r.id and seal.task_id=expected_previous;
 if not found or not private.capital_body_physical_receipt_v1(r.organization_id,previous.retained_payload_id)then raise exception 'capital_native_result_dependencies_denied'using errcode='42501';end if;
 end if;
 input_fp:=encode(extensions.digest(jsonb_build_object('schemaVersion','capital-native-provider-input.v1','recipeId',r.id,'contextFingerprint',r.context_fingerprint,'taskId',p_task_id,
 'artifactType',typ,'executorVersion',r.executor_version,'predecessorRevisionId',previous.revision_id,'predecessorFingerprint',previous.artifact_fingerprint)::text,'sha256'),'hex');
 body_fp:=encode(extensions.digest(p_content::text,'sha256'),'hex');
 if not pg_try_advisory_xact_lock(hashtextextended('capital-native-task:'||r.organization_id::text||':'||r.id::text||':'||p_task_id,0))then raise exception 'capital_capture_retry'using errcode='40001';end if;
 select * into s from private.capital_native_result_seals where organization_id=r.organization_id and recipe_id=r.id and task_id=p_task_id;
 if found then
 if s.input_fingerprint<>input_fp or s.body_fingerprint<>body_fp or s.body_byte_length<>octet_length(p_content::text)or s.predecessor_result_id is distinct from previous.id then raise exception 'capital_native_result_conflict'using errcode='23505';end if;
 if exists(select 1 from private.capital_native_result_bindings where organization_id=r.organization_id and seal_id=s.id)then raise exception 'capital_native_result_recovery_required'using errcode='42501';end if;
 else
 run:=private.worker_start_capital_project_task(j.id,p_capability_token,p_task_id,r.family,r.executor_version,input_fp,
 jsonb_build_object('schemaVersion','capital-native-provider-task-context.v1','recipeId',r.id,'contextFingerprint',r.context_fingerprint,'modelCalls',0));
 insert into private.capital_native_result_seals(organization_id,work_id,recipe_id,task_id,artifact_type,task_run_id,input_fingerprint,body_fingerprint,body_byte_length,predecessor_result_id)
 values(r.organization_id,r.work_id,r.id,p_task_id,typ,run,input_fp,body_fp,octet_length(p_content::text),previous.id)returning * into s;
 end if;
 return jsonb_build_object('schemaVersion','capital-native-result-preparation.v1','recipeId',r.id,'sealId',s.id,'taskRunId',s.task_run_id,'taskId',s.task_id,'artifactType',s.artifact_type,
 'inputFingerprint',s.input_fingerprint,'body',private.capital_native_allocate_body_v1(j.id,p_capability_token,r.id,'native_deterministic_result',p_task_id,typ,p_content));
end$function$
