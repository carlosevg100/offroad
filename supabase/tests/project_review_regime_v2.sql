-- Rollback-only contract tests for review regime v2 and guarded v1 setters.
begin;
\ir support/artifact_revision_setup.sql
create function pg_temp.check_v2(ok boolean,name text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL %',name;end if;raise notice 'PASS %',name;end $$;
create function pg_temp.rpc_v2(sql text,actor uuid default 'a11b0000-0000-4000-8000-000000000001') returns jsonb language plpgsql as $$
declare result jsonb;begin
 perform pg_temp.act_as(actor);execute 'set local role authenticated';execute sql into result;execute 'reset role';return result;
 exception when others then execute 'reset role';raise;
end $$;
create function pg_temp.denied_v2(sql text,expected_message text,expected_state text,name text,actor uuid default 'a11b0000-0000-4000-8000-000000000001') returns void language plpgsql as $$
begin
 begin perform pg_temp.rpc_v2(sql,actor);
 exception when others then
  if sqlstate<>expected_state or position(expected_message in sqlerrm)=0 then raise;end if;
  raise notice 'PASS %',name;return;
 end;
 raise exception 'FAIL %: command accepted',name;
end $$;
create function pg_temp.context_v2() returns jsonb language sql as $$
 select pg_temp.rpc_v2($q$select public.read_capital_project_review_context_v2('a11b0000-0000-4000-9000-000000000002')$q$) $$;
create function pg_temp.project_policy_v2(s text,a text,fp text default null) returns jsonb language plpgsql as $$
begin return pg_temp.rpc_v2(format('select public.set_capital_project_review_policy_v2(%L,%L,%L,%L)',
 'a11b0000-0000-4000-9000-000000000002',s,a,coalesce(fp,pg_temp.context_v2()->>'policy_fingerprint')));end $$;
create function pg_temp.org_policy_v2(s boolean,a boolean,fp text default null) returns jsonb language plpgsql as $$
begin return pg_temp.rpc_v2(format('select public.set_organization_review_policy_v2(%L,%L,%L,%L)',
 'a11b0000-0000-4000-9000-000000000001',s,a,coalesce(fp,pg_temp.context_v2()->>'organization_policy_fingerprint')));end $$;

select pg_temp.check_v2(pg_temp.context_v2()->>'regime'='open' and pg_temp.context_v2()#>>'{assignment_required,effective}'='false'
 and pg_temp.context_v2()#>>'{self_approval,effective}'='false','missing_policy_defaults_false');
select pg_temp.org_policy_v2(false,true);
select pg_temp.check_v2(pg_temp.context_v2()#>>'{assignment_required,project}'='inherit' and pg_temp.context_v2()->>'regime'='assigned','inherits_organization_policy');
select pg_temp.project_policy_v2('inherit','not_required');
select pg_temp.check_v2(pg_temp.context_v2()->>'regime'='open','project_override_not_required');
select pg_temp.org_policy_v2(true,false);
select pg_temp.project_policy_v2('inherit','required');
select pg_temp.check_v2(pg_temp.context_v2()->>'regime'='assigned','project_override_required');
do $$declare s boolean;a boolean;j jsonb;begin
 foreach s in array array[false,true] loop foreach a in array array[false,true] loop
 j:=pg_temp.project_policy_v2(case when s then 'allowed' else 'forbidden' end,case when a then 'required' else 'not_required' end);
 perform pg_temp.check_v2((j#>>'{assignment_required,effective}')::boolean=a and (j#>>'{self_approval,effective}')::boolean=s
 and pg_temp.context_v2()->>'regime'=case when a then 'assigned' when s then 'individual' else 'open' end,'four_legal_regime_combinations');
 end loop;end loop;
end $$;
select pg_temp.rpc_v2($q$select public.set_capital_project_review_policy_v1('a11b0000-0000-4000-9000-000000000002','forbidden')$q$);
select pg_temp.rpc_v2($q$select public.set_organization_review_policy_v1('a11b0000-0000-4000-9000-000000000001',false)$q$);
select pg_temp.check_v2((select assignment_required='required' from public.capital_project_review_policies where capital_project_id='a11b0000-0000-4000-9000-000000000002')
 and (select not assignment_required from public.organization_review_policies where organization_id='a11b0000-0000-4000-9000-000000000001'),'v1_preserves_assignment_required');

do $$declare fp text;ofp text;before_count bigint;before_row jsonb;begin
 fp:=pg_temp.context_v2()->>'policy_fingerprint';ofp:=pg_temp.context_v2()->>'organization_policy_fingerprint';
 perform pg_temp.rpc_v2($q$select public.set_capital_project_review_policy_v1('a11b0000-0000-4000-9000-000000000002','allowed')$q$);
 select count(*) into before_count from public.audit_events;
 select to_jsonb(p) into before_row from public.capital_project_review_policies p where capital_project_id='a11b0000-0000-4000-9000-000000000002';
 perform pg_temp.denied_v2(format('select public.set_capital_project_review_policy_v2(%L,%L,%L,%L)','a11b0000-0000-4000-9000-000000000002','forbidden','required',fp),'policy_changed','40001','cas_stale_v1_denied');
 perform pg_temp.check_v2((select count(*)=before_count from public.audit_events) and (select to_jsonb(p)=before_row from public.capital_project_review_policies p where capital_project_id='a11b0000-0000-4000-9000-000000000002'),'cas_denial_has_no_write_or_audit');
 fp:=pg_temp.context_v2()->>'policy_fingerprint';perform pg_temp.project_policy_v2('allowed','not_required');
 perform pg_temp.denied_v2(format('select public.set_capital_project_review_policy_v2(%L,%L,%L,%L)','a11b0000-0000-4000-9000-000000000002','forbidden','required',fp),'policy_changed','40001','cas_stale_other_axis_denied');
 fp:=pg_temp.context_v2()->>'policy_fingerprint';perform pg_temp.org_policy_v2(true,true,ofp);
 perform pg_temp.denied_v2(format('select public.set_capital_project_review_policy_v2(%L,%L,%L,%L)','a11b0000-0000-4000-9000-000000000002','forbidden','required',fp),'policy_changed','40001','cas_organization_change_invalidates_project');
 perform pg_temp.denied_v2(format('select public.set_organization_review_policy_v2(%L,false,false,%L)','a11b0000-0000-4000-9000-000000000001',ofp),'policy_changed','40001','cas_stale_organization_denied');
end $$;

select pg_temp.denied_v2($q$select public.read_capital_project_review_context_v2('a4192000-0000-4000-9000-000000000002')$q$,'review_context_access_denied','42501','cross_tenant_context_denied');
select pg_temp.denied_v2(format('select public.set_capital_project_review_policy_v2(%L,%L,%L,%L)','a4192000-0000-4000-9000-000000000002','inherit','inherit',repeat('a',64)),
 'capital_project_review_management_denied','42501','cross_tenant_setter_denied');
-- Assigning a role/membership alone must not manufacture read access.
select pg_temp.denied_v2($q$select public.read_capital_project_review_context_v2('a11b0000-0000-4000-9000-000000000002')$q$,'review_context_access_denied','42501','membership_without_resource_read_denied','a11b0000-0000-4000-8000-000000000002');
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
select public.grant_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002','read');
select pg_temp.check_v2(not (pg_temp.rpc_v2($q$select public.read_capital_project_review_context_v2('a11b0000-0000-4000-9000-000000000002')$q$,'a11b0000-0000-4000-8000-000000000002')->>'can_manage')::boolean,'read_only_cannot_manage');
select pg_temp.denied_v2(format('select public.set_capital_project_review_policy_v2(%L,%L,%L,%L)','a11b0000-0000-4000-9000-000000000002','inherit','inherit',pg_temp.context_v2()->>'policy_fingerprint'),
 'capital_project_review_management_denied','42501','read_only_setter_denied','a11b0000-0000-4000-8000-000000000002');
update public.organization_memberships set role='admin' where organization_id='a11b0000-0000-4000-9000-000000000001' and user_id='a11b0000-0000-4000-8000-000000000002';
-- Revoke applicable MANAGE grants; preserve explicit READ and active admin membership.
update private.resource_access_grants set revoked_at=now(),revoked_by='a11b0000-0000-4000-8000-000000000001'
 where organization_id='a11b0000-0000-4000-9000-000000000001' and resource_id='a11b0000-0000-4000-9000-000000000002'
 and action='manage' and (subject_user_id='a11b0000-0000-4000-8000-000000000002' or subject_role='admin');
-- B has no access group membership or creator bootstrap in the synthetic fixture.
-- Do NOT use deny MANAGE: that would also deny READ and miss the vulnerable branch.

select pg_temp.check_v2((pg_temp.rpc_v2($q$select public.read_capital_project_review_context_v2('a11b0000-0000-4000-9000-000000000002')$q$,'a11b0000-0000-4000-8000-000000000002')->>'can_manage')::boolean=false,'admin_read_only_fixture_verified');
select pg_temp.denied_v2(format('select public.set_capital_project_review_policy_v2(%L,%L,%L,%L)','a11b0000-0000-4000-9000-000000000002','inherit','inherit',pg_temp.context_v2()->>'policy_fingerprint'),
 'capital_project_review_management_denied','42501','organization_admin_without_project_manage_denied','a11b0000-0000-4000-8000-000000000002');
select pg_temp.denied_v2($q$select public.set_capital_project_review_policy_v1('a11b0000-0000-4000-9000-000000000002','inherit')$q$,
 'capital_project_review_management_denied','42501','v1_policy_admin_without_project_manage_denied','a11b0000-0000-4000-8000-000000000002');
select pg_temp.denied_v2($q$select public.set_capital_project_review_assignment_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002','approver',true)$q$,
 'resource_access_denied','42501','assignment_v1_manage_guard_preserved','a11b0000-0000-4000-8000-000000000002');
update auth.users set banned_until=now()+interval '1 day' where id='a11b0000-0000-4000-8000-000000000001';
select pg_temp.denied_v2($q$select public.read_capital_project_review_context_v2('a11b0000-0000-4000-9000-000000000002')$q$,'review_context_access_denied','42501','suspended_actor_denied');
select pg_temp.denied_v2($q$select public.set_organization_review_policy_v1('a11b0000-0000-4000-9000-000000000001',false)$q$,'capital_project_review_management_denied','42501','v1_organization_banned_actor_denied');
select pg_temp.denied_v2($q$select public.set_capital_project_review_policy_v1('a11b0000-0000-4000-9000-000000000002','inherit')$q$,'capital_project_review_management_denied','42501','v1_project_banned_actor_denied');
update auth.users set banned_until=null,deleted_at=now() where id='a11b0000-0000-4000-8000-000000000001';
select pg_temp.denied_v2($q$select public.set_organization_review_policy_v1('a11b0000-0000-4000-9000-000000000001',false)$q$,'capital_project_review_management_denied','42501','v1_organization_deleted_actor_denied');
select pg_temp.denied_v2($q$select public.set_capital_project_review_policy_v1('a11b0000-0000-4000-9000-000000000002','inherit')$q$,'capital_project_review_management_denied','42501','v1_project_deleted_actor_denied');
update auth.users set banned_until=null,deleted_at=null where id='a11b0000-0000-4000-8000-000000000001';
-- Suspended membership probe uses the read-only colleague to avoid restoring creator access.
update public.organization_memberships set status='suspended' where organization_id='a11b0000-0000-4000-9000-000000000001' and user_id='a11b0000-0000-4000-8000-000000000002';
select pg_temp.denied_v2($q$select public.read_capital_project_review_context_v2('a11b0000-0000-4000-9000-000000000002')$q$,'review_context_access_denied','42501','removed_membership_denied','a11b0000-0000-4000-8000-000000000002');
update public.capital_projects set status='archived',archived_at=now(),archived_by='a11b0000-0000-4000-8000-000000000001' where id='a11b0000-0000-4000-9000-000000000002';
select pg_temp.denied_v2(format('select public.set_capital_project_review_policy_v2(%L,%L,%L,%L)','a11b0000-0000-4000-9000-000000000002','inherit','inherit',repeat('a',64)),
 'capital_project_not_found','P0002','archived_project_write_denied');
update public.capital_projects set status='active',archived_at=null,archived_by=null where id='a11b0000-0000-4000-9000-000000000002';
select pg_temp.denied_v2(format('select public.set_capital_project_review_policy_v2(NULL,%L,%L,%L)','inherit','inherit',repeat('a',64)),'invalid_review_policy','22023','null_project_denied');
select pg_temp.denied_v2(format('select public.set_capital_project_review_policy_v2(%L,%L,%L,%L)','a11b0000-0000-4000-9000-000000000002','unknown','inherit',repeat('a',64)),'invalid_review_policy','22023','unknown_enum_denied');
select pg_temp.denied_v2(format('select public.set_organization_review_policy_v2(%L,NULL,false,%L)','a11b0000-0000-4000-9000-000000000001',repeat('a',64)),'invalid_review_policy','22023','null_boolean_denied');


-- Hash is scoped to this project and includes row existence, not just effective defaults.
do $$declare fp text;new_fp text;begin
 fp:=pg_temp.context_v2()->>'policy_fingerprint';
 insert into public.capital_projects(id,organization_id,project_name,created_by)
 values('a5300000-0000-4000-9000-000000000099','a11b0000-0000-4000-9000-000000000001','Synthetic unrelated regime work','a11b0000-0000-4000-8000-000000000001');
 perform pg_temp.rpc_v2($q$select public.set_capital_project_review_policy_v1('a5300000-0000-4000-9000-000000000099','forbidden')$q$);
 perform pg_temp.check_v2(pg_temp.context_v2()->>'policy_fingerprint'=fp,'unrelated_project_does_not_invalidate_cas');
 select private.review_policy_projection_v2('a11b0000-0000-4000-9000-000000000001','a5300000-0000-4000-9000-000000000100')->>'policy_fingerprint' into fp;
 insert into public.capital_projects(id,organization_id,project_name,created_by)
 values('a5300000-0000-4000-9000-000000000100','a11b0000-0000-4000-9000-000000000001','Synthetic default-row work','a11b0000-0000-4000-8000-000000000001');
 perform pg_temp.rpc_v2($q$select public.set_capital_project_review_policy_v1('a5300000-0000-4000-9000-000000000100','inherit')$q$);
 select private.review_policy_projection_v2('a11b0000-0000-4000-9000-000000000001','a5300000-0000-4000-9000-000000000100')->>'policy_fingerprint' into new_fp;
 perform pg_temp.check_v2(fp<>new_fp,'absent_row_to_default_row_invalidates_cas');
 perform pg_temp.check_v2(not (pg_temp.context_v2()->'caller' ? 'can_approve') and not (pg_temp.context_v2() ? 'mode'),'context_roles_are_not_approval_authority');
end $$;

-- 501 eligible synthetic people plus owner: visible list is capped and explicitly partial.
insert into auth.users(id,email) select ('a5300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'regime-'||n||'@example.invalid' from generate_series(1,501) n;
insert into public.organization_memberships(organization_id,user_id,role,status)
 select 'a11b0000-0000-4000-9000-000000000001',('a5300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'member','active' from generate_series(1,501) n;
select pg_temp.check_v2(jsonb_array_length(pg_temp.context_v2()->'members')=500 and (pg_temp.context_v2()->>'members_truncated')::boolean,'members_truncation_is_explicit');
select pg_temp.check_v2(not exists(select 1 from jsonb_array_elements(pg_temp.context_v2()->'members') x where x->>'user_id' in('a4192000-0000-4000-8000-000000000001','a11b0000-0000-4000-8000-000000000002')),'members_scoped_and_valid');

do $$declare before_effects jsonb;j jsonb;begin
 select jsonb_build_array((select count(*) from public.artifact_reviews),(select count(*) from public.work_decisions),
 (select count(*) from public.processing_jobs),(select count(*) from public.method_releases),(select count(*) from public.vault_publications)) into before_effects;
 j:=pg_temp.project_policy_v2('forbidden','required');
 perform pg_temp.check_v2((select updated_by='a11b0000-0000-4000-8000-000000000001'::uuid from public.capital_project_review_policies where capital_project_id='a11b0000-0000-4000-9000-000000000002')
 and exists(select 1 from public.audit_events where resource_type='capital_project_review_policies' and actor_user_id='a11b0000-0000-4000-8000-000000000001'),'policy_authorship_and_audit');
 perform pg_temp.check_v2(before_effects=jsonb_build_array((select count(*) from public.artifact_reviews),(select count(*) from public.work_decisions),
 (select count(*) from public.processing_jobs),(select count(*) from public.method_releases),(select count(*) from public.vault_publications)),'policy_write_has_no_review_decision_job_or_publication_effect');
 perform pg_temp.check_v2(j->>'policy_fingerprint'=pg_temp.context_v2()->>'policy_fingerprint' and j->>'organization_policy_fingerprint'=pg_temp.context_v2()->>'organization_policy_fingerprint','setter_fingerprints_match_next_read');
end $$;
select pg_temp.denied_v2($q$update public.capital_project_review_policies set self_approval='allowed' where capital_project_id='a11b0000-0000-4000-9000-000000000002' returning to_jsonb(capital_project_review_policies)$q$,
 'permission denied','42501','direct_project_policy_update_denied');
select pg_temp.denied_v2($q$insert into public.organization_review_policies(organization_id,self_approval_allowed) values('a4192000-0000-4000-9000-000000000001',true) returning to_jsonb(organization_review_policies)$q$,
 'permission denied','42501','direct_organization_policy_insert_denied');
select pg_temp.check_v2(has_table_privilege('authenticated','public.capital_project_review_policies','SELECT')
 and not has_table_privilege('authenticated','public.capital_project_review_policies','UPDATE')
 and not has_table_privilege('authenticated','public.organization_review_policies','INSERT'),'existing_select_preserved_direct_dml_denied');
select pg_temp.check_v2(has_function_privilege('authenticated','public.read_capital_project_review_context_v2(uuid)','EXECUTE')
 and not has_function_privilege('anon','public.read_capital_project_review_context_v2(uuid)','EXECUTE')
 and not has_function_privilege('service_role','public.set_organization_review_policy_v2(uuid,boolean,boolean,text)','EXECUTE'),'v2_endpoint_grants_bounded');
rollback;
