-- Disposable synthetic proof: producer grants and capability releases move only through identity-bound, ledgered commands.
begin;
\ir support/execution_commands_fixture.sql
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('a11b0000-0000-4000-8000-000000000003','authenticated','authenticated','a11b-c@example.invalid','{}','{}',now(),now(),false,false);
insert into private.platform_principals(user_id,role,label) values
 ('a11b0000-0000-4000-8000-000000000001','founder','Synthetic founder'),
 ('a11b0000-0000-4000-8000-000000000003','operator','Synthetic operator two');
create function pg_temp.expect_producer_error(command text,expected text,test_name text) returns void language plpgsql as $$
begin
 begin execute command;exception when others then
  if sqlerrm=expected then raise notice 'PASS: %',test_name;return;end if;raise;
 end;raise exception 'Missing expected rejection: %',test_name;
end $$;
-- 1. Producer grants: identity-bound command, replay, ledger, no deletion.
do $$begin if private.execution_producer_enabled_v1('a11b0000-0000-4000-9000-000000000001') then raise exception 'producer enabled before any grant';end if;end $$;
select pg_temp.expect_producer_error($q$select private.grant_execution_producer_v1('c4172000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000001',true,null,'a11b0000-0000-4000-8000-000000000099')$q$,'platform_principal_required','unknown identity cannot grant a producer');
select pg_temp.expect_producer_error($q$select private.grant_execution_producer_v1('c4172000-0000-4000-9000-000000000001',gen_random_uuid(),true,null,'a11b0000-0000-4000-8000-000000000003')$q$,'execution_producer_grant_invalid','unknown organization cannot be granted');
select private.grant_execution_producer_v1('c4172000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000001',true,'Synthetic producer grant','a11b0000-0000-4000-8000-000000000003');
select private.grant_execution_producer_v1('c4172000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000001',true,'Synthetic producer grant','a11b0000-0000-4000-8000-000000000003');
do $$begin
 if not private.execution_producer_enabled_v1('a11b0000-0000-4000-9000-000000000001') then raise exception 'grant ineffective';end if;
 if not exists(select 1 from private.execution_producer_grants where organization_id='a11b0000-0000-4000-9000-000000000001' and enabled and granted_by='Synthetic operator two' and granted_by_user_id='a11b0000-0000-4000-8000-000000000003') then raise exception 'grant not bound to the acting principal';end if;
 if (select count(*) from private.execution_producer_grant_events where command_id='c4172000-0000-4000-9000-000000000001')<>1 then raise exception 'grant replay duplicated the ledger';end if;
 if not exists(select 1 from private.execution_producer_grant_events where command_id='c4172000-0000-4000-9000-000000000001' and granted_by_user_id='a11b0000-0000-4000-8000-000000000003' and operation='INSERT') then raise exception 'grant ledger missing the acting principal';end if;
 if (select current_setting('offroad.actor_user_id',true))<>'' then raise exception 'actor setting leaked past the command';end if;
end $$;
select pg_temp.expect_producer_error($q$select private.grant_execution_producer_v1('c4172000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000001',false,'Synthetic producer grant','a11b0000-0000-4000-8000-000000000003')$q$,'platform_method_request_reused','grant command id cannot change its effect');
update private.execution_producer_grants set note='Direct operator edit' where organization_id='a11b0000-0000-4000-9000-000000000001';
do $$begin
 if not exists(select 1 from private.execution_producer_grant_events where organization_id='a11b0000-0000-4000-9000-000000000001' and operation='UPDATE' and note='Direct operator edit' and command_id is null and granted_by_user_id is null) then raise exception 'direct grant edit ledgered with a borrowed identity';end if;
