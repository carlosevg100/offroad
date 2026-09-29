-- Synthetic derivative with a source that the institutional binding never consumed.
create function pg_temp.native_derivative(p_result uuid,p_source uuid,p_actor uuid,p_expires timestamptz default null) returns uuid language plpgsql as $$
declare b private.institutional_native_bindings;r public.artifact_revisions;session_id uuid;right_id uuid;written jsonb;begin
 select * into strict b from private.institutional_native_bindings where result_id=p_result;
 select * into strict r from public.artifact_revisions where id=b.revision_id;
 select intake_session_id into session_id from private.institutional_model_results where id=p_result;
 insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,sha256,sha256_verified_at,scan_result,processing_status,created_by)
 values(p_source,b.organization_id,session_id,b.organization_id::text||'/'||session_id::text||'/derived-only.txt','Synthetic derived-only.txt',repeat('e',64),now(),'{"verdict":"clean"}','ready',p_actor);
 if not exists(select 1 from private.source_rights_versions where source_version_id=p_source) then
  perform public.set_source_rights_v1(p_source,0,array['read','process','store','derive','export'],array['analysis'],null,null,p_source,repeat('a',64));
 end if;
 if p_expires is not null then perform public.set_source_rights_v1(p_source,1,array['read','process','store','derive','export'],array['analysis'],p_expires,null,p_source,repeat('b',64));end if;
 select id into strict right_id from private.source_rights_versions where source_version_id=p_source order by revision desc limit 1;
 written:=private.create_artifact_revision_v1(b.organization_id,b.work_id,'model_result','native-derived-exclusive-source','internal','worker',
  jsonb_set(r.manifest,'{sources}',(r.manifest->'sources')||jsonb_build_array(jsonb_build_object('sourceVersionId',p_source,'rightsVersionId',right_id))),
  '[]',jsonb_build_array(jsonb_build_object('kind','artifact_revision','derivedFromRevisionId',r.id)),null,null,null,null,p_actor);
 if exists(select 1 from jsonb_array_elements(b.closure->'sources') pin where pin->>'sourceVersionId'=p_source::text) then raise exception 'derivative_fixture_source_in_binding';end if;
 return (written->>'revision_id')::uuid;
end $$;
