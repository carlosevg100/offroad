-- Immutable human acts over exact revisions, with complete inherited source authority.
begin;
\ir support/artifact_revision_setup.sql

do $$
declare b jsonb;m jsonb;r jsonb;approval jsonb;review_id uuid;org uuid:='a11b0000-0000-4000-9000-000000000001';
 actor uuid:='a11b0000-0000-4000-8000-000000000001';
begin
 b:=jsonb_build_array(pg_temp.block('paragraph','paragraph','{"text":"Synthetic content for human review"}'));
 m:=pg_temp.manifest('answer','internal','[]','[]');
 r:=pg_temp.person_write('answer','synthetic-review','internal',m,b);
 insert into public.organization_review_policies(organization_id,self_approval_allowed,assignment_required,updated_by) values(org,false,false,actor);
 perform pg_temp.refused(format('select public.review_artifact_revision_v1(%L,%L,%L,null,null,true,%L)',
  r->>'revision_id',r->>'manifest_fingerprint','approve',gen_random_uuid()),'capital_project_self_approval_forbidden','self approval denied by policy');
 update public.organization_review_policies set self_approval_allowed=true where organization_id=org;
 perform pg_temp.refused(format('select public.review_artifact_revision_v1(%L,%L,%L,null,null,false,%L)',
  r->>'revision_id',r->>'manifest_fingerprint','approve',gen_random_uuid()),'capital_project_self_approval_forbidden','self approval requires declaration');
 set local role authenticated;
 approval:=public.review_artifact_revision_v1((r->>'revision_id')::uuid,r->>'manifest_fingerprint','approve',null,null,true,gen_random_uuid());
 reset role;
 review_id:=(approval->>'reviewId')::uuid;
 if not private.artifact_review_is_active_v1(org,review_id) then raise exception 'declared self approval not active'; end if;
 if not exists(select 1 from public.artifact_reviews where id=review_id and prepared_by=reviewer_id and self_approval_declared and policy_snapshot->>'selfApprovalAllowed'='true') then
  raise exception 'approval policy and authorship snapshot missing'; end if;
 perform pg_temp.refused(format('update public.artifact_reviews set note=%L where id=%L','rewritten',review_id),'review_history_immutable','review immutable');
 perform pg_temp.refused('truncate public.artifact_reviews cascade','review_history_immutable','review truncate denied');
 perform pg_temp.refused('truncate public.work_decisions cascade','review_history_immutable','decision truncate denied');
 perform pg_temp.refused('set local role authenticated; select * from public.artifact_reviews','permission denied','raw client review read denied');
 perform pg_temp.refused('set local role authenticated; select * from public.work_decisions','permission denied','raw client decision read denied');
 perform pg_temp.refused(format('select public.review_artifact_revision_v1(%L,%L,%L,null,null,true,%L)',
  r->>'revision_id',repeat('0',64),'approve',gen_random_uuid()),'artifact_review_stale','wrong fingerprint denied');
 update public.organization_review_policies set assignment_required=true where organization_id=org;
 perform pg_temp.refused(format('select public.review_artifact_revision_v1(%L,%L,%L,null,null,true,%L)',
  r->>'revision_id',r->>'manifest_fingerprint','approve',gen_random_uuid()),'review_assignment_required','assigned regime without assignee denied');
 update public.organization_review_policies set assignment_required=false where organization_id=org;
 perform public.review_artifact_revision_v1((r->>'revision_id')::uuid,r->>'manifest_fingerprint','revoke_approval',null,null,false,gen_random_uuid(),review_id);
 if private.artifact_review_is_active_v1(org,review_id) then raise exception 'revoked approval remained active'; end if;
end $$;

do $$
declare b jsonb;m jsonb;r jsonb;context jsonb;sv uuid:=pg_temp.val('source_a','')::uuid;
 org uuid:='a11b0000-0000-4000-9000-000000000001';actor uuid:='a11b0000-0000-4000-8000-000000000001';
