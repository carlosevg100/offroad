-- Native result is created by preceding 3S producer; no review/decision/queue fixture rows.
set local role authenticated;select pg_temp.as_worker();
do $$declare j jsonb;begin select value::jsonb into strict j from route_proof where label='native_claim';perform public.worker_complete_job((j->>'job_id')::uuid,j->>'capability_token','{}'::jsonb);end$$;
reset role;
insert into route_proof values('package_gateway_before',(select count(*)::text from private.processing_eligibility_decisions)),('package_introductions_before',(select count(*)::text from public.qualified_introductions));
insert into route_proof select 'package_session',r.session_id::text from private.material_production_recipes r where id=(select(value::jsonb->>'recipeId')::uuid from route_proof where label='native_material_commit');
insert into route_proof select 'package_manifest_fp',manifest_fingerprint from public.artifact_revisions where id=(select(value::jsonb->>'revisionId')::uuid from route_proof where label='native_material_commit');
set local role authenticated;select pg_temp.as_owner();
do $$declare c jsonb;fp text;begin select value::jsonb into strict c from route_proof where label='native_material_commit';select value into strict fp from route_proof where label='package_manifest_fp';
 begin perform public.decide_material_package_v1((c->>'workId')::uuid,(c->>'revisionId')::uuid,fp,'approve','Autoaprovação proibida pelo tenant.',true,gen_random_uuid());raise exception 'forbidden_self_approval_allowed';exception when insufficient_privilege then null;end;
 perform public.set_capital_project_review_policy_v1((c->>'workId')::uuid,'allowed');
 begin perform public.decide_material_package_v1((c->>'workId')::uuid,(c->>'revisionId')::uuid,fp,'approve','Declaração de autoaprovação ausente.',false,gen_random_uuid());raise exception 'undeclared_self_approval_allowed';exception when insufficient_privilege then null;end;
 perform public.set_capital_project_review_policy_v2((c->>'workId')::uuid,'allowed','required',public.read_capital_project_review_context_v2((c->>'workId')::uuid)->>'policy_fingerprint');
 begin perform public.decide_material_package_v1((c->>'workId')::uuid,(c->>'revisionId')::uuid,fp,'approve','Sem atribuição de aprovador.',true,gen_random_uuid());raise exception 'unassigned_approver_allowed';exception when insufficient_privilege then null;end;
 perform public.set_capital_project_review_policy_v2((c->>'workId')::uuid,'allowed','not_required',public.read_capital_project_review_context_v2((c->>'workId')::uuid)->>'policy_fingerprint');
 raise notice 'PASS material_package_preparer_human_self_policy_declaration_assignment_required';
end$$;
reset role;
create function pg_temp.fail_package_followup() returns trigger language plpgsql as $$begin if new.payload->>'incremental_trigger'='material_package_approved' then raise exception 'material_package_injected_queue_failure';end if;return new;end$$;
create trigger material_package_fixture_fault before insert on public.processing_jobs for each row execute function pg_temp.fail_package_followup();
set local role authenticated;select pg_temp.as_owner();
do $$declare c jsonb;fp text;begin select value::jsonb into strict c from route_proof where label='native_material_commit';select value into strict fp from route_proof where label='package_manifest_fp';
 begin perform public.decide_material_package_v1((c->>'workId')::uuid,(c->>'revisionId')::uuid,fp,'approve','Teste de rollback da fila.',true,gen_random_uuid());raise exception 'package_fault_not_triggered';exception when raise_exception then if sqlerrm<>'material_package_injected_queue_failure' then raise;end if;end;
