-- Run ONLY against isolated disposable CI with FORWARD16 already installed.
-- No pending DDL replay. All fixture, baseline and inspection rows/functions roll back.
\set ON_ERROR_STOP on
begin;
-- Proposed installed test path: supabase/tests/work_review_dashboard_metadata.sql
\ir support/artifact_revision_setup.sql
-- Audit the exact installed RPC and support-helper overloads before the first act.
do $$declare v_expected record;v_oid oid;v_defaults integer;begin
 for v_expected in select * from(values
 ('public.set_source_rights_v1(uuid,integer,text[],text[],timestamp with time zone,timestamp with time zone,uuid,text)',0),
 ('public.record_work_report_v1(uuid,text,jsonb,text,uuid)',0),
 ('public.reaffirm_work_revision_v1(uuid,uuid,text,uuid,text,boolean,uuid)',0),
 ('public.review_artifact_revision_v1(uuid,text,text,uuid,text,boolean,uuid,uuid)',1),
 ('public.read_work_review_dashboard_v1(uuid,uuid,uuid)',2),
 ('pg_temp.manifest(text,text,jsonb,jsonb,jsonb,text,jsonb)',3),
 ('pg_temp.person_write(text,text,text,jsonb,jsonb,jsonb,text,bigint)',3),
 ('pg_temp.source_ref(uuid)',0),('pg_temp.val(text,text)',0)
 )as contracts(signature,defaults_count)loop
  v_oid:=to_regprocedure(v_expected.signature)::oid;
  if v_oid is null then raise exception 'dashboard_metadata_fixture_rpc_missing:%',v_expected.signature;end if;
  select p.pronargdefaults into v_defaults from pg_proc p where p.oid=v_oid;
  if v_defaults is distinct from v_expected.defaults_count then raise exception 'dashboard_metadata_fixture_rpc_defaults_changed:%',v_expected.signature;end if;
 end loop;
end$$;
-- Build an owner-only test baseline from the exact old internal call; all other
-- dashboard code is byte-identical. This function cannot be called from the API.
do $$declare definition text;needle text:='v:=private.read_artifact_revision_review_metadata_v1(r.id);';begin
 definition:=pg_get_functiondef('private.read_work_review_dashboard_v1(uuid,uuid,uuid)'::regprocedure);
 if length(definition)-length(replace(definition,needle,''))<>length(needle)then raise exception 'metadata_test_candidate_call_missing';end if;
 definition:=replace(definition,'private.read_work_review_dashboard_v1(', 'private.dashboard_metadata_baseline_eval_v1(');
 definition:=replace(definition,needle,'v:=private.read_artifact_revision_reviews_v1(r.id);');
 execute definition;
end$$;
revoke all on function private.dashboard_metadata_baseline_eval_v1(uuid,uuid,uuid)from public,anon,authenticated,service_role;
create function pg_temp.assert_dashboard_metadata_parity(p_work uuid,p_before uuid default null,p_before_decision uuid default null)returns void
language plpgsql security definer set search_path=''as $$
declare before_dto jsonb;after_dto jsonb;item record;full_dto jsonb;metadata_dto jsonb;begin
 before_dto:=private.dashboard_metadata_baseline_eval_v1(p_work,p_before,p_before_decision);
 after_dto:=private.read_work_review_dashboard_v1(p_work,p_before,p_before_decision);
 if before_dto is distinct from after_dto then raise exception 'dashboard_metadata_full_dto_parity_failed';end if;
 for item in select r.id from public.artifact_revisions r join public.artifacts a on(a.organization_id,a.id)=(r.organization_id,r.artifact_id)where a.work_id=p_work loop
  full_dto:=private.read_artifact_revision_reviews_v1(item.id);
  metadata_dto:=private.read_artifact_revision_review_metadata_v1(item.id);
  if(full_dto-array['snapshot','freshness','release','policy'])is distinct from metadata_dto then raise exception 'dashboard_metadata_reader_projection_parity_failed';end if;
 end loop;
