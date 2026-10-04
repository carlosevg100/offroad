begin;
-- Check the actual installed RPC contracts before building this rollback fixture.
-- A valid PL/pgSQL body alone does not prove that a called overload exists.
do $rpc_contracts$
declare expected record; actual_oid oid; actual_defaults integer;
begin
 for expected in select * from (values
  ('public.review_artifact_revision_v1(uuid,text,text,uuid,text,boolean,uuid,uuid)',1),
  ('public.start_work_v1(uuid,text,text,text,text,text,jsonb,uuid,boolean)',5),
  ('public.read_work_review_dashboard_v1(uuid,uuid,uuid)',2),
  ('public.reaffirm_work_revision_v1(uuid,uuid,text,uuid,text,boolean,uuid)',0),
  ('private.work_review_ancestor_v1(uuid,uuid,uuid,uuid)',0),
  ('public.create_artifact_revision_v1(uuid,text,text,text,jsonb,jsonb,jsonb,text,bigint)',0),
  ('public.record_work_report_v1(uuid,text,jsonb,text,uuid)',0),
  ('public.contest_work_decision_v1(uuid,uuid,text,text,uuid)',0),
  ('public.read_work_decision_v1(uuid)',0),
  ('private.artifact_revision_change_v1(uuid,uuid)',0),
  ('public.read_artifact_revision_v1(uuid)',0),
  ('public.read_artifact_head_v1(uuid,text,text)',0)
 ) as contract(signature,defaults_count) loop
  actual_oid:=to_regprocedure(expected.signature)::oid;
  if actual_oid is null then raise exception 'dashboard_fixture_rpc_missing:%',expected.signature;end if;
  select pronargdefaults into strict actual_defaults from pg_proc where oid=actual_oid;
  if actual_defaults is distinct from expected.defaults_count then raise exception 'dashboard_fixture_rpc_defaults_changed:%',expected.signature;end if;
 end loop;