end$$;
reset role;
drop trigger material_package_fixture_fault on public.processing_jobs;
do $$begin if exists(select 1 from private.material_package_review_projections) or exists(select 1 from public.work_decisions where kind='approve_material_package') or exists(select 1 from public.artifact_reviews where revision_id=(select(value::jsonb->>'revisionId')::uuid from route_proof where label='native_material_commit')) then raise exception 'package_fault_partial_effect';end if;raise notice 'PASS material_package_followup_fault_rolls_back_review_decision_projection';end$$;
set local role authenticated;select pg_temp.as_owner();
do $$declare c jsonb;r jsonb;r2 jsonb;fp text;command uuid:=gen_random_uuid();begin
 select value::jsonb into strict c from route_proof where label='native_material_commit';
 select value into strict fp from route_proof where label='package_manifest_fp';
 begin perform public.decide_material_package_v1((c->>'workId')::uuid,(c->>'revisionId')::uuid,repeat('f',64),'approve',null,false,command);raise exception 'changed_package_approved';exception when invalid_parameter_value then null;end;
 if public.read_material_package_review_basis_v1((c->>'workId')::uuid,(c->>'revisionId')::uuid)->>'manifestFingerprint'<>fp then raise exception 'package_basis_changed';end if;
 r:=public.decide_material_package_v1((c->>'workId')::uuid,(c->>'revisionId')::uuid,fp,'approve','Revisão interna do pacote concluída.',true,command);
 r2:=public.decide_material_package_v1((c->>'workId')::uuid,(c->>'revisionId')::uuid,fp,'approve','Revisão interna do pacote concluída.',true,command);
 if r-'replayed'<>r2-'replayed' or not(r2->>'replayed')::boolean or r->>'effect'<>'request_followup_brief' then raise exception 'material_package_replay_mismatch';end if;
 insert into route_proof values('native_package_review',r::text),('native_package_command',command::text);
 raise notice 'PASS material_package_human_exact_approval_replay';
end$$;
reset role;
do $$declare p private.material_package_review_projections;d public.work_decisions;j public.processing_jobs;r public.artifact_revisions;begin
 select * into strict p from private.material_package_review_projections;
 select * into strict d from public.work_decisions where id=p.decision_id;
 select * into strict j from public.processing_jobs where id=p.effect_job_id;
 select * into strict r from public.artifact_revisions where id=p.revision_id;
 if d.kind<>'approve_material_package' or d.effects<>array['none']::text[] or d.outcome<>'approved' or d.contested then raise exception 'material_package_decision_wrong_effect';end if;
 if not private.job_authority_is_current_v1(j.id) then raise exception 'package_followup_legitimate_authority_denied';end if;
 if j.status<>'awaiting_approval' or j.capability_sha256 is not null then raise exception 'material_package_execution_authorized';end if;
 if exists(select 1 from public.capital_project_execution_brief_dispatches where processing_job_id=j.id and accepted_at is not null) then raise exception 'material_package_followup_already_authorized';end if;
 if (select count(*) from private.material_package_review_projections)<>1 or private.artifact_revision_release_v1(r)<>'internal' then raise exception 'material_package_external_release_or_duplicate';end if;
 if exists(select 1 from public.deal_state_objects where organization_id=p.organization_id and object_type in('release_authorization','introduction')) then raise exception 'material_package_external_effect';end if;
 if (select count(*) from private.processing_eligibility_decisions)<>(select value::integer from route_proof where label='package_gateway_before') or (select count(*) from public.qualified_introductions)<>(select value::integer from route_proof where label='package_introductions_before') then raise exception 'package_approval_dispatched_or_introduced';end if;
 raise notice 'PASS material_package_decision_none_followup_awaits_separate_human_act_no_external_release';
end$$;
-- A historical approval is not current authorization after policy/role withdrawal.
set local role authenticated;select pg_temp.as_owner();
savepoint package_policy_withdrawal;
do $$declare c jsonb;begin
 select value::jsonb into strict c from route_proof where label='native_material_commit';
 perform public.set_capital_project_review_policy_v1((c->>'workId')::uuid,'forbidden');
 if jsonb_array_length(public.read_material_package_review_basis_v1((c->>'workId')::uuid,(c->>'revisionId')::uuid)->'activeApprovalReviewIds')<>0 then raise exception 'policy_withdrawal_left_active_approval';end if;
end$$;
reset role;
do $$declare p private.material_package_review_projections;begin select * into strict p from private.material_package_review_projections;
 if not private.artifact_review_is_active_v1(p.organization_id,p.review_id) or private.material_package_approval_is_current_v1(p.organization_id,p.review_id) or private.job_authority_is_current_v1(p.effect_job_id) then raise exception 'policy_withdrawal_history_or_followup_wrong';end if;
 raise notice 'PASS material_package_policy_withdrawal_hides_active_approval_denies_followup_preserves_history';end$$;