begin
 b:=jsonb_build_array(pg_temp.block('restricted','paragraph','{"text":"Synthetic restricted detail"}'));
 m:=pg_temp.manifest('answer','internal',jsonb_build_array(pg_temp.source_ref(sv)),'[]');
 r:=pg_temp.person_write('answer','synthetic-source-review','internal',m,b);
 perform public.review_artifact_revision_v1((r->>'revision_id')::uuid,r->>'manifest_fingerprint','comment',null,'Synthetic secret note',false,gen_random_uuid());
 context:=public.read_artifact_revision_reviews_v1((r->>'revision_id')::uuid);
 if context->>'withheld'<>'false' or position('Synthetic secret note' in context::text)=0 then raise exception 'authorized comment reader failed'; end if;
 insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
 select org,sv,max(revision)+1,array['process'],array['analysis'],'authorized_workspace',now(),'human_declaration',sv,repeat('a',64),actor
 from private.source_rights_versions where organization_id=org and source_version_id=sv;
 context:=public.read_artifact_revision_reviews_v1((r->>'revision_id')::uuid);
 if context->>'withheld'<>'true' or position('Synthetic secret note' in context::text)>0 or context ? 'snapshot' or context ? 'policy'
 then raise exception 'restricted review reader leaked content'; end if;
 perform pg_temp.refused(format('select public.review_artifact_revision_v1(%L,%L,%L,null,null,true,%L)',
  r->>'revision_id',r->>'manifest_fingerprint','approve',gen_random_uuid()),'review_source_access_required','source revocation blocks approval');
 perform pg_temp.refused(format('select public.review_artifact_revision_v1(%L,%L,%L,null,%L,false,%L)',
  r->>'revision_id',r->>'manifest_fingerprint','comment','Synthetic new note',gen_random_uuid()),'review_source_access_required','source revocation blocks comments');
end $$;
do $$
declare b jsonb;m jsonb;r1 jsonb;r2 jsonb;r3 jsonb;r4 jsonb;a1 jsonb;a2 jsonb;a3 jsonb;
 org uuid:='a11b0000-0000-4000-9000-000000000001';
begin
 b:=jsonb_build_array(pg_temp.block('paragraph','paragraph','{"text":"Synthetic unchanged recommendation"}'));
 m:=pg_temp.manifest('answer','internal','[]','[]',null,'json',jsonb_build_object('template',jsonb_build_object('templateVersionId','review-start','fingerprint',repeat('1',64))));
 r1:=pg_temp.person_write('answer','synthetic-reaffirm','internal',m,b);
 a1:=public.review_artifact_revision_v1((r1->>'revision_id')::uuid,r1->>'manifest_fingerprint','approve',null,null,true,gen_random_uuid());
 m:=jsonb_set(m,'{template,templateVersionId}','"review-layout-next"');
 r2:=pg_temp.person_write('answer','synthetic-reaffirm','internal',m,b);
 a2:=public.review_artifact_revision_v1((r2->>'revision_id')::uuid,r2->>'manifest_fingerprint','reaffirm',null,null,true,gen_random_uuid(),(a1->>'reviewId')::uuid);
 if not private.artifact_review_is_active_v1(org,(a2->>'reviewId')::uuid) then raise exception 'cosmetic reaffirm not active'; end if;
 m:=jsonb_set(m,'{template,templateVersionId}','"review-layout-third"');
 r3:=pg_temp.person_write('answer','synthetic-reaffirm','internal',m,b);
 a3:=public.review_artifact_revision_v1((r3->>'revision_id')::uuid,r3->>'manifest_fingerprint','reaffirm',null,null,true,gen_random_uuid(),(a2->>'reviewId')::uuid);
 if not private.artifact_review_is_active_v1(org,(a3->>'reviewId')::uuid) then raise exception 'cosmetic reaffirm chain not active'; end if;
 m:=jsonb_set(m,'{template,templateVersionId}','"review-material-fourth"');
 b:=jsonb_set(b,'{0,content,text}','"Synthetic changed recommendation"');
 r4:=pg_temp.person_write('answer','synthetic-reaffirm','internal',m,b);
 perform pg_temp.refused(format('select public.review_artifact_revision_v1(%L,%L,%L,null,null,true,%L,%L)',
  r4->>'revision_id',r4->>'manifest_fingerprint','reaffirm',gen_random_uuid(),a3->>'reviewId'),
  'artifact_review_material_change','changed prose requires new approval');
 perform public.review_artifact_revision_v1((r1->>'revision_id')::uuid,r1->>'manifest_fingerprint','revoke_approval',null,null,false,gen_random_uuid(),(a1->>'reviewId')::uuid);
 if private.artifact_review_is_active_v1(org,(a2->>'reviewId')::uuid) or private.artifact_review_is_active_v1(org,(a3->>'reviewId')::uuid)
 then raise exception 'base revocation must invalidate reaffirmation chain'; end if;