end$$;
revoke all on function pg_temp.assert_dashboard_metadata_parity(uuid,uuid,uuid)from public,anon,authenticated,service_role;
do $$declare v_org uuid:='a11b0000-0000-4000-9000-000000000001';v_work uuid:='a11b0000-0000-4000-9000-000000000002';v_actor uuid:='a11b0000-0000-4000-8000-000000000001';v_b jsonb;v_m jsonb;v_r1 jsonb;v_r2 jsonb;v_review jsonb;v_report jsonb;v_source uuid;v_sourced jsonb;v_metadata jsonb;v_revision integer;begin
 insert into public.organization_review_policies(organization_id,self_approval_allowed,assignment_required,updated_by)values(v_org,true,false,v_actor)on conflict(organization_id)do update set self_approval_allowed=true,assignment_required=false;
 v_b:=jsonb_build_array(pg_temp.block('metadata-note','paragraph','{"text":"Synthetic metadata parity note."}'));
 v_m:=pg_temp.manifest('answer','internal','[]','[]',null,'json',jsonb_build_object('template',jsonb_build_object('templateVersionId','metadata-start','fingerprint',repeat('1',64))));
 v_r1:=pg_temp.person_write('answer','metadata-parity','internal',v_m,v_b);
 perform pg_temp.assert_dashboard_metadata_parity(v_work);
 set local role authenticated;
 v_review:=public.review_artifact_revision_v1((v_r1->>'revision_id')::uuid,v_r1->>'manifest_fingerprint','approve',null,null,true,gen_random_uuid());
 reset role;
 perform pg_temp.assert_dashboard_metadata_parity(v_work);
 v_m:=jsonb_set(v_m,'{template,templateVersionId}','"metadata-layout"');
 v_r2:=pg_temp.person_write('answer','metadata-parity','internal',v_m,v_b);
 perform pg_temp.assert_dashboard_metadata_parity(v_work);
 perform pg_temp.assert_dashboard_metadata_parity(v_work,(v_r2->>'revision_id')::uuid,null);
 set local role authenticated;
 perform public.reaffirm_work_revision_v1(v_work,(v_r2->>'revision_id')::uuid,v_r2->>'manifest_fingerprint',(v_review->>'reviewId')::uuid,'Synthetic unchanged basis',true,gen_random_uuid());
 reset role;
 perform pg_temp.assert_dashboard_metadata_parity(v_work);
 set local role authenticated;
 perform public.review_artifact_revision_v1((v_r1->>'revision_id')::uuid,v_r1->>'manifest_fingerprint','revoke_approval',null,'Synthetic original basis revoked',true,gen_random_uuid(),(v_review->>'reviewId')::uuid);
 reset role;
 perform pg_temp.assert_dashboard_metadata_parity(v_work);
 -- Material content still uses the existing classifier and requires a fresh human act.
 v_b:=jsonb_set(v_b,'{0,content,text}','"Synthetic changed metadata parity conclusion."');
 v_m:=jsonb_set(v_m,'{template,templateVersionId}','"metadata-material"');
 v_r2:=pg_temp.person_write('answer','metadata-parity','internal',v_m,v_b);
 perform pg_temp.assert_dashboard_metadata_parity(v_work);
 set local role authenticated;
 v_report:=public.record_work_report_v1(v_work,'metadata-parity-report','{"decidedBy":"Synthetic Board","forum":"Synthetic session","decidedOn":"2026-10-04","evidenceSourceVersionId":null}','Synthetic no effect',gen_random_uuid());
 reset role;
 perform pg_temp.assert_dashboard_metadata_parity(v_work,null,(v_report->>'decisionId')::uuid);
 -- Real current rights change through the public source command, not an authority mock.
 v_source:=pg_temp.val('source_a','')::uuid;
 v_m:=pg_temp.manifest('answer','internal',jsonb_build_array(pg_temp.source_ref(v_source)),pg_temp.summary(v_b));
 v_sourced:=pg_temp.person_write('answer','metadata-source-revocation','internal',v_m,v_b);
 perform pg_temp.assert_dashboard_metadata_parity(v_work);
 select max(r.revision)into v_revision from private.source_rights_versions r where r.organization_id=v_org and r.source_version_id=v_source;
 set local role authenticated;
 perform public.set_source_rights_v1(v_source,v_revision,array[]::text[],array['analysis','retrieval'],null,null,gen_random_uuid(),repeat('e',64));
 reset role;
 v_metadata:=private.read_artifact_revision_review_metadata_v1((v_sourced->>'revision_id')::uuid);
 if v_metadata->>'withheld' is distinct from'true' or v_metadata?'artifact' or v_metadata?'preparedBy' or v_metadata?'snapshot' or v_metadata?'policy'
 then raise exception 'dashboard_metadata_source_revocation_leaked';end if;
 perform pg_temp.assert_dashboard_metadata_parity(v_work);
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');
 perform pg_temp.refused(format('select public.read_work_review_dashboard_v1(%L)',v_work),'review_work_access_required','metadata membership-only work denial');
 perform pg_temp.act_as(v_actor);
