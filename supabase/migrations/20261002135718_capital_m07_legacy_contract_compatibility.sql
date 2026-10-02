-- Forward correction: native M07 keeps all admission/commit guards. Unconverted
-- families retain their own established job-capability and authorization checks.
-- No table, API grant, history or previously applied migration is changed.
set search_path='';
do $fix$
declare target record;definition text;patched text;
begin
 for target in select * from (values
  ('artifact',pg_get_functiondef('private.worker_record_capital_project_artifact(uuid,text,uuid,text,text,text,text,jsonb,jsonb,jsonb)'::regprocedure)),
  ('task',pg_get_functiondef('private.worker_finish_capital_project_task(uuid,text,uuid,text,jsonb,text,jsonb,jsonb,jsonb)'::regprocedure))
 ) as targets(name,body) loop
  definition:=target.body;
  patched:=replace(definition,'declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);',
   'declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);');
  if patched=definition or position('capital_m07_native_commit_required' in patched)=0
   or position('_pre_m07(' in patched)=0 then
   raise exception 'capital_m07_compatibility_patch_mismatch: %',target.name;
  end if;
  execute patched;
 end loop;
end $fix$;
do $fix$
declare definition text:=pg_get_functiondef('private.read_artifact_revision_v1(uuid)'::regprocedure);patched text;
begin
 patched:=replace(definition,'result:=private.read_artifact_revision_pre_m07_v1(p_revision);',
  E'result:=private.read_artifact_revision_pre_m07_v1(p_revision);\n -- Preserve the common reader\'s complete denial and ancestry frontier.\n if result->\'restriction\' is distinct from \'null\'::jsonb then return result;end if;');
 if patched=definition or position('capital_m07_native_ancestry_allowed_v1' in patched)=0 then
  raise exception 'capital_m07_reader_compatibility_patch_mismatch';
 end if;
 execute patched;
end $fix$;