end $$;
do $$
declare basis jsonb:=jsonb_build_object('artifacts','[]'::jsonb,'milestones','[]'::jsonb,'assessments','[]'::jsonb,'decisions','[]'::jsonb,'execution',null,'configuration',null);
 d1 jsonb;d2 jsonb;d3 jsonb;d4 jsonb;refs jsonb;state jsonb;report jsonb;cmd uuid:=gen_random_uuid();
 work uuid:='a11b0000-0000-4000-9000-000000000002';org uuid:='a11b0000-0000-4000-9000-000000000001';
begin
 d1:=public.record_work_decision_v1(work,'synthetic-capital-choice','choose_alternative',basis,array['none'],'in_product',null,'Synthetic option alpha',null,cmd);
 if public.record_work_decision_v1(work,'synthetic-capital-choice','choose_alternative',basis,array['none'],'in_product',null,'Synthetic option alpha',null,cmd)->>'replayed'<>'true'
 then raise exception 'exact decision replay failed'; end if;
 perform pg_temp.refused(format('select public.record_work_decision_v1(%L,%L,%L,%L,array[%L],%L,null,%L,null,%L)',
  work,'synthetic-capital-choice','choose_alternative',basis,'none','in_product','Changed option',cmd),
  'work_decision_replay_mismatch','changed decision command cannot replay');
 d2:=public.record_work_decision_v1(work,'synthetic-capital-choice','choose_alternative',basis,array['none'],'in_product',null,'Synthetic option beta',null,gen_random_uuid());
 state:=private.work_decision_precedence_v1(org,work,'synthetic-capital-choice');
 if d2->>'contested'<>'true' or state->>'state'<>'contested' or state->>'currentId' is not null then raise exception 'concurrent base must remain contested'; end if;
 refs:=jsonb_build_array(jsonb_build_object('decisionId',d1->>'decisionId','revision',1,'fingerprint',d1->>'fingerprint'));
 d3:=public.record_work_decision_v1(work,'synthetic-capital-choice','choose_alternative',jsonb_set(basis,'{decisions}',refs),array['none'],'in_product',null,'Synthetic partial resolution',2,gen_random_uuid());
 if d3->>'contested'<>'true' then raise exception 'partial resolution cannot select a winner'; end if;
 refs:=refs||jsonb_build_array(jsonb_build_object('decisionId',d2->>'decisionId','revision',2,'fingerprint',d2->>'fingerprint'),
  jsonb_build_object('decisionId',d3->>'decisionId','revision',3,'fingerprint',d3->>'fingerprint'));
 d4:=public.record_work_decision_v1(work,'synthetic-capital-choice','choose_alternative',jsonb_set(basis,'{decisions}',refs),array['none'],'in_product',null,'Synthetic full resolution',3,gen_random_uuid());
 state:=public.read_work_decision_v1((d4->>'decisionId')::uuid);
 if d4->>'contested'<>'false' or state#>>'{precedence,state}'<>'current' or state#>>'{precedence,currentId}'<>d4->>'decisionId'
 then raise exception 'full resolution did not become current'; end if;
 if (select count(*) from public.work_decisions where organization_id=org and work_id=work and decision_key='synthetic-capital-choice')<>4
 then raise exception 'decision history lost a competing act'; end if;
 perform pg_temp.refused(format('update public.work_decisions set note=%L where id=%L','Rewritten',d1->>'decisionId'),'review_history_immutable','decision history immutable');
 report:=jsonb_build_object('decidedBy','Synthetic CFO','forum','Synthetic meeting','decidedOn','2026-09-27','evidenceSourceVersionId',null);
 perform pg_temp.refused(format('select public.record_work_decision_v1(%L,%L,%L,%L,array[%L],%L,%L,null,null,%L)',
  work,'synthetic-report','record_report',basis,'queue_execution','reported',report,gen_random_uuid()),'reported_decision_has_effect','reported decision cannot authorize execution');
 d1:=public.record_work_decision_v1(work,'synthetic-report','record_report',basis,array['none'],'reported',report,'Synthetic report, not minutes',null,gen_random_uuid());
 state:=public.read_work_decision_v1((d1->>'decisionId')::uuid);
 if state#>>'{decision,origin}'<>'reported' or state#>'{decision,effects}'<>'["none"]'::jsonb then raise exception 'reported decision lost origin or gained effects'; end if;
