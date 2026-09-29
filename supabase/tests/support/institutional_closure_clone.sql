-- Privileged synthetic snapshots for structural/race tests. Does not change old immutable rows.
create function pg_temp.clone_closure(p_context jsonb,p_rights uuid default null,p_bind boolean default true,p_bad_hash boolean default false,p_subject uuid default null) returns uuid language plpgsql as $$
declare j public.processing_jobs;m public.agent_messages;r private.institutional_model_results;
 s private.institutional_input_snapshots; b private.institutional_result_input_bindings;
 new_job uuid:=gen_random_uuid();new_result uuid:=gen_random_uuid();new_snapshot uuid:=gen_random_uuid();
begin
 select * into j from public.processing_jobs where id=current_setting('test.result_job')::uuid;
 select * into r from private.institutional_model_results where id=(j.payload->>'message_id')::uuid;
 select * into m from public.agent_messages where id=r.id;
 select * into s from private.institutional_input_snapshots where job_id=j.id;
 select * into b from private.institutional_result_input_bindings where result_id=r.id;
 m.id:=new_result;insert into public.agent_messages select (m).*;
 r.id:=new_result;insert into private.institutional_model_results(id,organization_id,capital_project_id,intake_session_id,configuration_id,configuration_fingerprint,source_manifest_fingerprint,status,artifact,blockers,requested_by,created_at,updated_at,canonical_revision_id,produced_at,superseded_by,recompute_candidate_id) values(r.id,r.organization_id,r.capital_project_id,r.intake_session_id,r.configuration_id,r.configuration_fingerprint,r.source_manifest_fingerprint,r.status,r.artifact,r.blockers,r.requested_by,r.created_at,r.updated_at,r.canonical_revision_id,r.produced_at,r.superseded_by,r.recompute_candidate_id);
 j.id:=new_job;j.payload:=jsonb_set(j.payload,'{message_id}',to_jsonb(new_result));insert into public.processing_jobs select (j).*;
 s.id:=new_snapshot;s.job_id:=new_job;s.result_id:=new_result;s.context:=p_context;
 s.context:=jsonb_set(s.context,'{modelResultRequest,id}',to_jsonb(new_result));
 s.subject_id:=coalesce(p_subject,s.subject_id);
 s.context_fingerprint:=private.institutional_config_hash(s.context);
 insert into private.institutional_input_snapshots select (s).*;
 insert into private.institutional_input_source_links(organization_id,snapshot_id,source_version_id,rights_version_id)
 select l.organization_id,new_snapshot,l.source_version_id,coalesce(p_rights,l.rights_version_id)
 from private.institutional_input_source_links l where l.snapshot_id=b.snapshot_id
 and exists(select 1 from jsonb_array_elements(s.context->'currentSources') x where x->>'sourceDocument'=l.source_version_id::text);
 if p_bind then b.id:=gen_random_uuid();b.result_id:=new_result;b.snapshot_id:=new_snapshot;
  if p_bad_hash then b.result_fingerprint:=repeat('f',64);end if;
  insert into private.institutional_result_input_bindings select (b).*;end if;
 return new_job;
end $$;
