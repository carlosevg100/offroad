begin;
\ir artifact_revision_setup.sql
-- No private receipt or native producer is forged: this fixture authors ordinary
-- governed answer revisions through the installed human writer.
do $$declare b jsonb;m jsonb;r1 jsonb;r2 jsonb;a1 jsonb;dash jsonb;report jsonb;contested jsonb;work uuid:='a11b0000-0000-4000-9000-000000000002';org uuid:='a11b0000-0000-4000-9000-000000000001';actor uuid:='a11b0000-0000-4000-8000-000000000001';before_jobs bigint;after_jobs bigint;contest_command uuid:=gen_random_uuid();replay jsonb;original jsonb;precedence jsonb;foreign_revision jsonb;foreign_report jsonb;expected jsonb;
begin
 insert into public.organization_review_policies(organization_id,self_approval_allowed,assignment_required,updated_by)values(org,true,false,actor)on conflict(organization_id)do update set self_approval_allowed=true,assignment_required=false;
 b:=jsonb_build_array(pg_temp.block('paragraph','paragraph','{"text":"Synthetic unchanged recommendation"}'));
 m:=pg_temp.manifest('answer','internal','[]','[]',null,'json',jsonb_build_object('template',jsonb_build_object('templateVersionId','review-start','fingerprint',repeat('1',64))));
 r1:=pg_temp.person_write('answer','dashboard-cosmetic','internal',m,b);
 set local role authenticated;
 a1:=public.review_artifact_revision_v1((r1->>'revision_id')::uuid,r1->>'manifest_fingerprint','approve',null,null,true,gen_random_uuid());
 reset role;
 m:=jsonb_set(m,'{template,templateVersionId}','"review-layout-next"');r2:=pg_temp.person_write('answer','dashboard-cosmetic','internal',m,b);
 set local role authenticated;
 dash:=public.read_work_review_dashboard_v1(work);
 if dash->>'workId'<>work::text or not exists(select 1 from jsonb_array_elements(dash->'revisions')r where r->>'revisionId'=r2->>'revision_id'and r#>>'{change,outcome}'='cosmetic'and(r->>'canReaffirm')::boolean)then raise exception 'dashboard_cosmetic_missing';end if;
 perform public.reaffirm_work_revision_v1(work,(r2->>'revision_id')::uuid,r2->>'manifest_fingerprint',(a1->>'reviewId')::uuid,'Same basis, updated layout',true,gen_random_uuid());
 reset role;
 if not private.work_review_ancestor_v1(org,(r1->>'artifact_id')::uuid,(r1->>'revision_id')::uuid,(r2->>'revision_id')::uuid)or private.work_review_ancestor_v1(org,(r1->>'artifact_id')::uuid,(r2->>'revision_id')::uuid,(r1->>'revision_id')::uuid)then raise exception 'dashboard_basis_not_actual_ancestor';end if;
 set local role authenticated;
 dash:=public.read_work_review_dashboard_v1(work);
 if exists(select 1 from jsonb_array_elements(dash->'revisions')x where x->>'revisionId'=r1->>'revision_id'and x->>'basisReviewId'is not null)then raise exception 'dashboard_historical_uses_future_basis';end if;
 reset role;
 b:=jsonb_set(b,'{0,content,text}','"Synthetic materially changed recommendation"');r2:=pg_temp.person_write('answer','dashboard-cosmetic','internal',m,b);
 perform pg_temp.refused(format('select public.reaffirm_work_revision_v1(%L,%L,%L,%L,%L,true,%L)',work,r2->>'revision_id',r2->>'manifest_fingerprint',a1->>'reviewId','New substantive recommendation',gen_random_uuid()),'artifact_review_material_change','material cannot reaffirm');
 -- Foreign cursors are real human-authored records, never an arbitrary UUID.
 perform pg_temp.act_as('a4192000-0000-4000-8000-000000000001');set local role authenticated;
 foreign_revision:=public.create_artifact_revision_v1('a4192000-0000-4000-9000-000000000002','answer','foreign-dashboard','internal',m,b);
 foreign_report:=public.record_work_report_v1('a4192000-0000-4000-9000-000000000002','Foreign report','{"decidedBy":"Foreign Board","forum":"Foreign meeting","decidedOn":"2026-10-02","evidenceSourceVersionId":null}','Foreign human report',gen_random_uuid());
 reset role;perform pg_temp.act_as(actor);
 perform pg_temp.refused(format('select public.read_work_review_dashboard_v1(%L,%L,null)',work,foreign_revision->>'revision_id'),'review_cursor_access_required','foreign revision cursor denied');
 perform pg_temp.refused(format('select public.read_work_review_dashboard_v1(%L,null,%L)',work,foreign_report->>'decisionId'),'review_cursor_access_required','foreign decision cursor denied');
 select count(*)into before_jobs from public.processing_jobs where organization_id=org;
 set local role authenticated;
 report:=public.record_work_report_v1(work,'Synthetic external report','{"decidedBy":"Synthetic Board","forum":"Synthetic meeting","decidedOn":"2026-10-02","evidenceSourceVersionId":null}','Human report, no operational effects',gen_random_uuid());
 reset role;select to_jsonb(d)into original from public.work_decisions d where id=(report->>'decisionId')::uuid;set local role authenticated;
 contested:=public.contest_work_decision_v1(work,(report->>'decisionId')::uuid,report->>'fingerprint','I contest this reported basis',contest_command);
 replay:=public.contest_work_decision_v1(work,(report->>'decisionId')::uuid,report->>'fingerprint','I contest this reported basis',contest_command);
 precedence:=public.read_work_decision_v1((contested->>'decisionId')::uuid)->'precedence';
 if precedence->>'state'<>'contested'or precedence->>'currentId'is not null or not(precedence->'unresolvedIds' ? (report->>'decisionId'))or not(precedence->'unresolvedIds' ? (contested->>'decisionId'))or replay->>'decisionId'<>contested->>'decisionId'or replay->>'replayed'<>'true'then raise exception 'dashboard_contest_overwrote_precedence';end if;
 if(contested->>'contested')::boolean is distinct from true then raise exception 'dashboard_contest_not_contested';end if;
 dash:=public.read_work_review_dashboard_v1(work);
 reset role;
 select jsonb_agg(r.id::text order by r.created_at desc,r.id desc)into expected from public.artifact_revisions r join public.artifacts a on(a.organization_id,a.id)=(r.organization_id,r.artifact_id)where r.organization_id=org and a.work_id=work;
 if expected is distinct from(select jsonb_agg(x->>'revisionId'order by n)from jsonb_array_elements(dash->'revisions')with ordinality t(x,n))then raise exception 'dashboard_revision_chronology_invalid';end if;
 select jsonb_agg(d.id::text order by d.created_at desc,d.id desc)into expected from public.work_decisions d where organization_id=org and work_id=work;
 if expected is distinct from(select jsonb_agg(case when x->>'withheld'='true'then x->>'id'else x#>>'{decision,id}'end order by n)from jsonb_array_elements(dash->'decisions')with ordinality t(x,n))then raise exception 'dashboard_decision_chronology_invalid';end if;
 if original is distinct from(select to_jsonb(d)from public.work_decisions d where id=(report->>'decisionId')::uuid)or exists(select 1 from public.work_decisions where id=(contested->>'decisionId')::uuid and supersedes_decision_id is not null)or(select count(*)from public.work_decisions where organization_id=org and command_id=contest_command)<>1 then raise exception 'dashboard_contest_mutated_or_duplicated';end if;
 select count(*)into after_jobs from public.processing_jobs where organization_id=org;
 if before_jobs<>after_jobs or exists(select 1 from public.work_decisions where id in((report->>'decisionId')::uuid,(contested->>'decisionId')::uuid)and effects<>array['none']::text[])then raise exception 'dashboard_report_or_contest_has_effect';end if;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');
 perform pg_temp.refused(format('select public.read_work_review_dashboard_v1(%L)',work),'review_work_access_required','membership does not enumerate work');
 perform pg_temp.act_as(actor);
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
