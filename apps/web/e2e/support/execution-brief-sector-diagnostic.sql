-- Read-only authority/DTO diagnostic. Run only against the isolated E2E database.
-- psql -v target_id=<synthetic held job> -v owner_email=<E2E owner> -f this.sql
begin;
select set_config('offroad.diag_target', :'target_id', true);
select set_config('offroad.diag_email', :'owner_email', true);
create temporary table brief_diag(value jsonb) on commit drop;
grant select,insert on brief_diag to authenticated;
do $$
declare j public.processing_jobs;b public.capital_project_execution_briefs;n private.execution_brief_native_bindings;c private.execution_brief_input_captures;actor uuid;components jsonb;
begin
 select * into strict j from public.processing_jobs where id=current_setting('offroad.diag_target')::uuid;
 select u.id into strict actor from auth.users u where u.email=current_setting('offroad.diag_email') and u.email like 'e2e-%@example.com';
 if not exists(select 1 from public.document_intake_sessions s where (s.organization_id,s.id,s.started_by)=(j.organization_id,j.intake_session_id,actor)) then raise exception 'diagnostic_exact_synthetic_owner_required';end if;
 select x.* into strict b from public.capital_project_execution_brief_dispatches d join public.capital_project_execution_briefs x on(x.organization_id,x.id)=(d.organization_id,d.execution_brief_id) where (d.organization_id,d.processing_job_id)=(j.organization_id,j.id);
 select * into n from private.execution_brief_native_bindings where(organization_id,execution_brief_id)=(j.organization_id,b.id);
 select * into c from private.execution_brief_input_captures where(organization_id,id)=(j.organization_id,n.capture_id);
 components:=jsonb_build_object('bindingExists',n.id is not null,'captureExists',c.id is not null,
 'viewerSubjectAllowed',private.capital_body_subject_allowed_v1(j.organization_id,b.capital_project_id,actor),
 'humanSubjectAllowed',private.capital_body_subject_allowed_v1(j.organization_id,b.capital_project_id,c.human_subject_id),
 'viewerSourceClosure',private.execution_brief_capture_sources_current_v1(j.organization_id,c.id,actor),
 'humanSourceClosure',private.execution_brief_capture_sources_current_v1(j.organization_id,c.id,c.human_subject_id),
 'sourcePackCurrent',c.source_pack_id is not distinct from(select z.source_pack_id from private.gold_case_bindings z where(z.organization_id,z.capital_project_id)=(j.organization_id,c.work_id)),
 'inputFingerprintCurrent',n.post_write_input_fingerprint=private.execution_approval_input_fingerprint(j.organization_id,c.session_id),
 'contextFingerprintCurrent',n.post_write_context_fingerprint=private.execution_brief_post_write_context_fingerprint_v1(j.organization_id,c.session_id,n.work_id,n.plan_id),
 'productAndPlanCurrent',exists(select 1 from public.capital_project_execution_briefs x join public.capital_project_plans p on(p.organization_id,p.id)=(x.organization_id,x.plan_id) where x.organization_id=j.organization_id and x.id=b.id and x.capital_project_id=n.work_id and x.brief_fingerprint=n.brief_fingerprint and x.storage_fingerprint=n.storage_fingerprint and p.id=n.plan_id and p.plan_fingerprint=n.plan_fingerprint and p.status='active'),
 'basisCurrent',private.execution_brief_native_basis_current_v1(j.organization_id,b.id,actor),
 'preparedBy',private.execution_brief_preparer_v1(b.id),'capturedHumanSubject',c.human_subject_id);
 insert into brief_diag values(jsonb_build_object('components',components,'workId',b.capital_project_id,'briefId',b.id,'briefFingerprint',b.brief_fingerprint));
 perform set_config('request.jwt.claims','{}',true);
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.headers',jsonb_build_object('x-offroad-workspace',j.organization_id)::text,true);
end$$;
set local role authenticated;
do $$declare v jsonb;data jsonb;code text;message text;begin
 select value into strict v from brief_diag;
 begin
  data:=public.read_execution_brief_review_basis_v2((v->>'workId')::uuid,(v->>'briefId')::uuid);
  insert into brief_diag values(jsonb_build_object('rpcData',data));
 exception when others then
  get stacked diagnostics code=returned_sqlstate,message=message_text;
  insert into brief_diag values(jsonb_build_object('rpcError',jsonb_build_object('code',code,'message',message)));
 end;
end$$;
select jsonb_agg(value) from brief_diag;
rollback;