end $$;
select private.grant_execution_producer_v1('c4172000-0000-4000-9000-000000000002','a11b0000-0000-4000-9000-000000000001',false,'Synthetic producer pause','a11b0000-0000-4000-8000-000000000001');
do $$begin if private.execution_producer_enabled_v1('a11b0000-0000-4000-9000-000000000001') then raise exception 'producer still enabled after pause';end if;end $$;
select pg_temp.expect_producer_error($q$delete from private.execution_producer_grants where organization_id='a11b0000-0000-4000-9000-000000000001'$q$,'platform_ledger_immutable','producer grant is never deleted');
select pg_temp.expect_producer_error($q$truncate private.execution_producer_grants$q$,'platform_ledger_immutable','producer grants cannot be truncated');
select pg_temp.expect_producer_error($q$truncate private.execution_producer_grant_events$q$,'platform_ledger_immutable','producer ledger cannot be truncated');
select pg_temp.expect_producer_error($q$delete from private.execution_producer_grant_events where organization_id='a11b0000-0000-4000-9000-000000000001'$q$,'contribution_revision_immutable','producer ledger is immutable');
-- A real client, an organization the founder does not belong to, is granted only by the founder.
insert into public.organizations(id,organization_type,name,created_by) values('a11b0000-0000-4000-9000-000000000011','company','Synthetic client organization','a11b0000-0000-4000-8000-000000000003');
select pg_temp.expect_producer_error($q$select private.grant_execution_producer_v1('c4172000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000011',true,'Synthetic client grant by an operator','a11b0000-0000-4000-8000-000000000003')$q$,'platform_principal_required','operator cannot enable a real client');
select private.grant_execution_producer_v1('c4172000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000011',true,'Synthetic client grant by the founder','a11b0000-0000-4000-8000-000000000001');
select private.grant_execution_producer_v1('c4172000-0000-4000-9000-000000000004','a11b0000-0000-4000-9000-000000000011',false,'Synthetic client pause by an operator','a11b0000-0000-4000-8000-000000000003');
do $$begin
 if private.execution_producer_enabled_v1('a11b0000-0000-4000-9000-000000000011') then raise exception 'client pause ineffective';end if;
 if not exists(select 1 from private.execution_producer_grant_events where command_id='c4172000-0000-4000-9000-000000000003' and granted_by_user_id='a11b0000-0000-4000-8000-000000000001' and enabled) then raise exception 'founder client grant not ledgered';end if;
end $$;
-- 2. Capability releases: ledgered on every write; releasing is an operator act contained by producer grants.
do $$begin
 if not exists(select 1 from private.platform_capability_release_events where capability_key='synthetic-execution' and operation='INSERT' and actor_user_id is null and command_id is null) then raise exception 'fixture release insert not ledgered';end if;
end $$;
select private.release_platform_capability_v1('c4172000-0000-4000-9000-000000000011','synthetic-execution',false,'internal','a11b0000-0000-4000-8000-000000000003','Synthetic pause of the release by an operator');
select private.release_platform_capability_v1('c4172000-0000-4000-9000-000000000011','synthetic-execution',false,'internal','a11b0000-0000-4000-8000-000000000003','Synthetic pause of the release by an operator');
do $$begin
 if not exists(select 1 from private.platform_capability_releases where capability_key='synthetic-execution' and not released and exposure='internal') then raise exception 'operator pause ineffective';end if;
 if (select count(*) from private.platform_capability_release_events where command_id='c4172000-0000-4000-9000-000000000011')<>1 then raise exception 'release replay duplicated the ledger';end if;
 if not exists(select 1 from private.platform_capability_release_events where command_id='c4172000-0000-4000-9000-000000000011' and actor_user_id='a11b0000-0000-4000-8000-000000000003' and reason='Synthetic pause of the release by an operator' and operation='UPDATE') then raise exception 'release ledger missing the acting principal';end if;
end $$;
select pg_temp.expect_producer_error($q$select private.release_platform_capability_v1('c4172000-0000-4000-9000-000000000011','synthetic-execution',false,'none','a11b0000-0000-4000-8000-000000000003','Synthetic pause of the release by an operator')$q$,'platform_method_request_reused','release command id cannot change its effect');
select pg_temp.expect_producer_error($q$select private.release_platform_capability_v1('c4172000-0000-4000-9000-000000000012','synthetic-execution',true,'universal','a11b0000-0000-4000-8000-000000000099','Synthetic universal release by an unknown identity')$q$,'platform_principal_required','unknown identity cannot release');
select pg_temp.expect_producer_error($q$select private.release_platform_capability_v1('c4172000-0000-4000-9000-000000000012','finance.receivables-released-analysis',false,'internal','a11b0000-0000-4000-8000-000000000001','Synthetic attempt on the R01 key')$q$,'platform_capability_release_invalid','R01 key keeps its own command');
select pg_temp.expect_producer_error($q$select private.release_platform_capability_v1('c4172000-0000-4000-9000-000000000012','synthetic-execution',true,'everyone','a11b0000-0000-4000-8000-000000000001','Synthetic bad exposure')$q$,'platform_capability_release_invalid','exposure must be a known value');
select pg_temp.expect_producer_error($q$select private.release_platform_capability_v1('c4172000-0000-4000-9000-000000000012','synthetic-missing',true,'universal','a11b0000-0000-4000-8000-000000000001','Synthetic unknown capability')$q$,'platform_capability_release_invalid','unknown capability cannot be released');
select private.release_platform_capability_v1('c4172000-0000-4000-9000-000000000012','synthetic-execution',true,'universal','a11b0000-0000-4000-8000-000000000003','Synthetic universal release by an operator');
do $$begin
 if not exists(select 1 from private.platform_capability_releases where capability_key='synthetic-execution' and released and exposure='universal') then raise exception 'operator release ineffective';end if;
 if not exists(select 1 from private.platform_capability_release_events where command_id='c4172000-0000-4000-9000-000000000012' and actor_user_id='a11b0000-0000-4000-8000-000000000003' and released and exposure='universal') then raise exception 'operator release not ledgered with identity';end if;
 if (select current_setting('offroad.command_reason',true))<>'' then raise exception 'reason setting leaked past the command';end if;
