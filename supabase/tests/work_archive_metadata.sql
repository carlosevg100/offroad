-- Rollback-only: public pure-work producer, real ACL negative, archive metadata/job closure/history.
-- No intake fixture is created, no provider/model is invoked, no history is deleted.
begin;
select set_config('request.jwt.claims','{}',true);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('a4150000-0000-4000-8000-000000000101','authenticated','authenticated','archive-owner@example.invalid','{}','{}',now(),now(),false,false),
('a4150000-0000-4000-8000-000000000102','authenticated','authenticated','archive-member@example.invalid','{}','{}',now(),now(),false,false);
insert into public.organizations(id,organization_type,name,created_by)
values('a4150000-0000-4000-9000-000000000101','institutional','Synthetic archive without intake','a4150000-0000-4000-8000-000000000101');
insert into public.organization_memberships(organization_id,user_id,role,status)
values('a4150000-0000-4000-9000-000000000101','a4150000-0000-4000-8000-000000000101','owner','active'),
('a4150000-0000-4000-9000-000000000101','a4150000-0000-4000-8000-000000000102','member','active');
select set_config('request.jwt.claim.sub','a4150000-0000-4000-8000-000000000101',true);
select set_config('request.headers','{"x-offroad-workspace":"a4150000-0000-4000-9000-000000000101"}',true);
set local role authenticated;
do $$declare r jsonb;w uuid;begin
 r:=public.start_work_v1('a4150000-0000-4000-8000-000000000001','pt-BR','Synthetic archive without intake','Synthetic private conceptual question; no model will run in rollback test');
 w:=(r->>'workId')::uuid;perform set_config('test.archive_work_id',w::text,true);
 if exists(select 1 from public.document_intake_sessions where capital_project_id=w)then raise exception 'archive_eval_unexpected_intake';end if;
 perform set_config('test.archive_message_count',(select count(*)::text from public.agent_messages where work_id=w),true);
end $$;
reset role;
do $$begin if not exists(select 1 from public.processing_jobs where work_id=current_setting('test.archive_work_id')::uuid and kind='work_conversation' and status='queued')then raise exception 'archive_eval_expected_actual_queued_job';end if;end $$;
set local role authenticated;
-- Mere membership cannot archive somebody else's work.
select set_config('request.jwt.claim.sub','a4150000-0000-4000-8000-000000000102',true);
do $$begin
 begin perform public.manage_work_v1(current_setting('test.archive_work_id')::uuid,'archive',null);raise exception 'archive_eval_membership_bypassed_manage';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','a4150000-0000-4000-8000-000000000101',true);
do $$declare r jsonb;begin
 r:=public.manage_work_v1(current_setting('test.archive_work_id')::uuid,'archive',null);
 if r->>'action'<>'archived' then raise exception 'archive_eval_wrong_receipt';end if;
end $$;
reset role;
do $$declare w uuid:=current_setting('test.archive_work_id')::uuid;p public.capital_projects;begin
 select * into strict p from public.capital_projects where id=w;
 if p.status<>'archived' or p.archived_at is null or p.archived_by is distinct from 'a4150000-0000-4000-8000-000000000101'::uuid then raise exception 'archive_eval_metadata_invariant_failed';end if;
 if exists(select 1 from public.document_intake_sessions where capital_project_id=w)then raise exception 'archive_eval_manufactured_intake';end if;
 if exists(select 1 from public.processing_jobs where work_id=w and kind='work_conversation' and (status in('queued','leased')or capability_sha256 is not null or lease_expires_at is not null or leased_by is not null))then raise exception 'archive_eval_live_job_or_capability';end if;
 if exists(select 1 from public.processing_runs where work_id=w and intake_session_id is null and status in('queued','running'))then raise exception 'archive_eval_live_run';end if;
 if (select count(*) from public.agent_messages where work_id=w)<>current_setting('test.archive_message_count')::bigint or not exists(select 1 from public.agent_messages where work_id=w)then raise exception 'archive_eval_history_deleted';end if;
 if not exists(select 1 from public.work_contexts where work_id=w)then raise exception 'archive_eval_context_deleted';end if;
 if has_function_privilege('anon','public.manage_work_v1(uuid,text,text)','execute')then raise exception 'archive_eval_anon_privilege';end if;
end $$;
select 'work_archive_metadata: PASS authority_negative actual_pure_work metadata job_closure history no_intake ACL' result;
rollback;