end $rpc_contracts$;
\ir artifact_revision_setup.sql
-- No private receipt or native producer is forged: this fixture authors ordinary
-- governed answer revisions through the installed human writer.
do $$declare v_b jsonb;v_m jsonb;v_r1 jsonb;v_r2 jsonb;v_a1 jsonb;v_dash jsonb;v_report jsonb;v_contested jsonb;v_work uuid:='a11b0000-0000-4000-9000-000000000002';v_org uuid:='a11b0000-0000-4000-9000-000000000001';v_actor uuid:='a11b0000-0000-4000-8000-000000000001';v_before_jobs bigint;v_after_jobs bigint;v_contest_command uuid:=gen_random_uuid();v_replay jsonb;v_original jsonb;v_precedence jsonb;v_foreign_revision jsonb;v_foreign_report jsonb;v_foreign_start jsonb;v_foreign_work uuid;v_foreign_jobs_before bigint;v_foreign_jobs_after bigint;v_prior_headers text;v_expected jsonb;v_valid_cursor uuid;
begin
 insert into public.organization_review_policies(organization_id,self_approval_allowed,assignment_required,updated_by)values(v_org,true,false,v_actor)on conflict(organization_id)do update set self_approval_allowed=true,assignment_required=false;
 v_b:=jsonb_build_array(pg_temp.block('paragraph','paragraph','{"text":"Synthetic unchanged recommendation"}'));
 v_m:=pg_temp.manifest('answer','internal','[]','[]',null,'json',jsonb_build_object('template',jsonb_build_object('templateVersionId','review-start','fingerprint',repeat('1',64))));
 v_r1:=pg_temp.person_write('answer','dashboard-cosmetic','internal',v_m,v_b);
 set local role authenticated;
 v_a1:=public.review_artifact_revision_v1((v_r1->>'revision_id')::uuid,v_r1->>'manifest_fingerprint','approve',null,null,true,gen_random_uuid());
 reset role;
 v_m:=jsonb_set(v_m,'{template,templateVersionId}','"review-layout-next"');v_r2:=pg_temp.person_write('answer','dashboard-cosmetic','internal',v_m,v_b);
 set local role authenticated;
 v_dash:=public.read_work_review_dashboard_v1(v_work);
 if jsonb_array_length(v_dash->'revisions')<2 then raise exception 'dashboard_nonempty_human_history_required';end if;
 v_valid_cursor:=(v_dash#>>'{revisions,0,revisionId}')::uuid;
 v_replay:=public.read_work_review_dashboard_v1(v_work,v_valid_cursor,null);
 if v_replay->>'workId'<>v_work::text or jsonb_array_length(v_replay->'revisions')<1
 or exists(select 1 from jsonb_array_elements(v_replay->'revisions')item where item->>'revisionId'=v_valid_cursor::text)
 then raise exception 'dashboard_authorized_revision_cursor_invalid';end if;
 if v_dash->>'workId'<>v_work::text or not exists(select 1 from jsonb_array_elements(v_dash->'revisions')r where r->>'revisionId'=v_r2->>'revision_id'and r#>>'{change,outcome}'='cosmetic'and(r->>'canReaffirm')::boolean)then raise exception 'dashboard_cosmetic_missing';end if;
 perform public.reaffirm_work_revision_v1(v_work,(v_r2->>'revision_id')::uuid,v_r2->>'manifest_fingerprint',(v_a1->>'reviewId')::uuid,'Same basis, updated layout',true,gen_random_uuid());
 reset role;
 if not private.work_review_ancestor_v1(v_org,(v_r1->>'artifact_id')::uuid,(v_r1->>'revision_id')::uuid,(v_r2->>'revision_id')::uuid)or private.work_review_ancestor_v1(v_org,(v_r1->>'artifact_id')::uuid,(v_r2->>'revision_id')::uuid,(v_r1->>'revision_id')::uuid)then raise exception 'dashboard_basis_not_actual_ancestor';end if;
 set local role authenticated;
 v_dash:=public.read_work_review_dashboard_v1(v_work);
 if exists(select 1 from jsonb_array_elements(v_dash->'revisions')x where x->>'revisionId'=v_r1->>'revision_id'and x->>'basisReviewId'is not null)then raise exception 'dashboard_historical_uses_future_basis';end if;
 reset role;
 -- The same manifest and bytes replay the exact immutable cosmetic revision.
 v_replay:=pg_temp.person_write('answer','dashboard-cosmetic','internal',v_m,v_b);
 if v_replay->>'revision_id' is distinct from v_r2->>'revision_id' or v_replay->>'replayed' is distinct from 'true'
 then raise exception 'dashboard_identical_revision_replay_invalid';end if;
 v_b:=jsonb_set(v_b,'{0,content,text}','"Synthetic materially changed recommendation"');
 -- A changed body cannot reuse the prior manifest's idempotency key.
 begin
  perform pg_temp.person_write('answer','dashboard-cosmetic','internal',v_m,v_b);
  raise exception 'dashboard_changed_body_same_manifest_accepted';
 exception when unique_violation then
  if sqlerrm is distinct from 'artifact_revision_replay_mismatch' then raise;end if;
 end;
 v_m:=jsonb_set(v_m,'{template,templateVersionId}','"review-material-next"');
 v_r2:=pg_temp.person_write('answer','dashboard-cosmetic','internal',v_m,v_b);
 perform pg_temp.refused(format('select public.reaffirm_work_revision_v1(%L,%L,%L,%L,%L,true,%L)',v_work,v_r2->>'revision_id',v_r2->>'manifest_fingerprint',v_a1->>'reviewId','New substantive recommendation',gen_random_uuid()),'artifact_review_material_change','material cannot reaffirm');
 -- Foreign cursors use a new persistent work created by its signed-in owner.
 -- The legacy setup's raw project + membership confers no artifact write authority.
 v_prior_headers:=current_setting('request.headers',true);
 select count(*)into v_foreign_jobs_before from public.processing_jobs j where j.organization_id='a4192000-0000-4000-9000-000000000001';
 perform pg_temp.act_as('a4192000-0000-4000-8000-000000000001');
 perform set_config('request.headers','{"x-offroad-workspace":"a4192000-0000-4000-9000-000000000001"}',true);
 set local role authenticated;
 v_foreign_start:=public.start_work_v1('a4192000-0000-4000-9000-000000000022','pt-BR','Synthetic foreign dashboard work','Author an internal synthetic report for isolated cursor access evaluation.','company_debt_view','public_information',null::jsonb,null::uuid,false);
 v_foreign_work:=(v_foreign_start->>'workId')::uuid;
 if v_foreign_work is null or v_foreign_work='a4192000-0000-4000-9000-000000000002'::uuid or v_foreign_start->>'replayed' is distinct from 'false'
 then raise exception 'dashboard_foreign_public_work_not_fresh';end if;
 v_foreign_revision:=public.create_artifact_revision_v1(v_foreign_work,'answer','foreign-dashboard','internal',v_m,v_b,'[]'::jsonb,null::text,null::bigint);
 v_foreign_report:=public.record_work_report_v1(v_foreign_work,'Foreign report','{"decidedBy":"Foreign Board","forum":"Foreign meeting","decidedOn":"2026-10-02","evidenceSourceVersionId":null}','Foreign human report',gen_random_uuid());
 reset role;
 select count(*)into v_foreign_jobs_after from public.processing_jobs j where j.organization_id='a4192000-0000-4000-9000-000000000001';
 if v_foreign_jobs_before<>v_foreign_jobs_after or not exists(select 1 from public.work_contexts c where c.organization_id='a4192000-0000-4000-9000-000000000001'and c.work_id=v_foreign_work)
 then raise exception 'dashboard_foreign_work_enqueued_or_context_missing';end if;
 perform set_config('request.headers',coalesce(v_prior_headers,''),true);
 perform pg_temp.act_as(v_actor);
 perform pg_temp.refused(format('select public.read_work_review_dashboard_v1(%L,%L,null)',v_work,v_foreign_revision->>'revision_id'),'review_cursor_access_required','foreign revision cursor denied');
 perform pg_temp.refused(format('select public.read_work_review_dashboard_v1(%L,null,%L)',v_work,v_foreign_report->>'decisionId'),'review_cursor_access_required','foreign decision cursor denied');
 select count(*)into v_before_jobs from public.processing_jobs j where j.organization_id=v_org;
 set local role authenticated;
 v_report:=public.record_work_report_v1(v_work,'Synthetic external report','{"decidedBy":"Synthetic Board","forum":"Synthetic meeting","decidedOn":"2026-10-02","evidenceSourceVersionId":null}','Human report, no operational effects',gen_random_uuid());
 reset role;select to_jsonb(d)into v_original from public.work_decisions d where d.id=(v_report->>'decisionId')::uuid;set local role authenticated;
 v_contested:=public.contest_work_decision_v1(v_work,(v_report->>'decisionId')::uuid,v_report->>'fingerprint','I contest this reported basis',v_contest_command);
 v_replay:=public.contest_work_decision_v1(v_work,(v_report->>'decisionId')::uuid,v_report->>'fingerprint','I contest this reported basis',v_contest_command);
 v_precedence:=public.read_work_decision_v1((v_contested->>'decisionId')::uuid)->'precedence';
 if v_precedence->>'state'<>'contested'or v_precedence->>'currentId'is not null or not(v_precedence->'unresolvedIds' ? (v_report->>'decisionId'))or not(v_precedence->'unresolvedIds' ? (v_contested->>'decisionId'))or v_replay->>'decisionId'<>v_contested->>'decisionId'or v_replay->>'replayed'<>'true'then raise exception 'dashboard_contest_overwrote_precedence';end if;
 if(v_contested->>'contested')::boolean is distinct from true then raise exception 'dashboard_contest_not_contested';end if;
 v_dash:=public.read_work_review_dashboard_v1(v_work);
 reset role;
 select jsonb_agg(r.id::text order by r.created_at desc,r.id desc)into v_expected from public.artifact_revisions r join public.artifacts a on(a.organization_id,a.id)=(r.organization_id,r.artifact_id)where r.organization_id=v_org and a.work_id=v_work;
 if v_expected is distinct from(select jsonb_agg(x->>'revisionId'order by n)from jsonb_array_elements(v_dash->'revisions')with ordinality t(x,n))then raise exception 'dashboard_revision_chronology_invalid';end if;
 select jsonb_agg(d.id::text order by d.created_at desc,d.id desc)into v_expected from public.work_decisions d where d.organization_id=v_org and d.work_id=v_work;
 if v_expected is distinct from(select jsonb_agg(case when x->>'withheld'='true'then x->>'id'else x#>>'{decision,id}'end order by n)from jsonb_array_elements(v_dash->'decisions')with ordinality t(x,n))then raise exception 'dashboard_decision_chronology_invalid';end if;
 if v_original is distinct from(select to_jsonb(d)from public.work_decisions d where d.id=(v_report->>'decisionId')::uuid)or exists(select 1 from public.work_decisions d where d.id=(v_contested->>'decisionId')::uuid and d.supersedes_decision_id is not null)or(select count(*)from public.work_decisions d where d.organization_id=v_org and d.command_id=v_contest_command)<>1 then raise exception 'dashboard_contest_mutated_or_duplicated';end if;
 select count(*)into v_after_jobs from public.processing_jobs j where j.organization_id=v_org;
 if v_before_jobs<>v_after_jobs or exists(select 1 from public.work_decisions d where d.id in((v_report->>'decisionId')::uuid,(v_contested->>'decisionId')::uuid)and d.effects<>array['none']::text[])then raise exception 'dashboard_report_or_contest_has_effect';end if;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');
 perform pg_temp.refused(format('select public.read_work_review_dashboard_v1(%L)',v_work),'review_work_access_required','membership does not enumerate work');
 perform pg_temp.act_as(v_actor);
end$$;
-- API grants are limited to authenticated, including the scoped private invoker
-- entrypoints; internal classification/append helpers remain owner-only.
do $$declare signature text;begin
 foreach signature in array array['public.read_work_review_dashboard_v1(uuid,uuid,uuid)','public.reaffirm_work_revision_v1(uuid,uuid,text,uuid,text,boolean,uuid)','public.record_work_report_v1(uuid,text,jsonb,text,uuid)','public.contest_work_decision_v1(uuid,uuid,text,text,uuid)']loop
 if not has_function_privilege('authenticated',signature,'EXECUTE')or has_function_privilege('anon',signature,'EXECUTE')or has_function_privilege('service_role',signature,'EXECUTE')then raise exception 'dashboard_api_grant_invalid:%',signature;end if;end loop;
 if has_function_privilege('authenticated','private.work_review_ancestor_v1(uuid,uuid,uuid,uuid)','EXECUTE')or has_function_privilege('anon','private.work_review_ancestor_v1(uuid,uuid,uuid,uuid)','EXECUTE')or has_function_privilege('service_role','private.work_review_ancestor_v1(uuid,uuid,uuid,uuid)','EXECUTE')then raise exception 'dashboard_ancestry_core_exposed';end if;
 if has_function_privilege('authenticated','private.artifact_revision_change_v1(uuid,uuid)','EXECUTE')then raise exception 'dashboard_classification_core_exposed';end if;
end$$;
rollback;