end $$;
-- A release row whose corpus never reached publication cannot be released.
insert into private.platform_capability_releases(capability_key,released,exposure,method_id,method_version,method_maturity,approved_by,approved_at,approval_source)
values('synthetic-orphan',false,'internal','synthetic-orphan','test-v1','tested','Synthetic approver',current_date,'Synthetic rollback-only fixture');
select pg_temp.expect_producer_error($q$select private.release_platform_capability_v1('c4172000-0000-4000-9000-000000000013','synthetic-orphan',true,'universal','a11b0000-0000-4000-8000-000000000001','Synthetic release without a published corpus')$q$,'platform_method_reviews_required','a capability without a published release cannot be released');
update private.platform_capability_releases set released=false where capability_key='synthetic-execution';
do $$begin
 if not exists(select 1 from private.platform_capability_release_events where capability_key='synthetic-execution' and operation='UPDATE' and not released and actor_user_id is null and command_id is null) then raise exception 'direct release edit not ledgered without identity';end if;
end $$;
select pg_temp.expect_producer_error($q$truncate private.platform_capability_releases cascade$q$,'platform_ledger_immutable','capability releases cannot be truncated');
select pg_temp.expect_producer_error($q$truncate private.platform_capability_release_events$q$,'platform_ledger_immutable','release ledger cannot be truncated');
select pg_temp.expect_producer_error($q$update private.platform_capability_release_events set released=true where command_id='c4172000-0000-4000-9000-000000000011'$q$,'contribution_revision_immutable','release ledger is immutable');
-- 3. Nothing here is reachable through the API roles.
set local role authenticated;
do $$begin
 begin perform private.grant_execution_producer_v1(gen_random_uuid(),'a11b0000-0000-4000-9000-000000000001',true,null,'a11b0000-0000-4000-8000-000000000001');raise exception 'tenant granted a producer';exception when insufficient_privilege then null;end;
 begin perform private.release_platform_capability_v1(gen_random_uuid(),'synthetic-execution',true,'universal','a11b0000-0000-4000-8000-000000000001','Tenant release attempt');raise exception 'tenant released a capability';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$declare role_name text;sig text;t text;begin
 foreach role_name in array array['anon','authenticated','service_role'] loop
  foreach sig in array array['private.grant_execution_producer_v1(uuid,uuid,boolean,text,uuid)','private.release_platform_capability_v1(uuid,text,boolean,text,uuid,text)','private.execution_producer_enabled_v1(uuid)','private.ledger_execution_producer_grant_v1()','private.ledger_platform_capability_release_v1()','private.guard_execution_producer_grant_v1()'] loop
   if has_function_privilege(role_name,sig,'EXECUTE') then raise exception 'command exposed to %: %',role_name,sig;end if;
  end loop;
  foreach t in array array['execution_producer_grants','execution_producer_grant_events','platform_capability_release_events'] loop
   if has_table_privilege(role_name,'private.'||t,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'storage exposed to %: %',role_name,t;end if;
   if not exists(select 1 from pg_class where oid=('private.'||t)::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'RLS missing: %',t;end if;
  end loop;
 end loop;
end $$;
select 'execution_producer_authority: PASS' result;
rollback;
