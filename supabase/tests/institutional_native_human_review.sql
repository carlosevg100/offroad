-- Exact human review over a prospectively captured synthetic institutional result.
begin;
\ir support/institutional_closure_setup.sql
set local role authenticated;
select set_config('test.native_capture',public.worker_load_institutional_model_context_v2(current_setting('test.result_job')::uuid,repeat('x',64))::text,true);
select set_config('test.native_result',public.worker_record_institutional_model_result_v3(current_setting('test.result_job')::uuid,repeat('x',64),jsonb_build_object('status','completed','artifact',current_setting('test.result_artifact')::jsonb,'inputSnapshot',current_setting('test.native_capture')::jsonb->'inputSnapshot'))::text,true);
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000881","role":"authenticated"}',true);
do $test$
declare b private.institutional_native_bindings;r public.artifact_revisions;old public.artifact_revisions;ctx jsonb;act jsonb;again jsonb;payload jsonb;derived jsonb;dr public.artifact_revisions;
 cmd uuid:=gen_random_uuid();revoke_cmd uuid:=gen_random_uuid();accepted boolean:=false;
begin
 select * into strict b from private.institutional_native_bindings where revision_id=(current_setting('test.native_result')::jsonb#>>'{nativeProjection,revisionId}')::uuid;
 select * into strict r from public.artifact_revisions where id=b.revision_id;
 select * into strict old from public.artifact_revisions where id=b.ancestor_revision_id;
 if private.artifact_revision_release_v1(r)<>'internal' or private.artifact_revision_release_v1(old)<>'blocked' then raise exception 'native_review_legacy_release_bypass';end if;
 payload:=private.institutional_native_result_content_v1(b.organization_id,b.result_id);
 if payload->'artifact' is distinct from current_setting('test.result_artifact')::jsonb then raise exception 'native_review_content_changed';end if;
 if public.read_institutional_workbook_binding_v1(b.work_id,payload#>>'{artifact,fingerprint}')->>'revisionId'<>r.id::text then raise exception 'native_review_copied_workbook_missing';end if;
 derived:=private.create_artifact_revision_v1(b.organization_id,b.work_id,'model_result','legacy-derived-review-bypass','internal','worker',
  jsonb_set(r.manifest,'{provenance,messageId}',to_jsonb(gen_random_uuid()::text)),'[]',jsonb_build_array(jsonb_build_object('kind','artifact_revision','derivedFromRevisionId',old.id)),null,null,null,null,auth.uid());
 select * into strict dr from public.artifact_revisions where id=(derived->>'revision_id')::uuid;
 if private.artifact_revision_release_v1(dr)<>'blocked' then raise exception 'native_review_legacy_derived_release_bypass';end if;
 if private.read_artifact_revision_v1(old.id)#>>'{restriction,kind}' is distinct from 'release' then raise exception 'native_review_explicit_legacy_bypass';end if;
 insert into public.organization_review_policies(organization_id,self_approval_allowed,assignment_required,updated_by)
 values(b.organization_id,true,false,auth.uid()) on conflict(organization_id) do update set self_approval_allowed=true,assignment_required=false;
 begin
  perform public.review_artifact_revision_v1(r.id,r.manifest_fingerprint,'approve',null,null,false,cmd);accepted:=true;
 exception when insufficient_privilege then null;end;
 if accepted then raise exception 'native_review_missing_declaration_accepted';end if;
 set local role authenticated;
 act:=public.review_artifact_revision_v1(r.id,r.manifest_fingerprint,'approve',null,null,true,cmd);
 again:=public.review_artifact_revision_v1(r.id,r.manifest_fingerprint,'approve',null,null,true,cmd);
 reset role;
 if act->>'reviewId'<>again->>'reviewId' or again->>'replayed'<>'true' then raise exception 'native_review_replay_duplicate';end if;
 if private.artifact_revision_release_v1(r)<>'released' or private.artifact_revision_release_v1(old)<>'blocked' then raise exception 'native_review_exact_release_missing';end if;
 ctx:=public.read_artifact_revision_reviews_v1(r.id);
 if ctx->>'release'<>'released' or ctx->>'withheld'<>'false' then raise exception 'native_review_context_missing';end if;
 perform public.review_artifact_revision_v1(r.id,r.manifest_fingerprint,'revoke_approval',null,null,false,revoke_cmd,(act->>'reviewId')::uuid);
 if private.artifact_revision_release_v1(r)<>'internal' then raise exception 'native_review_revocation_ignored';end if;
 begin perform public.review_artifact_revision_v1(r.id,repeat('f',64),'approve',null,null,true,gen_random_uuid());accepted:=true;
 exception when sqlstate '22023' then null;end;
 if accepted then raise exception 'native_review_wrong_version_accepted';end if;
 -- A source used only in closure remains authoritative on all result and review readers.
 perform public.set_source_rights_v1('50000000-0000-4000-8000-000000000882',1,array['store'],array['analysis'],null,null,gen_random_uuid(),repeat('d',64));
 begin perform public.read_institutional_workbook_binding_v1(b.work_id,payload#>>'{artifact,fingerprint}');accepted:=true;
 exception when insufficient_privilege then null;end;
 if accepted then raise exception 'native_review_copy_rights_bypass';end if;
 begin perform public.read_institutional_model_results_v1(b.work_id);accepted:=true;
 exception when insufficient_privilege then null;end;
 if accepted then raise exception 'native_review_result_rights_bypass';end if;
 ctx:=public.read_artifact_revision_reviews_v1(r.id);
 if ctx->>'withheld'<>'true' or ctx?'snapshot' then raise exception 'native_review_revoked_context_leak';end if;
 begin perform public.review_artifact_revision_v1(r.id,r.manifest_fingerprint,'approve',null,null,true,cmd);accepted:=true;
 exception when insufficient_privilege then null;end;
 if accepted then raise exception 'native_review_revoked_replay_accepted';end if;
end $test$;
rollback;