rollback to package_policy_withdrawal;
set local role authenticated;select pg_temp.as_owner();
savepoint package_assignment_withdrawal;
do $$declare c jsonb;begin
 select value::jsonb into strict c from route_proof where label='native_material_commit';
 perform public.set_capital_project_review_policy_v2((c->>'workId')::uuid,'allowed','required',public.read_capital_project_review_context_v2((c->>'workId')::uuid)->>'policy_fingerprint');
 perform public.set_capital_project_review_assignment_v1((c->>'workId')::uuid,auth.uid(),'approver',true);
 if jsonb_array_length(public.read_material_package_review_basis_v1((c->>'workId')::uuid,(c->>'revisionId')::uuid)->'activeApprovalReviewIds')<>1 then raise exception 'legitimate_assignment_did_not_restore_current_approval';end if;
 perform public.set_capital_project_review_assignment_v1((c->>'workId')::uuid,auth.uid(),'approver',false);
 if jsonb_array_length(public.read_material_package_review_basis_v1((c->>'workId')::uuid,(c->>'revisionId')::uuid)->'activeApprovalReviewIds')<>0 then raise exception 'assignment_withdrawal_left_active_approval';end if;
end$$;
reset role;
do $$declare p private.material_package_review_projections;begin select * into strict p from private.material_package_review_projections;
 if not private.artifact_review_is_active_v1(p.organization_id,p.review_id) or private.material_package_approval_is_current_v1(p.organization_id,p.review_id) or private.job_authority_is_current_v1(p.effect_job_id) then raise exception 'assignment_withdrawal_history_or_followup_wrong';end if;
 raise notice 'PASS material_package_assignment_withdrawal_hides_active_approval_denies_followup_preserves_history';end$$;
rollback to package_assignment_withdrawal;
set local role authenticated;select pg_temp.as_owner();
do $$declare c jsonb;begin
 select value::jsonb into strict c from route_proof where label='native_material_commit';
 begin perform public.enqueue_deal_state_analysis('d5200000-0000-4000-8000-000000000001'::uuid,(select value::uuid from route_proof where label='package_session'),'material_package_approved');raise exception 'material_package_old_enqueue_allowed';exception when insufficient_privilege then null;end;
end$$;

reset role;
update storage.objects set metadata=jsonb_build_object('size',1,'mimetype','application/json') where id=(select value::uuid from route_proof where label='object:case_state');
do $$declare p private.material_package_review_projections;begin select * into strict p from private.material_package_review_projections;
 if private.job_authority_is_current_v1(p.effect_job_id) or exists(select 1 from public.processing_jobs j where j.payload->>'approval_target_job_id'=p.effect_job_id::text and private.job_authority_is_current_v1(j.id)) then raise exception 'purged_package_followup_authority_allowed';end if;
 raise notice 'PASS material_package_physical_parent_loss_denies_followup_and_brief_authority';