end $$;
do $$
declare basis jsonb;ref jsonb;d jsonb;x jsonb;org uuid:='a11b0000-0000-4000-9000-000000000001';
 work uuid:='a11b0000-0000-4000-9000-000000000002';actor uuid:='a11b0000-0000-4000-8000-000000000001';sv uuid:=pg_temp.val('source_b','')::uuid;
begin
 insert into public.capital_project_decisions(organization_id,capital_project_id,decision_key,revision,status,question,rationale_summary,confidence,proposed_by,schema_version,decision_fingerprint,created_by)
 values(org,work,'synthetic.assessment',1,'open','Synthetic assessment question','Synthetic rationale','insufficient','deal_captain','dcm-decision.v1',repeat('9',64),actor);
 ref:=jsonb_build_object('decisionKey','synthetic.assessment','revision',1,'decisionFingerprint',repeat('9',64));
 basis:=jsonb_build_object('artifacts','[]'::jsonb,'milestones','[]'::jsonb,'assessments',jsonb_build_array(ref),'decisions','[]'::jsonb,'execution',null,'configuration',null);
 d:=private.append_work_decision_v1(org,work,'synthetic-legacy-assessment','confirm_assessment',basis,array['freeze_assessment'],'in_product',null,
  'Synthetic restricted historical rationale',actor,null,gen_random_uuid(),'legacy',null,p_outcome=>'approved');
 x:=public.read_work_decision_v1((d->>'decisionId')::uuid);
 if x->>'withheld'<>'true' or x ? 'decision' or position('Synthetic restricted historical rationale' in x::text)>0
 then raise exception 'unproved legacy basis leaked content'; end if;
 perform pg_temp.refused(format('select public.record_work_decision_v1(%L,%L,%L,%L,array[%L],%L,null,null,null,%L,%L)',
  work,'synthetic-new-assessment','confirm_assessment',basis,'freeze_assessment','in_product',gen_random_uuid(),'approved'),
  'work_decision_basis_access_required','missing producer receipt denies a new decision');
 perform private.record_review_basis_receipt_v1(org,work,'assessment',ref,array[sv],'agent_assessment');
 x:=public.read_work_decision_v1((d->>'decisionId')::uuid);
 if x->>'withheld'<>'false' or x#>>'{decision,note}'<>'Synthetic restricted historical rationale' then raise exception 'proved basis not readable'; end if;
 insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
 select org,sv,max(revision)+1,array['process'],array['analysis'],'authorized_workspace',now(),'human_declaration',sv,repeat('a',64),actor
 from private.source_rights_versions where organization_id=org and source_version_id=sv;
 x:=public.read_work_decision_v1((d->>'decisionId')::uuid);
 if x->>'withheld'<>'true' or x ? 'decision' or position('Synthetic restricted historical rationale' in x::text)>0
 then raise exception 'source revocation leaked decision rationale'; end if;
 if has_function_privilege('authenticated','private.record_review_basis_receipt_v1(uuid,uuid,text,jsonb,uuid[],text)','execute')
 then raise exception 'client may not fabricate completeness receipt'; end if;
