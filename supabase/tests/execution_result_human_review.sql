-- Synthetic, rollback-only proof: computation is not approval.
begin;
\ir support/execution_adopted_result_setup.sql
select public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb);
select pg_temp.commit_adopted('a4171000-0000-4000-9000-000000000002');
do $test$
declare r public.artifact_revisions;dr public.artifact_revisions;act jsonb;external_act jsonb;external_r public.artifact_revisions;ctx jsonb;derived jsonb;m jsonb;
begin
 select * into strict r from public.artifact_revisions where id=pg_temp.revision_of('a4171000-0000-4000-9000-000000000002');
 if private.artifact_revision_release_v1(r)<>'internal' then raise exception 'receipt_is_not_approval';end if;
 if private.artifact_review_preparer_v1(r) is distinct from auth.uid() then raise exception 'original_human_preparer_missing';end if;
 ctx:=public.read_artifact_revision_reviews_v1(r.id);
 if ctx->>'withheld'<>'false' or ctx->>'release'<>'internal' or not(ctx?'snapshot') then raise exception 'internal_review_not_readable';end if;
 insert into public.organization_review_policies(organization_id,self_approval_allowed,assignment_required,updated_by)
 values(r.organization_id,true,false,auth.uid()) on conflict(organization_id) do update set self_approval_allowed=true,assignment_required=false;
 begin
  perform public.review_artifact_revision_v1(r.id,r.manifest_fingerprint,'approve',null,null,false,gen_random_uuid());
  raise exception 'undeclared_self_approval_accepted';
 exception when insufficient_privilege then null;end;
 set local role authenticated;
 act:=public.review_artifact_revision_v1(r.id,r.manifest_fingerprint,'approve',null,null,true,gen_random_uuid());
 reset role;
 if private.artifact_revision_release_v1(r)<>'released' then raise exception 'exact_approval_not_released';end if;
 -- A derived object without an execution manifest still inherits the review requirement.
 m:=jsonb_set(jsonb_set(r.manifest,'{kind}','"work_product"'),'{execution}','null');
 derived:=private.create_artifact_revision_v1(r.organization_id,'a11b0000-0000-4000-9000-000000000002','work_product','synthetic-review-derived','internal','person',m,
 current_setting('test.producers.blocks')::jsonb,jsonb_build_array(jsonb_build_object('kind','artifact_revision','derivedFromRevisionId',r.id)),null,null,null,auth.uid(),auth.uid());
 select * into strict dr from public.artifact_revisions where id=(derived->>'revision_id')::uuid;
 if private.artifact_revision_release_v1(dr)<>'internal' then raise exception 'ancestor_approval_inherited';end if;
 insert into public.deal_state_objects(organization_id,intake_session_id,object_type,object_version,status,input_fingerprint,object_fingerprint,payload,dependencies,created_by_kind)
 values(r.organization_id,'a11b0000-0000-4000-9000-000000000003','material_artifact',1,'pending_confirmation',repeat('1',64),dr.manifest_fingerprint,
 '{"schemaVersion":"2026.08.29-v1","materials":[],"materialTruth":{},"dataRoom":{}}', '[]','worker');
 insert into public.deal_state_objects(organization_id,intake_session_id,object_type,object_version,status,input_fingerprint,object_fingerprint,payload,created_by_kind)
 values(r.organization_id,'a11b0000-0000-4000-9000-000000000003','understanding_snapshot',1,'draft',repeat('1',64),repeat('2',64),'{"readiness":{"state":"ready"}}','worker');
 insert into public.deal_state_objects(organization_id,intake_session_id,object_type,object_version,status,input_fingerprint,object_fingerprint,payload,dependencies,created_by,created_by_kind)
 values(r.organization_id,'a11b0000-0000-4000-9000-000000000003','package_review',1,'approved',repeat('1',64),repeat('3',64),
 jsonb_build_object('schemaVersion','2026.08.29-v1','approval',jsonb_build_object('scope','internal_material_package','artifactFingerprint',dr.manifest_fingerprint)),
 jsonb_build_array(jsonb_build_object('objectType','material_artifact','objectFingerprint',dr.manifest_fingerprint)),auth.uid(),'user');
 if private.artifact_revision_release_v1(dr)<>'internal' then raise exception 'legacy_package_bypassed_exact_review';end if;
 derived:=private.create_artifact_revision_v1(r.organization_id,'a11b0000-0000-4000-9000-000000000002','work_product','synthetic-external-review','external','person',jsonb_set(m,'{audience}','"external"'),
 current_setting('test.producers.blocks')::jsonb,jsonb_build_array(jsonb_build_object('kind','artifact_revision','derivedFromRevisionId',r.id)),null,null,null,auth.uid(),auth.uid());
 select * into strict external_r from public.artifact_revisions where id=(derived->>'revision_id')::uuid;
 if private.artifact_revision_release_v1(external_r)<>'blocked' then raise exception 'external_receipt_auto_released';end if;
 external_act:=public.review_artifact_revision_v1(external_r.id,external_r.manifest_fingerprint,'approve',null,null,true,gen_random_uuid());
 if private.artifact_revision_release_v1(external_r)<>'released' then raise exception 'external_exact_approval_missing';end if;
 perform public.review_artifact_revision_v1(external_r.id,external_r.manifest_fingerprint,'revoke_approval',null,null,false,gen_random_uuid(),(external_act->>'reviewId')::uuid);
 if private.artifact_revision_release_v1(external_r)<>'blocked' then raise exception 'external_revocation_ignored';end if;
 perform public.review_artifact_revision_v1(dr.id,dr.manifest_fingerprint,'approve',null,null,true,gen_random_uuid());
 if private.artifact_revision_release_v1(dr)<>'released' then raise exception 'derived_exact_approval_missing';end if;
 perform public.review_artifact_revision_v1(r.id,r.manifest_fingerprint,'revoke_approval',null,null,false,gen_random_uuid(),(act->>'reviewId')::uuid);
 if private.artifact_revision_release_v1(r)<>'internal' then raise exception 'revocation_ignored';end if;
 begin
  perform public.review_artifact_revision_v1(r.id,repeat('f',64),'approve',null,null,true,gen_random_uuid());
  raise exception 'wrong_fingerprint_accepted';
 exception when sqlstate '22023' then null;end;
 -- Current source denial wins even after the reviewer loaded the context.
 perform public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',1,array['store'],array['analysis'],null,null,gen_random_uuid(),repeat('d',64));
 if public.read_artifact_revision_reviews_v1(r.id)->>'withheld'<>'true' then raise exception 'revoked_review_content_leaked';end if;
 begin
  perform public.review_artifact_revision_v1(r.id,r.manifest_fingerprint,'approve',null,null,true,gen_random_uuid());
  raise exception 'revoked_source_approved';
 exception when insufficient_privilege then null;end;
 raise notice 'execution_result_human_review: PASS';
end $test$;
rollback;