end$$;
update storage.objects set metadata=jsonb_build_object('size',(select(value::jsonb#>>'{scope,byteLength}')::bigint from route_proof where label='body:case_state'),'mimetype','application/json') where id=(select value::uuid from route_proof where label='object:case_state');
set local role authenticated;select pg_temp.as_owner();
do $$declare c jsonb;p jsonb;fp text;r jsonb;command uuid:=gen_random_uuid();begin
 select value::jsonb into strict c from route_proof where label='native_material_commit';select value::jsonb into strict p from route_proof where label='native_package_review';select value into strict fp from route_proof where label='package_manifest_fp';
 r:=public.decide_material_package_v1((c->>'workId')::uuid,(c->>'revisionId')::uuid,fp,'revoke_approval','Aprovação interna revogada.',false,command,(p->>'reviewId')::uuid);
 begin perform public.decide_material_package_v1((c->>'workId')::uuid,(c->>'revisionId')::uuid,fp,'approve','Revisão interna do pacote concluída.',true,(select value::uuid from route_proof where label='native_package_command'));raise exception 'revoked_approval_replayed_as_current';exception when insufficient_privilege then null;end;
 if r->>'effect'<>'none' then raise exception 'revocation_has_effect';end if;
 if(public.decide_material_package_v1((c->>'workId')::uuid,(c->>'revisionId')::uuid,fp,'revoke_approval','Aprovação interna revogada.',false,command,(p->>'reviewId')::uuid)->>'replayed')::boolean is not true then raise exception 'revocation_replay_changed';end if;
end$$;
reset role;
do $$declare p private.material_package_review_projections;d public.deal_state_objects;begin
 select * into strict p from private.material_package_review_projections where effect_job_id is not null;
 if not exists(select 1 from public.processing_jobs where id=p.effect_job_id and status='cancelled' and capability_sha256 is null) then raise exception 'revocation_followup_not_cancelled';end if;
 select * into d from public.deal_state_objects where organization_id=p.organization_id and object_type='package_review' order by object_version desc limit 1;
 if exists(select 1 from public.processing_jobs where organization_id=p.organization_id and payload->>'approval_target_job_id'=p.effect_job_id::text and status not in('succeeded','failed','poison','cancelled')) then raise exception 'revocation_proposal_remained_executable';end if;
 if d.status<>'pending_confirmation' then raise exception 'revocation_legacy_approval_remained_current';end if;
 if(select count(*) from private.material_package_review_projections)<>2 then raise exception 'revocation_replay_duplicate';end if;
 raise notice 'PASS material_package_revocation_closes_followup_and_legacy_approval_replay';
end$$;
set local role authenticated;select pg_temp.as_owner();
do $$declare c jsonb;old jsonb;r jsonb;fp text;begin
 select value::jsonb into strict c from route_proof where label='native_material_commit';select value::jsonb into strict old from route_proof where label='native_package_review';select value into strict fp from route_proof where label='package_manifest_fp';
 r:=public.decide_material_package_v1((c->>'workId')::uuid,(c->>'revisionId')::uuid,fp,'approve','Nova aprovação após revogação explícita.',true,gen_random_uuid());
 if r->>'jobId' is null or r->>'jobId'=old->>'jobId' then raise exception 'reapproval_reused_cancelled_job';end if;
 raise notice 'PASS material_package_new_human_reapproval_new_held_job_not_cancelled_replay';
end$$;
reset role;
-- Revoked membership cannot be hidden by the existing approval/replay history.
update public.organization_memberships set status='revoked' where(organization_id,user_id)=('d5200000-0000-4000-8000-000000000001','d5100000-0000-4000-8000-000000000001');
set local role authenticated;select pg_temp.as_owner();
do $$declare c jsonb;fp text;begin
 select value::jsonb into strict c from route_proof where label='native_material_commit';select value into strict fp from route_proof where label='package_manifest_fp';
 begin perform public.read_material_package_review_basis_v1((c->>'workId')::uuid,(c->>'revisionId')::uuid);raise exception 'revoked_package_basis_allowed';exception when insufficient_privilege then null;end;
 begin perform public.decide_material_package_v1((c->>'workId')::uuid,(c->>'revisionId')::uuid,fp,'approve',null,false,gen_random_uuid());raise exception 'revoked_package_approval_allowed';exception when insufficient_privilege then null;end;
 raise notice 'PASS material_package_revoked_membership_denies_basis_and_act';
end$$;
reset role;
do $$declare t text;n integer;begin foreach t in array array['material_package_review_projections','material_package_review_intents'] loop
 if not exists(select 1 from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='private' and c.relname=t and c.relrowsecurity and c.relforcerowsecurity) then raise exception 'material_package_rls_missing';end if;
 select count(*) into n from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace s on s.oid=c.relnamespace where s.nspname='private' and c.relname=t and not p.polpermissive and p.polcmd in('r','a','w','d');
 if n<>4 then raise exception 'material_package_four_policies_missing';end if;
 end loop;raise notice 'PASS material_package_catalogue_force_rls_four_policies';end$$;

set local role authenticated;select pg_temp.as_owner();
do $$declare kind text;begin
 foreach kind in array array['production_plan','package_review','release_authorization'] loop
  begin
   perform public.record_deal_state_object('d5200000-0000-4000-8000-000000000001','d5300000-0000-4000-8000-000000000001',kind,'approved',repeat('a',64),'{}','[]');
   raise exception 'experimental_material_approval_remained_open:%',kind;
  exception when insufficient_privilege then null;
  end;
 end loop;
 raise notice 'PASS material_three_experimental_approval_paths_denied';
end$$;