end$$;
-- New internal helper is owner-only; complete public reader/dashboard unchanged.
do $$declare v_role text;v_oid oid:=to_regprocedure('private.read_artifact_revision_review_metadata_v1(uuid)');begin
 if not exists(select 1 from pg_proc where oid=v_oid and prosecdef and proconfig=array['search_path=""']::text[])then raise exception 'dashboard_metadata_helper_config_changed';end if;
 if length((select prosrc from pg_proc where oid=v_oid))-length(replace((select prosrc from pg_proc where oid=v_oid),'private.artifact_review_sources_allowed_v1(org,r.id,actor)',''))<>2*length('private.artifact_review_sources_allowed_v1(org,r.id,actor)')
 or position('if not private.artifact_review_sources_allowed_v1(org,r.id,actor) then return jsonb_build_object(''revisionId'',r.id,''withheld'',true,''reviews'',''[]''::jsonb);end if;'in(select prosrc from pg_proc where oid=v_oid))=0
 then raise exception 'dashboard_metadata_final_source_reauthorization_missing';end if;
 if md5((select prosrc from pg_proc where oid='private.read_artifact_revision_reviews_v1(uuid)'::regprocedure))<>'bcb2f0422db072920f3dc328ca07da52'then raise exception 'dashboard_metadata_complete_reader_changed';end if;

 foreach v_role in array array['anon','authenticated','service_role']loop
  if has_function_privilege(v_role,v_oid,'EXECUTE')then raise exception 'dashboard_metadata_helper_api_exposed';end if;
 end loop;
 if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))g where p.oid=v_oid and g.grantee=0 and g.privilege_type='EXECUTE')then raise exception 'dashboard_metadata_helper_public_exposed';end if;
 if not has_function_privilege('authenticated','public.read_work_review_dashboard_v1(uuid,uuid,uuid)','EXECUTE')or has_function_privilege('anon','public.read_work_review_dashboard_v1(uuid,uuid,uuid)','EXECUTE')or has_function_privilege('service_role','public.read_work_review_dashboard_v1(uuid,uuid,uuid)','EXECUTE')then raise exception 'dashboard_metadata_public_acl_changed';end if;
end$$;
set local role authenticated;
do $$begin
 begin perform private.read_artifact_revision_review_metadata_v1(null);raise exception 'metadata_helper_authenticated_bypass';exception when insufficient_privilege then
  if sqlerrm not in('permission denied for function read_artifact_revision_review_metadata_v1','permission denied for schema private')then raise;end if;
 end;
end$$;
reset role;
set local role anon;
do $$begin
 begin perform private.read_artifact_revision_review_metadata_v1(null);raise exception 'metadata_helper_anon_bypass';exception when insufficient_privilege then
  if sqlerrm not in('permission denied for function read_artifact_revision_review_metadata_v1','permission denied for schema private')then raise;end if;
 end;
end$$;
reset role;
set local role service_role;
do $$begin
 begin perform private.read_artifact_revision_review_metadata_v1(null);raise exception 'metadata_helper_service_bypass';exception when insufficient_privilege then
  if sqlerrm not in('permission denied for function read_artifact_revision_review_metadata_v1','permission denied for schema private')then raise;end if;
 end;
end$$;
reset role;
select 'dashboard_metadata_parity_and_current_rights' as test,'PASS' as result;
rollback;