end $$;
do $$
declare org uuid:='a11b0000-0000-4000-9000-000000000001';work uuid:='a11b0000-0000-4000-9000-000000000002';
 actor uuid:='a11b0000-0000-4000-8000-000000000001';departed uuid:='a11b0000-0000-4000-8000-000000000002';
 recipient uuid:='a5200000-0000-4000-8000-000000000003';command uuid:=gen_random_uuid();result jsonb;count_before integer;
begin
 insert into auth.users(id,email) values(recipient,'synthetic-review-successor@example.invalid');
 insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values(org,recipient,'member','active',now());
 perform public.set_capital_project_review_assignment_v1(work,departed,'approver',true);
 if private.review_policy_snapshot_v1(org,work,actor)->>'assignmentRequired'<>'true' then raise exception 'legacy assignment must preserve assigned regime'; end if;
 perform pg_temp.refused(format('select public.record_work_decision_v1(%L,%L,%L,%L,array[%L],%L,null,null,null,%L)',
  work,'unassigned-decision','choose_alternative','{"artifacts":[],"milestones":[],"assessments":[],"decisions":[],"execution":null,"configuration":null}',
  'none','in_product',gen_random_uuid()),'review_assignment_required','work access alone cannot decide an assigned project');
 perform pg_temp.refused(format('select public.review_artifact_revision_v1(%L,%L,%L,null,null,true,%L)',
  (select r.id from public.artifact_revisions r join public.artifacts a on a.id=r.artifact_id where a.subject='synthetic-review'),
  (select r.manifest_fingerprint from public.artifact_revisions r join public.artifacts a on a.id=r.artifact_id where a.subject='synthetic-review'),
  'approve',gen_random_uuid()),'review_assignment_required','work access alone cannot approve an assigned project');

 perform pg_temp.refused(format('select public.reassign_pending_review_v1(%L,%L,%L,%L,%L)',work,departed,recipient,'Synthetic successor',command),
  'review_reassignment_no_eligible_member','membership alone does not qualify a successor');
 perform public.set_capital_project_review_assignment_v1(work,recipient,'approver',true);
 select count(*) into count_before from public.artifact_reviews where organization_id=org and act='approve' and reviewer_id=actor;
 delete from public.organization_memberships where organization_id=org and user_id=departed;
 if exists(select 1 from public.capital_project_review_assignments where organization_id=org and user_id=departed) then raise exception 'fixture did not remove assignment by cascade'; end if;
 result:=public.reassign_pending_review_v1(work,departed,recipient,'Synthetic successor',command);
 if jsonb_array_length(result->'reviews')=0 then raise exception 'pending reviews were not reassigned after member deletion'; end if;
 if not exists(select 1 from public.artifact_reviews where organization_id=org and act='reassign' and policy_snapshot#>>'{reassignment,fromUserId}'=departed::text
  and policy_snapshot#>>'{reassignment,toUserId}'=recipient::text and reviewer_id=actor) then raise exception 'reassignment history missing actors'; end if;
 if (select count(*) from public.artifact_reviews where organization_id=org and act='approve' and reviewer_id=actor)<>count_before then raise exception 'reassignment rewrote past approval'; end if;
 if public.reassign_pending_review_v1(work,departed,recipient,'Synthetic successor',command)->>'replayed'<>'true' then raise exception 'reassignment replay failed'; end if;
 perform pg_temp.refused(format('select public.reassign_pending_review_v1(%L,%L,%L,%L,%L)',work,departed,recipient,'Changed reason',command),
  'review_reassignment_replay_mismatch','reassignment reason cannot change on replay');
end $$;
do $$
declare org uuid:='a11b0000-0000-4000-9000-000000000001';work uuid:='a11b0000-0000-4000-9000-000000000002';
 actor uuid:='a11b0000-0000-4000-8000-000000000001';sv uuid;basis jsonb;report jsonb;d jsonb;child jsonb;ref jsonb;receipt uuid;result jsonb;
begin
 update public.capital_project_review_policies set assignment_required='not_required' where organization_id=org and capital_project_id=work;
 basis:='{"artifacts":[],"milestones":[],"assessments":[],"decisions":[],"execution":null,"configuration":null}';
 sv:=pg_temp.source_version('recursive-decision-source',null);
 report:=jsonb_build_object('decidedBy','Synthetic committee','forum','Synthetic meeting','decidedOn','2026-09-27','evidenceSourceVersionId',sv);
 d:=public.record_work_decision_v1(work,'recursive-source','record_report',basis,array['none'],'reported',report,'Synthetic committee rationale',null,gen_random_uuid());
 ref:=jsonb_build_object('decisionId',d->'decisionId','revision',d->'revision','fingerprint',d->'fingerprint');
 child:=public.record_work_decision_v1(work,'recursive-source','choose_alternative',jsonb_set(basis,'{decisions}',jsonb_build_array(ref)),array['none'],'in_product',null,'Synthetic dependent rationale',1,gen_random_uuid());
 if public.read_work_decision_v1((child->>'decisionId')::uuid)->>'withheld'<>'false' then raise exception 'recursive allowed reader failed'; end if;
 insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
 select org,sv,max(revision)+1,array['process'],array['analysis'],'authorized_workspace',now(),'human_declaration',sv,repeat('b',64),actor
 from private.source_rights_versions where organization_id=org and source_version_id=sv;
 result:=public.read_work_decision_v1((child->>'decisionId')::uuid);
 if result->>'withheld'<>'true' or result ? 'decision' or position('rationale' in result::text)>0 then raise exception 'recursive source revocation leaked'; end if;
 if private.work_decision_basis_authority_v1(org,work,basis,null,actor,array_fill(gen_random_uuid(),array[64]))<>'unresolved'
 then raise exception 'recursive decision bound failed'; end if;
 -- One allowed basis and one unresolved basis must not authorize partial content.
 select jsonb_build_object('artifactRevisionId',r.id,'manifestFingerprint',r.manifest_fingerprint) into strict ref from public.artifact_revisions r join public.artifacts a on a.id=r.artifact_id where a.work_id=work and a.subject='synthetic-review';
 basis:=jsonb_set(basis,'{artifacts}',jsonb_build_array(ref));
 basis:=jsonb_set(basis,'{configuration}',jsonb_build_object('configurationFingerprint',repeat('d',64),'structureFingerprint',null,'uploadFingerprint',null));
 if private.work_decision_basis_authority_v1(org,work,basis,null,actor)='allowed' then raise exception 'unresolved mixed basis allowed'; end if;
 perform pg_temp.refused(format('select public.record_work_decision_v1(%L,%L,%L,%L,array[%L],%L,null,null,null,%L)',
  work,'mixed-basis','choose_alternative',basis,'none','in_product',gen_random_uuid()),'work_decision_basis_access_required','mixed unresolved basis denied');
 perform pg_temp.refused(format('select private.append_work_decision_v1(%L,%L,%L,%L,%L,array[%L],%L,null,null,%L,null,%L,%L,null,p_outcome=>%L)',
  org,work,'rejected-effect','authorize_execution','{"artifacts":[],"milestones":[],"assessments":[],"decisions":[],"execution":null,"configuration":null}',
  'queue_execution','in_product',actor,gen_random_uuid(),'legacy','rejected'), 'rejected_decision_has_operational_effect','rejection cannot queue');
end $$;
select 'PASS: revision_bound_decisions review foundations' as result;
rollback;
